#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T585 추신 자 · 제품 무변)
// === scripts/t585-confluence.js — 합류 표: 개울 하구(개울 셀이 큰 물로 드는 칸)마다 개울 폭(1·2셀) × 받는 물 ======================
//   개울 폭 = 제 집수(정본 `streamMask` — 문턱 1,500 이상 1셀 · 4배 6,000 이상 2셀) · 받는 물 = 그 하구가 흘러드는 물 칸:
//     해안 띠 = 바다 · 호수 원(지형 json `lakes` · 원 반경) 안 = 호수 · 그 밖 = 강 → 가장 가까운 강 점의 폭(px · 지형 json 정본).
//   입력 = `bake-streams.js --kind <dir>` 가 남긴 kind(존 술어 그대로) — 같은 굽기(`S.bake`)를 묶음 한 장에 다시 돈다(결정적 · 파일과 같은 판).
//   + `--png <dir>` 합류 확대 넷(한반도 · 받는 강이 가장 가는 하구 둘 · 2셀 개울 하구 둘).
// 쓰는 법: node scripts/t585-confluence.js <kinddir> [--json f] [--png dir]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'server', 'streams.js'));
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
const argv = process.argv.slice(2);
const KD = argv[0];
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const TJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8'));
const grp = S.GROUP;
const K = {}; let UW = 0, UH = 0;
for (const z of grp) { const m = JSON.parse(fs.readFileSync(path.join(KD, z + '.meta.json'))); K[z] = { NX: m.NX, NY: m.NY, kind: new Uint8Array(fs.readFileSync(path.join(KD, z + '.kind.u8'))), ux: UW }; UW += m.NX; UH = m.NY; }
const UK = new Uint8Array(UW * UH);
for (const z of grp) { const k = K[z]; for (let y = 0; y < UH; y++) UK.set(k.kind.subarray(y * k.NX, y * k.NX + k.NX), y * UW + k.ux); }
const B = S.bake(UW, UH, UK);
const acc = B.F.acc, down = B.F.down;
const zoneOf = (x) => { for (const z of grp) if (x >= K[z].ux && x < K[z].ux + K[z].NX) return z; return null; };
// 강 점(존 로컬 px) — 가까운 점 찾기용 격자(512px 칸)
const RIV = {};
for (const z of grp) {
  const g = new Map();
  for (const r of (TJ[z] && TJ[z].rivers) || []) for (let i = 0; i < r.path.length; i++) {
    const p = r.path[i], q = r.path[Math.min(i + 1, r.path.length - 1)];
    for (let t = 0; t <= 1; t += 0.25) { const x = p.pos[0] + (q.pos[0] - p.pos[0]) * t, y = p.pos[1] + (q.pos[1] - p.pos[1]) * t, w = p.width + (q.width - p.width) * t;
      const k = Math.floor(x / 512) + ',' + Math.floor(y / 512); if (!g.has(k)) g.set(k, []); g.get(k).push([x, y, w, r.name]); }
  }
  RIV[z] = g;
}
function riverAt(z, x, y) {
  let best = null, bd = 1e18; const gx = Math.floor(x / 512), gy = Math.floor(y / 512);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const p of (RIV[z].get((gx + dx) + ',' + (gy + dy)) || [])) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
const inLake = (z, x, y) => ((TJ[z] && TJ[z].lakes) || []).some((L) => L.center && Math.hypot(L.center[0] - x, L.center[1] - y) <= (L.radius || 0) * 1.05);
const BINS = [['120~159px(3.75~5셀)', 120, 160], ['160~249px', 160, 250], ['250~399px', 250, 400], ['400px 이상', 400, 1e9]];
const tab = {}; const mouths = [];
for (const z of grp) tab[z] = { mouths: 0, by: {} };
for (let u = 0; u < UW * UH; u++) {
  if (B.mask[u] !== 1) continue; const d = down[u]; if (d < 0 || !B.water[d]) continue;   // 줄기 칸만(넓힘 칸은 제 흐름이 아니다)
  const x = u % UW, y = (u / UW) | 0, z = zoneOf(x), dx = d % UW, dy = (d / UW) | 0, dz = zoneOf(dx);
  const w = acc[u] >= 4 * S.STREAM_A0 ? 2 : 1;
  const lx = (dx - K[dz].ux) * 32 + 16, ly = dy * 32 + 16;
  let kind, rw = null, rn = null;
  if (UK[d] === 2) kind = '바다(해안 띠)';
  else if (inLake(dz, lx, ly)) kind = '호수';
  else { const r = riverAt(dz, lx, ly); rw = r ? r[2] : null; rn = r ? r[3] : null; const b = BINS.find((bb) => rw != null && rw >= bb[1] && rw < bb[2]); kind = b ? '강 ' + b[0] : (rw != null && rw < 120 ? `강 ${Math.round(rw)}px(120 밑)` : '강(폭 모름)'); }
  const T = tab[z]; T.mouths++; T.by[kind] = T.by[kind] || { 1: 0, 2: 0 }; T.by[kind][w]++;
  mouths.push({ z, x: x - K[z].ux, y, w, kind, rw: rw != null ? Math.round(rw) : null, rn, acc: acc[u] });
}
for (const z of grp) {
  const T = tab[z]; console.log(`\n${z}: 개울 하구 ${T.mouths}`);
  for (const k of Object.keys(T.by).sort()) console.log(`  ${k.padEnd(22)} 1셀 ${T.by[k][1]} · 2셀 ${T.by[k][2]}`);
}
const thinRiv = mouths.filter((m) => m.rw != null).sort((a, b) => a.rw - b.rw);
console.log(`\n받는 강이 가장 가는 하구 다섯: ${thinRiv.slice(0, 5).map((m) => `${m.z}(${m.x},${m.y}) ${m.rn} ${m.rw}px · 개울 ${m.w}셀`).join(' | ')}`);
const j = opt('--json'); if (j) fs.writeFileSync(j, JSON.stringify({ tab, thin: thinRiv.slice(0, 20), n: mouths.length }, null, 1));
const pd = opt('--png');
if (pd) {   // 합류 확대 넷 — 한반도: 받는 강이 가장 가는 하구 둘(1셀·2셀 개울 각 하나 우선) + 넓은 강에 드는 2셀 개울 하나 + 호수/바다 하나
  fs.mkdirSync(pd, { recursive: true });
  const hb = mouths.filter((m) => m.z === 'hanbando');
  const pick = [];
  const th = hb.filter((m) => m.rw != null).sort((a, b) => a.rw - b.rw);
  const a1 = th.find((m) => m.w === 1), a2 = th.find((m) => m.w === 2);
  if (a1) pick.push(['가는 강 · 1셀 개울', a1]); if (a2) pick.push(['가는 강 · 2셀 개울', a2]);
  const wide = hb.filter((m) => m.rw != null && m.rw >= 400 && m.w === 2)[0]; if (wide) pick.push(['넓은 강 · 2셀 개울', wide]);
  const lk = hb.find((m) => m.kind === '호수') || hb.find((m) => /바다/.test(m.kind)); if (lk) pick.push([lk.kind + ' · ' + lk.w + '셀 개울', lk]);
  fs.writeFileSync(path.join(pd, 'picks.json'), JSON.stringify(pick.map(([t, m]) => ({ title: t, ...m }))));
  // 창 60×60 셀 · kind + mask(1/2 구분) 를 원본 바이트로
  const k = K.hanbando, out = [];
  for (const [t, m] of pick) {
    const W = 60, x0 = Math.max(0, m.x - 30), y0 = Math.max(0, m.y - 30), buf = Buffer.alloc(W * W * 2);
    for (let yy = 0; yy < W; yy++) for (let xx = 0; xx < W; xx++) { const lx = x0 + xx, ly = y0 + yy; if (lx >= k.NX || ly >= UH) continue; const u = ly * UW + k.ux + lx; buf[(yy * W + xx) * 2] = UK[u]; buf[(yy * W + xx) * 2 + 1] = B.mask[u]; }
    const f = path.join(pd, `win_${out.length}.bin`); fs.writeFileSync(f, buf); out.push({ title: t, f, x0, y0, m });
  }
  fs.writeFileSync(path.join(pd, 'wins.json'), JSON.stringify(out));
  console.log(`그림 창 ${out.length} → ${pd}`);
}
