import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Problem } from '../models/Problem.js';
import { signToken } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { arrayProblems, TOPIC } from '../data/arrayProblems.js';
import { emailEnabled, sendPasswordResetEmail, sendVerificationEmail } from '../services/email.service.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

export const seedStarterProblems = (userId) =>
  Problem.insertMany(arrayProblems.map((p) => ({ ...p, topic: TOPIC, user: userId })));

const tokenFor = (user) => signToken(user._id, user.sessionVersion ?? 0);

// Links in emails carry a random token; the database keeps only its hash
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
function newLinkToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

async function sendVerification(user) {
  const { token, hash } = newLinkToken();
  await User.updateOne({ _id: user._id }, { verifyTokenHash: hash, verifyTokenExpires: new Date(Date.now() + VERIFY_TTL_MS) });
  await sendVerificationEmail(user, token);
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.');

  const user = await User.create({ name, email, password });
  await seedStarterProblems(user._id); // every new hero starts with the 25-problem Array quest

  // A mail outage shouldn't stop anyone signing up; they can ask for the email again later
  if (emailEnabled()) {
    sendVerification(user).catch((err) => console.error('Could not send the verification email:', err.message));
  }

  res.status(201).json({ token: tokenFor(user), user: user.toPublic() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for both cases so attackers can't tell which emails exist
  if (!user || !(await user.comparePassword(password))) throw new HttpError(401, 'Incorrect email or password.');

  res.json({ token: tokenFor(user), user: user.toPublic() });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  res.json({ user: user.toPublic() });
});

// ---- email verification

export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate(
    { verifyTokenHash: hashToken(req.body.token), verifyTokenExpires: { $gt: new Date() } },
    { emailVerified: true, verifyTokenHash: null, verifyTokenExpires: null },
    { returnDocument: 'after' }
  );
  if (!user) throw new HttpError(400, 'This link has expired or was already used. Log in and ask for a new one.');
  res.json({ user: user.toPublic(), message: 'Email confirmed.' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  if (!emailEnabled()) throw new HttpError(503, 'Email isn’t set up on this server.');
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  if (user.emailVerified) return res.json({ message: 'Your email is already confirmed.' });
  await sendVerification(user);
  res.json({ message: `We sent a new link to ${user.email}.` });
});

// ---- password reset

const FORGOT_REPLY = 'If an account uses that email, we sent it a link to reset the password. Check your inbox and spam folder.';

export const forgotPassword = asyncHandler(async (req, res) => {
  if (!emailEnabled()) throw new HttpError(503, 'Password reset by email isn’t set up on this server. Ask the admin to reset it.');
  const user = await User.findOne({ email: req.body.email });
  // The reply is the same whether or not the account exists, so this can't be used to find accounts
  if (user) {
    const { token, hash } = newLinkToken();
    await User.updateOne({ _id: user._id }, { resetTokenHash: hash, resetTokenExpires: new Date(Date.now() + RESET_TTL_MS) });
    try {
      await sendPasswordResetEmail(user, token);
    } catch (err) {
      console.error('Could not send the password reset email:', err.message);
    }
  }
  res.json({ message: FORGOT_REPLY });
});

export const resetPassword = asyncHandler(async (req, res) => {
  // Claim the token in one step, so a link can only ever be used once
  const claimed = await User.findOneAndUpdate(
    { resetTokenHash: hashToken(req.body.token), resetTokenExpires: { $gt: new Date() } },
    { resetTokenHash: null, resetTokenExpires: null }
  );
  if (!claimed) throw new HttpError(400, 'This reset link has expired or was already used. Ask for a new one.');

  const user = await User.findById(claimed._id).select('+password');
  user.password = req.body.password; // hashed and sessionVersion bumped on save, which signs out old sessions
  user.emailVerified = true; // they just proved they can read mail sent to this address
  await user.save();

  res.json({ token: tokenFor(user), user: user.toPublic(), message: 'Password changed. You’re logged in.' });
});
