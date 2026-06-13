#!/usr/bin/env node
// === scripts/update-hanbando-terrain.js — 한반도 산맥·숲 데이터 + SVG 렌더 ===
// Phase 5-H: 산맥(ridges)·숲(forests)을 hanbando-terrain.json에 추가하고
// 전체 지형을 hanbando_full.svg로 렌더 (JSON = 소스, SVG = 시각 확인용).
//
// - ridges: 강과 같은 path+width 형식. 통행 불가 바위 셀이 됨 (게임 로직은 다음 단계).
// - passes: 통행 가능한 고개. 수동 지정 + 강 교차 지점 자동 생성(계곡).
// - forests: ellipse + densityMult + falloff. getForestMultiplier 확장은 다음 단계.
//
// 사용: node scripts/update-hanbando-terrain.js
//   → server/hanbando-terrain.json 갱신 (게임 적용본)
//   → ../hanbando_terrain.json 갱신 (디자인 사본, 있을 때만)
//   → ../hanbando_full.svg 렌더 (있던 위치, 없으면 생성)

'use strict';
const fs = require('fs');
const path = require('path');

const SERVER_JSON = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const DESIGN_JSON = path.join(__dirname, '..', '..', 'hanbando_terrain.json');
const DESIGN_SVG  = path.join(__dirname, '..', '..', 'hanbando_full.svg');

// 한반도 local 좌표 (0~70000 × 0~130000 디자인 기준)
// y: 북→남. 북 경계(y=0) = bering, 서(x=0) = jungwon_n, 동(x=70000) = nippon.

// === 산맥 정의 — 실제 지리 모티브 ===
const RIDGES = [
  {
    name: '백두대간', width: 2200,
    path: [
      [54400, 1500, 1600],   // 천지 남쪽 기슭에서 시작 [x, y, width]
      [56500, 8000, 2200],
      [57500, 16000, 2400],
      [55000, 25000, 2400],  // 낭림 분기점
      [53000, 35000, 2200],
      [54000, 45000, 2200],
      [52500, 55000, 2400],  // 태백 구간
      [53500, 65000, 2400],
      [52000, 75000, 2200],
      [50000, 84000, 2000],
      [44000, 92000, 1800],  // 소백으로 꺾임
      [37500, 100000, 1800],
      [31500, 108000, 1800],
      [27500, 114500, 1600], // 지리산
    ],
  },
  {
    name: '함경산맥', width: 1500,
    path: [
      [56800, 10000, 1500],
      [62000, 7000, 1400],
      [67200, 4200, 1200],
    ],
  },
  {
    name: '묘향산맥', width: 1300,
    path: [
      [24000, 20000, 1100],
      [31000, 23000, 1300],
      [38000, 26500, 1300],
      [45500, 29500, 1200], // 백두대간 서쪽 자락에 근접
    ],
  },
  {
    name: '멸악산맥', width: 1000,
    path: [
      [13000, 39000, 900],
      [22000, 42500, 1000],
      [31000, 45500, 1000],
    ],
  },
  {
    name: '차령산맥', width: 1000,
    path: [
      [16000, 70000, 900],
      [25500, 74500, 1000],
      [35000, 78500, 1000],
    ],
  },
  {
    name: '노령산맥', width: 950,
    path: [
      [12000, 92500, 850],
      [19500, 96500, 950],
      [27000, 100500, 950],
    ],
  },
];

// 수동 고개 — 역사적 고개 모티브. radius 안은 통행 가능.
const MANUAL_PASSES = [
  { name: '철령',     pos: [53600, 40000], radius: 1500 },
  { name: '대관령',   pos: [53000, 60000], radius: 1500 },
  { name: '죽령',     pos: [47500, 88000], radius: 1400 },
  { name: '문경새재', pos: [40500, 96500], radius: 1400 },
  { name: '추풍령',   pos: [34500, 104000], radius: 1400 },
  { name: '북계곡',   pos: [56600, 9000],  radius: 1300 }, // 백두대간-함경산맥 갈림 통로
];

// === 숲 정의 — ellipse + 중심 밀도(가장자리로 falloff) ===
const FORESTS = [
  { name: '개마수해',   center: [53000, 11000], rx: 11000, ry: 7000,  densityMult: 3.2 },
  { name: '낭림숲',     center: [50000, 30000], rx: 7000,  ry: 9000,  densityMult: 2.6 },
  { name: '태백수해',   center: [55500, 62000], rx: 6500,  ry: 16000, densityMult: 2.8 },
  { name: '소백숲',     center: [38000, 99000], rx: 8000,  ry: 6000,  densityMult: 2.6 },
  { name: '지리수해',   center: [28500, 112500], rx: 8500, ry: 6000,  densityMult: 3.2 },
  { name: '묘향숲',     center: [33000, 24500], rx: 9000,  ry: 4500,  densityMult: 2.2 },
  { name: '한양숲',     center: [27500, 58000], rx: 5000,  ry: 4000,  densityMult: 1.8 },
  { name: '서호잡목림', center: [14000, 78000], rx: 5500,  ry: 4000,  densityMult: 1.8 },
];

// === 강 교차 자동 고개 (계곡) ===
function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L));
  return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
}
function riverWidthAt(rivers, x, y, margin) {
  let best = null;
  for (const r of rivers) {
    const p = r.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const w1 = p[i].width || 200, w2 = p[i + 1].width || 200;
      const { d, t } = ptSegDist(x, y, x1, y1, x2, y2);
      const w = w1 + (w2 - w1) * t;
      if (d < w / 2 + margin) { if (!best || w > best) best = w; }
    }
  }
  return best;
}
function computeAutoPasses(rivers) {
  const passes = [];
  for (const ridge of RIDGES) {
    const p = ridge.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[i + 1];
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.ceil(segLen / 250));
      for (let s = 0; s <= steps; s++) {
        const x = x1 + (x2 - x1) * s / steps, y = y1 + (y2 - y1) * s / steps;
        const rw = riverWidthAt(rivers, x, y, 200);
        if (rw != null) {
          // 같은 자리에 이미 고개 있으면 skip
          const near = passes.find(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < 2500)
            || MANUAL_PASSES.find(q => Math.hypot(q.pos[0] - x, q.pos[1] - y) < 3000);
          if (!near) passes.push({ name: '계곡', pos: [Math.round(x), Math.round(y)], radius: Math.round(rw / 2 + 700), auto: true });
        }
      }
    }
  }
  return passes;
}

// === JSON 병합 ===
function mergeInto(jsonPath, ridges, passes, forests) {
  if (!fs.existsSync(jsonPath)) { console.log('  skip (없음):', jsonPath); return; }
  const d = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  d.hanbando.ridges = ridges;
  d.hanbando.passes = passes;
  d.hanbando.forests = forests;
  fs.writeFileSync(jsonPath, JSON.stringify(d), 'utf8');
  console.log('  갱신:', jsonPath, `(ridges ${ridges.length}, passes ${passes.length}, forests ${forests.length})`);
  return d;
}

// === SVG 렌더 ===
const ZW = 70000, ZH = 130000;          // 디자인 기준 크기
const SVG_W = 591.8083462132921, SVG_H = 1098.8216446336546;
const M = 54.09;                         // 이웃 zone 띠 두께 (svg px)
const SX = SVG_W / ZW, SY = SVG_H / ZH;
const sx = lx => M + lx * SX;
const sy = ly => M + ly * SY;

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

function renderSvg(d, passes) {
  const out = [];
  const W = 700, H = 1207;
  out.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#222;max-width:100%">`);
  // zone 띠 + 본체
  out.push(`<rect x="0" y="0" width="${W}" height="${M}" fill="#8a9a9a"/>`);
  out.push(`<rect x="0" y="${M}" width="${M}" height="${H - 2 * M}" fill="#bca56a"/>`);
  out.push(`<rect x="${(M + SVG_W).toFixed(1)}" y="${M}" width="${M}" height="${H - 2 * M}" fill="#7a8a5a"/>`);
  out.push(`<rect x="${M}" y="${(M + SVG_H).toFixed(1)}" width="${SVG_W.toFixed(1)}" height="${M}" fill="#2a5a8a"/>`);
  out.push(`<rect x="${M}" y="${M}" width="${SVG_W.toFixed(1)}" height="${SVG_H.toFixed(1)}" fill="#a8c168"/>`);
  for (const [t, x, y, rot] of [['bering', W / 2, M / 2 - 4, 0], ['jungwon_n', M / 2, H / 2, -90], ['nippon', W - M / 2, H / 2, 90], ['east_sea_s', W / 2, H - M / 2 + 4, 0]]) {
    const tr = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
    out.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#fff" font-weight="bold" font-family="sans-serif"${tr}>${t}</text>`);
  }

  // 숲 (강 아래 깔리게 먼저)
  for (const f of FORESTS) {
    const [cx, cy] = f.center;
    out.push(`<ellipse cx="${sx(cx).toFixed(1)}" cy="${sy(cy).toFixed(1)}" rx="${(f.rx * SX).toFixed(1)}" ry="${(f.ry * SY).toFixed(1)}" fill="rgba(34,90,30,${(0.16 + 0.09 * f.densityMult).toFixed(2)})"/>`);
    out.push(`<text x="${sx(cx).toFixed(1)}" y="${sy(cy).toFixed(1)}" text-anchor="middle" font-size="7" fill="#cfe8c0" font-weight="bold" font-family="sans-serif">${esc(f.name)} ×${f.densityMult}</text>`);
  }

  // 산맥 — 고개 radius 안 구간은 비워서 그림
  function inPass(x, y) {
    return passes.some(p => Math.hypot(p.pos[0] - x, p.pos[1] - y) < p.radius);
  }
  for (const ridge of RIDGES) {
    const p = ridge.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1, w1] = p[i], [x2, y2, w2] = p[i + 1];
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.ceil(segLen / 400));
      let run = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, w = w1 + (w2 - w1) * t;
        if (!inPass(x, y) && s < steps) {
          if (!run) run = [];
          run.push([x, y, w]);
        } else {
          if (s === steps && !inPass(x, y)) (run = run || []).push([x, y, w]);
          if (run && run.length > 1) {
            const avgW = run.reduce((a, q) => a + q[2], 0) / run.length;
            const pts = run.map(q => `${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`).join(' ');
            out.push(`<polyline points="${pts}" fill="none" stroke="#564c40" stroke-width="${(avgW * SX).toFixed(1)}" stroke-linecap="round"/>`);
            out.push(`<polyline points="${pts}" fill="none" stroke="#7d7060" stroke-width="${(avgW * SX * 0.45).toFixed(1)}" stroke-linecap="round"/>`);
          }
          run = null;
        }
      }
    }
    const mid = p[Math.floor(p.length / 2)];
    out.push(`<text x="${sx(mid[0]).toFixed(1)}" y="${(sy(mid[1]) - 5).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(ridge.name)}</text>`);
  }
  // 고개 마커
  for (const q of passes) {
    const isAuto = !!q.auto;
    out.push(`<circle cx="${sx(q.pos[0]).toFixed(1)}" cy="${sy(q.pos[1]).toFixed(1)}" r="${(q.radius * SX).toFixed(1)}" fill="none" stroke="${isAuto ? '#88c0ff' : '#ffd070'}" stroke-width="0.8" stroke-dasharray="2,1.5"/>`);
    if (!isAuto) out.push(`<text x="${sx(q.pos[0]).toFixed(1)}" y="${(sy(q.pos[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#ffd070" font-weight="bold" font-family="sans-serif">${esc(q.name)}</text>`);
  }

  // 강 (산맥 위에 — 계곡 표현)
  const hb = d.hanbando;
  for (const r of hb.rivers || []) {
    const p = r.path;
    for (let i = 0; i < p.length - 1; i++) {
      const [x1, y1] = p[i].pos, [x2, y2] = p[i + 1].pos;
      const w = ((p[i].width || 200) + (p[i + 1].width || 200)) / 2;
      out.push(`<line x1="${sx(x1).toFixed(1)}" y1="${sy(y1).toFixed(1)}" x2="${sx(x2).toFixed(1)}" y2="${sy(y2).toFixed(1)}" stroke="#2e6fa8" stroke-width="${Math.max(0.5, w * SX).toFixed(1)}" stroke-linecap="round"/>`);
    }
    if (r.name && !r._mirroredFrom) {
      const mp = p[Math.floor(p.length / 2)].pos;
      out.push(`<text x="${sx(mp[0]).toFixed(1)}" y="${(sy(mp[1]) + 2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(r.name)}</text>`);
    }
  }
  // 호수 (bering 천지 포함 — 이웃 zone 것은 offset 변환)
  const OFF = { hanbando: [409984, 49984], bering: [409984, 0], jungwon_n: [309984, 49984], nippon: [480000, 49984] };
  for (const [zid, zd] of Object.entries(d)) {
    for (const lk of zd.lakes || []) {
      if (!lk.center) continue;
      const ax = OFF[zid][0] + lk.center[0], ay = OFF[zid][1] + lk.center[1];
      const lx = ax - OFF.hanbando[0], ly = ay - OFF.hanbando[1];
      if (lx < -6000 || lx > ZW + 6000 || ly < -6000 || ly > ZH + 6000) continue;
      out.push(`<ellipse cx="${sx(lx).toFixed(1)}" cy="${sy(ly).toFixed(1)}" rx="${((lk.radius || 500) * SX).toFixed(1)}" ry="${((lk.radius || 500) * SY).toFixed(1)}" fill="#2e6fa8" stroke="#1a4870" stroke-width="0.5"/>`);
      if (lk.name) out.push(`<text x="${sx(lx).toFixed(1)}" y="${(sy(ly) + 2).toFixed(1)}" text-anchor="middle" font-size="6" fill="#fff" font-weight="bold" font-family="sans-serif">${esc(lk.name)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

// === main ===
const serverData = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf8'));
const autoPasses = computeAutoPasses(serverData.hanbando.rivers || []);
const passes = [...MANUAL_PASSES, ...autoPasses];
console.log(`고개: 수동 ${MANUAL_PASSES.length} + 강 교차 자동 ${autoPasses.length}`);

const ridgesJson = RIDGES.map(r => ({
  name: r.name,
  path: r.path.map(([x, y, w]) => ({ pos: [x, y], width: w })),
}));
console.log('JSON 병합:');
const merged = mergeInto(SERVER_JSON, ridgesJson, passes, FORESTS);
mergeInto(DESIGN_JSON, ridgesJson, passes, FORESTS);

const svg = renderSvg(merged, passes);
fs.writeFileSync(DESIGN_SVG, svg, 'utf8');
console.log('SVG 렌더:', DESIGN_SVG, `(${(svg.length / 1024).toFixed(1)}KB)`);
