
import React, { useState } from 'react';
import { BookOpen, Users, List, PenTool, Settings, ChevronLeft, ChevronRight, Download, Map, SlidersHorizontal, CalendarClock, BookMarked, MessageSquare, LogOut, Video } from 'lucide-react';
import { ViewMode, NovelState } from '../types';

interface SidebarProps {
  currentMode: ViewMode;
  setMode: (mode: ViewMode) => void;
  novelState: NovelState;
  onExitProject: () => void; // New prop
}

const Sidebar: React.FC<SidebarProps> = ({ currentMode, setMode, novelState, onExitProject }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const totalWords = novelState.chapters.reduce((acc, c) => acc + c.wordCount, 0);

  const NavItem = ({ mode, icon: Icon, label, className }: { mode: ViewMode; icon: any; label: string; className?: string }) => (
    <button
      onClick={() => setMode(mode)}
      className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'} py-3 rounded-lg transition-all duration-200 group relative ${
        currentMode === mode
          ? 'bg-primary text-white shadow-md'
          : 'text-ink-500 hover:bg-ink-200 hover:text-ink-900'
      } ${className || ''}`}
    >
      <Icon size={20} className="shrink-0" />
      {!isCollapsed && <span className="font-medium whitespace-nowrap overflow-hidden">{label}</span>}
      
      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            {label}
        </div>
      )}
    </button>
  );

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white h-full border-r border-ink-200 flex flex-col shadow-sm z-10 transition-all duration-300 relative shrink-0`}>
      {/* Toggle Button */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 bg-white border border-ink-200 rounded-full p-1 text-ink-500 hover:text-primary shadow-md z-20 hover:scale-110 transition-transform"
        title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Header */}
      <div className={`p-6 border-b border-ink-100 flex items-center ${isCollapsed ? 'justify-center' : 'space-x-2'} text-primary overflow-hidden h-[88px]`}>
        <button onClick={onExitProject} className="hover:bg-ink-50 rounded-lg p-1 -ml-1 flex items-center gap-2 group transition-colors w-full" title="返回项目列表">
            <BookOpen size={24} className="shrink-0 group-hover:scale-110 transition-transform" />
            {!isCollapsed && (
                <div className="whitespace-nowrap animate-fade-in text-left">
                    <h1 className="text-lg font-bold tracking-tight text-ink-900 group-hover:text-primary truncate max-w-[140px]">{novelState.config.title}</h1>
                    <div className="flex items-center gap-1 text-xs text-ink-400 font-medium">
                        <LogOut size={10} />
                        <span>切换项目</span>
                    </div>
                </div>
            )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden flex flex-col">
        <NavItem mode={ViewMode.SETUP} icon={Settings} label="项目设定" />
        <NavItem mode={ViewMode.STRUCTURE} icon={Map} label="世界观与架构" />
        <NavItem mode={ViewMode.CHARACTERS} icon={Users} label="角色管理" />
        <NavItem mode={ViewMode.WIKI} icon={BookMarked} label="百科全书" />
        <NavItem mode={ViewMode.OUTLINE} icon={List} label="大纲与剧情" />
        <NavItem mode={ViewMode.TIMELINE} icon={CalendarClock} label="剧情时间轴" />
        <div className="pt-2 pb-2">
            <NavItem mode={ViewMode.CHAT} icon={MessageSquare} label="AI 首席顾问" />
            <NavItem mode={ViewMode.VIDEO} icon={Video} label="AI 视频工坊" className="text-primary font-bold" />
        </div>
        <NavItem mode={ViewMode.WRITE} icon={PenTool} label="写作" />
        
        <div className="pt-4 border-t border-ink-200 mt-2">
           <NavItem mode={ViewMode.EXPORT} icon={Download} label="导出与发布" />
        </div>

        <div className="mt-auto pt-4">
             <NavItem mode={ViewMode.APP_SETTINGS} icon={SlidersHorizontal} label="应用设置" />
        </div>
      </nav>

      {/* Expanded Footer */}
      {!isCollapsed && (
        <div className="p-6 bg-ink-50 border-t border-ink-100 whitespace-nowrap overflow-hidden">
            <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">进度</span>
            <span className="text-xs font-bold text-primary">{(totalWords / 10000).toFixed(2)}万字</span>
            </div>
            <div className="w-full bg-ink-200 rounded-full h-2">
            <div 
                className="bg-primary h-2 rounded-full transition-all duration-1000" 
                style={{ width: `${Math.min((totalWords / 1000000) * 100, 100)}%` }}
            ></div>
            </div>
            <p className="text-[10px] text-ink-400 mt-2 text-right">目标: 1,000,000</p>
        </div>
      )}

      {/* Collapsed Footer */}
      {isCollapsed && (
          <div className="p-4 bg-ink-50 border-t border-ink-100 flex flex-col items-center">
             <div className="w-2 bg-ink-200 rounded-full h-16 relative overflow-hidden" title={`当前字数: ${totalWords}`}>
                  <div 
                    className="bg-primary w-full absolute bottom-0 transition-all duration-1000" 
                    style={{ height: `${Math.min((totalWords / 1000000) * 100, 100)}%` }}
                  ></div>
             </div>
          </div>
      )}
    </div>
  );
};

export default Sidebar;
