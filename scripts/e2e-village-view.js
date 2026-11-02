#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) — 지금 가장 작은 묶음(A 22 · B 23 · C 26)
// === scripts/e2e-village-view.js — 마을 화면 · 메뉴 넷 실클라 E2E (T1070 · T1083 · ★T1103 서버 자료) ==========================
//
// ★무엇: 마을 중심 앞에서 Shift+G(손잡이 `?T1070_VILLAGE_VIEW=1`)로 마을 화면이 열리고 · 서버가 `villageView`(T1072 · T1084)를 보내고 ·
//   탭 넷(대시보드 · 프로젝트 · 구성원 · 창고)의 **숫자 = 서버가 보낸 값**(받은 웹소켓 프레임과 대조)이고 · 버튼이 **이미 있는 길**(납품 · 개인 사유지 ·
//   기부 · 시세 기준)을 부르고 · 시세 기준 고르기는 이름을 보이고 res id 를 보내고 · 멀어지면 서버의 바뀐 칸(`gate` · `prices`)만 와도
//   창고 시세가 "가까이 가야 볼 수 있습니다"로 바뀌고 · 닫으면 서버에 닫기를 알리고 · 글자 18px 이상 · 이모지 0 · 손잡이 끔이면 종전 게시판 판.
// ★[T1103] 임시 자료 주입 판은 **끔 판**이다 — `--fixture` 를 줄 때만 고정 자료(`test/fixtures/village-view.json` · T1072 꼴)를 시험 훅으로 넣어
//   서버 세계에 안 선 갈래(공사 줄 넷 · 침상 · 재료 가져오기)를 본다. 기본 판은 서버 자료만.
// 사진: /tmp/e2e-shots/vv-{dash,proj,mem,store}.png(1440×1080) · vv-far.png · vv-knob-off.png (`--browser webkit` 이면 앞에 `webkit-`)
//
// 실행: node scripts/e2e-village-view.js [--headed] [--browser chromium|webkit] [--fixture]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const FIXTURE = process.argv.includes('--fixture');
const BR = (() => { const i = process.argv.indexOf('--browser'); return i >= 0 ? process.argv[i + 1] : 'chromium'; })();
const PFX = BR === 'chromium' ? '' : `${BR}-`;
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-vv-central-${process.pid}.db`, ZDB = `/tmp/e2e-vv-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

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
  console.log(`\n=== 마을 화면 · 메뉴 넷 실클라 E2E (T1070 · T1103 서버 자료 · ${BR}${FIXTURE ? ' · 고정 자료 판' : ''}) ===`);
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1', VILLAGE_VIEW_MS: '1000' });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await _upP).ok, 'central 기동');
  ok((await _zp).ok, 'zone 기동');
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 60 && !rows.length; i++) { try { rows = new DatabaseSync(ZDB).prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); } catch (e) {} if (!rows.length) await sleep(1000); }
  ok(rows.length > 0, `[상황] 마을이 시딩됐다(${rows.length}곳)`);
  if (!rows.length) { shutdown(); process.exit(1); }
  const V = rows[0];

  const PW = require('playwright');
  const browser = await PW[BR].launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errs = [], sent = [], got = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => { const d = typeof f.payload === 'string' ? f.payload : ''; if (/village_deliver|village_donate|"claim"|village_view/.test(d)) { try { sent.push(JSON.parse(d)); } catch (e) {} } });
    ws.on('framereceived', (f) => { const d = typeof f.payload === 'string' ? f.payload : ''; if (d.indexOf('"village_view"') >= 0) { try { const m = JSON.parse(d); if (m.type === 'village_view') got.push(m); } catch (e) {} } });
  });
  // 서버가 보낸 칸을 클라와 같은 규칙으로 쌓는다(통째 = 갈아 끼움 · 바뀐 칸 = 그 칸만) — 화면과 대조할 "서버 값"
  const srv = () => { let raw = null; for (const m of got) { if (m.vid !== V.id) continue; if (m.full) raw = Object.assign({}, m.view); else if (raw && m.slots) Object.assign(raw, m.slots); } return raw; };
  const waitFrame = async (pred, ms) => { for (let t = 0; t < (ms || 10000) / 200; t++) { const r = srv(); if (r && pred(r)) return r; await sleep(200); } return null; };
  await page.goto(`http://localhost:${CPORT}/?T1070_VILLAGE_VIEW=1`, { waitUntil: 'domcontentloaded' });
  const near = await enterAndGo(page, V);
  ok(near === V.id, '[상황] 마을 중심 앞 — 클라가 그 마을을 근접 인식', `${near} (기대 ${V.id})`);
  // 부탁 · 소식이 서는 날까지 세계를 돌린다(자명 통과 금지 — 빈 칸끼리 같음이 아니다) · 그 뒤 날을 멈춘다
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 6, stone: 4 } }));   // 시세 기준 고르기 · 재료 가져오기에 쓸 구체 품목(내 짐)

  // ① 마을 앞에서 열기(진짜 키) → 서버 통째 한 통
  await page.keyboard.press('Shift+g');
  let S0 = await waitFrame((r) => !!r.head, 15000);
  let st = await page.evaluate(() => window.__vvState());
  ok(st.knob === true && st.open === true && st.vid === V.id, '① 마을 앞에서 Shift+G 로 마을 화면이 열린다(손잡이 켬)', JSON.stringify(st));
  ok(sent.some((m) => m.type === 'village_view' && m.vid === V.id && !('base' in m)), '① 열 때 자료를 요청한다(T1072 문 `{ type:village_view, vid }`)');
  ok(!!S0 && got.some((m) => m.vid === V.id && m.full === true && m.seq >= 1), '① 서버가 `full:true` 통째 한 통을 보냈다(T1072 villageView)', S0 ? `seq ${got.find((m) => m.full).seq} · 칸 ${Object.keys(S0).join(',')}` : '안 왔다');
  if (!S0) { await browser.close(); shutdown(); console.log(`\n=== 결과: ${pass} 통과 / ${fail + 1} 실패 ===`); process.exit(1); }
  for (let t = 0; t < 40 && !((S0.requests.rows || []).length && (S0.news.rows || []).length); t++) { await sleep(1000); S0 = srv(); }
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
  await sleep(2500);   // 멈춘 날의 바뀐 칸이 다 오도록(박자 1초)
  S0 = srv();
  ok((S0.requests.rows || []).length > 0 && (S0.news.rows || []).length > 0, '[자명 통과 금지] 서버 자료에 부탁 · 소식이 실제로 있다', `부탁 ${(S0.requests.rows || []).length} · 소식 ${(S0.news.rows || []).length} · 곳간 ${(S0.store.rows || []).length} · 공사 ${(S0.projects.now || []).length} · 사람 ${(S0.members.people || []).length}`);

  // ② 대시보드 숫자 = 서버 값
  // ★[T1083] 판 글자(캔버스 길)는 글자를 `aria-label` 에 둔다(내용은 캔버스) — 글자 읽기는 그 꼬리표 · 없으면 글자(모듈 없는 판)
  const txt = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? (e.getAttribute('aria-label') || e.textContent).trim() : null; }, sel);
  const txts = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => (e.getAttribute('aria-label') || e.textContent).trim()), sel);
  ok((await txt('#vvName')) === S0.head.name, '② 마을 이름 = 서버 `head.name`', await txt('#vvName'));
  const me = S0.me;
  if (me && !me.member) {
    ok((await txt('#vvContrib')) === `${me.contrib} / ${me.need}`, '② 머리줄 "마을 사람이 되기까지 n / m" = 서버 `me.contrib` / `me.need`', await txt('#vvContrib'));
    ok(me.left > 0 ? (await txt('#vvLeft')) === `${me.left} 더 모으면 ${S0.head.name} 사람이 될 수 있습니다.` : !(await page.$('#vvLeft')), '② 가입 안내 "n 더 모으면" = 서버 `me.left`', String(await txt('#vvLeft')));
  } else ok(!(await page.$('#vvContrib')), '② 이 마을 사람이면 가입 계량기가 없다');
  ok((await txt('#vvPop')) === `${S0.dash.pop}명`, '② 사는 사람 = 서버 `dash.pop`', await txt('#vvPop'));
  ok((await txt('#vvSeason')) === S0.head.cal.seasonKo, '② 지금은 = 서버 달력 `head.cal.seasonKo`', await txt('#vvSeason'));
  ok(S0.dash.toWinter > 0 ? (await txt('#vvToWinter')) === `겨울까지 ${S0.dash.toWinter}일 남았습니다` : !(await page.$('#vvToWinter')), '② 겨울까지 = 서버 `dash.toWinter`', String(await txt('#vvToWinter')));
  ok((await txt('#vvWorkN')) === `${S0.dash.projectsN}가지`, '② 하고 있는 일 = 서버 `dash.projectsN`', await txt('#vvWorkN'));
  const reqT = await page.evaluate(() => [...document.querySelectorAll('#vvReq .vv-req')].map((r) => { const t = r.querySelector('.vv-t'); return (t.getAttribute('aria-label') || t.textContent).trim(); }));
  ok(reqT.length === S0.requests.rows.length && reqT.every((t, i) => t === `${S0.requests.rows[i].ko} ${S0.requests.rows[i].qty}`), '② 마을의 부탁 줄 = 서버 `requests.rows`(품목 이름 · 양)', reqT.join(' · '));
  const newsT = await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-news')].map((r) => [...r.querySelectorAll('.vv-t')].map((t) => (t.getAttribute('aria-label') || t.textContent).trim())));
  ok(newsT.length === S0.news.rows.length && newsT.every((n, i) => n[1] === S0.news.rows[i].line), '② 마을 소식 줄 = 서버 `news.rows[].line`', newsT.map((n) => n[1]).slice(0, 2).join(' / '));
  ok(newsT.every((n) => /니다\.$/.test(n[1])), '② [T1103] 소식 줄 = 하십시오체(서버 `newsLine`)', newsT.length ? newsT[0][1] : '');
  ok(!(await txts('#vvBody .vv-tabbody[data-k="dash"] .vv-t')).some((t) => /기여 \+|어제보다|오름|내림/.test(t)), '② 서버에 없는 칸(기여 +n · 어제보다)을 지어내지 않는다');
  await page.screenshot({ path: path.join(SHOTS, `${PFX}vv-dash.png`) });

  // ③ 버튼 — 이미 있는 길만(품목은 res id)
  sent.length = 0;
  await page.click('#vvReq [data-vv="give"]');
  if (me && !me.member) await page.click('[data-vv="claim"]');
  await sleep(500);
  ok(sent.some((m) => m.type === 'village_deliver' && m.vid === V.id && m.item === S0.requests.rows[0].res), '③ "가진 것 주기" = 그 부탁의 납품(`village_deliver` + 품목 res id — 게시판 줄 버튼과 같은 문)', JSON.stringify(sent.filter((m) => m.type === 'village_deliver')));
  if (me && !me.member) ok(sent.some((m) => m.type === 'claim' && m.kind === 'personal'), '③ "내 땅 정하기" = 개인 사유지(`claim` personal — C 키와 같은 문 · T45)');

  // ④ 탭 넷
  const tab = async (k) => { await page.click(`.vv-tab[data-k="${k}"]`); await sleep(300); return page.evaluate(() => window.__vvState().tab); };
  const KN = { house: 1, phouse: 1, clear: 1, caravan: 1 };
  ok((await tab('proj')) === 'proj', '④ 프로젝트 탭');
  const projK = await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-tabbody[data-k="proj"] .vv-proj')].map((c) => c.dataset.kind));
  const wantK = (S0.projects.now || []).filter((q) => KN[q.kind]).map((q) => q.kind);
  ok(JSON.stringify(projK) === JSON.stringify(wantK), '④ 하고 있는 일 카드 = 서버 `projects.now`(종류 · 순서)', projK.join(',') || '(없음)');
  const doneT = await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-done')].map((r) => { const t = r.querySelector('.vv-t'); return (t.getAttribute('aria-label') || t.textContent).trim(); }));
  ok(doneT.length === (S0.projects.done || []).length && doneT.every((t, i) => t === S0.projects.done[i].line), '④ 끝낸 일 = 서버 `projects.done[].line`', String(doneT.length));
  await page.screenshot({ path: path.join(SHOTS, `${PFX}vv-proj.png`) });
  ok((await tab('mem')) === 'mem', '④ 구성원 탭');
  const ppl = S0.members.people || [];
  const memNames = await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-tabbody[data-k="mem"] .vv-person')].map((c) => { const t = c.querySelector('.vv-t'); return (t.getAttribute('aria-label') || t.textContent).trim(); }));
  const nm = (x) => String(x || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();   // NPC 몸 이름의 '🤖' 표지는 화면에서 뺀다(이모지 0 · 회부)
  ok(memNames.length === Math.min(16, ppl.length) && memNames.every((n, i) => n === nm(ppl[i].name)), '④ 사람 칸 = 서버 `members.people`(이름 · 처음 16 · 그림 글자 표지만 뺌)', `${memNames.length}/${ppl.length} · ${memNames.slice(0, 3).join(' · ')}`);
  ok((await txt('#vvMemN')) === `${S0.members.n}명` || (await txt('#vvMemN')).startsWith(`${S0.members.n}명`), '④ 함께 사는 사람 = 서버 `members.n`', await txt('#vvMemN'));
  ok(ppl.length > 16 ? await page.evaluate((n) => { const b = document.querySelector('[data-vv="more"]'); return !!b && (b.getAttribute('aria-label') || b.textContent).includes(`${n}명 더 보기`); }, ppl.length - 16) : !(await page.$('[data-vv="more"]')), '④ "n명 더 보기" = 서버 사람 수 − 보인 수(16 이하면 없음)');
  await page.screenshot({ path: path.join(SHOTS, `${PFX}vv-mem.png`) });

  ok((await tab('store')) === 'store', '④ 창고 탭');
  S0 = srv();   // 가진 것 주기(③)로 곳간이 움직였다 — 지금 서버 값과 대조
  const storeT = await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-tabbody[data-k="store"] .vv-store')].map((r) => [...r.children].map((c) => { const t = c.matches('.vv-t') ? c : c.querySelector('.vv-t'); return t ? (t.getAttribute('aria-label') || t.textContent).trim() : ''; })));
  ok(storeT.length === S0.store.rows.length && storeT.every((r, i) => r[0] === S0.store.rows[i].ko && r[1] === String(S0.store.rows[i].qty)), '④ 곳간 줄 = 서버 `store.rows`(품목 이름 · 양)', storeT.map((r) => `${r[0]} ${r[1]}`).slice(0, 4).join(' · '));
  const P0 = S0.prices || {};
  const basisB = await page.evaluate(() => [...document.querySelectorAll('[data-vv="base"]')].map((b) => ({ res: b.dataset.b, label: b.getAttribute('data-label') })));
  ok(basisB.length === (P0.basis || []).length && basisB.every((b, i) => b.res === P0.basis[i].res && b.label === P0.basis[i].ko), '④ 시세 기준 단추 = 서버 `prices.basis`(보이는 것 = 이름 · 단추 값 = res id)', basisB.map((b) => `${b.label}=${b.res}`).join(' · '));
  ok(P0.pick ? !!(await page.$('#vvPick')) && storeT.every((r) => r[3] === '') : true, '④ 기준이 뭉뚱그린 품목이면(서버 `pick`) 시세 수 없이 "기준을 고르면" 안내', P0.pick ? 'pick' : `기준 ${P0.numeraireKo}`);
  // 시세 기준 고르기 — 이름을 누르면 res id 가 가고, 서버가 그 기준으로 통째 다시 보낸다
  const pickB = basisB.find((b) => b.res === 'wood') || basisB[0];
  ok(!!pickB, '[상황] 내 짐에 기준으로 고를 구체 품목이 있다', pickB ? pickB.label : '없음');
  if (pickB) {
    sent.length = 0; const n0 = got.length;
    await page.click(`[data-vv="base"][data-b="${pickB.res}"]`);
    let S1 = null;
    for (let t = 0; t < 50 && !S1; t++) { await sleep(200); if (got.slice(n0).some((m) => m.full && m.view && m.view.prices && m.view.prices.numeraire === pickB.res)) S1 = srv(); }
    ok(sent.some((m) => m.type === 'village_view' && m.vid === V.id && m.numeraire === pickB.res && !('base' in m)), '② 시세 기준 고르기 = `{ type:village_view, vid, numeraire: res id }`(T1072 문 · 한국어 이름이 아니다)', JSON.stringify(sent.filter((m) => m.type === 'village_view')));
    ok(!!S1 && S1.prices.numeraire === pickB.res && Array.isArray(S1.prices.rows), '② 서버가 그 기준으로 통째 다시 보냈다', S1 ? `${S1.prices.numeraireKo} 기준 · ${S1.prices.rows.length}줄` : '안 왔다');
    await sleep(400);
    const hdr = await page.evaluate(() => { const r = document.querySelector('#vvBody .vv-tabbody[data-k="store"] .vv-row'); const t = r && r.children[3]; return t ? (t.getAttribute('aria-label') || t.textContent).trim() : ''; });
    ok(!!S1 && hdr === `시세 (${S1.prices.numeraireKo} 기준)`, '② 시세 머리 = 서버 `prices.numeraireKo`(이름)', hdr);
    const storeP = await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-tabbody[data-k="store"] .vv-store')].map((r) => { const t = r.children[3].querySelector('.vv-t'); return t ? (t.getAttribute('aria-label') || t.textContent).trim() : ''; }));
    const pr = {}; for (const r of (S1 && S1.prices.rows) || []) pr[r.res] = r.num;
    const wantP = (S1 ? S1.store.rows : []).map((r) => (pr[r.res] != null ? String(pr[r.res]) : ''));
    ok(!!S1 && JSON.stringify(storeP) === JSON.stringify(wantP) && wantP.some((x) => x !== ''), '② 곳간 줄 시세 = 서버 `prices.rows[].num`(그 품목 줄 · 클라 환산 0)', storeP.slice(0, 5).join(' · '));
    ok(await page.evaluate((r) => { const b = document.querySelector(`[data-vv="base"][data-b="${r}"]`); return !!b && b.dataset.main === '1'; }, pickB.res), '② 고른 기준 단추가 주 버튼으로 표시된다');
  }
  await page.screenshot({ path: path.join(SHOTS, `${PFX}vv-store.png`) });

  // ⑤ 글자 18px 이상 · 이모지 0(네 탭 다)
  const sizes = [];
  for (const k of ['dash', 'proj', 'mem', 'store']) {
    await tab(k);
    sizes.push(await page.evaluate(() => {
      const out = { min: 99, minText: '', emoji: [] };
      const see = (t, fs) => { t = (t || '').trim(); if (!t) return; if (fs < out.min) { out.min = fs; out.minText = t.slice(0, 20); } if (/\p{Extended_Pictographic}/u.test(t)) out.emoji.push(t.slice(0, 20)); };
      for (const e of document.querySelectorAll('#vvPane .vv-t')) see(e.getAttribute('aria-label') || e.textContent, parseFloat(getComputedStyle(e).fontSize));
      const w = document.createTreeWalker(document.getElementById('vvPane'), NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) see(n.textContent, parseFloat(getComputedStyle(n.parentElement).fontSize));
      return out;
    }));
  }
  ok(sizes.every((s) => s.min >= 18), '⑤ 본문 18px 아래 0(네 탭)', sizes.map((s) => `${s.min}px「${s.minText}」`).join(' · '));
  ok(sizes.every((s) => !s.emoji.length), '⑤ 이모지 0(네 탭)', sizes.map((s) => s.emoji.join('|')).join(' '));

  // ⑥ 멀어지면 — 서버가 바뀐 칸(`gate` · `prices`)만 보내고 화면이 그 칸만으로 바뀐다(원격 시세 0)
  await tab('store');
  await page.evaluate(() => { document.getElementById('vvName').dataset.keep = '1'; });   // 머리 판 표지 — 바뀐 칸(`gate` · `prices`)엔 머리를 다시 짓지 않는다
  const nf = got.length;
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16 + 4000, V.cy * 32 + 16]);
  let far = false;
  for (let i = 0; i < 20 && !far; i++) { await sleep(800); far = await page.evaluate(() => window.__evNearVid == null); if (!far) await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16 + 4000, V.cy * 32 + 16]); }
  let dFar = null;
  for (let t = 0; t < 50 && !dFar; t++) { dFar = got.slice(nf).find((m) => m.vid === V.id && m.full === false && m.slots && m.slots.prices && m.slots.prices.none === 'far') || null; if (!dFar) await sleep(200); }
  await sleep(400);
  ok(far, '[상황] 마을 중심에서 멀어졌다(근접 없음)');
  ok(!!dFar && Object.keys(dFar.slots).every((k) => k === 'gate' || k === 'prices') && dFar.slots.gate && dFar.slots.gate.near === false, '⑥ 서버는 바뀐 칸(`gate` · `prices`)만 보냈다(`full:false`)', dFar ? `seq ${dFar.seq} · ${Object.keys(dFar.slots).join(',')}` : '안 왔다');
  ok(await page.evaluate(() => { const e = document.getElementById('vvFar'); return !!e && /가까이 가야 볼 수 있습니다/.test([...e.querySelectorAll('.vv-t')].map((t) => t.getAttribute('aria-label') || t.textContent).join(' ') || e.textContent); }), '⑥ 멀리서는 창고 시세 = "가까이 가야 볼 수 있습니다"');
  ok(await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-tabbody[data-k="store"] .vv-store')].every((r) => !r.children[3].querySelector('.vv-t') && r.children[3].textContent.trim() === '')), '⑥ 멀리서는 시세 칸이 비었다(원격 시세 0)');
  ok((await txt('#vvName')) === S0.head.name && (await page.evaluate(() => window.__vvState().data)), '⑥ 바뀐 칸만 받아도 나머지 칸은 그대로다(자료가 비지 않는다 — 칸 단위 교체)', await txt('#vvName'));
  {
    const ks = got.slice(nf).filter((m) => m.vid === V.id && !m.full).map((m) => Object.keys(m.slots));
    const headTouched = ks.some((k) => k.includes('head') || k.includes('me'));
    ok(headTouched || (await page.evaluate(() => { const e = document.getElementById('vvName'); return !!e && e.dataset.keep === '1'; })), '⑥ [T1103] 머리가 읽는 칸이 안 바뀌면 머리 판을 다시 짓지 않는다(판 글자 다시 그리기 0 — 바뀐 칸을 읽는 판만)', ks.map((k) => k.join('+')).join(' · '));
  }
  await page.screenshot({ path: path.join(SHOTS, `${PFX}vv-far.png`) });
  sent.length = 0;
  await page.keyboard.press('Escape');
  await sleep(300);
  ok(!(await page.evaluate(() => window.__vvState().open)), '⑦ Esc 로 닫힌다');
  ok(sent.some((m) => m.type === 'village_view_close'), '⑦ 닫으면 서버에 닫기를 알린다(`village_view_close` · 바뀐 칸을 그만 받는다)');
  const nc = got.length; await sleep(2500);
  ok(!got.slice(nc).some((m) => m.vid === V.id), '⑦ 닫은 뒤로는 서버가 칸을 안 보낸다', `${got.length - nc}통`);

  // ⑨ 고정 자료 판(끔 판 · `--fixture`) — 서버 세계에 안 선 갈래를 고정 자료(T1072 꼴)로
  if (FIXTURE) {
    const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'village-view.json'), 'utf8'));
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16, V.cy * 32 + 16]);
    for (let i = 0; i < 20 && (await page.evaluate(() => window.__evNearVid)) !== V.id; i++) await sleep(600);
    await page.evaluate((vid) => openVillageView(vid), V.id);
    await sleep(1500);   // 연 요청의 서버 통째가 먼저 오고 나서(그 뒤에 넣어야 덮이지 않는다) · 서버 쪽은 닫아 바뀐 칸이 더 안 오게
    await page.evaluate(([vid, m]) => { window.__sendPrimary({ type: 'village_view_close' }); window.__vvInject(Object.assign({}, m, { vid, seq: 99, full: true, view: Object.assign({}, m.view, { head: Object.assign({}, m.view.head, { vid }) }) })); }, [V.id, FX]);
    await tab('proj');
    const names = await page.evaluate(() => [...document.querySelectorAll('#vvBody .vv-tabbody[data-k="proj"] .vv-proj')].map((c) => { const t = c.querySelector('.vv-t'); return (t.getAttribute('aria-label') || t.textContent).trim(); }));
    ok(JSON.stringify(names) === JSON.stringify(['움집 짓기', '갈매가 맡긴 움집', '밭 일구기', '임업2로 가는 행상']), '⑨ 공사 줄 넷 — 이름은 서버 `kind` 로(서버가 이름을 안 싣는다 · 설계 §3)', names.join(' · '));
    ok((await txts('#vvBody .vv-tabbody[data-k="proj"] .vv-t')).includes('다 지으면 침상이 6 늘어납니다.'), '⑨ 집터 `bedsGain` → "다 지으면 침상이 n 늘어납니다."(T1084)');
    sent.length = 0;
    await page.click('[data-vv="bring"]');
    await sleep(400);
    ok(sent.some((m) => m.type === 'village_donate' && m.want && m.want.wood === 2), '⑨ "재료 가져오기" = 기부(`village_donate`) · 서버 `give` 키(내 물건 id)로 · 모자란 만큼(4 − 2)', JSON.stringify(sent.filter((m) => m.type === 'village_donate')));
    await page.evaluate(() => closeVillageView());
  }
  ok(!errs.length, '페이지 오류 0', errs.slice(0, 3).join(' | '));

  // ⑧ 손잡이 끔 — 종전 게시판 판 그대로
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  await p2.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  const near2 = await enterAndGo(p2, V);
  await p2.keyboard.press('Shift+g');
  let board = false;
  for (let i = 0; i < 20 && !board; i++) { await sleep(500); board = await p2.evaluate(() => { const b = document.getElementById('boardPane'); return !!b && !b.classList.contains('hidden'); }); }
  ok(near2 === V.id && board && !(await p2.evaluate(() => { const p = document.getElementById('vvPane'); return !!p && !p.classList.contains('hidden'); })), '⑧ 손잡이 끔(기본)이면 Shift+G = 종전 게시판 판 · 마을 화면 안 열림');
  await p2.screenshot({ path: path.join(SHOTS, `${PFX}vv-knob-off.png`) });

  await browser.close(); shutdown();
  console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
