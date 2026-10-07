import mongoose from 'mongoose';
import { CODE_LANGUAGES } from '../utils/constants.js';

// One graded Submit, kept like a LeetCode submission history. Runs are not recorded.
const submissionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    language: { type: String, enum: Object.keys(CODE_LANGUAGES), required: true },
    code: { type: String, required: true, select: false },
    status: { type: String, required: true }, // Accepted, Wrong Answer, Runtime Error, Compile Error, ...
    statusId: { type: Number, required: true },
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    runtimeMs: { type: Number, default: null },
    memoryKb: { type: Number, default: null },
    // The first visible case that went wrong, so the list can show why without opening the code
    failed: {
      type: { _id: false, input: String, expected: String, actual: String, error: String },
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

submissionSchema.index({ user: 1, problem: 1, createdAt: -1 });

submissionSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.user;
    return ret;
  },
});

export const Submission = mongoose.model('Submission', submissionSchema);
