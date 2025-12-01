import React, { useState } from 'react';
import { 
  ChapterAnalysisResult, 
  EvolutionSuggestion 
} from '../services/evolutionService';
import { 
  User, 
  BookOpen, 
  Shield, 
  Check, 
  X, 
  ChevronDown, 
  ChevronRight,
  AlertCircle,
  Sparkles,
  Loader2
} from 'lucide-react';

interface EvolutionPanelProps {
  analysisResult: ChapterAnalysisResult | null;
  isAnalyzing: boolean;
  onApplySuggestions: (suggestions: EvolutionSuggestion[]) => void;
  onClose: () => void;
}

/**
 * EvolutionPanel - 演进建议展示面板
 * 
 * 分类展示角色、Wiki、势力的更新建议
 * 支持用户选择和确认
 * 
 * Requirements: 2.3, 2.4
 */
const EvolutionPanel: React.FC<EvolutionPanelProps> = ({
  analysisResult,
  isAnalyzing,
  onApplySuggestions,
  onClose
}) => {
  // 管理各类建议的选中状态
  const [characterSuggestions, setCharacterSuggestions] = useState<EvolutionSuggestion[]>([]);
  const [wikiSuggestions, setWikiSuggestions] = useState<EvolutionSuggestion[]>([]);
  const [factionSuggestions, setFactionSuggestions] = useState<EvolutionSuggestion[]>([]);
  
  // 展开/折叠状态
  const [expandedSections, setExpandedSections] = useState({
    character: true,
    wiki: true,
    faction: true
  });

  // 当分析结果更新时，初始化建议状态
  React.useEffect(() => {
    if (analysisResult) {
      setCharacterSuggestions(analysisResult.characterSuggestions || []);
      setWikiSuggestions(analysisResult.wikiSuggestions || []);
      setFactionSuggestions(analysisResult.factionSuggestions || []);
    }
  }, [analysisResult]);

  const toggleSection = (section: 'character' | 'wiki' | 'faction') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleSuggestion = (
    type: 'character' | 'wiki' | 'faction',
    index: number
  ) => {
    const updateFn = (suggestions: EvolutionSuggestion[]) =>
      suggestions.map((s, i) => 
        i === index ? { ...s, selected: !s.selected } : s
      );

    switch (type) {
      case 'character':
        setCharacterSuggestions(updateFn);
        break;
      case 'wiki':
        setWikiSuggestions(updateFn);
        break;
      case 'faction':
        setFactionSuggestions(updateFn);
        break;
    }
  };

  const handleApply = () => {
    const allSelected = [
      ...characterSuggestions.filter(s => s.selected),
      ...wikiSuggestions.filter(s => s.selected),
      ...factionSuggestions.filter(s => s.selected)
    ];
    onApplySuggestions(allSelected);
  };

  const totalSuggestions = 
    characterSuggestions.length + 
    wikiSuggestions.length + 
    factionSuggestions.length;

  const selectedCount = 
    characterSuggestions.filter(s => s.selected).length +
    wikiSuggestions.filter(s => s.selected).length +
    factionSuggestions.filter(s => s.selected).length;

  // 加载状态
  if (isAnalyzing) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary mb-3" size={32} />
        <p className="text-sm text-ink-500">正在分析章节内容...</p>
        <p className="text-xs text-ink-400 mt-1">识别角色变化、新设定、势力动态</p>
      </div>
    );
  }

  // 无结果状态
  if (!analysisResult || totalSuggestions === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center">
        <AlertCircle className="text-ink-300 mb-3" size={32} />
        <p className="text-sm text-ink-500">未发现需要更新的设定</p>
        <p className="text-xs text-ink-400 mt-1">章节内容可能没有涉及重大变化</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 text-sm text-ink-500 hover:bg-ink-100 rounded-lg transition"
        >
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-ink-100 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="text-purple-500" size={18} />
          <h3 className="font-bold text-ink-800">演进建议</h3>
        </div>
        <p className="text-xs text-ink-500">
          发现 {totalSuggestions} 条建议，已选中 {selectedCount} 条
        </p>
      </div>

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Character Suggestions */}
        {characterSuggestions.length > 0 && (
          <SuggestionSection
            title="角色状态变化"
            icon={<User size={16} />}
            color="blue"
            suggestions={characterSuggestions}
            expanded={expandedSections.character}
            onToggleExpand={() => toggleSection('character')}
            onToggleSuggestion={(idx) => toggleSuggestion('character', idx)}
          />
        )}

        {/* Wiki Suggestions */}
        {wikiSuggestions.length > 0 && (
          <SuggestionSection
            title="Wiki 条目"
            icon={<BookOpen size={16} />}
            color="emerald"
            suggestions={wikiSuggestions}
            expanded={expandedSections.wiki}
            onToggleExpand={() => toggleSection('wiki')}
            onToggleSuggestion={(idx) => toggleSuggestion('wiki', idx)}
          />
        )}

        {/* Faction Suggestions */}
        {factionSuggestions.length > 0 && (
          <SuggestionSection
            title="势力变化"
            icon={<Shield size={16} />}
            color="amber"
            suggestions={factionSuggestions}
            expanded={expandedSections.faction}
            onToggleExpand={() => toggleSection('faction')}
            onToggleSuggestion={(idx) => toggleSuggestion('faction', idx)}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-ink-100 bg-ink-50/50 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 text-sm text-ink-500 hover:bg-ink-100 rounded-lg transition"
        >
          取消
        </button>
        <button
          onClick={handleApply}
          disabled={selectedCount === 0}
          className="flex-1 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:bg-ink-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          <Check size={16} />
          应用选中 ({selectedCount})
        </button>
      </div>
    </div>
  );
};

// 建议分类组件
interface SuggestionSectionProps {
  title: string;
  icon: React.ReactNode;
  color: 'blue' | 'emerald' | 'amber';
  suggestions: EvolutionSuggestion[];
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleSuggestion: (index: number) => void;
}

const SuggestionSection: React.FC<SuggestionSectionProps> = ({
  title,
  icon,
  color,
  suggestions,
  expanded,
  onToggleExpand,
  onToggleSuggestion
}) => {
  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      text: 'text-blue-700',
      badge: 'bg-blue-100 text-blue-600'
    },
    emerald: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      text: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-600'
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      text: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-600'
    }
  };

  const colors = colorClasses[color];
  const selectedCount = suggestions.filter(s => s.selected).length;

  return (
    <div className={`rounded-lg border ${colors.border} overflow-hidden`}>
      {/* Section Header */}
      <button
        onClick={onToggleExpand}
        className={`w-full px-3 py-2 ${colors.bg} flex items-center justify-between hover:opacity-90 transition`}
      >
        <div className="flex items-center gap-2">
          <span className={colors.text}>{icon}</span>
          <span className={`font-bold text-sm ${colors.text}`}>{title}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.badge}`}>
            {selectedCount}/{suggestions.length}
          </span>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-ink-400" />
        ) : (
          <ChevronRight size={16} className="text-ink-400" />
        )}
      </button>

      {/* Suggestions */}
      {expanded && (
        <div className="divide-y divide-ink-100">
          {suggestions.map((suggestion, idx) => (
            <SuggestionItem
              key={idx}
              suggestion={suggestion}
              onToggle={() => onToggleSuggestion(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 单个建议项组件
interface SuggestionItemProps {
  suggestion: EvolutionSuggestion;
  onToggle: () => void;
}

const SuggestionItem: React.FC<SuggestionItemProps> = ({
  suggestion,
  onToggle
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const actionLabel = suggestion.action === 'create' ? '新建' : '更新';
  const actionColor = suggestion.action === 'create' 
    ? 'bg-green-100 text-green-600' 
    : 'bg-yellow-100 text-yellow-600';

  return (
    <div className="p-3 bg-white hover:bg-ink-50/50 transition">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
            suggestion.selected
              ? 'bg-primary border-primary text-white'
              : 'border-ink-300 hover:border-primary'
          }`}
        >
          {suggestion.selected && <Check size={12} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-ink-800 truncate">
              {suggestion.targetName || '未命名'}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${actionColor}`}>
              {actionLabel}
            </span>
            {suggestion.confidence >= 0.8 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">
                高置信度
              </span>
            )}
          </div>

          {/* Data Preview */}
          <div className="text-xs text-ink-500 mb-1">
            {renderDataPreview(suggestion)}
          </div>

          {/* Toggle Details */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-primary hover:underline"
          >
            {showDetails ? '收起详情' : '查看详情'}
          </button>

          {/* Details */}
          {showDetails && (
            <div className="mt-2 p-2 bg-ink-50 rounded text-xs text-ink-600 leading-relaxed">
              <p className="font-medium mb-1">AI 推理：</p>
              <p className="whitespace-pre-wrap">{suggestion.reasoning}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 渲染数据预览
function renderDataPreview(suggestion: EvolutionSuggestion): string {
  const { type, action, data } = suggestion;

  if (type === 'character') {
    const parts: string[] = [];
    if (data.status) parts.push(`状态: ${data.status}`);
    if (data.isActive === false) parts.push('已退场');
    if (data.tags?.length) parts.push(`标签: ${data.tags.join(', ')}`);
    return parts.join(' | ') || '更新角色信息';
  }

  if (type === 'wiki') {
    if (action === 'create') {
      return `${data.category || '其他'} - ${(data.description || '').slice(0, 50)}...`;
    }
    return `更新描述: ${(data.description || '').slice(0, 50)}...`;
  }

  if (type === 'faction') {
    const parts: string[] = [];
    if (data.influence !== undefined) parts.push(`影响力: ${data.influence}`);
    if (data.description) parts.push(`描述更新`);
    if (action === 'create') parts.push(`新势力`);
    return parts.join(' | ') || '更新势力信息';
  }

  return '更新设定';
}

export default EvolutionPanel;
