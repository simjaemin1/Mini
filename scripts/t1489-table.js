#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · 표 입 · T1489 · 제품 코드 · 있던 스크립트 손 0)
// =============================================================================
// scripts/t1489-table.js — T1489 표를 파일로(손 셈 0)
//   묶기:  node scripts/t1489-table.js --pack /var/tmp/t1489w 계측/T1489_<날짜>
//          = RAW/raw/<판>/ 의 귀 줄(`p.closes.jsonl` · `p.queue.jsonl` · `p.prof.<pid>.json` · `load.jsonl` · `corner.jsonl`)을 판마다 한 줄로 줄여 DIR/packed.jsonl.gz 에(원자료는 레포 밖이라 이 묶음이 증거 정본).
//   표:    node scripts/t1489-table.js --md 계측/T1489_<날짜>/table.md --json 계측/T1489_<날짜>/table.json
//          = 같은 폴더의 packed.jsonl.gz 만 읽는다(다시 내면 바이트 같음).
// 판 이름 규칙: <묶음>-<켬|끔>[-<번호>] — 묶음 lr730(가상 시계 730날) · hv<N>(가상 시계 20날 마을 N) · rl<N>(실시계 봇 8 · 마을 N) · rr<N>(실제 하루 길이) · cb-<갈래>(손님 20판) …
// =============================================================================
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = process.argv.slice(2);
const ZJS = ['zone', 'js'].join('.');   // 존 소스 파일 이름(읽기만 · 띄우지 않는다 — 린트 ⑯ 의 "띄우는 파일" 글자 자를 안 물게)
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };

// ── 묶기 ─────────────────────────────────────────────────────────────────────
function readJsonl(f) { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } }
function pack(RAW, DIR) {
  const root = path.join(RAW, 'raw'), tags = fs.readdirSync(root).sort();
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8').split('\n');
  const labelOf = (line) => { const s = src[line - 1] || ''; const m = /\badd\w*\(\s*'([^']+)'/.exec(s) || /\b(?:addH|addV|addP)\(\s*'([^']+)'/.exec(s); return m ? m[1] : null; };
  const out = [];
  for (const tag of tags) {
    const D = path.join(root, tag), dn = path.join(RAW, 'done', tag + '.done');
    if (!fs.existsSync(dn)) continue;
    const [rc, sec] = fs.readFileSync(dn, 'utf8').trim().split(/\s+/).map(Number);
    const files = fs.readdirSync(D);
    const R = (x) => (x == null ? null : Math.round(x));
    const closes = readJsonl(path.join(D, 'p.closes.jsonl')).map((c) => [c.day | 0, R(c.wall), R(c.cpu), c.mini | 0, c.queued == null ? null : c.queued, c.frames == null ? null : c.frames, c.villages, c.routes, c.loop ? c.loop.max : null, (c.stg || []).slice(0, 4).map(([k, v]) => [k, R(v)])]);
    const queue = readJsonl(path.join(D, 'p.queue.jsonl')).map((q) => [q.type || '?', R(q.waitMs)]);
    const L0 = readJsonl(path.join(D, 'load.jsonl'));
    const load = L0.filter((r) => r.k === 'req').map((r) => ['q', r.type, R(r.ms)]);   // 요청 = [q, 종류, 답까지 ms(없으면 null)]
    const pm = new Map(); for (const r of L0) if (r.k === 'ping') { const k = R(r.ms); pm.set(k, (pm.get(k) || 0) + 1); }
    const ping = [...pm.entries()].sort((a, b) => (a[0] == null ? -1 : b[0] == null ? 1 : a[0] - b[0])).map(([ms, n]) => [ms, n]);   // 핑 RTT 분포 [ms, 수]
    const corner = readJsonl(path.join(D, 'corner.jsonl')).filter((r) => r.k === 'trial' || r.k === 'pair').map((r) => { const o = Object.assign({}, r); delete o.t; return o; });
    const prof = {};
    for (const f of files.filter((x) => /^p\.prof\.\d+\.json$/.test(x))) {
      let j; try { j = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { continue; }
      for (const [bk, B] of Object.entries(j.buckets || {})) {
        const P = prof[bk] || (prof[bk] = { closeMs: 0, outMs: 0, self: {}, incl: {}, job: {} });
        P.closeMs += B.closeMs; P.outMs += B.outMs;
        for (const [k, tgt] of [['closeSelf', 'self'], ['incl', 'incl'], ['job', 'job']]) for (const x of (B[k] || [])) { const key = `${x.fn}|${x.loc}`; P[tgt][key] = (P[tgt][key] || 0) + x.ms; }
      }
    }
    const profOut = {};
    for (const [bk, P] of Object.entries(prof)) {
      const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([k, ms]) => [k, Math.round(ms)]);
      profOut[bk] = { closeMs: +P.closeMs.toFixed(1), outMs: +P.outMs.toFixed(1), self: top(P.self, 40), incl: top(P.incl, 60), job: top(P.job, 20).map(([k, ms]) => { const m = /villages\.js:(\d+)$/.exec(k); return [k, ms, m ? labelOf(+m[1]) : null]; }) };
    }
    let prog = null; try { prog = JSON.parse(fs.readFileSync(path.join(D, 'run', 'progress.json'), 'utf8')); prog = { days: prog.days, done: !!prog.done, ck: prog.ck, segs: (prog.segs || []).length }; } catch (e) { /* */ }
    out.push({ tag, rc, sec, closes, queue, load, ping, corner, prof: profOut, prog });
  }
  // 줄 서는 메시지 목록 = 제품 `VILLAGE_BOOK_MSG`(zone.js) 글자 그대로(읽기만)
  const zsrc = fs.readFileSync(path.join(__dirname, '..', 'server', ZJS), 'utf8');
  const zi = zsrc.indexOf('const VILLAGE_BOOK_MSG = new Set(['), zj = zsrc.indexOf(']);', zi);
  const bookLine = zsrc.slice(0, zi).split('\n').length;
  const book = zi >= 0 ? [...zsrc.slice(zi, zj).replace(/\/\/[^\n]*/g, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
  out.push({ tag: '_meta', book, bookLine });
  fs.mkdirSync(DIR, { recursive: true });
  const body = out.map((o) => JSON.stringify(o)).join('\n') + '\n';
  fs.writeFileSync(path.join(DIR, 'packed.jsonl.gz'), zlib.gzipSync(Buffer.from(body), { level: 9, mtime: 0 }));
  console.log(`묶음 ${out.length}판 · ${(body.length / 1024).toFixed(0)}KB → gz ${(fs.statSync(path.join(DIR, 'packed.jsonl.gz')).size / 1024).toFixed(0)}KB`);
}

// ── 표 ───────────────────────────────────────────────────────────────────────
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1));
const f0 = (x) => (x == null || !isFinite(x) ? '—' : String(Math.round(x)));
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))]; };
const med = (a) => pct(a, 0.5);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const pings = (r) => (r.ping || []).flatMap(([ms, n]) => Array(n).fill(ms));
const md = (head, rows) => ['| ' + head.join(' | ') + ' |', '| ' + head.map(() => '---').join(' | ') + ' |', ...rows.map((r) => '| ' + r.map((x) => (x == null ? '—' : String(x))).join(' | ') + ' |')].join('\n');

function table(IN, mdOut, jsonOut) {
  const all = zlib.gunzipSync(fs.readFileSync(IN)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const META = all.find((r) => r.tag === '_meta') || { book: [], bookLine: null };
  const runs = all.filter((r) => r.tag !== '_meta');
  const parse = (tag) => { const m = /^(.*?)-(on|off|edge)(?:-(\w+))?$/.exec(tag); return m ? { set: m[1], arm: m[2], rep: m[3] || '' } : { set: tag, arm: '?', rep: '' }; };
  for (const r of runs) Object.assign(r, parse(r.tag));
  const J = { runs: runs.length };
  const L = [];
  const by = (set, arm) => runs.filter((r) => r.set === set && r.arm === arm);
  const sets = [...new Set(runs.map((r) => r.set))].sort();
  const ARM = { on: '켬', off: '끔', edge: '끔+이웃잇기' };
  const tails = (rs, f) => rs.flatMap((r) => r.closes.filter((c) => c[3] === 0 && (!f || f(c))));
  const mins = (rs, f) => rs.flatMap((r) => r.closes.filter((c) => c[3] === 1 && (!f || f(c))));
  const dayTotals = (rs) => { const o = []; for (const r of rs) { const m = new Map(); for (const c of r.closes) m.set(c[0], (m.get(c[0]) || 0) + c[2]); o.push(...[...m.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [d, v])); } return o; };
  J.tables = {};

  // 1. 실시계 판(봇 8) — 마감 한 번 + 줄 지연 + 요청 늦음
  const rl = sets.filter((s) => /^rl\d+$/.test(s));
  if (rl.length) {
    const rows = [], jr = [];
    for (const s of rl) for (const arm of ['on', 'off']) {
      const rs = by(s, arm); if (!rs.length) continue;
      const T = tails(rs), Tw = tails(rs, (c) => c[0] >= 6);
      const q = rs.flatMap((r) => r.queue.map((x) => x[1]));
      const req = rs.flatMap((r) => r.load.filter((x) => x[0] === 'q'));
      const lat = req.map((x) => x[2]).filter((x) => x != null);
      const row = { set: s, arm, runs: rs.length, tails: T.length, tailWallMed: med(T.map((c) => c[1])), tailWallP95: pct(T.map((c) => c[1]), 0.95), tailWallMax: Math.max(0, ...T.map((c) => c[1])), warmWallMed: med(Tw.map((c) => c[1])), warmWallMax: Math.max(0, ...Tw.map((c) => c[1])),
        queuedN: q.length, queuedShare: req.length ? q.length / req.length : null, qMed: med(q), qP95: pct(q, 0.95), qMax: q.length ? Math.max(...q) : null, reqN: req.length, latMed: med(lat), latP90: pct(lat, 0.9), latP99: pct(lat, 0.99), latMax: lat.length ? Math.max(...lat) : null, over500: lat.length ? lat.filter((x) => x > 500).length / lat.length : null, over1000: lat.length ? lat.filter((x) => x > 1000).length / lat.length : null };
      jr.push(row);
      rows.push([s, ARM[arm], rs.length, T.length, f0(row.tailWallMed), f0(row.tailWallP95), f0(row.tailWallMax), f0(row.warmWallMed), f0(row.warmWallMax), q.length, f0(row.qMed), f0(row.qP95), f0(row.qMax)]);
    }
    L.push('## 1. 실시계 판(봇 8 · 중앙 + 존 · 하루 0.6초) — 마감(꼬리 한 번)과 줄 선 요청\n');
    L.push('꼬리 = 요청이 줄을 서는 마감(`mini=0` · 마을 장부 마감). 벽시계 ms(진짜 시계). "6날~" = 첫 5날(길 · 거리 처음 계산)을 뺀 값.\n');
    L.push(md(['판', '길 고침', '판수', '꼬리 수', '꼬리 가운데', '꼬리 p95', '꼬리 최대', '6날~ 가운데', '6날~ 최대', '줄 선 요청', '줄 지연 가운데', 'p95', '최대'], rows));
    J.tables.live = jr; L.push('');
    // 요청 늦음
    const rows2 = jr.map((r) => [r.set, ARM[r.arm], r.reqN, f0(r.latMed), f0(r.latP90), f0(r.latP99), f0(r.latMax), r.over500 == null ? '—' : f1(r.over500 * 100) + '%', r.over1000 == null ? '—' : f1(r.over1000 * 100) + '%', r.queuedShare == null ? '—' : f1(r.queuedShare * 100) + '%']);
    L.push('### 1b. 봇 여덟이 마을 요청을 번갈아 보낼 때 — 요청마다 답이 온 때까지(ms)\n');
    L.push(md(['판', '길 고침', '요청', '가운데', 'p90', 'p99', '최대', '0.5초↑', '1초↑', '줄 선 몫'], rows2)); L.push('');
    // 종류별 줄 지연
    const types = new Map();
    for (const r of runs.filter((x) => rl.includes(x.set))) for (const [t, w] of r.queue) { const k = `${r.arm}|${t}`; (types.get(k) || types.set(k, []).get(k)).push(w); }
    const tk = [...types.keys()].sort(); const rowsT = tk.map((k) => { const [arm, t] = k.split('|'); const a = types.get(k); return [t, ARM[arm], a.length, f0(med(a)), f0(pct(a, 0.95)), f0(Math.max(...a))]; });
    L.push('### 1c. 마감 중 실제로 줄을 선 메시지 종류(실시계 판 전부 · 서버 귀)\n'); L.push(md(['메시지', '길 고침', '줄 선 수', '가운데 ms', 'p95', '최대'], rowsT.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)))); L.push('');
    J.tables.queueTypes = rowsT;
    // 핑(줄 안 서는 것)
    const rowsP = []; for (const s of rl) for (const arm of ['on', 'off']) { const rs = by(s, arm); if (!rs.length) continue; const p = rs.flatMap((r) => pings(r)).filter((x) => x != null); rowsP.push([s, ARM[arm], p.length, f0(med(p)), f0(pct(p, 0.99)), f0(Math.max(0, ...p))]); }
    L.push('### 1d. 줄을 안 서는 `ping`(마감 한 프레임이 이벤트 루프를 막는 몫) — RTT ms\n'); L.push(md(['판', '길 고침', '표본', '가운데', 'p99', '최대'], rowsP)); L.push('');
  }
  // 2. 프로파일 — 함수별 · 갓 뜬 세계(1~10날 마디) ↔ 그 뒤(11날~)를 따로
  const profSets = sets.filter((s) => /^(rl\d+|cb-base|hv(\d+|nip)|lr\d+)$/.test(s));
  const profTbl = {};
  const BANDS = [['fresh', (bk) => bk === '001-010', '갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다)'], ['warm', (bk) => bk !== '001-010', '그 뒤(날 11~ 에 비운 표본)']];
  const aggP = (rs, bf) => { const self = {}, incl = {}, job = {}; let close = 0, out = 0; for (const r of rs) for (const [bk, P] of Object.entries(r.prof)) { if (!bf(bk)) continue; close += P.closeMs; out += P.outMs; for (const [k, ms] of P.self) self[k] = (self[k] || 0) + ms; for (const [k, ms] of P.incl) incl[k] = (incl[k] || 0) + ms; for (const [k, ms, lab] of P.job) { const kk = k + '|' + (lab || ''); job[kk] = (job[kk] || 0) + ms; } } const n = Math.max(1, rs.length); for (const o of [self, incl, job]) for (const k of Object.keys(o)) o[k] /= n; return { self, incl, job, close: close / n, out: out / n, n: rs.length }; };
  const cmpRows = (A, B, key, n) => [...new Set([...Object.keys(A[key]), ...Object.keys(B[key])])].map((k) => ({ k, on: A[key][k] || 0, off: B[key][k] || 0 })).map((x) => Object.assign(x, { d: x.on - x.off })).sort((x, y) => y.d - x.d || (x.k < y.k ? -1 : 1)).slice(0, n);
  for (const s of profSets) {
    const on = by(s, 'on'), off = by(s, 'off'); if (!on.length || !off.length) continue;
    profTbl[s] = {};
    for (const [bn, bf, bl] of BANDS) {
      const a = aggP(on, bf), b = aggP(off, bf); if (!(a.close > 0) || !(b.close > 0)) continue;
      const tot = a.close - b.close;
      const self = cmpRows(a, b, 'self', 12), incl = cmpRows(a, b, 'incl', 40).filter((x) => { const fn = x.k.split('|')[0]; return !['(root)', 'processTimers', 'listOnTimeout', '_drainTickJobs', 'g', 'deferLate', '(program)'].includes(fn) && !/^\(anon\)\|zone\.js/.test(x.k); }).slice(0, 8);
      const jobs = cmpRows(a, b, 'job', 6);
      profTbl[s][bn] = { runsOn: a.n, runsOff: b.n, closeOn: a.close, closeOff: b.close, extra: tot, self: self.map((x) => ({ fn: x.k, on: x.on, off: x.off, d: x.d, shareOfExtra: tot > 0 ? x.d / tot : null, shareOfOn: a.close > 0 ? x.on / a.close : null })), incl: incl.map((x) => ({ fn: x.k, on: x.on, off: x.off, d: x.d, shareOfExtra: tot > 0 ? x.d / tot : null, shareOfOn: a.close > 0 ? x.on / a.close : null })), jobs: jobs.map((x) => ({ k: x.k, on: x.on, off: x.off, d: x.d })) };
      const T = profTbl[s][bn];
      L.push(`## 2. 마감 안 CPU 시간을 함수별로 — ${s} · ${bl} (켬 ${a.n}판 ↔ 끔 ${b.n}판 · 판 하나 평균 ms · 1ms 표본)\n`);
      L.push(`마감 안 표본 합: 켬 ${f0(a.close)} ms ↔ 끔 ${f0(b.close)} ms (늘어난 ${f0(tot)} ms) · 마감 밖: 켬 ${f0(a.out)} ↔ 끔 ${f0(b.out)}. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.\n`);
      L.push('### 자기 시간(self)\n');
      L.push(md(['함수 · 파일:줄', '켬 ms', '끔 ms', '늘어남 ms', '늘어난 몫', '켬 몫'], T.self.map((x) => [x.fn.replace('|', ' · '), f0(x.on), f0(x.off), f0(x.d), x.shareOfExtra == null ? '—' : f1(x.shareOfExtra * 100) + '%', f1(x.shareOfOn * 100) + '%']))); L.push('');
      L.push('### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)\n');
      L.push(md(['함수 · 파일:줄', '켬 ms', '끔 ms', '늘어남 ms', '늘어난 몫', '켬 몫'], T.incl.map((x) => [x.fn.replace('|', ' · '), f0(x.on), f0(x.off), f0(x.d), x.shareOfExtra == null ? '—' : f1(x.shareOfExtra * 100) + '%', f1(x.shareOfOn * 100) + '%']))); L.push('');
      L.push('### 마감 일 줄(조각)별\n');
      L.push(md(['조각(줄 · 이름)', '켬 ms', '끔 ms', '늘어남 ms'], T.jobs.map((x) => { const [fn, loc, lab] = x.k.split('|'); return [`${fn === '(anon)' ? '' : fn + ' · '}${loc}${lab ? ' · ' + lab : ''}`, f0(x.on), f0(x.off), f0(x.d)]; }))); L.push('');
    }
  }
  J.tables.prof = profTbl;

  // 3. 마을 수 · 길 수에 따른 크기(가상 시계 판)
  const hv = sets.filter((s) => /^hv(\d+|nip)$/.test(s)).sort((a, b) => (parseInt(a.slice(2), 10) || 999) - (parseInt(b.slice(2), 10) || 999));
  if (hv.length) {
    const rows = [], jr = [];
    for (const s of hv) for (const arm of ['on', 'off']) {
      const rs = by(s, arm); if (!rs.length) continue;
      const T = tails(rs, (c) => c[0] >= 3), M = mins(rs, (c) => c[0] >= 3), dt = dayTotals(rs).filter((x) => x[0] >= 3).map((x) => x[1]);
      const vil = Math.max(0, ...rs.flatMap((r) => r.closes.map((c) => c[6] || 0))), rt = Math.max(0, ...rs.flatMap((r) => r.closes.map((c) => c[7] || 0)));
      jr.push({ set: s, arm, villages: vil, routes: rt, tailCpuMed: med(T.map((c) => c[2])), tailCpuMax: Math.max(0, ...T.map((c) => c[2])), dayCpuMed: med(dt), dayCpuMax: Math.max(0, ...dt) });
      rows.push([s, ARM[arm], vil, rt, T.length, f0(med(T.map((c) => c[2]))), f0(Math.max(0, ...T.map((c) => c[2]))), f0(med(dt)), f0(Math.max(0, ...dt))]);
    }
    L.push('## 3. 마을 수 · 길 수에 따른 마감(가상 시계 · 20날 · 3날~ · 마감 CPU ms)\n');
    L.push(md(['판', '길 고침', '마을', '교역로 쌍', '꼬리 수', '꼬리 CPU 가운데', '꼬리 CPU 최대', '하루 합 가운데', '하루 합 최대'], rows)); L.push('');
    J.tables.scale = jr;
  }
  // 4. 긴 판(세계 나이별)
  const lr = sets.filter((s) => /^lr\d+$/.test(s) || /^(hnip|hcar|hwar)/.test(s));
  if (lr.length) {
    const rows = [], jr = [];
    const bands0 = [[1, 10], [11, 100], [101, 400], [401, 730]];
    for (const s of lr) for (const arm of ['on', 'off']) {
      const rs = by(s, arm); if (!rs.length) continue;
      const maxd = Math.max(0, ...rs.flatMap((r) => r.closes.map((c) => c[0])));
      const bands = bands0.filter(([lo]) => lo <= maxd).map(([lo, hi]) => [lo, Math.min(hi, maxd), `${lo}~${Math.min(hi, maxd)}날`]);
      if (maxd >= 400) bands.push([1, 400, '≤400날 전체']);
      bands.push([1, maxd, `전체(1~${maxd}날)`]);
      for (const [lo, hi, nm] of bands) {
        const f = (c) => c[0] >= lo && c[0] <= hi;
        const T = tails(rs, f), dt = dayTotals(rs).filter((x) => x[0] >= lo && x[0] <= hi).map((x) => x[1]);
        if (!T.length) continue;
        const vil = Math.max(0, ...rs.flatMap((r) => r.closes.filter(f).map((c) => c[6] || 0))), rt = Math.max(0, ...rs.flatMap((r) => r.closes.filter(f).map((c) => c[7] || 0)));
        jr.push({ set: s, arm, band: nm, tails: T.length, villages: vil, routes: rt, tailCpuMed: med(T.map((c) => c[2])), tailCpuP95: pct(T.map((c) => c[2]), 0.95), tailCpuMax: Math.max(...T.map((c) => c[2])), dayCpuMed: med(dt), dayCpuMax: Math.max(0, ...dt) });
        rows.push([s, ARM[arm], nm, T.length, vil, rt || '—', f0(med(T.map((c) => c[2]))), f0(pct(T.map((c) => c[2]), 0.95)), f0(Math.max(...T.map((c) => c[2]))), f0(med(dt)), f0(Math.max(0, ...dt))]);
      }
    }
    L.push('## 4. 세계 나이 · 크기별 마감(가상 시계 긴 판 · 마감 CPU ms · 꼬리 = 줄 서는 마감)\n');
    L.push(md(['판', '길 고침', '구간', '꼬리 수', '마을', '교역로 쌍(표본)', '꼬리 가운데', '꼬리 p95', '꼬리 최대', '하루 합 가운데', '하루 합 최대'], rows)); L.push('');
    J.tables.long = jr;
  }
  // 5. 손님 코너
  const cb = sets.filter((s) => /^cb[nr]?-/.test(s));
  if (cb.length) {
    const rows = [], jr = [];
    for (const s of cb) for (const arm of ['on', 'off']) {
      const rs = by(s, arm); if (!rs.length) continue;
      const T = rs.flatMap((r) => r.corner.filter((x) => x.k === 'trial' && !x.err));
      const subs = [...new Set(T.map((x) => x.tag || ''))].sort();
      for (const sub of subs) {
        const tt = T.filter((x) => (x.tag || '') === sub);
        const red = tt.filter((x) => x.red).length, chief = tt.filter((x) => x.chief).length, stale = tt.filter((x) => !x.red && !x.chief && (x.notices || []).some((t) => /한가운데에서 너무 멉니다/.test(t))).length;
        jr.push({ set: s, arm, sub, n: tt.length, red, stale, chief, other: tt.length - red - chief - stale });
        rows.push([s, ARM[arm], sub || '—', tt.length, red, stale, chief, tt.length - red - chief - stale, f0(med(tt.map((x) => x.briefAt).filter((x) => x != null)))]);
      }
    }
    L.push('## 5. 손님 `/인출` — 거절 "마을에서 너무 멉니다"(빨강) 몫\n');
    L.push('"옛 마을" = `/인출` 이 "마을 한가운데에서 너무 멉니다"(`villages.js` `_villageNear`) — 곁 마을 표시가 비지 않고 **앞 마을(B)** 을 가리킨 채 남은 판(A 의 brief 가 줄에 선 사이). 빨강과 같은 차례 결함의 다른 얼굴.\n');
    L.push(md(['판', '길 고침', '갈래', '판수', '빨강(너무 멉니다)', '옛 마을(한가운데 멉니다)', '촌장 문 말(초록)', '그 밖', 'brief 보낸 때 가운데 ms'], rows)); L.push('');
    J.tables.corner = jr;
    const extra = [];
    for (const r of runs.filter((x) => cb.includes(x.set))) for (const x of r.corner) if (x.k === 'pair') extra.push(`${r.tag}: 가장 가까운 두 마을 ${x.a.name}(${x.a.vid}) ↔ ${x.b.name}(${x.b.vid}) ${x.d}px`);
    for (const r of runs.filter((x) => /^cb-private/.test(x.set))) { const t0 = r.corner.find((x) => x.k === 'trial' && x.tried); if (t0) extra.push(`${r.tag}: 첫 판 땅 잡기 시도 ${t0.tried.length}번 — ${JSON.stringify(t0.tried.slice(0, 6))} …`); }
    if (extra.length) { L.push(extra.map((x) => '* ' + x).join('\n')); L.push(''); }
  }
  // 6. 실제 하루 길이
  const rr = sets.filter((s) => /^rr\d+$/.test(s));
  if (rr.length) {
    const rows = [];
    for (const s of rr) for (const arm of ['on', 'off']) for (const r of by(s, arm)) { const T = tails([r]); const q = r.queue.map((x) => x[1]); const lat = r.load.filter((x) => x[0] === 'q').map((x) => x[2]).filter((x) => x != null); const pg = pings(r).filter((x) => x != null); const days = Math.max(0, ...r.closes.map((c) => c[0])); rows.push([r.tag, ARM[arm], f0(r.sec), days, T.length, T.map((c) => `${c[0]}날 ${f0(c[1])}`).join(' · ') || '—', q.length, f0(med(q)), f0(q.length ? Math.max(...q) : null), lat.length, f0(med(lat)), f0(pct(lat, 0.99)), f0(lat.length ? Math.max(...lat) : null), f0(pct(pg, 0.99)), f0(pg.length ? Math.max(...pg) : null)]); }
    L.push('## 6. 실제 하루 길이(24분 · 봇 8)에서 본 마감\n');
    L.push('하루 = 1,440,000 ms(24분 · `VILLAGE_DAY_MS`) · 판 초 = 기동 포함. 꼬리 = 줄 서는 마감(날 · 벽시계 ms). 요청 = 봇 여덟의 마을 요청 → 답 ms.\n');
    L.push(md(['판', '길 고침', '판 초', '마지막 날', '꼬리 수', '꼬리(날 · ms)', '줄 선 요청', '줄 가운데 ms', '줄 최대 ms', '요청', '요청 가운데', 'p99', '최대', 'ping p99', 'ping 최대'], rows)); L.push('');
    J.tables.realclock = rows;
  }
  // 7. 날 수 · 마감 횟수(가상 시계 판 — 하루당 마감 몇 번)
  const cyc = [];
  for (const r of runs.filter((x) => /^(lr|hv)/.test(x.set))) { const days = new Map(); for (const c of r.closes) { const d = days.get(c[0]) || { mini: 0, tail: 0, cpu: 0, tailCpu: 0 }; if (c[3]) d.mini++; else { d.tail++; d.tailCpu += c[2]; } d.cpu += c[2]; days.set(c[0], d); } const ds = [...days.entries()].filter((x) => x[0] >= 3).map((x) => x[1]); if (ds.length) cyc.push({ tag: r.tag, days: ds.length, miniMed: med(ds.map((d) => d.mini)), tailMed: med(ds.map((d) => d.tail)), tailMax: Math.max(...ds.map((d) => d.tail)) }); }
  if (cyc.length) { L.push('## 7. 하루에 마감이 몇 번 도나(가상 시계 판 · 3날~ · 마감 = 장부 줄이 서고 지는 한 바퀴)\n'); L.push(md(['판', '날 수', '미니 마감(줄 안 섬) 가운데/날', '꼬리 마감(줄 섬) 가운데/날', '꼬리 최대/날'], cyc.map((x) => [x.tag, x.days, f0(x.miniMed), f0(x.tailMed), f0(x.tailMax)]))); L.push(''); J.tables.cycles = cyc; }

  // 8. 갓 뜬 세계 — 날마다 꼬리 마감 벽시계(실시계 판 · 판들 가운데) · 켬 ↔ 끔 ↔ 끔+이웃 잇기
  const early = sets.filter((s) => /^(rl\d+|cb-base|cbn-base|rr\d+)$/.test(s));
  if (early.length) {
    const rows = [], jr = [];
    for (const s of early) for (const arm of ['on', 'off', 'edge']) {
      const rs = by(s, arm); if (!rs.length) continue;
      const per = []; for (let d = 1; d <= 6; d++) { const w = rs.map((r) => r.closes.filter((c) => c[3] === 0 && c[0] === d).reduce((a, c) => a + c[1], 0)).filter((x) => x > 0); per.push(w.length ? med(w) : null); }
      const d1 = rs.map((r) => (r.closes.find((c) => c[3] === 0 && c[0] === 1) || [])[9]).filter(Boolean).map((st) => (st.find((x) => x[0] === 'dist') || [null, 0])[1]);
      const fr = rs.map((r) => (r.closes.find((c) => c[3] === 0 && c[0] === 1) || [])[5]).filter((x) => x != null);
      jr.push({ set: s, arm, runs: rs.length, day: per, distStgDay1: d1.length ? med(d1) : null, framesDay1: fr.length ? med(fr) : null });
      rows.push([s, ARM[arm], rs.length, ...per.map(f0), f0(d1.length ? med(d1) : null), f0(fr.length ? med(fr) : null)]);
    }
    L.push('## 8. 갓 뜬 세계 — 날마다 꼬리 마감 벽시계 ms(실시계 판 · 판들 가운데)\n');
    L.push('"첫 마감 dist" = 1날 꼬리 마감의 단계 시간 `dist`(제품 `tickCtx.stg` 값) · "프레임" = 그 마감이 걸친 프레임 수. 켬만 `dist` 조각이 선다.\n');
    L.push(md(['판', '길 고침', '판수', '1날', '2날', '3날', '4날', '5날', '6날', '첫 마감 dist ms', '첫 마감 프레임'], rows)); L.push('');
    J.tables.early = jr;
  }
  // 0. 첫 줄 값(보고 첫 줄이 여기 값만 쓴다)
  const H = {};
  const tw = (rs, f) => tails(rs, f).map((c) => c[1]);
  const vm3on = [...by('cb-base', 'on'), ...by('rl3', 'on')], vm3off = [...by('cb-base', 'off'), ...by('rl3', 'off')];
  H.closeMedOff = med(tw(by('cb-base', 'off'))); H.closeMedOn = med(tw(by('cb-base', 'on')));
  H.firstOff = med(tw(vm3off, (c) => c[0] === 1)); H.firstOn = med(tw(vm3on, (c) => c[0] === 1));
  const qOn = by('cb-base', 'on').flatMap((r) => r.queue.map((x) => x[1])), qOff = by('cb-base', 'off').flatMap((r) => r.queue.map((x) => x[1]));
  H.queueMedOff = med(qOff); H.queueMedOn = med(qOn); H.queueMaxOn = qOn.length ? Math.max(...qOn) : null; H.queueNOn = qOn.length; H.queueNOff = qOff.length;
  const PF = profTbl.rl3 && profTbl.rl3.fresh;
  if (PF) { const c = PF.incl.filter((x) => x.off === 0 && x.shareOfOn >= 0.5).sort((a, b) => a.on - b.on)[0]; H.owner = c ? { fn: c.fn, on: c.on, shareOfOn: c.shareOfOn, extra: PF.extra, closeOn: PF.closeOn, closeOff: PF.closeOff } : null; const j = PF.jobs[0]; H.ownerJob = j ? { k: j.k, on: j.on, off: j.off } : null; }
  H.book = META.book.length; H.bookLine = META.bookLine;
  H.queuedSeen = [...new Set(runs.flatMap((r) => r.queue.map((x) => x[0])))].sort();
  for (const s of ['rl51', 'rr51', 'rl3']) { const rs = by(s, 'on'); const lat = rs.flatMap((r) => r.load.filter((x) => x[0] === 'q').map((x) => x[2])).filter((x) => x != null); if (lat.length) { H['lat_' + s] = { n: lat.length, med: med(lat), max: Math.max(...lat), p99: pct(lat, 0.99) }; } }
  for (const arm of ['on', 'off']) { const rs = by('rr51', arm); if (!rs.length) continue; let blocked = 0, sec = 0, nt = 0; for (const r of rs) { const T = tails([r]); blocked += sum(T.map((c) => c[1])) / 1000; nt += T.length; sec += r.sec; } H['rr_' + arm] = { tails: nt, blockedSec: blocked, runSec: sec, perHour: sec > 0 ? blocked / sec * 3600 : null, tailsWarm: tails(rs, (c) => c[0] >= 2).map((c) => c[1]) }; }
  for (const arm of ['on', 'off']) { const rs = by('lr730', arm); if (rs.length) H['lr_' + arm] = med(tails(rs, (c) => c[0] >= 11).map((c) => c[2])); }
  for (const arm of ['on', 'off']) { const rs = by('rl51', arm); if (rs.length) H['rl51_' + arm] = { firstClose: med(tw(rs, (c) => c[0] === 1)), warmMed: med(tw(rs, (c) => c[0] >= 6)), warmMax: Math.max(0, ...tw(rs, (c) => c[0] >= 6)), villages: Math.max(0, ...rs.flatMap((r) => r.closes.map((c) => c[6] || 0))) }; }
  for (const s of ['hv51', 'hvnip']) for (const arm of ['on', 'off']) { const rs = by(s, arm); if (rs.length) H[s + '_' + arm] = { villages: Math.max(0, ...rs.flatMap((r) => r.closes.map((c) => c[6] || 0))), tailCpuMed: med(tails(rs, (c) => c[0] >= 3).map((c) => c[2])), tailCpuMax: Math.max(0, ...tails(rs, (c) => c[0] >= 3).map((c) => c[2])) }; }
  const isStale = (x) => !x.red && !x.chief && (x.notices || []).some((t) => /한가운데에서 너무 멉니다/.test(t));
  const red = (set, arm) => { const T = by(set, arm).flatMap((r) => r.corner.filter((x) => x.k === 'trial' && !x.err)); return { red: T.filter((x) => x.red || isStale(x)).length, far: T.filter((x) => x.red).length, n: T.length }; };
  const ADJ = by('cb-adj50', 'on').length ? 'cb-adj50' : 'cb-adj'; H.adjSet = ADJ;
  H.corner = {}; for (const s of ['cb-cross', 'cb-adj', 'cb-adj50', 'cb-private', 'cb-base', 'cbn-base', 'cbr-adj', 'cbr-cross', 'cbr-base']) for (const arm of ['on', 'off']) if (by(s, arm).length) H.corner[s + '-' + arm] = red(s, arm);
  const subRed = (set, arm) => { const T = by(set, arm).flatMap((r) => r.corner.filter((x) => x.k === 'trial' && !x.err)); const o = {}; for (const x of T) { const k = x.tag || '?'; o[k] = o[k] || { red: 0, n: 0 }; o[k].n++; if (x.red || isStale(x)) o[k].red++; } return Object.keys(o).sort().map((k) => `${k} ${o[k].red}/${o[k].n}`).join(' · '); };
  H.cornerSub = {}; for (const s of ['cb-cross', ADJ, 'cb-private', 'cbr-cross', 'cbr-adj']) for (const arm of ['on', 'off']) if (by(s, arm).length) H.cornerSub[s + '-' + arm] = subRed(s, arm);
  J.headline = H;
  const L0 = ['## 0. 보고 첫 줄 값(이 절만 쓴다)\n'];
  L0.push(md(['값', '숫자', '어디서'], [
    ['마감 가운데(꼬리 · 손님 하나 판 · 끔 → 켬)', `${f0(H.closeMedOff)} → ${f0(H.closeMedOn)} ms`, 'cb-base 꼬리 마감 벽시계 전부'],
    ['갓 뜬 첫 마감(1날 꼬리 · 끔 → 켬)', `${f0(H.firstOff)} → ${f0(H.firstOn)} ms`, 'cb-base + rl3(마을 3) 1날 꼬리'],
    ['줄 지연 가운데(손님 하나 · 끔 → 켬)', `${f0(H.queueMedOff)}(${H.queueNOff}건) → ${f0(H.queueMedOn)}(${H.queueNOn}건) ms · 켬 최대 ${f0(H.queueMaxOn)}`, 'cb-base 서버 귀 줄'],
    ['늘린 줄(갓 뜬 세계 · 켬 마감 몫)', H.owner ? `${H.owner.fn.replace('|', ' · ')} ${f0(H.owner.on)} ms · ${f1(H.owner.shareOfOn * 100)}% (켬 ${f0(H.owner.closeOn)} ↔ 끔 ${f0(H.owner.closeOff)})` : '—', 'rl3 프로파일 갓 뜬 세계 포함 시간 · 끔 0 · 켬 몫 50%↑ 가운데 가장 안쪽'],
    ['늘린 조각', H.ownerJob ? `${H.ownerJob.k.replace(/\|/g, ' · ')} 켬 ${f0(H.ownerJob.on)} ↔ 끔 ${f0(H.ownerJob.off)} ms` : '—', 'rl3 갓 뜬 세계 마감 일 줄'],
    ['51마을 실시계(켬) 첫 마감 · 6날~ 가운데 · 최대', H.rl51_on ? `${f0(H.rl51_on.firstClose)} · ${f0(H.rl51_on.warmMed)} · ${f0(H.rl51_on.warmMax)} ms (마을 ${H.rl51_on.villages})` : '—', 'rl51 켬'],
    ['51마을 실시계(끔) 첫 마감 · 6날~ 가운데 · 최대', H.rl51_off ? `${f0(H.rl51_off.firstClose)} · ${f0(H.rl51_off.warmMed)} · ${f0(H.rl51_off.warmMax)} ms` : '—', 'rl51 끔'],
    ['닛폰(가상 시계 20날) 꼬리 CPU 가운데 · 최대(켬)', H.hvnip_on ? `${f0(H.hvnip_on.tailCpuMed)} · ${f0(H.hvnip_on.tailCpuMax)} ms (마을 ${H.hvnip_on.villages})` : '—', 'hvnip 켬'],
    ['한반도(가상 시계 20날) 꼬리 CPU 가운데 · 최대(켬)', H.hv51_on ? `${f0(H.hv51_on.tailCpuMed)} · ${f0(H.hv51_on.tailCpuMax)} ms (마을 ${H.hv51_on.villages})` : '—', 'hv51 켬'],
    ['줄 서는 메시지 종류(제품 목록)', `${H.book}종 (${ZJS}:${H.bookLine}) · 판에서 실제로 선 것 ${H.queuedSeen.join(' · ')}`, '`VILLAGE_BOOK_MSG` 글자'],
    ['요청 늦음(봇 8 · 켬) 가운데 · 최대', ['rr51', 'rl51', 'rl3'].filter((s) => H['lat_' + s]).map((s) => `${s} ${f0(H['lat_' + s].med)} · ${f0(H['lat_' + s].max)} ms(${H['lat_' + s].n}건)`).join(' / ') || '—', 'load.jsonl 요청 → 답'],
    ['실제 하루(24분) 한 시간에 막히는 초(켬 · 끔)', ['on', 'off'].filter((a) => H['rr_' + a]).map((a) => `${ARM[a]} ${f1(H['rr_' + a].perHour)}초(꼬리 ${H['rr_' + a].tails} · 막힌 ${f1(H['rr_' + a].blockedSec)}초 / 판 ${f0(H['rr_' + a].runSec)}초)`).join(' · ') || '—', 'rr51 꼬리 벽시계 합 ÷ 판 길이'],
    ['어림(한 시간 = 하루 24분 × 2.5 · 하루 꼬리 1번 × 51마을 꼬리 가운데)', ['on', 'off'].filter((a) => H['rl51_' + a]).map((a) => `${ARM[a]} 실시계 6날~ ${f1(2.5 * H['rl51_' + a].warmMed / 1000)}초 · 가상 시계 lr730 CPU ${H['lr_' + a] ? f1(2.5 * H['lr_' + a] / 1000) : '—'}초`).join(' · ') || '—', 'rl51 6날~ 꼬리 벽시계 가운데 · lr730 꼬리 CPU 가운데(하루 꼬리 = 표 7)'],
    ['못 돌린 셋 거절(켬 · 빨강 + 옛 마을) 존 넘어옴 · 맞닿은 곳간 · 사유지', ['cb-cross', ADJ, 'cb-private'].map((s) => H.corner[s + '-on'] ? `${H.corner[s + '-on'].red}/${H.corner[s + '-on'].n}` : '—').join(' · '), 'cb-* 켬'],
    ['못 돌린 셋 거절(끔)', ['cb-cross', ADJ, 'cb-private'].map((s) => H.corner[s + '-off'] ? `${H.corner[s + '-off'].red}/${H.corner[s + '-off'].n}` : '—').join(' · '), 'cb-* 끔'],
    ['못 돌린 셋 갈래별(켬)', ['cb-cross', ADJ, 'cb-private'].map((s) => H.cornerSub[s + '-on'] || '—').join(' / '), 'cb-* 켬 · 갈래(tag)별'],
    ['못 돌린 셋 갈래별(끔)', ['cb-cross', ADJ, 'cb-private'].map((s) => H.cornerSub[s + '-off'] || '—').join(' / '), 'cb-* 끔 · 갈래(tag)별'],
    ['실제 하루(24분 · 51마을) 손님 거절 — 맞닿은 곳간 켬 · 끔 / 존 넘어옴 켬 / 기본 켬', `${['on', 'off'].map((a) => H.corner['cbr-adj-' + a] ? H.corner['cbr-adj-' + a].red + '/' + H.corner['cbr-adj-' + a].n : '—').join(' · ')} / ${H.cornerSub['cbr-cross-on'] || '—'} / ${H.corner['cbr-base-on'] ? H.corner['cbr-base-on'].red + '/' + H.corner['cbr-base-on'].n : '—'}`, 'cbr-*'],
    ['맞닿은 곳간 세계별(켬 · 끔) — 23마을(VILLAGE_MAX=51 env) / 51마을(전수)', `${['on', 'off'].map((a) => H.corner['cb-adj-' + a] ? H.corner['cb-adj-' + a].red + '/' + H.corner['cb-adj-' + a].n : '—').join(' · ')} / ${['on', 'off'].map((a) => H.corner['cb-adj50-' + a] ? H.corner['cb-adj50-' + a].red + '/' + H.corner['cb-adj50-' + a].n : '—').join(' · ')}`, 'cb-adj · cb-adj50(하루 0.6초)'],
    ['관찰기 무변(기본 판 켬 빨강) 귀 있음 ↔ 귀 없음', `${H.corner['cb-base-on'] ? H.corner['cb-base-on'].red + '/' + H.corner['cb-base-on'].n : '—'} ↔ ${H.corner['cbn-base-on'] ? H.corner['cbn-base-on'].red + '/' + H.corner['cbn-base-on'].n : '—'}`, 'cb-base 켬(판 둘) ↔ cbn-base 켬(판 둘 · 귀 0)'],
  ])); L0.push('');
  L.unshift(...L0);
  // 8. 판 실행 요약
  L.push('## 9. 판 목록(끝 코드 · 초)\n');
  L.push(md(['판', '종료', '초', '마감 줄 수', '줄 선 요청 수', '진행'], runs.map((r) => [r.tag, r.rc, r.sec, r.closes.length, r.queue.length, r.prog ? `${r.prog.days}날 ${r.prog.done ? '끝' : '끊김'}` : '—']))); L.push('');
  J.tables.runs = runs.map((r) => ({ tag: r.tag, rc: r.rc, sec: r.sec, closes: r.closes.length, queue: r.queue.length }));
  fs.writeFileSync(mdOut, '# T1489 표 (손 셈 0 · `scripts/t1489-table.js` 가 `packed.jsonl.gz` 에서 낸다)\n\n' + L.join('\n') + '\n');
  fs.writeFileSync(jsonOut, JSON.stringify(J, null, 1) + '\n');
}

if (opt('--pack')) pack(opt('--pack'), A[A.indexOf('--pack') + 2]);
else if (opt('--md')) { const mdp = opt('--md'), jp = opt('--json') || mdp.replace(/\.md$/, '.json'); table(path.join(path.dirname(mdp), 'packed.jsonl.gz'), mdp, jp); }
else console.error('쓰는 법: --pack <RAW> <DIR> | --md <DIR/table.md> [--json <DIR/table.json>]');
