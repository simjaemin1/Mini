'use strict';
// (러너 밖 · T1278 계측) T1270 판 자(몸 전부 · 라이브 하루 1,440,000ms · 가상 시계 · 시드 1020 · 농사 켬)를 plain 으로 + 몸 자리 지문 + (켜면) V8 표본 프로파일.
//   쓰는 법: T1278_ROOT=<판 트리> [T1278_PROF=1] node scripts/t1278/run.cjs <출력> [날 30]
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = process.env.T1278_ROOT, out = path.resolve(process.argv[2]), days = Number(process.argv[3] || 30);
fs.mkdirSync(out, { recursive: true });
const T70 = path.join(__dirname, '..', 't1270');
const opts = [...(process.env.T1278_PROF ? ['--cpu-prof', '--cpu-prof-interval', String(process.env.T1278_PROF_US || 1000), '--cpu-prof-dir', path.join(out, 'prof')] : []),
  '--require', path.join(T70, 'world-hook.cjs'), '--require', path.join(__dirname, '..', 't1278', 'pos-hook.cjs'), ...(process.env.T1294_PRELOAD ? ['--require', process.env.T1294_PRELOAD] : []), '--require', path.join(root, 'scripts/t745-vclock.js'), '--require', path.join(root, 'scripts/server-baseline-check.js')].join(' ');
const env = { ...process.env, T1241_DES: '0', T1241_PROBE: '1', T1241_OUT: path.join(out, 'body'), T1248_TRACE: path.join(out, 'world-days.jsonl'), T1248_ROOT: root, T1270_ROOT: root, T1270_OUT: out,
  T1270_DEPS: path.join(root, 'node_modules'), T1278_POS: path.join(out, 'pos-days.jsonl'), T745_VCLOCK: '1', VILLAGE_DAY_MS: '1440000', VILLAGE_NPC_CAP: 'Infinity', T1243_FARM_ON: '1', T577_PAR: '1', T577_DIR: path.join(out, 'server'), SBC_HOOK: '1', NODE_OPTIONS: opts };
const fd = fs.openSync(path.join(out, 'controller.log'), 'w');
const r = spawnSync(process.execPath, [path.join(root, 'scripts/t577-server-run.js'), String(days), String(process.env.T1294_SEED || 1020)], { cwd: root, env, stdio: ['ignore', fd, fd] });
fs.closeSync(fd);
const read = (n) => fs.existsSync(path.join(out, n)) ? JSON.parse(fs.readFileSync(path.join(out, n), 'utf8')) : null;
const m = read('world-days.jsonl.meta.json');
const valid = !!(r.status === 0 && m && m.code === 0 && m.clock && m.clock.errs === 0);
fs.writeFileSync(path.join(out, 'status.json'), JSON.stringify({ valid, exit: r.status, days, clock: m && m.clock, cpuSeconds: m && m.cpuSeconds, wallSeconds: m && m.wallSeconds }, null, 2));
process.exit(valid ? 0 : 1);
