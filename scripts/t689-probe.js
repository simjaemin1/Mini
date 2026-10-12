// (@regress 없음 — 러너 밖 · T689 계측기 · 제품 무변)
// === scripts/t689-probe.js — 존 프로세스에 얹는 preload: 걸음 커널 메모리 늘림 · 지형 물음 · 할당 상위(표본 힙 프로파일러) ==========
//   쓰는 법: T686_PRELOAD=$PWD/scripts/t689-probe.js T689_OUT=/tmp/t689/<판>.probe.json node scripts/t686-spike.js run <판>
//            (T686 자가 끝에 SIGUSR2 를 보낸다 — 그때 파일을 쓴다 · `T689_OUT` 이 없으면 아무것도 안 한다)
//   ★재는 것(전부 읽기만 — 세계에 0):
//     ① `WebAssembly.Memory.prototype.grow` — 부를 때마다 [벽 시각 · 늘린 쪽 수 · 전 쪽 수 · ms]
//     ② `server/walk-wasm.js create` 를 감싸 — `ensure`(→ `layout`) 가 실제로 키운 때 [시각 · n · m · 전 용량 · 새 용량 · ms] ·
//        `terrMiss`(지형 2비트 표에 없는 칸 → JS 지형 물음) · `wallQ` 의 초당 셈 · `step` 한 번의 최대 ms(초마다)
//     ③ 표본 힙 프로파일러(inspector `HeapProfiler.startSampling` · GC 로 이미 거둔 것도 센다) — 할당 바이트를 부른 자리(함수 · 파일:줄)별로 합한다.
//        `T689_HEAP=0` 이면 끈다. 간격 `T689_HEAP_INT`(바이트 · 기본 65536).
'use strict';
const OUT = (process.env.T689_OUT && require('worker_threads').isMainThread) ? process.env.T689_OUT : '';   // ★[T715] 일꾼 스레드에선 안 잰다(같은 파일을 덮는다)
if (OUT) {
  const fs = require('fs');
  const path = require('path');
  const Module = require('module');
  const { performance } = require('perf_hooks');
  const R = { grow: [], layout: [], perSec: {}, bigStep: [], startedAt: Date.now() };
  const sec = () => Math.floor(Date.now() / 1000);
  const bump = (k, v) => { const s = sec(); const o = R.perSec[s] || (R.perSec[s] = { terr: 0, wall: 0, stepMax: 0, steps: 0, n: 0 }); if (k === 'stepMax') { if (v > o.stepMax) o.stepMax = v; } else o[k] += v; };
  // ① 메모리 늘림
  const G = WebAssembly.Memory.prototype.grow;
  WebAssembly.Memory.prototype.grow = function (d) { const before = this.buffer.byteLength / 65536; const t = performance.now(); const r = G.call(this, d); R.grow.push([Date.now(), d, before, +(performance.now() - t).toFixed(3)]); return r; };
  // ② 커널 껍데기 감싸기
  const WW = path.join(__dirname, '..', 'server', 'walk-wasm.js');
  const _load = Module._load;
  Module._load = function (req, parent) {
    const m = _load.apply(this, arguments);
    try {
      const f = Module._resolveFilename(req, parent);
      if (f.endsWith(path.sep + 'walk-wasm.js') && m && m.create && !m.__t689) {
        const c0 = m.create;
        m.create = function (opt) {
          const o2 = Object.assign({}, opt, {
            terrMiss: (x, y) => { bump('terr', 1); return opt.terrMiss(x, y); },
            wallQ: (a, b, c, d) => { bump('wall', 1); return opt.wallQ(a, b, c, d); },
          });
          const W = c0(o2);
          const e0 = W.ensure, s0 = W.step;
          W.ensure = (n, mm) => { const nb = W.n, mb = W.m; const t = performance.now(); e0(n, mm); const ms = performance.now() - t; if (W.n !== nb || W.m !== mb) R.layout.push([Date.now(), n, mm, nb, mb, W.n, W.m, +ms.toFixed(3), W.bytes()]); };
          let tc = 0, wc = 0;   // 걸음 한 번 안의 지형·벽 물음 수
          const tm = o2.terrMiss, wq = o2.wallQ;
          o2.terrMiss = (x, y) => { tc++; return tm(x, y); }; o2.wallQ = (a, b, c, d) => { wc++; return wq(a, b, c, d); };
          W.step = (n, dt) => { tc = 0; wc = 0; const t = performance.now(); const r = s0(n, dt); const ms = performance.now() - t; bump('stepMax', ms); bump('steps', 1); bump('n', n);
            if (ms > 5 || tc > 50) { if (R.bigStep.length < 500) R.bigStep.push([Date.now(), n, +ms.toFixed(2), tc, wc]); }   // 큰 걸음 한 번(5ms 넘음 · 지형 물음 50 넘음)
            return r; };
          return W;
        };
        m.__t689 = true;
      }
    } catch (e) {}
    return m;
  };
  void WW;
  // ③ 표본 힙 프로파일러
  let sess = null;
  if (process.env.T689_HEAP !== '0') {
    try {
      const inspector = require('inspector');
      sess = new inspector.Session(); sess.connect();
      sess.post('HeapProfiler.enable', () => {
        sess.post('HeapProfiler.startSampling', { samplingInterval: +(process.env.T689_HEAP_INT || 65536), includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }, () => {});
      });
      process.on('SIGHUP', () => {   // T686 자가 관측자 붙고 10초 뒤 보낸다 — 부팅 몫을 버린다
        try { sess.post('HeapProfiler.stopSampling', () => { sess.post('HeapProfiler.startSampling', { samplingInterval: +(process.env.T689_HEAP_INT || 65536), includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }, () => {}); }); } catch (e) {}
        R.grow.length = 0; R.layout.length = 0; R.perSec = {}; R.resetAt = Date.now();
      });
    } catch (e) { sess = null; }
  }
  // ④ [T689_ALLOC=1] 틱 구간(T686 자의 구간 표식 `__T686S`/`__T686M`/`__T686VM`)마다 힙 사용량 늘어난 몫 — 할당 바이트 근사
  //    (구간 사이에 GC 가 돌아 줄었으면 그 표본은 버린다 · `v8.getHeapStatistics()` 는 읽기만)
  if (process.env.T689_ALLOC === '1') {
    const v8 = require('v8');
    const used = () => v8.getHeapStatistics().used_heap_size;
    R.alloc = {}; R.allocDrop = 0;
    const put = (k, d) => { if (d < 0) { R.allocDrop++; return; } const o = R.alloc[k] || (R.alloc[k] = { n: 0, sum: 0, max: 0 }); o.n++; o.sum += d; if (d > o.max) o.max = d; };
    let u0 = 0, vu0 = 0;
    const hook = () => {
      const S0 = globalThis.__T686S, M0 = globalThis.__T686M, VS0 = globalThis.__T686VS, VM0 = globalThis.__T686VM;
      if (!S0 || !M0) return setTimeout(hook, 1000);
      globalThis.__T686S = function () { u0 = used(); return S0.apply(this, arguments); };
      globalThis.__T686M = function (k) { const u = used(); put(k, u - u0); u0 = used(); return M0.apply(this, arguments); };
      if (VS0) globalThis.__T686VS = function () { vu0 = used(); return VS0.apply(this, arguments); };
      if (VM0) globalThis.__T686VM = function (k) { const u = used(); put(k, u - vu0); vu0 = used(); return VM0.apply(this, arguments); };
    };
    setTimeout(hook, 1000);
    process.on('SIGHUP', () => { R.alloc = {}; R.allocDrop = 0; });
  }
  const agg = (prof) => {   // 자리별 self 바이트(표본) — 함수 · url:줄
    const by = new Map(); let total = 0;
    const walk = (n) => { const cf = n.callFrame || {}; const k = `${cf.functionName || '(anon)'} ${String(cf.url || '').replace(/^.*\/(server|sim|scripts)\//, '$1/')}:${(cf.lineNumber | 0) + 1}`;
      const sz = n.selfSize || 0; if (sz) { by.set(k, (by.get(k) || 0) + sz); total += sz; } for (const c of n.children || []) walk(c); };
    walk(prof.head);
    return { total, top: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => [k, v, +(v / total * 100).toFixed(2)]) };
  };
  const dump = (prof) => { try { const o = Object.assign({}, R); if (prof) o.heap = agg(prof); fs.writeFileSync(OUT, JSON.stringify(o)); if (prof && process.env.T689_RAW) fs.writeFileSync(OUT + '.heapprofile', JSON.stringify(prof)); } catch (e) {} };
  process.on('SIGUSR2', () => {
    if (!sess) return dump(null);
    try { sess.post('HeapProfiler.stopSampling', (err, r) => dump(err ? null : r && r.profile)); } catch (e) { dump(null); }
  });
}
