import mongoose from 'mongoose';

// A quiz activity inside a room. The room stays the container; this is just state that lives alongside it.
const answerSchema = new mongoose.Schema({ q: Number, choices: [Number], correct: Boolean, points: Number, at: Date }, { _id: false });

const quizSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creatorName: { type: String, required: true },
    topic: { type: String, required: true, trim: true, maxlength: 100 },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    mode: { type: String, enum: ['individual', 'team'], default: 'individual' },
    status: { type: String, enum: ['lobby', 'active', 'finished', 'cancelled'], default: 'lobby' },
    durationSec: { type: Number, required: true, min: 30, max: 7200 },
    startsAt: Date,
    endsAt: Date,
    finishedAt: Date,
    // Empty = everyone in the room may join
    invited: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    teams: [{ _id: false, name: String }],
    teamSize: { type: Number, default: 0 }, // 0 = no limit
    autoBalance: { type: Boolean, default: true },
    questions: [
      {
        _id: false,
        type: { type: String, enum: ['single', 'truefalse', 'multi'], required: true },
        q: { type: String, required: true },
        options: [String],
        answers: [Number], // never sent to a player before the quiz ends
        explanation: { type: String, default: '' },
      },
    ],
    participants: [
      {
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        team: { type: String, default: '' },
        score: { type: Number, default: 0 },
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
