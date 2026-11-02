#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1074 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐 · 판정 0)
// === scripts/t1074-table.js — 식량 빚(T1074) 끔 ↔ 켬 표 ===
//   node scripts/t1074-table.js <뿌리> [--json <파일>]
//     <뿌리>/run-<판>-<off|on>/base-<시드>.{t1074,t815}.json + base-<시드>.json(판 자 줄) — 판 = on(판 기본) · raid1 · raid2 · raid3
//     <뿌리>/shield-<A|C>/base-<시드>.t1074.json — ⑦ 켬 세계 400날 · 보호막 켬(A) · 끔(C · `T858_NO_SHIELD=1`)
//   셈(시드 셋 합):
//     첫해 굶어 죽음 = 날 < 365 econ 기근 길 죽음(`_deadTot` 틱 차 · lib-day-deaths) · 그 가운데 빚 죽음(`_fdDeadTot`) · 보호막이 막은 빚 죽음(`_fdShield`)
//     빈 마을 = 마지막 날 인구 0 · 해체 = 판 자 줄(`base-<시드>.json`)의 해체 수 · 400날 인구 · 800날 인구
//     문 2 묶임 / 몰사 = `scripts/t815-table.js` 그대로(그 표 기계를 불러 줄을 읽는다 · 사본 0 · t1037-table 과 같은 읽기)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = process.argv[2];
const ji = process.argv.indexOf('--json'), JOUT = ji > 0 ? process.argv[ji + 1] : null;
const SEEDS = [1020, 7, 42];
const RUNS = ['on', 'raid1', 'raid2', 'raid3'];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const node = (args) => execFileSync(process.execPath, args, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 26 });

function q2(dir) {
  if (!SEEDS.every((s) => fs.existsSync(path.join(dir, `base-${s}.t815.json`)))) return null;
  const txt = node([path.join(__dirname, 't815-table.js'), dir]);
  const r = { pins: 0, wipes: 0, phantom: 0 };
  for (const l of txt.split('\n')) {
    const m = l.match(/^\| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+)[^|]*\| (\d+) \| (\d+) \|$/);
    if (m) { r.pins += +m[3]; r.phantom += +m[5]; r.wipes += +m[6]; }
  }
  return r;
}
function one(dir) {
  const r = { seeds: 0, fam365: 0, fd365: 0, fdShield365: 0, famAll: 0, fdAll: 0, empty: 0, pop400: 0, popEnd: 0, dissolved: null, starvingMax: 0, debtMeanMax: 0 };
  for (const s of SEEDS) {
    const t = J(path.join(dir, `base-${s}.t1074.json`)); if (!t) continue;
    r.seeds++;
    const C = t.cols, iP = C.indexOf('pop'), iD = C.indexOf('deathsToday'), iF = C.indexOf('fdDead'), iS = C.indexOf('fdShield'), iSt = C.indexOf('starving'), iM = C.indexOf('debtMean');
    let last = null, at365 = null;
    for (const [day, vs] of t.rows) {
      for (const x of vs) { if (day < 365) r.fam365 += x[iD]; r.famAll += x[iD]; if (x[iSt] > r.starvingMax) r.starvingMax = x[iSt]; if (x[iM] > r.debtMeanMax) r.debtMeanMax = x[iM]; }
      if (day === 400) r.pop400 += vs.reduce((a, x) => a + x[iP], 0);
      if (day < 365) at365 = vs;
      last = vs;
    }
    if (at365) { r.fd365 += at365.reduce((a, x) => a + x[iF], 0); r.fdShield365 += at365.reduce((a, x) => a + x[iS], 0); }
    if (last) { r.fdAll += last.reduce((a, x) => a + x[iF], 0); r.empty += last.filter((x) => x[iP] === 0).length; r.popEnd += last.reduce((a, x) => a + x[iP], 0); }
    const b = J(path.join(dir, `base-${s}.json`));
    const dv = b && (b.dissolved != null ? b.dissolved : (b.counts && b.counts.dissolved));
    if (dv != null) r.dissolved = (r.dissolved || 0) + (+dv || 0);
  }
  return r.seeds ? r : null;
}
const out = { runs: {}, shield: {} };
for (const p of RUNS) for (const k of ['off', 'on']) {
  const dir = path.join(ROOT, `run-${p}-${k}`);
  const o = one(dir); if (!o) continue;
  o.q2 = q2(dir);
  out.runs[`${p}-${k}`] = o;
}
for (const k of ['A', 'C']) { const o = one(path.join(ROOT, `shield-${k}`)); if (o) out.shield[k] = o; }

console.log('| 판 | 손잡이 | 시드 | 첫해 굶어 죽음 | 그 가운데 빚 죽음 | 보호막이 막은 빚 죽음(첫해) | 800날 굶어 죽음 | 빚 죽음(800날) | 빈 마을 | 해체 | 400날 인구 | 800날 인구 | 묶임 | 몰사 | 빚 > 14 최대 | 마을 평균 빚 최대 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k, o] of Object.entries(out.runs)) {
  const [p, kn] = k.split('-');
  console.log(`| ${p === 'on' ? '기본' : p} | ${kn === 'on' ? '켬' : '끔'} | ${o.seeds} | ${o.fam365} | ${o.fd365} | ${o.fdShield365} | ${o.famAll} | ${o.fdAll} | ${o.empty} | ${o.dissolved == null ? '—' : o.dissolved} | ${o.pop400} | ${o.popEnd} | ${o.q2 ? o.q2.pins : '—'} | ${o.q2 ? o.q2.wipes : '—'} | ${o.starvingMax} | ${o.debtMeanMax.toFixed(2)} |`);
}
if (Object.keys(out.shield).length) {
  console.log('\n⑦ 켬 세계 400날 — 보호막 켬(A) ↔ 끔(C · `T858_NO_SHIELD=1`)\n');
  console.log('| 보호막 | 시드 | 첫해 굶어 죽음 | 그 가운데 빚 죽음 | 보호막이 막은 빚 죽음 | 400날 인구 | 빈 마을 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [k, o] of Object.entries(out.shield)) console.log(`| ${k === 'A' ? '켬' : '끔'} | ${o.seeds} | ${o.fam365} | ${o.fd365} | ${o.fdShield365} | ${o.pop400} | ${o.empty} |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
// ── 죽음 가르기(기본 판) — 죽음이 난 마을-날의 압력 칸 음수 몫 비례(T934 꼴 · t815 줄 · 빚 죽음은 그날 칸 몫에 함께 묻힌다)
function split(dir) {
  const tot = { logi: 0, hunger: 0, health: 0, happy: 0 }, t365 = { logi: 0, hunger: 0, health: 0, happy: 0 }; let deaths = 0, d365 = 0;
  for (const s of SEEDS) {
    const t = J(path.join(dir, `base-${s}.t815.json`)); if (!t) return null;
    const C = t.cols, iD = C.indexOf('deathsToday'), ix = {}; for (const c of Object.keys(tot)) ix[c] = C.indexOf(c);
    for (const [day, vs] of t.rows) for (const x of vs) {
      const dd = x[iD]; if (!(dd > 0)) continue; deaths += dd; if (day < 365) d365 += dd;
      let neg = 0; for (const c in ix) neg += Math.min(0, +x[ix[c]] || 0);
      if (neg < 0) for (const c in ix) { const sh = Math.min(0, +x[ix[c]] || 0) / neg * dd; tot[c] += sh; if (day < 365) t365[c] += sh; }
    }
  }
  return { deaths, d365, tot, t365 };
}
console.log('\n죽음 가르기(기본 판 · 압력 칸 음수 몫 비례 · logi = K 넘김 · hunger = 옛 굶주림 두 줄)\n');
console.log('| 손잡이 | 800날 죽음 | logi | hunger | health | happy | 첫해 죽음 | 첫해 logi | 첫해 hunger | 첫해 health | 첫해 happy |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of ['off', 'on']) {
  const r = split(path.join(ROOT, `run-on-${k}`)); if (!r) continue;
  const f = (o, n) => ['logi', 'hunger', 'health', 'happy'].map((c) => `${o[c].toFixed(0)} (${n ? (100 * o[c] / n).toFixed(0) : 0}%)`).join(' | ');
  console.log(`| ${k === 'on' ? '켬' : '끔'} | ${r.deaths} | ${f(r.tot, r.deaths)} | ${r.d365} | ${f(r.t365, r.d365)} |`);
  out.split = out.split || {}; out.split[k] = r;
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
