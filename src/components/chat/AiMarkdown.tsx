"use client";

import { Children, isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Professional rendering for long, structured AI answers (practitioner mode).
 * react-markdown does not render raw HTML, so model output cannot inject markup.
 */

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ""))
    .join("");
}

const components: Components = {
  h1: ({ children }) => <SectionHeading>{children}</SectionHeading>,
  h2: ({ children }) => <SectionHeading>{children}</SectionHeading>,
  h3: ({ children }) => <h3 className="text-[14.5px] font-semibold text-foreground mt-4 mb-1.5">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-foreground/90 mt-3 mb-1">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="my-2 pl-5 list-disc space-y-1.5 marker:text-herb-green/70">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 pl-5 list-decimal space-y-1.5 marker:text-herb-green marker:font-semibold">{children}</ol>,
  li: ({ children }) => <li className="leading-7 pl-1 [&>ul]:mt-1 [&>ol]:mt-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-[3px] border-copper/50 bg-copper/5 rounded-r-lg px-4 py-1.5 text-foreground/85">{children}</blockquote>
  ),
  hr: () => null,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-herb-green underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className="block font-mono text-[13px]">{children}</code>
    ) : (
      <code className="font-mono text-[13px] bg-ivory border border-sand rounded px-1 py-0.5">{children}</code>
    ),
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-lg bg-ivory border border-sand p-3">{children}</pre>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <table className="w-full text-[13.5px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-herb-green/[0.07]">{children}</thead>,
  th: ({ children }) => (
    <th className="text-left text-[11.5px] uppercase tracking-wide font-semibold text-herb-green px-3.5 py-2.5 border-b border-border whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3.5 py-2.5 border-b border-border/60 align-top leading-6 [&:first-child]:font-medium [&:first-child]:text-foreground">{children}</td>,
  tr: ({ children }) => <tr className="even:bg-ivory/50 last:[&>td]:border-b-0">{children}</tr>,
};

function SectionHeading({ children }: { children: ReactNode }) {
  const isTakeaways = /key take ?aways|summary points|in short/i.test(textOf(children));
  return (
    <h2
      className={cn(
        "flex items-center gap-2.5 font-sans text-[15.5px] font-semibold tracking-tight text-foreground",
        "mt-6 mb-2.5 pt-5 border-t border-border/60 first:mt-1 first:pt-0 first:border-t-0",
        isTakeaways && "takeaways",
      )}
    >
      <span aria-hidden className={cn("w-1 h-[18px] rounded-full flex-shrink-0", isTakeaways ? "bg-copper" : "bg-herb-green")} />
      {children}
    </h2>
  );
}

function AiMarkdownImpl({ content }: { content: string }) {
  return (
    <div
      className={cn(
        "text-[14.5px] text-foreground/85 break-words",
        // Opening summary (first paragraph, before any heading) as a callout.
        "[&>p:first-child]:mt-0 [&>p:first-child]:mb-4 [&>p:first-child]:text-[15px] [&>p:first-child]:text-foreground",
        "[&>p:first-child]:bg-herb-green/[0.06] [&>p:first-child]:border-l-[3px] [&>p:first-child]:border-herb-green",
        "[&>p:first-child]:rounded-r-xl [&>p:first-child]:px-4 [&>p:first-child]:py-3",
        // "Key takeaways" list as a highlighted card.
        "[&_.takeaways+ul]:bg-copper/[0.06] [&_.takeaways+ul]:border [&_.takeaways+ul]:border-copper/20",
        "[&_.takeaways+ul]:rounded-xl [&_.takeaways+ul]:py-3 [&_.takeaways+ul]:pr-4 [&_.takeaways+ul]:pl-9 [&_.takeaways+ul]:marker:text-copper",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Memoised: while one answer streams, earlier answers don't re-render. */
export const AiMarkdown = memo(AiMarkdownImpl);
