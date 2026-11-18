#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1371 표 · 읽기만 · 판 JSON · 날 줄만 읽는다 — 손으로 세지 않는다)
// === scripts/t1371-table.js — 끔 세계(main 기본) 1,200날 3시드 × 2판: 시드 × 해(1 · 2 · 3 · 4 = 1,096 ~ 1,200 토막) 칸 + 두 판 결정성 ===
//   쓰는 법: node scripts/t1371-table.js [<판 폴더>=계측/T1371_2026-11-18] [--json <후보.json>] [--seeds 1020,7,42]
//   읽는 것(판 폴더 · .gz 도): <시드>-<판>.t1371.jsonl(날 줄 — `scripts/t1371-observe.js`) · <시드>-<판>.sbc.json(날 지문 — server-baseline-check 훅) ·
//     <시드>-<판>.run.json(판 JSON — t577 훅 · 판이 끝까지 돈 때만 있다 · 끝 날 인구 · 도구Q · 무기Q · 빈 마을을 날 줄과 맞대 본다)
//   칸(해 = 365날 토막 · 날 줄이 있는 날까지):
//     해 끝 인구 = 그 해 마지막 날 마을 명부 합 · 굶어 죽음 = `_fdDeadTot` 그 해 증분 합 · K 위 죽음 = (`_deadTot` − `_fdDeadTot` − `_natDeadTot`) 그 해 증분 합(인구 식 음수 고리) ·
//     자연사 = `_natDeadTot` 증분 · 빈 마을 = 해 끝 날 사람 0 마을 · 꼭대기 = 그 해 가장 많은 세계 인구(날) ·
//     꼭대기 뒤 내림 % = 그 해 안에서 그때까지 꼭대기 대비 가장 깊은 내림(T1357 L2 와 같은 식) ·
//     마을별 최악 = 그 해 한 마을 굶어 죽음 최댓값과 그 마을 · 도구Q · 무기Q = 해 끝 날(t577 여덟 수와 같은 식)
//   결정성: 같은 시드 두 판(a · b)의 날 지문(econ 그날 전체 sha1 12) 이 둘 다 가진 날 모두 같고 날 줄(jsonl)도 같은가 · 두 판 날 수가 같은가.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const DIR = A.find((x, i) => !x.startsWith('--') && !(A[i - 1] || '').startsWith('--')) || path.join(__dirname, '..', '계측', 'T1371_2026-11-18');
const JOUT = opt('--json', null);
const SEEDS = String(opt('--seeds', '1020,7,42')).split(',').map(Number);
const REPS = ['a', 'b'];
const DAYS = 1200;

const readTxt = (base) => { for (const f of [base, base + '.gz']) { try { let b = fs.readFileSync(path.join(DIR, f)); if (/\.gz$/.test(f)) b = zlib.gunzipSync(b); return b.toString('utf8'); } catch (e) {} } return null; };
const readJ = (base) => { const t = readTxt(base); try { return t ? JSON.parse(t) : null; } catch (e) { return null; } };
function lines(seed, rep) {
  const t = readTxt(`${seed}-${rep}.t1371.jsonl`); if (!t) return null;
  const L = new Map(); let names = null;
  for (const s of t.split('\n')) {
    if (!s) continue; let r; try { r = JSON.parse(s); } catch (e) { continue; }   // 죽은 판의 끝 줄이 반쯤 쓰였으면 버린다
    if (!Array.isArray(r)) { names = r.names; continue; }
    const [d, wd, pop, fd, nat, dead, toolQ, weapQ] = r;
    const by = new Map(); names.forEach((n, i) => by.set(n, { pop: pop[i], fd: fd[i], nat: nat[i], dead: dead[i] }));
    L.set(d, { d, wd, by, pop: pop.reduce((a, x) => a + x, 0), toolQ, weapQ, raw: s });
  }
  return L;
}
const lastDay = (L) => (L && L.size ? Math.max(...L.keys()) : 0);
const Z = { pop: 0, fd: 0, nat: 0, dead: 0 };
function yearRow(L, y, a, b) {
  const end = Math.min(b, lastDay(L)); if (end < a) return null;
  const E = L.get(end), P = L.get(a - 1);   // 앞 해 끝 날 줄(첫 해는 0)
  let starve = 0, kd = 0, nat = 0, empty = 0, worst = { name: null, starve: -1 };
  for (const [nm, e] of E.by) {
    const p = (P && P.by.get(nm)) || Z;
    const f = e.fd - p.fd, n = e.nat - p.nat, k = (e.dead - e.fd - e.nat) - (p.dead - p.fd - p.nat);
    starve += f; nat += n; kd += k; if (e.pop === 0) empty++;
    if (f > worst.starve) worst = { name: nm, starve: f };
  }
  let peak = 0, peakDay = null, run = 0, drop = 0;
  for (let d = a; d <= end; d++) { const o = L.get(d); if (!o) continue; if (o.pop > peak) { peak = o.pop; peakDay = d; } if (o.pop > run) run = o.pop; else if (run) drop = Math.max(drop, (run - o.pop) / run); }
  return { year: y, from: a, to: end, full: end === b, endPop: E.pop, starve, kDeath: kd, nat, empty, peak, peakDay, dropPct: +(drop * 100).toFixed(1),
    worst: { name: worst.starve > 0 ? worst.name : null, starve: Math.max(0, worst.starve) }, toolQ: E.toolQ, weapQ: E.weapQ };
}
function det(seed) {
  const fa = readJ(`${seed}-a.sbc.json`), fb = readJ(`${seed}-b.sbc.json`), la = lines(seed, 'a'), lb = lines(seed, 'b');
  const r = { daysA: lastDay(la), daysB: lastDay(lb), fpA: fa ? fa.days.length : 0, fpB: fb ? fb.days.length : 0, fpSame: null, fpFirstDiff: null, linesSame: null, linesFirstDiff: null };
  if (fa && fb) { const n = Math.min(fa.days.length, fb.days.length); r.fpSame = true; r.fpCmp = n; for (let i = 0; i < n; i++) if (fa.days[i][2] !== fb.days[i][2] || fa.days[i][0] !== fb.days[i][0]) { r.fpSame = false; r.fpFirstDiff = fa.days[i][0]; break; } }
  if (la && lb) { const n = Math.min(r.daysA, r.daysB); r.linesSame = true; r.linesCmp = n; for (let d = 1; d <= n; d++) { const x = la.get(d), y = lb.get(d); if ((x && x.raw) !== (y && y.raw)) { r.linesSame = false; r.linesFirstDiff = d; break; } } }
  //   힙으로 죽은 판은 훅 끝 줄(.sbc.json)을 못 쓴다 → 두 판 다 날 지문이 없으면 날 줄로만 본다(basis 칸에 적는다)
  r.basis = (fa && fb) ? '날 지문 + 날 줄' : (!fa && !fb) ? '날 줄만(날 지문 없음 — 판이 끝 줄을 못 썼다)' : '한 판만 날 지문';
  r.ok = !!(r.linesSame && r.daysA === r.daysB && ((fa && fb) ? (r.fpSame && r.fpA === r.fpB) : (!fa && !fb)));
  return r;
}
const out = { made: new Date().toISOString().slice(0, 10), card: 'T1371', world: '끔 세계(main 기본 · server-baseline-check 판 조건 · --vclock)', days: DAYS, seeds: SEEDS,
  def: { year: '365날 토막(4 = 1,096 ~ 1,200 · 토막)', endPop: '해 끝 날 마을 명부 합', starve: '_fdDeadTot 그 해 증분 합', kDeath: '(_deadTot − _fdDeadTot − _natDeadTot) 그 해 증분 합 — 인구 식 음수 고리(K 위 죽음)',
    nat: '_natDeadTot 그 해 증분 합', empty: '해 끝 날 사람 0 마을', peak: '그 해 가장 많은 세계 인구(peakDay = 그 날)', dropPct: '그 해 안 그때까지 꼭대기 대비 가장 깊은 내림 %(T1357 L2 식)',
    worst: '그 해 한 마을 굶어 죽음 최댓값 · 그 마을', toolQ: '해 끝 날 곳간 tool × _toolQ 합', weapQ: '해 끝 날 곳간 weapon × _weapQ 합', det: '두 판 날 지문(econ sha1 12) · 날 줄 같음 · 날 수 같음' },
  byseed: {} };
for (const s of SEEDS) {
  const L = lines(s, 'a') || lines(s, 'b'); const o = { done: lastDay(L), incomplete: lastDay(L) < DAYS, det: det(s), years: [] };   // incomplete = 날 줄이 1,200날에 못 닿았다(멈춤 · 죽음 — 까닭은 보고)
  if (L) for (const [y, a, b] of [[1, 1, 365], [2, 366, 730], [3, 731, 1095], [4, 1096, 1200]]) { const r = yearRow(L, y, a, b); if (r) o.years.push(r); }
  //   판 JSON(끝까지 돈 판) 끝 칸과 날 줄 끝 날을 맞대 본다
  const run = readJ(`${s}-a.run.json`) || readJ(`${s}-b.run.json`);
  if (run && L) { const E = L.get(run.days); o.runEnd = { days: run.days, pop: run.eight.pop, toolQ: run.eight.toolQ, weapQ: run.eight.weapQ, empty: run.empty, dissolved: run.dissolved,
    match: !!E && E.pop === run.eight.pop && E.toolQ === run.eight.toolQ && E.weapQ === run.eight.weapQ }; }
  else o.runEnd = null;
  out.byseed[s] = o;
}
const fx = (v) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString('en-US') : v);
console.log('| 시드 | 해(날) | 해 끝 인구 | 굶어 죽음 | K 위 죽음 | 자연사 | 빈 마을 | 꼭대기(날) | 꼭대기 뒤 내림 % | 마을별 최악(굶음 · 마을) | 도구Q | 무기Q |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of SEEDS) for (const r of out.byseed[s].years) console.log(`| ${s} | ${r.year}${r.full ? '' : '*'}(${r.from}~${r.to}) | ${fx(r.endPop)} | ${fx(r.starve)} | ${fx(r.kDeath)} | ${fx(r.nat)} | ${r.empty} | ${fx(r.peak)}(${r.peakDay}) | ${r.dropPct} | ${r.worst.starve} · ${r.worst.name || '—'} | ${fx(r.toolQ)} | ${fx(r.weapQ)} |`);
console.log('\n| 시드 | 날 줄 끝 날 a · b | 날 지문 a · b | 날 지문 같음 | 날 줄 같음 | 결정성 | 판 JSON 끝 칸 = 날 줄 |');
console.log('|---|---|---|---|---|---|---|');
for (const s of SEEDS) { const o = out.byseed[s], d = o.det;
  console.log(`| ${s} | ${d.daysA} · ${d.daysB} | ${d.fpA} · ${d.fpB} | ${d.fpSame == null ? '—' : d.fpSame ? `○(${d.fpCmp}날)` : `✗ 날 ${d.fpFirstDiff}`} | ${d.linesSame == null ? '—' : d.linesSame ? `○(${d.linesCmp}날)` : `✗ 날 ${d.linesFirstDiff}`} | ${d.ok ? '○' : '✗'}(${d.basis}) | ${o.runEnd ? (o.runEnd.match ? `○(날 ${o.runEnd.days} · 인구 ${o.runEnd.pop} · 빈 ${o.runEnd.empty})` : '✗') : '판 JSON 없음'} |`); }
console.log('\n(* = 토막 해 · 날 줄이 그 해 끝까지 없다)');
if (JOUT) { fs.writeFileSync(JOUT, JSON.stringify(out, null, 1) + '\n'); console.log(`→ ${JOUT}`); }
