'use strict';
// (@regress 없음 — 러너 밖 · T1503 판 귀 · 제품 파일 무변 · 읽기만)
// =============================================================================
// scripts/t1503-probe.js — 하루 마감 조각마다 CPU 를 잰다(`NODE_OPTIONS=--require` · 존 프로세스만 · `T1503_OUT` 이 있을 때만) [T1503 · S14]
//   왜: 가상 시계 판(T745)은 한 콜백 안에서 시각이 안 흘러 마감이 경계 틱 한 번에 다 돈다(몫이 안 닳는다) — 틱 길이를 벽시계로 못 잰다.
//     그래서 조각(`state.tickJobs` 의 한 줄 = `j.f()` 한 번)마다 **CPU**(process.cpuUsage — 가상 시계가 안 덮는다)를 적고,
//     제품 드레인 규칙(`_drainTickJobs` — 조각 사이에서만 몫을 본다 · 몫 = `VILLAGE_TICK_SLICE_MS` 16)대로 조각을 틱에 담아 **가장 긴 틱의 마감 몫**을 셈한다.
//     실시계 판(rig)에서는 실제 드레인 틱(프레임)마다 CPU 합도 같이 적는다(셈 ↔ 실제 대조).
//   어떻게: villages.js 를 읽을 때 이 프로세스 안 사본 글자 두 곳에 귀 한 줄씩(조각 한 번 · 드레인 틱 머리) — 부르는 함수 · 차례 · 값 무변(감싸서 그대로 부른다).
//   출력: `$T1503_OUT.jsonl` — 마감 한 번(조각 줄이 빌 때 · 또는 `C` 가 바뀔 때)마다 한 줄 { d, kind(tail|mini|t690), n, sumMs, max:[이름, ms], top:[[이름, 합 ms, 최대 ms, 수]…],
//         frames(실제 드레인 틱 수), frameMaxMs(실제 틱 CPU 최대), sim16(16ms 몫으로 담은 가장 긴 틱 ms), sim16At(그 틱 첫 조각) }
//   ★둘째 귀(`T1503_EAR=<앞머리>` · 실시계 판) — `t1489-probe.js`(가지 batch/boot-close-1128 · 이 가지에 없다)의 ① ② 를 옮겼다(샘플러 ③ 은 뺌):
//     ① 마감 한 줄 `<앞머리>.closes.jsonl` — `state.tickJobs` 가 서고 지는 때(hrtime 벽시계 · CPU) · 제품 `tickCtx` 값(프레임 · 최대 조각 · 단계)
//     ② 줄 선 요청 `<앞머리>.queue.jsonl` — `villageBookWait/villageWait` 를 같은 인자 · 같은 반환으로 감싸 기다린 시간 · 메시지 종류
// =============================================================================
const OUT = process.env.T1503_OUT || '';
const EAR = process.env.T1503_EAR || '';
if (EAR && /zone\.js$/.test(String(process.argv[1] || ''))) {
  try {
    const fs = require('fs');
    const Module = require('module');
    const { monitorEventLoopDelay } = require('perf_hooks');
    const T0 = Date.now();
    const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
    const put = (f, o) => { try { o.t = Date.now() - T0; fs.appendFileSync(EAR + '.' + f + '.jsonl', JSON.stringify(o) + '\n'); } catch (e) { /* 귀는 판을 건드리지 않는다 */ } };
    const cur = { type: null };
    let t0c = null, c0 = null, wsWrapped = false, bookWrapped = false;
    const KEY = 'tickJobs';
    Object.defineProperty(Object.prototype, KEY, {
      configurable: true, enumerable: false,
      get() { return undefined; },
      set(v) {
        let store = v;
        const note = (prev, nv, self) => {
          try {
            if (!prev && nv) { t0c = process.hrtime.bigint(); c0 = process.cpuUsage(); h.reset(); }
            else if (prev && !nv && t0c != null) {
              const wall = Number(process.hrtime.bigint() - t0c) / 1e6; t0c = null;
              const cu = process.cpuUsage(c0), cpu = (cu.user + cu.system) / 1000;
              const C = self.tickCtx || {}, L = self.world || {};
              const st = C.stg || {};
              const stg = Object.entries(st).filter(([k, x]) => typeof x === 'number' && !/·max$/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, x]) => [k, +x.toFixed(1)]);
              put('closes', { day: L.day | 0, wall: +wall.toFixed(1), cpu: +cpu.toFixed(1), frames: C.frames, chunks: C.chunks, maxChunk: C.maxChunk, frameMax: C.frameMax, at: C.maxChunkAt, villages: C.vils ? C.vils.length : null, mini: C.t731mini ? 1 : 0, t690: C.t690 ? 1 : 0, dist: st.dist || 0, stg, lag: { p99: Math.round(h.percentile(99) / 1e6), max: Math.round(h.max / 1e6) } });
            }
          } catch (e) { /* */ }
        };
        try {
          Object.defineProperty(this, KEY, { configurable: true, enumerable: true, get() { return store; }, set(nv) { const prev = store; store = nv; note(prev, nv, this); } });
          note(null, v, this);
        } catch (e) { try { Object.defineProperty(this, KEY, { value: v, writable: true, configurable: true, enumerable: true }); } catch (e2) { /* */ } }
      },
    });
    const origReq = Module.prototype.require;
    Module.prototype.require = function (id) {
      const m = origReq.apply(this, arguments);
      try {
        const f = Module._resolveFilename(id, this);
        if (/server[\\/]villages\.js$/.test(f) && !bookWrapped) {
          bookWrapped = true;
          for (const nm of ['villageBookWait', 'villageWait']) {
            const ow = m[nm]; if (typeof ow !== 'function') continue;
            m[nm] = function (fn) {
              const type = cur.type, t0 = process.hrtime.bigint();
              const w = function () { put('queue', { type, waitMs: +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1), via: nm }); return fn.apply(this, arguments); };
              return ow.call(this, typeof fn === 'function' ? w : fn);
            };
          }
        }
        if (!wsWrapped && id === 'ws' && m && m.Server && m.Server.prototype) {
          wsWrapped = true;
          const oe = m.Server.prototype.emit;
          m.Server.prototype.emit = function (ev, ws) {
            try {
              if (ev === 'connection' && ws && typeof ws.on === 'function') {
                const on0 = ws.on;
                ws.on = function (evn, fn) {
                  if (evn === 'message' && typeof fn === 'function' && !fn.__t1503) {
                    const w = function (raw) {
                      try { const s2 = raw && raw.toString ? raw.toString('utf8', 0, 80) : ''; const mm = /"type":"([a-z_]+)"/.exec(s2); cur.type = mm ? mm[1] : null; } catch (e) { cur.type = null; }
                      try { return fn.apply(this, arguments); } finally { cur.type = null; }
                    };
                    w.__t1503 = 1;
                    return on0.call(this, evn, w);
                  }
                  return on0.apply(this, arguments);
                };
              }
            } catch (e) { /* */ }
            return oe.apply(this, arguments);
          };
        }
      } catch (e) { /* 없어도 판은 돈다 */ }
      return m;
    };
  } catch (e) { /* 없어도 판은 돈다 */ }
}
if (OUT) {
  const fs = require('fs');
  const Module = require('module');
  const isVill = (f) => /[\\/]server[\\/]villages\.js$/.test(f);
  const _load = Module._extensions['.js'];
  const A = '      const rv = j.f();\n';
  const B = '  const f0 = Date.now(), _B = ';   // 드레인 틱 머리(그 뒤 글자는 손잡이마다 다르다 — 앞머리만 문다)
  let patched = 0;
  Module._extensions['.js'] = function (m, filename) {
    if (isVill(filename)) {
      let src = fs.readFileSync(filename, 'utf8');
      if (src.split(A).length === 2) { src = src.replace(A, '      const rv = global.__t1503Job ? global.__t1503Job(j, C, state) : j.f();\n'); patched++; }
      if (src.split(B).length === 2) { src = src.replace(B, '  if (global.__t1503Frame) global.__t1503Frame(C);' + B.slice(1)); patched++; }
      if (patched !== 2) console.error(`[t1503-probe] 귀 자리 ${patched}/2 — 제품 글자가 바뀌었다`);
      return m._compile(src, filename);
    }
    return _load(m, filename);
  };
  const BUD = (() => { const v = parseInt(process.env.VILLAGE_TICK_SLICE_MS || '', 10); return Number.isFinite(v) && v >= 0 ? v : 16; })();
  let cur = null;   // { C, d, kind, jobs:[[name, ms]], frames:[[ms]], fcur }
  const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
  function flush() {
    if (!cur) return;
    const R = cur; cur = null;
    const J = R.jobs; if (!J.length) return;
    let sum = 0, mx = ['', 0]; const by = new Map();
    for (const [n, ms] of J) { sum += ms; if (ms > mx[1]) mx = [n, ms]; const b = by.get(n) || [0, 0, 0]; b[0] += ms; if (ms > b[1]) b[1] = ms; b[2]++; by.set(n, b); }
    // 제품 드레인 규칙대로 담기: 틱 머리에서 조각 하나는 반드시 · 그 뒤 조각 사이에서 몫(BUD)을 본다
    let sim = 0, simAt = '', i = 0;
    while (i < J.length) { let t = 0; const at = J[i][0]; do { t += J[i][1]; i++; } while (i < J.length && (BUD === 0 || t < BUD)); if (t > sim) { sim = t; simAt = at; } }
    const fr = R.frames.map((f) => f[0]);
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const top = [...by.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, 12).map(([n, b]) => [n, r3(b[0]), r3(b[1]), b[2]]);
    const o = { d: R.d, kind: R.kind, n: J.length, sumMs: r3(sum), max: [mx[0], r3(mx[1])], top, frames: fr.length, frameMaxMs: r3(fr.length ? Math.max(...fr) : 0), sim16: r3(sim), sim16At: simAt, t: Date.now() };
    try { fs.appendFileSync(OUT + '.jsonl', JSON.stringify(o) + '\n'); } catch (e) { /* */ }
  }
  global.__t1503Frame = function (C) {
    if (!cur || cur.C !== C) { flush(); cur = { C, d: null, kind: C.t690 ? 't690' : (C.t731mini ? 'mini' : 'tail'), jobs: [], frames: [] }; }
    cur.frames.push([0]); cur.fcur = cur.frames[cur.frames.length - 1];
  };
  global.__t1503Job = function (j, C, state) {
    if (!cur || cur.C !== C) global.__t1503Frame(C);
    if (cur.d == null) cur.d = state && state.world ? state.world.day | 0 : null;
    cur.kind = C.t690 ? 't690' : (C.t731mini ? 'mini' : 'tail');
    const a = cpu();
    try { return j.f(); } finally { const ms = cpu() - a; cur.jobs.push([(j.sf && j.sf()) || j.s || j.n, ms]); if (cur.fcur) cur.fcur[0] += ms; if (state && (!state.tickJobs || !state.tickJobs.length)) flush(); }   // 마감 한 번(조각 줄이 빈 때)마다 한 줄 — T731 은 창 하나가 C 하나라 C 가 바뀔 때만 쓰면 마지막 창을 잃는다
  };
  process.on('exit', flush);
}
