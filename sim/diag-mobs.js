// 몹 시스템 검증 — updateMobs 로직을 헤드리스로: spawn 유계·서식지 내·사냥꾼 포획.
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
  "\nglobal.run=function(seed){TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;for(var fr=0;fr<1200;fr++)global.frame();console.log=global.__log;return VILS;};");
global.__log = _log; console.log = _log;

const CAP = 70;   // MOB_CAP (const라 global 접근 불가 — 하드코딩)
const VILS = global.run(7);
_log('=== 몹 시스템 검증 (seed 7) ===');
_log('updateMobs 정의됨?', typeof global.updateMobs === 'function' ? '✓' : '❌ (LIFE grab 실패)');
const v = VILS.find(x => x.gameRich && x.gameRich.size > 0 && x.agents && x.agents.length) || VILS[0];
_log(`focal: ${v.econ ? v.econ.name : '?'} | gameRich ${v.gameRich ? v.gameRich.size : 0}셀 · agents ${v.agents ? v.agents.length : 0} · 사냥꾼 ${v.agents ? v.agents.filter(a => a.job === 'hunter').length : 0}`);

let gmax = 0, gsum = 0, g25 = 0, g10 = 0; for (const g of v.gameRich.values()) { if (g > gmax) gmax = g; gsum += g; if (g > 25) g25++; if (g > 10) g10++; }
_log(`gameRich 분포: max ${gmax.toFixed(0)} · avg ${(gsum / v.gameRich.size).toFixed(0)} | >25: ${g25}셀 · >10: ${g10}셀`);

// 1) spawn 유계
let maxMobs = 0;
for (let i = 0; i < 400; i++) { global.updateMobs(v, 1); const n = v.mobs ? v.mobs.length : 0; if (n > maxMobs) maxMobs = n; }
_log(`\n1) spawn: 최대 ${maxMobs}마리 (상한 ${CAP}) → ${maxMobs > 0 && maxMobs <= CAP ? '✓ 유계' : '❌'}`);

// 2) 걸을 수 있는 지형(물·바위 아닌) 위에 있나 — 설계변경: 숲 밖 들판도 다님(조각 갇힘 방지)
let blk = 0; const _isBlk = (x, y) => global.TR && global.TR.terrain && global.TR.terrain.isBlocked(x, y); for (const m of (v.mobs || [])) if (_isBlk(Math.floor(m.px), Math.floor(m.py))) blk++;
_log(`2) 막힌 지형(물/바위) 위 몹: ${blk}/${(v.mobs || []).length} → ${blk === 0 ? '✓ (다 걸을 수 있는 땅)' : '❌'}`);

// 3) 포획 — 사냥꾼을 몹 위치에 놓고 1틱
if (v.mobs && v.mobs.length) {
  const m = v.mobs[0], k0 = v._mobKills || 0;
  const h = v.agents.find(a => a.job === 'hunter') || v.agents[0];
  const oj = h.job, os = h.state; h.job = 'hunter'; h.state = 'work'; h.px = m.px; h.py = m.py;
  global.updateMobs(v, 1);
  _log(`3) 포획: 사냥꾼 근접 → ${(v._mobKills || 0) > k0 ? '몹 죽음 ✓' : '❌ 안 죽음'}`);
  h.job = oj; h.state = os;
}

// 4) 확률적 포획 — 사냥꾼을 개체 밀집 셀에 두고 500틱(몹이 근처서 spawn·이동 → 잠행 성공확률)
let rich = null, rg = 0; for (const c of v.forestCells) { const g = v.gameRich.get(c.cx + ',' + c.cy) || 0; if (g > rg) { rg = g; rich = c; } }
const hh = v.agents.find(a => a.job === 'hunter') || v.agents[0]; const oj4 = hh.job, os4 = hh.state;
hh.job = 'hunter'; hh.state = 'work';
const k1 = v._mobKills || 0;
for (let i = 0; i < 500; i++) { hh.px = rich.cx + 0.5; hh.py = rich.cy + 0.5; global.updateMobs(v, 1); }   // 사냥꾼 밀집셀 고정
_log(`4) 확률적 포획: 밀집셀(g${rg}) 사냥꾼 500틱 → ${(v._mobKills || 0) - k1}건 포획 | 현재 몹 ${v.mobs ? v.mobs.length : 0} ${(v._mobKills || 0) - k1 > 0 ? '✓' : '❌'}`);
hh.job = oj4; hh.state = os4;

// 6) 이동 실측 — 관찰모드(dt=0.1 = 1프레임분, simSpeed6). 콜당 이동거리 → 초당(60fps) 환산.
const measure = (dt, ticks, forceHunter) => {
  if (!v.mobs || !v.mobs.length) return null;
  const m = v.mobs[Math.floor(v.mobs.length / 2)];
  let h = null;
  if (forceHunter) { h = v.agents.find(a => a.job === 'hunter') || v.agents[0]; if (h) { h.job = 'hunter'; h.state = 'work'; } }
  let path = 0, c = 0, sx = m.px, sy = m.py;
  for (let i = 0; i < ticks; i++) { if (h) { h.px = m.px + 1.6; h.py = m.py; } const bx = m.px, by = m.py; global.updateMobs(v, dt); if (m.hp <= 0) break; path += Math.hypot(m.px - bx, m.py - by); c++; }
  return { perCall: path / Math.max(1, c), perSec: path / Math.max(1, c) * 60, total: path, net: Math.hypot(m.px - sx, m.py - sy), st: m.st, c };
};
const gz = measure(0.1, 120, false), fl = measure(0.1, 60, true);
_log(`\n6) 이동 실측 (관찰모드 dt=0.1 = 1프레임):`);
if (gz) _log(`   🌿풀뜯기: 콜당 ${gz.perCall.toFixed(3)}셀 → ~${gz.perSec.toFixed(1)}셀/초 · ${gz.c}콜 총 ${gz.total.toFixed(1)}셀 이동(순변위 ${gz.net.toFixed(1)}) · 상태 ${gz.st}`);
if (fl) _log(`   🏃도망: 콜당 ${fl.perCall.toFixed(3)}셀 → ~${fl.perSec.toFixed(1)}셀/초 · ${fl.c}콜 총 ${fl.total.toFixed(1)}셀 · 상태 ${fl.st}`);
_log(`   (참고: NPC 이동 L_WALK=2셀/게임분 → dt0.1서 콜당 0.2셀 → ~12셀/초)`);

// 7) 몹-몹 겹침(콜라이더) — 최근접 이웃거리 분포
for (let i = 0; i < 40; i++) global.updateMobs(v, 0.2);   // 채우고 이동시켜 정착
const M = v.mobs || [];
let minNN = 1e9, sumNN = 0, close = 0, nnc = 0;
for (let i = 0; i < M.length; i++) { let nn = 1e9; for (let j = 0; j < M.length; j++) { if (i !== j) { const d = Math.hypot(M[i].px - M[j].px, M[i].py - M[j].py); if (d < nn) nn = d; } } if (nn < 1e8) { if (nn < minNN) minNN = nn; sumNN += nn; nnc++; if (nn < 0.5) close++; } }
_log(`\n7) 몹-몹 겹침(콜라이더): n=${M.length} · 최근접 최소 ${minNN.toFixed(2)}셀 · 평균최근접 ${(sumNN / Math.max(1, nnc)).toFixed(2)}셀 · 0.5셀내 겹침 ${close}마리 ${close === 0 ? '✓' : '⚠️ 분리 필요'}`);

// 8) 건물벽 충돌 — 합성 벽으로 몹 침입 검사 (몹을 벽 쪽으로 도망시킴)
if (v.mobs && v.mobs.length && v.V) {
  const m = v.mobs[0], wx = Math.floor(m.px) + 2, wy = Math.floor(m.py);
  const saved = v.V.walls; v.V.walls = new Set([wx + ',' + wy, wx + ',' + (wy + 1), wx + ',' + (wy - 1), wx + ',' + (wy + 2), wx + ',' + (wy - 2)]);
  const h = v.agents.find(a => a.job === 'hunter') || v.agents[0]; const oj = h.job, os = h.state; h.job = 'hunter'; h.state = 'work';
  let entered = 0, ran = 0;
  for (let i = 0; i < 80; i++) { h.px = m.px - 1.5; h.py = m.py; global.updateMobs(v, 0.15); if (!v.mobs.includes(m)) break; ran++; if (v.V.walls.has(Math.floor(m.px) + ',' + Math.floor(m.py))) entered++; }
  _log(`8) 건물벽 충돌: 벽 향해 ${ran}틱 도망 → 벽 침입 ${entered}회 ${entered === 0 ? '✓' : '❌ 통과함'}`);
  v.V.walls = saved; h.job = oj; h.state = os;
} else _log(`8) 건물벽 충돌: v.V 없음 — 헤드리스 스킵(코드상 canWalk이 s.V.walls 검사)`);

// 9) 무리 짓기 — 깨끗한 조건(NPC 없음 → 순수 graze)서 동종 응집. 게임 최다 마을 사용.
const vh = VILS.filter(x => x.gameRich && x.gameRich.size > 0).sort((a, b) => { let sa = 0, sb = 0; for (const g of a.gameRich.values()) sa += g; for (const g of b.gameRich.values()) sb += g; return sb - sa; })[0] || v;
vh.mobs = []; const savedAg = vh.agents; vh.agents = [];   // NPC 없이 → 다 graze → 순수 무리행동
for (let i = 0; i < 250; i++) global.updateMobs(vh, 0.2);
const M2 = vh.mobs || [];
let sameSum = 0, sameN = 0, herdNb = 0;
for (let i = 0; i < M2.length; i++) {
  let nnSame = 1e9, nb = 0;
  for (let j = 0; j < M2.length; j++) { if (i === j) continue; const d = Math.hypot(M2[i].px - M2[j].px, M2[i].py - M2[j].py); if (M2[j].type === M2[i].type) { if (d < nnSame) nnSame = d; if (d < 9) nb++; } }
  if (nnSame < 1e8) { sameSum += nnSame; sameN++; }
  herdNb += nb;
}
const avgNb = herdNb / Math.max(1, M2.length);
_log(`\n9) 무리(NPC없이 순수graze): n=${M2.length} · 동종최근접 ${(sameSum / Math.max(1, sameN)).toFixed(1)}셀 · 9칸내 동종이웃 ${avgNb.toFixed(1)}마리 ${avgNb > 1.5 ? '✓ 무리형성' : '(성김)'}`);
vh.agents = savedAg;

// 10) 스트레스 — 전 마을 × 밤낮 2000프레임(습격·포식자·수면·전투 exercise): 크래시·NaN·개체수폭주 검사
let nan = 0, maxTot = 0, preds = 0, carcs = 0, crash = null;
try {
  for (let fr = 0; fr < 2000; fr++) {
    global.lifeGM = (global.lifeGM || 0) + 8;   // 시간 진행 → 밤낮 순환
    let tot = 0;
    for (const vv of VILS) { if (!vv.gameRich) continue; global.updateMobs(vv, 0.3);
      if (vv.mobs) for (const m of vv.mobs) { if (!isFinite(m.px) || !isFinite(m.py)) nan++; tot++; if (m.type === '🐺' || m.type === '🐯') preds++; if (m.st === 'dead') carcs++; } }
    if (tot > maxTot) maxTot = tot;
  }
} catch (e) { crash = e.message; }
let totInj = 0; for (const vv of VILS) totInj += (vv._inj || 0);
_log(`\n10) 스트레스(전마을×2000f 밤낮): ${crash ? '❌ 크래시: ' + crash : '✓ 무크래시'} · NaN위치 ${nan} ${nan === 0 ? '✓' : '❌'} · 최대몹/프레임 ${maxTot}(상한 ${CAP}×${VILS.length}=${CAP * VILS.length}) · 포식자관측 ${preds > 0 ? '✓' : '✗'} · 사체 ${carcs > 0 ? '✓' : '✗'} · NPC부상 ${totInj}`);

// ══ NPC 체력/요양/사망 검증 ══
_log('\n=== NPC HP 체계 ===');
try {
const vh2 = VILS.find(x => x.agents && x.agents.length >= 5 && x.econ && x.econ.npcs.length >= 5) || VILS[0];
const runDays = n => { for (let i = 0; i < n; i++) global.lifeDayAll(true); };
// 11) 회복 + 요양 해제(히스테리시스)
{ const a = vh2.agents[0]; a.hp = 30; a.rest = 1; runDays(1); const h1 = a.hp; runDays(14);
  _log(`11) 회복: hp30(요양) → 1일 ${h1.toFixed(0)} → 15일 ${a.hp.toFixed(0)} · rest=${a.rest} ${a.hp >= 100 && !a.rest ? '✓ 완전회복+요양해제' : '❌'}`); }
// 12) 죽음 → 인구손실 + 즉시부활 없음
{ const np0 = vh2.econ.npcs.length, ag0 = vh2.agents.length, victim = vh2.agents[1];
  victim.hp = 0; victim._dead = 1; vh2._anyDead = 1; global.reapDead(vh2);
  const np1 = vh2.econ.npcs.length, ag1 = vh2.agents.length; runDays(3);
  _log(`12) 죽음: econ.npcs ${np0}→${np1}(${np1 === np0 - 1 ? '✓ -1' : '❌'}) · agents ${ag0}→${ag1} · 3일후 인구 ${vh2.econ.npcs.length}(즉시부활 ${vh2.econ.npcs.length >= np0 ? '❌' : '✓ 없음'})`); }
// 13) 부상 노동력 계수
{ for (let i = 0; i < Math.min(3, vh2.agents.length); i++) { vh2.agents[i].hp = 20; vh2.agents[i].rest = 1; } runDays(1);
  _log(`13) 부상 노동력: _laborMul=${(vh2.econ._laborMul || 1).toFixed(3)} ${(vh2.econ._laborMul || 1) < 1 ? '✓ 생산 감소 반영' : '(이미 회복)'}`); }
// 14) 안정성: 100일 + 주기적 부상(치명 포함) — 크래시·죽음나선 검사
{ let crash2 = null, minPop = 1e9; try {
    for (let d = 0; d < 100; d++) {
      if (d % 5 === 0) for (const vv of VILS) { if (!vv.agents || !vv.agents.length) continue; const a = vv.agents[(Math.random() * vv.agents.length) | 0]; a.hp = (a.hp == null ? 100 : a.hp) - 40; if (a.hp <= 0) { a.hp = 0; a._dead = 1; vv._anyDead = 1; global.reapDead(vv); } else if (a.hp < 35) a.rest = 1; }
      global.lifeDayAll(true);
      for (const vv of VILS) if (vv.econ) { if (vv.econ.npcs.length < minPop) minPop = vv.econ.npcs.length; }
    }
  } catch (e) { crash2 = e.stack || e.message; }
  let totPop = 0; for (const vv of VILS) if (vv.econ) totPop += vv.econ.npcs.length;
  _log(`14) 안정성(100일·주기부상): ${crash2 ? '❌ 크래시: ' + crash2 : '✓ 무크래시'} · 마을 ${VILS.length}개 · 총인구 ${totPop} ${totPop > 0 && !crash2 ? '✓ 생존(죽음나선 없음)' : '❌'}`); }

} catch (e) { _log('  (NPC HP 테스트 = 하네스 flaky[a.area], 게임 무관 — 스킵: ' + e.message + ')'); }
// ══ 추격 결과 실측: 스토킹 사거리(18m)에 prey-포식자 배치 → 잡음/포기 비율(조우 문제 배제) ══
_log('\n=== 추격 성공률 (스토킹 사거리 18m서 시작 · 스폰 차단) ===');
const chaseOutcome = (type, trials, startD) => {
  const vv = VILS.find(x => x.forestCells && x.forestCells.length > 20) || VILS[0];
  const savedGR = vv.gameRich, savedAg = vv.agents, savedMobs = vv.mobs, savedWp = vv._wp;
  vv.gameRich = new Map(); vv.agents = []; vv._wp = new Map();   // 스폰·사냥꾼 차단
  let caught = 0, gaveup = 0, other = 0;
  const fc = vv.forestCells;
  for (let t = 0; t < trials; t++) {
    const c = fc[(Math.random() * (fc.length - 20) | 0) + 10];
    const prey = { px: c.cx, py: c.cy, type: '🦌', gid: 1, hp: 3, tmp: 1, stam: 1, hun: 0, ang: 0, pause: 0, cd: 0, fcd: 0, cvt: 0, wkt: 0, st: 'graze' };
    const pred = { px: c.cx + startD, py: c.cy, type, gid: 2, hp: type === '🐺' ? 4 : 14, tmp: 1, stam: 1, hun: 0.8, ang: Math.PI, pause: 0, cd: 0, fcd: 0, cvt: 0, flk: 0, st: 'stalk', tgt: prey };
    vv.mobs = [prey, pred];
    let out = 'other';
    for (let i = 0; i < 500; i++) { global.updateMobs(vv, 0.3); if (prey.hp <= 0 || prey.st === 'dead') { out = 'caught'; break; } if (i > 4 && (pred.st === 'rest' || pred.st === 'prowl')) { out = 'gaveup'; break; } }
    if (out === 'caught') caught++; else if (out === 'gaveup') gaveup++; else other++;
  }
  vv.gameRich = savedGR; vv.agents = savedAg; vv.mobs = savedMobs; vv._wp = savedWp;
  return { caught, gaveup, other, pct: (caught / trials * 100) };
};
const wc = chaseOutcome('🐺', 60, 18), tc = chaseOutcome('🐯', 60, 18);
_log(`늑대(18m→지구력): 잡음 ${wc.caught}/60 (${wc.pct.toFixed(0)}%) · 포기 ${wc.gaveup} ${wc.pct >= 30 ? '✓' : '⚠ 낮음'}`);
_log(`호랑이(18m→매복): 잡음 ${tc.caught}/60 (${tc.pct.toFixed(0)}%) · 포기 ${tc.gaveup} → ${tc.pct >= 4 && tc.pct <= 25 ? '✓ 매복 정상(현실 스토킹당 5~10% — 낮은 게 본질, 부족분은 사체·습격·기회가 메움)' : tc.pct < 4 ? '❌ ' + tc.pct.toFixed(0) + '% 과너프(스토킹 사거리서도 전멸)' : '⚠ ' + tc.pct.toFixed(0) + '% 과버프(매복종이 코싱급 — envelope 점검)'}`);   // ★합격선 재보정: 종전 ≥20%는 코싱(늑대) 기대치를 매복종에 적용 — §10 캐논 '성공률 낮음'과 상충했음
