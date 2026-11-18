// (@regress 없음 — 러너 밖 · T1338 계측기 · 제품 무변 · 읽기만)
// === scripts/t1338-march-probe.js — 걸음 재개형 탐색(T821 `localPathBegin` · `pathStep`): 날마다 시작 · 끝 · 찾음 · 못 찾음 · 꺼낸 수 · CPU · 동시에 산 탐색 최대 ===
//   쓰는 법: `NODE_OPTIONS="-r $PWD/scripts/t1338-march-probe.js" T1338_MARCH_OUT=<파일.json>` (T1330 탐침은 동기 `localPath` 만 감싸 이 탐색을 못 본다 — 보고 T1338 §2).
//   감싸는 것: path-core `localPathBegin` · `pathStep`(같은 인수 · 같은 반환) — 값은 안 바꾼다. 꺼냄 10만 넘는 탐색은 끝점과 함께 적는다(`big`).
'use strict';
const OUT = process.env.T1338_MARCH_OUT;
if (OUT && process.env.T577_SEED) {
  const fs = require('fs'), path = require('path');
  const PC = require(path.join(process.env.T1338_TREE || path.join(__dirname, '..'), 'sim', 'path-core.js'));
  const Module = require('module'), load0 = Module._load; let VIL = null;
  Module._load = function (req) { const m = load0.apply(this, arguments); if (!VIL && /villages(\.js)?$/.test(req) && m && m.__p3Bind) VIL = m; return m; };
  const cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
  const day = () => { try { return VIL.__p3Bind({}).state.world.day | 0; } catch (e) { return -1; } };
  //   산 탐색은 약한 참조로 센다(손을 놓은 탐색 — 목표 칸이 바뀌어 `_t821s = null` — 을 이 자가 붙들면 그 자체가 힙을 키운다 · 쓰레기가 되면 빠진다)
  const live = new Set(); const rec = { days: {}, big: [] };
  const liveN = () => { let n = 0; for (const w of live) { const S = w.deref(); if (!S || S.done) live.delete(w); else n++; } return n; };
  const refOf = new WeakMap();
  const D = () => { const d = day(); return rec.days[d] || (rec.days[d] = { begin: 0, done: 0, found: 0, fail: 0, pops: 0, ms: 0, maxLive: 0, maxPops: 0, heapMax: 0, over16k: 0 }); };
  const b0 = PC.localPathBegin, s0 = PC.pathStep;
  PC.localPathBegin = function () { const S = b0.apply(this, arguments); const d = D(); d.begin++; if (S) { const w = new WeakRef(S); refOf.set(S, w); live.add(w); const n = liveN(); if (n > d.maxLive) d.maxLive = n; } return S; };
  PC.pathStep = function (S, budget) {
    const t0 = cpu(); const r = s0.apply(this, arguments); const ms = cpu() - t0;
    const w = refOf.get(S);
    if (w && live.has(w)) { const d = D(); d.ms += ms; if (r.done) { live.delete(w); d.done++; d.pops += S.pops; if (r.path) d.found++; else d.fail++; if (S.pops > d.maxPops) d.maxPops = S.pops; if (S.pops > 16384) d.over16k++;
        if (S.pops > 100000 && rec.big.length < 400) rec.big.push({ day: day(), pops: S.pops, found: !!r.path, s: [S.sx, S.sy], g: [S.gx, S.gy] }); }
      const h = process.memoryUsage().heapUsed / 1048576; if (h > d.heapMax) d.heapMax = Math.round(h); }
    return r;
  };
  let lastW = 0; const flush = () => { try { fs.writeFileSync(OUT, JSON.stringify({ live: liveN(), livePops: [...live].reduce((a, w) => { const S = w.deref(); return a + (S ? S.pops : 0); }, 0), ...rec })); } catch (e) {} };
  const RT = (global.__t745Ctl && global.__t745Ctl.rt) || { setInterval };
  const iv = RT.setInterval.call(global, flush, 5000); if (iv.unref) iv.unref();
  process.on('exit', flush);
}
