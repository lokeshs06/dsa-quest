import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpError } from '../utils/HttpError.js';

export async function runLocalCode(language, code, stdin = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-quest-'));
  const start = Date.now();
  try {
    let cmd, args;
    if (language === 'python') {
      const file = path.join(dir, 'solution.py');
      fs.writeFileSync(file, code, 'utf8');
      cmd = 'python';
      args = [file];
    } else if (language === 'javascript') {
      const file = path.join(dir, 'solution.js');
      fs.writeFileSync(file, code, 'utf8');
      cmd = 'node';
      args = [file];
    } else if (language === 'typescript') {
      const file = path.join(dir, 'solution.ts');
      fs.writeFileSync(file, code, 'utf8');
      cmd = 'node';
      args = ['--experimental-strip-types', file];
    } else if (language === 'cpp' || language === 'c') {
      const ext = language === 'cpp' ? 'cpp' : 'c';
      const compiler = language === 'cpp' ? 'g++' : 'gcc';
      const srcFile = path.join(dir, `solution.${ext}`);
      const exeFile = path.join(dir, 'solution.exe');
      fs.writeFileSync(srcFile, code, 'utf8');

      const compileRes = await new Promise((res) => {
        const cp = spawn(compiler, ['-O2', srcFile, '-o', exeFile]);
        let err = '';
        cp.stderr.on('data', (d) => { err += d; });
        cp.on('close', (code) => res({ code, err }));
        cp.on('error', (err) => res({ code: 1, err: err.message }));
      });

      if (compileRes.code !== 0) {
        return {
          statusId: 6,
          status: 'Compilation Error',
          compileOutput: compileRes.err || 'Compilation failed',
          stderr: compileRes.err || '',
          stdout: '',
          time: '0.000',
        };
      }
      cmd = exeFile;
      args = [];
    } else if (language === 'java') {
      const file = path.join(dir, 'Main.java');
      fs.writeFileSync(file, code, 'utf8');
      cmd = 'java';
      args = [file];
    } else {
      throw new HttpError(400, `Local runner supports Python, JavaScript, TypeScript, C, C++, and Java. For ${language}, configure a Judge0 server.`);
    }

    return await new Promise((resolve) => {
      const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill(); } catch {}
      }, 5000);

      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        const duration = ((Date.now() - start) / 1000).toFixed(3);
        if (timedOut) {
          resolve({ statusId: 5, status: 'Time Limit Exceeded', stdout, stderr: 'Execution timed out (5s limit)', time: duration });
        } else if (exitCode !== 0) {
          resolve({ statusId: 11, status: 'Runtime Error', stdout, stderr, exitCode, time: duration });
        } else {
          resolve({ statusId: 3, status: 'Accepted', stdout, stderr, exitCode: 0, time: duration });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ statusId: 11, status: 'Runtime Error', stdout: '', stderr: `Failed to execute: ${err.message}` });
      });

      if (stdin) {
        child.stdin.write(stdin);
      }
      child.stdin.end();
    });
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}
