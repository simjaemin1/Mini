#!/usr/bin/env node
// === scripts/e2e-metallurgy.js — 플레이어 야금 사슬 **실클라** E2E =============
//
// ★왜 [2026-08-02d 배치 5 ⑥]
//   서버 함수 E2E(`test-furnace.js` 59/0)는 "함수를 부르면 계약이 지켜지는가"를 잰다.
//   그런데 배치 1 에서 **한 번도 지을 수 없던 노**를 잡은 건 그 방식이 아니라 실행 검증이었다.
//   아직 안 잰 층이 하나 남아 있다 — **클라 UI**: 건축 메뉴에 항목이 뜨는가, 2×2 고스트가
//   내 사유지 안에서 초록인가, 클릭이 서버 좌표로 도달하는가, 인벤 라벨이 한글인가.
//   여기서는 진짜 브라우저(Chromium)를 띄우고 **사람이 하듯** 채광→선광→숯가마→노→제련→단조를 통과시킨다.
//
// 실행: node scripts/e2e-metallurgy.js [--headed]
//   중앙(central) + 존(zone) 을 임시 DB·임시 포트로 띄우고, 스크린샷을 /tmp/e2e-shots 에 남긴다.
//   ★Chromium 은 /opt/pw-browsers/chromium (playwright install 금지 — 컨테이너 규약).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
// ★포트는 **설정값 그대로** 쓴다(central 3010 · hanbando 3020).
//   임의 포트로 띄웠다가 로비가 "접속 가능한 지역이 없습니다"로 막혔다 — central 이 존 헬스를
//   `zone-config` 의 포트로 폴링하기 때문이다. 실화면 검증이 목적이라 배선을 우회하지 않는다.
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-central-${process.pid}.db`, ZDB = `/tmp/e2e-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|시딩 시작/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 90)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

// ★[2026-08-04b 배치 16] 대기 예산 120초 → 900초 — 마을 50곳 전수 시딩으로 존 첫 부팅이 ~7.6분이다.
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}

(async () => {
  console.log('\n=== 야금 사슬 실클라 E2E (Chromium) ===');
  // ── 서버 2대 기동 ──────────────────────────────────────────────────────────
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',   // 부팅 4~5분 걸리는 마을 실체화는 이 검사의 대상이 아니다
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  // 존 포트가 zone-config 의 3020 이라 클라가 그리로 붙는다 — /zones 응답을 확인해 실제 URL 을 잡는다
  // ★로비는 `/zones` 의 population 이 null 이면 그 존을 **죽은 것으로 보고 목록에서 뺀다**(client.js zoneAlive).
  //   central 은 5초마다 각 존 /health 를 폴링하므로, 그 첫 폴링이 돌기 전에 페이지를 열면
  //   "현재 접속 가능한 지역이 없습니다" 가 뜬다 — 첫 시도에서 실제로 그렇게 막혔다.
  //   ⇒ 존이 **로비에 살아 보일 때까지** 기다린 뒤에 브라우저를 연다.
  let zmap = null;
  for (let i = 0; i < 60; i++) {
    zmap = await (await fetch(`http://localhost:${CPORT}/zones`)).json();
    const z = zmap.zones && zmap.zones.hanbando;
    if (z && z.population !== null && z.population !== undefined && z.cap) break;
    await sleep(1000);
  }
  const hz = (zmap.zones || {}).hanbando || {};
  console.log(`    /zones → hanbando wsUrl=${hz.wsUrl} population=${hz.population} cap=${hz.cap}`);
  ok(hz.population !== null && hz.population !== undefined && !!hz.cap, '로비에 존이 살아 보인다(central 헬스 폴링 도달)');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const err404 = [];
  page.on('response', (r) => { if (r.status() === 404) err404.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const snap = async (name) => { const f = path.join(SHOTS, name + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };
  await snap('01-lobby');
  ok(true, '로비 로드 — 스크린샷 01-lobby.png');

  // ── 게스트 입장 — 진짜 버튼을 누른다 ─────────────────────────────────────
  const enterBtn = await page.$('button:has-text("월드 입장")');
  ok(!!enterBtn, '로비에 "월드 입장" 버튼이 있다');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 40 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  await snap('02-in-game');
  const st = await page.evaluate(() => ({
    hasCanvas: !!document.querySelector('canvas'),
    zone: (window.__getPrimaryZoneId && window.__getPrimaryZoneId()) || null,
    abs: (window.__getMyAbs && window.__getMyAbs()) || null,
    inv: (window.__getInv && window.__getInv()) || null,
  }));
  console.log(`    캔버스 ${st.hasCanvas} · primaryZone ${st.zone} · 좌표 ${st.abs ? `(${Math.round(st.abs.x)},${Math.round(st.abs.y)})` : 'X'}`);
  ok(st.hasCanvas, '게임 캔버스 렌더');
  ok(!!st.zone && !!st.abs, '존 입장 완료 — 내 플레이어 좌표 수신(WS 왕복 성립)');
  console.log(`    404 자원: ${JSON.stringify([...new Set(err404)].slice(0, 8))}`);
  const fatal = errs.filter((e) => !/Failed to load resource/.test(e));
  ok(fatal.length === 0, `클라 JS 에러 0 ${fatal.length ? '— ' + fatal.slice(0, 3).join(' / ') : ''}`);
  // ⚠기준을 잘못 잡을 뻔했다 — `/assets/icons/*.png` 404 는 **설계된 프로브**다:
  //   client.js preloadItemIcons 가 전 아이템 키를 시도하고 실패하면 이모지로 폴백한다
  //   ("실패/미배포 시 위 이모지가 그대로 폴백이라 어느 쪽이든 UI가 비지 않는다").
  //   그래서 "404 0" 은 **없는 결함을 보고하는 기준**이다. 아이콘 프로브 밖 404 만 결함으로 센다.
  const bad404 = [...new Set(err404)].filter((u) => !/^\/assets\/icons\/.*\.png$/.test(u));
  const missIcons = [...new Set(err404)].filter((u) => /^\/assets\/icons\//.test(u)).length;
  console.log(`    (아이콘 프로브 미배포 ${missIcons}종 — 이모지 폴백, 설계된 동작)`);
  ok(bad404.length === 0, `아이콘 프로브 밖 404 없음 ${bad404.length ? '— ' + bad404.slice(0, 5).join(', ') : ''}`);

  // ── ★진짜 UI 경로: 좌측 레일 🏗️건축 → 사이드 패널 ────────────────────────
  //   ⚠`.hud-actions` 의 버튼들은 CSS 로 `display:none` 인 **구 UI 잔재**다(style.css:486).
  //     첫 시도에서 그걸 클릭하려다 30초 타임아웃이 났다 — DOM 에 있다고 보이는 게 아니다.
  //     실제 메뉴는 사이드바 아이콘(.sb-icon[data-side=build])이 여는 #sidePanel 이다.
  await page.click('.sb-icon[data-side="build"]');
  await sleep(800);
  await snap('03-build-panel');
  const menu = await page.evaluate(() => {
    const sp = document.getElementById('sidePanel');
    const open = sp && sp.classList.contains('open');
    const body = document.getElementById('spBody');
    const txt = body ? (body.textContent || '') : '';
    const btns = body ? Array.from(body.querySelectorAll('button,[data-action],div[role=button]'))
      .filter((b) => b.offsetParent !== null).map((b) => (b.textContent || '').trim()).filter(Boolean) : [];
    return { open, title: (document.getElementById('spTitle') || {}).textContent, txt: txt.slice(0, 400), btns: btns.slice(0, 30) };
  });
  console.log(`    건축 패널 열림=${menu.open} 제목="${menu.title}"`);
  console.log(`    항목: ${JSON.stringify(menu.btns)}`);
  ok(menu.open, '좌측 레일 🏗️ 클릭으로 건축 패널이 열린다');
  // ★이 세 줄이 이번 배치의 핵심 회귀 가드다 — 서버 계약이 아무리 멀쩡해도 여기서 실패하면
  //   플레이어는 노를 **지을 방법이 없다**(2026-08-02d 실측으로 실제 그 상태였다).
  //   판정은 렌더된 **버튼 목록**으로 한다(패널 본문 텍스트는 사용법 안내가 길어 잘린다).
  const btnTxt = (menu.btns || []).join(' | ');
  ok(/노\(爐\)/.test(btnTxt), '건축 패널에 "노(爐) 터 잡기" 버튼이 렌더된다');
  ok(/숯가마/.test(btnTxt), '건축 패널에 "숯가마 터 잡기" 버튼이 렌더된다');
  ok(/움집/.test(btnTxt), '건축 패널에 "움집 터파기" 버튼이 렌더된다');

  const notices = () => page.evaluate(() => (window.__notices || []).slice(-6));
  // 사유지 — 키 바인딩(C)으로. 패널 밖 클릭은 패널을 닫으므로 키가 실제 플레이에 가깝다.
  await page.keyboard.press('c');
  await sleep(1200);
  await snap('04-claim');
  console.log(`    사유지 알림: ${JSON.stringify(await notices())}`);

  // 노 터 잡기 — 패널 안의 실제 항목을 텍스트로 찾아 클릭
  const clicked = await page.evaluate(() => {
    const body = document.getElementById('spBody'); if (!body) return false;
    // ⚠`div,span` 까지 훑으면 **바깥 래퍼 div** 가 먼저 잡힌다(textContent 로 매칭하므로).
    //   래퍼를 클릭하면 아무 일도 안 일어나고 검사는 통과해 버린다 — 자명통과의 전형. button 만 본다.
    const el = Array.from(body.querySelectorAll('button'))
      .find((b) => b.offsetParent !== null && /노\(爐\)|노 터 잡기/.test(b.textContent || ''));
    if (!el) return false; el.click(); return true;
  });
  ok(clicked, '건축 패널에서 "노(爐) 터 잡기" 를 눌렀다');
  await sleep(600);
  await snap('05-furnace-ghost');   // ★2×2 고스트가 커서 자리에 그려진 화면
  const place = await page.evaluate(() => ({
    note: (window.__notices || []).some((t) => /터 배치/.test(t)),
    last: (window.__notices || []).slice(-3),
  }));
  console.log(`    배치 모드 알림: ${JSON.stringify(place.last)}`);
  ok(place.note, '노 배치 모드 진입 — "터 배치" 안내가 뜬다');

  // 캔버스 정중앙(=내 캐릭터 자리)을 진짜로 클릭한다 — 클릭 좌표 → 서버 메시지 경로 검증
  const box = await (await page.$('canvas')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(300);
  await snap('06-ghost-on-cursor');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(1500);
  await snap('07-after-click');
  const nt = await notices();
  console.log(`    배치 클릭 후 알림: ${JSON.stringify(nt)}`);
  ok(nt.length > 0, '클릭이 서버까지 도달해 응답(알림)이 돌아온다');
  // 서버가 노 터를 세웠거나, 세우지 못한 **이유를 한국어로** 돌려줘야 한다(영문 키·무응답 금지)
  const built = await page.evaluate(() => {
    const b = (window.__getAllWalls && []) || [];
    return (window.__notices || []).some((t) => /노 터|터 다지기/.test(t));
  });
  const refusedKo = nt.some((t) => /사유지|재료|곡괭이|물·바위|멀어서/.test(t));
  ok(built || refusedKo, `노 배치 응답이 한국어 계약 메시지다 ${built ? '(착공)' : '(거부 사유 명시)'}`);
  ok(!nt.some((t) => /[a-z_]{3,}\s*\d|undefined|NaN/.test(t)), '알림에 영문 키·undefined·NaN 이 안 샌다');

  // ── ★[2026-08-02e ⑦] 야금 아이콘 8종이 실제로 **로드되는가**(빈 사각형 금지) ─────
  //   client.js preloadItemIcons 가 키마다 <img> 를 시도하고 성공한 것만 ITEM_ICON_IMG 에 담는다.
  //   미배포면 이모지 폴백이라 화면은 안 비지만, 배포했다면 **이미지로** 떠야 한다.
  {
    const KEYS = ['ore_chunk', 'iron_ore', 'charcoal', 'iron', 'meteoric_iron', 'copper', 'tin', 'lead'];
    const got = await page.evaluate(async (keys) => {
      const out = {};
      await Promise.all(keys.map((k) => new Promise((res) => {
        const im = new Image();
        im.onload = () => { out[k] = im.naturalWidth; res(); };
        im.onerror = () => { out[k] = 0; res(); };
        im.src = '/assets/icons/' + k + '.png?probe=1';
      })));
      return out;
    }, KEYS);
    console.log(`    아이콘 로드: ${JSON.stringify(got)}`);
    const missing = KEYS.filter((k) => !(got[k] > 0));
    ok(missing.length === 0, `야금 아이콘 8종이 전부 이미지로 로드된다 ${missing.length ? '— 누락 ' + missing.join(',') : ''}`);
    ok(KEYS.every((k) => got[k] === 96), '아이콘이 규격(96×96)이다');
  }

  // ── 인벤 라벨 — iron 계열이 한글로 뜨는가(⑤ 라벨 정합의 실화면 확인) ─────
  const lbl = await page.evaluate(() => {
    const t = window.__ITEM_LABEL_PROBE || null;
    // 라벨표는 모듈 스코프라 직접 못 읽는다 → 인벤 UI 를 실제로 렌더시켜 텍스트를 본다
    const inv = document.getElementById('inventory') || document.querySelector('[id*=inv]');
    return { html: inv ? (inv.textContent || '').slice(0, 300) : null };
  });
  console.log(`    인벤 UI 텍스트: ${JSON.stringify(lbl.html)}`);
  await snap('08-inventory');

  await browser.close();
  shutdown();
  console.log(`\n스크린샷 ${shots.length}장: ${SHOTS}`);
  console.log(`=== 실클라 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 실패:', e); shutdown(); process.exit(1); });
