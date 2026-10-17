'use strict';
// (@regress 없음 — 러너 밖 · T762 관찰기 · 제품 무변 · 읽기만)
// === scripts/t762-walk-observe.js — 캐러밴 몸이 실제 날(24분)에 무엇을 걷나: 걸은 몸 수 · 거리 · 빠르기 · 상한 60 막힘 ==========
//
// ★[T762 2026-10-15] `T474_CARAVAN_WALK`(+ `T496_CARAVAN_REST`) 켬 판의 몸 — 존 아이에 덧 preload(`T686_PRELOAD`)로 싣는다:
//     T686_DIR=/tmp/t762 T686_PORT=4110 T686_PRELOAD=$PWD/scripts/t762-walk-observe.js T762_OUT=/tmp/t762/off.walk.jsonl \
//       node scripts/t686-spike.js run off
//     T474_CARAVAN_WALK=1 … T762_OUT=/tmp/t762/on.walk.jsonl node scripts/t686-spike.js run on
//   세계에 아무것도 안 쓴다 — 마을 모듈의 하네스 주입구(`__labProbe._t707Probe.setup()` · 인자 없이 = 지금 참조만 돌려준다)로 `state` 를 읽는다.
//   표본(벽 `T762_EVERY_S` 초 · 기본 15) 한 줄마다(jsonl · 판 끝이 SIGKILL 이라 그때그때 적는다):
//     t(벽 ms) · d(econ 날) · f(그날 벽 몫) · inF(장부에서 길 위 캐러밴 — outbound/inbound) · nB(몸) · ph(몸 국면 셈) · noB(길 위인데 몸 없음 · 그중 상한 막힘)
//     B: 몸마다 [id · 국면 · prog · len · 다리 날(arriveDay−departDay 또는 귀환) · 지연 누계 · 장부 L · 위치 x · y · 호위 수]
//     N: 처음 보는 장부 캐러밴 [id · 출발일 · 도착일 · 귀환 도착일 · econ 거리 · travelDays · 몸 있나]
'use strict';
const fs = require('fs');
const OUT = process.env.T762_OUT;
if (!OUT) return;
const EVERY = (+process.env.T762_EVERY_S || 15) * 1000;
let VIL = null;
const seen = new Set();
function vil() {
  if (VIL) return VIL;
  for (const k of Object.keys(require.cache)) if (/[\\/]server[\\/]villages\.js$/.test(k)) { VIL = require.cache[k].exports; break; }
  return VIL;
}
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
function snap() {
  const V = vil(); if (!V || !V.__labProbe || !V.__labProbe._t707Probe) return;
  const S = V.__labProbe._t707Probe.setup();   // 인자 없음 = 지금 참조만(쓰기 0)
  if (!S || !S.ready || !S.world) return;
  const W = S.world, B = S.caravanBodies || new Map(), P = S.deps && S.deps.players;
  const now = Date.now();
  const d = W.day | 0, f = S.dayMs ? r1(((now - S.epoch) % S.dayMs) / S.dayMs * 100) : null;
  const ph = {}; const rows = [];
  for (const b of B.values()) {
    ph[b.phase] = (ph[b.phase] || 0) + 1;
    const c = b.c || {}, p = P && P.get(b.pid);
    const leg = b.phase === 'outbound' ? (c.arriveDay - c.departDay) : (c.returnArriveDay - c.arriveDay);
    rows.push([c.id, b.phase[0], r1(b.prog), r1(b.len), leg, b.delayedDays || 0, b._t661 ? r1(b._t661.L) : null, p ? r1(p.x) : null, p ? r1(p.y) : null, (b.escorts || []).length]);
  }
  let inF = 0, noB = 0; const N = [];
  for (const c of W.caravans || []) {
    if (c._done || (c.state !== 'outbound' && c.state !== 'inbound')) continue;
    inF++; if (!B.has(c.id)) noB++;
    if (!seen.has(c.id)) { seen.add(c.id); N.push([c.id, c.departDay, c.arriveDay, c.returnArriveDay, r1(c.distance), c.travelDays, B.has(c.id) ? 1 : 0, c.state[0]]); }
  }
  const t772 = V.__labProbe.t772Stat || undefined;   // ★[T772] 켬만 — 귀환 다리 · 집 도착 · 늦음(끔이면 칸 없음)
  fs.appendFileSync(OUT, JSON.stringify({ t: now, d, f, inF, nB: B.size, ph, noB, B: rows, N, t772 }) + '\n');
}
setTimeout(function tick() { try { snap(); } catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ err: String(e && e.message) }) + '\n'); } catch (e2) {} } setTimeout(tick, EVERY).unref(); }, EVERY).unref();
