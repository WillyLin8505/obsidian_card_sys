import { useEffect, useRef } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { preprocessVaultImages } from '../utils/markdownImages';

interface GraphNoteEditorProps {
  noteId: string;
  initialContent: string;
  contentRef: React.MutableRefObject<string>;
  mode?: 'wysiwyg' | 'sv' | 'ir';
  minHeight?: number;
  height?: number | string;
  vaultPath?: string;
}

function restoreAssetImageUrls(markdown: string) {
  return markdown.replace(/!\[([^\]]*)]\(([^)]+\/notes\/asset\?[^)]+)\)/g, (match, alt, rawUrl) => {
    try {
      const url = new URL(rawUrl, window.location.origin);
      const file = url.searchParams.get('file');
      if (!file) return match;
      return `![${alt}](${file})`;
    } catch {
      return match;
    }
  });
}

export function GraphNoteEditor({
  noteId,
  initialContent,
  contentRef,
  mode = 'ir',
  minHeight = 300,
  height = 'auto',
  vaultPath,
}: GraphNoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const readyRef = useRef(false);

  const displayContent = preprocessVaultImages(initialContent, vaultPath, noteId);

  // Mount once
  useEffect(() => {
    if (!containerRef.current) return;

    const vd = new Vditor(containerRef.current, {
      mode,
      value: displayContent,
      toolbar: [],
      height,
      minHeight,
      cache: { enable: false },
      input: (value) => {
        contentRef.current = restoreAssetImageUrls(value);
      },
      after: () => {
        vditorRef.current = vd;
        readyRef.current = true;
        contentRef.current = initialContent;
      },
    });
    return () => {
      vd.destroy();
      vditorRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Switch note → load new content into Vditor
  useEffect(() => {
    if (!readyRef.current || !vditorRef.current) return;
    vditorRef.current.setValue(displayContent, true);
    contentRef.current = initialContent;
  }, [noteId, initialContent, displayContent]);

  return <div ref={containerRef} className="size-full" />;
}
