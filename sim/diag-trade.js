// 교역 강도 진단 — 마을별 (동시 교역중 NPC / 인구) 비율의 평균·최대를 계측.
//   연속교역 튜닝의 목표치(안정본 3일 버스트의 평균 동시성)를 얻기 위함.
//   실행: node sim/diag-trade.js   (economy-engine.browser.js 재빌드 후)
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
  "\nglobal.run=function(seed){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;" +
  "var samples=[],perVil={};for(var fr=0;fr<1500;fr++){global.frame();var day=ECON_WORLD.day;var tot=0,out=0;for(var k=0;k<VILS.length;k++){var e=VILS[k].econ;var n=e.npcs.length;var o=0;for(var j=0;j<e.npcs.length;j++){var np=e.npcs[j];if(np._tradingUntil&&np._tradingUntil>day)o++;}tot+=n;out+=o;var nm=e.name||k;if(!perVil[nm])perVil[nm]={sumFrac:0,cnt:0,max:0};var f=n>0?o/n:0;perVil[nm].sumFrac+=f;perVil[nm].cnt++;if(f>perVil[nm].max)perVil[nm].max=f;}samples.push(tot>0?out/tot:0);}" +
  "console.log=global.__log;return {VILS:VILS,world:ECON_WORLD,samples:samples,perVil:perVil};};");
global.__log = _log; console.log = _log;

const SEEDS = [7, 42, 8, 3, 19];
let globAvgSum = 0, globAvgN = 0, globMax = 0;
const perVilMaxes = [];
for (const sd of SEEDS) {
  const r = global.run(sd);
  const avg = r.samples.reduce((a, b) => a + b, 0) / r.samples.length;
  const mx = Math.max(...r.samples);
  globAvgSum += avg; globAvgN++; if (mx > globMax) globMax = mx;
  const vilStrs = [];
  for (const nm in r.perVil) {
    const pv = r.perVil[nm];
    const va = pv.sumFrac / pv.cnt;
    perVilMaxes.push(pv.max);
    vilStrs.push(`${nm}:avg${(va * 100).toFixed(1)}%/max${(pv.max * 100).toFixed(0)}%`);
  }
  _log(`시드${sd} 전체평균 동시교역 ${(avg * 100).toFixed(2)}% · peak ${(mx * 100).toFixed(1)}% | ${vilStrs.join(' ')}`);
  // per-village 최종 상태 — 누적(ore/stone per person)·idleFrac·인구
  for (const v of r.VILS) {
    const e = v.econ, n = e.npcs.length || 1, S = e.storage;
    const orePer = ((S.ore || 0) / n).toFixed(0), stonePer = ((S.stone || 0) / n).toFixed(0);
    const mine = (e.counts.miner || 0), farm = (e.counts.farmer || 0);
    _log(`   ${e.name} 인구${n} 광석${orePer}/명 돌${stonePer}/명 idleFrac${((v.econ._idleFrac||0)*100).toFixed(0)}% 광부${mine} 농부${farm} 대장${e.counts.smith||0}`);
  }
}
_log(`\n[집계] 5시드 평균 동시교역비율 ${(globAvgSum / globAvgN * 100).toFixed(2)}% · 전역 peak ${(globMax * 100).toFixed(1)}% · 마을별 peak 중앙값 ${(perVilMaxes.sort((a, b) => a - b)[Math.floor(perVilMaxes.length / 2)] * 100).toFixed(0)}%`);
