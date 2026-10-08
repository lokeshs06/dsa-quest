import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';

// A token only counts while its account exists and the password hasn't changed since it was issued.
// Returns the reason it no longer counts, or null when it's fine.
export async function sessionProblem(payload) {
  const user = await User.findById(payload.sub).select('sessionVersion').lean();
  if (!user) return 'Account not found. Please log in again.';
  if ((payload.sv ?? 0) !== (user.sessionVersion ?? 0)) return 'Your password was changed. Please log in again.';
  return null;
}

// Reads "Authorization: Bearer <token>", verifies it and sets req.userId.
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Please log in to continue.'));

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(new HttpError(401, 'Your session has expired. Please log in again.'));
  }
  try {
    const problem = await sessionProblem(payload);
    if (problem) return next(new HttpError(401, problem));
  } catch (err) {
    return next(err);
  }
  req.userId = payload.sub;
  return next();
}

export function signToken(userId, sessionVersion = 0) {
  return jwt.sign({ sub: userId.toString(), sv: sessionVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
