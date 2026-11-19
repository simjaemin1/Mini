#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1139 ② 자 · 계측만 · 세계 무접촉 · 한 판 ≈ 기동 + 10분)
// =============================================================================
// T679 ③ "조각 한 틱 최대 5.45 ms(한 번)" — 문 그래프 짓기 조각(`chunk-gates` `tick` 한 부름)의 **분포**와 그중 **GC 와 겹친 몫**.
//   존 서버 하나(central + 한반도 · 마을 켬 · 문 그래프 = 제품 기본 켬 · 관측자 = 마을마다 하나)를 `-r scripts/t1139-slice-preload.js` 로 띄워
//   부팅 뒤 10분(zone.js `_t678WarmTick` 의 '안 짓는 틱' 창 — 30 Hz × 600 s 그 수)을 재고 SIGTERM → 조각 · GC 표를 읽는다.
//   ★손잡이 0 · 존 서버 글자 0 · 하네스 출력만. 판정 0(표만 — 빨강 줄 없음).
//   칸: 2 의 거듭제곱 ms(자 눈금 · 1/64 ms ~ 8 ms) + T678 '≤ 4.65 ms'(보고/T678 §⑤) · T679 '5.45 ms' 두 줄.
//   GC 겹침: 조각 [시작, 시작 + 걸린 ms] 과 GC [시작, 시작 + 걸린 ms] 의 겹친 ms(같은 `performance.now` 시계 — 같은 프로세스 본 스레드).
// 쓰는 법: node scripts/t1139-slice-hist.js [--out <json>] [--one]    (env: T1139_SLICE_ZONE 존 · 기본 hanbando)
// =============================================================================
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const Z = process.env.T1139_SLICE_ZONE || 'hanbando';
const CPORT = 3010;
const WIN_MS = 600 * 1000;   // zone.js `_t678WarmTick` 창(18,000 틱 ÷ 30 Hz) 그대로
const OUTF = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, args, env) {
  const p = spawn(process.execPath, args, { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._out = ''; p._err = '';
  p.stdout.on('data', (b) => { p._out += String(b); if (p._out.length > 4e6) p._out = p._out.slice(-2e6); });
  p.stderr.on('data', (b) => { p._err += String(b); if (p._err.length > 4e6) p._err = p._err.slice(-2e6); });
  procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', killAll);

(async () => {
  const DDIR = fs.mkdtempSync(path.join(os.tmpdir(), 't1139-slice-'));
  const SL = path.join(DDIR, 'slices.json');
  console.log(`\n=== T1139 ② 조각 한 틱 분포 · GC 몫 — 존 ${Z} · 부팅 뒤 ${WIN_MS / 1000}초 ===`);
  const c = boot('central', [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: Z });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { console.log(`central 기동 실패: ${cu.why}`); process.exit(1); }
  const zp = boot(Z, ['-r', path.join(__dirname, 't1139-slice-preload.js'), path.join(ROOT, 'server', 'zone.js')],
    { PORT: String(ZONES[Z].port), ZONE_ID: Z, DB_PATH: `${DDIR}/w-${Z}.db`, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLED_ZONES: Z, ENABLE_VILLAGES: '1', T1139_SLICE_OUT: SL });
  const zu = await FB.waitUp(zp, /zone server up on/, { name: Z, capMs: 900000 });
  if (!zu.ok) { console.log(`존 기동 실패: ${zu.why}`); process.exit(1); }
  console.log(`  · 존 기동 ${(zu.ms / 1000).toFixed(1)}s`);
  //   관측자 — `t646-anatomy`(T679 판)와 같은 문(`?observer=1`) · 같은 ping. 첫 관측자의 welcome `simVillages` 를 읽어 **마을마다 하나씩** 그 가운데에 둔다
  //   (마을 둘레 청크가 다 켜져 주민이 걷고 길을 묻는다 — 문 그래프 짓기 줄이 선다). `--one` = 인구가 가장 많은 마을 하나만(같으면 앞 마을).
  const ONE = process.argv.includes('--one');
  const SZ = +/const SZ = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'))[1];   // 셀 px — villages.js 정본 한 줄
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const url = (x, y) => `ws://localhost:${ZONES[Z].port}/?observer=1` + (x != null ? `&vx=${x}&vy=${y}` : '');
  const socks = [];
  const open = (x, y) => { const w = new WS(url(x, y)); w.on('error', () => {}); w.on('message', () => {}); socks.push({ w, x, y }); return w; };
  const vills = await new Promise((res) => {
    const w = new WS(url()); w.on('error', () => res(null));
    w.on('message', (b) => { let m = null; try { m = JSON.parse(String(b)); } catch (e) { return; }
      if (m && m.type === 'welcome' && Array.isArray(m.simVillages)) { res(m.simVillages); try { w.close(); } catch (e) {} } });
  });
  let at = [];
  if (vills && vills.length) {
    let L = vills.map((v) => ({ name: v.name, pop: v.pop | 0, x: (v.cx + 0.5) * SZ, y: (v.cy + 0.5) * SZ }));
    if (ONE) { let v = L[0]; for (const x of L) if (x.pop > v.pop) v = x; L = [v]; }
    at = L; for (const v of L) open(v.x, v.y);
  } else open();
  const ping = setInterval(() => { for (const s of socks) { try { s.w.send(JSON.stringify({ type: 'ping', t: Date.now() })); if (s.x != null) s.w.send(JSON.stringify({ type: 'viewport_update', x: s.x, y: s.y })); } catch (e) {} } }, 5000);
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < WIN_MS) {
    await sleep(5000);
    try { const j = await (await fetch(`http://localhost:${ZONES[Z].port}/perf`, { signal: AbortSignal.timeout(10000) })).json(); if (j && j.walk && j.walk.t678) last = j.walk.t678; } catch (e) {}
  }
  clearInterval(ping); for (const s of socks) { try { s.w.close(); } catch (e) {} }
  console.log(`  · 관측자 ${socks.length} — ${at.length ? `마을 ${at.length}곳 가운데(인구 합 ${at.reduce((a, v) => a + v.pop, 0)})${ONE ? ` · ${at[0].name}` : ''}` : 'welcome 못 받음(존 가운데 하나)'}`);
  const exited = new Promise((r) => zp.once('exit', r));
  zp.kill('SIGTERM');
  await Promise.race([exited, sleep(60000)]);
  let D = null; try { D = JSON.parse(fs.readFileSync(SL, 'utf8')); } catch (e) {}
  killAll();
  if (!D) { console.log('조각 표를 못 읽었다(preload 가 안 적음)'); fs.rmSync(DDIR, { recursive: true, force: true }); process.exit(1); }

  // ── 표 ──
  const S = [], G = [];
  for (let i = 0; i < D.slices.length; i += 3) S.push({ t: D.slices[i], ms: D.slices[i + 1], done: D.slices[i + 2] });
  for (let i = 0; i < D.gc.length; i += 3) G.push({ t: D.gc[i], ms: D.gc[i + 1], kind: D.gc[i + 2] });
  G.sort((a, b) => a.t - b.t);
  // 조각마다 겹친 GC ms(GC 는 시작 순 — 조각 앞에서 끝난 것은 건너뛴다)
  let gi = 0;
  for (const s of S) {
    const a = s.t, b = s.t + s.ms;
    while (gi < G.length && G[gi].t + G[gi].ms < a) gi++;
    let ov = 0, kinds = [];
    for (let k = gi; k < G.length && G[k].t < b; k++) { const o = Math.min(b, G[k].t + G[k].ms) - Math.max(a, G[k].t); if (o > 0) { ov += o; kinds.push(G[k].kind); } }
    s.gc = ov; s.kinds = kinds;
  }
  const edges = [0]; for (let e = -6; e <= 3; e++) edges.push(Math.pow(2, e));
  const bins = edges.map((lo, i) => ({ lo, hi: i + 1 < edges.length ? edges[i + 1] : Infinity, n: 0, ms: 0, gcN: 0, gcMs: 0 }));
  for (const s of S) { const B = bins.find((x) => s.ms >= x.lo && s.ms < x.hi); B.n++; B.ms += s.ms; if (s.gc > 0) { B.gcN++; B.gcMs += s.gc; } }
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
  const sorted = S.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
  const tot = sum(S, (s) => s.ms), totGc = sum(S, (s) => s.gc);
  const over = (x) => { const L = S.filter((s) => s.ms > x); return { n: L.length, gcN: L.filter((s) => s.gc > 0).length, ms: +sum(L, (s) => s.ms).toFixed(3), gcMs: +sum(L, (s) => s.gc).toFixed(3) }; };
  const top = S.slice().sort((a, b) => b.ms - a.ms).slice(0, 10).map((s) => ({ ms: +s.ms.toFixed(3), gc: +s.gc.toFixed(3), kinds: s.kinds, done: s.done, atS: +(s.t / 1000).toFixed(1) }));
  const gcAll = { n: G.length, ms: +sum(G, (g) => g.ms).toFixed(1), byKind: {} };
  for (const g of G) { const k = String(g.kind); const o = gcAll.byKind[k] || (gcAll.byKind[k] = { n: 0, ms: 0, max: 0 }); o.n++; o.ms += g.ms; if (g.ms > o.max) o.max = g.ms; }
  for (const k in gcAll.byKind) { gcAll.byKind[k].ms = +gcAll.byKind[k].ms.toFixed(2); gcAll.byKind[k].max = +gcAll.byKind[k].max.toFixed(3); }
  const res = {
    zone: Z, winS: WIN_MS / 1000, bootS: +(zu.ms / 1000).toFixed(1), calls: D.calls, busyCalls: S.length,
    sliceMs: { sum: +tot.toFixed(2), mean: S.length ? +(tot / S.length).toFixed(4) : null, p50: q(0.5), p90: q(0.9), p99: q(0.99), p999: q(0.999), max: sorted.length ? sorted[sorted.length - 1] : null },
    observers: { n: socks.length, one: ONE, villages: at.length, pop: at.reduce((a, v) => a + v.pop, 0) },
    zoneSelf: last ? { maxSliceMs: last.maxSliceMs != null ? +(+last.maxSliceMs).toFixed(3) : null, buildMs: last.buildMs != null ? +(+last.buildMs).toFixed(1) : null, built: last.built, recs: last.recs, warm: last.warm || null } : null,
    gcShare: { overlapMs: +totGc.toFixed(3), ofSliceMs: tot ? +(totGc / tot).toFixed(4) : null, slicesWithGc: S.filter((s) => s.gc > 0).length },
    over465: over(4.65), over545: over(5.45),
    bins: bins.map((b) => ({ lo: b.lo, hi: b.hi === Infinity ? null : b.hi, n: b.n, ms: +b.ms.toFixed(3), gcN: b.gcN, gcMs: +b.gcMs.toFixed(3), gcShare: b.ms ? +(b.gcMs / b.ms).toFixed(4) : null })),
    top, gc: gcAll,
  };
  console.log(`  · 짓기 줄이 있던 조각 ${res.busyCalls} / tick 부름 ${res.calls} · 합 ${res.sliceMs.sum} ms · 평균 ${res.sliceMs.mean} · p50 ${res.sliceMs.p50} · p99 ${res.sliceMs.p99} · 최대 ${res.sliceMs.max} ms` +
    (res.zoneSelf ? ` (존 제 셈 최대 ${res.zoneSelf.maxSliceMs} ms · 지은 청크 ${res.zoneSelf.built})` : ''));
  console.log(`  · GC 와 겹친 몫 — 조각 시간의 ${res.gcShare.ofSliceMs == null ? '-' : (res.gcShare.ofSliceMs * 100).toFixed(2)}%(${res.gcShare.overlapMs} ms) · 겹친 조각 ${res.gcShare.slicesWithGc} · 판 전체 GC ${gcAll.n}번 ${gcAll.ms} ms`);
  console.log('  | 칸(ms) | 조각 | 합 ms | GC 겹친 조각 | GC 겹친 ms | GC 몫 |');
  for (const b of res.bins) console.log(`  | ${b.lo} ~ ${b.hi == null ? '' : b.hi} | ${b.n} | ${b.ms} | ${b.gcN} | ${b.gcMs} | ${b.gcShare == null ? '-' : (b.gcShare * 100).toFixed(1) + '%'} |`);
  console.log(`  · > 4.65 ms(T678 상한): ${res.over465.n}(GC 겹침 ${res.over465.gcN} · ${res.over465.gcMs}/${res.over465.ms} ms) · > 5.45 ms(T679 최대): ${res.over545.n}(GC 겹침 ${res.over545.gcN})`);
  console.log(`  · 긴 조각 10: ${top.map((s) => `${s.ms}(gc ${s.gc}${s.kinds.length ? ' ' + s.kinds.join('/') : ''})`).join(' · ')}`);
  if (OUTF) fs.writeFileSync(OUTF, JSON.stringify(res, null, 1));
  fs.rmSync(DDIR, { recursive: true, force: true });
  console.log('=== 끝 ===');
  process.exit(0);
})().catch((e) => { console.error('하네스 실패:', e); killAll(); process.exit(1); });
