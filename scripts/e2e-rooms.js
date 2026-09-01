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
