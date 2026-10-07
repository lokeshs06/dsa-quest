import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  problemCreateSchema,
  problemUpdateSchema,
  problemQuerySchema,
  problemBulkSchema,
  lookupQuerySchema,
  lookupBatchSchema,
  statsQuerySchema,
  reviewQuerySchema,
  reviewSubmitSchema,
  hintSchema,
  executeSchema,
  saveCodeSchema,
  submitSchema,
  testCasesSchema,
  battleCreateSchema,
  battleSettingsSchema,
  battleCodeSchema,
  solutionCreateSchema,
  solutionUpdateSchema,
  leetcodeSyncSchema,
  settingsSchema,
  leaderboardQuerySchema,
  roomCreateSchema,
  roomJoinSchema,
  packPublishSchema,
  packUpdateSchema,
  marketplaceQuerySchema,
} from '../validators/schemas.js';
import { register, login, me } from '../controllers/auth.controller.js';
import {
  listProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  setTestCases,
  generateTestCases,
  clearTestCases,
  restoreStarter,
  bulkCreateProblems,
  saveCode,
} from '../controllers/problem.controller.js';
import { listPacks, addPack, lookup, lookupBatch } from '../controllers/pack.controller.js';
import { getStats } from '../controllers/stats.controller.js';
import { listReviewQueue, submitReview } from '../controllers/review.controller.js';
import { getHint, getExplanation } from '../controllers/hint.controller.js';
import { getLeaderboard } from '../controllers/leaderboard.controller.js';
import { executeCode, submitSolution } from '../controllers/code.controller.js';
import { listSolutions, createSolution, updateSolution, deleteSolution, listSubmissions, getSubmission, deleteSubmission } from '../controllers/solution.controller.js';
import { syncLeetCode } from '../controllers/sync.controller.js';
import { getFeatures, getSettings, updateSettings, sendTestDigest, unsubscribe } from '../controllers/settings.controller.js';
import { createRoom, listRooms, myRooms, joinRoom, getRoom, memberMap, leaveRoom, deleteRoom } from '../controllers/room.controller.js';
import {
  browsePacks,
  myPacks,
  getPack,
  getPackByCode,
  publishPack,
  updatePack,
  deletePack,
  addPack as addCommunityPack,
  addPackByCode,
  reportPack,
} from '../controllers/marketplace.controller.js';
import {
  createBattle,
  getBattle,
  joinBattle,
  updateBattleSettings,
  confirmBattleSettings,
  runBattleCode,
  submitBattleSolution,
  leaveBattle,
  getBattleResult,
} from '../controllers/battle.controller.js';
import {
  getRoomByCode,
  sendChallenge,
  acceptChallenge,
  declineChallenge,
  cancelChallenge,
  getActiveChallenge,
  startDemoChallenge,
  startSoloBattle,
} from '../controllers/challenge.controller.js';

const router = Router();

const HOUR = 60 * 60 * 1000;
const limiter = (limit, windowMs, message, keyGenerator) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    keyGenerator,
    skip: () => process.env.NODE_ENV !== 'production',
  });

// Slow down password guessing: 20 auth attempts per 15 minutes per IP
const authLimiter = limiter(20, 15 * 60 * 1000, 'Too many attempts. Please try again in a few minutes.');

// Everything below calls a paid or third-party service, so each is capped per signed-in user
const perUser = (req) => req.userId;
const aiLimiter = limiter(30, HOUR, 'You’ve asked the Oracle a lot this hour. Try again later.', perUser);
const runLimiter = limiter(30, 60 * 1000, 'Slow down: too many code runs. Wait a few seconds.', perUser);
const syncLimiter = limiter(6, HOUR, 'LeetCode sync is limited to a few times an hour. Try again later.', perUser);
const publishLimiter = limiter(10, HOUR, 'You’re publishing packs too quickly. Try again later.', perUser);
const emailLimiter = limiter(5, HOUR, 'Test emails are limited to a few per hour.', perUser);

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// One-click unsubscribe from the weekly digest email (signed link, no login)
router.get('/unsubscribe', unsubscribe);
router.post('/unsubscribe', unsubscribe);

// Auth
router.post('/auth/register', authLimiter, validate(registerSchema), register);
router.post('/auth/login', authLimiter, validate(loginSchema), login);
router.get('/auth/me', requireAuth, me);

// Which optional integrations (AI, code runner, email) this server has configured
router.get('/features', requireAuth, getFeatures);

// Preferences: leaderboard visibility, weekly digest
router.get('/settings', requireAuth, getSettings);
router.patch('/settings', requireAuth, validate(settingsSchema), updateSettings);
router.post('/settings/digest/test', requireAuth, emailLimiter, sendTestDigest);

// Problems (CRUD) — every route is scoped to the logged-in user
router.get('/problems', requireAuth, validate(problemQuerySchema, 'query'), listProblems);
router.post('/problems', requireAuth, validate(problemCreateSchema), createProblem);
router.post('/problems/bulk', requireAuth, validate(problemBulkSchema), bulkCreateProblems);
router.post('/problems/restore-starter', requireAuth, restoreStarter);
router.get('/problems/:id', requireAuth, getProblem);
router.patch('/problems/:id', requireAuth, validate(problemUpdateSchema), updateProblem);
router.delete('/problems/:id', requireAuth, deleteProblem);
router.put('/problems/:id/code', requireAuth, validate(saveCodeSchema), saveCode);

// The Oracle: AI hints and explanations
router.post('/problems/:id/hint', requireAuth, aiLimiter, validate(hintSchema), getHint);
router.post('/problems/:id/explain', requireAuth, aiLimiter, getExplanation);

// Run code in the editor
router.post('/execute', requireAuth, runLimiter, validate(executeSchema), executeCode);
router.put('/problems/:id/testcases', requireAuth, validate(testCasesSchema), setTestCases);
router.post('/problems/:id/testcases/generate', requireAuth, aiLimiter, generateTestCases);
router.delete('/problems/:id/testcases', requireAuth, clearTestCases);
router.get('/problems/:id/solutions', requireAuth, listSolutions);
router.post('/problems/:id/solutions', requireAuth, validate(solutionCreateSchema), createSolution);
router.patch('/problems/:id/solutions/:solutionId', requireAuth, validate(solutionUpdateSchema), updateSolution);
router.delete('/problems/:id/solutions/:solutionId', requireAuth, deleteSolution);
router.get('/problems/:id/submissions', requireAuth, listSubmissions);
router.get('/problems/:id/submissions/:submissionId', requireAuth, getSubmission);
router.delete('/problems/:id/submissions/:submissionId', requireAuth, deleteSubmission);
router.post('/problems/:id/submit', requireAuth, runLimiter, validate(submitSchema), submitSolution);

// Ready-made packs (e.g. Blind 75)
router.get('/packs', requireAuth, listPacks);
router.post('/packs/:id/add', requireAuth, addPack);

// Community pack marketplace
router.get('/marketplace', requireAuth, validate(marketplaceQuerySchema, 'query'), browsePacks);
router.get('/marketplace/mine', requireAuth, myPacks);
router.get('/marketplace/code/:shareCode', requireAuth, getPackByCode);
router.post('/marketplace/code/:shareCode/add', requireAuth, addPackByCode);
router.post('/marketplace', requireAuth, publishLimiter, validate(packPublishSchema), publishPack);
router.get('/marketplace/:id', requireAuth, getPack);
router.patch('/marketplace/:id', requireAuth, validate(packUpdateSchema), updatePack);
router.delete('/marketplace/:id', requireAuth, deletePack);
router.post('/marketplace/:id/add', requireAuth, addCommunityPack);
router.post('/marketplace/:id/report', requireAuth, reportPack);

// Paste a problem link → title, platform, difficulty, pattern
router.get('/lookup', requireAuth, validate(lookupQuerySchema, 'query'), lookup);
router.post('/lookup/batch', requireAuth, validate(lookupBatchSchema), lookupBatch);

// Dashboard stats
router.get('/stats', requireAuth, validate(statsQuerySchema, 'query'), getStats);

// Spaced repetition
router.get('/review', requireAuth, validate(reviewQuerySchema, 'query'), listReviewQueue);
router.post('/review/:id', requireAuth, validate(reviewSubmitSchema), submitReview);

// Leaderboard (opt-in; visibility is a setting)
router.get('/leaderboard', requireAuth, validate(leaderboardQuerySchema, 'query'), getLeaderboard);

// Pull recent solves from LeetCode
router.post('/sync/leetcode', requireAuth, syncLimiter, validate(leetcodeSyncSchema), syncLeetCode);

// Study rooms
router.get('/rooms', requireAuth, listRooms);
router.get('/rooms/mine', requireAuth, myRooms);
router.post('/rooms', requireAuth, validate(roomCreateSchema), createRoom);
router.post('/rooms/join', requireAuth, validate(roomJoinSchema), joinRoom);
router.get('/rooms/:id', requireAuth, getRoom);
router.get('/rooms/:id/members/:userId/map', requireAuth, memberMap);
router.post('/rooms/:id/leave', requireAuth, leaveRoom);
router.delete('/rooms/:id', requireAuth, deleteRoom);
router.get('/rooms/by-code/:code', requireAuth, getRoomByCode);
router.post('/rooms/:code/challenge', requireAuth, sendChallenge);
router.post('/rooms/:code/challenge/demo', requireAuth, startDemoChallenge);
router.post('/rooms/:code/challenge/solo', requireAuth, startSoloBattle);
router.post('/rooms/:code/challenge/accept', requireAuth, acceptChallenge);
router.post('/rooms/:code/challenge/decline', requireAuth, declineChallenge);
router.post('/rooms/:code/challenge/cancel', requireAuth, cancelChallenge);
router.get('/rooms/:code/challenge', requireAuth, getActiveChallenge);

// Challenge Battles (1v1 coding arena)
router.post('/battles', requireAuth, validate(battleCreateSchema), createBattle);
router.get('/battles/:code', requireAuth, getBattle);
router.get('/battles/:code/result', requireAuth, getBattleResult);
router.post('/battles/:code/join', requireAuth, joinBattle);
router.post('/battles/:code/leave', requireAuth, leaveBattle);
router.patch('/battles/:code/settings', requireAuth, validate(battleSettingsSchema), updateBattleSettings);
router.post('/battles/:code/confirm-settings', requireAuth, confirmBattleSettings);
router.post('/battles/:code/run', requireAuth, runLimiter, validate(battleCodeSchema), runBattleCode);
router.post('/battles/:code/submit', requireAuth, runLimiter, validate(battleCodeSchema), submitBattleSolution);

export default router;
