import { memo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface Props {
  content: string;
  theme: 'light' | 'dark';
}

function MarkdownRendererInner({ content, theme }: Props) {
  const isDark = theme === 'dark';

  const colors = {
    codeBg: isDark ? '#1a1a2e' : '#f6f8fa',
    codeBorder: isDark ? '#333355' : '#e1e4e8',
    inlineCodeBg: isDark ? '#2d2d50' : '#eff1f3',
    inlineCodeColor: isDark ? '#e06c75' : '#d63384',
    linkColor: isDark ? '#6cb6ff' : '#0969da',
    blockquoteBorder: isDark ? '#4ec9b0' : '#0078d4',
    blockquoteBg: isDark ? '#1e1e2e' : '#f0f7ff',
    tableBorder: isDark ? '#404060' : '#d0d7de',
    tableStripeBg: isDark ? '#25253a' : '#f6f8fa',
    hrColor: isDark ? '#404060' : '#d0d7de',
    headingColor: isDark ? '#e0e0ff' : '#1f2328',
    textColor: isDark ? '#d4d4d4' : '#333333',
  };

  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match?.[1];
      const codeStr = String(children).replace(/\n$/, '');
      const isInline = !className && !codeStr.includes('\n');

      if (isInline) {
        return (
          <code style={{ backgroundColor: colors.inlineCodeBg, color: colors.inlineCodeColor, padding: '2px 6px', borderRadius: '4px', fontSize: '0.88em', fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace" }} {...props}>
            {children}
          </code>
        );
      }

      return <CodeBlock lang={lang} code={codeStr} colors={colors} />;
    },

    pre({ children }) {
      return <>{children}</>;
    },

    p({ children }) {
      return <p style={{ margin: '0 0 8px', lineHeight: '1.6' }}>{children}</p>;
    },

    h1({ children }) { return <h1 style={{ fontSize: '1.4em', fontWeight: 700, color: colors.headingColor, margin: '16px 0 8px', borderBottom: `1px solid ${colors.hrColor}`, paddingBottom: '4px' }}>{children}</h1>; },
    h2({ children }) { return <h2 style={{ fontSize: '1.25em', fontWeight: 700, color: colors.headingColor, margin: '14px 0 6px', borderBottom: `1px solid ${colors.hrColor}`, paddingBottom: '3px' }}>{children}</h2>; },
    h3({ children }) { return <h3 style={{ fontSize: '1.1em', fontWeight: 600, color: colors.headingColor, margin: '12px 0 6px' }}>{children}</h3>; },
    h4({ children }) { return <h4 style={{ fontSize: '1em', fontWeight: 600, color: colors.headingColor, margin: '10px 0 4px' }}>{children}</h4>; },

    a({ href, children }) {
      return <a href={href} style={{ color: colors.linkColor, textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">{children}</a>;
    },

    ul({ children }) { return <ul style={{ margin: '4px 0 8px', paddingLeft: '20px' }}>{children}</ul>; },
    ol({ children }) { return <ol style={{ margin: '4px 0 8px', paddingLeft: '20px' }}>{children}</ol>; },
    li({ children }) { return <li style={{ margin: '2px 0', lineHeight: '1.5' }}>{children}</li>; },

    blockquote({ children }) {
      return (
        <blockquote style={{ margin: '8px 0', padding: '6px 12px', borderLeft: `3px solid ${colors.blockquoteBorder}`, backgroundColor: colors.blockquoteBg, borderRadius: '0 4px 4px 0', opacity: 0.9 }}>
          {children}
        </blockquote>
      );
    },

    table({ children }) {
      return (
        <div style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9em' }}>{children}</table>
        </div>
      );
    },
    thead({ children }) { return <thead>{children}</thead>; },
    tbody({ children }) { return <tbody>{children}</tbody>; },
    tr({ children }) { return <tr style={{ borderBottom: `1px solid ${colors.tableBorder}` }}>{children}</tr>; },
    th({ children }) { return <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, backgroundColor: colors.tableStripeBg }}>{children}</th>; },
    td({ children }) { return <td style={{ padding: '6px 10px' }}>{children}</td>; },

    hr() { return <hr style={{ border: 'none', borderTop: `1px solid ${colors.hrColor}`, margin: '12px 0' }} />; },

    strong({ children }) { return <strong style={{ fontWeight: 600 }}>{children}</strong>; },
    em({ children }) { return <em>{children}</em>; },
    del({ children }) { return <del style={{ opacity: 0.6 }}>{children}</del>; },
  };

  return (
    <div style={{ fontSize: '13px', lineHeight: '1.5', color: colors.textColor, wordBreak: 'break-word' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);

// ==================== Code Block with Copy ====================

interface CodeBlockProps {
  lang?: string;
  code: string;
  colors: Record<string, string>;
}

function CodeBlock({ lang, code, colors }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div style={{ position: 'relative', margin: '8px 0', borderRadius: '6px', border: `1px solid ${colors.codeBorder}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', backgroundColor: colors.codeBorder, fontSize: '11px', opacity: 0.8 }}>
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px', padding: '2px 6px', borderRadius: '3px', opacity: copied ? 1 : 0.7 }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '12px', backgroundColor: colors.codeBg, overflowX: 'auto', fontSize: '12px', lineHeight: '1.5', fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
