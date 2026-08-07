#!/usr/bin/env node
// =============================================================================
// e2e — 산 가림 뚫기 [재민 2026-08-07: "산의 서쪽이나 북쪽에 있어서 화면에 가려질 때
//                                      에는 산은 투명해져야 해"]
//
// ★자명 통과 금지 — 판정마다 **기능이 없으면 깨질 반례**를 같이 잰다.
//   대조군은 `__terrain19.occOff = true`(같은 세션·같은 시계·같은 카메라). git stash 로 만든
//   "before" 는 다른 세계라 비교가 안 된다.
//
//   ① 애초에 가려지고 있나        — occOff 프레임에서 내 자리가 mtOff 프레임과 달라야 한다
//                                   (안 그러면 아래 판정이 전부 자명하게 통과한다)
//   ② 구멍이 뚫렸나              — 켠 프레임이 대조군과 내 자리에서 달라야 한다
//   ③ 내가 보이나                — 켠 프레임의 내 자리가 **산 없는 그림 쪽에 더 가까워야** 한다
//   ④ ★산 전체가 흐려지면 안 된다 — 구멍 반경 밖 산 화소는 대조군과 **동일**해야 한다
//   ⑤ 안 가릴 땐 값이 0          — 산에서 멀리 떨어지면 가림 장수가 0 이어야 한다
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
const SITE = { cx: 2174, cy: 1252 };
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

  // ── 가려지는 자리를 찾는다. 없으면 판정이 전부 자명해지므로 **찾지 못하면 실패**다.
  const dbg = await page.evaluate(() => window.__mtOccDbg);
  console.log('\n[가림] ' + JSON.stringify(dbg));
  ok('① 가려지는 자리를 찾았다(반례 성립)', !!(dbg && dbg.n > 0), `가린 산 ${dbg && dbg.n}장`);
  if (!dbg || !dbg.n) { console.log('\n가려지는 자리를 못 찾아 이후 판정은 자명하다 — 중단.'); await browser.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(1); }

  const P = dbg.pt, R = dbg.r;
  const meBox = [P.x - 26, P.y - 34, P.x + 26, P.y + 14];       // 내 몸 상자

  await knob({ occOff: true });  const off = await shot('occoff');   // 대조군 — 산이 나를 덮는다
  await knob({ occOff: false }); const on = await shot('occon');     // 수리 — 내 자리만 뚫린다
  await knob({ mtOff: true });   const noMt = await shot('nomt');    // 산 자체가 없는 그림
  await knob({ mtOff: false });

  // ★'구멍 밖 산 상자'는 **찍지 말고 재서 고른다**. 눈대중으로 잡았더니 산이 한 화소도
  //   없는 빈 하늘이 걸렸고, 그러면 ⑤ 는 무엇을 재도 통과하는 자명 판정이 된다.
  //   산 함량(끔↔무산 차)이 가장 큰 상자를 구멍 반경 밖에서 고른다.
  let farBox = null, farBest = 0;
  for (let bx = 40; bx < 1300; bx += 60) for (let by = 120; by < 800; by += 60) {
    const b = [bx, by, bx + 120, by + 90];
    const cxm = bx + 60, cym = by + 45;
    if (Math.hypot(cxm - P.x, cym - P.y) < R + 110) continue;   // 구멍(+여유) 밖만
    const m = diff(off, noMt, b);
    if (m > farBest) { farBest = m; farBox = b; }
  }
  console.log(`  [상자] 산 함량 최대 상자 ${JSON.stringify(farBox)} · 산 함량 ${farBest.toFixed(1)} · 내 자리에서 ${Math.round(Math.hypot(farBox[0] + 60 - P.x, farBox[1] + 45 - P.y))}px`);

  const dMeOffNoMt = diff(off, noMt, meBox);
  const dMeOnOff = diff(on, off, meBox);
  const dMeOnNoMt = diff(on, noMt, meBox);
  const dFar = diff(on, off, farBox);
  const dFarNoMt = diff(off, noMt, farBox);

  ok('② 대조군에서 내 자리가 실제로 산에 덮여 있다', dMeOffNoMt > 12, `산 있음↔없음 내 자리 차 ${dMeOffNoMt.toFixed(1)}`);
  ok('③ 구멍이 뚫렸다(대조군과 다르다)', dMeOnOff > 8, `켬↔끔 내 자리 차 ${dMeOnOff.toFixed(1)}`);
  ok('④ 뚫은 쪽이 "산 없는 그림"에 더 가깝다', dMeOnNoMt < dMeOffNoMt * 0.7,
    `켬↔무산 ${dMeOnNoMt.toFixed(1)} < 끔↔무산 ${dMeOffNoMt.toFixed(1)} 의 70%`);
  ok('⑤ ★구멍 밖 산은 손대지 않았다', dFar < 1.0 && dFarNoMt > 12,
    `밖 켬↔끔 ${dFar.toFixed(2)} (≈0) · 그 상자에 산이 있음 확인 ${dFarNoMt.toFixed(1)} ← 이게 0 이면 판정이 자명하다`);

  // ⑥ 산에서 멀어지면 가림이 사라진다 — 상수 true 가 아님을 보인다
  for (let i = 0; i < 7; i++) { for (const k of ['s', 'd']) { await page.keyboard.down(k); await sleep(1400); await page.keyboard.up(k); } }
  await sleep(1500);
  const far = await page.evaluate(() => window.__mtOccDbg);
  ok('⑥ 산 반대쪽으로 가면 가림이 준다 (상수 아님)', !!far && far.n < dbg.n, `남동 이동 후 가린 산 ${far && far.n}장 < 처음 ${dbg.n}장`);

  console.log(`\n${pass}/${pass + fail} 통과${fail ? ' — ★실패 ' + fail : ''}`);
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
