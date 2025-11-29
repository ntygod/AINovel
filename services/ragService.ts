// RAG (Retrieval-Augmented Generation) 检索增强生成服务
import { Chapter, Character, WikiEntry, VectorRecord, AppSettings } from '../types';
import { db } from './db';
import { GoogleGenAI } from "@google/genai";
import { setDefaultBaseUrls } from "@google/genai";

/**
 * 余弦相似度计算
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * 生成文本的向量嵌入
 */
export async function generateEmbedding(text: string, settings: AppSettings): Promise<number[]> {
    if (!text || !settings.apiKey) return [];
    
    try {
        // 限制文本长度
        const truncatedText = text.slice(0, 10000);
        
        if (settings.provider === 'google') {
            // Google Gemini Embedding
            const options: any = { apiKey: settings.apiKey };
            if (settings.baseUrl) {
                setDefaultBaseUrls({ geminiUrl: settings.baseUrl });
            }
            const ai = new GoogleGenAI(options);
            
            const model = "text-embedding-004";
            const result = await ai.models.embedContent({
                model,
                content: truncatedText
            });
            
            return result.embedding.values || [];
        } 
        else if (settings.provider === 'openai') {
            // OpenAI Embedding API
            const baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
            const response = await fetch(`${baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify({
                    model: 'text-embedding-3-small', // 或 text-embedding-3-large
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
        else if (settings.provider === 'deepseek') {
            // DeepSeek 目前不提供官方 Embedding API
            // 可以使用 OpenAI 兼容的本地模型或第三方服务
            console.warn('DeepSeek does not provide official embedding API. Consider using a local embedding model.');
            return [];
        }
        else if (settings.provider === 'custom') {
            // 自定义提供商 - 尝试 OpenAI 兼容格式
            if (!settings.baseUrl) {
                console.warn('Custom provider requires baseUrl for embedding');
                return [];
            }
            
            try {
                const response = await fetch(`${settings.baseUrl}/embeddings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'text-embedding', // 通用模型名
                        input: truncatedText,
                        encoding_format: 'float'
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Custom embedding API error: ${response.statusText}`);
                }
                
                const data = await response.json();
                return data.data[0].embedding || [];
            } catch (e) {
                console.warn('Custom provider embedding failed, falling back to no RAG:', e);
                return [];
            }
        }
        
        return [];
    } catch (e) {
        console.error('Failed to generate embedding:', e);
        return [];
    }
}

/**
 * 检索相关章节（基于语义相似度）
 */
export async function retrieveRelevantChapters(
    query: string,
    allChapters: Chapter[],
    settings: AppSettings,
    topK: number = 3,
    excludeChapterId?: string
): Promise<Chapter[]> {
    try {
        // 1. 生成查询向量
        const queryVector = await generateEmbedding(query, settings);
        if (queryVector.length === 0) {
            // 降级：返回最近的章节
            return allChapters
                .filter(c => c.id !== excludeChapterId)
                .slice(-topK);
        }
        
        // 2. 从数据库加载所有章节向量
        const allVectors = await db.getAllVectors();
        const chapterVectors = allVectors.filter(v => 
            v.type === 'chapter' && v.relatedId !== excludeChapterId
        );
        
        if (chapterVectors.length === 0) {
            // 降级：返回最近的章节
            return allChapters
                .filter(c => c.id !== excludeChapterId)
                .slice(-topK);
        }
        
        // 3. 计算余弦相似度
        const similarities = chapterVectors.map(v => ({
            chapterId: v.relatedId,
            similarity: cosineSimilarity(queryVector, v.vector)
        }));
        
        // 4. 排序并返回 top K
        const topChapterIds = similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK)
            .map(s => s.chapterId);
        
        const relevantChapters = allChapters.filter(c => topChapterIds.includes(c.id));
        
        // 按原始顺序排序
        relevantChapters.sort((a, b) => a.order - b.order);
        
        return relevantChapters;
    } catch (e) {
        console.error('Failed to retrieve relevant chapters:', e);
        // 降级：返回最近的章节
        return allChapters
            .filter(c => c.id !== excludeChapterId)
            .slice(-topK);
    }
}

/**
 * 检索相关角色（基于语义相似度）
 */
export async function retrieveRelevantCharacters(
    query: string,
    allCharacters: Character[],
    settings: AppSettings,
    topK: number = 5
): Promise<Character[]> {
    try {
        // 1. 生成查询向量
        const queryVector = await generateEmbedding(query, settings);
        if (queryVector.length === 0) {
            // 降级：返回前 K 个角色
            return allCharacters.slice(0, topK);
        }
        
        // 2. 从数据库加载所有角色向量
        const allVectors = await db.getAllVectors();
        const characterVectors = allVectors.filter(v => v.type === 'character');
        
        if (characterVectors.length === 0) {
            // 降级：返回前 K 个角色
            return allCharacters.slice(0, topK);
        }
        
        // 3. 计算余弦相似度
        const similarities = characterVectors.map(v => ({
            characterId: v.relatedId,
            similarity: cosineSimilarity(queryVector, v.vector)
        }));
        
        // 4. 排序并返回 top K
        const topCharacterIds = similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK)
            .map(s => s.characterId);
        
        return allCharacters.filter(c => topCharacterIds.includes(c.id));
    } catch (e) {
        console.error('Failed to retrieve relevant characters:', e);
        // 降级：返回前 K 个角色
        return allCharacters.slice(0, topK);
    }
}

/**
 * 检索相关 Wiki 条目
 */
export async function retrieveRelevantWikiEntries(
    query: string,
    allEntries: WikiEntry[],
    settings: AppSettings,
    topK: number = 5
): Promise<WikiEntry[]> {
    try {
        // 1. 生成查询向量
        const queryVector = await generateEmbedding(query, settings);
        if (queryVector.length === 0) {
            // 降级：返回前 K 个条目
            return allEntries.slice(0, topK);
        }
        
        // 2. 从数据库加载所有 Wiki 向量
        const allVectors = await db.getAllVectors();
        const wikiVectors = allVectors.filter(v => v.type === 'wiki');
        
        if (wikiVectors.length === 0) {
            // 降级：返回前 K 个条目
            return allEntries.slice(0, topK);
        }
        
        // 3. 计算余弦相似度
        const similarities = wikiVectors.map(v => ({
            entryId: v.relatedId,
            similarity: cosineSimilarity(queryVector, v.vector)
        }));
        
        // 4. 排序并返回 top K
        const topEntryIds = similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK)
            .map(s => s.entryId);
        
        return allEntries.filter(e => topEntryIds.includes(e.id));
    } catch (e) {
        console.error('Failed to retrieve relevant wiki entries:', e);
        // 降级：返回前 K 个条目
        return allEntries.slice(0, topK);
    }
}

/**
 * 为章节内容创建向量索引
 */
export async function indexChapterContent(
    chapter: Chapter,
    settings: AppSettings
): Promise<void> {
    try {
        if (!chapter.content || chapter.content.length < 100) return;
        
        // 使用章节摘要 + 部分内容作为索引文本
        const indexText = `${chapter.title}\n${chapter.summary}\n${chapter.content.slice(0, 2000)}`;
        
        const vector = await generateEmbedding(indexText, settings);
        if (vector.length === 0) return;
        
        // 删除旧的向量
        await db.deleteVectorsByRelatedId(chapter.id);
        
        // 保存新向量
        await db.saveVectors([{
            id: crypto.randomUUID(),
            relatedId: chapter.id,
            type: 'chapter',
            text: indexText,
            vector: vector,
            timestamp: Date.now(),
            metadata: { order: chapter.order, title: chapter.title }
        }]);
    } catch (e) {
        console.error('Failed to index chapter content:', e);
    }
}

/**
 * 为角色创建向量索引
 */
export async function indexCharacter(
    character: Character,
    settings: AppSettings
): Promise<void> {
    try {
        // 使用角色的所有信息作为索引文本
        const indexText = `${character.name}\n${character.role}\n${character.description}\n${character.appearance}\n${character.background}\n${character.personality}`;
        
        const vector = await generateEmbedding(indexText, settings);
        if (vector.length === 0) return;
        
        // 删除旧的向量
        await db.deleteVectorsByRelatedId(character.id);
        
        // 保存新向量
        await db.saveVectors([{
            id: crypto.randomUUID(),
            relatedId: character.id,
            type: 'character',
            text: indexText,
            vector: vector,
            timestamp: Date.now(),
            metadata: { name: character.name, role: character.role }
        }]);
    } catch (e) {
        console.error('Failed to index character:', e);
    }
}

/**
 * 为 Wiki 条目创建向量索引
 */
export async function indexWikiEntry(
    entry: WikiEntry,
    settings: AppSettings
): Promise<void> {
    try {
        const indexText = `${entry.name}\n${entry.category}\n${entry.description}`;
        
        const vector = await generateEmbedding(indexText, settings);
        if (vector.length === 0) return;
        
        // 删除旧的向量
        await db.deleteVectorsByRelatedId(entry.id);
        
        // 保存新向量
        await db.saveVectors([{
            id: crypto.randomUUID(),
            relatedId: entry.id,
            type: 'wiki',
            text: indexText,
            vector: vector,
            timestamp: Date.now(),
            metadata: { name: entry.name, category: entry.category }
        }]);
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
    
    // 索引章节
    for (const chapter of chapters) {
        await indexChapterContent(chapter, settings);
        current++;
        onProgress?.(current, total);
    }
    
    // 索引角色
    for (const character of characters) {
        await indexCharacter(character, settings);
        current++;
        onProgress?.(current, total);
    }
    
    // 索引 Wiki 条目
    for (const entry of wikiEntries) {
        await indexWikiEntry(entry, settings);
        current++;
        onProgress?.(current, total);
    }
}
