
import React, { useState, useEffect, useRef } from 'react';
import { NovelConfig, AppSettings } from '../types';
import { generateProjectIdea } from '../services/geminiService';
import { Wand2, AlertCircle, Sparkles, Book, Target, Zap, Hash, ChevronDown, X, Trophy, Loader2, BrainCircuit } from 'lucide-react';

interface ProjectSetupProps {
  config: NovelConfig;
  onSave: (config: NovelConfig) => void;
  settings: AppSettings;
}

// Custom Editable Select Component
interface EditableSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  colorTheme?: string; // class prefix for ring color
}

const EditableSelect: React.FC<EditableSelectProps> = ({ 
    label, 
    value, 
    onChange, 
    options, 
    placeholder,
    colorTheme = 'indigo' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [forceShowAll, setForceShowAll] = useState(false); // Logic to force show all options
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setForceShowAll(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (val: string) => {
      onChange(val);
      setForceShowAll(false); // User is typing, filter naturally
      setIsOpen(true);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isOpen) {
          setIsOpen(false);
      } else {
          setForceShowAll(true); // Clicked arrow, specifically requests full list
          setIsOpen(true);
      }
  };

  const clearInput = (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setForceShowAll(true);
      setIsOpen(true);
  };

  // Determine what options to show:
  // 1. If forced (chevron click) OR value is empty -> Show ALL
  // 2. Otherwise -> Filter by text
  const optionsToShow = (forceShowAll || !value) 
    ? options 
    : options.filter(opt => opt.toLowerCase().includes(value.toLowerCase()));

  // Focus ring color mapping
  const ringColorClass = {
      indigo: 'focus:ring-indigo-500',
      amber: 'focus:ring-amber-500',
      emerald: 'focus:ring-emerald-500',
      purple: 'focus:ring-purple-500'
  }[colorTheme] || 'focus:ring-indigo-500';

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm font-medium text-ink-700 mb-2">{label}</label>
      <div className="relative group">
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onClick={() => {
              if (!isOpen) {
                  setForceShowAll(true); // Clicking input also suggests showing list
                  setIsOpen(true);
              }
          }}
          className={`w-full p-3 border border-ink-300 rounded-lg focus:ring-2 ${ringColorClass} outline-none bg-white pr-16 transition-all`}
          placeholder={placeholder}
        />
        
        <div className="absolute right-2 top-0 bottom-0 flex items-center space-x-1">
             {value && (
                <button 
                    onClick={clearInput}
                    className="p-1 text-ink-300 hover:text-red-500 hover:bg-ink-50 rounded-full transition-colors"
                    title="清除"
                >
                    <X size={14} />
                </button>
             )}
            <button 
                className="p-2 text-ink-400 cursor-pointer hover:text-ink-600 hover:bg-ink-50 rounded-md transition-colors"
                onClick={handleChevronClick}
            >
                <ChevronDown size={18} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-ink-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
           {optionsToShow.length > 0 ? (
               optionsToShow.map(opt => (
                <div 
                    key={opt}
                    className="p-3 hover:bg-ink-50 cursor-pointer text-sm text-ink-700 transition-colors border-b border-ink-50 last:border-0 flex justify-between items-center group"
                    onClick={() => {
                        onChange(opt);
                        setIsOpen(false);
                        setForceShowAll(false);
                    }}
                >
                    <span>{opt}</span>
                    {value === opt && <span className="text-xs text-primary font-medium">当前选择</span>}
                </div>
               ))
           ) : (
             <div className="p-3 text-sm text-ink-400 italic bg-ink-50">
                <p>未找到预设项。</p> 
                <p className="text-xs mt-1">您可以直接在输入框中继续编辑，创建新的"{value}"。</p>
             </div>
           )}
        </div>
      )}
    </div>
  );
};

const ProjectSetup: React.FC<ProjectSetupProps> = ({ config, onSave, settings }) => {
  const [localConfig, setLocalConfig] = useState<NovelConfig>(config);
  const [isDirty, setIsDirty] = useState(false);
  
  // AI Generation State
  const [showIdeaDialog, setShowIdeaDialog] = useState(false);
  const [ideaInput, setIdeaInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
      // Basic deep check
      if (JSON.stringify(localConfig) !== JSON.stringify(config)) {
          setIsDirty(true);
      }
  }, [localConfig, config]);

  const handleChange = (field: keyof NovelConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
  };

  const toggleTag = (tag: string) => {
    const currentTags = localConfig.tags || [];
    if (currentTags.includes(tag)) {
        handleChange('tags', currentTags.filter(t => t !== tag));
    } else {
        if (currentTags.length >= 5) return; // Max 5 tags
        handleChange('tags', [...currentTags, tag]);
    }
  };

  const handleSave = () => {
      onSave(localConfig);
      setIsDirty(false);
  };

  const handleAIGenerate = async () => {
      if (!settings.apiKey) {
          alert("请先在应用设置中配置 API Key。");
          return;
      }
      setIsGenerating(true);
      try {
          const generatedConfig = await generateProjectIdea(ideaInput, settings);
          setLocalConfig(prev => ({
              ...prev,
              ...generatedConfig,
              // Ensure we don't accidentally overwrite with undefined
              title: generatedConfig.title || prev.title,
              genre: generatedConfig.genre || prev.genre,
              worldSetting: generatedConfig.worldSetting || prev.worldSetting,
              protagonistArchetype: generatedConfig.protagonistArchetype || prev.protagonistArchetype,
              goldenFinger: generatedConfig.goldenFinger || prev.goldenFinger,
              mainPlot: generatedConfig.mainPlot || prev.mainPlot,
              pacing: generatedConfig.pacing || prev.pacing,
              narrativeTone: generatedConfig.narrativeTone || prev.narrativeTone,
              tags: generatedConfig.tags || prev.tags
          }));
          setShowIdeaDialog(false);
      } catch (e: any) {
          console.error(e);
          const msg = e.message || e.toString();
          if (msg.includes('429')) {
              alert("AI 生成失败：配额不足 (429)。请检查您的 API Key 额度。");
          } else if (msg.includes('401') || msg.includes('403')) {
              alert("AI 生成失败：API Key 无效或权限不足 (403)。\n如果使用的是 Gemini 3.0 Pro，请确保项目已启用计费。");
          } else if (msg.includes('400')) {
              alert(`AI 生成失败 (400)：请求参数错误。\n可能不支持当前模型的某些配置。请尝试切换回 Gemini 2.5 Flash。`);
          } else {
              alert(`AI 生成失败: ${msg}\n如果是网络连接问题，请在应用设置中配置 Base URL (代理地址)。`);
          }
      } finally {
          setIsGenerating(false);
      }
  };

  // Preset Data
  const GENRES = ["东方玄幻", "仙侠修真", "都市异能", "科幻未来", "游戏竞技", "历史穿越", "悬疑惊悚", "西方奇幻", "末世求生", "诸天无限"];
  const ARCHETYPES = ["穿越者", "重生者", "废柴逆袭", "天之骄子", "幕后黑手", "稳健苟道", "系统宿主", "土著天才", "退役兵王", "女帝转世"];
  const PACING_OPTIONS = ["极速爽文 (开局即无敌，一路碾压)", "快节奏 (冲突密集，升级快)", "正剧风 (逻辑严密，起伏合理)", "慢热种田 (注重经营与日常)", "群像剧 (多视角，宏大叙事)"];
  const TONE_OPTIONS = ["热血", "轻松/搞笑", "黑暗/压抑", "智斗/烧脑", "治愈/温馨", "杀伐果断"];
  const SUGGESTED_TAGS = ["系统", "无敌流", "扮猪吃虎", "单女主", "无女主", "后宫", "迪化", "克苏鲁", "无限流", "灵气复苏", "赛博朋克"];

  return (
    <div className="max-w-4xl mx-auto p-8 animate-fade-in pb-20 overflow-y-auto h-full">
      <div className="mb-8 flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-ink-900 mb-2">小说构建向导</h2>
            <p className="text-ink-500">像网文大神一样思考。选择预设流派，或者直接输入您的独家创意。</p>
        </div>
        <button 
            onClick={() => setShowIdeaDialog(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-2.5 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all font-medium text-sm"
        >
            <BrainCircuit size={18} />
            AI 灵感生成
        </button>
      </div>

      <div className="space-y-8">
        
        {/* Section 1: Basic & World */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <div className="flex items-center gap-2 mb-4 text-indigo-700">
                <Book size={20} />
                <h3 className="text-lg font-bold">1. 题材与世界</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2">书名</label>
                    <input
                        type="text"
                        value={localConfig.title}
                        onChange={(e) => handleChange('title', e.target.value)}
                        className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="例如：我有一座冒险屋"
                    />
                </div>
                <div>
                    <EditableSelect 
                        label="大流派 (可自定义)"
                        value={localConfig.genre}
                        onChange={(val) => handleChange('genre', val)}
                        options={GENRES}
                        placeholder="选择或输入流派..."
                        colorTheme="indigo"
                    />
                </div>
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium text-ink-700 mb-2">具体背景设定 (One Sentence)</label>
                <input
                    type="text"
                    value={localConfig.worldSetting}
                    onChange={(e) => handleChange('worldSetting', e.target.value)}
                    className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="例如：灵气复苏的高中校园，或者妖魔横行的古代王朝..."
                />
            </div>
        </div>

        {/* Section 2: Protagonist & Cheat (The Core) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
                <Sparkles size={120} />
            </div>
            <div className="flex items-center gap-2 mb-4 text-amber-600">
                <Sparkles size={20} />
                <h3 className="text-lg font-bold">2. 主角与金手指 (核心爽点)</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div>
                    <EditableSelect 
                        label="主角出身/身份 (可自定义)"
                        value={localConfig.protagonistArchetype}
                        onChange={(val) => handleChange('protagonistArchetype', val)}
                        options={ARCHETYPES}
                        placeholder="选择或输入主角类型..."
                        colorTheme="amber"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2">金手指/外挂 (最重要的设定!)</label>
                    <input
                        type="text"
                        value={localConfig.goldenFinger}
                        onChange={(e) => handleChange('goldenFinger', e.target.value)}
                        className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                        placeholder="例如：深蓝加点系统，能够看到回报率的眼睛..."
                    />
                </div>
            </div>
             <p className="text-xs text-ink-400">提示：如果主角没有外挂，请填“无（凭借智商/毅力）”</p>
        </div>

        {/* Section 3: Plot & Style */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <div className="flex items-center gap-2 mb-4 text-emerald-700">
                <Target size={20} />
                <h3 className="text-lg font-bold">3. 剧情与节奏</h3>
            </div>

            <div className="mb-4">
                 <label className="block text-sm font-medium text-ink-700 mb-2">主线目标 (一句话故事)</label>
                 <textarea
                    value={localConfig.mainPlot}
                    onChange={(e) => handleChange('mainPlot', e.target.value)}
                    className="w-full p-3 border border-ink-300 rounded-lg h-24 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    placeholder="主角想要做什么？例如：利用系统在末世建立最强基地，探寻世界毁灭的真相。"
                 />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <EditableSelect 
                        label="节奏风格 (可自定义)"
                        value={localConfig.pacing}
                        onChange={(val) => handleChange('pacing', val)}
                        options={PACING_OPTIONS}
                        placeholder="选择或输入节奏..."
                        colorTheme="emerald"
                    />
                </div>
                <div>
                    <EditableSelect 
                        label="叙事基调 (可自定义)"
                        value={localConfig.narrativeTone}
                        onChange={(val) => handleChange('narrativeTone', val)}
                        options={TONE_OPTIONS}
                        placeholder="选择或输入基调..."
                        colorTheme="emerald"
                    />
                </div>
            </div>
        </div>

        {/* Section 4: Goals & Tags */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
             <div className="flex items-center gap-2 mb-4 text-purple-700">
                <Trophy size={20} />
                <h3 className="text-lg font-bold">4. 目标与标签</h3>
            </div>

            <div className="mb-6">
                <label className="block text-sm font-medium text-ink-700 mb-2">每日码字目标 (字)</label>
                <input
                    type="number"
                    step="500"
                    value={localConfig.dailyTarget || 3000}
                    onChange={(e) => handleChange('dailyTarget', parseInt(e.target.value))}
                    className="w-full md:w-1/3 p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="3000"
                />
                <p className="text-xs text-ink-400 mt-1">设置一个合理的目标，让系统帮助您追踪进度。</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {SUGGESTED_TAGS.map(tag => (
                    <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                            (localConfig.tags || []).includes(tag)
                            ? 'bg-purple-100 border-purple-300 text-purple-800 font-medium'
                            : 'bg-white border-ink-200 text-ink-500 hover:border-purple-200 hover:text-purple-600'
                        }`}
                    >
                        {tag}
                    </button>
                ))}
                {/* Custom Tag Input */}
                <div className="flex items-center ml-2 border-l border-ink-200 pl-4">
                    <input 
                        type="text" 
                        placeholder="添加自定义标签..."
                        className="px-2 py-1 text-sm border-b border-ink-300 focus:border-purple-500 outline-none bg-transparent w-32"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const val = e.currentTarget.value.trim();
                                if (val) {
                                    toggleTag(val);
                                    e.currentTarget.value = '';
                                }
                            }
                        }}
                    />
                </div>
            </div>
             <p className="text-xs text-ink-400 mt-2">已选: {(localConfig.tags || []).join(', ')}</p>
        </div>

        {/* Save Bar */}
        <div className="sticky bottom-0 bg-paper/90 backdrop-blur py-4 flex justify-end">
            <button
                onClick={handleSave}
                className={`flex items-center space-x-2 px-8 py-3 rounded-lg font-bold text-lg transition shadow-lg ${
                    isDirty 
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white transform hover:-translate-y-1' 
                    : 'bg-ink-200 text-ink-400 cursor-default'
                }`}
            >
                <Zap size={20} className={isDirty ? "fill-current" : ""} />
                <span>{isDirty ? '生成设定配置' : '设定已保存'}</span>
            </button>
        </div>
      </div>

      {/* AI Brainstorm Modal */}
      {showIdeaDialog && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in flex flex-col">
                  <div className="p-6 border-b border-ink-100 bg-gradient-to-r from-violet-50 to-indigo-50">
                      <div className="flex justify-between items-start">
                          <div>
                              <h3 className="font-bold text-lg text-ink-900 flex items-center gap-2">
                                  <BrainCircuit className="text-violet-600" size={20} />
                                  AI 灵感生成器
                              </h3>
                              <p className="text-xs text-ink-500 mt-1">输入简单的想法，让 AI 帮您完善所有设定。</p>
                          </div>
                          <button 
                             onClick={() => setShowIdeaDialog(false)} 
                             className="text-ink-400 hover:text-ink-700 hover:bg-white/50 rounded-full p-1 transition"
                          >
                              <X size={20} />
                          </button>
                      </div>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-ink-500 uppercase mb-2">您的创意核心 (选填)</label>
                          <textarea 
                              value={ideaInput}
                              onChange={(e) => setIdeaInput(e.target.value)}
                              className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none h-28 resize-none text-sm"
                              placeholder="例如：赛博朋克背景下的修仙故事，主角是一个黑客..."
                          />
                          <p className="text-xs text-ink-400 mt-2">
                              {ideaInput.length === 0 
                                ? "💡 留空则 AI 会随机生成一个当前流行的爆款题材。" 
                                : "💡 AI 将围绕您的想法扩展书名、主角、金手指和大纲。"
                              }
                          </p>
                      </div>
                  </div>

                  <div className="px-6 py-4 border-t border-ink-100 flex justify-end gap-3 bg-ink-50">
                      <button 
                        onClick={() => setShowIdeaDialog(false)}
                        className="px-4 py-2 text-ink-600 hover:bg-ink-200 rounded-lg transition text-sm"
                        disabled={isGenerating}
                      >
                          取消
                      </button>
                      <button 
                        onClick={handleAIGenerate}
                        disabled={isGenerating}
                        className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-sm flex items-center gap-2 transition text-sm font-medium disabled:opacity-70"
                      >
                          {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                          <span>{isGenerating ? '正在构思中...' : (ideaInput ? '基于想法生成' : '随机生成创意')}</span>
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ProjectSetup;
