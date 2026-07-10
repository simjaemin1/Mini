// ═══════════════════════════════════════════════════════════════════════════
// _livebattle-probe.js — 단계8(성능·결정론) 검증. 전쟁실험실.html 블록B(맵 위 실시간 전투)
//   스케줄러(stepLiveBattles 라운드로빈 예산·pendDays 이월·안전상한)와 결정론 시드(NPC ctx.rng=_muRng)를
//   ★실제 HTML 소스에서 함수·상수를 추출·eval해 구동(복제 아님 — 드리프트 0). battle-core.createBattle은 require.
//   전쟁실험실.html·battle-core.js 무수정(읽기만). /tmp·in-memory. DB·git 없음. 결정론.
//   실행: node sim/_livebattle-probe.js <mode>
//     mode: determinism | load | fastforward | wiring | all
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LAB = path.join(ROOT, '전쟁실험실.html');
const _log = console.log;
const H = fs.readFileSync(LAB, 'utf8');

// battle-core (createBattle 등) — window 없는 상태로 require(모듈 격리)
function loadCore() { delete require.cache[require.resolve('./battle-core.js')]; const _w = global.window; global.window = undefined; const BC = require('./battle-core.js'); global.window = _w; return BC; }
const BC = loadCore();

// ── HTML 블록B에서 실제 함수/상수 텍스트 추출 ──
function grab(re, name) { const m = H.match(re); if (!m) throw new Error('추출 실패: ' + (name || re)); return m[0]; }
// 블록B <script>(마지막 스크립트) 본문
const blocks = [...H.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const BLOCKB = blocks[blocks.length - 1][1];
function grabB(re, name) { const m = BLOCKB.match(re); if (!m) throw new Error('블록B 추출 실패: ' + (name || re)); return m[0]; }

// ── 스텁: stepLiveBattles/헬퍼가 참조하는 최소 전역 ──
const SANDBOX = {};
SANDBOX.WW = 130; SANDBOX.CELL = 760 / 1600; SANDBOX.WAR_BATTLE_MAXTICK = 4000; SANDBOX.WAR_BATTLE_DT = 0.05;
SANDBOX.view = { z: 8, ox: 0, oy: 0 };               // 기본 카메라(중앙 근처 — in-view 판정용). load 모드가 origin으로 조절.
SANDBOX.ROUT_GROUPS = [];
SANDBOX._bkeys = {};
SANDBOX.PW = { phase: 'idle', army: null, cmd: false, focusBattle: null, _live: null };
SANDBOX.console = { warn: () => {} };
// resolveLiveBattle/_buildRoutRetreat/resolvePlayerLiveBattle 는 순수 시각·econ 되먹임 → 프로브에선 결판 기록만.
SANDBOX._resolved = [];
SANDBOX.resolveLiveBattle = function (lb) { SANDBOX._resolved.push({ id: lb.id, forced: !!lb._forced, steps: lb._steps, tick: +(+lb.handle.tick).toFixed(2), win: lb.handle.result ? lb.handle.result.win : null }); };
SANDBOX.resolvePlayerLiveBattle = function (lb) { SANDBOX._resolved.push({ id: lb.id, player: true }); };
SANDBOX._buildRoutRetreat = function () { return null; };

// ── 추출: 상수 + 함수(실제 소스) ──
const SRC = [
  grabB(/const LB_DT=WAR_BATTLE_DT;[\s\S]*?const LB_MAX_BATTLES=64;[^\n]*/, 'LB consts'),
  grabB(/const LB_DETAIL_Z=3\.2;[^\n]*/, 'LB_DETAIL_Z'),
  grabB(/const LB_BUSY_N=4;[^\n]*/, 'LB_BUSY_N'),
  grabB(/function _muRng\(seed\)\{[\s\S]*?\}\s*\/\/ xorshift/, '_muRng') || grabB(/function _muRng\(seed\)\{[^\n]*\}/, '_muRng'),
  grabB(/const LIVE_BATTLES=\[\];/, 'LIVE_BATTLES'),
  grabB(/function makeLiveBattle\(o\)\{[\s\S]*?_steps:0[\s\S]*?\}; \}/, 'makeLiveBattle'),
  grabB(/function _lbForcedResolve\(lb\)\{[\s\S]*?\}\n/, '_lbForcedResolve'),
  grabB(/function _lbStepEngaged\(lb, subCap\)\{[\s\S]*?return did; \}/, '_lbStepEngaged'),
  grabB(/function stepLiveBattles\(dDays\)\{[\s\S]*?\n\}\n\/\/ ★\[단계8\] _lbResolveNPC/, 'stepLiveBattles'),
  grabB(/function _lbResolveNPC\(lb, i\)\{[\s\S]*?w\._live=null;[^\n]*\n\}/, '_lbResolveNPC'),
  grabB(/function _lbInView\(lb\)\{[\s\S]*?o\.cy<=y1\+R\); \}/, '_lbInView'),
].join('\n');

// stepLiveBattles 정의를 잘라낼 때 다음 함수 헤더가 섞이므로 정리(정규식이 _lbResolveNPC 헤더까지 캡처 → 제거)
let SRC2 = SRC.replace(/\n\/\/ ★\[단계8\] _lbResolveNPC[^\n]*$/m, '');

// eval: 스텁을 스코프에 주입하고 추출 소스를 실행 → 함수들을 SANDBOX로 export
const scopeKeys = Object.keys(SANDBOX);
const evaluator = new Function(...scopeKeys, 'BC',
  SRC2 + '\n;return {stepLiveBattles, makeLiveBattle, _muRng, _lbInView, _lbForcedResolve, _lbStepEngaged, get LIVE_BATTLES(){return LIVE_BATTLES;}, LB_STEP_BUDGET, LB_MAXSUB, LB_DT, LB_SEC_PER_DAY, LB_MAX_LOCALT, LB_MAX_BATTLES, LB_BUSY_N};');
const API = evaluator(...scopeKeys.map(k => SANDBOX[k]), BC);
// LIVE_BATTLES 는 추출 소스 내부의 const라 SANDBOX와 공유되게 재바인딩(스케줄러가 splice하는 그 배열)
const LB = API.LIVE_BATTLES;

// ── spec 빌더(전형적 마을전투: 공격 창방패+석검, 방어 창방패+궁수. WAR_ENGAGE_MAX=44 규모까지) ──
function mkSpec(nA, nB, terrain) {
  return { A: { spear: Math.ceil(nA * 0.6), dagger: Math.floor(nA * 0.4), form: 'line' },
           B: { spear: Math.ceil(nB * 0.5), archer: Math.floor(nB * 0.3), dagger: nB - Math.ceil(nB * 0.5) - Math.floor(nB * 0.3), form: 'line' },
           terrain: terrain || 'village' }; }

// LiveBattle 인스턴스 생성(NPC 경로 재현: createBattle + _muRng(seed) + makeLiveBattle)
let _seq = 1;
function spawnNPC(seed, nA, nB, origin) {
  const spec = mkSpec(nA, nB);
  const handle = BC.createBattle(spec, { origin: origin || { cx: 400, cy: 400 }, heading: 0.3, rng: API._muRng(seed) });
  const lb = API.makeLiveBattle({ id: 'W' + (_seq++), war: { atk: {}, def: {}, _live: null }, isPlayer: false,
    atkVil: { center: { cx: origin ? origin.cx - 30 : 370, cy: origin ? origin.cy : 400 } }, defVil: { center: origin || { cx: 400, cy: 400 } },
    spec, handle, mapOrigin: origin || { cx: 400, cy: 400 }, mapAngle: 0.3, phase: 'FORMING', seed });
  LB.push(lb); return lb;
}

// ═══════════ MODE: determinism — 시드 고정 2회 → NPC 전투 결과 byte-동일 ═══════════
function modeDeterminism() {
  _log('\n=== [단계8] 결정론: NPC 전투 시드고정 2회 → 결과 byte-동일 ===');
  const cases = [[1234, 20, 18], [5711, 30, 26], [99001, 44, 40], [313, 12, 12], [42424, 36, 30]];
  let allEq = true;
  for (const [seed, nA, nB] of cases) {
    const run = () => { const spec = mkSpec(nA, nB); const h = BC.createBattle(spec, { origin: { cx: 400, cy: 400 }, heading: 0.3, rng: API._muRng(seed) });
      let steps = 0; while (!h.result && steps < 4000) { h.step(0.05); steps++; }
      const surv = { A: {}, B: {} }; for (const u of h.units) if (u.hp > 0) { surv[u.side][u.type] = (surv[u.side][u.type] || 0) + 1; }
      return JSON.stringify({ win: h.result ? h.result.win : '미결', dA: h.sides.A.dead, dB: h.sides.B.dead, tick: +h.tick.toFixed(3), steps, surv }); };
    const r1 = run(), r2 = run(); const eq = r1 === r2; allEq = allEq && eq;
    const o = JSON.parse(r1);
    _log(`  시드${String(seed).padStart(6)} A${nA}/B${nB}: ${eq ? '✓ byte-동일' : '✗ 상이'}  win=${o.win} A死${o.dA} B死${o.dB} tick=${o.tick} steps=${o.steps}`);
    if (!eq) _log(`     r1=${r1}\n     r2=${r2}`);
  }
  _log(`  → ${allEq ? '✅ 전 케이스 재현(시드→동일 결과)' : '❌ 비결정론 검출'}`);
  return allEq;
}

// ═══════════ MODE: load — 동시 10~15 전투 + 다수, 프레임당 스텝 예산 준수·굶는전투 없음·폭주없음 ═══════════
function modeLoad(nBattles) {
  nBattles = nBattles || 15;
  _log(`\n=== [단계8] 부하: 동시 ${nBattles} 전투(뷰 안/밖 혼합) — 프레임 예산≤${API.LB_STEP_BUDGET} 준수·굶는전투 0·전부 결판 ===`);
  LB.length = 0; SANDBOX._resolved.length = 0; _seq = 1;
  // 뷰 안(카메라 근처 origin) 절반 + 뷰 밖(원거리 origin) 절반 — 화면밖 스텝 유지 확인
  // 뷰(z8,ox0,oy0): 화면 셀범위 x∈[0, 760/8/CELL]=[0,200]. 뷰안 origin=화면중앙 근처(cx~100), 뷰밖=원거리(cx~1200).
  const inView = [], offView = [];
  for (let i = 0; i < nBattles; i++) {
    const off = (i % 2 === 1);
    const origin = off ? { cx: 1200 + i, cy: 1200 } : { cx: 60 + (i * 4), cy: 100 };
    const lb = spawnNPC(1000 + i * 7, 20 + (i % 6) * 4, 18 + (i % 5) * 4, origin);
    (API._lbInView(lb) ? inView : offView).push(lb);
  }
  _log(`  초기: 뷰안 ${inView.length} · 뷰밖 ${offView.length} (뷰밖도 스텝 유지 — 결과는 나야 함)`);
  // dDays=0.02/프레임(전형 배속) 로 프레임 반복. 각 프레임 서브스텝 총계·wall-time 측정.
  const DDAYS = 0.02; let frame = 0, maxSub = 0, sumSub = 0, maxMs = 0, overBudget = 0;
  const stepCounts = new Map();   // 전투별 누적 스텝(굶는전투 검출)
  const t0all = Date.now();
  while (LB.length > 0 && frame < 20000) {
    frame++;
    const pre = new Map(); for (const lb of LB) pre.set(lb, lb._steps);
    const t0 = process.hrtime.bigint();
    API.stepLiveBattles(DDAYS);
    const t1 = process.hrtime.bigint(); const ms = Number(t1 - t0) / 1e6;
    let sub = 0; for (const lb of LB) { const d = lb._steps - (pre.get(lb) || 0); sub += d; }
    // splice된(결판) 전투의 이번 프레임 스텝도 합산해야 정확 — _resolved에서 델타 못 잡으니 근사: 살아있는 것만(대부분).
    maxSub = Math.max(maxSub, sub); sumSub += sub; maxMs = Math.max(maxMs, ms);
    if (sub > API.LB_STEP_BUDGET + API.LB_MAXSUB) overBudget++;   // 예산+단일상한 여유 초과 프레임(회계 오차 감안)
    for (const lb of LB) stepCounts.set(lb.id, (stepCounts.get(lb.id) || 0) + (lb._steps - (pre.get(lb) || 0)));
  }
  const wallMs = Date.now() - t0all;
  const resolved = SANDBOX._resolved.length;
  const forced = SANDBOX._resolved.filter(r => r.forced).length;
  const avgSub = frame ? (sumSub / frame) : 0;
  _log(`  프레임 ${frame} · 전투 결판 ${resolved}/${nBattles}(강제 ${forced}) · 잔존 ${LB.length}`);
  _log(`  프레임당 서브스텝: 최대 ${maxSub} 평균 ${avgSub.toFixed(0)} (예산 ${API.LB_STEP_BUDGET}) · 예산초과 프레임 ${overBudget}`);
  _log(`  프레임 스텝시간: 최대 ${maxMs.toFixed(2)}ms · 총 wall ${wallMs}ms (${frame}프레임 → ${(wallMs / Math.max(1, frame)).toFixed(3)}ms/프레임)`);
  const okBudget = maxSub <= API.LB_STEP_BUDGET + API.LB_MAXSUB;
  const okResolve = resolved === nBattles && LB.length === 0;
  const okRunaway = frame < 20000;
  _log(`  → 예산준수 ${okBudget ? '✓' : '✗'} · 전부결판 ${okResolve ? '✓' : '✗'} · 폭주없음(프레임<20000) ${okRunaway ? '✓' : '✗'} ${okBudget && okResolve && okRunaway ? '✅ 안정' : '❌ 점검'}`);
  return okBudget && okResolve && okRunaway;
}

// ═══════════ MODE: fastforward — 배속↑ 시 전투 비례 가속·안정 결판(결과 왜곡 없음: 맵시간 보존) ═══════════
function modeFastForward() {
  _log('\n=== [단계8] 빠른감기: 배속(dDays)↑ → 비례 가속 + 동일 결과(맵시간 보존 → 왜곡 없음) ===');
  // 동일 전투(같은 시드·spec)를 저배속/고배속으로 각각 완주 → 최종 결과가 동일해야(스케줄러가 결과 불변).
  const seeds = [777, 4242, 90071];
  let allEq = true;
  for (const seed of seeds) {
    const drive = (dDays) => {
      LB.length = 0; SANDBOX._resolved.length = 0; _seq = 1;
      const lb = spawnNPC(seed, 30, 26, { cx: 400, cy: 400 });
      let frame = 0; while (LB.length > 0 && frame < 40000) { API.stepLiveBattles(dDays); frame++; }
      const r = SANDBOX._resolved[SANDBOX._resolved.length - 1] || {};
      return { frame, steps: r.steps, tick: r.tick, win: r.win, forced: r.forced };
    };
    const slow = drive(0.005);   // 저배속(프레임당 0.005일=0.9s 로컬)
    const fast = drive(0.05);    // 고배속(프레임당 0.05일=9s 로컬 · 10배)
    const vfast = drive(0.5);    // 초고배속(0.5일=90s 로컬 · 100배)
    const eq = slow.win === fast.win && fast.win === vfast.win && slow.steps === fast.steps && fast.steps === vfast.steps && Math.abs(slow.tick - vfast.tick) < 1e-6;
    allEq = allEq && eq;
    const ratio = slow.frame / Math.max(1, fast.frame);
    _log(`  시드${seed}: 저속 ${slow.frame}프레임 / 고속 ${fast.frame}프레임 / 초고속 ${vfast.frame}프레임 (가속비 ~${ratio.toFixed(0)}×)`);
    _log(`     결과 win=${slow.win}/${fast.win}/${vfast.win} steps=${slow.steps}/${fast.steps}/${vfast.steps} tick=${slow.tick} ${eq ? '✓ 동일(왜곡없음)' : '✗ 상이'}`);
  }
  _log(`  → ${allEq ? '✅ 배속 무관 동일 결과 + 비례 가속' : '❌ 배속이 결과 왜곡'}`);
  return allEq;
}

// ═══════════ MODE: wiring — 실제 HTML 소스에 단계8 요소가 배선됐는지(구조 검사) ═══════════
function modeWiring() {
  _log('\n=== [단계8] 배선 검사(HTML 소스): 예산·화면밖·시드·폭주방지 ===');
  const checks = [
    ['틱예산 라운드로빈(LB_STEP_BUDGET)', /const LB_STEP_BUDGET=\d+;/.test(H) && /_lbRR/.test(H) && /라운드로빈/.test(H)],
    ['pendDays 이월(맵시간 보존)', /pendDays/.test(H) && /lb\.pendDays\s*[-+]?=/.test(H)],
    ['NPC 결정론 시드(_muRng·id·born)', /rng:_muRng\(_npcSeed\)/.test(H) && /\(w\.id\|\|1\)\*911/.test(H)],
    ['화면밖 렌더 생략(_lbInView·컬링 return)', /function _lbInView/.test(H) && /뷰 밖 전투는 유닛 렌더 생략/.test(H)],
    ['혼잡 장식억제(busy/LB_BUSY_N/rich)', /const LB_BUSY_N=\d+;/.test(H) && /busy/.test(H) && /const rich=/.test(H)],
    ['폭주방지 전투상한(LB_MAX_BATTLES 게이트)', /const LB_MAX_BATTLES=\d+;/.test(H) && /LIVE_BATTLES\.length>=LB_MAX_BATTLES\)return false/.test(H)],
    ['교착 강제결판(_lbForcedResolve·안전상한)', /function _lbForcedResolve/.test(H) && /LB_MAX_LOCALT/.test(H)],
    ['플레이어 무예산(실시간 보존)', /플레이어 전투는 무예산/.test(H)],
  ];
  let ok = true; for (const [name, pass] of checks) { ok = ok && pass; _log(`  ${pass ? '✓' : '✗'} ${name}`); }
  _log(`  → ${ok ? '✅ 전 요소 배선 확인' : '❌ 누락'}`);
  return ok;
}

const MODE = process.argv[2] || 'all';
let pass = true;
if (MODE === 'determinism' || MODE === 'all') pass = modeDeterminism() && pass;
if (MODE === 'load' || MODE === 'all') pass = modeLoad(parseInt(process.argv[3]) || 15) && pass;
if (MODE === 'fastforward' || MODE === 'all') pass = modeFastForward() && pass;
if (MODE === 'wiring' || MODE === 'all') pass = modeWiring() && pass;
_log(`\n${'='.repeat(60)}\n${pass ? '✅✅ 단계8 검증 통과' : '❌ 실패 항목 있음'}\n${'='.repeat(60)}`);
process.exit(pass ? 0 : 1);
