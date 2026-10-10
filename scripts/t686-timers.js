'use strict';
// === scripts/t686-timers.js — 틱 밖 주기 작업 재기: 타이머 콜백을 만든 자리별 ms (T686 · 존에 `--require` 로 싣는다 · 제품 무접촉) ======
//
// ★`setInterval` · `setTimeout` · `setImmediate` 를 감싸 콜백 하나가 이벤트 루프를 얼마나 잡았나 잰다 — 자리 = 그 타이머를 만든
//   첫 서버 프레임(`server/…:줄`). 게임 틱(30Hz setInterval)도 한 자리로 잡힌다(틱 본문 + 그 안의 GC).
// ★이벤트 루프 지연(`monitorEventLoopDelay` 10ms) · GC(종류별 횟수·합·최대 · 30ms 넘는 GC 목록)를 같이 쓴다.
// 손잡이: `T686_TIMERS_OUT`(없으면 아무것도 안 한다). SIGUSR1 이면 바로 쓴다(그 밖엔 30초마다).
const OUT = process.env.T686_TIMERS_OUT;
if (OUT) {
  const fs = require('fs');
  const { performance, monitorEventLoopDelay, PerformanceObserver } = require('perf_hooks');
  const now = () => performance.now();
  const S = new Map();   // 자리 → { kind, n, tot, max, o10, o30, big: [[at, ms]] }
  const site = () => {
    const L = String(new Error().stack).split('\n');
    for (let i = 2; i < L.length; i++) { const x = L[i]; if (x.includes('t686-timers.js') || x.includes('node:')) continue;
      const m = x.match(/([^/\\ (]+\/[^/\\ (]+\.js):(\d+)/); if (m) return m[1] + ':' + m[2]; }
    return '(모름)';
  };
  const wrap = (kind, fn, where) => {
    if (typeof fn !== 'function') return fn;
    return function () {
      const a = now();
      try { return fn.apply(this, arguments); }
      finally {
        const d = now() - a; const k = kind + ' ' + where;
        let r = S.get(k); if (!r) { r = { n: 0, tot: 0, max: 0, o10: 0, o30: 0, big: [] }; S.set(k, r); }
        r.n++; r.tot += d; if (d > r.max) r.max = d; if (d > 10) r.o10++; if (d > 30) { r.o30++; if (r.big.length < 400) r.big.push([Date.now(), +d.toFixed(1)]); }
      }
    };
  };
  const oSI = global.setInterval, oST = global.setTimeout, oSIm = global.setImmediate;
  global.setInterval = function (fn, ms, ...rest) { return oSI.call(this, wrap(`setInterval(${ms})`, fn, site()), ms, ...rest); };
  global.setTimeout = function (fn, ms, ...rest) { return oST.call(this, wrap('setTimeout', fn, site()), ms, ...rest); };
  global.setImmediate = function (fn, ...rest) { return oSIm.call(this, wrap('setImmediate', fn, site()), ...rest); };
  // 이 파일 자신의 쓰기는 감싸지 않는다(원본으로 건다)
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  const GC = {}; const gcBig = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { const k = (e.detail && e.detail.kind) || e.kind || 0;
    const g = GC[k] || (GC[k] = { n: 0, tot: 0, max: 0 }); g.n++; g.tot += e.duration; if (e.duration > g.max) g.max = e.duration;
    if (e.duration > 5 && gcBig.length < 2000) gcBig.push([Date.now(), k, +e.duration.toFixed(1), +e.startTime.toFixed(1)]); } }).observe({ entryTypes: ['gc'] }); } catch (e) {}
  const write = () => {
    try {
      const sites = [...S].map(([k, r]) => Object.assign({ k }, r, { tot: +r.tot.toFixed(1), max: +r.max.toFixed(1) })).sort((a, b) => b.tot - a.tot);
      fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), loop: { p50: h.percentile(50) / 1e6, p99: h.percentile(99) / 1e6, max: h.max / 1e6, mean: h.mean / 1e6, n: h.count },
        gc: GC, gcBig, sites }));
    } catch (e) {}
  };
  const iv = oSI(write, 30000); if (iv.unref) iv.unref();
  process.on('SIGUSR1', write);
  process.on('SIGHUP', () => { S.clear(); h.reset(); for (const k in GC) delete GC[k]; gcBig.length = 0; });   // 부팅 몫을 뺀다(러너가 관측자를 붙인 뒤 보낸다)
}
