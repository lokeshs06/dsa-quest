import { User } from '../models/User.js';
import { Problem } from '../models/Problem.js';
import { signToken } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { arrayProblems, TOPIC } from '../data/arrayProblems.js';

export const seedStarterProblems = (userId) =>
  Problem.insertMany(arrayProblems.map((p) => ({ ...p, topic: TOPIC, user: userId })));

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.');

  const user = await User.create({ name, email, password });
  await seedStarterProblems(user._id); // every new hero starts with the 25-problem Array quest

  res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for both cases so attackers can't tell which emails exist
  if (!user || !(await user.comparePassword(password))) throw new HttpError(401, 'Incorrect email or password.');

  res.json({ token: signToken(user._id), user: user.toPublic() });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  res.json({ user: user.toPublic() });
});
