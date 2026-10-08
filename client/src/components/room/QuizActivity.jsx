import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { QuizBuilder } from '../quiz/QuizBuilder.jsx';
import { QuizStage } from '../quiz/QuizStage.jsx';

// The quiz is an activity inside the room, not a page: it renders in the room, driven by socket events, and the
// URL never changes. With no quiz open it shows the quiz library; with one open, the live game.
export function QuizActivity({ socketRef, connected, roomId, user, members, onLiveChange }) {
  const [quiz, setQuiz] = useState(null);
  const skew = useRef(0); // server clock minus this device's clock, so every countdown matches
  // Your locked-in choices, by question, for one quiz only: a new quiz starts with none
  const [answered, setAnswered] = useState({ quizId: null, byQ: {} });
  const [dismissed, setDismissed] = useState(null); // a finished quiz you closed
  const [busy, setBusy] = useState('');

  const live = Boolean(quiz && (quiz.status === 'lobby' || quiz.status === 'active'));
  useEffect(() => {
    onLiveChange?.(live);
  }, [live, onLiveChange]);

  const receive = useCallback((q) => {
    if (!q) return setQuiz(null);
    if (q.serverNow) skew.current = new Date(q.serverNow).getTime() - Date.now();
    return setQuiz(q.status === 'cancelled' ? null : q);
  }, []);

  const emit = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve({ error: 'Not connected' });
        return socket.timeout(20000).emit(event, payload, (err, res) => resolve(err ? { error: 'The server took too long to answer' } : res));
      }),
    [socketRef]
  );

  useEffect(() => {
    const socket = socketRef.current;
    if (!connected || !socket || !roomId) return undefined;
    socket.on('quiz:state', receive);
    emit('quiz:get', { roomId }).then((res) => {
      if (res.error) return;
      receive(res.quiz);
      if (res.quiz) setAnswered({ quizId: res.quiz.id, byQ: Object.fromEntries((res.mine ?? []).map((a) => [a.q, a.choices])) });
    });
    return () => socket.off('quiz:state', receive);
  }, [connected, roomId, emit, socketRef, receive]);

  const act = async (event, payload, label = event) => {
    setBusy(label);
    const res = await emit(event, payload);
    setBusy('');
    if (res.error) toast.error(res.error);
    if (res.quiz !== undefined) receive(res.quiz);
    return res;
  };

  const host = async (payload) => {
    const res = await act('quiz:create', { roomId, ...payload }, 'quiz:create');
    if (!res.error) setDismissed(null);
    return res;
  };

  const onAnswer = async (q, choices) => {
    const res = await emit('quiz:answer', { quizId: quiz.id, q, choices });
    if (res.error) return toast.error(res.error);
    return setAnswered((prev) => ({ quizId: quiz.id, byQ: { ...(prev.quizId === quiz.id ? prev.byQ : {}), [q]: res.choices } }));
  };

  const mineAll = quiz && answered.quizId === quiz.id ? answered.byQ : {};
  const visible = quiz && !(quiz.status === 'finished' && dismissed === quiz.id);

  if (!visible) {
    return <QuizBuilder connected={connected} opening={busy === 'quiz:create'} members={members} user={user} onHost={host} />;
  }

  const roomHostId = members?.find((m) => m.isHost)?.id;
  const isCreator = quiz.creatorId === user?.id;
  return (
    <QuizStage
      quiz={quiz}
      user={user}
      me={quiz.participants.find((p) => p.userId === user?.id)}
      now={() => Date.now() + skew.current}
      mine={quiz.current ? mineAll[quiz.current.index] : undefined}
      mineAll={mineAll}
      canStart={isCreator}
      canControl={isCreator || roomHostId === user?.id}
      busy={busy}
      act={act}
      onAnswer={onAnswer}
      onNew={() => setDismissed(quiz.id)}
      onPlayAgain={() => host({ title: quiz.topic, questions: quiz.questions, hostPlays: quiz.hostPlays, autoAdvance: quiz.autoAdvance, mode: quiz.mode, teamCount: quiz.teams.length || 2 })}
    />
  );
}
