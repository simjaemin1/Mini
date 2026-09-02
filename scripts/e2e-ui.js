#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-ui.js — UI 골격(§8.2) + 상태 패널(§8.6) + 무들(§8.3) 실클라 E2E ==
//
// ★왜 [재민 확정 2026-08-26]
//   `test-body` 45/0 은 "몸의 역학이 맞는가"를 잰다. 이 레포가 배치 5 에서 배운 것은
//   **계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다.
//   §8.6 이 말한 이 창의 존재 이유는 **"왜 내가 지금 이렇지"에 답하는 것**이라,
//   답이 화면에 안 뜨면 그 창은 없는 것과 같다. 그래서 진짜 Chromium 을 띄우고 사람처럼 누른다.
//
// ★★시간 모드: **상호작용이 주제**라 시간 손잡이를 쓴다 —
//   몸 감쇠를 기다리지 않고 `__e2e_body` 픽스처로 상태를 **직접 세운다**(서버 권위는 그대로).
//   감쇠 속도 자체는 `test-body`·`scripts/body-metrics.js` 가 정본으로 잰다.
//
// 실행: node scripts/e2e-ui.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-ui-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-ui-central-${process.pid}.db`, ZDB = `/tmp/e2e-ui-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 600) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== UI 골격 · 상태 패널 · 무들 실클라 E2E (Chromium) ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',   // ★몸 상태 픽스처(`__e2e_body`)가 이 게이트로만 산다
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

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1800);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // ── ① 좌측 기둥 — 버튼이 전부 **무언가를 연다**(빈 버튼 금지 §8.2) ──────────
  const icons = await page.evaluate(() => [...document.querySelectorAll('#sidebar .sb-icon')]
    .map((el) => ({ side: el.dataset.side, hint: (el.querySelector('.sb-hint') || {}).textContent || '' })));
  ok(icons.length >= 6, '★① 좌측 세로 버튼 기둥이 있다', `${icons.length}개: ${icons.map((i) => i.side).join(',')}`);
  ok(icons.some((i) => i.side === 'body'), '★① **상태 탭**이 기둥에 있다');
  ok(icons.every((i) => /\(/.test(i.hint)), '★★① 모든 버튼에 **단축키가 병기**돼 있다(§8.2)',
    icons.map((i) => i.hint.trim()).join(' | '));
  const empties = [];
  for (const ic of icons) {
    await page.evaluate((s2) => document.querySelector(`#sidebar .sb-icon[data-side="${s2}"]`).click(), ic.side);
    await sleep(450);
    const t = await page.evaluate(() => (window.__panelText ? window.__panelText() : '').trim());
    if (t.length < 8) empties.push(ic.side);
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  ok(empties.length === 0, '★★① **빈 버튼이 없다** — 모든 탭이 실제 내용을 그린다(§8.2)',
    empties.length ? `빈 탭: ${empties.join(',')}` : `${icons.length}개 전부 내용 있음`);

  // ── ② 한 번에 한 패널 · 재클릭/ESC 닫힘 ───────────────────────────────────
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="body"]').click());
  await sleep(400);
  ok((await page.evaluate(() => window.__panelOpen())) === 'body', '★② 버튼을 누르면 그 패널이 열린다');
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="craft"]').click());
  await sleep(400);
  const openNow = await page.evaluate(() => window.__panelOpen());
  const openCount = await page.evaluate(() => document.querySelectorAll('#sidePanel.open, .sp-open').length);
  ok(openNow === 'craft', '★★② 다른 탭을 누르면 **갈아탄다**(패널 수프 금지 §8.2)', openNow);
  ok(openCount <= 1, '★② 동시에 열린 패널은 하나뿐이다', `${openCount}`);
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="craft"]').click());
  await sleep(350);
  ok((await page.evaluate(() => window.__panelOpen())) === null, '★② **재클릭이면 닫힌다**');
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="body"]').click());
  await sleep(350);
  await page.keyboard.press('Escape');
  await sleep(350);
  ok((await page.evaluate(() => window.__panelOpen())) === null, '★★② **ESC 로 닫힌다**');

  // ── ③ 논모달 — 패널을 연 채로 움직일 수 있다 ──────────────────────────────
  await page.evaluate(() => document.querySelector('#sidebar .sb-icon[data-side="body"]').click());
  await sleep(400);
  ok((await page.evaluate(() => window.__panelOpen())) === 'body', '★전제 — 패널을 열어 뒀다');
  const pos0 = await page.evaluate(() => window.__getMyAbs());
  await page.keyboard.down('KeyD');
  await sleep(1400);
  await page.keyboard.up('KeyD');
  await sleep(500);
  const pos1 = await page.evaluate(() => window.__getMyAbs());
  const moved = Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y);
  ok((await page.evaluate(() => window.__panelOpen())) === 'body', '★③ 움직여도 패널이 안 닫힌다');
  ok(moved > 20, '★★③ **패널을 연 채 이동할 수 있다**(논모달 §8.2)', `${Math.round(moved)}px 이동`);
  await snap('ui-01-panel-open');

  // ── ④ 상태 패널 — "왜 내가 지금 이렇지"에 답하는가(§8.6) ──────────────────
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 18, thirst: 22, fatigue: 0.75, injury: 0.4, cold: 0.5 }));
  await sleep(900);
  const txt = await page.evaluate(() => window.__panelText());
  ok(/배고픔/.test(txt) && /피로/.test(txt) && /부상/.test(txt), '★④ 욕구·몸 항목이 다 보인다');
  ok(/이속/.test(txt) && /%/.test(txt), '★★④ **걸린 효과를 수치로** 말한다');
  ok(/\(피로\s*0\.\d+\)|\(부상\s*0\.\d+\)|\(배고픔\s*0\.\d+\)/.test(txt),
    '★★④ 그 효과를 **원인과 함께** 말한다 — "이속 −8% (피로 0.62)"(§8.6 의 존재 이유)',
    (txt.match(/[^\n]*\((?:피로|부상|배고픔|목마름|추위)\s*0\.\d+\)/) || ['X'])[0].trim().slice(0, 60));
  ok(/×0\.\d+/.test(txt), '★④ 합계 배율도 보여 준다');
  // ★제목이 **영문 키**로 뜨면 그 탭은 반쪽이다(실제로 `body` 라 떠 있었다 — 화면을 눈으로 보고 잡았다).
  const title = await page.evaluate(() => (document.getElementById('spTitle') || {}).textContent || '');
  ok(/상태/.test(title), '★★④ 패널 제목이 **한글**이다(프레임 등록 3단계를 다 밟았다)', JSON.stringify(title));
  await snap('ui-02-status');

  // ── ⑤ 바닥이 걸리면 그 사실을 말한다(투명성) ──────────────────────────────
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 0, thirst: 0, fatigue: 1, injury: 1, cold: 1 }));
  await sleep(900);
  const txt2 = await page.evaluate(() => window.__panelText());
  ok(/바닥/.test(txt2), '★★⑤ 최악일 때 **"바닥이 걸렸다"**를 알려 준다(죽음의 나선 방지의 투명성)');
  const vg = await page.evaluate(() => window.__vignetteOn());
  ok(vg === true, '★⑤ 심각 단계에서 화면 가장자리 비네트 1종(§8.3 아날로그 채널 — 최소만)');
  await snap('ui-03-worst');

  // ── ⑥ 무들 — 단계로만 말하고, 경계에서 깜빡이지 않는다 ────────────────────
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 100, fatigue: 0, injury: 0, cold: 0 }));
  await sleep(800);
  // ★★[2026-08-27 무게 배치] 이 절의 주제는 **몸**이다. 무게 배치가 같은 무들 프레임에 `carry`(🎒 무거움)를
  //   얹으면서, 시작 지급(33.6kg > 용량 25kg)만으로 짐 무들이 떠 이 전제가 깨졌다 — **제품은 옳다**.
  //   ⇒ 판정을 **몸 축으로 좁힌다**(짐 무들은 `e2e-weight ④` 가 따로 잰다). 검사의 뜻은 그대로다.
  const bodyMoodles = () => page.evaluate(() => window.__moodles().filter((m) => m.axis !== 'carry'));
  ok((await bodyMoodles()).length === 0, '★전제 — 성한 몸엔 (몸) 무들이 없다');
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', fatigue: 0.9 }));
  await sleep(800);
  const md = await bodyMoodles();
  ok(md.some((m) => m.axis === 'fatigue' && m.stage >= 2), '★★⑥ 나빠지면 무들이 **단계와 함께** 뜬다',
    JSON.stringify(md));
  ok(md.length <= 3, '★⑥ 동시 표시 상한(3)을 지킨다', `${md.length}개`);
  // ★★경계 진동 — 히스테리시스가 없으면 여기서 깜빡인다.
  //   ⚠**먼저 가라앉힌다.** 1차 실행에서 전환 1회가 나왔는데, 그건 깜빡임이 아니라
  //   앞 절이 세워 둔 0.9(2단계)에서 경계값(0.70)으로 **정상적으로 내려온** 한 번이었다.
  //   출발 상태를 안 정해 놓고 세면 계측기가 자기 준비과정을 결함으로 읽는다(산 아크 교훈 ②).
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', fatigue: 0.70, quiet: true }));
  await sleep(900);
  const settled = (await bodyMoodles()).find((m) => m.axis === 'fatigue');
  console.log(`    진동 전 가라앉힌 단계: ${settled ? settled.stage : 0}`);
  let flips = 0, prevStage = null;
  for (let i = 0; i < 14; i++) {
    const v = 0.70 + ((i % 2) ? 0.008 : -0.008);   // 피로 1단계 경계(0.700) 둘레를 오간다
    await page.evaluate((vv) => window.__sendPrimary({ type: '__e2e_body', fatigue: vv, quiet: true }), v);
    await sleep(260);
    const cur = (await bodyMoodles()).find((m) => m.axis === 'fatigue');
    const st = cur ? cur.stage : 0;
    if (prevStage !== null && st !== prevStage) flips++;
    prevStage = st;
  }
  ok(flips === 0, `★★⑥ 경계를 14회 오가도 무들이 **안 깜빡인다** (전환 ${flips}회 · 히스테리시스)`);
  // ★자명 통과 금지 — 확실히 넘기면 단계는 실제로 바뀌어야 한다(무들이 죽어 있으면 위도 0 이다)
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', fatigue: 0.0, quiet: true }));
  await sleep(500);
  const off = (await bodyMoodles()).find((m) => m.axis === 'fatigue');
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', fatigue: 0.95, quiet: true }));
  await sleep(500);
  const on = (await bodyMoodles()).find((m) => m.axis === 'fatigue');
  ok(!off && on && on.stage >= 2, '★★자명 통과 금지 — 확실히 넘기면 무들이 **실제로 켜지고 꺼진다**',
    `off=${off ? off.stage : '없음'} on=${on ? on.stage : '없음'}`);
  await snap('ui-04-moodles');

  // ── ⑦ ★[T55] Shift 가림 — 키 체인 머리에서 한 번 가른다 ────────────────────
  //   ★왜 실클라인가: 이건 **분기 순서**의 결함이라 소스로는 "있다/없다"만 보이고
  //     "그래서 무엇이 날아갔나"는 안 보인다. 그래서 **실제로 나간 메시지를 센다** —
  //     기존 소켓의 `send` 를 감싼다(새 능력 0 · 읽기만).
  console.log('\n⑦ ★[T55] Shift 가림 — 맨손 단축키로 안 흘러야 한다');
  {
    await page.evaluate(() => {
      window.__t55sent = [];
      const c = conns.get(primaryZoneId);
      const orig = c.ws.send.bind(c.ws);
      c.ws.send = (d) => { try { window.__t55sent.push(JSON.parse(d)); } catch (e) {} return orig(d); };
      window.__t55clear = () => { window.__t55sent.length = 0; };
    });
    const sentAfter = async (key) => {
      await page.evaluate(() => window.__t55clear());
      await page.keyboard.press(key);
      await sleep(320);
      return page.evaluate(() => window.__t55sent.filter((m) => m && m.type && m.type !== 'input').map((m) => m.type + (m.buildType ? ':' + m.buildType : '') + (m.kind ? ':' + m.kind : '')));
    };
    // ★자명 통과 금지 먼저 — **맨손 키는 여전히 실제로 보낸다**(안 보내면 아래가 전부 자명하다)
    const bareL = await sentAfter('l');
    ok(bareL.includes('build:fence'), '★★⑦ (자명 통과 금지) 맨손 `L` 은 여전히 울타리를 짓는다', bareL.join(' ') || '(없음)');
    const shiftL = await sentAfter('Shift+l');
    ok(!shiftL.some((t) => t.startsWith('build')), '★★⑦ **`Shift+L` 이 울타리를 안 짓는다**(회부 0-소문 2 — 이 카드의 목표)', shiftL.join(' ') || '(아무것도 안 보냈다)');
    const bareJ = await sentAfter('j');
    ok(bareJ.includes('build:campfire'), '★⑦ (자명 통과 금지) 맨손 `J` 는 여전히 모닥불', bareJ.join(' ') || '(없음)');
    const shiftJ = await sentAfter('Shift+j');
    ok(!shiftJ.some((t) => t.startsWith('build')), '★⑦ `Shift+J`(연대기)가 모닥불을 안 짓는다 — T18 이 한 줄로 막던 것을 구조가 막는다', shiftJ.join(' ') || '(없음)');
    const shiftH = await sentAfter('Shift+h');
    ok(!shiftH.some((t) => t.startsWith('build')), '★⑦ `Shift+H`(상태 패널)가 상자를 안 짓는다', shiftH.join(' ') || '(없음)');
    const shiftB = await sentAfter('Shift+b');
    ok(!shiftB.some((t) => t.startsWith('build')), '★⑦ `Shift+B`(건축 패널)가 다른 걸 안 보낸다', shiftB.join(' ') || '(없음)');
    const shiftP = await sentAfter('Shift+p');
    ok(!shiftP.some((t) => t.startsWith('build')), '★⑦ `Shift+P` 가 밭을 안 간다', shiftP.join(' ') || '(없음)');
    const shiftG = await sentAfter('Shift+g');
    ok(!shiftG.includes('ranged_attack'), '★★⑦ **`Shift+G` 가 화살을 안 쏜다** — 종전엔 맨손 `g` 가 먼저 서서 게시판 분기에 영영 못 닿았다', shiftG.join(' ') || '(없음)');

    // ★기존 Shift 단축키가 **전부 그대로**인가(전수) — 이걸 안 재면 "가리기"가 곧 "없애기"다
    const KEEP = [
      ['Shift+c', 'claim:guild', '길드 영토'],
      ['Shift+f', 'fish_cast', '낚시 던지기'],
      ['Shift+r', 'repair_building', '수리'],
    ];
    for (const [key, want, ko] of KEEP) {
      const got = await sentAfter(key);
      ok(got.includes(want), `★⑦ \`${key.replace('Shift+', 'Shift+').toUpperCase()}\`(${ko})는 그대로 간다`, got.join(' ') || '(없음)');
    }
    // 마을 밖이라 Shift+N·Shift+G 는 메시지 대신 "너무 멀다" 를 띄운다 — 그것도 도달의 증거다
    await page.evaluate(() => { window.__t55clear(); window.__notices && (window.__notices.length = 0); });
    await page.keyboard.press('Shift+n');
    await sleep(350);
    const nOut = await page.evaluate(() => ({
      sent: window.__t55sent.map((m) => m.type),
      notice: (window.__notices || []).slice(-3).join(' | '),
    }));
    ok(nOut.sent.includes('village_deliver') || /너무 멀다/.test(nOut.notice),
       '★⑦ `Shift+N`(납품)이 그대로 도달한다(마을 밖이면 "너무 멀다")', nOut.sent.join(' ') + ' | ' + nOut.notice);

    // ★패널 Shift 단축키 — 맨손 리스너로 안 흘리면서도 **패널은 열려야** 한다
    await page.keyboard.press('Escape'); await sleep(200);
    await page.keyboard.press('Shift+h'); await sleep(400);
    ok((await page.evaluate(() => window.__panelOpen())) === 'body', '★⑦ `Shift+H` 로 상태 패널이 열린다(가리기가 단축키를 죽이지 않았다)');
    await page.keyboard.press('Escape'); await sleep(250);
    await page.keyboard.press('Shift+j'); await sleep(400);
    ok((await page.evaluate(() => window.__panelOpen())) === 'chronicle', '★⑦ `Shift+J` 로 연대기가 열린다');
    await page.keyboard.press('Escape'); await sleep(250);
    await page.keyboard.press('i'); await sleep(400);
    ok((await page.evaluate(() => !!invOpen)), '★⑦ 맨손 `I` 로 인벤이 열린다(맨손 체인은 멀쩡하다)');
    await page.keyboard.press('Escape'); await sleep(250);
  }

  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close(); shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
