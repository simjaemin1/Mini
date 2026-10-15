// (@regress 없음 — 러너 밖 · T756 계측기 · 제품 무변)
// === scripts/t756-prof.js — 존 프로세스에 얹는 preload: V8 표본 자(inspector `Profiler`)로 **긴 걸음 · 30 ms+ 틱 안 주 스레드가 무엇을 돌았나** ==========
//   쓰는 법: T686_PRELOAD=$PWD/scripts/t756-prof.js T756_PROF=/tmp/t756/<판>.prof.json T715_DEC=1 T719_DEEP=1 node scripts/t686-spike.js run <판>
//   ★T686 자 꼬리가 긴 걸음(`globalThis.__T756W` — [벽시각 · ms · … · [9] 걸음 머리 pf 시각 · … · [11] cpu])과 30 ms+ 틱(`__T756SPK` — [머리 pf · ms])을 적어 두면,
//     30초마다 표본을 멈춰 그 창 안에 든 표본만 골라 맨 끝 틀(잎) · 잎에서 위로 열두 틀 사슬을 센다(표본 원문은 안 남긴다 · 다시 켠다).
//   ★표본 간격 T756_PROF_US(기본 500 µs) · 시각 맞춤: V8 표본 시각과 `process.hrtime` 은 같은 단조 시계(µs) · `performance.now()` 는 그 시계 − 시작 원점.
//   (세계에 0 — 읽기만 · 표본 자는 코드 모양을 안 바꾼다 · 표본 비용은 판 전체에 얹힌다 — 이 판의 틱 수는 최악 표에 안 쓴다)
'use strict';
if (process.env.T756_PROF && require('worker_threads').isMainThread) {
  const inspector = require('inspector'), fs = require('fs'), { performance } = require('perf_hooks');
  const S = new inspector.Session(); S.connect();
  const IV = +(process.env.T756_PROF_US || 500);
  const OUT = { iv: IV, cycles: 0, err: [], steps: [], ticks: [], miss: 0 };
  let nW = 0, nK = 0;
  const off = () => Number(process.hrtime.bigint() / 1000n) - performance.now() * 1000;   // 단조 µs − pf µs
  const name = (n) => { const c = n.callFrame; return (c.functionName || '(anon)') + (c.url ? ' ' + c.url.replace(/^.*\/(server|sim|scripts|node:)/, '$1').replace(/^file:\/\//, '') + ':' + (c.lineNumber + 1) : ''); };
  function analyze(P) {
    const par = new Map(), byId = new Map();
    for (const n of P.nodes) { byId.set(n.id, n); if (n.children) for (const c of n.children) par.set(c, n.id); }
    const T = new Float64Array(P.samples.length); let t = P.startTime; for (let i = 0; i < P.samples.length; i++) { t += P.timeDeltas[i]; T[i] = t; }
    const o = off();
    const pick = (a, b) => {   // 단조 µs 창 [a, b] 안 표본 → 잎 · 사슬
      let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < a) lo = m + 1; else hi = m; }
      const leaf = new Map(), chain = new Map(); let n = 0;
      for (let i = lo; i < T.length && T[i] <= b; i++) {
        n++; let id = P.samples[i]; const L = name(byId.get(id)); leaf.set(L, (leaf.get(L) || 0) + 1);
        const ch = []; for (let k = 0; k < 12 && id != null; k++) { const nd = byId.get(id); if (!nd) break; ch.push(name(nd)); id = par.get(id); }
        const key = ch.join(' < '); chain.set(key, (chain.get(key) || 0) + 1);
      }
      const top = (m, k) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, k);
      return { n, leaf: top(leaf, 6), chain: top(chain, 3) };
    };
    const W = globalThis.__T756W || [], K = globalThis.__T756SPK || [];
    for (; nW < W.length; nW++) { const w = W[nW], a = w[9] * 1000 + o, b = a + w[1] * 1000;
      if (a < P.startTime) { OUT.miss++; continue; }
      OUT.steps.push(Object.assign({ at: w[0], ms: w[1], cpu: w[11], job: w[4], act: w[5], acc: (w[8] || []).slice(0, 3) }, pick(a, b))); }
    for (; nK < K.length; nK++) { const k = K[nK], a = k[0] * 1000 + o, b = a + k[1] * 1000;
      if (a < P.startTime) { OUT.miss++; continue; }
      OUT.ticks.push(Object.assign({ p0: k[0], ms: k[1] }, pick(a, b))); }
  }
  const post = (m, p) => new Promise((res, rej) => S.post(m, p || {}, (e, r) => (e ? rej(e) : res(r))));
  let busy = false;
  async function cycle() {
    if (busy) return; busy = true;
    try { const r = await post('Profiler.stop'); OUT.cycles++; analyze(r.profile); await post('Profiler.start'); } catch (e) { if (OUT.err.length < 10) OUT.err.push(String(e && e.message)); }
    busy = false;
  }
  (async () => { try { await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: IV }); await post('Profiler.start'); } catch (e) { OUT.err.push(String(e && e.message)); } })();
  setInterval(cycle, 30000).unref();
  process.on('SIGHUP', () => { OUT.steps.length = 0; OUT.ticks.length = 0; OUT.miss = 0; nW = 0; nK = (globalThis.__T756SPK || []).length; });   // t686 이 부팅 몫을 비울 때 — 긴 걸음 목록(worst)도 그때 비워진다(같은 배열)
  process.on('SIGUSR2', () => {
    S.post('Profiler.stop', (e, r) => { try { if (!e) analyze(r.profile); fs.writeFileSync(process.env.T756_PROF, JSON.stringify(OUT)); } catch (er) { try { fs.writeFileSync(process.env.T756_PROF, JSON.stringify({ err: String(er && er.stack) })); } catch (e2) {} } });
  });
}
