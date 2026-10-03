#!/usr/bin/env node
// (@regress 없음 — `reset-world.sh` 의 손발 · 러너 밖 · T587)
// =============================================================================
// scripts/reset-world.js — 초기화 스크립트(`reset-world.sh`)가 **이미지 안의 node** 로 부르는 세 일.
//   호스트에는 node 가 없다(서울·도쿄 = 도커만) ⇒ 셸이 `docker run --rm <그 컨테이너의 이미지> node … /rw.js …` 로 부른다.
//
//   db <파일>             DB 한 판의 수(읽기만). 존 DB 면 마을 행 · 세계 날(→ 달력) · 영토 셀 · **두 마을 이상이 가진 영토 셀**
//                         (T569 자 — `zone-local-db.getTerrContestOwners` 와 같은 술어 · 서울 사본 38,032) ·
//                         central DB 면 사람(계정·손님) · 길드 · 전쟁 · 벗 · 초대.
//   live <호스트:포트>    존에 **관측자**(`?observer=1` — 로그인 0 · 몸 0 · `PLAYER_CAP` 에 안 걸린다)로 붙어 welcome 한 통을 읽는다:
//                         달력(`calendarNow()` — 존이 화면에 내는 그 값) · 시딩된 마을 수 / 후보 수 · 사람 사는 마을 + `/health`.
//   tree <루트>           <루트>/server · <루트>/sim 의 파일 바이트 지문(경로+sha256 · `.dockerignore` 가 빼는 꼴은 뺀다) — 레포와 이미지(/app)를 같은 자로 잰다
//   canon <루트>          굽힌 정본의 수 — `server/hanbando-terrain.json` 의 존마다 마을·광맥·군락 · server/ 의 JS 아닌 데이터 파일(굽기 산물)
//   keep-accounts <파일>  central DB 에서 **계정만 남긴다**(재민 칸 ⓐ-B): players 의 신원 칸(아래 KEEP)만 두고
//                         나머지 칸은 **스키마 기본값**으로(= 가입 직후의 몸 · 새 수 0) · tribes · wars · tribe_invites 비움 · friends 남김.
//
//   ⚠비밀: 이 파일은 env 를 읽지 않는다 · DB 의 `password_hash`·`guest_token` 값은 **세기만** 하고 찍지 않는다.
//   --json 을 붙이면 사람 줄 대신 JSON 한 줄(리허설이 읽는다).
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const pos = args.filter((a) => a !== '--json');
const [cmd, target] = pos;
const out = (human, obj) => console.log(JSON_OUT ? JSON.stringify(obj) : human);
const die = (m) => { console.error('  ✗ ' + m); process.exit(1); };
const fmt = (n) => (n == null ? '?' : Number(n).toLocaleString('en-US'));

// 달력 — 존이 쓰는 정본(`server/events.calendarOf`)에게 묻는다(사본 0). 레포 안이면 레포 것, 이미지 안이면 /app 것.
function calendarLabel(day) {
  for (const p of [path.join(__dirname, '..', 'server', 'events.js'), '/app/server/events.js']) {
    if (!fs.existsSync(p)) continue;
    const log = console.log; console.log = () => {};   // events 가 끌고 오는 경제 모듈의 기동 한 줄을 삼킨다(이 줄의 말이 아니다)
    try { const c = require(p).calendarOf(day | 0); if (c && c.label) return c.label; } catch (e) { /* 다음 후보 */ } finally { console.log = log; }
  }
  return null;
}

// 시딩 후보 — 정본 문 하나(`terrain.siteCandidates` · T343: 찍은 칸이 있으면 그것, 없으면 절차) — welcome 의 레거시 목록은 후보가 아니다
function candidatesOf(zone) {
  for (const root of [path.join(__dirname, '..'), '/app']) {
    const t = path.join(root, 'server', 'terrain.js'), zc = path.join(root, 'server', 'zone-config.js');
    if (!fs.existsSync(t)) continue;
    const log = console.log; console.log = () => {};
    try { const T = require(t); const { ZONES } = require(zc); if (T.setZonesMeta) T.setZonesMeta(ZONES); const c = T.siteCandidates(zone); if (Array.isArray(c)) return c.length; }
    catch (e) { /* 다음 후보 */ } finally { console.log = log; }
  }
  return null;
}

function openDb(file, readOnly) {
  if (!file || !fs.existsSync(file)) die(`DB 파일이 없다: ${file}`);
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(file, readOnly ? { readOnly: true } : {});
  d.exec('PRAGMA busy_timeout = 5000');
  return d;
}
const tablesOf = (d) => new Set(d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
const count = (d, sql) => { try { const r = d.prepare(sql).get(); return r ? Number(Object.values(r)[0]) : 0; } catch (e) { return null; } };

function cmdDb(file) {
  const d = openDb(file, true);
  const T = tablesOf(d);
  if (T.has('villages')) {
    const villages = count(d, 'SELECT COUNT(*) FROM villages');
    const maxDay = villages ? count(d, 'SELECT MAX(day) FROM villages') : null;
    const terr = T.has('village_buildings') ? count(d, "SELECT COUNT(*) FROM village_buildings WHERE type = 'terr'") : null;
    const contested = T.has('village_buildings')
      ? count(d, "SELECT COUNT(*) FROM (SELECT cx, cy FROM village_buildings WHERE type = 'terr' GROUP BY cx, cy HAVING COUNT(DISTINCT village_id) > 1)")
      : null;
    const rows = {};
    for (const t of ['buildings', 'claims', 'roads', 'trade_routes', 'village_chronicle', 'village_events', 'onboarding']) if (T.has(t)) rows[t] = count(d, `SELECT COUNT(*) FROM ${t}`);
    d.close();
    const cal = maxDay == null ? null : calendarLabel(maxDay);
    out(`  DB ${path.basename(file)} · 마을 행 ${fmt(villages)} · 세계 날 ${maxDay == null ? '-' : fmt(maxDay)}${cal ? ` (${cal})` : ''} · 영토 셀 ${fmt(terr)} · 두 마을이 가진 영토 셀 ${fmt(contested)}(T569 자) · 길 ${fmt(rows.roads)} · 교역로 ${fmt(rows.trade_routes)} · 연표 ${fmt(rows.village_chronicle)}`,
      { kind: 'zone', file: path.basename(file), villages, maxDay, calendar: cal, terr, contested, rows });
    return;
  }
  if (T.has('players')) {
    const players = count(d, 'SELECT COUNT(*) FROM players');
    const accounts = count(d, 'SELECT COUNT(*) FROM players WHERE password_hash IS NOT NULL');
    const placed = count(d, 'SELECT COUNT(*) FROM players WHERE last_zone IS NOT NULL OR home_zone IS NOT NULL');
    const carrying = count(d, "SELECT COUNT(*) FROM players WHERE COALESCE(inventory_json, '{}') NOT IN ('{}', '') OR wood > 0 OR stone > 0");
    const tribes = T.has('tribes') ? count(d, 'SELECT COUNT(*) FROM tribes') : null;
    const npcTribes = T.has('tribes') ? count(d, 'SELECT COUNT(*) FROM tribes WHERE is_npc = 1') : null;
    const members = count(d, 'SELECT COUNT(*) FROM players WHERE tribe_id IS NOT NULL');
    const wars = T.has('wars') ? count(d, 'SELECT COUNT(*) FROM wars') : null;
    const friends = T.has('friends') ? count(d, 'SELECT COUNT(*) FROM friends') : null;
    const invites = T.has('tribe_invites') ? count(d, 'SELECT COUNT(*) FROM tribe_invites') : null;
    d.close();
    out(`  DB ${path.basename(file)} · 사람 ${fmt(players)}(계정 ${fmt(accounts)} · 손님 ${fmt(players - accounts)}) · 자리 있는 몸 ${fmt(placed)} · 짐 있는 몸 ${fmt(carrying)} · 길드 ${fmt(tribes)}(NPC ${fmt(npcTribes)} · 길드원 ${fmt(members)}) · 전쟁 ${fmt(wars)} · 벗 ${fmt(friends)} · 초대 ${fmt(invites)}`,
      { kind: 'central', file: path.basename(file), players, accounts, guests: players - accounts, placed, carrying, tribes, npcTribes, members, wars, friends, invites });
    return;
  }
  d.close();
  die(`모르는 DB(마을 표도 사람 표도 없다): ${file}`);
}

// ⓐ-B 계정만 남김 — 신원 칸만 둔다. 나머지 칸은 **스키마가 정한 기본값**(PRAGMA dflt_value · 없으면 NULL) = 가입 직후의 몸.
//   표를 손으로 적지 않는다: 몸에 칸이 늘면(central.js 마이그레이션) 그 칸도 저절로 "몸"으로 비워진다.
const KEEP = ['player_id', 'name', 'color', 'password_hash', 'password_salt', 'guest_token', 'created_at', 'last_seen'];
function cmdKeepAccounts(file) {
  const d = openDb(file, false);
  const T = tablesOf(d);
  if (!T.has('players')) die('central DB 가 아니다(players 표 없음)');
  const cols = d.prepare('PRAGMA table_info(players)').all();
  const reset = cols.filter((c) => !KEEP.includes(c.name));
  const sets = reset.map((c) => `"${c.name}" = ${c.dflt_value == null ? 'NULL' : c.dflt_value}`);
  const before = { players: count(d, 'SELECT COUNT(*) FROM players'), tribes: T.has('tribes') ? count(d, 'SELECT COUNT(*) FROM tribes') : 0,
    wars: T.has('wars') ? count(d, 'SELECT COUNT(*) FROM wars') : 0, invites: T.has('tribe_invites') ? count(d, 'SELECT COUNT(*) FROM tribe_invites') : 0,
    friends: T.has('friends') ? count(d, 'SELECT COUNT(*) FROM friends') : 0 };
  d.exec('BEGIN IMMEDIATE');
  try {
    if (sets.length) d.exec(`UPDATE players SET ${sets.join(', ')}`);
    for (const t of ['tribes', 'wars', 'tribe_invites']) if (T.has(t)) d.exec(`DELETE FROM ${t}`);
    d.exec('COMMIT');
  } catch (e) { try { d.exec('ROLLBACK'); } catch (e2) {} d.close(); die(`계정만 남기기 실패(되돌렸다 — DB 그대로): ${e.message}`); }
  const after = { players: count(d, 'SELECT COUNT(*) FROM players'), placed: count(d, 'SELECT COUNT(*) FROM players WHERE last_zone IS NOT NULL OR home_zone IS NOT NULL'),
    tribes: T.has('tribes') ? count(d, 'SELECT COUNT(*) FROM tribes') : 0, friends: T.has('friends') ? count(d, 'SELECT COUNT(*) FROM friends') : 0 };
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  d.close();
  out(`  계정만 남김 — 사람 ${fmt(before.players)} → ${fmt(after.players)}(신원 칸 ${KEEP.filter((k) => cols.some((c) => c.name === k)).length} 남김 · 몸 칸 ${reset.length} 기본값) · 자리 있는 몸 ${fmt(after.placed)} · 길드 ${fmt(before.tribes)} → ${fmt(after.tribes)} · 전쟁 ${fmt(before.wars)} → 0 · 초대 ${fmt(before.invites)} → 0 · 벗 ${fmt(before.friends)} → ${fmt(after.friends)}`,
    { kind: 'keep-accounts', before, after, keptCols: KEEP.filter((k) => cols.some((c) => c.name === k)), resetCols: reset.map((c) => c.name) });
}

// .dockerignore 가 이미지에서 빼는 꼴(server·sim 에 닿는 것만) — 레포 쪽도 같이 빼야 같은 자다
const SKIP = (rel) => /(^|\/)(node_modules|\.git|samples)(\/|$)/.test(rel) || /^sim\/out(\/|$)/.test(rel)
  || /(^|\/)\.DS_Store$/.test(rel) || /\.(db|db-shm|db-wal|db\.legacy|log|bak|zip)$/.test(rel);
function cmdTree(root) {
  const crypto = require('crypto');
  const files = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    let ents = []; try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (SKIP(r)) continue;
      if (e.isDirectory()) walk(r); else if (e.isFile()) files.push(r);
    }
  };
  for (const top of ['server', 'sim']) if (fs.existsSync(path.join(root, top))) walk(top);
  files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(f + '\0' + crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex') + '\n');
  const sha = h.digest('hex').slice(0, 12);
  out(`  ${root} · server+sim 파일 ${fmt(files.length)} · 지문 ${sha}`, { kind: 'tree', root, files: files.length, sha });
}
function cmdCanon(root) {
  const f = path.join(root, 'server', 'hanbando-terrain.json');
  if (!fs.existsSync(f)) die(`정본이 없다: ${f}`);
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const zones = {};
  for (const [z, v] of Object.entries(d)) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.villages)) continue;
    zones[z] = { villages: v.villages.length, ores: Array.isArray(v.ores) ? v.ores.length : 0, groves: Array.isArray(v.groves) ? v.groves.length : 0 };
  }
  const data = fs.readdirSync(path.join(root, 'server')).filter((n) => !/\.js$/.test(n) && fs.statSync(path.join(root, 'server', n)).isFile())
    .map((n) => ({ n, b: fs.statSync(path.join(root, 'server', n)).size }));
  out(`  정본 ${Object.entries(zones).map(([z, c]) => `${z} 마을 ${c.villages} · 광맥 ${fmt(c.ores)}${c.groves ? ` · 군락 ${c.groves}` : ''}`).join(' / ')} · server 데이터 ${data.map((x) => `${x.n}(${(x.b / 1048576).toFixed(1)}MB)`).join(' ')}`,
    { kind: 'canon', zones, data });
}

async function cmdLive(hp) {
  if (!hp || !/^[\w.\-\[\]:]+:\d+$/.test(hp)) die(`호스트:포트 를 달라(예 127.0.0.1:3020): ${hp}`);
  let health = null;
  try { const r = await fetch(`http://${hp}/health`, { signal: AbortSignal.timeout(5000) }); health = await r.json(); } catch (e) { health = null; }
  const welcome = await new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch (e) {} resolve(v); };
    const t = setTimeout(() => fin(null), 90000);
    const ws = new WebSocket(`ws://${hp}/?observer=1`);
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let m = null; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m && m.type === 'welcome') fin(m);
    };
    ws.onerror = () => fin(null);
    ws.onclose = () => fin(null);
  });
  if (!welcome) die(`관측자 welcome 을 못 받았다(${hp}) · /health ${health ? 'ok' : '응답 없음'}`);
  const z = welcome.zone || {};
  const sim = Array.isArray(welcome.simVillages) ? welcome.simVillages : null;
  const cand = z.id ? candidatesOf(z.id) : null;
  const cal = welcome.calendar || null;
  const o = { kind: 'live', zone: z.id || null, calendar: cal ? cal.label : null, day: cal ? cal.day : null,
    villages: sim ? sim.length : null, populated: sim ? sim.filter((v) => (v.pop | 0) > 0).length : null, candidates: cand,
    humans: health ? health.humans : null, cap: health ? health.cap : null, healthVillages: health ? health.villages : null };
  out(`  ${o.zone} · 달력 ${o.calendar || '?'} · 마을 ${fmt(o.villages)}/${fmt(o.candidates)}(사람 사는 ${fmt(o.populated)}) · 사람 ${fmt(o.humans)} · 정원 ${o.cap == null ? '?' : o.cap}${o.cap === 0 ? '(닫힘)' : ''}`, o);
}

(async () => {
  if (cmd === 'db') return cmdDb(target);
  if (cmd === 'keep-accounts') return cmdKeepAccounts(target);
  if (cmd === 'tree') return cmdTree(target);
  if (cmd === 'canon') return cmdCanon(target);
  if (cmd === 'live') return cmdLive(target);
  console.error('쓰는 법: node scripts/reset-world.js db <파일> | live <호스트:포트> | tree <루트> | canon <루트> | keep-accounts <파일>  [--json]');
  process.exit(2);
})().catch((e) => die(e && e.message || String(e)));
