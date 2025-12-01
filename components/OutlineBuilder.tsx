
import React, { useState, useMemo } from 'react';
import { Chapter, Character, NovelConfig, GenerationStatus, WorldStructure, AppSettings, Volume } from '../types';
import { generateOutline, extendOutline, generateVolumeSummary } from '../services/geminiService';
import { 
  createVolume, 
  deleteVolume, 
  moveChapterToVolume, 
  updateVolumeInArray,
  validateVolumeData,
  MAX_TITLE_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_CONFLICT_LENGTH
} from '../services/volumeService';
import VolumeCard from './VolumeCard';
import { List, Loader2, Plus, Sparkles, Map, GitBranch, ChevronRight, ChevronDown, BookOpen, X } from 'lucide-react';

interface OutlineBuilderProps {
  chapters: Chapter[];
  setChapters: (chapters: Chapter[]) => void;
  characters: Character[];
  config: NovelConfig;
  structure?: WorldStructure;
  onSelectChapter: (id: string) => void;
  settings: AppSettings;
  volumes: Volume[];
  setVolumes: (volumes: Volume[]) => void;
}

// Volume Edit Dialog
interface VolumeDialogProps {
  volume?: Volume;
  onSave: (data: { title: string; summary: string; coreConflict: string; expectedWordCount?: number }) => void;
  onClose: () => void;
}

const VolumeDialog: React.FC<VolumeDialogProps> = ({ volume, onSave, onClose }) => {
  const [title, setTitle] = useState(volume?.title || '');
  const [summary, setSummary] = useState(volume?.summary || '');
  const [coreConflict, setCoreConflict] = useState(volume?.coreConflict || '');
  const [expectedWordCount, setExpectedWordCount] = useState(volume?.expectedWordCount?.toString() || '');
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate before saving
    const validation = validateVolumeData({
      title,
      summary,
      coreConflict,
      expectedWordCount: expectedWordCount ? parseInt(expectedWordCount) : undefined
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    onSave({
      title: title || '未命名分卷',
      summary,
      coreConflict,
      expectedWordCount: expectedWordCount ? parseInt(expectedWordCount) : undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-ink-100">
          <h3 className="font-bold text-lg text-ink-800">
            {volume ? '编辑分卷' : '新建分卷'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded">
            <X size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Error Display */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <ul className="text-sm text-red-600 space-y-1">
                {errors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-ink-700">分卷标题</label>
              <span className={`text-xs ${title.length > MAX_TITLE_LENGTH ? 'text-red-500' : 'text-ink-400'}`}>
                {title.length}/{MAX_TITLE_LENGTH}
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="如：第一卷：崛起"
              maxLength={MAX_TITLE_LENGTH + 10}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                title.length > MAX_TITLE_LENGTH ? 'border-red-300' : 'border-ink-200'
              }`}
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-ink-700">分卷摘要</label>
              <span className={`text-xs ${summary.length > MAX_SUMMARY_LENGTH ? 'text-red-500' : 'text-ink-400'}`}>
                {summary.length}/{MAX_SUMMARY_LENGTH}
              </span>
            </div>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="简要描述本卷的主要内容（100-300字）"
              rows={3}
              maxLength={MAX_SUMMARY_LENGTH + 50}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none ${
                summary.length > MAX_SUMMARY_LENGTH ? 'border-red-300' : 'border-ink-200'
              }`}
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-ink-700">核心冲突</label>
              <span className={`text-xs ${coreConflict.length > MAX_CONFLICT_LENGTH ? 'text-red-500' : 'text-ink-400'}`}>
                {coreConflict.length}/{MAX_CONFLICT_LENGTH}
              </span>
            </div>
            <textarea
              value={coreConflict}
              onChange={e => setCoreConflict(e.target.value)}
              placeholder="本卷的主要矛盾和冲突"
              rows={2}
              maxLength={MAX_CONFLICT_LENGTH + 50}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none ${
                coreConflict.length > MAX_CONFLICT_LENGTH ? 'border-red-300' : 'border-ink-200'
              }`}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">预期字数（可选）</label>
            <input
              type="number"
              value={expectedWordCount}
              onChange={e => setExpectedWordCount(e.target.value)}
              placeholder="如：200000"
              min="0"
              max="10000000"
              className="w-full px-3 py-2 border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-ink-600 hover:bg-ink-100 rounded-lg transition"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition"
            >
              {volume ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Tree Node Component
interface ChapterNodeProps {
    chapter: Chapter;
    allChapters: Chapter[];
    depth: number;
    onSelect: (id: string) => void;
    onAddBranch: (parentId: string) => void;
    onDelete?: (id: string) => void;
    onUpdate?: (chapter: Chapter) => void;
}

const ChapterNode: React.FC<ChapterNodeProps> = ({ chapter, allChapters, depth, onSelect, onAddBranch, onDelete, onUpdate }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(chapter.title);
    const [editSummary, setEditSummary] = useState(chapter.summary);
    
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
                             {onDelete && (
                               <button 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (window.confirm(`确定要删除章节"${chapter.title}"吗？`)) {
                                      onDelete(chapter.id);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-500 p-1 hover:bg-red-50 rounded"
                                  title="删除章节"
                               >
                                   <X size={14} />
                               </button>
                             )}
                        </div>
                    </div>
                    
                    {/* 摘要显示/编辑 */}
                    {isEditing ? (
                        <div className="space-y-2" onClick={e => e.stopPropagation()}>
                            <input
                                type="text"
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                placeholder="章节标题"
                                className="w-full p-2 text-sm border border-ink-300 rounded focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                            />
                            <textarea
                                value={editSummary}
                                onChange={e => setEditSummary(e.target.value)}
                                placeholder="剧情摘要..."
                                rows={3}
                                className="w-full p-2 text-xs border border-ink-300 rounded focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditTitle(chapter.title);
                                        setEditSummary(chapter.summary);
                                    }}
                                    className="px-3 py-1 text-xs text-ink-500 hover:bg-ink-100 rounded"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => {
                                        if (onUpdate) {
                                            onUpdate({ ...chapter, title: editTitle, summary: editSummary });
                                        }
                                        setIsEditing(false);
                                    }}
                                    className="px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary-hover"
                                >
                                    保存
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p 
                            className="text-xs text-ink-600 line-clamp-3 leading-relaxed cursor-pointer hover:bg-ink-50 p-1 -m-1 rounded"
                            onClick={e => {
                                e.stopPropagation();
                                setIsEditing(true);
                            }}
                            title="点击编辑摘要"
                        >
                            {chapter.summary || <span className="text-ink-400 italic">点击添加剧情摘要...</span>}
                        </p>
                    )}
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
                            onDelete={onDelete}
                            onUpdate={onUpdate}
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
    settings,
    volumes,
    setVolumes
}) => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [extendStatus, setExtendStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  
  // Volume management state
  const [expandedVolumeIds, setExpandedVolumeIds] = useState<Set<string>>(new Set());
  const [showVolumeDialog, setShowVolumeDialog] = useState(false);
  const [editingVolume, setEditingVolume] = useState<Volume | null>(null);
  const [dragOverVolumeId, setDragOverVolumeId] = useState<string | null>(null);
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!settings.apiKey) {
        alert("请先在应用设置中配置 API Key。");
        return;
    }
    if (characters.length === 0) {
        alert("请先创建角色。");
        return;
    }
    
    // 如果已有章节，确认是否要替换
    if (chapters.length > 0) {
      const confirmed = window.confirm("重新生成大纲将替换所有现有章节，确定要继续吗？");
      if (!confirmed) return;
    }
    
    setStatus(GenerationStatus.THINKING);
    try {
      const newChapters = await generateOutline(config, characters, structure, settings);
      
      // 清空所有分卷的 chapterIds，因为旧章节已被替换
      const clearedVolumes = volumes.map(v => ({
        ...v,
        chapterIds: []
      }));
      setVolumes(clearedVolumes);
      
      // 替换章节
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
          tension: 5,
          volumeId: null,
          hooks: []
      };
      setChapters([...chapters, newBranch]);
  };

  const handleDeleteChapter = (chapterId: string) => {
      // 删除章节及其所有子章节
      const getDescendantIds = (id: string): string[] => {
          const children = chapters.filter(c => c.parentId === id);
          return [id, ...children.flatMap(c => getDescendantIds(c.id))];
      };
      
      const idsToDelete = new Set(getDescendantIds(chapterId));
      const remainingChapters = chapters.filter(c => !idsToDelete.has(c.id));
      
      // 从分卷中移除被删除的章节
      const updatedVolumes = volumes.map(v => ({
          ...v,
          chapterIds: v.chapterIds?.filter(id => !idsToDelete.has(id)) || []
      }));
      
      setVolumes(updatedVolumes);
      setChapters(remainingChapters);
  };

  // 更新章节（标题、摘要等）
  const handleUpdateChapter = (updatedChapter: Chapter) => {
      setChapters(chapters.map(c => c.id === updatedChapter.id ? updatedChapter : c));
  };

  // === Volume Management Functions ===
  
  const handleCreateVolume = (data: { title: string; summary: string; coreConflict: string; expectedWordCount?: number }) => {
    const newVolume = createVolume(data.title, data.summary, data.coreConflict, volumes, data.expectedWordCount);
    setVolumes([...volumes, newVolume]);
    setShowVolumeDialog(false);
    // Auto-expand new volume
    setExpandedVolumeIds(prev => new Set([...prev, newVolume.id]));
  };

  const handleEditVolume = (data: { title: string; summary: string; coreConflict: string; expectedWordCount?: number }) => {
    if (!editingVolume) return;
    const updatedVolumes = updateVolumeInArray(editingVolume.id, data, volumes);
    setVolumes(updatedVolumes);
    setEditingVolume(null);
  };

  const handleDeleteVolume = (volumeId: string) => {
    const result = deleteVolume(volumeId, volumes, chapters);
    setVolumes(result.volumes);
    setChapters(result.chapters);
    setDeleteConfirmId(null);
  };

  const handleGenerateVolumeSummary = async (volumeId: string) => {
    const volume = volumes.find(v => v.id === volumeId);
    if (!volume || !settings.apiKey) {
      alert('请先配置 API Key');
      return;
    }
    
    setGeneratingSummaryId(volumeId);
    try {
      const summary = await generateVolumeSummary(volume, chapters, config, settings);
      const updatedVolumes = updateVolumeInArray(volumeId, { volumeSummary: summary }, volumes);
      setVolumes(updatedVolumes);
    } catch (e) {
      console.error('Failed to generate volume summary:', e);
      alert('生成分卷总结失败，请重试');
    } finally {
      setGeneratingSummaryId(null);
    }
  };

  const toggleVolumeExpand = (volumeId: string) => {
    setExpandedVolumeIds(prev => {
      const next = new Set(prev);
      if (next.has(volumeId)) {
        next.delete(volumeId);
      } else {
        next.add(volumeId);
      }
      return next;
    });
  };

  // Drag and Drop handlers
  const handleChapterDragStart = (e: React.DragEvent, chapterId: string) => {
    e.dataTransfer.setData('chapterId', chapterId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleVolumeDragOver = (e: React.DragEvent, volumeId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverVolumeId(volumeId);
  };

  const handleVolumeDragLeave = () => {
    setDragOverVolumeId(null);
  };

  const handleVolumeDrop = (e: React.DragEvent, volumeId: string) => {
    e.preventDefault();
    const chapterId = e.dataTransfer.getData('chapterId');
    if (chapterId) {
      // Find the dropped chapter
      const droppedChapter = chapters.find(c => c.id === chapterId);
      if (!droppedChapter) {
        setDragOverVolumeId(null);
        return;
      }

      // Get all root chapters (main storyline) sorted by order
      const mainlineChapters = chapters
        .filter(c => !c.parentId)
        .sort((a, b) => a.order - b.order);

      // Find all chapters with order <= dropped chapter's order that are unassigned
      const chaptersToMove = mainlineChapters.filter(c => 
        c.order <= droppedChapter.order && !c.volumeId
      );

      // Move all these chapters to the volume
      let currentVolumes = volumes;
      let currentChapters = chapters;
      
      for (const chapter of chaptersToMove) {
        const result = moveChapterToVolume(chapter.id, volumeId, currentVolumes, currentChapters);
        currentVolumes = result.volumes;
        currentChapters = result.chapters;
      }

      // Also move the dropped chapter if it was already in another volume
      if (droppedChapter.volumeId && droppedChapter.volumeId !== volumeId) {
        const result = moveChapterToVolume(chapterId, volumeId, currentVolumes, currentChapters);
        currentVolumes = result.volumes;
        currentChapters = result.chapters;
      }

      setVolumes(currentVolumes);
      setChapters(currentChapters);
    }
    setDragOverVolumeId(null);
  };

  const handleRemoveFromVolume = (chapterId: string) => {
    const result = moveChapterToVolume(chapterId, null, volumes, chapters);
    setVolumes(result.volumes);
    setChapters(result.chapters);
  };

  // Identify Roots (No parent, or parent not in list)
  const rootChapters = useMemo(() => {
      // Sort by order
      return chapters.filter(c => !c.parentId).sort((a, b) => a.order - b.order);
  }, [chapters]);

  // Chapters not assigned to any volume
  const unassignedChapters = useMemo(() => {
    return rootChapters.filter(c => !c.volumeId);
  }, [rootChapters]);

  // Sort volumes by order
  const sortedVolumes = useMemo(() => {
    return [...volumes].sort((a, b) => a.order - b.order);
  }, [volumes]);

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

      {/* Volume and Chapter Visualization */}
      <div className="max-w-4xl pb-10">
        {rootChapters.length === 0 && volumes.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-ink-200 rounded-xl">
                <p className="text-ink-400">暂无章节。点击上方按钮生成，或手动添加。</p>
            </div>
        )}

        {/* Volumes Section */}
        {sortedVolumes.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-ink-700 flex items-center gap-2">
                <BookOpen size={18} />
                分卷管理
              </h3>
              <button
                onClick={() => setShowVolumeDialog(true)}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary-hover transition"
              >
                <Plus size={16} />
                新建分卷
              </button>
            </div>
            
            <div className="space-y-4">
              {sortedVolumes.map(volume => (
                <div key={volume.id} className="group">
                  <VolumeCard
                    volume={volume}
                    chapters={chapters}
                    isExpanded={expandedVolumeIds.has(volume.id)}
                    onToggle={() => toggleVolumeExpand(volume.id)}
                    onEdit={() => setEditingVolume(volume)}
                    onDelete={() => setDeleteConfirmId(volume.id)}
                    onGenerateSummary={() => handleGenerateVolumeSummary(volume.id)}
                    onSelectChapter={onSelectChapter}
                    onDragOver={(e) => handleVolumeDragOver(e, volume.id)}
                    onDrop={(e) => handleVolumeDrop(e, volume.id)}
                    isDragOver={dragOverVolumeId === volume.id}
                    onChapterDragStart={handleChapterDragStart}
                    onRemoveChapter={handleRemoveFromVolume}
                  />
                  {generatingSummaryId === volume.id && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-primary">
                      <Loader2 size={14} className="animate-spin" />
                      正在生成分卷总结...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unassigned Chapters Section */}
        {(unassignedChapters.length > 0 || volumes.length > 0) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-ink-700">
                {volumes.length > 0 ? '未分配章节' : '章节列表'}
              </h3>
              {volumes.length === 0 && (
                <button
                  onClick={() => setShowVolumeDialog(true)}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary-hover transition"
                >
                  <BookOpen size={16} />
                  创建分卷
                </button>
              )}
            </div>
            
            {unassignedChapters.length === 0 && volumes.length > 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-ink-200 rounded-xl">
                <p className="text-ink-400 text-sm">所有章节已分配到分卷</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unassignedChapters.map(chapter => (
                  <div
                    key={chapter.id}
                    draggable
                    onDragStart={(e) => handleChapterDragStart(e, chapter.id)}
                    onDragEnd={handleVolumeDragLeave}
                  >
                    <ChapterNode 
                      chapter={chapter}
                      allChapters={chapters}
                      depth={0}
                      onSelect={onSelectChapter}
                      onAddBranch={handleAddBranch}
                      onDelete={handleDeleteChapter}
                      onUpdate={handleUpdateChapter}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chapters without volume management (when no volumes exist) */}
        {volumes.length === 0 && rootChapters.length > 0 && (
          <div className="space-y-6">
            {rootChapters.map(root => (
              <ChapterNode 
                key={root.id}
                chapter={root}
                allChapters={chapters}
                depth={0}
                onSelect={onSelectChapter}
                onAddBranch={handleAddBranch}
                onDelete={handleDeleteChapter}
                onUpdate={handleUpdateChapter}
              />
            ))}
          </div>
        )}
        
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
                             parentId: null,
                             volumeId: null,
                             hooks: []
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

      {/* Volume Dialog */}
      {(showVolumeDialog || editingVolume) && (
        <VolumeDialog
          volume={editingVolume || undefined}
          onSave={editingVolume ? handleEditVolume : handleCreateVolume}
          onClose={() => {
            setShowVolumeDialog(false);
            setEditingVolume(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmId(null)}>
          <div 
            className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg text-ink-800 mb-2">确认删除分卷？</h3>
            <p className="text-sm text-ink-600 mb-4">
              删除分卷后，其中的章节将变为未分配状态，章节内容不会丢失。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-ink-600 hover:bg-ink-100 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteVolume(deleteConfirmId)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutlineBuilder;
