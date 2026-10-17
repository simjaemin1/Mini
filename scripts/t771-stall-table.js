#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T771 표 기계 · 관찰자 JSON(`.t771.json`) · 판 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t771-stall-table.js — 전쟁 교착 표: 한 쌍의 전쟁을 날마다 한 줄로 ==========
//   쓰는 법:
//     node scripts/t771-stall-table.js day <판.json.t771.json> [--war <번호>]          — 날마다 한 줄(국면 · 작전 · 방어 태세 · 출격 · 두 몸 자리 · 거리 · 교전 상태 · 화살 · 공격 몸 hp · 접촉 · 대치 · 까닭)
//     node scripts/t771-stall-table.js same <가.t771.json> <나.t771.json> [--war <번호>] — 두 판의 그 전쟁 날 줄이 같은가(예: T403 끔 ↔ 켬)
//     node scripts/t771-stall-table.js fix <끔 판.json> <켬 판.json> [--pair 임업2>광산5]  — 고침 끔 ↔ 켬: 그 쌍 전쟁의 시작 · 끝 · 출격 · 버티기 · 전투(war-core 로그) · 여덟 수
//   ★까닭 칸(관찰자 칸에서 읽는다 — 새 판정 0): 화살 0 · 공격 holder(안 다가옴) · 접촉 수 그대로 · 대치 셈 증가
'use strict';
const fs = require('fs');
const argv = process.argv.slice(2);
const MODE = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');

function warRows(p, id) {
  const out = [];
  for (const r of p.days) for (const w of r.wars) if (id == null || w.id === id) out.push(Object.assign({ day: r.day }, w));
  return out;
}
function firstStall(p) {   //   가장 오래 산 전쟁(교착 후보)
  const life = new Map(); for (const r of p.days) for (const w of r.wars) { const o = life.get(w.id) || { id: w.id, a: r.day, b: r.day, atk: w.atk, def: w.def }; o.b = r.day; life.set(w.id, o); }
  return [...life.values()].sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
}
function lineOf(w, prev, logByDay) {
  const f = w.fight || {}, b = w.body || {};
  const ua = (f.units || []).find((u) => u[0] === 'A'), ub = (f.units || []).find((u) => u[0] === 'B');
  const arB = f.ammo && f.ammo.B ? f.ammo.B[0] : null;
  const why = [];
  if (f.holder === 'A' && ua && prev && prev.fight && prev.fight.units) { const pa = prev.fight.units.find((u) => u[0] === 'A'); if (pa && pa[5] === ua[5] && pa[6] === ua[6]) why.push('공격 holder — 안 다가옴'); }
  if (arB === 0) why.push('화살 0');
  if (prev && prev.fight && (f.contacts | 0) === (prev.fight.contacts | 0) && (f.standoffs | 0) > (prev.fight.standoffs | 0)) why.push('접촉 0 → 대치');
  if (f.state === 'engaged' && prev && prev.fight && prev.fight.state === 'engaged') why.push('원거리 맞붙음(사거리 밖 근접 0)');
  const L = (logByDay.get(w.day) || []).map((x) => x.replace(/^D\d+ /, ''));
  return { day: w.day, phase: w.phase, op: w.op, defMode: w.defMode, sortie: w.sortie ? 1 : 0, mode: b.mode || null, ag: b.ag, dg: b.dg, state: f.state || null, t: f.t, gap: f.gap,
    arrowsB: arB, hpA: ua ? ua[9] : null, hpB: ub ? ub[9] : null, stA: ua ? ua[2] : null, stB: ub ? ub[2] : null, typeA: ua ? ua[7] : null, typeB: ub ? ub[7] : null,
    contacts: f.contacts | 0, standoffs: f.standoffs | 0, why, log: L };
}

if (MODE === 'day') {
  const p = rd(argv[1]); const st = opt('--war', null) != null ? { id: +opt('--war') } : firstStall(p);
  const logByDay = new Map(); for (const x of p.log || []) { const m = /^D(\d+) /.exec(x); if (!m) continue; const d = +m[1]; (logByDay.get(d) || logByDay.set(d, []).get(d)).push(x); }
  const rows = warRows(p, st.id); const lines = [];
  console.log(`\n=== W${st.id} ${rows[0] ? rows[0].atk + ' → ' + rows[0].def : ''} — 날마다(관찰자 하루 마감 앞 · ${p.knobs ? JSON.stringify(p.knobs) : ''}) ===`);
  console.log('| 날 | war-core 국면 · 작전 | 방어 태세 · 출격 표 | 그날 로그(이 쌍) | 몸 모드 | 공격 몸(병종 · 상태 · hp) | 방어 몸(병종 · 상태 · hp) | 두 몸 거리(m) | 교전 상태 · 시계(s) | 방어 화살 | 접촉 · 대치 셈 | 안 끝난 까닭 |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
  rows.forEach((w, i) => { const o = lineOf(w, rows[i - 1], logByDay); lines.push(o);
    console.log(`| ${o.day} | ${o.phase} · ${o.op} | ${o.defMode || '—'} · ${o.sortie} | ${o.log.join(' / ') || '—'} | ${o.mode || '—'} | ${o.typeA || '—'} · ${o.stA || '—'} · ${f1(o.hpA)} | ${o.typeB || '—'} · ${o.stB || '—'} · ${f1(o.hpB)} | ${f1(o.gap)} | ${o.state || '—'} · ${f1(o.t)} | ${o.arrowsB == null ? '—' : o.arrowsB} | ${o.contacts} · ${o.standoffs} | ${o.why.join(' · ') || '—'} |`); });
  const J = opt('--json', ''); if (J) fs.writeFileSync(J, JSON.stringify({ war: st, lines }));
} else if (MODE === 'same') {
  const a = rd(argv[1]), b = rd(argv[2]); const st = opt('--war', null) != null ? { id: +opt('--war') } : firstStall(a);
  const key = (p) => warRows(p, st.id).map((w) => JSON.stringify([w.day, w.phase, w.op, w.sortie, w.defMode, w.body && w.body.ag, w.body && w.body.dg, w.fight && w.fight.state, w.fight && w.fight.gap, w.fight && w.fight.contacts, w.fight && w.fight.standoffs, w.fight && w.fight.units]));
  const ka = key(a), kb = key(b); let firstDiff = -1; for (let i = 0; i < Math.max(ka.length, kb.length); i++) if (ka[i] !== kb[i]) { firstDiff = i; break; }
  console.log(`W${st.id} 날 줄 ${ka.length} ↔ ${kb.length} · ${firstDiff < 0 ? '같음' : '다름(첫 갈림 줄 ' + firstDiff + ')'} · 손잡이 ${JSON.stringify(a.knobs)} ↔ ${JSON.stringify(b.knobs)}`);
} else if (MODE === 'fix') {
  const pair = String(opt('--pair', '임업2>광산5')).split('>');
  const [j0, j1] = [rd(argv[1]), rd(argv[2])], [p0, p1] = [rd(argv[1] + '.t771.json'), rd(argv[2] + '.t771.json')];
  const sum = (j, p) => {
    const L = p.log || []; const atkFirst = (x) => x.indexOf(pair[0] + '→' + pair[1]) >= 0 || x.indexOf(pair[0] + ' → ' + pair[1]) >= 0 || x.indexOf(pair[0] + ' vs ' + pair[1]) >= 0;
    const life = new Map(); for (const r of p.days) for (const w of r.wars) { if (w.atk !== pair[0]) continue; const o = life.get(w.id) || { id: w.id, a: r.day, b: r.day }; o.b = r.day; life.set(w.id, o); }
    const longest = [...life.values()].sort((x, y) => (y.b - y.a) - (x.b - x.a))[0] || null;
    return { eight: j.eight, wars: [...life.values()], longest, sortie: L.filter((x) => new RegExp(pair[1] + ' 출격\\(sortie\\)').test(x)).length, miss: L.filter((x) => /닿지 못했다/.test(x)).length,
      battles: L.filter((x) => /^D\d+ 전투 /.test(x) && atkFirst(x)), returns: L.filter((x) => new RegExp('^D\\d+ ' + pair[0] + ' 귀환 — 군량').test(x)).length, logN: L.length };
  };
  const a = sum(j0, p0), b = sum(j1, p1);
  console.log(`\n=== 고침 끔 ↔ 켬 — ${pair[0]} → ${pair[1]} ===`);
  console.log(`| 칸 | 끔 | 켬 |\n|---|---|---|`);
  console.log(`| 손잡이 | ${JSON.stringify(p0.knobs)} | ${JSON.stringify(p1.knobs)} |`);
  console.log(`| 그 쌍 전쟁(공격 ${pair[0]}) — 선 날 ~ 마지막 본 날 | ${a.wars.map((w) => 'W' + w.id + ' D' + w.a + '~' + w.b).join(' · ')} | ${b.wars.map((w) => 'W' + w.id + ' D' + w.a + '~' + w.b).join(' · ')} |`);
  console.log(`| 가장 긴 전쟁 | ${a.longest ? 'W' + a.longest.id + ' ' + (a.longest.b - a.longest.a + 1) + '일' : '—'} | ${b.longest ? 'W' + b.longest.id + ' ' + (b.longest.b - b.longest.a + 1) + '일' : '—'} |`);
  console.log(`| ${pair[1]} 출격 결단 줄 | ${a.sortie} | ${b.sortie} |`);
  console.log(`| 버티기(출격이 닿지 못했다) 줄 | ${a.miss} | ${b.miss} |`);
  console.log(`| 그 쌍 전투(war-core 로그) | ${a.battles.length} | ${b.battles.length} |`);
  console.log(`| ${pair[0]} 귀환 | ${a.returns} | ${b.returns} |`);
  for (const k of ['pop', 'weapQ', 'board', 'toolQ', 'grain']) console.log(`| 여덟 수 ${k} | ${a.eight[k]} | ${b.eight[k]} |`);
  console.log('\n켬 전투 줄:\n  ' + b.battles.join('\n  '));
  const J = opt('--json', ''); if (J) fs.writeFileSync(J, JSON.stringify({ pair, off: a, on: b }));
} else {
  console.log('쓰는 법: day <.t771.json> [--war N] | same <가> <나> [--war N] | fix <끔 판.json> <켬 판.json> [--pair 공격>방어]');
}
