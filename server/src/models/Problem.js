import mongoose from 'mongoose';
import { STATUSES, DIFFICULTIES, DATE_RE, xpFor } from '../utils/constants.js';

const problemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    topic: { type: String, default: 'Arrays', trim: true, maxlength: 60 },
    order: { type: Number, default: 0 },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    originalTitle: { type: String, trim: true, maxlength: 200, default: '' },
    link: { type: String, trim: true, maxlength: 500, default: '' },
    platform: { type: String, trim: true, maxlength: 60, default: 'LeetCode' },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    pattern: { type: String, required: true, trim: true, maxlength: 80 },

    keyConcept: { type: String, trim: true, maxlength: 1000, default: '' },
    bruteForce: { type: String, trim: true, maxlength: 1000, default: '' },
    optimal: { type: String, trim: true, maxlength: 1000, default: '' },
    timeComplexity: { type: String, trim: true, maxlength: 60, default: '' },
    spaceComplexity: { type: String, trim: true, maxlength: 60, default: '' },

    status: { type: String, enum: STATUSES, default: 'Not Started' },
    dateSolved: {
      type: String,
      default: null,
      validate: { validator: (v) => v === null || DATE_RE.test(v), message: 'dateSolved must be YYYY-MM-DD' },
    },
    attempts: { type: Number, min: 0, max: 999, default: 0 },
    notes: { type: String, trim: true, maxlength: 10000, default: '' },
    important: { type: Boolean, default: false },

    // Spaced repetition (SM-2 algorithm)
    nextReviewDate: { type: String, default: null, validate: { validator: (v) => v === null || DATE_RE.test(v), message: 'nextReviewDate must be YYYY-MM-DD' } },
    lastReviewDate: { type: String, default: null, validate: { validator: (v) => v === null || DATE_RE.test(v), message: 'lastReviewDate must be YYYY-MM-DD' } },
    reviewCount: { type: Number, default: 0, min: 0 },
    easeFactor: { type: Number, default: 2.5, min: 1.3, max: 5.0 },
    reviewInterval: { type: Number, default: 1, min: 1 },

    // Code saved from the editor, keyed by language. Excluded from queries unless asked for
    // with .select('+savedCode'), so listing hundreds of problems never ships everyone's code.
    savedCode: { type: Map, of: String, select: false },

    // Test cases you uploaded for a problem you added yourself (stdin -> expected stdout). Hidden ones never reach the client.
    // Set once the code saved before solutions existed has been turned into solutions
    solutionsImported: { type: Boolean, default: false },

    // Writing test cases for it automatically: pending -> working -> done | failed. Absent until something is queued.
    testGen: {
      type: { _id: false, status: { type: String, enum: ['pending', 'working', 'done', 'failed'] }, error: { type: String, default: '' }, at: Date },
      default: undefined,
    },
    // How the generated program reads its input and prints its answer
    inputFormat: { type: String, trim: true, maxlength: 600, default: '' },
    outputFormat: { type: String, trim: true, maxlength: 600, default: '' },

    testCases: {
      type: [{ _id: false, input: { type: String, default: '', maxlength: 2000 }, output: { type: String, required: true, maxlength: 2000 }, explanation: { type: String, default: '', maxlength: 300 }, hidden: { type: Boolean, default: false } }],
      select: false,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// XP is derived from difficulty, so it can never drift out of sync.
problemSchema.virtual('xp').get(function getXp() {
  return xpFor(this.difficulty);
});

problemSchema.index({ user: 1, order: 1 });
problemSchema.index({ user: 1, topic: 1 });

problemSchema.set('toJSON', {
  virtuals: true,
  flattenMaps: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.testCases;
    delete ret.solutionsImported;
    return ret;
  },
});

// Things that should happen whenever problems are created, however they got here (form, bulk import, pack, sync).
// Services register themselves here, so the model doesn't import them.
export const problemHooks = { created: [] };
const announce = (docs) => {
  for (const hook of problemHooks.created) hook(docs);
};
problemSchema.pre('save', function flagNew() {
  this.$locals.wasNew = this.isNew;
});
problemSchema.post('save', (doc) => {
  if (doc.$locals.wasNew) announce([doc]);
});
problemSchema.post('insertMany', (docs) => announce(docs));

export const Problem = mongoose.model('Problem', problemSchema);
