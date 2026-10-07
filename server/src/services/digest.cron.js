import cron from 'node-cron';
import { User } from '../models/User.js';
import { Problem } from '../models/Problem.js';
import { computeStats } from './stats.service.js';
import { emailEnabled, sendDigest } from './email.service.js';
import { toYmd } from '../utils/dates.js';

// Sends today's digests: every opted-in user whose chosen weekday it is, once per day.
export async function runDigests(now = new Date()) {
  const today = toYmd(now);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  // lastDigestDate keeps a second server instance, or a restart, from emailing the same person twice
  const users = await User.find({ emailDigests: true, emailDigestDay: weekday, lastDigestDate: { $ne: today } }).lean();

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    try {
      const problems = await Problem.find({ user: user._id }).lean({ virtuals: false });
      await sendDigest(user, computeStats(problems, today));
      await User.updateOne({ _id: user._id }, { lastDigestDate: today });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[digest] failed for user ${user._id}:`, err.message);
    }
  }
  return { sent, failed };
}

export function startDigestCron() {
  if (!emailEnabled()) {
    console.log('[digest] email isn’t configured, so weekly digests are off (see SMTP_* in server/.env.example)');
    return;
  }
  cron.schedule(
    '0 8 * * *',
    () => runDigests().then(({ sent, failed }) => sent + failed && console.log(`[digest] sent ${sent}, failed ${failed}`)),
    { timezone: 'UTC' }
  );
  console.log('[digest] weekly digests scheduled for 08:00 UTC');
}
