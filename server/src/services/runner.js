import { HttpError } from '../utils/HttpError.js';
import { CODE_LANGUAGES } from '../utils/constants.js';
import { runLocalCode } from './localRunner.js';

const RAPIDAPI_DEFAULT = 'https://judge0-ce.p.rapidapi.com';
export const ACCEPTED = 3; // Judge0 status id: the program ran to completion

// Judge0 is either RapidAPI-hosted (JUDGE0_API_KEY) or self-hosted (JUDGE0_URL, optional auth token).
function judge0Config() {
  const key = process.env.JUDGE0_API_KEY;
  const url = (process.env.JUDGE0_URL || (key ? RAPIDAPI_DEFAULT : '')).replace(/\/$/, '');
  if (!url) return null;

  const headers = { 'content-type': 'application/json' };
  if (url.includes('rapidapi.com')) {
    if (!key) return null;
    headers['x-rapidapi-key'] = key;
    headers['x-rapidapi-host'] = new URL(url).host;
  } else if (key) {
    headers['x-auth-token'] = key;
  }
  return { url, headers };
}

export const isLocalRunnerEnabled = () => {
  if (process.env.ENABLE_LOCAL_RUNNER === 'true') return true;
  if (process.env.ENABLE_LOCAL_RUNNER === 'false') return false;
  // On by default only while developing: it runs submitted code with no sandbox, so a public server must opt in
  return !['test', 'production'].includes(process.env.NODE_ENV);
};

export const executionEnabled = () => judge0Config() !== null || isLocalRunnerEnabled();

// Runs one program (on Judge0 if configured, else the local runner) and returns a normalised result
export async function runProgram(language, code, stdin) {
  const config = judge0Config();
  if (config) {
    try {
      const response = await fetch(`${config.url}/submissions?base64_encoded=false&wait=true`, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({ source_code: code, language_id: CODE_LANGUAGES[language], stdin, cpu_time_limit: 5, memory_limit: 256000 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429) throw new HttpError(429, 'The code runner is busy. Try again in a moment.');
      if (!response.ok) throw new HttpError(502, 'The code runner returned an error. Try again.');
      return await response.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, err.name === 'TimeoutError' ? 'The code runner took too long to answer.' : 'Couldn’t reach the code runner.');
    }
  }
  if (isLocalRunnerEnabled()) return runLocalCode(language, code, stdin);
  throw new HttpError(503, 'Code running isn’t set up on this server. Add JUDGE0_API_KEY (RapidAPI) or JUDGE0_URL (self-hosted).');
}

export const normalise = (result) => ({
  statusId: result.statusId ?? result.status?.id ?? 0,
  status: result.status?.description || result.status || 'Unknown',
  stdout: result.stdout || '',
  stderr: result.stderr || '',
  compileOutput: result.compileOutput || result.compile_output || '',
  time: result.time,
  memory: result.memory,
  exitCode: result.exitCode ?? result.exit_code,
});

