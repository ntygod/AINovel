/**
 * QuickCharacterModal Component
 * 
 * A lightweight modal for quickly generating supporting characters
 * without leaving the editor. Integrates with archetypeService and
 * generateCharactersWithContext for context-aware character generation.
 * 
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6
 */

import React, { useState, useMemo } from 'react';
import { 
  Character, 
  CharacterArchetype, 
  NovelConfig, 
  WorldStructure, 
  AppSettings, 
  Volume, 
  Chapter,
  GenerationStatus
} from '../types';
import { generateCharactersWithContext, CharacterGenerationContext } from '../services/geminiService';
import { getArchetypes, getArchetypeById } from '../services/archetypeService';
import { X, Sparkles, Loader2, User, Check } from 'lucide-react';

interface QuickCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentChapter: Chapter;
  currentVolume?: Volume;
  characters: Character[];
  settings: AppSettings;
  config: NovelConfig;
  structure: WorldStructure;
  onCharacterCreated: (char: Character) => void;
}

const QuickCharacterModal: React.FC<QuickCharacterModalProps> = ({
  isOpen,
  onClose,
  currentChapter,
  currentVolume,
  characters,
  settings,
  config,
  structure,
  onCharacterCreated
}) => {
  // Form state
  const [description, setDescription] = useState('');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState('');
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [generatedCharacter, setGeneratedCharacter] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get archetypes list
  const archetypes = useMemo(() => getArchetypes(), []);

  // Reset form state
  const resetForm = () => {
    setDescription('');
    setSelectedArchetypeId('');
    setStatus(GenerationStatus.IDLE);
    setGeneratedCharacter(null);
    setError(null);
  };

  // Handle close
  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Handle generate
  const handleGenerate = async () => {
    if (!settings.apiKey) {
      setError('请先在应用设置中配置 API Key');
      return;
    }

    if (!description.trim() && !selectedArchetypeId) {
      setError('请输入角色描述或选择一个原型');
      return;
    }

    setStatus(GenerationStatus.THINKING);
    setError(null);
    setGeneratedCharacter(null);

    try {
      // Build generation context (Requirements 3.4, 3.5)
      const context: CharacterGenerationContext = {
        chapter: currentChapter,
        volume: currentVolume,
        additionalPrompt: description.trim() || undefined
      };

      // Add archetype if selected (Requirement 3.6)
      if (selectedArchetypeId) {
        context.archetype = getArchetypeById(selectedArchetypeId);
      }

      // Generate character with context
      const newChars = await generateCharactersWithContext(
        config,
        settings,
        characters,
        structure,
        context,
        1 // Generate only 1 character for quick generation
      );

      if (newChars && newChars.length > 0) {
        setGeneratedCharacter(newChars[0]);
        setStatus(GenerationStatus.COMPLETED);
      } else {
        setError('生成失败，请重试');
        setStatus(GenerationStatus.ERROR);
      }
    } catch (e) {
      console.error('Quick character generation failed:', e);
      setError(e instanceof Error ? e.message : '生成失败，请检查网络或 API 配置');
      setStatus(GenerationStatus.ERROR);
    }
  };

  // Handle confirm - add character to project
  const handleConfirm = () => {
    if (generatedCharacter) {
      onCharacterCreated(generatedCharacter);
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-ink-900 flex items-center gap-2">
            <User size={20} className="text-primary" />
            快速生成配角
          </h3>
          <button 
            onClick={handleClose} 
            className="text-ink-400 hover:text-ink-700 p-1 rounded hover:bg-ink-100 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Current context info */}
          <div className="bg-ink-50 rounded-lg p-3 text-xs text-ink-600">
            <span className="font-bold text-ink-700">当前章节: </span>
            {currentChapter.title}
            {currentVolume && (
              <span className="ml-2 text-ink-500">
                ({currentVolume.title})
              </span>
            )}
          </div>

          {/* Description input (Requirement 3.3) */}
          <div>
            <label className="block text-sm font-bold text-ink-700 mb-1.5">
              角色描述 <span className="text-ink-400 font-normal">(可选)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：一个神秘的老者，似乎知道主角的身世秘密..."
              className="w-full p-3 border border-ink-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
              rows={3}
              disabled={status === GenerationStatus.THINKING}
            />
          </div>

          {/* Archetype selector (Requirement 3.6) */}
          <div>
            <label className="block text-sm font-bold text-ink-700 mb-1.5">
              选择原型 <span className="text-ink-400 font-normal">(可选)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {archetypes.slice(0, 6).map(arch => (
                <button
                  key={arch.id}
                  onClick={() => setSelectedArchetypeId(
                    selectedArchetypeId === arch.id ? '' : arch.id
                  )}
                  disabled={status === GenerationStatus.THINKING}
                  className={`p-2 rounded-lg border text-xs transition flex flex-col items-center gap-1 ${
                    selectedArchetypeId === arch.id
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-ink-200 hover:border-ink-300 text-ink-600'
                  } disabled:opacity-50`}
                  title={arch.description}
                >
                  <span className="text-lg">{arch.icon}</span>
                  <span>{arch.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Generated character preview */}
          {generatedCharacter && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-emerald-600" />
                <span className="font-bold text-emerald-800">生成成功!</span>
              </div>
              <div className="text-sm space-y-1">
                <p><span className="font-bold text-ink-600">姓名:</span> {generatedCharacter.name}</p>
                <p><span className="font-bold text-ink-600">定位:</span> {generatedCharacter.role}</p>
                <p className="text-ink-600 italic line-clamp-2">"{generatedCharacter.description}"</p>
                {generatedCharacter.speakingStyle && (
                  <p><span className="font-bold text-ink-600">对话风格:</span> {generatedCharacter.speakingStyle}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-100 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-ink-600 hover:bg-ink-100 rounded-lg text-sm font-medium transition"
          >
            取消
          </button>
          
          {generatedCharacter ? (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              <Check size={16} />
              添加到角色列表
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={status === GenerationStatus.THINKING}
              className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:bg-ink-300 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              {status === GenerationStatus.THINKING ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  生成角色
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickCharacterModal;
