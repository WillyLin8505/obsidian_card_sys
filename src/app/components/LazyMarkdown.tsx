import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface LazyMarkdownProps {
  content: string;
  components?: Components;
}

const codeComponent: Components['code'] = ({ className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const isBlock = !!(props as any).node?.position;
  if (match && isBlock) {
    return (
      <SyntaxHighlighter
        style={oneLight}
        language={match[1]}
        PreTag="div"
        customStyle={{ fontSize: '12px', borderRadius: '6px', margin: '4px 0' }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  }
  return (
    <code className={className} style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px', fontSize: '12px' }}>
      {children}
    </code>
  );
};

export function LazyMarkdown({ content, components }: LazyMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{ code: codeComponent, ...components }}
    >
      {content}
    </ReactMarkdown>
  );
}
