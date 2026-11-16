#!/usr/bin/env node
// === scripts/t630-flush-gate.js — T630 게이트: 길 하루 플러시를 조각으로 나눠도 DB 행·방송이 같은가 (러너 밖 · 서버 0) ==========
//
// 두 팔(종전 roads.js · 가지 roads.js)을 **각자 자식 프로세스**로(DB 가 모듈 적재 때 열린다) 같은 일정으로 돌린다:
//   존 셀 2188×4063 · 결정론 흐름(LCG)으로 틱마다 스탬프 · N 게임일 · 날마다 "다음 날 경계 바로 앞" 에 `roads` 표 덤프 해시 + 그날 방송 해시를 적는다.
//   시계: 날 경계는 가짜 기준 시각이 정하고, 조각 예산이 재는 ms 는 **진짜로 흐른다**(기준 + 틱 안 실경과) — 묶음이 실제로 여럿이 된다.
// 팔 셋째 `kill`: 가지 판을 어느 날 첫 묶음만 쓴 뒤 ⓐ 정상 종료(`process.exit` — `exit` 훅이 남은 묶음을 쓴다) ⓑ SIGKILL — 다음 부팅의 DB 를 종전 판의 그날 끝과 견준다.
// 실행: node scripts/t630-flush-gate.js <종전 레포 루트> [--days 6] [--stamps 12000]
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

if (process.env.T630_CHILD) {   // ── 자식: 한 팔 ──
  const DAY = 600000, EPOCH = 0;
  let base = 0, realT0 = Date.now();
  const realNow = Date.now.bind(Date);
  Date.now = () => base + (realNow() - realT0);
  const setBase = (b) => { base = b; realT0 = realNow(); };
  const R = require(path.join(process.env.T630_ROOT, 'server', 'roads.js'));
  const DB = require(path.join(process.env.T630_ROOT, 'server', 'zone-local-db.js'));
  const casts = [];
  const D0 = 1000;
  setBase(D0 * DAY + 1000);
  R.init({ zoneId: 'hanbando', cellsW: 2188, cellsH: 4063, epoch: EPOCH, dayMs: DAY, broadcast: (m) => casts.push(JSON.stringify(m)) });
  let x = 12345; const rnd = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 4294967296; };
  const DAYS = +process.env.T630_DAYS, ST = +process.env.T630_STAMPS, TPD = 200;   // 하루 200틱 · 틱마다 ST/200 스탬프(좁은 띠에 몰아 등급이 서게)
  const KILL = process.env.T630_KILL || '', KILLDAY = +process.env.T630_KILLDAY || 3;
  const out = [];
  const dump = () => { const rows = DB.getRoadCells('hanbando').map((r) => [r.cell_key, +r.v.toFixed(9), r.d]).sort((a, b) => a[0] - b[0]); return { n: rows.length, h: crypto.createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 16) }; };
  for (let d = 0; d < DAYS; d++) {
    for (let t = 0; t < TPD; t++) {
      setBase((D0 + d) * DAY + 1000 + t * (DAY / TPD));
      R.onGameTick(Date.now());
      if (KILL && d === KILLDAY && t === 0) {   // 경계 틱 = 첫 묶음만 썼다
        if (KILL === 'exit') process.exit(0);
        process.kill(process.pid, 'SIGKILL');
      }
      for (let s = 0; s < ST / TPD; s++) {
        const cx = 300 + Math.floor(rnd() * 40), cy = 1000 + Math.floor(rnd() * 100);   // 4천 칸에 하루 1.2만 — 사흘이면 등급이 서고 방송이 난다
        R.stampCell(cx, cy);
        if (rnd() < 0.02) R.levelOf(cx + 1, cy);   // 조회 감쇠(dirty 를 낳는 둘째 자리)
      }
    }
    setBase((D0 + d + 1) * DAY - 1);   // 다음 경계 바로 앞 — 그날 플러시는 다 끝났다(조각 판도)
    R.onGameTick(Date.now());
    out.push({ day: d, db: dump(), cast: crypto.createHash('sha1').update(casts.join('\n')).digest('hex').slice(0, 16), casts: casts.length });
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ── 부모 ──
const OLD = argv[0];
if (!OLD) { console.log('사용: node scripts/t630-flush-gate.js <종전 레포 루트>'); process.exit(2); }
const DAYS = val('--days', '6'), ST = val('--stamps', '12000');
function arm(root, slice, extra) {
  const db = `/tmp/t630-gate-${process.pid}-${Math.random().toString(36).slice(2)}.db`;
  const env = Object.assign({}, process.env, { T630_CHILD: '1', T630_ROOT: root, T630_DAYS: DAYS, T630_STAMPS: ST, DB_PATH: db, VILLAGE_TICK_SLICE_MS: String(slice) }, extra || {});
  const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = (r.stdout || '').trim().split('\n'); let o = null; try { o = JSON.parse(lines[lines.length - 1]); } catch (e) {}
  const logs = (r.stdout + r.stderr).split('\n').filter((l) => /답압 길 day/.test(l));
  return { o, db, logs, code: r.status, sig: r.signal };
}
const dumpDb = (dbPath) => { const r = spawnSync(process.execPath, ['-e', `const DB=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-local-db.js'))});const rows=DB.getRoadCells('hanbando').map(r=>[r.cell_key,+r.v.toFixed(9),r.d]).sort((a,b)=>a[0]-b[0]);process.stdout.write(JSON.stringify({n:rows.length,h:require('crypto').createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0,16)}))`], { env: Object.assign({}, process.env, { DB_PATH: dbPath }), encoding: 'utf8' }); try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return null; } };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };

const A = arm(OLD, 16), B = arm(ROOT, 16), B1 = arm(ROOT, 1), B0 = arm(ROOT, 0);
ok(A.o && B.o && B1.o && B0.o, `네 팔이 끝났다 (종전 · 가지 16ms · 1ms · 0ms)`);
for (const [nm, X] of [['가지 16ms', B], ['가지 1ms', B1], ['가지 0(한 번에)', B0]]) {
  const same = A.o.every((r, i) => X.o[i] && r.db.h === X.o[i].db.h && r.cast === X.o[i].cast);
  ok(same, `${nm} ↔ 종전: 날마다 DB 해시·방송 해시 같음 — ${A.o.map((r, i) => `d${i} ${r.db.n}행 ${r.db.h}${X.o[i] && r.db.h === X.o[i].db.h ? '' : '≠' + (X.o[i] && X.o[i].db.h)} 방송${r.casts}`).join(' · ')}`);
}
const nb = (X) => X.logs.map((l) => +((l.match(/묶음 (\d+)/) || [0, 0])[1]));
console.log(`  묶음 수(날마다) 16ms: ${nb(B).join('/')} · 1ms: ${nb(B1).join('/')} · 0: ${nb(B0).join('/')}`);
ok(nb(B1).some((n) => n > 1), `★자명 통과 금지 — 1ms 팔은 실제로 여러 묶음으로 썼다`);
ok(A.o[A.o.length - 1].casts > 0, `★자명 통과 금지 — 방송이 실제로 났다(종전 ${A.o[A.o.length - 1].casts}번)`);
// 죽였다 살림 — 셋째 날 경계 틱(첫 묶음만 쓴 뒤)
const KD = 3;
const Ke = arm(ROOT, 1, { T630_KILL: 'exit', T630_KILLDAY: String(KD) });
const Kk = arm(ROOT, 1, { T630_KILL: 'kill', T630_KILLDAY: String(KD) });
const ref = arm(OLD, 16, { T630_KILL: 'exit', T630_KILLDAY: String(KD) });   // 종전 판도 같은 자리에서 끊는다(그날 플러시는 경계 틱에 다 썼다)
const de = dumpDb(Ke.db), dk = dumpDb(Kk.db), dr = dumpDb(ref.db);
ok(de && dr && de.h === dr.h, `정상 종료(exit 훅이 남은 묶음을 쓴다) → 다음 부팅 DB = 종전 판 같은 자리 DB (${de && de.n}행 ${de && de.h} · 종전 ${dr && dr.n}행 ${dr && dr.h})`);
console.log(`  SIGKILL(첫 묶음만 쓴 뒤) → DB ${dk && dk.n}행 ${dk && dk.h} · 종전 같은 자리 ${dr && dr.n}행 — ${dk && dr && dk.h === dr.h ? '같음' : '다름(남은 묶음을 잃는다 — 표 칸)'}`);
for (const f of [A, B, B1, B0, Ke, Kk, ref]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f.db + s); } catch (e) {} }
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
