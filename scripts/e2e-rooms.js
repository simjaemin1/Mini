#!/usr/bin/env node
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
  fs.writeFileSync('/tmp/zone-wrap-rooms.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID=process.env.ZONE_ID||'hanbando';
try{const patch=JSON.parse(process.env.WRAP_ZONE_PATCH||'{}');Object.assign(cfg.ZONES[ZID],patch);
console.log('[wrap] '+ZID+' 덮어쓰기: '+JSON.stringify(patch));}catch(e){}
require(path.join(ROOT,'server','zone.js'));`);
  return '/tmp/zone-wrap-rooms.js';
}

// ── DB 에 ㄱ자 집을 미리 짓는다 (플레이어 소유 · 마을 태그 없음) ─────────────
//   벽은 '바깥과 맞닿은 변'에만 — 사람이 짓는 방식과 같다(test-rooms.js encloseCells 와 동형).
const SZ = 32;
const RECT = (x0, y0, x1, y1) => { const o = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) o.push([x, y]); return o; };
function seedHouse(dbPath, cells, doorAt) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  const now = Date.now();
  const ins = db.prepare('INSERT INTO buildings (type, owner_id, owner_name, x, y, data, created_at) VALUES (?,?,?,?,?,?,?)');
  const S = new Set(cells.map(([x, y]) => `${x},${y}`));
  let nf = 0, nw = 0;
  for (const [x, y] of cells) { ins.run('floor', 'e2e', 'E2E', x * SZ, y * SZ, JSON.stringify({ floor: 0 }), now); nf++; }
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
      JSON.stringify(isDoor ? { side: s, floor: 0, open: true } : { side: s, floor: 0 }), now);
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
  ok(seeded.floors === 18, `★검사 전제 — ㄱ자 집이 DB 에 실제로 들어갔다: 바닥 ${seeded.floors}칸`);
  ok(seeded.walls >= 18, `검사 전제 — 둘레 벽/문 ${seeded.walls}장`);

  // ── ⓐ 부팅 경로 ────────────────────────────────────────────────────────────
  say('\n[ⓐ 부팅 — DB → 청크 활성화 → welcome → 클라]');
  const z = boot('zone', wrap, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', E2E_GIVE: '1',
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

  await browser.close();
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
