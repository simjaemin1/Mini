#!/usr/bin/env node
// === scripts/build-map.js — 맵 단일 빌드 파이프라인 ===
//
// ★재민 지시: "맵 에디터에서 지형 추가하고 나면, **한 번의 빌드 과정**을 거쳐, 그걸 전부 셀 단위로
//   실제 게임에 이용될 맵으로 변환하는 거야. 그 다음 다리를 추가하는 거지."
//
// 지금까지 이건 흩어져 있었다 — import-design → build-terrain-v3(알고 보니 구세대) → 손 → plan-bridges
// → 손으로 zone-config 붙여넣기. 중간에 뭐가 빠졌는지 아무도 몰랐고, 실제로 구세대 빌더가 게임 파일을
// 통째로 덮어쓰는 지뢰까지 있었다(0525fb6). 이 스크립트가 그 전부를 한 줄로 만든다.
//
//   1단계 흡수   에디터 Export(또는 현행 게임 파일) → 존 지형 객체
//   2단계 정규화 접합부 결함을 계산해 고친다 — 폭 급변 · 합류 폭 역전 · 막다른 하구
//                ★기본은 계산만. --fix 를 줘야 실제로 손댄다. 지도를 말없이 바꾸지 않는다.
//   3단계 셀 확정 게임 terrain.js 판정 그대로 전 존을 셀로 굳힌다 — 이게 판정 정본이다
//   4단계 다리   실셀 BFS로 끊긴 성분을 찾고, 성분마다 **자리 품질까지 보는** 도하점을 고른다
//                (합류부 배제 · 교두보 넓이 하한 · 최단) — 연결성만 보던 옛 계획기의 결함 교정
//   5단계 검증   지형 품질 + 도달성 전수 + 다리 자리를 한 번에 리포트
//
// 실행:
//   node scripts/build-map.js                          # 현행 지형 시험빌드(아무것도 안 쓴다)
//   node scripts/build-map.js --in <editor.json>       # 에디터 산출물에서 빌드
//   node scripts/build-map.js --fix                    # 2단계 정규화 실제 적용(메모리상)
//   node scripts/build-map.js --fix --apply            # 게임 파일에 기록(.bak 남김)
//   node scripts/build-map.js --plan-bridges           # 4단계에서 새 다리 자리까지 계획
'use strict';
const fs = require('fs');
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const IN = val('--in', null);
const FIX = has('--fix');
const APPLY = has('--apply');
const PLANBR = has('--plan-bridges');
const CELL = 32;
const GAME_JSON = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');

const log = console.log;
const R = Math.round;
const Pt = (p) => p.pos ? p.pos : [p.x, p.y];
const wOf = (p, rv) => (p.width != null) ? p.width : (rv.width || 200);

log('════ 맵 단일 빌드 · ' + ZID + (FIX ? ' · 정규화 적용' : ' · 정규화 계산만') + (APPLY ? ' · 기록' : ' · 시험빌드') + ' ════');

// ══ 1단계 · 흡수 ═══════════════════════════════════════════════════════════
log('\n[1/5] 흡수');
let world;
if (IN) {
  const j = JSON.parse(fs.readFileSync(IN, 'utf8'));
  world = (j.multi && j.zones) ? j.zones : (j[ZID] ? j : { [j.zone || ZID]: j });
  log('  입력: ' + IN + ' (에디터 산출물)');
} else {
  world = JSON.parse(fs.readFileSync(GAME_JSON, 'utf8'));
  log('  입력: server/hanbando-terrain.json (현행 게임 로드본)');
}
const d = world[ZID];
if (!d) { console.error('  존 없음: ' + ZID + ' — 있는 존: ' + Object.keys(world).join(',')); process.exit(2); }
const rivers = (d.rivers || []).filter((r) => !r._mirroredFrom);
log('  ' + ZID + ': 강 ' + (d.rivers || []).length + '(본 ' + rivers.length + ') · 산맥 ' + (d.ridges || []).length
  + ' · 숲 ' + (d.forests || []).length + ' · 호수 ' + (d.lakes || []).length + ' · 고개 ' + (d.passes || []).length
  + ' · 마을 ' + (d.villages || []).length);

// ══ 2단계 · 정규화 ═════════════════════════════════════════════════════════
log('\n[2/5] 정규화 — 접합부');
const A_JUMP = 1.60, JOIN_R = 1.20;
function segDist(x, y, a, b) {
  const ax = a[0], ay = a[1], vx = b[0] - ax, vy = b[1] - ay, L2 = vx * vx + vy * vy || 1;
  let t = ((x - ax) * vx + (y - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(x - (ax + vx * t), y - (ay + vy * t)), t };
}
function toFeat(x, y, rv) {
  const p = rv.path || []; let best = null;
  for (let i = 0; i < p.length - 1; i++) {
    const r = segDist(x, y, Pt(p[i]), Pt(p[i + 1]));
    const w = wOf(p[i], rv) + (wOf(p[i + 1], rv) - wOf(p[i], rv)) * r.t;
    const surf = r.d - w / 2;
    if (!best || surf < best.surf) best = { surf, w, d: r.d };
  }
  return best;
}
const endsOf = () => {
  const e = [];
  for (const rv of rivers) {
    const p = rv.path || []; if (p.length < 2) continue;
    e.push({ rv, kind: 'start', idx: 0, at: Pt(p[0]), w: wOf(p[0], rv) });
    e.push({ rv, kind: 'end', idx: p.length - 1, at: Pt(p[p.length - 1]), w: wOf(p[p.length - 1], rv) });
  }
  return e;
};
const plan = { widthJump: [], inversion: [], deadEnd: [] };

// ① 자체 폭 급변 — 배율을 A_JUMP 로 클램프. ★항상 좁은 쪽을 넓히는 쪽으로만 고친다
//    (넓은 쪽을 줄이면 강이 가늘어져 셀 래스터에서 끊길 수 있다 — [E] 결함을 새로 만드는 짓)
for (const rv of rivers) {
  const p = rv.path || [];
  for (let i = 0; i < p.length - 1; i++) {
    const w1 = wOf(p[i], rv), w2 = wOf(p[i + 1], rv);
    const lo = Math.min(w1, w2), hi = Math.max(w1, w2);
    if (lo <= 0 || hi / lo < A_JUMP) continue;
    const want = hi / A_JUMP, j = (w1 < w2) ? i : i + 1;
    plan.widthJump.push({ river: rv.name, i, from: R(lo), to: R(want), at: Pt(p[j]).map(R) });
    if (FIX) p[j].width = R(want);
  }
}
// ② 합류 폭 역전 — 지류 하구가 본류보다 넓으면 본류의 95%로 줄인다
for (const e of endsOf()) {
  let host = null;
  for (const rv of rivers) { if (rv === e.rv) continue; const r = toFeat(e.at[0], e.at[1], rv); if (r && (!host || r.surf < host.r.surf)) host = { rv, r }; }
  if (!host || host.r.surf >= Math.max(host.r.w, e.w) * JOIN_R * 0.5) continue;
  if (e.w <= host.r.w * 1.05) continue;
  const want = host.r.w * 0.95;
  plan.inversion.push({ tributary: e.rv.name, host: host.rv.name, at: e.at.map(R), from: R(e.w), to: R(want), ratio: +(e.w / host.r.w).toFixed(2) });
  if (FIX) e.rv.path[e.idx].width = R(want);
}
// ③ 막다른 하구 — 계산만. ★물길을 어디로 흘려보낼지는 지도의 뜻이라 자동으로 정하지 않는다.
const Z = ZONES[ZID] || {};
for (const e of endsOf()) {
  const m = Math.max(e.w, CELL * 4);
  if (e.at[0] < m || e.at[1] < m || (Z.zoneWidth && e.at[0] > Z.zoneWidth - m) || (Z.zoneHeight && e.at[1] > Z.zoneHeight - m)) continue;
  const ws = (e.rv.path || []).map((p) => wOf(p, e.rv));
  if (e.w <= Math.min(...ws) * 1.15) continue;
  let best = null;
  for (const rv of rivers) { if (rv === e.rv) continue; const r = toFeat(e.at[0], e.at[1], rv); if (r && (!best || r.surf < best.surf)) best = { surf: r.surf, name: rv.name, kind: '강' }; }
  for (const lk of (d.lakes || [])) {
    const c = lk.center; if (!c) continue;
    const rx = lk.rx || lk.radius || 0, ry = lk.ry || lk.radius || 0; if (!rx || !ry) continue;
    const k = Math.hypot((e.at[0] - c[0]) / rx, (e.at[1] - c[1]) / ry);
    const surf = (k - 1) * Math.min(rx, ry);
    if (!best || surf < best.surf) best = { surf, name: lk.name, kind: '호수' };
  }
  if (!best || best.surf <= CELL * 3) continue;
  plan.deadEnd.push({ river: e.rv.name, kind: e.kind, at: e.at.map(R), w: R(e.w), nearest: best.kind + ' ' + best.name, gapCells: +(best.surf / CELL).toFixed(1) });
}
log('  ① 폭 급변     ' + plan.widthJump.length + '건' + (plan.widthJump.length ? (FIX ? ' → 좁은 쪽을 넓혀 배율 ' + A_JUMP + ' 이하로' : ' (계산만)') : ''));
log('  ② 합류 폭 역전 ' + plan.inversion.length + '건' + (plan.inversion.length ? (FIX ? ' → 지류 하구를 본류의 95%로' : ' (계산만)') : ''));
for (const r of plan.inversion.slice(0, 6)) log('       ' + r.tributary + ' ' + r.from + 'px → ' + r.host + ' 대비 ' + r.ratio + '배' + (FIX ? '  → ' + r.to + 'px' : ''));
log('  ③ 막다른 하구  ' + plan.deadEnd.length + '건  ★자동 수정 안 함 — 물길을 어디로 보낼지는 사람이 정한다');
for (const r of plan.deadEnd.slice(0, 6)) log('       ' + r.river + '(' + r.kind + ') 폭 ' + r.w + ' @' + r.at + ' — 가장 가까운 ' + r.nearest + '까지 ' + r.gapCells + '셀');
if (plan.deadEnd.length > 6) log('       … 외 ' + (plan.deadEnd.length - 6) + '건');
if (FIX && terrain.setHardcoded) terrain.setHardcoded(world);   // 정규화 결과를 이후 셀 판정에 반영

// ══ 3단계 · 셀 확정 ════════════════════════════════════════════════════════
log('\n[3/5] 셀 확정 — 게임 terrain.js 판정 그대로');
const NX = Math.floor(Z.zoneWidth / CELL), NY = Math.floor(Z.zoneHeight / CELL), N = NX * NY;
const memo = new Uint8Array(N);
function kind(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) return 3;
  const i = cy * NX + cx; let v = memo[i];
  if (v) return v;
  v = terrain.isWaterCellLocal(ZID, cx * CELL + 16, cy * CELL + 16) ? 2 : (terrain.isRockCellLocal(ZID, cx * CELL + 16, cy * CELL + 16) ? 3 : 1);
  memo[i] = v; return v;
}
let t0 = Date.now(), nW = 0, nR = 0;
for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const k = kind(x, y); if (k === 2) nW++; else if (k === 3) nR++; }
log('  ' + NX + '×' + NY + ' = ' + N.toLocaleString() + '칸 · 물 ' + nW.toLocaleString() + '(' + (nW / N * 100).toFixed(1) + '%) · 바위 '
  + nR.toLocaleString() + '(' + (nR / N * 100).toFixed(1) + '%) · 뭍 ' + (N - nW - nR).toLocaleString() + ' · ' + (Date.now() - t0) + 'ms');

// ══ 4단계 · 다리 ═══════════════════════════════════════════════════════════
log('\n[4/5] 다리');
const BFS_R = 40, CAP_A = (BFS_R * 2 + 1) * (BFS_R * 2 + 1), WEDGE = CAP_A * 0.10, CONFL = 12;
function headArea(cx, cy) {
  if (kind(cx, cy) !== 1) return 0;
  const vis = new Set([cx + ',' + cy]); const q = [[cx, cy]]; let n = 0;
  while (q.length) {
    const [x, y] = q.shift(); n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (vis.has(k) || Math.abs(nx - cx) > BFS_R || Math.abs(ny - cy) > BFS_R || kind(nx, ny) !== 1) continue;
      vis.add(k); q.push([nx, ny]);
    }
  }
  return n;
}
// ★본류 = 중심선이 가장 가까운 강 하나. (합류부 한복판에서는 두 강이 모두 '안'이라
//   '0셀 안의 강 = 본류'로 잡으면 다른 강이 0개가 되어 합류부를 못 본다 — 6581c36에서 잡은 계측기 결함)
function mainRiverAt(cx, cy) {
  let best = null;
  for (const rv of rivers) for (let i = 0; i < (rv.path || []).length - 1; i++) {
    const r = segDist(cx * CELL, cy * CELL, Pt(rv.path[i]), Pt(rv.path[i + 1]));
    if (!best || r.d < best.d) best = { d: r.d, name: rv.name };
  }
  return best && best.name;
}
function othersNear(cx, cy, rc) {
  const own = mainRiverAt(cx, cy), out = new Set();
  for (const rv of rivers) { if (rv.name === own) continue; const r = toFeat(cx * CELL, cy * CELL, rv); if (r && r.surf < rc * CELL) out.add(rv.name); }
  return [...out];
}
function flood(bridgeSet, sx, sy) {
  const seen = new Uint8Array(N), q = new Int32Array(N + 16);
  let head = 0, tail = 0;
  const blk = (cx, cy) => { const k = kind(cx, cy); return k === 3 ? true : (k === 2 ? !bridgeSet.has(cx + '_' + cy) : false); };
  const push = (cx, cy) => { const i = cy * NX + cx; if (seen[i]) return; seen[i] = 1; q[tail++] = i; };
  if (!blk(sx, sy)) push(sx, sy);
  while (head < tail) {
    const i = q[head++], cx = i % NX, cy = (i / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY || blk(nx, ny)) continue;
      push(nx, ny);
    }
  }
  return { seen, n: tail };
}
const curCells = [];
{ const b = (Z.bridges || []); for (let i = 0; i + 1 < b.length; i += 2) curCells.push([b[i], b[i + 1]]); }
const curSet = new Set(curCells.map((c) => c[0] + '_' + c[1]));
const sx = Math.round(Z.mainSquare.x / CELL), sy = Math.round(Z.mainSquare.y / CELL);
const vs = terrain.getZoneVillages(ZID) || [];
const reached = (seen, R2) => {
  R2 = R2 || 8; const out = new Set();
  for (const v of vs) {
    const cx = Math.round(v.x / CELL), cy = Math.round(v.y / CELL); let ok = false;
    for (let dy = -R2; dy <= R2 && !ok; dy++) for (let dx = -R2; dx <= R2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < NX && y < NY && seen[y * NX + x]) { ok = true; break; }
    }
    if (ok) out.add(v.name);
  }
  return out;
};
t0 = Date.now();
const off = flood(new Set(), sx, sy), on = flood(curSet, sx, sy);
const vOff = reached(off.seen), vOn = reached(on.seen);
log('  현행 다리 ' + curCells.length + '셀 — 도보 도달 ' + off.n.toLocaleString() + ' → ' + on.n.toLocaleString()
  + '칸 · 마을 ' + vOff.size + ' → ' + vOn.size + '/' + vs.length + ' · ' + (Date.now() - t0) + 'ms');
const unreach = vs.filter((v) => !vOn.has(v.name)).map((v) => v.name);
log('  아직 못 닿는 마을: ' + (unreach.length ? unreach.join(', ') : '없음'));

// 현행 다리 자리 품질
const kk = (c) => c[0] + ',' + c[1], cset2 = new Set(curCells.map(kk)), seenG = new Set(), groups = [];
for (const c of curCells) {
  if (seenG.has(kk(c))) continue;
  const st = [c]; seenG.add(kk(c)); const g = [];
  while (st.length) { const q2 = st.pop(); g.push(q2); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k2 = (q2[0] + dx) + ',' + (q2[1] + dy); if (cset2.has(k2) && !seenG.has(k2)) { seenG.add(k2); st.push([q2[0] + dx, q2[1] + dy]); } } }
  groups.push(g);
}
let badSite = 0;
groups.forEach((g, gi) => {
  const xs = g.map((c) => c[0]), ys = g.map((c) => c[1]);
  const mid = [R((Math.min(...xs) + Math.max(...xs)) / 2), R((Math.min(...ys) + Math.max(...ys)) / 2)];
  const o = othersNear(mid[0], mid[1], CONFL);
  const axis = (Math.max(...ys) - Math.min(...ys)) >= (Math.max(...xs) - Math.min(...xs)) ? '남북' : '동서';
  const [dx, dy] = axis === '남북' ? [0, 1] : [1, 0];
  let a = 0; while (a < 400 && kind(mid[0] - dx * a, mid[1] - dy * a) === 2) a++;
  let b2 = 0; while (b2 < 400 && kind(mid[0] + dx * b2, mid[1] + dy * b2) === 2) b2++;
  const A1 = headArea(mid[0] - dx * a, mid[1] - dy * a), A2 = headArea(mid[0] + dx * b2, mid[1] + dy * b2);
  const bad = [];
  if (o.length) bad.push('합류부(' + o.join('·') + ')');
  if (Math.min(A1, A2) < WEDGE) bad.push('교두보 쐐기 ' + Math.min(A1, A2) + '칸');
  if (bad.length) { badSite++; log('  ★다리#' + (gi + 1) + ' 자리 부적격 — ' + bad.join(' + ')); }
});
log('  자리 감사: ' + groups.length + '개 중 부적격 ' + badSite + '개' + (badSite ? '  → scripts/replan-bridge-sites.js' : ''));

// 새 다리 계획 — 아직 못 닿는 성분마다 자리 품질을 만족하는 최단 도하
if (PLANBR && unreach.length) {
  log('  [계획] 못 닿는 마을 ' + unreach.length + '개에 대해 도하 후보 탐색');
  for (const name of unreach) {
    const v = vs.find((x) => x.name === name);
    const vcx = Math.round(v.x / CELL), vcy = Math.round(v.y / CELL);
    let found = null;
    for (let r = 4; r <= 200 && !found; r += 2) {
      for (const [dx, dy, axis] of [[0, 1, '남북'], [1, 0, '동서']]) {
        for (let s = -r; s <= r && !found; s += 2) {
          const cx = vcx + (axis === '남북' ? s : 0), cy = vcy + (axis === '남북' ? 0 : s);
          if (kind(cx, cy) !== 2) continue;
          if (othersNear(cx, cy, CONFL).length) continue;
          let a2 = 0; while (a2 < 220 && kind(cx - dx * a2, cy - dy * a2) === 2) a2++;
          let b3 = 0; while (b3 < 220 && kind(cx + dx * b3, cy + dy * b3) === 2) b3++;
          if (a2 >= 220 || b3 >= 220) continue;
          const h1 = [cx - dx * a2, cy - dy * a2], h2 = [cx + dx * b3, cy + dy * b3];
          const A1 = headArea(h1[0], h1[1]), A2 = headArea(h2[0], h2[1]);
          if (Math.min(A1, A2) < WEDGE) continue;
          found = { axis, span: a2 + b3 - 1, h1, h2, A1, A2 };
        }
      }
    }
    log('    ' + name + ' → ' + (found ? (found.axis + ' 도하 ' + found.span + '셀 · 교두보 ' + found.A1 + '/' + found.A2 + '  [' + found.h1 + '] ~ [' + found.h2 + ']')
      : '200셀 안에 적격 도하 없음 — 다리가 아니라 배가 답이다(항해 층)'));
  }
}

// ══ 5단계 · 검증·기록 ══════════════════════════════════════════════════════
log('\n[5/5] 검증·기록');
const report = {
  zone: ZID, fix: FIX, apply: APPLY,
  cells: { nx: NX, ny: NY, water: nW, rock: nR, land: N - nW - nR },
  reach: { off: off.n, on: on.n, villages: vOn.size, total: vs.length, unreachable: unreach },
  bridges: { cells: curCells.length, groups: groups.length, badSite },
  plan: { widthJump: plan.widthJump.length, inversion: plan.inversion.length, deadEnd: plan.deadEnd.length },
  detail: plan,
};
fs.writeFileSync('/tmp/build-map-report.json', JSON.stringify(report));
log('  리포트 → /tmp/build-map-report.json');
if (APPLY && FIX) {
  fs.copyFileSync(GAME_JSON, GAME_JSON + '.bak');
  fs.writeFileSync(GAME_JSON, JSON.stringify(world));
  log('  ★게임 파일 기록: ' + GAME_JSON + ' (백업 .bak)');
} else if (APPLY) log('  ★--apply 는 --fix 와 같이 써야 의미가 있다. 기록 안 함.');
else log('  시험빌드 — 파일 안 건드림. 기록하려면 --fix --apply');
const total = plan.widthJump.length + plan.inversion.length + plan.deadEnd.length;
log('\n결과: 접합부 지적 ' + total + '건 · 다리 자리 부적격 ' + badSite + '개 · 못 닿는 마을 ' + unreach.length + '개');
