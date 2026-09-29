#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T527 ① 표 기계)
// =============================================================================
// T527 ① — 마을이 다리를 **원하는** 자리: 교역 거리행렬이 물 때문에 끊기거나 돌아가는 마을 쌍.
//
//   교역 거리 = 정본 `villages.js computeAndInjectDistMatrix` 그대로(`__labProbe._distProbe` — 코스 격자 · `coarseOpen` · 8방 · 코너 절단 금지).
//   판 넷을 **자식 프로세스**로 잰다(거리행렬의 코스 격자 캐시 `_distBlk` 가 판 사이에 새지 않게 — 프로세스가 곧 캐시 경계):
//     A = 시딩 다리 켬(존 설정 `bridges` · 서버 술어와 같은 뜻: 물 위 다리 칸만 통행)
//     B = 다리 끔(다리가 지금 무엇을 벌고 있나)
//     C = 물 열림(바위만 막힘 — "어디든 다리를 놓을 수 있다면")
//     D = A + 착공 후보(존 설정 `bridgeSites` — 계획기 v2 가 낸 셀 그대로) 전부 완공
//   쌍 분류(새 수 0 — 문턱은 정본의 것):
//     · 물이 끊은 쌍 = A 무한 ∧ C 유한
//     · 물이 교역 창 밖으로 민 쌍 = A 유한 ∧ A > capA ∧ C ≤ capA (cap = 행렬 최대 유한거리 × 0.5 — v2 top-K 절대 상한 `economy-sim-v2`)
//     · 물로 우회하는 쌍 = A 유한 ∧ A ÷ C > 1.02(거리행렬 로그의 "우회쌍" 문턱 그대로)
//   마을 = 자(`t176-ab`)와 같은 시딩(`pickSeedVillages` + `findOpenCenter`).
//
// 쓰는 법: node scripts/t527-bridge-want.js <zoneId> [출력.json]     (자식: T527_WANT_CHILD=A|B|C|D)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t527w-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'hanbando';
const OUT = process.argv[3] || '';

function setup(mode) {
  const { ZONES, findZoneAt } = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const P = R('server/villages').__labProbe;
  const ZONE = ZONES[Z], SZ = P.SZ;
  P.setZoneId(Z);
  const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const _COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : (Z !== 'hanbando');
  const BAND = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt,
    Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
  const isWaterTileLocal = (x, y) => { if (!_inZone(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (BAND && BAND.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  // 다리 칸 — A·D 만(서버 `isBridgeTileLocal` 과 같은 키 · 셀 좌표)
  const br = new Set();
  const addFlat = (f) => { for (let i = 0; i + 1 < (f || []).length; i += 2) br.add(f[i] + '_' + f[i + 1]); };
  if (mode === 'A' || mode === 'D') addFlat(ZONE.bridges);
  if (mode === 'D') for (const s of (ZONE.bridgeSites || [])) addFlat(s.cells);
  const isBridgeLocal = (x, y) => br.has(Math.floor(x / SZ) + '_' + Math.floor(y / SZ));
  const blockedFn = mode === 'C'
    ? (x, y) => !_inZone(x, y) || isRockTileLocal(x, y)
    : (x, y) => !_inZone(x, y) || isRockTileLocal(x, y) || isWaterTileLocal(x, y);
  const deps = { isTerrainBlockedLocal: blockedFn, isWaterTileLocal };
  if (br.size) deps.isBridgeLocal = isBridgeLocal;
  const ta = P.makeTerrainAdapter(T, ZONE, deps);
  return { T, P, ta, ZONE, SZ, isWaterTileLocal, isRockTileLocal, brN: br.size };
}

if (process.env.T527_WANT_CHILD) {
  const mode = process.env.T527_WANT_CHILD;
  const { T, P, ta, ZONE, SZ, brN } = setup(mode);
  const _log = console.log; const logs = []; console.log = (...a) => logs.push(a.join(' '));
  // 마을 — 자(`t176-ab`)와 같은 시딩. 다리 판(A·B·D)과 무관하게 **같은 자리**여야 하므로 시딩은 늘 판 B 의 땅(다리 없음)으로 한다 ⇒ 자식마다 따로 세운다
  const { ta: taSeed } = mode === 'B' ? { ta } : setup('B');
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, taSeed, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const vs = [];
  for (const hv of picked) { const c = P.findOpenCenter(taSeed, Math.round(hv.x / SZ), Math.round(hv.y / SZ)); if (c) vs.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy }); }
  const econ = R('sim/economy-sim');
  const world = { villages: vs.map((v) => ({ name: v.name, coord: { x: v.ccx * 2.5, y: v.ccy * 2.5 } })) };
  P._distProbe.setup(ta, ZONE, world, econ);
  P._distProbe.compute(`T527 ${mode}`);
  console.log = _log;
  const mat = world._distMatrix.map((r) => r.map((d) => (isFinite(d) ? +d.toFixed(2) : null)));
  process.stdout.write('\n@@' + JSON.stringify({ mode, brN, vs, mat, max: world._distMatrixMax, log: logs.filter((l) => /거리행렬/.test(l)) }) + '\n');
  process.exit(0);
}

const run = (m) => {
  const out = execFileSync(process.execPath, [__filename, Z], { env: Object.assign({}, process.env, { T527_WANT_CHILD: m }), maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  return JSON.parse(out.slice(out.lastIndexOf('\n@@') + 3));
};
const t0 = Date.now();
const M = {};
for (const m of ['A', 'B', 'C', 'D']) { M[m] = run(m); console.log(`[${m}] 다리 셀 ${M[m].brN} · ${M[m].log.join(' ')} · ${((Date.now() - t0) / 1000).toFixed(0)}초`); }
const vs = M.A.vs, n = vs.length;
for (const m of ['B', 'C', 'D']) if (JSON.stringify(M[m].vs) !== JSON.stringify(vs)) throw new Error(`판 ${m} 의 마을 자리가 A 와 다르다`);
const capOf = (m) => (M[m].max != null ? M[m].max : Infinity) * 0.5;
const capA = capOf('A');
const pairs = [];
const cnt = { A_inf: 0, B_inf: 0, C_inf: 0, D_inf: 0, cut: 0, pushed: 0, detour: 0, A_in: 0, B_in: 0, D_in: 0, bridgeSaves: 0, siteFixes: 0 };
for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
  const a = M.A.mat[i][j], b = M.B.mat[i][j], c = M.C.mat[i][j], d = M.D.mat[i][j];
  if (a == null) cnt.A_inf++; if (b == null) cnt.B_inf++; if (c == null) cnt.C_inf++; if (d == null) cnt.D_inf++;
  if (a != null && a <= capA) cnt.A_in++;
  if (b != null && b <= capA) cnt.B_in++;
  if (d != null && d <= capA) cnt.D_in++;
  if (b == null && a != null) cnt.bridgeSaves++;
  const cut = a == null && c != null;
  const pushed = a != null && a > capA && c != null && c <= capA;
  const detour = a != null && c != null && c > 0 && a / c > 1.02;
  if (cut) cnt.cut++; if (pushed) cnt.pushed++; if (detour) cnt.detour++;
  if ((a == null && d != null) || (a != null && d != null && d < a - 1e-6)) cnt.siteFixes++;
  if (cut || pushed || detour) pairs.push({ a: vs[i].name, b: vs[j].name, A: a, B: b, C: c, D: d, ratio: (a != null && c) ? +(a / c).toFixed(3) : null, cut, pushed, detour });
}
pairs.sort((x, y) => (y.cut - x.cut) || (y.pushed - x.pushed) || ((y.ratio || 0) - (x.ratio || 0)));
const res = { zone: Z, n, pairsTotal: n * (n - 1) / 2, capA: +capA.toFixed(2), brA: M.A.brN, brD: M.D.brN, cnt, pairs, vs, ms: Date.now() - t0 };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(`[t527 ①] ${Z} · 마을 ${n} · 쌍 ${res.pairsTotal} · 창 ${res.capA} · ${JSON.stringify(cnt)}`);
for (const p of pairs.slice(0, 25)) console.log(`  ${p.a}–${p.b}  A ${p.A} · B ${p.B} · C ${p.C} · D ${p.D} · ×${p.ratio}${p.cut ? ' [끊김]' : ''}${p.pushed ? ' [창 밖]' : ''}`);
process.exit(0);
