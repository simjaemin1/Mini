#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1389 계측기 · 라이브 DB 사본만 · 원본 무접촉)
// === scripts/t1389-deeds-migrate.js — 사유지 돌봄 켬 날의 라이브 DB 이행(T1389 ② · 서울 hanbando · 도쿄 nippon 사본) ==========
//
// ★무엇 — 라이브 존 DB 사본(맥 `~/Mini/_db/` 스냅숏을 스테이지한 것 — 이 판은 그 사본을 다시 복사해 연다)으로 존을 세 번 띄운다(아이 판 · 존 그대로 · 마을 · 짐승 끔 = 빨리):
//   ① 켬 첫 부팅 — `deed_chunks` · `deed_owners`(빚 세 열 포함) 표가 서는가 · `claims` 행 수 · 값 그대로인가 · 이미 선포된 칸의 청크 줄이
//      **저축 가득**(칸 × 100)에서 시작하는가 · 켠 순간 풀린 칸 0 · 빚 0.
//   ② 켬 다시 부팅(같은 사본 · 벽시계가 흘렀다) — 저장된 줄을 그대로 읽고 흐른 시간만큼만 줄었는가(풀린 칸 0 — 버티는 날 안).
//   ③ 끔(`T1305_DEEDS=0`) 부팅 — 같은 사본 · `claims` 행 그대로(끔 코드는 돌봄 표를 안 읽고 안 지운다).
//   두 갈래: ⓐ 라이브 사본 그대로(사유지 0행 — 서울 · 도쿄 둘 다) · ⓑ 같은 사본에 개인 사유지 행을 손으로 넣은 판(이어진 12칸 한 사람 + 외딴 3칸 다른 사람 — 사본에만).
// 쓰는 법: node scripts/t1389-deeds-migrate.js <사본 db> <zone id> <작업 폴더>
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..');
const PHASE = process.env.__T1389_PHASE || '';

if (PHASE) {   // ── 아이: 존 하나를 띄우고 잰다 ──
  Object.assign(process.env, { ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0' });
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  let Z, err = null; try { Z = require(path.join(ROOT, 'server', 'zone.js')); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
  console.log = _l; console.warn = _w; console.error = _e;
  const out = { phase: PHASE, err };
  if (Z) {
    const H = Z.__testBind(), D = H.Deeds;
    out.on = D.ON;
    const pers = [...H.claims.values()].filter((c) => c.kind === 'personal');
    out.personal = pers.length; out.free = pers.filter((c) => (c.state || 'active') === 'free').length;
    out.chunks = [...H.deedChunks.values()].map((r) => { const n = pers.filter((c) => c.ownerPid === r.pid && D.chunkOf(Math.floor(c.x / H.BUILDING_SIZE), Math.floor(c.y / H.BUILDING_SIZE)).join(',') === r.cx + ',' + r.cy).length; return { pid: r.pid, cx: r.cx, cy: r.cy, m: r.m, n, full: Math.abs(r.m - D.capOf(n)) < 1e-6, t: r.t }; });
    out.debt = [...H.deedDebt.values()].map((r) => +r.debt || 0);
    out.freedStat = H._t1343Stat.freed | 0;
  }
  console.log('@@T1389M ' + JSON.stringify(out));
  process.exit(0);
}

const [SRC, ZONE, WORK] = process.argv.slice(2);
if (!SRC || !ZONE || !WORK) { console.error('쓰는 법: <db> <zone> <work>'); process.exit(2); }
fs.mkdirSync(WORK, { recursive: true });
const tables = (db) => { const D = new DatabaseSync(db); const t = D.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name); const rows = D.prepare('SELECT * FROM claims ORDER BY id').all(); const owners = t.includes('deed_owners') ? D.prepare('PRAGMA table_info(deed_owners)').all().map((c) => c.name) : []; const q = D.prepare('PRAGMA quick_check').all().map((r) => Object.values(r)[0]).join(','); D.close(); return { deed: t.filter((x) => x.startsWith('deed')), rows, owners, quick: q }; };
const run = (db, phase, deeds) => {
  let o = ''; try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1389_PHASE: phase, DB_PATH: db, ZONE_ID: ZONE, T1305_DEEDS: deeds, PORT: String(require('./lib-port').port(37800)) }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 600000, maxBuffer: 64 * 1024 * 1024 }); } catch (e) { o = String((e && e.stdout) || ''); }
  const m = /@@T1389M (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : { err: '아이 판 없음' };
};
const result = { src: SRC, zone: ZONE, arms: {} };
for (const arm of ['a', 'b']) {
  const db = path.join(WORK, `${ZONE}-${arm}.db`);
  for (const f of [db, db + '-wal', db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  fs.copyFileSync(SRC, db);
  if (arm === 'b') {
    const D = new DatabaseSync(db), now = Date.now();
    const ins = D.prepare("INSERT INTO claims (owner_id, owner_name, x, y, w, h, created_at, kind, state, state_at) VALUES (?, ?, ?, ?, 32, 32, ?, 'personal', 'active', 0)");
    for (let i = 0; i < 12; i++) ins.run('t1389_mig_a', '이행갑', (60000 + (i % 4)) * 32, (60000 + Math.floor(i / 4)) * 32, now);   // 4×3 이어진 12칸
    for (let i = 0; i < 3; i++) ins.run('t1389_mig_b', '이행을', (61000 + i * 5) * 32, 61000 * 32, now);              // 외딴 3칸(옛 흩뿌린 꼴)
    D.close();
  }
  const before = tables(db);
  const on1 = run(db, 'on1', '1'), mid = tables(db);
  const on2 = run(db, 'on2', '1');
  const off = run(db, 'off', '0'), after = tables(db);
  const same = (x, y) => JSON.stringify(x.rows) === JSON.stringify(y.rows);
  result.arms[arm] = {
    before: { claims: before.rows.length, deed: before.deed, quick: before.quick },
    on1: { ok: !on1.err, on: on1.on, personal: on1.personal, free: on1.free, chunks: (on1.chunks || []).length, allFull: (on1.chunks || []).every((c) => c.full), debt: on1.debt, tables: mid.deed, ownersCols: mid.owners, claimsSame: same(before, mid), err: on1.err },
    on2: { ok: !on2.err, personal: on2.personal, free: on2.free, mDrop: (on2.chunks || []).map((c) => { const p = (on1.chunks || []).find((q) => q.pid === c.pid && q.cx === c.cx && q.cy === c.cy); return p ? +(p.m - c.m).toFixed(6) : null; }), err: on2.err },
    off: { ok: !off.err, on: off.on, personal: off.personal, claimsSame: same(mid, after), quick: after.quick, err: off.err },
  };
}
const A = result.arms;
const pass = ['a', 'b'].every((k) => A[k].on1.ok && A[k].on1.on && A[k].on1.free === 0 && A[k].on1.allFull && A[k].on1.claimsSame && A[k].on1.tables.length === 2 && A[k].on1.ownersCols.includes('debt') && A[k].on2.ok && A[k].on2.free === 0 && A[k].off.ok && A[k].off.on === false && A[k].off.claimsSame && A[k].off.quick === 'ok')
  && A.b.on1.personal === 15 && A.b.on1.chunks >= 4 && A.a.on1.personal === 0;
result.pass = pass;
console.log(JSON.stringify(result, null, 1));
console.log(pass ? `\n=== ${ZONE} 이행 ○ ===` : `\n=== ${ZONE} 이행 ✗ ===`);
fs.writeFileSync(path.join(WORK, `${ZONE}-migrate.json`), JSON.stringify(result, null, 1));
process.exit(pass ? 0 : 1);
