import mongoose from 'mongoose';
import { DIFFICULTIES } from '../utils/constants.js';

// A problem inside a shared pack: study material only. Nothing personal (status, notes, dates,
// saved code) is ever copied in, so publishing a pack never leaks your progress.
const packProblemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    link: { type: String, trim: true, maxlength: 500, default: '' },
    platform: { type: String, trim: true, maxlength: 60, default: 'LeetCode' },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    pattern: { type: String, required: true, trim: true, maxlength: 80 },
    keyConcept: { type: String, trim: true, maxlength: 1000, default: '' },
    bruteForce: { type: String, trim: true, maxlength: 1000, default: '' },
    optimal: { type: String, trim: true, maxlength: 1000, default: '' },
    timeComplexity: { type: String, trim: true, maxlength: 60, default: '' },
    spaceComplexity: { type: String, trim: true, maxlength: 60, default: '' },
  },
  { _id: false }
);

const customPackSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    // Becomes the topic of every problem when someone adds the pack to their map
    topic: { type: String, required: true, trim: true, maxlength: 60 },
    // Unguessable code for share links; works even when the pack isn't public
    shareCode: { type: String, required: true, unique: true },
    isPublic: { type: Boolean, default: false },
    // Packs are immutable once published, so these counts are stored rather than recomputed
    count: { type: Number, required: true },
    difficulty: { Easy: { type: Number, default: 0 }, Medium: { type: Number, default: 0 }, Hard: { type: Number, default: 0 } },
    importCount: { type: Number, default: 0 },
    // Community moderation: enough distinct reports hides a pack from browsing
    reportedBy: { type: [mongoose.Schema.Types.ObjectId], default: [], select: false },
    hidden: { type: Boolean, default: false },
    problems: { type: [packProblemSchema], select: false },
  },
  { timestamps: true }
);

customPackSchema.index({ isPublic: 1, hidden: 1, importCount: -1 });
customPackSchema.index({ isPublic: 1, hidden: 1, createdAt: -1 });

customPackSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.reportedBy;
    return ret;
  },
});

export const CustomPack = mongoose.model('CustomPack', customPackSchema);
