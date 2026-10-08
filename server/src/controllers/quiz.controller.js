import mongoose from 'mongoose';
import { QuizSet } from '../models/QuizSet.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { QUIZ_TEMPLATES, templateById } from '../data/quizTemplates.js';
import { aiEnabled } from '../services/ai.service.js';
import { QUESTION_TYPES, generateQuestions, importQuestions, validateQuestions } from '../services/quiz.service.js';

const MAX_SAVED = 100;

const mine = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Quiz not found');
  const set = await QuizSet.findOne({ _id: req.params.id, owner: req.userId });
  if (!set) throw new HttpError(404, 'Quiz not found');
  return set;
};
const checked = (questions) => {
  try {
    return validateQuestions(questions);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
};

// GET /api/quizzes — the ready-made quizzes and the ones you saved
export const listQuizzes = asyncHandler(async (req, res) => {
  const sets = await QuizSet.find({ owner: req.userId }).sort({ updatedAt: -1 });
  res.json({
    templates: QUIZ_TEMPLATES.map((t) => ({ id: t.id, title: t.title, description: t.description, count: t.questions.length })),
    mine: sets.map((s) => s.summary()),
  });
});

// GET /api/quizzes/templates/:id — a ready-made quiz in full, to copy into the editor
export const getTemplate = asyncHandler(async (req, res) => {
  const t = templateById(req.params.id);
  if (!t) throw new HttpError(404, 'Quiz not found');
  res.json({ quiz: { title: t.title, questions: checked(t.questions) } });
});

export const getQuiz = asyncHandler(async (req, res) => {
  res.json({ quiz: (await mine(req)).toFull() });
});

export const createQuiz = asyncHandler(async (req, res) => {
  if ((await QuizSet.countDocuments({ owner: req.userId })) >= MAX_SAVED) throw new HttpError(400, `You can keep up to ${MAX_SAVED} quizzes. Delete one first.`);
  const set = await QuizSet.create({ owner: req.userId, title: req.body.title, questions: checked(req.body.questions) });
  res.status(201).json({ quiz: set.toFull() });
});

export const updateQuiz = asyncHandler(async (req, res) => {
  const set = await mine(req);
  set.title = req.body.title;
  set.questions = checked(req.body.questions);
  await set.save();
  res.json({ quiz: set.toFull() });
});

export const deleteQuiz = asyncHandler(async (req, res) => {
  const set = await mine(req);
  await set.deleteOne();
  res.json({ deleted: true });
});

// POST /api/quizzes/generate { topic, difficulty, count, types } — AI-written questions for the editor to review
export const generateQuiz = asyncHandler(async (req, res) => {
  if (!aiEnabled()) throw new HttpError(503, 'AI question writing needs an Anthropic API key on the server. You can type or paste questions instead.');
  const { topic, difficulty, count, types } = req.body;
  try {
    const questions = await generateQuestions({ topic, difficulty, count, types: types?.length ? types : QUESTION_TYPES });
    res.json({ questions });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `Couldn’t write the questions: ${err.message}`);
  }
});

// POST /api/quizzes/import { text } — questions typed in the simple format, or JSON
export const importQuiz = asyncHandler(async (req, res) => {
  try {
    res.json(importQuestions(req.body.text));
  } catch (err) {
    throw new HttpError(400, err.message);
  }
});
