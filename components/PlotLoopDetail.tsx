/**
 * PlotLoopDetail Component
 * 
 * 伏笔详情编辑弹窗组件。
 * 实现伏笔详情编辑表单、目标章节/分卷选择器、角色和 Wiki 词条关联选择器、
 * 父伏笔选择器、状态变更按钮（关闭/废弃）。
 * 
 * Requirements: 1.2, 1.4, 1.5, 2.4, 5.1, 5.2, 6.1
 */

import React, { useState, useEffect } from 'react';
import { PlotLoop, PlotLoopStatus, Chapter, Volume, Character, WikiEntry } from '../types';
import { 
  X, 
  Save, 
  Star, 
  BookOpen, 
  Layers, 
  Users, 
  BookMarked, 
  Link2, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  Trash2
} from 'lucide-react';

export interface PlotLoopDetailProps {
  loop: PlotLoop | null;
  chapters: Chapter[];
  volumes: Volume[];
  characters: Character[];
  wikiEntries: WikiEntry[];
  allLoops: PlotLoop[];
  onSave: (loop: PlotLoop) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onMarkClosed?: (id: string, closeChapterId: string) => void;
  onMarkAbandoned?: (id: string, reason: string) => void;
}

// 状态显示配置
const STATUS_CONFIG: Record<PlotLoopStatus, { label: string; color: string; bgColor: string }> = {
  [PlotLoopStatus.URGENT]: { label: '紧急', color: 'text-red-600', bgColor: 'bg-red-100' },
  [PlotLoopStatus.OPEN]: { label: '待回收', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  [PlotLoopStatus.CLOSED]: { label: '已回收', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  [PlotLoopStatus.ABANDONED]: { label: '已废弃', color: 'text-gray-500', bgColor: 'bg-gray-100' }
};

const PlotLoopDetail: React.FC<PlotLoopDetailProps> = ({
  loop,
  chapters,
  volumes,
  characters,
  wikiEntries,
  allLoops,
  onSave,
  onClose,
  onDelete,
  onMarkClosed,
  onMarkAbandoned
}) => {
  // 表单状态
  const [formData, setFormData] = useState<Partial<PlotLoop>>({});
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [closeChapterId, setCloseChapterId] = useState('');
  const [abandonReason, setAbandonReason] = useState('');

  // 初始化表单数据
  useEffect(() => {
    if (loop) {
      setFormData({ ...loop });
    } else {
      setFormData({
        title: '',
        description: '',
        importance: 3,
        status: PlotLoopStatus.OPEN,
        relatedCharacterIds: [],
        relatedWikiEntryIds: []
      });
    }
  }, [loop]);

  if (!loop && !formData.id) return null;

  const isNewLoop = !loop;
  const currentStatus = formData.status || PlotLoopStatus.OPEN;
  const statusConfig = STATUS_CONFIG[currentStatus];
  const canClose = currentStatus === PlotLoopStatus.OPEN || currentStatus === PlotLoopStatus.URGENT;
  const canAbandon = currentStatus === PlotLoopStatus.OPEN || currentStatus === PlotLoopStatus.URGENT;

  // 可选的父伏笔（排除自己和自己的子伏笔）
  const availableParentLoops = allLoops.filter(l => {
    if (loop && l.id === loop.id) return false;
    if (loop && l.parentLoopId === loop.id) return false;
    return true;
  });

  const handleSave = () => {
    if (!formData.title?.trim()) {
      alert('请输入伏笔标题');
      return;
    }
    
    const now = Date.now();
    const savedLoop: PlotLoop = {
      id: formData.id || crypto.randomUUID(),
      title: formData.title.trim(),
      description: formData.description || '',
      setupChapterId: formData.setupChapterId || '',
      status: formData.status || PlotLoopStatus.OPEN,
      importance: formData.importance || 3,
      targetChapterId: formData.targetChapterId,
      targetVolumeId: formData.targetVolumeId,
      closeChapterId: formData.closeChapterId,
      abandonReason: formData.abandonReason,
      relatedCharacterIds: formData.relatedCharacterIds,
      relatedWikiEntryIds: formData.relatedWikiEntryIds,
      parentLoopId: formData.parentLoopId,
      aiSuggested: formData.aiSuggested,
      createdAt: formData.createdAt || now,
      updatedAt: now
    };
    
    onSave(savedLoop);
    onClose();
  };

  const handleClose = () => {
    if (!closeChapterId) {
      alert('请选择回收章节');
      return;
    }
    if (loop && onMarkClosed) {
      onMarkClosed(loop.id, closeChapterId);
      setShowCloseDialog(false);
      onClose();
    }
  };

  const handleAbandon = () => {
    if (!abandonReason.trim()) {
      alert('请输入废弃原因');
      return;
    }
    if (loop && onMarkAbandoned) {
      onMarkAbandoned(loop.id, abandonReason);
      setShowAbandonDialog(false);
      onClose();
    }
  };

  const handleDelete = () => {
    if (loop && onDelete && window.confirm('确定要删除这个伏笔吗？此操作不可撤销。')) {
      onDelete(loop.id);
      onClose();
    }
  };

  // 多选处理函数
  const toggleCharacter = (charId: string) => {
    const current = formData.relatedCharacterIds || [];
    const updated = current.includes(charId)
      ? current.filter(id => id !== charId)
      : [...current, charId];
    setFormData({ ...formData, relatedCharacterIds: updated });
  };

  const toggleWikiEntry = (entryId: string) => {
    const current = formData.relatedWikiEntryIds || [];
    const updated = current.includes(entryId)
      ? current.filter(id => id !== entryId)
      : [...current, entryId];
    setFormData({ ...formData, relatedWikiEntryIds: updated });
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-ink-100 flex justify-between items-center bg-ink-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <Link2 size={20} className="text-primary" />
            <h3 className="font-bold text-lg text-ink-900">
              {isNewLoop ? '新建伏笔' : '编辑伏笔'}
            </h3>
            {!isNewLoop && (
              <span className={`px-2 py-0.5 text-xs rounded ${statusConfig.bgColor} ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 transition">
            <X size={20} />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 标题 */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
              伏笔标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="如：神秘的断剑"
              className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
              autoFocus
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">详细描述</label>
            <textarea
              value={formData.description || ''}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="描述这个伏笔的内容、背景和预期回收方式..."
              className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-24 resize-none"
            />
          </div>

          {/* 重要程度 */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-2">
              重要程度
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(level => (
                <button
                  key={level}
                  onClick={() => setFormData({ ...formData, importance: level })}
                  className={`p-2 rounded-lg border transition ${
                    formData.importance === level
                      ? 'bg-amber-100 border-amber-300'
                      : 'bg-white border-ink-200 hover:border-amber-300'
                  }`}
                >
                  <Star
                    size={20}
                    className={formData.importance && formData.importance >= level 
                      ? 'text-amber-400 fill-amber-400' 
                      : 'text-gray-300'}
                  />
                </button>
              ))}
              <span className="text-sm text-ink-500 ml-2">
                {formData.importance === 5 ? '主线伏笔' : 
                 formData.importance === 4 ? '重要伏笔' :
                 formData.importance === 3 ? '普通伏笔' :
                 formData.importance === 2 ? '次要伏笔' : '小伏笔'}
              </span>
            </div>
          </div>

          {/* 章节设置 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1 flex items-center gap-1">
                <BookOpen size={12} /> 埋设章节
              </label>
              <select
                value={formData.setupChapterId || ''}
                onChange={e => setFormData({ ...formData, setupChapterId: e.target.value })}
                className="w-full p-2 border border-ink-300 rounded-lg outline-none bg-white"
              >
                <option value="">选择章节</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>第{ch.order}章: {ch.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1 flex items-center gap-1">
                <Layers size={12} /> 目标章节
              </label>
              <select
                value={formData.targetChapterId || ''}
                onChange={e => setFormData({ ...formData, targetChapterId: e.target.value || undefined })}
                className="w-full p-2 border border-ink-300 rounded-lg outline-none bg-white"
              >
                <option value="">未设置</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>第{ch.order}章: {ch.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 目标分卷 */}
          {volumes.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">目标分卷</label>
              <select
                value={formData.targetVolumeId || ''}
                onChange={e => setFormData({ ...formData, targetVolumeId: e.target.value || undefined })}
                className="w-full p-2 border border-ink-300 rounded-lg outline-none bg-white"
              >
                <option value="">未设置</option>
                {volumes.map(vol => (
                  <option key={vol.id} value={vol.id}>{vol.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* 关联角色 */}
          {characters.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-2 flex items-center gap-1">
                <Users size={12} /> 关联角色
              </label>
              <div className="flex flex-wrap gap-2">
                {characters.map(char => {
                  const isSelected = formData.relatedCharacterIds?.includes(char.id);
                  return (
                    <button
                      key={char.id}
                      onClick={() => toggleCharacter(char.id)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition ${
                        isSelected
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-ink-600 border-ink-200 hover:border-primary'
                      }`}
                    >
                      {char.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 关联 Wiki 词条 */}
          {wikiEntries.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-2 flex items-center gap-1">
                <BookMarked size={12} /> 关联词条
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {wikiEntries.map(entry => {
                  const isSelected = formData.relatedWikiEntryIds?.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => toggleWikiEntry(entry.id)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition ${
                        isSelected
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-ink-600 border-ink-200 hover:border-emerald-400'
                      }`}
                    >
                      {entry.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 父伏笔（伏笔链） */}
          {availableParentLoops.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-ink-500 uppercase mb-1 flex items-center gap-1">
                <Link2 size={12} /> 父伏笔（伏笔链）
              </label>
              <select
                value={formData.parentLoopId || ''}
                onChange={e => setFormData({ ...formData, parentLoopId: e.target.value || undefined })}
                className="w-full p-2 border border-ink-300 rounded-lg outline-none bg-white"
              >
                <option value="">无父伏笔</option>
                {availableParentLoops.map(l => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              <p className="text-xs text-ink-400 mt-1">设置父伏笔可以创建层层递进的伏笔链</p>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-6 py-4 border-t border-ink-100 bg-ink-50 rounded-b-xl">
          <div className="flex justify-between items-center">
            {/* 左侧：状态操作和删除 */}
            <div className="flex items-center gap-2">
              {!isNewLoop && canClose && onMarkClosed && (
                <button
                  onClick={() => setShowCloseDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition"
                >
                  <CheckCircle2 size={16} />
                  标记回收
                </button>
              )}
              {!isNewLoop && canAbandon && onMarkAbandoned && (
                <button
                  onClick={() => setShowAbandonDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
                >
                  <XCircle size={16} />
                  废弃
                </button>
              )}
              {!isNewLoop && onDelete && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 size={16} />
                  删除
                </button>
              )}
            </div>

            {/* 右侧：取消和保存 */}
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-ink-600 hover:bg-ink-200 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-primary text-white hover:bg-primary-hover rounded-lg shadow-sm flex items-center gap-2 transition"
              >
                <Save size={16} />
                保存
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 关闭伏笔对话框 */}
      {showCloseDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-60">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-4 text-emerald-600">
              <CheckCircle2 size={24} />
              <h4 className="font-bold text-lg">标记伏笔为已回收</h4>
            </div>
            <p className="text-sm text-ink-600 mb-4">
              请选择回收此伏笔的章节：
            </p>
            <select
              value={closeChapterId}
              onChange={e => setCloseChapterId(e.target.value)}
              className="w-full p-2.5 border border-ink-300 rounded-lg outline-none mb-4"
            >
              <option value="">选择章节</option>
              {chapters.map(ch => (
                <option key={ch.id} value={ch.id}>第{ch.order}章: {ch.title}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCloseDialog(false)}
                className="px-4 py-2 text-ink-600 hover:bg-ink-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
              >
                确认回收
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 废弃伏笔对话框 */}
      {showAbandonDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-60">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-4 text-gray-600">
              <AlertTriangle size={24} />
              <h4 className="font-bold text-lg">废弃伏笔</h4>
            </div>
            <p className="text-sm text-ink-600 mb-4">
              请输入废弃此伏笔的原因（便于后续参考）：
            </p>
            <textarea
              value={abandonReason}
              onChange={e => setAbandonReason(e.target.value)}
              placeholder="如：剧情调整，此伏笔不再需要..."
              className="w-full p-2.5 border border-ink-300 rounded-lg outline-none h-24 resize-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAbandonDialog(false)}
                className="px-4 py-2 text-ink-600 hover:bg-ink-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleAbandon}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                确认废弃
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlotLoopDetail;
