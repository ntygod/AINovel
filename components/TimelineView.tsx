
import React, { useMemo, useState } from 'react';
import { NovelState, Character, Faction, Chapter } from '../types';
import { CalendarClock, ZoomIn, ZoomOut, User, Flag, ArrowRight, MousePointer2 } from 'lucide-react';

interface TimelineViewProps {
  novelState: NovelState;
}

const TimelineView: React.FC<TimelineViewProps> = ({ novelState }) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<{
      entityId: string; 
      chapterId: string; 
      chapterTitle: string; 
      summary: string 
  } | null>(null);

  // Constants
  const CHAPTER_WIDTH = 160 * zoomLevel;
  const HEADER_HEIGHT = 80;
  const ROW_HEIGHT = 70 * zoomLevel;
  const SIDEBAR_WIDTH = 200;
  const PADDING_TOP = 20;

  // 1. Prepare Entities (Rows)
  const entities = useMemo(() => {
      const chars = novelState.characters.map(c => ({
          id: c.id,
          name: c.name,
          type: 'character' as const,
          color: 'var(--color-primary)', // Default primary
          avatar: null
      }));

      const facts = novelState.structure.factions.map(f => ({
          id: f.id,
          name: f.name,
          type: 'faction' as const,
          color: f.color,
          avatar: null
      }));

      return [...chars, ...facts];
  }, [novelState.characters, novelState.structure.factions]);

  // 2. Prepare Time Points (Columns)
  const timePoints = useMemo(() => {
      return [...novelState.chapters].sort((a, b) => a.order - b.order);
  }, [novelState.chapters]);

  // 3. Calculate Nodes (Intersections)
  const dataMap = useMemo(() => {
      const map = new Map<string, boolean>(); // Key: "entityId-chapterId"
      
      timePoints.forEach(chapter => {
          const textToCheck = (chapter.title + chapter.summary + chapter.content).toLowerCase();
          
          entities.forEach(entity => {
              if (textToCheck.includes(entity.name.toLowerCase())) {
                  map.set(`${entity.id}-${chapter.id}`, true);
              }
          });
      });
      return map;
  }, [entities, timePoints]);

  // 4. Color Palette Generator for Characters
  const getEntityColor = (entity: any, index: number) => {
      if (entity.type === 'faction') return entity.color;
      
      // Generate a consistent color based on index or hash if needed
      const colors = [
          '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', 
          '#ef4444', '#10b981', '#3b82f6', '#f97316'
      ];
      return colors[index % colors.length];
  };

  const totalWidth = Math.max(800, timePoints.length * CHAPTER_WIDTH + SIDEBAR_WIDTH + 100);
  const totalHeight = Math.max(600, entities.length * ROW_HEIGHT + HEADER_HEIGHT + 50);

  if (entities.length === 0 || timePoints.length === 0) {
      return (
          <div className="h-full flex flex-col items-center justify-center text-ink-400">
              <CalendarClock size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">暂无时间轴数据</p>
              <p className="text-sm mt-2">请先创建角色并生成章节大纲，系统将自动分析它们的时间线。</p>
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col bg-paper relative overflow-hidden">
        {/* Toolbar */}
        <div className="h-16 border-b border-ink-200 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
            <div>
                <h2 className="text-xl font-bold text-ink-900 flex items-center gap-2">
                    <CalendarClock className="text-primary" size={24} />
                    剧情时间轴
                </h2>
            </div>
            <div className="flex items-center space-x-2">
                 <button 
                    onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
                    className="p-2 hover:bg-ink-100 rounded text-ink-600"
                    title="缩小"
                 >
                     <ZoomOut size={20} />
                 </button>
                 <span className="text-xs font-mono text-ink-400 w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                 <button 
                    onClick={() => setZoomLevel(Math.min(1.5, zoomLevel + 0.1))}
                    className="p-2 hover:bg-ink-100 rounded text-ink-600"
                    title="放大"
                 >
                     <ZoomIn size={20} />
                 </button>
            </div>
        </div>

        {/* Scrollable Canvas Area */}
        <div className="flex-1 overflow-auto relative">
             <div 
                className="relative bg-ink-50/50" 
                style={{ width: totalWidth, height: totalHeight }}
             >
                {/* --- LAYOUT GRID --- */}
                
                {/* Horizontal Lines (Rows) */}
                {entities.map((_, i) => (
                    <div 
                        key={`row-${i}`}
                        className="absolute w-full border-b border-ink-200/50"
                        style={{ 
                            top: HEADER_HEIGHT + PADDING_TOP + i * ROW_HEIGHT + ROW_HEIGHT/2, 
                            left: 0 
                        }}
                    />
                ))}

                {/* Vertical Lines (Columns) */}
                {timePoints.map((_, i) => (
                    <div 
                        key={`col-${i}`}
                        className="absolute h-full border-r border-ink-200/50"
                        style={{ 
                            left: SIDEBAR_WIDTH + i * CHAPTER_WIDTH + CHAPTER_WIDTH/2, 
                            top: 0 
                        }}
                    />
                ))}


                {/* --- SVG LAYER (CONNECTIONS) --- */}
                <svg 
                    className="absolute top-0 left-0 pointer-events-none" 
                    width={totalWidth} 
                    height={totalHeight}
                    style={{ zIndex: 10 }}
                >
                    {entities.map((entity, rowIdx) => {
                        const rowY = HEADER_HEIGHT + PADDING_TOP + rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                        const color = getEntityColor(entity, rowIdx);
                        
                        // Collect points for this entity
                        const points: {x: number, y: number}[] = [];
                        timePoints.forEach((chapter, colIdx) => {
                            if (dataMap.has(`${entity.id}-${chapter.id}`)) {
                                points.push({
                                    x: SIDEBAR_WIDTH + colIdx * CHAPTER_WIDTH + CHAPTER_WIDTH / 2,
                                    y: rowY
                                });
                            }
                        });

                        if (points.length < 2) return null;

                        // Draw path connecting points
                        let d = `M ${points[0].x} ${points[0].y}`;
                        for (let i = 1; i < points.length; i++) {
                            const p1 = points[i-1];
                            const p2 = points[i];
                            // Horizontal line or subtle curve? Metro style implies straight lines or 45deg. 
                            // Let's do straight for clarity, or slight bezier.
                            d += ` L ${p2.x} ${p2.y}`;
                        }

                        return (
                            <path 
                                key={entity.id}
                                d={d}
                                stroke={color}
                                strokeWidth={4 * zoomLevel}
                                fill="none"
                                opacity={0.6}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        );
                    })}
                </svg>


                {/* --- NODES LAYER (INTERACTIVE) --- */}
                {entities.map((entity, rowIdx) => {
                     const rowY = HEADER_HEIGHT + PADDING_TOP + rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                     const color = getEntityColor(entity, rowIdx);

                     return timePoints.map((chapter, colIdx) => {
                         const isActive = dataMap.has(`${entity.id}-${chapter.id}`);
                         if (!isActive) return null;

                         const colX = SIDEBAR_WIDTH + colIdx * CHAPTER_WIDTH + CHAPTER_WIDTH / 2;

                         return (
                             <div
                                key={`${entity.id}-${chapter.id}`}
                                className="absolute rounded-full border-2 border-white shadow-sm cursor-pointer hover:scale-125 transition-transform z-20 flex items-center justify-center group"
                                style={{
                                    left: colX - (8 * zoomLevel),
                                    top: rowY - (8 * zoomLevel),
                                    width: 16 * zoomLevel,
                                    height: 16 * zoomLevel,
                                    backgroundColor: color
                                }}
                                onMouseEnter={() => setHoveredNode({
                                    entityId: entity.id,
                                    chapterId: chapter.id,
                                    chapterTitle: `第${chapter.order}章: ${chapter.title}`,
                                    summary: chapter.summary
                                })}
                                onMouseLeave={() => setHoveredNode(null)}
                             >
                                {/* Simple ripple effect on hover */}
                                <div className="absolute inset-0 rounded-full bg-inherit animate-ping opacity-0 group-hover:opacity-75"></div>
                             </div>
                         );
                     });
                })}


                {/* --- SIDEBAR (Y-Axis Labels) --- */}
                <div className="absolute left-0 top-0 bottom-0 bg-white/90 backdrop-blur-sm border-r border-ink-200 z-30 shadow-lg" style={{ width: SIDEBAR_WIDTH, paddingTop: HEADER_HEIGHT + PADDING_TOP }}>
                    {entities.map((entity, i) => (
                        <div 
                            key={entity.id}
                            className="flex items-center px-4 border-b border-ink-50 hover:bg-ink-50 transition-colors relative"
                            style={{ height: ROW_HEIGHT }}
                        >
                            {/* Color Indicator */}
                            <div className="w-1 absolute left-0 top-2 bottom-2 rounded-r-full" style={{ backgroundColor: getEntityColor(entity, i) }}></div>
                            
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm`} style={{ backgroundColor: getEntityColor(entity, i) }}>
                                    {entity.type === 'character' ? <User size={14} /> : <Flag size={14} />}
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-ink-800 truncate w-28" title={entity.name}>{entity.name}</div>
                                    <div className="text-[10px] text-ink-400 uppercase">{entity.type === 'character' ? '角色' : '势力'}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>


                {/* --- HEADER (X-Axis Labels) --- */}
                <div className="absolute top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-ink-200 z-30 flex items-end shadow-sm" style={{ height: HEADER_HEIGHT, paddingLeft: SIDEBAR_WIDTH }}>
                     {timePoints.map((chapter, i) => (
                         <div 
                            key={chapter.id}
                            className="absolute bottom-0 border-l border-ink-100 flex flex-col justify-end pb-2 px-2 hover:bg-ink-50 transition-colors group cursor-default"
                            style={{ 
                                left: SIDEBAR_WIDTH + i * CHAPTER_WIDTH, 
                                width: CHAPTER_WIDTH,
                                height: '100%'
                            }}
                         >
                             <div className="text-[10px] text-ink-400 font-bold uppercase tracking-wider mb-1">Chapter {chapter.order}</div>
                             <div className="text-xs font-bold text-ink-800 truncate w-full" title={chapter.title}>{chapter.title}</div>
                             
                             {/* Connector dot to grid */}
                             <div className="absolute bottom-[-5px] left-1/2 w-2 h-2 bg-ink-300 rounded-full translate-x-[-50%] group-hover:bg-primary transition-colors"></div>
                         </div>
                     ))}
                </div>
             </div>
        </div>

        {/* Hover Tooltip Overlay */}
        {hoveredNode && (
            <div className="absolute bottom-6 right-6 z-50 animate-fade-in max-w-sm">
                <div className="bg-white rounded-xl shadow-2xl border border-ink-200 p-4 border-l-4 border-l-primary relative">
                    <div className="flex items-center gap-2 mb-2 text-primary font-bold border-b border-ink-100 pb-2">
                        <MousePointer2 size={16} />
                        <span>剧情节点详情</span>
                    </div>
                    <h4 className="font-bold text-ink-900 mb-1">{hoveredNode.chapterTitle}</h4>
                    <p className="text-xs text-ink-500 mb-3 bg-ink-50 p-2 rounded">
                        {entities.find(e => e.id === hoveredNode.entityId)?.name} 在此章节登场
                    </p>
                    <p className="text-sm text-ink-700 leading-relaxed max-h-40 overflow-y-auto">
                        {hoveredNode.summary}
                    </p>
                </div>
            </div>
        )}
    </div>
  );
};

export default TimelineView;
