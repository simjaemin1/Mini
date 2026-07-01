// 인구 장기 수렴 진단 — 한 시드를 오래 돌려 마을 최대·총인구 궤적을 샘플.
//   실행: node sim/diag-pop.js [seed] [frames]   (기본 7, 6000)
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
const SEED = parseInt(process.argv[2]) || 7, FRAMES = parseInt(process.argv[3]) || 6000;
global.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE +
  "\nglobal.run=function(seed,frames){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;" +
  "var rows=[];for(var fr=0;fr<frames;fr++){global.frame();if(fr%1000===999||fr===frames-1){var mx=0,tot=0,alive=0;for(var k=0;k<VILS.length;k++){var n=VILS[k].econ.npcs.length;tot+=n;if(n>mx)mx=n;if(n>0)alive++;}rows.push({day:ECON_WORLD.day,mx:mx,tot:tot,alive:alive,nv:VILS.length});}}" +
  "console.log=global.__log;return rows;};");
global.__log = _log; console.log = _log;
_log(`=== 인구 장기 수렴 (seed ${SEED}, ${FRAMES}프레임) ===`);
const rows = global.run(SEED, FRAMES);
for (const r of rows) _log(`  ${r.day}일차: 최대마을 ${r.mx}명 · 총 ${r.tot}명 · 생존마을 ${r.alive}/${r.nv}`);
