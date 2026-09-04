#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
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
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(20000);

  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(1400); };
  //   ★[계측 격리 2026-08-07] 배치 21 이 **지면 풀 카펫**을 흔들리게 했다 — 이제 화면은
  //     시각이 흐르면 저절로 바뀐다. 이 하네스는 서로 다른 시각에 찍은 두 프레임을 픽셀로
  //     비교하므로, 안 끄면 **흔들린 풀을 '차이'로 오독한다**(실측: 산 반례 33.4%, 물 |Δ| 3.16).
  //     기준을 낮추는 대신 **재는 층을 격리**한다. ★sleep 이 붙은 knob() 이 아니라 **측정 전에
  //     곧바로** 끈다 — 격리가 실험 타이밍을 밀면 뙈기/자리 선택이 바뀐다(e2e-tilestate 에서 겪었다).
  await page.evaluate(() => { window.__terrain19.windOff = true; });

  const grab = async (n) => { const p2 = `${SHOTS}/${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  // ★★[계측기 수리] 고정 sleep 은 **굽기 지연을 결과로 읽는다.**
  //   청크 재굽기 예산이 프레임당 1개라, 49셀을 부수면 여러 청크가 더러워지고
  //   다 구워지기까지 프레임이 여러 장 든다. 2200ms 가 어떤 날은 충분하고 어떤 날은 모자라
  //   같은 트리에서 |Δ| 34.94 와 1.78 이 번갈아 나왔다(실측).
  //   ⇒ **연속 두 장이 같아질 때까지** 기다린다. 장면 상수가 아니라 성질이다.
  const settleShot = async (tag, box, maxMs = 60000) => {
    let prev = await grab(tag + '-s0'), t = 0, k = 0;
    while (t < maxMs) {
      await sleep(700); t += 700; k++;
      const cur = await grab(tag + '-s' + k);
      if (meanAbsDiff(prev, cur, box) < 0.05) return { img: cur, ms: t };
      prev = cur;
    }
    return { img: prev, ms: t, timeout: true };
  };
  const scr = (lcx, lcy) => page.evaluate(([a, b]) => window.__cellScreen(a, b), [lcx, lcy]);
  const boxAt = async (lcx, lcy, w, h) => { const p2 = await scr(lcx, lcy); return [Math.round(p2.x - w), Math.round(p2.y - h), Math.round(p2.x + w), Math.round(p2.y + h)]; };
  // ★★[계측기 수리 2026-08-25] 산 상자는 셀의 **발치**가 아니라 **표면**을 봐야 한다.
  //   높이 1칸 = 32화소 규약이라 35m 산의 표면은 발치보다 ~1120화소 위에 그려진다.
  //   9m 시절에 잡아 둔 발치 상자는 35m 에서 산을 통째로 놓친다 — 실측에서 파괴 |Δ| 가
  //   34.94(운 좋은 날) 와 1.78(상자 밖) 사이를 오갔다. 정본 `__mtHeightAt` 으로 올린다.
  const boxSurf = async (lcx, lcy, w, h) => {
    const p2 = await scr(lcx, lcy);
    const hh = await page.evaluate(([a, b]) => window.__mtHeightAt(a, b), [lcx, lcy]);
    const y = p2.y - hh * 32;
    return [Math.round(p2.x - w), Math.round(y - h), Math.round(p2.x + w), Math.round(y + h)];
  };
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

  // ★★[재민 2026-08-07 "정확하게 산 셀인 곳에만 산이 있어야 해"] — **반대 방향**을 잰다.
  //   덮개율만 재면 스프라이트를 키워 채우는 잘못된 해법이 통과한다. 실제로 그렇게 됐었다:
  //   산이 바위 밖으로 중앙값 3셀·최대 6셀 나가 있었는데 한쪽만 재느라 못 봤다.
  //   판정은 정본 훅 __mtSpillAt 이 한다 — 규칙으로 가르려던 두 번의 시도가 다 헐거웠다.
  //   앵커 세로 위치 v0 기준: 셀이 그보다 아래면 앞 치맛자락(결함), 위면 몸통 뒤(정상).
  say('\n[ⓑ2 산이 바위 밖으로 넘치지 않는가]');
  // ★★[계측기 수리 2026-08-25] 옛 판정은 `__mtSpillAt`(스프라이트 전용 훅)으로 쟀다.
  //   높이장 판의 띠는 `sg.name` 이 없어 그 훅에서 **전부 걸러진다** — cov 가 늘 0 이라
  //   "넘침 0%" 가 자명 통과가 됐다(자명 통과 금지 가드가 실제로 이걸 잡아 적신호를 냈다).
  //   ⇒ 높이장에서 "넘친다"의 뜻을 정확히 쓴다: **메시에 든 비바위 셀은 자락 한 칸뿐이어야 한다.**
  //     (굽기 규약이 '바위 ∪ 바위에 8-인접'이므로, 바위에 안 붙은 비바위 셀이 메시에 들면 그게 넘침이다.)
  //     화소 덮개로 재면 안 된다 — 35m 산은 **뒤쪽 산이 앞 땅의 화면 자리를 덮는 게 정상**이다(원근).
  const camSp = await page.evaluate(() => window.__camCellLocal());
  const around = [];
  for (let dx = -20; dx <= 20; dx++) for (let dy = -20; dy <= 20; dy++) around.push([camSp[0] + dx, camSp[1] + dy]);
  const mm = await page.evaluate((cs) => cs.map(([a, b]) => {
    const k = window.__tileStateAt(a, b);
    if (k.kind === 'water') return null;
    const m = window.__mt3MeshAt(a, b);
    return m ? { rock: m.rock, mesh: m.mesh, adj: m.adj } : null;
  }), around);
  const sm = mm.filter(Boolean);
  const meshNonRock = sm.filter((v) => v.mesh && !v.rock);
  const spill = meshNonRock.filter((v) => !v.adj);
  const meshRock = sm.filter((v) => v.mesh && v.rock);
  say(`    표본 ${sm.length}셀 · 메시 든 바위 ${meshRock.length} · 메시 든 **비바위** ${meshNonRock.length}(자락) · 그중 바위에 안 붙은 것 ${spill.length}`);
  ok(sm.length > 100, `표본이 충분하다 (${sm.length})`);
  ok(meshRock.length > 0, `★자명 통과 금지 — 이 창에 메시에 든 바위 셀이 실제로 있다 (${meshRock.length})`);
  ok(meshNonRock.length > 0, `★자명 통과 금지 — 자락(비바위 메시 셀)이 실제로 있다 (${meshNonRock.length}) — 0 이면 넘침 판정이 자명하다`);
  ok(spill.length === 0, `★★산이 바위 밖으로 넘치지 않는다 — 바위에 안 붙은 메시 셀 ${spill.length}개`);
  // ★옛 훅이 눈멀었다는 사실 자체를 회귀로 박제한다 — 나중에 mt3 를 보게 고치면 이 판정이 알려 준다.
  const spProbe = await page.evaluate(([a, b]) => window.__mtSpillAt(a, b), around[Math.floor(around.length / 2)]);
  say(`    (옛 훅 __mtSpillAt: cov ${spProbe ? spProbe.cov : '?'} · **못 본 mt3 띠 ${spProbe ? spProbe.mt3Skipped : '?'}장**)`);
  ok(!spProbe || spProbe.mt3Skipped > 0,
    `★__mtSpillAt 은 높이장 띠를 못 본다는 사실이 드러나 있다 (건너뛴 띠 ${spProbe ? spProbe.mt3Skipped : '?'}장) — 조용히 0 을 돌려주지 않는다`);

  // 반례: 바위가 아닌 자리 상자에는 산 픽셀이 0 이어야 한다(mtOff A/B 로 잰다)
  const mtOn = await grab('01-mt-on');
  await knob({ mtOff: true });
  const mtOffShot = await grab('02-mt-off');
  await knob({ mtOff: false });
  const bxRock = await boxSurf(near.lcx, near.lcy, 90, 110);   // ★표면 기준 · 7×7 이 걸치게 세로를 넓힌다
  const pctRock = changedPct(mtOn, mtOffShot, bxRock);
  // ★★[계측기 수리] 옛 가드는 `y > 250` 같은 **화면 상수**로 "UI 밖"을 쟀다. 35m 표면은
  //   발치보다 1120화소 위라 그 띠를 벗어난다 — 상수를 늘리는 건 완화다.
  //   ⇒ 성질로 바꾼다: 상자가 캔버스 안이고, **산을 끄면 그 상자가 실제로 바뀐다**(=UI 가 아니라 세계다).
  const inCanvas = (b) => b[0] > 20 && b[1] > 20 && b[2] < mtOn.width - 20 && b[3] < mtOn.height - 20;
  ok(inCanvas(bxRock), `산 상자가 캔버스 안이다 ${JSON.stringify(bxRock)}`);
  ok(pctRock > 0, `★산 상자는 UI 가 아니라 **세계**다 — 산을 끄면 ${pctRock.toFixed(1)}% 가 바뀐다`);
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
  // ★기준 프레임도 **멈춘 뒤에** 떠야 한다. 안 그러면 파기 전/후 차이가 아니라
  //   '아직 굽는 중이던 프레임' 과의 차이를 재게 된다(실측: dDes 와 dBack 이 **같은 1.78**로 나왔다).
  const stB = await settleShot('03-before-destroy', bxRock);
  const before = stB.img;
  say(`    (파기 전 그림이 멈추기까지 ${stB.ms}ms${stB.timeout ? ' ※시간초과' : ''})`);
  // ★파기 **전** 정본 상태(마스크·높이)를 떠 둔다 — 복원 판정의 기준값이다.
  const hDestroyBase = await page.evaluate((cs) => cs.map(([a, b]) =>
    [window.__mtIsRock(a, b) ? 1 : 0, window.__mtHeightAt(a, b)]), cells);
  const nDes = await page.evaluate((cs) => window.__mtDestroy(cs), cells);
  const stA = await settleShot('04-after-destroy', bxRock);
  const after = stA.img;
  say(`    (파괴 뒤 그림이 멈추기까지 ${stA.ms}ms${stA.timeout ? ' ※시간초과' : ''})`);
  const dDes = meanAbsDiff(before, after, bxRock);
  const dDesOut = bxFlat ? meanAbsDiff(before, after, bxFlat) : 0;
  say(`    ${nDes}셀(7×7 정사각) 파괴 → 그 상자 |Δ| ${dDes.toFixed(2)} · 먼 상자 |Δ| ${dDesOut.toFixed(2)}`);
  ok(nDes === 49, `★정사각 셀 집합으로 팠다 (${nDes}셀 = 7×7)`);
  ok(dDes > 4, `★★판 자리의 산이 실제로 다시 계산됐다 (|Δ| ${dDes.toFixed(2)})`);
  ok(dDesOut < Math.max(1.0, dDes / 4), `★반례 — 안 판 먼 상자는 그대로다 (${dDesOut.toFixed(2)})`);
  // ═══════════════════════════════════════════════════════════════════════
  // ★★[계측기 수리 2026-08-25] "되돌리면 산이 그대로 돌아온다"가 참일 때 **무엇이 참이어야 하나**
  //   ⑴ 상태: __mtClearDestroy() 뒤의 상태는 파기 전과 **같은 상태**다.
  //      ⇒ 그 49셀의 `__mtIsRock` 이 다시 true 이고, `__mtHeightAt` 이 파기 전 값과 **정확히** 같다.
  //        이건 화면 애니메이션과 무관한 **정확 판정**이라 여기가 1차 판정이어야 한다.
  //   ⑵ 화소: 같은 상태면 같은 카메라·같은 시각의 그림도 같다. 단 화면에는 산 말고도
  //      시간에 따라 변하는 것이 있다(사람 대기 동작·자연물). 그러니 "같다"의 기준은
  //      **같은 간격의 무변화 대조군**(잡음 바닥)이지 장면 상수가 아니다.
  //      옛 판정은 `dBack < 1.5` 라는 **하드코딩 상수**였다 — 바닥이 그보다 높으면
  //      어떤 올바른 구현도 통과할 수 없다. 바닥을 재서 그것과 비교한다.
  // ═══════════════════════════════════════════════════════════════════════
  const hOf = async () => page.evaluate((cs) => cs.map(([a, b]) =>
    [window.__mtIsRock(a, b) ? 1 : 0, window.__mtHeightAt(a, b)]), cells);
  const hBefore = hDestroyBase;                         // 파기 **전**에 떠 둔 정본 상태
  await page.evaluate(() => window.__mtClearDestroy());
  const stR = await settleShot('05-restored', bxRock);
  const restored = stR.img;
  say(`    (복원 뒤 그림이 멈추기까지 ${stR.ms}ms${stR.timeout ? ' ※시간초과' : ''})`);
  const hAfter = await hOf();
  let rockBad = 0, hMax = 0;
  for (let k = 0; k < hBefore.length; k++) {
    if (hBefore[k][0] !== hAfter[k][0]) rockBad++;
    hMax = Math.max(hMax, Math.abs(hBefore[k][1] - hAfter[k][1]));
  }
  say(`    ⑴ 상태 복원 — 바위 마스크 불일치 ${rockBad}/${cells.length} · 높이 최대 |Δ| ${hMax.toFixed(3)}m`);
  ok(rockBad === 0, `★★⑴ 되돌리면 **바위 마스크**가 그대로 돌아온다 (불일치 ${rockBad}칸)`);
  ok(hMax < 0.01, `★★⑴ 되돌리면 **높이장**이 그대로 돌아온다 (최대 |Δ| ${hMax.toFixed(3)}m)`);
  // ⑵ 잡음 바닥 — 아무것도 안 바꾸고 같은 간격을 띄운 두 장. 이 차이가 화소 판정의 바닥이다.
  const nz0 = await grab('05b-noise-a');
  await sleep(2200);
  const nz1 = await grab('05c-noise-b');   // 무변화 대조군 — 같은 간격, 같은 상자
  const dNoise = meanAbsDiff(nz0, nz1, bxRock);
  const dBack = meanAbsDiff(before, restored, bxRock);
  say(`    ⑵ 화소 — 복원 |Δ| ${dBack.toFixed(2)} · **잡음 바닥** |Δ| ${dNoise.toFixed(2)} (같은 상자·같은 간격·무변화)`);
  ok(dNoise < dDes / 4, `★반례 — 잡음 바닥이 파괴 신호보다 훨씬 작다 (${dNoise.toFixed(2)} ≪ ${dDes.toFixed(2)}) — 바닥이 판정을 삼키지 않는다`);
  ok(dBack < Math.max(0.3, dNoise * 2), `★★⑵ 복원 그림이 **잡음 바닥과 구별되지 않는다** (${dBack.toFixed(2)} vs 바닥 ${dNoise.toFixed(2)})`);

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
