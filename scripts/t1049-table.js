#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1049 표 기계 · 판 JSON(`*.t1049.json`)만 읽는다)
// === scripts/t1049-table.js — 해체 마을 하나하나: 피크 → 굶기 시작 → 해체 =========================================
//   쓰는 법: node scripts/t1049-table.js <판.t1049.json …> [--json out.json] [--vil 이름] [--all] [--short] [--groups]
//     --short = 마을 하나 한 줄(보고서 표 밑감 · 돌 바닥 여부 · 굶기 앞 창의 도구 배수 · 돌 · 사람당 산출/먹음 · K/인구 · 수출입 · 전쟁·조공·징집)
//   해체 마을마다(랩 판이면 굶어 죽은 사람이 난 마을마다):
//     피크 날(해체 앞 인구 최대 · 처음 그 값) · 굶기 시작한 날(피크 뒤 처음 인구식 굶주림 항 < 0 — `villageFamine` 정본 판정) · 해체 날
//     피크 창(피크 앞 30날) ↔ 굶기 앞 창(굶기 시작 앞 30날)의 사람당 하루 산출(갈래 넷) · 먹음 · 수입 · 수출 · 잃은 짐 · 징집 몫 · 조공 · 전쟁 · K 셋
//     피크 → 해체 사이 빠진 사람 까닭 셈(관찰기 `gone` — 인구식 죽음은 가장 음수 항 · K 를 묶은 칸)
//   "1위 원인" 은 이 표가 정하지 않는다 — 숫자를 나란히 놓고 보고서가 근거로 읽는다(규칙 없이 기계가 붙인 이름은 추상이다).
const fs = require('fs');
const args = process.argv.slice(2);
const files = args.filter((a) => /\.json$/.test(a) && args[args.indexOf(a) - 1] !== '--json');
const JOUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const ONLY = args.includes('--vil') ? args[args.indexOf('--vil') + 1] : null;
const W = 30;
const out = [];
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
for (const f of files) {
  const R = JSON.parse(fs.readFileSync(f, 'utf8'));
  const C = Object.fromEntries(R.cols.map((c, i) => [c, i]));
  const run = f.replace(/^.*\//, '').replace(/\.t1049\.json$/, '');
  const targets = [];
  if (R.dis && R.dis.length) for (const d of R.dis) targets.push({ v: d.v, D: d.day, kind: '해체' });
  if (R.lab || args.includes('--all')) for (const v in R.vil) {
    if (targets.some((t) => t.v === v)) continue;
    const g = R.gone[v] || {}; let st = 0; for (const k in g) if (/pop:hunger/.test(k)) st += g[k];
    const rows = R.vil[v]; const last = rows[rows.length - 1];
    if (st > 0 || (last && last[C.n] === 0)) targets.push({ v, D: last ? last[C.d] : null, kind: last && last[C.n] === 0 ? '소멸' : '굶음 있음' });
  }
  for (const t of targets) {
    if (ONLY && t.v !== ONLY) continue;
    const rows = (R.vil[t.v] || []).filter((r) => r[C.d] <= t.D);
    if (!rows.length) continue;
    let pk = rows[0]; for (const r of rows) if (r[C.n] > pk[C.n]) pk = r;
    const P = pk[C.d];
    const S = (rows.find((r) => r[C.d] > P && (r[C.hunger] || 0) < 0) || [null])[C.d] ?? null;
    const win = (a, b) => rows.filter((r) => r[C.d] > a && r[C.d] <= b);
    const avg = (rs, fn) => (rs.length ? rs.reduce((s, r) => s + fn(r), 0) / rs.length : null);
    const per = (rs, c) => avg(rs, (r) => (r[C[c]] || 0) / Math.max(1, r[C.n]));
    const desc = (rs) => rs.length ? {
      days: rs.length, n: r1(avg(rs, (r) => r[C.n])), fe: r1(avg(rs, (r) => r[C.fe])), feDays: r1(avg(rs, (r) => r[C.fe] / Math.max(1, r[C.n]))),
      prodPH: r1(per(rs, 'prod')), eatPH: r1(per(rs, 'eat')), grainPH: r1(per(rs, 'pGrain')), fishPH: r1(per(rs, 'pFish')), meatPH: r1(per(rs, 'pMeat')), foragePH: r1(per(rs, 'pForage')),
      imp: r1(avg(rs, (r) => r[C.imp] || 0)), exp: r1(avg(rs, (r) => r[C.exp] || 0)), lost: r1(avg(rs, (r) => r[C.lost] || 0)),
      draftFrac: r1(avg(rs, (r) => (r[C.draft] || 0) / Math.max(1, r[C.n]))), packFrac: r1(avg(rs, (r) => (r[C.pack] || 0) / Math.max(1, r[C.n]))),
      tribDays: rs.filter((r) => r[C.trib] > 0).length, warDays: rs.filter((r) => r[C.war] > 0).length,
      K: r1(avg(rs, (r) => r[C.K] || 0)), kSlot: r1(avg(rs, (r) => r[C.kSlot] || 0)), kProd: r1(avg(rs, (r) => r[C.kProd] || 0)), kFuel: r1(avg(rs, (r) => r[C.kFuel] || 0)),
      logi: r1(avg(rs, (r) => r[C.logi] || 0)), hunger: r1(avg(rs, (r) => r[C.hunger] || 0)), health: r1(avg(rs, (r) => r[C.health] || 0)), happy: r1(avg(rs, (r) => r[C.happy] || 0)),
      hp: r1(avg(rs, (r) => r[C.hp] || 0)), hap: r1(avg(rs, (r) => r[C.hap] || 0)),
      tool: C.tool != null ? r1(avg(rs, (r) => r[C.tool] || 0)) : null, stone: C.stone != null ? r1(avg(rs, (r) => r[C.stone] || 0)) : null, tBoost: C.tBoost != null ? r1(avg(rs, (r) => r[C.tBoost] || 0)) : null, deps: C.deps != null ? r1(avg(rs, (r) => r[C.deps] || 0)) : null,
    } : null;
    const gone = {}; const g = R.gone[t.v] || {};
    for (const k in g) { const i = k.indexOf(':'), d = +k.slice(0, i), c = k.slice(i + 1); if (d > P && d <= t.D) gone[c] = (gone[c] || 0) + g[k]; }
    const born = rows.filter((r) => r[C.d] > P).reduce((s, r) => s + (r[C.born] || 0), 0);
    const bal = (a, b) => { const rs = win(a, b); if (!rs.length) return null; const s = (c) => r1(rs.reduce((x, r) => x + (r[C[c]] || 0), 0));
      const fe0 = (rows.find((r) => r[C.d] === a) || rs[0])[C.fe], fe1 = rs[rs.length - 1][C.fe];
      return { prod: s('prod'), eat: s('eat'), imp: s('imp'), exp: s('exp'), lost: s('lost'), dFe: r1(fe1 - fe0) }; };
    const o = { run, v: t.v, kind: t.kind, peakDay: P, peakN: pk[C.n], starveDay: S, endDay: t.D, endN: rows[rows.length - 1][C.n],
      atPeak: desc(win(P - W, P)), preStarve: S != null ? desc(win(S - W, S)) : null, starveToEnd: S != null ? desc(win(S, t.D)) : null,
      balPeakToStarve: S != null ? bal(P, S) : bal(P, t.D), gone, bornAfterPeak: born };
    out.push(o);
  }
}
// 돌 바닥 마을(land.stone = 바닥 0.25) — 씨 1020·7·42 랩 판 T152 표(전수 시딩 · 세 씨 같은 36곳)에서 옮긴 이름. 서버도 같은 존 시딩이다.
const FLOOR = new Set('농촌1,농촌2,농촌3,농촌4,농촌5,농촌6,농촌7,농촌8,농촌9,농촌10,농촌11,농촌12,농촌13,농촌14,농촌15,농촌16,농촌17,농촌18,농촌19,농촌20,농촌21,농촌22,어촌2,어촌3,어촌5,어촌6,어촌7,어촌8,어촌10,어촌11,어촌12,어촌13,어촌15,어촌16,임업3,임업6'.split(','));
// --groups = 갈래 셋(규칙은 이 글자 그대로 · 문턱은 보고 T1049 §2 표에서 읽은 경계 — 새 수가 아니라 표 가르는 자):
//   ㄱ 돌 나선   : 굶기 앞 창 돌 < 1 · 도구 배수 < 0.6 (도구가 닳아 맨손 — 0.25× 쪽)
//   ㄴ K 넘침    : 위가 아니고 · 사람당 산출 < 먹음 · K/인구 ≥ 1.3 (K 는 키우라는데 땅이 제 사람을 못 먹임)
//   ㄷ K 맞닿음  : 나머지(K/인구 < 1.3 — 큰 마을이 K 끝에서 흉년·도구 덜 찬 채 꺾임)
const groupOf = (o) => { const b = o.preStarve || o.starveToEnd || {}; if ((b.stone ?? 9) < 1 && (b.tBoost ?? 9) < 0.6) return 'ㄱ';
  if ((b.prodPH ?? 0) < (b.eatPH ?? 0) && b.n && b.K / b.n >= 1.3) return 'ㄴ'; return 'ㄷ'; };
if (args.includes('--groups')) {
  const g = {}; for (const o of out) { const k = groupOf(o); (g[k] = g[k] || []).push(`${o.run}:${o.v}`); }
  console.log(`해체 ${out.length} · ` + ['ㄱ', 'ㄴ', 'ㄷ'].map((k) => `${k} ${(g[k] || []).length}`).join(' · '));
  for (const k of ['ㄱ', 'ㄴ', 'ㄷ']) if (g[k]) console.log(`  ${k}: ${g[k].join(' ')}`);
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out.map((o) => Object.assign({ group: groupOf(o) }, o)), null, 1));
  process.exit(0);
}
if (args.includes('--short')) {
  console.log('판\t마을\t바닥\t피크→굶기→끝\t도구배수(피크→굶기앞)\t돌(피크→굶기앞)\t산출/먹음(굶기앞)\tK/인구(굶기앞)\t수입·수출(굶기앞·날)\t전쟁·조공·징집');
  for (const o of out) { const a = o.atPeak || {}, b = o.preStarve || o.starveToEnd || {};
    console.log([o.run, o.v, FLOOR.has(o.v) ? '바닥' : '-', `D${o.peakDay}→D${o.starveDay ?? '-'}→D${o.endDay}`, `${a.tBoost}→${b.tBoost}`, `${a.stone}→${b.stone}`,
      `${b.prodPH}/${b.eatPH}`, b.n ? r1(b.K / b.n) : '-', `${b.imp}·${b.exp}`, `${b.warDays || 0}·${b.tribDays || 0}·${b.draftFrac || 0}`].join('\t')); }
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
  process.exit(0);
}
for (const o of out) {
  const a = o.atPeak || {}, b = o.preStarve || {};
  console.log(`\n■ ${o.run} · ${o.v} (${o.kind}) — 피크 D${o.peakDay} ${o.peakN}명 → 굶기 시작 D${o.starveDay ?? '없음'} → 끝 D${o.endDay} ${o.endN}명 · 피크 뒤 출생 ${o.bornAfterPeak}`);
  console.log(`  빠진 사람(피크 → 끝): ${JSON.stringify(o.gone)}`);
  const f = (k) => `${a[k] ?? '-'} → ${b[k] ?? '-'}`;
  console.log(`  인구 ${f('n')} · 곳간 날수 ${f('feDays')} · 사람당 산출 ${f('prodPH')}(곡 ${f('grainPH')} · 어 ${f('fishPH')} · 육 ${f('meatPH')} · 채 ${f('foragePH')}) · 사람당 먹음 ${f('eatPH')}`);
  console.log(`  수입 ${f('imp')} · 수출 ${f('exp')} · 잃은 짐 ${f('lost')} · 징집 ${f('draftFrac')} · 짐꾼 ${f('packFrac')} · 조공 날 ${f('tribDays')} · 전쟁 날 ${f('warDays')}`);
  console.log(`  도구 ${f('tool')} · 돌 ${f('stone')} · 도구 배수 ${f('tBoost')} · 도구 쓰는 사람 ${f('deps')}`);
  console.log(`  K ${f('K')}(자리 ${f('kSlot')} · 흐름 ${f('kProd')} · 땔감 ${f('kFuel')}) · 항 logi ${f('logi')} · hunger ${f('hunger')} · health ${f('health')} · happy ${f('happy')}`);
  if (o.balPeakToStarve) console.log(`  피크 → 굶기 장부: ${JSON.stringify(o.balPeakToStarve)}`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
