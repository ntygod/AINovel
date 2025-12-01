
import React, { useState, useMemo } from 'react';
import { WikiEntry, WikiCategory, WorldStructure, AppSettings, NovelConfig, Chapter, GenerationStatus, WikiRelationType } from '../types';
import { analyzeChapterForWiki } from '../services/geminiService';
import { db } from '../services/db';
import { autoIndexOnSave } from '../services/ragService';
import {
  addAlias,
  removeAlias,
  getAllNames,
  addRelationship,
  removeRelationship,
  getRelatedEntries,
  getIncomingRelationships,
  getDescriptionAtChapter,
  getHistoryTimeline,
  getRelationTypeLabel,
  getInverseRelationLabel,
} from '../services/wikiService';
import { 
  BookMarked, Search, Plus, Filter, Edit2, Trash2, ScanSearch, Loader2, Save, X, CheckCircle,
  Tag, Link2, History, ChevronDown, ChevronRight, Clock, ArrowRight
} from 'lucide-react';

interface WikiSystemProps {
  structure: WorldStructure;
  setStructure: (s: WorldStructure) => void;
  chapters: Chapter[];
  settings: AppSettings;
  config: NovelConfig;
}

const CATEGORIES: WikiCategory[] = ['Item', 'Skill', 'Location', 'Organization', 'Event', 'Person', 'Other'];

const CATEGORY_LABELS: Record<WikiCategory, string> = {
  Item: '物品/法宝',
  Skill: '功法/技能',
  Location: '地点',
  Organization: '势力/组织',
  Event: '历史事件',
  Person: '重要人物',
  Other: '其他'
};

const CATEGORY_COLORS: Record<WikiCategory, string> = {
  Item: 'bg-amber-100 text-amber-800 border-amber-200',
  Skill: 'bg-blue-100 text-blue-800 border-blue-200',
  Location: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Organization: 'bg-purple-100 text-purple-800 border-purple-200',
  Event: 'bg-rose-100 text-rose-800 border-rose-200',
  Person: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  Other: 'bg-gray-100 text-gray-800 border-gray-200'
};

const RELATION_TYPES: WikiRelationType[] = ['belongs_to', 'part_of', 'created_by', 'located_in', 'related_to'];

const RELATION_LABELS: Record<WikiRelationType, string> = {
  belongs_to: '属于',
  part_of: '是...的一部分',
  created_by: '由...创造',
  located_in: '位于',
  related_to: '相关',
};

// 详情面板标签页类型
type DetailTab = 'basic' | 'aliases' | 'relations' | 'history';

const WikiSystem: React.FC<WikiSystemProps> = ({ structure, setStructure, chapters, settings, config }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<WikiCategory | 'All'>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<WikiEntry>>({});
  
  // 详情面板状态
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('basic');
  
  // 别名编辑状态
  const [newAlias, setNewAlias] = useState('');
  
  // 关联编辑状态
  const [newRelationTarget, setNewRelationTarget] = useState('');
  const [newRelationType, setNewRelationType] = useState<WikiRelationType>('related_to');
  const [newRelationDesc, setNewRelationDesc] = useState('');
  
  // 时间切片查看状态
  const [viewChapterOrder, setViewChapterOrder] = useState<number | null>(null);
  
  // Auto-Scan State
  const [scanStatus, setScanStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [scanChapterId, setScanChapterId] = useState<string>('');
  const [scannedEntries, setScannedEntries] = useState<WikiEntry[]>([]);

  const entries = structure.wikiEntries || [];
  const selectedEntry = entries.find(e => e.id === selectedEntryId);

  const filteredEntries = entries.filter(e => {
    const allNames = getAllNames(e);
    const matchesSearch = allNames.some(name => name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          e.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || e.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // 获取选中条目的关联信息
  const relatedEntries = useMemo(() => {
    if (!selectedEntry) return [];
    return getRelatedEntries(selectedEntry, entries);
  }, [selectedEntry, entries]);

  const incomingRelations = useMemo(() => {
    if (!selectedEntry) return [];
    return getIncomingRelationships(selectedEntry.id, entries);
  }, [selectedEntry, entries]);

  // 获取选中条目的历史时间线
  const historyTimeline = useMemo(() => {
    if (!selectedEntry) return [];
    return getHistoryTimeline(selectedEntry);
  }, [selectedEntry]);

  // 更新条目的辅助函数
  const updateEntry = (updatedEntry: WikiEntry) => {
    setStructure({
      ...structure,
      wikiEntries: entries.map(e => e.id === updatedEntry.id ? updatedEntry : e)
    });
  };

  // 别名操作
  const handleAddAlias = () => {
    if (!selectedEntry || !newAlias.trim()) return;
    const updated = addAlias(selectedEntry, newAlias.trim());
    updateEntry(updated);
    setNewAlias('');
  };

  const handleRemoveAlias = (alias: string) => {
    if (!selectedEntry) return;
    const updated = removeAlias(selectedEntry, alias);
    updateEntry(updated);
  };

  // 关联操作
  const handleAddRelation = () => {
    if (!selectedEntry || !newRelationTarget) return;
    const updated = addRelationship(selectedEntry, newRelationTarget, newRelationType, newRelationDesc || undefined);
    updateEntry(updated);
    setNewRelationTarget('');
    setNewRelationType('related_to');
    setNewRelationDesc('');
  };

  const handleRemoveRelation = (targetId: string, relation: WikiRelationType) => {
    if (!selectedEntry) return;
    const updated = removeRelationship(selectedEntry, targetId, relation);
    updateEntry(updated);
  };

  const handleSaveEntry = () => {
    if (!editForm.name || !editingId) return;
    const newEntry = editForm as WikiEntry;
    const existing = entries;
    
    let updated;
    if (existing.find(e => e.id === editingId)) {
      updated = existing.map(e => e.id === editingId ? newEntry : e);
    } else {
      updated = [...existing, newEntry];
    }
    
    setStructure({ ...structure, wikiEntries: updated });
    autoIndexOnSave('wiki', newEntry, settings);
    setEditingId(null);
    setEditForm({});
  };

  const startNewEntry = () => {
    const id = crypto.randomUUID();
    setEditingId(id);
    setEditForm({ id, name: '', category: 'Item', description: '' });
  };

  const deleteEntry = (id: string) => {
    if (window.confirm('确定删除此词条吗？')) {
      setStructure({ ...structure, wikiEntries: entries.filter(e => e.id !== id) });
      if (selectedEntryId === id) setSelectedEntryId(null);
    }
  };

  const handleScan = async () => {
    console.log('[WikiSystem] handleScan called, scanChapterId:', scanChapterId);
    if (!scanChapterId) return alert("请选择要扫描的章节");
    if (!settings.apiKey) return alert("请配置 API Key");
    
    setScanStatus(GenerationStatus.THINKING);
    try {
      let content = "";
      const targetChapter = chapters.find(c => c.id === scanChapterId);
      console.log('[WikiSystem] targetChapter:', targetChapter?.title, 'content length:', targetChapter?.content?.length);
      
      if (targetChapter && targetChapter.content && targetChapter.content.length > 50) {
        content = targetChapter.content;
      } else {
        console.log('[WikiSystem] Fetching content from DB...');
        content = await db.getChapterContent(scanChapterId);
        console.log('[WikiSystem] DB content length:', content?.length);
      }

      if (!content || content.length < 50) {
        setScanStatus(GenerationStatus.IDLE);
        return alert("该章节内容过少，无法提取。");
      }

      console.log('[WikiSystem] Calling analyzeChapterForWiki...');
      const existingNames = entries.map(e => e.name);
      const results = await analyzeChapterForWiki(content, existingNames, settings, config);
      console.log('[WikiSystem] Results:', results);
      setScannedEntries(results);
      setScanStatus(GenerationStatus.COMPLETED);
    } catch (e) {
      console.error('[WikiSystem] Error:', e);
      setScanStatus(GenerationStatus.ERROR);
    }
  };

  const acceptScannedEntry = (entry: WikiEntry) => {
    setStructure({ ...structure, wikiEntries: [...(structure.wikiEntries || []), entry] });
    autoIndexOnSave('wiki', entry, settings);
    setScannedEntries(scannedEntries.filter(e => e.id !== entry.id));
  };

  const rejectScannedEntry = (id: string) => {
    setScannedEntries(scannedEntries.filter(e => e.id !== id));
  };

  // 渲染详情面板
  const renderDetailPanel = () => {
    if (!selectedEntry) {
      return (
        <div className="flex-1 flex items-center justify-center text-ink-400">
          <p>选择一个词条查看详情</p>
        </div>
      );
    }

    // 获取时间切片后的描述
    const displayDescription = viewChapterOrder !== null
      ? getDescriptionAtChapter(selectedEntry, viewChapterOrder)
      : selectedEntry.description;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 词条头部 */}
        <div className="p-4 border-b border-ink-100">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-bold text-ink-900">{selectedEntry.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded border ${CATEGORY_COLORS[selectedEntry.category]}`}>
              {CATEGORY_LABELS[selectedEntry.category]}
            </span>
          </div>
          {selectedEntry.aliases && selectedEntry.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedEntry.aliases.map(alias => (
                <span key={alias} className="text-xs bg-ink-100 text-ink-600 px-2 py-0.5 rounded">
                  {alias}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-ink-600">{displayDescription}</p>
        </div>

        {/* 标签页切换 */}
        <div className="flex border-b border-ink-100 bg-ink-50">
          {[
            { key: 'basic', label: '基本', icon: Edit2 },
            { key: 'aliases', label: '别名', icon: Tag },
            { key: 'relations', label: '关联', icon: Link2 },
            { key: 'history', label: '历史', icon: History },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setDetailTab(tab.key as DetailTab)}
              className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1 transition
                ${detailTab === tab.key ? 'text-primary border-b-2 border-primary bg-white' : 'text-ink-500 hover:text-ink-700'}`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 标签页内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {detailTab === 'basic' && renderBasicTab()}
          {detailTab === 'aliases' && renderAliasesTab()}
          {detailTab === 'relations' && renderRelationsTab()}
          {detailTab === 'history' && renderHistoryTab()}
        </div>
      </div>
    );
  };

  // 基本信息标签页
  const renderBasicTab = () => {
    if (!selectedEntry) return null;
    return (
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-ink-500 block mb-1">描述</label>
          <p className="text-sm text-ink-700 bg-ink-50 p-3 rounded-lg">{selectedEntry.description}</p>
        </div>
        {selectedEntry.firstAppearanceChapterId && (
          <div>
            <label className="text-xs font-bold text-ink-500 block mb-1">首次出现</label>
            <p className="text-sm text-ink-600">
              {chapters.find(c => c.id === selectedEntry.firstAppearanceChapterId)?.title || '未知章节'}
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingId(selectedEntry.id); setEditForm(selectedEntry); }}
            className="flex-1 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition flex items-center justify-center gap-1"
          >
            <Edit2 size={14} /> 编辑
          </button>
          <button
            onClick={() => deleteEntry(selectedEntry.id)}
            className="py-2 px-4 bg-red-100 text-red-600 rounded-lg text-sm hover:bg-red-200 transition"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  // 别名标签页
  const renderAliasesTab = () => {
    if (!selectedEntry) return null;
    const aliases = selectedEntry.aliases || [];
    
    return (
      <div className="space-y-4">
        <p className="text-xs text-ink-500">别名用于在文本中匹配同一个词条的不同称呼。</p>
        
        {/* 添加别名 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newAlias}
            onChange={e => setNewAlias(e.target.value)}
            placeholder="输入新别名..."
            className="flex-1 p-2 border border-ink-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            onKeyDown={e => e.key === 'Enter' && handleAddAlias()}
          />
          <button
            onClick={handleAddAlias}
            disabled={!newAlias.trim()}
            className="px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50 transition"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 别名列表 */}
        <div className="space-y-2">
          {aliases.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-4">暂无别名</p>
          ) : (
            aliases.map(alias => (
              <div key={alias} className="flex items-center justify-between p-2 bg-ink-50 rounded-lg">
                <span className="text-sm text-ink-700">{alias}</span>
                <button
                  onClick={() => handleRemoveAlias(alias)}
                  className="p-1 text-ink-400 hover:text-red-500 transition"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // 关联标签页
  const renderRelationsTab = () => {
    if (!selectedEntry) return null;
    const otherEntries = entries.filter(e => e.id !== selectedEntry.id);
    
    return (
      <div className="space-y-4">
        {/* 添加关联 */}
        <div className="p-3 bg-ink-50 rounded-lg space-y-2">
          <label className="text-xs font-bold text-ink-500">添加关联</label>
          <select
            value={newRelationTarget}
            onChange={e => setNewRelationTarget(e.target.value)}
            className="w-full p-2 border border-ink-300 rounded-lg text-sm bg-white"
          >
            <option value="">选择目标词条...</option>
            {otherEntries.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({CATEGORY_LABELS[e.category]})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={newRelationType}
              onChange={e => setNewRelationType(e.target.value as WikiRelationType)}
              className="flex-1 p-2 border border-ink-300 rounded-lg text-sm bg-white"
            >
              {RELATION_TYPES.map(r => (
                <option key={r} value={r}>{RELATION_LABELS[r]}</option>
              ))}
            </select>
            <button
              onClick={handleAddRelation}
              disabled={!newRelationTarget}
              className="px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50 transition"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* 出向关联 */}
        <div>
          <label className="text-xs font-bold text-ink-500 mb-2 block">
            关联到 ({relatedEntries.length})
          </label>
          {relatedEntries.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-2">无出向关联</p>
          ) : (
            <div className="space-y-2">
              {relatedEntries.map(({ entry, relation, description }) => (
                <div key={`${entry.id}-${relation}`} className="flex items-center justify-between p-2 bg-white border border-ink-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <ArrowRight size={14} className="text-ink-400" />
                    <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {getRelationTypeLabel(relation)}
                    </span>
                    <span className="text-sm text-ink-700 font-medium">{entry.name}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveRelation(entry.id, relation)}
                    className="p-1 text-ink-400 hover:text-red-500 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 入向关联 */}
        <div>
          <label className="text-xs font-bold text-ink-500 mb-2 block">
            被关联 ({incomingRelations.length})
          </label>
          {incomingRelations.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-2">无入向关联</p>
          ) : (
            <div className="space-y-2">
              {incomingRelations.map(({ entry, relation }) => (
                <div key={`${entry.id}-${relation}`} className="flex items-center gap-2 p-2 bg-ink-50 rounded-lg">
                  <span className="text-sm text-ink-700 font-medium">{entry.name}</span>
                  <span className="text-xs text-ink-500 bg-ink-200 px-1.5 py-0.5 rounded">
                    {getInverseRelationLabel(relation)}
                  </span>
                  <span className="text-sm text-ink-600">此词条</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 历史标签页
  const renderHistoryTab = () => {
    if (!selectedEntry) return null;
    
    return (
      <div className="space-y-4">
        <p className="text-xs text-ink-500">查看词条在不同章节时间点的描述变化。</p>
        
        {/* 时间切片选择器 */}
        <div className="p-3 bg-ink-50 rounded-lg">
          <label className="text-xs font-bold text-ink-500 block mb-2">
            <Clock size={12} className="inline mr-1" />
            查看特定章节时的描述
          </label>
          <select
            value={viewChapterOrder ?? ''}
            onChange={e => setViewChapterOrder(e.target.value ? Number(e.target.value) : null)}
            className="w-full p-2 border border-ink-300 rounded-lg text-sm bg-white"
          >
            <option value="">当前最新</option>
            {chapters.map(c => (
              <option key={c.id} value={c.order}>第 {c.order} 章: {c.title}</option>
            ))}
          </select>
          {viewChapterOrder !== null && (
            <div className="mt-2 p-2 bg-white rounded border border-ink-200">
              <p className="text-xs text-ink-500 mb-1">第 {viewChapterOrder} 章时的描述:</p>
              <p className="text-sm text-ink-700">
                {getDescriptionAtChapter(selectedEntry, viewChapterOrder)}
              </p>
            </div>
          )}
        </div>

        {/* 历史时间线 */}
        <div>
          <label className="text-xs font-bold text-ink-500 mb-2 block">
            变更历史 ({historyTimeline.length})
          </label>
          {historyTimeline.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-4">暂无历史记录</p>
          ) : (
            <div className="space-y-2">
              {historyTimeline.map((h, idx) => {
                const chapter = chapters.find(c => c.id === h.chapterId);
                return (
                  <div key={idx} className="p-2 bg-white border border-ink-200 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-ink-700">
                        第 {h.chapterOrder} 章
                        {chapter && `: ${chapter.title}`}
                      </span>
                      <span className="text-xs text-ink-400">
                        {new Date(h.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    {h.changeNote && (
                      <p className="text-xs text-ink-500">{h.changeNote}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col p-8 bg-paper overflow-hidden">
      <div className="flex justify-between items-end mb-8 shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-ink-900 mb-2 flex items-center gap-2">
            <BookMarked className="text-primary" />
            百科全书
          </h2>
          <p className="text-ink-500">管理物品、技能与设定。支持别名、时间切片和关联图谱。</p>
        </div>
        <button
          onClick={startNewEntry}
          className="flex items-center space-x-2 bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-lg font-medium transition shadow-sm"
        >
          <Plus size={18} />
          <span>新建词条</span>
        </button>
      </div>

      <div className="flex gap-6 h-full overflow-hidden">
        {/* 左侧列表 */}
        <div className="w-80 flex flex-col bg-white rounded-xl shadow-sm border border-ink-200 overflow-hidden shrink-0">
          {/* 搜索和筛选 */}
          <div className="p-3 border-b border-ink-100 space-y-2 bg-ink-50">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-ink-400" size={16} />
              <input 
                type="text" 
                placeholder="搜索词条或别名..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 p-2 border border-ink-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <select 
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as any)}
              className="w-full p-2 border border-ink-300 rounded-lg text-sm outline-none bg-white"
            >
              <option value="All">全部分类</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>

          {/* 词条列表 */}
          <div className="flex-1 overflow-y-auto">
            {filteredEntries.map(entry => (
              <div
                key={entry.id}
                onClick={() => { setSelectedEntryId(entry.id); setDetailTab('basic'); setViewChapterOrder(null); }}
                className={`p-3 border-b border-ink-100 cursor-pointer transition hover:bg-ink-50
                  ${selectedEntryId === entry.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-medium text-ink-800 text-sm">{entry.name}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[entry.category]}`}>
                    {CATEGORY_LABELS[entry.category].split('/')[0]}
                  </span>
                </div>
                {entry.aliases && entry.aliases.length > 0 && (
                  <div className="flex gap-1 mb-1 flex-wrap">
                    {entry.aliases.slice(0, 2).map(a => (
                      <span key={a} className="text-[10px] text-ink-500 bg-ink-100 px-1 rounded">{a}</span>
                    ))}
                    {entry.aliases.length > 2 && (
                      <span className="text-[10px] text-ink-400">+{entry.aliases.length - 2}</span>
                    )}
                  </div>
                )}
                <p className="text-xs text-ink-500 line-clamp-2">{entry.description}</p>
                {/* 关联指示器 */}
                <div className="flex gap-2 mt-1">
                  {entry.relationships && entry.relationships.length > 0 && (
                    <span className="text-[10px] text-ink-400 flex items-center gap-0.5">
                      <Link2 size={10} /> {entry.relationships.length}
                    </span>
                  )}
                  {entry.history && entry.history.length > 0 && (
                    <span className="text-[10px] text-ink-400 flex items-center gap-0.5">
                      <History size={10} /> {entry.history.length}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {filteredEntries.length === 0 && (
              <div className="py-10 text-center text-ink-400 text-sm">
                未找到匹配词条
              </div>
            )}
          </div>
        </div>

        {/* 中间详情面板 */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-ink-200 overflow-hidden">
          {renderDetailPanel()}
        </div>

        {/* 右侧 AI 扫描面板 */}
        <div className="w-72 flex flex-col gap-4 shrink-0">
          {/* Auto Scan Box */}
          <div className="bg-white rounded-xl shadow-sm border border-ink-200 p-4 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-4 text-ink-800 border-b border-ink-100 pb-2">
              <ScanSearch size={18} className="text-primary" />
              <h3 className="font-bold text-sm">AI 智能提取</h3>
            </div>
            
            {scanStatus === GenerationStatus.IDLE || scanStatus === GenerationStatus.ERROR ? (
              <div className="space-y-3">
                <p className="text-xs text-ink-500">
                  AI 将分析正文，自动识别新出场的物品、地点或人物。
                </p>
                <div>
                  <label className="text-xs font-bold text-ink-500 block mb-1">选择章节</label>
                  <select 
                    className="w-full p-2 border border-ink-300 rounded-lg text-sm mb-2"
                    value={scanChapterId}
                    onChange={e => setScanChapterId(e.target.value)}
                  >
                    <option value="">-- 请选择 --</option>
                    {chapters.map(c => (
                      <option key={c.id} value={c.id}>第{c.order}章: {c.title} ({c.wordCount || 0}字)</option>
                    ))}
                  </select>
                  <button 
                    onClick={() => {
                      console.log('[WikiSystem] Button clicked, scanChapterId:', scanChapterId);
                      handleScan();
                    }}
                    disabled={!scanChapterId}
                    className="w-full bg-ink-800 text-white py-2 rounded-lg text-sm hover:bg-ink-900 disabled:opacity-50 disabled:cursor-not-allowed transition flex justify-center items-center gap-2"
                  >
                    <ScanSearch size={14} /> 开始提取
                  </button>
                </div>
              </div>
            ) : scanStatus === GenerationStatus.THINKING ? (
              <div className="flex-1 flex flex-col items-center justify-center text-ink-500">
                <Loader2 size={28} className="animate-spin mb-2 text-primary" />
                <p className="text-sm">正在分析...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold">发现 {scannedEntries.length} 个</span>
                  <button onClick={() => {setScanStatus(GenerationStatus.IDLE); setScannedEntries([]);}} className="text-xs text-ink-400 underline">重置</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {scannedEntries.length === 0 ? (
                    <p className="text-xs text-ink-400 text-center mt-6">未发现新词条</p>
                  ) : (
                    scannedEntries.map(entry => (
                      <div key={entry.id} className="p-2 bg-ink-50 rounded border border-ink-200 text-sm">
                        <div className="font-bold text-primary text-xs mb-1">{entry.name}</div>
                        <p className="text-xs text-ink-600 line-clamp-2 mb-2">{entry.description}</p>
                        <div className="flex gap-2">
                          <button onClick={() => acceptScannedEntry(entry)} className="flex-1 bg-green-100 text-green-700 py-1 rounded hover:bg-green-200 text-xs flex justify-center"><CheckCircle size={12}/></button>
                          <button onClick={() => rejectScannedEntry(entry.id)} className="flex-1 bg-red-100 text-red-700 py-1 rounded hover:bg-red-200 text-xs flex justify-center"><X size={12}/></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 统计信息 */}
          <div className="bg-ink-50 rounded-xl border border-ink-200 p-3 text-sm text-ink-600">
            <p className="mb-2 font-bold text-ink-800 text-xs">统计</p>
            <ul className="space-y-1 text-xs">
              <li className="flex justify-between"><span>总词条:</span> <span>{entries.length}</span></li>
              <li className="flex justify-between"><span>有别名:</span> <span>{entries.filter(e => e.aliases?.length).length}</span></li>
              <li className="flex justify-between"><span>有关联:</span> <span>{entries.filter(e => e.relationships?.length).length}</span></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in flex flex-col">
            <div className="px-6 py-4 border-b border-ink-100 flex justify-between items-center bg-ink-50 rounded-t-xl">
              <h3 className="font-bold text-lg text-ink-900">编辑词条</h3>
              <button onClick={() => setEditingId(null)} className="text-ink-400 hover:text-ink-700"><X size={20} /></button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-500 uppercase mb-1">名称</label>
                <input 
                  type="text" 
                  value={editForm.name || ''}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full p-2 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-ink-500 uppercase mb-1">分类</label>
                <select 
                  value={editForm.category || 'Item'}
                  onChange={e => setEditForm({...editForm, category: e.target.value as WikiCategory})}
                  className="w-full p-2 border border-ink-300 rounded-lg outline-none bg-white"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-ink-500 uppercase mb-1">描述</label>
                <textarea 
                  value={editForm.description || ''}
                  onChange={e => setEditForm({...editForm, description: e.target.value})}
                  className="w-full p-2 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-32 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-ink-100 flex justify-end space-x-3 bg-ink-50 rounded-b-xl">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-ink-600 hover:bg-ink-200 rounded-lg transition">取消</button>
              <button onClick={handleSaveEntry} className="px-4 py-2 bg-primary text-white hover:bg-primary-hover rounded-lg shadow-sm flex items-center space-x-2 transition">
                <Save size={16} />
                <span>保存</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WikiSystem;
