#!/usr/bin/env node
// === scripts/t962-lobby-probe.js — 로비 긴 작업(>50ms) 표 (T962 ①) · 러너 밖 계측 자 =========================================================
//
//   판마다 **새 브라우저**(빈 캐시 · 첫 방문)로 로비를 띄워 `--lobby` 초 둔 뒤(사람이 이름을 넣는 동안), 제품 자 `_lobTable()`(00-const · T962)을 받는다
//   — 16ms setTimeout 간격이 50ms 를 넘은 판(막힘)마다 겹친 로비 일(마을 그림 굽기 · 지형 넣기 · 산 알파 풀기 · 물 타일 셈 · 존 목록 ·
//   시작 화면 · 아이콘 · 지면 데우기)과 겹친 ms. 남은 몫 = "표시 없음"(스크립트 평가 · 배치 · 그림 해독 · GC).
//   크롬은 덧붙여 성능 추적(devtools.timeline)으로 RunTask > 50ms 마다 맨 위 사건(EvaluateScript · EventDispatch load · Layout …)을 적는다(--trace).
//   `--hash` = 마을 그림 캔버스 여덟 장 + 방 지붕 한 장의 화소 해시(T962 ② 값 같음 증명) — 다 구워질 때까지 기다린다.
//   손잡이는 주소창 한 칸이다(`--q T962_VIL_SLICE=1` · 서버 무접촉).
// 실행: [E2E_BROWSER=webkit] [손잡이 env] node scripts/t962-lobby-probe.js [--n 3] [--lobby 8] [--out /tmp/t962] [--tag 이름] [--trace] [--hash] [--q T962_VIL_SLICE=1]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const OUT = arg('--out', '/tmp/t962'); fs.mkdirSync(OUT, { recursive: true });
const N = +arg('--n', '3');
const LOBBY = +arg('--lobby', '8');
const BRW = require('./e2e-browser');
const BR = BRW.which();
const TAG = arg('--tag', BR);
const TRACE = has('--trace') && BR === 'chromium';
const HASH = has('--hash');
const Q = arg('--q', '');   // 주소창 손잡이(예: T962_VIL_SLICE=1)
const CPORT = 3010, ZPORT = 3020;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

function traceTasks(file) {                 // 크롬 추적 — 렌더러 주 스레드 RunTask > 50ms 마다 맨 위 사건 넷
  const tr = JSON.parse(fs.readFileSync(file, 'utf8')); const ev = tr.traceEvents || tr;
  const out = [];
  for (const t of ev.filter((e) => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain')) {
    const mine = ev.filter((e) => e.pid === t.pid && e.tid === t.tid && e.ph === 'X');
    const tasks = mine.filter((e) => e.name === 'RunTask' && e.dur > 50000);
    if (!tasks.length) continue;
    const nav = ev.find((e) => e.pid === t.pid && e.name === 'navigationStart') || null;
    const base = nav ? nav.ts : Math.min(...mine.map((e) => e.ts));
    for (const k of tasks.sort((a, b) => a.ts - b.ts)) {
      const kids = mine.filter((e) => e !== k && e.name !== 'RunTask' && e.ts >= k.ts && e.ts + (e.dur || 0) <= k.ts + k.dur);
      const top = kids.filter((e) => !kids.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur && o.dur > e.dur));
      const gc = kids.filter((e) => /^(MinorGC|MajorGC|V8\.GC_)/.test(e.name)).reduce((s, e) => s + e.dur, 0);
      const desc = (e) => { const a = (e.args && (e.args.data || e.args.beginData)) || {}; return e.name + (a.url ? ' ' + path.basename(String(a.url)).split('?')[0] : '') + (a.type ? ' ' + a.type : ''); };
      out.push({ at: Math.round((k.ts - base) / 1000), ms: Math.round(k.dur / 1000), gc: Math.round(gc / 1000),
        top: top.sort((a, b) => b.dur - a.dur).slice(0, 4).map((e) => ({ n: desc(e), ms: Math.round(e.dur / 1000) })) });
    }
  }
  return out;
}

(async () => {
  console.log(`\n=== T962 로비 긴 작업 표 — ${BR} · ${N}판 · 로비 ${LOBBY}초 · ${TAG} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t962-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: `/tmp/t962-z-${process.pid}.db`, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const runs = [];
  for (let i = 0; i < N; i++) {
    const browser = await BRW.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    const tfile = path.join(OUT, `t962-trace-${TAG}-${i + 1}.json`);
    if (TRACE) await browser.startTracing(page, { path: tfile, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8'] });
    await page.goto(`http://localhost:${CPORT}/${Q ? '?' + Q : ''}`, { waitUntil: 'domcontentloaded' });
    await sleep(LOBBY * 1000);   // ★로비 동안 페이지를 안 건드린다(waitForFunction 은 자 스크립트를 페이지 안에서 컴파일해 크롬에서 180~330ms 긴 작업을 하나 더 낸다 — 실측)
    if (TRACE) await browser.stopTracing();
    const r = await page.evaluate(() => _lobTable());
    let pix = null;
    if (HASH) {
      for (let k = 0; k < 120 && !(await page.evaluate(() => typeof _granC !== 'undefined' && !!_granC)); k++) await sleep(250);
      pix = await page.evaluate(() => {
        const hs = (cv) => { if (!cv || !cv.width) return null; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 0x811c9dc5; for (let q = 0; q < d.length; q++) { h ^= d[q]; h = Math.imul(h, 16777619) >>> 0; } return cv.width + 'x' + cv.height + ':' + h.toString(16); };
        const room = _bakeRoofFn ? _bakeRoofFn(5, 4, WALL_HEIGHT, WALL_HEIGHT + Math.round((4 / 2) * 19.2)) : null;
        return { yard: hs(_tileYardC), plaza: hs(_tilePlazaC), hutFloor: hs(_tileHutC), wallN: hs(_wallNC), wallE: hs(_wallEC), hutRoof: hs(_hutRoofC), hallRoof: hs(_hallRoofC),
          gran: hs(_granC), room: hs(room), anchors: [_hutRoofC._ox, _hutRoofC._oy, _hallRoofC._ox, _hallRoofC._oy, _granC._ox, _granC._oy, room && room._ox, room && room._oy].join(',') };
      });
    }
    r.pix = pix;
    if (TRACE) { r.trace = traceTasks(tfile); try { fs.unlinkSync(tfile); } catch (e) {} }
    console.log(`\n--- ${i + 1} --- 로비 ${r.span}ms · >50ms ${r.n}판 · 합 ${r.sum}ms · 최대 ${r.max}ms · 1위 ${r.rank[0] ? r.rank[0].n + ' ' + r.rank[0].ms : '-'} · 때 ${JSON.stringify(r.mk)}${r.vil ? ' · 굽기 ' + JSON.stringify(r.vil) : ''}`);
    for (const b of r.blocks) console.log(`   @${String(b.at).padStart(5)} ${String(b.ms).padStart(5)}ms  ${b.who.map((w) => w.n + ' ' + w.ms).join(' · ')}`);
    console.log(`   일: ${r.steps.map((s) => s.n.replace(/\(.*\)/, '') + ' ' + s.ms.toFixed(0)).join(' · ')}`);
    if (r.trace) for (const t of r.trace) console.log(`   [추적] @${t.at} ${t.ms}ms(GC ${t.gc}) ${t.top.map((x) => x.n + ' ' + x.ms).join(' | ')}`);
    if (pix) console.log(`   해시 ${JSON.stringify(pix)}`);
    runs.push(r);
    fs.writeFileSync(path.join(OUT, `t962-lobby-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, runs }, null, 1));
    await browser.close(); await sleep(1500);
  }
  process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
