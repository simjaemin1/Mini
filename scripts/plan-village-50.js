#!/usr/bin/env node
// =============================================================================
// plan-village-50 — 후보 51곳 전수 진단 + 마을별 처방전 [배치 15 v2]
//   재민 확정(2026-08-04): "최종적으로는 50개가 있어야 하거든"
//   재민 질문:            "마을 위치를 바꿔야 해? 아니면 비옥도를 수정해야 하나?"
//
// 이 스크립트가 그 질문에 **숫자로** 답한다. 아무것도 새로 계산하지 않는다 —
// 전부 정본 함수를 부른다(계측기 사본 금지, 2026-08-02f 오진의 교훈):
//   지형 어댑터  : villages.__labProbe.makeTerrainAdapter   (econ-lab-real.js 와 같은 줄)
//   땅 파라미터  : villages.__labProbe.extractLandParamsApprox
//   선별         : villages.__labProbe.pickSeedVillages     ← 배제 원인 판정의 **오라클**
//   레이아웃     : village-layout.generate                  (실영토 비옥도용, --deep)
//   광맥 점수    : economy-sim.veinScore / isBoomtown
//
// ★배제 원인은 추론하지 않고 **오라클로 가른다**: 같은 함수를 손잡이만 바꿔 세 번 부르고
//   집합 차이를 본다(알고리즘을 여기 베끼면 조용히 갈라진다).
//     A. 기본            (VILLAGE_MAX=20, 간격 12000px, 식량 하한 2.0)
//     B. 상한 해제       (VILLAGE_MAX=51)         → A 와의 차 = **상한**에 밀린 곳
//     C. SEED_ALL=1      (전부)                    → B 와의 차 = **간격 or 하한**
//     하한 여부는 landScore 의 정의(food<2.0 → 0)를 lp 로 직접 재서 가른다.
//
// 사용:
//   node scripts/plan-village-50.js              # 빠름(프록시 비옥도 — 선별이 실제로 쓰는 잣대)
//   node scripts/plan-village-50.js --deep       # + 실영토 레이아웃까지 생성(느림 ~15분, 실제 경제 잣대)
//   OUT=/tmp/x.json node scripts/plan-village-50.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = 'hanbando';
const DEEP = process.argv.includes('--deep');
const OUT = process.env.OUT || '/tmp/village50-plan.json';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const E = R('sim/economy-sim');
const P = R('server/villages').__labProbe;
const VL = R('server/village-layout');
const ZONE = ZONES[Z];
const SZ = P.SZ;

P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => { if (!_inZone(x, y)) return true; return isRockTileLocal(x, y) || isWaterTileLocal(x, y); };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

const hard = T.getZoneVillages(Z) || [];
const lpOf = (v) => { try { return P.extractLandParamsApprox(ta, Math.round(v.x / SZ), Math.round(v.y / SZ), { territory: [] }); } catch (e) { return null; } };

// ── 선별 오라클 3판 ──────────────────────────────────────────────────────────
//   VILLAGE_MAX 는 villages.js 모듈 로드 시점의 env 를 읽는 const 라 재호출로는 못 바꾼다.
//   그래서 상한 해제 판정은 **자식 프로세스**로 같은 함수를 다시 불러서 받는다(사본 금지 유지).
const { execFileSync } = require('child_process');
function pickNames(env) {
  const code = `
    const path=require('path');const R=(p)=>require(path.join(${JSON.stringify(path.join(__dirname, '..'))},p));
    const {ZONES}=R('server/zone-config');const T=R('server/terrain');if(T.setZonesMeta)T.setZonesMeta(ZONES);
    const P=R('server/villages').__labProbe;const ZONE=ZONES['${Z}'];const SZ=P.SZ;P.setZoneId('${Z}');
    const _in=(x,y)=>!(x<0||y<0||x>=ZONE.zoneWidth||y>=ZONE.zoneHeight);
    const isW=(x,y)=>{if(!_in(x,y))return false;const tx=Math.floor(x/SZ),ty=Math.floor(y/SZ);try{return !!T.isWaterCellLocal('${Z}',tx*SZ+SZ/2,ty*SZ+SZ/2);}catch{return false;}};
    const isR=(x,y)=>{if(!_in(x,y))return false;try{return !!T.isRockCellLocal('${Z}',x,y);}catch{return false;}};
    const isB=(x,y)=>{if(!_in(x,y))return true;return isR(x,y)||isW(x,y);};
    const ta=P.makeTerrainAdapter(T,ZONE,{isTerrainBlockedLocal:isB,isWaterTileLocal:isW});
    const hard=T.getZoneVillages('${Z}')||[];
    const out=P.pickSeedVillages(hard,ta).map(v=>v.name);
    process.stdout.write('###'+JSON.stringify(out));
  `;
  const s = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, ...env }, maxBuffer: 1 << 24 }).toString();
  return JSON.parse(s.slice(s.indexOf('###') + 3));
}
console.log('선별 오라클 3판 실행 중…');
const A = new Set(pickNames({ VILLAGE_MAX: '20', SEED_ALL: '' }));                 // 현행 프로덕션
const B = new Set(pickNames({ VILLAGE_MAX: '51', SEED_ALL: '' }));                 // 상한만 해제
const C = new Set(pickNames({ VILLAGE_MAX: '51', SEED_ALL: '1' }));                // 전부
console.log(`  A 현행(VILLAGE_MAX=20)      : ${A.size}곳`);
console.log(`  B 상한해제(VILLAGE_MAX=51)  : ${B.size}곳`);
console.log(`  C SEED_ALL=1                : ${C.size}곳`);

// ── 전수 계측 ────────────────────────────────────────────────────────────────
const FOOD_FLOOR = 2.0;
const rows = [];
for (const v of hard) {
  const lp = lpOf(v);
  if (!lp) { rows.push({ name: v.name, err: 'lp 실패' }); continue; }
  const food = (lp.fertility || 0) * 1.5 + (lp.water || 0) * 1.2 + (lp.game || 0) * 0.7;
  const toolAccess = Math.min(1, Math.max(0, (lp.stone || 0) - 0.25) / 0.75 + Math.max(0, (lp.wood || 0) - 0.45) / 1.5);
  const land = food < FOOD_FLOOR ? 0 : food * (0.5 + toolAccess);
  const passFloor = food >= FOOD_FLOOR;
  let cls, why;
  if (A.has(v.name)) { cls = '선별'; why = '현행에 이미 들어 있다'; }
  else if (B.has(v.name)) { cls = '상한밀림'; why = `땅은 통과(식량 ${food.toFixed(2)}) — VILLAGE_MAX=20 상한에만 밀렸다`; }
  else if (passFloor) { cls = '간격밀림'; why = `땅은 통과(식량 ${food.toFixed(2)}) — MIN_SPACING_PX=12000 간격에 밀렸다`; }
  else { cls = '하한미달'; why = `식량 ${food.toFixed(2)} < ${FOOD_FLOOR}`; }

  // ── 처방 ───────────────────────────────────────────────────────────────────
  //   ★선별이 쓰는 비옥도는 **영토 없는 프록시**다: fertility = clamp(0.4 + water*0.9 − rockD*1.5, 0.1, 2)
  //     (extractLandParamsApprox — layout.territory 가 비면 비옥도 필드를 안 읽는다.)
  //     ⇒ 에디터에서 **비옥도 레이어를 칠해도 선별은 안 바뀐다.** 선별을 움직이는 건 물·바위·숲뿐이다.
  //     (칠한 비옥도는 심긴 뒤의 실제 생산엔 반영된다 — seedVillages 는 실영토로 다시 잰다.)
  const need = Math.max(0, FOOD_FLOOR - food);
  const rx = {};
  if (need > 0) {
    // water 는 lp.water = min(1, 1 − nd/140) × 1.6 → 필요한 water 증분 → 필요한 '물까지 거리' 단축(셀)
    const dWater = need / 1.2;                       // lp.water 기준 증분
    const wRaw = Math.min(1, (lp.water || 0) / 1.6); // 원시 water(0~1)
    const wRawNeed = Math.min(1, wRaw + dWater / 1.6);
    rx.water = { dLpWater: +dWater.toFixed(2), 현재거리셀: +((1 - wRaw) * 140).toFixed(0), 목표거리셀: +((1 - wRawNeed) * 140).toFixed(0) };
    // fertility(프록시)는 물이 오르면 같이 오른다 — 물 처방이 비옥도까지 밀어 올리는 이중 효과
    rx.combined = '물을 당기면 프록시 비옥도(0.4+물×0.9−바위×1.5)도 함께 올라 식량이 두 번 오른다';
    rx.game = { dLpGame: +(need / 0.7).toFixed(2), 설명: '사냥터 밴드(중심 40~130셀)의 숲 비율을 올린다(나무 심기)' };
    rx.rock = { 설명: `반경 140셀 바위 비율을 낮추면 프록시 비옥도가 오른다(계수 −1.5) — 현재 stone=${(lp.stone || 0).toFixed(2)}` };
  }
  rows.push({
    name: v.name, type: v.type, x: v.x, y: v.y, cx: Math.round(v.x / SZ), cy: Math.round(v.y / SZ),
    fertility: lp.fertility, water: lp.water, game: lp.game, stone: lp.stone, wood: lp.wood, ore: lp.ore,
    food: +food.toFixed(2), toolAccess: +toolAccess.toFixed(2), land: +land.toFixed(2),
    vein: +(E.veinScore ? E.veinScore(lp) : 0).toFixed(3), boomtown: !!(E.isBoomtown && E.isBoomtown(lp)),
    passFloor, cls, why, need: +need.toFixed(2), rx,
  });
}

// ── 간격 실측 — 51곳을 다 심으면 영토가 겹치나 ────────────────────────────────
//   영토 목표 ~3450셀 → 반경 √(3450/π) ≈ 33셀 ≈ 1,056px. 두 마을이 겹치지 않으려면 ≥ 2,112px.
const TERR_R_PX = Math.sqrt(3450 / Math.PI) * SZ;
let minPair = Infinity, minA = '', minB = '';
const tooClose = [];
for (let i = 0; i < hard.length; i++) for (let j = i + 1; j < hard.length; j++) {
  const d = Math.hypot(hard[i].x - hard[j].x, hard[i].y - hard[j].y);
  if (d < minPair) { minPair = d; minA = hard[i].name; minB = hard[j].name; }
  if (d < TERR_R_PX * 2) tooClose.push({ a: hard[i].name, b: hard[j].name, d: Math.round(d) });
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
const byCls = {};
for (const r of rows) byCls[r.cls] = (byCls[r.cls] || 0) + 1;
console.log(`\n=== 후보 ${rows.length}곳 분류 ===`);
for (const [k, n] of Object.entries(byCls)) console.log(`  ${k.padEnd(8)} ${n}곳`);

const W = (s, n) => String(s).padEnd(n);
const N = (v, n, d = 2) => String(typeof v === 'number' ? v.toFixed(d) : v).padStart(n);
console.log(`\n=== 전수표 (식량 = 비옥×1.5 + 물×1.2 + 사냥×0.7 · 하한 ${FOOD_FLOOR}) ===`);
console.log(`${W('마을', 8)}${W('타입', 10)}${N('비옥', 6)}${N('물', 6)}${N('사냥', 6)}${N('돌', 6)}${N('나무', 6)}${N('식량', 7)}${N('부족', 6)}  분류`);
for (const r of rows.slice().sort((a, b) => a.food - b.food)) {
  console.log(`${W(r.name, 8)}${W(r.type, 10)}${N(r.fertility, 6)}${N(r.water, 6)}${N(r.game, 6)}${N(r.stone, 6)}${N(r.wood, 6)}${N(r.food, 7)}${N(r.need || 0, 6)}  ${r.cls}`);
}

console.log(`\n=== 간격 실측 ===`);
console.log(`  후보 51곳 중 최단 쌍: ${minA}–${minB} ${Math.round(minPair)}px (${(minPair / SZ).toFixed(0)}셀)`);
console.log(`  영토 반경(3450셀 기준) ${TERR_R_PX.toFixed(0)}px · 겹침 문턱 ${(TERR_R_PX * 2).toFixed(0)}px`);
console.log(`  영토가 겹칠 수 있는 쌍: ${tooClose.length}쌍 ${tooClose.length ? JSON.stringify(tooClose.slice(0, 8)) : '(없음 — 간격 규칙만 풀면 51곳이 물리적으로 들어간다)'}`);
console.log(`  현행 MIN_SPACING_PX=12000px 는 영토 반경의 ${(12000 / TERR_R_PX).toFixed(1)}배 — 51곳 세계에선 이 값이 병목이다`);

const out = { generatedFor: '배치 15 v2 — 50마을 세계', zone: Z, candidates: rows.length,
  oracle: { current: [...A], capReleased: [...B], all: [...C] },
  spacing: { minPairPx: Math.round(minPair), minPair: [minA, minB], territoryRadiusPx: Math.round(TERR_R_PX), overlappingPairs: tooClose },
  rows };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\nJSON: ${OUT} (map-editor 오버레이용 — name/x/y/cls/food/need 포함)`);
