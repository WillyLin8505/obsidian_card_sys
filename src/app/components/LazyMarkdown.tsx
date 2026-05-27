import { type ComponentType, useEffect, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LazyMarkdownProps {
  content: string;
  components?: Components;
}

type SyntaxModule = {
  SyntaxHighlighter: ComponentType<any>;
  style: Record<string, any>;
};

let syntaxModulePromise: Promise<SyntaxModule> | null = null;

function loadSyntaxModule(): Promise<SyntaxModule> {
  if (!syntaxModulePromise) {
    syntaxModulePromise = Promise.all([
      import('react-syntax-highlighter/dist/esm/prism-light'),
      import('react-syntax-highlighter/dist/esm/styles/prism/one-light'),
      import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
      import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
      import('react-syntax-highlighter/dist/esm/languages/prism/python'),
      import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
      import('react-syntax-highlighter/dist/esm/languages/prism/json'),
      import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
      import('react-syntax-highlighter/dist/esm/languages/prism/css'),
      import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
    ]).then(([syntax, style, javascript, typescript, python, bash, json, markdown, css, sql]) => {
      const SyntaxHighlighter = syntax.default as ComponentType<any> & {
        registerLanguage?: (name: string, grammar: unknown) => void;
      };
      [
        ['javascript', javascript.default],
        ['js', javascript.default],
        ['typescript', typescript.default],
        ['ts', typescript.default],
        ['python', python.default],
        ['py', python.default],
        ['bash', bash.default],
        ['sh', bash.default],
        ['json', json.default],
        ['markdown', markdown.default],
        ['md', markdown.default],
        ['css', css.default],
        ['sql', sql.default],
      ].forEach(([name, grammar]) => SyntaxHighlighter.registerLanguage?.(name as string, grammar));
      return {
        SyntaxHighlighter,
        style: style.default,
      };
    });
  }
  return syntaxModulePromise;
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [syntaxModule, setSyntaxModule] = useState<SyntaxModule | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSyntaxModule().then(module => {
      if (!cancelled) setSyntaxModule(module);
    });
    return () => { cancelled = true; };
  }, []);

  if (!syntaxModule) {
    return (
      <pre style={{ fontSize: '12px', borderRadius: '6px', margin: '4px 0', background: '#f3f4f6', padding: '8px', overflowX: 'auto' }}>
        <code>{children}</code>
      </pre>
    );
  }

  const SyntaxHighlighter = syntaxModule.SyntaxHighlighter;
  return (
    <SyntaxHighlighter
      style={syntaxModule.style}
      language={language}
      PreTag="div"
      customStyle={{ fontSize: '12px', borderRadius: '6px', margin: '4px 0' }}
    >
      {children}
    </SyntaxHighlighter>
  );
}

const codeComponent: Components['code'] = ({ className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const isBlock = !!(props as any).node?.position;
  if (match && isBlock) {
    return <CodeBlock language={match[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>;
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
