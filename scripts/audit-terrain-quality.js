#!/usr/bin/env node
// === scripts/audit-terrain-quality.js — 맵 전수 정밀검사(지형이 지형과 만나는 곳) ===
//
// ★재민 지시: "맵 전수조사해서 어색한 부분 없는지. 지형과 지형이 만날 때, 두 강이 끝과 끝이 만나
//   사실상 이어지는데 갑자기 두께가 급변하지는 않는지."
//
// 지형 결함은 대개 **한 피처 안**이 아니라 **피처가 만나는 데**서 생긴다. 그래서 접합부만 골라 잰다.
//
//   [A] 강 자체 폭 급변      — 이웃 점 사이 폭이 배율 A_JUMP 넘게 튀는 곳(자연 하천은 완만히 넓어진다)
//   [B] 합류 폭 역전         — 지류가 본류에 드는데 **지류가 더 넓다**(물이 좁은 데로 흘러드는 그림)
//   [C] ★끝-끝 접합 두께 급변 — 두 강의 끝점이 붙어 사실상 한 줄기인데 폭이 배율 C_JUMP 넘게 다름
//   [D] 허공에서 끝나는 하구  — 강 끝점이 어떤 물(강·호수·바다)에도 닿지 않는다(상류 발원지는 정상)
//   [E] 셀보다 좁은 강       — width < 셀(32px). 래스터에서 물이 점선처럼 끊긴다
//   [F] 강이 산맥을 관통     — 물이 능선 안을 지나는데 고개가 없다. ※terrain.js 규약상 '물 우선'이라
//                              **의도된 협곡**일 수 있다 → 결함이 아니라 정보로만 센다(강·산맥 쌍으로 묶음)
//   [G] 호수-강 미접속       — 강 끝이 호수 코앞인데 안 닿는다(호수에서 물이 안 나가는 그림)
//   [H] 마을이 물·바위 위    — 마을 중심 셀이 통행 불가
//
// ★[D]에 대한 경고 — 계측기를 먼저 의심할 것
//   처음엔 "끝점 반경 R 링의 물 비율"로 판정하려 했는데, 그 값은 결국 (강폭/원주) 비율이라
//   막다른 강이든 이어지는 강이든 전부 11~13%가 나왔다. 판별력 0이었다.
//   지금은 **흐름 방향으로 전진하며 물이 이어지는지**를 본다(실셀). 이건 갈린다.
//
// 실행: node scripts/audit-terrain-quality.js [zoneId|all] [--json]
'use strict';
const fs = require('fs');
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const ARG = process.argv[2] || 'hanbando';
const JSONOUT = process.argv.includes('--json');
const CELL = 32;
const A_JUMP = 1.60;   // 이웃 점 폭 배율 — 이보다 튀면 급변
const C_JUMP = 1.50;   // 끝-끝 접합 폭 배율
const JOIN_R = 1.20;   // 끝점이 "붙었다"고 볼 거리 = (두 폭 평균)×이 배수
const D_GAP = 3;       // 하구가 물에 닿았다고 볼 여유(셀)

const wOf = (p, rv) => (p.width != null) ? p.width : (rv.width || 200);
const P = (p) => p.pos ? p.pos : [p.x, p.y];

function segDist(x, y, a, b) {
  const ax = a[0], ay = a[1], vx = b[0] - ax, vy = b[1] - ay, L2 = vx * vx + vy * vy || 1;
  let t = ((x - ax) * vx + (y - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(x - (ax + vx * t), y - (ay + vy * t)), t };
}
function toFeat(x, y, rv) {   // 표면까지 거리(음수=안쪽) + 그 지점 폭
  const p = rv.path || []; let best = null;
  for (let i = 0; i < p.length - 1; i++) {
    const r = segDist(x, y, P(p[i]), P(p[i + 1]));
    const w = wOf(p[i], rv) + (wOf(p[i + 1], rv) - wOf(p[i], rv)) * r.t;
    const surf = r.d - w / 2;
    if (!best || surf < best.surf) best = { surf, w, d: r.d };
  }
  return best;
}

function auditZone(ZID) {
  const t = terrain.ZONE_TERRAIN[ZID];
  const Z = ZONES[ZID] || {};
  if (!t) return null;
  const rivers = (t.rivers || []).filter((r) => !r._mirroredFrom);
  const F = { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [], K: [], L: [] };
  const wat = (cx, cy) => terrain.isWaterCellLocal(ZID, cx * CELL + 16, cy * CELL + 16);

  // ── [A] 강 자체 폭 급변 ──────────────────────────────────────────────────
  for (const rv of rivers) {
    const p = rv.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      const w1 = wOf(p[i], rv), w2 = wOf(p[i + 1], rv);
      const lo = Math.min(w1, w2), hi = Math.max(w1, w2);
      if (lo <= 0 || hi / lo < A_JUMP) continue;
      const a = P(p[i]), b = P(p[i + 1]);
      F.A.push({ river: rv.name, i, at: [Math.round(a[0]), Math.round(a[1])], w1: Math.round(w1), w2: Math.round(w2),
        ratio: +(hi / lo).toFixed(2), segLen: Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])) });
    }
  }

  // ── 끝점 목록 ────────────────────────────────────────────────────────────
  const ends = [];
  for (const rv of rivers) {
    const p = rv.path || []; if (p.length < 2) continue;
    ends.push({ rv, kind: 'start', at: P(p[0]), w: wOf(p[0], rv) });
    ends.push({ rv, kind: 'end', at: P(p[p.length - 1]), w: wOf(p[p.length - 1], rv) });
  }

  // ── [B]/[C] 접합부 ───────────────────────────────────────────────────────
  for (const e of ends) {
    let host = null;
    for (const rv of rivers) {
      if (rv === e.rv) continue;
      const r = toFeat(e.at[0], e.at[1], rv);
      if (r && (!host || r.surf < host.r.surf)) host = { rv, r };
    }
    if (!host) continue;
    if (host.r.surf >= Math.max(host.r.w, e.w) * JOIN_R * 0.5) continue;
    if (e.w > host.r.w * 1.05) {
      F.B.push({ tributary: e.rv.name, kind: e.kind, at: [Math.round(e.at[0]), Math.round(e.at[1])],
        wTrib: Math.round(e.w), wMain: Math.round(host.r.w), host: host.rv.name, ratio: +(e.w / host.r.w).toFixed(2) });
    }
    for (const o of ends) {
      if (o.rv !== host.rv) continue;
      const dd = Math.hypot(o.at[0] - e.at[0], o.at[1] - e.at[1]);
      if (dd > (e.w + o.w) / 2 * JOIN_R) continue;
      const lo = Math.min(e.w, o.w), hi = Math.max(e.w, o.w);
      if (lo > 0 && hi / lo >= C_JUMP) {
        F.C.push({ a: e.rv.name + '(' + e.kind + ')', b: o.rv.name + '(' + o.kind + ')',
          at: [Math.round(e.at[0]), Math.round(e.at[1])], gap: Math.round(dd),
          wa: Math.round(e.w), wb: Math.round(o.w), ratio: +(hi / lo).toFixed(2) });
      }
    }
  }

  // ── [D] 허공에서 끝나는 하구 (실셀 전진 판정) ────────────────────────────
  const W = Z.zoneWidth || 0, H = Z.zoneHeight || 0;
  for (const e of ends) {
    const m = Math.max(e.w, CELL * 4);
    if (e.at[0] < m || e.at[1] < m || (W && e.at[0] > W - m) || (H && e.at[1] > H - m)) continue;  // 존 경계 = 바다행
    const ws = (e.rv.path || []).map((p) => wOf(p, e.rv));
    if (e.w <= Math.min(...ws) * 1.15) continue;                                                   // 상류 발원지
    let touch = false;
    for (const rv of rivers) { if (rv === e.rv) continue; const r = toFeat(e.at[0], e.at[1], rv); if (r && r.surf <= D_GAP * CELL) { touch = true; break; } }
    if (!touch) for (const lk of (t.lakes || [])) {
      const c = lk.center; if (!c) continue;
      const rx = lk.rx || lk.radius || 0, ry = lk.ry || lk.radius || 0; if (!rx || !ry) continue;
      const dx = (e.at[0] - c[0]) / (rx + D_GAP * CELL), dy = (e.at[1] - c[1]) / (ry + D_GAP * CELL);
      if (dx * dx + dy * dy <= 1) { touch = true; break; }
    }
    if (touch) continue;
    // ★실셀 확인 — 흐름 방향으로 전진하며 마르는 지점을 잰다(링 비율은 판별력이 없었다)
    const p = e.rv.path;
    const [a, b] = e.kind === 'end' ? [P(p[p.length - 2]), P(p[p.length - 1])] : [P(p[1]), P(p[0])];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let dry = null, again = null;
    for (let k = 1; k <= 40 && dry === null; k++) if (!wat(Math.round((b[0] + ux * k * CELL) / CELL), Math.round((b[1] + uy * k * CELL) / CELL))) dry = k;
    if (dry !== null) for (let k = dry + 1; k <= 60 && again === null; k++) if (wat(Math.round((b[0] + ux * k * CELL) / CELL), Math.round((b[1] + uy * k * CELL) / CELL))) again = k;
    if (dry === null) continue;   // 물이 계속 이어짐 = 결함 아님
    F.D.push({ river: e.rv.name, kind: e.kind, at: [Math.round(e.at[0]), Math.round(e.at[1])], w: Math.round(e.w),
      dryAfterCells: dry, waterAgainAt: again, verdict: again ? ('뭍 ' + (again - dry) + '셀 건너뛰고 다시 물 — 끊긴 물길') : '60셀까지 물 없음 — 막다른 강' });
  }

  // ── [E] 셀보다 좁은 강 ───────────────────────────────────────────────────
  for (const rv of rivers) {
    const p = rv.path || []; let worst = null;
    for (let i = 0; i < p.length; i++) { const w = wOf(p[i], rv); if (!worst || w < worst.w) worst = { w, i, at: P(p[i]) }; }
    if (worst && worst.w < CELL) F.E.push({ river: rv.name, i: worst.i, at: [Math.round(worst.at[0]), Math.round(worst.at[1])], w: Math.round(worst.w) });
  }

  // ── [F] 강이 산맥 관통 (정보) ────────────────────────────────────────────
  const ridges = (t.ridges || []).filter((r) => !r._mirroredFrom);
  const pairs = new Map();
  for (const rv of rivers) for (const q0 of (rv.path || [])) {
    const q = P(q0);
    let hit = null;
    for (const rg of ridges) { const r = toFeat(q[0], q[1], rg); if (r && r.surf < 0) { hit = rg; break; } }
    if (!hit) continue;
    let pass = false;
    for (const ps of (t.passes || [])) if (Math.hypot(q[0] - ps.pos[0], q[1] - ps.pos[1]) < (ps.radius || 1500)) { pass = true; break; }
    if (pass) continue;
    const k = rv.name + '×' + hit.name;
    if (!pairs.has(k)) pairs.set(k, { river: rv.name, ridge: hit.name, pts: 0, at: [Math.round(q[0]), Math.round(q[1])] });
    pairs.get(k).pts++;
  }
  F.F = [...pairs.values()];

  // ── [G] 호수-강 미접속 ───────────────────────────────────────────────────
  for (const lk of (t.lakes || [])) {
    const c = lk.center; if (!c) continue;
    const rx = lk.rx || lk.radius || 0, ry = lk.ry || lk.radius || 0; if (!rx || !ry) continue;
    let best = null;
    for (const e of ends) {
      const k = Math.hypot((e.at[0] - c[0]) / rx, (e.at[1] - c[1]) / ry);
      const gap = (k - 1) * Math.min(rx, ry);
      if (!best || gap < best.gap) best = { gap, e };
    }
    if (!best || best.gap <= 0 || best.gap >= CELL * 20) continue;
    // ★실셀 확인 — 타원 근사라 실제로는 붙어 있을 수 있다. 끝점→호수 중심 직선을 걸어 본다.
    const e = best.e, dx = c[0] - e.at[0], dy = c[1] - e.at[1], L = Math.hypot(dx, dy) || 1;
    let brk = 0;
    for (let k = 0; k <= Math.round(L / CELL); k++) {
      const x = Math.round((e.at[0] + dx / L * k * CELL) / CELL), y = Math.round((e.at[1] + dy / L * k * CELL) / CELL);
      if (!wat(x, y)) brk++;
      else if (brk > 0 && k > 2) break;
    }
    if (brk > 0) F.G.push({ lake: lk.name, river: e.rv.name, gapCells: +(best.gap / CELL).toFixed(1), dryCells: brk, at: [Math.round(e.at[0]), Math.round(e.at[1])] });
  }

  // ── [I]/[J]/[K] 경로 자체의 불연속 — 11차에 실제로 지도를 망가뜨린 셋 ────────
  //   [I] 점프: 병합이 방향을 잘못 맞추면 수백 셀을 가로지르는 직선이 생긴다(살여울천 453셀 실사고)
  //   [J] 꺾임: 획마다 다른 도구로 그려진 게 이어 붙으며 90~180° 모서리로 남는다(눈여울 90°, 옥돌천 180°)
  //   [K] 점밀도: 한쪽만 촘촘하면 같은 강인데 한쪽만 부드럽게 보인다(눈여울 서 74px / 동 178px)
  for (const kind of ['rivers', 'ridges']) {
    for (const rv of (t[kind] || [])) {
      if (rv._mirroredFrom) continue;
      const p = rv.path || []; if (p.length < 4) continue;
      const ds = [];
      for (let i = 0; i < p.length - 1; i++) ds.push(Math.hypot(P(p[i + 1])[0] - P(p[i])[0], P(p[i + 1])[1] - P(p[i])[1]));
      const srt = [...ds].sort((a, b) => a - b), med = srt[srt.length >> 1] || 1;
      ds.forEach((d, i) => { if (d > med * 8 && d > 1000) F.I.push({ feat: kind + '/' + rv.name, i, px: Math.round(d), cells: +(d / CELL).toFixed(0), x: med ? +(d / med).toFixed(0) : 0, at: P(p[i]).map(Math.round) }); });
      let worst = 0, wi = -1;
      for (let i = 1; i < p.length - 1; i++) {
        const a = P(p[i - 1]), b = P(p[i]), c = P(p[i + 1]);
        const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
        const L1 = Math.hypot(v1[0], v1[1]) || 1, L2 = Math.hypot(v2[0], v2[1]) || 1;
        const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (L1 * L2)))) * 180 / Math.PI;
        if (ang > worst) { worst = ang; wi = i; }
      }
      if (worst > 45) F.J.push({ feat: kind + '/' + rv.name, deg: +worst.toFixed(0), at: P(p[wi]).map(Math.round) });
      if (srt[srt.length - 1] > srt[0] * 12 && srt[srt.length - 1] > 400)
        F.K.push({ feat: kind + '/' + rv.name, min: Math.round(srt[0]), med: Math.round(med), max: Math.round(srt[srt.length - 1]), ratio: +(srt[srt.length - 1] / Math.max(1, srt[0])).toFixed(0) });
    }
  }

  // ── [L] 폭 단조성 — 상류에서 하구로 갈수록 굵어져야 한다 ──────────────────
  //   재민 지적: "어디가 상류야? 상류→하류 굵어져야 해."
  //   병합 이음매 taper 가 강 한복판에 봉우리를 만든 적이 있다(살여울천: 양끝 133/371인데 중간 475).
  //   ※양끝이 다 물에 닿는 분류(分流)는 흐름 방향이 하나가 아니므로 제외한다.
  for (const rv of rivers) {
    const p = rv.path || []; if (p.length < 4) continue;
    let inc = 0, dec = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const a = wOf(p[i], rv), b = wOf(p[i + 1], rv);
      if (b > a + 0.5) inc++; else if (b < a - 0.5) dec++;
    }
    if (!(inc && dec)) continue;
    const s0 = P(p[0]), e0 = P(p[p.length - 1]);
    const wetOf = (q) => {
      if (q[0] < 1200 || q[1] < 1200 || (Z.zoneWidth && q[0] > Z.zoneWidth - 1200) || (Z.zoneHeight && q[1] > Z.zoneHeight - 1200)) return true;
      for (const o of rivers) { if (o === rv) continue; const r = toFeat(q[0], q[1], o); if (r && r.surf <= 2 * CELL) return true; }
      for (const lk of (t.lakes || [])) {
        const c = lk.center; if (!c) continue;
        const rx = lk.rx || lk.radius || 0, ry = lk.ry || lk.radius || 0; if (!rx || !ry) continue;
        if (Math.hypot((q[0] - c[0]) / rx, (q[1] - c[1]) / ry) <= 1.05) return true;
      }
      return false;
    };
    if (wetOf(s0) && wetOf(e0)) continue;   // 분류 — 방향 없음
    let mx = 0, mi = 0;
    for (let i = 0; i < p.length; i++) { const w = wOf(p[i], rv); if (w > mx) { mx = w; mi = i; } }
    if (mi === 0 || mi === p.length - 1) continue;
    F.L.push({ river: rv.name, inc, dec, wStart: Math.round(wOf(p[0], rv)), wEnd: Math.round(wOf(p[p.length - 1], rv)), peak: Math.round(mx), peakAt: P(p[mi]).map(Math.round) });
  }

  // ── [H] 마을이 통행 불가 셀 위 ──────────────────────────────────────────
  for (const v of (terrain.getZoneVillages(ZID) || [])) {
    const w = terrain.isWaterCellLocal(ZID, v.x, v.y), r = terrain.isRockCellLocal(ZID, v.x, v.y);
    if (w || r) F.H.push({ village: v.name, at: [Math.round(v.x), Math.round(v.y)], on: w ? '물' : '바위' });
  }
  return F;
}

const zoneIds = ARG === 'all' ? Object.keys(terrain.ZONE_TERRAIN).filter((z) => ZONES[z]) : [ARG];
const all = {};
const LABEL = {
  C: '★끝-끝 접합인데 두께 급변(배율 ≥ ' + C_JUMP + ')',
  B: '합류 폭 역전 — 지류가 본류보다 넓다',
  A: '강 자체 폭 급변(이웃 점 배율 ≥ ' + A_JUMP + ')',
  D: '허공에서 끝나는 하구(실셀 확인)',
  E: '셀(32px)보다 좁은 강 — 래스터에서 끊긴다',
  G: '호수-강 미접속(실셀 확인)',
  H: '마을이 물·바위 위',
  I: '★경로 점프 — 이웃 점이 수백 셀 떨어짐(병합 방향 오류의 흔적)',
  J: '경로 꺾임 45° 초과 — 렌더에서 각진 모서리',
  K: '점밀도 불균일 — 최대/최소 간격 12배 초과',
  L: '★폭 단조성 위반 — 강 한복판이 양 끝보다 굵다(상류→하구로 굵어져야)',
  F: '[정보] 강이 산맥 관통 · 고개 없음 — terrain.js 규약상 물 우선이라 의도된 협곡일 수 있다',
};
const DEFECT = ['I', 'L', 'C', 'B', 'A', 'J', 'K', 'D', 'E', 'G', 'H'];
for (const z of zoneIds) {
  const F = auditZone(z);
  if (!F) { console.log('존 없음:', z); continue; }
  all[z] = F;
  const n = DEFECT.reduce((a, k) => a + F[k].length, 0);
  console.log('\n=== ' + z + ' — 결함 ' + n + '건 (정보 ' + F.F.length + '건 별도) ===');
  for (const k of DEFECT.concat(['F'])) {
    const rows = F[k];
    if (!rows.length) { console.log('  [' + k + '] ' + LABEL[k] + ' — 없음'); continue; }
    console.log('  [' + k + '] ' + LABEL[k] + ' — ' + rows.length + '건');
    for (const r of rows.slice(0, 10)) console.log('      ' + JSON.stringify(r));
    if (rows.length > 10) console.log('      … 외 ' + (rows.length - 10) + '건');
  }
}
if (JSONOUT) { fs.writeFileSync('/tmp/terrain-quality.json', JSON.stringify(all)); console.log('\n→ /tmp/terrain-quality.json'); }
