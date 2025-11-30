import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chapter, Character, NovelConfig, GenerationStatus, AppSettings, WorldStructure, WikiEntry, ChapterSnapshot, Volume, PlotLoop, PlotLoopStatus } from '../types';
import { streamChapterContent, streamTextPolish, stripHtml, indexContent, generateChapterBeats, getChapterAncestors } from '../services/geminiService';
import { findPreviousChapter, extractLastContent } from '../services/volumeService';
import { indexChapterContent } from '../services/ragService';
import { prepareContentForEditor, countWords } from '../services/textFormatter';
import { db } from '../services/db';
import RichEditor from './RichEditor';
import PlotLoopPanel from './PlotLoopPanel';
import PlotLoopDetail from './PlotLoopDetail';
import { PenTool, RefreshCw, Loader2, ChevronLeft, ChevronRight, User, Info, Wand2, Scissors, Zap, Maximize2, X, Check, Copy, Sparkles, BookMarked, Minimize2, PanelRightClose, PanelRightOpen, Type, Target, History, RotateCcw, Clock, Brain, ListChecks, GitBranch, Plus, ArrowLeft, Link2 } from 'lucide-react';

interface EditorProps {
  chapter: Chapter | null;
  allChapters: Chapter[];
  characters: Character[];
  config: NovelConfig;
  structure: WorldStructure;
  onUpdateChapter: (updated: Chapter) => void;
  onChangeChapter: (direction: 'next' | 'prev') => void;
  settings: AppSettings;
  volumes: Volume[]; // 分卷列表，用于深度上下文细纲生成
  // PlotLoop integration
  plotLoops: PlotLoop[];
  onCreatePlotLoop: (loop: Partial<PlotLoop>) => void;
  onUpdatePlotLoop: (id: string, updates: Partial<PlotLoop>) => void;
  onDeletePlotLoop: (id: string) => void;
  onMarkPlotLoopClosed?: (id: string, closeChapterId: string) => void;
  onMarkPlotLoopAbandoned?: (id: string, reason: string) => void;
}

// Inline AI Menu Options
const AI_ACTIONS = [
    { id: 'polish', label: '润色语句', icon: Wand2, prompt: '润色这段文字，使其更加通顺、优美，符合网文阅读习惯。' },
    { id: 'vivid', label: '画面增强', icon: Zap, prompt: '增加画面感和细节描写，使用“Show, Don\'t Tell”的技巧，让读者身临其境。' },
    { id: 'expand', label: '扩写细节', icon: Maximize2, prompt: '扩写这段内容，丰富心理描写或环境描写，增加字数。' },
    { id: 'concise', label: '精简提炼', icon: Scissors, prompt: '精简这段文字，去除冗余，加快叙事节奏。' },
];

const Editor: React.FC<EditorProps> = ({ 
    chapter, 
    allChapters, 
    characters, 
    config,
    structure,
    onUpdateChapter,
    onChangeChapter,
    settings,
    volumes,
    plotLoops,
    onCreatePlotLoop,
    onUpdatePlotLoop,
    onDeletePlotLoop,
    onMarkPlotLoopClosed,
    onMarkPlotLoopAbandoned
}) => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [beatsStatus, setBeatsStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  
  // Selection & Menu State
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [aiMenuMode, setAiMenuMode] = useState<'idle' | 'streaming' | 'result'>('idle');
  const [aiResultText, setAiResultText] = useState('');

  // Editor View State
  const [isZenMode, setIsZenMode] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<'plan' | 'context' | 'history' | 'plotloop'>('plan');

  // PlotLoop State
  const [selectedPlotLoop, setSelectedPlotLoop] = useState<PlotLoop | null>(null);
  const [showPlotLoopDetail, setShowPlotLoopDetail] = useState(false);

  // History / Snapshots
  const [snapshots, setSnapshots] = useState<ChapterSnapshot[]>([]);

  // Session Stats
  const [sessionStartCount, setSessionStartCount] = useState(0);
  
  // Track initial word count when chapter loads to calculate session progress
  useEffect(() => {
    if (chapter) {
        setSessionStartCount(chapter.wordCount);
        loadSnapshots(chapter.id);
    }
  }, [chapter?.id]);

  const loadSnapshots = async (chapterId: string) => {
      try {
          const list = await db.getSnapshots(chapterId);
          setSnapshots(list);
      } catch (e) {
          console.error("Failed to load snapshots", e);
      }
  };

  const createSnapshot = async (note: string = "手动保存") => {
      if (!chapter) return;
      try {
          await db.saveSnapshot(chapter.id, chapter.content, note);
          await loadSnapshots(chapter.id);
      } catch (e) {
          console.error("Failed to save snapshot", e);
      }
  };

  const handleRestoreSnapshot = async (snapshot: ChapterSnapshot) => {
      if (!chapter) return;
      if (window.confirm(`确定要回滚到 ${new Date(snapshot.timestamp).toLocaleTimeString()} 的版本吗？当前未保存的修改将丢失。`)) {
          // Auto-save current state as backup before restoring
          await createSnapshot("回滚前自动备份");
          onUpdateChapter({ ...chapter, content: snapshot.content, wordCount: snapshot.wordCount });
      }
  };

  // --- Vector Indexing on Idle/Save ---
  const handleIndexChapter = async () => {
      if (!chapter || !chapter.content) return;
      if (settings.provider !== 'google') return; 
      
      // 🆕 使用新的 RAG 服务进行索引
      try {
          await indexChapterContent(chapter, settings);
          console.log('Chapter indexed successfully');
      } catch (e) {
          console.error('Failed to index chapter:', e);
      }
  };

  // --- Beats Generation ---
  const handleGenerateBeats = async () => {
      if (!chapter || !settings.apiKey) return;
      
      setBeatsStatus(GenerationStatus.THINKING);
      try {
          // 使用增强的 generateChapterBeats，传入 allChapters 和 volumes
          // 支持深度上下文：上一章结尾、钩子、祖先摘要、分卷上下文
          const beats = await generateChapterBeats(
              chapter, 
              allChapters, 
              volumes, 
              config, 
              characters, 
              settings
          );
          
          // 🆕 确保 beats 是数组
          const validBeats = Array.isArray(beats) ? beats : [];
          
          if (validBeats.length === 0) {
              console.warn('生成的细纲为空');
              alert('生成的细纲为空，请检查章节摘要是否完整，或重试。');
              setBeatsStatus(GenerationStatus.ERROR);
              return;
          }
          
          onUpdateChapter({ ...chapter, beats: validBeats });
          setBeatsStatus(GenerationStatus.COMPLETED);
      } catch (e) {
          console.error('生成细纲失败:', e);
          alert(`生成细纲失败: ${e instanceof Error ? e.message : '未知错误'}`);
          setBeatsStatus(GenerationStatus.ERROR);
      }
  };

  const updateBeat = (index: number, val: string) => {
      if (!chapter || !chapter.beats || !Array.isArray(chapter.beats)) return;
      const newBeats = [...chapter.beats];
      newBeats[index] = val;
      onUpdateChapter({ ...chapter, beats: newBeats });
  };

  const deleteBeat = (index: number) => {
      if (!chapter || !chapter.beats || !Array.isArray(chapter.beats)) return;
      const newBeats = chapter.beats.filter((_, i) => i !== index);
      onUpdateChapter({ ...chapter, beats: newBeats });
  };

  const addBeat = () => {
      if (!chapter) return;
      const currentBeats = Array.isArray(chapter.beats) ? chapter.beats : [];
      const newBeats = [...currentBeats, "新剧情点..."];
      onUpdateChapter({ ...chapter, beats: newBeats });
  };

  // --- PlotLoop Handlers ---
  const handleSelectPlotLoop = (loop: PlotLoop) => {
      setSelectedPlotLoop(loop);
      setShowPlotLoopDetail(true);
  };

  const handleCreatePlotLoop = (loopData: Partial<PlotLoop>) => {
      // If no title, open the detail modal for editing
      if (!loopData.title) {
          setSelectedPlotLoop(null);
          setShowPlotLoopDetail(true);
      }
      onCreatePlotLoop({
          ...loopData,
          setupChapterId: loopData.setupChapterId || chapter?.id || ''
      });
  };

  const handleSavePlotLoop = (loop: PlotLoop) => {
      // Check if this is a new loop or an update
      const existingLoop = plotLoops.find(l => l.id === loop.id);
      if (existingLoop) {
          onUpdatePlotLoop(loop.id, loop);
      } else {
          onCreatePlotLoop(loop);
      }
      setShowPlotLoopDetail(false);
      setSelectedPlotLoop(null);
  };

  const handleClosePlotLoopDetail = () => {
      setShowPlotLoopDetail(false);
      setSelectedPlotLoop(null);
  };

  // --- Previous Chapter Context ---
  const previousChapter = useMemo(() => {
      if (!chapter) return null;
      return findPreviousChapter(chapter, allChapters);
  }, [chapter, allChapters]);

  const previousChapterLastContent = useMemo(() => {
      if (!previousChapter) return '';
      return extractLastContent(previousChapter, 200);
  }, [previousChapter]);

  const sessionDelta = chapter ? Math.max(0, chapter.wordCount - sessionStartCount) : 0;
  const dailyTarget = config.dailyTarget || 3000;
  const progressPercent = Math.min(100, (sessionDelta / dailyTarget) * 100);

  const relevantCharacters = useMemo(() => {
    if (!chapter || !chapter.summary) return [];
    return characters.filter(c => chapter.summary.includes(c.name));
  }, [chapter, characters]);

  const relevantWikiEntries = useMemo(() => {
      if (!chapter || !chapter.content || !structure.wikiEntries) return [];
      const cleanContent = stripHtml(chapter.content);
      return structure.wikiEntries.filter(entry => 
          entry.name.length > 1 && cleanContent.includes(entry.name)
      );
  }, [chapter?.content, structure.wikiEntries]);

  // Handle Selection from RichEditor
  const handleSelectionChange = (sel: { start: number; end: number; text: string } | null, pos: {x: number, y: number} | null) => {
      if (sel) {
          setSelection(sel);
          // Get selection position from browser for floating menu
          const browserSelection = window.getSelection();
          if (browserSelection && browserSelection.rangeCount > 0) {
              const range = browserSelection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              setMenuPosition({ x: rect.left + rect.width / 2, y: rect.top });
          }
      } else {
          setSelection(null);
          setMenuPosition(null);
      }
  };

  // Handle creating plot loop from selected text
  const handleCreateLoopFromSelection = (description: string, chapterId: string) => {
      onCreatePlotLoop({
          title: description.slice(0, 50) + (description.length > 50 ? '...' : ''),
          description: description,
          setupChapterId: chapterId,
          importance: 3,
          status: PlotLoopStatus.OPEN
      });
      // Clear selection after creating
      setSelection(null);
      setMenuPosition(null);
  };

  const handleAIAction = async (actionId: string) => {
      if (!selection || !chapter) return;
      if (!settings.apiKey) {
          alert("请配置 API Key");
          return;
      }
      
      await createSnapshot("AI 润色前备份");

      setAiMenuMode('streaming');
      setAiResultText('');
      
      const action = AI_ACTIONS.find(a => a.id === actionId);
      const cleanContent = stripHtml(chapter.content);
      const contextBefore = cleanContent.slice(Math.max(0, selection.start - 500), selection.start);
      const contextAfter = cleanContent.slice(selection.end, Math.min(cleanContent.length, selection.end + 500));

      try {
          const stream = await streamTextPolish(
              selection.text,
              action?.prompt || '优化这段文字',
              contextBefore,
              contextAfter,
              settings,
              config
          );

          let fullText = "";
          for await (const chunk of stream) {
              if (chunk.text) {
                  fullText += chunk.text;
                  setAiResultText(fullText);
              }
          }
          setAiMenuMode('result');
      } catch (e) {
          console.error(e);
          setAiResultText("AI 生成出错，请检查网络或 API Key。");
          setAiMenuMode('result');
      }
  };

  const renderHighlightedSummary = (text: string) => {
    if (!text) return null;
    let parts: React.ReactNode[] = [text];
    
    characters.forEach(char => {
        const newParts: React.ReactNode[] = [];
        parts.forEach(part => {
            if (typeof part === 'string') {
                const split = part.split(char.name);
                split.forEach((s, i) => {
                    if (i > 0) {
                        newParts.push(
                            <span key={`${char.id}-${i}`} className="font-bold text-primary bg-primary-light px-1 rounded mx-0.5">
                                {char.name}
                            </span>
                        );
                    }
                    newParts.push(s);
                });
            } else {
                newParts.push(part);
            }
        });
        parts = newParts;
    });

    return parts;
  };

  const handleWrite = async () => {
    if (!settings.apiKey || !chapter) {
        alert("请先配置 API Key 或选择章节。");
        return;
    }
    
    await createSnapshot("AI 续写前备份");
    setStatus(GenerationStatus.WRITING);
    
    const startingContent = chapter.content || ""; 

    try {
        // Pass all chapters and volumes so streamChapterContent can use deep context
        const responseStream = await streamChapterContent(chapter, allChapters, config, characters, settings, structure, volumes);
        
        let fullText = "";
        let currentContent = startingContent;

        for await (const chunk of responseStream) {
             if (chunk.text) {
                 fullText += chunk.text;
                 // 🆕 实时格式化显示（简单处理，避免频繁格式化影响性能）
                 currentContent = startingContent + fullText;
                 onUpdateChapter({ 
                     ...chapter, 
                     content: currentContent, 
                     wordCount: stripHtml(currentContent).length 
                 });
             }
        }
        
        // 🆕 生成完成后，进行完整的格式化处理
        const formattedContent = startingContent + prepareContentForEditor(fullText);
        onUpdateChapter({ 
            ...chapter, 
            content: formattedContent, 
            wordCount: countWords(formattedContent)
        });
        
        await createSnapshot("AI 续写完成");
        handleIndexChapter();
        setStatus(GenerationStatus.COMPLETED);
    } catch (e) {
        console.error("Error writing chapter", e);
        setStatus(GenerationStatus.ERROR);
    }
  };

  if (!chapter) {
      return (
          <div className="h-full flex items-center justify-center text-ink-400">
              <div className="text-center">
                  <PenTool size={48} className="mx-auto mb-4 opacity-50" />
                  <p>请从大纲中选择一章开始写作。</p>
              </div>
          </div>
      );
  }

  // --- RENDER ---
  
  const containerClasses = isZenMode 
    ? "fixed inset-0 z-50 bg-paper flex flex-col animate-in fade-in duration-300" 
    : "h-full flex flex-col bg-white relative";

  return (
    <div className={containerClasses}>
      {/* Editor Toolbar */}
      <div className={`h-14 border-b border-ink-200 flex items-center justify-between px-6 bg-white shrink-0 shadow-sm transition-all ${isZenMode ? 'opacity-0 hover:opacity-100' : ''}`}>
        <div className="flex items-center space-x-4">
             {/* Chapter Nav */}
             <div className="flex items-center gap-1 mr-2">
                 <button onClick={() => onChangeChapter('prev')} disabled={chapter.order === 1} className="p-1.5 text-ink-500 hover:bg-ink-100 rounded disabled:opacity-30"><ChevronLeft size={18} /></button>
                 <span className="text-xs font-mono text-ink-400 min-w-[3ch] text-center">{chapter.order}</span>
                 <button onClick={() => onChangeChapter('next')} disabled={chapter.order === allChapters.length} className="p-1.5 text-ink-500 hover:bg-ink-100 rounded disabled:opacity-30"><ChevronRight size={18} /></button>
             </div>
             
             <h3 className="font-bold text-ink-800 truncate max-w-xs flex items-center gap-2">
                 {chapter.title}
                 {chapter.parentId && (
                     <span title="分支剧情">
                         <GitBranch size={12} className="text-purple-500" />
                     </span>
                 )}
             </h3>
             
             {/* Word Count & Session Stats */}
             <div className="flex items-center gap-4 text-xs">
                 <div className="bg-ink-100 px-2 py-1 rounded text-ink-500">
                     总字数: {chapter.wordCount}
                 </div>
                 <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100" title={`今日目标: ${dailyTarget}`}>
                     <Target size={12} />
                     <span>会话: +{sessionDelta}</span>
                     <div className="w-16 h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                         <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                     </div>
                 </div>
             </div>
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
             
             {/* Zen Toggle */}
             <button 
                onClick={() => setIsZenMode(!isZenMode)}
                className={`p-2 rounded-lg transition ${isZenMode ? 'bg-indigo-100 text-indigo-600' : 'text-ink-500 hover:bg-ink-100'}`}
                title={isZenMode ? "退出沉浸模式" : "进入沉浸模式"}
             >
                {isZenMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
             </button>

             {/* Right Panel Toggle (Non-Zen only) */}
             {!isZenMode && (
                 <button 
                    onClick={() => setShowRightPanel(!showRightPanel)}
                    className={`p-2 rounded-lg transition ${showRightPanel ? 'text-primary bg-primary-light' : 'text-ink-400 hover:bg-ink-100'}`}
                 >
                    {showRightPanel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                 </button>
             )}

            <div className="w-px h-6 bg-ink-200 mx-2"></div>
            
            <button
                onClick={handleWrite}
                disabled={status === GenerationStatus.WRITING}
                className="flex items-center space-x-2 bg-primary hover:bg-primary-hover disabled:bg-ink-400 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm"
            >
                {status === GenerationStatus.WRITING ? (
                    <><Loader2 className="animate-spin" size={16} /><span>写作中...</span></>
                ) : (
                    <><RefreshCw size={16} /><span>AI 续写</span></>
                )}
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
          {/* Editor Area */}
          <div className={`flex-1 overflow-y-auto bg-paper relative transition-colors duration-300 ${isZenMode ? 'flex justify-center' : ''}`}>
            <div className={`${isZenMode ? 'max-w-4xl w-full' : 'max-w-3xl mx-auto'} py-8 px-8 min-h-full bg-white/50 shadow-sm my-4 ${!isZenMode && 'border-x border-ink-100/50'} backdrop-blur-sm relative transition-all duration-500 flex flex-col`}>
                
                {/* Writing Hints / Beats Preview */}
                {!isZenMode && (
                    <div className="mb-6 p-4 bg-yellow-50/80 border border-yellow-100 rounded-lg text-sm text-yellow-800 leading-relaxed relative group transition-opacity hover:opacity-100 opacity-60">
                        <span className="font-bold block mb-1 uppercase text-xs tracking-wider text-yellow-600 flex items-center gap-1">
                            <Info size={12} /> 本章目标
                        </span>
                        <div>{renderHighlightedSummary(chapter.summary)}</div>
                    </div>
                )}

                {/* RICH TEXT EDITOR */}
                <RichEditor 
                    content={chapter.content}
                    onChange={(html, text) => {
                        onUpdateChapter({...chapter, content: html, wordCount: text.length});
                    }}
                    onSelectionChange={handleSelectionChange}
                    className="min-h-[60vh]"
                />

                {/* AI Result Modal */}
                {aiMenuMode !== 'idle' && (
                     <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
                         <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full">
                             <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                 <Sparkles className="text-primary" /> AI 建议
                             </h3>
                             <div className="bg-ink-50 p-4 rounded-lg mb-4 max-h-60 overflow-y-auto font-serif leading-relaxed">
                                 {aiResultText || <span className="flex items-center gap-2 text-ink-500"><Loader2 className="animate-spin" /> 正在思考优化方案...</span>}
                             </div>
                             <div className="flex gap-3 justify-end">
                                 <button onClick={() => setAiMenuMode('idle')} className="px-4 py-2 text-ink-500 hover:bg-ink-100 rounded-lg">取消</button>
                                 {aiMenuMode === 'result' && (
                                     <>
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(aiResultText);
                                                setAiMenuMode('idle');
                                            }} 
                                            className="px-4 py-2 border border-ink-200 rounded-lg hover:bg-ink-50 flex items-center gap-2"
                                        >
                                            <Copy size={16} /> 复制
                                        </button>
                                        <button 
                                            onClick={() => {
                                                alert("请复制内容并手动粘贴到编辑器中");
                                            }} 
                                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                                        >
                                            <Check size={16} /> 完成
                                        </button>
                                     </>
                                 )}
                             </div>
                         </div>
                     </div>
                )}
            </div>
          </div>

          {/* Right Sidebar */}
          {!isZenMode && showRightPanel && (
              <div className="w-80 bg-white border-l border-ink-200 hidden xl:flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-right duration-300">
                 {/* Tabs */}
                 <div className="flex border-b border-ink-100 bg-ink-50/50">
                     <button 
                        onClick={() => setActiveRightTab('plan')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeRightTab === 'plan' ? 'text-primary border-b-2 border-primary bg-white' : 'text-ink-400 hover:text-ink-600'}`}
                     >
                         细纲
                     </button>
                     <button 
                        onClick={() => setActiveRightTab('plotloop')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeRightTab === 'plotloop' ? 'text-primary border-b-2 border-primary bg-white' : 'text-ink-400 hover:text-ink-600'}`}
                     >
                         悬念
                     </button>
                     <button 
                        onClick={() => setActiveRightTab('context')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeRightTab === 'context' ? 'text-primary border-b-2 border-primary bg-white' : 'text-ink-400 hover:text-ink-600'}`}
                     >
                         上下文
                     </button>
                     <button 
                        onClick={() => setActiveRightTab('history')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeRightTab === 'history' ? 'text-primary border-b-2 border-primary bg-white' : 'text-ink-400 hover:text-ink-600'}`}
                     >
                         历史
                     </button>
                 </div>

                 <div className="flex-1 overflow-y-auto">
                     
                     {/* TAB: PLOT LOOPS (悬念) */}
                     {activeRightTab === 'plotloop' && (
                         <PlotLoopPanel
                             plotLoops={plotLoops}
                             currentChapterId={chapter?.id || null}
                             chapters={allChapters}
                             volumes={volumes}
                             characters={characters}
                             wikiEntries={structure.wikiEntries || []}
                             onCreateLoop={handleCreatePlotLoop}
                             onUpdateLoop={onUpdatePlotLoop}
                             onDeleteLoop={onDeletePlotLoop}
                             onSelectLoop={handleSelectPlotLoop}
                         />
                     )}
                     
                     {/* TAB: PLANNING (BEATS) */}
                     {activeRightTab === 'plan' && (
                         <div className="space-y-4 p-4">
                             {/* Previous Chapter Context */}
                             {previousChapter && (
                                 <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm">
                                     <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                                         <ArrowLeft size={14} /> 上一章: {previousChapter.title}
                                     </h4>
                                     {previousChapterLastContent && (
                                         <div>
                                             <p className="text-[10px] text-amber-600 uppercase tracking-wider mb-1">结尾内容</p>
                                             <p className="text-xs text-ink-600 bg-white/50 p-2 rounded border border-amber-100 line-clamp-4">
                                                 ...{previousChapterLastContent}
                                             </p>
                                         </div>
                                     )}
                                 </div>
                             )}

                             {/* Beats Section */}
                             <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm">
                                <h4 className="font-bold text-indigo-800 mb-1 flex items-center gap-2">
                                    <ListChecks size={16} /> 剧情节点 (Beats)
                                </h4>
                                <p className="text-xs text-indigo-600 mb-3">生成具体的剧情步骤，AI 将严格按照此顺序写作。</p>
                                
                                {beatsStatus === GenerationStatus.THINKING ? (
                                    <div className="flex items-center gap-2 text-indigo-500 py-2 justify-center">
                                        <Loader2 className="animate-spin" size={16} /> 正在构思细纲...
                                    </div>
                                ) : (
                                    <button 
                                        onClick={handleGenerateBeats}
                                        className="w-full bg-white border border-indigo-200 text-indigo-600 text-xs font-bold py-1.5 rounded hover:bg-indigo-50 transition"
                                    >
                                        ✨ AI 生成细纲
                                    </button>
                                )}
                             </div>

                             <div className="space-y-2">
                                 {chapter.beats && Array.isArray(chapter.beats) && chapter.beats.map((beat, idx) => (
                                     <div key={idx} className="flex gap-2 items-start group">
                                         <span className="text-ink-300 text-xs font-mono mt-1.5">{idx+1}.</span>
                                         <textarea 
                                            value={beat}
                                            onChange={(e) => updateBeat(idx, e.target.value)}
                                            className="flex-1 text-sm p-2 border border-ink-200 rounded bg-white focus:ring-1 focus:ring-primary outline-none resize-none h-auto overflow-hidden"
                                            rows={2}
                                         />
                                         <button 
                                            onClick={() => deleteBeat(idx)}
                                            className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1.5"
                                         >
                                             &times;
                                         </button>
                                     </div>
                                 ))}
                                 <button onClick={addBeat} className="text-xs text-ink-400 hover:text-primary flex items-center gap-1 w-full justify-center py-2 border border-dashed border-ink-200 rounded">
                                     <Plus size={12} /> 添加节点
                                 </button>
                             </div>

                         </div>
                     )}

                     {/* TAB: CONTEXT */}
                     {activeRightTab === 'context' && (
                        <div className="p-4">
                            {settings.provider === 'google' && (
                                <div className="mb-4">
                                    <button 
                                        onClick={handleIndexChapter} 
                                        className="w-full py-2 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg border border-indigo-100 hover:bg-indigo-100 flex items-center justify-center gap-2"
                                        title="将当前章节写入向量数据库"
                                    >
                                        <Brain size={14} /> 记忆同步 (Vector Index)
                                    </button>
                                </div>
                            )}

                            <h4 className="font-bold text-ink-400 uppercase text-xs tracking-wider mb-2">本章相关角色</h4>
                            {relevantCharacters.length > 0 ? (
                                <div className="space-y-3 mb-6">
                                    {relevantCharacters.map(char => (
                                        <div key={char.id} className="p-3 bg-ink-50 rounded-lg border border-ink-100 text-sm hover:border-primary/30 transition-colors cursor-default group">
                                            <div className="font-bold text-primary flex items-center gap-2 mb-1">
                                                <User size={14} />{char.name}
                                            </div>
                                            <div className="text-xs text-ink-500 mb-2">{char.role}</div>
                                            <p className="text-xs text-ink-600 line-clamp-3 group-hover:line-clamp-none transition-all">{char.personality}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-ink-400 italic mb-6">摘要中未检测到特定角色。</p>
                            )}

                            <div className="pt-2 border-t border-ink-100">
                                <h4 className="font-bold text-ink-400 uppercase text-xs tracking-wider mb-2 flex items-center gap-1">
                                    <BookMarked size={12} /> 上下文百科
                                </h4>
                                {relevantWikiEntries.length > 0 ? (
                                    <div className="space-y-3">
                                        {relevantWikiEntries.map(entry => (
                                            <div key={entry.id} className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 text-sm">
                                                <div className="font-bold text-emerald-700 mb-1 flex justify-between">
                                                    <span>{entry.name}</span>
                                                    <span className="text-[9px] px-1 border border-emerald-200 rounded">{entry.category}</span>
                                                </div>
                                                <p className="text-xs text-ink-600">{entry.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-ink-400 italic">正文中暂未检测到已录入的百科词条。</p>
                                )}
                            </div>
                            
                            {structure.globalMemory && (
                                <div className="mt-6 pt-4 border-t border-ink-100">
                                    <h4 className="font-bold text-rose-500 uppercase text-xs tracking-wider mb-2">全局备忘 (Bible)</h4>
                                    <div className="p-3 bg-rose-50 rounded-lg border border-rose-100 text-xs text-ink-600 leading-relaxed max-h-60 overflow-y-auto">
                                        {structure.globalMemory}
                                    </div>
                                </div>
                            )}
                        </div>
                     )}

                     {/* TAB: HISTORY */}
                     {activeRightTab === 'history' && (
                        <div className="space-y-4 p-4">
                            <button 
                                onClick={() => createSnapshot()}
                                className="w-full py-2 bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition"
                            >
                                <History size={14} />
                                创建当前快照
                            </button>
                            
                            <div className="space-y-3">
                                {snapshots.length === 0 && <p className="text-xs text-ink-400 text-center py-4">暂无历史版本</p>}
                                {snapshots.map(snap => (
                                    <div key={snap.id} className="bg-ink-50 border border-ink-200 rounded-lg p-3 hover:border-primary/50 transition group">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="flex items-center gap-1 text-xs font-bold text-ink-700">
                                                <Clock size={12} />
                                                {new Date(snap.timestamp).toLocaleString()}
                                            </div>
                                            <span className="text-[10px] bg-white border px-1 rounded text-ink-400">
                                                {snap.wordCount}字
                                            </span>
                                        </div>
                                        {snap.note && <p className="text-xs text-ink-500 mb-2 italic">"{snap.note}"</p>}
                                        <div className="flex gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleRestoreSnapshot(snap)}
                                                className="flex-1 bg-white border border-ink-200 hover:bg-primary hover:text-white hover:border-primary text-xs py-1 rounded transition flex items-center justify-center gap-1"
                                                title="回滚"
                                            >
                                                <RotateCcw size={12} /> 恢复
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                     )}
                 </div>
              </div>
          )}
      </div>

      {/* Floating AI & PlotLoop Toolbar - positioned near selection, at root level to avoid overflow clipping */}
      {selection && menuPosition && aiMenuMode === 'idle' && chapter && (
          <div 
              className="fixed z-[100] bg-white border border-ink-200 shadow-xl rounded-full p-2 flex gap-2 animate-in fade-in duration-200"
              style={{
                  left: Math.min(Math.max(menuPosition.x - 250, 10), window.innerWidth - 550),
                  top: Math.max(menuPosition.y + 30, 10)
              }}
          >
               {AI_ACTIONS.map(action => (
                  <button
                      key={action.id}
                      onClick={() => handleAIAction(action.id)}
                      className="p-2 hover:bg-ink-100 rounded-full text-ink-600 hover:text-primary transition-colors flex items-center gap-2 px-3"
                      title={action.prompt}
                  >
                      <action.icon size={16} />
                      <span className="text-xs font-bold">{action.label}</span>
                  </button>
               ))}
               {/* Divider */}
               <div className="w-px h-6 bg-ink-200 self-center mx-1" />
               {/* Plot Loop Button */}
               <button
                  onClick={() => {
                      handleCreateLoopFromSelection(selection.text, chapter.id);
                  }}
                  className="p-2 hover:bg-purple-50 rounded-full text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-2 px-3"
                  title="将选中文本设为伏笔"
               >
                  <Link2 size={16} />
                  <span className="text-xs font-bold">设为伏笔</span>
               </button>
          </div>
      )}

      {/* PlotLoop Detail Modal */}
      {showPlotLoopDetail && (
          <PlotLoopDetail
              loop={selectedPlotLoop}
              chapters={allChapters}
              volumes={volumes}
              characters={characters}
              wikiEntries={structure.wikiEntries || []}
              allLoops={plotLoops}
              onSave={handleSavePlotLoop}
              onClose={handleClosePlotLoopDetail}
              onDelete={onDeletePlotLoop}
              onMarkClosed={onMarkPlotLoopClosed}
              onMarkAbandoned={onMarkPlotLoopAbandoned}
          />
      )}
    </div>
  );
};

export default Editor;