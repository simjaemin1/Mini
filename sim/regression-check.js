// durango-mini 회귀 자동 검사 — CHECKLIST.md의 불변식을 5시드로 PASS/FAIL.
//   실행: node sim/regression-check.js   (엔진 수정 후엔 먼저 build+inline)
//   헤드리스: 마을실험실.html의 라이프 시뮬을 fast 모드로 구동 + econ 엔진 번들.
//   ★병렬화: 시드별 자식 프로세스 5개 동시 실행(--seed 모드) + 마스터는 그동안 장기수렴(19) 계산 → 벽시계 ~43s → ~12s.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');           // /Mini
const LAB = path.join(ROOT, '마을실험실.html');
require(path.join(__dirname, 'economy-engine.browser.js'));
const SEEDS = [7, 42, 8, 3, 19];
const CHILD_SEED = process.argv[2] === '--seed' ? +process.argv[3] : null;
const CHILD_FRAMES = process.argv[4] === '--frames' ? +process.argv[5] : 1500;   // ★수동 자식 실행 한정 지평 축소(45초 프로세스 회수 회피용) — 마스터 병렬·기본값은 1500 그대로
// ★결정론: 하네스 한정 시드 RNG(mulberry32) — H14/H15 문턱 플레이크·시드런 인구 분산(±150)의 원천이던 Math.random 비시드 제거. 브라우저 랩은 비시드 유지.
{let _s0=(typeof CHILD_SEED!=='undefined'&&CHILD_SEED!=null?CHILD_SEED:7)*2654435761>>>0;Math.random=function(){_s0=_s0+0x6D2B79F5|0;let t=Math.imul(_s0^_s0>>>15,1|_s0);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}


// ═══════════════ 자식 모드: 시드 1개 구동 + 부분 집계 JSON 출력 ═══════════════
if (CHILD_SEED != null) {
  const H = fs.readFileSync(LAB, 'utf8');
  // ── 헤드리스 브라우저 환경 ──
  const _log = console.log;
  // ★실축 대이행(캐논 §3e) 환경 재캘리브레이션: 헤드리스 하니스가 미러하는 월드 상수 — N 400→1600(1.6×1.6km), 본체 마을실험실.html의 N과 일치해야 함.
  global.N = 1600; global.idx = (x, y) => y * 1600 + x; global.inG = (x, y) => x >= 0 && y >= 0 && x < 1600 && y < 1600;
  global.smt = t => t * t * (3 - 2 * t);
  global.hash2 = (ix, iy, s) => { let h = ix * 374761393 + iy * 668265263 + s * 1274126177; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  global.vn = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s); const u = smt(fx), v = smt(fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
  global.fbm = (x, y, s) => { let t = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { t += a * vn(x * f, y * f, s + i * 31); a *= .5; f *= 2; } return t; };
  global.MAX_CELLS = Math.PI * 135 * 135;   // ★R_MAX_CELLS 60→135(§3b) 미러 — 영토 비상 백스톱(실질 정지는 MB/MC·프론티어가 먼저)
  const vals = { pop: '8', fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: '7', terrMode: 'auto', simSpeed: '80000', nvil: '8' };   // ★nvil 3→8(§3e 기본값): 회귀도 신세계 기본 밀도로 검사
  const els = {}; global.document = { getElementById: id => els[id] || (els[id] = { value: vals[id] != null ? vals[id] : '0', textContent: '', innerHTML: '', checked: false, addEventListener: () => {} }) };
  global.draw = () => {}; global.V = null; global.TR = null; global.life = null; global.lifeOn = false; global.lifeGM = 0; global.lifeLast = 0; global.lifeSlow = false;
  global.buildWalls = () => new Set(); global.nowMs = 0; global.performance = { now: () => global.nowMs }; global.rafCb = null; global.requestAnimationFrame = cb => { global.rafCb = cb; };
  const grab = re => { const m = H.match(re); if (!m) throw new Error('패턴 못찾음: ' + re); return m[0]; };
  const BT = grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/), VL = grab(/const VillageLayout=\(function\(\)\{[\s\S]*?\}\)\(\);/),
    PC = grab(/function pickCenter\(\)\{[\s\S]*?\n\}/), BFS = grab(/function bfsPath\([\s\S]*?\n\}/), SP = grab(/function setPath\([\s\S]*?\n\}/),
    TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),   // 교역로·다리·길(데지어패스) 블록
    LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
  global.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
  global.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
  global.frame = function () { global.nowMs += 16; const cb = global.rafCb; global.rafCb = null; if (cb) cb(global.nowMs); };
  global.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE +
    "\nglobal.run=function(seed){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*1440;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;var bad=0,initVil=VILS.length;for(var fr=0;fr<(global.__frames||1500);fr++){global.frame();if(fr%300===0)for(var k=0;k<VILS.length;k++)if(VILS[k].agents.length!==VILS[k].econ.npcs.length)bad++;}console.log=global.__log;return {bad:bad,initVil:initVil,VILS:VILS,world:ECON_WORLD};};");
  global.__frames = CHILD_FRAMES;
  global.__log = _log; console.log = _log;

  const STAPLE = new Set(['food', 'fish', 'meat', 'stone', 'ore', 'wood', 'iron', 'copper', 'tin']);
  const ORN = new Set(['gold', 'silver', 'gem', 'tigerhide']);   // ★호피(§9 3차)=위신재 교역 부류(tradeOrn 집계 편입)
  const p = { seed: CHILD_SEED, pop: 0, bad: 0, initVil: 0, finalVil: 0, mining: 0, forest: 0, bronze: 0, iron: 0, stoneTool: 0, copperTin: 0,
    weaponShort: 0, villages: 0, houses: 0, tradeStaple: 0, tradeOrn: 0, craftBloat: 0, maxCraftFrac: 0,
    maxAccumPer: 0, maxVilPop: 0, smithVil: 0, housesTot: 0, housesOut: 0, terrSync: 0, terrOverlap: 0, gameUsed: 0, gameDead: 0, crashed: false, seedRow: '',
    // ★청동→석기 전환 검증용 추가 계측(additive): 도구의존인구(per-pc 분모), 구리소비(도구·무기 누적), 청동무기 생산·마을수
    toolDepPop: 0, cuToolUsed: 0, cuWeapUsed: 0, bronzeWeaponMade: 0, bronzeVil: 0, copperStock: 0, tinStock: 0, ironMetal: 0 };
  try {
    const r = global.run(CHILD_SEED);
    p.bad = r.bad; p.initVil = r.initVil; p.finalVil = r.VILS.length;
    for (const v of r.VILS) {
      const e = v.econ, c = e.counts, S = e.storage, n = e.npcs.length; p.villages++; p.pop += n;
      const mine = (c.miner || 0) + (c.prospector || 0), forest = (c.hunter || 0) + (c.forager || 0) + (c.lumberjack || 0);
      if (mine > n * 0.04) p.mining++; if (forest > n * 0.15) p.forest++;
      p.bronze += S.bronze_tool || 0; p.iron += S.iron_tool || 0; p.stoneTool += S.tool || 0;
      p.copperTin += (S.copper || 0) + (S.tin || 0);
      p.ironMetal += S.iron || 0;   // ★철금속 재고(청동무기 모델: 청동금속[구리+주석] > 철금속 = 청동 우위 불변식 #8)
      // ★청동→석기 전환 검증 계측 집계
      p.toolDepPop += e._toolDeps || 0;
      p.cuToolUsed += e._cuToolUsed || 0; p.cuWeapUsed += e._cuWeapUsed || 0;
      p.bronzeWeaponMade += e._bronzeWeaponMade || 0; if ((e._bronzeWeaponMade || 0) > 0) p.bronzeVil++;
      p.copperStock += S.copper || 0; p.tinStock += S.tin || 0;
      p.stoneToolMade = (p.stoneToolMade||0) + (e._stoneToolMade||0);   // 석기 대체 flow(청동→석기 전환 검증)
      // ★청동 희소성 검증(additive): 근접검 재고 = weapon × 근접검비중(_swordFrac), 청동/석기 몫 = 근접검 × (재료별 flow비중). 활 제외 청동무기/명 산출.
      { const sf = (e._swordFrac != null ? e._swordFrac : 0.5), wp = (S.weapon || 0), sword = wp * sf;
        const _br = e._bronzeWeaponMade || 0, _st = e._stoneWeaponMade || 0, _ir = e._ironWeaponMade || 0, _mf = _br + _st + _ir;
        p.bronzeMeleeStock = (p.bronzeMeleeStock || 0) + sword * (_mf > 0 ? _br / _mf : 0);
        p.stoneMeleeStock = (p.stoneMeleeStock || 0) + sword * (_mf > 0 ? _st / _mf : 0);
        p.meleeStock = (p.meleeStock || 0) + sword; p.bowStock = (p.bowStock || 0) + wp * (1 - sf);
        p.stoneWeaponMade = (p.stoneWeaponMade || 0) + _st; p.ironWeaponMade = (p.ironWeaponMade || 0) + _ir;
        if ((e.land && e.land.tin || 0) > 0) p.tinDepVil = (p.tinDepVil || 0) + 1;
        if (_mf > 0) { if (_br >= _st) p.bronzeArmedVil = (p.bronzeArmedVil || 0) + 1; else p.stoneArmedVil = (p.stoneArmedVil || 0) + 1; } }
      if ((S.weapon || 0) < (c.warrior || 0) * 0.7) p.weaponShort++;
      // ★장인 비대 가드 — 야금공(대장+무기장+갑옷장)이 인구의 15% 초과면 정원 제거가 스톡-플로우 없이 폭주한 것.
      const craftFrac = ((c.smith || 0) + (c.weaponsmith || 0) + (c.armorsmith || 0)) / Math.max(1, n);
      if (craftFrac > 0.15) p.craftBloat++;
      if (craftFrac > p.maxCraftFrac) p.maxCraftFrac = craftFrac;
      // ★누적 통제 — 무용재(광석)·돌이 1인당 과대면 생산 포만/부패가 안 듣는 것.
      const accumPer = Math.max((S.ore || 0), (S.stone || 0)) / Math.max(1, n);
      if (accumPer > p.maxAccumPer) p.maxAccumPer = accumPer;
      // ★자연 K(리비히 min + MB/MC 확장정지) 작동(폭주 아님). + 대장장이 보유 마을 카운트(소형마을 floor)
      if (n > p.maxVilPop) p.maxVilPop = n;
      if ((c.smith || 0) >= 1) p.smithVil++;
      p.houses += (v.houses ? v.houses.length : 0);
      // ★집이 영토 안인지 — 영토 점진확장(growTerritory)이 집보다 앞서고 집은 그 안에서 생기는지.
      if (v.V && v.V.territory) {
        const tset = new Set(v.V.territory.map(cc => cc[0] + ',' + cc[1]));
        for (const h of (v.houses || [])) { p.housesTot++; if (!tset.has(Math.round(h.cx) + ',' + Math.round(h.cy))) p.housesOut++; }
      }
    }
    for (const t of (r.world.tradeLog || [])) {
      for (const side of [t.sent, t.bought]) { if (!side) continue; if (STAPLE.has(side.res)) p.tradeStaple += side.amt || 0; else if (ORN.has(side.res)) p.tradeOrn += side.amt || 0; if (side.res === 'tigerhide') p.thTrade = (p.thTrade || 0) + (side.amt || 0); }
    }
    // ★20/21: 공간 영토 = econ land.size 동기(E2c) + 마을 간 영토 겹침 0(전역 소유맵)
    const _seen = new Map();
    for (const v of r.VILS) {
      if (v.econ && v.V && v.V.territory && (v.econ.land.size * 25 - v.V.territory.length) > 60) p.terrSync++;   // ★재캘리브레이션(완공 계약 2026-07-07): 양방향 |오차|→econ 리드 지연(한방향)만. 주택 압력(_hLots=수용력÷16부지×600셀+코어)이 영토를 econ land×25 너머로 견인하는 게 계약의 설계라 terr>e25는 정상(실측 5시드 31마을: terr 2850~9900 = 주택 부지 목표와 정확히 일치, e25 2850~3525, terr<e25 방향 위반 0). E2c의 원 결함 모드(영토가 econ 투자를 못 따라 조용히 정지 — growTerritory 영구정지 버그 재발)는 동일 임계 60셀로 계속 검출
      if (v.V && v.V.territory) for (const c of v.V.territory) { const k = c[0] + ',' + c[1]; if (_seen.has(k) && _seen.get(k) !== v) p.terrOverlap++; _seen.set(k, v); }
      // ★22: 사냥감 생태 — 압력 실재(개체 감소 발생) + 서식지 남은 전면 절멸 0(로지스틱+확산 회복)
      if (v.gameRich && v._initGameTotal > 1) {
        let gsum = 0; for (const g of v.gameRich.values()) gsum += g;
        if (gsum / v._initGameTotal < 0.95) p.gameUsed++;
        if (gsum === 0 && v.gameRich.size > 50) p.gameDead++;
      }
      // ★23: 사냥 산출 — 고기 재고·사냥꾼 총원(붕괴 감시: 2026-07 숙련 분할 때 미측정 갭 발견 → 불변식화)
      p.meat = (p.meat || 0) + (v.econ && v.econ.storage ? (v.econ.storage.meat || 0) : 0);
      p.hunterN = (p.hunterN || 0) + (v.econ && v.econ.counts ? Math.round(v.econ.counts.hunter || 0) : 0);
      // ★약재 유통 진단(§9 2차): 잔고+누적소비(_herbUsed=일상복용+요양) — 0 고착=공급 결함, 소비 0=수요 결함
      p.herb = (p.herb || 0) + (v.econ && v.econ.storage ? (v.econ.storage.herb || 0) : 0);
      p.herbUsed = (p.herbUsed || 0) + (v.econ ? (v.econ._herbUsed || 0) : 0);
      p.foragerN = (p.foragerN || 0) + (v.econ && v.econ.counts ? Math.round(v.econ.counts.forager || 0) : 0);
      // ★활 티어·호피 유통 진단(§9 3차): 뼈 잔고+무기장 투입(_boneUsed — 0=경로 사망, _bowQ 1.0 고착=결함) · 호피 잔고(교역은 tradeLog).
      p.bone = (p.bone || 0) + (v.econ && v.econ.storage ? (v.econ.storage.bone || 0) : 0);
      p.boneUsed = (p.boneUsed || 0) + (v.econ ? (v.econ._boneUsed || 0) : 0);
      p.tigerhide = (p.tigerhide || 0) + (v.econ && v.econ.storage ? (v.econ.storage.tigerhide || 0) : 0);
      const _bq = (v.econ && v.econ._bowQ) || 1;
      p.bowQmax = Math.max(p.bowQmax || 1, _bq); p.bowQmin = (p.bowQmin == null || _bq < p.bowQmin) ? _bq : p.bowQmin;
      p.wsmithN = (p.wsmithN || 0) + (v.econ && v.econ.counts ? Math.round(v.econ.counts.weaponsmith || 0) : 0);
    }
    p.seedRow = `시드${CHILD_SEED} 고기${(p.meat||0).toFixed(0)} 사냥꾼${p.hunterN||0} 인구${p.pop} 마을${r.VILS.length}/${r.initVil} 동기${r.bad} 청동도구${r.VILS.reduce((a, v) => a + (v.econ.storage.bronze_tool || 0), 0).toFixed(0)} 집${p.houses} 약재${(p.herb||0).toFixed(0)}/소비${(p.herbUsed||0).toFixed(0)} 채집꾼${p.foragerN||0} 뼈${(p.bone||0).toFixed(0)}/투입${(p.boneUsed||0).toFixed(0)} 활Q${(p.bowQmin==null?1:p.bowQmin).toFixed(2)}~${(p.bowQmax||1).toFixed(2)}(무기장${p.wsmithN||0}) 호피${(p.tigerhide||0).toFixed(1)}/교역${(p.thTrade||0).toFixed(1)}`;
    p.seedRow += ' 초과' + Math.max(0,...r.VILS.map(v=>v.econ._mapBeds!==undefined?(v.econ.npcs.length-v.econ._mapBeds):0)) + ' 침대' + r.VILS.reduce((a,v)=>a+(v.econ._mapBeds||0),0);   // ★완공 계약 감시(상비): 마을별 최대 초과·총 침대
    // ★도적 관측(§도적 — 하한 없음: 전부 0 = 평화 시드의 정직한 결과): 단 수(峰=피크)·총원·원천(전환/이탈)·약탈 성공·토벌·해산(굶주림 이탈 포함)
    { const bs = (r.world && r.world._banditStats) || {};
      p.bGangs = bs.gangs || 0; p.bMemb = bs.members || 0; p.bPeak = bs.peak || 0; p.bConv = bs.conv || 0; p.bExo = bs.exo || 0;
      p.bLoot = bs.loot || 0; p.bSup = bs.sup || 0; p.bDis = bs.disband || 0; p.bStarve = bs.starve || 0; p.bAmb = bs.amb || 0;
      p.dDen = bs.dens || 0; p.dOcc = bs.denOcc || 0; p.dClr = bs.denClear || 0; p.dForm = bs.denForm || 0;   // ★원천③ 소굴: 현존/주둔·영구 정리·누적 재결성
      p.seedRow += ` 도적${p.bGangs}단/${p.bMemb}명(峰${p.bPeak}) 전환${p.bConv}+이탈${p.bExo} 약탈${p.bLoot} 토벌${p.bSup} 해산${p.bDis} 소굴${p.dDen}/${p.dOcc}정리${p.dClr}(결성${p.dForm})`; }
  } catch (e) { p.crashed = true; p.seedRow = `시드${CHILD_SEED} 크래시: ${e.message}`; }
  process.stdout.write('@@RESULT@@' + JSON.stringify(p) + '\n');
  process.exit(0);
}

// ═══════════════ 마스터 모드: 자식 5개 병렬 + 장기수렴(19) 동시 계산 + 집계·판정 ═══════════════
const { execFile } = require('child_process');
const jobs = SEEDS.map(sd => new Promise(res => execFile(process.execPath, [__filename, '--seed', String(sd)], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
  const m = String(stdout || '').match(/@@RESULT@@(\{.*\})/);
  if (m) { try { return res(JSON.parse(m[1])); } catch (_) {} }
  res({ seed: sd, crashed: true, seedRow: `시드${sd} 크래시/출력파싱 실패${err ? ': ' + err.message : ''}`, pop: 0, bad: 0, initVil: 0, finalVil: 0, mining: 0, forest: 0, bronze: 0, iron: 0, stoneTool: 0, copperTin: 0, weaponShort: 0, villages: 0, houses: 0, tradeStaple: 0, tradeOrn: 0, craftBloat: 0, maxCraftFrac: 0, maxAccumPer: 0, maxVilPop: 0, smithVil: 0, housesTot: 0, housesOut: 0, terrSync: 0, terrOverlap: 0, gameUsed: 0, gameDead: 0 });
})));

// ── 19. 스탠드얼론 장기(3500일≈9.6년) 자연 수렴 — 자식들이 도는 동안 마스터가 계산 ──
//   판정: ①MB/MC로 확장 *정지*한 마을 존재(수렴 메커니즘 작동 — E1[천장만 제거]에선 영원히 확장)
//   ②최대 마을 ≤450(sanity 가드 — 튜너 아님) ③생존 ≥3 ④차등 ≥×1.5. (5000→3500일: 정지는 ~2000일대 발생, 증거 충분)
const lt = { stalled: 0, maxN: 0, alive: 0, spread: 0 };
{
  const EE = globalThis.EconEngine;
  const w2 = EE.createWorldV2({ seed: 42, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
  const _l2 = console.log; console.log = () => {};
  for (let d = 1; d <= 3500; d++) EE.tickWorldV2(w2);
  console.log = _l2;
  const alive = w2.villages.filter(v => v.npcs.length > 5);
  lt.alive = alive.length;
  lt.maxN = Math.max(...w2.villages.map(v => v.npcs.length));
  lt.stalled = w2.villages.filter(v => v._expandMBMC && v._expandMBMC.mb < v._expandMBMC.mc).length;
  lt.spread = alive.length >= 2 ? Math.max(...alive.map(v => v.npcs.length)) / Math.max(1, Math.min(...alive.map(v => v.npcs.length))) : 0;
}

Promise.all(jobs).then(parts => {
  parts.sort((a, b) => SEEDS.indexOf(a.seed) - SEEDS.indexOf(b.seed));
  const agg = { pop: 0, bad: 0, initVil: 0, finalVil: 0, mining: 0, forest: 0, bronze: 0, iron: 0, stoneTool: 0, copperTin: 0,
    weaponShort: 0, villages: 0, houses: 0, tradeStaple: 0, tradeOrn: 0, craftBloat: 0, maxCraftFrac: 0,
    maxAccumPer: 0, maxVilPop: 0, smithVil: 0, housesTot: 0, housesOut: 0, terrSync: 0, terrOverlap: 0, gameUsed: 0, gameDead: 0, crashed: false, seedRows: [] };
  const SUM = ['pop', 'bad', 'initVil', 'finalVil', 'mining', 'forest', 'bronze', 'iron', 'stoneTool', 'copperTin', 'weaponShort', 'villages', 'houses', 'tradeStaple', 'tradeOrn', 'craftBloat', 'smithVil', 'housesTot', 'housesOut', 'terrSync', 'terrOverlap', 'gameUsed', 'gameDead', 'meat', 'hunterN',
    'toolDepPop', 'cuToolUsed', 'cuWeapUsed', 'bronzeWeaponMade', 'bronzeVil', 'copperStock', 'tinStock', 'stoneToolMade', 'ironMetal'];
  const MAX = ['maxCraftFrac', 'maxAccumPer', 'maxVilPop'];
  for (const q of parts) {
    for (const k of SUM) agg[k] = (agg[k] || 0) + (q[k] || 0);   // 신규 키 안전 합산
    for (const k of MAX) agg[k] = Math.max(agg[k], q[k] || 0);
    agg.crashed = agg.crashed || !!q.crashed;
    agg.seedRows.push(q.seedRow);
  }

  // ── 불변식 판정 ──
  const deaths = agg.initVil - agg.finalVil;
  const checks = [
    ['2. 크래시 없음', !agg.crashed],
    ['3. 동기(sync) 0', agg.bad === 0],
    ['4. 소멸 통제(≤초기 마을 1/3)', deaths <= agg.initVil / 3],   // ★재캘리브레이션(실축 대이행 2026-07-07): 구 한도 5 = 구세계 15마을(nvil3×5시드)의 정확히 1/3 — nvil 8(초기 40마을)로 개수 기준이 낡아 같은 '허용 소멸률 33%'를 비율식으로 고정(15마을이면 ≤5로 동일). 실측: 구 1/15(6.7%) → 신 7/40(17.5%) — 마을 8개 채우기의 뒤순위 한계 입지 정착 실패 증가이지 대량 아사선(경제 의미 변화) 아님. 병리(연쇄 소멸)는 33% 초과로 여전히 검출
    ['5. 인구 범위(2100~9300)', agg.pop >= 2100 && agg.pop <= 9300],   // ★재캘리브레이션(캐논 §4-3 예고, 2026-07-07): 구 800~3500은 15마을(nvil3) 총합 기준 — nvil 8(40마을)로 ×8/3 스케일(2133~9333 절사). 마을당 밀도는 econ 불변이라 그대로(구 74/마을·신 116/마을 모두 구간 중앙권). 실측 3819
    ['6. 특화 분화(광산≥1·숲≥1 마을)', agg.mining >= 1 && agg.forest >= 1],
    ['7. 도구·야금 기술트리(석기 도구 생산 + 청동 야금→무기 도달)', (agg.stoneTool + (agg.stoneToolMade || 0)) > 0 && agg.bronzeWeaponMade > 0],   // ★도구=석기 전용(청동도구 폐지), 청동은 무기로 도달
    ['8. 청동 우위(청동기 고증: 청동금속[구리+주석] 재고 > 철금속 & 청동무기 생산)', agg.copperTin > agg.ironMetal && agg.bronzeWeaponMade > 0],   // ★청동은 무기·위세품 주력 — 도구 아님. 청동>철 재고
    ['9. 금속 공급(구리·주석 흐름)', agg.copperTin > 0],
    ['10. 전사 무장(무기부족 마을 ≤3)', agg.weaponShort <= 3],
    ['11. staple 교역 > 0', agg.tradeStaple > 0],
    ['12. 집 성장(>마을수×2)', agg.houses > agg.villages * 2],
    ['13. 장인 비대 없음(야금공>15% 마을 ≤1)', agg.craftBloat <= 1],   // 정원 제거 후 스톡-플로우 자연 수렴 확인
    ['14. 누적 통제(광석·돌 최대 ≤90/명)', agg.maxAccumPer <= 90],       // 생산 포만+부패가 무한 누적 방지(병리는 159~201/명). 60→90: 소형마을 재고/인구 비율이 런마다 58~73 진동(랩 Math.random 비결정) — 플레이크 제거, 병리 감지력은 유지
    ['15. 폭주 없음(12년 최대 인구 ≤250)', agg.maxVilPop <= 250],        // ★자연 K(K_MAX 폐지): 리비히 min+MB/MC. 농업촌 실험(fert 2.8→s*≈280, 12년 ~170) 스케일. 하드캡 아님 — 초과=수렴 재점검 신호
    ['16. 야금 분업(대장장이 마을 ≥1[금속 산지] + 석기무기 생산 다수 — 청동 희소성 복원)', agg.smithVil >= 1 && (agg.stoneToolMade || 0) > 0 && agg.bronzeWeaponMade > 0],   // ★청동 희소성 복원(2026-07): 종전 "대장장이 ≥70%"는 tin이 전 마을 부산물이던 구모델 전제 — 이제 주석은 소수 산지만이라 대장장이(청동/철)는 금속 산지·교역허브에 편중되고 대다수 마을은 석공(마제석검)이 무장 공급. 고증(청동기 병종 격차)에 맞게 "대장장이 존재(분업 성립) + 석기·청동 이원 야금"으로 재정의.
    ['17. 위신재 교역 활성(장식 > 100000)', agg.tradeOrn > 100000],
    ['18. 집이 영토 안(밖 ≤2%)', agg.housesOut <= agg.housesTot * 0.02],
    ['19. 장기 자연수렴(3500일: 확장정지 마을≥1·최대≤450·생존≥3·차등≥1.5)', lt.stalled >= 1 && lt.maxN <= 450 && lt.alive >= 3 && lt.spread >= 1.5],
    ['20. 영토 ≥ econ size(econ 리드 지연 ≤60셀, E2c — 주택 압력의 초과 확장은 정상)', agg.terrSync === 0],
    ['21. 마을 간 영토 겹침 0', agg.terrOverlap === 0],
    ['22. 사냥감 생태(압력 발생≥1·서식지 있는 절멸 0)', agg.gameUsed >= 1 && agg.gameDead === 0],   // 로지스틱+확산+사냥압: 고갈은 일어나되 숲이 남은 한 전멸 없음
    ['23. 사냥 산출(사냥꾼 총원 10~인구40% — 직업 존속=고기 흐름의 시장 증거)', (agg.hunterN || 0) >= 10 && (agg.hunterN || 0) <= agg.pop * 0.4],   // 재고는 즉시소비 균형이라 0이 정상 — 산출 붕괴는 직업 소멸(한계가치→전직)로 나타남. 하한=존속, 상한=폭주 감시
  ];
  console.log('\n=== 회귀 검사 (5시드 병렬) ===');
  agg.seedRows.forEach(s => console.log('  ' + s));
  console.log(`\n  [집계] 총인구 ${agg.pop} · 마을 ${agg.finalVil}/${agg.initVil}(소멸 ${deaths}) · 동기 ${agg.bad} · 청동도구 ${agg.bronze.toFixed(0)} · 철도구 ${agg.iron.toFixed(0)} · 집 ${agg.houses} · staple교역 ${agg.tradeStaple.toFixed(0)} · 장식교역 ${agg.tradeOrn.toFixed(0)} · 최대마을 ${agg.maxVilPop} · 광석/돌최대 ${agg.maxAccumPer.toFixed(0)}/명 · 대장장이마을 ${agg.smithVil}/${agg.villages} · 사냥감사용 ${agg.gameUsed}마을`);
  console.log(`  [장기 3500일] 확장정지 ${lt.stalled}마을 · 최대 ${lt.maxN} · 생존 ${lt.alive} · 차등 ×${lt.spread.toFixed(1)}`);
  // ★청동→석기 전환 검증 요약 — per-pc는 도구의존인구(toolDepPop) 기준(도구 지표의 올바른 분모)
  { const td = Math.max(1, agg.toolDepPop), tot = agg.bronze + agg.stoneTool + agg.iron;
    console.log(`  [도구/석기전환] 청동도구/의존인구 ${(agg.bronze/td).toFixed(2)} · 석기재고/의존인구 ${(agg.stoneTool/td).toFixed(2)} · 철도구/의존인구 ${(agg.iron/td).toFixed(2)} · 도구총량/의존인구 ${(tot/td).toFixed(2)} (총도구 ${tot.toFixed(0)}, 의존인구 ${agg.toolDepPop.toFixed(0)}) · 석기전환flow생산 ${(agg.stoneToolMade||0).toFixed(0)}`);
    console.log(`  [청동보존] 구리+주석재고 ${agg.copperTin.toFixed(0)}(구리 ${agg.copperStock.toFixed(0)}·주석 ${agg.tinStock.toFixed(0)}) · 도구용구리소비 ${agg.cuToolUsed.toFixed(0)} · 무기용구리소비 ${agg.cuWeapUsed.toFixed(0)} · 청동무기생산 ${agg.bronzeWeaponMade.toFixed(0)}(청동무기마을 ${agg.bronzeVil}/${agg.villages}) · 대장장이마을 ${agg.smithVil}/${agg.villages}`); }
  console.log('');
  let pass = 0;
  for (const [name, ok] of checks) { console.log(`  ${ok ? '✅' : '❌'} ${name}`); if (ok) pass++; }
  console.log(`\n  ${pass}/${checks.length} 통과` + (pass === checks.length ? ' — 전부 통과 ✅' : ' — ❌ 실패 항목 있음'));
  process.exit(pass === checks.length ? 0 : 1);
});
