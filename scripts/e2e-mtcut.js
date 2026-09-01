#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// e2e — 픽셀 절단 v4 **수직 평면** [재민 확정 2026-08-26]
//   "나를 가릴 수 있는 것(발자국이 내 앞)만 흐림, 뒤 산은 높이 무관 불투명."
//   판정 기준 = **지면 깊이 s**(= 화면y + 32h) · 경계식은 표면 위에서 **화면y = c − 32h**(등고선)
//   ★근거 한 줄: 산 조각이 내 화소에 오려면 화면y = s − 32h 가 내 화면y 와 같아야 하는데,
//     발자국이 내 뒤(s < 내 s)면 h < 0 이어야 해서 불가능하다.
//   ★v3(화면 평행 평면, s+32h)은 `__mtFadePlane(1)` 반례 장치로 살아 있다.
//
// ★자명 통과 금지 — 판정마다 **반례**를 같이 잰다.
// 포트 3010/3020 공용 — E2E 동시 실행 금지.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const SITE = { cx: 2150, cy: 1959 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
}
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 120)); });
  procs.push(p); return p;
}
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zone-wrap-cut.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

(async () => {
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('zone', '/tmp/zone-wrap-cut.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/mtcut.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
  if (!await waitHttp(`http://localhost:${ZPORT}/health`)) { console.log('zone 기동 실패'); process.exit(1); }
  await sleep(4000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) { }
  }
  await sleep(20000);

  const shot = async (n) => { const p2 = `/tmp/cut-${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(1200); };
  // ★안정 대기 — 청크 굽기 예산이 1장/프레임이라 고정 sleep 은 굽는 지연을 결과로 읽는다.
  const settle = async (maxMs = 24000) => {
    let prev = null, same = 0, t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const st = await page.evaluate(() => { const d = window.__mtDbg || {}; const c = window.__mtCutN();
        return [d.mt3chunks | 0, d.mt3segs | 0, c.split | 0]; });
      const k = st.join(',');
      if (k === prev) { if (++same >= 3) return st; } else { same = 0; prev = k; }
      await sleep(700);
    }
    return null;
  };

  await page.evaluate(() => { window.__mtFadeCut(1); window.__mtFadePlane(0); });
  let cn = null;
  for (let t = 0; t < 12; t++) {
    await settle();
    cn = await page.evaluate(() => ({ ...window.__mtCutN(), dbg: window.__mtOccDbg }));
    if (cn.split > 0) break;
    const aim = await page.evaluate(() => {
      const me = window.__getMyAbs(); let best = null;
      for (let dx = -18; dx <= 18; dx += 2) for (let dy = -18; dy <= 18; dy += 2) {
        const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
        if (!r || !r.n) continue;
        const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { dx, dy, d };
      }
      return best;
    });
    const keys = [];
    if (aim) { if (aim.dy < -1) keys.push('w'); if (aim.dy > 1) keys.push('s');
               if (aim.dx < -1) keys.push('a'); if (aim.dx > 1) keys.push('d'); }
    if (!keys.length) keys.push(['w', 'a', 's', 'd'][t % 4]);
    for (const k of keys) { await page.keyboard.down(k); await sleep(650); await page.keyboard.up(k); }
    await sleep(600);
  }
  console.log('\n[절단] ' + JSON.stringify(cn));
  ok('⓪ ★자명 통과 금지 — 경계에 **걸친 띠가 실제로 있다**', !!(cn && cn.split > 0), `걸친 띠 ${cn && cn.split}장 · 흐림 ${cn && cn.dbg && cn.dbg.faded}장`);
  if (!cn || !cn.split) { console.log('\n걸친 띠가 없어 이후 판정이 자명하다 — 중단.'); await browser.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(1); }

  // ── ⓑ 자리 — 문턱을 훑어 지면 경계를 모은다 ────────────────────────────
  //   ★걸어서 찾지 않는다: 내 앞의 자락은 **뒤따라 솟는 바위에 덮여** 원리적으로 얇다.
  //     경계식은 문턱이 얼마든 성립하므로, 여러 문턱에서 **같은 판정을 다시 거는 것**이다.
  const HG = 0.05;                                   // 지면 창(|h| m) — 공차 32·HG + 0.5 = 2.1px
  const groundAt = async (zoff) => {
    await page.evaluate((z) => window.__mtFadeZOff(z), zoff);
    await sleep(900); await settle(14000);
    return page.evaluate((hg) => {
      let gA = 0, gB = 0, st = 0, sb = 0, n = 0;
      const L = window.__mtCutList();
      for (let i = 0; i < Math.min(L.length, 16); i++) {
        const r = window.__mtCutProbe(i, { hGnd: hg, fresh: 0 }); if (!r) continue;
        n++; gA += r.gAn; gB += r.gBn; st += r.gStrict; sb += r.gStrictBad;
      }
      return { gA, gB, st, sb, n, split: window.__mtCutN().split };
    }, HG);
  };
  const ZS = [-192, -160, -128, -96, -64, -32, 0, 32, 64, 96, 128, 160, 192, 224];
  let gA = 0, gB = 0, gSt = 0, gSb = 0, gHits = 0, gBase = null;
  for (const z of ZS) {
    const g = await groundAt(z);
    if (z === 32) gBase = g;
    gA += g.gA; gB += g.gB; gSt += g.st; gSb += g.sb;
    if (g.gB > 0) gHits++;
    console.log(`[ⓑ 문턱 ${z >= 0 ? '+' : ''}${z}] 본 ${g.gA} · 흐림 ${g.gB} · 공차 밖 ${g.st}(어긋남 ${g.sb}) · 걸친 띠 ${g.split}`);
  }
  await page.evaluate(() => window.__mtFadeZOff(32));
  await sleep(900); await settle();

  const list = await page.evaluate(() => window.__mtCutList());
  console.log('[걸친 띠] ' + JSON.stringify(list.slice(0, 5)));

  // ── ⓐ 픽셀 예측 대조 ──────────────────────────────────────────────────
  const N = Math.min(list.length, 12);
  const pr = await page.evaluate((a) => {
    const out = [];
    for (let i = 0; i < a[0]; i++) { const r = window.__mtCutProbe(i, { hGnd: a[1] }); if (r) out.push(r); }
    return out;
  }, [N, HG]);
  let cov = 0, both = 0, none = 0, predN = 0, badFar = 0, maxErr = 0, onlyA = 0, onlyB = 0, bothBad = 0;
  for (const r of pr) { cov += r.cov; both += r.both; none += r.none; predN += r.pred;
    badFar += r.badFar; onlyA += r.onlyA; onlyB += r.onlyB; bothBad += r.bothBad;
    if (r.maxErr > maxErr) maxErr = r.maxErr; }
  console.log(`[ⓐ] 띠 ${pr.length}장 · 덮인 화소 ${cov} · 예측 ${predN} · |기준−c|>1px 어긋남 ${badFar}(최대 ${maxErr}px)`);
  ok('ⓐ1 ★경계식 그대로 — 지면 깊이 s = 화면y + 32h 가 문턱을 넘는 쪽으로 정확히 갈렸다',
     pr.length > 0 && predN > 5000 && badFar === 0, `예측 ${predN}화소 중 어긋남 ${badFar}`);
  const wrong = await page.evaluate((n) => {
    let w = 0, tot = 0;
    for (let i = 0; i < n; i++) { const r0 = window.__mtCutProbe(i, { fresh: 0 }); if (!r0) continue;
      const r = window.__mtCutProbe(i, { c: r0.c + 200, fresh: 0 }); if (r) { w += r.badFar; tot += r.pred; } }
    return { w, tot };
  }, N);
  console.log(`[ⓐ2] 틀린 문턱(+200px)으로 예측 → 어긋남 ${wrong.w}/${wrong.tot}화소 (맞는 문턱은 ${badFar})`);
  ok('ⓐ2 ★★자명 금지 반례 — 예측 문턱을 200px 옮기면 판정기가 **잡아낸다**',
     wrong.w > 3000 && badFar === 0, `틀린 문턱 ${wrong.w}화소 ↔ 맞는 문턱 ${badFar}화소`);
  ok('ⓐ3 ★두 쪽이 **둘 다 실제로 있다**(한쪽만이면 절단이 아니다)', onlyA > 200 && onlyB > 200,
     `본 캔버스 ${onlyA}화소 · 흐림 겹 ${onlyB}화소`);

  // ── ⓐ4/5 계수 — 경계 화소를 높이 칸으로 나눈 **중앙값**(OLS 는 꼬리에 끌린다) ─────
  const BP = [];
  for (const r of pr) for (let i = 0; i < r.BP.length; i++) BP.push(r.BP[i]);
  const BIN = [[0, 1], [1, 3], [3, 6], [6, 10], [10, 15], [15, 20], [20, 26], [26, 99]];
  const binMed = (K) => BIN.map(([a, b]) => {
    const v = [];
    for (let i = 0; i < BP.length; i += 2) { const h = BP[i]; if (h >= a && h < b) v.push(BP[i + 1] + K * h); }
    if (v.length < 20) return null;
    v.sort((x, y) => x - y);
    return { a, b, n: v.length, m: +v[v.length >> 1].toFixed(2) };
  }).filter(Boolean);
  const m32 = binMed(32), m64 = binMed(64);
  const span = m32.length ? m32[m32.length - 1].b - m32[0].a : 0;
  console.log('[ⓐ4] K=32 ' + m32.map((q) => `${q.a}-${q.b}m:${q.m}(${q.n})`).join(' '));
  console.log('[ⓐ5] K=64 ' + m64.map((q) => `${q.a}-${q.b}m:${q.m}(${q.n})`).join(' '));
  ok('ⓐ4 ★★계수가 **32**다 — 경계가 표면 위에서 화면y = c − 32h 인 등고선으로 선다',
     m32.length >= 3 && span >= 8 && m32.every((q) => Math.abs(q.m) <= 1.0),
     `높이 칸 ${m32.length}개(폭 ${span}m) · 최대 |중앙값| ${Math.max(...m32.map((q) => Math.abs(q.m))).toFixed(2)}px`);
  ok('ⓐ5 ★★자명 금지 반례 — 같은 화소를 계수 64(옛 v3)로 재면 높이에 비례해 어긋난다',
     m64.length >= 3 && Math.max(...m64.map((q) => Math.abs(q.m))) > 20,
     `최대 |중앙값| ${Math.max(...m64.map((q) => Math.abs(q.m))).toFixed(1)}px`);

  // ── ⓑ 판정 ────────────────────────────────────────────────────────────
  console.log(`[ⓑ] 문턱 ${ZS.length}자리 합계 — 본 ${gA} · 흐림 ${gB}(갈린 문턱 ${gHits}자리) · 공차 밖 ${gSt}(어긋남 ${gSb})`);
  ok('ⓑ1 ★자명 금지 — 지면(|h|<0.05m) 화소가 **양쪽에 다** 있다(여러 문턱에서 모아)',
     gA > 200 && gB > 20 && gHits >= 3, `본 ${gA} · 흐림 ${gB} · 갈린 문턱 ${gHits}자리`);
  ok('ⓑ2 ★★지면 구간 경계는 **한 행**이다 — 공차 밖 지면 화소는 제 행이 시키는 쪽에 **예외 없이** 있다',
     gSt > 300 && gSb === 0 && gBase && gBase.sb === 0,
     `${gSt}화소 중 어긋남 ${gSb} · 채택값 32 에서 ${gBase ? gBase.st : '−'}화소 중 ${gBase ? gBase.sb : '−'}`);

  // ── ⓒ 이중 합성 없음 ─────────────────────────────────────────────────
  ok('ⓒ1 ★두 판은 **배타**다 — 한 화소가 본 캔버스와 흐림 겹에 동시에 안 간다', both === 0, `겹친 화소 ${both}`);
  ok('ⓒ2 ★두 판의 **합이 원본**이다 — 갈라 놓고 빠뜨린 화소가 없다', none === 0, `빠진 화소 ${none}`);
  const reD = pr.reduce((a, r) => a + (r.reDiff !== 0 ? (r.reDiff < 0 ? 1e6 : r.reDiff) : 0), 0);
  const reSelf = pr.reduce((a, r) => a + (r.reSelf > 0 ? r.reSelf : 0), 0);
  console.log(`[ⓒ2c] 되그리기 **재현 바닥**(같은 걸 두 번 그려 비교) ${reSelf}화소 · 원본과의 차 ${reD}화소`);
  ok('ⓒ2c ★★되그리기 재료가 정확하다 — **안 자르고** 되그린 판이 구운 원본과 화소가 같다(바닥 위에서)',
     reSelf === 0 && reD === 0, `바닥 ${reSelf} · 차 ${reD}`);
  const abD = pr.reduce((a, r) => a + (r.abDiff !== 0 ? (r.abDiff < 0 ? 1e6 : r.abDiff) : 0), 0);
  ok('ⓒ2d ★★행 구간 지름길이 **전 화소 가리개와 같은 그림**이다(최적화가 그림을 안 바꾼다)',
     abD === 0, `다른 화소 ${abD}`);
  ok('ⓒ2b ★★겹친 화소가 있더라도 **화가 순서는 안 뒤집힌다**(흐림 겹이 맨 위)', bothBad === 0, `뒤집힌 화소 ${bothBad}`);
  const fdbg = await page.evaluate(() => window.__mtOccDbg);
  ok('ⓒ3 ★흐림 겹은 프레임당 **한 번만** 합성된다', fdbg.fadeFlush === 1, `합성 ${fdbg.fadeFlush}회`);
  ok('ⓒ4 ★흐림 겹에 알파 1 아닌 얹기가 없다(그룹 알파 성질 유지)', fdbg.fadeSoft === 0, `${fdbg.fadeSoft}회`);

  // ★★[계측기 수리 2026-08-26] 판정 상자를 **걸친 띠**에서 잡으면 안 된다.
  //   `pr` 은 `_mtSplitSegs` — **걸친 띠만** 들어 있다. 걸친 띠의 사각형은 위쪽이 불투명(α=1),
  //   아래쪽이 흐림(α=0.34)이라 "한 번 섞기" 모형이 애초에 성립하지 않는다.
  //   옛 판이 통과하던 건 상자(사각형 아래 55~98%)가 우연히 흐림 구간 안에 다 들어갔을 때뿐 —
  //   기하 제비뽑기였다. 실측 실패판: 한 번 섞기 오차 23.35 vs 두 번 32.36(비 1.39).
  //   ⇒ **통째로 흐려진 띠**(faded && !split)에서만 잡는다. 그게 그룹 알파가 말하는 대상이다.
  await page.evaluate(() => window.__mt3Rects(true));
  await sleep(1300);
  const drawn = (await page.evaluate(() => window.__mt3RectsGet()) || []);
  await page.evaluate(() => window.__mt3Rects(false));
  const aFade = await page.evaluate(() => 1 - (1 - 0.34) * window.__mtOccDbg.fade);
  const nowS = await shot('now');
  await knob({ occOff: true });  const opq = await shot('opaque');
  await knob({ occOff: false, mtOff: true }); const bg = await shot('bg');
  await knob({ mtOff: false }); await settle();
  let R0 = null, bestA = 0, wholeN = 0;
  for (const r of drawn) {
    if (!r.faded || r.split) continue;
    wholeN++;
    const ax = Math.max(0, r.x), ay = Math.max(0, r.y + r.h * 0.5);
    const bx2 = Math.min(1400, r.x + r.w), by2 = Math.min(860, r.y + r.h);
    const a = Math.max(0, bx2 - ax) * Math.max(0, by2 - ay);
    if (a > bestA) { bestA = a; R0 = r; }
  }
  const bx = R0 ? [Math.max(4, R0.x + R0.w * 0.1) | 0, Math.max(4, R0.y + R0.h * 0.55) | 0,
                   Math.min(1396, R0.x + R0.w * 0.9) | 0, Math.min(856, R0.y + R0.h * 0.98) | 0] : [0, 0, 0, 0];
  const err = (mode) => {
    let s = 0, t = 0;
    for (let y = bx[1]; y < bx[3]; y++) for (let x = bx[0]; x < bx[2]; x++) {
      const i = (y * nowS.width + x) * 4;
      if (Math.abs(opq.data[i] - bg.data[i]) + Math.abs(opq.data[i+1] - bg.data[i+1]) + Math.abs(opq.data[i+2] - bg.data[i+2]) < 24) continue;
      const a = mode === 1 ? aFade : aFade * aFade;
      for (let c2 = 0; c2 < 3; c2++) s += Math.abs(nowS.data[i + c2] - (bg.data[i + c2] * (1 - a) + opq.data[i + c2] * a));
      t += 3;
    }
    return t ? [s / t, t / 3] : [NaN, 0];
  };
  const [e1, nPx] = err(1), [e2] = err(2);
  console.log(`[ⓒ5] 산 든 화소 ${nPx} · 한 번 섞기 오차 ${e1.toFixed(2)} · 두 번 섞기 ${e2.toFixed(2)} (α=${aFade.toFixed(3)})`);
  ok('ⓒ5 ★자명 금지 — 판정 상자에 산이 실제로 들었다', nPx > 500, `${nPx}화소`);
  ok('ⓒ5a ★자명 금지 — **통째로 흐려진 띠**가 실제로 있고 거기서 상자를 잡았다',
     wholeN > 0 && R0 != null, `통째 흐림 띠 ${wholeN}장 · 상자 ${bx.join(',')}`);
  ok('ⓒ5b ★★화면색이 **한 번 섞은 식**과 맞는다(두 번 섞은 식과는 뚜렷이 다르다)',
     nPx > 500 && e1 < 8 && e2 > e1 * 2.5, `한 번 ${e1.toFixed(2)} vs 두 번 ${e2.toFixed(2)}`);

  // ── ⓓ 3분류(지면 깊이 s 기준) ─────────────────────────────────────────
  //   ★rect 마다 **그 프레임의 fz** 로 가른다 — 마지막 문턱으로 전 프레임을 재면 걷는 동안 어긋난다.
  await page.evaluate(() => window.__mt3Rects(true));
  await sleep(1400);
  const rects = (await page.evaluate(() => window.__mt3RectsGet()) || []).filter((r) => r.sLo != null && r.fz != null);
  await page.evaluate(() => window.__mt3Rects(false));
  const front = rects.filter((r) => r.sLo > r.fz), back = rects.filter((r) => r.sHi <= r.fz);
  const strad = rects.filter((r) => r.sLo <= r.fz && r.sHi > r.fz);
  console.log(`[ⓓ] 띠 ${rects.length} · 전부앞 ${front.length} · 전부뒤 ${back.length} · 걸친 ${strad.length}`);
  ok('ⓓ1 ★자명 통과 금지 — 전부앞·전부뒤가 **둘 다** 실제로 있다', front.length > 3 && back.length > 3,
     `앞 ${front.length} · 뒤 ${back.length}`);
  ok('ⓓ2 ★★발자국이 **전부 내 앞**인 띠는 전부 흐려진다', front.length > 0 && front.every((r) => r.faded),
     `${front.filter((r) => r.faded).length}/${front.length}`);
  ok('ⓓ3 ★★발자국이 **전부 내 뒤**인 띠는 하나도 안 흐려진다(높이 무관)', back.every((r) => !r.faded),
     `흐려진 뒤 띠 ${back.filter((r) => r.faded).length}장`);
  ok('ⓓ4 ★★걸친 띠는 **전부 갈라 그린다**(통째로 안 흐린다)', strad.length > 0 && strad.every((r) => r.split === 1),
     `${strad.filter((r) => r.split === 1).length}/${strad.length}`);

  // ── ⓕ v4 의 핵심 — 나를 절대 못 가리는 뒤 산은 불투명 ───────────────────
  const meas = async (plane) => {
    await page.evaluate((v) => window.__mtFadePlane(v), plane);
    await sleep(1600);
    await page.evaluate(() => window.__mt3Rects(true)); await sleep(1200);
    const r = await page.evaluate(() => {
      const q = (window.__mt3RectsGet() || []).filter(a => a.sLo != null && a.fz != null);
      const on = (a) => a.x < 1400 && a.x + a.w > 0 && a.y < 900 && a.y + a.h > 0;
      const vis = q.filter(on), fd = vis.filter(a => a.faded);
      return { vis: vis.length, faded: fd.length,
               뒤인데흐림: fd.filter(a => a.sHi <= a.fz - 32).length,
               덮을수있음: vis.filter(a => a.z > a.fz - 32 + 500).length,
               덮을수있고흐림: fd.filter(a => a.z > a.fz - 32 + 500).length };
    });
    await page.evaluate(() => window.__mt3Rects(false));
    return r;
  };
  const cv4 = await meas(0), cv3 = await meas(1);
  await page.evaluate(() => window.__mtFadePlane(0)); await sleep(1400);
  console.log('[ⓕ] v4 ' + JSON.stringify(cv4) + '\n     v3 ' + JSON.stringify(cv3));
  ok('ⓕ1 ★★발자국이 **내 뒤**인 띠는 높이와 무관하게 하나도 안 흐려진다', cv4.뒤인데흐림 === 0, `v4 ${cv4.뒤인데흐림}장`);
  ok('ⓕ2 ★★자명 금지 반례 — 옛 v3(화면 평행 평면)에서는 그런 띠가 **실제로 흐려진다**',
     cv3.뒤인데흐림 > 5, `v3 ${cv3.뒤인데흐림}장 → v4 ${cv4.뒤인데흐림}장`);
  ok('ⓕ3 ★★나를 덮을 수 있는 띠는 **전부** 흐려진다(기능 손실 없음)',
     cv4.덮을수있음 > 10 && cv4.덮을수있고흐림 === cv4.덮을수있음, `${cv4.덮을수있고흐림}/${cv4.덮을수있음}장`);

  await page.evaluate(() => window.__mtFadeCut(0));
  await sleep(1500);
  const off = await page.evaluate(() => ({ ...window.__mtCutN(), faded: window.__mtOccDbg.faded }));
  ok('ⓔ 반례 장치 — 절단을 끄면 걸친 띠 0장, 흐림은 옛 띠 z 로 그대로 돈다',
     off.split === 0 && off.faded > 0, `걸친 ${off.split} · 흐림 ${off.faded}장`);
  await page.evaluate(() => window.__mtFadeCut(1));

  console.log(`\n판정 ${pass}/${pass + fail}${fail ? '  ✗ ' + fail + '건 실패' : '  전부 통과'}`);
  await browser.close(); for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})();
