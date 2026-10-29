#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T956 표 기계 · 판 관찰 JSON 만 읽는다)
// === scripts/t956-war-table.js — 끝나지 않는 전쟁 관찰기(`scripts/t956-war-probe.js`) 표 =====================================
//
//   node scripts/t956-war-table.js <판>.t956.json [--long N] [--days 전쟁id,…] [--json 출력.json]
//     ① 전쟁마다 한 줄 — 시작 · 끝 · 날 · 교전 든 날 · 나선 쪽(돌격 A · 출격 B) · 접촉 · 대치 · 출격 결단 · 헛걸음 버티기 · 정산
//     ② 긴 전쟁(날 ≥ N · 기본 30 — 표를 거르는 문턱일 뿐 세계 수가 아니다)마다 대치 한 번씩의 꼴 — 누가 나섰나 · 풀렸나 · 행군로 진척 ·
//        두 본대 간격 · 맞선 두 몸 최소 거리 · 측마다 상태 분포
//     ③ `--days` 전쟁의 날별 덤프 — 결단(앞 → 뒤 작전 · 태세 · 출격 · 헛걸음) · 승산 둘 · 교전(걸음 · 접촉 걸음 · 대치 · 궤주) ·
//        측마다 생존 · 싸우는 수 · 궤주 · 사기 평균/최저 · hp 합(그날 첫 표본 → 끝 표본) · 화살 · 상태 분포
//   판정 0 — 표만.
const fs = require('fs');
const args = process.argv.slice(2);
const F = args.find((a) => !a.startsWith('--') && /\.json$/.test(a));
if (!F) { console.error('쓰는 법: node scripts/t956-war-table.js <판>.t956.json [--long N] [--days id,…] [--json out]'); process.exit(2); }
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LONG = +opt('--long', 30);
const DUMP = (opt('--days', '') || '').split(',').filter(Boolean).map(Number);
const OUTJ = opt('--json', '');
const R = JSON.parse(fs.readFileSync(F, 'utf8'));
const wars = Object.values(R.wars).sort((a, b) => a.id - b.id);
const lastDay = Math.max(0, ...wars.map((o) => Math.max(...Object.keys(o.days).map(Number))));
const stTop = (st, k) => Object.entries(st || {}).sort((a, b) => b[1] - a[1]).slice(0, k || 4).map(([s, n]) => `${s}×${n}`).join(' ');
function summ(o) {
  const days = Object.keys(o.days).map(Number).sort((a, b) => a - b);
  const first = o.first != null ? o.first : days[0], end = o.end;
  const len = (end != null ? end : lastDay + 1) - first;
  let bDays = 0, sortieD = 0, missD = 0, contacts = 0, cSteps = 0, eSteps = 0, steps = 0;
  for (const d of days) { const x = o.days[d]; if (x.fight && x.fight.steps) { bDays++; steps += x.fight.steps; cSteps += x.fight.cSteps; eSteps += x.fight.eSteps; }
    if (x.post && x.post.so && !(x.pre && x.pre.so)) sortieD++;
    if (x.pre && x.pre.sm != null) missD++; }
  const advA = o.eng.filter((e) => e.adv === 'A').length, advB = o.eng.filter((e) => e.adv === 'B').length;
  const lastSo = o.so.length ? o.so[o.so.length - 1] : null;
  for (const e of o.so) contacts = Math.max(contacts, e.contacts || 0);
  const lastFight = days.map((d) => o.days[d].fight).filter(Boolean).pop();
  const set = o.set.map((s) => `${s.why}${s.winner ? ':' + s.winner : ''}@${s.day}`).join(' ');
  const hooks = {}; for (const h of o.hook) hooks[h.why] = (hooks[h.why] || 0) + 1;
  return { id: o.id, atk: o.atk, def: o.def, casus: o.casus, force: o.force, first, end, len, bDays, steps, cSteps, eSteps, advA, advB, so: o.so.length, contacts, sortieD, missD, hooks, set,
    endSt: lastFight && lastFight.last ? lastFight.last.st : null };
}
const S = wars.map(summ);
console.log(`판 ${F} · 시드 ${R.seed} · 전쟁 ${wars.length} · 관찰 끝 날 ${lastDay} · 관찰 오류 ${R.errs}${R.err0 ? ' (' + R.err0.split('\n')[0] + ')' : ''}`);
console.log('\n## ① 전쟁마다');
console.log('| id | 공격 → 방어 | 명분 | 병력 | 시작 | 끝 | 날 | 교전 든 날 | 걸음 · 접촉 걸음 · 맞붙은 걸음 | 나선 쪽 A · B | 대치 | 접촉(누계) | 출격 결단 날 | 헛걸음 → 버티기 날 | 훅 | 정산 | 끝 상태 |');
console.log('|---|---|---|---:|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---|---|---|');
for (const s of S) console.log(`| ${s.id} | ${s.atk} → ${s.def} | ${s.casus} | ${s.force} | ${s.first} | ${s.end != null ? s.end : '(진행)'} | ${s.len} | ${s.bDays} | ${s.steps} · ${s.cSteps} · ${s.eSteps} | ${s.advA} · ${s.advB} | ${s.so} | ${s.contacts} | ${s.sortieD} | ${s.missD} | ${Object.entries(s.hooks).map(([k, n]) => k + ' ' + n).join(' · ')} | ${s.set || '—'} | ${s.endSt || '—'} |`);
const longs = S.filter((s) => s.len >= LONG);
console.log(`\n## ② 긴 전쟁(날 ≥ ${LONG}) — 대치 꼴`);
const soKind = {};
for (const s of longs) {
  const o = R.wars[s.id];
  const kinds = {};
  for (const e of o.so) {
    const b = e.before || {};
    const adv = b.adv ? `${b.adv.side}${b.adv.rel ? '풀림' : '안풀림'}` : '-';
    const k = `${adv}`; kinds[k] = (kinds[k] || 0) + 1;
  }
  soKind[s.id] = kinds;
  console.log(`* ${s.id} ${s.atk} → ${s.def} · ${s.len}날 · 대치 ${s.so} · 접촉 ${s.contacts} · 나선 쪽 A ${s.advA} · B ${s.advB} · 대치 앞 전진 쪽(풀림?) ${Object.entries(kinds).map(([k, n]) => k + ' ' + n).join(' · ')}`);
  const pick = o.so.slice(0, 2).concat(o.so.length > 4 ? [o.so[Math.floor(o.so.length / 2)], o.so[o.so.length - 1]] : o.so.slice(2));
  for (const e of pick) { const b = e.before || {};
    console.log(`  - D${e.day} t${e.t} 대치 앞 상태 ${e.pre.st} · 진척 시계 접촉 ${e.pre.ctT} 진척 ${e.pre.gpT} · 최소 간격 ${e.pre.best} · 문턱 ${e.sec}초 · 본대 간격 ${b.gap} · 맞선 몸 최소 ${b.mc} · 전진 ${b.adv ? JSON.stringify(b.adv) : '-'} · 지킴 ${b.holder}`);
    if (b.A) console.log(`    A ${b.A.n}명(싸움 ${b.A.f} · 궤주 ${b.A.r} · 대형 ${b.A.c} · 제자리 ${b.A.still}) 사기 ${b.A.m}/${b.A.mMin} 화살 ${b.A.ar} · ${stTop(b.A.st, 5)}`);
    if (b.B) console.log(`    B ${b.B.n}명(싸움 ${b.B.f} · 궤주 ${b.B.r} · 대형 ${b.B.c} · 제자리 ${b.B.still}) 사기 ${b.B.m}/${b.B.mMin} 화살 ${b.B.ar} · ${stTop(b.B.st, 5)}`);
  }
}
function dayRow(o, d) {
  const x = o.days[d]; if (!x) return null;
  const p = x.pre || {}, q = x.post || {}, f = x.fight;
  const fa = f && f.first, la = f && f.last;
  const sd = (s0, s1, k) => (s0 && s1) ? `${s1[k].n}명(싸움 ${s1[k].f} · 궤주 ${s1[k].r}) 사기 ${s1[k].m}/${s1[k].mMin} hp ${s0[k].hp}→${s1[k].hp} 화살 ${s1[k].ar} · ${stTop(s1[k].st, 3)}` : '-';
  return { d, dec: `${p.ph || '-'}/${p.op || '-'} → ${q.ph || '-'}/${q.op || '-'} · 태세 ${q.dm || '-'} · 출격 ${q.so ? 1 : 0} · 헛걸음 ${p.sm != null ? p.sm : '-'}`, odds: `${x.pWin}/${x.pDef}`,
    fight: f ? `걸음 ${f.steps} · 접촉 ${f.cSteps} · 맞붙음 ${f.eSteps} · 전진 ${f.aSteps} · 새 접촉 ${f.newC} · 대치 ${f.so} · 궤주 ${f.rout || '-'} · 풀림 ${f.relT != null ? f.relT : '-'} · 맞선 몸 최소 ${f.mcMin}` : '-',
    A: sd(fa, la, 'A'), B: sd(fa, la, 'B'), body: x.body ? `A원점↔마을 ${x.body.agVc} · A↔B ${x.body.agDg} · A↔주둔 ${x.body.agCamp} · 긴급 ${x.body.scram ? 1 : 0}` : '-', log: (x.log || []).slice(0, 4) };
}
for (const id of DUMP) {
  const o = R.wars[id]; if (!o) { console.log(`\n(전쟁 ${id} 없음)`); continue; }
  console.log(`\n## ③ 전쟁 ${id} ${o.atk} → ${o.def} · 날별`);
  for (const d of Object.keys(o.days).map(Number).sort((a, b) => a - b)) {
    const r = dayRow(o, d); if (!r) continue;
    console.log(`D${d} | ${r.dec} | 승산 ${r.odds} | ${r.fight}`);
    if (r.A !== '-') console.log(`      A ${r.A}`);
    if (r.B !== '-') console.log(`      B ${r.B}`);
    if (r.body !== '-') console.log(`      몸 ${r.body}`);
    for (const l of r.log) console.log(`      글 ${l}`);
  }
}
if (OUTJ) {
  const out = { src: F, seed: R.seed, lastDay, errs: R.errs, wars: S, long: longs.map((s) => s.id), soKind,
    dump: Object.fromEntries(longs.map((s) => [s.id, Object.keys(R.wars[s.id].days).map(Number).sort((a, b) => a - b).map((d) => dayRow(R.wars[s.id], d))])) };
  fs.writeFileSync(OUTJ, JSON.stringify(out));
  console.log(`\n⇒ ${OUTJ}`);
}
