// T1452 장부 셈 µs 자(세계 0 · 읽기만) — 앞날 장부 한 번 셈(`t1452Ahead` · 365걸음)의 실제 시간 나눔 · 하루 마을 다 합 · 가장 긴 셈과 GC 겹침
//   판 훅(t1452hook.js)의 `t1452Stat` 은 셈 횟수 · 합 · 가장 긴 것만 낸다 — 가장 긴 것(10 ~ 41 ms)이 셈 탓인지 못 가른다 ⇒ 이 자가 가른다(같은 칸으로 셋 셈 · 가장 짧은 것 = 셈 몫 · 랩은 `--trace-gc` 줄과 시각 견줌).
//   날마다(랩 `tickWorldV2` 뒤 · 서버 장부 `scanDay` 뒤) 장부가 있는 마을마다 그날 캐시(`R.out`)를 비우고 한 번 더 셈해 잰다 — 같은 칸에서 같은 답
//   (재는 판 `T1452_SHADOW=1` 에서만 쓴다 — 세계가 장부를 안 읽는 판 · 캐시를 비워도 세계 0).
//   시계: 이 파일이 가상 시계 자(t745-vclock)보다 **먼저** 실리면 진짜 `performance.now` 를 쥔다(서버 판) · 랩은 가상 시계 없음.
//   T1452_BENCH_TRACE=1 — 마을 · 날마다 여유분 자의 재료도 적는다(`tr` — [날 차례, 날, 뜻밖의 누적 x, 오늘 하루 차 예상 pN, 하루치 pC, 밭 칸 오늘 몫 fm[날], 내일 몫 fm[날+1], 곳간, 밭 거둠 누계, 사람])
//     — 여유분(x 의 한 해 낙폭)이 무엇으로 크는지 가르는 자(보고 §3 · 회부): 지난 해 같은 날 흐름의 들쭉날쭉 / 익었는데 안 거둔 칸을 날마다 다시 '오늘 든다'로 예상
//   env: T1452_BENCH_OUT=<json> · T1452_ROOT=<레포 뿌리> · T1452_BENCH_FROM=<첫 날 몇 째부터 잴지 · 기본 1> · 랩은 T1452_BENCH_LAB=1(서버는 아이 존 `T577_SEED` 에서만 깬다 — 부모 러너 · 일꾼 스레드 0)
'use strict';
const _OUT = process.env.T1452_BENCH_OUT;
let _main = true; try { _main = require('worker_threads').isMainThread; } catch (e) { }
if (_OUT && _main && (process.env.T1452_BENCH_LAB === '1' || process.env.T577_SEED)) {
  const path = require('path'), fs = require('fs');
  const ph = require('perf_hooks');
  const realNow = ph.performance.now.bind(ph.performance);   // 가상 시계 앞에서 쥔 진짜 시계
  const ROOT = process.env.T1452_ROOT || path.resolve(__dirname, '..', '..');
  const FROM = parseInt(process.env.T1452_BENCH_FROM || '1', 10) || 1;
  const SERVER = !!process.env.T577_SEED;
  let E = null;
  const ev = [], dayTot = [];   // ev = [µs, 날, 마을, 시작 ms]
  const TRACE = process.env.T1452_BENCH_TRACE === '1', tr = {};
  let n = 0, lastDay = null, err = null;
  const step = (world, day) => {
    n++;
    if (!E) E = require(path.join(ROOT, 'sim', 'economy-sim'));
    if (!E.t1452Ahead) return;
    const timed = n >= FROM;   // 셈 잼은 FROM 째 날부터 · 여유분 재료(tr)는 첫날부터
    let tot = 0, k = 0;
    for (const v of (world.villages || [])) {
      if (!v || v.founder || !v._t1452) continue;
      if (TRACE) { const R = v._t1452, fm = v._t1452Fm || {}; (tr[v.name] = tr[v.name] || []).push([n, day, R.x, R.pN, R.pC, fm[day] || 0, fm[day + 1] || 0, E.totalFoodEquivalent(v), v._t368FoodTot || 0, (v.npcs || []).length].map((z) => typeof z === 'number' ? Math.round(z * 1000) / 1000 : z)); }
      if (!timed) continue;
      v._t1452.out = null;
      const t0 = realNow(); const A = E.t1452Ahead(v, day); const t1 = realNow();
      if (!A) continue;
      let mn = t1 - t0;
      for (let r = 0; r < 2; r++) { v._t1452.out = null; const a = realNow(); E.t1452Ahead(v, day); const b = realNow(); if (b - a < mn) mn = b - a; }   // 셋 가운데 가장 짧은 것 = 셈 몫(GC · JIT 가 한 번에 끼면 나머지 둘이 가른다)
      const us = (t1 - t0) * 1000; tot += us; k++;
      ev.push([Math.round(us * 10) / 10, n, v.name, Math.round(t0 * 1000) / 1000, Math.round(mn * 10000) / 10]);
    }
    if (k) dayTot.push([Math.round(tot), k]);
  };
  const write = () => {
    try {
      const xs = ev.map((e) => e[0]).sort((a, b) => a - b);
      const q = (p) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : null;
      const ms = ev.map((e) => e[4]).sort((a, b) => a - b);
      const qm = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : null;
      const ds = dayTot.map((d) => d[0]).sort((a, b) => a - b);
      const qd = (p) => ds.length ? ds[Math.min(ds.length - 1, Math.floor(p * ds.length))] : null;
      const top = ev.slice().sort((a, b) => b[0] - a[0]).slice(0, 40).map((e) => ({ us: e[0], usMin3: e[4], day: e[1], vil: e[2], t0: e[3] }));   // t0 = 진짜 시계 ms(`--trace-gc` 줄의 ms 와 같은 밑 — 견줌은 t1452_bench_gc.py)
      const slow = ev.filter((e) => e[0] > 1000), slowFast = slow.filter((e) => e[4] < 1000).length;   // 1 ms 넘은 첫 셈 · 그 가운데 다시 셈이 1 ms 밑인 것(셈 몫이 아님)
      fs.writeFileSync(_OUT, JSON.stringify({ server: SERVER, slow1ms: { n: slow.length, min3Under1ms: slowFast }, days: dayTot.length, evals: xs.length,
        us: { p50: q(0.5), p90: q(0.9), p99: q(0.99), p999: q(0.999), max: xs.length ? xs[xs.length - 1] : null, mean: xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length * 10) / 10 : null },
        usMin3: { p50: qm(0.5), p90: qm(0.9), p99: qm(0.99), p999: qm(0.999), max: ms.length ? ms[ms.length - 1] : null },
        dayUs: { p50: qd(0.5), p90: qd(0.9), max: ds.length ? ds[ds.length - 1] : null, villages: dayTot.length ? dayTot[dayTot.length - 1][1] : 0 },
        from: FROM, top, err, tr: TRACE ? tr : undefined }));
    } catch (e) { }
  };
  if (!SERVER) {
    let V2 = null; try { V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2')); } catch (e) { V2 = null; }
    if (V2 && V2.tickWorldV2) {
      const orig = V2.tickWorldV2;
      V2.tickWorldV2 = function (world) { const r = orig.apply(this, arguments); try { step(world, world.day); } catch (e) { if (!err) err = String(e && e.stack || e); } return r; };
    }
  } else {
    const Ev = require(path.join(ROOT, 'server', 'events'));
    const mk = Ev.createLedger;
    Ev.createLedger = function () {
      const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
      Lg.scanDay = function (world, day) {
        const r = sd.apply(this, arguments);
        try { if ((day | 0) !== lastDay) { lastDay = day | 0; step(world, day | 0); } } catch (e) { if (!err) err = String(e && e.stack || e); }
        return r;
      };
      return Lg;
    };
  }
  process.on('exit', write);
}
