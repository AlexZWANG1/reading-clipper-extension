import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatMessage({ content, role }) {
  if (role === 'user') {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc ml-4 mb-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal ml-4 mb-1.5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        pre: ({ children }) => (
          <pre className="bg-black/10 p-2 rounded text-xs overflow-x-auto my-1.5">{children}</pre>
        ),
        code: ({ className, children }) => {
          // If className contains "language-", it's inside a <pre> — skip inline styling
          if (className) return <code className={className}>{children}</code>;
          return <code className="bg-black/10 px-1 rounded text-xs">{children}</code>;
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-1.5">
            <table className="text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border px-2 py-1 bg-black/5 text-left">{children}</th>,
        td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent-blue)' }}>
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
