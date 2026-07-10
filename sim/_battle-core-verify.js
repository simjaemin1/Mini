// 복사 정확성 검증 — battle-core.js 가 전투실험실.html 전투 엔진과 '동일 동작'인지.
//   방법: 동일 시드 RNG(__mr) · 동일 병력 · 동일 지형 · 동일 dt로 N틱 stepBattle 반복.
//     기준값 = 전투실험실.html 헤드리스(DOM stub) 구동.  비교값 = battle-core.js(buildArmies).
//   출력: 시드×병력조합별 {A.dead, B.dead, result.win, tick} 일치표. 불일치 시 원인 표시.
//   ★ 전투실험실.html은 읽기만. 실행: node sim/_battle-core-verify.js [maxTicks]
//   ★ 결정론: Math.random을 deploy/buildArmies 직전에 시드 주입 → 두 엔진이 동일 순서로 RNG 소비.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LAB = path.join(ROOT, '전투실험실.html');
const _log = console.log;

// ── 시드 RNG (_war-probe.js __mr 패턴 재사용) ──
const __mr = s => { let a = (s * 2654435761) >>> 0 || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ── DOM stub (전투실험실용 — _battle-test.js 패턴) ──
function mkctx() { return new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } }); }
function elFor(vals, id) { const dflt = (id && id.endsWith('_form')) ? 'line' : (id === 'terrain' ? 'plain' : '0'); return { value: vals[id] != null ? String(vals[id]) : dflt, textContent: '', innerHTML: '', style: {}, getContext: () => mkctx(), width: 760, height: 760, addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 760, height: 760 }) }; }

// 전투실험실 script 추출 (문법 검사 겸)
const H = fs.readFileSync(LAB, 'utf8');
const LAB_SCRIPT = H.match(/<script>([\s\S]*?)<\/script>/)[1];

// ── 기준: 전투실험실 헤드리스 ──
function runLab(vals, seed, maxTicks, dt) {
  const els = {};
  global.document = { getElementById: id => els[id] || (els[id] = elFor(vals, id)) };
  global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
  global.window = { addEventListener: () => {} }; global.performance = { now: () => 0 };
  delete globalThis.__B;
  (0, eval)(LAB_SCRIPT + '\n;globalThis.__B={deploy,stepBattle,trackVel,setRun:v=>{running=v},setRegen:()=>{_regenTerrain=true},S:()=>sides,R:()=>result,T:()=>tick};');
  const B = globalThis.__B;
  // ★ 전투실험실 script는 top-level에서 deploy()를 1회 실행(비시드 RNG로 terrain 미리 생성)해 terrain 변수를 확정함.
  //   그 뒤 시드 deploy()만 하면 (_t===terrain) 조건이 false → genForest 재실행 안 됨 = 비시드 지형 잔존.
  //   battle-core.buildArmies는 매 호출 seeded RNG로 지형 재생성하므로, 공정 비교를 위해 실험실도 강제 재생성.
  //   (평지는 genForest가 RNG 미소비라 무영향. forest/village에서만 RNG 스트림 시점을 일치시킴.)
  Math.random = __mr(seed);        // ★ deploy 직전 시드 주입
  B.setRegen(); B.deploy(); B.setRun(true);
  let steps = 0; while (!B.R() && steps < maxTicks) { B.trackVel(dt); B.stepBattle(dt); steps++; }
  const s = B.S(), r = B.R();
  return { win: r ? r.win : '미결', tick: +B.T().toFixed(3), dA: s.A.dead, dB: s.B.dead, startA: s.A.start, startB: s.B.start, steps };
}

// ── 비교: battle-core (모듈 로드 후 buildArmies) ──
function loadCore() { delete require.cache[require.resolve('./battle-core.js')]; global.window = undefined; return require('./battle-core.js'); }
function runCore(BC, spec, seed, maxTicks, dt) {
  Math.random = __mr(seed);        // ★ buildArmies 직전 시드 주입 (전투실험실과 동일 시점)
  BC.buildArmies(spec);
  let steps = 0; while (!BC.result && steps < maxTicks) { BC.trackVel(dt); BC.stepBattle(dt); steps++; }
  const s = BC.sides, r = BC.result;
  return { win: r ? r.win : '미결', tick: +BC.tick.toFixed(3), dA: s.A.dead, dB: s.B.dead, startA: s.A.start, startB: s.B.start, steps };
}

// vals(전투실험실 DOM 키) ↔ spec(battle-core) 변환
function valsToSpec(vals) {
  const g = (side, sfx) => +(vals[side + '_' + sfx] || 0);
  const S = side => ({ champion: g(side, 'champ'), greataxe: g(side, 'axe'), spear: g(side, 'spear'), pike: g(side, 'pike'), dagger: g(side, 'dagger'), archer: g(side, 'archer'), form: vals[side + '_form'] || 'line' });
  return { A: S('a'), B: S('b'), terrain: vals.terrain || 'plain' };
}

// ── 시나리오: 청동편성 / 석기편성 / 궁수혼합 / 시가전 terrain (+대칭·대형·족장) ──
const scen = [
  ['청동편성 족장1+창방패6 vs 도끼6석검4', { a_champ: 1, a_spear: 6, b_axe: 6, b_dagger: 4 }],
  ['석기편성 석검8 vs 도끼6석검2 (평지)', { a_dagger: 8, b_axe: 6, b_dagger: 2 }],
  ['궁수혼합 창방패6궁5 vs 도끼4석검4궁3', { a_spear: 6, a_archer: 5, b_axe: 4, b_dagger: 4, b_archer: 3 }],
  ['시가전 창6석검4 vs 도끼4석검4궁3 (village)', { a_spear: 6, a_dagger: 4, b_axe: 4, b_dagger: 4, b_archer: 3, terrain: 'village' }],
  ['대칭 창방패8 vs 창방패8', { a_spear: 8, b_spear: 8 }],
  ['대형 방패벽 창10(wall) vs 도끼10', { a_spear: 10, a_form: 'wall', b_axe: 10 }],
  ['숲 궁수10 vs 도끼8 (forest)', { a_archer: 10, b_axe: 8, terrain: 'forest' }],
  ['장창 vs 방패 pike10 vs spear10', { a_pike: 10, b_spear: 10 }],
  ['원형 방진 창8궁4(circle) vs 도끼8', { a_spear: 8, a_archer: 4, a_form: 'circle', b_axe: 8 }],
  ['종대 석검10(column) vs 창방패8', { a_dagger: 10, a_form: 'column', b_spear: 8 }],
];
const SEEDS = [1, 42, 100, 777];
const MAXT = parseInt(process.argv[2]) || 4000;   // 최대 틱 (dt=0.05 → 200s 상한, 대개 result가 먼저)
const DT = 0.05;

_log(`=== battle-core ↔ 전투실험실 복사 정확성 검증 (${SEEDS.length}시드 × ${scen.length}병력 = ${SEEDS.length * scen.length}케이스, dt=${DT}, ≤${MAXT}틱) ===`);
_log('  각 케이스: [전투실험실] dead/win/tick  vs  [battle-core] dead/win/tick → 일치?\n');

let pass = 0, fail = 0; const fails = [];
for (const [name, base] of scen) {
  const vals = { a_champ: 0, a_axe: 0, a_spear: 0, a_pike: 0, a_dagger: 0, a_archer: 0, b_champ: 0, b_axe: 0, b_spear: 0, b_pike: 0, b_dagger: 0, b_archer: 0, ...base };
  const spec = valsToSpec(vals);
  for (const seed of SEEDS) {
    let L, C, err = null;
    try {
      L = runLab(vals, seed, MAXT, DT);
      const BC = loadCore();
      C = runCore(BC, spec, seed, MAXT, DT);
    } catch (e) { err = (e.stack || e.message).split('\n').slice(0, 3).join(' | '); }
    if (err) { fail++; fails.push(`${name} #${seed}: ❌ ${err}`); _log(`${name} · 시드${seed}: ❌ 예외 ${err}`); continue; }
    const ok = L.win === C.win && L.dA === C.dA && L.dB === C.dB && Math.abs(L.tick - C.tick) < 1e-6;
    if (ok) pass++; else { fail++; fails.push(`${name} #${seed}: L{win:${L.win},dA:${L.dA},dB:${L.dB},t:${L.tick}} vs C{win:${C.win},dA:${C.dA},dB:${C.dB},t:${C.tick}} (start L=${L.startA}/${L.startB} C=${C.startA}/${C.startB})`); }
    const mark = ok ? '✓' : '✗ 불일치';
    _log(`${name.padEnd(38)} 시드${String(seed).padStart(3)}: [실험실] A死${String(L.dA).padStart(2)} B死${String(L.dB).padStart(2)} ${String(L.win).padEnd(3)} ${String(L.tick).padStart(6)}s | [core] A死${String(C.dA).padStart(2)} B死${String(C.dB).padStart(2)} ${String(C.win).padEnd(3)} ${String(C.tick).padStart(6)}s → ${mark}`);
  }
}
_log(`\n=== 결과: ${pass}/${pass + fail} 일치 ${fail === 0 ? '✅ 복사 정확 (battle-core = 전투실험실)' : '❌ ' + fail + '건 불일치'} ===`);
if (fail) { _log('\n불일치 상세:'); for (const f of fails) _log('  · ' + f); process.exit(1); }
