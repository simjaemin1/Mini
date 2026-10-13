#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T721 처리 스크립트 시험 · 가짜 DB 둘 · 판정은 이 스크립트의 규칙 줄만)
// === scripts/test-t721-apply.js — `t721-apply.js` 를 가짜 존 · central DB 와 가짜 차분으로 돌려 규칙 줄이 다 서는지 본다 ===
//   ① 멈춤: 막힘 칸 위에 상자 · 지은 것 · 곳간 · 회관이 있으면 종료 코드 2 · 사본 파일이 안 생긴다
//   ② 적용: 그것들을 뺀 판 — 사본에만 쓰고(원본 바이트 그대로) 규칙대로 지운다 · 사람 몸은 캐논 순서(길드 > 개인 > 처음 고른 마을)로 피난
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 't721-'));
const W = 128, H = 128, SZ = 32;
// 막힘 = x 70..79 · y 70..79 (100칸 · 청크(32칸) (2,2)) · 광맥 빠짐 = (5,5) 청크 (0,0) · 숲 빠짐 = (100,100) 청크 (3,3)
const block = []; for (let y = 70; y < 80; y++) for (let x = 70; x < 80; x++) block.push(y * W + x);
const b64 = (a) => Buffer.from(new Uint32Array(a).buffer).toString('base64');
const diff = { zone: 'hanbando', W, H, cells: { '통행→막힘': b64(block), '뭍→바다': b64(block), '광맥 빠짐': b64([5 * W + 5]), '숲 빠짐': b64([100 * W + 100]) }, villageSites: [] };
fs.writeFileSync(path.join(T, 'diff.json'), JSON.stringify(diff));
function mkZone(f, withStop) {
  const d = new Database(f);
  d.exec(`CREATE TABLE villages (id INTEGER PRIMARY KEY, zone TEXT, name TEXT, cx INTEGER, cy INTEGER, population INTEGER DEFAULT 0, econ_state TEXT, day INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0);
    CREATE TABLE village_buildings (id INTEGER PRIMARY KEY AUTOINCREMENT, village_id INTEGER, type TEXT, cx INTEGER, cy INTEGER, floors INTEGER DEFAULT 1, data TEXT, created_at INTEGER DEFAULT 0);
    CREATE TABLE claims (id INTEGER PRIMARY KEY, owner_id TEXT, owner_name TEXT, x REAL, y REAL, w REAL, h REAL, created_at INTEGER DEFAULT 0, kind TEXT, guild_tribe_id INTEGER, state TEXT DEFAULT 'active', held_by TEXT, state_at INTEGER DEFAULT 0);
    CREATE TABLE mobs (id INTEGER PRIMARY KEY, type TEXT, x REAL, y REAL, hp INTEGER DEFAULT 1, max_hp INTEGER DEFAULT 1, tame_owner TEXT, tame_owner_name TEXT, created_at INTEGER DEFAULT 0);
    CREATE TABLE buildings (id INTEGER PRIMARY KEY, type TEXT, owner_id TEXT, owner_name TEXT, x REAL, y REAL, data TEXT, created_at INTEGER DEFAULT 0, village_id INTEGER);
    CREATE TABLE roads (zone TEXT, cell_key INTEGER, v REAL, d INTEGER, PRIMARY KEY (zone, cell_key));
    CREATE TABLE mined_cells (cell_key TEXT PRIMARY KEY, prosperity REAL, last_t INTEGER);
    CREATE TABLE harvested_seeds (seed_key TEXT PRIMARY KEY, harvested_at INTEGER);
    CREATE TABLE bandit_state (zone TEXT PRIMARY KEY, data TEXT, day INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0);
    CREATE TABLE onboarding (player_id TEXT PRIMARY KEY, zone TEXT, start_vid INTEGER);
    CREATE TABLE trade_routes (zone TEXT, pair TEXT, sig TEXT, pts TEXT);`);
  d.prepare("INSERT INTO villages (id, zone, name, cx, cy) VALUES (1,'hanbando','물가마을',20,20), (2,'hanbando','먼마을',120,120)").run();
  const vb = d.prepare('INSERT INTO village_buildings (village_id, type, cx, cy) VALUES (?,?,?,?)');
  for (let x = 68; x < 74; x++) vb.run(1, 'terr', x, 72);          // 4 칸 막힘(70~73) · 2 칸 남음
  vb.run(1, 'house', 71, 71); vb.run(1, 'dryfield', 72, 73); vb.run(1, 'yard', 22, 22);
  if (withStop) { vb.run(1, 'granary', 75, 75); vb.run(1, 'hall', 76, 76); }
  const cl = d.prepare('INSERT INTO claims (id, owner_id, owner_name, x, y, w, h, kind, guild_tribe_id) VALUES (?,?,?,?,?,?,?,?,?)');
  cl.run(1, 'p_a', '갑', 71 * SZ, 71 * SZ, SZ, SZ, null, null);                 // 1칸 · 막힘 → R1 소멸
  cl.run(2, 'p_b', '을', 68 * SZ, 75 * SZ, 4 * SZ, SZ, null, null);             // 68~71 → 70·71 막힘 → R2 남음
  cl.run(3, 'p_c', '병', 10 * SZ, 10 * SZ, SZ, SZ, null, null);                 // 안 막힘(병의 피난처)
  cl.run(4, 'g7', '길드7', 12 * SZ, 12 * SZ, 2 * SZ, 2 * SZ, 'guild', 7);       // 길드 7 사유지
  d.prepare('INSERT INTO mobs (id, type, x, y) VALUES (1,?,?,?), (2,?,?,?)').run('wolf', 73 * SZ + 5, 73 * SZ + 5, 'deer', 5 * SZ, 5 * SZ);
  if (withStop) d.prepare("INSERT INTO buildings (id, type, owner_id, owner_name, x, y) VALUES (1,'chest','public','공용 상자',?,?), (2,'wall','p_a','갑',?,?)").run(74 * SZ, 74 * SZ, 77 * SZ, 77 * SZ);
  d.prepare("INSERT INTO buildings (id, type, owner_id, owner_name, x, y) VALUES (3,'floor','p_c','병',?,?)").run(10 * SZ, 10 * SZ);   // 안 막힘
  d.prepare("INSERT INTO roads (zone, cell_key, v, d) VALUES ('hanbando',?,120,0), ('hanbando',?,40,0)").run(72 * W + 72, 2 * W + 2);
  d.prepare("INSERT INTO mined_cells (cell_key, prosperity, last_t) VALUES ('5_5',0,0), ('6_6',0,0)").run();
  d.prepare("INSERT INTO harvested_seeds (seed_key, harvested_at) VALUES ('0_0_1',0), ('2_2_2',0), ('3_3_4',0), ('1_1_3',0)").run();   // 청크 32칸: (0,0) 광맥 · (2,2) 막힘 · (3,3) 숲 · (1,1) 안 바뀜
  d.prepare("INSERT INTO bandit_state (zone, data) VALUES ('hanbando', ?)").run(JSON.stringify({ dens: [{ id: 1, cx: 75, cy: 72 }, { id: 2, cx: 2, cy: 120 }], gangs: [] }));
  d.prepare("INSERT INTO onboarding (player_id, zone, start_vid) VALUES ('p_d','hanbando',2)").run();
  d.close();
}
function mkCentral(f) {
  const d = new Database(f);
  d.exec('CREATE TABLE players (player_id TEXT PRIMARY KEY, name TEXT, tribe_id INTEGER, last_zone TEXT, last_x REAL, last_y REAL)');
  const p = d.prepare('INSERT INTO players VALUES (?,?,?,?,?,?)');
  p.run('p_g', '길드원', 7, 'hanbando', 73 * SZ, 73 * SZ);   // 막힘 → 길드 사유지
  p.run('p_c', '병', null, 'hanbando', 74 * SZ, 71 * SZ);     // 막힘 → 개인 사유지 #3
  p.run('p_d', '정', null, 'hanbando', 76 * SZ, 78 * SZ);     // 막힘 → 처음 고른 마을 #2
  p.run('p_e', '무', null, 'hanbando', 3 * SZ, 3 * SZ);       // 안 막힘
  d.close();
}
const H1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const run = (args) => spawnSync(process.execPath, [path.join(__dirname, 't721-apply.js'), path.join(T, 'diff.json'), ...args], { encoding: 'utf8' });
console.log('\n① 멈춤 판(상자 · 지은 것 · 곳간 · 회관)');
mkZone(path.join(T, 'zs.db'), true); mkCentral(path.join(T, 'cs.db'));
const h0 = H1(path.join(T, 'zs.db'));
let r = run(['--db', path.join(T, 'zs.db'), '--central', path.join(T, 'cs.db'), '--apply', '--out', path.join(T, 'zs_out.db'), '--central-out', path.join(T, 'cs_out.db'), '--json', path.join(T, 'stop.json')]);
ok(r.status === 2, '종료 코드 2', r.status);
ok(!fs.existsSync(path.join(T, 'zs_out.db')), '사본 파일 안 생김');
ok(H1(path.join(T, 'zs.db')) === h0, '원본 바이트 그대로');
const sj = JSON.parse(fs.readFileSync(path.join(T, 'stop.json'), 'utf8'));
ok(sj.stopCls['상자(재민 칸 — 나중에)'] === 1 && sj.stopCls['잔해 비율(재민 칸 — 나중에)'] === 2 && sj.stopCls['마을 코너(나중에 같이)'] === 1, '멈춤 갈래: 상자 1 · 잔해 2(벽 · 곳간) · 코너 1(회관)', JSON.stringify(sj.stopCls));
console.log('\n② 적용 판(멈춤 행 없음)');
mkZone(path.join(T, 'z.db'), false); mkCentral(path.join(T, 'c.db'));
const hz = H1(path.join(T, 'z.db')), hc = H1(path.join(T, 'c.db'));
r = run(['--db', path.join(T, 'z.db'), '--central', path.join(T, 'c.db'), '--json', path.join(T, 'dry.json')]);
ok(r.status === 0, '예행 종료 0', r.status);
ok(H1(path.join(T, 'z.db')) === hz && H1(path.join(T, 'c.db')) === hc, '예행 — 두 원본 바이트 그대로');
r = run(['--db', path.join(T, 'z.db'), '--central', path.join(T, 'c.db'), '--apply', '--out', path.join(T, 'z_out.db'), '--central-out', path.join(T, 'c_out.db')]);
ok(r.status === 0, '적용 종료 0', r.status + ' ' + (r.stderr || '').slice(0, 200));
ok(H1(path.join(T, 'z.db')) === hz && H1(path.join(T, 'c.db')) === hc, '적용 — 원본 바이트 그대로(사본에만)');
const z = new Database(path.join(T, 'z_out.db'), { readonly: true }), c = new Database(path.join(T, 'c_out.db'), { readonly: true });
const ids = (q) => z.prepare(q).all().map((x) => Object.values(x)[0]);
ok(JSON.stringify(ids('SELECT id FROM claims ORDER BY id')) === '[2,3,4]', 'R1 갑의 1칸 사유지 소멸 · R2 을의 사유지 남음', JSON.stringify(ids('SELECT id FROM claims ORDER BY id')));
ok(JSON.stringify(ids('SELECT id FROM mobs')) === '[2]', 'R4 막힘 위 늑대 지움 · 사슴 남음');
ok(z.prepare("SELECT COUNT(*) c FROM village_buildings WHERE type='terr'").get().c === 2, 'R5 영토 6 → 2(막힌 4 칸 뺌)');
ok(z.prepare("SELECT COUNT(*) c FROM village_buildings WHERE type IN ('house','dryfield')").get().c === 0 && z.prepare("SELECT COUNT(*) c FROM village_buildings WHERE type='yard'").get().c === 1, 'R6 막힌 집 · 밭 지움 · 마당(안 막힘) 남음');
ok(z.prepare('SELECT COUNT(*) c FROM roads').get().c === 1, 'R12 막힌 길 칸 지움');
ok(JSON.stringify(ids('SELECT cell_key FROM mined_cells')) === '["6_6"]', 'R13 광맥 빠진 칸 지움');
ok(JSON.stringify(ids('SELECT seed_key FROM harvested_seeds')) === '["1_1_3"]', 'R14 바뀐 청크 셋(광맥 · 막힘 · 숲)의 벤 나무 지움 · 안 바뀐 청크 남음');
ok(JSON.parse(z.prepare('SELECT data FROM bandit_state').get().data).dens.map((d) => d.id).join() === '2', 'R15 막힌 소굴#1 뺌');
ok(z.prepare('SELECT COUNT(*) c FROM buildings').get().c === 1, '안 막힌 지은 것 그대로');
const pos = (id) => { const p = c.prepare('SELECT last_x, last_y FROM players WHERE player_id = ?').get(id); return [Math.round(p.last_x), Math.round(p.last_y)].join(','); };
ok(pos('p_g') === `${12 * SZ + SZ},${12 * SZ + SZ}`, 'R3 길드원 → 길드 사유지 가운데', pos('p_g'));
ok(pos('p_c') === `${10 * SZ + SZ / 2},${10 * SZ + SZ / 2}`, 'R3 병 → 개인 사유지 가운데', pos('p_c'));
ok(pos('p_d') === `${120 * SZ + SZ / 2},${120 * SZ + SZ / 2}`, 'R3 정 → 처음 고른 마을(먼마을)', pos('p_d'));
ok(pos('p_e') === `${3 * SZ},${3 * SZ}`, '안 막힌 사람 그대로');
const ch = JSON.parse(fs.readFileSync(path.join(T, 'z_out.db.chronicle.json'), 'utf8'));
ok(ch.length >= 5 && ch.every((x) => x.why), '연표 곁 파일 — 줄마다 까닭', `${ch.length}줄`);
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
