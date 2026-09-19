#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 분할(서버·실클라를 띄운다 — 단위가 아니다)
// =============================================================================
// e2e-fogray — 시야 광선의 각도 통(bucket)은 그림을 한 픽셀도 안 바꾸고 광선×선분 검사를 줄인다
//   [2026-09-14 · 재민 실기 "화면이 60 이 아니다" → 실측 20fps · render 46ms: 캔버스 5ms · 시계 넷 6ms · 나머지가 시야 광선]
//
// ★무엇을 재나
//   `34-m-renderloop.js` 시야 다각형은 선분(벽·나무·바위·경계)마다 광선 6개를 쏘고 광선마다 **모든** 선분을 재서
//   O(선분²) 였다 — 마을 안(벽 수백)에서 프레임을 먹었다. 수리는 둘: ⓐ 벽 선분 목록을 내 셀·층·벽지도 판으로 캐시
//   ⓑ 선분을 원점 기준 **각도 통**(72개)에 넣고 광선은 제 통만 본다(같은 최소 t → 같은 다각형).
//
// ★자명 통과 금지 — 판정마다 반례를 같이 잰다:
//   ① A(통 켬) 와 B(통 끔 = 종전 전수) 를 **같은 자리에서 번갈아**(A B A B A B) 찍어 마스크 알파가 **0px 차이**
//      ↔ 반례: B 의 rsi 호출 수가 A 의 3배 넘게 많다(통이 실제로 뭔가를 걸렀다 — 안 걸렀으면 같은 수)
//   ② 같은 팔 두 프레임이 같다(결정성 — 세계가 그 사이 움직였으면 ①의 차이는 통 탓이 아니다)
//   ③ 두 자리(서서 · 걷고 나서)에서 반복
//   ★ms 는 안 잰다 — 기계 의존(족보 80). 광선×선분 **호출 수**가 자다.
//
// 사용: ZDB=/tmp/fogray.db node scripts/e2e-fogray.js
//   (서버가 이미 3010/3020 에 떠 있으면 그 서버를 쓴다 — 개발 중 빠른 반복용)
// =============================================================================
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/e2e-fogray.db';

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 110)); });
  procs.push(p); return p;
}
async function httpOk(url) { try { const r = await fetch(url); return r.ok; } catch (e) { return false; } }
async function waitHttp(url, tries = 900) { for (let i = 0; i < tries; i++) { if (await httpOk(url)) return true; await sleep(1000); } return false; }

(async () => {
  say('=== 시야 광선 각도 통 — 픽셀 동일 · 호출 수 (2026-09-14) ===');
  const reuse = await httpOk(`http://localhost:${ZPORT}/health`);
  if (!reuse) {
    fs.writeFileSync('/tmp/zone-wrap-fogray.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.3);
require(path.join(ROOT,'server','zone.js'));`);
    boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    await sleep(2500);
    boot('zone', '/tmp/zone-wrap-fogray.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0' });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
    await sleep(20000);
  } else say('  (떠 있는 서버를 쓴다)');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const clog = []; page.on('console', (m) => clog.push(m.text())); page.on('pageerror', (e) => clog.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  // 입장 뒤 마스크가 설 때까지(재연결 복구 포함) 기다린다 — 최대 90초
  const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__fogSegDbg), { timeout: 90000 }).then(() => true).catch(() => false);
  ok(entered, '입장 · 안개 마스크 섰다');
  if (!entered) { say('  콘솔 끝 12줄:'); for (const l of clog.slice(-12)) say('    ' + l.slice(0, 160)); await browser.close(); for (const p of procs) p.kill(); say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }
  await sleep(3000);

  // 한 팔 찍기 — 통 켬/끔을 바꾸고 두 프레임 뒤 마스크 알파를 남긴다
  // ★★★[T322 2026-09-19] **정해진 프레임 수로 기다리지 않는다 — 훅이 다시 쓰일 때까지 기다린다.**
  //   종전: 손잡이를 바꾸고 `rAF` 를 네 번(두 번씩 두 판) 기다린 뒤 훅을 읽었다. 그 판들이
  //   안개 계산 줄을 **지나기 전**이면 **낡은 판**을 읽는다 — T314 실측 R1 `A rsi 4877 = B rsi 4877`
  //   (같은 수 = 한 프레임도 안 먹혔다). 둘째 바퀴(R2)는 덥혀져 갈리니 "첫 판만 빨강"으로 보였다.
  //   ⇒ `__fogSegDbg.n`(T322 이 단 칸 · 그 줄을 지날 때마다 는다)이 **두 번 이상 바뀔 때까지** 돈다.
  //     두 번인 이유: 손잡이는 다음 계산부터 먹으므로 한 번은 아직 옛 값일 수 있다.
  //   ⚠못 바뀌면 `stale: true` 로 **말한다**(조용히 옛 값을 돌려주지 않는다).
  const cap = (label, noBucket) => page.evaluate(async ([label, noBucket]) => {
    const n0 = (window.__fogSegDbg && window.__fogSegDbg.n) | 0;
    window.__fogNoBucket = noBucket;
    const wait = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    let stale = true;
    for (let k = 0; k < 60; k++) { await wait(); if ((((window.__fogSegDbg && window.__fogSegDbg.n) | 0) - n0) >= 2) { stale = false; break; } }
    window.__fograyStale = stale;
    const mc = window._shadowMask; const d = mc.getContext('2d').getImageData(0, 0, mc.width, mc.height).data;
    const a = new Uint8Array(d.length / 4); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    window.__fograyKeep = window.__fograyKeep || {}; window.__fograyKeep[label] = a;
    return { segs: window.__fogSegDbg.segs, rays: window.__fogSegDbg.rays, rsi: window.__fogSegDbg.rsi, bucket: window.__fogSegDbg.bucket, n: window.__fogSegDbg.n | 0, stale };
  }, [label, noBucket]);
  const diff = (a, b) => page.evaluate(([a, b]) => { const A = window.__fograyKeep[a], B = window.__fograyKeep[b]; if (!A || !B || A.length !== B.length) return { n: -1, mx: -1 }; let n = 0, mx = 0; for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d) { n++; if (d > mx) mx = d; } } return { n, mx }; }, [a, b]);

  const seq = ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'];
  for (let round = 0; round < 2; round++) {
    const info = {};
    for (const l of seq) info[l] = await cap(l, l[0] === 'B');
    const stale = seq.filter((l) => info[l].stale);
    // ⚠이 하네스의 `ok` 는 **두 인자**다(셋째를 주면 사라진다) — 수는 문장 안에 적는다.
    ok(stale.length === 0, `R${round + 1}: ★전제 — 여섯 판 모두 **새로 계산된 훅**을 읽었다`
       + (stale.length ? ` — 낡은 판 ${stale.join(' ')} (훅 n ${info.A1.n}→${info.B3.n}) · 아래 수는 못 믿는다`
                       : ` (낡은 판 0 · 훅 n ${info.A1.n}→${info.B3.n})`));
    ok(info.A1.bucket === true && info.B1.bucket === false, `R${round + 1}: 손잡이가 실제로 갈렸다 (A 통 ${info.A1.bucket} · B 통 ${info.B1.bucket})`);
    const dAA = await diff('A1', 'A2'), dBB = await diff('B1', 'B2');
    ok(dAA.n === 0 && dBB.n === 0, `R${round + 1}: 결정성 — 같은 팔 두 프레임 동일 (A ${dAA.n}px · B ${dBB.n}px)`);
    let worst = 0, worstMx = 0;
    for (let i = 0; i + 1 < seq.length; i++) { const d = await diff(seq[i], seq[i + 1]); if (d.n > worst) worst = d.n; if (d.mx > worstMx) worstMx = d.mx; }
    ok(worst === 0, `R${round + 1}: ★A↔B 마스크 알파 0px 차이 (최악 ${worst}px · 최대 Δ${worstMx}) — 선분 ${info.A1.segs} · 광선 ${info.A1.rays}`);
    const ratio = info.B1.rsi / Math.max(1, info.A1.rsi);
    ok(ratio >= 3, `R${round + 1}: 반례 — 통 끔은 검사가 ${ratio.toFixed(1)}배 많다 (A rsi ${info.A1.rsi} · B rsi ${info.B1.rsi} · ≥3 이어야 통이 일한 것)`);
    if (round === 0) { await page.keyboard.down('d'); await sleep(1200); await page.keyboard.up('d'); await sleep(800); }
  }
  await page.evaluate(() => { window.__fogNoBucket = false; });
  await browser.close(); for (const p of procs) p.kill();
  say(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) p.kill(); process.exit(1); });
