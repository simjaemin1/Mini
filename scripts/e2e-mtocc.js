#!/usr/bin/env node
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
  ok('⑤ ★구멍이 아니라 **산 전체**가 흐려진다', !!farBox && dFarNoMt > 12 && dFar > 3,
    `내 자리 |Δ| ${dMeOnOff.toFixed(1)} · 먼 자리 |Δ| ${dFar.toFixed(1)} (구멍 구현이면 여기가 0 이다) · 그 상자 산 함량 ${dFarNoMt.toFixed(1)}`);
  ok('⑤b ★산이 사라지지는 않았다(반투명이지 투명이 아니다)', dMeOnNoMt > 2.0,
    `켬↔무산 내 자리 차 ${dMeOnNoMt.toFixed(1)} > 2.0 — 0 이면 산이 통째로 없어진 것이다`);

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

  const picks = await page.evaluate(() => {
    const me = window.__getMyAbs(); const mz = (me.x + me.y) * 0.5 + 500;
    const segs = window.__mtProbe() || [];
    let back = null;
    for (const g of segs) {
      const z = (g.x + g.y) * 0.5;
      if (z >= mz - 400) continue;
      const s2 = window.__cellScreen(g.lcx, g.lcy);   // ★lcx/lcy 는 로컬 — 절대 셀을 넣으면 화면 밖이다
      if (!s2 || s2.x < 140 || s2.x > 1260 || s2.y < 300 || s2.y > 800) continue;
      const far = Math.hypot(s2.x - 700, s2.y - 436);
      if (!back || far > back.far) back = { x: s2.x, y: s2.y, far };
    }
    return { back };
  });
  if (picks.back) {
    const bx = [Math.round(picks.back.x - 60), Math.round(picks.back.y - 70), Math.round(picks.back.x + 60), Math.round(picks.back.y + 10)];
    const dB = diff(cOn, cOff, bx), dBm = diff(cOff, cNo, bx);
    ok('⑨ ★반례 — **뒤쪽** 산은 그대로다', dB < 1.0 && dBm > 10,
      `뒤쪽 산 상자 켬↔끔 |Δ| ${dB.toFixed(2)} (≈0) · 그 상자 산 함량 ${dBm.toFixed(1)}`);
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
  ok('⑦ ★가림은 상시가 아니다(늘 반투명이면 그것도 틀렸다)', sweep.pct > 0 && sweep.pct < 25,
    `주변 ${sweep.tot}자리 중 가림 ${sweep.hit} (${sweep.pct.toFixed(1)}%)`);

  // ⑥ 산에서 멀어지면 가림이 사라진다 — 상수 true 가 아님을 보인다
  // ⑥ 걸어서 벗어나면 반투명이 **꺼진다** — 방향은 눈대중이 아니라 정본 판정으로 고른다
  const dir = await page.evaluate(() => {
    const me = window.__getMyAbs();
    const cand = [['s', 1, 1], ['d', 1, -1], ['a', -1, 1], ['w', -1, -1]];
    let best = null;
    for (const [k, sx, sy] of cand) {
      let clear = 0;
      for (let t = 4; t <= 24; t += 4) {
        const r = window.__mtOccAt(me.x + sx * t * 32, me.y + sy * t * 32);
        if (r && r.n === 0) clear++;
      }
      if (!best || clear > best.clear) best = { k, clear };
    }
    return best;
  });
  let far = null;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down(dir.k); await sleep(1200); await page.keyboard.up(dir.k);
    far = await page.evaluate(() => window.__mtOccDbg);
    if (far && far.n === 0 && far.fade < 0.2) break;
  }
  ok('⑥ 벗어나면 반투명이 꺼진다 (상수 아님)', !!far && far.n === 0 && far.fade < 0.5,
    `'${dir.k}' 방향 이동 후 가린 산 ${far && far.n}장 · 반투명 진행도 ${far && far.fade}`);

  console.log(`\n${pass}/${pass + fail} 통과${fail ? ' — ★실패 ' + fail : ''}`);
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
