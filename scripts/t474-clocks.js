#!/usr/bin/env node
// === scripts/t474-clocks.js — T474 ① **네 시계 표**: 같은 두 마을 사이를 몸·캐러밴·소문·행군·도적 토벌대가 각각 며칠에 가나 ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★무엇을 재나 [지시 T474 ①]
//   한반도 실지도(시딩 = 존과 같은 `pickSeedVillages` · 거리 = 존과 같은 교역 거리행렬 `computeAndInjectDistMatrix`
//   — 지형 BFS · 코스 격자 4셀 · **다리 포함**(존 설정 `bridges` → `isBridgeLocal`))에서 쌍 셋을 고른다:
//     가까운 쌍(유한 최소) · 먼 쌍(유한 최대) · 다리 건너는 쌍(다리를 빼면 못 닿거나 5 % 넘게 멀어지는 쌍의 가운데).
//   그 쌍마다 각 시계가 내는 **날 수**와 그 시계의 **km/일**(시계마다 **제 코드가 쓰는 거리**로 — 캐러밴·소문은 길, 행군·토벌은 직선):
//     몸      — move-model 표 `baseSpeed`(존 `MOVE_SPEED` 64px/s = 2m/s) × 게임일(`WORLD.dayLengthMs` 1,440s) ÷ 칸(32px)
//               = 2,880칸/일(연속 평보 · 전쟁실험실 `L_WALK × L_MINDAY` 와 같은 식) · 참고로 주민 평보 배수(`followNpcPath` 기본) · 낮 몫(`dayPhaseRatio`)
//     캐러밴  — econ `travelDaysForDistance`(= max(1, round(거리 ÷ `CARAVAN_DAY_SPEED`))) · 거리는 econ 좌표(셀×2.5)
//               · **존 캐러밴 몸은 이 날 수에 맞춰 걷는다**(`villages.js` `nomPxMs` — 몸이 시계를 따른다)
//     소문    — `server/rumor.js` 도달 시각표(캐러밴 시계의 거울 · 마을을 징검다리로 건넌다 — Dijkstra)
//     행군    — `sim/war-core.js` `WAR_MARCH` 칸/일 · `max(1, ceil(직선/WAR_MARCH))`
//     도적 토벌대 — `server/bandits.js` `eta = max(1, ceil(직선/240))`(내보내지 않는 글자 — **소스에서 읽는다**)
//   ★수는 전부 정본에서 읽는다(사본 0): 캐러밴 시계·유도 팔(`caravanWalkPerDay`)·셀당 econ 단위는 econ 이 내보낸 값,
//     몸은 move-model 표, 하루·칸은 WORLD, 행군은 war-core, 소문은 rumor CFG, 토벌·주민 평보 배수는 제 소스 글자.
//
// 실행: node scripts/t474-clocks.js [out.json]      (지형만 읽는다 — 실서버 부팅·DB 없음 · 약 1~3분)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const OUT = process.argv[2] || '/tmp/t474/clocks.json';

const _log = console.log;
let quiet = true;
console.log = (...a) => { if (!quiet) _log(...a); };
console.warn = () => {};
const { ZONES, WORLD } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const MM = R('public/move-model');
const Rumor = R('server/rumor');
const WarCore = R('sim/war-core');
const P = R('server/villages').__labProbe;
quiet = false; console.log = _log;

// ── 시계의 수(정본에서 읽는다 · 새 수 0) ─────────────────────────────────────
const SRC = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ZS = SRC('server/zone.js'), BS = SRC('server/bandits.js'), VS = SRC('server/villages.js');
const zoneMove = +((ZS.match(/^const MOVE_SPEED = (\d+(?:\.\d+)?);/m) || [])[1]);
const npcWalk = +((ZS.match(/const speed = MOVE_SPEED \* \(speedMult \|\| ([\d.]+)\);/) || [])[1]);
const BANDIT = +((BS.match(/eta: day \+ Math\.max\(1, Math\.ceil\(bd \/ (\d+)\)\)/) || [])[1]);
const INFO = +((VS.match(/picker: 'rational', infoRange: (\d+), raidPer100/) || [])[1]);   // 5,000 econ — 존 econ 세계의 정보 반경(교역 상대는 이 안만 · `economy-sim-v2` `dist > infoR` 면 건너뜀)
const MOVE = MM.DEFAULTS.baseSpeed;                    // 64 px/s — 존 `MOVE_SPEED` 가 이 표의 baseSpeed 로 간다
const DAY_S = WORLD.dayLengthMs / 1000;                // 1,440 s — 게임일(T368 자) = 존이 econ 을 하루 한 번 굴리는 길이
const TILE = WORLD.tileSize;                           // 32 px/칸(1칸 = 1m)
const BODY_CELLS = MOVE / TILE * DAY_S;                // 2,880 칸/일(연속)
const DAYLIGHT = WORLD.dayPhaseRatio;                  // 0.7 — 참고(낮 몫)
const MARCH = WarCore.WAR_MARCH;                       // 1,440 칸/일
const EPC = econV2.ECON_PER_CELL;                      // 2.5 — econ 좌표 = 셀×2.5(호스트 규약의 econ 쪽 거울)
const CAR = econV2.CARAVAN_DAY_SPEED;                  // 500 econ/일(끔) — 이 판의 캐러밴 시계
const WALK = econV2.caravanWalkPerDay();               // 7,200 econ/일 — 유도 팔(몸 하루 걸음)
const RSPEED = Rumor.CFG.SPEED;                        // 500 — 소문 거울
const tdd = econV2.travelDaysForDistance;              // 캐러밴 시계(정본 함수)
const walkDays = (d) => Math.max(1, Math.round(d / WALK));   // 유도 팔의 날 수 — 켬이면 `tdd` 가 내는 그 식(⑱ 이 켠 자식에서 대조)
if (!(zoneMove === MOVE && npcWalk > 0 && BANDIT > 0 && INFO > 0 && CAR === econV2.NPC_SPEED && Math.abs(WALK - BODY_CELLS * EPC) < 1e-9)) {
  _log(`✗ 전제 실패 — 존 MOVE_SPEED ${zoneMove} · 표 ${MOVE} · 주민 평보 ${npcWalk} · 토벌 ${BANDIT} · 시계 ${CAR}/${econV2.NPC_SPEED} · 유도 ${WALK} vs ${BODY_CELLS * EPC}`);
  process.exit(2);
}

const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWater = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRock = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isBlocked = (x, y) => { if (!_in(x, y)) return true; return isRock(x, y) || isWater(x, y); };
// 다리 — 존과 같은 표(`ZONE.bridges` flat [cx,cy,…] → zone.js `BRIDGE_CELLS`)
const BR = new Set(); { const bl = ZONE.bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) BR.add(bl[i] + ',' + bl[i + 1]); }
const isBridgeLocal = (x, y) => BR.has(Math.floor(x / SZ) + ',' + Math.floor(y / SZ));
const taBr = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: isBlocked, isWaterTileLocal: isWater, isBridgeLocal });
const taNo = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: isBlocked, isWaterTileLocal: isWater });

const hard = T.getZoneVillages(Z) || [];
quiet = true;
const picked = P.pickSeedVillages(hard, taBr, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
quiet = false;
// 마을 중심 = 존·t17 과 같은 `findOpenCenter`(econ 좌표 = 그 칸 × 2.5)
const cells = [];
for (const hv of picked) { const c = P.findOpenCenter(taBr, Math.round(hv.x / SZ), Math.round(hv.y / SZ)); if (c) cells.push({ name: hv.name || hv.id, cx: c.ccx, cy: c.ccy }); }
const N = cells.length;
_log(`=== T474 네 시계 — ${Z} · 마을 ${N}곳 · 다리 셀 ${BR.size} ===`);
const mkWorld = () => ({ villages: cells.map((c) => ({ name: c.name, coord: { x: c.cx * EPC, y: c.cy * EPC } })) });
const mat = (ta, tag) => {
  const w = mkWorld();
  P._distProbe.setup(ta, ZONE, w, econ);
  const t0 = Date.now(); quiet = true; P._distProbe.compute('t474-' + tag); quiet = false;
  _log(`  거리행렬(${tag}) ${Date.now() - t0}ms`);
  return w._distMatrix;
};
// ⚠거리행렬의 코스 격자 메모(`state._distBlk`)는 **호출 사이에 남는다**(villages.js 배치 12 — 서버 성능 규약).
//   한 프로세스에서 다리 포함 → 다리 뺌을 연달아 재면 둘째가 첫째의 "다리로 열림"을 물려받는다(실측: 두 행렬 비트 동일).
//   ⇒ 다리 뺀 행렬은 **새 프로세스**가 잰다(`--nobridge` — 같은 시딩 · 같은 칸 · 메모만 새것).
if (process.argv[2] === '--nobridge') {
  const MN0 = mat(taNo, '다리 뺌');
  fs.writeFileSync(process.argv[3], JSON.stringify(MN0.map((r) => r.map((d) => (isFinite(d) ? d : -1)))));
  process.exit(0);
}
const MB = mat(taBr, '다리 포함');
const MN = (() => {
  const tmp = path.join(require('os').tmpdir(), `t474-nobridge-${process.pid}.json`);
  const out = require('child_process').execFileSync(process.execPath, [__filename, '--nobridge', tmp], { maxBuffer: 1 << 26 }).toString();
  for (const ln of out.split('\n')) if (/거리행렬|BFS/.test(ln)) _log(ln);
  const m = JSON.parse(fs.readFileSync(tmp, 'utf8')).map((r) => r.map((d) => (d < 0 ? Infinity : d)));
  fs.unlinkSync(tmp);
  return m;
})();

const geoOf = (M) => ({ vids: () => cells.map((_, i) => i), dist: (a, b) => M[a][b] });
const rumorAt = (M, speed) => {   // 소문 도달표 — 정본 그래프를 그 속도로 한 벌(끝나면 되돌린다)
  const s0 = Rumor.CFG.SPEED; Rumor.CFG.SPEED = speed;
  const g = Rumor.createGraph(geoOf(M));
  const rows = cells.map((_, i) => cells.map((__, j) => g.delayBetween(i, j)));
  const hops = cells.map((_, i) => cells.map((__, j) => g.hopsBetween(i, j)));
  Rumor.CFG.SPEED = s0;
  return { rows, hops };
};
const pairs = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  const dB = MB[i][j], dN = MN[i][j];
  if (!isFinite(dB)) continue;
  const eu = Math.hypot(cells[i].cx - cells[j].cx, cells[i].cy - cells[j].cy);
  pairs.push({ i, j, dB, dN, eu, bridge: !isFinite(dN) || dN > dB * 1.05 });
}
pairs.sort((a, b) => a.dB - b.dB);
// ★교역이 서는 쌍 = 정보 반경 안(econ 은 `dist > infoRange` 인 상대에 캐러밴을 안 띄운다 — 그 밖의 날 수는 시계가 내는 값일 뿐)
const inR = pairs.filter((p) => p.dB <= INFO);
const near = pairs[0], far = pairs[pairs.length - 1], farTrade = inR[inR.length - 1];
const brs = pairs.filter((p) => p.bridge), brsIn = inR.filter((p) => p.bridge);
const brMid = brsIn.length ? brsIn[Math.floor(brsIn.length / 2)] : (brs.length ? brs[Math.floor(brs.length / 2)] : null);
_log(`  유한 쌍 ${pairs.length}/${N * (N - 1) / 2} · 다리 쌍 ${brs.length}(다리를 빼면 못 닿음 ${brs.filter((p) => !isFinite(p.dN)).length} · 5 % 넘게 멀어짐 ${brs.filter((p) => isFinite(p.dN)).length})`);
_log(`  교역이 서는 쌍(정보 반경 ${INFO} econ = ${INFO / EPC / 1000}km 안) ${inR.length} · 그중 다리 쌍 ${brsIn.length}`);

const RB = rumorAt(MB, RSPEED), RW = rumorAt(MB, WALK);
// 존 캐러밴 몸이 내야 하는 속도(몸 걸음의 몇 배) — `villages.js` 페이싱: 길 px ÷ (날 수 × 하루 ms)(상한 = 명목 × 4 · MOVE_SPEED 상한 없음)
//   길 px 는 거리행렬 × (칸 px ÷ 셀당 econ) — A* 실경로는 이보다 조금 다르다(표는 행렬 기준)
const bodyMul = (d, days) => (d / EPC * TILE) / (days * DAY_S) / MOVE;
const row = (tag, p) => {
  if (!p) return null;
  const pathCells = p.dB / EPC;
  const cd = tdd(p.dB), wd = walkDays(p.dB);
  return {
    tag, a: cells[p.i].name, b: cells[p.j].name,
    pathKm: +(pathCells / 1000).toFixed(2), euclidKm: +(p.eu / 1000).toFixed(2), detour: +(pathCells / Math.max(1, p.eu)).toFixed(2),
    noBridgeKm: isFinite(p.dN) ? +(p.dN / EPC / 1000).toFixed(2) : null,
    body: +(pathCells / BODY_CELLS).toFixed(2),                                          // 연속 평보(날 · 소수 — 몸은 날 단위로 끊기지 않는다)
    bodyNpcDay: +(pathCells / (BODY_CELLS * npcWalk * DAYLIGHT)).toFixed(2),             // 참고 — 주민 평보 × 낮만
    caravan: cd, rumor: RB.rows[p.i][p.j], rumorHops: RB.hops[p.i][p.j],
    march: Math.max(1, Math.ceil(p.eu / MARCH)), bandit: Math.max(1, Math.ceil(p.eu / BANDIT)),
    walkArm: wd, rumorWalkArm: RW.rows[p.i][p.j], rumorWalkHops: RW.hops[p.i][p.j],
    bodyMulOff: +bodyMul(p.dB, cd).toFixed(3), bodyMulWalk: +bodyMul(p.dB, wd).toFixed(3),
  };
};
const rows = [row('가까운 쌍', near), row('다리 건너는 쌍(교역 반경 안)', brMid), row('먼 교역 쌍(정보 반경 안 최대)', farTrade), row('먼 쌍(전체 최대 · 교역 밖)', far)].filter(Boolean);
const kmDay = {
  body: +(BODY_CELLS / 1000).toFixed(3), bodyNpcDay: +(BODY_CELLS * npcWalk * DAYLIGHT / 1000).toFixed(3),
  march: +(MARCH / 1000).toFixed(3), bandit: +(BANDIT / 1000).toFixed(3),
  caravan: +(CAR / EPC / 1000).toFixed(3), rumor: +(RSPEED / EPC / 1000).toFixed(3), walkArm: +(WALK / EPC / 1000).toFixed(3),
};
const ratio = { bodyOverCaravan: +(BODY_CELLS / (CAR / EPC)).toFixed(2), marchOverCaravan: +(MARCH / (CAR / EPC)).toFixed(2), banditOverCaravan: +(BANDIT / (CAR / EPC)).toFixed(2),
  bodyOverMarch: +(BODY_CELLS / MARCH).toFixed(2), bodyOverBandit: +(BODY_CELLS / BANDIT).toFixed(2), rumorOverCaravan: +(RSPEED / CAR).toFixed(2) };
// 전수(유한 쌍) — 끔(500) ↔ 유도 팔(7,200)
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const dist5 = (a) => ({ p10: q(a, 0.1), p50: q(a, 0.5), p90: q(a, 0.9), max: q(a, 1) });
const r3 = (x) => +x.toFixed(3);
const allOff = pairs.map((p) => tdd(p.dB)), allWalk = pairs.map((p) => walkDays(p.dB));
const mulOff = pairs.map((p) => r3(bodyMul(p.dB, tdd(p.dB)))), mulWalk = pairs.map((p) => r3(bodyMul(p.dB, walkDays(p.dB))));
const inOff = inR.map((p) => tdd(p.dB)), inWalk = inR.map((p) => walkDays(p.dB));
const inMulOff = inR.map((p) => r3(bodyMul(p.dB, tdd(p.dB)))), inMulWalk = inR.map((p) => r3(bodyMul(p.dB, walkDays(p.dB))));
// 재routing 뒤 귀환 구간 — 새 목적지는 지금 자리에서 정보 반경 안 ⇒ 집까지는 최대 2 × 반경(삼각부등식) · 그 구간이 켬에서 몸보다 빠를 수 있는 유일한 자리
const retMax = 2 * INFO, retWalkMul = r3(bodyMul(retMax, walkDays(retMax)));
// 소문 도달(출발 마을마다): 닿는 마을 전부에 닿는 날 · 한 주(7일) 안에 닿는 마을 수 · 한 달(30일)
const reach = (RR) => {
  const allDay = [], in7 = [], in30 = [], med = [];
  for (let i = 0; i < N; i++) {
    const ds = RR.rows[i].filter((d, j) => j !== i && isFinite(d));
    if (!ds.length) continue;
    allDay.push(Math.max(...ds)); in7.push(ds.filter((d) => d <= 7).length); in30.push(ds.filter((d) => d <= 30).length);
    med.push(q(ds, 0.5));
  }
  return { allDay: dist5(allDay), in7: dist5(in7), in30: dist5(in30), medDelay: dist5(med) };
};
const res = { at: new Date().toISOString(), zone: Z, N, bridges: BR.size, finitePairs: pairs.length, bridgePairs: brs.length,
  consts: { MOVE, zoneMove, DAY_S, TILE, BODY_CELLS, npcWalk, DAYLIGHT, MARCH, BANDIT, EPC, CAR, WALK, RSPEED },
  econDay: { dayLengthMs: WORLD.dayLengthMs, realSecPerGameMin: WORLD.dayLengthMs / 1000 / 1440, where: 'server/villages.js state.dayMs = VILLAGE_DAY_MS(테스트 전용) || WORLD.dayLengthMs · 존이 게임일 경계마다 tickWorldV2 한 번' },
  kmDay, ratio, rows,
  infoRange: { econ: INFO, km: INFO / EPC / 1000, tradePairs: inR.length, bridgeTradePairs: brsIn.length },
  caravanDays: { off: dist5(allOff), walk: dist5(allWalk), oneDayShareWalk: +(allWalk.filter((d) => d === 1).length / allWalk.length).toFixed(3),
    tradeOff: dist5(inOff), tradeWalk: dist5(inWalk), tradeOneDayShareWalk: +(inWalk.filter((d) => d === 1).length / Math.max(1, inWalk.length)).toFixed(3) },
  bodyMul: { off: dist5(mulOff), walk: dist5(mulWalk), walkOverBody: +(mulWalk.filter((m) => m > 1 + 1e-9).length / mulWalk.length).toFixed(3),
    tradeOff: dist5(inMulOff), tradeWalk: dist5(inMulWalk), tradeWalkOverBody: +(inMulWalk.filter((m) => m > 1 + 1e-9).length / Math.max(1, inMulWalk.length)).toFixed(3),
    rerouteReturnMax: { econ: retMax, walkDays: walkDays(retMax), walkMul: retWalkMul } },
  rumorReach: { off: reach(RB), walk: reach(RW) },
  pathKm: { p10: +(q(pairs.map((p) => p.dB), 0.1) / EPC / 1000).toFixed(2), p50: +(q(pairs.map((p) => p.dB), 0.5) / EPC / 1000).toFixed(2), max: +(pairs[pairs.length - 1].dB / EPC / 1000).toFixed(2) } };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
_log(`\n  km/일: 몸 ${kmDay.body}(주민 평보 ${npcWalk}·낮만 ${DAYLIGHT} → ${kmDay.bodyNpcDay}) · 행군 ${kmDay.march} · 도적 토벌 ${kmDay.bandit} · 캐러밴 ${kmDay.caravan} · 소문 ${kmDay.rumor}(홉당) · 유도 팔 ${kmDay.walkArm}`);
_log(`  배수: 몸/캐러밴 ×${ratio.bodyOverCaravan} · 행군/캐러밴 ×${ratio.marchOverCaravan} · 토벌/캐러밴 ×${ratio.banditOverCaravan} · 몸/행군 ×${ratio.bodyOverMarch} · 몸/토벌 ×${ratio.bodyOverBandit}`);
for (const r of rows) _log(`  ${r.tag}: ${r.a} ↔ ${r.b} · 길 ${r.pathKm}km(직선 ${r.euclidKm} · 우회 ×${r.detour} · 다리 빼면 ${r.noBridgeKm == null ? '못 닿음' : r.noBridgeKm + 'km'}) · 몸 ${r.body}일(주민·낮 ${r.bodyNpcDay}) · 캐러밴 ${r.caravan}일 · 소문 ${r.rumor}일(${r.rumorHops}홉) · 행군 ${r.march}일 · 토벌 ${r.bandit}일 · 유도 팔 캐러밴 ${r.walkArm}일 · 소문 ${r.rumorWalkArm}일(${r.rumorWalkHops}홉) · 존 캐러밴 몸 ×${r.bodyMulOff} → ×${r.bodyMulWalk}`);
_log(`  캐러밴 날 수 전수(유한 ${pairs.length}쌍): 끔 ${JSON.stringify(res.caravanDays.off)} ↔ 유도 팔 ${JSON.stringify(res.caravanDays.walk)} · 하루짜리 ${res.caravanDays.oneDayShareWalk}`);
_log(`  존 캐러밴 몸 속도(몸 걸음의 배 · 전 쌍): 끔 ${JSON.stringify(res.bodyMul.off)} ↔ 유도 팔 ${JSON.stringify(res.bodyMul.walk)} · 몸보다 빠른 쌍 ${res.bodyMul.walkOverBody}`);
_log(`  ★교역이 서는 쌍(${inR.length}): 캐러밴 날 끔 ${JSON.stringify(res.caravanDays.tradeOff)} ↔ 유도 팔 ${JSON.stringify(res.caravanDays.tradeWalk)}(하루 ${res.caravanDays.tradeOneDayShareWalk}) · 몸 속도 끔 ${JSON.stringify(res.bodyMul.tradeOff)} ↔ 유도 팔 ${JSON.stringify(res.bodyMul.tradeWalk)} · 몸보다 빠른 쌍 ${res.bodyMul.tradeWalkOverBody}`);
_log(`  재routing 뒤 귀환 구간 최대 ${retMax} econ → 유도 팔 ${walkDays(retMax)}일 · 몸의 ×${retWalkMul}(몸보다 빠를 수 있는 유일한 자리)`);
_log(`  소문 도달(출발 마을마다): 끔 전부 ${JSON.stringify(res.rumorReach.off.allDay)} · 7일 안 ${JSON.stringify(res.rumorReach.off.in7)} ↔ 유도 팔 전부 ${JSON.stringify(res.rumorReach.walk.allDay)} · 7일 안 ${JSON.stringify(res.rumorReach.walk.in7)}`);
_log(`  → ${OUT}`);
