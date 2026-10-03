#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T585 굽는 이 · 결과물 `server/streams/<존>.bin` 은 커밋한다)
// === scripts/bake-streams.js — 존마다 개울 래스터를 정본 지형에서 한 번 굽는다 (T585 · 세션4) ==========================
//
// ★정본은 `server/streams.js` 하나다(산법 = 랩 `STREAM-CORE` 같은 글자 · 높이 대용 = T571 재현 식). 여기는 그것을 부르기만 한다.
//   kind 격자 = 존 술어 그대로(T524·T574 자와 같은 세 술어 · 같은 차례): 해안 띠(`chunk.generateCoastlineWaterTiles`) → 2 ·
//   `terrain.isWaterCellLocal` → 3 · `terrain.isRockCellLocal` → 4 · 그 밖 뭍 1. 셀 중심(cx·32+16)에서 묻는다(존 `isWaterTileLocal` 과 같은 자리).
// ★결정적: 같은 지형이면 같은 바이트(난수 0 · 잔물결은 해시).
// ★점검(⑦): 랩 `streamAudit` 를 서버 래스터에 — 갈라짐(셀마다 내려가는 곳 하나라 구조상 0 · 센다) · 두 물 성분 · 끊긴 조각 · 큰 물 위 개울 ·
//   + 존 경계 이음(이웃 존과 맞닿은 열에서 개울이 한쪽에만 있는 칸 — 표).
//
// 쓰는 법: node scripts/bake-streams.js [존…]        (기본 = 한반도 · 닛폰 · 중원북)
//          --check   굽기만 하고 파일과 바이트로 견준다(다르면 exit 1 — 파일이 지형보다 낡았다)
//          --json <f> 표를 json 으로 · --kind <dir> kind.u8·mask.u8 을 남긴다(그림 스크립트용)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/bake-streams-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'server', 'streams.js'));
const G = require(path.join(ROOT, 'server', 'xzone-geo.js'));
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const optv = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const JSON_OUT = optv('--json'), KIND_DIR = optv('--kind');
const ZONES_ARG = argv.filter((a, i) => !a.startsWith('--') && !['--json', '--kind'].includes(argv[i - 1]));
const ZLIST = ZONES_ARG.length ? ZONES_ARG : ['hanbando', 'nippon', 'jungwon_n'];
const say = (s) => process.stdout.write(s + '\n');

const { ZONES, findZoneAt, T, SZ, chunk } = G._mods();
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };

function kindOf(Z) {
  const ZONE = ZONES[Z];
  const NX = Math.ceil(ZONE.zoneWidth / SZ), NY = Math.ceil(ZONE.zoneHeight / SZ), N = NX * NY;
  const BAND = quiet(() => chunk.generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt, OR));
  const kind = new Uint8Array(N);
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
    const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2, i = cy * NX + cx;
    kind[i] = BAND.has(cx + '_' + cy) ? 2 : T.isWaterCellLocal(Z, x, y) ? 3 : T.isRockCellLocal(Z, x, y) ? 4 : 1;
  }
  return { NX, NY, kind, ZONE };
}

const out = { A: S.STREAM_A0, mode: S.MODE, group: S.GROUP, zones: {}, seams: [] };
// ★묶음(`S.GROUP` — 서→동 맞붙은 존들)을 한 장으로 잇는다 — 경계를 넘는 흐름이 그대로 이어진다.
const grp = S.GROUP.filter((z) => ZONES[z]);
const K0 = {}; let UW = 0, UH = 0, uy0 = null;
const tk = Date.now();
for (const Z of grp) {
  K0[Z] = kindOf(Z); K0[Z].ux = UW; UW += K0[Z].NX;
  if (uy0 == null) { uy0 = K0[Z].ZONE.worldOffsetY; UH = K0[Z].NY; }
  if (K0[Z].ZONE.worldOffsetY !== uy0 || K0[Z].NY !== UH) throw new Error(`묶음 존 ${Z} 의 위·아래가 다르다 — 한 장으로 못 잇는다`);
}
for (let i = 1; i < grp.length; i++) { const a = K0[grp[i - 1]].ZONE, b = K0[grp[i]].ZONE; if (a.worldOffsetX + a.zoneWidth !== b.worldOffsetX) throw new Error(`묶음 존 ${grp[i - 1]}|${grp[i]} 가 맞붙지 않는다`); }
const UK = new Uint8Array(UW * UH);
for (const Z of grp) { const k = K0[Z]; for (let cy = 0; cy < UH; cy++) UK.set(k.kind.subarray(cy * k.NX, cy * k.NX + k.NX), cy * UW + k.ux); }
const tkind = Date.now() - tk, tb = Date.now();
const UB = S.bake(UW, UH, UK);
const tbake = Date.now() - tb;
const UA = S.streamAudit(UW, UH, UB.mask, UB.water, UB.F);
say(`묶음 ${grp.join(' | ')} — ${UW}×${UH} 셀 · kind ${tkind}ms · 굽기 ${tbake}ms · 개울 ${(UB.n1 + UB.n2).toLocaleString()}셀 · 두 물 ${UA.two} · 끊긴 ${UA.frag} · 큰 물 위 ${UA.onWater} · 가로지름 ${UA.through}`);
const masks = {};
let bad = 0;
for (const Z of ZLIST) {
  const K = K0[Z]; if (!K) { say(`${Z}: 묶음 밖 — 건너뜀`); continue; }
  const N = K.NX * K.NY, mask = new Uint8Array(N), kind = K.kind, water = new Uint8Array(N), down = new Int32Array(N);
  for (let cy = 0; cy < K.NY; cy++) for (let cx = 0; cx < K.NX; cx++) { const i = cy * K.NX + cx, u = cy * UW + K.ux + cx; mask[i] = UB.mask[u]; water[i] = UB.water[u]; }
  // 존 몫의 점검 — 흐름은 묶음 것(경계를 넘는 줄기는 이웃 존에서 물에 닿는다 ⇒ 존만 떼어 세면 끊겨 보일 수 있다 · 그래서 묶음 점검이 정본이고 존 표는 셀·성분만)
  let n1 = 0, n2 = 0, land = 0, onWater = 0;
  for (let i = 0; i < N; i++) { if (mask[i] === 1) n1++; else if (mask[i] === 2) n2++; if (kind[i] === 1) land++; if (mask[i] && water[i]) onWater++; }
  let split = 0; { for (let cy = 0; cy < K.NY; cy++) for (let cx = 0; cx < K.NX; cx++) { const u = cy * UW + K.ux + cx; if (UB.mask[u] && UB.F.down[u] < -1) split++; } }
  const cells = n1 + n2;
  const file = S.fileOf(Z), buf = S.encodeFile(Z, mask, K.NX, K.NY, UB.A);
  let same = null;
  if (CHECK) { let old = null; try { old = fs.readFileSync(file); } catch (e) {} same = !!old && Buffer.compare(old, buf) === 0; if (!same) bad++; }
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }
  if (KIND_DIR) { fs.mkdirSync(KIND_DIR, { recursive: true }); fs.writeFileSync(path.join(KIND_DIR, Z + '.kind.u8'), Buffer.from(kind)); fs.writeFileSync(path.join(KIND_DIR, Z + '.mask.u8'), Buffer.from(mask)); fs.writeFileSync(path.join(KIND_DIR, Z + '.meta.json'), JSON.stringify({ NX: K.NX, NY: K.NY })); }
  masks[Z] = { NX: K.NX, NY: K.NY, mask, kind, ZONE: K.ZONE };
  out.zones[Z] = { NX: K.NX, NY: K.NY, land, cells, trunk: n1, wide: n2, landPct: +(100 * cells / Math.max(1, land)).toFixed(2), split, onWater, bytes: buf.length, hash: S.sourceHash(Z), same };
  say(`${Z}: 개울 ${cells.toLocaleString()}셀(뭍의 ${out.zones[Z].landPct}% · 1셀 ${n1} · 넓힘 ${n2}) · 갈라짐 ${split} · 큰 물 위 ${onWater} · 파일 ${(buf.length / 1024).toFixed(0)}KB${CHECK ? (same ? ' · 파일 같음 ✓' : ' · ★파일과 다르다') : ''}`);
}
out.union = { W: UW, H: UH, cells: UB.n1 + UB.n2, comps: UA.comps, waterComps: UA.waterComps, two: UA.two, frag: UA.frag, fragCells: UA.fragCells, onWater: UA.onWater, through: UA.through, bankPct: UA.bankPct, parallel: UA.parallel, msKind: tkind, msBake: tbake };
// 존 경계 이음 — 묶음 한 장에서 경계(두 존 사이 열)를 **건너는 흐름**을 센다: 개울 셀의 내려가는 곳이 이웃 존에 있으면 건넘 ·
//   그 내려가는 곳이 개울도 물도 아니면 끊김(구조상 0 — 집수는 아래로 갈수록 크다) · 경계 두 열 안의 개울 셀 수(따라 흐름 · 표만).
for (let gi = 1; gi < grp.length; gi++) {
  const Lz = grp[gi - 1], Rz = grp[gi], sx = K0[Rz].ux;   // 경계 = 묶음 열 sx-1 | sx
  let cross = 0, broken = 0, near = 0, landPairs = 0;
  for (let y = 0; y < UH; y++) {
    for (const x of [sx - 1, sx]) {
      const u = y * UW + x; if (!UB.mask[u]) continue; near++;
      const d = UB.F.down[u]; if (d < 0) continue; const dx = d % UW;
      if ((x < sx) !== (dx < sx)) { cross++; if (!UB.mask[d] && !UB.water[d]) broken++; }
    }
    if (UK[y * UW + sx - 1] === 1 && UK[y * UW + sx] === 1) landPairs++;
  }
  out.seams.push({ west: Lz, east: Rz, landPairs, cross, broken, nearCells: near });
  say(`경계 ${Lz} | ${Rz}: 맞닿은 뭍 칸 쌍 ${landPairs} · 경계를 건너는 개울 흐름 ${cross} · 끊김 ${broken} · 경계 두 열 안 개울 셀 ${near}`);
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
if (CHECK) { say(bad ? `★파일이 지형보다 낡았다 — ${bad}존 · node scripts/bake-streams.js` : '파일 전부 지형과 같다 ✓'); process.exit(bad ? 1 : 0); }
