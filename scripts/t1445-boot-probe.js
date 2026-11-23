#!/usr/bin/env node
'use strict';
// (@regress 없음 — 계측기 · 러너 밖 · T1445 · 판정 0 · 제품 무접촉)
// === scripts/t1445-boot-probe.js — 살아 있는 세계 DB 사본으로 존을 띄워 뜬 뒤 메모리 봉우리 · 틱 · 종료 저장 봉우리를 잰다 ===
//
// 쓰는 법(맥 · 컨테이너 · ★라이브 서버에서 돌리지 않는다):
//   node scripts/t1445-boot-probe.js --db <world-hanbando.db> --central <central.db> --out <폴더> [--ref <커밋>] [--secs 600]
//        [--limit 1500] [--off <꺼진 시간 ms>] [--gc] [--term] [--env K=V,K2=V2]
//   · DB 는 사본을 떠서 쓴다(원본 무접촉 · `--keep` 이면 떠 둔 사본을 남긴다 — 종료 저장 뒤 다시 띄우기를 이을 때)
//   · `--ref` = 그 커밋을 git worktree 로 떠서 띄운다(없으면 이 트리) — land1076 `664a622b` ↔ land1089 `01df9e8f9` 나란히
//   · 존 깃발: `--trace-gc` 늘(봉우리는 GC 줄의 앞 · 뒤 크기로) · `--max-old-space-size=<limit>`(라이브 3.9 GB 기계의 기본 ≈ 1,500)
//   · `--off` = 존 벽시계를 "DB 저장 시각 + off" 로 옮긴다(꺼진 시간 흉내 — 34시간 = 122400000)
//   · `--gc` = `--expose-gc` + 부팅 70초 동안 로그 줄마다 산 몫 · `--term` = secs 뒤 SIGTERM(점잖은 종료 저장 봉우리)
// 내는 것: <out>/zone.log · mem.jsonl · meta.jsonl · perf.txt · summary.json
//   summary = { died, diedAtS, gcMaxPre, gcMaxLive(Mark-Compact 뒤 가장 큰 산 몫) · 10초 창마다 두 값 · 종료 저장 봉우리 · T566 셀 · 날 뜀 · 틱 p50/p99 마지막 }
const path = require('path'), fs = require('fs'), { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; }, has = (k) => A.includes(k);
const OUTD = path.resolve(opt('--out', '/tmp/t1445-probe')), SECS = +opt('--secs', '600'), LIMIT = opt('--limit', ''), OFF = opt('--off', ''), REF = opt('--ref', '');
const DB = opt('--db'), CDB = opt('--central');
if (!DB || !CDB) { console.error('--db · --central 이 든다'); process.exit(2); }
fs.mkdirSync(OUTD, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let tree = ROOT, wt = null;
  if (REF) { wt = path.join(OUTD, 'tree'); try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {} execFileSync('git', ['worktree', 'add', '--detach', wt, REF], { cwd: ROOT, stdio: 'ignore' }); try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(wt, 'node_modules')); } catch (e) {} tree = wt; }
  const dd = path.join(OUTD, 'db'); fs.mkdirSync(dd, { recursive: true });
  for (const [s, n] of [[DB, 'world-hanbando.db'], [CDB, 'central.db']]) if (!has('--reuse') || !fs.existsSync(path.join(dd, n))) for (const x of ['', '-wal', '-shm']) { try { fs.copyFileSync(s + x, path.join(dd, n + x)); fs.chmodSync(path.join(dd, n + x), 0o644); } catch (e) {} }
  let saved = null; try { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(path.join(dd, 'world-hanbando.db')); const r = d.prepare('select updated_at from world_meta').get(); saved = r && r.updated_at; d.close(); } catch (e) {}
  const extra = Object.fromEntries((opt('--env', '') || '').split(',').filter(Boolean).map((e) => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]));
  const SECRET = 't1445probe', ZP = +opt('--port', '47500'), CP = ZP + 10, log = fs.openSync(path.join(OUTD, 'zone.log'), 'w');
  const env0 = { ...process.env, NODE_ENV: 'production', CENTRAL_SECRET: SECRET };
  const c = spawn(process.execPath, ['--experimental-sqlite', path.join(tree, 'server/central.js')], { cwd: tree, stdio: 'ignore', env: { ...env0, PORT: String(CP), DB_PATH: path.join(dd, 'central.db'), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' } });
  await sleep(2000);
  const flags = ['--experimental-sqlite', '--trace-gc'].concat(LIMIT ? [`--max-old-space-size=${LIMIT}`] : []).concat(has('--gc') ? ['--expose-gc'] : []);
  const zenv = { ...env0, ...extra, ZONE_ID: 'hanbando', PORT: String(ZP), DB_PATH: path.join(dd, 'world-hanbando.db'), CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
    NODE_OPTIONS: `--require ${path.join(__dirname, 't1445-boot-mem.cjs')}`, T1445_MEM_OUT: path.join(OUTD, 'mem.jsonl'), T1445_META_OUT: path.join(OUTD, 'meta.jsonl'), ...(has('--gc') ? { T1445_LOGGC: '1' } : {}),
    ...(OFF && saved ? { T1445_NOW0: String(saved + +OFF) } : {}) };
  const z = spawn(process.execPath, flags.concat([path.join(tree, 'server/zone.js')]), { cwd: tree, stdio: ['ignore', log, log], env: zenv });
  let died = null; z.on('exit', (code, sig) => { died = { code, sig, at: Date.now() }; });
  const t0 = Date.now(), perf = [];
  while ((Date.now() - t0) / 1000 < SECS && !died) {
    await sleep(15000);
    try { const r = await fetch(`http://localhost:${ZP}/perf`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(5000) }); const p = await r.json(); const t = p.tick && p.tick.ms; perf.push({ s: Math.round((Date.now() - t0) / 1000), p50: t && t.p50, p99: t && t.p99, max: t && t.max }); } catch (e) { perf.push({ s: Math.round((Date.now() - t0) / 1000), err: 1 }); }
  }
  const endedByUs = !died;   // 판 끝까지 살았다 — 아래 SIGTERM · SIGKILL 은 죽음이 아니다
  let termAt = null;
  if (!died && has('--term')) { termAt = Date.now(); z.kill('SIGTERM'); for (let i = 0; i < 180 && !died; i++) await sleep(1000); }
  if (!died) { z.kill('SIGKILL'); await sleep(1000); }
  c.kill('SIGKILL');
  fs.writeFileSync(path.join(OUTD, 'perf.txt'), perf.map((x) => JSON.stringify(x)).join('\n') + '\n');
  // 요약 — GC 줄(앞 = 그때 힙 · 뒤 = Mark-Compact 면 산 몫) · 10초 창 · 종료 저장(SIGTERM 줄 뒤)
  const L = fs.readFileSync(path.join(OUTD, 'zone.log'), 'utf8').split('\n');
  const S = { died: !endedByUs ? died : null, ref: REF || 'tree', limit: LIMIT || 'node 기본', off: OFF || null, gcMaxPre: 0, gcMaxLive: 0, win: {}, term: termAt ? { maxPre: 0, maxLive: 0 } : null, t566: null, jump: null, perfLast: perf[perf.length - 1] || null };
  let sd = false;
  for (const l of L) {
    if (/SIGTERM 받음/.test(l)) sd = true;
    const m = /\]\s+([\d.]+) ms: (\S+)[^\d]*([\d.]+) \(([\d.]+)\) -> ([\d.]+)/.exec(l);
    if (m) { const t = Math.floor(+m[1] / 10000) * 10, pre = +m[3], post = +m[5], mc = m[2].startsWith('Mark');
      if (sd) { if (S.term) { S.term.maxPre = Math.max(S.term.maxPre, pre); if (mc) S.term.maxLive = Math.max(S.term.maxLive, post); } }
      else { S.gcMaxPre = Math.max(S.gcMaxPre, pre); if (mc) S.gcMaxLive = Math.max(S.gcMaxLive, post); const w = S.win[t] || (S.win[t] = [0, 0]); w[0] = Math.max(w[0], pre); if (mc) w[1] = Math.max(w[1], post); }
      continue; }
    let k = /꺼진 사이 등급 2 아래로 내려간 길 (\d+)셀/.exec(l); if (k) S.t566 = +k[1];
    k = /날 뜀 (\d+)/.exec(l); if (k) S.jump = +k[1];
    if (/FATAL ERROR|heap out of memory/.test(l)) S.fatal = l.slice(0, 160);
  }
  if (!endedByUs && died) S.diedAtS = Math.round((died.at - t0) / 1000);
  fs.writeFileSync(path.join(OUTD, 'summary.json'), JSON.stringify(S, null, 1));
  console.log(JSON.stringify({ out: OUTD, died: S.died ? S.diedAtS : null, fatal: !!S.fatal, gcMaxPre: S.gcMaxPre, gcMaxLive: S.gcMaxLive, term: S.term, t566: S.t566, jump: S.jump, perfLast: S.perfLast }));
  if (wt && !has('--keep')) { try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {} }
})();
