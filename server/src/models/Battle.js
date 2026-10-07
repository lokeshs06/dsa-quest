import mongoose from 'mongoose';

const ONE_DAY = 60 * 60 * 24;

const battleEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    data: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const submissionRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    language: { type: String, default: 'python' },
    code: { type: String, default: '' },
    verdict: { type: String, default: 'Pending' },
    testsPassed: { type: Number, default: 0 },
    totalTests: { type: Number, default: 0 },
    passedAll: { type: Boolean, default: false },
    stdout: { type: String, default: '' },
    stderr: { type: String, default: '' },
    compileOutput: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    socketId: { type: String, default: null },
    ready: { type: Boolean, default: false },
    settingsConfirmed: { type: Boolean, default: false },
    language: { type: String, default: 'python' },
    code: { type: String, default: '' },
    cursorLine: { type: Number, default: 1 },
    cursorCh: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['Waiting', 'Ready', 'Coding', 'Running', 'Submitting', 'Passed', 'Failed', 'Disconnected', 'Finished'],
      default: 'Waiting',
    },
    testsPassed: { type: Number, default: 0 },
    totalTests: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    connected: { type: Boolean, default: true },
    voiceMuted: { type: Boolean, default: false },
    inVoice: { type: Boolean, default: false },
    disconnectTimerExpiresAt: { type: Date, default: null },
    rematchRequested: { type: Boolean, default: false },
    isBot: { type: Boolean, default: false },
  },
  { _id: false }
);

const battleSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
      index: true,
    },
    challengeId: { type: String, default: null },
    // duel: two people. solo: one person against the clock. demo: one person against a scripted bot.
    mode: { type: String, enum: ['duel', 'solo', 'demo'], default: 'duel' },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    player1Id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    player2Id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    problem: {
      order: { type: Number, default: 1 },
      title: { type: String, default: 'Largest Element' },
      difficulty: { type: String, default: 'Easy' },
      pattern: { type: String, default: 'Array Traversal' },
      link: { type: String, default: 'https://www.geeksforgeeks.org/problems/largest-element-in-array4009/1' },
    },
    settings: {
      duration: { type: Number, default: 600 }, // seconds (300, 600, 900, 0 = unlimited)
      voiceChat: { type: Boolean, default: true },
      roomChat: { type: Boolean, default: true },
      showOpponentCode: { type: Boolean, default: true },
      antiCopy: { type: Boolean, default: true },
      soundEffects: { type: Boolean, default: true },
      fullscreen: { type: Boolean, default: true },
    },
    players: [playerSchema],
    chatMessages: [chatMessageSchema],
    submissions: [submissionRecordSchema],
    status: {
      type: String,
      enum: ['waiting', 'lobby', 'settings', 'countdown', 'active', 'finished', 'cancelled'],
      default: 'waiting',
      index: true,
    },
    readyState: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ p1: false, p2: false }),
    },
    countdownStartTime: { type: Date, default: null },
    battleStartTime: { type: Date, default: null },
    startTime: { type: Date, default: null },
    duration: { type: Number, default: 600 },
    finishTime: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    winnerName: { type: String, default: null },
    loser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    loserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    loserName: { type: String, default: null },
    completionTimeMs: { type: Number, default: null },
    // Why it ended: all_tests_passed, time_expired, opponent_left, opponent_disconnected_timeout, player_left, abandoned
    endReason: { type: String, default: null },
    // Set once when both players ask for a rematch, so the next battle is created exactly once
    rematchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', default: null },
    events: [battleEventSchema],
    lastActivity: { type: Date, default: Date.now, expires: ONE_DAY },
  },
  { timestamps: true }
);

battleSchema.index({ 'players.userId': 1, status: 1 });
battleSchema.index({ roomCode: 1, createdAt: -1 });

battleSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    ret.battleId = ret.id;
    delete ret._id;
    return ret;
  },
});

export const Battle = mongoose.model('Battle', battleSchema);
