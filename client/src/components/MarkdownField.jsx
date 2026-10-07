import { lazy, Suspense, useRef, useState } from 'react';
import { Bold, Braces, Code, Eye, Italic, Link2, List, Pencil, Quote } from 'lucide-react';

const Markdown = lazy(() => import('./Markdown.jsx'));

// Each edit takes the text and the current selection and returns the new text and selection.
const wrap = (before, after, placeholder) => (text, start, end) => {
  const selected = text.slice(start, end) || placeholder;
  return { text: text.slice(0, start) + before + selected + after + text.slice(end), start: start + before.length, end: start + before.length + selected.length };
};

// Puts a prefix on every selected line (or the current line)
const linePrefix = (prefix) => (text, start, end) => {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const lines = text.slice(from, end).split('\n').map((l) => prefix + l);
  const block = lines.join('\n');
  return { text: text.slice(0, from) + block + text.slice(end), start: from + prefix.length, end: from + block.length };
};

const codeBlock = (text, start, end) => {
  const selected = text.slice(start, end) || 'code here';
  const lead = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
  const open = `${lead}\`\`\`python\n`;
  return { text: `${text.slice(0, start)}${open}${selected}\n\`\`\`\n${text.slice(end)}`, start: start + open.length, end: start + open.length + selected.length };
};

const link = (text, start, end) => {
  const label = text.slice(start, end) || 'link text';
  const urlStart = start + label.length + 3;
  return { text: `${text.slice(0, start)}[${label}](https://)${text.slice(end)}`, start: urlStart, end: urlStart + 8 };
};

const TOOLS = [
  { label: 'Bold', icon: Bold, edit: wrap('**', '**', 'bold') },
  { label: 'Italic', icon: Italic, edit: wrap('*', '*', 'italic') },
  { label: 'Inline code', icon: Code, edit: wrap('`', '`', 'code') },
  { label: 'Code block', icon: Braces, edit: codeBlock },
  { label: 'Link', icon: Link2, edit: link },
  { label: 'Bulleted list', icon: List, edit: linePrefix('- ') },
  { label: 'Quote', icon: Quote, edit: linePrefix('> ') },
];

// A textarea with a small Markdown toolbar and a live preview tab.
export function MarkdownField({ value, onChange, placeholder, maxLength = 10000, id }) {
  const [tab, setTab] = useState('write');
  const ref = useRef(null);

  function apply(edit) {
    const el = ref.current;
    if (!el) return;
    const next = edit(value, el.selectionStart, el.selectionEnd);
    onChange(next.text.slice(0, maxLength));
    // Put the selection back once React has re-rendered the textarea
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  }

  const tabClass = (name) => `flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === name ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`;

  return (
    <div className="rounded-xl border border-line bg-abyss/70 focus-within:border-violet">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <div className="flex gap-1" role="tablist" aria-label="Notes editor">
          <button type="button" role="tab" aria-selected={tab === 'write'} className={tabClass('write')} onClick={() => setTab('write')}>
            <Pencil className="size-3" /> Write
          </button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={tabClass('preview')} onClick={() => setTab('preview')}>
            <Eye className="size-3" /> Preview
          </button>
        </div>
        {tab === 'write' && (
          <div className="flex gap-0.5">
            {TOOLS.map(({ label, icon: Icon, edit }) => (
              <button key={label} type="button" title={label} aria-label={label} onClick={() => apply(edit)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-ink">
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'write' ? (
        <textarea
          id={id}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          className="block min-h-32 w-full resize-y bg-transparent px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:outline-none"
        />
      ) : (
        <div className="min-h-32 px-3.5 py-2.5">
          {value.trim() ? (
            <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
              <Markdown source={value} />
            </Suspense>
          ) : (
            <p className="text-sm text-faint">Nothing to preview yet.</p>
          )}
        </div>
      )}
      <p className="border-t border-line px-3 py-1 text-right text-xs text-faint">
        Markdown supported · {value.length}/{maxLength}
      </p>
    </div>
  );
}

// Read-only rendering of saved notes, loaded on demand
export function Notes({ source }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading notes…</p>}>
      <Markdown source={source} />
    </Suspense>
  );
}
