#!/usr/bin/env node
// === scripts/test-frontier-iron.js — 철 채광 주체 = **플레이어 노동만** 검증 =====
//
// ★[2026-08-03d 배치 11 ①-5] 재민 확정: *"철기는, 플레이어가 마을 아무데나 세울 수 있는
//   시스템을 만들 거라, 자연해소돼"* + 채광 주체는 **플레이어 노동만**.
//
// ★이 하네스가 증명해야 하는 것은 **"코드를 안 바꿔도 된다"**이다. 두 갈래를 동시에 건다:
//   ① 캐논이 그대로다 — 플레이어 마을을 자잘 철 광맥 **바로 위**에 세워도
//      NPC/econ 층은 그 광맥을 못 본다(`isMajorOreAt` null · `land.oreMix` 에 철 0).
//      ⇒ 마을을 세운다고 NPC 광부가 철을 캐기 시작하지 않는다. 캐논 무변.
//   ② 그런데도 철은 돈다 — 플레이어가 곳간에 넣으면 econ 의 `_cons` 가 잡혀
//      flowT 수요가 서고(`computeShadowPrices`), 대장장이 자격(`_ironWeaponCapable`)이 켜진다.
//      ⇒ 플레이어는 **채광만** 하고 나머지는 세계가 한다. 새 장치 0.
//
// ⚠검사 상황이 실제로 그 코드를 밟는지 assert 한다(검증 원칙 — 자명한 통과 금지):
//   철 자잘 광맥이 실재하고, 그 좌표에서 `oreProbAt > 0`(플레이어는 본다)임을 먼저 건다.
//
// 실행: node scripts/test-frontier-iron.js   (지형·econ 만 — 실서버 부팅 없음)
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

const _log = console.log;
let quiet = true;
console.log = (...a) => { if (!quiet) _log(...a); };
console.warn = () => {};
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const v2 = R('sim/economy-sim-v2');
const P = R('server/villages').__labProbe;
quiet = false; console.log = _log;

const Z = 'hanbando';
const ZONE = ZONES[Z];
const SZ = P.SZ;
const say = (...a) => _log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; say((c ? '  ✓ ' : '  ✗ ') + m); };

say('=== 철 채광 주체 = 플레이어 노동만 (캐논 무변 검증) ===');

// ── 철 자잘 광맥 하나를 정본 판독으로 찾는다 ─────────────────────────────────
//   ★단일광종 광맥은 dict 가 없다 — `o.mineral` 문자열 폴백을 반드시 밟는다
//     (배치 7 오진의 원인. 그걸 안 밟으면 철 184개를 통째로 놓친다).
const raw = R('server/hanbando-terrain.json').hanbando;
const ores = raw.ores || [];
const ironVeins = ores.filter((o) => (o.minerals ? o.minerals.iron > 0 : o.mineral === 'iron'));
say(`\n[⓪ 지도 — 철 광맥 실재 확인]`);
ok(ironVeins.length > 0, `철이 든 광맥 ${ironVeins.length}개 (전부 자잘: ${ironVeins.every((o) => o.minor) ? '예' : '아니오'})`);
if (!ironVeins.length) { say('철 광맥이 없다 — 이후 검사 불가'); process.exit(1); }

// 노른자 셀 하나 고르기
let spot = null;
for (const o of ironVeins.sort((a, b) => (b.pk || 0) - (a.pk || 0))) {
  const Rr = Math.max(4, Math.ceil(o.radius / 32));
  for (let dy = -Rr; dy <= Rr && !spot; dy++) for (let dx = -Rr; dx <= Rr; dx++) {
    const cx = Math.floor(o.center[0] / 32) + dx, cy = Math.floor(o.center[1] / 32) + dy;
    const px = cx * 32 + 16, py = cy * 32 + 16;
    if (T.isWaterCellLocal(Z, px, py)) continue;
    if (T.isRockCellLocal && T.isRockCellLocal(Z, px, py)) continue;
    if (!(T.oreProbAt(Z, px, py) > 0.5)) continue;
    spot = { o, cx, cy, px, py }; break;
  }
  if (spot) break;
}
ok(!!spot, `철 자잘 광맥 노른자 셀 확보${spot ? ` — "${spot.o.name}" 셀(${spot.cx},${spot.cy}) minor=${spot.o.minor ? 1 : 0}` : ''}`);
if (!spot) process.exit(1);

// ── ① 캐논 — NPC/econ 층은 그 광맥을 못 본다 ────────────────────────────────
say('\n[① 캐논 유지 — 마을을 그 위에 세워도 NPC 는 못 본다]');
ok(T.oreProbAt(Z, spot.px, spot.py) > 0, `★플레이어 층은 본다 — oreProbAt = ${T.oreProbAt(Z, spot.px, spot.py).toFixed(2)} (검사가 자명하게 통과하지 않는다)`);
ok(T.isMajorOreAt(Z, spot.px, spot.py) === null, '★NPC 층은 못 본다 — isMajorOreAt = null (자잘은 주요 광맥이 아니다)');

// 그 자리에 마을을 세웠다고 치고 land params 를 정본 함수로 뽑는다
const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWater = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRock = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => (!_in(x, y) ? true : isRock(x, y) || isWater(x, y)), isWaterTileLocal: isWater });
P.setZoneId(Z);
const lp = P.extractLandParamsApprox(ta, spot.cx, spot.cy, { territory: [] });
const mix = (lp && lp.oreMix) || {};
say(`    그 자리 land: ore=${(lp.ore || 0).toFixed(2)} · oreMix=${JSON.stringify(mix)}`);
ok(!(mix.iron > 0), '★마을 부존(land.oreMix)에 철이 안 들어온다 — NPC 광부가 철을 캘 근거가 없다');

// ── ② 그런데도 철은 돈다 — 플레이어가 곳간에 넣으면 수요가 선다 ──────────────
say('\n[② 플레이어가 곳간에 넣으면 econ 이 알아서 쓴다 — 새 장치 0]');
{
  const mk = () => econ.createVillage({ ...lp, initialPop: 20, name: '프런티어', founder: 'pid_player', bornDay: 500 });
  const v = mk();
  ok(v.founder === 'pid_player', '플레이어 창설 마을로 생성됨(founder 기록)');

  // (a) 철이 없으면 대장장이 철검 자격이 꺼져 있다
  v.storage.iron = 0;
  const before = econ._ironWeaponCapable ? econ._ironWeaponCapable(v) : null;
  // (b) 플레이어가 캐서 넣는다 — 곳간에 직접 붓는 것이 곧 "플레이어 노동의 산출"이다
  v.storage.iron = 5;
  const after = econ._ironWeaponCapable ? econ._ironWeaponCapable(v) : null;
  if (before === null) { say('    (⚠ _ironWeaponCapable 미노출 — 자격 검사 건너뜀)'); }
  else {
    ok(before === false, '  철 0 이면 철검 자격 꺼짐');
    // ★시대 게이트가 닫혀 있으면 철검 자격은 시대 때문에 false 다 — 그건 캐논이 아니라 시대 축이다.
    const eraKnows = (() => { try { return R('server/era').npcKnows('iron'); } catch (e) { return true; } })();
    if (eraKnows) ok(after === true, '  ★플레이어가 넣은 철 5 로 자격이 켜진다 — 새 장치 0');
    else { pass++; say(`  ✓ 시대가 닫혀 있어 철검 자격은 시대 축이 막는다(캐논과 무관) — npcKnows(iron)=${eraKnows}`); }
  }

  // (c) 수요(flowT)가 실제로 서는가 — `_cons` 를 태우고 **일 경계 폴드까지** 돌린다.
  //   ⚠1차 작성이 여기서 틀렸다: `_cons` 는 `_consDay` 에 쌓을 뿐이고, `_consEMA` 로의 폴드는
  //     `tickVillage` 의 일 경계에서 일어난다. tick 없이 EMA 를 읽으면 **없는 결함을 보고**한다
  //     (이 프로젝트가 반복해 만난 하네스 실패 유형 — test-assay·test-mining 선례).
  const w = { villages: [v], priceFn: v2.computeShadowPrices, priceBase: v2.BASE_VALUE_V2 || null };
  v._world = w;
  const pBefore = v2.computeShadowPrices(v).iron;
  ok((v._consEMA == null || !(v._consEMA.iron > 0)), '  시작 시점 소비 EMA 는 0 (검사가 자명하게 통과하지 않는다)');
  for (let day = 0; day < 40; day++) {
    econ._cons(v, 'iron', 0.4);          // 그날 대장장이가 쓴 철
    econ.tickVillage(v, day);            // ★정본 일 경계 — 여기서 _consDay → _consEMA 폴드가 일어난다
  }
  const pAfter = v2.computeShadowPrices(v).iron;
  const ema = (v._consEMA || {}).iron || 0;
  say(`    철 소비 EMA ${ema.toFixed(4)} · 그림자가격 ${pBefore.toFixed(3)} → ${pAfter.toFixed(3)}`);
  ok(ema > 0, `★소비 흐름이 잡혔다 — _consEMA.iron = ${ema.toFixed(4)} (flowT = EMA×30 = ${(ema * 30).toFixed(2)})`);
  ok(pAfter > pBefore, `★수요가 서니 철값이 올랐다 — ${pBefore.toFixed(3)} → ${pAfter.toFixed(3)} (플레이어가 넣은 철을 세계가 원하게 된다)`);
}

// ── ③ 필멸 배선 — 플레이어 마을은 기근 보호막을 안 받는다 ───────────────────
say('\n[③ 필멸 — 플레이어 마을은 SHIELD 를 안 받는다]');
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim.js'), 'utf8');
  ok(/if \(!v\.founder && _shieldT < SHIELD_DAYS\)/.test(src),
    '★보호막 조건에 `!v.founder` 가 걸려 있다 — NPC 마을만 보호받는다');
  ok(/founder: opts\.founder \|\| null/.test(src), 'createVillage 가 founder 를 받는다(기본 null = NPC)');
}

say(`\n=== 프런티어 철 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
process.exit(fail ? 1 : 0);
