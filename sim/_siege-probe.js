// ═══════════════════════════════════════════════════════════════════════════
// _siege-probe.js — 전쟁 작전 층(operational layer) 실측 프로브.
//   "전투는 수단, 전쟁은 선택의 연속 — 포위·봉쇄·버티기·기만." (사용자 비전 구속)
//   전쟁실험실.html 블록A(생활·전쟁 econ)+블록B(전쟁 UI 레이어)를 한 eval 스코프에 로드(_return-probe.js 하네스 동형 —
//   rAF 단일 슬롯, uiLoop 안 돎: window.tickMarch/tickWarGroups/tickLiveBattles를 프레임마다 직접 호출해 게임시간 구동).
//   시나리오(각각 독립 프로세스·시드당 단일 프로세스·프레임 ≤850):
//     a — 봉쇄→무혈 항복: 전투 0회·사상 0, 조공(TRIBUTES) 성립, 곳간 공납, 포위 해제, 공격군 RET_GROUPS 도보 귀환 완료.
//     b — 봉쇄(버티기)→공격 군량 소진→철수: 봉쇄 중 야외 생산 ≈0.15배·교역 발/착 0·foodDays 감소 실측 +
//         '농성' 출근 억제(화면 게이트) + 방어 무소집(버티기=_dg 없음) → 철수 후 _siegeBlock 해제·생산 회복 실측. (스펙 b+d 통합)
//     c — 방어 응전 sortie: 방어 출격 결단 → LiveBattle 발생·결판 → 양측 실개체 도보 귀환(기존 경로).
//     e — 자동 개전 폐지: 두 대형 50m 안 수일 대치에도 전투 0 — assault 결단 시에만 개전.
//     p — 플레이어 동사 스모크: 링 도착(camp)→[포위 유지](_pwSiege: 봉쇄 훅 on)→[철수](_pwWithdraw: 훅 off·회군·해산).
//   ★전쟁실험실.html 무수정(읽기만). /tmp·in-memory. DB·git 없음. 결정론: 시드 Math.random 주입(__mr)+_muRng —
//     프로브 자신은 Math.random 미사용(선택 루프 전부 순서 결정적).
//   실행: node sim/_siege-probe.js <a|b|c|e|p> [seed=7] [nvil=8]
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
  G.dispatchTrades = () => {};   // ★저속(관찰) 프레임용 스텁 — 시각 배달부 레이어(LIFE 추출 밖·5031행). econ 캐러밴(감사 대상)은 엔진 소관이라 무영향. 기존 프로브는 저속 미진입이라 없던 의존.
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
    "\nglobal.getWorld=function(){return ECON_WORLD;};" +          // 봉쇄 중 캐러밴 발/착 감사(world.caravans)
    "\nglobal.getTRIB=function(){return TRIBUTES;};" +             // 무혈 항복 조공 계약 검증
    "\nglobal.run0=function(seed){Math.random=global.__mr(seed);TR=buildTerrain(seed);document.getElementById('seed').value=String(seed);console.log=function(){};lifeInit();lifeGM=L_START*720;lifeLast=0;global.nowMs=0;lifeOn=true;global.rafCb=lifeLoop;console.log=global.__log;return VILS;};");
  G.__log = _log; console.log = _log;
  return { frame: G.frame, run0: G.run0, BattleCore };
}

const SC = String(process.argv[2] || 'a');
const SEED = +(process.argv[3] || 7), NVIL = +(process.argv[4] || 8) || 8;
_log(`═══ [작전 층] 시나리오 ${SC} · 시드${SEED} · ${NVIL}마을 — 포위·봉쇄·버티기·항복·결단 실측 ═══`);
const lab = loadLabFull(NVIL);
const G = global;
const VILS = lab.run0(SEED);
const setSpeed = v => { G.document.getElementById('simSpeed').value = String(v); };
const dayNow = () => (VILS.length ? VILS[0].day | 0 : 0);
const quiet = fn => { const c = console.log; console.log = () => {}; try { return fn(); } finally { console.log = c; } };
let frames = 0;
function step() { quiet(() => { lab.frame(); if (G.tickMarch) G.tickMarch(); if (G.tickWarGroups) G.tickWarGroups(); if (G.tickLiveBattles) G.tickLiveBattles(); }); frames++; }

// ── 정찰 근사 미러(쌍 선택·전제 확인용 — 블록B _opDefEff/_opDefOdds와 동일 수식. 결정 자체는 엔진이 내림) ──
const AUX = 0.25;   // WAR_AUX_MULT 미러(5904행)
function defEffOf(vil) { const D = vil && vil.econ; if (!D) return 1;
  const duc = D.counts || {}, NU = D.npcs.length, dWar = Math.round(duc.warrior || 0), dHun = Math.round(duc.hunter || 0);
  const dEng = Math.min(Math.max(1, NU - 1), dWar + dHun + Math.round((NU - dWar) * 0.25));
  const dAux = Math.max(0, dEng - dWar);
  const dWep = Math.min(1, (D.storage.weapon || 0) / Math.max(1, dEng)), dArm = Math.min(1, (D.storage.armor || 0) / Math.max(1, dEng));
  return Math.max(1, (dWar + dAux * AUX)) * (0.6 + 0.5 * dWep + 0.3 * dArm) * (1 + (vil._palisade || 0)) * 1.25; }
function defOddsOf(vil, F) { const dEff = defEffOf(vil); F = Math.max(1, F || 1); const wG = Math.round(F * 0.4);
  const aEff = Math.max(1, (Math.min(F, wG) + Math.max(0, F - wG) * AUX)) * (0.6 + 0.5 * 0.5 + 0.3 * 0.15);
  return dEff / (dEff + aEff); }
const fdOf = v => (v && v.econ) ? G.warFE(v.econ) / Math.max(1, v.econ.npcs.length) : 0;
const stSnap = () => { const s = G.warStats() || {}; return { battle: s.battle | 0, cas: s.cas | 0, siege: s.siege | 0, assault: s.assault | 0, withdraw: s.withdraw | 0, surrender: s.surrender | 0, sortie: s.sortie | 0 }; };
// RET_GROUPS 생성 훅 — 고속 프레임에선 귀환 그룹이 '한 step 안'에 생성→완주해 경계 샘플로 안 보임(생성 사실 자체를 계수)
let retMade = 0;
function hookRet() { const arr = G.RET_GROUPS; const orig = Array.prototype.push;
  arr.push = function () { retMade += arguments.length; return orig.apply(this, arguments); }; }
const orphans = () => { const seen = new Set(); const add = L => { if (L) for (const a of L) if (a) seen.add(a); };
  for (const w of G.getWARS()) { if (w._mg) add(w._mg.drafted); if (w._dg) add(w._dg.drafted); }
  for (const lb of G.LIVE_BATTLES) { add(lb.atkAgents); add(lb.defAgents); }
  if (G.PW) { if (G.PW.march) add(G.PW.march.drafted); if (G.PW._dg) add(G.PW._dg.drafted); }
  for (const rg of G.RET_GROUPS) add(rg.drafted);
  let n = 0; for (const vil of VILS) if (Array.isArray(vil.agents)) for (const a of vil.agents) if (a && a._muster && !seen.has(a)) n++; return n; };

// ── 워밍업 + 간섭 차단(다른 NPC 전쟁 자연 발화 억제 — 델타 카운터 오염 방지·결정론 유지) ──
setSpeed(80000);
while (dayNow() < 200 && frames < 140) step();
_log(`  워밍업: day=${dayNow()} frames=${frames} 마을=${VILS.length}`);
for (const v of VILS) v._warCd = dayNow() + 5000;   // 프로브 전쟁만 존재(자연 개전 봉인 — 픽스처)

// ── 전쟁 강제(직접 편성·WARS 푸시 — _return-probe 동형: 기대효용 게이트와 무관하게 '기계' 검증) ──
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
const OPK = w => `op=${w.op || '-'} pack=${w._packRem != null ? w._packRem.toFixed(1) : '-'}일`;
let pass = true; const fail = m => { pass = false; _log('  ❌ ' + m); };
const ok = (c, m) => { if (c) _log('  ✓ ' + m); else fail(m); return !!c; };

// ═══════════════ 시나리오 a — 봉쇄 → 무혈 항복(전투 0·사상 0·조공·귀환) ═══════════════
if (SC === 'a') {
  const pick = pickPair((A, B, d) => { const adults = A.econ.npcs.length; const F = Math.max(2, Math.round(adults * 0.5 * 0.8));
    if (defOddsOf(B, F) >= 0.22) return null; return adults - B.econ.npcs.length - d * 0.001; });   // 큰 마을 → 작은 마을(절망 승산)
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick;
  const w = forceWar(A, B, 0.5, 801); if (!w) { _log('❌ 편성 실패'); process.exit(1); }
  w._opPolicy = 'siege'; B._defPolicy = 'hold';   // 봉쇄 전용 정책 + 방어 농성(항복 경로 — 태세·EU 자체는 b·c·e가 검증)
  // 방어 곳간을 항복 임계 바로 위(7일분)로 배수 — '봉쇄→카운트다운→항복'을 프레임 예산 안에서 관측(픽스처)
  { const D = B.econ, N = D.npcs.length, cur = G.warFE(D); const tgt = 7 * N;
    if (cur > 1e-9) { const k = tgt / cur; for (const r of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) if (D.storage[r]) D.storage[r] *= k; }
    else D.storage.food = tgt; }
  const st0 = stSnap(), trib0 = G.getTRIB().length, bFood0 = G.warFE(B.econ);
  _log(`  선포: ${A.name}(${A.econ.npcs.length}명)→${B.name}(${B.econ.npcs.length}명) 거리${pick.d.toFixed(0)} force=${w.force} pDef(미러)=${defOddsOf(B, w.force).toFixed(2)} 방어곳간=${fdOf(B).toFixed(1)}일`);
  hookRet();
  setSpeed(20000);
  let sawCamp = false, sawSiege = false, blockOn = false, surrAt = -1, fdAtSurr = -1;
  for (let k = 0; k < 620 && frames < 800; k++) { step();
    if (w.op === 'camp') sawCamp = true;
    if (w.op === 'siege') { sawSiege = true; if (B.econ._siegeBlock === true && B._siege === true) blockOn = true; }
    const s = stSnap();
    if (s.surrender > st0.surrender && surrAt < 0) { surrAt = frames; fdAtSurr = fdOf(B); }
    if (surrAt > 0 && G.RET_GROUPS.length === 0 && G.getWARS().length === 0 && frames > surrAt + 3) break; }
  const s1 = stSnap();
  ok(sawSiege && blockOn, `포위 진입+봉쇄 훅 설치 관측(camp ${sawCamp ? '경유' : '직행'} → siege · _siegeBlock/_siege on)`);
  ok(s1.surrender - st0.surrender === 1, `무혈 항복 1건 (frame ${surrAt}, 항복 시 방어 곳간 ${fdAtSurr.toFixed(1)}일 < 5)`);
  ok(s1.battle - st0.battle === 0 && s1.cas - st0.cas === 0, `전투 0회 · 사상 0 (battle Δ${s1.battle - st0.battle}, cas Δ${s1.cas - st0.cas})`);
  const trib = G.getTRIB().find(t => t.payer === B && t.payee === A);
  ok(G.getTRIB().length - trib0 === 1 && !!trib, `조공 계약 성립(TRIBUTES: ${B.name}→${A.name})`);
  ok(G.warFE(B.econ) <= bFood0, `곳간 공납(방어 식량 ${bFood0.toFixed(0)}→${G.warFE(B.econ).toFixed(0)})`);
  ok(B.econ._siegeBlock === undefined && B.econ._siegeOutMul === undefined && B._siege === undefined, '포위 해제 — 봉쇄 훅 삭제(_siegeBlock/_siegeOutMul/_siege)');
  ok(retMade >= 1 && G.RET_GROUPS.length === 0, `공격군 도보 귀환(RET_GROUPS 생성 ${retMade}건 → 완주 0 잔여)`);
  ok(G.getWARS().length === 0, '전쟁 종결(WARS 정리)');
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}

// ═══════════════ 시나리오 b — 봉쇄(버티기) 경제 실측 → 군량 소진 철수 → 회복 (스펙 b+d) ═══════════════
else if (SC === 'b') {
  const pick = pickPair((A, B, d) => { if (fdOf(B) < 20) return null;   // 항복 안 나는 부유 방어(버티기 경제 관측)
    return A.econ.npcs.length + fdOf(A) * 0.1 - d * 0.001; });
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick; const D = B.econ;
  const outdoorBuf = () => { const b = D.dailyProductionBuf || {}; return (b.food || 0) + (b.fish || 0) + (b.wood || 0); };
  // 1) 봉쇄 전 기준 생산(4일 평균)
  setSpeed(20000);
  let lastDay = dayNow(); const base = [];
  while (base.length < 4 && frames < 250) { step(); const dn = dayNow(); if (dn > lastDay) { lastDay = dn; base.push(outdoorBuf()); } }
  const baseAvg = base.reduce((a, b) => a + b, 0) / Math.max(1, base.length);
  if (!(baseAvg > 1e-6)) { _log('❌ 기준 야외 생산 0 — 쌍 부적합'); process.exit(1); }
  // 2) 선포(봉쇄 전용) — 버티기 정책
  const w = forceWar(A, B, 0.5, 802); if (!w) { _log('❌ 편성 실패'); process.exit(1); }
  w._opPolicy = 'siege'; B._defPolicy = 'hold';
  hookRet();
  const st0 = stSnap(), sent0 = (D.tradeStats && D.tradeStats.caravansSent) || 0;
  _log(`  선포: ${A.name}→${B.name} 거리${pick.d.toFixed(0)} force=${w.force} 방어곳간=${fdOf(B).toFixed(1)}일 기준야외생산=${baseAvg.toFixed(1)}/일(${base.length}일)`);
  let guard = 0; while (w.op !== 'siege' && guard++ < 200 && frames < 400) step();
  if (w.op !== 'siege') { _log('❌ 포위 미진입'); process.exit(1); }
  // ★픽스처(2026-07-12): 포위 개시 시 방어 곳간을 '부유 버티기' 안정값(40일치)으로 세팅 + B향/발 진행 캐러밴 정리.
  //   근거: pickPair(fd≥20)로 뽑힌 부유 방어가 선포~행군 창(수일)에 v2 무제한 귀환매입(2026-06-03 장기 동작·정상
  //   sim은 드레인 후 회복하나 이 4일 창에선 곳간 급감)으로 트레이드-드레인 → 포위 카운트다운이 굶주림에서 시작→
  //   조기 항복하던 픽스처 드리프트 차단(시나리오 a·c의 곳간 세팅 관행 동형). 봉쇄 훅(_siegeBlock)이 이 시점부터
  //   신규 교역을 막으므로 이후 감소는 순수 소비(의도한 버티기 소모전) — 진행 중 캐러밴만 정리해 드레인 완전 격리.
  { const N = D.npcs.length, cur = G.warFE(D), tgt = 40 * N;
    if (cur > 1e-9) { const kk = tgt / cur; for (const r of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) if (D.storage[r]) D.storage[r] *= kk; }
    else D.storage.food = tgt;
    const wd = G.getWorld(); if (wd && Array.isArray(wd.caravans)) for (let i = wd.caravans.length - 1; i >= 0; i--) { const c = wd.caravans[i]; if (c.to === D || c.from === D) wd.caravans.splice(i, 1); } }
  const siegeDay = dayNow(), fd0 = fdOf(B), pack0 = w._packRem;
  _log(`  포위 개시: day=${siegeDay} ${OPK(w)} 방어곳간=${fd0.toFixed(1)}일`);
  // 3) 봉쇄 중 실측 — 야외 생산·캐러밴 발/착·foodDays·방어 무소집. 도중 저속(240) 구간에서 '농성' 화면 게이트 확인.
  lastDay = dayNow(); const sieged = []; let caraViol = 0, dgSeen = false, siegeVis = null, wdAt = -1;
  while (frames < 700) { step(); const dn = dayNow();
    if (dn > lastDay) { lastDay = dn; if (w.op === 'siege') sieged.push(outdoorBuf()); }
    if (w._dg) dgSeen = true;
    const cv = (G.getWorld() && G.getWorld().caravans) || [];
    for (const c of cv) if ((c.from === D || c.to === D) && c.departDay >= siegeDay) caraViol++;
    if (siegeVis == null && sieged.length >= 2) {   // 저속 구간: 아침(06~13시)에 30프레임 — 야외 직업 '농성'(자택 대기)·신규 출근 0 확인
      const f = (G.getGM() % 1440) / 1440;
      if (f > 0.28 && f < 0.5) { setSpeed(240); let n농성 = 0, n야외출근 = 0, n실내출근 = 0;
        const OUT = { farmer: 1, fisher: 1, hunter: 1, forager: 1, lumberjack: 1, miner: 1 };
        // 뷰 상태 정규화(픽스처): 빨리감기 동안 per-agent 루프가 0회라 state가 init 잔존(시드 의존) — '아침 자택'으로 맞춰
        //   게이트(home→출근 관문)를 전 직업에 균일 노출. econ 무변경(view 레이어 전용 필드).
        for (const a of B.agents) { if (!a || a._muster) continue; a.state = 'home'; a.action = ''; a.path = null; a.rest = 0; a._half = 0; }
        for (let q = 0; q < 30; q++) { step();
          for (const a of B.agents) { if (!a || a._muster) continue;
            if (OUT[a.job]) { if (a.action === '농성') n농성++; if (a.state === 'toWork' || a.state === 'work') n야외출근++; }
            else if (a.state === 'toWork' || a.state === 'work') n실내출근++; } }
        siegeVis = { n농성, n야외출근, n실내출근 }; setSpeed(20000); } }
    const s = stSnap(); if (s.withdraw > st0.withdraw) { wdAt = frames; break; }
    if (fdOf(B) < 6) break;   // 안전핀(항복 가드 — hold라 항복 없음이 정상이나 기근 폭주 방지)
  }
  const fdEnd = fdOf(B), packEnd = w._packRem, siegedAvg = sieged.reduce((a, b) => a + b, 0) / Math.max(1, sieged.length);
  const ratio = siegedAvg / baseAvg;
  _log(`  봉쇄 ${sieged.length}일: 야외생산 ${siegedAvg.toFixed(1)}/일 (기준 대비 ×${ratio.toFixed(3)}) · 곳간 ${fd0.toFixed(1)}→${fdEnd.toFixed(1)}일 · 군량 ${pack0 != null ? pack0.toFixed(1) : '?'}→${packEnd != null ? packEnd.toFixed(1) : '?'}일`);
  ok(sieged.length >= 5, `봉쇄 유지 ${sieged.length}일(≥5) 관측`);
  ok(ratio >= 0.05 && ratio <= 0.35, `야외 생산 ≈0.15배(실측 ×${ratio.toFixed(3)} ∈ [0.05,0.35] — 잠행 노동 잔존)`);
  ok(caraViol === 0, `봉쇄 중 교역 캐러밴 발/착 0 (departDay≥${siegeDay} 위반 ${caraViol})`);
  ok((D.tradeStats.caravansSent || 0) - sent0 === 0, `caravansSent 증가 0 (봉쇄 중 파견 금지)`);
  ok(fdEnd < fd0 - 1, `곳간 카운트다운(기존 소비 로직): ${fd0.toFixed(1)}→${fdEnd.toFixed(1)}일`);
  ok(!dgSeen, '버티기 = 방어 소집 없음(_dg 미생성 — 내부 경제 지속)');
  // 실내 통근 대조: 옥내 고정작업장 직업(요리·야금)이 있을 때만 요구 — 수렵/임업 특화 마을(cook/smith 0)은 통근 실내직이 없어 표본 0이 정상.
  //   '낮 배차 살아있음'은 n농성(야외 아침 출근이 봉쇄 게이트로 전환된 표본)이 이미 증명 → 실내 대조는 해당 직군 존재 시 부가 확인(픽스처 강건화: B가 마을7=hunter19/lumber6/farmer5/mason2류로 뽑히면 옥내 통근직 0).
  const _dc = D.counts || {}; const inCommute = Math.round((_dc.cook || 0) + (_dc.smith || 0) + (_dc.weaponsmith || 0) + (_dc.armorsmith || 0));
  if (siegeVis) ok(siegeVis.n농성 >= 1 && siegeVis.n야외출근 === 0 && (siegeVis.n실내출근 >= 1 || inCommute === 0), `화면 출근 게이트: 야외 '농성' ${siegeVis.n농성}표본 · 야외 출근 ${siegeVis.n야외출근}(=0) · 실내 출근 ${siegeVis.n실내출근}표본(옥내 통근직 ${inCommute}명 — ${inCommute === 0 ? '없음: 농성 표본이 배차 증명' : '대조'})`);
  else fail('저속 관측 구간 미도달(농성 게이트 미확인)');
  const s1 = stSnap();
  ok(s1.withdraw - st0.withdraw === 1 && wdAt > 0, `군량 소진 → 철수 결단(frame ${wdAt}, 잔량 ${packEnd != null ? packEnd.toFixed(1) : '?'}일 < ${G.WAR_PACK_CRIT || 3})`);
  ok(s1.battle - st0.battle === 0 && s1.cas - st0.cas === 0, '전투 0회 · 사상 0(버티기 성공)');
  ok(D._siegeBlock === undefined && D._siegeOutMul === undefined && B._siege === undefined, '철수 → 봉쇄 훅 해제');
  // 4) 회복 실측(해제 후 4일) + 귀환 완주
  lastDay = dayNow(); const rec = [];
  while (rec.length < 4 && frames < 830) { step(); const dn = dayNow(); if (dn > lastDay) { lastDay = dn; rec.push(outdoorBuf()); } }
  const recAvg = rec.reduce((a, b) => a + b, 0) / Math.max(1, rec.length);
  ok(recAvg > baseAvg * 0.5, `생산 회복 실측: ${recAvg.toFixed(1)}/일 (기준의 ×${(recAvg / baseAvg).toFixed(2)} > 0.5)`);
  let guard2 = 0; while ((G.RET_GROUPS.length || G.getWARS().length) && guard2++ < 60 && frames < 849) step();
  ok(retMade >= 1 && G.RET_GROUPS.length === 0 && G.getWARS().length === 0, `철수군 도보 귀환(RET 생성 ${retMade}건) 완주·전쟁 정리`);
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}

// ═══════════════ 시나리오 c — 방어 응전 sortie → LiveBattle → 결판 → 양측 도보 귀환 ═══════════════
else if (SC === 'c') {
  // 실제 conscript 프리뷰(부작용 없음)로 force를 산출해 pDef≥0.62(출격 문턱 0.60 위) 쌍·동원비율을 결정론 탐색
  let pick = null;
  for (const mf of [0.15, 0.2, 0.28, 0.35]) { if (pick) break;
    for (let i = 0; i < VILS.length && !pick; i++) for (let j = 0; j < VILS.length && !pick; j++) { if (i === j) continue;
      const A = VILS[i], B = VILS[j]; if (!A.econ || !B.econ || A.econ.npcs.length < 8 || B.econ.npcs.length < 8) continue;
      const d = Math.hypot(A.center.cx - B.center.cx, A.center.cy - B.center.cy); if (d < 60 || d > 520) continue;
      const mob = quiet(() => G.conscript(A, 'raid', { mobFrac: mf })); if (!mob || mob.force < 2) continue;
      if (defOddsOf(B, mob.force) >= 0.62) pick = { A, B, d, mf }; } }
  if (!pick) { _log('❌ 후보 쌍 없음(방어 우위 쌍)'); process.exit(1); }
  const { A, B } = pick;
  const w = forceWar(A, B, pick.mf, 803); if (!w) { _log('❌ 편성 실패'); process.exit(1); }
  w._opPolicy = 'siege'; B._defPolicy = 'respond';   // 공격은 눌러앉고(결단은 방어가) — 방어 응전·출격
  const st0 = stSnap();
  _log(`  선포: ${A.name}→${B.name} 거리${pick.d.toFixed(0)} force=${w.force} pDef(미러)=${defOddsOf(B, w.force).toFixed(2)} (출격 문턱 0.60)`);
  setSpeed(2000);
  // 개전 순간 훅(초소규모 궤주는 개전·결판이 한 프레임 안 — 프레임 경계 샘플로는 안 보임): tickWarGroups는 window.startLiveBattle 경유
  const origSLB = G.startLiveBattle; let openAt = -1, pendingBlk = false, blockAfterOpen = null;
  G.startLiveBattle = function () { const r = origSLB.apply(this, arguments); if (r && openAt < 0) { openAt = frames + 1; pendingBlk = true; } return r; };
  // 단일 관측 루프(전이가 프레임 사이에 스치지 않게 매 프레임 샘플): 포진→sortie(→저속 600)→개전→결판→귀환 완주
  hookRet();
  let dgSeen = false, sortieAt = -1, sortieDay = -1;
  for (let k = 0; k < 720 && frames < 845; k++) { step();
    if (pendingBlk) { blockAfterOpen = B.econ._siegeBlock; pendingBlk = false; }   // 개전 직후 프레임: 봉쇄 훅 해제 확인
    if (w._dg) dgSeen = true;
    if (w._sortie && sortieAt < 0) { sortieAt = frames; sortieDay = dayNow(); setSpeed(600); }   // 출격 후엔 관찰 속도(교전·귀환 전개 가시화)
    if (openAt > 0 && G.LIVE_BATTLES.length === 0 && G.RET_GROUPS.length === 0 && G.getWARS().length === 0 && frames > openAt + 3) break; }
  G.startLiveBattle = origSLB;
  const s2 = stSnap();
  ok(sortieAt > 0 && s2.sortie - st0.sortie === 1, `방어 출격(sortie) 결단 (frame ${sortieAt}, day=${sortieDay})`);
  ok(dgSeen, '응전 소집 — 방어 대형 포진(_dg) 관측');
  ok(openAt > 0 && openAt >= sortieAt, `sortie 접근 → LiveBattle 개전 (frame ${openAt} — 방어 결단으로 열린 교전)`);
  ok(blockAfterOpen === undefined, '개전 = 봉쇄 해제(전투가 봉쇄를 대체)');
  ok(s2.assault - st0.assault === 0, '공격 assault 결단 0 — 교전은 오직 방어 sortie 결단으로 열림');
  ok(s2.battle - st0.battle === 1, `전투 결판 1회(battle Δ${s2.battle - st0.battle} · 사상 ${s2.cas - st0.cas})`);
  ok(retMade >= 1 && G.RET_GROUPS.length === 0 && G.LIVE_BATTLES.length === 0, `양측 실개체 도보 귀환(기존 경로 — RET 생성 ${retMade}건 → 완주)`);
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}

// ═══════════════ 시나리오 e — 자동 개전 폐지: 50m 대치 수일 → 전투 0, assault 결단 시만 개전 ═══════════════
else if (SC === 'e') {
  const pick = pickPair((A, B, d) => { if (fdOf(B) < 12) return null;   // 방어 곳간 넉넉(압박 출격 가드 fd<8 회피)
    const dEff = defEffOf(B), adults = A.econ.npcs.length;
    for (const mf of [0.25, 0.35, 0.5, 0.65]) { const F = Math.max(2, Math.round(adults * mf * 0.8)); const p = defOddsOf(B, F);
      if (p >= 0.30 && p <= 0.55) return 1000 - d * 0.001 - Math.abs(p - 0.45) * 100; }   // 응전하되 출격 문턱(0.60) 아래
    return null; });
  if (!pick) { _log('❌ 후보 쌍 없음(중간 승산 쌍)'); process.exit(1); }
  const { A, B } = pick;
  let w = null; for (const mf of [0.25, 0.35, 0.5, 0.65]) { const F = Math.max(2, Math.round(A.econ.npcs.length * mf * 0.8)); const p = defOddsOf(B, F);
    if (p >= 0.30 && p <= 0.55) { w = forceWar(A, B, mf, 805); break; } }
  if (!w) { _log('❌ 편성 실패'); process.exit(1); }
  w._opPolicy = 'siege'; B._defPolicy = 'respond';   // 응전 소집(방어 대형은 서되) — 출격 승산 미달 → 대치
  const st0 = stSnap();
  _log(`  선포: ${A.name}→${B.name} 거리${pick.d.toFixed(0)} force=${w.force} pDef(미러)=${defOddsOf(B, w.force).toFixed(2)} ∈ (0.30,0.55) — 출격 없음 전제`);
  setSpeed(2000);
  let guard = 0; while (!((w.op === 'camp' || w.op === 'siege') && w._dg && w._dg.phase !== 'form') && guard++ < 450 && frames < 500) step();
  if (!(w.op === 'camp' || w.op === 'siege') || !w._dg) { _log(`❌ 대치 전제 미성립(op=${w.op} dg=${!!w._dg})`); process.exit(1); }
  // ── 대치 픽스처: 공격 대형을 방어 대형 40셀 앞으로(뭍 스냅) — '두 군 50m 안'을 수일 유지 ──
  const dg = w._dg, g = w._mg;
  { const dx = g.cmd.x - dg.cmd.x, dy = g.cmd.y - dg.cmd.y, dd = Math.hypot(dx, dy) || 1;
    let px = dg.cmd.x + dx / dd * 40, py = dg.cmd.y + dy / dd * 40;
    const water = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 1 || yi < 1 || xi >= 1599 || yi >= 1599) return true; const i = G.idx(xi, yi); return (G.TR.water[i] === 1 && G.TR.bridge[i] !== 1) || G.TR.rock[i] === 1; };
    for (let r = 0; r < 12 && water(px, py); r++) { px += dx / dd * 2; py += dy / dd * 2; }   // 물이면 축따라 물러남
    g.holdPt = { x: px, y: py }; g.cmd.x = px; g.cmd.y = py; }
  const day0 = dayNow(); let dMax = 0, dMin = 1e9, battles = 0;
  while (dayNow() < day0 + 3 && frames < 700) { step();
    const d = Math.hypot(g.cmd.x - dg.cmd.x, g.cmd.y - dg.cmd.y); dMax = Math.max(dMax, d); dMin = Math.min(dMin, d);
    battles = Math.max(battles, G.LIVE_BATTLES.length); if (w.phase === 'battle') battles++; }
  const s1 = stSnap();
  ok(dMax <= 50.5, `대치 유지: 두 지휘관 거리 ${dMin.toFixed(1)}~${dMax.toFixed(1)}셀 ≤ 50 (교전 반경 안)`);
  ok(dayNow() - day0 >= 3, `대치 ${dayNow() - day0}일(≥3) 경과`);
  ok(battles === 0 && s1.battle - st0.battle === 0, `★자동 개전 0 — 50m 안 수일 대치에도 LiveBattle 없음(battle Δ${s1.battle - st0.battle})`);
  ok(w._sortie !== true && s1.sortie - st0.sortie === 0, '방어 출격도 없음(승산 미달 — 대치 지속)');
  // ── 이제 결단: assault → 즉시 개전(자동이 아니라 '결정'이 전투를 연다) ──
  w._opPolicy = 'assault';
  let openAt = -1; guard = 0;
  while (openAt < 0 && guard++ < 260 && frames < 845) { step(); if (G.LIVE_BATTLES.length > 0 || w.phase === 'battle') openAt = frames; }
  const s2 = stSnap();
  ok(openAt > 0 && s2.assault - st0.assault === 1, `assault 결단 → 개전 (frame ${openAt}, 결단 후에만 전투)`);
  ok(B.econ._siegeBlock === undefined && B.econ._siegeOutMul === undefined, '개전 = 봉쇄 훅 해제(siege→battle 승계)');
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}

// ═══════════════ 시나리오 p — 플레이어 동사: camp 도착 → [포위 유지] → [철수](회군·해산) ═══════════════
else if (SC === 'p') {
  const pick = pickPair((A, B, d) => { if (fdOf(B) < 15) return null; return A.econ.npcs.length - d * 0.001; });
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick; const PW = G.PW;
  PW.faction = A; PW.target = B; PW.mode = 'raid'; PW.mobFrac = 0.5; PW.cmd = false; PW.form = 'line'; PW.phase = 'briefing';
  PW.preview = quiet(() => G.conscript(A, 'raid', { mobFrac: 0.5 }));
  if (!PW.preview) { _log('❌ 징집 프리뷰 실패'); process.exit(1); }
  quiet(() => G._pwDeclareWar());
  ok(PW.phase === 'muster' && !!PW.march, `선포(플레이어): ${A.name}→${B.name} 부대 ${PW.march ? PW.march.units.length : 0}명 · 공성팩 ${PW.army._packRem != null ? PW.army._packRem.toFixed(1) : '?'}일분 적재`);
  B._defPolicy = 'hold';   // 방어 반응 최소화(동사 스모크에 집중)
  const st0 = stSnap();
  setSpeed(2000);
  let guard = 0; while (PW.op !== 'camp' && guard++ < 500 && frames < 600) step();
  ok(PW.op === 'camp', `링 도착 → 주둔(camp) — 자동 개전 없음 (day=${dayNow()})`);
  const body0 = String(G.document.getElementById('pwBody').innerHTML || '');
  ok(body0.indexOf('pwAssaultB') >= 0 && body0.indexOf('pwSiegeB') >= 0 && body0.indexOf('pwWithdrawB') >= 0, 'UI 버튼 [돌격][포위 유지][철수] 노출(camp 패널)');
  quiet(() => G._pwSiege());
  ok(PW.op === 'siege' && B.econ._siegeBlock === true && B.econ._siegeOutMul === (G.WAR_SIEGE_OUTMUL || 0.15), '[포위 유지] → 봉쇄 훅 설치(_siegeBlock·_siegeOutMul=0.15)');
  for (let k = 0; k < 30 && frames < 700; k++) step();   // 며칠 유지(팩 소모 관측)
  const packMid = PW.army._packRem;
  quiet(() => G._pwWithdraw());
  ok(PW.op == null && PW.recall === true, '[철수] → 회군 개시');
  ok(B.econ._siegeBlock === undefined && B._siege === undefined, '철수 = 봉쇄 훅 해제');
  guard = 0; while (PW.phase !== 'briefing' && guard++ < 300 && frames < 845) step();
  const s1 = stSnap();
  ok(PW.phase === 'briefing' && !PW.march, `회군 도착 → 해산·일상 복귀(phase=briefing) · 군량 ${packMid != null ? packMid.toFixed(1) : '?'}일 남기고 철수(환급)`);
  ok(s1.battle - st0.battle === 0, '전투 0회(무혈 원정)');
  ok(s1.siege - st0.siege >= 1 && s1.withdraw - st0.withdraw >= 1, `warStats op 카운트(siege +${s1.siege - st0.siege}, withdraw +${s1.withdraw - st0.withdraw})`);
  ok(orphans() === 0, '_muster 고아 0');
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}
// ═══════════════ 시나리오 u — 정책 훅 없는 기본 기대효용(EU) 경로 스모크: 링 도착 → 결단 → 종결·무교착 ═══════════════
else if (SC === 'u') {
  const pick = pickPair((A, B, d) => A.econ.npcs.length - d * 0.001);   // 아무 유효쌍(가장 큰 공격 마을)
  if (!pick) { _log('❌ 후보 쌍 없음'); process.exit(1); }
  const { A, B } = pick;
  const w = forceWar(A, B, 0.5, 807); if (!w) { _log('❌ 편성 실패'); process.exit(1); }
  // ★정책 훅 미설정 — _opNpcDecide 기대효용(승산 vs 소모전 vs 철수)·_opDefStance 평가 경로 그대로
  const st0 = stSnap();
  _log(`  선포(EU 기본): ${A.name}→${B.name} 거리${pick.d.toFixed(0)} force=${w.force} pDef(미러)=${defOddsOf(B, w.force).toFixed(2)} 방어곳간=${fdOf(B).toFixed(1)}일`);
  hookRet();
  setSpeed(20000);
  const day0 = dayNow(); let opSeen = new Set(), concludedAt = -1;
  for (let k = 0; k < 620 && frames < 830; k++) { step();
    if (w.op) opSeen.add(w.op);
    const done = (G.getWARS().indexOf(w) < 0) || w.phase === 'return' || w.phase === 'battle';
    if (done && concludedAt < 0) concludedAt = frames;
    if (concludedAt > 0 && G.getWARS().length === 0 && G.RET_GROUPS.length === 0 && G.LIVE_BATTLES.length === 0 && frames > concludedAt + 3) break; }
  const s1 = stSnap();
  const decided = (s1.assault - st0.assault) + (s1.withdraw - st0.withdraw) + (s1.siege - st0.siege) + (s1.surrender - st0.surrender);
  _log(`  경과: op궤적=[${[...opSeen].join('→')}] 결단 합=${decided} (assault+${s1.assault - st0.assault} siege+${s1.siege - st0.siege} withdraw+${s1.withdraw - st0.withdraw} surrender+${s1.surrender - st0.surrender}) battle Δ${s1.battle - st0.battle}`);
  // 철수·항복도 march→camp 도착 후 결단(camp 상태에서만 _opNpcDecide 실행) — 빠른 결단 시 camp op는 1틱이라 프레임 샘플에 안 잡힐 수 있어 withdraw/surrender도 '링 도착 결단'의 증거로 인정(무교착 종결·decided≥1이 실질 게이트).
  ok(opSeen.has('camp') || opSeen.has('siege') || opSeen.has('assault') || opSeen.has('withdraw') || opSeen.has('surrender'), '링 도착 → 작전 결단(camp/siege/assault/withdraw/surrender 중 하나)');
  ok(decided >= 1, '기대효용 결단 ≥1(정책 훅 없이 자율 결정)');
  ok(concludedAt > 0 && dayNow() - day0 <= 16, `무교착 종결(frame ${concludedAt}, ${dayNow() - day0}일 — 팩 수명 ≤ ${(G.WAR_SIEGE_PACK || 12) + 4}일 내)`);
  ok(G.getWARS().length === 0 && G.RET_GROUPS.length === 0 && G.LIVE_BATTLES.length === 0, '전쟁·귀환·전투 전부 정리');
  ok(orphans() === 0, '_muster 고아 0');
  // ── 부사례: EU가 '포위'를 고르는 조건(승산<0.58 && 군량 12 > 상대 곳간 추정+1) — 무장 낮춤·방어 기근 픽스처 ──
  { const pick2 = pickPair((A2, B2, d2) => (A2 !== A && B2 !== A) ? (A2.econ.npcs.length - d2 * 0.001) : null);
    if (pick2) { const A2 = pick2.A, B2 = pick2.B;
      { const D2 = B2.econ, N2 = D2.npcs.length, cur = G.warFE(D2); const tgt = 8 * N2;   // 기근 직전 방어(est 6~10일 < 팩 12)
        if (cur > 1e-9) { const kk = tgt / cur; for (const r of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) if (D2.storage[r]) D2.storage[r] *= kk; } else D2.storage.food = tgt; }
      // 엔진 _opAtkOdds 미러로 pWin<0.56(assault 문턱 0.58 아래)이 되는 (동원비율·무장) 결정론 탐색
      const atkOddsMirror = (F, war, wep, arm, defV) => { F = Math.max(1, F); war = Math.min(F, Math.round(war || 0));
        const aEff = Math.max(1, (war + (F - war) * AUX)) * (0.6 + 0.5 * wep + 0.3 * arm);
        const dEff = defEffOf(defV); return aEff / (aEff + dEff); };
      let w2 = null, tune = null;
      outer: for (const wep2 of [0.3, 0.1, 0]) for (const mf2 of [0.25, 0.18, 0.4]) {
        const mob2 = quiet(() => G.conscript(A2, 'raid', { mobFrac: mf2 })); if (!mob2 || mob2.force < 2) continue;
        const p = atkOddsMirror(mob2.force, mob2.warriors, wep2, 0, B2);
        if (p < 0.56 && p > 0.30) { tune = { mf: mf2, wep: wep2, p }; break outer; } }
      if (tune) { w2 = forceWar(A2, B2, tune.mf, 808); if (w2) { w2.wep = tune.wep; w2.arm = 0; } }   // 무장 저하 → EU가 소모전 우위 포위를 고르게
      if (w2) { _log(`  부사례 조율: mobFrac=${tune.mf} wep=${tune.wep} → 예상 pWin=${tune.p.toFixed(2)} (<0.58)`);
        const st2 = stSnap(); const day2 = dayNow(); const ops2 = new Set(); let end2 = -1;
        for (let k = 0; k < 620 && frames < 845; k++) { step(); if (w2.op) ops2.add(w2.op);
          const done = (G.getWARS().indexOf(w2) < 0) || w2.phase === 'return' || w2.phase === 'battle';
          if (done && end2 < 0) end2 = frames;
          if (end2 > 0 && G.getWARS().length === 0 && G.RET_GROUPS.length === 0 && G.LIVE_BATTLES.length === 0 && frames > end2 + 3) break; }
        const s3 = stSnap();
        _log(`  부사례(EU 포위 선택): ${A2.name}→${B2.name} op궤적=[${[...ops2].join('→')}] siege+${s3.siege - st2.siege} surrender+${s3.surrender - st2.surrender} withdraw+${s3.withdraw - st2.withdraw} assault+${s3.assault - st2.assault}`);
        ok(ops2.has('siege') && s3.siege - st2.siege >= 1, 'EU 자율 포위 결단(승산 낮음·소모전 우위 → siege)');
        ok(end2 > 0 && dayNow() - day2 <= 16, `부사례 무교착 종결(${dayNow() - day2}일)`);
      } else _log('  (부사례 조율 불가 — 이 시드는 EU 포위 유도 무장 조합 없음: 생략. 포위 선택 자체는 다른 시드가 커버)'); } else _log('  (부사례 후보 없음 — 생략)'); }
  ok(frames <= 850, `프레임 ${frames} ≤ 850`);
}
else { _log('❌ 알 수 없는 시나리오: ' + SC); process.exit(1); }

_log('══════════════════════════════════════════════════════════════');
_log(pass ? `✅✅ 시나리오 ${SC} 통과 (frames=${frames}, day=${dayNow()})` : `❌ 시나리오 ${SC} 실패 (frames=${frames})`);
_log('══════════════════════════════════════════════════════════════');
process.exit(pass ? 0 : 1);
