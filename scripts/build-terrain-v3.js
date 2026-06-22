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
const SRC_JSON = path.join(__dirname, '..', 'server', 'hanbando-terrain.src.json'); // pristine 소스 (재빌드 누적 방지)
const GAME_JSON = path.join(__dirname, '..', 'server', 'hanbando-terrain.json'); // 게임 서버가 읽는 파일
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
  // 좌표 변환: 이웃 zone feature 좌표 → hanbando-local 프레임 (lakes와 동일식).
  //   hanbando는 항등(identity). 이웃은 off 차이만큼 평행이동.
  const tfFor = (zid) => {
    if (zid === 'hanbando') return (x, y) => [x, y];
    const dox = ZONES[zid].off[0] - ZONES.hanbando.off[0];
    const doy = ZONES[zid].off[1] - ZONES.hanbando.off[1];
    return (x, y) => [x + dox, y + doy];
  };
  const inPass = (x, y) => passes.some(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < q.radius);
  // 한 zone의 forests/ridges/rivers를 hanbando-local 프레임으로 그림.
  //   labels=true(hanbando만)일 때 이름 텍스트 추가, 이웃은 미러 도형만(라벨 생략).
  const drawZone = (zd, tf, labels) => {
    for (const f of zd.forests || []) {
      const [cx, cy] = tf(f.center[0], f.center[1]);
      out.push(`<ellipse cx="${px(cx).toFixed(1)}" cy="${py(cy).toFixed(1)}" rx="${(f.rx * SXC).toFixed(1)}" ry="${(f.ry * SYC).toFixed(1)}" fill="rgba(34,90,30,${(0.16 + 0.09 * f.densityMult).toFixed(2)})"/>`);
      if (labels) out.push(`<text x="${px(cx).toFixed(1)}" y="${py(cy).toFixed(1)}" text-anchor="middle" font-size="7" fill="#cfe8c0" font-weight="bold" font-family="sans-serif">${esc(f.name)} ×${f.densityMult}</text>`);
    }
    // 산맥 — 가변 폭 밴드, 고개 구간 분리
    for (const ridge of zd.ridges || []) {
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
        const [x1, y1] = tf(p[i].pos[0], p[i].pos[1]), [x2, y2] = tf(p[i + 1].pos[0], p[i + 1].pos[1]);
        const w1 = p[i].width, w2 = p[i + 1].width;
        const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 500));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, w = w1 + (w2 - w1) * t;
          if (!inPass(x, y)) run.push({ x, y, w }); else flush();
        }
      }
      const last = tf(p[p.length - 1].pos[0], p[p.length - 1].pos[1]);
      if (!inPass(last[0], last[1])) run.push({ x: last[0], y: last[1], w: p[p.length - 1].width });
      flush();
      if (labels) {
        const mid = tf(p[Math.floor(p.length / 2)].pos[0], p[Math.floor(p.length / 2)].pos[1]);
        out.push(`<text x="${px(mid[0]).toFixed(1)}" y="${(py(mid[1]) - 5).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(ridge.name)}</text>`);
      }
    }
    // 강 — 사행화됐으니 세그먼트 stroke로 자연스럽게
    for (const r of zd.rivers || []) {
      const p = r.path;
      for (let i = 0; i < p.length - 1; i++) {
        const [x1, y1] = tf(p[i].pos[0], p[i].pos[1]), [x2, y2] = tf(p[i + 1].pos[0], p[i + 1].pos[1]);
        const w = ((p[i].width || 200) + (p[i + 1].width || 200)) / 2;
        out.push(`<line x1="${px(x1).toFixed(1)}" y1="${py(y1).toFixed(1)}" x2="${px(x2).toFixed(1)}" y2="${py(y2).toFixed(1)}" stroke="#2e6fa8" stroke-width="${Math.max(0.5, w * SXC).toFixed(1)}" stroke-linecap="round"/>`);
      }
      if (labels && r.name && r.name !== '경계지류' && !r._mirroredFrom) {
        const mp = tf(p[Math.floor(p.length / 2)].pos[0], p[Math.floor(p.length / 2)].pos[1]);
        out.push(`<text x="${px(mp[0]).toFixed(1)}" y="${(py(mp[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(r.name)}</text>`);
      }
    }
  };
  // 이웃 zone(미러된 경계 feature 보유)을 먼저 그려 솔기 건너편 절반을 채움 — hanbando 도형 아래.
  for (const zid of ['bering', 'jungwon_n', 'nippon']) {
    if (d[zid]) drawZone(d[zid], tfFor(zid), false);
  }
  // hanbando 본체 (라벨 포함)
  drawZone(hb, tfFor('hanbando'), true);
  for (const q of passes) {
    out.push(`<circle cx="${px(q.pos[0]).toFixed(1)}" cy="${py(q.pos[1]).toFixed(1)}" r="${(q.radius * SXC).toFixed(1)}" fill="none" stroke="${q.auto ? '#88c0ff' : '#ffd070'}" stroke-width="0.8" stroke-dasharray="2,1.5"/>`);
    if (!q.auto) out.push(`<text x="${px(q.pos[0]).toFixed(1)}" y="${(py(q.pos[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#ffd070" font-weight="bold" font-family="sans-serif">${esc(q.name)}</text>`);
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
// 경계 지류용: 한 경계변(side)에서 가장 가까운(=가장 안쪽 침투한) 부모 강 위의 점(mouth) 후보를 찾는다.
// side: 'N'|'W'|'E'. depthOf(x,y)=경계까지의 수직 깊이. 깊이가 가장 작은 강 path 점을 고른다.
function nearestRiverPointsToSide(rivers, side, zoneWidth, zoneHeight, minWidth) {
  const depthOf = (x, y) => side === 'N' ? y : (side === 'W' ? x : zoneWidth - x);
  const cands = [];
  for (const r of rivers) {
    if (maxWf(r) < (minWidth || 0)) continue;
    // 각 강에서 경계에 가장 가까운 점만 후보로 (강당 1점)
    let best = null;
    for (let i = 0; i < r.path.length; i++) {
      const [x, y] = r.path[i].pos;
      const dep = depthOf(x, y);
      if (dep < 1500) continue; // 너무 경계 가까운 강은 부모로 부적합
      if (!best || dep < best.depth) best = { r, idx: i, x, y, depth: dep, w: r.path[i].width || 200 };
    }
    if (best) cands.push(best);
  }
  cands.sort((a, b) => a.depth - b.depth);
  return cands;
}
// 후보 path가 기존 강(다른 강) 또는 능선과 교차하면 true.
function pathCrossesAny(path, rivers, ridges, ignoreRiver) {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i].pos, b = path[i + 1].pos;
    for (const o of rivers) {
      if (o === ignoreRiver) continue;
      for (let j = 0; j < o.path.length - 1; j++) {
        if (segIntPoint(a, b, o.path[j].pos, o.path[j + 1].pos)) return true;
      }
    }
    for (const rg of ridges) {
      for (let j = 0; j < rg.path.length - 1; j++) {
        if (segIntPoint(a, b, rg.path[j].pos, rg.path[j + 1].pos)) return true;
      }
    }
  }
  return false;
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
  // === 경계 밀도 강화 v5 (OPEN_BORDERS 전용; hanbando 육지 경계 N/W/E) ===
  // 재설계 요지(유저 피드백 2건):
  //  (1) 길고 큰 경계 산맥/강을 폐기 → 짧은 토막(2500~6000px)을 듬성듬성 흩뿌림.
  //      경계변을 슬롯으로 나눠 슬롯당 최대 1개, 큰 갭. 경계변의 절반 이하만 덮음.
  //  (2) feature가 경계선을 "품도록"(straddle): 토막 중심선을 경계선에 바짝(수직거리 offset≈0~250px)
  //      두고, width 밴드가 경계선을 덮어 솔기가 밴드 한가운데를 지나게.
  //      → mirrorAll이 이웃 zone(W=jungwon_n, E=nippon, N=bering)으로 반쪽을 복제 →
  //         양쪽 zone에 걸친 하나의 자연 장벽. 좌표 자체는 local(0..zoneWidth) 안에만 찍고,
  //         width로 밴드가 경계 너머까지 넘어감.
  //  토막당 산 1~2 + 강 1을 섞음. 약한 굽이 + Chaikin 스무딩, 가운데 굵고 양끝 테이퍼.
  if (OPEN_BORDERS && z === 'hanbando') {
    const [zoneWidth, zoneHeight] = ZONES[z].size; // [70016, 130016]
    // toXY(along, depth): 경계변을 따라(along) + 경계로부터 안쪽 수직거리(depth>=0)를 월드 좌표로.
    //   N = 북쪽(y=0)변,   along=x, depth=y
    //   W = 서쪽(x=0)변,   along=y, depth=x
    //   E = 동쪽(x=zoneWidth)변, along=y, depth=zoneWidth-x
    const SIDES = [
      { side: 'N', edgeLen: zoneWidth,  toXY: (along, depth) => [along, depth], toLocal: (x, y) => [x, y] },
      { side: 'W', edgeLen: zoneHeight, toXY: (along, depth) => [depth, along], toLocal: (x, y) => [y, x] },
      { side: 'E', edgeLen: zoneHeight, toXY: (along, depth) => [zoneWidth - depth, along], toLocal: (x, y) => [y, zoneWidth - x] },
    ];
    // Chaikin 스무딩 (corner-cut) — pos/width path 점 배열.
    const chaikinPath = (pts, rounds) => {
      let cur = pts;
      for (let r = 0; r < rounds; r++) {
        const out = [cur[0]];
        for (let i = 0; i < cur.length - 1; i++) {
          const a = cur[i], b = cur[i + 1];
          out.push({ pos: [a.pos[0] * 0.75 + b.pos[0] * 0.25, a.pos[1] * 0.75 + b.pos[1] * 0.25], width: a.width * 0.75 + b.width * 0.25 });
          out.push({ pos: [a.pos[0] * 0.25 + b.pos[0] * 0.75, a.pos[1] * 0.25 + b.pos[1] * 0.75], width: a.width * 0.25 + b.width * 0.75 });
        }
        out.push(cur[cur.length - 1]);
        cur = out;
      }
      return cur;
    };
    const roundPath = (pts) => pts.map(p => ({ pos: [Math.round(p.pos[0]), Math.round(p.pos[1])], width: Math.round(p.width) }));
    // clamp depth: 중심선은 local 좌표 안(>=0)에만. 경계 바짝(살짝 안쪽).
    const clampDepth = (off) => Math.max(0, off);
    let addF = 0, addR = 0, addRv = 0;
    const connLog = []; // 연결 보고용
    const newRanges = []; // 경계 산 토막
    const newRivers = []; // 경계 강 토막
    const smallRiversNow = () => d[z].rivers.filter(r => maxWf(r) < AVOID_W);
    const majorRiversNow = () => d[z].rivers.filter(r => maxWf(r) >= AVOID_W);

    // 후보 토막이 소형 강과 "길게 평행 겹침"(>2100px 연속)하면 거부 — 협곡으로 못 가려 A1 위반.
    // 짧은 직교 겹침은 허용(나중에 협곡으로 가림).
    const parallelOverlap = (path, margin, limitRun) => {
      const sr = smallRiversNow();
      let run = 0;
      for (let i = 0; i < path.length; i++) {
        const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]) / 300));
        for (let s2 = 0; s2 <= steps; s2++) {
          const tt = s2 / steps;
          const x = a.pos[0] + (b.pos[0] - a.pos[0]) * tt, y = a.pos[1] + (b.pos[1] - a.pos[1]) * tt;
          const w = a.width + (b.width - a.width) * tt;
          let hit = false;
          for (const rv of sr) if (maxIntrusion(x, y, w, rv, margin)) { hit = true; break; }
          if (hit) { run++; if (run > limitRun) return true; } else run = 0;
        }
      }
      return false;
    };
    // 후보 path가 본류(폭≥AVOID_W)와 교차하면 true (A8 위반 방지).
    const crossesMajor = (path) => {
      for (let i = 0; i < path.length - 1; i++) {
        for (const o of d[z].rivers) {
          if (maxWf(o) < AVOID_W) continue;
          for (let j = 0; j < o.path.length - 1; j++) {
            if (segIntPoint(path[i].pos, path[i + 1].pos, o.path[j].pos, o.path[j + 1].pos)) return true;
          }
        }
      }
      return false;
    };
    // 강 토막이 능선 밴드 안에 길게 평행 머물면 A7 위반 → 거부.
    const riverParallelInRange = (path) => {
      let run = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.pos[0]-a.pos[0], b.pos[1]-a.pos[1]) / 350));
        for (let s2 = 0; s2 <= steps; s2++) {
          const tt = s2 / steps;
          const x = a.pos[0] + (b.pos[0]-a.pos[0]) * tt, y = a.pos[1] + (b.pos[1]-a.pos[1]) * tt;
          const w = a.width + (b.width - a.width) * tt;
          let hit = false;
          for (const rg of d[z].ridges) if (maxIntrusion(x, y, w, rg, 200)) { hit = true; break; }
          if (hit) { run++; if (run > 5) return true; } else run = 0;
        }
      }
      return false;
    };

    // 경계산맥 몸통이 기존(비-경계) 능선 밴드 안에 길게 평행 머물면 true(A1/A7 위반 위험).
    //   연결 끝점 근처(마지막 ~2000px)는 부착이므로 검사 제외.
    const ridgeBodyOverlapsRidge = (path) => {
      let total = 0; for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].pos[0]-path[i-1].pos[0], path[i].pos[1]-path[i-1].pos[1]);
      let acc = 0, run = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const segL = Math.hypot(b.pos[0]-a.pos[0], b.pos[1]-a.pos[1]);
        const steps = Math.max(1, Math.ceil(segL / 350));
        for (let s2 = 0; s2 <= steps; s2++) {
          const tt = s2 / steps;
          const x = a.pos[0] + (b.pos[0]-a.pos[0]) * tt, y = a.pos[1] + (b.pos[1]-a.pos[1]) * tt;
          const w = a.width + (b.width - a.width) * tt;
          const fromEnd = total - (acc + segL * tt);
          if (fromEnd < 3800) continue; // 연결 끝 부근(부착부)은 검사 제외 — 끝점만 닿고 몸통은 띄움
          let hit = false;
          for (const rg of d[z].ridges) { if (newRanges.includes(rg)) continue; if (maxIntrusion(x, y, w, rg, 150)) { hit = true; break; } }
          if (hit) { run++; if (run > 7) return true; } else run = 0;
        }
        acc += segL;
      }
      return false;
    };
    // 경계산맥 몸통이 본류(폭≥AVOID_W) 밴드 안에 길게 평행 머물면 true(A7 위반 위험).
    //   평행 구간이 본류와 나란히 달리면 안 됨. 연결 끝 부근(부착부)은 제외.
    const ridgeBodyOverlapsMajorRiver = (path) => {
      let total = 0; for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].pos[0]-path[i-1].pos[0], path[i].pos[1]-path[i-1].pos[1]);
      let acc = 0, run = 0;
      const mr = majorRiversNow();
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const segL = Math.hypot(b.pos[0]-a.pos[0], b.pos[1]-a.pos[1]);
        const steps = Math.max(1, Math.ceil(segL / 350));
        for (let s2 = 0; s2 <= steps; s2++) {
          const tt = s2 / steps;
          const x = a.pos[0] + (b.pos[0]-a.pos[0]) * tt, y = a.pos[1] + (b.pos[1]-a.pos[1]) * tt;
          const w = a.width + (b.width - a.width) * tt;
          const fromEnd = total - (acc + segL * tt);
          if (fromEnd < 3800) continue; // 연결 끝 부근(부착부)은 제외
          let hit = false;
          for (const rv of mr) if (maxIntrusion(x, y, w, rv, 150)) { hit = true; break; }
          if (hit) { run++; if (run > 6) return true; } else run = 0;
        }
        acc += segL;
      }
      return false;
    };
    // 경계산맥 겹침 검사 v6: 후보 path를 ~300px 간격 샘플 → 각 점의 band(폭/2)가
    //   이미 배치된 다른 능선(경계산맥 + 기존 본산맥) band와 400px gap 미만이면 겹침.
    //   연결 끝점(target 부착점) ±3000px 부근은 예외(거기선 닿아야 함).
    //   반환: true=겹침(거부). compareRidges: 검사 대상 능선 목록.
    const RIDGE_OVERLAP_GAP = 400;
    const ridgeBandOverlaps = (path, target, compareRidges) => {
      const tx = target ? target[0] : null, ty = target ? target[1] : null;
      for (let i = 0; i < path.length; i++) {
        const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
        const segL = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
        const steps = Math.max(1, Math.ceil(segL / 300));
        for (let s2 = 0; s2 <= steps; s2++) {
          const tt = s2 / steps;
          const x = a.pos[0] + (b.pos[0] - a.pos[0]) * tt, y = a.pos[1] + (b.pos[1] - a.pos[1]) * tt;
          const w = a.width + (b.width - a.width) * tt;
          // 부착점 부근(±3000px)은 예외 — 닿아야 하므로
          if (tx != null && Math.hypot(x - tx, y - ty) < 3000) continue;
          for (const rg of compareRidges) {
            const b2 = distToPathPt(x, y, rg);
            const gap = b2.d - (w / 2 + (b2.w || 0) / 2);
            if (gap < RIDGE_OVERLAP_GAP) return true;
          }
        }
      }
      return false;
    };

    // 후보 강 path가 본류와 교차하면 true. 단 연결 target(합류점) 부근 끝점 접촉은 허용.
    const crossesMajorExceptEnd = (path, target) => {
      const endPt = path[path.length - 1].pos;
      for (let i = 0; i < path.length - 1; i++) {
        const isEndSeg = (i >= path.length - 2);
        for (const o of d[z].rivers) {
          if (maxWf(o) < AVOID_W) continue;
          for (let j = 0; j < o.path.length - 1; j++) {
            const X = segIntPoint(path[i].pos, path[i + 1].pos, o.path[j].pos, o.path[j + 1].pos);
            if (!X) continue;
            if (isEndSeg && Math.hypot(X.x - endPt[0], X.y - endPt[1]) < 1200) continue;
            return true;
          }
        }
      }
      return false;
    };

    // 단일 매끄러운 곡선 토막 (백두대간식 spline) — 유저 요구(칼각/ㄱ자 금지):
    //   경계를 "따라 직선으로" 가지 않는다. 경계를 스치듯(graze) 지나며 내륙 target으로
    //   처음부터 끝까지 하나의 부드러운 곡선으로 휘어 들어간다.
    //   구조: 3~4개 control point를 지나는 Catmull-Rom spline → 조밀 샘플 → Chaikin.
    //     CP0 = 경계 근처 시작(depth≈0, 솔기 그레이즈)
    //     CP1 = 경계를 스치며 along으로 진행(depth 살짝, 여전히 솔기 덮는 구간)
    //     CP2 = 경계에서 비스듬히 멀어지는 중간점(depth 중간)
    //     CP3 = 내륙 target(기존 능선 밴드 안)
    //   곡률이 어느 한 점에 집중되지 않아 전 구간 완만. width 밴드(경계 근처 wMax)가
    //   솔기를 덮어 mirrorAll이 양쪽 zone에 한 장벽으로 복제.
    //   kind: 'ridge'(산) | 'river'(강). 폭 변주·테이퍼.
    //   along0 = 그레이즈 시작 along. target=[tx,ty] 내륙 연결점. toLocal: 월드→(along,depth).
    // Catmull-Rom (centripetal) 보간: pts=[{a,d}...], 균일 t로 N점 샘플.
    const catmullRom = (pts, N) => {
      // 양끝 가상점(phantom) 추가 — 끝 접선 연장.
      const ext = [
        [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
        ...pts,
        [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]],
      ];
      const out = [];
      const segs = pts.length - 1;
      for (let s = 0; s < segs; s++) {
        const p0 = ext[s], p1 = ext[s + 1], p2 = ext[s + 2], p3 = ext[s + 3];
        const steps = Math.max(2, Math.round(N / segs));
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          const t2 = t * t, t3 = t2 * t;
          const a0 = -0.5 * t3 + t2 - 0.5 * t;
          const a1 = 1.5 * t3 - 2.5 * t2 + 1;
          const a2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
          const a3 = 0.5 * t3 - 0.5 * t2;
          out.push([
            a0 * p0[0] + a1 * p1[0] + a2 * p2[0] + a3 * p3[0],
            a0 * p0[1] + a1 * p1[1] + a2 * p2[1] + a3 * p3[1],
          ]);
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    };
    const makeSegment = (rng, side, toXY, toLocal, along0, dir, kind, target, edgeLen) => {
      const tgtL = toLocal(target[0], target[1]);
      const aTgt = tgtL[0], dTgt = Math.max(0, tgtL[1]); // 내륙 target along/depth
      const smooth = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); // smoothstep
      // 폭: 평행 max ~1700~2200, 끝 테이퍼 ~700.
      const wMax = kind === 'ridge' ? (1700 + rng() * 500) : (300 + rng() * 250);
      const wEnd = kind === 'ridge' ? 700 : 200;
      const dStart = kind === 'ridge' ? (rng() * 110) : (rng() * 90); // 경계 끝 depth ~0 (straddle)
      // ---- Control points (along, depth) ----
      // 백두대간식 완만한 단일 곡선: depth가 처음부터 끝까지 단조롭게(아주 천천히 시작) 일어나
      //   "평행 직선 후 급커브"가 생기지 않게 한다. 경계 그레이즈는 시작부 작은 depth로 표현
      //   (솔기 커버는 width 밴드가 담당) — 곡선 자체는 한 점에서 꺾지 않는다.
      const aDir = (aTgt >= along0) ? 1 : -1;              // target 쪽 along 진행 방향
      const a0 = along0;
      const aSpanTot = aTgt - a0;
      // depth 곡선: 초반엔 매우 완만(경계 그레이즈), 후반에 target까지. 단조 증가.
      //   각 CP의 along은 균등에 가깝게 분배(곡률을 한 곳에 모으지 않음) → 윈도 누적각 ↓.
      //   depth는 smoothstep으로 0→dTgt: 시작 접선이 along축에 가깝게(경계 스침), 점진 상승.
      const sstep = (x) => x*x*(3-2*x);
      // CP를 along에 고르게 분배하고 depth를 정확히 smoothstep 곡선 위에 둔다.
      //   → control polygon 자체가 매끄러운 S곡선 → Catmull-Rom 곡률이 전 구간 완만(윈도 누적각 ↓).
      //   끝(CP2→CP3) 기울기도 smoothstep 감속부라 급커브가 생기지 않음.
      const f1 = 0.33, f2 = 0.66;
      const a1 = a0 + aSpanTot * f1;
      const a2v = a0 + aSpanTot * f2;
      const d1 = dStart + (dTgt - dStart) * sstep(f1);
      const d2v = dStart + (dTgt - dStart) * sstep(f2);
      // 자연스러운 약한 횡변위(굽이) — along축으로 아주 살짝(곡률 급변 방지 위해 소폭).
      const wob1 = (rng() - 0.5) * 2 * (220 + rng() * 180);
      const wob2 = (rng() - 0.5) * 2 * (260 + rng() * 200);
      const cps = [
        [a0, dStart],
        [a1 + wob1, d1],
        [a2v + wob2, d2v],
        [aTgt, dTgt],
      ];
      // ---- 곡선 길이 가늠 → 샘플 수 ----
      let chordLen = 0;
      for (let i = 1; i < cps.length; i++) chordLen += Math.hypot(cps[i][0] - cps[i-1][0], cps[i][1] - cps[i-1][1]);
      const N = Math.max(24, Math.round(chordLen / 500));
      const sm = catmullRom(cps, N);
      // ---- 곡선 누적 길이(폭 테이퍼·솔기커버용) ----
      const segL = [0];
      for (let i = 1; i < sm.length; i++) segL.push(segL[i-1] + Math.hypot(sm[i][0]-sm[i-1][0], sm[i][1]-sm[i-1][1]));
      const total = segL[sm.length - 1] || 1;
      // 폭: 곡선 초반(솔기 덮는 그레이즈 구간) wMax 유지, 후반 절반에서 wEnd로 부드럽게 테이퍼.
      const taperStart = 0.45;                              // 0~taperStart=wMax, 이후 테이퍼
      const raw = [];
      for (let i = 0; i < sm.length; i++) {
        const u = segL[i] / total;                         // 0..1 호 길이 비율
        let w;
        if (u <= taperStart) w = wMax;
        else { const tv = (u - taperStart) / (1 - taperStart); w = wMax + (wEnd - wMax) * smooth(tv); }
        const dpos = clampDepth(sm[i][1]);
        const [x, y] = toXY(sm[i][0], dpos);
        raw.push({ pos: [x, y], width: w });
      }
      // 내륙 끝점을 target에 정확히 스냅(연결), 폭은 wEnd.
      raw[raw.length - 1] = { pos: [target[0], target[1]], width: wEnd };
      return roundPath(chaikinPath(raw, 2));
    };

    // ---- 내륙 연결점(target) 탐색 헬퍼 ----
    // 능선 target: 기존 능선(백두대간/묘향/멸악/차령/노령/함경) 중 슬롯 along범위 [aLo,aHi] 안,
    //   경계로부터 depth가 [7500,15000]인 중심선 점. 적정 depth(~11000)에 가까운 점 선택(A2식 지맥 부착).
    //   반환 {pos, along, dep}.
    //   슬롯 중심(aMid) 근처를 선호하되 along은 강제하지 않음(없으면 가까운 능선으로 자연스럽게).
    //   후보를 cost 오름차순 리스트로 반환 → 부착 경로가 지류와 평행 겹치면 다음 후보로 재시도.
    const ridgeTargets = (toLocal, aMid) => {
      const cands = [];
      for (const rg of d[z].ridges) {
        if (newRanges.includes(rg)) continue; // 신규 경계산맥끼리 부착 금지
        for (let i = 0; i < rg.path.length; i++) {
          const [x, y] = rg.path[i].pos;
          const [a, dep] = toLocal(x, y);
          if (dep < 6000 || dep > 14000) continue; // 평행 5~8km + 꼬리 합쳐 총 12000~20000 유지
          const cost = Math.abs(a - aMid) + Math.abs(dep - 9000) * 0.3; // 슬롯 근접 + 적정 depth(~9000)
          cands.push({ pos: [x, y], along: a, dep, cost, ridge: rg });
        }
      }
      cands.sort((p, q) => p.cost - q.cost);
      return cands;
    };
    // 강 target: 슬롯 중심 근처 기존 강 점(합류 mouth) 후보 리스트.
    //   본류 우선(cost 가산 없음), 소형 강도 허용(약간 페널티) — 경계강은 지류로 흘러듦.
    const riverTargets = (toLocal, aMid) => {
      const cands = [];
      for (const rv of d[z].rivers) {
        if (newRivers.includes(rv)) continue;
        if (rv.name === '경계강') continue;
        const minor = maxWf(rv) < AVOID_W;
        for (let i = 0; i < rv.path.length; i++) {
          const [x, y] = rv.path[i].pos;
          const [a, dep] = toLocal(x, y);
          if (dep < 6000 || dep > 14000) continue; // 평행 5~8km + 꼬리 합쳐 총 12000~20000 유지
          const cost = Math.abs(a - aMid) + Math.abs(dep - 9000) * 0.3 + (minor ? 4000 : 0);
          cands.push({ pos: [x, y], along: a, dep, cost, rv });
        }
      }
      cands.sort((p, q) => p.cost - q.cost);
      return cands;
    };

    // ---- 경계변마다 듬성듬성 긴 토막: 산 1~2 + 강 1 ----
    // 경계변을 nSlots 슬롯으로 나눠 슬롯마다 최대 1개, 슬롯 안에서 랜덤 along0 + 큰 갭.
    // 토막은 경계 끝(straddle)에서 내륙 target까지 길게(9000~16000px) 비스듬히 뻗음.
    const segLen = (path) => { let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].pos[0]-path[i-1].pos[0], path[i].pos[1]-path[i-1].pos[1]); return Math.round(L); };
    const dist2 = (p, q) => Math.hypot(p[0]-q[0], p[1]-q[1]);
    for (const { side, edgeLen, toXY, toLocal } of SIDES) {
      const rng = seededRand(hashStr('seg_' + z + '_' + side));
      // 토막 구성: 경계산맥 + 경계강(신규). 듬성듬성하게 슬롯 분배.
      //   긴 동/서변(E/W) = 산 3 + 강 2, 짧은 북변(N) = 산 2 + 강 1.
      //   전체 ~산 8 + 강 5. 슬롯 갭은 유지(전체 경계 도배 금지).
      const nRidge = (side === 'N') ? 2 : 3;             // 산: N=2, E/W=3
      const nRiver = (side === 'N') ? 1 : (1 + (rng() < 0.6 ? 1 : 0)); // 강: N=1, E/W=1~2
      const kinds = [];
      for (let i = 0; i < nRidge; i++) kinds.push('ridge');
      for (let i = 0; i < nRiver; i++) kinds.push('river');
      // 산·강이 한쪽에 몰리지 않게 섞음.
      for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      const nSlots = kinds.length + 1;
      const slotW = edgeLen / nSlots;
      const slotIdx = [];
      for (let i = 0; i < nSlots; i++) slotIdx.push(i);
      for (let i = slotIdx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slotIdx[i], slotIdx[j]] = [slotIdx[j], slotIdx[i]]; }
      kinds.forEach((kind, ki) => {
        const slot = slotIdx[ki];
        const slotStart = slot * slotW;
        const aMid = slotStart + 0.5 * slotW; // 슬롯 중심 — target 탐색 선호점
        // 연결 후보 리스트(cost 오름차순). 부착 경로가 막히면 다음 후보 능선/강으로 재시도.
        const tcands = kind === 'ridge' ? ridgeTargets(toLocal, aMid) : riverTargets(toLocal, aMid);
        const TOPN = Math.min(tcands.length, 12); // 상위 12 후보 순회
        let placed = null, placedTgt = null, connectedTo = null;
        for (let attempt = 0; attempt < 60 && !placed; attempt++) {
          const lastResort = attempt >= 54; // 마지막에만 fallback(미연결) 허용
          let target, conn;
          if (TOPN > 0 && !lastResort) {
            const tinfo = tcands[attempt % TOPN];
            target = tinfo.pos; conn = tinfo;
          } else {
            // 연결 target 없음/마지막 → 내륙으로 비스듬히 뻗는 fallback.
            //   강: 경계끝(straddle)이 하구(솔기 너머 이웃 zone으로 미러 연결) → 내륙끝은 발원점(자유).
            //   산: 내륙끝 자유(미연결 지맥).
            const depFB = 8500 + rng() * 4000; // 내륙 발원/지맥 fallback 깊이(평행구간+꼬리 총길이 12000~20000)
            const alongOff = (rng() < 0.5 ? 1 : -1) * depFB * (0.3 + rng() * 0.3);
            const fbXY = toXY(aMid + alongOff, depFB);
            target = [fbXY[0], fbXY[1]];
            conn = null;
          }
          // 평행 구간 시작 along0: target의 along에서 ~(평행+전환)만큼 target 반대로 떨어진 곳에서 시작.
          //   경계를 따라 target 쪽으로 나란히 흐르다 완만한 호로 비스듬히 내륙 진입(급각 없음).
          const tAlong = conn ? conn.along : (toLocal(target[0], target[1])[0]);
          const runGuess = 5500 + rng() * 2500;            // 평행(~5km)+전환(~3~5km) 합 가늠
          const lateral = (rng() - 0.5) * 2 * 1500;        // 시작점 along 약간 랜덤
          const aStartWant = Math.max(300, Math.min(edgeLen - 300, tAlong + lateral));
          // along0 = target에서 runGuess만큼 뒤로(target 반대 방향). 경계 안에 클램프.
          const sweepDir = (tAlong >= aStartWant) ? 1 : -1;
          let a0 = Math.max(300, Math.min(edgeLen - 300, aStartWant - sweepDir * runGuess));
          const dir = a0 <= tAlong ? 1 : -1;
          const cand = makeSegment(rng, side, toXY, toLocal, a0, dir, kind, target, edgeLen);
          const cLen = segLen(cand);
          if ((cLen < 12000 || cLen > 20000) && !lastResort) continue; // 길이 12000~20000 보장
          if (kind === 'ridge') {
            if (ridgeBodyOverlapsRidge(cand) && !lastResort) continue; // 기존 능선과 몸통 평행 중첩 금지(연결 끝점만 닿게)
            if (ridgeBodyOverlapsMajorRiver(cand)) continue; // 본류 몸통 평행 중첩 금지(A7) — lastResort에서도 적용(겹침 우선)
            if (parallelOverlap(cand, 250, 7) && !lastResort) continue; // 소형 강 평행 겹침 금지(A1)
            // v6 겹침 제거: 이미 배치된 모든 능선(경계산맥+기존 본산맥)과 band 400px gap 검사.
            //   부착점(target) ±3000px 예외. lastResort에서도 적용(겹침 없는 게 최우선).
            const cmpRidges = d[z].ridges; // 기존 능선 전체(신규 경계산맥 newRanges는 d[z].ridges에 push되어 포함됨)
            if (ridgeBandOverlaps(cand, target, cmpRidges)) continue;
            placed = cand; placedTgt = target; connectedTo = conn;
          } else {
            if (crossesMajorExceptEnd(cand, target) && !lastResort) continue; // A8
            if (riverParallelInRange(cand)) continue;          // A7 — lastResort에서도 적용(겹침 우선)
            placed = cand; placedTgt = target; connectedTo = conn;
          }
        }
        if (!placed) return;
        // 연결 로그용 이름 기록
        if (connectedTo) {
          if (kind === 'ridge') {
            connLog.push('경계산맥 → ' + (connectedTo.ridge ? connectedTo.ridge.name : '?') + ' 부착');
          } else {
            connLog.push('경계강 → ' + (connectedTo.rv && connectedTo.rv.name ? connectedTo.rv.name : '강') + ' 합류');
          }
        } else {
          connLog.push((kind === 'ridge' ? '경계산맥 → 내륙 지맥(독립)' : '경계강 → 솔기 하구(발원 내륙)'));
        }
        if (kind === 'ridge') {
          const range = { name: '경계산맥', path: placed, noFit: true, noTaper: true };
          d[z].ridges.push(range); newRanges.push(range); addR++;
          // 가운데 고개 1개 — 완전한 벽 방지.
          const midPt = placed[Math.floor(placed.length / 2)];
          d[z].passes.push({ name: '경계고개', pos: [...midPt.pos], radius: Math.round((midPt.width || 1400) / 2 + 700), auto: false });
        } else {
          const river = { name: '경계강', path: placed };
          d[z].rivers.push(river); newRivers.push(river); addRv++;
        }
      });
    }
    // 경계강을 가로지르는 소형 지류는 교차점에서 잘라 합류(자연 합수, A8 회피).
    let truncTrib = 0;
    for (const br of newRivers) {
      for (const o of d[z].rivers) {
        if (o === br || maxWf(o) >= AVOID_W || newRivers.includes(o)) continue;
        let hit = null;
        for (let k = 0; k < o.path.length - 1 && !hit; k++) {
          for (let l = 0; l < br.path.length - 1; l++) {
            const X = segIntPoint(o.path[k].pos, o.path[k + 1].pos, br.path[l].pos, br.path[l + 1].pos);
            if (X) { hit = { k, X }; break; }
          }
        }
        if (!hit) continue;
        const Xp = [Math.round(hit.X.x), Math.round(hit.X.y)];
        const keepStart = (hit.k + 1) >= (o.path.length - 1 - hit.k);
        if (keepStart) { o.path = o.path.slice(0, hit.k + 1); o.path.push({ pos: Xp, width: o.path[o.path.length - 1].width }); }
        else { o.path = o.path.slice(hit.k + 1); o.path.unshift({ pos: Xp, width: o.path[0].width }); }
        truncTrib++;
      }
    }
    if (truncTrib) console.log('  [' + z + '] 경계강 합류 지류 절단: ' + truncTrib + '건');

    // ============================================================================
    // 기존 강 연장 (신규 방식 — 핵심): hanbando 기존 내륙 강 중, 한쪽 끝(하구 반대쪽,
    //   발원 가까운 끝)이 어느 경계변을 향하고 그 변에서 ~12000px 이내인 강을 골라,
    //   그 가까운 끝에 다운스트림 연장 path를 append → 굽이치며 경계 접근 →
    //   경계에 닿으면 경계선을 따라 ~3000~5000px 나란히(straddle, 솔기 위) 흐르다 끝.
    //   → 그 강이 "경계에 걸치는 강"이 됨. 몸통은 기존 강이라 자연 연결.
    //   연장 path가 다른 강·능선과 교차(segInt)하면 그 강은 연장 건너뜀(audit 안전).
    //   width는 기존 끝 width를 이어 약간 테이퍼. 경계변별 1~2개.
    // ============================================================================
    {
      const extendLog = [];
      // 연장 후보 path가 (자기 자신·이미 연장된 강 제외) 다른 강 또는 능선과 교차하면 true.
      const extCrosses = (path, selfRiver) => {
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i].pos, b = path[i + 1].pos;
          for (const o of d[z].rivers) {
            if (o === selfRiver) continue;
            for (let j = 0; j < o.path.length - 1; j++)
              if (segIntPoint(a, b, o.path[j].pos, o.path[j + 1].pos)) return true;
          }
          for (const rg of d[z].ridges) {
            for (let j = 0; j < rg.path.length - 1; j++)
              if (segIntPoint(a, b, rg.path[j].pos, rg.path[j + 1].pos)) return true;
          }
        }
        return false;
      };
      const extended = new Set(newRivers); // 신규 경계강은 연장 대상 아님
      for (const { side, edgeLen, toXY, toLocal } of SIDES) {
        const rng = seededRand(hashStr('ext_' + z + '_' + side));
        const depthOf = (x, y) => side === 'N' ? y : (side === 'W' ? x : zoneWidth - x);
        // 후보: 이 경계변을 향하는 끝(=경계 가까운 끝)의 depth가 1500~12000px인 기존 강.
        const cands = [];
        for (const r of d[z].rivers) {
          if (extended.has(r)) continue;
          if (r.name === '경계강') continue;
          const s0 = r.path[0], e0 = r.path[r.path.length - 1];
          const ds = depthOf(s0.pos[0], s0.pos[1]), de = depthOf(e0.pos[0], e0.pos[1]);
          // 경계에 더 가까운 끝을 연장 대상(=하구 반대/발원 가까운 끝 가정).
          const useStart = ds <= de;
          const endPt = useStart ? s0 : e0;
          const dep = useStart ? ds : de;
          if (dep < 1500 || dep > 12000) continue;
          // 끝점이 실제로 이 경계변 쪽을 향하는지(along 범위 안) — 코너 회피.
          const [al] = toLocal(endPt.pos[0], endPt.pos[1]);
          if (al < 2000 || al > edgeLen - 2000) continue;
          // 연장 대상 끝은 자유단(발원 가까운 끝)이어야 함 — 다른 강에 닿은 합류 mouth면 제외.
          //   (mouth를 연장하면 그 강은 양끝이 같은 강에 닿는 고리가 될 수 있음 → A11)
          let endTouches = false;
          for (const o of d[z].rivers) {
            if (o === r) continue;
            const bb = distToPathPt(endPt.pos[0], endPt.pos[1], o);
            if (bb.d < bb.w / 2 + (endPt.width || 200) / 2 + 150) { endTouches = true; break; }
          }
          if (endTouches) continue;
          cands.push({ r, useStart, endPt, dep, along: al });
        }
        cands.sort((a, b) => a.dep - b.dep); // 경계에 가까운 강 우선
        const want = (side === 'N') ? 1 : (1 + (rng() < 0.6 ? 1 : 0)); // 경계변별 1~2개
        let done = 0;
        for (const c of cands) {
          if (done >= want) break;
          const { r, useStart, endPt, along } = c;
          const baseW = endPt.width || 200;
          // --- 연장 경로 생성 (local 좌표: along, depth) ---
          // Phase 1: 현재 끝 depth → 0 으로 굽이치며 접근.
          // Phase 2: depth≈0(솔기 위)에서 along 따라 straddle 3000~5000px.
          const [a0, d0] = toLocal(endPt.pos[0], endPt.pos[1]);
          const approachLen = d0; // depth 만큼 안쪽으로 들어가며 경계 접근
          const straddleLen = 3000 + rng() * 2000;       // 경계 평행 3000~5000px
          const strDir = (along <= edgeLen / 2) ? 1 : -1; // 경계 더 긴 쪽으로 평행
          const ext = [];
          const n1 = Math.max(4, Math.round(approachLen / 900));
          const amp1 = 250 + rng() * 350, ph1 = rng() * 6.28, waves1 = 0.7 + rng() * 0.8;
          // 접근 구간: along 도 살짝 이동(자연 굽이), depth 0 으로.
          const aDrift = (rng() - 0.5) * 2 * 2200;
          for (let s = 1; s <= n1; s++) {
            const u = s / n1;                              // 0=현재끝, 1=경계 도달
            const aPos = a0 + aDrift * u + amp1 * Math.sin(u * Math.PI * waves1 + ph1) * Math.sin(u * Math.PI) * (strDir);
            const dPos = clampDepth(d0 * (1 - u));
            const [x, y] = toXY(aPos, dPos);
            ext.push({ pos: [x, y], width: baseW * (1 - 0.15 * u) }); // 살짝 테이퍼
          }
          const aHit = a0 + aDrift;                        // 경계 도달 along
          // straddle 구간: depth 0 근처(±120 살짝 굽이), along 따라.
          const n2 = Math.max(4, Math.round(straddleLen / 850));
          const amp2 = 90 + rng() * 80, ph2 = rng() * 6.28, waves2 = 0.6 + rng() * 0.7;
          for (let s = 1; s <= n2; s++) {
            const v = s / n2;
            let aPos = aHit + strDir * straddleLen * v;
            aPos = Math.max(300, Math.min(edgeLen - 300, aPos));
            const dPos = clampDepth(amp2 * Math.sin(v * Math.PI * waves2 + ph2) * Math.sin(v * Math.PI));
            const [x, y] = toXY(aPos, dPos);
            ext.push({ pos: [x, y], width: baseW * 0.82 });
          }
          const extSm = roundPath(chaikinPath(ext, 2));
          // --- 연결: 기존 끝점 → 연장 첫 점이 자연스럽게 이어지도록 끝점 포함 path로 교차 검사 ---
          const checkPath = [{ pos: [...endPt.pos], width: baseW }, ...extSm];
          if (extCrosses(checkPath, r)) continue;          // 다른 강·능선 교차 → 건너뜀(audit 안전)
          // A11 회피: 연장 끝(새 자유단)이 이 강의 반대 끝(기존 mouth)이 닿은 강과 같은 강에
          //   band-touch 하면 고리/섬 → 건너뜀. (계수천처럼 경계 평행 강에 straddle이 되돌아오는 경우)
          const newEndPt = extSm[extSm.length - 1];
          let loopBack = false;
          for (const o of d[z].rivers) {
            if (o === r) continue;
            // 연장 path(끝점 포함)가 다른 강 밴드에 닿는지 — 닿으면 그 강에 합류한 셈.
            for (const pp of [...extSm.slice(-4), newEndPt]) {
              const bb = distToPathPt(pp.pos[0], pp.pos[1], o);
              if (bb.d < bb.w / 2 + (pp.width || 200) / 2 + 150) { loopBack = true; break; }
            }
            if (loopBack) break;
          }
          if (loopBack) continue;                          // 경계 평행 강에 되돌아 합류 → 고리 방지
          // --- append: 같은 강 객체의 path 배열에 이어붙임 ---
          if (useStart) r.path = [...extSm.slice().reverse(), ...r.path];
          else r.path = [...r.path, ...extSm];
          deloop(r.path);
          extended.add(r);
          const sideKr = side === 'N' ? '북' : (side === 'W' ? '서' : '동');
          extendLog.push((r.name || '강') + ' → ' + sideKr + '쪽 경계');
          done++;
        }
      }
      if (extendLog.length) console.log('  [' + z + '] 기존 강 경계 연장: ' + extendLog.join(' | '));
    }

    // ---- 숲(경계숲) v6 — 개수 대폭 감축 + 겹침 제거 + 크기 축소 ----
    //   (1) 생성 계수 length/22000*2.5 → length/44000*2.5 (38→~18~20개로 감축, 목표 16~20).
    //   (2) 배치 시 이미 놓인 숲(경계숲+기존 숲)과 중심거리 검사:
    //       dist < (rxA+rxB)*0.65 이면 겹침 → 위치 재시도(최대 ~12회), 끝내 안 되면 건너뜀.
    //   (3) 크기 rx/ry에 ×0.85 (덜 비대). 그라디언트 테이퍼(sizeT/densityMult)는 유지.
    const minOff = 400, bandSpan = 9000;
    const FOREST_SIZE_MULT = 0.85;
    let skippedF = 0;
    // 겹침 검사: 후보 타원이 (경계숲+기존 숲) 중 어느 하나와 중심거리 < (rx합)*0.65 이면 true.
    const forestOverlaps = (cx, cy, rx) => {
      for (const f of d[z].forests) {
        const dx = cx - f.center[0], dy = cy - f.center[1];
        const dist = Math.hypot(dx, dy);
        if (dist < (rx + f.rx) * 0.65) return true;
      }
      return false;
    };
    for (const { side, edgeLen, toXY } of SIDES) {
      const rng = seededRand(hashStr('forest_' + z + '_' + side));
      const nF = Math.ceil(edgeLen / 44000 * 2.5);
      for (let k = 0; k < nF; k++) {
        let placedF = false;
        for (let attempt = 0; attempt < 12 && !placedF; attempt++) {
          const along = rng() * edgeLen;
          const depth = minOff + Math.pow(rng(), 1.8) * bandSpan;
          const t = (depth - minOff) / bandSpan;
          const [cx, cy] = toXY(along, depth);
          const sizeT = (1 - 0.6 * t) * FOREST_SIZE_MULT;
          const rx = Math.round((2000 + rng() * 2800) * sizeT);
          const ry = Math.round((2000 + rng() * 2800) * sizeT);
          if (forestOverlaps(Math.round(cx), Math.round(cy), rx)) continue; // 겹침 → 위치 재시도
          d[z].forests.push({
            name: '경계숲', center: [Math.round(cx), Math.round(cy)],
            rx, ry,
            densityMult: +(1.3 + 1.5 * (1 - t)).toFixed(2),
          });
          addF++;
          placedF = true;
        }
        if (!placedF) skippedF++; // 12회 안에 겹침 없는 자리 못 찾음 → 건너뜀
      }
    }
    if (skippedF) console.log('  [' + z + '] 경계숲 겹침으로 건너뜀: ' + skippedF + '개');

    // ---- 협곡(pass) 보강: 강 토막 × (모든 능선) 교차 + 능선 토막 밴드 그레이즈 → A1/A10 0 ----
    let addPass = 0;
    const addValley = (Xp, rad) => {
      if (d[z].passes.some(q => Math.hypot(q.pos[0] - Xp[0], q.pos[1] - Xp[1]) < q.radius)) return;
      d[z].passes.push({ name: '계곡', pos: Xp, radius: rad, auto: true }); addPass++;
    };
    // 모든 강 × 모든 능선 중심선 교차(신규 토막 포함)
    for (const rv of d[z].rivers) {
      const rw = maxWf(rv);
      for (const rg of d[z].ridges) {
        for (let i = 0; i < rv.path.length - 1; i++) for (let j = 0; j < rg.path.length - 1; j++) {
          const X = segIntPoint(rv.path[i].pos, rv.path[i + 1].pos, rg.path[j].pos, rg.path[j + 1].pos);
          if (!X) continue;
          const rgw = rg.path[j].width || 1400;
          addValley([Math.round(X.x), Math.round(X.y)], Math.round(Math.max(rw / 2, 350) + rgw / 2 + 250));
        }
      }
    }
    // 능선 토막 밴드에 강이 닿는 모든 그레이즈 지점(중심선 교차 외)도 협곡 — A1 0.
    for (const rg of newRanges) {
      for (let j = 0; j < rg.path.length - 1; j++) {
        const a = rg.path[j], b = rg.path[j + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.pos[0]-a.pos[0], b.pos[1]-a.pos[1]) / 250));
        for (let s2 = 0; s2 <= steps; s2++) {
          const tt = s2 / steps;
          const x = a.pos[0] + (b.pos[0]-a.pos[0]) * tt, y = a.pos[1] + (b.pos[1]-a.pos[1]) * tt;
          const w = a.width + (b.width - a.width) * tt;
          for (const rv of d[z].rivers) {
            const h = maxIntrusion(x, y, w, rv, 0);
            if (!h) continue;
            addValley([Math.round(x), Math.round(y)], Math.round(w / 2 + maxWf(rv) / 2 + 300));
          }
        }
      }
    }
    for (const rg of newRanges) deloop(rg.path);
    for (const rv of newRivers) deloop(rv.path);
    const rangeLens = newRanges.map(r => segLen(r.path));
    const riverLens = newRivers.map(r => segLen(r.path));
    console.log('  [' + z + '] 경계 산 토막 ' + addR + '개 (길이 ' + rangeLens.join('/') + 'px), 경계 강 토막 ' + addRv + '개 (길이 ' + riverLens.join('/') + 'px), 숲 ' + addF + ', 보강협곡 ' + addPass);
    console.log('  [' + z + '] 연결: ' + connLog.join(' | '));
  }
  console.log('  [' + z + '] ridges ' + d[z].ridges.length + ', passes ' + d[z].passes.length + ' (계곡 ' + valleys.length + ')');
}
for (const z of Object.keys(d)) {
  for (const r of (d[z].rivers || [])) if (!r._mirroredFrom) deloop(r.path);
  for (const r of (d[z].ridges || [])) if (!r._mirroredFrom) deloop(r.path);
}

// === 자체검증: 2500px 윈도 최대 방향변화(누적 |Δθ|) — 칼각 검출 ===
//   경계산맥 각각 ≤35° 목표(백두대간 동일 지표를 비교 기준으로 출력).
{
  const WIN = 2500, STEP = 120;
  const resample = (path) => {
    const out = [], pts = path.map(p => p.pos);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0]-a[0], b[1]-a[1]); if (L === 0) continue;
      const n = Math.max(1, Math.ceil(L / STEP));
      for (let s = 0; s < n; s++) { const t = s / n; out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]); }
    }
    out.push(pts[pts.length - 1]); return out;
  };
  const winMetric = (path) => {
    const r = resample(path);
    if (r.length < 3) return { maxTurn: 0, len: 0, at: null };
    const head = [];
    for (let i = 0; i < r.length - 1; i++) head.push(Math.atan2(r[i+1][1]-r[i][1], r[i+1][0]-r[i][0]));
    const winSegs = Math.max(1, Math.round(WIN / STEP));
    let maxTurn = 0, at = null;
    for (let i = 0; i + winSegs < head.length; i++) {
      let acc = 0;
      for (let j = i; j < i + winSegs; j++) {
        let dh = head[j+1] - head[j];
        while (dh > Math.PI) dh -= 2*Math.PI; while (dh < -Math.PI) dh += 2*Math.PI;
        acc += Math.abs(dh);
      }
      if (acc > maxTurn) { maxTurn = acc; at = r[i]; }
    }
    let len = 0; for (let i = 0; i < path.length - 1; i++) len += Math.hypot(path[i].pos[0]-path[i+1].pos[0], path[i].pos[1]-path[i+1].pos[1]);
    return { maxTurn: maxTurn * 180 / Math.PI, len: Math.round(len), at };
  };
  const hb = d.hanbando;
  if (hb && hb.ridges) {
    const bvals = [], wmins = [], wmaxs = [];
    console.log('  [검증] 경계산맥 2500px 윈도 최대 방향변화 (목표 ≤35°):');
    for (const rg of hb.ridges) {
      if (rg.name !== '경계산맥' || rg._mirroredFrom) continue;
      const m = winMetric(rg.path);
      bvals.push(m.maxTurn);
      const ws = rg.path.map(p => p.width); wmins.push(Math.min(...ws)); wmaxs.push(Math.max(...ws));
      const flag = m.maxTurn > 35 ? ' ⚠초과' : '';
      console.log('    경계산맥 len=' + m.len + ' maxWinTurn=' + m.maxTurn.toFixed(1) + '°' + flag + ' (width ' + Math.min(...ws) + '~' + Math.max(...ws) + ')');
    }
    if (bvals.length) {
      const over = bvals.filter(v => v > 35).length;
      console.log('    -> 경계산맥 max=' + Math.max(...bvals).toFixed(1) + '° mean=' + (bvals.reduce((a,b)=>a+b,0)/bvals.length).toFixed(1) + '° / 35° 초과 ' + over + '개 / width 전체 ' + Math.min(...wmins) + '~' + Math.max(...wmaxs));
    }
    const bd = hb.ridges.find(r => r.name === '백두대간' && !r._mirroredFrom);
    if (bd) { const m = winMetric(bd.path); console.log('    [기준] 백두대간 len=' + m.len + ' maxWinTurn=' + m.maxTurn.toFixed(1) + '°'); }
  }
}

mirrorAll(d);
fs.writeFileSync(OUT_JSON_V3, JSON.stringify(d), 'utf8');
console.log('  저장:', OUT_JSON_V3);
fs.writeFileSync(GAME_JSON, JSON.stringify(d), 'utf8');
console.log('  게임 파일:', GAME_JSON);
fs.writeFileSync(OUT_SVG_V3, renderSvg(d), 'utf8');
console.log('  SVG:', OUT_SVG_V3);
