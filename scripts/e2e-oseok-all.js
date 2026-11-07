#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly B   ← 야간 세 밤 분할(T238)
// === scripts/e2e-oseok-all.js — 오석 판을 화면 전체에 · 실클라 E2E (T1124 · ★재민 11-02 · 11-03) ==================================
//
// ★무엇: 손잡이 `?T1124_OSEOK_ALL=1` 이면 판 여섯 — 로비 · HUD 위쪽 줄 · 가방 · 제작(옆 판) · 게시판 · 알림 — 이 오석 판(모듈 무늬 · 모따기)이고 ·
//   판 안 글자는 18px 아래 0 · 이모지 0 · 판 글자 대비(사진) WCAG AA 위 · 페이지 오류 0 · 판을 연 동안 프레임 = 닫힘과 같은 띠.
//   손잡이 끔(기본)이면 먹선 그대로(`os-all` 0 · 판 무늬 0).
// 사진: <out>/<browser>-<on|off>-<판>.png (기본 /tmp/e2e-shots/oseok-all)
// 실행: node scripts/e2e-oseok-all.js [--browser chromium|webkit] [--out <dir>]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)
const BD = require('./browser-driver');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BR = arg('--browser', 'chromium'), OUT = arg('--out', '/tmp/e2e-shots/oseok-all');
fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-osa-central-${process.pid}.db`, ZDB = `/tmp/e2e-osa-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(cmd, args, env) { const p = spawn(cmd, args, { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; }
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

// 판 하나를 쪽 안에서 잰다 — 판 겉 · 무늬 · 글자 크기 · 이모지 · 사진 대비 자리
const PROBE = (sel) => `(() => {
  const r = document.querySelector(${JSON.stringify(sel)});
  if (!r) return { found: false };
  const cs = getComputedStyle(r), rc = r.getBoundingClientRect();
  const out = { found: true, visible: rc.width > 0 && rc.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden', plate: r.classList.contains('os-plate'),
    img: cs.backgroundImage.slice(0, 120), min: 99, minText: '', emoji: [], n: 0, texts: [], rect: [rc.left, rc.top, rc.width, rc.height] };
  const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const e = n.parentElement, ecs = getComputedStyle(e); if (ecs.display === 'none' || ecs.visibility === 'hidden' || !e.getClientRects().length) continue;
    const fs = parseFloat(ecs.fontSize); out.n++;
    if (fs < out.min) { out.min = fs; out.minText = t.slice(0, 18); }
    if (/\\p{Extended_Pictographic}/u.test(t)) out.emoji.push(t.slice(0, 18));
    const g = document.createRange(); g.selectNodeContents(n); for (const b of g.getClientRects()) if (b.width > 2 && b.height > 2 && b.top >= 0 && b.left >= 0) out.texts.push([b.left, b.top, b.width, b.height]);
  }
  out.texts = out.texts.slice(0, 120);
  return out;
})()`;
const RAF = `new Promise((res) => { const d = []; let last = performance.now(); const t0 = last; const f = (t) => { d.push(t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); })`;
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(1) : null; };
const S = (d) => `${q(d, 0.5)} / ${q(d, 0.95)} / ${Math.max(...d).toFixed(1)}`;

(async () => {
  console.log(`\n=== 오석 판 화면 전체 실클라 E2E (T1124 · ${BR}) ===`);
  const _central = boot(process.execPath, [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await _upP).ok, 'central 기동');
  ok((await _zp).ok, 'zone 기동');
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 60 && !rows.length; i++) { try { rows = new DatabaseSync(ZDB).prepare('SELECT id, cx, cy FROM villages WHERE zone = ?').all('hanbando'); } catch (e) {} if (!rows.length) await sleep(1000); }
  ok(rows.length > 0, `[상황] 마을이 시딩됐다(${rows.length}곳)`);
  if (!rows.length) { shutdown(); process.exit(1); }
  const V = rows[0];
  const D = await BD.open(BR, boot);
  const vals = { browser: BR, version: null, on: {}, off: {} };

  for (const mode of ['off', 'on']) {
    console.log(`\n── 손잡이 ${mode === 'on' ? '켬' : '끔'} ──`);
    const pg = await D.page(1440, 900);
    vals.version = D.version;
    // ★[T1208] 게시판 판은 종전 판(`#boardPane`)을 잰다 — 마을 화면(`T1070_VILLAGE_VIEW` · T1137 켬 기본)이면 Shift+G 가 그 화면을 연다(아래 게시판 줄 주석 그대로 끔에 묶는다).
    await pg.goto(`http://localhost:${CPORT}/?T1070_VILLAGE_VIEW=0${mode === 'on' ? '&T1124_OSEOK_ALL=1' : ''}`);
    await pg.ev(`(() => { window.__osaErr = []; window.addEventListener('error', (e) => window.__osaErr.push(String(e.message).slice(0, 160))); return 1; })()`);
    for (let i = 0; i < 120 && !(await pg.ev(`(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); })()`)); i++) await sleep(500);
    await pg.ev('(typeof Oseok !== "undefined" ? Oseok.ready().then(() => 1) : 0)');
    await sleep(600);
    const shots = [];
    // 판 하나 재고 찍기
    const judge = async (name, sel) => {
      await sleep(500);
      const P = await pg.ev(PROBE(sel));
    P.texts = P.texts.filter(([x, y, w, h]) => x >= P.rect[0] && y >= P.rect[1] && x + w <= P.rect[0] + P.rect[2] + 1 && y + h <= P.rect[1] + P.rect[3] + 1);   // 판 안에 보이는 글자만(넘쳐 가려진 줄 · 판 밖 0)
      const f = path.join(OUT, `${BR}-${mode}-${name}.png`); await pg.shot(f);
      let con = null;
      if (P.found && P.texts.length) con = BD.contrastFree(f, { plates: [P.rect], texts: P.texts, dpr: await pg.ev('devicePixelRatio') });
      vals[mode][name] = { visible: P.visible, plate: P.plate, min: P.min, n: P.n, emoji: P.emoji.length, contrast: con };
      shots.push(name);
      if (mode === 'on') {
        ok(P.found && P.visible, `[상황] ${name} 판이 보인다`, sel);
        ok(P.plate && /plate/.test(P.img), `① ${name} = 오석 판(모듈 판 겉 \`os-plate\` · 무늬 \`plate\`)`, P.img.slice(0, 60));
        ok(P.n > 0 && P.min >= 18, `② ${name} 판 안 글자 18px 아래 0`, `${P.n}마디 · 가장 작은 ${P.min}px「${P.minText}」`);
        ok(!P.emoji.length, `② ${name} 이모지 0`, P.emoji.join('|'));
        ok(con != null && con >= 4.5, `② ${name} 판 글자 대비 ≥ 4.5(AA) — 사진`, String(con));
      } else {
        ok(P.found && !P.plate && !/plate/.test(P.img), `⑧ 끔 — ${name} 은 먹선 그대로(판 겉 · 무늬 0)`, P.img.slice(0, 40));
      }
      return P;
    };
    if (mode === 'on') ok(await pg.ev(`document.documentElement.classList.contains('os-all') && !!document.getElementById('oseok-all-style')`), '① 손잡이 켬 — 화면 전체 층이 붙었다(`html.os-all`)');
    else ok(await pg.ev(`!document.documentElement.classList.contains('os-all') && !document.getElementById('oseok-all-style')`), '⑧ 손잡이 끔(기본) — 화면 전체 층 없음(먹선)');
    await judge('로비', '#lobby .lobby-card');
    if (mode === 'on') ok(/ground/.test(await pg.ev(`getComputedStyle(document.getElementById('lobby')).backgroundImage`)), '① 로비 바닥 = 오석 바닥(모듈 `ground`)');
    // 들어가서 마을 앞
    await pg.ev(`(() => { document.getElementById('enter').click(); return 1; })()`);
    for (let i = 0; i < 120 && !(await pg.ev('!!(window.__getMyAbs && window.__getMyAbs())')); i++) await sleep(500);
    let near = null;
    for (let t = 0; t < 30 && near !== V.id; t++) { await pg.ev(`(() => { window.__sendPrimary({ type: 'teleport_debug', x: ${V.cx * 32 + 16}, y: ${V.cy * 32 + 16} }); return 1; })()`); await sleep(1200); near = await pg.ev('window.__evNearVid'); }
    ok(near === V.id, '[상황] 마을 중심 앞', String(near));
    await pg.ev(`(() => { window.__sendPrimary({ type: '__e2e_day_freeze', on: true }); window.__sendPrimary({ type: '__e2e_give', items: { wood: 6, stone: 4 } }); return 1; })()`);
    await sleep(1200);
    await judge('HUD 위쪽 줄', '#hud > .hud-row:first-child');
    const closed = await pg.ev(RAF);
    // 가방(I) — 열 때 · 열린 동안
    const tInv = await pg.ev(`(async () => { const t0 = performance.now(); toggleInv(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return +(performance.now() - t0).toFixed(1); })()`);
    await sleep(500);
    ok(await pg.ev(`document.getElementById('invDropdown').classList.contains('open')`), `[상황] 가방이 열렸다(I 와 같은 함수 \`toggleInv\`)`);
    await judge('가방', '#invDropdown');
    const opened = await pg.ev(RAF);
    await pg.ev('(() => { toggleInv(); return 1; })()');
    await sleep(400);
    // 제작(K 와 같은 함수 `toggleSide('craft')` — 진짜 키는 로비 입력칸에 초점이 남아 그리로 간다)
    await pg.ev(`(() => { toggleSide('craft'); return 1; })()`);
    await sleep(700);
    ok(await pg.ev(`document.getElementById('sidePanel').classList.contains('open')`), '[상황] 제작 판이 열렸다(K 와 같은 함수)');
    await judge('제작', '#sidePanel');
    await pg.ev(`(() => { toggleSide('craft'); return 1; })()`);
    await sleep(400);
    // 게시판(Shift+G · 마을 화면 손잡이 끔 = 종전 게시판 판)
    await pg.key('g', true);
    for (let i = 0; i < 20 && !(await pg.ev(`(() => { const b = document.getElementById('boardPane'); return !!b && !b.classList.contains('hidden'); })()`)); i++) await sleep(400);
    await judge('게시판', '#boardPane');
    await pg.ev(`(() => { if (typeof closeBoardPane === 'function') closeBoardPane(); return 1; })()`);
    // 알림
    await pg.ev(`(() => { showNotice('오석 판 알림 시험입니다. 이 줄은 화면 위 가운데에 섭니다.', 8000); return 1; })()`);
    await judge('알림', '#notice');
    const errs = await pg.ev('window.__osaErr || []');
    ok(!errs.length, `${mode === 'on' ? '③' : '⑧'} 페이지 오류 0`, errs.slice(0, 3).join(' | '));
    vals[mode].frames = { invOpenMs: tInv, rafOpen: S(opened), rafClosed: S(closed), p50Open: q(opened, 0.5), p50Closed: q(closed, 0.5) };
    if (mode === 'off') console.log(`    (먹선) 가방 열 때 ${tInv}ms · 열린 동안 rAF p50/p95/max ${S(opened)} ↔ 닫힘 ${S(closed)}`);
    if (mode === 'on') {
      const st = await pg.ev('window.__osaStats()');
      vals.on.floor = st;
      console.log(`    가방 열 때 ${tInv}ms · 열린 동안 rAF p50/p95/max ${S(opened)} ↔ 닫힘 ${S(closed)} · 글자 바닥 덧씀 ${st.floored}칸 · ${st.passes}번 · ${st.ms}ms`);
      ok(q(opened, 0.5) <= q(closed, 0.5) * 1.5 + 1, '② 가방을 연 동안 프레임 = 닫힘과 같은 띠(p50)', `${q(opened, 0.5)} ↔ ${q(closed, 0.5)}`);
    }
    await pg.close();
  }
  fs.writeFileSync(path.join(OUT, `${BR}-values.json`), JSON.stringify(vals, null, 1));
  await D.close(); shutdown();
  console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
