/**
 * Evolution Service
 * 
 * 动态演进服务 - 分析章节内容并生成设定更新建议
 * 
 * 功能：
 * - 分析章节中的角色状态变化
 * - 发现新的 Wiki 条目
 * - 追踪势力变化
 */

import { Chapter, Character, WikiEntry, Faction, AppSettings, WikiCategory } from '../types';
import { GoogleGenAI, setDefaultBaseUrls } from "@google/genai";

// ============ 接口定义 ============

/**
 * 演进建议类型
 */
export interface EvolutionSuggestion {
  type: 'character' | 'wiki' | 'faction';
  action: 'create' | 'update';
  targetId?: string;      // 更新时的目标 ID
  targetName?: string;    // 目标名称（用于显示）
  data: any;              // 建议的数据
  reasoning: string;      // AI 的推理过程
  confidence: number;     // 置信度 0-1
  selected?: boolean;     // 用户是否选中
}

/**
 * 章节分析结果
 */
export interface ChapterAnalysisResult {
  characterSuggestions: EvolutionSuggestion[];
  wikiSuggestions: EvolutionSuggestion[];
  factionSuggestions: EvolutionSuggestion[];
  mentionedCharacterIds: string[];
  mentionedWikiIds: string[];
}

// ============ 角色状态变化类型 ============

/**
 * 角色状态变化类型枚举
 * Requirements: 3.2, 3.3, 3.4
 */
export type CharacterChangeType = 
  | 'status_change'    // 状态变化（受伤、恢复等）
  | 'death'            // 死亡
  | 'exit'             // 退场（非死亡）
  | 'power_up'         // 能力提升
  | 'power_down'       // 能力下降
  | 'identity_change'  // 身份变化
  | 'new_ability'      // 获得新能力
  | 'new_tag'          // 新标签
  | 'relationship_change'; // 关系变化

/**
 * 角色状态变化详情
 */
export interface CharacterStateChange {
  characterId: string;
  characterName: string;
  changeType: CharacterChangeType;
  previousValue?: string;
  newValue: string;
  newTags?: string[];
  isActive: boolean;
  reasoning: string;
  confidence: number;
  evidence: string; // 章节中的证据文本
}

/**
 * 角色分析结果
 */
export interface CharacterAnalysisResult {
  mentionedCharacters: Array<{
    id: string;
    name: string;
    mentionCount: number;
    contexts: string[]; // 提及的上下文片段
  }>;
  stateChanges: CharacterStateChange[];
}

// ============ 辅助函数 ============

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, (match) => '\\' + match);
}

const getGoogleAI = (settings: AppSettings) => {
  const options: any = { apiKey: settings.apiKey || '' };
  if (settings.baseUrl) {
    setDefaultBaseUrls({ geminiUrl: settings.baseUrl });
  }
  return new GoogleGenAI(options);
};

const callOpenAI = async (baseUrl: string, apiKey: string, model: string, messages: any[], jsonMode = false) => {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body: any = {
    model,
    messages,
    temperature: 0.3, // 低温度以获得更稳定的分析结果
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`API Error: ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
};

/**
 * 在文本中查找角色提及
 * Requirements: 3.1 - 识别章节中出现的所有角色
 * 
 * @param content - 章节内容
 * @param characters - 所有角色列表
 * @returns 提及的角色及其上下文
 */
export function findCharacterMentions(
  content: string,
  characters: Character[]
): Array<{ id: string; name: string; mentionCount: number; contexts: string[] }> {
  const results: Array<{ id: string; name: string; mentionCount: number; contexts: string[] }> = [];
  
  for (const character of characters) {
    const name = character.name;
    if (!name) continue;
    
    // 创建正则表达式匹配角色名
    // 支持完整名字和可能的简称（如"张三"可能被称为"张"或"三"）
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedName, 'g');
    
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      // 提取提及的上下文（前后各50个字符）
      const contexts: string[] = [];
      let match;
      const contextRegex = new RegExp(`.{0,50}${escapedName}.{0,50}`, 'g');
      while ((match = contextRegex.exec(content)) !== null && contexts.length < 5) {
        contexts.push(match[0].trim());
      }
      
      results.push({
        id: character.id,
        name: character.name,
        mentionCount: matches.length,
        contexts
      });
    }
  }
  
  // 按提及次数排序
  return results.sort((a, b) => b.mentionCount - a.mentionCount);
}

/**
 * 分析角色状态变化
 * Requirements: 3.1, 3.2, 3.3, 3.4
 * 
 * @param chapter - 章节内容
 * @param characters - 所有角色列表
 * @param settings - 应用设置
 * @returns 角色分析结果
 */
export async function analyzeCharacterStates(
  chapter: Chapter,
  characters: Character[],
  settings: AppSettings
): Promise<CharacterAnalysisResult> {
  const content = chapter.content || '';
  
  // 1. 首先通过文本匹配找出提及的角色 (Requirement 3.1)
  const mentionedCharacters = findCharacterMentions(content, characters);
  
  if (mentionedCharacters.length === 0 || content.length < 200) {
    return {
      mentionedCharacters: [],
      stateChanges: []
    };
  }
  
  // 2. 构建角色状态分析的详细 prompt
  const characterDetails = mentionedCharacters.map(mc => {
    const char = characters.find(c => c.id === mc.id);
    if (!char) return null;
    return {
      name: char.name,
      currentStatus: char.status || '正常',
      currentTags: char.tags || [],
      isActive: char.isActive !== false,
      role: char.role,
      contexts: mc.contexts
    };
  }).filter(Boolean);
  
  const prompt = `
# 任务：分析章节中角色的状态变化

## 章节信息
标题：${chapter.title}
摘要：${chapter.summary || '无'}

## 章节内容
${content.slice(0, 6000)}

## 本章出现的角色及其当前状态
${JSON.stringify(characterDetails, null, 2)}

## 分析要求
请仔细分析章节内容，识别角色的状态变化。返回 JSON 格式：

{
  "stateChanges": [
    {
      "characterName": "角色名",
      "changeType": "状态变化类型",
      "previousValue": "变化前的状态（如有）",
      "newValue": "变化后的状态/新能力/新身份",
      "newTags": ["新增的标签"],
      "isActive": true或false,
      "reasoning": "判断依据（引用原文）",
      "confidence": 0.9,
      "evidence": "章节中的证据原文"
    }
  ]
}

## 状态变化类型说明
- status_change: 身体/精神状态变化（如：受伤、重伤、昏迷、恢复、中毒等）
- death: 角色死亡（isActive 必须设为 false）
- exit: 角色退场但未死亡（如：离开、被囚禁、失踪等，isActive 设为 false）
- power_up: 实力提升（如：突破、升级、觉醒等）
- power_down: 实力下降（如：废功、受创等）
- identity_change: 身份变化（如：继承、加入组织、获得称号等）
- new_ability: 获得新能力/技能
- new_tag: 需要添加新的角色标签

## 重要规则
1. 只返回有明确文本证据支持的变化
2. confidence 表示置信度（0-1），只有非常确定的变化才给高分
3. 死亡必须有明确描写，不能推测
4. 如果没有变化，stateChanges 返回空数组
5. 只返回 JSON，不要其他内容
  `.trim();

  let result: any;

  try {
    if (settings.provider === 'google') {
      const ai = getGoogleAI(settings);
      const response = await ai.models.generateContent({
        model: settings.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      result = JSON.parse(response.text || '{"stateChanges": []}');
    } else {
      const res = await callOpenAI(
        settings.baseUrl || '',
        settings.apiKey,
        settings.model,
        [{ role: 'user', content: prompt }],
        true
      );
      result = JSON.parse(res);
    }
  } catch (error) {
    console.error('Character state analysis failed:', error);
    return {
      mentionedCharacters,
      stateChanges: []
    };
  }

  // 3. 转换为 CharacterStateChange 格式
  const stateChanges: CharacterStateChange[] = (result.stateChanges || [])
    .map((change: any) => {
      const character = characters.find(c => c.name === change.characterName);
      if (!character) return null;
      
      return {
        characterId: character.id,
        characterName: change.characterName,
        changeType: change.changeType as CharacterChangeType,
        previousValue: change.previousValue,
        newValue: change.newValue,
        newTags: change.newTags,
        isActive: change.isActive !== false,
        reasoning: change.reasoning,
        confidence: change.confidence || 0.7,
        evidence: change.evidence || ''
      };
    })
    .filter(Boolean) as CharacterStateChange[];

  return {
    mentionedCharacters,
    stateChanges
  };
}

/**
 * 将角色状态变化转换为演进建议
 * Requirements: 3.2, 3.3, 3.4
 */
export function convertCharacterChangesToSuggestions(
  analysisResult: CharacterAnalysisResult,
  characters: Character[]
): EvolutionSuggestion[] {
  return analysisResult.stateChanges.map(change => {
    const character = characters.find(c => c.id === change.characterId);
    
    // 构建更新数据
    const updateData: any = {};
    
    // Requirement 3.2: 更新 status 字段
    if (['status_change', 'power_up', 'power_down'].includes(change.changeType)) {
      updateData.status = change.newValue;
    }
    
    // Requirement 3.3: 死亡或退场时设置 isActive 为 false
    if (['death', 'exit'].includes(change.changeType)) {
      updateData.isActive = false;
      updateData.status = change.changeType === 'death' ? '死亡' : change.newValue;
    }
    
    // Requirement 3.4: 更新 tags 字段
    if (change.newTags && change.newTags.length > 0) {
      const existingTags = character?.tags || [];
      updateData.tags = [...new Set([...existingTags, ...change.newTags])];
    }
    
    // 身份变化也可能需要更新 tags
    if (change.changeType === 'identity_change' || change.changeType === 'new_ability') {
      const existingTags = character?.tags || [];
      const newTag = change.newValue;
      if (newTag && !existingTags.includes(newTag)) {
        updateData.tags = [...existingTags, newTag];
      }
    }

    return {
      type: 'character' as const,
      action: 'update' as const,
      targetId: change.characterId,
      targetName: change.characterName,
      data: updateData,
      reasoning: `${change.reasoning}\n\n证据：${change.evidence}`,
      confidence: change.confidence,
      selected: change.confidence > 0.8
    };
  });
}

// ============ 势力状态变化类型 ============

/**
 * 势力变化类型枚举
 * Requirements: 5.1, 5.2, 5.3
 */
export type FactionChangeType =
  | 'influence_increase'   // 势力扩张
  | 'influence_decrease'   // 势力衰退
  | 'description_update'   // 描述更新
  | 'new_faction'          // 新势力出现
  | 'alliance'             // 结盟
  | 'conflict'             // 冲突
  | 'dissolution';         // 势力解散

/**
 * 势力状态变化详情
 */
export interface FactionStateChange {
  factionId?: string;       // 已有势力的 ID（新势力为空）
  factionName: string;
  changeType: FactionChangeType;
  previousInfluence?: number;
  newInfluence?: number;
  previousDescription?: string;
  newDescription?: string;
  reasoning: string;
  confidence: number;
  evidence: string;         // 章节中的证据文本
  isNewFaction: boolean;    // 是否为新势力
}

/**
 * 势力分析结果
 */
export interface FactionAnalysisResult {
  mentionedFactions: Array<{
    id: string;
    name: string;
    mentionCount: number;
    contexts: string[];     // 提及的上下文片段
  }>;
  stateChanges: FactionStateChange[];
  newFactions: Array<{
    name: string;
    description: string;
    suggestedInfluence: number;
    reasoning: string;
    confidence: number;
  }>;
}

/**
 * 在文本中查找势力提及
 * Requirements: 5.1 - 识别章节中涉及的势力
 * 
 * @param content - 章节内容
 * @param factions - 所有势力列表
 * @returns 提及的势力及其上下文
 */
export function findFactionMentions(
  content: string,
  factions: Faction[]
): Array<{ id: string; name: string; mentionCount: number; contexts: string[] }> {
  const results: Array<{ id: string; name: string; mentionCount: number; contexts: string[] }> = [];
  
  for (const faction of factions) {
    const name = faction.name;
    if (!name) continue;
    
    // 创建正则表达式匹配势力名
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedName, 'g');
    
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      // 提取提及的上下文（前后各50个字符）
      const contexts: string[] = [];
      const contextRegex = new RegExp(`.{0,50}${escapedName}.{0,50}`, 'g');
      let match: RegExpExecArray | null;
      while ((match = contextRegex.exec(content)) !== null && contexts.length < 5) {
        contexts.push(match[0].trim());
      }
      
      results.push({
        id: faction.id,
        name: faction.name,
        mentionCount: matches.length,
        contexts
      });
    }
  }
  
  // 按提及次数排序
  return results.sort((a, b) => b.mentionCount - a.mentionCount);
}

/**
 * 分析势力状态变化
 * Requirements: 5.1, 5.2, 5.3
 * 
 * @param chapter - 章节内容
 * @param factions - 所有势力列表
 * @param settings - 应用设置
 * @returns 势力分析结果
 */
export async function analyzeFactionStates(
  chapter: Chapter,
  factions: Faction[],
  settings: AppSettings
): Promise<FactionAnalysisResult> {
  const content = chapter.content || '';
  
  // 1. 首先通过文本匹配找出提及的势力 (Requirement 5.1)
  const mentionedFactions = findFactionMentions(content, factions);
  
  if (content.length < 200) {
    return {
      mentionedFactions: [],
      stateChanges: [],
      newFactions: []
    };
  }
  
  // 2. 构建势力状态分析的详细 prompt
  const factionDetails = mentionedFactions.map(mf => {
    const faction = factions.find(f => f.id === mf.id);
    if (!faction) return null;
    return {
      name: faction.name,
      currentDescription: faction.description,
      currentInfluence: faction.influence,
      contexts: mf.contexts
    };
  }).filter(Boolean);
  
  const existingFactionNames = factions.map(f => f.name).join('、');
  
  const prompt = `
# 任务：分析章节中势力的状态变化

## 章节信息
标题：${chapter.title}
摘要：${chapter.summary || '无'}

## 章节内容
${content.slice(0, 6000)}

## 已有势力列表
${existingFactionNames || '无'}

## 本章提及的势力及其当前状态
${JSON.stringify(factionDetails, null, 2)}

## 分析要求
请仔细分析章节内容，识别势力的状态变化和新势力的出现。返回 JSON 格式：

{
  "stateChanges": [
    {
      "factionName": "势力名",
      "changeType": "变化类型",
      "previousInfluence": 5,
      "newInfluence": 7,
      "newDescription": "更新后的描述（如有变化）",
      "reasoning": "判断依据（引用原文）",
      "confidence": 0.8,
      "evidence": "章节中的证据原文"
    }
  ],
  "newFactions": [
    {
      "name": "新势力名称",
      "description": "势力描述（50-150字）",
      "suggestedInfluence": 5,
      "reasoning": "为什么认为这是新势力",
      "confidence": 0.8
    }
  ]
}

## 势力变化类型说明
- influence_increase: 势力扩张（领土增加、成员增多、实力增强）
- influence_decrease: 势力衰退（战败、内乱、成员流失）
- description_update: 势力描述需要更新（新信息揭示）
- alliance: 与其他势力结盟
- conflict: 与其他势力发生冲突
- dissolution: 势力解散或被消灭

## 重要规则
1. 只返回有明确文本证据支持的变化
2. confidence 表示置信度（0-1），只有非常确定的变化才给高分
3. 新势力必须是首次在故事中出现的组织/门派/国家等
4. 不要将已有势力误判为新势力
5. influence 范围是 1-10，表示势力的影响力大小
6. 如果没有变化，对应数组返回空
7. 只返回 JSON，不要其他内容
  `.trim();

  let result: any = {
    stateChanges: [],
    newFactions: []
  };

  try {
    if (settings.provider === 'google') {
      const ai = getGoogleAI(settings);
      const response = await ai.models.generateContent({
        model: settings.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      result = JSON.parse(response.text || '{"stateChanges": [], "newFactions": []}');
    } else {
      const res = await callOpenAI(
        settings.baseUrl || '',
        settings.apiKey,
        settings.model,
        [{ role: 'user', content: prompt }],
        true
      );
      result = JSON.parse(res);
    }
  } catch (error) {
    console.error('Faction state analysis failed:', error);
    return {
      mentionedFactions,
      stateChanges: [],
      newFactions: []
    };
  }

  // 3. 转换为 FactionStateChange 格式
  const stateChanges: FactionStateChange[] = (result.stateChanges || [])
    .map((change: any) => {
      const faction = factions.find(f => f.name === change.factionName);
      if (!faction) return null;
      
      return {
        factionId: faction.id,
        factionName: change.factionName,
        changeType: change.changeType as FactionChangeType,
        previousInfluence: faction.influence,
        newInfluence: change.newInfluence,
        previousDescription: faction.description,
        newDescription: change.newDescription,
        reasoning: change.reasoning,
        confidence: change.confidence || 0.7,
        evidence: change.evidence || '',
        isNewFaction: false
      };
    })
    .filter(Boolean) as FactionStateChange[];

  // 4. 处理新势力
  const newFactions = (result.newFactions || [])
    .filter((nf: any) => {
      // 确保不是已有势力
      return !factions.some(f => 
        f.name.toLowerCase() === nf.name?.toLowerCase()
      );
    })
    .map((nf: any) => ({
      name: nf.name,
      description: nf.description || '',
      suggestedInfluence: Math.min(10, Math.max(1, nf.suggestedInfluence || 5)),
      reasoning: nf.reasoning || '',
      confidence: nf.confidence || 0.7
    }));

  return {
    mentionedFactions,
    stateChanges,
    newFactions
  };
}

/**
 * 将势力状态变化转换为演进建议
 * Requirements: 5.2, 5.3
 */
export function convertFactionChangesToSuggestions(
  analysisResult: FactionAnalysisResult,
  factions: Faction[]
): EvolutionSuggestion[] {
  const suggestions: EvolutionSuggestion[] = [];
  
  // 1. 处理已有势力的变化 (Requirement 5.2)
  for (const change of analysisResult.stateChanges) {
    const faction = factions.find(f => f.id === change.factionId);
    if (!faction) continue;
    
    const updateData: Partial<Faction> = {};
    
    // 更新影响力
    if (change.newInfluence !== undefined && change.newInfluence !== faction.influence) {
      updateData.influence = change.newInfluence;
    }
    
    // 更新描述
    if (change.newDescription && change.newDescription !== faction.description) {
      updateData.description = change.newDescription;
    }
    
    // 只有有实际更新时才添加建议
    if (Object.keys(updateData).length > 0) {
      suggestions.push({
        type: 'faction',
        action: 'update',
        targetId: change.factionId,
        targetName: change.factionName,
        data: updateData,
        reasoning: `${change.reasoning}\n\n证据：${change.evidence}`,
        confidence: change.confidence,
        selected: change.confidence > 0.8
      });
    }
  }
  
  // 2. 处理新势力 (Requirement 5.3)
  for (const newFaction of analysisResult.newFactions) {
    suggestions.push({
      type: 'faction',
      action: 'create',
      targetName: newFaction.name,
      data: {
        id: crypto.randomUUID(),
        name: newFaction.name,
        description: newFaction.description,
        influence: newFaction.suggestedInfluence,
        // 生成随机颜色
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
        // 随机位置
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10
      },
      reasoning: newFaction.reasoning,
      confidence: newFaction.confidence,
      selected: newFaction.confidence > 0.8
    });
  }
  
  return suggestions;
}

// ============ 核心函数 ============

/**
 * 分析章节并返回演进建议
 * 
 * 整合角色状态分析、Wiki 发现和势力追踪
 * Requirements: 3.1, 3.2, 3.3, 3.4 (角色), 4.1-4.4 (Wiki), 5.1-5.3 (势力)
 */
export async function analyzeChapterForEvolution(
  chapter: Chapter,
  characters: Character[],
  wikiEntries: WikiEntry[],
  factions: Faction[],
  settings: AppSettings
): Promise<ChapterAnalysisResult> {
  if (!settings.apiKey) {
    throw new Error('API Key 未配置');
  }

  const chapterContent = chapter.content || '';
  if (chapterContent.length < 500) {
    return {
      characterSuggestions: [],
      wikiSuggestions: [],
      factionSuggestions: [],
      mentionedCharacterIds: [],
      mentionedWikiIds: []
    };
  }

  // 1. 使用专门的角色状态分析函数 (Requirements 3.1-3.4)
  const characterAnalysis = await analyzeCharacterStates(chapter, characters, settings);
  const characterSuggestions = convertCharacterChangesToSuggestions(characterAnalysis, characters);
  
  // 获取提及的角色 ID
  const mentionedCharacterIds = characterAnalysis.mentionedCharacters.map(mc => mc.id);

  // 2. 使用专门的势力状态分析函数 (Requirements 5.1-5.3)
  const factionAnalysis = await analyzeFactionStates(chapter, factions, settings);
  const factionSuggestions = convertFactionChangesToSuggestions(factionAnalysis, factions);

  // 3. 分析 Wiki 条目变化 (Requirements 4.1-4.4)
  const wikiNames = wikiEntries.map(e => e.name).join('、');

  const wikiPrompt = `
# 任务：分析章节内容，识别 Wiki 条目变化

## 章节信息
标题：${chapter.title}
摘要：${chapter.summary}
内容：
${chapterContent.slice(0, 5000)}

## 已有 Wiki 条目
${wikiNames || '无'}

## 分析要求
请分析章节内容，返回以下 JSON 格式：

{
  "newWikiEntries": [
    {
      "name": "条目名称",
      "category": "Item|Skill|Location|Organization|Event|Person|Other",
      "description": "条目描述（50-100字）",
      "reasoning": "为什么需要添加",
      "confidence": 0.8
    }
  ],
  "wikiUpdates": [
    {
      "name": "已有条目名",
      "newDescription": "更新后的描述",
      "reasoning": "更新原因",
      "confidence": 0.7
    }
  ],
  "mentionedWikiEntries": ["条目名1", "条目名2"]
}

注意：
1. 只返回有明确证据支持的变化
2. confidence 表示置信度（0-1）
3. 如果没有变化，对应数组返回空
4. 只返回 JSON，不要其他内容
  `.trim();

  let wikiResult: any = {
    newWikiEntries: [],
    wikiUpdates: [],
    mentionedWikiEntries: []
  };

  try {
    if (settings.provider === 'google') {
      const ai = getGoogleAI(settings);
      const response = await ai.models.generateContent({
        model: settings.model,
        contents: wikiPrompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      wikiResult = JSON.parse(response.text || '{}');
    } else {
      const res = await callOpenAI(
        settings.baseUrl || '',
        settings.apiKey,
        settings.model,
        [{ role: 'user', content: wikiPrompt }],
        true
      );
      wikiResult = JSON.parse(res);
    }
  } catch (error) {
    console.error('Wiki analysis failed:', error);
  }

  // 4. 转换 Wiki 建议
  const wikiSuggestions: EvolutionSuggestion[] = [
    // 新条目
    ...(wikiResult.newWikiEntries || []).map((e: any) => ({
      type: 'wiki' as const,
      action: 'create' as const,
      targetName: e.name,
      data: {
        id: crypto.randomUUID(),
        name: e.name,
        category: e.category as WikiCategory,
        description: e.description,
        firstAppearanceChapterId: chapter.id
      },
      reasoning: e.reasoning,
      confidence: e.confidence || 0.7,
      selected: e.confidence > 0.8
    })),
    // 更新条目
    ...(wikiResult.wikiUpdates || []).map((e: any) => {
      const existingEntry = wikiEntries.find(w => w.name === e.name);
      return {
        type: 'wiki' as const,
        action: 'update' as const,
        targetId: existingEntry?.id,
        targetName: e.name,
        data: {
          description: e.newDescription
        },
        reasoning: e.reasoning,
        confidence: e.confidence || 0.7,
        selected: false
      };
    }).filter((s: EvolutionSuggestion) => s.targetId)
  ];

  // 5. 识别提及的 Wiki
  const mentionedWikiIds = wikiEntries
    .filter(e => (wikiResult.mentionedWikiEntries || []).includes(e.name))
    .map(e => e.id);

  return {
    characterSuggestions,
    wikiSuggestions,
    factionSuggestions,
    mentionedCharacterIds,
    mentionedWikiIds
  };
}

/**
 * 应用单个演进建议
 */
export function applyEvolutionSuggestion(
  suggestion: EvolutionSuggestion,
  currentData: {
    characters: Character[];
    wikiEntries: WikiEntry[];
    factions: Faction[];
  }
): {
  characters: Character[];
  wikiEntries: WikiEntry[];
  factions: Faction[];
} {
  const { characters, wikiEntries, factions } = currentData;

  switch (suggestion.type) {
    case 'character':
      if (suggestion.action === 'update' && suggestion.targetId) {
        return {
          ...currentData,
          characters: characters.map(c => {
            if (c.id === suggestion.targetId) {
              return {
                ...c,
                status: suggestion.data.status || c.status,
                tags: suggestion.data.tags || c.tags,
                isActive: suggestion.data.isActive ?? c.isActive
              };
            }
            return c;
          })
        };
      }
      break;

    case 'wiki':
      if (suggestion.action === 'create') {
        return {
          ...currentData,
          wikiEntries: [...wikiEntries, suggestion.data as WikiEntry]
        };
      } else if (suggestion.action === 'update' && suggestion.targetId) {
        return {
          ...currentData,
          wikiEntries: wikiEntries.map(e => {
            if (e.id === suggestion.targetId) {
              return { ...e, ...suggestion.data };
            }
            return e;
          })
        };
      }
      break;

    case 'faction':
      if (suggestion.action === 'create') {
        return {
          ...currentData,
          factions: [...factions, suggestion.data as Faction]
        };
      } else if (suggestion.action === 'update' && suggestion.targetId) {
        return {
          ...currentData,
          factions: factions.map(f => {
            if (f.id === suggestion.targetId) {
              return {
                ...f,
                influence: suggestion.data.influence ?? f.influence,
                description: suggestion.data.description || f.description
              };
            }
            return f;
          })
        };
      }
      break;
  }

  return currentData;
}

/**
 * 批量应用选中的建议
 */
export function applySelectedSuggestions(
  suggestions: EvolutionSuggestion[],
  currentData: {
    characters: Character[];
    wikiEntries: WikiEntry[];
    factions: Faction[];
  }
): {
  characters: Character[];
  wikiEntries: WikiEntry[];
  factions: Faction[];
} {
  let result = { ...currentData };
  
  for (const suggestion of suggestions) {
    if (suggestion.selected) {
      result = applyEvolutionSuggestion(suggestion, result);
    }
  }
  
  return result;
}
