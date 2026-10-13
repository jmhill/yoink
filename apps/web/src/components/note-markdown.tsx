import type { ReactNode } from 'react';
import Markdown from 'react-markdown';

type NoteMarkdownProps = {
  body: string;
};

const blocked = () => null;

export function NoteMarkdown({ body }: NoteMarkdownProps) {
  return (
    <div data-note-markdown="" className="space-y-3 text-sm leading-6 [&_pre]:overflow-x-auto">
      <Markdown
        components={{
          script: blocked,
          iframe: blocked,
          object: blocked,
          embed: blocked,
          img: blocked,
          h1: ({ children }: { children?: ReactNode }) => (
            <h1 className="text-xl font-semibold">{children}</h1>
          ),
          h2: ({ children }: { children?: ReactNode }) => (
            <h2 className="text-lg font-semibold">{children}</h2>
          ),
          p: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
          a: ({ href, children }: { href?: string; children?: ReactNode }) => (
            <a href={href} className="underline underline-offset-2" rel="noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }: { children?: ReactNode }) => (
            <ul className="list-disc pl-5">{children}</ul>
          ),
          ol: ({ children }: { children?: ReactNode }) => (
            <ol className="list-decimal pl-5">{children}</ol>
          ),
          code: ({ children }: { children?: ReactNode }) => (
            <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{children}</code>
          ),
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
