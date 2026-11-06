#!/usr/bin/env node
// === scripts/t1193-blur-table.js — 레티나 2배(`T1193_HIDPI`) **늘려 보이는 그림 표** — 계측 자 · 러너 밖 · 그림 무접촉 ==========
//
//   본 캔버스(`#canvas`)에 그리는 `drawImage` 마다(입장 앞에 거는 갈고리 — 그리기는 그대로 하고 적기만 한다) 그 그림이 **화면 화소 하나에 그림 화소 몇 개로**
//   찍히는지(= 그림 화소 하나가 화면 화소 몇 개로 늘었나 — 늘림 배율 s)를 잰다.
//     s = (그린 폭 × 그리기 변환 배율 ÷ 원본 폭) × (화면 배율 ÷ 뒤판 배율)   — 뒤 몫 = 브라우저가 뒤판을 화면에 늘리는 몫(끔 = 2 · 켬 = 1)
//     s ≤ 1 = 또렷(그림 화소가 화면 화소보다 촘촘) · s > 1 = 늘려 보임(1배로 구운 시트를 레티나에 그리면 켬이라도 s = 2 — 흐리거나 네모 화소).
//   그림마다(그림 파일 = 주소 · 구워 둔 캔버스 = 만든 자리 함수 둘 `안<밖`) 그린 수 · 화면 넓이 몫(화면 안으로 자른 그린 넓이 합 ÷ (판 수 × 화면 넓이) — 겹쳐 그린 몫은
//   겹친 만큼 더해진다: 지면 위에 산 · 사람이 얹혀 합이 100% 를 넘는다) · 넓이로 무게 준 s 를 낸다.
//   ⓘ 끔 판은 뒤판이 1배라 모든 그림이 뒤판에 한 번 찍힌 뒤 브라우저가 2배로 늘린다(`#canvas` pixelated) — 끔 칸의 s 는 화면 기준 값이고, 잃은 결은 판(1배)이 정한다.
//   자리 넷(광산2 가운데 · 산 하네스 자리 둘 · 어촌1 가운데) × 판 둘(끔 = 주소 없음 · 켬 = `?T1193_HIDPI=1`) — 화면 배율 2(1100×720 CSS).
// 실행: [E2E_BROWSER=webkit] node scripts/t1193-blur-table.js [--out /tmp/t1193/blur] [--sec 15] [--headed(WebKit = GTK · xvfb-run 밑에서)]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t1193/blur'); fs.mkdirSync(OUT, { recursive: true });
const SEC = +arg('--sec', '15');
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const DDIR = `/tmp/t1193b-${process.pid}`; fs.mkdirSync(DDIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

// 페이지 갈고리 — 캔버스 만든 자리 · 본 캔버스 drawImage 적기(rec 가 켜졌을 때만)
const HOOK = () => {
  if (window.__t1193b) return;
  const B = window.__t1193b = { rec: false, frames: 0, by: {}, site: new WeakMap() };
  const nm = (l) => { const m = (l || '').match(/at (?:new )?([\w$.<>]+)/) || (l || '').match(/^([\w$.<>]*)@/); return (m && m[1]) || '?'; };
  const site2 = () => { const L = String(new Error().stack || '').split('\n'); const b = /^Error/.test(L[0]) ? 3 : 2; return nm(L[b]) + '<' + nm(L[b + 1]); };
  const _ce = Document.prototype.createElement;
  Document.prototype.createElement = function (n, o) { const e = _ce.call(this, n, o); if (String(n).toLowerCase() === 'canvas') { try { B.site.set(e, site2()); } catch (x) {} } return e; };
  if (typeof OffscreenCanvas === 'function') { const OC = OffscreenCanvas; const Wr = function (w, h) { const c = new OC(w, h); try { B.site.set(c, site2()); } catch (x) {} return c; }; Wr.prototype = OC.prototype; window.OffscreenCanvas = Wr; }
  const P = CanvasRenderingContext2D.prototype, _di = P.drawImage;
  const keyOf = (img) => {
    if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) { try { const u = new URL(img.currentSrc || img.src, location.href); return 'img ' + u.pathname; } catch (e) { return 'img ?'; } }
    if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) return 'cv ' + (B.site.get(img) || (img.id ? '#' + img.id : '?'));
    if (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) return 'ocv ' + (B.site.get(img) || '?');
    if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) return 'bitmap';
    return 'etc';
  };
  P.drawImage = function (img) {
    if (B.rec && this.canvas && this.canvas.id === 'canvas') {
      try {
        const a = arguments, n = a.length;
        const iw = img.naturalWidth || img.width || 0, ih = img.naturalHeight || img.height || 0;
        let sw, sh, dx, dy, dw, dh;
        if (n >= 9) { sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; } else if (n >= 5) { sw = iw; sh = ih; dx = a[1]; dy = a[2]; dw = a[3]; dh = a[4]; } else { sw = iw; sh = ih; dx = a[1]; dy = a[2]; dw = iw; dh = ih; }
        const T = this.getTransform(), kx = Math.hypot(T.a, T.b), ky = Math.hypot(T.c, T.d);
        const ddw = Math.abs(dw * kx), ddh = Math.abs(dh * ky);   // 뒤판 화소
        if (sw > 0 && sh > 0 && ddw > 0 && ddh > 0) {
          //   화면 안 넓이 — 축 나란한 변환(돌림 없음)이면 뒤판 사각형을 캔버스 안으로 자른다(돌림이면 통째)
          let area = ddw * ddh;
          if (!T.b && !T.c) { const x0 = T.a * dx + T.e, x1 = T.a * (dx + dw) + T.e, y0 = T.d * dy + T.f, y1 = T.d * (dy + dh) + T.f;
            const cw = this.canvas.width, ch = this.canvas.height;
            area = Math.max(0, Math.min(cw, Math.max(x0, x1)) - Math.max(0, Math.min(x0, x1))) * Math.max(0, Math.min(ch, Math.max(y0, y1)) - Math.max(0, Math.min(y0, y1))); }
          const s = ddw / Math.abs(sw), k = keyOf(img);
          const o = B.by[k] || (B.by[k] = { n: 0, area: 0, sA: 0, sMin: 1e9, sMax: 0, smOff: 0, src: [iw, ih] });
          o.n++; o.area += area; o.sA += s * area; if (s < o.sMin) o.sMin = s; if (s > o.sMax) o.sMax = s; if (this.imageSmoothingEnabled === false) o.smOff++;
        }
      } catch (e) {}
    }
    return _di.apply(this, arguments);
  };
  const loop = () => { if (B.rec) B.frames++; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
};

(async () => {
  console.log(`\n=== T1193 늘려 보이는 그림 표 — 브라우저 ${BR} · 자리마다 ${SEC}초 ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/c.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/z.db`, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_BANDITS: '0', E2E_GIVE: '1' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: !process.argv.includes('--headed') });
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { try { const db = new DatabaseSync(`${DDIR}/z.db`); rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); db.close(); } catch (e) {} if (!rows.length) await sleep(1000); }
  const v = rows.find((r) => r.name === '광산2') || rows[0];
  const fv = rows.find((r) => r.name === '어촌1') || v;
  const SPOTS = [['마을', v.cx, v.cy], ['산', 1750, 74], ['산2', 2150, 1959], ['어촌', fv.cx, fv.cy]];   // 마을 = 광산2 가운데 · 산 = 산 하네스 자리 둘 · 어촌1 가운데
  const res = { browser: BR, sec: SEC, spots: SPOTS, runs: {} };
  for (const [tag, q] of [['off', ''], ['on', '?T1193_HIDPI=1']]) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(HOOK);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await page.goto(`http://localhost:${CPORT}/${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    const en = await page.$('#enter'); if (en) await en.click();
    if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
    await sleep(4000);
    await page.evaluate(() => { if (window.__rainForce) window.__rainForce({ precip: 0 }); window.__setZoom(1);
      const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs; const p = (((0.5 * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; return true; });
    const info = await page.evaluate(() => ({ hidpi: window.__hidpiDbg ? window.__hidpiDbg() : null, dpr: window.devicePixelRatio, cv: [canvas.width, canvas.height] }));
    const tp = (x, y) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [x, y]);
    const per = {};
    for (const [nm, cx, cy] of SPOTS) {
      let ok = false;
      for (let r = 0; r <= 4 && !ok; r++) for (const [dx, dy] of (r ? [[r, 0], [-r, 0], [0, r], [0, -r]] : [[0, 0]])) {
        await tp((cx + dx) * 32 + 16, (cy + dy) * 32 + 16); await sleep(1500);
        const d = await page.evaluate(([lx, ly]) => { const a = window.__getSrvAbs(); const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {}; return Math.hypot(a.x - (lx + (z2.worldOffsetX || 0)), a.y - (ly + (z2.worldOffsetY || 0))); }, [(cx + dx) * 32 + 16, (cy + dy) * 32 + 16]);
        if (d <= 64) { ok = true; break; }
      }
      await sleep(10000);
      await page.evaluate(() => { const B = window.__t1193b; B.by = {}; B.frames = 0; B.rec = true; return true; });
      await sleep(SEC * 1000);
      per[nm] = await page.evaluate(() => { const B = window.__t1193b; B.rec = false; return { frames: B.frames, by: B.by }; });
      const f = path.join(OUT, `${BR}-${tag}-${nm}.png`);
      const durl = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png'));
      fs.writeFileSync(f, Buffer.from(String(durl).split(',')[1], 'base64'));
      console.log(`  · ${tag} ${nm}: 닿음 ${ok} · ${per[nm].frames}판 · 그림 ${Object.keys(per[nm].by).length}종`);
    }
    res.runs[tag] = { q, info, per, errs };
    await ctx.close(); await sleep(2000);
  }
  // 표 — 그림마다(자리 넷 합) 화면 넓이 몫 · 넓이 무게 s(화면 기준 — 뒤판 몫 × 화면 배율 ÷ 뒤판 배율)
  const table = {};
  for (const [tag, R] of Object.entries(res.runs)) {
    const back = (R.info.hidpi && R.info.hidpi.on) ? R.info.hidpi.d : 1, toScr = R.info.dpr / back, scrA = R.info.cv[0] * R.info.cv[1];
    for (const [nm, P] of Object.entries(R.per)) for (const [k, o] of Object.entries(P.by)) {
      const t = table[k] || (table[k] = { src: o.src });
      const e = t[tag] || (t[tag] = { n: 0, share: 0, sA: 0, area: 0, sMin: 1e9, sMax: 0, smOff: 0, spots: 0 });
      e.n += o.n; e.area += o.area; e.sA += o.sA; e.share += o.area / Math.max(1, P.frames * scrA) / SPOTS.length; e.spots++;
      e.sMin = Math.min(e.sMin, o.sMin * toScr); e.sMax = Math.max(e.sMax, o.sMax * toScr); e.smOff += o.smOff; e.toScr = toScr;
    }
  }
  const rowsT = Object.entries(table).map(([k, t]) => {
    const f = (e) => (e ? { n: e.n, sharePct: +(100 * e.share).toFixed(2), s: +((e.sA / Math.max(1e-9, e.area)) * e.toScr).toFixed(2), sMin: +e.sMin.toFixed(2), sMax: +e.sMax.toFixed(2), smOffPct: +(100 * e.smOff / Math.max(1, e.n)).toFixed(0) } : null);
    return { k, src: t.src, off: f(t.off), on: f(t.on) };
  }).sort((a, b) => ((b.on ? b.on.sharePct : 0) - (a.on ? a.on.sharePct : 0)));
  res.table = rowsT;
  console.log('\n  그림(자리 넷 합) | 원본 | 끔: 화면 몫% · s | 켬: 화면 몫% · s(최소~최대) · 매끈 끔%');
  for (const r of rowsT) console.log(`  ${r.k} | ${r.src.join('×')} | ${r.off ? `${r.off.sharePct}% · ${r.off.s}` : '-'} | ${r.on ? `${r.on.sharePct}% · ${r.on.s}(${r.on.sMin}~${r.on.sMax}) · ${r.on.smOffPct}%` : '-'}`);
  fs.writeFileSync(path.join(OUT, `${BR}-blur.json`), JSON.stringify(res, null, 1));
  console.log(`  → ${path.join(OUT, `${BR}-blur.json`)}`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
