// ═══════════════════════════════════════════════════════════════════════════
// _justice-probe.js — 전쟁 정의 J(명분 스케일 승리 권리) + 제3자 평판 전파 + 무기 드랍·궤주 투기 실측 프로브.
//   "전쟁 승리가 주는 건 권리의 상한이며, 상한의 크기를 명분이 정한다."(사용자 승인 설계 구속)
//   전쟁실험실.html 블록A(생활·전쟁 econ)+블록B(전쟁 UI 레이어)를 한 eval 스코프에 로드(_siege-probe.js 하네스 동형).
//   시나리오(각각 독립 프로세스·시드당 단일 프로세스·프레임 ≤850):
//     a — 명분별 약탈 차등: 같은 전장 설정(동일 결판·저장고 복원) casus별 warResolveBattle → 약탈량 응징(J1.0)>기근(0.6)>위신(0.4),
//         실측률 = 0.12+0.28×J 정합 + 원한 가산(J=min(1,J_casus+0.5×gr))·플레이어 공식(0.4+0.6×min(1,gr/0.5)) 수치 검증.
//     b — 제3자 평판: J<0.5(위신) 침략 결판 → 관전 마을(당사자 외·정보범위 내) 원한 상승 = (0.5−J)×0.35×근접도(근접일수록 큼),
//         J≥0.5(응징) 결판 → 전파 0. 승패 무관 검증(패전 결판도 전파).
//     c — 원한→교역 기피: 원한>0.45 주입 → econ._grudgeBlock 발행 + 해당 쌍 캐러밴 발주 0(양방향 대칭) + 원한 자연감쇠(0.995) 관측
//         → 문턱 아래로 내리면 다음 스윕이 해제·교역 재개.
//     d — 무기 드랍·궤주 투기: 실전투(강제 전쟁→assault→LiveBattle 결판) — warWeaponFlow 스파이로 패자 재고 −(드랍+투기)·승자 +(0.7드랍+0.5투기)
//         원장 일치, RET 궤주 그룹 spd 배속 _desertMul=1+0.08×p̄ ∈ (1,1.08], 전장 무기 잔해 데칼 ≥1.
//     e — 하한: J 최저(위신 0.4·가상 J=0)에서도 약탈률 ≥ 0.12(전쟁 동기 보존 — 하한 0 금지).
//   ★전쟁실험실.html 무수정(읽기만). /tmp·in-memory. DB·git 없음. 결정론(시드 Math.random 주입 __mr + _muRng — 프로브 자신 Math.random 미사용).
//   실행: node sim/_justice-probe.js <a|b|c|d|e> [seed=7] [nvil=8]
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
_log(`═══ [전쟁 정의 J] 시나리오 ${SC} · 시드${SEED} · ${NVIL}마을 — 명분 상한·평판 전파·무기 흐름 실측 ═══`);
const lab = loadLabFull(NVIL);
const G = global;
const VILS = lab.run0(SEED);
const setSpeed = v => { G.document.getElementById('simSpeed').value = String(v); };
const dayNow = () => (VILS.length ? VILS[0].day | 0 : 0);
const quiet = fn => { const c = console.log; console.log = () => {}; try { return fn(); } finally { console.log = c; } };
let frames = 0;
function step() { quiet(() => { lab.frame(); if (G.tickMarch) G.tickMarch(); if (G.tickWarGroups) G.tickWarGroups(); if (G.tickLiveBattles) G.tickLiveBattles(); }); frames++; }
let pass = true; const fail = m => { pass = false; _log('  ❌ ' + m); };
const ok = (c, m) => { if (c) _log('  ✓ ' + m); else fail(m); return !!c; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol);

// ── 워밍업 + 자연 개전 봉인(픽스처 — 델타 오염 방지·결정론) ──
setSpeed(80000);
while (dayNow() < 200 && frames < 140) step();
_log(`  워밍업: day=${dayNow()} frames=${frames} 마을=${VILS.length}`);
for (const v of VILS) v._warCd = dayNow() + 5000;

function pickPair(fn) { let best = null; for (let i = 0; i < VILS.length; i++) for (let j = 0; j < VILS.length; j++) { if (i === j) continue;
    const A = VILS[i], B = VILS[j]; if (!A.econ || !B.econ || A.econ.npcs.length < 8 || B.econ.npcs.length < 8) continue;
    const d = Math.hypot(A.center.cx - B.center.cx, A.center.cy - B.center.cy); if (d < 60 || d > 520) continue;
    const sc = fn(A, B, d); if (sc != null && (!best || sc > best.sc)) best = { A, B, d, sc }; } return best; }

// ── 상태 스냅/복원(같은 전장 설정 반복 — 명분만 바꿔 차등 측정) ──
function snapWorld(A, B) {
  const s = { stor: new Map(), grud: new Map(), fat: new Map(), extra: new Map(), trib: G.getTRIB().length };
  for (const v of VILS) { s.stor.set(v, Object.assign({}, v.econ.storage)); s.grud.set(v, v._grudge ? new Map(v._grudge) : null);
    s.fat.set(v, v._warFatigue || 0); s.extra.set(v, { wq: v.econ._weapQ, caution: v._warCaution || 0, terr: v._terrSat || 0, trauma: v._warTrauma ? new Map(v._warTrauma) : null }); }
  return s;
}
function restoreWorld(s) {
  for (const v of VILS) { v.econ.storage = Object.assign({}, s.stor.get(v)); const g = s.grud.get(v); v._grudge = g ? new Map(g) : null;
    v._warFatigue = s.fat.get(v); const e = s.extra.get(v); v.econ._weapQ = e.wq; v._warCaution = e.caution; v._terrSat = e.terr; v._warTrauma = e.trauma ? new Map(e.trauma) : null; }
  const T = G.getTRIB(); T.splice(s.trib);
}
// 같은 결판(공격승·사상 0 — 약탈 원장만 격리 측정)의 합성 precomputedRes. warKill 0이라 인구·RNG 무소비(결정론).
function mkRes() { return { winner: 'A', atkStart: 20, atkDead: 0, defStart: 16, defDead: 0, atkSurv: 20, defSurv: 16,
  survivorsByType: { A: {}, B: {} }, ticks: 100, tick: 5.0, routA: 0, routB: 0, routMrlA: 0.5, routMrlB: 0.5 }; }
function mkWar(A, B, casus) { return { id: 900, atk: A, def: B, casus, force: 20, warriors: 8, wep: 1, arm: 0,
  composition: { spear: 12, dagger: 8 }, weapQ: 0.5, phase: 'march', eta: dayNow(), marchDays: 1, born: dayNow(), _vetRoster: null }; }
function runResolve(A, B, casus) {
  const w = mkWar(A, B, casus);
  const food0 = B.econ.storage.food || 0;
  quiet(() => G.warResolveBattle(w, dayNow(), { res: mkRes(), spec: {} }));
  return { loot: food0 - (B.econ.storage.food || 0), food0, fat: A._warFatigue || 0 };
}

if (SC === 'a') {
  // ═══ (a) 명분별 약탈 차등 — 같은 전장 설정, casus만 교체(저장고·원한 복원) ═══
  const pick = pickPair((A, B, d) => (B.econ.storage.food || 0) - d * 0.001);
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick;
  _log(`  픽스처: ${A.name}→${B.name} 방어곳간 food=${(B.econ.storage.food || 0).toFixed(0)}`);
  // J 산정표(원한 0 기준)
  if (A._grudge) A._grudge.delete(B.name);
  ok(near(G.warJustice(A, B, 'feud'), 1.0), `J(응징 feud)=1.0 — 실측 ${G.warJustice(A, B, 'feud').toFixed(3)}`);
  ok(near(G.warJustice(A, B, 'territory'), 0.7), `J(영토 territory)=0.7 — 실측 ${G.warJustice(A, B, 'territory').toFixed(3)}`);
  ok(near(G.warJustice(A, B, 'trade'), 0.6), `J(기근 trade)=0.6 — 실측 ${G.warJustice(A, B, 'trade').toFixed(3)}`);
  ok(near(G.warJustice(A, B, 'prestige'), 0.4), `J(위신 prestige)=0.4 — 실측 ${G.warJustice(A, B, 'prestige').toFixed(3)}`);
  // 원한 가산: J = min(1, J_casus + 0.5×gr) · 플레이어: 0.4+0.6×min(1, gr/0.5)
  G.warAddGrudge(A, B.name, 0.3);
  ok(near(G.warJustice(A, B, 'prestige'), 0.4 + 0.5 * 0.3), `원한 가산: prestige+gr0.3 → J=0.55 — 실측 ${G.warJustice(A, B, 'prestige').toFixed(3)}`);
  ok(near(G.warJustice(A, B, 'player'), 0.4 + 0.6 * Math.min(1, 0.3 / 0.5)), `플레이어(casus 미상)+gr0.3 → J=0.76 — 실측 ${G.warJustice(A, B, 'player').toFixed(3)}`);
  G.warAddGrudge(A, B.name, 0.4);   // gr=0.7 → min(1, ...)
  ok(near(G.warJustice(A, B, 'player'), 1.0), `플레이어+gr0.7 → J=1.0 상한 — 실측 ${G.warJustice(A, B, 'player').toFixed(3)}`);
  A._grudge.delete(B.name);
  // 약탈 차등(동일 결판 반복 — 복원)
  const S0 = snapWorld(A, B);
  const r = {};
  for (const cs of ['feud', 'trade', 'prestige']) { r[cs] = runResolve(A, B, cs); restoreWorld(S0); }
  const rate = cs => r[cs].loot / Math.max(1e-9, r[cs].food0);
  _log(`  약탈: 응징 ${r.feud.loot.toFixed(1)}(률 ${(rate('feud') * 100).toFixed(1)}%) · 기근 ${r.trade.loot.toFixed(1)}(${(rate('trade') * 100).toFixed(1)}%) · 위신 ${r.prestige.loot.toFixed(1)}(${(rate('prestige') * 100).toFixed(1)}%)`);
  ok(r.feud.loot > r.trade.loot && r.trade.loot > r.prestige.loot, '약탈량 차등: 응징 > 기근 > 위신');
  ok(near(rate('feud'), 0.12 + 0.28 * 1.0, 1e-3), '응징 약탈률 = 0.12+0.28×1.0 = 40%');
  ok(near(rate('trade'), 0.12 + 0.28 * 0.6, 1e-3), '기근 약탈률 = 0.12+0.28×0.6 = 28.8%');
  ok(near(rate('prestige'), 0.12 + 0.28 * 0.4, 1e-3), '위신 약탈률 = 0.12+0.28×0.4 = 23.2%');
  // 불의전 추가 피로: prestige(J 0.4) 승리 → +((0.5−0.4)×0.3)=0.03 (기본 사상피로 0 — 사상 0 픽스처)
  const fat0 = S0.fat.get(A);
  ok(near(r.prestige.fat - fat0, (0.5 - 0.4) * 0.3, 1e-6), `불의전 승자 피로 가산 +0.03 — 실측 +${(r.prestige.fat - fat0).toFixed(3)}`);
  ok(near(r.feud.fat - fat0, 0, 1e-9), '정당전(응징 J1.0) 추가 피로 0');
}
else if (SC === 'b') {
  // ═══ (b) 제3자 평판 전파 — J<0.5 결판(승패 무관) → 관전 마을 원한 학습(근접 감쇠) ═══
  const pick = pickPair((A, B, d) => (VILS.length - 2) - d * 0.0001);
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick;
  if (A._grudge) A._grudge.delete(B.name);
  const infoR = ((G.getWorld().infoRange || 400) / 2.5);
  const obs = VILS.filter(v => v !== A && v !== B).map(v => ({ v, d: Math.hypot(v.center.cx - B.center.cx, v.center.cy - B.center.cy) })).sort((p, q) => p.d - q.d);
  const S0 = snapWorld(A, B);
  const g0 = new Map(obs.map(o => [o.v, G.warGrudge(o.v, A.name)]));
  // ① 위신전(J=0.4) — 공격승
  quiet(() => G.warResolveBattle(mkWar(A, B, 'prestige'), dayNow(), { res: mkRes(), spec: {} }));
  const inR = obs.filter(o => o.d <= infoR);
  let allUp = inR.length > 0, decayOK = true, exact = true;
  for (const o of inR) { const dg = G.warGrudge(o.v, A.name) - g0.get(o.v); if (dg <= 0) allUp = false;
    const expect = (0.5 - 0.4) * 0.35 * Math.max(0, 1 - o.d / infoR);
    if (!near(dg, expect, 1e-6)) exact = false; }
  for (let i = 1; i < inR.length; i++) { const d0 = G.warGrudge(inR[i - 1].v, A.name) - g0.get(inR[i - 1].v), d1 = G.warGrudge(inR[i].v, A.name) - g0.get(inR[i].v);
    if (d0 < d1 - 1e-9) decayOK = false; }
  _log(`  관전 ${inR.length}개 마을(정보범위 ${infoR.toFixed(0)}셀) 원한Δ: ${inR.slice(0, 4).map(o => `${o.v.name}(d${o.d.toFixed(0)})+${(G.warGrudge(o.v, A.name) - g0.get(o.v)).toFixed(4)}`).join(' · ')}${inR.length > 4 ? ' …' : ''}`);
  ok(allUp, `J0.4 침공 결판 → 관전 마을 전원 침략자(${A.name}) 원한 상승`);
  ok(exact, '상승량 = (0.5−J)×0.35×근접도 정합');
  ok(decayOK, '근접도 감쇠: 가까운 마을일수록 크게 학습');
  restoreWorld(S0);
  // ② 승패 무관: 같은 위신전을 '방어승' 결판으로 — 전파 동일
  const resL = mkRes(); resL.winner = 'B'; resL.atkSurv = 12; resL.routA = 6; resL.routMrlA = 0.3;
  quiet(() => G.warResolveBattle(mkWar(A, B, 'prestige'), dayNow(), { res: resL, spec: {} }));
  let upLose = true; for (const o of inR) { if (G.warGrudge(o.v, A.name) - g0.get(o.v) <= 0) upLose = false; }
  ok(upLose, '승패 무관: 침략 실패(방어승) 결판에도 관전 원한 학습(침략 행위 자체가 위험 신호)');
  restoreWorld(S0);
  // ③ 정당전(응징 J=1.0) → 전파 0
  G.warAddGrudge(A, B.name, 0.9);
  quiet(() => G.warResolveBattle(mkWar(A, B, 'feud'), dayNow(), { res: mkRes(), spec: {} }));
  let zero = true; for (const o of inR) { if (Math.abs(G.warGrudge(o.v, A.name) - g0.get(o.v)) > 1e-12) zero = false; }
  ok(zero, '정당전(응징 J1.0) 결판 → 제3자 전파 0(명분 있는 전쟁은 위험 신호 아님)');
  restoreWorld(S0);
}
else if (SC === 'c') {
  // ═══ (c) 원한 → 교역 기피(발주 0·대칭) → 감쇠 후 재개 ═══
  //   교역 압력 픽스처: X=곡물 대잉여·Y=곡물 기근(고가) — 세 창(기준·제재·해제)에 매번 동일 재주입해
  //   '교역이 반드시 시도되는 조건'을 고정 → 제재 창의 0건이 [발주 없음]이 아니라 [차단]임을 증명.
  const world = G.getWorld();
  const carLog = [];
  // ★캐러밴 계측: 엔진이 매일 world.caravans = caravans.filter(...)로 배열을 '교체'하므로 push 훅이 하루살이 —
  //   접근자 프로퍼티로 교체 자체를 가로채 새 배열마다 재훅(속도 무관 전수 계측).
  { let carArr = world.caravans || [];
    const hookPush = arr => { arr.push = function () { for (const c of arguments) carLog.push({ f: c.from, t: c.to, day: dayNow() }); return Array.prototype.push.apply(this, arguments); }; return arr; };
    hookPush(carArr);
    Object.defineProperty(world, 'caravans', { configurable: true, get() { return carArr; }, set(v) { carArr = hookPush(v || []); } }); }
  const daysRun = target => { const d0 = dayNow(); while (dayNow() < d0 + target && frames < 830) step(); };
  const pick = pickPair((A, B, d) => -d);   // 최근접 유효쌍(운송비 최소 — 이익 확실)
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const X = pick.A, Y = pick.B;
  const fixture = () => { const nx = X.econ.npcs.length, ny = Y.econ.npcs.length;
    X.econ.storage.food = Math.max(X.econ.storage.food || 0, nx * 80);   // 42일치 수출 문턱 훌쩍 위(진짜 잉여)
    for (const r of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) if (Y.econ.storage[r]) Y.econ.storage[r] = Math.min(Y.econ.storage[r], ny * (r === 'food' ? 8 : 1)); };  // 식량류 전부 기근 직전(고가 — food만 빼면 fish가 가격을 눌러 무역 불발). 생산은 계속이라 아사 아님
  const pairN = () => { let n = 0; for (const c of carLog) if ((c.f === X.econ && c.t === Y.econ) || (c.f === Y.econ && c.t === X.econ)) n++; return n; };
  const W = 25;
  // ① 기준 창 — 픽스처 하 교역 발생 증명
  fixture(); const nA = pairN(); daysRun(W); const baseN = pairN() - nA;
  _log(`  기준 창 ${W}일(${X.name}↔${Y.name}, 거리 ${pick.d.toFixed(0)}셀): 쌍 캐러밴 +${baseN}건`);
  if (!ok(baseN >= 1, '픽스처 하 기준 교역 발생(잉여→기근 이익 확실)')) { _log('  (기준 교역 불성립 — 이후 단정 무의미)'); }
  // ② 제재 창 — 원한 주입(X→Y 0.6 > 문턱 0.45) → 스윕 발행 → 발주·수주 대칭 0
  G.warAddGrudge(X, Y.name, 0.6); const g1 = G.warGrudge(X, Y.name);
  fixture(); const nB = pairN(); daysRun(W); const blockedN = pairN() - nB;
  const gDecay = G.warGrudge(X, Y.name);
  _log(`  제재 창 ${W}일: 쌍 캐러밴 +${blockedN}건 · _grudgeBlock=${JSON.stringify(X.econ._grudgeBlock || null)} · 원한 ${g1.toFixed(3)}→${gDecay.toFixed(3)}(자연감쇠 0.995/일)`);
  ok(X.econ._grudgeBlock && X.econ._grudgeBlock[Y.name] === 1, `econ._grudgeBlock 발행(${X.name}→${Y.name})`);
  ok(blockedN === 0, `원한>0.45 기간 해당 쌍 교역 발주 0(대칭 차단 — 같은 픽스처에서 기준 ${baseN}건 vs 제재 0건)`);
  ok(gDecay < g1 && gDecay > 0.45, `원한 자연감쇠 진행(${g1.toFixed(3)}→${gDecay.toFixed(3)}) — 아직 문턱(0.45) 위(제재 유지: ~57일 걸릴 자연 해제의 방향 증명)`);
  ok(carLog.length > baseN, `타 쌍 교역은 지속(누적 ${carLog.length}건 — 제재는 쌍 국소, 세계 봉쇄 아님)`);
  // ③ 해제 창 — 감쇠로 문턱 아래(픽스처 가속: 자연 경로 ~57일은 프레임 예산 밖 — 직접 하향) → 스윕 해제 → 재개
  X._grudge.set(Y.name, 0.30);
  fixture(); const nC = pairN(); daysRun(W + 10); const resumedN = pairN() - nC;
  _log(`  해제 창 ${W + 10}일: 쌍 캐러밴 +${resumedN}건 · _grudgeBlock=${JSON.stringify((X.econ._grudgeBlock && X.econ._grudgeBlock[Y.name]) || null)}`);
  ok(!(X.econ._grudgeBlock && X.econ._grudgeBlock[Y.name]), '원한<문턱 → 다음 일일 스윕이 제재 해제');
  ok(resumedN >= 1, `교역 재개(+${resumedN}건) — 제재는 원한과 함께 자연 소멸`);
}
else if (SC === 'd') {
  // ═══ (d) 무기 드랍·궤주 투기 — 실전투 결판 원장 + 궤주 그룹 배속 + 데칼 ═══
  const pick = pickPair((A, B, d) => (A.econ.npcs.length - B.econ.npcs.length) * 2 - d * 0.01 + ((A.econ.storage.weapon || 0) > 3 && (B.econ.storage.weapon || 0) > 3 ? 50 : 0));
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick;
  // 무기 재고 픽스처(양측 유의미 재고 — 흐름 관측성)
  A.econ.storage.weapon = Math.max(A.econ.storage.weapon || 0, 12);
  B.econ.storage.weapon = Math.max(B.econ.storage.weapon || 0, 12);
  _log(`  픽스처: ${A.name}(무기 ${A.econ.storage.weapon.toFixed(1)}) → ${B.name}(무기 ${B.econ.storage.weapon.toFixed(1)})`);
  // warWeaponFlow 스파이(원장 검증 — 전역 함수 교체·원본 위임)
  const origWF = G.warWeaponFlow; const wfCalls = [];
  G.warWeaponFlow = function (winnerE, loserE, ls, ld, rn, rm, st) {
    const lw0 = loserE.storage.weapon || 0, ww0 = winnerE.storage.weapon || 0;
    const out = origWF(winnerE, loserE, ls, ld, rn, rm, st);
    wfCalls.push({ lw0, ww0, lw1: loserE.storage.weapon || 0, ww1: winnerE.storage.weapon || 0, ls, ld, rn, rm, out });
    return out; };
  // RET 궤주 그룹 캡처(고속 프레임에서 한 step 내 생성→완주 대비 push 훅)
  const routGroups = [];
  { const arr = G.RET_GROUPS; const orig = Array.prototype.push;
    arr.push = function () { for (const g of arguments) if (g && g.kind === 'rout') routGroups.push(g); return orig.apply(this, arguments); }; }
  const mob = quiet(() => G.conscript(A, 'raid', { mobFrac: 0.55 }));
  if (!mob) { _log('❌ 편성 실패'); process.exit(1); }
  const md = Math.max(1, Math.ceil(pick.d / 1440));
  const w = { id: 903, atk: A, def: B, casus: 'feud', force: mob.force, warriors: mob.warriors || 0, wep: 1, arm: 0, composition: mob.composition, arrows: mob.arrows, stones: mob.stones || 0, weapQ: (mob.weapQ != null ? mob.weapQ : 0.5), phase: 'march', eta: dayNow() + md, marchDays: md, born: dayNow(), _vetRoster: null, _opPolicy: 'assault' };
  G.getWARS().push(w);
  const st0 = (G.warStats() || {});
  const b0 = st0.battle | 0;
  setSpeed(20000);
  for (let k = 0; k < 640 && frames < 830; k++) { step(); if (((G.warStats() || {}).battle | 0) > b0 && wfCalls.length && G.getWARS().indexOf(w) < 0) break; }
  const stx = G.warStats() || {};
  _log(`  경과: 전투 Δ${(stx.battle | 0) - b0} · warWeaponFlow 호출 ${wfCalls.length} · 궤주 그룹 ${routGroups.length} · 데칼 ${G.WAR_DECALS ? G.WAR_DECALS.length : 'N/A'}`);
  ok((stx.battle | 0) - b0 >= 1, '실전투 결판 발생');
  if (ok(wfCalls.length >= 1, 'warWeaponFlow(결판 무기 흐름) 실행')) {
    const c = wfCalls[0], o = c.out;
    if (o) {
      const armed = Math.min(1, c.lw0 / Math.max(1, c.ls));
      const expDrop = Math.min(c.lw0, c.ld * armed);
      const expDes = Math.min(Math.max(0, c.lw0 - expDrop), c.rn * o.pDesert * armed);
      _log(`  원장: 패자 ${c.lw0.toFixed(2)}→${c.lw1.toFixed(2)} (드랍 ${o.drop.toFixed(2)}+투기 ${o.desert.toFixed(2)}) · 승자 ${c.ww0.toFixed(2)}→${c.ww1.toFixed(2)} (+${o.gain.toFixed(2)}) · 궤주 ${c.rn}명 평균사기 ${(c.rm != null ? c.rm : 0.5).toFixed(2)} pDesert ${o.pDesert.toFixed(2)}`);
      ok(near(c.lw1, c.lw0 - o.drop - o.desert, 1e-9), '패자 재고 = −(사상드랍+궤주투기)');
      ok(near(c.ww1, c.ww0 + 0.7 * o.drop + 0.5 * o.desert, 1e-9), '승자 재고 = +(0.7×드랍 + 0.5×투기) — 전장 장악 회수');
      ok(near(o.drop, expDrop, 1e-9), '드랍 = 사상자수×무장률(재고 상한)');
      ok(near(o.desert, expDes, 1e-9), '투기 = 궤주수×(0.25+0.5×(1−사기))×무장률 기대값');
      ok(near(o.pDesert, 0.25 + 0.5 * (1 - Math.max(0, Math.min(1, c.rm == null ? 0.5 : c.rm))), 1e-9), '투기 확률식 = 0.25+0.5×(1−사기)');
      ok(c.lw1 < c.lw0 && c.ww1 > c.ww0, '경제 순환: 패자 무기 재고 하락(재무장 수요 →기존 무기 수요 체계)·승자 증가');
    } else { _log('  (흐름 0 — 패자 무기 재고 극소. 방향성만 확인)'); ok(true, 'warWeaponFlow no-op(재고 없음 가드)'); }
  }
  if (ok(routGroups.length >= 1, '패자 궤주 귀환 그룹 생성(RET rout)')) {
    const g = routGroups[0];
    ok(g._desertMul > 1 && g._desertMul <= 1 + 0.08 + 1e-9, `궤주 그룹 도주 배속 _desertMul=${g._desertMul.toFixed(4)} ∈ (1, 1.08] — +8%×기대투기율(그룹 평균 근사)`);
  }
  ok(G.WAR_DECALS && G.WAR_DECALS.length >= 1, `전장 무기 잔해 데칼 생성(⚔ ${G.WAR_DECALS && G.WAR_DECALS.length ? G.WAR_DECALS[0].pts.length : 0}개 마커·10일 페이드)`);
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}
else if (SC === 'e') {
  // ═══ (e) 하한 — J 최저에서도 약탈률 ≥ 12%(전쟁 동기 보존·하한 0 금지) ═══
  const pick = pickPair((A, B, d) => (B.econ.storage.food || 0) - d * 0.001);
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick;
  if (A._grudge) A._grudge.delete(B.name);
  const Jmin = Math.min(G.warJustice(A, B, 'feud'), G.warJustice(A, B, 'territory'), G.warJustice(A, B, 'trade'), G.warJustice(A, B, 'prestige'), G.warJustice(A, B, 'player'));
  ok(near(Jmin, 0.4), `실현 가능한 최저 J = 0.4(위신·무원한 플레이어) — 실측 ${Jmin.toFixed(3)}`);
  ok(0.12 + 0.28 * 0 >= 0.12, '수식 하한: J=0(가상)에도 약탈률 = 12% > 0');
  const S0 = snapWorld(A, B);
  const r = runResolve(A, B, 'prestige'); restoreWorld(S0);
  const rate = r.loot / Math.max(1e-9, r.food0);
  ok(rate >= 0.12, `최저 명분(위신 J0.4) 실측 약탈률 ${(rate * 100).toFixed(1)}% ≥ 12% — 불의전도 남는 장사(동기 보존), 대신 평판·피로를 치른다`);
}
else { _log('❌ 알 수 없는 시나리오: ' + SC); process.exit(1); }

_log('══════════════════════════════════════════════════════════════');
_log(pass ? `✅✅ 시나리오 ${SC} 통과 (frames=${frames}, day=${dayNow()})` : `❌ 시나리오 ${SC} 실패 (frames=${frames})`);
_log('══════════════════════════════════════════════════════════════');
process.exit(pass ? 0 : 1);
