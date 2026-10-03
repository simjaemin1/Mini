#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T550 ②ⓔ 경계 고개 → 계곡선 · 닛폰만)
// =============================================================================
// 닛폰 서쪽 경계의 고개 둘(쇠재 · 한재 — 한반도 쇠재·한재의 짝 · 원 · x −216)을 **한반도 쪽 계곡선을 이어** 닛폰 안 계곡선으로 바꾼다.
//   왜 `passes-to-valleys --zone nippon` 이 아닌가: 그 기계는 "존 경계 = 바다 쪽 — 거기서 끝나도 된다"(한반도 동해안 문법)라
//     닛폰 서쪽 경계(뭍 · 한반도)에서는 고개 자리(x < 0)에서 2셀짜리 헛계곡을 낸다(T550 계산만 판 실측). 여기는 T408 접합 문법:
//     한반도가 이미 그은 계곡(쇠재 · 한재 · 폭 320 · 경계 x 70,032 까지)과 **같은 방향 · 같은 폭**으로 닛폰 안 쿠로야마 몸을 끝까지 판다.
//   끝 = 바위가 끝난 뒤 EXT 3셀(passes-to-valleys 와 같은 여유) · 고개 원은 지운다(정본 고개 0 = 한반도처럼).
// 쓰는 법: node scripts/t550-passes.js [--apply]
'use strict';
const fs = require('fs');
const path = require('path');
const APPLY = process.argv.includes('--apply');
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = require(GAME);   // terrain.js 와 같은 객체(passes-to-valleys 주석 그대로)
const N = world.nippon, H = world.hanbando;
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const CELL = 32, EXT = 3, MAXLEN = 200;
const DX = ZONES.nippon.worldOffsetX - ZONES.hanbando.worldOffsetX, DY = (ZONES.nippon.worldOffsetY || 0) - (ZONES.hanbando.worldOffsetY || 0);
const saved = (N.passes || []).slice();
N.passes = [];   // 고개를 뺀 땅으로 잰다
const rock = (x, y) => terrain.isRockCellLocal('nippon', x, y);
const out = [], rows = [];
for (const q of saved) {
  const hv = (H.valleys || []).find((v) => v.name === q.name);
  if (!hv) { rows.push(`${q.name}: 한반도 짝 계곡 없음 — 그대로 둔다`); out.push(null); continue; }
  const P = hv.path.map((p) => [p.pos[0] - DX, p.pos[1] - DY]);   // 닛폰 로컬
  const a = P[0], b = P[P.length - 1];   // 한반도 계곡선 전체 방향(마지막 토막만 보면 꺾인 끝을 따라 비스듬히 판다)
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  // 경계(x = 0)에서 출발 — 한반도 선의 연장
  const t0 = (0 - b[0]) / (ux || 1e-9); const sx = b[0] + ux * t0, sy = b[1] + uy * t0;
  let seen = false, clear = 0, end = null, k = 0;
  for (k = 0; k < MAXLEN; k++) {
    const x = sx + ux * (k + 0.5) * CELL, y = sy + uy * (k + 0.5) * CELL;
    if (rock(x, y)) { seen = true; clear = 0; } else if (seen && ++clear >= EXT) { end = [x, y]; break; }
  }
  if (!end) { rows.push(`${q.name}: ${MAXLEN}셀 안에 바위가 안 끝난다 — 그대로 둔다`); out.push(null); continue; }
  const len = Math.hypot(end[0] - sx, end[1] - sy), n = Math.max(1, Math.round(len / 128)), w = hv.path[hv.path.length - 1].width;
  const pts = []; for (let i = 0; i <= n; i++) pts.push({ pos: [Math.round(sx + (end[0] - sx) * i / n), Math.round(sy + (end[1] - sy) * i / n)], width: w });
  out.push({ name: q.name, path: pts });
  rows.push(`${q.name}: 한반도 ${q.name} 계곡선 연장 · (${pts[0].pos}) → (${pts[pts.length - 1].pos}) · ${Math.round(len / CELL)}셀 · 폭 ${w}`);
}
N.passes = saved;
for (const r of rows) console.log('  ' + r);
if (!APPLY) { console.log('계산만 — 쓰려면 --apply'); process.exit(0); }
N.valleys = N.valleys || [];
const keep = [];
saved.forEach((q, i) => { if (out[i]) N.valleys.push(out[i]); else keep.push(q); });
N.passes = keep;
// ★캐시 칸(`_bbox` · `_segIdx` — terrain.js 가 require 객체에 단다)은 쓰지 않는다(다시 읽으면 `.at` 없는 객체가 된다) · 닛폰 밖 존은 파일에서 읽은 그대로
const _strip = (v) => Array.isArray(v) ? v.map(_strip) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== '_bbox' && k !== '_segIdx').map(([k, x]) => [k, _strip(x)])) : v;
const _disk = JSON.parse(fs.readFileSync(GAME, 'utf8')); _disk.nippon = _strip(N);
fs.writeFileSync(GAME, JSON.stringify(_disk));
console.log(`기록: 닛폰 고개 ${saved.length} → ${keep.length} · 계곡 +${out.filter(Boolean).length}`);
