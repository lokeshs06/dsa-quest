import { lazy, Suspense } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Play,
  Send,
  ShieldAlert,
  Swords,
  Timer,
  WifiOff,
} from 'lucide-react';
import { DifficultyChip } from '../ui.jsx';
import { LoadingScreen } from '../Feedback.jsx';
import { RoomChat } from './RoomLobby.jsx';

const Monaco = lazy(() => import('@monaco-editor/react'));

const LANGUAGES = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rust: 'Rust',
};

export function BattleView({
  roomCode,
  timerText,
  user,
  opponentPlayer,
  myStatus,
  opponentStatus,
  opponentDisconnected,
  disconnectCountdown,
  voiceEnabled,
  voiceStatus,
  onToggleMute,
  onLeaveVoice,
  onJoinVoice,
  warnings,
  isBattleMode,
  onToggleFullscreen,
  showProblemDrawer,
  onToggleProblemDrawer,
  battle,
  judgeInfo,
  showOpponentCode,
  mobileTab,
  onMobileTabChange,
  myLanguage,
  onLanguageChange,
  myCode,
  onCodeChange,
  myEditorRef,
  runningAction,
  onRun,
  onSubmit,
  consoleOpen,
  onToggleConsole,
  myRunResult,
  mySubmitResult,
  opponentLanguage,
  opponentCode,
  opponentProgress,
  opponentCursor,
  oppEditorRef,
  theme,
  roomChatEnabled,
  battleChatOpen,
  onToggleBattleChat,
  chatMessages,
  chatDraft,
  onChatDraftChange,
  onSendChat,
  chatBottomRef,
  connected,
  onExit,
  exiting,
}) {
  return (
    <div className={`flex flex-col gap-2 min-h-screen ${isBattleMode ? 'fixed inset-0 z-50 bg-abyss p-3' : 'pb-8'} animate-in fade-in duration-200`}>
      {/* Disconnection Banner */}
      {opponentDisconnected && (
        <div className="p-3 bg-red-950/80 border border-red-500/60 rounded-xl text-red-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <WifiOff className="size-4 text-red-400 animate-pulse" />
            <span>
              <strong>Opponent disconnected!</strong> Waiting for reconnection... (Forfeits in {disconnectCountdown}s)
            </span>
          </div>
          <span className="font-mono font-bold text-sm">{disconnectCountdown}s</span>
        </div>
      )}

      {/* Arena Navigation & Status Header */}
      <header className="panel px-3 py-2 flex flex-wrap items-center justify-between gap-3 shadow-md bg-panel/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-bold uppercase inline-flex items-center gap-1">
              <Swords className="size-3" /> CHALLENGE ROOM
            </span>
            <span className="text-xs font-semibold text-ink font-mono bg-panel-2 px-2 py-0.5 rounded">
              #{roomCode}
            </span>
          </div>
        </div>

        {/* Server Authoritative Live Timer */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-panel-2 border border-line text-sm font-mono font-bold text-amber-400 shadow-inner">
          <Timer className="size-4" />
          <span>{timerText}</span>
        </div>

        {/* Persistent Voice Controls inside Battle */}
        {voiceEnabled && (
          <div className="flex items-center gap-2 bg-panel-2/60 border border-line rounded-lg px-2.5 py-1 text-xs">
            {voiceStatus.inVoice ? (
              <>
                <button
                  onClick={onToggleMute}
                  className={`flex items-center gap-1 font-semibold ${
                    voiceStatus.isMuted ? 'text-revision' : 'text-solved'
                  }`}
                  title="Toggle Microphone"
                >
                  {voiceStatus.isMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  {voiceStatus.isMuted ? 'Muted' : 'Voice ON'}
                </button>
                <button
                  onClick={onLeaveVoice}
                  className="text-muted hover:text-ink text-[11px] ml-1"
                  title="Leave Voice"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={onJoinVoice}
                className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
              >
                <Mic className="size-3.5" /> Join Voice
              </button>
            )}
          </div>
        )}

        {/* Status Indicators & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onExit}
            disabled={exiting}
            className="btn-ghost inline-flex items-center gap-1 border border-revision/40 py-1 text-xs font-semibold text-revision hover:bg-revision/10"
            title="Leave this battle. Your opponent wins."
          >
            {exiting ? <LoaderCircle className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
            {exiting ? 'Leaving…' : 'Exit Battle'}
          </button>
          {roomChatEnabled && (
            <button
              onClick={onToggleBattleChat}
              className={`btn-ghost py-1 text-xs inline-flex items-center gap-1 ${
                battleChatOpen ? 'text-amber-400' : 'text-muted'
              }`}
              title="Toggle In-Room Chat"
            >
              <MessageSquare className="size-3.5" />
              Chat
            </button>
          )}

          <button
            onClick={onToggleProblemDrawer}
            className="btn-ghost py-1 text-xs inline-flex items-center gap-1"
            title="Toggle Problem Details"
          >
            {showProblemDrawer ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            Problem
          </button>

          <span
            className={`chip text-xs font-semibold inline-flex items-center gap-1 ${
              warnings > 0 ? 'border-red-500/50 bg-red-500/20 text-red-300' : 'border-line text-muted'
            }`}
            title="Anti-cheat warnings"
          >
            <ShieldAlert className="size-3" />
            {warnings}/3
          </span>

          <button
            onClick={onToggleFullscreen}
            className="btn-ghost py-1 text-xs inline-flex items-center gap-1"
            title="Fullscreen Battle Mode"
          >
            {isBattleMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </header>

      {/* Collapsible Problem Details Box */}
      {showProblemDrawer && (
        <div className="panel p-4 text-xs space-y-3 bg-panel-2/70 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <h3 className="font-bold text-sm text-ink">{battle?.problem?.title}</h3>
              {judgeInfo?.doc && <p className="text-muted text-[11px]">{judgeInfo.doc}</p>}
              {battle?.problem?.link && (
                <a href={battle.problem.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan hover:underline">
                  Full problem statement <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            {battle?.problem?.difficulty && <DifficultyChip difficulty={battle.problem.difficulty} />}
          </div>
          {judgeInfo?.visibleCases && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono">
              {judgeInfo.visibleCases.map((c, i) => (
                <div key={i} className="p-2 rounded bg-abyss/80 border border-line">
                  <p className="text-muted font-bold">Case {i + 1}:</p>
                  <p>Input: {c.input}</p>
                  <p>Expected: {c.output}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mobile Tab Switcher */}
      {showOpponentCode && (
        <div className="lg:hidden flex rounded-xl border border-line bg-panel p-1 text-xs font-semibold">
          <button
            onClick={() => onMobileTabChange('mine')}
            className={`flex-1 py-1.5 rounded-lg text-center transition ${
              mobileTab === 'mine' ? 'bg-panel-2 text-ink shadow' : 'text-muted'
            }`}
          >
            👤 My Code
          </button>
          <button
            onClick={() => onMobileTabChange('opponent')}
            className={`flex-1 py-1.5 rounded-lg text-center transition ${
              mobileTab === 'opponent' ? 'bg-panel-2 text-ink shadow' : 'text-muted'
            }`}
          >
            👤 Opponent (Live)
          </button>
        </div>
      )}

      {/* Main Arena Grid */}
      <div className={`grid gap-3 flex-1 min-h-[580px] ${showOpponentCode ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* ================= LEFT COLUMN: MY EDITOR ================= */}
        <section
          className={`panel flex flex-col overflow-hidden ${showOpponentCode && mobileTab === 'opponent' ? 'max-lg:hidden' : ''}`}
          aria-label="My Editor"
        >
          {/* Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5 bg-panel-2/40">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-ink flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-solved animate-pulse" />
                YOU ({user?.name})
              </span>
              <span className="chip text-[11px] border-line py-0.5 px-2 text-muted">{myStatus}</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={myLanguage}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="field appearance-none py-1 pr-6 text-xs w-auto cursor-pointer"
              >
                {Object.entries(LANGUAGES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Monaco Editor: Mine (Editable) */}
          <div className="flex-1 min-h-[350px]">
            <Suspense fallback={<LoadingScreen label="Loading editor..." />}>
              <Monaco
                height="100%"
                language={myLanguage}
                value={myCode}
                onChange={onCodeChange}
                onMount={(ed) => {
                  myEditorRef.current = ed;
                }}
                theme={theme === 'light' ? 'light' : 'vs-dark'}
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  contextmenu: true,
                }}
              />
            </Suspense>
          </div>

          {/* Bottom Action Bar */}
          <div className="border-t border-line px-3 py-2 flex flex-wrap items-center justify-between gap-2 bg-panel-2/30">
            <button
              onClick={onToggleConsole}
              className="text-xs font-semibold text-muted hover:text-ink inline-flex items-center gap-1"
            >
              Console {consoleOpen ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onRun}
                disabled={Boolean(runningAction)}
                className="btn-ghost py-1 text-xs inline-flex items-center gap-1"
                title="Run visible test cases"
              >
                {runningAction === 'run' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                {runningAction === 'run' ? 'Running...' : 'Run'}
              </button>

              <button
                onClick={onSubmit}
                disabled={Boolean(runningAction)}
                className="btn-primary py-1 text-xs inline-flex items-center gap-1 bg-gradient-to-r from-red-600 via-amber-600 to-violet-600"
                title="Submit solution to win challenge"
              >
                {runningAction === 'submit' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {runningAction === 'submit' ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>

          {/* Console Section */}
          {consoleOpen && (
            <div className="h-44 border-t border-line overflow-y-auto p-3 text-xs font-mono bg-abyss/90 space-y-2">
              {myRunResult ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-muted">
                    <span className="font-bold text-ink">Test Results:</span>
                    <span>
                      Passed: {myRunResult.passedCount} / {myRunResult.totalCount}
                    </span>
                  </div>
                  {myRunResult.visible?.map((c, i) => (
                    <div
                      key={i}
                      className={`p-1.5 rounded flex items-center justify-between ${
                        c.passed ? 'bg-solved/10 text-solved' : 'bg-revision/10 text-revision'
                      }`}
                    >
                      <span>
                        Test {i + 1} {c.passed ? '✅ Passed' : '❌ Failed'}
                      </span>
                      <span>{c.passed ? 'OK' : c.error || 'Wrong Answer'}</span>
                    </div>
                  ))}
                  {(myRunResult.compileOutput || myRunResult.stderr) && (
                    <div className="p-2 bg-red-950/60 border border-red-500/40 rounded text-red-200">
                      <p className="font-bold">Diagnostics:</p>
                      <pre className="whitespace-pre-wrap">{myRunResult.compileOutput || myRunResult.stderr}</pre>
                    </div>
                  )}
                  {myRunResult.stdout && (
                    <div className="pt-1 text-muted">
                      <p className="font-bold text-ink">Output:</p>
                      <pre className="whitespace-pre-wrap">{myRunResult.stdout}</pre>
                    </div>
                  )}
                </div>
              ) : mySubmitResult ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">Submission Verdict:</span>
                    <span className={mySubmitResult.passed ? 'text-solved font-bold' : 'text-revision font-bold'}>
                      {mySubmitResult.verdict}
                    </span>
                  </div>
                  <p className="text-muted">
                    Tests Passed: {mySubmitResult.testsPassed} / {mySubmitResult.totalTests}
                  </p>
                  {(mySubmitResult.compileOutput || mySubmitResult.stderr) && (
                    <div className="p-2 bg-red-950/60 border border-red-500/40 rounded text-red-200">
                      <p className="font-bold">Diagnostics:</p>
                      <pre className="whitespace-pre-wrap">{mySubmitResult.compileOutput || mySubmitResult.stderr}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted">Click &ldquo;Run&rdquo; to test examples, or &ldquo;Submit&rdquo; to validate all test cases.</p>
              )}
            </div>
          )}
        </section>

        {/* ================= RIGHT COLUMN: OPPONENT EDITOR (READ-ONLY) ================= */}
        {showOpponentCode && (
          <section
            className={`panel flex flex-col overflow-hidden ${mobileTab === 'mine' ? 'max-lg:hidden' : ''}`}
            aria-label="Opponent Live Editor"
          >
            {/* Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5 bg-panel-2/40">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-ink flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${opponentDisconnected ? 'bg-revision' : 'bg-amber-400 animate-pulse'}`} />
                  OPPONENT ({opponentPlayer?.name || 'Player 2'})
                </span>
                <span className="chip text-[11px] border-line py-0.5 px-2 text-muted">
                  {opponentDisconnected ? '⚠️ Disconnected' : opponentStatus}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="chip border-line bg-abyss text-[11px] font-mono text-muted">
                  Tests: {opponentProgress.total ? `${opponentProgress.passed}/${opponentProgress.total}` : '—'}
                </span>
                <span className="chip border-line bg-panel-2 text-[11px] font-mono uppercase text-muted">
                  {LANGUAGES[opponentLanguage] || opponentLanguage}
                </span>
              </div>
            </div>

            {/* Monaco Editor: Opponent (Strictly Read-Only) */}
            <div className="flex-1 min-h-[350px] relative">
              <Suspense fallback={<LoadingScreen label="Loading opponent stream..." />}>
                <Monaco
                  height="100%"
                  language={opponentLanguage}
                  value={opponentCode || '// Waiting for opponent code stream...'}
                  theme={theme === 'light' ? 'light' : 'vs-dark'}
                  options={{
                    readOnly: true,
                    domReadOnly: true,
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 4,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    cursorStyle: 'line-thin',
                    renderLineHighlight: 'all',
                  }}
                  onMount={(ed) => {
                    oppEditorRef.current = ed;
                  }}
                />
              </Suspense>

              {/* Read-only overlay badge */}
              <div className="absolute top-2 right-2 pointer-events-none opacity-50 px-2 py-0.5 rounded bg-panel-2 text-[10px] text-muted font-mono uppercase">
                Live Stream (Read Only)
              </div>
            </div>

            {/* Opponent Status Footer */}
            <div className="border-t border-line px-3 py-2 bg-panel-2/30 flex items-center justify-between text-xs text-muted">
              <div className="flex items-center gap-2">
                <span>Opponent Status:</span>
                <span className="font-bold text-ink">{opponentStatus}</span>
              </div>
              <div className="font-mono text-[11px]">
                Cursor: Line {opponentCursor.line}, Col {opponentCursor.ch}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* The room chat, floating over the arena (a battle can turn it off for its players) */}
      {roomChatEnabled && battleChatOpen && (
        <div className="fixed bottom-4 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] shadow-2xl">
          <RoomChat user={user} connected={connected} messages={chatMessages} draft={chatDraft} onDraftChange={onChatDraftChange} onSend={onSendChat} bottomRef={chatBottomRef} height="h-72" onClose={onToggleBattleChat} />
        </div>
      )}
    </div>
  );
}
