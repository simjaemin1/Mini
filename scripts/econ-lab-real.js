#!/usr/bin/env node
// === scripts/econ-lab-real.js — 실제 지도의 마을 부존으로 econ 을 돌린다 ===
//
// ★[재민] "실제 각 마을의 위치를 보고 근처 광산까지 거리, 광물 종류, 매장량 등을 전부 고려해야겠지..?
//          본 게임 실제 마을에서 근처 광산까지 거리를 대충 계산해서, 그걸 랩실에 적용하고 측정하는 거야."
//
// CLI 랩(sim/economy-sim.js main)은 마을 부존을 **난수로** 만든다. 그래서 oreMix 가 없고,
// 새로 넣은 경로(광종 구성 → 부산물 · land.tin 연속량 · 배합 대장장이)를 하나도 안 밟는다.
// 이 스크립트는 실제 hanbando 지도에서 마을 위치를 읽어 노동권 안 광맥을 실측하고,
// 그 부존 그대로 econ 을 돌린다. **랩이 본 게임을 흉내내는 게 아니라 본 게임 수치를 쓴다.**
//
// 실행: node scripts/econ-lab-real.js [일수=800] [마을수=0(전부)]
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const LIMIT = parseInt(process.argv[3], 10) || 0;

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const S = R('server/sustain');
const econ = R('sim/economy-sim');
const Z = 'hanbando', C = 32, LR = S.LABOR_R;
const zone = ZONES[Z];
const vs = T.getZoneVillages(Z) || [];
if (!vs.length) { console.error('마을 0 — 지형 로드 실패'); process.exit(1); }

// ── 노동권 안 광맥을 **면적 가중**으로 — server/villages.js oreMix 와 같은 식(원 교집합) ──
const ores = ((T.ZONE_TERRAIN && T.ZONE_TERRAIN[Z]) || {}).ores || [];
function oreMixAt(cx, cy) {
  const mix = {}; let _a0 = 0, _ap = 0; const RR = LR * C, PX = cx * C + C / 2, PY = cy * C + C / 2;
  for (const o of ores) {
    if (o.minor || !o.center || !o.mineral) continue;
    const r = o.radius || 0, d = Math.hypot(o.center[0] - PX, o.center[1] - PY);
    if (d >= RR + r) continue;
    let a;
    if (d <= Math.abs(RR - r)) a = Math.PI * Math.min(RR, r) ** 2;
    else {
      const c1 = (d * d + RR * RR - r * r) / (2 * d * RR), c2 = (d * d + r * r - RR * RR) / (2 * d * r);
      const a1 = Math.acos(Math.max(-1, Math.min(1, c1))), a2 = Math.acos(Math.max(-1, Math.min(1, c2)));
      a = RR * RR * (a1 - Math.sin(2 * a1) / 2) + r * r * (a2 - Math.sin(2 * a2) / 2);
    }
    if (a > 0) { _a0 += a; _ap += a * (o.pk || 0); mix[o.mineral] = (mix[o.mineral] || 0) + a * (o.pk || 0); }
  }
  let tot = 0; for (const k in mix) tot += mix[k];
  if (tot > 0) for (const k in mix) mix[k] = +(mix[k] / tot).toFixed(4);
  else for (const k in mix) delete mix[k];
  return { mix, gradeMult: _a0 > 0 ? (_ap / _a0) / PK_REF : 1 };
}
// 존 전체 주요 광맥의 면적가중 평균 pk — 농도 보정의 기준점(총량 중립)
const PK_REF = (() => { let A = 0, AP = 0;
  for (const o of ores) { if (o.minor || !o.center) continue;
    const a = Math.PI * (o.radius || 0) * (o.radius || 0); A += a; AP += a * (o.pk || 0); }
  return A > 0 ? AP / A : 0.3; })();
// 노동권 셀 표본으로 부존 스칼라(0~2 척도) — 랩 land.* 와 같은 축.
// ⚠비옥도는 여기서 안 잰다: 그건 server/villages.js 의 EDT 비옥도장(prepareFert)이 필요하고
//   그 어댑터는 zone.js 의 deps 주입 없이는 못 만든다. 이 스크립트의 목적은 **광물 축**이므로
//   비옥도·사냥은 전 마을 공통 상수로 고정한다(광물 비교에는 영향이 없다).
const FERT_FIXED = 1.0;
const LV = R('server/livelihood');
// ★스캔 규약은 server/villages.js(289~309행)와 **글자 그대로** 같아야 한다: R=140셀·STEP=4·
//   물칸을 빼지 않음·바위와 숲은 else 로 배타·광맥만 바위와 겹칠 수 있음.
//   그리고 share → land.* 환산은 livelihood.landOf 를 그대로 부른다(√ 광맥 등).
//   전에 이걸 손으로 다시 짰다가 광맥 부존을 4~7배 낮게 재서 "광부 0" 이라는 가짜 결론을 냈다.
const SR = 140, STEP = 4, HUNT0 = 40, HUNT1 = 130;
function landAt(ccx, ccy) {
  let n = 0, ore = 0, rock = 0, forest = 0, huntF = 0, huntN = 0;
  for (let dy = -SR; dy <= SR; dy += STEP) for (let dx = -SR; dx <= SR; dx += STEP) {
    const d2 = dx * dx + dy * dy, cx = ccx + dx, cy = ccy + dy;
    const px = cx * C + C / 2, py = cy * C + C / 2;
    const fm = (px < 0 || py < 0) ? 0 : (() => { try { return T.getForestMultiplier(Z, px, py); } catch (e) { return 0; } })();
    if (d2 >= HUNT0 * HUNT0 && d2 <= HUNT1 * HUNT1) { huntN++; if (fm > 1.2) huntF++; }
    if (d2 > SR * SR) continue;
    n++;
    if (px < 0 || py < 0) continue;
    if (T.isMajorOreAt(Z, px, py)) ore++;
    if (T.isRockCellLocal(Z, px, py)) rock++;
    else if (fm > 1.2) forest++;
  }
  if (!n) return null;
  // 물 — 최근접 물까지 거리로 선형 감쇠(villages.js 와 동일)
  let nd = SR + 1;
  outer: for (let r = 1; r <= SR; r++) for (let a = 0; a < 360; a += 20) {
    const qx = Math.round(ccx + Math.cos(a * Math.PI / 180) * r), qy = Math.round(ccy + Math.sin(a * Math.PI / 180) * r);
    const px = qx * C + C / 2, py = qy * C + C / 2;
    if (px < 0 || py < 0) continue;
    if (T.isWaterCellLocal(Z, px, py)) { nd = r; break outer; }
  }
  const l = LV.landOf({ forShare: forest / n, huntShare: huntN ? huntF / huntN : 0, rockShare: rock / n, oreShare: ore / n });
  return { n, ore: l.ore, stone: l.stone, wood: l.wood, game: l.game,
    water: +Math.max(0.05, Math.min(1, 1 - nd / SR)).toFixed(3), fertility: FERT_FIXED };
}

console.log(`실제 지도 마을 ${vs.length}개 — 노동권(R=${LR}셀) 실측 부존으로 ${DAYS}일 econ`);
const villages = [];
const census = [];
for (const v of vs) {
  const cx = Math.round(v.x / C), cy = Math.round(v.y / C);
  const L = landAt(cx, cy); if (!L) continue;
  const { mix, gradeMult } = oreMixAt(cx, cy);
  L.ore = +Math.max(0.05, Math.min(2.5, L.ore * gradeMult)).toFixed(2);   // ★농도 보정(본 게임 동형)
  census.push({ name: v.name, ore: L.ore, mix });
  villages.push(econ.createVillage({
    name: v.name, fertility: Math.max(0.15, L.fertility), wood: Math.max(0.1, L.wood),
    stone: Math.max(0.1, L.stone), ore: Math.max(0.02, L.ore), water: Math.max(0.05, L.water),
    game: L.game, size: 45, initialPop: 8, oreMix: mix,   // ★비어 있어도 싣는다 — "지도가 없다고 말한다" 와 "모른다" 는 다르다
  }));
  if (LIMIT && villages.length >= LIMIT) break;
}

// 광종 부존 조사
const tot = {};
let tinV = 0, cuV = 0;
for (const c of census) { for (const k in c.mix) tot[k] = (tot[k] || 0) + c.mix[k] * c.ore; if (c.mix.tin > 0) tinV++; if (c.mix.copper > 0) cuV++; }
console.log('  광종 부존 합(비율×부존): ' + Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' · '));
console.log(`  주석이 나는 마을 ${tinV}/${census.length} · 구리가 나는 마을 ${cuV}/${census.length}`);
const tins = census.filter(c => c.mix.tin > 0).map(c => c.name + '(' + (c.mix.tin * 100).toFixed(1) + '%)');
if (tins.length) console.log('  주석 마을: ' + tins.join(', '));

// ★가격 신호 주입 — 이게 없으면 모든 재화 가중치가 1.0 이라 **한계비용도 광부 유인도 죽는다.**
//   v1 CLI 랩은 priceFn 을 안 붙인다(v2 전용 훅). 본 게임은 붙이므로, 랩이 본 게임을 닮으려면 붙여야 한다.
const world = { villages, tradeLog: [], events: [], caravans: [], picker: process.env.PICKER || 'legacy' };
if (process.env.NO_PRICE !== '1') world.priceFn = (v) => econ.computeVillagePrices(v);
for (const v of villages) v._world = world;
// ★★루프를 **손으로 복제하지 않는다.** econ.tickWorld 가 본 게임 루프 그 자체다
//   (processEvents → tickVillage+adjustGuildTax → tickTrade → tickCaravans, 이주는 폐지됨).
//   이 세션에 복제를 시도했다가 두 번 당했다:
//     ① tickTrade 를 빼먹어 **교역 없는 세계**를 쟀다 — 광산 마을이 식량을 못 사서 죽는 게 당연했다
//     ② tickTrade 만 넣고 tickCaravans 를 빼먹었다 — tickTrade 는 출발 즉시 재고를 **차감**하고
//        캐러밴을 띄우는데 정산이 없으니 재고가 나가기만 했다. 인구 2,181 → 185, 47/51 마을 소멸.
//   랩이 본 게임을 대변하지 못하면 그 위의 모든 측정이 헛것이다. 그래서 복제를 지운다.
world.day = 0;
for (let d = 0; d < DAYS; d++) econ.tickWorld(world);

let pop = 0, weap = 0, cu = 0, tin = 0, iron = 0, gold = 0, smith = 0, miner = 0, dead = 0;
let grSum = 0, grN = 0, bwSum = 0;
for (const v of world.villages) {
  const n = v.pop || (v.npcs || []).length || 0; pop += n; if (n <= 0) dead++;
  const st = v.storage || {};
  weap += st.weapon || 0; cu += st.copper || 0; tin += st.tin || 0; iron += st.iron || 0; gold += st.gold || 0;
  const jb = {}; for (const npc of (v.npcs || [])) jb[npc.currentJob] = (jb[npc.currentJob] || 0) + 1;
  smith += jb.smith || 0; miner += jb.miner || 0;
  if (v._alloyGrade != null) { grSum += v._alloyGrade; grN++; }
  bwSum += v._bronzeWeaponMade || 0;
}
if(global._TL){const e=Object.entries(global._TL).sort((a,b)=>b[1]-a[1]).slice(0,10);
  console.log('\n교역 이동량(1~200일 누적, 상위): '+e.map(([k,v])=>k+' '+v.toFixed(0)).join(' · '));
  console.log('  거래 건수 '+world.tradeLog.length);}
{const alive=world.villages.filter(v=>v.npcs.length>0);
 console.log('  생존 마을 '+alive.length+'/51 · 첫 항목 키: '+(world.tradeLog[0]?Object.keys(world.tradeLog[0]).join(','):'-'));
 if(world.tradeLog[0]) console.log('  샘플: '+JSON.stringify(world.tradeLog[0]).slice(0,220));}
console.log('\n=== ' + DAYS + '일 후 ===');
console.log('  인구 ' + pop + ' · 소멸 ' + dead + ' · 대장장이 ' + smith + ' · 광부 ' + miner);
console.log('  재고 — 무기 ' + weap.toFixed(1) + ' · 구리 ' + cu.toFixed(1) + ' · 주석 ' + tin.toFixed(2)
  + ' · 철 ' + iron.toFixed(1) + ' · 금 ' + gold.toFixed(1));
console.log('  ★합금 등급 평균 ' + (grN ? (grSum / grN).toFixed(3) : '—') + ' (' + grN + '개 마을이 주조) · 청동다움 누적 ' + bwSum.toFixed(1));
console.log('  ★구리:주석 재고비 ' + (tin > 0 ? (cu / tin).toFixed(1) : '∞') + ' : 1');
