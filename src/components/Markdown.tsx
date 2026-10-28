import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { issueUrl } from '../lib/config';
import { ExternalLink } from './ExternalLink';

/**
 * Renders text taken from a PR description. Raw HTML is dropped (never
 * rendered), and links open in a new tab.
 */
export function Markdown({ children, repository }: { children: string; repository: string }) {
  // Turn bare "#1234" references into links, as GitHub does.
  const linked = children.replace(/(^|[\s(])#(\d{2,6})\b/g, (_match, before: string, number: string) => {
    return `${before}[#${number}](${issueUrl(repository, Number(number))})`;
  });

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _node, ...props }) => <ExternalLink {...props} />,
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}
