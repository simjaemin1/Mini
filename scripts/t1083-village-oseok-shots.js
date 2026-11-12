#!/usr/bin/env node
// === scripts/t1083-village-oseok-shots.js — 마을 화면 오석 판 · 사진 · 프레임 값 자 (T1083) ======================================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 무변 — 레포 서버 · 클라를 그대로 띄운다(e2e-village-view 와 같은 기동 · ★[T1103] 서버 자료).
// 화면 크기 둘(1440×900 · 1280×720 — T1083 카드) × 탭 넷 사진 + 값:
//   · 판 열 때 — Shift+G 부터 서버 자료가 와 판 글자까지 다 그린 때까지(ms · 왕복 + 그리기 + 입히기) · 입히기만(`vvSkinMs`) — ★[T1103] 서버 자료
//   · 탭 바꿀 때 — 탭 누름부터 그린 뒤 첫 프레임까지(ms) · 입히기만
//   · 열린 동안 — 3초 동안 rAF 간격 p50 · p95 · max(판 열림) ↔ 같은 자리 판 닫힘
// 실행: node scripts/t1083-village-oseok-shots.js [--browser chromium|webkit] [--out <dir>]
//   사진 → <out>/<browser>-<W>x<H>-<tab>.png · 값 → <out>/<browser>-values.json(기본 out = /tmp/t1083)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BR = arg('--browser', 'chromium'), OUT = arg('--out', '/tmp/t1083');
fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1083-c-${process.pid}.db`, ZDB = `/tmp/t1083-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', shutdown);
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2) : null; };

(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  const { DatabaseSync } = require('node:sqlite');
  let rows = []; for (let i = 0; i < 60 && !rows.length; i++) { try { rows = new DatabaseSync(ZDB).prepare('SELECT id, cx, cy FROM villages WHERE zone = ?').all('hanbando'); } catch (e) {} if (!rows.length) await sleep(1000); }
  const V = rows[0];
  const PW = require('playwright');
  const browser = await PW[BR].launch();
  const out = { browser: BR, version: browser.version(), sizes: [] };
  for (const [W, H] of [[1440, 900], [1280, 720]]) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`http://localhost:${CPORT}/?T1070_VILLAGE_VIEW=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
    await page.click('#enter').catch(() => {});
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
    let near = null;
    for (let t = 0; t < 25 && near !== V.id; t++) { await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16, V.cy * 32 + 16]); await sleep(1200); near = await page.evaluate(() => window.__evNearVid); }
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
    await page.evaluate(() => (typeof Oseok !== 'undefined' ? Oseok.ready() : null));   // 글꼴을 먼저 받아 둔다(첫 열기 값에 글꼴 받기가 안 섞이게)
    const rafStats = () => page.evaluate(() => new Promise((res) => { const d = []; let last = performance.now(); const t0 = last; const f = (t) => { d.push(t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); }));
    const closed = await rafStats();
    // 판 열 때: Shift+G → 서버 자료(★[T1103] 임시 자료 아님 · 왕복 포함) → 다 그린 뒤 첫 프레임
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_give', items: { wood: 6, stone: 4 } }));
    const openMs = await page.evaluate(async () => {
      vvNum = 'wood';   // 시세 기준 = 나무(열 때 그 기준으로 요청 — 창고 사진에 시세가 서게)
      const t0 = performance.now();
      openVillageView(window.__evNearVid);   // Shift+G 가 부르는 그 함수(키 들이기는 e2e-village-view 가 진짜 키로 본다)
      for (let i = 0; i < 500 && !window.__vvState().data; i++) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { total: +(performance.now() - t0).toFixed(1), skin: +vvSkinMs.toFixed(1), open: window.__vvState().open };
    });
    const tabs = [];
    for (const k of ['dash', 'proj', 'mem', 'store']) {
      const r = await page.evaluate(async (kk) => {
        const t0 = performance.now(); const b = document.querySelector(`.vv-tab[data-k="${kk}"]`); b.click();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const T = document.querySelectorAll('#vvPane .vv-t').length, cv = document.querySelectorAll('#vvPane canvas').length;
        return { tab: kk, total: +(performance.now() - t0).toFixed(1), skin: +vvSkinMs.toFixed(1), texts: T, canvases: cv };
      }, k);
      await sleep(400);
      await page.screenshot({ path: path.join(OUT, `${BR}-${W}x${H}-${k}.png`) });
      tabs.push(r);
    }
    // 둘째 바꾸기 — 지어 둔 판을 보이기만(자료가 안 바뀌면 다시 안 그린다 · ★[T1083])
    const tabs2 = [];
    for (const k of ['dash', 'proj', 'mem', 'store']) tabs2.push(await page.evaluate(async (kk) => { const t0 = performance.now(); document.querySelector(`.vv-tab[data-k="${kk}"]`).click(); await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); return { tab: kk, total: +(performance.now() - t0).toFixed(1), skin: +vvSkinMs.toFixed(1) }; }, k));
    await page.evaluate(() => { const b = document.querySelector('.vv-tab[data-k="dash"]'); b.click(); });
    await sleep(300);
    const opened = await rafStats();
    const S = (d) => ({ n: d.length, p50: q(d, 0.5), p95: q(d, 0.95), max: +Math.max(...d).toFixed(2) });
    out.sizes.push({ W, H, open: openMs, tabs, tabs2, rafOpen: S(opened), rafClosed: S(closed) });
    console.log(`${BR} ${W}x${H} · 열기 ${openMs.total}ms(입히기 ${openMs.skin}) · 탭 ${tabs.map((t) => `${t.tab} ${t.total}/${t.skin}ms`).join(' · ')} · 둘째 ${tabs2.map((t) => `${t.tab} ${t.total}/${t.skin}ms`).join(' · ')} · rAF 열림 p50 ${S(opened).p50} p95 ${S(opened).p95} max ${S(opened).max} ↔ 닫힘 p50 ${S(closed).p50} p95 ${S(closed).p95} max ${S(closed).max}`);
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, `${BR}-values.json`), JSON.stringify(out, null, 1));
  await browser.close(); shutdown(); process.exit(0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
