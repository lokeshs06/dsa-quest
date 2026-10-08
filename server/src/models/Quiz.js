import mongoose from 'mongoose';

// One question, as stored in a live quiz and in a saved quiz
export const questionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['single', 'truefalse', 'multi'], required: true },
    q: { type: String, required: true },
    options: [String],
    answers: [Number], // never sent to a player before the question's time is up
    explanation: { type: String, default: '' },
    timeLimit: { type: Number, default: 20 }, // seconds to answer
    points: { type: Number, default: 1 }, // 0 = no points, 1 = standard, 2 = double
  },
  { _id: false }
);

// A quiz activity inside a room, run like Kahoot: one question at a time for everyone.
//   lobby -> active (question -> reveal -> scoreboard -> question …, after the last reveal) -> finished
const answerSchema = new mongoose.Schema({ q: Number, choices: [Number], correct: Boolean, points: Number, ms: Number, at: Date }, { _id: false });

const quizSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creatorName: { type: String, required: true },
    topic: { type: String, required: true, trim: true, maxlength: 100 },
    mode: { type: String, enum: ['individual', 'team'], default: 'individual' },
    status: { type: String, enum: ['lobby', 'active', 'finished', 'cancelled'], default: 'lobby' },
    // Where an active quiz is: answering question qIndex, its answer shown, or the scoreboard after it
    phase: { type: String, enum: ['', 'question', 'reveal', 'scoreboard'], default: '' },
    qIndex: { type: Number, default: -1 },
    qStartsAt: Date, // answers open (the question shows a moment before)
    qEndsAt: Date,
    phaseEndsAt: Date, // when a reveal or scoreboard moves on by itself
    autoAdvance: { type: Boolean, default: false },
    hostPlays: { type: Boolean, default: true },
    finishedAt: Date,
    // Empty = everyone in the room may join
    invited: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    teams: [{ _id: false, name: String }],
    teamSize: { type: Number, default: 0 }, // 0 = no limit
    autoBalance: { type: Boolean, default: true },
    questions: [questionSchema],
    participants: [
      {
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        team: { type: String, default: '' },
        score: { type: Number, default: 0 }, // counts revealed questions only
        streak: { type: Number, default: 0 },
        answers: [answerSchema],
      },
    ],
  },
  { timestamps: true }
);

quizSchema.index({ room: 1, status: 1 });
// Old quizzes clean themselves up after a week
quizSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const Quiz = mongoose.model('Quiz', quizSchema);
