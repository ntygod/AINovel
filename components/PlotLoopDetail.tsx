/**
 * PlotLoopDetail Component
 * 
 * 伏笔详情编辑组件，支持编辑所有伏笔字段、关联角色/Wiki、设置父伏笔、状态变更。
 * 
 * Requirements: 1.2, 1.4, 1.5, 2.4, 5.1, 5.2, 6.1
 */

import React, { useState, useEffect } from 'react';
import { PlotLoop, PlotLoopStatus, Chapter, Volume, Character, WikiEntry } from '../types';
import { 
  X, 
  Save, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Star,
  BookOpen,
  Layers,
  Users,
  FileText,
  Link2,
  ChevronDown
} from 'lucide-react';

export interface PlotLoopDetailProps {
  loop: PlotLoop | null;
  isNew?: boolean;
  chapters: Chapter[];
  volumes: Volume[];
  characters: Character[];
  wikiEntries: WikiEntry[];
  allLoops: PlotLoop[];
  onSave: (loop: PlotLoop) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onMarkClosed?: (id: string, closeChapterId: string) => void;
  onMarkAbandoned?: (id: string, reason: string) => void;
}

const PlotLoopDetail: React.FC<PlotLoopDetailProps> = ({
  loop,
  isNew = false,
  chapters,
  volumes,
  characters,
  wikiEntries,
  allLoops,
  onSave,
  onDelete,
  onClose,
  onMarkClosed,
  onMarkAbandoned
}) => {
  // 表单状态
  const [formData, setFormData] = useState<Partial<PlotLoop>>({
    title: '',
    description: '',
    setupChapterId: '',
    targetChapterId: '',
    targetVolumeId: '',
    importance: 3,
    status: PlotLoopStatus.OPEN,
    relatedCharacterIds: [],
    relatedWikiEntryIds: [],
    parentLoopId: '',
    abandonReason: ''
  });

  const [showAbandonReason, setShowAbandonReason] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (loop) {
      setFormData({
        title: loop.title || '',
        description: loop.description || '',
        setupChapterId: loop.setupChapterId || '',
        targetChapterId: loop.targetChapterId || '',
        targetVolumeId: loop.targetVolumeId || '',
        importance: loop.importance || 3,
        status: loop.status || PlotLoopStatus.OPEN,
        relatedCharacterIds: loop.relatedCharacterIds || [],
        relatedWikiEntryIds: loop.relatedWikiEntryIds || [],
        parentLoopId: loop.parentLoopId || '',
        abandonReason: loop.abandonReason || ''
      });
      setShowAbandonReason(loop.status === PlotLoopStatus.ABANDONED);
    }
  }, [loop]);

  // 更新表单字段
  const updateField = <K extends keyof PlotLoop>(field: K, value: PlotLoop[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // 保存伏笔
  const handleSave = () => {
    if (!formData.title?.trim()) {
      alert('请输入伏笔标题');
      return;
    }

    const updatedLoop: PlotLoop = {
      id: loop?.id || crypto.randomUUID(),
      title: formData.title!.trim(),
      description: formData.description || '',
      setupChapterId: formData.setupChapterId || '',
      targetChapterId: formData.targetChapterId || undefined,
      targetVolumeId: formData.targetVolumeId || undefined,
      importance: formData.importance || 3,
      status: formData.status || PlotLoopStatus.OPEN,
      relatedCharacterIds: formData.relatedCharacterIds || [],
      relatedWikiEntryIds: formData.relatedWikiEntryIds || [],
      parentLoopId: formData.parentLoopId || undefined,
      closeChapterId: loop?.closeChapterId,
      abandonReason: formData.status === PlotLoopStatus.ABANDONED ? formData.abandonReason : undefined,
      aiSuggested: loop?.aiSuggested || false,
      createdAt: loop?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    onSave(updatedLoop);
  };

  // 状态变更
  const handleStatusChange = (newStatus: PlotLoopStatus) => {
    if (newStatus === PlotLoopStatus.ABANDONED) {
      setShowAbandonReason(true);
    } else {
      setShowAbandonReason(false);
    }
    updateField('status', newStatus);
  };

  // 快速关闭伏笔
  const handleQuickClose = () => {
    if (loop && onMarkClosed && formData.setupChapterId) {
      // 使用当前选择的目标章节，或者埋设章节作为关闭章节
      const closeChapterId = formData.targetChapterId || formData.setupChapterId;
      onMarkClosed(loop.id, closeChapterId);
      onClose();
    }
  };

  // 快速废弃伏笔
  const handleQuickAbandon = () => {
    if (loop && onMarkAbandoned) {
      const reason = formData.abandonReason || '用户手动废弃';
      onMarkAbandoned(loop.id, reason);
      onClose();
    }
  };

  // 删除伏笔
  const handleDelete = () => {
    if (confirmDelete && loop) {
      onDelete(loop.id);
      onClose();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  // 切换关联角色
  const toggleCharacter = (charId: string) => {
    const current = formData.relatedCharacterIds || [];
    if (current.includes(charId)) {
      updateField('relatedCharacterIds', current.filter(id => id !== charId));
    } else {
      updateField('relatedCharacterIds', [...current, charId]);
    }
  };

  // 切换关联 Wiki
  const toggleWikiEntry = (entryId: string) => {
    const current = formData.relatedWikiEntryIds || [];
    if (current.includes(entryId)) {
      updateField('relatedWikiEntryIds', current.filter(id => id !== entryId));
    } else {
      updateField('relatedWikiEntryIds', [...current, entryId]);
    }
  };

  // 可选的父伏笔（排除自己和子伏笔）
  const availableParentLoops = allLoops.filter(l => 
    l.id !== loop?.id && l.parentLoopId !== loop?.id
  );

  if (!loop && !isNew) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b bg-ink-50">
          <div className="flex items-center gap-2">
            <Link2 className="text-primary" size={20} />
            <h2 className="font-bold text-ink-800">
              {isNew ? '新建伏笔' : '编辑伏笔'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ink-200 rounded transition">
            <X size={20} />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 标题 */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
              伏笔标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => updateField('title', e.target.value)}
              placeholder="例如：神秘信件的真相"
              className="w-full p-2 border border-ink-200 rounded-lg focus:ring-2 focus:ring-primary outline-none"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">描述</label>
            <textarea
              value={formData.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="详细描述这个伏笔的内容和预期回收方式..."
              rows={3}
              className="w-full p-2 border border-ink-200 rounded-lg focus:ring-2 focus:ring-primary outline-none resize-none"
            />
          </div>

          {/* 重要程度 */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">重要程度</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(level => (
                <button
                  key={level}
                  onClick={() => updateField('importance', level)}
                  className="p-1 transition"
                >
                  <Star 
                    size={24} 
                    className={level <= (formData.importance || 3) 
                      ? 'text-amber-400 fill-amber-400' 
                      : 'text-gray-300 hover:text-amber-200'
                    } 
                  />
                </button>
              ))}
              <span className="text-xs text-ink-500 ml-2">
                {formData.importance === 1 && '次要细节'}
                {formData.importance === 2 && '小伏笔'}
                {formData.importance === 3 && '中等重要'}
                {formData.importance === 4 && '重要伏笔'}
                {formData.importance === 5 && '核心悬念'}
              </span>
            </div>
          </div>

          {/* 状态 */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">状态</label>
            <div className="flex gap-2 flex-wrap">
              {Object.values(PlotLoopStatus).map(status => {
                const isActive = formData.status === status;
                const configs: Record<PlotLoopStatus, { label: string; icon: React.ElementType; color: string }> = {
                  [PlotLoopStatus.OPEN]: { label: '待回收', icon: AlertTriangle, color: 'amber' },
                  [PlotLoopStatus.URGENT]: { label: '紧急', icon: AlertTriangle, color: 'red' },
                  [PlotLoopStatus.CLOSED]: { label: '已回收', icon: CheckCircle2, color: 'emerald' },
                  [PlotLoopStatus.ABANDONED]: { label: '已废弃', icon: XCircle, color: 'gray' }
                };
                const cfg = configs[status];
                const Icon = cfg.icon;
                
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                      isActive 
                        ? `bg-${cfg.color}-100 border-${cfg.color}-300 text-${cfg.color}-700` 
                        : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="text-sm">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 废弃原因 */}
          {showAbandonReason && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">废弃原因</label>
              <input
                type="text"
                value={formData.abandonReason}
                onChange={e => updateField('abandonReason', e.target.value)}
                placeholder="说明为什么废弃这个伏笔..."
                className="w-full p-2 border border-ink-200 rounded-lg focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          )}

          {/* 章节关联 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
                <BookOpen size={12} className="inline mr-1" />
                埋设章节
              </label>
              <select
                value={formData.setupChapterId}
                onChange={e => updateField('setupChapterId', e.target.value)}
                className="w-full p-2 border border-ink-200 rounded-lg outline-none text-sm"
              >
                <option value="">选择章节...</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    第{ch.order}章: {ch.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
                <Layers size={12} className="inline mr-1" />
                目标章节
              </label>
              <select
                value={formData.targetChapterId}
                onChange={e => updateField('targetChapterId', e.target.value)}
                className="w-full p-2 border border-ink-200 rounded-lg outline-none text-sm"
              >
                <option value="">选择章节...</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    第{ch.order}章: {ch.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 目标分卷 */}
          {volumes.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">目标分卷</label>
              <select
                value={formData.targetVolumeId}
                onChange={e => updateField('targetVolumeId', e.target.value)}
                className="w-full p-2 border border-ink-200 rounded-lg outline-none text-sm"
              >
                <option value="">选择分卷...</option>
                {volumes.map(vol => (
                  <option key={vol.id} value={vol.id}>{vol.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* 父伏笔 */}
          {availableParentLoops.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
                <Link2 size={12} className="inline mr-1" />
                父伏笔（伏笔链）
              </label>
              <select
                value={formData.parentLoopId}
                onChange={e => updateField('parentLoopId', e.target.value)}
                className="w-full p-2 border border-ink-200 rounded-lg outline-none text-sm"
              >
                <option value="">无父伏笔</option>
                {availableParentLoops.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              <p className="text-[10px] text-ink-400 mt-1">
                设置父伏笔可以建立伏笔链，方便追踪相关联的伏笔
              </p>
            </div>
          )}

          {/* 关联角色 */}
          {characters.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
                <Users size={12} className="inline mr-1" />
                关联角色
              </label>
              <div className="flex flex-wrap gap-2 p-2 border border-ink-200 rounded-lg max-h-32 overflow-y-auto">
                {characters.map(char => {
                  const isSelected = formData.relatedCharacterIds?.includes(char.id);
                  return (
                    <button
                      key={char.id}
                      onClick={() => toggleCharacter(char.id)}
                      className={`px-2 py-1 text-xs rounded-full border transition ${
                        isSelected 
                          ? 'bg-blue-100 border-blue-300 text-blue-700' 
                          : 'bg-white border-ink-200 text-ink-600 hover:border-blue-200'
                      }`}
                    >
                      {char.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 关联 Wiki */}
          {wikiEntries.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
                <FileText size={12} className="inline mr-1" />
                关联 Wiki 词条
              </label>
              <div className="flex flex-wrap gap-2 p-2 border border-ink-200 rounded-lg max-h-32 overflow-y-auto">
                {wikiEntries.map(entry => {
                  const isSelected = formData.relatedWikiEntryIds?.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => toggleWikiEntry(entry.id)}
                      className={`px-2 py-1 text-xs rounded-full border transition ${
                        isSelected 
                          ? 'bg-purple-100 border-purple-300 text-purple-700' 
                          : 'bg-white border-ink-200 text-ink-600 hover:border-purple-200'
                      }`}
                    >
                      {entry.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between p-4 border-t bg-ink-50">
          <div className="flex gap-2">
            {!isNew && (
              <button
                onClick={handleDelete}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  confirmDelete 
                    ? 'bg-red-600 text-white' 
                    : 'text-red-600 hover:bg-red-50'
                }`}
              >
                <Trash2 size={14} />
                <span className="text-sm">{confirmDelete ? '确认删除' : '删除'}</span>
              </button>
            )}
            {/* 快速状态变更按钮 */}
            {!isNew && loop && formData.status === PlotLoopStatus.OPEN && onMarkClosed && (
              <button
                onClick={handleQuickClose}
                className="flex items-center gap-1.5 px-3 py-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
              >
                <CheckCircle2 size={14} />
                <span className="text-sm">标记已回收</span>
              </button>
            )}
            {!isNew && loop && formData.status !== PlotLoopStatus.ABANDONED && onMarkAbandoned && (
              <button
                onClick={handleQuickAbandon}
                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition"
              >
                <XCircle size={14} />
                <span className="text-sm">废弃</span>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-ink-600 hover:bg-ink-100 rounded-lg transition"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition"
            >
              <Save size={14} />
              <span>{isNew ? '创建' : '保存'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlotLoopDetail;
