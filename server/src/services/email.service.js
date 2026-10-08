import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { isHttpUrl } from '../utils/url.js';

let transport = null;
export const setMailTransport = (fake) => {
  transport = fake;
};

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
// EMAIL_TRANSPORT=json writes each email to the server log instead of sending it (handy in development)
export const emailEnabled = () => smtpConfigured() || process.env.EMAIL_TRANSPORT === 'json';

function getTransport() {
  if (transport) return transport;
  if (process.env.EMAIL_TRANSPORT === 'json') {
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else if (smtpConfigured()) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
// The unsubscribe link has to reach the API; in a split deploy that isn't the same host as the client
const apiUrl = () => (process.env.API_PUBLIC_URL || clientUrl()).replace(/\/$/, '');

// Unsubscribe links are signed with a different secret from login tokens, so a link that leaks
// from an email can switch off digests but can never be used to log in.
const unsubscribeSecret = () => `${process.env.JWT_SECRET}:unsubscribe`;
export const signUnsubscribeToken = (userId) => jwt.sign({ sub: String(userId), purpose: 'unsubscribe' }, unsubscribeSecret(), { expiresIn: '365d' });
export function verifyUnsubscribeToken(token) {
  try {
    const payload = jwt.verify(token, unsubscribeSecret());
    return payload.purpose === 'unsubscribe' ? payload.sub : null;
  } catch {
    return null;
  }
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function buildDigest(user, stats) {
  const weekSolved = stats.activity.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const mission = stats.nextMission;
  const unlocked = stats.achievements.filter((a) => a.unlocked).length;
  const dueReviews = stats.reviews?.due ?? 0;
  const unsubscribeUrl = `${apiUrl()}/api/unsubscribe?token=${signUnsubscribeToken(user._id)}`;

  const rows = [
    ['Solved this week', weekSolved],
    ['Current streak', `${stats.streak.current} ${stats.streak.current === 1 ? 'day' : 'days'}`],
    ['Level', `${stats.xp.level} (${stats.xp.earned} XP)`],
    ['Quest progress', `${stats.solved} / ${stats.total} solved`],
    ['Reviews due', dueReviews],
    ['Achievements unlocked', `${unlocked} of ${stats.achievements.length}`],
  ];

  const missionHtml = mission
    ? `<p style="margin:24px 0 4px;color:#555e82;font-size:13px">Next up</p>
       <p style="margin:0;font-size:18px;font-weight:700">${escapeHtml(mission.originalTitle || mission.title)}</p>
       <p style="margin:4px 0 0;color:#555e82;font-size:13px">${escapeHtml(mission.difficulty)} · ${escapeHtml(mission.pattern)}${
         mission.link && isHttpUrl(mission.link) ? ` · <a href="${escapeHtml(mission.link)}" style="color:#7c3aed">open problem</a>` : ''
       }</p>`
    : '<p style="margin:24px 0 0;font-weight:700">You cleared every problem on your map. Time to add a new pack!</p>';

  const html = `<!doctype html>
<html><body style="margin:0;background:#f3f4fa;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#151a33">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #d9deef;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 4px;font-size:22px">⚡ Your DSA Quest week</h1>
      <p style="margin:0 0 20px;color:#555e82">Hi ${escapeHtml(user.name)}, here is how this week went.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse">
        ${rows.map(([label, value]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eceffa;color:#555e82">${label}</td><td style="padding:8px 0;border-bottom:1px solid #eceffa;text-align:right;font-weight:700">${escapeHtml(value)}</td></tr>`).join('')}
      </table>
      ${missionHtml}
      <p style="margin:28px 0 0"><a href="${escapeHtml(clientUrl())}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">Continue your quest</a></p>
    </div>
    <p style="margin:16px 0 0;text-align:center;color:#8f97b6;font-size:12px">
      You get this because you turned on weekly digests. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#7c3aed">Unsubscribe</a>
    </p>
  </div>
</body></html>`;

  const text = [
    `Hi ${user.name}, here is how your DSA Quest week went.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    mission ? `Next up: ${mission.originalTitle || mission.title} (${mission.difficulty}, ${mission.pattern})` : 'You cleared every problem on your map.',
    '',
    `Continue: ${clientUrl()}`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  return {
    subject: `Your DSA Quest week: ${weekSolved} solved, ${stats.streak.current}-day streak`,
    html,
    text,
    unsubscribeUrl,
  };
}

const fromAddress = () => `"DSA Quest" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@dsaquest.local'}>`;

// A page of the client app, e.g. appLink('/reset-password', { token })
export const appLink = (path, params = {}) => `${clientUrl()}${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`;

// ---- account emails: confirm your address, reset your password

export function buildAccountEmail({ name, heading, intro, button, url, outro }) {
  const html = `<!doctype html>
<html><body style="margin:0;background:#f3f4fa;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#151a33">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #d9deef;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 20px;color:#555e82;line-height:1.5">Hi ${escapeHtml(name)}, ${escapeHtml(intro)}</p>
      <p style="margin:0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${escapeHtml(button)}</a></p>
      <p style="margin:24px 0 0;color:#555e82;font-size:13px;line-height:1.5">${escapeHtml(outro)}</p>
      <p style="margin:12px 0 0;color:#8f97b6;font-size:12px;word-break:break-all">If the button doesn't work, open this link: ${escapeHtml(url)}</p>
    </div>
  </div>
</body></html>`;
  const text = [`Hi ${name}, ${intro}`, '', `${button}: ${url}`, '', outro].join('\n');
  return { html, text };
}

async function sendAccountEmail(user, subject, content) {
  const mailer = getTransport();
  if (!mailer) throw new Error('Email is not configured');
  return mailer.sendMail({ from: fromAddress(), to: user.email, subject, ...buildAccountEmail({ name: user.name, ...content }) });
}

export const sendVerificationEmail = (user, token) =>
  sendAccountEmail(user, 'Confirm your DSA Quest email', {
    heading: 'Confirm your email',
    intro: 'please confirm that this is your email address. It lets you reset your password if you ever forget it.',
    button: 'Confirm email',
    url: appLink('/verify-email', { token }),
    outro: 'This link works for 24 hours. If you didn’t create a DSA Quest account, you can ignore this email.',
  });

export const sendPasswordResetEmail = (user, token) =>
  sendAccountEmail(user, 'Reset your DSA Quest password', {
    heading: 'Reset your password',
    intro: 'we got a request to reset the password for your DSA Quest account.',
    button: 'Choose a new password',
    url: appLink('/reset-password', { token }),
    outro: 'This link works once, for 30 minutes. If you didn’t ask for it, ignore this email: your password stays the same.',
  });

export async function sendDigest(user, stats) {
  const mailer = getTransport();
  if (!mailer) throw new Error('Email is not configured');
  const { subject, html, text, unsubscribeUrl } = buildDigest(user, stats);
  return mailer.sendMail({
    from: fromAddress(),
    to: user.email,
    subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  });
}
