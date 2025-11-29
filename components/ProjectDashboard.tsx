
import React, { useEffect, useState } from 'react';
import { ProjectMetadata } from '../types';
import { db } from '../services/db';
import { Plus, BookOpen, Trash2, Clock, FileText, Loader2, Sparkles, AlertCircle } from 'lucide-react';

interface ProjectDashboardProps {
    onSelectProject: (id: string) => void;
    onCreateProject: () => void;
}

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ onSelectProject, onCreateProject }) => {
    const [projects, setProjects] = useState<ProjectMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const list = await db.listProjects();
            setProjects(list);
        } catch (e) {
            console.error("Failed to list projects", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProjects();
    }, []);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); 
        if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();

        if (window.confirm("确定要永久删除这个项目吗？此操作无法撤销。")) {
            setDeletingId(id);
            try {
                await db.deleteProject(id);
                // Directly remove from local state to reflect change immediately
                setProjects(prev => prev.filter(p => p.id !== id));
            } catch (error) {
                console.error("Delete failed:", error);
                alert("删除项目失败，请刷新页面重试。");
            } finally {
                setDeletingId(null);
            }
        }
    };

    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (loading && projects.length === 0) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-ink-50 text-ink-500">
                <Loader2 size={48} className="animate-spin text-primary mb-4" />
                <h2 className="text-xl font-bold">正在加载书架...</h2>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-ink-50 p-8 md:p-16 animate-fade-in overflow-y-auto">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
                    <div>
                        <h1 className="text-4xl font-bold text-ink-900 mb-2 flex items-center gap-3">
                            <BookOpen className="text-primary" size={40} />
                            InkFlow 书架
                        </h1>
                        <p className="text-ink-500 text-lg">
                            管理您的所有创作项目。
                        </p>
                    </div>
                    <button 
                        onClick={onCreateProject}
                        className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 flex items-center gap-2 transition transform hover:-translate-y-1"
                    >
                        <Plus size={24} />
                        <span>新建小说项目</span>
                    </button>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Create New Card (Visual) */}
                    <button 
                        onClick={onCreateProject}
                        className="group flex flex-col items-center justify-center h-64 border-2 border-dashed border-ink-200 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all text-ink-400 hover:text-primary cursor-pointer"
                    >
                        <div className="bg-white p-4 rounded-full shadow-sm group-hover:shadow-md mb-4 transition-transform group-hover:scale-110">
                            <Plus size={32} />
                        </div>
                        <span className="font-bold text-lg">创建一个新世界</span>
                    </button>

                    {/* Project Cards */}
                    {projects.map(p => (
                        <div 
                            key={p.id}
                            onClick={() => onSelectProject(p.id)}
                            className="bg-white rounded-2xl border border-ink-200 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all cursor-pointer flex flex-col h-64 group relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-primary to-primary-light opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            
                            <div className="p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <span className="px-2 py-1 bg-ink-100 text-ink-600 text-xs font-bold rounded uppercase tracking-wider">
                                        {p.genre || '未分类'}
                                    </span>
                                    <button 
                                        onClick={(e) => handleDelete(p.id, e)}
                                        disabled={deletingId === p.id}
                                        className="relative z-10 text-ink-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors disabled:opacity-50"
                                        title="删除项目"
                                    >
                                        {deletingId === p.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                    </button>
                                </div>
                                
                                <h3 className="text-xl font-bold text-ink-900 mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                                    {p.title}
                                </h3>
                                
                                <p className="text-sm text-ink-500 line-clamp-3 mb-4 flex-1">
                                    {p.previewText || "暂无简介..."}
                                </p>

                                <div className="flex items-center gap-4 text-xs text-ink-400 border-t border-ink-50 pt-4">
                                    <div className="flex items-center gap-1">
                                        <FileText size={14} />
                                        <span>{(p.wordCount / 10000).toFixed(2)}万字</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock size={14} />
                                        <span>{formatDate(p.lastModified)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {projects.length === 0 && !loading && (
                    <div className="text-center py-20 text-ink-400">
                        <Sparkles size={48} className="mx-auto mb-4 opacity-50" />
                        <p>还没有项目。点击“新建”开始您的第一部杰作吧！</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectDashboard;
