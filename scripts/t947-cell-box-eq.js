#!/usr/bin/env node
// === scripts/t947-cell-box-eq.js — T947 상자 거름(`public/cell-env.js`)이 정본과 **같은 값**을 내나 — 노드 · 브라우저 0 · 러너 밖 =========
//
//   정본 = `public/terrain.js`(클라가 쓰는 그 파일 · central `/terrain.json` 과 같은 `server/hanbando-terrain.json` 을 `setHardcoded`)의
//   `isWaterCellLocal` · `isRockCellLocal`. 상자 = `CellEnv.build(ZONE_TERRAIN[존], B)` — B 는 클라가 넘기는 그 수(10-r1-terrain `_segGrid.B` 를 파일에서 읽는다).
//   칸마다(클라가 묻는 꼴 — 존 칸 가운데 `tx * 32 + 16`, `ty * 32 + 16`):
//     · 어긋남 = 정본이 참인데 상자가 "거짓으로 정해짐"이라 한 칸(물 · 바위 따로) — **0 이어야** 켬 = 끔 값이다
//       (켬 값 = 상자가 거짓이면 거짓 · 아니면 정본 — 정본이 참인 칸은 늘 정본을 부르므로 어긋남 0 ⇔ 켬 값 = 정본 값 · 칸마다)
//     · 거른 칸 = 상자가 거짓이라 정본을 안 부른 칸(물 · 바위)
//     · 노드 ms — 끔(칸마다 정본) · 켬(상자 → 걸리면 정본) — 같은 칸 같은 차례
//   `--full <존,…>` 그 존 칸 **전부**(클라가 그 존에서 물을 수 있는 칸 전부) · 기본 = 뭍 존마다 ① 피처 둘레 띠(강 · 능선 · 골짜기 마디마다
//   반폭 + 2칸 사각 · 호수 기각 상자 + 2칸 · 경계 이웃 피처도) ② 고른 표본 `--rand` 칸. 어긋남이 있으면 첫 몇 칸을 찍고 끝 코드 1.
// 실행: node scripts/t947-cell-box-eq.js [--full hanbando] [--rand 200000] [--zones a,b] [--metas a,b] [--out /tmp/t947/eq.json]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FULL = (arg('--full', '') || '').split(',').filter(Boolean);
const RAND = +arg('--rand', '200000');
const OUT = arg('--out', '');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'public', 'terrain.js'));
const CE = require(path.join(ROOT, 'public', 'cell-env.js'));
const SRC10 = fs.readFileSync(path.join(ROOT, 'public', 'client', '10-r1-terrain.js'), 'utf8');
const mB = /const _segGrid = \{ B: (\d+)/.exec(SRC10);
if (!mB) { console.log('10-r1-terrain `_segGrid.B` 를 못 찾았다 — 자 고장'); process.exit(2); }
const B = +mB[1];
//   `--metas a,b` 면 존 메타를 그 존들만으로 준다(클라가 central `/zones` 로 받은 존만 아는 꼴 — 경계 이웃 참조가 그만큼 준다 · e2e 판은 한반도 하나)
const METAS = (arg('--metas', '') || '').split(',').filter(Boolean);
T.setZonesMeta(METAS.length ? Object.fromEntries(METAS.map((k) => [k, ZONES[k]])) : ZONES);
for (const [zid, data] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')))) T.setHardcoded(zid, data);

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

const res = { B, zones: {}, total: { cells: 0, water: 0, rock: 0, badW: 0, badR: 0, skipW: 0, skipR: 0, msOff: 0, msOn: 0 }, full: FULL };
const envs = {};
function envOf(zid) { if (!envs[zid]) envs[zid] = CE.build(T.ZONE_TERRAIN[zid], B); return envs[zid]; }
function cmpCells(zid, cells, label) {
  const n = cells.length >> 1, env = envOf(zid);
  const wa = new Uint8Array(n), ra = new Uint8Array(n);
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) { const x = cells[2 * i] * 32 + 16, y = cells[2 * i + 1] * 32 + 16; wa[i] = T.isWaterCellLocal(zid, x, y) ? 1 : 0; ra[i] = T.isRockCellLocal(zid, x, y) ? 1 : 0; }
  const msOff = Number(process.hrtime.bigint() - t0) / 1e6;
  // 켬 길 — 클라 `isWaterAtAbs` · `isRockAtAbs` 의 켬 갈래와 같은 꼴(상자가 거짓이면 거짓 · 아니면 정본)
  let bw = 0, br = 0, sw = 0, sr = 0, w = 0, r = 0; const ex = [];
  t0 = process.hrtime.bigint();
  const vw = new Uint8Array(n), vr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = cells[2 * i] * 32 + 16, y = cells[2 * i + 1] * 32 + 16;
    vw[i] = CE.maybeWater(env, x, y) ? (T.isWaterCellLocal(zid, x, y) ? 1 : 0) : 2;
    vr[i] = CE.maybeRock(env, x, y) ? (T.isRockCellLocal(zid, x, y) ? 1 : 0) : 2;
  }
  const msOn = Number(process.hrtime.bigint() - t0) / 1e6;
  for (let i = 0; i < n; i++) {
    if (vw[i] === 2) { sw++; if (wa[i]) { bw++; if (ex.length < 8) ex.push({ k: '물', tx: cells[2 * i], ty: cells[2 * i + 1] }); } } else if (vw[i] !== wa[i]) { bw++; if (ex.length < 8) ex.push({ k: '물(정본 두 번 다름)', tx: cells[2 * i], ty: cells[2 * i + 1] }); }
    if (vr[i] === 2) { sr++; if (ra[i]) { br++; if (ex.length < 8) ex.push({ k: '바위', tx: cells[2 * i], ty: cells[2 * i + 1] }); } } else if (vr[i] !== ra[i]) { br++; if (ex.length < 8) ex.push({ k: '바위(정본 두 번 다름)', tx: cells[2 * i], ty: cells[2 * i + 1] }); }
    w += wa[i]; r += ra[i];
  }
  const z = res.zones[zid] || (res.zones[zid] = { env: null, parts: [] });
  z.parts.push({ label, cells: n, water: w, rock: r, badW: bw, badR: br, skipW: sw, skipR: sr, msOff: +msOff.toFixed(1), msOn: +msOn.toFixed(1), ex });
  const S = res.total; S.cells += n; S.water += w; S.rock += r; S.badW += bw; S.badR += br; S.skipW += sw; S.skipR += sr; S.msOff += msOff; S.msOn += msOn;
  console.log(`  ${zid.padEnd(10)} ${String(label).padEnd(5)} 칸 ${String(n).padStart(9)} · 물 ${String(w).padStart(8)} · 바위 ${String(r).padStart(8)} · 어긋남 물 ${bw} 바위 ${br} · 거른 칸 물 ${sw} 바위 ${sr} · 노드 ms 끔 ${msOff.toFixed(0)} / 켬 ${msOn.toFixed(0)}`);
  for (const e of ex) console.log(`     어긋남 ${e.k} (${e.tx}, ${e.ty})`);
}

const land = Object.keys(ZONES).filter((k) => !ZONES[k].isOcean);
const only = (arg('--zones', '') || '').split(',').filter(Boolean);
console.log(`\n=== T947 상자 거름 = 정본 — 격자 B ${B} · ${FULL.length ? '존 칸 전부: ' + FULL.join(',') : '띠 + 표본 ' + RAND + '칸/존'} · 존 메타 ${METAS.length ? METAS.join(',') : '전부(zone-config)'} ===`);
if (FULL.length) {
  for (const zid of FULL) {
    const Z = ZONES[zid]; const NX = Math.ceil(Z.zoneWidth / 32), NY = Math.ceil(Z.zoneHeight / 32);
    const ROWS = 256;
    for (let ty0 = 0; ty0 < NY; ty0 += ROWS) {
      const ty1 = Math.min(NY, ty0 + ROWS), cells = new Int32Array((ty1 - ty0) * NX * 2); let k = 0;
      for (let ty = ty0; ty < ty1; ty++) for (let tx = 0; tx < NX; tx++) { cells[k++] = tx; cells[k++] = ty; }
      cmpCells(zid, cells, `${ty0}`);
    }
  }
} else {
  for (const zid of (only.length ? only : land)) {
    const Z = ZONES[zid]; const NX = Math.ceil(Z.zoneWidth / 32), NY = Math.ceil(Z.zoneHeight / 32);
    const t = T.ZONE_TERRAIN[zid]; if (!t) continue;
    const seen = new Set(); const band = [];
    const addBox = (x0, y0, x1, y1) => {
      const c0 = Math.floor(x0 / 32) - 2, c1 = Math.floor(x1 / 32) + 2, r0 = Math.floor(y0 / 32) - 2, r1 = Math.floor(y1 / 32) + 2;
      for (let ty = Math.max(0, r0); ty <= Math.min(NY - 1, r1); ty++) for (let tx = Math.max(0, c0); tx <= Math.min(NX - 1, c1); tx++) {
        const key = ty * NX + tx; if (seen.has(key)) continue; seen.add(key); band.push(tx, ty);
      }
    };
    const addPath = (f, dx, dy) => { for (const p of (f.path || [])) { const x = (p.pos ? p.pos[0] : p[0]) - dx, y = (p.pos ? p.pos[1] : p[1]) - dy, w = (p.width != null) ? p.width : (f.width || 200); addBox(x - w / 2, y - w / 2, x + w / 2, y + w / 2); } };
    const addLake = (L, dx, dy) => {
      const one = (c, R) => addBox(c[0] - R - dx, c[1] - R - dy, c[0] + R - dx, c[1] + R - dy);
      if (L.shape === 'multi') { for (const c of (L.circles || [])) one(c.center, c.radius * 1.3); } else if (L.shape === 'ellipse') one(L.center, Math.max(L.a, L.b) * 1.3); else one(L.center, L.radius * 1.3);
    };
    for (const kind of ['rivers', 'ridges', 'valleys']) for (const f of (t[kind] || [])) addPath(f, 0, 0);
    for (const L of (t.lakes || [])) addLake(L, 0, 0);
    const S = t.seam || {};
    for (const s of (S.water || [])) (s.lake ? addLake(s.f, s.dx, s.dy) : addPath(s.f, s.dx, s.dy));
    for (const kind of ['ridges', 'valleys']) for (const s of (S[kind] || [])) addPath(s.f, s.dx, s.dy);
    cmpCells(zid, Int32Array.from(band), '띠');
    const R = rng(seedOf(zid)); const cells = new Int32Array(RAND * 2);
    for (let i = 0; i < RAND; i++) { cells[2 * i] = Math.floor(R() * NX); cells[2 * i + 1] = Math.floor(R() * NY); }
    cmpCells(zid, cells, '표본');
  }
}
for (const zid of Object.keys(res.zones)) res.zones[zid].env = CE.stats(envOf(zid));   // 상자 수는 판 끝 값(선분 격자는 처음 물을 때 짓는다)
const S = res.total;
console.log(`\n  합: 칸 ${S.cells} · 물 ${S.water} · 바위 ${S.rock} · 어긋남 물 ${S.badW} · 바위 ${S.badR} → ${S.badW + S.badR === 0 ? '같음' : '다름'} · 거른 칸 물 ${S.skipW} · 바위 ${S.skipR} · 노드 ms 끔 ${S.msOff.toFixed(0)} / 켬 ${S.msOn.toFixed(0)}`);
for (const [zid, z] of Object.entries(res.zones)) console.log(`  상자 ${zid}: ${JSON.stringify(z.env)}`);
if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); }
process.exit(S.badW + S.badR === 0 ? 0 : 1);
