import { GoogleGenAI, Type, Modality, setDefaultBaseUrls } from "@google/genai";
import { 
  NovelConfig, WorldStructure, AppSettings, Faction, MapRegion, Character, Chapter, 
  WikiEntry, VideoScene, VectorRecord, Volume, PlotLoop,
  ResolvedModelConfig, AISceneType, SceneModelConfig
} from '../types';
import { db } from './db';
import { tokenCounter } from './tokenCounter';
import { 
    retrieveRelevantChapters, 
    retrieveRelevantCharacters, 
    retrieveContextForGeneration,
    calculateDynamicTopK,
    retrieveSceneContext
} from './ragService';
import { 
  findPreviousChapter, 
  extractLastContent, 
  getChapterAncestors as getVolumeChapterAncestors,
  getVolumeProgress 
} from './volumeService';
import { buildLoopContextForPrompt } from './plotLoopService';

// --- AI 场景类型 ---
export type AIScene = 'creative' | 'structure' | 'writing' | 'analysis' | 'default';

/**
 * 从场景配置中提取模型名称
 * @param config - 场景配置（字符串或完整配置对象）
 * @param defaultModel - 默认模型名称
 * @returns 模型名称
 */
function extractModelFromSceneConfig(
    config: string | SceneModelConfig | undefined,
    defaultModel: string
): string {
    if (!config) {
        return defaultModel;
    }
    if (typeof config === 'string') {
        return config;
    }
    return config.model;
}

/**
 * 根据场景获取对应的模型名称（向后兼容函数）
 * @param settings - 应用设置
 * @param scene - AI 场景类型
 * @returns 对应场景的模型名称
 * @deprecated 推荐使用 resolveSceneConfig 获取完整配置
 */
export function getModelForScene(settings: AppSettings, scene: AIScene): string {
    // 使用 resolveSceneConfig 获取完整配置，然后返回模型名称
    // 'default' 场景映射到默认设置
    if (scene === 'default') {
        return settings.model;
    }
    const resolved = resolveSceneConfig(settings, scene as AISceneType);
    return resolved.model;
}

/**
 * 根据场景获取完整的解析后配置
 * @param settings - 应用设置
 * @param scene - AI 场景类型
 * @returns 完整的解析后模型配置
 * 
 * Requirements: 2.1, 2.4
 */
export function getResolvedConfigForScene(settings: AppSettings, scene: AIScene): ResolvedModelConfig {
    // 'default' 场景返回默认配置
    if (scene === 'default') {
        return {
            provider: settings.provider,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl || '',
            model: settings.model
        };
    }
    return resolveSceneConfig(settings, scene as AISceneType);
}

/**
 * 解析场景配置，返回完整的模型配置
 * 处理三种情况：
 * 1. 完整 SceneModelConfig - 直接使用
 * 2. 字符串模型名 - 使用默认 provider 设置 + 指定模型
 * 3. 未配置 - 完全使用默认设置
 * 
 * @param settings - 应用设置
 * @param scene - AI 场景类型
 * @returns 解析后的完整模型配置
 * 
 * Requirements: 1.3, 2.2, 2.3
 */
export function resolveSceneConfig(
    settings: AppSettings,
    scene: AISceneType
): ResolvedModelConfig {
    const sceneConfig = settings.sceneModels?.[scene];
    
    // 默认配置 - 使用全局设置
    const defaultConfig: ResolvedModelConfig = {
        provider: settings.provider,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl || '',
        model: settings.model
    };
    
    // Case 1: 未配置 - 返回默认设置
    if (!sceneConfig) {
        return defaultConfig;
    }
    
    // Case 2: 字符串模型名 - 使用默认 provider 设置 + 指定模型
    if (typeof sceneConfig === 'string') {
        return { ...defaultConfig, model: sceneConfig };
    }
    
    // Case 3: 完整 SceneModelConfig - 直接使用
    return {
        provider: sceneConfig.provider,
        apiKey: sceneConfig.apiKey,
        baseUrl: sceneConfig.baseUrl || '',
        model: sceneConfig.model
    };
}

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
    
    // 使用创意场景的完整配置 (Requirements: 2.1, 2.2, 2.3)
    const resolvedConfig = resolveSceneConfig(settings, 'creative');

    if (resolvedConfig.provider === 'google') {
        // 为 Google 提供商创建 AI 客户端，使用解析后的配置
        const googleSettings: AppSettings = {
            ...settings,
            apiKey: resolvedConfig.apiKey,
            baseUrl: resolvedConfig.baseUrl
        };
        const ai = getGoogleAI(googleSettings);
        const response = await ai.models.generateContent({
            model: resolvedConfig.model,
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
        // 使用解析后的配置调用 OpenAI 兼容 API
        const res = await callOpenAI(
            resolvedConfig.baseUrl, 
            resolvedConfig.apiKey, 
            resolvedConfig.model, 
            [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
            true
        );
        return JSON.parse(res);
    }
};

export const generateWorldStructure = async (config: NovelConfig, settings: AppSettings): Promise<WorldStructure> => {
    const context = buildNovelContext(config);
    const prompt = `基于以下小说设定，构建详细的世界观。返回 JSON 包含: worldView (详细世界观设定), centralConflict (核心矛盾), keyPlotPoints (3-5个关键剧情节点数组).`;
    
    // 使用结构化生成场景的完整配置 (Requirements: 2.1, 2.2, 2.3)
    const resolvedConfig = resolveSceneConfig(settings, 'structure');
    
    if (resolvedConfig.provider === 'google') {
         // 为 Google 提供商创建 AI 客户端，使用解析后的配置
         const googleSettings: AppSettings = {
             ...settings,
             apiKey: resolvedConfig.apiKey,
             baseUrl: resolvedConfig.baseUrl
         };
         const ai = getGoogleAI(googleSettings);
         const response = await ai.models.generateContent({
             model: resolvedConfig.model,
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
         // 使用解析后的配置调用 OpenAI 兼容 API
         const res = await callOpenAI(
            resolvedConfig.baseUrl, 
            resolvedConfig.apiKey, 
            resolvedConfig.model, 
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
    
    // 检查是否已有主角
    const hasProtagonist = existing.some(c => 
        c.role?.includes('主角') || 
        c.role?.toLowerCase().includes('protagonist') ||
        c.role?.includes('主人公')
    );
    
    // 构建角色生成要求
    let roleRequirements = '';
    if (!hasProtagonist && existing.length === 0) {
        // 没有任何角色时，第一个必须是主角
        roleRequirements = `
【重要】第一个角色必须是主角！
- 主角的 role 字段必须设为"主角"
- 主角要符合设定中的主角类型: ${config.protagonistArchetype}
- 主角要有明确的金手指/特殊能力: ${config.goldenFinger}
- 其余角色可以是配角、反派、导师等`;
    } else if (!hasProtagonist) {
        // 有角色但没有主角
        roleRequirements = `
【重要】当前缺少主角，请确保生成一个主角！
- 主角的 role 字段必须设为"主角"
- 主角要符合设定中的主角类型: ${config.protagonistArchetype}
- 主角要有明确的金手指/特殊能力: ${config.goldenFinger}`;
    }
    
    const prompt = `
        基于设定和现有角色，创作 ${count} 个新角色。
        ${context}
        ${roleRequirements}
        
        现有角色: ${existing.length > 0 ? existing.map(c => `${c.name}(${c.role})`).join(', ') : '无'}
        
        返回 JSON 数组，每个角色必须包含以下所有字段（不能为空）: 
        - name: 角色名字（必填）
        - role: 角色定位（必填，如：主角/配角/反派/导师）
        - gender: 性别（必填，值为 male/female/other/unknown）
        - age: 年龄段（必填，如：少年/青年/中年/老年）
        - description: 简短描述（必填，50-100字）
        - appearance: 外貌描写（必填，详细描述外貌特征）
        - background: 背景故事（必填，100-200字）
        - personality: 性格特点（必填，详细描述性格）
        - speakingStyle: 对话风格（必填！如：傲慢、温柔、毒舌、神秘、幽默等）
        - motivation: 核心驱动力（必填！角色行动的根本动机）
        - narrativeFunction: 叙事功能（必填！角色在故事中的作用）
        - relationships: 关系数组 [{targetName, relation}]
        
        【重要】speakingStyle、motivation、narrativeFunction 这三个字段必须填写，不能为空！
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
                            gender: { type: Type.STRING },
                            age: { type: Type.STRING },
                            description: { type: Type.STRING },
                            appearance: { type: Type.STRING },
                            background: { type: Type.STRING },
                            personality: { type: Type.STRING },
                            speakingStyle: { type: Type.STRING },
                            motivation: { type: Type.STRING },
                            narrativeFunction: { type: Type.STRING },
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
            id: crypto.randomUUID(),
            name: c.name || '',
            role: c.role || '',
            gender: c.gender || 'unknown',
            age: c.age || '',
            description: c.description || '',
            appearance: c.appearance || '',
            background: c.background || '',
            personality: c.personality || '',
            speakingStyle: c.speakingStyle || '',
            motivation: c.motivation || '',
            narrativeFunction: c.narrativeFunction || '',
            fears: '',
            status: '正常',
            tags: [],
            isActive: true,
            relationships: (c.relationships || []).map((r: any) => {
                const target = existing.find(ex => ex.name === r.targetName);
                return { targetId: target ? target.id : 'unknown', targetName: r.targetName, relation: r.relation, attitude: '' };
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
            id: crypto.randomUUID(),
            name: c.name || '',
            role: c.role || '',
            gender: c.gender || 'unknown',
            age: c.age || '',
            description: c.description || '',
            appearance: c.appearance || '',
            background: c.background || '',
            personality: c.personality || '',
            speakingStyle: c.speakingStyle || '',
            motivation: c.motivation || '',
            narrativeFunction: c.narrativeFunction || '',
            fears: '',
            status: '正常',
            tags: [],
            isActive: true,
            relationships: (c.relationships || []).map((r: any) => {
                const target = existing.find(ex => ex.name === r.targetName);
                return { targetId: target ? target.id : 'unknown', targetName: r.targetName, relation: r.relation, attitude: '' };
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

/**
 * Context-aware character generation with volume and chapter context injection.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.6
 * - Accepts Volume and Chapter as context parameters
 * - Injects coreConflict and summary into generation prompt
 * - Automatically sets introducedInVolumeId and introducedInChapterId
 * - Auto-derives motivation and narrativeFunction based on context
 * 
 * @param config - Novel configuration
 * @param settings - App settings including API configuration
 * @param existing - Existing characters in the project
 * @param structure - World structure
 * @param context - Generation context with optional volume, chapter, and archetype
 * @param count - Number of characters to generate (default 1)
 * @returns Array of generated Character objects with context fields populated
 */
export interface CharacterGenerationContext {
    volume?: Volume;
    chapter?: Chapter;
    archetype?: import('../types').CharacterArchetype;
    additionalPrompt?: string;
}

export const generateCharactersWithContext = async (
    config: NovelConfig,
    settings: AppSettings,
    existing: Character[],
    structure: WorldStructure,
    context: CharacterGenerationContext,
    count: number = 1
): Promise<Character[]> => {
    const novelContext = buildNovelContext(config);
    
    // Build context-aware prompt parts
    const promptParts: string[] = [];
    
    promptParts.push(`基于设定和现有角色，创作 ${count} 个新角色。`);
    promptParts.push(novelContext);
    promptParts.push(`现有角色: ${existing.map(c => c.name).join(', ') || '无'}`);
    
    // Inject volume context (Requirement 2.2)
    if (context.volume) {
        promptParts.push('');
        promptParts.push('=== 分卷上下文 ===');
        promptParts.push(`分卷标题: ${context.volume.title}`);
        if (context.volume.coreConflict) {
            promptParts.push(`核心冲突: ${context.volume.coreConflict}`);
        }
        if (context.volume.summary) {
            promptParts.push(`分卷摘要: ${context.volume.summary}`);
        }
    }
    
    // Inject chapter context (Requirement 2.3)
    if (context.chapter) {
        promptParts.push('');
        promptParts.push('=== 章节上下文 ===');
        promptParts.push(`章节标题: ${context.chapter.title}`);
        if (context.chapter.summary) {
            promptParts.push(`章节摘要: ${context.chapter.summary}`);
        }
    }
    
    // Inject archetype context (Requirement 4.2)
    if (context.archetype) {
        promptParts.push('');
        promptParts.push('=== 角色原型 ===');
        promptParts.push(`原型: ${context.archetype.name}`);
        promptParts.push(`原型描述: ${context.archetype.description}`);
        promptParts.push(`默认动机: ${context.archetype.defaultMotivation}`);
        promptParts.push(`叙事功能: ${context.archetype.defaultNarrativeFunction}`);
        promptParts.push(`建议对话风格: ${context.archetype.suggestedSpeakingStyles.join('、')}`);
    }
    
    // Additional user prompt
    if (context.additionalPrompt) {
        promptParts.push('');
        promptParts.push('=== 额外要求 ===');
        promptParts.push(context.additionalPrompt);
    }
    
    // Generation requirements
    promptParts.push('');
    promptParts.push('=== 生成要求 ===');
    promptParts.push('1. 角色必须与当前剧情上下文紧密关联');
    promptParts.push('2. 角色的 motivation (核心驱动力) 必须与分卷核心冲突相关');
    promptParts.push('3. 角色的 narrativeFunction (叙事功能) 必须明确');
    promptParts.push('4. 角色的 speakingStyle (对话风格) 必须独特且符合性格');
    if (context.archetype) {
        promptParts.push(`5. 角色必须符合"${context.archetype.name}"原型的基本特征`);
    }
    
    promptParts.push('');
    promptParts.push('返回 JSON 数组，每个角色必须包含以下所有字段（不能为空）:');
    promptParts.push('- name: 角色名（必填）');
    promptParts.push('- role: 角色定位（必填，如"主角"、"配角"、"反派"、"导师"）');
    promptParts.push('- gender: 性别（必填，"male"/"female"/"other"/"unknown"）');
    promptParts.push('- age: 年龄段（必填，如"少年"、"青年"、"中年"、"老年"）');
    promptParts.push('- description: 简短描述（必填，50-100字）');
    promptParts.push('- appearance: 外貌描写（必填，详细描述）');
    promptParts.push('- background: 背景故事（必填，100-200字）');
    promptParts.push('- personality: 性格特点（必填，详细描述）');
    promptParts.push('- speakingStyle: 对话风格（必填！如：傲慢、温柔、毒舌、神秘）');
    promptParts.push('- motivation: 核心驱动力（必填！角色行动的根本动机，与剧情相关）');
    promptParts.push('- fears: 弱点/恐惧（必填）');
    promptParts.push('- narrativeFunction: 叙事功能（必填！角色在故事中的作用）');
    promptParts.push('- tags: 标签数组（如["剑修", "傲娇"]）');
    promptParts.push('- relationships: 关系数组 [{targetName, relation, attitude}]');
    promptParts.push('');
    promptParts.push('【重要】speakingStyle、motivation、narrativeFunction 这三个字段必须填写，不能为空！');
    
    const prompt = promptParts.join('\n');
    
    // Define response schema for structured output
    const characterSchema = {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING },
            gender: { type: Type.STRING },
            age: { type: Type.STRING },
            description: { type: Type.STRING },
            appearance: { type: Type.STRING },
            background: { type: Type.STRING },
            personality: { type: Type.STRING },
            speakingStyle: { type: Type.STRING },
            motivation: { type: Type.STRING },
            fears: { type: Type.STRING },
            narrativeFunction: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            relationships: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        targetName: { type: Type.STRING },
                        relation: { type: Type.STRING },
                        attitude: { type: Type.STRING }
                    }
                }
            }
        }
    };
    
    let rawCharacters: any[] = [];
    
    if (settings.provider === 'google') {
        const ai = getGoogleAI(settings);
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: characterSchema
                }
            }
        });
        rawCharacters = JSON.parse(response.text || "[]");
    } else {
        const res = await callOpenAI(
            settings.baseUrl || '',
            settings.apiKey,
            settings.model,
            [{ role: 'user', content: prompt }],
            true
        );
        
        let parsedResponse;
        if (typeof res === 'string') {
            parsedResponse = JSON.parse(res);
        } else {
            const responseObject = res as any;
            if (responseObject.choices && responseObject.choices[0] && responseObject.choices[0].message) {
                const content = responseObject.choices[0].message.content;
                parsedResponse = JSON.parse(content);
            } else {
                parsedResponse = JSON.parse(JSON.stringify(res));
            }
        }
        
        rawCharacters = parsedResponse.characters || parsedResponse;
        if (!Array.isArray(rawCharacters)) {
            rawCharacters = [rawCharacters];
        }
    }
    
    // Transform raw characters to Character type with context fields (Requirement 2.6)
    return rawCharacters.map((c: any) => ({
        id: crypto.randomUUID(),
        name: c.name || '',
        role: c.role || '',
        gender: c.gender || 'unknown',
        age: c.age || '',
        description: c.description || '',
        appearance: c.appearance || '',
        background: c.background || '',
        personality: c.personality || '',
        speakingStyle: c.speakingStyle || '',
        motivation: c.motivation || '',
        fears: c.fears || '',
        narrativeFunction: c.narrativeFunction || '',
        status: '正常',
        tags: Array.isArray(c.tags) ? c.tags : [],
        isActive: true,
        // Auto-set introduction tracking fields (Requirement 2.6)
        introducedInVolumeId: context.volume?.id,
        introducedInChapterId: context.chapter?.id,
        relationships: (c.relationships || []).map((r: any) => {
            const target = existing.find(ex => ex.name === r.targetName);
            return {
                targetId: target ? target.id : 'unknown',
                targetName: r.targetName || '',
                relation: r.relation || '',
                attitude: r.attitude || ''
            };
        })
    }));
};

/**
 * Builds a context-aware prompt for character generation.
 * This is a pure function that can be tested independently.
 * 
 * Requirements: 2.2, 2.3
 * - Includes volume coreConflict in prompt when provided
 * - Includes chapter summary in prompt when provided
 * 
 * @param volume - Optional volume for context
 * @param chapter - Optional chapter for context
 * @param archetype - Optional archetype for context
 * @returns Prompt string containing all context information
 */
export function buildCharacterGenerationPrompt(
    volume?: Volume,
    chapter?: Chapter,
    archetype?: import('../types').CharacterArchetype
): string {
    const parts: string[] = [];
    
    // Inject volume context (Requirement 2.2)
    if (volume) {
        parts.push('=== 分卷上下文 ===');
        parts.push(`分卷标题: ${volume.title}`);
        if (volume.coreConflict) {
            parts.push(`核心冲突: ${volume.coreConflict}`);
        }
        if (volume.summary) {
            parts.push(`分卷摘要: ${volume.summary}`);
        }
    }
    
    // Inject chapter context (Requirement 2.3)
    if (chapter) {
        if (parts.length > 0) parts.push('');
        parts.push('=== 章节上下文 ===');
        parts.push(`章节标题: ${chapter.title}`);
        if (chapter.summary) {
            parts.push(`章节摘要: ${chapter.summary}`);
        }
    }
    
    // Inject archetype context
    if (archetype) {
        if (parts.length > 0) parts.push('');
        parts.push('=== 角色原型 ===');
        parts.push(`原型: ${archetype.name}`);
        parts.push(`默认动机: ${archetype.defaultMotivation}`);
        parts.push(`叙事功能: ${archetype.defaultNarrativeFunction}`);
    }
    
    return parts.join('\n');
}

/**
 * Status sync suggestion interface for character analysis
 */
export interface StatusSyncSuggestion {
    suggestedStatus?: string;
    suggestedTags?: string[];
    suggestedDescription?: string;
    reasoning: string;
}

/**
 * Analyzes a character's appearances in recent chapters and suggests status updates.
 * 
 * Requirements: 5.2, 5.3
 * - Filters to the most recent 5 chapters where the character appears
 * - Builds analysis prompt and returns StatusSyncSuggestion
 * 
 * @param character - The character to analyze
 * @param chapters - All chapters in the project
 * @param settings - App settings including API configuration
 * @returns StatusSyncSuggestion with suggested updates and reasoning
 */
export const analyzeCharacterInChapters = async (
    character: Character,
    chapters: Chapter[],
    settings: AppSettings
): Promise<StatusSyncSuggestion> => {
    // Filter chapters that mention the character (by name in content or summary)
    // and sort by order descending to get most recent first
    const relevantChapters = chapters
        .filter(ch => {
            const content = (ch.content || '').toLowerCase();
            const summary = (ch.summary || '').toLowerCase();
            const charName = character.name.toLowerCase();
            return content.includes(charName) || summary.includes(charName);
        })
        .sort((a, b) => b.order - a.order)
        .slice(0, 5); // Requirement 5.2: analyze at most 5 chapters
    
    // If no relevant chapters found, return empty suggestion
    if (relevantChapters.length === 0) {
        return {
            reasoning: `未找到角色"${character.name}"出现的章节，无法分析状态变化。`
        };
    }
    
    // Build analysis prompt
    const chapterSummaries = relevantChapters
        .map(ch => `第${ch.order}章 ${ch.title}:\n摘要: ${ch.summary}\n内容片段: ${(ch.content || '').slice(0, 500)}...`)
        .join('\n\n');
    
    const prompt = `
分析角色"${character.name}"在以下章节中的状态变化。

=== 角色当前信息 ===
名称: ${character.name}
角色定位: ${character.role}
当前状态: ${character.status || '正常'}
当前描述: ${character.description}
当前标签: ${(character.tags || []).join(', ') || '无'}

=== 最近出现的章节 (共${relevantChapters.length}章) ===
${chapterSummaries}

=== 分析任务 ===
请分析该角色在这些章节中的表现，判断是否需要更新以下字段：
1. status (状态): 角色当前的身体/精神状态，如"健康"、"重伤"、"失踪"、"死亡"等
2. tags (标签): 角色的特征标签，如技能、身份、特点等
3. description (描述): 角色的简短描述，是否需要根据剧情发展更新

返回 JSON 对象，包含:
- suggestedStatus: 建议的新状态 (如果需要更新)
- suggestedTags: 建议的新标签数组 (如果需要更新)
- suggestedDescription: 建议的新描述 (如果需要更新)
- reasoning: 分析推理过程，解释为什么建议这些更新
    `.trim();
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            suggestedStatus: { type: Type.STRING },
            suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedDescription: { type: Type.STRING },
            reasoning: { type: Type.STRING }
        },
        required: ['reasoning']
    };
    
    try {
        if (settings.provider === 'google') {
            const ai = getGoogleAI(settings);
            const response = await ai.models.generateContent({
                model: settings.model,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema
                }
            });
            const result = JSON.parse(response.text || '{}');
            return {
                suggestedStatus: result.suggestedStatus || undefined,
                suggestedTags: result.suggestedTags || undefined,
                suggestedDescription: result.suggestedDescription || undefined,
                reasoning: result.reasoning || '分析完成'
            };
        } else {
            const res = await callOpenAI(
                settings.baseUrl || '',
                settings.apiKey,
                settings.model,
                [{ role: 'user', content: prompt }],
                true
            );
            
            let parsedResponse;
            if (typeof res === 'string') {
                parsedResponse = JSON.parse(res);
            } else {
                const responseObject = res as any;
                if (responseObject.choices && responseObject.choices[0] && responseObject.choices[0].message) {
                    const content = responseObject.choices[0].message.content;
                    parsedResponse = JSON.parse(content);
                } else {
                    parsedResponse = JSON.parse(JSON.stringify(res));
                }
            }
            
            return {
                suggestedStatus: parsedResponse.suggestedStatus || undefined,
                suggestedTags: parsedResponse.suggestedTags || undefined,
                suggestedDescription: parsedResponse.suggestedDescription || undefined,
                reasoning: parsedResponse.reasoning || '分析完成'
            };
        }
    } catch (error) {
        console.error('Failed to analyze character in chapters:', error);
        return {
            reasoning: `分析失败: ${error instanceof Error ? error.message : '未知错误'}`
        };
    }
};

/**
 * Filters chapters where a character appears and returns at most the specified limit.
 * This is a pure function that can be tested independently.
 * 
 * Requirement 5.2: analyze at most 5 chapters
 * 
 * @param character - The character to search for
 * @param chapters - All chapters to search through
 * @param limit - Maximum number of chapters to return (default 5)
 * @returns Array of chapters where the character appears, sorted by order descending
 */
export function filterCharacterChapters(
    character: Character,
    chapters: Chapter[],
    limit: number = 5
): Chapter[] {
    return chapters
        .filter(ch => {
            const content = (ch.content || '').toLowerCase();
            const summary = (ch.summary || '').toLowerCase();
            const charName = character.name.toLowerCase();
            return content.includes(charName) || summary.includes(charName);
        })
        .sort((a, b) => b.order - a.order)
        .slice(0, limit);
}

export const generateOutline = async (config: NovelConfig, characters: Character[], structure: WorldStructure, settings: AppSettings): Promise<Chapter[]> => {
    const context = buildNovelContext(config);
    
    // 找到主角并特别标注
    const protagonist = characters.find(c => 
        c.role?.includes('主角') || 
        c.role?.toLowerCase().includes('protagonist') ||
        c.role?.includes('主人公')
    );
    
    // 构建角色信息，主角放在最前面
    let charInfo = '';
    if (protagonist) {
        charInfo = `【主角】${protagonist.name}: ${protagonist.description || protagonist.role}\n`;
        const otherChars = characters.filter(c => c.id !== protagonist.id);
        if (otherChars.length > 0) {
            charInfo += `【其他角色】${otherChars.map(c => `${c.name}(${c.role})`).join(', ')}`;
        }
    } else {
        charInfo = characters.map(c => `${c.name} (${c.role})`).join(', ');
    }
    
    const prompt = `
        基于设定生成前 10 章大纲。
        ${context}
        
        === 角色信息 ===
        ${charInfo}
        
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
        
        // 检查返回的数据结构，支持多种可能的字段名
        const chaptersArray = parsedResponse.chapters || parsedResponse.outline || parsedResponse;
        
        // 确保是数组
        if (!Array.isArray(chaptersArray)) {
            console.error('generateOutline: 返回数据不是数组', parsedResponse);
            return [];
        }
        
        return chaptersArray.map((c: any, i: number) => ({
            id: crypto.randomUUID(),
            order: i + 1,
            title: c.title || `第${i + 1}章`,
            summary: c.summary || '',
            tension: c.tension || 5,
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
    } else {
        // OpenAI/DeepSeek/Custom provider
        const res = await callOpenAI(
            settings.baseUrl || '', 
            settings.apiKey, 
            settings.model, 
            [{ role: 'user', content: prompt }],
            true
        );
        
        let parsedResponse;
        if (typeof res === 'string') {
            parsedResponse = JSON.parse(res);
        } else {
            const responseObject = res as any;
            if (responseObject.choices && responseObject.choices[0] && responseObject.choices[0].message) {
                const content = responseObject.choices[0].message.content;
                parsedResponse = JSON.parse(content);
            } else {
                parsedResponse = JSON.parse(JSON.stringify(res));
            }
        }
        
        const chaptersArray = parsedResponse.chapters || parsedResponse.outline || parsedResponse;
        
        if (!Array.isArray(chaptersArray)) {
            console.error('extendOutline: 返回数据不是数组', parsedResponse);
            return [];
        }
        
        let startOrder = currentChapters.length + 1;
        return chaptersArray.map((c: any) => ({
            id: crypto.randomUUID(),
            order: startOrder++,
            title: c.title || `第${startOrder}章`,
            summary: c.summary || '',
            tension: c.tension || 5,
            content: "",
            wordCount: 0,
            parentId: null
        }));
    }
};

/**
 * Enhanced generateChapterBeats function with deep context support, plot loop integration,
 * and intelligent Wiki/faction context injection.
 * 
 * Requirements: 6.1, 6.2
 * - Retrieves and injects relevant Wiki entries via RAG (Requirement 6.1)
 * - Retrieves and injects relevant historical chapters via RAG (Requirement 6.2)
 * - Injects faction information for context (Requirement 6.4)
 * 
 * @param chapter - The chapter to generate beats for
 * @param allChapters - All chapters in the project (for finding previous chapter and ancestors)
 * @param volumes - All volumes in the project (for volume context injection)
 * @param config - Novel configuration
 * @param characters - All characters in the project
 * @param settings - App settings including API configuration
 * @param plotLoops - All plot loops in the project (optional, for plot loop context injection)
 * @param wikiEntries - All wiki entries in the project (optional, for context injection)
 * @param factions - All factions in the project (optional, for context injection)
 * @returns Array of 5-8 plot beat strings
 */
export const generateChapterBeats = async (
    chapter: Chapter, 
    allChapters: Chapter[], 
    volumes: Volume[],
    config: NovelConfig, 
    characters: Character[], 
    settings: AppSettings,
    plotLoops: PlotLoop[] = [],
    wikiEntries: WikiEntry[] = [],
    factions: Faction[] = []
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
    
    // === 3.5 Retrieve relevant Wiki entries via RAG (Requirements 6.1, 6.2) ===
    let relevantWikiContext = '';
    let factionContext = '';
    
    if (settings.useRAG && settings.apiKey && wikiEntries.length > 0) {
        try {
            const retrievedContext = await retrieveContextForGeneration(
                chapter.summary,
                allChapters.filter(c => c.id !== chapter.id),
                characters,
                wikiEntries,
                settings
            );
            
            // Build relevant Wiki entries context (Requirement 6.1 - top 5)
            if (retrievedContext.relevantWikiEntries.length > 0) {
                relevantWikiContext = retrievedContext.relevantWikiEntries.map(entry =>
                    `【${entry.category}】${entry.name}: ${entry.description?.slice(0, 150) || ''}`
                ).join('\n');
            }
        } catch (e) {
            console.warn('Wiki RAG retrieval failed for beats generation:', e);
        }
    }
    
    // Build faction context (Requirement 6.4)
    if (factions.length > 0) {
        const relevantFactions = factions.slice(0, 3); // 最多显示 3 个势力（细纲生成不需要太多）
        if (relevantFactions.length > 0) {
            factionContext = relevantFactions.map(f =>
                `【${f.name}】影响力: ${f.influence}/10 - ${f.description?.slice(0, 80) || ''}`
            ).join('\n');
        }
    }
    
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
    
    // === 6. Build character context - always include protagonist ===
    let charContext = '';
    const protagonist = characters.find(c => 
        c.role?.includes('主角') || 
        c.role?.toLowerCase().includes('protagonist') ||
        c.role?.includes('主人公')
    );
    if (protagonist) {
        charContext = `=== 主角信息 ===
【${protagonist.name}】
角色定位: ${protagonist.role}
${protagonist.personality ? `性格: ${protagonist.personality}` : ''}
${protagonist.speakingStyle ? `对话风格: ${protagonist.speakingStyle}` : ''}
${protagonist.motivation ? `核心驱动力: ${protagonist.motivation}` : ''}`;
    }
    
    // === 7. Build enhanced prompt (Requirement 3.5) ===
    const prompt = `
# Role: 剧情架构师
你是一位精通网文节奏把控、擅长设计冲突与悬念的剧情架构师。

# Novel Context:
${context}

${charContext ? `${charContext}\n` : ''}

${volumeContext ? `=== 分卷信息 ===\n${volumeContext}\n` : ''}

${relevantWikiContext ? `=== 相关设定 (Wiki) ===\n${relevantWikiContext}\n` : ''}

${factionContext ? `=== 势力信息 ===\n${factionContext}\n` : ''}

${plotLoopContext ? `\n${plotLoopContext}\n` : ''}

# Mission:
为章节 "${chapter.title}" 设计详细的剧情细纲 (Beats)。

## 本章摘要: 
${chapter.summary}

${ancestorSummaries ? `## 前置剧情:\n${ancestorSummaries}\n` : ''}

${lastContent ? `## 上一章结尾:\n${lastContent}\n` : ''}

${hooks.length > 0 ? `## 需要回应的伏笔:\n${hooks.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n` : ''}

# 核心要求 (必须严格执行):

### 1. 拒绝流水账
- **错误示例**: "两人进行了交谈"、"他打败了敌人"
- **正确示例**: "A质问B的背叛，B冷笑着拔出了剑"、"剑光划破夜空，敌人的头颅飞起"
- 每个步骤必须包含具体的动作、冲突或转折

### 2. 起承转合结构
- **铺垫**: 1-2 步，设置场景和人物状态
- **冲突爆发**: 2-3 步，核心矛盾激化
- **高潮**: 1-2 步，最激烈的对抗或转折
- **悬念收尾**: 1 步，留下钩子引发下一章期待

### 3. 逻辑连贯
- 每一步必须是上一步的直接结果
- 角色行为必须符合其性格和动机
${lastContent ? '- 必须与上一章结尾自然衔接' : ''}

### 4. 其他要求
${hooks.length > 0 ? `- 必须回应上述伏笔，在细纲中体现对这些悬念的处理` : ''}
${volumeContext ? `- 符合分卷的整体节奏和核心冲突` : ''}
${plotLoopContext ? `- 在细纲中自然地推进或回收伏笔追踪中的悬念` : ''}

# Output Format:
返回 JSON 字符串数组，5-8 个具体的情节步骤。
示例: ["A在暴雨中跪倒，发誓复仇", "B试图阻止，被A身上的魔气震飞", "黑暗中，一双血红的眼睛缓缓睁开"]
    `.trim();
    
    // 🆕 检查 Token 预算
    const estimatedTokens = tokenCounter.estimateTokens(prompt) + 500; // 预估输出 500 tokens
    const canProceed = await tokenCounter.checkBudget(estimatedTokens, settings.tokenBudget);
    if (!canProceed) {
        throw new Error('Token budget exceeded');
    }
    
    let result: string[] = [];
    
    // 使用结构化场景的完整配置 (Requirements: 2.1, 2.2, 2.3)
    // 细纲生成属于结构化任务，使用 'structure' 场景
    const resolvedConfig = resolveSceneConfig(settings, 'structure');
    
    if (resolvedConfig.provider === 'google') {
        // 为 Google 提供商创建 AI 客户端，使用解析后的配置
        const googleSettings: AppSettings = {
            ...settings,
            apiKey: resolvedConfig.apiKey,
            baseUrl: resolvedConfig.baseUrl
        };
        const ai = getGoogleAI(googleSettings);
        const res = await ai.models.generateContent({
            model: resolvedConfig.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        });
        result = JSON.parse(res.text || "[]");
    } else {
        // 🆕 支持其他提供商，使用解析后的配置
        const systemPrompt = '你是一个专业的小说大纲设计师。请严格返回 JSON 格式的字符串数组，例如：["步骤1", "步骤2", "步骤3"]';
        const res = await callOpenAI(
            resolvedConfig.baseUrl,
            resolvedConfig.apiKey,
            resolvedConfig.model,
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
        .filter(chapter => volume.chapterIds?.includes(chapter.id))
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
    
    // 使用写作场景的完整配置 (Requirements: 2.1, 2.2, 2.3)
    // 分卷总结属于写作任务
    const resolvedConfig = resolveSceneConfig(settings, 'writing');
    
    if (resolvedConfig.provider === 'google') {
        // 为 Google 提供商创建 AI 客户端，使用解析后的配置
        const googleSettings: AppSettings = {
            ...settings,
            apiKey: resolvedConfig.apiKey,
            baseUrl: resolvedConfig.baseUrl
        };
        const ai = getGoogleAI(googleSettings);
        const res = await ai.models.generateContent({
            model: resolvedConfig.model,
            contents: prompt
        });
        result = res.text || '';
    } else {
        // 使用解析后的配置调用 OpenAI 兼容 API
        const systemPrompt = '你是一个专业的小说编辑，擅长总结和提炼剧情要点。请生成流畅、有条理的分卷总结。';
        result = await callOpenAI(
            resolvedConfig.baseUrl,
            resolvedConfig.apiKey,
            resolvedConfig.model,
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ]
        );
    }
    
    // Record token usage
    tokenCounter.record(prompt, resolvedConfig.model, settings.model, 'volume_summary');
    
    return result;
};

/**
 * Streams chapter content generation with intelligent context injection.
 * 
 * Requirements: 1.5, 4.1, 4.4, 6.1, 6.2, 6.3, 6.4
 * - Includes relevant OPEN plot loops as context for narrative continuity
 * - Injects all OPEN and URGENT plot loops into the AI prompt context
 * - Retrieves and injects relevant Wiki entries via RAG (Requirement 6.1)
 * - Retrieves and injects relevant historical chapters via RAG (Requirement 6.2)
 * - Injects all isActive=true main characters (Requirement 6.3)
 * - Injects faction information for current volume (Requirement 6.4)
 * 
 * @param chapter - The chapter to generate content for
 * @param allChapters - All chapters in the project
 * @param config - Novel configuration
 * @param characters - All characters in the project
 * @param settings - App settings including API configuration
 * @param structure - World structure
 * @param volumes - All volumes in the project
 * @param plotLoops - All plot loops in the project (optional, for plot loop context injection)
 * @param wikiEntries - All wiki entries in the project (optional, for context injection)
 * @param factions - All factions in the project (optional, for context injection)
 */
export const streamChapterContent = async function* (
    chapter: Chapter, 
    allChapters: Chapter[], 
    config: NovelConfig, 
    characters: Character[], 
    settings: AppSettings, 
    structure: WorldStructure, 
    volumes: Volume[] = [], 
    plotLoops: PlotLoop[] = [],
    wikiEntries: WikiEntry[] = [],
    factions: Faction[] = []
) {
    const context = buildNovelContext(config);
    
    // 🆕 使用综合检索获取相关上下文 (Requirements 6.1, 6.2)
    let prevSummary = '';
    let relevantWikiContext = '';
    
    if (settings.useRAG && settings.apiKey) {
        try {
            const retrievedContext = await retrieveContextForGeneration(
                chapter.summary,
                allChapters.filter(c => c.id !== chapter.id),
                characters,
                wikiEntries,
                settings
            );
            
            // 构建相关章节摘要 (Requirement 6.2 - top 3)
            if (retrievedContext.relevantChapters.length > 0) {
                prevSummary = retrievedContext.relevantChapters.map(c => 
                    `第${c.order}章 ${c.title}: ${c.summary}`
                ).join('\n');
            }
            
            // 构建相关 Wiki 条目上下文 (Requirement 6.1 - top 5)
            if (retrievedContext.relevantWikiEntries.length > 0) {
                relevantWikiContext = retrievedContext.relevantWikiEntries.map(entry =>
                    `【${entry.category}】${entry.name}: ${entry.description?.slice(0, 200) || ''}`
                ).join('\n');
            }
        } catch (e) {
            console.warn('RAG context retrieval failed, falling back to sequential:', e);
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
    
    // 🆕 构建角色上下文 - 注入所有 isActive=true 的主要角色 (Requirement 6.3)
    let charContext = '';
    
    // 首先找到主角（role 包含"主角"或"protagonist"）
    const protagonist = characters.find(c => 
        c.role?.includes('主角') || 
        c.role?.toLowerCase().includes('protagonist') ||
        c.role?.includes('主人公')
    );
    
    // 构建主角信息（如果存在）
    if (protagonist) {
        const protagonistInfo = [
            `【主角】${protagonist.name}`,
            `角色定位: ${protagonist.role}`,
            protagonist.description ? `简介: ${protagonist.description}` : '',
            protagonist.personality ? `性格: ${protagonist.personality}` : '',
            protagonist.speakingStyle ? `对话风格: ${protagonist.speakingStyle}` : '',
            protagonist.motivation ? `核心驱动力: ${protagonist.motivation}` : '',
        ].filter(Boolean).join('\n');
        charContext = protagonistInfo;
    }
    
    // 获取所有 isActive=true 的角色 (Requirement 6.3)
    const activeCharacters = characters.filter(c => 
        c.isActive !== false && c.id !== protagonist?.id
    );
    
    // 使用 RAG 检索相关配角（如果启用且有足够角色）
    if (settings.useRAG && activeCharacters.length > 5) {
        try {
            const relevantCharacters = await retrieveRelevantCharacters(
                chapter.summary,
                activeCharacters,
                settings,
                5
            );
            if (relevantCharacters.length > 0) {
                const supportingContext = relevantCharacters.map(c =>
                    `${c.name}(${c.role}): ${c.description?.slice(0, 100) || ''}`
                ).join('\n');
                charContext = charContext 
                    ? `${charContext}\n\n【相关配角】\n${supportingContext}`
                    : supportingContext;
            }
        } catch (e) {
            console.warn('Character RAG retrieval failed:', e);
        }
    } else if (activeCharacters.length > 0 && activeCharacters.length <= 5) {
        // 角色较少时，直接列出所有活跃的非主角角色
        const supportingContext = activeCharacters.map(c =>
            `${c.name}(${c.role}): ${c.description?.slice(0, 100) || ''}`
        ).join('\n');
        charContext = charContext 
            ? `${charContext}\n\n【其他角色】\n${supportingContext}`
            : supportingContext;
    }
    
    // 🆕 构建势力上下文 (Requirement 6.4)
    let factionContext = '';
    if (factions.length > 0) {
        // 如果有分卷，优先显示与当前分卷相关的势力
        const relevantFactions = factions.slice(0, 5); // 最多显示 5 个势力
        if (relevantFactions.length > 0) {
            factionContext = relevantFactions.map(f =>
                `【${f.name}】影响力: ${f.influence}/10 - ${f.description?.slice(0, 100) || ''}`
            ).join('\n');
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
本卷主旨: ${volume.summary}
写作指导: 请确保本章情节服务于本卷核心冲突，注意当前的剧情进度节奏。
本卷进度: 第 ${position}/${volumeChapters.length} 章`;
        }
    }

    // 🆕 获取上一章的伏笔
    const previousChapter = findPreviousChapter(chapter, allChapters);
    const hooksToResolve = previousChapter?.hooks || [];

    const lastContent = previousChapter ? extractLastContent(previousChapter, 800) : '';
    
    // 🆕 构建伏笔追踪上下文 (Requirements 4.1, 4.4)
    const plotLoopContext = buildLoopContextForPrompt(chapter.id, plotLoops);
    
    const beats = (chapter.beats || []).join('\n- ');
    
    // 🆕 构建角色状态快照 - 明确告诉 AI 当前时间点的角色状态
    let characterStatusSnapshot = '';
    const activeChars = characters.filter(c => c.isActive !== false);
    const inactiveChars = characters.filter(c => c.isActive === false);
    
    if (activeChars.length > 0 || inactiveChars.length > 0) {
        const statusLines: string[] = [];
        
        // 活跃角色的当前状态
        activeChars.forEach(c => {
            const statusParts = [c.name];
            if (c.status && c.status !== '正常') statusParts.push(`(${c.status})`);
            if (c.tags && c.tags.length > 0) statusParts.push(`[${c.tags.slice(0, 3).join(', ')}]`);
            statusLines.push(`✓ ${statusParts.join(' ')}`);
        });
        
        // 已退场/死亡角色 - 重要提醒
        inactiveChars.forEach(c => {
            statusLines.push(`✗ ${c.name} - ${c.status || '已退场'} (请勿让此角色出场)`);
        });
        
        characterStatusSnapshot = statusLines.join('\n');
    }
    
    // 🆕 回忆章节特殊处理
    const isFlashback = chapter.chapterType === 'flashback';
    const flashbackHint = isFlashback && chapter.flashbackTimeHint 
        ? `\n⚠️ 【回忆章节】本章是回忆/闪回场景，时间设定为: ${chapter.flashbackTimeHint}\n请注意：角色状态应符合该时间点，而非当前时间线。\n`
        : '';
    
    // 🆕 章节类型提示
    let chapterTypeHint = '';
    switch (chapter.chapterType) {
        case 'prologue':
            chapterTypeHint = '\n📖 【序章】本章为序章，需要建立世界观、引入核心冲突、吸引读者兴趣。\n';
            break;
        case 'epilogue':
            chapterTypeHint = '\n📖 【尾声】本章为尾声，需要收束剧情、交代结局、留下余韵。\n';
            break;
        case 'interlude':
            chapterTypeHint = '\n📖 【间章】本章为间章/番外，可以从不同视角展开，补充主线之外的内容。\n';
            break;
    }
    
    const prompt = `
# Role: 资深白金级网文作家
你是一位精通节奏把控、擅长营造画面感、笔力深厚的资深网文作家。

⚠️ **本次任务字数要求: 2000-3000 字** ⚠️

# Novel Configuration:
${context}
**叙事基调**: ${config.narrativeTone || '热血/爽文'} (请严格保持此基调)
**叙事节奏**: ${config.pacing || '快节奏'} (请严格把控叙事速度)

${volumeContext ? `\n## 分卷背景:${volumeContext}\n` : ''}
${prevSummary ? `\n## 前情提要:\n${prevSummary}\n` : ''}
${lastContent ? `\n## 🔴 上一章结尾现场 (必须紧密衔接):\n${lastContent}\n` : ''}
${charContext ? `\n## 登场角色:\n${charContext}\n` : ''}
${characterStatusSnapshot ? `\n## 角色状态快照 (截至第 ${chapter.order} 章):\n${characterStatusSnapshot}\n` : ''}
${relevantWikiContext ? `\n## 相关设定 (Wiki):\n${relevantWikiContext}\n` : ''}
${factionContext ? `\n## 势力信息:\n${factionContext}\n` : ''}
${hooksToResolve.length > 0 ? `\n## 需要回应的伏笔:\n${hooksToResolve.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n` : ''}
${plotLoopContext ? `\n${plotLoopContext}\n` : ''}

# Current Mission:
撰写第 ${chapter.order} 章: ${chapter.title}
${flashbackHint}${chapterTypeHint}
## 本章摘要: 
${chapter.summary}

${beats ? `## 本章细纲 (Step Outline - 必须严格按顺序扩写):\n- ${beats}` : ''}

---

# 核心写作指令 (必须严格执行):

### 1. 无缝衔接 (最重要的要求)
- 仔细阅读【上一章结尾现场】。
- 本章开头必须紧承上一章的**最后一句话、最后一个动作或当时的氛围**。
- **严禁**使用"第二天"、"数日后"等跳跃性开头（除非细纲明确要求转场）。
- 就像电影的长镜头一样，让读者的情绪从上一章平滑过渡到这一章。

### 2. 沉浸式描写 (Show, Don't Tell)
- **拒绝流水账**: 不要只陈述结果（如"他打败了敌人"），必须描写过程（招式的轨迹、碰撞的声音、环境的破坏）
- **五感调用**: 描写中必须包含视觉、听觉、甚至嗅觉或触觉，以增强真实感
- **心理活动**: 结合主角性格描写心理博弈，但不要长篇独白，要与行动结合

### 3. 网文节奏与视点
- **黄金视点**: 严格锁定主要角色的【第三人称限制视角】，不要随意切换到路人或反派的内心世界
- **情绪调动**: 在冲突高潮时，使用短句加快节奏；在铺垫时，用长句渲染气氛
- **结尾钩子**: 本章结尾必须设置悬念（卡点/Hook），引发读者的阅读欲望

### 4. 对话描写规范
- **去"说"化**: 尽量减少"他说道"、"她问道"等标签
- **动作带动语言**: 使用角色的动作、神态来承接对话
  - *佳例*: 李云眼中杀机一闪，长剑震颤："既然来了，就别想走！"
  - *差例*: "既然来了，就别想走。"李云生气地说道。

${hooksToResolve.length > 0 ? '### 4. 伏笔处理\n- 必须自然地回应上述伏笔，推进悬念的解决\n' : ''}
${volumeContext ? '### 5. 分卷节奏\n- 符合当前分卷的核心冲突和整体节奏\n' : ''}
${plotLoopContext ? '### 6. 伏笔追踪\n- 在内容中自然地推进或回收伏笔追踪中的悬念\n' : ''}

# 排版格式系统 (必须严格遵守):
1. **强制双换行**: 每个自然段之间必须使用**两个换行符**（即空一行）。严禁输出密集的大段文字。
2. **对话独立**: 每一句人物对话必须**单独成段**，对话前后也要空一行。
3. **场景转换**: 场景切换时空两行或使用 "***" 分隔
4. **段落长度**: 每段 2-4 句话，避免大段文字
5. **标点规范**: 使用中文标点，对话用双引号

# ⚠️ 字数硬性要求 (CRITICAL):
- **目标字数**: 2000-3000 字（中文字符）。
- **绝对上限**: 不要超过 3500 字。
- 请精准把控节奏，不要注水，也不要写得太长导致剧情拖沓。
- 当章节摘要中的情节全部写完后，请立即收尾，**不要**自行发挥后续未规划的剧情。

# Action:
直接输出正文内容，不要任何前缀或解释。字数必须在 2000-3000 字之间：
    `.trim();

    // 🆕 设定物理 Token 限制
    // 4000 中文字符 ≈ 5000-6000 Tokens (取决于模型分词器，Gemini 约为 1:1.3)
    // 设置 6500 是一个安全值，既允许写到 4000 字，又能防止写到 10000 字
    const MAX_OUTPUT_TOKENS = 4000; 

    // 🆕 检查 Token 预算 (包括输入 + 预计输出)
    const estimatedTokens = tokenCounter.estimateTokens(prompt) + MAX_OUTPUT_TOKENS;
    const canProceed = await tokenCounter.checkBudget(estimatedTokens, settings.tokenBudget);
    if (!canProceed) {
        throw new Error('Token budget exceeded');
    }

    let fullOutput = '';
    
    // 使用写作场景的完整配置 (Requirements: 2.1, 2.2, 2.3)
    const resolvedConfig = resolveSceneConfig(settings, 'writing');
    
    if (resolvedConfig.provider === 'google') {
        // 为 Google 提供商创建 AI 客户端，使用解析后的配置
        const googleSettings: AppSettings = {
            ...settings,
            apiKey: resolvedConfig.apiKey,
            baseUrl: resolvedConfig.baseUrl
        };
        const ai = getGoogleAI(googleSettings);
        const result = await ai.models.generateContentStream({
            model: resolvedConfig.model,
            contents: prompt,
            // 🔥【核心修改】在此处添加 config 对象进行硬限制
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS, // 物理限制输出长度
                temperature: 0.75, // 稍微降低温度，减少"发疯"续写的概率
                topP: 0.9,
                stopSequences: ["<END>", "Chapter End"] // 可选：如果你在Prompt里要求结尾输出特定标记
            }
        });
        for await (const chunk of result) {
            fullOutput += chunk.text;
            yield { text: chunk.text };
        }
    } else {
        // 针对 OpenAI / DeepSeek 等其他提供商，使用解析后的配置
        // 注意：您原有的 callOpenAI 函数封装可能不支持 max_tokens 参数
        // 这里建议使用原生 fetch 来支持流式和 max_tokens，或者您需要去修改 callOpenAI 的定义
        
        const url = `${resolvedConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resolvedConfig.apiKey}`
        };
        const body = {
            model: resolvedConfig.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: MAX_OUTPUT_TOKENS, // 🔥 OpenAI 格式的硬限制
            stream: true // 强制流式，体验更好
        };

        try {
            const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(await response.text());
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    if (line.includes('[DONE]')) return;
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content || '';
                            if (content) {
                                fullOutput += content;
                                yield { text: content };
                            }
                        } catch (e) { }
                    }
                }
            }
        } catch (e) {
            // 如果流式失败，回退到原来的非流式调用 (但无法控制 max_tokens)
            console.warn("Stream failed, fallback to callOpenAI", e);
            const text = await callOpenAI(resolvedConfig.baseUrl, resolvedConfig.apiKey, resolvedConfig.model, [{role: 'user', content: prompt}]);
            fullOutput = text;
            yield { text };
        }
    }
    
    // 记录 Token 使用
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

/**
 * Test a scene configuration by making a minimal API call
 * Requirements: 4.1, 4.2, 4.3
 * 
 * @param config - The SceneModelConfig to test
 * @returns Promise<boolean> - true if test succeeds, throws error if fails
 */
export async function testSceneConfig(config: SceneModelConfig): Promise<boolean> {
    const testPrompt = '请回复"OK"';
    
    try {
        if (config.provider === 'google') {
            // Create Google AI client with the config
            const options: any = { apiKey: config.apiKey || '' };
            if (config.baseUrl) {
                setDefaultBaseUrls({ geminiUrl: config.baseUrl });
            }
            const ai = new GoogleGenAI(options);
            
            const response = await ai.models.generateContent({
                model: config.model,
                contents: testPrompt,
                config: {
                    maxOutputTokens: 10
                }
            });
            
            // If we get here without error, the test passed
            return !!response.text;
        } else {
            // OpenAI-compatible API (DeepSeek, OpenAI, Custom)
            const baseUrl = config.baseUrl || '';
            if (!baseUrl) {
                throw new Error('Base URL is required for non-Google providers');
            }
            
            const result = await callOpenAI(
                baseUrl,
                config.apiKey,
                config.model,
                [{ role: 'user', content: testPrompt }],
                false
            );
            
            // If we get here without error, the test passed
            return !!result;
        }
    } catch (error: any) {
        // Re-throw with more descriptive message
        const message = error.message || 'Unknown error';
        throw new Error(`配置测试失败: ${message}`);
    }
}
