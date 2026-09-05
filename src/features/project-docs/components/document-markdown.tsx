"use client";

import { cloneElement, isValidElement, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { AlertTriangle, Info, Lightbulb, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  normalizeMarkdownSpacing,
  parseCalloutKind,
  remarkMarkHighlight,
  type DocCalloutKind,
} from "../lib/format-markdown";

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

function stripCalloutLabel(children: ReactNode): ReactNode {
  const items = Array.isArray(children) ? children : [children];
  return items
    .map((child, index) => {
      if (index !== 0 || !isValidElement<{ children?: ReactNode }>(child)) return child;
      const inner = child.props.children;
      if (typeof inner === "string") {
        const stripped = inner.replace(/^\[!\w+\]\s*/i, "");
        if (!stripped.trim()) return null;
        return cloneElement(child, { children: stripped });
      }
      const parts = Array.isArray(inner) ? inner : inner != null ? [inner] : [];
      const first = parts[0];
      if (typeof first === "string" && /^\[!\w+\]\s*/i.test(first)) {
        const nextFirst = first.replace(/^\[!\w+\]\s*/i, "");
        const nextInner = [nextFirst, ...parts.slice(1)].filter((part) => part !== "");
        if (!nextInner.length) return null;
        return cloneElement(child, { children: nextInner });
      }
      const label = nodeText(inner).trim();
      if (/^\[!(NOTE|TIP|HINT|INFO|WARNING|CAUTION|IMPORTANT|RISK|DANGER)\]\s*$/i.test(label)) return null;
      return child;
    })
    .filter((child) => child != null);
}

const CALLOUT_STYLES: Record<
  DocCalloutKind,
  { wrap: string; icon: typeof Info; label: string }
> = {
  note: {
    wrap: "border-sky-200/80 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-50",
    icon: Info,
    label: "Note",
  },
  tip: {
    wrap: "border-emerald-200/80 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-50",
    icon: Lightbulb,
    label: "Tip",
  },
  warning: {
    wrap: "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50",
    icon: AlertTriangle,
    label: "Warning",
  },
  important: {
    wrap: "border-violet-200/80 bg-violet-50 text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-50",
    icon: Info,
    label: "Important",
  },
  risk: {
    wrap: "border-rose-200/80 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-50",
    icon: ShieldAlert,
    label: "Risk",
  },
};

function Callout({ kind, children }: { kind: DocCalloutKind; children: ReactNode }) {
  const style = CALLOUT_STYLES[kind];
  const Icon = style.icon;
  return (
    <aside
      className={cn(
        "my-6 flex gap-3 rounded-xl border px-4 py-3.5 text-[15px] leading-7",
        style.wrap,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{style.label}</p>
        <div className="[&>p]:mb-0">{children}</div>
      </div>
    </aside>
  );
}

export function DocumentMarkdown({ markdown }: { markdown: string }) {
  const source = useMemo(() => normalizeMarkdownSpacing(markdown), [markdown]);
  return (
    <article className="mx-auto w-full max-w-[46rem] px-6 py-10 sm:px-10 sm:py-12">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMarkHighlight]}
        components={{
          h1({ children }) {
            return (
              <h1 className="mb-3 text-[2.15rem] font-bold tracking-[-0.04em] text-foreground leading-[1.15]">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mb-3 mt-11 border-b border-border/70 pb-2 text-[1.35rem] font-semibold tracking-[-0.02em] text-foreground">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mb-2 mt-8 text-[1.05rem] font-semibold tracking-[-0.01em] text-foreground">
                {children}
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4 className="mb-2 mt-6 text-[0.95rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {children}
              </h4>
            );
          },
          p({ children }) {
            const text = nodeText(children).trim();
            const isTagline =
              isValidElement(children) &&
              (children.type === "em" || children.type === "i");
            const onlyItalic =
              Array.isArray(children) &&
              children.length === 1 &&
              isValidElement(children[0]) &&
              (children[0].type === "em" || children[0].type === "i");
            if ((isTagline || onlyItalic) && text && !text.includes("\n") && text.length <= 220) {
              return (
                <p className="mb-8 text-[1.05rem] font-normal leading-7 text-muted-foreground">
                  {children}
                </p>
              );
            }
            return (
              <p className="mb-4 text-[15px] leading-7 text-foreground/90 last:mb-0">{children}</p>
            );
          },
          strong({ children }) {
            return <strong className="font-semibold text-foreground">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-foreground/80">{children}</em>;
          },
          ul({ children }) {
            return <ul className="my-4 list-disc space-y-1.5 pl-6 text-[15px] leading-7 marker:text-muted-foreground">{children}</ul>;
          },
          ol({ children }) {
            return (
              <ol className="my-4 list-decimal space-y-1.5 pl-6 text-[15px] leading-7 marker:font-medium marker:text-muted-foreground">
                {children}
              </ol>
            );
          },
          li({ children }) {
            return <li className="pl-1 text-foreground/90 [&>p]:my-0">{children}</li>;
          },
          blockquote({ children }) {
            const callout = parseCalloutKind(nodeText(children));
            if (callout) {
              return <Callout kind={callout.kind}>{stripCalloutLabel(children)}</Callout>;
            }
            return (
              <blockquote className="my-6 border-l-[3px] border-foreground/20 pl-4 text-[15px] leading-7 text-muted-foreground">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="my-10 border-0 border-t border-border" />;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="my-6 overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full border-collapse text-left text-[13px]">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-muted/60">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-3.5 py-2.5 font-semibold text-foreground">{children}</th>
            );
          },
          td({ children }) {
            return <td className="border-t border-border px-3.5 py-2.5 text-foreground/90">{children}</td>;
          },
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const value = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <div className="my-6 overflow-hidden rounded-xl border border-border bg-[#0d1117]">
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-rose-400/80" />
                    <span className="h-2 w-2 rounded-full bg-amber-400/80" />
                    <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                      {match[1]}
                    </span>
                  </div>
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      padding: "1.1rem 1.15rem 1.25rem",
                      fontSize: "13px",
                      lineHeight: 1.7,
                      background: "transparent",
                    }}
                  >
                    {value}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code className={cn("rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground", className)}>
                {children}
              </code>
            );
          },
          mark({ children }) {
            return (
              <mark className="rounded-[0.2rem] bg-amber-200/90 px-0.5 text-inherit dark:bg-amber-400/25">
                {children}
              </mark>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}
