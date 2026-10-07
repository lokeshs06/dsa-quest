import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, LoaderCircle, Swords } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api.js';
import { DifficultyChip, PatternChip } from '../ui.jsx';
import { Oracle } from '../Oracle.jsx';
import { Notes } from '../MarkdownField.jsx';
import { TestCaseImport } from '../TestCaseImport.jsx';

const Block = ({ title, children }) => (
  <section className="space-y-1.5">
    <h3 className="text-sm font-semibold text-ink">{title}</h3>
    {children}
  </section>
);

// The left pane's first tab: what the problem is, worked examples, and your own study notes
export function Description({ problem, onJudgeChange, onGenerate }) {
  const navigate = useNavigate();
  const [challenging, setChallenging] = useState(false);
  const judge = problem.judge;
  const fn = judge && judge.kind !== 'stdin';
  const hasApproach = problem.bruteForce || problem.optimal || problem.timeComplexity || problem.spaceComplexity;

  const handleChallenge = async () => {
    setChallenging(true);
    try {
      const { data } = await api.post('/battles', {
        problemOrder: problem.order || 1,
        problemTitle: problem.title,
      });
      navigate(`/room/${data.battle.roomCode}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChallenging(false);
    }
  };

  return (
    <div className="space-y-5 text-sm">
      <div>
        <h1 className="text-xl font-bold">{problem.originalTitle || problem.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DifficultyChip difficulty={problem.difficulty} />
          <PatternChip pattern={problem.pattern} />
          {problem.link && (
            <a href={problem.link} target="_blank" rel="noreferrer" className="chip border-line text-muted hover:text-ink">
              <ExternalLink className="size-3" /> Open problem
            </a>
          )}
          <button
            type="button"
            onClick={handleChallenge}
            disabled={challenging}
            className="chip border-amber-500/40 bg-gradient-to-r from-red-600/20 via-amber-600/20 to-violet-600/20 hover:from-red-600/35 hover:via-amber-600/35 hover:to-violet-600/35 text-amber-300 font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Challenge a friend to a 1v1 battle on this problem"
          >
            {challenging ? <LoaderCircle className="size-3 animate-spin text-amber-400" /> : <Swords className="size-3 text-amber-400" />}
            ⚔️ Challenge a Friend
          </button>
        </div>
      </div>

      {fn && (
        <p className="leading-relaxed text-muted">
          Write the function <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-xs text-ink">{judge.functionName.python}</code> (or the equivalent in your language). Run checks the examples below; Submit also checks {judge.hiddenCount} hidden test cases.
        </p>
      )}

      {judge?.kind === 'stdin' && (judge.inputFormat || judge.outputFormat) && (
        <Block title="Input and output">
          {judge.inputFormat && (
            <p className="leading-relaxed text-muted">
              <span className="font-semibold text-ink">Input: </span>
              {judge.inputFormat}
            </p>
          )}
          {judge.outputFormat && (
            <p className="leading-relaxed text-muted">
              <span className="font-semibold text-ink">Output: </span>
              {judge.outputFormat}
            </p>
          )}
        </Block>
      )}

      {judge?.visibleCases.length > 0 &&
        judge.visibleCases.map((c, i) => (
          <Block key={i} title={`Example ${i + 1}`}>
            <div className="space-y-1 rounded-lg border-l-2 border-line bg-panel-2/60 px-3 py-2 font-mono text-xs">
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-muted">Input: </span>
                {c.input}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-muted">Output: </span>
                {c.output}
              </p>
              {c.explanation && (
                <p className="font-sans">
                  <span className="font-semibold text-muted">Explanation: </span>
                  {c.explanation}
                </p>
              )}
            </div>
          </Block>
        ))}

      {problem.keyConcept && (
        <Block title="Key concept">
          <p className="leading-relaxed text-muted">{problem.keyConcept}</p>
        </Block>
      )}

      {hasApproach && (
        <Block title="Approaches">
          {problem.bruteForce && (
            <p className="leading-relaxed text-muted">
              <span className="font-semibold text-progress">Brute force: </span>
              {problem.bruteForce}
            </p>
          )}
          {problem.optimal && (
            <p className="leading-relaxed text-muted">
              <span className="font-semibold text-solved">Optimal: </span>
              {problem.optimal}
            </p>
          )}
          {(problem.timeComplexity || problem.spaceComplexity) && (
            <p className="flex flex-wrap gap-2 pt-1">
              {problem.timeComplexity && <span className="chip border-line text-muted">Time {problem.timeComplexity}</span>}
              {problem.spaceComplexity && <span className="chip border-line text-muted">Space {problem.spaceComplexity}</span>}
            </p>
          )}
        </Block>
      )}

      {problem.notes && (
        <Block title="Your notes">
          <Notes source={problem.notes} />
        </Block>
      )}

      {!fn && <TestCaseImport problem={problem} onChange={onJudgeChange} onGenerate={onGenerate} />}

      <Block title="🔮 The Oracle">
        <Oracle key={problem.id} problemId={problem.id} />
      </Block>
    </div>
  );
}
