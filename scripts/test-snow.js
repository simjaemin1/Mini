#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-snow.js — 적설 정본 하네스 [T487 2026-09-28] ==========================
//
// ★대상: `server/snow.js`(적설 = 세계 상태) + `zone.js` 스냅 접점(`T487_SNOW` 손잡이 하나) +
//   클라 네 자리(지면·수관·배지·눈발)가 **그 한 칸**만 읽는지.
//   `test-weather` 옆에 선다(그건 하늘을 재고, 이건 땅에 남는 것을 잰다).
//
// ★★이 하네스는 **판정보다 표**가 본체다(카드 ① "헤드리스 자: 한 해 365일 snow 곡선 3시드 · 표").
//   곡선의 모양(겨울 적설 일수 · 최대 · 첫눈 · 녹는 날)은 **재는 것**이지 맞추는 것이 아니다 —
//   쌓임·녹음의 문턱과 계수는 물리와 단위에서 왔고(새 수 0), 그 결과가 무엇이든 그대로 적는다.
//   판정은 모양이 아니라 **계약**에 건다: 여름엔 0 · 값은 0..1 · 메모가 답을 안 바꾼다 · 끔은 비트 동일.
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같이 잰다(아래 절마다 적었다).
//
// 실행: node scripts/test-snow.js
'use strict';

const fs = require('fs');
const path = require('path');
const R = (p) => path.join(__dirname, '..', p);
const { codeOnly } = require('./code-only');

const Snow = require(R('server/snow.js'));
const Ev = require(R('server/events.js'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };

/** 씨앗을 갈아 끼운 **새 사본**을 적재한다 — `test-weather` `loadWeather` 와 같은 문법(원본 모듈 무접촉). */
function loadWeather(seed) {
  const p = require.resolve(R('server/weather.js'));
  const saved = process.env.WEATHER_SEED;
  delete require.cache[p];
  if (seed === undefined) delete process.env.WEATHER_SEED; else process.env.WEATHER_SEED = String(seed);
  let m;
  try { m = require(p); } finally {
    delete require.cache[p];
    if (saved === undefined) delete process.env.WEATHER_SEED; else process.env.WEATHER_SEED = saved;
  }
  return m;
}
// ★씨앗 — 랩 관례 3시드(1020·7·42 · `ab-longcurve`·`lab-happywork-ab` 의 그 셋) + **정본 씨앗**(배포 세계).
//   날씨의 씨앗은 `WEATHER_SEED` 하나라(econ 씨앗과 별개다) 그 자리에 셋을 넣어 잰다. 새 수 0.
const SEEDS = [['정본', 20260831], ['1020', 1020], ['7', 7], ['42', 42]];
const cal = (d) => Ev.calendarOf(d);
const dateOf = (d) => { if (d < 0) return '—'; const c = cal(d); return `${c.year}년 ${c.seasonKo} ${c.dayOfSeason}일`; };
// "한 해" 창 — **여름 첫날부터 365일**(겨울 하나가 통째로 든다 · 달력 해는 겨울을 가운데서 자른다).
//   여름 첫날은 달력 정본이 정한다(여기서 90 을 적지 않는다).
const YD = cal(0).yearDays;
let SUMMER0 = 0; while (cal(SUMMER0).season !== 'summer') SUMMER0++;

console.log('\n=== 적설 정본 하네스 (T487) ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// ① 유도식 — 재료는 정본 둘(`precipAt`·`tempAt`) · 새 수 0 · 손잡이 0
//    ★기계가 읽는다. 주석이 아니라 **코드**에서 센다(`code-only` 정본).
// ─────────────────────────────────────────────────────────────────────────────
{
  const src = fs.readFileSync(R('server/snow.js'), 'utf8');
  const body = codeOnly(src);
  ok(/require\('\.\/weather'\)/.test(body), '① 재료는 날씨 **정본**이다(`./weather` 를 문다 · 사본 0)');
  ok(/W\.precipAt\(/.test(body) && /W\.tempAt\([^)]*true/.test(body) && /W\.tempAt\([^)]*false/.test(body),
    '①b 쌓임은 `precipAt` + **밤** 기온, 녹음은 **낮** 기온을 읽는다');
  ok(!/process\.env/.test(body), '①c 이 파일에 손잡이 0 — 켜고 끄는 것은 `zone.js` `T487_SNOW` 하나(카드 "손잡이 하나")');
  // 새 수 0 — 코드의 수 리터럴을 전부 모은다. 0·1 은 문턱(0℃)·눈금(상한 1)·단위 계수, 4 는 **표시 자릿수**(`precip` 과 같은 toFixed(4)).
  const lits = [...new Set((body.match(/(?<![\w.$])\d+(?:\.\d+)?(?![\w$])/g) || []).map(Number))].sort((a, b) => a - b);
  ok(lits.every((v) => v === 0 || v === 1 || v === 4), '①d ★새 수 0 — 코드의 수는 0·1(문턱·눈금·단위)과 4(표시 자릿수)뿐이다', `[${lits.join(', ')}]`);
  // ★자명 통과 금지 — 같은 자로 "수 하나 넣은 판"을 재면 잡는다
  const bait = body.replace('Math.max(0, tD - T0)', 'Math.max(0, tD - T0) * 0.35');
  const baitLits = [...new Set((bait.match(/(?<![\w.$])\d+(?:\.\d+)?(?![\w$])/g) || []).map(Number))];
  ok(bait !== body && !baitLits.every((v) => v === 0 || v === 1 || v === 4), '①e 자명 통과 금지 — 녹음에 계수 0.35 를 끼우면 **잡는다**', `[${baitLits.join(', ')}]`);
  console.log('     유도식: S(d+1) = min(1, max(0, S(d) − k·max(0, T낮(d) − T₀)·Δt) + [T밤(d) < T₀]·precipAt(d)) · S(0) = 0');
  console.log('             T₀ = 0℃(어는점) · Δt = 1 게임일 · k = 1 눈금/(1℃·1일) — 단위 셋이 전부 1 ⇒ 곱이 1(고른 수가 아니다)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 한 걸음의 식 — 가짜 하늘로 **각 항이 제 일을 하는지** 본다(쌓임·녹음·상한·순서·비)
//    반례: 밤 기온이 0℃ 이상이면 같은 강수라도 **안 쌓인다**(그건 비다).
// ─────────────────────────────────────────────────────────────────────────────
{
  // 날 d 의 (강수, 낮 ℃, 밤 ℃)
  const SKY = [[0.5, 2.0, -3.0], [0, 0.3, -1.0], [0.9, -2.0, -1.0], [0.4, -0.5, 1.5], [0, 12.0, 4.0]];
  const W = { precipAt: (d) => SKY[d][0], tempAt: (d, night) => (night ? SKY[d][2] : SKY[d][1]) };
  const S = Snow.make(W);
  const v = [0, 1, 2, 3, 4, 5].map((d) => S.at(d));
  ok(Math.abs(v[1] - 0.5) < 1e-12, '② 눈 오는 밤(밤 −3℃) — **강수 강도 그대로** 쌓인다(낮 2℃ 가 먼저 녹일 게 없다)', `S(1) = ${v[1]}`);
  ok(Math.abs(v[2] - 0.2) < 1e-12, '②b 낮 0.3℃ 는 **0.3 눈금** 녹인다(℃ 비례 · k = 1)', `S(2) = ${v[2].toFixed(4)}`);
  ok(v[3] === 1, '②c 상한 1 — 0.2 + 0.9 는 1 에서 멈춘다', `S(3) = ${v[3]}`);
  ok(v[4] === 1, '②d 낮이 영하(−0.5℃)면 안 녹는다 · 밤이 영상(1.5℃)이면 **비라서 안 쌓인다**', `S(4) = ${v[4]}`);
  ok(v[5] === 0, '②e 낮 12℃ 는 다 녹인다(0 아래로 안 간다)', `S(5) = ${v[5]}`);
  // 순서 — 게임일 안에서 **낮이 먼저**다. 거꾸로(쌓고 녹이면) 첫날 값이 0 이 된다 ⇒ 이 식은 그걸 가른다.
  const rev = Math.min(1, Math.max(0, 0 + SKY[0][0] - SKY[0][1]));
  ok(rev === 0 && v[1] === 0.5, '②f 순서 — 낮(녹음) 다음 밤(쌓임). 거꾸로 셈하면 눈 온 다음 아침이 **맨땅**이 된다(반례 0)', `거꾸로 ${rev} · 이 식 ${v[1]}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ ★한 해 365일 곡선 — 3시드(+정본 씨앗) × 세 해 · **표가 답이다**
// ─────────────────────────────────────────────────────────────────────────────
const CURVE = [];
{
  console.log(`\n  ── 곡선 표 (창 = 여름 첫날부터 ${YD}일 · 값 = 그날 내내 보이는 적설 0..1)`);
  console.log('     씨앗      해   적설일  (겨울 안)  쌓인 밤  넘긴 날  최장  최대    최대 날            첫눈               마지막 적설          녹은 날');
  let summerSnow = 0, outOfRange = 0, noSnowRow = 0, badFirst = 0;
  for (const [name, seed] of SEEDS) {
    const S = Snow.make(loadWeather(seed));
    for (let y = 0; y < 3; y++) {
      const a = SUMMER0 + y * YD, b = a + YD;
      // 넘긴 날 = 전날 밤에 안 쌓였는데도 보이는 날(눈이 하루를 넘겨 남았다) · 최장 = 이어진 적설 일수의 최댓값
      let n = 0, nWin = 0, nAcc = 0, nCarry = 0, streak = 0, streakMax = 0, mx = 0, mxd = -1, first = -1, last = -1;
      for (let d = a; d < b; d++) {
        const v = S.at(d);
        if (!(v >= 0 && v <= 1)) outOfRange++;
        const c = cal(d);
        if (c.season === 'summer' && v !== 0) summerSnow++;
        if (v > 0) { n++; if (c.season === 'winter') nWin++; if (first < 0) first = d; last = d; if (!(S.accOf(d - 1) > 0)) nCarry++; streak++; if (streak > streakMax) streakMax = streak; } else streak = 0;
        if (v > mx) { mx = v; mxd = d; }
        if (S.accOf(d) > 0) nAcc++;
      }
      if (n === 0) noSnowRow++;
      if (first >= 0 && ['autumn', 'winter'].indexOf(cal(first).season) < 0) badFirst++;
      CURVE.push({ name, seed, y, n, nWin, nAcc, nCarry, streakMax, mx, mxd, first, last });
      console.log(`     ${name.padEnd(8)} ${String(y).padStart(2)}  ${String(n).padStart(6)}  ${String(nWin).padStart(8)}  ${String(nAcc).padStart(7)}  ${String(nCarry).padStart(7)}  ${String(streakMax).padStart(4)}  ${mx.toFixed(4)}  ${dateOf(mxd).padEnd(17)}  ${dateOf(first).padEnd(17)}  ${dateOf(last).padEnd(19)}  ${dateOf(last >= 0 ? last + 1 : -1)}`);
    }
  }
  const ns = CURVE.map((r) => r.nWin), ms = CURVE.map((r) => r.mx);
  let W0 = SUMMER0; while (cal(W0).season !== 'winter') W0++;
  console.log(`     ⇒ 겨울 적설 일수 ${Math.min(...ns)}~${Math.max(...ns)}일(겨울 ${cal(W0).seasonDays}일 중) · 최대 ${Math.min(...ms).toFixed(4)}~${Math.max(...ms).toFixed(4)}`
    + ` · 하루를 넘겨 남은 날 ${CURVE.reduce((a, r) => a + r.nCarry, 0)} · 이어진 적설 최장 ${Math.max(...CURVE.map((r) => r.streakMax))}일`);
  ok(noSnowRow === 0, '③ 모든 씨앗·모든 해에 **눈이 실제로 쌓인다**(자명 통과 방지 — 0 이면 아래 판정이 전부 빈말이다)', `${CURVE.length}줄 중 적설 0 인 줄 ${noSnowRow}`);
  ok(summerSnow === 0, '③b ★여름엔 **한 번도** 안 쌓여 있다(여름 낮 영상 ⇒ 전날 것까지 다 녹는다)', `여름 날 적설 > 0 : ${summerSnow}`);
  ok(outOfRange === 0, '③c 값은 늘 0..1(상한 1 · 음수 0)', `어긋남 ${outOfRange}`);
  ok(badFirst === 0, '③d 첫눈은 가을·겨울에 온다(봄·여름 첫눈 0)', `어긋남 ${badFirst}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 결정론 · 관측자 무관 — 메모(하루 한 걸음)가 답을 바꾸지 않는다
//    반례: 순서를 흔들어도(앞으로 · 뒤로 · 건너뛰기) **0 일부터 메모 없이 재생한 값**과 비트까지 같다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const W = loadWeather(20260831);
  const A = Snow.make(W), B = Snow.make(W);
  const days = [];
  for (let d = 0; d < 1500; d += 37) days.push(d);
  const fwd = days.map((d) => A.at(d));
  const back = days.slice().reverse().map((d) => B.at(d)).reverse();
  const rep = days.map((d) => A.replay(d));
  ok(JSON.stringify(fwd) === JSON.stringify(rep), '④ 하루씩 민 값 = 0 일부터 재생한 값(비트 동일)', `${days.length}점`);
  ok(JSON.stringify(back) === JSON.stringify(rep), '④b **뒤로** 물어도 같다(재시작·하네스 시계가 과거로 가도 답이 같다)');
  const C = Snow.make(W); C.at(1200);
  ok(C.at(640) === A.replay(640) && C.at(1201) === A.replay(1201), '④c 건너뛰어 물어도 같다(재시작한 존이 날 D 에서 처음 묻는 경우)');
  ok(fwd.some((v) => v > 0) && fwd.some((v) => v === 0), '④d (자명 통과 방지) 그 점들에 눈 있는 날도 없는 날도 있다',
    `적설 > 0 : ${fwd.filter((v) => v > 0).length}/${fwd.length}`);
  // 정본 사본 — 모듈이 내는 기본 계산기는 **배포 씨앗**에 묶여 있다(적재 경로가 하나다)
  ok(Snow.at(1000) === Snow.make(W).at(1000), '④e 기본 계산기 = 정본 씨앗 사본(`module.exports` 가 `./weather` 에 묶였다)');
  ok(Snow.snowAt(1000) === +Snow.at(1000).toFixed(4), '④f 스냅 값은 넷째 자리까지(다른 날씨 칸과 같은 문법)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ ★끔 = 스냅 바이트 동일 — `zone.js` 의 세 자리가 **전부** 손잡이 안에 있다(구조로 자른다)
//    ⚠소스를 글자 수로 자르지 않는다(T62·T85) — 함수 끝까지 구조로 집는다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const zsrc = codeOnly(fs.readFileSync(R('server/zone.js'), 'utf8'));
  const fnOf = (name) => { const at = zsrc.indexOf('\nfunction ' + name + '('); const end = zsrc.indexOf('\n}\n', at); return at >= 0 && end > at ? zsrc.slice(at, end + 3) : ''; };
  ok(/const T487_SNOW = process\.env\.T487_SNOW === '1';/.test(zsrc), "⑤ 손잡이 `T487_SNOW` — 기본 **끔**(`=== '1'` 일 때만 켬)");
  const wn = fnOf('weatherNow');
  ok(wn.length > 0 && /hintOf\(/.test(wn), '⑤b 전제: `weatherNow` 본문을 통째로 집었다', `${wn.split('\n').length}줄`);
  const snowLines = wn.split('\n').filter((l) => /\bsnow\b|_snowNow/.test(l));
  ok(snowLines.length === 1 && /if \(T487_SNOW && v\) v\.snow = /.test(snowLines[0]),
    '⑤c ★스냅의 `snow` 칸은 **한 줄**이고 그 줄은 손잡이 안이다 ⇒ 끔이면 스냅 객체가 종전과 같다', snowLines.map((l) => l.trim()).join(' | '));
  const wf = fnOf('weatherFor');
  ok(wf.length > 0 && !/snow/.test(wf), '⑤d `weatherFor`(초당 gauges)는 **안 고쳤다** — `weatherNow` 를 펼쳐 싣는 자리라 칸이 저절로 따라간다');
  // 결산 한 줄 · 테스트 문 — 둘 다 손잡이/E2E 안
  const settle = zsrc.split('\n').filter((l) => /require\('\.\/snow'\)\.at\(/.test(l));
  ok(settle.length === 1 && /if \(T487_SNOW\)/.test(settle[0]), '⑤e 게임일 결산 한 줄도 손잡이 안이다(끔 = 부르지도 않는다)', settle.map((l) => l.trim()).join(' | '));
  ok(/else if \(E2E_GIVE && msg\.type === '__e2e_snow'\)/.test(zsrc), '⑤f 적설을 세우는 문은 **테스트 전용**(`E2E_GIVE`)이다 — 기본 부팅엔 그 분기가 없다');
  // ★자명 통과 금지 — 같은 자로 "손잡이 없이 싣는 판"을 재면 잡는다
  const baitWn = wn.replace('if (T487_SNOW && v) v.snow = ', 'if (v) v.snow = ');
  const baitLines = baitWn.split('\n').filter((l) => /\bsnow\b|_snowNow/.test(l));
  ok(!(baitLines.length === 1 && /if \(T487_SNOW && v\) v\.snow = /.test(baitLines[0])), '⑤g 자명 통과 금지 — 손잡이를 벗기면 ⑤c 가 **빨개진다**');
  // `weather.js` 무접촉(T484 자리) — 이 카드가 날씨 정본에 `snow` 를 안 심었다
  const wsrc = codeOnly(fs.readFileSync(R('server/weather.js'), 'utf8'));
  ok(!/\bsnow\b/i.test(wsrc), '⑤h `weather.js` 에 적설 0 — 기온·강수는 **읽기만** 한다(T484 · 세션7 자리)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 표만 — **겨울 강수일 중 눈으로 그려지는 비율**(카드 ④ · 경계는 T484 가 옮길 자리라 안 건드린다)
//    그리는 쪽 문법 그대로: 클라 `37-r1-weather` 가 `wx.tempC < 0` 이면 눈, 아니면 비.
//    `tempC` 는 서버가 `tempAt(...).toFixed(1)` 로 싣는 그 수다(`hintOf`) — 같은 반올림으로 센다.
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('\n  ── 겨울(달력) 강수일 중 눈으로 그려지는 몫 — 세 해 합 · 낮/밤 따로(비는 한 날 두 판이다)');
  console.log('     씨앗      강수일   낮 눈      밤 눈      반나절 합');
  const rows = [];
  for (const [name, seed] of SEEDS) {
    const W = loadWeather(seed);
    let n = 0, dS = 0, nS = 0;
    for (let d = SUMMER0; d < SUMMER0 + 3 * YD; d++) {
      if (cal(d).season !== 'winter' || !(W.precipAt(d) > 0)) continue;
      n++;
      if (+W.tempAt(d, false, 0).toFixed(1) < 0) dS++;
      if (+W.tempAt(d, true, 0).toFixed(1) < 0) nS++;
    }
    rows.push({ name, n, dS, nS });
    const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : '0.0') + '%';
    console.log(`     ${name.padEnd(8)} ${String(n).padStart(6)}   ${(dS + '/' + n).padStart(6)} ${pct(dS, n).padStart(6)}  ${(nS + '/' + n).padStart(6)} ${pct(nS, n).padStart(6)}  ${pct(dS + nS, 2 * n).padStart(7)}`);
  }
  ok(rows.every((r) => r.n > 0), '⑥ 모든 씨앗에 겨울 강수일이 있다(자명 통과 방지)', rows.map((r) => r.n).join('·'));
  ok(rows.every((r) => r.nS >= r.dS), '⑥b 밤 눈 ≥ 낮 눈 — 밤이 더 춥다(일교차 부호가 산다)', rows.map((r) => `${r.dS}/${r.nS}`).join(' '));
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 클라 접점 — 네 자리가 **그 한 칸**(`myWeather.snow`)만 본다 · 끔(칸 없음)이면 넷 다 종전 길
//    ★구조로 자른다(함수 본문 · 분기) — 글자 수로 안 자른다. 화소로는 `e2e-snow`(@pixel)가 잰다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const rd = (f) => codeOnly(fs.readFileSync(R('public/client/' + f), 'utf8'));
  const fnBody = (src, name) => { const at = src.indexOf('function ' + name + '('); if (at < 0) return ''; let i = src.indexOf('{', at), d = 0;
    for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(at, j + 1); } } return ''; };
  const T = rd('10-r1-terrain.js'), C = rd('00-const.js'), L = rd('34-m-renderloop.js'), S = rd('40-r2-sprites.js'), H = rd('44-h-hud.js');
  const sn = fnBody(T, '_gtSnowNow'), sa = fnBody(T, '_gtSnowAlpha');
  ok(/myWeather\.snow > 0/.test(sn) && !/myCalendar|season|day/.test(sn), '⑦ 지면: 적설은 서버 값 하나를 **읽기만** 한다(날짜→눈 매핑 사본 0)', sn.replace(/\s+/g, ' ').slice(0, 90));
  ok(/road > 0/.test(sa), '⑦b 지면 제외 규칙 — 길(`road > 0`)은 안 칠한다', sa.replace(/\s+/g, ' ').slice(0, 90));
  const bake = fnBody(C, '_bakeGroundTile');
  const calls = bake.split('\n').filter((l) => /_gtSnowAlpha\(/.test(l));
  ok(calls.length === 2 && calls.every((l) => /_gtDiamond\(g, sx, sy, ICE_COLOR, _gtSnowAlpha\(_st\), gm\)/.test(l)),
    '⑦c 지면 굽기에서 적설은 **두 자리**(산터·땅)뿐이고 색은 세계 리터럴 `ICE_COLOR`(판 토큰 0 · T66)', `${calls.length}자리`);
  // 물·바위 갈래에는 없다 — `if (isWater) {…} else if (isRock) {…} else {…}` 의 앞 둘을 잘라 본다
  const wAt = bake.indexOf('if (isWater) {'), rAt = bake.indexOf('} else if (isRock) {'), eAt = bake.indexOf('} else {', rAt);
  ok(wAt > 0 && rAt > wAt && eAt > rAt && !/_gtSnowAlpha/.test(bake.slice(wAt, eAt)), '⑦d 물·바위 갈래엔 적설이 **없다**(제외 규칙 표 그대로)');
  const kf = L.split('\n').filter((l) => /_gtSnowNow\(\)/.test(l));
  ok(kf.length === 1 && /_gtSnowNow\(\) > 0 \? 's' \+ _gtSnowNow\(\) : ''/.test(kf[0]), '⑦e 지문(`_kf`) — 적설이 0·끔이면 **빈 글자**(지문 그대로 ⇒ 다시 안 굽는다)');
  const sl = fnBody(S, '_seasonList');
  ok(/myWeather\.snow === undefined\) return null/.test(sl) && /myCalendar\.season/.test(sl), '⑦f 수관: 끔(칸 없음)이면 철 판을 안 본다 · 철은 달력 정본(`myCalendar.season`)');
  ok(!/_[fw]'|'_f|'_w|\+ '_/.test(S), '⑦g 수관: 클라가 접미(`_f`·`_w`)를 **안 읽는다** — 칸 이름으로만 고른다(T148-B)');
  const badge = H.split('\n').filter((l) => /const tR = /.test(l));
  ok(badge.length === 1 && /myWeather\.snow !== undefined/.test(badge[0]) && /myWeather\.tempC/.test(badge[0]), '⑦h 배지: ℃ 한 칸은 켬일 때만 · 수는 툴팁의 그 `tempC`', badge.map((l) => l.trim()).join(''));
  // 종 표 — 철 판 칸의 i 번째가 `sprites` 의 i 번째와 **같은 나무**(접미만 다르다) · 침엽엔 칸이 없다 · 잠금표에 전부 있다
  const TS = JSON.parse(fs.readFileSync(R('public/assets/trees/tree_species.json'), 'utf8')).species || {};
  const LK = JSON.parse(fs.readFileSync(R('public/assets/icons.lock.json'), 'utf8')).trees || {};
  const mis = [], noLock = [], seasoned = [];
  for (const [id, e] of Object.entries(TS)) for (const k of ['sprites_autumn', 'sprites_winter']) {
    if (!e[k]) continue;
    seasoned.push(`${id}:${k.slice(8)}${e[k].length}`);
    e[k].forEach((n, i) => { if (n.replace(/_[fw]$/, '') !== (e.sprites || [])[i]) mis.push(`${id}.${k}[${i}]=${n}`); if (!LK[n]) noLock.push(n); });
  }
  ok(seasoned.length > 0 && mis.length === 0, '⑦i 종 표 — 철 판의 i 번째는 성목판 i 번째와 **같은 그루**(자리 해시가 같은 나무를 고른다)', mis.join(' ') || seasoned.join(' '));
  ok(!TS.pine.sprites_autumn && !TS.pine.sprites_winter && !TS.jat.sprites_autumn && !TS.jat.sprites_winter, '⑦j 침엽(소나무·잣)은 철 판 칸이 **없다** = 사철 그대로');
  ok(noLock.length === 0, '⑦k 철 판 그림이 전부 잠금표(`trees`)에 있다', noLock.join(' '));
  const NA = JSON.parse(fs.readFileSync(R('public/assets/nature/nature_anchors.json'), 'utf8'));
  const frame = [];
  for (const e of Object.values(TS)) for (const k of ['sprites_autumn', 'sprites_winter']) (e[k] || []).forEach((n, i) => {
    const b = NA[e.sprites[i]], a = NA[n];
    if (!a || !b || a.w !== b.w || a.h !== b.h || a.ox !== b.ox || a.oy !== b.oy) frame.push(n);
  });
  ok(frame.length === 0, '⑦l ★철 판은 짝 성목판과 **틀이 같다**(배포 w·h·앵커 동일 ⇒ 그린 자리에서 줄기가 안 움직인다)', frame.join(' ') || '전수 일치');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
