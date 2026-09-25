#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @nightly C   ← 야간 세 밤 분할(T238 · 소요로 균등)
//
// ══════════════════════════════════════════════════════════════════════════════
// e2e-aim — **우클릭 홀드(조준)가 어디서 풀리는가** [T379 2026-09-23 · 세션9]
//
//   재민 실기 09-23: "우클릭을 드래그하다가 다른 UI 위로 올라가거나 브라우저 밖으로 이동하면
//   우클릭이 취소되어서 화면이 제자리로 돌아와버린다."
//   ★카드가 못 박았다: **추측이다 — 재현 먼저.** 그래서 이 자는 고침을 재기 전에
//     **여섯 대본**을 돌려 무엇이 되고 무엇이 안 되는지부터 표로 낸다.
//
//   ⚠합성 이벤트(`dispatchEvent`)를 쓰지 않는다. 브라우저가 **진짜 포인터**를 움직여야
//     `mouseleave`·포인터 캡처·창 밖 같은 것이 진짜로 일어난다 — 합성으로는 그 결함이 안 난다.
//   ⚠조준 여부는 층의 읽기 훅(`window.__aimDbg`)이 답한다(사본 0).
// ══════════════════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs = []; }
process.on('exit', killAll);

(async () => {
  console.log('=== e2e-aim — 우클릭 홀드는 어디서 풀리는가 (T379) ===\n');
  const CDB = `/tmp/e2e-aim-c-${process.pid}.db`, ZDB = `/tmp/e2e-aim-z-${process.pid}.db`;
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  // ★기동 증인은 **아이의 입**이다(`fixture-boot.waitUp` 정본 · T349 · 사본 0).
  //   포트 응답은 증인이 아니다 — 앞 판이 포트를 쥐고 있으면 새 아이가 죽어도 200 이 온다.
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _cp = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone.js', { PORT: String(ZPORT), DB_PATH: ZDB, ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}` });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  { const r = await _cp; ok(r.ok, 'central 기동', r.ok ? `${r.ms}ms` : r.why); }
  { const r = await _zp; ok(r.ok, 'zone 기동', r.ok ? `${r.ms}ms` : r.why); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('#enter');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  ok(!!(await page.evaluate(() => window.__getMyAbs && window.__getMyAbs())), '존 입장');
  ok(await page.evaluate(() => typeof window.__aimDbg === 'function'), '층의 읽기 훅이 있다(`__aimDbg`)');

  // 사건 순서를 **곁에서** 듣는다(층 무접촉 · capture 단계라 층보다 먼저 받는다)
  await page.evaluate(() => {
    window.__evLog = [];
    const c = document.querySelector('canvas');
    for (const t of ['mousedown', 'mouseup', 'mouseleave', 'contextmenu', 'auxclick',
                     'pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture'])
      c.addEventListener(t, (e) => window.__evLog.push(t + (e.button !== undefined ? '(' + e.button + ')' : '')), true);
    window.addEventListener('blur', () => window.__evLog.push('blur'), true);
  });
  const box = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  ok(box.w > 200 && box.h > 200, '캔버스가 화면을 차지한다(로비가 아니다)', `${Math.round(box.w)}x${Math.round(box.h)}`);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const aiming = () => page.evaluate(() => window.__aimDbg().aiming);
  const drain = () => page.evaluate(() => { const l = window.__evLog.slice(); window.__evLog = []; return l.join(' '); });
  // ★[T387 ⓪] 자의 격리 — 앞 대본이 연 동사 메뉴(`44-h-hud` `#ctxMenu` · `46-h-verbs` 가 연다)를 닫는다.
  //   PM 컨테이너 12/1: ⓓ 짧은 우클릭이 커서 자리에 메뉴를 열어 둔 채였고, 같은 자리의 ⓔ `pointerdown` 을
  //   **메뉴가 먹었다**(사건 로그 `pointerup(2) mouseup(2)` 뿐). 제품 결함이 아니라 자가 앞 대본을 끌고 간 것.
  //   닫는 길 = 제품이 이미 가진 "바깥 클릭 = 닫기"(document capture `click`) — 캔버스에 좌클릭을 안 준다
  //   (좌클릭은 이동·공격 길이다). 좌표 없는 `click` 을 body 에 쏜다 = 캔버스 밖 좌클릭. 제품 무접촉.
  const menuOpen = () => page.evaluate(() => !!document.getElementById('ctxMenu'));
  const closeMenu = async () => {
    for (let i = 0; i < 20 && await menuOpen(); i++) {
      await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
      await sleep(60);   // 메뉴는 연 뒤 50ms 가 지나야 바깥 클릭을 듣는다(44-h-hud setTimeout 50)
    }
  };
  const reset = async () => { await page.mouse.up({ button: 'right' }).catch(() => {}); await closeMenu(); await page.evaluate(() => { window.__evLog = []; }); };

  // 패널 자리 — 캔버스 위에 덮인 DOM 중 하나(HUD·사이드)
  const panel = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const best = [...document.querySelectorAll('div,section,aside,button')].map((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { e, r, cs };
    }).filter((o) => o.r.width > 40 && o.r.height > 20 && o.r.width < innerWidth * 0.8
      && o.cs.pointerEvents !== 'none' && o.cs.display !== 'none' && o.cs.visibility !== 'hidden'
      && o.r.top >= 0 && o.r.left >= 0 && o.r.bottom <= innerHeight && o.e !== c)
      .sort((a, b) => (b.r.width * b.r.height) - (a.r.width * a.r.height))[0];
    return best ? { id: best.e.id || String(best.e.className).slice(0, 22),
                    x: best.r.x + best.r.width / 2, y: best.r.y + best.r.height / 2 } : null;
  });

  const rows = [];
  console.log('\n    ── 재현 표 ──');

  // ⓒ 기준선 — 캔버스 안에서 눌렀다 뗀다
  await reset();
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' });
  const c1 = await aiming(); await page.mouse.move(cx + 80, cy + 50);
  const c2 = await aiming(); await page.mouse.up({ button: 'right' });
  const c3 = await aiming();
  rows.push(['ⓒ 캔버스 안에서 뗌', `누른뒤 ${c1} · 끌때 ${c2} · 뗀뒤 ${c3}`, await drain()]);
  ok(c1 === true && c2 === true && c3 === false, 'ⓒ ★기준선 — 캔버스 안에서는 누르면 켜지고 떼면 꺼진다', `${c1}/${c2}/${c3}`);

  // ⓐ 패널 위로
  await reset();
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' });
  const a1 = await aiming();
  if (panel) await page.mouse.move(panel.x, panel.y);
  const a2 = await aiming(); await page.mouse.up({ button: 'right' });
  rows.push([`ⓐ 패널 위로(${panel ? panel.id : '패널없음'})`, `누른뒤 ${a1} · 패널위 ${a2}`, await drain()]);

  // ⓑ 창 밖으로 — 캔버스 위쪽 경계 밖
  await reset();
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' });
  const b1 = await aiming();
  await page.mouse.move(cx, Math.max(0, box.y - 30)); await page.mouse.move(2, 2);
  const b2 = await aiming(); await page.mouse.up({ button: 'right' });
  rows.push(['ⓑ 창 밖(캔버스 밖)으로', `누른뒤 ${b1} · 밖에서 ${b2}`, await drain()]);

  // ⓓ 짧은 우클릭 — 동사 메뉴
  //   ★★[T379 실측] 이 대본이 처음엔 "조준이 안 남는다" 만 봤다 — 그래서 **메뉴가 죽은 것을 놓쳤다.**
  //     `pointerdown` 에 `preventDefault` 를 걸었더니 브라우저가 호환 사건을 안 만들어
  //     `mousedown(2)` 이 사라졌고, 동사 메뉴는 누른 시각을 거기서 적는다 ⇒ 모든 우클릭이
  //     홀드로 읽혀 메뉴가 영영 안 떴다. **조준만 보는 자는 조준 밖의 결함을 못 본다.**
  //   ⇒ 호환 사건이 살아 있는지를 **사건 로그로** 직접 못 박는다.
  await reset();
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' });
  await sleep(90); await page.mouse.up({ button: 'right' }); await sleep(250);
  const d1 = await aiming();
  const dLog = await drain();
  rows.push(['ⓓ 짧은 우클릭(동사)', `뗀뒤 조준 ${d1}`, dLog]);
  ok(/mousedown\(2\)/.test(dLog) && /mouseup\(2\)/.test(dLog),
     'ⓓ-2 ★★호환 마우스 사건이 **살아 있다**(`mousedown(2)`·`mouseup(2)`) — 동사 메뉴가 누른 시각을 거기서 적는다',
     dLog || '(없다)');

  // ⓔ 홀드 600ms
  const dMenu = await menuOpen();   // ⓓ 가 메뉴를 열었나(정보 — 캔버스 가운데 대상 유무에 달렸다)
  //   ★자를 먼저 검증한다 — 이 컨테이너에선 ⓓ 가 메뉴를 **안 열 수도** 있다(가운데 대상이 없으면 동사 0).
  //     그러면 아래 전제 단언은 자명하게 통과한다. 그래서 PM 판의 상태(메뉴가 커서 자리에 열림)를
  //     **제품 함수 그대로**(`showContextMenu` · 44-h-hud) 만들어 두고 ① 먹힌다는 반례 ② reset 이 닫는다를 본다.
  const forceMenu = async () => { await page.evaluate(({ x, y }) => showContextMenu(x, y, [{ label: '자 검증', onClick() {} }]), { x: cx, y: cy }); await sleep(80); };
  await forceMenu();
  await page.evaluate(() => { window.__evLog = []; });
  await page.mouse.move(cx + 6, cy + 6); await page.mouse.down({ button: 'right' }); await sleep(60); await page.mouse.up({ button: 'right' });
  const eaten = await drain();
  ok(!/pointerdown\(2\)/.test(eaten),
     'ⓔ 반례 — 열린 메뉴 위 우클릭은 캔버스에 `pointerdown` 을 **안 준다**(PM 컨테이너 12/1 의 기전 재현)', eaten || '(없다)');
  await forceMenu();
  const forced = await menuOpen();
  await reset();
  const eMenu = await menuOpen();
  ok(forced === true && eMenu === false, 'ⓔ 전제 — 누르기 전에 **열린 메뉴가 없다**(ⓓ 가 연 메뉴를 reset 이 닫았다 · T387 ⓪)', `ⓓ뒤 메뉴 ${dMenu} · 강제로 연 메뉴 ${forced} · reset뒤 ${eMenu}`);
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' });
  await sleep(600);
  const e1 = await aiming(); await page.mouse.up({ button: 'right' });
  const e2 = await aiming();
  rows.push(['ⓔ 홀드 600ms', `600ms뒤 ${e1} · 뗀뒤 ${e2}`, await drain()]);
  ok(e1 === true && e2 === false, 'ⓔ 홀드는 유지되고 떼면 풀린다', `${e1}/${e2}`);

  for (const [n, v, ev] of rows) { console.log(`      ${n}`); console.log(`         ${v}`); console.log(`         사건: ${ev || '(없다)'}`); }

  // ★★고침의 계약 — 이 둘이 이 카드의 전부다
  ok(a2 === true, 'ⓐ ★★패널 위로 끌어도 **조준이 유지된다**(포인터 캡처)', `패널위 ${a2}`);
  ok(b2 === true, 'ⓑ ★★캔버스 밖으로 끌어도 **조준이 유지된다**(포인터 캡처)', `밖에서 ${b2}`);
  ok(d1 === false, 'ⓓ 짧은 우클릭 뒤 조준이 남지 않는다(동사 메뉴 길과 안 싸운다)', `${d1}`);

  // ⓕ 배치 모드 회전 — 우클릭이 회전을 먹는 길이 살아 있나(정적으로 확인 · 배치 진입은 인벤이 필요)
  {
    const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');
    ok(/placementMode\.dir/.test(src) && /contextmenu/.test(src),
       'ⓕ 배치 회전이 `contextmenu` 길에 그대로 있다(캡처가 그 길을 안 먹었다)');
  }

  const bad = errs.filter((e) => !/zones|fetch|json/i.test(e));
  ok(bad.length === 0, '페이지 오류 0', bad.slice(0, 2).join(' | ') || '없다');

  await browser.close(); killAll();
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
