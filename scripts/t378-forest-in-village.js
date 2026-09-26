#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기)
// =============================================================================
// T378 자 — **마을 영토 셀 안에 나무가 몇 그루나 서 있나** (2026-09-23)
//
// 재민 실기 09-23: *"마을에 스폰되자마자 숲이 너무 많고, 애초에 마을 안에 숲이 들어와 있으면 안 되지."*
// 캐논은 이미 있다 — `villages.js:2680` "★[11차 재민 확정] 마을 안엔 숲이 없다 — 영토 셀의 나무를 벤다(개간)".
//
// ★이 자가 하는 일은 하나다: **관측자 없이** 센다.
//   `zone.js` 의 개간(`clearTreesInCells`)은 `qtResources.queryCircle` 로 **지금 서 있는 개체**만 찾는데,
//   개체는 **활성 청크**(관측자 1,200px 안)에만 있다. 그래서 "몇 그루 벴나"를 개간 쪽에 물으면
//   답이 관측자에 따라 달라진다. ⇒ 여기서는 **색인**(`chunk.resourcesAtCell` · T301)으로 묻는다.
//   색인은 청크를 켜지 않고도 청크와 **같은 답**을 낸다(수확 장부와 게임일을 넘기면).
//
// ★게이트 판(`T378_GATE=1` · 카드 ③ "test-terr-persist 문법") — 색인만으로는 **플레이어가 보는 것**을
//   증언하지 못한다. 그래서 같은 세계를 두 번 띄운다:
//     1차 — 새 DB · 게임일을 당겨(`VILLAGE_DAY_MS`) **D일** 돌린다(영토가 자라고 개간이 매일 돈다)
//     2차 — 같은 DB 를 다시 열고 **관측자를 마을 셋에 차례로** 세워 청크를 켠다 → 서버가 **방송한**
//           나무(`welcome`·`resources_spawn`)를 받아 영토 셀 안/밖으로 센다(= 클라가 그리는 그것)
//   그리고 1차 끝 DB 사본을 떠 두어, 남은 나무가 있으면 **어느 판에 어떻게 남았는지** 장부로 가른다.
//
// 쓰는 법
//   node scripts/t378-forest-in-village.js              # 존을 띄워 51마을을 시딩하고 잰다(부팅 순간)
//   T378_GATE=1 node scripts/t378-forest-in-village.js  # 게이트 판(D일 · 관측자 셋)
//       T378_DAYS=40 · T378_DAY_MS=2500 · T378_GATE_VILS=어촌2,임업6,임업1
//   T378_PLANT=1 node scripts/t378-forest-in-village.js # + DB 나무 판(영토 안 둘 · 밖 하나를 심고 2차 부팅이 안의 둘만 지우나)
//   T378_DB=/path/world.db node scripts/t378-forest-in-village.js    # 이미 있는 DB 를 잰다(띄우지 않는다)
//   T378_JSON=/tmp/x.json ...                            # 표를 JSON 으로도 남긴다(전/후 대조용)
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349·T355 기동 기다리기 정본(사본 0)
const ROOT = path.join(__dirname, '..');
const CPORT = +(process.env.T378_CPORT || 3610), ZPORT = +(process.env.T378_ZPORT || 3620);
const ZID = 'hanbando';
const GATE = process.env.T378_GATE === '1';
const DAYS = +(process.env.T378_DAYS || 40);
const DAY_MS = +(process.env.T378_DAY_MS || 2500);
const STOPS = String(process.env.T378_GATE_VILS || '어촌2,임업6,임업1').split(',').map((s) => s.trim()).filter(Boolean);
const PLANT = process.env.T378_PLANT === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)],
    { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', killAll);
async function jget(u) {
  try { return await (await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(30000) })).json(); }
  catch (e) { return null; }
}
// ⚠게임일을 당기는 것은 **1차만**이다. 2차는 제품 하루 길이로 연다 — 관측하는 동안 영토가 자라면
//   "스냅샷 때의 영토"와 "끝난 뒤 DB 의 영토"가 달라진다(첫 게이트 판이 그걸로 122·68 을 잘못 셌다 · 보고 §2).
const zoneEnv = (DB, fast) => Object.assign({
  PORT: String(ZPORT), ZONE_ID: ZID, DB_PATH: DB, CENTRAL_URL: `http://localhost:${CPORT}`,
  ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
}, (GATE && fast) ? { VILLAGE_DAY_MS: String(DAY_MS) } : {});

// 한 판 — central + zone 을 띄우고 `body` 를 돌린 뒤 내린다. 존의 입(stdout·stderr)을 통째로 받는다.
async function onePass(label, DB, cdb, body, fast) {
  let log = '';
  const _c = boot('central.js', { PORT: String(CPORT), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  const _cp = FB.waitUp(_c, /central server up on/, { name: 'central' });   // ★듣기는 띄운 그 틱에(T349 ⑧)
  const up = await _cp;
  if (!up.ok) { console.log(up.why); process.exit(1); }
  const _z = boot('zone.js', zoneEnv(DB, fast));
  _z.stdout.on('data', (b) => { log += String(b); });
  _z.stderr.on('data', (b) => { log += String(b); });
  const _zp = FB.waitUp(_z, /zone server up on/, { name: 'zone', capMs: 300000 });
  const zup = await _zp;
  if (!zup.ok) { console.log(zup.why); process.exit(1); }
  console.log(`[자] ${label} 존 기동 ${zup.ms}ms`);
  const out = await body();
  killAll(); procs.length = 0;
  await sleep(2500);
  return { log, out };
}

// 게이트 판 ① — 게임일이 D 에 닿을 때까지(`/perf econTick.days` · test-terr-persist 문법)
async function runDays() {
  let days = 0;
  for (let i = 0; i < 2000; i++) {
    await sleep(3000);
    const p = await jget(`http://localhost:${ZPORT}/perf`);
    days = ((p && p.econTick && p.econTick.days) | 0);
    if (days >= DAYS) break;
  }
  await sleep(5000);   // 저장 큐가 비게
  return { days };
}

// 게이트 판 ② — 관측자 하나를 마을 셋에 차례로 세운다. 서버가 **방송한** 개체만 센다.
async function observeStops(stops) {
  const WebSocket = require('ws');
  const live = new Map();
  let lastMsg = Date.now(), cal = null;
  const s0 = stops[0];
  const ws = new WebSocket(`ws://localhost:${ZPORT}/?observer=1&vx=${s0.px}&vy=${s0.py}`);
  ws.on('message', (b) => {
    let m; try { m = JSON.parse(String(b)); } catch (e) { return; }
    if (m.type === 'welcome') { cal = m.calendar || null; for (const r of (m.resources || [])) live.set(r.id, r); lastMsg = Date.now(); }
    else if (m.type === 'resources_spawn') { for (const r of (m.resources || [])) live.set(r.id, r); lastMsg = Date.now(); }
    else if (m.type === 'resource_removed') { live.delete(m.id); }
    else if (m.type === 'resources_removed') { for (const id of (m.ids || [])) live.delete(id); }
  });
  await new Promise((r) => { ws.on('open', r); ws.on('error', r); setTimeout(r, 10000); });
  const send = (o) => { try { ws.send(JSON.stringify(o)); } catch (e) {} };
  const shots = [];
  for (const s of stops) {
    const t0 = Date.now(); lastMsg = t0;
    // 관측자는 30초 조용하면 끊긴다 — 초마다 시선을 다시 알린다(같은 자리 · 멱등)
    for (;;) {
      send({ type: 'viewport_update', x: s.px, y: s.py, w: 1400, h: 900 });
      await sleep(1000);
      const quiet = Date.now() - lastMsg;
      if (Date.now() - t0 > 10000 && quiet > 5000) break;   // 방송이 멎었다 = 켤 청크를 다 켰다
      if (Date.now() - t0 > 90000) { console.log(`[자] ★${s.name} — 90초 안에 방송이 안 멎었다(표에만 적는다)`); break; }
    }
    const cs = s.cs, pcx = Math.floor(s.px / cs), pcy = Math.floor(s.py / cs), R = s.r;
    const bx0 = (pcx - R) * cs, bx1 = (pcx + R + 1) * cs, by0 = (pcy - R) * cs, by1 = (pcy + R + 1) * cs;
    const inBlk = (r) => r.x >= bx0 && r.x < bx1 && r.y >= by0 && r.y < by1;
    //   ⚠좌표를 **반올림하지 않는다** — 셀 경계(32px)에서 반올림이 셀을 바꾼다(첫 판이 y 11,295.88 → 11,296 으로
    //     영토 밖 나무 하나를 "영토 안"으로 셌다 · 보고 §2).
    const pick = (t) => [...live.values()].filter((r) => r.type === t && inBlk(r)).map((r) => [r.x, r.y, r.seedKey || r.id]);
    //   ★영토는 **스냅샷 그 순간의 DB** 에서 읽는다(`_terrGrow` 는 늘린 셀을 그 자리에서 적는다 · T278).
    //     끝난 뒤의 영토로 세면 그 사이 자라 편입·개간된 셀의 나무가 "영토 안"으로 잘못 잡힌다.
    const terrNow = new Set(readDb(s.db).terrRows.map((r) => r.cx + ',' + r.cy));
    shots.push({ name: s.name, px: s.px, py: s.py, block: [bx0, by0, bx1, by1], ms: Date.now() - t0,
      tree: pick('tree'), stump: pick('stump'), sapling: pick('sapling'), liveAll: live.size, terr: terrNow });
    console.log(`[자] 관측자 @${s.name} — ${((Date.now() - t0) / 1000).toFixed(1)}s · 블록 안 나무 ${shots[shots.length - 1].tree.length} · 그루터기 ${shots[shots.length - 1].stump.length}`);
  }
  try { ws.close(); } catch (e) {}
  return { shots, cal };
}

function readDb(DB) {
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const db = new Database(DB, { readonly: true });
  const vils = db.prepare('SELECT id, name, cx, cy FROM villages').all();
  const terrRows = db.prepare("SELECT village_id, cx, cy FROM village_buildings WHERE type = 'terr'").all();
  let harv = [];
  try { harv = db.prepare('SELECT seed_key, harvested_day FROM harvested_seeds').all(); } catch (e) {}
  db.close();
  return { vils, terrRows, harvestedSet: new Map(harv.map((r) => [r.seed_key, r.harvested_day])) };
}
// 1차 끝 사본 — 서버가 내려간 뒤라 WAL 을 같이 떠야 같은 상태다(열 때 WAL 을 되감는다)
function snapDb(DB, SNAP) {
  for (const sfx of ['', '-wal', '-shm']) { try { fs.unlinkSync(SNAP + sfx); } catch (e) {} try { fs.copyFileSync(DB + sfx, SNAP + sfx); } catch (e) {} }
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const db = new Database(SNAP); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();
}

// DB 나무 판 — 카드 ② "DB 나무(`r.dbId`)도 같은 길". DB 나무(`resources` 표 · 심은 나무 등)는 청크와 무관하게
//   부팅 최상위에서 올라온다. 그런데 부팅 개간 시점엔 `qtResources` 가 아직 없다(틱이 처음 만든다).
//   ⇒ 1차가 끝난 DB 에 영토 셀 둘 · 영토 밖 셀 하나로 DB 나무를 심고, 2차 부팅 뒤 **행이 남았나**를 본다.
//   hp 는 정본 `RESOURCE_HP_TABLE.tree` 를 읽는다(수를 안 적는다).
function plantDbTrees(DB) {
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const { RESOURCE_HP_TABLE } = require(path.join(ROOT, 'server', 'chunk'));
  const hp = RESOURCE_HP_TABLE.tree;
  const db = new Database(DB);
  const vils = db.prepare('SELECT id, name, cx, cy FROM villages ORDER BY id').all();
  const terr = new Set(db.prepare("SELECT cx, cy FROM village_buildings WHERE type = 'terr'").all().map((r) => r.cx + ',' + r.cy));
  const ins = db.prepare('INSERT INTO resources (type, x, y, hp, max_hp, created_at, planted_day, species) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const put = (c, where, vil) => ({ id: Number(ins.run('tree', c[0] * 32 + 16, c[1] * 32 + 16, hp, hp, Date.now(), -1, '').lastInsertRowid), where, vil, cell: c.join(',') });
  const out = [];
  for (const v of vils.slice(0, 2)) {   // 영토 안 — 중심에서 동쪽으로 첫 영토 셀
    let c = null;
    for (let d = 0; d < 64 && !c; d++) if (terr.has((v.cx + d) + ',' + v.cy)) c = [v.cx + d, v.cy];
    if (c) out.push(put(c, 'in', v.name));
  }
  const v0 = vils[0];                    // 영토 밖 — 첫 마을 중심에서 동쪽으로 영토를 벗어나고 세 칸 더
  let d = 0; while (d < 4096 && terr.has((v0.cx + d) + ',' + v0.cy)) d++;
  const oc = [v0.cx + d + 3, v0.cy];
  if (!terr.has(oc.join(','))) out.push(put(oc, 'out', v0.name));
  db.close();
  return out;
}

(async () => {
  let DB = process.env.T378_DB || '';
  let bootLog = '', log1 = '', gate = null, SNAP = '', planted = null;
  if (!DB) {
    DB = `/tmp/t378-world-${process.pid}.db`;
    for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    console.log(`[자] 존을 띄워 51마을을 시딩한다 — ${DB}${GATE ? ` · 게이트 판(게임일 ${DAY_MS}ms × ${DAYS}일 · 관측자 ${STOPS.join('·')})` : ''}`);
    // ── 1차 ─────────────────────────────────────────────────────────────
    const p1 = await onePass('1차', DB, `/tmp/t378-c-${process.pid}.db`, async () => {
      if (GATE) return runDays();
      await sleep(20000);          // 시딩이 DB 에 앉는 시간(영토 행이 써진다)
      return null;
    }, true);
    log1 = p1.log;
    if (GATE) {
      console.log(`[자] 1차 게임일 ${p1.out.days}일`);
      SNAP = DB + '.pass1';
      snapDb(DB, SNAP);
    }
    if (PLANT) { planted = plantDbTrees(DB); console.log(`[자] DB 나무 ${planted.length}그루 심음 — ${planted.map((p) => `${p.where}:${p.vil}(${p.cell})#${p.id}`).join(' · ')}`); }
    // ── 2차 — 같은 DB 를 다시 연다. **부팅 개간 로그는 이 판에서 읽는다**(`villages.js` 부팅 복원의 "영토 개간" 줄).
    //   첫 판은 마을을 만드는 판이라 `clearTreesInCells` 를 다른 자리에서 부른다.
    const p2 = await onePass('2차', DB, `/tmp/t378-c2-${process.pid}.db`, async () => {
      if (!GATE) { await sleep(8000); return null; }
      const { vils } = readDb(DB);
      const { CHUNK_SIZE } = require(path.join(ROOT, 'server', 'chunk'));
      //   켤 청크 블록의 반경 — `zone.js` 의 `CHUNK_ACTIVE_RADIUS` 를 **글자로 읽는다**(여기 수를 안 적는다 · 표에만 쓴다)
      const _car = /const CHUNK_ACTIVE_RADIUS = (\d+)/.exec(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
      if (!_car) { console.log('★zone.js 에서 CHUNK_ACTIVE_RADIUS 를 못 읽었다 — 블록 표를 믿지 마라'); }
      const R = Math.ceil((_car ? +_car[1] : CHUNK_SIZE) / CHUNK_SIZE);
      const stops = STOPS.map((n) => vils.find((v) => v.name === n)).filter(Boolean)
        .map((v) => ({ name: v.name, px: v.cx * 32 + 16, py: v.cy * 32 + 16, cs: CHUNK_SIZE, r: R, db: DB }));
      if (stops.length !== STOPS.length) console.log(`[자] ★관측할 마을 이름 중 DB 에 없는 것이 있다 — ${STOPS.join(',')} 중 ${stops.length}곳`);
      const o = await observeStops(stops);
      await sleep(3000);
      return o;
    }, false);
    bootLog = p2.log; gate = p2.out;
  }

  // ── DB 를 직접 읽는다(관측자 0 · 서버 0) ──────────────────────────────────
  const { vils, terrRows, harvestedSet } = readDb(DB);
  if (planted) {
    const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
    const db = new Database(DB, { readonly: true });
    const has = db.prepare('SELECT id FROM resources WHERE id = ?');
    for (const p of planted) p.left = !!has.get(p.id);
    db.close();
    console.log(`\n=== DB 나무 판 — 2차 부팅 뒤 행이 남았나 ===`);
    for (const p of planted) console.log(`  ${p.where === 'in' ? '영토 안' : '영토 밖'} ${p.vil} (${p.cell}) #${p.id} → ${p.left ? '남음' : '지움'}`);
  }

  // ⚠★[자 수리 2026-09-23] **여기에 수를 적으면 안 된다.** 첫 판이 `chunkSize = 512` 를 손으로 적었는데
  //   정본은 `chunk.CHUNK_SIZE = 1024` 다 — 청크 크기가 다르면 **씨앗이 달라 세계가 통째로 다르다**.
  //   그 판의 수(8,843그루)는 **있지도 않은 세계**의 수였다. 값은 전부 정본에서 받는다(새 수 0).
  const { resourcesAtCell, CHUNK_SIZE } = require(path.join(ROOT, 'server', 'chunk'));
  const ZoneCfg = require(path.join(ROOT, 'server', 'zone-config'));
  const Z = (ZoneCfg.ZONES || ZoneCfg.zones || {})[ZID] || {};
  const biome = Z.biome;
  const chunkSize = CHUNK_SIZE;
  if (!biome) { console.log('★존 설정에서 biome 을 못 읽었다 — 아래 수를 믿지 마라'); }
  console.log(`[자] 정본에서 받은 값 — biome=${biome} chunkSize=${chunkSize}`);
  // 게임일 — 그루터기·묘목 단계를 가를 때만 쓴다(나무 수에는 안 든다: 벤 자리는 52 게임년 전엔 '나무'로 안 난다).
  //   게이트 판은 관측자가 받은 달력(`welcome.calendar.day` = 서버 `gameDayNow()`)을 쓴다.
  const GAMEDAY = +(process.env.T378_DAY || (gate && gate.cal && gate.cal.day) || 0);

  const byVil = new Map();
  const terrAll = new Set();
  for (const r of terrRows) {
    if (!byVil.has(r.village_id)) byVil.set(r.village_id, []);
    byVil.get(r.village_id).push([r.cx, r.cy]);
    terrAll.add(r.cx + ',' + r.cy);
  }
  const rows = [];
  const residual = [];
  let totCells = 0, totTrees = 0, totStump = 0, totSap = 0;
  for (const v of vils) {
    const cells = byVil.get(v.id) || [];
    let trees = 0, stump = 0, sap = 0;
    for (const [cx, cy] of cells) {
      let a = [];
      try { a = resourcesAtCell(ZID, cx, cy, { biome, chunkSize, harvestedSet, gameDay: GAMEDAY }); } catch (e) {}
      for (const e of a) {
        if (e.type === 'tree') { trees++; residual.push({ vil: v.name, cx, cy, seedKey: e.seedKey || e.id }); }
        else if (e.type === 'stump') stump++;
        else if (e.type === 'sapling') sap++;
      }
    }
    rows.push({ id: v.id, name: v.name, cells: cells.length, trees, stump, sap });
    totCells += cells.length; totTrees += trees; totStump += stump; totSap += sap;
  }
  rows.sort((a, b) => b.trees - a.trees);

  // ── 부팅 로그의 "영토 개간 — 나무 n그루" ──────────────────────────────────
  const logged = new Map();
  for (const m of bootLog.matchAll(/🏘️ (.+?) 영토 개간 — 나무 (\d+)그루/g)) logged.set(m[1], +m[2]);

  console.log(`\n=== T378 자 — 영토 셀 안 나무(색인 · 관측자 0) ===`);
  console.log(`마을 ${rows.length}곳 · 영토 셀 합 ${totCells} · **영토 안 나무 합 ${totTrees}그루** · 그루터기 ${totStump} · 묘목 ${totSap} · 벤 장부 ${harvestedSet.size}개 (게임일 ${GAMEDAY})`);
  console.log(`\n${'마을'.padEnd(16)}${'영토셀'.padStart(7)}${'나무'.padStart(7)}${'셀당'.padStart(8)}${'그루터기'.padStart(8)}   부팅 개간 로그`);
  for (const r of rows.slice(0, 20)) {
    const lg = logged.has(r.name) ? `${logged.get(r.name)}그루` : (bootLog ? '(줄 없음 = 0그루)' : '—');
    console.log(`${String(r.name).padEnd(16)}${String(r.cells).padStart(7)}${String(r.trees).padStart(7)}${(r.cells ? r.trees / r.cells : 0).toFixed(3).padStart(8)}${String(r.stump).padStart(8)}   ${lg}`);
  }
  if (rows.length > 20) console.log(`  … 아래 ${rows.length - 20}곳 생략(합에는 들었다)`);
  const zero = rows.filter((r) => r.trees === 0).length;
  console.log(`\n나무 0 인 마을 ${zero}/${rows.length}곳 · 나무가 선 마을 ${rows.length - zero}곳`);
  if (bootLog) {
    const loggedN = logged.size, sumLogged = [...logged.values()].reduce((a, b) => a + b, 0);
    console.log(`부팅 개간 로그: 줄이 난 마을 ${loggedN}곳(합 ${sumLogged}그루) · 줄이 안 난 마을 ${rows.length - loggedN}곳 = **0그루 벴다**`);
  }
  // 영토가 자라며 벤 줄(`_terrGrow` — "영토 +n셀 … 개간 m그루") — 두 판 합
  const growCut = (s) => { let n = 0, c = 0; for (const m of s.matchAll(/영토 \+(\d+)셀[^\n]*?개간 (\d+)그루/g)) { n++; c += +m[2]; } return [n, c]; };
  const [g1n, g1c] = growCut(log1), [g2n, g2c] = growCut(bootLog);
  if (log1 || bootLog) console.log(`영토 성장 개간 줄: 1차 ${g1n}줄 ${g1c}그루 · 2차 ${g2n}줄 ${g2c}그루`);
  const warned = /영토 개간 — 색인을 못 물었다[^\n]*/.exec(log1 + '\n' + bootLog);
  if (warned) console.log(`★존이 말했다: ${warned[0]}`);

  // ── 남은 나무 — 어느 판에 어떻게 남았나(1차 끝 사본과 대조) ────────────────
  let resid = null;
  if (residual.length) {
    const S = SNAP ? readDb(SNAP) : null;
    const sTerr = S ? new Set(S.terrRows.map((r) => r.cx + ',' + r.cy)) : null;
    console.log(`\n남은 나무 ${residual.length}그루 — 셀 · 씨 · (1차 끝 영토? · 1차 끝 장부 · 지금 장부)`);
    resid = residual.slice(0, 40).map((t) => {
      const k = t.cx + ',' + t.cy;
      const row = { ...t, terr1: sTerr ? sTerr.has(k) : null, led1: S ? (S.harvestedSet.has(t.seedKey) ? S.harvestedSet.get(t.seedKey) : null) : null,
        ledNow: harvestedSet.has(t.seedKey) ? harvestedSet.get(t.seedKey) : null };
      console.log(`  ${t.vil} (${k}) ${t.seedKey} · 1차영토 ${row.terr1} · 1차장부 ${row.led1} · 지금장부 ${row.ledNow}`);
      return row;
    });
  }

  // ── 게이트 — 관측자가 받은 나무를 영토 안/밖으로 ─────────────────────────
  let gateRows = null;
  if (gate && gate.shots) {
    const cellOf = (x, y) => Math.floor(x / 32) + ',' + Math.floor(y / 32);
    console.log(`\n=== 게이트 — 관측자가 **받은** 개체(서버 방송 · 클라가 그리는 것) ===`);
    console.log(`${'마을'.padEnd(10)}${'블록 나무'.padStart(10)}${'영토 안'.padStart(9)}${'영토 밖'.padStart(9)}${'안 그루터기'.padStart(12)}`);
    gateRows = gate.shots.map((s) => {
      const T = s.terr;                                  // 스냅샷 그 순간의 영토
      const inT = s.tree.filter(([x, y]) => T.has(cellOf(x, y)));
      const stIn = s.stump.filter(([x, y]) => T.has(cellOf(x, y))).length;
      const lateIn = s.tree.filter(([x, y]) => !T.has(cellOf(x, y)) && terrAll.has(cellOf(x, y))).length;   // 그 뒤 편입된 셀(표에만)
      const r = { name: s.name, block: s.block, trees: s.tree.length, inTerr: inT.length, outTerr: s.tree.length - inT.length, stumpIn: stIn,
        terrAtShot: T.size, terrEnd: terrAll.size, lateIn, inTerrList: inT.slice(0, 20), treeList: s.tree, ms: s.ms };
      console.log(`${String(s.name).padEnd(10)}${String(r.trees).padStart(10)}${String(r.inTerr).padStart(9)}${String(r.outTerr).padStart(9)}${String(stIn).padStart(12)}   (그때 영토 ${T.size}셀 · 끝 ${terrAll.size}셀 · 그 뒤 편입 셀의 나무 ${lateIn})`);
      return r;
    });
  }

  // ── 나무꾼의 숲(`T378_WOOD=1`) — 카드 ③ 괄호 "나무꾼 스캔 반경이 영토를 넘으므로 값이 조금 변할 수 있다" 를 잰다 ──
  //   나무꾼(T325 · 기본 끔)은 마을 중심 ±`T325_R` 셀 네모를 훑는다. 그 네모가 **영토 안**이면 개간 뒤엔 벨 나무가 없다.
  //   반경은 `villages.js` 의 그 줄을 **글자로 읽는다**(수를 안 적는다). `K` = 벤 장부를 안 넘긴 수(T341 의 "교란 전")
  //   · `N` = 지금 장부를 넘긴 수(나무꾼이 실제로 보는 것).
  let wood = null;
  if (process.env.T378_WOOD === '1') {
    const _tr = /const T325_R = (\d+)/.exec(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    if (!_tr) console.log('★villages.js 에서 T325_R 을 못 읽었다 — 나무꾼 표를 건너뛴다');
    else {
      const TR = +_tr[1];
      const wr = [];
      let sCells = 0, sIn = 0, kAll = 0, kOut = 0, nNow = 0, nZero = 0;
      for (const v of vils) {
        let cells = 0, inT = 0, K = 0, Ko = 0, N = 0;
        for (let dy = -TR; dy <= TR; dy++) for (let dx = -TR; dx <= TR; dx++) {
          const tx = v.cx + dx, ty = v.cy + dy;
          if (tx < 0 || ty < 0) continue;
          cells++;
          const isIn = terrAll.has(tx + ',' + ty); if (isIn) inT++;
          let raw = [], now = [];
          try { raw = resourcesAtCell(ZID, tx, ty, { biome, chunkSize }); } catch (e) {}
          try { now = resourcesAtCell(ZID, tx, ty, { biome, chunkSize, harvestedSet, gameDay: GAMEDAY }); } catch (e) {}
          const rk = raw.filter((e) => e.type === 'tree' || e.type === 'sapling').length;   // 나무꾼 종 집합(`_T325_TYPES` 그 둘)
          K += rk; if (!isIn) Ko += rk;
          N += now.filter((e) => e.type === 'tree' || e.type === 'sapling').length;
        }
        wr.push({ name: v.name, cells, inTerr: inT, K, Kout: Ko, N });
        sCells += cells; sIn += inT; kAll += K; kOut += Ko; nNow += N; if (N === 0) nZero++;
      }
      wood = { R: TR, cells: sCells, inTerr: sIn, K: kAll, Kout: kOut, N: nNow, zeroN: nZero, rows: wr };
      console.log(`\n=== 나무꾼의 숲 — 중심 ±${TR}셀 네모(${(2 * TR + 1) ** 2}칸) ===`);
      console.log(`네모 셀 ${sCells} 중 영토 셀 ${sIn} (${(100 * sIn / Math.max(1, sCells)).toFixed(1)}%) · 교란 전 나무 K ${kAll}(그중 영토 밖 ${kOut}) · 지금 나무 N ${nNow} · N=0 마을 ${nZero}/${vils.length}`);

      // ── ★[T398] 영토 밖 고리 — 제품 함수(`villages.js _t398Cells`)를 **그대로** 부른다(사본 0) ─────────
      //   마을 꼴은 DB 에서 세운다(회관 셀 · 제 영토 집합 · 이웃 목록 = 50마을 전부). 영토 0셀 마을은 그 함수가 네모로 돌려준다.
      //   걸음 거리 — 하루 경계 벌목이 쓰는 그 거리(회관 한가운데 → **나무가 선 가장 가까운 후보 셀** 한가운데 · px).
      const V = require(path.join(ROOT, 'server', 'villages.js'));
      if (typeof V._t398Cells !== 'function') console.log('★villages.js 가 `_t398Cells` 를 안 내준다 — 고리 표를 건너뛴다(T398 전 코드)');
      else {
        const pv = vils.map((v) => ({ name: v.name, dbId: v.id, ccx: v.cx, ccy: v.cy, _terrSet: new Set((byVil.get(v.id) || []).map((c) => c[0] + ',' + c[1])) }));
        const SZ = 32;
        const near = (v, list) => {   // 나무 선 셀 중 회관에서 가장 가까운 것(px)
          let bd = Infinity; const x0 = v.ccx * SZ + SZ / 2, y0 = v.ccy * SZ + SZ / 2;
          for (const [tx, ty] of list) { const dx = tx * SZ + SZ / 2 - x0, dy = ty * SZ + SZ / 2 - y0; const d = dx * dx + dy * dy; if (d < bd) bd = d; }
          return bd === Infinity ? null : Math.sqrt(bd);
        };
        const rr = [];
        let rCells = 0, rK = 0, rN = 0, rZero = 0, rSq = 0, rOther = 0, rInTerr = 0;
        for (let i = 0; i < pv.length; i++) {
          const v = pv[i];
          const C = V._t398Cells(v, pv);
          const alone = V._t398Cells(Object.assign({}, v, { _t398C: null }), []);   // 이웃을 안 뺀 고리 — 이웃 영토에 걸린 칸 수만 센다
          let K = 0, N = 0, inT = 0; const treeCells = [];
          for (let j = 0; j < C.xy.length; j += 2) {
            const tx = C.xy[j], ty = C.xy[j + 1];
            if (tx < 0 || ty < 0) continue;
            if (terrAll.has(tx + ',' + ty)) inT++;
            let raw = [], now = [];
            try { raw = resourcesAtCell(ZID, tx, ty, { biome, chunkSize }); } catch (e) {}
            try { now = resourcesAtCell(ZID, tx, ty, { biome, chunkSize, harvestedSet, gameDay: GAMEDAY }); } catch (e) {}
            K += raw.filter((e) => e.type === 'tree' || e.type === 'sapling').length;
            const n = now.filter((e) => e.type === 'tree' || e.type === 'sapling').length;
            if (n) { N += n; treeCells.push([tx, ty]); }
          }
          const sqRow = wr[i];
          const sqTrees = [];
          if (sqRow && sqRow.N) {   // 네모의 가장 가까운 나무 셀(같은 셈 · 표 한 칸)
            for (let dy = -TR; dy <= TR; dy++) for (let dx = -TR; dx <= TR; dx++) {
              const tx = v.ccx + dx, ty = v.ccy + dy; if (tx < 0 || ty < 0) continue;
              let now = []; try { now = resourcesAtCell(ZID, tx, ty, { biome, chunkSize, harvestedSet, gameDay: GAMEDAY }); } catch (e) {}
              if (now.some((e) => e.type === 'tree' || e.type === 'sapling')) sqTrees.push([tx, ty]);
            }
          }
          const row = { name: v.name, terr: v._terrSet.size, ring: C.ring, cells: C.xy.length / 2, otherTerr: (alone.xy.length - C.xy.length) / 2, inTerr: inT,
            K, N, nearRing: near(v, treeCells), nearSq: near(v, sqTrees), sqN: sqRow ? sqRow.N : null };
          rr.push(row);
          rCells += row.cells; rK += K; rN += N; if (N === 0) rZero++; if (!C.ring) rSq++; rOther += row.otherTerr; rInTerr += inT;
        }
        const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
        const mR = med(rr.map((r) => r.nearRing)), mS = med(rr.map((r) => r.nearSq));
        wood.ring = { cells: rCells, K: rK, N: rN, zeroN: rZero, squareFallback: rSq, otherTerrCut: rOther, inTerr: rInTerr, nearMedRing: mR, nearMedSq: mS,
          nearMedBoth: med(rr.filter((r) => r.nearSq != null && r.nearRing != null).map((r) => r.nearRing - r.nearSq)), rows: rr };
        console.log(`\n=== ★[T398] 나무꾼의 숲 — 영토 밖 고리(영토에서 체비쇼프 ≤ ${TR}셀 · 남의 영토 뺌 · 영토 0셀이면 네모) ===`);
        console.log(`고리 셀 ${rCells}(마을당 ${(rCells / Math.max(1, vils.length)).toFixed(0)}) · 그중 영토 셀 ${rInTerr} · 이웃 영토라 뺀 칸 ${rOther} · 네모로 돌아간 마을 ${rSq}`);
        console.log(`교란 전 나무 K 네모 ${kAll} → 고리 ${rK} · 지금 나무 N 네모 ${nNow} → **고리 ${rN}** · N=0 마을 네모 ${nZero} → **고리 ${rZero}**/${vils.length}`);
        console.log(`걸음 거리(회관 → 가장 가까운 나무 셀) 중앙값 — 네모 ${mS == null ? '—' : mS.toFixed(0) + 'px'}(N>0 ${rr.filter((r) => r.nearSq != null).length}곳) · 고리 ${mR == null ? '—' : mR.toFixed(0) + 'px'}(N>0 ${rr.filter((r) => r.nearRing != null).length}곳)`);
        const top = rr.slice().sort((a, b) => b.N - a.N);
        console.log(`${'마을'.padEnd(10)}${'영토'.padStart(6)}${'고리칸'.padStart(7)}${'K'.padStart(6)}${'N네모'.padStart(7)}${'N고리'.padStart(7)}${'거리네모'.padStart(9)}${'거리고리'.padStart(9)}`);
        for (const r of top.slice(0, 12)) console.log(`${String(r.name).padEnd(10)}${String(r.terr).padStart(6)}${String(r.cells).padStart(7)}${String(r.K).padStart(6)}${String(r.sqN).padStart(7)}${String(r.N).padStart(7)}${(r.nearSq == null ? '—' : r.nearSq.toFixed(0)).padStart(9)}${(r.nearRing == null ? '—' : r.nearRing.toFixed(0)).padStart(9)}`);
        const zs = rr.filter((r) => r.N === 0).map((r) => `${r.name}(영토 ${r.terr} · K ${r.K})`);
        if (zs.length) console.log(`고리에서도 N=0 인 마을: ${zs.join(' · ')}`);
      }
    }
  }

  if (process.env.T378_JSON) {
    fs.writeFileSync(process.env.T378_JSON, JSON.stringify({ totCells, totTrees, totStump, totSap, ledger: harvestedSet.size, zero, gameDay: GAMEDAY,
      rows, logged: [...logged], grow: { pass1: [g1n, g1c], pass2: [g2n, g2c] }, residual: resid, gate: gateRows, wood, planted, snap: SNAP || null, db: DB }, null, 1));
    console.log(`표 → ${process.env.T378_JSON}`);
  }
  process.exit(0);
})().catch((e) => { console.error('자 크래시:', e); killAll(); process.exit(1); });
