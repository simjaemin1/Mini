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
  // ★[T113 §0-ⓒ] 알림이 실제로 얼마나 몰리는지 **재려고** 하네스가 폴링한다(제품 훅 0 · T57).
  const ntSamples = [];
  const ntPoll = setInterval(async () => {
    try { const n = await page.evaluate(() => (window.__notices || []).length); ntSamples.push({ t: Date.now(), len: n }); } catch (e) {}
  }, 250);

  // ★★[T66 2차 ⑬] **캔버스에 토큰 문자열이 닿으면 잡는다.**
  //   `ctx.fillStyle = 'var(--accent)'` 는 예외도 콘솔 오류도 없이 **조용히 무시**되고 앞 색이 남는다
  //   — 1차 판이 세계 렌더 색을 통째로 토큰으로 갈아 끼우고도 하네스가 전부 초록이었던 이유가 이것이다.
  //   ⇒ 문서가 열리기 **전에** 세터를 가로채, 실제로 들어간 값을 모은다(소스 어림짐작이 아니라 실측).
  await page.addInitScript(() => {
    window.__badCanvasColor = [];
    const P = CanvasRenderingContext2D.prototype;
    for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor']) {
      const d = Object.getOwnPropertyDescriptor(P, prop);
      if (!d || !d.set) continue;
      Object.defineProperty(P, prop, {
        configurable: true, enumerable: d.enumerable, get: d.get,
        set(v) { if (typeof v === 'string' && v.indexOf('var(') >= 0 && window.__badCanvasColor.length < 20) window.__badCanvasColor.push(prop + '=' + v); d.set.call(this, v); },
      });
    }
    const gp = CanvasGradient.prototype, ac = gp.addColorStop;
    gp.addColorStop = function (o, c) { if (typeof c === 'string' && c.indexOf('var(') >= 0 && window.__badCanvasColor.length < 20) window.__badCanvasColor.push('addColorStop=' + c); return ac.call(this, o, c); };
  });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  const enterBtn = await page.$('#enter');
  ok(!!enterBtn, '로비에 입장 버튼(`#enter` · 「나루터로 간다」 — T84 개명)');

  // ── ⓪ ★[T61 · 재민 실기] 로그인 칸에 글자를 치면 게임 키가 눌리는가 ──────────────
  //   ★여기서 재는 이유: 이 결함은 **로비에서만** 보인다. 월드에 들어간 뒤엔 그 칸이 화면에 없다.
  //   ⇒ 입장 **전에** 잰다(하네스가 결함이 사는 자리로 간다).
  console.log('\n⓪ ★[T61] 로그인 칸 — 글자가 들어가고, 게임 키는 안 눌린다');
  {
    await page.click('#name');
    await page.keyboard.type('im e');          // i · m · 스페이스 — 셋 다 게임 단축키다
    const typed = await page.evaluate(() => (document.getElementById('name') || {}).value || '');
    ok(typed === 'im e', '★★⓪ **친 글자가 그대로 들어간다**(스페이스 포함 — 종전엔 preventDefault 에 먹혔다)', JSON.stringify(typed));
    const opened = await page.evaluate(() => ({
      side: (window.__panelOpen ? window.__panelOpen() : null),
      inv: !!invOpen,
      keys: [...keys],
    }));
    ok(opened.side === null && !opened.inv, '★★⓪ `i`·`m` 을 쳐도 **패널·인벤이 안 열린다**', JSON.stringify(opened));
    ok(opened.keys.length === 0, '★⓪ `keys` 에 잔류가 없다(입력칸에 있는 동안 아무것도 안 더한다)', JSON.stringify(opened.keys));
    // ★탭은 **다음 칸으로 넘어간다**(종전엔 preventDefault 가 삼켰다)
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => (document.activeElement || {}).id || '');
    ok(focused !== 'name', '★⓪ 탭이 삼켜지지 않는다 — 포커스가 다음으로 넘어간다', `focus=${focused}`);
    // ★★돌연변이 — 술어를 무력화하면 **실제로 다시 눌린다**(가림이 그 술어의 일임을 증명한다)
    await page.evaluate(() => { window.__origITT = window.isTypingTarget; window.isTypingTarget = () => false; });
    await page.click('#name');
    await page.keyboard.press('i');
    const brokeInv = await page.evaluate(() => !!invOpen);
    await page.evaluate(() => { window.isTypingTarget = window.__origITT; });
    if (brokeInv) await page.evaluate(() => { if (invOpen) toggleInv(); });
    ok(brokeInv === true, '★★⓪ 돌연변이 — 술어를 끄면 `i` 가 **다시 인벤을 연다**(이 검사가 실패할 줄 안다)');
    // 친 글자를 지운다(로그인에 영향 없게)
    await page.evaluate(() => { const el = document.getElementById('name'); if (el) el.value = ''; el.blur(); });
    await snap('ui-00-login-typing');
  }

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

  // ── ⓪-b ★[T61] 채팅칸도 **같은 술어**로 막힌다(규약이 둘이 아니다) ────────────────
  console.log('\n⓪-b ★[T61] 채팅칸 — 같은 술어 하나로 막힌다');
  {
    await page.keyboard.press('Enter');          // 채팅 열기
    await sleep(350);
    ok(await page.evaluate(() => !!chatActive), '⓪-b (상황) 채팅이 열렸다');
    await page.keyboard.type('im');
    const chatV = await page.evaluate(() => (document.getElementById('chatInput') || {}).value || '');
    ok(chatV === 'im', '★⓪-b 채팅칸에도 글자가 그대로 들어간다', JSON.stringify(chatV));
    ok((await page.evaluate(() => window.__panelOpen())) === null && !(await page.evaluate(() => !!invOpen)),
       '★★⓪-b 그리고 패널은 안 열린다 — **종전 규약(`chatActive`)이 술어 안에 흡수됐다**');
    await page.evaluate(() => { const el = document.getElementById('chatInput'); if (el) el.value = ''; });
    await page.keyboard.press('Escape');
    await sleep(350);
    ok(!(await page.evaluate(() => !!chatActive)), '⓪-b 채팅을 닫았다(뒤 절에 영향 없게)');
  }

  // ── ⑧ ★[T61] 죽은 분기 셋이 소스에서 사라졌나 (키 체인은 이 하네스가 지킨다) ──────
  //   ★소스로 재는 이유: 세 분기는 **닿은 적이 없다**. 실행으로는 있으나 없으나 같은 화면이라
  //     "지웠다"를 실행으로 증명할 수 없다. 대신 **동사가 다른 길로 살아 있는지**는 아래에서 실행으로 잰다.
  console.log('\n⑧ ★[T61] 죽은 분기 셋 — 소스에서 사라졌고, 동사는 다른 길로 산다');
  {
    const mainSrc = fs.readFileSync(path.join(ROOT, 'public/client/99-main.js'), 'utf8');
    const chain = mainSrc.slice(mainSrc.indexOf("window.addEventListener('keydown'"), mainSrc.indexOf("window.addEventListener('keyup'"));
    ok(!/k === 'o'\)\s*sendPrimary\(\{ type: 'harvest'/.test(chain), "★⑧ 키 체인에 `'o' → harvest` 분기가 없다");
    ok(!/k === 'g'\)\s*sendPrimary\(\{ type: 'feed'/.test(chain), "★⑧ 키 체인에 `'g' → feed` 분기가 없다");
    ok(!/k === '1'\)\s*sendPrimary\(\{ type: 'equip', tool: 'axe'/.test(chain), "★⑧ 키 체인에 `'1' → equip axe` 분기가 없다");
    // ★자명 통과 금지 — 안 지운 것은 그대로 있다(정규식이 늘 참이 아니다)
    ok(/k === '2'\) sendPrimary\(\{ type: 'equip', tool: 'pickaxe'/.test(chain),
       '★⑧ 자명 통과 금지 — 가리지 않는 `2`(곡괭이) 분기는 **그대로** 있다');
    // ★동사는 산다 — 좌측 행동 버튼이 실제로 그 메시지를 보낸다(실행으로 잰다)
    const sentAfterClick = async (act) => {
      await page.evaluate(() => window.__t55clear && window.__t55clear());
      await page.evaluate((a) => document.querySelector(`[data-action="${a}"]`).click(), act);
      await sleep(320);
      return page.evaluate(() => (window.__t55sent || []).map((m) => m.type));
    };
    ok((await sentAfterClick('harvest')).includes('harvest'), '★★⑧ 수확 버튼이 그대로 `harvest` 를 보낸다(동사가 산다)');
    ok((await sentAfterClick('feed')).includes('feed'), '★★⑧ 먹이 버튼이 그대로 `feed` 를 보낸다(동사가 산다)');
    // ★없는 단축키를 광고하지 않는다
    const btnTx = await page.evaluate(() => ['harvest', 'feed'].map((a) => (document.querySelector(`[data-action="${a}"]`) || {}).textContent || ''));
    ok(!btnTx.some((t) => /\(O\)|\(G\)/.test(t)), '★⑧ 그 버튼들이 이제 없는 단축키를 광고하지 않는다', JSON.stringify(btnTx));
  }

  // ── ⑨ ★[T61] 아묾이 화면에 실린다 ────────────────────────────────────────────
  //   ★서버 칸 0 — HP 가 **실제로 오르는가**를 본다(회복 게이트 넷의 결과).
  //   ★"왜 안 아무는가"는 무들이 말한다 — 여기서 같은 말을 두 번 하지 않는다.
  console.log('\n⑨ ★[T61] 아묾 — HP 게이지가 "아물고 있다"고 말하는가');
  {
    const hpTx = () => page.evaluate(() => (document.getElementById('hpText') || {}).textContent || '');
    const hpTitle = () => page.evaluate(() => (document.getElementById('hpText') || {}).title || '');
    const setBody = async (o) => { await page.evaluate((x) => window.__sendPrimary(Object.assign({ type: '__e2e_body', quiet: true }, x)), o); await sleep(900); };

    // ⓐ 전제 — 성한 몸엔 표식이 없다(자명 통과 금지의 바닥)
    await setBody({ hp: 100, hunger: 100, thirst: 100 });
    await sleep(1200);
    ok(!/▲/.test(await hpTx()), '★⑨ⓐ 만피에는 표식이 없다', await hpTx());

    // ⓑ 다치고 배부르면 — 아문다
    await setBody({ hp: 40, hunger: 100, thirst: 100 });
    let healTx = '', tries = 0;
    while (tries++ < 25 && !/▲/.test(healTx)) { await sleep(400); healTx = await hpTx(); }
    ok(/▲/.test(healTx), '★★⑨ⓑ **HP 가 오르는 중이면 게이지가 말한다**(회부 "HP 자연 회복이 화면에 안 실린다" 종결)', healTx);
    ok(/아물고 있다/.test(await hpTitle()), '★⑨ⓑ 그 표식은 말로도 설명된다', await hpTitle());

    // ⓒ ★자명 통과 금지 — 갈증이 바닥이면 회복이 멎고 표식도 꺼진다(늘 켜져 있는 등불이 아니다)
    await setBody({ hp: 40, thirst: 0 });
    await sleep(2600);                       // HEAL_HOLD_MS(1.5s) + 여유
    const dryTx = await hpTx();
    ok(!/▲/.test(dryTx), '★★⑨ⓒ **갈증이 바닥이면 표식이 꺼진다**(회복 배율 0)', dryTx);
    // ★그리고 **이유는 무들이 말한다** — 여기서 중복해서 말하지 않는다(§8.3)
    const dryMoodles = await page.evaluate(() => (window.__moodles ? window.__moodles() : []));
    ok(dryMoodles.length > 0, '★⑨ⓒ 이유는 **무들**이 말하고 있다(HP 칸이 같은 말을 두 번 하지 않는다)', JSON.stringify(dryMoodles).slice(0, 90));

    // ⓓ 물을 마시면 다시 아문다 — 껐다 켜진다
    await setBody({ hp: 40, thirst: 100, hunger: 100 });
    let backTx = '', t2 = 0;
    while (t2++ < 25 && !/▲/.test(backTx)) { await sleep(400); backTx = await hpTx(); }
    ok(/▲/.test(backTx), '★★⑨ⓓ 물을 채우면 **다시** 아문다(실기 1 — 껐다 켜진다)', backTx);
    await snap('ui-05-healing');
    await setBody({ hp: 100, thirst: 100, hunger: 100 });
  }

  // ── ⑩ ★[T61] 후유증 칸 — 계약이 있으면 뜨고, 없으면 안 그린다 ────────────────
  //   ⚠계약(`vitals.aftermath`)은 **T56 이 만든다**(착지 전). 그래서 여기서는
  //     ⓐ 지금(계약 없음)은 **0칸** 이고 ⓑ 계약 모양이 오면 그린다 — 둘 다 잰다.
  //     ⓑ 는 서버 행동을 흉내내는 게 아니라 **그리는 길**을 재는 것이다(페이로드 모양이 계약이다).
  console.log('\n⑩ ★[T61] 후유증 무들 한 칸');
  {
    const amBox = () => page.evaluate(() => [...document.querySelectorAll('#moodles .moodle')]
      .map((el) => ({ axis: el.dataset.axis, stage: +el.dataset.stage, text: (el.textContent || '').trim() })));
    const before = await amBox();
    ok(!before.some((m) => m.axis === 'aftermath'), '★⑩ⓐ 성한 몸엔 **안 그린다**(0칸)',
      JSON.stringify(before.map((m) => m.axis)));
    // ★[T61 리베이스 뒤] T56 이 계약을 실었다 — **선이 실제로 이어졌는지** 페이로드로 확인한다.
    //   (안 쓰러진 사람은 `null` 이 맞다. 칸이 있는 것과 값이 있는 것은 다르다.)
    const wire = await page.evaluate(() => (myBody && ('aftermath' in myBody)) ? { has: true, v: myBody.aftermath } : { has: false });
    ok(wire.has === true, '★★⑩ⓐ 서버 페이로드에 `aftermath` 칸이 **실제로 온다**(T56 계약 착지)', JSON.stringify(wire));
    ok(wire.v === null, '★⑩ⓐ 그리고 성한 몸에선 `null` 이다 — 그래서 안 그린다', JSON.stringify(wire.v));
    // ⓑ 계약 모양을 몸 페이로드에 얹고 다시 그린다
    //   ★★[T66 수리] **얹기·그리기·읽기를 한 `evaluate` 안에서** 한다.
    //     종전엔 얹은 뒤 300ms 잤는데, 그 사이 서버 `vitals` 한 판이 오면 `myBody` **객체 자체가**
    //     새것으로 갈리고(30-n-net `myBody = msg.body`) 곧바로 `renderMoodles()` 가 다시 돌아
    //     얹어 둔 칸이 지워진다. 이건 화면 결함이 아니라 **재는 자리의 경주**다 — T61 에선 운으로 통과했다.
    //     한 판 안에서 재면 경주가 없고, 그리는 길이 끊기면 여전히 빨개진다(자명 통과 아님).
    const amShot = await page.evaluate(() => {
      myBody.aftermath = { days: 2, cap: 0.7 };
      renderMoodles();
      return {
        list: [...document.querySelectorAll('#moodles .moodle')]
          .map((el) => ({ axis: el.dataset.axis, stage: +el.dataset.stage, text: (el.textContent || '').trim() })),
        vg: window.__vignetteOn ? window.__vignetteOn() : null,
      };
    });
    const after = amShot.list;
    const am = after.find((m) => m.axis === 'aftermath');
    ok(!!am, '★★⑩ⓑ 계약이 오면 **후유증 칸이 뜬다**', JSON.stringify(after.map((m) => m.axis)));
    ok(!!am && /후유증 2일/.test(am.text), '★⑩ⓑ 남은 날을 글자로 말한다', am && am.text);
    ok(!!am && /힘 70%/.test(am.text), '★⑩ⓑ 눌린 상한도 글자로 말한다(단계를 클라가 매기지 않는다)', am && am.text);
    ok(!!am && am.stage === 1, '★⑩ⓑ 1단계다 — 위급이 아니라 회복 중이라는 표시다', am && String(am.stage));
    ok(amShot.vg === false, '★⑩ⓑ 그래서 비네트가 안 켜진다(3단계가 아니다)', String(amShot.vg));
    // ⓒ 계약이 끝나면 사라진다 — ★같은 이유로 한 판 안에서 잰다.
    const amGone = await page.evaluate(() => {
      myBody.aftermath = { days: 0, cap: 1 };
      renderMoodles();
      return [...document.querySelectorAll('#moodles .moodle')].map((el) => el.dataset.axis);
    });
    ok(!amGone.includes('aftermath'), '★⑩ⓒ 날이 다 가면 칸이 사라진다', JSON.stringify(amGone));
    await snap('ui-06-aftermath');
  }

  // ── ⑪ ★[T66] 화면 규칙 B — 실화면에서 재는 것들 ─────────────────────────────
  //   ★소스 검사(이모지 0 · 색 리터럴 0 · 렌더 목록)는 `test-itemlabel ⑪·⑫` 가 한다.
  //     여기서는 **화면에 실제로 그렇게 그려졌는가**만 잰다(계약과 실행은 다른 층이다).
  console.log('\n⑪ ★[T66] 먹선 — 판 머리 한 문법 · 선 아이콘 · 아이템 그림 하나');
  {
    // ⓐ 열린 패널의 머리가 **같은 class 문법**인가
    const heads = [];
    for (const side of ['body', 'craft', 'chronicle']) {
      await page.evaluate((s2) => document.querySelector(`#sidebar .sb-icon[data-side="${s2}"]`).click(), side);
      await sleep(400);
      heads.push(await page.evaluate(() => {
        const h = document.querySelector('#sidePanel .sp-head');
        return h ? [...h.classList].sort().join(' ') : null;
      }));
      await page.keyboard.press('Escape'); await sleep(200);
    }
    ok(heads.every((h) => h && /pane-head/.test(h)), '★★⑪ⓐ 모든 패널 머리가 **한 문법**(`pane-head`)이다', JSON.stringify(heads));
    await page.evaluate(() => { if (!invOpen) toggleInv(); }); await sleep(400);
    const invHead = await page.evaluate(() => {
      const h = document.querySelector('#invDropdown .id-head');
      return h ? [...h.classList].sort().join(' ') : null;
    });
    ok(/pane-head/.test(invHead || ''), '★⑪ⓐ 짐 판 머리도 같은 문법이다', invHead);

    // ⓑ 아이템 그림 — 렌더가 있으면 <img>, 없으면 **점선 칸**(이모지 문자 0)
    //   ★★[T66 2차] "렌더 없는 품목"을 **이름으로 박아 두지 않는다.** 처음엔 `oyster` 를 썼는데
    //     T76 이 그날 굴을 구워서, 옳은 화면인데도 이 줄이 빨개질 참이었다(아이콘은 배치마다 는다).
    //   ⇒ 화면의 정본(`ICON_RENDERED`)에서 **아직 안 구운 키를 그때그때 고른다.** 안 썩는다.
    const probe = await page.evaluate(() => {
      const src = (typeof ITEM_LABEL_SRV === 'object' && ITEM_LABEL_SRV) ? Object.keys(ITEM_LABEL_SRV) : [];
      return src.find((k) => !ICON_RENDERED.has(k) && !/^item_/.test(k) && /^[a-z_]+$/.test(k)) || null;
    });
    ok(!!probe, '★⑪ⓑ (상황) 아직 안 구운 품목을 하나 골랐다 — 없으면 아래 점선 칸 판정이 뜻이 없다', String(probe));
    await page.evaluate((pk) => window.__sendPrimary({ type: '__e2e_give', items: { wood: 3, [pk]: 2 } }), probe);
    await sleep(1400);
    await page.evaluate(() => renderInvPanel(document.getElementById('invBody')));
    await sleep(400);
    const pics = await page.evaluate(() => [...document.querySelectorAll('.inv-col tr.ul-row')].map((tr) => ({
      item: tr.dataset.item,
      img: !!tr.querySelector('img.item-pic'),
      none: !!tr.querySelector('.item-pic-none'),
      text: (tr.textContent || '').trim(),
    })));
    const wood = pics.find((p) => p.item === 'wood'), oy = pics.find((p) => p.item === probe);
    ok(!!wood && wood.img, '★★⑪ⓑ 렌더가 있는 품목(`wood`)은 **그림**으로 뜬다', JSON.stringify(wood));
    ok(!!oy && oy.none && !oy.img, `★★⑪ⓑ 렌더가 없는 품목(\`${probe}\`)은 **점선 빈 칸**이다(이모지 아님)`, JSON.stringify(oy));
    const EMO = /\p{Extended_Pictographic}/u;
    ok(!pics.some((p) => EMO.test(p.text)), '★★⑪ⓑ 짐 목록 글자에 **이모지 0**',
       (pics.find((p) => EMO.test(p.text)) || {}).text || '없음');
    await page.keyboard.press('Escape'); await sleep(250);

    // ⓒ 화면에 실제로 그려진 글자에 이모지가 없다(HUD·레일·무들·**상태창**)
    //   ★★[T66 2차] 상태창(`#spBody`)을 더했다 — 1차 판이 여기를 놓쳤고 **실기 화면이 먼저 알려 줬다**:
    //     "지금 걸린 효과" 줄이 서버가 준 `parts[].emo`(😩🥶🩹)를 그대로 찍고 있었다.
    //     검사가 보는 자리가 화면보다 좁으면 초록은 거짓말이 된다. ⇒ 열어 놓고 잰다.
    await page.evaluate(() => { if (window.__panelOpen && window.__panelOpen() !== 'body') openSide('body'); });
    await sleep(500);
    const uiText = await page.evaluate(() => ['#hud', '#sidebar', '#moodles', '#spBody'].map((s2) => (document.querySelector(s2) || {}).textContent || '').join(' '));
    ok(/걸린 효과/.test(uiText), '★⑪ⓒ (상황) 상태창이 실제로 열려 있다 — 안 열렸으면 아래가 자명 통과다');
    ok(!EMO.test(uiText), '★★⑪ⓒ HUD·레일·무들·상태창의 **글자에 이모지 0**', (uiText.match(/\p{Extended_Pictographic}/gu) || []).join(''));
    await page.keyboard.press('Escape'); await sleep(250);
    // ⓓ 선 아이콘이 실제로 그려졌다(레일 10개)
    const nIco = await page.evaluate(() => document.querySelectorAll('#sidebar .sb-icon svg.uic').length);
    ok(nIco >= 10, '★⑪ⓓ 레일에 **선 아이콘**이 그려져 있다', `${nIco}개`);
    const stroked = await page.evaluate(() => {
      const s2 = document.querySelector('#sidebar .sb-icon svg.uic');
      return s2 ? s2.getAttribute('stroke') : null;
    });
    ok(stroked === 'currentColor', '★⑪ⓓ 그 아이콘은 색을 자기가 안 정한다(`currentColor`)', String(stroked));
    // ⓔ 개발용 줄은 기본 숨김 · 값은 계속 갱신된다
    const dev = await page.evaluate(() => {
      const r = document.getElementById('devRow');
      return { hidden: r ? getComputedStyle(r).display === 'none' : null, txt: (document.getElementById('coordBadge') || {}).textContent || '' };
    });
    ok(dev.hidden === true, '★⑪ⓔ 개발용 좌표·속도 줄은 **기본 숨김**이다');
    ok(/월드/.test(dev.txt) && !/\(0,0\)\s*·\s*로컬 \(0,0\)$/.test(dev.txt.trim()),
       '★⑪ⓔ 그런데 **값은 계속 갱신된다**(숨긴 것이지 끈 것이 아니다)', dev.txt);
    ok((await page.evaluate(() => window.__devRow(true))) === true, '★⑪ⓔ 토글로 켤 수 있다');
    await page.evaluate(() => window.__devRow(false));
    await snap('ui-07-designB');
    // ⓕ ★★[T66 2차] 세계 렌더에 **토큰 문자열이 한 번도 안 닿았다**
    //   (여기까지 오는 동안 지형·건물·사람·전투·큰지도가 전부 여러 판 그려졌다.)
    const badCol = await page.evaluate(() => (window.__badCanvasColor || []).slice(0, 6));
    ok(badCol.length === 0, '★★⑪ⓕ 캔버스에 들어간 색에 **`var(…)` 0** — 세계 렌더는 리터럴이다',
       badCol.length ? badCol.join(' · ') : '0건');
    const probed = await page.evaluate(() => {
      const before = (window.__badCanvasColor || []).length;
      const c = document.createElement('canvas').getContext('2d');
      c.fillStyle = 'var(--accent)';
      const after = (window.__badCanvasColor || []).length;
      window.__badCanvasColor.length = before;   // 조사용 한 건은 도로 뺀다
      return after === before + 1;
    });
    ok(probed, '★⑪ⓕ 자명 통과 금지 — 일부러 토큰을 넣으면 **바로 잡힌다**');
  }

  // ── ⑫ ★[T66] 로그인 — 색 선택이 없고, 서버가 받은 색은 유효하다 ─────────────
  //   ★로비는 입장 전에만 있다 ⇒ 여기서는 **이미 들어온 뒤**라 DOM 이 아니라 접속 기록으로 잰다.
  console.log('\n⑫ ★[T66] 로그인 — 색 선택 없음');
  {
    ok((await page.evaluate(() => !document.getElementById('colorPicker'))) === true,
       '★★⑫ 로비에 `#colorPicker` 가 **없다**(재민 확정 3)');
    const col = await page.evaluate(() => (typeof myColor === 'string' ? myColor : null));
    ok(!!col && /^#[0-9a-fA-F]{6}$/.test(col), '★★⑫ 그래도 서버로 간 색은 **유효한 값**이다(서버 접점 0)', String(col));
  }


  // ── ⑬ ★★[T113] 알림이 겹치면 **줄이 선다** ────────────────────────────────
  //   ★왜: `#notice` 는 한 칸이었다 — 의뢰 성공과 쓰러진 사람의 외침이 같은 초에 오면 하나가
  //     **사라졌다**(T78 이 종류를 아홉으로, T90 이 그림을 붙인 뒤로 잃는 것이 더 커졌다).
  //   ★N = 3 은 캔버스에서 유도했다(보고 §0-ⓑ). 이 절은 그 셋이 **동시에 보이는지**를 잰다.
  console.log('\n⑬ ★[T113] 알림 스택 — 셋이 같이 보인다 · 같은 말은 ×n');
  {
    const say = (t, ms, kind) => page.evaluate(([a, b, c]) => showNotice(a, b, c), [t, ms, kind]);
    const readNotice = () => page.evaluate(() => {
      const el = document.getElementById('notice');
      return {
        text: el.textContent,
        lines: el.textContent ? el.textContent.split('\n') : [],
        icons: [...el.querySelectorAll('svg path')].map((p) => p.getAttribute('d')),
        h: Math.round(el.getBoundingClientRect().height),
        emoji: /\p{Extended_Pictographic}/u.test(el.textContent),
      };
    });
    const nts = () => page.evaluate(() => (window.__notices || []).slice(-6));

    // ── 셋을 200ms 안에 — 옛 코드는 여기서 **하나만** 남았다
    await page.evaluate(() => { showNotice('', 1, null); window.__notices.length = 0; });
    await say('첫째 알림', 8000, 'village');
    await sleep(60); await say('둘째 알림', 8000, 'gather');
    await sleep(60); await say('셋째 알림', 8000, 'craft');
    await sleep(200);
    let v = await readNotice();
    ok(v.lines.length === 3, '★★⑬ 200ms 안에 온 알림 **셋이 다 보인다**(옛 코드는 하나였다)',
       JSON.stringify(v.lines));
    ok(v.lines[0].includes('첫째') && v.lines[2].includes('셋째'),
       '★★⑬ 그리고 **온 차례대로** 쌓인다(최근이 아래)', JSON.stringify(v.lines));
    ok(v.icons.length === 3 && new Set(v.icons).size === 3,
       '★★⑬ 줄마다 **제 종류의 그림**을 단다(셋이 서로 다르다 · T90 규약 유지)', `${v.icons.length}개 · ${new Set(v.icons).size}종`);
    ok(!v.emoji, '★⑬ 이모지 0(화면 규칙 B)');
    ok((await nts()).length === 3, '★★⑬ `__notices` 는 **3건**이다(글자만 · 규약 무변)', JSON.stringify(await nts()));

    // ── N 을 넘기면 **오래된 줄이 밀려 사라진다**
    await say('넷째 알림', 8000, 'board');
    await sleep(120);
    v = await readNotice();
    ok(v.lines.length === 3 && !v.text.includes('첫째') && v.text.includes('넷째'),
       '★★⑬ 넷째가 오면 **첫째가 밀려 사라진다**(N=3 · 캔버스 유도)', JSON.stringify(v.lines));

    // ── 같은 말이 연달아 오면 겹치지 말고 ×n
    await page.evaluate(() => { showNotice('', 1, null); window.__notices.length = 0; });
    await say('재료가 모자란다', 8000, 'craft');
    await sleep(40); await say('재료가 모자란다', 8000, 'craft');
    await sleep(40); await say('재료가 모자란다', 8000, 'craft');
    await sleep(150);
    v = await readNotice();
    ok(v.lines.length === 1 && /재료가 모자란다 ×3/.test(v.text),
       '★★⑬ 같은 말 셋은 **한 줄 ×3** 이다(스팸 억제)', JSON.stringify(v.lines));
    ok((await nts()).length === 3, '★★⑬ 그래도 `__notices` 엔 **3건 그대로** 들어간다(하네스 규약 무변)',
       JSON.stringify(await nts()));
    // ★자명 통과 금지 — 사이에 다른 말이 끼면 **안 뭉친다**(차례가 거짓말이 되면 안 된다)
    await page.evaluate(() => { showNotice('', 1, null); });
    await say('가', 8000, 'info'); await sleep(40);
    await say('나', 8000, 'info'); await sleep(40);
    await say('가', 8000, 'info'); await sleep(150);
    v = await readNotice();
    ok(v.lines.length === 3 && !/×/.test(v.text), '★⑬ 자명 통과 금지 — `가 나 가` 는 **안 뭉친다**',
       JSON.stringify(v.lines));

    // ── 줄마다 **제 ms** 로 사라진다
    await page.evaluate(() => { showNotice('', 1, null); });
    await say('짧은 것', 900, 'info');
    await sleep(60); await say('긴 것', 6000, 'info');
    await sleep(200);
    const both = await readNotice();
    ok(both.lines.length === 2, '★⑬ (상황) 둘이 함께 떠 있다', JSON.stringify(both.lines));
    await sleep(1400);
    v = await readNotice();
    ok(v.lines.length === 1 && v.text.includes('긴 것'),
       '★★⑬ 짧은 줄만 **제 ms 뒤에** 사라진다(줄마다 제 시계)', JSON.stringify(v.lines));

    // ── ⓐ 계약: 한 줄만 떠 있으면 `textContent` 는 **종전과 같다**
    await page.evaluate(() => { showNotice('', 1, null); });
    await say('한 줄뿐', 6000, null);
    await sleep(120);
    v = await readNotice();
    ok(v.text === '한 줄뿐', '★★⑬ 한 줄일 때 `textContent` 는 **그 글자 그대로**다(§0-ⓐ 계약)',
       JSON.stringify(v.text));

    // ── §0-ⓒ 실측: 이 판에서 실제로 알림이 얼마나 몰렸나 · 같은 말이 연달아 온 비율
    //   ⚠제품에 진단 훅을 새로 달지 않는다(T57). 이미 있는 `__notices` 를 **하네스가 폴링**해서 잰다.
    {
      const seq = ntSamples;                                     // [{t, len}] — 입장 직후부터 250ms 간격
      let maxPerSec = 0;
      for (let i = 0; i < seq.length; i++) {
        let j = i; while (j + 1 < seq.length && seq[j + 1].t - seq[i].t <= 1000) j++;
        const d = seq[j].len - seq[i].len; if (d > maxPerSec) maxPerSec = d;
      }
      const all = await page.evaluate(() => (window.__notices || []).slice());
      let dup = 0; for (let i = 1; i < all.length; i++) if (all[i] === all[i - 1]) dup++;
      console.log(`  · [상황] §0-ⓒ 이 판의 알림 — 표본 ${seq.length}회 · 초당 최대 ${maxPerSec}건 · 연속 같은 말 ${dup}/${Math.max(1, all.length - 1)}`);
    }

    // 화면 B 결 — 대조 스크린샷
    await page.evaluate(() => { showNotice('', 1, null); });
    await say('마을에 들어섰다', 20000, 'village');
    await sleep(40); await say('나무를 벴다 ×4', 20000, 'gather');
    await sleep(40); await say('여행자가 쓰러졌다 — 해 지는 쪽 60걸음', 20000, 'rescue');
    await sleep(250);
    await snap('ui-08-notice-stack');
    const box = await page.evaluate(() => {
      const r = document.getElementById('notice').getBoundingClientRect();
      const cs = getComputedStyle(document.getElementById('notice'));
      return { h: Math.round(r.height), lh: cs.lineHeight, radius: cs.borderRadius, shadow: cs.boxShadow };
    });
    ok(box.lh === '17px', '★★⑬ 줄 피치가 **캔버스 값 17px** 이다(N 의 출처와 같은 자)', JSON.stringify(box));
    ok(box.radius === '0px' && (box.shadow === 'none' || /none/.test(box.shadow)),
       '★⑬ 모서리 0 · 그림자 0(화면 규칙 B)', JSON.stringify(box));
    await page.evaluate(() => { showNotice('', 1, null); });
  }


  // ── ⑭ ★★[T118] 알림 자리 — 상단 가운데 · **레일 겹침 0** ──────────────────
  //   ★왜: T113 대조 스크린샷에서 **왼쪽 레일이 알림 첫 글자를 덮고 있었다**("마을에"의 "마").
  //     `#notice` 가 `#hud`(좌상) 흐름 안에 있었기 때문이고, 스택 이전부터 그랬다.
  //     캔버스는 알림을 **위 띠**(상태 줄 오른쪽·지도 왼쪽)에 둔다 — 자리를 그리로 옮겼다.
  //   ★이건 화소 하네스가 아니다(`@pixel` 아님) — `getBoundingClientRect` 교집합을 재는 DOM 판정이다.
  console.log('\n⑭ ★[T118] 알림 자리 — 레일과 안 겹친다');
  {
    const say = (t, ms, kind) => page.evaluate(([a, b, c]) => showNotice(a, b, c), [t, ms, kind]);
    const geo = () => page.evaluate(() => {
      const n = document.getElementById('notice'), s = document.getElementById('sidebar');
      const h = document.getElementById('hud'), m = document.getElementById('minimap');
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
        return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
                 r: Math.round(b.right), b: Math.round(b.bottom) }; };
      const cs = getComputedStyle(n);
      // ★상단 상태 줄 — 캔버스는 알림을 **그 줄 오른쪽**에 둔다. 좁은 화면에서 만나는지 잰다.
      const row = document.querySelector('#hud .hud-row');
      return { n: r(n), s: r(s), h: r(h), m: r(m), row: r(row), vw: innerWidth, vh: innerHeight,
               pos: cs.position, pe: cs.pointerEvents, pad: cs.paddingTop, ta: cs.textAlign };
    });
    const overlap = (a, b) => (a && b)
      ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y))
      : null;

    // ★두 해상도에서 잰다 — 자리가 좌표가 아니라 **규칙**이어야 한다(창을 줄이면 다시 덮이면 안 된다).
    for (const [vw, vh] of [[1280, 800], [1024, 700]]) {
      await page.setViewportSize({ width: vw, height: vh });
      await sleep(400);
      await page.evaluate(() => showNotice('', 1, null));
      await sleep(80);
      // ★빈 알림은 **아예 없다** — 위 가운데에 빈 먹판이 늘 떠 있으면 안 된다.
      const empty = await page.evaluate(() => {
        const n = document.getElementById('notice');
        return { disp: getComputedStyle(n).display, h: Math.round(n.getBoundingClientRect().height) };
      });
      ok(empty.disp === 'none' && empty.h === 0, `★★⑭ [${vw}×${vh}] 빈 알림은 **화면에 없다**`, JSON.stringify(empty));

      await say('마을에 들어섰다', 20000, 'village');
      await sleep(40); await say('나무를 벴다', 20000, 'gather');
      await sleep(40); await say('여행자가 쓰러졌다 — 해 지는 쪽 60걸음', 20000, 'rescue');
      await sleep(250);
      const g = await geo();
      ok(!!g.n && !!g.s, `★⑭ [${vw}×${vh}] (상황) 알림과 레일이 둘 다 실재한다`, JSON.stringify({ n: g.n, s: g.s }));
      ok(overlap(g.n, g.s) === 0, `★★⑭ [${vw}×${vh}] **레일 ∩ 알림 = 0**(첫 글자가 안 잘린다)`,
         `겹침 ${overlap(g.n, g.s)}px² · 알림 x${g.n.x}~${g.n.r} · 레일 x${g.s.x}~${g.s.r}`);
      ok(overlap(g.n, g.m) === 0, `★⑭ [${vw}×${vh}] 지도 판과도 안 겹친다`, `겹침 ${overlap(g.n, g.m)}px²`);
      const cx = (g.n.x + g.n.r) / 2;
      ok(Math.abs(cx - vw / 2) <= 2, `★★⑭ [${vw}×${vh}] 알림 중심이 **화면 중심**이다`,
         `중심 ${Math.round(cx)} vs ${vw / 2}`);
      ok(g.n.y === 12, `★⑭ [${vw}×${vh}] 위 띠(top 12 — 지도·HUD 와 같은 줄)`, `y ${g.n.y}`);
      ok(g.pad === '11px', `★⑭ [${vw}×${vh}] 세로 패딩은 **캔버스 값 11px**`, g.pad);
      ok(g.pos === 'fixed' && g.pe === 'none',
         `★⑭ [${vw}×${vh}] 흐름에서 빠졌고(HUD 를 안 민다) 클릭을 안 먹는다`, `${g.pos} · ${g.pe}`);
      // ★캔버스는 알림을 **상태 줄 오른쪽**에 둔다(1440 판에서 66px 여유). 좁은 화면에서 그 여유가
      //   얼마나 남는지 **재서 적는다** — 0 이하면 좁은 화면에서 상태 줄을 가린다는 뜻이다(회부 판단 자료).
      const gap = g.row ? g.n.x - g.row.r : null;
      console.log(`  · [상황] [${vw}×${vh}] 상태 줄 오른쪽 여유 ${gap}px (캔버스 1440 판은 66px · 알림 폭 ${g.n.w})`);
      // ★T113 무변 — 자리만 옮겼지 스택은 그대로다
      const lines = await page.evaluate(() => document.getElementById('notice').textContent.split('\n'));
      ok(lines.length === 3, `★★⑭ [${vw}×${vh}] 스택 셋은 그대로다(T113 무접촉)`, JSON.stringify(lines));
    }

    // ★자명 통과 금지 — 옛 자리(HUD 흐름 안)로 되돌리면 이 판정이 **빨개진다**
    const wouldOverlap = await page.evaluate(() => {
      const n = document.getElementById('notice'), s = document.getElementById('sidebar');
      const sb = s.getBoundingClientRect();
      // 옛 자리를 흉내 낸다: HUD 흐름 안 = 좌상(12,205) 언저리
      const old = { x: 12, y: 205, r: 12 + n.getBoundingClientRect().width, b: 205 + n.getBoundingClientRect().height };
      const ov = Math.max(0, Math.min(old.r, sb.right) - Math.max(old.x, sb.left))
               * Math.max(0, Math.min(old.b, sb.bottom) - Math.max(old.y, sb.top));
      return ov;
    });
    ok(wouldOverlap > 0, '★⑭ 자명 통과 금지 — **옛 자리라면 겹친다**(이 검사가 늘 0 을 내는 게 아니다)',
       `옛 자리 겹침 ${wouldOverlap}px²`);

    await snap('ui-09-notice-pos');
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(300);
    await page.evaluate(() => showNotice('', 1, null));
  }

  clearInterval(ntPoll);
  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close(); shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
