// (@regress 없음 — 러너 밖 · T1338 계측기 · 제품 무변 · 읽기만)
// === scripts/t1338-heap-probe.js — 존 아이의 힙: 날마다 heapUsed · villages state 윗칸 크기 · 5날마다 힙 공간 · 100ms 넘는 GC(날 · 종류 · 길이) ===================
//   쓰는 법: `NODE_OPTIONS="-r $PWD/scripts/t1338-heap-probe.js" T1338_HEAP_OUT=<파일.json>` — T1308 이어 도는 판 자 그대로(GC 는 `<파일>.gc.json`).
//   타이머는 가상 시계(`t745-vclock`)의 실제 타이머(`__t745Ctl.rt`)로 건다 — 가상 줄에 안 낀다(판 차례 무접촉).
'use strict';
const OUT = process.env.T1338_HEAP_OUT;
if (OUT && process.env.T577_SEED) {
  const fs = require('fs'), v8 = require('v8');
  const Module = require('module'), load0 = Module._load; let VIL = null;
  Module._load = function (req) { const m = load0.apply(this, arguments); if (!VIL && /villages(\.js)?$/.test(req) && m && m.__p3Bind) VIL = m; return m; };
  const rec = []; let lastDay = -1, lastT = 0;
  const cnt = (v, budget) => {   // 닿는 노드 수(상한 budget) — 무엇이 큰지 가늠
    const seen = new Set(), st = [v]; let n = 0;
    while (st.length && n < budget) { const x = st.pop(); if (!x || typeof x !== 'object' || seen.has(x)) continue; seen.add(x); n++;
      if (x instanceof Map) { for (const [k, y] of x) { st.push(k); st.push(y); } } else if (x instanceof Set) { for (const y of x) st.push(y); }
      else if (ArrayBuffer.isView(x)) { n += x.length >> 3; } else { for (const k in x) { try { st.push(x[k]); } catch (e) {} } } }
    return n;
  };
  const shape = (v) => v instanceof Map || v instanceof Set ? v.size : Array.isArray(v) ? v.length : (v && typeof v === 'object') ? Object.keys(v).length : -1;
  let snap = (force) => {
    if (!VIL) return; let S; try { S = VIL.__p3Bind({}).state; } catch (e) { return; } if (!S || !S.world) return;
    const d = S.world.day | 0, t = Number(process.hrtime.bigint() / 1000000n);
    if (!force && d === lastDay && t - lastT < 60000) return; lastDay = d; lastT = t;
    const deep = d % 5 === 0 || force;
    const h = process.memoryUsage(), o = { day: d, at: t, heap: Math.round(h.heapUsed / 1048576), ext: Math.round(h.external / 1048576), rss: Math.round(h.rss / 1048576), keys: {} };
    for (const k of Object.keys(S)) { const v = S[k]; if (!v || typeof v !== 'object') continue; const e = [shape(v)]; if (deep) e.push(cnt(v, 3e6)); o.keys[k] = e; }
    if (deep) { o.spaces = {}; for (const s of v8.getHeapSpaceStatistics()) o.spaces[s.space_name] = Math.round(s.space_used_size / 1048576); }
    rec.push(o); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {}
  };
  const RT = (global.__t745Ctl && global.__t745Ctl.rt) || { setInterval };   // 실제 타이머(가상 줄에 안 낀다 — 판 차례 무접촉)
    // GC 멈춤 — 100ms 넘는 것(날 · 종류 · 길이 · 그때 heap)
  const gcs = []; let gcN = 0, gcMs = 0;
  try { const { PerformanceObserver } = require('perf_hooks');
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { gcN++; gcMs += e.duration; if (e.duration >= 100 && gcs.length < 5000) { let d = -1; try { d = VIL.__p3Bind({}).state.world.day | 0; } catch (x) {}
      gcs.push({ day: d, ms: +e.duration.toFixed(1), kind: (e.detail && e.detail.kind) || e.kind, heap: Math.round(process.memoryUsage().heapUsed / 1048576) }); } } }).observe({ entryTypes: ['gc'] }); } catch (e) {}
  const snap0 = snap; snap = (f) => { snap0(f); try { fs.writeFileSync(OUT.replace(/\.json$/, '') + '.gc.json', JSON.stringify({ n: gcN, ms: Math.round(gcMs), big: gcs })); } catch (e) {} };
  const iv = RT.setInterval.call(global, () => snap(false), 3000); if (iv.unref) iv.unref();
  process.on('exit', () => snap(true));
}
