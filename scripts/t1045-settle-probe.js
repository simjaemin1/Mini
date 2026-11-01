#!/usr/bin/env node
// === scripts/t1045-settle-probe.js — 첫 입력 뒤 "가라앉음"(첫 ≤50ms 프레임) 판 늘림 · 긴 프레임 귀속 (T1045 ① ②) · 러너 밖 계측 자 ================
//
//   T1014 `t926-mem-hour --first` 와 같은 서버 · 같은 입장(central + 한반도(마을 켬) + 닛폰 · 한반도 고름 · E2E_GIVE) — 대본 바퀴 없이 **입장만** 판마다
//   새 서버(새 세계) · 새 브라우저로 --n 번 잰다. 자 갈고리(입장 앞 · 제품 표시 없이 옛 트리에도 같은 자):
//     · 첫 접속 — 눌림(capture) · 주 소켓 첫 welcome 처리 앞 · 뒤(onmessage 세터 감쌈) · rAF 고리 하나(T1014 FIRSTHOOK 와 같은 정의)
//       첫 그림 = welcome 처리 뒤 첫 rAF 판의 끝 · 첫 입력 = 그다음 rAF 머리 · 가라앉음 = 그 뒤 첫 rAF 간격 ≤ 50ms(--cap 초 안)
//     · 판마다 층 누계 표본 — rAF 머리마다 제품 누계(`_tileAcc` 지면 · `_waterAcc` 물 · `_mtAcc` 산 · `_natAcc` 자연물 · `_entAcc` 몸 · `__fcRenderMs` 렌더 전체 ·
//       `__fcMsgMs` 메시지 · `_hudAcc` HUD — 몸 · 렌더 · 메시지 · HUD 는 `__fcOn` 일 때만 쌓이므로 눌림 앞에 켠다(T913 계량 · 그림 무접촉))과
//       셈(`_groundTiles.size` 구운 지면 타일 · `_natChunk.size` 지은 자연물 청크 · `__natDbg.pending`)을 적는다.
//   가라앉음 창(첫 입력 → 가라앉음) 안 긴 프레임(>50ms)마다 그 판의 층 증분으로 갈래를 가른다:
//     지면(굽기 포함) · 자연물(청크 짓기 — T920 나눠 짓기) · 산 · 물 · 몸 · 그 밖 렌더(렌더 전체 − 앞 다섯) · 메시지 · HUD · 렌더 밖(간격 − 렌더 − 메시지 − HUD = 그리기 · GC · 배치 · 타이머 일).
//   손잡이 env 는 이 자를 부른 env 를 서버가 물려받는다(끔 판은 env 를 얹는다).
// 실행: [E2E_BROWSER=webkit] [손잡이 env] node scripts/t1045-settle-probe.js [--n 5] [--cap 60] [--out /tmp/t1045] [--tag 이름] [--wrap 함수,함수(긴 판 안 배타 ms 를 '·이름' 칸으로)]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', '5'), CAP = +arg('--cap', '60');
const WRAP = String(arg('--wrap', '')).split(',').filter(Boolean);   // 물 층 세부 등 — 함수 배타 시간(전역 함수 감쌈 · 자만)
const OUT = arg('--out', '/tmp/t1045'); fs.mkdirSync(OUT, { recursive: true });
const BRW = require('./e2e-browser');
const BR = BRW.which();
const TAG = arg('--tag', BR);
const CPORT = 3010;
const ZIDS = ['hanbando', 'nippon'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { killAll(); process.exit(143); });
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });

// 입장 앞 갈고리 — 첫 접속(T1014 FIRSTHOOK 와 같은 정의) + rAF 머리마다 층 누계 · 셈
const HOOK = () => {
  if (window.__t1045) return true;
  const F = window.__t1045 = { click: null, wRx: null, wDone: null, fr: [] };
  const P = WebSocket.prototype, D = Object.getOwnPropertyDescriptor(P, 'onmessage');
  Object.defineProperty(P, 'onmessage', { configurable: true, enumerable: D.enumerable, get: D.get, set(fn) {
    if (typeof fn !== 'function') return D.set.call(this, fn);
    const w = function (ev) {
      const isW = F.wRx == null && typeof ev.data === 'string' && ev.data.slice(0, 200).indexOf('"type":"welcome"') >= 0;
      const t0 = performance.now();
      try { return fn.call(this, ev); } finally { if (isW && F.wRx == null) { F.wRx = t0; F.wDone = performance.now(); } }
    };
    D.set.call(this, w);
  } });
  const g = (k) => +(window[k] || 0);
  const sz = (n) => { try { const v = eval(n); return v && typeof v.size === 'number' ? v.size : -1; } catch (e) { return -1; } };
  const loop = () => {
    if (F.click != null && F.fr.length < 20000) F.fr.push([performance.now(), g('_tileAcc'), g('_natAcc'), g('_mtAcc'), g('_waterAcc'), g('_entAcc'), g('__fcRenderMs'), g('__fcMsgMs'), g('_hudAcc'),
      sz('_groundTiles'), sz('_natChunk'), (window.__natDbg && window.__natDbg.pending) || 0, window.__t1045w ? Object.assign({}, window.__t1045w) : null]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const b = document.getElementById('enter');
  if (b) b.addEventListener('click', () => {
    if (F.click != null) return;
    F.click = performance.now();
    if (!window.__fcOn) { window.__fcRenderMs = 0; window.__fcMsgMs = 0; window.__fcMsgN = 0; window.__fcPong = []; window.__fcTick = []; window.__fcOn = true; }   // T913 층 계량 켬(몸 · 렌더 · 메시지 · HUD 누계)
  }, true);
  return true;
};
const READ = (cap) => {
  const F = window.__t1045; if (!F || F.click == null || F.wDone == null) return { ok: false };
  const R = F.fr, i0 = R.findIndex((r) => r[0] > F.wDone); if (i0 < 0 || i0 + 2 >= R.length) return { ok: false, why: 'rAF 모자람' };
  const frame1 = R[i0 + 1][0], input = R[i0 + 2][0]; let iS = -1;
  for (let i = i0 + 3; i < R.length; i++) { if (R[i][0] - input > cap * 1000) break; if (R[i][0] - R[i - 1][0] <= 50) { iS = i; break; } }
  const iEnd = iS >= 0 ? iS : R.findIndex((r) => r[0] - input > cap * 1000);
  const end = iEnd > 0 ? iEnd : R.length - 1;
  const K = ['지면', '자연물', '산', '물', '몸', '그 밖 렌더', '메시지', 'HUD', '렌더 밖'];
  const sum = {}; for (const k of K) sum[k] = 0; let ln = 0, lms = 0, tiles = 0, nat = 0; const top = [];
  for (let i = i0 + 3; i <= end; i++) {
    const a = R[i - 1], b = R[i], dt = b[0] - a[0]; if (dt <= 50) continue;
    const d = (j) => Math.max(0, b[j] - a[j]);
    const tile = d(1), natv = d(2), mt = d(3), wat = d(4), ent = d(5), rend = d(6), msg = d(7), hud = d(8);
    const v = { '지면': tile, '자연물': natv, '산': mt, '물': wat, '몸': ent, '그 밖 렌더': Math.max(0, rend - tile - natv - mt - wat - ent), '메시지': msg, 'HUD': hud };
    v['렌더 밖'] = Math.max(0, dt - Math.max(rend, tile + natv + mt + wat + ent) - msg - hud);
    for (const k of K) sum[k] += v[k];
    ln++; lms += dt; tiles += Math.max(0, b[9] - a[9]); nat += Math.max(0, b[10] - a[10]);
    if (a[12] && b[12]) for (const k in b[12]) { const w = (sum['·' + k] = sum['·' + k] || 0); sum['·' + k] = w + Math.max(0, b[12][k] - (a[12][k] || 0)); }
    top.push([+dt.toFixed(0), Object.entries(v).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, x]) => k + ' ' + x.toFixed(0)).join(' · ')]);
  }
  const r2 = (x) => +x.toFixed(0);
  const S = {}; for (const k of Object.keys(sum)) S[k] = r2(sum[k]);
  const last = R[end];
  return { ok: true, wait: r2(F.wRx - F.click), firstDraw: r2(frame1 - F.click), firstInput: r2(input - F.click), settle: iS >= 0 ? r2(R[iS][0] - input) : null,
    longN: ln, longMs: r2(lms), by: S, tilesInLong: tiles, natInLong: nat, groundTiles: last[9], natChunks: last[10], natPending: last[11],
    top: top.sort((x, y) => y[0] - x[0]).slice(0, 5) };
};

(async () => {
  console.log(`\n=== T1045 가라앉음 판 늘림 — ${BR} · ${N}판 · 창 ${CAP}초 · ${TAG} ===`);
  const knobs = Object.keys(process.env).filter((k) => /^T9\d\d_|^T1\d\d\d_/.test(k)).map((k) => `${k}=${process.env[k]}`);
  console.log(`  · env 손잡이: ${knobs.join(' ') || '(없음 — 기본)'}`);
  const runs = [];
  for (let i = 0; i < N; i++) {
    for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { console.log(`포트 ${port} 가 비어 있지 않다`); process.exit(1); }
    const DDIR = `/tmp/t1045-${process.pid}-${i}`; fs.mkdirSync(DDIR, { recursive: true });
    const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
    const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
    const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' };
    const ups = {};
    for (const z of ZIDS) { const p = boot('zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${DDIR}/w-${z}.db`, ENABLE_VILLAGES: z === 'hanbando' ? '1' : '0' }, common)); ups[z] = FB.waitUp(p, /zone server up on/, { name: z, capMs: 600000 }); }
    const zu = {}; for (const z of ZIDS) zu[z] = await ups[z];
    if (!cu.ok || !ZIDS.every((z) => zu[z].ok)) { console.log('기동 실패'); process.exit(1); }
    const browser = await BRW.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    await page.evaluate(HOOK);
    if (WRAP.length) console.log(`  · 감쌈 ${await page.evaluate((fns) => { const A = window.__t1045w = {}, st = []; let n = 0;
      for (const k of fns) { const f = window[k]; if (typeof f !== 'function') continue; A[k] = 0; n++;
        window[k] = function () { const t0 = performance.now(); st.push(0); try { return f.apply(this, arguments); } finally { const el = performance.now() - t0, ch = st.pop(); A[k] += el - ch; if (st.length) st[st.length - 1] += el; } }; }
      return n; }, WRAP)}/${WRAP.length}`);
    for (let k = 0; k < 120; k++) { const okz = await page.evaluate(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) { s.value = 'hanbando'; return true; } return false; }); if (okz) break; await sleep(500); }
    await sleep(3000);   // 로비(T1014 대본과 같은 틈)
    const en = await page.$('#enter'); if (en) await en.click();
    const inw = await FixClock.waitInWorld(page, { timeoutMs: 240000 });
    let r = { ok: false };
    for (let k = 0; k < (CAP + 40) * 2; k++) { r = await page.evaluate(READ, CAP); if (r.ok && (r.settle != null || r.longMs > 0 && k > (CAP + 20) * 2)) break; await sleep(500); }
    r.inWorld = inw.ok; runs.push(r);
    console.log(`--- ${i + 1} --- 첫 그림 ${r.firstDraw} · 첫 입력 ${r.firstInput} · 가라앉음 ${r.settle == null ? `${CAP}초 안 안 됨` : (r.settle / 1000).toFixed(1) + '초'} · 긴 프레임 ${r.longN}판 ${(r.longMs / 1000).toFixed(1)}초 · 지면 타일 ${r.groundTiles}장(긴 판 안 ${r.tilesInLong}) · 자연물 청크 ${r.natChunks}(긴 판 안 ${r.natInLong} · 남은 ${r.natPending})`);
    if (r.by) console.log(`     갈래 ms: ${Object.entries(r.by).map(([k, v]) => k + ' ' + v).join(' · ')}`);
    if (r.top) console.log(`     큰 판: ${r.top.map((t) => t[0] + '[' + t[1] + ']').join(' / ')}`);
    fs.writeFileSync(path.join(OUT, `t1045-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, knobs, runs }, null, 1));
    await browser.close(); killAll(); await sleep(2000);
  }
  const ok = runs.filter((r) => r.ok);
  const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  console.log(`\n== ${TAG}: 가라앉음 ${ok.map((r) => r.settle == null ? '안 됨' : (r.settle / 1000).toFixed(1)).join(' · ')}초(가운데 ${((med(ok.map((r) => r.settle)) || 0) / 1000).toFixed(1)}) · 긴 프레임 ${ok.map((r) => r.longN).join(' · ')}판 · 합 ${ok.map((r) => (r.longMs / 1000).toFixed(1)).join(' · ')}초 · 첫 그림 ${ok.map((r) => r.firstDraw).join(' · ')}`);
  process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); killAll(); process.exit(1); });
