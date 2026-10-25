#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T924 표 기계 · 세계 안 만짐 · 판정 0)
// === scripts/t924-table.js — `t924-observe.js` 가 남긴 `<판>-<시드>.t924.json` 을 읽어 표로 ===
//   node scripts/t924-table.js <dir> [--json out.json] [--md]
//   ① 빚 — 틱 뒤 `_dPAccum ≤ −1`(그날 못 치른 빚)이 이어진 마을 · 그 빚이 풀린 날(틱 뒤 > −1 이 된 첫날) 죽음 · 그날 곳간
//   ② 건강 · 행복 — 마을-날을 넷으로 가른다(전쟁 뒤 366일~ · 인구 ≥ 5):
//        G0 징발 0 · G1 징발 있고 자유민 ≥ 3 · G2 징발 있고 자유민 1 ~ 2 · G3 자유민 0(묶임)
//      묶음마다 항 평균(건강 = 곳간 재고 + 식단 + 땔감 + 한랭·옷 + 가죽 · 행복 = 곳간 재고 + 식단 + 여가 + 한랭·옷 + 가죽) ·
//      항 음 몫 · 먹는 사람 수(N − 짐꾼)로 부른 값 · 자유민 1인당 dP · 품목별 몫(G2 · G3)
//   ③ 원정 — 전쟁마다 선포 → 해제(목록에서 사라진 날) 길이 · 국면별 날(행군 · 주둔/포위 · 교전 · 귀환) · 징발 사람-날
'use strict';
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || '.';
const CAL = require(path.join(__dirname, '..', 'server', 'calendar.js'));   // 달 = 정본 달력(`dateOf` · 게임일 0 = 1년 3월 1일)
const JOUT = (() => { const i = process.argv.indexOf('--json'); return i > 0 ? process.argv[i + 1] : null; })();
const files = fs.readdirSync(dir).filter((f) => /-(\d+)\.t924\.json$/.test(f)).sort();
const seedOf = (f) => +/-(\d+)\.t924\.json$/.exec(f)[1];
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => { const s = a.filter(Number.isFinite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
const f2 = (x, d = 2) => (x == null ? '—' : (+x).toFixed(d));
const out = { dir, seeds: {} };
const FROM = +process.env.T924_FROM || 366;
function analyse(o) {
  const C = {}; o.cols.forEach((c, i) => { C[c] = i; });
  const res = { debt: [], groups: {}, wars: [], errs: o.errs, err0: o.err0, chkBad: o.chkBad, massFood: [] };
  // ① 빚
  for (const [name, rows] of Object.entries(o.v)) {
    let i = 0;
    while (i < rows.length) {
      //   못 치른 빚 = 틱 뒤 빚 ≤ −1 · 사람은 있다 · 자유민 0(고리가 몸이 없어 멈췄다 — 자유민이 있으면 고리가 −1 위까지 치른다 · 3자리 반올림 −1.000 은 −0.9996 일 수 있어 자유민 0 으로 가른다)
      const blk = (r) => r[C.a1] != null && r[C.a1] <= -1 && r[C.pop] > 0 && r[C.free] === 0;
      if (blk(rows[i])) {
        let j = i; while (j + 1 < rows.length && blk(rows[j + 1])) j++;
        let peak = 0, ph = 0; for (let k = i; k <= j; k++) { peak = Math.min(peak, rows[k][C.a1]); ph += rows[k][C.deathsToday]; }
        const rel = rows[j + 1] || null;
        res.debt.push({ name, from: rows[i][C.day], to: rows[j][C.day], len: j - i + 1, peak, pop0: rows[i][C.pop], dr0: rows[i][C.drafted], phantom: ph,
          rel: rel ? { day: rel[C.day], a0: rel[C.a0], deaths: rel[C.deathsToday], pop0: rel[C.pop0], pop: rel[C.pop], tfe: rel[C.tfe], free: rel[C.free], drafted: rel[C.drafted] } : null });
        i = j + 1;
      } else i++;
    }
    // 곳간이 찬 날 한꺼번에 죽음 — 하루 죽음 ≥ 3 · 곳간 식량 환산 ≥ 인구 × 10
    for (const r of rows) if (r[C.deathsToday] >= 3 && r[C.tfe] >= Math.max(1, r[C.pop0]) * 10) res.massFood.push({ name, day: r[C.day], deaths: r[C.deathsToday], pop0: r[C.pop0], tfe: r[C.tfe], a0: r[C.a0], free: r[C.free], drafted: r[C.drafted] });
  }
  // ② 건강 · 행복
  const G = { G0: [], G1: [], G2: [], G3: [] };
  for (const rows of Object.values(o.v)) for (const r of rows) {
    if (r[C.day] < FROM || r[C.pop] < 5 || r[C.health] == null) continue;
    const g = r[C.drafted] === 0 ? 'G0' : r[C.free] >= 3 ? 'G1' : r[C.free] >= 1 ? 'G2' : 'G3';
    G[g].push(r);
  }
  for (const [g, R] of Object.entries(G)) {
    const col = (k) => R.map((r) => r[C[k]]);
    const Rc = R.filter((r) => r[C.chk] === 0);   // 가른 값 = econ 값인 줄만(항목 몫 평균) — 다른 줄 수는 `chkBad`
    const colc = (k) => Rc.map((r) => r[C[k]]);
    const it = {}; let itN = 0;
    if (g === 'G2' || g === 'G3' || g === 'G0') for (const r of R) { const m = r[C.items]; if (!m) continue; itN++; for (const [k, v] of Object.entries(m)) { const e = it[k] || (it[k] = [0, 0]); e[0] += v[0]; e[1] += v[1]; } }
    const itAvg = Object.fromEntries(Object.entries(it).map(([k, v]) => [k, [+(v[0] / Math.max(1, itN)).toFixed(4), +(v[1] / Math.max(1, itN)).toFixed(4)]]).sort((a, b) => Math.abs(b[1][0]) + Math.abs(b[1][1]) - Math.abs(a[1][0]) - Math.abs(a[1][1])).slice(0, 12));
    res.groups[g] = {
      n: R.length, health: mean(col('health')), happiness: mean(col('happiness')),
      healthNeg: R.filter((r) => r[C.healthT] < 0).length, happyNeg: R.filter((r) => r[C.happyT] < 0).length, hunger0: R.filter((r) => !r[C.hunger]).length, dPneg: R.filter((r) => r[C.dP] < 0).length,
      h: { stor: mean(colc('h_stor')), div: mean(colc('h_div')), fuel: mean(colc('h_fuel')), cold: mean(colc('h_cold')), lg: mean(colc('h_lg')), sum: mean(colc('health')) },
      p: { stor: mean(colc('p_stor')), div: mean(colc('p_div')), leis: mean(colc('p_leis')), cold: mean(colc('p_cold')), lg: mean(colc('p_lg')), sum: mean(colc('happiness')) }, nChk: Rc.length,
      hEat: mean(col('h_eat')), pEat: mean(col('p_eat')),
      fuelCov: mean(col('fuelCov')), foodGroups: mean(col('foodGroups')), leisure: mean(col('leisure')), clothCov: mean(col('clothCov')),
      terms: { logi: mean(col('logi')), hunger: mean(col('hunger')), health: mean(col('healthT')), happy: mean(col('happyT')), prestige: mean(col('prestigeT')), dP: mean(col('dP')) },
      dPperFree: mean(R.filter((r) => r[C.free] > 0).map((r) => r[C.dP] / r[C.free])),
      pop: mean(col('pop')), free: mean(col('free')), drafted: mean(col('drafted')), packers: mean(col('packers')), tfePerPop: mean(R.map((r) => r[C.tfe] / Math.max(1, r[C.pop]))),
      deaths: R.reduce((s, r) => s + r[C.deathsToday], 0), items: itAvg, itemRows: itN,
    };
  }
  // ②-b 곳간 찬 날 죽음 — 하루 죽음이 난 마을-날 중 곳간 식량 환산 ≥ 틱 머리 인구 × 10 · 그날 K 를 묶은 칸 · 항(죽음 가중) · 징발 마을이면 집에 있는 사람만 센 N/K
  { const F = { deathsAll: 0, deaths: 0, rows: 0, bind: { slot: 0, prod: 0, fuel: 0 }, nk: { '<1': 0, '1~1.1': 0, '1.1~1.3': 0, '≥1.3': 0 }, terms: { logi: 0, hunger: 0, health: 0, happy: 0, prestige: 0, dP: 0 },
      drafted: 0, homeUnder: 0, vdD: 0, vdN: 0, dD: 0, dN: 0, month: {}, slotDrop: 0 };
    for (const rows of Object.values(o.v)) for (let ri = 0; ri < rows.length; ri++) { const r = rows[ri];
      if (r[C.day] < FROM) continue;
      const big = r[C.pop] >= 5 || r[C.pop0] >= 5, dr = r[C.drafted] > 0, d = r[C.deathsToday];
      if (big) { if (dr) { F.vdD++; F.dD += d; } else { F.vdN++; F.dN += d; } }
      if (!d) continue; F.deathsAll += d;
      if (!(r[C.tfe] >= Math.max(1, r[C.pop0]) * 10)) continue;
      F.deaths += d; F.rows++;
      { const mo = CAL.dateOf(r[C.day]).month; F.month[mo] = (F.month[mo] || 0) + d; }
      if (ri > 0 && rows[ri - 1][C.kSlot] != null && r[C.kSlot] < rows[ri - 1][C.kSlot]) F.slotDrop += d;   // 그날 식량 자리(slotK)가 전날보다 줄었다
      const m = Math.min(r[C.kSlot], r[C.kProd], r[C.kFuel]); F.bind[m === r[C.kFuel] ? 'fuel' : m === r[C.kProd] ? 'prod' : 'slot'] += d;
      const nk = r[C.pop0] / Math.max(1, r[C.K]); F.nk[nk < 1 ? '<1' : nk < 1.1 ? '1~1.1' : nk < 1.3 ? '1.1~1.3' : '≥1.3'] += d;
      F.terms.logi += (r[C.logi] || 0) * d; F.terms.hunger += (r[C.hunger] || 0) * d; F.terms.health += (r[C.healthT] || 0) * d; F.terms.happy += (r[C.happyT] || 0) * d; F.terms.prestige += (r[C.prestigeT] || 0) * d; F.terms.dP += (r[C.dP] || 0) * d;
      if (dr) { F.drafted += d; if ((r[C.pop0] - r[C.drafted]) / Math.max(1, r[C.K]) < 1) F.homeUnder += d; }
    }
    for (const k in F.terms) F.terms[k] = F.deaths ? F.terms[k] / F.deaths : null;
    res.fullFood = F; }
  // ③ 원정
  for (const w of Object.values(o.wars)) {
    const tl = w.tl; if (!tl.length) continue;
    const end = w.end != null ? w.end : null, born = w.born != null ? w.born : w.first;
    let march = 0, camp = 0, siege = 0, battle = 0, ret = 0, atkPD = 0, defPD = 0, maxAtk = 0, maxDef = 0, arrive = null, retFrom = null, ops = [];
    let bAdv = 0, bEng = 0, bForm = 0, fightMax = 0, contacts = 0, standoffs = 0, pack0 = 0;
    for (const e of tl) {
      const [d, ph, op, sg, ad, dd, pr] = e, fs = e[11], ft = e[12];
      if (ft != null && ft > fightMax) fightMax = ft; if (e[13] != null) contacts = Math.max(contacts, e[13]); if (e[14] != null) standoffs = Math.max(standoffs, e[14]);
      if (ph === 1) { if (op === 1) march++; else if (op === 3 || sg) siege++; else camp++; if (op >= 2 && arrive == null) arrive = d; }
      else if (ph === 2) { battle++; if (fs === 3) bEng++; else if (fs === 2) bAdv++; else bForm++; } else if (ph === 3) { ret++; if (retFrom == null) retFrom = d; }
      if (ph !== 3 && pr != null && pr <= 0) pack0++;
      atkPD += ad; defPD += dd; maxAtk = Math.max(maxAtk, ad); maxDef = Math.max(maxDef, dd);
      const tag = ph === 2 ? 'B' : ph === 3 ? 'R' : ['?', 'M', 'C', 'S', 'A', 'W'][op] || '?'; if (!ops.length || ops[ops.length - 1][0] !== tag) ops.push([tag, d]);
    }
    res.wars.push({ id: w.id, atk: w.atk, def: w.def, casus: w.casus, force: w.force, draftN: w.draftN, marchDays: w.marchDays, born, first: w.first, end, len: end != null ? end - born : null, open: end == null,
      march, camp, siege, battle, ret, arrive, retFrom, atkPD, defPD, maxAtk, maxDef, bAdv, bEng, bForm, fightMax, contacts, standoffs, pack0, ops: ops.map((x) => x[0] + x[1]).join(' ') });
  }
  return res;
}
const lines = [];
const P = (s) => lines.push(s);
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const a = analyse(o); out.seeds[seedOf(f)] = a;
}
// ① 표
P('## ① 빚 — 틱 뒤 `_dPAccum ≤ −1` · 자유민 0 · 사람 있음(고리가 몸이 없어 멈춘 날 = 못 치른 빚)이 이어진 마을 · 풀린 날');
P('| 시드 | 빚 남은 마을-구간 | 빚 남은 날 합 | 가장 깊은 빚 | 풀린 날 죽음 합 | 풀린 날 한 마을 최대 죽음 | 풀린 날 곳간 ≥ 인구×10 인 구간 | 곳간 찬 날 한꺼번에(≥3) 죽음 |');
P('|---|---|---|---|---|---|---|---|');
for (const [s, a] of Object.entries(out.seeds)) {
  const D = a.debt, rel = D.filter((d) => d.rel);
  P(`| ${s} | ${D.length} | ${D.reduce((x, d) => x + d.len, 0)} | ${f2(Math.min(0, ...D.map((d) => d.peak)), 1)} | ${rel.reduce((x, d) => x + d.rel.deaths, 0)} | ${Math.max(0, ...rel.map((d) => d.rel.deaths))} | ${rel.filter((d) => d.rel.tfe >= Math.max(1, d.rel.pop0) * 10).length} | ${a.massFood.length} 번 · ${a.massFood.reduce((x, m) => x + m.deaths, 0)} 명 |`);
}
P('');
for (const [s, a] of Object.entries(out.seeds)) for (const d of a.debt.filter((x) => x.len >= 3 || (x.rel && x.rel.deaths >= 2))) P(`  시드 ${s} ${d.name} ${d.from}~${d.to}일(${d.len}일) 인구 ${d.pop0}(징발 ${d.dr0}) · 가장 깊은 빚 ${f2(d.peak, 1)} · 셈만 ${d.phantom}` + (d.rel ? ` → ${d.rel.day}일 풀림: 틱 앞 빚 ${f2(d.rel.a0, 1)} · 죽음 ${d.rel.deaths}(인구 ${d.rel.pop0} → ${d.rel.pop}) · 곳간 ${f2(d.rel.tfe, 0)} · 자유민 ${d.rel.free} · 징발 ${d.rel.drafted}` : ' (끝까지 안 풀림)'));
P('');
// ② 표
P('## ② 건강 · 행복 — 마을-날 묶음(366일~ · 인구 ≥ 5)');
P('| 시드 | 묶음 | 마을-날 | 건강 | 행복 | 건강 항 음 | 행복 항 음 | 굶주림 항 0 | dP 음 | 자유민 1인당 dP | 곳간/인구 | 땔감 충당 | 식품군 | 먹는 사람 수로(건강 · 행복) | 그날 죽음 |');
P('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [s, a] of Object.entries(out.seeds)) for (const [g, x] of Object.entries(a.groups)) {
  if (!x.n) { P(`| ${s} | ${g} | 0 | | | | | | | | | | | | |`); continue; }
  P(`| ${s} | ${g} | ${x.n} | ${f2(x.health, 3)} | ${f2(x.happiness, 3)} | ${x.healthNeg} | ${x.happyNeg} | ${x.hunger0} | ${x.dPneg} | ${f2(x.dPperFree, 3)} | ${f2(x.tfePerPop, 1)} | ${f2(x.fuelCov, 2)} | ${f2(x.foodGroups, 2)} | ${f2(x.hEat, 3)} · ${f2(x.pEat, 3)} | ${x.deaths} |`);
}
P('');
P('| 시드 | 묶음 | 건강 = 곳간 재고 + 식단 + 땔감 + 한랭·옷 + 가죽(가른 값 = econ 값인 줄) | 행복 = 곳간 재고 + 식단 + 여가 + 한랭·옷 + 가죽 | 항(로지스틱 · 굶주림 · 건강 · 행복 · 위신 · dP) | 인구 · 자유민 · 징발 · 짐꾼 |');
P('|---|---|---|---|---|---|');
for (const [s, a] of Object.entries(out.seeds)) for (const [g, x] of Object.entries(a.groups)) {
  if (!x.n) continue;
  P(`| ${s} | ${g} | ${f2(x.h.sum, 3)} = ${f2(x.h.stor, 3)} + ${f2(x.h.div, 3)} + ${f2(x.h.fuel, 3)} + ${f2(x.h.cold, 3)} + ${f2(x.h.lg, 3)} | ${f2(x.p.sum, 3)} = ${f2(x.p.stor, 3)} + ${f2(x.p.div, 3)} + ${f2(x.p.leis, 3)} + ${f2(x.p.cold, 3)} + ${f2(x.p.lg, 3)} | ${f2(x.terms.logi, 3)} · ${f2(x.terms.hunger, 3)} · ${f2(x.terms.health, 3)} · ${f2(x.terms.happy, 3)} · ${f2(x.terms.prestige, 3)} · ${f2(x.terms.dP, 3)} | ${f2(x.pop, 1)} · ${f2(x.free, 1)} · ${f2(x.drafted, 1)} · ${f2(x.packers, 1)} |`);
}
P('');
for (const [s, a] of Object.entries(out.seeds)) for (const g of ['G0', 'G2', 'G3']) { const x = a.groups[g]; if (!x || !x.itemRows) continue; P(`  시드 ${s} ${g} 품목 몫(건강 · 행복 · 줄 ${x.itemRows}): ` + Object.entries(x.items).map(([k, v]) => `${k} ${v[0]} · ${v[1]}`).join(' / ')); }
P('');
P('## ②-b 곳간에 식량이 있는 날의 죽음 — 하루 죽음이 난 마을-날 중 곳간 식량 환산 ≥ 틱 머리 인구 × 10(366일~)');
P('| 시드 | 366일~ 죽음 | 그중 곳간 찬 날 | 몫 | K 를 묶은 칸(식량 자리 · 식량 흐름 · 땔감) · 그날 식량 자리가 전날보다 준 죽음 | N/K(< 1 · 1~1.1 · 1.1~1.3 · ≥ 1.3) | 그날 항(죽음 가중: 로지스틱 · 굶주림 · 건강 · 행복 · 위신 · dP) | 징발 마을 몫 · 그중 집에 있는 사람만 세면 N/K < 1 | 마을-날당 죽음(인구 ≥ 5 · 징발 있음 · 없음) |');
P('|---|---|---|---|---|---|---|---|---|');
for (const [s, a] of Object.entries(out.seeds)) { const F = a.fullFood; if (!F) continue;
  P(`| ${s} | ${F.deathsAll} | ${F.deaths} | ${f2(100 * F.deaths / Math.max(1, F.deathsAll), 1)}% | ${F.bind.slot} · ${F.bind.prod} · ${F.bind.fuel} · ${F.slotDrop} | ${F.nk['<1']} · ${F.nk['1~1.1']} · ${F.nk['1.1~1.3']} · ${F.nk['≥1.3']} | ${f2(F.terms.logi, 2)} · ${f2(F.terms.hunger, 2)} · ${f2(F.terms.health, 2)} · ${f2(F.terms.happy, 2)} · ${f2(F.terms.prestige, 2)} · ${f2(F.terms.dP, 2)} | ${F.drafted} · ${F.homeUnder}(${f2(100 * F.homeUnder / Math.max(1, F.drafted), 0)}%) | ${f2(F.dD / Math.max(1, F.vdD), 3)} · ${f2(F.dN / Math.max(1, F.vdN), 3)} |`); }
for (const [s, a] of Object.entries(out.seeds)) { const F = a.fullFood; if (!F) continue; P(`  시드 ${s} 곳간 찬 날 죽음 달별(3 ~ 2월): ` + [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2].map((m) => `${m}월 ${F.month[m] || 0}`).join(' · ')); }
P('');
// ③ 표
P('## ③ 원정 — 선포 → 해제(전쟁 목록에서 사라진 날)');
P('| 시드 | 전쟁 | 끝난 것 | 길이 중앙 | 90% | 최대 | > 30일 | > 60일 | > 90일 | 행군 중앙 · 최대 | 주둔 중앙 · 최대 | 포위 중앙 · 최대 | 교전 중앙 · 최대 | 귀환 중앙 · 최대 | 공격 징발 사람-날 합 | 방어 징발 사람-날 합 |');
P('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [s, a] of Object.entries(out.seeds)) {
  const W = a.wars, E = W.filter((w) => !w.open), L = E.map((w) => w.len);
  const mm = (k) => `${q(W.map((w) => w[k]), 0.5) ?? '—'} · ${Math.max(0, ...W.map((w) => w[k]))}`;
  P(`| ${s} | ${W.length} | ${E.length} | ${q(L, 0.5) ?? '—'} | ${q(L, 0.9) ?? '—'} | ${L.length ? Math.max(...L) : '—'} | ${L.filter((x) => x > 30).length} | ${L.filter((x) => x > 60).length} | ${L.filter((x) => x > 90).length} | ${mm('march')} | ${mm('camp')} | ${mm('siege')} | ${mm('battle')} | ${mm('ret')} | ${W.reduce((x, w) => x + w.atkPD, 0)} | ${W.reduce((x, w) => x + w.defPD, 0)} |`);
}
P('');
P('| 시드 | 교전 든 전쟁 | 교전 날 합 | 그중 전진 · 맞붙음 · 대형 | 몸 싸움 시간(초) 합 | 교전 하루당 몸 시간(초 · 중앙 · 최소 ~ 최대) | 실제 날(24분)로 친 교전 날 합 | 짐 0 인 날(귀환 앞) 합 |');
P('|---|---|---|---|---|---|---|---|');
for (const [s, a] of Object.entries(out.seeds)) {
  const B = a.wars.filter((w) => w.battle > 0), per = B.map((w) => w.fightMax / w.battle);
  P(`| ${s} | ${B.length} | ${B.reduce((x, w) => x + w.battle, 0)} | ${B.reduce((x, w) => x + w.bAdv, 0)} · ${B.reduce((x, w) => x + w.bEng, 0)} · ${B.reduce((x, w) => x + w.bForm, 0)} | ${f2(B.reduce((x, w) => x + w.fightMax, 0), 1)} | ${f2(q(per, 0.5), 3)} · ${f2(per.length ? Math.min(...per) : null, 3)} ~ ${f2(per.length ? Math.max(...per) : null, 3)} | ${f2(B.reduce((x, w) => x + w.fightMax, 0) / 1440, 2)} | ${a.wars.reduce((x, w) => x + w.pack0, 0)} |`);
}
P('');
for (const [s, a] of Object.entries(out.seeds)) for (const w of a.wars.filter((x) => (x.len != null ? x.len : 999) > 30).sort((x, y) => (y.len || 999) - (x.len || 999)).slice(0, 12)) P(`  시드 ${s} 전쟁 ${w.id} ${w.atk}→${w.def}[${w.casus}] 병력 ${w.force}(징발 ${w.draftN}) · 행군일 ${w.marchDays} · ${w.born}~${w.end ?? '끝까지'}일(${w.len ?? '열림'}) · 행군 ${w.march} · 주둔 ${w.camp} · 포위 ${w.siege} · 교전 ${w.battle} · 귀환 ${w.ret} · 몸 싸움 ${f2(w.fightMax, 1)}초(접촉 ${w.contacts} · 대치 ${w.standoffs}) · 짐 0 ${w.pack0}날 · 공격 징발 최대 ${w.maxAtk} · 방어 징발 최대 ${w.maxDef} · ${w.ops}`);
P('');
for (const [s, a] of Object.entries(out.seeds)) P(`  관찰 시드 ${s}: 오류 ${a.errs}${a.err0 ? ' ' + a.err0.split('\n')[0] : ''} · 가른 값 ≠ econ 값 ${a.chkBad}`);
console.log(lines.join('\n'));
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out));
