#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1037 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐 · 판정 0)
// === scripts/t1037-table.js — 판정대기 문 2(징발 묶임) · 문 1-b(보호막)를 지금 세계 판 수로 다시 센다 ===
//   node scripts/t1037-table.js <판 뿌리> [--json <파일>]
//     <뿌리>/run-<판>/base-<시드>.t815.json — 문 2 · 판 = on · on~raid1..3(지금 기본) · a · a~raid1..3(`T844_RET_QUOTA=0 T423_RATION_ACT=0` — T861 의 옛 기본)
//       잣대는 `scripts/t815-table.js` 그대로(그 표 기계를 불러 줄을 읽는다 · 사본 0):
//       묶임 = 자유민 0 이 10일 이상 · 첫날 인구 ≥ 5 · 몰사 = 묶임이 풀린 뒤 3일 안 인구 0 · 셈만 느는 죽음 = 전날 끝에도 자유민 0 이던 날 센 죽음
//     <뿌리>/run-b-A · run-b-C/base-<시드>.t934.json — 문 1-b · 400날 · 보호막 켬(A) · 끔(C · `T858_NO_SHIELD=1`)
//       첫해(날 < 365) 굶어 죽음 · 켬 판 첫해 보호막이 선 마을의 켬 ↔ 끔(`scripts/t972-recount.js shield` 그대로)
//     <뿌리>/lab/<on|off|q2>-<시드>.t934.json — 랩 t17(400날 켬 · 끔 · 800날 문 2): 징발 표식(`drafted`) 마을-날 · 자유민 0 마을-날
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = process.argv[2];
const ji = process.argv.indexOf('--json'), JOUT = ji > 0 ? process.argv[ji + 1] : null;
const SEEDS = [1020, 7, 42];
const node = (args) => execFileSync(process.execPath, args, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 26 });
const out = { q2: {}, q1b: {}, lab: {} };

// ── 문 2 — t815-table 줄을 읽는다
function q2(run) {
  const dir = path.join(ROOT, 'run-' + run);
  if (!SEEDS.every((s) => fs.existsSync(path.join(dir, `base-${s}.t815.json`)))) return null;
  const txt = node([path.join(__dirname, 't815-table.js'), dir]);
  const r = { pins: 0, pinDays: 0, phantom: 0, wipes: 0, emptyEnd: 0, popEnd: 0, days: [], list: [] };
  for (const l of txt.split('\n')) {
    const m = l.match(/^\| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+)[^|]*\| (\d+) \| (\d+) \|$/);
    if (m) { r.days.push(+m[2]); r.pins += +m[3]; r.pinDays += +m[4]; r.phantom += +m[5]; r.wipes += +m[6]; r.emptyEnd += +m[7]; r.popEnd += +m[8]; }
    const p = l.match(/^\s+시드 (\d+) (\S+) (\d+)~(\d+)일\((\d+)일\) 인구 (\d+) · 셈만 (\d+)(.*)$/);
    if (p) r.list.push(`${p[1]} ${p[2]} ${p[3]} ~ ${p[4]}일 · ${p[6]}명${/몰사/.test(p[8]) ? ' · 몰사' : ''}`);
  }
  return r;
}
for (const arm of ['on', 'a']) {
  const runs = [arm, `${arm}~raid1`, `${arm}~raid2`, `${arm}~raid3`];
  out.q2[arm] = Object.fromEntries(runs.map((x) => [x, q2(x)]).filter((x) => x[1]));
}
// ── 문 1-b — 서버 400날
function fam365(file) {
  const o = JSON.parse(fs.readFileSync(file, 'utf8')); const ci = o.cols.indexOf('deaths');
  let n = 0; for (const [d, row] of o.rows) { if (d >= 365) break; for (const x of row) if (x) n += x[ci]; } return n;
}
{
  const A = (s) => path.join(ROOT, 'run-b-A', `base-${s}.t934.json`), C = (s) => path.join(ROOT, 'run-b-C', `base-${s}.t934.json`);
  if (SEEDS.every((s) => fs.existsSync(A(s)) && fs.existsSync(C(s)))) {
    out.q1b.server = { on: SEEDS.map((s) => fam365(A(s))), off: SEEDS.map((s) => fam365(C(s))),
      shield: JSON.parse(node([path.join(__dirname, 't972-recount.js'), 'shield', path.join(ROOT, 'run-b-A', 'base-%s'), path.join(ROOT, 'run-b-C', 'base-%s'), '.t934.json'])) };
  }
  const L = (a, s) => path.join(ROOT, 'lab', `${a}-${s}.t934.json`);
  if (SEEDS.every((s) => fs.existsSync(L('on', s)) && fs.existsSync(L('off', s)))) {
    out.q1b.lab = { on: SEEDS.map((s) => fam365(L('on', s))), off: SEEDS.map((s) => fam365(L('off', s))),
      shield: JSON.parse(node([path.join(__dirname, 't972-recount.js'), 'shield', path.join(ROOT, 'lab', 'on-%s'), path.join(ROOT, 'lab', 'off-%s'), '.t934.json'])) };
  }
}
// ── 랩 문 2 — 징발 표식
for (const s of SEEDS) {
  const f = path.join(ROOT, 'lab', `q2-${s}.t934.json`); if (!fs.existsSync(f)) continue;
  const o = JSON.parse(fs.readFileSync(f, 'utf8')); const pi = o.cols.indexOf('pop'), di = o.cols.indexOf('drafted');
  let vd = 0, free0 = 0, days = 0;
  for (const [d, row] of o.rows) { days = d; for (const x of row) { if (!x) continue; if (x[di] > 0) vd++; if (x[pi] >= 5 && x[pi] - x[di] === 0) free0++; } }
  out.lab[s] = { days, draftVillageDays: vd, free0VillageDays: free0 };
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const f0 = (x) => Math.round(x).toLocaleString('en-US');
console.log('| 판(3시드 합 · 800날) | 묶임(번) | 묶인 날 | 몰사 | 셈만 느는 죽음 | 끝 인구 · 빈 마을 | 묶인 마을(시드 마을 날 · 인구) |');
console.log('|---|---:|---:|---:|---:|---|---|');
for (const arm of ['on', 'a']) for (const [k, r] of Object.entries(out.q2[arm])) console.log(`| ${k} | ${r.pins} | ${f0(r.pinDays)} | ${r.wipes} | ${f0(r.phantom)} | ${f0(r.popEnd)} · ${r.emptyEnd} | ${r.list.join(' / ') || '—'} |`);
for (const arm of ['on', 'a']) {
  const rs = Object.values(out.q2[arm]); if (!rs.length) continue;
  const b = (k) => { const v = rs.map((r) => r[k]); return `${f0(Math.min(...v))} ~ ${f0(Math.max(...v))}(합 ${f0(sum(v))})`; };
  out.q2[arm + 'Band'] = { n: rs.length, pins: b('pins'), pinDays: b('pinDays'), wipes: b('wipes'), phantom: b('phantom') };
  console.log(`| **${arm} 띠(판 ${rs.length})** | ${b('pins')} | ${b('pinDays')} | ${b('wipes')} | ${b('phantom')} | | |`);
}
if (out.q1b.server) { const q = out.q1b.server; console.log(`\n문 1-b 서버 400날 첫해 굶어 죽음 켬 ${q.on.join(' · ')}(합 ${f0(sum(q.on))}) ↔ 끔 ${q.off.join(' · ')}(합 ${f0(sum(q.off))}) · 보호막 선 마을 ${q.shield.shielded}/${q.shield.villages} 켬 ${f0(q.shield.onSh)} ↔ 끔 ${f0(q.shield.offSh)} = ${q.shield.ratio}배 · 나머지 마을 끔 ${f0(q.shield.offRest)}`); }
if (out.q1b.lab) { const q = out.q1b.lab; console.log(`문 1-b 랩 t17 400날 첫해 굶어 죽음 켬 ${q.on.join(' · ')}(합 ${f0(sum(q.on))}) ↔ 끔 ${q.off.join(' · ')}(합 ${f0(sum(q.off))}) · 보호막 선 마을 ${q.shield.shielded}/${q.shield.villages} 켬 ${f0(q.shield.onSh)} ↔ 끔 ${f0(q.shield.offSh)} = ${q.shield.ratio}배 · 나머지 마을 끔 ${f0(q.shield.offRest)}`); }
for (const [s, r] of Object.entries(out.lab)) console.log(`랩 t17 ${r.days}날 시드 ${s}: 징발 표식 마을-날 ${r.draftVillageDays} · 자유민 0(인구 ≥ 5) 마을-날 ${r.free0VillageDays}`);
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
