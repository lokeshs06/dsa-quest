import { spawnSync } from 'node:child_process';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { SPECS, casesFor } from '../src/data/arrayJudge.js';
import { arrayProblems } from '../src/data/arrayProblems.js';
import { buildRun } from '../src/services/judge.js';
import { startDb, registerUser } from './helpers.js';

const has = (cmd) => !spawnSync(cmd, ['--version']).error && spawnSync(cmd, ['--version']).status === 0;
const pythonOk = has('python');
const py = pythonOk ? test : test.skip;

let app;
let stop;
let user;
let other;
let problems;
const byTitle = (title) => problems.find((p) => p.title === title);

beforeAll(async () => {
  stop = await startDb();
  process.env.ENABLE_LOCAL_RUNNER = 'true'; // run the harness with the machine's own python and node
  app = createApp();
  user = await registerUser(app, 'Judge');
  other = await registerUser(app, 'Other');
  problems = (await request(app).get('/api/problems').set(user.headers()).expect(200)).body.problems;
}, 120000);

afterAll(async () => {
  delete process.env.ENABLE_LOCAL_RUNNER;
  await stop();
});

const submit = (code, language, mode, title = 'Largest Element', who = user) =>
  request(app).post(`/api/problems/${byTitle(title).id}/submit`).set(who.headers()).send({ code, language, mode });

describe('the test cases for all 25 starter problems', () => {
  test('every starter problem has a judge', () => {
    expect(Object.keys(SPECS)).toHaveLength(25);
    expect(arrayProblems.map((p) => p.order).sort((a, b) => a - b)).toEqual(Object.keys(SPECS).map(Number));
  });

  test.each(Object.keys(SPECS).map(Number))('problem %i has 3-5 visible and 25-50 hidden cases, all distinct', (order) => {
    const { visible, hidden } = casesFor(order);
    expect(visible.length).toBeGreaterThanOrEqual(3);
    expect(visible.length).toBeLessThanOrEqual(5);
    expect(hidden.length).toBeGreaterThanOrEqual(25);
    expect(hidden.length).toBeLessThanOrEqual(50);

    const keys = [...visible, ...hidden].map((c) => JSON.stringify(c.args));
    expect(new Set(keys).size).toBe(keys.length); // no repeats, and nothing hidden is also visible
    for (const c of [...visible, ...hidden]) expect(c.expected).not.toBeUndefined();
    for (const c of visible) expect(c.explanation).toBeTruthy();
  });

  test('the cases are the same every time', () => {
    expect(JSON.stringify(casesFor(18))).toBe(JSON.stringify(casesFor(18)));
  });

  test('hidden cases include edge cases, not only random ones', () => {
    expect(casesFor(1).hidden.some((c) => c.args[0].length === 1)).toBe(true);
    expect(casesFor(14).hidden.some((c) => c.args[0].length === 1)).toBe(true);
  });

  test('the generated Two Sum cases have exactly one answer', () => {
    for (const { args } of casesFor(18).hidden) {
      const [a, t] = args;
      let pairs = 0;
      for (let i = 0; i < a.length; i += 1) for (let j = i + 1; j < a.length; j += 1) if (a[i] + a[j] === t) pairs += 1;
      expect(pairs).toBe(1);
    }
  });

  test('the harness for each language carries the function name from the starter', () => {
    const spec = { order: 1, ...SPECS[1] };
    expect(buildRun(spec, 'python', 'def largest_element(arr): pass', []).program).toContain('largest_element(*_a)');
    expect(buildRun(spec, 'javascript', 'function largestElement(arr) {}', []).program).toContain('largestElement(...a)');
  });
});

describe('what the editor is given', () => {
  test('a function-only starter and only the visible cases', async () => {
    const { judge } = (await request(app).get(`/api/problems/${byTitle('Two Sum').id}`).set(user.headers()).expect(200)).body.problem;
    expect(judge.starter.python).toBe('def two_sum(nums, target):\n    # Exactly one pair adds up to target. Return the two indices (in any order).\n    pass\n');
    expect(judge.starter.javascript).toMatch(/^function twoSum\(nums, target\) \{/);
    expect(judge.starter.python).not.toMatch(/stdin|print|sys/); // just the function, no I/O boilerplate
    expect(judge.visibleCases.length).toBeGreaterThanOrEqual(3);
    expect(judge.visibleCases[0]).toMatchObject({ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]' });
    expect(judge.hiddenCount).toBeGreaterThanOrEqual(25);
  });

  test('the response contains no hidden input or answer', async () => {
    const body = JSON.stringify((await request(app).get(`/api/problems/${byTitle('Largest Element').id}`).set(user.headers()).expect(200)).body);
    for (const c of casesFor(1).hidden) expect(body).not.toContain(JSON.stringify(c.args[0]));
  });

  test('problems you added yourself have no judge', async () => {
    const mine = (await request(app).post('/api/problems').set(user.headers()).send({ title: 'My Own', difficulty: 'Easy', pattern: 'A', link: 'https://example.com/own' }).expect(201)).body.problem;
    expect((await request(app).get(`/api/problems/${mine.id}`).set(user.headers())).body.problem.judge).toBeNull();
    await request(app).post(`/api/problems/${mine.id}/submit`).set(user.headers()).send({ language: 'python', code: 'x = 1' }).expect(400);
  });
});

describe('judging JavaScript', () => {
  const RIGHT = 'function largestElement(arr) { return Math.max(...arr); }';

  test('a correct solution passes the visible cases on Run', async () => {
    const res = await submit(RIGHT, 'javascript', 'run').expect(200);
    expect(res.body).toMatchObject({ status: 'Accepted', passedAll: true, hidden: { total: 0 }, graded: true });
    expect(res.body.visible.every((c) => c.passed)).toBe(true);
    expect(res.body.saved).toBe(false); // Run never saves
  });

  test('Submit also passes every hidden case, reports only counts, and saves the code', async () => {
    const res = await submit(RIGHT, 'javascript', 'submit').expect(200);
    expect(res.body).toMatchObject({ status: 'Accepted', statusId: 3, passedAll: true, saved: true });
    expect(res.body.hidden.total).toBe(casesFor(1).hidden.length);
    expect(res.body.hidden.passed).toBe(res.body.hidden.total);
    expect(JSON.stringify(res.body)).not.toContain('"args"');
    const stored = (await request(app).get(`/api/problems/${byTitle('Largest Element').id}`).set(user.headers())).body.problem;
    expect(stored.savedCode.javascript).toBe(RIGHT);
  });

  test('a solution that only works on the visible cases fails a hidden one without revealing it', async () => {
    const cheat = 'function largestElement(arr) { return arr.length > 3 ? 90 : arr[1]; }';
    const res = await submit(cheat, 'javascript', 'submit').expect(200);
    expect(res.body.status).toBe('Wrong Answer');
    expect(res.body.passedAll).toBe(false);
    expect(res.body.hidden.passed).toBeLessThan(res.body.hidden.total);
    expect(res.body.hidden.firstFailed).toBeGreaterThan(0);
    expect(res.body.saved).toBe(false);
    const hiddenInputs = casesFor(1).hidden.map((c) => JSON.stringify(c.args[0]));
    expect(hiddenInputs.some((i) => JSON.stringify(res.body).includes(i))).toBe(false);
  });

  test('shows input, expected and actual for the visible cases that fail', async () => {
    const res = await submit('function largestElement(arr) { return arr[0]; }', 'javascript', 'run').expect(200);
    const failed = res.body.visible.find((c) => !c.passed);
    expect(failed).toMatchObject({ input: expect.stringContaining('arr = ['), expected: expect.any(String), actual: expect.any(String) });
  });

  test('an exception in one case is reported without losing the others', async () => {
    const res = await submit('function largestElement(arr) { if (arr.length === 5) throw new Error("boom"); return Math.max(...arr); }', 'javascript', 'run').expect(200);
    expect(res.body.status).toBe('Runtime Error');
    expect(res.body.visible.some((c) => c.error?.includes('boom'))).toBe(true);
    expect(res.body.visible.some((c) => c.passed)).toBe(true);
  });

  test('console.log output is kept apart from the answers', async () => {
    const res = await submit('function largestElement(arr) { console.log("debug", arr.length); return Math.max(...arr); }', 'javascript', 'run').expect(200);
    expect(res.body.status).toBe('Accepted');
    expect(res.body.stdout).toContain('debug');
    expect(res.body.stdout).not.toContain('__DSAQ__');
  });

  test('a function that modifies its argument in place is accepted', async () => {
    const res = await submit('function moveZeroes(nums) { let w = 0; for (const x of nums) if (x !== 0) nums[w++] = x; while (w < nums.length) nums[w++] = 0; }', 'javascript', 'submit', 'Move Zeroes').expect(200);
    expect(res.body).toMatchObject({ status: 'Accepted', passedAll: true });
  });

  test('answers that may come in any order are accepted in any order', async () => {
    const res = await submit('function twoSum(nums, target) { for (let i = 0; i < nums.length; i++) for (let j = 0; j < i; j++) if (nums[i] + nums[j] === target) return [i, j]; }', 'javascript', 'submit', 'Two Sum').expect(200);
    expect(res.body.status).toBe('Accepted'); // returns [larger, smaller], the samples list [smaller, larger]
  });

  test('a syntax error is reported as a failed run, not a verdict', async () => {
    const res = await submit('function largestElement(arr) { return ', 'javascript', 'run').expect(200);
    expect(res.body.graded).toBe(false);
    expect(res.body.statusId).not.toBe(3);
    expect(res.body.stderr).toMatch(/SyntaxError|Unexpected/);
  });

  test('an infinite loop times out', async () => {
    const res = await submit('function largestElement(arr) { while (true) {} }', 'javascript', 'run').expect(200);
    expect(res.body.status).toBe('Time Limit Exceeded');
  }, 20000);

  test('a missing function is a runtime error on every case', async () => {
    const res = await submit('const unrelated = 1;', 'javascript', 'run').expect(200);
    expect(res.body.status).toBe('Runtime Error');
    expect(res.body.visible.every((c) => /not defined/.test(c.error))).toBe(true);
  });
});

describe('judging Python', () => {
  py('a correct solution passes everything', async () => {
    const res = await submit('def largest_element(arr):\n    return max(arr)\n', 'python', 'submit').expect(200);
    expect(res.body).toMatchObject({ status: 'Accepted', passedAll: true });
    expect(res.body.hidden.passed).toBe(res.body.hidden.total);
  });

  py('a wrong solution is a Wrong Answer', async () => {
    const res = await submit('def largest_element(arr):\n    return arr[0]\n', 'python', 'submit').expect(200);
    expect(res.body.status).toBe('Wrong Answer');
  });

  py('returning a tuple or a set still compares as a list', async () => {
    const res = await submit('def intersection(a, b):\n    return set(a) & set(b)\n', 'python', 'submit', 'Intersection of Two Arrays').expect(200);
    expect(res.body.status).toBe('Accepted');
  });

  py('a boolean answer works', async () => {
    const res = await submit('def check_sorted_rotated(nums):\n    n = len(nums)\n    return sum(nums[i] > nums[(i + 1) % n] for i in range(n)) <= 1\n', 'python', 'submit', 'Check if Array Is Sorted and Rotated').expect(200);
    expect(res.body.status).toBe('Accepted');
  });

  py('print() output is kept apart from the answers', async () => {
    const res = await submit('def largest_element(arr):\n    print("dbg")\n    return max(arr)\n', 'python', 'run').expect(200);
    expect(res.body.stdout).toContain('dbg');
    expect(res.body.status).toBe('Accepted');
  });
});

// Independent implementations (different algorithms from the reference answers), so a mistake in a reference
// answer shows up as a correct solution being rejected.
const SOLUTIONS = {
  'Largest Element': 'function largestElement(arr){ let m=arr[0]; for (const x of arr) if (x>m) m=x; return m; }',
  'Second Largest Element': 'function secondLargest(arr){ let a=-Infinity,b=-Infinity; for (const x of arr){ if(x>a){b=a;a=x;} else if(x<a&&x>b) b=x; } return b===-Infinity?-1:b; }',
  'Second Smallest Element': 'function secondSmallest(arr){ let a=Infinity,b=Infinity; for (const x of arr){ if(x<a){b=a;a=x;} else if(x>a&&x<b) b=x; } return b===Infinity?-1:b; }',
  'Check if Array Is Sorted and Rotated': 'function checkSortedRotated(nums){ const n=nums.length; for(let r=0;r<n;r++){ let ok=true; for(let i=1;i<n;i++) if(nums[(r+i-1)%n]>nums[(r+i)%n]){ok=false;break;} if(ok) return true; } return false; }',
  'Remove Duplicates from Sorted Array': 'function removeDuplicates(nums){ let k=0; for(let i=0;i<nums.length;i++) if(i===0||nums[i]!==nums[i-1]) nums[k++]=nums[i]; return k; }',
  'Left Rotate an Array by One': 'function leftRotateOne(arr){ if(arr.length) arr.push(arr.shift()); return arr; }',
  'Left Rotate the Array by K Places': 'function leftRotateK(arr,k){ const n=arr.length; for(let i=0;i<k%n;i++) arr.push(arr.shift()); return arr; }',
  'Right Rotate the Array by One Place': 'function rightRotateOne(arr){ if(arr.length) arr.unshift(arr.pop()); return arr; }',
  'Rotate Array': 'function rightRotateK(nums,k){ const n=nums.length; const out=new Array(n); for(let i=0;i<n;i++) out[(i+k)%n]=nums[i]; for(let i=0;i<n;i++) nums[i]=out[i]; }',
  'Move Zeroes': 'function moveZeroes(nums){ let w=0; for(let i=0;i<nums.length;i++) if(nums[i]!==0){ const t=nums[w]; nums[w]=nums[i]; nums[i]=t; w++; } return nums; }',
  'Linear Search': 'function linearSearch(arr,target){ for(let i=0;i<arr.length;i++) if(arr[i]===target) return i; return -1; }',
  'Union of Two Sorted Arrays': 'function unionSorted(a,b){ const out=[]; let i=0,j=0; const push=(x)=>{ if(!out.length||out[out.length-1]!==x) out.push(x); }; while(i<a.length||j<b.length){ if(j>=b.length||(i<a.length&&a[i]<=b[j])) push(a[i++]); else push(b[j++]); } return out; }',
  'Intersection of Two Arrays': 'function intersection(a,b){ const s=new Set(b); const out=new Set(); for(const x of a) if(s.has(x)) out.add(x); return [...out]; }',
  'Missing Number': 'function missingNumber(nums){ let x=nums.length; nums.forEach((v,i)=>{ x^=i^v; }); return x; }',
  'Max Consecutive Ones': 'function maxConsecutiveOnes(nums){ return Math.max(0, ...nums.join("").split("0").map((s)=>s.length)); }',
  'Single Number': 'function singleNumber(nums){ const c=new Map(); for(const x of nums) c.set(x,(c.get(x)||0)+1); for(const [k,v] of c) if(v===1) return k; }',
  'Subarray Sum Equals K': 'function subarraySum(nums,k){ const seen=new Map([[0,1]]); let s=0,c=0; for(const x of nums){ s+=x; c+=seen.get(s-k)||0; seen.set(s,(seen.get(s)||0)+1); } return c; }',
  'Two Sum': 'function twoSum(nums,target){ const m=new Map(); for(let i=0;i<nums.length;i++){ if(m.has(target-nums[i])) return [m.get(target-nums[i]),i]; m.set(nums[i],i); } }',
  'Sort Colors': 'function sortColors(nums){ const c=[0,0,0]; for(const x of nums) c[x]++; let i=0; for(let v=0;v<3;v++) while(c[v]--) nums[i++]=v; }',
  'Majority Element': 'function majorityElement(nums){ let cand=null,n=0; for(const x of nums){ if(n===0) cand=x; n+=x===cand?1:-1; } return cand; }',
  'Maximum Subarray': 'function maxSubarray(nums){ let best=-Infinity; for(let i=0;i<nums.length;i++){ let s=0; for(let j=i;j<nums.length;j++){ s+=nums[j]; if(s>best) best=s; } } return best; }',
  'Best Time to Buy and Sell Stock': 'function maxProfit(prices){ let best=0; for(let i=0;i<prices.length;i++) for(let j=i+1;j<prices.length;j++) best=Math.max(best,prices[j]-prices[i]); return best; }',
  'Rearrange Array Elements by Sign': 'function rearrangeBySign(nums){ const out=new Array(nums.length); let p=0,n=1; for(const x of nums){ if(x>0){out[p]=x;p+=2;} else {out[n]=x;n+=2;} } return out; }',
  'Next Permutation': 'function nextPermutation(nums){ const n=nums.length; let i=n-2; while(i>=0&&nums[i]>=nums[i+1]) i--; if(i>=0){ let j=n-1; while(nums[j]<=nums[i]) j--; [nums[i],nums[j]]=[nums[j],nums[i]]; } let l=i+1,r=n-1; while(l<r){ [nums[l],nums[r]]=[nums[r],nums[l]]; l++; r--; } return nums; }',
  'Leaders in an Array': 'function leaders(arr){ const out=[]; for(let i=0;i<arr.length;i++){ let ok=true; for(let j=i+1;j<arr.length;j++) if(arr[j]>=arr[i]){ok=false;break;} if(ok) out.push(arr[i]); } return out; }',
};

describe('every problem accepts an independent correct solution', () => {
  test('there is a solution for each of the 25', () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(arrayProblems.map((p) => p.title).sort());
  });
  test.each(Object.keys(SOLUTIONS))('%s', async (title) => {
    const res = await submit(SOLUTIONS[title], 'javascript', 'submit', title).expect(200);
    const failing = res.body.visible.filter((c) => !c.passed);
    expect({ status: res.body.status, hidden: res.body.hidden, failing }).toEqual({ status: 'Accepted', hidden: { total: casesFor(arrayProblems.find((p) => p.title === title).order).hidden.length, passed: res.body.hidden.total, firstFailed: null }, failing: [] });
  }, 20000);
});

describe('guards', () => {
  test('only judged languages are accepted', async () => {
    await submit('x', 'cobol', 'run').expect(400);
  });
  test('empty code is refused', async () => {
    await submit('   ', 'python', 'run').expect(400);
  });
  test('you cannot submit to someone else’s problem', async () => {
    await submit('function largestElement(a){return 1}', 'javascript', 'run', 'Largest Element', other).expect(404);
  });
  test('needs a login', async () => {
    await request(app).post(`/api/problems/${byTitle('Largest Element').id}/submit`).send({ language: 'python', code: 'x' }).expect(401);
  });
});

// One correct solution per return shape (int, bool, array; array+int and two-array params) in each compiled language
const SOLS = {
  typescript: {
    'Largest Element': 'function largestElement(arr: number[]): number { return Math.max(...arr); }',
    'Check if Array Is Sorted and Rotated': 'function checkSortedRotated(nums: number[]): boolean { let d = 0; for (let i = 0; i < nums.length; i++) if (nums[i] > nums[(i + 1) % nums.length]) d++; return d <= 1; }',
    'Left Rotate the Array by K Places': 'function leftRotateK(arr: number[], k: number): number[] { const n = arr.length; return arr.map((_, i) => arr[(i + k) % n]); }',
    'Union of Two Sorted Arrays': 'function unionSorted(a: number[], b: number[]): number[] { return [...new Set([...a, ...b])].sort((x, y) => x - y); }',
  },
  java: {
    'Largest Element': 'import java.util.*;\nclass Solution { public int largestElement(int[] arr) { int m = arr[0]; for (int x : arr) m = Math.max(m, x); return m; } }',
    'Check if Array Is Sorted and Rotated': 'class Solution { public boolean checkSortedRotated(int[] nums) { int d = 0, n = nums.length; for (int i = 0; i < n; i++) if (nums[i] > nums[(i + 1) % n]) d++; return d <= 1; } }',
    'Left Rotate the Array by K Places': 'class Solution { public int[] leftRotateK(int[] arr, int k) { int n = arr.length; int[] r = new int[n]; for (int i = 0; i < n; i++) r[i] = arr[(i + k) % n]; return r; } }',
    'Union of Two Sorted Arrays': 'import java.util.*;\nclass Solution { public int[] unionSorted(int[] a, int[] b) { TreeSet<Integer> s = new TreeSet<>(); for (int x : a) s.add(x); for (int x : b) s.add(x); return s.stream().mapToInt(Integer::intValue).toArray(); } }',
  },
  cpp: {
    'Largest Element': 'int largestElement(vector<int>& arr) { return *max_element(arr.begin(), arr.end()); }',
    'Check if Array Is Sorted and Rotated': 'bool checkSortedRotated(vector<int>& nums) { int d = 0, n = nums.size(); for (int i = 0; i < n; i++) if (nums[i] > nums[(i + 1) % n]) d++; return d <= 1; }',
    'Left Rotate the Array by K Places': 'vector<int> leftRotateK(vector<int>& arr, int k) { int n = arr.size(); vector<int> r(n); for (int i = 0; i < n; i++) r[i] = arr[(i + k) % n]; return r; }',
    'Union of Two Sorted Arrays': 'vector<int> unionSorted(vector<int>& a, vector<int>& b) { set<int> s(a.begin(), a.end()); s.insert(b.begin(), b.end()); return vector<int>(s.begin(), s.end()); }',
  },
  c: {
    'Largest Element': 'int largestElement(int* arr, int arrSize) { int m = arr[0]; for (int i = 0; i < arrSize; i++) if (arr[i] > m) m = arr[i]; return m; }',
    'Check if Array Is Sorted and Rotated': 'bool checkSortedRotated(int* nums, int numsSize) { int d = 0; for (int i = 0; i < numsSize; i++) if (nums[i] > nums[(i + 1) % numsSize]) d++; return d <= 1; }',
    'Left Rotate the Array by K Places': 'int* leftRotateK(int* arr, int arrSize, int k, int* returnSize) { int* r = malloc(sizeof(int) * (arrSize ? arrSize : 1)); for (int i = 0; i < arrSize; i++) r[i] = arr[(i + k) % arrSize]; *returnSize = arrSize; return r; }',
    'Union of Two Sorted Arrays': 'int* unionSorted(int* a, int aSize, int* b, int bSize, int* returnSize) { int* r = malloc(sizeof(int) * (aSize + bSize + 1)); int n = 0, i = 0, j = 0; while (i < aSize || j < bSize) { int v = (j >= bSize || (i < aSize && a[i] <= b[j])) ? a[i++] : b[j++]; if (n == 0 || r[n - 1] != v) r[n++] = v; } *returnSize = n; return r; }',
  },
};
const STARTER_TITLE = 'Largest Element';
const toolchain = { typescript: ['node'], java: ['java'], cpp: ['g++'], c: ['gcc'] };
const available = (lang) => toolchain[lang].every(has) && (lang !== 'java' || has('javac') || true);

describe.each(Object.keys(SOLS))('%s function judging', (lang) => {
  const t = available(lang) ? test : test.skip;
  t.each(Object.keys(SOLS[lang]))('%s is accepted', async (title) => {
    const res = await submit(SOLS[lang][title], lang, 'submit', title).expect(200);
    expect({ status: res.body.status, error: res.body.compileOutput || res.body.stderr, failing: res.body.visible?.filter((c) => !c.passed), hidden: res.body.hidden?.firstFailed }).toEqual({ status: 'Accepted', error: expect.anything(), failing: [], hidden: null });
  }, 60000);
  t('the untouched starter is a wrong answer, not a crash', async () => {
    const starter = (await request(app).get(`/api/problems/${byTitle(STARTER_TITLE).id}`).set(user.headers())).body.problem.judge.starter[lang];
    const res = await submit(starter, lang, 'run').expect(200);
    expect(res.body.graded).toBe(true);
    expect(res.body.status).toBe('Wrong Answer');
  }, 60000);
  t('a compile error is reported, not graded', async () => {
    const res = await submit('this is not code', lang, 'run').expect(200);
    expect(res.body.graded).toBe(false);
    expect(res.body.statusId).not.toBe(3);
  }, 60000);
});

describe('starters for every language', () => {
  test('are only the function, and cover all 8 languages for all 25 problems', () => {
    for (const p of arrayProblems) {
      const spec = { order: p.order, ...SPECS[p.order] };
      for (const lang of ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust']) {
        const code = buildRun(spec, lang, 'USER_CODE', casesFor(p.order).visible).program;
        expect(code).toContain('USER_CODE');
        expect(code).toContain('__DSAQ__');
      }
    }
  });
  test('the API sends a starter and function name per language', async () => {
    const { judge } = (await request(app).get(`/api/problems/${byTitle('Two Sum').id}`).set(user.headers())).body.problem;
    expect(judge.languages).toHaveLength(8);
    expect(judge.starter.java).toContain('class Solution');
    expect(judge.starter.go).toContain('func twoSum(');
    expect(judge.starter.rust).toContain('fn two_sum(');
    expect(judge.starter.c).toContain('int* returnSize');
    expect(judge.starter.cpp).toContain('vector<int> twoSum(vector<int>& nums, int target)');
  });
});
