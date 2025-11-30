/**
 * PlotLoopPanel Component
 * 
 * 伏笔管理面板，显示在编辑器右侧栏。
 * 实现伏笔列表展示（按状态分组）、筛选器 UI、快速创建伏笔按钮。
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import React, { useState, useMemo } from 'react';
import { PlotLoop, PlotLoopStatus, Chapter, Volume, Character, WikiEntry } from '../types';
import {
  groupByStatus,
  filterByImportance,
  filterByChapter,
  filterByVolume,
  searchByKeyword
} from '../services/plotLoopService';
import { 
  Link2, 
  Search, 
  Filter, 
  Plus, 
  AlertTriangle, 
  Circle, 
  CheckCircle2, 
  XCircle,
  ChevronDown,
  ChevronRight,
  Star,
  BookOpen,
  Layers
} from 'lucide-react';

export interface PlotLoopPanelProps {
  plotLoops: PlotLoop[];
  currentChapterId: string | null;
  chapters: Chapter[];
  volumes: Volume[];
  characters: Character[];
  wikiEntries: WikiEntry[];
  onCreateLoop: (loop: Partial<PlotLoop>) => void;
  onUpdateLoop: (id: string, updates: Partial<PlotLoop>) => void;
  onDeleteLoop: (id: string) => void;
  onSelectLoop: (loop: PlotLoop) => void;
}

// 状态显示配置
const STATUS_CONFIG: Record<PlotLoopStatus, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  [PlotLoopStatus.URGENT]: { 
    label: '紧急', 
    icon: AlertTriangle, 
    color: 'text-red-600', 
    bgColor: 'bg-red-50 border-red-200' 
  },
  [PlotLoopStatus.OPEN]: { 
    label: '待回收', 
    icon: Circle, 
    color: 'text-amber-600', 
    bgColor: 'bg-amber-50 border-amber-200' 
  },
  [PlotLoopStatus.CLOSED]: { 
    label: '已回收', 
    icon: CheckCircle2, 
    color: 'text-emerald-600', 
    bgColor: 'bg-emerald-50 border-emerald-200' 
  },
  [PlotLoopStatus.ABANDONED]: { 
    label: '已废弃', 
    icon: XCircle, 
    color: 'text-gray-500', 
    bgColor: 'bg-gray-50 border-gray-200' 
  }
};

// 重要程度星级显示
const ImportanceStars: React.FC<{ importance: number }> = ({ importance }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(level => (
        <Star 
          key={level} 
          size={10} 
          className={level <= importance ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} 
        />
      ))}
    </div>
  );
};

// 单个伏笔卡片
const PlotLoopCard: React.FC<{
  loop: PlotLoop;
  chapters: Chapter[];
  onSelect: () => void;
}> = ({ loop, chapters, onSelect }) => {
  const config = STATUS_CONFIG[loop.status];
  const StatusIcon = config.icon;
  
  const setupChapter = chapters.find(c => c.id === loop.setupChapterId);
  const targetChapter = loop.targetChapterId 
    ? chapters.find(c => c.id === loop.targetChapterId) 
    : null;

  return (
    <div 
      onClick={onSelect}
      className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${config.bgColor}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon size={14} className={config.color} />
          <h4 className="font-medium text-ink-800 text-sm truncate">{loop.title}</h4>
        </div>
        <ImportanceStars importance={loop.importance} />
      </div>
      
      <p className="text-xs text-ink-600 line-clamp-2 mb-2">{loop.description}</p>
      
      <div className="flex items-center gap-3 text-[10px] text-ink-500">
        {setupChapter && (
          <span className="flex items-center gap-1">
            <BookOpen size={10} />
            第{setupChapter.order}章埋设
          </span>
        )}
        {targetChapter && (
          <span className="flex items-center gap-1">
            <Layers size={10} />
            目标: 第{targetChapter.order}章
          </span>
        )}
        {loop.aiSuggested && (
          <span className="px-1 py-0.5 bg-purple-100 text-purple-600 rounded">AI</span>
        )}
      </div>
    </div>
  );
};

// 状态分组折叠面板
const StatusGroup: React.FC<{
  status: PlotLoopStatus;
  loops: PlotLoop[];
  chapters: Chapter[];
  onSelectLoop: (loop: PlotLoop) => void;
  defaultExpanded?: boolean;
}> = ({ status, loops, chapters, onSelectLoop, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  if (loops.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-2 rounded-lg ${config.bgColor} border transition-colors`}
      >
        <div className="flex items-center gap-2">
          <StatusIcon size={14} className={config.color} />
          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          <span className="text-xs text-ink-500">({loops.length})</span>
        </div>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      
      {expanded && (
        <div className="mt-2 space-y-2">
          {loops.map(loop => (
            <PlotLoopCard
              key={loop.id}
              loop={loop}
              chapters={chapters}
              onSelect={() => onSelectLoop(loop)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const PlotLoopPanel: React.FC<PlotLoopPanelProps> = ({
  plotLoops,
  currentChapterId,
  chapters,
  volumes,
  onCreateLoop,
  onSelectLoop
}) => {
  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterImportance, setFilterImportance] = useState<number | null>(null);
  const [filterChapterId, setFilterChapterId] = useState<string | null>(null);
  const [filterVolumeId, setFilterVolumeId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // 应用筛选和分组
  const filteredAndGroupedLoops = useMemo(() => {
    let result = [...plotLoops];

    // 应用关键词搜索
    if (searchKeyword.trim()) {
      result = searchByKeyword(result, searchKeyword);
    }

    // 应用重要程度筛选
    if (filterImportance !== null) {
      result = filterByImportance(result, filterImportance);
    }

    // 应用章节筛选
    if (filterChapterId) {
      result = filterByChapter(result, filterChapterId);
    }

    // 应用分卷筛选
    if (filterVolumeId) {
      result = filterByVolume(result, filterVolumeId);
    }

    // 按状态分组排序
    result = groupByStatus(result);

    // 按状态分组
    const grouped: Record<PlotLoopStatus, PlotLoop[]> = {
      [PlotLoopStatus.URGENT]: [],
      [PlotLoopStatus.OPEN]: [],
      [PlotLoopStatus.CLOSED]: [],
      [PlotLoopStatus.ABANDONED]: []
    };

    result.forEach(loop => {
      grouped[loop.status].push(loop);
    });

    return grouped;
  }, [plotLoops, searchKeyword, filterImportance, filterChapterId, filterVolumeId]);

  // 快速创建伏笔
  const handleQuickCreate = () => {
    onCreateLoop({
      title: '',
      description: '',
      setupChapterId: currentChapterId || '',
      importance: 3,
      status: PlotLoopStatus.OPEN
    });
  };

  // 清除所有筛选
  const clearFilters = () => {
    setSearchKeyword('');
    setFilterImportance(null);
    setFilterChapterId(null);
    setFilterVolumeId(null);
  };

  const hasActiveFilters = searchKeyword || filterImportance !== null || filterChapterId || filterVolumeId;
  const totalCount = plotLoops.length;
  const filteredCount = Object.values(filteredAndGroupedLoops).flat().length;

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="p-4 border-b border-ink-100 bg-ink-50/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-primary" />
            <h3 className="font-bold text-ink-800">伏笔追踪</h3>
            <span className="text-xs text-ink-500">({totalCount})</span>
          </div>
          <button
            onClick={handleQuickCreate}
            className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition"
            title="新建伏笔"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2 text-ink-400" size={14} />
          <input
            type="text"
            placeholder="搜索伏笔..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-ink-200 rounded-lg focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        {/* 筛选器切换 */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 text-xs ${hasActiveFilters ? 'text-primary' : 'text-ink-500'} hover:text-primary transition`}
        >
          <Filter size={12} />
          <span>筛选器</span>
          {hasActiveFilters && (
            <span className="px-1.5 py-0.5 bg-primary text-white rounded-full text-[10px]">
              {filteredCount}/{totalCount}
            </span>
          )}
          {showFilters ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* 筛选器面板 */}
        {showFilters && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-ink-200 space-y-3">
            {/* 重要程度筛选 */}
            <div>
              <label className="text-[10px] font-bold text-ink-500 uppercase block mb-1">重要程度</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(level => (
                  <button
                    key={level}
                    onClick={() => setFilterImportance(filterImportance === level ? null : level)}
                    className={`px-2 py-1 text-xs rounded border transition ${
                      filterImportance === level 
                        ? 'bg-primary text-white border-primary' 
                        : 'bg-white text-ink-600 border-ink-200 hover:border-primary'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* 章节筛选 */}
            <div>
              <label className="text-[10px] font-bold text-ink-500 uppercase block mb-1">关联章节</label>
              <select
                value={filterChapterId || ''}
                onChange={e => setFilterChapterId(e.target.value || null)}
                className="w-full p-1.5 text-xs border border-ink-200 rounded-lg outline-none"
              >
                <option value="">全部章节</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>第{ch.order}章: {ch.title}</option>
                ))}
              </select>
            </div>

            {/* 分卷筛选 */}
            {volumes.length > 0 && (
              <div>
                <label className="text-[10px] font-bold text-ink-500 uppercase block mb-1">目标分卷</label>
                <select
                  value={filterVolumeId || ''}
                  onChange={e => setFilterVolumeId(e.target.value || null)}
                  className="w-full p-1.5 text-xs border border-ink-200 rounded-lg outline-none"
                >
                  <option value="">全部分卷</option>
                  {volumes.map(vol => (
                    <option key={vol.id} value={vol.id}>{vol.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 清除筛选 */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full py-1.5 text-xs text-ink-500 hover:text-red-500 border border-ink-200 rounded-lg transition"
              >
                清除所有筛选
              </button>
            )}
          </div>
        )}
      </div>

      {/* 伏笔列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {totalCount === 0 ? (
          <div className="text-center py-8 text-ink-400">
            <Link2 size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无伏笔记录</p>
            <p className="text-xs mt-1">点击上方 + 按钮创建第一个伏笔</p>
          </div>
        ) : filteredCount === 0 ? (
          <div className="text-center py-8 text-ink-400">
            <Search size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">未找到匹配的伏笔</p>
            <button
              onClick={clearFilters}
              className="text-xs text-primary hover:underline mt-2"
            >
              清除筛选条件
            </button>
          </div>
        ) : (
          <>
            {/* 按状态分组显示 */}
            <StatusGroup
              status={PlotLoopStatus.URGENT}
              loops={filteredAndGroupedLoops[PlotLoopStatus.URGENT]}
              chapters={chapters}
              onSelectLoop={onSelectLoop}
              defaultExpanded={true}
            />
            <StatusGroup
              status={PlotLoopStatus.OPEN}
              loops={filteredAndGroupedLoops[PlotLoopStatus.OPEN]}
              chapters={chapters}
              onSelectLoop={onSelectLoop}
              defaultExpanded={true}
            />
            <StatusGroup
              status={PlotLoopStatus.CLOSED}
              loops={filteredAndGroupedLoops[PlotLoopStatus.CLOSED]}
              chapters={chapters}
              onSelectLoop={onSelectLoop}
              defaultExpanded={false}
            />
            <StatusGroup
              status={PlotLoopStatus.ABANDONED}
              loops={filteredAndGroupedLoops[PlotLoopStatus.ABANDONED]}
              chapters={chapters}
              onSelectLoop={onSelectLoop}
              defaultExpanded={false}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default PlotLoopPanel;
