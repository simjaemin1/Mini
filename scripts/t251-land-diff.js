#!/usr/bin/env node
// === scripts/t251-land-diff.js — 세 벌의 술어가 세우는 51마을 땅 값을 전수 diff (계측기 · 러너 밖) ===
//
// ★왜 [지시 T251 · T247 §0ⓐ]
//   헤드리스 자(`Villages.init` = 제품 경로)는 `land.fertility` 중앙 **0.42**, 기준선 자(`t176-ab`)는 **0.99** 다.
//   숲(0.57)·사냥터(0.52)는 같다. 둘 중 하나는 제품이 아니다 — 이 자가 **코드로** 가른다.
//
// ★답(§0ⓐ): 땅을 세우는 **두 줄은 바이트 동일**하다(`villages.js:1147~1156` ≡ `t176-ab.js:239~240`).
//   갈리는 자리는 그 두 줄이 아니라 **그 위 한 줄** — `makeTerrainAdapter(terrain, ZONE, deps)` 의 `deps` 다.
//   제품은 `zone.js:2651` 에서 zone.js 가 만든 술어를 넘긴다. 두 계측기는 각자 다른 것을 넘겼다.
//
// ★이 파일에 산수는 없다. 제품 시딩 줄(`villages.js:1142~1156`)을 같은 순서로 부를 뿐이다(사본 0).
//   같은 프로세스 안에서 `deps` 만 갈아 끼우고 51마을 전 열을 맞대 본다.
//
//   C = 제품 정본  — `zone.js:570~650` (해안선 띠 + 강·호수 · 바위 **타일 중심** · 다리 836칸 통행)
//   A = 기준선 자  — `scripts/t176-ab.js:217~226` (강·호수만 · 바위 **픽셀 그대로** · 다리 없음)
//   B = T232 헤드리스 자 — `isTerrainBlockedLocal: () => false` (물도 바위도 없다)
'use strict';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.ENABLE_VILLAGES = '1';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const { ZONES } = R('server/zone-config');
const Z = 'hanbando', ZONE = ZONES[Z];
const Villages = R('server/villages');
const P = Villages.__labProbe;
const VL = R('server/village-layout');
const T = R('server/terrain');
const SZ = P.SZ;
P.setZoneId(Z);

// ── C: 제품 정본 술어(`scripts/zone-preds.js` 한 벌 — 자가 다시 적지 않는다) ──────────────
const ZP = R('scripts/zone-preds').makeZonePreds(Z);
const DEPS_C = { isTerrainBlockedLocal: ZP.isTerrainBlockedLocal, isWaterTileLocal: ZP.isWaterTileLocal,
                 isBridgeLocal: ZP.isBridgeTileLocal };

// ── A: 기준선 자가 넘기는 것(`scripts/t176-ab.js:217~226` 그대로) ─────────────────────────
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const aWater = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch (e) { return false; }
};
const aRock = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch (e) { return false; } };
const DEPS_A = { isTerrainBlockedLocal: (x, y) => (!_inZone(x, y)) ? true : (aRock(x, y) || aWater(x, y)),
                 isWaterTileLocal: aWater };

// ── B: T232 헤드리스 자가 넘기던 것 ───────────────────────────────────────────────────────
const DEPS_B = { isTerrainBlockedLocal: () => false,
                 isWaterTileLocal: (x, y) => !!T.isWaterCellLocal(Z, Math.floor(x / 32), Math.floor(y / 32)) };

const KEYS = ['fertility', 'wood', 'game', 'stone', 'water', 'size', 'woodSustain', 'terr'];

// ── 한 벌로 51마을을 세운다 — 제품 줄(`villages.js:1142~1156`)을 그대로 부른다 ───────────
function build(deps) {
  const _log = console.log, _warn = console.warn; console.log = () => {}; console.warn = () => {};
  const ta = P.makeTerrainAdapter(T, ZONE, deps);
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const rows = [];
  let noCenter = 0, genFail = 0;
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) { noCenter++; continue; }
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VL.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); }
    catch (e) { genFail++; continue; }
    const lp = P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout);
    const r = { name: hv.name, ccx: c.ccx, ccy: c.ccy, terr: (layout.territory || []).length,
                ff: !!(ta.fertField && ta.fertField()) };
    for (const k of KEYS) if (k !== 'terr') r[k] = lp[k] == null ? null : lp[k];
    rows.push(r);
  }
  console.log = _log; console.warn = _warn;
  return { picked: picked.length, noCenter, genFail, rows };
}

const md = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
const col = (rows, k) => rows.map((r) => r[k]).filter((x) => x != null);
const f2 = (v) => (v == null ? '—' : (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v)));

const C = build(DEPS_C), A = build(DEPS_A), B = build(DEPS_B);
const SET = [['C 제품정본', C], ['A 기준선자', A], ['B T232헤드리스', B]];

console.log(`\n=== T251 ⓑ 51마을 땅 값 전수 diff — 세 벌의 술어 ===`);
console.log(`  해안선 물 띠 ${ZP.waterTiles}타일 · 다리 ${ZP.bridgeCells}셀 (C 만 본다)`);
for (const [n, S] of SET) console.log(`  ${n}: 선별 ${S.picked} → 세움 ${S.rows.length} (중심없음 ${S.noCenter} · generate실패 ${S.genFail}) · fertField ${S.rows.filter((r) => r.ff).length}곳`);

console.log(`\n  | 키 | C 중앙 | A 중앙 | B 중앙 | C 최소~최대 | A≠C 마을 | B≠C 마을 |`);
console.log(`  |---|---|---|---|---|---|---|`);
const byA = new Map(A.rows.map((r) => [r.name, r])), byB = new Map(B.rows.map((r) => [r.name, r]));
for (const k of KEYS) {
  const cc = col(C.rows, k);
  let dA = 0, dB = 0, nA = 0, nB = 0;
  for (const rc of C.rows) {
    const ra = byA.get(rc.name), rb = byB.get(rc.name);
    if (ra) { nA++; if (ra[k] !== rc[k]) dA++; }
    if (rb) { nB++; if (rb[k] !== rc[k]) dB++; }
  }
  console.log(`  | \`${k}\` | ${f2(md(cc))} | ${f2(md(col(A.rows, k)))} | ${f2(md(col(B.rows, k)))} | ${f2(Math.min(...cc))}~${f2(Math.max(...cc))} | **${dA}/${nA}** | **${dB}/${nB}** |`);
}

console.log(`\n  마을별 전수 — C / A / B (세 벌이 같으면 '='):`);
console.log(`  | # | 마을 | C 좌표 | ${KEYS.join(' | ')} |`);
console.log(`  |---|---|---|${KEYS.map(() => '---').join('|')}|`);
let i = 0, same3 = 0, sameCA = 0;
for (const rc of C.rows) {
  const ra = byA.get(rc.name), rb = byB.get(rc.name); i++;
  const cells = KEYS.map((k) => {
    const a = ra ? ra[k] : undefined, b = rb ? rb[k] : undefined;
    if (a === rc[k] && b === rc[k]) return '=';
    return `${f2(rc[k])} / ${ra ? (a === rc[k] ? '=' : f2(a)) : '✗'} / ${rb ? (b === rc[k] ? '=' : f2(b)) : '✗'}`;
  });
  if (cells.every((c2) => c2 === '=')) same3++;
  if (ra && KEYS.every((k) => ra[k] === rc[k])) sameCA++;
  console.log(`  | ${i} | ${rc.name} | ${rc.ccx},${rc.ccy} | ${cells.join(' | ')} |`);
}
console.log(`\n  세 벌 전 열 동일: **${same3}/${C.rows.length}** · C=A 전 열 동일: **${sameCA}/${C.rows.length}**`);
const cnt = (rows, f) => rows.filter(f).length;
for (const [n, S] of SET) {
  console.log(`  ${n}: fert 중앙 ${f2(md(col(S.rows, 'fertility')))} · stone 중앙 ${f2(md(col(S.rows, 'stone')))} · fert ≤ 0.50 인 마을 **${cnt(S.rows, (r) => r.fertility != null && r.fertility <= 0.5)}곳**`);
}
if (process.env.T251_JSON) require('fs').writeFileSync(process.env.T251_JSON, JSON.stringify({ C: C.rows, A: A.rows, B: B.rows }));
console.log('');
