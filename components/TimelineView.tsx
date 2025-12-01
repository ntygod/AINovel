import React, { useMemo, useState } from 'react';
import { NovelState, PlotLoop, PlotLoopStatus } from '../types';
import { 
  CalendarClock, 
  ZoomIn, 
  ZoomOut, 
  User, 
  Flag, 
  MousePointer2, 
  Activity, 
  GitCommit,
  ArrowRight
} from 'lucide-react';

interface TimelineViewProps {
  novelState: NovelState;
  onSelectChapter?: (id: string) => void; // 用于跳转编辑
}

const TimelineView: React.FC<TimelineViewProps> = ({ novelState, onSelectChapter }) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  // 悬停提示状态
  const [hoveredInfo, setHoveredInfo] = useState<{
      x: number;
      y: number;
      title: string;
      content: React.ReactNode;
  } | null>(null);

  // === 布局常量 ===
  const CHAPTER_WIDTH = 140 * zoomLevel; // 稍微加宽以容纳信息
  const HEADER_HEIGHT = 48;
  const MACRO_HEIGHT = 220; // 宏观层高度（张力+伏笔）
  const ROW_HEIGHT = 64 * zoomLevel;
  const SIDEBAR_WIDTH = 200;
  const PADDING_TOP = 20;

  // === 1. 数据准备 ===
  
  // 时间点（章节），按顺序排列
  const timePoints = useMemo(() => {
      return [...novelState.chapters].sort((a, b) => a.order - b.order);
  }, [novelState.chapters]);

  // 实体（角色 + 势力）
  const entities = useMemo(() => {
      const chars = novelState.characters.map(c => ({
          id: c.id,
          name: c.name,
          type: 'character' as const,
          color: 'var(--color-primary)', // 默认使用主色
          role: c.role
      }));

      const facts = novelState.structure.factions.map(f => ({
          id: f.id,
          name: f.name,
          type: 'faction' as const,
          color: f.color,
          role: '势力'
      }));

      return [...chars, ...facts];
  }, [novelState.characters, novelState.structure.factions]);

  // 实体-章节 关联映射
  const dataMap = useMemo(() => {
      const map = new Map<string, boolean>();
      timePoints.forEach(chapter => {
          // 简单的文本匹配，实际项目中可以使用更精确的关联数据 (如 chapter.characters)
          const textToCheck = (chapter.title + chapter.summary + (chapter.content || "")).toLowerCase();
          entities.forEach(entity => {
              if (textToCheck.includes(entity.name.toLowerCase())) {
                  map.set(`${entity.id}-${chapter.id}`, true);
              }
          });
      });
      return map;
  }, [entities, timePoints]);

  // 伏笔数据处理
  const plotThreads = useMemo(() => {
      return novelState.plotLoops.map(loop => {
          const startChapter = timePoints.find(c => c.id === loop.setupChapterId);
          // 终点优先级：实际回收章节 > 计划目标章节
          const endChapter = timePoints.find(c => c.id === (loop.closeChapterId || loop.targetChapterId));
          
          if (!startChapter || !endChapter) return null;
          
          // 如果起点终点相同，或者是倒序（逻辑错误），忽略
          if (startChapter.order >= endChapter.order) return null;

          return {
              loop,
              startIdx: timePoints.indexOf(startChapter),
              endIdx: timePoints.indexOf(endChapter),
              isClosed: loop.status === PlotLoopStatus.CLOSED
          };
      }).filter(Boolean) as { loop: PlotLoop, startIdx: number, endIdx: number, isClosed: boolean }[];
  }, [novelState.plotLoops, timePoints]);

  // 张力曲线路径计算
  const tensionPath = useMemo(() => {
      if (timePoints.length < 2) return "";
      
      return timePoints.map((c, i) => {
          const x = SIDEBAR_WIDTH + i * CHAPTER_WIDTH + CHAPTER_WIDTH / 2;
          // 张力 1-10，映射到高度。10 在最上面 (y=20附近)，1 在最下面
          // 预留一些 padding
          const tension = c.tension || 5;
          const y = MACRO_HEIGHT - ((tension / 10) * (MACRO_HEIGHT - 60)) - 30; 
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ');
  }, [timePoints, CHAPTER_WIDTH, MACRO_HEIGHT]);

  // 张力填充区域（用于背景渐变）
  const tensionFillPath = useMemo(() => {
      if (!tensionPath) return "";
      const firstX = SIDEBAR_WIDTH + CHAPTER_WIDTH / 2;
      const lastX = SIDEBAR_WIDTH + (timePoints.length - 1) * CHAPTER_WIDTH + CHAPTER_WIDTH / 2;
      return `${tensionPath} L ${lastX} ${MACRO_HEIGHT} L ${firstX} ${MACRO_HEIGHT} Z`;
  }, [tensionPath, timePoints, CHAPTER_WIDTH, MACRO_HEIGHT]);

  // 辅助函数：获取颜色
  const getEntityColor = (entity: any, index: number) => {
      if (entity.type === 'faction') return entity.color || '#64748b';
      const colors = [
          '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', 
          '#ef4444', '#10b981', '#3b82f6', '#f97316'
      ];
      return colors[index % colors.length];
  };

  // 画布尺寸
  const totalWidth = Math.max(1000, timePoints.length * CHAPTER_WIDTH + SIDEBAR_WIDTH + 100);
  const totalHeight = MACRO_HEIGHT + HEADER_HEIGHT + entities.length * ROW_HEIGHT + 100;

  if (timePoints.length === 0) {
      return (
          <div className="h-full flex flex-col items-center justify-center text-ink-400">
              <CalendarClock size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">暂无章节数据</p>
              <p className="text-sm mt-2">请先在「大纲与剧情」中规划章节。</p>
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col bg-paper relative overflow-hidden animate-fade-in">
        {/* 工具栏 */}
        <div className="h-14 border-b border-ink-200 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
            <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2">
                <Activity className="text-primary" size={20} />
                剧情心电图 (Narrative ECG)
            </h2>
            <div className="flex items-center space-x-2">
                 <div className="mr-4 text-xs text-ink-400 flex items-center gap-4">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> 已闭环伏笔</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> 待回收伏笔</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> 剧情张力</span>
                 </div>
                 <div className="h-4 w-px bg-ink-200 mx-2"></div>
                 <button onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))} className="p-1.5 hover:bg-ink-100 rounded text-ink-600"><ZoomOut size={18} /></button>
                 <span className="text-xs font-mono text-ink-400 w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
                 <button onClick={() => setZoomLevel(Math.min(1.5, zoomLevel + 0.1))} className="p-1.5 hover:bg-ink-100 rounded text-ink-600"><ZoomIn size={18} /></button>
            </div>
        </div>

        {/* 滚动区域 */}
        <div className="flex-1 overflow-auto relative bg-ink-50/30 scrollbar-thin scrollbar-thumb-ink-200">
             <div style={{ width: totalWidth, height: totalHeight }} className="relative">
                
                {/* === 左侧固定栏背景 (Z-Index 调整为 30, 但不要遮挡 Z-40 的标签) === */}
                <div className="absolute left-0 top-0 bottom-0 bg-white border-r border-ink-200 z-30 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]" style={{ width: SIDEBAR_WIDTH }}>
                    {/* 宏观层标题 */}
                    <div className="absolute top-0 w-full flex flex-col justify-center px-6 border-b border-ink-100/50" style={{ height: MACRO_HEIGHT }}>
                        <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-4">MACRO VIEW</span>
                        <div className="text-sm font-bold text-ink-800 flex items-center gap-2 mb-3">
                            <Activity size={16} className="text-rose-500" /> 
                            <span>张力曲线</span>
                        </div>
                        <div className="text-sm font-bold text-ink-800 flex items-center gap-2">
                            <GitCommit size={16} className="text-amber-500" /> 
                            <span>伏笔跨度</span>
                        </div>
                        <p className="text-[10px] text-ink-400 mt-4 leading-relaxed">
                            上方曲线展示剧情的起伏节奏，弧线代表伏笔的埋设与回收跨度。
                        </p>
                    </div>
                    {/* 章节头标题 */}
                    <div className="absolute w-full flex items-center px-6 font-bold text-xs text-ink-500 bg-ink-50 border-y border-ink-200" style={{ top: MACRO_HEIGHT, height: HEADER_HEIGHT }}>
                        章节列表 <ArrowRight size={12} className="ml-2" />
                    </div>
                </div>

                {/* === 1. 宏观层 (Macro Layer) - 顶部 === */}
                <div className="absolute left-0 top-0 right-0 border-b border-ink-200 bg-white/50" style={{ height: MACRO_HEIGHT }}>
                    <svg className="absolute left-0 top-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 10 }}>
                        <defs>
                            <linearGradient id="tension-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgb(244, 63, 94)" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* 垂直网格线 (对齐章节中心) */}
                        {timePoints.map((_, i) => (
                            <line 
                                key={`grid-v-${i}`}
                                x1={SIDEBAR_WIDTH + i * CHAPTER_WIDTH + CHAPTER_WIDTH / 2}
                                y1={0}
                                x2={SIDEBAR_WIDTH + i * CHAPTER_WIDTH + CHAPTER_WIDTH / 2}
                                y2={MACRO_HEIGHT}
                                className="stroke-ink-100"
                                strokeWidth="1"
                                strokeDasharray="4 4"
                            />
                        ))}

                        {/* 张力曲线 */}
                        <path d={tensionFillPath} fill="url(#tension-gradient)" />
                        <path d={tensionPath} fill="none" stroke="rgb(244, 63, 94)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                        {/* 伏笔连线 (Bezier Curves) */}
                        {plotThreads.map((thread, i) => {
                            const startX = SIDEBAR_WIDTH + thread.startIdx * CHAPTER_WIDTH + CHAPTER_WIDTH / 2;
                            const endX = SIDEBAR_WIDTH + thread.endIdx * CHAPTER_WIDTH + CHAPTER_WIDTH / 2;
                            const distance = endX - startX;
                            // 弧度高度根据跨度动态调整
                            const arcHeight = Math.min(100, Math.max(30, distance * 0.15)); 
                            const y = MACRO_HEIGHT - 20; // 基准线
                            
                            // 贝塞尔控制点
                            const d = `M ${startX} ${y} Q ${(startX + endX) / 2} ${y - arcHeight * 2} ${endX} ${y}`;
                            
                            const color = thread.isClosed ? '#10b981' : '#f59e0b'; // Emerald or Amber
                            
                            return (
                                <g key={thread.loop.id} className="group pointer-events-auto cursor-pointer">
                                    {/* 透明的粗线用于增大点击热区 */}
                                    <path d={d} fill="none" stroke="transparent" strokeWidth="16" 
                                        onMouseEnter={(e) => setHoveredInfo({
                                            x: e.clientX, y: e.clientY,
                                            title: thread.loop.title,
                                            content: (
                                                <div className="flex flex-col gap-1">
                                                    <span className={`font-bold ${thread.isClosed ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        {thread.isClosed ? '已闭环' : '待回收'} 
                                                    </span>
                                                    <span>跨越 {thread.endIdx - thread.startIdx} 章</span>
                                                    <span className="text-ink-400 text-[10px] mt-1 line-clamp-2">{thread.loop.description}</span>
                                                </div>
                                            )
                                        })}
                                        onMouseLeave={() => setHoveredInfo(null)}
                                    />
                                    {/* 实际显示的线 */}
                                    <path 
                                        d={d} 
                                        fill="none" 
                                        stroke={color} 
                                        strokeWidth={thread.loop.importance >= 4 ? 2.5 : 1.5}
                                        strokeDasharray={thread.isClosed ? '' : '4 4'}
                                        className="opacity-50 group-hover:opacity-100 group-hover:stroke-[3px] transition-all duration-300"
                                    />
                                    {/* 起点和终点圆点 */}
                                    <circle cx={startX} cy={y} r="3" fill={color} className="group-hover:scale-150 transition-transform" />
                                    <circle cx={endX} cy={y} r="3" fill={color} className="group-hover:scale-150 transition-transform" />
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {/* === 2. 章节头 (Header) === */}
                <div className="absolute left-0 right-0 flex border-b border-ink-200 bg-white/95 backdrop-blur z-20 shadow-sm" 
                     style={{ top: MACRO_HEIGHT, height: HEADER_HEIGHT, paddingLeft: SIDEBAR_WIDTH }}>
                    {timePoints.map((chapter, i) => (
                        <div 
                            key={chapter.id}
                            className="flex-shrink-0 flex flex-col justify-center px-3 border-r border-ink-100/50 hover:bg-primary/5 transition-colors cursor-pointer group relative"
                            style={{ width: CHAPTER_WIDTH }}
                            onDoubleClick={() => onSelectChapter?.(chapter.id)}
                            title={`双击编辑: ${chapter.title}`}
                        >
                            <div className="flex justify-between items-baseline">
                                <span className="text-[10px] text-ink-400 font-bold uppercase tracking-wider">CH.{chapter.order}</span>
                                <span className={`text-[9px] px-1 rounded ${chapter.tension && chapter.tension >= 8 ? 'bg-rose-100 text-rose-600' : 'bg-ink-100 text-ink-400'}`}>T.{chapter.tension || 5}</span>
                            </div>
                            <div className="text-xs font-bold text-ink-800 truncate mt-0.5">{chapter.title}</div>
                            
                            {/* 双击提示 */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-ink-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                双击跳转编辑
                            </div>
                        </div>
                    ))}
                </div>

                {/* === 3. 微观层 (Micro Layer / Entities) === */}
                <div style={{ paddingTop: MACRO_HEIGHT + HEADER_HEIGHT + PADDING_TOP }} className="relative bg-white min-h-[500px]">
                    
                    {/* 背景网格 */}
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{top: MACRO_HEIGHT + HEADER_HEIGHT}}>
                        {/* 竖线 */}
                        {timePoints.map((_, i) => (
                            <line 
                                key={`v-${i}`}
                                x1={SIDEBAR_WIDTH + i * CHAPTER_WIDTH + CHAPTER_WIDTH / 2}
                                y1={0}
                                x2={SIDEBAR_WIDTH + i * CHAPTER_WIDTH + CHAPTER_WIDTH / 2}
                                y2={entities.length * ROW_HEIGHT + PADDING_TOP * 2}
                                className="stroke-ink-50"
                                strokeWidth="1"
                            />
                        ))}
                        {/* 实体连线 */}
                        {entities.map((entity, rowIdx) => {
                            const rowY = PADDING_TOP + rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                            const color = getEntityColor(entity, rowIdx);
                            
                            // 计算路径点
                            const points: string[] = [];
                            timePoints.forEach((chapter, colIdx) => {
                                if (dataMap.has(`${entity.id}-${chapter.id}`)) {
                                    const x = SIDEBAR_WIDTH + colIdx * CHAPTER_WIDTH + CHAPTER_WIDTH / 2;
                                    points.push(`${x},${rowY}`);
                                }
                            });

                            if (points.length < 2) return null;

                            return (
                                <polyline 
                                    key={`line-${entity.id}`}
                                    points={points.join(' ')}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={3}
                                    strokeOpacity={0.15}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            );
                        })}
                    </svg>

                    {/* 实体行 */}
                    {entities.map((entity, rowIdx) => {
                        const color = getEntityColor(entity, rowIdx);
                        
                        return (
                            <div key={entity.id} className="relative group/row hover:bg-ink-50/50 transition-colors" style={{ height: ROW_HEIGHT }}>
                                {/* 左侧固定标签 (关键修改：Z-Index 40 确保在侧边栏背景之上) */}
                                <div className="absolute left-0 top-0 w-[200px] h-full flex items-center px-6 border-r border-ink-100 bg-white z-40 group-hover/row:bg-ink-50 transition-colors">
                                    <div className="w-1 absolute left-0 top-3 bottom-3 rounded-r-full opacity-50 group-hover/row:opacity-100 transition-opacity" style={{ backgroundColor: color }}></div>
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm mr-3 transition-transform group-hover/row:scale-110" style={{ backgroundColor: color }}>
                                        {entity.type === 'character' ? <User size={16} /> : <Flag size={16} />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm text-ink-800 truncate" title={entity.name}>{entity.name}</div>
                                        <div className="text-[10px] text-ink-400 truncate">{entity.role}</div>
                                    </div>
                                </div>

                                {/* 节点渲染 */}
                                <div style={{ paddingLeft: SIDEBAR_WIDTH }} className="h-full relative">
                                    {timePoints.map((chapter, colIdx) => {
                                        const isActive = dataMap.has(`${entity.id}-${chapter.id}`);
                                        if (!isActive) return null;

                                        return (
                                            <div
                                                key={`${entity.id}-${chapter.id}`}
                                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-[3px] border-white shadow-sm cursor-pointer hover:scale-125 transition-transform z-10 group/node"
                                                style={{ 
                                                    left: SIDEBAR_WIDTH + colIdx * CHAPTER_WIDTH + CHAPTER_WIDTH / 2,
                                                    backgroundColor: color 
                                                }}
                                                onMouseEnter={(e) => setHoveredInfo({
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                    title: `${entity.name} @ ${chapter.title}`,
                                                    content: (
                                                        <div className="text-xs text-ink-600">
                                                            <div className="bg-ink-50 p-1.5 rounded mb-1 font-mono text-[10px] text-ink-400 uppercase">Appearance</div>
                                                            {chapter.summary.slice(0, 100)}...
                                                        </div>
                                                    )
                                                })}
                                                onMouseLeave={() => setHoveredInfo(null)}
                                            >
                                                {/* Ripple effect */}
                                                <div className="absolute inset-0 rounded-full bg-inherit animate-ping opacity-0 group-hover/node:opacity-50"></div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
             </div>
        </div>

        {/* 悬停提示 Tooltip */}
        {hoveredInfo && (
            <div 
                className="fixed z-[100] bg-white rounded-lg shadow-xl border border-ink-200 p-3 max-w-xs animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
                style={{ 
                    left: Math.min(hoveredInfo.x + 20, window.innerWidth - 340), 
                    top: Math.min(hoveredInfo.y + 20, window.innerHeight - 200)
                }}
            >
                <div className="font-bold text-ink-900 text-sm mb-2 flex items-center gap-2 border-b border-ink-100 pb-2">
                    <MousePointer2 size={12} className="text-primary" />
                    {hoveredInfo.title}
                </div>
                <div className="text-xs text-ink-600 leading-relaxed">
                    {hoveredInfo.content}
                </div>
            </div>
        )}
    </div>
  );
};

export default TimelineView;