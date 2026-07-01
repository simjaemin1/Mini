// durango-mini 회귀 자동 검사 — CHECKLIST.md의 불변식을 5시드로 PASS/FAIL.
//   실행: node sim/regression-check.js   (엔진 수정 후엔 먼저 build+inline)
//   헤드리스: 마을실험실.html의 라이프 시뮬을 fast 모드로 구동 + econ 엔진 번들.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');           // /Mini
const LAB = path.join(ROOT, '마을실험실.html');
require(path.join(__dirname, 'economy-engine.browser.js'));
const H = fs.readFileSync(LAB, 'utf8');

// ── 헤드리스 브라우저 환경 ──
const _log = console.log;
global.N = 400; global.idx = (x, y) => y * 400 + x; global.inG = (x, y) => x >= 0 && y >= 0 && x < 400 && y < 400;
global.smt = t => t * t * (3 - 2 * t);
global.hash2 = (ix, iy, s) => { let h = ix * 374761393 + iy * 668265263 + s * 1274126177; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
global.vn = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s); const u = smt(fx), v = smt(fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
global.fbm = (x, y, s) => { let t = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { t += a * vn(x * f, y * f, s + i * 31); a *= .5; f *= 2; } return t; };
global.MAX_CELLS = Math.PI * 60 * 60;
const vals = { pop: '8', fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: '7', terrMode: 'auto', simSpeed: '40000', nvil: '3' };
const els = {}; global.document = { getElementById: id => els[id] || (els[id] = { value: vals[id] != null ? vals[id] : '0', textContent: '', innerHTML: '', checked: false, addEventListener: () => {} }) };
global.draw = () => {}; global.V = null; global.TR = null; global.life = null; global.lifeOn = false; global.lifeGM = 0; global.lifeLast = 0; global.lifeSlow = false;
global.buildWalls = () => new Set(); global.nowMs = 0; global.performance = { now: () => global.nowMs }; global.rafCb = null; global.requestAnimationFrame = cb => { global.rafCb = cb; };
const grab = re => { const m = H.match(re); if (!m) throw new Error('패턴 못찾음: ' + re); return m[0]; };
const BT = grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/), VL = grab(/const VillageLayout=\(function\(\)\{[\s\S]*?\}\)\(\);/),
  PC = grab(/function pickCenter\(\)\{[\s\S]*?\n\}/), BFS = grab(/function bfsPath\([\s\S]*?\n\}/), SP = grab(/function setPath\([\s\S]*?\n\}/),
  TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),   // 교역로·다리·길(데지어패스) 블록 — moveNPC/lifeDayAll이 bumpTraffic/decayTraffic 호출
  LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
global.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
global.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
global.frame = function () { global.nowMs += 16; const cb = global.rafCb; global.rafCb = null; if (cb) cb(global.nowMs); };
global.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE +
  "\nglobal.run=function(seed){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;var bad=0,initVil=VILS.length;for(var fr=0;fr<1500;fr++){global.frame();if(fr%300===0)for(var k=0;k<VILS.length;k++)if(VILS[k].agents.length!==VILS[k].econ.npcs.length)bad++;}console.log=global.__log;return {bad:bad,initVil:initVil,VILS:VILS,world:ECON_WORLD};};");
global.__log = _log; console.log = _log;

// ── 5시드 구동 + 집계 ──
const SEEDS = [7, 42, 8, 3, 19];
const agg = { pop: 0, bad: 0, initVil: 0, finalVil: 0, mining: 0, forest: 0, bronze: 0, iron: 0, stoneTool: 0, copperTin: 0,
  weaponShort: 0, villages: 0, houses: 0, tradeStaple: 0, tradeOrn: 0, craftBloat: 0, maxCraftFrac: 0,
  maxAccumPer: 0, maxVilPop: 0, smithVil: 0, crashed: false, seedRows: [] };
const STAPLE = new Set(['food', 'fish', 'meat', 'stone', 'ore', 'wood', 'iron', 'copper', 'tin']);
const ORN = new Set(['gold', 'silver', 'gem']);
for (const sd of SEEDS) {
  let r;
  try { r = global.run(sd); } catch (e) { agg.crashed = true; agg.seedRows.push(`시드${sd} 크래시: ${e.message}`); continue; }
  agg.bad += r.bad; agg.initVil += r.initVil; agg.finalVil += r.VILS.length;
  let sp = 0;
  for (const v of r.VILS) {
    const e = v.econ, c = e.counts, S = e.storage, n = e.npcs.length; agg.villages++; agg.pop += n;
    const mine = (c.miner || 0) + (c.prospector || 0), forest = (c.hunter || 0) + (c.forager || 0) + (c.lumberjack || 0);
    if (mine > n * 0.04) agg.mining++; if (forest > n * 0.15) agg.forest++;
    agg.bronze += S.bronze_tool || 0; agg.iron += S.iron_tool || 0; agg.stoneTool += S.tool || 0;
    agg.copperTin += (S.copper || 0) + (S.tin || 0);
    if ((S.weapon || 0) < (c.warrior || 0) * 0.7) agg.weaponShort++;
    // ★장인 비대 가드 — 야금공(대장+무기장+갑옷장)이 인구의 15% 초과면 정원 제거가 스톡-플로우 없이 폭주한 것.
    const craftFrac = ((c.smith || 0) + (c.weaponsmith || 0) + (c.armorsmith || 0)) / Math.max(1, n);
    if (craftFrac > 0.15) agg.craftBloat++;
    if (craftFrac > agg.maxCraftFrac) agg.maxCraftFrac = craftFrac;
    // ★누적 통제 — 무용재(광석)·돌이 1인당 과대면 생산 포만/부패가 안 듣는 것. (예전 ore 201/명·stone 159/명 → 지금 ~10/명)
    const accumPer = Math.max((S.ore || 0), (S.stone || 0)) / Math.max(1, n);
    if (accumPer > agg.maxAccumPer) agg.maxAccumPer = accumPer;
    // ★미니 마을 — K_MAX 천장 작동(폭주 아님). + 대장장이 보유 마을 카운트(소형마을 floor)
    if (n > agg.maxVilPop) agg.maxVilPop = n;
    if ((c.smith || 0) >= 1) agg.smithVil++;
    agg.houses += (v.houses ? v.houses.length : 0);
    sp += n;
  }
  for (const t of (r.world.tradeLog || [])) {
    for (const side of [t.sent, t.bought]) { if (!side) continue; if (STAPLE.has(side.res)) agg.tradeStaple += side.amt || 0; else if (ORN.has(side.res)) agg.tradeOrn += side.amt || 0; }
  }
  agg.seedRows.push(`시드${sd} 인구${sp} 마을${r.VILS.length}/${r.initVil} 동기${r.bad} 청동도구${r.VILS.reduce((a, v) => a + (v.econ.storage.bronze_tool || 0), 0).toFixed(0)} 집${r.VILS.reduce((a, v) => a + (v.houses ? v.houses.length : 0), 0)}`);
}

// ── 불변식 판정 ──
const deaths = agg.initVil - agg.finalVil;
const checks = [
  ['2. 크래시 없음', !agg.crashed],
  ['3. 동기(sync) 0', agg.bad === 0],
  ['4. 소멸 통제(≤5)', deaths <= 5],
  ['5. 인구 범위(800~3500)', agg.pop >= 800 && agg.pop <= 3500],
  ['6. 특화 분화(광산≥1·숲≥1 마을)', agg.mining >= 1 && agg.forest >= 1],
  ['7. 도구 기술트리(청동·철 도달)', agg.bronze > 0 && agg.iron > 0 && (agg.stoneTool + agg.bronze + agg.iron) > 0],   // 돌도구는 과도기(업그레이드되면 0 가능)
  ['8. 청동 사슬(청동도구 존재)', agg.bronze > 0],
  ['9. 금속 공급(구리·주석 흐름)', agg.copperTin > 0 || agg.bronze > 0],
  ['10. 전사 무장(무기부족 마을 ≤3)', agg.weaponShort <= 3],
  ['11. staple 교역 > 0', agg.tradeStaple > 0],
  ['12. 집 성장(>마을수×2)', agg.houses > agg.villages * 2],
  ['13. 장인 비대 없음(야금공>15% 마을 ≤1)', agg.craftBloat <= 1],   // 정원 제거 후 스톡-플로우가 장인 수를 자연 수렴시키는지
  ['14. 누적 통제(광석·돌 최대 ≤60/명)', agg.maxAccumPer <= 60],       // 생산 포만+부패가 무한 누적 방지 (예전 ore 201·stone 159/명)
  ['15. 미니 마을(최대 인구 ≤160)', agg.maxVilPop <= 160],             // K_MAX 천장 작동(θ-로지스틱 수렴 ~100)
  ['16. 마을 대장장이(보유 마을 ≥70%)', agg.smithVil >= agg.villages * 0.7],   // 소형마을도 대장장이 floor (식량쪼들리는 곳은 순환적이라 70%)
];
console.log('\n=== 회귀 검사 (5시드) ===');
agg.seedRows.forEach(s => console.log('  ' + s));
console.log(`\n  [집계] 총인구 ${agg.pop} · 마을 ${agg.finalVil}/${agg.initVil}(소멸 ${deaths}) · 동기 ${agg.bad} · 청동도구 ${agg.bronze.toFixed(0)} · 철도구 ${agg.iron.toFixed(0)} · 집 ${agg.houses} · staple교역 ${agg.tradeStaple.toFixed(0)} · 장식교역 ${agg.tradeOrn.toFixed(0)} · 최대마을 ${agg.maxVilPop} · 광석/돌최대 ${agg.maxAccumPer.toFixed(0)}/명 · 대장장이마을 ${agg.smithVil}/${agg.villages}`);
console.log('');
let pass = 0;
for (const [name, ok] of checks) { console.log(`  ${ok ? '✅' : '❌'} ${name}`); if (ok) pass++; }
console.log(`\n  ${pass}/${checks.length} 통과` + (pass === checks.length ? ' — 전부 통과 ✅' : ' — ❌ 실패 항목 있음'));
process.exit(pass === checks.length ? 0 : 1);
