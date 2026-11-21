#!/usr/bin/env node
// === scripts/t1379-boot.js — DB 사본으로 존을 띄워 부팅 초 · 부팅 RSS 꼭대기 · 첫 틱 ms [T1379 · S11 · 2026-11-21] =================
// (@regress 없음 — 러너 밖 · 판 도구 · 제품 무접촉)
//
// 쓰는 법: node scripts/t1379-boot.js --snaps /tmp/t1379/base/snaps --names d100,d400,dEnd --out 계측/T1379_<날짜>/boot.json [--reps 1]
// ★사본을 임시 파일로 복사해(부팅이 DB 를 쓴다) 존 하나를 띄운다. env = 판 자 아이 env(`t577-server-run.kidEnv` — 사본 0)에서
//   판 자 훅 · 가상 시계 프리로드를 뺀 것(운영 부팅과 같은 꼴 · 벽시계).
//   부팅 초 = 띄운 때 → `zone server up on` 줄 · 첫 틱 ms = `/perf` 의 `tick.ms` 가 처음 n ≥ 1 일 때 max(n 도 적는다) ·
//   RSS 꼭대기 = 첫 틱 뒤 `/proc/<pid>/status` VmHWM(띄운 뒤 최대 상주 메모리).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const SNAPS = arg('snaps'), NAMES = String(arg('names', 'd100,d400,dEnd')).split(','), OUT = arg('out'), REPS = +arg('reps', 1);
delete process.env.T745_VCLOCK; delete process.env.NODE_OPTIONS;
const T577 = require('./t577-server-run');
const FB = require('./fixture-boot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vmHWM = (pid) => { try { const m = /VmHWM:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')); return m ? +m[1] * 1024 : null; } catch (e) { return null; } };
async function perf(port) { try { const r = await fetch(`http://127.0.0.1:${port}/perf`, { signal: AbortSignal.timeout(3000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
async function bootOne(name) {
  const src = path.join(SNAPS, name + '.db');
  const tmp = path.join(os.tmpdir(), `t1379-boot-${process.pid}-${name}.db`);
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(tmp + s); } catch (e) {} }
  fs.copyFileSync(src, tmp);
  const port = await T577.freePort();
  const env = T577.kidEnv({ seed: 1020, port, db: tmp, out: tmp + '.json', days: 99999 });
  const t0 = Date.now();
  const ch = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logf = tmp + '.log'; const lf = fs.createWriteStream(logf); ch.stdout.pipe(lf); ch.stderr.pipe(lf);
  const up = await FB.waitUp(ch, /zone server up on/, { name: 'zone', capMs: 900000 });
  const bootSec = (Date.now() - t0) / 1000;
  let first = null; const tf = Date.now();
  while (up.ok && Date.now() - tf < 120000) { const p = await perf(port); const ms = p && p.tick && p.tick.ms; if (ms && ms.n >= 1) { first = { ms: ms.max, n: ms.n, sinceUpSec: +((Date.now() - tf) / 1000).toFixed(2) }; break; } await sleep(25); }
  await sleep(2000);
  const rss = vmHWM(ch.pid);
  try { ch.kill('SIGKILL'); } catch (e) {}
  await new Promise((r) => { if (ch.exitCode !== null) r(); else { ch.once('exit', r); setTimeout(r, 5000); } });
  for (const s of ['', '-wal', '-shm', '.json', '.log']) { try { fs.unlinkSync(tmp + s); } catch (e) {} }
  return { name, srcBytes: fs.statSync(src).size, up: !!up.ok, why: up.ok ? '' : String(up.why || ''), bootSec: +bootSec.toFixed(1), rssPeakMB: rss ? +(rss / 1048576).toFixed(0) : null, firstTick: first };
}
(async () => {
  const rows = [];
  for (const n of NAMES) for (let k = 0; k < REPS; k++) { const r = await bootOne(n); r.rep = k + 1; rows.push(r); console.log(JSON.stringify(r)); }
  if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(rows, null, 1)); }
})().catch((e) => { console.error(e); process.exit(1); });
