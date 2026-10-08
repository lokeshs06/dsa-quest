import { useCallback, useEffect, useState } from 'react';
import { Brain, Check, LoaderCircle, Trophy, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFeatures } from '../../lib/features.js';

// The quiz is an activity inside the room, not a page: it renders in the room, driven by socket events,
// and the URL never changes. The server owns the questions, answers, clock and scores.

const TYPES = [
  ['single', 'Multiple choice'],
  ['truefalse', 'True / False'],
  ['multi', 'Several correct'],
];
const letter = (i) => String.fromCharCode(65 + i);
const seconds = (ms) => Math.max(0, Math.ceil(ms / 1000));
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function QuizActivity({ socketRef, connected, roomId, user, members, onLiveChange }) {
  const [quiz, setQuiz] = useState(null);
  // Lets the room show a "Live" badge on Quiz while one is open or running
  const live = Boolean(quiz && (quiz.status === 'lobby' || quiz.status === 'active'));
  useEffect(() => {
    onLiveChange?.(live);
  }, [live, onLiveChange]);
  // Your answers, by question index, for one quiz only: a new quiz starts with none
  const [answered, setAnswered] = useState({ quizId: null, byQ: {} });
  const [creating, setCreating] = useState(false);
  const [dismissed, setDismissed] = useState(null); // id of a finished quiz you closed
  const [busy, setBusy] = useState('');

  const emit = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve({ error: 'Not connected' });
        return socket.timeout(45000).emit(event, payload, (err, res) => resolve(err ? { error: 'The server took too long to answer' } : res));
      }),
    [socketRef]
  );

  useEffect(() => {
    const socket = socketRef.current;
    if (!connected || !socket || !roomId) return undefined;
    const onState = (q) => setQuiz(q.status === 'cancelled' ? null : q);
    socket.on('quiz:state', onState);
    emit('quiz:get', { roomId }).then((res) => {
      if (res.quiz) setQuiz(res.quiz);
      if (res.quiz && res.mine) setAnswered({ quizId: res.quiz.id, byQ: Object.fromEntries(res.mine.map((a) => [a.q, { choices: a.choices, correct: a.correct, points: a.points }])) });
    });
    return () => socket.off('quiz:state', onState);
  }, [connected, roomId, emit, socketRef]);

  const act = async (event, payload, label = event) => {
    setBusy(label);
    const res = await emit(event, payload);
    setBusy('');
    if (res.error) toast.error(res.error);
    if (res.quiz) setQuiz(res.quiz);
    if (res.quiz === null) setQuiz(null);
    return res;
  };

  const mine = quiz && answered.quizId === quiz.id ? answered.byQ : {};
  const setMine = (update) =>
    setAnswered((prev) => {
      const base = prev.quizId === quiz?.id ? prev.byQ : {};
      return { quizId: quiz?.id ?? null, byQ: typeof update === 'function' ? update(base) : update };
    });

  const visible = quiz && !(quiz.status === 'finished' && dismissed === quiz.id);
  const me = quiz?.participants.find((p) => p.userId === user?.id);

  return (
    <section className="panel space-y-3 p-4" aria-label="Quiz">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Brain className="size-4 text-violet-soft" /> Quiz
        </h2>
        {!visible && !creating && (
          <button className="btn-ghost py-1 text-xs" onClick={() => setCreating(true)} disabled={!connected}>
            Create a quiz
          </button>
        )}
      </div>

      {creating && (
        <CreateQuiz
          members={members}
          user={user}
          busy={busy === 'quiz:create'}
          onCancel={() => setCreating(false)}
          onCreate={async (form) => {
            const res = await act('quiz:create', { roomId, ...form }, 'quiz:create');
            if (!res.error) {
              setCreating(false);
              setDismissed(null);
            }
          }}
        />
      )}

      {!visible && !creating && <p className="text-xs text-faint">No quiz running. Create one and everyone in the room can join, alone or in teams.</p>}

      {visible && quiz.status === 'lobby' && <Lobby quiz={quiz} me={me} user={user} busy={busy} act={act} />}
      {visible && quiz.status === 'active' && <Play key={quiz.id} quiz={quiz} me={me} user={user} mine={mine} setMine={setMine} emit={emit} act={act} />}
      {visible && quiz.status === 'finished' && <Result quiz={quiz} mine={mine} user={user} onClose={() => setDismissed(quiz.id)} />}
    </section>
  );
}

function CreateQuiz({ members, user, busy, onCancel, onCreate }) {
  const features = useFeatures();
  const [f, setF] = useState({ topic: '', difficulty: 'Medium', count: 10, minutes: 10, mode: 'individual', types: ['single', 'truefalse', 'multi'], teamCount: 2, teamSize: 0, autoBalance: true, source: 'ai', questionsJson: '' });
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState([]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));
  const toggleType = (t) => setF((x) => ({ ...x, types: x.types.includes(t) ? x.types.filter((y) => y !== t) : [...x.types, t] }));
  const others = (members ?? []).filter((m) => m.id !== user?.id);
  const aiOff = features && !features.ai;
  const source = aiOff ? 'paste' : f.source;

  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-panel-2/40 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({
          topic: f.topic,
          difficulty: f.difficulty,
          count: f.count,
          minutes: f.minutes,
          mode: f.mode,
          types: f.types,
          teamCount: f.teamCount,
          teamSize: f.teamSize,
          autoBalance: f.autoBalance,
          invited: everyone ? [] : picked,
          questionsJson: source === 'paste' ? f.questionsJson : undefined,
        });
      }}
    >
      <div>
        <label htmlFor="qz-topic" className="label">Topic</label>
        <input id="qz-topic" className="field" value={f.topic} onChange={set('topic')} placeholder="e.g. Binary search, Java arrays, Graphs" maxLength={100} required />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label htmlFor="qz-diff" className="label">Difficulty</label>
          <select id="qz-diff" className="field" value={f.difficulty} onChange={set('difficulty')}>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </div>
        <div>
          <label htmlFor="qz-count" className="label">Questions</label>
          <input id="qz-count" type="number" min={3} max={30} className="field" value={f.count} onChange={set('count')} />
        </div>
        <div>
          <label htmlFor="qz-min" className="label">Minutes</label>
          <input id="qz-min" type="number" min={1} max={120} className="field" value={f.minutes} onChange={set('minutes')} />
        </div>
      </div>

      <fieldset>
        <legend className="label">Question types</legend>
        <div className="flex flex-wrap gap-3 text-xs">
          {TYPES.map(([t, label]) => (
            <label key={t} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={f.types.includes(t)} onChange={() => toggleType(t)} /> {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Mode</legend>
        <div className="flex gap-4 text-xs">
          {['individual', 'team'].map((m) => (
            <label key={m} className="inline-flex items-center gap-1.5 capitalize">
              <input type="radio" name="qz-mode" checked={f.mode === m} onChange={() => setF((x) => ({ ...x, mode: m }))} /> {m}
            </label>
          ))}
        </div>
      </fieldset>

      {f.mode === 'team' && (
        <div className="grid grid-cols-3 items-end gap-2">
          <div>
            <label htmlFor="qz-teams" className="label">Teams</label>
            <input id="qz-teams" type="number" min={2} max={6} className="field" value={f.teamCount} onChange={set('teamCount')} />
          </div>
          <div>
            <label htmlFor="qz-size" className="label">Team size (0 = any)</label>
            <input id="qz-size" type="number" min={0} max={25} className="field" value={f.teamSize} onChange={set('teamSize')} />
          </div>
          <label className="inline-flex items-center gap-1.5 pb-2 text-xs">
            <input type="checkbox" checked={f.autoBalance} onChange={(e) => setF((x) => ({ ...x, autoBalance: e.target.checked }))} /> Auto-balance
          </label>
        </div>
      )}

      <fieldset>
        <legend className="label">Who can join</legend>
        <label className="mb-1 inline-flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Everyone in the room
        </label>
        {!everyone && (
          <div className="flex flex-wrap gap-3 text-xs">
            {others.map((m) => (
              <label key={m.id} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={picked.includes(m.id)} onChange={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))} /> {m.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="label">Questions</legend>
        <div className="flex gap-4 text-xs">
          <label className={`inline-flex items-center gap-1.5 ${aiOff ? 'opacity-50' : ''}`}>
            <input type="radio" name="qz-src" disabled={aiOff} checked={source === 'ai'} onChange={() => setF((x) => ({ ...x, source: 'ai' }))} /> Generate with AI
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="qz-src" checked={source === 'paste'} onChange={() => setF((x) => ({ ...x, source: 'paste' }))} /> Paste my own
          </label>
        </div>
        {aiOff && <p className="mt-1 text-xs text-faint">AI question writing needs an Anthropic API key on the server.</p>}
        {source === 'paste' && (
          <textarea
            className="field mt-2 min-h-24 font-mono text-xs"
            value={f.questionsJson}
            onChange={set('questionsJson')}
            placeholder={'{"questions":[{"type":"single","q":"…","options":["a","b","c","d"],"answers":[1],"explanation":"…"}]}'}
            spellCheck={false}
            required
          />
        )}
      </fieldset>

      <div className="flex gap-2">
        <button className="btn-primary" type="submit" disabled={busy || f.types.length === 0}>
          {busy && <LoaderCircle className="size-4 animate-spin" />} {busy ? 'Writing questions…' : 'Create quiz'}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Summary({ quiz }) {
  return (
    <p className="text-xs text-muted">
      <strong className="text-ink">{quiz.topic}</strong> · {quiz.difficulty} · {quiz.count} questions · {Math.round(quiz.durationSec / 60)} min · {quiz.mode} · by {quiz.creatorName}
    </p>
  );
}

function Lobby({ quiz, me, user, busy, act }) {
  const isCreator = quiz.creatorId === user?.id;
  const allowed = !quiz.invited.length || quiz.invited.includes(user?.id) || isCreator;
  return (
    <div className="space-y-3 text-sm">
      <Summary quiz={quiz} />
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Users className="size-3.5" /> {quiz.participants.length} joined{quiz.invited.length > 0 && ' · invite only'}
      </p>

      {quiz.mode === 'team' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {quiz.teams.map((t) => {
            const people = quiz.participants.filter((p) => p.team === t.name);
            return (
              <div key={t.name} className="rounded-lg border border-line p-2">
                <p className="mb-1 flex items-center justify-between text-xs font-semibold">
                  {t.name} <span className="text-faint">{people.length}{quiz.teamSize ? ` / ${quiz.teamSize}` : ''}</span>
                </p>
                <ul className="min-h-5 text-xs text-muted">{people.map((p) => <li key={p.userId}>{p.name}</li>)}</ul>
                {me && me.team !== t.name && (
                  <button className="btn-ghost mt-1 py-0.5 text-xs" onClick={() => act('quiz:team:join', { quizId: quiz.id, team: t.name })}>Join {t.name}</button>
                )}
              </div>
            );
          })}
          {quiz.participants.some((p) => !p.team) && (
            <p className="text-xs text-faint sm:col-span-2">Without a team: {quiz.participants.filter((p) => !p.team).map((p) => p.name).join(', ')}. The creator can auto-balance them when starting.</p>
          )}
        </div>
      ) : (
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {quiz.participants.map((p) => <li key={p.userId} className="chip border-line">{p.name}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {!me && allowed && <button className="btn-primary" onClick={() => act('quiz:join', { quizId: quiz.id })}>Join quiz</button>}
        {!me && !allowed && <p className="text-xs text-faint">This quiz is invite-only.</p>}
        {me && !isCreator && <button className="btn-ghost" onClick={() => act('quiz:leave', { quizId: quiz.id })}>Leave</button>}
        {isCreator && (
          <button className="btn-primary" onClick={() => act('quiz:start', { quizId: quiz.id }, 'start')} disabled={busy === 'start'}>
            {busy === 'start' && <LoaderCircle className="size-4 animate-spin" />} Start quiz
          </button>
        )}
        {isCreator && <button className="btn-ghost" onClick={() => act('quiz:end', { quizId: quiz.id })}>Cancel quiz</button>}
      </div>
    </div>
  );
}

function Board({ quiz, user }) {
  return (
    <ol className="space-y-1 text-xs">
      {quiz.leaderboard.map((row, i) => (
        <li key={row.userId ?? row.name} className={`flex items-center justify-between rounded-md px-2 py-1 ${row.userId === user?.id ? 'bg-cyan/10' : 'bg-panel-2/50'}`}>
          <span>
            {['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} <strong>{row.name}</strong>
            {row.members && <span className="text-faint"> · {row.members.join(', ')}</span>}
          </span>
          <span className="font-mono">{row.score}</span>
        </li>
      ))}
    </ol>
  );
}

function Play({ quiz, me, user, mine, setMine, emit, act }) {
  const now = useNow(true);
  const startsIn = new Date(quiz.startsAt).getTime() - now;
  const left = seconds(new Date(quiz.endsAt).getTime() - now);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);
  const answered = Object.keys(mine).length;
  const isCreator = quiz.creatorId === user?.id;
  const q = quiz.questions[index];
  const result = mine[index];

  if (!me) {
    return (
      <div className="space-y-2 text-sm">
        <Summary quiz={quiz} />
        <p className="text-xs text-muted">This quiz has started. You didn’t join, so you can watch the leaderboard.</p>
        <Board quiz={quiz} user={null} />
        <p className="text-xs text-faint">{clock(left)} left</p>
      </div>
    );
  }
  if (startsIn > 0) {
    return (
      <div className="space-y-1 py-6 text-center">
        <p className="text-xs text-muted">Get ready…</p>
        <p className="font-display text-5xl font-bold text-cyan" aria-live="assertive">{Math.ceil(startsIn / 1000)}</p>
      </div>
    );
  }

  const submit = async () => {
    setSending(true);
    const res = await emit('quiz:answer', { quizId: quiz.id, q: index, choices: picked });
    setSending(false);
    if (res.error) return toast.error(res.error);
    setMine((m) => ({ ...m, [index]: { choices: picked, ...res } }));
    setPicked([]);
    return undefined;
  };

  const toggle = (i) => {
    if (result) return;
    if (q.type === 'multi') setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
    else setPicked([i]);
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Summary quiz={quiz} />
        <span className={`font-mono font-semibold ${left <= 30 ? 'text-revision' : 'text-ink'}`}>{clock(left)}</span>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Questions">
        {quiz.questions.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={index === i}
            onClick={() => { setIndex(i); setPicked([]); }}
            className={`size-7 rounded-md border text-xs font-semibold ${index === i ? 'border-cyan bg-cyan/20 text-cyan' : mine[i] ? (mine[i].correct ? 'border-solved/40 text-solved' : 'border-revision/40 text-revision') : 'border-line text-muted'}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-faint">Question {index + 1} of {quiz.count}{q.type === 'multi' ? ' · pick all that apply' : ''}</p>
        <p className="font-semibold">{q.q}</p>
        <ul className="space-y-1.5">
          {q.options.map((o, i) => {
            const chosen = (result ? result.choices : picked).includes(i);
            const right = result?.answers?.includes(i);
            return (
              <li key={i}>
                <button
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${result ? (right ? 'border-solved/50 bg-solved/10' : chosen ? 'border-revision/50 bg-revision/10' : 'border-line') : chosen ? 'border-cyan bg-cyan/10' : 'border-line hover:bg-panel-2'}`}
                  onClick={() => toggle(i)}
                  disabled={Boolean(result)}
                  aria-pressed={chosen}
                >
                  <span className="font-mono text-xs text-muted">{letter(i)}</span> {o}
                  {result && right && <Check className="ml-auto size-4 text-solved" />}
                  {result && chosen && !right && <X className="ml-auto size-4 text-revision" />}
                </button>
              </li>
            );
          })}
        </ul>
        {result ? (
          <p className={`text-xs ${result.correct ? 'text-solved' : 'text-revision'}`}>
            {result.correct ? `Correct! +${result.points}` : 'Not quite.'} {result.explanation}
          </p>
        ) : (
          <button className="btn-primary" onClick={submit} disabled={picked.length === 0 || sending}>
            {sending && <LoaderCircle className="size-4 animate-spin" />} Submit answer
          </button>
        )}
        {result && index < quiz.count - 1 && <button className="btn-ghost" onClick={() => { setIndex(index + 1); setPicked([]); }}>Next question</button>}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-muted">Leaderboard · you answered {answered}/{quiz.count}</p>
        <Board quiz={quiz} user={{ id: me.userId }} />
      </div>
      {isCreator && <button className="btn-ghost" onClick={() => act('quiz:end', { quizId: quiz.id })}>End now</button>}
    </div>
  );
}

function Result({ quiz, mine, user, onClose }) {
  const [review, setReview] = useState(false);
  const total = quiz.participants.find((p) => p.userId === user?.id);
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Trophy className="size-4 text-progress" /> Quiz result
      </p>
      <Summary quiz={quiz} />
      <Board quiz={quiz} user={user} />
      {total && <p className="text-xs text-muted">You scored <strong className="text-ink">{total.score}</strong> points{quiz.mode === 'team' && total.team ? ` for ${total.team}` : ''}.</p>}
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => setReview((r) => !r)}>{review ? 'Hide answers' : 'Review answers'}</button>
        <button className="btn-primary" onClick={onClose}>Back to the room</button>
      </div>
      {review && (
        <ol className="space-y-3">
          {quiz.questions.map((q, i) => (
            <li key={i} className="rounded-lg border border-line p-2 text-xs">
              <p className="font-semibold">{i + 1}. {q.q}</p>
              <p className="text-solved">Answer: {q.answers.map((a) => q.options[a]).join(', ')}</p>
              {mine[i] && <p className={mine[i].correct ? 'text-solved' : 'text-revision'}>You: {mine[i].choices.map((a) => q.options[a]).join(', ')}</p>}
              {q.explanation && <p className="text-muted">{q.explanation}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
