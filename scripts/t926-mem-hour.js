#!/usr/bin/env node
// === scripts/t926-mem-hour.js — 클라 1시간 접속 메모리(T926) — 계측 자 · 러너 밖 ==========================================
//
//   `E2E_BROWSER`(scripts/e2e-browser.js — 기본 chromium · `webkit`)로 실클라 하나를 띄워 **고정 대본**을 --min 분(기본 60) 돌리고
//   --every 분(기본 5)마다 한 줄씩 적는다. 서버 = central + 한반도(마을 켬) + 닛폰(존 넘기 · 마을 끔) — 포트는 zone-config 그대로.
//
//   대본(한 바퀴 = --every 분 · 바퀴마다 같은 차례 · 자리는 모두 정본 술어로 고른다 — 손으로 고른 좌표 0):
//     ⓐ 걷기 — 머문 자리에서 키보드(e2e-zone-cross 문법)로 네모 두 바퀴(동 · 남 · 서 · 북 — 키 하나 6초)
//     ⓑ 워프 — 다시 가는 마을 넷(광산2 · 어촌1 · 광산4 · 광산7 — 바퀴마다 같다) + **처음 가는 들 넷**(존을 가로지르는 줄의 다음 넷 —
//        바퀴마다 새 자리 · x 는 존 왼쪽부터 1,300px 걸음 · y 는 존 가운데에서 가장 가까운 뭍) · 자리마다 12초
//     ⓒ 존 넘기 — 한반도 → 닛폰 경계를 걸어서 넘고(e2e-zone-cross ⓑ 와 같은 열린 줄 · 같은 키) 10초 머문 뒤 걸어서 되돌아온다
//     ⓓ 머물기 — 광산2 가운데에서 바퀴 끝까지
//   결정론 고정 — 해 몫 한낮(1초마다 다시 세움 · e2e-char3d `setDayU` 와 같은 식) · 비 0(`__rainForce`) · 바퀴 앞마다 몸 배고픔 · 목마름을 채움
//   (`__e2e_body` · E2E_GIVE 문 — 한 시간 동안 굶어 쓰러지면 대본이 갈린다).
//
//   적는 것(바퀴 끝마다 · `<tag>-samples.jsonl`):
//     · 프레임 — 그 바퀴 동안 rAF 사이(dt) 수 · p50 · p95 · 최대(페이지 안 rAF 고리 하나)
//     · 크롬 — CDP `Performance.getMetrics`(JS 힙 쓴 · 잡은 · DOM 노드 · 리스너 · 문서) GC 앞 · 강제 GC(`HeapProfiler.collectGarbage`) 뒤 + 프로세스 RSS(종류별)
//       · --snap 분(기본 5,60)에 힙 스냅샷(`<tag>-<분>m.heapsnapshot` — 비교는 scripts/t926-heapdiff.js)
//       · --mdump 면 memory-infra 덤프(프로세스마다 할당자 크기 — JS 힙 밖의 몫: 캔버스 · Skia · 파티션 · malloc)
//     · WebKit — 힙 API 가 없다 ⇒ 웹 프로세스 · UI 프로세스 RSS(ps)
//     · 둘 다 — 페이지 안 계수(이 자가 입장 앞에 거는 갈고리): DOM 노드 · DOM 캔버스 · addEventListener − removeEventListener(종류별) ·
//       만든 캔버스(document.createElement · OffscreenCanvas) · 살아 있는 캔버스 수 · 넓이(WeakRef) · 만든/살아 있는 Image ·
//       이름 있는 캐시(클라 전역 Map · Set) 크기 + 그 안 그림(캔버스 · 비트맵 · 이미지) 수 · 넓이 · 존 연결(`conns`)마다 Map · Set · 배열 길이 · 큰 배열 길이 ·
//       안개가 본 칸(`window._seenChunks` — 청크 수 · 칸 수)
//   손잡이(env)는 그대로 존에 건넨다 — 켬 · 끔 견줌은 같은 대본을 env 만 바꿔 두 번 돈다.
//   --terr 면 지형 칸 셈(`Terrain.isWaterCellLocal` · `isRockCellLocal` — 물 · 바위 칸 캐시에 없을 때만 불린다) 수와 시간을 바퀴마다 누적으로 적는다(`terr`).
//   ★[T970] --own 이면 바퀴 끝마다(크롬 = 강제 GC · memory-infra 덤프 뒤 · WebKit = 표본 뒤) 살아 있는 캔버스(갈고리가 WeakRef 로 쥔 것)를
//     **붙든 이름**으로 가른다(`own`) — 이름 = 클라 맨 위 바인딩(public/client/*.js 의 두 칸 들여쓰기 const · let · var — 이름 있는 캐시 · 배열이 먼저)
//     · window 칸 · DOM. 이름에서 Map(열쇠 · 값) · Set · 배열 · 객체 칸 · 2D/GL 문맥의 `.canvas` 를 깊이 --own-depth(기본 7)까지 따라가
//     처음 닿은 이름에 귀속한다(이름 차례 = 위 순서 · 앞 이름이 이긴다). 아무 이름에서도 안 닿은 것은 만든 곳(함수 둘 · `안<밖`) · 나이(만든 뒤 1분 ·
//     5분 · 그 위)로 센다. 함수 닫힘(클로저) 안에서만 붙든 것은 이 길로 안 보인다(그 몫은 "이름 없음" 에 남는다).
//   ★[T997] --peak 이면 입장 뒤 산 청크 캐시(`_mt3Chunk`) 갈고리를 건다(그림 무접촉 — 적기만 한다): 그 객체의 `clear` 를 감싸 부른 자리를 호출 더미로 가르고
//     (`_mt3Bake` = 260 상한 · `_mt3Collect` = 존 바뀜 · 그 밖) 비우기 앞 청크 수 · 띠 캔버스 장 수 · 넓이(같은 캔버스는 한 번)를 적고, 2초마다 같은 셈으로 최댓값을 든다.
//     바퀴 끝 표본에 `mtPeak`(그 바퀴 최대 넓이 · 청크 수 · 장 수 · 상한 비우기마다 [청크 · 장 · 넓이] · 존 바뀜 · 그 밖 비우기 수)을 싣고 비운다 — 바퀴 끝 표본(광산2 · 존 넘기 뒤)이 못 보는 바퀴 안 꼭대기.
// 실행: [E2E_BROWSER=webkit] node scripts/t926-mem-hour.js [--min 60] [--every 5] [--snap 5,60] [--mdump] [--terr] [--own] [--peak] [--first] [--out /tmp/t926] [--tag cr-off]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const CS = CH.CHUNK_SIZE;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MIN = +arg('--min', '60'), EVERY = +arg('--every', '5');
const OUT = arg('--out', '/tmp/t926'); fs.mkdirSync(OUT, { recursive: true });
const SNAPS = String(arg('--snap', '5,60')).split(',').filter(Boolean).map(Number).filter(Number.isFinite);   // [T970] `--snap none` = 스냅샷 없음
const MDUMP = process.argv.includes('--mdump');   // 크롬만 — 바퀴 끝마다 memory-infra 덤프(프로세스 · 할당자별 크기)
const TERR = process.argv.includes('--terr');     // 지형 칸 셈(`Terrain.isWaterCellLocal` · `isRockCellLocal` — 칸 캐시가 없을 때만 불린다)을 세고 잰다(T926 ② 켬이 더 하는 일)
const OWNF = process.argv.includes('--own');      // [T970] 살아 있는 캔버스를 붙든 이름으로 가른다(머리말 ★T970)
const PEAK = process.argv.includes('--peak');
const FIRST = process.argv.includes('--first');   // [T1014] 첫 접속 표(머리말 위 FIRSTHOOK)     // [T997] 바퀴 안 산 청크 캐시 꼭대기 · 상한 비우기(머리말 ★T997)
const OWN_DEPTH = +arg('--own-depth', '7');
const BR = require('./e2e-browser').which();
const TAG = arg('--tag', BR);
const CPORT = 3010;
const ZIDS = ['hanbando', 'nippon'];
const HB = ZONES.hanbando;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { killAll(); process.exit(143); });
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });

// ── 자리 — 정본 술어(terrain 물 · 바위 · chunk 시더 개체)로 고른다 ───────────────────────────────────────────
const W2L = (zid, wx, wy) => { const z = ZONES[zid]; return [wx - z.worldOffsetX, wy - (z.worldOffsetY || 0)]; };
const ownerAt = (wx, wy) => ZIDS.find((z) => { const Z = ZONES[z], x = wx - Z.worldOffsetX, y = wy - (Z.worldOffsetY || 0); return x >= 0 && y >= 0 && x < Z.zoneWidth && y < Z.zoneHeight; });
const blockedW = (wx, wy) => { const z = ownerAt(wx, wy); if (!z) return true; const [x, y] = W2L(z, wx, wy); return !!(T.isWaterCellLocal(z, x, y) || T.isRockCellLocal(z, x, y)); };
const _ent = new Map();
function entsOf(zid, cx, cy) {
  const k = `${zid}_${cx}_${cy}`; if (_ent.has(k)) return _ent.get(k);
  const Z = ZONES[zid]; let a = [];
  if (cx >= 0 && cy >= 0 && cx * CS < Z.zoneWidth && cy * CS < Z.zoneHeight) {
    try { a = (CH.generateChunkResources(zid, Z.biome, cx, cy, CS, null, 0) || []).concat(CH.overflowInto(zid, Z.biome, cx, cy, CS, null, 0) || []); } catch (e) { a = []; }
  }
  _ent.set(k, a); return a;
}
function entsInWorldBox(zid, x0, y0, x1, y1) {
  const Z = ZONES[zid], ox = Z.worldOffsetX, oy = Z.worldOffsetY || 0, out = [];
  for (let cy = Math.floor((y0 - oy) / CS); cy <= Math.floor((y1 - oy) / CS); cy++) for (let cx = Math.floor((x0 - ox) / CS); cx <= Math.floor((x1 - ox) / CS); cx++)
    for (const e of entsOf(zid, cx, cy)) { const ax = ox + e.x, ay = oy + e.y; if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) out.push(e); }
  return out;
}
// ⓒ 걸을 길 — e2e-zone-cross ⓑ `corridor(+1)` 와 같은 규칙(선 양쪽 360px 가 물 · 바위 · 개체 없이 열린 가로줄 · 존 가운데부터 512px 걸음)
const WALK = 360;
function corridorEast() {
  const seam = HB.worldOffsetX + HB.zoneWidth;
  for (let k = 0; k < 120; k++) {
    const ly = Math.floor(HB.zoneHeight / 2) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 512;
    const wy = (HB.worldOffsetY || 0) + ly;
    let clean = true;
    for (let x = seam - WALK - 64; x <= seam + WALK + 64 && clean; x += 16) for (let dy = -48; dy <= 48; dy += 16) if (blockedW(x, wy + dy)) { clean = false; break; }
    if (!clean) continue;
    for (const z of ['hanbando', 'nippon']) if (entsInWorldBox(z, seam - WALK - 96, wy - 80, seam + WALK + 96, wy + 80).length) clean = false;
    if (clean) return { seam, wy, from: seam - WALK, to: seam + WALK };
  }
  return null;
}
// ⓑ 처음 가는 들 — x = 존 왼쪽 4,000px 부터 1,300px 걸음(존 너비 안에서 돈다) · y = 존 가운데에서 512px 걸음으로 가장 가까운 뭍(3×3 칸이 다 뭍)
function exploreSpot(i) {
  const span = HB.zoneWidth - 8000, lx = 4000 + ((i * 1300) % span);
  for (let m = 0; m < 240; m++) {
    const ly = Math.floor(HB.zoneHeight / 2) + (m % 2 ? 1 : -1) * Math.ceil(m / 2) * 512;
    if (ly < 2000 || ly > HB.zoneHeight - 2000) continue;
    let ok = true;
    for (let dy = -32; dy <= 32 && ok; dy += 32) for (let dx = -32; dx <= 32; dx += 32) if (blockedW(HB.worldOffsetX + lx + dx, (HB.worldOffsetY || 0) + ly + dy)) { ok = false; break; }
    if (ok) return [lx, ly];
  }
  return null;
}

// ── 페이지 갈고리 — 입장 앞에 건다(두 브라우저 같은 길 · evaluate) ─────────────────────────────────────────
const INSTR = () => {
  if (window.__t926) return true;
  const M = window.__t926 = { addN: 0, remN: 0, byType: {}, cvN: 0, cvRefs: [], cvSite: {}, imgN: 0, imgRefs: [], fr: [], lastT: 0, cvMeta: new WeakMap() };
  //   캔버스를 만든 자리(부른 함수 이름 · 스택 둘째 줄) — 만든 수를 귀속한다
  const site = () => { const L = String(new Error().stack || '').split('\n'); const l = (/^Error/.test(L[0]) ? L[3] : L[2]) || ''; const m = l.match(/at (?:new )?([\w$.<>]+)/) || l.match(/^([\w$.<>]*)@/); return (m && m[1]) || '?'; };
  //   [T970] 만든 곳 함수 둘(`안<밖`) — 붙든 이름이 없는 캔버스를 가를 때 쓴다(만든 수 `cvSite` 는 종전 그대로 함수 하나)
  const site2 = () => { const L = String(new Error().stack || '').split('\n'); const b = /^Error/.test(L[0]) ? 3 : 2; const nm = (l) => { const m = (l || '').match(/at (?:new )?([\w$.<>]+)/) || (l || '').match(/^([\w$.<>]*)@/); return (m && m[1]) || '?'; }; return nm(L[b]) + '<' + nm(L[b + 1]); };
  const meta = (c) => { try { M.cvMeta.set(c, { s: site2(), t: performance.now() }); } catch (e) {} };
  const ET = EventTarget.prototype, _add = ET.addEventListener, _rem = ET.removeEventListener;
  ET.addEventListener = function (t, f, o) { M.addN++; M.byType[t] = (M.byType[t] || 0) + 1; return _add.call(this, t, f, o); };
  ET.removeEventListener = function (t, f, o) { M.remN++; M.byType[t] = (M.byType[t] || 0) - 1; return _rem.call(this, t, f, o); };
  const _ce = Document.prototype.createElement;
  Document.prototype.createElement = function (n, o) {
    const e = _ce.call(this, n, o); const t = String(n).toLowerCase();
    if (t === 'canvas') { M.cvN++; M.cvRefs.push(new WeakRef(e)); const k = site(); M.cvSite[k] = (M.cvSite[k] || 0) + 1; meta(e); } else if (t === 'img') { M.imgN++; M.imgRefs.push(new WeakRef(e)); }
    return e;
  };
  if (typeof OffscreenCanvas === 'function') { const OC = OffscreenCanvas; const W = function (w, h) { const c = new OC(w, h); M.cvN++; M.cvRefs.push(new WeakRef(c)); meta(c); return c; }; W.prototype = OC.prototype; window.OffscreenCanvas = W; }
  const OI = window.Image; const WI = function (w, h) { const i = arguments.length >= 2 ? new OI(w, h) : arguments.length === 1 ? new OI(w) : new OI(); M.imgN++; M.imgRefs.push(new WeakRef(i)); return i; };
  WI.prototype = OI.prototype; window.Image = WI;
  const loop = (t) => { if (M.lastT) M.fr.push(t - M.lastT); M.lastT = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return true;
};
// --terr — 지형 칸 셈 수 · 시간(두 브라우저 같은 식 · 감싼 함수만큼 느려진다 — 끔 · 켬 두 판 다 같은 갈고리)
const TERRHOOK = () => {
  if (window.__t926terr) return true;
  const C = window.__t926terr = { w: 0, r: 0, wMs: 0, rMs: 0 };
  const wrap = () => {
    const T = window.Terrain; if (!T || T.__t926w) return !!(T && T.__t926w);
    const one = (fn, k) => { const o = T[fn]; if (typeof o !== 'function') return; T[fn] = function () { const t0 = performance.now(); const r = o.apply(this, arguments); C[k]++; C[k + 'Ms'] += performance.now() - t0; return r; }; };
    one('isWaterCellLocal', 'w'); one('isRockCellLocal', 'r'); T.__t926w = true; return true;
  };
  if (!wrap()) { const id = setInterval(() => { if (wrap()) clearInterval(id); }, 100); }
  return true;
};
// 바퀴 끝마다 — 페이지 안 계수(두 브라우저 같은 식)
const CACHE_NAMES = ['_tintBlendCache', '_waterCellCache', '_terrainAppliedZones', '_streamZ', '_rockCellCache', '_groundTiles', '_shoreTiles', '_flowCellCache', '_flowCellOld',
  '_mtSegCache', '_mtDestroyed', '_mtChunk', '_mt3Chunk', '_mt3Dirty', '_mt3RockC', '_mt3Rock0C', '_mt3Jobs', '_mtTint', '_mtAlphaMap', '_natChunk', '_bridgeAbs', '_ditchAbs',
  '_roofBakeCache', '_roomRectCache', 'clWallCellMap', 'cellRoomCache', 'srvRooms', 'clFloorCellMap', 'clFenceCellMap', 'clMaxFloorMap', 'clStairCellCache',
  'speechBubbles', 'villageBubbles', 'evBriefedDay', 'conns', 'warBattles', 'downStates', '_centralWait', '_lastCloseAt', '_farStore', '_farSeenAt', '_spriteCache',
  '_charImg', '_charAnim', '_carriedBy', '_sfxBuf', '_sfxLive', '_sfxLoops', '_sfxLast', '_zmap', '_tiles', '_live', 'waterTiles', '_cellBk'];
const ARRAY_NAMES = ['chatLog', '_arrowFx', 'pendingInputs', '_mtSplitSegs', '_mtCutHold', '_natLastPr', '_gateDrawn', '_entBoxes', '_ntLines', '_sfxTap', 'hoverList', 'TREE_SPRITES'];
// [T997] 산 청크 캐시 갈고리 — 비우기 자리 · 꼭대기(머리말 ★T997)
const PEAKHOOK = () => {
  if (window.__t997pk) return true;
  if (typeof _mt3Chunk === 'undefined') return false;
  const P = window.__t997pk = { maxPx: 0, maxSize: 0, maxCv: 0, caps: [], zone: 0, other: 0 };
  const px = (m) => { const seen = new Set(); let t = 0; for (const a of m.values()) if (Array.isArray(a)) for (const sg of a) if (sg && sg.img && !seen.has(sg.img)) { seen.add(sg.img); t += sg.img.width * sg.img.height; } return [t, seen.size]; };
  const up = (m) => { const [t, n] = px(m); if (t > P.maxPx) P.maxPx = t; if (m.size > P.maxSize) P.maxSize = m.size; if (n > P.maxCv) P.maxCv = n; return [t, n]; };
  const C = _mt3Chunk;
  C.clear = function () {
    const st = String((new Error()).stack || ''); const src = /_mt3Bake/.test(st) ? 'cap' : /_mt3Collect/.test(st) ? 'zone' : 'other';
    const [t, n] = up(this); if (src === 'cap') P.caps.push([this.size, n, t]); else P[src]++;
    return Map.prototype.clear.call(this);
  };
  setInterval(() => { try { up(_mt3Chunk); } catch (e) {} }, 2000);
  return true;
};
// ★[T1014] --first — 첫 접속 표(제품 표시 없이 · 옛 트리에도 같은 자): "들어가기" 눌림(갈고리) → welcome 받음(소켓 onmessage 를 감싸 첫 welcome 의 처리 앞 · 뒤)
//   → 첫 그림(welcome 처리 뒤 첫 rAF 판의 끝 = 그다음 rAF 머리) → 첫 입력(그다음 rAF 머리) → 가라앉음(그 뒤 첫 rAF 간격 ≤ 50ms · 30초 안). rAF 고리는 이 갈고리 하나.
const FIRSTHOOK = () => {
  if (window.__t1014f) return true;
  const F = window.__t1014f = { click: null, wRx: null, wDone: null, raf: [] };
  const P = WebSocket.prototype, D = Object.getOwnPropertyDescriptor(P, 'onmessage');
  Object.defineProperty(P, 'onmessage', { configurable: true, enumerable: D.enumerable, get: D.get, set(fn) {
    if (typeof fn !== 'function') return D.set.call(this, fn);
    const w = function (ev) {
      const isW = F.wRx == null && typeof ev.data === 'string' && ev.data.slice(0, 200).indexOf('"type":"welcome"') >= 0;
      const t0 = performance.now();
      try { return fn.call(this, ev); } finally { if (isW && F.wRx == null) { F.wRx = t0; F.wDone = performance.now(); } }
    };
    D.set.call(this, w);
  } });
  const loop = () => { if (F.raf.length < 40000) F.raf.push(performance.now()); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const b = document.getElementById('enter'); if (b) b.addEventListener('click', () => { if (F.click == null) F.click = performance.now(); }, true);
  return true;
};
const FIRSTREAD = () => {
  const F = window.__t1014f; if (!F || F.click == null || F.wDone == null) return { ok: false, click: F && F.click, wRx: F && F.wRx };
  const R = F.raf, i0 = R.findIndex((t) => t > F.wDone); if (i0 < 0 || i0 + 2 >= R.length) return { ok: false, why: 'rAF 모자람' };
  const frame1 = R[i0 + 1], input = R[i0 + 2]; let settle = null;
  for (let i = i0 + 3; i < R.length; i++) { if (R[i] - F.click > 30000 + (input - F.click)) break; if (R[i] - R[i - 1] <= 50) { settle = R[i]; break; } }
  let ln = 0, lms = 0; for (let i = i0 + 3; i < R.length && (settle == null || R[i] <= settle); i++) { const dt = R[i] - R[i - 1]; if (dt > 50) { ln++; lms += dt - 16.7; } }
  const d = (a, b) => (a == null || b == null ? null : +(b - a).toFixed(0));
  return { ok: true, wait: d(F.click, F.wRx), wProc: d(F.wRx, F.wDone), firstDraw: d(F.click, frame1), firstInput: d(F.click, input), settle: d(F.click, settle), longN: ln, longMs: Math.round(lms) };
};
const SAMPLE = (names) => {
  const M = window.__t926; const out = {};
  const a = M.fr.splice(0); const s = a.slice().sort((x, y) => x - y);
  const q = (p) => (s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null);
  out.frame = { n: a.length, p50: q(0.5), p95: q(0.95), max: s.length ? +s[s.length - 1].toFixed(1) : null, sumMs: Math.round(a.reduce((x, y) => x + y, 0)),
    long50: a.filter((x) => x > 50).length, long100: a.filter((x) => x > 100).length, longMs: Math.round(a.filter((x) => x > 50).reduce((x, y) => x + y - 16.7, 0)) };   // [T1014] 긴 프레임(>50 · >100ms) 수 · 막은 ms
  out.dom = { nodes: document.getElementsByTagName('*').length, canvas: document.getElementsByTagName('canvas').length, img: document.images.length };
  out.lis = { add: M.addN, rem: M.remN, net: M.addN - M.remN, top: Object.entries(M.byType).sort((x, y) => y[1] - x[1]).slice(0, 8) };
  M.cvRefs = M.cvRefs.filter((r) => r.deref()); M.imgRefs = M.imgRefs.filter((r) => r.deref());
  let cvPx = 0; for (const r of M.cvRefs) { const c = r.deref(); if (c) cvPx += (c.width | 0) * (c.height | 0); }
  out.cv = { made: M.cvN, live: M.cvRefs.length, livePx: cvPx, imgMade: M.imgN, imgLive: M.imgRefs.length, site: Object.entries(M.cvSite).sort((x, y) => y[1] - x[1]).slice(0, 10) };
  const isPic = (v) => !!v && ((typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && v instanceof OffscreenCanvas)
    || (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && v instanceof HTMLImageElement));
  const pics = (v, d, acc, seen) => {
    if (!v || typeof v !== 'object' || d > 3 || seen.has(v)) return; seen.add(v);
    if (isPic(v)) { acc.n++; acc.px += (v.width | 0) * (v.height | 0); return; }
    if (Array.isArray(v)) { for (const x of v) pics(x, d + 1, acc, seen); return; }
    if (v instanceof Map) { for (const x of v.values()) pics(x, d + 1, acc, seen); return; }
    if (Object.getPrototypeOf(v) === Object.prototype) for (const k in v) pics(v[k], d + 1, acc, seen);
  };
  out.cache = {};
  for (const n of names.caches) {
    let v; try { v = (new Function('return ' + n))(); } catch (e) { continue; }
    if (!v || typeof v.size !== 'number') continue;
    const acc = { n: 0, px: 0 }, seen = new Set();
    if (v instanceof Map) for (const x of v.values()) pics(x, 0, acc, seen);
    out.cache[n] = [v.size, acc.n, acc.px];
  }
  out.arr = {};
  for (const n of names.arrays) { let v; try { v = (new Function('return ' + n))(); } catch (e) { continue; } if (Array.isArray(v)) out.arr[n] = v.length; }
  out.conns = {};
  try { for (const [zid, c] of conns) { const o = { role: c.role }; for (const k of Object.keys(c)) { const v = c[k]; if (v instanceof Map || v instanceof Set) o[k] = v.size; else if (Array.isArray(v)) o[k] = v.length; } out.conns[zid] = o; } } catch (e) {}
  out.notices = (window.__notices || []).length;
  try { const C = window.__t926terr; if (C) out.terr = { w: C.w, r: C.r, wMs: Math.round(C.wMs), rMs: Math.round(C.rMs) }; } catch (e) {}   // --terr 누적
  try { out.knob = { cellNear: (typeof uiCfg !== 'undefined' && uiCfg && 'cellNear' in uiCfg) ? uiCfg.cellNear : null }; } catch (e) {}   // [T926] 손잡이 welcome 값(★T936 뒤 기본 = true · `T926_CELL_NEAR=0` 이면 null · 칸 없음)
  try { out.knob.cutNear = ('cutNear' in uiCfg) ? uiCfg.cutNear : null; if (typeof _mtCutNearN !== 'undefined') out.knob.cutNearN = _mtCutNearN; if (typeof _mtCutHold !== 'undefined') out.knob.cutHold = _mtCutHold.length; } catch (e) {}   // [T970] 손잡이 welcome 값 · 놓은 띠 수 · 붙든 띠 수
  try { out.knob.mtNear = ('mtNear' in uiCfg) ? uiCfg.mtNear : null; if (typeof _mtNearJobN !== 'undefined') { out.knob.mtNearJobN = _mtNearJobN; out.knob.mtNearCvN = _mtNearCvN; }
    if (typeof _mt3Jobs !== 'undefined') out.knob.jobs = _mt3Jobs.size; if (typeof _mtMaskCv !== 'undefined') out.knob.boards = [_mtMaskCv ? _mtMaskCv.width * _mtMaskCv.height : 0, _mtStripCv ? _mtStripCv.width * _mtStripCv.height : 0]; } catch (e) {}   // [T981] 손잡이 welcome 값 · 버린 굽던 청크 · 되돌린 판 수 · 굽는 중 청크 수 · 가르기 판 둘 넓이
  try { const P = window.__t997pk; if (P) { out.mtPeak = { maxPx: P.maxPx, maxSize: P.maxSize, maxCv: P.maxCv, caps: P.caps.splice(0), zone: P.zone, other: P.other }; P.maxPx = P.maxSize = P.maxCv = 0; P.zone = P.other = 0; } } catch (e) {}   // [T997] --peak — 그 바퀴 산 청크 캐시 꼭대기 · 비우기
  try { if (typeof _cellBk !== 'undefined') { let w = 0, r = 0; for (const b of _cellBk.values()) { w += b.w.length; r += b.r.length; } out.knob.bk = { n: _cellBk.size, w, r }; } } catch (e) {}   // [T926] 켬 — 자리 칸 수 · 적힌 열쇠 수(물 · 바위)
  try { const sc = window._seenChunks; if (sc instanceof Map) { let cells = 0; for (const v of sc.values()) cells += (v && v.size) || 0; out.seen = { chunks: sc.size, cells }; } } catch (e) {}   // 안개가 본 칸(34-m-renderloop `window._seenChunks`)
  out.heap = (typeof performance !== 'undefined' && performance.memory) ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null;
  try { const p = window.__getSrvAbs ? window.__getSrvAbs() : null; out.pos = p ? [Math.round(p.x), Math.round(p.y)] : null; } catch (e) {}
  try { out.zone = window.__getPrimaryZoneId ? window.__getPrimaryZoneId() : null; } catch (e) {}
  return out;
};
// [T970] 클라 맨 위 바인딩 이름 — public/client/*.js 의 두 칸 들여쓰기 `const|let|var`(쪼갠 한 파일 · 맨 위 = 두 칸) · 깊이 0 쉼표로 가른 조각마다 맨 앞 이름
//   + 클라가 `window.X =` 로 거는 칸 이름. 이름 차례 = 이름 있는 캐시(CACHE_NAMES) → 배열(ARRAY_NAMES) → 나머지 바인딩(글자 차례) → window 칸(글자 차례).
function ownRoots() {
  const dir = path.join(ROOT, 'public', 'client'), top = new Set(), win = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const line of src.split('\n')) {
      const m = line.match(/^  (?:const|let|var)\s+(.*)$/);
      if (m) {
        let d = 0, cur = ''; const parts = [];
        for (const ch of m[1]) { if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; if (d === 0 && ch === ';') break; if (d === 0 && ch === ',') { parts.push(cur); cur = ''; } else cur += ch; }
        parts.push(cur);
        for (const p of parts) { const n = p.trim().match(/^([A-Za-z_$][\w$]*)\s*(=|$)/); if (n) top.add(n[1]); }
      }
      for (const w of line.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) win.add(w[1]);
    }
  }
  const first = CACHE_NAMES.concat(ARRAY_NAMES);
  const rest = [...top].filter((n) => !first.includes(n)).sort();
  return { names: first.concat(rest), win: [...win].filter((n) => !first.includes(n) && !top.has(n)).sort() };
}
const OWN = (a) => {
  const M = window.__t926; const t0 = performance.now();
  const live = []; for (const r of M.cvRefs) { const c = r.deref(); if (c) live.push(c); }
  const isCv = (v) => (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && v instanceof OffscreenCanvas);
  const ctxCv = (v) => { try { if ((typeof CanvasRenderingContext2D !== 'undefined' && v instanceof CanvasRenderingContext2D) || (typeof WebGLRenderingContext !== 'undefined' && v instanceof WebGLRenderingContext)
    || (typeof WebGL2RenderingContext !== 'undefined' && v instanceof WebGL2RenderingContext) || (typeof OffscreenCanvasRenderingContext2D !== 'undefined' && v instanceof OffscreenCanvasRenderingContext2D)) return v.canvas || null; } catch (e) {} return undefined; };
  const host = (v) => (typeof Node !== 'undefined' && v instanceof Node) || v === window || (typeof Window !== 'undefined' && v instanceof Window) || ArrayBuffer.isView(v) || v instanceof ArrayBuffer
    || (typeof WebSocket !== 'undefined' && v instanceof WebSocket) || v instanceof Promise || (typeof AudioNode !== 'undefined' && v instanceof AudioNode) || (typeof AudioBuffer !== 'undefined' && v instanceof AudioBuffer)
    || (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) || (typeof ImageData !== 'undefined' && v instanceof ImageData) || (typeof WeakRef !== 'undefined' && v instanceof WeakRef);
  const owner = new Map(), depthAt = new Map(); let visits = 0, budget = a.budget;
  const walk = (v, d, root) => {
    if (!v || (typeof v !== 'object' && typeof v !== 'function') || budget <= 0) return;
    if (typeof v === 'function') return;                       // 닫힘 안은 못 본다
    const pd = depthAt.get(v); if (pd !== undefined && pd <= d) return;
    depthAt.set(v, d); visits++; budget--;
    if (isCv(v)) { if (!owner.has(v)) owner.set(v, root); return; }
    const cc = ctxCv(v); if (cc !== undefined) { if (cc) walk(cc, d + 1, root); return; }
    if (d >= a.depth || host(v)) return;
    if (v instanceof Map) { for (const [k, x] of v) { if (k && typeof k === 'object') walk(k, d + 1, root); walk(x, d + 1, root); } return; }
    if (v instanceof Set || Array.isArray(v)) { for (const x of v) walk(x, d + 1, root); return; }
    if (v instanceof WeakMap || v instanceof WeakSet) return;
    let ks; try { ks = Object.keys(v); } catch (e) { return; }
    for (const k of ks) { let x; try { x = v[k]; } catch (e) { continue; } walk(x, d + 1, root); }
  };
  for (const c of document.getElementsByTagName('canvas')) if (!owner.has(c)) owner.set(c, '(DOM)');
  const miss = [];
  for (const n of a.names) { let v; try { v = (new Function('return ' + n))(); } catch (e) { miss.push(n); continue; } walk(v, 0, n); }
  for (const n of a.win) { let v; try { v = window[n]; } catch (e) { continue; } walk(v, 0, 'window.' + n); }
  const by = {}, unk = {}, now = performance.now();
  let px = 0;
  for (const c of live) {
    const p = (c.width | 0) * (c.height | 0); px += p;
    const o = owner.get(c);
    if (o) { const b = by[o] = by[o] || [0, 0]; b[0]++; b[1] += p; continue; }
    const m = M.cvMeta.get(c) || { s: '?', t: now }, age = (now - m.t) / 60000, u = unk[m.s] = unk[m.s] || [0, 0, 0, 0, 0];
    u[0]++; u[1] += p; u[age < 1 ? 2 : age < 5 ? 3 : 4]++;
  }
  const sum = (o) => Object.values(o).reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]);
  return { live: live.length, px, held: sum(by), unheld: sum(unk), by: Object.entries(by).sort((x, y) => y[1][1] - x[1][1]).map(([k, v]) => [k, v[0], v[1]]),
    unk: Object.entries(unk).sort((x, y) => y[1][1] - x[1][1]).map(([k, v]) => [k].concat(v)), visits, budgetLeft: budget, missN: miss.length, ms: Math.round(performance.now() - t0) };
};
// 프로세스 RSS(kB) — ps 한 번 · 종류별 합
function rss() {
  let txt = ''; try { txt = execFileSync('ps', ['-eo', 'pid=,rss=,args='], { encoding: 'utf8', maxBuffer: 16 << 20 }); } catch (e) { return null; }
  const o = {};
  for (const line of txt.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); if (!m) continue;
    const kb = +m[2], cmd = m[3]; let k = null;
    if (/WebKitWebProcess/.test(cmd)) k = 'wk.web'; else if (/WebKitGPUProcess/.test(cmd)) k = 'wk.gpu'; else if (/WebKitNetworkProcess/.test(cmd)) k = 'wk.net';
    else if (/MiniBrowser/.test(cmd)) k = 'wk.ui';
    else if (/\/chrome-linux\/chrome( |$)|headless_shell/.test(cmd)) { const t = (cmd.match(/--type=([a-z-]+)/) || [null, 'browser'])[1]; k = 'cr.' + t; }
    if (k) o[k] = (o[k] || 0) + kb;
  }
  return o;
}

// 크롬 memory-infra 덤프 — 프로세스(이름)마다 할당자 크기(MB · 깊이 둘까지 · 1MB 넘는 것)
async function memDump(cdp) {
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } } });
  const r = await cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' }).catch((e) => ({ success: false, err: String(e) }));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let txt = ''; for (;;) { const c = await cdp.send('IO.read', { handle: stream }); txt += c.base64Encoded ? Buffer.from(c.data, 'base64').toString('utf8') : c.data; if (c.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  let ev = []; try { const j = JSON.parse(txt); ev = Array.isArray(j) ? j : (j.traceEvents || []); } catch (e) { return { err: 'parse' }; }
  const pname = {}; for (const e of ev) if (e.ph === 'M' && e.name === 'process_name') pname[e.pid] = e.args && e.args.name;
  const out = {};
  for (const e of ev) {
    if (e.ph !== 'v' || !e.args || !e.args.dumps || !e.args.dumps.allocators) continue;
    const P = (pname[e.pid] || 'pid' + e.pid) + '#' + e.pid, A = e.args.dumps.allocators, o = out[P] = out[P] || {};
    for (const [name, d] of Object.entries(A)) {
      if (name.split('/').length > 2) continue;
      const sz = d && d.attrs && d.attrs.size ? parseInt(d.attrs.size.value, 16) : null;
      if (sz != null && sz >= 1048576) o[name] = +(sz / 1048576).toFixed(1);
    }
  }
  return { ok: r.success !== false, procs: out };
}

(async () => {
  const t00 = Date.now();
  console.log(`\n=== T926 클라 ${MIN}분 접속 메모리 — 브라우저 ${BR} · 바퀴 ${EVERY}분 · 스냅샷 ${BR === 'chromium' ? SNAPS.join(',') + '분' : '없음(WebKit)'} · 태그 ${TAG} ===`);
  const knobs = Object.keys(process.env).filter((k) => /^T9\d\d_/.test(k)).map((k) => `${k}=${process.env[k]}`);
  console.log(`  · env 손잡이: ${knobs.join(' ') || '(없음 — 기본)'}`);
  const CE = corridorEast();
  if (!CE) { console.log('걸을 길 없음'); process.exit(1); }
  console.log(`  · 존 넘기 길: 경계 ${CE.seam} · 한반도 로컬 y ${CE.wy - (HB.worldOffsetY || 0)} · ${CE.from} → ${CE.to}`);
  for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { console.log(`포트 ${port} 가 비어 있지 않다`); process.exit(1); }
  const DDIR = `/tmp/t926-${process.pid}`; fs.mkdirSync(DDIR, { recursive: true });
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' };
  const ups = {};
  for (const z of ZIDS) { const p = boot('zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${DDIR}/w-${z}.db`, ENABLE_VILLAGES: z === 'hanbando' ? '1' : '0' }, common)); ups[z] = FB.waitUp(p, /zone server up on/, { name: z, capMs: 600000 }); }
  const zu = {}; for (const z of ZIDS) zu[z] = await ups[z];
  console.log(`  · 기동 central ${cu.ok} · ${ZIDS.map((z) => `${z} ${zu[z].ok}`).join(' · ')} (${Math.round((Date.now() - t00) / 1000)}초)`);
  if (!cu.ok || !ZIDS.every((z) => zu[z].ok)) process.exit(1);

  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 200)); });
  const cdp = BR === 'chromium' ? await page.context().newCDPSession(page) : null;
  if (cdp) { await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable'); }
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  await page.evaluate(INSTR);
  if (FIRST) await page.evaluate(FIRSTHOOK);
  if (TERR) await page.evaluate(TERRHOOK);
  // 들어갈 존 = 한반도(로비 목록의 기본은 central 에 먼저 붙은 산 존이라 판마다 갈린다 — 같은 대본이려면 고른다)
  for (let i = 0; i < 120; i++) { const okz = await page.evaluate(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) { s.value = 'hanbando'; return true; } return false; }); if (okz) break; await sleep(500); }
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  let first = null;
  if (FIRST) { for (let i = 0; i < 120; i++) { first = await page.evaluate(FIRSTREAD); if (first.ok && first.settle != null) break; await sleep(500); } console.log(`  · [T1014] 첫 접속 ${JSON.stringify(first)}`); }
  await sleep(3000);
  const z0 = await page.evaluate(() => (window.__getPrimaryZoneId ? window.__getPrimaryZoneId() : null));
  if (z0 !== 'hanbando') { console.log(`입장 존이 ${z0} — 한반도가 아니다`); process.exit(1); }
  const welcome = await page.evaluate(() => { const o = {}; for (const k of Object.keys(uiCfg || {})) if (/^(waterHalf|mtReadPx|mtBand|t926|cutNear|mtNear)/.test(k)) o[k] = uiCfg[k]; return { ui: o, ua: navigator.userAgent }; });
  console.log(`  · welcome ${JSON.stringify(welcome)}`);
  if (PEAK) console.log(`  · [T997] 산 청크 캐시 갈고리 ${await page.evaluate(PEAKHOOK)}`);
  // 결정론 고정 — 비 0 · 해 몫 한낮(1초마다 다시 세움)
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    if (window.__rainForce) window.__rainForce({ precip: 0 });
    if (!window.__t926noon) window.__t926noon = setInterval(() => { try { if (!worldClock) return; const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs;
      const p = (((0.5 * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; } catch (e) {} }, 1000);
    return true;
  });
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { try { const db = new DatabaseSync(`${DDIR}/w-hanbando.db`); rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); db.close(); } catch (e) {} if (!rows.length) await sleep(1000); }
  const REVISIT = ['광산2', '어촌1', '광산4', '광산7'].map((n) => rows.find((r) => r.name === n)).filter(Boolean);
  const HOME = REVISIT[0];
  console.log(`  · 마을 ${rows.length}곳 · 다시 가는 마을 ${REVISIT.map((v) => v.name).join(' · ')}`);

  const srvAbs = () => page.evaluate(() => (window.__getSrvAbs ? window.__getSrvAbs() : null));
  const pz = () => page.evaluate(() => (window.__getPrimaryZoneId ? window.__getPrimaryZoneId() : null));
  const tp = (lx, ly) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [lx, ly]);
  // 한반도 로컬 px 로 워프 — 서버 권위 위치가 64px 안이면 닿음 · 막힌 칸이면 둘레(반경 8칸)를 가까운 칸부터(t912-shots 와 같은 식)
  const warpL = async (lx, ly) => {
    if ((await pz()) !== 'hanbando') return null;
    const ring = [[0, 0]]; for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
    for (const [dx, dy] of ring) {
      const x = lx + dx * 32, y = ly + dy * 32;
      await tp(x, y);
      for (let i = 0; i < 8; i++) { await sleep(700); const a = await srvAbs(); if (a && Math.hypot(a.x - (HB.worldOffsetX + x), a.y - ((HB.worldOffsetY || 0) + y)) <= 64) return [x, y]; }
    }
    return null;
  };
  const keyFor = (k) => k;
  const walkKeys = async (keys, ms) => { for (const k of keys) await page.keyboard.down(keyFor(k)); await sleep(ms); for (const k of keys) await page.keyboard.up(keyFor(k)); await sleep(300); };
  const walkTo = async (keys, zone, maxMs) => {
    for (const k of keys) await page.keyboard.down(keyFor(k));
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < maxMs) { await sleep(100); if ((await pz()) === zone) { if (++n > 20) break; } }
    for (const k of keys) await page.keyboard.up(keyFor(k));
    await sleep(800);
    return pz();
  };
  const feed = () => page.evaluate(() => { window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 100, quiet: true }); return true; });

  const OWNA = OWNF ? Object.assign(ownRoots(), { depth: OWN_DEPTH, budget: 5e6 }) : null;   // [T970] 붙든 이름 목록(바인딩 · window 칸)
  if (OWNA) console.log(`  · [T970] 붙든 이름 — 바인딩 ${OWNA.names.length} · window 칸 ${OWNA.win.length} · 깊이 ${OWN_DEPTH}`);
  const samples = [];
  const outF = path.join(OUT, `${TAG}-samples.jsonl`); fs.writeFileSync(outF, '');
  const tStart = Date.now();
  let lastCycleEnd = tStart;
  const sampleNow = async (k, note) => {
    const atMin = +((Date.now() - tStart) / 60000).toFixed(2);
    const S = await page.evaluate(SAMPLE, { caches: CACHE_NAMES, arrays: ARRAY_NAMES });
    const row = { k, atMin, note, ...S, rss: rss() };
    if (cdp) {
      const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      await cdp.send('HeapProfiler.collectGarbage');
      const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      if (MDUMP) { try { row.mdump = await memDump(cdp); } catch (e) { row.mdump = { err: String(e).slice(0, 120) }; } }
      if (OWNF) row.own = await page.evaluate(OWN, OWNA).catch((e) => ({ err: String(e).slice(0, 160) }));   // [T970] 강제 GC · 덤프 뒤
      row.cdp = { usedPre: m0.JSHeapUsedSize, totalPre: m0.JSHeapTotalSize, usedGC: m1.JSHeapUsedSize, totalGC: m1.JSHeapTotalSize, nodes: m1.Nodes, listeners: m1.JSEventListeners,
        docs: m1.Documents, frames: m1.Frames, layoutObjects: m1.LayoutObjects };
      if (SNAPS.some((m) => Math.abs(m - k * EVERY) < 1e-6)) {
        const f = path.join(OUT, `${TAG}-${k * EVERY}m.heapsnapshot`); const ws = fs.createWriteStream(f);
        const onChunk = (e) => ws.write(e.chunk); cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
        const t1 = Date.now(); await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }); cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
        await new Promise((r) => ws.end(r));
        row.snap = { file: f, bytes: fs.statSync(f).size, ms: Date.now() - t1 };
      }
    } else if (OWNF) row.own = await page.evaluate(OWN, OWNA).catch((e) => ({ err: String(e).slice(0, 160) }));   // [T970] WebKit — 강제 GC 길 없음(표본 뒤 그대로)
    samples.push(row); fs.appendFileSync(outF, JSON.stringify(row) + '\n');
    const mb = (b) => (b == null ? '-' : (b / 1048576).toFixed(1));
    const big = Object.entries(row.cache).filter(([, v]) => v[0] > 0).sort((x, y) => (y[1][2] - x[1][2]) || (y[1][0] - x[1][0])).slice(0, 6).map(([n, v]) => `${n} ${v[0]}${v[1] ? `/${v[1]}장 ${(v[2] / 1e6).toFixed(1)}M화소` : ''}`).join(' · ');
    console.log(`  [${String(k).padStart(2)}] ${atMin}분 · ${row.zone} · 프레임 ${row.frame.n}판 p50 ${row.frame.p50} p95 ${row.frame.p95} max ${row.frame.max} · >50ms ${row.frame.long50}판 ${row.frame.longMs}ms · ` +
      (row.cdp ? `힙 ${mb(row.cdp.usedPre)}→GC ${mb(row.cdp.usedGC)}MB · 노드 ${row.cdp.nodes} · 리스너 ${row.cdp.listeners} · ` : '') +
      `DOM ${row.dom.nodes} · 리스너(갈고리) ${row.lis.net} · 캔버스 만든 ${row.cv.made} 산 ${row.cv.live} ${(row.cv.livePx / 1e6).toFixed(1)}M화소 · RSS ${JSON.stringify(row.rss)}${row.snap ? ` · 스냅샷 ${mb(row.snap.bytes)}MB ${row.snap.ms}ms` : ''}`);
    console.log(`       캐시: ${big}`);
    if (row.mtPeak) { const P = row.mtPeak; console.log(`       [T997] 바퀴 안 산 청크 캐시 꼭대기 ${P.maxSize}청크 · ${P.maxCv}장 · ${(P.maxPx / 1e6).toFixed(1)}M화소 · 상한 비우기 ${P.caps.length}${P.caps.length ? ' [' + P.caps.map((c) => `${c[0]}청크 ${c[1]}장 ${(c[2] / 1e6).toFixed(1)}M`).join(' · ') + ']' : ''} · 존 바뀜 ${P.zone} · 그 밖 ${P.other}`); }
    if (row.own) {
      const O = row.own, M6 = (v) => (v / 1e6).toFixed(2);
      if (O.err) console.log(`       붙든 이름: 실패 ${O.err}`);
      else console.log(`       붙든 이름(산 ${O.live}장 ${M6(O.px)}M화소 · 이름 ${O.held[0]}장 ${M6(O.held[1])} · 이름 없음 ${O.unheld[0]}장 ${M6(O.unheld[1])} · ${O.ms}ms · 방문 ${O.visits}): ` +
        O.by.slice(0, 8).map((b) => `${b[0]} ${b[1]}/${M6(b[2])}`).join(' · ') + (O.unk.length ? ` ‖ 없음: ${O.unk.slice(0, 4).map((u) => `${u[0]} ${u[1]}/${M6(u[2])}(1분 ${u[3]}·5분 ${u[4]}·그 위 ${u[5]})`).join(' · ')}` : ''));
    }
  };
  await feed();
  await warpL(HOME.cx * 32 + 16, HOME.cy * 32 + 16); await sleep(5000);
  await sampleNow(0, '입장 · 광산2');
  const cycles = Math.round(MIN / EVERY);
  let ex = 0;
  for (let k = 1; k <= cycles; k++) {
    const tEnd = tStart + k * EVERY * 60000;
    const log = [];
    await feed();
    // ⓐ 걷기 — 네모 두 바퀴
    for (let r = 0; r < 2; r++) for (const key of ['d', 's', 'a', 'w']) await walkKeys([key], 6000);
    log.push('걷기');
    // ⓑ 워프 — 다시 가는 마을 넷 + 처음 가는 들 넷
    const tour = [];
    for (const v of REVISIT) tour.push([v.name, v.cx * 32 + 16, v.cy * 32 + 16]);
    for (let j = 0; j < 4; j++, ex++) { const s = exploreSpot(ex); if (s) tour.push([`들${ex}`, s[0], s[1]]); }
    let got = 0; for (const [nm, x, y] of tour) { if (await warpL(x, y)) got++; await sleep(12000); }
    log.push(`워프 ${got}/${tour.length}`);
    // ⓒ 존 넘기 — 경계 서쪽 360px 에서 걸어서 닛폰으로 · 10초 · 걸어서 되돌아옴
    const [fx, fy] = W2L('hanbando', CE.from, CE.wy);
    let cross = '-';
    if (await warpL(fx, fy)) {
      await sleep(2500);
      const z1 = await walkTo(['s', 'd'], 'nippon', 45000); await sleep(10000);
      const z2 = await walkTo(['w', 'a'], 'hanbando', 45000);
      cross = `${z1} → ${z2}`;
    }
    log.push(`넘기 ${cross}`);
    // ⓓ 머물기 — 광산2 가운데에서 바퀴 끝까지
    if ((await pz()) !== 'hanbando') { await walkTo(['w', 'a'], 'hanbando', 45000); }
    await warpL(HOME.cx * 32 + 16, HOME.cy * 32 + 16);
    const left = tEnd - Date.now(); if (left > 0) await sleep(left);
    await sampleNow(k, log.join(' · ') + (left < 0 ? ` · ⚠바퀴가 ${Math.round(-left / 1000)}초 늦었다` : ''));
  }
  const res = { tag: TAG, browser: BR, min: MIN, every: EVERY, knobs, welcome, corridor: CE, errs, samples: samples.length, first };
  fs.writeFileSync(path.join(OUT, `${TAG}-meta.json`), JSON.stringify(res, null, 1));
  console.log(`  · 오류 ${errs.length}: ${JSON.stringify(errs.slice(0, 8))}`);
  console.log(`  → ${outF}`);
  await browser.close(); killAll(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); killAll(); process.exit(1); });
