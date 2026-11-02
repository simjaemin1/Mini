'use strict';
// === scripts/gap-ruler-lib.js — 격차 자(T1101)의 셈 — 판 자료(날마다 마을 줄)를 받아 수를 낸다 =====================
//
// ★[T1101 · 재민 11-02] "행복이 낮으면 명령 거부 · 출정 거부 · 질 · 산출 감소를 넣을 텐데, 부익부빈익빈을 가속하는지 검증이 먼저."
//   이 파일은 **셈만** 한다(세계를 안 세운다 · 판정 0). 판을 세우는 것은 `gap-ruler.js`, 날마다 줄을 적는 것은 `gap-ruler-hook.js`.
//   하네스(`test-gap-ruler.js`)가 가짜 판으로 이 셈을 그대로 부른다(셈 사본 0).
//
// 자료 꼴(훅이 적는 그대로):
//   { names[], rows: [[day, pop[], gran[], happy[], bdt[]], …], shock: { idx, day, until, name } | null, pick: {…} }
//   pop = econ 인구 · gran = 곳간 식량 등가(econ `totalFoodEquivalent` — K · 굶주림이 읽는 그 셈) · happy = econ 그날 행복(`lastStats.happiness` · 없으면 null)
//   bdt = 해체 표(`_banditized`)

// ── 지니 — 마을 n 곳 값의 고르지 않음(0 = 다 같음 · (n−1)/n = 한 곳이 다 가짐) ───────────────────────────────
//   정렬 값 x(오름차순)에서 G = Σ(2i − n − 1)·x_i / (n · Σx)(i = 1..n). 합이 0 이면 0(가진 것이 없으면 고르다).
//   빈 마을(0)도 센다 — 빈 마을이 늘면 격차가 커지는 것이 맞다(사라진 마을을 빼면 격차가 줄어 보인다).
function gini(xs) {
  const a = (xs || []).map((x) => (Number.isFinite(x) && x > 0 ? x : 0)).sort((p, q) => p - q);
  const n = a.length; if (n < 2) return 0;
  let s = 0, w = 0;
  for (let i = 0; i < n; i++) { s += a[i]; w += (2 * (i + 1) - n - 1) * a[i]; }
  return s > 0 ? w / (n * s) : 0;
}

// ── 날마다 줄에서 지니 추이 · 빈 마을 · 해체 ─────────────────────────────────────────────────────────────
//   ever[i] = 그날까지 사람이 한 번이라도 산 마을 · 빈 마을 = ever 인데 그날 0 · 해체 = 그날까지 해체 표가 선 마을 수.
function series(D) {
  const rows = D.rows || [], n = (D.names || []).length;
  const ever = new Array(n).fill(false), bdt = new Array(n).fill(false);
  return rows.map(([day, pop, gran, , b]) => {
    let empty = 0, total = 0;
    for (let i = 0; i < n; i++) {
      if (pop[i] > 0) ever[i] = true; else if (ever[i]) empty++;
      if (b && b[i]) bdt[i] = true;
      total += pop[i] > 0 ? pop[i] : 0;
    }
    return { day, giniPop: gini(pop), giniGran: gini(gran), empty, dissolved: bdt.filter(Boolean).length, pop: total };
  });
}

// ── 충격 회복 — 충격 날 그 마을 값(P0)으로 돌아온 첫날 · 계속 떨어지나 ────────────────────────────────────
//   from = 충격 날(그날 끝의 값이 기준) · 회복 = from 뒤 처음으로 값 ≥ 기준인 날(충격 철이 끝나기 전이라도 그날이 회복이다 — 세는 것은 날뿐).
//   바닥 = from 뒤 가장 낮은 값과 그 날 · 끝 = 마지막 날 값 · 끝 기울기 = 마지막 100날(없으면 있는 만큼) 처음 → 끝 차.
//   대조(ctl)가 있으면 같은 날 같은 마을의 충격 없는 값과의 차(끝 날 · 바닥 날)를 함께 낸다.
function recovery(vals, days, from, ctl) {
  const k0 = days.indexOf(from);
  if (k0 < 0) return null;
  const base = vals[k0];
  let back = null, minV = base, minD = from;
  for (let k = k0 + 1; k < vals.length; k++) {
    if (vals[k] < minV) { minV = vals[k]; minD = days[k]; }
    if (back === null && vals[k] >= base && minV < base) back = days[k];
  }
  const last = vals.length - 1;
  const tailFrom = Math.max(k0, last - 100);
  const out = { base, back, backDays: back === null ? null : back - from, min: minV, minDay: minD, end: vals[last], endDay: days[last],
    tail: +(vals[last] - vals[tailFrom]).toFixed(2), dipped: minV < base };
  if (ctl) {
    const c = (d) => { const k = ctl.days.indexOf(d); return k < 0 ? null : ctl.vals[k]; };
    out.ctlEnd = c(days[last]); out.ctlAtMin = c(minD);
    out.gapEnd = out.ctlEnd == null ? null : +(out.end - out.ctlEnd).toFixed(2);
  }
  return out;
}

// ── 행복 바닥 기간 — 그 마을에 사람이 있는 날 중 행복 < 0.5 인 날 수 ─────────────────────────────────────
//   0.5 는 econ 행복의 중립점이다(`economy-sim.js` "happiness: 0.5 기준" · T209 하한이 배수를 1 로 자르는 자리) — 새 수 0.
//   하위 10 · 상위 10 = 판 전체 평균 인구로 줄 세운 아래 · 위 열 마을(빈 마을도 평균에 0 으로 든다 · 사람이 한 번도 없던 마을은 뺀다).
const HAPPY_MID = 0.5;
function floorDays(D, k) {
  const rows = D.rows || [], n = (D.names || []).length, K = k || 10;
  const sum = new Array(n).fill(0), live = new Array(n).fill(0), low = new Array(n).fill(0), ever = new Array(n).fill(false);
  for (const [, pop, , happy] of rows) {
    for (let i = 0; i < n; i++) {
      sum[i] += pop[i] > 0 ? pop[i] : 0;
      if (pop[i] > 0) { ever[i] = true; live[i]++; if (happy && happy[i] != null && happy[i] < HAPPY_MID) low[i]++; }
    }
  }
  const idx = [...Array(n).keys()].filter((i) => ever[i]).sort((a, b) => (sum[a] - sum[b]) || (a - b));
  const pack = (ix) => ({ names: ix.map((i) => D.names[i]), low: ix.map((i) => low[i]), live: ix.map((i) => live[i]),
    lowMean: ix.length ? +(ix.reduce((s, i) => s + low[i], 0) / ix.length).toFixed(1) : 0,
    share: (() => { const L = ix.reduce((s, i) => s + live[i], 0); return L ? +(ix.reduce((s, i) => s + low[i], 0) / L).toFixed(3) : 0; })() });
  return { bottom: pack(idx.slice(0, K)), top: pack(idx.slice(-K).reverse()), n: idx.length };
}

// ── 대조와 견주기 — 충격 판(S)과 같은 시드 충격 없는 판(B) ──────────────────────────────────────────────
//   ① 두 판이 처음 갈린 날(마을 인구 · 곳간 줄이 다른 첫날) — 충격 날 다음 날이어야 충격 전 판이 같은 세계다(아니면 판 잡음이 먼저다).
//   ② 충격 마을의 대조 대비 차(충격 − 대조) 추이 — 가장 크게 모자란 날 · 그 뒤 처음 따라잡은 날(차 ≥ 0) · 끝 차 · 끝 비율.
//   ③ 잡음 바닥 — 충격을 안 받은 마을들의 끝 차 크기(중앙 · 90%) · 충격 마을보다 크게 갈린 마을 수(번진 몫과 판 잡음을 이 자료로는 못 가른다 — 둘 다 여기 든다).
function vsControl(S, B) {
  if (!S || !B || !S.shock) return null;
  const i = S.shock.idx, n = (S.names || []).length;
  const bd = new Map(B.rows.map((r) => [r[0], r]));
  let first = null;
  for (const r of S.rows) { const b = bd.get(r[0]); if (!b) continue; if (r[1].some((x, j) => x !== b[1][j]) || r[2].some((x, j) => x !== b[2][j])) { first = r[0]; break; } }
  const gaps = [];
  for (const r of S.rows) { if (r[0] < S.shock.day) continue; const b = bd.get(r[0]); if (b) gaps.push([r[0], r[1][i] - b[1][i]]); }
  let worst = [S.shock.day, 0];
  for (const g of gaps) if (g[1] < worst[1]) worst = g;
  let caught = null;
  if (worst[1] < 0) for (const g of gaps) if (g[0] > worst[0] && g[1] >= 0) { caught = g[0]; break; }
  const lS = S.rows[S.rows.length - 1], lB = bd.get(lS[0]) || B.rows[B.rows.length - 1];
  const endGap = lS[1][i] - lB[1][i];
  const others = [];
  for (let j = 0; j < n; j++) if (j !== i) others.push(Math.abs(lS[1][j] - lB[1][j]));
  others.sort((a, b) => a - b);
  const q = (p) => (others.length ? others[Math.min(others.length - 1, Math.floor(others.length * p))] : null);
  return { firstDiverge: first, cleanBefore: first === null || first > S.shock.day, worstGap: worst[1], worstDay: worst[0], caught,
    endGap, endRel: lB[1][i] > 0 ? +(endGap / lB[1][i]).toFixed(3) : null,
    noiseMed: q(0.5), noiseP90: q(0.9), noiseMax: others.length ? others[others.length - 1] : null,
    louder: others.filter((x) => x >= Math.abs(endGap)).length, others: others.length };
}

// ── 판 하나 요약(표 한 줄) ───────────────────────────────────────────────────────────────────────────────
//   지니는 첫날 · 100날마다 · 끝 날. 추이 = 끝 − 첫날(+ 면 벌어졌다).
function summarize(D, ctl) {
  const S = series(D);
  if (!S.length) return null;
  const at = (d) => { let best = S[0]; for (const s of S) if (s.day <= d) best = s; return best; };
  const marks = [];
  for (let d = 100; d < S[S.length - 1].day; d += 100) marks.push(d);
  marks.push(S[S.length - 1].day);
  const first = S[0], last = S[S.length - 1];
  const out = {
    days: last.day, first: { day: first.day, giniPop: first.giniPop, giniGran: first.giniGran },
    marks: marks.map((d) => { const s = at(d); return { day: s.day, giniPop: +s.giniPop.toFixed(3), giniGran: +s.giniGran.toFixed(3), empty: s.empty, dissolved: s.dissolved, pop: s.pop }; }),
    dPop: +(last.giniPop - first.giniPop).toFixed(3), dGran: +(last.giniGran - first.giniGran).toFixed(3),
    empty: last.empty, dissolved: last.dissolved, floor: floorDays(D, 10),
  };
  if (D.shock) {
    const i = D.shock.idx, days = D.rows.map((r) => r[0]);
    const cv = (j) => (ctl ? { days: ctl.rows.map((r) => r[0]), vals: ctl.rows.map((r) => r[j][i]) } : null);
    out.shock = { name: D.names[i], day: D.shock.day, until: D.shock.until, kind: D.shock.name,
      pop: recovery(D.rows.map((r) => r[1][i]), days, D.shock.day, cv(1)),
      gran: recovery(D.rows.map((r) => r[2][i]), days, D.shock.day, cv(2)), ctl: ctl ? vsControl(D, ctl) : null };
  }
  return out;
}

module.exports = { gini, series, recovery, floorDays, vsControl, summarize, HAPPY_MID };
