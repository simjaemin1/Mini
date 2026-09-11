#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-lab-happywork.js — 행복이 높으면 더 일한다 (T157 랩 → T165 이식) ===
//
// ★왜 [재민 물음 2026-09-05 → PM 판정 2026-09-07 · 지시 T157]
//   *"행복이 오로지 리비히 상한 역할만? 높으면 더 좋아지는 것도 있어야."*
//   여태 행복은 연속 항 `(happiness−0.5)×0.6` 으로 **인구에만** 닿았다. 건강은 이미
//   `_hpm`(±10%)으로 작업량에 닿는다. T157 은 그 문법을 그대로 빌려 행복을 작업량에 잇는다.
//
// ★★이 하네스가 지키는 것
//   ① 문법     : 0.5 가 중립(배수 1) · 대칭(0.3 ↔ 0.7) · 상한은 `H` 자신(`1 ± H/2` · 새 수 0)
//   ② 유도     : `H = 0.24` 를 출처의 관측(+12%)에서 **다시 유도해도 같다**(T165: 엔진 정본 상수)
//   ③ 정본     : 계수는 **엔진에 하나**뿐이다 — 랩엔 수가 없고(번들로 읽는다) 서버는 손잡이로만 켠다
//   ④ 되돌림   : 손잡이가 꺼져 있으면(기본) 세계가 **비트 동일** · 켜면 실제로 다르다
//   ⑤ 곱       : 건강 배수와 **곱한다**(둘 다 낮으면 둘 다 곱) — 같은 자리 한 줄
//   ⑥ 돌연변이 : `H` 를 10 으로 적으면 배수가 6배까지 벌어진다(세계가 아니라 폭주) → 빨강
//   ⑦ 랩 배선  : 랩 `L_HAPPYWORK_BASE` 가 유도값과 같다 · 훅이 `lifeInit` 에서 설치된다
//
// 실행: node scripts/test-lab-happywork.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t157-hz-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const LAB = fs.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8');
// ★줄 주석을 **먼저** 지우고 블록 주석을 지운다(T100 5판 수리 — `// … sim/* …` 함정).
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');

// 출처가 잰 수 — 이 하네스가 유일하게 손으로 적는 것이고, ②가 이것으로 `H` 를 다시 만든다.
const SRC_GAIN = 0.12;   // Oswald·Proto·Sgroi 2015, JOLE 33(4) 초록: "approximately 12% greater productivity"
const H = 0.24;
const KNOB = process.env.T157_HAPPYWORK === '1';   // 이 판에서 손잡이가 켜져 있나(기본은 꺼짐)

console.log('\n=== 행복이 높으면 더 일한다 (T157 · 랩) ===');

// ── ① 문법 — 건강과 같은 꼴 ────────────────────────────────────────────────
console.log('\n① 문법 — 0.5 중립 · 대칭 · 상한은 H 자신');
{
  const f = econ.happyWorkMul;
  pre(typeof f === 'function', '순수 함수 `happyWorkMul(happiness, W)` 이 노출돼 있다');
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
  ok(Math.abs(econ.T157_HAPPYWORK_H - H) < 1e-12,
    '② ★★★[T165] 엔진 정본 상수가 그 유도값이다', String(econ.T157_HAPPYWORK_H));
  ok(/Oswald/.test(SRC) && /Journal of Labor Economics/.test(SRC),
    '② 출처가 **정본 값 옆에** 적혀 있다(저자·학술지 — 다음 사람이 다시 잴 수 있게)');
  // ★랩엔 수가 없어야 한다 — 엔진 블록(자동 생성물) 밖만 본다
  const LOWN = LAB.slice(0, LAB.indexOf('ENGINE-BUNDLE-START')) + LAB.slice(LAB.indexOf('ENGINE-BUNDLE-END'));
  ok(!/L_HAPPYWORK_BASE\s*=\s*[0-9]/.test(LOWN) && /L_HAPPYWORK_BASE=\(typeof EconEngine/.test(LOWN),
    '② ★★[T165] 랩엔 **수가 없다** — `EconEngine.T157_HAPPYWORK_H` 를 읽는다(사본 0)');
  ok(econ.HEALTH_PROD_W === 0.15,
    '② [견줌] 건강 계수는 0.15 다 — 행복(0.24)이 **더 센 지렛대**임을 표에 적었다', String(econ.HEALTH_PROD_W));
}

// ── ③ 주입 — 계수는 엔진이 안 갖는다 ───────────────────────────────────────
console.log('\n③ 정본 — 계수는 엔진에 하나뿐이다(T165 이식)');
{
  const CODE = codeOf(SRC);
  ok((CODE.match(/const T157_HAPPYWORK_H = [0-9.]+;/g) || []).length === 1,
    '③ ★★★정본 상수가 **한 줄**이다');
  ok(/const T157_HAPPYWORK = process\.env\.T157_HAPPYWORK === '1';/.test(CODE),
    '③ ★손잡이가 env 한 줄이고 **기본이 끔**이다(비트 동일의 뿌리)');
  ok(econ.T157_HAPPYWORK === KNOB,
    KNOB ? '③ ★[손잡이 켠 판] env 가 실제로 읽힌다' : '③ ★★기본 판에서 손잡이가 실제로 꺼져 있다(실기 0)',
    String(econ.T157_HAPPYWORK));
  const reads = CODE.split('\n').filter((l) => /_world\.happyWorkW/.test(l));
  ok(reads.length === 1, '③ ★덮어쓰기(`world.happyWorkW`)를 읽는 자리가 **한 곳**이다', `${reads.length}곳`);
  ok(econ.happyWorkWOf({}) === (KNOB ? H : 0),
    KNOB ? '③ ★손잡이 켬 → 계수가 정본 H 다' : '③ ★★손잡이 끔 → 계수 0', String(econ.happyWorkWOf({})));
  ok(econ.happyWorkWOf({ _world: { happyWorkW: 0 } }) === 0,
    '③ ★★덮어쓰기 0 은 **손잡이보다 세다**(랩의 "끔" 이 언제나 끈다)');
  ok(econ.happyWorkWOf({ _world: { happyWorkW: econ.T157_HAPPYWORK_H } }) === econ.T157_HAPPYWORK_H,
    '③ 덮어쓰기는 A/B·랩 토글의 길이다(값은 여전히 정본에서 읽는다)');
  const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(VSRC.indexOf('happyWorkW') < 0, '③ ★★생활층은 계수를 **안 만진다**(엔진 한 곳)');
}

// ── ④ 되돌림 — 주입이 없으면 비트 동일 ─────────────────────────────────────
console.log('\n④ 되돌림 — 주입이 없으면 세계가 한 톨도 안 바뀐다');
{
  const fp = (hw) => {
    const w = econV2.createWorldV2({ seed: 42, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
    if (hw != null) w.happyWorkW = hw;
    const _l = console.log; console.log = () => {};
    for (let d = 0; d < 300; d++) econV2.tickWorldV2(w);
    console.log = _l;
    return w.villages.map((v) => `${v.name}:${v.npcs.length}/f${v.storage.food.toFixed(6)}/w${(v.storage.wood || 0).toFixed(6)}`).join(' ');
  };
  // 덮어쓰기 0 = 확실히 끈 세계(손잡이 상태와 무관) · 덮어쓰기 H = 확실히 켠 세계
  const off = fp(0), off2 = fp(0), on = fp(H);
  ok(off === off2, '④ 끈 판이 스스로 재현된다(결정론)');
  ok(KNOB || fp(null) === off, '④ ★★[기본 판] 덮어쓰기를 아예 안 줘도 끈 세계다(기본 끔)');
  ok(off !== on, '④ ★★[자명 통과 금지] 켠 판은 **실제로 다르다**', on.slice(0, 44) + '…');
  ok(fp(0) === off, '④ ★★랩의 "끔"(덮어쓰기 0)이 **손잡이 끔과 같다**');
  // ★손잡이(env)로 켠 판 = 덮어쓰기로 켠 판 — 두 길이 같은 세계로 간다
  const child = execFileSync(process.execPath, ['-e',
    `process.env.T157_HAPPYWORK='1';const V2=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2.js'))});` +
    `const w=V2.createWorldV2({seed:42,villageCount:5,namePool:['가','나','다','라','마'],infoRange:5000,raidPer100:0.005,picker:'rational'});` +
    `const _l=console.log;console.log=()=>{};for(let d=0;d<300;d++)V2.tickWorldV2(w);console.log=_l;` +
    `process.stdout.write('FP:'+w.villages.map(v=>v.name+':'+v.npcs.length+'/f'+v.storage.food.toFixed(6)+'/w'+(v.storage.wood||0).toFixed(6)).join(' '));`],
    { env: Object.assign({}, process.env, { T157_HAPPYWORK: '1' }), stdio: 'pipe' }).toString().split('FP:')[1] || 'NONE';
  ok(child === on, '④ ★★★손잡이(env)로 켠 세계 = 덮어쓰기로 켠 세계 (두 길이 **같은 수**를 쓴다)', child.slice(0, 40) + '…');
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
  const hw = econ.happyWorkMul(0.2, H);
  ok(hp < 1 && hw < 1 && hp * hw < Math.min(hp, hw),
    '⑤ ★둘 다 낮으면 곱이 각각보다 **더 낮다**(합이 아니라 곱)', `${hp.toFixed(4)} × ${hw.toFixed(4)} = ${(hp * hw).toFixed(4)}`);
  ok(!/dailyProductionPotential\[r\][^\n]*_hwm/.test(SRC),
    '⑤ ★잠재 생산(`dailyProductionPotential`)엔 **안 곱한다**(건강과 같은 규약 — K 오염·아사 나선 방지)');
}

// ── ⑥ 돌연변이 — 이 하네스가 실패할 줄 아는가 ──────────────────────────────
console.log('\n⑥ ★이 하네스가 실패할 줄 아는가');
{
  const f = econ.happyWorkMul;
  // 손으로 큰 수를 적으면 — 세계가 아니라 폭주다
  const wild = f(2.07, 10);
  ok(wild >= 6, '⑥ ★★★`H` 를 10 으로 적으면 배수가 **6배까지** 벌어진다(세계가 아니라 폭주)', `×${wild.toFixed(2)}`);
  ok(f(0, 10) < 0, '⑥ ★그 판은 하한이 **음수**가 된다 — 생산이 마이너스인 세계다', String(f(0, 10)));
  // ② 의 유도 대조가 그 판에서 실제로 빨개지는가(감지기 자기검사) — T165 부터는 **엔진 정본**을 변조한다
  const mutSrc = SRC.replace('const T157_HAPPYWORK_H = 0.24;', 'const T157_HAPPYWORK_H = 10;');
  const m2 = mutSrc.match(/const T157_HAPPYWORK_H = ([0-9.]+);/);
  ok(mutSrc !== SRC && !!m2 && Math.abs(+m2[1] - H) > 1e-9,
    '⑥ ★★정본에 10 을 적은 판을 만들면 ②의 대조가 **문다**(감지기 자기검사)', m2 ? m2[1] : '없다');
  ok((SRC.match(/T157_HAPPYWORK_H/g) || []).length >= 3,
    '⑥ 정본 이름이 실제로 쓰인다(선언·계수·내보내기 — 죽은 상수가 아니다)');
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
  ok(/id="happyWork"/.test(LAB) && /setHappyWork\(0\)/.test(LAB) && /setHappyWork\(-1\)/.test(LAB),
    '⑦ 눈으로 켜고 끄는 자리가 있다(끔 / 정본 H 토글 — 라벨의 수도 정본에서 온다)');
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  for (const k of ['happyWorkMul', 'happyWorkW', '_hwm', 'T157_HAPPYWORK_H']) ok(B.indexOf(k) >= 0, `⑦ 번들에 \`${k}\` 가 있다(3사본)`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
