#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1044 표 기계 · 읽기만 · 판정 0)
// === scripts/t1044-scram-table.js — 방어 소집 관찰기(`t1044-scram-probe.js`) 줄을 판 자 띠 표로 ===================
//
// 쓰는 법:  node scripts/t1044-scram-table.js <판 자 뿌리>[,<뿌리>…] [--json <out.json>] [--top N]
//   뿌리 아래 `run-<갈래>[~raidN]/<판>-<시드>.t1044.json` 을 모두 읽는다(갈래 = 디렉터리 이름의 `run-` 뒤 · `~` 앞).
//   ⇒ ① 갈래마다 방어 소집 꼴 셈(긴급 소집 — 결단 그 자리 'form' · 전진 중 'advance' · 응전 포진/출격) · 판마다 띠
//      ② 긴급 소집 몸의 거리(소집 순간 — 회관 · 포진점) 사분 · 50칸 · 100칸 밖 몸 수
//      ③ 긴급 소집의 끝 — 접촉 · 몸이 포진점에 가장 가까웠던 거리(13m · 50m 안) · 맞붙음 · 죽음 · 정산(궤주 승자 · 무저항 · 안 끝남)
//      ④ 가장 먼 소집 몸 N 줄(판 · 시드 · 전쟁 · 날 · 두 마을)
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const roots = (A[0] || '').split(',').filter(Boolean);
if (!roots.length) { console.error('쓰는 법: t1044-scram-table.js <뿌리>[,<뿌리>…] [--json out] [--top N]'); process.exit(2); }
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const TOP = +opt('--top', 10), OUTJ = opt('--json', null);
const runs = [];
for (const R of roots) for (const d of fs.readdirSync(R).sort()) {
  const m = /^run-([^~]+)(?:~(.+))?$/.exec(d); if (!m) continue;
  const D = path.join(R, d);
  for (const f of fs.readdirSync(D).sort()) {
    const s = /-(\d+)\.t1044\.json$/.exec(f); if (!s) continue;
    let r = null; try { r = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { r = null; }
    let w956 = null; try { w956 = JSON.parse(fs.readFileSync(path.join(D, f.replace(/\.t1044\.json$/, '.t956.json')), 'utf8')).wars; } catch (e) { w956 = null; }   // 곁 관찰기(t956) — 정산 없이 끝난 전쟁의 끝 날
    if (r) { for (const e of r.ev) e._wend = w956 && w956[e.wid] ? w956[e.wid].end : undefined; runs.push({ arm: m[1], ctl: m[2] || 'base', run: d, seed: +s[1], rec: r, root: R }); }
  }
}
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r1 = (x) => x == null ? '-' : (Math.round(x * 10) / 10).toLocaleString('en-US');
const cls = (e) => e.scram ? (e.fst === 'form' ? 'S1' : 'S2') : 'R';
const arms = [...new Set(runs.map((r) => r.arm))];
const J = { arms: {}, top: [] };
const L = [];
L.push('## ① 방어 소집 꼴 — 갈래마다(판 넷 × 시드 셋 합 · 판마다 띠 = 최소 ~ 최대)', '');
L.push('| 갈래 | 판 · 시드 | 소집 줄 | 긴급 소집 S1(결단 그 자리 · `form`) | 긴급 소집 S2(전진 중 · `advance`) | 응전 포진 · 출격(R) | S2 판마다 띠 | 관찰기 오류 |');
L.push('|---|---:|---:|---:|---:|---:|---|---:|');
for (const a of arms) {
  const R = runs.filter((r) => r.arm === a); const ev = R.flatMap((r) => r.rec.ev.map((e) => Object.assign({ _r: r }, e)));
  const byRun = new Map(); for (const r of R) { const k = r.run; byRun.set(k, (byRun.get(k) || 0) + r.rec.ev.filter((e) => cls(e) === 'S2').length); }
  const s2b = [...byRun.values()];
  const c = { S1: 0, S2: 0, R: 0 }; for (const e of ev) c[cls(e)]++;
  L.push(`| ${a} | ${new Set(R.map((r) => r.run)).size} · ${R.length} | ${ev.length} | ${c.S1} | ${c.S2} | ${c.R} | ${s2b.length ? Math.min(...s2b) + ' ~ ' + Math.max(...s2b) : '-'} | ${R.reduce((s, r) => s + (r.rec.errs | 0), 0)} |`);
  J.arms[a] = { runs: R.length, ev: ev.length, cls: c, s2band: s2b };
}
L.push('', '## ② 긴급 소집 몸 — 소집 순간 거리(셀 = m · 몸마다)', '');
L.push('| 갈래 · 꼴 | 소집 | 몸 | 회관까지 가운데 · 90% · 가장 먼 | 포진점까지 가운데 · 90% · 가장 먼 | 포진점 50칸 밖 몸 | 100칸 밖 몸 |');
L.push('|---|---:|---:|---|---|---:|---:|');
for (const a of arms) for (const k of ['S1', 'S2']) {
  const ev = runs.filter((r) => r.arm === a).flatMap((r) => r.rec.ev.filter((e) => cls(e) === k));
  const us = ev.flatMap((e) => e.u || []); const h = us.map((u) => u.h0), d = us.map((u) => u.d0);
  L.push(`| ${a} · ${k} | ${ev.length} | ${us.length} | ${r1(q(h, 0.5))} · ${r1(q(h, 0.9))} · ${r1(h.length ? Math.max(...h) : null)} | ${r1(q(d, 0.5))} · ${r1(q(d, 0.9))} · ${r1(d.length ? Math.max(...d) : null)} | ${d.filter((x) => x > 50).length} | ${d.filter((x) => x > 100).length} |`);
  J.arms[a]['dist' + k] = { ev: ev.length, bodies: us.length, h50: q(h, 0.5), h90: q(h, 0.9), hMax: h.length ? Math.max(...h) : null, d50: q(d, 0.5), d90: q(d, 0.9), dMax: d.length ? Math.max(...d) : null, d50n: d.filter((x) => x > 50).length, d100n: d.filter((x) => x > 100).length };
}
L.push('', '## ③ 긴급 소집의 끝 — 몸이 왔나(몸마다 · 정산은 소집마다)', '');
L.push('| 갈래 · 꼴 | 몸 | 포진점 13m 안에 든 몸 | 50m 안 | 끝까지 50m 밖 | 맞붙은 몸 | 죽은 몸 | 접촉 있은 소집 | 정산: 방어 승 · 공격 승 · 그 밖(무저항 · 항복 · 철수) · 정산 없이 끝(조용한 철수) · 판 끝까지 | 접촉까지(초 · 가운데) |');
L.push('|---|---:|---:|---:|---:|---:|---:|---:|---|---:|');
for (const a of arms) for (const k of ['S1', 'S2']) {
  const ev = runs.filter((r) => r.arm === a).flatMap((r) => r.rec.ev.filter((e) => cls(e) === k));
  const us = ev.flatMap((e) => e.u || []);
  const W = { B: 0, A: 0, x: 0, quiet: 0, open: 0 };
  for (const e of ev) { if (!e.end) { if (e._wend != null) W.quiet++; else W.open++; } else if (e.end.why === 'rout' && e.end.winner === 'B') W.B++; else if (e.end.why === 'rout' && e.end.winner === 'A') W.A++; else W.x++; }
  const tc = ev.filter((e) => e.c1).map((e) => e.c1.t - e.t);
  L.push(`| ${a} · ${k} | ${us.length} | ${us.filter((u) => u.mn <= 13).length} | ${us.filter((u) => u.mn <= 50).length} | ${us.filter((u) => u.mn > 50).length} | ${us.filter((u) => u.eng).length} | ${us.filter((u) => u.dead).length} | ${ev.filter((e) => e.c1).length} / ${ev.length} | ${W.B} · ${W.A} · ${W.x} · ${W.quiet} · ${W.open} | ${r1(q(tc, 0.5))} |`);
  Object.assign(J.arms[a]['dist' + k], { in13: us.filter((u) => u.mn <= 13).length, in50: us.filter((u) => u.mn <= 50).length, out50: us.filter((u) => u.mn > 50).length, eng: us.filter((u) => u.eng).length, dead: us.filter((u) => u.dead).length, contact: ev.filter((e) => e.c1).length, end: W, tcMed: q(tc, 0.5) });
}
L.push('', `## ④ 가장 먼 긴급 소집 몸 ${TOP} 줄(포진점까지 · 소집 순간)`, '');
L.push('| 갈래 · 판 · 시드 | 전쟁 · 날 | 공격 → 방어 | 꼴 | 회관 · 포진점까지 | 포진점에 가장 가까웠던 | 맞붙음 · 죽음 | 정산 |');
L.push('|---|---|---|---|---|---|---|---|');
const all = runs.flatMap((r) => r.rec.ev.filter((e) => e.scram).flatMap((e) => (e.u || []).map((u) => ({ r, e, u }))));
all.sort((x, y) => y.u.d0 - x.u.d0 || x.r.run.localeCompare(y.r.run) || x.r.seed - y.r.seed || x.e.wid - y.e.wid);
for (const { r, e, u } of all.slice(0, TOP)) {
  L.push(`| ${r.arm} · ${r.ctl} · ${r.seed} | W${e.wid} · ${e.day}날 | ${e.atk} → ${e.def} | ${cls(e)} | ${r1(u.h0)} · ${r1(u.d0)} | ${r1(u.mn)} | ${u.eng ? '예' : '아니오'} · ${u.dead ? '예' : '아니오'} | ${e.end ? e.end.why + (e.end.winner ? ' ' + e.end.winner : '') : (e._wend != null ? '정산 없이 끝(' + e._wend + '날)' : '판 끝까지')} |`);
  J.top.push({ arm: r.arm, ctl: r.ctl, seed: r.seed, wid: e.wid, day: e.day, atk: e.atk, def: e.def, cls: cls(e), h0: u.h0, d0: u.d0, mn: u.mn, eng: u.eng, dead: u.dead, end: e.end, wend: e._wend });
}
console.log(L.join('\n'));
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(J, null, 1));
