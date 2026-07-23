import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { CodeBlock } from './CodeBlock';
import type { Highlighter } from 'shiki';

// Lazy-loaded Shiki highlighter singleton
let highlighterPromise: Promise<Highlighter> | null = null;
let highlighterInstance: Highlighter | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (highlighterInstance) {
    return Promise.resolve(highlighterInstance);
  }
  if (!highlighterPromise) {
    highlighterPromise = import('shiki')
      .then((shiki) =>
        shiki.createHighlighter({
          themes: ['github-dark'],
          langs: [
            'typescript',
            'javascript',
            'tsx',
            'jsx',
            'css',
            'html',
            'json',
            'markdown',
            'bash',
            'shell',
            'yaml',
            'python',
            'rust',
            'go',
            'sql',
            'c',
            'cpp',
            'text',
          ],
        })
      )
      .then((hl) => {
        highlighterInstance = hl;
        return hl;
      });
  }
  return highlighterPromise;
}

// Stateful parser to check which code blocks have a closing fence
interface ParsedBlock {
  language: string;
  content: string;
  isClosed: boolean;
}

type HastNode = {
  type?: string;
  tagName?: string;
  children?: unknown[];
  properties?: Record<string, unknown>;
};

function isHastNode(value: unknown): value is HastNode {
  return typeof value === 'object' && value !== null;
}

function getStringProperty(source: unknown, key: string): string | undefined {
  if (!isHastNode(source)) {
    return undefined;
  }

  const value = source[key as keyof HastNode];
  return typeof value === 'string' ? value : undefined;
}

export function parseMarkdownCodeBlocks(markdown: string): ParsedBlock[] {
  const lines = markdown.split('\n');
  const blocks: ParsedBlock[] = [];
  let inBlock = false;
  let currentLanguage = '';
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      if (inBlock) {
        // Closing fence
        blocks.push({
          language: currentLanguage,
          content: currentContent.join('\n'),
          isClosed: true,
        });
        inBlock = false;
        currentContent = [];
      } else {
        // Opening fence
        inBlock = true;
        currentLanguage = line.trim().slice(3).trim();
        currentContent = [];
      }
    } else {
      if (inBlock) {
        currentContent.push(line);
      }
    }
  }

  if (inBlock) {
    blocks.push({
      language: currentLanguage,
      content: currentContent.join('\n'),
      isClosed: false,
    });
  }

  return blocks;
}

// Custom rehype plugin to traverse tree and annotate code blocks with their stable state.
// `forceUnstable=true` is used while content is still streaming in — every code block
// is marked isClosed=false so CodeBlock renders plain <pre> until the parent signals
// streaming has completed. Once streaming ends, the parser-determined isClosed is
// authoritative (a stream that arrived clean can be Shiki-highlighted on the next render).
function rehypeCodeBlockMeta(rawMarkdown: string, forceUnstable: boolean) {
  const blocks = parseMarkdownCodeBlocks(rawMarkdown);
  return (tree: unknown) => {
    let index = 0;

    function traverse(node: unknown) {
      if (!isHastNode(node)) {
        return;
      }

      if (node.type === 'element' && node.tagName === 'pre') {
        const codeNode = node.children?.find(
          (child): child is HastNode => isHastNode(child) && child.tagName === 'code'
        );
        if (codeNode) {
          const block = blocks[index];
          if (block) {
            codeNode.properties = codeNode.properties || {};
            codeNode.properties['data-code-index'] = String(index);
            codeNode.properties['data-is-stable'] = String(
              forceUnstable ? false : block.isClosed
            );
          }
          index++;
        }
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    traverse(tree);
  };
}

// Strict rehype-sanitize schema to enforce XSS safety while permitting markdown styles and classes
const strictSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'span',
    'div',
    'input',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': ['className', 'class'],
    a: ['href', 'target', 'rel', 'title'],
    input: [
      ['type', 'checkbox'],
      ['disabled', true],
      ['checked'],
    ],
    code: ['data-code-index', 'data-is-stable', 'className', 'class'],
  },
  protocols: {
    href: ['http', 'https', 'mailto', 'tel'],
  },
};

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownRenderer = React.memo<MarkdownRendererProps>(
  ({ content, isStreaming = false }) => {
    const codeBlockMetaPlugin = useMemo(
      () => rehypeCodeBlockMeta(content, isStreaming),
      [content, isStreaming]
    );

    return (
      <div className="w-full text-sm leading-relaxed text-foreground select-text">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            [rehypeSanitize, strictSchema],
            [codeBlockMetaPlugin],
          ]}
          components={{
            h1: ({ children }) => <h1 className="text-lg font-semibold tracking-tight mt-5 mb-2 border-b border-border/20 pb-1">{children}</h1>,
            h2: ({ children }) => <h2 className="text-base font-semibold tracking-tight mt-4 mb-2">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold tracking-tight mt-3 mb-1.5">{children}</h3>,
            h4: ({ children }) => <h4 className="text-xs font-semibold tracking-tight mt-2.5 mb-1">{children}</h4>,
            p: ({ children }) => <p className="my-2 last:mb-0 leading-relaxed">{children}</p>,
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors cursor-pointer"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-primary/50 pl-4 my-3 italic text-muted-foreground bg-muted/10 py-1 pr-2 rounded-r-md">
                {children}
              </blockquote>
            ),
            ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
            table: ({ children }) => (
              <div className="my-4 w-full overflow-x-auto border border-border/40 rounded-lg shadow-sm">
                <table className="min-w-full border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-muted/30 border-b border-border/40">{children}</thead>,
            tbody: ({ children }) => <tbody className="divide-y divide-border/20">{children}</tbody>,
            tr: ({ children }) => <tr className="hover:bg-muted/10 transition-colors">{children}</tr>,
            th: ({ children }) => (
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {children}
              </th>
            ),
            td: ({ children }) => <td className="px-4 py-2 text-xs text-foreground leading-normal">{children}</td>,
            code: (props) => {
              const { children, className } = props;
              const hasIndex = getStringProperty(props, 'data-code-index') !== undefined;
              
              if (hasIndex) {
                const isStable = getStringProperty(props, 'data-is-stable') === 'true';
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : 'text';
                
                return (
                  <CodeBlock
                    language={language}
                    value={String(children).replace(/\n$/, '')}
                    isStable={isStable}
                  />
                );
              }
              
              return (
                <code className="px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono bg-muted border border-border/40 text-foreground break-words select-all">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <>{children}</>,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.content === nextProps.content &&
    prevProps.isStreaming === nextProps.isStreaming
);
