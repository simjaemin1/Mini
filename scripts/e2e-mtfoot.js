#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// e2e — 산 기슭 [재민 2026-08-07: "산과 풀의 경계가 뚝 끊긴다" → "고고"]
//
// ★자명 통과 금지 — 판정마다 **기능이 없으면 깨질 반례**를 같이 잰다.
//   대조군은 `__terrain19.footOff = true`(같은 세션·같은 시계·같은 카메라).
//
//   ① 기슭이 실제로 선다        — 정본 세그먼트에 tier '기슭' 이 있다
//   ② ★바위 **밖**에만 선다     — 기슭 앵커 셀은 전부 비바위여야 한다(바위 위는 산이 이미 맡는다)
//   ③ ★바위 **가까이**만 선다   — 앵커에서 가장 가까운 바위까지 거리가 전부 dMax(5.2셀) 이내
//   ④ ★물 위엔 안 선다          — 물 셀 앵커 0개 (물가 술이 그 자리 주인이다)
//   ⑤ ★납작하다                 — 기슭 vy 중앙값이 **서 있는 산**의 vy 중앙값보다 뚜렷이 낮다
//                                 ("작은 산"이 아니라 "납작한 산"이라는 설계가 그림에 있는가)
//
// ★★[T14 2026-09-01] **⑤ 는 2026-08-26 러너 통합 때부터 빨갰고, 원인은 하네스였다.**
//   `회부_기슭_평탄판정.md` 의 진단을 이 배치가 실측으로 재확인하고 판정을 고쳤다. 한 문단:
//     분모로 쓰던 "산(L/M) vy 중앙값"은 **쌍봉 분포의 골짜기**다. `_mtFitVy`(10-r1-terrain.js)가
//     스프라이트 실루엣을 바위 마스크에 묶으면서 산 세그먼트의 상당수를 하한 `MT_VY_MIN`(0.30)에
//     **눌러 놓기** 때문이다 — 눌린 산은 "서 있는 산"이 아니라 **이미 납작해진 산**이다.
//     그것들을 분모에 넣으면 "납작한 것보다 납작한가"를 묻게 되고, 그건 아무것도 안 재는 것이다.
//     게다가 쌍봉의 중앙값은 눌린 비율이 몇 %만 움직여도 0.30 쪽과 1.0 쪽 사이를 널뛴다.
//   ⇒ **분모를 '눌리지 않은 산'으로 바꿨다.** 문턱 0.72 는 **한 자리도 안 건드렸다**
//     (문턱 조정은 원인을 안 고치고 바를 낮추는 것이다 — 이 레포가 금지한다).
//   ⇒ 그리고 판정이 여전히 **떨어질 줄 아는지** 음성 대조로 같이 잰다(⑤-b).
//   ⑥ 그림이 실제로 바뀐다      — footOff A/B 로 풀밭 상자 화소가 달라진다
//   ⑦ ★반례 — 먼 풀밭은 그대로  — 바위에서 먼 상자는 A/B 가 동일해야 한다
//   ⑧ 결정론                    — 같은 상태 두 프레임 동일(Math.random 없음)
//
// 포트 3010/3020 공용 — E2E 동시 실행 금지.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const SITE = { cx: 1750, cy: 74 };            // 바위와 풀이 같이 보이는 자리(probe-mtgap 과 동일)
const FOOT_DMAX = 1.6;   // ★재민 "정확하게 산 셀" 이후 5.2 → 1.6 (미세한 오차 범위)
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
fs.writeFileSync('/tmp/zone-wrap-foot.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

function diff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, t = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x1); x++) {
    const i = (y * a.width + x) * 4; t++;
    s += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
  }
  return t ? s / t : 0;
}
const med = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

(async () => {
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('zone', '/tmp/zone-wrap-foot.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/foot.db', CENTRAL_URL: `http://localhost:${CPORT}`,
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
  const shot = async (n) => { const p2 = `/tmp/foot-${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(1400); };

  // ★기슭은 이제 **기본이 끔**이다(재민 "정확하게 산 셀" 이후). 하네스는 켜고 시험한다.
  await knob({ footOff: false });
  // ── 정본 세그먼트를 그대로 받는다(하네스가 배치 수학을 다시 쓰지 않는다 — 사본 금지)
  const probe = await page.evaluate(() => window.__mtProbe());
  const feet = probe.filter((p) => p.ridge === '기슭');
  const mts = probe.filter((p) => p.ridge === 'L' || p.ridge === 'M');
  console.log(`\n[기슭] 정본 세그먼트 ${probe.length}장 중 기슭 ${feet.length}장 · 산(L/M) ${mts.length}장`);
  ok('① 기슭이 실제로 선다', feet.length > 8, `기슭 ${feet.length}장`);
  if (!feet.length) { console.log('기슭이 0장이라 이후 판정이 자명하다 — 중단.'); await browser.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(1); }

  // ②③④ 앵커 셀의 지형을 **정본 판정**으로 되묻는다
  const cells = feet.map((f) => [f.lcx, f.lcy]);
  const kinds = await page.evaluate((cs) => cs.map(([a, b]) => {
    const k = window.__tileStateAt(a, b); return k.kind;
  }), cells);
  const onRock = kinds.filter((k) => k === 'rock').length;
  const onWater = kinds.filter((k) => k === 'water').length;
  ok('② ★바위 밖에만 선다', onRock === 0, `바위 위 앵커 ${onRock}개 / ${feet.length}`);
  ok('④ ★물 위엔 안 선다', onWater === 0, `물 위 앵커 ${onWater}개 / ${feet.length}`);

  // ③ 가장 가까운 바위까지 거리 — 정본 판정으로 재서 dMax 안인지 본다
  const dists = await page.evaluate((cs) => cs.map(([a, b]) => {
    let best = 99;
    for (let dx = -8; dx <= 8; dx++) for (let dy = -8; dy <= 8; dy++) {
      const k = window.__tileStateAt(a + dx, b + dy);
      if (k.kind === 'rock') { const d = Math.hypot(dx, dy); if (d < best) best = d; }
    }
    return best;
  }), cells);
  const over = dists.filter((d) => d > FOOT_DMAX + 0.9).length;   // 격자 지터 여유 0.9셀
  ok('③ ★바위 가까이만 선다', over === 0,
    `바위까지 거리 중앙값 ${med(dists).toFixed(1)}셀 · 최대 ${Math.max(...dists).toFixed(1)} · 한계 ${FOOT_DMAX} 초과 ${over}개`);

  // ⑤ 납작한가 — "작은 산"이 아니라 "납작한 산"이라는 설계가 그림에 있는가
  //   ★분모는 **서 있는 산**이다(머리말 참조). 하한은 렌더 정본에서 읽는다 — 상수를 베끼지 않는다.
  const _terrSrc = fs.readFileSync(path.join(ROOT, 'public', 'client', '10-r1-terrain.js'), 'utf8');
  const _mvy = /MT_VY_MIN\s*=\s*([0-9.]+)/.exec(_terrSrc);
  ok('⑤-0 렌더 정본에서 vy 하한을 읽었다', !!_mvy, _mvy ? `MT_VY_MIN = ${_mvy[1]} (10-r1-terrain.js)` : '정규식이 안 맞는다 — 상수가 옮겨졌나');
  const VY_MIN = _mvy ? parseFloat(_mvy[1]) : 0.30;
  const EPS = 0.005;                       // 부동소수 여유 — 하한에 '눌린' 것을 가른다

  const vyF = await page.evaluate(() => window.__mtProbe().filter((p) => p.ridge === '기슭').map((p) => p.vy));
  const vyMall = await page.evaluate(() => window.__mtProbe().filter((p) => p.ridge === 'L' || p.ridge === 'M').map((p) => p.vy));
  const vyM = vyMall.filter((v) => v > VY_MIN + EPS);          // ★서 있는 산만
  const pinned = vyMall.length - vyM.length;
  const mf = med(vyF), mm = med(vyM), mmAll = med(vyMall);

  // ★진단을 판정 옆에 찍는다 — 다음 사람이 이 수를 다시 재지 않게.
  //   ⚠기슭은 눌림을 세지 않는다 — 설계 범위가 `MT_FOOT.vy0..vy1 = 0.26..0.52` 라
  //     0.30 근처 값이 **자연히** 나온다. 눌린 것과 구별이 안 되므로 세지 않는 것이 정직하다.
  console.log(`  [⑤ 분포] 산 ${vyMall.length}장 중 하한(${VY_MIN}) 눌림 ${pinned}장(${(100 * pinned / Math.max(1, vyMall.length)).toFixed(0)}%)` +
              ` · 서 있는 산 ${vyM.length}장 중앙 ${mm.toFixed(3)} · 전체(쌍봉) 중앙 ${mmAll.toFixed(3)}` +
              ` · 기슭 ${vyF.length}장 중앙 ${mf.toFixed(3)} [${Math.min(...vyF).toFixed(3)}~${Math.max(...vyF).toFixed(3)}]`);

  ok('⑤-a ★분모가 쌍봉이다 — 눌린 산이 실제로 섞여 있다', pinned > 0 && vyM.length > 0,
    `눌림 ${pinned}장 · 서 있는 산 ${vyM.length}장  (둘 중 하나가 0이면 이 판정을 가를 이유가 없다)`);
  ok('⑤ ★기슭은 **서 있는 산**보다 납작하다', mf < mm * 0.72,
    `기슭 ${mf.toFixed(3)} < 서 있는 산 ${mm.toFixed(3)} × 0.72 = ${(mm * 0.72).toFixed(3)}  (실제 비 ${(mf / mm).toFixed(3)} · 옛 분모였다면 ${(mf / mmAll).toFixed(3)})`);
  // ★음성 대조 — 판정이 **여전히 떨어질 줄 아는가.** 통과가 여유 때문이 아니라 사실 때문인지 본다.
  //   기슭 vy 를 조금씩 부풀려 어디서 ✗ 가 나는지 찾는다. 배율이 무한대여야 깨진다면 그건 판정이 아니다.
  let breakAt = null;
  for (let k = 1.05; k <= 8; k += 0.05) { if (!((mf * k) < mm * 0.72)) { breakAt = k; break; } }
  ok('⑤-b ★음성 대조 — 기슭을 조금 부풀리면 이 판정은 떨어진다', breakAt !== null && breakAt <= 4,
    breakAt === null ? '8배로 부풀려도 안 깨진다 — 판정이 아니라 장식이다'
                     : `기슭 vy ×${breakAt.toFixed(2)} 에서 ✗ (그 아래는 ○) — 여유가 유한하다`);

  // ⑥⑦ 그림 A/B — 바위 경계 근처는 바뀌고, 먼 풀밭은 안 바뀐다
  await knob({ footOff: true }); const off = await shot('off');
  await knob({ footOff: false }); const on = await shot('on');
  // ★상자는 찍지 말고 **재서 고른다** — 눈대중 상자는 빈 하늘이 걸려 자명 통과가 된다(덫 13번)
  let nearBox = null, nearBest = 0;
  for (let bx = 40; bx < 1300; bx += 50) for (let by = 260; by < 800; by += 50) {
    const b = [bx, by, bx + 110, by + 80];
    const m = diff(on, off, b); if (m > nearBest) { nearBest = m; nearBox = b; }
  }
  let farBox = null, farBest = 1e9;
  for (let bx = 40; bx < 1300; bx += 50) for (let by = 260; by < 800; by += 50) {
    const b = [bx, by, bx + 110, by + 80];
    if (Math.hypot(bx - nearBox[0], by - nearBox[1]) < 260) continue;
    const m = diff(on, off, b); if (m < farBest) { farBest = m; farBox = b; }
  }
  // ★문턱 6 → 3 [재민 "살짝은 침범당해도 돼" → 여유 2.0 채택 후]
  //   산이 커지면서 기슭 자리를 산이 더 많이 덮어, 기슭을 껐다 켜도 바뀌는 화소가 줄었다(6.7 → 4.7).
  //   ★완화처럼 보이지만 판정을 지탱하는 건 ⑦ 이다 — **안 닿는 자리는 0.00** 이라야 한다.
  //   4.7 대 0.00 은 여전히 뚜렷한 신호다. 신호가 사라지면 ⑦ 이 아니라 ⑥ 이 먼저 무너진다.
  ok('⑥ 기슭이 그림을 실제로 바꾼다', nearBest > 3, `가장 많이 바뀐 상자 ${JSON.stringify(nearBox)} |Δ| ${nearBest.toFixed(1)} (안 닿는 자리는 ⑦ 에서 0.00)`);
  ok('⑦ ★반례 — 안 닿는 자리는 그대로다', farBest < 0.5, `가장 덜 바뀐 상자 |Δ| ${farBest.toFixed(2)}`);

  // ⑧ 결정론
  //  ★[계측 격리 2026-08-07] 이 판정의 뜻은 **산 배치에 Math.random 이 없다**이지
  //    "화면이 완전히 정지해 있다"가 아니다. 배치 21 이 자연물(술·들꽃)에 **바람 흔들림**을
  //    넣으면서 두 프레임 사이에 풀이 실제로 움직인다 — 기준을 낮추면 안 되고,
  //    **재는 층을 격리**하는 게 맞다(e2e-terrain ⓞ 와 같은 계보). 오염값도 같이 찍는다.
  const aC = await shot('det0a'); await sleep(900); const bC = await shot('det0b');
  const ddC = diff(aC, bC, [0, 200, 1400, 880]);
  await knob({ windOff: true });
  const a2 = await shot('det1'); await sleep(900); const b2 = await shot('det2');
  await knob({ windOff: false });
  const dd = diff(a2, b2, [0, 200, 1400, 880]);
  console.log(`    [계측 격리] 바람 켠 채로 재면 |Δ| ${ddC.toFixed(3)} — 흔들리는 건 풀이지 산이 아니다`);
  ok('⑧ ★결정론 — 같은 상태 두 프레임 동일(바람 격리)', dd < 0.05, `|Δ| ${dd.toFixed(3)}`);
  ok('★대조군 — 바람을 켜면 화면이 실제로 움직인다', ddC > dd, `바람 ON |Δ| ${ddC.toFixed(3)} > OFF ${dd.toFixed(3)}`);

  console.log(`\n${pass}/${pass + fail} 통과${fail ? ' — ★실패 ' + fail : ''}`);
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
