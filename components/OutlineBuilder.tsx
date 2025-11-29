
import React, { useState, useMemo } from 'react';
import { Chapter, Character, NovelConfig, GenerationStatus, WorldStructure, AppSettings } from '../types';
import { generateOutline, extendOutline } from '../services/geminiService';
import { List, PlayCircle, Loader2, GripVertical, Plus, TrendingUp, Sparkles, Map, GitBranch, GitMerge, ChevronRight, ChevronDown } from 'lucide-react';

interface OutlineBuilderProps {
  chapters: Chapter[];
  setChapters: (chapters: Chapter[]) => void;
  characters: Character[];
  config: NovelConfig;
  structure?: WorldStructure;
  onSelectChapter: (id: string) => void;
  settings: AppSettings;
}

// Tree Node Component
interface ChapterNodeProps {
    chapter: Chapter;
    allChapters: Chapter[];
    depth: number;
    onSelect: (id: string) => void;
    onAddBranch: (parentId: string) => void;
}

const ChapterNode: React.FC<ChapterNodeProps> = ({ chapter, allChapters, depth, onSelect, onAddBranch }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    
    const children = allChapters
        .filter(c => c.parentId === chapter.id)
        .sort((a, b) => a.order - b.order); // Order among siblings

    const hasChildren = children.length > 0;

    return (
        <div className="relative">
            {/* Connection Line */}
            {depth > 0 && (
                <div 
                    className="absolute border-l-2 border-ink-200"
                    style={{ left: -12, top: 0, bottom: hasChildren ? 0 : 20, height: hasChildren ? '100%' : '20px' }}
                ></div>
            )}
            
            <div className="mb-3 relative group">
                {/* Horizontal branch connector */}
                {depth > 0 && (
                    <div className="absolute border-t-2 border-ink-200 w-3" style={{ left: -12, top: 24 }}></div>
                )}

                <div 
                    className={`bg-white p-4 rounded-lg border transition-all cursor-pointer relative overflow-hidden flex flex-col gap-2
                        ${children.length > 1 ? 'border-l-4 border-l-purple-400' : 'border-ink-200 hover:border-primary/50'}
                    `}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(chapter.id);
                    }}
                >
                    {/* Tension Strip */}
                    <div 
                        className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/30 to-primary opacity-50"
                        style={{ opacity: (chapter.tension || 5) / 10 }}
                    ></div>

                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                            {hasChildren && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                    className="p-0.5 hover:bg-ink-100 rounded"
                                >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            )}
                            <h4 className="font-bold text-ink-800 text-sm">
                                {depth === 0 ? `第 ${chapter.order} 章: ` : ''}{chapter.title}
                            </h4>
                            {children.length > 1 && (
                                <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <GitBranch size={10} /> 分支点
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                             <span className={`text-[10px] px-2 py-0.5 rounded-full ${chapter.wordCount > 50 ? 'bg-green-100 text-green-700' : 'bg-ink-100 text-ink-500'}`}>
                                {chapter.wordCount > 50 ? `${chapter.wordCount}字` : '草稿'}
                             </span>
                             <button 
                                onClick={(e) => { e.stopPropagation(); onAddBranch(chapter.id); }}
                                className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-purple-600 p-1 hover:bg-purple-50 rounded"
                                title="创建分支剧情"
                             >
                                 <GitBranch size={14} />
                             </button>
                        </div>
                    </div>
                    
                    <p className="text-xs text-ink-600 line-clamp-3 leading-relaxed">{chapter.summary}</p>
                </div>
            </div>

            {/* Render Children */}
            {isExpanded && hasChildren && (
                <div className="ml-6 border-l-2 border-ink-100 pl-4 space-y-2">
                    {children.map(child => (
                        <ChapterNode 
                            key={child.id} 
                            chapter={child} 
                            allChapters={allChapters} 
                            depth={depth + 1} 
                            onSelect={onSelect}
                            onAddBranch={onAddBranch}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const OutlineBuilder: React.FC<OutlineBuilderProps> = ({ 
    chapters, 
    setChapters, 
    characters, 
    config, 
    structure,
    onSelectChapter,
    settings 
}) => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [extendStatus, setExtendStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);

  const handleGenerate = async () => {
    if (!settings.apiKey) {
        alert("请先在应用设置中配置 API Key。");
        return;
    }
    if (characters.length === 0) {
        alert("请先创建角色。");
        return;
    }
    setStatus(GenerationStatus.THINKING);
    try {
      const newChapters = await generateOutline(config, characters, structure, settings);
      setChapters(newChapters);
      setStatus(GenerationStatus.COMPLETED);
    } catch (e) {
      console.error(e);
      setStatus(GenerationStatus.ERROR);
    }
  };

  const handleExtend = async () => {
      if (!settings.apiKey) {
        alert("请先在应用设置中配置 API Key。");
        return;
      }
      setExtendStatus(GenerationStatus.THINKING);
      try {
          const newChapters = await extendOutline(config, characters, chapters, settings, structure);
          // Auto-link new chapters to the last root chapter if linear, or handle complex linking?
          // For simplicity, extendOutline returns chapters with continuous order.
          // We can assume they attach to the last root chapter or just append as roots for now.
          // Better: If tree exists, find the "leafest" node of the main trunk? 
          // Current extendOutline assumes linear append. Let's keep it linear for "Extend" button.
          // The "Branch" button handles tree creation.
          setChapters([...chapters, ...newChapters]);
          setExtendStatus(GenerationStatus.COMPLETED);
      } catch (e) {
          console.error(e);
          setExtendStatus(GenerationStatus.ERROR);
      }
  };

  const handleAddBranch = (parentId: string) => {
      const parent = chapters.find(c => c.id === parentId);
      if (!parent) return;

      const newId = crypto.randomUUID();
      // Find siblings to determine order
      const siblings = chapters.filter(c => c.parentId === parentId);
      const newOrder = siblings.length + 1;

      const newBranch: Chapter = {
          id: newId,
          parentId: parentId,
          order: newOrder,
          title: "新分支剧情",
          summary: "在此处编写分支剧情...",
          content: "",
          wordCount: 0,
          tension: 5
      };
      setChapters([...chapters, newBranch]);
  };

  // Identify Roots (No parent, or parent not in list)
  const rootChapters = useMemo(() => {
      // Sort by order
      return chapters.filter(c => !c.parentId).sort((a, b) => a.order - b.order);
  }, [chapters]);

  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold text-ink-900 mb-2">剧情大纲</h2>
          <p className="text-ink-500">规划故事主干与分支走向。</p>
        </div>
        <div className="flex space-x-3">
             <button
                onClick={handleGenerate}
                disabled={status === GenerationStatus.THINKING || extendStatus === GenerationStatus.THINKING}
                className="flex items-center space-x-2 bg-primary hover:bg-primary-hover disabled:bg-ink-300 text-white px-5 py-2.5 rounded-lg font-medium transition shadow-sm"
                >
                {status === GenerationStatus.THINKING ? (
                    <><Loader2 className="animate-spin" size={18} /><span>重构中...</span></>
                ) : (
                    <><List size={18} /><span>{chapters.length > 0 ? '重生成大纲' : '生成大纲'}</span></>
                )}
            </button>
        </div>
      </div>
      
      {/* Hints */}
      {(!structure?.worldView || structure.keyPlotPoints.length === 0) && (
          <div className="mb-6 bg-yellow-50 border border-yellow-100 text-yellow-800 px-4 py-3 rounded-lg flex items-start gap-3 text-sm">
               <Map size={18} className="shrink-0 mt-0.5" />
               <div>
                   <p className="font-bold">建议先构建世界观</p>
                   <p>您尚未定义详细的世界观或关键剧情节点。建议先前往“世界观与架构”页面。</p>
               </div>
          </div>
      )}

      {/* Tree Visualization */}
      <div className="max-w-4xl pb-10">
        {rootChapters.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-ink-200 rounded-xl">
                <p className="text-ink-400">暂无章节。点击上方按钮生成，或手动添加。</p>
            </div>
        )}

        <div className="space-y-6">
            {rootChapters.map(root => (
                <ChapterNode 
                    key={root.id}
                    chapter={root}
                    allChapters={chapters}
                    depth={0}
                    onSelect={onSelectChapter}
                    onAddBranch={handleAddBranch}
                />
            ))}
        </div>
        
        {chapters.length > 0 && (
             <div className="flex space-x-4 pt-8">
                 <button 
                    onClick={handleExtend}
                    disabled={extendStatus === GenerationStatus.THINKING}
                    className="flex-1 py-4 bg-ink-50 border-2 border-dashed border-primary/30 rounded-lg text-primary hover:bg-ink-100 hover:border-primary/50 transition-colors flex justify-center items-center space-x-2"
                 >
                    {extendStatus === GenerationStatus.THINKING ? (
                        <><Loader2 className="animate-spin" size={20} /><span>AI 正在思考后续剧情...</span></>
                    ) : (
                        <><Sparkles size={20} /><span>AI 续写主线 (Linear Extend)</span></>
                    )}
                 </button>
                 
                 <button 
                    onClick={() => {
                         const newOrder = rootChapters.length + 1;
                         const newChapter: Chapter = {
                             id: crypto.randomUUID(),
                             order: newOrder,
                             title: "新章节",
                             summary: "点击编辑剧情摘要...",
                             content: "",
                             wordCount: 0,
                             tension: 5,
                             parentId: null
                         };
                         setChapters([...chapters, newChapter]);
                    }}
                    className="w-16 py-4 border-2 border-dashed border-ink-200 rounded-lg text-ink-400 hover:border-ink-400 hover:text-ink-600 transition-colors flex justify-center items-center"
                    title="手动添加主线章节"
                 >
                    <Plus size={20} />
                 </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default OutlineBuilder;
