import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { NovelConfig, WorldStructure, GenerationStatus, AppSettings, Faction, MapRegion } from '../types';
import { generateWorldStructure, generateFactions } from '../services/geminiService';
import { Map, Sparkles, Loader2, BookMarked, Globe, RefreshCcw, Edit2, Plus, Trash2, X, Save, Layers, Mountain, Flag } from 'lucide-react';

interface StructureDesignerProps {
  structure: WorldStructure;
  setStructure: (s: WorldStructure) => void;
  config: NovelConfig;
  settings: AppSettings;
}

const StructureDesigner: React.FC<StructureDesignerProps> = ({ structure, setStructure, config, settings }) => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [factionStatus, setFactionStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  
  // Faction Edit State
  const [editingFactionId, setEditingFactionId] = useState<string | null>(null);
  const [editFactionForm, setEditFactionForm] = useState<Partial<Faction>>({});

  const handleGenerate = async () => {
    if (!settings.apiKey) return alert("请先在应用设置中配置 API Key。");
    if (!config.mainPlot) return alert("请先在项目设置中定义核心梗概/主线目标。");
    
    setStatus(GenerationStatus.THINKING);
    try {
      const result = await generateWorldStructure(config, settings);
      // Preserve existing complex data if regenerating basic structure
      setStructure({ 
          ...result, 
          globalMemory: structure.globalMemory || '',
          factions: structure.factions || [],
          regions: structure.regions || []
      });
      setStatus(GenerationStatus.COMPLETED);
    } catch (e) {
      console.error(e);
      setStatus(GenerationStatus.ERROR);
    }
  };

  const handleGenerateFactions = async () => {
      if (!settings.apiKey) return alert("请配置 API Key");
      if (!structure.worldView) return alert("请先生成世界观设定");

      setFactionStatus(GenerationStatus.THINKING);
      try {
          const { factions, regions } = await generateFactions(config, structure, settings);
          setStructure({ ...structure, factions, regions });
          setFactionStatus(GenerationStatus.COMPLETED);
      } catch (e) {
          console.error(e);
          setFactionStatus(GenerationStatus.ERROR);
      }
  };

  const handleChange = (field: keyof WorldStructure, value: any) => {
      setStructure({ ...structure, [field]: value });
  };

  const handlePointChange = (index: number, value: string) => {
      const newPoints = [...structure.keyPlotPoints];
      newPoints[index] = value;
      setStructure({ ...structure, keyPlotPoints: newPoints });
  };

  const addPoint = () => {
      setStructure({ ...structure, keyPlotPoints: [...structure.keyPlotPoints, "新剧情节点"] });
  };
  
  const removePoint = (index: number) => {
      const newPoints = structure.keyPlotPoints.filter((_, i) => i !== index);
      setStructure({ ...structure, keyPlotPoints: newPoints });
  };

  // --- Faction Editing ---
  const startEditFaction = (f: Faction) => {
      setEditingFactionId(f.id);
      setEditFactionForm({ ...f });
  };

  const startNewFaction = () => {
      const newId = crypto.randomUUID();
      const newFaction: Faction = {
          id: newId,
          name: "新势力",
          description: "暂无描述",
          influence: 3,
          color: "#6366f1",
          x: 50, y: 50
      };
      setEditingFactionId(newId);
      setEditFactionForm(newFaction);
  };

  const saveFaction = () => {
      if (!editFactionForm.name || !editingFactionId) return;
      
      const newFaction = editFactionForm as Faction;
      const existing = structure.factions || [];
      
      let updatedFactions;
      if (existing.find(f => f.id === editingFactionId)) {
          updatedFactions = existing.map(f => f.id === editingFactionId ? newFaction : f);
      } else {
          updatedFactions = [...existing, newFaction];
      }
      
      setStructure({ ...structure, factions: updatedFactions });
      setEditingFactionId(null);
      setEditFactionForm({});
  };

  const deleteFaction = (id: string) => {
      if(window.confirm("确定删除该势力吗？")) {
          setStructure({ 
              ...structure, 
              factions: (structure.factions || []).filter(f => f.id !== id) 
          });
          setEditingFactionId(null);
      }
  };

  // --- Procedural Map Visualization (Canvas) ---
  
  const ProceduralMap = () => {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const [viewMode, setViewMode] = useState<'mixed' | 'terrain' | 'political'>('mixed');
      const [isDragging, setIsDragging] = useState<string | null>(null);
      const [hoveredFactionId, setHoveredFactionId] = useState<string | null>(null);

      // Map Generation Constants
      const WIDTH = 800; // Internal resolution
      const HEIGHT = 400;
      
      // Noise Helper
      const noise = useCallback((nx: number, ny: number) => {
          return Math.sin(nx * 3.5) * Math.cos(ny * 3.5) * 0.5 + 
                 Math.sin(nx * 9 + ny * 7) * 0.25 + 
                 Math.sin(nx * 19 + ny * 23) * 0.125 +
                 (Math.sin(nx * 50 + ny * 50) * 0.05); // Detail
      }, []);

      // Hex Color to RGB helper
      const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
          } : { r: 0, g: 0, b: 0 };
      };

      const drawMap = useCallback(() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const imgData = ctx.createImageData(WIDTH, HEIGHT);
          const data = imgData.data;

          // Pre-calculate faction positions in pixel space
          const factions = structure.factions || [];
          const factionData = factions.map(f => ({
              ...f,
              px: (f.x / 100) * WIDTH,
              py: (f.y / 100) * HEIGHT,
              rgb: hexToRgb(f.color)
          }));

          // Pre-calculate region centers for continents
          const regions = structure.regions || [];

          for (let y = 0; y < HEIGHT; y++) {
              for (let x = 0; x < WIDTH; x++) {
                  const index = (y * WIDTH + x) * 4;
                  const nx = x / WIDTH;
                  const ny = y / HEIGHT;

                  // 1. Geography Generation
                  let maxInfluence = 0;
                  regions.forEach(region => {
                      const rx = (region.x / 100) * WIDTH;
                      const ry = (region.y / 100) * HEIGHT;
                      const dx = x - rx;
                      const dy = y - ry;
                      const dist = Math.sqrt(dx*dx + dy*dy);
                      const size = region.type === 'archipelago' ? 20 : (region.type === 'island' ? 40 : 80);
                      
                      // Basic blob shape for continent
                      let inf = Math.max(0, (size * 2.5 - dist) / (size * 2.5));
                      if (inf > maxInfluence) maxInfluence = inf;
                  });

                  // Base noise + Continent Influence
                  const nVal = noise(nx * 2, ny * 2);
                  const elevation = maxInfluence + nVal * 0.4; // 0 to ~1.4

                  // Biome Colors
                  let r, g, b;
                  let isLand = false;

                  if (elevation < 0.35) { // Deep Water
                      r = 15; g = 23; b = 42; 
                  } else if (elevation < 0.42) { // Shallow Water
                      r = 30; g = 58; b = 138; 
                  } else if (elevation < 0.45) { // Beach
                      r = 217; g = 185; b = 155; 
                      isLand = true;
                  } else if (elevation < 0.65) { // Plains/Forest
                      // Add some variation for forests
                      const forestNoise = Math.sin(nx * 50) * Math.cos(ny * 50);
                      if (forestNoise > 0.5) {
                          r = 21; g = 128; b = 61; // Forest
                      } else {
                          r = 34; g = 197; b = 94; // Grass
                      }
                      isLand = true;
                  } else if (elevation < 0.8) { // Stone/Mountain base
                      r = 100; g = 116; b = 139; 
                      isLand = true;
                  } else { // Snow
                      r = 241; g = 245; b = 249; 
                      isLand = true;
                  }

                  // 2. Faction Overlay
                  if (isLand && viewMode !== 'terrain') {
                      let bestDist = 99999;
                      let owner = null;

                      // Voronoi-like Logic
                      for (const f of factionData) {
                          // Cheap distance squared
                          const distSq = (x - f.px)**2 + (y - f.py)**2;
                          // Influence affects "gravity" or effective reach. 
                          // A higher influence effectively shrinks the distance to that capital.
                          const adjustedDist = distSq / (f.influence * 0.5); 
                          
                          // Cutoff radius
                          const maxRadiusSq = (f.influence * 40)**2;

                          if (distSq < maxRadiusSq && adjustedDist < bestDist) {
                              bestDist = adjustedDist;
                              owner = f;
                          }
                      }

                      if (owner) {
                          const opacity = viewMode === 'political' ? 0.8 : 0.35;
                          // Blend terrain with faction color
                          r = r * (1 - opacity) + owner.rgb.r * opacity;
                          g = g * (1 - opacity) + owner.rgb.g * opacity;
                          b = b * (1 - opacity) + owner.rgb.b * opacity;
                      }
                  }

                  data[index] = r;
                  data[index+1] = g;
                  data[index+2] = b;
                  data[index+3] = 255;
              }
          }

          ctx.putImageData(imgData, 0, 0);

          // 3. Draw Icons (Cities)
          factionData.forEach(f => {
              ctx.beginPath();
              ctx.arc(f.px, f.py, 6, 0, Math.PI * 2);
              ctx.fillStyle = f.color;
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.fill();
              ctx.stroke();
              
              // Highlight selected/hovered
              if (f.id === isDragging || f.id === hoveredFactionId) {
                  ctx.beginPath();
                  ctx.arc(f.px, f.py, 10, 0, Math.PI * 2);
                  ctx.strokeStyle = 'white';
                  ctx.lineWidth = 2;
                  ctx.stroke();
                  
                  // Label
                  ctx.fillStyle = 'rgba(0,0,0,0.7)';
                  ctx.fillRect(f.px + 10, f.py - 12, ctx.measureText(f.name).width + 10, 24);
                  ctx.fillStyle = 'white';
                  ctx.font = '12px sans-serif';
                  ctx.fillText(f.name, f.px + 15, f.py + 4);
              }
          });

      }, [structure.factions, structure.regions, viewMode, isDragging, hoveredFactionId, noise]);

      useEffect(() => {
          requestAnimationFrame(drawMap);
      }, [drawMap]);

      // --- Interactive Logic ---

      const getMousePos = (e: React.MouseEvent) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return { x: 0, y: 0 };
          return {
              x: (e.clientX - rect.left) * (WIDTH / rect.width),
              y: (e.clientY - rect.top) * (HEIGHT / rect.height)
          };
      };

      const handleMouseDown = (e: React.MouseEvent) => {
          const { x, y } = getMousePos(e);
          const factions = structure.factions || [];
          
          // Check collision with cities
          for (const f of factions) {
              const px = (f.x / 100) * WIDTH;
              const py = (f.y / 100) * HEIGHT;
              const dist = Math.sqrt((x - px)**2 + (y - py)**2);
              if (dist < 15) { // Hit radius
                  setIsDragging(f.id);
                  return;
              }
          }
      };

      const handleMouseMove = (e: React.MouseEvent) => {
          const { x, y } = getMousePos(e);
          
          if (isDragging) {
              // Update coordinate
              const newX = Math.max(0, Math.min(100, (x / WIDTH) * 100));
              const newY = Math.max(0, Math.min(100, (y / HEIGHT) * 100));
              
              setStructure({
                  ...structure,
                  factions: structure.factions.map(f => f.id === isDragging ? { ...f, x: newX, y: newY } : f)
              });
          } else {
              // Hover Logic
              const factions = structure.factions || [];
              let found = null;
              for (const f of factions) {
                  const px = (f.x / 100) * WIDTH;
                  const py = (f.y / 100) * HEIGHT;
                  const dist = Math.sqrt((x - px)**2 + (y - py)**2);
                  if (dist < 15) {
                      found = f.id;
                      break;
                  }
              }
              setHoveredFactionId(found);
              // Set Cursor
              if (canvasRef.current) {
                  canvasRef.current.style.cursor = found ? 'move' : 'default';
              }
          }
      };

      const handleMouseUp = () => {
          setIsDragging(null);
      };

      if (!structure.regions || structure.regions.length === 0) {
           return (
               <div className="w-full h-80 bg-ink-50 rounded-xl border border-ink-200 flex flex-col items-center justify-center text-ink-400 text-sm gap-2">
                   <Globe size={48} className="opacity-20" />
                   <p>暂无地理数据</p>
                   <button onClick={handleGenerateFactions} className="text-primary hover:underline">点击生成地形与势力</button>
               </div>
           );
      }

      return (
          <div className="w-full bg-[#0f172a] rounded-xl border border-ink-200 relative overflow-hidden mt-4 shadow-inner group select-none">
               {/* Controls Overlay */}
               <div className="absolute top-3 right-3 flex gap-2 z-10">
                   <button 
                      onClick={() => setViewMode('terrain')}
                      className={`p-2 rounded-lg text-xs font-bold transition ${viewMode === 'terrain' ? 'bg-white text-ink-900 shadow' : 'bg-black/50 text-white/70 hover:bg-black/70'}`}
                      title="地形视图"
                   >
                       <Mountain size={14} />
                   </button>
                   <button 
                      onClick={() => setViewMode('political')}
                      className={`p-2 rounded-lg text-xs font-bold transition ${viewMode === 'political' ? 'bg-white text-ink-900 shadow' : 'bg-black/50 text-white/70 hover:bg-black/70'}`}
                      title="政区视图"
                   >
                       <Flag size={14} />
                   </button>
                   <button 
                      onClick={() => setViewMode('mixed')}
                      className={`p-2 rounded-lg text-xs font-bold transition ${viewMode === 'mixed' ? 'bg-white text-ink-900 shadow' : 'bg-black/50 text-white/70 hover:bg-black/70'}`}
                      title="混合视图"
                   >
                       <Layers size={14} />
                   </button>
               </div>

               <div className="absolute top-3 left-3 bg-black/60 text-white/80 text-[10px] px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                   提示：可直接拖拽势力据点调整疆域
               </div>

               <canvas 
                   ref={canvasRef}
                   width={WIDTH}
                   height={HEIGHT}
                   className="w-full h-full object-cover cursor-default"
                   onMouseDown={handleMouseDown}
                   onMouseMove={handleMouseMove}
                   onMouseUp={handleMouseUp}
                   onMouseLeave={handleMouseUp}
               />
          </div>
      );
  };

  return (
    <div className="max-w-4xl mx-auto p-8 animate-fade-in h-full overflow-y-auto pb-20">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold text-ink-900 mb-2">世界观与架构</h2>
          <p className="text-ink-500">构建故事的宏观舞台与骨干。</p>
        </div>
        <button
            onClick={handleGenerate}
            disabled={status === GenerationStatus.THINKING}
            className="flex items-center space-x-2 bg-primary hover:bg-primary-hover disabled:bg-ink-300 text-white px-5 py-2.5 rounded-lg font-medium transition shadow-sm"
        >
            {status === GenerationStatus.THINKING ? (
                <><Loader2 className="animate-spin" size={18} /><span>构思中...</span></>
            ) : (
                <><Sparkles size={18} /><span>AI 自动构建</span></>
            )}
        </button>
      </div>

      <div className="space-y-8">
        {/* World View */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <div className="flex items-center gap-2 mb-4 text-indigo-700">
                <Map size={20} />
                <h3 className="text-lg font-bold">世界观设定 (World Building)</h3>
            </div>
            <textarea
                value={structure.worldView}
                onChange={(e) => handleChange('worldView', e.target.value)}
                className="w-full p-4 border border-ink-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-48 resize-none"
                placeholder="描述地理环境、力量体系（等级划分）、政治势力、历史背景等..."
            />
        </div>

        {/* Faction Map - UPDATED with Canvas */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <div className="flex justify-between items-center mb-4">
                 <div className="flex items-center gap-2 text-indigo-700">
                    <Globe size={20} />
                    <h3 className="text-lg font-bold">地图势力分布 (Factions Map)</h3>
                </div>
                <button
                    onClick={handleGenerateFactions}
                    disabled={factionStatus === GenerationStatus.THINKING}
                    className="text-xs flex items-center gap-1 bg-ink-100 hover:bg-ink-200 text-ink-700 px-3 py-1.5 rounded-lg transition"
                >
                    {factionStatus === GenerationStatus.THINKING ? (
                        <><Loader2 className="animate-spin" size={12} /> 生成中...</>
                    ) : (
                        <><RefreshCcw size={12} /> AI 生成地理与势力</>
                    )}
                </button>
            </div>
            
            <p className="text-sm text-ink-500 mb-2">程序化生成的虚拟世界地图。拖动势力据点可实时调整疆域。</p>
            
            <ProceduralMap />
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(structure.factions || []).map((f) => (
                    <div 
                        key={f.id} 
                        className={`bg-ink-50 p-3 rounded-lg border text-sm hover:border-primary/50 cursor-pointer group transition ${editingFactionId === f.id ? 'border-primary ring-1 ring-primary' : 'border-ink-100'}`}
                        onClick={() => startEditFaction(f)}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: f.color }}></div>
                            <span className="font-bold">{f.name}</span>
                            <span className="text-xs text-ink-400 ml-auto">Lv.{f.influence}</span>
                            <Edit2 size={12} className="opacity-0 group-hover:opacity-100 text-primary ml-1" />
                        </div>
                        <p className="text-xs text-ink-600 line-clamp-2">{f.description}</p>
                    </div>
                ))}
                 <button 
                    onClick={startNewFaction}
                    className="flex flex-col items-center justify-center p-3 border border-dashed border-ink-300 rounded-lg text-ink-400 hover:bg-ink-50 hover:text-primary transition gap-1"
                 >
                     <Plus size={16} />
                     <span className="text-xs">添加新势力</span>
                 </button>
            </div>
        </div>

        {/* Global Memory / Series Bible */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200 border-l-4 border-l-rose-500">
            <div className="flex items-center gap-2 mb-2 text-rose-700">
                <BookMarked size={20} />
                <h3 className="text-lg font-bold">全局备忘录 (Series Bible)</h3>
            </div>
            <p className="text-sm text-ink-500 mb-4">
                在此记录全书的<b>核心伏笔、绝对规则或不可遗忘的设定</b>。无论写到第几章，AI 都会强制“记住”并参考这些内容。
            </p>
            <textarea
                value={structure.globalMemory || ''}
                onChange={(e) => handleChange('globalMemory', e.target.value)}
                className="w-full p-4 border border-ink-300 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none h-48 font-mono text-sm bg-rose-50/30"
                placeholder={`例如：
1. 主角的玉佩其实是开启神界的钥匙 (第一章伏笔)。
2. 只要月圆之夜，反派BOSS的力量就会减半。
3. 系统最终目的是培养救世主，而非单纯变强。
...`}
            />
        </div>

        {/* Central Conflict */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <h3 className="text-lg font-bold mb-4 text-ink-800">核心冲突 (Central Conflict)</h3>
            <textarea
                value={structure.centralConflict}
                onChange={(e) => handleChange('centralConflict', e.target.value)}
                className="w-full p-4 border border-ink-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                placeholder="主角最终要打败谁？要解决什么终极危机？"
            />
        </div>

        {/* Key Plot Points */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-ink-800">关键剧情节点 (Milestones)</h3>
                <button onClick={addPoint} className="text-sm text-primary hover:text-primary-hover font-medium">
                    + 添加节点
                </button>
            </div>
            <div className="space-y-3">
                {structure.keyPlotPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                        <span className="bg-ink-100 text-ink-500 w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-2.5">
                            {idx + 1}
                        </span>
                        <textarea
                            value={point}
                            onChange={(e) => handlePointChange(idx, e.target.value)}
                            className="flex-1 p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none text-sm"
                        />
                        <button 
                            onClick={() => removePoint(idx)}
                            className="text-ink-300 hover:text-red-500 mt-2.5"
                        >
                            &times;
                        </button>
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* Edit Faction Modal */}
      {editingFactionId && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col animate-fade-in">
                  <div className="px-6 py-4 border-b border-ink-100 flex justify-between items-center bg-ink-50 rounded-t-xl">
                      <h3 className="font-bold text-lg text-ink-900">编辑势力</h3>
                      <button onClick={() => setEditingFactionId(null)} className="text-ink-400 hover:text-ink-700">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-1">势力名称</label>
                          <input 
                              type="text" 
                              value={editFactionForm.name || ''} 
                              onChange={e => setEditFactionForm({...editFactionForm, name: e.target.value})}
                              className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                          />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">代表色</label>
                              <div className="flex items-center gap-2">
                                <input 
                                    type="color" 
                                    value={editFactionForm.color || '#000000'} 
                                    onChange={e => setEditFactionForm({...editFactionForm, color: e.target.value})}
                                    className="h-9 w-9 border-none p-0 cursor-pointer rounded overflow-hidden"
                                />
                                <span className="text-xs text-ink-500 font-mono">{editFactionForm.color}</span>
                              </div>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">影响力 (1-10)</label>
                              <input 
                                  type="number" 
                                  min="1" max="10"
                                  value={editFactionForm.influence || 1} 
                                  onChange={e => setEditFactionForm({...editFactionForm, influence: parseInt(e.target.value)})}
                                  className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                              />
                          </div>
                      </div>

                       <div>
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-1">地图坐标 (0-100)</label>
                          <div className="flex gap-2">
                              <div className="relative w-1/2">
                                <span className="absolute left-2 top-2 text-xs text-ink-400">X:</span>
                                <input 
                                    type="number" 
                                    value={Math.round(editFactionForm.x || 0)} 
                                    onChange={e => setEditFactionForm({...editFactionForm, x: parseInt(e.target.value)})}
                                    className="w-full pl-6 p-2 border border-ink-300 rounded text-sm"
                                />
                              </div>
                              <div className="relative w-1/2">
                                <span className="absolute left-2 top-2 text-xs text-ink-400">Y:</span>
                                <input 
                                    type="number" 
                                    value={Math.round(editFactionForm.y || 0)} 
                                    onChange={e => setEditFactionForm({...editFactionForm, y: parseInt(e.target.value)})}
                                    className="w-full pl-6 p-2 border border-ink-300 rounded text-sm"
                                />
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-1">简介与地理关系</label>
                          <textarea 
                              value={editFactionForm.description || ''} 
                              onChange={e => setEditFactionForm({...editFactionForm, description: e.target.value})}
                              className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-24 resize-none"
                          />
                      </div>
                  </div>
                  <div className="px-6 py-4 border-t border-ink-100 flex justify-between bg-ink-50 rounded-b-xl">
                      <button 
                        onClick={() => deleteFaction(editingFactionId)}
                        className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded transition"
                        title="删除"
                      >
                          <Trash2 size={18} />
                      </button>
                      <div className="flex space-x-3">
                          <button onClick={() => setEditingFactionId(null)} className="px-4 py-2 text-ink-600 hover:bg-ink-200 rounded-lg transition">取消</button>
                          <button onClick={saveFaction} className="px-4 py-2 bg-primary text-white hover:bg-primary-hover rounded-lg shadow-sm flex items-center space-x-2 transition">
                              <Save size={16} />
                              <span>保存修改</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default StructureDesigner;