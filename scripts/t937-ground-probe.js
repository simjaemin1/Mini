#!/usr/bin/env node
// === scripts/t937-ground-probe.js — 지면 타일 하나 굽기(`_bakeGroundTile`) 안 층 표 (T937 ②) · 러너 밖 계측 자 ===========================
//
//   **첫 접속(빈 캐시)** 을 `--n` 판 잰다 — 판마다 새 컨텍스트 페이지의 **로비에서** 굽기가 부르는 함수들을 배타 시간 계량기로 감싸고
//   (`_bakeGroundTile` 포함 · 계측 자만 · 제품 0 · 굽기 **안에서** 부른 몫만 센다) "들어가기" → 첫 입력 가능(`_ld.at.input` · T920)까지 기다려,
//   굽기마다 [시작 · 걸린 ms · 함수별 배타 ms] 를 모은다. 첫 그림 판(welcome 처리 → 첫 render 끝) 안의 굽기를 따로 묶는다.
//   감싸지 않은 몫(= 굽기 배타 시간) = 풀 바탕 채우기 · 맨땅 뙈기 패턴 · 잎 층 캔버스 · 셀 고리의 남은 일.
//   손잡이 env 는 이 자를 부른 env 를 존이 물려받는다(켬 판은 env 를 얹는다).
// 실행: [E2E_BROWSER=webkit] [손잡이 env] node scripts/t937-ground-probe.js [--n 3] [--out /tmp/t937] [--tag 이름]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t937'); fs.mkdirSync(OUT, { recursive: true });
const N = +arg('--n', '3');
const BR = require('./e2e-browser').which();
const TAG = arg('--tag', BR);
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/t937-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const FNS = ['_bakeGroundTile', '_shoreMarginBake', '_gtPaintState', '_gtDiamond', '_gtFrostPaint', '_tsSoil', '_tsFarmSet', '_wxListOf', '_grassSplit',
  '_gtSnowAlpha', '_gtFrostAlpha', '_covDia', '_diaPath', 'isWaterAtAbs', 'isRockAtAbs', '_gtMask', 'blendTint', 'latitudeColor'];

(async () => {
  console.log(`\n=== T937 지면 타일 굽기 층 표 — ${BR} · ${N}판 · ${TAG} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t937-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const runs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    await sleep(3000);
    await page.evaluate((fns) => {
      const T = window.__t937 = { bakes: [], cur: null, st: [] };
      for (const n of fns) {
        const f = window[n]; if (typeof f !== 'function' || f.__t937) continue;
        const isBake = n === '_bakeGroundTile';
        const w = function () {
          if (!isBake && !T.cur) return f.apply(this, arguments);          // 굽기 밖 호출은 안 센다
          const t0 = performance.now(); if (isBake) T.cur = { t0, fn: {} }; T.st.push(0);
          try { return f.apply(this, arguments); }
          finally {
            const el = performance.now() - t0, ch = T.st.pop();
            if (isBake) { T.cur.ms = el; T.cur.self = el - ch; T.bakes.push(T.cur); T.cur = null; }
            else { const a = T.cur.fn[n] || (T.cur.fn[n] = { n: 0, ex: 0 }); a.n++; a.ex += el - ch; }
            if (T.st.length) T.st[T.st.length - 1] += el;
          }
        };
        w.__t937 = true; window[n] = w;
      }
    }, FNS);
    const en = await page.$('#enter'); if (en) await en.click();
    if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
    for (let k = 0; k < 120 && !(await page.evaluate(() => _ld.at.input != null)); k++) await sleep(500);
    await sleep(3000);
    const r = await page.evaluate(() => {
      const at = _ld.at, B = window.__t937.bakes;
      const sum = (list) => { const fn = {}; let ms = 0, self = 0; for (const b of list) { ms += b.ms; self += b.self; for (const [k, a] of Object.entries(b.fn)) { const o = fn[k] || (fn[k] = { n: 0, ex: 0 }); o.n += a.n; o.ex += a.ex; } }
        return { tiles: list.length, ms: +ms.toFixed(1), self: +self.toFixed(1), perTile: list.length ? +(ms / list.length).toFixed(1) : null,
          rows: Object.entries(fn).map(([k, a]) => ({ fn: k, n: a.n, ex: +a.ex.toFixed(1) })).sort((a, b) => b.ex - a.ex) }; };
      const first = B.filter((b) => b.t0 >= at.welcomeDone && b.t0 <= at.frame1);
      const after = B.filter((b) => b.t0 > at.frame1 && b.t0 <= at.frame1 + 3000);
      const layer = _ld.fc ? _ld.fc.tile : null;
      // 그림 같음 재료 — 준비 둘의 결과 · 구운 타일(바탕 · 잎 층) 화소 해시
      const hs = (cv) => { if (!cv || !cv.width) return null; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 0x811c9dc5; for (let q = 0; q < d.length; q++) { h ^= d[q]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
      const tilesH = {}; for (const [k, e] of _groundTiles) tilesH[k] = hs(e.cv) + '/' + hs(e.bl);
      const pix = { mask: hs(_gtMaskCv), blade: hs(_grassBlade), flat: _grassFlat, tiles: tilesH, prewarm: _ld.prewarm || null };
      return { pix, firstRenderMs: +(at.frame1 - at.welcomeDone).toFixed(0), tileLayer: layer, first: sum(first), after3s: sum(after), all: sum(B),
        firstEach: first.map((b) => +b.ms.toFixed(1)) };
    });
    console.log(`  · 데우기 ${JSON.stringify(r.pix.prewarm)} · 마스크 ${r.pix.mask} · 잎 ${r.pix.blade} · 평탄색 ${r.pix.flat} · 타일 ${Object.keys(r.pix.tiles).length}장`);
    console.log(`\n--- ${i + 1} --- 첫 그림 ${r.firstRenderMs}ms · 그 안 지면 층 ${r.tileLayer}ms · 첫 그림 안 굽기 ${r.first.tiles}장 ${r.first.ms}ms(장마다 ${r.firstEach.join(' · ')}) · 감싸지 않은 몫 ${r.first.self}ms · 첫 그림 뒤 3초 ${r.after3s.tiles}장 ${r.after3s.ms}ms`);
    for (const x of r.first.rows.slice(0, 12)) console.log(`   ${x.fn.padEnd(18)} ${String(x.n).padStart(7)}회 ${String(x.ex).padStart(8)}ms`);
    runs.push(r);
    fs.writeFileSync(path.join(OUT, `t937-ground-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, runs }, null, 1));
    await ctx.close(); await sleep(2000);
  }
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
