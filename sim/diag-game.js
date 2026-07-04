// 사냥감(game) 고갈·멸종 관측 — economy-sim.js는 안 건드리고, 하네스 안에서 프로토타입 고갈 모델을 매일 적용.
//   목적: 사냥압력이 land.game을 깎을 때 (a)노동시장 자기제한(사냥꾼 이탈)이 멸종 전에 멈추는지 (b)기저유입 floor가 회복시키는지 관측.
//   실행: node sim/diag-game.js [seed] [frames]   (기본 7, 6000)
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
  "\nglobal.run0=function(seed){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
global.__log = _log; console.log = _log;

// ── 프로토타입 사냥감 고갈 모델 (마을 스칼라, O(1)) ──
const HUNT_KILL  = 0.006;   // 사냥꾼 1인당 일일 포획압(× 현재 밀도) — game 소진
const GAME_REGEN = 0.03;    // 로지스틱 자연증가율
const GAME_BASE  = 0.0010;  // 기저 유입(주변 야생서 재유입) — 멸종 방지 floor
function stepGame(e, gmax) {
  if (gmax <= 0) return;
  const hunters = (e.counts && e.counts.hunter) || 0;
  const g = e.land.game;
  const kill  = HUNT_KILL * hunters * g;                       // 포획 ∝ 사냥꾼 × 밀도
  const regen = GAME_REGEN * g * (1 - g / gmax) + GAME_BASE;   // 로지스틱 + 기저유입
  e.land.game = Math.max(0, Math.min(gmax, g + regen - kill));
}

const SEED = parseInt(process.argv[2]) || 7, FRAMES = parseInt(process.argv[3]) || 6000;
const MODEL_OFF = process.argv[4] === 'off';   // off = 시뮬 자체만(내 프로토타입 미적용)
_log(`=== 사냥감 관측 (seed ${SEED}, ${FRAMES}f≈일) | 프로토타입고갈 ${MODEL_OFF ? 'OFF(시뮬만)' : 'ON KILL'+HUNT_KILL+' REGEN'+GAME_REGEN+' BASE'+GAME_BASE} ===`);
const VILS = global.run0(SEED);
const gmax0 = {}, minFrac = {};
for (const v of VILS) if (v.econ) { gmax0[v.econ.name] = v.econ.land.game || 0.01; minFrac[v.econ.name] = 1; }
const rows = [];
const _realLog = console.log; console.log = function () {};   // 시뮬 이벤트 로그 억제
for (let fr = 0; fr < FRAMES; fr++) {
  global.frame();
  if (!MODEL_OFF) for (const v of VILS) { if (v.econ) stepGame(v.econ, gmax0[v.econ.name]); }
  for (const v of VILS) {
    const e = v.econ; if (!e) continue;
    const frac = e.land.game / gmax0[e.name];
    if (frac < minFrac[e.name]) minFrac[e.name] = frac;
  }
  if (fr % 1000 === 999 || fr === FRAMES - 1) {
    let s = [];
    for (const v of VILS) {
      const e = v.econ; if (!e) continue;
      const frac = (e.land.game / gmax0[e.name] * 100);
      s.push(`${e.name}:game${frac.toFixed(0)}%(사냥꾼${(e.counts && e.counts.hunter) || 0})`);
    }
    rows.push(`  f${fr + 1}: ${s.join(' ')}`);
  }
}
console.log = _realLog;
rows.forEach(r => _log(r));
_log(`\n[멸종 관측] 마을별 최저 game(초기 서식지대비 %):`);
for (const nm in minFrac) {
  const pct = minFrac[nm] * 100;
  _log(`   ${nm}: 최저 ${pct.toFixed(1)}%  ${pct < 2 ? '⚠️ 멸종근접' : pct < 15 ? '(저점 — 수렵 자연위축)' : '(지속가능)'}`);
}
