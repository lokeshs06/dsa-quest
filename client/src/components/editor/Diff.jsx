import { diff } from '../../lib/diff.js';

const BOX = 'whitespace-pre-wrap break-all rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm text-ink';

function Parts({ parts, mark }) {
  return parts.map((p, i) => (p.changed ? <mark key={i} className={`rounded-sm px-px text-ink ${mark}`}>{p.text}</mark> : <span key={i}>{p.text}</span>));
}

// A labelled, read-only box, like the Input / Output / Expected boxes under LeetCode's editor
export function Field({ label, children, tone = '' }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className={`${BOX} ${tone}`}>{children === '' || children == null ? <span className="text-faint">(empty)</span> : children}</div>
    </div>
  );
}

// Output with what's wrong highlighted red, Expected with what was missing highlighted green
export function OutputExpected({ actual, expected, error }) {
  if (error) {
    return (
      <>
        <Field label="Error" tone="border-revision/40 bg-revision/10 text-revision">
          {error}
        </Field>
        <Field label="Expected">{expected}</Field>
      </>
    );
  }
  const d = diff(actual ?? '', expected ?? '');
  return (
    <>
      <Field label="Output">
        <Parts parts={d.actual} mark="bg-revision/35" />
      </Field>
      <Field label="Expected">
        <Parts parts={d.expected} mark="bg-solved/35" />
      </Field>
    </>
  );
}
