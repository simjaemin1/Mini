#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T601 추신 · 맵 에디터 해안 띠 층 굽기 · 제품 무변)
// === scripts/editor-coast-layer.js — 존마다 해안 띠 마스크를 에디터 내장 정본에 싣는 꼴로 =========================
// ★왜(재민 10-03 "에디터에서 해안선도 잘려 있는 모양으로 보이게" · 족보 562·563): 에디터는 정본 json 피처만 그려 해안 띠를 몰랐다 —
//   재민이 그린 남해안 강 8줄이 바다에 잘린 것을 그릴 때 못 봤다. 해안을 먼저 확정하고(T604 추신2) 이 층을 보며 재민이 지형을 고친다.
// 띠는 **서버 정본 그대로** — `scripts/t588-coast-mask.js <존>` 를 부르기만 한다(사본 0 · 손잡이 `T588_COAST` 등 env 를 그대로 넘긴다).
//   낮춘 해상도: CELL 셀 = 1 화소(기본 4 · 128px) · 화소 = 그 칸 안 셀의 **절반 이상**이 띠면 바다(다수결 — 가장자리 칸은 있는 셀만 센다).
//   부호: 행 우선 줄 길이(뭍부터 번갈아) · 36진 · 쉼표 — 띠는 변을 따라 이어져 줄이 짧다.
// 쓰는 법: node scripts/editor-coast-layer.js [--json out.json]   → 존별 크기 표(셀 · 화소 · 띠 몫 · 글자 수)
//          require('./editor-coast-layer').build()                 → { cell, knob, zones: { <존>: { off, size, w, h, band, rle } } }  (editor-baked-check 가 부른다)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CELL = 4, SZ = 32;

function maskOf(zoneId, tmp) {
  const out = path.join(tmp, zoneId + '.u8'), meta = path.join(tmp, zoneId + '.json');
  execFileSync(process.execPath, [path.join(__dirname, 't588-coast-mask.js'), zoneId, out, meta], { env: process.env, stdio: 'ignore' });
  return { M: new Uint8Array(fs.readFileSync(out)), meta: JSON.parse(fs.readFileSync(meta, 'utf8')) };
}
function down(M, NX, NY) {
  const w = Math.ceil(NX / CELL), h = Math.ceil(NY / CELL), P = new Uint8Array(w * h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    let s = 0, n = 0;
    for (let y = py * CELL; y < Math.min(NY, py * CELL + CELL); y++) for (let x = px * CELL; x < Math.min(NX, px * CELL + CELL); x++) { n++; s += M[y * NX + x]; }
    P[py * w + px] = (2 * s >= n) ? 1 : 0;
  }
  return { w, h, P };
}
function rle(P) {
  const runs = []; let cur = 0, len = 0;
  for (let i = 0; i < P.length; i++) { if (P[i] === cur) len++; else { runs.push(len); cur = P[i]; len = 1; } }
  runs.push(len);
  return runs.map((r) => r.toString(36)).join(',');
}
function unrle(s, n) {   // 하네스·표 확인용(에디터는 같은 식을 제 안에 둔다)
  const P = new Uint8Array(n); let i = 0, v = 0;
  for (const t of s.split(',')) { const r = parseInt(t, 36); if (v) P.fill(1, i, i + r); i += r; v ^= 1; }
  return P;
}
function build() {
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecl-'));
  const zones = {};
  for (const [id, Z] of Object.entries(ZONES)) {
    if (Z.isOcean) continue;
    const NX = Math.ceil(Z.zoneWidth / SZ), NY = Math.ceil(Z.zoneHeight / SZ);
    const { M, meta } = maskOf(id, tmp);
    if (M.length !== NX * NY) throw new Error(`${id}: 마스크 크기 ${M.length} ≠ ${NX}×${NY}`);
    const { w, h, P } = down(M, NX, NY);
    zones[id] = { off: [Z.worldOffsetX, Z.worldOffsetY], size: [Z.zoneWidth, Z.zoneHeight], w, h, band: meta.band, rle: rle(P) };
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  const v = process.env.T588_COAST;
  return { cell: CELL, knob: (v === '1' || v === 'a' || v === 'b') ? v : '', zones };
}
module.exports = { build, unrle, CELL };

if (require.main === module) {
  const t0 = Date.now(), L = build();
  console.log(`해안 띠 층 — ${CELL}셀 = 1화소(${CELL * SZ}px) · 해안 손잡이 ${L.knob || '끔'} · ${Object.keys(L.zones).length}존 · ${Date.now() - t0}ms`);
  console.log('| 존 | 셀 | 화소 | 띠 셀(몫) | 바다 화소 | 글자 |');
  console.log('|---|---|---|---|---|---|');
  let tot = 0;
  for (const [id, z] of Object.entries(L.zones)) {
    const P = unrle(z.rle, z.w * z.h); let s = 0; for (const v of P) s += v;
    const cells = Math.ceil(z.size[0] / SZ) * Math.ceil(z.size[1] / SZ);
    tot += z.rle.length;
    console.log(`| ${id} | ${Math.ceil(z.size[0] / SZ)}×${Math.ceil(z.size[1] / SZ)} | ${z.w}×${z.h} | ${z.band.toLocaleString()}(${(100 * z.band / cells).toFixed(2)}%) | ${s.toLocaleString()}(${(100 * s / (z.w * z.h)).toFixed(2)}%) | ${z.rle.length.toLocaleString()} |`);
  }
  console.log(`글자 합 ${tot.toLocaleString()}`);
  const j = process.argv.indexOf('--json'); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(L));
}
