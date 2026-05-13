import { code as streamdownCode } from '@streamdown/code';
import { createMermaidPlugin } from '@streamdown/mermaid';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

type MarkdownPreviewProps = {
  components: Record<string, React.ComponentType<unknown>>;
  markdownText: string;
  theme: 'dark' | 'light';
};

const mermaidDark = createMermaidPlugin({ config: { theme: 'dark' } });
const mermaidLight = createMermaidPlugin({ config: { theme: 'default' } });
const streamdownPluginsDark = { code: streamdownCode, mermaid: mermaidDark };
const streamdownPluginsLight = { code: streamdownCode, mermaid: mermaidLight };

export function MarkdownPreview({ components, markdownText, theme }: MarkdownPreviewProps) {
  return (
    <Streamdown components={components} plugins={theme === 'dark' ? streamdownPluginsDark : streamdownPluginsLight}>
      {markdownText}
    </Streamdown>
  );
}
