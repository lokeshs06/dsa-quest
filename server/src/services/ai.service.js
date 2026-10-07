import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from '../utils/HttpError.js';

// Change this one constant to trade quality for cost (e.g. 'claude-haiku-4-5' is far cheaper, but
// then drop `output_config` and `fallbacks` below, which Haiku doesn't accept).
const MODEL = 'claude-opus-5-5';

let client = null;

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// Tests inject a fake client here
export const setAiClient = (fake) => {
  client = fake;
};

function getClient() {
  if (client) return client;
  if (!aiEnabled()) throw new HttpError(503, 'The Oracle is asleep. Set ANTHROPIC_API_KEY on the server to enable AI hints.');
  client = new Anthropic();
  return client;
}

// Most specific error first; the SDK's typed errors replace string matching.
function toHttpError(err) {
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, 'The Oracle is busy right now. Try again in a minute.');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error('[ai] credentials rejected:', err.message);
    return new HttpError(503, 'The server’s AI credentials were rejected.');
  }
  if (err instanceof Anthropic.APIConnectionError) return new HttpError(502, 'Couldn’t reach the AI service. Try again.');
  if (err instanceof Anthropic.APIError) {
    console.error('[ai] API error:', err.status, err.message);
    return new HttpError(502, 'The AI service returned an error. Try again.');
  }
  return err;
}

// One short, plain-text answer from the Oracle.
export async function askOracle({ system, prompt, maxTokens = 4000, effort = 'low' }) {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      // Thinking is always on for this model and counts toward max_tokens, so leave headroom
      // beyond the few sentences we actually want back.
      max_tokens: maxTokens,
      output_config: { effort },
      // If a safety classifier declines, re-run on Anthropic's recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    throw toHttpError(err);
  }

  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The Oracle can’t help with that one.');

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) {
    throw new HttpError(502, response.stop_reason === 'max_tokens' ? 'The Oracle ran out of words. Try again.' : 'The Oracle had nothing to say. Try again.');
  }
  return text;
}
