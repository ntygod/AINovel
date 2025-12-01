/**
 * 逻辑预检服务 (Logic Pre-flight Check)
 * 
 * 在生成正文之前，检查细纲是否与已有设定冲突
 * 防止"吃书"和逻辑崩坏
 */

import { Chapter, Character, PlotLoop, PlotLoopStatus, WikiEntry, AppSettings, WorldStructure } from '../types';
import { resolveSceneConfig } from './geminiService';

/**
 * 冲突警告类型
 */
export interface ConflictWarning {
  id: string;
  type: 'character' | 'wiki' | 'plotloop' | 'timeline' | 'logic';
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  source: string;  // 冲突来源（角色名/Wiki条目名/伏笔标题）
  suggestion?: string;  // 修正建议
}

/**
 * 预检上下文
 */
export interface PreflightContext {
  beats: string[];
  chapterSummary: string;
  globalMemory?: string;
  activePlotLoops: PlotLoop[];
  recentChapters: Chapter[];
  characters: Character[];
  wikiEntries: WikiEntry[];
}

/**
 * 预检结果
 */
export interface PreflightResult {
  passed: boolean;
  warnings: ConflictWarning[];
  checkedAt: number;
}

/**
 * 本地规则检查 - 不需要 AI，快速检测明显冲突
 */
export function localPreflightCheck(context: PreflightContext): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const beatsText = context.beats.join('\n').toLowerCase();
  const summaryText = context.chapterSummary.toLowerCase();
  const combinedText = `${beatsText} ${summaryText}`;

  // 1. 检查已死亡角色是否出现在细纲中
  context.characters.forEach(char => {
    const status = char.status?.toLowerCase() || '';
    const isDead = status.includes('死') || status.includes('亡') || 
                   status.includes('dead') || status.includes('deceased');
    
    if (isDead && combinedText.includes(char.name.toLowerCase())) {
      // 检查是否是回忆/闪回场景
      const isFlashback = combinedText.includes('回忆') || 
                          combinedText.includes('flashback') ||
                          combinedText.includes('过去') ||
                          combinedText.includes('当年');
      
      if (!isFlashback) {
        warnings.push({
          id: `char-dead-${char.id}`,
          type: 'character',
          severity: 'error',
          title: `角色状态冲突：${char.name}`,
          description: `角色"${char.name}"当前状态为"${char.status}"，但细纲中提到了该角色`,
          source: char.name,
          suggestion: `如果是回忆场景，请在细纲中明确标注；否则请移除该角色或更新其状态`
        });
      }
    }
  });

  // 2. 检查未回收的紧急伏笔
  const urgentLoops = context.activePlotLoops.filter(
    loop => loop.status === PlotLoopStatus.URGENT
  );
  
  urgentLoops.forEach(loop => {
    const loopMentioned = combinedText.includes(loop.title.toLowerCase());
    if (!loopMentioned) {
      warnings.push({
        id: `plotloop-urgent-${loop.id}`,
        type: 'plotloop',
        severity: 'warning',
        title: `紧急伏笔未处理：${loop.title}`,
        description: `伏笔"${loop.title}"已标记为紧急待回收，但当前细纲未涉及`,
        source: loop.title,
        suggestion: `考虑在本章或近期章节中回收此伏笔`
      });
    }
  });

  // 3. 检查 Wiki 设定冲突（简单关键词匹配）
  context.wikiEntries.forEach(entry => {
    const entryName = entry.name.toLowerCase();
    if (combinedText.includes(entryName)) {
      // 检查描述中的关键状态词
      const desc = entry.description?.toLowerCase() || '';
      
      // 检查"已毁/已断/已失"等状态
      const destroyedKeywords = ['已毁', '已断', '已失', '已亡', '不存在', 'destroyed', 'broken', 'lost'];
      const isDestroyed = destroyedKeywords.some(kw => desc.includes(kw));
      
      if (isDestroyed) {
        // 检查细纲是否在使用这个已毁坏的物品
        const useKeywords = ['使用', '拿起', '挥动', '施展', '发动', 'use', 'wield'];
        const isBeingUsed = useKeywords.some(kw => combinedText.includes(kw) && combinedText.includes(entryName));
        
        if (isBeingUsed) {
          warnings.push({
            id: `wiki-destroyed-${entry.id}`,
            type: 'wiki',
            severity: 'error',
            title: `设定冲突：${entry.name}`,
            description: `"${entry.name}"在设定中已标记为损毁/丢失状态，但细纲中似乎在使用它`,
            source: entry.name,
            suggestion: `请检查设定是否需要更新，或修改细纲内容`
          });
        }
      }
    }
  });

  // 4. 检查时间线一致性（简单检查）
  if (context.recentChapters.length > 0) {
    const lastChapter = context.recentChapters[context.recentChapters.length - 1];
    // 检查是否有明显的时间跳跃但没有说明
    const timeJumpKeywords = ['三年后', '十年后', '多年后', 'years later', '数月后'];
    const hasTimeJump = timeJumpKeywords.some(kw => combinedText.includes(kw));
    
    if (hasTimeJump && !combinedText.includes('时间跳跃') && !combinedText.includes('时光流逝')) {
      warnings.push({
        id: 'timeline-jump',
        type: 'timeline',
        severity: 'info',
        title: '检测到时间跳跃',
        description: `细纲中包含时间跳跃描述，请确保与前文衔接自然`,
        source: '时间线',
        suggestion: `考虑添加过渡描写或在章节开头说明时间变化`
      });
    }
  }

  return warnings;
}


/**
 * AI 增强预检 - 使用推理模型深度分析逻辑冲突
 */
export async function aiPreflightCheck(
  context: PreflightContext,
  settings: AppSettings
): Promise<ConflictWarning[]> {
  const warnings: ConflictWarning[] = [];
  
  if (!settings.apiKey) {
    return warnings;
  }

  try {
    // 构建检查 Prompt
    const prompt = buildPreflightPrompt(context);
    
    // 使用 analysis 场景的模型配置
    const config = resolveSceneConfig(settings, 'analysis');
    
    // 调用 AI 进行分析
    const response = await callPreflightAI(prompt, config);
    
    // 解析 AI 响应
    const aiWarnings = parsePreflightResponse(response);
    warnings.push(...aiWarnings);
    
  } catch (error) {
    console.warn('AI preflight check failed:', error);
    // AI 检查失败不阻塞流程，只记录警告
  }

  return warnings;
}

/**
 * 构建预检 Prompt
 */
function buildPreflightPrompt(context: PreflightContext): string {
  const sections: string[] = [];

  // 1. 任务说明
  sections.push(`你是一个小说逻辑一致性检查助手。请分析以下细纲是否与已有设定存在冲突。

## 检查要点
1. 角色状态：已死亡/离开/失踪的角色不应出现（除非是回忆）
2. 物品状态：已损毁/丢失的物品不应被使用
3. 伏笔一致：检查是否与未回收的伏笔矛盾
4. 时间线：检查事件顺序是否合理
5. 逻辑漏洞：检查是否有明显的逻辑问题`);

  // 2. 当前细纲
  sections.push(`## 待检查的细纲
章节摘要：${context.chapterSummary}

剧情节点：
${context.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}`);

  // 3. 全局备忘录
  if (context.globalMemory) {
    sections.push(`## 全局备忘录（必须遵守的设定）
${context.globalMemory}`);
  }

  // 4. 活跃伏笔
  if (context.activePlotLoops.length > 0) {
    const loopsList = context.activePlotLoops.map(loop => 
      `- ${loop.title}（${loop.status === PlotLoopStatus.URGENT ? '紧急' : '待回收'}）: ${loop.description}`
    ).join('\n');
    sections.push(`## 活跃伏笔
${loopsList}`);
  }

  // 5. 关键角色状态
  const importantChars = context.characters.filter(c => 
    c.status && (c.status.includes('死') || c.status.includes('伤') || c.status.includes('失'))
  );
  if (importantChars.length > 0) {
    const charsList = importantChars.map(c => 
      `- ${c.name}: ${c.status}`
    ).join('\n');
    sections.push(`## 需要注意的角色状态
${charsList}`);
  }

  // 6. 关键设定
  const importantWiki = context.wikiEntries.filter(e => 
    e.description && (
      e.description.includes('已') || 
      e.description.includes('曾') ||
      e.description.includes('不能')
    )
  ).slice(0, 10);
  if (importantWiki.length > 0) {
    const wikiList = importantWiki.map(e => 
      `- ${e.name}（${e.category}）: ${e.description?.slice(0, 100)}`
    ).join('\n');
    sections.push(`## 关键设定
${wikiList}`);
  }

  // 7. 输出格式
  sections.push(`## 输出格式
请以 JSON 数组格式输出发现的问题，每个问题包含：
- type: "character" | "wiki" | "plotloop" | "timeline" | "logic"
- severity: "error" | "warning" | "info"
- title: 问题标题
- description: 问题描述
- source: 冲突来源
- suggestion: 修正建议

如果没有发现问题，返回空数组 []

只输出 JSON，不要其他内容。`);

  return sections.join('\n\n');
}

/**
 * 调用 AI 进行预检分析
 */
async function callPreflightAI(
  prompt: string, 
  config: { provider: string; apiKey: string; baseUrl: string; model: string }
): Promise<string> {
  // 使用 geminiService 中的通用 AI 调用函数
  const { callAIWithConfig } = await import('./geminiService');
  return await callAIWithConfig(prompt, config, { temperature: 0.3, maxTokens: 2000 });
}

/**
 * 解析 AI 预检响应
 */
function parsePreflightResponse(response: string): ConflictWarning[] {
  try {
    // 提取 JSON 部分
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }
    
    return parsed.map((item: any, index: number) => ({
      id: `ai-${item.type || 'logic'}-${index}`,
      type: item.type || 'logic',
      severity: item.severity || 'warning',
      title: item.title || '逻辑问题',
      description: item.description || '',
      source: item.source || 'AI 分析',
      suggestion: item.suggestion
    }));
  } catch (error) {
    console.warn('Failed to parse AI preflight response:', error);
    return [];
  }
}

/**
 * 完整预检流程
 */
export async function runPreflightCheck(
  context: PreflightContext,
  settings: AppSettings,
  options: { skipAI?: boolean } = {}
): Promise<PreflightResult> {
  const warnings: ConflictWarning[] = [];
  
  // 1. 本地规则检查（快速）
  const localWarnings = localPreflightCheck(context);
  warnings.push(...localWarnings);
  
  // 2. AI 增强检查（可选）
  if (!options.skipAI && settings.useRAG) {
    const aiWarnings = await aiPreflightCheck(context, settings);
    warnings.push(...aiWarnings);
  }
  
  // 去重
  const uniqueWarnings = deduplicateWarnings(warnings);
  
  // 判断是否通过（没有 error 级别的警告）
  const passed = !uniqueWarnings.some(w => w.severity === 'error');
  
  return {
    passed,
    warnings: uniqueWarnings,
    checkedAt: Date.now()
  };
}

/**
 * 警告去重
 */
function deduplicateWarnings(warnings: ConflictWarning[]): ConflictWarning[] {
  const seen = new Set<string>();
  return warnings.filter(w => {
    const key = `${w.type}-${w.source}-${w.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
