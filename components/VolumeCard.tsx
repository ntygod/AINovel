import React from 'react';
import { Volume, Chapter } from '../types';
import { getVolumeStats, isLastChapterComplete } from '../services/volumeService';
import { 
  ChevronDown, 
  ChevronRight, 
  Edit3, 
  Trash2, 
  FileText, 
  BookOpen,
  GripVertical,
  X
} from 'lucide-react';

interface VolumeCardProps {
  volume: Volume;
  chapters: Chapter[];
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGenerateSummary: () => void;
  onSelectChapter: (id: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
  onChapterDragStart?: (e: React.DragEvent, chapterId: string) => void;
  onRemoveChapter?: (chapterId: string) => void;
}

const VolumeCard: React.FC<VolumeCardProps> = ({
  volume,
  chapters,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onGenerateSummary,
  onSelectChapter,
  onDragOver,
  onDrop,
  isDragOver = false,
  onChapterDragStart,
  onRemoveChapter
}) => {
  const stats = getVolumeStats(volume, chapters);
  const canGenerateSummary = isLastChapterComplete(volume, chapters);
  
  // Calculate progress based on expected word count or chapter completion
  const progress = volume.expectedWordCount 
    ? Math.min((stats.totalWordCount / volume.expectedWordCount) * 100, 100)
    : stats.chapterCount > 0 
      ? (stats.completedChapters / stats.chapterCount) * 100 
      : 0;

  // Get chapters in this volume sorted by order
  // Use chapter.volumeId as the source of truth (more reliable than volume.chapterIds)
  const volumeChapters = chapters
    .filter(c => c.volumeId === volume.id)
    .sort((a, b) => a.order - b.order);

  // Progress color based on completion
  const progressColor = progress >= 100 
    ? 'from-green-400 to-green-600' 
    : progress >= 50 
      ? 'from-primary/70 to-primary' 
      : 'from-amber-400 to-amber-600';

  return (
    <div
      className={`bg-white rounded-xl border-2 transition-all duration-300 shadow-sm hover:shadow-md ${
        isDragOver 
          ? 'border-primary border-dashed bg-primary/5 scale-[1.02] shadow-lg' 
          : 'border-ink-200 hover:border-ink-300'
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={() => {}}
    >
      {/* Volume Header */}
      <div 
        className="p-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button 
              className="p-0.5 hover:bg-ink-100 rounded shrink-0"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-primary shrink-0" />
                <h3 className="font-bold text-ink-800 truncate">{volume.title}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-500 shrink-0">
                  第{volume.order}卷
                </span>
              </div>
              
              {volume.summary && (
                <p className="text-xs text-ink-500 mt-1 line-clamp-1">{volume.summary}</p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 ml-4 shrink-0">
            <div className="text-right">
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <span>{stats.chapterCount} 章</span>
                <span className="text-ink-300">|</span>
                <span>{stats.totalWordCount.toLocaleString()} 字</span>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 text-ink-400 hover:text-primary hover:bg-ink-50 rounded"
                title="编辑分卷"
              >
                <Edit3 size={14} />
              </button>
              
              {canGenerateSummary && !volume.volumeSummary && (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateSummary(); }}
                  className="p-1.5 text-ink-400 hover:text-green-600 hover:bg-green-50 rounded"
                  title="生成分卷总结"
                >
                  <FileText size={14} />
                </button>
              )}
              
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 text-ink-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="删除分卷"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar with Animation */}
        <div className="mt-3">
          <div className="w-full bg-ink-100 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r ${progressColor} rounded-full transition-all duration-700 ease-out relative`}
              style={{ width: `${progress}%` }}
            >
              {/* Shimmer effect for active progress */}
              {progress > 0 && progress < 100 && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              )}
            </div>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-ink-400">
              {stats.completedChapters}/{stats.chapterCount} 章已完成
            </span>
            <span className={`text-[10px] font-medium ${progress >= 100 ? 'text-green-600' : 'text-ink-500'}`}>
              {progress.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Volume Summary Badge */}
        {volume.volumeSummary && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded w-fit">
            <FileText size={10} />
            <span>已生成总结</span>
          </div>
        )}
      </div>

      {/* Expanded Chapter List with Animation */}
      {isExpanded && (
        <div className="border-t border-ink-100 animate-in slide-in-from-top-2 duration-200">
          {volumeChapters.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-ink-200 m-3 rounded-lg bg-ink-50/50">
              <BookOpen size={24} className="mx-auto text-ink-300 mb-2" />
              <p className="text-ink-400 text-sm">拖拽章节到此处添加到分卷</p>
            </div>
          ) : (
            <div className="p-2 space-y-1 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-ink-200 scrollbar-track-transparent">
              {volumeChapters.map((chapter, index) => (
                <div
                  key={chapter.id}
                  draggable
                  onDragStart={(e) => onChapterDragStart?.(e, chapter.id)}
                  className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-ink-50 cursor-pointer group/chapter transition-all duration-150 hover:translate-x-1"
                  onClick={() => onSelectChapter(chapter.id)}
                >
                  <GripVertical size={12} className="text-ink-300 opacity-0 group-hover/chapter:opacity-100 transition-opacity cursor-grab" />
                  <span className="text-xs text-ink-400 w-6 font-mono">{index + 1}.</span>
                  <span className="text-sm text-ink-700 flex-1 truncate group-hover/chapter:text-primary transition-colors">{chapter.title}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                    chapter.wordCount > 50 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-ink-100 text-ink-500'
                  }`}>
                    {chapter.wordCount > 50 ? `${chapter.wordCount.toLocaleString()}字` : '草稿'}
                  </span>
                  {/* Remove from volume button */}
                  <button
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      onRemoveChapter?.(chapter.id); 
                    }}
                    className="p-1 text-ink-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover/chapter:opacity-100 transition-all"
                    title="移出分卷"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VolumeCard;
