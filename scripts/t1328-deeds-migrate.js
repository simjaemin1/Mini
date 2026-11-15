#!/usr/bin/env node
// === scripts/t1328-deeds-migrate.js — 사유지 돌봄(T1305) 라이브 DB 이행 확인 (계측기 · 러너 밖 · T1305 회부 4) ========================
//
// ★무엇 — 맥 `~/Mini/_db/` 라이브 존 DB 사본(원본 무접촉 — 스테이지 사본을 다시 복사해 연다)으로 존을 세 번 띄운다:
//   ① 켬(`T1305_DEEDS=1`) 첫 부팅 — `claims` 에 `care_n` · `care_w` 두 열이 붙는가 · 행 수 그대로인가 · 켠 날 낡음(`care_w` > 0) 0 인가
//   ② 끔(손잡이 없음) 다시 부팅 — 같은 사본 · 행 수 · 행 값(돌봄 두 열 포함) 그대로인가(끔 코드는 두 열을 안 읽고 안 지운다)
//   두 갈래를 돈다: ⓐ 라이브 사본 그대로 · ⓑ 같은 사본에 개인 사유지 세 행을 손으로 넣은 판(라이브엔 사유지가 0 행이라 "그대로" 가 0 → 0 뿐이다 —
//   옛 행이 있는 이행을 실제로 보려고 · 사본에만).
// 쓰는 법: node scripts/t1328-deeds-migrate.js <원본 사본 db> <zone id> <작업 폴더>
'use strict';
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const [SRC, ZONE, WORK] = process.argv.slice(2);
if (!SRC || !ZONE || !WORK) { console.error('쓰는 법: <db> <zone> <work>'); process.exit(2); }
fs.mkdirSync(WORK, { recursive: true });
const CPORT = 3810, ZPORT = 3820;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env, tag) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(path.join(WORK, `${tag}.log`), { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  procs.push(p); return p;
}
async function down() { await FB.stopKids(procs); procs.length = 0; await FB.waitFree([CPORT, ZPORT]); }
function inspect(db) {
  const D = new DatabaseSync(db);
  const cols = D.prepare('PRAGMA table_info(claims)').all().map((c) => c.name);
  const rows = D.prepare('SELECT * FROM claims ORDER BY id').all();
  const quick = D.prepare('PRAGMA quick_check').all().map((r) => Object.values(r)[0]).join(',');
  D.close();
  return { cols, n: rows.length, personal: rows.filter((r) => (r.kind || 'personal') === 'personal').length, worn: rows.filter((r) => (r.care_w | 0) > 0).length, rows, quick };
}
async function up(db, on, tag) {
  const C = boot('central.js', { PORT: String(CPORT), DB_PATH: path.join(WORK, `central-${tag}.db`), PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZONE }, `central-${tag}`);
  const uc = await FB.waitUp(C, /central server up on/, { name: 'central' });
  const env = { PORT: String(ZPORT), ZONE_ID: ZONE, DB_PATH: db, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_BANDITS: '0' };
  if (on) env.T1305_DEEDS = '1';
  const Z = boot('zone.js', env, `zone-${tag}`);
  const uz = await FB.waitUp(Z, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (uz.ok) await sleep(8000);   // 첫 틱 · 첫 저장이 돌 틈(켠 날 셈은 부팅 · 첫 날 머리에서 선다)
  return { ok: uc.ok && uz.ok, ms: uz.ms, why: uz.why || uc.why };
}
(async () => {
  const out = [];
  for (const arm of ['live', 'seeded']) {
    const db = path.join(WORK, `${ZONE}-${arm}.db`);
    for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(db + s); } catch (e) {} }
    fs.copyFileSync(SRC, db);
    if (arm === 'seeded') {
      const D = new DatabaseSync(db);
      const cols = D.prepare('PRAGMA table_info(claims)').all().map((c) => c.name);
      const ins = D.prepare(`INSERT INTO claims (owner_id, owner_name, x, y, w, h, created_at${cols.includes('kind') ? ', kind' : ''}) VALUES (?, ?, ?, ?, ?, ?, ?${cols.includes('kind') ? ", 'personal'" : ''})`);
      const t0 = Date.now() - 3 * 86400000;
      ins.run('t1328-a', '시험갑', 100, 100, 3, 3, t0); ins.run('t1328-b', '시험을', 140, 100, 4, 4, t0); ins.run('t1328-c', '시험병', 180, 100, 2, 2, t0);
      D.close();
    }
    const B = inspect(db);
    const r1 = await up(db, true, `${arm}-on`); await down();
    const A1 = inspect(db);
    const r2 = await up(db, false, `${arm}-off`); await down();
    const A2 = inspect(db);
    const same = (x, y) => JSON.stringify(x.rows.map((r) => [r.id, r.owner_id, r.x, r.y, r.w, r.h, r.kind, r.care_n, r.care_w])) === JSON.stringify(y.rows.map((r) => [r.id, r.owner_id, r.x, r.y, r.w, r.h, r.kind, r.care_n, r.care_w]));
    const row = { zone: ZONE, arm, before: { n: B.n, personal: B.personal, careCols: B.cols.filter((c) => /^care_/.test(c)) },
      on: { boot: r1.ok, ms: r1.ms, n: A1.n, personal: A1.personal, careCols: A1.cols.filter((c) => /^care_/.test(c)), worn: A1.worn, care: A1.rows.map((r) => [r.care_n, r.care_w]), quick: A1.quick },
      off: { boot: r2.ok, ms: r2.ms, n: A2.n, careCols: A2.cols.filter((c) => /^care_/.test(c)), rowsSame: same(A1, A2), quick: A2.quick } };
    console.log(JSON.stringify(row));
    out.push(row);
  }
  fs.writeFileSync(path.join(WORK, `${ZONE}-result.json`), JSON.stringify(out, null, 1));
  process.exit(0);
})().catch(async (e) => { console.error(e); await down(); process.exit(1); });
