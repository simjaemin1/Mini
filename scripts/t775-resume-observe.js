'use strict';
// (@regress 없음 — 러너 밖 · T775 관찰기 · 제품 무변 · 읽기만)
// === scripts/t775-resume-observe.js — 다시 뜬 판: 길 위 캐러밴 몸이 장부 자리에 서나 · 귀환 중이던 것이 몸으로 닿나 ==========
//   존 아이에 덧 preload(`T686_PRELOAD`)로 싣는다 · `T775_OUT=<jsonl>` · 표본 `T775_EVERY_S`(기본 5) 초.
//   한 줄: t · d(econ 날) · f(그날 몫) · inF(장부 길 위 · 가는/귀환) · nB(몸 · 국면) · noB(길 위인데 몸 없음 · 가는/귀환) ·
//          dist(몸마다 |몸 − 장부 자리| px — 장부 자리 = 그 구간의 **실제 시작 날**(가는 길 departDay · 귀환 arriveDay)부터
//          그 구간 끝 날까지 날 몫으로 고르게 간 자리 · 몸의 길 위에서 · 이 관찰기가 따로 센다) · homeNoBody(귀환 중 몸 없이 집에 닿은 누계 — 앞 표본에 inbound · 몸 없음 → 이번 표본에 장부에서 사라짐)
//          · probe(_probe.t775Placed · t775Spawned · t775Inbound · t775Cap)
const fs = require('fs');
const OUT = process.env.T775_OUT;
if (!OUT) return;
const EVERY = (+process.env.T775_EVERY_S || 5) * 1000;
let VIL = null;
function vil() {
  if (VIL) return VIL;
  for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/]villages\.js$/.test(k)) { VIL = require.cache[k].exports; break; }
  return VIL;
}
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
function pointAt(path, at) {   // 폴리라인 위 점(관찰기 사본 — 비교용 · 제품 함수와 같은 식: 누적 길이 구간 선형)
  const pts = path.pts, cum = path.cum; if (!pts || pts.length < 2) return pts && pts[0];
  if (at <= 0) return pts[0]; if (at >= path.len) return pts[pts.length - 1];
  let s = 0; while (s < pts.length - 2 && cum[s + 1] < at) s++;
  const seg = cum[s + 1] - cum[s], u = seg > 0 ? (at - cum[s]) / seg : 0;
  return { x: pts[s].x + (pts[s + 1].x - pts[s].x) * u, y: pts[s].y + (pts[s + 1].y - pts[s].y) * u };
}
let prevNoBodyIn = new Set(), homeNoBody = 0, t0 = Date.now();
function snap() {
  const V = vil(); if (!V || !V.__labProbe || !V.__labProbe._t707Probe) return;
  const S = V.__labProbe._t707Probe.setup();
  if (!S || !S.ready || !S.world) return;
  const W = S.world, B = S.caravanBodies || new Map(), P = S.deps && S.deps.players;
  const now = Date.now(), d = W.day | 0;
  const f = S.dayMs ? Math.min(1, Math.max(0, ((now - S.epoch) % S.dayMs) / S.dayMs)) : 0;
  const inF = { o: 0, i: 0 }, noB = { o: 0, i: 0 }, ph = {}, dist = [];
  const live = new Set(), noBodyIn = new Set();
  for (const c of W.caravans) {
    if (c._done || !(c.state === 'outbound' || c.state === 'inbound')) continue;
    live.add(c.id);
    const k = c.state === 'outbound' ? 'o' : 'i'; inF[k]++;
    if (!B.has(c.id)) { noB[k]++; if (k === 'i') noBodyIn.add(c.id); }
  }
  for (const id of prevNoBodyIn) if (!live.has(id)) homeNoBody++;
  prevNoBodyIn = noBodyIn;
  for (const b of B.values()) {
    ph[b.phase] = (ph[b.phase] || 0) + 1;
    const c = b.c, p = P && P.get(b.pid), T = b._t661;
    if (!c || !p || !T || !(b.phase === 'outbound' || b.phase === 'inbound') || T.path.pts !== b.pts) continue;
    const D0 = b.phase === 'outbound' ? c.departDay : c.arriveDay, D1 = b.phase === 'outbound' ? c.arriveDay : c.returnArriveDay;
    const want = T.path.len * Math.min(1, Math.max(0, (d + f - D0) / Math.max(1, D1 - D0)));
    const q = pointAt(T.path, want);
    if (q) dist.push([c.id, b.phase[0], r1(Math.hypot(p.x - q.x, p.y - q.y)), d - D0]);
  }
  const pr = (S._probe || {});
  const row = { t: now - t0, d, f: r1(f * 100), inF, nB: B.size, ph, noB, homeNoBody, dist };
  try { const tp = V.tickPerf && V.tickPerf(); if (tp && tp.probe && tp.probe.t775) row.probe = tp.probe.t775; } catch (e) {}
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
}
setInterval(() => { try { snap(); } catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ err: String(e && e.message) }) + '\n'); } catch (e2) {} } }, EVERY).unref();
