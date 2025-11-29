
import React, { useState, useRef, useEffect } from 'react';
import { NovelState, AppSettings } from '../types';
import { streamProjectChat } from '../services/geminiService';
import { MessageSquare, Send, Loader2, Trash2, Bot, User } from 'lucide-react';

interface AIChatProps {
  novelState: NovelState;
  settings: AppSettings;
}

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
}

const AIChat: React.FC<AIChatProps> = ({ novelState, settings }) => {
  const [messages, setMessages] = useState<Message[]>([
      { 
          id: 'intro', 
          role: 'model', 
          text: `你好！我是《${novelState.config.title}》的首席 AI 顾问。我已经阅读了您的世界观、角色设定和目前的大纲。有什么剧情上的难题，或者需要头脑风暴的地方吗？` 
      }
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
  }, [messages]);

  const handleSend = async () => {
      if (!input.trim() || !settings.apiKey || isStreaming) return;

      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: input };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsStreaming(true);

      try {
          // Prepare history for API (exclude intro or non-essential logic if needed, but here we pass all)
          const historyForApi = messages.map(m => ({ role: m.role, text: m.text }));
          
          const stream = await streamProjectChat(
              historyForApi, 
              userMsg.text, 
              novelState.config, 
              novelState.characters, 
              novelState.structure, 
              novelState.chapters, 
              settings
          );

          let fullResponse = "";
          const responseId = crypto.randomUUID();
          
          // Optimistically add response message container
          setMessages(prev => [...prev, { id: responseId, role: 'model', text: '' }]);

          for await (const chunk of stream) {
              if (chunk.text) {
                  fullResponse += chunk.text;
                  setMessages(prev => prev.map(m => 
                      m.id === responseId ? { ...m, text: fullResponse } : m
                  ));
              }
          }
      } catch (e) {
          console.error(e);
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: "❌ 连接中断，请检查 API Key 或网络设置。" }]);
      } finally {
          setIsStreaming(false);
      }
  };

  const clearChat = () => {
      if(window.confirm("确定清空聊天记录吗？")) {
        setMessages([{ 
            id: crypto.randomUUID(), 
            role: 'model', 
            text: "记忆已重置。我们重新开始吧。" 
        }]);
      }
  };

  return (
    <div className="h-full flex flex-col bg-paper relative">
      {/* Header */}
      <div className="h-16 border-b border-ink-200 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
            <MessageSquare className="text-primary" size={24} />
            <div>
                <h2 className="text-xl font-bold text-ink-900">AI 首席顾问</h2>
            </div>
        </div>
        <button 
            onClick={clearChat}
            className="p-2 text-ink-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
            title="清空会话"
        >
            <Trash2 size={18} />
        </button>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
          {messages.map(msg => (
              <div 
                key={msg.id} 
                className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                      msg.role === 'model' ? 'bg-primary text-white' : 'bg-white border border-ink-200 text-ink-600'
                  }`}>
                      {msg.role === 'model' ? <Bot size={20} /> : <User size={20} />}
                  </div>

                  {/* Bubble */}
                  <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed max-w-[80%] ${
                      msg.role === 'model' 
                      ? 'bg-white border border-ink-200 text-ink-800 rounded-tl-none' 
                      : 'bg-primary text-white rounded-tr-none'
                  }`}>
                      <div className="whitespace-pre-wrap">{msg.text || <span className="flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> 思考中...</span>}</div>
                  </div>
              </div>
          ))}
          <div className="h-4"></div>
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-ink-200">
          <div className="max-w-4xl mx-auto relative">
              <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                      if(e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                      }
                  }}
                  placeholder="询问剧情建议、逻辑检查或创意灵感..."
                  className="w-full p-4 pr-14 border border-ink-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-ink-50/50 resize-none h-24 shadow-inner"
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="absolute right-3 bottom-3 p-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:bg-ink-300 disabled:cursor-not-allowed transition shadow-md"
              >
                  {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
          </div>
          <p className="text-center text-xs text-ink-400 mt-2">
              AI 已读取全书设定，可进行深度剧情探讨。
          </p>
      </div>
    </div>
  );
};

export default AIChat;
