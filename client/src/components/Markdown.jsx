import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const REMARK = [remarkGfm];
// ignoreMissing: a code fence in a language we don't ship should render plain, not throw
const REHYPE = [[rehypeHighlight, { ignoreMissing: true }]];
const LINK = ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />;

// Renders notes. Raw HTML in the text is escaped rather than rendered, javascript: links are
// dropped by react-markdown, and images are left out. This is the heavy part (syntax highlighting),
// so it is loaded on demand with React.lazy.
export default function Markdown({ source }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} disallowedElements={['img']} unwrapDisallowed components={{ a: LINK }}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
