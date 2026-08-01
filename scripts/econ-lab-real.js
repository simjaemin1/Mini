#!/usr/bin/env node
// === scripts/econ-lab-real.js — 본 게임 배선 그대로, 실제 지도의 마을 부존으로 econ 을 돌린다 ===
//
// ★[재민] "실제 각 마을의 위치를 보고 근처 광산까지 거리, 광물 종류, 매장량 등을 전부 고려해야겠지..?"
// ★[재민 2026-08-01] "랩을 새로 만들었다고? 기존에 존재하던 전쟁실험실을 수정하면 되는데?"
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 역사가 곧 경고문이다. 나는 이 랩을 처음부터 **손으로 다시 짰고**, 그 결과
// 다섯 번 틀린 값을 "실측"이라고 보고했다:
//
//   ① 부존 스캔 환산을 손으로 씀      → 광맥을 4~7배 낮게 재고 "광부 0" 가짜 결론
//   ② 회귀 하네스가 stale dump 를 읽음 → "비트 동일" 가짜 통과
//   ③ 루프에 tickTrade 가 없음         → 교역 없는 세계를 재고 "광산 마을 소멸"
//   ④ 폐지된 tickMigration 을 부름      → 본 게임과 반대 방향의 인구 동역학
//   ⑤ v1 tickWorld 를 부름             → 본 게임은 v2(tickWorldV2)다. picker 도 legacy vs rational.
//                                        coord 가 아예 없어 거리·운반비·약탈이 전부 무의미했다.
//
// 공통 원인은 하나다 — **본 게임이 이미 갖고 있는 것을 랩에서 다시 만들었다.**
// 그래서 이 파일은 이제 아무것도 새로 만들지 않는다. 전부 본 게임 함수를 그대로 부른다:
//
//   부존 추출  : villages.__labProbe.makeTerrainAdapter / extractLandParamsApprox
//   마을 선별  : villages.__labProbe.pickSeedVillages   (VILLAGE_MAX — 본 게임은 20곳이다)
//   레이아웃   : village-layout.generate                (영토 → fertility·arable·size·marginalQ)
//   world 조립 : economy-sim-v2.createWorldV2           (server/villages.js:1645 와 같은 옵션)
//   일 틱      : economy-sim-v2.tickWorldV2             (server/villages.js:2255 와 같은 진입점)
//
// 배선이 본 게임과 같은지는 scripts/lab-wiring-check.js 가 매번 검사한다.
//
// 실행: node scripts/econ-lab-real.js [일수=800] [마을수=0(VILLAGE_MAX 그대로)]
//   VILLAGE_MAX=51 node scripts/econ-lab-real.js   ← 후보 전부 돌리고 싶을 때
//   LAB_DUMP=/tmp/lab.json ...                     ← 마을별 진단 덤프
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

const DAYS = parseInt(process.argv[2], 10) || 800;
const LIMIT = parseInt(process.argv[3], 10) || 0;
const Z = 'hanbando';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const P = R('server/villages').__labProbe;
const ZONE = ZONES[Z];
const SZ = P.SZ;

// ── 지형 어댑터 — 본 게임 makeTerrainAdapter 를 그대로 쓴다 ───────────────────
//   deps 두 개만 랩이 채운다. zone.js 의 것과 다른 점은 **다리·환호 층이 없다**는 것뿐인데,
//   둘 다 t=0 에 비어 있으므로(다리는 맵 사물이라 부존 스캔에 무관, 환호는 마을이 판다)
//   시딩 시점 부존에는 영향이 없다. 이 두 줄이 이 파일의 유일한 재구현이고, 그래서 여기 적어둔다.
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => {
  if (!_inZone(x, y)) return false;
  try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; }
};
const isTerrainBlockedLocal = (x, y) => {
  if (!_inZone(x, y)) return true;
  return isRockTileLocal(x, y) || isWaterTileLocal(x, y);   // 다리·환호 층 없음(t=0 동형)
};
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

// ── 마을 선별 + 부존 추출 — seedVillages(server/villages.js:830~845) 와 같은 순서 ──
const hard = T.getZoneVillages(Z) || [];
if (!hard.length) { console.error('마을 0 — 지형 로드 실패'); process.exit(1); }
const picked = P.pickSeedVillages(hard, ta);   // ★땅 품질 시딩 — 본 게임과 같은 인자
console.log(`실제 지도 — 후보 ${hard.length}곳 → 시딩 선별 ${picked.length}곳 (VILLAGE_MAX=${P.VILLAGE_MAX})`);

const seeds = [];
for (const hv of picked) {
  const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
  if (!c) { console.warn(`  [${hv.name}] 중심 주변에 뭍 없음 — 스킵`); continue; }
  let layout;
  try {
    if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62);
    layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {});
  } catch (e) { console.warn(`  [${hv.name}] generate 실패 — 스킵: ${e.message}`); continue; }
  const lp = P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout);
  seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp });
  if (LIMIT && seeds.length >= LIMIT) break;
}
if (!seeds.length) { console.error('시딩 0 — 중단'); process.exit(1); }

// 광종 부존 조사(측정용 — econ 에 영향 없음)
{
  const tot = {}; let tinV = 0, cuV = 0;
  for (const s of seeds) {
    const mix = s.lp.oreMix || {};
    for (const k in mix) tot[k] = (tot[k] || 0) + mix[k] * (s.lp.ore || 0);
    if (mix.tin > 0) tinV++; if (mix.copper > 0) cuV++;
  }
  console.log('  광종 부존 합(비율×부존): ' + Object.entries(tot).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + ' ' + v.toFixed(2)).join(' · '));
  console.log(`  주석이 나는 마을 ${tinV}/${seeds.length} · 구리가 나는 마을 ${cuV}/${seeds.length}`);
  const tins = seeds.filter(s => (s.lp.oreMix || {}).tin > 0).map(s => `${s.name}(${(s.lp.oreMix.tin * 100).toFixed(1)}%)`);
  if (tins.length) console.log('  주석 마을: ' + tins.join(', '));
  const f = seeds.map(s => s.lp.fertility).sort((a, b) => a - b);
  console.log(`  비옥도 ${f[0]}~${f[f.length - 1]} (중앙 ${f[(f.length / 2) | 0]}) · size ${Math.min(...seeds.map(s => s.lp.size))}~${Math.max(...seeds.map(s => s.lp.size))}`);
}

// ── world 조립 — server/villages.js:1645~1670 verbatim ────────────────────────
const world = econV2.createWorldV2({
  seed: parseInt(process.env.LAB_SEED || '', 10) || ZONE.villageSeed || 1020,   // LAB_SEED=n — 카오스 민감도 A/B용(마을·지형 불변, econ 난수열만)
  villageCount: seeds.length,          // 슬롯만 확보 — 아래서 전부 실지형 마을로 교체
  picker: 'rational', infoRange: 5000, raidPer100: 0.005,   // 본 게임과 동일 옵션
});
world.villages = [];
world.events = [];
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world;
  ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };   // ★econ 좌표 = 셀×2.5 (본 게임 1663행)
  world.villages.push(ev);
}
world.day = 0;

// ── 일 틱 — 본 게임 진입점(server/villages.js:2255) ────────────────────────────
// ★시대 전환 실험 — ERA_FLIP_DAY=N 이면 N일차에 시대를 연다.
//   [재민] "내가 시대를 언제 여는지에 따라 흥망성쇠가 크게 갈리면 안 돼" — 급변 폭을 실측한다.
const FLIP = parseInt(process.env.ERA_FLIP_DAY || '0', 10) || 0;
const FLIP_TO = process.env.ERA_FLIP_TO || 'early_iron';
const Era = FLIP ? R('server/era') : null;
// ★궤적 표본(랩 쪽 계측 — 엔진 무접촉): tickWorldV2 는 history 를 안 쌓는다(v1 전용이었다).
//   마을 소멸 사인 규명에 필요해서 10일마다 인구·식량환산을 여기서 직접 뜬다.
const TRACE = {};
for (let d = 0; d < DAYS; d++) {
  if (Era && d === FLIP) { Era.setEra(FLIP_TO); console.log(`\n⚡ Day ${d}: 시대 전환 → ${FLIP_TO}\n`); }
  econV2.tickWorldV2(world);
  if (process.env.LAB_DUMP && d % 10 === 0) {
    for (const v of world.villages) {
      (TRACE[v.name] || (TRACE[v.name] = [])).push({ d, p: v.npcs.length,
        f: +((econ.totalFoodEquivalent ? econ.totalFoodEquivalent(v) : (v.storage.food || 0))).toFixed(0) });
    }
  }
  if (Era && d % 50 === 0 && d >= FLIP - 100) {
    let fe = 0, cu = 0, ore = 0, mi = 0, sm = 0, pop = 0;
    for (const v of world.villages) { const st = v.storage || {}; fe += st.iron || 0; cu += st.copper || 0; ore += st.ore || 0; pop += v.npcs.length;
      for (const n of v.npcs) { if (n.currentJob === 'miner') mi++; else if (n.currentJob === 'smith') sm++; } }
    console.log(`  [추적 d${d}] 인구 ${pop} · 광부 ${mi} · 대장장이 ${sm} · 철 ${fe.toFixed(0)} · 구리 ${cu.toFixed(0)} · 원석 ${ore.toFixed(0)}`);
  }
}

// ── 보고 ─────────────────────────────────────────────────────────────────────
const N0 = seeds.length;
let pop = 0, weap = 0, armor = 0, tool = 0, cloth = 0, dead = 0, grSum = 0, grN = 0, bwSum = 0;
const stock = {}, jobs = {};
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n; if (n <= 0) dead++;
  for (const k in (v.storage || {})) stock[k] = (stock[k] || 0) + v.storage[k];
  for (const npc of (v.npcs || [])) jobs[npc.currentJob] = (jobs[npc.currentJob] || 0) + 1;
  weap += v.storage.weapon || 0; armor += v.storage.armor || 0;
  tool += v.storage.tool || 0; cloth += v.storage.clothes || 0;
  if (v._alloyGrade != null) { grSum += v._alloyGrade; grN++; }
  bwSum += v._bronzeWeaponMade || 0;
}
const M = (k) => +(stock[k] || 0).toFixed(1);
console.log(`\n=== ${DAYS}일 후 (마을 ${N0}곳 · picker=rational · tickWorldV2) ===`);
console.log(`  인구 ${pop} · 소멸 ${dead}/${N0} · 거래 ${world.tradeLog.length}건 · 운행 캐러밴 ${(world.caravans || []).length}`);
console.log('  직업: ' + Object.entries(jobs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(`  장비 재고 — 무기 ${weap.toFixed(1)} · 갑옷 ${armor.toFixed(1)} · 도구 ${tool.toFixed(1)} · 옷 ${cloth.toFixed(1)}`);
console.log(`  금속 재고 — 구리 ${M('copper')} · 주석 ${M('tin')} · 납 ${M('lead')} · 은 ${M('silver')} · 철 ${M('iron')} · 금 ${M('gold')} · 원석 ${M('ore')}`);
console.log(`  ★합금 등급 평균 ${grN ? (grSum / grN).toFixed(3) : '—'} (${grN}/${N0}곳이 주조) · 청동다움 누적 ${bwSum.toFixed(1)}`);
console.log(`  ★구리:주석 재고비 ${stock.tin > 0 ? (stock.copper / stock.tin).toFixed(1) : '∞'} : 1`);
{
  const top = Object.entries(stock).filter(([, x]) => x > 1).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('  재고 상위: ' + top.map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · '));
}

// ── 마을별 덤프 — LAB_DUMP=경로 를 주면 쓴다(같은 실행을 여러 번 안 돌리려고) ──
if (process.env.LAB_DUMP) {
  const METALS = ['copper', 'tin', 'lead', 'silver', 'iron', 'gold'];
  const out = { days: DAYS, villageMax: P.VILLAGE_MAX, villages: [] };
  for (let i = 0; i < world.villages.length; i++) {
    const v = world.villages[i], s = seeds[i], jb = {};
    for (const npc of (v.npcs || [])) jb[npc.currentJob] = (jb[npc.currentJob] || 0) + 1;
    const st = {}; for (const k in (v.storage || {})) if (v.storage[k] > 0.01) st[k] = +v.storage[k].toFixed(2);
    out.villages.push({
      name: v.name, cell: [s.ccx, s.ccy], pop: (v.npcs || []).length,
      land: { fertility: v.land.fertility, water: v.land.water, wood: v.land.wood, stone: v.land.stone,
              ore: v.land.ore, game: v.land.game, size: v.land.size, arable: v.land.arable,
              ...Object.fromEntries(METALS.filter(m => v.land[m] != null).map(m => [m, v.land[m]])) },
      oreMix: s.lp.oreMix || {}, oreGrade: s.lp.oreGrade, oreP: s.lp.oreP, oreDist: s.lp.oreDist,
      marginalQ: s.lp.marginalQ,
      jobs: jb, storage: st, counts: v.counts,
      alloyGrade: v._alloyGrade, bronzeWeaponMade: v._bronzeWeaponMade,
      stoneWeaponMade: v._stoneWeaponMade,
      treasury: Object.fromEntries(Object.entries(v.treasury || {}).filter(([, x]) => x > 0.01).map(([k, x]) => [k, +x.toFixed(2)])),
      tradeStats: v.tradeStats,
      // 진단용 내부 스칼라 전부(_로 시작하는 수치 필드) — 게이트 산수를 밖에서 재현하려면 필요하다
      _int: Object.fromEntries(Object.keys(v).filter(k => k[0] === '_' && typeof v[k] === 'number')
        .map(k => [k, +v[k].toFixed(4)])),
      // ★인구·식량 궤적(10일 스냅샷, 최근 500일) — 마을 소멸의 사인 규명용
      history: TRACE[v.name] || [],   // {d,p(인구),f(식량환산)} — 랩 쪽 10일 표본(tickWorldV2 는 history 를 안 쌓는다)
    });
  }
  out.tradeLog = (world.tradeLog || []).slice(-400);
  require('fs').writeFileSync(process.env.LAB_DUMP, JSON.stringify(out, null, 1));
  console.log('  덤프: ' + process.env.LAB_DUMP);
}
module.exports = { world, seeds };
