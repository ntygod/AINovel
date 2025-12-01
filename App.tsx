
import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ProjectSetup from './components/ProjectSetup';
import CharacterForge from './components/CharacterForge';
import OutlineBuilder from './components/OutlineBuilder';
import StructureDesigner from './components/StructureDesigner';
import Editor from './components/Editor';
import ExportPublish from './components/ExportPublish';
import AppSettingsView from './components/AppSettings';
import TimelineView from './components/TimelineView';
import WikiSystem from './components/WikiSystem';
import AIChat from './components/AIChat';
import VideoStudio from './components/VideoStudio';
import ProjectDashboard from './components/ProjectDashboard'; 
import { ViewMode, NovelState, NovelConfig, Character, Chapter, WorldStructure, AppSettings, Volume, PlotLoop, PlotLoopStatus } from './types';
import { db } from './services/db';
import { 
  createPlotLoop, 
  updatePlotLoopInArray, 
  deletePlotLoop, 
  markAsClosedInArray, 
  markAsAbandonedInArray,
  checkAndUpdateAllUrgentStatus,
  CreatePlotLoopInput
} from './services/plotLoopService';
import { migrateCharacter } from './services/characterService';
import { Loader2, Cloud } from 'lucide-react';

const DEFAULT_API_KEY = process.env.API_KEY || '';

/**
 * Migrates all characters in a NovelState to ensure new fields have default values
 * Requirements: 1.5, 6.4
 */
const migrateProjectCharacters = (state: NovelState): NovelState => {
  const migratedCharacters = state.characters.map(char => migrateCharacter(char));
  return {
    ...state,
    characters: migratedCharacters,
  };
};

// Keep-Alive View Wrapper moved outside component to avoid recreation and fix type inference
interface KeepAliveViewProps {
  mode: ViewMode;
  activeMode: ViewMode;
  children: React.ReactNode;
}

const KeepAliveView: React.FC<KeepAliveViewProps> = ({ mode, activeMode, children }) => (
  <div className={activeMode === mode ? 'h-full w-full' : 'hidden'}>
      {children}
  </div>
);

const App: React.FC = () => {
  const [isDBReady, setIsDBReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SETUP);
  const [editorLoading, setEditorLoading] = useState(false);
  
  // App Settings State
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
      const saved = localStorage.getItem('inkflow_settings');
      if (saved) {
          const parsed = JSON.parse(saved);
          if (!parsed.provider) parsed.provider = 'google';
          // 🆕 添加默认的 Token 预算配置
          if (!parsed.tokenBudget) {
              parsed.tokenBudget = {
                  dailyLimit: 100000, // 默认每日 10 万 tokens
                  warningThreshold: 0.8, // 80% 时警告
                  enabled: false // 默认不启用
              };
          }
          // 🆕 添加默认的 RAG 配置 - 默认启用以支持动态演进系统
          if (parsed.useRAG === undefined) {
              parsed.useRAG = true; // 默认启用 RAG
          }
          // 🆕 Migration: Ensure sceneModels is properly initialized
          // SceneModels can contain either string (model name only) or full SceneModelConfig objects
          // Both formats are valid and handled by resolveSceneConfig in geminiService.ts
          if (parsed.sceneModels) {
              // Validate each scene config - remove invalid entries
              const validScenes = ['creative', 'structure', 'writing', 'analysis'];
              for (const scene of validScenes) {
                  const config = parsed.sceneModels[scene];
                  if (config !== undefined && config !== null) {
                      // If it's an object, ensure it has required fields
                      if (typeof config === 'object') {
                          // Validate SceneModelConfig has required fields
                          if (!config.provider || !config.model) {
                              // Invalid config, remove it to fall back to default
                              delete parsed.sceneModels[scene];
                          }
                      }
                      // String configs are always valid (just model name)
                  }
              }
          }
          return parsed;
      }
      return {
          provider: 'google',
          apiKey: DEFAULT_API_KEY,
          model: 'gemini-3-pro-preview',
          theme: 'light',
          baseUrl: '',
          tokenBudget: {
              dailyLimit: 100000,
              warningThreshold: 0.8,
              enabled: false
          },
          useRAG: true // 默认启用 RAG
      };
  });

  const [novelState, setNovelState] = useState<NovelState | null>(null);

  // 1. Initialize DB
  useEffect(() => {
      const init = async () => {
          try {
              await db.init();
              setIsDBReady(true);
          } catch (e) {
              console.error("Failed to load DB", e);
              setIsDBReady(true);
          }
      };
      init();
  }, []);

  // 2. Auto-Save with Debounce
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
      if (!isDBReady || !novelState) return;

      setSaveStatus('unsaved');
      
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
          setSaveStatus('saving');
          try {
              // NovelState might contain full content for the active chapter.
              // DBService.saveProject handles stripping content to 'chapters' store.
              await db.saveProject(novelState);
              setSaveStatus('saved');
          } catch (e) {
              console.error("Auto-save failed", e);
              setSaveStatus('unsaved');
          }
      }, 2000); 

      return () => {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      };
  }, [novelState, isDBReady]);


  // Apply Theme Effect
  useEffect(() => {
    const root = document.documentElement;
    const setColors = (vars: Record<string, string>) => {
        Object.entries(vars).forEach(([key, val]) => {
            root.style.setProperty(key, val);
        });
    };
    // (Theme logic kept simplified for brevity, assuming same themes as before)
    if (appSettings.theme === 'dark') {
         root.style.setProperty('--color-paper', '15 23 42');
         root.style.setProperty('--color-ink-900', '255 255 255');
         // ... add other theme vars if needed or rely on previous CSS injection
    } else {
         root.style.setProperty('--color-paper', '253 251 247');
         root.style.setProperty('--color-ink-900', '15 23 42');
    }
  }, [appSettings.theme]);

  // Actions
  const handleCreateProject = async () => {
      const newProject = await db.createNewProject();
      setNovelState(newProject);
      setViewMode(ViewMode.SETUP);
  };

  const handleSelectProject = async (id: string) => {
      const project = await db.loadProject(id); // Loads Lean State (no content)
      if (project) {
          // Migrate legacy character data to ensure new fields have default values
          // Requirements: 1.5, 6.4
          const migratedProject = migrateProjectCharacters(project);
          setNovelState(migratedProject);
          if (migratedProject.config.title === "未命名项目") {
              setViewMode(ViewMode.SETUP);
          } else if (migratedProject.chapters.length > 0 && migratedProject.currentChapterId) {
             // If resuming a project with a selected chapter, we should load it
             await loadAndSetActiveChapter(migratedProject.currentChapterId, migratedProject);
          } else {
              setViewMode(ViewMode.STRUCTURE);
          }
      }
  };

  const handleExitProject = async () => {
      if (novelState) await db.saveProject(novelState);
      setNovelState(null);
  };

  // --- Helper to Load Chapter Content ---
  const loadAndSetActiveChapter = async (chapterId: string, currentState: NovelState) => {
      setEditorLoading(true);
      try {
          const content = await db.getChapterContent(chapterId);
          
          setNovelState(prev => {
              if (!prev) return null;
              // Clean up other chapters' content to free memory, update target
              const updatedChapters = prev.chapters.map((c: Chapter) => {
                  if (c.id === chapterId) return { ...c, content: content };
                  return { ...c, content: "" }; // Unload others
              });
              
              // Check and update URGENT status for plot loops when chapter changes
              const currentChapter = updatedChapters.find((c: Chapter) => c.id === chapterId);
              let updatedPlotLoops = prev.plotLoops;
              if (currentChapter) {
                  updatedPlotLoops = checkAndUpdateAllUrgentStatus(
                      prev.plotLoops,
                      currentChapter,
                      updatedChapters,
                      prev.volumes
                  );
              }
              
              return { 
                  ...prev, 
                  chapters: updatedChapters, 
                  currentChapterId: chapterId,
                  plotLoops: updatedPlotLoops
              };
          });
          
          setViewMode(ViewMode.WRITE);
      } catch (e) {
          console.error("Failed to load chapter content", e);
      } finally {
          setEditorLoading(false);
      }
  };

  // Updaters
  const updateWrapper = (updater: (prev: NovelState) => NovelState) => {
      if (!novelState) return;
      setNovelState(updater(novelState));
  };

  const updateConfig = (newConfig: NovelConfig) => {
      updateWrapper(prev => ({ ...prev, config: newConfig }));
      if (!novelState?.config.mainPlot && newConfig.mainPlot) {
          alert("项目设置已保存！");
          setViewMode(ViewMode.STRUCTURE);
      }
  };
  
  const updateStructure = (newStructure: WorldStructure) => updateWrapper(prev => ({ ...prev, structure: newStructure }));
  const updateCharacters = (chars: Character[]) => updateWrapper(prev => ({ ...prev, characters: chars }));
  const updateChapters = (chapters: Chapter[]) => updateWrapper(prev => ({ ...prev, chapters }));
  const updateVolumes = (volumes: Volume[]) => updateWrapper(prev => ({ ...prev, volumes }));
  const updatePlotLoops = (plotLoops: PlotLoop[]) => updateWrapper(prev => ({ ...prev, plotLoops }));

  // --- PlotLoop CRUD Operations ---
  
  // 辅助函数：更新伏笔后自动检查 URGENT 状态
  const updatePlotLoopsWithUrgentCheck = (loops: PlotLoop[]) => {
      if (!novelState) return;
      
      // 获取当前章节
      const currentChapter = novelState.chapters.find(c => c.id === novelState.currentChapterId);
      
      // 如果有当前章节，检查并更新 URGENT 状态
      if (currentChapter) {
          const checkedLoops = checkAndUpdateAllUrgentStatus(
              loops,
              currentChapter,
              novelState.chapters,
              novelState.volumes
          );
          updatePlotLoops(checkedLoops);
      } else {
          updatePlotLoops(loops);
      }
  };
  
  const handleCreatePlotLoop = (loopData: Partial<PlotLoop>) => {
      if (!novelState) return;
      
      const input: CreatePlotLoopInput = {
          title: loopData.title || '未命名伏笔',
          description: loopData.description || '',
          setupChapterId: loopData.setupChapterId || novelState.currentChapterId || '',
          importance: loopData.importance || 3,
          targetChapterId: loopData.targetChapterId,
          targetVolumeId: loopData.targetVolumeId,
          relatedCharacterIds: loopData.relatedCharacterIds,
          relatedWikiEntryIds: loopData.relatedWikiEntryIds,
          parentLoopId: loopData.parentLoopId,
          aiSuggested: loopData.aiSuggested
      };
      
      const newLoop = createPlotLoop(input);
      // 创建后自动检查 URGENT 状态
      updatePlotLoopsWithUrgentCheck([...novelState.plotLoops, newLoop]);
  };

  const handleUpdatePlotLoop = (id: string, updates: Partial<PlotLoop>) => {
      if (!novelState) return;
      const updatedLoops = updatePlotLoopInArray(id, updates, novelState.plotLoops);
      // 更新后自动检查 URGENT 状态
      updatePlotLoopsWithUrgentCheck(updatedLoops);
  };

  const handleDeletePlotLoop = (id: string) => {
      if (!novelState) return;
      const updatedLoops = deletePlotLoop(id, novelState.plotLoops);
      updatePlotLoops(updatedLoops);
  };

  const handleMarkPlotLoopClosed = (id: string, closeChapterId: string) => {
      if (!novelState) return;
      const updatedLoops = markAsClosedInArray(id, closeChapterId, novelState.plotLoops);
      updatePlotLoops(updatedLoops);
  };

  const handleMarkPlotLoopAbandoned = (id: string, reason: string) => {
      if (!novelState) return;
      const updatedLoops = markAsAbandonedInArray(id, reason, novelState.plotLoops);
      updatePlotLoops(updatedLoops);
  };
  
  const updateSingleChapter = (updated: Chapter) => {
      updateWrapper(prev => ({
          ...prev,
          chapters: prev.chapters.map(c => c.id === updated.id ? updated : c)
      }));
  };

  const handleSelectChapter = (id: string) => {
      if (novelState) loadAndSetActiveChapter(id, novelState);
  };

  const handleChangeChapter = (direction: 'next' | 'prev') => {
      if (!novelState) return;
      const currentIdx = novelState.chapters.findIndex(c => c.id === novelState.currentChapterId);
      if (currentIdx === -1) return;

      let newIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
      if (newIdx >= 0 && newIdx < novelState.chapters.length) {
          const nextId = novelState.chapters[newIdx].id;
          loadAndSetActiveChapter(nextId, novelState);
      }
  };

  const getCurrentChapter = () => {
      if (!novelState) return null;
      return novelState.chapters.find(c => c.id === novelState.currentChapterId) || null;
  };

  const updateAppSettings = (newSettings: AppSettings) => {
      setAppSettings(newSettings);
      localStorage.setItem('inkflow_settings', JSON.stringify(newSettings));
  };

  if (!isDBReady) {
      return (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-ink-50 text-ink-500">
              <Loader2 size={48} className="animate-spin text-primary mb-4" />
              <h2 className="text-xl font-bold">正在加载 InkFlow...</h2>
          </div>
      );
  }

  // --- RENDER LOGIC ---

  if (!novelState) {
      return (
          <div className="bg-paper min-h-screen text-ink-900 transition-colors duration-300">
             <ProjectDashboard 
                onSelectProject={handleSelectProject}
                onCreateProject={handleCreateProject}
             />
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-paper text-ink-900 transition-colors duration-300">
      <Sidebar 
        currentMode={viewMode} 
        setMode={setViewMode} 
        novelState={novelState} 
        onExitProject={handleExitProject}
      />
      <main className="flex-1 overflow-hidden relative">
        <div className="absolute top-4 right-8 z-50 text-xs font-mono transition-opacity duration-500 flex items-center gap-2 pointer-events-none">
            {saveStatus === 'saving' && (
                <div className="flex items-center gap-1 text-ink-400 bg-white/80 px-2 py-1 rounded-full shadow-sm">
                    <Loader2 size={10} className="animate-spin" />
                    <span>自动保存中...</span>
                </div>
            )}
            {saveStatus === 'saved' && (
                <div className="flex items-center gap-1 text-green-600 opacity-50 bg-white/50 px-2 py-1 rounded-full">
                    <Cloud size={10} />
                    <span>已保存</span>
                </div>
            )}
        </div>
        
        {/* Render ALL views but hide inactive ones to preserve state (Keep-Alive) */}
        <KeepAliveView mode={ViewMode.SETUP} activeMode={viewMode}>
            <ProjectSetup config={novelState.config} onSave={updateConfig} settings={appSettings} />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.STRUCTURE} activeMode={viewMode}>
            <StructureDesigner 
                structure={novelState.structure}
                setStructure={updateStructure}
                config={novelState.config}
                settings={appSettings}
            />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.CHARACTERS} activeMode={viewMode}>
            <CharacterForge 
                characters={novelState.characters} 
                setCharacters={updateCharacters} 
                config={novelState.config} 
                settings={appSettings}
                structure={novelState.structure}
                volumes={novelState.volumes}
                chapters={novelState.chapters}
            />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.WIKI} activeMode={viewMode}>
            <WikiSystem 
                structure={novelState.structure}
                setStructure={updateStructure}
                chapters={novelState.chapters}
                settings={appSettings}
                config={novelState.config}
            />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.OUTLINE} activeMode={viewMode}>
            <OutlineBuilder 
                chapters={novelState.chapters} 
                setChapters={updateChapters} 
                characters={novelState.characters}
                config={novelState.config}
                structure={novelState.structure}
                onSelectChapter={handleSelectChapter}
                settings={appSettings}
                volumes={novelState.volumes}
                setVolumes={updateVolumes}
            />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.TIMELINE} activeMode={viewMode}>
            <TimelineView 
                novelState={novelState}
                onSelectChapter={handleSelectChapter}
            />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.WRITE} activeMode={viewMode}>
            {editorLoading ? (
                 <div className="h-full flex items-center justify-center text-ink-400">
                    <Loader2 className="animate-spin mr-2" /> 加载章节内容...
                </div>
            ) : (
                <Editor 
                    chapter={getCurrentChapter()} 
                    allChapters={novelState.chapters}
                    characters={novelState.characters}
                    config={novelState.config}
                    structure={novelState.structure}
                    onUpdateChapter={updateSingleChapter}
                    onChangeChapter={handleChangeChapter}
                    settings={appSettings}
                    volumes={novelState.volumes}
                    plotLoops={novelState.plotLoops}
                    onCreatePlotLoop={handleCreatePlotLoop}
                    onUpdatePlotLoop={handleUpdatePlotLoop}
                    onDeletePlotLoop={handleDeletePlotLoop}
                    onMarkPlotLoopClosed={handleMarkPlotLoopClosed}
                    onMarkPlotLoopAbandoned={handleMarkPlotLoopAbandoned}
                    onAddCharacter={(char) => updateCharacters([...novelState.characters, char])}
                />
            )}
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.CHAT} activeMode={viewMode}>
            <AIChat novelState={novelState} settings={appSettings} />
        </KeepAliveView>

        <KeepAliveView mode={ViewMode.VIDEO} activeMode={viewMode}>
            <VideoStudio novelState={novelState} settings={appSettings} />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.EXPORT} activeMode={viewMode}>
            <ExportPublish 
                novelState={novelState} 
                onImportProject={(importedState) => {
                    setNovelState(importedState);
                    setViewMode(ViewMode.SETUP);
                }}
            />
        </KeepAliveView>
        
        <KeepAliveView mode={ViewMode.APP_SETTINGS} activeMode={viewMode}>
            <AppSettingsView settings={appSettings} onSave={updateAppSettings} />
        </KeepAliveView>
      </main>
    </div>
  );
};

export default App;
