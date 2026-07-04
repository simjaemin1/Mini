// 관찰(저속) 모드 헤드리스 — far-AI(사냥꾼 이동·회수·도살) 실행 검증. regression은 빨리감기라 이 경로를 안 탐.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
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
  const vals = { pop: '8', fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: '7', terrMode: 'auto', simSpeed: '6', nvil: '3' };
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
    "\nglobal.run=function(seed){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;var bad=0,initVil=VILS.length;for(var fr=0;fr<1500;fr++){global.frame();if(fr%300===0)for(var k=0;k<VILS.length;k++)if(VILS[k].agents.length!==VILS[k].econ.npcs.length)bad++;}console.log=global.__log;return {bad:bad,initVil:initVil,VILS:VILS,world:ECON_WORLD};};"+"\nglobal.__probe=function(){\n  var err=null,acts={},butch=0,recov=0,kills=0,lost=0;\n  try{\n    TR=buildTerrain(7);document.getElementById('seed').value='7';var _l=console.log;console.log=function(){};\n    lifeInit();lifeGM=200*720+300;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;\n    for(var fr=0;fr<4000;fr++){global.frame();\n      if(fr%40===0)for(var vi=0;vi<VILS.length;vi++)for(var ai=0;ai<VILS[vi].agents.length;ai++){var a=VILS[vi].agents[ai];if(a.job!=='hunter')continue;var k=a.action||'-';acts[k]=(acts[k]||0)+1;if(k==='\ub3c4\uc0b4')butch++;if(k==='\ud68c\uc218')recov++;}}\n    console.log=global.__log;\n    for(var v2=0;v2<VILS.length;v2++){kills+=(VILS[v2]._mobKills||0);lost+=(VILS[v2]._lostK||0);}\n  }catch(e){console.log=global.__log;err=String(e&&e.stack||e).split(String.fromCharCode(10)).slice(0,2).join(' | ');}\n  return {err:err,acts:acts,butch:butch,recov:recov,kills:kills,lost:lost};\n};");
  global.__log = _log; console.log = _log;
global.dispatchTrades=global.dispatchTrades||(()=>{});global.decayTraffic=global.decayTraffic||(()=>{});global.drawCaravans=global.drawCaravans||(()=>{});global.lifeStats=global.lifeStats||(()=>{});

const r=global.__probe();
console.log(r.err?('❌ 관찰 모드 크래시: '+r.err):'✅ 관찰 모드 4000프레임 무사고');
console.log('사냥꾼 행동 분포:',JSON.stringify(r.acts));
console.log('도살 관측:',r.butch,'· 회수 관측:',r.recov,'· 수확 완료:',r.kills,'· 손실:',r.lost);
