import mongoose from 'mongoose';

const THIRTY_DAYS = 60 * 60 * 24 * 30;
// Older lines are paged in as you scroll up; beyond this the oldest are dropped
export const MAX_ROOM_MESSAGES = 500;

// One chat line. System lines (battle results, quiz announcements) have no sender.
const messageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, trim: true, maxlength: 60, default: 'System' },
    message: { type: String, required: true, maxlength: 500 },
    type: { type: String, enum: ['text', 'system'], default: 'text' },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 12 },
    // chat: any number of members (up to maxMembers) who can chat and start 1v1 battles with each other.
    // battle: a room made for one 1v1 battle, so it has exactly two seats.
    kind: { type: String, enum: ['chat', 'battle'], default: 'chat' },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isPublic: { type: Boolean, default: false },
    maxMembers: { type: Number, default: 8, min: 2, max: 20 },
    // The problem the group is working on. Problems are per-user documents, so the room
    // shares just a title and link rather than a reference.
    currentProblem: {
      title: { type: String, trim: true, maxlength: 200 },
      link: { type: String, trim: true, maxlength: 500 },
      setBy: { type: String, trim: true, maxlength: 60 },
    },
    // The latest chat lines, oldest first. Not loaded unless asked for.
    messages: { type: [messageSchema], select: false, default: undefined },
    // Rooms nobody has touched for 30 days are cleaned up automatically
    lastActivity: { type: Date, default: Date.now, expires: THIRTY_DAYS },
  },
  { timestamps: true }
);

roomSchema.index({ members: 1 });
roomSchema.index({ isPublic: 1, lastActivity: -1 });

roomSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.messages;
    return ret;
  },
});

export const Room = mongoose.model('Room', roomSchema);
