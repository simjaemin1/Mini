#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T602 ③ 계측기 · 제품 무변)
// === scripts/t602-windows.js — 큰 종 창: 하한 90ms 에 붙는 종이 **실제로 놓치기만 하나** 표 (T602 ③ · T593 회부 2) =========
//
// ★무엇을 재나 — 종마다 서버가 정하는 그 물고기의 계획 무게와 챔질 창(`Fishing.plan` 정본 그대로)을, 그 종이 실제로 무는
//   실지도 자리(존 `_castTargetFor` 가 고른 자리 · 그 자리 풀은 존 `_t593Pool` 이 한 해 열두 달 동안 내는 종)에서 뽑는다.
//   놓침율은 사람 반사신경이 변수라 **반응시간 축**으로 낸다 — `fish-metrics.js` 의 축(200/300/400/500ms · 재민 08-26 대리 지표)과
//   같은 판정: 창 + 레이턴시 여유(`WIN_LAT_MS`) < 반응 이면 놓친다.
// ★팔(새 수 0 — 전부 이미 있는 표의 수):
//   main  T593 기본 — 바다 종 kg 앵커 = 무게 정본(`weights.kgOf` · T593 표) · 민물 = `freshfish` kg
//   T602  이 가지 기본 — 바다 종 kg 앵커 = T592 보통 구간 중앙(`seafish` 표) · 민물 그대로
//   KG=0  `T593_KG=0` — 앵커 없음(전체 중앙값 `SIZE_MU` · 종과 무관)
//   상한ⓐ 카드 "지금 창 식 그대로 · kg 상한만 종 표에서"의 한 읽기 — 꼬리 절단 `SIZE_MAX`(12kg) 자리에 T592 "큰 것" kg(있는 종만)
//   상한ⓑ 같은 문장의 다른 읽기 — 그 자리에 T592 "보통" 구간의 위 끝
//   (두 상한은 이 표에서만 잰다 — 서버 코드엔 없다 · 고른 쪽이 생기면 `plan` 한 줄)
// 실행: node scripts/t602-windows.js [--md] [--json 파일]   (존: ZONE_ID=nippon)
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const ZID = process.env.ZONE_ID || 'hanbando';
const TMP = `/tmp/t602-win-${process.pid}.db`;
process.env.ZONE_ID = ZID; process.env.PORT = String(42000 + (process.pid % 800)); process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.FISH_TICK_MS = '999000';
if (process.env.T602_NEW_FISH == null) process.env.T602_NEW_FISH = '1';   // 새 어종 일곱도 줄로 낸다(그 종의 자리만 — 다른 종은 무변)
const MD = process.argv.includes('--md');
const JI = process.argv.indexOf('--json'), JOUT = JI > 0 ? process.argv[JI + 1] : null;
const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l;
const H = Zone.__testBind();
const F = H.Fishing, ZONE = H.ZONE, SZ = 32;
const Sea = require(path.join(ROOT, 'server', 'seafish.js'));
const Fresh = require(path.join(ROOT, 'server', 'freshfish.js'));
const W = require(path.join(ROOT, 'server', 'weights.js'));
const Cal = require(path.join(ROOT, 'server', 'calendar.js'));
const mk = (x, y) => ({ pid: 'w', playerId: 't602w', name: 'w', persistent: false, x, y, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
  inventory: {}, toolItems: [], equipment: [], equipSlots: {}, isDown: false, ws: { readyState: 1, send: () => {} } });

// ── 자리 — 해안 물가(바다 칸 곁 뭍) · 강가 · 호숫가에서 서버가 고르는 던질 자리 ─────────────────────────────
const stands = [];
{ // 해안 — 정본 해안선 집합(`WATER_TILES`)의 바다 칸 곁 뭍 칸
  const Wt = H.WATER_TILES, seen = new Set(); let n = 0;
  const each = (fn) => { if (typeof Wt.forEachTile === 'function') Wt.forEachTile(fn); else for (const k of Wt) { const [a, b] = k.split('_').map(Number); fn(a, b); } };
  each((tx, ty) => {
    if ((n++ % 13) || stands.length >= 600) return;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = (tx + dx) * SZ + SZ / 2, ly = (ty + dy) * SZ + SZ / 2, k = lx + ',' + ly;
      if (seen.has(k) || lx < 0 || ly < 0 || lx >= ZONE.zoneWidth || ly >= ZONE.zoneHeight) continue;
      if (H.isWaterTileLocal(lx, ly) || H.isRockTileLocal(lx, ly)) continue;
      seen.add(k); stands.push([lx, ly]); break;
    }
  });
}
{ // 강·호수 — 물 칸 둘레 뭍(격자 훑기)
  let k = 0;
  for (let y = 0; y < ZONE.zoneHeight && k < 900; y += 517) for (let x = 0; x < ZONE.zoneWidth && k < 900; x += 517) {
    if (!H.isWaterTileLocal(x, y) || H.isSeaTileLocal(x, y)) continue;
    for (const [dx, dy] of [[64, 0], [-64, 0], [0, 64], [0, -64]]) {
      const bx = x + dx, by = y + dy;
      if (H.isWaterTileLocal(bx, by) || H.isRockTileLocal(bx, by)) continue;
      stands.push([bx, by]); k++; break;
    }
  }
}
const MONTH_DAYS = []; for (let m = 1; m <= 12; m++) MONTH_DAYS.push(Cal.dayOf(1, m, 15));
const spots = [];   // { sp, x, y, cand: Set(종) }
for (const [x, y] of stands) {
  const tg = H._castTargetFor(mk(x, y)); if (!tg) continue;
  const cand = new Set();
  for (const d of MONTH_DAYS) for (const s of H._t593Pool(tg.sp, d, tg.x, tg.y)) cand.add(s.id);
  spots.push({ sp: tg.sp, x: tg.x, y: tg.y, cand, water: tg.sp.kind === 'sea' ? 'sea' : (tg.sp.kind === 'lake' || tg.sp.kind === 'mouth' ? 'lake' : (tg.sp.estuary ? 'lower' : 'mid')) });
}

// ── 팔 ──────────────────────────────────────────────────────────────────────────────────────────
const REACT = [200, 300, 400, 500];
const WMIN = F.CFG.WIN_MIN_MS, LAT = F.CFG.WIN_LAT_MS;
const isSea = (id) => !!Sea.rowOf(id) && Sea.isFish(id);
const mid = (r) => (r && r.kg ? (r.kg[0] + r.kg[1]) / 2 : null);
function armsOf(id) {
  const r = Sea.rowOf(id);
  if (isSea(id)) {
    const main = r.isNew ? null : (W.kgOf(id) || null);   // T593 = 무게 정본(새 어종은 main 에 없다)
    return { main: main ? { kg0: main } : null, t602: { kg0: mid(r) }, kg0: { kg0: undefined },
      capBig: r.big ? { kg0: mid(r), cap: r.big } : null, capHi: { kg0: mid(r), cap: r.kg[1] } };
  }
  const k = Fresh.kgOf(id);
  return { main: { kg0: k }, t602: { kg0: k }, kg0: { kg0: undefined }, capBig: null, capHi: null };   // 민물 상한 칸 없음(T603 몫)
}
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function sample(spl, arm, n) {
  const rng = lcg(20260826), win = [], kgs = [];
  for (let i = 0; i < n; i++) {
    const s = spl[i % spl.length];
    const p = F.plan(s.sp, 1, 0, rng, arm.kg0);
    const kg = arm.cap ? Math.min(arm.cap, p.kg) : p.kg;
    win.push(arm.cap ? F.windowMsFor(kg) : p.windowMs); kgs.push(kg);
  }
  const ws = win.slice().sort((a, b) => a - b), ks = kgs.slice().sort((a, b) => a - b);
  return {
    winMed: ws[Math.floor(n / 2)], kgMed: +ks[Math.floor(n / 2)].toFixed(3),
    floor: +(ws.filter((w) => w <= WMIN).length / n * 100).toFixed(1),
    miss: REACT.map((r) => +(ws.filter((w) => w + LAT < r).length / n * 100).toFixed(1)),
  };
}
const ids = [...new Set(spots.flatMap((s) => [...s.cand]))];
const order = (id) => (isSea(id) ? 0 : 1);
ids.sort((a, b) => order(a) - order(b) || (Sea.kgOf(a) || Fresh.kgOf(a)) - (Sea.kgOf(b) || Fresh.kgOf(b)));
const N = 4000, rows = [];
// T593 해안 표에 있었는데 T602 해안 표에서 빠진 종(배 필요 — 명태·대구) — main 팔만(그때 그 자리 = 바다 자리 전부)
const gone = Sea.T593_IDS.filter((id) => !Sea.isFish(id));
for (const id of gone) {
  const spl = spots.filter((s) => s.water === 'sea'); if (!spl.length) continue;
  const out = { id, ko: (Sea.rowOf(id) && require(path.join(ROOT, 'server', 'specialty.js')).RESOURCES[id].ko) || id, sea: true, gone: true, spots: spl.length, waters: 'sea(main)' };
  out.main = Object.assign({ kg0: W.kgOf(id), cap: null }, sample(spl, { kg0: W.kgOf(id) }, N));
  out.t602 = null; out.kg0 = null; out.capBig = null; out.capHi = null;
  rows.push(out);
}
for (const id of ids) {
  const spl = spots.filter((s) => s.cand.has(id)); if (!spl.length) continue;
  const A = armsOf(id), out = { id, ko: isSea(id) ? Sea.koOf(id) : Fresh.koOf(id), sea: isSea(id), spots: spl.length, waters: [...new Set(spl.map((s) => s.water))].join('·') };
  for (const k of Object.keys(A)) out[k] = A[k] ? Object.assign({ kg0: A[k].kg0 == null ? null : +(+A[k].kg0).toFixed(4), cap: A[k].cap || null }, sample(spl, A[k], N)) : null;
  rows.push(out);
}
const meta = { zone: ZID, stands: stands.length, spots: spots.length, bySea: spots.filter((s) => s.water === 'sea').length, N, react: REACT, winMin: WMIN, lat: LAT,
  winAt1kg: F.CFG.WIN_AT_1KG, winPow: F.CFG.WIN_POW, sizeMax: F.CFG.SIZE_MAX, sigma: F.CFG.SIZE_SIGMA };
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ meta, rows }, null, 1));
const f = (x) => (x == null ? '—' : String(x));
if (MD) {
  console.log(`#### ${ZID} — 자리 ${meta.spots}(바다 ${meta.bySea}) · 종마다 ${N}번 · 창 = ${meta.winAt1kg} × kg^−${meta.winPow} ∈ [${WMIN}, ${F.CFG.WIN_BASE_MS}]ms · 놓침 = 창 + ${LAT}ms < 반응\n`);
  console.log('| 종 | 물 | kg 앵커 main → T602 | 창 중앙 ms main · **T602** · KG=0 | 하한 붙음 % main · **T602** · KG=0 | T602 놓침 % @200 · 300 · 400 · 500ms | 상한ⓐ 큰 것 · 상한ⓑ 보통 위 끝 — 창 중앙 · 하한 % |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const cap = (a) => (a ? `${a.cap}kg → ${a.winMed} · ${a.floor}%` : '—');
    if (r.gone) { console.log(`| ${r.ko} | 바다 | ${f(r.main.kg0)} → **해안 표 밖(배 필요)** | ${r.main.winMed} · — · — | ${r.main.floor} · — · — | (main ${r.main.miss.join(' · ')}) | — |`); continue; }
    console.log(`| ${r.ko} | ${r.waters} | ${r.main ? f(r.main.kg0) : '—'} → **${f(r.t602.kg0)}** | ${r.main ? r.main.winMed : '—'} · **${r.t602.winMed}** · ${r.kg0.winMed} | ${r.main ? r.main.floor : '—'} · **${r.t602.floor}** · ${r.kg0.floor} | ${r.t602.miss.join(' · ')} | ${cap(r.capBig)} / ${cap(r.capHi)} |`);
  }
} else {
  console.log(JSON.stringify(meta));
  for (const r of rows) console.log(JSON.stringify(r));
}
for (const p of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(p); } catch (e) {} }
process.exit(0);
