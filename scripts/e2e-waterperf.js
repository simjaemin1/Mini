#!/usr/bin/env node
// =============================================================================
// e2e-waterperf — 물가 렉 실측 하네스 [배치 20 B · 재민 실기 제보 대응]
//   재민: *"물 근처로 가니까 엄청나게 렉걸린다"*
//
// ★이 하네스가 존재하는 이유 = **기존 하네스가 못 잡은 것**을 잡기 위해서다.
//   e2e-terrain 은 촬영을 **고정 지점**에서 했다. 흐름 텍스처는 카메라가 16셀(512px) 움직여야
//   다시 굽는데, 안 걸으면 평생 한 번만 굽는다 — 계측기가 실사용의 그 동작을 안 했다.
//   그래서 이 하네스는 **걷는다**. 걸으면서 흐름 텍스처를 굽는 시간을 잰다.
//
// ★자명 통과 금지 — 판정마다 반례를 같이 잰다:
//   ⓐ 수리본이 빠르다        ↔ 반례: 손잡이 `slowFlow`(공간 색인·물판정 재사용 끔)는 **느리다**
//   ⓑ 그림이 안 바뀌었다      ↔ 반례: 같은 지점 두 손잡이의 물 픽셀이 사실상 동일
//   ⓒ 실제로 물을 보고 있었다  ↔ 반례: 물 0% 화면이면 아무것도 증명 못 한다
//
// 사용: ZDB=/tmp/wp.db node scripts/e2e-waterperf.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/e2e-waterperf';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/e2e-waterperf.db';
fs.mkdirSync(SHOTS, { recursive: true });

// 강가 — e2e-terrain 과 같은 지점(정본 판독기가 고른 셀)
const SITE = { cx: 1490, cy: 2477, why: '한여울강 하류 · 17×17 창 물 127 · 바위 0' };

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
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) { } await sleep(1000); }
  return false;
}
fs.writeFileSync('/tmp/zone-wrap-wp.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

const isWaterPx = (r, g, b) => b > r + 18 && b + g > r * 2 + 20;
function waterPct(png, box) {
  const [x0, y0, x1, y1] = box; let n = 0, t = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * png.width + x) * 4; t++;
    if (isWaterPx(png.data[i], png.data[i + 1], png.data[i + 2])) n++;
  }
  return n / t * 100;
}
function meanAbsDiff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.width + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  }
  return s / n / 3;
}
const BOX = [40, 260, 1360, 860];

(async () => {
  say('=== 물가 렉 실측 (배치 20 B — 재민 제보) ===');
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  const z = boot('zone', '/tmp/zone-wrap-wp.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',   // ★e2e-terrain 과 같게 — 이걸 끄면 mainSquare 스폰이 안 먹어 엉뚱한 마을에서 시작한다(1패스에서 물 0% 로 잡혔다)
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '물가렉' } }),
  });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(4000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) { }
  }
  await sleep(20000);

  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(600); };
  //   ★[계측 격리 2026-08-07] 배치 21 이 **지면 풀 카펫**을 흔들리게 했다 — 이제 화면은
  //     시각이 흐르면 저절로 바뀐다. 이 하네스는 서로 다른 시각에 찍은 두 프레임을 픽셀로
  //     비교하므로, 안 끄면 **흔들린 풀을 '차이'로 오독한다**(실측: 산 반례 33.4%, 물 |Δ| 3.16).
  //     기준을 낮추는 대신 **재는 층을 격리**한다. ★sleep 이 붙은 knob() 이 아니라 **측정 전에
  //     곧바로** 끈다 — 격리가 실험 타이밍을 밀면 뙈기/자리 선택이 바뀐다(e2e-tilestate 에서 겪었다).
  await page.evaluate(() => { window.__terrain19.windOff = true; });

  const grab = async (n) => { const p2 = `${SHOTS}/${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const pulse = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(120); };

  // ── 걷기 주행: 같은 길을 손잡이만 바꿔 두 번. 매번 캐시를 식혀 **처음 보는 땅** 비용을 잰다.
  // ★주행 비용은 **정본 `_buildFlowTex` 를 그대로 불러** 잰다(하네스가 계산을 다시 쓰지 않는다).
  //   걸어서 재려면 512px 마다 8초라 A/B 두 바퀴가 안 돈다 — 아래 ⓒ 에서 "걸으면 실제로 다시
  //   굽는다"를 따로 증명하므로, 이 대리 측정이 실사용과 같은 동작이라는 근거가 있다.
  async function probe(label, opts, step) {
    await knob(opts);
    await page.evaluate(() => window.__wfReset && window.__wfReset());
    await sleep(400);
    const t = await page.evaluate((s) => window.__wfProbe(8, s), step);
    const ms = t.map((v) => v.ms);
    const max = Math.max(...ms), avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    say(`    ${label}: 장당 ${ms.map((v) => v.toFixed(0)).join('·')}ms → 최대 ${max.toFixed(0)} 평균 ${avg.toFixed(0)}` +
        `  (마지막 장 물판정 ${t[t.length - 1].wet}ms · 새질문 ${t[t.length - 1].asked} · 흐름 ${t[t.length - 1].flow}ms` +
        ` · 방향매끈+Φ ${t[t.length - 1].phi}ms)`);
    return { max, avg, n: ms.length, last: t[t.length - 1] };
  }
  // 미결 칸이 0 이 될 때까지 기다린다(예산제는 몇 프레임에 나눠 채운다 — 그림 비교는 그 뒤에)
  async function settle(maxMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const p2 = await page.evaluate(() => window.__wfPendN);
      if (p2 === 0 || p2 == null) return true;
      await sleep(250);
    }
    return false;
  }

  say(`\n── 강가 셀(${SITE.cx},${SITE.cy}) — ${SITE.why}`);
  const d0 = await page.evaluate(() => window.__waterDbg);
  say(`    계약: ${JSON.stringify({ webgl: d0.webgl, on: d0.on, segs: d0.segs, segGrid: d0.segGrid })}`);
  ok(d0.webgl === true && d0.on === true, 'WebGL 물 레이어가 켜져 있다');
  ok(d0.segs > 1000, `강 구간을 실제로 읽었다 (${d0.segs})`);
  ok(d0.segGrid > 100, `★공간 색인이 실제로 만들어졌다 (칸 ${d0.segGrid})`);

  // 스폰이 항상 물가는 아니다 — 물이 화면에 들어올 때까지 걸어간다(시험의 전제 조건이지 판정 완화가 아니다).
  let wp = 0;
  for (let tryN = 0; tryN < 5; tryN++) {
    const sh = await grab('fast-start' + tryN);
    wp = waterPct(sh, BOX);
    say(`    화면 물 비율 ${wp.toFixed(1)}% (걷기 ${tryN}회)`);
    if (wp > 3) break;
    for (let i = 0; i < 4; i++) { await pulse('d', 1600); await pulse('w', 900); }
  }
  ok(wp > 3, `★자명 통과 금지 — 실제로 물을 보고 있다 (${wp.toFixed(1)}%)`);

  say('\n[ⓐ 걷는 속도로 창이 밀릴 때 — 흐름 텍스처 장당 시간 (step 16셀 = 실제 주행 한 칸)]');
  const slow = await probe('대조군(slowFlow=수리 전 비용)', { slowFlow: true }, 16);
  const fast = await probe('수리본', { slowFlow: false }, 16);
  ok(fast.max < slow.max / 3, `★★수리본이 한 장 최대에서 3배 이상 빠르다 (${fast.max.toFixed(0)}ms vs ${slow.max.toFixed(0)}ms)`);
  ok(fast.avg < slow.avg / 3, `★★평균도 3배 이상 (${fast.avg.toFixed(0)}ms vs ${slow.avg.toFixed(0)}ms)`);
  ok(fast.max < 120, `★★한 프레임이 120ms 아래다 (${fast.max.toFixed(0)}ms) — 헤드리스는 실기보다 느리므로 상한이다`);

  say('\n[ⓑ 완전히 새 땅(step 128셀 = 겹침 0) — 순간이동·존 진입의 최악값]');
  const slowJ = await probe('대조군', { slowFlow: true }, 128);
  const fastJ = await probe('수리본', { slowFlow: false }, 128);
  ok(fastJ.max < slowJ.max / 3, `★겹침이 0 이어도 3배 이상 빠르다 (${fastJ.max.toFixed(0)}ms vs ${slowJ.max.toFixed(0)}ms)`);

  // ★반례는 **두 탐침의 최악값**으로 잰다. `isWaterCellLocal` 의 비용이 자리에 따라 자릿수로
  //   갈리기 때문이다 — 창 안에 강·호수가 많으면 셀당 ~75µs, 물이 없으면 사실상 0
  //   (같은 판에서 대조군이 301ms 와 3ms 를 둘 다 냈다). 한 탐침의 절대값에 문턱을 걸면
  //   **수리가 아니라 촬영 자리**를 재게 된다. 그래서 이 판의 물 많은 창 = 최악값을 쓴다.
  //   (재민이 겪은 렉도 '물 근처'에서만 나온다 — 그 자리를 재는 게 맞다.)
  const slowWorst = Math.max(slow.max, slowJ.max), fastWorst = Math.max(fast.max, fastJ.max);
  const FRAME = 1000 / 60;   // 60fps 한 프레임 = 16.7ms
  const ratio = slowWorst / Math.max(0.01, fastWorst);
  say(`\n    두 탐침 최악값 — 대조 ${slowWorst.toFixed(0)}ms(${(slowWorst / FRAME).toFixed(1)}프레임) · 수리본 ${fastWorst.toFixed(0)}ms(${(fastWorst / FRAME).toFixed(1)}프레임) · 배율 ${ratio.toFixed(1)}배`);
  // ★반례를 **프레임 예산**으로 말한다. 절대 ms 문턱(200)은 두 번 거짓 실패를 냈다 —
  //   `isWaterCellLocal` 비용이 창 안 물의 양에 비례해 자릿수로 갈리기 때문이다
  //   (같은 판에서 대조군이 301ms 와 3ms 를 둘 다 냈고, 어떤 판은 최악이 172ms 였다).
  //   그때마다 수리는 14~119배로 멀쩡했다 — 문턱이 **수리가 아니라 촬영 자리**를 재고 있었다.
  //   ⇒ 두 주장을 함께 건다: ①대조는 한 프레임 예산을 4배 이상 날린다(=체감되는 히치)
  //     ②수리본은 그보다 8배 이상 빠르다. 자리가 어디든 성립하고, 느슨해지지도 않는다.
  ok(slowWorst > FRAME * 4, `★★반례 — 수리를 끄면 한 프레임 예산을 4배 넘긴다 (${slowWorst.toFixed(0)}ms = ${(slowWorst / FRAME).toFixed(1)}프레임 > 4)`);
  ok(ratio >= 8, `★★수리본이 8배 이상 빠르다 (${ratio.toFixed(1)}배)`);
  ok(fastWorst < 120, `★★수리본은 최악값도 120ms 아래다 (${fastWorst.toFixed(0)}ms)`);

  say('\n[ⓒ 걸으면 실제로 창이 옮겨 간다 — 위 대리 측정이 실사용과 같은 동작이라는 근거]');
  await knob({ slowFlow: false });
  await page.evaluate(() => window.__wfReset && window.__wfReset());
  const d1 = await page.evaluate(() => window.__waterDbg);
  let d2 = d1;
  for (let r = 0; r < 4 && d2.flowKey === d1.flowKey; r++) {
    for (let i = 0; i < 8; i++) { await pulse('d', 1800); }
    d2 = await page.evaluate(() => window.__waterDbg);
    say(`    ${r + 1}차: 셀 ${d1.camCell} → ${d2.camCell} · 창 ${d1.flowKey} → ${d2.flowKey} · 구운 장 ${d2.buildN}`);
  }
  ok(d2.flowKey !== d1.flowKey, `★걸으니 흐름 창이 실제로 옮겨 갔다 (${d1.flowKey} → ${d2.flowKey})`);
  ok(d2.buildN >= 2, `★그때 실제로 다시 구웠다 (${d2.buildN}장)`);

  say("\n[ⓓ 다 채워지면 그림이 같다 — 예산제는 **늦게** 그릴 뿐 다르게 그리지 않는다]");
  await knob({ slowFlow: true }); await page.evaluate(() => window.__wfReset && window.__wfReset()); await sleep(3000);
  const shotSlow = await grab('same-slow');
  const wSlow = waterPct(shotSlow, BOX);
  await knob({ slowFlow: false }); await page.evaluate(() => window.__wfReset && window.__wfReset());
  const settled = await settle(30000);
  const pend = await page.evaluate(() => window.__wfPendN);
  await sleep(900);
  const shotFast = await grab('same-fast');
  const wFast = waterPct(shotFast, BOX);
  const dd = meanAbsDiff(shotSlow, shotFast, BOX);
  say(`    물 비율  대조 ${wSlow.toFixed(2)}%  vs  예산제 ${wFast.toFixed(2)}%   (미결 ${pend}${settled ? '' : ' — 시간 내 미수렴'})`);
  say(`    같은 자리 평균 |Δ| = ${dd.toFixed(2)} / 255`);
  ok(wSlow > 1, `★대조군 화면에 물이 실제로 있다 (${wSlow.toFixed(2)}%) — 없으면 아래 판정이 자명해진다`);
  ok(Math.abs(wFast - wSlow) < Math.max(0.2, wSlow * 0.05), `★★예산제가 그린 물의 양이 대조군과 같다 (${wFast.toFixed(2)}% vs ${wSlow.toFixed(2)}%) — 늦게 그릴 뿐 덜 그리지 않는다`);
  ok(dd < 3.0, `★그림이 사실상 같다 (평균 |Δ| ${dd.toFixed(2)} < 3.0)`);

  await browser.close(); try { z.kill(); } catch (e) { }
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  say(`\n=== 물가 렉: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
