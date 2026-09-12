#!/usr/bin/env node
// === scripts/t176-ab.js — T176 서버 A/B: T100 손잡이를 켠다 (실지도 51마을 · 생활층) ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T176 §1-①② · ★검증 규약]
//   T100 을 켠 팔의 식량은 **실제 수확**에서 온다(`_lifeDoTask0` 수확 갈래 → `harvestToGranary`).
//   그런데 `t17-metrics.js`·`t165-ab.js`·econ 랩은 **밭 상태기를 안 돈다**(`Villages.init()` 을
//   안 부른다 — T112 §0ⓑ · 족보 130). 그 자로 켠 팔을 재면 그 팔은 통째로 기근이다.
//   ⇒ 이 자는 **두 세계를 하나로 붙인 것**이다:
//        세계·장부·읽는 자리 = `t165-ab.js`(= `t17-metrics ⓚⓛ` 와 같은 길 · 실지도 51마을 ·
//                               `trees.attachToWorld` · `Events.createLedger` · 같은 문턱)
//        생활층            = `farm-metrics.js`(T117 · `__labProbe._cropProbe`/`._clearProbe` 정본 함수)
//   ⇒ 끈 팔에서 이 둘을 붙여도 여덟 수는 **셋째 판과 같아야 한다**: econ 은 `_fieldCells` 를
//     한 번도 **읽지** 않고(쓰기만 5곳), `harvestToGranary`/`gardenFloorTopUp` 둘 다 첫 줄에서
//     `T100_FIELD_YIELD` 를 보고 0 을 돌려준다. **그 같음이 §0-ⓐ 의 검사다**(생활층이 끄면 무해하다).
//
// ★이 파일에 산수는 **비율·분위수·나눗셈**뿐이다. 계수(k · 앵커 N · 텃밭 하한 · 첫 수확일 · 석재 바닥
//   문턱)는 전부 **엔진/정본**이 갖고 여기선 읽어 쓰기만 한다 — 사본 0.
//
// 실행:
//   1) 한 판   : LAB_SEEDCACHE=/tmp/t165/seeds.json T176_JSON=/tmp/t176/on_1020.json \
//                  T100_FIELD_YIELD=1 node scripts/t176-ab.js 800 1020
//   2) 표      : node scripts/t176-ab.js --table /tmp/t176 [--seeds 1020,7,42]
'use strict';
const path = require('path');
const fs = require('fs');

// ── 표 모드 — 측정 JSON 만 읽는다(세계를 안 세운다) ──────────────────────────
if (process.argv.indexOf('--table') >= 0) {
  const DIR = process.argv[process.argv.indexOf('--table') + 1] || '/tmp/t176';
  const si = process.argv.indexOf('--seeds');
  const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
  const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
  const nf = (x) => (x == null ? '—' : Number(x).toLocaleString());
  const r1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1));
  const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');

  // ★셋째 판 기준선 — **인계/공통.md 의 그 표를 그대로 옮긴 것**(베이스 2b9f724e · T163 §1).
  //   이 수는 **견주기만 한다**. 어떤 계산에도 안 들어가고 어떤 계수도 여기서 안 나온다(되맞추기 금지).
  const CANON = {
    1020: { pop: 6889, dead: 0, ever: 51, weapQ: 1012, expand: 5509, reqOpened: 2539, toolQ: 11892.1, preserved: 803.6, rawGrain: 37240.0, dAll: 1.93, dVal: 2.02 },
    7:    { pop: 7148, dead: 0, ever: 51, weapQ: 1030, expand: 7830, reqOpened: 2714, toolQ: 12039.3, preserved: 551.1, rawGrain: 37779.9, dAll: 1.88, dVal: 1.97 },
    42:   { pop: 6259, dead: 0, ever: 51, weapQ: 978,  expand: 5946, reqOpened: 2648, toolQ: 11013.2, preserved: 663.3, rawGrain: 38902.1, dAll: 1.95, dVal: 2.04 },
  };

  const got = [];
  for (const s of SEEDS) {
    const off = load(path.join(DIR, `off_${s}.json`)), on = load(path.join(DIR, `on_${s}.json`));
    if (!off || !on) { console.log(`  ⚠시드 ${s} — 자료 없다(off ${!!off} · on ${!!on})`); continue; }
    got.push({ s, off, on });
  }
  if (!got.length) { console.log('\n측정 JSON 이 없다 — 위 실행 절차를 먼저 돌려라.\n'); process.exit(1); }

  const H = got[0].on;
  console.log(`\n=== T176 — T100 손잡이를 켠다 (실지도 51마을 · ${H.days}일 · 생활층 돎) ===`);
  console.log(`  베이스 ${H.base || '?'} · 앵커 N ${H.anchorN} · 유도 k ${H.k != null ? H.k.toFixed(4) : '—'}`
    + ` · 첫 수확일 ${H.seedFoodDays} · 텃밭 하한 ${H.garden ? '켬' : '끔'}(칸 ${H.gardenCells} · ${H.gardenFloor != null ? H.gardenFloor.toFixed(4) : '—'}/농부·일)`);

  // ── ⓐ OFF 팔 재현 — 셋째 판과 한 자라도 다른가 ──────────────────────────
  console.log('\nⓐ OFF 팔 재현 — 생활층을 붙여도 셋째 판(2b9f724e)과 같은 수인가');
  // ★열의 **자릿수는 `t17-metrics ⓚ` 가 찍은 그대로**다(인구·확장셀·게시 정수 · 무기Q 0자리 ·
  //   도구Q·보존식·생곡 1자리 · 밀도 2자리). 견주기도 그 자릿수로 한다 — 그 표가 그렇게 적혀 있으니
  //   "한 자도 안 다르다" 는 말은 **그 자릿수에서** 하는 말이다(더 조이면 없는 차이를 만든다).
  const C = [['pop', '인구', 0], ['dead', '소멸', 0], ['weapQ', '무기Q', 0], ['expand', '확장셀', 0],
    ['reqOpened', '게시', 0], ['toolQ', '도구Q', 1], ['preserved', '보존식', 1], ['rawGrain', '생곡', 1]];
  const fx = (x, d) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const cell = (o, k, d) => (k === 'dead' ? `${o.dead}/${o.ever}` : (typeof o[k] === 'number' ? fx(o[k], d || 0) : String(o[k])));
  console.log('  시드  줄       ' + C.map(([, k]) => k.padStart(11)).join('') + '   ㉮ 전체   ㉯ 값유형');
  let allSame = true;
  for (const g of got) {
    const c = CANON[g.s];
    console.log('  ' + String(g.s).padEnd(6) + '셋째 판'.padEnd(7)
      + (c ? C.map(([k, , d]) => cell(c, k, d).padStart(11)).join('') : ''.padStart(88))
      + (c ? c.dAll.toFixed(2).padStart(9) + c.dVal.toFixed(2).padStart(11) : ''));
    console.log('  ' + ''.padEnd(6) + '이 자'.padEnd(7)
      + C.map(([k, , d]) => cell(g.off, k, d).padStart(11)).join('')
      + g.off.densAll.toFixed(2).padStart(9) + g.off.densVal.toFixed(2).padStart(11));
    if (c) {
      const diff = C.filter(([k, , d]) => (k === 'dead' ? (c.dead !== g.off.dead || c.ever !== g.off.ever)
        : (+c[k]).toFixed(d || 0) !== (+g.off[k]).toFixed(d || 0))).map(([, ko]) => ko);
      if (c.dAll.toFixed(2) !== g.off.densAll.toFixed(2)) diff.push('㉮');
      if (c.dVal.toFixed(2) !== g.off.densVal.toFixed(2)) diff.push('㉯');
      if (diff.length) allSame = false;
      console.log('  ' + ''.padEnd(6) + '판정'.padEnd(7) + (diff.length ? ('  ⚠다른 열: ' + diff.join(' · ')) : '  ★열 열 개 전부 같다 — 생활층은 끄면 무해하다'));
    }
  }
  console.log(allSame ? '  ⇒ **되돌림 확인(§1-④): env 미설정 = 셋째 판 재현 — 한 팔 실측.**'
    : '  ⇒ ⚠셋째 판과 다르다 — 아래 ⓑ 를 읽기 전에 이 차이부터 귀속해야 한다.');

  // ── ⓑ ON 팔 — 여덟 수 + Δ + 소멸 마을(석재 바닥과 겹치나) ────────────────
  console.log('\nⓑ ON 팔 — 켜면 무엇이 달라지나 (OFF → ON)');
  console.log('  시드  팔     ' + C.map(([, k]) => k.padStart(11)).join('') + '   ㉮ 전체   ㉯ 값유형');
  for (const g of got) {
    for (const [t, o] of [['OFF', g.off], ['ON', g.on]]) {
      console.log('  ' + String(g.s).padEnd(6) + t.padEnd(7) + C.map(([k, , d]) => cell(o, k, d).padStart(11)).join('')
        + o.densAll.toFixed(2).padStart(9) + o.densVal.toFixed(2).padStart(11));
    }
    console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(7)
      + C.map(([k]) => (k === 'dead' ? `${g.on.dead - g.off.dead}` : pct(g.on[k], g.off[k])).padStart(11)).join('')
      + pct(g.on.densAll, g.off.densAll).padStart(9) + pct(g.on.densVal, g.off.densVal).padStart(11));
  }

  console.log('\nⓑ\' 소멸 마을 — 어느 마을인가 · 석재 바닥(T152 ⓛ 술어)과 겹치나');
  for (const g of got) {
    const om = new Map(g.off.per.map((p) => [p.name, p]));
    const dead = g.on.per.filter((p) => p.everPop && p.N <= 0);
    console.log(`  시드 ${g.s}  OFF 소멸 ${g.off.dead}/${g.off.ever} · ON 소멸 ${g.on.dead}/${g.on.ever}`
      + ` · 석재 바닥 ${g.on.stoneFloorN}/${g.on.ever}곳`);
    if (!dead.length) { console.log('    (ON 팔 소멸 0곳)'); continue; }
    console.log('    마을         OFF인구  ON최고  지력   물   숲   돌   사냥  석재바닥  밭칸(개간)  수확건  텃밭하한일');
    for (const p of dead) {
      const o = om.get(p.name) || {};
      console.log('    ' + String(p.name).padEnd(12) + String(o.N != null ? o.N : '—').padStart(7)
        + String(p.popMax).padStart(8) + r1(p.fert).padStart(6) + r1(p.water).padStart(6)
        + r1(p.wood).padStart(5) + r1(p.stone).padStart(6) + r1(p.game).padStart(6)
        + (p.stoneFloor ? '   ★예' : '  아니오').padStart(9)
        + `${p.cells}(${p.cleared})`.padStart(12) + String(p.harvestN).padStart(8) + String(p.floorDays).padStart(12));
    }
    const fl = dead.filter((p) => p.stoneFloor).length;
    console.log(`    ⇒ 소멸 ${dead.length}곳 중 석재 바닥 ${fl}곳 (${(fl / dead.length * 100).toFixed(0)}%)`
      + ` · 전체 석재 바닥 ${g.on.stoneFloorN}/${g.on.ever} (${(g.on.stoneFloorN / g.on.ever * 100).toFixed(0)}%)`);
  }

  // ── ⓒ 부양 실측 · 첫 수확일 곳간 · 텃밭 하한 ────────────────────────────
  console.log('\nⓒ 부양 실측 — `harvestN × k` 가 실제로 먹인 몫 (5판 1.37~1.47)');
  console.log('  시드   수확건    곳간유입(수확×k)   텃밭하한    유입 합   농부·해   **부양 실측**   앵커 N    차이   하한 몫');
  for (const g of got) {
    const o = g.on, harv = o.harvestNTot * o.k, floor = o.floorTot, inflow = harv + floor;
    const fy = o.fDaysTot / 365, sup = fy > 0 ? inflow / fy / 365 : 0;
    console.log('  ' + String(g.s).padEnd(7) + nf(o.harvestNTot).padStart(8) + nf(Math.round(harv)).padStart(17)
      + nf(Math.round(floor)).padStart(11) + nf(Math.round(inflow)).padStart(11) + nf(Math.round(fy)).padStart(10)
      + sup.toFixed(3).padStart(14) + String(o.anchorN).padStart(9)
      + ((sup - o.anchorN >= 0 ? '+' : '') + (sup - o.anchorN).toFixed(3)).padStart(8)
      + (inflow > 0 ? (floor / inflow * 100).toFixed(1) + '%' : '—').padStart(9));
  }
  console.log('\nⓒ\' 밭이 먹인 인구·밭 — **시간 적분 분모**로 나눈 것 (하루치 1 = 한 사람 하루치 2,450kcal)');
  console.log('    ⚠분모는 끝 인구가 아니라 Σ인구·일 / Σ밭칸·일 이다 — 인구가 800일 동안 자랐으므로');
  console.log('      끝 인구로 나누면 밭의 몫이 실제보다 작게 나온다(그건 틀린 수다).');
  console.log('  시드   Σ인구·일   Σ밭칸·일   Σ농부·일   유입/인구·일   유입/밭칸·일   농부/인구(평균)   밭칸/농부(평균)');
  for (const g of got) {
    const o = g.on, inflow = o.harvestNTot * o.k + o.floorTot;
    console.log('  ' + String(g.s).padEnd(7) + nf(o.popDaysTot).padStart(10) + nf(o.cellDaysTot).padStart(11)
      + nf(o.fDaysTot).padStart(10)
      + (o.popDaysTot > 0 ? (inflow / o.popDaysTot).toFixed(3) : '—').padStart(15)
      + (o.cellDaysTot > 0 ? (inflow / o.cellDaysTot).toFixed(3) : '—').padStart(15)
      + (o.popDaysTot > 0 ? (o.fDaysTot / o.popDaysTot * 100).toFixed(1) + '%' : '—').padStart(17)
      + (o.fDaysTot > 0 ? (o.cellDaysTot / o.fDaysTot).toFixed(1) : '—').padStart(17));
  }
  console.log('  ※`유입/인구·일` = **부양 실측 × 농부비율**(4판 ⓑ\' 문법 그대로) — 밭이 세계의 먹는 입 중 몇 할을 댔나.');

  // ⓒ''' 귀속 — 인구가 왜 움직였나(정본이 이미 남겨 둔 항만 옮겨 적는다 · 판정 0)
  console.log('\nⓒ\'\'\' 귀속 — 굶어서인가, 집이 없어서인가 (정본 `_dpDebug` 를 세기만 한 것)');
  console.log('  시드  팔    굶는 마을·일   주거게이트 마을·일   평균 집 수   곳간 식량등가(끝)   Σ밭칸·일   농부·해');
  for (const g of got) {
    for (const [t, o] of [['OFF', g.off], ['ON', g.on]]) {
      const fe = o.per.reduce((a, p) => a + (p.stockFoodEq || 0), 0);
      console.log('  ' + String(g.s).padEnd(6) + t.padEnd(6) + nf(o.hungerDaysTot).padStart(13)
        + nf(o.gatedDaysTot).padStart(21) + nf(Math.round(o.housingMeanTot)).padStart(13)
        + nf(Math.round(fe)).padStart(20) + nf(o.cellDaysTot).padStart(12)
        + nf(Math.round(o.fDaysTot / 365)).padStart(10));
    }
  }
  console.log('\nⓒ" 첫 수확일 곳간 — `daysToFirstHarvest(0)` 이 실제로 맞나 · 텃밭 하한이 걸리나');
  console.log('  시드  팔    창설곳간   첫 수확일(실측)   d40 곳간   d55 곳간   d100 곳간   d200 곳간   하한 마을·일   하한 마을수');
  for (const g of got) {
    for (const [t, o] of [['OFF', g.off], ['ON', g.on]]) {
      const T = o.granary || {};
      console.log('  ' + String(g.s).padEnd(6) + t.padEnd(6) + nf(Math.round(T.d0 || 0)).padStart(9)
        + String(o.firstHarvestDay != null ? o.firstHarvestDay : '—').padStart(16)
        + nf(Math.round(T.d40 || 0)).padStart(11) + nf(Math.round(T.d55 || 0)).padStart(11)
        + nf(Math.round(T.d100 || 0)).padStart(12) + nf(Math.round(T.d200 || 0)).padStart(12)
        + nf(o.floorDaysTot).padStart(15) + String(o.per.filter((p) => p.floorDays > 0).length).padStart(13));
    }
  }
  console.log(`  ※창설 곳간 = 초기인구 × \`seedFoodDays(0)\`=${H.seedFoodDays} (5판 ⓑ · \`crops.daysToFirstHarvest\` 유도).`);
  console.log('  ※"첫 수확일(실측)" 은 51마을 중 **가장 이른** 수확이 난 게임일이다(밭 상태기 실측 · 계측기 산수 0).');
  console.log('');
  process.exit(0);
}

// ── 측정 모드 — `t165-ab.js` 의 세계 + `farm-metrics.js` 의 생활층 ──────────
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t176-${process.pid}.db`;
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const CACHE = process.env.LAB_SEEDCACHE || '';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Events = R('server/events');
const Crops = R('server/crops');
const KCAL = R('server/kcal');
const JOBNAMES = econ.JOB_NAMES || Object.keys(econ.JOBS || {});   // ★정본 목록(사본 0)
// ★★[T207] 주거 상수는 **내보내기가 없다.** 계측기가 옮겨 적으면 그게 사본이고, 정본이 바뀌면
//   조용히 어긋난다 — 그래서 **정본 소스 텍스트에서 읽는다**(값을 이 파일에 한 자도 안 적는다).
const _ECONSRC = fs.readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim.js'), 'utf8');
const _constOf = (name) => { const m = _ECONSRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*([0-9.]+)\\s*;')); return m ? +m[1] : null; };
const HOUSE_WOOD = _constOf('HOUSE_WOOD'), HOUSE_DECAY = _constOf('HOUSE_DECAY');
const P = Villages.__labProbe;
const CP = P._cropProbe;
const CL = P._clearProbe || null;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;

P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

// ★씨앗 캐시는 `farm-metrics.js` 것과 **같은 모양**이다(`layout` 을 담는다 — 생활층이 그걸 먹는다).
let seeds = null;
if (CACHE && fs.existsSync(CACHE)) { try { seeds = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { seeds = null; } }
if (seeds && !(seeds[0] && seeds[0].layout)) { console.error('⚠캐시에 layout 이 없다 — 생활층을 못 세운다. `farm-metrics.js` 규약 캐시를 써라.'); process.exit(2); }
if (!seeds) {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  seeds = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, layout, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
  }
  if (CACHE) { try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(seeds)); } catch (e) {} }
}

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);          // ★T135 나무 층 — `t17-metrics` 와 같은 문(족보 130)
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

// ★생활층 — 정본 `attach` 가 만든다(계측기가 손으로 안 조립한다 · `farm-metrics.js` 와 같은 줄)
CP.setup(ta, world, null);
if (CL) CL.setup(ta, world, null);
const vils = seeds.map((s, i) => CP.attach({ dbId: i + 1, name: s.name, ccx: s.ccx, ccy: s.ccy, layout: s.layout, econ: world.villages[i] }));
const cells0 = vils.map((v) => v._farmSet.size);

const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap() });
L.prime(world);

// ── 800일 — econ 틱 · 장부 · 개간 · 밭 하루치(순서는 `t165-ab` + `farm-metrics` 를 이어 붙인 것) ──
const DAY_KCAL = KCAL.DAY_KCAL;                  // ★정본(사본 0)
// ★[귀속] 시간 적분 분모 — `부양 실측` 은 **농부·해**로 나눈 수다(4판 정본 문법). 같은 유입을
//   `인구·일`·`밭칸·일` 로도 나누려면 그 둘도 **800일 내내 더해야** 한다(끝 인구로 나누면 인구가
//   자란 만큼 분모가 부풀어 밭의 몫이 낮게 나온다 — 그건 틀린 수다).
//   `gatedDays` 는 정본이 매 틱 써 두는 `_dpDebug.gated` 를 **세기만** 한다(판정 0 · 새 계산 0).
const M = vils.map(() => ({ harvestN: 0, units: 0, foodEq: 0, sow: 0, fDays: 0, floorDays: 0, popMax: 0, first: null,
  popDays: 0, cellDays: 0, gatedDays: 0, hungerDays: 0, housingDays: 0, idleDays: 0,
  // ★[T186] 진단 누적기 — 전부 **정본이 이미 써 둔 값을 세기만** 한다(판정 0 · 새 계산 0).
  jobDays: Object.create(null),   // 직업별 마을·일(13직업 · ⓐ)
  prodLedger: 0,                  // Σ `dailyProductionBuf.food` — **실현 흐름 장부**가 본 식량(ⓑ 의 핵심)
  consFood: 0,                    // Σ `_consDay.food` — 그날 실제 소비(다음날 폴드 전에 읽는다)
  surplusSum: 0, surplusNegDays: 0,   // `surplusEMA.food` 의 합·음수 일수(v2 의 "적자 마을" 신호)
  famineDays: 0,                  // `totalFoodEquivalent < N×30` — 배분의 기근 게이트가 열린 날
  clearedFracDays: 0,             // `_clearedFrac` 이 실제로 심긴 날(0 이면 그 다리는 죽어 있다)
  priceSum: 0, priceN: 0,         // 식량 그림자가격 표본(10일마다 · 배분식의 `w('food')`)
  // ★[T193] 장부·주거 게이트 — 전부 정본이 써 둔 값을 **읽기만** 한다
  ledgerDays: 0,                  // `dailyProductionBuf.food > 0` 인 날(장부가 밭을 본 날 · 덩어리인가 흐름인가)
  houseUp: 0, houseDown: 0, houseDelta: 0,   // 집이 는 날 / 준 날 / 순변화(노후화 대 건축)
  // ★[T207] 목재 수지 — 전부 정본이 써 둔 값을 **읽기만** 한다(판정 0 · 새 수 0)
  woodProd: 0,        // Σ `dailyProductionBuf.wood` — 벌목 실현 산출
  woodCons: 0,        // Σ `_consDay.wood` — `_cons` 로 잡히는 유출 **둘뿐**(연료 `:3028` + 건축 `:3047`)
  woodBuilt: 0,       // Σ 건축이 먹은 목재 = Σ(그날 지은 양) × HOUSE_WOOD(정본에서 읽은 값)
  builtSum: 0,        // Σ 그날 지은 수용력(= housing_t − housing_{t−1}×(1−HOUSE_DECAY))
  woodStockSum: 0, woodZeroDays: 0,   // 재고 평균 · **한 채도 못 지을 만큼 모자란 날**(재고 < HOUSE_WOOD)
  priceWoodSum: 0, priceWoodN: 0,     // 목재 그림자가격 표본(식량과 같은 자리·같은 문법)
  fuelCovSum: 0,
  d40: null,                      // 40일째 한 장(게이트가 처음 걸리는 그 날 · 카드 ④)
  traj: [] }));                   // ⓒ 궤적(20일마다)
const IX = new Map(vils.map((v, i) => [v, i]));
const GRAN = {};
let clearedTot = 0;
const _foodSum = () => world.villages.reduce((a, v) => a + ((v.storage && v.storage.food) || 0), 0);
GRAN.d0 = _foodSum();

const _log = console.log; console.log = () => {};
for (let day = 0; day < DAYS; day++) {
  const floorBefore = vils.map((v) => (v.econ && v.econ._t100FloorTot) || 0);
  econV2.tickWorldV2(world);
  L.scanDay(world, world.day, {});                                   // ★장부는 관측자 — `t165-ab` 과 같은 자리
  if (CL) clearedTot += CL.tickDay(vils) || 0;
  for (const v of vils) {
    const ev = v.econ; if (!ev) continue;
    const m = M[IX.get(v)];
    const n = (ev.npcs || []).length;
    if (n > m.popMax) m.popMax = n;
    m.popDays += n;
    m.cellDays += v._farmSet.size;
    m.housingDays += +(ev.housing || 0);
    m.idleDays += +(ev._idleFrac || 0);
    // ★[T186] 오늘의 장부 — 틱이 막 끝났으므로 `dailyProductionBuf`·`_consDay` 는 **오늘치**다
    //   (`_consDay` 는 내일 틱 머리에서 `_consEMA` 로 접히며 0 이 된다 — 그 전에 읽는다).
    for (const j of JOBNAMES) { const c = (ev.counts && ev.counts[j]) || 0; if (c) m.jobDays[j] = (m.jobDays[j] || 0) + c; }
    const _led = +((ev.dailyProductionBuf && ev.dailyProductionBuf.food) || 0);
    m.prodLedger += _led; if (_led > 0) m.ledgerDays++;
    const _h = ev.housing != null ? +ev.housing : null;
    if (_h != null && m._hPrev != null) { const d = _h - m._hPrev; m.houseDelta += d; if (d > 1e-9) m.houseUp++; else if (d < -1e-9) m.houseDown++; }
    // ★[T207] 그날 **지은 양** — 정본은 `housing *= (1−HOUSE_DECAY)` 뒤 `housing += built` 이므로
    //   `built = housing_t − housing_{t−1}×(1−HOUSE_DECAY)` 다(역산 · 새 수 0).
    if (_h != null && m._hPrev != null && HOUSE_DECAY != null) {
      const _b = _h - m._hPrev * (1 - HOUSE_DECAY);
      if (_b > 1e-12) { m.builtSum += _b; if (HOUSE_WOOD != null) m.woodBuilt += _b * HOUSE_WOOD; }
    }
    if (_h != null) m._hPrev = _h;
    m.woodProd += +((ev.dailyProductionBuf && ev.dailyProductionBuf.wood) || 0);
    m.woodCons += +((ev._consDay && ev._consDay.wood) || 0);
    const _ws = +((ev.storage.wood || 0));
    m.woodStockSum += _ws; if (HOUSE_WOOD != null && _ws < HOUSE_WOOD) m.woodZeroDays++;
    m.fuelCovSum += +((ev._fuelCov != null ? ev._fuelCov : 1));
    if (day % 10 === 0 && typeof world.priceFn === 'function') {
      try { const _pw = world.priceFn(ev); if (_pw && _pw.wood > 0) { m.priceWoodSum += _pw.wood; m.priceWoodN++; } } catch (e) {}
    }
    if (day === 40) m.d40 = { N: n, housing: _h != null ? +_h.toFixed(2) : null,
      mapBeds: ev._mapBeds != null ? +ev._mapBeds : null,
      gated: !!(ev._dpDebug && ev._dpDebug.gated), dP: ev._dpDebug ? +(+ev._dpDebug.dP).toFixed(3) : null,
      K: ev._dpDebug ? +(+ev._dpDebug.K).toFixed(1) : null,
      wood: +((ev.storage.wood || 0)).toFixed(1), stone: +((ev.storage.stone || 0)).toFixed(1),
      pebble: +((ev.storage.pebble || 0)).toFixed(1),
      foodEq: +econ.totalFoodEquivalent(ev).toFixed(1),
      woodProd: +m.woodProd.toFixed(1), woodCons: +m.woodCons.toFixed(1), woodBuilt: +m.woodBuilt.toFixed(1),
      lumber: (ev.counts && ev.counts.lumberjack) || 0, woodZeroDays: m.woodZeroDays };
    m.consFood += +((ev._consDay && ev._consDay.food) || 0);
    const _sp = (ev.surplusEMA && ev.surplusEMA.food) || 0;
    m.surplusSum += _sp; if (_sp < 0) m.surplusNegDays++;
    if (n > 0 && econ.totalFoodEquivalent(ev) < n * 30) m.famineDays++;
    if (ev._clearedFrac != null) m.clearedFracDays++;
    if (day % 10 === 0 && typeof world.priceFn === 'function') {
      try { const _pt = world.priceFn(ev); if (_pt && _pt.food > 0) { m.priceSum += _pt.food; m.priceN++; } } catch (e) {}
    }
    if (day % 20 === 0) m.traj.push({ d: day, N: n,
      fN: (ev.counts && ev.counts.farmer) || 0, cells: v._farmSet.size,
      food: +((ev.storage.food || 0)).toFixed(1), foodEq: +econ.totalFoodEquivalent(ev).toFixed(1),
      house: ev.housing != null ? +(+ev.housing).toFixed(1) : null,
      sp: +_sp.toFixed(3), prodK: ev._kDbg ? ev._kDbg.prod : null, fuelK: ev._kDbg ? ev._kDbg.fuel : null,
      gated: !!(ev._dpDebug && ev._dpDebug.gated) });
    if (ev._dpDebug && ev._dpDebug.gated) m.gatedDays++;
    if ((ev.hunger || 0) > 0) m.hungerDays++;
    if (ev.npcs && ev.npcs.length) m.fDays += (ev.counts && ev.counts.farmer) || 0;
    if (((ev._t100FloorTot || 0) - floorBefore[IX.get(v)]) > 0) m.floorDays++;
  }
  CP.tickDay(vils, day, (vil, k, t, c0, p0, e1) => {
    const m = M[IX.get(vil)];
    if (t === 2) { m.sow++; return; }
    if (t === 5 && c0) {                                             // 수확 — 산출은 정본 식(`Crops.harvestUnits`)
      const u = Crops.harvestUnits(c0, { supply: vil._drySet.has(k) ? 1 : 5, seedFresh: 1 });
      const c = Crops.get(c0);
      m.harvestN++; m.units += u; m.foodEq += u * (Crops.kgOf(c0) || 0) * ((c && c.kcal) || 0) / DAY_KCAL;
      if (m.first == null) m.first = day;
    }
  });
  if (day === 39) GRAN.d40 = _foodSum();
  if (day === 54) GRAN.d55 = _foodSum();
  if (day === 99) GRAN.d100 = _foodSum();
  if (day === 199) GRAN.d200 = _foodSum();
}
console.log = _log;
GRAN.dEnd = _foodSum();

// ── 읽는 자리는 `t17-metrics ⓐⓓⓔⓚⓛ` 와 같다 ──────────────────────────────
const stockOf = (r) => world.villages.reduce((a, v) => a + (v.storage[r] || 0), 0);
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const RAWGRAIN = ['wheat', 'rice', 'barley', 'millet'];     // ★`t17-metrics ⓚ` 의 그 넷(T73 이 만든 열)
const STONE_FLOOR = 0.25;                                   // ★T152 ⓛ 와 같은 술어(`land.stone == FLOOR`)
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0, stoneFloorN = 0;
const per = [];
for (let i = 0; i < world.villages.length; i++) {
  const v = world.villages[i], m = M[i];
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
  toolQ += (v.storage.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
  const sf = Math.abs((v.land.stone || 0) - STONE_FLOOR) < 1e-9;
  if (sf) stoneFloorN++;
  per.push({ name: v.name, N: n, everPop: !!v._everPop, popMax: m.popMax,
    fN: (v.counts && v.counts.farmer) || 0, fDays: m.fDays,
    happy: v.lastStats ? +v.lastStats.happiness.toFixed(3) : null,
    health: v.lastStats ? +v.lastStats.health.toFixed(3) : null,
    fert: +(v.land.fertility || 0).toFixed(2), water: +(v.land.water || 0).toFixed(2),
    wood: +(v.land.wood || 0).toFixed(2), stone: +(v.land.stone || 0).toFixed(2),
    game: +(v.land.game || 0).toFixed(2), stoneFloor: sf,
    cells0: cells0[i], cells: vils[i]._farmSet.size, cleared: vils[i]._farmSet.size - cells0[i],
    sow: m.sow, harvestN: m.harvestN, units: m.units, fieldFoodEq: +m.foodEq.toFixed(1),
    floorTot: +((v._t100FloorTot || 0)).toFixed(1), floorDays: m.floorDays, firstHarvest: m.first,
    popDays: m.popDays, cellDays: m.cellDays, gatedDays: m.gatedDays, hungerDays: m.hungerDays,
    housingMean: +(m.housingDays / DAYS).toFixed(1),
    // ★[T183 ⓐ] `addProduce` 를 건너뛰는 바람에 켠 팔이 잃는 것 전수 — 정본이 이미 써 둔 값만 옮겨 적는다.
    //   `_kDbg` = K 분해(자리·생산·연료) · `_idleFrac` = 잠재 대비 실제(여가→행복 · 교역 동시성 상한의 밑변).
    kSlot: v._kDbg ? v._kDbg.slot : null, kProd: v._kDbg ? v._kDbg.prod : null, kFuel: v._kDbg ? v._kDbg.fuel : null,
    // ★[T186] ⓐ 직업 · ⓑ 수지 · ⓒ 궤적
    jobDays: m.jobDays, prodLedger: +m.prodLedger.toFixed(1), consFood: +m.consFood.toFixed(1),
    ledgerDays: m.ledgerDays, houseUp: m.houseUp, houseDown: m.houseDown, houseDelta: +m.houseDelta.toFixed(2),
    woodProd: +m.woodProd.toFixed(1), woodCons: +m.woodCons.toFixed(1), woodBuilt: +m.woodBuilt.toFixed(1),
    woodFuel: +(m.woodCons - m.woodBuilt).toFixed(1), builtSum: +m.builtSum.toFixed(2),
    woodStockMean: +(m.woodStockSum / DAYS).toFixed(2), woodZeroDays: m.woodZeroDays,
    woodStockEnd: +((v.storage.wood || 0)).toFixed(1),
    woodImported: +((v.tradeStats && v.tradeStats.woodImported) || 0).toFixed(1),
    priceWood: m.priceWoodN ? +(m.priceWoodSum / m.priceWoodN).toFixed(4) : null,
    fuelCovMean: +(m.fuelCovSum / DAYS).toFixed(4),
    mapBeds: v._mapBeds != null ? +v._mapBeds : null, d40: m.d40,
    surplusMean: +(m.surplusSum / DAYS).toFixed(4), surplusNegDays: m.surplusNegDays,
    famineDays: m.famineDays, clearedFracDays: m.clearedFracDays,
    priceFood: m.priceN ? +(m.priceSum / m.priceN).toFixed(4) : null,
    taxFood: +((v.treasury && v.treasury.food) || 0).toFixed(1),
    foodImported: +((v.tradeStats && v.tradeStats.foodImported) || 0).toFixed(1),
    cargoSent: (v.tradeStats && v.tradeStats.cargoSent) || 0,
    caravans: (v.tradeStats && v.tradeStats.caravansSent) || 0,
    traj: m.traj,
    idleFrac: v._idleFrac != null ? +(+v._idleFrac).toFixed(4) : null,
    idleMean: +(m.idleDays / DAYS).toFixed(4),
    econFood: +((v.storage.food || 0)).toFixed(1), stockFoodEq: +econ.totalFoodEquivalent(v).toFixed(1),
    hunger: v.hunger != null ? +(+v.hunger).toFixed(3) : null,
    housing: v.housing != null ? +(+v.housing).toFixed(1) : null,
    prodK: v._prodKema != null ? +v._prodKema.toFixed(1) : null,
    fuelK: v._fuelKema != null ? +v._fuelKema.toFixed(1) : null,
    dp: v._dpDebug || null });
}
const S = L.stats || {};
const DEED = new Set(Events.DEED_TYPES || []);
const B = S.byType || {};
let vN = 0, dN = 0;
for (const t of Events.TYPES) { const n = B[t] || 0; if (DEED.has(t)) dN += n; else vN += n; }
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
const dens = (n) => (n > 0 ? (live * DAYS / n) : Infinity);
const firsts = M.map((m) => m.first).filter((x) => x != null);

const out = {
  days: DAYS, seed: SEED, base: process.env.T176_BASE || '',
  arm: econ.T100_FIELD_YIELD ? 'on' : 'off', knob: econ.T100_FIELD_YIELD,
  k: econ.T100_K, anchorN: econ.T100_ANCHOR_N, seedFoodDays: econ.seedFoodDays(0),
  garden: econ.T100_GARDEN, gardenCells: econ.T100_GARDEN_CELLS, gardenFloor: econ.T100_GARDEN_FLOOR,
  landNeed: (CL && CL.L_LANDNEED) || null,
  pop, dead, ever, live, weapQ: +weapQ.toFixed(1), expand, toolQ: +toolQ.toFixed(1),
  preserved: +PRESERVED.reduce((a, r) => a + stockOf(r), 0).toFixed(1),
  rawGrain: +RAWGRAIN.reduce((a, r) => a + stockOf(r), 0).toFixed(1),
  reqOpened: S.reqOpened || 0, reqClosed: S.reqClosed || 0, reqShrunk: S.reqShrunk || 0,
  reqNoPay: S.reqNoPay || 0, reqRevalidated: S.reqRevalidated || 0,
  emitted: S.emitted || 0, evVal: vN, evDeed: dN,
  densAll: +dens(S.emitted).toFixed(4), densVal: +dens(vN).toFixed(4),
  trades: (world.tradeLog || []).length, stoneFloorN,
  cells0Tot: cells0.reduce((a, x) => a + x, 0), cellsTot: vils.reduce((a, v) => a + v._farmSet.size, 0),
  clearedTot, harvestNTot: M.reduce((a, m) => a + m.harvestN, 0), sowTot: M.reduce((a, m) => a + m.sow, 0),
  fieldFoodEqTot: +M.reduce((a, m) => a + m.foodEq, 0).toFixed(1),
  fDaysTot: M.reduce((a, m) => a + m.fDays, 0),
  popDaysTot: M.reduce((a, m) => a + m.popDays, 0), cellDaysTot: M.reduce((a, m) => a + m.cellDays, 0),
  gatedDaysTot: M.reduce((a, m) => a + m.gatedDays, 0), hungerDaysTot: M.reduce((a, m) => a + m.hungerDays, 0),
  housingMeanTot: +M.reduce((a, m) => a + m.housingDays / DAYS, 0).toFixed(1),
  idleMeanTot: +(M.reduce((a, m) => a + m.idleDays / DAYS, 0) / Math.max(1, M.length)).toFixed(4),
  kProdTot: +per.reduce((a, p) => a + (p.kProd || 0), 0).toFixed(1),
  kFuelTot: +per.reduce((a, p) => a + (p.kFuel || 0), 0).toFixed(1),
  kSlotTot: +per.reduce((a, p) => a + (p.kSlot || 0), 0).toFixed(1),
  jobDaysTot: (() => { const o = Object.create(null); for (const p of per) for (const j in p.jobDays) o[j] = (o[j] || 0) + p.jobDays[j]; return o; })(),
  prodLedgerTot: +per.reduce((a, p) => a + p.prodLedger, 0).toFixed(1),
  consFoodTot: +per.reduce((a, p) => a + p.consFood, 0).toFixed(1),
  surplusNegDaysTot: per.reduce((a, p) => a + p.surplusNegDays, 0),
  famineDaysTot: per.reduce((a, p) => a + p.famineDays, 0),
  clearedFracDaysTot: per.reduce((a, p) => a + p.clearedFracDays, 0),
  priceFoodMean: +(per.filter((p) => p.priceFood != null).reduce((a, p) => a + p.priceFood, 0)
                   / Math.max(1, per.filter((p) => p.priceFood != null).length)).toFixed(4),
  taxFoodTot: +per.reduce((a, p) => a + p.taxFood, 0).toFixed(1),
  foodImportedTot: +per.reduce((a, p) => a + p.foodImported, 0).toFixed(1),
  cargoSentTot: per.reduce((a, p) => a + p.cargoSent, 0),
  ledgerDaysTot: per.reduce((a, p) => a + p.ledgerDays, 0),
  houseUpTot: per.reduce((a, p) => a + p.houseUp, 0), houseDownTot: per.reduce((a, p) => a + p.houseDown, 0),
  mapBedsSeen: per.filter((p) => p.mapBeds != null).length,
  ledger: econ.T193_LEDGER === true,
  HOUSE_WOOD, HOUSE_DECAY,   // ★정본에서 읽은 값(계측기에 숫자를 안 적었다는 증거로 같이 담는다)
  woodProdTot: +per.reduce((a, p) => a + p.woodProd, 0).toFixed(1),
  woodConsTot: +per.reduce((a, p) => a + p.woodCons, 0).toFixed(1),
  woodBuiltTot: +per.reduce((a, p) => a + p.woodBuilt, 0).toFixed(1),
  woodFuelTot: +per.reduce((a, p) => a + p.woodFuel, 0).toFixed(1),
  woodImportedTot: +per.reduce((a, p) => a + p.woodImported, 0).toFixed(1),
  woodStockEndTot: +per.reduce((a, p) => a + p.woodStockEnd, 0).toFixed(1),
  woodZeroDaysTot: per.reduce((a, p) => a + p.woodZeroDays, 0),
  priceWoodMean: +(per.filter((p) => p.priceWood != null).reduce((a, p) => a + p.priceWood, 0)
                   / Math.max(1, per.filter((p) => p.priceWood != null).length)).toFixed(4),
  fuelCovMean: +(per.reduce((a, p) => a + p.fuelCovMean, 0) / Math.max(1, per.length)).toFixed(4),
  caravansTot: per.reduce((a, p) => a + p.caravans, 0),
  floorTot: +world.villages.reduce((a, v) => a + (v._t100FloorTot || 0), 0).toFixed(1),
  floorDaysTot: M.reduce((a, m) => a + m.floorDays, 0),
  firstHarvestDay: firsts.length ? Math.min(...firsts) : null,
  econFoodTot: +_foodSum().toFixed(1), granary: GRAN, per,
};
console.log(`\n[T176] 시드 ${SEED} · ${DAYS}일 · 팔 ${out.arm.toUpperCase()} (T100_FIELD_YIELD ${out.knob ? '켬' : '끔'} · 텃밭 ${out.garden ? '켬' : '끔'})`);
console.log(`  인구 ${pop.toLocaleString()} · 소멸 ${dead}/${ever} · 무기Q ${Math.round(weapQ)} · 확장셀 ${expand.toLocaleString()} · 게시 ${out.reqOpened.toLocaleString()} · 도구Q ${out.toolQ.toFixed(1)} · 보존식 ${out.preserved.toFixed(1)} · 생곡 ${out.rawGrain.toFixed(1)}`);
console.log(`  밀도 ㉮ ${out.densAll.toFixed(2)} · ㉯ ${out.densVal.toFixed(2)} 일/건 · 밭칸 ${out.cells0Tot.toLocaleString()}→${out.cellsTot.toLocaleString()}(개간 ${out.clearedTot.toLocaleString()}) · 수확 ${out.harvestNTot.toLocaleString()}건 · 첫 수확일 ${out.firstHarvestDay}`);
console.log(`  곳간 ${Math.round(out.econFoodTot).toLocaleString()} · 텃밭 하한 ${Math.round(out.floorTot).toLocaleString()}(마을·일 ${out.floorDaysTot.toLocaleString()}) · 석재 바닥 ${stoneFloorN}/${ever}곳`);
if (process.env.T176_JSON) {
  try { fs.mkdirSync(path.dirname(process.env.T176_JSON), { recursive: true }); fs.writeFileSync(process.env.T176_JSON, JSON.stringify(out, null, 1));
    console.log(`  [json] ${process.env.T176_JSON}`); } catch (e) { console.log('  [json] 실패: ' + e.message); }
}
