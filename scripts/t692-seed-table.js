#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T692 표 기계 · 판정 0 · 새 수 0 · T683 표 기계(가지에만 있던 것)에 비축 칸을 더한 판)
// === scripts/t692-seed-table.js — 시딩 통나무 첫 30일 · 시딩 비축 · 통나무 0 마을 · 수출 두 문 · 손잡이 팔 표(세 자) ==========
//   읽는 것 — 관찰자 `t692-seed-probe.js` 의 하루 행(마을마다 n · 곳간 · EMA · 비축 · 문 ① 발주 출발 · 문 ② 되사 감 · 들어옴)과 자의 판 JSON.
//   센다:
//     · 시딩 곳간(Σ `createVillage` 그 순간 통나무) · 가산 마을(곳간 > 최소 시딩 — 8×8 = 64 위에 LANDFIT 가 얹은 곳)과 가산 합
//     · 첫 30일(1~30일) 수출 = 문 ① + 문 ② · 시딩 대비 몫 · 첫 화물(마을마다 첫 통나무 출발 날 · 그날 양 · 한 수레 상한 100 에 찬 마을)
//     · 통나무 0 마을(곳간 < 1 — T581 `wood0` · T659 그 문) d30 · d100 · d400(두 자는 d800 도) · 인구(그날 Σ n) · 곳간 첫 0 날(중앙)
//     · 시딩 비축(`_seedReserve`) Σ · 쥔 마을 수 — d1 · d30 · d100 · 마을마다 비축이 0 이 된 날(중앙)
//     · (서버 판) 식량값 중앙 · 첫 30일 통나무 희소도 중앙(값 ÷ v2 BASE_VALUE_V2.wood)
//   T252 자(짝 Δ% · 부호 3/3 AND |평균| > 폭 → 가름 · 부호 3/3 → 방향만 · 나머지 못 가름 — t416-guard-table · t659 그 식).
//
//   쓰는 법:
//     node scripts/t692-seed-table.js lab <dir> [팔=main,off,on] [시드=1020,7,42]   # `<팔>_<자>_<시드>.json` + `.probe.json`(t17 · t176)
//     node scripts/t692-seed-table.js srv <dir> [팔=main,off,on] [시드=1020,7,42]   # `<팔>-<시드>.json` + `.json.t692.json`(T650 자)
//     T692_JSON=<파일> 을 주면 표를 JSON 으로도 쓴다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let BASE = null;
{ const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8'); const m = /BASE_VALUE_V2\s*=\s*\{[\s\S]*?\bwood:\s*([\d.]+)/.exec(src); BASE = m ? +m[1] : null; }
const [MODE, DIR, ARMS_CSV, SEEDS_CSV] = process.argv.slice(2);
const ARMS = (ARMS_CSV || 'main,off,on').split(',');
const SEEDS = (SEEDS_CSV || '1020,7,42').split(',').map(Number);
const ON_ARMS = ARMS.filter((x) => x !== 'main' && x !== 'off');
const q = (a, p) => { const b = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; };
const med = (a) => q(a, 0.5);
const f2 = (x, d = 2) => (x == null ? '—' : (+x).toFixed(d));
const n0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const pc = (x) => (x == null ? '—' : (x * 100).toFixed(0) + '%');
const J = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const T252 = (base, arm) => {
  const d = base.map((b, i) => (b ? (arm[i] - b) / b * 100 : 0));
  const m = d.reduce((x, y) => x + y, 0) / d.length, w = Math.max(...d) - Math.min(...d);
  const sg = d.every((x) => x > 0) || d.every((x) => x < 0);
  return { d: d.map((x) => +x.toFixed(2)), mean: +m.toFixed(2), width: +w.toFixed(2), verdict: sg && Math.abs(m) > w ? '가름' : (sg ? '방향만' : '못 가름') };
};

// 관찰자 파일 → 통나무 계수
function probeStats(P, checkDays) {
  if (!P || !P.days || !P.v) return null;
  const D = (d) => { let i = P.days.indexOf(d); if (i < 0) i = P.days.findIndex((x) => x >= d); return i; };
  const V = P.v;
  const sumK = (k, a, b) => V.reduce((s, x) => { let t = 0; for (let i = 0; i < P.days.length; i++) if (P.days[i] >= a && P.days[i] <= b) t += (x[k] && x[k][i]) || 0; return s + t; }, 0);
  const seeded = Array.isArray(P.seed) && P.seed.every((x) => x != null) ? P.seed.reduce((a, x) => a + x, 0) : null;
  const ex1 = sumK('exS', 1, 30), ex2 = sumK('exB', 1, 30), im30 = sumK('imS', 1, 30) + sumK('imB', 1, 30);
  const rs = (x, i) => (x.rsv && x.rsv[i]) || 0;
  const sMin0 = Array.isArray(P.seed) ? Math.min(...P.seed.filter((x) => x != null)) : null;
  const isBonus = (k) => Array.isArray(P.seed) && P.seed[k] != null && P.seed[k] > sMin0 + 0.5;   // 가산 마을(곳간 > 최소 시딩)
  const at = (d) => { const i = D(d); if (i < 0) return null; return { day: P.days[i], wood0: V.filter((x) => (x.wood[i] || 0) < 1).length, pop: V.reduce((a, x) => a + (x.n[i] || 0), 0), vils: V.length,
    wood0Bonus: V.filter((x, k) => isBonus(k) && (x.wood[i] || 0) < 1).length, wood0Base: V.filter((x, k) => !isBonus(k) && (x.wood[i] || 0) < 1).length,
    woodMed: med(V.map((x) => x.wood[i])), woodSum: V.reduce((a, x) => a + (x.wood[i] || 0), 0), rsv: V.reduce((a, x) => a + rs(x, i), 0), rsvVils: V.filter((x) => rs(x, i) > 0).length }; };
  const zeroDay = V.map((x) => { for (let i = 0; i < P.days.length; i++) if ((x.wood[i] || 0) < 1) return P.days[i]; return null; });
  // 비축 — 첫날 비축이 선 마을마다 0 이 된 날(안 닿으면 null)
  const rsvZero = V.filter((x) => rs(x, 0) > 0).map((x) => { for (let i = 0; i < P.days.length; i++) if (!(rs(x, i) > 0)) return P.days[i]; return null; });
  // 문 ① 첫 화물 — 마을마다 첫 30일 안 첫 통나무 출발 날 · 그날 양(econ 한 수레 상한 `CARGO_PER_TRIP` 100 — v2 정본)
  const first = V.map((x) => { for (let i = 0; i < P.days.length && P.days[i] <= 30; i++) if ((x.exS[i] || 0) > 0) return [P.days[i], x.exS[i]]; return null; }).filter(Boolean);
  const e30 = V.map((x) => { let t = 0; for (let i = 0; i < P.days.length; i++) if (P.days[i] >= 1 && P.days[i] <= 30) t += (x.exS[i] || 0) + (x.exB[i] || 0); return t; });
  const sMin = Array.isArray(P.seed) ? Math.min(...P.seed.filter((x) => x != null)) : null;
  const bonusK = Array.isArray(P.seed) ? P.seed.map((x) => x != null && x > sMin + 0.5) : null;
  const door = { firstN: first.length, firstDayMed: med(first.map((f) => f[0])), firstDayP10: q(first.map((f) => f[0]), 0.1), firstAmtMed: med(first.map((f) => f[1])), firstCap: first.filter((f) => Math.abs(f[1] - 100) < 1e-6).length,
    bonusVils: bonusK ? bonusK.filter(Boolean).length : null, bonusSum: bonusK ? P.seed.reduce((a, x, k) => a + (bonusK[k] ? x - sMin : 0), 0) : null,
    exBonus: bonusK ? e30.reduce((a, x, k) => a + (bonusK[k] ? x : 0), 0) : null, exBase: bonusK ? e30.reduce((a, x, k) => a + (bonusK[k] ? 0 : x), 0) : null,
    bonus90: bonusK ? e30.filter((x, k) => bonusK[k] && x >= 90).length : null };
  const out = { seeded, door, ex1, ex2, exp30: ex1 + ex2, share30: seeded ? (ex1 + ex2) / seeded : null, share1: seeded ? ex1 / seeded : null, im30,
    exAll: sumK('exS', 0, 1e9) + sumK('exB', 0, 1e9), days: P.days.length, knobs: P.knobs,
    at: Object.fromEntries(checkDays.map((d) => [d, at(d)])), zeroMed: med(zeroDay.filter((x) => x != null)), never0: zeroDay.filter((x) => x == null).length,
    rsv1: at(1), rsvZeroMed: med(rsvZero.filter((x) => x != null)), rsvNever0: rsvZero.filter((x) => x == null).length, rsvVils0: rsvZero.length };
  if (P.prices) {
    const pf = [], sw = [], swAll = [];
    for (const x of V) for (let i = 0; i < P.days.length; i++) { if (x.n[i] > 0 && x.pf[i] != null) pf.push(x.pf[i]); if (x.n[i] > 0 && x.pw[i] != null && BASE) { swAll.push(x.pw[i] / BASE); if (P.days[i] <= 30) sw.push(x.pw[i] / BASE); } }
    out.pfMed = med(pf); out.scarcity30 = med(sw); out.scarcityAll = med(swAll);
  }
  return out;
}

function line(tag, seed, S, e) {
  const a = S.at, g = (d, k) => (a[d] ? a[d][k] : null), dk = Object.keys(a);
  const rsv = S.rsvVils0 ? `${n0(S.rsv1 && S.rsv1.rsv)}(${S.rsvVils0}곳) → ${n0(g(30, 'rsv'))}(${g(30, 'rsvVils')}) → ${n0(g(100, 'rsv'))}(${g(100, 'rsvVils')}) · 0 된 날 중앙 ${S.rsvZeroMed == null ? '—' : S.rsvZeroMed}` : '—';
  return `| ${tag} | ${seed} | ${n0(S.ex1)} + ${n0(S.ex2)} = ${n0(S.exp30)} (**${pc(S.share30)}**) | ${S.door.firstN}곳 · ${S.door.firstDayMed == null ? '—' : S.door.firstDayMed}일(p10 ${S.door.firstDayP10 == null ? '—' : S.door.firstDayP10}) · ${f2(S.door.firstAmtMed, 1)} · =100 ${S.door.firstCap} | ${dk.map((d) => (g(d, 'wood0') == null ? '—' : g(d, 'wood0'))).join(' / ')} | ${dk.map((d) => n0(g(d, 'pop'))).join(' / ')} | ${S.zeroMed == null ? '—' : S.zeroMed}(${S.never0}) | ${rsv} | ${e}`;
}
const HEAD = '| 팔 | 시드 | 첫 30일 수출 문①+문② (시딩 대비) | 첫 화물 — 마을 · 날 중앙(p10) · 첫날 양 중앙 · 한 수레 100 | 통나무 0 마을 DAYS | 인구 DAYS | 곳간 첫 0 중앙 날(안 닿은 마을) | 시딩 비축 Σ(쥔 마을) d1 → d30 → d100 · 0 된 날 |';

function doorTable(rows, label) {
  console.log(`\n[${label}] 시딩 가산 마을(첫 30일)`);
  console.log('| 팔 | 시드 | 가산 마을(가산 합) | 첫 30일 수출 가산 마을 · 아닌 마을 | 가산 마을 중 ≥90 내보냄 | 통나무 0 마을 가산 · 아닌 — d30 / d100 / d400 | 곳간 합 d30 · d100 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) { const d = r.wood && r.wood.door; if (!d) continue; const A = r.wood.at;
    const w0 = [30, 100, 400].map((x) => (A[x] ? `${A[x].wood0Bonus}·${A[x].wood0Base}` : '—')).join(' / ');
    console.log(`| ${r.ruler ? r.ruler + '·' : ''}${r.arm} | ${r.seed} | ${d.bonusVils}(${n0(d.bonusSum)}) | ${n0(d.exBonus)} · ${n0(d.exBase)} | ${d.bonus90}/${d.bonusVils} | ${w0} | ${n0(A[30] && A[30].woodSum)} · ${n0(A[100] && A[100].woodSum)} |`); }
}
const WK = (r, k) => { if (!r || !r.wood) return null; const A = r.wood.at; if (k === 'w0_30') return A[30] && A[30].wood0; if (k === 'w0_100') return A[100] && A[100].wood0; if (k === 'w0_400') return A[400] && A[400].wood0;
  if (k === 'exp30') return r.wood.exp30; if (k === 'pop400') return A[400] && A[400].pop; if (k === 'pfMed') return r.wood.pfMed; if (k === 'swAll') return r.wood.scarcityAll; if (k === 'w0b_30') return A[30] && A[30].wood0Base; if (k === 'firstDay') return r.wood.door.firstDayMed; return null; };

// ── 두 자 ─────────────────────────────────────────────────────────────
function lab() {
  const out = { mode: 'lab', dir: DIR, arms: ARMS, seeds: SEEDS, cmp: {}, same: {}, rows: [], delta: {} };
  const F = (arm, ruler, s) => path.join(DIR, `${arm}_${ruler}_${s}.json`);
  for (const ruler of ['t17', 't176']) {
    out.cmp[ruler] = SEEDS.map((s) => { const a = F('main', ruler, s), b = F('off', ruler, s); if (!fs.existsSync(a) || !fs.existsSync(b)) return null; return fs.readFileSync(a).equals(fs.readFileSync(b)); });
    for (const arm of ON_ARMS) out.same[`${arm}:${ruler}`] = SEEDS.map((s) => { const a = F('off', ruler, s), b = F(arm, ruler, s); if (!fs.existsSync(a) || !fs.existsSync(b)) return null; return fs.readFileSync(a).equals(fs.readFileSync(b)); });
  }
  // 두 자가 같은 econ 판인가 — 관찰자 행(t17 ↔ t176) 같음
  out.sameEcon = {};
  for (const arm of ARMS) for (const s of SEEDS) { const a = J(F(arm, 't17', s).replace(/\.json$/, '.probe.json')), b = J(F(arm, 't176', s).replace(/\.json$/, '.probe.json')); if (a && b) out.sameEcon[`${arm}:${s}`] = JSON.stringify(a.v) === JSON.stringify(b.v); }
  const pick = (j, ruler) => {
    if (!j) return null;
    if (ruler === 't17') return { 인구: j.base.pop, 소멸: `${j.base.dead}/${j.base.ever}`, 무기Q: j.base.weapQ, 확장셀: j.base.expand, 게시: j.board.reqOpened, 도구Q: j.tool && j.tool.q, 보존식: j.preserve && j.preserve.stock, 생곡: j.eight.grain, '㉮': j.eight.densAll, '㉯': j.eight.densValue, '부족 wood': (j.short || {}).wood || 0 };
    return { 인구: j.pop, 소멸: `${j.dead}/${j.ever}`, 무기Q: j.weapQ, 확장셀: j.expand, 게시: j.reqOpened, 도구Q: j.toolQ, 보존식: j.preserved, 생곡: j.rawGrain, '㉮': j.densAll, '㉯': j.densVal,
      '통나무 모자란 마을·날': j.woodZeroDaysTot, '통나무값 평균': j.priceWoodMean, '통나무 생산': j.woodProdTot, '통나무 소비': j.woodConsTot, '땔감': j.woodFuelTot, '집 목재': j.woodBuiltTot, '통나무 수입': j.woodImportedTot, '기근 마을·날': j.famineDaysTot };
  };
  const checkDays = [30, 100, 400, 800];
  for (const ruler of ['t17', 't176']) for (const arm of ARMS) for (const s of SEEDS) {
    const j = J(F(arm, ruler, s)); if (!j) continue;
    const P = J(F(arm, ruler, s).replace(/\.json$/, '.probe.json'));
    out.rows.push(Object.assign({ ruler, arm, seed: s, wood: probeStats(P, checkDays) }, pick(j, ruler)));
  }
  console.log(`\n[두 자 · 800일 · 시드 ${SEEDS.join('·')}] 끔 = main 바이트: t17 ${out.cmp.t17.map((x) => (x == null ? '—' : x ? '○' : '✗')).join('')} · t176 ${out.cmp.t176.map((x) => (x == null ? '—' : x ? '○' : '✗')).join('')}`);
  for (const [k, v] of Object.entries(out.same)) console.log(`  팔 ${k} = 끔 바이트? ${v.map((x) => (x == null ? '—' : x ? '같음' : '다름')).join(' · ')}`);
  console.log(`  두 자 관찰자 행 같음(t17 ↔ t176): ${Object.entries(out.sameEcon).map(([k, v]) => `${k} ${v ? '○' : '✗'}`).join(' · ')}`);
  console.log('\n' + HEAD.replace(/DAYS/g, 'd30/100/400/800') + ' 기근 마을·날 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of out.rows) if (r.wood) console.log(line(`${r.ruler}·${r.arm}`, r.seed, r.wood, n0(r['기근 마을·날'])));
  doorTable(out.rows, '두 자');
  const keys = ['인구', '소멸', '무기Q', '확장셀', '게시', '도구Q', '보존식', '생곡', '㉮', '㉯', '부족 wood', '통나무 모자란 마을·날', '통나무값 평균', '통나무 생산', '통나무 소비', '땔감', '집 목재', '통나무 수입', '기근 마을·날'];
  console.log('\n| 자 | 팔 | 시드 | ' + keys.join(' | ') + ' |'); console.log('|' + '---|'.repeat(keys.length + 3));
  for (const r of out.rows) console.log(`| ${r.ruler} | ${r.arm} | ${r.seed} | ` + keys.map((k) => (r[k] == null ? '—' : typeof r[k] === 'number' ? (Number.isInteger(r[k]) ? n0(r[k]) : f2(r[k])) : r[k])).join(' | ') + ' |');
  for (const ruler of ['t17', 't176']) for (const arm of ON_ARMS) {
    const base = SEEDS.map((s) => out.rows.find((r) => r.ruler === ruler && r.arm === 'off' && r.seed === s)), A = SEEDS.map((s) => out.rows.find((r) => r.ruler === ruler && r.arm === arm && r.seed === s));
    if (base.some((x) => !x) || A.some((x) => !x)) continue;
    const D = {};
    for (const k of keys) { if (typeof base[0][k] !== 'number') continue; D[k] = T252(base.map((x) => x[k]), A.map((x) => x[k])); }
    for (const k of ['w0_30', 'w0_100', 'w0_400', 'exp30', 'pop400', 'firstDay']) { const b = base.map((x) => WK(x, k)), a = A.map((x) => WK(x, k)); if (b.some((x) => x == null) || a.some((x) => x == null)) continue; D[k] = T252(b, a); }
    out.delta[`${ruler}:${arm}`] = D;
    console.log(`\n${ruler} · ${arm} 짝 Δ% (팔 − 끔)/끔 · T252 자:`);
    for (const [k, d] of Object.entries(D)) console.log(`  ${k}: ${d.d.join(' / ')}% · 평균 ${d.mean} · 폭 ${d.width} → ${d.verdict}`);
  }
  return out;
}

// ── T650 자(서버 판) ──────────────────────────────────────────────────
function srv() {
  const out = { mode: 'srv', dir: DIR, arms: ARMS, seeds: SEEDS, BASE, det: {}, rows: [], delta: {} };
  const F = (tag, s) => path.join(DIR, `${tag}-${s}.json`);
  // 결정론 · 끔 = main — main ↔ off(따로 띄운 두 판) 날 행 첫 갈림 · 판 JSON 바이트 · 관찰자 행 같음
  for (const s of SEEDS) {
    const a = J(F('main', s)), b = J(F('off', s));
    if (!a || !b) { out.det[s] = null; continue; }
    let first = null; for (let i = 0; i < Math.min(a.rows.length, b.rows.length) && first == null; i++) if (JSON.stringify(a.rows[i]) !== JSON.stringify(b.rows[i])) first = a.rows[i][0];
    const pa = J(F('main', s) + '.t692.json'), pb = J(F('off', s) + '.t692.json');
    const pSame = pa && pb ? JSON.stringify(pa.v) === JSON.stringify(pb.v) && JSON.stringify(pa.seed) === JSON.stringify(pb.seed) : null;
    const bytes = fs.readFileSync(F('main', s)).equals(fs.readFileSync(F('off', s)));
    out.det[s] = { rows: a.rows.length, first, bytes, probeSame: pSame, eightSame: JSON.stringify(a.eight) === JSON.stringify(b.eight) };
    console.log(`  결정론 · 끔 = main 시드 ${s}: 날 행 ${first == null ? `${a.rows.length}일 같음` : '첫 갈림 날 ' + first} · 판 JSON ${bytes ? '바이트 같음' : '다름'} · 관찰자 행 ${pSame == null ? '—' : pSame ? '같음' : '다름'}`);
  }
  const checkDays = [30, 100, 400];
  for (const tag of ARMS) for (const s of SEEDS) {
    const j = J(F(tag, s)); if (!j) continue;
    const P = J(F(tag, s) + '.t692.json');
    const e = j.eight || {};
    out.rows.push({ arm: tag, seed: s, 인구: e.pop, 소멸: `${e.dead}/${e.ever}`, 빈마을: j.empty, 게시: e.board, 무기Q: e.weapQ, 확장셀: e.expand, 도구Q: e.toolQ, 보존식: e.preserve, 생곡: e.grain, wood: probeStats(P, checkDays) });
  }
  console.log(`\n[T650 자(VILLAGE_CARAVAN_MAX=0 · T400_BUILD_ACT=0 · 250ms) · 400일 · 시드 ${SEEDS.join('·')}]`);
  console.log(HEAD.replace(/DAYS/g, 'd30/100/400') + ' 식량값 중앙 · 통나무 희소도 중앙 첫 30일 · 400일 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of out.rows) if (r.wood) console.log(line(r.arm, r.seed, r.wood, `${f2(r.wood.pfMed)} · ${f2(r.wood.scarcity30)} · ${f2(r.wood.scarcityAll)}`));
  doorTable(out.rows, 'T650 자');
  const keys = ['인구', '소멸', '빈마을', '게시', '무기Q', '확장셀', '도구Q', '보존식', '생곡'];
  console.log('\n| 팔 | 시드 | ' + keys.join(' | ') + ' |'); console.log('|' + '---|'.repeat(keys.length + 2));
  for (const r of out.rows) console.log(`| ${r.arm} | ${r.seed} | ` + keys.map((k) => (r[k] == null ? '—' : typeof r[k] === 'number' ? (Number.isInteger(r[k]) ? n0(r[k]) : f2(r[k])) : r[k])).join(' | ') + ' |');
  for (const arm of ON_ARMS) {
    const base = SEEDS.map((s) => out.rows.find((r) => r.arm === 'off' && r.seed === s)), A = SEEDS.map((s) => out.rows.find((r) => r.arm === arm && r.seed === s));
    if (base.some((x) => !x) || A.some((x) => !x)) continue;
    const D = {};
    for (const k of ['인구', '게시', '무기Q', '확장셀', '도구Q', '보존식', '생곡']) D[k] = T252(base.map((x) => x[k]), A.map((x) => x[k]));
    for (const k of ['w0_30', 'w0_100', 'w0_400', 'w0b_30', 'exp30', 'firstDay', 'pfMed', 'swAll']) { const b = base.map((x) => WK(x, k)), a = A.map((x) => WK(x, k)); if (b.some((x) => x == null) || a.some((x) => x == null)) continue; D[k] = T252(b, a); }
    out.delta[arm] = D;
    console.log(`\n서버 판 · ${arm} 짝 Δ% (팔 − 끔)/끔 · T252 자:`);
    for (const [k, d] of Object.entries(D)) console.log(`  ${k}: ${d.d.join(' / ')}% · 평균 ${d.mean} · 폭 ${d.width} → ${d.verdict}`);
  }
  return out;
}

let res = null;
if (MODE === 'lab') res = lab();
else if (MODE === 'srv') res = srv();
else { console.error('쓰는 법: lab <dir> [팔] [시드] · srv <dir> [팔] [시드]'); process.exit(2); }
if (process.env.T692_JSON) { fs.writeFileSync(process.env.T692_JSON, JSON.stringify(res, null, 1)); console.log('\n→', process.env.T692_JSON); }
