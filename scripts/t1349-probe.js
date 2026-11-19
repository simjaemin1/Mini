#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1349 계측기 · 제품 무변)
// === scripts/t1349-probe.js — 멈춘(기어가는) 존 프로세스를 밖에서 잰다: SIGUSR1 → 검사기(CDP) — 멈춤 스택 N 번 · CPU 프로파일 S 초 · 힙 ===
//   node scripts/t1349-probe.js <pid> <포트> <출력.json> [--pauses 6] [--profile 20] [--eval 파일] [--heapsample 초]
//   --heapsample: 그 초 동안 힙 표본(`--alloc` 이면 거둔 것까지 — 할당 몫 · GC 부담)(`HeapProfiler.startSampling` — 살아남은 할당만 남는다) → 할당 자리(함수 · 줄)별 MB 위 30 · 스택 꼭대기 넷 줄기 위 15
//   아이 존은 NODE_OPTIONS 에 `--inspect-port=<포트>` 를 실어 띄운다(검사기는 SIGUSR1 이 올 때만 선다 — 그 전엔 0).
'use strict';
const fs = require('fs'), http = require('http');
const [PID, PORT, OUTF] = process.argv.slice(2);
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? +process.argv[i + 1] : d; };
const NP = opt('pauses', 6), PS = opt('profile', 20), HS = opt('heapsample', 0);
const EV = (() => { const i = process.argv.indexOf('--eval'); return i >= 0 ? fs.readFileSync(process.argv[i + 1], 'utf8') : null; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) => new Promise((res, rej) => http.get(u, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));
(async () => {
  process.kill(+PID, 'SIGUSR1');
  let list = null; for (let i = 0; i < 40 && !list; i++) { await sleep(250); try { list = await getJson(`http://127.0.0.1:${PORT}/json/list`); } catch (e) {} }
  if (!list || !list.length) { console.error('검사기 안 섬'); process.exit(1); }
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), ev = [];
  ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && wait.has(x.id)) { wait.get(x.id)(x); wait.delete(x.id); } else if (x.method) ev.push(x); };
  const call = (method, params) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const out = { pid: +PID, at: new Date().toISOString(), stacks: [], profile: null, heap: null };
  await call('Debugger.enable');
  for (let k = 0; k < NP; k++) {
    ev.length = 0; await call('Debugger.pause');
    let p = null; for (let i = 0; i < 200 && !p; i++) { await sleep(25); p = ev.find((e) => e.method === 'Debugger.paused'); }
    if (p) out.stacks.push(p.params.callFrames.slice(0, 30).map((f) => `${f.functionName || '(anon)'} ${String(f.url).split('/').slice(-2).join('/')}:${f.location.lineNumber + 1}`));
    if (EV && p && k === 0) { const r = await call('Debugger.evaluateOnCallFrame', { callFrameId: p.params.callFrames[0].callFrameId, expression: EV, returnByValue: true }); out.eval = r.result && (r.result.result ? r.result.result.value : r.result); }
    await call('Debugger.resume'); await sleep(1500);
  }
  await call('Debugger.disable');
  await call('Profiler.enable'); await call('Profiler.setSamplingInterval', { interval: 1000 }); await call('Profiler.start');
  await sleep(PS * 1000);
  const pr = await call('Profiler.stop');
  const P = pr.result && pr.result.profile;
  if (P) {
    const self = new Map(), byId = new Map(P.nodes.map((n) => [n.id, n])); const cnt = new Map();
    for (const s of P.samples || []) cnt.set(s, (cnt.get(s) || 0) + 1);
    const tot = (P.samples || []).length;
    for (const [nid, c] of cnt) { const n = byId.get(nid); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + c); }
    out.profile = { samples: tot, top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, c]) => [k, +(100 * c / tot).toFixed(1)]) };
  }
  if (HS > 0) {
    await call('HeapProfiler.enable'); await call('HeapProfiler.startSampling', process.argv.includes('--alloc') ? { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } : { samplingInterval: 262144 });
    await sleep(HS * 1000);
    const r = await call('HeapProfiler.stopSampling'); const root = r.result && r.result.profile && r.result.profile.head;
    if (root) { const site = new Map(), stem = new Map(); let tot = 0;
      const nm = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
      const walk = (n, path) => { const k = nm(n.callFrame), P = path.concat([k]); if (n.selfSize) { tot += n.selfSize; site.set(k, (site.get(k) || 0) + n.selfSize); const sk = P.slice(-4).reverse().join(' < '); stem.set(sk, (stem.get(sk) || 0) + n.selfSize); } for (const c of n.children || []) walk(c, P); };
      walk(root, []);
      const MBf = (x) => +(x / 1048576).toFixed(1);
      out.heapSample = { sec: HS, totMB: MBf(tot), sites: [...site].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, MBf(v)]), stems: [...stem].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, MBf(v)]) }; }
  }
  const h = await call('Runtime.getHeapUsage'); out.heap = h.result;
  fs.writeFileSync(OUTF, JSON.stringify(out, null, 1));
  console.log(`스택 ${out.stacks.length} · 프로파일 ${out.profile && out.profile.samples} 표본 · 힙 ${out.heap && (out.heap.usedSize / 1048576).toFixed(0)} MB`);
  ws.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
