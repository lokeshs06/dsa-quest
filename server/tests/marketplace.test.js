import request from 'supertest';
import { createApp } from '../src/app.js';
import { Problem } from '../src/models/Problem.js';
import { CustomPack } from '../src/models/CustomPack.js';
import { startDb, registerUser, createProblem } from './helpers.js';

let app;
let stop;

beforeAll(async () => {
  stop = await startDb();
  app = createApp();
}, 120000);

afterAll(async () => {
  await stop();
});

const publish = (user, body) => request(app).post('/api/marketplace').set(user.headers()).send(body);
const topicSource = (topic) => ({ type: 'topic', topic });
const addById = (user, id) => request(app).post(`/api/marketplace/${id}/add`).set(user.headers());
const browse = (user, query = '') => request(app).get(`/api/marketplace${query}`).set(user.headers());
const ids = async (user) => (await request(app).get('/api/problems').set(user.headers())).body.problems;

// Gives a user a small topic of their own to publish
async function userWithTopic(name, topic, count = 3) {
  const user = await registerUser(app, name);
  const problems = [];
  for (let i = 0; i < count; i += 1) {
    problems.push(await createProblem(app, user, { title: `${topic} ${i + 1}`, link: `https://example.com/${topic.replace(/\W/g, '')}/${i + 1}`, topic, difficulty: ['Easy', 'Medium', 'Hard'][i % 3], pattern: 'Graphs', keyConcept: `idea ${i + 1}`, optimal: `plan ${i + 1}` }));
  }
  return { user, problems };
}

describe('publishing a pack', () => {
  test('from one of your topics', async () => {
    const { user } = await userWithTopic('Maker', 'Graph Drills', 4);
    const res = await publish(user, { name: 'Graph Drills', description: 'Warm-ups for graphs', isPublic: true, source: topicSource('Graph Drills') }).expect(201);
    expect(res.body.pack).toMatchObject({
      name: 'Graph Drills',
      description: 'Warm-ups for graphs',
      topic: 'Graph Drills',
      count: 4,
      isPublic: true,
      mine: true,
      author: 'Maker',
      importCount: 0,
    });
    expect(res.body.pack.difficulty).toEqual([{ difficulty: 'Easy', count: 2 }, { difficulty: 'Medium', count: 1 }, { difficulty: 'Hard', count: 1 }]);
    expect(res.body.pack.shareCode).toMatch(/^[\w-]{8}$/);
    expect(res.body.pack.problems).toBeUndefined(); // summaries never carry the whole list
  });

  test('from hand-picked problems', async () => {
    const { user, problems } = await userWithTopic('Picker', 'Picked', 5);
    const res = await publish(user, { name: 'Just Two', source: { type: 'ids', ids: [problems[0].id, problems[3].id] } }).expect(201);
    expect(res.body.pack).toMatchObject({ count: 2, isPublic: false });
  });

  test('can only ever include your own problems', async () => {
    const { problems } = await userWithTopic('Victim', 'Victim Topic', 2);
    const thief = await registerUser(app, 'Thief');
    const res = await publish(thief, { name: 'Stolen goods', source: { type: 'ids', ids: problems.map((p) => p.id) } }).expect(400);
    expect(res.body.message).toMatch(/no matching problems/);
    await publish(thief, { name: 'Stolen topic', source: topicSource('Victim Topic') }).expect(400);
  });

  test('shares study material only: nothing personal travels with it', async () => {
    const owner = await registerUser(app, 'Private Owner');
    const p = await createProblem(app, owner, { title: 'Secretive', link: 'https://example.com/secretive', topic: 'Secrets', status: 'Solved', notes: 'MY PRIVATE NOTES', attempts: 7, important: true, keyConcept: 'shareable idea' });
    await request(app).put(`/api/problems/${p.id}/code`).set(owner.headers()).send({ language: 'python', code: 'MY_SECRET_CODE()' }).expect(200);
    const pack = (await publish(owner, { name: 'Secrets Pack', isPublic: true, source: topicSource('Secrets') }).expect(201)).body.pack;

    const reader = await registerUser(app, 'Reader');
    const res = await request(app).get(`/api/marketplace/${pack.id}`).set(reader.headers()).expect(200);
    // Only the study material: the problem itself and how to solve it
    expect(Object.keys(res.body.problems[0]).sort()).toEqual(['bruteForce', 'difficulty', 'keyConcept', 'link', 'optimal', 'pattern', 'platform', 'spaceComplexity', 'timeComplexity', 'title']);
    const everything = JSON.stringify(res.body);
    for (const secret of ['MY PRIVATE NOTES', 'MY_SECRET_CODE', owner.email, owner.id]) expect(everything).not.toContain(secret);
  });

  test('drops links that are not plain http(s)', async () => {
    const owner = await registerUser(app, 'Link Owner');
    await Problem.create({ user: owner.id, title: 'Nasty', link: 'javascript:alert(1)', topic: 'Nasty Topic', difficulty: 'Easy', pattern: 'A', order: 1 });
    const pack = (await publish(owner, { name: 'Nasty Pack', source: topicSource('Nasty Topic') }).expect(201)).body.pack;
    const res = await request(app).get(`/api/marketplace/${pack.id}`).set(owner.headers()).expect(200);
    expect(res.body.problems[0].link).toBe('');
  });

  test('validates the request', async () => {
    const { user } = await userWithTopic('Validator', 'Valid Topic');
    await publish(user, { name: 'ab', source: topicSource('Valid Topic') }).expect(400);
    await publish(user, { name: 'Fine Name', source: { type: 'ids', ids: [] } }).expect(400);
    await publish(user, { name: 'Fine Name', source: { type: 'ids', ids: ['nope'] } }).expect(400);
    await publish(user, { name: 'Fine Name', source: { type: 'topic' } }).expect(400);
    await publish(user, { name: 'Fine Name' }).expect(400);
    await publish(user, { name: 'Empty Topic', source: topicSource('No Such Topic') }).expect(400);
  });

  test('a person can keep only so many packs', async () => {
    const { user } = await userWithTopic('Hoarder', 'Hoard', 1);
    for (let i = 0; i < 20; i += 1) await publish(user, { name: `Pack number ${i}`, source: topicSource('Hoard') }).expect(201);
    const res = await publish(user, { name: 'One more', source: topicSource('Hoard') }).expect(409);
    expect(res.body.message).toMatch(/up to 20/);
  });

  test('needs a login', async () => {
    await request(app).post('/api/marketplace').send({ name: 'Anon Pack', source: topicSource('x') }).expect(401);
    await request(app).get('/api/marketplace').expect(401);
  });
});

describe('browsing', () => {
  let author;
  let reader;
  let pub;
  let priv;

  beforeAll(async () => {
    ({ user: author } = await userWithTopic('Browse Author', 'Browse Topic', 3));
    reader = await registerUser(app, 'Browse Reader');
    pub = (await publish(author, { name: 'Dynamic Programming Starter', description: 'Knapsack and friends', isPublic: true, source: topicSource('Browse Topic') }).expect(201)).body.pack;
    priv = (await publish(author, { name: 'Hidden Gems', isPublic: false, source: topicSource('Browse Topic') }).expect(201)).body.pack;
  });

  test('shows public packs with their author, and never private ones', async () => {
    const { packs } = (await browse(reader).expect(200)).body;
    const listed = packs.find((p) => p.id === pub.id);
    expect(listed).toMatchObject({ name: 'Dynamic Programming Starter', author: 'Browse Author', mine: false, count: 3 });
    expect(packs.find((p) => p.id === priv.id)).toBeUndefined();
  });

  test('can be searched by name or description', async () => {
    expect((await browse(reader, '?q=dynamic').expect(200)).body.packs.map((p) => p.id)).toEqual([pub.id]);
    expect((await browse(reader, '?q=KNAPSACK').expect(200)).body.packs.map((p) => p.id)).toEqual([pub.id]);
    expect((await browse(reader, '?q=zzzzzz').expect(200)).body.packs).toEqual([]);
  });

  test('treats search text literally, not as a pattern', async () => {
    expect((await browse(reader, '?q=.*').expect(200)).body.packs).toEqual([]);
    expect((await browse(reader, '?q=(').expect(200)).body.packs).toEqual([]);
  });

  test('can be sorted by popularity or recency, and rejects other sorts', async () => {
    const newer = (await publish(author, { name: 'Brand New Pack', isPublic: true, source: topicSource('Browse Topic') }).expect(201)).body.pack;
    await addById(reader, pub.id).expect(200); // makes the older pack more popular

    const popular = (await browse(reader, '?sort=popular').expect(200)).body.packs.map((p) => p.id);
    const recent = (await browse(reader, '?sort=new').expect(200)).body.packs.map((p) => p.id);
    expect(popular.indexOf(pub.id)).toBeLessThan(popular.indexOf(newer.id));
    expect(recent.indexOf(newer.id)).toBeLessThan(recent.indexOf(pub.id));
    await browse(reader, '?sort=chaos').expect(400);
  });

  test('"my packs" lists everything you published, private included', async () => {
    const mine = (await request(app).get('/api/marketplace/mine').set(author.headers()).expect(200)).body.packs;
    expect(mine.map((p) => p.id)).toEqual(expect.arrayContaining([pub.id, priv.id]));
    expect(mine.every((p) => p.mine)).toBe(true);
    expect((await request(app).get('/api/marketplace/mine').set(reader.headers()).expect(200)).body.packs).toEqual([]);
  });

  test('a public pack can be opened by id, a private one only by its owner', async () => {
    const asReader = await request(app).get(`/api/marketplace/${pub.id}`).set(reader.headers()).expect(200);
    expect(asReader.body.problems).toHaveLength(3);
    await request(app).get(`/api/marketplace/${priv.id}`).set(reader.headers()).expect(404);
    await request(app).get(`/api/marketplace/${priv.id}`).set(author.headers()).expect(200);
    await request(app).get('/api/marketplace/not-an-id').set(reader.headers()).expect(400);
  });

  test('a private pack is reachable by its share code, which only the owner can see', async () => {
    const asReader = await request(app).get(`/api/marketplace/code/${priv.shareCode}`).set(reader.headers()).expect(200);
    expect(asReader.body.pack.name).toBe('Hidden Gems');
    expect(asReader.body.pack.shareCode).toBeUndefined();
    expect(priv.shareCode).toBeTruthy();
    await request(app).get('/api/marketplace/code/doesnotexist').set(reader.headers()).expect(404);
  });
});

describe('adding a pack to your map', () => {
  let author;
  let pack;
  beforeAll(async () => {
    ({ user: author } = await userWithTopic('Import Author', 'Import Topic', 3));
    pack = (await publish(author, { name: 'Importable', isPublic: true, source: topicSource('Import Topic') }).expect(201)).body.pack;
  });
  const importCount = async (viewer) => (await browse(viewer).expect(200)).body.packs.find((p) => p.id === pack.id).importCount;

  test('adds fresh problems to the end of your map under the pack’s topic, with none of the author’s progress', async () => {
    const taker = await registerUser(app, 'Taker');
    const before = (await ids(taker)).length;
    const res = await addById(taker, pack.id).expect(200);
    expect(res.body).toMatchObject({ added: 3, skipped: 0, pack: { id: pack.id, name: 'Importable' } });

    const after = await ids(taker);
    expect(after).toHaveLength(before + 3);
    const added = after.filter((p) => p.topic === 'Importable');
    expect(added.map((p) => p.title)).toEqual(['Import Topic 1', 'Import Topic 2', 'Import Topic 3']);
    expect(added.every((p) => p.status === 'Not Started' && p.notes === '' && p.attempts === 0)).toBe(true);
    expect(Math.min(...added.map((p) => p.order))).toBeGreaterThan(before);
    expect(added[0]).toMatchObject({ keyConcept: 'idea 1', optimal: 'plan 1' });
  });

  test('counts towards popularity once per person, and skips what you already have', async () => {
    const taker = await registerUser(app, 'Second Taker');
    const before = await importCount(taker);
    await addById(taker, pack.id).expect(200);
    const again = await addById(taker, pack.id).expect(200);
    expect(again.body).toMatchObject({ added: 0, skipped: 3 });
    expect(await importCount(taker)).toBe(before + 1);
  });

  test('skips problems you already have', async () => {
    const owner = await registerUser(app, 'Partial Owner');
    await createProblem(app, owner, { title: 'Mine already', link: 'https://example.com/ImportTopic/2' });
    const res = await addById(owner, pack.id).expect(200);
    expect(res.body).toMatchObject({ added: 2, skipped: 1 });
  });

  test('the author adding their own pack does not inflate its popularity', async () => {
    const before = await importCount(author);
    await Problem.deleteMany({ user: author.id, topic: 'Importable' });
    await addById(author, pack.id).expect(200);
    expect(await importCount(author)).toBe(before);
  });

  test('works for a private pack through its share code', async () => {
    const privatePack = (await publish(author, { name: 'Private Importable', source: topicSource('Import Topic') }).expect(201)).body.pack;
    const taker = await registerUser(app, 'Code Taker');
    await addById(taker, privatePack.id).expect(404); // not by id
    const res = await request(app).post(`/api/marketplace/code/${privatePack.shareCode}/add`).set(taker.headers()).expect(200);
    expect(res.body.added).toBe(3);
  });

  test('is refused for packs that are not there', async () => {
    const taker = await registerUser(app, 'Nobody');
    await addById(taker, '64b64b64b64b64b64b64b64b').expect(404);
    await request(app).post('/api/marketplace/code/nope/add').set(taker.headers()).expect(404);
  });
});

describe('managing your packs', () => {
  let owner;
  let other;
  let pack;
  beforeAll(async () => {
    ({ user: owner } = await userWithTopic('Pack Owner', 'Managed Topic', 2));
    other = await registerUser(app, 'Other Person');
    pack = (await publish(owner, { name: 'Managed Pack', description: 'v1', isPublic: true, source: topicSource('Managed Topic') }).expect(201)).body.pack;
  });

  test('the owner can rename, re-describe and hide it', async () => {
    const res = await request(app).patch(`/api/marketplace/${pack.id}`).set(owner.headers()).send({ name: 'Renamed Pack', description: 'v2', isPublic: false }).expect(200);
    expect(res.body.pack).toMatchObject({ name: 'Renamed Pack', description: 'v2', isPublic: false });
    expect((await browse(other).expect(200)).body.packs.find((p) => p.id === pack.id)).toBeUndefined();

    await request(app).patch(`/api/marketplace/${pack.id}`).set(owner.headers()).send({ isPublic: true }).expect(200);
    expect((await browse(other).expect(200)).body.packs.find((p) => p.id === pack.id)).toBeDefined();
  });

  test('the problems in a published pack cannot be edited through the API', async () => {
    const res = await request(app).patch(`/api/marketplace/${pack.id}`).set(owner.headers()).send({ problems: [], count: 999, importCount: 999, owner: other.id }).expect(400);
    expect(res.body.message).toMatch(/at least one field/);
    const stored = await CustomPack.findById(pack.id);
    expect(stored.count).toBe(2);
    expect(stored.owner.toString()).toBe(owner.id);
  });

  test('validates edits', async () => {
    await request(app).patch(`/api/marketplace/${pack.id}`).set(owner.headers()).send({ name: 'x' }).expect(400);
    await request(app).patch(`/api/marketplace/${pack.id}`).set(owner.headers()).send({}).expect(400);
  });

  test('nobody else can edit or delete it', async () => {
    await request(app).patch(`/api/marketplace/${pack.id}`).set(other.headers()).send({ name: 'Hijacked' }).expect(404);
    await request(app).delete(`/api/marketplace/${pack.id}`).set(other.headers()).expect(404);
    expect((await CustomPack.findById(pack.id)).name).toBe('Renamed Pack');
  });

  test('deleting a pack leaves the problems people already added', async () => {
    const taker = await registerUser(app, 'Keeper');
    await addById(taker, pack.id).expect(200);
    await request(app).delete(`/api/marketplace/${pack.id}`).set(owner.headers()).expect(200);
    await request(app).get(`/api/marketplace/${pack.id}`).set(owner.headers()).expect(404);
    expect((await ids(taker)).filter((p) => p.topic === 'Renamed Pack')).toHaveLength(2);
  });
});

describe('reporting', () => {
  let author;
  let pack;
  beforeAll(async () => {
    ({ user: author } = await userWithTopic('Reported Author', 'Reported Topic', 1));
    pack = (await publish(author, { name: 'Dubious Pack', isPublic: true, source: topicSource('Reported Topic') }).expect(201)).body.pack;
  });
  const report = (user) => request(app).post(`/api/marketplace/${pack.id}/report`).set(user.headers());
  const visible = async (viewer) => (await browse(viewer).expect(200)).body.packs.some((p) => p.id === pack.id);

  test('you cannot report your own pack', async () => {
    await report(author).expect(400);
  });

  test('the same person reporting repeatedly counts once', async () => {
    const grumbler = await registerUser(app, 'Grumbler');
    for (let i = 0; i < 6; i += 1) await report(grumbler).expect(200);
    expect(await visible(grumbler)).toBe(true);
  });

  test('enough different people reporting hides it from browsing, but not from its author', async () => {
    const reporters = [];
    for (let i = 0; i < 4; i += 1) reporters.push(await registerUser(app, `Reporter ${i}`));
    for (const r of reporters) await report(r).expect(200);
    expect(await visible(author)).toBe(false); // 1 (grumbler) + 4 = 5 distinct reporters

    const mine = (await request(app).get('/api/marketplace/mine').set(author.headers()).expect(200)).body.packs;
    expect(mine.find((p) => p.id === pack.id)).toMatchObject({ hidden: true });
    await request(app).get(`/api/marketplace/${pack.id}`).set(reporters[0].headers()).expect(404);
    await report(reporters[0]).expect(404); // hidden packs can't be reported again
    await addById(reporters[0], pack.id).expect(404);
  });

  test('private packs cannot be reported', async () => {
    const privatePack = (await publish(author, { name: 'Private One', source: topicSource('Reported Topic') }).expect(201)).body.pack;
    const visitor = await registerUser(app, 'Visitor');
    await request(app).post(`/api/marketplace/${privatePack.id}/report`).set(visitor.headers()).expect(404);
  });
});
