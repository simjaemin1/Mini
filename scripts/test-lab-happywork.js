#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-lab-happywork.js — 행복이 높으면 더 일한다 (T157 · 랩) ======
//
// ★왜 [재민 물음 2026-09-05 → PM 판정 2026-09-07 · 지시 T157]
//   *"행복이 오로지 리비히 상한 역할만? 높으면 더 좋아지는 것도 있어야."*
//   여태 행복은 연속 항 `(happiness−0.5)×0.6` 으로 **인구에만** 닿았다. 건강은 이미
//   `_hpm`(±10%)으로 작업량에 닿는다. T157 은 그 문법을 그대로 빌려 행복을 작업량에 잇는다.
//
// ★★이 하네스가 지키는 것
//   ① 문법     : 0.5 가 중립(배수 1) · 대칭(0.3 ↔ 0.7) · 상한은 `H` 자신(`1 ± H/2` · 새 수 0)
//   ② 유도     : `H = 0.24` 를 출처의 관측(+12%)에서 **다시 유도해도 같다** · 랩이 그 값을 준다
//   ③ 주입     : 계수는 **엔진이 안 갖는다** — `world.happyWorkW` 한 곳뿐이고 서버는 안 준다
//   ④ 되돌림   : ★[T244] 기본이 **켬**이 됐다 — 안 준 판 = 정본 `H` 를 준 판 · `=0` 이 종전 세계다
//   ⑤ 곱       : 건강 배수와 **곱한다**(둘 다 낮으면 둘 다 곱) — 같은 자리 한 줄
//   ⑥ 돌연변이 : `H` 를 10 으로 적으면 배수가 6배까지 벌어진다(세계가 아니라 폭주) → 빨강
//   ⑦ 랩 배선  : 랩 `L_HAPPYWORK_BASE` 가 유도값과 같다 · 훅이 `lifeInit` 에서 설치된다
//   ⑧ 하한 1   : ★[T209 → T244] 아래만 1 에서 자른다 · **기본 켬** · 끄는 것은 명시 `0` 하나
//   ⑨ 기본 켬  : ★[T244] 계수가 정본 상수다 — 주입 > 손잡이 > 정본 상수 순 · 되돌림 `=0`
//
// ★★★[T244 2026-09-13 · 재민 확정] **기본이 뒤집혔다.** T157·T209 는 랩만 켜는 손잡이였다.
//   이제 서버 기본이 켬이라, "손잡이 없이 잰 수"가 곧 **켠 수**다. 그래서 종전 문법(하한 없는 식)을
//   재는 절(①⑤⑥)은 `withFloorOff` 로 **명시로 끄고** 잰다 — 하네스가 무엇을 재는지 자리마다 적는다.
//
// 실행: node scripts/test-lab-happywork.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t157-hz-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

// ★★[T244] 이 하네스는 **기본값**을 잰다 ⇒ 부른 셸에 손잡이가 남아 있으면 딴 기계를 잰다(족보 128).
for (const k of ['L_HAPPYWORK', 'L_HAPPY_FLOOR1', 'L_ALLOC_REAL']) {
  if (process.env[k] !== undefined) { console.log(`  · [상황] env ${k}=${process.env[k]} 를 지우고 잰다(기본값 하네스)`); delete process.env[k]; }
}
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const LAB = fs.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8');
// ★줄 주석을 **먼저** 지우고 블록 주석을 지운다(T100 5판 수리 — `// … sim/* …` 함정).
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');

// 출처가 잰 수 — 이 하네스가 유일하게 손으로 적는 것이고, ②가 이것으로 `H` 를 다시 만든다.
const SRC_GAIN = 0.12;   // Oswald·Proto·Sgroi 2015, JOLE 33(4) 초록: "approximately 12% greater productivity"
const H = 0.24;

// ★[T244] 종전 문법(하한 없는 식)을 재는 자리에서 쓴다. `happyFloor1On()` 은 **부를 때마다** env 를 읽으므로
//   (모듈 적재 시점이 아니다) 이렇게 껐다 되돌릴 수 있다 — 자식 프로세스가 필요한 곳은 ⑧이 따로 띄운다.
const withFloorOff = (fn) => {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'L_HAPPY_FLOOR1');
  const old = process.env.L_HAPPY_FLOOR1;
  process.env.L_HAPPY_FLOOR1 = '0';
  try { return fn(); } finally { if (had) process.env.L_HAPPY_FLOOR1 = old; else delete process.env.L_HAPPY_FLOOR1; }
};

console.log('\n=== 행복이 높으면 더 일한다 (T157 · 랩) ===');

// ── ① 문법 — 건강과 같은 꼴 ────────────────────────────────────────────────
console.log('\n① 문법 — 0.5 중립 · 대칭 · 상한은 H 자신 (★T244: 하한을 **명시로 끄고** 잰다)');
{
  // ★[T244] 기본이 켬이라 그냥 부르면 0.5 아래가 전부 1 이다 — 이 절이 재는 것은 **밑에 깔린 식**이다.
  const f = (h, w) => withFloorOff(() => econ.happyWorkMul(h, w));
  pre(typeof econ.happyWorkMul === 'function', '순수 함수 `happyWorkMul(happiness, W)` 이 노출돼 있다');
  pre(withFloorOff(() => econ.happyFloor1On()) === false, '`L_HAPPY_FLOOR1=0` 이 실제로 하한을 끈다(이 절의 전제)');
  ok(f(0.5, H) === 1, '① ★★행복 0.5 는 배수 **정확히 1**(중립)', String(f(0.5, H)));
  const up = f(0.7, H) - 1, dn = 1 - f(0.3, H);
  ok(Math.abs(up - dn) < 1e-12, '① ★★★대칭 — 0.3 과 0.7 이 중립에서 **같은 거리**', `+${up.toFixed(6)} / −${dn.toFixed(6)}`);
  ok(Math.abs(up - 0.2 * H) < 1e-12, '① 기울기가 `H` 다(0.2 만큼 오르면 0.2×H)', up.toFixed(6));
  ok(Math.abs(f(1.0, H) - (1 + H * 0.5)) < 1e-12 && Math.abs(f(0.0, H) - (1 - H * 0.5)) < 1e-12,
    '① ★★상한·하한이 **`H` 자신**이다(`1 ± H/2` — 자르는 값을 따로 짓지 않았다)',
    `${f(0.0, H).toFixed(4)} ~ ${f(1.0, H).toFixed(4)}`);
  ok(f(2.07, H) === f(1.0, H), '① ★★행복이 1 을 넘어도 **더 안 준다**(출처가 안 잰 구간으로 외삽 금지)', f(2.07, H).toFixed(4));
  ok(f(0.9, 0) === 1 && f(0.1, 0) === 1, '① `W = 0` 이면 배수 1(되돌림의 뿌리)');
  ok(/return Math\.max\(1 - W \* 0\.5, Math\.min\(1 \+ W \* 0\.5, 1 \+ \(happiness - 0\.5\) \* W\)\);/.test(SRC),
    '① ★소스에 식이 **한 줄로만** 있다(상한을 숫자로 적으면 여기가 빨개진다)');
}

// ── ② 유도 — H 는 출처에서 나온 수다 ───────────────────────────────────────
console.log('\n② 유도 — `H` 는 고른 수가 아니라 나온 수다');
{
  //   출처의 처치는 *중립 → 행복* 이다 ⇒ 우리 축의 0.5 → 1.0(반쪽 폭) ⇒ 0.5 × H = 관측
  const derived = 2 * SRC_GAIN;
  ok(Math.abs(derived - H) < 1e-12,
    '② ★★★`H` 를 출처의 관측(+12%)에서 **다시 유도해도 같다** (0.5 × H = 0.12 ⇒ H = 0.24)',
    `유도 ${derived} = 채택 ${H}`);
  const m = LAB.match(/L_HAPPYWORK_BASE=([0-9.]+)/);
  ok(!!m && Math.abs(+m[1] - H) < 1e-12, '② ★★랩이 주는 값이 그 유도값이다', m ? m[1] : '없다');
  ok(/Oswald/.test(LAB) && /Journal of Labor Economics/.test(LAB),
    '② 출처가 **값 옆에** 적혀 있다(저자·학술지 — 다음 사람이 다시 잴 수 있게)');
  // ★★[T244] 그 수의 **정본은 엔진**이다 — 랩의 `L_HAPPYWORK_BASE` 는 켤 때의 값이고 둘이 갈리면 빨강(사본 0).
  ok(econ.T157_HAPPYWORK_H === H, '② ★★★정본 상수 `EconEngine.T157_HAPPYWORK_H` 가 그 유도값이다(T244 — 수의 자리가 엔진)', String(econ.T157_HAPPYWORK_H));
  ok(!!m && Math.abs(+m[1] - econ.T157_HAPPYWORK_H) < 1e-12, '② ★★랩 값이 **정본 상수와 같다**(사본 0 — 갈리면 여기가 빨개진다)');
  ok(econ.HEALTH_PROD_W === 0.15,
    '② [견줌] 건강 계수는 0.15 다 — 행복(0.24)이 **더 센 지렛대**임을 표에 적었다', String(econ.HEALTH_PROD_W));
}

// ── ③ 주입 — 계수는 엔진이 안 갖는다 ───────────────────────────────────────
console.log('\n③ 계수의 자리 — 주입 한 곳 · 정본 상수 한 곳 · 서버 생활층 0');
{
  const CODE = codeOf(SRC);
  ok(!/happyWorkW\s*=[^=]/.test(CODE), '③ ★★★엔진은 `happyWorkW` 에 **값을 안 넣는다**(읽기만 — 주입은 밖에서 온다)');
  const reads = CODE.split('\n').filter((l) => l.indexOf('_world.happyWorkW') >= 0);
  ok(reads.length === 1, '③ ★주입을 **읽는 자리가 한 곳**이다(`happyWorkWOf` 안)', `${reads.length}곳`);
  ok(/const w = v && v\._world && v\._world\.happyWorkW;/.test(SRC) && /typeof w === 'number'/.test(SRC),
    '③ 읽는 길이 `world` 백참조다(T135 `forageTakeFn` 선례 — 새 배선 0)');
  // ★[T244] 계수를 **얻는 자리**도 한 줄이다 — 선언 말고 부르는 자리(생산 루프)
  const calls = CODE.split('\n').filter((l) => l.indexOf('happyWorkWOf(') >= 0 && l.indexOf('function ') < 0 && l.indexOf('happyWorkWOf,') < 0);
  ok(calls.length === 1, '③ ★[T244] 엔진이 계수를 **얻는 자리가 한 줄**이다(`const _hwW = happyWorkWOf(v)`)', `${calls.length}줄`);
  // ★[T244] 그 수가 적힌 자리도 **한 줄**이다 — 선언 하나 · 나머지는 그 이름을 부른다
  const lits = CODE.split('\n').filter((l) => /T157_HAPPYWORK_H\s*=\s*[0-9.]/.test(l));
  ok(lits.length === 1, '③ ★★[T244] 계수의 **수가 적힌 줄이 하나**다(사본 0)', `${lits.length}줄`);
  const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(VSRC.indexOf('happyWorkW') < 0,
    '③ ★★서버 생활층은 그것을 **안 심는다**(T244 뒤에도 그대로 — 기본은 생활층이 아니라 **정본 상수**가 준다)');
}

// ── ④ 되돌림 — ★[T244] 기본이 켬 · `=0` 이 종전 세계 ────────────────────────
console.log('\n④ ★[T244] 기본이 **켬**이다 — 안 준 판 = 정본 H 를 준 판 · `=0` 이 종전 세계');
{
  // hw === null 이면 **아무것도 안 준다**(= 서버·CLI 기본 팔), 수면 그 값을 주입한다(0 = 끔).
  const fp = (hw) => {
    const w = econV2.createWorldV2({ seed: 42, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
    if (hw !== null) w.happyWorkW = hw;
    const _l = console.log; console.log = () => {};
    for (let d = 0; d < 300; d++) econV2.tickWorldV2(w);
    console.log = _l;
    return w.villages.map((v) => `${v.name}:${v.npcs.length}/f${v.storage.food.toFixed(6)}/w${(v.storage.wood || 0).toFixed(6)}`).join(' ');
  };
  const off = fp(0), off2 = fp(0), on = fp(H), dflt = fp(null);
  ok(off === off2, '④ 끈 판이 스스로 재현된다(결정론)');
  ok(off !== on, '④ ★★[자명 통과 금지] 준 판은 **실제로 다르다**', on.slice(0, 44) + '…');
  ok(dflt === on, '④ ★★★[T244] **아무것도 안 준 판 = 정본 H 를 준 판** — 기본이 켬이다');
  ok(dflt !== off, '④ ★[자명 통과 금지] 그 판은 끈 판과 **실제로 다르다**');
  // 주입 0 = 랩의 "끔" 버튼 = env `L_HAPPYWORK=0` — 셋이 한 세계다(되돌림의 뿌리)
  ok(fp(0) === off, '④ ★★랩의 "끔"(`L_HAPPYWORK=0`)이 **종전 세계**다(되돌림)');
}

// ── ⑤ 곱 — 건강과 같은 자리에서 곱한다 ─────────────────────────────────────
console.log('\n⑤ 곱 — 건강 배수와 곱한다(둘 다 낮으면 둘 다 곱)');
{
  ok(/amt \*= _hpm \* _hwm \* _prodMul \* sm \*/.test(SRC),
    '⑤ ★★★한 줄에서 **건강 다음에** 곱한다(새 자리 0)');
  const CODE = codeOf(SRC);
  ok(CODE.split('\n').filter((l) => l.indexOf('_hwm') >= 0).length === 5,
    '⑤ ★`_hwm` 이 무는 줄이 **다섯뿐**이다(선언 1 + 계산 1 + 상한 기록 1 + 마지막 값 1 + 곱 1)',
    `${CODE.split('\n').filter((l) => l.indexOf('_hwm') >= 0).length}줄`);
  // 곱이라는 것 — 두 배수의 곱이 각각보다 작다(둘 다 낮을 때)
  const hp = Math.max(0.9, Math.min(1.1, 1 + (0.2 - 0.5) * econ.HEALTH_PROD_W));
  const hw = withFloorOff(() => econ.happyWorkMul(0.2, H));   // ★[T244] 곱이라는 것은 **밑에 깔린 식**의 성질 — 하한을 끄고 잰다
  ok(hp < 1 && hw < 1 && hp * hw < Math.min(hp, hw),
    '⑤ ★둘 다 낮으면 곱이 각각보다 **더 낮다**(합이 아니라 곱)', `${hp.toFixed(4)} × ${hw.toFixed(4)} = ${(hp * hw).toFixed(4)}`);
  ok(!/dailyProductionPotential\[r\][^\n]*_hwm/.test(SRC),
    '⑤ ★잠재 생산(`dailyProductionPotential`)엔 **안 곱한다**(건강과 같은 규약 — K 오염·아사 나선 방지)');
}

// ── ⑥ 돌연변이 — 이 하네스가 실패할 줄 아는가 ──────────────────────────────
console.log('\n⑥ ★이 하네스가 실패할 줄 아는가');
{
  const f = (h, w) => withFloorOff(() => econ.happyWorkMul(h, w));   // ★[T244] 폭주도 밑에 깔린 식의 성질
  // 손으로 큰 수를 적으면 — 세계가 아니라 폭주다
  const wild = f(2.07, 10);
  ok(wild >= 6, '⑥ ★★★`H` 를 10 으로 적으면 배수가 **6배까지** 벌어진다(세계가 아니라 폭주)', `×${wild.toFixed(2)}`);
  ok(f(0, 10) < 0, '⑥ ★그 판은 하한이 **음수**가 된다 — 생산이 마이너스인 세계다', String(f(0, 10)));
  // ② 의 유도 대조가 그 판에서 실제로 빨개지는가(감지기 자기검사)
  const mutLab = LAB.replace(/L_HAPPYWORK_BASE=0\.24/, 'L_HAPPYWORK_BASE=10');
  const m2 = mutLab.match(/L_HAPPYWORK_BASE=([0-9.]+)/);
  ok(mutLab !== LAB && !!m2 && Math.abs(+m2[1] - H) > 1e-9,
    '⑥ ★★랩에 10 을 적은 판을 만들면 ②의 대조가 **문다**(감지기 자기검사)');
}

// ── ⑦ 랩 배선 ──────────────────────────────────────────────────────────────
console.log('\n⑦ 랩 배선 — 훅이 세계 생성 때 설치된다');
{
  const LCODE = codeOf(LAB);
  ok(/function hwInstallHook\(\)\{ if\(!ECON_WORLD\)return; ECON_WORLD\.happyWorkW=L_HAPPYWORK; \}/.test(LCODE),
    '⑦ ★훅이 **한 줄**이다(랩에도 산수가 없다)');
  ok(/bdtInstallHooks\(\);hwInstallHook\(\);/.test(LCODE),
    '⑦ ★★`lifeInit` 이 세계를 만든 **그 자리**에서 설치한다(도적 훅과 같은 관례)');
  ok(/window\.L_HAPPYWORK/.test(LAB), '⑦ 적재 전 주입(`window.L_HAPPYWORK`)도 받는다(계측기·A/B 용)');
  ok(/id="happyWork"/.test(LAB) && /setHappyWork\(0\)/.test(LAB),
    '⑦ 눈으로 켜고 끄는 자리가 있다(끔 / H=0.24 토글)');
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  for (const k of ['happyWorkMul', 'happyWorkW', '_hwm']) ok(B.indexOf(k) >= 0, `⑦ 번들에 \`${k}\` 가 있다(3사본)`);
}

// ── ⑧ [T209 → ★T244] 하한 1 — 아래만 자른다 · **기본 켬** · 되돌림 `=0` ──────
console.log('\n⑧ ★[T209→T244] 하한 1 — 아래만 자른다 · **기본 켬** · 끄는 것은 명시 `0` 하나');
{
  const CODE = codeOf(SRC);
  // ⓐ ★★[T244] 기본 켬 — 손잡이 없이 부르면 0.5 아래가 **전부 1** 이다(벌점 0)
  ok(econ.happyFloor1On() === true, '⑧ ★★★[T244] 손잡이 미설정 = **켬**', String(econ.happyFloor1On()));
  const below = [0, 0.1, 0.2, 0.3, 0.4].map((h) => econ.happyWorkMul(h, H));
  ok(below.every((m) => m === 1), '⑧ ★★기본 팔에서 0.5 아래가 **정확히 1** — 벌점이 없다', below.map((x) => x.toFixed(3)).join(' · '));
  // ⓑ 두 팔 — 자식 프로세스로(족보 128: env 는 모듈 적재 전에 · 셸에 남은 값과 안 섞이게)
  const { execFileSync } = require('child_process');
  const probe = (env) => {
    const e = Object.assign({}, process.env, env);
    for (const k of Object.keys(env)) if (env[k] === null) delete e[k];
    return JSON.parse(execFileSync(process.execPath, ['-e',
      `const E=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))});` +
      `const H=${H};process.stdout.write(JSON.stringify({on:E.happyFloor1On(),W:E.happyWorkWOf({}),` +
      `lo:[0,0.1,0.2,0.3,0.4,0.5].map(h=>E.happyWorkMul(h,H)),hi:[0.6,0.8,1.0,2.07].map(h=>E.happyWorkMul(h,H))}));`],
      { env: e, stdio: 'pipe' }).toString());
  };
  const OFF = probe({ L_HAPPY_FLOOR1: '0' }), DFLT = probe({ L_HAPPY_FLOOR1: null }), EMPTY = probe({ L_HAPPY_FLOOR1: '' });
  ok(DFLT.on === true && DFLT.lo.every((m) => m >= 1), '⑧ ★★★켠(기본) 팔은 **배수 ≥ 1** — 벌점이 없다', DFLT.lo.map((x) => x.toFixed(3)).join(' · '));
  ok(DFLT.lo.slice(0, 5).every((m) => m === 1), '⑧ ★아래는 **정확히 1** 에서 멈춘다(중립값 · 새 수 0)');
  ok(JSON.stringify(DFLT.hi) === JSON.stringify(OFF.hi), '⑧ ★★위쪽은 **한 톨도 안 바뀐다**(보너스·상한 그대로)', OFF.hi.map((x) => x.toFixed(4)).join(' · '));
  // ★★켠 판은 끈 판을 **1 에서 자른 것뿐**이다 — 식을 여기 베끼지 않고 두 팔의 관계로 말한다(사본 0)
  ok(DFLT.lo.every((m, i) => m === Math.max(1, OFF.lo[i])),
    '⑧ ★★★켠 판 = 끈 판을 **1 에서 자른 것**뿐이다(항마다 대조 · 식 사본 0)');
  ok(OFF.lo.some((m) => m < 1), '⑧ ★[자명 통과 금지] 끈 판은 **실제로 1 아래**가 있다', OFF.lo.map((x) => x.toFixed(3)).join(' · '));
  // ⓒ 끄는 문법 — **명시 `0` 하나**다. 미설정·빈 값은 켬(T209 의 반대 · T244 확정)
  ok(OFF.on === false, '⑧ ★★되돌림 — `L_HAPPY_FLOOR1=0` 이면 **끔**(종전 줄 하나만 돈다)');
  ok(DFLT.on === true && EMPTY.on === true, '⑧ ★★[T244] 미설정·빈 값은 **켬**이다(끄는 것은 명시 `0` 하나)', `미설정 ${DFLT.on} · 빈 값 ${EMPTY.on}`);
  ok(JSON.stringify(OFF.lo) === JSON.stringify(withFloorOff(() => [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((h) => econ.happyWorkMul(h, H)))),
    '⑧ ★자식 프로세스(env)와 같은 프로세스(호출 때 읽기)가 **같은 수**를 낸다(손잡이 문법 하나)');
  // ⓓ 자리 — 한 곳에서만 자른다 · 종전 식 줄은 손 안 댔다
  ok(CODE.split('\n').filter((l) => l.indexOf('happyFloor1On()') >= 0 && l.indexOf('function ') < 0).length === 1,
    '⑧ ★하한이 무는 자리가 **한 줄**이다(선언 말고 부르는 자리 — 부르는 쪽은 무접촉)');
  ok(/return Math\.max\(1 - W \* 0\.5, Math\.min\(1 \+ W \* 0\.5, 1 \+ \(happiness - 0\.5\) \* W\)\);/.test(SRC),
    '⑧ ★★종전 식 줄은 **글자 그대로 남아 있다**(끄면 그 줄만 돈다)');
  ok(/happyFloor1On/.test(fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8')),
    '⑧ ★번들에 따라왔다(3사본)');
  ok(/happyFloor1On/.test(LAB), '⑧ ★랩 인라인 번들에도 따라왔다(랩은 손잡이를 **안 심는다** — 미설정 = 켬 = 서버 기본)');
  ok(!/window\.L_HAPPY_FLOOR1\s*=\s*['"]?0['"]?/.test(codeOf(LAB)),
    '⑧ ★★[T244] 랩이 그것을 **끈 채 뜨지 않는다**(랩만 끈 판이면 랩 팔이 서버 팔이 아니다 — T221 의 교훈)');
}

// ── ⑨ [T244] 기본 켬 — 계수의 순서와 되돌림 ────────────────────────────────
//   ★왜 `happyWorkWOf` 는 셋을 순서대로 본다: ⓐ `world.happyWorkW` 주입(A/B·랩 토글·계측기) →
//     ⓑ 손잡이 `L_HAPPYWORK`(랩 window → env) → ⓒ **정본 상수**(미설정 = 켬). 그 순서가 뒤집히면
//     A/B 계측기가 켠 판을 재고 있다고 착각한다(T196 랩 팔이 그렇게 새어 T221 을 낳았다).
console.log('\n⑨ ★[T244] 기본 켬 — 주입 > 손잡이 > 정본 상수 · 되돌림 `=0`');
{
  const { execFileSync } = require('child_process');
  const W = (env) => {
    const e = Object.assign({}, process.env);
    for (const k of Object.keys(env)) { if (env[k] === null) delete e[k]; else e[k] = env[k]; }
    return JSON.parse(execFileSync(process.execPath, ['-e',
      `const E=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))});` +
      `process.stdout.write(JSON.stringify({none:E.happyWorkWOf({}),inj0:E.happyWorkWOf({_world:{happyWorkW:0}}),` +
      `inj9:E.happyWorkWOf({_world:{happyWorkW:0.9}}),C:E.T157_HAPPYWORK_H}));`],
      { env: e, stdio: 'pipe' }).toString());
  };
  const D = W({ L_HAPPYWORK: null }), Z = W({ L_HAPPYWORK: '0' }), K = W({ L_HAPPYWORK: '0.5' });
  ok(D.none === D.C && D.C > 0, '⑨ ★★★미설정이면 **정본 상수**를 쓴다(= 켬)', `${D.none} = T157_HAPPYWORK_H`);
  ok(Z.none === 0, '⑨ ★★되돌림 — `L_HAPPYWORK=0` 이면 계수 **0**(배수 1 · 종전 비트)', String(Z.none));
  ok(K.none === 0.5, '⑨ ★손잡이에 수를 주면 그 수다(A/B 팔)', String(K.none));
  ok(D.inj9 === 0.9 && K.inj9 === 0.9 && Z.inj9 === 0.9,
    '⑨ ★★주입(`world.happyWorkW`)이 **손잡이보다 세다** — 셋 다 0.9(계측기·랩 토글이 항상 이긴다)');
  ok(D.inj0 === 0 && K.inj0 === 0, '⑨ ★★주입 0 은 **끔**이다(랩 "끔" 버튼이 기본을 이긴다)');
  ok(econ.happyWorkMul(0.2, Z.none) === 1 && econ.happyWorkMul(0.9, Z.none) === 1,
    '⑨ ★★계수 0 이면 배수가 **1** 이다(되돌림의 뿌리 — 위아래 둘 다)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
