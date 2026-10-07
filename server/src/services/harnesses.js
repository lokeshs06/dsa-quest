// Function-only starters and test harnesses for every judged language.
//
// Python, JavaScript and TypeScript read the cases as JSON. The compiled languages read a plain token stream
// instead (the case count, then for each argument either one number, or a length followed by that many numbers),
// so no JSON parser is needed in C or C++. Every harness prints "__DSAQ__" followed by a JSON array with one
// { ok, value } or { ok, error } entry per case, after anything the user's own code printed.

export const MARKER = '__DSAQ__';
export const LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'];

// Names: Python and Rust use snake_case, everything else camelCase
export const functionNames = (spec) => ({
  python: spec.name[0], rust: spec.name[0], javascript: spec.name[1], typescript: spec.name[1], java: spec.name[1], cpp: spec.name[1], c: spec.name[1], go: spec.name[1],
});

const list = (spec, f) => spec.params.map((p, i) => f(p, spec.types[i], i));
const callArgs = (spec) => spec.params.map((_, i) => `p${i}`).join(', ');

// ---------------------------------------------------------------- starters (just the function)
export function starterFor(spec, language, ret) {
  const n = functionNames(spec)[language];
  const doc = spec.doc;
  const mutate = spec.mutates ? ' Return the array.' : '';
  switch (language) {
    case 'python':
      return `def ${n}(${spec.params.join(', ')}):\n    # ${doc}\n    pass\n`;
    case 'javascript':
      return `function ${n}(${spec.params.join(', ')}) {\n  // ${doc}\n}\n`;
    case 'typescript': {
      const t = { arr: 'number[]', int: 'number', bool: 'boolean' };
      return `function ${n}(${list(spec, (p, ty) => `${p}: ${t[ty]}`).join(', ')}): ${t[ret]} {\n  // ${doc}\n  ${ret === 'arr' ? 'return [];' : ret === 'bool' ? 'return false;' : 'return 0;'}\n}\n`;
    }
    case 'java': {
      const t = { arr: 'int[]', int: 'int', bool: 'boolean' };
      const body = ret === 'arr' ? 'return new int[0];' : ret === 'bool' ? 'return false;' : 'return 0;';
      return `class Solution {\n    public ${t[ret]} ${n}(${list(spec, (p, ty) => `${t[ty]} ${p}`).join(', ')}) {\n        // ${doc}\n        ${body}\n    }\n}\n`;
    }
    case 'cpp': {
      const t = { arr: 'vector<int>&', int: 'int', bool: 'bool' };
      const rt = ret === 'arr' ? 'vector<int>' : ret === 'bool' ? 'bool' : 'int';
      const body = ret === 'arr' ? 'return {};' : ret === 'bool' ? 'return false;' : 'return 0;';
      return `${rt} ${n}(${list(spec, (p, ty) => `${t[ty]} ${p}`).join(', ')}) {\n    // ${doc}\n    ${body}\n}\n`;
    }
    case 'c': {
      const params = list(spec, (p, ty) => (ty === 'arr' ? `int* ${p}, int ${p}Size` : `int ${p}`));
      if (ret === 'arr') params.push('int* returnSize');
      const rt = ret === 'arr' ? 'int*' : ret === 'bool' ? 'bool' : 'int';
      const body = ret === 'arr' ? `// Return a malloc'd array and set *returnSize to its length.${mutate}\n    *returnSize = 0;\n    return NULL;` : ret === 'bool' ? 'return false;' : 'return 0;';
      return `${rt} ${n}(${params.join(', ')}) {\n    // ${doc}\n    ${body}\n}\n`;
    }
    case 'go': {
      const t = { arr: '[]int', int: 'int', bool: 'bool' };
      const body = ret === 'arr' ? 'return []int{}' : ret === 'bool' ? 'return false' : 'return 0';
      return `func ${n}(${list(spec, (p, ty) => `${p} ${t[ty]}`).join(', ')}) ${t[ret]} {\n\t// ${doc}${mutate}\n\t${body}\n}\n`;
    }
    default: {
      const t = { arr: 'Vec<i32>', int: 'i32', bool: 'bool' };
      const body = ret === 'arr' ? 'vec![]' : ret === 'bool' ? 'false' : '0';
      return `fn ${n}(${list(spec, (p, ty) => `${p}: ${t[ty]}`).join(', ')}) -> ${t[ret]} {\n    // ${doc}${mutate}\n    ${body}\n}\n`;
    }
  }
}

// ---------------------------------------------------------------- stdin for the token-stream languages
export const toTokens = (spec, cases) =>
  `${cases.length}\n${cases.map((c) => c.args.map((a, i) => (spec.types[i] === 'arr' ? `${a.length} ${a.join(' ')}`.trim() : String(a))).join('\n')).join('\n')}\n`;

// ---------------------------------------------------------------- harnesses
const javaImports = (code) => {
  const imports = code.split('\n').filter((l) => /^\s*import\s/.test(l));
  return { imports: imports.join('\n'), rest: code.split('\n').filter((l) => !/^\s*import\s/.test(l)).join('\n') };
};

function java(spec, code, ret) {
  const { imports, rest } = javaImports(code);
  const reads = list(spec, (p, ty, i) => (ty === 'arr' ? `int[] p${i} = new int[in.nextInt()]; for (int k = 0; k < p${i}.length; k++) p${i}[k] = in.nextInt();` : `int p${i} = in.nextInt();`)).join('\n      ');
  const fmt = ret === 'arr' ? 'arr(r)' : 'String.valueOf(r)';
  const rt = ret === 'arr' ? 'int[]' : ret === 'bool' ? 'boolean' : 'int';
  // The launcher runs the first class in the file, so the harness comes first and the user's class after it
  return `import java.util.*;
${imports}

public class Main {
  static String arr(int[] a) { StringBuilder s = new StringBuilder("["); for (int i = 0; i < a.length; i++) { if (i > 0) s.append(','); s.append(a[i]); } return s.append(']').toString(); }
  static String esc(String m) { return (m == null ? "" : m).replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", " "); }
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int t = in.nextInt();
    StringBuilder out = new StringBuilder("[");
    for (int c = 0; c < t; c++) {
      ${reads}
      if (c > 0) out.append(',');
      try {
        ${rt} r = new Solution().${functionNames(spec).java}(${callArgs(spec)});
        out.append("{\\"ok\\":true,\\"value\\":").append(${fmt}).append('}');
      } catch (Throwable e) {
        out.append("{\\"ok\\":false,\\"error\\":\\"").append(esc(e.toString())).append("\\"}");
      }
    }
    System.out.println("\\n${MARKER}" + out + "]");
  }
}

${rest}
`;
}

function cpp(spec, code, ret) {
  const reads = list(spec, (p, ty, i) => (ty === 'arr' ? `vector<int> p${i}; { int n; cin >> n; p${i}.assign(n, 0); for (auto& x : p${i}) cin >> x; }` : `int p${i}; cin >> p${i};`)).join('\n    ');
  return `#include <bits/stdc++.h>
using namespace std;

${code}

static string dsaqEsc(string m) { string o; for (char ch : m) { if (ch == '"' || ch == '\\\\') o += '\\\\'; o += (ch == '\\n' ? ' ' : ch); } return o; }
static string dsaqFmt(const vector<int>& a) { string s = "["; for (size_t i = 0; i < a.size(); i++) { if (i) s += ","; s += to_string(a[i]); } return s + "]"; }
static string dsaqFmt(int x) { return to_string(x); }
static string dsaqFmt(bool b) { return b ? "true" : "false"; }

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  int t; cin >> t;
  string out = "[";
  for (int c = 0; c < t; c++) {
    ${reads}
    if (c) out += ",";
    try {
      auto r = ${functionNames(spec).cpp}(${callArgs(spec)});
      out += "{\\"ok\\":true,\\"value\\":" + dsaqFmt(${ret === 'bool' ? 'static_cast<bool>(r)' : 'r'}) + "}";
    } catch (const exception& e) {
      out += "{\\"ok\\":false,\\"error\\":\\"" + dsaqEsc(e.what()) + "\\"}";
    } catch (...) {
      out += "{\\"ok\\":false,\\"error\\":\\"unknown error\\"}";
    }
  }
  cout << "\\n${MARKER}" << out << "]\\n";
  return 0;
}
`;
}

function c(spec, code, ret) {
  const reads = list(spec, (p, ty, i) => (ty === 'arr' ? `int n${i}; scanf("%d", &n${i}); int* p${i} = (int*)malloc(sizeof(int) * (n${i} > 0 ? n${i} : 1)); for (int k = 0; k < n${i}; k++) scanf("%d", &p${i}[k]);` : `int p${i}; scanf("%d", &p${i});`)).join('\n    ');
  const args = list(spec, (p, ty, i) => (ty === 'arr' ? `p${i}, n${i}` : `p${i}`));
  if (ret === 'arr') args.push('&rs');
  const call = ret === 'arr'
    ? `int rs = 0; int* r = ${functionNames(spec).c}(${args.join(', ')}); printf("{\\"ok\\":true,\\"value\\":["); for (int k = 0; k < rs; k++) printf(k ? ",%d" : "%d", r[k]); printf("]}");`
    : ret === 'bool'
      ? `bool r = ${functionNames(spec).c}(${args.join(', ')}); printf("{\\"ok\\":true,\\"value\\":%s}", r ? "true" : "false");`
      : `int r = ${functionNames(spec).c}(${args.join(', ')}); printf("{\\"ok\\":true,\\"value\\":%d}", r);`;
  return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

${code}

int main(void) {
  int t; scanf("%d", &t);
  printf("\\n${MARKER}[");
  for (int c = 0; c < t; c++) {
    ${reads}
    if (c) printf(",");
    { ${call} }
  }
  printf("]\\n");
  return 0;
}
`;
}

function go(spec, code) {
  const reads = list(spec, (p, ty, i) => (ty === 'arr' ? `p${i} := _dsaqReadArr(_in)` : `var p${i} int; _fmt.Fscan(_in, &p${i})`)).join('\n\t\t');
  return `package main

import (
\t_bufio "bufio"
\t_fmt "fmt"
\t_os "os"
\t_strings "strings"
)

${code}

func _dsaqReadArr(in *_bufio.Reader) []int {
\tvar n int
\t_fmt.Fscan(in, &n)
\ta := make([]int, n)
\tfor i := range a {
\t\t_fmt.Fscan(in, &a[i])
\t}
\treturn a
}

func _dsaqFmt(v interface{}) string {
\tswitch x := v.(type) {
\tcase []int:
\t\tparts := make([]string, len(x))
\t\tfor i, n := range x {
\t\t\tparts[i] = _fmt.Sprint(n)
\t\t}
\t\treturn "[" + _strings.Join(parts, ",") + "]"
\tdefault:
\t\treturn _fmt.Sprint(x)
\t}
}

func _dsaqCase(f func() string) (res string) {
\tdefer func() {
\t\tif r := recover(); r != nil {
\t\t\tmsg := _strings.NewReplacer("\\\\", "\\\\\\\\", "\\"", "\\\\\\"", "\\n", " ").Replace(_fmt.Sprint(r))
\t\t\tres = \`{"ok":false,"error":"\` + msg + \`"}\`
\t\t}
\t}()
\treturn \`{"ok":true,"value":\` + f() + \`}\`
}

func main() {
\t_in := _bufio.NewReader(_os.Stdin)
\tvar t int
\t_fmt.Fscan(_in, &t)
\tvar out _strings.Builder
\tout.WriteString("[")
\tfor c := 0; c < t; c++ {
\t\t${reads}
\t\tif c > 0 {
\t\t\tout.WriteString(",")
\t\t}
\t\tout.WriteString(_dsaqCase(func() string { return _dsaqFmt(${functionNames(spec).go}(${callArgs(spec)})) }))
\t}
\t_fmt.Print("\\n${MARKER}" + out.String() + "]\\n")
}
`;
}

function rust(spec, code) {
  const reads = list(spec, (p, ty, i) => (ty === 'arr' ? `let n${i} = it.next().unwrap() as usize; let p${i}: Vec<i32> = (0..n${i}).map(|_| it.next().unwrap() as i32).collect();` : `let p${i} = it.next().unwrap() as i32;`)).join('\n        ');
  const clone = spec.params.map((_, i) => (spec.types[i] === 'arr' ? `p${i}.clone()` : `p${i}`)).join(', ');
  return `${code}

trait DsaqFmt { fn dsaq_fmt(&self) -> String; }
impl DsaqFmt for i32 { fn dsaq_fmt(&self) -> String { self.to_string() } }
impl DsaqFmt for bool { fn dsaq_fmt(&self) -> String { self.to_string() } }
impl DsaqFmt for Vec<i32> { fn dsaq_fmt(&self) -> String { format!("[{}]", self.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(",")) } }

fn main() {
    use std::io::Read;
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    let mut it = input.split_whitespace().map(|x| x.parse::<i64>().unwrap());
    let t = it.next().unwrap();
    let mut out = String::from("[");
    for c in 0..t {
        ${reads}
        if c > 0 { out.push(','); }
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| ${functionNames(spec).rust}(${clone})));
        match r {
            Ok(v) => out.push_str(&format!("{{\\"ok\\":true,\\"value\\":{}}}", v.dsaq_fmt())),
            Err(_) => out.push_str("{\\"ok\\":false,\\"error\\":\\"the program panicked\\"}"),
        }
    }
    println!("\\n${MARKER}{}]", out);
}
`;
}

const PY = (spec, code) => `${code}

# ---- DSA Quest harness ----
import json as _json, sys as _sys, copy as _copy
def _dsaq_run():
    _cases = _json.loads(_sys.stdin.read())
    _out = []
    for _args in _cases:
        _a = _copy.deepcopy(_args)
        try:
            _r = ${spec.name[0]}(*_a)
            if _r is None and ${spec.mutates ? 'True' : 'False'}:
                _r = _a[0]
            _out.append({"ok": True, "value": _r})
        except BaseException as _e:
            _out.append({"ok": False, "error": type(_e).__name__ + ": " + str(_e)})
    _sys.stdout.write("\\n${MARKER}" + _json.dumps(_out, default=lambda o: list(o) if isinstance(o, (set, frozenset, tuple)) else str(o)) + "\\n")
_dsaq_run()
`;

const JS = (spec, code) => `${code}

// ---- DSA Quest harness ----
(() => {
  const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const out = [];
  for (const args of cases) {
    const a = JSON.parse(JSON.stringify(args));
    try {
      let r = ${spec.name[1]}(...a);
      if ((r === undefined || r === null) && ${Boolean(spec.mutates)}) r = a[0];
      out.push({ ok: true, value: r === undefined ? null : r });
    } catch (e) {
      out.push({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  }
  process.stdout.write('\\n${MARKER}' + JSON.stringify(out) + '\\n');
})();
`;

// The program to run and what to feed it on stdin
export function buildRun(spec, language, code, cases, ret) {
  const jsonIn = JSON.stringify(cases.map((c) => c.args));
  if (language === 'python') return { program: PY(spec, code), stdin: jsonIn };
  if (language === 'javascript') return { program: JS(spec, code), stdin: jsonIn };
  if (language === 'typescript') return { program: `declare const require: any;\ndeclare const process: any;\n${JS(spec, code)}`, stdin: jsonIn };
  const harness = { java, cpp, c, go, rust }[language];
  return { program: harness(spec, code, ret), stdin: toTokens(spec, cases) };
}
