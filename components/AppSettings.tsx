
import React, { useState, useEffect } from 'react';
import { AppSettings, AIProvider } from '../types';
import { Settings, Key, Palette, Cpu, Save, AlertTriangle, CheckCircle, Server, Globe, Video, Volume2, BarChart3, TrendingUp, DollarSign, Trash2 } from 'lucide-react';
import { tokenCounter } from '../services/tokenCounter';

interface AppSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const THEMES = [
  { id: 'light', name: '极简白', bg: '#f8fafc', primary: '#4f46e5' },
  { id: 'sepia', name: '羊皮纸', bg: '#fdfbf7', primary: '#854d0e' },
  { id: 'dark', name: '暗夜黑', bg: '#1e293b', primary: '#818cf8' },
  { id: 'midnight', name: '深海蓝', bg: '#0f172a', primary: '#38bdf8' },
];

const PROVIDERS: { id: AIProvider; name: string }[] = [
  { id: 'google', name: 'Google Gemini' },
  { id: 'deepseek', name: 'DeepSeek (深度求索)' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'custom', name: '自定义 / Local (OpenAI 格式)' },
];

const DEFAULT_MODELS: Record<AIProvider, { id: string; name: string }[]> = {
  google: [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (推荐)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)' },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  ],
  custom: [
    { id: 'llama3', name: 'Llama 3' },
    { id: 'qwen-turbo', name: 'Qwen Turbo' },
  ]
};

const VIDEO_MODELS = [
    { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast (推荐)' },
    { id: 'veo-3.1-generate-preview', name: 'Veo 3.1 High Quality' }
];

const SPEECH_MODELS = [
    { id: 'gemini-2.5-flash-preview-tts', name: 'Gemini 2.5 TTS (推荐)' },
    { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini Native Audio' }
];

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  custom: 'http://localhost:11434/v1', // Ollama default
  google: ''
};

const AppSettingsView: React.FC<AppSettingsProps> = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [isDirty, setIsDirty] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [customModelInput, setCustomModelInput] = useState(false);
  
  // 🆕 Token 使用统计
  const [tokenStats, setTokenStats] = useState(tokenCounter.getStats());
  
  // 🆕 定期更新统计
  useEffect(() => {
    const interval = setInterval(() => {
      setTokenStats(tokenCounter.getStats());
    }, 5000); // 每 5 秒更新一次
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
    // Check if the current model is not in the default list for the provider, if so, enable custom input mode
    const defaults = DEFAULT_MODELS[settings.provider] || [];
    if (settings.model && !defaults.find(m => m.id === settings.model)) {
        setCustomModelInput(true);
    } else {
        setCustomModelInput(false);
    }
  }, [settings]);

  const handleChange = (field: keyof AppSettings, value: any) => {
    setLocalSettings(prev => {
        const next = { ...prev, [field]: value };
        // Auto-set base URL if provider changes and it wasn't customized
        if (field === 'provider') {
            next.baseUrl = DEFAULT_BASE_URLS[value as string] || '';
            const defaultModels = DEFAULT_MODELS[value as AIProvider];
            if (defaultModels && defaultModels.length > 0) {
                next.model = defaultModels[0].id;
                setCustomModelInput(false);
            } else {
                next.model = '';
                setCustomModelInput(true);
            }
        }
        setIsDirty(true);
        return next;
    });
  };

  const handleSave = () => {
      onSave(localSettings);
      setIsDirty(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
  };

  const currentModels = DEFAULT_MODELS[localSettings.provider] || [];

  return (
    <div className="max-w-3xl mx-auto p-8 animate-fade-in h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-ink-900 mb-2 flex items-center gap-2">
            <Settings className="text-primary" />
            应用设置
        </h2>
        <p className="text-ink-500">配置您的 AI 引擎与界面偏好。</p>
      </div>

      <div className="space-y-8">
        {/* AI Provider Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <div className="flex items-center gap-2 mb-4 text-ink-800">
                <Server size={20} />
                <h3 className="text-lg font-bold">AI 模型服务商</h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {PROVIDERS.map(p => (
                    <button
                        key={p.id}
                        onClick={() => handleChange('provider', p.id)}
                        className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                            localSettings.provider === p.id
                            ? 'border-primary bg-primary-light text-primary'
                            : 'border-ink-200 hover:border-ink-300 bg-white'
                        }`}
                    >
                        {p.name}
                    </button>
                ))}
            </div>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2">API Key</label>
                    <div className="relative">
                        <Key size={16} className="absolute left-3 top-3.5 text-ink-400" />
                        <input 
                            type="password"
                            value={localSettings.apiKey}
                            onChange={(e) => handleChange('apiKey', e.target.value)}
                            placeholder={`输入 ${PROVIDERS.find(p => p.id === localSettings.provider)?.name} API Key`}
                            className="w-full pl-10 p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2">Base URL (API 地址)</label>
                    <div className="relative">
                        <Globe size={16} className="absolute left-3 top-3.5 text-ink-400" />
                        <input 
                            type="text"
                            value={localSettings.baseUrl || ''}
                            onChange={(e) => handleChange('baseUrl', e.target.value)}
                            placeholder={localSettings.provider === 'google' ? "默认留空。如使用中转/代理请输入地址" : "https://api.example.com/v1"}
                            className="w-full pl-10 p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono text-sm"
                        />
                    </div>
                    <p className="text-xs text-ink-400 mt-1">
                        {localSettings.provider === 'google' 
                            ? "可选。如需通过中转服务访问 Gemini，请在此输入 API Base URL。" 
                            : "DeepSeek 默认: https://api.deepseek.com | Custom 默认: http://localhost:11434/v1"}
                    </p>
                </div>
            </div>
        </div>

        {/* Model Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
             <div className="flex items-center justify-between mb-4 text-ink-800">
                <div className="flex items-center gap-2">
                    <Cpu size={20} />
                    <h3 className="text-lg font-bold">主模型选择 (文本/推理)</h3>
                </div>
                <button 
                    onClick={() => setCustomModelInput(!customModelInput)}
                    className="text-xs text-primary hover:underline"
                >
                    {customModelInput ? '选择预设模型' : '自定义模型名称'}
                </button>
            </div>
            
            {customModelInput ? (
                <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2">自定义模型 ID</label>
                    <input 
                        type="text"
                        value={localSettings.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                        placeholder="例如: deepseek-r1, gpt-4-turbo, gemini-1.5-pro"
                        className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono text-sm"
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {currentModels.map(model => (
                        <label 
                            key={model.id}
                            className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                                localSettings.model === model.id 
                                ? 'border-primary bg-primary-light text-primary ring-1 ring-primary' 
                                : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50'
                            }`}
                        >
                            <input 
                                type="radio" 
                                name="model" 
                                value={model.id}
                                checked={localSettings.model === model.id}
                                onChange={() => handleChange('model', model.id)}
                                className="mr-3 w-4 h-4 text-primary focus:ring-primary"
                            />
                            <span className="font-medium">{model.name}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>

        {/* Multimodal Models (Video/Speech) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
             <div className="flex items-center gap-2 mb-4 text-ink-800">
                <Video size={20} />
                <h3 className="text-lg font-bold">多模态模型设置</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">
                        <Video size={16} /> 视频生成模型 (Video)
                    </label>
                    <select 
                        value={localSettings.videoModel || 'veo-3.1-fast-generate-preview'}
                        onChange={(e) => handleChange('videoModel', e.target.value)}
                        className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white font-mono text-sm"
                    >
                        {VIDEO_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">
                        <Volume2 size={16} /> 语音生成模型 (TTS)
                    </label>
                    <select 
                        value={localSettings.speechModel || 'gemini-2.5-flash-preview-tts'}
                        onChange={(e) => handleChange('speechModel', e.target.value)}
                        className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white font-mono text-sm"
                    >
                        {SPEECH_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>

        {/* 🆕 Token 使用统计 */}
        <div className="bg-gradient-to-br from-primary-light to-white p-6 rounded-xl shadow-sm border border-primary-light">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-ink-800">
                    <BarChart3 size={20} className="text-primary" />
                    <h3 className="text-lg font-bold">Token 使用统计</h3>
                </div>
                <button
                    onClick={() => {
                        if (confirm('确定要清除所有使用记录吗？')) {
                            tokenCounter.clearAll();
                            setTokenStats(tokenCounter.getStats());
                        }
                    }}
                    className="text-xs text-ink-500 hover:text-red-600 flex items-center gap-1 transition"
                >
                    <Trash2 size={14} />
                    清除记录
                </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-xs text-ink-500 mb-1 flex items-center gap-1">
                        <TrendingUp size={12} />
                        今日使用
                    </div>
                    <div className="text-2xl font-bold text-primary">
                        {tokenStats.todayUsage.toLocaleString()}
                    </div>
                    <div className="text-xs text-ink-400 mt-1">tokens</div>
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-xs text-ink-500 mb-1">总输入</div>
                    <div className="text-2xl font-bold text-ink-900">
                        {tokenStats.totalInput.toLocaleString()}
                    </div>
                    <div className="text-xs text-ink-400 mt-1">tokens</div>
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-xs text-ink-500 mb-1">总输出</div>
                    <div className="text-2xl font-bold text-ink-900">
                        {tokenStats.totalOutput.toLocaleString()}
                    </div>
                    <div className="text-xs text-ink-400 mt-1">tokens</div>
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-xs text-ink-500 mb-1 flex items-center gap-1">
                        <DollarSign size={12} />
                        预估成本
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                        ${tokenStats.totalCost.toFixed(2)}
                    </div>
                    <div className="text-xs text-ink-400 mt-1">{tokenStats.sessions} 次调用</div>
                </div>
            </div>
            
            {localSettings.tokenBudget?.enabled && (
                <div className="mt-4 p-3 bg-white rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-ink-600">今日预算使用</span>
                        <span className="text-sm font-medium text-ink-900">
                            {((tokenStats.todayUsage / (localSettings.tokenBudget.dailyLimit || 100000)) * 100).toFixed(1)}%
                        </span>
                    </div>
                    <div className="w-full bg-ink-200 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full transition-all ${
                                tokenStats.todayUsage > (localSettings.tokenBudget.dailyLimit || 100000)
                                    ? 'bg-red-500'
                                    : tokenStats.todayUsage > (localSettings.tokenBudget.dailyLimit || 100000) * (localSettings.tokenBudget.warningThreshold || 0.8)
                                    ? 'bg-yellow-500'
                                    : 'bg-primary'
                            }`}
                            style={{
                                width: `${Math.min(
                                    (tokenStats.todayUsage / (localSettings.tokenBudget.dailyLimit || 100000)) * 100,
                                    100
                                )}%`
                            }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-xs text-ink-500 mt-1">
                        <span>{tokenStats.todayUsage.toLocaleString()}</span>
                        <span>{(localSettings.tokenBudget.dailyLimit || 100000).toLocaleString()}</span>
                    </div>
                </div>
            )}
        </div>

        {/* 🆕 Token 预算与 RAG 设置 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
            <div className="flex items-center gap-2 mb-4 text-ink-800">
                <Cpu size={20} />
                <h3 className="text-lg font-bold">高级设置</h3>
            </div>
            
            <div className="space-y-6">
                {/* RAG 开关 */}
                <div className="flex items-center justify-between p-4 bg-ink-50 rounded-lg">
                    <div className="flex-1">
                        <div className="font-medium text-ink-900 mb-1">启用 RAG 检索增强</div>
                        <p className="text-sm text-ink-600">
                            使用语义检索自动查找相关章节和角色，提升生成质量（需要先索引内容）
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                            type="checkbox"
                            checked={localSettings.useRAG || false}
                            onChange={(e) => handleChange('useRAG', e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-ink-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                </div>

                {/* Token 预算控制 */}
                <div className="border-t border-ink-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex-1">
                            <div className="font-medium text-ink-900 mb-1">Token 预算控制</div>
                            <p className="text-sm text-ink-600">
                                限制每日 Token 使用量，避免意外产生高额费用
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                                type="checkbox"
                                checked={localSettings.tokenBudget?.enabled || false}
                                onChange={(e) => handleChange('tokenBudget', {
                                    ...localSettings.tokenBudget,
                                    enabled: e.target.checked
                                })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-ink-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    {localSettings.tokenBudget?.enabled && (
                        <div className="space-y-4 pl-4 border-l-2 border-primary-light">
                            <div>
                                <label className="block text-sm font-medium text-ink-700 mb-2">
                                    每日限制 (tokens)
                                </label>
                                <input
                                    type="number"
                                    value={localSettings.tokenBudget?.dailyLimit || 100000}
                                    onChange={(e) => handleChange('tokenBudget', {
                                        ...localSettings.tokenBudget,
                                        dailyLimit: parseInt(e.target.value) || 100000
                                    })}
                                    className="w-full p-3 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    min="1000"
                                    step="10000"
                                />
                                <p className="text-xs text-ink-500 mt-1">
                                    推荐：100,000 (约 $0.50/天)
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-ink-700 mb-2">
                                    警告阈值 (%)
                                </label>
                                <input
                                    type="range"
                                    value={(localSettings.tokenBudget?.warningThreshold || 0.8) * 100}
                                    onChange={(e) => handleChange('tokenBudget', {
                                        ...localSettings.tokenBudget,
                                        warningThreshold: parseInt(e.target.value) / 100
                                    })}
                                    className="w-full"
                                    min="50"
                                    max="95"
                                    step="5"
                                />
                                <div className="flex justify-between text-xs text-ink-500 mt-1">
                                    <span>50%</span>
                                    <span className="font-medium text-primary">
                                        {((localSettings.tokenBudget?.warningThreshold || 0.8) * 100).toFixed(0)}%
                                    </span>
                                    <span>95%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Theme Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
             <div className="flex items-center gap-2 mb-4 text-ink-800">
                <Palette size={20} />
                <h3 className="text-lg font-bold">主题配色</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {THEMES.map(theme => (
                    <button
                        key={theme.id}
                        onClick={() => handleChange('theme', theme.id)}
                        className={`group relative flex flex-col items-center p-4 rounded-xl border-2 transition-all ${
                            localSettings.theme === theme.id
                            ? 'border-primary bg-ink-50'
                            : 'border-transparent hover:bg-ink-50'
                        }`}
                    >
                        <div 
                            className="w-16 h-16 rounded-full shadow-sm mb-3 border border-ink-200 flex items-center justify-center"
                            style={{ backgroundColor: theme.bg }}
                        >
                            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                        </div>
                        <span className={`text-sm font-medium ${localSettings.theme === theme.id ? 'text-primary' : 'text-ink-600'}`}>
                            {theme.name}
                        </span>
                        
                        {localSettings.theme === theme.id && (
                            <div className="absolute top-2 right-2 text-primary">
                                <CheckCircle size={16} />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>

        {/* Action Bar */}
        <div className="flex justify-end pt-4 pb-20">
             <button
                onClick={handleSave}
                disabled={!isDirty}
                className={`flex items-center space-x-2 px-8 py-3 rounded-lg font-medium transition shadow-sm ${
                    isDirty || showSuccess
                    ? 'bg-primary hover:bg-primary-hover text-white' 
                    : 'bg-ink-200 text-ink-400 cursor-not-allowed'
                }`}
            >
                {showSuccess ? <CheckCircle size={20} /> : <Save size={20} />}
                <span>{showSuccess ? '设置已保存' : '保存设置'}</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default AppSettingsView;
