// (@regress 없음 — 러너 밖 · T1338 계측기 · 제품 무변 · 읽기만)
// === scripts/t1338-tick-probe.js — 무거운 교전 틱의 몫 가르기: 그 틱의 실제 벽시계 · 메인 실 CPU · 모든 실 CPU · 그 틱과 겹친 GC 멈춤 ===================
//   쓰는 법: `NODE_OPTIONS="-r $PWD/scripts/t1338-tick-probe.js" T1338_TICK_OUT=<파일.json>` — T1308 이어 도는 판 자 그대로.
//   ★왜: T1330 탐침(`t1330-path-probe`)의 틱 시간은 `process.cpuUsage`(모든 실 — GC 도우미 실 포함)라 GC 를 가를 수 없었다(T1330 회부 5).
//     가상 시계(`t745-vclock`)는 `Date` · `hrtime` · `performance.now` 를 V 에 묶는다 — 실제 벽시계는 `performance` 원형의 `now`(V 가 덮은 것은 제 칸뿐)로 읽는다.
//     GC 항목(`PerformanceObserver` 'gc')의 `startTime` 은 같은 원형 시계 위의 실제 시각이라 틱 [시작, 끝] 과 겹친 몫을 셀 수 있다.
//   감싸는 것: war-live `stepFight`(같은 인수 · 같은 반환). 판 기준(모든 실 CPU)이 100ms 넘는 틱 · 벽시계가 100ms 넘는 틱만 적는다(최대 400).
'use strict';
const OUT = process.env.T1338_TICK_OUT;
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN && process.env.T577_SEED) {
  const fs = require('fs');
  const PH = require('perf_hooks'), perf = PH.performance, realNow = Object.getPrototypeOf(perf).now.bind(perf);
  const thr = typeof process.threadCpuUsage === 'function' ? () => { const c = process.threadCpuUsage(); return (c.user + c.system) / 1000; } : () => NaN;
  const all = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
  const Module = require('module'), load0 = Module._load; let VIL = null, S = null, wrapped = false;
  Module._load = function (req) { const m = load0.apply(this, arguments); if (!VIL && /villages(\.js)?$/.test(req) && m && m.__p3Bind) VIL = m; return m; };
  const rec = { ticks: [], gcBig: [], n: 0, days: {} };
  try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o && o.days) Object.assign(rec, o); } catch (e) {}
  const gcs = [];   // 최근 GC [시작, 끝, 종류] (실제 시계)
  try { new PH.PerformanceObserver((l) => { for (const e of l.getEntries()) { gcs.push([e.startTime, e.startTime + e.duration, (e.detail && e.detail.kind) || e.kind]); if (gcs.length > 4000) gcs.splice(0, 2000); } }).observe({ entryTypes: ['gc'] }); } catch (e) {}
  const day = () => (S && S.world ? S.world.day | 0 : -1);
  const pend = [];   // GC 항목은 틱 뒤에 온다 — 끝난 무거운 틱은 다음 쓰기에서 겹침을 센다
  const settle = () => { for (let i = pend.length - 1; i >= 0; i--) { const t = pend[i]; let g = 0, k = 0, big = 0;
      for (const [a, b, kind] of gcs) { const o = Math.min(b, t.e) - Math.max(a, t.s); if (o > 0) { g += o; k++; if (kind === 4 || kind === 'major') big += o; } }
      t.gcMs = +g.toFixed(1); t.gcN = k; t.majorMs = +big.toFixed(1); delete t.s; delete t.e; rec.ticks.push(t); pend.splice(i, 1); } };
  let lastW = 0;
  const flush = (force) => { const t = realNow(); if (!force && t - lastW < 5000) return; lastW = t; settle(); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
  const wrap = () => {
    if (wrapped || !VIL) return; try { S = VIL.__p3Bind({}).state; } catch (e) { return; } if (!S || !S.warLive) return; wrapped = true;
    const WL = S.warLive, st = WL.stepFight;
    WL.stepFight = function (f) {
      const w0 = realNow(), c0 = all(), m0 = thr();
      let r; try { r = st.apply(this, arguments); } finally {
        const w1 = realNow(), c1 = all(), m1 = thr(), d = day();
        const D = rec.days[d] || (rec.days[d] = { n: 0, wall: 0, main: 0, all: 0, over100all: 0, over100wall: 0, over100main: 0 });
        D.n++; D.wall += w1 - w0; D.main += m1 - m0; D.all += c1 - c0;
        if (c1 - c0 > 100) D.over100all++; if (w1 - w0 > 100) D.over100wall++; if (m1 - m0 > 100) D.over100main++;
        if ((c1 - c0 > 100 || w1 - w0 > 100) && rec.ticks.length + pend.length < 400) {
          let a = 0; const us = f && f.ctx ? f.ctx.units : []; for (const u of us) if (u.hp > 0) a++;
          pend.push({ day: d, s: w0, e: w1, wall: +(w1 - w0).toFixed(1), main: +(m1 - m0).toFixed(1), all: +(c1 - c0).toFixed(1), alive: a, state: f && f.state });
        }
        rec.n++;
      }
      flush(false);
      return r;
    };
  };
  const RT = (global.__t745Ctl && global.__t745Ctl.rt) || { setInterval };   // 실제 타이머(가상 줄에 안 낀다)
  const iv = RT.setInterval.call(global, () => { wrap(); flush(true); }, 3000); if (iv.unref) iv.unref();
  process.on('exit', () => flush(true));
}
