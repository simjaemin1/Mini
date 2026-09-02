#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-weight.js — 무게 모델 **실클라** E2E ============================
//
// ★왜 [재민 확정 2026-08-27]
//   `test-weight` 57/0 은 "무게 계약이 지켜지는가"를 잰다. 이 레포가 배치 5에서 배운 것은
//   **계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다.
//   무게는 특히 그렇다: 짐이 무거워 느려진다는 사실이 **HUD 숫자·무들·실제 걸음**으로
//   도달하지 않으면 플레이어에게는 없는 규칙이다. 여기서는 진짜 Chromium 을 띄우고
//   짐을 실어 주고 **키를 눌러 걸어 본 뒤 위치 델타를 잰다**.
//
// ★★시간 모드: **얼리지 않는다.** 이 검사의 판정은 전부 상호작용(짐 싣기·걷기·패널)이고
//   게임일과 무관하다. 마을을 켜는 절(넘침 딱지·거래소 경고)만 `VILLAGE_DAY_MS` 로 데운다 —
//   시세가 흐르는 것이 판정을 흔들지 않게 그 절은 **비교가 아니라 존재 확인**만 한다.
//   (E2E_DAY_MS 계열 손잡이를 쓰는 하네스의 규약대로 머리에 모드를 적어 둔다.)
//
// 실행: node scripts/e2e-weight.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-weight-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-wt-central-${process.pid}.db`, ZDB = `/tmp/e2e-wt-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩 완료/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 무게 모델 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  const carry = () => page.evaluate(() => window.__carryState || null);
  const give = async (items) => { await page.evaluate((it) => window.__sendPrimary({ type: '__e2e_give', items: it }), items); await sleep(1400); };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2200);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // ── ① 카탈로그가 **서버에서** 왔다 · HUD 에 kg 이 뜬다 ────────────────────
  const cat = await page.evaluate(() => window.__itemWeights || null);
  ok(cat && Object.keys(cat).length > 200, '★★① kg 카탈로그를 **서버가 실어 보냈다**(클라가 표를 안 갖는다)',
    cat ? `${Object.keys(cat).length}종 · 곡식 ${cat.food}kg` : '안 옴');
  ok(cat && cat.food === 0.7, '★① 앵커가 화면 쪽에도 그대로', cat ? `food=${cat.food}` : '');
  let c0 = null;
  for (let i = 0; i < 20 && !c0; i++) { c0 = await carry(); if (!c0) await sleep(600); }
  ok(!!c0, '★① 소지 무게 상태가 온다', c0 ? `${c0.kg}kg / ${c0.cap}kg` : '안 옴');
  const inv0 = await page.evaluate(() => window.__getInv());
  console.log(`    시작 인벤: ${JSON.stringify(inv0)}  → ${c0 ? c0.kg : '?'}kg (용량 ${c0 ? c0.cap : '?'}kg)`);
  // ★★[2026-08-28 갱신 — 뒤집혔다] 종전엔 여기서 "**시작 지급만으로 용량을 넘긴다**"를 판정으로 박아 뒀다
  //   (판자 10장 30kg + 도구 3.6kg = 33.6kg > 25kg). **빈손 배치가 그 지급을 통째로 없앴다** —
  //   그래서 판정도 반대로 세운다: 새 플레이어는 **빈손이고 안 느리다**.
  //   (빈손 시작 자체의 전수 검사는 `test-emptystart`·`e2e-emptystart` 소관이다.)
  ok(c0.kg === 0 && !c0.over && c0.moveMult === 1,
    '★★① 새 플레이어는 **빈손이다** — 지급이 없으니 과적도 없다',
    `${c0.kg}kg / ${c0.cap}kg ×${c0.moveMult}`);
  const hud0 = await page.evaluate(() => (document.getElementById('carryHud') || {}).textContent || '');
  ok(/kg/.test(hud0), '★★① **HUD 에 kg 이 그려져 있다**', hud0.trim());
  await snap('wt-01-light');

  // ── ② 짐을 실으면 숫자가 오른다 ───────────────────────────────────────────
  await give({ stone: 5 });
  const c1 = await carry();
  ok(c1.kg > c0.kg, '★② 물건을 받으면 소지 무게가 는다', `${c0.kg} → ${c1.kg}kg`);
  const hud1 = await page.evaluate(() => (document.getElementById('carryKg') || {}).textContent || '');
  ok(Math.abs(parseFloat(hud1) - c1.kg) < 0.06, '★★② HUD 숫자가 **서버 값 그대로**다(클라가 다시 안 센다)', `HUD ${hud1} vs ${c1.kg}`);

  // ── ③ 가벼울 때의 걸음 — 대조군 ───────────────────────────────────────────
  //   ★대조군은 이제 **거저 생긴다** — 빈손 배치 뒤로 새 플레이어가 빈손이기 때문이다.
  //   (종전엔 시작 지급 판자 10장을 버려서 만들었다. 그 지급이 사라졌다.)
  //   ⚠단 위 ②에서 돌을 받았으니, 그 돌을 버려 다시 가볍게 만든다 — **게임 경로**(버리기)로만.
  await page.evaluate(() => window.__sendPrimary({ type: 'drop_item', item: 'stone', amount: 5 }));
  await sleep(1600);
  const cLight = await carry();
  ok(!cLight.over && cLight.moveMult === 1, '★★③ 짐을 버려 **가벼워졌다**(대조군 성립)', `${cLight.kg}kg / ${cLight.cap}kg ×${cLight.moveMult}`);
  const walk = async (ms) => {
    const a = await page.evaluate(() => window.__getMyAbs());
    await page.keyboard.down('KeyD'); await sleep(ms); await page.keyboard.up('KeyD');
    await sleep(500);
    const b = await page.evaluate(() => window.__getMyAbs());
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  //   ★거리 문턱은 **작게** 잡는다. 판정은 "얼마나 빠른가"가 아니라 **"짐 때문에 느려졌는가"**이고,
  //     절대 거리는 입력 큐 소비율(틱당 8개)·지형에 좌우된다(실측 1.5초에 ~38px).
  //     여기서 큰 수를 요구하면 계측기가 제 환경을 결함으로 읽는다.
  //   ★★[T49 2026-09-02] **잡음 바닥을 먼저 잰다**(족보 80). 같은 조건으로 두 번 걷는다.
  //     왜: ④ 는 "무거우면 덜 간다"를 5% 여유로 판정했는데, 입력 큐 소비율(틱당 8개)·지형 때문에
  //     **같은 조건 두 번도** 몇 % 씩 흔들린다. 2026-09-01 전수에서 38→37px(−2.6%)로 떨어졌다 —
  //     그건 "안 느려졌다"가 아니라 **"이 자로는 못 갈랐다"** 였다.
  //     ⇒ 절대 문턱(0.95)은 참고로 내리고, 판정은 **비율의 비율**로 한다:
  //       효과비(가벼움/무거움) 가 잡음비(가벼움/가벼움) 를 K 배 넘겨야 한다.
  //   ★★[T49 후속 2026-09-02] **첫 걸음은 버린다.** 잡음 바닥을 두 번 재 보니 첫 표본이
  //     자주 짧다(38 vs 45 · 32 vs 32 · 45 vs 45 — 짧을 땐 늘 앞쪽이었다). 페이지가 막 뜬 뒤라
  //     입력 큐·렌더가 아직 데워지지 않은 것이고, 그 한 표본이 잡음비를 1.17 로 부풀려
  //     **판정을 유보시킨다**(= 이 하네스가 제 머리 검사를 못 하게 만든다).
  //     ⇒ 워밍업 한 걸음을 버리고 그 다음 둘로 바닥을 잰다. 대조군은 여전히 **같은 조건 두 번**이다.
  await walk(2200);                       // 워밍업 — 재지 않는다
  const dLight = await walk(2200);
  const dLight2 = await walk(2200);
  const noiseR = Math.max(dLight, dLight2) / Math.max(1, Math.min(dLight, dLight2));
  const dLightMed = (dLight + dLight2) / 2;
  console.log(`    잡음 바닥 — 같은 조건 두 번: ${Math.round(dLight)}px vs ${Math.round(dLight2)}px → 잡음비 ${noiseR.toFixed(3)}`);
  ok(dLight > 25 && dLight2 > 25, '★전제 — 가벼울 때 실제로 걷는다(대조군 두 번)', `${Math.round(dLight)} · ${Math.round(dLight2)}px`);
  // ★[T49 후속] 자 자체가 부서졌는지만 본다 — **1.5 가 아니라 3 배**다(`e2e-rtt`·`test-tick-slicer` 와 같은 수).
  //   1.5 로 두면 "잡음이 커서 못 갈랐다"가 여기서 **빨강**으로 새 나간다. 못 가르는 판은
  //   아래 유보 갈래가 이미 맡는다(그리고 크게 찍는다). 여기 빨강은 "이 판은 통째로 쓸모없다"만 뜻해야 한다.
  ok(noiseR < 3, '★전제 — 자가 믿을 만하다(같은 조건 두 번이 3배 안)', `잡음비 ${noiseR.toFixed(3)}`);

  // ── ④ 과적 — 무들이 뜨고 **실제로 느려진다** ──────────────────────────────
  //   ★[족보 (56)] 바닥(×0.4)에 처박지 않는다 — 거기선 더 실어도 안 변해서 "변화"를 못 잰다.
  //   용량의 1.3배쯤을 만든다(곡선이 살아 있는 구간).
  const capKg = cLight.cap;
  const needStone = Math.max(1, Math.ceil((capKg * 1.35 - cLight.kg) / (cat.stone || 4)));
  await give({ stone: needStone });
  const c2 = await carry();
  ok(c2.over, '★★④ 용량을 넘겼다 — **막히지 않고 그냥 실렸다**(하드 컷 없음)', `${c2.kg}kg / ${c2.cap}kg (r=${c2.ratio})`);
  ok(!c2.floored, '★전제 — 바닥에 안 붙었다(여기서 값이 움직일 수 있다)', `×${c2.moveMult}`);
  ok(c2.moveMult < 1, '★④ 서버가 이속 배율을 낮췄다', `×${c2.moveMult}`);
  const md = await page.evaluate(() => [...document.querySelectorAll('#moodles .moodle')].map((el) => el.dataset.axis + ':' + el.dataset.stage));
  ok(md.some((m) => m.startsWith('carry')), '★★④ 무들 **"무거움"**이 화면에 떴다', md.join(' ') || '없음');
  const hudOver = await page.evaluate(() => (document.getElementById('carryHud') || {}).className || '');
  ok(/over/.test(hudOver), '★④ HUD 가 초과를 표시한다(붉어짐)', hudOver);
  await snap('wt-02-overloaded');

  // ★★[T49 2026-09-02] 자기 실패 검사기 — `WEIGHT_SABOTAGE=1` 이면 **무거운 다리를 몰래 가볍게** 한다.
  //   판정을 서버 배율에서 유도하도록 바꿨으니, 그 판정이 "무엇을 넣어도 통과"하지 않는다는 걸
  //   밖에서 한 번 돌려 빨간 걸 보일 수 있어야 한다. 기본 부팅엔 이 분기가 없다.
  if (process.env.WEIGHT_SABOTAGE === '1') {
    // ★가진 만큼 정확히 버린다 — 9999 를 주면 서버가 안 받는다(첫 판이 그래서 안 먹혔다).
    const held = await page.evaluate(() => (window.__getInv() || {}).stone || 0);
    console.log(`    ★사보타주 — 걷기 직전에 돌 ${held}개를 버린다(효과비가 1 로 떨어져야 한다)`);
    await page.evaluate((n) => window.__sendPrimary({ type: 'drop_item', item: 'stone', amount: n }), held);
    await sleep(2000);
    const after = await carry();
    console.log(`    ★사보타주 뒤 적재: ${after ? `${after.kg}kg / ${after.cap}kg ×${after.moveMult}` : '미상'}`);
  }
  const dHeavy = await walk(2200);
  const drop = 1 - dHeavy / Math.max(1, dLightMed);
  const effectR = dLightMed / Math.max(1, dHeavy);
  // ★★문턱을 **눈대중으로 적지 않는다 — 서버가 약속한 수에서 유도한다**(족보 74).
  //   서버 배율 ×m 이면 같은 시간에 가는 거리의 비는 1/m 이어야 한다. 그게 기대 효과비다.
  //   판정: 실측 효과비가 **잡음 바닥 위로, 기대치의 절반 이상** 올라왔는가.
  //   ⇒ 문턱이 그날의 CPU 가 아니라 **그 판의 서버 값**에서 나온다.
  const expected = 1 / Math.max(0.01, c2.moveMult);
  const need = noiseR + (expected - 1) * 0.5;
  // ★잴 수 있는 판인가 — 기대 효과가 잡음에 묻히면 **"안 느려졌다"가 아니라 "못 쟀다"** 다.
  //   2026-09-01 전수에서 38→37px(−2.6%)로 떨어진 게 그 자리였다(서버는 −17% 를 약속했었다).
  const resolvable = (expected - 1) > (noiseR - 1) * 2 + 0.05;
  console.log(`    걸음 실측: 가벼움(중앙) ${Math.round(dLightMed)}px vs 과적 ${Math.round(dHeavy)}px  (서버 배율 ×${c2.moveMult})`);
  console.log(`    [참고 — 판정 아님] 절대 문턱 0.95 · ${dHeavy < dLightMed * 0.95 ? '넘음' : '★못 넘음'}`
    + ` · 감소 −${Math.round(drop * 100)}% · 기대 효과비 ${expected.toFixed(3)} · 필요 ${need.toFixed(3)}`);
  // ★★[T49 후속 2026-09-02] **"가를 수 있는가"는 판정이 아니라 사정이다 — ok() 로 걸지 않는다.**
  //   내가 여기서 한 번 틀렸다: 처음엔 `ok(resolvable, …)` 으로 걸어 뒀는데,
  //   그러면 **기계가 바쁜 날 이 하네스가 빨개진다**(전수 회차 1: 기대 0.211 vs 잡음 0.167 → ✗).
  //   그건 제품이 나빠진 게 아니라 **내 자가 그날 눈이 어두웠던 것**이다. 러너의 빨강은
  //   "제품이 회귀했다"를 뜻해야 하고, 그렇지 않은 빨강은 사람에게 빨강을 무시하도록 가르친다.
  //   ⇒ `e2e-rtt`·`test-tick-slicer` 와 **같은 모양**으로 맞춘다: 못 가르면 판정을 유보하고
  //     그 사정을 크게 찍은 뒤, 잡음이 삼킬 수 없는 **약한 주장 하나만** 잰다.
  console.log(`    [자의 사정] 이 판에서 효과를 가를 수 있는가: ${resolvable ? '가른다' : '★못 가른다'}`
    + ` (기대 ${(expected - 1).toFixed(3)} vs 잡음 ${(noiseR - 1).toFixed(3)})`);
  if (resolvable) {
    ok(effectR > need,
      '★★④ **실제로 느려졌다** — 잡음 위로, 서버가 약속한 효과의 절반 이상',
      `효과비 ${effectR.toFixed(3)} > 필요 ${need.toFixed(3)} (잡음 ${noiseR.toFixed(3)} + 기대 ${(expected - 1).toFixed(3)}/2)`);
  } else {
    console.log(`    ★이 판은 잡음이 커서(잡음 ${(noiseR - 1).toFixed(3)} ≥ 기대 ${(expected - 1).toFixed(3)}/2) ④ 를 가를 수 없다`
      + ' — 판정하지 않는다("안 느려졌다"가 아니라 "못 쟀다").');
    // ★잡음이 삼킬 수 없는 주장만 남긴다: **잡음 바닥 밖으로 빨라지지는 않았다.**
    //   (`effectR > 1` 로 쓰면 잡음만으로도 떨어질 수 있어 같은 병이 된다 — 문턱에 잡음을 실어 준다.)
    ok(effectR > 1 / noiseR, '④ [잡음 큼] 최소한 **잡음 밖으로 빨라지지는 않았다**(이것만 잰다)',
      `효과비 ${effectR.toFixed(3)} > ${(1 / noiseR).toFixed(3)}(=1/잡음비)`);
  }
  // ★예측과 권위가 같은 배율을 쓰는가 — 어긋나면 러버밴딩이다(거리로 확인)
  //   ★허용 오차도 잡음을 얹는다: 같은 조건 두 번이 흔들리는 만큼은 이 비교에도 실린다.
  const tol = 0.18 + (noiseR - 1);
  ok(Math.abs(drop - (1 - c2.moveMult)) < tol, '★★④ 줄어든 비율이 **서버 배율과 맞는다**(클라 예측이 같은 수를 쓴다)',
    `실측 −${Math.round(drop * 100)}% vs 배율 −${Math.round((1 - c2.moveMult) * 100)}% (허용 ${(tol * 100).toFixed(0)}%p = 0.18 + 잡음 ${((noiseR - 1) * 100).toFixed(1)}%p)`);

  // ── ⑤ 상태 패널이 **"짐 때문이다"**라고 말한다(§8.6) ──────────────────────
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="body"]').click());
  await sleep(700);
  const txt = await page.evaluate(() => window.__panelText());
  ok(/짐/.test(txt) && /kg/.test(txt), '★★⑤ 상태 패널에 **총 무게 → 이동 배율**이 있다(§8.6 확정 항목)',
    (txt.match(/[^\n]*🎒[^\n]{0,60}/) || [''])[0].trim() || txt.slice(0, 60));
  ok(/초과/.test(txt), '★⑤ 초과율을 말해 준다');
  await snap('wt-03-panel');
  await page.keyboard.press('Escape'); await sleep(300);

  // ── ⑥ 인벤 창에 개당 kg ───────────────────────────────────────────────────
  const invIcon = await page.evaluate(() => !!document.querySelector('#sidebar .sb-icon[data-side="inv"]'));
  if (invIcon) {
    await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="inv"]').click());
    await sleep(700);
    const itxt = await page.evaluate(() => window.__panelText());
    ok(/kg/.test(itxt), '★⑥ 인벤 목록에 kg 이 보인다(§8.1 첫 실장)', (itxt.match(/[^\n]{0,30}kg/) || [''])[0].trim());
    await page.keyboard.press('Escape'); await sleep(300);
  } else {
    ok(true, '★⑥ 인벤 탭이 좌측 기둥에 없다 — 이 절은 건너뛴다(패널 프레임 밖)', '해당 없음');
  }

  // ── ⑦ T/Y 가 죽었다 — 눌러도 아무 일도 안 난다 ────────────────────────────
  {
    const inv0 = await page.evaluate(() => window.__getInv());
    await page.keyboard.press('KeyT'); await sleep(400);
    await page.keyboard.press('KeyY'); await sleep(600);
    const inv1 = await page.evaluate(() => window.__getInv());
    ok(JSON.stringify(inv0) === JSON.stringify(inv1), '★★⑦ **T/Y 를 눌러도 인벤이 안 움직인다**(물물교환 제거됨)');
    const jsErr = errs.filter((e) => /trade_offer/.test(e));
    ok(jsErr.length === 0, '★⑦ 그리고 예외도 안 난다');
  }

  // ── ⑧ 거래소 — 넘침 딱지 · 용량 초과 경고 ─────────────────────────────────
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  const rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando');
  ok(rows.length > 0, '★전제 — 마을이 시딩됐다', rows.map((r) => r.name).join(' '));
  if (rows.length) {
    const V = rows[0], ax = V.cx * 32 + 16, ay = V.cy * 32 + 16;
    let tpOk = false;
    for (let i = 0; i < 25 && !tpOk; i++) {
      await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [ax, ay]);
      await sleep(1200);
      const d = await page.evaluate(() => window.__evDbg || null);
      if (d && d.seen > 0 && d.minD <= d.gate) tpOk = true;
    }
    for (let i = 0; i < 40; i++) { if ((await page.evaluate(() => window.__evNearVid)) != null) break; await sleep(800); }
    ok((await page.evaluate(() => window.__evNearVid)) != null, '★전제 — 마을 반경 안에 들어왔다');
    await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="trade"]').click());
    await sleep(1200);
    let board = null;
    for (let i = 0; i < 20 && !board; i++) { board = await page.evaluate(() => window.__tradeBoard || null); if (!board) await sleep(400); }
    ok(!!board, '★전제 — 거래소 시세표가 온다', board ? `${board.rows.length}품목` : '안 옴');
    if (board) {
      const gl = board.rows.filter((r) => r.glut);
      console.log(`    넘침 판정: ${gl.length}/${board.rows.length}품목 — ${gl.map((r) => r.ko).join(' ') || '없음'}`);
      ok(board.rows.every((r) => typeof r.glut === 'boolean'), '★★⑧ 모든 줄에 **넘침 판정이 실려 온다**(서버가 정본 가격 함수에 물어본 결과)');
      // ★자명 통과 금지 — 전부 넘침이거나 전부 아니면 판정이 죽어 있는 것이다
      ok(gl.length > 0 && gl.length < board.rows.length,
        '★★⑧ 자명 통과 금지 — **넘침인 것과 아닌 것이 둘 다 있다**', `${gl.length} / ${board.rows.length}`);
      const shown = await page.evaluate(() => window.__panelText());
      if (gl.length) ok(/넘침/.test(shown), '★★⑧ **"넘침" 딱지가 화면에 그려져 있다**',
        (shown.match(/[^\n]{0,20}넘침/) || [''])[0].trim());
      else ok(true, '★⑧ (이 마을엔 넘침 품목이 없어 딱지 표시는 건너뛴다)');
      await snap('wt-04-trade-glut');
    }
  }

  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close(); shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
