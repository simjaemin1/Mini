#!/usr/bin/env node
// @regress
// === scripts/test-hist.js — tick 간격 통계 하네스 [2026-09-01] =================
// 이 숫자들이 BENCHMARK.md 에 그대로 실린다. 틀리면 문서 전체가 무너진다.
// ⇒ 히스토그램 백분위수를 **정렬 배열 브루트포스와 대조**한다(무작위 표본 여러 벌).
'use strict';
const path = require('path');
const H = require(path.resolve(__dirname, '..', 'bench', 'hist.js'));
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined ? `  ${d}` : '')); };

// 브루트포스 정본 — nearest-rank
const bPct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.max(1, Math.ceil(s.length * p)) - 1]; };
const bOver = (a, t) => a.filter((v) => v > t).length / a.length;

console.log('\n=== tick 간격 통계 ===\n① 정렬 배열과 같은 답을 내는가');
let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const makers = {
  '정상(33ms 부근)': () => 28 + Math.floor(rnd() * 12),
  '꼬리 무거움': () => (rnd() < 0.05 ? 200 + Math.floor(rnd() * 600) : 30 + Math.floor(rnd() * 8)),
  '균등 0~500': () => Math.floor(rnd() * 501),
  '전부 같은 값': () => 33,
};
for (const [name, mk] of Object.entries(makers)) {
  const a = []; const h = H.newHist();
  for (let i = 0; i < 200000; i++) { const v = mk(); a.push(v); H.hAdd(h, v); }
  const good = [0.5, 0.95, 0.99].every((p) => H.hPct(h, p) === bPct(a, p));
  ok(good, `${name} — p50·p95·p99 가 정렬 배열과 일치`,
     `p50 ${H.hPct(h, 0.5)}/${bPct(a, 0.5)} · p95 ${H.hPct(h, 0.95)}/${bPct(a, 0.95)} · p99 ${H.hPct(h, 0.99)}/${bPct(a, 0.99)}`);
  ok(Math.abs(H.hOverRatio(h, 60) - bOver(a, 60)) < 1e-9, `${name} — 60ms 초과 비율 일치`,
     `${(100 * H.hOverRatio(h, 60)).toFixed(3)}%`);
  // ★`Math.max(...a)` 는 20만 개에서 스택을 터뜨린다(실제로 터졌다) — 접어서 센다
  let amax = -1, asum = 0; for (const v of a) { if (v > amax) amax = v; asum += v; }
  ok(h.max === amax && Math.abs(H.hMean(h) - asum / a.length) < 1e-9, `${name} — max·평균 일치`);
}

console.log('\n② ★자명 통과 금지 — 분포가 서로 실제로 다른가');
// ★내 첫 시도는 꼬리를 **정확히 5%** 로 만들어 놓고 p95=500 을 기대했다 — 틀렸다.
//   nearest-rank p95 는 그 경계에 **앉으므로** 33 을 낸다. 꼬리를 10% 로 해야 갈린다.
//   (판정이 빨개져서 알았다. 이게 하네스를 먼저 의심해야 하는 이유다.)
const hFlat = H.newHist(), hTail = H.newHist();
for (let i = 0; i < 50000; i++) { H.hAdd(hFlat, 33); H.hAdd(hTail, i % 10 === 0 ? 500 : 33); }
ok(H.hPct(hFlat, 0.95) === 33 && H.hPct(hTail, 0.95) === 500,
   '꼬리 10%면 p95 가 실제로 갈린다 — 평균이었다면 못 잡는다',
   `평균 33 vs ${H.hMean(hTail).toFixed(1)}(비슷) · p95 33 vs 500(갈린다)`);

console.log('\n③ 종전 판이 왜 틀렸는지 — 잘라내기 편향 재현');
{ // ★첫 구성도 틀렸다 — 느린 구간을 33% 로 잡아서 잘라내도 p95 가 여전히 꼬리에 앉았다.
  //   편향이 드러나려면 느린 구간이 **5% 언저리**여야 한다: 앞을 자르면 5% 밑으로 내려가
  //   p95 가 꼬리 밖으로 미끄러진다. 그게 종전 판이 400명 구간에서 겪던 일이다.
  const a = []; const h = H.newHist();
  const SLOW = 3600, N = 60000;                        // 6% 가 느림 · 전부 앞쪽에 몰려 있다
  for (let i = 0; i < N; i++) { const v = i < SLOW ? 300 : 33; a.push(v); H.hAdd(h, v); }
  const truncated = a.slice(10000);                    // 종전 splice(0,10000) 가 하던 일
  ok(H.hPct(h, 0.95) === bPct(a, 0.95), '히스토그램은 전 구간 p95 를 낸다', `${H.hPct(h, 0.95)}ms`);
  ok(bPct(truncated, 0.95) !== bPct(a, 0.95),
     '앞을 잘라낸 배열은 다른 답을 낸다 — 그게 종전 판의 버그다',
     `자른 것 ${bPct(truncated, 0.95)}ms vs 전 구간 ${bPct(a, 0.95)}ms (느린 구간 6% → 잘리면 0%)`);
}

console.log('\n④ 경계');
{ const h = H.newHist(); ok(Number.isNaN(H.hPct(h, 0.5)), '표본 0 이면 NaN(0 이 아니라)'); }
{ const h = H.newHist(); H.hAdd(h, 5000); H.hAdd(h, 5000);
  ok(h.over === 2 && h.max === 5000, `${H.HMAX}ms 넘는 값은 over 로 세고 max 는 실측을 남긴다`, `max ${h.max}ms`);
  ok(H.hPct(h, 0.5) === 5000, '전부 넘침이면 백분위수는 실측 최대를 준다(2000 으로 깎지 않는다)'); }

console.log('\n⑤ loadtest.js 가 이 모듈을 쓴다');
const src = require('fs').readFileSync(path.resolve(__dirname, '..', 'loadtest.js'), 'utf8');
ok(/require\('\.\/bench\/hist\.js'\)/.test(src), 'loadtest.js 가 bench/hist.js 를 문다(사본 금지)');
ok(!/tickIntervals/.test(src), '종전 배열 누적(tickIntervals)이 남아 있지 않다');
// ★첫 판은 `/splice/` 를 통째로 금지했다가 **머리말 주석의 설명**에 걸렸다.
//   금지할 것은 낱말이 아니라 **코드**다 — 주석은 오히려 남아 있어야 한다.
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
ok(!/\.splice\(/.test(code), '코드에 잘라내기(.splice()) 호출이 없다 — 편향의 원인', '(주석의 설명은 남겨 둔다)');

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
