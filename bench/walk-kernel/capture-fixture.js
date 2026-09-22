#!/usr/bin/env node
// === bench/walk-kernel/capture-fixture.js — T352 ③ 입력: 실부팅 주민 스냅샷 =====
//
// ⚠계측기다(러너 밖 · `@regress` 없음). **제품 코드 0 줄** — 존을 있는 그대로 띄우고
//   이미 있는 문(`observer` ws · `/perf`)으로 **읽기만** 한다.
//
// 무엇을 얼리나
//   ⓐ 주민 좌표 — 관측자 하나를 AOI(800px) 격자로 **훑어** 전 존의 개체를 모은다
//      (`visiblePlayers` 는 NPC 를 그대로 싣는다 — 안 싣는 것은 NPC 에게 **보내는** 쪽이다 · zone.js:12232).
//   ⓑ 지형 비트 — 주민 bbox 를 T333 문법(`terrain-tilecache` 32px 셀)으로 **정본 함수**에 물어 굽는다.
//   ⓒ 벽 격자·나무 — 존이 쓴 DB(`buildings`·`resources`)에서 그대로 읽는다.
//
// 실행: node bench/walk-kernel/capture-fixture.js [출력.json]
'use strict';
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { waitUp } = require(path.join(ROOT, 'scripts', 'fixture-boot.js'));
const OUT = process.argv[2] || path.join(__dirname, 'fixtures', 'npc-snapshot.json');
const CP = 3610, ZP = 3620, SECRET = 't352-' + Math.random().toString(36).slice(2);
const CDB = `/tmp/t352-c-${process.pid}.db`, ZDB = `/tmp/t352-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log('[fixture]', ...a);

const kids = [];
const boot = (file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env) }); kids.push(p); return p; };
const bye = () => { for (const k of kids) { try { k.kill(); } catch (e) {} } };

(async () => {
  const c = boot('central.js', { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET });
  await waitUp(c, /listening|Central|:\s*\d+/i, { name: 'central', capMs: 120000 });
  const z = boot('zone.js', { PORT: String(ZP), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: '600000', TERRAIN_TILE_CACHE: '1' });
  await waitUp(z, /마을 시뮬 준비|listening/i, { name: 'zone', capMs: 600000 });
  say('존 기동 — 주민이 걷기 시작할 시간을 준다');
  for (let i = 0; i < 400; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`); if (r.ok) break; } catch (e) {} await sleep(1000); }
  await sleep(45000);   // 직업 현장 캐시가 서고 실제로 걷는 첫 틱들

  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const ZONE = ZONES.hanbando;
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`);
  const seen = new Map();
  ws.on('error', (e) => say('ws err', e.message));
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type !== 'tick' || !Array.isArray(m.players)) return;
    for (const p of m.players) if (p && p.pid != null) seen.set(p.pid, { pid: p.pid, x: p.x, y: p.y, floor: p.floor | 0, vx: p.vx | 0, vy: p.vy | 0 });
  });
  await new Promise((r) => ws.on('open', r));
  // ── AOI 격자 훑기 — 반지름 800 이라 1,000px 간격이면 겹쳐 가며 전 존을 덮는다
  const STEP = 1000;
  let cells = 0;
  for (let y = STEP / 2; y < ZONE.zoneHeight; y += STEP) {
    for (let x = STEP / 2; x < ZONE.zoneWidth; x += STEP) {
      ws.send(JSON.stringify({ type: 'viewport_update', x, y }));
      cells++;
      await sleep(40);           // 틱 하나(33ms)보다 길게 — 그 자리의 tick 을 한 번은 받는다
    }
    if (y % (STEP * 20) < STEP) say(`훑는 중 y=${Math.round(y)} · 지금까지 ${seen.size}개체 · 격자 ${cells}칸`);
  }
  await sleep(500);
  try { ws.close(); } catch (e) {}
  say(`개체 ${seen.size}`);

  // ── 지형 비트 · 벽 · 나무 ────────────────────────────────────────────────
  const Terrain = require(path.join(ROOT, 'server', 'terrain'));
  if (Terrain.setZonesMeta) Terrain.setZonesMeta(ZONES);
  const npcs = [...seen.values()];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of npcs) { if (n.x < x0) x0 = n.x; if (n.y < y0) y0 = n.y; if (n.x > x1) x1 = n.x; if (n.y > y1) y1 = n.y; }
  const PAD = 2048;
  const tx0 = Math.max(0, Math.floor((x0 - PAD) / 32)), ty0 = Math.max(0, Math.floor((y0 - PAD) / 32));
  const tx1 = Math.min(Math.ceil(ZONE.zoneWidth / 32) - 1, Math.ceil((x1 + PAD) / 32));
  const ty1 = Math.min(Math.ceil(ZONE.zoneHeight / 32) - 1, Math.ceil((y1 + PAD) / 32));
  const W = tx1 - tx0 + 1, H = ty1 - ty0 + 1;
  say(`지형 비트 굽는 중 — ${W}×${H} = ${(W * H / 1e6).toFixed(2)}M 셀`);
  // ★정본 함수 그대로 — `zone.js` `isWaterTileLocal`/`isRockTileLocal` 이 묻는 그 점(셀 중심)을 그대로 묻는다
  const bits = new Uint8Array(W * H);
  const Z = 'hanbando';
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const px = tx * 32 + 16, py = ty * 32 + 16;
      let b = 0;
      try { if (Terrain.isWaterCellLocal(Z, px, py)) b |= 1; } catch (e) {}
      try { if (Terrain.isRockCellLocal(Z, px, py)) b |= 2; } catch (e) {}
      bits[(ty - ty0) * W + (tx - tx0)] = b;
    }
    if ((ty - ty0) % 200 === 0) say(`  지형 ${ty - ty0}/${H}`);
  }
  // 벽(건물 격자) · 나무(자원) — 존이 쓴 DB 에서
  const DB = require('node:sqlite');
  const db = new DB.DatabaseSync(ZDB, { readOnly: true });
  const q = (s) => { try { return db.prepare(s).all(); } catch (e) { return []; } };
  const walls = q(`SELECT type,x,y,data FROM buildings WHERE zone='hanbando' AND type IN ('wall','door','fence','stair')`)
    .map((r) => ({ t: r.type, x: r.x, y: r.y, d: r.data || null }));
  const trees = q(`SELECT type,x,y FROM resources WHERE zone='hanbando' AND type IN ('tree','rock','ore')`)
    .map((r) => ({ t: r.type, x: r.x, y: r.y }));
  db.close();

  const out = { at: new Date().toISOString(), zone: 'hanbando',
    zoneWidth: ZONE.zoneWidth, zoneHeight: ZONE.zoneHeight,
    npcs, nNpc: npcs.length,
    terrain: { tx0, ty0, W, H, bitsB64: Buffer.from(bits).toString('base64') },
    walls, trees, sweepCells: cells };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  say(`썼다 ${OUT} — 주민 ${npcs.length} · 지형 ${W}×${H} · 벽 ${walls.length} · 나무 ${trees.length} · ${(fs.statSync(OUT).size / 1e6).toFixed(1)}MB`);
  bye(); process.exit(0);
})().catch((e) => { console.error('실패:', e); bye(); process.exit(1); });
