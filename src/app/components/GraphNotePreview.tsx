import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { preprocessVaultImages } from '../utils/markdownImages';

interface GraphNotePreviewProps {
  noteId: string;
  content: string;
  vaultPath?: string;
}

const previewComponents: Components = {
  img: ({ src, alt }) => (
    <img
      src={src ?? ''}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      className="max-w-full max-h-72 rounded border border-gray-200 object-contain my-2"
    />
  ),
  code: ({ className, children }) => (
    <code className={className} style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px', fontSize: '12px' }}>
      {children}
    </code>
  ),
};

export function GraphNotePreview({ noteId, content, vaultPath }: GraphNotePreviewProps) {
  const displayContent = useMemo(
    () => preprocessVaultImages(content, vaultPath, noteId),
    [content, noteId, vaultPath],
  );

  return (
    <div className="prose prose-sm max-w-none p-4 text-gray-700 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewComponents}>
        {displayContent}
      </ReactMarkdown>
    </div>
  );
}
