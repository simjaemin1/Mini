'use strict';
// (@regress 없음 — 러너 밖 · T1313 표 자 · 읽기만)
// === scripts/t1313-arms.js — T1313 팔 여럿(끔 · T1266 + T1271 · + T1293 · + T1313 ⓑ · + ⓑ + λ)의 판 요약 — 칸 셈은 `t1266-table.js` 함수 그대로(사본 0) ==========
//   쓰는 법: node scripts/t1313-arms.js <이름=머리> [<이름=머리> …] [--md 표.md] [--json 요약.json] [--ten]
//     머리 = 판 JSON 경로에서 `.json` 을 뗀 것(곁 관찰기 JSON: t1243 · t1256 · t1266 · t1293 · t1313)
//   칸:
//     · 원석 kg/날 · 재고 끝 ÷ 녹임 흐름 목표 · ÷ 값표 목표(t1293 ② 광산 마을 · 끝 날)
//     · 광물별 잠김 %(t1293 ② · T1293 보고 §3 그 셈): 광산 마을 · 그 광물 녹이는 날(흐름 목표 ≥ 1) 가운데 값표 목표 < 흐름 목표 ÷ 2 ∧ 곳간 ≥ 값표 목표 ∧ 그날 캔 것 0 인 날의 몫
//     · 광물별 캔 단위(t1256 `bodyInY` 날 2 ~ 끝) · 교역 나간 원석(t1313 ② 온 마을 합)
//     · 녹임 누계 · 청동 무기 누계(t1256 끝 날 머리) · 광부 몸 채광 %(t1256 표본) · 어획(t1313 ① 온 마을 어제 생선 산출 · 날 2 ~ 끝 하루 평균)
//     · 하루 CPU(t1243 `cpu` 줄 — 날 2 ~ 끝 하루 평균 · 판 합 · 날 52 ÷ 51 · 날 21 뒤 가장 큰 앞날 대비 뜀) · 인구 · 소멸(판 JSON)
const fs = require('fs');
const T = require('./t1266-table.js');
const args = process.argv.slice(2), arms = [], opt = {};
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
for (let i = 0; i < args.length; i++) { if (args[i] === '--md' || args[i] === '--json') opt[args[i].slice(2)] = args[++i]; else if (args[i] === '--ten') opt.ten = true; else { const [n, h] = args[i].split('='); const X = T.load(h); X.s = rd(h + '.t1293.json'); X.q = rd(h + '.t1313.json'); X.h = h; arms.push([n, X]); } }
if (!arms.length) { console.error('쓰는 법: node scripts/t1313-arms.js <이름=머리> … [--md 표.md] [--json 요약.json] [--ten]'); process.exit(2); }
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const f0 = T.f0, f1 = T.f1, f2 = T.f2, pc = T.pc;
const MIN = ['ore_tin', 'ore_lead', 'ore_silver', 'ore_copper'];
const lastOf = (X) => { try { return Math.max(...Object.keys(X.a.day).map(Number)); } catch (e) { return 0; } };
function oreEnd(X, d) {   // t1293 ② 끝 날 광산 마을 합 — 곳간 · 값표 목표 · 흐름 목표
  const D = X.s && X.s.ore && X.s.ore[d]; if (!D) return null; let st = 0, tg = 0, fl = 0;
  for (const V of Object.values(D)) for (const q of Object.values(V.o || {})) { st += q[0]; tg += q[1] || 0; fl += q[2] || 0; }
  return { st, tg, fl };
}
function lock(X, from) {   // 광물별 잠김 %(T1293 §3 셈)
  const A = X.a, I = (n) => A.dcols.indexOf(n), S = X.s; if (!S || !S.ore) return null;
  const prodOf = (d, vn, k) => { const rows = A.day[d + 1]; if (!rows) return null; const r = rows.find((q) => q[0] === vn); return r ? ((r[I('bodyInY')] || {})[k] || 0) : 0; };
  const o = {}; for (const k of MIN) o[k] = { melt: 0, lock: 0 }; const all = { melt: 0, lock: 0 };
  const days = Object.keys(S.ore).map(Number).filter((d) => d >= from).sort((a, b) => a - b);
  for (const d of days) for (const [vn, V] of Object.entries(S.ore[d] || {})) for (const [k, [s, t, f]] of Object.entries(V.o || {})) {
    if (!(f >= 1) || t == null) continue; const p = prodOf(d, vn, k); if (p == null) continue;
    const lk = t < f / 2 && s >= t && p === 0; all.melt++; if (lk) all.lock++;
    if (o[k]) { o[k].melt++; if (lk) o[k].lock++; }
  }
  return { all, o };
}
function dug(X) { const A = X.a, I = (n) => A.dcols.indexOf(n), L = lastOf(X), t = {}; for (let d = 2; d <= L; d++) { const rows = A.day[d]; if (!rows) continue; for (const r of rows) { const b = r[I('bodyInY')] || {}; for (const k in b) t[k] = (t[k] || 0) + b[k]; } } return t; }
function trade(X) { const F = X.q && X.q.flow; if (!F) return null; const t = {}; for (const V of Object.values(F)) for (const [k, o] of Object.entries(V)) t[k] = (t[k] || 0) + (o.out || 0); return t; }
function fish(X) {   // t1313 ① 어제 어획 — 날 2 ~ 끝 하루 평균(온 마을 합)
  const D = X.q && X.q.day; if (!D) return null; const c = X.q.vcols.indexOf('fishY'); let s = 0, n = 0;
  for (const [d, V] of Object.entries(D)) { if (+d < 2) continue; let x = 0; for (const r of Object.values(V)) x += r[c] || 0; s += x; n++; }
  return n ? s / n : null;
}
function cpu(X) {
  const c = X.c && X.c.cpu; if (!c) return null; const m = new Map(c.map((q) => [q[0], q[1]])); let tot = 0, n = 0; for (const [d, v] of c) if (d >= 2) { tot += v; n++; }
  let jump = null; for (const [d, v] of c) { if (d <= 21) continue; const p = m.get(d - 1); if (p > 0 && v > 0 && (!jump || v / p > jump.r)) jump = { d, r: v / p, from: p, to: v }; }
  return { tot, n, d51: m.get(51), d52: m.get(52), jump, last: c.length ? c[c.length - 1][0] : null };
}
const S = {};
for (const [n, X] of arms) {
  const s = T.summary(X), L = s.last, oe = oreEnd(X, L), lk = lock(X, 11), dg = dug(X), tr = trade(X), fi = fish(X), cp = cpu(X);
  S[n] = { last: L, kgDay: s.kgDay, oreStock: s.oreStock, smelt: s.smelt, bronze: s.bronze, t66: s.t66, st: s.st, sw: s.sw, pop: X.j && X.j.eight ? X.j.eight.pop : null, dead: X.j && X.j.eight ? X.j.eight.dead : null,
    stFlow: oe && oe.fl ? oe.st / oe.fl : null, stVal: oe && oe.tg ? oe.st / oe.tg : null, lock: lk, dug: dg, trade: tr, fish: fi, cpu: cp };
}
const out = [];
const head = '| 칸 | ' + arms.map((a) => a[0]).join(' | ') + ' |', sep = '|---|' + arms.map(() => '---:').join('|') + '|';
out.push(head, sep);
const line = (name, fn) => out.push('| ' + name + ' | ' + arms.map(([n]) => { try { return fn(S[n]); } catch (e) { return '—'; } }).join(' | ') + ' |');
const lp = (s, k) => s.lock && s.lock.o[k] && s.lock.o[k].melt ? pc(s.lock.o[k].lock / s.lock.o[k].melt) + ' %' : '—';
line('끝 날', (s) => s.last);
line('몸 원석 kg/날(날 2 ~ 끝)', (s) => f1(s.kgDay));
line('원석 재고 끝 ÷ 녹임 흐름 목표 · ÷ 값표 목표', (s) => `${f2(s.stFlow)} · ${f2(s.stVal)}`);
line('잠김 % — 주석 · 납 · 은 · 구리', (s) => MIN.map((k) => lp(s, k)).join(' · '));
line('잠김 % — 녹이는 품목-날 다', (s) => s.lock && s.lock.all.melt ? pc(s.lock.all.lock / s.lock.all.melt) + ' %' : '—');
line('캔 원석 단위 — 주석 · 납 · 은 · 구리', (s) => MIN.map((k) => f0((s.dug || {})[k] || 0)).join(' · '));
line('교역 나간 원석 단위 — 주석 · 납 · 은 · 구리', (s) => s.trade ? MIN.map((k) => f1(s.trade[k] || 0)).join(' · ') : '—');
line('노 녹임 누계(원석 단위)', (s) => f1(s.smelt));
line('청동 무기 누계', (s) => f2(s.bronze));
line('한 시간 물음 · 멈춤', (s) => s.t66 ? `${f0(s.t66.hours)} · ${f0(s.t66.stop)}` : '—');
line('광부 몸 채광 · 쉼 %', (s) => s.st ? `${pc(s.st.mine)} · ${pc(s.st.rest)}` : '—');
line('어획(온 마을 · 하루 평균 단위)', (s) => f1(s.fish));
line('하루 CPU 평균 · 판 합(날 2 ~ 끝 · 초)', (s) => s.cpu ? `${f1(s.cpu.tot / Math.max(1, s.cpu.n))} · ${f0(s.cpu.tot)}` : '—');
line('하루 CPU 날 52 ÷ 51', (s) => s.cpu && s.cpu.d51 ? (s.cpu.d52 / s.cpu.d51).toFixed(2) : '—');
line('가장 큰 하루 CPU 뜀(날 21 뒤)', (s) => s.cpu && s.cpu.jump ? `날 ${s.cpu.jump.d} ×${s.cpu.jump.r.toFixed(2)}(${f1(s.cpu.jump.from)} → ${f1(s.cpu.jump.to)})` : '—');
line('인구(판 JSON) · 소멸', (s) => `${s.pop == null ? '—' : f0(s.pop)} · ${s.dead == null ? '—' : s.dead}`);
if (opt.ten) {   // 10날 칸 — 녹임 · 청동 · kg/날 · 채광 %
  for (const [n, X] of arms) {
    const L = lastOf(X), ds = []; for (let d = 10; d <= L; d += 10) ds.push(d);
    out.push('', `#### ${n} — 10날`, '', '| 날 | ' + ds.join(' | ') + ' |', '|---|' + ds.map(() => '---:').join('|') + '|');
    const rows = { 'kg/날': (c) => f1(c.kgDay), '녹임': (c) => f1(c.smelt), '청동': (c) => f2(c.bronze), '채광 · 쉼 %': (c) => c.st ? pc(c.st.mine) + ' · ' + pc(c.st.rest) : '—', '물음 · 멈춤': (c) => c.hours == null ? '—' : f0(c.hours) + ' · ' + f0(c.stop), 'CPU': (c) => f1(c.cpu) };
    for (const [nm, fn] of Object.entries(rows)) out.push('| ' + nm + ' | ' + ds.map((d) => { const c = T.cells(X, d); return c ? fn(c) : '—'; }).join(' | ') + ' |');
  }
}
const md = out.join('\n'); console.log(md);
if (opt.md) fs.writeFileSync(opt.md, md + '\n');
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(S, null, 1));
