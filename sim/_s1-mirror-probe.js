// ═══════════════════════════════════════════════════════════════════════════
// _s1-mirror-probe.js — S1(전투 중 agent 미러 _lbSyncAgents) 검증.
//   전쟁실험실.html 블록B에서 실제 함수(_lbSyncAgents·stepLiveBattles·makeLiveBattle·localToMapCell 등)를
//   ★소스에서 추출·eval해 구동(복제 아님 — 드리프트 0). battle-core.createBattle은 require.
//   전쟁실험실.html·battle-core.js 무수정(읽기만). /tmp·in-memory. DB·git 없음. 결정론.
//   검증: (1) 미러 위치추적 오차~0  (2) _b* 필드 미러  (3) 단방향(미러 유무로 step 결과 byte-동일)
//   실행: node sim/_s1-mirror-probe.js
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LAB = path.join(ROOT, '전쟁실험실.html');
const _log = console.log;
const H = fs.readFileSync(LAB, 'utf8');

function loadCore() { delete require.cache[require.resolve('./battle-core.js')]; const _w = global.window; global.window = undefined; const BC = require('./battle-core.js'); global.window = _w; return BC; }
const BC = loadCore();

const blocks = [...H.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const BLOCKB = blocks[blocks.length - 1][1];
function grabB(re, name) { const m = BLOCKB.match(re); if (!m) throw new Error('블록B 추출 실패: ' + (name || re)); return m[0]; }

// ── 스텁(스케줄러·미러가 참조하는 최소 전역) ──
const SANDBOX = {};
SANDBOX.WW = 130; SANDBOX.CELL = 760 / 1600; SANDBOX.WAR_BATTLE_MAXTICK = 4000; SANDBOX.WAR_BATTLE_DT = 0.05;
SANDBOX.M2C = 1.0; SANDBOX.LB_CEN = 65;
SANDBOX.view = { z: 8, ox: 0, oy: 0 };
SANDBOX.ROUT_GROUPS = [];
SANDBOX._bkeys = {};
SANDBOX.PW = { phase: 'idle', army: null, cmd: false, focusBattle: null, _live: null };
SANDBOX.console = { warn: () => {} };
SANDBOX._resolved = [];
SANDBOX.resolveLiveBattle = function (lb) { SANDBOX._resolved.push({ id: lb.id, win: lb.handle.result ? lb.handle.result.win : null, steps: lb._steps }); };
SANDBOX.resolvePlayerLiveBattle = function (lb) { SANDBOX._resolved.push({ id: lb.id, player: true }); };
SANDBOX._buildRoutRetreat = function () { return null; };

const SRC = [
  grabB(/const LB_DT=WAR_BATTLE_DT;[\s\S]*?const LB_MAX_BATTLES=64;[^\n]*/, 'LB consts'),
  grabB(/const LB_DETAIL_Z=3\.2;[^\n]*/, 'LB_DETAIL_Z'),
  grabB(/const LB_BUSY_N=4;[^\n]*/, 'LB_BUSY_N'),
  grabB(/function _muRng\(seed\)\{[^\n]*\}/, '_muRng'),
  grabB(/function localToMapCell\(lb, lx, ly\)\{[\s\S]*?o\.cy \+ dx\*sn \+ dy\*cs \}; \}/, 'localToMapCell'),
  grabB(/const LIVE_BATTLES=\[\];/, 'LIVE_BATTLES'),
  grabB(/function makeLiveBattle\(o\)\{[\s\S]*?_steps:0[\s\S]*?\}; \}/, 'makeLiveBattle'),
  grabB(/function _lbForcedResolve\(lb\)\{[\s\S]*?\}\n/, '_lbForcedResolve'),
  grabB(/function _lbStepEngaged\(lb, subCap\)\{[\s\S]*?return did; \}/, '_lbStepEngaged'),
  grabB(/function _lbSyncAgents\(lb\)\{[\s\S]*?if\(u\.hp<=0\)a\._bdead=true;[\s\S]*?\} \}/, '_lbSyncAgents'),
  grabB(/function stepLiveBattles\(dDays\)\{[\s\S]*?\n\}\n\/\/ ★\[단계8\] _lbResolveNPC/, 'stepLiveBattles'),
  grabB(/function _lbResolveNPC\(lb, i\)\{[\s\S]*?w\._live=null;[^\n]*\n\}/, '_lbResolveNPC'),
  grabB(/function _lbInView\(lb\)\{[\s\S]*?o\.cy<=y1\+R\); \}/, '_lbInView'),
].join('\n');
let SRC2 = SRC.replace(/\n\/\/ ★\[단계8\] _lbResolveNPC[^\n]*$/m, '');

const scopeKeys = Object.keys(SANDBOX);
const evaluator = new Function(...scopeKeys, 'BC',
  SRC2 + '\n;return {stepLiveBattles, makeLiveBattle, _muRng, localToMapCell, _lbSyncAgents, _lbInView, get LIVE_BATTLES(){return LIVE_BATTLES;}, LB_DT, LB_SEC_PER_DAY};');
const API = evaluator(...scopeKeys.map(k => SANDBOX[k]), BC);
const LB = API.LIVE_BATTLES;

// ── agent 팩토리(전쟁실험실 agent 필드 최소) ──
let _aid = 0;
function mkAgent() { return { id: _aid++, px: 0, py: 0, job: 'villager', state: 'muster', action: '정렬', path: null, hp: 100, _muster: true, _muType: null }; }

// ── injected spec 빌더: 각 유닛에 실제 로컬좌표 + agent 참조(=행군 대형 승계 재현) ──
//   로컬(0~130) 격자에 A(좌 x~40 열)·B(우 x~90 열) 배치. agent는 side별 배열로 보관(추적).
function mkInjectedSpec(nA, nB, terrain) {
  const A = [], B = [], agA = [], agB = [];
  for (let i = 0; i < nA; i++) { const ag = mkAgent(); agA.push(ag);
    A.push({ type: (i % 3 === 0 ? 'dagger' : 'spear'), x: 40 + (i % 3) * 2, y: 55 + (i - nA / 2) * 1.6, agent: ag, cmd: i === 0 }); }
  for (let i = 0; i < nB; i++) { const ag = mkAgent(); agB.push(ag);
    B.push({ type: (i % 4 === 0 ? 'archer' : 'spear'), x: 90 - (i % 3) * 2, y: 55 + (i - nB / 2) * 1.6, agent: ag, cmd: i === 0 }); }
  return { spec: { A: { units: A, form: 'line' }, B: { units: B, form: 'line' }, terrain: terrain || 'plain' }, agA, agB };
}
// injected spec — agent 없이(단방향 검증용 대조군). 좌표는 동일.
function stripAgents(spec) {
  const cp = JSON.parse(JSON.stringify({ A: { units: spec.A.units.map(u => ({ type: u.type, x: u.x, y: u.y, cmd: u.cmd })), form: spec.A.form },
    B: { units: spec.B.units.map(u => ({ type: u.type, x: u.x, y: u.y, cmd: u.cmd })), form: spec.B.form }, terrain: spec.terrain }));
  return cp;
}

let _seq = 1;
function spawnNPC(seed, spec, origin) {
  const handle = BC.createBattle(spec, { origin: origin || { cx: 400, cy: 400 }, heading: 0.3, rng: API._muRng(seed) });
  const lb = API.makeLiveBattle({ id: 'W' + (_seq++), war: { atk: {}, def: {}, _live: null }, isPlayer: false,
    atkVil: { center: { cx: (origin ? origin.cx : 400) - 30, cy: origin ? origin.cy : 400 } }, defVil: { center: origin || { cx: 400, cy: 400 } },
    spec, handle, mapOrigin: origin || { cx: 400, cy: 400 }, mapAngle: 0.3, phase: 'FORMING', seed });
  LB.push(lb); return lb;
}

// ═══════════ 검증1: 미러 위치추적 오차 + _b* 필드 ═══════════
function modeMirror() {
  _log('\n=== [S1] 미러 위치추적: 매 프레임 agent.px/py == localToMapCell(unit) (오차~0) + _b* 필드 ===');
  LB.length = 0; SANDBOX._resolved.length = 0; _seq = 1;
  const origin = { cx: 420, cy: 380 };
  const { spec, agA, agB } = mkInjectedSpec(16, 14, 'plain');
  const lb = spawnNPC(20240710, spec, origin);
  const h = lb.handle;
  // unit ↔ agent 매핑은 u.agent(placeInjected 부착)로 직접 확인.
  const attachedA = h.units.filter(u => u.side === 'A' && u.agent).length;
  const attachedB = h.units.filter(u => u.side === 'B' && u.agent).length;
  _log(`  주입 A=${agA.length}/B=${agB.length} → placeInjected u.agent 부착 A=${attachedA}/B=${attachedB} (일치=${attachedA === agA.length && attachedB === agB.length ? '✓' : '✗'})`);

  const DDAYS = 0.02; let frame = 0, maxErr = 0, sumErr = 0, samples = 0;
  let bhpOK = true, brtOK = true, btypeOK = true, stateOK = true, bcmdOK = true, deadOK = true, moved = false;
  let firstAx = null;
  while (lb.phase !== 'RESOLVED' && !SANDBOX._resolved.length && frame < 6000) {
    frame++;
    API.stepLiveBattles(DDAYS);
    if (SANDBOX._resolved.length) break;
    // 프레임 종료 후 각 유닛 위치 vs 그 agent.px/py 비교(미러가 갱신했어야 함)
    for (const u of h.units) { const a = u.agent; if (!a) continue;
      const p = API.localToMapCell(lb, u.x, u.y);
      const err = Math.hypot(a.px - p.cx, a.py - p.cy);
      if (err > maxErr) maxErr = err; sumErr += err; samples++;
      // _b* 필드 미러 확인(살아있는 유닛)
      if (u.hp > 0) {
        if (Math.abs((a._bhp || -999) - u.hp) > 1e-9) bhpOK = false;
        if (a._brout !== (u.st === 'rout' || u.routing)) brtOK = false;
        if (a._muType !== u.type) btypeOK = false;
        if (a.state !== 'battle') stateOK = false;
        if (a._bcmd !== !!u.cmd) bcmdOK = false;
      }
      if (u.hp <= 0 && a._bdead !== true) deadOK = false;
    }
    // 첫 살아있는 A 유닛 위치가 프레임 진행에 따라 실제로 변하는지(미러가 정지값 아님)
    const fa = h.units.find(u => u.side === 'A' && u.agent && u.hp > 0);
    if (fa) { if (firstAx == null) firstAx = fa.agent.px; else if (Math.abs(fa.agent.px - firstAx) > 0.5) moved = true; }
  }
  _log(`  프레임 ${frame} 진행 · 위치추적 표본 ${samples}`);
  _log(`  위치추적 오차: max=${maxErr.toExponential(2)}셀  평균=${(sumErr / Math.max(1, samples)).toExponential(2)}셀  → ${maxErr < 1e-9 ? '✅ 정확(오차 0)' : (maxErr < 1e-6 ? '✅ 오차~0' : '❌ 추적오차')}`);
  _log(`  _b* 필드: _bhp=${bhpOK ? '✓' : '✗'} _brout=${brtOK ? '✓' : '✗'} _muType=${btypeOK ? '✓' : '✗'} _bcmd=${bcmdOK ? '✓' : '✗'} state='battle'=${stateOK ? '✓' : '✗'} _bdead(사망)=${deadOK ? '✓' : '✗'}`);
  _log(`  agent 위치 프레임간 변동(미러 활성 증거): ${moved ? '✓ 이동함' : '✗ 정지(미러 미작동?)'}`);
  const ok = maxErr < 1e-6 && bhpOK && brtOK && btypeOK && bcmdOK && stateOK && deadOK && moved;
  _log(`  → ${ok ? '✅ 미러 동작(위치·전투상태 단방향 반영)' : '❌ 미러 이상'}`);
  return ok;
}

// ═══════════ 검증2: 단방향 — 미러 유무로 battle-core step 결과 byte-동일 ═══════════
//   같은 seed·spec을 (a)agent 부착(미러 활성) (b)agent 없음(미러 skip) 두 경로로 완주 → 유닛 상태·결과 byte-동일 확인.
//   ★agent는 stepLiveBattles가 매 프레임 _lbSyncAgents로 읽기만 — 되먹임 없으면 두 경로 완전 동일해야 함.
function modeOneWay() {
  _log('\n=== [S1] 단방향: 미러 유무로 battle-core step 결과 byte-동일(agent 안 읽음 증명) ===');
  const cases = [[771, 20, 18], [4242, 30, 26], [99013, 40, 36], [3131, 12, 12], [55501, 34, 30]];
  let allEq = true;
  for (const [seed, nA, nB] of cases) {
    // 동일 좌표·병종 spec 2벌(하나는 agent 부착, 하나는 제거)
    const built = mkInjectedSpec(nA, nB, 'plain');
    const specWith = built.spec;
    const specNo = stripAgents(specWith);
    const origin = { cx: 500, cy: 450 };

    // (a) 미러 활성: stepLiveBattles 경로(_lbSyncAgents 매 프레임 호출)
    LB.length = 0; SANDBOX._resolved.length = 0; _seq = 1;
    const lbW = spawnNPC(seed, specWith, origin);
    const hW = lbW.handle;
    let f = 0; while (lbW.phase !== 'RESOLVED' && !SANDBOX._resolved.length && f < 6000) { API.stepLiveBattles(0.02); f++; }
    const digW = digest(hW);

    // (b) 미러 없음: 동일 seed·좌표, agent 미부착 → _lbSyncAgents는 u.agent 없어 전 유닛 skip.
    //   stepLiveBattles 경로 동일하게(공정) 구동.
    LB.length = 0; SANDBOX._resolved.length = 0; _seq = 1;
    const lbN = spawnNPC(seed, specNo, origin);
    const hN = lbN.handle;
    let f2 = 0; while (lbN.phase !== 'RESOLVED' && !SANDBOX._resolved.length && f2 < 6000) { API.stepLiveBattles(0.02); f2++; }
    const digN = digest(hN);

    const eq = digW === digN; allEq = allEq && eq;
    const o = JSON.parse(digW);
    _log(`  시드${String(seed).padStart(6)} A${nA}/B${nB}: ${eq ? '✓ byte-동일' : '✗ 상이'}  win=${o.win} A死${o.dA} B死${o.dB} tick=${o.tick} unitHash=${o.uh}`);
    if (!eq) { _log(`     with-agent=${digW}`); _log(`     no-agent  =${digN}`); }
  }
  _log(`  → ${allEq ? '✅ 단방향 확인(미러는 읽기 전용 — battle-core step 불변)' : '❌ 미러가 step에 영향(되먹임 검출)'}`);
  return allEq;
}
// 유닛 상태 전량 다이제스트(위치·hp·상태 — 미러 되먹임이 있으면 달라짐)
function digest(h) {
  let uh = 0; const us = h.units;
  for (let i = 0; i < us.length; i++) { const u = us[i];
    // 위치·hp·mrl·shp·state 를 정수 양자화해 해시(부동소수 잡음 배제, 되먹임은 큰 차이라 검출됨)
    const q = [Math.round(u.x * 1e6), Math.round(u.y * 1e6), Math.round(u.hp * 1e6), Math.round((u.mrl || 0) * 1e6), Math.round((u.shp || 0) * 1e6), u.st === 'rout' ? 1 : 0].join(',');
    for (let k = 0; k < q.length; k++) { uh = (uh * 31 + q.charCodeAt(k)) | 0; }
  }
  return JSON.stringify({ win: h.result ? h.result.win : '미결', dA: h.sides.A.dead, dB: h.sides.B.dead, tick: +h.tick.toFixed(3), n: us.length, uh });
}

// ── 실행 ──
const r1 = modeMirror();
const r2 = modeOneWay();
_log(`\n═══ S1 미러 검증 종합: 위치추적/필드=${r1 ? '✅' : '❌'}  단방향=${r2 ? '✅' : '❌'}  → ${r1 && r2 ? '✅ 전부 통과' : '❌ 실패'} ═══`);
process.exit(r1 && r2 ? 0 : 1);
