'use strict';
// (@regress 없음 — 러너 밖 귀 · T1489 · 제품 코드 · 있던 스크립트 손 0)
// =============================================================================
// scripts/t1489-probe.js — 마을 장부 마감(하루 마감)의 시간을 재는 읽기 전용 귀. `NODE_OPTIONS=--require scripts/t1489-probe.js` 로만 건다(존 프로세스 안에서만 산다).
//   ① 마감마다 한 줄(`$T1489_OUT.closes.jsonl`) — 날 · 일 합(work) · 벽시계(wall) · 프레임 · 줄 선 요청 수 · 마을 수 · 교역로 수 · 단계별(ms · 큰 것 12) · 이벤트 루프 막힘(p99 · max).
//      재료 = `state.tickJobs`(마감 일 줄)가 서고 지는 때(벽시계 hrtime · 가상 시계 판은 `process.cpuUsage` 가 진짜 값) · 제품이 쓴 `tickCtx` 값. `Object.prototype` 에 안 세어지는 접근자 하나(처음 쓸 때 그 몸에 **쓴 값 그대로** 저장하는 접근자를 단다 · `t1485-observer` 와 같은 길).
//   ② 줄 선 요청마다 한 줄(`$T1489_OUT.queue.jsonl`) — 메시지 종류 · 기다린 시간(줄에 든 때 → 처리된 때) · 줄 길이. `villageBookWait/villageWait` 를 감싸 **같은 인자(함수 하나)로** 부르고
//      반환 그대로 돌려준다(줄에 넣을 함수만 시각을 적고 원 함수를 같은 인자 · 같은 반환으로 부르는 껍데기).
//      메시지 종류는 `ws.on('message')` 껍데기가 부르기 직전 적어 둔 것(`t1485-observer` 와 같은 길 — 원 귀는 같은 this · 같은 인자 · 같은 반환).
//   ③ 마감 CPU 프로파일 — `inspector` 의 V8 샘플러(1ms). `_drainTickJobs` 가 스택에 든 표본 = 마감 · 그 밖 = 마감 밖. 함수 · 파일 · 줄별 자기 시간과 마감 안 총 시간을 날 마디별로
//      쌓아 `$T1489_OUT.prof.<pid>.json`(작은 요약 · 원 프로파일은 안 남긴다)에 적는다. 마감마다 30초 이상 지났으면 비우고 다시 켠다.
//   모든 쓰기는 try/catch — 귀가 죽어도 판은 돈다. 모듈은 미리 안 부른다(`Module.prototype.require` 로 앱이 제 손으로 부른 뒤에 감싼다).
//   T1489_PROF=0 이면 ③ 을 끈다(귀가 판을 안 바꾸는지 견주는 대조 · ①② 만).  T1489_NOEAR=1 이면 아무것도 안 건다(대조 · 이 파일을 안 거는 것과 같다).
// =============================================================================
try {
  if (/zone\.js$/.test(String(process.argv[1] || '')) && process.env.T1489_NOEAR !== '1') {
    const fs = require('fs');
    const Module = require('module');
    const { monitorEventLoopDelay } = require('perf_hooks');
    const OUT = process.env.T1489_OUT || '/tmp/t1489';
    const PROF = process.env.T1489_PROF !== '0';
    const T0 = Date.now();
    let VIL = null, wsWrapped = false, bookWrapped = false;
    const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
    const put = (f, o) => { try { o.t = Date.now() - T0; fs.appendFileSync(OUT + '.' + f + '.jsonl', JSON.stringify(o) + '\n'); } catch (e) { /* 귀는 판을 건드리지 않는다 */ } };
    const cur = { type: null };
    // ── ③ 프로파일 ──────────────────────────────────────────────────────────────
    let sess = null, lastFlush = Date.now();
    const agg = { buckets: {} };   // 날 마디 → { closeMs, outMs, self{key:ms}, incl{key:ms}, job{key:ms} }
    const bucketOf = (d) => (d <= 10 ? '001-010' : d <= 50 ? '011-050' : (String(Math.floor((d - 1) / 100) * 100 + 1).padStart(3, '0') + '-' + String(Math.floor((d - 1) / 100) * 100 + 100).padStart(3, '0')));
    const keyOf = (cf) => `${cf.functionName || '(anon)'}|${String(cf.url || '').split('/').pop()}:${(cf.lineNumber | 0) + 1}`;
    const startProf = () => {
      if (!PROF) return;
      try {
        if (!sess) { const insp = require('inspector'); sess = new insp.Session(); sess.connect(); sess.post('Profiler.enable'); sess.post('Profiler.setSamplingInterval', { interval: 1000 }); }
        sess.post('Profiler.start');
      } catch (e) { sess = null; }
    };
    const flushProf = (day) => {
      if (!PROF || !sess) return;
      try {
        let prof = null;
        sess.post('Profiler.stop', (err, r) => { if (!err && r) prof = r.profile; });
        lastFlush = Date.now();
        startProf();
        if (!prof) return;
        const nodes = new Map(), parent = new Map();
        for (const n of prof.nodes) { nodes.set(n.id, n); for (const c of (n.children || [])) parent.set(c, n.id); }
        const bk = bucketOf(day | 0);
        const B = agg.buckets[bk] || (agg.buckets[bk] = { closeMs: 0, outMs: 0, self: {}, incl: {}, job: {}, closeSelf: {} });
        const memo = new Map();   // node id → { close, keys[] }
        const info = (id) => {
          let v = memo.get(id); if (v) return v;
          const n = nodes.get(id), p = parent.get(id), pv = p != null ? info(p) : { close: false, keys: [] };
          v = { close: pv.close || n.callFrame.functionName === '_drainTickJobs', keys: pv.keys.concat([keyOf(n.callFrame)]) };
          memo.set(id, v); return v;
        };
        const ts = prof.timeDeltas, S = prof.samples;
        for (let i = 0; i < S.length; i++) {
          const dt = ((i + 1 < ts.length ? ts[i + 1] : ts[i]) || 0) / 1000;   // ms
          const v = info(S[i]), k = v.keys[v.keys.length - 1];
          if (/\(idle\)|\(program\)|\(garbage collector\)/.test(k) && !v.close) { continue; }
          if (!v.close) { B.outMs += dt; continue; }
          B.closeMs += dt;
          B.closeSelf[k] = (B.closeSelf[k] || 0) + dt;
          const seen = new Set();
          for (const kk of v.keys) { if (seen.has(kk)) continue; seen.add(kk); B.incl[kk] = (B.incl[kk] || 0) + dt; }
          // 조각 함수: `_drainTickJobs` 의 자식(`j.f` 가 감싼 함수)
          const di = v.keys.findIndex((x) => x.startsWith('_drainTickJobs|'));
          if (di >= 0 && di + 1 < v.keys.length) { let j = di + 1; if (v.keys[j].startsWith('g|') && j + 1 < v.keys.length) j++; B.job[v.keys[j]] = (B.job[v.keys[j]] || 0) + dt; }
        }
        writeProf();
      } catch (e) { /* */ }
    };
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => { const [fn, loc] = k.split('|'); return { fn, loc, ms: +ms.toFixed(1) }; });
    const writeProf = () => {
      try {
        const o = { buckets: {} };
        for (const [bk, B] of Object.entries(agg.buckets)) o.buckets[bk] = { closeMs: +B.closeMs.toFixed(1), outMs: +B.outMs.toFixed(1), closeSelf: top(B.closeSelf, 40), incl: top(B.incl, 60), job: top(B.job, 30) };
        fs.writeFileSync(OUT + '.prof.' + process.pid + '.json.tmp', JSON.stringify(o)); fs.renameSync(OUT + '.prof.' + process.pid + '.json.tmp', OUT + '.prof.' + process.pid + '.json');
      } catch (e) { /* */ }
    };
    // ── ① 마감 한 줄 — `state.tickJobs`(마감 일 줄)가 서고 지는 때를 hrtime 으로 잰다. 제품이 쓰는 값은 그대로 저장하는 접근자(처음 쓸 때 그 몸에 단다)
    let nClose = 0, t0c = null, c0 = null, curDay = 0;
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
              const wall = Number(process.hrtime.bigint() - t0c) / 1e6; t0c = null; nClose++;
              const cu = process.cpuUsage(c0), cpu = (cu.user + cu.system) / 1000;   // 가상 시계 판은 hrtime 도 가상이라 CPU 시간이 진짜 값
              const C = self.tickCtx || {}, L = self.world || {};
              curDay = L.day | 0;
              const st = C.stg || {};
              const stg = Object.entries(st).filter(([k, x]) => typeof x === 'number' && !/·max$/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, x]) => [k, +x.toFixed(1)]);
              let routes = null;
              if (nClose % 20 === 1) { try { routes = VIL.routeDebug ? VIL.routeDebug().mem : null; } catch (e) { routes = null; } }
              const q = { p50: Math.round(h.percentile(50) / 1e6), p99: Math.round(h.percentile(99) / 1e6), max: Math.round(h.max / 1e6) };
              put('closes', { day: curDay, wall: +wall.toFixed(1), cpu: +cpu.toFixed(1), frames: C.frames, chunks: C.chunks, maxChunk: C.maxChunk, frameMax: C.frameMax, at: C.maxChunkAt, queued: C.queued, villages: C.vils ? C.vils.length : null, mini: C.t731mini ? 1 : 0, t731D: C.t731D, routes, stg, loop: q });
              if (Date.now() - lastFlush > 30000 || nClose <= 2) flushProf(curDay);
            }
          } catch (e) { /* */ }
        };
        try {
          Object.defineProperty(this, KEY, {
            configurable: true, enumerable: true,
            get() { return store; },
            set(nv) { const prev = store; store = nv; note(prev, nv, this); },
          });
          note(null, v, this);
        } catch (e) { try { Object.defineProperty(this, KEY, { value: v, writable: true, configurable: true, enumerable: true }); } catch (e2) { /* */ } }
      },
    });
    // ── ②③ 훅 ──────────────────────────────────────────────────────────────────
    const origReq = Module.prototype.require;
    Module.prototype.require = function (id) {
      const m = origReq.apply(this, arguments);
      try {
        const f = Module._resolveFilename(id, this);
        if (/server[\\/]villages\.js$/.test(f)) {
          VIL = m;
          if (!bookWrapped) {
            bookWrapped = true;
            for (const nm of ['villageBookWait', 'villageWait']) {
              const ow = m[nm]; if (typeof ow !== 'function') continue;
              m[nm] = function (fn) {
                const type = cur.type, t0 = process.hrtime.bigint();
                const w = function () {
                  put('queue', { type, waitMs: +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1), via: nm });
                  return fn.apply(this, arguments);
                };
                return ow.call(this, typeof fn === 'function' ? w : fn);
              };
            }
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
                  if (evn === 'message' && typeof fn === 'function' && !fn.__t1489) {
                    const w = function (raw) {
                      try { const s = raw && raw.toString ? raw.toString('utf8', 0, 80) : ''; const mm = /"type":"([a-z_]+)"/.exec(s); cur.type = mm ? mm[1] : null; } catch (e) { cur.type = null; }
                      try { return fn.apply(this, arguments); } finally { cur.type = null; }
                    };
                    w.__t1489 = 1;
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
    startProf();
    process.on('exit', () => { try { flushProf(curDay); } catch (e) { /* */ } });   // 마지막 날 마디로(0 이면 001-010 에 잘못 쌓였다 · lr730 의 600날까지는 옛 꼴)
  }
} catch (e) { /* 없어도 판은 돈다 */ }
