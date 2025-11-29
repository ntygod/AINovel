
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Character, NovelConfig, WorldStructure, GenerationStatus, AppSettings } from '../types';
import { generateCharacters, generateRandomNames } from '../services/geminiService';
import { Users, Sparkles, Loader2, Plus, Trash2, Edit2, X, Save, Network, LayoutGrid, Info, Dices, User } from 'lucide-react';

interface CharacterForgeProps {
  characters: Character[];
  setCharacters: (chars: Character[]) => void;
  config: NovelConfig;
  settings: AppSettings;
  structure: WorldStructure;
}

const CharacterForge: React.FC<CharacterForgeProps> = ({ characters, setCharacters, config, settings, structure }) => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'graph'>('grid');
  const [nameGenStatus, setNameGenStatus] = useState(false);
  const [generateCount, setGenerateCount] = useState<number>(5);
  
  // Local state for editing a character
  const [editForm, setEditForm] = useState<Partial<Character>>({});

  const handleGenerate = async () => {
    if (!settings.apiKey) {
        alert("请先在应用设置中配置 API Key。");
        return;
    }
    if (!config.mainPlot) {
        alert("请先在项目设置中定义核心梗概/主线目标。");
        return;
    }

    if (characters.length > 0) {
        if (!window.confirm(`当前已有 ${characters.length} 个角色。AI 将会基于现有角色，额外生成一批有关联的新角色。是否继续？`)) {
            return;
        }
    }

    setStatus(GenerationStatus.THINKING);
    try {
      const newChars = await generateCharacters(config, settings, characters, structure, generateCount);
      setCharacters([...characters, ...newChars]);
      setStatus(GenerationStatus.COMPLETED);
    } catch (e) {
      console.error(e);
      setStatus(GenerationStatus.ERROR);
    }
  };

  const handleRandomName = async () => {
     if (!settings.apiKey) return alert("请配置 API Key");
     setNameGenStatus(true);
     try {
         const names = await generateRandomNames(config, settings);
         if (names && names.length > 0) {
             setEditForm(prev => ({ ...prev, name: names[0] }));
         }
     } catch (e) {
         console.error(e);
     } finally {
         setNameGenStatus(false);
     }
  };

  const removeCharacter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("确定要删除这个角色吗？")) {
        setCharacters(characters.filter(c => c.id !== id));
    }
  };

  const startEdit = (char: Character) => {
      setEditingId(char.id);
      setEditForm(JSON.parse(JSON.stringify(char))); // Deep copy
  };

  const startNew = () => {
      const newId = crypto.randomUUID();
      const newChar: Character = {
          id: newId,
          name: "新角色",
          role: "配角",
          description: "一句话简介",
          appearance: "",
          background: "",
          personality: "",
          relationships: []
      };
      setEditingId(newId);
      setEditForm(newChar);
  };

  const saveEdit = () => {
      if (!editForm.name || !editForm.id) return;
      
      const newChar = editForm as Character;
      
      if (characters.find(c => c.id === newChar.id)) {
          setCharacters(characters.map(c => c.id === newChar.id ? newChar : c));
      } else {
          setCharacters([...characters, newChar]);
      }
      setEditingId(null);
      setEditForm({});
  };

  const cancelEdit = () => {
      setEditingId(null);
      setEditForm({});
  };

  // Interactive Relationship Graph Component
  const InteractiveGraph = () => {
      const svgRef = useRef<SVGSVGElement>(null);
      const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 });
      const [isDragging, setIsDragging] = useState(false);
      const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
      const [dragNode, setDragNode] = useState<string | null>(null);
      
      // Node positions state - start with circle, then allow drag
      const [nodePositions, setNodePositions] = useState<Record<string, {x: number, y: number}>>({});

      useEffect(() => {
          // Initialize positions in a circle if not set
          if (Object.keys(nodePositions).length === 0 && characters.length > 0) {
              const width = 800;
              const height = 600;
              const centerX = width / 2;
              const centerY = height / 2;
              const radius = Math.min(width, height) / 3;
              
              const newPos: Record<string, {x: number, y: number}> = {};
              characters.forEach((char, index) => {
                  const angle = (index / characters.length) * 2 * Math.PI;
                  newPos[char.id] = {
                      x: centerX + radius * Math.cos(angle),
                      y: centerY + radius * Math.sin(angle)
                  };
              });
              setNodePositions(newPos);
          }
      }, [characters]); // Only runs if characters change significantly or on mount

      const handleWheel = (e: React.WheelEvent) => {
          e.preventDefault(); // Prevent page scroll (might require ref listener for passive: false)
          const scale = e.deltaY > 0 ? 1.1 : 0.9;
          setViewBox(prev => ({
              x: prev.x + (prev.w - prev.w * scale) / 2,
              y: prev.y + (prev.h - prev.h * scale) / 2,
              w: prev.w * scale,
              h: prev.h * scale
          }));
      };

      const handleMouseDown = (e: React.MouseEvent, nodeId?: string) => {
          if (nodeId) {
              e.stopPropagation();
              setDragNode(nodeId);
          } else {
              setIsDragging(true);
              setDragStart({ x: e.clientX, y: e.clientY });
          }
      };

      const handleMouseMove = (e: React.MouseEvent) => {
          if (isDragging) {
              const dx = (e.clientX - dragStart.x) * (viewBox.w / svgRef.current!.clientWidth);
              const dy = (e.clientY - dragStart.y) * (viewBox.h / svgRef.current!.clientHeight);
              setViewBox(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
              setDragStart({ x: e.clientX, y: e.clientY });
          } else if (dragNode) {
              // Convert screen dxy to svg dxy
              const svg = svgRef.current;
              if (!svg) return;
              
              const pt = svg.createSVGPoint();
              pt.x = e.clientX;
              pt.y = e.clientY;
              // Transform to SVG coordinates
              const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
              
              setNodePositions(prev => ({
                  ...prev,
                  [dragNode]: { x: svgP.x, y: svgP.y }
              }));
          }
      };

      const handleMouseUp = () => {
          setIsDragging(false);
          setDragNode(null);
      };

      const links = useMemo(() => {
          const arr: any[] = [];
          characters.forEach(source => {
              source.relationships?.forEach(rel => {
                  if (characters.find(c => c.id === rel.targetId)) {
                       arr.push({ sourceId: source.id, targetId: rel.targetId, label: rel.relation });
                  }
              });
          });
          return arr;
      }, [characters]);

      return (
        <div className="w-full h-[600px] bg-ink-50 rounded-xl border border-ink-200 shadow-sm overflow-hidden relative cursor-grab active:cursor-grabbing">
            <svg 
                ref={svgRef}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} 
                className="w-full h-full"
                onMouseDown={(e) => handleMouseDown(e)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" className="fill-ink-300" />
                    </marker>
                </defs>
                
                {/* Links */}
                {links.map((link, i) => {
                    const s = nodePositions[link.sourceId] || {x:0, y:0};
                    const t = nodePositions[link.targetId] || {x:0, y:0};
                    if (s.x === 0 && s.y === 0) return null;
                    
                    return (
                        <g key={i} className="pointer-events-none">
                            <line 
                                x1={s.x} y1={s.y}
                                x2={t.x} y2={t.y}
                                className="stroke-ink-300"
                                strokeWidth="1.5"
                                markerEnd="url(#arrowhead)"
                            />
                            <text 
                                x={(s.x + t.x) / 2} 
                                y={(s.y + t.y) / 2}
                                textAnchor="middle"
                                className="fill-ink-500 text-[10px]"
                                dy="-5"
                                style={{ textShadow: '0 0 2px white' }}
                            >
                                {link.label}
                            </text>
                        </g>
                    );
                })}

                {/* Nodes */}
                {characters.map((char) => {
                    const pos = nodePositions[char.id];
                    if (!pos) return null;
                    
                    return (
                        <g 
                            key={char.id} 
                            transform={`translate(${pos.x}, ${pos.y})`}
                            onMouseDown={(e) => handleMouseDown(e, char.id)}
                            onDoubleClick={() => startEdit(char)}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                            <circle r="24" className="fill-white stroke-primary" strokeWidth="2" />
                            <text dy="5" textAnchor="middle" className="fill-primary font-bold text-xs pointer-events-none">
                                {char.name.slice(0, 1)}
                            </text>
                            <text y="40" textAnchor="middle" className="fill-ink-800 text-xs font-bold pointer-events-none">
                                {char.name}
                            </text>
                            <text y="54" textAnchor="middle" className="fill-ink-500 text-[10px] pointer-events-none">
                                {char.role}
                            </text>
                        </g>
                    );
                })}
            </svg>
             <div className="absolute top-4 left-4 bg-white/90 p-3 rounded-lg text-xs text-ink-500 border border-ink-100 shadow-sm pointer-events-none">
                <p>🖱️ <b>拖拽画布</b>: 移动视角</p>
                <p>🖱️ <b>滚轮</b>: 缩放视图</p>
                <p>🖱️ <b>拖拽节点</b>: 调整位置</p>
                <p>🖱️ <b>双击节点</b>: 编辑详情</p>
            </div>
            
            {/* Reset View Button */}
            <button 
                onClick={() => setViewBox({ x: 0, y: 0, w: 800, h: 600 })}
                className="absolute bottom-4 right-4 bg-white p-2 rounded shadow border border-ink-200 text-ink-500 hover:text-primary"
                title="重置视图"
            >
                <LayoutGrid size={16} />
            </button>
        </div>
      );
  };

  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto relative">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-3xl font-bold text-ink-900 mb-2">角色锻造</h2>
          <p className="text-ink-500">注入世界的灵魂。</p>
        </div>
        <div className="flex space-x-3">
             <div className="bg-ink-100 p-1 rounded-lg flex space-x-1 mr-4">
                 <button 
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow text-primary' : 'text-ink-400 hover:text-ink-600'}`}
                    title="卡片视图"
                 >
                     <LayoutGrid size={18} />
                 </button>
                 <button 
                    onClick={() => setViewMode('graph')}
                    className={`p-2 rounded-md transition ${viewMode === 'graph' ? 'bg-white shadow text-primary' : 'text-ink-400 hover:text-ink-600'}`}
                    title="关系图谱"
                 >
                     <Network size={18} />
                 </button>
             </div>

             <button
                onClick={startNew}
                className="flex items-center space-x-2 bg-white border border-ink-300 text-ink-700 hover:bg-ink-50 px-4 py-2.5 rounded-lg font-medium transition shadow-sm"
            >
                <Plus size={18} />
                <span>手动新建</span>
            </button>
            
            <div className="flex items-center space-x-2">
                <input
                    type="number"
                    min="1"
                    max="10"
                    value={generateCount}
                    onChange={(e) => setGenerateCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className="w-16 px-2 py-2 border border-ink-300 rounded text-center"
                />
                <button
                onClick={handleGenerate}
                disabled={status === GenerationStatus.THINKING}
                className="flex items-center space-x-2 bg-primary hover:bg-primary-hover disabled:bg-ink-300 text-white px-5 py-2.5 rounded-lg font-medium transition shadow-sm"
                >
                {status === GenerationStatus.THINKING ? (
                    <><Loader2 className="animate-spin" size={18} /><span>构思中...</span></>
                ) : (
                    <><Sparkles size={18} /><span>AI 生成角色</span></>
                )}
                </button>
            </div>
        </div>
      </div>
      
      {/* Association Hint */}
      {characters.length > 0 && (
         <div className="bg-primary-light text-primary border border-primary/20 text-xs px-4 py-2 rounded-lg mb-6 flex items-center gap-2">
            <Info size={14} />
            <span>AI 生成的角色包含详细的外貌、背景和关系网。修改角色后，建议在"大纲与剧情"页面使用这些新设定优化剧情。</span>
         </div>
      )}

      {viewMode === 'graph' ? <InteractiveGraph /> : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-10">
            {characters.map((char) => (
            <div 
                key={char.id} 
                onClick={() => startEdit(char)}
                className="bg-white p-6 rounded-xl shadow-sm border border-ink-200 group relative hover:border-primary/50 hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col h-full"
            >
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-ink-900 flex items-center gap-2">
                            {char.name}
                            <Edit2 size={14} className="opacity-0 group-hover:opacity-100 text-primary" />
                        </h3>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-ink-100 text-primary text-xs font-semibold rounded-full border border-ink-200">
                            {char.role}
                        </span>
                    </div>
                    <button 
                        onClick={(e) => removeCharacter(char.id, e)}
                        className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-50 rounded-full"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
                
                <div className="space-y-4 flex-1">
                    <div>
                         <p className="text-sm text-ink-600 italic border-l-2 border-primary/30 pl-3 py-1">
                             “{char.description}”
                         </p>
                    </div>
                    {char.appearance && (
                         <div className="text-xs">
                             <span className="font-bold text-ink-400 uppercase tracking-wide">外貌</span>
                             <p className="text-ink-700 mt-1 line-clamp-2">{char.appearance}</p>
                         </div>
                    )}
                    {char.background && (
                         <div className="text-xs">
                             <span className="font-bold text-ink-400 uppercase tracking-wide">背景</span>
                             <p className="text-ink-700 mt-1 line-clamp-2">{char.background}</p>
                         </div>
                    )}
                </div>
            </div>
            ))}

            {characters.length === 0 && status !== GenerationStatus.THINKING && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-ink-400 border-2 border-dashed border-ink-200 rounded-xl">
                    <Users size={48} className="mb-4 text-ink-300" />
                    <p>暂无角色。请使用AI生成或手动添加。</p>
                </div>
            )}
        </div>
      )}

      {/* Edit Modal */}
      {editingId && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col animate-fade-in">
                  <div className="px-6 py-4 border-b border-ink-100 flex justify-between items-center bg-ink-50 shrink-0">
                      <h3 className="font-bold text-lg text-ink-900 flex items-center gap-2">
                          <User size={20} />
                          {characters.find(c => c.id === editingId) ? '编辑角色档案' : '创建新角色'}
                      </h3>
                      <button onClick={cancelEdit} className="text-ink-400 hover:text-ink-700">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                          <div>
                              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">姓名</label>
                              <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={editForm.name || ''} 
                                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                                    className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                />
                                <button 
                                    onClick={handleRandomName}
                                    disabled={nameGenStatus}
                                    className="p-2.5 bg-ink-100 text-ink-600 rounded-lg hover:bg-ink-200 transition"
                                    title="AI 随机生成姓名"
                                >
                                    {nameGenStatus ? <Loader2 size={18} className="animate-spin" /> : <Dices size={18} />}
                                </button>
                              </div>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">角色定位</label>
                              <input 
                                type="text" 
                                value={editForm.role || ''} 
                                onChange={e => setEditForm({...editForm, role: e.target.value})}
                                className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                              />
                          </div>
                      </div>

                       <div>
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-1">一句话简介</label>
                          <input 
                            type="text"
                            value={editForm.description || ''} 
                            onChange={e => setEditForm({...editForm, description: e.target.value})}
                            className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                          />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                                <label className="block text-xs font-bold text-ink-500 uppercase mb-1">外貌描写</label>
                                <textarea 
                                    value={editForm.appearance || ''} 
                                    onChange={e => setEditForm({...editForm, appearance: e.target.value})}
                                    className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-32 resize-none"
                                    placeholder="身高、发色、穿着、 distinctive features..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-ink-500 uppercase mb-1">性格与心理</label>
                                <textarea 
                                    value={editForm.personality || ''} 
                                    onChange={e => setEditForm({...editForm, personality: e.target.value})}
                                    className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-32 resize-none"
                                    placeholder="MBTI、行事风格、优缺点..."
                                />
                            </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-1">背景故事</label>
                          <textarea 
                            value={editForm.background || ''} 
                            onChange={e => setEditForm({...editForm, background: e.target.value})}
                            className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-32 resize-none"
                            placeholder="过往经历、童年、创伤、目标..."
                          />
                      </div>

                      {/* Manual Relationship Editor */}
                      <div>
                           <label className="block text-xs font-bold text-ink-500 uppercase mb-2">人际关系</label>
                           <div className="bg-ink-50 p-4 rounded-lg border border-ink-100 text-sm space-y-2">
                               {editForm.relationships && editForm.relationships.length > 0 ? (
                                   editForm.relationships.map((rel, idx) => (
                                       <div key={idx} className="flex items-center gap-2">
                                            <span className="font-bold text-primary">{rel.targetName}</span>
                                            <span className="text-ink-400">is</span>
                                            <span className="bg-white border border-ink-200 px-2 py-0.5 rounded text-xs">{rel.relation}</span>
                                            <button 
                                                onClick={() => {
                                                    const newRels = editForm.relationships?.filter((_, i) => i !== idx);
                                                    setEditForm({...editForm, relationships: newRels});
                                                }}
                                                className="text-red-400 hover:text-red-600 ml-auto"
                                            >
                                                &times;
                                            </button>
                                       </div>
                                   ))
                               ) : (
                                   <p className="text-ink-400 italic">暂无记录关系。</p>
                               )}
                               
                               <div className="pt-2 border-t border-ink-200 mt-2 flex gap-2">
                                   <select 
                                     className="text-xs p-1 border rounded text-ink-800"
                                     id="rel-target"
                                   >
                                       {characters.filter(c => c.id !== editForm.id).map(c => (
                                           <option key={c.id} value={`${c.id}|${c.name}`}>{c.name}</option>
                                       ))}
                                   </select>
                                   <input 
                                     type="text" 
                                     placeholder="关系 (如: 朋友)" 
                                     className="text-xs p-1 border rounded flex-1"
                                     id="rel-desc"
                                   />
                                   <button 
                                     onClick={() => {
                                         const select = document.getElementById('rel-target') as HTMLSelectElement;
                                         const input = document.getElementById('rel-desc') as HTMLInputElement;
                                         if(!select.value || !input.value) return;
                                         const [tid, tname] = select.value.split('|');
                                         const newRel = { targetId: tid, targetName: tname, relation: input.value };
                                         setEditForm({
                                             ...editForm, 
                                             relationships: [...(editForm.relationships || []), newRel]
                                         });
                                         input.value = '';
                                     }}
                                     className="text-xs bg-ink-200 text-ink-700 px-2 rounded hover:bg-ink-300"
                                   >
                                       添加
                                   </button>
                               </div>
                           </div>
                      </div>
                  </div>

                  <div className="px-6 py-4 border-t border-ink-100 flex justify-end space-x-3 bg-ink-50 shrink-0">
                      <button onClick={cancelEdit} className="px-4 py-2 text-ink-600 hover:bg-ink-200 rounded-lg transition">取消</button>
                      <button onClick={saveEdit} className="px-4 py-2 bg-primary text-white hover:bg-primary-hover rounded-lg shadow-sm flex items-center space-x-2 transition">
                          <Save size={16} />
                          <span>保存完整档案</span>
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default CharacterForge;
