#!/usr/bin/env node
// (@regress 없음 — 러너 밖 표 입 · T1485)
// =============================================================================
// scripts/t1485-table.js — T1485 표 입. 세계를 안 띄운다 · 제품 코드 · 하네스를 안 부른다 · 묶은 판 요약만 읽는다(손 셈 0).
//   묶기  node scripts/t1485-table.js --pack <raw 디렉터리(/var/tmp/t1485w)> <out 디렉터리(계측/T1485_<날짜>)>
//          → out/runs.jsonl.gz (판마다 한 줄: 끝 표시 · ⑦ 줄 · 귀 줄 가운데 첫 순간 이동 ~ 첫 `/인출` 뒤 3초 · 걸어간 봇 요약)
//   표    node scripts/t1485-table.js --md <out>/table.md --json <out>/table.json [--dir <out>]
// 판정(스크립트가 셈):
//   빨강 = 하네스 로그의 ⑦ 줄(`⑦ 곳간은 촌장만`)이 ✗. 판 종류: mem(귀 건 ⑦) · memplain(귀 없는 ⑦ · 귀가 판을 안 바꾸는지 견주는 대조) · walk(걸어간 봇) · 켬(on) = 기본 · 끔(off) = T1327_ROUTE_FIX=0.
//   표시가 빈 판 = 첫 `/인출` 호출 앞의 `_memberNearVid` 가 null.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const list = (f) => { const i = argv.indexOf(f); if (i < 0) return []; const o = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) o.push(argv[j]); return o; };
const readLines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2); };
const fmt = (v) => (v == null ? '·' : String(v));

// ───────────────────────── 묶기 ─────────────────────────
if (argv.includes('--pack')) {
  const [rawRoot, outDir] = list('--pack');
  fs.mkdirSync(outDir, { recursive: true });
  const doneDir = path.join(rawRoot, 'done'), rawDir = path.join(rawRoot, 'raw');
  const out = [];
  for (const f of fs.readdirSync(doneDir).sort()) {
    const m = /^(mem|memplain|walk|walklong|walkre|walkre2)-(on|off|edge)-(\d+)\.done$/.exec(f);
    if (!m) continue;
    const tag = f.replace(/\.done$/, '');
    const [rc, secs] = fs.readFileSync(path.join(doneDir, f), 'utf8').trim().split(/\s+/).map(Number);
    const res = readLines(path.join(rawDir, tag + '.res.txt'));
    const l7 = res.find((l) => /⑦ 곳간은 촌장만/.test(l)) || null;
    const l7b = res.find((l) => /⑦b /.test(l)) || null;
    const ev = readLines(path.join(rawDir, tag + '.obs.jsonl')).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    const chat0 = ev.find((e) => e.k === 'chat');
    const tele0 = ev.find((e) => e.k === 'msg' && e.type === 'teleport_debug');
    const lo = tele0 ? tele0.t - 500 : 0, hi = chat0 ? chat0.t + 3000 : Infinity;
    const keep = ev.filter((e) => e.t >= lo && e.t <= hi || e.k === 'conn').map((e) => { const o = Object.assign({}, e); if (o.stack) o.stack = o.stack.slice(0, 5); delete o.first; return o; });
    let walk = null; try { walk = JSON.parse(fs.readFileSync(path.join(rawDir, tag + '.walk.json'), 'utf8')); } catch (e) { /* */ }
    out.push({ tag, kind: m[1], arm: m[2], k: +m[3], rc, secs, red7: l7 ? /✗/.test(l7) : null, line7: l7 ? l7.trim().slice(0, 200) : null, red7b: l7b ? /✗/.test(l7b) : null, nSets: ev.filter((e) => e.k === 'set').length, ev: keep, walk });
  }
  fs.writeFileSync(path.join(outDir, 'runs.jsonl.gz'), zlib.gzipSync(out.map((r) => JSON.stringify(r)).join('\n') + '\n', { level: 9, mtime: 0 }));
  console.log(`묶음 ${out.length} 판 → ${path.join(outDir, 'runs.jsonl.gz')}`);
  process.exit(0);
}

// ───────────────────────── 표 ─────────────────────────
const DIR = val('--dir', path.dirname(val('--md', 'x/table.md')));
const runs = zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'runs.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sortKey = (r) => `${r.kind}|${r.arm}|${String(r.k).padStart(3, '0')}`;
runs.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));

// 판 하나에서 뽑는다(귀 줄 → 파생값)
function derive(r) {
  const ev = r.ev || [];
  const chat = ev.find((e) => e.k === 'chat') || null;
  const d = { tag: r.tag, kind: r.kind, arm: r.arm, k: r.k, red: r.red7, rc: r.rc, secs: r.secs, hasObs: !!chat };
  if (!chat) return d;
  const tele = ev.filter((e) => e.k === 'msg' && e.type === 'teleport_debug' && e.t <= chat.t);
  const lastTele = tele.length ? tele[tele.length - 1] : null;
  d.arrival = tele.length ? '순간이동' : '걸음';
  d.nTele = tele.length;
  d.nearAtChat = chat.nearVid;                       // null = 빔
  d.empty = chat.nearVid == null;
  d.terrAtChat = chat.terr; d.gate = chat.near && chat.near[0] ? chat.near[0].gate : null; d.dist = chat.near && chat.near[0] ? chat.near[0].d : null;
  d.busyAtChat = chat.busy; d.lagAtChat = chat.lag;
  const t0 = lastTele ? lastTele.t : null;
  d.tTeleToChat = t0 != null ? chat.t - t0 : null;
  const sets = ev.filter((e) => e.k === 'set');
  const setsBefore = sets.filter((e) => e.t <= chat.t);
  d.nSetBefore = setsBefore.length;
  const fs0 = sets.find((e) => e.t > (t0 || 0));
  d.tTeleToFirstSet = fs0 && t0 != null ? fs0.t - t0 : null;
  d.firstSetAfterChat = fs0 ? fs0.t > chat.t : null;
  d.firstSetVia = fs0 ? (fs0.stack || []).some((s) => /_drainVillageWaitQ/.test(s)) ? '줄 풀기(_drainVillageWaitQ)' : (fs0.stack || []).some((s) => /WebSocket/.test(s)) ? '바로(ws 귀)' : '그 밖' : null;
  d.firstSetFn = fs0 ? (fs0.stack || [])[0] : null;
  d.firstSetTerr = fs0 ? fs0.terr : null;
  d.firstSetDist = fs0 && fs0.near && fs0.near[0] ? fs0.near[0].d : null;
  const briefs = ev.filter((e) => e.k === 'msg' && e.type === 'village_brief' && (t0 == null || e.t > t0));
  const bBefore = briefs.filter((e) => e.t <= chat.t);
  d.nBriefMsgBeforeChat = bBefore.length;
  d.tTeleToFirstBriefMsg = briefs.length && t0 != null ? briefs[0].t - t0 : null;
  d.firstBriefBusy = briefs.length ? briefs[0].busy : null;
  d.briefBusyBeforeChat = bBefore.filter((e) => e.busy).length;
  d.maxLagBeforeChat = Math.max(0, ...ev.filter((e) => e.t > (t0 || 0) && e.t <= chat.t).map((e) => e.lag || 0));
  const bAll = ev.filter((e) => e.k === 'msg' && e.type === 'village_brief');
  d.nBriefAll = bAll.length; d.nBriefBusyAll = bAll.filter((e) => e.busy).length;
  d.deferDelays = sets.filter((e) => (e.stack || []).some((q) => /_drainVillageWaitQ/.test(q))).map((e) => { const pr = bAll.filter((m) => m.busy && m.t <= e.t); return pr.length ? e.t - pr[pr.length - 1].t : null; }).filter((x) => x != null);
  d.nClear = sets.filter((e) => e.val == null).length; d.nDistinctVals = new Set(sets.map((e) => e.val)).size;
  d.sameBody = (() => { const b = new Set(sets.map((e) => e.body)); return b.size <= 1 && (!b.size || b.has(chat.body)); })();
  // 갈래: 칸 하나(상호 배타)
  if (!d.empty) d.branch = '찼음';
  else if (!bBefore.length) d.branch = '빔 · 순간이동 뒤 brief 가 `/인출` 앞에 서버에 안 닿음';
  else if (bBefore.length && d.firstSetAfterChat) d.branch = '빔 · brief 는 닿았으나 `/인출` 뒤에야 처리됨(줄 섬)';
  else d.branch = '빔 · 그 밖';
  return d;
}
const D = runs.map(derive);

const cnt = (a, f) => a.filter(f).length;
const summ = (kind, arm) => {
  const a = D.filter((x) => x.kind === kind && x.arm === arm);
  return { kind, arm, n: a.length, red: cnt(a, (x) => x.red === true), green: cnt(a, (x) => x.red === false), unknown: cnt(a, (x) => x.red == null), empty: cnt(a, (x) => x.hasObs && x.empty), filled: cnt(a, (x) => x.hasObs && !x.empty) };
};
const S = { memEdge: summ('mem', 'edge'), memOn: summ('mem', 'on'), memOff: summ('mem', 'off'), plainOn: summ('memplain', 'on'), walkOn: summ('walk', 'on'), walkOff: summ('walk', 'off') };
const memAll = D.filter((x) => x.kind === 'mem' && x.hasObs);
// 빨강 ↔ 빔(귀 줄이 있는 판 안에서 일치하나)
const redEmptyAgree = { both: cnt(memAll, (x) => x.red && x.empty), redNotEmpty: cnt(memAll, (x) => x.red && !x.empty), emptyNotRed: cnt(memAll, (x) => !x.red && x.empty), neither: cnt(memAll, (x) => !x.red && !x.empty) };
// 가르는 것: 첫 set 이 `/인출` 앞인가 뒤인가 × 빨강
const sepOrder = { red_setAfterChat: cnt(memAll, (x) => x.red && x.firstSetAfterChat === true), red_setBeforeChat: cnt(memAll, (x) => x.red && x.firstSetAfterChat === false), red_noSet: cnt(memAll, (x) => x.red && x.firstSetAfterChat == null),
  green_setAfterChat: cnt(memAll, (x) => !x.red && x.firstSetAfterChat === true), green_setBeforeChat: cnt(memAll, (x) => !x.red && x.firstSetAfterChat === false), green_noSet: cnt(memAll, (x) => !x.red && x.firstSetAfterChat == null) };
const groupBy = (a, f) => { const o = {}; for (const x of a) { const k = f(x); (o[k] = o[k] || []).push(x); } return o; };
const stat = (a, key) => { const v = a.map((x) => x[key]).filter((x) => x != null && Number.isFinite(x)); return v.length ? { n: v.length, min: Math.min(...v), med: med(v), max: Math.max(...v) } : null; };
const timing = {};
for (const g of ['red', 'green']) { const a = memAll.filter((x) => (g === 'red') === !!x.red); timing[g] = { n: a.length, tTeleToChat: stat(a, 'tTeleToChat'), tTeleToFirstBriefMsg: stat(a, 'tTeleToFirstBriefMsg'), tTeleToFirstSet: stat(a, 'tTeleToFirstSet'), nBriefMsgBeforeChat: stat(a, 'nBriefMsgBeforeChat'), maxLagBeforeChat: stat(a, 'maxLagBeforeChat'), briefBusyBeforeChat: stat(a, 'briefBusyBeforeChat') }; }
const deferStat = {};
for (const arm of ['on', 'off', 'edge']) { const a = memAll.filter((x) => x.arm === arm); const dl = [].concat(...a.map((x) => x.deferDelays || [])); deferStat[arm] = { runs: a.length, briefMsgs: a.reduce((q, x) => q + x.nBriefAll, 0), busyMsgs: a.reduce((q, x) => q + x.nBriefBusyAll, 0), deferredSets: dl.length, delayMed: med(dl), delayMax: dl.length ? Math.max(...dl) : null, runsWithBusyBeforeChat: cnt(a, (x) => x.briefBusyBeforeChat > 0), redRuns: cnt(a, (x) => x.red) }; }
const branches = groupBy(memAll, (x) => x.branch);
const armBy = (arm) => memAll.filter((x) => x.arm === arm);
const firstSetVia = groupBy(memAll.filter((x) => x.firstSetVia), (x) => `${x.red ? '빨강' : '초록'} · ${x.firstSetVia}`);
const terrAt = groupBy(memAll, (x) => `terr=${x.terrAtChat} gate=${x.gate}`);
const arrivalBy = groupBy(memAll, (x) => x.arrival);
// 걸어간 봇
const walkRuns = runs.filter((r) => /^walk/.test(r.kind));
const W = walkRuns.map((r) => { const w = r.walk || {}; const d = D.find((x) => x.tag === r.tag) || {};
  return { tag: r.tag, kind: r.kind, arm: r.arm, rc: r.rc, arrived: !!w.arrived, tries: (w.tries || []).length, walkMs: (w.tries || []).reduce((s, t) => s + (t.walkMs || 0), 0), at_evNear: w.at_press ? w.at_press.evNearVid : null,
    p1: w.press1 ? (w.press1.far ? '거절(너무 멉니다)' : w.press1.passed ? '통과(촌장 문까지)' : '?') : null,
    p2: w.press2 ? (w.press2.far ? '거절(너무 멉니다)' : w.press2.passed ? '통과(촌장 문까지)' : '?') : null,
    p4: w.press4 ? (w.press4.far ? '거절(너무 멉니다)' : w.press4.passed ? '통과(촌장 문까지)' : '?') : null, p3: w.press3 ? (w.press3.far ? '거절(너무 멉니다)' : w.press3.passed ? '통과(촌장 문까지)' : '?') : null, nearVidAtChat: d.hasObs ? d.nearAtChat : undefined, arrival: d.arrival || null }; });
const wsum = (kind, arm) => { const a = W.filter((x) => x.kind === kind && x.arm === arm); return { n: a.length, arrived: cnt(a, (x) => x.arrived), refused1: cnt(a, (x) => x.p1 && x.p1.startsWith('거절')), refused1_pressAgain_pass: cnt(a, (x) => x.p1 && x.p1.startsWith('거절') && x.p2 && x.p2.startsWith('통과')), refused1_pressAgain_refused: cnt(a, (x) => x.p1 && x.p1.startsWith('거절') && x.p2 && x.p2.startsWith('거절')), unknown1: cnt(a, (x) => x.arrived && x.p1 === '?'), notArrived: cnt(a, (x) => !x.arrived) }; };
const WS = { on: wsum('walk', 'on'), off: wsum('walk', 'off'), longOn: wsum('walklong', 'on'), longOff: wsum('walklong', 'off') };
const re3 = W.filter((x) => x.kind === 'walkre');
const re4 = W.filter((x) => x.kind === 'walkre2');
WS.re2 = { n: re4.length, arrived: cnt(re4, (x) => x.arrived), refused3: cnt(re4, (x) => x.p3 && x.p3.startsWith('거절')), pass3: cnt(re4, (x) => x.p3 && x.p3.startsWith('통과')), refused3_again_pass: cnt(re4, (x) => x.p3 && x.p3.startsWith('거절') && x.p4 && x.p4.startsWith('통과')), refused3_again_refused: cnt(re4, (x) => x.p3 && x.p3.startsWith('거절') && x.p4 && x.p4.startsWith('거절')) };
WS.re = { n: re3.length, arrived: cnt(re3, (x) => x.arrived), refused3: cnt(re3, (x) => x.p3 && x.p3.startsWith('거절')), pass3: cnt(re3, (x) => x.p3 && x.p3.startsWith('통과')), unknown3: cnt(re3, (x) => x.arrived && x.p3 === '?') };

const bodyStat = { setsTotal: memAll.reduce((q, x) => q + (x.nSetBefore || 0), 0), clears: memAll.reduce((q, x) => q + x.nClear, 0), runsWithOtherVal: cnt(memAll, (x) => x.nDistinctVals > 1), runsBodyChanged: cnt(memAll, (x) => !x.sameBody) };
const J = { summary: S, bodyStat, deferStat, redEmptyAgree, sepOrder, timing, branches: Object.fromEntries(Object.entries(branches).map(([k, v]) => [k, v.length])), firstSetVia: Object.fromEntries(Object.entries(firstSetVia).map(([k, v]) => [k, v.length])), terrAt: Object.fromEntries(Object.entries(terrAt).map(([k, v]) => [k, v.length])), arrival: Object.fromEntries(Object.entries(arrivalBy).map(([k, v]) => [k, v.length])), walk: WS, walkRuns: W, runs: D };
fs.writeFileSync(val('--json', path.join(DIR, 'table.json')), JSON.stringify(J, null, 1) + '\n');

// ───────── md ─────────
const L = [];
const row = (...c) => '| ' + c.join(' | ') + ' |';
L.push('# T1485 표 (손 셈 0 · `scripts/t1485-table.js` 가 `runs.jsonl.gz` 에서 낸다)', '');
L.push('## 1. ⑦ 빨강 · 표시가 빈 판', '');
L.push(row('판 종류', '판', '⑦ 빨강', '⑦ 초록', '⑦ 줄 없음', '표시 빔', '표시 참'), row('---', '---', '---', '---', '---', '---', '---'));
for (const [name, s] of [['mem 켬(귀 건 ⑦ · 길 고침 기본)', S.memOn], ['mem 끔(`T1327_ROUTE_FIX=0`)', S.memOff], ['mem 끔 + `T598_ROUTE_EDGE=1`(이웃 잇기 규칙만 켬)', S.memEdge], ['memplain 켬(귀 없음 · 대조)', S.plainOn]]) L.push(row(name, s.n, s.red, s.green, s.unknown, fmt(s.empty), fmt(s.filled)));
L.push('', `빨강 ↔ 표시 빔(귀 건 판 ${memAll.length}): 빨강이고 빔 ${redEmptyAgree.both} · 빨강인데 참 ${redEmptyAgree.redNotEmpty} · 초록인데 빔 ${redEmptyAgree.emptyNotRed} · 초록이고 참 ${redEmptyAgree.neither}`, '');
L.push('## 2. 가르는 것 — 첫 `_memberNearVid` 쓰기가 첫 `/인출` 앞인가 뒤인가', '');
L.push(row('', '쓰기가 `/인출` 앞', '쓰기가 `/인출` 뒤', '(그 순간이동 뒤) 쓰기 없음'), row('---', '---', '---', '---'));
L.push(row('빨강', sepOrder.red_setBeforeChat, sepOrder.red_setAfterChat, sepOrder.red_noSet), row('초록', sepOrder.green_setBeforeChat, sepOrder.green_setAfterChat, sepOrder.green_noSet), '');
L.push('### 2a. 시각(ms) — 마지막 순간 이동 뒤 · 중앙값(최소~최대) · 귀 건 mem 판', '');
const rg = (s) => (s ? `${s.med} (${s.min}~${s.max}) n=${s.n}` : '·');
L.push(row('', '빨강', '초록'), row('---', '---', '---'));
for (const [lab, key] of [['순간이동 → `/인출`', 'tTeleToChat'], ['순간이동 → 첫 brief 메시지 도착', 'tTeleToFirstBriefMsg'], ['순간이동 → 첫 `_memberNearVid` 쓰기', 'tTeleToFirstSet'], ['`/인출` 앞 도착한 brief 수', 'nBriefMsgBeforeChat'], ['그 가운데 장부 마감 중에 닿은 수', 'briefBusyBeforeChat'], ['순간이동 ~ `/인출` 사이 이벤트 루프 최대 지연', 'maxLagBeforeChat']]) L.push(row(lab, rg(timing.red[key]), rg(timing.green[key])));
L.push('', '### 2a2. 길 고침 켬 ↔ 끔 — 마을 장부 마감 중 줄 서는 brief(윈도: 마지막 순간 이동 직전 0.5초 ~ `/인출` 뒤 3초)', '');
L.push(row('', '판', 'brief 메시지', '그중 마감 중 도착', '줄 풀려 쓴 횟수', '줄 지연 중앙(ms)', '줄 지연 최대(ms)', '`/인출` 앞에 마감 중 brief 가 있던 판', '빨강'), row('---', '---', '---', '---', '---', '---', '---', '---', '---'));
for (const [lab, a] of [['켬', deferStat.on], ['끔', deferStat.off], ['끔 + 이웃 잇기만', deferStat.edge]]) L.push(row(lab, a.runs, a.briefMsgs, a.busyMsgs, a.deferredSets, fmt(a.delayMed), fmt(a.delayMax), a.runsWithBusyBeforeChat, a.redRuns));
L.push('', '### 2b. 갈래(귀 건 mem 판)', '');
L.push(row('갈래', '판'), row('---', '---'));
for (const k of Object.keys(branches).sort()) L.push(row(k, `${branches[k].length} (빨강 ${cnt(branches[k], (x) => x.red)})`));
L.push('', '### 2c. 첫 쓰기가 어디서 불렸나(스택 · 빨강/초록)', '');
L.push(row('', '판'), row('---', '---'));
for (const k of Object.keys(firstSetVia).sort()) L.push(row(k, firstSetVia[k].length));
L.push('', '### 2d. 마을 영토 · 곳간 문 판정(`/인출` 순간 · `villageOfCell` · `villageWithdrawGate`)', '');
L.push(row('판정', '판', '그중 빨강'), row('---', '---', '---'));
for (const k of Object.keys(terrAt).sort()) L.push(row(k, terrAt[k].length, cnt(terrAt[k], (x) => x.red)));
L.push('', '### 2e. 손님이 온 길', '');
L.push(row('길', '판'), row('---', '---'));
for (const k of Object.keys(arrivalBy).sort()) L.push(row(k, arrivalBy[k].length));
L.push('', `쓰기 자리 점검(귀 건 mem 판 ${memAll.length}): \`/인출\` 앞까지 쓰기 ${bodyStat.setsTotal}회 · 비움(null 쓰기) ${bodyStat.clears}회 · 마을 번호가 1 아닌 값을 쓴 판 ${bodyStat.runsWithOtherVal} · 쓰기와 \`/인출\` 의 몸 번호가 달랐던 판 ${bodyStat.runsBodyChanged}`);
L.push('', '## 3. 걸어서 간 봇(`scripts/t1485-walkbot.js` · 진짜 키 · 600px 밖에서 곧게)', '');
L.push(row('길 고침 · 하루', '판', '닿음', '첫 `/인출` 거절', '그 가운데 다시 눌러 통과', '그 가운데 다시 눌러도 거절', '첫 눌림이 거절도 통과도 아님', '못 닿음'), row('---', '---', '---', '---', '---', '---', '---', '---'));
for (const [arm, s] of [['켬 · 하루 0.6초(하네스와 같음)', WS.on], ['끔 · 하루 0.6초', WS.off], ['켬 · 하루 1시간(마감 창이 판 안에 안 듦)', WS.longOn], ['끔 · 하루 1시간', WS.longOff]]) L.push(row(arm, s.n, s.arrived, s.refused1, s.refused1_pressAgain_pass, s.refused1_pressAgain_refused, s.unknown1, s.notArrived));
L.push('', `다시 접속한 손님(walkre · 닿아 두 번 누른 뒤 쪽을 다시 열고 한 번 더): 판 ${WS.re.n} · 닿음 ${WS.re.arrived} · 다시 접속 뒤 첫 눌림 거절 ${WS.re.refused3} · 통과 ${WS.re.pass3} · 그 밖 ${WS.re.unknown3}`);
L.push('', `다시 접속한 손님 · 다시 눌러 보기(walkre2): 판 ${WS.re2.n} · 닿음 ${WS.re2.arrived} · 다시 접속 뒤 첫 눌림 거절 ${WS.re2.refused3} · 통과 ${WS.re2.pass3} · 거절 가운데 2초 뒤 다시 눌러 통과 ${WS.re2.refused3_again_pass} · 또 거절 ${WS.re2.refused3_again_refused}`);
L.push('', row('판', '길 고침', '닿음', '시도', '걸은 ms', '누를 때 클라 근접', '서버 표시', '첫 눌림', '다시 눌림', '다시 접속 뒤', '그 2초 뒤'), row('---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---'));
for (const w of W) L.push(row(w.tag, w.arm, w.arrived ? 'o' : 'x', w.tries, w.walkMs, fmt(w.at_evNear), fmt(w.nearVidAtChat), fmt(w.p1), fmt(w.p2), fmt(w.p3), fmt(w.p4)));
L.push('', '## 4. 판마다(귀 건 mem 판)', '');
L.push(row('판', '빨강', '표시', '길', '순간이동→`/인출`', '순간이동→첫 brief', '첫 brief 마감 중', '순간이동→첫 쓰기', '쓰기 자리', '영토', '갈래'), row('---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---'));
for (const x of memAll) L.push(row(x.tag, x.red ? '빨강' : '초록', fmt(x.nearAtChat), x.arrival, fmt(x.tTeleToChat), fmt(x.tTeleToFirstBriefMsg), fmt(x.firstBriefBusy), fmt(x.tTeleToFirstSet), fmt(x.firstSetVia), fmt(x.terrAtChat), x.branch));
fs.writeFileSync(val('--md', path.join(DIR, 'table.md')), L.join('\n') + '\n');
console.log('표 ' + D.length + ' 판');
