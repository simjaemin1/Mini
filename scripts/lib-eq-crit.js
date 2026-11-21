// (@regress 없음 — 러너 밖 · T1420 평형 기준 후보 셈 · 판정 0 · 문턱은 재민이 고른다)
// === scripts/lib-eq-crit.js — 날마다 관측 줄(`lib-eq-lab.obsDay` · 서버 `eq-srv-obs`)에서 "평형에 들었나"를 기준 후보마다 잰다 ==========
//
//   창 W(기본 365날 = 한 해)의 평균 · 진폭으로 본다. 기준 후보(문턱은 표의 열로만 — 하나를 고르지 않는다):
//     C1 해 평균 인구: |평균(지난 W) ÷ 평균(그 앞 W) − 1| ≤ x          — "해 평균이 안 움직인다"
//     C2 산 마을 수: 지난 W 동안 산 마을 수 변화 0                        — "마을이 안 꺼지고 안 선다"
//     C3 식량 날치 해 평균: |평균(지난 W) ÷ 평균(그 앞 W) − 1| ≤ x       — "곳간 두께가 안 움직인다"
//     C4 인구 기울기: 지난 W 의 일차 회귀 기울기 × W ÷ 평균 ≤ x           — "한 해 동안 몇 % 크고 있나"(C1 보다 빨리 문다)
//   "든 날" = 그 기준이 처음 참이 되고 **끝까지 줄곧 참인** 첫 날(한 번 참이었다 다시 거짓이면 그 뒤 날).
'use strict';
const COL = { d: 0, pop: 1, alive: 2, fd: 3, jobs: 4, price: 5, fdDead: 6, dead: 7, emig: 8, cpu: 9 };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function slopeRel(ys) {   // 일차 회귀 기울기 × 길이 ÷ 평균
  const n = ys.length; if (n < 3) return null;
  const mx = (n - 1) / 2, my = mean(ys); let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - mx) * (ys[i] - my); sxx += (i - mx) * (i - mx); }
  return my ? (sxy / sxx) * n / my : null;
}
// 날마다 기준 값(창 둘이 다 차는 날부터)
function series(rows, W) {
  const out = [];
  for (let i = 2 * W - 1; i < rows.length; i++) {
    const cur = rows.slice(i - W + 1, i + 1), prev = rows.slice(i - 2 * W + 1, i - W + 1);
    const pc = mean(cur.map((r) => r[COL.pop])), pp = mean(prev.map((r) => r[COL.pop]));
    const fc = mean(cur.map((r) => r[COL.fd]).filter((x) => x != null)), fp = mean(prev.map((r) => r[COL.fd]).filter((x) => x != null));
    const al = cur.map((r) => r[COL.alive]);
    const pops = cur.map((r) => r[COL.pop]);
    out.push({ d: rows[i][COL.d],
      c1: pp ? Math.abs(pc / pp - 1) : null,
      c2: Math.max(...al) - Math.min(...al),
      c3: fp ? Math.abs(fc / fp - 1) : null,
      c4: Math.abs(slopeRel(pops) || 0),
      popMean: pc, popAmp: pc ? (Math.max(...pops) - Math.min(...pops)) / pc : null,
      fdMean: fc, fdAmp: fc ? (Math.max(...cur.map((r) => r[COL.fd] || 0)) - Math.min(...cur.map((r) => r[COL.fd] || 0))) / fc : null });
  }
  return out;
}
function enterDay(ser, key, th) {   // 처음 참이 되고 끝까지 참인 첫 날 · 끝 날에 거짓이면 null
  let d = null;
  for (const s of ser) { const ok = s[key] != null && s[key] <= th; if (ok && d == null) d = s.d; else if (!ok) d = null; }
  return d;
}
const TH = { c1: [0.01, 0.02, 0.05], c2: [0], c3: [0.02, 0.05, 0.1], c4: [0.01, 0.02, 0.05] };
function table(rows, W) {
  const w = W || 365, ser = series(rows, w), out = { W: w, n: rows.length, last: ser.length ? ser[ser.length - 1] : null, enter: {} };
  for (const [k, ths] of Object.entries(TH)) for (const th of ths) out.enter[`${k}≤${th}`] = ser.length ? enterDay(ser, k, th) : '창 모자람';
  return out;
}
module.exports = { COL, series, enterDay, table, TH, slopeRel, mean };
