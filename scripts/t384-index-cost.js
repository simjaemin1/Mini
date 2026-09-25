#!/usr/bin/env node
// === scripts/t384-index-cost.js — 색인 문 17.8ms 해부 (T384 ③) ===================
//
// ★계측기다 — 러너 밖(`@regress` 표 없음) · `server/` 는 **읽기만** 한다(술어를 감쌀 뿐 · 파일 무접촉).
//
// ★무엇을 재나
//   T380 §4-2: 숲 청크 하나가 **17.8ms**(라이브) · 8.0ms(오프라인). 누가 먹나?
//   ⓐ 청크 하나(같은 청크 · 같은 씨)를 `generateChunkResources` + `overflowInto` 로 돌리며
//      `terrain`·`trees` 모듈의 **모든 함수 속성**을 감싸 **호출 수만** 센다(재는 동안 시간은 안 잰다 —
//      호출마다 hrtime 을 부르면 그 값이 잰 것을 부풀린다).
//   ⓑ 받아 둔 인자로 **원래 함수**를 다시 불러 회당 µs 를 잰다(감싸개 비용 0).
//   ⓒ 호출 수 × 회당 µs 의 합을 청크 전체 시간과 나란히 — 나머지는 "못 가른 것"으로 한 줄.
//   ⓓ ★비트(T333 상자)로 바꿀 수 있나 — 상자는 **셀 중심**의 답을 든다. 그런데 이 술어들은
//      지터된 **점**으로 불린다. ⇒ 받아 둔 점마다 "점의 답 ≠ 셀 중심의 답" 인 수를 센다.
//      0 이면 비트로 바꿔도 세계가 같다. 0 이 아니면 **바꾸면 나무가 움직인다**(표만 · 고치지 않는다).
//
// 실행: node scripts/t384-index-cost.js [--zone hanbando] [--at 57382,61114] [--reps 5]
'use strict';
const path = require('path');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const AT = val('--at', '57382,61114').split(',').map(Number);
const REPS = +val('--reps', '5');

const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const terrain = require(path.join(ROOT, 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const chunk = require(path.join(ROOT, 'server', 'chunk'));
let trees = null; try { trees = require(path.join(ROOT, 'server', 'trees')); } catch (e) {}
const Z = ZONES[ZID], cs = chunk.CHUNK_SIZE;
const now = () => Number(process.hrtime.bigint()) / 1000;   // µs

// ── 청크 고르기 — 둘레 13×13 에서 나무가 가장 많은 청크(숲 한복판) ─────────────
const c0 = Math.floor(AT[0] / cs), r0 = Math.floor(AT[1] / cs);
let best = null;
for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
  const cx = c0 + dx, cy = r0 + dy;
  let n = 0; for (const r of chunk.generateChunkResources(ZID, Z.biome, cx, cy, cs, null, 0)) if (r.type === 'tree') n++;
  if (!best || n > best.n) best = { cx, cy, n };
}
const run = () => {
  const a = chunk.generateChunkResources(ZID, Z.biome, best.cx, best.cy, cs, null, 0);
  const b = chunk.overflowInto(ZID, Z.biome, best.cx, best.cy, cs, null, 0);
  return a.length + b.length;
};

// ── 청크 전체 시간(감싸지 않은 판) — 첫 판(차가움) + 이어진 판 중앙값(더움) ──────
let t = now(); run(); const cold = now() - t;
const warmS = []; for (let i = 0; i < REPS; i++) { t = now(); run(); warmS.push(now() - t); }
warmS.sort((a, b) => a - b);
const warm = warmS[warmS.length >> 1];

// ── 호출 수 세기 — 모듈의 함수 속성 전부를 감싼다(인자는 받아 둔다) ─────────────
const rec = new Map();   // "mod.fn" → { orig, calls, args: [] }
function wrapAll(mod, name) {
  if (!mod) return;
  for (const k of Object.keys(mod)) {
    const f = mod[k];
    if (typeof f !== 'function') continue;
    const key = name + '.' + k;
    const r = { orig: f, calls: 0, args: [] };
    rec.set(key, r);
    mod[k] = function (...a) { r.calls++; if (r.args.length < 200000) r.args.push(a); return f.apply(this, a); };
  }
}
wrapAll(terrain, 'terrain');
wrapAll(trees, 'trees');
const nEnt = run();
for (const [key, r] of rec) { const i = key.indexOf('.'); const mod = key.slice(0, i) === 'terrain' ? terrain : trees; mod[key.slice(i + 1)] = r.orig; }

// ★회당 µs 는 **넓은 판**(아래)에서 잰 값을 빌린다.
//   1차 판은 이 청크의 인자로 바로 다시 불렀는데 isRock 이 **115µs**(격리 실측 ~40µs)로 나왔고
//   합이 청크 전체의 **279%** 가 됐다 — 모듈 전체를 감쌌다 푼 직후라 JIT 가 식은 채였다.
//   합이 100% 를 넘으면 자를 먼저 의심한다(족보 156/170). 넓은 판은 169청크를 덥힌 뒤 잰다.
// ── 넓은 판 — 둘레 13×13 청크 전부를 돌려 술어별 호출 수를 모은다 ─────────────
//   ★한 청크는 물·바위가 0칸이라 "비트로 바꿔도 같다"가 **자명 통과**다(참 0 · 불일치 0).
//     ⇒ 불일치는 **넓은 판**에서, 참의 수를 **같이 적어** 잰다.
const wide = new Map();
function wrapCount(mod, name, keys) {
  for (const k of keys) {
    const f = mod && mod[k]; if (typeof f !== 'function') continue;
    const r = { orig: f, calls: 0, args: [] }; wide.set(name + '.' + k, r);
    mod[k] = function (a0, a1, a2, a3) { r.calls++; if (r.args.length < 400000) r.args.push([a0, a1, a2, a3]); return f.call(this, a0, a1, a2, a3); };
  }
}
const _wideKeys = [];
for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const cx = c0 + dx, cy = r0 + dy; if (cx >= 0 && cy >= 0) _wideKeys.push([cx, cy]); }
const _runWide = () => { for (const [cx, cy] of _wideKeys) { chunk.generateChunkResources(ZID, Z.biome, cx, cy, cs, null, 0); chunk.overflowInto(ZID, Z.biome, cx, cy, cs, null, 0); } };
_runWide();                                   // 덥히기
const _tu0 = now(); _runWide(); const wideBare = now() - _tu0;   // ★감싸지 않은 판 — 분모
wrapCount(terrain, 'terrain', ['isRockCellLocal', 'isWaterCellLocal', 'getForestMultiplier']);
wrapCount(trees, 'trees', ['speciesAt']);
let wideN = 0, wideT = 0;
const tw0 = now();
for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
  const cx = c0 + dx, cy = r0 + dy;
  if (cx < 0 || cy < 0) continue;
  chunk.generateChunkResources(ZID, Z.biome, cx, cy, cs, null, 0);
  chunk.overflowInto(ZID, Z.biome, cx, cy, cs, null, 0);
  wideN++;
}
wideT = now() - tw0;
for (const [key, r] of wide) { const i = key.indexOf('.'); const mod = key.slice(0, i) === 'terrain' ? terrain : trees; mod[key.slice(i + 1)] = r.orig; }
const wideRows = [];
for (const [key, r] of wide) {
  const f = r.orig, A = r.args; let s = 0;
  for (const a of A) { if (f(a[0], a[1], a[2], a[3])) s++; }
  const t0 = now(); for (const a of A) { if (f(a[0], a[1], a[2], a[3])) s++; }
  const per = (now() - t0) / Math.max(1, A.length);
  wideRows.push({ key, calls: r.calls, per, tot: per * r.calls });
}
wideRows.sort((a, b) => b.tot - a.tot);
// ── 비트(셀 중심)로 바꾸면 답이 달라지는 점 수 ───────────────────────────────────
function disagree(key, pred) {
  const r = wide.get(key); if (!r) return null;
  let n = 0, diff = 0, yes = 0;
  for (const a of r.args) {
    const [z, x, y] = a;
    const cxp = Math.floor(x / 32) * 32 + 16, cyp = Math.floor(y / 32) * 32 + 16;
    const p = pred(r.orig(z, x, y)), q = pred(r.orig(z, cxp, cyp));
    n++; if (p) yes++; if (p !== q) diff++;
  }
  return { n, diff, yes };
}
const dW = disagree('terrain.isWaterCellLocal', Boolean);
const dR = disagree('terrain.isRockCellLocal', Boolean);
const dF = disagree('terrain.getForestMultiplier', (m) => m > 1.5);
const zt = (terrain._zoneTerrain && terrain._zoneTerrain(ZID)) || null;

// ── 표 ──────────────────────────────────────────────────────────────────────────
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3);
console.log(`=== 색인 문 해부 — ${ZID} 청크 (${best.cx},${best.cy}) · 나무 ${best.n}그루 · 개체 ${nEnt} (T384 ③) ===`);
console.log(`청크 전체: 첫 판 ${f1(cold / 1000)}ms · 이어진 판 중앙값 ${f2(warm / 1000)}ms (${REPS}판)`);
console.log('');
const perOf = new Map(wideRows.map((r) => [r.key, r.per]));
console.log('| 술어 | 이 청크 호출 수 | 회당 µs(넓은 판) | 추정 ms | 청크 대비 |');
console.log('|---|---:|---:|---:|---:|');
let sum = 0;
for (const [key, r] of [...rec].filter(([, r]) => r.calls).sort((a, b) => (b[1].calls * (perOf.get(b[0]) || 0)) - (a[1].calls * (perOf.get(a[0]) || 0)))) {
  const per = perOf.get(key);
  if (per == null) { console.log(`| \`${key}\` | ${r.calls.toLocaleString()} | (안 잼 · 작다) |  |  |`); continue; }
  const tot = per * r.calls; sum += tot;
  console.log(`| \`${key}\` | ${r.calls.toLocaleString()} | ${f3(per)} | ${f2(tot / 1000)} | ${f1(100 * tot / warm)}% |`);
}
console.log(`| **넷의 합** |  |  | **${f2(sum / 1000)}** | **${f1(100 * sum / warm)}%** |`);
console.log(`| 못 가른 것(청크 − 넷) |  |  | ${f2((warm - sum) / 1000)} | ${f1(100 * (warm - sum) / warm)}% |`);
console.log('');
console.log(`=== 넓은 판 — 둘레 ${wideN}청크 · 감싸지 않은 판 청크당 ${f2(wideBare / wideN / 1000)}ms (감싼 판 ${f2(wideT / wideN / 1000)}ms) ===`);
console.log('| 술어 | 호출 수 | 청크당 호출 | 회당 µs | 청크당 ms |');
console.log('|---|---:|---:|---:|---:|');
let wsum = 0;
for (const r of wideRows) { wsum += r.tot; console.log(`| \`${r.key}\` | ${r.calls.toLocaleString()} | ${f1(r.calls / wideN)} | ${f3(r.per)} | ${f2(r.tot / wideN / 1000)} |`); }
console.log(`| **넷의 합** |  |  |  | **${f2(wsum / wideN / 1000)}** (${f1(100 * wsum / wideBare)}%) |`);
console.log(`| 못 가른 것 |  |  |  | ${f2((wideBare - wsum) / wideN / 1000)} (${f1(100 * (wideBare - wsum) / wideBare)}%) |`);
console.log('');
console.log('★비트(T333 상자 · 셀 중심 답)로 바꾸면 답이 달라지는 점 — 넓은 판 · **참의 수를 같이 적는다**(참 0 이면 불일치 0 은 자명하다)');
for (const [nm, d] of [['isWaterCellLocal', dW], ['isRockCellLocal', dR], ['getForestMultiplier > 1.5', dF]]) {
  if (!d) { console.log(`  ${nm}: 호출 0`); continue; }
  console.log(`  ${nm}: 불일치 ${d.diff.toLocaleString()} / ${d.n.toLocaleString()}점 (${f2(100 * d.diff / Math.max(1, d.n))}%) · 참 ${d.yes.toLocaleString()}`);
}
const T = require(path.join(ROOT, 'server', 'hanbando-terrain.json'))[ZID] || {};
console.log(`  (이 존 정본 도형 수: forests ${(T.forests || []).length} · lakes ${(T.lakes || []).length} · rivers ${(T.rivers || []).length} · ridges ${(T.ridges || []).length} · passes ${(T.passes || []).length} · valleys ${(T.valleys || []).length})`);
