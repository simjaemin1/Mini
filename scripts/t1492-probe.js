// (@regress 없음 — 러너 밖 · T1492 판 계측기 · 제품 무변 · 프리로드로만 실린다 · 제품 파일 글자 0 — 읽어 들인 글자에만 셈 줄을 끼운다)
// === scripts/t1492-probe.js — T1492 ② 다리 머리 느려짐의 주인 · ③ stopSleep 부른 자리 ==========
//   쓰는 법: NODE_OPTIONS="… --require $PWD/scripts/t1492-bots.js --require $PWD/scripts/t1492-probe.js" T1492_PROBE_OUT=<파일.json> [T1492_PROF=1] [T1492_SS=1]
//   ② `T1492_PROF=1` — 날마다 V8 CPU 프로파일(inspector `Profiler` · `--cpu-prof` 와 같은 표본기 · 1 ms) + 정밀 커버리지 호출 수(`startPreciseCoverage{callCount}`)를
//      날 경계에서 끊어 함수별 자기 시간(ms) · 호출 수를 날 줄로 남긴다(날마다 자기 시간 상위 60 · 호출 수 상위 200 + 자기 시간 상위의 호출 수).
//   ③ `T1492_SS=1` — villages.js 글자를 읽어 들일 때(메모리에서만) `_t1423S.stopSleep++` 두 자리 뒤에 셈 문 하나를 끼운다:
//      부른 자리(스택 함수 이름 4 칸) · 몸(pid) · 그 칸 → 다음 틱에 그 몸이 움직였나(일 함) · 같은 몸이 바로 앞 틱에 같은 칸에서 또 셌나(선 채 다시 셈 = 헛깨움).
//      `caravanBlockedResponse` 는 이름을 바꿔 감싼 겉 함수로 시간을 잰다(값 무변) · `deps.t1423StepHit` 은 감싸 호출 수 · 시간(잠든 청크 걸음 검사 값).
//   값을 바꾸는 줄은 없다(셈 · 시각 읽기뿐). 시간은 `process.uptime()`(실제 시계 — 가상 시계 판은 `hrtime` · `performance.now` 를 V 에 묶는다 · t745).
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1492_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1492_PROBE_OUT, PROF = process.env.T1492_PROF === '1', SS = process.env.T1492_SS === '1';
const rec = { prof: PROF, ss: SS, days: [], ss_sites: {}, ss_tot: { n: 0, rep: 0, moved: 0, still: 0, gone: 0 }, errs: [] };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const err = (e) => { if (rec.errs.length < 20) rec.errs.push(String(e && e.stack || e).slice(0, 400)); };
// ── ③ 글자 끼우기 ──
const SS_DAY = 'blockedAt = prev; _t1423S.stopSleep++; break;';
const SS_WALK = 'blocked=true;_t1423S.stopSleep++;break;';
const CBR = 'function caravanBlockedResponse(body, p, now) {';
// ── ② 호출 수(`T1492_COUNT=이름,이름` — 그 이름의 함수 선언 `function 이름(` 몸 첫머리에 셈 한 줄 · server/ · sim/ 파일만 · 날마다 끊는다) ──
const COUNT = String(process.env.T1492_COUNT || '').split(/[,+]/).map((x) => x.trim()).filter(Boolean);
const CNT = {}; globalThis.__t1492c = CNT; rec.countPatch = {};
function countPatch(src, file) {
  for (const nm of COUNT) {
    const needle = 'function ' + nm + '('; let at = 0, k = 0;
    while ((at = src.indexOf(needle, at)) >= 0) {
      const pre = src[at - 1]; if (pre && /[\w$]/.test(pre)) { at += needle.length; continue; }
      let i = at + needle.length, depth = 1; while (i < src.length && depth) { const c = src[i]; if (c === '(') depth++; else if (c === ')') depth--; i++; }
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] !== '{') { at = i; continue; }
      const ins = `globalThis.__t1492c[${JSON.stringify(nm)}]=(globalThis.__t1492c[${JSON.stringify(nm)}]|0)+1;`;
      src = src.slice(0, i + 1) + ins + src.slice(i + 1); at = i + 1 + ins.length; k++;
    }
    if (k) rec.countPatch[nm + ' @' + path.relative(ROOT, file)] = k;
  }
  return src;
}
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (COUNT.length && /[\\/](server|sim)[\\/]/.test(filename) && filename.startsWith(ROOT)) { const _c0 = m._compile; m._compile = function (src, fn) { return _c0.call(this, countPatch(src, filename), fn); }; }
  if (filename === VF && SS) {
    const _c = m._compile;
    m._compile = function (src, fn) {
      const n1 = src.split(SS_DAY).length - 1, n2 = src.split(SS_WALK).length - 1, n3 = src.split(CBR).length - 1;
      rec.patch = { day: n1, walk: n2, cbr: n3 };
      if (n1 === 1 && n2 === 1 && n3 === 1) {
        src = src.replace(SS_DAY, "blockedAt = prev; _t1423S.stopSleep++; if (globalThis.__t1492ss) globalThis.__t1492ss('day', state.deps.players && state.deps.players.get(body.pid), prev, body); break;");
        src = src.replace(SS_WALK, "blocked=true;_t1423S.stopSleep++;if(globalThis.__t1492ss)globalThis.__t1492ss('walk',p,prev,path);break;");
        src = src.replace(CBR, 'function caravanBlockedResponse(body, p, now) { const _t0 = process.uptime(); try { return caravanBlockedResponse__t1492(body, p, now); } finally { if (globalThis.__t1492cbr) globalThis.__t1492cbr(process.uptime() - _t0, body); } }\nfunction caravanBlockedResponse__t1492(body, p, now) {');
      } else err('patch miss ' + JSON.stringify(rec.patch));
      return _c.call(this, src, fn);
    };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick;
    m.exports.onGameTick = function () {
      tickStart();
      const out = g.apply(this, arguments);
      try { const getSt = m.exports.__t1492v; const st = getSt ? getSt() : null; tickEnd(st, m.exports); } catch (e) { err(e); }
      return out;
    };
  }
  return r;
};
// ── ③ 셈 ──
let TICK = 0, lastDay = -1, cur = null;
const newDay = (d) => ({ d, wall0: process.uptime(), cpu0: process.cpuUsage(), ss: { n: 0, rep: 0, moved: 0, still: 0, gone: 0, sites: {} }, step: { n: 0, hit: 0, sec: 0 }, cbr: { n: 0, sec: 0, afterSS: 0 }, prof: null, cov: null });
const lastAt = new Map();   // pid → { t: 틱, k: 칸 }
let pend = [];               // 이번 틱 셈 — 다음 틱 끝에 몸이 움직였나
let ssThisTick = 0;
function siteOf() {
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 7; const o = {}; Error.captureStackTrace(o, globalThis.__t1492ss); Error.stackTraceLimit = L;
  const names = String(o.stack).split('\n').slice(1).map((l) => { const m = /at (?:Object\.)?([\w$.<>]+) \(/.exec(l) || /at ([\w$.<>]+)/.exec(l); return m ? m[1].replace(/^Object\./, '') : '?'; });
  return names.slice(0, 4).join(' ← ');
}
globalThis.__t1492ss = function (where, p, prev, pathOrBody) {
  if (!cur) return;
  const role = where === 'day' ? 'ledger' : (pathOrBody && pathOrBody.c ? 'merchant' : 'other');
  const key = where + ' · ' + role + ' · ' + siteOf();
  const S = cur.ss; S.n++; ssThisTick++;
  const s = S.sites[key] || (S.sites[key] = { n: 0, rep: 0, moved: 0, still: 0, gone: 0 }); s.n++;
  const pid = p ? p.pid : null, k = prev ? (Math.round(prev.x) + ',' + Math.round(prev.y)) : '?';
  const la = pid != null ? lastAt.get(pid) : null;
  if (la && la.k === k && TICK - la.t <= 1) { S.rep++; s.rep++; }
  if (pid != null) lastAt.set(pid, { t: TICK, k });
  pend.push({ p, x: p ? p.x : 0, y: p ? p.y : 0, s });
};
globalThis.__t1492cbr = function (sec) { if (!cur) return; cur.cbr.n++; cur.cbr.sec += sec; if (ssThisTick) cur.cbr.afterSS++; };
let pendPrev = [];
function tickStart() { TICK++; ssThisTick = 0; }
let stepWrapped = false;
function tickEnd(st, V) {
  if (SS && !stepWrapped && st && st.deps && typeof st.deps.t1423StepHit === 'function') {
    stepWrapped = true; const f = st.deps.t1423StepHit;
    st.deps.t1423StepHit = function () { const t0 = process.uptime(); const r = f.apply(this, arguments); if (cur) { cur.step.n++; if (r) cur.step.hit++; cur.step.sec += process.uptime() - t0; } return r; };
  }
  // 앞 틱 셈들 — 이 틱 끝에 몸이 움직였나(1 px 넘게)
  if (cur && pendPrev.length) {
    for (const e of pendPrev) {
      const S = cur.ss; let w;
      if (!e.p || e.p.hp <= 0) w = 'gone'; else w = Math.hypot(e.p.x - e.x, e.p.y - e.y) > 1 ? 'moved' : 'still';
      S[w]++; e.s[w]++;
    }
  }
  pendPrev = pend; pend = [];
  const d = st && st.world ? st.world.day | 0 : -1;
  if (d !== lastDay) { dayTurn(d); lastDay = d; }
}
// ── ② 날마다 프로파일 · 호출 수 ──
let SESSION = null;
function post(m, p) { return new Promise((res) => { try { SESSION.post(m, p || {}, (e, r) => res(e ? { _err: String(e.message || e) } : r)); } catch (e) { res({ _err: String(e.message) }); } }); }
// 동기 post(같은 스레드 세션은 콜백을 바로 부른다) — 날 경계에서 순서를 지키려고 결과를 바로 받는다
function postSync(m, p) { let out = null, done = false; try { SESSION.post(m, p || {}, (e, r) => { out = e ? { _err: String(e.message || e) } : r; done = true; }); } catch (e) { out = { _err: String(e.message) }; done = true; } return done ? out : { _err: 'async' }; }
const short = (u) => (u || '').replace(/^file:\/\//, '').replace(ROOT + '/', '');
function profSummary(prof) {
  if (!prof || !prof.nodes) return null;
  const self = new Map(), byId = new Map(); for (const n of prof.nodes) byId.set(n.id, n);
  const dt = prof.timeDeltas || [], sm = prof.samples || [];
  const cnt = new Map(); for (let i = 0; i < sm.length; i++) cnt.set(sm[i], (cnt.get(sm[i]) || 0) + (dt[i] || 0));
  for (const [id, us] of cnt) { const n = byId.get(id); if (!n) continue; const cf = n.callFrame; const k = (cf.functionName || '(anon)') + ' @' + short(cf.url) + ':' + (cf.lineNumber + 1); self.set(k, (self.get(k) || 0) + us); }
  const tot = [...self.values()].reduce((a, b) => a + b, 0);
  return { totMs: Math.round(tot / 1000), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, us]) => [k, Math.round(us / 1000)]) };
}
function covSummary(cov, profTop) {
  if (!cov || !cov.result) return null;
  const all = [];
  for (const sc of cov.result) { const u = short(sc.url); if (!/^(server|sim|shared)\//.test(u)) continue; for (const f of sc.functions) { const c = f.ranges && f.ranges[0] ? f.ranges[0].count : 0; if (c > 0) all.push([(f.functionName || '(anon)') + ' @' + u + '#' + (f.ranges[0].startOffset), c, f.functionName || '', u]); } }
  all.sort((a, b) => b[1] - a[1]);
  const want = new Set((profTop || []).map(([k]) => k.split(' @')[0] + ' @' + k.split(' @')[1].replace(/:\d+$/, '')));
  const named = all.filter((x) => want.has(x[2] + ' @' + x[3]) || want.has((x[2] || '(anon)') + ' @' + x[3]));
  return { top: all.slice(0, 200).map((x) => [x[0], x[1]]), forProf: named.slice(0, 200).map((x) => [x[0], x[1]]) };
}
if (PROF) {
  try { const inspector = require('inspector'); SESSION = new inspector.Session(); SESSION.connect(); postSync('Profiler.enable'); postSync('Profiler.setSamplingInterval', { interval: 1000 }); if (process.env.T1492_COV === '1') rec.covStart = postSync('Profiler.startPreciseCoverage', { callCount: true, detailed: false }); }   // ★정밀 커버리지는 판을 몇 배 느리게 한다(T1492 연기 판: 날 0 이 310 초 · 날 1 이 3분 넘게 안 옴) — 기본 끔 · 호출 수는 `T1492_COUNT` 로
  catch (e) { err(e); SESSION = null; }
}
function dayTurn(d) {
  const now = process.uptime(), cu = process.cpuUsage();
  if (cur) {
    cur.wall = +(now - cur.wall0).toFixed(2); cur.cpu = +(((cu.user - cur.cpu0.user) + (cu.system - cur.cpu0.system)) / 1e6).toFixed(2);
    delete cur.wall0; delete cur.cpu0;
    cur.step.ms = Math.round(cur.step.sec * 1000); delete cur.step.sec; cur.cbr.ms = Math.round(cur.cbr.sec * 1000); delete cur.cbr.sec;
    for (const [k, s] of Object.entries(cur.ss.sites)) { const t = rec.ss_sites[k] || (rec.ss_sites[k] = { n: 0, rep: 0, moved: 0, still: 0, gone: 0 }); for (const f of Object.keys(t)) t[f] += s[f]; }
    for (const f of Object.keys(rec.ss_tot)) rec.ss_tot[f] += cur.ss[f];
    if (SESSION) {
      const pr = postSync('Profiler.stop'); cur.prof = profSummary(pr && pr.profile);
      if (rec.covStart) { const cv = postSync('Profiler.takePreciseCoverage'); cur.cov = covSummary(cv, cur.prof && cur.prof.top); }
    }
    if (COUNT.length) { cur.calls = Object.assign({}, CNT); for (const k of Object.keys(CNT)) CNT[k] = 0; }
    rec.days.push(cur); save();
  }
  cur = newDay(d);
  if (SESSION) postSync('Profiler.start');
}
process.on('exit', () => { try { dayTurn(-1); save(); } catch (e) {} });
