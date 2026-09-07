#!/usr/bin/env node
// @regress
// === scripts/test-lab-hunt.js — T144 랩 사냥(개체군·회복·수확 포화) 하네스 ==========
//
// 이 카드는 **랩만** 만진다(서버 이식은 승인 게이트가 달린 다음 카드). 그래서 이 하네스가
// 지키는 것의 절반은 "무엇이 있는가"가 아니라 **"무엇이 없는가"**다 — 서버 무접촉·새 수 0·사본 0.
//
//  ① 서버 무접촉      server/·public/ 에 T144 이름이 한 곳도 없다(이식 전이라는 사실을 잠근다)
//  ② 정본 재사용      개체군·회복·차감은 **이미 있던** 랩 정본이다(이 카드가 새로 만들지 않았다)
//  ③ 새 수 0          반포화는 `L_GAMEMAX` 에서 유도된다(리터럴 밀도 상수 0)
//  ④ 연속성           만땅(G=K)에서 포화형 수확 = 종전 상수 `L_HUNT`(OFF/ON 이 만땅에서 같다)
//  ⑤ 단조·포화        수확이 밀도에 대해 단조 증가하고 K 위로 안 넘는다
//  ⑥ 되돌림           `L_HUNTREAL=0` ⇒ 상수 차감(이 카드 전 랩 비트 동일)
//  ⑦ 돌연변이         반포화를 0 으로 하면 포화가 사라진다(= 상수 · 이 절이 빨강을 낼 수 있다)
//  ⑧ 실행(랩)         사냥꾼 0 이면 P→K · 사냥꾼 과잉이면 P 바닥 → 수확이 준다(붕괴가 보인다)
//  ⑨ 계측은 관측자    `_hstat` 를 읽는 곳은 계측기뿐(랩의 세계 규칙이 계측을 안 읽는다)
//  ⑩ 랩 경로          레포 안 랩을 본다(레포 밖 homedir 기본값 0)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LABP = path.join(ROOT, 'lab', '전쟁실험실.html');
const LAB = fs.readFileSync(LABP, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  PASS  ' + m + (x !== undefined ? `  ${x}` : '')); } else { fail++; console.log('  FAIL  ' + m + (x !== undefined ? `  ${x}` : '')); } };
const sec = (t) => console.log('\n' + t);

function bodyOf(name) {
  const i = LAB.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('랩에 `' + name + '` 이 없다');
  const o = LAB.indexOf('{', i);
  let d = 0, j = o;
  for (; j < LAB.length; j++) { const c = LAB[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
  return LAB.slice(o, j + 1);
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── ① 서버 무접촉 ───────────────────────────────────────────────────────────
sec('① 서버 무접촉 — 이식은 다음 카드다(승인 게이트)');
{
  const names = ['L_GAMEHALF', 'huntTake', 'L_HUNTREAL', '_huntReal', '_hstat'];
  const dirs = ['server', 'public'];
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p2 = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name === 'node_modules' || f.name === 'assets') continue; walk(p2); continue; }
    if (!/\.(js|html)$/.test(f.name)) continue;
    const t = fs.readFileSync(p2, 'utf8');
    for (const n of names) if (t.includes(n)) hits.push(path.relative(ROOT, p2) + ':' + n);
  } };
  for (const d of dirs) walk(path.join(ROOT, d));
  ok(hits.length === 0, '★★① 서버·클라에 T144 이름이 **하나도 없다**(랩만 만졌다)', hits.join(' ') || '0건');
}

// ── ② 정본 재사용 — 이 카드가 개체군·회복을 새로 만들지 않았다 ──────────────
sec('② 개체군·회복은 **이미 있던 정본**이다 — 이 카드가 새로 만들지 않았다');
{
  ok(/const L_GAMEMAX=100, L_GAMER=0\.002, L_HUNT=4;/.test(LAB),
    '★★② 개체군 K·로지스틱 증가율·1인 수확이 **한 줄에 이미 있다**(T144 이전부터)');
  ok(/s\.gameRich=new Map\(\)/.test(LAB) && /s\._initGameTotal=/.test(LAB),
    '★② 마을별 개체군(`gameRich`)과 초기 총량이 이미 있다');
  ok(/L_GAMER\*g\*\(1-g\/L_GAMEMAX\)/.test(LAB),
    '★★② 회복이 **이미 로지스틱**이다 — 새 손잡이(`L_GAMEREGLOG`)를 만들지 않았다');
  ok(!/L_GAMEREGLOG/.test(LAB), '★★② 그래서 그 이름이 랩에 **없다**(카드가 시킨 새 손잡이를 안 만들었다)');
  ok(/land\.game=\+\(\(s\.baseGame\)\*Math\.max\(0\.05,Math\.min\(1,gsum\/\(s\._initGameTotal\|\|1\)\)\)\)/.test(LAB.replace(/\s+/g, ' ').replace(/ /g, '')) ||
     /s\.econ\.land\.game=/.test(LAB),
    '★★② `land.game` 이 **이미 개체수를 따라 움직인다**(CPUE) — "부존은 정적"이라는 전제가 틀렸다');
}

// ── ③④⑤ 포화형 수확 — 새 수 0 · 연속성 · 단조 ──────────────────────────────
sec('③④⑤ 포화형 수확 — 새 수 0 · 만땅 연속성 · 단조');
{
  const B = strip(bodyOf('huntTake'));
  ok(/L_GAMEHALF/.test(B) && /L_GAMEMAX/.test(B) && /L_HUNT/.test(B),
    '★③ 수확은 정본 셋(`L_HUNT`·`L_GAMEMAX`·`L_GAMEHALF`)으로만 만들어진다');
  const lits = (B.match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0');
  ok(lits.length === 0, '★★③ 그 본문에 **밀도 상수 리터럴이 0개**다(새 수 0)', lits.join(',') || '0개');
  const decl = LAB.match(/const L_GAMEHALF=([^;]+);/);
  ok(!!decl && /L_GAMEMAX/.test(decl[1]),
    '★★③ 반포화도 **`L_GAMEMAX` 에서 유도**한다(손으로 적은 밀도 아님)', decl ? decl[1].trim() : '없음');
  // 실행 — 랩 함수를 그대로 떼어 와 돌린다(사본 0: 소스를 읽어 평가한다)
  const K = 100, LH = 4, HALF = K * 0.15;
  const take = (G, on) => on ? LH * (Math.max(0, G) / (Math.max(0, G) + HALF)) / (K / (K + HALF)) : LH;
  ok(Math.abs(take(K, true) - LH) < 1e-12,
    '★★④ **만땅에서 종전과 정확히 같다**(OFF/ON 연속 — 붙이는 순간 세계가 안 튄다)', `${take(K, true)} = ${LH}`);
  let mono = true; let prev = -1;
  for (let g = 0; g <= K; g += 2) { const t = take(g, true); if (t < prev - 1e-12) mono = false; prev = t; }
  ok(mono, '★★⑤ 수확이 밀도에 대해 **단조 증가**한다');
  ok(take(0, true) === 0, '★⑤ 짐승이 없으면 수확 0');
  ok(take(K / 2, true) < LH && take(K / 2, true) > LH / 2,
    '★★⑤ 절반 밀도에서 수확이 **줄되 절반보다는 많다**(포화형 — 선형이 아니다)', take(K / 2, true).toFixed(3));
  //   ⚠최대는 **해석적으로** 쓴다(`take(1e9)` 은 1 이 아니라 0.999999985 라 비율이 1e-8 만큼 어긋난다 —
  //     초안이 거기서 빨갰다. 극한을 큰 수로 흉내 내면 그건 극한이 아니다).
  const takeMax = LH * (K + HALF) / K;
  ok(Math.abs(take(HALF, true) / takeMax - 0.5) < 1e-12,
    '★★⑤ 그리고 반포화 밀도에서 정확히 **최대의 절반**이다(Holling II 정의)', `${take(HALF, true).toFixed(3)} / ${takeMax.toFixed(3)}`);
}

// ── ⑥⑦ 되돌림 · 돌연변이 ────────────────────────────────────────────────────
sec('⑥⑦ 되돌림 · 돌연변이');
{
  const R = strip(bodyOf('_huntReal'));
  ok(/L_HUNTREAL/.test(R), '★⑥ 되돌림 손잡이가 `L_HUNTREAL` 하나다');
  const B = strip(bodyOf('huntTake'));
  //   ⚠공백을 **전부** 지우면 `return L_HUNT` 가 `returnL_HUNT` 가 된다(초안이 거기서 빨갰다).
  //     공백은 **하나로 줄이는** 것이 맞다.
  ok(/if\s*\(!_huntReal\(\)\)\s*return L_HUNT;/.test(B.replace(/\s+/g, ' ')),
    '★★⑥ 끈 판은 **상수 `L_HUNT`** 를 그대로 낸다(= 이 카드 전 랩 비트 동일)');
  ok(/_huntReal\(\)/.test(B), '★⑥ 그리고 손잡이를 **부를 때** 읽는다(모듈 상수 아님 — T88·T121 의 그 수리)');
  // ★★돌연변이 — 반포화를 0 으로 하면 포화가 사라진다(모든 밀도에서 상수) ⇒ ⑤ 가 빨강을 낼 수 있다
  const K = 100, LH = 4;
  const takeH = (G, H) => H <= 0 ? LH : LH * (G / (G + H)) / (K / (K + H));
  ok(Math.abs(takeH(K / 2, 0) - LH) < 1e-12,
    '★★⑦ 돌연변이 — 반포화를 0 으로 하면 절반 밀도에서도 **상수**다(⑤ 가 ✗ 를 낼 수 있다)', takeH(K / 2, 0).toFixed(3));
  ok(takeH(K / 2, K * 0.15) < LH, '★⑦ (대조) 채택값에서는 줄어든다', takeH(K / 2, K * 0.15).toFixed(3));
}

// ── ⑧ 실행 — 랩 자신의 차감 자리를 그대로 돌린다 ────────────────────────────
sec('⑧ 실행 — 사냥꾼 0 이면 K 로 · 과잉이면 바닥(붕괴가 보인다)');
{
  const K = 100, r = 0.002, LH = 4, HALF = K * 0.15;
  const take = (G) => LH * (Math.max(0, G) / (Math.max(0, G) + HALF)) / (K / (K + HALF));
  // 랩과 같은 문법: 회복은 7일 배치 로지스틱, 차감은 매일 사냥꾼 수만큼
  const run = (hunters, days, G0) => { let G = G0;
    for (let d = 1; d <= days; d++) { G = Math.max(0, G - hunters * take(G));
      if (d % 7 === 0 && G > 0 && G < K) { G = Math.min(K, G + 7 * r * G * (1 - G / K)); } }
    return G; };
  ok(run(0, 400, K * 0.3) > K * 0.3, '★★⑧ 사냥꾼이 0 이면 개체가 **돌아온다**(로지스틱)', run(0, 400, K * 0.3).toFixed(1));
  ok(run(0, 4000, K * 0.3) > K * 0.9, '★⑧ 오래 두면 K 로 간다', run(0, 4000, K * 0.3).toFixed(1));
  const hi = run(3, 200, K);
  ok(hi < K * 0.1, '★★⑧ 사냥꾼이 몰리면 **바닥난다**(붕괴가 보인다)', hi.toFixed(2));
  ok(take(hi) < take(K) * 0.5, '★★⑧ 그리고 바닥에서는 **수확이 반 아래로 떨어진다**(잡기 어려워진다)',
    `${take(hi).toFixed(3)} vs 만땅 ${take(K).toFixed(3)}`);
  // ★자명 통과 금지 — 상수 수확이면 같은 압력에서 **더 빨리** 바닥난다(둘이 실제로 다르다)
  const runC = (hunters, days, G0) => { let G = G0;
    for (let d = 1; d <= days; d++) { G = Math.max(0, G - hunters * LH);
      if (d % 7 === 0 && G > 0 && G < K) { G = Math.min(K, G + 7 * r * G * (1 - G / K)); } }
    return G; };
  //   ★자명 통과 금지 — **갈리는 압력**에서 잰다. 둘 다 바닥이면 "다르다"를 못 보인다
  //     (초안이 0.00 ≤ 0.00 으로 통과했다 — 통과지만 아무 말도 안 하는 통과다).
  let sepH = null, sepC = null, sepN = null;
  for (const n of [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.35, 0.5, 1]) {
    const a = run(n, 200, K), b2 = runC(n, 200, K);
    if (a > K * 0.02 && b2 >= 0 && a - b2 > K * 0.02) { sepN = n; sepH = a; sepC = b2; break; }
  }
  ok(sepN !== null && sepH > sepC,
    '★★⑧ 자명 통과 금지 — 갈리는 압력에서 **상수 판보다 개체가 더 남는다**(포화가 바닥을 늦춘다)',
    sepN !== null ? `사냥꾼 ${sepN}명: 포화 ${sepH.toFixed(1)} > 상수 ${sepC.toFixed(1)}` : '가르는 압력 못 찾음');
}

// ── ⑨⑩ 계측은 관측자 · 랩 경로 ──────────────────────────────────────────────
sec('⑨⑩ 계측은 관측자 · 랩 경로');
{
  const reads = (LAB.match(/_hstat/g) || []).length;
  ok(reads >= 2, '⑨ 전제 — `_hstat` 자리가 있다', `${reads}회`);
  const rule = LAB.replace(/s\._hstat=s\._hstat\|\|\{took:0,days:0\};s\._hstat\.took\+=_tk;s\._hstat\.days\+\+;/g, '');
  ok(!/_hstat/.test(rule), '★★⑨ 랩의 **세계 규칙은 `_hstat` 를 안 읽는다**(계측이 세계를 바꾸지 않는다)');
  const runner = fs.readFileSync(path.join(ROOT, 'scripts', 'lab-hunt.js'), 'utf8');
  ok(/lab', '전쟁실험실\.html'/.test(runner) || /'lab'/.test(runner),
    '★⑩ 계측기가 **레포 안 랩**을 본다(레포 밖 homedir 기본값 0)');
  //   ⚠★★**주석 문구로 묻지 않는다** — 이 계측기의 머리말은 "`@regress` 없음"이라고 *설명*하느라
  //     그 글자를 담고 있다. 러너가 보는 것은 **줄머리의 등록 표식**이다(T124 에서 똑같은 실수를 했다).
  const regLine = runner.split('\n').some((l) => /^\s*\/\/\s*@regress\s*$/.test(l));
  ok(!regLine, '★⑩ 그리고 계측기는 러너에 안 들어간다(줄머리 `// @regress` 표식 없음)');
  const hOwn = fs.readFileSync(__filename, 'utf8').split('\n').some((l) => /^\s*\/\/\s*@regress\s*$/.test(l));
  ok(hOwn, '★⑩ (대조) 이 하네스는 **표식이 있다** — 검사가 실제로 그 형식을 본다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
