"use client";

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { useCallback, useEffect, forwardRef, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";
import { EditorToolbar } from "./editor-toolbar";
import { createMentionExtension } from "./extensions/mention-extension";
import { createSlashCommandExtension } from "./extensions/slash-command-extension";

export interface RichTextEditorProps {
  content: string;
  onChange?: (content: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  editable?: boolean;
  workspaceId?: string;
  projectId?: string;
  className?: string;
  minHeight?: string;
  showToolbar?: boolean;
  autofocus?: boolean;
}

export interface RichTextEditorRef {
  getHTML: () => string;
  getText: () => string;
  setContent: (content: string) => void;
  focus: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  (
    {
      content,
      onChange,
      onBlur,
      placeholder = "Add a description...",
      editable = true,
      workspaceId,
      projectId,
      className,
      minHeight = "120px",
      showToolbar = true,
      autofocus = false,
    },
    ref
  ) => {
    const isFocusedRef = useRef(false);
    const lastContentRef = useRef(content);
    
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
          codeBlock: {
            HTMLAttributes: {
              class: "bg-muted rounded-md p-4 font-mono text-sm",
            },
          },
          bulletList: {
            HTMLAttributes: {
              class: "list-disc pl-6",
            },
          },
          orderedList: {
            HTMLAttributes: {
              class: "list-decimal pl-6",
            },
          },
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-primary underline cursor-pointer hover:text-primary/80",
          },
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass: "is-editor-empty",
        }),
        Highlight.configure({
          multicolor: true,
        }),
        TextStyle,
        Color,
        Table.configure({
          resizable: true,
          HTMLAttributes: {
            class: "border-collapse table-auto w-full",
          },
        }),
        TableRow,
        TableHeader.configure({
          HTMLAttributes: {
            class: "border border-border bg-muted font-bold p-2 text-left",
          },
        }),
        TableCell.configure({
          HTMLAttributes: {
            class: "border border-border p-2",
          },
        }),
        TaskList.configure({
          HTMLAttributes: {
            class: "not-prose",
          },
        }),
        TaskItem.configure({
          nested: true,
          HTMLAttributes: {
            class: "flex items-start gap-2",
          },
        }),
        ...(workspaceId ? [createMentionExtension(workspaceId)] : []),
        ...(workspaceId && projectId
          ? [createSlashCommandExtension(workspaceId, projectId)]
          : []),
      ],
      content,
      editable,
      autofocus,
      immediatelyRender: false, // Prevent SSR hydration mismatch
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
            "prose-headings:font-semibold prose-headings:text-foreground",
            "prose-p:text-foreground prose-p:leading-relaxed",
            "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
            "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
            "prose-pre:bg-muted prose-pre:rounded-lg",
            "[&_.is-editor-empty]:before:content-[attr(data-placeholder)] [&_.is-editor-empty]:before:text-muted-foreground [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:h-0"
          ),
        },
      },
      onUpdate: ({ editor: editorInstance }) => {
        lastContentRef.current = editorInstance.getHTML();
        onChange?.(editorInstance.getHTML());
      },
      onFocus: () => {
        isFocusedRef.current = true;
      },
      onBlur: () => {
        isFocusedRef.current = false;
        onBlur?.();
      },
    });

    // Helper to normalize HTML for comparison
    const normalizeForComparison = (html: string): string => {
      return html
        .replace(/<p><\/p>/g, "")
        .replace(/<br\s*\/?>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    // Update content when prop changes externally (but not during active editing)
    // Only update if content is meaningfully different
    useEffect(() => {
      if (editor && !isFocusedRef.current) {
        const currentNormalized = normalizeForComparison(lastContentRef.current);
        const newNormalized = normalizeForComparison(content);
        
        if (currentNormalized !== newNormalized) {
          editor.commands.setContent(content);
          lastContentRef.current = content;
        }
      }
    }, [content, editor]);

    // Update editable state
    useEffect(() => {
      if (editor) {
        editor.setEditable(editable);
      }
    }, [editable, editor]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() || "",
      getText: () => editor?.getText() || "",
      setContent: (newContent: string) => editor?.commands.setContent(newContent),
      focus: () => editor?.commands.focus(),
    }));

    const setLink = useCallback(() => {
      if (!editor) return;

      const previousUrl = editor.getAttributes("link").href;
      const url = window.prompt("Enter URL", previousUrl);

      if (url === null) return;

      if (url === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }

      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }, [editor]);

    if (!editor) {
      return null;
    }

    return (
      <div className={cn("rich-text-editor rounded-md border border-border", className)}>
        {showToolbar && editable && (
          <EditorToolbar editor={editor} onSetLink={setLink} />
        )}

        {/* Bubble Menu for quick formatting */}
        {editable && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 100 }}
            className="flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("bold") && "bg-accent"
              )}
            >
              <span className="font-bold text-sm">B</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("italic") && "bg-accent"
              )}
            >
              <span className="italic text-sm">I</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("underline") && "bg-accent"
              )}
            >
              <span className="underline text-sm">U</span>
            </button>
            <button
              type="button"
              onClick={setLink}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("link") && "bg-accent"
              )}
            >
              <span className="text-sm">🔗</span>
            </button>
          </BubbleMenu>
        )}

        <EditorContent
          editor={editor}
          className={cn("px-3 py-2", !editable && "cursor-default")}
          style={{ minHeight }}
        />
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
