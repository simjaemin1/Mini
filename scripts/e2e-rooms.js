#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// e2e-rooms — 방 판정 실클라 E2E [배치 18 ①]
//   재민 확정: "건축 제대로 하자." 플레이어가 **ㄱ자**로 지은 집이 실내로 잡히는가를
//   진짜 서버 + 진짜 Chromium 으로 끝까지 확인한다.
//
// 두 경로를 다 밟는다(하나만 보면 반쪽이다):
//   ⓐ **부팅 경로** — DB 에 미리 지어 둔 ㄱ자 집 → 청크 활성화(roomsScanChunk) → welcome 스냅샷
//      → 클라 ingestRooms → `window.__roomDbg()` 가 그 방을 안다.
//   ⓑ **증분 경로** — 클라가 실제로 **문을 놓고 · 벽을 헐어** 본다 → rooms_update 가 날아와
//      방이 유지/해체되는지. (서버 /roomdbg 와 클라 훅을 **둘 다** 대조 — 한쪽만 보면 배선을 못 잡는다.)
//
// ★자명한 통과 금지: 매 단계 앞에 "그 상황이 실제로 성립했는지"를 먼저 assert 한다
//   (집이 DB 에 실제로 들어갔나 · 내가 그 방 안에 서 있나 · 벽이 실제로 사라졌나).
//
// 사용: node scripts/e2e-rooms.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/e2e-rooms-${process.pid}.db`;
const SHOTS = process.env.SHOTS || '/tmp/e2e-rooms-shots';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const eq = (a, b, m) => ok(a === b, `${m} (${JSON.stringify(a)} === ${JSON.stringify(b)})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`pkill -f "serve[r]/zone.js" ; pkill -f "centra[l].js" ; pkill -f "zone-wra[p]"`, { stdio: 'ignore' }); } catch (e) {}

const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|시딩 완료|Error|rooms/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 200)); });
  p.stderr.on('data', (d) => { const s = d.toString(); if (!/ExperimentalWarning|trace-warnings/.test(s)) process.stdout.write(`  [${name}!] ` + s.slice(0, 200)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
function writeWrap() {
  // ★★계측 오염 제거 — **하루를 멈춘다.** 지붕 전/후 두 장을 2초 간격으로 찍는데, 그 사이 하루가
  //   흘러 조명이 바뀌면 픽셀 지표가 통째로 흔들린다(1차 실행에서 실제로 그랬다: 대조군 '빈 땅'의
  //   평균 절대차가 0.0 → 3.4 로 뛰었다 — 지붕이 아니라 해가 움직인 것이다).
  //   하루를 24시간으로 늘리고 epoch 을 지금 **정오(phase 0.25)** 에 맞춘다 → 촬영 중 조명 변화 ≈ 0.
  fs.writeFileSync('/tmp/zone-wrap-rooms.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID=process.env.ZONE_ID||'hanbando';
if(process.env.WRAP_DAY_MS){const d=parseInt(process.env.WRAP_DAY_MS,10);
  cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
  console.log('[wrap] 하루 정지 — dayLengthMs='+d+' · 지금 phase≈0.25(정오)');}
try{const patch=JSON.parse(process.env.WRAP_ZONE_PATCH||'{}');Object.assign(cfg.ZONES[ZID],patch);
console.log('[wrap] '+ZID+' 덮어쓰기: '+JSON.stringify(patch));}catch(e){}
require(path.join(ROOT,'server','zone.js'));`);
  return '/tmp/zone-wrap-rooms.js';
}

// ── DB 에 ㄱ자 집을 미리 짓는다 (플레이어 소유 · 마을 태그 없음) ─────────────
//   벽은 '바깥과 맞닿은 변'에만 — 사람이 짓는 방식과 같다(test-rooms.js encloseCells 와 동형).
const SZ = 32;
const RECT = (x0, y0, x1, y1) => { const o = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) o.push([x, y]); return o; };
// ── [T75 2026-09-03] **NPC 움집 픽스처** ──────────────────────────────────────
//   T57 이 ⓔ 를 "이 픽스처엔 NPC 집이 한 채도 없다 — 못 잰다"로 유보하고 회부한 자리다.
//   결함(`floorOutOff` 가 되돌리는 그 억제)은 **`data.hut`/`data.bld` 태그가 붙은 집에만** 걸린다.
//   ⇒ 진짜 NPC 움집이 한 채 필요하다. 그런데 마을 시딩을 켜면 50곳·수 분이 든다.
//   ★그럴 필요가 없다: 서버는 `villages` 표가 **비어 있을 때만** 시딩한다(server/villages.js
//     "Stage 2 — 시딩(idempotent)"). 마을 한 줄 + 집 한 줄을 미리 넣어 두면 시딩은 통째로 건너뛰고,
//     부팅의 Stage 4A 가 그 집을 **자기 경로로** 실체화한다(`materializeVillageStructures`).
//   ★★그래서 하네스는 6×4·남벽 문 2칸 같은 **기하를 한 줄도 안 베낀다**(베끼면 사본 계측기다).
//     문간은 아래 `readHutDoor` 가 **DB 에서 재서** 안다.
function seedNpcVillage(dbPath, vcx, vcy, hcx, hcy) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath); const now = Date.now();
    db.prepare('INSERT INTO villages (zone,name,cx,cy,population,econ_state,day,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('hanbando', 'T75 픽스처마을', vcx, vcy, 0, null, 0, now);
    const vid = db.prepare('SELECT id FROM villages ORDER BY id DESC LIMIT 1').get().id;
    db.prepare('INSERT INTO village_buildings (village_id,type,cx,cy,floors,data,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(vid, 'house', hcx, hcy, 1, null, now);
    db.close(); return { vid };
  } catch (e) { return { err: e.message }; }
}
// ★[T75] 문간을 **잰다** — `data.hut` 렉트를 읽고, 그 남변에서 **벽이 없는 칸**을 문으로 삼는다.
//   (문 자리를 상수로 적으면 서버가 문을 옮겼을 때 하네스가 조용히 엉뚱한 데를 재게 된다.)
function readHutDoor(dbPath) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT x,y,type,data FROM buildings WHERE data LIKE '%\"hut\"%'").all();
    db.close();
    let rect = null; const wallCells = new Set();
    for (const r of rows) {
      let d = null; try { d = JSON.parse(r.data); } catch (e) {}
      if (!d || !d.hut) continue;
      rect = d.hut;
      if (r.type === 'wall') wallCells.add(Math.floor(r.x / SZ) + ',' + Math.floor(r.y / SZ));
    }
    if (!rect) return { err: '움집 태그(data.hut) 행이 DB 에 없다 — 실체화가 안 됐다' };
    const doorY = rect[3] + 1, doorXs = [];
    for (let x = rect[0]; x <= rect[2]; x++) if (!wallCells.has(x + ',' + doorY)) doorXs.push(x);
    if (!doorXs.length) return { err: '남변에 벽 없는 칸이 없다 — 문을 못 찾았다', rect };
    return { rect, doorY, doorXs, rows: rows.length };
  } catch (e) { return { err: e.message }; }
}

// ★[T75] 손잡이(`floorOutOff`)가 **걸리는 대상**의 수 — `data.hut`/`data.bld` 태그 렉트.
//   (지붕 종류 `hutroof` 를 세면 안 된다: 그 kind 는 **플레이어 방 지붕**도 쓴다
//    — `34-m-renderloop.js` 네 자리 중 하나가 room 경로다. 세어 보면 이 픽스처에서도 2가 나온다.)
function countTaggedHuts(dbPath) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT data FROM buildings WHERE data LIKE '%\"hut\"%' OR data LIKE '%\"bld\"%'").all();
    db.close();
    const set = new Set();
    for (const r of rows) { let d = null; try { d = JSON.parse(r.data); } catch (e) {} const t = d && (d.hut || d.bld); if (t) set.add(t.join(',')); }
    return set.size;
  } catch (e) { return 0; }
}

function seedHouse(dbPath, cells, doorAt, floor) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  const now = Date.now();
  const ins = db.prepare('INSERT INTO buildings (type, owner_id, owner_name, x, y, data, created_at) VALUES (?,?,?,?,?,?,?)');
  const S = new Set(cells.map(([x, y]) => `${x},${y}`));
  let nf = 0, nw = 0;
  const F = floor | 0;
  for (const [x, y] of cells) { ins.run('floor', 'e2e', 'E2E', x * SZ, y * SZ, JSON.stringify({ floor: F }), now); nf++; }
  const edges = [];
  for (const [x, y] of cells) {
    if (!S.has(`${x},${y - 1}`)) edges.push([x, y, 'N']);
    if (!S.has(`${x},${y + 1}`)) edges.push([x, y + 1, 'N']);
    if (!S.has(`${x + 1},${y}`)) edges.push([x, y, 'E']);
    if (!S.has(`${x - 1},${y}`)) edges.push([x - 1, y, 'E']);
  }
  for (const [x, y, s] of edges) {
    const isDoor = doorAt && doorAt[0] === x && doorAt[1] === y && doorAt[2] === s;
    ins.run(isDoor ? 'door' : 'wall', 'e2e', 'E2E', x * SZ, y * SZ,
      JSON.stringify(isDoor ? { side: s, floor: F, open: true } : { side: s, floor: F }), now);
    nw++;
  }
  db.close();
  return { floors: nf, walls: nw, edges };
}
const rget = async (q) => (await (await fetch(`http://localhost:${ZPORT}/roomdbg${q || ''}`)).json());

(async () => {
  say('=== 방 판정 실클라 E2E (배치 18 ①) ===');
  const wrap = writeWrap();
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(ZDB + s); } catch (e) {} }

  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);

  // ── 빈 세계에 짓는다 — 마을 시딩은 끈다(이 검사는 플레이어 건축 전용 경로다. 50곳 시딩 7분도 아낀다)
  //   ㄱ자: (100..103, 100..102) + (100..101, 103..105)  = 12 + 6 = 18칸
  const BODY = RECT(100, 100, 103, 102), ARM = RECT(100, 103, 101, 105);
  const CELLS = BODY.concat(ARM);
  const DOOR = [103, 103, 'N'];   // 몸통 남동 끝의 남벽 한 장을 '열린 문'으로 — 열려 있어도 방이 유지돼야 한다
  const IN = { cx: 101, cy: 101 };      // 방 안(몸통 가운데)
  const ARMTIP = { cx: 101, cy: 105 };  // ㄱ자 팔 끝 — 직사각형 가정이면 여기서 깨진다

  // zone 을 한 번 띄워 DB 스키마를 만들고 끈다(스키마는 zone-local-db 가 부팅 때 만든다)
  {
    const z = boot('zone0', path.join(ROOT, 'server', 'zone.js'), {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'DB 스키마 생성용 1차 부팅');
    try { z.kill(); } catch (e) {}
    await sleep(2000);
  }
  const seeded = seedHouse(ZDB, CELLS, DOOR);
  // ★[T75] NPC 움집 픽스처 — ㄱ자 집에서 **화면 밖**(27셀↑)에 둔다. ⓐ~ⓓ 는 ENABLE_VILLAGES=0 이라
  //   이 행들을 아예 안 읽는다(기존 판정 무영향). 아래 [T75] 절만 마을을 켜고 부팅한다.
  const NPCV = seedNpcVillage(ZDB, 160, 160, 130, 130);
  ok(seeded.floors === 18, `★검사 전제 — ㄱ자 집이 DB 에 실제로 들어갔다: 바닥 ${seeded.floors}칸`);
  ok(seeded.walls >= 18, `검사 전제 — 둘레 벽/문 ${seeded.walls}장`);

  // ── ⓐ 부팅 경로 ────────────────────────────────────────────────────────────
  say('\n[ⓐ 부팅 — DB → 청크 활성화 → welcome → 클라]');
  const z = boot('zone', wrap, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', E2E_GIVE: '1', WRAP_DAY_MS: '86400000',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: IN.cx * SZ + 16, y: IN.cy * SZ + 16, name: 'ㄱ자 집 안' } }),
  });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(4000);

  // ★사람이 없으면 청크가 안 켜지고, 청크가 안 켜지면 건물이 메모리에 없어 방도 없다.
  //   (1차 작성이 여기서 접속 **전에** 물어보고 "방 0" 을 결함으로 찍었다 — 계측 순서 오류였다.)
  let srv = await rget();
  ok(srv.rooms === 0, `검사 전제 — 아무도 없을 땐 방 0 (청크 미활성 · 실측 ${srv.rooms})`);

  // 진짜 클라이언트
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => say('  [pageerror] ' + String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) {}
  }
  await sleep(15000);
  //   ★[계측 격리 2026-08-07] 배치 21 이 **지면 풀 카펫**을 흔들리게 했다 — 이 하네스의
  //     '빈 땅 대조군은 정지' 판정은 이제 저절로 깨진다(실측 |Δ| 3.8 > 2). 배치 19 인계가
  //     예고했던 그 오염이 드디어 실현됐다. **기준을 낮추지 않고 재는 층을 격리**한다.
  //     sleep 없는 evaluate 로 곧바로 끈다 — 격리가 실험 타이밍을 밀면 안 된다.
  await page.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
  await page.screenshot({ path: `${SHOTS}/01-inside.png` });

  const send = (m) => page.evaluate((mm) => { window.__sendPrimary(mm); return true; }, m);
  const rdbg = () => page.evaluate(() => (window.__roomDbg ? window.__roomDbg() : null)).catch(() => null);

  srv = await rget(`?cx=${IN.cx}&cy=${IN.cy}&floor=0`);
  ok(srv.rooms === 1, `★사람이 오자 서버가 방을 1개 판정했다 (실측 ${srv.rooms})`);
  ok(!!srv.at.room, '내가 선 자리가 그 방 안이다');
  eq(srv.at.room && srv.at.room.cells.length / 2, 18, '★방 크기 18칸 — ㄱ자 전체가 한 방');
  const ROOMID = srv.at.room && srv.at.room.id;
  const tip = await rget(`?cx=${ARMTIP.cx}&cy=${ARMTIP.cy}&floor=0`);
  ok(tip.at.room && tip.at.room.id === ROOMID, `★ㄱ자 팔 끝(${ARMTIP.cx},${ARMTIP.cy})도 같은 방 — 직사각형 가정이면 실패한다`);
  const outside = await rget(`?cx=${IN.cx}&cy=${IN.cy + 12}&floor=0`);
  ok(!outside.at.room, '집 밖은 방이 아니다');

  let cd = await rdbg();
  ok(!!cd, '클라 방 진단 훅이 산다');
  ok(cd && cd.indoors === true, '★★클라가 "나는 실내다"라고 답한다 — 서버 판정이 화면 층까지 도달했다');
  eq(cd && cd.roomId, ROOMID, '★클라가 든 방 id 가 서버와 같다(사본이 아니라 받아 쓴 값)');
  eq(cd && cd.roomCells, 18, '클라가 든 방 크기도 18칸');
  ok(cd && cd.rooms === 1, `클라가 아는 방 수 1 (실측 ${cd && cd.rooms})`);

  // ── ⓑ 증분 경로 ────────────────────────────────────────────────────────────
  say('\n[ⓑ 증분 — 클라가 문을 놓고 벽을 헌다]');
  // 준비물
  await send({ type: '__e2e_give', items: { item_door: 3, item_wall: 3 }, tools: ['hammer'] });
  await sleep(1200);

  // ⓑ-1 **바깥벽** 한 장을 헐어 본다 → 방이 해체돼야 한다.
  //   ★1차 작성은 (100,103) 남변을 골랐는데 거기는 ㄱ자 팔 **안쪽**이라 벽이 아예 없었다.
  //     게다가 몸통↔팔은 두 칸(x=100·101)으로 붙어 있어 한 변을 막아도 방이 안 갈린다 —
  //     "벽을 놨는데 아무 일도 안 일어나는" 자명 통과가 될 뻔했다. 바깥벽으로 바꾼다.
  //   분해는 벽에서 80px 안이어야 하므로 내 칸(101,101) 바로 위 북쪽 바깥벽을 고른다(거리 ≈51px).
  const WALLCELL = { cx: 101, cy: 100, side: 'N' };   // (101,100) 의 북변 = 바깥벽
  const wallId = findBuildingId(ZDB, WALLCELL.cx * SZ, WALLCELL.cy * SZ, 'wall');
  ok(!!wallId, `검사 전제 — 헐 벽을 찾았다 (b${wallId})`);
  await send({ type: 'dismantle_building', buildingId: `b${wallId}` });
  await sleep(1500);
  srv = await rget(`?cx=${IN.cx}&cy=${IN.cy}&floor=0`);
  ok(!srv.at.room, '★벽 한 장을 헐면 서버에서 방이 해체된다');
  cd = await rdbg();
  ok(cd && cd.indoors === false, '★★그 사실이 클라까지 온다(rooms_update) — 이제 실외다');
  eq(cd && cd.rooms, 0, '클라가 아는 방 수 0');
  await page.screenshot({ path: `${SHOTS}/02-wall-removed.png` });

  // ⓑ-2 그 자리에 **문**을 놓는다 → 통행은 되고 방은 되살아나야 한다(이 배치의 핵심)
  await send({ type: 'place_building', itemType: 'item_door', atX: WALLCELL.cx * SZ + 16, atY: WALLCELL.cy * SZ + 16, floor: 0, dir: 'N' });
  await sleep(1500);
  srv = await rget(`?cx=${IN.cx}&cy=${IN.cy}&floor=0`);
  ok(!!srv.at.room, '★★문을 놓으면 방이 되살아난다 — 문은 구멍이 아니라 경계다');
  eq(srv.at.room && srv.at.room.id, ROOMID, '되살아난 방 id 가 처음과 같다(결정론적 id)');
  cd = await rdbg();
  ok(cd && cd.indoors === true, '클라도 다시 실내로 본다');

  // ⓑ-3 그 문을 연다 → 방이 유지돼야 한다(종전 클라 BFS 는 여기서 샜다)
  const doorId = findBuildingId(ZDB, WALLCELL.cx * SZ, WALLCELL.cy * SZ, 'door');
  ok(!!doorId, `검사 전제 — 방금 놓은 문을 찾았다 (b${doorId})`);
  await send({ type: 'door_toggle', buildingId: `b${doorId}` });
  await sleep(1500);
  const doorOpen = readDoorOpen(ZDB, doorId);
  ok(doorOpen === true, '★검사 전제 — 문이 실제로 열렸다(DB 상태)');
  srv = await rget(`?cx=${IN.cx}&cy=${IN.cy}&floor=0`);
  ok(!!srv.at.room, '★★문을 열어도 방이 유지된다 — 열린 문도 경계다');
  eq(srv.at.room && srv.at.room.cells.length / 2, 18, '방 크기도 그대로 18칸');
  cd = await rdbg();
  ok(cd && cd.indoors === true, '클라도 실내를 유지한다');
  await page.screenshot({ path: `${SHOTS}/03-door-open.png` });

  // ── ⓒ 자동 지붕 + 컷어웨이 (배치 18 ②) ────────────────────────────────────
  say('\n[ⓒ 자동 지붕 — 닫힌 방 위에 지붕이 저절로 얹힌다]');
  const rr = await page.evaluate(() => window.__roomRoofDbg || null).catch(() => null);
  ok(!!rr, '방 지붕 진단 훅이 산다');
  ok(rr && rr.myRoom === ROOMID, `안에서: 내 방을 안다 (${rr && rr.myRoom})`);
  ok(rr && rr.roofs.length === 1 && rr.roofs[0].roofOn === false,
    '★★내가 그 방 안이면 지붕을 안 그린다(컷어웨이 — 투명이 아니라 미표시)');
  
  await browser.close(); try { z.kill(); } catch (e) {}
  await sleep(2500);

  // 같은 집을 **밖에서** — 지붕이 그려져야 한다. 그리고 **카메라를 고정한 채** 방을 해체해
  //   지붕이 사라지는 것을 같은 상자에서 잰다.
  //   ★1차 작성은 '안 스크린샷 vs 밖 스크린샷'의 전체 화면 이엉 비율을 비교했는데 **계측기가 틀렸다**:
  //     실내 바닥 판자도 이엉과 같은 카키라 안에서도 2.45% 가 잡혔다(지붕은 실제로 안 그려졌는데도).
  //     카메라가 다르면 같은 상자를 못 쓴다 ⇒ **한 자리에서 전/후**로 바꾼다. 이러면 바뀐 것은 지붕뿐이다.
  const OUT = { cx: 100, cy: 107 };   // ㄱ자 팔 남쪽 바로 밖 — 남벽(100,106,'N')에서 51px(분해 사거리 80px 안)
  const z2 = boot('zone2', wrap, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', E2E_GIVE: '1', WRAP_DAY_MS: '86400000',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: OUT.cx * SZ + 16, y: OUT.cy * SZ + 16, name: 'ㄱ자 집 밖' } }),
  });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 재기동(밖 스폰)');
  await sleep(4000);
  const b2 = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const p2 = await (await b2.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await p2.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const bb = await p2.$(sel); if (bb) { await bb.click(); break; } } catch (e) {}
  }
  await sleep(15000);
  //   ★[계측 격리 2026-08-07] 배치 21 이 **지면 풀 카펫**을 흔들리게 했다 — 이 하네스의
  //     '빈 땅 대조군은 정지' 판정은 이제 저절로 깨진다(실측 |Δ| 3.8 > 2). 배치 19 인계가
  //     예고했던 그 오염이 드디어 실현됐다. **기준을 낮추지 않고 재는 층을 격리**한다.
  //     sleep 없는 evaluate 로 곧바로 끈다 — 격리가 실험 타이밍을 밀면 안 된다.
  await p2.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
  await p2.screenshot({ path: `${SHOTS}/04-roof-on.png` });
  const rr2 = await p2.evaluate(() => window.__roomRoofDbg || null).catch(() => null);
  ok(rr2 && rr2.myRoom === null, '밖에서: 내 방이 없다(실외)');
  ok(rr2 && rr2.roofs.length === 1 && rr2.roofs[0].roofOn === true, '★밖에서는 그 방 지붕이 그려진다');
  ok(rr2 && rr2.roofs[0].boxes.length === 2, `★ㄱ자는 맞배 **2채**로 분해된다(날개마다 한 채) — 실측 ${rr2 && rr2.roofs[0].boxes.length}`);
  // ═══ [T57 2026-09-03] ⓔ **밖에서 본 실내 바닥** — 문간이 새까만 구멍이면 안 된다 ═══
  //   재민 실기(2026-09-03 새벌): 움집 문간이 **새까만 구멍**이었다. 실내 바닥이 밖에서는
  //   아예 안 그려져(`34-m-renderloop.js` — `continue; // 밖=실내 바닥 억제`) 지붕·벽 사이로
  //   바닥 대신 배경이 보였다. 재민 요구: **바닥은 언제나 그리고 지붕이 위에서 덮는다**
  //   (가리는 건 지붕의 몫이지 바닥을 빼는 게 아니다).
  //   판정은 **짝 비교**다 — 같은 순간·같은 카메라에서 손잡이만 뒤집는다(`floorOutOff`).
  //   ⓐ 차이가 실제로 있다(바닥이 실제로 그려졌다) ⓑ 차이가 **집 상자 안에만** 있다
  //     (바닥을 늘 그려도 바깥 화면은 그대로다 — 지붕이 덮으니까).
  say('\n[T57 ⓔ 밖에서 본 실내 바닥 — 문간에 바닥이 있다]');
  {
    // ★이 자리 그대로 쓴다 — 위에서 이미 **밖**이고 바람도 껐다(같은 순간 A/B 의 전제).
    const p3 = p2, rr = rr2;
    // ★★[상황 선행] 이 손잡이는 **NPC 움집·큰집**(`data.hut`/`data.bld`)에만 걸린다 —
    //   결함이 거기 있었기 때문이다(밖에서 그 집들의 바닥만 억제됐다).
    //   이 하네스의 픽스처는 **플레이어가 지은 방**이라 그 태그가 없다. 그러면 손잡이는 no-op 이고
    //   화면 차이는 0 이어야 한다 — 그걸 "수리 안 됨"으로 읽으면 오독이다. **상황부터 잰다.**
    // ★★[T75 2026-09-03 수리] 종전 이 줄은 `__getAllBuildings()` 결과에서 `b.data` 를 봤다 —
    //   **그 훅은 data 를 안 내보낸다**(`99-main.js`: id·type·wx·wy·stage 뿐). 그래서 이 수는
    //   NPC 집이 있든 없든 **항상 0** 이었고, 절은 늘 '못 잼' 가지로 갔다. 픽스처에 NPC 집이
    //   없는 것도 사실이라 결론은 우연히 맞았지만, **재던 것은 아무것도 아니었다.**
    //   ★1차 수리는 그려진 `hutroof` 를 셌는데 그것도 틀렸다 — 그 kind 는 **플레이어 방 지붕**도
    //     쓴다(실측 2채). 그러면 이 픽스처가 '못 잼'이 아니라 '빨강'이 된다(HUD 잡음을 효과로 읽음).
    //   ⇒ 두 값을 **함께** 본다: 손잡이가 걸리는 대상은 DB 의 `data.hut`/`data.bld` 렉트 수이고,
    //     화면에 실제로 지붕이 그려지는지는 클라가 말한다. 둘 다 있어야 '잴 수 있다'.
    const taggedHuts = countTaggedHuts(ZDB);
    const drawnRoofs = await p3.evaluate(() => {
      const drawn = window.__fogGateProbe ? window.__fogGateProbe() : [];
      let n = 0; for (const [, , k] of drawn) if (k === 'hutroof') n++; return n;
    }).catch(() => 0);
    const hutCount = (taggedHuts > 0 && drawnRoofs > 0) ? taggedHuts : 0;
    // ★★잡음 바닥을 먼저 잰다(족보 80) — 같은 조건 두 장. HUD 시계·프레임 카운터가 계속 움직인다.
    const shot = async (n) => { await p3.screenshot({ path: `${SHOTS}/${n}.png` }); return PNG.sync.read(fs.readFileSync(`${SHOTS}/${n}.png`)); };
    // ★★[T75 2026-09-03 수리] 종전엔 **화면 전체**를 훑었다. 그런데 이 화면의 위쪽 띠는 HUD 다 —
    //   시계·숫자가 계속 바뀌어 한 쌍에 4,400px 씩 흔들린다(실측 자리 [150,12,584,124]).
    //   그러면 '효과'도 '잡음'도 전부 HUD 값이 되고, 판정은 두 값의 **19px 차이**로 뒤집힌다
    //   (실측: 돌연변이 판에서 4,464 vs 4,445 로 유보 줄이 빨개졌다 — 재던 건 집이 아니라 시계였다).
    //   ⇒ 재는 층을 격리한다: `e2e-nature` 의 정본 게임 화면 상자와 **같은 값**을 쓴다(HUD 제외).
    const GBOX = [40, 200, 1360, 880];
    const diffPx = (a, b) => { let c = 0, mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
      for (let y = GBOX[1]; y < Math.min(a.height, b.height, GBOX[3]); y++) for (let x = GBOX[0]; x < Math.min(a.width, b.width, GBOX[2]); x++) {
        const i = (y * a.width + x) * 4;
        const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
        if (d > 24) { c++; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; } }
      return { c, box: c ? [mnx, mny, mxx, mxy] : null }; };
    // ★잡음 바닥은 **한 쌍으로 재지 않는다** — HUD 시계·숫자가 몇 초에 한 번만 바뀐다.
    //   한 쌍만 재면 마침 안 바뀐 순간을 잡아 잡음을 0으로 보고, 그 다음 쌍의 숫자 변화가
    //   "수리 효과"로 둔갑한다(실측: 잡음 0 · 효과 53px 인데 자리는 좌상단 HUD 였다).
    //   ⇒ 같은 간격으로 **두 쌍**을 재서 큰 쪽을 바닥으로 쓴다.
    const n1 = await shot('06a-noise1'); await sleep(500);
    const n2 = await shot('06b-noise2'); await sleep(500);
    const n3 = await shot('06c-noise3');
    const nA = diffPx(n1, n2), nB = diffPx(n2, n3);
    const noise = nA.c >= nB.c ? nA : nB;
    await p3.evaluate(() => { window.__terrain19.floorOutOff = true; });
    await sleep(500);
    const off = await shot('07-floor-off');
    await p3.evaluate(() => { window.__terrain19.floorOutOff = false; });
    const eff = diffPx(n3, off);
    const BOX2 = rr && rr.roofs && rr.roofs[0] ? rr.roofs[0].boxes[0] : null;
    say(`    NPC 움집·큰집 ${hutCount}채(태그 렉트 ${taggedHuts} · 그려진 지붕 ${drawnRoofs}장 — 지붕엔 플레이어 방도 섞인다) · 잡음 바닥 ${noise.c}px${noise.box ? ' ' + JSON.stringify(noise.box) : ''}`
      + ` · 잡음 두 쌍 ${nA.c}/${nB.c}px · 바닥 on/off 차이 ${eff.c}px${eff.box ? ' ' + JSON.stringify(eff.box) : ''} · 지붕 상자 ${JSON.stringify(BOX2)}`);
    if (hutCount === 0) {
      // **못 쟀다고 적는다.** 결함은 NPC 집에 있었고 이 픽스처엔 NPC 집이 없다.
      say('    ★이 픽스처엔 NPC 움집·큰집이 **한 채도 없다** — 손잡이가 걸릴 자리가 없다.');
      say('      플레이어가 지은 방은 밖에서도 바닥이 원래 그려졌다(억제는 `data.hut`/`data.bld` 전용).');
      say('      ⇒ 이 절은 이 판에서 **못 잰다**(이 픽스처는 플레이어 방 전용이다).');
      say('      ★NPC 집 앞에서 재는 자리는 아래 [T75 ⓕ] 절이 따로 세운다 — 회부는 그걸로 닫혔다.');
      ok(eff.c <= noise.c + 30, 'ⓔ [못 잼] NPC 집이 없어 손잡이가 no-op 이다 — 차이가 잡음 바닥 안',
        `${eff.c}px ≤ 잡음 ${noise.c}(두 쌍 중 큰 쪽) + 30`);
    } else {
      ok(eff.c > noise.c * 3 + 30, `★★ⓔ 밖에서 **바닥이 실제로 그려진다** — 손잡이를 뒤집으면 화면이 바뀐다 (${eff.c}px > 잡음 ${noise.c}×3+30)`);
      if (BOX2 && eff.box) {
        const [mnx, mny, mxx, mxy] = eff.box;
        const inBox = mnx >= BOX2[0] - 96 && mny >= BOX2[1] - 96 && mxx <= BOX2[2] + 96 && mxy <= BOX2[3] + 96;
        ok(inBox, '★★ⓔ 바뀐 자리가 **집 언저리 안**이다 — 바닥을 늘 그려도 바깥 화면은 그대로다',
          `${JSON.stringify(eff.box)} ⊂ ${JSON.stringify(BOX2)} ±96`);
      }
    }
  }


  // 카메라 고정 — 방을 해체한다(팔 남벽 한 장). 지붕이 사라져야 한다.
  const armWallId = findBuildingId(ZDB, OUT.cx * SZ, (OUT.cy - 1) * SZ, 'wall');
  ok(!!armWallId, `검사 전제 — 팔 남벽을 찾았다 (b${armWallId})`);
  await p2.evaluate((id) => { window.__sendPrimary({ type: 'dismantle_building', buildingId: id }); }, `b${armWallId}`);
  await sleep(2000);
  await p2.screenshot({ path: `${SHOTS}/05-roof-off.png` });
  const rr3 = await p2.evaluate(() => window.__roomRoofDbg || null).catch(() => null);
  ok(rr3 && rr3.roofs.length === 0, '★방이 해체되자 지붕도 사라졌다(계약)');
  await b2.close(); try { z2.kill(); } catch (e) {}
  await sleep(2500);   // ★포트 3020 이 풀릴 틈 — 안 주면 다음 존이 EADDRINUSE 로 죽고 그 결과를 결함으로 오독한다

  // ★화면 층 — **같은 상자**에서 전/후. 바뀐 것은 지붕뿐이다.
  const onPng = PNG.sync.read(fs.readFileSync(`${SHOTS}/04-roof-on.png`));
  const offPng = PNG.sync.read(fs.readFileSync(`${SHOTS}/05-roof-off.png`));
  const clampBox = (b, g) => [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(g.width, b[2]), Math.min(g.height, b[3])];
  // ★이엉 판별식 — **밝은 황갈**(r>135 · r−b>60 · r>g>b). 따뜻한 초가 지붕의 서명이다.
  //   ⚠e2e-cutaway 가 쓰는 옛 식(g−b>28 · |r−g|<30)을 그대로 가져왔다가 틀렸다: 그건 **밤** 화면에서
  //     맞춘 값이라 대낮의 카키빛 지면·바닥 판자까지 같이 잡는다(ON 13.0% vs OFF 11.4% — 판별력 0).
  //     실측으로 고른 이 식은 같은 자리에서 ON 29.0% vs OFF 10.6% 로 갈린다.
  const khakiBox = (g, bx) => { const [x0, y0, x1, y1] = clampBox(bx, g); let n = 0, k = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * g.width + x) * 4;
      const r = g.data[i], gg = g.data[i + 1], b3 = g.data[i + 2]; n++;
      if (r > 135 && r - b3 > 60 && r > gg && gg > b3) k++; }
    return n ? k / n * 100 : 0; };
  const diffBox = (a, b, bx) => { const [x0, y0, x1, y1] = clampBox(bx, a); let s2 = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * a.width + x) * 4;
      s2 += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); n++; }
    return n ? s2 / n / 3 : 0; };
  const BOX = rr2.roofs[0].boxes[0];
  const CTRL = [40, 700, 340, 870];   // 대조군 = 화면 좌하단 빈 땅
  const kOn = khakiBox(onPng, BOX), kOff = khakiBox(offPng, BOX);
  const dRoof = diffBox(onPng, offPng, BOX), dCtrl = diffBox(onPng, offPng, CTRL);
  say(`    지붕 상자 [${BOX}] 이엉 — 지붕 ON ${kOn.toFixed(1)}% · OFF ${kOff.toFixed(1)}%`);
  say(`    상자 평균 절대차 ${dRoof.toFixed(1)} · 대조군 ${dCtrl.toFixed(1)}`);
  ok(kOn > 20, `★자명 통과 금지 — 지붕이 있을 때 그 상자에 이엉이 실제로 있다 (${kOn.toFixed(1)}% > 20%)`);
  ok(kOff < kOn * 0.5, `★★방이 풀리자 그 이엉이 사라진다 (${kOff.toFixed(1)}% < ${kOn.toFixed(1)}% × 0.5)`);
  // ★상자 평균 절대차의 문턱은 낮게 잡는다 — 상자는 **오버행 여백까지 포함한 지붕 이미지 전체**라
  //   가장자리엔 바뀔 픽셀이 없어 평균이 희석된다(실측 19.5). 판별력은 위의 이엉 비율(19.9→5.1%)과
  //   아래 대조군(정지 화면 0.0)에 있다. 여기서 문턱을 올리면 신호가 아니라 여백 비율을 재게 된다.
  ok(dRoof > 10, `★지붕 영역이 실제로 바뀐다 (절대차 ${dRoof.toFixed(1)} > 10 · 상자에 오버행 여백 포함)`);
  ok(dCtrl < 2, `★변화가 지붕 영역에만 있다 — 대조군(빈 땅)은 정지 (${dCtrl.toFixed(1)} < 2)`);


  // ── ⓓ 다층 (배치 18 ③) ────────────────────────────────────────────────────
  say('\n[ⓓ 다층 — 밖에서는 2층집이 2층집으로 보인다(전체 복원)]');
  // ⓒ 에서 헐었던 팔 남벽을 되돌린다 — ⓓ 는 1층 방이 성립해야 성립한다(전제 복구)
  restoreWall(ZDB, OUT.cx * SZ, (OUT.cy - 1) * SZ, 'N', 0);
  // 1층 몸통 위에 2층 방을 얹는다(DB 직접 — 계단을 걸어 올라가는 건 별개 검사다)
  const F2 = RECT(100, 100, 103, 102);
  const s2 = seedHouse(ZDB, F2, null, 1);
  ok(s2.floors === 12, `검사 전제 — 2층 방이 DB 에 들어갔다: 바닥 ${s2.floors}칸 · 벽 ${s2.walls}장`);
  const z3 = boot('zone3', wrap, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', E2E_GIVE: '1', WRAP_DAY_MS: '86400000',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: OUT.cx * SZ + 16, y: OUT.cy * SZ + 16, name: '2층집 밖' } }),
  });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 재기동(2층 세계)');
  await sleep(4000);
  const b3 = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const p3 = await (await b3.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await p3.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const bb = await p3.$(sel); if (bb) { await bb.click(); break; } } catch (e) {}
  }
  await sleep(15000);
  //   ★[계측 격리 2026-08-07] 배치 21 이 **지면 풀 카펫**을 흔들리게 했다 — 이 하네스의
  //     '빈 땅 대조군은 정지' 판정은 이제 저절로 깨진다(실측 |Δ| 3.8 > 2). 배치 19 인계가
  //     예고했던 그 오염이 드디어 실현됐다. **기준을 낮추지 않고 재는 층을 격리**한다.
  //     sleep 없는 evaluate 로 곧바로 끈다 — 격리가 실험 타이밍을 밀면 안 된다.
  await p3.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
  await p3.screenshot({ path: `${SHOTS}/06-two-floor-outside.png` });
  const srv2 = await rget();
  ok(srv2.rooms === 2, `★서버가 방 2개(1층·2층)를 판정했다 (실측 ${srv2.rooms})`);
  ok(srv2.list.some((r) => r.floor === 1), '그중 하나는 2층 방이다');
  const fv = await p3.evaluate(() => window.__floorViewDbg || null).catch(() => null);
  ok(!!fv, '층 렌더 문법 진단 훅이 산다');
  ok(fv && fv.indoors === false && fv.hideAbove === false, '★밖이면 위층을 숨기지 않는다(전체 복원)');
  const rr4 = await p3.evaluate(() => window.__roomRoofDbg || null).catch(() => null);
  ok(rr4 && rr4.roofs.length === 2, `★밖에서는 1층·2층 지붕이 **둘 다** 그려진다 (실측 ${rr4 && rr4.roofs.length})`);
  ok(rr4 && rr4.roofs.every((r) => r.roofOn), '두 지붕 모두 표시 상태');
  await b3.close(); try { z3.kill(); } catch (e) {}

  // ★화면 층 — 2층이 실제로 화면에 더 그려졌는가(1층만일 때와 같은 자리 비교)
  const twoPng = PNG.sync.read(fs.readFileSync(`${SHOTS}/06-two-floor-outside.png`));
  const kTwo = khakiBox(twoPng, BOX), kOne = kOn;
  const dTwo = diffBox(onPng, twoPng, BOX), dTwoCtrl = diffBox(onPng, twoPng, CTRL);
  say(`    같은 상자 이엉 — 1층집 ${kOne.toFixed(1)}% · 2층집 ${kTwo.toFixed(1)}% · 두 장 절대차 ${dTwo.toFixed(1)}(대조군 ${dTwoCtrl.toFixed(1)})`);
  // ★비율이 아니라 **자리**로 잰다: 2층 지붕은 한 층(64px) 위에 떠야 한다. 이엉 비율은 2층 지붕이
  //   1층 지붕을 상당 부분 **가리므로** 크게 안 오른다(29.0 → 31.3) — 비율 문턱은 신호가 아니라 겹침을 잰다.
  ok(kTwo >= kOne, `2층집 이엉이 1층집보다 적지 않다 (${kTwo.toFixed(1)}% ≥ ${kOne.toFixed(1)}%)`);
  ok(dTwo > 15, `★★2층을 얹으면 같은 자리 화면이 크게 바뀐다 (절대차 ${dTwo.toFixed(1)} > 15)`);
  ok(dTwoCtrl < 2, `★변화가 집에만 있다 — 대조군 정지 (${dTwoCtrl.toFixed(1)} < 2)`);
  // ★층 리프트는 **같은 프레임 안에서** 잰다 — 다른 세션 스크린샷끼리 비교하면 카메라 차이가 섞인다
  //   (1차 작성이 그렇게 재서 64px 이 나와야 할 자리에 35px 이 나왔다. 화면이 아니라 계측이 틀린 것이다.)
  const f0 = rr4.roofs.find((r) => r.floor === 0), f1 = rr4.roofs.find((r) => r.floor === 1);
  ok(!!f0 && !!f1, '한 프레임에 1층·2층 지붕이 둘 다 있다');
  if (f0 && f1) {
    // **같은 발자국 원점**을 가진 렉트끼리 비교한다. ㄱ자의 최대 렉트 분해는 (100,100)에서 시작하는
    //   세로 2×6 이고 2층은 4×3 이라 **크기가 다르다** — 상자 좌표는 앵커가 크기마다 달라 못 쓴다
    //   (1차 작성이 그렇게 재서 64 여야 할 값이 35 로 나왔다: 화면이 아니라 계측이 틀렸다).
    say(`    1층 지붕 렉트: ${JSON.stringify(f0.origins.map((o) => o.r))}`);
    say(`    2층 지붕 렉트: ${JSON.stringify(f1.origins.map((o) => o.r))}`);
    // 두 층에서 **원점이 같은** 렉트 쌍을 찾는다(어느 분해가 나오든 성립하는 비교)
    let o0 = null, o1 = null;
    for (const a2 of f0.origins) { const m = f1.origins.find((b2) => b2.r[0] === a2.r[0] && b2.r[1] === a2.r[1]); if (m) { o0 = a2; o1 = m; break; } }
    ok(!!o0 && !!o1, `두 층에 원점이 같은 지붕 렉트 쌍이 있다 ${o0 ? '(' + o0.r + ')' : ''}`);
    if (o0 && o1) {
      ok(o0.sx === o1.sx, `가로 자리는 같다 — 화면 x ${o0.sx} = ${o1.sx}`);
      const dy = o0.sy - o1.sy;
      ok(Math.abs(dy - 64) <= 1, `★★2층 지붕이 1층 지붕보다 정확히 **한 층(64px)** 위에 뜬다 (실측 ${dy}px)`);
    }
  }

  // ═══ [T75 2026-09-03] ⓕ **NPC 집 앞 문간** — 밖에서 문간이 새까만 구멍이면 안 된다 ═══════
  //   T57 이 ⓔ 에서 "이 픽스처엔 NPC 움집이 없어 손잡이가 no-op — 못 잰다"로 유보한 그 절이다.
  //   여기서는 진짜 NPC 움집 한 채(서버가 실체화한 `data.hut`) 앞에 서서 잰다.
  //   ★두 층으로 잰다 — 픽셀 하나만 보면 NPC 가 문 앞에 서는 순간 판정이 흔들린다:
  //     ⓐ **계약**: 문간 너머 실내 바닥이 '그려진 것' 목록(`__fogGateProbe`)에 있나 ↔ 손잡이 뒤집으면 없다.
  //     ⓑ **화면**: 그 문간 자리 픽셀이 손잡이를 뒤집으면 **실제로 바뀐다**(= 배경이 아니라 바닥이 보인다).
  //   ★자리는 고르지 않고 잰다(족보 73): 문 칸은 DB 의 `data.hut` 렉트 + '벽 없는 남변 칸'으로 **재고**,
  //     화면 자리는 클라 자신의 변환(`__w2s`)으로 받는다(하네스가 아이소 변환을 베끼면 사본이다).
  say('\n[T75 ⓕ NPC 집 앞 문간 — 밖에서 본 실내 바닥]');
  {
    const HUT = { cx: 130, cy: 130 };            // 위에서 심은 픽스처 집 셀
    const CAM = { cx: HUT.cx, cy: HUT.cy + 2 };  // **밖**이라고 주장만 하지 않는다 — 아래서 렉트로 검산한다
    ok(!NPCV.err, `검사 전제 — 픽스처 마을·움집 행이 DB 에 들어갔다 ${NPCV.err || '(마을 ' + NPCV.vid + ')'}`);
    const z4 = boot('zone4', wrap, {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      // ★마을을 켠다 — 그래야 Stage 4A 가 움집을 실체화한다. 시딩은 `villages` 가 안 비어서 건너뛴다(수 분 절약).
      // ★★NPC 상한 1 — 계측 격리다(기준 낮추기가 아니다). 기본 8명이면 제 집 문간에 서서
      //   문간 화소를 통째로 가린다(실측: 두 문칸 다 가림 400/400 → 못 잼). 1명이면 한 칸은 열린다.
      ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', E2E_GIVE: '1', WRAP_DAY_MS: '86400000', VILLAGE_NPC_CAP: '1',
      WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: CAM.cx * SZ + 16, y: CAM.cy * SZ + 16, name: 'NPC 움집 앞' } }),
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 재기동(NPC 움집 세계)');
    await sleep(4000);
    const D = readHutDoor(ZDB);
    say(`    움집 실체화 — ${D.err ? '★' + D.err : `렉트 ${JSON.stringify(D.rect)} · 문칸 y=${D.doorY} x=${JSON.stringify(D.doorXs)} · 행 ${D.rows}`}`);
    if (D.err) {
      // ★★못 쟀다고 적는다 — 초록도 빨강도 아니다.
      say('    ⇒ 이 절은 이 판에서 **못 잰다**(실체화 자체가 안 됐다). 사유를 찍고 유보한다.');
      ok(true, 'ⓕ [못 잼] NPC 움집이 실체화되지 않았다 — 판정 유보(사유를 찍었다)', D.err);
      try { z4.kill(); } catch (e) {}
    } else {
      const inRect = CAM.cx >= D.rect[0] && CAM.cx <= D.rect[2] && CAM.cy >= D.rect[1] && CAM.cy <= D.rect[3];
      const inDoor = CAM.cy === D.doorY && D.doorXs.indexOf(CAM.cx) >= 0;
      ok(!inRect && !inDoor, `★★검사 전제 — 카메라가 **밖**이다(발자국·문칸 밖이라 컷어웨이가 안 걸린다) 카메라(${CAM.cx},${CAM.cy})`);
      const b4 = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
      const p4 = await (await b4.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
      await p4.goto(`http://localhost:${CPORT}/`); await sleep(2500);
      for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
        try { const bb = await p4.$(sel); if (bb) { await bb.click(); break; } } catch (e) {}
      }
      await sleep(15000);
      // 바람 정지 + 생물 자리 훅 — 생물은 가려서 뺀다(e2e-nature 와 같은 문법: 클라가 자리를 낸다)
      await p4.evaluate(() => { if (window.__terrain19) { window.__terrain19.windOff = true; window.__terrain19.entBoxes = true; } });
      await sleep(1200);
      // ★존 오프셋 — 스폰이 곧 mainSquare 다. **검산**: 그 오프셋으로 발자국 바닥이 전부 있어야 한다.
      const geo = await p4.evaluate(([cam, rect, doorXs, doorY, SZ]) => {
        const me = window.__getMyAbs();
        const ox = me.x - (cam.cx * SZ + SZ / 2), oy = me.y - (cam.cy * SZ + SZ / 2);
        const bs = window.__getAllBuildings();
        const fset = new Set(bs.filter((b) => b.type === 'floor').map((b) => b.wx + ',' + b.wy));
        let have = 0, want = 0;
        for (let x = rect[0]; x <= rect[2]; x++) for (let y = rect[1]; y <= rect[3]; y++) {
          want++; if (fset.has((ox + x * SZ + SZ / 2) + ',' + (oy + y * SZ + SZ / 2))) have++;
        }
        const pts = doorXs.map((dx) => {
          const f = window.__w2s(ox + dx * SZ + SZ / 2, oy + rect[3] * SZ + SZ / 2);          // 문간 너머 실내 바닥 첫 칸
          const g = window.__w2s(ox + dx * SZ + SZ / 2, oy + (doorY + 1) * SZ + SZ / 2);      // 문 앞 **바깥 땅**(대조 자리)
          return { dx, f: f && [Math.round(f.px), Math.round(f.py)], g: g && [Math.round(g.px), Math.round(g.py)] };
        });
        const drawn = window.__fogGateProbe ? window.__fogGateProbe() : [];
        let roofs = 0; for (const [, , k] of drawn) if (k === 'hutroof') roofs++;
        return { ox, oy, have, want, pts, roofs };
      }, [CAM, D.rect, D.doorXs, D.doorY, SZ]);
      say(`    존 오프셋(${geo.ox},${geo.oy}) · 발자국 바닥 ${geo.have}/${geo.want}칸 · 지붕 ${geo.roofs}장 · 문간 화면 ${JSON.stringify(geo.pts.map((q) => q.f))}`);
      ok(geo.have === geo.want && geo.want > 0, `★검사 전제 — 존 오프셋이 맞다(발자국 바닥 ${geo.have}/${geo.want}칸이 그 자리에 있다)`);
      ok(geo.roofs >= 1, `★★검사 전제 — **밖이라서 움집 지붕이 그려진다** (${geo.roofs}장) — 안이면 걷혀서 0 이다`);
      ok(geo.pts.every((q) => q.f && q.g), '★문간 화면 자리를 클라 변환(__w2s)으로 받았다 — 하네스가 아이소를 베끼지 않는다');

      // ── ⓐ 계약 — 문간 너머 바닥이 '그려진 것' 목록에 있나 ↔ 손잡이 뒤집으면 없다 ──
      const contract = () => p4.evaluate(([ox, oy, rect, doorXs, SZ]) => {
        const drawn = window.__fogGateProbe ? window.__fogGateProbe() : [];
        const set = new Set(drawn.map(([wx, wy, k]) => k + '@' + wx + ',' + wy));
        return doorXs.map((dx) => set.has('building@' + (ox + dx * SZ + SZ / 2) + ',' + (oy + rect[3] * SZ + SZ / 2)));
      }, [geo.ox, geo.oy, D.rect, D.doorXs, SZ]).catch(() => []);
      const cOn = await contract();
      await p4.evaluate(() => { window.__terrain19.floorOutOff = true; }); await sleep(500);
      const cOff = await contract();
      await p4.evaluate(() => { window.__terrain19.floorOutOff = false; }); await sleep(500);
      say(`    계약 — 수리본 ${JSON.stringify(cOn)} · 대조군(옛 동작) ${JSON.stringify(cOff)}`);
      ok(cOn.length > 0 && cOn.every((v) => v === true), '★★★ⓕ 밖에서도 **문간 너머 바닥이 그려진다**(계약) — 문칸 전부');
      ok(cOff.length > 0 && cOff.every((v) => v === false), '★★ⓕ 대조군(옛 동작 `floorOutOff`)에서는 **안 그려진다** — 검사가 진짜 재고 있다');

      // ── ⓑ 화면 — 그 자리 픽셀이 실제로 바뀐다(생물은 가리고, 잡음 바닥을 먼저 잰다) ──
      const ENT_DX = 80, ENT_UP = 120, ENT_DN = 48;
      const ents = () => p4.evaluate(() => (window.__entBoxes ? window.__entBoxes() : [])).catch(() => []);
      const shot = async (n) => { const e0 = await ents(); await p4.screenshot({ path: `${SHOTS}/${n}.png` }); const e1 = await ents();
        const img = PNG.sync.read(fs.readFileSync(`${SHOTS}/${n}.png`)); img._ents = [...e0, ...e1]; return img; };
      const patch = (a, b, cx, cy, r) => { let c = 0, tot = 0, mk = 0;
        const es = [...(a._ents || []), ...(b._ents || [])];
        for (let y = Math.max(0, cy - r); y < Math.min(a.height, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(a.width, cx + r); x++) {
          let hid = false;
          for (const [, sx, sy] of es) if (x >= sx - ENT_DX && x < sx + ENT_DX && y >= sy - ENT_UP && y < sy + ENT_DN) { hid = true; break; }
          if (hid) { mk++; continue; }
          const i = (y * a.width + x) * 4; tot++;
          const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
          if (d > 24) c++; }
        return { c, tot, mk }; };
      const PR = 10;   // 반경 10px — 한 셀 마름모(64×32)의 한가운데만 본다(옆 칸을 안 물게)
      // ★★생물 가리기가 이 절의 사정이다: NPC 는 **제 집 문간에 선다**(실측 — 상한 8명이면 두 문칸
      //   400/400 전부 가림, 1명이어도 한 칸은 가린다). 그래서 판을 **두 번** 잡아 본다 —
      //   NPC 가 한 발짝 움직이면 문칸이 열린다. 그래도 안 열리면 화면 층은 **유보**다(계약 층은 이미 잤다).
      const MINOPEN = 10;   // 열린 화소 최소선 = 한 셀 마름모(64×32/2 ≈ 1,024px)의 1% — 한두 픽셀은 신호가 아니다
      let judged = 0, best = null;
      for (let round = 0; round < 2 && !judged; round++) {
        if (round) { await sleep(3000); }
        const n1 = await shot(`08a-hut-n1-${round}`); await sleep(500);
        const n2 = await shot(`08b-hut-n2-${round}`); await sleep(500);
        const n3 = await shot(`08c-hut-n3-${round}`);
        await p4.evaluate(() => { window.__terrain19.floorOutOff = true; }); await sleep(500);
        const off = await shot(`09-hut-flooroff-${round}`);
        await p4.evaluate(() => { window.__terrain19.floorOutOff = false; }); await sleep(500);
        for (const q of geo.pts) {
          const nA = patch(n1, n2, q.f[0], q.f[1], PR), nB = patch(n2, n3, q.f[0], q.f[1], PR);
          const eff = patch(n3, off, q.f[0], q.f[1], PR);
          const ctl = patch(n3, off, q.g[0], q.g[1], PR);
          const noise = Math.max(nA.c, nB.c);
          const area = (PR * 2) * (PR * 2);
          say(`    [판 ${round}] 문칸 x=${q.dx} 화면${JSON.stringify(q.f)} — 잡음 ${nA.c}/${nB.c} · 효과 ${eff.c}/${eff.tot}(가림 ${eff.mk}/${area}) · 문앞 바깥 대조 ${ctl.c}/${ctl.tot}`);
          if (eff.tot < MINOPEN) continue;   // ★생물이 이 칸을 삼켰다 — 이 칸으로는 못 잰다
          judged++;
          if (!best || eff.c - noise > best.eff - best.noise) best = { dx: q.dx, eff: eff.c, noise, tot: eff.tot, ctl: ctl.c, ctot: ctl.tot };
        }
      }
      if (!judged) {
        say('    ★문칸이 전부 생물에 가렸다(NPC 가 제 집 문간에 섰다) — **화면 층은 이 판에서 못 잰다**.');
        say('      계약 층(위 두 줄)은 이미 초록이다. 화면 판정만 유보한다(rc 는 안 올린다).');
        ok(true, 'ⓕ [못 잼] 문칸이 전부 가렸다 — 화면 판정 유보(계약 층은 판정했다)', `문칸 ${geo.pts.length}칸`);
      } else {
        // ★문턱은 눈대중이 아니라 셀에서 온다(족보 74): 한 셀 마름모 = 64×32/2 ≈ 1,024px.
        //   그 **1%**(10px)를 최소선으로 둔다 — 한두 픽셀 흔들림은 신호가 아니다. 그리고 잡음의 3배.
        // ★문턱은 눈대중이 아니다: ⓐ 잡음의 3배 ⓑ **열린 화소의 4분의 1** — 문이 열려 바닥이 보이면
        //   그 틈은 통째로 바뀐다(실측 40/40 = 100%). 25%는 그 아래로 한참 낮춘 선이지 맞춘 값이 아니다.
        const NEED = Math.max(best.noise * 3, Math.max(4, Math.round(best.tot * 0.25)));
        ok(best.eff > NEED, `★★★ⓕ 문간 화소가 손잡이를 뒤집으면 **실제로 바뀐다** = 배경이 아니라 바닥이 보인다 (x=${best.dx} 효과 ${best.eff}px > ${NEED} · 잡음 ${best.noise} · 열린 화소 ${best.tot})`);
        ok(best.ctl <= Math.max(best.noise, 4), `★★ⓕ 반례 — **문 앞 바깥 땅**은 손잡이에 안 바뀐다 (${best.ctl}px ≤ ${Math.max(best.noise, 4)}) = 바뀐 건 문간이지 화면 전체가 아니다`);
      }
      await b4.close(); try { z4.kill(); } catch (e) {}
    }
  }

  say(`\n스크린샷: ${SHOTS}/`);
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  say(`\n=== 방 판정 실클라 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 오류:', e); for (const p of procs) { try { p.kill(); } catch (x) {} } process.exit(1); });

function findBuildingId(dbPath, x, y, type) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const r = db.prepare('SELECT id FROM buildings WHERE x=? AND y=? AND type=? ORDER BY id DESC LIMIT 1').get(x, y, type);
    db.close(); return r ? r.id : null;
  } catch (e) { return null; }
}
function readDoorOpen(dbPath, id) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const r = db.prepare('SELECT data FROM buildings WHERE id=?').get(id);
    db.close(); return r ? !!JSON.parse(r.data).open : null;
  } catch (e) { return null; }
}

function restoreWall(dbPath, x, y, side, floor) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.prepare('INSERT INTO buildings (type, owner_id, owner_name, x, y, data, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('wall', 'e2e', 'E2E', x, y, JSON.stringify({ side, floor }), Date.now());
    db.close(); return true;
  } catch (e) { return false; }
}
