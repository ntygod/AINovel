
import React, { useState } from 'react';
import { WikiEntry, WikiCategory, WorldStructure, AppSettings, NovelConfig, Chapter, GenerationStatus } from '../types';
import { analyzeChapterForWiki } from '../services/geminiService';
import { db } from '../services/db';
import { BookMarked, Search, Plus, Filter, Edit2, Trash2, ScanSearch, Loader2, Save, X, CheckCircle } from 'lucide-react';

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

const WikiSystem: React.FC<WikiSystemProps> = ({ structure, setStructure, chapters, settings, config }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<WikiCategory | 'All'>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<WikiEntry>>({});
  
  // Auto-Scan State
  const [scanStatus, setScanStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [scanChapterId, setScanChapterId] = useState<string>('');
  const [scannedEntries, setScannedEntries] = useState<WikiEntry[]>([]);

  const entries = structure.wikiEntries || [];

  const filteredEntries = entries.filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            e.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'All' || e.category === filterCategory;
      return matchesSearch && matchesCategory;
  });

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
      setEditingId(null);
      setEditForm({});
  };

  const startNewEntry = () => {
      const id = crypto.randomUUID();
      setEditingId(id);
      setEditForm({
          id,
          name: '',
          category: 'Item',
          description: ''
      });
  };

  const deleteEntry = (id: string) => {
      if (window.confirm('确定删除此词条吗？')) {
          setStructure({
              ...structure,
              wikiEntries: entries.filter(e => e.id !== id)
          });
      }
  };

  const handleScan = async () => {
      if (!scanChapterId) return alert("请选择要扫描的章节");
      if (!settings.apiKey) return alert("请配置 API Key");
      
      setScanStatus(GenerationStatus.THINKING);
      try {
          // Fix: Fetch content from DB because memory state might be lean (empty content)
          let content = "";
          const targetChapter = chapters.find(c => c.id === scanChapterId);
          
          if (targetChapter && targetChapter.content && targetChapter.content.length > 50) {
              content = targetChapter.content;
          } else {
              content = await db.getChapterContent(scanChapterId);
          }

          if (!content || content.length < 50) {
              setScanStatus(GenerationStatus.IDLE);
              return alert("该章节内容过少，无法提取。");
          }

          const existingNames = entries.map(e => e.name);
          const results = await analyzeChapterForWiki(content, existingNames, settings, config);
          setScannedEntries(results);
          setScanStatus(GenerationStatus.COMPLETED);
      } catch (e) {
          console.error(e);
          setScanStatus(GenerationStatus.ERROR);
      }
  };

  const acceptScannedEntry = (entry: WikiEntry) => {
      setStructure({
          ...structure,
          wikiEntries: [...(structure.wikiEntries || []), entry]
      });
      setScannedEntries(scannedEntries.filter(e => e.id !== entry.id));
  };

  const rejectScannedEntry = (id: string) => {
      setScannedEntries(scannedEntries.filter(e => e.id !== id));
  };

  return (
    <div className="h-full flex flex-col p-8 bg-paper overflow-hidden">
      <div className="flex justify-between items-end mb-8 shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-ink-900 mb-2 flex items-center gap-2">
              <BookMarked className="text-primary" />
              百科全书
          </h2>
          <p className="text-ink-500">管理物品、技能与设定。写作时可自动检索。</p>
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
          {/* Main List Area */}
          <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-ink-200 overflow-hidden">
              {/* Filters */}
              <div className="p-4 border-b border-ink-100 flex gap-4 bg-ink-50">
                  <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 text-ink-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="搜索词条..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 p-2 border border-ink-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                  </div>
                  <div className="flex items-center gap-2">
                      <Filter size={18} className="text-ink-400" />
                      <select 
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value as any)}
                        className="p-2 border border-ink-300 rounded-lg text-sm outline-none bg-white"
                      >
                          <option value="All">全部分类</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select>
                  </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 content-start">
                  {filteredEntries.map(entry => (
                      <div key={entry.id} className="bg-white border border-ink-200 rounded-lg p-4 hover:shadow-md transition-shadow relative group">
                          <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-ink-800">{entry.name}</h4>
                              <span className={`text-[10px] px-2 py-0.5 rounded border ${CATEGORY_COLORS[entry.category]}`}>
                                  {CATEGORY_LABELS[entry.category]}
                              </span>
                          </div>
                          <p className="text-sm text-ink-600 line-clamp-3">{entry.description}</p>
                          
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 p-1 rounded-lg">
                              <button onClick={() => { setEditingId(entry.id); setEditForm(entry); }} className="p-1.5 text-ink-500 hover:text-primary"><Edit2 size={14} /></button>
                              <button onClick={() => deleteEntry(entry.id)} className="p-1.5 text-ink-500 hover:text-red-500"><Trash2 size={14} /></button>
                          </div>
                      </div>
                  ))}
                  
                  {filteredEntries.length === 0 && (
                      <div className="col-span-full py-10 text-center text-ink-400">
                          <p>未找到匹配词条。</p>
                      </div>
                  )}
              </div>
          </div>

          {/* Right Panel: Auto Scan & Actions */}
          <div className="w-80 flex flex-col gap-6 shrink-0">
               {/* Auto Scan Box */}
               <div className="bg-white rounded-xl shadow-sm border border-ink-200 p-4 flex flex-col h-[50%]">
                    <div className="flex items-center gap-2 mb-4 text-ink-800 border-b border-ink-100 pb-2">
                        <ScanSearch size={20} className="text-primary" />
                        <h3 className="font-bold">AI 智能提取</h3>
                    </div>
                    
                    {scanStatus === GenerationStatus.IDLE || scanStatus === GenerationStatus.ERROR ? (
                        <div className="space-y-4">
                            <p className="text-xs text-ink-500">
                                AI 将分析正文，自动识别新出场的物品、地点或人物，并建议存入百科。
                            </p>
                            <div>
                                <label className="text-xs font-bold text-ink-500 block mb-1">选择章节</label>
                                <select 
                                    className="w-full p-2 border border-ink-300 rounded-lg text-sm mb-2"
                                    value={scanChapterId}
                                    onChange={e => setScanChapterId(e.target.value)}
                                >
                                    <option value="">-- 请选择 --</option>
                                    {/* Fix: Use wordCount instead of content.length */}
                                    {chapters.filter(c => c.wordCount > 50).map(c => (
                                        <option key={c.id} value={c.id}>第{c.order}章: {c.title} ({c.wordCount}字)</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={handleScan}
                                    disabled={!scanChapterId}
                                    className="w-full bg-ink-800 text-white py-2 rounded-lg text-sm hover:bg-ink-900 disabled:opacity-50 disabled:cursor-not-allowed transition flex justify-center items-center gap-2"
                                >
                                    <ScanSearch size={16} /> 开始提取
                                </button>
                            </div>
                        </div>
                    ) : scanStatus === GenerationStatus.THINKING ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-ink-500">
                            <Loader2 size={32} className="animate-spin mb-2 text-primary" />
                            <p className="text-sm">正在读取并分析正文...</p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold">发现 {scannedEntries.length} 个新词条</span>
                                <button onClick={() => {setScanStatus(GenerationStatus.IDLE); setScannedEntries([]);}} className="text-xs text-ink-400 underline">重置</button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                {scannedEntries.length === 0 ? (
                                    <p className="text-xs text-ink-400 text-center mt-10">未发现明显的新专有名词。</p>
                                ) : (
                                    scannedEntries.map(entry => (
                                        <div key={entry.id} className="p-2 bg-ink-50 rounded border border-ink-200 text-sm">
                                            <div className="font-bold text-primary mb-1">{entry.name}</div>
                                            <div className="text-[10px] text-ink-500 mb-1 px-1 border rounded inline-block">{CATEGORY_LABELS[entry.category]}</div>
                                            <p className="text-xs text-ink-600 line-clamp-2 mb-2">{entry.description}</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => acceptScannedEntry(entry)} className="flex-1 bg-green-100 text-green-700 py-1 rounded hover:bg-green-200 text-xs flex justify-center"><CheckCircle size={14}/></button>
                                                <button onClick={() => rejectScannedEntry(entry.id)} className="flex-1 bg-red-100 text-red-700 py-1 rounded hover:bg-red-200 text-xs flex justify-center"><X size={14}/></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
               </div>

               {/* Stats / Info */}
               <div className="bg-ink-50 rounded-xl border border-ink-200 p-4 text-sm text-ink-600">
                   <p className="mb-2 font-bold text-ink-800">统计信息</p>
                   <ul className="space-y-1 text-xs">
                       <li className="flex justify-between"><span>总词条数:</span> <span>{entries.length}</span></li>
                       <li className="flex justify-between"><span>物品/法宝:</span> <span>{entries.filter(e => e.category === 'Item').length}</span></li>
                       <li className="flex justify-between"><span>功法/技能:</span> <span>{entries.filter(e => e.category === 'Skill').length}</span></li>
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
