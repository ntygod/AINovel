
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Character, CharacterGender, CharacterArchetype, NovelConfig, WorldStructure, GenerationStatus, AppSettings, Volume, Chapter } from '../types';
import { generateCharacters, generateRandomNames, generateCharactersWithContext, analyzeCharacterInChapters, CharacterGenerationContext } from '../services/geminiService';
import { getArchetypes, getArchetypeById } from '../services/archetypeService';
import { validateCharacter, applyStatusSuggestion, StatusSyncSuggestion } from '../services/characterService';
import { autoIndexOnSave } from '../services/ragService';
import { Users, Sparkles, Loader2, Plus, Trash2, Edit2, X, Save, Network, LayoutGrid, Info, Dices, User, RefreshCw, Tag, AlertCircle, Check, ChevronDown } from 'lucide-react';

interface CharacterForgeProps {
  characters: Character[];
  setCharacters: (chars: Character[]) => void;
  config: NovelConfig;
  settings: AppSettings;
  structure: WorldStructure;
  volumes?: Volume[];
  chapters?: Chapter[];
}

// Common speaking style options
const SPEAKING_STYLE_OPTIONS = [
  '傲慢', '温柔', '冷漠', '幽默', '毒舌', '神秘', '热情', '沉稳',
  '傲娇', '腹黑', '天真', '老成', '粗犷', '文雅', '狡猾', '憨厚'
];

const CharacterForge: React.FC<CharacterForgeProps> = ({ 
  characters, 
  setCharacters, 
  config, 
  settings, 
  structure,
  volumes = [],
  chapters = []
}) => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'graph'>('grid');
  const [nameGenStatus, setNameGenStatus] = useState(false);
  const [generateCount, setGenerateCount] = useState<number>(5);
  
  // Context selection for AI generation
  const [selectedVolumeId, setSelectedVolumeId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('');
  
  // Status sync state
  const [syncingCharacterId, setSyncingCharacterId] = useState<string | null>(null);
  const [syncSuggestion, setSyncSuggestion] = useState<StatusSyncSuggestion | null>(null);
  
  // Local state for editing a character
  const [editForm, setEditForm] = useState<Partial<Character>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Tag input state
  const [tagInput, setTagInput] = useState('');

  // Get filtered chapters based on selected volume
  const filteredChapters = useMemo(() => {
    if (!selectedVolumeId) return chapters;
    const volume = volumes.find(v => v.id === selectedVolumeId);
    if (!volume || !volume.chapterIds) return chapters;
    return chapters.filter(c => volume.chapterIds.includes(c.id));
  }, [selectedVolumeId, volumes, chapters]);

  // Get archetypes
  const archetypes = useMemo(() => getArchetypes(), []);

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
      // Build context for generation
      const context: CharacterGenerationContext = {};
      
      if (selectedVolumeId) {
        context.volume = volumes.find(v => v.id === selectedVolumeId);
      }
      if (selectedChapterId) {
        context.chapter = chapters.find(c => c.id === selectedChapterId);
      }
      if (selectedArchetypeId) {
        context.archetype = getArchetypeById(selectedArchetypeId);
      }
      
      // Use context-aware generation if context is provided
      let newChars: Character[];
      if (context.volume || context.chapter || context.archetype) {
        newChars = await generateCharactersWithContext(config, settings, characters, structure, context, generateCount);
      } else {
        newChars = await generateCharacters(config, settings, characters, structure, generateCount);
      }
      
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
      setValidationErrors([]);
      setTagInput('');
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
          relationships: [],
          // New fields with defaults
          gender: 'unknown',
          age: '',
          speakingStyle: '',
          motivation: '',
          fears: '',
          narrativeFunction: '',
          status: '正常',
          tags: [],
          isActive: true,
      };
      setEditingId(newId);
      setEditForm(newChar);
      setValidationErrors([]);
      setTagInput('');
  };

  const saveEdit = () => {
      if (!editForm.name || !editForm.id) return;
      
      const newChar = editForm as Character;
      
      // Validate character
      const validation = validateCharacter(newChar);
      if (!validation.isValid) {
          setValidationErrors(validation.errors);
          return;
      }
      
      if (characters.find(c => c.id === newChar.id)) {
          setCharacters(characters.map(c => c.id === newChar.id ? newChar : c));
      } else {
          setCharacters([...characters, newChar]);
      }
      
      // Auto-index character for RAG
      autoIndexOnSave('character', newChar, settings);
      
      setEditingId(null);
      setEditForm({});
      setValidationErrors([]);
  };

  const cancelEdit = () => {
      setEditingId(null);
      setEditForm({});
      setValidationErrors([]);
      setSyncSuggestion(null);
  };

  // Handle tag addition
  const addTag = () => {
    if (!tagInput.trim()) return;
    const currentTags = editForm.tags || [];
    if (!currentTags.includes(tagInput.trim())) {
      setEditForm({ ...editForm, tags: [...currentTags, tagInput.trim()] });
    }
    setTagInput('');
  };

  // Handle tag removal
  const removeTag = (tagToRemove: string) => {
    const currentTags = editForm.tags || [];
    setEditForm({ ...editForm, tags: currentTags.filter(t => t !== tagToRemove) });
  };

  // Handle status sync
  const handleSyncStatus = async (char: Character) => {
    if (!settings.apiKey) {
      alert("请先配置 API Key");
      return;
    }
    
    setSyncingCharacterId(char.id);
    setSyncSuggestion(null);
    
    try {
      const suggestion = await analyzeCharacterInChapters(char, chapters, settings);
      setSyncSuggestion(suggestion);
    } catch (e) {
      console.error('Status sync failed:', e);
      alert('状态同步失败，请重试');
    } finally {
      setSyncingCharacterId(null);
    }
  };

  // Apply sync suggestion
  const applySyncSuggestion = () => {
    if (!syncSuggestion || !editForm.id) return;
    
    const updated = applyStatusSuggestion(editForm as Character, syncSuggestion);
    setEditForm(updated);
    setSyncSuggestion(null);
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
      }, [characters]);

      const handleWheel = (e: React.WheelEvent) => {
          e.preventDefault();
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
              const svg = svgRef.current;
              if (!svg) return;
              
              const pt = svg.createSVGPoint();
              pt.x = e.clientX;
              pt.y = e.clientY;
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
                            <circle r="24" className={`fill-white stroke-primary ${char.isActive === false ? 'opacity-50' : ''}`} strokeWidth="2" />
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

  // Archetype Selection Component
  const ArchetypeSelector = () => (
    <div className="mb-4">
      <label className="block text-xs font-bold text-ink-500 uppercase mb-2">选择角色原型</label>
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setSelectedArchetypeId('')}
          className={`p-2 rounded-lg border text-xs transition ${
            !selectedArchetypeId 
              ? 'border-primary bg-primary-light text-primary' 
              : 'border-ink-200 hover:border-ink-300'
          }`}
        >
          无原型
        </button>
        {archetypes.map(arch => (
          <button
            key={arch.id}
            onClick={() => setSelectedArchetypeId(arch.id)}
            className={`p-2 rounded-lg border text-xs transition flex items-center gap-1 ${
              selectedArchetypeId === arch.id 
                ? 'border-primary bg-primary-light text-primary' 
                : 'border-ink-200 hover:border-ink-300'
            }`}
            title={arch.description}
          >
            <span>{arch.icon}</span>
            <span>{arch.name}</span>
          </button>
        ))}
      </div>
    </div>
  );


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
      
      {/* Context Selection for AI Generation */}
      <div className="bg-white p-4 rounded-xl border border-ink-200 mb-6 shadow-sm">
        <h3 className="text-sm font-bold text-ink-700 mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          AI 生成上下文设置
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Volume Selector */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">目标分卷</label>
            <select
              value={selectedVolumeId}
              onChange={(e) => {
                setSelectedVolumeId(e.target.value);
                setSelectedChapterId('');
              }}
              className="w-full p-2 border border-ink-300 rounded-lg text-sm"
            >
              <option value="">不指定分卷</option>
              {volumes.map(v => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          </div>
          
          {/* Chapter Selector */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">目标章节</label>
            <select
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="w-full p-2 border border-ink-300 rounded-lg text-sm"
              disabled={filteredChapters.length === 0}
            >
              <option value="">不指定章节</option>
              {filteredChapters.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          
          {/* Archetype Selector */}
          <div>
            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">角色原型</label>
            <select
              value={selectedArchetypeId}
              onChange={(e) => setSelectedArchetypeId(e.target.value)}
              className="w-full p-2 border border-ink-300 rounded-lg text-sm"
            >
              <option value="">不使用原型</option>
              {archetypes.map(a => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Selected context preview */}
        {(selectedVolumeId || selectedChapterId || selectedArchetypeId) && (
          <div className="text-xs text-ink-500 bg-ink-50 p-2 rounded">
            <span className="font-bold">当前上下文: </span>
            {selectedVolumeId && <span className="mr-2">📚 {volumes.find(v => v.id === selectedVolumeId)?.title}</span>}
            {selectedChapterId && <span className="mr-2">📖 {chapters.find(c => c.id === selectedChapterId)?.title}</span>}
            {selectedArchetypeId && <span>{archetypes.find(a => a.id === selectedArchetypeId)?.icon} {archetypes.find(a => a.id === selectedArchetypeId)?.name}</span>}
          </div>
        )}
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
                className={`bg-white p-6 rounded-xl shadow-sm border border-ink-200 group relative hover:border-primary/50 hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col h-full ${char.isActive === false ? 'opacity-60' : ''}`}
            >
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-ink-900 flex items-center gap-2">
                            {char.name}
                            {char.isActive === false && (
                              <span className="text-xs bg-ink-200 text-ink-500 px-2 py-0.5 rounded">已退场</span>
                            )}
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
                             "{char.description}"
                         </p>
                    </div>
                    
                    {/* New: Display speakingStyle and motivation */}
                    {char.speakingStyle && (
                      <div className="text-xs">
                        <span className="font-bold text-ink-400 uppercase tracking-wide">对话风格</span>
                        <p className="text-ink-700 mt-1">{char.speakingStyle}</p>
                      </div>
                    )}
                    {char.motivation && (
                      <div className="text-xs">
                        <span className="font-bold text-ink-400 uppercase tracking-wide">核心驱动力</span>
                        <p className="text-ink-700 mt-1 line-clamp-2">{char.motivation}</p>
                      </div>
                    )}
                    
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
                    
                    {/* Tags display */}
                    {char.tags && char.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {char.tags.map((tag, idx) => (
                          <span key={idx} className="text-xs bg-primary-light text-primary px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
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
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[90vh] flex flex-col animate-fade-in">
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
                      {/* Validation Errors */}
                      {validationErrors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-red-600 text-sm font-bold mb-1">
                            <AlertCircle size={16} />
                            请修正以下问题：
                          </div>
                          <ul className="text-red-600 text-xs list-disc list-inside">
                            {validationErrors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Basic Info Section */}
                      <div className="bg-ink-50 p-4 rounded-lg">
                        <h4 className="text-sm font-bold text-ink-700 mb-3">基础信息</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">姓名 *</label>
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
                                placeholder="如：主角、反派、配角"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">性别</label>
                              <select
                                value={editForm.gender || 'unknown'}
                                onChange={e => setEditForm({...editForm, gender: e.target.value as CharacterGender})}
                                className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                              >
                                <option value="unknown">未知</option>
                                <option value="male">男</option>
                                <option value="female">女</option>
                                <option value="other">其他</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-ink-500 uppercase mb-1">年龄段</label>
                              <input 
                                type="text" 
                                value={editForm.age || ''} 
                                onChange={e => setEditForm({...editForm, age: e.target.value})}
                                className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                placeholder="如：青年、中年、老年"
                              />
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-1">一句话简介</label>
                          <input 
                            type="text"
                            value={editForm.description || ''} 
                            onChange={e => setEditForm({...editForm, description: e.target.value})}
                            className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                          />
                      </div>

                      {/* AI Writing Guidance Section */}
                      <div className="bg-primary-light/30 p-4 rounded-lg border border-primary/20">
                        <h4 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                          <Sparkles size={16} />
                          AI 写作指导字段
                        </h4>
                        
                        <div className="space-y-4">
                          {/* Speaking Style */}
                          <div>
                            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
                              对话风格 * <span className="text-ink-400 font-normal">(必填，用于指导 AI 生成差异化对话)</span>
                            </label>
                            <input 
                              type="text"
                              value={editForm.speakingStyle || ''} 
                              onChange={e => setEditForm({...editForm, speakingStyle: e.target.value})}
                              className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none mb-2"
                              placeholder="如：傲慢、温柔、毒舌、神秘"
                            />
                            <div className="flex flex-wrap gap-1">
                              {SPEAKING_STYLE_OPTIONS.map(style => (
                                <button
                                  key={style}
                                  type="button"
                                  onClick={() => {
                                    const current = editForm.speakingStyle || '';
                                    const newStyle = current ? `${current}、${style}` : style;
                                    setEditForm({...editForm, speakingStyle: newStyle});
                                  }}
                                  className="text-xs px-2 py-1 bg-white border border-ink-200 rounded hover:border-primary hover:text-primary transition"
                                >
                                  {style}
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          {/* Motivation */}
                          <div>
                            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">
                              核心驱动力 * <span className="text-ink-400 font-normal">(必填，角色行动的根本动机)</span>
                            </label>
                            <textarea 
                              value={editForm.motivation || ''} 
                              onChange={e => setEditForm({...editForm, motivation: e.target.value})}
                              className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-20 resize-none"
                              placeholder="如：复仇、守护家人、追求力量、寻找真相"
                            />
                          </div>
                          
                          {/* Fears */}
                          <div>
                            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">弱点/恐惧</label>
                            <textarea 
                              value={editForm.fears || ''} 
                              onChange={e => setEditForm({...editForm, fears: e.target.value})}
                              className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-20 resize-none"
                              placeholder="如：害怕失去、恐高、无法面对过去"
                            />
                          </div>
                          
                          {/* Narrative Function */}
                          <div>
                            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">叙事功能</label>
                            <input 
                              type="text"
                              value={editForm.narrativeFunction || ''} 
                              onChange={e => setEditForm({...editForm, narrativeFunction: e.target.value})}
                              className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                              placeholder="如：推动剧情、制造冲突、提供信息、情感支撑"
                            />
                          </div>
                        </div>
                      </div>


                      {/* Core Settings Section */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                                <label className="block text-xs font-bold text-ink-500 uppercase mb-1">外貌描写</label>
                                <textarea 
                                    value={editForm.appearance || ''} 
                                    onChange={e => setEditForm({...editForm, appearance: e.target.value})}
                                    className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none h-32 resize-none"
                                    placeholder="身高、发色、穿着、distinctive features..."
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

                      {/* Dynamic Status Section */}
                      <div className="bg-ink-50 p-4 rounded-lg">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-bold text-ink-700 flex items-center gap-2">
                            <RefreshCw size={16} />
                            动态状态
                          </h4>
                          {editForm.id && characters.find(c => c.id === editForm.id) && (
                            <button
                              onClick={() => handleSyncStatus(editForm as Character)}
                              disabled={syncingCharacterId === editForm.id}
                              className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition flex items-center gap-1"
                            >
                              {syncingCharacterId === editForm.id ? (
                                <><Loader2 size={12} className="animate-spin" /> 分析中...</>
                              ) : (
                                <><RefreshCw size={12} /> 同步状态</>
                              )}
                            </button>
                          )}
                        </div>
                        
                        {/* Sync Suggestion Display */}
                        {syncSuggestion && (
                          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="text-sm font-bold text-yellow-700 mb-2">AI 建议更新：</div>
                            <div className="text-xs text-yellow-600 mb-2">{syncSuggestion.reasoning}</div>
                            <div className="space-y-1 text-xs">
                              {syncSuggestion.suggestedStatus && (
                                <div><span className="font-bold">状态:</span> {syncSuggestion.suggestedStatus}</div>
                              )}
                              {syncSuggestion.suggestedTags && (
                                <div><span className="font-bold">标签:</span> {syncSuggestion.suggestedTags.join(', ')}</div>
                              )}
                              {syncSuggestion.suggestedDescription && (
                                <div><span className="font-bold">简介:</span> {syncSuggestion.suggestedDescription}</div>
                              )}
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={applySyncSuggestion}
                                className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
                              >
                                <Check size={12} /> 应用建议
                              </button>
                              <button
                                onClick={() => setSyncSuggestion(null)}
                                className="text-xs px-3 py-1 bg-ink-200 text-ink-600 rounded hover:bg-ink-300"
                              >
                                忽略
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-ink-500 uppercase mb-1">当前状态</label>
                            <input 
                              type="text"
                              value={editForm.status || ''} 
                              onChange={e => setEditForm({...editForm, status: e.target.value})}
                              className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                              placeholder="如：健康、重伤、失踪、死亡"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-ink-500 uppercase mb-1 flex items-center gap-1">
                              是否活跃
                              <span className="text-ink-400 font-normal">(退场角色设为否)</span>
                            </label>
                            <select
                              value={editForm.isActive === false ? 'false' : 'true'}
                              onChange={e => setEditForm({...editForm, isActive: e.target.value === 'true'})}
                              className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                            >
                              <option value="true">是 - 活跃中</option>
                              <option value="false">否 - 已退场</option>
                            </select>
                          </div>
                        </div>
                        
                        {/* Tags */}
                        <div className="mt-4">
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-1 flex items-center gap-1">
                            <Tag size={12} />
                            标签
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input 
                              type="text"
                              value={tagInput}
                              onChange={e => setTagInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                              className="flex-1 p-2 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                              placeholder="输入标签后按回车添加"
                            />
                            <button
                              onClick={addTag}
                              className="px-3 py-2 bg-ink-200 text-ink-600 rounded-lg hover:bg-ink-300 transition"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(editForm.tags || []).map((tag, idx) => (
                              <span 
                                key={idx} 
                                className="text-xs bg-primary-light text-primary px-2 py-1 rounded-full flex items-center gap-1"
                              >
                                {tag}
                                <button 
                                  onClick={() => removeTag(tag)}
                                  className="hover:text-red-500"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>


                      {/* Relationship Editor with Attitude */}
                      <div>
                           <label className="block text-xs font-bold text-ink-500 uppercase mb-2">人际关系</label>
                           <div className="bg-ink-50 p-4 rounded-lg border border-ink-100 text-sm space-y-2">
                               {editForm.relationships && editForm.relationships.length > 0 ? (
                                   editForm.relationships.map((rel, idx) => (
                                       <div key={idx} className="flex items-center gap-2 flex-wrap bg-white p-2 rounded border border-ink-200">
                                            <span className="font-bold text-primary">{rel.targetName}</span>
                                            <span className="text-ink-400">关系:</span>
                                            <input
                                              type="text"
                                              value={rel.relation}
                                              onChange={e => {
                                                const newRels = [...(editForm.relationships || [])];
                                                newRels[idx] = { ...newRels[idx], relation: e.target.value };
                                                setEditForm({...editForm, relationships: newRels});
                                              }}
                                              className="bg-white border border-ink-200 px-2 py-0.5 rounded text-xs w-24"
                                            />
                                            <span className="text-ink-400">态度:</span>
                                            <input
                                              type="text"
                                              value={rel.attitude || ''}
                                              onChange={e => {
                                                const newRels = [...(editForm.relationships || [])];
                                                newRels[idx] = { ...newRels[idx], attitude: e.target.value };
                                                setEditForm({...editForm, relationships: newRels});
                                              }}
                                              className="bg-white border border-ink-200 px-2 py-0.5 rounded text-xs w-24"
                                              placeholder="如：敬重、厌恶"
                                            />
                                            <button 
                                                onClick={() => {
                                                    const newRels = editForm.relationships?.filter((_, i) => i !== idx);
                                                    setEditForm({...editForm, relationships: newRels});
                                                }}
                                                className="text-red-400 hover:text-red-600 ml-auto"
                                            >
                                                <X size={14} />
                                            </button>
                                       </div>
                                   ))
                               ) : (
                                   <p className="text-ink-400 italic">暂无记录关系。</p>
                               )}
                               
                               <div className="pt-2 border-t border-ink-200 mt-2 flex gap-2 flex-wrap">
                                   <select 
                                     className="text-xs p-1.5 border rounded text-ink-800"
                                     id="rel-target"
                                   >
                                       {characters.filter(c => c.id !== editForm.id).map(c => (
                                           <option key={c.id} value={`${c.id}|${c.name}`}>{c.name}</option>
                                       ))}
                                   </select>
                                   <input 
                                     type="text" 
                                     placeholder="关系 (如: 朋友)" 
                                     className="text-xs p-1.5 border rounded flex-1 min-w-[100px]"
                                     id="rel-desc"
                                   />
                                   <input 
                                     type="text" 
                                     placeholder="态度 (如: 信任)" 
                                     className="text-xs p-1.5 border rounded flex-1 min-w-[100px]"
                                     id="rel-attitude"
                                   />
                                   <button 
                                     onClick={() => {
                                         const select = document.getElementById('rel-target') as HTMLSelectElement;
                                         const input = document.getElementById('rel-desc') as HTMLInputElement;
                                         const attitudeInput = document.getElementById('rel-attitude') as HTMLInputElement;
                                         if(!select.value || !input.value) return;
                                         const [tid, tname] = select.value.split('|');
                                         const newRel = { 
                                           targetId: tid, 
                                           targetName: tname, 
                                           relation: input.value,
                                           attitude: attitudeInput.value || ''
                                         };
                                         setEditForm({
                                             ...editForm, 
                                             relationships: [...(editForm.relationships || []), newRel]
                                         });
                                         input.value = '';
                                         attitudeInput.value = '';
                                     }}
                                     className="text-xs bg-primary text-white px-3 py-1.5 rounded hover:bg-primary-hover"
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
