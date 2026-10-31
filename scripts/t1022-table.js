'use strict';
// (@regress 없음 — 러너 밖 · T1022 표 기계 · 제품 무변)
// === scripts/t1022-table.js — 해체 마을 사람은 어디로(800날 판 · 보호막 켬/끔 × 띠) ===
//   쓰는 법: node scripts/t1022-table.js --runs <dir> [--json out]
//     dir 안에 판마다 `<갈래>-<판>-<시드>/` (갈래 = on · off · 판 = main · raid1 · raid2 · raid3 — T837 대조 `DCTL_SKIP=raid:n`)
//     그 안 `base-<시드>.json`(판 자) · `base-<시드>.t1022.json`(`t1022-observe.js`)
//   띠 = main + 대조 셋의 최소 ~ 최대(T837 · T984 와 같은 꼴). 보호기 끝 = `server/bandits.js` `_bdtOpenDay` 정본(원문 컴파일 · 씨 = 존 설정 — T984 표 기계와 같은 문).
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
let RUNS = null, jOut = null;
for (let i = 0; i < A.length; i++) { if (A[i] === '--runs') RUNS = A[++i]; else if (A[i] === '--json') jOut = A[++i]; }
if (!RUNS) { console.error('--runs <dir>'); process.exit(2); }
const SEEDS = ['1020', '7', '42'], ARMS = ['on', 'off'], CTL = ['main', 'raid1', 'raid2', 'raid3'];
const ARM_KO = { on: '보호막 켬(기본)', off: '보호막 끔(T858_NO_SHIELD=1)' };
function bdtOpen() {   // T984 표 기계와 같은 문
  const f = path.join(ROOT, 'server', 'bandits.js');
  const m = new Module(f, module); m.filename = f; m.paths = Module._nodeModulePaths(path.dirname(f));
  const zs = (() => { const Z = require(path.join(ROOT, 'server', 'zone-config')); const z = (Z.ZONES || Z.zones || Z).hanbando || (Z.getZone && Z.getZone('hanbando')); return (z && z.villageSeed) || 1020; })();
  m._compile(fs.readFileSync(f, 'utf8') + '\n;S.denSeed = (' + zs + ' >>> 0) || 1; module.exports.__t1022Open = _bdtOpenDay;', f);
  return m.exports.__t1022Open;
}
const OPEN = bdtOpen();
const load = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
// 끝 갈래 — 표의 열(사람 하나 = 한 칸)
const FATES = [
  ['bandit', '도적(해체 단)'], ['desert', '도적(뒤에 절망 이탈)'], ['other', '다른 마을'], ['road', '길 위 죽음'], ['onroad', '길 위(판 끝)'],
  ['starve', '그 자리 죽음 · 굶음'], ['old', '그 자리 죽음 · 늙음'], ['elsewhere', '그 밖 죽음(전쟁 · 토벌)'], ['stay', '그대로(판 끝 제 마을)'], ['unknown', '모름'],
];
function fateKey(p) {
  if (p.fate === '도적') return p.cause === '절망 이탈' ? 'desert' : 'bandit';
  if (p.fate === '다른 마을') return 'other';
  if (p.fate === '길 위 죽음') return 'road';
  if (p.fate === '길 위') return 'onroad';
  if (p.fate === '그 자리 죽음') return p.cause === '굶음' ? 'starve' : 'old';
  if (p.fate === '그 밖 죽음') return 'elsewhere';
  if (p.fate === '그대로') return 'stay';
  return 'unknown';
}
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
function one(arm, ctl, seed) {
  const dir = path.join(RUNS, `${arm}-${ctl}-${seed}`);
  const o = load(path.join(dir, `base-${seed}.t1022.json`)), run = load(path.join(dir, `base-${seed}.json`));
  if (!o || !run) return null;
  const V = o.dis.map((d) => {
    const c = Object.fromEntries(FATES.map(([k]) => [k, 0])); c.bandit = d.toBandit;
    const days = Object.fromEntries(FATES.map(([k]) => [k, []]));
    for (const p of d.people) { const k = fateKey(p); c[k]++; if (p.day != null && k !== 'stay') days[k].push(p.day - d.day); }
    const tos = {}; for (const p of d.people) if (fateKey(p) === 'other') tos[p.to] = (tos[p.to] || 0) + 1;
    const walk = d.bodies.filter((b) => b.kind === 'walk'), died = d.bodies.filter((b) => b.kind === 'died');
    return { v: d.v, day: d.day, open: OPEN({ name: d.v }), pop0: d.pop0, stay0: d.stay, gang: d.gang, gangEnd: d.gangEnd, c, days, tos,
      births: d.births, popEnd: d.popEnd, near: d.near, gangBodies: d.gangBodies || [],
      body: { walk: walk.length, died: died.length, vanish: d.bodies.filter((b) => b.end === 'vanish').length, other: d.bodies.filter((b) => b.kind !== 'walk' && b.kind !== 'died' && b.end !== 'vanish').length,
        jumps: d.bodies.reduce((a, b) => a + (b.jumps || 0), 0), maxR: Math.max(0, ...walk.map((b) => b.maxR || 0)), samples: walk.reduce((a, b) => a + (b.n || 0), 0),
        toCamp: walk.filter((b) => b.toCamp != null).map((b) => b.toCamp), len: walk.map((b) => b.len), open: walk.filter((b) => b.end === 'open').length,
        walkDays: walk.filter((b) => b.day1 != null).map((b) => b.day1 - b.day0) },
      inVil0: d.bodyNote && d.bodyNote.inVil0 };
  });
  return { arm, ctl, seed, V, lastDay: o.lastDay, errs: o.errs, run: { days: run.days, dissolved: run.dissolved, empty: run.empty, pop: run.eight && run.eight.pop, bandit: run.bandit }, cap: o.knob.VILLAGE_NPC_CAP, dayMs: o.dayMs, opDayMs: o.opDayMs, moveSpeed: o.moveSpeed, hooked: o.hooked };
}
const R = {};
for (const a of ARMS) { R[a] = {}; for (const c of CTL) { R[a][c] = {}; for (const s of SEEDS) R[a][c][s] = one(a, c, s); } }
const f0 = (x) => (x == null ? '—' : (Math.abs(x) < 1 && x !== 0 ? (Math.round(x * 1000) / 1000).toString() : (Math.round(x * 10) / 10).toLocaleString()));
const band = (xs) => { const a = xs.filter((x) => x != null); if (!a.length) return '—'; const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? f0(lo) : `${f0(lo)} ~ ${f0(hi)}`; };
const sumF = (X, k) => (X ? X.V.reduce((a, v) => a + v.c[k], 0) : null);
const out = { made: '2026-10-31', fates: FATES, runs: {}, summary: {} };
const have = (a) => CTL.map((c) => SEEDS.map((s) => (R[a][c][s] ? 1 : 0)).join('')).join(' · ');
console.log(`\n=== T1022 — 해체 마을 사람은 어디로 · 800날 · 판 = ${RUNS} ===`);
for (const a of ARMS) {
  const runs = CTL.flatMap((c) => SEEDS.map((s) => R[a][c][s])).filter(Boolean);
  if (!runs.length) continue;
  console.log(`\n## ${ARM_KO[a]} — 판 ${runs.length}/12 (main · raid1 · raid2 · raid3 × 1020 7 42 = ${have(a)})`);
  const r0 = runs[0];
  console.log(`  판 조건: 몸 상한 VILLAGE_NPC_CAP=${r0.cap} · 판 하루 ${r0.dayMs}ms · 운영 하루 ${r0.opDayMs}ms · 존 걸음 ${r0.moveSpeed}px/s`);
  // 판마다 한 줄
  console.log('\n  | 판 | 시드 | 끝 날 | 해체(관찰) | 판 JSON 해체 | 해체 때 사람 | 도적(해체 단) | 남은 | 판 끝 인구 | 관찰 오류 |');
  console.log('  |---|---|---|---|---|---|---|---|---|---|');
  for (const c of CTL) for (const s of SEEDS) { const X = R[a][c][s]; if (!X) { console.log(`  | ${c} | ${s} | (없음) |||||||| `); continue; }
    console.log(`  | ${c} | ${s} | ${X.lastDay} | ${X.V.length} | ${X.run.dissolved} | ${X.V.reduce((q, v) => q + v.pop0, 0)} | ${sumF(X, 'bandit')} | ${X.V.reduce((q, v) => q + v.stay0, 0)} | ${X.run.pop} | ${X.errs.length} |`); }
  // 끝 갈래 합(띠)
  console.log('\n  | 끝 | ' + SEEDS.join(' | ') + ' | 3시드 합 |');
  console.log('  |---|' + SEEDS.map(() => '---').join('|') + '|---|');
  const S = {};
  const row = (lab, f) => { const per = SEEDS.map((s) => CTL.map((c) => (R[a][c][s] ? f(R[a][c][s]) : null)));
    const tot = CTL.map((c) => (SEEDS.every((s) => R[a][c][s]) ? SEEDS.reduce((q, s) => q + f(R[a][c][s]), 0) : null));
    S[lab] = { per: per.map((x) => x), tot }; console.log(`  | ${lab} | ${per.map(band).join(' | ')} | ${band(tot)} |`); };
  row('도적화(해체) 마을', (X) => X.V.length);
  row('해체 때 사람', (X) => X.V.reduce((q, v) => q + v.pop0, 0));
  for (const [k, lab] of FATES) row(lab, (X) => sumF(X, k));
  row('해체 뒤 새로 든 사람(출생)', (X) => X.V.reduce((q, v) => q + (v.births || 0), 0));
  row('해체 마을 판 끝 인구', (X) => X.V.reduce((q, v) => q + (v.popEnd || 0), 0));
  row('해체 마을 중 판 끝 인구 0', (X) => X.V.filter((v) => !v.popEnd).length);
  row('걸어 나간 몸(해체 마을 · 판 전체)', (X) => X.V.reduce((q, v) => q + v.body.walk, 0));
  row('  순간이동(표본 사이 > 존 걸음 × 시간)', (X) => X.V.reduce((q, v) => q + v.body.jumps, 0));
  row('  몸 없이 사라진 몸', (X) => X.V.reduce((q, v) => q + v.body.vanish, 0));
  row('누운 몸(그 자리 죽음)', (X) => X.V.reduce((q, v) => q + v.body.died, 0));
  out.summary[a] = S;
  // 걸린 날
  const allD = (k) => runs.flatMap((X) => X.V.flatMap((v) => v.days[k]));
  console.log('\n  걸린 날(해체 날 → 그 끝 · 띠 판 전부 · 중앙 / 최대): ' + FATES.filter(([k]) => k !== 'stay' && k !== 'bandit').map(([k, lab]) => { const d = allD(k); return d.length ? `${lab} ${med(d)} / ${Math.max(...d)}(${d.length}명)` : null; }).filter(Boolean).join(' · '));
  // 마을마다(main 판)
  console.log('\n  ### main 판 · 해체 마을마다');
  console.log('  | 시드 | 마을 | 보호기 끝 | 해체 날 | 사람 | 도적(단 · 판 끝) | 남은 | 이탈 | 다른 마을 | 길 위 죽음 | 굶음 | 늙음 | 그 밖 | 그대로 | 걸린 날 중앙(죽음) | 출생 | 판 끝 인구 | 단 몸(그날 은거지 곁 · 마을에서 칸) | 몸: 걸음 · 순간이동 · 은거지까지 칸 · 걸은 날 |');
  console.log('  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of SEEDS) { const X = R[a].main[s]; if (!X) continue;
    for (const v of X.V) { const dd = [...v.days.starve, ...v.days.old];
      console.log(`  | ${s} | ${v.v} | ${v.open} | ${v.day} | ${v.pop0} | ${v.c.bandit}(#${v.gang ? v.gang.id : '?'} · ${v.gangEnd && v.gangEnd.gone ? '흩어짐' : (v.gangEnd ? v.gangEnd.n + '명' : '?')}) | ${v.stay0} | ${v.c.desert} | ${v.c.other} | ${v.c.road} | ${v.c.starve} | ${v.c.old} | ${v.c.elsewhere} | ${v.c.stay} | ${dd.length ? med(dd) : '—'} | ${v.births} | ${v.popEnd} | ${v.gangBodies.length ? v.gangBodies.length + '(' + Math.min(...v.gangBodies) + '~' + Math.max(...v.gangBodies) + ')' : '0'} | ${v.body.walk} · ${v.body.jumps} · ${v.body.toCamp.length ? v.body.toCamp.join('/') : '—'} · ${v.body.walkDays.length ? v.body.walkDays.join('/') : '—'} |`); } }
  // 판정대기 3 근거 — T577 ⓐ 규칙의 받는 마을 · 교역로 최근접 · 길 위 날(띠 판 전부)
  const N = runs.flatMap((X) => X.V.map((v) => v.near).filter(Boolean));
  const diff = N.filter((n) => n.straight && n.route && !n.same).length, inf = N.filter((n) => n.straight && n.straight.routeCells === 'inf').length;
  const wr = N.map((n) => n.walkDays && n.walkDays.run).filter((x) => x != null), wo = N.map((n) => n.walkDays && n.walkDays.op).filter((x) => x != null);
  console.log(`\n  3-b 받는 마을: 해체 ${N.length}건 중 곧은 거리 최근접 ≠ 교역로 최근접 ${diff} · 곧은 최근접이 교역로로 안 닿음 ${inf}`
    + ` · 곧은 최근접 곧은 거리 ${band(N.map((n) => n.straight && n.straight.cells))}칸 · 교역로 ${band(N.map((n) => (n.straight && typeof n.straight.routeCells === 'number' ? n.straight.routeCells : null)))}칸`);
  console.log(`  3-a 길 위 날(곧은 최근접까지 교역로 ÷ 존 걸음 하루 몫): 이 판 하루 ${med(wr)}날(${band(wr)}) · 운영 하루 ${med(wo)}날(${band(wo)})`);
  out.summary[a].near = { n: N.length, diff, inf, walkRun: wr, walkOp: wo };
}
for (const a of ARMS) { out.runs[a] = {}; for (const c of CTL) for (const s of SEEDS) if (R[a][c][s]) out.runs[a][`${c}-${s}`] = R[a][c][s]; }
if (jOut) { fs.writeFileSync(jOut, JSON.stringify(out)); console.log('\n→ ' + jOut); }
