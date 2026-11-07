#!/usr/bin/env node
// === scripts/e2e-t1163-welcome-sig.js — 실클라: 로비 지형 서명을 접속 주소에 싣고 welcome 지형이 빠지나 (T1163) ===========
//
// ★왜 [T1163] 단위 하네스(`test-t1163-welcome-sig`)는 서버만 본다 — 브라우저가 **같은 서명을 내는가**(JSON 글자 · 섞기 — node 와 브라우저)
//   · 선로딩 뒤 실제로 주소에 싣는가 · 지형이 빠진 welcome 으로 들어가 그 지형이 서 있나는 실클라만 안다.
// ★재는 것(central + 한반도 · 하네스 꼴 · Chromium):
//   ⓐ 로비 선로딩 뒤 클라 `_t1163Hf.hanbando` = node 가 같은 파일로 센 서명(서명 정본 한 파일 · 엔진 둘)
//   ⓑ 입장 — 주 소켓 주소에 `hf=<그 서명>` · 받은 welcome 에 지형 0 · hfHit 1(켬) / 지형 있음(끔 대조) · welcome 프레임 바이트
//   ⓒ 들어갔다(`__inWorld`) · 그 존이 적용 존으로 적혔다 · 로비 지형이 그대로 서 있다(강 수 = 파일)
//   ⓓ 새로고침 재접속(게스트 열쇠) — 다시 지형 0(켬)
// 실행: node scripts/e2e-t1163-welcome-sig.js [--off] [--shots <dir>]   (--off = 손잡이 끔 대조판)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const TS = require(path.join(ROOT, 'public', 'terrain-sig.js'));
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const argv = process.argv.slice(2);
const OFF = argv.includes('--off');
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const CPORT = 3010, Z = ZONES.hanbando;
const FILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8'));
const HF = TS.terrainSig(FILE.hanbando);
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KB = (n) => (n / 1024).toFixed(1);

(async () => {
  console.log(`\n=== T1163 실클라 welcome 지형 서명 — ${OFF ? '끔(대조)' : '켬'} · 파일 서명 ${HF} ===`);
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-t1163-'));
  const procs = [];
  const sp = (name, file, e) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'pipe'] });
    p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); }); procs.push(p); return p; };
  let browser = null;
  try {
    const c = sp('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${D}/c.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
    const z = sp('hanbando', 'zone.js', { PORT: String(Z.port), ZONE_ID: 'hanbando', DB_PATH: `${D}/z.db`, CENTRAL_URL: `http://localhost:${CPORT}`, PUBLIC_HOST: 'localhost',
      ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T1163_WELCOME_SIG: OFF ? '0' : '1' });
    const zu = await FB.waitUp(z, /zone server up on/, { name: 'hanbando', capMs: 600000 });
    ok(cu.ok && zu.ok, '전제: central · 한반도 기동');
    for (let i = 0; i < 60; i++) { try { const r = await (await fetch(`http://localhost:${CPORT}/zones`, { signal: AbortSignal.timeout(5000) })).json(); const h = (r.zones || {}).hanbando || {}; if (h.population != null) break; } catch (e) {} await sleep(1000); }

    browser = await require('./e2e-browser').launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const W = [];   // { url, bytes, keys, hfHit, ht }
    page.on('websocket', (ws) => {
      const url = ws.url();
      ws.on('framereceived', (f) => { const s = typeof f.payload === 'string' ? f.payload : String(f.payload);
        if (s.length < 20 || s.indexOf('"type":"welcome"') < 0) return;
        let m = null; try { m = JSON.parse(s); } catch (e) { return; }
        if (m.type !== 'welcome') return;
        W.push({ url, bytes: Buffer.byteLength(s), observer: !!m.observer, hfHit: m.hfHit, ht: !!m.hardcodedTerrain, keys: Object.keys(m).length });
      });
    });
    const enter = async () => {
      await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
      let hf = null;
      for (let i = 0; i < 120 && !hf; i++) { hf = await page.evaluate(() => (typeof _t1163Hf !== 'undefined' && _t1163Hf.hanbando) || null); if (!hf) await sleep(500); }
      const btn = await page.$('#enter'); if (btn) await btn.click();
      const inW = !!(await require('./fixture-clock.js').waitInWorld(page, { timeoutMs: 60000 })).ok;   // ★[PM land1048] 입장 기다리기 정본(test-harness-lint ⑧c)
      await sleep(2000);
      return { hf, inW };
    };

    const a = await enter();
    ok(a.hf === HF, 'ⓐ ★로비 선로딩 뒤 브라우저 서명 = node 서명(같은 파일 · 같은 정본)', `${a.hf}`);
    const w1 = W.filter((x) => !x.observer)[0];
    ok(!!w1 && w1.url.includes(`hf=${encodeURIComponent(HF)}`), 'ⓑ 주 소켓 주소에 `hf=<서명>`', w1 ? w1.url.replace(/password=[^&]*/, 'password=…').slice(0, 140) : '(welcome 없음)');
    ok(!!w1 && (OFF ? (w1.ht && !w1.hfHit) : (!w1.ht && w1.hfHit === 1)), OFF ? 'ⓑ 끔 — welcome 지형 있음(종전)' : 'ⓑ ★켬 — welcome 지형 0 · hfHit 1', w1 ? `welcome ${KB(w1.bytes)} KB · ${w1.keys}칸` : '-');
    ok(a.inW, 'ⓒ 들어갔다(__inWorld)');
    const st = await page.evaluate(() => ({ applied: typeof _terrainAppliedZones !== 'undefined' && _terrainAppliedZones.has('hanbando'),
      rivers: (typeof _hardTerrain !== 'undefined' && _hardTerrain && _hardTerrain.hanbando && _hardTerrain.hanbando.rivers) ? _hardTerrain.hanbando.rivers.length : -1,
      ht: (typeof _t1125Ht !== 'undefined' && _t1125Ht.hanbando) || null }));
    ok(st.applied && st.rivers === (FILE.hanbando.rivers || []).length && /^[0-9a-f]{40}$/.test(st.ht || ''), 'ⓒ 적용 존으로 적힘 · 로비 지형 그대로(강 수 = 파일) · 승격용 판 서명 적힘', JSON.stringify(st));
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `T1163_${OFF ? 'off' : 'on'}_first.png`) }); }
    const n0 = W.length;
    const b = await enter();   // 새로고침 = 게스트 열쇠로 재접속
    const w2 = W.slice(n0).filter((x) => !x.observer)[0];
    ok(b.inW && !!w2 && (OFF ? w2.ht : (!w2.ht && w2.hfHit === 1)), OFF ? 'ⓓ 끔 — 재접속 welcome 지형 있음' : 'ⓓ ★켬 — 재접속(새로고침 · 게스트 열쇠) welcome 지형 0', w2 ? `${KB(w2.bytes)} KB` : '-');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `T1163_${OFF ? 'off' : 'on'}_reconnect.png`) });
    const errs = (z._out.match(/TypeError|ReferenceError/g) || []).length;
    ok(errs === 0, '존 로그에 TypeError · ReferenceError 0', `${errs}`);
    console.log(`표: welcome(첫 접속) ${w1 ? KB(w1.bytes) : '-'} KB · 재접속 ${w2 ? KB(w2.bytes) : '-'} KB`);
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
    for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
    await sleep(1000); try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n=== T1163 실클라: 통과 ${pass} · 실패 ${fail} ===`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('실패:', e); process.exit(1); });
