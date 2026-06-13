#!/usr/bin/env node
// === scripts/build-terrain-v2.js — 지형 빌드 v2 (자연화 파이프라인) ===
// v1(build-terrain.js)과의 차이:
//   A. 강 사행화 — 계단 path를 분할 + Chaikin 스무딩 + 시드 사행 노이즈.
//      경계 강은 서버 직선이 강폭 안에 잠기도록 진폭 제한.
//   B. 능선 폭 변주 — 시드 노이즈 ±25% + 자유단 테이퍼 (pinStart 쪽은 본줄기 폭 유지).
//   C. 트리 구조 — 지맥 첫 점은 본줄기 위에 고정(pinStart). 피팅이 분기점을 못 떼어냄.
//   D. 출력은 *_v2 파일 — 검토 후 승인되면 본 파일 교체.
//
// 사용: node scripts/build-terrain-v2.js
// 입력: server/hanbando-terrain.json의 원본 강·호수 (생성물 마커 제외) + terrain-data-hanbando-v2.js
// 출력: ../hanbando_terrain_v2.json, ../hanbando_full_v2.svg

'use strict';
const fs = require('fs');
const path = require('path');

const DATA_MODULES = [require('./terrain-data-hanbando-v2')];
const SRC_JSON = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const OUT_JSON = path.join(__dirname, '..', '..', 'hanbando_terrain_v2.json');
const OUT_SVG  = path.join(__dirname, '..', '..', 'hanbando_full_v2.svg');

const ZONES = {
  hanbando:  { off: [409984, 49984], size: [70016, 130016] },
  bering:    { off: [409984, 0],      size: [160000, 49984] },
  sibara:    { off: [249984, 0],      size: [160000, 49984] },
  jungwon_n: { off: [309984, 49984],  size: [100000, 130016] },
  nippon:    { off: [480000, 49984],  size: [49984, 130016] },
};
const MIRROR_MARGIN = 3000;
const AVOID_W = 400;   // 능선이 피해야 하는 지류 폭 상한
const RIDGE_GAP = 500; // 능선↔지류 최소 간격

// === 기하/난수 ===
function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L));
  return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seededRand(seed) { let s = seed; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }

// === A. 강 사행화 ===
// 1) 긴 구간 분할(1100px) 2) Chaikin 2회 3) 진행방향 수직 사인 노이즈
function isBoundaryRiver(r, zoneSize) {
  // path 끝점·중간점 중 경계 400px 이내가 절반 이상이면 경계 강
  const [zw, zh] = zoneSize;
  let n = 0;
  for (const p of r.path) {
    const [x, y] = p.pos;
    if (x < 400 || x > zw - 400 || y < 400 || y > zh - 400) n++;
  }
  return n >= Math.ceil(r.path.length / 2);
}
function subdivide(pts, maxLen) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i < pts.length - 1) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
      const n = Math.floor(len / maxLen);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        out.push({ pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * t, a.pos[1] + (b.pos[1] - a.pos[1]) * t],
                   width: (a.width || 200) + ((b.width || 200) - (a.width || 200)) * t });
      }
    }
  }
  return out;
}
function chaikin(pts, rounds) {
  let cur = pts;
  for (let r = 0; r < rounds; r++) {
    const out = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      out.push({ pos: [a.pos[0] * 0.75 + b.pos[0] * 0.25, a.pos[1] * 0.75 + b.pos[1] * 0.25], width: (a.width * 3 + b.width) / 4 });
      out.push({ pos: [a.pos[0] * 0.25 + b.pos[0] * 0.75, a.pos[1] * 0.25 + b.pos[1] * 0.75], width: (a.width + b.width * 3) / 4 });
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}
function meanderRiver(r, zoneSize) {
  if (r._smoothed) return r;
  const seed = hashStr(r.name || 'r');
  const boundary = isBoundaryRiver(r, zoneSize);
  const maxW = Math.max(...r.path.map(p => p.width || 200));
  // 진폭: 일반 강 = min(700, 폭×0.8), 경계 강 = 서버 직선이 잠기게 폭/2 − 250
  let amp = boundary ? Math.max(0, maxW / 2 - 250) : Math.min(350, maxW * 0.4 + 80);
  let pts = r.path.map(p => ({ pos: [...p.pos], width: p.width || 200 }));
  // 핵심: 분할 전에 Chaikin — 계단 코너를 잘라내 큰 곡선으로 편다.
  // (분할을 먼저 하면 계단 형태가 보존돼 지터가 지렁이를 만듦)
  pts = chaikin(pts, 3);
  pts = subdivide(pts, 1400);
  if (amp > 30) {
    const lambda = 5200 + (seed % 2600); // 저주파 — 고주파 떨림 방지
    const phase = (seed % 628) / 100;
    let dist = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], next = pts[i + 1];
      dist += Math.hypot(pts[i].pos[0] - prev.pos[0], pts[i].pos[1] - prev.pos[1]);
      const dirx = next.pos[0] - prev.pos[0], diry = next.pos[1] - prev.pos[1];
      const L = Math.hypot(dirx, diry) || 1;
      // 수직 방향으로 사인 + 2차 고조파
      const o = amp * (Math.sin(dist / lambda * Math.PI * 2 + phase) * 0.7 + Math.sin(dist / lambda * Math.PI * 4.7 + phase * 2) * 0.3);
      // 끝점 근처는 진폭 감쇠 (발원·합류점 보존)
      const edge = Math.min(i, pts.length - 1 - i) / Math.min(8, (pts.length - 1) / 2);
      const k = Math.min(1, edge);
      pts[i].pos[0] += (-diry / L) * o * k;
      pts[i].pos[1] += (dirx / L) * o * k;
    }
  }
  return { ...r, path: pts.map(p => ({ pos: [Math.round(p.pos[0]), Math.round(p.pos[1])], width: Math.round(p.width) })), _smoothed: true };
}

// === B+C. 능선 가공: 분할 → 지류 회피(피팅) → 폭 변주 + 테이퍼 ===
function nearestRiverPush(p, smallRivers) {
  let best = null;
  for (const r of smallRivers) {
    const rp = r.path;
    for (let i = 0; i < rp.length - 1; i++) {
      const [x1, y1] = rp[i].pos, [x2, y2] = rp[i + 1].pos;
      const w1 = rp[i].width || 200, w2 = rp[i + 1].width || 200;
      const { d, t } = ptSegDist(p.pos[0], p.pos[1], x1, y1, x2, y2);
      const need = p.width / 2 + (w1 + (w2 - w1) * t) / 2 + RIDGE_GAP;
      if (d < need && (!best || d - need < best.short)) best = { short: d - need, cx: x1 + (x2 - x1) * t, cy: y1 + (y2 - y1) * t };
    }
  }
  return best;
}
// 점에서 가장 깊이 침범한 본류 세그먼트 + 그 방향 (평행 회피용)
function majorIntrusionWithDir(x, y, w, majorRivers, margin) {
  let worst = null;
  for (const r of majorRivers) {
    const rp = r.path;
    for (let i = 0; i < rp.length - 1; i++) {
      const [x1, y1] = rp[i].pos, [x2, y2] = rp[i + 1].pos;
      const w1 = rp[i].width || 200, w2 = rp[i + 1].width || 200;
      const q = ptSegDist(x, y, x1, y1, x2, y2);
      const need = (w1 + (w2 - w1) * q.t) / 2 + w / 2 + margin;
      const depth = need - q.d;
      if (depth > 0 && (!worst || depth > worst.depth)) {
        const sl = Math.hypot(x2 - x1, y2 - y1) || 1;
        worst = { depth, cx: x1 + (x2 - x1) * q.t, cy: y1 + (y2 - y1) * q.t, dirx: (x2 - x1) / sl, diry: (y2 - y1) / sl };
      }
    }
  }
  return worst;
}
function processRidge(ridge, rivers) {
  const small = rivers.filter(r => Math.max(...r.path.map(q => q.width || 200)) < AVOID_W);
  const major = rivers.filter(r => Math.max(...r.path.map(q => q.width || 200)) >= AVOID_W);
  let pts = ridge.path.map(([x, y, w]) => ({ pos: [x, y], width: w }));
  pts = subdivide(pts, 1400);
  pts = chaikin(pts, 1);
  // 피팅 (noFit 제외, pinStart면 첫 점 고정)
  if (!ridge.noFit) {
    for (let it = 0; it < 24; it++) {
      let moved = false;
      for (let i = ridge.pinStart ? 1 : 0; i < pts.length; i++) {
        const b = nearestRiverPush(pts[i], small);
        if (!b) continue;
        let dx = pts[i].pos[0] - b.cx, dy = pts[i].pos[1] - b.cy;
        let L = Math.hypot(dx, dy);
        if (L < 1) { dx = 1; dy = 0; L = 1; }
        const push = Math.min(700, -b.short + 40);
        pts[i].pos[0] += dx / L * push;
        pts[i].pos[1] += dy / L * push;
        moved = true;
      }
      // 본류 평행 회피 — 능선 진행 방향과 강 방향이 평행(|cos|>0.5)이면 본류도 피함.
      // 수직 교차는 협곡(자동 계곡)으로 남김.
      for (let i = ridge.pinStart ? 1 : 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
        let rdx = next.pos[0] - prev.pos[0], rdy = next.pos[1] - prev.pos[1];
        const rl = Math.hypot(rdx, rdy) || 1;
        rdx /= rl; rdy /= rl;
        const hit = majorIntrusionWithDir(pts[i].pos[0], pts[i].pos[1], pts[i].width, major, RIDGE_GAP);
        if (!hit) continue;
        const dot = Math.abs(rdx * hit.dirx + rdy * hit.diry);
        if (dot < 0.5) continue; // 수직 교차 — 협곡 허용
        let dx = pts[i].pos[0] - hit.cx, dy = pts[i].pos[1] - hit.cy;
        let L = Math.hypot(dx, dy);
        if (L < 1) { dx = 1; dy = 0; L = 1; }
        const push = Math.min(700, hit.depth * dot + 40);
        pts[i].pos[0] += dx / L * push;
        pts[i].pos[1] += dy / L * push;
        moved = true;
      }
      // 스무딩 끼워넣기 (들쭉날쭉 방지) — pin 제외
      if (it % 6 === 5) for (let i = ridge.pinStart ? 2 : 1; i < pts.length - 1; i++) {
        pts[i].pos[0] = pts[i].pos[0] * 0.6 + (pts[i - 1].pos[0] + pts[i + 1].pos[0]) * 0.2;
        pts[i].pos[1] = pts[i].pos[1] * 0.6 + (pts[i - 1].pos[1] + pts[i + 1].pos[1]) * 0.2;
      }
      if (!moved) break;
    }
  }
  // 폭 변주 + 테이퍼
  if (!ridge.noTaper) {
    const rnd = seededRand(hashStr(ridge.name));
    const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) dist += Math.hypot(pts[i].pos[0] - pts[i - 1].pos[0], pts[i].pos[1] - pts[i - 1].pos[1]);
      let w = pts[i].width;
      w *= 1 + 0.22 * Math.sin(dist / 5200 * 6.28 + ph1) + 0.12 * Math.sin(dist / 1900 * 6.28 + ph2);
      // 자유단 테이퍼: 끝 4점에서 1.0 → 0.45 (pinStart면 시작쪽은 본줄기 합류 — 유지)
      const fromEnd = pts.length - 1 - i;
      const fromStart = i;
      if (fromEnd < 4) w *= 0.45 + 0.55 * (fromEnd / 4);
      if (!ridge.pinStart && fromStart < 3 && ridge.name !== '백두대간') w *= 0.55 + 0.45 * (fromStart / 3);
      pts[i].width = Math.max(350, Math.round(w));
    }
  }
  return { name: ridge.name, noValley: !!ridge.noValley, path: pts.map(p => ({ pos: [Math.round(p.pos[0]), Math.round(p.pos[1])], width: p.width })) };
}

// === 자동 계곡 (v1과 동일) ===
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
  // 본류만 — 지류는 능선 피팅이 회피함 (계곡 남발 방지)
  rivers = rivers.filter(r => Math.max(...r.path.map(q => q.width || 200)) >= AVOID_W);
  const out = [];
  for (const ridge of ridges) {
    if (ridge.noValley) continue;
    const p = ridge.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 250));
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

// === 미러링 (v1과 동일 로직) ===
function featureBBox(f) {
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
function mirrorAll(d) {
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
          const ax1 = sox + bx1, ay1 = soy + by1, ax2 = sox + bx2, ay2 = soy + by2;
          if (ax2 < dox - MIRROR_MARGIN || ax1 > dox + dw + MIRROR_MARGIN) continue;
          if (ay2 < doy - MIRROR_MARGIN || ay1 > doy + dh + MIRROR_MARGIN) continue;
          if (!d[dstZ]) d[dstZ] = { rivers: [], lakes: [] };
          if (!d[dstZ][kind]) d[dstZ][kind] = [];
          d[dstZ][kind].push(translateFeature(f, sox - dox, soy - doy, srcZ));
        }
      }
    }
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
}

// === SVG 렌더 v2 — 가변 폭 밴드(폴리곤) ===
const ZW = 70000, ZH = 130000;
const SVG_W = 591.8083462132921, SVG_H = 1098.8216446336546;
const MG = 54.09;
const SXC = SVG_W / ZW, SYC = SVG_H / ZH;
const px = lx => MG + lx * SXC, py = ly => MG + ly * SYC;
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function bandPolygon(run) {
  // run: [{x,y,w}] (world 단위) → 좌/우 offset 폴리곤 (svg 좌표는 px/py가 변환)
  const L = [], R = [];
  for (let i = 0; i < run.length; i++) {
    const p = run[i];
    const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const hw = p.w / 2; // world 단위
    L.push(`${(px(p.x + nx * hw)).toFixed(1)},${(py(p.y + ny * hw)).toFixed(1)}`);
    R.push(`${(px(p.x - nx * hw)).toFixed(1)},${(py(p.y - ny * hw)).toFixed(1)}`);
  }
  return L.concat(R.reverse()).join(' ');
}
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
  for (const f of hb.forests || []) {
    out.push(`<ellipse cx="${px(f.center[0]).toFixed(1)}" cy="${py(f.center[1]).toFixed(1)}" rx="${(f.rx * SXC).toFixed(1)}" ry="${(f.ry * SYC).toFixed(1)}" fill="rgba(34,90,30,${(0.16 + 0.09 * f.densityMult).toFixed(2)})"/>`);
    out.push(`<text x="${px(f.center[0]).toFixed(1)}" y="${py(f.center[1]).toFixed(1)}" text-anchor="middle" font-size="7" fill="#cfe8c0" font-weight="bold" font-family="sans-serif">${esc(f.name)} ×${f.densityMult}</text>`);
  }
  // 산맥 — 가변 폭 밴드, 고개 구간 분리
  const inPass = (x, y) => passes.some(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < q.radius);
  for (const ridge of hb.ridges || []) {
    const p = ridge.path;
    let run = [];
    const flush = () => {
      // 고개 사이 600px 미만 토막은 생략 (부스러기 방지)
      if (run.length > 1) {
        let tot = 0;
        for (let q = 1; q < run.length; q++) tot += Math.hypot(run[q].x - run[q-1].x, run[q].y - run[q-1].y);
        if (tot < 600) { run = []; return; }
      }
      if (run.length > 1) {
        out.push(`<polygon points="${bandPolygon(run)}" fill="#564c40"/>`);
        const inner = run.map(q => ({ x: q.x, y: q.y, w: q.w * 0.45 }));
        out.push(`<polygon points="${bandPolygon(inner)}" fill="#7d7060"/>`);
      }
      run = [];
    };
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const w1 = p[i].width, w2 = p[i + 1].width;
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 500));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, w = w1 + (w2 - w1) * t;
        if (!inPass(x, y)) run.push({ x, y, w }); else flush();
      }
    }
    const last = p[p.length - 1];
    if (!inPass(last.pos[0], last.pos[1])) run.push({ x: last.pos[0], y: last.pos[1], w: last.width });
    flush();
    const mid = p[Math.floor(p.length / 2)].pos;
    out.push(`<text x="${px(mid[0]).toFixed(1)}" y="${(py(mid[1]) - 5).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(ridge.name)}</text>`);
  }
  for (const q of passes) {
    out.push(`<circle cx="${px(q.pos[0]).toFixed(1)}" cy="${py(q.pos[1]).toFixed(1)}" r="${(q.radius * SXC).toFixed(1)}" fill="none" stroke="${q.auto ? '#88c0ff' : '#ffd070'}" stroke-width="0.8" stroke-dasharray="2,1.5"/>`);
    if (!q.auto) out.push(`<text x="${px(q.pos[0]).toFixed(1)}" y="${(py(q.pos[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#ffd070" font-weight="bold" font-family="sans-serif">${esc(q.name)}</text>`);
  }
  // 강 — 사행화됐으니 polyline으로 자연스럽게
  for (const r of hb.rivers || []) {
    const p = r.path;
    // 폭이 구간별로 다르므로 3점 단위 세그먼트 stroke
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const w = ((p[i].width || 200) + (p[i + 1].width || 200)) / 2;
      out.push(`<line x1="${px(x1).toFixed(1)}" y1="${py(y1).toFixed(1)}" x2="${px(x2).toFixed(1)}" y2="${py(y2).toFixed(1)}" stroke="#2e6fa8" stroke-width="${Math.max(0.5, w * SXC).toFixed(1)}" stroke-linecap="round"/>`);
    }
    if (r.name && !r._mirroredFrom) {
      const mp = p[Math.floor(p.length / 2)].pos;
      out.push(`<text x="${px(mp[0]).toFixed(1)}" y="${(py(mp[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(r.name)}</text>`);
    }
  }
  for (const [zid, zd] of Object.entries(d)) {
    if (!ZONES[zid]) continue;
    for (const lk of zd.lakes || []) {
      if (!lk.center || lk._mirroredFrom) continue;
      const lx = ZONES[zid].off[0] + lk.center[0] - ZONES.hanbando.off[0];
      const ly = ZONES[zid].off[1] + lk.center[1] - ZONES.hanbando.off[1];
      if (lx < -6000 || lx > ZW + 6000 || ly < -6000 || ly > ZH + 6000) continue;
      out.push(`<ellipse cx="${px(lx).toFixed(1)}" cy="${py(ly).toFixed(1)}" rx="${((lk.radius || 500) * SXC).toFixed(1)}" ry="${((lk.radius || 500) * SYC).toFixed(1)}" fill="#2e6fa8" stroke="#1a4870" stroke-width="0.5"/>`);
      if (lk.name) out.push(`<text x="${px(lx).toFixed(1)}" y="${(py(ly) + 2).toFixed(1)}" text-anchor="middle" font-size="6" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(lk.name)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

// === 하구 스냅 보조 ===
function distToPathPt(x, y, feat) {
  let best = { d: Infinity, x: 0, y: 0, w: 0 };
  const p = feat.path;
  for (let i = 0; i < p.length - 1; i++) {
    const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
    const w1 = p[i].width || 200, w2 = p[i + 1].width || 200;
    const r = ptSegDist(x, y, x1, y1, x2, y2);
    if (r.d < best.d) best = { d: r.d, x: x1 + (x2 - x1) * r.t, y: y1 + (y2 - y1) * r.t, w: w1 + (w2 - w1) * r.t };
  }
  return best;
}
// 사행화 전 연결 관계 기록: 각 강 끝점이 닿아 있던 부모 강 index
function recordConnectivity(rivers) {
  const conn = [];
  for (let i = 0; i < rivers.length; i++) {
    const r = rivers[i];
    for (const [endKey, pt] of [['start', r.path[0]], ['end', r.path[r.path.length - 1]]]) {
      const [x, y] = pt.pos;
      let parent = -1, bestD = Infinity;
      for (let j = 0; j < rivers.length; j++) {
        if (j === i) continue;
        const b = distToPathPt(x, y, rivers[j]);
        if (b.d < b.w / 2 + (pt.width || 200) / 2 + 200 && b.d < bestD) { parent = j; bestD = b.d; }
      }
      if (parent >= 0) conn.push({ child: i, endKey, parent });
    }
  }
  return conn;
}
// 사행화 후: 기록된 연결의 끝점을 부모의 새 중심선에 스냅 (마지막 5점 감쇠 블렌드)
function snapMouths(rivers, conn) {
  for (const c of conn) {
    const r = rivers[c.child], parent = rivers[c.parent];
    const idx = c.endKey === 'start' ? 0 : r.path.length - 1;
    const pt = r.path[idx];
    const b = distToPathPt(pt.pos[0], pt.pos[1], parent);
    if (b.d <= b.w / 2) continue; // 이미 잠김
    if (b.d > 2500) continue;     // 상한 — 부모가 절단돼 멀어진 경우 강제로 끌고 가지 않음 (감사가 잡아줌)
    const dx = b.x - pt.pos[0], dy = b.y - pt.pos[1];
    const N = Math.min(5, r.path.length);
    for (let k = 0; k < N; k++) {
      const i2 = c.endKey === 'start' ? k : r.path.length - 1 - k;
      const f = 1 - k / N; // 끝점 1.0 → 감쇠
      r.path[i2].pos[0] = Math.round(r.path[i2].pos[0] + dx * f);
      r.path[i2].pos[1] = Math.round(r.path[i2].pos[1] + dy * f);
    }
  }
}
// 점이 path+width 밴드에 얼마나 침범했나 — 모든 세그먼트 검사 (폭 변주 대응)
// 반환: { depth, cx, cy } — depth > 0 이면 침범. cx,cy는 최악 세그먼트의 최근접점.
function maxIntrusion(x, y, w, feat, margin) {
  let worst = null;
  const p = feat.path;
  for (let i = 0; i < p.length - 1; i++) {
    const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
    const w1 = p[i].width || 200, w2 = p[i + 1].width || 200;
    const r = ptSegDist(x, y, x1, y1, x2, y2);
    const need = (w1 + (w2 - w1) * r.t) / 2 + w / 2 + margin;
    const depth = need - r.d;
    if (depth > 0 && (!worst || depth > worst.depth)) {
      worst = { depth, cx: x1 + (x2 - x1) * r.t, cy: y1 + (y2 - y1) * r.t };
    }
  }
  return worst;
}

// 지류 절단: 소형 강이 능선 밴드에 닿으면 거기서 발원하도록 자름 (하구 쪽 보존)
// — 분수령을 가로지르는 지류 문제의 지리적 해법. 고개 안 통과는 허용 (계곡천).
function truncateSmallRiversAtRidges(rivers, ridges, passes, conn) {
  const inPassQ = (x, y) => passes.some(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < q.radius + 300);
  const blockedAt = (x, y, w) => {
    if (inPassQ(x, y)) return false;
    for (const ridge of ridges) {
      if (maxIntrusion(x, y, w, ridge, 150)) return true;
    }
    return false;
  };
  let cut = 0;
  for (let i = 0; i < rivers.length; i++) {
    const r = rivers[i];
    if (Math.max(...r.path.map(q => q.width || 200)) >= AVOID_W) continue; // 본류는 계곡으로 관통
    const connStart = conn.some(c => c.child === i && c.endKey === 'start');
    const connEnd   = conn.some(c => c.child === i && c.endKey === 'end');
    const walk = (fromStart) => { // 하구에서 출발, 250px 서브샘플로 막히기 전까지 인덱스 수집
      const idxs = [];
      const n = r.path.length;
      outer:
      for (let k = 0; k < n; k++) {
        const idx = fromStart ? k : n - 1 - k;
        const p = r.path[idx];
        if (blockedAt(p.pos[0], p.pos[1], p.width || 200)) break;
        // 직전 점 → 이 점 사이 세그먼트도 검사
        if (idxs.length > 0) {
          const prev = r.path[idxs[idxs.length - 1]];
          const len = Math.hypot(p.pos[0] - prev.pos[0], p.pos[1] - prev.pos[1]);
          const m = Math.ceil(len / 250);
          for (let s = 1; s < m; s++) {
            const t = s / m;
            const sx = prev.pos[0] + (p.pos[0] - prev.pos[0]) * t;
            const sy = prev.pos[1] + (p.pos[1] - prev.pos[1]) * t;
            const sw = (prev.width || 200) + ((p.width || 200) - (prev.width || 200)) * t;
            if (blockedAt(sx, sy, sw)) break outer;
          }
        }
        idxs.push(idx);
      }
      return idxs;
    };
    let keep;
    if (connStart && !connEnd) keep = walk(true);
    else if (connEnd && !connStart) keep = walk(false).reverse();
    else { const a = walk(true), b = walk(false).reverse(); keep = a.length >= b.length ? a : b; }
    if (keep.length === r.path.length) continue;
    if (keep.length < 2) continue; // 통째로 능선 안 — 그대로 둠 (수동 검토 대상)
    const newPath = keep.map(idx => r.path[idx]);
    cut++;
    r.path = newPath;
  }
  return cut;
}

// 강×강 교차 해소 (segInt 기반):
//   - 합류 오버슈트(한 강의 끝 세그먼트가 상대를 가로질러 삐져나감) → 끝점을 교차점으로 트림 (X→T)
//   - 진짜 중간 교차 → 작은 강을 교차점에서 절단 (만난 강은 합쳐짐)
function segIntPoint(a, b, c, e) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = e[0] - c[0], sy = e[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  if (t > 0 && t < 1 && u > 0 && u < 1) return { x: a[0] + t * rx, y: a[1] + t * ry, t, u };
  return null;
}
function maxW(r) { return Math.max(...r.path.map(q => q.width || 200)); }
// 끝점을 교차점에서 합류강 안쪽으로 ε 후퇴시켜 재교차 방지 (X→T 트림)
function trimEnd(r, whichEnd, Xp) {
  const len = r.path.length;
  const endI = whichEnd === 'end' ? len - 1 : 0;
  const innerI = whichEnd === 'end' ? len - 2 : 1;
  const inner = r.path[innerI].pos;
  let dx = inner[0] - Xp[0], dy = inner[1] - Xp[1];
  const L = Math.hypot(dx, dy) || 1;
  const back = Math.min(L * 0.5, 90); // 90px 또는 세그먼트 절반만큼 안쪽
  r.path[endI].pos = [Math.round(Xp[0] + dx / L * back), Math.round(Xp[1] + dy / L * back)];
}
function resolveRiverCrossings(rivers) {
  let trimmed = 0, severed = 0;
  const done = new Set(); // 강쌍당 1회 (트림이 또 다른 미세교차 만드는 루프 방지)
  for (let i = 0; i < rivers.length; i++) {
    for (let j = i + 1; j < rivers.length; j++) {
      const key = i + '|' + j;
      if (done.has(key)) continue;
      const A = rivers[i], B = rivers[j];
      let hit = null;
      for (let k = 0; k < A.path.length - 1 && !hit; k++) {
        for (let l = 0; l < B.path.length - 1; l++) {
          const X = segIntPoint(A.path[k].pos, A.path[k + 1].pos, B.path[l].pos, B.path[l + 1].pos);
          if (X) { hit = { k, l, X }; break; }
        }
      }
      if (!hit) continue;
      done.add(key);
      const { k, l, X } = hit;
      const Xp = [Math.round(X.x), Math.round(X.y)];
      const aEndSeg = (k === A.path.length - 2) ? 'end' : (k === 0 ? 'start' : null);
      const bEndSeg = (l === B.path.length - 2) ? 'end' : (l === 0 ? 'start' : null);
      if (aEndSeg) { trimEnd(A, aEndSeg, Xp); trimmed++; }
      else if (bEndSeg) { trimEnd(B, bEndSeg, Xp); trimmed++; }
      else {
        // 둘 다 중간 세그먼트 = 진짜 십자 → 작은 강을 X에서 절단 (긴 쪽 유지)
        const S = maxW(A) <= maxW(B) ? A : B;
        const segIdx = S === A ? k : l;
        if (segIdx + 1 >= S.path.length - segIdx) {
          S.path = S.path.slice(0, segIdx + 1);
          S.path.push({ pos: Xp, width: S.path[S.path.length - 1].width });
        } else {
          S.path = S.path.slice(segIdx + 1);
          S.path.unshift({ pos: Xp, width: S.path[0].width });
        }
        severed++;
      }
    }
  }
  return { trimmed, severed };
}
// 자기교차 루프 제거 (build-terrain-v2 전역 deloop)
// 감사 A6과 동일한 식 — 끝점 공유/되돌아온 꼬리(자기 몸 합류)까지 잡음
function segCross(a, b, c, e) {
  const d1 = (e[0] - c[0]) * (a[1] - c[1]) - (e[1] - c[1]) * (a[0] - c[0]);
  const d2 = (e[0] - c[0]) * (b[1] - c[1]) - (e[1] - c[1]) * (b[0] - c[0]);
  const d3 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d4 = (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0]);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function deloop(path) {
  for (let guard = 0; guard < 15; guard++) {
    let cut = false;
    outer:
    for (let i = 0; i < path.length - 1; i++) {
      for (let j = i + 2; j < path.length - 1; j++) {
        if (i === 0 && j === path.length - 2) continue;
        if (segCross(path[i].pos, path[i + 1].pos, path[j].pos, path[j + 1].pos)) {
          path.splice(i + 1, j - i);
          cut = true;
          break outer;
        }
      }
    }
    if (!cut) return;
  }
}

// 경계 강 클램프: 중심선이 경계 직선에서 (폭/2 − 280) 이상 못 벗어나게
function clampBoundaryRiver(r, orig, zoneSize) {
  const [zw, zh] = zoneSize;
  if (!isBoundaryRiver(orig, zoneSize)) return;
  // 원본의 지배 축 판정: x 분산 << y 분산 → 세로 강 (x≈c 클램프)
  const xs = orig.path.map(p => p.pos[0]), ys = orig.path.map(p => p.pos[1]);
  const vx = Math.max(...xs) - Math.min(...xs), vy = Math.max(...ys) - Math.min(...ys);
  const med = a => a.slice().sort((q, w) => q - w)[a.length >> 1];
  if (vx < vy) {
    const c = med(xs);
    for (const p of r.path) {
      const lim = Math.max(60, (p.width || 200) / 2 - 280);
      p.pos[0] = Math.round(Math.max(c - lim, Math.min(c + lim, p.pos[0])));
    }
  } else {
    const c = med(ys);
    for (const p of r.path) {
      const lim = Math.max(60, (p.width || 200) / 2 - 280);
      p.pos[1] = Math.round(Math.max(c - lim, Math.min(c + lim, p.pos[1])));
    }
  }
}


// ============================================================================
// v3 트리 기반 main — 핵심 불변식: 각 강은 mouth(한쪽 끝)만 부모/바다에 닿고
// source(반대 끝)는 어떤 강에도 안 닿는 발원점. → 2회 합류·교차 구조적 불가.
// ============================================================================
const OUT_JSON_V3 = path.join(__dirname, '..', '..', 'hanbando_terrain_v2.json');
const OUT_SVG_V3  = path.join(__dirname, '..', '..', 'hanbando_full_v2.svg');
const SEA_MARGIN = 600;
function maxWf(r) { return Math.max(...r.path.map(q => q.width || 200)); }
function nearestRiverBand(pt, rivers, self, extra) {
  let best = null;
  for (const o of rivers) {
    if (o === self) continue;
    const b = distToPathPt(pt.pos[0], pt.pos[1], o);
    const lim = b.w / 2 + (pt.width || 200) / 2 + (extra || 0);
    if (b.d < lim && (!best || b.d < best.d)) best = { r: o, d: b.d, x: b.x, y: b.y, w: b.w };
  }
  return best;
}
function buildRiverTree(rivers, zoneSize) {
  function cand(r, end, requireLarger) {
    let best = null;
    for (const o of rivers) {
      if (o === r) continue;
      if (requireLarger && maxWf(o) < maxWf(r)) continue;
      const b = distToPathPt(end[0], end[1], o);
      const lim = b.w / 2 + maxWf(r) / 2 + 1800;
      if (b.d < lim && (!best || b.d < best.d)) best = { r: o, d: b.d };
    }
    return best;
  }
  const info = rivers.map(r => {
    const s0 = r.path[0].pos, e0 = r.path[r.path.length - 1].pos;
    let s = cand(r, s0, true), e = cand(r, e0, true);
    if (!s && !e) { s = cand(r, s0, false); e = cand(r, e0, false); }
    let mouth, parent;
    if (s && e) { if (s.d <= e.d) { mouth = 'start'; parent = s.r; } else { mouth = 'end'; parent = e.r; } }
    else if (s) { mouth = 'start'; parent = s.r; }
    else if (e) { mouth = 'end'; parent = e.r; }
    else { mouth = s0[1] > e0[1] ? 'start' : 'end'; parent = 'sea'; }
    return { r, mouth, parent };
  });
  const byR = new Map(info.map(it => [it.r, it]));
  for (const it of info) {
    const seen = new Set([it.r]); let cur = it;
    while (cur.parent !== 'sea') {
      if (seen.has(cur.parent)) { it.parent = 'sea'; it.mouth = (it.r.path[0].pos[1] > it.r.path[it.r.path.length - 1].pos[1]) ? 'start' : 'end'; break; }
      seen.add(cur.parent); cur = byR.get(cur.parent); if (!cur) { it.parent = 'sea'; break; }
    }
  }
  return info;
}
function normalizeToTree(rivers, tree, zoneSize) {
  const [zw, zh] = zoneSize;
  const byR = new Map(tree.map(it => [it.r, it]));
  function depth(it) { let d = 0, c = it; const seen = new Set(); while (c.parent !== 'sea' && !seen.has(c.parent)) { seen.add(c.parent); d++; c = byR.get(c.parent); if (!c) break; } return d; }
  const order = tree.slice().sort((a, b) => depth(a) - depth(b));
  for (const it of order) {
    const r = it.r;
    if (isBoundaryRiver(r, zoneSize)) { deloop(r.path); continue; } // 경계 강 — 미러로 이웃 연결, 정규화/연장 제외
    const srcI = it.mouth === 'start' ? r.path.length - 1 : 0;
    // source 자유화
    {
      const fromStart = (srcI === 0);
      const keep = []; let blocking = true; const n = r.path.length;
      for (let k = 0; k < n; k++) {
        const ix = fromStart ? k : n - 1 - k;
        if (blocking) { const hit = nearestRiverBand(r.path[ix], rivers, r, 120); if (hit) continue; blocking = false; }
        keep.push(ix);
      }
      if (keep.length >= 3) r.path = keep.sort((p, q) => p - q).map(i2 => r.path[i2]);
    }
    const mI = it.mouth === 'start' ? 0 : r.path.length - 1;
    if (it.parent === 'sea') {
      if (maxWf(r) >= 600) {
        const pt = r.path[mI];
        if (pt.pos[1] < zh - SEA_MARGIN) {
          const x = pt.pos[0], y = pt.pos[1], targetY = zh + 200, dyTot = targetY - y;
          const nseg = Math.max(2, Math.ceil(dyTot / 700)); const seg = [];
          for (let kk = 1; kk <= nseg; kk++) { const t = kk / nseg; seg.push({ pos: [Math.round(x + Math.sin(t * Math.PI * 1.3) * 450 * (1 - t)), Math.round(y + dyTot * t)], width: pt.width || 200 }); }
          if (it.mouth === 'start') r.path = [...seg.reverse(), ...r.path]; else r.path = [...r.path, ...seg];
        }
      }
    } else {
      const P = it.parent;
      const b = distToPathPt(r.path[mI].pos[0], r.path[mI].pos[1], P);
      if (b.d > b.w / 2) {
        const dx = b.x - r.path[mI].pos[0], dy = b.y - r.path[mI].pos[1];
        const N = Math.min(5, r.path.length);
        for (let k = 0; k < N; k++) { const i2 = it.mouth === 'start' ? k : r.path.length - 1 - k; const f = 1 - k / N; r.path[i2].pos = [Math.round(r.path[i2].pos[0] + dx * f), Math.round(r.path[i2].pos[1] + dy * f)]; }
      }
    }
    deloop(r.path);
  }
}
// Phase 5-J: OPEN_BORDERS=1 — 경계 은폐 모드 (A 방식).
//   경계 정렬 장벽(경계 강 + 경계 능선)을 제거해 경계를 평범한 땅으로 → 유저가 경계 인지 못함.
//   경계 횡단 상호작용은 핸드오프 + cross-zone 전투(Phase 5-I)가 담당.
const OPEN_BORDERS = process.env.OPEN_BORDERS === '1';
const BOUNDARY_RIDGES = ['동해산맥', '백서산괴']; // 경계 정렬 능선
console.log(`지형 빌드 v3 (트리)${OPEN_BORDERS ? ' [OPEN_BORDERS=경계 평지화]' : ''}:`);
const d = JSON.parse(fs.readFileSync(SRC_JSON, 'utf8'));
for (const z of Object.keys(d)) {
  d[z].rivers = (d[z].rivers || []).filter(r => !r._mirroredFrom).map(r => { const c = { ...r }; delete c._smoothed; return c; });
  d[z].lakes  = (d[z].lakes  || []).filter(l => !l._mirroredFrom && !l._extra);
  delete d[z].ridges; delete d[z].passes; delete d[z].forests;
}
if (OPEN_BORDERS) {
  // 경계 강 제거 (사행 전 직선 기준). 트리는 이후 재추론되어 내부 수계로 재편.
  for (const [z, cfg] of Object.entries(ZONES)) {
    if (!d[z]) continue;
    const before = d[z].rivers.length;
    d[z].rivers = d[z].rivers.filter(r => !isBoundaryRiver(r, cfg.size));
    if (before !== d[z].rivers.length) console.log(`  [${z}] 경계 강 제거: ${before - d[z].rivers.length}개`);
  }
}
for (const [z, cfg] of Object.entries(ZONES)) {
  if (!d[z]) continue;
  const tree = buildRiverTree(d[z].rivers, cfg.size);
  const originals = d[z].rivers.map(r => JSON.parse(JSON.stringify(r)));
  d[z].rivers = d[z].rivers.map(r => meanderRiver(r, cfg.size));
  for (let i = 0; i < d[z].rivers.length; i++) clampBoundaryRiver(d[z].rivers[i], originals[i], cfg.size);
  const newByName = new Map(d[z].rivers.map(r => [r.name, r]));
  for (const it of tree) { it.r = newByName.get(it.r.name); if (it.parent !== 'sea') it.parent = newByName.get(it.parent.name); }
  normalizeToTree(d[z].rivers, tree, cfg.size);
  // 교차 제거(트림/절단) ↔ 트리 재정규화(source 자유화) 번갈아 — 고정점까지.
  // 트림이 끝점을 당겨 2회합류를 재생할 수 있으므로 normalize로 source를 다시 떼어냄.
  for (let it = 0; it < 6; it++) {
    const xr = resolveRiverCrossings(d[z].rivers);
    normalizeToTree(d[z].rivers, tree, cfg.size);
    if (!xr.trimmed && !xr.severed) break;
  }
  for (const r of d[z].rivers) deloop(r.path);
  // 분리 불가 결함 지류 제거 — w<250 작은 강이 (a)다른 강과 몸통 교차 or (b)양끝 같은 강 합류 시.
  // 원본부터 부모와 겹쳐 알고리즘으로 못 푸는 케이스. 작아서 제거해도 지도 영향 미미.
  {
    const bandHit = (pt, B) => { const b = distToPathPt(pt.pos[0], pt.pos[1], B); return b.d < b.w/2 + (pt.width||200)/2 + 150; };
    const bad = new Set();
    for (const A of d[z].rivers) {
      if (maxWf(A) >= 250) continue;
      for (const B of d[z].rivers) {
        if (A === B) continue;
        if (bandHit(A.path[0], B) && bandHit(A.path[A.path.length-1], B)) { bad.add(A); break; }
        let cross = false;
        for (let i=0;i<A.path.length-1&&!cross;i++) for (let j=0;j<B.path.length-1;j++) if (segIntPoint(A.path[i].pos,A.path[i+1].pos,B.path[j].pos,B.path[j+1].pos)) { cross=true; break; }
        if (cross) { bad.add(A); break; }
      }
    }
    if (bad.size) {
      // 제거 강의 자식은 조부모(제거 강의 parent)로 승계 후 재정규화
      const byName = new Map(tree.map(t => [t.r, t]));
      for (const t of tree) { if (t.parent !== 'sea' && bad.has(t.parent)) { const g = byName.get(t.parent); t.parent = g ? g.parent : 'sea'; } }
      d[z].rivers = d[z].rivers.filter(r => !bad.has(r));
      const treeKept = tree.filter(t => !bad.has(t.r));
      normalizeToTree(d[z].rivers, treeKept, cfg.size);
      for (let it = 0; it < 4; it++) { const xr = resolveRiverCrossings(d[z].rivers); normalizeToTree(d[z].rivers, treeKept, cfg.size); if (!xr.trimmed && !xr.severed) break; }
      for (const r of d[z].rivers) deloop(r.path);
      console.log('  [' + z + '] 결함 지류 제거: ' + [...bad].map(r=>r.name).join(',') + ' (자식 승계)');
    }
  }
  if (z === 'hanbando') console.log('  [' + z + '] 바다행: ' + tree.filter(t => t.parent === 'sea').map(t => t.r.name).join(','));
}
for (const mod of DATA_MODULES) {
  const z = mod.zone;
  let ridgeDefs = (mod.ridges || []);
  if (OPEN_BORDERS) ridgeDefs = ridgeDefs.filter(r => !BOUNDARY_RIDGES.includes(r.name)); // 경계 능선 제거
  const spineDef = ridgeDefs.find(r => r.name === '백두대간');
  const otherDefs = ridgeDefs.filter(r => r !== spineDef);
  const processed = []; let spineProc = null;
  if (spineDef) { spineProc = processRidge(spineDef, d[z].rivers); processed.push(spineProc); }
  for (const def of otherDefs) {
    if (def.pinStart && spineProc) {
      const [sx0, sy0] = def.path[0]; let best = null;
      for (const sp of spineProc.path) { const dd = Math.hypot(sp.pos[0] - sx0, sp.pos[1] - sy0); if (!best || dd < best.dd) best = { dd, pos: sp.pos }; }
      if (best) def.path[0] = [best.pos[0], best.pos[1], def.path[0][2]];
    }
    processed.push(processRidge(def, d[z].rivers));
  }
  d[z].ridges = processed;
  const manual = (mod.passes || []).map(p => ({ ...p }));
  for (let round = 0; round < 14; round++) {
    let moved = false;
    const small = d[z].rivers.filter(r => maxWf(r) < AVOID_W);
    const major = d[z].rivers.filter(r => maxWf(r) >= AVOID_W);
    for (const ridge of d[z].ridges) {
      if (ridge.noValley) continue;
      const pinned = (mod.ridges.find(rr => rr.name === ridge.name) || {}).pinStart;
      const pushPt = (pt, cx, cy, depth, cap) => { let dx = pt.pos[0] - cx, dy = pt.pos[1] - cy; let L = Math.hypot(dx, dy); if (L < 1) { dx = 1; dy = 0; L = 1; } const push = Math.min(cap, depth + 30); pt.pos[0] = Math.round(pt.pos[0] + dx / L * push); pt.pos[1] = Math.round(pt.pos[1] + dy / L * push); moved = true; };
      for (let i = pinned ? 1 : 0; i < ridge.path.length; i++) {
        const pt = ridge.path[i];
        for (const rv of small) { const h = maxIntrusion(pt.pos[0], pt.pos[1], pt.width, rv, RIDGE_GAP); if (h) pushPt(pt, h.cx, h.cy, h.depth, 500); }
        const prev = ridge.path[Math.max(0, i - 1)], next = ridge.path[Math.min(ridge.path.length - 1, i + 1)];
        let rdx = next.pos[0] - prev.pos[0], rdy = next.pos[1] - prev.pos[1]; const rl = Math.hypot(rdx, rdy) || 1;
        const hm = majorIntrusionWithDir(pt.pos[0], pt.pos[1], pt.width, major, RIDGE_GAP);
        if (hm && Math.abs((rdx / rl) * hm.dirx + (rdy / rl) * hm.diry) > 0.5) pushPt(pt, hm.cx, hm.cy, hm.depth, 600);
      }
      for (let i = 1; i < ridge.path.length; i++) {
        const a = ridge.path[i - 1], b = ridge.path[i];
        const mx = (a.pos[0] + b.pos[0]) / 2, my = (a.pos[1] + b.pos[1]) / 2, mw = (a.width + b.width) / 2;
        for (const rv of small) { const h = maxIntrusion(mx, my, mw, rv, RIDGE_GAP); if (h) for (const q of (pinned && i === 1 ? [b] : [a, b])) pushPt(q, h.cx, h.cy, h.depth, 400); }
      }
      for (let i = pinned ? 2 : 1; i < ridge.path.length - 1; i++) {
        ridge.path[i].pos[0] = Math.round(ridge.path[i].pos[0] * 0.7 + (ridge.path[i - 1].pos[0] + ridge.path[i + 1].pos[0]) * 0.15);
        ridge.path[i].pos[1] = Math.round(ridge.path[i].pos[1] * 0.7 + (ridge.path[i - 1].pos[1] + ridge.path[i + 1].pos[1]) * 0.15);
      }
      deloop(ridge.path);
    }
    if (!moved) break;
  }
  const valleys = computeAutoValleys(d[z].ridges, d[z].rivers, manual);
  let allPasses = [...manual, ...valleys]; let added = 0;
  for (const rv of d[z].rivers) {
    const rw = maxWf(rv);
    for (const rg of d[z].ridges) {
      for (let i = 0; i < rv.path.length - 1; i++) for (let j = 0; j < rg.path.length - 1; j++) {
        const X = segIntPoint(rv.path[i].pos, rv.path[i + 1].pos, rg.path[j].pos, rg.path[j + 1].pos);
        if (!X) continue;
        const Xp = [Math.round(X.x), Math.round(X.y)];
        if (allPasses.some(q => Math.hypot(q.pos[0] - Xp[0], q.pos[1] - Xp[1]) < q.radius)) continue;
        const rgw = rg.path[j].width || 1500;
        allPasses.push({ name: '계곡', pos: Xp, radius: Math.round(Math.max(rw / 2, 350) + rgw / 2 + 200), auto: true });
        added++;
      }
    }
  }
  if (added) console.log('  [' + z + '] 교차 협곡 보강: ' + added + '건');
  d[z].passes = allPasses;
  d[z].forests = (mod.forests || []).map(f => ({ ...f }));
  for (const lk of mod.lakes || []) d[z].lakes.push({ ...lk, _extra: true });
  console.log('  [' + z + '] ridges ' + d[z].ridges.length + ', passes ' + d[z].passes.length + ' (계곡 ' + valleys.length + ')');
}
for (const z of Object.keys(d)) {
  for (const r of (d[z].rivers || [])) if (!r._mirroredFrom) deloop(r.path);
  for (const r of (d[z].ridges || [])) if (!r._mirroredFrom) deloop(r.path);
}
mirrorAll(d);
fs.writeFileSync(OUT_JSON_V3, JSON.stringify(d), 'utf8');
console.log('  저장:', OUT_JSON_V3);
fs.writeFileSync(OUT_SVG_V3, renderSvg(d), 'utf8');
console.log('  SVG:', OUT_SVG_V3);
