#!/usr/bin/env node
// === scripts/t259-preds-audit.js — 계측기 술어 전수 감사 (정적 추출 + 술어 대조 · 러너 밖) ===
//
// ★왜 [지시 T259 ⓐⓑ]
//   T251 이 "계측기 18벌이 술어를 각자 적었다"까지 셌다. 이 자는 **그 술어들을 실제로 불러**
//   제품 정본(C = `scripts/zone-preds.js`)과 값이 어디서 갈리는지 잰다.
//
// ★사본 0 규약: 이 자는 술어를 **다시 적지 않는다.** 각 파일의 **자기 바이트**를 잘라
//   `new Function` 으로 세우고(그 파일이 쓰는 그 식 그대로), `makeTerrainAdapter` 를 가로채
//   그 파일이 **실제로 넘기는 `deps` 객체**를 받아 낸다. 지형 값은 전부 `server/terrain` 정본이다.
//
// ★잘라 오는 구간: `makeTerrainAdapter(` 줄에서 위로 올라가 `_in`/`_inZone` 정의 줄까지.
//   그 사이가 그 파일의 술어 전부다(앞 카드들이 전부 같은 꼴로 적어 왔다).
'use strict';
process.env.ZONE_ID = 'hanbando';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const ZCmod = R('server/zone-config');
const { ZONES } = ZCmod;
const Zid = 'hanbando', ZONE = ZONES[Zid];
const T = R('server/terrain');
const Villages = R('server/villages');
const P = Villages.__labProbe;
P.setZoneId(Zid);
const SZ = P.SZ;
const ZP = R('scripts/zone-preds').makeZonePreds(Zid);

// ── 한 파일에서 그 파일이 넘기는 deps 를 뽑는다 ────────────────────────────────
function depsOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // ★`zone-preds` 한 벌을 부르는 자는 **정본 술어 그대로**다 — 잘라 올 게 없다(C 등급 · 대조 0 차이).
  if (/require\([^)]*zone-preds/.test(src) || /R\('scripts\/zone-preds'\)/.test(src)) {
    return { deps: { isTerrainBlockedLocal: ZP.isTerrainBlockedLocal, isWaterTileLocal: ZP.isWaterTileLocal,
      isBridgeLocal: ZP.isBridgeTileLocal }, from: file + ' → scripts/zone-preds.js(정본 한 벌)' };
  }
  const lines = src.split('\n');
  let mi = -1;
  // ⚠주석 줄은 건너뛴다 — 여러 파일이 머리말에서 `makeTerrainAdapter` 를 언급한다.
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(\/\/|\*)/.test(lines[i])) continue;
    if (/makeTerrainAdapter\s*\(/.test(lines[i])) { mi = i; break; }
  }
  if (mi < 0) return { err: 'makeTerrainAdapter 줄 없음' };
  let si = -1;
  for (let i = mi; i >= 0 && i > mi - 60; i--) if (/^\s*const\s+(_in|_inZone)\s*=/.test(lines[i])) { si = i; break; }
  if (si < 0) return { err: '_in/_inZone 정의 줄 없음' };
  const body = lines.slice(si, mi + 1).join('\n');
  // 그 파일이 존 객체를 어느 이름으로 넘기나 — `makeTerrainAdapter(T, X, …)` 의 X
  const zm = /makeTerrainAdapter\s*\(\s*\w+\s*,\s*(\w+)\s*,/.exec(lines[mi]);
  const zoneArgName = zm ? zm[1] : 'ZONE';
  let captured = null;
  const Pstub = { makeTerrainAdapter: (t, z, d) => { captured = d; return {}; } };
  const names = ['ZONE', 'ZONES', 'Z', 'ZC', 'SZ', 'T', 'P', 'terrain'];
  const vals = { ZONES, Z: Zid, SZ, T, P: Pstub, terrain: T };
  vals.ZONE = (zoneArgName === 'ZONE') ? ZONE : Zid;   // migrate-db-endowment 는 ZONE=존id · ZC=존객체
  vals.ZC = (zoneArgName === 'ZC') ? ZONE : ZCmod;
  try {
    // eslint-disable-next-line no-new-func
    const f = new Function(...names, '"use strict";' + body + '\nreturn null;');
    f(...names.map((n) => vals[n]));
  } catch (e) { return { err: e.message }; }
  if (!captured) return { err: 'deps 를 못 받았다' };
  return { deps: captured, from: file + ':' + (si + 1) + '~' + (mi + 1) };
}

// ── 술어 대조 — 존 전체를 결정적으로 표집해 세 술어 값을 맞댄다 ────────────────
//   격자가 아니라 mulberry32 표집이다(격자는 32px 배수에만 떨어져 타일 안쪽을 안 본다).
function sampler(n) {
  let s = 20260913 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([rnd() * ZONE.zoneWidth, rnd() * ZONE.zoneHeight]);
  return pts;
}
const PTS = sampler(parseInt(process.env.T259_N || '120000', 10));

const CD = { isTerrainBlockedLocal: ZP.isTerrainBlockedLocal, isWaterTileLocal: ZP.isWaterTileLocal };
function compare(d) {
  let bDiff = 0, wDiff = 0, bC = 0, bX = 0, wC = 0, wX = 0;
  for (const [x, y] of PTS) {
    const c1 = !!CD.isTerrainBlockedLocal(x, y), x1 = !!d.isTerrainBlockedLocal(x, y);
    const c2 = !!CD.isWaterTileLocal(x, y), x2 = !!d.isWaterTileLocal(x, y);
    if (c1) bC++; if (x1) bX++; if (c2) wC++; if (x2) wX++;
    if (c1 !== x1) bDiff++;
    if (c2 !== x2) wDiff++;
  }
  return { n: PTS.length, bDiff, wDiff, bC, bX, wC, wX };
}

const files = process.argv.slice(2);
const out = [];
for (const f of files) {
  const g = depsOf(f);
  if (g.err) { console.log(`  ✗ ${f} — ${g.err}`); out.push({ file: f, err: g.err }); continue; }
  const r = compare(g.deps);
  const keys = Object.keys(g.deps).sort().join(',');
  out.push({ file: f, from: g.from, keys, ...r });
  console.log(`  ${f}  차단≠C ${r.bDiff} (${(r.bDiff / r.n * 100).toFixed(2)}%) · 물≠C ${r.wDiff} (${(r.wDiff / r.n * 100).toFixed(2)}%) · 이 자 차단율 ${(r.bX / r.n * 100).toFixed(2)}% vs C ${(r.bC / r.n * 100).toFixed(2)}% · deps키 [${keys}]`);
}
if (process.env.T259_JSON) fs.writeFileSync(process.env.T259_JSON, JSON.stringify(out, null, 1));
