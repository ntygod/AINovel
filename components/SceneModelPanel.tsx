import React, { useState, useEffect } from 'react';
import { AIProvider, AISceneType, AIAllSceneType, SceneModelConfig, AppSettings } from '../types';
import { Server, Key, Globe, Cpu, CheckCircle, XCircle, Loader2, Copy, ChevronDown, ChevronUp } from 'lucide-react';

interface SceneModelPanelProps {
  scene: AIAllSceneType;
  sceneName: string;
  sceneDescription: string;
  sceneIcon: string;
  config: string | SceneModelConfig | undefined;
  defaultSettings: AppSettings;
  allSceneConfigs?: Record<AIAllSceneType, string | SceneModelConfig | undefined>;
  onChange: (config: string | SceneModelConfig | undefined) => void;
  onTest?: (config: SceneModelConfig) => Promise<boolean>;
  /** 是否为多模态场景（视频/语音），影响默认模型列表 */
  isMultimodal?: boolean;
}

const PROVIDERS: { id: AIProvider; name: string }[] = [
  { id: 'google', name: 'Google Gemini' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'custom', name: '自定义' },
];

const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  custom: 'http://localhost:11434/v1',
  google: ''
};

const DEFAULT_MODELS: Record<AIProvider, { id: string; name: string }[]> = {
  google: [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3' },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1' },
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

// 多模态模型 - 视频生成（按服务商分类）
const VIDEO_MODELS: Record<AIProvider, { id: string; name: string }[]> = {
  google: [
    { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast (推荐)' },
    { id: 'veo-3.1-generate-preview', name: 'Veo 3.1 High Quality' },
  ],
  openai: [
    { id: 'sora', name: 'Sora (视频生成)' },
  ],
  deepseek: [
    // DeepSeek 目前没有视频生成模型，显示提示
  ],
  custom: [
    { id: 'custom-video', name: '自定义视频模型' },
  ]
};

// 多模态模型 - 语音生成（按服务商分类）
const SPEECH_MODELS: Record<AIProvider, { id: string; name: string }[]> = {
  google: [
    { id: 'gemini-2.5-flash-preview-tts', name: 'Gemini 2.5 TTS (推荐)' },
    { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini Native Audio' },
  ],
  openai: [
    { id: 'tts-1', name: 'TTS-1 (标准)' },
    { id: 'tts-1-hd', name: 'TTS-1 HD (高清)' },
  ],
  deepseek: [
    // DeepSeek 目前没有 TTS 模型，显示提示
  ],
  custom: [
    { id: 'custom-tts', name: '自定义语音模型' },
  ]
};

/**
 * Helper to copy configuration from one scene to another
 * Requirements: 5.1, 5.2
 */
export function copySceneConfig(
  source: string | SceneModelConfig | undefined,
  defaultSettings: AppSettings
): SceneModelConfig | undefined {
  if (!source) {
    // Copy from default settings
    return {
      provider: defaultSettings.provider,
      apiKey: defaultSettings.apiKey,
      baseUrl: defaultSettings.baseUrl || '',
      model: defaultSettings.model
    };
  }
  
  if (typeof source === 'string') {
    // String config - use default provider with specified model
    return {
      provider: defaultSettings.provider,
      apiKey: defaultSettings.apiKey,
      baseUrl: defaultSettings.baseUrl || '',
      model: source
    };
  }
  
  // Full SceneModelConfig - deep copy
  return {
    provider: source.provider,
    apiKey: source.apiKey,
    baseUrl: source.baseUrl || '',
    model: source.model
  };
}

const SceneModelPanel: React.FC<SceneModelPanelProps> = ({
  scene,
  sceneName,
  sceneDescription,
  sceneIcon,
  config,
  defaultSettings,
  allSceneConfigs,
  onChange,
  onTest,
  isMultimodal = false
}) => {
  const [useDefault, setUseDefault] = useState<boolean>(!config);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string>('');
  const [showCopyMenu, setShowCopyMenu] = useState<boolean>(false);
  
  // Local state for full config editing
  const [localConfig, setLocalConfig] = useState<SceneModelConfig>(() => {
    if (!config) {
      return {
        provider: defaultSettings.provider,
        apiKey: defaultSettings.apiKey,
        baseUrl: defaultSettings.baseUrl || '',
        model: defaultSettings.model
      };
    }
    if (typeof config === 'string') {
      return {
        provider: defaultSettings.provider,
        apiKey: defaultSettings.apiKey,
        baseUrl: defaultSettings.baseUrl || '',
        model: config
      };
    }
    return { ...config, baseUrl: config.baseUrl || '' };
  });

  // Sync with external config changes
  useEffect(() => {
    setUseDefault(!config);
    if (!config) {
      setLocalConfig({
        provider: defaultSettings.provider,
        apiKey: defaultSettings.apiKey,
        baseUrl: defaultSettings.baseUrl || '',
        model: defaultSettings.model
      });
    } else if (typeof config === 'string') {
      setLocalConfig({
        provider: defaultSettings.provider,
        apiKey: defaultSettings.apiKey,
        baseUrl: defaultSettings.baseUrl || '',
        model: config
      });
    } else {
      setLocalConfig({ ...config, baseUrl: config.baseUrl || '' });
    }
  }, [config, defaultSettings]);

  const handleUseDefaultToggle = (checked: boolean) => {
    setUseDefault(checked);
    if (checked) {
      onChange(undefined);
    } else {
      // Switch to custom config, initialize with current defaults
      onChange(localConfig);
    }
  };

  const handleConfigChange = (field: keyof SceneModelConfig, value: string) => {
    const newConfig = { ...localConfig, [field]: value };
    
    // Auto-set base URL when provider changes
    if (field === 'provider') {
      const provider = value as AIProvider;
      newConfig.baseUrl = DEFAULT_BASE_URLS[provider] || '';
      const defaultModels = DEFAULT_MODELS[provider];
      if (defaultModels && defaultModels.length > 0) {
        newConfig.model = defaultModels[0].id;
      }
    }
    
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const handleTest = async () => {
    if (!onTest) return;
    
    setTestStatus('testing');
    setTestError('');
    
    try {
      const configToTest = useDefault ? {
        provider: defaultSettings.provider,
        apiKey: defaultSettings.apiKey,
        baseUrl: defaultSettings.baseUrl || '',
        model: defaultSettings.model
      } : localConfig;
      
      const success = await onTest(configToTest);
      setTestStatus(success ? 'success' : 'error');
      if (!success) {
        setTestError('测试失败，请检查配置');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestError(err.message || '测试失败');
    }
  };

  const handleCopyFrom = (sourceScene: AIAllSceneType | 'default') => {
    let sourceConfig: string | SceneModelConfig | undefined;
    
    if (sourceScene === 'default') {
      sourceConfig = undefined;
    } else if (allSceneConfigs) {
      sourceConfig = allSceneConfigs[sourceScene];
    }
    
    const copiedConfig = copySceneConfig(sourceConfig, defaultSettings);
    if (copiedConfig) {
      setLocalConfig(copiedConfig);
      setUseDefault(false);
      onChange(copiedConfig);
    }
    setShowCopyMenu(false);
  };

  // Determine display info
  const displayProvider = useDefault ? defaultSettings.provider : localConfig.provider;
  const displayModel = useDefault ? defaultSettings.model : localConfig.model;
  const isCustomProvider = !useDefault && localConfig.provider !== defaultSettings.provider;

  // 根据场景类型和服务商选择模型列表
  const getModelsForScene = () => {
    if (isMultimodal) {
      if (scene === 'video') return VIDEO_MODELS[localConfig.provider] || [];
      if (scene === 'speech') return SPEECH_MODELS[localConfig.provider] || [];
    }
    return DEFAULT_MODELS[localConfig.provider] || [];
  };
  const currentModels = getModelsForScene();
  
  // 检查当前服务商是否支持多模态
  const isMultimodalSupported = isMultimodal && currentModels.length > 0;

  return (
    <div className="border border-ink-200 rounded-lg overflow-hidden bg-white">
      {/* Header - Always visible */}
      <div 
        className="p-4 cursor-pointer hover:bg-ink-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{sceneIcon}</span>
            <div>
              <div className="font-medium text-ink-900 flex items-center gap-2">
                {sceneName}
                {isCustomProvider && (
                  <span className="text-xs px-2 py-0.5 bg-primary-light text-primary rounded-full">
                    {PROVIDERS.find(p => p.id === localConfig.provider)?.name}
                  </span>
                )}
              </div>
              <div className="text-xs text-ink-500">{sceneDescription}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className="text-sm text-ink-600">
              {useDefault ? (
                <span className="text-ink-400">使用默认</span>
              ) : (
                <span className="font-mono text-xs">{displayModel}</span>
              )}
            </div>
            
            {/* Test status icon */}
            {testStatus === 'success' && <CheckCircle size={16} className="text-green-500" />}
            {testStatus === 'error' && <XCircle size={16} className="text-red-500" />}
            
            {/* Expand/collapse icon */}
            {expanded ? <ChevronUp size={20} className="text-ink-400" /> : <ChevronDown size={20} className="text-ink-400" />}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-ink-200 p-4 space-y-4 bg-ink-50">
          {/* Use Default Toggle */}
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div>
              <div className="font-medium text-ink-900 text-sm">使用默认配置</div>
              <p className="text-xs text-ink-500">
                {useDefault 
                  ? `使用主模型设置 (${defaultSettings.model}) - 关闭此开关可配置独立服务商`
                  : `已启用独立配置 - 可选择不同服务商和模型`
                }
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useDefault}
                onChange={(e) => handleUseDefaultToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Custom config fields - only show when not using default */}
          {!useDefault && (
            <div className="space-y-4">
              {/* Provider selector */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">
                  <Server size={14} />
                  服务商
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleConfigChange('provider', p.id)}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        localConfig.provider === p.id
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-ink-200 hover:border-ink-300 bg-white'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">
                  <Key size={14} />
                  API Key
                </label>
                <input
                  type="password"
                  value={localConfig.apiKey}
                  onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                  placeholder="输入 API Key"
                  className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono text-sm"
                />
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">
                  <Globe size={14} />
                  Base URL
                </label>
                <input
                  type="text"
                  value={localConfig.baseUrl}
                  onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
                  placeholder={localConfig.provider === 'google' ? '默认留空，如使用代理请输入' : DEFAULT_BASE_URLS[localConfig.provider]}
                  className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono text-sm"
                />
              </div>

              {/* Model selector */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">
                  <Cpu size={14} />
                  模型
                </label>
                {/* 多模态服务商不支持提示 */}
                {isMultimodal && !isMultimodalSupported && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700 mb-2">
                    ⚠️ {PROVIDERS.find(p => p.id === localConfig.provider)?.name} 暂不支持{scene === 'video' ? '视频' : '语音'}生成，请选择其他服务商或输入自定义模型名称
                  </div>
                )}
                {currentModels.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={currentModels.find(m => m.id === localConfig.model) ? localConfig.model : 'custom'}
                      onChange={(e) => {
                        if (e.target.value !== 'custom') {
                          handleConfigChange('model', e.target.value);
                        }
                      }}
                      className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white text-sm"
                    >
                      {currentModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                      <option value="custom">自定义模型...</option>
                    </select>
                    {(!currentModels.find(m => m.id === localConfig.model)) && (
                      <input
                        type="text"
                        value={localConfig.model}
                        onChange={(e) => handleConfigChange('model', e.target.value)}
                        placeholder="输入自定义模型名称"
                        className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono text-sm"
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={localConfig.model}
                    onChange={(e) => handleConfigChange('model', e.target.value)}
                    placeholder="输入模型名称"
                    className="w-full p-2.5 border border-ink-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono text-sm"
                  />
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            {/* Copy from dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowCopyMenu(!showCopyMenu)}
                className="flex items-center gap-1 text-sm text-ink-600 hover:text-primary transition"
              >
                <Copy size={14} />
                复制配置
                <ChevronDown size={14} />
              </button>
              
              {showCopyMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-ink-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                  <button
                    onClick={() => handleCopyFrom('default')}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-ink-50 transition"
                  >
                    从默认配置
                  </button>
                  {(['creative', 'structure', 'writing', 'analysis', 'video', 'speech'] as AIAllSceneType[])
                    .filter(s => s !== scene)
                    .map(s => (
                      <button
                        key={s}
                        onClick={() => handleCopyFrom(s)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-ink-50 transition"
                      >
                        从 {s === 'creative' ? '创意生成' : s === 'structure' ? '结构化生成' : s === 'writing' ? '长文写作' : s === 'analysis' ? '分析任务' : s === 'video' ? '视频生成' : '语音生成'}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Test button */}
            {onTest && (
              <button
                onClick={handleTest}
                disabled={testStatus === 'testing'}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  testStatus === 'testing'
                    ? 'bg-ink-200 text-ink-400 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary-hover'
                }`}
              >
                {testStatus === 'testing' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    测试配置
                  </>
                )}
              </button>
            )}
          </div>

          {/* Test error message */}
          {testStatus === 'error' && testError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {testError}
            </div>
          )}

          {/* Test success message */}
          {testStatus === 'success' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              配置测试成功！
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SceneModelPanel;
