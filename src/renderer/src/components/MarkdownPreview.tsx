import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import { code as streamdownCode } from '@streamdown/code';
import { createMermaidPlugin } from '@streamdown/mermaid';
import type { AllowedTags, Components } from 'streamdown';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

type MarkdownPreviewProps = {
  components: Components;
  markdownPath: string;
  markdownText: string;
  theme: 'dark' | 'light';
  workspaceId: string;
  workspacePath: string;
  absPath?: string;
};

const mermaidDark = createMermaidPlugin({ config: { theme: 'dark' } });
const mermaidLight = createMermaidPlugin({ config: { theme: 'default' } });
const streamdownPluginsDark = { code: streamdownCode, mermaid: mermaidDark };
const streamdownPluginsLight = { code: streamdownCode, mermaid: mermaidLight };

const markdownAllowedTags: AllowedTags = {
  a: ['href', 'title', 'target', 'rel'],
  h1: ['align', 'id'],
  h2: ['align', 'id'],
  h3: ['align', 'id'],
  h4: ['align', 'id'],
  h5: ['align', 'id'],
  h6: ['align', 'id'],
  img: ['src', 'alt', 'title', 'width', 'height', 'align'],
  p: ['align'],
};

function isRemoteOrEmbeddedUrl(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function normalizeRelativePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function normalizeAbsolutePath(path: string): string {
  return `/${normalizeRelativePath(path)}`;
}

function resolveMarkdownImagePath(src: string, markdownPath: string): string {
  const [pathPart, suffix = ''] = src.split(/([?#].*)/, 2);
  if (pathPart.startsWith('/')) return normalizeRelativePath(pathPart.slice(1)) + suffix;
  const baseDir = dirname(markdownPath);
  return normalizeRelativePath(baseDir ? `${baseDir}/${pathPart}` : pathPart) + suffix;
}

function resolveAbsMarkdownImagePath(src: string, markdownAbsPath: string): string {
  if (src.startsWith('/')) return src;
  const baseDir = dirname(markdownAbsPath);
  return normalizeAbsolutePath(baseDir ? `${baseDir}/${src}` : src);
}

function splitPathFromSuffix(path: string): string {
  return path.split(/[?#]/, 1)[0];
}

type MarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  node?: unknown;
};

type MarkdownAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown;
};

async function resolveLocalMarkdownImageUrl(
  src: string,
  workspacePath: string,
  markdownPath: string,
  markdownAbsPath?: string,
) {
  if (!src || isRemoteOrEmbeddedUrl(src)) return src;
  const [pathWithoutSuffix] = src.split(/[?#]/, 1);
  if (markdownAbsPath && window.forgepad.fs.absFileUrl) {
    return window.forgepad.fs.absFileUrl(resolveAbsMarkdownImagePath(pathWithoutSuffix, markdownAbsPath));
  }
  if (!markdownAbsPath && window.forgepad.fs.fileUrl) {
    return window.forgepad.fs.fileUrl(workspacePath, resolveMarkdownImagePath(pathWithoutSuffix, markdownPath));
  }
  return src;
}

async function rewriteLocalMarkdownImageSources(
  markdownText: string,
  workspacePath: string,
  markdownPath: string,
  markdownAbsPath?: string,
) {
  const replacements = new Map<string, string>();
  const sources = new Set<string>();

  for (const match of markdownText.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    sources.add(match[1]);
  }
  for (const match of markdownText.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi)) {
    sources.add(match[2]);
  }

  await Promise.all(
    Array.from(sources).map(async (src) => {
      if (isRemoteOrEmbeddedUrl(src)) return;
      try {
        replacements.set(src, await resolveLocalMarkdownImageUrl(src, workspacePath, markdownPath, markdownAbsPath));
      } catch {
        // Leave the source untouched; GitHub-compatible markdown should stay readable
        // even when a local file cannot be resolved inside ForgePad.
      }
    }),
  );

  if (replacements.size === 0) return markdownText;
  return markdownText.replace(/!\[([^\]]*)]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (full, alt, src, title) => {
    const replacement = replacements.get(src);
    return replacement ? `![${alt}](${replacement}${title})` : full;
  }).replace(/(<img\b[^>]*\bsrc=)(["'])(.*?)\2/gi, (full, prefix, quote, src) => {
    const replacement = replacements.get(src);
    return replacement ? `${prefix}${quote}${replacement}${quote}` : full;
  });
}

function createMarkdownImageComponent(workspacePath: string, markdownPath: string, markdownAbsPath?: string) {
  const MarkdownImage = ({ node: _, src, alt, ...props }: MarkdownImageProps) => {
    const rawSrc = typeof src === 'string' ? src : '';
    const [resolvedSrc, setResolvedSrc] = useState(rawSrc);

    useEffect(() => {
      let disposed = false;
      setResolvedSrc(rawSrc);

      if (!rawSrc || isRemoteOrEmbeddedUrl(rawSrc)) return;

      resolveLocalMarkdownImageUrl(rawSrc, workspacePath, markdownPath, markdownAbsPath).then((url) => {
        if (!disposed) setResolvedSrc(url);
      }).catch(() => {
        if (!disposed) setResolvedSrc(rawSrc);
      });

      return () => {
        disposed = true;
      };
    }, [rawSrc]);

    const handleError = () => {
      setResolvedSrc(rawSrc);
    };

    return <img {...props} src={resolvedSrc} alt={alt ?? ''} onError={handleError} />;
  };

  MarkdownImage.displayName = 'MarkdownImage';
  return MarkdownImage;
}

function createMarkdownAnchorComponent(
  workspaceId: string,
  markdownPath: string,
  openFileTab: (workspaceId: string, relPath: string) => void,
  openExternalFileTab: (workspaceId: string, absPath: string) => void,
  markdownAbsPath?: string,
) {
  const MarkdownAnchor = ({ node: _, href, onClick, children, ...props }: MarkdownAnchorProps) => {
    const rawHref = typeof href === 'string' ? href : '';

    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || !rawHref) return;

      if (rawHref.startsWith('#')) return;

      event.preventDefault();

      if (isRemoteOrEmbeddedUrl(rawHref)) {
        void window.forgepad.shell.openExternal(rawHref);
        return;
      }

      const pathWithoutSuffix = splitPathFromSuffix(rawHref);
      if (markdownAbsPath) {
        openExternalFileTab(workspaceId, resolveAbsMarkdownImagePath(pathWithoutSuffix, markdownAbsPath));
        return;
      }

      openFileTab(workspaceId, splitPathFromSuffix(resolveMarkdownImagePath(pathWithoutSuffix, markdownPath)));
    };

    return (
      <a {...props} href={rawHref} onClick={handleClick}>
        {children}
      </a>
    );
  };

  MarkdownAnchor.displayName = 'MarkdownAnchor';
  return MarkdownAnchor;
}

export function MarkdownPreview({
  absPath,
  components,
  markdownPath,
  markdownText,
  theme,
  workspaceId,
  workspacePath,
}: MarkdownPreviewProps) {
  const openFileTab = useAppStore((state) => state.openFileTab);
  const openExternalFileTab = useAppStore((state) => state.openExternalFileTab);
  const [renderMarkdownText, setRenderMarkdownText] = useState(markdownText);

  useEffect(() => {
    let disposed = false;
    setRenderMarkdownText(markdownText);
    rewriteLocalMarkdownImageSources(markdownText, workspacePath, markdownPath, absPath).then((nextText) => {
      if (!disposed) setRenderMarkdownText(nextText);
    });
    return () => {
      disposed = true;
    };
  }, [absPath, markdownPath, markdownText, workspacePath]);

  const previewComponents = useMemo<Components>(
    () => ({
      ...components,
      a: createMarkdownAnchorComponent(workspaceId, markdownPath, openFileTab, openExternalFileTab, absPath),
      img: createMarkdownImageComponent(workspacePath, markdownPath, absPath),
    }),
    [absPath, components, markdownPath, openExternalFileTab, openFileTab, workspaceId, workspacePath],
  );

  return (
    <Streamdown
      allowedTags={markdownAllowedTags}
      components={previewComponents}
      linkSafety={{ enabled: false }}
      plugins={theme === 'dark' ? streamdownPluginsDark : streamdownPluginsLight}
    >
      {renderMarkdownText}
    </Streamdown>
  );
}
