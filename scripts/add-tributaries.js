#!/usr/bin/env node
// === scripts/add-tributaries.js — 소외 지역으로 **지류**를 뻗는다 ===
//
// ★[11차 재민 확정] "결국은 맵에 소외 지역이 생기고, 그곳에 마을이 있다 보니까 그러는 거 아냐?
//   숲이나 강이나 호수를 늘려야 하나..?" → 지류부터.
//
// 진단(실측 · 8셀 격자 124,279 표본):
//   물·숲 **둘 다 180셀 밖**인 땅이 **10.6%**. 강이 간격 400~600셀 사각 격자라 블록 **속**이 통째로 빈다.
//   (★첫 보고에서 27.5%라고 했는데 그건 내 분류식이 라벨과 안 맞았던 것 — '물 **또는** 숲이 180셀 밖'을
//    '둘 다'라고 적었다. 둘 다인 진짜 값은 10.6%다. 그래도 뭍의 10분의 1이 아무것도 없는 땅이다.)
//   실제 하계망은 수지상(dendritic)이라 2·3차 지류가 블록 안으로 갈라져 든다 — 그게 없다.
//   소외 지역에 앉은 마을 11곳(농촌 8 · 광산 3).
//
// 물거리 하나가 줄면 **비옥도·어업·채집이 동시에** 올라간다(셋 다 물거리 파생).
//   예: 농촌11 물거리 195→20셀이면 비옥도 0.30 → 0.78.
//
// 규칙(전부 기존 감사 규약을 통과하도록)
//   · 흐름: 머리(상류·얇음) → 입(하류·굵음). 폭 단조 증가 — audit-terrain-quality [B][L] 통과용.
//   · 입 폭 ≤ 본류 그 자리 폭 × 0.8 — 지류가 본류보다 굵으면 [B] 역전으로 잡힌다.
//   · 최소 폭 96px(3셀) — 셀보다 좁은 강은 래스터에서 끊긴다([E]).
//   · 바위(산맥) 관통 금지 · 존 밖 금지 · 마을 중심 20셀 안 금지(밭·집이 물에 잠긴다).
//   · 기존 강과 나란히 달리기 금지: 입을 뺀 모든 점이 다른 강에서 60셀 이상.
//
// ★물을 늘리면 뭍이 갈린다 — 11차에 세 번 당했다. 적용 후 반드시 도달성 감사 + repair-bridge-ends.
//
// 실행: node scripts/add-tributaries.js [--max 24] [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const ZID = val('--zone', 'hanbando');
const MAXN = parseInt(val('--max', '24'), 10);
const CELL = 32, S = 8;                  // S = 소외 격자 간격(셀)
const HEAD_W = 96, MOUTH_W = 288;        // 머리 3셀 → 입 9셀
const MIN_SEP = 60;                      // 다른 강과 최소 이격(셀)
const VIL_CLEAR = 20;                    // 마을 중심 금지 반경(셀)
const MIN_COMP = 60;                     // 이보다 작은 소외 덩이는 무시(격자 셀 수)
const HOST_MAX = 600;                    // 본류가 이보다 멀면 포기(셀)
const SEP_UPTO = 0.6;                    // ★이격 검사는 경로 앞 60%만 — 뒤쪽은 입이라 본류에 붙는 게 당연하다
const MULTI_AT = 300;                    // 이보다 큰 덩이는 머리를 여러 개 뽑는다(수지상)
const MULTI_SEP = 120;                   // 같은 덩이 안 머리끼리 최소 간격(셀)
// ★본류 최소 폭 — 실측으로 두 번 올렸다. 128로는 감사가 [B] 역전 10건을 잡았다:
//   내가 만든 지류에 또 지류를 물리면(수지상 2단) 부모의 상류부가 96~120이라 자식 입이 부모보다 굵어진다.
//   200이면 자식은 부모의 **하류부**에만 붙는다 — 실제 하계망도 그렇다.
const HOST_MIN_W = 200;
const HOST_END_CLEAR = 30;               // 본류 양 끝에서 이만큼(셀) 떨어진 자리에만 — 하구끼리 만나면 [C] 급변
// ★[재민 지적] "덤불재천? 저건 지금 산맥이랑 평행해서 이상해" — 실측 확인: 덤불재천은 먹뫼산맥에서
//   36셀 거리에 방위가 둘 다 -173°, 완전 평행이었다. 산줄기와 나란히 흐르는 하천은 자연에 없다
//   (물은 능선을 등지고 **직교 방향으로** 내려간다). 규칙으로 막는다:
//   산맥 중심선에서 RIDGE_NEAR 안을 지나면서 그 구간과 각도 차가 PARA_DEG 미만이면 기각.
const RIDGE_NEAR = 90;                   // 이 거리(셀) 안이면 '산맥 옆'으로 본다
const PARA_DEG = 30;                     // 각도 차가 이보다 작으면 평행으로 본다

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = require(GAME);
const d = world[ZID];
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const Z = ZONES[ZID];
const W = Math.round(Z.zoneWidth / CELL), H = Math.round(Z.zoneHeight / CELL);
const isWater = (x, y) => terrain.isWaterCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const isRock = (x, y) => terrain.isRockCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const isForest = (x, y) => terrain.getForestMultiplier(ZID, x * CELL + 16, y * CELL + 16) > 1.2;
const P = (p) => p.pos ? p.pos : [p.x, p.y];
const rivers = () => (d.rivers || []).filter((r) => !r._mirroredFrom && r.path && r.path.length > 1);

// ── 소외 격자 ──
const gw = Math.ceil(W / S), gh = Math.ceil(H / S);
console.log('=== 지류 배치 · ' + ZID + (APPLY ? ' · 기록' : ' · 계산만') + ' ===');
console.log('소외 격자 ' + gw + '×' + gh + ' 계산…');
const kind = new Uint8Array(gw * gh);
for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
  const x = gx * S + (S >> 1), y = gy * S + (S >> 1);
  kind[gy * gw + gx] = isWater(x, y) ? 1 : (isRock(x, y) ? 2 : (isForest(x, y) ? 3 : 0));
}
function chamfer(pred) {
  const INF = 1 << 28, a = new Int32Array(gw * gh);
  for (let i = 0; i < a.length; i++) a[i] = pred(i) ? 0 : INF;
  const up = (i, j, c) => { if (a[j] + c < a[i]) a[i] = a[j] + c; };
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (!a[i]) continue; if (x > 0) up(i, i - 1, 5); if (y > 0) up(i, i - gw, 5); if (x > 0 && y > 0) up(i, i - gw - 1, 7); if (x < gw - 1 && y > 0) up(i, i - gw + 1, 7); }
  for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (!a[i]) continue; if (x < gw - 1) up(i, i + 1, 5); if (y < gh - 1) up(i, i + gw, 5); if (x < gw - 1 && y < gh - 1) up(i, i + gw + 1, 7); if (x > 0 && y < gh - 1) up(i, i + gw - 1, 7); }
  return a;
}
const DW = chamfer((i) => kind[i] === 1), DF = chamfer((i) => kind[i] === 3);
const cellD = (a, i) => a[i] / 5 * S;
const severe = (i) => kind[i] !== 1 && kind[i] !== 2 && cellD(DW, i) >= 180 && cellD(DF, i) >= 180;
let sev = 0, landN = 0;
for (let i = 0; i < kind.length; i++) { if (kind[i] === 1 || kind[i] === 2) continue; landN++; if (severe(i)) sev++; }
console.log('  심각(물·숲 둘 다 180셀 밖) ' + (sev / landN * 100).toFixed(1) + '% — 뭍 표본 ' + landN.toLocaleString());

// ── 소외 덩이 라벨링 → 중심 ──
const lab = new Int32Array(gw * gh).fill(-1);
const comps = [];
for (let i = 0; i < kind.length; i++) {
  if (lab[i] >= 0 || !severe(i)) continue;
  const id = comps.length, st = [i]; lab[i] = id;
  let sx = 0, sy = 0, n = 0, best = null, bd = -1;
  const mem = [];
  while (st.length) {
    const q = st.pop(); const x = q % gw, y = (q - x) / gw;
    sx += x; sy += y; n++;
    const dwv = cellD(DW, q); mem.push([x, y, dwv]);
    if (dwv > bd) { bd = dwv; best = [x, y]; }   // 덩이에서 가장 물 먼 점 = 지류 머리
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const k = ny * gw + nx; if (lab[k] >= 0 || !severe(k)) continue; lab[k] = id; st.push(k);
    }
  }
  // ★큰 덩이는 머리를 여러 개 — 물에서 먼 순으로, 서로 MULTI_SEP 셀 이상 떨어진 점만
  mem.sort((a, b) => b[2] - a[2]);
  const heads = [];
  const want = n >= MULTI_AT ? Math.min(4, 1 + Math.floor(n / MULTI_AT)) : 1;
  for (const m of mem) {
    if (heads.length >= want) break;
    const hx = m[0] * S, hy = m[1] * S;
    if (heads.some((h) => Math.hypot(h[0] * S - hx, h[1] * S - hy) < MULTI_SEP)) continue;
    heads.push([m[0], m[1]]);
  }
  comps.push({ id, n, cx: Math.round(sx / n), cy: Math.round(sy / n), head: best, heads, worstDW: bd });
}
comps.sort((a, b) => b.n - a.n);
console.log('  소외 덩이 ' + comps.length + '개 · ' + MIN_COMP + '격자셀 이상 ' + comps.filter((c) => c.n >= MIN_COMP).length + '개');

// ── 이름 풀 — 실제 하천 접미(천·내). 모자라면 번호 ──
const NAMES = ['가랑천', '한들천', '노루내', '버들천', '덤불재천', '솔안천', '고래실천', '너래천', '싸리내', '돌마천',
  '옻샘천', '무들천', '배티천', '산막천', '자갈내', '늪실천', '벌미르내', '진뫼천', '수라천', '개암천',
  '억새내', '홈골천', '느티천', '샛말천'];
const used = new Set((d.rivers || []).map((r) => r.name));

// ── 헬퍼: 셀 좌표 → 가장 가까운 본류 점(그 자리 폭까지) ──
function nearestRiver(cx, cy, skipName) {
  let best = null;
  for (const r of rivers()) {
    if (skipName && r.name === skipName) continue;
    const n = r.path.length; if (n < 3) continue;
    const p0 = P(r.path[0]), pN = P(r.path[n - 1]);
    for (let i = 1; i < n - 1; i++) {
      // ★주변(±2점) **최소** 폭으로 본다 — 감사는 합류점 폭을 보간해 재므로 점 하나만 굵어도 옆이 얇으면 역전이다
      let w0 = Infinity;
      for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) w0 = Math.min(w0, r.path[k].width || r.width || 200);
      if (w0 < HOST_MIN_W) continue;
      const q = P(r.path[i]);
      if (Math.hypot(q[0] - p0[0], q[1] - p0[1]) / CELL < HOST_END_CLEAR) continue;
      if (Math.hypot(q[0] - pN[0], q[1] - pN[1]) / CELL < HOST_END_CLEAR) continue;
      const dd = Math.hypot(q[0] / CELL - cx, q[1] / CELL - cy);
      if (!best || dd < best.d) best = { d: dd, x: q[0] / CELL, y: q[1] / CELL, w: w0, host: r.name };
    }
  }
  return best;
}
// 점이 어떤 강에서 얼마나 떨어졌나(셀) — 폭 고려 안 함(중심선 기준)
function riverDist(cx, cy, skipName) {
  let m = Infinity;
  for (const r of rivers()) { if (skipName && r.name === skipName) continue; for (let i = 0; i < r.path.length - 1; i++) {
    const a = P(r.path[i]), b = P(r.path[i + 1]);
    const ax = a[0] / CELL, ay = a[1] / CELL, bx = b[0] / CELL, by = b[1] / CELL;
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    let t = ((cx - ax) * vx + (cy - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
    const dd = Math.hypot(cx - (ax + vx * t), cy - (ay + vy * t));
    if (dd < m) m = dd;
  } }
  return m;
}
const villages = (terrain.getZoneVillages(ZID) || []).map((v) => [Math.round(v.x / CELL), Math.round(v.y / CELL), v.name]);
const ridgeSegs = [];
for (const r of (d.ridges || [])) {
  if (r._mirroredFrom || !r.path) continue;
  for (let i = 0; i < r.path.length - 1; i++) {
    const a = P(r.path[i]), b = P(r.path[i + 1]);
    ridgeSegs.push({ ax: a[0] / CELL, ay: a[1] / CELL, bx: b[0] / CELL, by: b[1] / CELL, name: r.name });
  }
}
// 산맥과 나란한가 — 경로의 어느 점이든 산맥 90셀 안에서 각도 차 30° 미만이면 평행
function parallelToRidge(pts) {
  const dx0 = pts[pts.length - 1][0] - pts[0][0], dy0 = pts[pts.length - 1][1] - pts[0][1];
  const A = Math.atan2(dy0, dx0);
  for (const s2 of ridgeSegs) {
    // 경로 중간점들과 이 구간의 최단거리
    let near = Infinity;
    for (const q of pts) {
      const vx = s2.bx - s2.ax, vy = s2.by - s2.ay, L2 = vx * vx + vy * vy || 1;
      let t = ((q[0] - s2.ax) * vx + (q[1] - s2.ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const dd = Math.hypot(q[0] - (s2.ax + vx * t), q[1] - (s2.ay + vy * t));
      if (dd < near) near = dd;
    }
    if (near > RIDGE_NEAR) continue;
    const B = Math.atan2(s2.by - s2.ay, s2.bx - s2.ax);
    let diff = Math.abs(A - B) * 180 / Math.PI; diff %= 180; if (diff > 90) diff = 180 - diff;
    if (diff < PARA_DEG) return { name: s2.name, near: Math.round(near), diff: Math.round(diff) };
  }
  return null;
}

// ── 지류 한 줄 만들기: 머리(소외 덩이 안) → 입(본류) ──
function makeTrib(comp) {
  const hx = comp.head[0] * S + (S >> 1), hy = comp.head[1] * S + (S >> 1);
  const host = nearestRiver(hx, hy);
  if (!host) return { skip: '본류 없음' };
  const L = Math.hypot(host.x - hx, host.y - hy);
  if (L < 40) return { skip: '본류가 ' + Math.round(L) + '셀 — 이미 가깝다' };
  if (L > HOST_MAX) return { skip: '본류가 ' + Math.round(L) + '셀 — 너무 멀다' };
  // 머리→입 직선을 5점으로 나누고 가운데를 살짝 휘게(직선 하천은 없다)
  const nx = (host.x - hx) / L, ny = (host.y - hy) / L, px = -ny, py = nx;
  const bend = Math.min(18, L * 0.10);
  const pts = [];
  const N = 5;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const off = Math.sin(t * Math.PI) * bend * (comp.id % 2 ? 1 : -1);
    pts.push([Math.round(hx + nx * L * t + px * off), Math.round(hy + ny * L * t + py * off)]);
  }
  // 검사: 바위·존밖·마을·기존 강 근접
  // ★입 폭은 **무조건 본류의 0.8배 이하**. 예전엔 바닥값(HEAD_W+32=128)을 먼저 씌워서
  //   얇은 본류(96~120)에 붙으면 128 > 본류가 되어 [B] 역전이 났다 — 바닥값을 없앤다.
  const mouthW = Math.min(MOUTH_W, Math.floor(host.w * 0.8));
  if (mouthW < HEAD_W) return { skip: '본류가 얇아 입이 ' + mouthW + 'px — 3셀 미달' };
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) return { skip: '존 밖' };
    if (isRock(x, y)) return { skip: '바위 관통' };

    if (i / (pts.length - 1) <= SEP_UPTO) {
      const rd = riverDist(x, y, host.host);
      if (rd < MIN_SEP) return { skip: '기존 강에서 ' + Math.round(rd) + '셀 — 나란히 달림' };
    }
  }
  // 중간 샘플도 검사 — 점 사이가 뚫려 있을 수 있다.
  // ★[재민 지적으로 드러난 버그] 마을 이격을 **점에서만** 재다가 늪실천이 농촌2 중심을 2.2셀 관통했다
  //   (점 사이 구간이 마을을 스쳐 지나갔고, 강 폭 절반도 안 세고 있었다). 구간 보간 + 폭 고려로 잡는다.
  const halfMax = MOUTH_W / 2 / CELL;
  for (let i = 0; i < pts.length - 1; i++) {
    const steps = Math.ceil(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
    for (let k = 0; k <= steps; k += 2) {
      const t = k / steps, x = Math.round(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t), y = Math.round(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t);
      if (isRock(x, y)) return { skip: '바위 관통(구간)' };
      for (const [vx, vy, vn] of villages) {
        const dd = Math.hypot(x - vx, y - vy) - halfMax;
        if (dd < VIL_CLEAR) return { skip: '마을 ' + vn + ' 에서 ' + Math.round(dd) + '셀(폭 감안)' };
      }
    }
  }
  // ★산맥과 나란한 하천은 기각(자연에 없다 — 물은 능선과 직교로 내려간다)
  const par = parallelToRidge(pts);
  if (par) return { skip: par.name + '과 나란함(' + par.near + '셀 거리 · 각도차 ' + par.diff + '°)' };
  // 폭: 머리 → 입 단조 증가
  const pathOut = pts.map((q, i) => ({ pos: [q[0] * CELL + 16, q[1] * CELL + 16], width: Math.round(HEAD_W + (mouthW - HEAD_W) * (i / (pts.length - 1))) }));
  return { path: pathOut, len: Math.round(L), host: host.host, mouthW, headCell: [hx, hy] };
}

const made = [], skipped = [];
for (const c of comps) {
  if (made.length >= MAXN) break;
  if (c.n < MIN_COMP) continue;
  for (const hd of (c.heads || [c.head])) {
    if (made.length >= MAXN) break;
    const t = makeTrib({ ...c, head: hd });
    if (t.skip) { skipped.push([c.n, t.skip]); continue; }
    const name = NAMES.find((n) => !used.has(n)) || ('지류' + (made.length + 1) + '천');
    used.add(name);
    d.rivers.push({ name, path: t.path, _tributary: true });   // ★즉시 반영 — 다음 지류의 '기존 강 이격' 검사가 이걸 본다
    made.push({ name, ...t, comp: c.n });
    console.log('  「' + name + '」 ' + t.headCell.join(',') + ' → ' + t.host + ' · 길이 ' + t.len + '셀 · 폭 3→' + (t.mouthW / CELL).toFixed(0) + '셀 · 소외덩이 ' + c.n + '격자');
  }
}
console.log('\n만든 지류 ' + made.length + '개');
if (skipped.length) {
  const agg = {};
  for (const [, why] of skipped) { const k = why.replace(/\d+/g, 'N'); agg[k] = (agg[k] || 0) + 1; }
  console.log('건너뜀 ' + skipped.length + ': ' + Object.entries(agg).map(([k, v]) => k + '×' + v).join(' · '));
}
if (!APPLY) { console.log('\n계산만 — 쓰려면 --apply'); process.exit(0); }
if (!made.length) { console.log('쓸 것 없음'); process.exit(0); }
fs.copyFileSync(GAME, GAME + '.bak');
fs.writeFileSync(GAME, JSON.stringify(world));
console.log('\n★기록 완료 (백업 .bak)');
console.log('★물을 늘렸으니 반드시: audit-reachability → repair-bridge-ends → audit-terrain-quality');
