#!/usr/bin/env node
// === scripts/design-region.js — 멀티존 지형 설계 SVG (설계 전용) ===
//
// 목적: hanbando + 인접 존(jungwon_n 서, nippon 동, bering 북, east_sea_s 남바다)을
//   월드 좌표로 한 장의 SVG에 배치. 인접 존에 러프한 지형(강/산맥/숲)을 새로 디자인하되
//   hanbando 경계에 닿는 강·산맥과 cross-boundary로 자연스럽게 이어지게 한다.
//
// ★ 절대 server/hanbando-terrain.json 을 수정하지 않는다. OPEN_BORDERS 빌드도 안 한다.
//   이 스크립트는 오직 설계 SVG 한 장(/Users/simjaemin1/Mini/region_design.svg)만 생성한다.
//
// 입력: ../../hanbando_terrain_v2.json  (hanbando의 기존 설계 지형; _mirroredFrom 제외)
// 출력: ../../region_design.svg
//
// 사용: node scripts/design-region.js

'use strict';
const fs = require('fs');
const path = require('path');

const IN_JSON = path.join(__dirname, '..', '..', 'hanbando_terrain_v2.json');
const OUT_SVG = path.join(__dirname, '..', '..', 'region_design.svg');

// === 존 배치 (build-terrain-v3.js의 ZONES와 동일; sibara 제외) ===
const ZONES = {
  hanbando:  { off: [409984, 49984], size: [70016, 130016] },
  bering:    { off: [409984, 0],     size: [160000, 49984] }, // 북
  jungwon_n: { off: [309984, 49984], size: [100000, 130016] }, // 서
  nippon:    { off: [480000, 49984], size: [49984, 130016] },  // 동
  sibara:    { off: [249984, 0],     size: [160000, 49984] },  // 북서 (베링 서쪽)
  jungwon_s: { off: [309984, 180000], size: [100000, 60000] }, // 남서 (중원북 아래)
};
// east_sea_s: hanbando 남쪽 바다 (별도 존 좌표 없음 — 렌더용 사각형으로 표현)
const SEA_S = { off: [409984, 180000], size: [70016, 25000] }; // hanbando 남단 아래

// === 기하/난수 ===
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seededRand(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
// Chaikin 스무딩 (굽이 모서리 둥글림)
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
function roundPath(pts) { return pts.map(p => ({ pos: [Math.round(p.pos[0]), Math.round(p.pos[1])], width: Math.round(p.width) })); }

// 굽이치는 폴리라인 생성기: from→to 직선을 따라가며 진행방향 수직으로 사인 굽이 + 폭 변주.
//   from/to = [x,y] (해당 존 local 좌표), wStart/wEnd = 폭, amp = 굽이 진폭, seed = 시드.
//   tStart는 끝점(from쪽)을 hanbando feature 끝과 매끄럽게 잇기 위한 폭/위치 고정.
function makeFlow(from, to, wStart, wEnd, amp, npts, seed, opts = {}) {
  const rnd = seededRand(seed);
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L; // 수직
  const lambda = L * (0.45 + rnd() * 0.5);
  const phase = rnd() * Math.PI * 2;
  const raw = [];
  for (let s = 0; s < npts; s++) {
    const t = s / (npts - 1);
    const cx = from[0] + dx * t, cy = from[1] + dy * t;
    // 굽이: 끝점(t=0, t=1)은 진폭 0 → from쪽이 hanbando feature와 매끄럽게 이어짐
    const edge = Math.min(t, 1 - t) * 2; // 0(끝)~1(중앙)
    const off = amp * Math.sin(t * Math.PI * 2 / (lambda / L) + phase) * Math.min(1, edge * 1.4);
    const w = wStart + (wEnd - wStart) * t;
    raw.push({ pos: [cx + nx * off, cy + ny * off], width: w });
  }
  return roundPath(chaikin(raw, opts.smooth != null ? opts.smooth : 2));
}
// 지류: 본류 path의 한 점에서 분기해 발원지로 뻗는 작은 흐름.
function makeTributary(branchPt, to, wStart, wEnd, amp, npts, seed) {
  return makeFlow(branchPt, to, wStart, wEnd, amp, npts, seed);
}

// =====================================================================
// 1) hanbando 기존 설계 지형 읽기 (_mirroredFrom 제외)
// =====================================================================
const data = JSON.parse(fs.readFileSync(IN_JSON, 'utf8'));
const hb = data.hanbando;
const HB = ZONES.hanbando;
const [ZW, ZH] = HB.size; // [70016, 130016]
const real = (arr) => (arr || []).filter(f => !f._mirroredFrom);
const hbRivers = real(hb.rivers);
const hbRidges = real(hb.ridges).filter(r => r.name !== '동해산맥' && r.name !== '백서산괴');
const hbForests = hb.forests || [];
const hbLakes = real(hb.lakes);

// 경계(서 x≈0, 동 x≈ZW, 북 y≈0)에 닿거나 가까운(≤4000) 강·산맥 끝점/방향 추출.
const TOL = 4000;
function boundaryEnds(features, isRidge) {
  const out = [];
  for (const f of features) {
    const p = f.path;
    const maxW = Math.max(...p.map(q => q.width || 200));
    for (const [tag, i, ni] of [['start', 0, 1], ['end', p.length - 1, p.length - 2]]) {
      const pt = p[i], nb = p[ni] || pt;
      const [x, y] = pt.pos;
      let side = null;
      if (x <= TOL) side = 'W'; else if (x >= ZW - TOL) side = 'E'; else if (y <= TOL) side = 'N';
      if (!side) continue;
      // 바깥(경계 너머)으로 향하는 방향: (끝점 - 이웃점) 정규화
      let dx = x - nb.pos[0], dy = y - nb.pos[1];
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      out.push({ name: f.name, tag, x, y, side, dx, dy, w: pt.width || 200, maxW, isRidge: !!isRidge });
    }
  }
  return out;
}
// 산맥은 path 양끝뿐 아니라 가장 서쪽/동쪽 점도 후보(서편 능선들이 W변으로 더 가까이 감)
function ridgeSideExtents(features) {
  const out = [];
  for (const f of features) {
    const p = f.path;
    let wmost = p[0], emost = p[0];
    for (const q of p) { if (q.pos[0] < wmost.pos[0]) wmost = q; if (q.pos[0] > emost.pos[0]) emost = q; }
    out.push({ name: f.name, wmost, emost });
  }
  return out;
}
const riverEnds = boundaryEnds(hbRivers, false);
const ridgeEnds = boundaryEnds(hbRidges, true);
const ridgeExt = ridgeSideExtents(hbRidges);

// =====================================================================
// 2) 인접 존 지형 디자인 — hanbando 경계 feature와 연결
//    좌표는 각 존의 local 좌표(0..size). cross-boundary 연결은 월드 좌표 기준으로
//    hanbando 끝점을 해당 존 local로 변환해 시작점을 맞춘다.
// =====================================================================
// hanbando local → world
const hbToWorld = (x, y) => [HB.off[0] + x, HB.off[1] + y];
// world → 존 local
const worldToLocal = (zid, wx, wy) => [wx - ZONES[zid].off[0], wy - ZONES[zid].off[1]];
// hanbando local → 존 local
const hbToZone = (zid, x, y) => { const [wx, wy] = hbToWorld(x, y); return worldToLocal(zid, wx, wy); };

const design = { jungwon_n: { rivers: [], ridges: [], forests: [] }, nippon: { rivers: [], ridges: [], forests: [] }, bering: { rivers: [], ridges: [], forests: [] }, sibara: { rivers: [], ridges: [], forests: [] }, jungwon_s: { rivers: [], ridges: [], forests: [] } };

// ---- jungwon_n (서). hanbando W변(x≈0)에 닿는 feature와 연결 ----
{
  const Z = 'jungwon_n'; const [zw, zh] = ZONES[Z].size; // [100000, 130016]
  // hanbando W변에서 jungwon_n으로 들어오는 진입점(존 local). hanbando x=0 ↔ jungwon_n x=zw(=100000).
  // 1) 이화강: hanbando 서변을 따라 흐르는 큰 강(maxW≈1792). 서쪽으로 큰 강을 연장.
  const ihwa = riverEnds.find(e => e.name === '이화강' && e.tag === 'start'); // (0,0) 부근
  if (ihwa) {
    const ent = hbToZone(Z, ihwa.x, ihwa.y); // ≈ (100000, 0)
    // 서쪽 내륙으로 굽이쳐 흐르다 jungwon 서편 바다/저지로. 본류.
    const r = makeFlow(ent, [zw * 0.28, zh * 0.34], 1792, 900, 2600, 16, hashStr('jw_ihwa'));
    design[Z].rivers.push({ name: '중원대하', path: r, _connect: '이화강(W) 연장' });
    // 지류 2개 (트리)
    const b1 = r[Math.floor(r.length * 0.45)];
    design[Z].rivers.push({ name: '중원지류1', path: makeTributary(b1.pos, [zw * 0.42, zh * 0.62], 380, 130, 1100, 9, hashStr('jw_t1')), _connect: '중원대하 지류' });
    const b2 = r[Math.floor(r.length * 0.7)];
    design[Z].rivers.push({ name: '중원지류2', path: makeTributary(b2.pos, [zw * 0.20, zh * 0.12], 340, 130, 900, 8, hashStr('jw_t2')), _connect: '중원대하 지류' });
  }
  // 2) 봉수천(W변, 작은 강 end (2016,57312)) → jungwon으로 잇는 작은 강
  const bongsu = riverEnds.find(e => e.name === '봉수천');
  if (bongsu) {
    const ent = hbToZone(Z, bongsu.x, bongsu.y);
    design[Z].rivers.push({ name: '봉계천', path: makeFlow(ent, [zw * 0.5, zh * 0.5], 220, 110, 1400, 10, hashStr('jw_bongsu')), _connect: '봉수천(W) 연장' });
  }
  // 3) 서편 능선들(묘향·멸악·차령·노령의 서쪽 끝)이 W변 근처에서 끝남 → jungwon으로 이어지는 산줄기.
  //    hanbando 서편 능선 wmost를 jungwon local로 변환해 그 지점부터 서쪽으로 굽이치는 능선.
  const spineSeeds = [
    { name: '멸악', ridge: '멸악산맥', to: [zw * 0.45, zh * 0.30], w: 1900 },
    { name: '차령', ridge: '차령산맥', to: [zw * 0.40, zh * 0.66], w: 1700 },
    { name: '노령', ridge: '노령산맥', to: [zw * 0.30, zh * 0.85], w: 1500 },
  ];
  let ridgeIdx = 0;
  for (const s of spineSeeds) {
    const ex = ridgeExt.find(r => r.name === s.ridge);
    if (!ex) continue;
    const ent = hbToZone(Z, ex.wmost.pos[0], ex.wmost.pos[1]); // jungwon 동변 근처
    const rg = makeFlow(ent, s.to, Math.max(900, ex.wmost.width || 800), s.w, 2400, 12, hashStr('jw_rg_' + s.name));
    design[Z].ridges.push({ name: '중원산맥' + (++ridgeIdx), path: rg, _connect: s.ridge + ' 서단 연장' });
  }
  // 숲 몇 개 (강·산 사이 저지)
  for (const [nm, cx, cy, rx, ry, dm] of [
    ['중원수해', zw * 0.55, zh * 0.45, 9000, 7000, 1.8],
    ['서원숲', zw * 0.35, zh * 0.72, 7000, 6000, 1.5],
    ['청림숲', zw * 0.30, zh * 0.20, 6500, 5500, 1.4],
  ]) design[Z].forests.push({ name: nm, center: [Math.round(cx), Math.round(cy)], rx, ry, densityMult: dm });
}

// ---- nippon (동). hanbando E변(x≈ZW)에 닿는 feature와 연결 ----
{
  const Z = 'nippon'; const [zw, zh] = ZONES[Z].size; // [49984, 130016]
  // hanbando E변(x≈70016) ↔ nippon x≈0.
  // 1) 대마강 end (70544,0 w448) → nippon으로 잇는 강
  const daema = riverEnds.find(e => e.name === '대마강' && e.tag === 'end');
  if (daema) {
    const ent = hbToZone(Z, daema.x, daema.y); // ≈ (560, 0)
    design[Z].rivers.push({ name: '동영천', path: makeFlow(ent, [zw * 0.55, zh * 0.30], 448, 220, 1500, 12, hashStr('np_daema')), _connect: '대마강(E) 연장' });
  }
  // 2) 계수천 end (69792,87040 w448) → nippon 큰 강
  const gyesu = riverEnds.find(e => e.name === '계수천' && e.tag === 'end');
  if (gyesu) {
    const ent = hbToZone(Z, gyesu.x, gyesu.y);
    const r = makeFlow(ent, [zw * 0.62, zh * 0.66], 448, 240, 1700, 14, hashStr('np_gyesu'));
    design[Z].rivers.push({ name: '닛폰대천', path: r, _connect: '계수천(E) 연장' });
    const b = r[Math.floor(r.length * 0.5)];
    design[Z].rivers.push({ name: '닛폰지류', path: makeTributary(b.pos, [zw * 0.45, zh * 0.9], 300, 120, 1000, 9, hashStr('np_t1')), _connect: '닛폰대천 지류' });
  }
  // 3) 죽계천 end (67771,89594) → 작은 강
  const jukgye = riverEnds.find(e => e.name === '죽계천');
  if (jukgye) {
    const ent = hbToZone(Z, jukgye.x, jukgye.y);
    design[Z].rivers.push({ name: '죽계연천', path: makeFlow(ent, [zw * 0.5, zh * 0.78], 200, 110, 1100, 9, hashStr('np_jukgye')), _connect: '죽계천(E) 연장' });
  }
  // 4) 함경산맥 동단 (E변 (67200,4200), 바깥 dx+) → nippon으로 이어지는 산줄기
  const hamgyeong = ridgeEnds.find(e => e.name === '함경산맥');
  if (hamgyeong) {
    const ent = hbToZone(Z, hamgyeong.x, hamgyeong.y);
    design[Z].ridges.push({ name: '닛폰북령', path: makeFlow(ent, [zw * 0.6, zh * 0.18], 1400, 2200, 2200, 11, hashStr('np_hamgyeong')), _connect: '함경산맥 동단 연장' });
  }
  // nippon 척량 산맥 1개 (남북 등줄기)
  design[Z].ridges.push({ name: '닛폰척량', path: makeFlow([zw * 0.5, zh * 0.25], [zw * 0.42, zh * 0.92], 1800, 1400, 3000, 14, hashStr('np_spine')) });
  for (const [nm, cx, cy, rx, ry, dm] of [
    ['닛폰수해', zw * 0.55, zh * 0.5, 6000, 9000, 1.7],
    ['동림숲', zw * 0.35, zh * 0.8, 5500, 5000, 1.4],
  ]) design[Z].forests.push({ name: nm, center: [Math.round(cx), Math.round(cy)], rx, ry, densityMult: dm });
}

// ---- bering (북). hanbando N변(y≈0)에 닿는 feature와 연결 ----
{
  const Z = 'bering'; const [zw, zh] = ZONES[Z].size; // [160000, 49984]
  // hanbando N변(y≈0, off [409984,49984]) ↔ bering(off [409984,0]) 하단(y≈zh=49984).
  //   hanbando local x → bering local x (off_x 동일). hanbando y=0 ↔ bering y=zh.
  // 1) 백두대간 start (54400,1500 w1187, 바깥 dy<0 = 북향) → bering으로 이어지는 산줄기 (대륙 척량)
  const baekdu = ridgeEnds.find(e => e.name === '백두대간');
  if (baekdu) {
    const ent = hbToZone(Z, baekdu.x, baekdu.y); // ≈ (54400, 49484)
    const rg = makeFlow(ent, [zw * 0.62, zh * 0.18], 1500, 2600, 4000, 14, hashStr('bg_baekdu'));
    design[Z].ridges.push({ name: '베링산령', path: rg, _connect: '백두대간 북단 연장' });
  }
  // 2) 얄리강 start (54400,0 w320, 북향) → 천지(54400,0 r1120) 발원 → bering 북쪽 큰 강
  const yali = riverEnds.find(e => e.name === '얄리강' && e.tag === 'start');
  if (yali) {
    const ent = hbToZone(Z, yali.x, yali.y);
    const r = makeFlow(ent, [zw * 0.5, zh * 0.22], 320, 600, 3000, 14, hashStr('bg_yali'));
    design[Z].rivers.push({ name: '베링대하', path: r, _connect: '얄리강(N)·천지 연장' });
    const b = r[Math.floor(r.length * 0.55)];
    design[Z].rivers.push({ name: '베링지류', path: makeTributary(b.pos, [zw * 0.7, zh * 0.7], 360, 130, 1400, 10, hashStr('bg_t1')), _connect: '베링대하 지류' });
  }
  // 3) 청계천(N변 (13696,0)) → bering 서쪽 강
  const cheonggye = riverEnds.find(e => e.name === '청계천');
  if (cheonggye) {
    const ent = hbToZone(Z, cheonggye.x, cheonggye.y);
    design[Z].rivers.push({ name: '청류대천', path: makeFlow(ent, [zw * 0.18, zh * 0.4], 256, 140, 2000, 12, hashStr('bg_cheonggye')), _connect: '청계천(N) 연장' });
  }
  // 4) 송림천/백곡천 (N변) → 합쳐 1개 강
  const songrim = riverEnds.find(e => e.name === '송림천');
  if (songrim) {
    const ent = hbToZone(Z, songrim.x, songrim.y);
    design[Z].rivers.push({ name: '송계천', path: makeFlow(ent, [zw * 0.32, zh * 0.55], 200, 120, 1600, 10, hashStr('bg_songrim')), _connect: '송림천(N) 연장' });
  }
  // bering 동서 횡단 산맥 1개 (베링산령과 만나게)
  design[Z].ridges.push({ name: '베링횡령', path: makeFlow([zw * 0.2, zh * 0.5], [zw * 0.88, zh * 0.42], 1600, 2000, 3000, 16, hashStr('bg_cross')) });
  for (const [nm, cx, cy, rx, ry, dm] of [
    ['베링수해', zw * 0.45, zh * 0.6, 11000, 6000, 1.8],
    ['북림숲', zw * 0.75, zh * 0.7, 9000, 5500, 1.5],
    ['설원림', zw * 0.25, zh * 0.78, 8000, 5000, 1.3],
  ]) design[Z].forests.push({ name: nm, center: [Math.round(cx), Math.round(cy)], rx, ry, densityMult: dm });
}

// ---- sibara (북서). 베링 서쪽 / 중원북 위. 대륙 척량이 서쪽으로 이어짐 ----
{
  const Z = 'sibara'; const [zw, zh] = ZONES[Z].size; // [160000, 49984]
  // 동변(x=zw)=베링 서변, 남변(y=zh)=중원북 북변과 접함.
  design[Z].ridges.push({ name: '시바라산령', path: makeFlow([zw * 0.96, zh * 0.42], [zw * 0.08, zh * 0.6], 2200, 1500, 5000, 18, hashStr('sb_spine')), _connect: '베링 횡령 서단 연장' });
  design[Z].ridges.push({ name: '시바라북령', path: makeFlow([zw * 0.55, zh * 0.2], [zw * 0.2, zh * 0.32], 1400, 900, 2600, 12, hashStr('sb_n')) });
  const sr = makeFlow([zw * 0.5, zh * 0.45], [zw * 0.46, zh * 0.99], 400, 900, 2200, 12, hashStr('sb_r'));
  design[Z].rivers.push({ name: '시바라대천', path: sr, _connect: '중원북으로 합류' });
  design[Z].rivers.push({ name: '시바라지류', path: makeTributary(sr[Math.floor(sr.length * 0.5)].pos, [zw * 0.72, zh * 0.7], 320, 130, 1200, 9, hashStr('sb_t')), _connect: '시바라대천 지류' });
  for (const [nm, cx, cy, rx, ry, dm] of [
    ['시바라수해', zw * 0.35, zh * 0.5, 12000, 6500, 1.6],
    ['북서림', zw * 0.7, zh * 0.55, 10000, 6000, 1.4],
  ]) design[Z].forests.push({ name: nm, center: [Math.round(cx), Math.round(cy)], rx, ry, densityMult: dm });
}

// ---- jungwon_s (남서). 중원북 아래. 중원 수계가 남으로 흘러 바다로 ----
{
  const Z = 'jungwon_s'; const [zw, zh] = ZONES[Z].size; // [100000, 60000]
  // 북변(y=0)=중원북 남변, 동변(x=zw)=동해남 서변과 접함.
  const jr = makeFlow([zw * 0.36, 0], [zw * 0.46, zh * 0.99], 900, 1300, 2000, 13, hashStr('js_main'));
  design[Z].rivers.push({ name: '중원남대하', path: jr, _connect: '중원대하 남단 연장' });
  design[Z].rivers.push({ name: '중원남지류', path: makeTributary(jr[Math.floor(jr.length * 0.5)].pos, [zw * 0.72, zh * 0.35], 320, 130, 1100, 9, hashStr('js_t')), _connect: '중원남대하 지류' });
  design[Z].ridges.push({ name: '중원남산맥', path: makeFlow([zw * 0.12, 0], [zw * 0.3, zh * 0.62], 1500, 1000, 2600, 12, hashStr('js_rg')), _connect: '중원산맥3(노령) 남단 연장' });
  for (const [nm, cx, cy, rx, ry, dm] of [
    ['중원남수해', zw * 0.55, zh * 0.4, 9000, 6000, 1.6],
    ['남원숲', zw * 0.25, zh * 0.7, 7000, 5000, 1.4],
  ]) design[Z].forests.push({ name: nm, center: [Math.round(cx), Math.round(cy)], rx, ry, densityMult: dm });
}

// =====================================================================
// 3) 멀티존 SVG 렌더 — 월드 좌표 그대로, 한 캔버스에 배치
// =====================================================================
// 전체 영역 world bbox: x[309984, 529984] y[0, 205000]
// 뷰 범위는 원래대로(화면 크기·스케일 유지). 시바라(서)·중원남(남)은 가장자리에서 일부만 보임.
const WX0 = 309984, WX1 = 529984;            // 폭 220000
const WY0 = 0, WY1 = 205000;
const WW = WX1 - WX0, WH = WY1 - WY0;
const SCALE = 1 / 220;                         // world → svg px (≈1000x932)
const PAD = 30;
const SVGW = Math.round(WW * SCALE) + PAD * 2;
const SVGH = Math.round(WH * SCALE) + PAD * 2;
const sx = wx => (PAD + (wx - WX0) * SCALE);
const sy = wy => (PAD + (wy - WY0) * SCALE);
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

// 가변폭 밴드 폴리곤 (world path → svg points)
function bandPolygon(zid, path) {
  const off = ZONES[zid].off;
  const L = [], R = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const hw = (p.width || 200) / 2;
    const wx = off[0] + p.pos[0], wy = off[1] + p.pos[1];
    L.push(`${sx(wx + nx * hw).toFixed(1)},${sy(wy + ny * hw).toFixed(1)}`);
    R.push(`${sx(wx - nx * hw).toFixed(1)},${sy(wy - ny * hw).toFixed(1)}`);
  }
  return L.concat(R.reverse()).join(' ');
}

const out = [];
out.push(`<svg viewBox="0 0 ${SVGW} ${SVGH}" xmlns="http://www.w3.org/2000/svg" style="background:#10141a;max-width:100%" font-family="sans-serif">`);

// --- 존 바닥 (불투명·인접; 존별로 뚜렷이 다른 흙색. 겹침 없음 → feature가 안 묻힘) ---
//   ZONES는 off+size로 월드를 빈틈없이 타일링하므로 불투명 사각형이 서로 안 겹친다.
//   feature(강/산/숲)는 이 위에 그려져 항상 보인다.
const zoneFill = {
  hanbando: '#41633a',  // 한반도 — 진한 녹
  jungwon_n: '#6b5326', // 중원북 — 황토
  nippon: '#2f4a63',    // 닛폰 — 청회
  bering: '#54545e',    // 베링 — 회보라
  sibara: '#4c4a42',    // 시바라 — 한대 토양(짙은 회갈)
  jungwon_s: '#7a5c2a', // 중원남 — 황토(중원북보다 밝게)
};
for (const [zid, cfg] of Object.entries(ZONES)) {
  const [w, h] = cfg.size, [ox, oy] = cfg.off;
  out.push(`<rect x="${sx(ox).toFixed(1)}" y="${sy(oy).toFixed(1)}" width="${(w * SCALE).toFixed(1)}" height="${(h * SCALE).toFixed(1)}" fill="${zoneFill[zid]}"/>`);
}
// east_sea_s (남쪽 바다) — 불투명
out.push(`<rect x="${sx(SEA_S.off[0]).toFixed(1)}" y="${sy(SEA_S.off[1]).toFixed(1)}" width="${(SEA_S.size[0] * SCALE).toFixed(1)}" height="${(SEA_S.size[1] * SCALE).toFixed(1)}" fill="#1f4a70"/>`);

// --- 존 경계선 (얇은 점선, 설계 확인용) ---
for (const [zid, cfg] of Object.entries(ZONES)) {
  const [w, h] = cfg.size, [ox, oy] = cfg.off;
  out.push(`<rect x="${sx(ox).toFixed(1)}" y="${sy(oy).toFixed(1)}" width="${(w * SCALE).toFixed(1)}" height="${(h * SCALE).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="0.7" stroke-dasharray="3,3" opacity="0.4"/>`);
}

// --- 그리기 헬퍼 (한 존의 forests→ridges→rivers→lakes 순) ---
function drawZone(zid, zd, labels) {
  const off = ZONES[zid].off;
  // forests
  for (const f of zd.forests || []) {
    const wx = off[0] + f.center[0], wy = off[1] + f.center[1];
    out.push(`<ellipse cx="${sx(wx).toFixed(1)}" cy="${sy(wy).toFixed(1)}" rx="${(f.rx * SCALE).toFixed(1)}" ry="${(f.ry * SCALE).toFixed(1)}" fill="rgba(56,150,52,${(0.45 + 0.12 * (f.densityMult || 1)).toFixed(2)})"/>`);
    if (labels) out.push(`<text x="${sx(wx).toFixed(1)}" y="${sy(wy).toFixed(1)}" text-anchor="middle" font-size="6" fill="#e6ffd8">${esc(f.name)}</text>`);
  }
  // ridges (갈색 밴드 + 옅은 능선 안쪽)
  for (const rg of zd.ridges || []) {
    out.push(`<polygon points="${bandPolygon(zid, rg.path)}" fill="#6e5436" stroke="#3a2c1c" stroke-width="0.4"/>`);
    const inner = rg.path.map(p => ({ pos: p.pos, width: (p.width || 200) * 0.42 }));
    out.push(`<polygon points="${bandPolygon(zid, inner)}" fill="#a98a64"/>`);
    if (labels) {
      const mid = rg.path[Math.floor(rg.path.length / 2)];
      const wx = off[0] + mid.pos[0], wy = off[1] + mid.pos[1];
      out.push(`<text x="${sx(wx).toFixed(1)}" y="${(sy(wy) - 4).toFixed(1)}" text-anchor="middle" font-size="7" fill="#fff" font-weight="bold">${esc(rg.name)}</text>`);
    }
  }
  // rivers (파랑 polyline, 폭 반영)
  for (const r of zd.rivers || []) {
    const p = r.path;
    for (let i = 0; i < p.length - 1; i++) {
      const wx1 = off[0] + p[i].pos[0], wy1 = off[1] + p[i].pos[1];
      const wx2 = off[0] + p[i + 1].pos[0], wy2 = off[1] + p[i + 1].pos[1];
      const w = ((p[i].width || 200) + (p[i + 1].width || 200)) / 2;
      out.push(`<line x1="${sx(wx1).toFixed(1)}" y1="${sy(wy1).toFixed(1)}" x2="${sx(wx2).toFixed(1)}" y2="${sy(wy2).toFixed(1)}" stroke="#4aa6e8" stroke-width="${Math.max(0.8, w * SCALE).toFixed(1)}" stroke-linecap="round"/>`);
    }
    if (labels && r.name) {
      const mp = p[Math.floor(p.length / 2)];
      const wx = off[0] + mp.pos[0], wy = off[1] + mp.pos[1];
      out.push(`<text x="${sx(wx).toFixed(1)}" y="${(sy(wy) + 2).toFixed(1)}" text-anchor="middle" font-size="5.5" fill="#d8ecff">${esc(r.name)}</text>`);
    }
  }
  // lakes (파랑 원)
  for (const lk of zd.lakes || []) {
    if (!lk.center) continue;
    const wx = off[0] + lk.center[0], wy = off[1] + lk.center[1];
    out.push(`<ellipse cx="${sx(wx).toFixed(1)}" cy="${sy(wy).toFixed(1)}" rx="${((lk.radius || 500) * SCALE).toFixed(1)}" ry="${((lk.radius || 500) * SCALE).toFixed(1)}" fill="#2e6fa8" stroke="#1a4870" stroke-width="0.5"/>`);
    if (labels && lk.name) out.push(`<text x="${sx(wx).toFixed(1)}" y="${(sy(wy) + 2).toFixed(1)}" text-anchor="middle" font-size="5" fill="#fff">${esc(lk.name)}</text>`);
  }
}

// 이웃 존 먼저(설계), 그 다음 hanbando 본체(기존)
for (const zid of ['jungwon_n', 'nippon', 'bering', 'sibara', 'jungwon_s']) drawZone(zid, design[zid], true);
drawZone('hanbando', { rivers: hbRivers, ridges: hbRidges, forests: hbForests, lakes: hbLakes }, true);

// --- 존 이름 라벨 ---
const zoneLabel = {
  hanbando: '한반도 hanbando', jungwon_n: '중원북 jungwon_n', nippon: '닛폰 nippon', bering: '베링 bering',
  sibara: '시바라 sibara', jungwon_s: '중원남 jungwon_s',
};
for (const [zid, cfg] of Object.entries(ZONES)) {
  const [w, h] = cfg.size, [ox, oy] = cfg.off;
  out.push(`<text x="${sx(ox + w / 2).toFixed(1)}" y="${(sy(oy) + 14).toFixed(1)}" text-anchor="middle" font-size="11" fill="#ffe08a" font-weight="bold">${esc(zoneLabel[zid])}</text>`);
}
out.push(`<text x="${sx(SEA_S.off[0] + SEA_S.size[0] / 2).toFixed(1)}" y="${(sy(SEA_S.off[1] + SEA_S.size[1] / 2)).toFixed(1)}" text-anchor="middle" font-size="11" fill="#9fd0ff" font-weight="bold">남쪽 바다 east_sea_s</text>`);

out.push('</svg>');
const svg = out.join('\n');
fs.writeFileSync(OUT_SVG, svg, 'utf8');

// === 요약 로그 ===
console.log('design-region.js — 설계 SVG 생성 완료 (server json 미변경)');
for (const zid of ['jungwon_n', 'nippon', 'bering', 'sibara', 'jungwon_s']) {
  const z = design[zid];
  console.log(`  [${zid}] 강 ${z.rivers.length}, 산맥 ${z.ridges.length}, 숲 ${z.forests.length}`);
  for (const r of z.rivers) if (r._connect) console.log(`      강 ${r.name} ← ${r._connect}`);
  for (const r of z.ridges) if (r._connect) console.log(`      산맥 ${r.name} ← ${r._connect}`);
}
console.log('  SVG:', OUT_SVG, `(${SVGW}x${SVGH})`);

// === editor-world.json — map-editor.html 전체 월드 편집용 (멀티존) ===
// 한반도(소스 제어점) + 이웃 설계(design)를 에디터 형식으로 한 파일에.
try {
  const ev = { multi: true, zones: {} };
  const rp = p => Array.isArray(p) ? ({ pos:[p[0],p[1]], width:p[2]||300 }) : ({ pos:p.pos, width:p.width||300 });
  // 한반도: 소스(terrain-data + src.json)
  const hbmod = require('./terrain-data-hanbando-v2');
  const srcAll = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'hanbando-terrain.src.json'), 'utf8'));
  ev.zones.hanbando = {
    zone:'hanbando', size: ZONES.hanbando.size,
    rivers: (((srcAll.hanbando||{}).rivers)||[]).filter(r=>!r._mirroredFrom).map(r=>({ name:r.name, path:r.path.map(p=>({pos:p.pos,width:p.width||300})) })),
    ridges: (hbmod.ridges||[]).map(r=>{ const o={ name:r.name, path:r.path.map(rp) }; if(r.pinStart)o.pinStart=true; if(r.noFit)o.noFit=true; if(r.noValley)o.noValley=true; return o; }),
    forests:(hbmod.forests||[]).map(f=>({ name:f.name, center:f.center, rx:f.rx, ry:f.ry, densityMult:f.densityMult })),
    lakes:  (hbmod.lakes||[]).map(l=>({ name:l.name, center:l.center, radius:l.radius })),
    passes: (hbmod.passes||[]).map(p=>({ name:p.name, pos:p.pos, radius:p.radius })),
  };
  // 이웃: design 스케치
  for (const zid of ['jungwon_n','nippon','bering','sibara','jungwon_s']) {
    const zd = design[zid]; if (!zd || !ZONES[zid]) continue;
    ev.zones[zid] = {
      zone: zid, size: ZONES[zid].size,
      rivers: (zd.rivers||[]).map(r=>({ name:r.name, path:r.path.map(rp) })),
      ridges: (zd.ridges||[]).map(r=>({ name:r.name, path:r.path.map(rp) })),
      forests:(zd.forests||[]).map(f=>({ name:f.name, center:f.center, rx:f.rx, ry:f.ry, densityMult:f.densityMult })),
      lakes:[], passes:[],
    };
  }
  const EVPATH = path.join(__dirname, '..', '..', 'editor-world-region.json'); // 참고용(소스+이웃). 정식 editor-world.json은 export-world-for-editor.js(빌드출력 기준)가 생성.
  fs.writeFileSync(EVPATH, JSON.stringify(ev, null, 2));
  const cnt = Object.keys(ev.zones).map(z=>z+'('+((ev.zones[z].rivers.length)+(ev.zones[z].ridges.length))+')').join(' ');
  console.log('  editor-world.json:', EVPATH, '— zones:', cnt);
} catch (e) { console.log('  editor-world.json 생성 실패:', e.message); }
