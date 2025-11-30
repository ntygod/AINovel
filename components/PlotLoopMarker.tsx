/**
 * PlotLoopMarker Component
 * 
 * 编辑器内的伏笔标记浮动菜单。
 * 实现选中文本后的浮动菜单和"设为伏笔"按钮功能。
 * 
 * Requirements: 5.4
 */

import React from 'react';
import { Link2, Plus } from 'lucide-react';

export interface PlotLoopMarkerProps {
  /** 选中的文本内容 */
  selectedText: string;
  /** 当前章节 ID */
  currentChapterId: string;
  /** 浮动菜单位置 */
  position?: { x: number; y: number };
  /** 创建伏笔回调 */
  onCreateLoop: (description: string, chapterId: string) => void;
  /** 关闭菜单回调 */
  onClose?: () => void;
}

const PlotLoopMarker: React.FC<PlotLoopMarkerProps> = ({
  selectedText,
  currentChapterId,
  position,
  onCreateLoop,
  onClose
}) => {
  // 如果没有选中文本或没有位置，不显示
  if (!selectedText.trim() || !position) {
    return null;
  }

  const handleCreateLoop = () => {
    // 调用创建伏笔回调，传入选中文本作为描述
    onCreateLoop(selectedText.trim(), currentChapterId);
    // 关闭菜单
    onClose?.();
  };

  // 计算菜单位置，确保不超出视口
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 180),
    top: Math.max(position.y - 50, 10),
    zIndex: 100
  };

  return (
    <div 
      style={menuStyle}
      className="bg-white border border-ink-200 shadow-xl rounded-lg p-1 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <button
        onClick={handleCreateLoop}
        className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-purple-50 hover:text-purple-700 rounded-md transition-colors w-full"
        title="将选中文本设为伏笔"
      >
        <Link2 size={16} className="text-purple-500" />
        <span>设为伏笔</span>
        <Plus size={14} className="ml-auto text-ink-400" />
      </button>
    </div>
  );
};

export default PlotLoopMarker;
