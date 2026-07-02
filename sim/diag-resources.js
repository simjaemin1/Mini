// 자원별 수급·가격 감사 — 활성 자원의 1인당 재고·가격·보유마을수·생산량을 덤프.
//   글럿(재고↑·가격↓) / 결핍(재고↓·가격↑) / 휴면(생산 안 됨) / 오가격을 데이터로 탐지.
//   실행: node sim/diag-resources.js   (economy-engine.browser.js 재빌드 후)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LAB = path.join(ROOT, '마을실험실.html');
require(path.join(__dirname, 'economy-engine.browser.js'));
const H = fs.readFileSync(LAB, 'utf8');
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
  TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),
  LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
global.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
global.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
global.frame = function () { global.nowMs += 16; const cb = global.rafCb; global.rafCb = null; if (cb) cb(global.nowMs); };
global.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE +
  "\nglobal.run=function(seed){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;for(var fr=0;fr<1800;fr++)global.frame();console.log=global.__log;return VILS;};");
global.__log = _log; console.log = _log;

// ── 집계 ──
const agg = {};   // r -> {hold, sumPC, maxPC, sumPrice, priceN, totalStock}
const prod = {};  // r -> 총 일일생산(17 core, dailyProductionBuf)
let totN = 0, totVil = 0;
const SEEDS = [7, 42, 8, 3, 19];
for (const sd of SEEDS) {
  const VILS = global.run(sd);
  for (const v of VILS) {
    const e = v.econ; if (!e) continue;
    const N = e.npcs.length; if (N <= 0) continue;
    totN += N; totVil++;
    // 가격표 (v2 shadow price)
    let pr = null;
    try { pr = (e._world && typeof e._world.priceFn === 'function') ? e._world.priceFn(e) : (e.prices || null); } catch (_) { pr = e.prices || null; }
    for (const [r, qty] of Object.entries(e.storage || {})) {
      if (!(qty > 0)) continue;
      const a = agg[r] || (agg[r] = { hold: 0, sumPC: 0, maxPC: 0, sumPrice: 0, priceN: 0, totalStock: 0 });
      const pc = qty / N;
      a.hold++; a.sumPC += pc; a.totalStock += qty; if (pc > a.maxPC) a.maxPC = pc;
      if (pr && pr[r] != null) { a.sumPrice += pr[r]; a.priceN++; }
    }
    // 생산 (core 17)
    const dp = e.dailyProductionBuf || {};
    for (const r in dp) { if (dp[r] > 0) prod[r] = (prod[r] || 0) + dp[r]; }
  }
}

const rows = Object.entries(agg).map(([r, a]) => ({
  r, hold: a.hold, holdPct: a.hold / totVil * 100,
  avgPC: a.sumPC / a.hold, maxPC: a.maxPC,
  price: a.priceN ? a.sumPrice / a.priceN : null,
  prodPD: (prod[r] || 0) / totVil,   // 마을당 평균 일일생산
}));
rows.sort((x, y) => y.avgPC - x.avgPC);

_log(`\n=== 자원별 수급·가격 감사 (${SEEDS.length}시드 × ${totVil}마을, 총인구 ${totN}) ===`);
_log(`자원          보유마을%  1인당재고(평균/최대)   가격      마을당생산/일   판정`);
for (const x of rows) {
  const glut = x.avgPC > 15 && (x.price == null || x.price < 0.6);
  const scarce = x.avgPC < 1 && x.price != null && x.price > 3;
  const tag = glut ? 'GLUT 글럿' : scarce ? 'SCARCE 결핍' : '';
  const pcs = `${x.avgPC.toFixed(1)}/${x.maxPC.toFixed(0)}`.padEnd(20);
  const prc = (x.price != null ? x.price.toFixed(2) : '—').padStart(7);
  const pr = (x.prodPD > 0 ? x.prodPD.toFixed(2) : '·').padStart(12);
  _log(`  ${x.r.padEnd(14)}${x.holdPct.toFixed(0).padStart(4)}%   ${pcs}${prc}   ${pr}   ${tag}`);
}
_log(`\n활성 자원 ${rows.length}종 (보유 마을 있음). 나머지 카탈로그 항목은 휴면(생산·교역 안 됨).`);
