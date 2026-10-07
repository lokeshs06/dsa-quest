import { User } from '../models/User.js';
import { Problem } from '../models/Problem.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { clientToday } from '../utils/clientDate.js';
import { computeStats } from '../services/stats.service.js';
import { aiEnabled } from '../services/ai.service.js';
import { autoEnabled } from '../services/testgen.service.js';
import { emailEnabled, sendDigest, verifyUnsubscribeToken } from '../services/email.service.js';
import { executionEnabled } from './code.controller.js';

const FIELDS = 'emailDigests emailDigestDay publicProfile leetcodeUsername';
const pick = (u) => ({
  emailDigests: u.emailDigests,
  emailDigestDay: u.emailDigestDay,
  publicProfile: u.publicProfile,
  leetcodeUsername: u.leetcodeUsername,
});

// GET /api/features — which optional integrations this server has configured
export const getFeatures = (_req, res) => {
  res.json({ ai: aiEnabled(), execute: executionEnabled(), email: emailEnabled(), autoTests: autoEnabled() });
};

// GET /api/settings
export const getSettings = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select(FIELDS).lean();
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  res.json(pick(user));
});

// PATCH /api/settings
export const updateSettings = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.userId, { $set: req.body }, { returnDocument: 'after', runValidators: true }).select(FIELDS).lean();
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  res.json(pick(user));
});

// POST /api/settings/digest/test — emails you this week's digest right now
export const sendTestDigest = asyncHandler(async (req, res) => {
  if (!emailEnabled()) throw new HttpError(503, 'Email isn’t set up on this server. Add the SMTP_* settings to enable it.');
  const user = await User.findById(req.userId).lean();
  const problems = await Problem.find({ user: req.userId }).lean({ virtuals: false });
  try {
    await sendDigest(user, computeStats(problems, clientToday(req)));
  } catch (err) {
    console.error('[digest] test send failed:', err.message);
    throw new HttpError(502, 'The email server rejected the message. Check your SMTP settings.');
  }
  res.json({ sent: true, to: user.email });
});

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f3f4fa;font-family:system-ui,-apple-system,sans-serif;color:#151a33">
<main style="max-width:420px;padding:32px;text-align:center"><h1 style="margin:0 0 8px">${title}</h1><p style="color:#555e82;line-height:1.5">${body}</p></main></body></html>`;

// GET|POST /api/unsubscribe?token= — one click from the email, no login needed
export const unsubscribe = asyncHandler(async (req, res) => {
  const userId = verifyUnsubscribeToken(String(req.query.token ?? ''));
  if (!userId) {
    return res.status(400).type('html').send(page('Link not valid', 'This unsubscribe link is invalid or has expired. Log in and switch off digests under Settings.'));
  }
  await User.updateOne({ _id: userId }, { emailDigests: false });
  return res.type('html').send(page('You’re unsubscribed', 'You won’t get the weekly DSA Quest digest any more. You can turn it back on any time under Settings.'));
});
