#!/usr/bin/env node
// =============================================================================
// e2e-mountain — 산 '장벽 세그먼트' 실클라 픽셀 E2E [배치 20 §C 미완분]
//   재민 확정(시안 왕복 12회): *"산으로 되어 있는 셀들만 산으로 보여야 —
//   셀이 여러 개 모이면 큰 산."* · 파괴는 **정사각 셀 집합**("한 셀이 정사각형인 거 잊었어?")
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같이 잰다:
//   ⓐ 능선 위엔 산이 선다      ↔ 반례: **바위 셀이 없는 자리**엔 산 픽셀이 0
//   ⓑ 폭이 셀 실측을 따른다     ↔ 반례: 넓은 밴드와 좁은 밴드의 sc 가 실제로 다르다
//   ⓒ 파괴하면 사라진다        ↔ 반례: 파괴를 **되돌리면** 다시 선다
//   ⓓ 결정론                  ↔ 같은 상태 두 프레임이 동일
//
// ★산 픽셀은 **색으로 세지 않는다.** `mtOff` 손잡이를 켜고 끈 **차이**로 잰다 —
//   산 스프라이트 색은 지면·나무와 겹쳐서 색 분류가 판별력을 잃는다(배치 19 프리즘에서 겪었다).
// ★배치 수학을 하네스가 다시 쓰지 않는다: `__mtProbe` 가 **정본이 만든 세그먼트**를 그대로 준다.
//
// ⚠서버에 바위 셀 제거(산 부수기) 메커니즘이 **아직 없다**(배치 20 §A-6 실측 0건).
//   ⓒ는 그 이벤트의 **클라 쪽 규격**(`__mtDestroy`)이 렌더를 제대로 다시 계산하는지만 잰다.
//
// 사용: ZDB=/tmp/mt.db node scripts/e2e-mountain.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/e2e-mountain';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/e2e-mountain.db';
fs.mkdirSync(SHOTS, { recursive: true });

// 촬영 지점 — 정본 판독기(server/terrain.js)로 고른 셀. 능선은 스폰에서 447셀 밖이라
//   걸어서 갈 수 없다(1패스에서 8번 걸어도 447셀 그대로였다) — **산 옆에 스폰시킨다**.
const SITE = { cx: 1750, cy: 74, why: '한울대간 · 수직 밴드 29셀 · 산까지 1셀 · 17×17 안 바위 144/289' };

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
fs.writeFileSync('/tmp/zone-wrap-mt.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

function meanAbsDiff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x1); x++) {
    const i = (y * a.width + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  }
  return n ? s / n / 3 : 0;
}
// 산 픽셀 = mtOff 켜고 끈 차이가 있는 픽셀(색 분류 금지 — 위 주석)
function changedPct(a, b, box, thr) {
  const [x0, y0, x1, y1] = box; let n = 0, t = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x1); x++) {
    const i = (y * a.width + x) * 4; t++;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d / 3 > (thr || 8)) n++;
  }
  return t ? n / t * 100 : 0;
}

(async () => {
  say('=== 산 장벽 세그먼트 실클라 E2E (배치 20 §C) ===');
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  const z = boot('zone', '/tmp/zone-wrap-mt.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }),
  });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(4000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => say('  [클라 오류] ' + String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) { }
  }
  await sleep(20000);

  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(1400); };
  const grab = async (n) => { const p2 = `${SHOTS}/${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const scr = (lcx, lcy) => page.evaluate(([a, b]) => window.__cellScreen(a, b), [lcx, lcy]);
  const boxAt = async (lcx, lcy, w, h) => { const p2 = await scr(lcx, lcy); return [Math.round(p2.x - w), Math.round(p2.y - h), Math.round(p2.x + w), Math.round(p2.y + h)]; };
  const onScreen = (bx) => bx[0] > 60 && bx[2] < 1340 && bx[1] > 250 && bx[3] < 860;

  // ── ⓐ 계약 ────────────────────────────────────────────────────────────────
  say('\n[ⓐ 계약 — 산 스프라이트·세그먼트가 실제로 있나]');
  const d0 = await page.evaluate(() => window.__mtDbg);
  say(`    ${JSON.stringify(d0)}`);
  ok(d0 && d0.sprites && d0.sprites.split('/')[0] === d0.sprites.split('/')[1] && +d0.sprites.split('/')[1] > 30,
     `산 스프라이트 전 종 로드 (${d0.sprites})`);

  say(`\n── 산 옆 셀(${SITE.cx},${SITE.cy}) — ${SITE.why}`);
  let probe = null, near = null;
  for (let tryN = 0; tryN < 6; tryN++) {
    probe = await page.evaluate(() => window.__mtProbe());
    const cam = await page.evaluate(() => window.__camCellLocal());
    if (probe && probe.length) {
      // ★가장 가까운 세그먼트가 아니라 **화면 깨끗한 자리에 드는** 세그먼트를 고른다.
      //   1패스에서 가장 가까운 것(9셀)이 화면 위쪽 HUD 뒤에 걸려 상자가 UI 를 물었고,
      //   그 상자로 잰 파괴 판정이 |Δ| 0.00 으로 거짓 실패했다.
      const withD = probe.map((p2) => ({ ...p2, d: Math.hypot(p2.lcx - cam[0], p2.lcy - cam[1]) }))
                         .sort((a, b) => a.d - b.d).slice(0, 60);
      near = null;
      for (const cand of withD) {
        const bx = await boxAt(cand.lcx, cand.lcy, 90, 60);
        if (onScreen(bx)) { near = cand; break; }
      }
      const nn = near || withD[0];
      say(`    ${tryN}차 카메라 셀 ${cam} · 세그먼트 ${probe.length}개 · 화면 안 후보 ${near ? '있음' : '없음'} · 최근접 ${nn.ridge}(${nn.lcx},${nn.lcy}) ${nn.d.toFixed(0)}셀`);
      if (near) break;
    } else say(`    ${tryN}차 — 세그먼트 0(능선이 시야 밖)`);
    for (let i = 0; i < 4; i++) { await page.keyboard.down('w'); await sleep(1500); await page.keyboard.up('w'); await sleep(150); }
  }
  ok(probe && probe.length > 0, `★능선 폴리라인에서 세그먼트가 실제로 계산됐다 (${probe ? probe.length : 0}개)`);
  ok(near !== null, `★산이 **화면 깨끗한 자리**에 있다 (${near ? near.ridge + ' ' + near.d.toFixed(0) + '셀' : '못 찾음'}) — 밖이나 UI 뒤에서 재면 전부 0 이다`);
  if (!near) { await browser.close(); try { z.kill(); } catch (e) { } for (const p2 of procs) { try { p2.kill(); } catch (e) { } } say(`\n=== 산: 통과 ${pass} · 실패 ${fail} ===`); process.exit(1); }

  // ── ⓑ 세그먼트는 **바위 셀 위에만** ────────────────────────────────────────
  //   ★★[2026-08-07 개정] 기슭이 들어오면서 이 판정이 73.3% 로 깨졌다. 기슭은 **일부러**
  //     풀밭에 선다 — 규칙이 바뀐 것이지 코드가 틀린 게 아니다.
  //     그렇다고 문턱을 낮추면(95→70) 판정이 아무것도 안 지킨다. **판정을 정확하게** 만든다:
  //       · 산 계층(L·M·S·틈) → 바위 위에만        ← 여기서 100% 로 조인다
  //       · 기슭             → 바위 **밖**에만     ← e2e-mtfoot ② 가 따로 100% 로 조인다
  //     둘을 합쳐 세면 어느 쪽도 안 지켜진다.
  say('\n[ⓑ 세그먼트가 실제 바위 셀 위에만 서는가]');
  const mtSegs = probe.filter((p2) => p2.ridge !== '기슭').slice(0, 300);
  const footN = probe.filter((p2) => p2.ridge === '기슭').length;
  const kinds = await page.evaluate((cs) => cs.map(([a, b]) => window.__tileStateAt(a, b).kind), mtSegs.map((p2) => [p2.lcx, p2.lcy]));
  const rockN = kinds.filter((k) => k === 'rock').length;
  say(`    산 계층 자리 ${kinds.length}개 중 바위 셀 ${rockN}개 (${(rockN / kinds.length * 100).toFixed(1)}%) · 기슭 ${footN}장은 판정 밖(e2e-mtfoot 소관)`);
  ok(kinds.length > 30, `산 계층 표본이 충분하다 (${kinds.length}) — 기슭만 남으면 판정이 자명해진다`);
  ok(rockN / kinds.length > 0.99, `★★산 계층은 바위 셀 위에만 선다 (${(rockN / kinds.length * 100).toFixed(1)}% > 99%)`);

  // 반례: 바위가 아닌 자리 상자에는 산 픽셀이 0 이어야 한다(mtOff A/B 로 잰다)
  const mtOn = await grab('01-mt-on');
  await knob({ mtOff: true });
  const mtOffShot = await grab('02-mt-off');
  await knob({ mtOff: false });
  const bxRock = await boxAt(near.lcx, near.lcy, 90, 60);
  ok(onScreen(bxRock), `산 상자가 화면 안(UI 밖)이다 ${JSON.stringify(bxRock)}`);
  const pctRock = changedPct(mtOn, mtOffShot, bxRock);
  // 바위가 아닌 셀 중 화면 안인 곳을 고른다
  const cam2 = await page.evaluate(() => window.__camCellLocal());
  let bxFlat = null, flatCell = null;
  for (const [dx, dy] of [[6, -10], [-10, 6], [9, -3], [-3, 9], [8, 4], [4, 8], [-8, -4], [-4, -8]]) {
    const lc = [cam2[0] + dx, cam2[1] + dy];
    const k = await page.evaluate(([a, b]) => window.__tileStateAt(a, b).kind, lc);
    if (k === 'rock') continue;
    const bx = await boxAt(lc[0], lc[1], 90, 60);
    if (!onScreen(bx)) continue;
    // 그 상자 안 셀이 전부 비바위인지 성기게 확인
    let allLand = true;
    for (let a = -2; a <= 2 && allLand; a++) for (let b = -2; b <= 2; b++) {
      const kk = await page.evaluate(([x, y]) => window.__tileStateAt(x, y).kind, [lc[0] + a, lc[1] + b]);
      if (kk === 'rock') { allLand = false; break; }
    }
    if (allLand) { bxFlat = bx; flatCell = lc; break; }
  }
  const pctFlat = bxFlat ? changedPct(mtOn, mtOffShot, bxFlat) : null;
  say(`    산 픽셀 비율(mtOff A/B) — 능선 상자 ${pctRock.toFixed(1)}%  ·  비바위 상자 ${pctFlat === null ? 'n/a' : pctFlat.toFixed(1) + '%'} (셀 ${flatCell})`);
  ok(pctRock > 8, `★★능선 상자에 산이 실제로 그려진다 (${pctRock.toFixed(1)}%)`);
  ok(bxFlat !== null, '비바위 대조 상자를 화면 안에서 잡았다');
  ok(pctFlat !== null && pctFlat < 2, `★★반례 — 바위 셀이 없는 자리엔 산이 없다 (${pctFlat === null ? '-' : pctFlat.toFixed(1)}% < 2%)`);

  // ── ⓒ 폭이 셀 실측을 따르는가 ──────────────────────────────────────────────
  say('\n[ⓒ 세그먼트 폭이 밴드 셀 수 실측을 따르는가]');
  const scs = probe.map((p2) => p2.sc).filter((v) => v > 0).sort((a, b) => a - b);
  const q1 = scs[Math.floor(scs.length * 0.1)], q9 = scs[Math.floor(scs.length * 0.9)];
  say(`    세그먼트 폭(sc) 분포 — 하위10% ${q1.toFixed(2)} · 상위10% ${q9.toFixed(2)} · 표본 ${scs.length}`);
  ok(scs.length > 20, `폭 표본이 충분하다 (${scs.length})`);
  ok(q9 > q1 * 1.5, `★★폭이 자리마다 다르다 (상위10% ${q9.toFixed(2)} > 하위10% ${q1.toFixed(2)}×1.5) — 한 폭으로 찍어내지 않는다`);
  // ★★[2026-08-07 추가] **배율 상한** — 옛 하네스는 "폭이 다른가"만 봤고 "제정신인가"는 안 봤다.
  //   그래서 배율 중앙값 5.8(= 512px 스프라이트를 5.8배 늘림 = 뭉갬)이 17/0 을 통과했다.
  //   상한선은 스프라이트가 **확대 없이** 견디는 배율이다: ppu / PPU_SCR.
  const _anMax = await page.evaluate(() => {
    const a = window.__mtAnchorsDbg || null; if (a) return a;
    return null;
  });
  const scMax = scs[scs.length - 1], scMed = scs[scs.length >> 1];
  const SHARP = 98 / (64 / Math.SQRT2);              // 포장 뒤 ppu 98 기준 = 2.16
  say(`    배율 중앙값 ${scMed.toFixed(2)} · 최대 ${scMax.toFixed(2)} · 확대 없는 한계 ${SHARP.toFixed(2)}`);
  ok(scMed < SHARP, `★★배율 중앙값이 확대 한계 안이다 (${scMed.toFixed(2)} < ${SHARP.toFixed(2)}) — 옛 배치는 5.8 이었다`);
  ok(scMax < SHARP * 1.35, `★배율 최대도 한계 근처다 (${scMax.toFixed(2)} < ${(SHARP * 1.35).toFixed(2)})`);
  ok(q1 > 0, '가장 좁은 세그먼트도 폭이 0 은 아니다');

  // ── ⓓ 파괴 후 재계산 ──────────────────────────────────────────────────────
  say('\n[ⓓ 파괴하면 그 자리 산이 사라지고, 되돌리면 다시 선다]');
  //   ★정사각 셀 집합으로 판다(재민: "한 셀이 정사각형인 거 잊었어?" — 원형 금지).
  const cells = [];
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) cells.push([near.lcx + a, near.lcy + b]);
  const before = await grab('03-before-destroy');
  const nDes = await page.evaluate((cs) => window.__mtDestroy(cs), cells);
  await sleep(2200);
  const after = await grab('04-after-destroy');
  const dDes = meanAbsDiff(before, after, bxRock);
  const dDesOut = bxFlat ? meanAbsDiff(before, after, bxFlat) : 0;
  say(`    ${nDes}셀(7×7 정사각) 파괴 → 그 상자 |Δ| ${dDes.toFixed(2)} · 먼 상자 |Δ| ${dDesOut.toFixed(2)}`);
  ok(nDes === 49, `★정사각 셀 집합으로 팠다 (${nDes}셀 = 7×7)`);
  ok(dDes > 4, `★★판 자리의 산이 실제로 다시 계산됐다 (|Δ| ${dDes.toFixed(2)})`);
  ok(dDesOut < Math.max(1.0, dDes / 4), `★반례 — 안 판 먼 상자는 그대로다 (${dDesOut.toFixed(2)})`);
  // 파괴를 되돌리면 원래 그림으로 — 우연한 변화가 아니라 파괴 집합을 읽는다는 증거
  await page.evaluate(() => window.__mtClearDestroy());
  await sleep(2200);
  const restored = await grab('05-restored');
  const dBack = meanAbsDiff(before, restored, bxRock);
  say(`    파괴를 되돌린 뒤 |Δ| = ${dBack.toFixed(2)} (파기 전 대비)`);
  ok(dBack < 1.5, `★★되돌리면 산이 그대로 돌아온다 (|Δ| ${dBack.toFixed(2)}) — 파괴 집합을 실제로 읽는다`);

  // ── ⓔ 결정론 ──────────────────────────────────────────────────────────────
  say('\n[ⓔ 결정론]');
  const f1 = await grab('06-det-a'), f2 = await grab('07-det-b');
  const dDet = meanAbsDiff(f1, f2, bxRock);
  ok(dDet < 0.5, `★같은 상태 두 프레임이 동일 (|Δ| ${dDet.toFixed(3)}) — 배치에 Math.random() 이 없다`);

  await browser.close(); try { z.kill(); } catch (e) { }
  for (const p2 of procs) { try { p2.kill(); } catch (e) { } }
  say(`\n=== 산 장벽 세그먼트: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); for (const p2 of procs) { try { p2.kill(); } catch (_) { } } process.exit(1); });
