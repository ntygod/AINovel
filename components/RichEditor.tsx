
import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote, Undo, Redo, Pilcrow, Type } from 'lucide-react';
import clsx from 'clsx';

interface RichEditorProps {
  content: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  className?: string;
  onSelectionChange?: (selection: { start: number; end: number; text: string } | null, position: {x:number, y:number} | null) => void;
  editable?: boolean;
}

const MenuButton = ({ onClick, isActive, icon: Icon, title }: any) => (
    <button
        onClick={onClick}
        className={clsx(
            "p-1.5 rounded hover:bg-ink-200 transition-colors text-ink-600",
            isActive && "bg-primary-light text-primary"
        )}
        title={title}
    >
        <Icon size={18} />
    </button>
);

const RichEditor: React.FC<RichEditorProps> = ({ 
    content, 
    onChange, 
    placeholder = "开始写作...", 
    className,
    onSelectionChange,
    editable = true
}) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder,
            }),
        ],
        content: content, // Initial content
        editable: editable,
        editorProps: {
            attributes: {
                class: 'prose prose-lg max-w-none focus:outline-none min-h-[60vh]',
            },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            const text = editor.getText();
            onChange(html, text);
        },
        onSelectionUpdate: ({ editor }) => {
            if (onSelectionChange) {
                const { from, to } = editor.state.selection;
                if (from !== to) {
                    const text = editor.state.doc.textBetween(from, to, ' ');
                    // Calculate simpler coordinates for floating menu anchor if needed
                    // TipTap has its own BubbleMenu, but keeping callback for parent logic integration
                    // We use getBoundingClientRect logic in parent if we need custom menus outside editor
                    onSelectionChange({ start: from, end: to, text }, null);
                } else {
                    onSelectionChange(null, null);
                }
            }
        }
    });

    // Sync content if it changes externally (e.g. switching chapters)
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            // Only update if content is significantly different to avoid cursor jumps
            // Ideally we check semantic difference, but this is a basic check.
            // Using commands.setContent preserves history better than raw replace sometimes
            if (Math.abs(editor.getText().length - content.replace(/<[^>]*>?/gm, '').length) > 5) {
               editor.commands.setContent(content);
            }
        }
    }, [content, editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className={clsx("flex flex-col h-full", className)}>
            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 border-b border-ink-100 bg-white sticky top-0 z-10 flex-wrap">
                <MenuButton 
                    onClick={() => editor.chain().focus().toggleBold().run()} 
                    isActive={editor.isActive('bold')} 
                    icon={Bold} 
                    title="加粗 (Ctrl+B)" 
                />
                <MenuButton 
                    onClick={() => editor.chain().focus().toggleItalic().run()} 
                    isActive={editor.isActive('italic')} 
                    icon={Italic} 
                    title="斜体 (Ctrl+I)" 
                />
                <div className="w-px h-4 bg-ink-200 mx-1" />
                <MenuButton 
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
                    isActive={editor.isActive('heading', { level: 1 })} 
                    icon={Heading1} 
                    title="一级标题" 
                />
                <MenuButton 
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
                    isActive={editor.isActive('heading', { level: 2 })} 
                    icon={Heading2} 
                    title="二级标题" 
                />
                 <MenuButton 
                    onClick={() => editor.chain().focus().setParagraph().run()} 
                    isActive={editor.isActive('paragraph')} 
                    icon={Pilcrow} 
                    title="正文" 
                />
                <div className="w-px h-4 bg-ink-200 mx-1" />
                <MenuButton 
                    onClick={() => editor.chain().focus().toggleBulletList().run()} 
                    isActive={editor.isActive('bulletList')} 
                    icon={List} 
                    title="无序列表" 
                />
                <MenuButton 
                    onClick={() => editor.chain().focus().toggleOrderedList().run()} 
                    isActive={editor.isActive('orderedList')} 
                    icon={ListOrdered} 
                    title="有序列表" 
                />
                <MenuButton 
                    onClick={() => editor.chain().focus().toggleBlockquote().run()} 
                    isActive={editor.isActive('blockquote')} 
                    icon={Quote} 
                    title="引用" 
                />
                <div className="w-px h-4 bg-ink-200 mx-1" />
                <MenuButton 
                    onClick={() => editor.chain().focus().undo().run()} 
                    isActive={false} 
                    icon={Undo} 
                    title="撤销 (Ctrl+Z)" 
                />
                <MenuButton 
                    onClick={() => editor.chain().focus().redo().run()} 
                    isActive={false} 
                    icon={Redo} 
                    title="重做 (Ctrl+Y)" 
                />
            </div>

            {/* Editor Area */}
            <EditorContent editor={editor} className="flex-1 p-8 overflow-y-auto outline-none" />
            
            {/* Native TipTap Bubble Menu for Quick Formatting */}
            {editor && (
                <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
                    <div className="bg-white shadow-xl border border-ink-200 rounded-lg flex p-1 gap-1">
                        <MenuButton 
                            onClick={() => editor.chain().focus().toggleBold().run()} 
                            isActive={editor.isActive('bold')} 
                            icon={Bold} 
                        />
                        <MenuButton 
                            onClick={() => editor.chain().focus().toggleItalic().run()} 
                            isActive={editor.isActive('italic')} 
                            icon={Italic} 
                        />
                        <MenuButton 
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
                            isActive={editor.isActive('heading', { level: 2 })} 
                            icon={Heading2} 
                        />
                    </div>
                </BubbleMenu>
            )}
        </div>
    );
};

export default RichEditor;
