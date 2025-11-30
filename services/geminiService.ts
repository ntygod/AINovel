import { GoogleGenAI, Type, Modality, setDefaultBaseUrls } from "@google/genai";
import { 
  NovelConfig, WorldStructure, AppSettings, Faction, MapRegion, Character, Chapter, 
  WikiEntry, VideoScene, VectorRecord, Volume, PlotLoop 
} from '../types';
import { db } from './db';
import { tokenCounter } from './tokenCounter';
import { retrieveRelevantChapters, retrieveRelevantCharacters } from './ragService';
import { 
  findPreviousChapter, 
  extractLastContent, 
  getChapterAncestors as getVolumeChapterAncestors,
  getVolumeProgress 
} from './volumeService';
import { buildLoopContextForPrompt } from './plotLoopService';

// --- Shared Utilities ---

export const stripHtml = (html: string) => {
   if (typeof document === 'undefined') return html; 
   const tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return tmp.textContent || tmp.innerText || "";
}

const getGoogleAI = (settings: AppSettings) => {
    // Falls back to empty string if not provided; error handling is done in caller
    const options: any = { apiKey: settings.apiKey || '' };
    if (settings.baseUrl) {
        // Set the default base URL for the Google GenAI client
        setDefaultBaseUrls({geminiUrl: settings.baseUrl});
    }
    console.log('GoogleGenAI options:', options);
    return new GoogleGenAI(options);
};

export interface OpenAIMessage { role: string; content: string; }

// Basic OpenAI Fetch Wrapper for DeepSeek / Custom / OpenAI
const callOpenAI = async (baseUrl: string, apiKey: string, model: string, messages: OpenAIMessage[], jsonMode = false) => {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const headers: any = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
    
    const body: any = {
        model,
        messages,
        temperature: 0.7,
    };
    
    if (jsonMode) {
        body.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI/DeepSeek API Error: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
}

const ensureString = (val: any) => typeof val === 'string' ? val : '';

export const buildNovelContext = (config: NovelConfig) => {
  return `
    小说标题: ${config.title}
    类型: ${config.genre}
    世界设定: ${config.worldSetting}
    主角类型: ${config.protagonistArchetype}
    金手指/特殊能力: ${config.goldenFinger}
    主线剧情: ${config.mainPlot}
    叙事基调: ${config.narrativeTone}
    标签: ${config.tags.join(', ')}
    
    注意:
    - 严格按照以上设定进行创作
    - 保持叙事风格的一致性
    - 在生成新内容时要考虑到标签所代表的元素
  `;
};

export const getChapterAncestors = (chapterId: string, allChapters: Chapter[]): Chapter[] => {
    const ancestors: Chapter[] = [];
    let current = allChapters.find(c => c.id === chapterId);
    while (current && current.parentId) {
        const parent = allChapters.find(c => c.id === current?.parentId);
        if (parent) {
            ancestors.unshift(parent);
            current = parent;
        } else {
            break;
        }
    }
    return ancestors;
};

// --- Generators ---

export const generateProjectIdea = async (input: string, settings: AppSettings): Promise<Partial<NovelConfig>> => {
    const prompt = input 
        ? `基于创意 "${input}"，完善一部网文小说的设定。`
        : `随机构思一部当前热门题材的网文小说设定。`;
        
    const systemPrompt = `请返回 JSON 格式，包含: title, genre, worldSetting, protagonistArchetype, goldenFinger, mainPlot (100字左右), pacing, narrativeTone, tags (数组).`;

    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: `${systemPrompt}\n${prompt}`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        genre: { type: Type.STRING },
                        worldSetting: { type: Type.STRING },
                        protagonistArchetype: { type: Type.STRING },
                        goldenFinger: { type: Type.STRING },
                        mainPlot: { type: Type.STRING },
                        pacing: { type: Type.STRING },
                        narrativeTone: { type: Type.STRING },
                        tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } else {
        const res = await callOpenAI(
            settings.baseUrl || '', 
            settings.apiKey, 
            settings.model, 
            [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
            true
        );
        return JSON.parse(res);
    }
};

export const generateWorldStructure = async (config: NovelConfig, settings: AppSettings): Promise<WorldStructure> => {
    const context = buildNovelContext(config);
    const prompt = `基于以下小说设定，构建详细的世界观。返回 JSON 包含: worldView (详细世界观设定), centralConflict (核心矛盾), keyPlotPoints (3-5个关键剧情节点数组).`;
    
    if (settings.provider === 'google') {
         const ai = getGoogleAI(settings);
         const response = await ai.models.generateContent({
             model: settings.model,
             contents: `${context}\n${prompt}`,
             config: {
                 responseMimeType: 'application/json',
                 responseSchema: {
                     type: Type.OBJECT,
                     properties: {
                         worldView: { type: Type.STRING },
                         centralConflict: { type: Type.STRING },
                         keyPlotPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
                     }
                 }
             }
         });
         return JSON.parse(response.text || "{}");
    } else {
         const res = await callOpenAI(
            settings.baseUrl || '', 
            settings.apiKey, 
            settings.model, 
            [{ role: 'system', content: "Output JSON." }, { role: 'user', content: `${context}\n${prompt}` }],
            true
         );
         
         // 处理OpenAI格式的响应
         let parsedResponse;
         if (typeof res === 'string') {
             // 如果是普通字符串，直接解析
             parsedResponse = JSON.parse(res);
         } else {
             // 如果是完整的OpenAI响应对象（包含choices等字段）
             const responseObject = res as any;
             if (responseObject.choices && responseObject.choices[0] && responseObject.choices[0].message) {
                 // 提取content字段并解析
                 const content = responseObject.choices[0].message.content;
                 parsedResponse = JSON.parse(content);
             } else {
                 // 其他情况直接解析
                 parsedResponse = JSON.parse(JSON.stringify(res));
             }
         }

         // 确保返回的数据结构符合WorldStructure接口
         const worldStructure: WorldStructure = {
             worldView: '',
             centralConflict: '',
             keyPlotPoints: [],
             factions: [],
             wikiEntries: []
         };

         // 处理worldView字段
         if (typeof parsedResponse.worldView === 'string') {
             worldStructure.worldView = parsedResponse.worldView;
         } else if (typeof parsedResponse.worldView === 'object') {
             // 如果worldView是对象，将其转换为易读的格式
             const worldViewObj = parsedResponse.worldView;
             let formattedWorldView = '';
             
             // 遍历对象的所有键值对，将其转换为易读的文本格式
             for (const [key, value] of Object.entries(worldViewObj)) {
                 formattedWorldView += `## ${key}\n\n`;
                 
                 if (typeof value === 'string') {
                     formattedWorldView += `${value}\n\n`;
                 } else if (typeof value === 'object') {
                     // 如果值是对象，进一步处理其内容
                     for (const [subKey, subValue] of Object.entries(value)) {
                         formattedWorldView += `### ${subKey}\n\n`;
                         
                         if (typeof subValue === 'string') {
                             formattedWorldView += `${subValue}\n\n`;
                         } else if (Array.isArray(subValue)) {
                             // 如果是数组，逐项列出
                             subValue.forEach((item: any) => {
                                 if (typeof item === 'string') {
                                     formattedWorldView += `- ${item}\n`;
                                 } else if (typeof item === 'object') {
                                     formattedWorldView += `- ${JSON.stringify(item, null, 2)}\n`;
                                 } else {
                                     formattedWorldView += `- ${String(item)}\n`;
                                 }
                             });
                             formattedWorldView += '\n';
                         } else if (typeof subValue === 'object') {
                             // 如果是对象，转换为JSON字符串
                             formattedWorldView += `${JSON.stringify(subValue, null, 2)}\n\n`;
                         } else {
                             formattedWorldView += `${String(subValue)}\n\n`;
                         }
                     }
                 }
                 formattedWorldView += '\n';
             }
             
             worldStructure.worldView = formattedWorldView.trim();
         }

         // 处理centralConflict字段
         if (typeof parsedResponse.centralConflict === 'string') {
             worldStructure.centralConflict = parsedResponse.centralConflict;
         } else if (typeof parsedResponse.centralConflict === 'object') {
             // 如果centralConflict是对象，将其转换为易读的格式
             const conflictObj = parsedResponse.centralConflict;
             let formattedConflict = '';
             
             // 遍历对象的所有键值对
             for (const [key, value] of Object.entries(conflictObj)) {
                 formattedConflict += `## ${key}\n\n`;
                 
                 if (typeof value === 'string') {
                     formattedConflict += `${value}\n\n`;
                 } else if (Array.isArray(value)) {
                     // 如果是数组，逐项列出
                     value.forEach((item: any) => {
                         if (typeof item === 'string') {
                             formattedConflict += `- ${item}\n`;
                         } else {
                             formattedConflict += `- ${JSON.stringify(item, null, 2)}\n`;
                         }
                     });
                     formattedConflict += '\n';
                 } else if (typeof value === 'object') {
                     // 如果是对象，转换为JSON字符串
                     formattedConflict += `${JSON.stringify(value, null, 2)}\n\n`;
                 } else {
                     formattedConflict += `${String(value)}\n\n`;
                 }
             }
             
             worldStructure.centralConflict = formattedConflict.trim();
         }

         // 处理keyPlotPoints字段
         if (Array.isArray(parsedResponse.keyPlotPoints)) {
             // 如果是字符串数组，直接使用
             if (parsedResponse.keyPlotPoints.every((item: any) => typeof item === 'string')) {
                 worldStructure.keyPlotPoints = parsedResponse.keyPlotPoints;
             } else {
                 // 如果是对象数组，转换为字符串数组
                 worldStructure.keyPlotPoints = parsedResponse.keyPlotPoints.map((point: any) => {
                     if (typeof point === 'string') {
                         return point;
                     } else if (typeof point === 'object') {
                         // 如果对象有特定字段，组合成格式化的字符串
                         if (point.名称 && point.梗概) {
                             let formattedPoint = `${point.名称}: ${point.梗概}`;
                             // 如果还有其他字段，也添加进去
                             if (point.关键要素 && Array.isArray(point.关键要素)) {
                                 formattedPoint += `\n关键要素:\n${point.关键要素.map((elem: string) => `- ${elem}`).join('\n')}`;
                             }
                             return formattedPoint;
                         } else if (point.name && point.summary) {
                             return `${point.name}: ${point.summary}`;
                         } else {
                             // 其他情况转换为易读的JSON字符串
                             return JSON.stringify(point, null, 2);
                         }
                     } else {
                         return String(point);
                     }
                 });
             }
         }

         return worldStructure;
    }
};

export const generateFactions = async (config: NovelConfig, structure: WorldStructure, settings: AppSettings): Promise<{ factions: Faction[], regions: MapRegion[] }> => {
    const context = buildNovelContext(config);
    const prompt = `
      基于以下世界观，创建地理势力分布。
      ${context}
      世界观: ${structure.worldView}
      
      返回 JSON 对象:
      - regions: 4-6个区域 (name, type=['continent'|'island'|'archipelago'], x(0-100), y(0-100))
      - factions: 4-6个势力 (name, description, influence(1-10), color(hex), x(0-100), y(0-100))
    `;

    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        regions: {
                             type: Type.ARRAY,
                             items: {
                                 type: Type.OBJECT,
                                 properties: {
                                     name: { type: Type.STRING },
                                     type: { type: Type.STRING },
                                     x: { type: Type.NUMBER },
                                     y: { type: Type.NUMBER }
                                 },
                                 required: ["name", "type", "x", "y"]
                             }
                        },
                        factions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    influence: { type: Type.NUMBER },
                                    color: { type: Type.STRING },
                                    x: { type: Type.NUMBER },
                                    y: { type: Type.NUMBER }
                                },
                                required: ["name", "description", "influence", "color", "x", "y"]
                            }
                        }
                    },
                    required: ["regions", "factions"]
                }
            }
        });
        const raw = JSON.parse(response.text || "{}");
        const factions = (raw.factions || []).map((f: any) => ({ ...f, id: crypto.randomUUID() }));
        const regions = (raw.regions || []).map((r: any) => ({ ...r, id: crypto.randomUUID() }));
        return { factions, regions };
    } else {
        const res = await callOpenAI(
            settings.baseUrl || '',
            settings.apiKey,
            settings.model,
            [{role: 'user', content: prompt}],
            true
        );
        
        // 处理OpenAI格式的响应
        let parsedResponse;
        if (typeof res === 'string') {
            // 如果是普通字符串，直接解析
            parsedResponse = JSON.parse(res);
        } else {
            // 如果是完整的OpenAI响应对象（包含choices等字段）
            const responseObject = res as any;
            if (responseObject.choices && responseObject.choices[0] && responseObject.choices[0].message) {
                // 提取content字段并解析
                const content = responseObject.choices[0].message.content;
                parsedResponse = JSON.parse(content);
            } else {
                // 其他情况直接解析
                parsedResponse = JSON.parse(JSON.stringify(res));
            }
        }
        
        const factions = (parsedResponse.factions || []).map((f: any) => ({ 
            ...f, id: crypto.randomUUID(), 
            x: Number(f.x), y: Number(f.y), influence: Number(f.influence),
            color: f.color || '#000000'
        }));
        const regions = (parsedResponse.regions || []).map((r: any) => ({ 
            ...r, id: crypto.randomUUID(),
            x: Number(r.x), y: Number(r.y)
        }));
        return { factions, regions };
    }
};

export const generateCharacters = async (config: NovelConfig, settings: AppSettings, existing: Character[], structure: WorldStructure, count: number = 5): Promise<Character[]> => {
    const context = buildNovelContext(config);
    const prompt = `
        基于设定和现有角色，创作 ${count} 个新角色。
        ${context}
        现有角色: ${existing.map(c => c.name).join(', ')}
        
        返回 JSON 数组，每个角色包含: name, role, description, appearance, background, personality, relationships (数组: {targetName, relation}).
    `;

    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            role: { type: Type.STRING },
                            description: { type: Type.STRING },
                            appearance: { type: Type.STRING },
                            background: { type: Type.STRING },
                            personality: { type: Type.STRING },
                            relationships: { 
                                type: Type.ARRAY, 
                                items: { 
                                    type: Type.OBJECT,
                                    properties: { targetName: { type: Type.STRING }, relation: { type: Type.STRING } }
                                } 
                            }
                        }
                    }
                }
            }
        });
        const raw = JSON.parse(response.text || "[]");
        return raw.map((c: any) => ({
            ...c,
            id: crypto.randomUUID(),
            relationships: (c.relationships || []).map((r: any) => {
                const target = existing.find(ex => ex.name === r.targetName);
                return { targetId: target ? target.id : 'unknown', targetName: r.targetName, relation: r.relation };
            })
        }));
    } else {
        const res = await callOpenAI(
            settings.baseUrl || '', 
            settings.apiKey, 
            settings.model, 
            [{ role: 'user', content: prompt }],
            true
        );
        
        // 处理OpenAI格式的响应
        let parsedResponse;
        if (typeof res === 'string') {
            // 如果是普通字符串，直接解析
            parsedResponse = JSON.parse(res);
        } else {
            // 如果是完整的OpenAI响应对象（包含choices等字段）
            const responseObject = res as any;
            if (responseObject.choices && responseObject.choices[0] && responseObject.choices[0].message) {
                // 提取content字段并解析
                const content = responseObject.choices[0].message.content;
                parsedResponse = JSON.parse(content);
            } else {
                // 其他情况直接解析
                parsedResponse = JSON.parse(JSON.stringify(res));
            }
        }
        
        // 检查返回的数据结构，如果是包含characters字段的对象，则使用该字段
        const charactersArray = parsedResponse.characters || parsedResponse;
        
        return charactersArray.map((c: any) => ({
            ...c,
            id: crypto.randomUUID(),
            relationships: (c.relationships || []).map((r: any) => {
                const target = existing.find(ex => ex.name === r.targetName);
                return { targetId: target ? target.id : 'unknown', targetName: r.targetName, relation: r.relation };
            })
        }));
    }
};

export const generateRandomNames = async (config: NovelConfig, settings: AppSettings): Promise<string[]> => {
     const prompt = `为 ${config.genre} 类型的小说生成 5 个合适的角色名字。
要求：
- 名字要符合小说类型的风格
- 名字要有特色，易于记忆
- 返回 JSON 字符串数组格式`;
     
     if (settings.provider === 'google') {
         const ai = getGoogleAI(settings);
         const res = await ai.models.generateContent({
             model: settings.model,
             contents: prompt,
             config: { 
                 responseMimeType: 'application/json',
                 responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
             }
         });
         return JSON.parse(res.text || "[]");
     }
     return ["张三", "李四", "王五"];
};

export const generateOutline = async (config: NovelConfig, characters: Character[], structure: WorldStructure, settings: AppSettings): Promise<Chapter[]> => {
    const context = buildNovelContext(config);
    const charSummary = characters.map(c => `${c.name} (${c.role})`).join(', ');
    const prompt = `
        基于设定生成前 10 章大纲。
        ${context}
        关键角色: ${charSummary}
        主线冲突: ${structure.centralConflict}
        
        返回 JSON 数组: title, summary (100字), tension (1-10).
    `;

    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const res = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            summary: { type: Type.STRING },
                            tension: { type: Type.NUMBER }
                        }
                    }
                }
            }
        });
        const raw = JSON.parse(res.text || "[]");
        return raw.map((c: any, i: number) => ({
            id: crypto.randomUUID(),
            order: i + 1,
            title: c.title,
            summary: c.summary,
            tension: c.tension,
            content: "",
            wordCount: 0,
            parentId: null
        }));
    } else {
        const res = await callOpenAI(
            settings.baseUrl || '', 
            settings.apiKey, 
            settings.model, 
            [{ role: 'user', content: prompt }],
            true
        );
        
        // 处理OpenAI格式的响应
        let parsedResponse;
        if (typeof res === 'string') {
            // 如果是普通字符串，直接解析
            parsedResponse = JSON.parse(res);
        } else {
            // 如果是完整的OpenAI响应对象（包含choices等字段）
            const responseObject = res as any;
            if (responseObject.choices && responseObject.choices[0] && responseObject.choices[0].message) {
                // 提取content字段并解析
                const content = responseObject.choices[0].message.content;
                parsedResponse = JSON.parse(content);
            } else {
                // 其他情况直接解析
                parsedResponse = JSON.parse(JSON.stringify(res));
            }
        }
        
        // 检查返回的数据结构，如果是包含chapters字段的对象，则使用该字段
        const chaptersArray = parsedResponse.chapters || parsedResponse;
        
        return chaptersArray.map((c: any, i: number) => ({
            id: crypto.randomUUID(),
            order: i + 1,
            title: c.title,
            summary: c.summary,
            tension: c.tension,
            content: "",
            wordCount: 0,
            parentId: null
        }));
    }
};

export const extendOutline = async (config: NovelConfig, characters: Character[], currentChapters: Chapter[], settings: AppSettings, structure: WorldStructure): Promise<Chapter[]> => {
    // Basic logic to generate next chapters based on last one
    const context = buildNovelContext(config);
    const lastChapter = currentChapters[currentChapters.length - 1];
    const prompt = `
        ${context}
        Previous Chapter: ${lastChapter.title} - ${lastChapter.summary}
        Generate next 5 chapters. Return JSON array: title, summary, tension.
    `;
    
    // Reuse generateOutline logic structure but with new prompt
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const res = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            summary: { type: Type.STRING },
                            tension: { type: Type.NUMBER }
                        }
                    }
                }
            }
        });
        const raw = JSON.parse(res.text || "[]");
        let startOrder = currentChapters.length + 1;
        return raw.map((c: any) => ({
            id: crypto.randomUUID(),
            order: startOrder++,
            title: c.title,
            summary: c.summary,
            tension: c.tension,
            content: "",
            wordCount: 0,
            parentId: null
        }));
    }
    return [];
};

/**
 * Enhanced generateChapterBeats function with deep context support.
 * 
 * Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5
 * - Injects volume context (summary, core conflict, progress) for chapters in volumes
 * - Extracts last 500 characters from previous chapter for continuity
 * - Reads and injects hooks from previous chapter
 * - Builds ancestor summaries for branching narratives
 * - Returns 5-8 specific plot beats
 * 
 * @param chapter - The chapter to generate beats for
 * @param allChapters - All chapters in the project (for finding previous chapter and ancestors)
 * @param volumes - All volumes in the project (for volume context injection)
 * @param config - Novel configuration
 * @param characters - All characters in the project
 * @param settings - App settings including API configuration
 * @returns Array of 5-8 plot beat strings
 */
/**
 * Enhanced generateChapterBeats function with deep context support and plot loop integration.
 * 
 * Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.4
 * - Injects volume context (summary, core conflict, progress) for chapters in volumes
 * - Extracts last 500 characters from previous chapter for continuity
 * - Reads and injects hooks from previous chapter
 * - Builds ancestor summaries for branching narratives
 * - Injects all OPEN and URGENT plot loops into the AI prompt context (Requirement 4.1)
 * - Instructs AI to prioritize URGENT plot loops (Requirement 4.2)
 * - Includes relevant OPEN plot loops for narrative continuity (Requirement 4.4)
 * - Returns 5-8 specific plot beats
 * 
 * @param chapter - The chapter to generate beats for
 * @param allChapters - All chapters in the project (for finding previous chapter and ancestors)
 * @param volumes - All volumes in the project (for volume context injection)
 * @param config - Novel configuration
 * @param characters - All characters in the project
 * @param settings - App settings including API configuration
 * @param plotLoops - All plot loops in the project (optional, for plot loop context injection)
 * @returns Array of 5-8 plot beat strings
 */
export const generateChapterBeats = async (
    chapter: Chapter, 
    allChapters: Chapter[], 
    volumes: Volume[],
    config: NovelConfig, 
    characters: Character[], 
    settings: AppSettings,
    plotLoops: PlotLoop[] = []
): Promise<string[]> => {
    const context = buildNovelContext(config);
    
    // === 1. Find previous chapter and extract last content (Requirement 3.1) ===
    const previousChapter = findPreviousChapter(chapter, allChapters);
    const lastContent = previousChapter ? extractLastContent(previousChapter, 500) : '';
    
    // === 2. Extract hooks from previous chapter (Requirements 3.2, 3.3) ===
    const hooks = previousChapter?.hooks || [];
    
    // === 3. Build ancestor summaries for branching narratives (Requirement 3.4) ===
    const ancestors = getVolumeChapterAncestors(chapter.id, allChapters);
    const ancestorSummaries = ancestors.length > 0 
        ? ancestors.map(a => `第${a.order}章 ${a.title}: ${a.summary}`).join('\n')
        : '';
    
    // === 4. Build volume context (Requirements 2.1, 2.2, 2.5) ===
    let volumeContext = '';
    if (chapter.volumeId) {
        const volume = volumes.find(v => v.id === chapter.volumeId);
        if (volume) {
            // Calculate progress within volume
            const progress = getVolumeProgress(chapter, volumes, allChapters);
            const progressText = progress 
                ? `本卷进度: 第 ${progress.position}/${progress.total} 章 (${progress.percentage.toFixed(0)}%)`
                : '';
            
            volumeContext = `
当前分卷: ${volume.title}
分卷摘要: ${volume.summary}
核心冲突: ${volume.coreConflict}
${progressText}`;
            
            // Check if this is the first chapter of a new volume and previous volume has summary (Requirement 2.5)
            if (progress && progress.position === 1 && volume.order > 1) {
                const previousVolume = volumes.find(v => v.order === volume.order - 1);
                if (previousVolume?.volumeSummary) {
                    volumeContext += `\n\n上一卷总结: ${previousVolume.volumeSummary}`;
                }
            }
        }
    }
    
    // === 5. Build plot loop context (Requirements 4.1, 4.2, 4.4) ===
    const plotLoopContext = buildLoopContextForPrompt(chapter.id, plotLoops);
    
    // === 6. Build enhanced prompt (Requirement 3.5) ===
    const prompt = `
${context}

${volumeContext ? `=== 分卷信息 ===\n${volumeContext}\n` : ''}

${plotLoopContext ? `\n${plotLoopContext}\n` : ''}

为章节 "${chapter.title}" 设计详细的剧情细纲 (Beats)。
章节摘要: ${chapter.summary}

${ancestorSummaries ? `=== 前置剧情 ===\n${ancestorSummaries}\n` : ''}

${lastContent ? `=== 上一章结尾 ===\n${lastContent}\n` : ''}

${hooks.length > 0 ? `=== 需要回应的伏笔 ===\n${hooks.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n` : ''}

=== 要求 ===
1. 生成 5-8 个具体的剧情步骤
2. 每个步骤应包含具体的场景、动作或对话要点
3. 确保与上一章自然衔接${lastContent ? '，承接上文的情节发展' : ''}
4. 避免与前文重复的情节或描写
${hooks.length > 0 ? `5. 必须回应上述伏笔，在细纲中体现对这些悬念的处理` : ''}
${volumeContext ? `6. 符合分卷的整体节奏和核心冲突` : ''}
${plotLoopContext ? `7. 在细纲中自然地推进或回收上述伏笔追踪中的悬念` : ''}

返回 JSON 字符串数组，每个元素是一个具体的情节步骤。
    `.trim();
    
    // 🆕 检查 Token 预算
    const estimatedTokens = tokenCounter.estimateTokens(prompt) + 500; // 预估输出 500 tokens
    const canProceed = await tokenCounter.checkBudget(estimatedTokens, settings.tokenBudget);
    if (!canProceed) {
        throw new Error('Token budget exceeded');
    }
    
    let result: string[] = [];
    
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const res = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        });
        result = JSON.parse(res.text || "[]");
    } else {
        // 🆕 支持其他提供商
        const systemPrompt = '你是一个专业的小说大纲设计师。请严格返回 JSON 格式的字符串数组，例如：["步骤1", "步骤2", "步骤3"]';
        const res = await callOpenAI(
            settings.baseUrl || '',
            settings.apiKey,
            settings.model,
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            true
        );
        
        try {
            // 处理可能的响应格式
            let parsed: any;
            
            if (typeof res === 'string') {
                parsed = JSON.parse(res);
            } else {
                parsed = res;
            }
            
            // 🆕 处理复杂的嵌套结构
            if (Array.isArray(parsed)) {
                // 如果是数组，检查元素类型
                if (parsed.length > 0 && typeof parsed[0] === 'object') {
                    // 如果是对象数组，提取 summary 或 title 字段
                    result = parsed.map((item: any) => {
                        if (typeof item === 'string') return item;
                        return item.summary || item.title || item.content || JSON.stringify(item);
                    });
                } else {
                    // 如果是字符串数组，直接使用
                    result = parsed.map((item: any) => String(item));
                }
            } else if (parsed && typeof parsed === 'object') {
                // 🆕 处理 { beats: [...] } 格式
                if (parsed.beats && Array.isArray(parsed.beats)) {
                    result = parsed.beats.map((item: any) => {
                        if (typeof item === 'string') return item;
                        // 提取有意义的字段
                        if (item.summary) return item.summary;
                        if (item.title) return item.title;
                        if (item.content) return item.content;
                        // 如果有 details 数组，合并成一个字符串
                        if (item.details && Array.isArray(item.details)) {
                            return item.details.join(' ');
                        }
                        return JSON.stringify(item);
                    });
                } else {
                    // 尝试提取对象中的数组字段
                    const arrayField = Object.values(parsed).find((v: any) => Array.isArray(v));
                    if (arrayField && Array.isArray(arrayField)) {
                        result = arrayField.map((item: any) => 
                            typeof item === 'string' ? item : (item.summary || item.title || JSON.stringify(item))
                        );
                    } else {
                        result = [];
                    }
                }
            } else {
                result = [];
            }
            
            // 确保结果是字符串数组
            result = result.filter((item: any) => item && typeof item === 'string' && item.trim().length > 0);
            
            if (result.length === 0) {
                console.warn('解析后的细纲为空，原始响应:', res);
            }
        } catch (e) {
            console.error('Failed to parse beats response:', e);
            console.error('Raw response:', res);
            result = [];
        }
    }
    
    // 🆕 记录 Token 使用
    tokenCounter.record(prompt, JSON.stringify(result), settings.model, 'beats_generation');
    
    return result;
};

/**
 * Generates a comprehensive summary for a completed volume.
 * 
 * Requirements: 2.3, 2.4
 * - Generates a 500-1000 word summary based on all chapter summaries in the volume
 * - Captures key plot developments, character arcs, and major events
 * - Returns the summary text to be saved to Volume.volumeSummary
 * 
 * @param volume - The volume to generate summary for
 * @param chapters - All chapters in the project
 * @param config - Novel configuration
 * @param settings - App settings including API configuration
 * @returns Summary text (500-1000 words)
 */
export const generateVolumeSummary = async (
    volume: Volume,
    chapters: Chapter[],
    config: NovelConfig,
    settings: AppSettings
): Promise<string> => {
    // Get chapters that belong to this volume, sorted by order
    const volumeChapters = chapters
        .filter(chapter => volume.chapterIds.includes(chapter.id))
        .sort((a, b) => a.order - b.order);
    
    // If no chapters, return empty string
    if (volumeChapters.length === 0) {
        return '';
    }
    
    // Build chapter summaries for the prompt
    const chapterSummaries = volumeChapters
        .map(c => `第${c.order}章 ${c.title}: ${c.summary}`)
        .join('\n');
    
    const context = buildNovelContext(config);
    
    const prompt = `
${context}

=== 分卷信息 ===
分卷标题: ${volume.title}
分卷摘要: ${volume.summary}
核心冲突: ${volume.coreConflict}
章节数量: ${volumeChapters.length}

=== 各章节摘要 ===
${chapterSummaries}

=== 任务 ===
请基于以上章节摘要，为本卷生成一份详细的回顾总结。

=== 要求 ===
1. 总结字数控制在 500-1000 字
2. 涵盖本卷的主要剧情发展脉络
3. 突出重要的角色成长和关系变化
4. 记录关键的转折点和高潮场景
5. 总结本卷解决的冲突和留下的悬念
6. 为下一卷的剧情发展做好铺垫和暗示
7. 使用流畅的叙述性语言，而非简单罗列

请直接输出总结内容，不要添加任何前缀或标题。
    `.trim();
    
    // Check token budget
    const estimatedTokens = tokenCounter.estimateTokens(prompt) + 1000; // Estimate 1000 tokens for output
    const canProceed = await tokenCounter.checkBudget(estimatedTokens, settings.tokenBudget);
    if (!canProceed) {
        throw new Error('Token budget exceeded');
    }
    
    let result = '';
    
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const res = await ai.models.generateContent({
            model: settings.model,
            contents: prompt
        });
        result = res.text || '';
    } else {
        const systemPrompt = '你是一个专业的小说编辑，擅长总结和提炼剧情要点。请生成流畅、有条理的分卷总结。';
        result = await callOpenAI(
            settings.baseUrl || '',
            settings.apiKey,
            settings.model,
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ]
        );
    }
    
    // Record token usage
    tokenCounter.record(prompt, result, settings.model, 'volume_summary');
    
    return result;
};

/**
 * Streams chapter content generation with plot loop context injection.
 * 
 * Requirements: 4.1, 4.4
 * - Includes relevant OPEN plot loops as context for narrative continuity
 * - Injects all OPEN and URGENT plot loops into the AI prompt context
 * 
 * @param chapter - The chapter to generate content for
 * @param allChapters - All chapters in the project
 * @param config - Novel configuration
 * @param characters - All characters in the project
 * @param settings - App settings including API configuration
 * @param structure - World structure
 * @param volumes - All volumes in the project
 * @param plotLoops - All plot loops in the project (optional, for plot loop context injection)
 */
export const streamChapterContent = async function* (chapter: Chapter, allChapters: Chapter[], config: NovelConfig, characters: Character[], settings: AppSettings, structure: WorldStructure, volumes: Volume[] = [], plotLoops: PlotLoop[] = []) {
    const context = buildNovelContext(config);
    
    // 🆕 使用 RAG 检索相关章节（如果启用）
    let prevSummary = '';
    if (settings.useRAG && allChapters.length > 5) {
        try {
            const relevantChapters = await retrieveRelevantChapters(
                chapter.summary,
                allChapters,
                settings,
                3,
                chapter.id
            );
            prevSummary = relevantChapters.map(c => 
                `第${c.order}章 ${c.title}: ${c.summary}`
            ).join('\n');
        } catch (e) {
            console.warn('RAG retrieval failed, falling back to sequential:', e);
            // 降级：使用传统的顺序方式
            const ancestors = getChapterAncestors(chapter.id, allChapters);
            prevSummary = ancestors.slice(-3).map(c => 
                `第${c.order}章 ${c.title}: ${c.summary}`
            ).join('\n');
        }
    } else {
        // 传统方式：取最近 3 章
        const ancestors = getChapterAncestors(chapter.id, allChapters);
        prevSummary = ancestors.slice(-3).map(c => 
            `第${c.order}章 ${c.title}: ${c.summary}`
        ).join('\n');
    }
    
    // 🆕 使用 RAG 检索相关角色（如果启用且有角色）
    let charContext = '';
    if (settings.useRAG && characters.length > 5) {
        try {
            const relevantCharacters = await retrieveRelevantCharacters(
                chapter.summary,
                characters,
                settings,
                5
            );
            charContext = relevantCharacters.map(c =>
                `${c.name}(${c.role}): ${c.description.slice(0, 100)}`
            ).join('\n');
        } catch (e) {
            console.warn('Character RAG retrieval failed:', e);
        }
    }

    // 🆕 构建分卷上下文
    let volumeContext = '';
    if (chapter.volumeId && volumes.length > 0) {
        const volume = volumes.find(v => v.id === chapter.volumeId);
        if (volume) {
            const volumeChapters = allChapters.filter(c => c.volumeId === volume.id);
            const position = volumeChapters.filter(c => c.order <= chapter.order).length;
            volumeContext = `
当前分卷: ${volume.title}
分卷核心冲突: ${volume.coreConflict}
本卷进度: 第 ${position}/${volumeChapters.length} 章`;
        }
    }

    // 🆕 获取上一章的伏笔
    const previousChapter = findPreviousChapter(chapter, allChapters);
    const hooksToResolve = previousChapter?.hooks || [];
    
    // 🆕 构建伏笔追踪上下文 (Requirements 4.1, 4.4)
    const plotLoopContext = buildLoopContextForPrompt(chapter.id, plotLoops);
    
    const beats = (chapter.beats || []).join('\n- ');
    
    const prompt = `
撰写第 ${chapter.order} 章: ${chapter.title}。

${context}
${volumeContext ? `\n=== 分卷背景 ===${volumeContext}\n` : ''}
${prevSummary ? `\n=== 相关前情 ===\n${prevSummary}\n` : ''}
${charContext ? `\n=== 相关角色 ===\n${charContext}\n` : ''}
${hooksToResolve.length > 0 ? `\n=== 需要回应的伏笔 ===\n${hooksToResolve.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n` : ''}
${plotLoopContext ? `\n${plotLoopContext}\n` : ''}

=== 本章任务 ===
章节摘要: ${chapter.summary}
${beats ? `细纲步骤:\n- ${beats}` : ''}

=== 写作要求 ===
1. 网文风格，节奏紧凑，描写生动
2. 对话自然流畅，符合角色性格
3. 场景描写细腻，画面感强
4. 情节推进合理，不拖沓
${hooksToResolve.length > 0 ? '5. 必须自然地回应上述伏笔，推进悬念的解决' : ''}
${volumeContext ? '6. 符合当前分卷的核心冲突和整体节奏' : ''}
${plotLoopContext ? '7. 在内容中自然地推进或回收伏笔追踪中的悬念' : ''}

=== 排版格式 ===
- 每个自然段之间空一行
- 每句对话单独成段
- 场景切换时空两行
- 每段 2-4 句话，避免大段文字
- 使用中文标点，对话用双引号

=== 输出要求 ===
- 直接输出正文内容，不要任何前缀或说明
- 字数控制在 2000-3000 字
- 确保段落之间有明确的空行分隔
    `.trim();

    // 🆕 检查 Token 预算
    const estimatedTokens = tokenCounter.estimateTokens(prompt) + 3000; // 预估输出 3000 tokens
    const canProceed = await tokenCounter.checkBudget(estimatedTokens, settings.tokenBudget);
    if (!canProceed) {
        throw new Error('Token budget exceeded');
    }

    let fullOutput = '';
    
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const result = await ai.models.generateContentStream({
            model: settings.model,
            contents: prompt
        });
        for await (const chunk of result) {
            fullOutput += chunk.text;
            yield { text: chunk.text };
        }
    } else {
        const text = await callOpenAI(settings.baseUrl || '', settings.apiKey, settings.model, [{role: 'user', content: prompt}]);
        fullOutput = text;
        yield { text };
    }
    
    // 🆕 记录 Token 使用
    tokenCounter.record(prompt, fullOutput, settings.model, 'chapter_generation');
};

export const streamTextPolish = async function* (text: string, instruction: string, contextBefore: string, contextAfter: string, settings: AppSettings, config: NovelConfig) {
    const prompt = `
        Instruction: ${instruction}
        Context Before: ...${contextBefore.slice(-200)}
        Text to Polish: "${text}"
        Context After: ${contextAfter.slice(0, 200)}...
        
        Only output the polished text.
    `;
    
    // 🆕 检查 Token 预算
    const estimatedTokens = tokenCounter.estimateTokens(prompt) + tokenCounter.estimateTokens(text);
    const canProceed = await tokenCounter.checkBudget(estimatedTokens, settings.tokenBudget);
    if (!canProceed) {
        throw new Error('Token budget exceeded');
    }

    let fullOutput = '';
    
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const result = await ai.models.generateContentStream({
            model: settings.model,
            contents: prompt
        });
        for await (const chunk of result) {
            fullOutput += chunk.text;
            yield { text: chunk.text };
        }
    } else {
         const res = await callOpenAI(settings.baseUrl||'', settings.apiKey, settings.model, [{role:'user', content: prompt}]);
         fullOutput = res;
         yield { text: res };
    }
    
    // 🆕 记录 Token 使用
    tokenCounter.record(prompt, fullOutput, settings.model, 'polish');
};

// --- RAG ---

export const analyzeChapterForWiki = async (content: string, existingNames: string[], settings: AppSettings, config: NovelConfig): Promise<WikiEntry[]> => {
    const prompt = `
        Analyze the text and extract new Wiki Entries (Items, Skills, Locations, Persons, Organizations).
        Ignore these existing entries: ${existingNames.join(', ')}.
        Text: ${content.slice(0, 10000)}...
        
        Return JSON array: name, category, description.
    `;
    
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const res = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            category: { type: Type.STRING },
                            description: { type: Type.STRING }
                        }
                    }
                }
            }
        });
        const raw = JSON.parse(res.text || "[]");
        return raw.map((r: any) => ({ ...r, id: crypto.randomUUID() }));
    }
    return [];
};

export const indexContent = async (record: Partial<VectorRecord>, settings: AppSettings) => {
    // 1. Generate Embedding
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const model = "text-embedding-004";
        const result = await ai.models.embedContent({
            model,
            contents: record.text || ""
        });
        const vector = result.embeddings?.[0]?.values || [];
        
        // 2. Save to DB
        if (vector) {
            await db.saveVectors([{
                id: crypto.randomUUID(),
                relatedId: record.id || '',
                type: record.type as any,
                text: record.text || '',
                vector: vector,
                timestamp: Date.now(),
                metadata: record.metadata
            }]);
        }
    }
};

// --- Chat ---

/**
 * 🆕 动态构建系统提示（根据用户问题注入相关上下文）
 */
function buildDynamicSystemPrompt(
    config: NovelConfig,
    userMsg: string,
    characters: Character[],
    structure: WorldStructure,
    chapters: Chapter[]
): string {
    let context = `You are the AI Editor for the novel "${config.title}". 
    Genre: ${config.genre}. 
    ${buildNovelContext(config)}`;
    
    // 如果问题涉及角色，注入角色信息
    if (userMsg.match(/角色|人物|character|主角|配角/i)) {
        const charSummary = characters.slice(0, 8).map(c => 
            `${c.name}(${c.role}): ${c.description.slice(0, 150)}`
        ).join('\n');
        if (charSummary) {
            context += `\n\n主要角色:\n${charSummary}`;
        }
    }
    
    // 如果问题涉及剧情，注入最近章节摘要
    if (userMsg.match(/剧情|情节|plot|chapter|章节|故事/i)) {
        const recentChapters = chapters.slice(-8).map(c =>
            `第${c.order}章 ${c.title}: ${c.summary.slice(0, 100)}`
        ).join('\n');
        if (recentChapters) {
            context += `\n\n最近章节:\n${recentChapters}`;
        }
    }
    
    // 如果问题涉及世界观，注入世界观信息
    if (userMsg.match(/世界|设定|背景|势力|地图|world/i)) {
        if (structure.worldView) {
            context += `\n\n世界观: ${structure.worldView.slice(0, 500)}`;
        }
        if (structure.centralConflict) {
            context += `\n核心冲突: ${structure.centralConflict.slice(0, 200)}`;
        }
    }
    
    context += `\n\nAnswer questions about plot, characters, or logic. Be concise and helpful.`;
    
    return context;
}

/**
 * 🆕 生成对话历史摘要
 */
async function summarizeConversationHistory(
    history: OpenAIMessage[],
    settings: AppSettings
): Promise<string> {
    if (history.length === 0) return '';
    
    const historyText = history.map(h => `${h.role}: ${h.content}`).join('\n');
    const prompt = `Summarize the following conversation in 2-3 sentences, focusing on key points discussed:\n\n${historyText}`;
    
    try {
        if (settings.provider === 'google') {
            const ai = getGoogleAI(settings);
            const result = await ai.models.generateContent({
                model: settings.model,
                contents: prompt
            });
            return result.text || '';
        } else {
            return await callOpenAI(
                settings.baseUrl || '',
                settings.apiKey,
                settings.model,
                [{ role: 'user', content: prompt }]
            );
        }
    } catch (e) {
        console.error('Failed to summarize conversation:', e);
        return '';
    }
}

export const streamProjectChat = async function* (history: OpenAIMessage[], userMsg: string, config: NovelConfig, characters: Character[], structure: WorldStructure, chapters: Chapter[], settings: AppSettings) {
    // 🆕 限制历史记录长度（滑动窗口）
    const MAX_HISTORY_TURNS = 10; // 只保留最近 10 轮对话
    let contextHistory = history.slice(-MAX_HISTORY_TURNS);
    
    // 🆕 如果历史记录过长，生成早期对话的摘要
    let earlySummary = '';
    if (history.length > MAX_HISTORY_TURNS) {
        const earlyHistory = history.slice(0, -MAX_HISTORY_TURNS);
        earlySummary = await summarizeConversationHistory(earlyHistory, settings);
    }
    
    // 🆕 动态构建系统提示（根据用户问题注入相关上下文）
    const systemPrompt = buildDynamicSystemPrompt(config, userMsg, characters, structure, chapters);
    
    // 🆕 如果有早期对话摘要，添加到上下文
    const fullSystemPrompt = earlySummary 
        ? `${systemPrompt}\n\nEarlier conversation summary: ${earlySummary}`
        : systemPrompt;

    // 🆕 检查 Token 预算
    const estimatedInput = tokenCounter.estimateTokens(
        fullSystemPrompt + contextHistory.map(h => h.content).join('') + userMsg
    );
    const estimatedTokens = estimatedInput + 500; // 预估输出 500 tokens
    const canProceed = await tokenCounter.checkBudget(estimatedTokens, settings.tokenBudget);
    if (!canProceed) {
        throw new Error('Token budget exceeded');
    }

    let fullOutput = '';

    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        // Gemini doesn't use "system" role in history content array generally for chat, usually config.systemInstruction
        // Flatten history for contents
        const contents = [
             ...contextHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
             { role: 'user', parts: [{ text: userMsg }] }
        ];

        const result = await ai.models.generateContentStream({
            model: settings.model,
            contents: contents,
            config: {
                systemInstruction: fullSystemPrompt
            }
        });
        for await (const chunk of result) {
            fullOutput += chunk.text;
            yield { text: chunk.text };
        }
    } else {
         const res = await callOpenAI(
             settings.baseUrl || '', 
             settings.apiKey, 
             settings.model, 
             [
                 { role: 'system', content: fullSystemPrompt }, 
                 ...contextHistory, 
                 { role: 'user', content: userMsg }
             ]
         );
         fullOutput = res;
         yield { text: res };
    }
    
    // 🆕 记录 Token 使用
    tokenCounter.record(
        fullSystemPrompt + contextHistory.map(h => h.content).join('') + userMsg,
        fullOutput,
        settings.model,
        'chat'
    );
};

// --- Video / Audio ---

export const generateScenePrompts = async (text: string, settings: AppSettings): Promise<VideoScene[]> => {
    const prompt = `
        Convert the following text into 3-5 visual scenes for video generation.
        Text: ${text.slice(0, 3000)}
        
        Return JSON array: prompt (visual description, English, detailed), script (narration text).
    `;
    
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const res = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            prompt: { type: Type.STRING },
                            script: { type: Type.STRING }
                        }
                    }
                }
            }
        });
        const raw = JSON.parse(res.text || "[]");
        return raw.map((r: any) => ({
            id: crypto.randomUUID(),
            prompt: r.prompt,
            script: r.script,
            status: 'idle',
            timestamp: Date.now()
        }));
    }
    return [];
};

export const generateVideo = async (scene: VideoScene, settings: AppSettings, style: string): Promise<string | null> => {
    const ai = getGoogleAI(settings);
    
    // Veo 3.1
    let operation = await ai.models.generateVideos({
        model: settings.videoModel || 'veo-3.1-fast-generate-preview',
        prompt: `${style} Style. ${scene.prompt}`,
        config: {
            numberOfVideos: 1,
            aspectRatio: '16:9',
            resolution: '720p'
        }
    });
    
    // Poll for completion
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
    }
    
    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (uri) {
        const videoRes = await fetch(`${uri}&key=${settings.apiKey}`);
        if (!videoRes.ok) return null;
        const blob = await videoRes.blob();
        return URL.createObjectURL(blob);
    }
    return null;
};

export const generateSpeech = async (text: string, settings: AppSettings, voice: string): Promise<string | null> => {
    const ai = getGoogleAI(settings);
    const response = await ai.models.generateContent({
        model: settings.speechModel || 'gemini-2.5-flash-preview-tts',
        contents: { parts: [{ text }] },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice || 'Kore' }
                }
            }
        }
    });
    
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        // Decode base64 to binary
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Wrap in WAV container so standard HTML Audio element can play it
        return createWavUrl(bytes, 24000); 
    }
    return null;
};

// WAV Header generator for raw PCM data
function createWavUrl(samples: Uint8Array, sampleRate: number): string {
    const buffer = new ArrayBuffer(44 + samples.length);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length, true);

    // Write samples
    const offset = 44;
    for (let i = 0; i < samples.length; i++) {
        view.setUint8(offset + i, samples[i]);
    }

    const blob = new Blob([view], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
