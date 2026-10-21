#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T833 다시 뜬 판 탐침 · 제품 무변 · 판정 0)
// === scripts/t833-restart-probe.js — 존을 띄워 S 날에 제품 종료 문으로 내리고(SIGTERM · T728 종료 저장) 같은 DB 로 다시 띄워 A 날 더 간다 ===
//   다시 뜬 판에서 마을 몸 주사위 신원(`_sh`)이 겹치나를 센다(`scripts/t833-probe-hook.js` — 명부 몸 · econ 날마다 · 부팅 순간 · 종료 저장 순간).
//   node scripts/t833-restart-probe.js --dir <판 폴더> [--tree <레포 뿌리>] [--stop 40] [--after 40] [--seed 1020] [--day-ms 250] [--cap <n>]
//     --tree     존 판을 띄울 트리(기본 = 이 레포 · 예: main 작업 트리) — 훅 셋(t577 · t745 가상 시계 · 이 탐침 훅)도 그 트리의 scripts/ 것을 쓴다(모듈 한 벌)
//     --day-ms   econ 하루(`VILLAGE_DAY_MS`) — 빈칸이면 정본 하루 24분 · 기본 250(T650 자의 빠른 하루 — 출생 · 죽음이 날마다 동기에 든다)
//     --cap      `VILLAGE_NPC_CAP`(기본 없음 = 운영 무제한)
//   조건: 가상 시계(T745 — 두 판이 같은 시각 사슬 · 다시 뜬 판 V0 = 멈춘 V + 하루) · 새 세계 · 손님 0 · PORT=0(포트를 쥐지 않는다) · env 는 아이에게 그대로(손잡이를 얹은 판).
//   ⇒ <판 폴더>/p1.probe.json · p2.probe.json · p1.log · p2.log · summary.json
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const TREE = path.resolve(opt('tree', path.join(__dirname, '..')));
const DIR = path.resolve(opt('dir', path.join(os.tmpdir(), 't833-probe')));
const STOP = +opt('stop', '40'), AFTER = +opt('after', '40'), SEED = +opt('seed', '1020');
const DAYMS_S = opt('day-ms', '250'), CAP = opt('cap', '');
const DAYMS = DAYMS_S === '' ? 24 * 60 * 1000 : +DAYMS_S;
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, 'w.db');
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function boot(tag, stopDay, extra) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: '0', DB_PATH: DB, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
      T577_SEED: String(SEED), T577_DAYS: '99999', T577_OUT: path.join(DIR, tag + '.json'), T745_VCLOCK: '1',
      T833P_OUT: path.join(DIR, tag + '.probe.json'), T833P_STOP: String(stopDay),
      T699_ROUTE_CACHE: process.env.T699_ROUTE_CACHE || path.join(os.tmpdir(), 'durango-route-cache'),
      NODE_OPTIONS: [`--require ${path.join(TREE, 'scripts', 't745-vclock.js')}`, `--require ${path.join(TREE, 'scripts', 't833-probe-hook.js')}`, process.env.NODE_OPTIONS || ''].join(' ').trim(),
    }, extra || {});
    if (DAYMS_S !== '') env.VILLAGE_DAY_MS = String(DAYMS); else delete env.VILLAGE_DAY_MS;
    if (CAP !== '') env.VILLAGE_NPC_CAP = CAP; else delete env.VILLAGE_NPC_CAP;
    const t0 = Date.now();
    const lf = fs.openSync(path.join(DIR, tag + '.log'), 'w');
    const ch = spawn(process.execPath, ['-r', path.join(TREE, 'scripts', 't577-server-hook.js'), path.join(TREE, 'server', 'zone.js')], { cwd: TREE, env, stdio: ['ignore', lf, lf] });
    const LIM = (parseInt(process.env.T833P_LIMIT_S || '', 10) || 3300) * 1000;   // 한 판 1시간 안(카드)
    const to = setTimeout(() => { try { ch.kill('SIGTERM'); } catch (e) {} }, LIM);
    ch.on('exit', (code, sig) => { clearTimeout(to); resolve({ tag, code, sig, sec: Math.round((Date.now() - t0) / 1000) }); });
  });
}
//   T822 열쇠(pid)였다면 겹쳤을 짝 — 다시 뜬 판 부팅 순간 명부에서 종료 저장 명부의 같은 자리에 선 몸 = 되살린 몸(그 옛 pid 열쇠를 든다 · T747) ·
//   그 밖의 몸은 새 pid 열쇠 ⇒ 같은 마을에서 새 몸의 번호가 되살린 몸의 옛 번호와 같으면 같은 `_sh`(되살린 몸은 새 pid 로 따라간다 — 자리는 그 뒤 밀린다)
function wouldPairs(save, boot, now) {
  if (!save || !boot || !now) return null;
  const old = new Map(); for (const [v, i, pid] of save) old.set(v + ':' + i, +String(pid).slice(1));
  const rest = new Map(); for (const [v, i, pid] of boot) { const k = v + ':' + i; if (old.has(k)) rest.set(pid, old.get(k)); }
  const byV = new Map(); for (const r of now) { if (!byV.has(r[0])) byV.set(r[0], []); byV.get(r[0]).push(r); }
  let n = 0;
  for (const L of byV.values()) {
    const oldNums = new Set(L.filter((r) => rest.has(r[2])).map((r) => rest.get(r[2])));
    for (const r of L) if (!rest.has(r[2]) && oldNums.has(+String(r[2]).slice(1))) n++;
  }
  return n;
}
(async () => {
  console.log(`=== T833 다시 뜬 판 탐침 — 트리 ${TREE} · 시드 ${SEED} · 멈춤 날 ${STOP} · 더 ${AFTER}날 · 하루 ${DAYMS_S === '' ? '24분(정본)' : DAYMS + 'ms'} · 몸 상한 ${CAP || '없음'} · 손잡이 T822_BODY_SEED=${process.env.T822_BODY_SEED == null ? '(없음)' : process.env.T822_BODY_SEED} ===`);
  const r1 = await boot('p1', STOP);
  const P1 = J(path.join(DIR, 'p1.probe.json'));
  console.log(`  p1 ${r1.sec}초(종료 ${r1.code}${r1.sig ? ' ' + r1.sig : ''}) · 끝 날 ${P1 && P1.rows.length ? P1.rows[P1.rows.length - 1].d : '—'} · 종료 저장 명부 ${P1 && P1.save ? P1.save.roster.length : '없음'}`);
  if (!P1 || !P1.save || !P1.stopV) { console.log('  ✗ 멈춤 판이 종료 저장 순간을 못 적었다'); process.exit(2); }
  const r2 = await boot('p2', STOP + AFTER, { T745_V0: String(Math.ceil(P1.stopV) + DAYMS) });
  const P2 = J(path.join(DIR, 'p2.probe.json'));
  const rows = (P2 && P2.rows) || [];
  const worst = rows.reduce((m, x) => (x && x.sameVil > m.sameVil ? x : m), { sameVil: 0 });
  const end = rows[rows.length - 1] || null;
  const endRoster = P2 && P2.save ? P2.save.roster : null;
  const S = {
    tree: TREE, seed: SEED, stop: STOP, after: AFTER, dayMs: DAYMS_S === '' ? 'canon' : DAYMS, cap: CAP || null, knob: process.env.T822_BODY_SEED == null ? null : process.env.T822_BODY_SEED,
    p1: { sec: r1.sec, code: r1.code, lastDay: P1.rows.length ? P1.rows[P1.rows.length - 1].d : null, last: P1.rows[P1.rows.length - 1] || null, save: P1.save.c, maxPid: Math.max(...P1.save.roster.map((x) => +String(x[2]).slice(1))) },
    p2: { sec: r2.sec, code: r2.code, boot: P2 && P2.boot ? Object.assign({ day: P2.boot.day }, P2.boot.c) : null, days: rows.length, firstDay: rows.length ? rows[0].d : null, lastDay: end ? end.d : null,
      end, worstDay: worst.d != null ? worst : null, maxSameVil: Math.max(0, ...rows.map((x) => x.sameVil || 0)), maxDupBodies: Math.max(0, ...rows.map((x) => x.dupBodies || 0)),
      save: P2 && P2.save ? P2.save.c : null, maxPid: endRoster ? Math.max(...endRoster.map((x) => +String(x[2]).slice(1))) : null },
    wouldPairsT822: { boot: wouldPairs(P1.save.roster, P2 && P2.boot && P2.boot.roster, P2 && P2.boot && P2.boot.roster), end: wouldPairs(P1.save.roster, P2 && P2.boot && P2.boot.roster, endRoster) },
  };
  fs.writeFileSync(path.join(DIR, 'summary.json'), JSON.stringify(S, null, 1));
  console.log(`  p2 ${r2.sec}초(종료 ${r2.code}) · 날 ${S.p2.firstDay}~${S.p2.lastDay} · 부팅 겹침(같은 마을 짝) ${S.p2.boot ? S.p2.boot.sameVil : '—'} · 날마다 최대 ${S.p2.maxSameVil} · 끝 ${end ? end.sameVil : '—'} · 명부 몸 ${end ? end.n : '—'}`);
  console.log(`  T822 열쇠(pid)였다면 겹쳤을 짝 — 부팅 ${S.wouldPairsT822.boot} · 끝 ${S.wouldPairsT822.end}`);
  console.log(`→ ${path.join(DIR, 'summary.json')}`);
  if (!process.argv.includes('--keep-db')) for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
})();
