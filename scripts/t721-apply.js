#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T721 지형 처리 스크립트 · 제품 무변 · 판정 0 · 새 수 0 · 실서버 0)
// === scripts/t721-apply.js — 지형이 바뀔 때 그 위 실체를 **재민 규칙(10-13)** 대로 처리한다 =========================
//   입력: `t710-diff.js` 차분 JSON(바뀐 셀) + 존 DB 사본 [+ central DB 사본]
//   기본 = **예행**(바꿀 행 표만 · 어느 DB 도 안 연다 쓰기로 — `readonly`).
//   `--apply --out <새 파일>` = 존 DB 를 그 새 파일로 **복사한 뒤 복사본에만** 쓴다(central 도 `--central-out`). 원본은 절대 안 쓴다.
//   ★정하지 않은 셋(잔해 비율 · 땅 위 물건 · 상자)과 마을 코너(회관 · 마을 가운데 · 마을 터 옮김 — "나중에 같이")에 걸리는 행이
//     하나라도 있으면 **아무것도 안 바꾸고** 표를 낸 뒤 종료 코드 2 로 멈춘다. 규칙이 서면 `RULES` 의 그 줄만 채우면 된다.
//   처리마다 까닭(해일 · 땅 꺼짐 · 물길 바뀜)을 연표 줄로 낸다 — 연표 표에 새 사건 이름을 넣는 건 제품 문이라 이 스크립트는
//     곁 파일(`<out>.chronicle.json`)에만 적는다.
//   쓰는 법: node scripts/t721-apply.js <차분.json> --db <존 DB 사본> [--central <central DB 사본>] [--apply --out <새 존 DB> [--central-out <새 central DB>]] [--json <표.json>]
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DIFF = JSON.parse(fs.readFileSync(A[0], 'utf8'));
const DBP = opt('--db', null), CEN = opt('--central', null), APPLY = A.includes('--apply');
const OUT = opt('--out', null), CEN_OUT = opt('--central-out', null), JSON_OUT = opt('--json', null);
if (!DBP) { console.error('쓰는 법: <차분.json> --db <존 DB 사본> [--central <central>] [--apply --out <새 존 DB> [--central-out <새 central>]]'); process.exit(2); }
if (APPLY && (!OUT || path.resolve(OUT) === path.resolve(DBP) || fs.existsSync(OUT))) { console.error('--apply 는 --out <없는 새 파일> 이 있어야 한다(원본에는 쓰지 않는다)'); process.exit(2); }
if (APPLY && CEN && (!CEN_OUT || path.resolve(CEN_OUT) === path.resolve(CEN) || fs.existsSync(CEN_OUT))) { console.error('--central 을 처리하려면 --central-out <없는 새 파일>'); process.exit(2); }
const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
const W = DIFF.W, H = DIFF.H, ZONE = DIFF.zone, SZ = 32, CHUNK = 1024;
const dec = (b64) => new Uint32Array(Buffer.from(b64 || '', 'base64').buffer.slice(0));
const S = {}; for (const [k, v] of Object.entries(DIFF.cells || {})) S[k] = new Set(dec(v));
for (const k of ['통행→막힘', '뭍→바다', '뭍→강호수', '바위 생김', '다리 빠짐', '숲 빠짐', '숲 생김', '광맥 빠짐', '광맥 바뀜', '광맥 생김', '물→뭍', '개울 생김']) if (!S[k]) S[k] = new Set();
// 막힘 = 통행→막힘(뭍→바다 · 뭍→강호수 · 바위 생김 · 다리 빠짐이 물 위면 거기 다 든다)
const BLOCK = S['통행→막힘'];
const why = (i) => S['뭍→바다'].has(i) ? '해일(뭍이 바다가 됨)' : S['뭍→강호수'].has(i) ? '물길 바뀜(뭍이 강·호수가 됨)' : S['바위 생김'].has(i) ? '땅 꺼짐·솟음(바위)' : S['다리 빠짐'].has(i) ? '다리 쓸려 감' : '지형 바뀜';
const cellPx = (x, y) => { const cx = Math.floor(x / SZ), cy = Math.floor(y / SZ); return (cx < 0 || cy < 0 || cx >= W || cy >= H) ? -1 : cy * W + cx; };
// ── 규칙 표(재민 10-13 · 보고/T710 §3 · 지시 T721) — 줄마다: 이름 · 고른 안 · 할 일 ──
const STOP = { DEBRIS: '잔해 비율(재민 칸 — 나중에)', GROUND: '땅 위 물건(재민 칸 — 나중에)', CHEST: '상자(재민 칸 — 나중에)', CORNER: '마을 코너(나중에 같이)' };
const RULES = [
  ['R1', '사유지 — 셀이 전부 막힘', 'ⓐ', '행 지움(소멸) + 통보'],
  ['R2', '사유지 — 일부 막힘', 'ⓐ', '행 그대로(남은 셀만 쓴다 — 막힌 셀은 지형이 막는다 · 대토 없음)'],
  ['R3', '사람 몸 — 마지막 자리 막힘', 'ⓐ', '리스폰 캐논 자리 순서로 피난(길드 사유지 > 개인 사유지 > 처음 고른 마을) · 죽음 처리 없음'],
  ['R4', '짐승(mobs) — 막힘 위', 'ⓑ', '행 지움'],
  ['R5', '마을 영토 셀(terr · nongzone) — 막힘', 'ⓐ', '그 셀만 영토에서 뺌(행 지움)'],
  ['R6', '마을 집 · 집터 · 밭 · 논 · 텃밭 · 마당 · 광장 · 도랑 — 막힘', 'ⓐ', '행 지움(집이 줄면 침상 `_mapBeds` 가 부팅 때 줄고 집 행위가 다시 짓는다)'],
  ['R7', '마을 회관 · 쉼터 · 마을 가운데 · 마을 터 옮김', '—', '멈춤: ' + STOP.CORNER],
  ['R8', '곳간 셀(granary) — 막힘', '재민', '안의 것 전부 잃음 + 잔해 → 멈춤: ' + STOP.DEBRIS],
  ['R9', '지은 것(바닥 · 벽 · 움집터 — 사람 · NPC 같은 규칙)', '—', '멈춤: ' + STOP.DEBRIS],
  ['R10', '상자', '—', '멈춤: ' + STOP.CHEST],
  ['R11', '땅 위 물건', '—', '멈춤: ' + STOP.GROUND],
  ['R12', '길 칸(roads) — 막힘', 'ⓐ', '행 지움(물→뭍 새 칸은 0 에서 — 이미 그렇다)'],
  ['R13', '캔 칸(mined_cells) — 광맥 빠짐 · 바뀜', 'ⓐ', '행 지움(새 광맥은 번영 0 에서)'],
  ['R14', '벤 나무 기록(harvested_seeds) — 숲 · 광맥 · 막힘이 바뀐 청크', 'ⓐ', '그 청크 행 지움'],
  ['R15', '도적 소굴 · 은거지 — 막힘', 'ⓐ', '그 소굴을 뺀다(다시 훑기) · 숲 빠짐은 그대로'],
  ['R16', '교역로 캐시(trade_routes)', 'ⓐ', '이 스크립트 0행 — 정본 서명이 바뀌면 부팅이 통째로 버리고 다시 판다(T42 문)'],
  ['R17', '마을 econ 땅 값(ore · water · wood)', 'ⓑ(PM 안)', '다시 잰다 — 대상 마을 목록(재는 문은 제품 쪽 · 다음 카드)'],
  ['R18', '연표', '캐논', '처리마다 까닭 한 줄(곁 파일) — 연표 표에 넣는 사건 이름은 제품 문'],
];
const db = new Database(DBP, { readonly: true, fileMustExist: true });
const has = (d, t) => !!d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const plan = {}; for (const r of RULES) plan[r[0]] = { rows: [], note: null };
const stops = [];
const chron = [];   // [{ vid|null, who, what, why }]
const vById = new Map();
if (has(db, 'villages')) for (const v of db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all(ZONE)) vById.set(v.id, v);
const vName = (id) => (vById.get(id) || {}).name || `#${id}`;
// R1 · R2 사유지
if (has(db, 'claims')) for (const c of db.prepare('SELECT * FROM claims').all()) {
  const x0 = Math.floor(c.x / SZ), y0 = Math.floor(c.y / SZ), w = Math.max(1, Math.round((c.w || SZ) / SZ)), h = Math.max(1, Math.round((c.h || SZ) / SZ));
  let tot = 0, blk = 0, wy = null;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; tot++; const i = y * W + x; if (BLOCK.has(i)) { blk++; wy = wy || why(i); } }
  if (!blk) continue;
  const row = { id: c.id, owner: c.owner_name, ownerId: c.owner_id, kind: c.kind || null, cells: tot, blocked: blk, why: wy };
  if (blk >= tot) { plan.R1.rows.push(row); chron.push({ vid: null, who: c.owner_name, what: `사유지 #${c.id} 사라짐(${tot}셀)`, why: wy }); }
  else plan.R2.rows.push(row);
}
// R3 사람 몸(central)
if (CEN) {
  const cdb = new Database(CEN, { readonly: true, fileMustExist: true });
  const claimsAll = has(db, 'claims') ? db.prepare('SELECT * FROM claims').all() : [];
  const goneClaims = new Set(plan.R1.rows.map((r) => r.id));
  const onb = new Map(); if (has(db, 'onboarding')) for (const o of db.prepare('SELECT player_id, start_vid FROM onboarding').all()) onb.set(o.player_id, o.start_vid);
  const center = (c) => [c.x + (c.w || SZ) / 2, c.y + (c.h || SZ) / 2];
  for (const p of cdb.prepare('SELECT player_id, name, tribe_id, last_zone, last_x, last_y FROM players WHERE last_zone = ?').iterate(ZONE)) {
    const i = cellPx(p.last_x, p.last_y); if (i < 0 || !BLOCK.has(i)) continue;
    // 캐논 순서(zone.js listRespawnOptions 그 순서 · 사라지는 사유지는 뺀다 · 자리 고르기(문간 등)는 서버가 깨어날 때 한다 — 여기선 닻만)
    let to = null, via = null;
    const ok = (c) => !goneClaims.has(c.id) && cellPx(...center(c)) >= 0 && !BLOCK.has(cellPx(...center(c)));
    const g = p.tribe_id ? claimsAll.find((c) => c.kind === 'guild' && c.guild_tribe_id === p.tribe_id && ok(c)) : null;
    if (g) { to = center(g); via = `길드 사유지 #${g.id}`; }
    if (!to) { const m = claimsAll.find((c) => c.owner_id === p.player_id && c.kind !== 'guild' && ok(c)); if (m) { to = center(m); via = `개인 사유지 #${m.id}`; } }
    if (!to) { const vid = onb.get(p.player_id); const v = vid != null ? vById.get(vid) : null; if (v && !BLOCK.has(v.cy * W + v.cx)) { to = [v.cx * SZ + SZ / 2, v.cy * SZ + SZ / 2]; via = `처음 고른 마을 ${v.name}`; } }
    plan.R3.rows.push({ player: p.name, id: p.player_id, from: [Math.round(p.last_x), Math.round(p.last_y)], to: to && to.map(Math.round), via: via || '자리 없음(멈춤)', why: why(i) });
    if (!to) stops.push({ rule: 'R3', what: `사람 ${p.name} — 캐논 세 자리가 다 없거나 막힘`, cls: STOP.CORNER });
    else chron.push({ vid: null, who: p.name, what: `피난 → ${via}`, why: why(i) });
  }
}
// R4 짐승
if (has(db, 'mobs')) for (const m of db.prepare('SELECT id, type, x, y FROM mobs').iterate()) { const i = cellPx(m.x, m.y); if (i >= 0 && BLOCK.has(i)) plan.R4.rows.push({ id: m.id, type: m.type, why: why(i) }); }
// R5 · R6 · R7 · R8 마을 셀
const TERR = new Set(['terr', 'nongzone']), BUILD6 = new Set(['house', 'phouse', 'housesite', 'farmland', 'dryfield', 'garden', 'yard', 'plaza', 'ditch']);
if (has(db, 'village_buildings')) for (const r of db.prepare('SELECT id, village_id, type, cx, cy FROM village_buildings').iterate()) {
  if (!vById.has(r.village_id) || r.cx < 0 || r.cy < 0 || r.cx >= W || r.cy >= H) continue;
  const i = r.cy * W + r.cx; if (!BLOCK.has(i)) continue;
  const row = { id: r.id, village: vName(r.village_id), type: r.type, cell: [r.cx, r.cy], why: why(i) };
  if (TERR.has(r.type)) plan.R5.rows.push(row);
  else if (BUILD6.has(r.type)) plan.R6.rows.push(row);
  else if (r.type === 'granary') { plan.R8.rows.push(row); stops.push({ rule: 'R8', what: `${row.village} 곳간 셀 (${r.cx},${r.cy})`, cls: STOP.DEBRIS }); }
  else { plan.R7.rows.push(row); stops.push({ rule: 'R7', what: `${row.village} ${r.type} 셀 (${r.cx},${r.cy})`, cls: STOP.CORNER }); }
}
for (const v of vById.values()) { const i = v.cy * W + v.cx; if (BLOCK.has(i)) { plan.R7.rows.push({ village: v.name, type: '마을 가운데', cell: [v.cx, v.cy], why: why(i) }); stops.push({ rule: 'R7', what: `${v.name} 마을 가운데`, cls: STOP.CORNER }); } }
for (const s of (DIFF.villageSites || [])) { const live = [...vById.values()].find((v) => v.name === s.name); if (live) { plan.R7.rows.push({ village: s.name, type: `마을 터 ${s.what}`, cell: s.to || s.from }); stops.push({ rule: 'R7', what: `${s.name} 마을 터 ${s.what}(정본)`, cls: STOP.CORNER }); } }
// R9 · R10 지은 것 · 상자
if (has(db, 'buildings')) for (const b of db.prepare('SELECT id, type, owner_id, owner_name, x, y FROM buildings').iterate()) {
  const i = cellPx(b.x, b.y); if (i < 0 || !BLOCK.has(i)) continue;
  const row = { id: b.id, type: b.type, owner: b.owner_name, why: why(i) };
  if (b.type === 'chest') { plan.R10.rows.push(row); stops.push({ rule: 'R10', what: `상자 #${b.id}(${b.owner_name})`, cls: STOP.CHEST }); }
  else { plan.R9.rows.push(row); stops.push({ rule: 'R9', what: `${b.type} #${b.id}(${b.owner_name})`, cls: STOP.DEBRIS }); }
}
// R11 땅 위 물건 — 존 DB 에 영속 표가 있으면(이름 후보) 센다 · 없으면 0(땅 위 물건은 비영속이면 점검 내림에서 이미 없다)
for (const t of ['ground_items', 'drops', 'dropped_items', 'items_ground']) if (has(db, t)) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  if (cols.includes('x') && cols.includes('y')) for (const g of db.prepare(`SELECT rowid AS id, x, y FROM ${t}`).iterate()) { const i = cellPx(g.x, g.y); if (i >= 0 && BLOCK.has(i)) { plan.R11.rows.push({ table: t, id: g.id }); stops.push({ rule: 'R11', what: `${t} #${g.id}`, cls: STOP.GROUND }); } }
}
// R12 길
if (has(db, 'roads')) for (const r of db.prepare('SELECT cell_key, v FROM roads WHERE zone = ?').iterate(ZONE)) if (BLOCK.has(r.cell_key)) plan.R12.rows.push({ key: r.cell_key, v: r.v });
// R13 캔 칸
if (has(db, 'mined_cells')) for (const r of db.prepare('SELECT cell_key FROM mined_cells').iterate()) { const [x, y] = String(r.cell_key).split('_').map(Number); if (!(x >= 0 && y >= 0 && x < W && y < H)) continue; const i = y * W + x; if (S['광맥 빠짐'].has(i) || S['광맥 바뀜'].has(i)) plan.R13.rows.push({ key: r.cell_key }); }
// R14 벤 나무(청크)
if (has(db, 'harvested_seeds')) {
  const CW = Math.ceil(W * SZ / CHUNK), ch = new Set();
  for (const k of ['통행→막힘', '숲 빠짐', '숲 생김', '광맥 빠짐', '광맥 바뀜', '광맥 생김']) for (const i of S[k]) ch.add(Math.floor(Math.floor(i / W) * SZ / CHUNK) * CW + Math.floor((i % W) * SZ / CHUNK));
  for (const r of db.prepare('SELECT seed_key FROM harvested_seeds').iterate()) { const [cx, cy] = String(r.seed_key).split('_').map(Number); if (ch.has(cy * CW + cx)) plan.R14.rows.push({ key: r.seed_key }); }
}
// R15 소굴
let banditData = null;
if (has(db, 'bandit_state')) { const r = db.prepare('SELECT data FROM bandit_state WHERE zone = ?').get(ZONE); if (r) { banditData = JSON.parse(r.data);
  for (const d of banditData.dens || []) { const i = d.cy * W + d.cx; if (BLOCK.has(i)) { plan.R15.rows.push({ den: d.id, cell: [d.cx, d.cy], why: why(i) }); chron.push({ vid: null, who: `도적 소굴#${d.id}`, what: '소굴 무너짐 — 다시 훑기', why: why(i) }); } } } }
// R16 교역로 — 서버 문
plan.R16.note = has(db, 'trade_routes') ? `지금 ${db.prepare('SELECT COUNT(*) c FROM trade_routes WHERE zone = ?').get(ZONE).c}행` : '표 없음';
// R17 econ 땅 값 — 마을 부존 스캔 반경(`LAND_SCAN_R` = server/villages.js 그 수 · 읽어 온다) 안에 바뀐 칸이 있는 마을
let LAND_R = null; try { const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8'); const m = /const LAND_SCAN_R = (\d+);/.exec(src); LAND_R = m ? +m[1] : null; } catch (e) {}
if (LAND_R) {
  const changed = []; for (const k of ['통행→막힘', '물→뭍', '숲 빠짐', '숲 생김', '광맥 빠짐', '광맥 생김', '광맥 바뀜']) for (const i of S[k]) changed.push(i);
  for (const v of vById.values()) { let n = 0; for (const i of changed) { const dx = (i % W) - v.cx, dy = Math.floor(i / W) - v.cy; if (dx * dx + dy * dy <= LAND_R * LAND_R) n++; } if (n) plan.R17.rows.push({ village: v.name, cells: n }); }
  plan.R17.note = `부존 스캔 반경 ${LAND_R}셀(villages.js LAND_SCAN_R) 안에 바뀐 칸이 있는 마을`;
}
// 연표(곁 파일) — 마을 셀 · 짐승은 마을별로 묶는다
const byV = {}; for (const r of [...plan.R5.rows, ...plan.R6.rows]) { const k = r.village; byV[k] = byV[k] || { n: 0, why: r.why }; byV[k].n++; }
for (const [vn, o] of Object.entries(byV)) chron.push({ vid: null, who: vn, what: `마을 셀 ${o.n} 잃음`, why: o.why });
if (plan.R4.rows.length) chron.push({ vid: null, who: '들짐승', what: `${plan.R4.rows.length}마리 휩쓸림`, why: plan.R4.rows[0].why });
plan.R18.rows = chron;
// ── 표 ──
const summary = RULES.map(([id, name, pick, act]) => ({ id, name, pick, act, rows: plan[id].rows.length, note: plan[id].note }));
console.log(`\n[t721 ${APPLY ? '적용(사본)' : '예행'}] 존 ${ZONE} · DB ${path.basename(DBP)}${CEN ? ` · central ${path.basename(CEN)}` : ' · central 없음(사람 몸 R3 은 못 잼)'} · 막힘 칸 ${BLOCK.size.toLocaleString()}`);
console.log('| 줄 | 실체 | 안 | 할 일 | 행 |\n|---|---|---|---|---:|');
for (const s of summary) console.log(`| ${s.id} | ${s.name} | ${s.pick} | ${s.act}${s.note ? ` — ${s.note}` : ''} | ${s.rows} |`);
const stopCls = {}; for (const s of stops) stopCls[s.cls] = (stopCls[s.cls] || 0) + 1;
const result = { diff: { zone: ZONE, old: DIFF.old, new: DIFF.new }, db: path.basename(DBP), central: CEN ? path.basename(CEN) : null, apply: APPLY, summary, stops, stopCls, plan };
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 1));
if (stops.length) {
  console.log(`\n⛔ 멈춤 — 정하지 않은 규칙에 걸린 행 ${stops.length}: ${Object.entries(stopCls).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  for (const s of stops.slice(0, 12)) console.log(`   ${s.rule} ${s.what} — ${s.cls}`);
  console.log('   아무것도 바꾸지 않았다(규칙이 서면 RULES 의 그 줄을 채운다).');
  process.exit(2);
}
if (!APPLY) { console.log('\n예행 — DB 무변. `--apply --out <새 파일>` 이면 사본에 쓴다.'); process.exit(0); }
// ── 적용(사본에만) ──
db.close();
fs.copyFileSync(DBP, OUT); if (fs.existsSync(DBP + '-wal')) fs.copyFileSync(DBP + '-wal', OUT + '-wal');
const w = new Database(OUT);
const tx = w.transaction(() => {
  const del = (t, col, ids) => { if (!ids.length) return 0; const st = w.prepare(`DELETE FROM ${t} WHERE ${col} = ?`); let n = 0; for (const id of ids) n += st.run(id).changes; return n; };
  const n = {};
  n.R1 = del('claims', 'id', plan.R1.rows.map((r) => r.id));
  n.R4 = del('mobs', 'id', plan.R4.rows.map((r) => r.id));
  n.R5 = del('village_buildings', 'id', plan.R5.rows.map((r) => r.id));
  n.R6 = del('village_buildings', 'id', plan.R6.rows.map((r) => r.id));
  n.R12 = plan.R12.rows.length ? (() => { const st = w.prepare('DELETE FROM roads WHERE zone = ? AND cell_key = ?'); let c = 0; for (const r of plan.R12.rows) c += st.run(ZONE, r.key).changes; return c; })() : 0;
  n.R13 = del('mined_cells', 'cell_key', plan.R13.rows.map((r) => r.key));
  n.R14 = del('harvested_seeds', 'seed_key', plan.R14.rows.map((r) => r.key));
  if (plan.R15.rows.length && banditData) { const gone = new Set(plan.R15.rows.map((r) => r.den)); banditData.dens = (banditData.dens || []).filter((d) => !gone.has(d.id)); w.prepare('UPDATE bandit_state SET data = ? WHERE zone = ?').run(JSON.stringify(banditData), ZONE); n.R15 = gone.size; }
  return n;
});
const done = tx(); w.close();
if (CEN && plan.R3.rows.length) {
  fs.copyFileSync(CEN, CEN_OUT); if (fs.existsSync(CEN + '-wal')) fs.copyFileSync(CEN + '-wal', CEN_OUT + '-wal');
  const c = new Database(CEN_OUT); const st = c.prepare('UPDATE players SET last_x = ?, last_y = ? WHERE player_id = ?');
  done.R3 = 0; c.transaction(() => { for (const r of plan.R3.rows) if (r.to) done.R3 += st.run(r.to[0], r.to[1], r.id).changes; })(); c.close();
}
fs.writeFileSync(OUT + '.chronicle.json', JSON.stringify(chron, null, 1));
console.log(`\n적용(사본 ${path.basename(OUT)}${CEN_OUT && done.R3 != null ? ` · ${path.basename(CEN_OUT)}` : ''}): ${Object.entries(done).map(([k, v]) => `${k} ${v}`).join(' · ')} · 연표 ${chron.length}줄 → ${path.basename(OUT)}.chronicle.json`);
