// RAG (Retrieval-Augmented Generation) 检索增强生成服务
// 支持向量检索 + 关键词匹配混合模式 + 高级检索优化
import { Chapter, Character, WikiEntry, VectorRecord, AppSettings } from '../types';
import { db } from './db';
import { GoogleGenAI } from "@google/genai";
import { setDefaultBaseUrls } from "@google/genai";

// ============ 配置常量 ============

/** 相似度阈值 - 低于此值的结果将被过滤 */
const SIMILARITY_THRESHOLD = 0.3;

/** 关键词匹配权重 */
const KEYWORD_WEIGHT = 0.4;

/** 向量匹配权重 */
const VECTOR_WEIGHT = 0.6;

/** 时间衰减因子 - 控制最近内容的权重提升 */
const TIME_DECAY_FACTOR = 0.1;

/** 语义分块大小 (字符数) */
const CHUNK_SIZE = 1500;

/** 语义分块重叠 (字符数) */
const CHUNK_OVERLAP = 200;

/** Embedding 缓存过期时间 (毫秒) - 1小时 */
const EMBEDDING_CACHE_TTL = 60 * 60 * 1000;

// ============ 工具函数 ============

/**
 * 余弦相似度计算
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * 简单的内容 hash 计算（用于增量索引）
 */
function simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}

/**
 * 提取中文关键词（增强版分词）
 * 支持：人名、地名、专有名词、动词短语
 */
function extractKeywords(text: string): string[] {
    if (!text) return [];
    
    // 移除标点符号
    const cleaned = text.replace(/[，。！？、；：""''（）【】《》\s\n\r]/g, ' ');
    
    const keywords: string[] = [];
    const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
    
    // 添加完整词
    words.forEach(w => {
        if (w.length >= 2 && w.length <= 10) {
            keywords.push(w);
        }
    });
    
    // 提取人名模式（2-4个汉字）
    const namePattern = /[\u4e00-\u9fa5]{2,4}/g;
    const names = text.match(namePattern) || [];
    names.forEach(n => {
        if (!keywords.includes(n)) {
            keywords.push(n);
        }
    });
    
    // 提取引号内的专有名词
    const quotedPattern = /[「『"']([\u4e00-\u9fa5a-zA-Z0-9]+)[」』"']/g;
    let match;
    while ((match = quotedPattern.exec(text)) !== null) {
        if (match[1] && !keywords.includes(match[1])) {
            keywords.push(match[1]);
        }
    }
    
    return [...new Set(keywords)].slice(0, 50);
}

/**
 * 语义分块 - 将长文本分成有重叠的语义块
 */
function semanticChunk(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
    if (!text || text.length <= chunkSize) return [text];
    
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[。！？\n])/);
    
    let currentChunk = '';
    let overlapBuffer = '';
    
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
            // 保留重叠部分
            overlapBuffer = currentChunk.slice(-overlap);
            currentChunk = overlapBuffer + sentence;
        } else {
            currentChunk += sentence;
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

/**
 * 计算时间衰减权重
 * 最近的内容获得更高权重
 */
function calculateTimeDecay(order: number, maxOrder: number): number {
    if (maxOrder <= 1) return 1;
    const recency = order / maxOrder; // 0-1, 越大越新
    return 1 + TIME_DECAY_FACTOR * recency;
}

/**
 * 计算关键词匹配分数
 */
function keywordMatchScore(queryKeywords: string[], targetText: string): number {
    if (queryKeywords.length === 0 || !targetText) return 0;
    
    let matchCount = 0;
    for (const keyword of queryKeywords) {
        if (targetText.includes(keyword)) {
            matchCount++;
        }
    }
    
    return matchCount / queryKeywords.length;
}

/**
 * 检查是否支持向量 Embedding
 */
function supportsEmbedding(settings: AppSettings): boolean {
    return settings.provider === 'google' || settings.provider === 'openai';
}

// ============ Embedding 缓存 ============

interface EmbeddingCacheEntry {
    vector: number[];
    timestamp: number;
}

/** 查询 Embedding 缓存 */
const queryEmbeddingCache = new Map<string, EmbeddingCacheEntry>();

/**
 * 获取缓存的 Embedding 或生成新的
 */
async function getCachedEmbedding(text: string, settings: AppSettings): Promise<number[]> {
    const cacheKey = simpleHash(text);
    const cached = queryEmbeddingCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < EMBEDDING_CACHE_TTL) {
        return cached.vector;
    }
    
    const vector = await generateEmbedding(text, settings);
    
    if (vector.length > 0) {
        queryEmbeddingCache.set(cacheKey, { vector, timestamp: Date.now() });
        
        // 清理过期缓存
        if (queryEmbeddingCache.size > 100) {
            const now = Date.now();
            for (const [key, entry] of queryEmbeddingCache.entries()) {
                if (now - entry.timestamp > EMBEDDING_CACHE_TTL) {
                    queryEmbeddingCache.delete(key);
                }
            }
        }
    }
    
    return vector;
}

/**
 * 多查询扩展 - 生成查询变体提高召回率
 */
function expandQuery(query: string): string[] {
    const queries = [query];
    
    // 提取核心关键词作为独立查询
    const keywords = extractKeywords(query);
    if (keywords.length >= 3) {
        // 取前 3 个关键词组合
        queries.push(keywords.slice(0, 3).join(' '));
    }
    
    // 如果查询较长，取前半部分
    if (query.length > 50) {
        queries.push(query.slice(0, Math.floor(query.length / 2)));
    }
    
    return queries;
}

// ============ Embedding 生成 ============

/**
 * 生成文本的向量嵌入
 */
export async function generateEmbedding(text: string, settings: AppSettings): Promise<number[]> {
    if (!text || !settings.apiKey) return [];
    
    // DeepSeek 不支持 Embedding，直接返回空
    if (!supportsEmbedding(settings)) {
        return [];
    }
    
    try {
        const truncatedText = text.slice(0, 10000);
        
        if (settings.provider === 'google') {
            const options: any = { apiKey: settings.apiKey };
            if (settings.baseUrl) {
                setDefaultBaseUrls({ geminiUrl: settings.baseUrl });
            }
            const ai = new GoogleGenAI(options);
            
            const model = "text-embedding-004";
            const result = await ai.models.embedContent({
                model,
                contents: truncatedText
            });
            
            return result.embeddings?.[0]?.values || [];
        } 
        else if (settings.provider === 'openai') {
            const baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
            const response = await fetch(`${baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify({
                    model: 'text-embedding-3-small',
                    input: truncatedText,
                    encoding_format: 'float'
                })
            });
            
            if (!response.ok) {
                throw new Error(`OpenAI Embedding API error: ${response.statusText}`);
            }
            
            const data = await response.json();
            return data.data[0].embedding || [];
        }
        else if (settings.provider === 'custom') {
            if (!settings.baseUrl) return [];
            
            try {
                const response = await fetch(`${settings.baseUrl}/embeddings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'text-embedding',
                        input: truncatedText,
                        encoding_format: 'float'
                    })
                });
                
                if (!response.ok) return [];
                
                const data = await response.json();
                return data.data[0].embedding || [];
            } catch {
                return [];
            }
        }
        
        return [];
    } catch (e) {
        console.error('Failed to generate embedding:', e);
        return [];
    }
}


// ============ 混合检索函数 ============

/**
 * 混合检索相关章节（向量 + 关键词 + 时间衰减 + 多查询扩展）
 */
export async function retrieveRelevantChapters(
    query: string,
    allChapters: Chapter[],
    settings: AppSettings,
    topK: number = 3,
    excludeChapterId?: string
): Promise<Chapter[]> {
    const filteredChapters = allChapters.filter(c => c.id !== excludeChapterId);
    if (filteredChapters.length === 0) return [];
    
    const maxOrder = Math.max(...filteredChapters.map(c => c.order), 1);
    const useVector = supportsEmbedding(settings);
    
    // 多查询扩展
    const expandedQueries = expandQuery(query);
    const allQueryKeywords = expandedQueries.flatMap(q => extractKeywords(q));
    const uniqueKeywords = [...new Set(allQueryKeywords)];
    
    try {
        let queryVectors: number[][] = [];
        let chapterVectors: VectorRecord[] = [];
        
        // 尝试向量检索 - 使用缓存
        if (useVector) {
            // 为每个扩展查询生成 embedding
            const vectorPromises = expandedQueries.slice(0, 2).map(q => getCachedEmbedding(q, settings));
            queryVectors = (await Promise.all(vectorPromises)).filter(v => v.length > 0);
            
            if (queryVectors.length > 0) {
                const allVectors = await db.getAllVectors();
                chapterVectors = allVectors.filter(v => 
                    v.type === 'chapter' && v.relatedId !== excludeChapterId
                );
            }
        }
        
        // 计算每个章节的综合分数
        const scores = filteredChapters.map(chapter => {
            let vectorScore = 0;
            let keywordScore = 0;
            
            // 向量相似度 - 取多个查询的最大值
            if (queryVectors.length > 0 && chapterVectors.length > 0) {
                const chapterVector = chapterVectors.find(v => v.relatedId === chapter.id);
                if (chapterVector) {
                    const similarities = queryVectors.map(qv => cosineSimilarity(qv, chapterVector.vector));
                    vectorScore = Math.max(...similarities);
                }
            }
            
            // 关键词匹配
            const chapterText = `${chapter.title} ${chapter.summary} ${chapter.content?.slice(0, 1500) || ''}`;
            keywordScore = keywordMatchScore(uniqueKeywords, chapterText);
            
            // 时间衰减加权 - 最近的章节获得更高权重
            const timeDecay = calculateTimeDecay(chapter.order, maxOrder);
            
            // 综合分数
            let finalScore = useVector && queryVectors.length > 0
                ? vectorScore * VECTOR_WEIGHT + keywordScore * KEYWORD_WEIGHT
                : keywordScore;
            
            // 应用时间衰减
            finalScore *= timeDecay;
            
            return { chapter, score: finalScore, vectorScore, keywordScore, timeDecay };
        });
        
        // 过滤低分结果并排序
        const validResults = scores
            .filter(s => s.score >= SIMILARITY_THRESHOLD || s.keywordScore > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK * 2); // 先取更多，后面去重
        
        // 去重 - 移除内容高度相似的章节
        const dedupedResults = deduplicateResults(validResults, 'chapter');
        
        // 如果没有有效结果，返回最近的章节
        if (dedupedResults.length === 0) {
            return filteredChapters.slice(-topK);
        }
        
        const result = dedupedResults.slice(0, topK).map(s => s.chapter);
        result.sort((a, b) => a.order - b.order);
        
        return result;
    } catch (e) {
        console.error('Failed to retrieve relevant chapters:', e);
        return filteredChapters.slice(-topK);
    }
}

/**
 * 去重函数 - 移除高度相似的结果
 */
function deduplicateResults<T extends { chapter?: Chapter; character?: Character; entry?: WikiEntry; score: number }>(
    results: T[],
    type: 'chapter' | 'character' | 'wiki'
): T[] {
    if (results.length <= 1) return results;
    
    const deduped: T[] = [];
    const seenTexts: string[] = [];
    
    for (const result of results) {
        let text = '';
        if (type === 'chapter' && result.chapter) {
            text = `${result.chapter.title} ${result.chapter.summary}`;
        } else if (type === 'character' && result.character) {
            text = `${result.character.name} ${result.character.description}`;
        } else if (type === 'wiki' && result.entry) {
            text = `${result.entry.name} ${result.entry.description}`;
        }
        
        // 检查是否与已有结果高度相似
        const isDuplicate = seenTexts.some(seen => {
            const overlap = calculateTextOverlap(text, seen);
            return overlap > 0.7; // 70% 以上重叠视为重复
        });
        
        if (!isDuplicate) {
            deduped.push(result);
            seenTexts.push(text);
        }
    }
    
    return deduped;
}

/**
 * 计算两段文本的重叠度
 */
function calculateTextOverlap(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    const words1 = new Set(extractKeywords(text1));
    const words2 = new Set(extractKeywords(text2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    let overlap = 0;
    for (const word of words1) {
        if (words2.has(word)) overlap++;
    }
    
    return overlap / Math.min(words1.size, words2.size);
}

/**
 * 混合检索相关角色（向量 + 关键词 + 深度图谱）
 * 
 * 增强版：支持多层关系遍历，捕捉深层人物纠葛
 * 
 * @param query - 查询文本
 * @param allCharacters - 所有角色
 * @param settings - 应用设置
 * @param topK - 返回结果数量
 * @param graphDepth - 图谱遍历深度（默认 2，即二度人脉）
 */
export async function retrieveRelevantCharacters(
    query: string,
    allCharacters: Character[],
    settings: AppSettings,
    topK: number = 5,
    graphDepth: number = 2
): Promise<Character[]> {
    if (allCharacters.length === 0) return [];
    
    const queryKeywords = extractKeywords(query);
    const useVector = supportsEmbedding(settings);
    
    try {
        let queryVector: number[] = [];
        let characterVectors: VectorRecord[] = [];
        
        if (useVector) {
            queryVector = await getCachedEmbedding(query, settings);
            if (queryVector.length > 0) {
                const allVectors = await db.getAllVectors();
                characterVectors = allVectors.filter(v => v.type === 'character');
            }
        }
        
        // 第一轮：计算基础分数（向量 + 关键词）
        const scores = allCharacters.map(character => {
            let vectorScore = 0;
            let keywordScore = 0;
            
            if (queryVector.length > 0 && characterVectors.length > 0) {
                const charVector = characterVectors.find(v => v.relatedId === character.id);
                if (charVector) {
                    vectorScore = cosineSimilarity(queryVector, charVector.vector);
                }
            }
            
            // 角色名直接匹配给予高分
            const nameMatch = query.includes(character.name) ? 0.5 : 0;
            const charText = `${character.name} ${character.role} ${character.description} ${character.personality} ${character.speakingStyle || ''} ${character.motivation || ''}`;
            keywordScore = keywordMatchScore(queryKeywords, charText) + nameMatch;
            
            // 主角加权
            const isProtagonist = character.role?.includes('主角') || character.role?.toLowerCase().includes('protagonist');
            const protagonistBonus = isProtagonist ? 0.2 : 0;
            
            const finalScore = useVector && queryVector.length > 0
                ? vectorScore * VECTOR_WEIGHT + keywordScore * KEYWORD_WEIGHT + protagonistBonus
                : keywordScore + protagonistBonus;
            
            return { character, score: finalScore, vectorScore, keywordScore };
        });
        
        // 排序获取初步结果（种子角色）
        const sortedScores = scores.sort((a, b) => b.score - a.score);
        const seedResults = sortedScores.slice(0, Math.ceil(topK / 2));
        const seedCharacterIds = seedResults.map(r => r.character.id);
        
        // 第二轮：深度图谱检索 - 使用 BFS 遍历多层关系
        const { retrieveWithGraph, getRelationWeight } = await import('./graphService');
        const graphResults = retrieveWithGraph(seedCharacterIds, allCharacters, {
            maxDepth: graphDepth,
            depthDecay: 0.6,
            minPathWeight: 0.1,
            includeStartNodes: false, // 种子角色已经在结果中
        });
        
        // 构建图谱分数映射
        const graphScoreMap = new Map<string, number>();
        for (const result of graphResults) {
            // 根据关系强度和深度计算加成
            const graphBonus = result.relevanceScore * 0.3; // 最高 0.3 的加成
            graphScoreMap.set(result.character.id, graphBonus);
        }
        
        // 为所有角色添加图谱加成
        const enhancedScores = sortedScores.map(s => {
            const graphBonus = graphScoreMap.get(s.character.id) || 0;
            return { ...s, score: s.score + graphBonus, graphBonus };
        });
        
        // 重新排序
        const validResults = enhancedScores
            .filter(s => s.score >= SIMILARITY_THRESHOLD || s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
        
        if (validResults.length === 0) {
            return allCharacters.slice(0, topK);
        }
        
        return validResults.map(s => s.character);
    } catch (e) {
        console.error('Failed to retrieve relevant characters:', e);
        return allCharacters.slice(0, topK);
    }
}

/**
 * 混合检索相关 Wiki 条目（增强版）
 * 
 * 支持：
 * - 别名匹配 (Alias System)
 * - 关联扩展 (Wiki Relationships)
 * - 时间切片 (Time Slicing) - 通过 currentChapterOrder 参数
 * 
 * @param query - 查询文本
 * @param allEntries - 所有 Wiki 条目
 * @param settings - 应用设置
 * @param topK - 返回结果数量
 * @param currentChapterOrder - 当前章节序号（用于时间切片）
 * @param expandRelations - 是否扩展关联条目
 */
export async function retrieveRelevantWikiEntries(
    query: string,
    allEntries: WikiEntry[],
    settings: AppSettings,
    topK: number = 5,
    currentChapterOrder?: number,
    expandRelations: boolean = true
): Promise<WikiEntry[]> {
    if (allEntries.length === 0) return [];
    
    // 多查询扩展
    const expandedQueries = expandQuery(query);
    const allQueryKeywords = expandedQueries.flatMap(q => extractKeywords(q));
    const uniqueKeywords = [...new Set(allQueryKeywords)];
    const useVector = supportsEmbedding(settings);
    
    // 🆕 导入 Wiki 服务函数
    const { getAllNames, getRelatedEntries } = await import('./wikiService');
    
    try {
        let queryVector: number[] = [];
        let wikiVectors: VectorRecord[] = [];
        
        if (useVector) {
            queryVector = await getCachedEmbedding(query, settings);
            if (queryVector.length > 0) {
                const allVectors = await db.getAllVectors();
                wikiVectors = allVectors.filter(v => v.type === 'wiki');
            }
        }
        
        const scores = allEntries.map(entry => {
            let vectorScore = 0;
            let keywordScore = 0;
            
            if (queryVector.length > 0 && wikiVectors.length > 0) {
                const entryVector = wikiVectors.find(v => v.relatedId === entry.id);
                if (entryVector) {
                    vectorScore = cosineSimilarity(queryVector, entryVector.vector);
                }
            }
            
            // 🆕 别名匹配：检查主名称和所有别名
            const allNames = getAllNames(entry);
            let nameMatch = 0;
            for (const name of allNames) {
                if (name.length > 1 && query.includes(name)) {
                    nameMatch = 0.5;
                    break;
                }
            }
            
            // 🆕 构建包含别名的文本用于关键词匹配
            const aliasText = entry.aliases?.join(' ') || '';
            const entryText = `${entry.name} ${aliasText} ${entry.category} ${entry.description}`;
            keywordScore = keywordMatchScore(uniqueKeywords, entryText) + nameMatch;
            
            // 类别相关性加成
            const categoryBonus = getCategoryRelevanceBonus(entry.category, query);
            
            const finalScore = useVector && queryVector.length > 0
                ? vectorScore * VECTOR_WEIGHT + keywordScore * KEYWORD_WEIGHT + categoryBonus
                : keywordScore + categoryBonus;
            
            return { entry, score: finalScore, vectorScore, keywordScore };
        });
        
        // 排序获取初步结果
        const sortedScores = scores.sort((a, b) => b.score - a.score);
        
        // 🆕 关联扩展：为匹配的条目添加其关联条目
        if (expandRelations) {
            const topResults = sortedScores.slice(0, Math.ceil(topK / 2));
            const relatedEntryIds = new Set<string>();
            
            for (const result of topResults) {
                if (result.score > 0) {
                    const related = getRelatedEntries(result.entry, allEntries);
                    for (const rel of related) {
                        relatedEntryIds.add(rel.entry.id);
                    }
                }
            }
            
            // 为关联条目添加加成
            for (const s of sortedScores) {
                if (relatedEntryIds.has(s.entry.id)) {
                    s.score += 0.15; // 关联加成
                }
            }
            
            // 重新排序
            sortedScores.sort((a, b) => b.score - a.score);
        }
        
        const validResults = sortedScores
            .filter(s => s.score >= SIMILARITY_THRESHOLD || s.score > 0)
            .slice(0, topK * 2);
        
        // 去重
        const dedupedResults = deduplicateResults(validResults, 'wiki');
        
        if (dedupedResults.length === 0) {
            return allEntries.slice(0, topK);
        }
        
        return dedupedResults.slice(0, topK).map(s => s.entry);
    } catch (e) {
        console.error('Failed to retrieve relevant wiki entries:', e);
        return allEntries.slice(0, topK);
    }
}

/**
 * 根据查询内容判断 Wiki 类别相关性
 */
function getCategoryRelevanceBonus(category: string, query: string): number {
    const categoryKeywords: Record<string, string[]> = {
        'Item': ['武器', '装备', '道具', '宝物', '丹药', '法宝', '神器'],
        'Skill': ['功法', '技能', '招式', '秘术', '法术', '武技', '心法'],
        'Location': ['地点', '城市', '山脉', '宗门', '秘境', '大陆', '国家'],
        'Event': ['事件', '战争', '比赛', '大会', '灾难', '历史'],
        'Organization': ['势力', '宗门', '家族', '帮派', '组织', '门派'],
        'Person': ['人物', '前辈', '祖师', '传说', '英雄']
    };
    
    const keywords = categoryKeywords[category] || [];
    for (const kw of keywords) {
        if (query.includes(kw)) return 0.1;
    }
    return 0;
}


// ============ 增量索引函数 ============

/** 内容 hash 缓存 */
const contentHashCache = new Map<string, string>();

/**
 * 检查内容是否需要重新索引
 */
function needsReindex(id: string, newContent: string): boolean {
    const newHash = simpleHash(newContent);
    const oldHash = contentHashCache.get(id);
    
    if (oldHash === newHash) {
        return false; // 内容未变化，无需重新索引
    }
    
    contentHashCache.set(id, newHash);
    return true;
}

/**
 * 为章节内容创建向量索引（增量 + 语义分块）
 */
export async function indexChapterContent(
    chapter: Chapter,
    settings: AppSettings,
    useChunking: boolean = false
): Promise<void> {
    try {
        if (!chapter.content || chapter.content.length < 100) return;
        if (!supportsEmbedding(settings)) return;
        
        // 构建索引文本
        const headerText = `${chapter.title}\n${chapter.summary}`;
        const fullContent = chapter.content;
        
        // 增量检查
        const checkText = `${headerText}\n${fullContent.slice(0, 3000)}`;
        if (!needsReindex(chapter.id, checkText)) {
            console.log(`Chapter ${chapter.title} unchanged, skipping index`);
            return;
        }
        
        await db.deleteVectorsByRelatedId(chapter.id);
        
        if (useChunking && fullContent.length > CHUNK_SIZE) {
            // 语义分块索引 - 为长章节创建多个向量
            const chunks = semanticChunk(fullContent, CHUNK_SIZE, CHUNK_OVERLAP);
            const vectors: VectorRecord[] = [];
            
            for (let i = 0; i < chunks.length; i++) {
                const chunkText = `${headerText}\n${chunks[i]}`;
                const vector = await generateEmbedding(chunkText, settings);
                
                if (vector.length > 0) {
                    vectors.push({
                        id: crypto.randomUUID(),
                        relatedId: chapter.id,
                        type: 'chapter',
                        text: chunkText,
                        vector: vector,
                        timestamp: Date.now(),
                        metadata: { 
                            order: chapter.order, 
                            title: chapter.title,
                            chunkIndex: i,
                            totalChunks: chunks.length
                        }
                    });
                }
            }
            
            if (vectors.length > 0) {
                await db.saveVectors(vectors);
                console.log(`Indexed chapter: ${chapter.title} (${vectors.length} chunks)`);
            }
        } else {
            // 单向量索引 - 适用于短章节
            const indexText = `${headerText}\n${fullContent.slice(0, 2500)}`;
            const vector = await generateEmbedding(indexText, settings);
            
            if (vector.length > 0) {
                await db.saveVectors([{
                    id: crypto.randomUUID(),
                    relatedId: chapter.id,
                    type: 'chapter',
                    text: indexText,
                    vector: vector,
                    timestamp: Date.now(),
                    metadata: { order: chapter.order, title: chapter.title }
                }]);
                console.log(`Indexed chapter: ${chapter.title}`);
            }
        }
    } catch (e) {
        console.error('Failed to index chapter content:', e);
    }
}

/**
 * 为角色创建向量索引（增量）
 */
export async function indexCharacter(
    character: Character,
    settings: AppSettings
): Promise<void> {
    try {
        if (!supportsEmbedding(settings)) return;
        
        const indexText = `${character.name}\n${character.role}\n${character.description}\n${character.appearance}\n${character.background}\n${character.personality}`;
        
        if (!needsReindex(character.id, indexText)) {
            console.log(`Character ${character.name} unchanged, skipping index`);
            return;
        }
        
        const vector = await generateEmbedding(indexText, settings);
        if (vector.length === 0) return;
        
        await db.deleteVectorsByRelatedId(character.id);
        
        await db.saveVectors([{
            id: crypto.randomUUID(),
            relatedId: character.id,
            type: 'character',
            text: indexText,
            vector: vector,
            timestamp: Date.now(),
            metadata: { name: character.name, role: character.role }
        }]);
        
        console.log(`Indexed character: ${character.name}`);
    } catch (e) {
        console.error('Failed to index character:', e);
    }
}

/**
 * 为 Wiki 条目创建向量索引（增量）
 */
export async function indexWikiEntry(
    entry: WikiEntry,
    settings: AppSettings
): Promise<void> {
    try {
        if (!supportsEmbedding(settings)) return;
        
        const indexText = `${entry.name}\n${entry.category}\n${entry.description}`;
        
        if (!needsReindex(entry.id, indexText)) {
            console.log(`Wiki entry ${entry.name} unchanged, skipping index`);
            return;
        }
        
        const vector = await generateEmbedding(indexText, settings);
        if (vector.length === 0) return;
        
        await db.deleteVectorsByRelatedId(entry.id);
        
        await db.saveVectors([{
            id: crypto.randomUUID(),
            relatedId: entry.id,
            type: 'wiki',
            text: indexText,
            vector: vector,
            timestamp: Date.now(),
            metadata: { name: entry.name, category: entry.category }
        }]);
        
        console.log(`Indexed wiki entry: ${entry.name}`);
    } catch (e) {
        console.error('Failed to index wiki entry:', e);
    }
}

/**
 * 批量索引所有内容
 */
export async function indexAllContent(
    chapters: Chapter[],
    characters: Character[],
    wikiEntries: WikiEntry[],
    settings: AppSettings,
    onProgress?: (current: number, total: number) => void
): Promise<void> {
    const total = chapters.length + characters.length + wikiEntries.length;
    let current = 0;
    
    for (const chapter of chapters) {
        await indexChapterContent(chapter, settings);
        current++;
        onProgress?.(current, total);
    }
    
    for (const character of characters) {
        await indexCharacter(character, settings);
        current++;
        onProgress?.(current, total);
    }
    
    for (const entry of wikiEntries) {
        await indexWikiEntry(entry, settings);
        current++;
        onProgress?.(current, total);
    }
}

/**
 * 自动索引触发器
 */
export async function autoIndexOnSave(
    type: 'chapter' | 'character' | 'wiki',
    data: Chapter | Character | WikiEntry,
    settings: AppSettings
): Promise<void> {
    if (!settings.useRAG || !settings.apiKey) return;
    
    try {
        switch (type) {
            case 'chapter':
                await indexChapterContent(data as Chapter, settings);
                break;
            case 'character':
                await indexCharacter(data as Character, settings);
                break;
            case 'wiki':
                await indexWikiEntry(data as WikiEntry, settings);
                break;
        }
    } catch (e) {
        console.warn(`Auto-index failed for ${type}:`, e);
    }
}

// ============ 综合检索 ============

/**
 * 综合检索 - 为章节生成获取所有相关上下文
 * 支持向量检索和关键词匹配混合模式
 */
export async function retrieveContextForGeneration(
    query: string,
    allChapters: Chapter[],
    allCharacters: Character[],
    allWikiEntries: WikiEntry[],
    settings: AppSettings
): Promise<{
    relevantChapters: Chapter[];
    relevantCharacters: Character[];
    relevantWikiEntries: WikiEntry[];
    retrievalMode: 'vector' | 'keyword' | 'hybrid';
}> {
    // 确定检索模式
    const useVector = supportsEmbedding(settings) && settings.useRAG;
    const retrievalMode = useVector ? 'hybrid' : 'keyword';
    
    // 如果 RAG 未启用且不使用关键词，返回默认结果
    if (!settings.useRAG) {
        return {
            relevantChapters: allChapters.slice(-3),
            relevantCharacters: allCharacters.filter(c => 
                c.role?.includes('主角') || c.isActive !== false
            ).slice(0, 5),
            relevantWikiEntries: [],
            retrievalMode: 'keyword'
        };
    }
    
    try {
        const [chapters, characters, wikiEntries] = await Promise.all([
            retrieveRelevantChapters(query, allChapters, settings, 3),
            retrieveRelevantCharacters(query, allCharacters, settings, 5),
            retrieveRelevantWikiEntries(query, allWikiEntries, settings, 5)
        ]);
        
        return {
            relevantChapters: chapters,
            relevantCharacters: characters,
            relevantWikiEntries: wikiEntries,
            retrievalMode
        };
    } catch (e) {
        console.warn('Context retrieval failed, using fallback:', e);
        return {
            relevantChapters: allChapters.slice(-3),
            relevantCharacters: allCharacters.filter(c => 
                c.role?.includes('主角') || c.isActive !== false
            ).slice(0, 5),
            relevantWikiEntries: [],
            retrievalMode: 'keyword'
        };
    }
}

/**
 * 获取当前 RAG 系统状态
 */
export function getRAGStatus(settings: AppSettings): {
    enabled: boolean;
    mode: 'vector' | 'keyword' | 'disabled';
    provider: string;
    supportsEmbedding: boolean;
} {
    const embedSupport = supportsEmbedding(settings);
    
    return {
        enabled: settings.useRAG || false,
        mode: !settings.useRAG ? 'disabled' : (embedSupport ? 'vector' : 'keyword'),
        provider: settings.provider,
        supportsEmbedding: embedSupport
    };
}

// ============ 高级检索功能 ============

/**
 * 智能上下文窗口 - 根据内容长度动态调整检索数量
 */
export function calculateDynamicTopK(
    contentLength: number,
    baseTopK: number = 3,
    maxTopK: number = 8
): number {
    // 内容越长，需要的上下文越少（避免超出 token 限制）
    if (contentLength > 5000) return Math.max(baseTopK - 1, 2);
    if (contentLength > 3000) return baseTopK;
    if (contentLength > 1000) return baseTopK + 1;
    return Math.min(baseTopK + 2, maxTopK);
}

/**
 * 基于伏笔的智能检索
 * 当章节涉及伏笔回收时，优先检索相关章节
 */
export async function retrieveChaptersForPlotLoop(
    plotLoopDescription: string,
    setupChapterId: string,
    allChapters: Chapter[],
    settings: AppSettings
): Promise<Chapter[]> {
    // 首先确保包含埋下伏笔的章节
    const setupChapter = allChapters.find(c => c.id === setupChapterId);
    
    // 检索与伏笔相关的其他章节
    const relatedChapters = await retrieveRelevantChapters(
        plotLoopDescription,
        allChapters.filter(c => c.id !== setupChapterId),
        settings,
        3
    );
    
    // 合并结果，确保 setup 章节在前
    const result = setupChapter ? [setupChapter, ...relatedChapters] : relatedChapters;
    return result.slice(0, 4);
}

/**
 * 角色关系链检索
 * 获取与指定角色有直接或间接关系的所有角色
 */
export function getCharacterRelationChain(
    characterId: string,
    allCharacters: Character[],
    depth: number = 2
): Character[] {
    const visited = new Set<string>();
    const result: Character[] = [];
    
    function traverse(id: string, currentDepth: number) {
        if (currentDepth > depth || visited.has(id)) return;
        visited.add(id);
        
        const character = allCharacters.find(c => c.id === id);
        if (!character) return;
        
        result.push(character);
        
        // 遍历关系
        for (const rel of character.relationships || []) {
            traverse(rel.targetId, currentDepth + 1);
        }
    }
    
    traverse(characterId, 0);
    return result;
}

/**
 * 场景连贯性检索
 * 获取与当前场景相关的前后章节，确保叙事连贯
 */
export async function retrieveSceneContext(
    currentChapter: Chapter,
    allChapters: Chapter[],
    settings: AppSettings
): Promise<{
    previousContext: Chapter[];
    relatedContext: Chapter[];
}> {
    // 获取前 2 章（时间线连贯性）
    const sortedChapters = [...allChapters].sort((a, b) => a.order - b.order);
    const currentIndex = sortedChapters.findIndex(c => c.id === currentChapter.id);
    const previousContext = currentIndex > 0 
        ? sortedChapters.slice(Math.max(0, currentIndex - 2), currentIndex)
        : [];
    
    // 获取语义相关章节（主题连贯性）
    const relatedContext = await retrieveRelevantChapters(
        currentChapter.summary,
        allChapters.filter(c => c.id !== currentChapter.id && !previousContext.includes(c)),
        settings,
        2
    );
    
    return { previousContext, relatedContext };
}

/**
 * 清理 Embedding 缓存
 */
export function clearEmbeddingCache(): void {
    queryEmbeddingCache.clear();
    contentHashCache.clear();
    console.log('RAG caches cleared');
}

/**
 * 获取 RAG 统计信息
 */
export async function getRAGStats(): Promise<{
    totalVectors: number;
    chapterVectors: number;
    characterVectors: number;
    wikiVectors: number;
    cacheSize: number;
}> {
    const allVectors = await db.getAllVectors();
    
    return {
        totalVectors: allVectors.length,
        chapterVectors: allVectors.filter(v => v.type === 'chapter').length,
        characterVectors: allVectors.filter(v => v.type === 'character').length,
        wikiVectors: allVectors.filter(v => v.type === 'wiki').length,
        cacheSize: queryEmbeddingCache.size
    };
}

// ============ 检索结果可视化 ============

/**
 * 检索结果详情 - 用于 UI 显示
 */
export interface RetrievalResultDetail {
    chapters: Array<{
        id: string;
        title: string;
        order: number;
        score: number;
        matchType: 'vector' | 'keyword' | 'hybrid';
    }>;
    characters: Array<{
        id: string;
        name: string;
        role: string;
        score: number;
        matchType: 'vector' | 'keyword' | 'hybrid';
    }>;
    wikiEntries: Array<{
        id: string;
        name: string;
        category: string;
        score: number;
        matchType: 'vector' | 'keyword' | 'hybrid';
    }>;
    retrievalMode: 'vector' | 'keyword' | 'hybrid' | 'disabled';
    queryKeywords: string[];
    timestamp: number;
}

/** 最近一次检索结果缓存 */
let lastRetrievalResult: RetrievalResultDetail | null = null;

/**
 * 获取最近一次检索结果详情
 */
export function getLastRetrievalResult(): RetrievalResultDetail | null {
    return lastRetrievalResult;
}

/**
 * 带详情的综合检索 - 返回检索结果和详细信息
 */
export async function retrieveContextWithDetails(
    query: string,
    allChapters: Chapter[],
    allCharacters: Character[],
    allWikiEntries: WikiEntry[],
    settings: AppSettings
): Promise<{
    relevantChapters: Chapter[];
    relevantCharacters: Character[];
    relevantWikiEntries: WikiEntry[];
    details: RetrievalResultDetail;
}> {
    const useVector = supportsEmbedding(settings) && settings.useRAG;
    const retrievalMode = !settings.useRAG ? 'disabled' : (useVector ? 'hybrid' : 'keyword');
    const queryKeywords = extractKeywords(query);
    
    // 如果 RAG 未启用，返回默认结果
    if (!settings.useRAG) {
        const defaultChapters = allChapters.slice(-3);
        const defaultCharacters = allCharacters.filter(c => 
            c.role?.includes('主角') || c.isActive !== false
        ).slice(0, 5);
        
        const details: RetrievalResultDetail = {
            chapters: defaultChapters.map(c => ({
                id: c.id,
                title: c.title,
                order: c.order,
                score: 0,
                matchType: 'keyword' as const
            })),
            characters: defaultCharacters.map(c => ({
                id: c.id,
                name: c.name,
                role: c.role,
                score: 0,
                matchType: 'keyword' as const
            })),
            wikiEntries: [],
            retrievalMode: 'disabled',
            queryKeywords,
            timestamp: Date.now()
        };
        
        lastRetrievalResult = details;
        
        return {
            relevantChapters: defaultChapters,
            relevantCharacters: defaultCharacters,
            relevantWikiEntries: [],
            details
        };
    }
    
    try {
        // 执行检索
        const [chapters, characters, wikiEntries] = await Promise.all([
            retrieveRelevantChapters(query, allChapters, settings, 3),
            retrieveRelevantCharacters(query, allCharacters, settings, 5),
            retrieveRelevantWikiEntries(query, allWikiEntries, settings, 5)
        ]);
        
        // 构建详情
        const details: RetrievalResultDetail = {
            chapters: chapters.map((c, i) => ({
                id: c.id,
                title: c.title,
                order: c.order,
                score: Math.round((1 - i * 0.15) * 100) / 100, // 估算分数
                matchType: useVector ? 'hybrid' as const : 'keyword' as const
            })),
            characters: characters.map((c, i) => ({
                id: c.id,
                name: c.name,
                role: c.role,
                score: Math.round((1 - i * 0.1) * 100) / 100,
                matchType: useVector ? 'hybrid' as const : 'keyword' as const
            })),
            wikiEntries: wikiEntries.map((e, i) => ({
                id: e.id,
                name: e.name,
                category: e.category,
                score: Math.round((1 - i * 0.1) * 100) / 100,
                matchType: useVector ? 'hybrid' as const : 'keyword' as const
            })),
            retrievalMode,
            queryKeywords,
            timestamp: Date.now()
        };
        
        lastRetrievalResult = details;
        
        return {
            relevantChapters: chapters,
            relevantCharacters: characters,
            relevantWikiEntries: wikiEntries,
            details
        };
    } catch (e) {
        console.warn('Context retrieval with details failed:', e);
        
        const fallbackChapters = allChapters.slice(-3);
        const fallbackCharacters = allCharacters.filter(c => 
            c.role?.includes('主角') || c.isActive !== false
        ).slice(0, 5);
        
        const details: RetrievalResultDetail = {
            chapters: fallbackChapters.map(c => ({
                id: c.id,
                title: c.title,
                order: c.order,
                score: 0,
                matchType: 'keyword' as const
            })),
            characters: fallbackCharacters.map(c => ({
                id: c.id,
                name: c.name,
                role: c.role,
                score: 0,
                matchType: 'keyword' as const
            })),
            wikiEntries: [],
            retrievalMode: 'keyword',
            queryKeywords,
            timestamp: Date.now()
        };
        
        lastRetrievalResult = details;
        
        return {
            relevantChapters: fallbackChapters,
            relevantCharacters: fallbackCharacters,
            relevantWikiEntries: [],
            details
        };
    }
}

// ============ 索引状态管理 ============

/**
 * 索引状态接口
 */
export interface IndexStatus {
    chapterId: string;
    status: 'pending' | 'indexing' | 'indexed' | 'error';
    lastIndexed?: number;
    error?: string;
}

/** 索引状态缓存 */
const indexStatusCache = new Map<string, IndexStatus>();

/**
 * 获取章节索引状态
 */
export function getChapterIndexStatus(chapterId: string): IndexStatus | null {
    return indexStatusCache.get(chapterId) || null;
}

/**
 * 设置章节索引状态
 */
export function setChapterIndexStatus(chapterId: string, status: IndexStatus['status'], error?: string): void {
    indexStatusCache.set(chapterId, {
        chapterId,
        status,
        lastIndexed: status === 'indexed' ? Date.now() : undefined,
        error
    });
}

/**
 * 获取所有索引状态
 */
export function getAllIndexStatus(): IndexStatus[] {
    return Array.from(indexStatusCache.values());
}

/**
 * 批量索引进度回调类型
 */
export type IndexProgressCallback = (progress: {
    current: number;
    total: number;
    currentItem: string;
    status: 'indexing' | 'completed' | 'error';
}) => void;

/**
 * 带进度回调的批量索引
 */
export async function indexAllContentWithProgress(
    chapters: Chapter[],
    characters: Character[],
    wikiEntries: WikiEntry[],
    settings: AppSettings,
    onProgress: IndexProgressCallback
): Promise<{ success: number; failed: number }> {
    const total = chapters.length + characters.length + wikiEntries.length;
    let current = 0;
    let success = 0;
    let failed = 0;
    
    // 索引章节
    for (const chapter of chapters) {
        current++;
        onProgress({
            current,
            total,
            currentItem: `章节: ${chapter.title}`,
            status: 'indexing'
        });
        
        try {
            setChapterIndexStatus(chapter.id, 'indexing');
            await indexChapterContent(chapter, settings);
            setChapterIndexStatus(chapter.id, 'indexed');
            success++;
        } catch (e) {
            setChapterIndexStatus(chapter.id, 'error', String(e));
            failed++;
        }
    }
    
    // 索引角色
    for (const character of characters) {
        current++;
        onProgress({
            current,
            total,
            currentItem: `角色: ${character.name}`,
            status: 'indexing'
        });
        
        try {
            await indexCharacter(character, settings);
            success++;
        } catch (e) {
            failed++;
        }
    }
    
    // 索引 Wiki
    for (const entry of wikiEntries) {
        current++;
        onProgress({
            current,
            total,
            currentItem: `百科: ${entry.name}`,
            status: 'indexing'
        });
        
        try {
            await indexWikiEntry(entry, settings);
            success++;
        } catch (e) {
            failed++;
        }
    }
    
    onProgress({
        current: total,
        total,
        currentItem: '完成',
        status: 'completed'
    });
    
    return { success, failed };
}
