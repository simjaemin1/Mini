// ═══════════════════════════════════════════════════════════════════════════
// _captive-probe.js — 포로 시스템(기절→포로·엔티티 연속 호송·저효율 노동·탈출·동화·몸값) 실측 프로브.
//   사용자 승인 설계(구속): 스폰·순간이동 절대 금지 — 포로도 "그 사람"(같은 npc/agent 객체)이 물리적으로 끌려가야 한다.
//   전쟁실험실.html 블록A(생활·전쟁 econ)+블록B(전쟁 UI)를 한 eval 스코프에 로드(_justice/_return-probe 하네스 동형).
//   시나리오(각각 독립 프로세스·시드당 단일 프로세스·프레임 ≤850):
//     a — 결판 포로화 분할 정합: 합성 결판(warResolveBattle precomputedRes)으로 후보=round(사상×0.35)·J 상한(round(J×후보))·
//         호송 상한(승자병력×0.5)·초과 방면 검증 + ★같은 객체 증명(splice 전후 npc 참조·age·skills 동일).
//     b — 엔티티 연속 호송: 실전투(강제 전쟁→돌격→LiveBattle 결판) — 포로 agent가 승자 RET 행군에 captive 유닛으로 동반,
//         전장→승자 마을 도보(프레임별 px/py 연속·도약 상한 위반 0), 도착 해제 후 승자 마을 일상 편입. + (g)인구 정합.
//     c — 포로 노동 ×0.6 실측(econ 번들 직접): 같은 시드 2월드 — day151 전 주민 captive 부착 시 dailyProduction == 0.6×기준(수치 일치)
//         + 300일 직업 게이트: captive가 warrior/hunter로 전환된 사례 0.
//     d — 탈출: 실전투 포로 픽스처 → warCaptiveDaily 일 스캔으로 탈출 발생 → 도보 귀향(연속) → econ 고향 splice 복귀(같은 객체).
//     e — 동화: since를 3년 전으로 빨리감기 → warCaptiveDaily 1회에 captive 해제 + assimilated 계수.
//     f — 몸값: 고향 식량 여유·저원한 픽스처 → 30일 주기 롤 → 식량 40/명 이전 원장 + 포로 도보 귀향.
//     g — 인구 정합(b·d 말미 공통): 전 마을 econ.npcs.length == vil.agents.length(정착 후), _muster 고아 0.
//   ★전쟁실험실.html 무수정(읽기만). /tmp·in-memory. DB·git 없음. 결정론(시드 Math.random 주입 __mr + _muRng/_warCapRng — 프로브 자신 Math.random 미사용).
//   실행: node sim/_captive-probe.js <a|b|c|d|e|f> [seed=7] [nvil=8]
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const _log = console.log;

const __mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function loadLabFull(nvil) {
  const LAB = path.join(ROOT, '전쟁실험실.html');
  const H = fs.readFileSync(LAB, 'utf8');
  delete require.cache[require.resolve('./battle-core.js')];
  const _win = global.window; global.window = undefined;
  const BattleCore = require('./battle-core.js');
  global.window = _win;
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
  const els = {};
  G.document = {
    getElementById: id => els[id] || (els[id] = { value: vals[id] != null ? vals[id] : '0', textContent: '', innerHTML: '', checked: false, addEventListener: () => {}, onclick: null }),
    querySelector: () => ({ appendChild: () => {} }),
    createElement: () => ({ style: {}, className: '', innerHTML: '', appendChild: () => {} }),
    activeElement: null, addEventListener: () => {},
  };
  G.draw = () => {}; G.V = null; G.TR = null; G.life = null; G.lifeOn = false; G.lifeGM = 0; G.lifeLast = 0; G.lifeSlow = false;
  G.dispatchTrades = () => {};
  G.buildWalls = () => new Set(); G.nowMs = 0; G.performance = { now: () => G.nowMs };
  G.rafCb = null; G.requestAnimationFrame = cb => { G.rafCb = cb; };
  G.cv = { addEventListener: () => {} };
  G.addEventListener = () => {};
  G.window = G;
  const grab = re => { const m = H.match(re); if (!m) throw new Error('패턴 못찾음: ' + re); return m[0]; };
  const BT = grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/), VL = grab(/const VillageLayout=\(function\(\)\{[\s\S]*?\}\)\(\);/),
    PC = grab(/function pickCenter\(\)\{[\s\S]*?\n\}/), BFS = grab(/function bfsPath\([\s\S]*?\n\}/), SP = grab(/function setPath\([\s\S]*?\n\}/),
    TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),
    LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
  const blocks = [...H.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const BLOCK4 = blocks[blocks.length - 1][1];
  G.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
  G.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
  G.frame = function () { G.nowMs += 16; const cb = G.rafCb; G.rafCb = null; if (cb) cb(G.nowMs); };
  G.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE + '\n' + BLOCK4 +
    "\nglobal.getWARS=function(){return WARS;};" +
    "\nglobal.getGM=function(){return lifeGM;};" +
    "\nglobal.getWorld=function(){return ECON_WORLD;};" +
    "\nglobal.getTRIB=function(){return TRIBUTES;};" +
    "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
  G.__log = _log; console.log = _log;
  return { frame: G.frame, run0: G.run0, BattleCore };
}

const SC = String(process.argv[2] || 'a');
const SEED = +(process.argv[3] || 7), NVIL = +(process.argv[4] || 8) || 8;
let pass = true; const fail = m => { pass = false; _log('  ❌ ' + m); };
const ok = (c, m) => { if (c) _log('  ✓ ' + m); else fail(m); return !!c; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol);
const quietG = fn => { const c = console.log; console.log = () => {}; try { return fn(); } finally { console.log = c; } };

// ═══ (c) econ 번들 전용 — 랩 로드 없이 EconEngine 직접(빠름·정밀) ═══
if (SC === 'c') {
  _log(`═══ [포로] 시나리오 c — 노동 ×0.6 실측(econ 번들) + 직업 게이트 ═══`);
  require('./economy-engine.browser.js');
  const E = globalThis.EconEngine;
  const mk = () => E.createWorldV2({ seed: 7, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
  const runD = (w, n) => quietG(() => { for (let d = 0; d < n; d++) E.tickWorldV2(w); });
  // 기준 월드: 150일 → day151 dailyProduction 기록
  const w1 = mk(); runD(w1, 150);
  const w2 = mk(); runD(w2, 150);
  const V1 = w1.villages[1], V2 = w2.villages[1];
  ok(V1.npcs.length === V2.npcs.length && Math.abs((V1.storage.food || 0) - (V2.storage.food || 0)) < 1e-9, `같은 시드 순차 2월드 150일 상태 일치(결정론 전제) — pop ${V1.npcs.length}/${V2.npcs.length} food ${(V1.storage.food || 0).toFixed(3)}`);
  for (const n of V2.npcs) n.captive = { home: 'X', since: 150 };   // 마을'나' 전 주민 포로화(다른 마을 무개입)
  runD(w1, 1); runD(w2, 1);
  const p1 = Object.assign({}, V1.dailyProductionBuf), p2 = Object.assign({}, V2.dailyProductionBuf);
  let checked = 0, exact = 0;
  for (const r in p1) { if (!(p1[r] > 1e-12)) continue; checked++; if (near(p2[r], 0.6 * p1[r], 1e-9 * Math.max(1, p1[r]))) exact++; else fail(`자원 ${r}: ${p2[r]} != 0.6×${p1[r]}`); }
  ok(checked >= 3 && exact === checked, `day151 생산 전 항목 ×0.6 수치 일치 — ${exact}/${checked}개 자원(예: food ${p1.food ? p1.food.toFixed(3) + '→' + p2.food.toFixed(3) : '-'})`);
  // 비포로 마을 무영향(훅 격리): 다른 마을 4곳 day151 생산 완전 동일
  let iso = 0, isoBad = 0;
  for (const k of [0, 2, 3, 4]) { const a = w1.villages[k].dailyProductionBuf, b = w2.villages[k].dailyProductionBuf;
    for (const r in a) { if (near(b[r] || 0, a[r] || 0)) iso++; else isoBad++; } }
  ok(isoBad === 0, `비포로 마을 생산 완전 동일(훅 격리) — ${iso}항목 일치·불일치 ${isoBad}`);
  // 직업 게이트: 300일 진행 — captive가 warrior/hunter로 '전환된' 사례 0 (기존 직업 유지는 허용 — 게이트는 신규 배정 차단)
  let gateViol = 0; const wasJob = new Map(); for (const n of V2.npcs) wasJob.set(n, n.currentJob);
  for (let d = 0; d < 300; d++) { runD(w2, 1);
    for (const n of V2.npcs) { if (!n.captive) continue; const w0 = wasJob.get(n);
      if (w0 != null && n.currentJob !== w0 && (n.currentJob === 'warrior' || n.currentJob === 'hunter')) gateViol++;
      wasJob.set(n, n.currentJob); } }
  ok(gateViol === 0, `300일 직업 게이트 — captive의 warrior/hunter 신규 전환 ${gateViol}건(=0)`);
  _log('══════════════════════════════════════════════════════════════');
  _log(pass ? '✅✅ 시나리오 c 통과 (노동 ×0.6 수치 일치·훅 격리·무기 직 게이트)' : '❌ 시나리오 c 실패');
  process.exit(pass ? 0 : 1);
}

// ═══ 랩 전체 로드(a·b·d·e·f) ═══
_log(`═══ [포로] 시나리오 ${SC} · 시드${SEED} · ${NVIL}마을 ═══`);
const lab = loadLabFull(NVIL);
const G = global;
const VILS = lab.run0(SEED);
const setSpeed = v => { G.document.getElementById('simSpeed').value = String(v); };
const dayNow = () => (VILS.length ? VILS[0].day | 0 : 0);
const quiet = quietG;
let frames = 0;
function step() { quiet(() => { lab.frame(); if (G.tickMarch) G.tickMarch(); if (G.tickWarGroups) G.tickWarGroups(); if (G.tickLiveBattles) G.tickLiveBattles(); }); frames++; }

setSpeed(80000);
while (dayNow() < 200 && frames < 140) step();
_log(`  워밍업: day=${dayNow()} frames=${frames} 마을=${VILS.length}`);
for (const v of VILS) v._warCd = dayNow() + 9000;   // 자연 개전 봉인(픽스처 오염 방지)

function pickPair() { let A = null, B = null, bd = 1e18;
  for (let i = 0; i < VILS.length; i++) for (let j = 0; j < VILS.length; j++) { if (i === j) continue;
    const v = VILS[i], u = VILS[j]; if (!v.econ || !u.econ || v.econ.npcs.length < 10 || u.econ.npcs.length < 10) continue;
    const d = Math.hypot(v.center.cx - u.center.cx, v.center.cy - u.center.cy);
    if (d > 60 && d < 520 && d < bd) { bd = d; A = v; B = u; } }
  return A ? { A, B, bd } : null; }
const orphanCount = () => { const seen = new Set(); const add = L => { if (L) for (const a of L) if (a) seen.add(a); };
  for (const w of G.getWARS()) { if (w._mg) add(w._mg.drafted); if (w._dg) add(w._dg.drafted); }
  for (const lb of G.LIVE_BATTLES) { add(lb.atkAgents); add(lb.defAgents); }
  if (G.PW) { if (G.PW.march) add(G.PW.march.drafted); if (G.PW._dg) add(G.PW._dg.drafted); }
  for (const rg of G.RET_GROUPS) add(rg.drafted);
  let orph = 0; for (const vil of VILS) if (Array.isArray(vil.agents)) for (const a of vil.agents) if (a && a._muster && !seen.has(a)) orph++;
  return orph; };
const popRow = () => VILS.map(v => `${v.name} ${v.econ.npcs.length}/${v.agents.length}`).join(' · ');
const popMismatch = () => { let bad = 0; for (const v of VILS) if (v.econ && Array.isArray(v.agents) && v.econ.npcs.length !== v.agents.length) bad++; return bad; };

if (SC === 'a') {
  // ═══ (a) 결판 포로화 — 분할 정합 + 같은 객체 증명(합성 결판·econ 전용) ═══
  // 공격 A = 최대 마을 고정, 방어 = 다음 큰 마을 3곳(케이스별 독립 — 앞 케이스의 인구 손실이 다음 케이스 상한을 오염하지 않게)
  const byPop = VILS.filter(v => v.econ && v.econ.npcs.length >= 12).sort((x, y) => y.econ.npcs.length - x.econ.npcs.length);
  if (byPop.length < 4) { _log('❌ 후보 마을 부족(≥12명 4곳 필요): ' + byPop.length); process.exit(1); }
  const A = byPop[0], DEFS = [byPop[1], byPop[2], byPop[3]];
  const st = G.warStats();
  const mkRes = (dDead, aDead, aSurv, dSurv) => ({ winner: 'A', atkStart: aSurv + aDead, atkDead: aDead, defStart: dDead + dSurv, defDead: dDead,
    atkSurv: aSurv, defSurv: dSurv, survivorsByType: { A: {}, B: {} }, ticks: 100, tick: 5.0, routA: 0, routB: 0, routMrlA: 0.5, routMrlB: 0.5 });
  const mkWar = (B, casus) => ({ id: 900 + (st.captured || 0), atk: A, def: B, casus, force: 20, warriors: 8, wep: 1, arm: 0,
    composition: { spear: 12, dagger: 8 }, weapQ: 0.5, phase: 'march', eta: dayNow(), marchDays: 1, born: dayNow(), _vetRoster: null });
  const CAPF = 0.35, ESC = 0.5, ADEAD = 2;
  const runCase = (name, B, casus, dDead, aSurv, grudge) => {
    if (A._grudge) A._grudge.delete(B.name);
    if (grudge) G.warAddGrudge(A, B.name, grudge);
    const J = G.warJustice(A, B, casus);
    const D = B.econ, W = A.econ;
    const nB0 = D.npcs.length, nA0 = W.npcs.length;
    dDead = Math.min(dDead, nB0 - 2);
    const preSet = new Set(D.npcs); const meta = new Map(); for (const n of D.npcs) meta.set(n, { age: n.age, skills: n.skills, id: n.id });
    const cap0 = st.captured || 0, free0 = st.capFreed || 0;
    const w = mkWar(B, casus);
    quiet(() => G.warResolveBattle(w, dayNow(), { res: mkRes(dDead, ADEAD, aSurv, 4), spec: {} }));
    const cand = Math.round(dDead * CAPF), jCap = Math.round(J * cand), esCap = Math.floor(aSurv * ESC);
    const expTake = Math.min(cand, jCap, esCap), expFree = cand - expTake, expKill = dDead - cand;
    const took = (st.captured || 0) - cap0, freed = (st.capFreed || 0) - free0;
    const nB1 = D.npcs.length, nA1 = W.npcs.length;
    ok(took === expTake && freed === expFree, `${name}: J=${J.toFixed(2)} 사상판정 ${dDead} → 후보 ${cand}(35%) · 포로 ${took}(기대 ${expTake}=min[후보,J상한 ${jCap},호송 ${esCap}]) · 방면 ${freed}(기대 ${expFree})`);
    ok(nB1 === nB0 - expKill - expTake && nA1 === nA0 - ADEAD + expTake, `${name}: 인구 원장 — 패자 ${nB0}→${nB1}(사망 ${expKill}+끌려감 ${expTake}·방면 ${expFree} 생존) · 승자 ${nA0}→${nA1}(자군 사상 −${ADEAD}, 포로 +${expTake})`);
    // ★같은 객체 증명: 승자 econ의 신규 captive npc가 전부 '전투 전 패자 npcs 집합의 그 객체'(===) — age·skills 참조 보존, createNPC 흔적 0
    const caps = W.npcs.filter(n => n.captive && n.captive.since === dayNow());
    let same = 0, diff = 0;
    for (const n of caps) { const m = meta.get(n); if (preSet.has(n) && m && m.age === n.age && m.skills === n.skills && m.id === n.id) same++; else diff++; }
    ok(caps.length === took && diff === 0 && same === took, `${name}: 같은 객체 증명 — 승자 내 신규 포로 ${caps.length}명 전원 splice 전 참조와 동일(===)·age/skills 보존 (불일치 ${diff})`);
    for (const n of caps) ok2ban(n, name);
    for (const n of caps) { n.captive.since = -9999; }   // 다음 케이스와 구분(since 태그 소거)
    return { J, took, freed };
  };
  let banBad = 0; const ok2ban = (n) => { if (n.currentJob === 'warrior' || n.currentJob === 'hunter') banBad++; };
  runCase('응징(J=1.0)', DEFS[0], 'feud', 12, 30, 0);       // 상한 안 걸림 → 후보 전원 포로
  runCase('위신(J=0.4)', DEFS[1], 'prestige', 12, 30, 0);   // J 상한: round(0.4×후보) — 나머지 방면
  runCase('호송 상한', DEFS[2], 'feud', 12, 3, 0);          // 승자 3명 생존 → floor(1.5)=1명만 호송, 나머지 방면
  ok(banBad === 0, `포로 직업 게이트 — 포로화 직후 warrior/hunter 보유 0 (박탈 ${banBad === 0 ? '정상' : banBad + '건 실패'})`);
  _log(`  st: captured=${st.captured} capFreed=${st.capFreed}`);
  _log('══════════════════════════════════════════════════════════════');
  _log(pass ? '✅✅ 시나리오 a 통과 (35% 분할·J 상한·호송 상한·방면·같은 객체·무기 직 박탈)' : '❌ 시나리오 a 실패');
  process.exit(pass ? 0 : 1);
}

// ═══ 공용: 실전투로 포로 픽스처 만들기(b·d·e·f) ═══
function forceBattleWithCaptives() {
  const pk = pickPair(); if (!pk) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B, bd } = pk;
  let declared = quiet(() => { for (const cs of ['feud', 'trade', 'prestige', 'territory']) { if (G.warMobilize(A, B, cs, bd, dayNow())) return true; } return false; });
  if (!declared) { const dc = quiet(() => G.conscript(A, 'full', { forceCount: Math.min(16, A.econ.npcs.length - 3) }));
    if (!dc) { _log('❌ 강제 편성 실패'); process.exit(1); }
    G.getWARS().push({ id: 777, atk: A, def: B, casus: 'feud', force: dc.force, warriors: dc.warriors, wep: 1, arm: 0, composition: dc.composition, arrows: dc.arrows, stones: dc.stones || 0, weapQ: dc.weapQ, phase: 'march', eta: dayNow() + 1, marchDays: Math.max(1, Math.ceil(bd / 1440)), born: dayNow(), _vetRoster: dc.veteranRoster || null }); }
  const w = G.getWARS()[G.getWARS().length - 1];
  w._opPolicy = 'assault'; B._defPolicy = 'respond';
  _log(`  강제 전쟁: ${A.name}→${B.name} 거리 ${bd.toFixed(0)}셀 병력 ${w.force}`);
  return { A, B, w, bd };
}

if (SC === 'b') {
  // ═══ (b) 엔티티 연속 호송 — 포로 agent가 승자 RET 행군과 전장→승자마을 도보(도약 0·순간이동 0) ═══
  const { A, B } = forceBattleWithCaptives();
  setSpeed(600);
  const st = G.warStats();
  let capUnitSeen = 0, escortGroup = null; const tracked = new Map();
  let jumpViol = 0, maxJump = 0, resolvedAt = -1, escortStart = null;
  let dGMprev = G.getGM();
  const capAgents = new Set();
  for (let k = 0; k < 620 && frames < 800; k++) {
    step();
    const dDays = Math.max(1e-9, (G.getGM() - dGMprev) / 1440); dGMprev = G.getGM();
    for (const g of G.RET_GROUPS) { if (g.kind !== 'march') continue;
      for (const u of g.units) { if (!u.captive || !u.agent) continue;
        if (!tracked.has(u.agent)) { capUnitSeen++; escortGroup = g; escortStart = { x: u.agent.px, y: u.agent.py };
          tracked.set(u.agent, { prev: { x: u.agent.px, y: u.agent.py }, g, released: null }); capAgents.add(u.agent); } } }
    if (resolvedAt < 0 && st.captured > 0) resolvedAt = frames;
    for (const [a, t] of tracked) { if (t.released) continue;
      const jmp = Math.hypot(a.px - t.prev.x, a.py - t.prev.y); maxJump = Math.max(maxJump, jmp);
      const cap = t.g.marchSpd * dDays * 4 + 2.5;
      if (jmp > cap) jumpViol++;
      if (!a._muster) { const wv = t.g.def;   // ★도착 해제 순간의 상태를 캡처(이후 탈출·몸값으로 합법 이탈 가능 — 그때 검사해야 정확)
        t.released = { x: a.px, y: a.py,
          inWinner: !!(wv && Array.isArray(wv.agents) && wv.agents.indexOf(a) >= 0),
          pairOK: !!(a._capNpc && wv && wv.econ.npcs.indexOf(a._capNpc) >= 0 && a._capNpc.captive) }; }
      t.prev.x = a.px; t.prev.y = a.py; }
    if (resolvedAt > 0 && G.RET_GROUPS.length === 0 && tracked.size > 0) break;
  }
  ok(st.captured >= 1, `결판 포로 발생 — captured=${st.captured} 방면=${st.capFreed || 0} (전투 ${st.battle}건·사상 ${st.cas})`);
  ok(capUnitSeen >= 1, `승자 귀환 행군에 captive 유닛 동반 — ${capUnitSeen}명 추적`);
  const winnerVil = escortGroup ? escortGroup.def : null;
  let relOK = 0, relBad = 0, inWinner = 0, econPair = 0, relN = 0;
  for (const [a, t] of tracked) { const rel = t.released; if (!rel) continue; relN++;
    const dHome = winnerVil ? Math.hypot(winnerVil.center.cx - rel.x, winnerVil.center.cy - rel.y) : 1e9;
    (dHome <= 90 ? relOK++ : relBad++);
    if (rel.inWinner) inWinner++;
    if (rel.pairOK) econPair++; }
  ok(jumpViol === 0, `도보 연속성 — 도약상한 위반 ${jumpViol} (최대 ${maxJump.toFixed(1)}셀/프레임 — 순간이동 0)`);
  if (escortStart && winnerVil) _log(`  호송 경로: 전장(${escortStart.x.toFixed(0)},${escortStart.y.toFixed(0)}) → ${winnerVil.name} center(${winnerVil.center.cx},${winnerVil.center.cy})`);
  ok(relOK >= 1 && relBad === 0 && relN === tracked.size, `도착 해제 — 승자 마을권(≤90셀) ${relOK}/${relN}`);
  ok(inWinner === relN && relN > 0, `agent 명부 이동 — 포로 agent ${inWinner}/${relN} 승자 vil.agents 소속(같은 객체, 도착 시점)`);
  ok(econPair === relN, `npc-agent 짝 정합 — ${econPair}/${relN} (도착 시점: npc는 승자 econ.npcs·captive 유지)`);
  // 정착 후 (g) 인구 정합
  setSpeed(80000); for (let k = 0; k < 40 && frames < 850; k++) step();
  ok(popMismatch() === 0, `(g) 인구 정합 — 전 마을 econ.npcs == vil.agents (${popRow()})`);
  ok(orphanCount() === 0, `(g) _muster 고아 0`);
  const capsNow = winnerVil ? winnerVil.econ.npcs.filter(n => n.captive).length : 0;
  _log(`  승자 마을 현재 포로 ${capsNow}명(중간 탈출 ${st.escaped || 0}·몸값 ${st.ransomed || 0}) · 일상 편입(state): ${[...capAgents].map(a => a.state).join(',') || '-'}`);
  _log('══════════════════════════════════════════════════════════════');
  _log(pass ? '✅✅ 시나리오 b 통과 (호송 동반·연속 도보·도착 편입·인구 정합·고아 0)' : '❌ 시나리오 b 실패');
  process.exit(pass ? 0 : 1);
}

// ═══ (d·e·f) 실전투 포로 픽스처 후 일일 파이프라인 ═══
{
  const { A, B } = forceBattleWithCaptives();
  setSpeed(600);
  const st = G.warStats();
  for (let k = 0; k < 620 && frames < 700; k++) { step(); if (st.captured > 0 && G.RET_GROUPS.length === 0 && G.LIVE_BATTLES.length === 0) break; }
  setSpeed(80000); for (let k = 0; k < 10; k++) step();
  // 승자(포로 억류) 마을 찾기
  let HV = null; for (const v of VILS) if (v.econ && v.econ.npcs.some(n => n.captive)) { HV = v; break; }
  if (!HV) { _log('❌ 포로 픽스처 실패(captured=' + st.captured + ')'); process.exit(1); }
  const caps = HV.econ.npcs.filter(n => n.captive);
  const homeName = caps[0].captive.home; const HOME = VILS.find(v => v.name === homeName);
  _log(`  픽스처: ${HV.name}에 포로 ${caps.length}명(고향 ${homeName}) · day=${dayNow()}`);
  if (!HOME) { _log('❌ 고향 마을 소실'); process.exit(1); }
  const dist = Math.hypot(HV.center.cx - HOME.center.cx, HV.center.cy - HOME.center.cy);
  const pExp = 0.002 + 0.004 * Math.max(0, 1 - dist / 500);

  if (SC === 'e') {
    // ═══ (e) 동화 — 3년 빨리감기 ═══
    const npc = caps[0]; npc.captive.since = dayNow() - 1081;
    const as0 = st.assimilated || 0;
    quiet(() => G.warCaptiveDaily(dayNow(), st));
    ok(!npc.captive, `since−1081일 → captive 필드 삭제(동화)`);
    ok((st.assimilated || 0) === as0 + 1, `st.assimilated +1 (=${st.assimilated})`);
    let agFlag = 0; for (const a of HV.agents) if (a._capNpc === npc || (a._captive && a._capNpc === npc)) agFlag++;
    ok(agFlag === 0, `agent 포로 표식 해제(잔존 ${agFlag})`);
    ok(HV.econ.npcs.indexOf(npc) >= 0, `동화 후에도 승자 마을 주민(같은 객체 잔류)`);
    _log('══════════════════════════════════════════════════════════════');
    _log(pass ? '✅✅ 시나리오 e 통과 (3년 동화 해제·계수·표식 정리)' : '❌ 시나리오 e 실패');
    process.exit(pass ? 0 : 1);
  }

  if (SC === 'f') {
    // ═══ (f) 몸값 — 고향 여유 식량·저원한 → 30일 주기 롤 → 식량 이전 + 귀향 ═══
    if (HOME._grudge) HOME._grudge.delete(HV.name);
    HOME.econ.storage.food = 120 * Math.max(1, HOME.econ.npcs.length);   // 여유(>60일치) 픽스처
    const r0 = st.ransomed || 0; let fired = -1, foodH0 = 0, foodW0 = 0, mAt = 0;
    let day = dayNow();
    for (let k = 1; k <= 40 && fired < 0; k++) { day += 30; day -= (day % 30);   // 30일 격자 정렬
      foodH0 = HOME.econ.storage.food; foodW0 = (HV.econ.storage.food || 0);
      quiet(() => G.warCaptiveDaily(day, st));
      if ((st.ransomed || 0) > r0) { fired = day; mAt = (st.ransomed || 0) - r0; } }
    ok(fired > 0, `몸값 발생 — day ${fired} · ${mAt}명 (p=0.15/30일 스캔)`);
    if (fired > 0) {
      const paid = mAt * 40;
      ok(near(HOME.econ.storage.food, foodH0 - paid, 1e-6), `고향 식량 −${paid} (${foodH0.toFixed(1)}→${HOME.econ.storage.food.toFixed(1)})`);
      ok(near((HV.econ.storage.food || 0), foodW0 + paid, 1e-6), `승자 식량 +${paid} 원장 일치`);
      // 도보 귀향(agent 있으면 RET rout, 없으면 추상 이송 큐) → 완료까지 진행
      setSpeed(600); let done = false;
      for (let k = 0; k < 200 && frames < 830; k++) { step(); if (!G.RET_GROUPS.some(g => g.isCapWalk)) { done = true; break; } }
      const tq = (G.getWorld()._capTransit || []);
      for (const t of tq.slice()) quiet(() => G.warCaptiveDaily(t.eta, st));   // 추상 이송 큐 즉시 소화(eta 도달 가장)
      const backHome = HOME.econ.npcs.filter(n => n.captive == null && caps.indexOf(n) >= 0).length;
      ok(backHome >= mAt || done, `몸값 포로 귀향 — 고향 복귀 ${backHome}명(같은 객체)·도보/이송 완료 ${done}`);
    }
    _log('══════════════════════════════════════════════════════════════');
    _log(pass ? '✅✅ 시나리오 f 통과 (몸값 원장·귀향)' : '❌ 시나리오 f 실패');
    process.exit(pass ? 0 : 1);
  }

  // ═══ (d) 탈출 — ①자연 롤 발생(어느 경로든) ②짝 있는 포로의 도보 귀향(연속·splice 복귀) ═══
  _log(`  탈출 p 기대치: dist=${dist.toFixed(0)} → p=${(pExp * 100).toFixed(2)}%/일`);
  const es0 = st.escaped || 0; let escNpc = null, escDay = -1;
  let day = dayNow();
  for (let k = 1; k <= 900 && escDay < 0; k++) { day += 1;
    quiet(() => G.warCaptiveDaily(day, st));
    if ((st.escaped || 0) > es0) { escDay = day; escNpc = caps.find(n => n.captive && n.captive.esc === day) || null; } }
  ok(escDay > 0, `탈출 발생(자연 롤) — day ${escDay} (${escDay - dayNow()}일 스캔·p ${(pExp * 100).toFixed(2)}%)`);
  { const tq = (G.getWorld()._capTransit || []);   // ①의 뒤처리(추상 이송이면 eta 소화 — econ 복귀 확인)
    for (const t of tq.slice()) quiet(() => G.warCaptiveDaily(t.eta, st));
    if (escNpc) { ok(HOME.econ.npcs.indexOf(escNpc) >= 0 || G.RET_GROUPS.some(g => g.isCapWalk), `자연 탈출자 처리 개시(도보 or 이송) — ${escNpc.id}`); } }
  // ② 짝(agent 링크) 있는 포로로 도보 경로 실측 — warCaptiveDaily의 탈출 동작(esc 마크+_capStartWalk)을 같은 API로 발화
  let escAgent = null, escNpc2 = null;
  for (const a of HV.agents) { if (a._capNpc && a._capNpc.captive && a._capNpc.captive.esc == null && !a._muster) { escAgent = a; escNpc2 = a._capNpc; break; } }
  if (!escAgent) { _log('  (도보 표적 없음 — 남은 포로 전원 agent 미보유: 표본층 자연 감모. 추상 경로만 검증됨)'); fail('도보 귀향 표적 확보 실패'); }
  else {
    escNpc2.captive.esc = day;
    const walked = quiet(() => G._capStartWalk(HV, HOME, escNpc2, day, '탈출'));
    ok(walked === true, `도보 귀향 개시(_capStartWalk) — ${escNpc2.id} agent 동반`);
    let jumpViol = 0, maxJump = 0;
    setSpeed(600); let prev = { x: escAgent.px, y: escAgent.py }; let dGMprev = G.getGM();
    for (let k = 0; k < 300 && frames < 820; k++) { step();
      const dDays = Math.max(1e-9, (G.getGM() - dGMprev) / 1440); dGMprev = G.getGM();
      const jmp = Math.hypot(escAgent.px - prev.x, escAgent.py - prev.y); maxJump = Math.max(maxJump, jmp);
      if (jmp > 1440 * 1.2 * dDays * 2 + 2.5) jumpViol++;
      prev = { x: escAgent.px, y: escAgent.py };
      if (!G.RET_GROUPS.some(g => g.isCapWalk)) break; }
    ok(jumpViol === 0, `탈출 도보 귀향 연속성 — 도약 위반 ${jumpViol} (최대 ${maxJump.toFixed(1)}셀/프레임 — 순간이동 0)`);
    ok(HOME.econ.npcs.indexOf(escNpc2) >= 0, `econ 고향 복귀 — 같은 npc 객체가 ${homeName} econ.npcs에 존재(===)`);
    ok(!escNpc2.captive, `captive 필드 해제`);
    ok(HOME.agents.indexOf(escAgent) >= 0 && !escAgent._captive, `agent 고향 명부 복귀 + 표식 해제(같은 객체 — 도보로 옴)`);
    const dH = Math.hypot(HOME.center.cx - escAgent.px, HOME.center.cy - escAgent.py);
    ok(dH <= 30, `도착 위치 = 고향 마을권(center ${dH.toFixed(1)}셀)`);
  }
  // (g) 정합 마무리
  setSpeed(80000); for (let k = 0; k < 30 && frames < 850; k++) step();
  ok(popMismatch() === 0, `(g) 인구 정합 — 전 마을 econ.npcs == vil.agents (${popRow()})`);
  ok(orphanCount() === 0, `(g) _muster 고아 0`);
  _log('══════════════════════════════════════════════════════════════');
  _log(pass ? '✅✅ 시나리오 d 통과 (탈출 발생·도보 귀향·econ 복귀·정합)' : '❌ 시나리오 d 실패');
  process.exit(pass ? 0 : 1);
}
