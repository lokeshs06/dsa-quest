import mongoose from 'mongoose';
import { questionSchema } from './Quiz.js';

// A quiz someone built and saved, ready to host in any room as often as they like
const quizSetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    questions: [questionSchema],
  },
  { timestamps: true }
);

quizSetSchema.methods.summary = function summary() {
  return { id: String(this._id), title: this.title, count: this.questions.length, updatedAt: this.updatedAt };
};
quizSetSchema.methods.toFull = function toFull() {
  return { ...this.summary(), questions: this.questions.map((q) => (typeof q.toObject === 'function' ? q.toObject() : q)) };
};

export const QuizSet = mongoose.model('QuizSet', quizSetSchema);
