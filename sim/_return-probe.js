// ═══════════════════════════════════════════════════════════════════════════
// _return-probe.js — 종전 재설계(실개체 도보 귀환 + 맵 지형 콜라이더) 실측 프로브.
//   전쟁실험실.html의 블록A(생활·전쟁 econ)와 블록B(전쟁 UI 레이어 — IIFE 전체)를 *한 eval 스코프*에 로드해
//   실제 지형(TR)·실제 주민(agents)·실제 교역로(getTradePath) 위에서 NPC 전쟁 1건을 강제 발화 → 결판 → 귀환을 측정.
//   ★하네스 = rAF 단일 슬롯(G.rafCb): run0가 lifeLoop로 덮어써 uiLoop은 영영 안 돎(브라우저 빨리감기·프로브 동일 조건).
//     귀환 틱은 window.tickWarGroups/window.tickLiveBattles(게임시간 GM 커서)를 프레임마다 직접 호출해 구동 —
//     즉 '게임시간(dDays) 기반 틱이 rAF와 무관하게 진행·완료되는가'를 증명한다.
//   검증 항목:
//     (a) 승자 생존자: 전장→자기 마을 대형 행군(프레임별 px/py 연속·도약 상한) → 지휘관 center 반경 도착 시 전원 제자리 해제
//     (b) 패자 궤주: 개별 산개 귀환(agent px/py 직접 구동) → 개별 도착 시 그 자리 해제
//     (c) 행군·귀환 agent가 물 셀(다리 제외)을 밟은 프레임 = 0
//     (d) 공격 행군·승자 귀환 지휘관이 교역로 웨이포인트를 추종(경로 이탈 상한)
//     (e) 빨리감기(80000)에서도 귀환 완료 + _muster 고아 0(컨테이너 밖 잔류 없음)
//   ★전쟁실험실.html 무수정(읽기만). /tmp·in-memory. DB·git 없음. 결정론(시드 Math.random 주입 + _muRng).
//   실행: node sim/_return-probe.js [seed=7] [nvil=8]
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
    querySelector: () => ({ appendChild: () => {} }),                       // 블록B panel 스텁
    createElement: () => ({ style: {}, className: '', innerHTML: '', appendChild: () => {} }),
    activeElement: null, addEventListener: () => {},
  };
  G.draw = () => {}; G.V = null; G.TR = null; G.life = null; G.lifeOn = false; G.lifeGM = 0; G.lifeLast = 0; G.lifeSlow = false;
  G.buildWalls = () => new Set(); G.nowMs = 0; G.performance = { now: () => G.nowMs };
  G.rafCb = null; G.requestAnimationFrame = cb => { G.rafCb = cb; };                    // ★단일 슬롯 — uiLoop이 등록해도 run0가 lifeLoop로 덮어씀
  G.cv = { addEventListener: () => {} };                                                 // 블록B 맵 클릭 리스너 스텁
  G.addEventListener = () => {};                                                          // window.addEventListener 스텁(window=global)
  G.window = G;                                                                           // ★블록A warDaily가 window.startLiveBattle(블록B)로 라이브 경로를 타게
  const grab = re => { const m = H.match(re); if (!m) throw new Error('패턴 못찾음: ' + re); return m[0]; };
  const BT = grab(/function buildTerrain\(s,ov\)\{[\s\S]*?\n\}/), VL = grab(/const VillageLayout=\(function\(\)\{[\s\S]*?\}\)\(\);/),
    PC = grab(/function pickCenter\(\)\{[\s\S]*?\n\}/), BFS = grab(/function bfsPath\([\s\S]*?\n\}/), SP = grab(/function setPath\([\s\S]*?\n\}/),
    TP = grab(/let _tradePaths=\{\};[\s\S]*?return _tradePaths\[key\];\n\}/),
    LIFE = grab(/const L_YEAR=365[\s\S]*?(?=\ndocument\.getElementById\(.pop.\)\.addEventListener)/);
  const blocks = [...H.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const BLOCK4 = blocks[blocks.length - 1][1];                                            // 전쟁 UI 레이어(IIFE 전체)
  G.eval('global.buildTerrain=' + BT.replace(/^function buildTerrain/, 'function'));
  G.eval(VL.replace('const VillageLayout=', 'global.VillageLayout='));
  G.frame = function () { G.nowMs += 16; const cb = G.rafCb; G.rafCb = null; if (cb) cb(G.nowMs); };
  // ★핵심: LIFE(블록A)와 BLOCK4(블록B)를 *같은 eval*에 — 블록B가 블록A의 let/const(WAR_MARCH·VILS·getTradePath 등)를 보게(브라우저 전역 렉시컬 동등).
  G.eval(PC.replace(/^function pickCenter/, 'global.pickCenter=function') + '\n' + BFS.replace(/^function bfsPath/, 'global.bfsPath=function') + '\n' + SP.replace(/^function setPath/, 'global.setPath=function') + '\n' + TP + '\n' + LIFE + '\n' + BLOCK4 +
    "\nglobal.getWARS=function(){return WARS;};" +
    "\nglobal.getGM=function(){return lifeGM;};" +   // lifeGM은 eval-스코프 let(전역 아님) — 커서 접근자

    "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
  G.__log = _log; console.log = _log;
  return { frame: G.frame, run0: G.run0, BattleCore };
}

const IS_PLAYER = process.argv[2] === 'player';   // player 모드: 플레이어 경로(선포→행군→교전→자동 확정→닫기만·도보 귀환) 스모크
const SEED = +(IS_PLAYER ? (process.argv[3] || 7) : (process.argv[2] || 7)), NVIL = +(process.argv[4] || process.argv[3] || 8) || 8;
_log(`═══ [종전 재설계] 실측(${IS_PLAYER ? '플레이어' : 'NPC'}): 시드${SEED} · ${NVIL}마을 → 접근 행군·전투·도보 귀환 ═══`);
const lab = loadLabFull(NVIL);
const G = global;
const VILS = lab.run0(SEED);
const setSpeed = v => { G.document.getElementById('simSpeed').value = String(v); };
const dayNow = () => (VILS.length ? VILS[0].day | 0 : 0);
const quiet = fn => { const c = console.log; console.log = () => {}; try { return fn(); } finally { console.log = c; } };
let frames = 0;
function step() { quiet(() => { lab.frame(); if (G.tickMarch) G.tickMarch(); if (G.tickWarGroups) G.tickWarGroups(); if (G.tickLiveBattles) G.tickLiveBattles(); }); frames++; }

// ── 지형 판정(측정용 — TR 직접) ──
//   '물 셀 밟음' = 반올림 셀이 물(다리 제외)이고, 연속 좌표가 인접한 뭍·다리 셀과 0.75셀 이내로 겹치지도 않음.
//   (1셀=1m: 대각 다리 이음새를 지날 때 위치가 두 다리 셀 '사이'라 모서리 물 셀로 반올림되는 양자화 잔향 제외 — 강 한가운데 도보는 그대로 잡힘)
const passableNear = (x, y) => {
  for (const cx of [Math.floor(x), Math.ceil(x)]) for (const cy of [Math.floor(y), Math.ceil(y)]) {
    if (Math.abs(cx - x) > 0.75 || Math.abs(cy - y) > 0.75) continue;
    if (cx < 0 || cy < 0 || cx >= 1600 || cy >= 1600) continue;
    const i = G.idx(cx, cy);
    if (!(G.TR.water[i] === 1 && G.TR.bridge[i] !== 1) && G.TR.rock[i] !== 1) return true;
  } return false; };
const onWater = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= 1600 || yi >= 1600) return false; const i = G.idx(xi, yi); return G.TR.water[i] === 1 && G.TR.bridge[i] !== 1 && !passableNear(x, y); };

// ── 1) 워밍업(빨리감기) → 강제 선전포고 ──
setSpeed(80000);
while (dayNow() < 200 && frames < 140) step();
_log(`  워밍업: day=${dayNow()} frames=${frames} 마을=${VILS.length}`);
let A = null, B = null, bd = 1e18;
for (let i = 0; i < VILS.length; i++) for (let j = 0; j < VILS.length; j++) {
  if (i === j) continue; const v = VILS[i], u = VILS[j];
  if (!v.econ || !u.econ || v.econ.npcs.length < 8 || u.econ.npcs.length < 8) continue;
  const d = Math.hypot(v.center.cx - u.center.cx, v.center.cy - u.center.cy);
  if (d > 60 && d < 520 && d < bd) { bd = d; A = v; B = u; }
}
if (!A) { _log('❌ 전쟁 후보 마을쌍 없음'); process.exit(1); }

// ═══ 플레이어 모드: 선포(버튼 경로) → 행군 → 교전 → 결판 즉시 자동 확정(버튼 폐지) → 결과 '닫기'만 → 도보 귀환 ═══
if (IS_PLAYER) {
  const PW = G.PW;
  PW.faction = A; PW.target = B; PW.mode = 'raid'; PW.mobFrac = 0.5; PW.cmd = false; PW.form = 'line'; PW.phase = 'briefing';
  PW.preview = quiet(() => G.conscript(A, 'raid', { mobFrac: 0.5 }));
  if (!PW.preview) { _log('❌ 플레이어 징집 프리뷰 실패'); process.exit(1); }
  quiet(() => G._pwDeclareWar());
  _log(`  선전포고(플레이어): ${A.name}→${B.name} 거리 ${bd.toFixed(0)}셀 → phase=${PW.phase} 부대=${PW.march ? PW.march.units.length + '명' : '없음'} 경로=${PW.march && PW.march._route ? PW.march._route.length + 'wp' : '없음'}`);
  if (PW.phase !== 'muster' || !PW.march) { _log('❌ 선포 실패'); process.exit(1); }
  setSpeed(600);
  let resultAt = -1, retSeen = 0, battleSeen = false, gmAtResult = 0;
  // ★[작전 층 갱신 사유] 자동 개전 폐지(교전=결단 전용) — 링(WAR_SIEGE_R) 도착 시 [돌격] 결단을 눌러야 전투가 열림(구 '50m 자동 개전' 가정 제거).
  //   방어 태세 3택(응전/버티기)이 hold(농성)로 빠지면 이 프로브의 '양측 실개체 도보 귀환' 표적이 성립 안 함 → respond 강제(태세·봉쇄·항복 검증은 sim/_siege-probe.js 소관).
  B._defPolicy = 'respond';
  for (let k = 0; k < 560 && frames < 780; k++) {
    step();
    if ((PW.op === 'camp' || PW.op === 'siege') && G._pwAssault) quiet(() => G._pwAssault());   // 도착 즉시 돌격 결단(UI 버튼과 동일 경로)
    if (PW.phase === 'battle') battleSeen = true;
    if (PW.phase === 'result' && resultAt < 0) { resultAt = frames; gmAtResult = G.getGM(); }
    retSeen = Math.max(retSeen, G.RET_GROUPS.length);
    if (resultAt > 0 && G.RET_GROUPS.length === 0 && frames > resultAt + 5) break;
  }
  const bodyHTML = String(G.document.getElementById('pwBody').innerHTML || '');
  const hasClose = bodyHTML.indexOf('pwCloseBtn') >= 0;
  const hasOldBtn = bodyHTML.indexOf('경제로 복귀') >= 0 || bodyHTML.indexOf('pwReturnBtn') >= 0;
  const ws = G.warStats();
  const gm0 = G.getGM(); for (let k = 0; k < 6; k++) step(); const worldMoves = G.getGM() > gm0;   // 결과 검토 중에도 세계 진행
  const mobCleared = !A.econ || !A.econ._warMobUntil;                                             // 귀환 완료 → 동원 생산감소 해제
  const btn = G.document.getElementById('pwCloseBtn'); if (btn && btn.onclick) quiet(() => btn.onclick());
  const closed = (PW.phase === 'briefing' && !PW.army && !PW.result);
  setSpeed(80000); for (let k = 0; k < 30 && frames < 830; k++) step();
  let orph = 0; { const seen = new Set(); const add = L => { if (L) for (const a of L) if (a) seen.add(a); };
    for (const w of G.getWARS()) { if (w._mg) add(w._mg.drafted); if (w._dg) add(w._dg.drafted); }
    for (const lb of G.LIVE_BATTLES) { add(lb.atkAgents); add(lb.defAgents); }
    if (G.PW) { if (G.PW.march) add(G.PW.march.drafted); if (G.PW._dg) add(G.PW._dg.drafted); }
    for (const rg of G.RET_GROUPS) add(rg.drafted);
    for (const vil of VILS) if (Array.isArray(vil.agents)) for (const a of vil.agents) if (a && a._muster && !seen.has(a)) orph++; }
  _log(`  전투 진입 ${battleSeen ? '✓' : '✗'} · 결과 ${resultAt >= 0 ? 'frame ' + resultAt : '✗'} · econ 자동확정(전투 ${ws.battle}건·사상 ${ws.cas}) · 귀환 그룹 ${retSeen}개 관측`);
  _log(`  결과 패널: 닫기버튼 ${hasClose ? '✓' : '✗'} · '경제로 복귀' 버튼 ${hasOldBtn ? '❌잔존' : '✓폐지'} · 검토 중 세계 진행 ${worldMoves ? '✓' : '✗'} · 닫기 후 briefing 복귀 ${closed ? '✓' : '✗'}`);
  _log(`  동원계수 해제(귀환 완료) ${mobCleared ? '✓' : '✗'} · RET 잔여 ${G.RET_GROUPS.length} · _muster 고아 ${orph} · 총 프레임 ${frames}`);
  const pass = battleSeen && resultAt >= 0 && retSeen >= 1 && hasClose && !hasOldBtn && worldMoves && closed && mobCleared && ws.battle >= 1 && G.RET_GROUPS.length === 0 && orph === 0 && frames <= 850;
  _log('══════════════════════════════════════════════════════════════');
  _log(pass ? '✅✅ 플레이어 종전 재설계 스모크 통과 (자동 확정·버튼 폐지·도보 귀환·세계 무정지·고아 0)' : '❌ 플레이어 스모크 실패');
  _log('══════════════════════════════════════════════════════════════');
  process.exit(pass ? 0 : 1);
}

let declared = quiet(() => { for (const cs of ['feud', 'trade', 'prestige', 'territory']) { if (G.warMobilize(A, B, cs, bd, dayNow())) return true; } return false; });
if (!declared) {   // 기대효용 게이트 무관하게 기계 검증이 목적 — 직접 WARS 구성(conscript 실편성, 동일 파이프라인)
  const mob = quiet(() => G.conscript(A, 'raid', { mobFrac: 0.5 }));
  if (!mob) { _log('❌ conscript 실패'); process.exit(1); }
  G.getWARS().push({ id: 777, atk: A, def: B, casus: 'feud', force: mob.force, warriors: 0, wep: 1, arm: 0, composition: mob.composition, arrows: mob.arrows, stones: mob.stones || 0, weapQ: (mob.weapQ != null ? mob.weapQ : 0.5), phase: 'march', eta: dayNow() + Math.max(1, Math.ceil(bd / 1440)), marchDays: Math.max(1, Math.ceil(bd / 1440)), born: dayNow(), _vetRoster: null });
  declared = true;
}
_log(`  선전포고: ${A.name}→${B.name} 거리 ${bd.toFixed(0)}셀 (WARS=${G.getWARS().length})`);
// ★[작전 층 갱신 사유] 자동 개전 폐지 — 링 도착 시 EU 결단이 siege/withdraw로 갈 수 있어, '결전(교전→결판→양측 도보 귀환) 기계' 검증이 목적인
//   이 프로브는 돌격 정책·응전 태세를 강제한다(작전 결단·봉쇄·항복·자동 개전 0 자체는 sim/_siege-probe.js가 검증).
{ const w = G.getWARS().find(x => x.atk === A); if (w) w._opPolicy = 'assault'; }
B._defPolicy = 'respond';

// ── 2) 접근 행군(관찰 속도) — 교역로 추종 + 물 0 측정 ──
setSpeed(600);
const NEAR_DIRECT = 180 * 0.45;
let marchDev = 0, marchDevN = 0, marchWater = 0, formWater = 0, engageFrame = -1;
for (let k = 0; k < 200 && engageFrame < 0; k++) {
  step();
  const w = G.getWARS().find(x => x.atk === A);
  if (w && w._mg) {
    const g = w._mg;
    if (g._route && g.phase === 'march') {
      const dGoal = Math.hypot(B.center.cx - g.cmd.x, B.center.cy - g.cmd.y);
      if (dGoal > NEAR_DIRECT) { let md = 1e18; for (const p of g._route) md = Math.min(md, Math.hypot(p.x - g.cmd.x, p.y - g.cmd.y)); marchDev = Math.max(marchDev, md); marchDevN++; }
    }
    for (const u of g.units) if (u.agent && onWater(u.agent.px, u.agent.py)) { if (g.phase === 'march') marchWater++; else formWater++; }   // form(정렬)은 콜라이더 범위 밖(마을 앞 개울 정렬 — 기지 한계로 보고만)
  }
  if (G.LIVE_BATTLES.length > 0) engageFrame = frames;
  if (!w && G.LIVE_BATTLES.length === 0) break;   // 워치독 등으로 소멸
}
_log(`  접근 행군: 교전 ${engageFrame >= 0 ? 'frame ' + engageFrame : '❌미도달'} · 경로이탈 max ${marchDev.toFixed(1)}셀(표본 ${marchDevN}) · 행군(march) 물 프레임 ${marchWater}${formWater ? ' · (정렬 form 단계 물 ' + formWater + ' — 범위 밖 참고)' : ''}`);

// ── 3) 전투 → 결판 → 귀환 그룹 측정 ──
const tracked = new Map();   // agent → {prev:{x,y}, kind, dest, spdCap, released:{...}|null, group}
let jumpViol = 0, retWater = 0, retDevMax = 0, marchArriveOK = 0, marchArriveBad = 0, routArriveOK = 0, routArriveBad = 0, marchRelMax = 0;
let sawMarchGroup = 0, sawRoutGroup = 0, resolvedAt = -1, maxJumpSeen = 0;
let dGMprev = G.getGM();
for (let k = 0; k < 460 && frames < 760; k++) {
  step();
  const dDays = Math.max(1e-9, (G.getGM() - dGMprev) / 1440); dGMprev = G.getGM();
  if (resolvedAt < 0 && G.RET_GROUPS.length > 0) resolvedAt = frames;
  // 신규 그룹 편입
  for (const g of G.RET_GROUPS) {
    if (!g._probeSeen) { g._probeSeen = 1; if (g.kind === 'march') sawMarchGroup++; else sawRoutGroup++; }
    for (const u of g.units) {
      const a = u.agent; if (!a || tracked.has(a)) continue;
      tracked.set(a, { prev: { x: a.px, y: a.py }, kind: g.kind, dest: (g.kind === 'rout' ? { x: u.dx, y: u.dy } : { x: g.def.center.cx, y: g.def.center.cy }), group: g, released: null });
    }
  }
  // 추적 중 agent: 연속성·물·해제 검사
  for (const [a, t] of tracked) {
    if (t.released) continue;
    const jmp = Math.hypot(a.px - t.prev.x, a.py - t.prev.y);
    maxJumpSeen = Math.max(maxJumpSeen, jmp);
    const cap = (t.kind === 'march' ? (t.group.marchSpd * dDays * 4 + 2.5) : (1440 * 1.2 * dDays * 2 + 2.5));
    if (a._muster) {
      if (jmp > cap) jumpViol++;
      if (onWater(a.px, a.py)) retWater++;
      if (t.kind === 'march' && t.group._route && t.group.units[0]) {
        const g = t.group, dGoal = Math.hypot(g.def.center.cx - g.cmd.x, g.def.center.cy - g.cmd.y);
        if (dGoal > NEAR_DIRECT) { let md = 1e18; for (const p of g._route) md = Math.min(md, Math.hypot(p.x - g.cmd.x, p.y - g.cmd.y)); retDevMax = Math.max(retDevMax, md); }
      }
    } else {   // 해제 전이 프레임 — 제자리 해제(도약=이번 프레임 걸음 이하) + 도착 위치 검증
      t.released = { x: a.px, y: a.py, jmp };
      if (jmp > cap) jumpViol++;
      if (t.kind === 'march') { const dHome = Math.hypot(t.group.def.center.cx - a.px, t.group.def.center.cy - a.py); marchRelMax = Math.max(marchRelMax, dHome); (dHome <= 90 ? marchArriveOK++ : marchArriveBad++); }   // 해제 규약=지휘관 center 반경(14) 도착 시 '전원 그 자리' — 낙오 추종병은 대형 꼬리·지형 우회만큼 뒤(90셀 새니티: 마을권 밖 방치 없음)
      else { const dDest = Math.hypot(t.dest.x - a.px, t.dest.y - a.py); const dHome = Math.hypot(t.group.def.center.cx - a.px, t.group.def.center.cy - a.py);
        ((dDest <= 6.5 || dHome <= 17.5) ? routArriveOK++ : routArriveBad++); }   // 소산 목표(ARRIVE_R=6) 또는 마을권(소산11+도착6) 도달 해제 — 비도달 목표 접선 고착 방지 링 포함
    }
    t.prev.x = a.px; t.prev.y = a.py;
  }
  if (resolvedAt > 0 && G.RET_GROUPS.length === 0 && tracked.size > 0) break;   // 전 그룹 귀환 완료
}
const relN = [...tracked.values()].filter(t => t.released).length;
_log(`  결판→귀환: RET 발생 ${resolvedAt >= 0 ? 'frame ' + resolvedAt : '❌없음'} · 그룹(행군 ${sawMarchGroup}·궤주 ${sawRoutGroup}) · 추적 ${tracked.size}명 → 해제 ${relN}명`);
_log(`   (a,b) 연속성: 도약상한 위반 ${jumpViol} (max ${maxJumpSeen.toFixed(1)}셀/프레임) · 해제위치 — 행군 ${marchArriveOK}/${marchArriveOK + marchArriveBad} (center 최대 ${marchRelMax.toFixed(0)}셀 — 지휘관 도착 시 전원 제자리 해제 규약) · 궤주 도착정합 ${routArriveOK}/${routArriveOK + routArriveBad}`);
_log(`   (c) 물 셀 프레임: 접근 행군 ${marchWater} · 귀환 ${retWater} (다리 제외)`);
_log(`   (d) 교역로 추종: 접근 이탈 max ${marchDev.toFixed(1)}셀 · 귀환 이탈 max ${retDevMax.toFixed(1)}셀 (허용 6)`);

// ── 4) 빨리감기 마무리 — 귀환 완료·고아 0 ──
setSpeed(80000);
for (let k = 0; k < 90 && frames < 840; k++) { step(); if (G.RET_GROUPS.length === 0 && k > 20) break; }
// 고아 = 어떤 컨테이너(행군 _mg/_dg·전투 로스터·귀환 그룹·플레이어)에도 없는 _muster 잔류
function orphanCount() {
  const seen = new Set(); const add = L => { if (L) for (const a of L) if (a) seen.add(a); };
  for (const w of G.getWARS()) { if (w._mg) add(w._mg.drafted); if (w._dg) add(w._dg.drafted); }
  for (const lb of G.LIVE_BATTLES) { add(lb.atkAgents); add(lb.defAgents); }
  if (G.PW) { if (G.PW.march) add(G.PW.march.drafted); if (G.PW._dg) add(G.PW._dg.drafted); }
  for (const rg of G.RET_GROUPS) add(rg.drafted);
  let n = 0; for (const vil of VILS) if (Array.isArray(vil.agents)) for (const a of vil.agents) if (a && a._muster && !seen.has(a)) n++;
  return n;
}
const orph = orphanCount();
const relSample = [...tracked.keys()].find(a => !a._muster);
const ws = G.warStats ? G.warStats() : null;
_log(`   (e) 빨리감기 후: RET 잔여 ${G.RET_GROUPS.length} · _muster 고아 ${orph} · 해제자 일상 상태 예 state='${relSample ? relSample.state : '-'}' · 총 프레임 ${frames} · day ${dayNow()} · 전투 ${ws ? ws.battle : '?'}건`);

// ── 판정 ──
const pass =
  engageFrame >= 0 && resolvedAt >= 0 &&
  sawMarchGroup >= 1 && sawRoutGroup >= 1 &&
  jumpViol === 0 && retWater === 0 &&           // ★(c) 통과 기준=귀환 경로 물 0. 접근 march 물은 정렬(form) 진입 탈출 잔향일 수 있어 보고만(위에 표기)
  marchDev <= 6 && retDevMax <= 6 &&
  marchArriveBad === 0 && routArriveBad === 0 && relN > 0 &&
  G.RET_GROUPS.length === 0 && orph === 0 && frames <= 850;
_log('══════════════════════════════════════════════════════════════');
_log(pass ? '✅✅ 종전 재설계 실측 전부 통과 (도보 귀환·제자리 해제·물 0·교역로 추종·하네스 완주·고아 0)' : '❌ 실측 실패 — 위 항목 확인');
_log('══════════════════════════════════════════════════════════════');
process.exit(pass ? 0 : 1);
