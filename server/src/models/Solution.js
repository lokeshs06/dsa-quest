import mongoose from 'mongoose';
import { CODE_LANGUAGES, MAX_CODE_CHARS } from '../utils/constants.js';

// A solution you keep for a problem. A problem can have many: brute force, optimal, one per language...
const solutionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    language: { type: String, enum: Object.keys(CODE_LANGUAGES), required: true },
    code: { type: String, required: true, maxlength: MAX_CODE_CHARS },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    timeComplexity: { type: String, trim: true, maxlength: 60, default: '' },
    spaceComplexity: { type: String, trim: true, maxlength: 60, default: '' },
    // Where it came from: written by hand, kept from a submission, or imported from code saved before this existed
    source: { type: String, enum: ['manual', 'submission', 'imported'], default: 'manual' },
  },
  { timestamps: true }
);

solutionSchema.index({ user: 1, problem: 1, createdAt: 1 });

solutionSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.user;
    return ret;
  },
});

export const Solution = mongoose.model('Solution', solutionSchema);
