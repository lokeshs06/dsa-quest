import { DifficultyChip, StatusPill } from '../ui.jsx';

// A read-only look at a room-mate's quest map: titles and status only
export function MemberMap({ map }) {
  const byTopic = new Map();
  for (const p of map.problems) {
    const topic = p.topic || 'Arrays';
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(p);
  }
  const groups = [...byTopic];
  if (!groups.length) return <p className="text-muted">Nothing on this quest map yet.</p>;
  return (
    <div className="space-y-5">
      <p className="text-xs text-faint">Read-only. Only titles and status are shared.</p>
      {groups.map(([topic, problems]) => (
        <section key={topic}>
          <h3 className="mb-2 flex items-baseline gap-2 font-display font-semibold">
            {topic}
            <span className="text-xs font-normal text-muted">
              {problems.filter((p) => p.status === 'Solved').length}/{problems.length} cleared
            </span>
          </h3>
          <ul className="space-y-1.5">
            {problems.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {p.link ? (
                    <a href={p.link} target="_blank" rel="noreferrer" className="truncate hover:text-cyan hover:underline">
                      {p.title}
                    </a>
                  ) : (
                    <span className="truncate">{p.title}</span>
                  )}
                </span>
                <span className="flex gap-1.5">
                  <DifficultyChip difficulty={p.difficulty} />
                  <StatusPill status={p.status} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
