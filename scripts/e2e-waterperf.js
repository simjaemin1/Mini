#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @pixel    ← ★[T104] **프레임을 화소로 잰다**(`page.screenshot` → `PNG.sync.read`).
//              렌더 층(`3x-r*`·`34-m-renderloop`·`37-r1-*`)을 만지는 카드는 이 표를 전수로 돌려라 —
//              `bash scripts/run-regress.sh --list pixel`. 이름으로는 못 찾는다(T98: `e2e-nature` 는
//              하늘 때문에 셋이 빨갰는데 그 파일엔 `weather` 라는 낱말이 없어 `grep -l` 에 안 걸렸다).
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

  const knob = async (o) => { await page.evaluate((k) => Object.assign(window.__terrain19, k), o); await sleep(600); };
  //   ★[계측 격리 2026-08-07] 배치 21 이 **지면 풀 카펫**을 흔들리게 했다 — 이제 화면은
  //     시각이 흐르면 저절로 바뀐다. 이 하네스는 서로 다른 시각에 찍은 두 프레임을 픽셀로
  //     비교하므로, 안 끄면 **흔들린 풀을 '차이'로 오독한다**(실측: 산 반례 33.4%, 물 |Δ| 3.16).
  //     기준을 낮추는 대신 **재는 층을 격리**한다. ★sleep 이 붙은 knob() 이 아니라 **측정 전에
  //     곧바로** 끈다 — 격리가 실험 타이밍을 밀면 뙈기/자리 선택이 바뀐다(e2e-tilestate 에서 겪었다).
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  // ★[T98 2026-09-05] **하늘도 끈다** — 바람을 끈 것과 같은 자리다. T98 이 `weatherFor` 에
  //   `precip` 을 실으면서 세계가 실제로 비를 보낸다. 비는 매 프레임 다시 그려지고 **안개 합성 뒤**에
  //   그려지므로, 두 프레임 동일·안개 위 밝은 픽셀 같은 판정이 하늘 때문에 빨개진다.
  //   이 하네스가 재는 건 하늘이 아니다 ⇒ 끄는 문은 T93 이 남긴 진단 훅 하나(안 켜져 있으면 무해).
  await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });

  const grab = async (n) => { const p2 = `${SHOTS}/${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const pulse = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(120); };

  // ── 걷기 주행: 같은 길을 손잡이만 바꿔 두 번. 매번 캐시를 식혀 **처음 보는 땅** 비용을 잰다.
  // ★주행 비용은 **정본 `_buildFlowTex` 를 그대로 불러** 잰다(하네스가 계산을 다시 쓰지 않는다).
  //   걸어서 재려면 512px 마다 8초라 A/B 두 바퀴가 안 돈다 — 아래 ⓒ 에서 "걸으면 실제로 다시
  //   굽는다"를 따로 증명하므로, 이 대리 측정이 실사용과 같은 동작이라는 근거가 있다.
  // ★★[T10-② 2026-09-01] 자기 실패 검사기 — `WATERPERF_SABOTAGE=1` 이면 **수리를 몰래 끈다.**
  //   판정을 비율의 비율로 바꿨으니, 그 판정이 "무엇을 넣어도 통과"하지 않는다는 걸
  //   **밖에서 한 번 돌려 빨간 걸 보이는** 방법이 있어야 한다(대조군).
  //   기본 부팅에선 분기 자체가 없다 — 라이브·러너 동작은 한 글자도 안 바뀐다.
  const SABOTAGE = process.env.WATERPERF_SABOTAGE === '1';
  async function probe(label, opts, step) {
    if (SABOTAGE) opts = { ...opts, slowFlow: true };   // '수리' 자리에도 대조를 넣는다 ⇒ 배율 ≈ 1
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

  // ═══ ★★[짝 비교 전환 2026-08-31 재민 확정] 한 판 단일 측정 → **번갈아 여러 판** ═══
  //
  //   재민 확정: *"ms 는 기계 의존 — 같은 순간 A/B 로만."*
  //   종전엔 slow/fast 를 **한 번씩만** 재고 그 배율에 문턱 8 을 걸었다. 2코어 컨테이너에서
  //   `max of 8 frames` 는 꼬리가 두꺼워, **베이스 커밋도** 5.2~9.4 로 흔들렸다(온도 배치 실측 17판).
  //   문턱이 분포 한가운데에 걸려 있었던 것이다 — 그건 수리가 아니라 **그날의 CPU** 를 재는 판정이다.
  //
  //   ⇒ 고치는 방향은 **문턱을 낮추는 게 아니라**(그건 판정을 느슨하게 만드는 것) **통계를 고치는 것**:
  //     ① 한 라운드 안에서 slow → fast 를 **붙여서** 잰다(같은 순간 = 같은 CPU 부하를 공유).
  //     ② 라운드를 여러 번 돌려 **라운드별 배율의 중앙값**으로 판정한다(꼬리를 자른다).
  //   ⇒ 문턱 8 은 그대로 둔다. 느슨해지지 않았고, 오히려 잡음이 빠져 더 엄해졌다.
  const ROUNDS = parseInt(process.env.WATERPERF_ROUNDS || '5', 10) || 5;
  const FRAME = 1000 / 60;   // 60fps 한 프레임 = 16.7ms
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  say(`\n[ⓐ 같은 순간 짝 비교 — slow↔fast 를 붙여서 ${ROUNDS}라운드, 배율의 중앙값으로 판정]`);
  const R = [];
  for (let i = 0; i < ROUNDS; i++) {
    // 걷는 속도(16셀 = 창이 밀릴 때) · 새 땅(128셀 = 겹침 0 · 순간이동 최악값) 둘 다 한 라운드에 넣는다
    const s16 = await probe(`R${i + 1} 대조(16)`, { slowFlow: true }, 16);
    const f16 = await probe(`R${i + 1} 수리(16)`, { slowFlow: false }, 16);
    const s128 = await probe(`R${i + 1} 대조(128)`, { slowFlow: true }, 128);
    const f128 = await probe(`R${i + 1} 수리(128)`, { slowFlow: false }, 128);
    const sw = Math.max(s16.max, s128.max), fw = Math.max(f16.max, f128.max);
    R.push({ sw, fw, r: sw / Math.max(0.01, fw), s16: s16.max, f16: f16.max, s16a: s16.avg, f16a: f16.avg });
    say(`    R${i + 1}: 대조 최악 ${sw.toFixed(0)}ms · 수리 최악 ${fw.toFixed(0)}ms → 배율 ${R[i].r.toFixed(1)}배`);
  }
  const rMed = med(R.map((x) => x.r)), swMed = med(R.map((x) => x.sw)), fwMed = med(R.map((x) => x.fw));
  say(`\n    ★중앙값 — 대조 ${swMed.toFixed(0)}ms(${(swMed / FRAME).toFixed(1)}프레임) · 수리본 ${fwMed.toFixed(0)}ms(${(fwMed / FRAME).toFixed(1)}프레임) · **배율 ${rMed.toFixed(1)}배**`
    + `   [판별 폭 ${Math.min(...R.map((x) => x.r)).toFixed(1)}~${Math.max(...R.map((x) => x.r)).toFixed(1)}]`);
  ok(med(R.map((x) => x.f16)) < med(R.map((x) => x.s16)) / 3,
    `★★수리본이 한 장 최대에서 3배 이상 빠르다 (${med(R.map((x) => x.f16)).toFixed(0)}ms vs ${med(R.map((x) => x.s16)).toFixed(0)}ms · 중앙값)`);
  ok(med(R.map((x) => x.f16a)) < med(R.map((x) => x.s16a)) / 3,
    `★★평균도 3배 이상 (${med(R.map((x) => x.f16a)).toFixed(0)}ms vs ${med(R.map((x) => x.s16a)).toFixed(0)}ms · 중앙값)`);
  // ═══ ★★[T10-② 2026-09-01] **절대 문턱은 판정에서 뺐다 — 참고 출력으로 내린다** ═══
  //
  //   왜(실측): 이 판을 5회 돌려 판정량의 분포를 먼저 쟀다(러너와 같은 규약 · 순차 단독).
  //     rMed  9.36 · 9.41 · 9.54 · 9.65 · 10.66      (문턱 8 과의 여유 17%)
  //     라운드 낱개  6.09 ~ 12.20                     ← 낱개는 문턱 아래로 내려간다
  //     rSab  1.004 ~ 1.082                          ← 같은 순간 대조 짝(수리 없음)
  //   ⇒ 중앙값 도입이 판정량을 5.2~9.4(문턱에 걸쳐 있던 분포)에서 9.4~10.7 로 올린 건 맞다.
  //     그러나 8 은 여전히 **꼬리 바로 위**에 서 있다 — 기계가 하루 나빠지면 다시 빨개진다.
  //     반면 `rSab` 는 1.00~1.08 로 아주 좁다. **같은 순간 대조가 진짜 자다.**
  //   ⇒ 판정을 **비율의 비율**로 옮긴다: `rMed > rSab × K`.
  //     K 는 재서 고른다 — 수리 있는 짝 8.81~10.00(=rMed/rSab), 수리 없는 짝 1.0.
  //     둘 사이 로그 중앙이 ≈3.0 이므로 **K=4**: 잡음(1.0)에서 4배 위 · 실측 최소(8.81)에서 2.2배 아래.
  //   ⇒ 절대값 셋(120ms · 4프레임 · 8배)은 **지우지 않고 찍는다.** 사람이 읽을 값이지 판정할 값이 아니다.
  //     (족보 80 — 살아 있는 세계의 ms 를 절대값으로 읽으면 없는 회귀를 본다)
  //   ⚠판정에서 뺀 것이 잃는 것도 있다: `fwMed < 120` 은 "실기에서 한 프레임 안에 든다"는
  //     **사용자 쪽 주장**이었다. 그 주장은 이제 이 하네스가 안 지킨다 — 회부에 적었다.
  const REF = [];
  REF.push(`한 프레임 ${fwMed.toFixed(0)}ms (참고 상한 120ms · ${fwMed < 120 ? '안' : '★밖'})`);
  REF.push(`대조 ${(swMed / FRAME).toFixed(1)}프레임 (참고 하한 4프레임 · ${swMed > FRAME * 4 ? '넘음' : '★못 넘음'})`);
  REF.push(`배율 중앙값 ${rMed.toFixed(1)}배 (참고 문턱 8 · ${rMed >= 8 ? '위' : '★아래'})`);
  say(`    [참고 — 판정 아님] ${REF.join(' · ')}`);

  ok(med(R.map((x) => x.f16)) < med(R.map((x) => x.s16)) / 3,
    `★★수리본이 한 장 최대에서 3배 이상 빠르다 (${med(R.map((x) => x.f16)).toFixed(0)}ms vs ${med(R.map((x) => x.s16)).toFixed(0)}ms · 중앙값 · 같은 순간 짝)`);
  ok(med(R.map((x) => x.f16a)) < med(R.map((x) => x.s16a)) / 3,
    `★★평균도 3배 이상 (${med(R.map((x) => x.f16a)).toFixed(0)}ms vs ${med(R.map((x) => x.s16a)).toFixed(0)}ms · 중앙값 · 같은 순간 짝)`);

  // ── ★★자명 통과 금지 — **판정이 실패할 줄 아는가**를 같은 판에서 증명한다 ──────────
  //   수리본 자리에 **일부러 대조군을 넣어** 한 라운드를 더 돈다. 이 짝의 배율(rSab)이
  //   판정의 **분모**다 — 즉 이 하네스는 자기 잡음 바닥을 매 판 다시 재서 그 위에서 판정한다.
  const RR_K = parseFloat(process.env.WATERPERF_RR_K || '4') || 4;
  let rSab = 0;
  {
    const sA = await probe('반례 대조(16)', { slowFlow: true }, 16);
    const sB = await probe('반례 "수리"(실은 대조·16)', { slowFlow: true }, 16);
    const sC = await probe('반례 대조(128)', { slowFlow: true }, 128);
    const sD = await probe('반례 "수리"(실은 대조·128)', { slowFlow: true }, 128);
    rSab = Math.max(sA.max, sC.max) / Math.max(0.01, Math.max(sB.max, sD.max));
    say(`    반례 배율 ${rSab.toFixed(3)}배 (수리를 끄고 같은 걸 두 번 잰 것 — 참값 1)`);
    // ★자가 믿을 만한가: 대조 짝이 2배씩 흔들리면 그 판의 어떤 배율도 못 믿는다.
    //   실측 1.004~1.082 라 2 는 넉넉하다(느슨해진 게 아니라 종전 8 에서 **조인** 것이다).
    ok(rSab < 2, `★★계기 신뢰 — 같은 걸 두 번 잰 짝이 2배 안에 든다 (${rSab.toFixed(3)}배 < 2)`);
    // ★★이게 이 하네스의 **판정**이다 — 비율의 비율.
    ok(rMed > rSab * RR_K,
      `★★수리 있는 짝이 없는 짝보다 ${RR_K}배 넘게 낫다 — 비율의 비율 ${(rMed / Math.max(0.01, rSab)).toFixed(2)} > ${RR_K}`
      + `  (수리 ${rMed.toFixed(1)}배 vs 잡음 ${rSab.toFixed(3)}배)`);
  }
  // ★기계 간 비교용 기계 판독 출력 — `scripts/perf-pair.js` 가 이 줄만 읽는다(사람 눈 문장은 위에).
  say(`WATERPERF_JSON ${JSON.stringify({ rMed, swMed, fwMed, rSab: +rSab.toFixed(3), rr: +(rMed / Math.max(0.01, rSab)).toFixed(3), rounds: R.map((x) => +x.r.toFixed(3)) })}`);

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
