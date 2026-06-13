#!/usr/bin/env node
// === scripts/build-terrain.js — 지형 빌드 파이프라인 ===
// Phase 5-H. 데이터 모듈(terrain-data-*.js)을 읽어:
//   1. 기존 JSON의 생성물(미러·자동고개·이전 빌드 산출)을 제거 (재실행 안전)
//   2. ridges/passes/forests/추가 lakes 병합
//   3. 강×능선 교차점에 자동 계곡(고개) 생성 (noValley ridge 제외)
//   4. 경계 근처 feature를 이웃 zone 좌표계로 자동 미러링
//   5. server/hanbando-terrain.json + ../hanbando_terrain.json 갱신
//   6. ../hanbando_full.svg 렌더
//
// 사용: node scripts/build-terrain.js
// 새 zone 추가: scripts/terrain-data-<zone>.js 만들고 아래 DATA_MODULES에 등록.

'use strict';
const fs = require('fs');
const path = require('path');

const DATA_MODULES = [
  require('./terrain-data-hanbando'),
];

const SERVER_JSON = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const DESIGN_JSON = path.join(__dirname, '..', '..', 'hanbando_terrain.json');
const DESIGN_SVG  = path.join(__dirname, '..', '..', 'hanbando_full.svg');

// zone offset/size — zone-config와 동일 (스냅 후 값)
const ZONES = {
  hanbando:  { off: [409984, 49984], size: [70016, 130016] },
  bering:    { off: [409984, 0],      size: [160000, 49984] },
  sibara:    { off: [249984, 0],      size: [160000, 49984] },
  jungwon_n: { off: [309984, 49984],  size: [100000, 130016] },
  nippon:    { off: [480000, 49984],  size: [49984, 130016] },
  // east_sea_s 등 ocean zone은 전체가 물이라 미러링 대상 아님
};
const MIRROR_MARGIN = 3000; // 경계에서 이 거리 안의 feature는 이웃에도 복제

// === 기하 헬퍼 ===
function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L));
  return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
}
function featureBBox(f) {
  // river/ridge: path+width, lake: center+radius. local 좌표 bbox.
  if (f.path) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of f.path) {
      const [x, y] = p.pos, w = (p.width || 200) / 2;
      x1 = Math.min(x1, x - w); y1 = Math.min(y1, y - w);
      x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + w);
    }
    return [x1, y1, x2, y2];
  }
  const [cx, cy] = f.center, r = f.radius || 500;
  return [cx - r, cy - r, cx + r, cy + r];
}
function translateFeature(f, dx, dy, srcZone) {
  const nf = JSON.parse(JSON.stringify(f));
  if (nf.path) for (const p of nf.path) p.pos = [p.pos[0] + dx, p.pos[1] + dy];
  if (nf.center) nf.center = [nf.center[0] + dx, nf.center[1] + dy];
  nf._mirroredFrom = srcZone;
  return nf;
}

// === 강×능선 자동 계곡 ===
function riverWidthAt(rivers, x, y, margin) {
  let best = null;
  for (const r of rivers) {
    const p = r.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const w1 = p[i].width || 200, w2 = p[i + 1].width || 200;
      const { d, t } = ptSegDist(x, y, x1, y1, x2, y2);
      const w = w1 + (w2 - w1) * t;
      if (d < w / 2 + margin && (!best || w > best)) best = w;
    }
  }
  return best;
}
function computeAutoValleys(ridges, rivers, manualPasses) {
  const out = [];
  for (const ridge of ridges) {
    if (ridge.noValley) continue;
    const p = ridge.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.ceil(segLen / 250));
      for (let s = 0; s <= steps; s++) {
        const x = x1 + (x2 - x1) * s / steps, y = y1 + (y2 - y1) * s / steps;
        const rw = riverWidthAt(rivers, x, y, 200);
        if (rw == null) continue;
        const near = out.find(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < 2500)
          || manualPasses.find(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < 3000);
        if (!near) out.push({ name: '계곡', pos: [Math.round(x), Math.round(y)], radius: Math.round(rw / 2 + 700), auto: true });
      }
    }
  }
  return out;
}


// === 능선 자동 피팅 — 지류(소형 강)를 피해 회랑으로 능선을 밀어냄 ===
// 본류(폭 AVOID_W 이상)는 교차 허용 (자동 계곡 = 협곡). 지류와의 어색한 겹침만 제거.
const AVOID_W = 400;  // 이 폭 미만 강은 능선이 피함
const RIDGE_GAP = 500; // 능선 가장자리 ↔ 강 가장자리 최소 간격
function nearestRiverPush(p, smallRivers) {
  let best = null;
  for (const r of smallRivers) {
    const rp = r.path;
    for (let i = 0; i < rp.length - 1; i++) {
      const [x1, y1] = rp[i].pos, [x2, y2] = rp[i + 1].pos;
      const w1 = rp[i].width || 200, w2 = rp[i + 1].width || 200;
      const { d, t } = ptSegDist(p.pos[0], p.pos[1], x1, y1, x2, y2);
      const need = p.width / 2 + (w1 + (w2 - w1) * t) / 2 + RIDGE_GAP;
      if (d < need && (!best || d - need < best.short)) {
        best = { short: d - need, cx: x1 + (x2 - x1) * t, cy: y1 + (y2 - y1) * t };
      }
    }
  }
  return best;
}
function relaxRidge(path, smallRivers, iters) {
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (const p of path) {
      const b = nearestRiverPush(p, smallRivers);
      if (!b) continue;
      let dx = p.pos[0] - b.cx, dy = p.pos[1] - b.cy;
      let L = Math.hypot(dx, dy);
      if (L < 1) { dx = 1; dy = 0; L = 1; } // 강 위에 정확히 얹힌 점 — 임의 방향
      const push = Math.min(600, -b.short + 40);
      p.pos[0] += dx / L * push;
      p.pos[1] += dy / L * push;
      moved = true;
    }
    if (!moved) return;
  }
}
function countOverlaps(ridges, rivers, smallOnly) {
  const small = smallOnly ? rivers.filter(r => Math.max(...r.path.map(q => q.width || 200)) < AVOID_W) : rivers;
  let n = 0;
  for (const ridge of ridges) {
    const p = ridge.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 300));
      for (let s = 0; s <= steps; s++) {
        const x = x1 + (x2 - x1) * s / steps, y = y1 + (y2 - y1) * s / steps;
        if (riverWidthAt(small, x, y, 0) != null) n++;
      }
    }
  }
  return n;
}
function fitRidgesAroundRivers(ridges, rivers) {
  const small = rivers.filter(r => Math.max(...r.path.map(q => q.width || 200)) < AVOID_W);
  for (const ridge of ridges) {
    if (ridge.noValley) continue; // 산괴는 의도적 관통 — 고정
    // 1) 긴 구간 분할 (곡선 여유)
    const path = [];
    for (let i = 0; i < ridge.path.length; i++) {
      path.push(ridge.path[i]);
      if (i < ridge.path.length - 1) {
        const a = ridge.path[i], b = ridge.path[i + 1];
        const len = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
        const n = Math.floor(len / 3500);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          path.push({ pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * t, a.pos[1] + (b.pos[1] - a.pos[1]) * t], width: Math.round(a.width + (b.width - a.width) * t) });
        }
      }
    }
    // 2) 완화 → 부드럽게 → 다시 완화
    relaxRidge(path, small, 10);
    for (let i = 1; i < path.length - 1; i++) {
      path[i].pos[0] = path[i].pos[0] * 0.6 + (path[i - 1].pos[0] + path[i + 1].pos[0]) * 0.2;
      path[i].pos[1] = path[i].pos[1] * 0.6 + (path[i - 1].pos[1] + path[i + 1].pos[1]) * 0.2;
    }
    relaxRidge(path, small, 10);
    ridge.path = path.map(q => ({ pos: [Math.round(q.pos[0]), Math.round(q.pos[1])], width: q.width }));
  }
}

// === 빌드 ===
function build(jsonPath) {
  if (!fs.existsSync(jsonPath)) { console.log('  skip (없음):', jsonPath); return null; }
  const d = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // 1. 생성물 제거 (재실행 안전) — 미러, 빌드 산출 lake(_extra), ridges/passes/forests 전체
  for (const z of Object.keys(d)) {
    d[z].rivers = (d[z].rivers || []).filter(r => !r._mirroredFrom);
    d[z].lakes  = (d[z].lakes  || []).filter(l => !l._mirroredFrom && !l._extra);
    delete d[z].ridges; delete d[z].passes; delete d[z].forests;
  }

  // 2. 데이터 모듈 적용
  for (const mod of DATA_MODULES) {
    const z = mod.zone;
    if (!d[z]) d[z] = { rivers: [], lakes: [] };
    d[z].ridges = (mod.ridges || []).map(r => ({
      name: r.name, noValley: !!r.noValley,
      path: r.path.map(([x, y, w]) => ({ pos: [x, y], width: w })),
    }));
    // 능선 피팅 — 지류를 피해 회랑으로 (본류 교차는 계곡으로 남김)
    const before = countOverlaps(d[z].ridges, d[z].rivers || [], true);
    fitRidgesAroundRivers(d[z].ridges, d[z].rivers || []);
    const after = countOverlaps(d[z].ridges, d[z].rivers || [], true);
    console.log(`  [${z}] 능선×지류 겹침 샘플: ${before} → ${after}`);
    const manual = (mod.passes || []).map(p => ({ ...p }));
    const valleys = computeAutoValleys(d[z].ridges, d[z].rivers || [], manual);
    d[z].passes = [...manual, ...valleys];
    d[z].forests = (mod.forests || []).map(f => ({ ...f }));
    for (const lk of mod.lakes || []) d[z].lakes.push({ ...lk, _extra: true });
    console.log(`  [${z}] ridges ${d[z].ridges.length}, passes ${d[z].passes.length} (계곡 ${valleys.length}), forests ${d[z].forests.length}, 추가 lake ${(mod.lakes || []).length}`);
  }

  // 3. 경계 미러링 — rivers/ridges/lakes를 abs로 변환해 겹치는 이웃 zone에 복제
  //    passes는 ridge와 함께 zone-local로 변환해 복제 (바위 판정에 필요)
  for (const [srcZ, srcCfg] of Object.entries(ZONES)) {
    if (!d[srcZ]) continue;
    const [sox, soy] = srcCfg.off;
    for (const kind of ['rivers', 'ridges', 'lakes']) {
      for (const f of d[srcZ][kind] || []) {
        if (f._mirroredFrom) continue;
        const [bx1, by1, bx2, by2] = featureBBox(f);
        for (const [dstZ, dstCfg] of Object.entries(ZONES)) {
          if (dstZ === srcZ) continue;
          const [dox, doy] = dstCfg.off, [dw, dh] = dstCfg.size;
          // src local bbox → abs → dst rect(+margin) 교차?
          const ax1 = sox + bx1, ay1 = soy + by1, ax2 = sox + bx2, ay2 = soy + by2;
          if (ax2 < dox - MIRROR_MARGIN || ax1 > dox + dw + MIRROR_MARGIN) continue;
          if (ay2 < doy - MIRROR_MARGIN || ay1 > doy + dh + MIRROR_MARGIN) continue;
          if (!d[dstZ]) d[dstZ] = { rivers: [], lakes: [] };
          if (!d[dstZ][kind]) d[dstZ][kind] = [];
          d[dstZ][kind].push(translateFeature(f, sox - dox, soy - doy, srcZ));
        }
      }
    }
    // passes 미러 (ridge가 미러된 zone에서 고개도 적용돼야 함)
    for (const q of d[srcZ].passes || []) {
      for (const [dstZ, dstCfg] of Object.entries(ZONES)) {
        if (dstZ === srcZ || !d[dstZ] || !(d[dstZ].ridges || []).length) continue;
        const [dox, doy] = dstCfg.off, [dw, dh] = dstCfg.size;
        const ax = sox + q.pos[0], ay = soy + q.pos[1];
        if (ax < dox - MIRROR_MARGIN - q.radius || ax > dox + dw + MIRROR_MARGIN + q.radius) continue;
        if (ay < doy - MIRROR_MARGIN - q.radius || ay > doy + dh + MIRROR_MARGIN + q.radius) continue;
        if (!d[dstZ].passes) d[dstZ].passes = [];
        d[dstZ].passes.push({ ...q, pos: [ax - dox, ay - doy], _mirroredFrom: srcZ });
      }
    }
  }

  fs.writeFileSync(jsonPath, JSON.stringify(d), 'utf8');
  const summary = Object.fromEntries(Object.entries(d).map(([z, v]) => [z,
    `강${(v.rivers || []).length} 호${(v.lakes || []).length} 산${(v.ridges || []).length} 고개${(v.passes || []).length}`]));
  console.log('  저장:', jsonPath, JSON.stringify(summary));
  return d;
}

// === SVG 렌더 (한반도 중심) ===
const ZW = 70000, ZH = 130000;
const SVG_W = 591.8083462132921, SVG_H = 1098.8216446336546;
const MG = 54.09;
const SX = SVG_W / ZW, SY = SVG_H / ZH;
const px = lx => MG + lx * SX, py = ly => MG + ly * SY;
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

function renderSvg(d) {
  const hb = d.hanbando;
  const passes = hb.passes || [];
  const out = [];
  const W = 700, H = 1207;
  out.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#222;max-width:100%">`);
  out.push(`<rect x="0" y="0" width="${W}" height="${MG}" fill="#8a9a9a"/>`);
  out.push(`<rect x="0" y="${MG}" width="${MG}" height="${H - 2 * MG}" fill="#bca56a"/>`);
  out.push(`<rect x="${(MG + SVG_W).toFixed(1)}" y="${MG}" width="${MG}" height="${H - 2 * MG}" fill="#7a8a5a"/>`);
  out.push(`<rect x="${MG}" y="${(MG + SVG_H).toFixed(1)}" width="${SVG_W.toFixed(1)}" height="${MG}" fill="#2a5a8a"/>`);
  out.push(`<rect x="${MG}" y="${MG}" width="${SVG_W.toFixed(1)}" height="${SVG_H.toFixed(1)}" fill="#a8c168"/>`);
  for (const [t, x, y, rot] of [['bering', W / 2, MG / 2 - 4, 0], ['jungwon_n', MG / 2, H / 2, -90], ['nippon', W - MG / 2, H / 2, 90], ['east_sea_s', W / 2, H - MG / 2 + 4, 0]]) {
    out.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#fff" font-weight="bold" font-family="sans-serif"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${t}</text>`);
  }
  // 숲
  for (const f of hb.forests || []) {
    out.push(`<ellipse cx="${px(f.center[0]).toFixed(1)}" cy="${py(f.center[1]).toFixed(1)}" rx="${(f.rx * SX).toFixed(1)}" ry="${(f.ry * SY).toFixed(1)}" fill="rgba(34,90,30,${(0.16 + 0.09 * f.densityMult).toFixed(2)})"/>`);
    out.push(`<text x="${px(f.center[0]).toFixed(1)}" y="${py(f.center[1]).toFixed(1)}" text-anchor="middle" font-size="7" fill="#cfe8c0" font-weight="bold" font-family="sans-serif">${esc(f.name)} ×${f.densityMult}</text>`);
  }
  // 산맥 (고개 구간 비움)
  const inPass = (x, y) => passes.some(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < q.radius);
  for (const ridge of hb.ridges || []) {
    const p = ridge.path;
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const avgW = run.reduce((a, q) => a + q[2], 0) / run.length;
        const pts = run.map(q => `${px(q[0]).toFixed(1)},${py(q[1]).toFixed(1)}`).join(' ');
        out.push(`<polyline points="${pts}" fill="none" stroke="#564c40" stroke-width="${(avgW * SX).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
        out.push(`<polyline points="${pts}" fill="none" stroke="#7d7060" stroke-width="${(avgW * SX * 0.45).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
      run = [];
    };
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const w1 = p[i].width, w2 = p[i + 1].width;
      const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 400));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, w = w1 + (w2 - w1) * t;
        if (!inPass(x, y)) run.push([x, y, w]); else flush();
      }
    }
    const last = p[p.length - 1];
    if (!inPass(last.pos[0], last.pos[1])) run.push([last.pos[0], last.pos[1], last.width]);
    flush();
    const mid = p[Math.floor(p.length / 2)].pos;
    out.push(`<text x="${px(mid[0]).toFixed(1)}" y="${(py(mid[1]) - 5).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(ridge.name)}</text>`);
  }
  // 고개
  for (const q of passes) {
    out.push(`<circle cx="${px(q.pos[0]).toFixed(1)}" cy="${py(q.pos[1]).toFixed(1)}" r="${(q.radius * SX).toFixed(1)}" fill="none" stroke="${q.auto ? '#88c0ff' : '#ffd070'}" stroke-width="0.8" stroke-dasharray="2,1.5"/>`);
    if (!q.auto) out.push(`<text x="${px(q.pos[0]).toFixed(1)}" y="${(py(q.pos[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#ffd070" font-weight="bold" font-family="sans-serif">${esc(q.name)}</text>`);
  }
  // 강 (산맥 위 — 협곡 표현)
  for (const r of hb.rivers || []) {
    const p = r.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const w = ((p[i].width || 200) + (p[i + 1].width || 200)) / 2;
      out.push(`<line x1="${px(x1).toFixed(1)}" y1="${py(y1).toFixed(1)}" x2="${px(x2).toFixed(1)}" y2="${py(y2).toFixed(1)}" stroke="#2e6fa8" stroke-width="${Math.max(0.5, w * SX).toFixed(1)}" stroke-linecap="round"/>`);
    }
    if (r.name && !r._mirroredFrom) {
      const mp = p[Math.floor(p.length / 2)].pos;
      out.push(`<text x="${px(mp[0]).toFixed(1)}" y="${(py(mp[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(r.name)}</text>`);
    }
  }
  // 호수 (이웃 zone 것도 offset 변환해 표시)
  for (const [zid, zd] of Object.entries(d)) {
    if (!ZONES[zid]) continue;
    for (const lk of zd.lakes || []) {
      if (!lk.center || lk._mirroredFrom) continue;
      const lx = ZONES[zid].off[0] + lk.center[0] - ZONES.hanbando.off[0];
      const ly = ZONES[zid].off[1] + lk.center[1] - ZONES.hanbando.off[1];
      if (lx < -6000 || lx > ZW + 6000 || ly < -6000 || ly > ZH + 6000) continue;
      out.push(`<ellipse cx="${px(lx).toFixed(1)}" cy="${py(ly).toFixed(1)}" rx="${((lk.radius || 500) * SX).toFixed(1)}" ry="${((lk.radius || 500) * SY).toFixed(1)}" fill="#2e6fa8" stroke="#1a4870" stroke-width="0.5"/>`);
      if (lk.name) out.push(`<text x="${px(lx).toFixed(1)}" y="${(py(ly) + 2).toFixed(1)}" text-anchor="middle" font-size="6" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(lk.name)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

// === main ===
console.log('지형 빌드:');
const merged = build(SERVER_JSON);
build(DESIGN_JSON);
if (merged) {
  const svg = renderSvg(merged);
  fs.writeFileSync(DESIGN_SVG, svg, 'utf8');
  console.log('SVG 렌더:', DESIGN_SVG, `(${(svg.length / 1024).toFixed(1)}KB)`);
}
