"use client";

import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance, type Props } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface MentionListProps {
  items: Array<{
    id: string;
    name: string;
    email?: string;
    imageUrl?: string | null;
  }>;
  command: (item: { id: string; label: string }) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command({ id: item.id, label: item.name || item.email || "" });
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

    const getInitials = (name: string) => {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    };

    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-popover p-2 shadow-lg">
          <span className="text-sm text-muted-foreground">No users found</span>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-border bg-popover shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectItem(index)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent",
              index === selectedIndex && "bg-accent"
            )}
          >
            <Avatar className="size-6">
              {item.imageUrl && <AvatarImage src={item.imageUrl} alt={item.name} />}
              <AvatarFallback className="text-xs">
                {getInitials(item.name || item.email || "?")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.name}</p>
              {item.email && (
                <p className="text-xs text-muted-foreground truncate">{item.email}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";

// We'll create this as a function that fetches members
let cachedMembers: Array<{
  id: string;
  name: string;
  email?: string;
  imageUrl?: string | null;
}> = [];

export const setMentionMembers = (
  members: Array<{
    id: string;
    name: string;
    email?: string;
    imageUrl?: string | null;
  }>
) => {
  cachedMembers = members;
};

export const createMentionExtension = (_workspaceId: string) => {
  return Mention.configure({
    HTMLAttributes: {
      class: "mention bg-primary/10 text-primary rounded px-1 py-0.5 font-medium",
    },
    suggestion: {
      char: "@",
      items: ({ query }: { query: string }) => {
        return cachedMembers
          .filter((member) => {
            const searchQuery = query.toLowerCase();
            const name = member.name?.toLowerCase() || "";
            const email = member.email?.toLowerCase() || "";
            return name.includes(searchQuery) || email.includes(searchQuery);
          })
          .slice(0, 5);
      },
      render: () => {
        let component: ReactRenderer<MentionListRef> | null = null;
        let popup: Instance<Props>[] | null = null;

        return {
          onStart: (props: SuggestionProps) => {
            component = new ReactRenderer(MentionList, {
              props,
              editor: props.editor,
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

          onUpdate(props: SuggestionProps) {
            component?.updateProps(props);

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
  });
};
