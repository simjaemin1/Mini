#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-weather.js — 강수 정본 하네스 ================================
//
// ★[재민 확정 2026-09-05 · T98] 대상: `server/weather.js` 강수 절(`precipAt`) + `zone.js weatherFor` 접점.
//   `test-winter` 옆에 선다(겨울나기는 겨울을 재고, 이건 하늘을 잰다).
//
// ★★이 하네스의 제1 원칙 — **허용치를 손으로 적지 않는다.**
//   "월별 강수일 비율이 앵커 ±얼마 안" 에서 그 '얼마'를 사람이 고르면, 통과하도록 고르게 된다.
//   여기서는 **이항분포의 바닥에서 유도한다**: 그 달이 창 안에 n 일 있고 앵커가 p 면
//   1σ = √(p(1−p)/n) 다. 허용은 3σ. 이건 취향이 아니라 **셈이 허락하는 최선**이고,
//   그래서 "느슨하게 잡아 통과시켰다"는 말이 성립하지 않는다.
//   ⇒ 대신 느슨함을 세 곳에서 되갚는다: ⓐ 창 전체 합(n 이 커서 띠가 좁다) ⓑ 30년 창
//   ⓒ **자명 통과 금지** — 앵커를 일부러 틀리게 넣으면 이 검사가 실제로 빨개지는지 본다.
//
// 실행: node scripts/test-weather.js
'use strict';

const fs = require('fs');
const path = require('path');
const R = (p) => path.join(__dirname, '..', p);

const W = require(R('server/weather.js'));
const Crops = require(R('server/crops.js'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const MN = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

/** 씨앗을 갈아 끼운 **새 사본**을 적재한다(돌연변이 검사용 — 원본 모듈은 건드리지 않는다). */
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
/** 창 하나의 월별 실측 — {cnt, tot, worst:{i,err,sig}, zeros, sum} */
function scan(mod, days, from, pOf) {
  const P = pOf || ((m) => mod.precipPOfMonth(m));
  const cnt = new Array(12).fill(0), tot = new Array(12).fill(0);
  for (let d = from; d < from + days; d++) {
    const m = Crops.monthOf(d) - 1;
    tot[m]++;
    if (mod.precipAt(d) > 0) cnt[m]++;
  }
  let worst = { i: 0, err: 0, sig: 0 }, zeros = 0, sum = 0, exp = 0, vr = 0;
  for (let i = 0; i < 12; i++) {
    const p = P(i + 1), n = tot[i];
    sum += cnt[i]; exp += n * p; vr += n * p * (1 - p);
    if (cnt[i] === 0) zeros++;
    if (!n) continue;
    const err = cnt[i] / n - p, sig = Math.sqrt(p * (1 - p) / n);
    if (Math.abs(err) / sig > Math.abs(worst.err) / (worst.sig || 1)) worst = { i, err, sig };
  }
  return { cnt, tot, worst, zeros, sum, exp, sd: Math.sqrt(vr) };
}
const line = (mod, s, i) => `${MN[i].padStart(3)} 앵커 ${(mod.precipPOfMonth(i + 1) * 100).toFixed(1).padStart(4)}%`
  + ` · 실측 ${(s.tot[i] ? s.cnt[i] / s.tot[i] * 100 : 0).toFixed(1).padStart(4)}% (${String(s.cnt[i]).padStart(4)}/${String(s.tot[i]).padStart(5)})`;

console.log('\n=== 강수 정본 하네스 (T98) ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// ① 앵커 열둘 + 출처 — **새 수는 이것뿐이고, 출처가 코드에 붙어 있다**
//    ★기계가 읽는다(test-winter ① 문법). "읽어 봤더니 맞더라"는 검사가 아니다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const src = fs.readFileSync(R('server/weather.js'), 'utf8');
  const body = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');   // 주석 줄 제외

  ok(Array.isArray(W.PRECIP_DAYS) && W.PRECIP_DAYS.length === 12, '① 앵커가 열둘이다', JSON.stringify(W.PRECIP_DAYS));
  const yr = W.PRECIP_DAYS.reduce((a, b) => a + b, 0);
  ok(Math.abs(yr - 105.5) < 0.05, '①b 열둘의 합이 연 강수일수와 같다(부여 평년 105.5일)', `${yr.toFixed(1)}일`);
  ok(W.PRECIP_DAYS.every((v) => v > 0 && v < 32), '①c 열둘이 전부 "그 달의 날 수" 안에 있다');
  ok(W.PRECIP_DAYS[6] === Math.max(...W.PRECIP_DAYS), '①d 가장 잦은 달이 **7월**이다(장마가 표에 있다)',
    `7월 ${W.PRECIP_DAYS[6]}일 · 가장 적은 달 ${Math.min(...W.PRECIP_DAYS)}일`);

  ok(/data\.kma\.go\.kr\/normals/.test(src), '①e 출처 URL 이 소스에 있다(기상청 평년값 포털)');
  ok(/부여/.test(src) && /1991~2020/.test(src), '①f 관측소(부여)와 기간(1991~2020)이 소스에 있다');

  // ★손잡이 0 — 강수에는 환경변수가 하나도 없다(씨앗은 종전부터 있던 `WEATHER_SEED` 하나뿐)
  const knobs = (body.match(/_(?:num|int)\('([A-Z0-9_]+)'/g) || []).map((s) => s.slice(6, -1));
  ok(!knobs.some((k) => /PRECIP|RAIN|SNOW/.test(k)), '①g 강수 손잡이 0 — 환경변수로 기후를 못 바꾼다', knobs.join(' ') || '(없음)');

  // ★자명 통과 방지 — 상수가 없는 게 아니라 **아무것도 안 하는 것**일 수 있다
  ok(/precipPOfMonth/.test(body) && /PRECIP_DAYS\[/.test(body), '①h (자명 통과 방지) 앵커를 실제로 읽어 p 를 만든다');
  ok(/require\('\.\/crops'\)/.test(body) && /monthOf/.test(body), '①i (자명 통과 방지) 달은 `crops.monthOf` **정본**을 부른다(새 시계 0)');
  ok(!/\bday\s*%\s*365\b/.test(body), '①j 강수가 `day % 365` 를 쓰지 않는다 — **절대 게임일**이다');
  // ★분위수 표는 폐기됐다(초안에 있었다) — 죽은 코드가 남아 있지 않은지 같이 본다
  ok(!/_precipSample|precipThreshold/.test(src), '①k 폐기한 분위수 표가 소스에 남아 있지 않다');
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 월별 강수일 **비율**이 앵커 안이다 — 800일 · 3년
//    ⚠"며칠"이 아니라 **비율**이다: 게임 겨울은 95일이라 게임 2월이 32일이다(그레고리력 28.25 아님).
//      p 는 "하루가 비 올 확률"이라 그대로 옳고, 늘어난 건 날 수다.
// ─────────────────────────────────────────────────────────────────────────────
const WINDOWS = [['800일', 800, 0], ['3년', 1095, 0], ['3년(4000일째부터)', 1095, 4000], ['30년', 10950, 0]];
for (const [name, days, from] of WINDOWS) {
  const s = scan(W, days, from);
  const z = Math.abs(s.worst.err) / s.worst.sig;
  console.log(`  ── ${name} (day ${from}~${from + days - 1}) · ${(s.sum / days * 365).toFixed(1)}일/년`);
  for (let i = 0; i < 12; i++) console.log('     ' + line(W, s, i));
  ok(z <= 3, `② ${name}: 가장 어긋난 달도 **3σ 안**`,
    `${MN[s.worst.i]} 오차 ${(s.worst.err * 100).toFixed(1)}%p · 1σ ${(s.worst.sig * 100).toFixed(1)}%p ⇒ ${z.toFixed(2)}σ`);
  ok(s.zeros === 0, `②b ${name}: **비가 한 번도 안 온 달 0개**`, `0일인 달 ${s.zeros}`);
  const zt = Math.abs(s.sum - s.exp) / s.sd;
  ok(zt <= 3, `②c ${name}: 창 전체 강수일 합도 3σ 안(띠가 좁다)`,
    `실측 ${s.sum}일 · 기대 ${s.exp.toFixed(1)}일 · 1σ ${s.sd.toFixed(1)}일 ⇒ ${zt.toFixed(2)}σ`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ ★자명 통과 금지 — ② 가 **실제로 빨개질 수 있는** 검사인가
//    하늘은 그대로 두고 **앵커만 틀리게** 재 본다(7월을 1월처럼 마르게). 같은 잣대가 이걸 잡아야 한다.
//    ⚠앵커와 생성기를 **같이** 바꾸면 둘이 나란히 움직여 그대로 초록이 된다 — 초안이 그렇게 틀렸다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const wrong = (m) => W.precipPOfMonth(m === 7 ? 1 : m);        // 7월만 1월 앵커로 갈아 끼운다
  const s = scan(W, 10950, 0, wrong);
  const z = Math.abs(s.worst.err) / s.worst.sig;
  ok(z > 3, '③ (자명 통과 금지) 앵커를 틀리게 넣으면 ② 가 **빨개진다**',
    `${MN[s.worst.i]} ⇒ ${z.toFixed(1)}σ (3σ 밖)`);
  const rightZ = (() => { const t = scan(W, 10950, 0); return Math.abs(t.worst.err) / t.worst.sig; })();
  ok(rightZ <= 3, '③b (대조) 같은 창을 **맞는 앵커**로 재면 초록이다', `${rightZ.toFixed(2)}σ`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 결정론 — 같은 날은 언제 물어도 같다(주사위 0 · 메모가 답을 바꾸지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
{
  const a = [], b = [], c = [];
  for (let d = 0; d < 400; d++) a.push(W.precipAt(d));
  for (let d = 0; d < 400; d++) b.push(W.precipAt(d));                       // 그대로 다시
  for (let d = 399; d >= 0; d--) c.unshift(W.precipAt(d));                   // 거꾸로 — 메모 슬롯이 계속 어긋난다
  ok(JSON.stringify(a) === JSON.stringify(b), '④ 두 번 물어도 같다');
  ok(JSON.stringify(a) === JSON.stringify(c), '④b **묻는 순서**가 답을 바꾸지 않는다(한 슬롯 메모 검사)');
  let inter = true;
  for (let d = 0; d < 200; d++) { W.precipAt(d + 5000); if (W.precipAt(d) !== a[d]) inter = false; }
  ok(inter, '④c 사이에 다른 날을 끼워 물어도 같다');
  ok(a.some((v) => v > 0) && a.some((v) => v === 0), '④d (자명 통과 방지) 그 400일에 오는 날도 안 오는 날도 있다',
    `오는 날 ${a.filter((v) => v > 0).length}/400`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ "매년 7월 1일이 같으면 안 된다" — 절대 게임일 캐논이 강수에도 선다
// ─────────────────────────────────────────────────────────────────────────────
{
  const YD = 365;
  let diff = 0, tot = 0, sameMonth = 0;
  for (let k = 0; k < 60; k++) {
    const d0 = 120 + k * YD, d1 = 120 + (k + 1) * YD;
    tot++;
    if (Crops.monthOf(d0) === Crops.monthOf(d1)) sameMonth++;
    if (W.precipAt(d0) !== W.precipAt(d1)) diff++;
  }
  ok(sameMonth === tot, '⑤ 전제: 해가 바뀌어도 **같은 날짜**다(달이 같다)', `${sameMonth}/${tot}`);
  ok(diff >= tot * 0.4, '⑤b 그런데 그날의 강수는 해마다 다르다', `${diff}/${tot}회 다름`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 강도 — 0..1 · 안 오는 날은 **정확히 0** · 장마철이 더 세다(앵커에서 저절로)
// ─────────────────────────────────────────────────────────────────────────────
{
  let mn = 1, mx = 0, n = 0, sJul = 0, nJul = 0, sJan = 0, nJan = 0, bad = 0;
  for (let d = 0; d < 10950; d++) {
    const v = W.precipAt(d);
    if (!(v >= 0 && v <= 1)) bad++;
    if (v > 0) { n++; mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const m = Crops.monthOf(d);
    if (v > 0 && m === 7) { sJul += v; nJul++; }
    if (v > 0 && m === 1) { sJan += v; nJan++; }
  }
  ok(bad === 0 && n > 0, '⑥ 강도가 전부 0..1 안이다', `오는 날 ${n}일 · 범위 ${mn.toFixed(4)}..${mx.toFixed(4)}`);
  ok(mx <= W.precipPOfMonth(7) + 1e-9, '⑥b 가장 센 비도 **7월 앵커 비율**을 넘지 않는다(강도의 천장이 표에서 나온다)',
    `최대 ${mx.toFixed(4)} ≤ ${W.precipPOfMonth(7).toFixed(4)}`);
  const rJul = sJul / nJul, rJan = sJan / nJan;
  ok(rJul > rJan * 1.5, '⑥c 장마철(7월)이 한겨울(1월)보다 **눈에 띄게 세다** — 규칙을 더 만들지 않았는데도',
    `비 온 날 평균 7월 ${rJul.toFixed(4)} vs 1월 ${rJan.toFixed(4)} = ${(rJul / rJan).toFixed(2)}배 (앵커 mm 는 5.6배)`);
  // ⚠강도에는 앵커가 없다(회부) — 지금 값이 실제 강수량 비(5.6배)보다 약하다는 걸 **기록**해 둔다
  console.log(`     ⓘ 회부 근거: 부여 평년 강수량은 7월 20.0mm/일 vs 1월 3.6mm/일 = 5.6배 — 지금 세기는 방향만 맞다`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 돌연변이 — 씨앗을 바꾸면 하늘이 바뀐다(그런데 앵커는 그대로 지켜진다)
// ─────────────────────────────────────────────────────────────────────────────
{
  const A = loadWeather(20260831), B = loadWeather(19940412);
  let diff = 0;
  for (let d = 0; d < 1095; d++) if ((A.precipAt(d) > 0) !== (B.precipAt(d) > 0)) diff++;
  ok(diff > 300, '⑦ 씨앗을 바꾸면 비 오는 날이 달라진다', `1095일 중 ${diff}일 다름`);
  const sB = scan(B, 10950, 0);
  ok(Math.abs(sB.worst.err) / sB.worst.sig <= 3, '⑦b 그래도 **다른 씨앗도 앵커를 지킨다**(우연히 맞은 씨앗 하나가 아니다)',
    `${MN[sB.worst.i]} ⇒ ${(Math.abs(sB.worst.err) / sB.worst.sig).toFixed(2)}σ`);
  const sA = scan(A, 1095, 0);
  ok(JSON.stringify(sA.cnt) === JSON.stringify(scan(W, 1095, 0).cnt), '⑦c 기본 씨앗 사본이 원본과 같다(적재 경로가 하나다)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ 접점 — `zone.js weatherFor` 가 `precip` 을 싣는다 · 클라는 이미 그걸 읽고 있다
//    ⚠소스를 **글자 수로 자르지 않는다**(T62 ·T85 가 그렇게 물렸다) — 함수 끝까지 구조로 자른다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const zsrc = fs.readFileSync(R('server/zone.js'), 'utf8');
  const at = zsrc.indexOf('\nfunction weatherFor(');
  const end = zsrc.indexOf('\n}\n', at);
  const fn = at >= 0 && end > at ? zsrc.slice(at, end + 3) : '';
  ok(fn.length > 0 && /exp: wexp/.test(fn), '⑧ 전제: `weatherFor` 본문을 통째로 집었다', `${fn.split('\n').length}줄`);
  ok(/require\('\.\/weather'\)\.precipAt\(/.test(fn), '⑧b `weatherFor` 가 **정본** `weather.precipAt` 을 부른다(사본 0)');
  ok(/\bprecip\b\s*[,}]/.test(fn.slice(fn.indexOf('return Object.assign'))), '⑧c 그 값이 **응답에 실린다**');
  ok((fn.match(/gameDayNow\(\)/g) || []).length === 1, '⑧d 시계가 하나다 — 이미 낸 `day` 를 쓴다(새로 안 묻는다)');
  const csrc = fs.readFileSync(R('public/client/37-r1-weather.js'), 'utf8');
  ok(/w\.precip/.test(csrc), '⑧e (T93 무접촉) 클라 층은 이미 `wx.precip` 을 읽고 있다 — 값이 오는 날 저절로 켜진다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
