/**
 * 风格学习服务 (Adaptive Style Loop)
 * 
 * 让 AI 学习用户的写作风格，解决"AI 味"重的问题
 * 
 * 核心逻辑：
 * 1. 当用户对 AI 生成的文本进行重度修改（>30%）时，保存为风格样本
 * 2. 生成时检索相似风格样本作为 Few-Shot 示例
 * 3. 将风格样本注入到 AI 提示词中，引导 AI 模仿用户风格
 */

import { db } from './db';
import { AppSettings } from '../types';

/**
 * 风格样本接口
 */
export interface StyleSample {
  id: string;
  projectId: string;           // 项目 ID
  chapterId: string;           // 章节 ID
  originalAI: string;          // AI 原始生成的文本
  userFinal: string;           // 用户最终修改后的文本
  editRatio: number;           // 修改比例 (0-1)
  vector?: number[];           // 风格向量（用于检索）
  createdAt: number;           // 创建时间
  wordCount: number;           // 字数
  tags?: string[];             // 风格标签（可选）
}

/**
 * 风格学习统计
 */
export interface StyleStats {
  totalSamples: number;
  avgEditRatio: number;
  recentSamples: number;       // 最近 7 天的样本数
  topPatterns: string[];       // 常见修改模式
}

/**
 * 计算两段文本的编辑距离比例
 * 使用基于 n-gram 的相似度算法，更适合中文文本
 */
export function calculateEditRatio(original: string, modified: string): number {
  if (!original || !modified) return 1;
  if (original === modified) return 0;
  
  // 移除空白字符进行比较
  const originalChars = original.replace(/\s+/g, '');
  const modifiedChars = modified.replace(/\s+/g, '');
  
  if (originalChars.length === 0 || modifiedChars.length === 0) return 1;
  
  // 使用 2-gram (bigram) 进行相似度计算，更适合中文
  const getBigrams = (str: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  };
  
  const originalBigrams = getBigrams(originalChars);
  const modifiedBigrams = getBigrams(modifiedChars);
  
  // 计算 Jaccard 相似度
  let intersection = 0;
  originalBigrams.forEach(bigram => {
    if (modifiedBigrams.has(bigram)) intersection++;
  });
  
  const union = originalBigrams.size + modifiedBigrams.size - intersection;
  const jaccardSimilarity = union > 0 ? intersection / union : 0;
  
  // 考虑长度变化
  const lengthRatio = Math.min(originalChars.length, modifiedChars.length) / 
                      Math.max(originalChars.length, modifiedChars.length);
  
  // 综合计算：Jaccard 相似度 * 长度比例
  const similarity = jaccardSimilarity * (0.7 + 0.3 * lengthRatio);
  
  // 编辑比例 = 1 - 相似度
  return Math.min(1, Math.max(0, 1 - similarity));
}

/**
 * 判断是否应该保存为风格样本
 * 条件：修改比例 > 30% 且文本长度 > 100 字
 */
export function shouldSaveAsStyleSample(
  original: string, 
  modified: string,
  minEditRatio: number = 0.3,
  minLength: number = 100
): boolean {
  if (!original || !modified) return false;
  if (modified.length < minLength) return false;
  
  const editRatio = calculateEditRatio(original, modified);
  return editRatio >= minEditRatio;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `style_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 保存风格样本到 IndexedDB
 */
export async function saveStyleSample(
  projectId: string,
  chapterId: string,
  originalAI: string,
  userFinal: string,
  settings: AppSettings
): Promise<StyleSample | null> {
  const editRatio = calculateEditRatio(originalAI, userFinal);
  
  // 只保存修改比例 > 30% 的样本
  if (editRatio < 0.3) {
    console.log('Edit ratio too low, not saving as style sample:', editRatio.toFixed(2));
    return null;
  }
  
  const sample: StyleSample = {
    id: generateId(),
    projectId,
    chapterId,
    originalAI,
    userFinal,
    editRatio,
    createdAt: Date.now(),
    wordCount: userFinal.length
  };
  
  // 生成风格向量（如果启用 RAG）
  if (settings.apiKey && settings.useRAG) {
    try {
      const { generateEmbedding } = await import('./ragService');
      // 使用用户最终稿生成向量
      sample.vector = await generateEmbedding(userFinal, settings);
    } catch (e) {
      console.warn('Failed to generate style vector:', e);
    }
  }
  
  // 保存到 IndexedDB
  try {
    await db.saveVectors([{
      id: sample.id,
      relatedId: chapterId,
      type: 'style',
      text: userFinal,
      vector: sample.vector || [],
      timestamp: sample.createdAt,
      metadata: {
        projectId,
        originalAI,
        editRatio,
        wordCount: sample.wordCount
      }
    }]);
    
    console.log('Style sample saved:', sample.id, 'editRatio:', editRatio.toFixed(2));
    return sample;
  } catch (e) {
    console.error('Failed to save style sample:', e);
    return null;
  }
}

/**
 * 获取项目的所有风格样本
 */
export async function getStyleSamples(projectId: string): Promise<StyleSample[]> {
  try {
    const allVectors = await db.getAllVectors();
    
    return allVectors
      .filter(v => v.type === 'style' && v.metadata?.projectId === projectId)
      .map(v => ({
        id: v.id,
        projectId: v.metadata?.projectId || projectId,
        chapterId: v.relatedId,
        originalAI: v.metadata?.originalAI || '',
        userFinal: v.text,
        editRatio: v.metadata?.editRatio || 0,
        vector: v.vector,
        createdAt: v.timestamp,
        wordCount: v.metadata?.wordCount || v.text.length
      }));
  } catch (e) {
    console.error('Failed to get style samples:', e);
    return [];
  }
}

/**
 * 获取风格学习统计
 */
export async function getStyleStats(projectId: string): Promise<StyleStats> {
  const samples = await getStyleSamples(projectId);
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  const recentSamples = samples.filter(s => s.createdAt > weekAgo);
  const avgEditRatio = samples.length > 0 
    ? samples.reduce((sum, s) => sum + s.editRatio, 0) / samples.length 
    : 0;
  
  return {
    totalSamples: samples.length,
    avgEditRatio,
    recentSamples: recentSamples.length,
    topPatterns: [] // TODO: 分析常见修改模式
  };
}

/**
 * 检索相似风格样本（用于 Few-Shot 学习）
 */
export async function retrieveSimilarStyleSamples(
  projectId: string,
  context: string,
  settings: AppSettings,
  limit: number = 3
): Promise<StyleSample[]> {
  if (!settings.useRAG || !settings.apiKey) {
    // 如果没有启用 RAG，返回最近的样本
    const samples = await getStyleSamples(projectId);
    return samples
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
  
  try {
    const { generateEmbedding, cosineSimilarity } = await import('./ragService');
    const contextVector = await generateEmbedding(context, settings);
    
    const samples = await getStyleSamples(projectId);
    
    // 计算相似度并排序
    const scoredSamples = samples
      .filter(s => s.vector && s.vector.length > 0)
      .map(s => ({
        sample: s,
        similarity: cosineSimilarity(contextVector, s.vector!)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    return scoredSamples.map(s => s.sample);
  } catch (e) {
    console.warn('Failed to retrieve similar style samples:', e);
    // 回退到最近的样本
    const samples = await getStyleSamples(projectId);
    return samples
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

/**
 * 构建风格学习提示词片段
 * 用于注入到 AI 生成提示词中
 */
export function buildStylePromptSection(samples: StyleSample[]): string {
  if (samples.length === 0) return '';
  
  let prompt = `\n## 用户写作风格参考\n`;
  prompt += `以下是用户对 AI 生成内容的修改示例，请学习用户的写作风格偏好：\n\n`;
  
  samples.forEach((sample, index) => {
    prompt += `### 示例 ${index + 1}（修改比例: ${(sample.editRatio * 100).toFixed(0)}%）\n`;
    prompt += `**AI 原始生成：**\n${sample.originalAI.slice(0, 500)}${sample.originalAI.length > 500 ? '...' : ''}\n\n`;
    prompt += `**用户修改后：**\n${sample.userFinal.slice(0, 500)}${sample.userFinal.length > 500 ? '...' : ''}\n\n`;
  });
  
  prompt += `请模仿用户的写作风格，包括：\n`;
  prompt += `- 用词习惯和表达方式\n`;
  prompt += `- 句式结构和节奏\n`;
  prompt += `- 描写细节的程度\n`;
  prompt += `- 对话风格\n\n`;
  
  return prompt;
}

/**
 * 删除风格样本
 */
export async function deleteStyleSample(sampleId: string): Promise<void> {
  try {
    await db.deleteVectorsByRelatedId(sampleId);
    console.log('Style sample deleted:', sampleId);
  } catch (e) {
    console.error('Failed to delete style sample:', e);
  }
}

/**
 * 清除项目的所有风格样本
 */
export async function clearProjectStyleSamples(projectId: string): Promise<void> {
  try {
    const samples = await getStyleSamples(projectId);
    for (const sample of samples) {
      await db.deleteVectorsByRelatedId(sample.id);
    }
    console.log('Cleared all style samples for project:', projectId);
  } catch (e) {
    console.error('Failed to clear style samples:', e);
  }
}
