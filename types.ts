
export enum GenerationStatus {
  IDLE = 'IDLE',
  THINKING = 'THINKING', // For models with thinking capability
  WRITING = 'WRITING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
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

export interface AppSettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string; // Optional, for custom/deepseek/openai or Google Proxy
  model: string;
  videoModel?: string; // e.g. veo-3.1-fast-generate-preview
  speechModel?: string; // e.g. gemini-2.5-flash-preview-tts
  theme: 'light' | 'dark' | 'sepia' | 'midnight';
  tokenBudget?: TokenBudget; // Token 预算控制
  useRAG?: boolean; // 是否启用 RAG 检索增强
}

export interface CharacterRelationship {
  targetId: string;
  targetName: string; // Helper for display if ID lookup fails or for AI generation context
  relation: string;   // e.g., "Father", "Rival", "Secret Crush"
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string; // Short bio / summary
  appearance: string;  // Detailed visual description
  background: string;  // Backstory
  personality: string; // Detailed personality traits
  relationships: CharacterRelationship[];
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

export interface WikiEntry {
  id: string;
  name: string;
  category: WikiCategory;
  description: string;
  firstAppearanceChapterId?: string; // Tracking where it first appeared
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
}
