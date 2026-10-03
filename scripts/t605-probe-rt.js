'use strict';
// === scripts/t605-probe-rt.js — T605 자의 런타임 누산기 (존에 `-r` 로 싣는다 · 제품 무접촉) ==========================
//
// ★계측기다(러너 밖). 이 파일은 `globalThis.__T605` 하나만 세운다. 값을 넣는 글자는 `t605-probe-lib.js` 가
//   **git worktree 사본**에만 박는다(T356 자 문법 — 제품 파일은 한 글자도 안 바뀐다). 사본 없이 이 파일만 실으면 아무 일도 안 한다.
// ★무엇을 적나
//   ⓐ mark(k)        — 부팅 단계 표식(프로세스 시작부터 ms · 힙 · RSS). `T605_GC=1` 이면 표식마다 gc() 뒤 힙도(★ⓑ 규약 — `--expose-gc` 필요).
//   ⓑ wrap(name, fn) — 함수 몫: 호출 수 · 합 ms · 최대 ms · 조각 예산(16ms) 넘은 수. 시계는 performance.now(할당 0 — T356 교훈).
//   ⓒ tick(ms)       — 틱 본문 소요(zone.js `_tickMs` 고리와 같은 값)를 히스토그램에 — 판 전체 p50·p95·최대(고리 3,000 개로는 30일을 못 본다).
//   ⓓ 창(T605_WIN_S · 기본 600초)마다 그 창의 틱 분포·함수 몫 증분을 적고, 전체를 T605_OUT 에 덮어쓴다(죽어도 마지막 창까지 남는다).
// ★자기 값: 기동 때 시계 한 번(ns)을 잰다(`clockNs`) — 보는 쪽이 `2 × clockNs × 호출 수` 를 뺀다(T356 문법 · 추정 아닌 계수).
const fs = require('fs');
const { performance } = require('perf_hooks');
const OUT = process.env.T605_OUT || '';
const WIN_S = parseInt(process.env.T605_WIN_S || '600', 10);
const SLICE = parseInt(process.env.VILLAGE_TICK_SLICE_MS || '16', 10) || 16;   // 조각 예산 — 슬라이서 손잡이 그대로(새 수 0)
const now = () => performance.now();
// 히스토그램: 0~10ms 0.01ms 칸 · 10~1010ms 0.5ms 칸 · 그 위 한 칸
const NB = 1000 + 2000 + 1;
const bOf = (ms) => (ms < 10 ? Math.floor(ms * 100) : Math.min(NB - 1, 1000 + Math.floor((ms - 10) * 2)));
const msOf = (b) => (b < 1000 ? (b + 0.5) / 100 : (b < NB - 1 ? 10 + (b - 1000 + 0.5) / 2 : 1010));
function newHist() { return { h: new Uint32Array(NB), n: 0, sum: 0, max: 0, over: 0, over33: 0 }; }
function hAdd(H, ms) { H.h[bOf(ms)]++; H.n++; H.sum += ms; if (ms > H.max) H.max = ms; if (ms > SLICE) H.over++; if (ms > 33.3) H.over33++; }
function hQ(H, p) { if (!H.n) return 0; const want = Math.ceil(H.n * p); let c = 0; for (let b = 0; b < NB; b++) { c += H.h[b]; if (c >= want) return +msOf(b).toFixed(3); } return H.max; }
function hSum(H) { return { n: H.n, mean: H.n ? +(H.sum / H.n).toFixed(3) : 0, p50: hQ(H, 0.5), p95: hQ(H, 0.95), p99: hQ(H, 0.99), max: +H.max.toFixed(2), overSlice: H.over, over33: H.over33 }; }

const T = {
  t0: Date.now(), marks: [], acc: Object.create(null), all: newHist(), win: newHist(), wins: [], winAcc: Object.create(null), clockNs: 0,
  mark(k, extra) {
    const m = process.memoryUsage();
    const r = { k, t: +(process.uptime() * 1000).toFixed(0), heapMB: +(m.heapUsed / 1048576).toFixed(1), rssMB: +(m.rss / 1048576).toFixed(1) };
    if (process.env.T605_GC === '1' && typeof global.gc === 'function') { global.gc(); r.heapGcMB = +(process.memoryUsage().heapUsed / 1048576).toFixed(1); }
    try { const m2 = fs.readFileSync('/proc/self/status', 'utf8').match(/VmHWM:\s+(\d+)/); if (m2) r.hwmMB = +(m2[1] / 1024).toFixed(1); } catch (e) {}   // 봉우리(밖에서 보는 값과 같은 줄)
    if (extra) Object.assign(r, extra);
    T.marks.push(r);
    try { console.log('[T605] mark ' + JSON.stringify(r)); } catch (e) {}
    T.dump();
  },
  _a(name) { return T.acc[name] || (T.acc[name] = { n: 0, ms: 0, max: 0, over: 0 }); },
  winMax: Object.create(null),
  add(name, ms) { const a = T._a(name); a.n++; a.ms += ms; if (ms > a.max) a.max = ms; if (ms > SLICE) a.over++; if (!(T.winMax[name] >= ms)) T.winMax[name] = ms; },
  wrap(name, fn) {
    if (typeof fn !== 'function') return fn;
    const w = function () { const s = now(); try { return fn.apply(this, arguments); } finally { T.add(name, now() - s); } };
    w.__t605 = fn; return w;
  },
  tick(ms) { hAdd(T.all, ms); hAdd(T.win, ms); },
  snapAcc() { const o = {}; for (const k in T.acc) { const a = T.acc[k]; o[k] = { n: a.n, ms: +a.ms.toFixed(2), max: +a.max.toFixed(2), over: a.over }; } return o; },
  roll() {
    const cur = T.snapAcc(), d = {};
    for (const k in cur) { const p = T.winAcc[k] || { n: 0, ms: 0, over: 0 }; d[k] = { n: cur[k].n - p.n, ms: +(cur[k].ms - p.ms).toFixed(2), over: cur[k].over - p.over, max: +(T.winMax[k] || 0).toFixed(2) }; }
    T.winMax = Object.create(null);
    T.winAcc = cur;
    let extra = null; try { extra = T.sample ? T.sample() : null; } catch (e) {}
    T.wins.push({ tS: Math.round((Date.now() - T.t0) / 1000), tick: hSum(T.win), acc: d, extra, heapMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1), rssMB: +(process.memoryUsage().rss / 1048576).toFixed(1) });
    T.win = newHist();
    T.dump();
  },
  dump() {
    if (!OUT) return;
    try { fs.writeFileSync(OUT, JSON.stringify({ pid: process.pid, zone: process.env.ZONE_ID, clockNs: T.clockNs, slice: SLICE, marks: T.marks, acc: T.snapAcc(), tick: hSum(T.all), wins: T.wins })); } catch (e) {}
  },
};
{ const P = 200000, a = now(); let x = 0; for (let i = 0; i < P; i++) x += now(); T.clockNs = +((now() - a) * 1e6 / P).toFixed(1); if (x < 0) console.log(x); }
globalThis.__T605 = T;
// ⓔ `T605_TIMERS=1` — 루프를 잡는 것이 틱 밖에 있나: 존이 거는 타이머(setInterval·setTimeout·setImmediate)의 콜백을
//   **건 자리**(server/ 아래 첫 줄 · 파일:줄)마다 잰다 — `timer:<파일:줄>` 몫. 틱 자체(setInterval 하나)도 여기 한 줄로 나온다.
//   건 자리를 찾느라 거는 순간마다 스택을 한 번 읽는다(값을 바꾸지 않는다 · 콜백은 그대로 같은 인자로 부른다).
if (process.env.T605_TIMERS === '1') {
  const where = () => { const st = String(new Error().stack).split('\n'); for (const l of st) { const m = l.match(/[\/\\]server[\/\\]([\w.-]+\.js):(\d+)/); if (m) return m[1] + ':' + m[2]; } return null; };
  for (const nm of ['setInterval', 'setTimeout', 'setImmediate']) {
    const orig = global[nm];
    global[nm] = function (fn, ...rest) {
      if (typeof fn !== 'function') return orig.call(this, fn, ...rest);
      const w = where();
      if (!w) return orig.call(this, fn, ...rest);
      const key = 'timer:' + w;
      const wrapped = function () { const s = now(); try { return fn.apply(this, arguments); } finally { T.add(key, now() - s); } };
      return orig.call(this, wrapped, ...rest);
    };
  }
}
T.mark('preload');
// ⓕ GC 정지 — 틱·타이머 밖에서 루프를 잡는 것의 하나(`gc:<종류>` 몫 · perf_hooks 관측 · 값 무변)
try {
  const { PerformanceObserver, constants: C } = require('perf_hooks');
  const KN = { [C.NODE_PERFORMANCE_GC_MAJOR]: 'major', [C.NODE_PERFORMANCE_GC_MINOR]: 'minor', [C.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incr', [C.NODE_PERFORMANCE_GC_WEAKCB]: 'weak' };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) T.add('gc:' + (KN[(e.detail && e.detail.kind) || e.kind] || 'other'), e.duration); }).observe({ entryTypes: ['gc'] });
} catch (e) {}
if (WIN_S > 0) setInterval(() => T.roll(), WIN_S * 1000).unref();
process.on('exit', () => T.dump());
