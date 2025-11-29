import { GoogleGenAI, Type, Modality, setDefaultBaseUrls } from "@google/genai";
import { 
  NovelConfig, WorldStructure, AppSettings, Faction, MapRegion, Character, Chapter, 
  WikiEntry, VideoScene, VectorRecord 
} from '../types';
import { db } from './db';
import { tokenCounter } from './tokenCounter';
import { retrieveRelevantChapters, retrieveRelevantCharacters } from './ragService';

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
     const prompt = `Generate 5 random names suitable for genre: ${config.genre}. Return JSON array of strings.`;
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

export const generateChapterBeats = async (chapter: Chapter, ancestors: Chapter[], config: NovelConfig, characters: Character[], settings: AppSettings): Promise<string[]> => {
    const context = buildNovelContext(config);
    const prompt = `
        为章节 "${chapter.title}" 设计详细的剧情细纲 (Beats)。
        摘要: ${chapter.summary}
        ${context}
        
        返回 JSON 字符串数组，列出 5-8 个具体的情节步骤。
    `;
    
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

export const streamChapterContent = async function* (chapter: Chapter, allChapters: Chapter[], config: NovelConfig, characters: Character[], settings: AppSettings, structure: WorldStructure) {
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
    
    const beats = (chapter.beats || []).join('\n- ');
    
    const prompt = `
        撰写第 ${chapter.order} 章: ${chapter.title}。
        ${context}
        ${prevSummary ? `\n相关前情:\n${prevSummary}` : ''}
        ${charContext ? `\n相关角色:\n${charContext}` : ''}
        
        本章摘要: ${chapter.summary}
        本章细纲:
        - ${beats}
        
        ## 写作要求：
        
        ### 内容风格：
        - 网文风格，节奏紧凑，描写生动
        - 对话自然流畅，符合角色性格
        - 场景描写细腻，画面感强
        - 情节推进合理，不拖沓
        
        ### 排版格式（重要）：
        1. **段落分明**：每个自然段之间空一行
        2. **对话独立**：每句对话单独成段
        3. **场景转换**：场景切换时空两行
        4. **段落长度**：每段 2-4 句话，避免大段文字
        5. **标点规范**：使用中文标点，对话用双引号「」或""
        
        ### 段落示例：
        
        正确格式：
        """
        林风站在山巅，俯瞰着脚下的云海。晨光初现，金色的阳光穿透云层，在他身上镀上一层淡淡的光晕。
        
        "终于到了。"他轻声自语，眼中闪过一丝坚定。
        
        这一路走来，历经千辛万苦，如今终于站在了这传说中的天元峰顶。
        
        
        山脚下，一道身影正急速攀登。
        
        "师兄，等等我！"少女的声音在山谷中回荡。
        """
        
        错误格式（避免）：
        """
        林风站在山巅，俯瞰着脚下的云海。晨光初现，金色的阳光穿透云层，在他身上镀上一层淡淡的光晕。"终于到了。"他轻声自语，眼中闪过一丝坚定。这一路走来，历经千辛万苦，如今终于站在了这传说中的天元峰顶。山脚下，一道身影正急速攀登。"师兄，等等我！"少女的声音在山谷中回荡。
        """
        
        ## 输出要求：
        - 直接输出正文内容，不要任何前缀或说明
        - 严格遵守上述排版格式
        - 字数控制在 2000-3000 字
        - 确保每个段落之间有明确的空行分隔
    `;

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
