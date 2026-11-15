#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1335 표 · 읽기만)
// === scripts/t1335-table.js — 묶음 켬 몸 세계 한 해 판 표(끔 : 묶음) — 30날마다 · 겨울 몫 · 목표 넷 · 서버 자(T1319) 꼴 견줌 ===
//   쓰는 법: node scripts/t1335-table.js <끔 판 폴더> <묶음 판 폴더> [--every 30] [--md <표.md>] [--json <표.json>] [--srv <t1319-table.json>]
//     판 폴더 = 맥 긴 판 러너(`scripts/mac-long-run/판.sh`)의 T1308 판 폴더. 마디 조각 `seg-<시작 날>.<꼴>.json` 을 날 열쇠로 잇는다
//     (마디는 날이 안 겹친다 — seg-0 = 날 1 ~ 30 · seg-30 = 31 ~ 60 …). 판이 도는 중이면 거기까지(중간 표).
//   칸(날 d · 누계 칸은 그때까지 · 창 칸은 그 앞 창(기본 30날)):
//     인구 · 끔비(묶음 ÷ 끔 · 같은 날)            = t1243 날 줄 `pop`
//     굶어 죽음(식량 빚) · 죽음 전체 · 나이 · 떠남 · 빈 마을 = t1263 사진(10날마다 · 끝) `fd` · `dead` · `nat` · `emig` · `empty`(econ 누계)
//     닿음(누계) · 무리(창 안 마을-날 가장 큰 닿음 · 닿음 중 셋 이상 · 열 이상 함께 든 몫 %) = T1312 훅 마을-날 줄 `arr`
//     곳간 일치(정본 식량 단위 ÷ 사람)              = t1263 사진 `canon` ÷ `pop`
//     영토 칸 · 곳간 통나무 · 나무꾼                 = T1275 훅 날 줄(51마을 합) 칸 2 · 3 · 14
//     몸/인구 %                                    = t1243 `bodies` ÷ `pop`
//     출생(창 · 누계)                               = t1230 날 줄 `born`
//     하루 CPU(창 가운데값)                          = t1243 `cpu`(그 날 econ 틱 사이 프로세스 CPU 초)
//   겨울 몫 = t1263 '겨울' 사진(12월 1일) → 판 끝 사진(3월 1일 머리)의 차.
//   목표 넷(T1319 §4 자 · 시드 1020 · 몸 세계 365날): ① 끔비 ≥ 1.10 ② 끔비 ≥ 0.98 ③ 꼭대기 뒤 내림 ≤ 10% ④ 굶어 죽음 ≤ 끔(+ 곁: 죽음 전체 ≤ 끔).
//   서버 자 꼴: `계측/T1319_2026-11-15/t1319-table.json` 의 끔(기준선 11-14) · 묶음 … + K 문 + 가을 문 mig(`bundleKAM`) 1020 50날 줄(빠른 시계 · 집 끔 · 몸 상한 1)과
//     같은 날의 끔비를 맞댄다 — 차가 0.10 을 넘는 첫 날을 '갈림'으로 적는다(꼴 견줌 자 · 판정 아님).
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const [OFF, ON] = A.filter((x, i) => !x.startsWith('--') && !(i > 0 && A[i - 1].startsWith('--')));
if (!OFF || !ON) { console.error('쓰는 법: node scripts/t1335-table.js <끔 판 폴더> <묶음 판 폴더> [--every 30] [--md 표.md] [--json 표.json] [--srv t1319-table.json]'); process.exit(2); }
const EVERY = +opt('every', 30);
const SRV = opt('srv', path.join(__dirname, '..', '계측', 'T1319_2026-11-15', 't1319-table.json'));
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const segs = (dir, suf) => fs.readdirSync(dir).map((f) => { const m = f.match(/^seg-(\d+)\.(.+)$/); return m && m[2] === suf ? { from: +m[1], f: path.join(dir, f) } : null; }).filter(Boolean).sort((a, b) => a.from - b.from);
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

function load(dir) {
  const P = rd(path.join(dir, 'progress.json')) || {};
  const pop = new Map(), bodies = new Map(), cpu = new Map(), lumber43 = new Map();
  for (const s of segs(dir, 't1243.json')) { const o = rd(s.f); if (!o) continue; const c = o.cols || [];
    const ip = c.indexOf('pop'), ib = c.indexOf('bodies'), il = c.indexOf('lumber');
    for (const r of o.rows || []) { pop.set(r[0], r[ip]); bodies.set(r[0], r[ib]); lumber43.set(r[0], r[il]); }
    for (const x of o.cpu || []) cpu.set(x[0], x[1]); }
  const snaps = [];
  for (const s of segs(dir, 't1263.json')) { const o = rd(s.f); if (!o) continue; for (const x of o.snaps || []) snaps.push(x); }
  const snapAt = (d) => { let best = null; for (const x of snaps) if (x.day <= d && (!best || x.day > best.day || (x.day === best.day && x.why === 'ten'))) best = x; return best; };
  const born = new Map();
  for (const s of segs(dir, 't1230.json')) { const o = rd(s.f); if (!o) continue; const c = o.cols || [], ib = c.indexOf('born'); for (const r of o.rows || []) born.set(r[0], r[ib] || 0); }
  const terr = new Map();
  for (const s of segs(dir, 'json.t1275.json')) { const o = rd(s.f); if (!o) continue; for (const r of o.days || []) terr.set(r[0], r); }
  const arr = new Map();   // 날 → [마을-날 닿음 …]
  let t1312cols = null;
  for (const s of segs(dir, 'json.t1312.json')) { const o = rd(s.f); if (!o) continue; t1312cols = o.cols; const c = o.cols || [], id = c.indexOf('day'), ia = c.indexOf('arr');
    for (const r of o.rows || []) { if (r[ia] == null) continue; if (!arr.has(r[id])) arr.set(r[id], []); arr.get(r[id]).push(r[ia]); } }
  const days = [...pop.keys()].sort((a, b) => a - b);
  return { dir, P, pop, bodies, cpu, lumber43, snaps, snapAt, born, terr, arr, last: days.length ? days[days.length - 1] : 0 };
}
const off = load(OFF), on = load(ON);
const LAST = Math.min(off.last, on.last);
const marks = []; for (let d = EVERY; d <= LAST; d += EVERY) marks.push(d); if (LAST && marks[marks.length - 1] !== LAST) marks.push(LAST);

const fmt = (x, k = 0) => (x == null || !isFinite(x)) ? '—' : (+x).toLocaleString('en-US', { minimumFractionDigits: k, maximumFractionDigits: k });
function row(R, d, prev) {
  const s = R.snapAt(d), pop = R.pop.get(d), sum = (m, a, b) => { let t = 0; for (const [k, v] of m) if (k > a && k <= b) t += v || 0; return t; };
  let arrT = 0, arrW = 0, big = 0, g3 = 0, g10 = 0;
  for (const [k, vs] of R.arr) { for (const v of vs) { if (k <= d) arrT += v; if (k > prev && k <= d) { arrW += v; big = Math.max(big, v); if (v >= 3) g3 += v; if (v >= 10) g10 += v; } } }
  const t = R.terr.get(d);
  const cw = []; for (const [k, v] of R.cpu) if (k > prev && k <= d && k > 1) cw.push(v);
  return { d, pop, fd: s ? s.fd : null, dead: s ? s.dead : null, nat: s ? s.nat : null, emig: s ? s.emig : null, empty: s ? s.empty : null, snapDay: s ? s.day : null,
    canonDays: s && s.pop ? s.canon / s.pop : null, arrT, arrW, big, g3: arrW ? 100 * g3 / arrW : null, g10: arrW ? 100 * g10 / arrW : null,
    terr: t ? t[2] : null, wood: t ? t[3] : null, lj: t ? t[14] : null, bodyPct: pop ? 100 * (R.bodies.get(d) || 0) / pop : null,
    bornW: sum(R.born, prev, d), bornT: sum(R.born, 0, d), cpuMed: med(cw) };
}
const T = [];
let prev = 0;
for (const d of marks) { T.push({ d, off: row(off, d, prev), on: row(on, d, prev) }); prev = d; }

// 겨울 몫 — '겨울' 사진(12월 1일) → 판 끝 사진
function winter(R) {
  const w = R.snaps.find((x) => x.why === 'winter'); if (!w) return null;
  const e = R.snapAt(R.last); if (!e || e.day <= w.day) return { from: w.day, date: w.date, open: true };
  const vsOf = (s) => (s.vs || []).filter((x) => x[1] > 0).map((x) => x[2] / x[1]).sort((a, b) => a - b);
  const vw = vsOf(w), ve = vsOf(e), bornW = (() => { let t = 0; for (const [k, v] of R.born) if (k > w.day && k <= e.day) t += v || 0; return t; })();
  let arrW = 0; for (const [k, vs] of R.arr) if (k > w.day && k <= e.day) for (const v of vs) arrW += v;
  return { from: w.day, to: e.day, dateFrom: w.date, dateTo: e.date, popFrom: w.pop, popTo: e.pop, dead: e.dead - w.dead, fd: e.fd - w.fd, nat: e.nat - w.nat,
    rest: (e.dead - e.fd - e.nat) - (w.dead - w.fd - w.nat), emig: e.emig - w.emig, born: bornW, arr: arrW,
    daysFrom: w.canon / w.pop, daysTo: e.canon / e.pop, medFrom: med(vw), medTo: med(ve), under30From: vw.filter((x) => x < 30).length, under30To: ve.filter((x) => x < 30).length, vils: ve.length };
}
const W = { off: winter(off), on: winter(on) };

// 목표 넷(시드 1020 · 몸 세계) — 판이 끝까지 갔을 때만 판정 칸을 채운다(중간 표엔 그때 값)
function peakDrop(R) { let pk = 0, pd = 0; for (const [k, v] of R.pop) if (v > pk) { pk = v; pd = k; } const end = R.pop.get(R.last); return { peak: pk, peakDay: pd, end, drop: pk ? 100 * (pk - end) / pk : null }; }
const PD = peakDrop(on), endOff = off.snapAt(LAST), endOn = on.snapAt(LAST);
const ratioEnd = off.pop.get(LAST) ? on.pop.get(LAST) / off.pop.get(LAST) : null;
let r25 = []; for (let d = LAST - 24; d <= LAST; d++) if (off.pop.get(d) && on.pop.get(d)) r25.push(on.pop.get(d) / off.pop.get(d));
const avg25 = r25.length ? r25.reduce((a, b) => a + b, 0) / r25.length : null;
const goals = {
  day: LAST, ratio: ratioEnd, avg25, peak: PD,
  g1: ratioEnd != null ? ratioEnd >= 1.10 : null, g2: ratioEnd != null ? ratioEnd >= 0.98 : null, g3: PD.drop != null ? PD.drop <= 10 : null,
  g4: endOff && endOn ? endOn.fd <= endOff.fd : null, g4dead: endOff && endOn ? endOn.dead <= endOff.dead : null,
  fdOff: endOff ? endOff.fd : null, fdOn: endOn ? endOn.fd : null, deadOff: endOff ? endOff.dead : null, deadOn: endOn ? endOn.dead : null,
};
goals.n = [goals.g1, goals.g2, goals.g3, goals.g4].filter((x) => x === true).length;

// 서버 자(T1319 · 빠른 시계) 꼴 — 50날 줄의 끔비
const srvT = rd(SRV); let srv = null;
if (srvT && srvT.off && srvT.bundleKAM) {
  const a = srvT.off.seeds['1020'].traj, b = srvT.bundleKAM.seeds['1020'].traj;
  const rows = [];
  let first = null;
  for (const k of Object.keys(a).map(Number).sort((x, y) => x - y)) {
    const sr = a[k] ? b[k] / a[k] : null, bo = off.pop.get(k), bn = on.pop.get(k), br = bo ? bn / bo : null;
    const diff = (sr != null && br != null) ? br - sr : null;
    if (diff != null && Math.abs(diff) > 0.10 && first == null) first = k;
    rows.push({ d: k, srvOff: a[k], srvOn: b[k], srvRatio: sr, bodyOff: bo == null ? null : bo, bodyOn: bn == null ? null : bn, bodyRatio: br, diff });
  }
  srv = { rows, first, srvFam: { off: srvT.off.seeds['1020'].famine, on: srvT.bundleKAM.seeds['1020'].famine }, srvDead: { off: srvT.off.seeds['1020'].dead, on: srvT.bundleKAM.seeds['1020'].dead } };
}

// ── 찍기 ──
const L = [];
L.push(`# T1335 표 — 끔 : 묶음 몸 세계(시드 1020 · ${LAST}날까지${LAST < Math.max(off.P.days || 0, on.P.days || 0) ? ' · 도는 중' : ''})`);
L.push('');
L.push(`판 폴더: 끔 \`${path.basename(OFF)}\`(체크포인트 날 ${off.P.ck} · ${off.P.done ? '끝' : '도는 중'}) · 묶음 \`${path.basename(ON)}\`(체크포인트 날 ${on.P.ck} · ${on.P.done ? '끝' : '도는 중'}) · 창 ${EVERY}날`);
L.push('');
const H = ['날', '인구 끔 : 묶음', '끔비', '굶어 죽음(식량 빚 · 누계)', '죽음 전체(누계)', '나이(누계)', '빈 마을', '떠남(누계)', '닿음(누계 · 창)', '무리(창: 가장 큰 · 셋 이상 % · 열 이상 %)', '곳간 일치(일치)', '영토 칸', '곳간 통나무', '나무꾼', '몸/인구 %', '출생(창)', '하루 CPU 초(창 가운데)'];
L.push('| ' + H.join(' | ') + ' |'); L.push('|' + H.map(() => '---').join('|') + '|');
for (const r of T) {
  const a = r.off, b = r.on, p = (f, k = 0) => `${fmt(a[f], k)} : ${fmt(b[f], k)}`;
  L.push(`| ${r.d} | ${p('pop')} | ${a.pop && b.pop ? (b.pop / a.pop).toFixed(3) : '—'} | ${p('fd')} | ${p('dead')} | ${p('nat')} | ${p('empty')} | ${p('emig')} | ${fmt(a.arrT)} · ${fmt(a.arrW)} : ${fmt(b.arrT)} · ${fmt(b.arrW)} | ${fmt(a.big)} · ${fmt(a.g3)} · ${fmt(a.g10)} : ${fmt(b.big)} · ${fmt(b.g3)} · ${fmt(b.g10)} | ${p('canonDays', 1)} | ${p('terr')} | ${p('wood')} | ${p('lj')} | ${p('bodyPct', 1)} | ${p('bornW')} | ${p('cpuMed')} |`);
}
L.push('');
L.push('* 누계 칸(굶어 죽음 · 죽음 · 나이 · 떠남 · 빈 마을 · 곳간)은 그 날 또는 그 앞 마지막 t1263 사진(10날마다 · 마디 끝 · 판 끝)의 값이다. 닿음 · 무리는 T1312 훅(마디 첫날은 어제 명부가 없어 0 — 마디 30날마다 한 날씩 빠진다).');
L.push('');
L.push('## 겨울 몫(12월 1일 → 3월 1일 머리)');
L.push('');
const wv = (k, d = 0) => `${W.off && !W.off.open ? fmt(W.off[k], d) : '—'} : ${W.on && !W.on.open ? fmt(W.on[k], d) : '—'}`;
if (W.off && W.on && !W.off.open && !W.on.open) {
  L.push(`| 칸 | 끔 : 묶음 |`); L.push('|---|---|');
  L.push(`| 날 | ${W.off.from} → ${W.off.to} : ${W.on.from} → ${W.on.to} |`);
  L.push(`| 인구 | ${fmt(W.off.popFrom)} → ${fmt(W.off.popTo)} : ${fmt(W.on.popFrom)} → ${fmt(W.on.popTo)} |`);
  for (const [k, n] of [['dead', '죽음 전체'], ['fd', '굶어 죽음(식량 빚)'], ['nat', '나이'], ['rest', '나머지(인구식 고리)'], ['born', '출생'], ['emig', '떠남'], ['arr', '닿음']]) L.push(`| ${n} | ${wv(k)} |`);
  L.push(`| 곳간 일치(세계) | ${fmt(W.off.daysFrom, 1)} → ${fmt(W.off.daysTo, 1)} : ${fmt(W.on.daysFrom, 1)} → ${fmt(W.on.daysTo, 1)} |`);
  L.push(`| 마을 가운데 일치 | ${fmt(W.off.medFrom, 1)} → ${fmt(W.off.medTo, 1)} : ${fmt(W.on.medFrom, 1)} → ${fmt(W.on.medTo, 1)} |`);
  L.push(`| 30일치 못 되는 마을 | ${W.off.under30From} → ${W.off.under30To} : ${W.on.under30From} → ${W.on.under30To} |`);
} else L.push(`아직 겨울(12월 1일 · 날 ${(W.off && W.off.from) || (W.on && W.on.from) || '275 무렵'})이 판 안에 다 안 들었다.`);
L.push('');
L.push(`## 목표 넷(시드 1020 · 몸 세계 · 날 ${LAST}${LAST < 365 ? ' — 중간 값' : ''})`);
L.push('');
const ox = (x) => x == null ? '—' : (x ? '○' : '✗');
L.push(`| 목표 | 값 | |`); L.push('|---|---|---|');
L.push(`| ① 끔비 ≥ 1.10 | ${goals.ratio != null ? goals.ratio.toFixed(3) : '—'}(끝 25날 평균 ${goals.avg25 != null ? goals.avg25.toFixed(3) : '—'}) | ${ox(goals.g1)} |`);
L.push(`| ② 끔비 ≥ 0.98 | 〃 | ${ox(goals.g2)} |`);
L.push(`| ③ 꼭대기 뒤 내림 ≤ 10% | 꼭대기 ${fmt(PD.peak)}(날 ${PD.peakDay}) → ${fmt(PD.end)} · ${PD.drop != null ? PD.drop.toFixed(1) : '—'}% | ${ox(goals.g3)} |`);
L.push(`| ④ 굶어 죽음 ≤ 끔 | 묶음 ${fmt(goals.fdOn)} : 끔 ${fmt(goals.fdOff)} | ${ox(goals.g4)} |`);
L.push(`| (곁) 죽음 전체 ≤ 끔 | 묶음 ${fmt(goals.deadOn)} : 끔 ${fmt(goals.deadOff)} | ${ox(goals.g4dead)} |`);
L.push('');
L.push(`목표 넷 몸 세계 ${goals.n}/4(④ 를 죽음 전체로 보면 ${[goals.g1, goals.g2, goals.g3, goals.g4dead].filter((x) => x === true).length}/4).`);
if (srv) {
  L.push('');
  L.push('## 서버 자(T1319 · 빠른 시계 · 집 끔 · 몸 상한 1 · 400날) 꼴 견줌 — 같은 날 끔비');
  L.push('');
  L.push('| 날 | 서버 자 끔 : 묶음(끔비) | 몸 세계 끔 : 묶음(끔비) | 끔비 차(몸 − 서버) |'); L.push('|---|---|---|---|');
  for (const r of srv.rows) L.push(`| ${r.d} | ${fmt(r.srvOff)} : ${fmt(r.srvOn)} (${r.srvRatio != null ? r.srvRatio.toFixed(2) : '—'}) | ${fmt(r.bodyOff)} : ${fmt(r.bodyOn)} (${r.bodyRatio != null ? r.bodyRatio.toFixed(2) : '—'}) | ${r.diff != null ? (r.diff >= 0 ? '+' : '') + r.diff.toFixed(2) : '—'} |`);
  L.push('');
  L.push(`* 꼴 견줌 자: 같은 날 끔비 차 > 0.10 이면 갈림 — ${srv.first != null ? `**처음 갈린 날 ${srv.first}**` : (srv.rows.some((r) => r.diff != null) ? '본 날 안에서 안 갈림' : '아직 견줄 날 없음')}. 서버 자 400날 굶어 죽음 끔 ${srv.srvFam.off} : 묶음 ${srv.srvFam.on} · 죽음 전체 ${srv.srvDead.off} : ${srv.srvDead.on}.`);
}
const md = L.join('\n') + '\n';
const out = { every: EVERY, last: LAST, rows: T, winter: W, goals, srv, runs: { off: { dir: OFF, ck: off.P.ck, done: !!off.P.done, segs: off.P.segs }, on: { dir: ON, ck: on.P.ck, done: !!on.P.done, segs: on.P.segs } } };
if (opt('md', null)) fs.writeFileSync(opt('md'), md);
if (opt('json', null)) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1) + '\n');
process.stdout.write(md);
