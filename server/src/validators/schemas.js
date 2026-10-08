import { z } from 'zod';
import { STATUSES, DIFFICULTIES, CODE_LANGUAGES, MAX_CODE_CHARS, DIGEST_DAYS } from '../utils/constants.js';
import { isValidYmd } from '../utils/dates.js';
import { isHttpUrl } from '../utils/url.js';

const ymd = z.string().refine(isValidYmd, 'Date must be a real date in YYYY-MM-DD format');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const httpUrl = z.string().trim().max(500).refine(isHttpUrl, 'Link must be a valid URL');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const linkToken = z.string().trim().regex(/^[a-f0-9]{64}$/, 'This link is not valid. Ask for a new one.');
export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') });
export const resetPasswordSchema = z.object({
  token: linkToken,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export const verifyEmailSchema = z.object({ token: linkToken });

const text = (max) => z.string().trim().max(max);

export const problemCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  originalTitle: text(200).optional(),
  link: z.union([z.literal(''), httpUrl]).optional(),
  platform: text(60).optional(),
  difficulty: z.enum(DIFFICULTIES, { message: 'Difficulty must be Easy, Medium or Hard' }),
  pattern: z.string().trim().min(1, 'Pattern is required').max(80),
  keyConcept: text(1000).optional(),
  bruteForce: text(1000).optional(),
  optimal: text(1000).optional(),
  timeComplexity: text(60).optional(),
  spaceComplexity: text(60).optional(),
  status: z.enum(STATUSES).optional(),
  dateSolved: ymd.nullable().optional(),
  attempts: z.number().int().min(0).max(999).optional(),
  notes: text(10000).optional(),
  topic: text(60).optional(),
  order: z.number().int().min(0).max(100000).optional(),
  important: z.boolean().optional(),
});

export const problemUpdateSchema = problemCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Send at least one field to update');

export const problemBulkSchema = z.object({
  problems: z.array(z.unknown()).min(1, 'Add at least one problem').max(300, 'Import up to 300 problems at a time'),
  skipDuplicates: z.boolean().optional().default(true),
});

export const lookupQuerySchema = z.object({ url: z.string().trim().min(1, 'Paste a problem link').max(500) });
export const lookupBatchSchema = z.object({
  urls: z.array(z.string().trim().max(500)).min(1, 'Paste at least one link').max(100, 'Look up to 100 links at a time'),
});

export const problemQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  topic: z.string().trim().max(60).optional(),
  important: z.enum(['true', 'false']).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  pattern: z.string().trim().max(80).optional(),
  search: z.string().trim().max(100).optional(),
});

export const statsQuerySchema = z.object({
  today: ymd.optional(),
});

// --- Spaced repetition -------------------------------------------------------
export const reviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const reviewSubmitSchema = z.object({
  quality: z.number({ message: 'quality must be a number from 0 to 5' }).int('quality must be a whole number').min(0).max(5),
});

// --- AI hints ----------------------------------------------------------------
export const hintSchema = z.object({
  level: z.number().int().min(1).max(3).optional().default(1),
});

// --- Code runner -------------------------------------------------------------
const language = z.enum(Object.keys(CODE_LANGUAGES), { message: `Language must be one of: ${Object.keys(CODE_LANGUAGES).join(', ')}` });
const code = z.string().max(MAX_CODE_CHARS, `Code is limited to ${MAX_CODE_CHARS} characters`);
export const executeSchema = z.object({
  code: code.refine((c) => c.trim().length > 0, 'Write some code first'),
  language,
  stdin: z.string().max(10_000, 'Input is limited to 10,000 characters').optional().default(''),
  problemId: objectId.optional(),
});
export const saveCodeSchema = z.object({ language, code });
// Function-style judging works for the languages the harness supports
export const submitSchema = z.object({
  language,
  code: code.refine((c) => c.trim().length > 0, 'Write some code first'),
  mode: z.enum(['run', 'submit']).optional().default('run'),
});

export const testCasesSchema = z.object({ text: z.string().trim().min(2, 'Paste the test cases or upload the file').max(200_000, 'That file is too large') });

const solutionFields = {
  title: z.string().trim().min(1, 'Give the solution a name').max(80),
  language,
  code: code.refine((c) => c.trim().length > 0, 'There is no code to keep'),
  notes: z.string().trim().max(2000).optional(),
  timeComplexity: z.string().trim().max(60).optional(),
  spaceComplexity: z.string().trim().max(60).optional(),
  source: z.enum(['manual', 'submission']).optional(),
};
export const solutionCreateSchema = z.object(solutionFields);
export const solutionUpdateSchema = z.object(solutionFields).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// --- 1v1 battles --------------------------------------------------------------
const battleSettings = z.object({
  duration: z.union([z.literal(0), z.literal(300), z.literal(600), z.literal(900), z.literal(1800)], { message: 'Pick 5, 10, 15 or 30 minutes, or no limit' }).optional(),
  voiceChat: z.boolean().optional(),
  roomChat: z.boolean().optional(),
  showOpponentCode: z.boolean().optional(),
  antiCopy: z.boolean().optional(),
  soundEffects: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
});
// Which problem a new battle uses: a starter problem number, or a random one of a difficulty, or (neither) any random one
const problemChoice = {
  // Anything that isn't a starter problem (your own problems) falls back to the first starter problem
  problemOrder: z.coerce.number().int().optional(),
  difficulty: z.enum(DIFFICULTIES, { message: 'Difficulty must be Easy, Medium or Hard' }).optional(),
};
export const battleProblemSchema = z.object(problemChoice);
export const challengeSendSchema = z.object({ targetUserId: z.string().optional(), ...problemChoice });
export const battleCreateSchema = z.object({
  ...problemChoice,
  isPublic: z.boolean().optional().default(false),
  settings: battleSettings.optional(),
});
export const battleSettingsSchema = battleSettings.refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const battleCodeSchema = z.object({
  language,
  code: code.refine((c) => c.trim().length > 0, 'Write some code first'),
});

// --- LeetCode sync -----------------------------------------------------------
export const leetcodeSyncSchema = z.object({
  username: z.string().trim().min(1, 'Enter your LeetCode username').max(40).regex(/^[\w.-]+$/, 'That doesn’t look like a LeetCode username'),
  importMissing: z.boolean().optional().default(false),
  // minutes behind UTC, i.e. new Date().getTimezoneOffset(); lets solve dates land on the user's local day
  tzOffset: z.number().int().min(-840).max(840).optional().default(0),
});

// --- Settings ----------------------------------------------------------------
export const settingsSchema = z
  .object({
    emailDigests: z.boolean(),
    emailDigestDay: z.enum(DIGEST_DAYS, { message: `Digest day must be one of: ${DIGEST_DAYS.join(', ')}` }),
    publicProfile: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Send at least one setting to update');

export const leaderboardQuerySchema = z.object({
  metric: z.enum(['xp', 'streak', 'weekly']).optional().default('xp'),
});

// --- Study rooms -------------------------------------------------------------
export const roomCreateSchema = z.object({
  name: z.string().trim().min(2, 'Room name must be at least 2 characters').max(60),
  isPublic: z.boolean().optional().default(false),
});
export const roomJoinSchema = z
  .object({
    code: z.string().trim().min(4).max(12).optional(),
    roomId: objectId.optional(),
  })
  .refine((o) => o.code || o.roomId, 'Enter a room code');

// --- Pack marketplace --------------------------------------------------------
export const packPublishSchema = z.object({
  name: z.string().trim().min(3, 'Pack name must be at least 3 characters').max(60),
  description: z.string().trim().max(300).optional().default(''),
  isPublic: z.boolean().optional().default(false),
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('topic'), topic: z.string().trim().min(1).max(60) }),
    z.object({ type: z.literal('ids'), ids: z.array(objectId).min(1, 'Pick at least one problem').max(300) }),
  ]),
});
export const packUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    description: z.string().trim().max(300),
    isPublic: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Send at least one field to update');
export const marketplaceQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  sort: z.enum(['popular', 'new']).optional().default('popular'),
});
