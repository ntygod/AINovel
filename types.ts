
export enum GenerationStatus {
  IDLE = 'IDLE',
  THINKING = 'THINKING', // For models with thinking capability
  WRITING = 'WRITING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// 伏笔状态枚举
export enum PlotLoopStatus {
  OPEN = 'OPEN',           // 已埋下，未回收
  URGENT = 'URGENT',       // 急需回收（接近预定回收章节）
  CLOSED = 'CLOSED',       // 已回收
  ABANDONED = 'ABANDONED'  // 废弃
}

// 伏笔/悬念接口
export interface PlotLoop {
  id: string;                      // UUID
  title: string;                   // 伏笔简述，如"神秘的断剑"
  description: string;             // 详细描述
  
  // 生命周期
  setupChapterId: string;          // 埋下伏笔的章节 ID
  targetChapterId?: string;        // 计划回收的章节 ID（可选）
  targetVolumeId?: string;         // 计划回收的分卷 ID（可选）
  closeChapterId?: string;         // 实际回收的章节 ID
  
  // 状态
  status: PlotLoopStatus;
  importance: number;              // 1-5，重要程度
  abandonReason?: string;          // 废弃原因
  
  // 关联
  relatedCharacterIds?: string[];  // 关联角色 ID 列表
  relatedWikiEntryIds?: string[];  // 关联 Wiki 词条 ID 列表
  parentLoopId?: string;           // 父伏笔 ID（伏笔链）
  
  // 元数据
  createdAt: number;               // 创建时间戳
  updatedAt: number;               // 更新时间戳
  aiSuggested?: boolean;           // 是否为 AI 建议创建
}

export enum ViewMode {
  SETUP = 'SETUP',
  STRUCTURE = 'STRUCTURE', 
  CHARACTERS = 'CHARACTERS',
  WIKI = 'WIKI', 
  OUTLINE = 'OUTLINE',
  TIMELINE = 'TIMELINE', 
  WRITE = 'WRITE',
  CHAT = 'CHAT', // New: Project-level Chat / Muse
  VIDEO = 'VIDEO', // New: AI Video Studio
  EXPORT = 'EXPORT',
  APP_SETTINGS = 'APP_SETTINGS',
}

export type AIProvider = 'google' | 'deepseek' | 'openai' | 'custom';

export interface TokenBudget {
  dailyLimit: number;      // 每日 token 限制
  warningThreshold: number; // 警告阈值（0-1，如 0.8 表示 80%）
  enabled: boolean;
}

/**
 * 单个场景的完整模型配置
 * 支持跨服务商配置
 */
export interface SceneModelConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

/**
 * 解析后的完整模型配置
 * 所有字段必填，用于 API 调用
 */
export interface ResolvedModelConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * AI 场景类型 - 文本场景
 */
export type AISceneType = 'creative' | 'structure' | 'writing' | 'analysis';

/**
 * AI 多模态场景类型 - 视频/语音
 */
export type AIMultimodalSceneType = 'video' | 'speech';

/**
 * 所有 AI 场景类型
 */
export type AIAllSceneType = AISceneType | AIMultimodalSceneType;

/**
 * 场景化模型配置
 * 允许为不同 AI 任务指定不同的模型和服务商
 */
export interface SceneModels {
  /** 创意生成 - 项目创意、角色名等 (轻量级) */
  creative?: string | SceneModelConfig;
  /** 结构化生成 - 世界观、角色、细纲等 (中等) */
  structure?: string | SceneModelConfig;
  /** 长文写作 - 章节内容、润色等 (重量级) */
  writing?: string | SceneModelConfig;
  /** 分析任务 - 章节分析、Wiki提取等 (中等) */
  analysis?: string | SceneModelConfig;
  /** 视频生成 - AI 视频工作室 (多模态) */
  video?: string | SceneModelConfig;
  /** 语音生成 - TTS 朗读 (多模态) */
  speech?: string | SceneModelConfig;
}

export interface AppSettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string; // Optional, for custom/deepseek/openai or Google Proxy
  model: string; // 默认模型，当场景模型未配置时使用
  videoModel?: string; // e.g. veo-3.1-fast-generate-preview
  speechModel?: string; // e.g. gemini-2.5-flash-preview-tts
  theme: 'light' | 'dark' | 'sepia' | 'midnight';
  tokenBudget?: TokenBudget; // Token 预算控制
  useRAG?: boolean; // 是否启用 RAG 检索增强
  sceneModels?: SceneModels; // 场景化模型配置
}

// 角色性别类型
export type CharacterGender = 'male' | 'female' | 'other' | 'unknown';

export interface CharacterRelationship {
  targetId: string;
  targetName: string; // Helper for display if ID lookup fails or for AI generation context
  relation: string;   // e.g., "Father", "Rival", "Secret Crush"
  attitude?: string;  // [新增] 对该角色的态度
}

export interface Character {
  // === 基础信息 ===
  id: string;
  name: string;
  role: string;
  gender?: CharacterGender;    // [新增] 性别
  age?: string;                // [新增] 年龄段
  
  // === 核心设定 (静态) ===
  description: string; // Short bio / summary
  appearance: string;  // Detailed visual description
  background: string;  // Backstory
  personality: string; // Detailed personality traits
  
  // === AI 写作指导 (核心优化字段) ===
  speakingStyle?: string;       // [新增] 对话风格
  motivation?: string;          // [新增] 核心驱动力
  fears?: string;               // [新增] 弱点/恐惧
  narrativeFunction?: string;   // [新增] 叙事功能
  
  // === 关系网 ===
  relationships: CharacterRelationship[];
  
  // === 动态状态 ===
  status?: string;             // [新增] e.g., "健康", "重伤"
  tags?: string[];             // [新增] e.g., ["剑修", "傲娇"]
  isActive?: boolean;          // [新增] 是否活跃
  
  // === 追踪字段 ===
  introducedInVolumeId?: string;   // [新增] 首次登场分卷
  introducedInChapterId?: string;  // [新增] 首次登场章节
}

// 角色原型接口
export interface CharacterArchetype {
  id: string;
  name: string;                    // e.g., "垫脚石"
  description: string;             // 原型描述
  defaultMotivation: string;       // 默认动机
  defaultNarrativeFunction: string;// 默认叙事功能
  suggestedSpeakingStyles: string[];// 建议的对话风格
  icon: string;                    // 图标标识
}

export interface Faction {
  id: string;
  name: string;
  description: string;
  influence: number; // 1-10, determines territory size
  color: string; // Hex code
  x: number; // Map coordinate X (0-100)
  y: number; // Map coordinate Y (0-100)
}

export interface MapRegion {
  id: string;
  name: string; // e.g. "Eastern Continent", "Chaos Realm"
  type: 'continent' | 'island' | 'archipelago'; 
  x: number;
  y: number;
}

export type WikiCategory = 'Item' | 'Skill' | 'Location' | 'Event' | 'Organization' | 'Person' | 'Other';

/**
 * Wiki 关联关系类型
 */
export type WikiRelationType = 
  | 'belongs_to'    // 属于（如：青云剑 belongs_to 林风）
  | 'part_of'       // 是...的一部分（如：青云决 part_of 青云门）
  | 'created_by'    // 由...创造（如：倚天剑 created_by 张三丰）
  | 'located_in'    // 位于（如：藏经阁 located_in 青云门）
  | 'related_to';   // 相关（通用关系）

/**
 * Wiki 关联关系
 */
export interface WikiRelationship {
  targetId: string;           // 目标 Wiki 条目 ID
  relation: WikiRelationType; // 关系类型
  description?: string;       // 关系描述（可选）
}

/**
 * Wiki 历史版本（时间切片）
 */
export interface WikiHistoryEntry {
  chapterId: string;          // 变更发生的章节 ID
  chapterOrder: number;       // 章节序号（用于快速比较）
  content: string;            // 该时间点的描述内容
  timestamp: number;          // 变更时间戳
  changeNote?: string;        // 变更说明（可选）
}

export interface WikiEntry {
  id: string;
  name: string;
  category: WikiCategory;
  description: string;
  firstAppearanceChapterId?: string; // Tracking where it first appeared
  
  // 🆕 别名系统 (Alias System)
  aliases?: string[];         // 别名列表，如 ["张麻子", "三爷", "县长"]
  
  // 🆕 时间切片 (Time Slicing)
  history?: WikiHistoryEntry[]; // 历史版本列表，按章节顺序排列
  
  // 🆕 关联图谱 (Wiki Relationships)
  relationships?: WikiRelationship[]; // 与其他 Wiki 条目的关系
}

export interface WorldStructure {
  worldView: string; // Geography, Magic/Tech system, History
  centralConflict: string; // The main antagonist force or problem
  keyPlotPoints: string[]; // High level beats (Inciting incident, Midpoint, Climax)
  globalMemory?: string; // The "Series Bible" - persistent facts that must never be forgotten
  factions: Faction[]; 
  regions?: MapRegion[]; 
  wikiEntries?: WikiEntry[]; // New: Encyclopedia Database
}

// 章节类型枚举
export type ChapterType = 'normal' | 'flashback' | 'prologue' | 'epilogue' | 'interlude';

export interface Chapter {
  id: string;
  order: number;
  title: string;
  summary: string; // The plot point for this chapter
  content: string; // The actual generated text
  wordCount: number;
  tension?: number; // 1-10 score representing plot tension/excitement
  beats?: string[]; // New: Detailed plot beats (Step Outline)
  parentId?: string | null; // New: For branching narratives
  volumeId?: string | null; // 所属分卷 ID
  hooks?: string[]; // 本章留下的钩子/伏笔
  chapterType?: ChapterType; // 章节类型：普通/回忆/序章/尾声/间章
  flashbackTimeHint?: string; // 回忆章节的时间提示，如"十年前"、"主角幼年时期"
}

// 分卷接口 - 位于书和章节之间的结构层级
export interface Volume {
  id: string;                    // UUID
  title: string;                 // 卷标题，如"第一卷：崛起"
  summary: string;               // 卷摘要，100-300字
  coreConflict: string;          // 本卷核心冲突
  order: number;                 // 卷序号，从 1 开始
  chapterIds: string[];          // 包含的章节 ID 列表
  volumeSummary?: string;        // 完成后生成的详细总结（500-1000字）
  expectedWordCount?: number;    // 预期字数
}

export interface ChapterSnapshot {
  id: string;
  chapterId: string;
  content: string;
  timestamp: number;
  note?: string; // Optional user note like "Before rewrite"
  wordCount: number;
}

// New: Vector Store Record
export interface VectorRecord {
  id: string; // Unique ID
  relatedId: string; // ID of the Chapter, Character, or WikiEntry
  type: 'chapter' | 'character' | 'wiki';
  text: string; // The text content used to generate the embedding
  vector: number[]; // The embedding vector
  timestamp: number;
  metadata?: any; // Extra info like chapter order, character name
}

// New: Video Studio Scene
export interface VideoScene {
  id: string;
  chapterId: string;
  prompt: string; // Visual description for Veo
  script: string; // Narrative script for TTS
  videoUrl?: string; // Blob URL
  audioUrl?: string; // Blob URL
  status: 'idle' | 'generating_video' | 'generating_audio' | 'completed' | 'error';
  timestamp: number;
}

export interface NovelConfig {
  title: string;
  
  // New Structured Fields for Non-Writers
  genre: string;          // e.g. "玄幻"
  subGenre: string;       // e.g. "高武世界"
  worldSetting: string;   // Description of the world
  
  protagonistArchetype: string; // e.g. "穿越者", "重生者", "土著天才"
  goldenFinger: string;   // The "Cheat" or special ability
  
  mainPlot: string;       // The core goal (replacing simple premise)
  
  pacing: string;         // e.g. "快节奏爽文", "慢热种田"
  narrativeTone: string;  // e.g. "幽默", "黑暗", "正剧"
  
  tags: string[];         // e.g. ["系统", "无敌", "单女主", "迪化"]

  dailyTarget?: number;    // New: Daily word count goal (default 3000)
}

// Lightweight metadata for listing projects
export interface ProjectMetadata {
  id: string;
  title: string;
  genre: string;
  wordCount: number;
  lastModified: number;
  previewText?: string;
}

export interface NovelState {
  id: string; // UUID
  lastModified: number;
  config: NovelConfig;
  structure: WorldStructure;
  characters: Character[];
  chapters: Chapter[];
  currentChapterId: string | null;
  volumes: Volume[]; // 分卷列表
  plotLoops: PlotLoop[]; // 伏笔列表
}
