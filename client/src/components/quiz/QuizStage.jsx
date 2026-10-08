import { useEffect, useState } from 'react';
import { Check, Crown, Flame, LoaderCircle, LogIn, Play, RotateCcw, SkipForward, Square, Trophy, Users, X } from 'lucide-react';
import { tileFor } from '../../lib/quizKit.js';
import { Avatar } from '../room/ChatPanel.jsx';
import { Shape } from './Shape.jsx';

// The live game, Kahoot style. Everything shown comes from the server's state; `now` is the server's clock.

function useTicker(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [active]);
}
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`;

export function QuizStage(props) {
  const { quiz } = props;
  useTicker(quiz.status === 'active');
  return (
    <div className="space-y-3 rounded-2xl bg-gradient-to-b from-violet/20 via-panel to-panel p-3 sm:p-4" aria-label="Quiz">
      {quiz.status === 'lobby' && <Lobby {...props} />}
      {quiz.status === 'active' && quiz.phase === 'question' && <Question key={quiz.qIndex} {...props} />}
      {quiz.status === 'active' && quiz.phase === 'reveal' && <Reveal {...props} />}
      {quiz.status === 'active' && quiz.phase === 'scoreboard' && <Scoreboard {...props} />}
      {quiz.status === 'finished' && <Podium {...props} />}
    </div>
  );
}

// ---------------------------------------------------------------- shared pieces

function TopBar({ quiz, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="rounded-full bg-panel-2 px-2.5 py-1 font-semibold text-ink">
        {quiz.qIndex + 1} of {quiz.count}
      </span>
      <span className="truncate">{quiz.topic}</span>
      <span className="ml-auto flex items-center gap-2">{children}</span>
    </div>
  );
}

function HostBar({ quiz, canControl, busy, act, next, nextLabel }) {
  if (!canControl) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 pt-3">
      <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => act('quiz:end', { quizId: quiz.id }, 'end')} disabled={Boolean(busy)}>
        <Square className="size-3.5" /> End quiz
      </button>
      {next && (
        <button type="button" className="btn-primary px-4 py-1.5" onClick={() => act('quiz:next', { quizId: quiz.id }, 'next')} disabled={busy === 'next'}>
          {busy === 'next' ? <LoaderCircle className="size-4 animate-spin" /> : <SkipForward className="size-4" />} {nextLabel}
        </button>
      )}
    </div>
  );
}

function AutoNote({ quiz, now, what }) {
  if (!quiz.autoAdvance || !quiz.phaseEndsAt) return null;
  const s = Math.max(0, Math.ceil((new Date(quiz.phaseEndsAt).getTime() - now()) / 1000));
  return <span className="text-xs text-faint">{what} in {s}s</span>;
}

function TimerRing({ left, total }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <span className="relative grid size-12 place-items-center" role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} className="fill-none stroke-panel-2" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} className={`fill-none transition-[stroke-dashoffset] duration-200 ${left <= 5 ? 'stroke-revision' : 'stroke-violet'}`} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
      </svg>
      <span className={`font-display text-base font-bold ${left <= 5 ? 'text-revision' : 'text-ink'}`}>{Math.ceil(left)}</span>
    </span>
  );
}

function QuestionText({ text, big = false }) {
  return <p className={`rounded-xl bg-panel-2/80 px-4 py-5 text-center font-display font-bold leading-snug ${big ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'}`}>{text}</p>;
}

// How many picked each answer, as one small bar chart (the tiles below carry the same numbers for screen readers)
function AnswerChart({ question }) {
  const max = Math.max(1, ...question.counts);
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5" aria-hidden>
      {question.options.map((_, i) => {
        const tile = tileFor(question.type, i);
        const right = question.answers.includes(i);
        return (
          <div key={i} className="flex w-12 flex-col items-center gap-1 sm:w-16">
            <span className="font-display text-lg font-bold">{question.counts[i]}</span>
            <div className="flex h-20 w-full items-end">
              <div className={`w-full rounded-t-md ${tile.bar} ${right ? '' : 'opacity-40'} transition-[height] duration-700`} style={{ height: `${Math.max(4, (question.counts[i] / max) * 100)}%` }} />
            </div>
            <div className={`flex w-full items-center justify-center gap-1 rounded-b-md py-1 text-white ${tile.bg} ${right ? '' : 'opacity-40'}`}>
              <Shape shape={tile.shape} className="size-3.5" />
              {right && <Check className="size-3.5" strokeWidth={3} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tile({ type, index, text, onClick, disabled, chosen, dim, mark, count }) {
  const tile = tileFor(type, index);
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={chosen}
        aria-label={`${text}${mark === 'right' ? ', correct answer' : ''}${count !== undefined ? `, ${count} picked it` : ''}`}
        className={`flex min-h-16 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-semibold text-white shadow-[inset_0_-4px_0_rgb(0_0_0/0.25)] transition ${tile.bg} ${dim ? 'opacity-35' : ''} ${chosen ? 'ring-4 ring-white/90 ring-offset-2 ring-offset-panel' : ''} ${disabled ? 'cursor-default' : 'hover:brightness-110 active:translate-y-px'}`}
      >
        <Shape shape={tile.shape} className="size-7" />
        <span className="flex-1 break-words">{text}</span>
        {mark === 'right' && <Check className="size-6 shrink-0" strokeWidth={3} />}
        {mark === 'wrong' && <X className="size-6 shrink-0" strokeWidth={3} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- lobby

function Lobby({ quiz, me, user, canStart, canControl, busy, act }) {
  const allowed = !quiz.invited.length || quiz.invited.includes(user?.id) || quiz.creatorId === user?.id;
  const players = quiz.participants;
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-soft">Quiz lobby</p>
        <h2 className="mt-1 font-display text-2xl font-bold">{quiz.topic}</h2>
        <p className="text-sm text-muted">
          {quiz.count} questions · {quiz.mode === 'team' ? `${quiz.teams.length} teams` : 'classic'} · hosted by {quiz.creatorName}
          {quiz.invited.length > 0 && ' · invite only'}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel/80 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Users className="size-4" aria-hidden /> {players.length} {players.length === 1 ? 'player' : 'players'}
          {players.length === 0 && <span className="font-normal text-muted">· waiting for people to join</span>}
        </p>
        {quiz.mode === 'team' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {quiz.teams.map((t) => {
              const people = players.filter((p) => p.team === t.name);
              return (
                <div key={t.name} className="rounded-lg border border-line p-2">
                  <p className="mb-1 flex items-center justify-between text-xs font-semibold">
                    {t.name}
                    <span className="text-faint">
                      {people.length}
                      {quiz.teamSize ? ` / ${quiz.teamSize}` : ''}
                    </span>
                  </p>
                  <ul className="flex min-h-6 flex-wrap gap-1">
                    {people.map((p) => (
                      <li key={p.userId} className="chip border-line text-xs">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                  {me && me.team !== t.name && (
                    <button type="button" className="btn-ghost mt-2 w-full py-1 text-xs" onClick={() => act('quiz:team:join', { quizId: quiz.id, team: t.name })}>
                      Join {t.name}
                    </button>
                  )}
                </div>
              );
            })}
            {players.some((p) => !p.team) && <p className="text-xs text-faint sm:col-span-2">No team yet: {players.filter((p) => !p.team).map((p) => p.name).join(', ')}. They’ll be shared out when the quiz starts.</p>}
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {players.map((p) => (
              <li key={p.userId} className="flex items-center gap-1.5 rounded-full border border-line bg-panel-2/60 py-1 pl-1 pr-3 text-sm font-medium">
                <Avatar name={p.name} size="size-6" /> {p.name}
                {p.userId === quiz.creatorId && <Crown className="size-3 text-progress" aria-label="Host" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {!me && allowed && (
          <button type="button" className="btn-primary px-6 py-2.5 text-base" onClick={() => act('quiz:join', { quizId: quiz.id }, 'join')} disabled={busy === 'join'}>
            <LogIn className="size-4" /> Join the quiz
          </button>
        )}
        {!me && !allowed && <p className="text-sm text-muted">This quiz is invite only.</p>}
        {me && !canStart && <p className="text-sm text-muted">You’re in. Waiting for {quiz.creatorName} to start…</p>}
        {me && !canStart && (
          <button type="button" className="btn-ghost" onClick={() => act('quiz:leave', { quizId: quiz.id })}>
            Leave
          </button>
        )}
        {canStart && (
          <button type="button" className="btn-primary px-6 py-2.5 text-base" onClick={() => act('quiz:start', { quizId: quiz.id }, 'start')} disabled={busy === 'start' || players.length === 0}>
            {busy === 'start' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} Start the quiz
          </button>
        )}
        {canControl && (
          <button type="button" className="btn-ghost" onClick={() => act('quiz:end', { quizId: quiz.id })}>
            Cancel quiz
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- question

function Question({ quiz, me, now, mine, onAnswer, canControl, busy, act }) {
  const q = quiz.current;
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);
  const opensIn = new Date(quiz.qStartsAt).getTime() - now();
  const left = Math.max(0, (new Date(quiz.qEndsAt).getTime() - now()) / 1000);
  const locked = mine; // your locked-in choices for this question, if any
  const playing = Boolean(me);
  const multi = q.type === 'multi';

  const send = async (choices) => {
    setSending(true);
    await onAnswer(q.index, choices);
    setSending(false);
  };
  const choose = (i) => {
    if (!playing || locked || sending || left <= 0) return;
    if (multi) setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
    else send([i]);
  };

  // The question on its own first, so everyone reads it before the answers appear
  if (opensIn > 0) {
    return (
      <div className="space-y-4 py-2">
        <TopBar quiz={quiz}>{q.points === 2 && <span className="rounded-full bg-progress/20 px-2 py-0.5 font-semibold text-progress">Double points</span>}</TopBar>
        <QuestionText text={q.q} big />
        <div className="mx-auto h-2 max-w-sm overflow-hidden rounded-full bg-panel-2" aria-hidden>
          <div className="h-full rounded-full bg-violet transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, (opensIn / 3000) * 100))}%` }} />
        </div>
        <p className="text-center text-sm text-muted">Get ready…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TopBar quiz={quiz}>
        {q.points === 2 && <span className="rounded-full bg-progress/20 px-2 py-0.5 font-semibold text-progress">Double points</span>}
        {q.points === 0 && <span className="rounded-full bg-panel-2 px-2 py-0.5 font-semibold">No points</span>}
        <span>
          <strong className="text-ink">{quiz.answeredCount}</strong> of {quiz.participants.length} answered
        </span>
        <TimerRing left={left} total={q.timeLimit} />
      </TopBar>
      <QuestionText text={q.q} />
      {multi && playing && !locked && <p className="text-center text-xs text-muted">Pick every correct answer, then submit.</p>}

      <div className={`grid gap-2 ${q.options.length > 2 || q.type !== 'truefalse' ? 'sm:grid-cols-2' : 'grid-cols-2'}`}>
        {q.options.map((o, i) => {
          const chosen = (locked ?? picked).includes(i);
          return <Tile key={i} type={q.type} index={i} text={o} onClick={() => choose(i)} disabled={!playing || Boolean(locked) || left <= 0} chosen={chosen} dim={Boolean(locked) && !chosen} />;
        })}
      </div>

      {multi && playing && !locked && (
        <div className="flex justify-center">
          <button type="button" className="btn-primary px-6" onClick={() => send(picked)} disabled={!picked.length || sending || left <= 0}>
            {sending && <LoaderCircle className="size-4 animate-spin" />} Submit answer
          </button>
        </div>
      )}
      {locked && (
        <p className="text-center text-sm font-semibold" role="status">
          Answer locked in. Waiting for the others…
        </p>
      )}
      {!playing && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          {canControl ? <span>You’re hosting. Players answer on their screens.</span> : <span>You’re watching.</span>}
          {!canControl && (
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => act('quiz:join', { quizId: quiz.id }, 'join')}>
              <LogIn className="size-3.5" /> Join in
            </button>
          )}
        </div>
      )}
      <HostBar quiz={quiz} canControl={canControl} busy={busy} act={act} next nextLabel="Show answer" />
    </div>
  );
}

// ---------------------------------------------------------------- the answer

function Reveal({ quiz, user, now, mine: picked = [], canControl, busy, act }) {
  const q = quiz.current;
  const result = quiz.round?.find((r) => r.userId === user?.id);
  const before = quiz.participants.find((p) => p.userId === user?.id);
  const last = quiz.qIndex >= quiz.count - 1;
  return (
    <div className="space-y-3">
      <TopBar quiz={quiz}>
        <AutoNote quiz={quiz} now={now} what={last ? 'Results' : 'Scoreboard'} />
      </TopBar>
      <QuestionText text={q.q} />
      {result && <RoundBanner mine={result} streakNow={before?.streak ?? 0} />}
      <AnswerChart question={q} />
      <div className={`grid gap-2 ${q.type === 'truefalse' ? 'grid-cols-2' : 'sm:grid-cols-2'}`}>
        {q.options.map((o, i) => {
          const right = q.answers.includes(i);
          return <Tile key={i} type={q.type} index={i} text={o} disabled dim={!right} chosen={picked.includes(i)} mark={right ? 'right' : 'wrong'} count={q.counts[i]} />;
        })}
      </div>
      {q.explanation && <p className="rounded-xl border border-line bg-panel/80 px-4 py-3 text-sm text-muted">{q.explanation}</p>}
      <HostBar quiz={quiz} canControl={canControl} busy={busy} act={act} next nextLabel={last ? 'Final results' : 'Scoreboard'} />
    </div>
  );
}

function RoundBanner({ mine, streakNow }) {
  if (!mine.answered) {
    return (
      <p className="rounded-xl bg-panel-2 px-4 py-3 text-center font-semibold" role="status">
        Time’s up! No answer this time.
      </p>
    );
  }
  if (!mine.correct) {
    return (
      <p className="rounded-xl bg-revision/20 px-4 py-3 text-center font-semibold text-revision" role="status">
        Incorrect. Shake it off, next one’s yours.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl bg-solved/20 px-4 py-3 text-center font-semibold text-solved" role="status">
      <span className="flex items-center gap-1.5">
        <Check className="size-5" strokeWidth={3} /> Correct! +{mine.points}
      </span>
      {streakNow >= 2 && (
        <span className="flex items-center gap-1 text-progress">
          <Flame className="size-4" /> Answer streak {streakNow}
        </span>
      )}
    </p>
  );
}

// ---------------------------------------------------------------- scoreboard

function Scoreboard({ quiz, user, now, canControl, busy, act }) {
  const rows = quiz.leaderboard;
  const top = rows.slice(0, 5);
  const best = Math.max(1, rows[0]?.score ?? 1);
  const myRank = quiz.mode === 'team' ? -1 : rows.findIndex((r) => r.userId === user?.id);
  return (
    <div className="space-y-3">
      <TopBar quiz={quiz}>
        <AutoNote quiz={quiz} now={now} what="Next question" />
      </TopBar>
      <h2 className="text-center font-display text-2xl font-bold">Scoreboard</h2>
      <ol className="space-y-1.5">
        {top.map((r, i) => (
          <li key={r.userId ?? r.name} className={`relative overflow-hidden rounded-xl border px-4 py-2.5 ${r.userId === user?.id ? 'border-violet/60' : 'border-line'} bg-panel/80`}>
            <span className="absolute inset-y-0 left-0 bg-violet/15 transition-[width] duration-700" style={{ width: `${(r.score / best) * 100}%` }} aria-hidden />
            <span className="relative flex items-center gap-3">
              <span className="w-6 font-display font-bold text-muted">{i + 1}</span>
              <span className="flex-1 truncate font-semibold">
                {r.name}
                {r.members && <span className="font-normal text-faint"> · {r.members.join(', ')}</span>}
              </span>
              <span className="font-mono font-semibold">{r.score}</span>
            </span>
          </li>
        ))}
      </ol>
      {myRank >= 5 && (
        <p className="text-center text-sm text-muted">
          You’re {ordinal(myRank + 1)} with {rows[myRank].score} points, {rows[myRank - 1].score - rows[myRank].score} behind {rows[myRank - 1].name}.
        </p>
      )}
      <HostBar quiz={quiz} canControl={canControl} busy={busy} act={act} next nextLabel="Next question" />
    </div>
  );
}

// ---------------------------------------------------------------- the end

function Podium({ quiz, user, mineAll, canControl, onPlayAgain, onNew, busy }) {
  const [review, setReview] = useState(false);
  const rows = quiz.leaderboard;
  const order = [rows[1], rows[0], rows[2]];
  const heights = ['h-24', 'h-32', 'h-16'];
  const places = [2, 1, 3];
  const myIndex = rows.findIndex((r) => r.userId === user?.id || (quiz.mode === 'team' && r.members?.includes(user?.name)));
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-soft">Final results</p>
        <h2 className="font-display text-2xl font-bold">{quiz.topic}</h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-muted">Nobody played this time.</p>
      ) : (
        <div className="flex items-end justify-center gap-2 sm:gap-4" aria-label="Podium">
          {order.map((r, i) =>
            r ? (
              <div key={r.userId ?? r.name} className="flex w-28 flex-col items-center gap-1 text-center sm:w-36">
                {places[i] === 1 && <Trophy className="size-7 text-progress" aria-hidden />}
                <Avatar name={r.name} size="size-10" />
                <p className="w-full truncate text-sm font-semibold">{r.name}</p>
                <p className="font-mono text-xs text-muted">{r.score} pts</p>
                <div className={`flex w-full items-start justify-center rounded-t-xl pt-2 font-display text-2xl font-bold text-white ${heights[i]} ${places[i] === 1 ? 'bg-[#c88a00]' : places[i] === 2 ? 'bg-[#8a93b8]' : 'bg-[#b0643a]'}`}>{places[i]}</div>
              </div>
            ) : (
              <div key={`empty-${i}`} className="w-28 sm:w-36" />
            )
          )}
        </div>
      )}

      {myIndex >= 0 && (
        <p className="text-center text-sm">
          {quiz.mode === 'team' ? 'Your team' : 'You'} finished <strong>{ordinal(myIndex + 1)}</strong> of {rows.length}
          {quiz.mode !== 'team' && ` with ${rows[myIndex].score} points and ${rows[myIndex].correct} right`}.
        </p>
      )}
      {rows.length > 3 && (
        <ol start={4} className="mx-auto max-w-md space-y-1 text-sm">
          {rows.slice(3, 10).map((r, i) => (
            <li key={r.userId ?? r.name} className={`flex justify-between rounded-lg px-3 py-1.5 ${r.userId === user?.id ? 'bg-violet/15' : 'bg-panel/80'}`}>
              <span>
                {i + 4}. {r.name}
              </span>
              <span className="font-mono">{r.score}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => setReview((v) => !v)} aria-expanded={review}>
          {review ? 'Hide answers' : 'Review answers'}
        </button>
        {canControl && (
          <button type="button" className="btn-primary" onClick={onPlayAgain} disabled={busy === 'quiz:create'}>
            <RotateCcw className="size-4" /> Play again
          </button>
        )}
        <button type="button" className={canControl ? 'btn-ghost' : 'btn-primary'} onClick={onNew}>
          New quiz
        </button>
      </div>

      {review && (
        <ol className="space-y-2">
          {quiz.questions.map((q, i) => {
            const picked = mineAll[i];
            const right = picked && picked.length === q.answers.length && picked.every((c) => q.answers.includes(c));
            return (
              <li key={i} className="rounded-xl border border-line bg-panel/80 p-3 text-sm">
                <p className="font-semibold">
                  {i + 1}. {q.q}
                </p>
                <p className="text-solved">Answer: {q.answers.map((a) => q.options[a]).join(', ')}</p>
                {picked && <p className={right ? 'text-solved' : 'text-revision'}>You: {picked.map((a) => q.options[a]).join(', ')}</p>}
                {q.explanation && <p className="text-xs text-muted">{q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
