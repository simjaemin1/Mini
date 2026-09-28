#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-winter-fx.js — 겨울 이펙트 셋 정본 하네스 [T500 2026-09-28] =================
//
// ★대상: 서리 값(`server/snow.js frostAt` · `zone.js` 스냅 칸 `frost` · 손잡이 `T500_WINTER_FX` 하나) +
//   클라 세 자리(지면 서리 · 눈보라 · 입김)가 **그 한 칸**만 보고 켜지는지 + 입 자리(`char_meta.mouthScreen`).
//   화면은 픽셀 하네스 셋(`e2e-frost` · `e2e-blizzard` · `e2e-breath` — 전부 `@pixel`)이 잰다. 여기는 **식과 계약**이다.
//
// ★★이 하네스도 **판정보다 표**가 본체다(서리 곡선 4씨앗 × 세 해). 서리의 양·녹는 때는 재는 것이지 맞추는 것이
//   아니다 — 식의 재료는 기온 둘과 어는점 0℃ 하나(새 수 0)이고, 그 결과가 무엇이든 그대로 적는다.
//   판정은 모양이 아니라 **계약**에 건다: 여름 0 · 0..1 · 서리 ⇒ 보이는 적설 0 · 첫 낮에 사라진다(기온이 허락하면) · 끔 = 칸 없음.
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같이 잰다(절마다 적었다).
//
// 실행: node scripts/test-winter-fx.js
'use strict';

const fs = require('fs');
const path = require('path');
const R = (p) => path.join(__dirname, '..', p);
const { codeOnly } = require('./code-only');

const Snow = require(R('server/snow.js'));
const Ev = require(R('server/events.js'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };

/** 씨앗을 갈아 끼운 **새 사본** — `test-snow`·`test-weather` `loadWeather` 와 같은 문법(원본 모듈 무접촉). */
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
// 씨앗 — `test-snow` 와 **같은 넷**(정본 + 랩 관례 3시드). 새 수 0.
const SEEDS = [['정본', 20260831], ['1020', 1020], ['7', 7], ['42', 42]];
const cal = (d) => Ev.calendarOf(d);
const YD = cal(0).yearDays;
let SUMMER0 = 0; while (cal(SUMMER0).season !== 'summer') SUMMER0++;
const DAY_MIN = 24;   // 게임 하루 = 실시간 24분(`zone-config WORLD.dayLengthMs` 주석 · 표의 분 환산에만 쓴다)
const PHASE_DAY = require(R('server/zone-config')).WORLD.dayPhaseRatio;   // 낮 = 위상 0 ~ 이 값(0.7) — 정본에서 읽는다
// 코드의 수 리터럴 — **표시 자릿수(`toFixed(n)`)는 뺀다**: 화면·계기에 싣는 반올림이지 세계를 움직이는 수가 아니다.
const lits = (src) => [...new Set((codeOnly(src).replace(/toFixed\(\d+\)/g, 'toFixed()').match(/(?<![\w.$])\d+(?:\.\d+)?(?![\w$])/g) || []).map(Number))].sort((a, b) => a - b);
const fnBody = (src, name) => { const at = src.indexOf('function ' + name + '('); if (at < 0) return ''; let i = src.indexOf('{', at), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(at, j + 1); } } return ''; };

console.log('\n=== 겨울 이펙트 셋 정본 하네스 (T500) ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// ① 서리의 재료 — 기온 둘 · 어는점 하나 · 적설 정본(같은 파일) · 손잡이 0 · 새 수 0
// ─────────────────────────────────────────────────────────────────────────────
{
  const src = fs.readFileSync(R('server/snow.js'), 'utf8');
  const body = codeOnly(src);
  const ff = fnBody(body, '_frostFormed'), fo = fnBody(body, 'frostOf'), fa = fnBody(body, 'frostAt');
  ok(ff && fo && fa, '① 전제: 서리 함수 셋(`_frostFormed`·`frostOf`·`frostAt`)을 통째로 집었다', `${ff.split('\n').length}+${fo.split('\n').length}+${fa.split('\n').length}줄`);
  ok(/W\.tempAt\(dn, true, 0\)/.test(ff) && /W\.tempAt\(dn, false, 0\)/.test(ff) && /\(T0 - tN\) \/ span/.test(ff),
    '①b 양 F₀ = (T₀ − T밤)/(T낮 − T밤) — 재료는 그날 **두 기온**과 어는점 `T0` 뿐이다', ff.replace(/\s+/g, ' ').match(/return span[^;]*;/)?.[0]);
  ok(/sMorning !== 0/.test(ff) && /stepOf\(at\(d\), d\)/.test(fo) && /_frostFormed\(d - 1, s\)/.test(fa),
    '①c "snow = 0" 은 **다음 아침의 적설**(S(d+1))이다 — 밤 d 는 `stepOf(at(d), d)`, 아침 d 는 `at(d)` 로 **같은 정본**을 읽는다');
  ok(/meltOf\(d\) \* Math\.max\(0, \+phase \|\| 0\) >= f/.test(fa), '①d 녹음은 적설의 `meltOf`(k = 1 · ℃ 비례) **그대로** — 새 계수 0', fa.replace(/\s+/g, ' ').match(/if \(f > 0 && meltOf[^)]*\)[^;]*;/)?.[0]);
  ok(!/process\.env/.test(body), '①e 이 파일에 손잡이 0 — 켜고 끄는 것은 `zone.js` `T500_WINTER_FX` 하나');
  const L = lits(ff + fo + fa);
  ok(L.every((v) => v === 0 || v === 1), '①f ★새 수 0 — 서리 함수의 수는 0·1(문턱·눈금·하루 전)뿐이다(표시 자릿수 제외)', `[${L.join(', ')}]`);
  const bait = lits((ff + fo + fa).replace('(T0 - tN) / span', '(T0 - tN) / span * 0.6'));
  ok(!bait.every((v) => v === 0 || v === 1), '①g 자명 통과 금지 — 양에 계수 0.6 을 끼우면 **잡는다**', `[${bait.join(', ')}]`);
  console.log('     유도식: F₀(d) = [T밤(d) < 0 ∧ S(d+1) = 0] · min(1, (0 − T밤(d)) / (T낮(d) − T밤(d)))');
  console.log('             보임: 밤 d = F₀(d)(S(d) = 0 일 때) · 낮 d+1 = F₀(d) — k·max(0, T낮(d+1))·(아침부터 흐른 날) ≥ F₀ 인 순간 0');
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 가짜 하늘 — 항마다 제 일을 하는지(반례 포함)
// ─────────────────────────────────────────────────────────────────────────────
{
  // 날 d 의 (강수, 낮 ℃, 밤 ℃)
  const SKY = [[0, 3, -3], [0, 5, 2], [0.4, 4, -2], [0, 6, -1], [0, -1, -5], [0, 2, 0], [0, 4, 1]];
  const W = { precipAt: (d) => SKY[d][0], tempAt: (d, night) => (night ? SKY[d][2] : SKY[d][1]) };
  const S = Snow.make(W);
  ok(S.frostOf(0) === 0.5, '② 맑은 언 밤(낮 3℃ · 밤 −3℃) — 일교차 가운데 어는점 아래 몫 = **0.5**', `F₀(0) = ${S.frostOf(0)}`);
  ok(S.frostAt(0, true, 0) === 0.5, '②b 그 밤 내내 보인다(맺히는 중 · 땅의 적설 0)', `${S.frostAt(0, true, 0)}`);
  ok(S.frostAt(1, false, 0.05) === 0.5 && S.frostAt(1, false, 0.0999) === 0.5 && S.frostAt(1, false, 0.1) === 0,
    '②c ★다음 아침 — 낮 5℃ 가 0.5 를 녹이는 **0.1 일**까지 그대로, 그 순간 0(이진 · 첫 낮에 사라짐)',
    `p 0.05 → ${S.frostAt(1, false, 0.05)} · 0.0999 → ${S.frostAt(1, false, 0.0999)} · 0.1 → ${S.frostAt(1, false, 0.1)}`);
  ok(S.frostOf(1) === 0, '②d 밤이 영상(2℃)이면 서리 0', `${S.frostOf(1)}`);
  ok(S.frostOf(2) === 0 && S.at(3) > 0, '②e ★눈 온 밤(밤 −2℃ · 강수 0.4) — 다음 아침이 **눈**이면 서리 0(카드 "snow = 0")', `F₀ ${S.frostOf(2)} · S(3) ${S.at(3)}`);
  // 반례 — 조건을 **그날의 적설**(S(d))로 잘못 읽으면 눈 온 밤에도 서리가 선다
  const wrong = (d) => (S.at(d) === 0 && SKY[d][2] < 0) ? Math.min(1, (0 - SKY[d][2]) / (SKY[d][1] - SKY[d][2])) : 0;
  ok(wrong(2) > 0 && S.frostOf(2) === 0, '②f 반례 — "그날 적설"로 읽는 판은 눈 온 밤에 서리를 **세운다**(이 식은 다음 아침을 읽어 안 세운다)', `잘못 ${wrong(2).toFixed(4)} · 이 식 0`);
  ok(S.frostAt(3, true, 0) === 0 && S.at(3) > 0, '②g 눈이 보이는 밤엔 서리를 안 얹는다(적설 위에 두 번 칠하지 않는다)', `S(3) ${S.at(3)}`);
  const f3 = S.frostOf(3);
  ok(Math.abs(f3 - 1 / 7) < 1e-12 && S.frostAt(4, false, 0.01) === +f3.toFixed(4), '②h 낮에 눈이 다 녹은 언 밤(낮 6℃ · 밤 −1℃) — 다음 아침은 서리 1/7', `${S.frostAt(4, false, 0.01)}`);
  ok(S.frostAt(4, false, PHASE_DAY - 1e-9) === +f3.toFixed(4), '②i 낮이 영하(−1℃)면 **안 녹는다** — 낮 끝까지 남는다(기온의 일)', `${S.frostAt(4, false, PHASE_DAY - 1e-9)}`);
  ok(S.frostOf(4) === 1, '②j 하루 전체가 어는점 아래(낮 −1℃ · 밤 −5℃)면 1 에서 멈춘다(온 땅이 언 것)', `${S.frostOf(4)}`);
  ok(S.frostOf(5) === 0, '②k 밤 0℃ 는 어는점 **아래가 아니다** — 적설 쌓임과 같은 엄격한 문턱', `${S.frostOf(5)}`);
  ok(S.frostAt(0, false, 0.3) === 0, '②l 세계가 난 날 아침 — 지난밤이 없다', `${S.frostAt(0, false, 0.3)}`);
  const vals = []; for (let d = 0; d < 6; d++) for (const n of [true, false]) for (const p of [0, 0.02, 0.2, 0.69]) vals.push(S.frostAt(d, n, p));
  ok(vals.every((v) => v >= 0 && v <= 1) && vals.some((v) => v > 0), '②m 값은 늘 0..1 이고 0 아닌 값도 난다(자명 통과 방지)', `${vals.filter((v) => v > 0).length}/${vals.length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ ★서리 곡선 — 4씨앗 × 세 해 · **표가 답이다**
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log(`\n  ── 서리 곡선 (창 = 여름 첫날부터 ${YD}일 · 서리 밤 = 언 밤 가운데 다음 아침 적설 0 · 녹는 때 = F₀ ÷ 다음 낮 기온)`);
  console.log('     씨앗      해   언 밤  서리 밤  (몫)    F₀ 평균  중앙   최대    녹는 때 평균(일·실분)   최대(일)   낮 넘김');
  let summer = 0, range = 0, overSnow = 0, noRow = 0, persistBad = 0, persist = 0, frosts = 0;
  const rows = [];
  for (const [name, seed] of SEEDS) {
    const W = loadWeather(seed), S = Snow.make(W);
    for (let y = 0; y < 3; y++) {
      const a = SUMMER0 + y * YD, b = a + YD;
      let nFr = 0, nF = 0, sum = 0, mx = 0, mSum = 0, mMax = 0, nMelt = 0, per = 0; const F = [];
      for (let d = a; d < b; d++) {
        if (W.tempAt(d, true, 0) < 0) nFr++;
        const f = S.frostOf(d);
        const vn = S.frostAt(d, true, 0), vd = S.frostAt(d + 1, false, 0);
        for (const v of [vn, vd]) if (!(v >= 0 && v <= 1)) range++;
        if (cal(d).season === 'summer' && (vn > 0 || S.frostAt(d, false, 0) > 0)) summer++;
        if (vn > 0 && S.at(d) !== 0) overSnow++;
        if (vd > 0 && S.at(d + 1) !== 0) overSnow++;
        if (!(f > 0)) continue;
        nF++; sum += f; mx = Math.max(mx, f); F.push(f);
        const td = W.tempAt(d + 1, false, 0);
        const melt = td > 0 ? f / td : Infinity;
        if (melt >= PHASE_DAY) { per++; if (!(td * PHASE_DAY < f)) persistBad++; }
        else { mSum += melt; mMax = Math.max(mMax, melt); nMelt++; }
      }
      F.sort((p, q) => p - q);
      if (!nF) noRow++;
      frosts += nF; persist += per;
      const r = { name, y, nFr, nF, mean: nF ? sum / nF : 0, med: F.length ? F[F.length >> 1] : 0, mx, mMean: nMelt ? mSum / nMelt : 0, mMax, per };
      rows.push(r);
      console.log(`     ${name.padEnd(8)} ${String(y).padStart(2)}  ${String(nFr).padStart(5)}  ${String(nF).padStart(7)}  ${(nFr ? (nF / nFr * 100).toFixed(0) + '%' : '—').padStart(5)}   ${r.mean.toFixed(3)}   ${r.med.toFixed(3)}  ${mx.toFixed(3)}    ${r.mMean.toFixed(4)} · ${(r.mMean * DAY_MIN).toFixed(2)}분        ${mMax.toFixed(4)}    ${String(per).padStart(4)}`);
    }
  }
  const means = rows.map((r) => r.mean), melts = rows.map((r) => r.mMean);
  console.log(`     ⇒ 서리 밤 ${frosts} · F₀ 평균 ${Math.min(...means).toFixed(3)}~${Math.max(...means).toFixed(3)} · 녹는 때 평균 ${Math.min(...melts).toFixed(4)}~${Math.max(...melts).toFixed(4)}일`
    + `(실시간 ${(Math.min(...melts) * DAY_MIN).toFixed(2)}~${(Math.max(...melts) * DAY_MIN).toFixed(2)}분) · 낮을 넘긴 서리 ${persist}`);
  ok(noRow === 0, '③ 모든 씨앗·모든 해에 서리가 **실제로 선다**(자명 통과 방지 — 0 이면 아래가 빈말이다)', `${rows.length}줄 중 서리 0 인 줄 ${noRow}`);
  ok(summer === 0, '③b ★여름엔 **한 번도** 안 선다', `여름 서리 ${summer}`);
  ok(range === 0, '③c 값은 늘 0..1', `어긋남 ${range}`);
  ok(overSnow === 0, '③d ★서리가 보이는 때 **보이는 적설은 0** 이다(밤은 S(d) · 아침은 S(d+1) — 카드 "snow = 0")', `어긋남 ${overSnow}`);
  ok(persistBad === 0, '③e ★첫 낮에 사라진다 — 낮을 넘긴 서리는 **전부** 그 낮 기온 × 낮 길이가 F₀ 에 못 미친 날이다(기온의 일 · 규칙의 구멍 0)',
    `넘김 ${persist} · 그중 설명 안 되는 것 ${persistBad}`);
  ok(rows.every((r) => r.mx <= 1) && rows.some((r) => r.mean > 0), '③f F₀ 는 "적설 색의 낮은 값" — 평균이 0..1 안에서 선다(표가 값을 말한다)', means.map((v) => v.toFixed(2)).join(' '));
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ ★끔 = 스냅 칸 없음 — `zone.js` 의 자리가 **전부** 손잡이 안이다(구조로 자른다)
// ─────────────────────────────────────────────────────────────────────────────
{
  const zsrc = codeOnly(fs.readFileSync(R('server/zone.js'), 'utf8'));
  const fnOf = (name) => { const at = zsrc.indexOf('\nfunction ' + name + '('); const end = zsrc.indexOf('\n}\n', at); return at >= 0 && end > at ? zsrc.slice(at, end + 3) : ''; };
  ok(/const T500_WINTER_FX = process\.env\.T500_WINTER_FX === '1';/.test(zsrc), "④ 손잡이 `T500_WINTER_FX` — 기본 **끔**(`=== '1'` 일 때만 켬)");
  const wn = fnOf('weatherNow');
  ok(wn.length > 0 && /hintOf\(/.test(wn), '④b 전제: `weatherNow` 본문을 통째로 집었다', `${wn.split('\n').length}줄`);
  const fl = wn.split('\n').filter((l) => /\bfrost\b|_frostNow/.test(l));
  ok(fl.length === 1 && /if \(T500_WINTER_FX && v\) v\.frost = _frostNow\(now\);/.test(fl[0]),
    '④c ★스냅의 `frost` 칸은 **한 줄**이고 그 줄은 손잡이 안이다 ⇒ 끔이면 스냅 객체가 종전과 같다', fl.map((l) => l.trim()).join(' | '));
  const fr = fnOf('_frostNow');
  ok(/if \(_snowNow\(day\) > 0\) return 0;/.test(fr) && /worldPhase\(now\)/.test(fr) && /WORLD\.dayPhaseRatio/.test(fr) && /require\('\.\/snow'\)\.frostAt\(day, night, p\)/.test(fr),
    '④d `_frostNow` — 눈이 보이면 0 · 위상은 세계 시계(낮 = `dayPhaseRatio` 까지) · 값은 `snow.js frostAt` 하나');
  ok(zsrc.split('\n').filter((l) => /T500_WINTER_FX/.test(l)).length === 2, '④e 손잡이 이름이 코드에 **두 번**뿐이다(선언 · 칸 한 줄) — 다른 자리에 새지 않았다');
  const wf = fnOf('weatherFor');
  ok(wf.length > 0 && !/frost/.test(wf), '④f `weatherFor`(초당 gauges)는 **안 고쳤다** — `weatherNow` 를 펼쳐 싣는 자리라 칸이 저절로 따라간다');
  const baitWn = wn.replace('if (T500_WINTER_FX && v) v.frost = ', 'if (v) v.frost = ');
  const bl = baitWn.split('\n').filter((l) => /\bfrost\b|_frostNow/.test(l));
  ok(!(bl.length === 1 && /if \(T500_WINTER_FX && v\) v\.frost = _frostNow\(now\);/.test(bl[0])), '④g 자명 통과 금지 — 손잡이를 벗기면 ④c 가 **빨개진다**');
  const wsrc = codeOnly(fs.readFileSync(R('server/weather.js'), 'utf8'));
  ok(!/\bfrost\b/i.test(wsrc), '④h `weather.js` 에 서리 0 — 기온은 **읽기만** 한다(T484 · 세션7 자리 무접촉)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 클라 세 자리 — **그 한 칸**(`myWeather.frost` 가 있는가)만 본다 · 끔이면 셋 다 종전 길
//    ★구조로 자른다(함수 본문 · 분기). 화소로는 픽셀 하네스 셋이 잰다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const rd = (f) => codeOnly(fs.readFileSync(R('public/client/' + f), 'utf8'));
  const T = rd('10-r1-terrain.js'), C = rd('00-const.js'), L = rd('34-m-renderloop.js'), WX = rd('37-r1-weather.js'), CH = rd('42-r2-char.js');
  // ⑤-1 서리(지면)
  const fn = fnBody(T, '_gtFrostNow'), fa = fnBody(T, '_gtFrostAlpha'), fp = fnBody(T, '_gtFrostPaint');
  ok(/myWeather\.frost > 0/.test(fn) && !/myCalendar|season|day|tempC/.test(fn), '⑤ 서리: 서버 값 하나를 **읽기만** 한다(날짜·기온 → 서리 사본 0)', fn.replace(/\s+/g, ' ').slice(0, 96));
  ok(/road > 0/.test(fa), '⑤b 제외 규칙 — 길(`road > 0`)은 안 칠한다(적설과 같은 표)', fa.replace(/\s+/g, ' ').slice(0, 90));
  const bake = fnBody(C, '_bakeGroundTile');
  const push = bake.split('\n').filter((l) => /_frostCells\.push/.test(l));
  const snowAt = bake.split('\n').map((l, i) => (/_gtSnowAlpha\(_st\)/.test(l) ? i : -1)).filter((i) => i >= 0);
  const pushAt = bake.split('\n').map((l, i) => (/_frostCells\.push\(sx, sy\)/.test(l) ? i : -1)).filter((i) => i >= 0);
  ok(push.length === 2 && push.every((l) => /if \(_gtFrostAlpha\(_st\) > 0\) _frostCells\.push\(sx, sy\);/.test(l))
    && snowAt.length === 2 && pushAt.every((i, k) => i === snowAt[k] + 1),
    '⑤c 지면 굽기에서 서리는 **적설 바로 뒤 두 자리**(산터·땅)에서만 모인다', `적설 ${snowAt.join(',')} · 서리 ${pushAt.join(',')}`);
  const wAt = bake.indexOf('if (isWater) {'), rAt = bake.indexOf('} else if (isRock) {'), eAt = bake.indexOf('} else {', rAt);
  ok(wAt > 0 && rAt > wAt && eAt > rAt && !/_frostCells|_gtFrost/.test(bake.slice(wAt, eAt)), '⑤d 물·바위 갈래엔 서리가 **없다**(제외 규칙 표 그대로)');
  const paint = bake.split('\n').filter((l) => /_gtFrostPaint\(/.test(l));
  const loopEnd = bake.indexOf('let bl = null;');   // 셀 루프 다음 첫 코드(잎 층) — 주석은 걷혀 있으니 코드로 잡는다
  ok(paint.length === 1 && /_gtFrostPaint\(g, gm, _frostCells, ICE_COLOR\);/.test(paint[0]) && bake.indexOf('_gtFrostPaint(') < loopEnd && bake.indexOf('_gtFrostPaint(') > bake.lastIndexOf('_frostCells.push'),
    '⑤e 칠은 셀 마감 **뒤 한 번** · 색은 세계 리터럴 `ICE_COLOR`(적설과 같은 색 · 판 토큰 0)');
  ok((fp.match(/beginPath\(\)/g) || []).length === 1 && (fp.match(/\.fill\(\)/g) || []).length === 1 && /_diaSub\(c, cells\[i\], cells\[i \+ 1\], false\)/.test(fp),
    '⑤f ★★서리는 **경로 하나 · 채움 한 번** — 칸마다 반투명 다이아를 칠하던 1판의 이음새 격자를 구조로 막는다', fp.replace(/\s+/g, ' ').slice(0, 120));
  const dp = fnBody(T, '_diaPath'), ds = fnBody(T, '_diaSub');
  ok(/g\.beginPath\(\); _diaSub\(g, cx, cy, grow\);/.test(dp) && /g\.moveTo\(cx, cy - dy\); g\.lineTo\(cx \+ dx, cy\); g\.lineTo\(cx, cy \+ dy\); g\.lineTo\(cx - dx, cy\); g\.closePath\(\);/.test(ds),
    '⑤g `_diaPath` = beginPath + `_diaSub` — 종전 다이아 명령이 **한 글자도 같다**(나눈 것뿐 · 끔 화소 동일의 전제)');
  const kf = L.split('\n').filter((l) => /_gtFrostNow\(\)/.test(l));
  ok(kf.length === 1 && /_gtFrostNow\(\) > 0 \? 'f' \+ _gtFrostNow\(\) : ''/.test(kf[0]), '⑤h 지문(`_kf`) — 서리가 0·끔이면 **빈 글자**(지문 그대로 ⇒ 다시 안 굽는다)');
  // ⑤-2 눈보라
  const won = fnBody(WX, 'wxWinterOn'), dw = fnBody(WX, 'drawWeather');
  ok(/myWeather\.frost !== undefined/.test(won), '⑤i 켬은 **칸이 있는가** 하나로 안다(T487 `snow` 칸과 같은 문법)', won.replace(/\s+/g, ' ').slice(0, 100));
  ok(/const blizzard = snow && wxWinterOn\(\);/.test(dw) && /precip \* \(blizzard \? 1 \+ Math\.abs\(tiltAir\) : 1\)/.test(dw)
    && /const tilt = blizzard \? tiltAir \* \(WX_RAIN_PXPS \/ WX_SNOW_PXPS\) : tiltAir;/.test(dw) && /Math\.min\(WX_MAX, /.test(dw),
    '⑤j 눈보라 — 켬 ∧ 눈일 때만 · 기울기 = 공기 자 × 낙하 속도 비(760/95) · 밀도 × (1 + |공기 자|) · 상한 `WX_MAX` 그대로');
  ok(/const tiltAir = Math\.max\(-1, Math\.min\(1, \(w\.wind \|\| 0\) \* WX_TILT_K\)\);/.test(dw), '⑤k 공기의 자는 **있는 `WX_TILT_K` 식 그대로**(부호 · |·| ≤ 1) — 새 문턱 0');
  ok(/ctx\.lineWidth = snow \? \(blizzard \? Math\.max\(WX_RAIN_W, WX_SNOW_W \/ Math\.hypot\(1, tilt\)\) : WX_SNOW_W\) : WX_RAIN_W;/.test(dw),
    '⑤k2 눈보라 굵기 = 눈 굵기 ÷ 획이 길어진 배(√(1+기울기²)) · 빗줄기 굵기에서 멈춘다 — 무풍이면 종전 굵기(먹이 줄 위에 퍼진다 · 새 수 0)');
  const dwL = lits(dw);
  const dwOld = [0, 0.5, 0.7, 0.75, 1, 2, 3, 5, 6, 8, 1000];   // 종전 drawWeather 의 수(흔들림·속도 퍼짐·자리 소금) — 이 카드가 더한 수는 0
  ok(dwL.every((v) => dwOld.includes(v)), '⑤l `drawWeather` 에 **새 수 0** — 수는 전부 종전 것(속도 퍼짐 0.75/0.5 · 소금 1·2·3·5 · 흔들림 6·0.7 · 여유 8 · 초 1000)', `[${dwL.join(', ')}]`);
  // ⑤-3 입김
  const db = fnBody(WX, 'drawBreath');
  const first = (db.split('{')[1] || '').split(';')[0].trim();
  ok(/^if \(!wxWinterOn\(\) \|\| down \|\| item\.carriedOn\) return 0$/.test(first), '⑤m 입김 첫 줄 — 끔·쓰러짐·업힘이면 **곧장** 돌아간다(끔 = 아무것도 안 한다)', first);
  ok(/w\.tempC != null && w\.tempC < 0/.test(db) && /playerIsIndoors\(\)/.test(db) && /isCellIndoor\(Math\.floor\(item\.ax \/ CL_BUILDING_SIZE\), Math\.floor\(item\.ay \/ CL_BUILDING_SIZE\), item\.floor \|\| 0\)/.test(db),
    '⑤n 조건 — 영하(문턱은 0℃ 하나) ∧ 그 몸의 칸이 바깥(나는 `playerIsIndoors` · 남은 `isCellIndoor` — 방 정본 둘)');
  ok(/idle\.frames \/ idle\.fps/.test(db) && /Math\.sin\(u \* 2 \* Math\.PI\) < 0/.test(db) && /charMouthOffset\(item\.pid\)/.test(db),
    '⑤o 숨 주기 = 선 판 한 바퀴(메타 판 수 ÷ fps) · 내쉬기 = 그 sin 이 음인 반 · 자리 = 메타 입(`charMouthOffset`)');
  ok(/e \* WX_RAIN_LEN/.test(db) && /ctx\.lineWidth = WX_SNOW_W/.test(db) && /ctx\.strokeStyle = WX_SNOW_RGBA/.test(db) && /ctx\.globalAlpha = a0 \* \(1 - e\)/.test(db),
    '⑤p 획 규격은 이 층의 것을 빌린다(길이 = 빗줄기 · 굵기·색 = 눈) · 알파는 **몸의 알파 위에 곱한다**(안개 규격)');
  const dbL = lits(db);
  ok(dbL.every((v) => [0, 0.5, 1, 2, 1000].includes(v)), '⑤q ★입김에 새 수 0 — 0·1(단위) · 0.5·2(반 주기 · 2π · 아이소 반 높이) · 1000(ms→초)뿐', `[${dbL.join(', ')}]`);
  ok(!/Math\.random|new Array|push\(\{[^}]*v[xy]:/.test(db), '⑤r 파티클 0 — 난수·입자 배열·속도 상태 없음(시각과 해시로만 낸다)');
  const calls = L.split('\n').filter((l) => /drawBreath\(/.test(l));
  const elseAt = L.indexOf('if (!_spriteOk) drawPlayerIso(');
  const callAt = L.indexOf('drawBreath(');
  ok(calls.length === 1 && /drawBreath\(s\.x, s\.y, item, fvx, fvy, downFlag, now\);/.test(calls[0]) && callAt > elseAt && callAt - elseAt < 900,
    '⑤s 렌더루프 호출은 **한 자리** — 시트가 그린 몸의 `else` 안(표식·이름표 앞)', calls.map((l) => l.trim()).join(''));
  const mo = fnBody(CH, 'charMouthOffset');
  ok(/m\.mouthScreen/.test(mo) && /st\.drawn/.test(mo) && /_charAnim\.get\(opts\.pid\)\.drawn = \[stt\.clip, stt\.frame, row\];/.test(CH),
    '⑤t 입 자리 = 그 몸이 **방금 그린 판**(클립·판·방향)의 메타 값 — 클라가 지어낸 수 0');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 입 자리(메타) — char_render.py 가 **몸에서** 잰 표(`handScreen` 문법) · 모든 판을 덮는다
// ─────────────────────────────────────────────────────────────────────────────
{
  const py = fs.readFileSync(R('scripts/char_render.py'), 'utf8');
  const M = JSON.parse(fs.readFileSync(R('public/assets/char/char_meta.json'), 'utf8'));
  ok(/_MR8, _MR9 = TORSO_R\[8\], TORSO_R\[9\]/.test(py) && /MOUTH_REST = V\(\(\(\(_MR8\[1\] \+ _MR8\[3\]\) \+ \(_MR9\[1\] \+ _MR9\[3\]\)\) \/ 2\.0, 0\.0, \(_MR8\[0\] \+ _MR9\[0\]\) \/ 2\.0\)\)/.test(py),
    '⑥ 입 = 턱 링(8)·광대 링(9) **앞면의 가운데** — 링 둘의 값을 평균할 뿐이다(새 수 0)');
  ok(/pb = rig\.pose\.bones\['head'\]/.test(py) && /pb\.matrix @ pb\.bone\.matrix_local\.inverted\(\)/.test(py), '⑥b 그 점은 **머리 뼈의 변형**으로 옮긴다(포즈 행렬 · 쉬는 행렬의 역) — 리그 오브젝트(방향·높이 압축)까지 태운다');
  const ring = (i) => { const m = py.match(new RegExp('\\((?:_hz\\()?([0-9.]+)\\)?,[^\\n]*#\\s*' + i + '\\s')); return m ? +m[1] : null; };
  const zNeck = ring(7), zTop = ring(13);
  const ms = M.mouthScreen || {};
  const miss = [];
  for (const [c, cf] of Object.entries(M.clips || {})) {
    const t = ms[c];
    if (!t || t.length !== M.dirs || t.some((r) => !r || r.length !== cf.frames || r.some((p) => !Array.isArray(p) || p.length !== 2))) miss.push(c);
  }
  ok(Object.keys(M.clips || {}).length > 0 && miss.length === 0, '⑥c 표가 **모든 클립 × 8방향 × 모든 판**을 덮는다', miss.join(' ') || `${Object.keys(ms).length}클립`);
  const idle = ms.idle || [];
  const hs = idle.flat().map((p) => (M.anchorY - p[1]) / M.pxPerMeterH);
  ok(zNeck !== null && zTop !== null && hs.length > 0 && hs.every((h) => h > zNeck && h < zTop),
    '⑥d 선 판의 입은 **목 링 위 · 정수리 아래**다(화면 높이 ÷ px/m — 링 값은 char_render.py 에서 읽는다)', `${Math.min(...hs).toFixed(3)}~${Math.max(...hs).toFixed(3)}m ∈ (${zNeck}, ${zTop})`);
  const dx = (d) => idle[d] && idle[d][0][0] - M.anchorX;
  ok(dx(0) > 0 && dx(4) < 0 && Math.abs(dx(0) + dx(4)) < 1e-6 && dx(2) < 0 && dx(6) > 0 && Math.abs(dx(2) + dx(6)) < 1e-6,
    '⑥e 입은 **바라보는 쪽**에 있다 — 동(0)은 오른쪽 · 서(4)는 왼쪽, 크기까지 대칭(남 2 · 북 6 도 같다)', [0, 2, 4, 6].map((d) => dx(d).toFixed(3)).join(' / '));
  const other = JSON.parse(JSON.stringify(M)); delete other.mouthScreen;
  ok(!('mouthScreen' in other) && typeof M.handScreen === 'object' && typeof M.carryOffset === 'object', '⑥f 메타의 다른 칸은 그대로 산다(`--only-meta` 재생산 — 보고 §③ 에서 나머지 칸 전부 동일을 쟀다)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
