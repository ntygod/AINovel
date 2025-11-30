
import React, { useState, useRef } from 'react';
import { NovelState, PlotLoop } from '../types';
import { db } from '../services/db';
import { Download, FileJson, FileText, Save, Loader2, Upload } from 'lucide-react';

interface ExportPublishProps {
  novelState: NovelState;
  onImportProject?: (state: NovelState) => void;
}

const ExportPublish: React.FC<ExportPublishProps> = ({ novelState, onImportProject }) => {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalWords = novelState.chapters.reduce((acc, c) => acc + c.wordCount, 0);

  const getFullProject = async () => {
      setExporting(true);
      try {
          // Force fetch full content from DB
          const fullState = await db.loadFullProject(novelState.id);
          return fullState;
      } catch (e) {
          console.error("Export failed", e);
          alert("导出失败，无法读取完整数据。");
          return null;
      } finally {
          setExporting(false);
      }
  };

  const handleExportJson = async () => {
    const fullState = await getFullProject();
    if (!fullState) return;

    const dataStr = JSON.stringify(fullState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fullState.config.title || 'novel'}_backup.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportTxt = async () => {
    const fullState = await getFullProject();
    if (!fullState) return;

    let content = `书名：${fullState.config.title}\n`;
    content += `类型：${fullState.config.genre} - ${fullState.config.tags.join('/')}\n`;
    content += `总字数：${totalWords}\n\n`;
    content += `简介：${fullState.config.mainPlot}\n`;
    content += `主角设定：${fullState.config.protagonistArchetype} | 金手指：${fullState.config.goldenFinger}\n\n`;
    content += `=====================================\n\n`;

    fullState.chapters.forEach(chapter => {
      content += `第 ${chapter.order} 章：${chapter.title}\n`;
      content += `-------------------------------------\n`;
      content += `${chapter.content || '(本章暂无内容)'}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fullState.config.title || 'novel'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Handles importing a project from a JSON backup file.
   * Restores all data including plotLoops.
   * Requirements: 8.3, 8.4
   */
  const handleImportJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const importedState = JSON.parse(text) as NovelState;

      // Validate basic structure
      if (!importedState.config || !importedState.chapters) {
        throw new Error('无效的备份文件格式');
      }

      // Generate new ID to avoid conflicts with existing projects
      const newId = crypto.randomUUID();
      const restoredState: NovelState = {
        ...importedState,
        id: newId,
        lastModified: Date.now(),
        // Ensure volumes array exists (backward compatibility)
        volumes: importedState.volumes ?? [],
        // Ensure plotLoops array exists and restore it (Requirements 8.3, 8.4)
        plotLoops: (importedState.plotLoops ?? []).map((loop: PlotLoop) => ({
          ...loop,
          // Preserve all plot loop fields during import
        })),
      };

      // Save the imported project to IndexedDB
      await db.saveProject(restoredState);

      // Notify parent component about the import
      if (onImportProject) {
        onImportProject(restoredState);
      }

      alert(`项目 "${restoredState.config.title}" 导入成功！`);
    } catch (e) {
      console.error('Import failed:', e);
      alert(`导入失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-3xl mx-auto p-8 animate-fade-in">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-ink-900 mb-2">导出与发布</h2>
        <p className="text-ink-500">将您的作品带给世界。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
          <div className="flex items-center space-x-3 mb-4 text-indigo-600">
            <FileJson size={24} />
            <h3 className="text-lg font-bold">项目备份 (.json)</h3>
          </div>
          <p className="text-ink-600 mb-6 text-sm h-12">
            保存当前所有进度，包括设置、角色、大纲和正文。可用于日后恢复项目。
          </p>
          <button
            onClick={handleExportJson}
            disabled={exporting}
            className="w-full flex items-center justify-center space-x-2 bg-white border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-4 py-3 rounded-lg font-medium transition disabled:opacity-50"
          >
            {exporting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            <span>{exporting ? '正在打包数据...' : '下载备份文件'}</span>
          </button>
        </div>

        {/* Text Export Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
          <div className="flex items-center space-x-3 mb-4 text-emerald-600">
            <FileText size={24} />
            <h3 className="text-lg font-bold">小说稿件 (.txt)</h3>
          </div>
          <p className="text-ink-600 mb-6 text-sm h-12">
            导出纯文本格式的小说全集，自动从数据库提取所有章节并合并。
          </p>
          <button
            onClick={handleExportTxt}
            disabled={exporting}
            className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-lg font-medium transition shadow-sm disabled:opacity-50"
          >
            {exporting ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            <span>{exporting ? '正在合并章节...' : '导出全本小说'}</span>
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div className="mt-8">
        <h3 className="text-xl font-bold text-ink-900 mb-4">导入项目</h3>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-ink-200">
          <div className="flex items-center space-x-3 mb-4 text-amber-600">
            <Upload size={24} />
            <h3 className="text-lg font-bold">从备份恢复 (.json)</h3>
          </div>
          <p className="text-ink-600 mb-6 text-sm">
            从之前导出的 JSON 备份文件恢复项目，包括所有设置、角色、大纲、正文和伏笔数据。
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            onClick={triggerFileInput}
            disabled={importing}
            className="w-full flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-3 rounded-lg font-medium transition shadow-sm disabled:opacity-50"
          >
            {importing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            <span>{importing ? '正在导入...' : '选择备份文件'}</span>
          </button>
        </div>
      </div>
      
      <div className="mt-8 bg-ink-100 p-4 rounded-lg text-sm text-ink-500">
          <p>提示：导出操作会临时从数据库读取百万字内容，请耐心等待。导入会创建新项目，不会覆盖现有数据。</p>
      </div>
    </div>
  );
};

export default ExportPublish;
