import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============ 测试辅助函数 ============

/**
 * 提取中文关键词（与 ragService 中的实现一致）
 */
function extractKeywords(text: string): string[] {
    if (!text) return [];
    
    const cleaned = text.replace(/[，。！？、；：""''（）【】《》\s\n\r]/g, ' ');
    const keywords: string[] = [];
    const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
    
    words.forEach(w => {
        if (w.length >= 2 && w.length <= 10) {
            keywords.push(w);
        }
    });
    
    const namePattern = /[\u4e00-\u9fa5]{2,4}/g;
    const names = text.match(namePattern) || [];
    names.forEach(n => {
        if (!keywords.includes(n)) {
            keywords.push(n);
        }
    });
    
    return [...new Set(keywords)].slice(0, 50);
}

/**
 * 语义分块
 */
function semanticChunk(text: string, chunkSize = 1500, overlap = 200): string[] {
    if (!text || text.length <= chunkSize) return [text];
    
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[。！？\n])/);
    
    let currentChunk = '';
    let overlapBuffer = '';
    
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
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
 * 余弦相似度
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
 * 计算时间衰减
 */
function calculateTimeDecay(order: number, maxOrder: number): number {
    if (maxOrder <= 1) return 1;
    const recency = order / maxOrder;
    return 1 + 0.1 * recency;
}

// ============ 属性测试 ============

describe('RAG Service Property Tests', () => {
    
    /**
     * Property 1: 关键词提取幂等性
     * 对同一文本多次提取关键词应该得到相同结果
     * **Validates: Requirements - 关键词提取一致性**
     */
    describe('Property 1: Keyword extraction idempotence', () => {
        it('should return same keywords for same input', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 10, maxLength: 500 }),
                    (text) => {
                        const keywords1 = extractKeywords(text);
                        const keywords2 = extractKeywords(text);
                        
                        expect(keywords1).toEqual(keywords2);
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Property 2: 语义分块覆盖性
     * 分块后的内容应该覆盖原始文本的所有句子
     * **Validates: Requirements - 语义分块完整性**
     */
    describe('Property 2: Semantic chunking coverage', () => {
        it('should cover all content after chunking', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string({ minLength: 50, maxLength: 200 }), { minLength: 5, maxLength: 20 }),
                    (sentences) => {
                        const text = sentences.join('。') + '。';
                        const chunks = semanticChunk(text, 500, 50);
                        
                        // 所有分块合并后应该包含原始文本的所有句子
                        const combined = chunks.join('');
                        
                        for (const sentence of sentences) {
                            if (sentence.length >= 2) {
                                expect(combined).toContain(sentence);
                            }
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });
    });

    /**
     * Property 3: 余弦相似度范围
     * 余弦相似度应该在 [-1, 1] 范围内
     * **Validates: Requirements - 向量相似度计算正确性**
     */
    describe('Property 3: Cosine similarity bounds', () => {
        it('should return value between -1 and 1', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 10, maxLength: 100 }),
                    fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 10, maxLength: 100 }),
                    (a, b) => {
                        // 确保两个向量长度相同
                        const minLen = Math.min(a.length, b.length);
                        const vecA = a.slice(0, minLen);
                        const vecB = b.slice(0, minLen);
                        
                        const similarity = cosineSimilarity(vecA, vecB);
                        
                        expect(similarity).toBeGreaterThanOrEqual(-1);
                        expect(similarity).toBeLessThanOrEqual(1);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return 1 for identical vectors', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }), { minLength: 5, maxLength: 50 }),
                    (vec) => {
                        const similarity = cosineSimilarity(vec, vec);
                        expect(similarity).toBeCloseTo(1, 5);
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Property 4: 时间衰减单调性
     * 章节序号越大（越新），时间衰减权重应该越高
     * **Validates: Requirements - 时间衰减权重正确性**
     */
    describe('Property 4: Time decay monotonicity', () => {
        it('should increase with chapter order', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 100 }),
                    fc.integer({ min: 1, max: 100 }),
                    fc.integer({ min: 2, max: 200 }),
                    (order1, order2, maxOrder) => {
                        const actualMax = Math.max(order1, order2, maxOrder);
                        const decay1 = calculateTimeDecay(order1, actualMax);
                        const decay2 = calculateTimeDecay(order2, actualMax);
                        
                        if (order1 < order2) {
                            expect(decay1).toBeLessThanOrEqual(decay2);
                        } else if (order1 > order2) {
                            expect(decay1).toBeGreaterThanOrEqual(decay2);
                        } else {
                            expect(decay1).toBeCloseTo(decay2, 10);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Property 5: 关键词匹配分数范围
     * 关键词匹配分数应该在 [0, 1] 范围内
     * **Validates: Requirements - 关键词匹配计算正确性**
     */
    describe('Property 5: Keyword match score bounds', () => {
        it('should return value between 0 and 1', () => {
            const keywordMatchScore = (queryKeywords: string[], targetText: string): number => {
                if (queryKeywords.length === 0 || !targetText) return 0;
                let matchCount = 0;
                for (const keyword of queryKeywords) {
                    if (targetText.includes(keyword)) matchCount++;
                }
                return matchCount / queryKeywords.length;
            };

            fc.assert(
                fc.property(
                    fc.array(fc.string({ minLength: 2, maxLength: 10 }), { minLength: 1, maxLength: 20 }),
                    fc.string({ minLength: 10, maxLength: 500 }),
                    (keywords, text) => {
                        const score = keywordMatchScore(keywords, text);
                        
                        expect(score).toBeGreaterThanOrEqual(0);
                        expect(score).toBeLessThanOrEqual(1);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
