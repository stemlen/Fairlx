"use client";

import { Extension, Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance, type Props } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  CheckSquare,
  Table,
  List,
  ListOrdered,
  Code2,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Minus,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface CommandItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  command: (props: { editor: Editor; range: { from: number; to: number } }) => void;
  category: "insert" | "format";
}

const SLASH_COMMANDS: CommandItem[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    category: "format",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    category: "format",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    category: "format",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run();
    },
  },
  {
    title: "Checklist",
    description: "Create a checklist with checkboxes",
    icon: CheckSquare,
    category: "insert",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleTaskList()
        .run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list",
    icon: List,
    category: "insert",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleBulletList()
        .run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a numbered list",
    icon: ListOrdered,
    category: "insert",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleOrderedList()
        .run();
    },
  },
  {
    title: "Table",
    description: "Insert a table",
    icon: Table,
    category: "insert",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: "Code Block",
    description: "Insert a code block",
    icon: Code2,
    category: "insert",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleCodeBlock()
        .run();
    },
  },
  {
    title: "Quote",
    description: "Insert a blockquote",
    icon: Quote,
    category: "insert",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleBlockquote()
        .run();
    },
  },
  {
    title: "Divider",
    description: "Insert a horizontal line",
    icon: Minus,
    category: "insert",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHorizontalRule()
        .run();
    },
  },
];

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
  query: string;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const CommandList = forwardRef<CommandListRef, CommandListProps>(
  ({ items, command, query: _query }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + items.length - 1) % items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }
        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }
        if (event.key === "Enter") {
          enterHandler();
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">No results</span>
        </div>
      );
    }

    const groupedItems = {
      format: items.filter((i) => i.category === "format"),
      insert: items.filter((i) => i.category === "insert"),
    };

    let currentIndex = -1;

    return (
      <div className="rounded-lg border border-border bg-popover shadow-lg overflow-hidden max-h-[300px] overflow-y-auto w-64">
        {groupedItems.format.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
              Format
            </div>
            {groupedItems.format.map((item) => {
              currentIndex++;
              const index = currentIndex;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => selectItem(index)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent",
                    index === selectedIndex && "bg-accent"
                  )}
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {groupedItems.insert.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
              Insert
            </div>
            {groupedItems.insert.map((item) => {
              currentIndex++;
              const index = currentIndex;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => selectItem(index)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent",
                    index === selectedIndex && "bg-accent"
                  )}
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

CommandList.displayName = "CommandList";

export const createSlashCommandExtension = (
  workspaceId: string,
  projectId: string
) => {
  // Suppress unused parameter warnings - these are for future work item linking
  void workspaceId;
  void projectId;
  
  return Extension.create({
    name: "slashCommand",

    addOptions() {
      return {
        suggestion: {
          char: "/",
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: { from: number; to: number };
            props: CommandItem;
          }) => {
            props.command({ editor, range });
          },
          items: ({ query }: { query: string }): CommandItem[] => {
            return SLASH_COMMANDS.filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase())
            );
          },
          render: () => {
            let component: ReactRenderer<CommandListRef> | null = null;
            let popup: Instance<Props>[] | null = null;

            return {
              onStart: (props: {
                editor: unknown;
                clientRect?: (() => DOMRect | null) | null;
                items: CommandItem[];
                command: (item: CommandItem) => void;
                query: string;
              }) => {
                component = new ReactRenderer(CommandList, {
                  props: {
                    items: props.items,
                    command: props.command,
                    query: props.query,
                  },
                  editor: props.editor as never,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },

              onUpdate(props: {
                clientRect?: (() => DOMRect | null) | null;
                items: CommandItem[];
                command: (item: CommandItem) => void;
                query: string;
              }) {
                component?.updateProps({
                  items: props.items,
                  command: props.command,
                  query: props.query,
                });

                if (!props.clientRect) {
                  return;
                }

                popup?.[0]?.setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                });
              },

              onKeyDown(props: { event: KeyboardEvent }) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }

                return component?.ref?.onKeyDown(props) ?? false;
              },

              onExit() {
                if (popup?.[0] && !popup[0].state.isDestroyed) {
                  popup[0].destroy();
                }
                component?.destroy();
              },
            };
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...(this.options.suggestion as Record<string, unknown>),
        }),
      ];
    },
  });
};
