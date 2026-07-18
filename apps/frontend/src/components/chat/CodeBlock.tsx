import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { getHighlighter } from './MarkdownRenderer';

interface CodeBlockProps {
  language: string;
  value: string;
  isStable: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  language,
  value,
  isStable,
}) => {
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!isStable) {
      setHighlightedHtml(null);
      return;
    }

    let active = true;
    getHighlighter()
      .then((highlighter) => {
        if (!active) return;
        try {
          const html = highlighter.codeToHtml(value, {
            lang: language || 'text',
            theme: 'github-dark',
          });
          setHighlightedHtml(html);
        } catch (e) {
          // If language is not loaded or fails, fallback to 'text'
          if (!active) return;
          try {
            const html = highlighter.codeToHtml(value, {
              lang: 'text',
              theme: 'github-dark',
            });
            setHighlightedHtml(html);
          } catch (err) {
            setHighlightedHtml(null);
          }
        }
      })
      .catch(() => {
        if (active) setHighlightedHtml(null);
      });

    return () => {
      active = false;
    };
  }, [value, language, isStable]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // ignore
    }
  };

  const displayLanguage = language ? language.toUpperCase() : 'CODE';

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border/40 bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/80 px-4 py-1.5 font-mono text-xs text-muted-foreground border-b border-border/40">
        <span>{displayLanguage}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer focus:outline-none"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <div className="relative overflow-x-auto">
        {highlightedHtml ? (
          <div
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            className="[&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:!m-0 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-xs [&_code]:leading-relaxed"
          />
        ) : (
          <pre className="p-4 m-0 overflow-x-auto bg-transparent">
            <code className="font-mono text-xs text-foreground leading-relaxed">
              {value}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
};
