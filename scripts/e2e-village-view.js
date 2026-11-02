#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) — 지금 가장 작은 묶음(A 22 · B 23 · C 26)
// === scripts/e2e-village-view.js — 마을 화면 · 메뉴 넷 실클라 E2E (T1070 · ★재민 11-01 · 11-02) ==========================
//
// ★무엇: 마을 중심 앞에서 Shift+G(손잡이 `?T1070_VILLAGE_VIEW=1`)로 마을 화면이 열리고 · 탭 넷(대시보드 · 프로젝트 · 구성원 · 창고)이 서고 ·
//   화면의 숫자가 **받은 자료 그대로**이고 · 버튼 셋이 **이미 있는 길**(납품 · 개인 사유지 · 기부)을 부르고 · 멀리서는 창고 시세가
//   "가까이 가야 볼 수 있습니다"이고 · 글자 18px 이상 · 이모지 0 · 손잡이 끔이면 종전 게시판 판이 그대로 뜬다.
// ⚠자료: 서버 `villageView`(T1072)가 아직 없다 — 화면은 시험 훅(`__vvInject`)으로 넣은 **임시 자료**(`test/fixtures/village-view.ui-draft.json`
//   · 시안 값)를 그린다. 그래서 "숫자 = 서버 값" 대조는 아직 못 한다 — 지금은 "숫자 = 받은 자료" 대조이고, T1072 가 오면 그 자료를 서버에서 받아
//   같은 대조를 서버 값으로 바꾼다(T1070 보고 회부). 마을 이름 · 수는 예시라 실제 마을과 다르다(판정 아님 · 배치 · 배선만 단언).
// 사진: /tmp/e2e-shots/vv-{dash,proj,mem,store}.png(1440×1080 — 시안과 같은 크기) · vv-far.png · vv-knob-off.png
//
// 실행: node scripts/e2e-village-view.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-vv-central-${process.pid}.db`, ZDB = `/tmp/e2e-vv-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'village-view.ui-draft.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

async function enterAndGo(page, V) {
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
  const b = await page.$('#enter'); if (b) await b.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  const ax = V.cx * 32 + 16, ay = V.cy * 32 + 16;
  let near = null;
  for (let t = 0; t < 25 && near !== V.id; t++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [ax, ay]);
    await sleep(1200);
    near = await page.evaluate(() => window.__evNearVid);
  }
  return near;
}

(async () => {
  console.log('\n=== 마을 화면 · 메뉴 넷 실클라 E2E (T1070 · Chromium) ===');
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await _upP).ok, 'central 기동');
  ok((await _zp).ok, 'zone 기동');
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 60 && !rows.length; i++) { try { rows = new DatabaseSync(ZDB).prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); } catch (e) {} if (!rows.length) await sleep(1000); }
  ok(rows.length > 0, `[상황] 마을이 시딩됐다(${rows.length}곳)`);
  if (!rows.length) { shutdown(); process.exit(1); }
  const V = rows[0];

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errs = [], sent = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('websocket', (ws) => ws.on('framesent', (f) => { const d = typeof f.payload === 'string' ? f.payload : ''; if (/village_deliver|village_donate|"claim"|village_view/.test(d)) { try { sent.push(JSON.parse(d)); } catch (e) {} } }));
  await page.goto(`http://localhost:${CPORT}/?T1070_VILLAGE_VIEW=1`, { waitUntil: 'domcontentloaded' });
  const near = await enterAndGo(page, V);
  ok(near === V.id, '[상황] 마을 중심 앞 — 클라가 그 마을을 근접 인식', `${near} (기대 ${V.id})`);
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));

  // ① 마을 앞에서 열기(진짜 키) — 자료 오기 전
  await page.keyboard.press('Shift+g');
  await sleep(600);
  let st = await page.evaluate(() => window.__vvState());
  ok(st.knob === true && st.open === true && st.vid === V.id, '① 마을 앞에서 Shift+G 로 마을 화면이 열린다(손잡이 켬)', JSON.stringify(st));
  ok(sent.some((m) => m.type === 'village_view' && m.vid === V.id), '① 열 때 자료를 요청한다(`village_view` · 서버가 모르면 버린다 — T1072 전)');
  ok(await page.evaluate(() => /받는 중/.test(document.getElementById('vvBody').textContent)), '① 자료 전에는 지어낸 값 없이 "받는 중"(보이는 것 = 일어난 것)');

  // ② 자료 넣기(T1072 전 임시 자료) → 대시보드
  const F = Object.assign({}, FIX, { vid: V.id });
  await page.evaluate((v) => window.__vvInject(v), F);
  await sleep(300);
  const txt = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
  ok((await txt('#vvName')) === F.name, '② 마을 이름 = 받은 자료', await txt('#vvName'));
  ok((await txt('#vvContrib')) === `${F.contrib.n} / ${F.contrib.need}`, '② 머리줄 "마을 사람이 되기까지 n / 50" = 받은 자료(기여 계량기 하나)', await txt('#vvContrib'));
  ok((await txt('#vvPop')) === `${F.stats.pop}명`, '② 사는 사람 = 받은 자료', await txt('#vvPop'));
  const reqN = await page.evaluate(() => document.querySelectorAll('#vvReq [data-vv="give"]').length);
  ok(reqN === F.requests.length, '② 마을의 부탁 줄 수 = 받은 자료', `${reqN}/${F.requests.length}`);
  await page.screenshot({ path: path.join(SHOTS, 'vv-dash.png') });

  // ③ 버튼 — 이미 있는 길만
  sent.length = 0;
  await page.click('#vvReq [data-vv="give"]');
  await page.click('[data-vv="claim"]');
  await sleep(500);
  ok(sent.some((m) => m.type === 'village_deliver' && m.vid === V.id && m.item === F.requests[0].item), '③ "가진 것 주기" = 그 부탁의 납품(`village_deliver` + 품목 — 게시판 줄 버튼과 같은 문)', JSON.stringify(sent.filter((m) => m.type === 'village_deliver')));
  ok(sent.some((m) => m.type === 'claim' && m.kind === 'personal'), '③ "내 땅 정하기" = 개인 사유지(`claim` personal — C 키와 같은 문 · T45)');

  // ④ 탭 넷
  const tab = async (k) => { await page.click(`.vv-tab[data-k="${k}"]`); await sleep(300); return page.evaluate(() => window.__vvState().tab); };
  ok((await tab('proj')) === 'proj', '④ 프로젝트 탭');
  const projN = await page.evaluate(() => document.querySelectorAll('[data-vv="bring"]').length);
  ok(projN === F.projects.active.length, '④ 하고 있는 일 카드 수 = 받은 자료', `${projN}/${F.projects.active.length}`);
  await page.screenshot({ path: path.join(SHOTS, 'vv-proj.png') });
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { '목재': 3 } }));
  await sleep(700);
  sent.length = 0;
  await page.click('[data-vv="bring"]');
  await sleep(500);
  ok(sent.some((m) => m.type === 'village_donate' && m.vid === V.id && m.want && m.want['목재'] >= 1), '③ "재료 가져오기" = 기부(`village_donate` — 회관 기부 단추와 같은 문 · 든 것 중 그 일에 필요한 것)', JSON.stringify(sent.filter((m) => m.type === 'village_donate')));
  ok((await tab('mem')) === 'mem', '④ 구성원 탭');
  const memN = await page.evaluate(() => document.querySelectorAll('#vvBody .vv-card').length);
  ok(memN === Math.min(16, F.members.people.length), '④ 사람 칸 = 받은 자료(처음 16)', `${memN}`);
  ok(await page.evaluate((n) => { const b = document.querySelector('[data-vv="more"]'); return !!b && b.textContent.includes(`${n}명 더 보기`); }, F.members.total - 16), '④ "n명 더 보기" = 전체 − 보인 수');
  await page.screenshot({ path: path.join(SHOTS, 'vv-mem.png') });
  ok((await tab('store')) === 'store', '④ 창고 탭');
  const priceCell = await page.evaluate(() => { const r = document.querySelectorAll('#vvBody .vv-row')[1]; return r ? r.children[3].textContent.trim() : null; });
  ok(priceCell === `${F.store.rows[0].price}${F.store.rows.find((r) => r.item === F.store.base).unit}`, '④ 가까이서는 시세가 보인다(받은 자료 · 기준 품목 단위)', priceCell);
  ok(!(await page.$('#vvFar')), '④ 가까이서는 "가까이 가야" 안내가 없다');
  await page.screenshot({ path: path.join(SHOTS, 'vv-store.png') });

  // ⑤ 글자 18px 이상 · 이모지 0(네 탭 다)
  const sizes = [];
  for (const k of ['dash', 'proj', 'mem', 'store']) {
    await tab(k);
    sizes.push(await page.evaluate(() => {
      const out = { min: 99, minText: '', emoji: [] };
      const w = document.createTreeWalker(document.getElementById('vvPane'), NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.textContent.trim(); if (!t) continue;
        const fs = parseFloat(getComputedStyle(n.parentElement).fontSize);
        if (fs < out.min) { out.min = fs; out.minText = t.slice(0, 20); }
        if (/\p{Extended_Pictographic}/u.test(t)) out.emoji.push(t.slice(0, 20));
      }
      return out;
    }));
  }
  ok(sizes.every((s) => s.min >= 18), '⑤ 본문 18px 아래 0(네 탭)', sizes.map((s) => `${s.min}px「${s.minText}」`).join(' · '));
  ok(sizes.every((s) => !s.emoji.length), '⑤ 이모지 0(네 탭)', sizes.map((s) => s.emoji.join('|')).join(' '));

  // ⑥ 멀리서 창고 시세 — 원격 시세 없음
  await tab('store');
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16 + 4000, V.cy * 32 + 16]);
  let far = false;
  for (let i = 0; i < 20 && !far; i++) { await sleep(800); far = await page.evaluate(() => window.__evNearVid == null); if (!far) await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16 + 4000, V.cy * 32 + 16]); }
  await page.evaluate(() => { const b = document.querySelector('.vv-tab[data-k="store"]'); if (b) b.click(); });
  await sleep(300);
  ok(far, '[상황] 마을 중심에서 멀어졌다(근접 없음)');
  ok(await page.evaluate(() => { const e = document.getElementById('vvFar'); return !!e && /가까이 가야 볼 수 있습니다/.test(e.textContent); }), '⑥ 멀리서는 창고 시세 = "가까이 가야 볼 수 있습니다"');
  ok(await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-row')].slice(1, 4).every((r) => r.children[3].textContent.trim() === '')), '⑥ 멀리서는 시세 칸이 비었다(원격 시세 0)');
  await page.screenshot({ path: path.join(SHOTS, 'vv-far.png') });
  await page.keyboard.press('Escape');
  await sleep(200);
  ok(!(await page.evaluate(() => window.__vvState().open)), '⑦ Esc 로 닫힌다');
  ok(!errs.length, '페이지 오류 0', errs.slice(0, 3).join(' | '));

  // ⑧ 손잡이 끔 — 종전 게시판 판 그대로
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  await p2.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  const near2 = await enterAndGo(p2, V);
  await p2.keyboard.press('Shift+g');
  let board = false;
  for (let i = 0; i < 20 && !board; i++) { await sleep(500); board = await p2.evaluate(() => { const b = document.getElementById('boardPane'); return !!b && !b.classList.contains('hidden'); }); }
  ok(near2 === V.id && board && !(await p2.evaluate(() => { const p = document.getElementById('vvPane'); return !!p && !p.classList.contains('hidden'); })), '⑧ 손잡이 끔(기본)이면 Shift+G = 종전 게시판 판 · 마을 화면 안 열림');
  await p2.screenshot({ path: path.join(SHOTS, 'vv-knob-off.png') });

  await browser.close(); shutdown();
  console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
