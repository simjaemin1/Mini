#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T436 표 기계)
// =============================================================================
// T436 — 게이트의 교역 잠재 · 계수 유도 · 세 존 통과 표.
//
//   ① 존마다 후보 전수: food(게이트 식 · T429 와 같은 옮겨 적기 → 정본 `_land` 와 견준다) · 교역 잠재(정본 `_gateTradePotential` 그대로)
//   ② 계수 유도(한반도): 하한 미달 후보 전부가 통과하는 가장 작은 값 = max((하한 − food) / 교역잠재).
//      교역잠재 0 인 미달 후보가 있으면 "없다"(어떤 계수로도 못 넘는다)고 적는다.
//   ③ 검사: `T436_GATE_TRADE=1` 을 켠 **자식**에서 정본 `pickSeedVillages(…, { seedAll:false, _scoredOut })` 의 `_land > 0` 이
//      이 표의 통과와 같은가(세 존) · 끔이면 T429 표와 같은가 · 코드 상수 `T436_K` 가 유도값과 같은가.
//
// 쓰는 법: node scripts/t436-gate-trade.js <출력.json>          (자식 모드: T436_CHILD=<zone>)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t436-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const R = (p) => require(path.join(__dirname, '..', p));

function setup(Z) {
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
  const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => !_inZone(x, y) || isRockTileLocal(x, y) || isWaterTileLocal(x, y), isWaterTileLocal });
  return { T, P, ta, ZONE, SZ, cands: T.siteCandidates(Z) || [] };
}

if (process.env.T436_CHILD) {
  // 자식: 정본 게이트를 **그대로** 돌려 하한 통과만 뽑아 낸다(켬/끔은 부모가 env 로 준다)
  const Z = process.env.T436_CHILD;
  const { P, ta, cands } = setup(Z);
  const _log = console.log; console.log = () => {};
  const out = [];
  P.pickSeedVillages(cands, ta, { seedAll: false, max: 0, _scoredOut: out });
  console.log = _log;
  process.stdout.write('\n@@' + JSON.stringify({ pass: out.filter((v) => v._land > 0).map((v) => v.name).sort(), K: P.T436_K }) + '\n');
  process.exit(0);
}

const OUT = process.argv[2] || '/tmp/t436/gate.json';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
const FLOOR = +((SRC.match(/const FOOD_FLOOR = ([\d.]+)/) || [])[1]);
const child = (Z, on) => {
  const env = { ...process.env, T436_CHILD: Z };
  if (on) env.T436_GATE_TRADE = '1'; else delete env.T436_GATE_TRADE;
  const s = execFileSync(process.execPath, [__filename], { env, maxBuffer: 64 << 20 }).toString();
  return JSON.parse(s.slice(s.lastIndexOf('\n@@') + 3));
};
const res = { FLOOR, zones: {} };
const _log = console.log; console.log = () => {};
for (const Z of ['hanbando', 'nippon', 'jungwon_n']) {
  const { P, ta, cands, SZ } = setup(Z);
  const foodOf = (hv) => { let lp = null; try { lp = P.extractLandParamsApprox(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ), { territory: [] }); } catch (e) {}
    return lp ? (lp.fertility || 0) * 1.5 + (lp.water || 0) * 1.2 + (lp.game || 0) * 0.7 : 0; };
  const t0 = Date.now();
  const trade = P._gateTradePotential(cands, ta, foodOf, FLOOR);
  res.zones[Z] = { ms: Date.now() - t0, rows: cands.map((hv) => ({ name: hv.name, type: hv.type, food: foodOf(hv), trade: trade.get(hv.name) || 0 })) };
}
console.log = _log;
// ② 계수 유도 — 한반도
const hb = res.zones.hanbando.rows;
const fails = hb.filter((r) => r.food < FLOOR);
const need = fails.map((r) => ({ name: r.name, food: r.food, trade: r.trade, kNeed: r.trade > 0 ? (FLOOR - r.food) / r.trade : Infinity }));
const kRaw = Math.max(...need.map((x) => x.kNeed));
const kStar = isFinite(kRaw) ? Math.ceil(kRaw * 1e6) / 1e6 : kRaw;   // 코드에 적는 값 = 유도값을 소수 여섯째 자리에서 올림(미달 9곳이 부동소수 오차로 떨어지지 않게)
res.derive = { fails: need, passN: hb.length - fails.length, kRaw, kStar, exists: isFinite(kStar) };
// 표: 각 존에서 K* 로 통과
for (const Z of Object.keys(res.zones)) for (const r of res.zones[Z].rows) { r.passOff = r.food >= FLOOR; r.passOn = r.food >= FLOOR || (isFinite(kStar) && r.food + kStar * r.trade >= FLOOR); }
// ③ 정본 대조 — 자식(켬/끔)
res.check = {};
for (const Z of Object.keys(res.zones)) {
  const off = child(Z, false), on = child(Z, true);
  const mine = (k) => res.zones[Z].rows.filter((r) => r[k]).map((r) => r.name).sort();
  res.check[Z] = { offSame: JSON.stringify(off.pass) === JSON.stringify(mine('passOff')), onSame: JSON.stringify(on.pass) === JSON.stringify(mine('passOn')),
    offN: off.pass.length, onN: on.pass.length, codeK: on.K };
}
res.kCodeEqual = Object.values(res.check).every((c) => c.codeK === kStar);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(`[T436] 하한 ${FLOOR} · 한반도 미달 ${fails.length} · 통과 ${res.derive.passN} · 유도 K* = ${kStar} (코드 상수 ${res.check.hanbando.codeK} · 같음 ${res.kCodeEqual})`);
for (const x of need.sort((a, b) => b.kNeed - a.kNeed)) console.log(`  ${x.name.padEnd(6)} food ${x.food.toFixed(3)} · 교역잠재 ${x.trade.toFixed(3)} · 필요 K ${x.kNeed.toFixed(4)}`);
for (const Z of Object.keys(res.zones)) {
  const rows = res.zones[Z].rows, c = res.check[Z];
  console.log(`  ${Z}: 후보 ${rows.length} · 끔 통과 ${rows.filter((r) => r.passOff).length}(정본 ${c.offN} · 같음 ${c.offSame}) · 켬 통과 ${rows.filter((r) => r.passOn).length}(정본 ${c.onN} · 같음 ${c.onSame}) · 교역잠재 ${res.zones[Z].ms}ms`);
}
