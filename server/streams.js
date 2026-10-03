// === server/streams.js — 개울 정본 하나 (T585 · 재민 10-03 "개울 랩 확인했어 · 괜찮은듯") ================================
//
// ★개울 = 건널 수 있는 1~2셀 물(족보 509·513 · 값은 재민 확정): 건넌다 · 걸음 ×0.5 · 마신다 · 낚시 0 · 집수 문턱 1,500 ·
//   개울 셀은 영토 상한에 센다(예외 0) · 강은 만들거나 지울 수 없다(개울 공사는 나중 · 회부).
//
// ★이 파일 한 장이 정본이다(사본 0):
//   ⓐ 산법 = 랩 `lab/마을실험실.html` 의 `STREAM-CORE` 블록과 **같은 글자**(아래 START~END 를 그대로 옮겼다 —
//      `scripts/test-streams.js` 가 두 블록을 글자로 견준다 · 랩 쪽이 바뀌면 빨개진다). 그 블록 자체가 `scripts/t568-flow.js` 의 사본이다.
//   ⓑ 높이 대용 = T571 보고 §4-2(`scripts/t571-live-cost.py`)의 식 `cost = Dw + 0.5·max(0, 60 − Dr) + 4·잔물결` —
//      서버 지형엔 랩의 `elev` 가 없다. Dw = 물(해안 띠·민물)까지 유클리드 거리 · Dr = 바위까지 · 잔물결 = 16셀 격자 값 노이즈(시드 568).
//      계수는 PM 이 T571 카드에 적은 라이브 수(개울 = 뭍의 0.9~1.1% · 끊긴 조각 34)에 맞춘 그 재현이다(새 수 0 · 회부 2 의 "이 재현을 정본으로").
//      ⚠잔물결은 파이썬(numpy 난수 · scipy zoom)과 같은 비트가 아니다 — 같은 식의 JS 판(결정적 해시 · 쌍선형)이다.
//   ⓒ 산 바위 구간 = 'foot'(기슭 — 물까지 내려가는 길에 바위가 없는 뭍 개울만 · **지형 무변**)이 기본이다.
//      'gorge'(계곡 — 바위를 깎아 통로)는 재민 판정 칸(T571 회부 3)이고 통행 지형을 바꾸므로 서버엔 안 들였다(손잡이 0 · 회부).
//
// ★래스터: 존마다 한 번 굽는다(`scripts/bake-streams.js` · 결정적) → `server/streams/<존>.bin`(머리 + 1비트/셀 · deflate).
//   존 서버는 기동 때 그 파일을 읽기만 한다(굽기 0). 지형 json 의 그 존 절이 바뀌면 머리의 지문이 어긋나 **끈다**(경고 한 줄) — 다시 구워라.
//
// ★손잡이: `T585_STREAMS=0` 이면 개울이 없다(`isStreamCell` 늘 false · 클라에 래스터 안 보냄 · 종전 세계 그대로).
//   `T585_STREAM_GUARD` = `guard`(기본 · T584 랩 PM 안 — 집 부지 + 2칸 완충 원 `LOT_GUARD` 에 개울 셀 X) · `lot`(부지 원판만 — T571 판).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ON = process.env.T585_STREAMS !== '0';
const GUARD = process.env.T585_STREAM_GUARD === 'lot' ? 'lot' : 'guard';
// ★값은 재민 확정(족보 513 "PM 안대로") — 랩 `L_STREAM_A0` · `L_STREAM_SLOW0` 와 같은 수(test-streams 가 랩 글자와 견준다)
const STREAM_A0 = 1500;      // 집수 문턱(셀) — 그 셀로 내려오는 뭍 셀 수가 이 이상이면 개울 · 4배 이상이면 2셀
const STREAM_SLOW0 = 0.5;    // 개울 칸 위 사람 걸음 배율 · 길찾기 비용은 그 역(×2)
const MODE = 'foot';
const RIP_SEED = 568, RIP_SC = 16, COST_DR = 60, COST_KR = 0.5, COST_KN = 4;   // 높이 대용 식의 수 — T571 재현 그대로(위 ⓑ)
const FILE_VER = 1;

// ===================== ★★[T571 2026-10-03 · 세션3] 개울 층 — STREAM-CORE-START (순수 함수 · 자가 `scripts/t571-lab-streams.js` 가 이 사이를 떼어 Node 에서 돈다) =====================
//   개울 = 건널 수 있는 1~2셀 물(재민 10-02 캐논 · 값은 10-03 "PM 안대로" 닫힘 — 족보 513): 걸어서 건넌다(느려짐 · 손잡이) · 마실 수 있다 · 낚시 불가 · 큰 강은 그대로 벽 ·
//   집·마당·밭은 개울 셀에 못 선다(옆은 된다 · 띄우는 거리 0). ★개울은 **집수에서 나온다**(아무 데나 긋는 선이 아니다).
//   ★산법 = `scripts/t568-flow.js`(PM 미리보기 · 2026-10-02)를 그대로 옮긴 사본이다(출처 한 줄 — 힙·씨앗·8방 번짐·max(cost) 메움·거꾸로 쌓기 그대로):
//     물 셀(강·호수·바다) = 끝 · 물과 4방으로 맞닿은 셀이 씨앗 · 8방으로 번지며 셀마다 **내려가는 곳 하나**(그래서 갈라지지 않는다 = 나무 꼴) ·
//     집수 = 그 셀로 내려오는 셀 수(자기 포함).
//   ★높이 = 랩 지형 `elev` 그대로(buildTerrain — 물까지 거리 0.4 + 산맥 능선 + 잔물결 0.05). PM 의 "높이 대용(물까지 거리 + 산 기슭 오름 + 잔물결)"은
//     높이가 없는 서버 지형의 대용이고, 랩은 그 세 항을 **실물로** 갖고 있다 — 새 수 0(대용 식의 계수는 레포에 없다 · 서버 이식 때 회부).
//   ★개울 = 집수 ≥ 문턱(손잡이 `#stA` · URL `streamA` · 기본 `L_STREAM_A0` 1,500 = PM 미리보기 값) · ≥ 4×문턱이면 2셀(scipy `binary_dilation(2×2)` 와 같은 자리 — 왼·위·왼위 한 칸).
//   ★산 바위 셀 구간 — 두 판(재민이 고른다 · 판정 0):
//     'gorge' 계곡 = 바위 위 개울도 긋고 개울 둘레 한 칸(8방)의 바위를 깎아 통로(개울 폭 + 2 · 11차 계곡 문법 — 산맥을 가로지르는 좁은 통로)
//     'foot'  기슭 = 물까지 내려가는 길에 바위가 **없는** 뭍 개울만(산 기슭에서 시작 · 바위 무변)
//     'land'  PM 미리보기 판 = 뭍에만 긋는다(바위 구간이 빠져 물에 안 닿는 조각이 생긴다 — 점검 자 대조용 · 랩 손잡이엔 없다)
function streamFlow(NX, NY, sink, cost) {   // t568-flow.js 사본 — sink(i) = 끝(물) · cost = 높이
  const N = NX * NY;
  const down = new Int32Array(N).fill(-2);   // -2 미방문 · -1 물(끝)
  const order = new Int32Array(N); let on = 0;
  let hk = new Float32Array(1 << 20), hv = new Int32Array(1 << 20), hn = 0;
  const grow = () => { const k2 = new Float32Array(hk.length * 2); k2.set(hk); hk = k2; const v2 = new Int32Array(hv.length * 2); v2.set(hv); hv = v2; };
  const push = (k, v) => { if (hn >= hk.length) grow(); let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const pop = () => { const v = hv[0], k = hk[--hn], vv = hv[hn]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = vv; return v; };
  for (let i = 0; i < N; i++) if (sink(i)) down[i] = -1;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {   // 물 셀 중 뭍과 맞닿은 것만 씨앗으로
    const i = y * NX + x; if (down[i] !== -1) continue;
    for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue; const j = ny * NX + nx;
      if (down[j] === -2) { down[j] = i; push(cost[j], j); } }
  }
  const seen = new Uint8Array(N);
  while (hn) {   // 흐름 방향이 정해진 셀을 꺼내 이웃을 그 셀 쪽으로(웅덩이는 max(cost) 로 메운다)
    const i = pop(); if (seen[i]) continue; seen[i] = 1; order[on++] = i;
    const x = i % NX, y = (i / NX) | 0;
    for (let d = 0; d < 8; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue; const j = ny * NX + nx;
      if (down[j] === -2) { down[j] = i; push(Math.max(cost[j], cost[i]), j); } }
  }
  const acc = new Uint32Array(N);
  for (let t = on - 1; t >= 0; t--) { const i = order[t]; acc[i] += 1; const d = down[i]; if (d >= 0) acc[d] += acc[i]; }
  return { down, acc, order, on };
}
// 개울 판 — mask: 0 없음 · 1 줄기(집수 ≥ A) · 2 넓힘(≥ 4A 의 왼·위 한 칸) · carve: 'gorge' 에서 깎을 바위 셀(개울 셀 + 둘레 한 칸)
function streamMask(NX, NY, F, water, rock, A, mode) {
  const N = NX * NY, acc = F.acc, down = F.down, mask = new Uint8Array(N), carve = new Uint8Array(N);
  let clean = null;
  if (mode === 'foot') {   // 물까지 가는 길에 바위가 없는가 — 흐름 순서(물 쪽 먼저)로 한 번에
    clean = new Uint8Array(N);
    for (let t = 0; t < F.on; t++) { const i = F.order[t], d = down[i]; clean[i] = (!rock[i] && (d < 0 || water[d] || clean[d])) ? 1 : 0; }
  }
  const okCell = (i) => !water[i] && (mode === 'gorge' ? true : !rock[i]) && (clean ? clean[i] === 1 : true);
  let n1 = 0, n2 = 0;
  for (let i = 0; i < N; i++) if (acc[i] >= A && okCell(i)) { mask[i] = 1; n1++; }
  const A4 = 4 * A;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x; if (mask[i] !== 1 || acc[i] < A4) continue;
    for (let k = 0; k < 3; k++) {
      const xx = x - (k === 1 ? 0 : 1), yy = y - (k === 0 ? 0 : 1); if (xx < 0 || yy < 0) continue;
      const j = yy * NX + xx; if (mask[j] || water[j]) continue;
      if (mode !== 'gorge' && rock[j]) continue;   // 넓힘도 뭍에만(PM `& land`) — 계곡 판만 바위 위로
      mask[j] = 2; n2++;
    }
  }
  let nc = 0;
  if (mode === 'gorge') {   // 계곡 — 바위 위 개울 셀과 그 둘레 한 칸의 바위를 뭍으로(통로 = 개울 폭 + 2)
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const i = y * NX + x; if (!mask[i] || !rock[i]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= NX || yy >= NY) continue;
        const j = yy * NX + xx; if (rock[j] && !carve[j]) { carve[j] = 1; nc++; }
      }
    }
  }
  return { mask, carve, n1, n2, nc };
}
// 물길 점검 자 — 같은 정의를 `scripts/t568-streams.py` 가 서울 사본에 쓴다(한 정의 · 두 언어).
//   ⓐ 두 물에 닿는 개울 성분 수(물 성분 = 물 셀 8방 연결 — 강·호수·바다가 붙어 있으면 한 성분) ⓑ 끊긴 조각(물에 안 닿는 개울 성분) ·
//   ⓒ 강 기슭 2셀 안을 **따라** 흐르는 개울 셀 비율(줄기 셀 중 체비셰프 2 안에 물이 있는데 물까지 4걸음 이상 — 어귀 3셀은 빼고) ·
//   ⓓ 나란한 두 개울(서로 다른 가지가 1셀 틈 — 축·대각 거리 2, 사이 칸은 개울 아님 — 으로 n셀 이상 나란함)의 가지 쌍 수(n = 5·10·20) ·
//   ⓔ 큰 물을 가로지르는 개울(개울 셀 ∩ 물 · 물 셀에서 다시 나오는 흐름) — 구조상 0(물 셀이 끝이다)이지만 센다.
//   가지 = 줄기(mask 1) 나무를 합류점에서 자른 마디(머리·합류점에서 새 가지).
function streamAudit(NX, NY, mask, water, F, opts) {
  opts = opts || {};
  const N = NX * NY, down = F.down;
  // 물 성분(8방)
  const wlab = new Int32Array(N).fill(-1); let nw = 0;
  { const st = [];
    for (let i0 = 0; i0 < N; i0++) { if (!water[i0] || wlab[i0] >= 0) continue; wlab[i0] = nw; st.length = 0; st.push(i0);
      while (st.length) { const j = st.pop(), x = j % NX, y = (j / NX) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= NX || yy >= NY) continue; const k = yy * NX + xx; if (water[k] && wlab[k] < 0) { wlab[k] = nw; st.push(k); } } }
      nw++; } }
  // 개울 성분(8방) · 닿는 물 성분
  const slab = new Int32Array(N).fill(-1); let ns = 0, two = 0, frag = 0, fragCells = 0, cells = 0;
  { const st = [];
    for (let i0 = 0; i0 < N; i0++) { if (!mask[i0] || slab[i0] >= 0) continue; slab[i0] = ns; st.length = 0; st.push(i0); const wset = new Set(); let c = 0;
      while (st.length) { const j = st.pop(), x = j % NX, y = (j / NX) | 0; c++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= NX || yy >= NY) continue; const k = yy * NX + xx;
          if (water[k]) wset.add(wlab[k]); else if (mask[k] && slab[k] < 0) { slab[k] = ns; st.push(k); } } }
      if (wset.size >= 2) two++; if (wset.size === 0) { frag++; fragCells += c; } cells += c; ns++; } }
  // 물까지 걸음(흐름 순서로 한 번에) — 기슭을 따라 흐름 판정용
  const stw = new Int32Array(N);
  for (let t = 0; t < F.on; t++) { const i = F.order[t], d = down[i]; stw[i] = (d < 0) ? 0 : (water[d] ? 1 : stw[d] + 1); }
  let trunk = 0, bank = 0;
  for (let i = 0; i < N; i++) { if (mask[i] !== 1) continue; trunk++;
    const x = i % NX, y = (i / NX) | 0; let nearW = false;
    for (let dy = -2; dy <= 2 && !nearW; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= NX || yy >= NY) continue; if (water[yy * NX + xx]) { nearW = true; break; } }
    if (nearW && stw[i] > 3) bank++; }
  // 가지(줄기 나무를 합류점에서 자른 마디) — 위에서 아래로(흐름 순서 거꾸로)
  const inS = new Uint8Array(N), upOf = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) { if (mask[i] !== 1) continue; const d = down[i]; if (d >= 0 && mask[d] === 1) { if (inS[d] < 255) inS[d]++; upOf[d] = i; } }
  const link = new Int32Array(N).fill(-1); let nl = 0;
  for (let t = F.on - 1; t >= 0; t--) { const i = F.order[t]; if (mask[i] !== 1) continue; link[i] = (inS[i] === 1) ? link[upOf[i]] : nl++; }
  // 나란함 — 축·대각 거리 2 · 사이 칸은 개울 아님 · 서로 다른 가지(앞쪽 넷만 — 쌍을 두 번 안 센다)
  const pairN = new Map(), pairF = new Map(), pairL = new Map();   // 쌍 → 나란한 칸 수 · 처음·끝 칸(자리 표시용)
  const OFF = [[2, 0], [0, 2], [2, 2], [2, -2]];
  for (let i = 0; i < N; i++) { if (mask[i] !== 1) continue; const x = i % NX, y = (i / NX) | 0;
    for (const [ox, oy] of OFF) { const qx = x + ox, qy = y + oy; if (qx < 0 || qy < 0 || qx >= NX || qy >= NY) continue; const q = qy * NX + qx;
      if (mask[q] !== 1 || link[q] === link[i]) continue; const m = (y + oy / 2) * NX + (x + ox / 2); if (mask[m]) continue;
      const a = Math.min(link[i], link[q]), b = Math.max(link[i], link[q]), key = a * 1048576 + b; pairN.set(key, (pairN.get(key) || 0) + 1); if (!pairF.has(key)) pairF.set(key, i); pairL.set(key, i); } }
  const par = {}; for (const n of (opts.parN || [5, 10, 20])) { let c = 0; for (const v of pairN.values()) if (v >= n) c++; par[n] = c; }
  const parSites = []; for (const [k, v] of pairN) if (v >= (opts.parMark || 10)) { const f = pairF.get(k), l = pairL.get(k); parSites.push([((f % NX) + (l % NX)) >> 1, (((f / NX) | 0) + ((l / NX) | 0)) >> 1, v]); }   // ≥10셀 나란한 쌍의 가운데 칸(랩이 노랑 고리로 표시)
  // 가로지름 — 개울 셀 ∩ 물 · 물 셀의 흐름이 이어지는가(물은 끝이어야)
  let onWater = 0, through = 0; for (let i = 0; i < N; i++) { if (mask[i] && water[i]) onWater++; if (water[i] && down[i] !== -1) through++; }
  return { waterComps: nw, comps: ns, cells, two, frag, fragCells, trunk, bankAlong: bank, bankPct: trunk ? +(100 * bank / trunk).toFixed(2) : 0, links: nl, parallel: par, parSites, onWater, through };
}
// ===================== STREAM-CORE-END =====================


// ───────────────────────────── 서버 판(굽기·적재·술어) ─────────────────────────────
// 정확 유클리드 거리(2패스 · Felzenszwalb) — 술어 배열(0/1)에서 가장 가까운 1 까지(셀). 1 이 없으면 큰 수.
function _edt(NX, NY, isSrc) {
  const N = NX * NY, g = new Float64Array(N);
  for (let i = 0; i < N; i++) g[i] = isSrc[i] ? 0 : 1e20;
  const n = Math.max(NX, NY), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), f = new Float64Array(n);
  const dt1 = (len) => { let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (let q = 1; q < len; q++) { let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); } k++; v[k] = q; z[k] = s; z[k + 1] = 1e20; }
    k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; } };
  for (let x = 0; x < NX; x++) { for (let y = 0; y < NY; y++) f[y] = g[y * NX + x]; dt1(NY); for (let y = 0; y < NY; y++) g[y * NX + x] = d[y]; }
  for (let y = 0; y < NY; y++) { const o = y * NX; for (let x = 0; x < NX; x++) f[x] = g[o + x]; dt1(NX); for (let x = 0; x < NX; x++) g[o + x] = d[x]; }
  const out = new Float32Array(N); for (let i = 0; i < N; i++) out[i] = g[i] >= 1e19 ? 1e6 : Math.sqrt(g[i]);
  return out;
}
// 잔물결 — RIP_SC 셀 격자 값 노이즈(−1..1) · 격자점 값 = 해시(시드, gx, gy) · 쌍선형
function _h01(seed, x, y) { let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 16)) >>> 0; return h / 4294967296; }
function ripple(cx, cy) {
  const gx = cx / RIP_SC, gy = cy / RIP_SC, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const a = _h01(RIP_SEED, x0, y0), b = _h01(RIP_SEED, x0 + 1, y0), c = _h01(RIP_SEED, x0, y0 + 1), e = _h01(RIP_SEED, x0 + 1, y0 + 1);
  return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy) * 2 - 1;
}
/** 높이 대용 — kind: 1 뭍 · 2 해안 띠 · 3 민물 · 4 바위(존 술어 그대로) → cost(Float32) */
function heightProxy(NX, NY, kind) {
  const N = NX * NY, W = new Uint8Array(N), R = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const k = kind[i]; if (k === 2 || k === 3) W[i] = 1; else if (k === 4) R[i] = 1; }
  const Dw = _edt(NX, NY, W), Dr = _edt(NX, NY, R), cost = new Float32Array(N);
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) { const i = cy * NX + cx; cost[i] = Dw[i] + COST_KR * Math.max(0, COST_DR - Dr[i]) + COST_KN * ripple(cx, cy); }
  return { cost, Dw, Dr };
}
/** 굽기 — kind 격자에서 개울 판(mask 0/1/2) · 흐름 · 점검 */
function bake(NX, NY, kind, opts) {
  opts = opts || {};
  const A = opts.A || STREAM_A0, mode = opts.mode || MODE, N = NX * NY;
  const water = new Uint8Array(N), rock = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const k = kind[i]; if (k === 2 || k === 3) water[i] = 1; else if (k === 4) rock[i] = 1; }
  const H = heightProxy(NX, NY, kind);
  const F = streamFlow(NX, NY, (i) => water[i] === 1, H.cost);
  const M = streamMask(NX, NY, F, water, rock, A, mode);
  return { NX, NY, A, mode, mask: M.mask, n1: M.n1, n2: M.n2, F, water, rock, Dw: H.Dw };
}
// ★굽기 묶음 — 맞닿은 존들을 **한 장으로 이어** 굽는다(경계 잇기 · 존 사이에서 개울이 끊기지 않는다 · 흐름이 경계를 넘는다).
//   세 존은 세계 좌표로 서→동 맞붙어 있고 위·아래가 같다(중원북 | 한반도 | 닛폰 · y 49,984~180,000). 존 파일은 그 한 장의 제 몫이다.
const GROUP = ['jungwon_n', 'hanbando', 'nippon'];
let _TJ = null;
// 지문 — 묶음 존들의 지형 json 절 + 존 사각 + 바다 존 목록 + 산법 판(굽기 입력이 바뀌면 바뀐다 · 이웃 존 지형도 내 개울을 바꾼다)
/** 해안 꼴 손잡이 — `server/chunk.js` generateCoastlineWaterTiles 와 같은 읽기('1'·'a' → a · 'b' → b · 그 밖 = 끔) */
function coastVariant() { const v = process.env.T588_COAST; return (v === '1' || v === 'a') ? 'a' : (v === 'b' ? 'b' : 0); }
function sourceHash(zoneId) {
  const ZC = require('./zone-config');
  // ⚠`require` 캐시가 아니라 **파일 글자**에서 읽는다 — terrain.js 가 적재 뒤 그 객체에 손을 대서(파생 필드) 같은 지형인데 지문이 갈렸다(첫 판 실측).
  if (!_TJ) { try { _TJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'hanbando-terrain.json'), 'utf8')) || {}; } catch (e) { _TJ = {}; } }
  const TJ = _TJ;
  const grp = GROUP.includes(zoneId) ? GROUP : [zoneId];
  // ★[T601] 지형 절에서 굽기 입력이 아닌 칸(광맥 · 마을 후보 · 군락 · 숲 — 물·바위 술어가 안 읽는다)은 뺀다:
  //   광맥 적재(굽기 한 줄 5단계)가 개울 파일 머리를 괜히 갈지 않게(비트는 늘 같았다). 모르는 새 칸은 그대로 든다(보수).
  const _NOT_KIND = ['ores', 'villages', 'groves', 'forests'];
  const kindPart = (t) => { if (!t) return null; const o = {}; for (const k of Object.keys(t)) if (!_NOT_KIND.includes(k)) o[k] = t[k]; return o; };
  const zs = grp.map((id) => { const Z = ZC.ZONES[id] || {}; return [id, Z.worldOffsetX, Z.worldOffsetY, Z.zoneWidth, Z.zoneHeight, kindPart(TJ[id])]; });
  const oceans = Object.values(ZC.ZONES).filter((z) => z.isOcean).map((z) => [z.worldOffsetX, z.worldOffsetY, z.zoneWidth, z.zoneHeight]);
  // ★[T601] 해안 띠(굽기 입력 kind 2)를 바꾸는 입력도 지문에 — 존 해안 칸(`coastBandK` T591 · `coastShift` T604 … zone-config) · 해안 꼴 손잡이 `T588_COAST`(env · chunk.js 와 같은 읽기 — test-streams ⑩ 이 띠로 견준다).
  //   둘 다 json 글자 밖이라 옛 지문이 못 봤다 — 해안 꼴을 켠 존이 끈 판 래스터를 그대로 쓰는 길을 막는다(어긋나면 그 존 개울을 끄고 경고).
  //   존 칸은 이름이 `coast` 로 시작하는 것 전부(띠 배수 `coastBandK` · T604 평행이동 `coastShift` …) — 새 해안 칸이 생겨도 따라온다.
  const coast = [grp.map((id) => { const Z = ZC.ZONES[id] || {}; return Object.keys(Z).filter((k) => /^coast/.test(k)).sort().map((k) => [k, Z[k]]); }), coastVariant()];
  return crypto.createHash('sha1').update(JSON.stringify([FILE_VER, STREAM_A0, MODE, RIP_SEED, RIP_SC, COST_DR, COST_KR, COST_KN, zoneId, zs, oceans, coast])).digest('hex').slice(0, 16);
}
// 파일 — 머리 32바이트('STRM' · 판 · NX · NY · 문턱 · 셀 수 · 지문 8바이트) + deflate(1비트/셀 · 행 우선 · 바이트 안 낮은 비트부터)
function pack(mask, NX, NY) { const bits = new Uint8Array((NX * NY + 7) >> 3); let n = 0; for (let i = 0; i < NX * NY; i++) if (mask[i]) { bits[i >> 3] |= 1 << (i & 7); n++; } return { bits, n }; }
function encodeFile(zoneId, mask, NX, NY, A) {
  const { bits, n } = pack(mask, NX, NY), h = Buffer.alloc(32);
  h.write('STRM', 0, 'ascii'); h.writeUInt32LE(FILE_VER, 4); h.writeUInt32LE(NX, 8); h.writeUInt32LE(NY, 12); h.writeUInt32LE(A, 16); h.writeUInt32LE(n, 20);
  Buffer.from(sourceHash(zoneId), 'hex').copy(h, 24);
  return Buffer.concat([h, zlib.deflateSync(Buffer.from(bits.buffer, bits.byteOffset, bits.byteLength), { level: 9 })]);
}
function decodeFile(buf) {
  if (!buf || buf.length < 32 || buf.toString('ascii', 0, 4) !== 'STRM') throw new Error('개울 파일 머리가 아니다');
  const NX = buf.readUInt32LE(8), NY = buf.readUInt32LE(12), A = buf.readUInt32LE(16), n = buf.readUInt32LE(20), hash = buf.toString('hex', 24, 32);
  const bits = new Uint8Array(zlib.inflateSync(buf.subarray(32)));
  if (bits.length !== ((NX * NY + 7) >> 3)) throw new Error('개울 파일 길이가 머리와 다르다');
  return { ver: buf.readUInt32LE(4), NX, NY, A, n, hash, bits };
}
function fileOf(zoneId) { return path.join(__dirname, 'streams', zoneId + '.bin'); }

// ── 적재(존마다 한 번 · 게으르게) ──
const _Z = new Map();   // zoneId → { NX, NY, bits, n, hash, stale } | null
function load(zoneId) {
  if (_Z.has(zoneId)) return _Z.get(zoneId);
  let r = null;
  if (ON) {
    try {
      const D = decodeFile(fs.readFileSync(fileOf(zoneId)));
      const want = sourceHash(zoneId);
      if (D.hash !== want) { console.warn(`[streams] ⚠${zoneId}: 개울 래스터가 지형과 어긋난다(지문 ${D.hash} ≠ ${want}) — 끈다 · node scripts/bake-streams.js ${zoneId}`); r = null; }
      else r = D;
    } catch (e) { if (e.code !== 'ENOENT') console.warn(`[streams] ${zoneId}: 개울 래스터 적재 실패 — ${e.message}`); r = null; }
  }
  _Z.set(zoneId, r);
  return r;
}
/** ★술어 하나 — 존 로컬 셀(cx,cy)이 개울인가. 개울을 보는 자리(집터·마당·곳간·밭·걸음·길찾기·마시기·그림)는 전부 이것만 부른다. */
function isStreamCell(zoneId, cx, cy) {
  const r = _Z.has(zoneId) ? _Z.get(zoneId) : load(zoneId);
  if (!r || cx < 0 || cy < 0 || cx >= r.NX || cy >= r.NY) return false;
  const i = cy * r.NX + cx;
  return (r.bits[i >> 3] & (1 << (i & 7))) !== 0;
}
/** px 판 — 존 로컬 px 좌표 */
function isStreamLocal(zoneId, x, y) { return isStreamCell(zoneId, Math.floor(x / 32), Math.floor(y / 32)); }
/** 걸음 배율 — 개울 칸이면 STREAM_SLOW0, 아니면 1(서버 이동·클라 예측·NPC 걸음이 같은 수) */
function walkMultAt(zoneId, x, y) { return isStreamLocal(zoneId, x, y) ? STREAM_SLOW0 : 1; }
function stats(zoneId) { const r = load(zoneId); return r ? { zoneId, NX: r.NX, NY: r.NY, cells: r.n, hash: r.hash } : null; }
// 클라에 보내는 래스터(머리 그대로 · 비트는 gzip 으로 — 브라우저가 Content-Encoding 으로 풀어 1비트 판을 받는다)
let _wire = new Map();
function wireOf(zoneId) {
  if (_wire.has(zoneId)) return _wire.get(zoneId);
  const r = load(zoneId); let w = null;
  if (r) { const h = Buffer.alloc(16); h.write('STRM', 0, 'ascii'); h.writeUInt32LE(r.NX, 4); h.writeUInt32LE(r.NY, 8); h.writeUInt32LE(r.n, 12);
    const raw = Buffer.concat([h, Buffer.from(r.bits.buffer, r.bits.byteOffset, r.bits.byteLength)]);
    w = { gz: zlib.gzipSync(raw, { level: 9 }), ver: r.hash, bytes: raw.length }; }
  _wire.set(zoneId, w);
  return w;
}
/** ★[T601 ④] 두 자(t17·t176) 지형 어댑터 deps 에 **같은 술어**를 기본으로 — 초기화 세계(존이 `isStreamLocal` 을 넘겨 시딩이 개울을 본다)를 잰다.
 *  손잡이 `T601_RULER_STREAMS`(기본 켬 · `0` = 옛 정의 = 여섯째·일곱째 판 "개울 없는 자" 판 · 바이트 그대로). 개울 자체가 꺼졌으면(`T585_STREAMS=0`) 끈 판.
 *  돌려주는 `sig` = 씨앗 캐시 표식(래스터 지문 — 끈 판 '' · 다시 구우면 캐시를 버린다). */
function rulerDeps(zoneId, deps) {
  if (process.env.T601_RULER_STREAMS === '0' || !ON) return { deps, sig: '' };
  const st = stats(zoneId);
  if (!st) return { deps, sig: '' };
  return { deps: Object.assign({}, deps, { isStreamLocal: (x, y) => isStreamLocal(zoneId, x, y) }), sig: st.hash };
}
function _reset() { _Z.clear(); _wire = new Map(); }   // 하네스 전용

module.exports = {
  ON, GUARD, STREAM_A0, STREAM_SLOW0, MODE, FILE_VER, GROUP,
  streamFlow, streamMask, streamAudit,
  ripple, heightProxy, bake, sourceHash, pack, encodeFile, decodeFile, fileOf,
  load, isStreamCell, isStreamLocal, walkMultAt, stats, wireOf, rulerDeps, coastVariant, _reset,
};
