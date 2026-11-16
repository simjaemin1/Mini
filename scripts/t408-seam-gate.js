#!/usr/bin/env node
// === scripts/t408-seam-gate.js — 경계 접합 게이트: 청크 산출 해시 전/후 (T408 ③) ======
//
// ★계측기다 — 러너 밖. 제품은 읽기만 한다.
//   `--save <file>` : 지금 코드로 한반도·닛폰·중원북 **전 청크** 산출 해시를 적는다(전).
//   `--diff <file>` : 지금 코드의 해시와 대조해 **바뀐 청크 목록**과 그 청크가 **존 경계에서 몇 청크**인지 낸다.
//   청크 해시 = `generateChunkResources` + `overflowInto` 의 id·종류·좌표·종·단계(T406 자와 같다).
//   ★술어 해시도 같이 — 경계에서 2,048px 안 셀 중심(32px 격자 1/4 표본)의 물·바위·숲배수 답.
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const terrain = require(path.join(ROOT, 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const chunk = require(path.join(ROOT, 'server', 'chunk'));
const cs = chunk.CHUNK_SIZE;
const ZIDS = process.env.T408_ZIDS ? process.env.T408_ZIDS.split(',') : ['hanbando', 'nippon', 'jungwon_n'];   // 규칙은 전 존이다 — 다른 존은 T408_ZIDS 로 잰다
const mode = process.argv[2], file = process.argv[3];
const snap = {};
for (const zid of ZIDS) {
  const Z = ZONES[zid], cx1 = Math.ceil(Z.zoneWidth / cs), cy1 = Math.ceil(Z.zoneHeight / cs);
  const per = {};
  for (let cy = 0; cy < cy1; cy++) for (let cx = 0; cx < cx1; cx++) {
    const h = crypto.createHash('sha1');
    for (const r of chunk.generateChunkResources(zid, Z.biome, cx, cy, cs, null, 0).concat(chunk.overflowInto(zid, Z.biome, cx, cy, cs, null, 0)))
      h.update(`${r.id}|${r.type}|${r.x}|${r.y}|${r.sp || ''}|${r.regrown || ''};`);
    per[cx + '_' + cy] = h.digest('hex').slice(0, 12);
  }
  // 경계 셀 술어(물·바위·숲>1.5) — 2,048px 띠 · 64px 간격
  const ph = crypto.createHash('sha1'); let pn = 0; const pcells = {};
  const W = Z.zoneWidth, H = Z.zoneHeight;
  for (let y = 16; y < H; y += 64) for (let x = 16; x < W; x += 64) {
    if (x > 2048 && x < W - 2048 && y > 2048 && y < H - 2048) continue;
    const b = (terrain.isWaterCellLocal(zid, x, y) ? 1 : 0) | (terrain.isRockCellLocal(zid, x, y) ? 2 : 0) | (terrain.getForestMultiplier(zid, x, y) > 1.5 ? 4 : 0);
    ph.update(String(b)); pn++; if (b) pcells[x + '_' + y] = b;
  }
  snap[zid] = { per, pred: ph.digest('hex').slice(0, 16), pn, pcells };
}
if (mode === '--save') { fs.writeFileSync(file, JSON.stringify(snap)); console.log('저장 → ' + file); process.exit(0); }
const before = JSON.parse(fs.readFileSync(file, 'utf8'));
// ★게이트는 "몇 청크 안"이 아니라 **바뀐 청크마다 까닭이 있나**다 — 이웃 피처는 제 모양만큼 들어온다
//   (숲 타원은 수 km). 까닭 둘: ⓐ 그 청크 상자와 겹치는 **이웃 피처**(참조의 모양 상자) ⓑ 존 끝 청크의 **남의 땅 개체 거르기**.
//   둘 다 아니면 **설명 안 되는 바뀜** — 그게 빨강이다.
const box = (f) => {
  if (f.path) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, mw = 0;
    for (const p of f.path) { const x = p.pos ? p.pos[0] : p[0], y = p.pos ? p.pos[1] : p[1], w = p.width != null ? p.width : (f.width || 200);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); mw = Math.max(mw, w); }
    return [x0 - mw / 2, y0 - mw / 2, x1 + mw / 2, y1 + mw / 2]; }
  if (f.pos) return [f.pos[0] - f.radius, f.pos[1] - f.radius, f.pos[0] + f.radius, f.pos[1] + f.radius];
  if (f.circles) { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of f.circles) { const R = c.radius * 1.3; b = [Math.min(b[0], c.center[0] - R), Math.min(b[1], c.center[1] - R), Math.max(b[2], c.center[0] + R), Math.max(b[3], c.center[1] + R)]; } return b; }
  if (f.rect) return f.rect;
  const R = Math.max(f.rx || f.a || f.radius || 0, f.ry || f.b || f.radius || 0) * (f.rx ? 1 : 1.3);
  return [f.center[0] - R, f.center[1] - R, f.center[0] + R, f.center[1] + R];
};
console.log('=== 경계 접합 게이트 — 전 청크 산출 해시 · 경계 셀 술어 (T408 ③) ===');
console.log('| 존 | 청크 | 바뀐 청크 | 경계에서 최대(청크) | **까닭 없는** 바뀐 청크 | 경계 셀 술어 표본 | 바뀐 셀(물·바위·숲) |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
const lists = {}; const flipsAll = {};
let bad = 0;
for (const zid of ZIDS) {
  const Z = ZONES[zid], cx1 = Math.ceil(Z.zoneWidth / cs) - 1, cy1 = Math.ceil(Z.zoneHeight / cs) - 1;
  const a = before[zid], b = snap[zid];
  const ch = []; let maxD = 0, far = 0;
  const seam = (terrain.ZONE_TERRAIN[zid] || {}).seam || {};
  const refs = [].concat(seam.water || [], seam.ridges || [], seam.valleys || [], seam.passes || [], seam.forests || []);
  const why = {};
  for (const k of Object.keys(b.per)) if (a.per[k] !== b.per[k]) {
    const [cx, cy] = k.split('_').map(Number);
    const d = Math.min(cx, cy, cx1 - cx, cy1 - cy);
    const r0 = [cx * cs, cy * cs, (cx + 1) * cs, (cy + 1) * cs];
    const hitRefs = refs.filter((s) => { const q = box(s.f); return !(q[2] - s.dx < r0[0] || q[0] - s.dx > r0[2] || q[3] - s.dy < r0[1] || q[1] - s.dy > r0[3]); });
    const clip = (cx === cx1 || cy === cy1);   // 존 끝 청크 — 남의 땅 개체를 거른다
    const tag = hitRefs.length ? hitRefs.map((s) => `${s.from}:${s.f.name || '?'}`).slice(0, 3).join('+') : (clip ? '존 끝 거르기' : '★까닭 없음');
    why[k] = tag;
    ch.push([k, d]); if (d > maxD) maxD = d; if (!hitRefs.length && !clip) far++;
  }
  bad += far;
  let pc = 0; const keys = new Set([...Object.keys(a.pcells), ...Object.keys(b.pcells)]);
  const flips = { '물+': 0, '물-': 0, '바위+': 0, '바위-': 0, '숲+': 0, '숲-': 0 };
  for (const k of keys) { const x = a.pcells[k] || 0, y = b.pcells[k] || 0; if (x !== y) { pc++;
    for (const [bit, nm] of [[1, '물'], [2, '바위'], [4, '숲']]) { if (!(x & bit) && (y & bit)) flips[nm + '+']++; if ((x & bit) && !(y & bit)) flips[nm + '-']++; } } }
  flipsAll[zid] = flips;
  lists[zid] = ch.map(([k, d]) => [k, d, why[k]]);
  console.log(`| ${zid} | ${Object.keys(b.per).length.toLocaleString()} | **${ch.length}** | ${maxD} | **${far}** | ${b.pn.toLocaleString()} | ${pc} |`);
}
console.log('');
console.log('경계 셀 술어가 뒤집힌 방향(64px 표본 · 각 변 2,048px 띠): ' + ZIDS.map((z) => `${z} ` + Object.entries(flipsAll[z]).map(([k, v]) => `${k}${v}`).join(' ')).join(' | '));
console.log('');
for (const zid of ZIDS) if (lists[zid].length) {
  const byWhy = {}; for (const [k, d, w] of lists[zid]) (byWhy[w] = byWhy[w] || []).push(`${k}(${d})`);
  console.log(`  ${zid} 바뀐 청크 ${lists[zid].length} — 까닭별:`);
  for (const [w, ks] of Object.entries(byWhy).sort((x, y) => y[1].length - x[1].length)) console.log(`    · ${w} — ${ks.length}청크: ${ks.slice(0, 12).join(' ')}${ks.length > 12 ? ' …' : ''}`);
}
// 띠(±1청크) 안/밖 — 카드 ③ "경계 밖 무변" 의 글자 그대로 잰 값(밖에 있는 것도 까닭이 있어야 한다)
for (const zid of ZIDS) { const L = lists[zid]; const inB = L.filter(([, d]) => d <= 1).length; const out = L.filter(([, d]) => d > 1);
  console.log(`  띠 ±1청크: ${zid} 안 ${inB} · 밖 ${out.length}` + (out.length ? ` — 밖 까닭: ${[...new Set(out.map(([, , w]) => w))].join(' / ')}` : '')); }
console.log('');
console.log(bad ? `★게이트: 까닭 없는 바뀐 청크 ${bad} — **빨강**` : '★게이트: 까닭 없는 바뀐 청크 **0** — 바뀐 청크는 전부 이웃 피처 모양 안이거나 존 끝 거르기');
process.exit(bad ? 2 : 0);
