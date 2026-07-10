// ═══════════════════════════════════════════════════════════════════════════
// _scramble-probe.js — ★[유령 박멸] 무소집(버티기) 마을 긴급 소집(scramble) 실측 프로브.
//   제1원칙 '아무것도 스폰되지 않는다 — 엔티티 연속성': 개전 시 방어 유닛은 전원 실주민(agent 참조).
//   하네스 = _siege-probe.js 동형(rAF 단일 슬롯 · window.tick* 직접 구동 · 시드당 단일 프로세스 · 프레임 ≤850).
//   시나리오:
//     g — 유령 0 종합(NPC 밤 기습): 버티기(hold) 마을에 assault → 긴급 소집 발동 실측 —
//         ①취침 주민 기상(action 취침→기상) ②침대→회관 앞 도보 집결(px/py 연속·도약 0) ③개전 시 spec.B 전 유닛 agent 보유
//         ④비전투원 전원 대피(취침 방치·야외 노동 0) ⑤종전 후 대피 해제·생존자 도보 귀환 ⑥_muster 고아 0.
//     s — 기습(공격이 정렬보다 빠름): 결단 지점을 마을 코앞(66셀) 픽스처 → 정렬 미완(슬롯 도달 비율 낮음) 그대로 개전. 사상 기록.
//     r — 여유(정상 결정 링 110셀에서 돌격): 긴급 소집이 먼저 → 정렬 완료 우세 개전. 사상 기록(s와 크로스 비교 — 정렬 완료가 유리해야 정상).
//     P — 플레이어 경로 스모크: 선포→camp→[돌격] → 개전 시 spec.B 전 유닛 agent 보유 + 결판·귀환·고아 0.
//   ★전쟁실험실.html 무수정(읽기만). 결정론: __mr 시드 주입 + 엔진 _muRng. 프로브 자신 Math.random 미사용.
//   실행: node sim/_scramble-probe.js <g|s|r|P> [seed=7] [nvil=8]
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
    "\nglobal.setGM=function(v){lifeGM=v;};" +   // ★lifeGM은 eval 렉시컬(let) — 워프는 스코프 안에서만 가능
    "\nglobal.getTRIB=function(){return TRIBUTES;};" +
    "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
  G.__log = _log; console.log = _log;
  return { frame: G.frame, run0: G.run0, BattleCore };
}

const SC = String(process.argv[2] || 'g');
const SEED = +(process.argv[3] || 7), NVIL = +(process.argv[4] || 8) || 8;
_log(`═══ [유령 박멸] 긴급 소집 시나리오 ${SC} · 시드${SEED} · ${NVIL}마을 ═══`);
const lab = loadLabFull(NVIL);
const G = global;
const VILS = lab.run0(SEED);
const setSpeed = v => { G.document.getElementById('simSpeed').value = String(v); };
const dayNow = () => (VILS.length ? VILS[0].day | 0 : 0);
const quiet = fn => { const c = console.log; console.log = () => {}; try { return fn(); } finally { console.log = c; } };
let frames = 0;
function step() { quiet(() => { lab.frame(); if (G.tickMarch) G.tickMarch(); if (G.tickWarGroups) G.tickWarGroups(); if (G.tickLiveBattles) G.tickLiveBattles(); }); frames++; }
const fdOf = v => (v && v.econ) ? G.warFE(v.econ) / Math.max(1, v.econ.npcs.length) : 0;
const orphans = () => { const seen = new Set(); const add = L => { if (L) for (const a of L) if (a) seen.add(a); };
  for (const w of G.getWARS()) { if (w._mg) add(w._mg.drafted); if (w._dg) add(w._dg.drafted); }
  for (const lb of G.LIVE_BATTLES) { add(lb.atkAgents); add(lb.defAgents); }
  if (G.PW) { if (G.PW.march) add(G.PW.march.drafted); if (G.PW._dg) add(G.PW._dg.drafted); }
  for (const rg of G.RET_GROUPS) add(rg.drafted);
  let n = 0; for (const vil of VILS) if (Array.isArray(vil.agents)) for (const a of vil.agents) if (a && a._muster && !seen.has(a)) n++; return n; };
let retMade = 0;
function hookRet() { const arr = G.RET_GROUPS; const orig = Array.prototype.push;
  arr.push = function () { retMade += arguments.length; return orig.apply(this, arguments); }; }
let pass = true; const fail = m => { pass = false; _log('  ❌ ' + m); };
const ok = (c, m) => { if (c) _log('  ✓ ' + m); else fail(m); return !!c; };

// ── 공통 픽스처: 워밍업 + 자연 개전 봉인 ──
setSpeed(80000);
while (dayNow() < 200 && frames < 140) step();
_log(`  워밍업: day=${dayNow()} frames=${frames} 마을=${VILS.length}`);
for (const v of VILS) v._warCd = dayNow() + 5000;

function forceWar(A, B, mobFrac, wid) {
  const mob = quiet(() => G.conscript(A, 'raid', { mobFrac }));
  if (!mob) return null;
  const d = Math.hypot(A.center.cx - B.center.cx, A.center.cy - B.center.cy);
  const md = Math.max(1, Math.ceil(d / 1440));
  const w = { id: wid, atk: A, def: B, casus: 'feud', force: mob.force, warriors: mob.warriors || 0, wep: 1, arm: 0, composition: mob.composition, arrows: mob.arrows, stones: mob.stones || 0, weapQ: (mob.weapQ != null ? mob.weapQ : 0.5), phase: 'march', eta: dayNow() + md, marchDays: md, born: dayNow(), _vetRoster: null };
  G.getWARS().push(w); return w; }
function pickPair(fn) { let best = null; for (let i = 0; i < VILS.length; i++) for (let j = 0; j < VILS.length; j++) { if (i === j) continue;
    const A = VILS[i], B = VILS[j]; if (!A.econ || !B.econ || A.econ.npcs.length < 8 || B.econ.npcs.length < 8) continue;
    const d = Math.hypot(A.center.cx - B.center.cx, A.center.cy - B.center.cy); if (d < 60 || d > 520) continue;
    const sc = fn(A, B, d); if (sc != null && (!best || sc > best.sc)) best = { A, B, d, sc }; } return best; }
// 시간 워프(정지 상태 전용 — 주둔·포진 중): 같은 날 hh시로. 지나갔으면 다음 날. ★lifeGM은 eval 렉시컬 → setGM 경유.
function warpToHour(h) { const gm = G.getGM(); const day = Math.floor(gm / 1440); let t = day * 1440 + h * 60; if (t <= gm) t += 1440; G.setGM(t); }
// 야간 자택 정규화(픽스처): 빨리감기 잔존 state/px를 '집·취침'으로 — 긴급 소집의 전제(밤: 전원 침대).
function tuckIn(B) { for (const a of B.agents) { if (!a || a._muster) continue; a.state = 'home'; a.action = ''; a.path = null; a.rest = 0; a._half = 0; if (a.home) { a.px = a.home.cx; a.py = a.home.cy; } } }
// 물·바위 체크(픽스처 이동용 — _siege-probe e 동형)
const water = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 1 || yi < 1 || xi >= 1599 || yi >= 1599) return true; const i = G.idx(xi, yi); return (G.TR.water[i] === 1 && G.TR.bridge[i] !== 1) || G.TR.rock[i] === 1; };

// ── 시나리오 공통 골격(NPC): hold 마을에 siege로 접근·주둔 → (픽스처) → assault 결단 → 긴급 소집 → 개전 관측 ──
//   반환: 관측치 묶음. fixtureClose=true면 결단 지점을 마을 66셀 앞으로(기습), false면 자연 결정 링(여유).
function runScrambleNPC(fixtureClose, obsDetail) {
  const pick = pickPair((A, B2, d) => { if (fdOf(B2) < 12) return null; if (!Array.isArray(B2.agents) || B2.agents.length < 12) return null;
    return A.econ.npcs.length + fdOf(A) * 0.05 - d * 0.001; });
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick;
  const w = forceWar(A, B, 0.5, 901); if (!w) { _log('❌ 편성 실패'); process.exit(1); }
  w._opPolicy = 'siege'; B._defPolicy = 'hold';   // 공격은 일단 눌러앉고(결단 통제), 방어는 버티기(무소집 — 결함 재현 전제)
  _log(`  선포: ${A.name}(${A.econ.npcs.length}명)→${B.name}(${B.econ.npcs.length}명·화면주민 ${B.agents.length}) 거리${pick.d.toFixed(0)} force=${w.force} 방어곳간=${fdOf(B).toFixed(1)}일 소집반경=${G._warScramR(B).toFixed(0)}셀`);
  setSpeed(2000);
  let guard = 0; let dgPreAssault = false;
  while (w.op !== 'siege' && guard++ < 300 && frames < 420) { step(); if (w._dg) dgPreAssault = true; }
  if (w.op !== 'siege') { _log(`❌ 포위 미진입(op=${w.op})`); process.exit(1); }
  ok(!dgPreAssault && !w._dg, '버티기 접근·주둔 중 방어 무소집(_dg 없음 — 사전 소집 억제 보존)');
  // ── 픽스처: (기습이면) 결단 지점을 마을 66셀 앞으로 · 밤 세팅(전원 침대) ──
  const g = w._mg, C = B.center;
  if (fixtureClose) { const dx = g.cmd.x - C.cx, dy = g.cmd.y - C.cy, dd = Math.hypot(dx, dy) || 1;
    let px = C.cx + dx / dd * 66, py = C.cy + dy / dd * 66;
    for (let r = 0; r < 14 && water(px, py); r++) { px += dx / dd * 2; py += dy / dd * 2; }
    g.holdPt = { x: px, y: py }; g.cmd.x = px; g.cmd.y = py; }
  setSpeed(240);   // 관찰 속도(라벨·도보 실측)
  warpToHour(22.6); step();   // 22:36 — 밤(취침대). 주둔 중이라 워프 안전(대형 정지·holdPt)
  tuckIn(B); for (let k = 0; k < 8; k++) step();   // 취침 라벨 안착
  const asleep0 = B.agents.filter(a => !a._muster && a.action === '취침').length;
  ok(asleep0 >= B.agents.length * 0.7, `밤 전제: 주민 ${asleep0}/${B.agents.length} 취침 중`);
  // ── assault 결단(자정 일일 결단) → 긴급 소집 → 개전 — 프레임 단위 관측 ──
  w._opPolicy = 'assault';
  hookRet();
  const st0 = (() => { const s = G.warStats() || {}; return { battle: s.battle | 0, cas: s.cas | 0 }; })();
  let scramAt = -1, scramDrafted = null, preActs = null, wakeDraftees = 0;
  let jumpMax = 0, jumps = 0, prevPos = null, openAt = -1, lbRef = null, handoffMax = 0;
  let evacOnAtOpen = false, sleepDuringForm = -1, sameFrame = false, lastPre = null;
  const spdCell = () => 240 * 0.016 / 1440;   // dDays/frame — 임계 도보 스텝 산출용
  const jumpThr = () => 1944 * spdCell() * 1.6 + 1.0;   // MUSTER_SPD(1944)×dDays×여유 + 슬롯 스냅 슬랙
  for (let k = 0; k < 260 && frames < 700 && openAt < 0; k++) {
    const pre = new Map(); for (const a of B.agents) pre.set(a, a.action); lastPre = pre;
    step();
    if (scramAt < 0 && w._dg && w._dg._scram) { scramAt = frames; scramDrafted = w._dg.drafted.slice();
      preActs = scramDrafted.map(a => pre.get(a));
      prevPos = new Map(); for (const a of scramDrafted) prevPos.set(a, [a.px, a.py]);
      if (typeof obsDetail === 'function') obsDetail('scram', w); }
    else if (scramAt > 0 && w._dg && prevPos) {   // 집결 도보 연속성(도약 0) + 기상 라벨
      let awake = 0; for (const a of scramDrafted) { if (a.action === '기상' || a.action === '수비') awake++;
        const p = prevPos.get(a); if (p) { const d2 = Math.hypot(a.px - p[0], a.py - p[1]); if (d2 > jumpThr()) { jumps++; jumpMax = Math.max(jumpMax, d2); } }
        prevPos.set(a, [a.px, a.py]); }
      wakeDraftees = Math.max(wakeDraftees, awake);
      const zzz = scramDrafted.filter(a => a.action === '취침').length; if (sleepDuringForm < 0 || zzz > sleepDuringForm) sleepDuringForm = zzz;
    }
    if (G.LIVE_BATTLES.length > 0 && openAt < 0) { openAt = frames; lbRef = G.LIVE_BATTLES[G.LIVE_BATTLES.length - 1];
      evacOnAtOpen = (B._evac === true);
      if (scramAt < 0) { sameFrame = true; scramAt = frames;   // ★총기습: 소집→개전이 한 프레임 안(형성 창 0 — 침대에서 그대로 개전)
        scramDrafted = lbRef.defAgents.slice(); preActs = scramDrafted.map(a => pre.get(a)); }
      if (prevPos) for (const a of (scramDrafted || [])) { const p = prevPos.get(a); if (p) handoffMax = Math.max(handoffMax, Math.hypot(a.px - p[0], a.py - p[1])); } }
  }
  ok(scramAt > 0, `긴급 소집 발동 (frame ${scramAt}${sameFrame ? ' — 개전과 동일 프레임(총기습·형성 창 0)' : ''}) — 징발 ${scramDrafted ? scramDrafted.length : 0}명`);
  if (preActs) { const zz = preActs.filter(x => x === '취침').length;
    ok(zz >= scramDrafted.length * 0.8, `징발자 직전 상태 취침 ${zz}/${scramDrafted.length}(≥80% — 자던 주민 포함 징발)`); }
  if (!sameFrame) {
    ok(wakeDraftees >= (scramDrafted ? scramDrafted.length * 0.8 : 1), `기상 라벨(집결 중 '기상/수비') ${wakeDraftees}/${scramDrafted ? scramDrafted.length : 0}`);
    ok(sleepDuringForm <= 0, `집결 중 징발자 취침 잔존 0(실측 ${Math.max(0, sleepDuringForm)})`);
    ok(jumps === 0, `침대→집결 도보 연속(도약 0 — 임계 ${jumpThr().toFixed(1)}셀/프레임 초과 ${jumps}회, 최대 ${jumpMax.toFixed(1)}셀)`);
  } else _log('  (총기습 — 집결 도보 창 없음: 기상/연속성 계측 생략, 침대 위치 그대로 주입)');
  ok(openAt > 0 && lbRef, `개전 (frame ${openAt}, 소집→개전 ${openAt - scramAt}프레임)`);
  return { A, B, w, lbRef, openAt, scramAt, scramDrafted, evacOnAtOpen, handoffMax, st0, sameFrame };
}

// ── 개전 시점 유령 검사 + 슬롯 도달 비율(SLB 훅으로 dg 원본 포착) ──
function auditBattle(R) {
  const lb = R.lbRef, spec = lb.spec;
  const units = (spec.B && spec.B.units) || [];
  const noAgent = units.filter(u => !u.agent).length;
  ok(units.length > 0, `spec.B.units 주입 ${units.length}명(표준배치 아님)`);
  ok(noAgent === 0, `★유령 0 — spec.B 전 유닛 agent 참조 보유(무참조 ${noAgent})`);
  const bU = lb.handle.units.filter(u => u.side === 'B');
  ok(bU.length === units.length && bU.every(u => u.agent), `battle-core B측 유닛 ${bU.length} = 주입수 · 전원 agent 부착`);
  ok(lb.defAgents.length === units.length, `방어 로스터(defAgents) ${lb.defAgents.length} = 주입수`);
  ok(R.evacOnAtOpen, '개전 시점 방어 마을 _evac 게이트 on');
  _log(`  주입-핸드오프 최대 변위(클램프 포함): ${R.handoffMax.toFixed(1)}셀`);
}

// ═══════════════ 시나리오 g — 유령 0 종합(밤 기습·대피·귀환) ═══════════════
if (SC === 'g') {
  let ratioAtOpen = -1;
  const origSLB = G.startLiveBattle;
  G.startLiveBattle = function (src) { if (src && src._dg && src._dg.units && ratioAtOpen < 0) {
      const us = src._dg.units; let arr = 0; for (const u of us) { const [tx, ty] = G._muSlotXYProbe ? G._muSlotXYProbe(src._dg, u) : [u.x, u.y]; if (u.arrived) arr++; }
      ratioAtOpen = arr / Math.max(1, us.length); }
    return origSLB.apply(this, arguments); };
  const R = runScrambleNPC(false);
  G.startLiveBattle = origSLB;
  auditBattle(R);
  _log(`  개전 시 슬롯 도달 비율: ${(ratioAtOpen * 100).toFixed(0)}%`);
  const B = R.B, w = R.w;
  // ── 전투 중 비전투원 대피 실측(관찰 속도 그대로): 취침 방치·야외 노동 0 ──
  for (let k = 0; k < 3 && G.LIVE_BATTLES.length; k++) step();   // 대피 회수 안착
  let vSleep = 0, vWork = 0, nSamp = 0, evacLbl = 0, guard = 0;
  while (G.LIVE_BATTLES.length && guard++ < 200 && frames < 780) { step();
    if (guard <= 30) for (const a of B.agents) { if (!a || a._muster || a._bdead) continue; nSamp++;
      if (a.action === '취침') vSleep++;
      if (a.state === 'work' || a.state === 'toWork' || a.state === 'build' || a.state === 'trading') vWork++;
      if (a.action === '대피' || a.action === '농성' || a.action === '요양') evacLbl++; } }
  ok(G.LIVE_BATTLES.length === 0, `전투 결판(frame ${frames})`);
  ok(nSamp > 0 && vSleep === 0 && vWork === 0, `★비전투원 대피: 표본 ${nSamp} 중 취침 방치 0(실측 ${vSleep}) · 야외/노동 상태 0(실측 ${vWork}) · 대피류 라벨 ${evacLbl}`);
  // ── 종전: 대피 해제 · 생존자 도보 귀환 · 고아 0 · 일상 복귀 ──
  for (let k = 0; k < 6; k++) step();
  ok(B._evac === undefined, '종전 → 대피 게이트 해제(_evac 삭제)');
  const stEnd = (() => { const s = G.warStats() || {}; return { battle: s.battle | 0, cas: s.cas | 0 }; })();
  ok(stEnd.battle - R.st0.battle === 1, `전투 1회 확정(battle Δ${stEnd.battle - R.st0.battle} · 사상 Δ${stEnd.cas - R.st0.cas})`);
  setSpeed(20000);
  let guard2 = 0; while ((G.RET_GROUPS.length || G.getWARS().length) && guard2++ < 90 && frames < 845) step();
  ok(retMade >= 1 && G.RET_GROUPS.length === 0, `생존자 도보 귀환(RET 생성 ${retMade}건 → 완주 0 잔여)`);
  ok(G.getWARS().length === 0, '전쟁 종결(WARS 정리)');
  ok(orphans() === 0, '_muster 고아 0');
  let working = 0; for (const a of B.agents) if (a && !a._muster && a.state === 'work') working++;
  ok(working > 0, `일상 복귀(방어 마을 노동 재개 ${working}명)`);
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}

// ═══════════════ 시나리오 s/r — 기습(정렬 미완) vs 여유(정렬 완료): 창발 실측 ═══════════════
else if (SC === 's' || SC === 'r') {
  let ratioAtOpen = -1, unitsAtOpen = 0;
  const origSLB = G.startLiveBattle;
  G.startLiveBattle = function (src) { if (src && src._dg && src._dg.units && ratioAtOpen < 0) {
      const us = src._dg.units; let arr = 0; for (const u of us) if (u.arrived) arr++;
      ratioAtOpen = arr / Math.max(1, us.length); unitsAtOpen = us.length; }
    return origSLB.apply(this, arguments); };
  const R = runScrambleNPC(SC === 's');
  G.startLiveBattle = origSLB;
  auditBattle(R);
  let guard = 0; while (G.LIVE_BATTLES.length && guard++ < 260 && frames < 800) step();
  ok(G.LIVE_BATTLES.length === 0, `전투 결판(frame ${frames})`);
  const h = R.lbRef.handle, S = h.sides;
  const defLoss = S.B.dead / Math.max(1, S.B.start), atkLoss = S.A.dead / Math.max(1, S.A.start);
  const bs = ((R.lbRef.spec.B && R.lbRef.spec.B.units) || []).slice(0, 3).map(u => `(${u.x.toFixed(0)},${u.y.toFixed(0)})`).join('');
  _log(`  ── [창발 계측 · ${SC === 's' ? '기습(정렬<공격)' : '여유(정렬 완료)'}] ──`);
  _log(`  METRIC ${SC} slotRatio=${(ratioAtOpen * 100).toFixed(0)}% units=${unitsAtOpen} defDead=${S.B.dead}/${S.B.start}(${(defLoss * 100).toFixed(0)}%) atkDead=${S.A.dead}/${S.A.start}(${(atkLoss * 100).toFixed(0)}%) win=${h.result && h.result.win} tick=${(+h.tick).toFixed(1)} steps=${R.lbRef._steps} B로컬[0..2]=${bs}`);
  if (SC === 's') ok(ratioAtOpen >= 0 && ratioAtOpen <= 0.35, `기습: 정렬 미완 개전(슬롯 도달 ${(ratioAtOpen * 100).toFixed(0)}% ≤ 35% — 오합지졸 그대로 주입)`);
  else ok(ratioAtOpen >= 0.25, `여유: 부분 정렬 이상 개전(슬롯 도달 ${(ratioAtOpen * 100).toFixed(0)}% ≥ 25% — 기습 대비 우세 여부는 s↔r 크로스 비교 METRIC이 판정)`);
  setSpeed(20000);
  let guard2 = 0; while ((G.RET_GROUPS.length || G.getWARS().length) && guard2++ < 90 && frames < 845) step();
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}

// ═══════════════ 시나리오 P — 플레이어 경로: 선포→camp→[돌격]→긴급 소집→유령 0 ═══════════════
else if (SC === 'P') {
  const pick = pickPair((A, B2, d) => { if (fdOf(B2) < 12) return null; if (!Array.isArray(B2.agents) || B2.agents.length < 12) return null;
    return A.econ.npcs.length - d * 0.001; });
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick; const PW = G.PW;
  PW.faction = A; PW.target = B; PW.mode = 'raid'; PW.mobFrac = 0.5; PW.cmd = false; PW.form = 'line'; PW.phase = 'briefing';
  PW.preview = quiet(() => G.conscript(A, 'raid', { mobFrac: 0.5 }));
  if (!PW.preview) { _log('❌ 징집 프리뷰 실패'); process.exit(1); }
  quiet(() => G._pwDeclareWar());
  ok(PW.phase === 'muster' && !!PW.march, `선포(플레이어): ${A.name}→${B.name} 부대 ${PW.march ? PW.march.units.length : 0}명`);
  B._defPolicy = 'hold';
  hookRet();
  setSpeed(2000);
  let guard = 0, dgPre = false; while (PW.op !== 'camp' && guard++ < 500 && frames < 560) { step(); if (PW._dg) dgPre = true; }
  ok(PW.op === 'camp', `링 도착 → 주둔(camp, day=${dayNow()})`);
  ok(!dgPre && !PW._dg, '버티기 접근 중 방어 무소집(사전 소집 억제 보존 — 플레이어 경로)');
  quiet(() => G._pwAssault());
  ok(PW.op === 'assault', '[돌격] 결단');
  let openAt = -1, lbRef = null, scramSeen = false;
  guard = 0; while (openAt < 0 && guard++ < 300 && frames < 760) { step();
    if (PW._dg && PW._dg._scram) scramSeen = true;
    if (G.LIVE_BATTLES.length > 0) { openAt = frames; lbRef = G.LIVE_BATTLES[G.LIVE_BATTLES.length - 1]; } }
  ok(openAt > 0 && lbRef && lbRef.isPlayer, `개전 (frame ${openAt}, 플레이어 LiveBattle)`);
  ok(scramSeen || (lbRef && lbRef.defAgents.length > 0), `긴급 소집 발동(플레이어 경로${scramSeen ? ' — 접근 중 관측' : ' — 개전과 동일 프레임(총기습): 방어 로스터로 증명'})`);
  const units = (lbRef.spec.B && lbRef.spec.B.units) || [];
  ok(units.length > 0 && units.every(u => u.agent), `★유령 0 — 플레이어 경로 spec.B ${units.length}명 전원 agent 참조`);
  ok(lbRef.defAgents.length === units.length, `방어 로스터 ${lbRef.defAgents.length} = 주입수`);
  ok(B._evac === true, '개전 중 방어 마을 _evac on');
  guard = 0; while (G.LIVE_BATTLES.length && guard++ < 260 && frames < 820) step();
  ok(PW.result != null && PW.phase === 'result', `결판 → 자동 확정(PW.result, phase=${PW.phase})`);
  for (let k = 0; k < 6; k++) step();
  ok(B._evac === undefined, '종전 → 대피 해제');
  setSpeed(20000);
  let g2 = 0; while (G.RET_GROUPS.length && g2++ < 90 && frames < 848) step();
  ok(retMade >= 1 && G.RET_GROUPS.length === 0, `도보 귀환(RET 생성 ${retMade}건 → 완주)`);
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}
// ═══════════════ 시나리오 w — 개전 없는 철수: 긴급 소집군 즉시 해산(스펙 5) ═══════════════
else if (SC === 'w') {
  const pick = pickPair((A, B2, d) => { if (fdOf(B2) < 12) return null; if (!Array.isArray(B2.agents) || B2.agents.length < 12) return null;
    return A.econ.npcs.length - d * 0.001; });
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick; const PW = G.PW;
  PW.faction = A; PW.target = B; PW.mode = 'raid'; PW.mobFrac = 0.5; PW.cmd = false; PW.form = 'line'; PW.phase = 'briefing';
  PW.preview = quiet(() => G.conscript(A, 'raid', { mobFrac: 0.5 }));
  quiet(() => G._pwDeclareWar());
  ok(PW.phase === 'muster' && !!PW.march, `선포(플레이어): ${A.name}→${B.name}`);
  B._defPolicy = 'hold';
  setSpeed(2000);
  let guard = 0; while (PW.op !== 'camp' && guard++ < 500 && frames < 560) step();
  ok(PW.op === 'camp', '링 도착 → 주둔(camp)');
  setSpeed(240);   // 관찰 속도 — 소집→해산 창을 프레임 단위로 봄
  quiet(() => G._pwAssault());
  let scramAt = -1, drafted = null;
  guard = 0; while (scramAt < 0 && guard++ < 200 && frames < 720) { step();
    if (PW._dg && PW._dg._scram) { scramAt = frames; drafted = PW._dg.drafted.slice(); } }
  ok(scramAt > 0 && drafted && drafted.length > 0, `긴급 소집 발동(frame ${scramAt}, 징발 ${drafted ? drafted.length : 0}명) — 개전 전 포착`);
  ok(B._evac === true, '소집 중 _evac on');
  quiet(() => G._pwWithdraw());   // ★개전 없이 철수 결단
  for (let k = 0; k < 4; k++) { step();
    if (process.env.DBG) { const dg = PW._dg; const d = PW.march ? Math.hypot(PW.march.cmd.x - B.center.cx, PW.march.cmd.y - B.center.cy) : -1;
      _log(`    [dbg] f${frames} op=${PW.op} recall=${PW.recall} phase=${PW.phase} dg=${dg ? (dg._scram ? 'scram' : 'norm') : 'null'} d=${d.toFixed(0)} march=${!!PW.march}`); } }
  ok(PW.recall === true && G.LIVE_BATTLES.length === 0, '철수(회군) — 개전 0');
  ok(PW._dg == null, '★긴급 소집군 즉시 해산(assault 취소 → PW._dg 정리)');
  const stillMustered = drafted.filter(a => a._muster).length;
  ok(stillMustered === 0, `징발 주민 전원 해제(_muster 잔존 ${stillMustered}) — 그 자리 해제·일상 도보 복귀(기존 경로)`);
  for (let k = 0; k < 3; k++) step();
  ok(B._evac === undefined, '위협 해소 → _evac 해제');
  setSpeed(20000);
  let g2 = 0; while (PW.phase !== 'briefing' && g2++ < 300 && frames < 845) step();
  ok(PW.phase === 'briefing' && !PW.march, '회군 완료 → 부대 해산·일상 복귀');
  const s1 = (() => { const s = G.warStats() || {}; return { battle: s.battle | 0 }; })();
  ok(G.LIVE_BATTLES.length === 0, '전투 0 유지(무혈 철수)');
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}
else { _log('❌ 알 수 없는 시나리오: ' + SC); process.exit(1); }

_log('══════════════════════════════════════════════════════════════');
_log(pass ? `✅✅ 시나리오 ${SC} 통과 (frames=${frames}, day=${dayNow()})` : `❌ 시나리오 ${SC} 실패 (frames=${frames})`);
_log('══════════════════════════════════════════════════════════════');
process.exit(pass ? 0 : 1);
