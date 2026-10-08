# ⚡ DSA Quest

A gamified, full-stack DSA practice tracker. Solve problems, earn XP, level up, keep your streak alive, review what you've learned before you forget it, and study with friends.

Built with the **MERN stack**: MongoDB, Express, React and Node.js.

![Dashboard](docs/dashboard.png)

## Features

### The core quest

- **Email + password auth.** Passwords are hashed with bcrypt, sessions use JWT, and every API route is protected. Forgot your password? A one-time reset link comes by email, and new accounts get a confirm-your-email link.
- **Full CRUD on problems.** Add, view, edit and delete problems, or change a status straight from the quest map.
- **25 starter problems.** Every new account starts with a 25-problem Array quest, each with a verified link to LeetCode, GeeksforGeeks or Code360.
- **Four ways to add the problems that matter to you:**
  - **Paste a link, auto-fill.** Paste a LeetCode, GeeksforGeeks or Code360 link and the title, difficulty and pattern fill themselves in. Lookup order: built-in packs, an offline catalog of 440+ LeetCode problems, then LeetCode's public API, then a title guessed from the URL.
  - **Problem packs.** One click adds **Blind 75**, **NeetCode 150** or **Grind 75**, with key concepts, optimal approaches and complexities. Problems already on your map are skipped.
  - **Bulk import.** Paste a list of links or a CSV (a template is included), review and fix every row, then import. Duplicates are detected and unticked for you.
  - **Star as important.** Star any problem from the quest map, the form or the import review, then use the ⭐ Important filter for revision.
- **Topics.** Problems are grouped by topic with a header and progress count on the quest map, a topic filter and per-topic progress on the dashboard.
- **Dashboard.** Today's Mission (always the next unsolved problem), an XP and level ring, a progress bar, your streak, a GitHub-style 5-week calendar, pattern mastery bars, and a prompt when reviews are due.
- **Quest map.** Problems drawn as a path: solved nodes turn green and your current quest glows. Search and filter by status, difficulty, pattern, topic or importance. Expand any problem for its key concept, approaches, complexity, notes and the Oracle.
- **Analytics.** Charts for difficulty breakdown, status split, pattern progress and problems solved per day, plus your current and longest streak.
- **Game feel.** A "+10 XP" burst when you solve a problem. Easy is worth 10 XP, Medium 20 and Hard 30, and every 100 XP is a level.
- **Light and dark themes** (follows your device until you pick one) and **time-zone aware** streaks and solve dates.

### Learn it for good

- **🧠 Spaced repetition.** A daily review queue built on the SM-2 algorithm. Rate how well you remembered a problem (0 to 5) and it comes back after a longer and longer gap, or tomorrow if you forgot. Problems flagged "Need Revision" are always due, and problems you solved before this feature existed are scheduled from the day you solved them, so nothing needs migrating. It's a keyboard-driven flashcard flow: <kbd>Space</kbd> to reveal, <kbd>0</kbd> to <kbd>5</kbd> to rate. The nav shows how many are due.
- **🔮 The Oracle (AI hints).** Three hints that get more revealing one at a time, plus a full explanation of the optimal approach, written by Claude. It only ever sees the problem's title, pattern and your key concept and approaches, never your notes or code.
- **📝 Markdown notes.** Notes support Markdown with syntax-highlighted code blocks, tables and lists, with a small toolbar and a live preview. Raw HTML in a note is shown as text, never run.
- **💻 Code editor.** A Monaco editor (the one in VS Code) in 8 languages, with run-it-now powered by Judge0. Your latest working solution is saved with the problem, and each language keeps its own draft. Programs read stdin and print to stdout.

### Play together

- **🏕️ Rooms.** Two kinds, listed on one page with their live state:
  - **Chat rooms** for groups (up to 20): real-time chat with history, who's online, a shared problem, quizzes, a live ping when a room-mate clears a quest, and read-only room-mate quest maps. Any two free members can **challenge** each other to a 1v1 battle, and several pairs can battle at once while everyone else stays in the room.
  - **Battle rooms** for exactly two players ("Challenge a friend", or *New 1v1 battle room*). The room shows *Waiting for opponent*, *Full*, *In progress* or *Completed*; a third person gets a clear "already full" message.
  - **1v1 battles**: both players ready up, a server-run countdown, the same problem for both, Run and Submit against hidden tests, and the first all-passing submission wins (decided atomically on the server). **Exit Battle** asks first; leaving a running battle hands the win to your opponent, who is told at once. A closed tab gets a grace period to reconnect (a second tab doesn't count as leaving). The result popup covers wins, losses, draws and walk-overs with the recorded numbers only.
  Built on Socket.IO; the server is the source of truth for every seat, state and result.
- **🏆 Leaderboard.** Strictly opt-in. Rank by XP, current streak or this week's solves. Only your name, level, XP, streak and solve counts are ever shown.
- **📦 Pack marketplace.** Publish a topic (or hand-picked problems) as a pack, list it publicly or share it only through a link, and add other people's packs to your own map. Only the problems and your how-to-solve notes are shared, never your progress, notes or code. Packs that get reported by enough different people are hidden.

### Stay motivated

- **🏅 Trophy shelf.** 15 trophies in five categories (milestones, streaks, speed, patterns, persistence) plus a "&lt;Pattern&gt; Master" badge for every pattern you start, with progress bars on the ones you haven't earned yet.
- **✉️ Weekly digest.** An optional email with your week: problems solved, streak, level, reviews due and what's next. Pick the day. Every email has a one-click unsubscribe.
- **🔄 LeetCode sync.** Pull your recent accepted submissions from LeetCode and mark the matching problems solved, dated the day you actually solved them (in your time zone). It can also add problems that aren't on your map yet. LeetCode's public API only shares your 20 most recent accepted submissions, so run it every so often rather than once.
- **📱 Installable, works offline.** DSA Quest is a PWA: install it from your browser, and your quest map and stats open without a connection. Edits you make to a problem while offline are saved on the device and sync when you reconnect. Offline copies are wiped when you log out.

## Screenshots

| Quest map (solving a problem) | Analytics | Mobile |
|---|---|---|
| ![Quest map](docs/quest-map.png) | ![Analytics](docs/analytics.png) | ![Mobile](docs/mobile.png) |

| Daily review | Code editor |
|---|---|
| ![Daily review](docs/review.png) | ![Code editor](docs/code-editor.png) |

| Study room party | Pack marketplace |
|---|---|
| ![Study room](docs/rooms.png) | ![Marketplace](docs/marketplace.png) |

| Problem packs | Bulk import review |
|---|---|
| ![Problem packs](docs/packs.png) | ![Import review](docs/import.png) |

**Trophy shelf**

![Trophy shelf](docs/trophies.png)

**Light theme**

![Dashboard in light theme](docs/dashboard-light.png)

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, React Router, Tailwind CSS v4, Recharts, Axios, react-hot-toast, lucide-react, Monaco Editor, react-markdown, socket.io-client, Workbox (via vite-plugin-pwa) |
| Backend | Node.js, Express 5, Mongoose, Zod (validation), JWT, bcryptjs, Helmet, express-rate-limit, Socket.IO, Nodemailer, node-cron, the Anthropic SDK |
| Database | MongoDB (local or MongoDB Atlas) |
| Testing | Jest + Supertest, 204 tests: unit tests for the stats, SM-2 and achievement engines, API integration tests for every feature, and Socket.IO tests with real clients |
| CI | GitHub Actions: tests on Node 20 and 22, client lint and build, and an optional deploy |

## Getting started

### 1. Prerequisites
- Node.js 18 or newer
- MongoDB. Either install it locally, or create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas) and copy its connection string.

### 2. Install
```bash
npm run install:all
```

### 3. Configure the server
```bash
cd server
cp .env.example .env      # on Windows: copy .env.example .env
```
Open `server/.env` and set `MONGO_URI` and `JWT_SECRET`. To generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Run it
From the project root:
```bash
npm run dev
```
- Frontend: http://localhost:5173
- API: http://localhost:5000/api

Create an account and your 25 Array problems are added automatically.

### 5. Optional integrations
Everything above works with just MongoDB. These features switch on when you add their settings to `server/.env`, and until then the app says so instead of failing (see `server/.env.example`):

| Feature | Setting | Notes |
|---|---|---|
| The Oracle (AI hints) | `ANTHROPIC_API_KEY` | Uses Claude Opus 5.5. By my estimate a hint costs a cent or two, and each person is limited to 30 per hour. To use a cheaper model, change the `MODEL` constant in `server/src/services/ai.service.js`. |
| Run code in the editor | `JUDGE0_API_KEY` (Judge0 on RapidAPI) or `JUDGE0_URL` (your own Judge0 server) | Runs happen in Judge0's sandbox, never on your server. |
| Password reset, email confirmation, weekly digests | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (and `SMTP_FROM`) | Any SMTP provider. Set `EMAIL_TRANSPORT=json` while developing to print emails to the server log instead. |

The code editor loads Monaco from the jsDelivr CDN the first time you open it. On a slow or offline connection the page offers a simple built-in editor instead.

### 6. Run the tests
```bash
npm test
```
The tests use an in-memory MongoDB that downloads automatically on first run. To use your own database instead, set `MONGO_URI_TEST=mongodb://127.0.0.1:27017`.

### 7. Try the offline mode
Service workers only run in a production build, so:
```bash
npm run build --prefix client
npm run preview --prefix client      # http://localhost:4173, with the API proxied to :5000
```

## Project structure

```
dsa-quest/
├── .github/workflows/         test.yml (CI) and deploy.yml (optional deploy)
├── client/                    React app (Vite, installable PWA)
│   └── src/
│       ├── pages/             Dashboard, QuestMap, Review, CodeEditor, Rooms, Leaderboard,
│       │                      Marketplace, Settings, Analytics, AuthPage
│       ├── components/        Layout, ProblemForm, MarkdownField, Oracle, Packs, ui…
│       ├── context/           AuthContext (login state, JWT), ThemeContext
│       └── lib/               api client, problem helpers, features, links, CSV parser, dates
└── server/                    Express API + Socket.IO
    ├── src/
    │   ├── models/            User, Problem, Room, CustomPack (Mongoose)
    │   ├── controllers/       auth, problem, review, hint, code, sync, leaderboard,
    │   │                      room, marketplace, settings, pack, stats
    │   ├── services/          stats.service.js    XP, levels, streaks, achievements
    │   │                      spaced.service.js   SM-2 spaced repetition
    │   │                      ai.service.js       the Oracle (Claude)
    │   │                      lookup.service.js   parse problem links and fill in details
    │   │                      pack.service.js     add problems to a map without duplicates
    │   │                      socket.service.js, realtime.js   study rooms
    │   │                      email.service.js, digest.cron.js weekly digest
    │   ├── middleware/        requireAuth (JWT), validate (Zod), errorHandler
    │   ├── validators/        Zod request schemas
    │   ├── routes/            all /api routes, with per-user rate limits on the costly ones
    │   └── data/              starter problems, packs/ (Blind 75, NeetCode 150, Grind 75), leetcodeCatalog.json
    └── tests/                 Jest + Supertest + socket.io-client
```

## API reference

All routes are under `/api`. Every route except register, login, health and unsubscribe needs `Authorization: Bearer <token>`.

| Method | Route | What it does |
|---|---|---|
| POST | `/auth/register` | Create an account (`name`, `email`, `password`) and seed the 25 starter problems |
| POST | `/auth/login` | Log in (`email`, `password`) and get a JWT |
| POST | `/auth/forgot-password` | Email a reset link (`email`); the reply is the same whether or not the account exists |
| POST | `/auth/reset-password` | Set a new password from a reset link (`token`, `password`); signs out every other session |
| POST | `/auth/verify-email` | Confirm your email from the link (`token`) |
| POST | `/auth/verify-email/resend` | Send a new confirmation link |
| GET | `/auth/me` | Current user |
| GET | `/problems` | List your problems. Optional filters: `status`, `difficulty`, `pattern`, `topic`, `important=true`, `search` |
| POST | `/problems` | Add a problem. Returns 409 if that link is already on your map |
| POST | `/problems/bulk` | Import up to 300 problems. Returns `created`, `duplicates` and per-row `errors` |
| GET | `/problems/:id` | Get one problem, including the code you saved |
| PATCH | `/problems/:id` | Update any fields. Returns `xpGained` when a problem becomes Solved |
| DELETE | `/problems/:id` | Delete a problem |
| PUT | `/problems/:id/code` | Save your solution for a language (`language`, `code`) |
| POST | `/problems/:id/hint` | The Oracle: a hint (`level` 1 to 3) |
| POST | `/problems/:id/explain` | The Oracle: explain the optimal approach |
| POST | `/problems/restore-starter` | Re-add any starter problems you deleted |
| POST | `/execute` | Run code in Judge0 (`code`, `language`, `stdin`, `problemId`). A clean run is saved with the problem |
| GET | `/review` | Today's review queue, most overdue first (`limit` up to 100, default 25) |
| POST | `/review/:id` | Record a review (`quality` 0 to 5) and get the next review date |
| GET | `/packs` | List built-in packs and how many of each are already on your map |
| POST | `/packs/:id/add` | Add a pack, skipping problems you already have. Returns `added` and `skipped` |
| GET | `/marketplace` | Browse public community packs (`q`, `sort=popular\|new`) |
| GET | `/marketplace/mine` | Packs you published |
| GET | `/marketplace/:id`, `/marketplace/code/:shareCode` | A pack with its problem list |
| POST | `/marketplace` | Publish a pack from a topic or a list of your problem ids |
| PATCH / DELETE | `/marketplace/:id` | Rename, re-describe or un-list a pack you own / delete it |
| POST | `/marketplace/:id/add`, `/marketplace/code/:shareCode/add` | Add a pack to your map |
| POST | `/marketplace/:id/report` | Report a public pack |
| GET | `/leaderboard?metric=xp\|streak\|weekly` | The opt-in leaderboard, plus your own rank |
| GET | `/rooms`, `/rooms/mine` | Public rooms / rooms you're in, each with its `kind` and battle state |
| POST | `/rooms`, `/rooms/join` | Create a chat room / join by `code` (or by `roomId` for public rooms). Joining a battle room takes its open seat (409 if full) |
| GET | `/rooms/by-code/:code` | Everything the room page needs: members, live battles, your battle, your last result, challenges, chat history. Outsiders of a battle room get only its seat state |
| POST | `/rooms/:code/challenge` (+ `/accept`, `/decline`, `/cancel`) | Challenge a free room member to a 1v1; only they can accept or decline, only you can cancel |
| POST | `/rooms/:code/challenge/demo`, `/solo` | A practice battle against a scripted bot, or against the clock |
| POST | `/battles` | A new two-seat battle room with you in the first seat (`problemOrder`, `isPublic`, `settings`) |
| GET | `/battles/:code`, `/battles/:code/result` | Your battle (or the room's seat state) / your latest result there |
| POST | `/battles/:code/join`, `/battles/:code/leave` | Take the open seat (atomic: one of two racing joins wins) / Exit Battle |
| PATCH / POST | `/battles/:code/settings`, `/battles/:code/confirm-settings` | Change or confirm settings before the start |
| POST | `/battles/:code/run`, `/battles/:code/submit` | Run the visible cases / submit against all cases (only while the battle is active) |
| GET | `/rooms/:id` | A room and every member's progress (members only) |
| GET | `/rooms/:id/members/:userId/map` | A room-mate's quest map, read-only |
| POST / DELETE | `/rooms/:id/leave`, `/rooms/:id` | Leave a room / delete it (host only) |
| POST | `/sync/leetcode` | Pull recent accepted submissions from LeetCode (`username`, `importMissing`, `tzOffset`) |
| GET / PATCH | `/settings` | Leaderboard visibility, weekly digest on/off and day |
| POST | `/settings/digest/test` | Email yourself this week's digest now |
| GET | `/features` | Which optional integrations (AI, code runner, email) this server has set up |
| GET / POST | `/unsubscribe?token=` | One-click unsubscribe from the digest (signed link, no login) |
| GET | `/lookup?url=` | Fill in title, difficulty, pattern and platform from a problem link |
| POST | `/lookup/batch` | Same, for up to 100 links (`urls`) |
| GET | `/stats?today=YYYY-MM-DD` | Everything the dashboard needs: progress, XP, level, streaks, calendar, breakdowns, next mission, reviews due, trophies |
| GET | `/health` | Health check |

The browser also sends an `X-Client-Date` header, so "today" means your local date.

**Live rooms (Socket.IO).** Connect to the same origin with `auth: { token }`. Joining a room happens over the REST API first, and sockets are only accepted into rooms their user belongs to; your identity always comes from the token, never from a payload.

- Room: client `room:join`, `room:chat`, `room:set_problem`; server `room:members`, `room:peer_joined`, `room:peer_left`, `room:chat_message` (with an `id`, saved with the room), `room:problem_changed`, `room:member_solved`, `room:challenge_update`, `room:battle_update` (a summary of every battle in the room), `room:closed`, `room:error`.
- Battle (only its two players hear these, on a per-battle channel): client `battle:subscribe`, `battle:ready`, `battle:settings_update`, `battle:settings_confirm`, `battle:code_update`, `battle:run`, `battle:submit`, `battle:exit`, `battle:rematch`; server `battle:state`, `battle:player_joined`, `battle:player_left`, `battle:countdown`, `battle:start`, `battle:opponent_code`, `battle:opponent_progress`, `battle:opponent_disconnected`, `battle:opponent_reconnected`, `battle:game_over`, `battle:cancelled`, `battle:rematch_started`, `battle:error`.
- Battle lifecycle: `waiting` (seat open) → `lobby` → `countdown` → `active` → `finished`; leaving before the start frees the seat (battle room) or calls it off (chat-room challenge). Timers make it prompt; if the server restarts, the same rules are applied the next time the battle is read. Grace periods: `BATTLE_DISCONNECT_GRACE_MS` (default 30s, running battle) and `BATTLE_LOBBY_GRACE_MS` (default 60s, before the start).

## Deploying

The app is one Node process: Express serves the API, the Socket.IO rooms and the built React client. It needs a **long-running Node host** (not serverless functions: rooms keep WebSockets open and timers run in the process) and a **MongoDB** database.

### What you need
| Piece | Recommended | Free tier |
|---|---|---|
| Database | [MongoDB Atlas](https://www.mongodb.com/atlas) | M0, 512 MB |
| App (API + client) | [Render](https://render.com), [Railway](https://railway.app), [Fly.io](https://fly.io) or [Koyeb](https://www.koyeb.com) | Render free (sleeps when idle) |
| Code running (Run/Submit, battles) | [Judge0 CE on RapidAPI](https://rapidapi.com/judge0-official/api/judge0-ce), or self-host with `judge0/` on a small VPS | RapidAPI basic plan |
| Optional | Anthropic API key (AI), any SMTP provider (digest emails) | |

### Environment variables (production)
| Variable | Required | Value |
|---|---|---|
| `MONGO_URI` | yes | Atlas connection string, e.g. `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/dsa-quest` |
| `JWT_SECRET` | yes | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_URL` | yes | your public URL(s), comma-separated, e.g. `https://dsa-quest.onrender.com` |
| `JUDGE0_API_KEY` or `JUDGE0_URL` | for Run/Submit | see `server/.env.example` |
| `ANTHROPIC_API_KEY` | no | AI hints, quizzes, automatic test cases |
| `SMTP_*`, `API_PUBLIC_URL` | no | password reset, email confirmation and weekly digest emails |
| `PORT` | no | set by the host automatically |

Don't set `NODE_ENV` yourself: `npm start` sets it, and a global `NODE_ENV=production` during the build would skip the client's build tools. The server refuses to start in production with a weak `JWT_SECRET` or without `MONGO_URI`, and the unsandboxed local code runner is off there (use Judge0).

### Option A: Render (simplest, from `render.yaml`)
1. Create an Atlas cluster, a database user, and allow access from `0.0.0.0/0` (Render's IPs change).
2. Render dashboard → **New → Web Service** → pick this repo, root directory empty, build `npm run install:all && npm run build`, start `npm start`, health check `/api/health`. (The `render.yaml` blueprint is set up for the API-only split, Option C.)
3. Fill in `MONGO_URI`, `CLIENT_URL` (the `https://<name>.onrender.com` URL Render shows you) and any optional keys. Deploy.

### Option B: Docker (Railway, Fly.io, Koyeb, any VPS)
```bash
docker build -t dsa-quest .
docker run -p 5000:5000 -e MONGO_URI=... -e JWT_SECRET=... -e CLIENT_URL=https://your.domain dsa-quest
```
Railway and Koyeb detect the `Dockerfile` automatically; add the variables above in their dashboard. On Fly.io: `fly launch` (it uses the Dockerfile; set the internal port to 5000), then `fly secrets set MONGO_URI=... JWT_SECRET=... CLIENT_URL=...`.

### Option C: split hosting
Client on [Vercel](https://vercel.com) or [Netlify](https://www.netlify.com) (root directory `client`, build `npm run build`, output `dist`; `client/vercel.json` already rewrites routes to the app) with `VITE_API_URL=https://<your-api-host>/api`. API on Render (root directory `server`, build `npm install`, start `npm start`; `render.yaml` is set up this way) or Railway, with `CLIENT_URL=https://<your-vercel-app>.vercel.app`, `API_PUBLIC_URL=https://<your-api-host>` and `SERVE_CLIENT=false`, so the API host answers `/` with a small JSON status instead of the website.

### Scaling and CI
Run **one** instance: online presence and battle timers live in the process (battles still settle correctly after a restart, the next time they are read). More instances would need Socket.IO's Redis adapter and a shared scheduler.

`.github/workflows/test.yml` runs the server tests on Node 20 and 22 and lints and builds the client on every push and pull request. `deploy.yml` is optional: after the tests pass on `main` it triggers a Render deploy hook and deploys the client to Vercel, once you add the repository variable `DEPLOY_ENABLED=true` and the secrets listed at the top of the file. With the single-service Render setup you don't need it: Render redeploys on every push to `main` by itself.

## Design decisions worth talking about in an interview

- **Stats are computed on the server in pure functions** (`stats.service.js`). That makes them easy to unit-test and keeps the client simple. XP is a Mongoose *virtual* derived from difficulty, so it can never drift out of sync with the data. The leaderboard and the study-room party reuse the same engine, so everyone's numbers always match their own dashboard.
- **Every query is scoped to the logged-in user** (`{ _id, user: req.userId }`). One user can't read or edit another user's problems, and tests check exactly that, including for rooms, saved code and shared packs.
- **Dates are stored as `YYYY-MM-DD` strings in the user's local time zone.** This avoids the classic bug where solving at 11 PM in India counts as "tomorrow" in UTC and breaks the streak. LeetCode sync takes your time-zone offset for the same reason.
- **Spaced repetition is scheduled lazily.** Instead of a migration, a solved problem with no schedule is simply due the day after you solved it. That also covers bulk imports, packs and LeetCode sync with no extra code, because nothing has to remember to set a date.
- **Sharing is built on "what leaves your account", not on trust.** Marketplace packs and room-mate maps are assembled from a fixed list of study-material fields, so notes, saved code, dates and attempts can't leak by accident, and tests assert it.
- **Realtime authorization is checked at the socket, not just the page.** A socket must carry a valid login for an account that still exists, can only join rooms it is a member of, and its chat and "pick a problem" events are ignored unless it is actually in that room. Chat is rate-limited per connection.
- **Reset and confirmation links are one-time and short-lived** (30 minutes and 24 hours). Only a SHA-256 hash of each is stored, and changing your password signs out every existing session.
- **Secrets are separated by purpose.** The one-click unsubscribe link is signed with a different key from login tokens, so a link that leaks from an email can switch off digests but can never be used to log in.
- **Only http(s) links are ever stored,** because a pack from one user ends up in another user's browser. User-provided text in emails is HTML-escaped, and Markdown notes never render raw HTML.
- **Offline support is careful about whose data it is.** The service worker caches your problems and stats network-first (so you never see stale data while online), and those caches are wiped on logout. Only a 401 signs you out; being offline or a server error never does.
- **Costly endpoints are rate-limited per signed-in user** (AI hints, code runs, LeetCode sync, publishing, test emails), and optional integrations degrade to a clear message rather than an error.
- **Validation happens at both layers:** Zod checks request shape at the API boundary, and Mongoose schema rules protect the data itself.
- **Security basics:** bcrypt with 12 rounds, the password hash is never returned (`select: false`), rate limiting on auth routes, Helmet headers, and the same error message for "wrong email" and "wrong password".
- **Theming uses CSS variables.** Both themes share the same Tailwind colour names (`bg-panel`, `text-ink`…), and the light theme just redefines the variables under `[data-theme='light']`, so components never need theme checks. Syntax highlighting and Monaco follow the theme too.
- **Duplicates are caught by normalized link.** `leetcode.com/problems/two-sum/description/?envType=…` and `https://www.leetcode.com/problems/two-sum` are the same problem. The same normalizer runs on the server (to refuse duplicates) and in the browser (to untick them in the import review).
- **Link lookup degrades gracefully.** It tries local data first and only calls LeetCode when needed, with a timeout. If everything fails it still guesses a title from the URL, so the user is never stuck. Tests run with `LOOKUP_OFFLINE=1`, so they never touch the network.
- **Heavy features load on demand.** Charts, the code editor, Markdown rendering and Socket.IO are all lazy-loaded, so none of them slow the first page load.

## Ideas for what to build next

- Daily goal setting and push notifications for due reviews
- Test cases per problem, so the code editor can judge a solution instead of only running it
- Public profile pages to share your progress
- Striver's SDE sheet and company-tagged packs
- A Redis adapter for Socket.IO so study rooms can scale past one server
