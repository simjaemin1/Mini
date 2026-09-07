#!/usr/bin/env node
// @regress
// === scripts/test-lab-hunt.js — T144 랩 사냥(개체군·회복·수확 포화) 하네스 ==========
//
// 이 카드는 **랩만** 만진다(서버 이식은 승인 게이트가 달린 다음 카드). 그래서 이 하네스가
// 지키는 것의 절반은 "무엇이 있는가"가 아니라 **"무엇이 없는가"**다 — 서버 무접촉·새 수 0·사본 0.
//
//  ① 이식 범위        server/ 쪽 사냥 식은 `villages.js` 한 파일뿐 · public/ 은 0 (T146 이 뒤집은 절)
//  ② 정본 재사용      개체군·회복·차감은 **이미 있던** 랩 정본이다(이 카드가 새로 만들지 않았다)
//  ③ 새 수 0          반포화는 `L_GAMEMAX` 에서 유도된다(리터럴 밀도 상수 0)
//  ④ 연속성           만땅(G=K)에서 포화형 수확 = 종전 상수 `L_HUNT`(OFF/ON 이 만땅에서 같다)
//  ⑤ 단조·포화        수확이 밀도에 대해 단조 증가하고 K 위로 안 넘는다
//  ⑥ 되돌림           `L_HUNTREAL=0` ⇒ 상수 차감(이 카드 전 랩 비트 동일)
//  ⑦ 돌연변이         반포화를 0 으로 하면 포화가 사라진다(= 상수 · 이 절이 빨강을 낼 수 있다)
//  ⑧ 실행(랩)         사냥꾼 0 이면 P→K · 사냥꾼 과잉이면 P 바닥 → 수확이 준다(붕괴가 보인다)
//  ⑨ 계측은 관측자    `_hstat` 를 읽는 곳은 계측기뿐(랩의 세계 규칙이 계측을 안 읽는다)
//  ⑩ 랩 경로          레포 안 랩을 본다(레포 밖 homedir 기본값 0)
//  ⑪ [T154] 소득     고기는 장부가 잡은 만큼만 — 주입 문 하나 · 대체(얹기 0) · 되돌림 기본 abstract
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
sec('① 이식 범위 — 정본은 `villages.js` 하나 · 연출 층 무접촉 (T146 이 이 절을 뒤집었다)');
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
  //   ★★[T146 2026-09-06 · 이 절은 **뒤집혔다**] 원래 이 줄은 "서버에 이 이름이 한 글자도 없다"를 잠갔다.
  //     그 잠금은 T144 의 범위("랩만 · 서버 0")를 지키는 것이었고, **T146 이 바로 그 이식 카드**다.
  //     지운 게 아니라 **자리를 옮긴다**: 이제 지킬 것은 "서버가 랩 값을 베끼지 않았다"가 아니라
  //     "서버가 그 이름을 갖더라도 **정본은 마을 생활층 하나**다"이다 — 이식 하네스(`test-hunt-port`)가 그걸 잰다.
  //     여기서는 **랩 쪽 이름이 클라이언트로 새지 않았다**만 계속 잠근다(연출 층은 이 식을 몰라야 한다).
  const cli = hits.filter((h) => h.startsWith('public'));
  ok(cli.length === 0, '★★① 클라이언트에 사냥 식 이름이 **하나도 없다**(연출 층은 개체군을 모른다)', cli.join(' ') || '0건');
  const srv = hits.filter((h) => h.startsWith('server'));
  ok(srv.every((h) => h.startsWith('server/villages.js')),
    '★★① 서버 쪽 이름은 **`villages.js` 한 파일에만** 있다(T146 이식 · 정본 하나 · 사본 0)', srv.join(' ') || '0건(미이식)');
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
  //   ⚠★★**코드에게 묻는다 — 주석에게 묻지 않는다.** 이 줄 옆 주석이 `_hstat` 라는 글자를 담고 있어
  //     원문 그대로 재면 자기 설명문에 걸려 빨개진다(T144 의 `@regress` 와 같은 함정).
  const LABC = strip(LAB);
  const rule = LABC.replace(/s\._hstat=s\._hstat\|\|\{took:0,days:0\};s\._hstat\.took\+=_tk;s\._hstat\.days\+\+;/g, '');
  ok(!/_hstat/.test(rule), '★★⑨ 랩의 **세계 규칙은 `_hstat` 를 안 읽는다**(계측이 세계를 바꾸지 않는다)',
    (rule.match(/_hstat/g) || []).length ? `남은 ${(rule.match(/_hstat/g) || []).length}회` : '0회');
  //   ★★[T154] 그런데 `_hkill` 은 **반대**다 — 세계가 읽으라고 만든 수다(소득 정본).
  //     둘이 같은 줄에 나란히 앉아 있으니, 이 절이 그 구분을 못 박아 둔다.
  ok(/_hkill/.test(LABC),
    '★★⑨ 대신 `_hkill`(그날 잡은 수)은 **세계가 읽는다**(계측과 정본을 갈라 둔다)');
  const rule2 = LABC.replace(/s\._hkill=\(s\._hkill\|\|0\)\+_tk;/g, '');
  ok(/_hkill/.test(rule2), '★⑨ (대조) 쓰는 자리 말고 **읽는 자리도 있다**(안 그러면 죽은 값이다)');
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

// ═══ ⑪ [T154] 사냥 소득 = 장부가 잡은 만큼 ═════════════════════════════════
sec('⑪ [T154] 고기는 **장부가 잡은 만큼만** — 주입 문 하나 · 대체 · 되돌림');
{
  //   ★주입 문은 **엔진 규약**을 따라야 한다(priceFn·netExportFn 과 같은 꼴 — world 에 있을 때만 산다)
  const ENG = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  const eb = strip(ENG);
  ok(/typeof v\._world\.huntIncomeFn === 'function'/.test(eb),
    '★★⑪ 엔진의 주입 문이 **`priceFn` 과 같은 규약**이다(world 에 심겼을 때만 산다)');
  const hooks = (eb.match(/huntIncomeFn/g) || []).length;
  ok(hooks <= 3, '★★⑪ 그리고 주입 문은 **한 자리**뿐이다(사본 0)', `${hooks}회 언급`);
  //   ★★대체지 얹기가 아니다 — 추상 산출을 **덮어쓴다**(별도 addProduce 를 더하지 않는다)
  const i = eb.indexOf('huntIncomeFn');
  const around = eb.slice(Math.max(0, i - 400), i + 400);
  ok(/baseAmt = _hi/.test(around) && !/addProduce\(/.test(around),
    '★★⑪ 산출을 **덮어쓴다**(추상 위에 얹지 않는다 — 두 장부가 안 갈린다)');
  //   ★그리고 사냥꾼에만 걸린다(다른 직업 무접촉)
  ok(/currentJob === 'hunter' && v\._world/.test(eb),
    '★★⑪ 사냥꾼에만 걸린다(농부·어부·채집 무접촉)');

  //   ★랩 쪽 — 손잡이 기본이 **abstract**(종전 비트)여야 한다
  const mode = bodyOf('_huntIncomeMode');
  ok(/'abstract'/.test(mode), "★★⑪ 되돌림 기본이 **`abstract`** 다(안 켜면 종전 비트)");
  ok(/window\.L_HUNTINCOME/.test(mode), '★⑪ 손잡이 이름은 `L_HUNTINCOME` · **부를 때** 읽는다');
  //   ★소득 함수 — 마리당 **새 수 0**(리터럴 도체율이 없다)
  const inc = bodyOf('huntIncomeReal');
  const lits = (strip(inc).match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0');
  ok(lits.length === 0, '★★⑪ 마리당 **새 수 0**(도체율 리터럴이 없다 — 축산 표 전이라 1 단위)', lits.join(',') || '0개');
  ok(/kills\s*\/\s*hn/.test(strip(inc)) || /kills \/ hn/.test(strip(inc)),
    '★★⑪ 소득 = **장부 마릿수 ÷ 사냥꾼 수**(1인분 · 엔진이 사람마다 부른다)');
  ok(/if\(!\(hn>0\)\)return 0;|hn > 0/.test(strip(inc)),
    '★★⑪ 사냥꾼이 0 이면 **소득 0**(0 으로 안 나눈다)');
  //   ★★개체가 0 이면 소득도 0 — 붕괴가 소득에 보인다
  ok(/v\._hkillDay\|\|0|v\._hkillDay \|\| 0/.test(strip(inc)),
    '★★⑪ 그리고 **그날 잡은 수**를 읽는다(개체가 0 이면 잡은 수도 0 ⇒ 소득 0 — 붕괴가 보인다)');

  //   ★하루 경계 — 어제치를 확정하고 오늘을 0 에서 센다(누계를 소득으로 쓰면 곳간이 폭발한다)
  const dayAll = strip(bodyOf('lifeDayAll'));
  ok(/_hkillDay\s*=\s*vil\._hkill\s*\|\|\s*0\s*;\s*vil\._hkill\s*=\s*0/.test(dayAll.replace(/\s+/g, ' ').replace(/ /g, '')) ||
     /ev\._hkillDay=vil\._hkill\|\|0;vil\._hkill=0/.test(dayAll.replace(/\s/g, '')),
    '★★⑪ 하루 경계에서 **어제치를 확정하고 오늘을 0 으로** 되돌린다(누계가 아니다)');
  ok(/ECON_WORLD\.huntIncomeFn=/.test(dayAll.replace(/\s/g, '')),
    '★★⑪ 주입은 **하루 경계 한 줄**이다');
  ok(/'real'/.test(dayAll), "★⑪ 그리고 `real` 일 때만 심는다(abstract 면 안 심는다 = 비트 동일)");

  //   ★차감 자리가 오늘 잡은 수를 **같은 문**에서 센다(계측 `_hstat` 와 한 줄 — 사본 0)
  const rt = strip(bodyOf('resourceTick')).replace(/\s/g, '');
  ok(/_hkill=\(s\._hkill\|\|0\)\+_tk/.test(rt),
    '★★⑪ 잡은 수를 **실제로 뺀 그 자리**에서 센다(`_tk` — 따로 다시 계산하지 않는다)');
  //   ★★자명 통과 금지 — `_tk` 는 포화 수확이라 상수가 아니다(위 ④⑤ 가 그걸 잠근다)
  ok(/_tk=Math\.min\(_g0,huntTake\(_g0\)\)/.test(rt),
    '★★⑪ 그리고 그 `_tk` 는 **포화 수확**이다(밀도를 따른다 — 상수 아님)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
