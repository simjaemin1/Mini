// ═══════════════════════════════════════════════════════════════════════════
// _wargame-probe.js — 전쟁실험실.html 전용 프로브(_war-probe.js 형제).
//   2단계: economy 동일성(전쟁실험실 vs 마을실험실 동일 시드 → 동일 경제/전쟁 지표).
//   3단계: conscript(경제→병종 편성) — 산지 vs 무산지 composition, 무기재고0 실패, 징집률·화살·군량.
//   4단계: 전술전투 교체(runBattleHeadless), 노획, 결과 되먹임(사상=인구감소, 약탈, _weapQ 갱신).
//   검증: 승률 정합(전술 vs 기존공식), 청동>석기, 경제안정(장기 다시드).
//   ★ 전쟁실험실.html·마을실험실.html 무수정. battle-core.js는 require로 BattleCore 전역화.
//   ★ 결정론: 시드로 Math.random 주입(하네스만). /tmp·in-memory만. DB·git 쓰기 없음.
//   실행: node sim/_wargame-probe.js <mode> [args]
//     mode: econ-eq | conscript | battle | feedback | stability | all
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const _log = console.log;

// ── 시드 RNG (_war-probe.js __mr 패턴) ──
const __mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ── HTML을 헤드리스 구동 가능한 격리 sandbox 로 로드 (마을실험실/전쟁실험실 공용) ──
//   각 파일마다 독립 global 오염을 피하기 위해 vm 컨텍스트 대신 함수-스코프 eval 로 격리한 핸들 반환.
function loadLab(fileName, nvil) {
  const LAB = path.join(ROOT, fileName);
  const H = fs.readFileSync(LAB, 'utf8');
  // battle-core 는 전역 BattleCore 필요 — 매 로드 fresh require(모듈 상태 격리)
  delete require.cache[require.resolve('./battle-core.js')];
  const _win = global.window; global.window = undefined;
  const BattleCore = require('./battle-core.js');
  global.window = _win;
  // economy-engine (EconEngine 전역)
  delete require.cache[require.resolve('./economy-engine.browser.js')];
  require('./economy-engine.browser.js');

  const G = global;
  G.N = 1600; G.idx = (x, y) => y * 1600 + x; G.inG = (x, y) => x >= 0 && y >= 0 && x < 1600 && y < 1600;
  G.smt = t => t * t * (3 - 2 * t);
  G.hash2 = (ix, iy, s) => { let h = ix * 374761393 + iy * 668265263 + s * 1274126177; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  G.vn = (x, y, s) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s); const u = smt(fx), v = smt(fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
  G.fbm = (x, y, s) => { let t = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { t += a * vn(x * f, y * f, s + i * 31); a *= .5; f *= 2; } return t; };
  G.MAX_CELLS = Math.PI * 60 * 60;
  G.__mr = __mr; G.BattleCore = BattleCore;
  const vals = { pop: '8', fertV: '0.55', waterV: '0.5', sizeMul: '1.5', compactW: '0', settType: 'nucleated', seed: '7', terrMode: 'auto', simSpeed: '80000', nvil: String(nvil || 8) };
  const els = {}; G.document = { getElementById: id => els[id] || (els[id] = { value: vals[id] != null ? vals[id] : '0', textContent: '', innerHTML: '', checked: false, addEventListener: () => {} }) };
  G.draw = () => {}; G.V = null; G.TR = null; G.life = null; G.lifeOn = false; G.lifeGM = 0; G.lifeLast = 0; G.lifeSlow = false;
  G.buildWalls = () => new Set(); G.nowMs = 0; G.performance = { now: () => G.nowMs }; G.rafCb = null; G.requestAnimationFrame = cb => { G.rafCb = cb; };
  const grab = re => { const m = H.match(re); if (!m) throw new Error('패턴 못찾음: ' + re); return m[0]; };
  const BT = grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/), VL = grab(/const VillageLayout=\(function\(\)\{[\s\S]*?\}\)\(\);/),
    PC = grab(/function pickCenter\(\)\{[\s\S]*?\n\}/), BFS = grab(/function bfsPath\([\s\S]*?\n\}/), SP = grab(/function setPath\([\s\S]*?\n\}/),
    TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),
    LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
  G.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
  G.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
  G.frame = function () { G.nowMs += 16; const cb = G.rafCb; G.rafCb = null; if (cb) cb(G.nowMs); };
  G.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE +
    "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
  G.__log = _log; console.log = _log;
  return {
    run0: G.run0, frame: G.frame,
    getWarStats: () => (G.warStats ? G.warStats() : null),
    getVILS: () => G.VILS,
    // 전쟁실험실 신규 함수(전역 노출 — 함수선언이 global eval 로 전역화됨)
    conscript: G.conscript, toBattleSpec: G.toBattleSpec, runBattleHeadless: G.runBattleHeadless,
    BattleCore,
  };
}

// ── 시뮬 N프레임 구동 후 지표 스냅샷 ──
function runSim(lab, seed, frames) {
  const VILS = lab.run0(seed);
  console.log = function () {};
  for (let fr = 0; fr < frames; fr++) lab.frame();
  console.log = _log;
  const ws = lab.getWarStats();
  const pop = VILS.reduce((a, v) => a + (v.econ ? v.econ.npcs.length : 0), 0);
  return { VILS, ws, nv: VILS.length, pop };
}

function warStatsSig(ws) {
  if (!ws) return 'null';
  const bc = ws.byCasus || {};
  return `decl${ws.decl}|bat${ws.battle}|aW${ws.atkWin}|dW${ws.defWin}|cas${ws.cas}|loot${ws.loot}|trib${ws.tribute}|pal${ws.palisade}|T${bc.trade || 0}/Te${bc.territory || 0}/P${bc.prestige || 0}/F${bc.feud || 0}`;
}

const MODE = (require.main === module) ? (process.argv[2] || 'all') : '__module__';   // require 시 자동실행 금지(모듈로 로드하면 헬퍼만 export)

// ═══════════ 2단계: economy 동일성 ═══════════
function modeEconEq(frames, nvil, seeds) {
  _log(`\n=== [2단계] economy 동일성: 전쟁실험실 vs 마을실험실 (마을 ${nvil} · ${frames}프레임 · 시드 ${seeds.join(',')}) ===`);
  _log(`  ※ 전투 발생 전(day<365 부근)엔 두 파일 완전 byte-동일 = 골격/economy 무결. 전투 발생 후엔 사상자가 전술(battle-core) vs 추상(powA/powD)로 갈려 의도적 상이(4단계 목표).`);
  let allEq = true;
  for (const seed of seeds) {
    let mlSig, wgSig, mlPop, wgPop, err = null;
    try {
      const ml = loadLab('마을실험실.html', nvil); const r1 = runSim(ml, seed, frames);
      mlSig = warStatsSig(r1.ws); mlPop = r1.pop; const mlNv = r1.nv;
      const wg = loadLab('전쟁실험실.html', nvil); const r2 = runSim(wg, seed, frames);
      wgSig = warStatsSig(r2.ws); wgPop = r2.pop; const wgNv = r2.nv;
      const eq = mlSig === wgSig && mlPop === wgPop && mlNv === wgNv;
      allEq = allEq && eq;
      _log(`  시드${seed}: ${eq ? '✓ 동일' : '✗ 상이'}`);
      _log(`    마을: 인구${mlPop} 마을${mlNv} · ${mlSig}`);
      _log(`    전쟁: 인구${wgPop} 마을${wgNv} · ${wgSig}`);
      if (!eq) _log(`    ⚠ BattleCore.UNITS=${wg.BattleCore.UNITS ? Object.keys(wg.BattleCore.UNITS).length + '병종' : 'X'}`);
    } catch (e) { err = (e.stack || e.message).split('\n').slice(0, 4).join(' | '); allEq = false; _log(`  시드${seed}: ❌ ${err}`); }
  }
  // BattleCore 접근성
  try { const wg = loadLab('전쟁실험실.html', nvil); _log(`  BattleCore.UNITS 접근: ${wg.BattleCore.UNITS ? '✓ ' + Object.keys(wg.BattleCore.UNITS).join('/') : '❌'} · ARROWS_PER=${wg.BattleCore.ARROWS_PER}`); } catch (e) { _log('  BattleCore 접근 ❌ ' + e.message); }
  _log(`  → ${allEq ? '✅ economy 완전 동일(전쟁실험실 골격 무결)' : '❌ 불일치'}`);
  return allEq;
}

// ═══════════ 3단계: conscript — 산지 vs 무산지 composition, 무기재고0 실패 ═══════════
function modeConscript(frames, nvil, seed) {
  _log(`\n=== [3단계] 징집(conscript): 산지 vs 무산지 composition (마을 ${nvil} · 시드 ${seed} · ~${Math.round(frames * 0.9)}일) ===`);
  const lab = loadLab('전쟁실험실.html', nvil);
  const VILS = lab.run0(seed); console.log = function () {};
  for (let i = 0; i < frames; i++) lab.frame();
  console.log = _log;
  _log('  마을 | N | 전사/사냥 | tin산지 청동자격 | 무기 _weapQ _swordFrac | RAID편성 | FULL편성');
  let bronzeVil = 0, stoneVil = 0, failVil = 0;
  for (const V of VILS) {
    const e = V.econ; if (!e) continue;
    const N = e.npcs.length, c = e.counts || {};
    const tin = (e.land && e.land.tin) || 0, stin = (e.storage && e.storage.tin) || 0;
    const cap = tin > 0 || stin >= Math.max(13, N * 0.95);
    const raid = lab.conscript(V, 'raid'), full = lab.conscript(V, 'full');
    const fmt = x => x ? `f${x.force}{청동${x.composition.champion} 석검${x.composition.dagger} 창${x.composition.spear} 장창${x.composition.pike} 궁${x.composition.archer}}화살${x.arrows}` : 'null(출정불가)';
    if (!raid && !full) failVil++;
    else if ((raid && raid.composition.champion > 0) || (full && full.composition.champion > 0)) bronzeVil++;
    else stoneVil++;
    _log(`  ${V.name} | N${N} | ${Math.round(c.warrior || 0)}/${Math.round(c.hunter || 0)} | tin${tin.toFixed(2)}${cap ? ' 청동O' : ' 청동X'} | ${(e.storage.weapon || 0).toFixed(1)} q${e._weapQ != null ? e._weapQ.toFixed(2) : '--'} sf${e._swordFrac != null ? e._swordFrac.toFixed(2) : '--'} | ${fmt(raid)} | ${fmt(full)}`);
  }
  _log(`  → 청동편성 ${bronzeVil}곳(champion>0) · 석기편성 ${stoneVil}곳(champion=0) · 출정불가 ${failVil}곳(무기부족) ${bronzeVil > 0 ? '✅ 산지=청동 무산지=석기 확인' : '⚠ 청동편성 마을 없음(시드/기간 조정)'}`);
}

// ═══════════ 4단계: 전술전투 승률 vs 기존 공식 정합 + 청동>석기 ═══════════
function modeBattle(seedCount) {
  _log(`\n=== [4단계] 전술전투 승률 정합(vs 기존 powA/powD 공식) + 청동>석기 (평지·지휘off · ${seedCount}시드) ===`);
  const lab = loadLab('전쟁실험실.html', 4);
  const abstractWin = (A, D, rng) => {
    const aEff = Math.max(1, A.warriors + (A.force - A.warriors) * 0.25), dEff = Math.max(1, D.warriors + (D.force - D.warriors) * 0.25);
    const powA = aEff * (0.6 + 0.5) * (0.85 + rng() * 0.3), powD = dEff * (0.6 + 0.5) * (0.85 + rng() * 0.3); return powA > powD;
  };
  const scen = [
    ['대칭 창방패8 vs 창방패8', { champion: 0, spear: 8, warriors: 8, force: 8, weapQ: 0.5 }, { champion: 0, spear: 8, warriors: 8, force: 8, weapQ: 0.5 }],
    ['청동 청동3창5 vs 석기 창8', { champion: 3, spear: 5, warriors: 8, force: 8, weapQ: 0.9 }, { champion: 0, spear: 8, warriors: 8, force: 8, weapQ: 0.5 }],
    ['혼합 창6궁4 vs 창6궁4', { champion: 0, spear: 6, archer: 4, warriors: 6, force: 10, weapQ: 0.5 }, { champion: 0, spear: 6, archer: 4, warriors: 6, force: 10, weapQ: 0.5 }],
  ];
  const seeds = []; for (let s = 1; s <= seedCount; s++) seeds.push(s * 13 + 1);
  for (const [name, A, D] of scen) {
    let tW = 0, aW = 0;
    for (const seed of seeds) {
      const spec = { A: { champion: A.champion || 0, spear: A.spear || 0, dagger: A.dagger || 0, pike: A.pike || 0, archer: A.archer || 0, form: 'line' }, B: { champion: D.champion || 0, spear: D.spear || 0, dagger: D.dagger || 0, pike: D.pike || 0, archer: D.archer || 0, form: 'line' }, terrain: 'plain', quality: { A: { weapQ: A.weapQ }, B: { weapQ: D.weapQ } } };
      if (lab.runBattleHeadless(spec, seed).winner === 'A') tW++;
      if (abstractWin(A, D, __mr(seed + 99999))) aW++;
    }
    const n = seeds.length, dev = Math.abs(tW - aW) / n * 100;
    _log(`  ${name.padEnd(26)} 전술 ${Math.round(100 * tW / n)}%(${tW}/${n}) | 공식 ${Math.round(100 * aW / n)}%(${aW}/${n}) ${name.includes('청동') ? (tW / n > 0.8 ? '✅ 청동 유의미 우세' : '⚠') : (dev <= 25 ? '✓ 정합(±)' : '⚠ 괴리 ' + dev.toFixed(0) + '%')}`);
  }
}

// ═══════════ 4단계: 결과 되먹임 — 사상=인구감소, 약탈 방향, 노획+_weapQ 갱신 ═══════════
function modeFeedback(frames, nvil, seed) {
  _log(`\n=== [4단계] 결과 되먹임: 사상=인구감소·약탈방향·무기노획+_weapQ (마을 ${nvil} · 시드 ${seed}) ===`);
  const lab = loadLab('전쟁실험실.html', nvil);
  const VILS = lab.run0(seed); console.log = function () {};
  const snap = () => { const m = {}; for (const V of VILS) if (V.econ) m[V.name] = { N: V.econ.npcs.length, food: V.econ.storage.food || 0, weapon: V.econ.storage.weapon || 0, weapQ: V.econ._weapQ, pg: ['bronze', 'jade', 'hide', 'tigerhide'].reduce((a, k) => a + (V.econ.storage[k] || 0), 0) }; return m; };
  let prevBattle = 0, reports = [];
  for (let i = 0; i < frames; i++) {
    const before = snap(); lab.frame(); const ws = lab.getWarStats();
    if (ws.battle > prevBattle) {
      prevBattle = ws.battle; const after = snap(), changed = [];
      for (const k in after) { const b = before[k], a = after[k]; if (!b) continue;
        if (Math.abs(a.weapon - b.weapon) > 0.01 || Math.abs(a.food - b.food) > 1 || a.N !== b.N || Math.abs((a.weapQ || 0) - (b.weapQ || 0)) > 0.001)
          changed.push(`${k}: N${b.N}→${a.N}(${a.N - b.N}) food${(a.food - b.food >= 0 ? '+' : '')}${(a.food - b.food).toFixed(0)} 무기${(a.weapon - b.weapon >= 0 ? '+' : '')}${(a.weapon - b.weapon).toFixed(1)} weapQ${(b.weapQ || 0).toFixed(3)}→${(a.weapQ || 0).toFixed(3)} 위세재${(a.pg - b.pg >= 0 ? '+' : '')}${(a.pg - b.pg).toFixed(0)}`);
      }
      reports.push({ log: ws.log[ws.log.length - 1], changed });
    }
  }
  console.log = _log;
  if (!reports.length) { _log('  전투 미발생(기간 늘리거나 시드 조정)'); return; }
  for (const r of reports) { _log('  ▶ ' + r.log); for (const c of r.changed) _log('     ' + c); }
  _log('  → 사상=N감소 · 승자 food↑무기↑ / 패자 food↓무기↓ · 노획분 품질이 승자 _weapQ 가중평균에 반영');
}

// ═══════════ 경제 안정 — 장기 다시드(마을생존·비스파이럴) ═══════════
function modeStability(frames, nvil, seed) {
  _log(`\n=== [경제안정] ${frames}프레임(~${Math.round(frames * 0.9)}일) · 마을 ${nvil} · 시드 ${seed} ===`);
  const lab = loadLab('전쟁실험실.html', nvil);
  const VILS = lab.run0(seed); console.log = function () {};
  for (let i = 0; i < frames; i++) lab.frame();
  console.log = _log;
  const ws = lab.getWarStats(), alive = VILS.filter(v => v.econ && v.econ.npcs.length > 0).length;
  const pop = VILS.reduce((a, v) => a + (v.econ ? v.econ.npcs.length : 0), 0);
  let maxGap = 0, maxRep = 0;
  if (ws.log && ws.log.length) {
    const bd = ws.log.filter(l => l.includes('전투 ')).map(l => { const m = l.match(/^D(\d+)/); return m ? +m[1] : 0; }).filter(x => x);
    for (let i = 1; i < bd.length; i++) maxGap = Math.max(maxGap, bd[i] - bd[i - 1]);
    const pairs = {}; for (const l of ws.log.filter(l => l.includes('선전포고'))) { const m = l.match(/(마을\d+)→(마을\d+)/); if (m) { const k = m[1] + m[2]; pairs[k] = (pairs[k] || 0) + 1; if (pairs[k] > maxRep) maxRep = pairs[k]; } }
  }
  const okSurv = alive >= nvil - 1, okSpiral = ws.battle < 2 || maxGap > 60, okRep = maxRep <= 2;
  _log(`  마을생존 ${alive}/${nvil} ${okSurv ? '✓' : '⚠'} · 인구 ${pop} · 선포${ws.decl} 전투${ws.battle} 공승률${ws.battle ? Math.round(100 * ws.atkWin / ws.battle) : 0}% 사상${ws.cas} 노획${ws.weaponLoot || 0}`);
  _log(`  최장휴전 ${maxGap}일 ${okSpiral ? '✓ 비스파이럴' : '⚠ 연속'} · 동일쌍최다 ${maxRep}회 ${okRep ? '✓ 학습' : '⚠ 반복공격'} → ${okSurv && okSpiral && okRep ? '✅ 안정' : '⚠ 점검'}`);
}

if (MODE === 'econ-eq' || MODE === 'all') {
  const frames = parseInt(process.argv[3]) || 250;   // 기본 250프레임=day~343(전투발생 전) → byte-동일 검증. 늘리면 전투후 의도적 상이.
  const nvil = parseInt(process.argv[4]) || 4;
  const seeds = (process.argv[5] ? process.argv[5].split(',').map(Number) : [7]);
  modeEconEq(frames, nvil, seeds);
}
if (MODE === 'conscript') modeConscript(parseInt(process.argv[3]) || 900, parseInt(process.argv[4]) || 8, parseInt(process.argv[5]) || 7);
if (MODE === 'battle') modeBattle(parseInt(process.argv[3]) || 40);
if (MODE === 'feedback') modeFeedback(parseInt(process.argv[3]) || 1000, parseInt(process.argv[4]) || 6, parseInt(process.argv[5]) || 7);
if (MODE === 'stability') modeStability(parseInt(process.argv[3]) || 1000, parseInt(process.argv[4]) || 6, parseInt(process.argv[5]) || 7);
if (MODE === '__module__') { /* required as module: export only, no auto-run */ }

module.exports = { loadLab, runSim, __mr, warStatsSig, modeEconEq, modeConscript, modeBattle, modeFeedback, modeStability };
