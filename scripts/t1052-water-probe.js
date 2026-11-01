#!/usr/bin/env node
// === scripts/t1052-water-probe.js — 물 층 한 프레임 해부(T1052 ①) · 러너 밖 계측 자 ==================================================
//
//   T1045 자와 같은 서버 · 같은 입장(central + 한반도(마을 켬) + 닛폰 · 한반도 고름 · E2E_GIVE · 로비 3초)으로 들어가, 들어간 그 자리에서
//   --sec 초 동안 판마다 물 층을 잰다(자만 감쌈 — 제품 무접촉):
//     · 셰이더 그리기 — 물 GL 문맥 `drawArrays` (+ --finish 면 `gl.finish()` 로 그 판 GL 일을 그 자리에서 끝내 잰다 · 끔이면 GL 일은 옮기기에서 드러난다)
//     · GL → 2D 옮기기 — `CanvasRenderingContext2D.drawImage(_wgl.cv, …)` 횟수 · ms · 옮긴 상자 넓이(GL 칸) · GL 캔버스 넓이
//     · 흐름 텍스처 — `_buildFlowTex` 횟수 · ms · `texImage2D` 올림 수 · 물 판정 `isWaterAtAbs` 부른 수 · ms
//     · 판 간격(rAF) · 물 층 누계 `_waterAcc` 증분 · 물을 그렸나(옮기기 있음)
//   판마다 한 줄을 모아 요약: 물 그린 판 · 안 그린 판 · 판당 평균 · 긴 판(>50ms) 안 몫 · 상자 넓이 대비 옮기기 ms.
//   손잡이 env 는 서버가 물려받는다.
// 실행: [E2E_BROWSER=webkit] [손잡이 env] node scripts/t1052-water-probe.js [--sec 30] [--finish] [--n 1] [--out /tmp/t1052] [--tag 이름]
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
const SEC = +arg('--sec', '30'), N = +arg('--n', '1');
const FINISH = process.argv.includes('--finish');
const OUT = arg('--out', '/tmp/t1052'); fs.mkdirSync(OUT, { recursive: true });
const BRW = require('./e2e-browser');
const BR = BRW.which();
const TAG = arg('--tag', BR);
const CPORT = 3010, ZIDS = ['hanbando', 'nippon'];
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

const HOOK = (finish) => {
  if (window.__t1052) return 'again';
  if (typeof _wgl === 'undefined' || !_wgl.gl) return 'GL 없음';
  const W = window.__t1052 = { fr: [], cur: null };
  const nw = () => ({ t: performance.now(), dN: 0, dMs: 0, cN: 0, cMs: 0, cPx: 0, cvPx: 0, fN: 0, fMs: 0, tN: 0, wN: 0, wMs: 0, wa: +(window._waterAcc || 0) });
  W.cur = nw();
  const gl = _wgl.gl;
  const dA = gl.drawArrays.bind(gl);
  gl.drawArrays = function () { const t0 = performance.now(); const r = dA.apply(null, arguments); if (finish) gl.finish(); W.cur.dN++; W.cur.dMs += performance.now() - t0; return r; };
  const tI = gl.texImage2D.bind(gl);
  gl.texImage2D = function () { W.cur.tN++; return tI.apply(null, arguments); };
  const DI = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (src) {
    if (src !== _wgl.cv) return DI.apply(this, arguments);
    const t0 = performance.now(); const r = DI.apply(this, arguments);
    W.cur.cN++; W.cur.cMs += performance.now() - t0; W.cur.cPx += (arguments[3] || 0) * (arguments[4] || 0); W.cur.cvPx = src.width * src.height; return r;
  };
  const wrap = (name, n, ms) => { const f = window[name]; if (typeof f !== 'function') return; window[name] = function () { const t0 = performance.now(); try { return f.apply(this, arguments); } finally { W.cur[n]++; W.cur[ms] += performance.now() - t0; } }; };
  wrap('_buildFlowTex', 'fN', 'fMs'); wrap('isWaterAtAbs', 'wN', 'wMs');
  const loop = () => { const c = W.cur, n = nw(); c.dt = n.t - c.t; c.waterMs = n.wa - c.wa; if (W.fr.length < 20000) W.fr.push(c); W.cur = n; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return 'ok';
};
const SUM = () => {
  const F = window.__t1052.fr.slice(1); const r = (x) => +x.toFixed(1);
  const grp = (L) => { const n = L.length || 1, s = (k) => L.reduce((a, f) => a + f[k], 0);
    return { frames: L.length, dt: r(s('dt') / n), water: r(s('waterMs') / n), draw: r(s('dMs') / n), copy: r(s('cMs') / n), copyN: r(s('cN') / n), boxPx: Math.round(s('cPx') / n), cvPx: Math.round(L.reduce((a, f) => Math.max(a, f.cvPx), 0)),
      flowN: s('fN'), flowMs: r(s('fMs')), texUp: s('tN'), wetN: s('wN'), wetMs: r(s('wMs')) }; };
  const drawn = F.filter((f) => f.cN > 0), dry = F.filter((f) => f.cN === 0), long = F.filter((f) => f.dt > 50);
  const longSum = (k) => r(long.reduce((a, f) => a + f[k], 0));
  return { all: grp(F), drawn: grp(drawn), dry: grp(dry), long: { frames: long.length, dtSum: longSum('dt'), water: longSum('waterMs'), draw: longSum('dMs'), copy: longSum('cMs'), flow: longSum('fMs'), wet: longSum('wMs') },
    dryWithGL: dry.filter((f) => f.dN > 0).length, ua: navigator.userAgent.slice(0, 60) };
};

(async () => {
  console.log(`\n=== T1052 물 층 해부 — ${BR} · ${SEC}초 · finish ${FINISH} · ${N}판 · ${TAG} ===`);
  const knobs = Object.keys(process.env).filter((k) => /^T9\d\d_|^T1\d\d\d_/.test(k)).map((k) => `${k}=${process.env[k]}`);
  console.log(`  · env 손잡이: ${knobs.join(' ') || '(없음 — 기본)'}`);
  const runs = [];
  for (let i = 0; i < N; i++) {
    for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { console.log(`포트 ${port} 가 비어 있지 않다`); process.exit(1); }
    const DDIR = `/tmp/t1052-${process.pid}-${i}`; fs.mkdirSync(DDIR, { recursive: true });
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
    for (let k = 0; k < 120; k++) { const okz = await page.evaluate(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) { s.value = 'hanbando'; return true; } return false; }); if (okz) break; await sleep(500); }
    await sleep(3000);
    const en = await page.$('#enter'); if (en) await en.click();
    await FixClock.waitInWorld(page, { timeoutMs: 240000 });
    let h = 'GL 없음'; for (let k = 0; k < 60 && h === 'GL 없음'; k++) { h = await page.evaluate(HOOK, FINISH); if (h === 'GL 없음') await sleep(250); }
    await sleep(SEC * 1000);
    const r = await page.evaluate(SUM); r.hook = h; runs.push(r);
    const L = (g) => `${g.frames}판 · 간격 ${g.dt} · 물 층 ${g.water} · 셰이더 ${g.draw} · 옮기기 ${g.copy}(${g.copyN}번 · 상자 ${g.boxPx} / GL 캔버스 ${g.cvPx} 칸) · 흐름 텍스처 ${g.flowN}번 ${g.flowMs}ms · 올림 ${g.texUp} · 물 판정 ${g.wetN}번 ${g.wetMs}ms`;
    console.log(`--- ${i + 1} --- 갈고리 ${h} · ${r.ua}`);
    console.log(`   전부(판당): ${L(r.all)}`);
    console.log(`   물 그린 판: ${L(r.drawn)}`);
    console.log(`   물 안 그린 판: ${L(r.dry)} · 그중 셰이더 돈 판 ${r.dryWithGL}`);
    console.log(`   긴 판(>50ms) ${r.long.frames}판 합 ${r.long.dtSum}ms — 물 층 ${r.long.water} · 셰이더 ${r.long.draw} · 옮기기 ${r.long.copy} · 흐름 ${r.long.flow} · 물 판정 ${r.long.wet}`);
    fs.writeFileSync(path.join(OUT, `t1052-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, knobs, finish: FINISH, runs }, null, 1));
    await browser.close(); killAll(); await sleep(2000);
  }
  process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); killAll(); process.exit(1); });
