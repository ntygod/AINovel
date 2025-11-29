
import React, { useState, useRef, useEffect } from 'react';
import { NovelState, Chapter, AppSettings, VideoScene } from '../types';
import { generateScenePrompts, generateVideo, generateSpeech } from '../services/geminiService';
import { db } from '../services/db';
import { Video, Film, Music, Play, Pause, Download, Loader2, RefreshCw, Wand2, Volume2, Image as ImageIcon, Settings2 } from 'lucide-react';

interface VideoStudioProps {
  novelState: NovelState;
  settings: AppSettings;
}

const VIDEO_STYLES = [
    { id: 'Cinematic', label: 'Cinematic (电影质感)' },
    { id: 'Anime', label: 'Anime (日系动漫)' },
    { id: '3D Render', label: '3D Render (3D渲染)' },
    { id: 'Cyberpunk', label: 'Cyberpunk (赛博朋克)' },
    { id: 'Watercolor', label: 'Watercolor (水彩画)' },
    { id: 'Noir', label: 'Noir (黑色电影)' },
    { id: 'Fantasy Art', label: 'Fantasy Art (奇幻插画)' }
];

const VOICES = [
    { id: 'Kore', label: 'Kore (女声-温和)' },
    { id: 'Puck', label: 'Puck (男声-温和)' },
    { id: 'Charon', label: 'Charon (男声-深沉)' },
    { id: 'Fenrir', label: 'Fenrir (男声-激昂)' },
    { id: 'Zephyr', label: 'Zephyr (女声-柔和)' }
];

const VideoStudio: React.FC<VideoStudioProps> = ({ novelState, settings }) => {
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [chapterContent, setChapterContent] = useState('');
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [sceneStatus, setSceneStatus] = useState<'idle' | 'generating'>('idle');
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  
  // Generation Settings
  const [videoStyle, setVideoStyle] = useState<string>('Cinematic');
  const [audioVoice, setAudioVoice] = useState<string>('Kore');
  
  // Playing state
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
      const loadContent = async () => {
          if (selectedChapterId) {
              const content = await db.getChapterContent(selectedChapterId);
              setChapterContent(content);
          } else {
              setChapterContent('');
          }
      };
      loadContent();
  }, [selectedChapterId]);

  const checkAndSelectKey = async () => {
      // @ts-ignore
      const aistudio = window.aistudio;
      if (aistudio && aistudio.hasSelectedApiKey && aistudio.openSelectKey) {
          const hasKey = await aistudio.hasSelectedApiKey();
          if (!hasKey) {
              await aistudio.openSelectKey();
          }
      }
  };

  const handleGenerateScenes = async () => {
      if (!selectedChapterId || !chapterContent) return;
      if (!settings.apiKey) return alert("请配置 API Key");
      
      setSceneStatus('generating');
      try {
          // Pass plain text, removing html tags
          const text = chapterContent.replace(/<[^>]*>?/gm, '');
          const newScenes = await generateScenePrompts(text, settings);
          setScenes(newScenes.map(s => ({ ...s, chapterId: selectedChapterId })));
      } catch (e) {
          console.error(e);
          alert("分镜生成失败");
      } finally {
          setSceneStatus('idle');
      }
  };

  const handleGenerateVideo = async (sceneId: string) => {
      // Ensure key is selected for Veo
      await checkAndSelectKey();
      
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'generating_video' } : s));
      
      try {
          const scene = scenes.find(s => s.id === sceneId);
          if (!scene) return;
          
          const videoUrl = await generateVideo(scene, settings, videoStyle);
          if (videoUrl) {
              setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoUrl, status: 'idle' } : s));
          } else {
              throw new Error("Video generation returned null");
          }
      } catch (e: any) {
          console.error(e);
          
          // Handle Veo-specific "Requested entity was not found" error (needs re-auth)
          if (e.message && e.message.includes("Requested entity was not found")) {
               // @ts-ignore
               const aistudio = window.aistudio;
               if (aistudio && aistudio.openSelectKey) {
                   await aistudio.openSelectKey();
                   alert("检测到 API Key 权限问题，已重新打开选择框。请选择付费项目的 Key 后再次尝试生成。");
               } else {
                   alert("Video generation failed: 404 Entity Not Found. Please check your API Key project permissions.");
               }
          } else {
              alert("视频生成失败，请检查网络或 Key 配额。");
          }
          
          setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'error' } : s));
      }
  };

  const handleGenerateAudio = async (sceneId: string) => {
      if (!settings.apiKey) return alert("请配置 API Key");
      
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'generating_audio' } : s));
      
      try {
          const scene = scenes.find(s => s.id === sceneId);
          if (!scene) return;
          
          const audioUrl = await generateSpeech(scene.script, settings, audioVoice);
          if (audioUrl) {
              setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, audioUrl, status: 'idle' } : s));
          } else {
              throw new Error("Audio generation returned null");
          }
      } catch (e) {
          console.error(e);
          setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'error' } : s));
      }
  };

  const togglePlay = (scene: VideoScene) => {
      if (activeSceneId === scene.id && isPlaying) {
          videoRef.current?.pause();
          audioRef.current?.pause();
          setIsPlaying(false);
      } else {
          setActiveSceneId(scene.id);
          // Wait for DOM update
          setTimeout(() => {
              if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play();
              }
              if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play();
              }
              setIsPlaying(true);
          }, 100);
      }
  };

  return (
    <div className="h-full flex flex-col bg-paper overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-ink-200 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
            <Video className="text-primary" size={24} />
            <div>
                <h2 className="text-xl font-bold text-ink-900">AI 视频工坊</h2>
                <p className="text-xs text-ink-500">将小说片段转化为视听盛宴</p>
            </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
          {/* Left Panel: Chapter Selection & Settings */}
          <div className="w-80 border-r border-ink-200 bg-white flex flex-col p-4 overflow-y-auto">
              {/* Chapter Select */}
              <div className="mb-6">
                  <label className="text-sm font-bold text-ink-700 mb-2 block">选择章节</label>
                  <select 
                      className="w-full p-2 border border-ink-300 rounded-lg text-sm"
                      value={selectedChapterId}
                      onChange={(e) => setSelectedChapterId(e.target.value)}
                  >
                      <option value="">-- 请选择 --</option>
                      {novelState.chapters.map(c => (
                          <option key={c.id} value={c.id}>第{c.order}章: {c.title}</option>
                      ))}
                  </select>
              </div>

              {/* Settings Group */}
              <div className="mb-6 bg-ink-50 p-4 rounded-xl border border-ink-100">
                  <div className="flex items-center gap-2 mb-3 text-ink-800 border-b border-ink-200 pb-2">
                      <Settings2 size={16} />
                      <h3 className="font-bold text-sm">生成设置</h3>
                  </div>
                  
                  <div className="mb-4">
                      <label className="text-xs font-bold text-ink-500 uppercase mb-1 block">视频风格 (Veo)</label>
                      <select 
                          className="w-full p-2 border border-ink-300 rounded-lg text-sm bg-white"
                          value={videoStyle}
                          onChange={(e) => setVideoStyle(e.target.value)}
                      >
                          {VIDEO_STYLES.map(s => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                      </select>
                  </div>

                  <div>
                      <label className="text-xs font-bold text-ink-500 uppercase mb-1 block">配音音色 (TTS)</label>
                      <select 
                          className="w-full p-2 border border-ink-300 rounded-lg text-sm bg-white"
                          value={audioVoice}
                          onChange={(e) => setAudioVoice(e.target.value)}
                      >
                          {VOICES.map(v => (
                              <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                      </select>
                  </div>
              </div>

              {selectedChapterId && (
                  <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex flex-col items-center text-center">
                      <Film size={32} className="text-primary mb-2" />
                      <p className="text-xs text-ink-600 mb-4">
                          AI 将分析章节内容，提取关键场面并生成分镜脚本。
                      </p>
                      <button 
                          onClick={handleGenerateScenes}
                          disabled={sceneStatus === 'generating'}
                          className="w-full bg-primary text-white py-2 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-primary-hover disabled:opacity-50 transition shadow-sm"
                      >
                          {sceneStatus === 'generating' ? <Loader2 className="animate-spin" size={16}/> : <Wand2 size={16} />}
                          生成分镜
                      </button>
                  </div>
              )}
          </div>

          {/* Main Area: Scenes */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-ink-50">
              {scenes.length === 0 && (
                  <div className="h-full flex items-center justify-center text-ink-400 flex-col">
                      <Video size={64} className="mb-4 opacity-20" />
                      <p>暂无分镜。请先在左侧选择章节并生成。</p>
                  </div>
              )}

              {scenes.map((scene, idx) => (
                  <div key={scene.id} className="bg-white rounded-xl shadow-sm border border-ink-200 overflow-hidden flex flex-col md:flex-row">
                      {/* Visual Preview */}
                      <div className="w-full md:w-1/3 aspect-video bg-black relative flex items-center justify-center group">
                          {activeSceneId === scene.id ? (
                              <>
                                  {scene.videoUrl ? (
                                      <video 
                                        ref={activeSceneId === scene.id ? videoRef : null}
                                        src={scene.videoUrl} 
                                        className="w-full h-full object-cover" 
                                        loop 
                                        muted // Muted because we play audio separately
                                      />
                                  ) : (
                                      <div className="text-white/50 text-xs flex flex-col items-center">
                                          <ImageIcon size={24} className="mb-2" />
                                          无视频源
                                      </div>
                                  )}
                                  
                                  {scene.audioUrl && (
                                      <audio 
                                        ref={activeSceneId === scene.id ? audioRef : null}
                                        src={scene.audioUrl} 
                                      />
                                  )}
                              </>
                          ) : (
                              <div className="text-white/50 text-xs flex flex-col items-center">
                                  {scene.videoUrl ? <Video size={32} className="text-primary" /> : <ImageIcon size={24} className="mb-2" />}
                                  {scene.videoUrl ? "准备就绪" : "等待生成"}
                              </div>
                          )}

                          {/* Play Overlay */}
                          {(scene.videoUrl || scene.audioUrl) && (
                              <button 
                                  onClick={() => togglePlay(scene)}
                                  className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                  {isPlaying && activeSceneId === scene.id ? (
                                      <Pause className="text-white drop-shadow-lg" size={48} />
                                  ) : (
                                      <Play className="text-white drop-shadow-lg" size={48} />
                                  )}
                              </button>
                          )}
                      </div>

                      {/* Controls & Script */}
                      <div className="flex-1 p-6 flex flex-col">
                          <div className="flex justify-between items-start mb-4">
                              <h3 className="font-bold text-ink-800 text-lg">场景 {idx + 1}</h3>
                              <div className="flex gap-2">
                                  {scene.videoUrl && (
                                      <a href={scene.videoUrl} download={`scene-${idx+1}.mp4`} className="p-2 text-ink-400 hover:text-primary hover:bg-ink-50 rounded" title="下载视频">
                                          <Download size={18} />
                                      </a>
                                  )}
                                  {scene.audioUrl && (
                                      <a href={scene.audioUrl} download={`scene-${idx+1}.wav`} className="p-2 text-ink-400 hover:text-primary hover:bg-ink-50 rounded" title="下载音频">
                                          <Music size={18} />
                                      </a>
                                  )}
                              </div>
                          </div>

                          <div className="space-y-4 flex-1">
                              <div>
                                  <label className="text-xs font-bold text-ink-500 uppercase block mb-1">视觉提示词 (Prompt)</label>
                                  <p className="text-xs text-ink-600 bg-ink-50 p-2 rounded border border-ink-100 font-mono">
                                      {scene.prompt}
                                  </p>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-ink-500 uppercase block mb-1">配音脚本 (Script)</label>
                                  <p className="text-sm text-ink-800 italic">
                                      "{scene.script}"
                                  </p>
                              </div>
                          </div>

                          <div className="mt-6 flex gap-4 pt-4 border-t border-ink-100">
                              <button 
                                  onClick={() => handleGenerateVideo(scene.id)}
                                  disabled={scene.status === 'generating_video'}
                                  className="flex-1 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border border-indigo-100"
                              >
                                  {scene.status === 'generating_video' ? <Loader2 className="animate-spin" size={16} /> : <Film size={16} />}
                                  {scene.videoUrl ? '重新生成视频' : `生成视频 (${videoStyle})`}
                              </button>
                              
                              <button 
                                  onClick={() => handleGenerateAudio(scene.id)}
                                  disabled={scene.status === 'generating_audio'}
                                  className="flex-1 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border border-emerald-100"
                              >
                                  {scene.status === 'generating_audio' ? <Loader2 className="animate-spin" size={16} /> : <Volume2 size={16} />}
                                  {scene.audioUrl ? '重新生成配音' : `生成配音 (${audioVoice})`}
                              </button>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
};

export default VideoStudio;
