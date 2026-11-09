#!/usr/bin/env node
// (@regress 없음 — 판 JSON 읽기만 · 세계를 안 세운다 · 판정 0)
// === scripts/t1238-table.js — T1238 켬 판 표: 끔(기준선) · T1207 단독 · T1207 + T1238 — 3시드 × 400날 ===
//   읽는 것: 기준선 JSON(끔 — 인구 · 빈 마을) · `--make` JSON(켬 판 둘 — 인구 · 빈 마을) · 판 폴더의 `sbc-<시드>.json.t1238.json`(계측 훅 — 칸 읽기만)
//   재는 것(끝 날 · 시드마다 · 합): 인구 · 빈 마을 · NPC 영토 칸 · 빠진 칸(묵힘) · 통나무 막힘 %(T1207 치른 날 중 막힌 날) · 나무꾼 ·
//     영토 하루 일 µs(마을 · 날 — `_terrGrow` 통째 · T1207 켬이면 두 판 같은 자) · 넓힌 칸 · 말뚝 통나무 · 개간 분 · econ 땅 크기 · 갇힘 · 묵힘 µs
//   쓰는 법: node scripts/t1238-table.js --off 계측/서버기준선_2026-11-08c.json --arm t1207=<make.json>,<make2.json>@<판 폴더>,<판 폴더2> --arm v2=… [--out 계측/T1238_<날짜>]
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const arms = []; for (let i = 0; i < A.length; i++) if (A[i] === '--arm') { const v = A[i + 1], j = v.indexOf('='), [js, ds] = v.slice(j + 1).split('@'); arms.push({ k: v.slice(0, j), jsons: js.split(','), dirs: (ds || '').split(',').filter(Boolean) }); }
const OFF = opt('--off'), OUT = opt('--out');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const SEEDS = [1020, 7, 42];
const C = { name: 0, pop: 1, terr: 2, wood: 3, lj: 5, days: 7, stallWood: 8, stallBody: 9, cells: 10, pw: 11, lab: 12, felled: 13, need: 15, founder: 17, size: 34, gone: 38, pend: 39, flag: 40, lsize: 41 };
function seedRow(byseed, s) { const r = byseed && byseed[String(s)]; return r ? { pop: r.eight.pop, empty: r.empty, ever: r.eight.ever, expand: r.eight.expand } : null; }
const res = {};
if (OFF) { const b = rd(OFF); res.off = { seeds: {} }; for (const s of SEEDS) res.off.seeds[s] = seedRow(b && b.byseed, s); }
for (const a of arms) {
  const by = {}; for (const f of a.jsons) { const b = rd(f); if (b && b.byseed) Object.assign(by, b.byseed); }
  const o = { seeds: {} };
  for (const s of SEEDS) {
    const base = seedRow(by, s); if (!base) continue;
    let h = null; for (const d of a.dirs) { h = rd(path.join(d, `sbc-${s}.json.t1238.json`)); if (h) break; }
    const last = h && h.snaps && h.snaps[h.snaps.length - 1];
    const rows = last ? last.rows : [];
    const npc = rows.filter((r) => !r[C.founder]);
    const T = last && last.t ? last.t : {}, V2 = last && last.t1238 ? last.t1238 : {};
    o.seeds[s] = Object.assign(base, {
      day: last ? last.day : null,
      npcTerr: npc.reduce((x, r) => x + (r[C.terr] || 0), 0), npcN: npc.length,
      gone: rows.reduce((x, r) => x + (r[C.gone] || 0), 0),
      lj: rows.reduce((x, r) => x + (r[C.lj] || 0), 0),
      stallPct: T.days ? +(100 * T.stallWood / T.days).toFixed(1) : null, bodyPct: T.days ? +(100 * T.stallBody / T.days).toFixed(1) : null,
      cells: T.cells || 0, wood: T.wood || 0, laborMin: T.laborMin || 0, felled: T.felled || 0, woodIn: T.woodIn || 0,
      growUs: V2.growN ? +(V2.growUs / V2.growN).toFixed(1) : null, growMaxUs: V2.growMaxUs != null ? +V2.growMaxUs.toFixed(0) : null, growN: V2.growN || 0,
      decayMs: V2.decayScanMs != null ? +V2.decayScanMs.toFixed(1) : null, saveMs: V2.saveMs != null ? +V2.saveMs.toFixed(1) : null, growMs: V2.growUs != null ? +(V2.growUs / 1000).toFixed(1) : null, trapDays: V2.trapDays || 0, trapMs: V2.trapScanMs != null ? +V2.trapScanMs.toFixed(1) : null, trapped: V2.trapped || 0,
      bodyCells: V2.bodyCells || 0, bodyPartial: V2.bodyPartial || 0, goRefuse: V2.goRefuse || 0, structCut: V2.structCut || 0, struct: V2.struct || 0, land: V2.land || 0, useMarks: V2.useMarks || 0, saveRows: V2.saveRows || 0,
      lsize: npc.reduce((x, r) => x + (r[C.lsize] || 0), 0), flag: npc.filter((r) => r[C.flag]).length,
      snaps: h ? h.snaps.map((sn) => ({ day: sn.day, pop: sn.rows.reduce((x, r) => x + (r[C.pop] || 0), 0), terr: sn.rows.filter((r) => !r[C.founder]).reduce((x, r) => x + (r[C.terr] || 0), 0), lj: sn.rows.reduce((x, r) => x + (r[C.lj] || 0), 0), wood: +sn.rows.reduce((x, r) => x + (r[C.wood] || 0), 0).toFixed(1),
        stall: sn.t && sn.t.days ? +(100 * sn.t.stallWood / sn.t.days).toFixed(2) : null, cells: sn.t ? sn.t.cells : null, gone: sn.rows.reduce((x, r) => x + (r[C.gone] || 0), 0) })) : [],
    });
  }
  res[a.k] = o;
}
const sum = (o, k) => SEEDS.reduce((x, s) => x + ((o.seeds[s] && o.seeds[s][k]) || 0), 0);
const NAME = { off: '끔(기준선 11-08c)', t1207: 'T1207 켬 단독', v2: 'T1207 + T1238 켬' };
const md = [];
//   ⚠µs 는 표에 안 싣는다(JSON 에만) — 판마다 재는 시계가 다를 수 있다(가상 시계 판의 단조 시계는 멎는다 · CPU 시계만 흐른다) · 보고 §4 가 같은 시드 · 같은 시계로 견준다
md.push('| 판 | 인구(1020 · 7 · 42 → 합) | 빈 마을 | NPC 영토 칸(합) | 빠진 칸 | 통나무 막힘 % | 몸 막힘 % | 나무꾼 | 넓힌 칸 | 말뚝 통나무 |', '|:-:|---|---:|---:|---:|---|---|---:|---:|---:|');
for (const k of Object.keys(res)) {
  const o = res[k], ps = SEEDS.map((s) => (o.seeds[s] ? o.seeds[s].pop : '—'));
  const per = (f) => SEEDS.map((s) => (o.seeds[s] && o.seeds[s][f] != null ? o.seeds[s][f] : '—')).join(' · ');
  md.push(`| ${NAME[k] || k} | ${ps.join(' · ')} → **${sum(o, 'pop')}** | ${per('empty')} → ${sum(o, 'empty')} | ${k === 'off' ? '—' : sum(o, 'npcTerr')} | ${k === 'off' ? '—' : sum(o, 'gone')} | ${k === 'off' ? '—' : per('stallPct')} | ${k === 'off' ? '—' : per('bodyPct')} | ${k === 'off' ? '—' : sum(o, 'lj')} | ${k === 'off' ? '—' : sum(o, 'cells')} | ${k === 'off' ? '—' : +sum(o, 'wood').toFixed(0)} |`);
}
if (res.v2) {
  const v = res.v2;
  md.push('', `T1238 칸(합 · 끝 날): 몸 일괄로 영토 된 칸 ${sum(v, 'bodyCells')} · 개간이 날을 넘긴 칸-날 ${sum(v, 'bodyPartial')} · 바둑식 거부 ${sum(v, 'goRefuse')} · 쓰는 칸 개간 그루 ${sum(v, 'structCut')} · 쓰는 칸 표 ${SEEDS.map((s) => v.seeds[s] && v.seeds[s].struct).join(' · ')} · 땅에 남은 일 칸 ${SEEDS.map((s) => v.seeds[s] && v.seeds[s].land).join(' · ')} · 쓰는 날 찍기 ${sum(v, 'useMarks')} · 저장 행 ${sum(v, 'saveRows')} · 갇힘 검사 마을-날 ${sum(v, 'trapDays')}(${SEEDS.map((s) => v.seeds[s] && v.seeds[s].trapMs).join(' · ')} ms · 갇힘 ${sum(v, 'trapped')}) · 묵힘 스캔 ${SEEDS.map((s) => v.seeds[s] && v.seeds[s].decayMs).join(' · ')} ms · 영토 v2 저장 ${SEEDS.map((s) => v.seeds[s] && v.seeds[s].saveMs).join(' · ')} ms · 영토 하루 일 누계 ${SEEDS.map((s) => v.seeds[s] && v.seeds[s].growMs).join(' · ')} ms · econ 표지 선 NPC 마을 ${SEEDS.map((s) => v.seeds[s] && v.seeds[s].flag).join(' · ')}`);
}
if (res.off && res.v2) md.push('', `인구 비 — 켬(T1207 + T1238) ÷ 끔 = ${(sum(res.v2, 'pop') / Math.max(1, sum(res.off, 'pop'))).toFixed(3)} · T1207 단독 ÷ 끔 = ${res.t1207 ? (sum(res.t1207, 'pop') / Math.max(1, sum(res.off, 'pop'))).toFixed(3) : '—'}`);
const txt = md.join('\n'); console.log(txt);
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 't1238-table.json'), JSON.stringify(res)); fs.writeFileSync(path.join(OUT, 't1238-table.md'), txt + '\n'); console.log(`\n→ ${OUT}/t1238-table.{json,md}`); }
