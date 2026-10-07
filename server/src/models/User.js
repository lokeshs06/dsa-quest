import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DIGEST_DAYS } from '../utils/constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
    },
    // select: false keeps the hash out of every query unless asked for explicitly
    password: { type: String, required: true, minlength: 8, select: false },
    // Opt-in: appear on the public leaderboard
    publicProfile: { type: Boolean, default: false },
    // Opt-in weekly progress email
    emailDigests: { type: Boolean, default: false },
    emailDigestDay: { type: String, enum: DIGEST_DAYS, default: 'Sunday' },
    lastDigestDate: { type: String, default: null },
    leetcodeUsername: { type: String, trim: true, maxlength: 40, default: '' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, email: this.email, createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
