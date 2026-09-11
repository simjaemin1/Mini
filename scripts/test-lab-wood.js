#!/usr/bin/env node
// @regress
// === scripts/test-lab-wood.js — T166 목재는 벤 만큼만 (벌목 소득의 대체) ===========
//
// 실체→회계 넷째 칸. 밭(T100)·사냥(T146/T154)·채집(T135)에 이어 **벌목**이다.
// 벌목꾼은 이미 `forestRich` 를 **실제로 깎는다**(T123) — 실체는 있고 장부만 없었다.
//
//  ① 주입 문      엔진 규약(`priceFn`·`huntIncomeFn` 과 같은 꼴) · 한 자리 · 나무꾼에만
//  ② 대체         `baseAmt` 를 덮어쓴다(추상 위에 얹지 않는다)
//  ③ 단위         **랩이 이미 정한 환산**을 쓴다(11305행: L_CHOP richness = 0.9×baseWood econ)
//  ④ 그루당       종별 `wood` 계수 × 크기(=richness/K) — 새 수 0
//  ⑤ 하루 경계    어제 벤 것을 확정하고 오늘을 0 에서 센다(누계 아님)
//  ⑥ 되돌림       `L_WOODINCOME=abstract`(기본) = 종전 비트
//  ⑦ 셈이 맞나    나무꾼 0 → 소득 0 · 숲 0 → 벤 것 0 → 소득 0
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LABP = path.join(ROOT, 'lab', '전쟁실험실.html');
const LAB = fs.readFileSync(LABP, 'utf8');
const ENG = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function bodyOf(name, src) {
  const S = src || LAB;
  const i = S.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('`' + name + '` 이 없다');
  const o = S.indexOf('{', i);
  let d = 0, j = o;
  for (; j < S.length; j++) { const c = S[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
  return S.slice(o, j + 1);
}

console.log('=== 목재는 벤 만큼만 (T166) ===');

// ── ① 주입 문 ───────────────────────────────────────────────────────────────
sec('① 주입 문 — 엔진 규약 그대로 · 한 자리 · 나무꾼에만');
{
  const e = strip(ENG);
  ok(/typeof v\._world\.woodIncomeFn === 'function'/.test(e),
    '★★① `priceFn`·`huntIncomeFn` 과 **같은 규약**이다(world 에 심겼을 때만 산다)');
  ok(/currentJob === 'lumberjack' && v\._world/.test(e),
    '★★① 나무꾼에만 걸린다(농부·어부·사냥·채집 무접촉)');
  ok((e.match(/woodIncomeFn/g) || []).length <= 3, '★★① 주입 문은 **한 자리**뿐이다(사본 0)',
    `${(e.match(/woodIncomeFn/g) || []).length}회`);
  //   ★사냥 주입 문이 그대로 살아 있다(이 카드가 앞 카드를 안 깨뜨렸다)
  ok(/typeof v\._world\.huntIncomeFn === 'function'/.test(e),
    '★① 그리고 T154 사냥 주입 문이 **그대로 있다**');
}

// ── ② 대체(얹기 0) ──────────────────────────────────────────────────────────
sec('② 대체 — 추상을 덮어쓴다(얹지 않는다)');
{
  const e = strip(ENG);
  const i = e.indexOf('woodIncomeFn');
  const around = e.slice(Math.max(0, i - 200), i + 400);
  ok(/baseAmt = _wi/.test(around), '★★② `baseAmt` 를 **덮어쓴다**(부산물도 같은 수를 따라간다)');
  ok(!/addProduce\(/.test(around), '★★② 그 자리에서 **따로 더 넣지 않는다**(가산이면 추상이 남는다)');
}

// ── ③④ 단위·그루당 — 새 수 0 ───────────────────────────────────────────────
sec('③④ 단위와 그루당 — **랩이 이미 정한 환산**을 쓴다(새 수 0)');
{
  //   ★랩의 정본 환산: woodSustain 이 "L_CHOP richness = 0.9×baseWood econ" 을 쓴다
  const sus = LAB.match(/woodSustain=\+\(regen\*\(0\.9\*\(s\.baseWood\|\|1\)\/L_CHOP\)\)/);
  ok(!!sus, '③ 전제 — 랩에 **환산 정본**이 있다(`woodSustain`)', sus ? sus[0].slice(0, 60) : '못 찾음');
  //   ★적립 자리가 그 환산을 글자 그대로 쓴다
  const acc = LAB.match(/s\._wcut=\(s\._wcut\|\|0\)\+\(\(_r0-_r1\)\/L_CHOP\)\*0\.9\*\(s\.baseWood\|\|1\)\*\(\(_T&&_T\.wood\)\|\|0\)/);
  ok(!!acc, '★★③ 소득 적립이 **같은 환산**을 쓴다(fuelK 상한과 다른 말을 안 한다)');
  ok(!!acc, '★★④ 그리고 **종별 `wood` 계수**를 곱한다(머루 0.10 과 소나무 1.00 은 다른 목재다)');
  //   ★크기는 richness 차이 그 자체다 — U(0,1) 주사위를 새로 굴리지 않는다
  const accStr = acc ? acc[0] : '';
  ok(!/Math\.random/.test(accStr), '★★④ 크기에 **주사위가 없다**(벤 richness 가 곧 그루×크기다)');
  //   ★소득 함수 본문에 새 수 0
  const inc = strip(bodyOf('woodIncomeReal'));
  const lits = (inc.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0');
  ok(lits.length === 0, '★★④ 소득 함수 본문에 **새 수가 0개**', lits.join(',') || '0개');
  //   ★그리고 **실제로 깎은 그 자리**에서 센다(따로 다시 계산하지 않는다)
  const chop = LAB.slice(LAB.indexOf("if(a.job==='lumberjack')"), LAB.indexOf("if(a.job==='lumberjack')") + 1400);
  ok(/_r0-_r1/.test(chop) && /_wcut/.test(chop),
    '★★③ 적립은 **richness 를 실제로 뺀 그 자리**에서 한다(사본 0)');
}

// ── ⑤ 하루 경계 ────────────────────────────────────────────────────────────
sec('⑤ 하루 경계 — 어제 벤 것을 확정하고 오늘을 0 으로');
{
  const d = strip(bodyOf('lifeDayAll')).replace(/\s/g, '');
  ok(/ev\._wcutDay=vil\._wcut\|\|0;vil\._wcut=0/.test(d),
    '★★⑤ 어제치를 확정하고 **오늘을 0 으로** 되돌린다(누계가 아니다)');
  ok(/ECON_WORLD\.woodIncomeFn=/.test(d), '★★⑤ 주입은 **하루 경계 한 줄**이다');
  ok(/'real'/.test(strip(bodyOf('lifeDayAll'))), "★⑤ `real` 일 때만 심는다(abstract 면 안 심는다 = 비트 동일)");
  //   ★사냥 쪽 하루 경계가 그대로 살아 있다
  ok(/ev\._hkillDay=vil\._hkill\|\|0;vil\._hkill=0/.test(d), '★⑤ 그리고 T154 사냥 하루 경계가 **그대로**다');
}

// ── ⑥ 되돌림 ───────────────────────────────────────────────────────────────
sec('⑥ 되돌림 — 기본이 abstract(= 종전 비트)');
{
  const m = bodyOf('_woodIncomeMode');
  ok(/'abstract'/.test(m), "★★⑥ 기본이 **`abstract`** 다(안 켜면 종전 비트)");
  ok(/window\.L_WOODINCOME/.test(m), '★⑥ 손잡이 이름은 `L_WOODINCOME` · **부를 때** 읽는다');
}

// ── ⑦ 셈 ───────────────────────────────────────────────────────────────────
sec('⑦ 셈 — 나무꾼 0 → 소득 0 · 벤 것 0 → 소득 0');
{
  const inc = strip(bodyOf('woodIncomeReal'));
  ok(/if\(!\(ln>0\)\)return0;/.test(inc.replace(/\s/g, '')),
    '★★⑦ 나무꾼이 0 이면 **소득 0**(0 으로 안 나눈다)');
  ok(/cut\/ln/.test(inc.replace(/\s/g, '')), '★★⑦ 소득 = **벤 목재 ÷ 나무꾼 수**(1인분)');
  ok(/v\._wcutDay\|\|0/.test(inc.replace(/\s/g, '')),
    '★★⑦ 그리고 **그날 벤 것**을 읽는다(숲이 0 이면 벤 것도 0 ⇒ 소득 0 — 고갈이 보인다)');
  //   ★★실기 — 함수를 그대로 불러 본다(자명 통과 금지)
  //   랩 소스에서 **그 함수 본문 그대로** 떼어 돌린다(사본 0 — 다시 적지 않는다)
  const _i = LAB.indexOf('function woodIncomeReal');
  const _b = bodyOf('woodIncomeReal');
  const src = LAB.slice(_i, LAB.indexOf(_b, _i) + _b.length);
  const f = new Function('return (' + src + ')')();
  ok(f({ _wcutDay: 6, counts: { lumberjack: 3 } }) === 2, '★★⑦ 6 ÷ 3 = 2', `${f({ _wcutDay: 6, counts: { lumberjack: 3 } })}`);
  ok(f({ _wcutDay: 6, counts: { lumberjack: 0 } }) === 0, '★★⑦ 나무꾼 0 → 0');
  ok(f({ _wcutDay: 0, counts: { lumberjack: 3 } }) === 0, '★★⑦ 벤 것 0 → 0(숲 고갈이 소득에 보인다)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
