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

    // Account recovery. Every login token carries sessionVersion; changing the password bumps it,
    // which signs out every session opened with the old password.
    emailVerified: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0 },
    passwordChangedAt: { type: Date, default: null },
    // One-time links: only a hash is stored, so a copy of the database can't be turned into working links
    resetTokenHash: { type: String, select: false, default: null },
    resetTokenExpires: { type: Date, select: false, default: null },
    verifyTokenHash: { type: String, select: false, default: null },
    verifyTokenExpires: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  // A changed password signs out every session that was opened with the old one
  if (!this.isNew) {
    this.passwordChangedAt = new Date();
    this.sessionVersion = (this.sessionVersion ?? 0) + 1;
  }
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, email: this.email, emailVerified: Boolean(this.emailVerified), createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
