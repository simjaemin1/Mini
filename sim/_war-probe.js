// 전쟁 시스템 프로브 — 창발(3명분 개전)·전체루프·나선방지(휴전기)·경제안정 실측. 마을실험실 무수정 하네스.
//   실행: node sim/_war-probe.js [frames] [nvil]   (기본 2500프레임≈2250일, 마을4)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LAB = path.join(ROOT, '마을실험실.html');
require(path.join(__dirname, 'economy-engine.browser.js'));
const H = fs.readFileSync(LAB, 'utf8');
const _log = console.log;
global.N = 1600; global.idx = (x, y) => y * 1600 + x; global.inG = (x, y) => x >= 0 && y >= 0 && x < 1600 && y < 1600;   // ★회귀와 동일(실제 맵) — N=400 소형은 마을 과밀 붕괴
global.smt = t => t * t * (3 - 2 * t);
global.hash2 = (ix, iy, s) => { let h = ix * 374761393 + iy * 668265263 + s * 1274126177; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
global.vn = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s); const u = smt(fx), v = smt(fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
global.fbm = (x, y, s) => { let t = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { t += a * vn(x * f, y * f, s + i * 31); a *= .5; f *= 2; } return t; };
global.MAX_CELLS = Math.PI * 60 * 60;
// ★결정론: 시드로 Math.random 주입(모듈은 Math.random 관례 유지 — 하네스만 재현성 확보). 동일시드=동일결과.
global.__mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const NVIL = process.argv[3] || '8';
const vals = { pop: '8', fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: '7', terrMode: 'auto', simSpeed: '80000', nvil: NVIL };
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
  "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
global.__log = _log; console.log = _log;

const FRAMES = parseInt(process.argv[2]) || 2500;
const SEEDS = (process.argv[4] ? process.argv[4].split(',').map(Number) : [7]);   // ★45초 회수: 시드당 단일 프로세스(다시드는 개별 호출). 결정론이라 시드별 재현 가능
_log(`=== 전쟁 시스템 프로브 (마을 ${NVIL} · ${SEEDS.length}시드 × ~${Math.round(FRAMES * 0.9)}일) ===`);
let anyDecl = 0;
for (const seed of SEEDS) {
  let VILS, ws, crash = null;
  try {
    VILS = global.run0(seed);
    console.log = function () {};   // 시뮬 로그 억제
    for (let fr = 0; fr < FRAMES; fr++) global.frame();
    console.log = _log;
    ws = global.warStats ? global.warStats() : null;
  } catch (e) { console.log = _log; crash = (e.stack || e.message); }
  if (crash) { _log(`시드${seed}: ❌ 크래시 ${crash.split('\n').slice(0, 3).join(' | ')}`); continue; }
  const nv = VILS.length, pop = VILS.reduce((a, v) => a + (v.econ ? v.econ.npcs.length : 0), 0);
  if (!ws) { _log(`시드${seed}: _warStats 없음 · 마을 ${nv} 인구 ${pop}`); continue; }
  anyDecl += ws.decl;
  const bc = ws.byCasus || {};
  const awr = ws.battle ? Math.round(100 * ws.atkWin / ws.battle) : 0;
  _log(`시드${seed}: 선포 ${ws.decl} [교역${bc.trade || 0}·영토${bc.territory || 0}·위신${bc.prestige || 0}·응징${bc.feud || 0}] · 전투 ${ws.battle}(공승${ws.atkWin}/방승${ws.defWin}=공격승률 ${awr}%) · 사상 ${ws.cas} · 약탈 ${ws.loot} · 조공 ${ws.tribute} · 목책 ${ws.palisade} | 마을 ${nv}/${NVIL} 인구 ${pop}`);
  // 나선 방지 + 학습: 휴전기(>60일)? 같은 공격→방어 쌍 반복(=패전 학습 실패)?
  if (ws.log && ws.log.length) {
    const bd = ws.log.filter(l => l.includes('전투 ')).map(l => { const m = l.match(/^D(\d+)/); return m ? +m[1] : 0; }).filter(x => x);
    const pairs = {}; let maxRep = 0;
    for (const l of ws.log.filter(l => l.includes('선전포고'))) { const m = l.match(/(마을\d+)→(마을\d+)/); if (m) { const k = m[1] + m[2]; pairs[k] = (pairs[k] || 0) + 1; if (pairs[k] > maxRep) maxRep = pairs[k]; } }
    if (bd.length >= 2) { let mg = 0; for (let i = 1; i < bd.length; i++) mg = Math.max(mg, bd[i] - bd[i - 1]); _log(`   전투 ${bd.length}회 · 최장 휴전 ${mg}일 ${mg > 60 ? '✓ 나선 아님' : '⚠ 연속'} · 동일쌍 최다반복 ${maxRep}회 ${maxRep <= 2 ? '✓ 학습(패전 후 이탈)' : '⚠ 반복공격'} · 마을생존 ${nv >= NVIL - 1 ? '✓' : '⚠ ' + (NVIL - nv) + '곳 소멸'}`); }
    else _log(`   전투 ${bd.length}회(희소) · 동일쌍 최다 ${maxRep}`);
    // 표본 로그(선전포고+전투 최대 8줄)
    for (const l of ws.log.filter(l => l.includes('선전포고') || l.includes('전투 ')).slice(0, 8)) _log('   · ' + l);
  }
}
_log(`\n총 선포 ${anyDecl} → ${anyDecl > 0 ? '✓ 전쟁 창발함' : '❌ 전쟁 0(명분 문턱 과high or 마을 근접 부족)'}`);
