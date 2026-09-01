#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// e2e — 산 가림 뚫기 [재민 2026-08-07: "산의 서쪽이나 북쪽에 있어서 화면에 가려질 때
//                                      에는 산은 투명해져야 해"]
//
// ★자명 통과 금지 — 판정마다 **기능이 없으면 깨질 반례**를 같이 잰다.
//   대조군은 `__terrain19.occOff = true`(같은 세션·같은 시계·같은 카메라). git stash 로 만든
//   "before" 는 다른 세계라 비교가 안 된다.
//
// ★★[2026-08-07 개정] 덮개 배치가 들어오면서 이 자리의 가림이 **사라졌다**(배율 5.8 → 1.6).
//   그래서 가림 기구 자체는 `mtLegacy = true`(옛 배치 — 손잡이로 살아 있는 실제 코드 경로)에서
//   시험하고, 덮개 배치가 가림을 실제로 줄였는지는 **따로 잰다**(⑦).
//   기구를 안 도는 채로 "이제 안 가려진다"고 말하면 그 코드는 조용히 썩는다.
//
//   ① 애초에 가려지고 있나        — occOff 프레임에서 내 자리가 mtOff 프레임과 달라야 한다
//                                   (안 그러면 아래 판정이 전부 자명하게 통과한다)
//   ② 구멍이 뚫렸나              — 켠 프레임이 대조군과 내 자리에서 달라야 한다
//   ③ 내가 보이나                — 켠 프레임의 내 자리가 **산 없는 그림 쪽에 더 가까워야** 한다
//   ④ ★산 전체가 흐려지면 안 된다 — 구멍 반경 밖 산 화소는 대조군과 **동일**해야 한다
//   ⑥ 안 가릴 땐 값이 0          — 산 반대쪽으로 가면 가림 장수가 줄어야 한다
//   ⑦ ★덮개 배치가 가림을 줄였나  — 같은 자리에서 mtLegacy 끔 ≤ 켬
//   ⑧ ★★앞쪽 산이 **전부** 흐려진다 — 나를 안 덮는 앞쪽 산도 같이 흐려져야 한다
//                                     (재민 2차 정정. 한 장만 흐리면 나머지가 여전히 가린다)
//   ⑨ ★반례 — **뒤쪽 산은 그대로**   — 내 뒤(z 작은) 산은 나를 못 가리므로 손대면 안 된다
//
// 포트 3010/3020 공용 — E2E 동시 실행 금지.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
// ★자리는 `probe-mtocc-site.js` 가 데이터에서 골랐다 — 걸어서는 이 자리에 못 간다(바위=콜라이더).
//   ★상자만 보면 안 된다 — 프레임의 86%가 투명 여백이라 상자 판정은 149곳을 2640곳으로 부풀린다.
//   알파(문턱 0.35)까지 본 실제 가림 자리는 걸을 수 있는 곳 표본의 0.3%(149곳). 여기가 그중 최상.
//   ★2차 자리 — 덮개 배치에서도 가림이 나는 곳(__mtOccAt 로 격자 훑어 찾음).
//     이 능선 주변 표본의 3.2%에서 가림이 나고, 그때 앞쪽 산이 72장이다.
//   ★배율·높이 묶기 이후 산이 낮아져 가림이 더 드물어졌다(3.5% → 1.7%). 자리를 다시 찾았다.
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
fs.writeFileSync('/tmp/zone-wrap-occ.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

// 상자 안 두 그림의 화소 차이 — 평균 채널차
function diff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, t = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x1); x++) {
    const i = (y * a.width + x) * 4; t++;
    s += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  }
  return t ? s / t : 0;
}

(async () => {
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('zone', '/tmp/zone-wrap-occ.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/occ.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
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

  const shot = async (n) => { const p2 = `/tmp/occ-${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(1200); };

  // ── 기구는 **덮개 배치**(현행)에서 시험한다. 대조군은 occOff 손잡이다.
  //   ★배율·높이 묶기 이후 가림이 드물어졌다(주변 표본의 1.7%). 자리를 좌표로 못 박으면
  //     자꾸 빗나가므로, **정본 판정(__mtOccAt)이 가리키는 쪽으로 걸어가서** 찾는다.
  //     (__mtOccAt 은 지금 카메라의 세그먼트로 재므로 예측이 정확하진 않다 — 그래서 걷고 다시 잰다.)
  let dbg = await page.evaluate(() => window.__mtOccDbg);
  for (let t = 0; t < 10 && (!dbg || !dbg.n); t++) {
    const aim = await page.evaluate(() => {
      const me = window.__getMyAbs(); let best = null;
      for (let dx = -18; dx <= 18; dx += 2) for (let dy = -18; dy <= 18; dy += 2) {
        const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
        if (!r || !r.n) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { dx, dy, d };
      }
      return best;
    });
    if (!aim) break;
    const keys = [];
    if (aim.dy < -1) keys.push('w'); if (aim.dy > 1) keys.push('s');
    if (aim.dx < -1) keys.push('a'); if (aim.dx > 1) keys.push('d');
    if (!keys.length) break;
    for (const k of keys) { await page.keyboard.down(k); await sleep(700); await page.keyboard.up(k); }
    await sleep(700);
    dbg = await page.evaluate(() => window.__mtOccDbg);
  }
  console.log('\n[가림] ' + JSON.stringify(dbg));
  ok('① 가려지는 자리를 찾았다(반례 성립)', !!(dbg && dbg.n > 0), `가린 산 ${dbg && dbg.n}장`);
  if (!dbg || !dbg.n) { console.log('\n가려지는 자리를 못 찾아 이후 판정은 자명하다 — 중단.'); await browser.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(1); }

  const P = dbg.pt, R = dbg.r;
  // ★상자를 **내 몸**으로 좁힌다. 넓게 잡았더니 상자의 대부분이 **내 뒤쪽 산**으로 채워져
  //   "산 있음↔없음" 이 20.4 나 나왔는데, 뒤쪽 산은 흐려지지 않는 게 맞으므로
  //   그 20.4 는 "나를 덮은 양"이 아니었다. 판정이 아니라 상자가 틀렸던 것이다.
  const meBox = [P.x - 11, P.y - 24, P.x + 11, P.y + 6];

  await knob({ occOff: true });  const off = await shot('occoff');   // 대조군 — 산이 나를 덮는다
  await knob({ occOff: false }); const on = await shot('occon');     // 수리 — 내 자리만 뚫린다
  await knob({ mtOff: true });   const noMt = await shot('nomt');    // 산 자체가 없는 그림
  await knob({ mtOff: false });

  // ★⑤ 는 규격이 바뀌면서 **재는 대상**이 바뀌었다.
  //   1차 규격(구멍)일 땐 '구멍 밖 산은 그대로'가 반례였다.
  //   재민 정정(전체 반투명) 후엔 그 반대가 판정이다 — **가리는 산이 고르게 흐려지는가**.
  //   ★옛 구멍 구현이 정확히 이 판정의 반례다: 구멍에서 먼 자리는 |Δ|=0 이 나온다.
  //   ★상자는 눈대중이 아니라 **재서 고른다**(덫 13번) — 산이 실제로 든 자리 중 나에게서 먼 곳.
  // ★먼 상자는 **앞쪽 산** 위여야 한다. 뒤쪽 산 상자를 고르면 |Δ|=0 이 나오는 게 정상이라
  //   판정이 거짓 실패한다(방금 그 덫에 빠졌다). 흐려진 자리(=앞쪽) 중 가장 먼 곳을 고른다.
  let farBox = null, farBest = 0;
  for (let bx = 40; bx < 1300; bx += 60) for (let by = 120; by < 800; by += 60) {
    const b = [bx, by, bx + 120, by + 90];
    const far = Math.hypot(bx + 60 - P.x, by + 45 - P.y);
    if (far < 240) continue;
    if (diff(off, noMt, b) < 12) continue;              // 산이 실제로 든 상자만
    if (diff(on, off, b) < 2) continue;                 // 흐려진 상자만 = 앞쪽 산
    if (far > farBest) { farBest = far; farBox = b; }
  }
  if (farBox) console.log(`  [상자] 먼 **앞쪽** 산 상자 ${JSON.stringify(farBox)} · 거리 ${Math.round(farBest)}px`);
  else console.log('  [상자] 먼 앞쪽 산 상자를 못 찾았다 — ⑤ 는 판정 불가');

  const dMeOffNoMt = diff(off, noMt, meBox);
  const dMeOnOff = diff(on, off, meBox);
  const dMeOnNoMt = diff(on, noMt, meBox);
  const dFar = farBox ? diff(on, off, farBox) : 0;
  const dFarNoMt = farBox ? diff(off, noMt, farBox) : 0;

  ok('② 대조군에서 내 자리가 실제로 산에 덮여 있다', dMeOffNoMt > 12, `산 있음↔없음 내 자리 차 ${dMeOffNoMt.toFixed(1)}`);
  ok('③ 가리는 산이 반투명해졌다(대조군과 다르다)', dMeOnOff > 8, `켬↔끔 내 자리 차 ${dMeOnOff.toFixed(1)}`);
  ok('④ 뚫은 쪽이 "산 없는 그림"에 더 가깝다', dMeOnNoMt < dMeOffNoMt * 0.7,
    `켬↔무산 ${dMeOnNoMt.toFixed(1)} < 끔↔무산 ${dMeOffNoMt.toFixed(1)} 의 70%`);
  // ★★[명세 변경 2026-08-26 재민 확정] **"산괴 전체 흐림" 폐기.**
  //   새 명세: 흐리는 대상 = 플레이어보다 **화면 앞(z 큰)** 띠만 · 뒤 띠는 불투명 ·
  //            경계는 **한 행**(문턱 하나로 갈린다).
  //   ★이건 판정 **완화가 아니라 명세 변경**이다. 옛 판정("전체가 흐려진다")은 이제
  //     **틀린 그림**을 통과시키므로 그대로 두면 안 된다. 대신 새 성질 셋을 잰다 —
  //     ⑴ 앞 띠 흐림 100% · ⑵ 뒤 띠 흐림 0장 · ⑶ 경계 단조(섞이지 않는다).
  //   ★자명 통과 금지: 앞·뒤 띠가 **둘 다 실제로 존재**해야 판정이 성립한다.
  await page.evaluate(() => window.__mt3Rects(true));
  await new Promise((r) => setTimeout(r, 900));
  // ★★[명세 변경 2026-08-26 v4] '앞/뒤'의 자가 **띠 z → 지면 깊이 s** 로 바뀌었다.
  //   "나를 가릴 수 있는 것(발자국이 내 앞)만 흐림, 뒤 산은 높이 무관 불투명."
  //   ⇒ 깊이 3분류로 잰다. 옛 z 판정은 ⑤d 에서 **절단을 끄고** 그대로 건다.
  //   ★rect 마다 **그 프레임의 fz** 로 가른다 — 마지막 문턱으로 전 프레임을 재면 걷는 동안 어긋난다.
  const sp5 = await page.evaluate(() => {
    const q = (window.__mt3RectsGet() || []).filter(a => a.sLo != null && a.fz != null);
    const f = q.filter(a => a.sLo > a.fz), b = q.filter(a => a.sHi <= a.fz);
    const m = q.filter(a => a.sLo <= a.fz && a.sHi > a.fz);
    return { fz: window.__mtOccDbg.fz, front: f.length, fFaded: f.filter(a => a.faded).length,
             back: b.length, bFaded: b.filter(a => a.faded).length,
             strad: m.length, sSplit: m.filter(a => a.split === 1).length };
  });
  await page.evaluate(() => window.__mt3Rects(false));
  console.log('  [⑤ 명세] ' + JSON.stringify(sp5));
  ok('⑤ ★자명 통과 금지 — **깊이로** 앞 띠와 뒤 띠가 둘 다 실제로 있다',
    sp5.front > 3 && sp5.back > 3, `전부앞 ${sp5.front}장 · 전부뒤 ${sp5.back}장 · 걸친 ${sp5.strad}장`);
  ok('⑤ ★★발자국이 **전부 내 앞**인 띠는 전부 흐려진다', sp5.front > 0 && sp5.fFaded === sp5.front,
    `앞 ${sp5.front}장 중 흐림 ${sp5.fFaded}장 (전부여야)`);
  ok('⑤ ★★발자국이 **전부 내 뒤**인 띠는 하나도 안 흐려진다(높이 무관)', sp5.bFaded === 0,
    `뒤 ${sp5.back}장 중 흐림 ${sp5.bFaded}장 (0이어야)`);
  ok('⑤ ★★걸친 띠는 통째로 안 흐린다 — **전부 갈라 그린다**',
    sp5.strad === 0 || sp5.sSplit === sp5.strad, `걸친 ${sp5.strad}장 중 갈라 그린 것 ${sp5.sSplit}장`);
  // ⑤d 옛 판(띠 z 통째) — 반례 장치가 아직 산다. 절단을 끄면 z 경계가 **한 행**이어야 한다.
  const sp5d = await (async () => {
    await page.evaluate(() => window.__mtFadeCut(0));
    await sleep(1400);
    await page.evaluate(() => window.__mt3Rects(true)); await sleep(900);
    const r = await page.evaluate(() => {
      const fz = window.__mtOccDbg.fz, q = window.__mt3RectsGet() || [];
      const zNo = q.filter(a => !a.faded).map(a => a.z), zYes = q.filter(a => a.faded).map(a => a.z);
      return { fz, no: zNo.length, yes: zYes.length,
               maxNo: zNo.length ? Math.max(...zNo) : null, minYes: zYes.length ? Math.min(...zYes) : null };
    });
    await page.evaluate(() => { window.__mt3Rects(false); window.__mtFadeCut(1); });
    await sleep(1200);
    return r;
  })();
  console.log('  [⑤d 옛 판] ' + JSON.stringify(sp5d));
  ok('⑤d ★반례 장치 — 절단을 끄면 옛 **띠 z 통째** 판이 그대로 돌고 경계가 한 행이다',
    sp5d.no > 3 && sp5d.yes > 3 && sp5d.maxNo <= sp5d.minYes,
    `안 흐림 최대 z ${sp5d.maxNo} ≤ 흐림 최소 z ${sp5d.minYes}`);
  ok('⑤b ★산이 사라지지는 않았다(반투명이지 투명이 아니다)', dMeOnNoMt > 2.0,
    `켬↔무산 내 자리 차 ${dMeOnNoMt.toFixed(1)} > 2`);
  ok('⑤c ★멀리 있는 **앞쪽** 산도 흐려진다(구멍이 아니다)', !!farBox && dFarNoMt > 12 && dFar > 3,
    farBox ? `먼 앞쪽 상자 산 함량 ${dFarNoMt.toFixed(1)} · 켬↔끔 ${dFar.toFixed(1)}` : '상자 없음');

  // ⑧⑨ ★앞쪽 산은 **전부** 흐려지고, 뒤쪽 산은 그대로다
  //   ⑧ 은 화소 상자로 캐지 않는다 — 앞쪽 세그먼트의 **앵커는 늘 화면 아래**(z 차 500 = 화면 500px)라
  //     상자를 못 잡는다. 대신 **정본 그리기 경로가 흐리게 그린 장수**를 그대로 읽는다.
  const cov = dbg;
  await knob({ occOff: true }); const cOff = await shot('cov-off');
  await knob({ occOff: false }); const cOn = await shot('cov-on');
  await knob({ mtOff: true }); const cNo = await shot('cov-nomt');
  await knob({ mtOff: false });
  await sleep(900);
  const fd = await page.evaluate(() => window.__mtOccDbg);
  ok('⑧ ★★가리는 한 장이 아니라 **앞쪽 산 전부**가 흐려진다',
    !!fd && fd.faded > 3 && fd.front > 3 && fd.faded === fd.front,
    `흐리게 그린 장수 ${fd && fd.faded} = 앞쪽 산 ${fd && fd.front}장 (나를 실제로 덮는 건 ${fd && fd.n}장뿐)`);

  // ★★[산 35m 로 올린 뒤 계측기 수리 2026-08-19] 여기는 상자를 **셀 좌표로 추측**하고 있었다.
  //   `__cellScreen(lcx,lcy)` 는 그 셀의 **땅바닥** 화면 자리다. 산이 9m 일 땐 그 위 70px 이
  //   그 띠의 그림이었지만, 35m 면 **앞쪽 띠가 앵커보다 1120px 위까지** 그려서 같은 상자를 덮는다.
  //   그래서 "뒤쪽 산은 그대로"가 |Δ|=15.4 로 거짓 실패했다 — 판정이 아니라 **상자가 틀렸다.**
  //   ⇒ 정본 그리기 경로가 실제로 그린 사각형(__mt3Rects)을 받아, **앞쪽 띠 사각형과
  //     한 화소도 안 겹치는** 뒤쪽 띠 자리를 고른다. 높이가 얼마든 안 틀린다.
  await page.evaluate(() => window.__mt3Rects(true));
  await sleep(600);
  const picks = await page.evaluate(() => {
    // ★★[명세 변경 2026-08-26] 흐림 문턱은 **정본이 쓰는 값**을 그대로 읽는다(사본 금지).
    //   옛 판은 여기서 `(me.x+me.y)/2 + 500` 을 다시 유도했다 — 정본이 바뀌면 조용히 어긋난다.
    const mz = window.__mtOccDbg.fz;
    const rects = window.__mt3RectsGet() || [];
    if (!rects.length) {                       // 스프라이트 판(3D 꺼짐)일 때의 옛 경로
      const segs = window.__mtProbe() || [];
      let back = null;
      for (const g of segs) {
        const z = (g.x + g.y) * 0.5;
        if (z >= mz - 400) continue;
        const s2 = window.__cellScreen(g.lcx, g.lcy);
        if (!s2 || s2.x < 140 || s2.x > 1260 || s2.y < 300 || s2.y > 800) continue;
        const far = Math.hypot(s2.x - 700, s2.y - 436);
        if (!back || far > back.far) back = { x: s2.x, y: s2.y, far, w: 120, h: 80 };
      }
      return { back, mode: 'sprite' };
    }
    // ★지면 깊이 기준(v4) — sLo/sHi 가 있으면 그걸 쓰고, 없으면 옛 z 로 떨어진다
    const dep = rects.length && rects[0].sLo != null;
    const front = rects.filter(r => dep ? r.sHi > mz : r.z > mz);
    const backs = rects.filter(r => dep ? r.sHi <= mz : r.z <= mz);
    const hit = (b) => front.some(r => !(r.x + r.w <= b[0] || r.x >= b[2] || r.y + r.h <= b[1] || r.y >= b[3]));
    let best = null;
    for (const r of backs) {
      // 그 띠 사각형 안에서 24×24 창을 훑어, 앞쪽 띠와 안 겹치는 자리를 찾는다
      for (let ox = 4; ox + 24 < r.w; ox += 12) for (let oy = 4; oy + 24 < r.h; oy += 12) {
        const b = [r.x + ox, r.y + oy, r.x + ox + 24, r.y + oy + 24];
        if (b[0] < 140 || b[2] > 1260 || b[1] < 120 || b[3] > 820) continue;
        if (hit(b)) continue;
        const far = Math.hypot((b[0] + b[2]) / 2 - 700, (b[1] + b[3]) / 2 - 436);
        if (!best || far > best.far) best = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, far, w: 24, h: 24 };
      }
    }
    // 화소 상자를 못 찾을 수도 있다 — 산이 35m 면 앞쪽 띠 1500장이 화면을 통째로 덮어
    //   "뒤쪽 띠만 칠한 화소"가 아예 없을 수 있다. 그때는 정본 그리기 경로가 남긴
    //   **흐림 표시**로 같은 성질을 직접 잰다(양방향 + 개수라 자명 통과가 아니다).
    return { back: best, mode: 'mt3', nFront: front.length, nBack: backs.length,
             backFaded: backs.filter(r => r.faded).length,
             frontFaded: front.filter(r => r.faded).length };
  });
  await page.evaluate(() => window.__mt3Rects(false));
  console.log('  [⑨ 상자] ' + JSON.stringify(picks).slice(0, 200));
  if (picks.back) {
    const hw = Math.round(picks.back.w / 2), hh = Math.round(picks.back.h / 2);
    const bx = [Math.round(picks.back.x - hw), Math.round(picks.back.y - hh),
                Math.round(picks.back.x + hw), Math.round(picks.back.y + hh)];
    const dB = diff(cOn, cOff, bx), dBm = diff(cOff, cNo, bx);
    ok('⑨ ★반례 — **뒤쪽** 산은 그대로다', dB < 1.0 && dBm > 10,
      `뒤쪽 산 상자 켬↔끔 |Δ| ${dB.toFixed(2)} (≈0) · 그 상자 산 함량 ${dBm.toFixed(1)}`);
  } else if (picks.mode === 'mt3') {
    ok('⑨ ★반례 — **뒤쪽** 산은 그대로다(정본 그리기 경로의 흐림 표시로)',
      picks.backFaded === 0 && picks.frontFaded > 3,
      `뒤쪽 띠 ${picks.nBack}장 중 흐려진 것 ${picks.backFaded}장(0이어야) · 앞쪽 ${picks.nFront}장 중 ${picks.frontFaded}장 흐려짐(>0이어야)` +
      ' — 화소 상자는 못 썼다: 35m 산에서 앞쪽 띠가 화면을 덮어 뒤쪽 전용 화소가 없다');
  } else ok('⑨ ★뒤쪽 산 상자를 찾았다', false, '뒤쪽 세그먼트가 화면 안에 없다 — 판정 불가');

  // ⑦ ★가림은 **상시가 아니다** — 늘 반투명이면 그것도 틀린 그림이다.
  //   정본 판정(__mtOccAt)으로 주변 격자를 훑어 비율을 잰다.
  const sweep = await page.evaluate(() => {
    const me = window.__getMyAbs(); let hit = 0, tot = 0;
    for (let dx = -30; dx <= 30; dx += 2) for (let dy = -30; dy <= 30; dy += 2) {
      const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
      if (!r) continue; tot++; if (r.n > 0) hit++;
    }
    return { hit, tot, pct: tot ? hit / tot * 100 : 0 };
  });
  // ★★[계측기 수리 2026-08-19] 여기 있던 `pct < 25` 는 **산 높이 9m 를 박아 둔 상수**였다.
  //   산을 35m 로 올리자 같은 구현이 45.5% 를 냈고 판정이 거짓 실패했다. 높은 산이 더 많이
  //   가리는 건 맞는 동작이지 결함이 아니다. 25 를 50 으로 올리는 건 판정 완화라 안 한다.
  //   ⇒ 재는 걸 **성질**로 바꾼다: (ⓐ) 상수 참이 아니다(0 < pct < 100),
  //     (ⓑ) 그리고 그 값이 **산에서 온다** — 산을 끄면 0% 여야 한다(대조군). 자명 통과 금지.
  const sweepNo = await (async () => {
    await knob({ mtOff: true }); await sleep(700);
    const r = await page.evaluate(() => {
      const me = window.__getMyAbs(); let hit = 0, tot = 0;
      for (let dx = -30; dx <= 30; dx += 2) for (let dy = -30; dy <= 30; dy += 2) {
        const q = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
        if (!q) continue; tot++; if (q.n > 0) hit++;
      }
      return { hit, tot, pct: tot ? hit / tot * 100 : 0 };
    });
    await knob({ mtOff: false }); await sleep(700);
    return r;
  })();
  ok('⑦ ★가림은 상시가 아니다(늘 반투명이면 그것도 틀렸다)', sweep.pct > 0 && sweep.pct < 100,
    `주변 ${sweep.tot}자리 중 가림 ${sweep.hit} (${sweep.pct.toFixed(1)}%) — 0%도 100%도 아니다`);
  ok('⑦b ★반례 — 산을 끄면 가림이 0% 다(그 값이 산에서 온다는 증거)', sweepNo.pct === 0,
    `산 끔 가림 ${sweepNo.hit}/${sweepNo.tot} (${sweepNo.pct.toFixed(1)}%)`);

  // ⑥ 산에서 멀어지면 가림이 사라진다 — 상수 true 가 아님을 보인다
  // ⑥ 걸어서 벗어나면 반투명이 **꺼진다** — 방향은 눈대중이 아니라 정본 판정으로 고른다
  // ★★[계측기 수리 2026-08-20] 방향 탐색이 **4방향 × 24셀**까지였다. 산이 9m 일 땐 그 안에
  //   빈 자리가 있었지만 35m 벽은 가리는 범위가 훨씬 넓어, 네 방향 모두 24셀 안에 빈 자리가
  //   없으면 아무 방향이나 골라 걷다가 못 빠져나온다 — 판정이 아니라 **탐색 반경이 낡았다.**
  //   (⑦ 이 이미 '±30셀 안에 안 가려지는 자리가 있다'를 보였으므로 빠져나갈 곳은 있다.)
  //   ⇒ 8방향 × 60셀까지 훑어 **가장 가까운 빈 자리**를 고르고, 걸으면서 매번 다시 고른다.
  const pick = () => page.evaluate(() => {
    const me = window.__getMyAbs();
    const cand = [['s', 1, 1], ['d', 1, -1], ['a', -1, 1], ['w', -1, -1],
                  ['sd', 1, 0], ['sa', 0, 1], ['wd', 0, -1], ['wa', -1, 0]];
    let best = null;
    for (const [k, sx, sy] of cand) {
      // ★★목표만 보고 고르면 안 된다 — **가는 길**이 뚫려 있어야 한다.
      //   바위 안은 아무것도 안 가리지만 갈 수가 없고(첫 함정), 목표가 뭍이어도 중간이
      //   막혀 있으면 못 간다(둘째 함정). 실측: 40번 걸어 11셀만 가고 벽에 붙어 미끄러졌다.
      //   ⇒ 한 셀씩 나아가며 **바위를 만나면 그 방향은 포기**하고, 그 전에 나온 빈 자리만 센다.
      for (let t = 1; t <= 60; t++) {
        const qx = me.x + sx * t * 32, qy = me.y + sy * t * 32;
        if (window.__isRockAt && window.__isRockAt(qx, qy)) break;   // 길이 막혔다 — 이 방향 포기
        const r = window.__mtOccAt(qx, qy);
        if (r && r.n === 0) { if (!best || t < best.d) best = { k, d: t }; break; }
      }
    }
    return best;
  });
  const dir0 = await pick();
  const st = await page.evaluate(() => { const m = window.__getMyAbs(); return [Math.round(m.x / 32), Math.round(m.y / 32)]; });
  console.log('  [⑥ 탈출] ' + JSON.stringify(dir0) + ' · 출발 셀 ' + st);
  let far = null, dir = dir0 || { k: 's', d: 99 };
  for (let i = 0; i < 40; i++) {
    for (const kk of dir.k.split('')) await page.keyboard.down(kk);
    await sleep(1100);
    for (const kk of dir.k.split('')) await page.keyboard.up(kk);
    far = await page.evaluate(() => window.__mtOccDbg);
    if (far && far.n === 0 && far.fade < 0.2) break;
    // ★방향을 매번 다시 고르면 앞뒤로 **진동**한다(실측). 길이 막혔을 때만 바꾼다.
    if (i % 6 === 5) { const nd = await pick(); if (nd) dir = nd; }
  }
  // ★두 판정이 어긋나는지 본다: 위치 탐색용 __mtOccAt 과 실제로 그려진 것 기준 __mtOccDbg
  const cross = await page.evaluate(() => {
    const me = window.__getMyAbs();
    const a = window.__mtOccAt(me.x, me.y);
    return { at: a && a.n, dbg: window.__mtOccDbg && window.__mtOccDbg.n, me: [Math.round(me.x / 32), Math.round(me.y / 32)] };
  });
  console.log('  [⑥ 대조] __mtOccAt.n=' + cross.at + ' vs __mtOccDbg.n=' + cross.dbg +
              ' · 출발 ' + st + ' → 도착 ' + cross.me +
              ' (이동 ' + Math.round(Math.hypot(cross.me[0] - st[0], cross.me[1] - st[1])) + '셀)');
  ok('⑥ 벗어나면 반투명이 꺼진다 (상수 아님)', !!far && far.n === 0 && far.fade < 0.5,
    `'${dir.k}' 방향 이동 후 가린 산 ${far && far.n}장 · 반투명 진행도 ${far && far.fade}`);

  // ── ⑩ **경계 왕복** — 알파가 떠는가 ─────────────────────────────────────
  //   [타 세션 지적 2026-08-20] "걷다 보면 경계에서 알파가 껌뻑거릴 수 있다."
  //   지금 코드엔 lerp(220ms)만 있고 켜짐/꺼짐 문턱이 분리된 히스테리시스는 없다.
  //   그래서 **재고 나서** 필요하면 넣는다 — 없는 결함을 미리 고치지 않는다.
  //   재는 것 둘:
  //     ⓐ 경계에 **멈춰 서** 있을 때 n 이 뒤집히는가(정지 채터). 뒤집히면 판정 자체가 떤다.
  //        ★청크 굽기가 예산제(프레임당 1)라 띠가 늦게 들어오면 정지 상태에서도 n 이 바뀔 수 있다 —
  //          그게 바로 이 판정이 노리는 실제 기구다.
  //     ⓑ 경계를 4번 오갈 때 n 이 **4번보다 훨씬 많이** 뒤집히는가(이동 채터).
  const sample = (ms) => page.evaluate((m) => new Promise((res) => {
    const out = []; const t0 = performance.now();
    const step = () => { const d = window.__mtOccDbg || {};
      out.push([+(performance.now() - t0).toFixed(0), d.n | 0, +(d.fade || 0)]);
      if (performance.now() - t0 < m) requestAnimationFrame(step); else res(out); };
    requestAnimationFrame(step);
  }), ms);
  const flips = (a) => { let f = 0; for (let i = 1; i < a.length; i++) if ((a[i][1] > 0) !== (a[i - 1][1] > 0)) f++; return f; };

  // 경계로 되돌아간다 — ⑥에서 빠져나온 방향의 반대로 한 탭씩, n>0 이 될 때까지
  const back = { s: 'w', w: 's', a: 'd', d: 'a', sd: 'wa', wa: 'sd', sa: 'wd', wd: 'sa' }[dir.k] || 'w';
  let atEdge = null;
  for (let t = 0; t < 40; t++) {
    for (const k of back) { await page.keyboard.down(k); await sleep(120); await page.keyboard.up(k); }
    await sleep(140);
    atEdge = await page.evaluate(() => window.__mtOccDbg);
    if (atEdge && atEdge.n > 0) break;
  }
  const still = await sample(2500);                         // ⓐ 멈춰서 2.5초
  const fStill = flips(still);
  ok('⑩ ★경계에 멈춰 서면 가림 판정이 안 떤다(정지 채터 없음)', fStill === 0,
    `정지 ${still.length}프레임 중 n 뒤집힘 ${fStill}회 · 알파 ${still[0][2]}→${still[still.length - 1][2]}`);

  // ⓑ 경계를 4번 오간다
  const trip = [];
  for (let r = 0; r < 4; r++) {
    for (const k of (r % 2 ? back : dir.k)) { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); }
    trip.push(...(await sample(420)));
  }
  const fTrip = flips(trip);
  let jump = 0;
  for (let i = 1; i < trip.length; i++) jump = Math.max(jump, Math.abs(trip[i][2] - trip[i - 1][2]));
  ok('⑩b ★왕복 4회에 뒤집힘이 그 두 배를 안 넘는다(이동 채터 없음)', fTrip <= 8,
    `왕복 4회 · n 뒤집힘 ${fTrip}회 · 프레임당 알파 최대 변화 ${jump.toFixed(3)}`);
  console.log(`  [⑩ 표본] 정지 ${JSON.stringify(still.slice(0, 3))} … 왕복 뒤집힘 ${fTrip}`);

  console.log(`\n${pass}/${pass + fail} 통과${fail ? ' — ★실패 ' + fail : ''}`);
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
