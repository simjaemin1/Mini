#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T528 ② 자)
// =============================================================================
// T528 ② — **하루 경계 밖의 큰 조각 셋**: ⓐ 틱 밖 막힘(T486 기준선 5분에 여섯 번 · 루프 max 50~91ms · 틱 max < 33 · 후보 0)
//   ⓑ GC(30ms 아래는 로그에 안 선다) ⓒ 저장 큐(하루 끝 1마을/틱 배수 · 같은 초 디스크 26~45MB).
//   T486 은 초 단위 표본이라 "그 초에 무엇이 돌았나"를 못 봤다 ⇒ 이 자는 **존 안(preload)** 에서 막힘 한 번마다 그 창을 적는다:
//     · 루프 탐침 — 5ms 타이머가 늦은 만큼(≥ `T528_LAG_MS` 25ms)이 막힘 한 번 · 창 = [앞 발화, 이 발화]
//     · 타이머 일 — `setTimeout`·`setInterval`·`setImmediate` 콜백을 **등록 자리(파일:줄)** 이름으로 잰다(존의 30Hz 틱도 여기 선다)
//     · GC — `PerformanceObserver('gc')` 전부(작은 것까지 · 종류 minor/major/incremental/weak)
//     · SQLite — `node:sqlite` `DatabaseSync.exec` · 문장 `run/get/all` 을 SQL 머리로 잰다(ms · 인자 바이트) + `/proc/self/io` 쓴 바이트(초마다)
//     · CPU 표본(`inspector` Profiler · 1ms) — 60초마다 끊어 **막힘 창 안의 표본만** 함수(자기 몫)·`server/`·`sim/` 첫 틀로 모은다
//       (이름 없는 막힘 — 마이크로태스크 · 소켓 콜백 · GC — 까지 이름이 선다)
//   제품 0 — `server/` 를 안 고친다(preload 가 전역 타이머·sqlite 원형만 감싼다 · 계측기 몫은 표에 적는다).
//
// 쓰는 법: node scripts/t528-offtick.js <out-dir>      env: T528_MIN(30) · T528_PORT(4800) · T528_LAG_MS(25) · T528_FROM / T528_FROM_C(DB 틀 · 없으면 새 세계)
//   out-dir/ep.jsonl(막힘 한 번 한 줄) · out-dir/min.jsonl(1분 요약) · out-dir/zone.log · 끝에 표 요약(표준출력)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');

if (process.env.T528_CHILD) {
  // ───────────────────────────── 존 안(preload) ─────────────────────────────
  const OUT = process.env.T528_CHILD;
  const LAG = parseFloat(process.env.T528_LAG_MS || '25');
  const { performance, PerformanceObserver } = require('perf_hooks');
  const now = () => performance.now();
  const ROOTDIR = path.join(__dirname, '..') + path.sep;
  const short = (f) => f.replace(ROOTDIR, '').replace(/^file:\/\//, '');
  // 등록 자리 — 스택에서 이 파일이 아닌 첫 틀(파일:줄)
  const site = () => {
    const o = {}; const lim = Error.stackTraceLimit; Error.stackTraceLimit = 6; Error.captureStackTrace(o, site); Error.stackTraceLimit = lim;
    const ls = String(o.stack).split('\n').slice(1);
    for (const l of ls) { const m = l.match(/\(?([^()\s]+):(\d+):\d+\)?$/); if (m && !m[1].endsWith('t528-offtick.js')) return short(m[1]) + ':' + m[2]; }
    return '?';
  };
  // 콜백 기록 — 창 매칭용 고리(최근 4000) + 분 요약
  const cbRing = []; const cbMin = new Map();
  const noteCb = (label, t0, t1) => {
    const ms = t1 - t0;
    if (ms >= 2) { cbRing.push([t0, t1, label]); if (cbRing.length > 4000) cbRing.splice(0, 1000); }
    let o = cbMin.get(label); if (!o) cbMin.set(label, o = { n: 0, sum: 0, max: 0 }); o.n++; o.sum += ms; if (ms > o.max) o.max = ms;
  };
  const wrap = (fn, label) => {
    if (typeof fn !== 'function') return fn;
    return function (...a) { const t0 = now(); try { return fn.apply(this, a); } finally { noteCb(label, t0, now()); } };
  };
  const _st = global.setTimeout, _si = global.setInterval, _sim = global.setImmediate;
  const PROBE = Symbol('probe');
  global.setTimeout = function (fn, ...r) { if (fn && fn[PROBE]) return _st(fn, ...r); return _st(wrap(fn, 'T ' + site()), ...r); };
  global.setInterval = function (fn, ...r) { if (fn && fn[PROBE]) return _si(fn, ...r); return _si(wrap(fn, 'I ' + site()), ...r); };
  global.setImmediate = function (fn, ...r) { return _sim(wrap(fn, 'M ' + site()), ...r); };
  try { const u = require('util'); for (const [g, o] of [[global.setTimeout, _st], [global.setImmediate, _sim]]) if (o[u.promisify.custom]) g[u.promisify.custom] = o[u.promisify.custom]; } catch (e) {}
  // GC
  const gcRing = []; const gcMin = { n: 0, sum: 0, max: 0, kinds: {} };
  const GCK = { 1: 'minor', 2: 'major', 4: 'incremental', 8: 'weakcb', 16: 'minor' };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) {
      const k = GCK[(e.detail && e.detail.kind) || e.kind] || String((e.detail && e.detail.kind) || e.kind);
      gcRing.push([e.startTime, e.startTime + e.duration, k]); if (gcRing.length > 4000) gcRing.splice(0, 1000);
      gcMin.n++; gcMin.sum += e.duration; if (e.duration > gcMin.max) gcMin.max = e.duration;
      const kk = gcMin.kinds[k] || (gcMin.kinds[k] = { n: 0, sum: 0, max: 0 }); kk.n++; kk.sum += e.duration; if (e.duration > kk.max) kk.max = e.duration;
    } }).observe({ entryTypes: ['gc'] });
  } catch (e) { /* 없는 판 */ }
  // SQLite
  const sqlRing = []; const sqlMin = new Map();
  const noteSql = (head, t0, t1, bytes) => {
    const ms = t1 - t0;
    if (ms >= 2) { sqlRing.push([t0, t1, head, bytes]); if (sqlRing.length > 4000) sqlRing.splice(0, 1000); }
    let o = sqlMin.get(head); if (!o) sqlMin.set(head, o = { n: 0, sum: 0, max: 0, bytes: 0 }); o.n++; o.sum += ms; if (ms > o.max) o.max = ms; o.bytes += bytes;
  };
  const argBytes = (a) => { let b = 0; for (const x of a) { if (typeof x === 'string') b += x.length; else if (x && typeof x === 'object' && !ArrayBuffer.isView(x)) { for (const k in x) if (typeof x[k] === 'string') b += x[k].length; } else if (x && x.byteLength) b += x.byteLength; } return b; };
  const headOf = (sql) => String(sql).replace(/\s+/g, ' ').trim().slice(0, 48);
  try {
    const sq = require('node:sqlite');
    const DP = sq.DatabaseSync.prototype;
    const _prep = DP.prepare, _exec = DP.exec;
    let SPatched = false;
    DP.exec = function (sql) { const t0 = now(); try { return _exec.call(this, sql); } finally { noteSql('exec ' + headOf(sql), t0, now(), 0); } };
    DP.prepare = function (sql) {
      const st = _prep.call(this, sql);
      if (!SPatched) {
        SPatched = true; const SP = Object.getPrototypeOf(st);
        for (const m of ['run', 'get', 'all']) { const f = SP[m]; if (typeof f !== 'function') continue;
          SP[m] = function (...a) { const t0 = now(); try { return f.apply(this, a); } finally { noteSql(m + ' ' + headOf(this.sourceSQL || ''), t0, now(), argBytes(a)); } }; }
      }
      return st;
    };
  } catch (e) { /* node:sqlite 없음 */ }
  // CPU 표본 — 60초마다 끊어 막힘 창만
  const inspector = require('inspector'); const ses = new inspector.Session(); ses.connect();
  let profT0 = 0;   // 표본 시각 기준(performance.now ms) — Profiler.start 직전
  const startProf = () => { ses.post('Profiler.setSamplingInterval', { interval: 1000 }, () => {}); profT0 = now(); ses.post('Profiler.start', () => {}); };
  ses.post('Profiler.enable', () => startProf());
  // 루프 탐침
  const eps = []; let last = now(); let epsDone = 0;
  const probe = () => { const t = now(); const lag = t - last - 5; if (lag >= LAG) eps.push({ a: last, b: t, lag: +lag.toFixed(1) }); last = t; };
  probe[PROBE] = true; _si(probe, 5);
  // 쓴 바이트(초마다)
  const ioRing = []; let ioLast = null;
  const readIo = () => { try { const s = fs.readFileSync('/proc/self/io', 'utf8'); const m = s.match(/write_bytes:\s*(\d+)/); return m ? +m[1] : 0; } catch (e) { return 0; } };
  const ioT = () => { const w = readIo(); if (ioLast != null) ioRing.push([now(), w - ioLast]); ioLast = w; if (ioRing.length > 4000) ioRing.splice(0, 1000); };
  ioT[PROBE] = true; _si(ioT, 1000);
  const ovl = (ring, a, b) => ring.filter((r) => r[1] > a && r[0] < b);
  const selfRing = [];   // 계기 자신의 창(표본 끊기·처리) — 그 창과 겹친 막힘은 **계기 몫**으로 따로 센다
  const flush = () => {
    const fl0 = now();
    ses.post('Profiler.stop', (err, res) => {
      const pT0 = profT0; startProf();
      const prof = !err && res && res.profile;
      // 표본 시각(ms · 이 창 기준)
      let nodes = null, times = null;
      if (prof) {
        nodes = new Map(); for (const n of prof.nodes) nodes.set(n.id, n);
        const parent = new Map(); for (const n of prof.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
        nodes._parent = parent;
        times = []; let t = 0; for (const d of prof.timeDeltas) { t += d; times.push(pT0 + t / 1000); }
      }
      const fname = (n) => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${short(cf.url || '')}${cf.url ? ':' + (cf.lineNumber + 1) : ''}`; };
      const firstOurs = (id) => { let x = id; while (x != null) { const n = nodes.get(x); if (!n) break; const u = n.callFrame.url || ''; if (/\/(server|sim|shared)\//.test(u) && !u.endsWith('t528-offtick.js')) return fname(n); x = nodes._parent.get(x); } return null; };
      const newEps = eps.slice(epsDone); epsDone = eps.length;
      const lines = [];
      for (const e of newEps) {
        const rec = { t: +e.b.toFixed(0), wall: Date.now() - Math.round(now() - e.b), lag: e.lag, win: +(e.b - e.a).toFixed(1) };
        if (selfRing.some((r) => r[1] > e.a && r[0] < e.b)) rec.self = 1;   // 계기 몫
        rec.cb = ovl(cbRing, e.a, e.b).map((r) => [r[2], +(r[1] - r[0]).toFixed(1)]).sort((x, y) => y[1] - x[1]).slice(0, 6);
        rec.gc = ovl(gcRing, e.a, e.b).map((r) => [r[2], +(r[1] - r[0]).toFixed(1)]).slice(0, 6);
        rec.sql = ovl(sqlRing, e.a, e.b).map((r) => [r[2], +(r[1] - r[0]).toFixed(1), r[3]]).sort((x, y) => y[1] - x[1]).slice(0, 4);
        if (prof && e.a >= pT0) {
          const self = new Map(), ours = new Map(); let n = 0;
          for (let i = 0; i < times.length; i++) { const t = times[i]; if (t <= e.a || t > e.b) continue; n++;
            const id = prof.samples[i]; const nd = nodes.get(id); const f = nd ? fname(nd) : '?'; self.set(f, (self.get(f) || 0) + 1);
            const o = firstOurs(id) || '(서버 틀 없음) ' + f; ours.set(o, (ours.get(o) || 0) + 1); }
          const top = (m) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 5);
          rec.prof = { n, self: top(self), ours: top(ours) };
        }
        lines.push(JSON.stringify(rec));
      }
      if (lines.length) fs.appendFileSync(path.join(OUT, 'ep.jsonl'), lines.join('\n') + '\n');
      // 분 요약
      const cbs = [...cbMin].sort((x, y) => y[1].max - x[1].max).slice(0, 25).map(([k, o]) => [k, o.n, +o.sum.toFixed(1), +o.max.toFixed(1)]);
      const sqls = [...sqlMin].sort((x, y) => y[1].sum - x[1].sum).slice(0, 25).map(([k, o]) => [k, o.n, +o.sum.toFixed(1), +o.max.toFixed(1), o.bytes]);
      const io = ioRing.splice(0); const ioSum = io.reduce((s, r) => s + r[1], 0), ioMax = io.reduce((m, r) => Math.max(m, r[1]), 0);
      const mu = process.memoryUsage();
      fs.appendFileSync(path.join(OUT, 'min.jsonl'), JSON.stringify({ wall: Date.now(), eps: newEps.length, gc: { n: gcMin.n, sum: +gcMin.sum.toFixed(1), max: +gcMin.max.toFixed(1), kinds: gcMin.kinds },
        cbs, sqls, io: { sum: ioSum, max: ioMax }, heap: Math.round(mu.heapUsed / 1e6), rss: Math.round(mu.rss / 1e6) }) + '\n');
      cbMin.clear(); sqlMin.clear(); gcMin.n = 0; gcMin.sum = 0; gcMin.max = 0; gcMin.kinds = {};
      selfRing.push([fl0, now()]); if (selfRing.length > 200) selfRing.shift();
    });
  };
  flush[PROBE] = true; const fT = _si(flush, 60000); fT.unref();
  process.on('SIGINT', () => { try { flush(); } catch (e) {} });
  return;
}

// ───────────────────────────── 요약(`--sum <out-dir>`) ─────────────────────────────
if (process.argv[2] === '--sum') {
  const D = process.argv[3] || '/tmp/t528/off';
  const WARM = parseFloat(process.env.T528_WARM_S || '240') * 1000;   // 부팅 뒤 이만큼은 뺀다(부팅 일 · 지형 굽기 · 쉼터 백필)
  const TICK = process.env.T528_TICK || 'I server/zone.js:12481';      // 존 30Hz 틱의 등록 자리
  const rd = (f) => { try { return fs.readFileSync(path.join(D, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
  const EP = rd('ep.jsonl'), MN = rd('min.jsonl');
  const q = (xs, p) => { const b = xs.slice().sort((a, c) => a - c); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : null; };
  const cls = (e) => {
    if (e.self) return '계기(표본 끊기)';
    //   ★표본은 1ms 마다다 — 창 길이만큼 표본이 없으면 **프로세스가 CPU 에 없었다**(표본기 스레드까지 멈춤 = 상자·스케줄러 · steal).
    //     콜백 안에서 났어도 그 시간은 코드가 쓴 게 아니다(T528 첫 판 — 유령 동기 69.8ms 창에 표본 1).
    if (e.prof && e.prof.n < 0.3 * e.win) return '프로세스 밖(표본 없음 — 상자·스케줄러)';
    const cbT = (e.cb || []).filter((c) => c[0] === TICK).reduce((s, c) => s + c[1], 0);
    const cbO = (e.cb || []).filter((c) => c[0] !== TICK);
    const gc = (e.gc || []).reduce((s, g) => s + g[1], 0);
    if (cbT >= 0.5 * e.lag) return '틱 본문';
    if (cbO.length && cbO[0][1] >= 0.5 * e.lag) return '타이머 ' + cbO[0][0];
    if (gc >= 0.5 * e.lag) return 'GC ' + ((e.gc || []).slice().sort((a, c) => c[1] - a[1])[0] || ['?'])[0];
    const P = e.prof;
    if (P && P.n) { const idle = (P.self.find((x) => /^\(idle\)/.test(x[0])) || [0, 0])[1];
      if (idle >= 0.5 * P.n) return '프로세스 밖(표본이 idle)';
      const gcs = (P.self.find((x) => /garbage collector/.test(x[0])) || [0, 0])[1];
      if (gcs >= 0.5 * P.n) return 'GC(표본)';
      return '표본 ' + P.ours[0][0]; }
    return '이름 없음';
  };
  const steady = EP.filter((e) => e.t >= WARM);
  const by = new Map();
  for (const e of steady) { const k = cls(e); const o = by.get(k) || { n: 0, lags: [], ex: null }; o.n++; o.lags.push(e.lag); if (!o.ex || e.lag > o.ex.lag) o.ex = e; by.set(k, o); }
  const mins = MN.length; const all = steady.filter((e) => !e.self);
  console.log(`\n[T528 ②] 막힘(≥ 탐침 문턱) — 부팅 뒤 ${WARM / 1000}초 이후 · ${mins}분 요약 ${mins}줄 · 막힘 ${steady.length}번(계기 몫 ${steady.length - all.length})`);
  console.log('| 갈래 | 번 | 늦음 p50 | 최대 | 가장 큰 번의 창 |');
  console.log('|---|---:|---:|---:|---|');
  for (const [k, o] of [...by].sort((a, c) => c[1].n - a[1].n)) {
    const e = o.ex; const why = [
      e.cb && e.cb.length ? 'cb ' + e.cb.slice(0, 2).map((c) => `${c[0]} ${c[1]}`).join(', ') : '',
      e.gc && e.gc.length ? 'gc ' + e.gc.slice(0, 3).map((g) => `${g[0]} ${g[1]}`).join(', ') : '',
      e.sql && e.sql.length ? 'sql ' + e.sql.slice(0, 2).map((x) => `${x[0]} ${x[1]}ms ${x[2]}B`).join(', ') : '',
      e.prof ? `표본 ${e.prof.n}: ` + e.prof.ours.slice(0, 3).map((x) => `${x[0]} ${x[1]}`).join(', ') : '' ].filter(Boolean).join(' · ');
    console.log(`| ${k} | ${o.n} | ${q(o.lags, 0.5)} | ${Math.max(...o.lags)} | ${why.replace(/\|/g, '/')} |`);
  }
  // 갈래마다 표본 모음(서버 첫 틀) — "틱 본문" 이 무엇이었나
  for (const [k, o] of by) {
    if (!/^틱 본문|^표본|^타이머/.test(k)) continue;
    const agg = new Map(); let n = 0;
    for (const e of steady) { if (cls(e) !== k || !e.prof) continue; n += e.prof.n; for (const [f, c] of e.prof.ours) agg.set(f, (agg.get(f) || 0) + c); }
    console.log(`\n  [${k}] 표본 ${n}(≈ms) — 서버 첫 틀 위 8: ` + [...agg].sort((a, c) => c[1] - a[1]).slice(0, 8).map(([f, c]) => `${f} ${c}`).join(' · '));
  }
  // 막힘 시간표 + steal(같은 초) — `steal.txt`(벽 ms · steal jiffies · cpu pressure µs) 가 있으면
  const ST = (() => { try { return fs.readFileSync(path.join(D, 'steal.txt'), 'utf8').trim().split('\n').map((l) => l.split(' ').map(Number)); } catch (e) { return []; } })();
  const stealAt = (w) => { for (let i = 1; i < ST.length; i++) if (ST[i][0] >= w) return { st: ST[i][1] - ST[i - 1][1], pr: Math.round((ST[i][2] - ST[i - 1][2]) / 1000) }; return null; };
  if (ST.length) {
    const rows = steady.map((e) => ({ k: cls(e), s: stealAt(e.wall) })).filter((r) => r.s);
    const byk = new Map(); for (const r of rows) { const o = byk.get(r.k) || { n: 0, st: 0, stHit: 0, pr: 0 }; o.n++; o.st += r.s.st; if (r.s.st > 0) o.stHit++; o.pr += r.s.pr; byk.set(r.k, o); }
    let base = { n: 0, st: 0, hit: 0 }; for (let i = 1; i < ST.length; i++) { base.n++; const d = ST[i][1] - ST[i - 1][1]; base.st += d; if (d > 0) base.hit++; }
    console.log(`\n[steal] 같은 초의 steal(jiffy=10ms) — 전 구간 초당 평균 ${(base.st / base.n).toFixed(2)} · steal 있는 초 ${(100 * base.hit / base.n).toFixed(0)}%`);
    for (const [k, o] of byk) console.log(`  ${k.padEnd(28)} ${o.n}번 · 그 초 steal 평균 ${(o.st / o.n).toFixed(2)} · steal 있는 초 ${(100 * o.stHit / o.n).toFixed(0)}% · cpu 압력 평균 ${(o.pr / o.n).toFixed(0)}ms`);
  }
  console.log('\n[시간표] 벽시각(UTC) 갈래 늦음');
  console.log('  ' + steady.filter((e) => !e.self).map((e) => `${new Date(e.wall).toISOString().slice(11, 19)} ${cls(e).slice(0, 10)} ${e.lag}`).join(' | '));
  // GC
  const gk = {}; for (const m of MN) for (const k in (m.gc && m.gc.kinds) || {}) { const o = gk[k] || (gk[k] = { n: 0, sum: 0, max: 0 }); const x = m.gc.kinds[k]; o.n += x.n; o.sum += x.sum; o.max = Math.max(o.max, x.max); }
  console.log('\n[GC] 종류 · 번 · 합 ms · 최대 ms (전 구간 · 부팅 포함)');
  for (const k in gk) console.log(`  ${k.padEnd(12)} ${gk[k].n} · ${gk[k].sum.toFixed(0)} · ${gk[k].max.toFixed(1)}`);
  const gcBig = steady.filter((e) => (e.gc || []).some((g) => g[1] >= 30));
  console.log(`  막힘 창 안의 GC ≥30ms: ${gcBig.length}번 — ${gcBig.map((e) => e.gc.filter((g) => g[1] >= 30).map((g) => `${g[0]} ${g[1]}`).join('+')).join(' · ')}`);
  // 타이머 · SQL · 디스크
  const cb = new Map(); for (const m of MN.slice(Math.ceil(WARM / 60000))) for (const [k, n, sum, max] of m.cbs || []) { const o = cb.get(k) || { n: 0, sum: 0, max: 0 }; o.n += n; o.sum += sum; o.max = Math.max(o.max, max); cb.set(k, o); }
  console.log('\n[타이머] 등록 자리 · 번 · 합 ms · 최대 ms (부팅 뒤 · 최대 순 12)');
  for (const [k, o] of [...cb].sort((a, c) => c[1].max - a[1].max).slice(0, 12)) console.log(`  ${k.padEnd(34)} ${o.n} · ${o.sum.toFixed(0)} · ${o.max.toFixed(1)}`);
  const sq = new Map(); for (const m of MN.slice(Math.ceil(WARM / 60000))) for (const [k, n, sum, max, b] of m.sqls || []) { const o = sq.get(k) || { n: 0, sum: 0, max: 0, b: 0 }; o.n += n; o.sum += sum; o.max = Math.max(o.max, max); o.b += b; sq.set(k, o); }
  console.log('\n[SQL] 머리 · 번 · 합 ms · 최대 ms · 인자 바이트 (부팅 뒤 · 합 순 10)');
  for (const [k, o] of [...sq].sort((a, c) => c[1].sum - a[1].sum).slice(0, 10)) console.log(`  ${k.padEnd(52)} ${o.n} · ${o.sum.toFixed(0)} · ${o.max.toFixed(1)} · ${o.b}`);
  console.log('\n[디스크] 분마다 쓴 MB(초 최대 MB) · 힙 MB');
  console.log('  ' + MN.map((m) => `${(m.io.sum / 1e6).toFixed(1)}(${(m.io.max / 1e6).toFixed(1)})·${m.heap}`).join(' '));
  process.exit(0);
}

// ───────────────────────────── 바깥(부모) ─────────────────────────────
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUTD = process.argv[2] || '/tmp/t528/off';
const MIN = parseFloat(process.env.T528_MIN || '30');
const PORT = parseInt(process.env.T528_PORT || '4800', 10);
const FROM = process.env.T528_FROM || '', FROM_C = process.env.T528_FROM_C || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cp = (a, b) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(b + s); } catch (e) {} try { fs.copyFileSync(a + s, b + s); } catch (e) {} } };
const rm = (b) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(b + s); } catch (e) {} } };

(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  for (const f of ['ep.jsonl', 'min.jsonl']) { try { fs.unlinkSync(path.join(OUTD, f)); } catch (e) {} }
  const zdb = path.join(OUTD, 'z.db'), cdb = path.join(OUTD, 'c.db'), SECRET = 't528-' + process.pid;
  if (FROM) cp(FROM, zdb); else rm(zdb);
  if (FROM_C) cp(FROM_C, cdb); else rm(cdb);
  const logf = fs.openSync(path.join(OUTD, 'zone.log'), 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  //   ★기본 손잡이 — T486 컨테이너 기준선과 같은 판(빈 한반도 · 마을 켬 · 하루 = 세계 시계 24분)
  const z = spawn(process.execPath, ['-r', __filename, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { T528_CHILD: OUTD, PORT: String(PORT + 10), ZONE_ID: 'hanbando', DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(PORT), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1' }) });
  const t0 = Date.now();
  try {
    for (let i = 0; i < 900; i++) { try { if ((await fetch(`http://localhost:${PORT + 10}/health`)).ok) break; } catch (e) {} await sleep(1000); }
    console.log(`[T528 ②] 부팅 ${Math.round((Date.now() - t0) / 1000)}초 — ${MIN}분 잰다`);
    const tEnd = Date.now() + MIN * 60000;
    while (Date.now() < tEnd) await sleep(5000);
  } finally {
    try { z.kill('SIGINT'); } catch (e) {} await sleep(4000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500);
    rm(zdb); rm(cdb);
  }
  console.log('→', OUTD);
  process.exit(0);
})();
