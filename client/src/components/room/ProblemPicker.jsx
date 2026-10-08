import { DIFFICULTIES } from '../../lib/constants.js';
import { useBattleProblems } from '../../lib/problemChoice.js';

// Which problem a battle uses: any random one, a random one of a difficulty, or a specific one
export function ProblemPicker({ value, onChange, disabled, className = '' }) {
  const problems = useBattleProblems();
  const levels = DIFFICULTIES.filter((d) => problems.some((p) => p.difficulty === d));
  return (
    <label className={`block ${className}`}>
      <span className="label">Problem</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="random">Surprise me (random)</option>
        {levels.map((d) => (
          <option key={d} value={d}>
            Random {d.toLowerCase()} problem
          </option>
        ))}
        {levels.map((d) => (
          <optgroup key={d} label={d}>
            {problems
              .filter((p) => p.difficulty === d)
              .map((p) => (
                <option key={p.order} value={String(p.order)}>
                  {p.order}. {p.title}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
