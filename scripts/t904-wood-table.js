#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T904 표 기계 · 세계 안 만짐 · 판 JSON 만 읽는다)
// === scripts/t904-wood-table.js — 나무꾼 몸의 하루를 **층**으로 · 수요 문의 수를 마을마다(T904 ① 귀속) ============================
//   node scripts/t904-wood-table.js <T449_TMP 폴더> [--json <파일>]
//     읽는 것: `<폴더>/body-day.json`(t449-body-day — 팔마다 잰 날) · `<폴더>/<팔>.t904.json`(t904-probe — 몸 × 날 층 · 마을 × 날 수요 문) ·
//              `<폴더>/<팔>.body.json`(t491-probe — 몸 × 날 그루 · 해 질 녘 손)
//   셈(판정 0 · 산수뿐):
//     잰 날 = t449-body-day 가 영점으로 적은 날(첫 경계 뒤 그날 — `t888-body-table` 과 같은 날) · 몸·날 = 그날 표본 절반 이상이 그 직업인 몸.
//     ① 층 표 — 나무꾼 몸·날의 1초 표본을 층으로(밤 · 요양 · 해 질 녘 정산 · 곳간행 · 회관행 · 과업 · 수요 문 · 그날 끝 · 빈 셀 위 · 벌목 · 출근 · 제자리 출근 · 그 밖) —
//        낮 표본(밤 뺀 것) 가운데 몫 %.
//     ② 수요 문 표 — 마을마다(나무꾼 행위 층이 켜진 마을 · 그날 나무꾼 몸이 있는 마을): econ 나무꾼 · land.wood · D(그날 수식 목재) · D/나무꾼 ·
//        w̄(그루당 단) · D ÷ w̄(수요 문이 하루에 허락하는 그루) · 아침 손(첫 낮 표본의 `_t374Held`) · 낮 수요 문 참 몫 · 처음 참이 된 해 몫 · 그날 몸 그루 · 해 질 녘 손.
//     ③ 채집 수요 문 — 같은 칸을 채집(D = `_forageOutLast × _t347MixShare`)으로 줄여서.
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const DIR = A[0];
const JOUT = A.includes('--json') ? A[A.indexOf('--json') + 1] : null;
if (!DIR) { console.error('쓰는 법: node scripts/t904-wood-table.js <폴더> [--json <파일>]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const sum = (a) => a.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
const r1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US'));
const r2 = (x) => (x == null ? '—' : (Math.round(x * 100) / 100).toLocaleString('en-US'));
const pc = (a, b) => (b ? (100 * a / b).toFixed(1) + ' %' : '—');
const BD = rd(path.join(DIR, 'body-day.json'));
if (!BD) { console.error('body-day.json 없음'); process.exit(2); }
const LAYERS = ['밤', '요양', '해질녘정산', '곳간행', '곳간행(통나무 든 채)', '회관행', '수요문', '그날끝', '빈 셀 위', '벌목(그루 선 셀)', '출근', '제자리 출근'];
const out = { dir: DIR, obs: BD.obs, arms: {} };
for (const tag of Object.keys(BD.arms)) {
  const arm = BD.arms[tag];
  const zero = (arm.days || []).find((x) => x.zero) || null;
  const day = zero ? zero.day : null;
  const P = rd(path.join(DIR, `${tag}.t904.json`)), Q = rd(path.join(DIR, `${tag}.body.json`));
  const res = { env: arm.env, day, lj: { bodyDays: 0, lay: {}, n: 0 }, fg: { bodyDays: 0, lay: {}, n: 0 }, vil: [], fvil: [] };
  const treesOf = {};   // 마을 이름 → { trees, dusk, lj } — t491 몸 누계(그날 나무꾼 몸·날)
  if (Q && Q.bodies && day != null) for (const k of Object.keys(Q.bodies)) {
    const b = Q.bodies[k], a = b.days && b.days[day]; if (!a || !a.n) continue;
    const lj = (a.jobs && a.jobs.lumberjack) || 0; if (lj * 2 < a.n) continue;
    const T = treesOf[b.vil] || (treesOf[b.vil] = { trees: 0, dusk: 0, lj: 0 }); T.trees += a.cutN || 0; T.dusk += a.dusk || 0; T.lj++;
  }
  if (P && P.bodies && day != null) for (const k of Object.keys(P.bodies)) {
    const b = P.bodies[k], a = b.days && b.days[day]; if (!a || !a.n) continue;
    const lj = (a.jobs && a.jobs.lumberjack) || 0, fg = (a.jobs && a.jobs.forager) || 0;
    const R = lj * 2 >= a.n ? res.lj : (fg * 2 >= a.n ? res.fg : null); if (!R) continue;
    R.bodyDays++; R.n += a.n; for (const [l, c] of Object.entries(a.lay || {})) R.lay[l] = (R.lay[l] || 0) + c;
  }
  if (P && P.vils && day != null) for (const id of Object.keys(P.vils)) {
    const v = P.vils[id], x = v.days && v.days[day]; if (!x) continue;
    const T = treesOf[v.name] || null;
    //   그날 곳간 입고 = 누계 칸의 하루 증가분(어제 날 마지막 값 → 그날 마지막 값) — `_t325Deliv`(몸 손 · 사다리 · 해 질 녘 · 일괄 다) · `_t561Lad`(그중 사다리 · 켠 팔만)
    const y = v.days && v.days[String(+day - 1)];
    const dDeliv = (y && x.deliv != null && y.deliv != null) ? +(x.deliv - y.deliv).toFixed(3) : null, dLad = (y && x.lad != null && y.lad != null) ? +(x.lad - y.lad).toFixed(3) : null;
    if (x.w && T && T.lj > 0) res.vil.push({ name: v.name, lj: x.lj, landWood: x.landWood, D: x.w.D, wBar: x.wBar, held0: x.w.held0, got0: x.w.got0, gotMax: x.w.gotMax, dDeliv, dLad,
      doneDay: x.w.doneDay, dayN: x.w.dayN, firstDoneFv: x.w.firstDoneFv, leftMin: x.w.leftMin, pack: x.pack, lad: x.lad, gran: x.gran, cells: x.cells, N: x.N, K: x.K,
      bodies: T.lj, trees: T.trees, dusk: +T.dusk.toFixed(3), dbg: x.dbg || null });
    if (x.f && x.f.dayN) res.fvil.push({ name: v.name, fg: x.fg, D: x.f.D, held0: x.f.held0, gotMax: x.f.gotMax, doneDay: x.f.doneDay, dayN: x.f.dayN, firstDoneFv: x.f.firstDoneFv, mix: x.mix });
  }
  res.vil.sort((a, b) => (a.name < b.name ? -1 : 1)); res.fvil.sort((a, b) => (a.name < b.name ? -1 : 1));
  out.arms[tag] = res;
}
const tags = Object.keys(out.arms);
console.log(`\n관측 마을 ${out.obs && out.obs.name} · 잰 날(팔마다) ${tags.map((t) => `${t} ${out.arms[t].day}`).join(' · ')}`);
// ① 층 표 — 나무꾼
for (const job of ['lj', 'fg']) {
  const name = job === 'lj' ? '나무꾼' : '채집꾼';
  const all = [...new Set(tags.flatMap((t) => Object.keys(out.arms[t][job].lay)))];
  const order = LAYERS.filter((l) => all.includes(l)).concat(all.filter((l) => !LAYERS.includes(l)).sort());
  console.log(`\n① ${name} 몸·날 층(1초 표본 · 몸·초 — 괄호는 낮 표본 중 몫)`);
  console.log(`| 층 | ${tags.map((t) => `${t} (몸·날 ${out.arms[t][job].bodyDays})`).join(' | ')} |`);
  console.log(`|---|${tags.map(() => '---:').join('|')}|`);
  for (const l of order) {
    console.log(`| ${l} | ${tags.map((t) => { const R = out.arms[t][job], c = R.lay[l] || 0, dayN = R.n - (R.lay['밤'] || 0); return c ? `${c.toLocaleString('en-US')}${l === '밤' ? '' : ' (' + pc(c, dayN) + ')'}` : '0'; }).join(' | ')} |`);
  }
  console.log(`| (표본 합 · 낮) | ${tags.map((t) => { const R = out.arms[t][job]; return `${R.n.toLocaleString('en-US')} · ${(R.n - (R.lay['밤'] || 0)).toLocaleString('en-US')}`; }).join(' | ')} |`);
}
// ② 수요 문 표 — 마을마다
for (const t of tags) {
  const R = out.arms[t];
  console.log(`\n② 수요 문의 수 — 팔 ${t}(잰 날 ${R.day} · 나무꾼 몸이 있는 마을 ${R.vil.length})`);
  console.log('| 마을 | econ 나무꾼 | land.wood | D 단/일 | D/나무꾼 | w̄ 단/그루 | D÷w̄ 그루/일 | 아침 손 | 그날 든 단(최대) | 낮 수요 문 참 | 처음 참(해 몫) | 몸 · 그루 · 해 질 녘 손 | 짐 | 사다리 누계 | 곳간 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|');
  for (const v of R.vil) {
    console.log(`| ${v.name} | ${v.lj} | ${r2(v.landWood)} | ${r2(v.D)} | ${v.lj ? r2(v.D / v.lj) : '—'} | ${r2(v.wBar)} | ${v.wBar ? r2(v.D / v.wBar) : '—'} | ${r2(v.held0)} | ${r2(v.gotMax)} | ${pc(v.doneDay, v.dayN)} | ${r2(v.firstDoneFv)} | ${v.bodies} · ${v.trees} · ${r1(v.dusk)} | ${r2(v.pack)} | ${r2(v.lad)} | ${v.gran} |`);
  }
  const Ds = R.vil.map((v) => v.D), Dl = R.vil.filter((v) => v.lj).map((v) => v.D / v.lj), W = R.vil.map((v) => v.wBar), DW = R.vil.filter((v) => v.wBar).map((v) => v.D / v.wBar);
  const over = R.vil.filter((v) => v.wBar && v.bodies && v.D > v.wBar * v.bodies);
  console.log(`| **중앙** | ${med(R.vil.map((v) => v.lj))} | ${r2(med(R.vil.map((v) => v.landWood)))} | ${r2(med(Ds))} | ${r2(med(Dl))} | ${r2(med(W))} | ${r2(med(DW))} | ${r2(med(R.vil.map((v) => v.held0)))} | ${r2(med(R.vil.map((v) => v.gotMax)))} | ${pc(sum(R.vil.map((v) => v.doneDay)), sum(R.vil.map((v) => v.dayN)))} | — | ${sum(R.vil.map((v) => v.bodies))} · ${sum(R.vil.map((v) => v.trees))} · ${r1(sum(R.vil.map((v) => v.dusk)))} | | | |`);
  console.log(`  · D > 몸 수 × 한 그루(w̄) 인 마을 ${over.length}/${R.vil.length}${over.length ? ' — ' + over.map((v) => `${v.name}(D ${r2(v.D)} · 몸 ${v.bodies} × w̄ ${r2(v.wBar)})`).join(' · ') : ''}`);
  console.log(`  · 그날 곳간 입고(누계 \`_t325Deliv\` 하루 증가분 — 몸 손 · 사다리 · 해 질 녘 · 일괄 다) Σ ${r1(sum(R.vil.map((v) => v.dDeliv)))}단 · 그중 사다리(\`_t561Lad\`) Σ ${r1(sum(R.vil.map((v) => v.dLad)))}단 · D Σ ${r1(sum(Ds))}단 · 마을마다 ${R.vil.map((v) => `${v.name} ${r1(v.dDeliv)}${v.dLad ? '(사다리 ' + r1(v.dLad) + ')' : ''}`).join(' · ')}`);
  if (R.fvil.length) {
    console.log(`\n③ 채집 수요 문 — 팔 ${t}(채집 행위 층이 켜진 마을 ${R.fvil.length})`);
    console.log('| 마을 | econ 채집꾼 | 믹스 몫 | D 단/일 | 아침 손 | 그날 든 단(최대) | 낮 수요 문 참 | 처음 참(해 몫) |');
    console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const v of R.fvil) console.log(`| ${v.name} | ${v.fg} | ${r2(v.mix)} | ${r2(v.D)} | ${r2(v.held0)} | ${r2(v.gotMax)} | ${pc(v.doneDay, v.dayN)} | ${r2(v.firstDoneFv)} |`);
  }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
