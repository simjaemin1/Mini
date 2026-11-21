#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1407 표 · 계측 JSON 만 읽는다 · 판을 돌리거나 수를 제품에 되먹이지 않는다)
// === scripts/t1407-table.js — 주석의 한 해 · 구리 : 주석 · 굶는 마을이 붓는 줄 · 팔마다 판 ==========
//   쓰는 법: node scripts/t1407-table.js <판 뿌리> [--json <요약.json>]
//     판 뿌리 = `<꼴>-<팔>-<시드>/` 자리들(`계측/T1407_2026-11-21/run07.sh` 이 만든다) — 판마다 t1407 관찰기(주석 장부) · t1385 관찰기(청동 몫 · 날 50/100 꾸러미).
//   kg = `server/weights.js` 정본(`kgOf` — 주석 3 · 구리 3.5 · 원석 5 · 무기 1.5) · 녹임 수율 = econ `SMELT_YIELD`(0.33) — 수를 이 파일에 적지 않는다(사본 0).
//   쥔 마을 · 절반 넘는 마을 · 세계 청동 % = T1385 · T1398 표의 그 정의(청동 근접검 ≥ 1 · 청동 > 근접검 ÷ 2 · Σ 청동 ÷ Σ 근접검 — `t1398-table.js` 와 같은 칸).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = require(path.join(ROOT, 'server', 'weights.js'));
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const KG = { tin: W.kgOf('tin'), cu: W.kgOf('copper'), ore: W.kgOf('ore_tin'), weapon: W.kgOf('weapon') };
const SY = E.SMELT_YIELD != null ? E.SMELT_YIELD : (E._SMELT_YIELD != null ? E._SMELT_YIELD : null);
if (!(SY > 0)) throw Error('SMELT_YIELD 을 econ 에서 못 읽음');
const args = process.argv.slice(2);
const root = args[0]; if (!root) throw Error('판 뿌리 필요');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const read = (p) => { const b = fs.readFileSync(p); return JSON.parse(p.endsWith('.gz') ? require('zlib').gunzipSync(b).toString('utf8') : b.toString('utf8')); };   // 계측 폴더엔 .gz 로 둔다
const f2 = (x, d = 2) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(d));
const f1 = (x) => f2(x, 1), f0 = (x) => f2(x, 0);
const pct = (a, b) => (b > 0 ? (100 * a / b).toFixed(1) + ' %' : '—');

function loadRun(dir) {
  const base = path.join(root, dir), files = fs.readdirSync(base);
  const f07 = files.find((f) => /(^|\.)t1407\.json(\.gz)?$/.test(f)), fp = files.find((f) => /^probe\.json(\.gz)?$/.test(f) || /\.t1385\.json(\.gz)?$/.test(f));
  if (!f07) return null;
  const r = read(path.join(base, f07)); if (r.err) throw Error(dir + ': ' + r.err);
  const p = fp ? read(path.join(base, fp)) : null;
  const [kind, arm, seed] = dir.split('-');
  return { dir, kind, arm, seed, r, p };
}
function summarize(run) {
  const { r, p } = run, C = (c) => r.vcols.indexOf(c);
  const days = Object.keys(r.day).map(Number).sort((a, b) => a - b), d0 = days[0], dN = days[days.length - 1];
  const span = dN - d0 + 1, yr = 365 / span;
  const tot = {}, per = {}, lastCast = {};
  for (const d of days) r.day[d].forEach((row, i) => {
    if (!row) return; const n = r.names[i], P = per[n] || (per[n] = {});
    for (const c of ['minedTin', 'minedCu', 'smeltTin', 'smeltCu', 'castTin', 'castCu', 'cast', 'castBz', 'crisis']) { const x = row[C(c)] || 0; tot[c] = (tot[c] || 0) + x; P[c] = (P[c] || 0) + x; }
    P.days = (P.days || 0) + 1;
    if ((row[C('castBz')] || 0) > 0) lastCast[n] = d;
  });
  const end = r.day[dN], start = r.day[d0];
  let tinEnd = 0, oreTinEnd = 0, cuEnd = 0, pop = 0, alive = 0, stale = 0, dead = 0, pop0 = 0;
  const emptyNames = [];
  end.forEach((row, i) => {
    if (!row) { emptyNames.push(r.names[i]); return; }
    const t = row[C('tin')] || 0; tinEnd += t; oreTinEnd += row[C('oreTin')] || 0; cuEnd += row[C('cu')] || 0; pop += row[C('N')]; alive++; dead += row[C('fdDead')] || 0;
    if (!(lastCast[r.names[i]] > dN - 30)) stale += t;   // 지난 30날 청동을 안 부은 마을이 쥔 주석(T1385 "묵은" 정의)
  });
  let tin0 = 0, oreTin0 = 0; start.forEach((row) => { if (!row) return; tin0 += row[C('tin')] || 0; oreTin0 += row[C('oreTin')] || 0; pop0 += row[C('N')]; });
  const legs = { tin: [0, 0], ore_tin: [0, 0], weapon: [0, 0] };
  for (const L of r.legs) { const [, , , sr, sa] = L; if (sr && legs[sr]) { legs[sr][0]++; legs[sr][1] += sa || 0; } }
  const tinV = (r.deposits || []).filter((d) => d[3] && d[3].tin > 0);
  let probe = null;
  if (p && p.snaps) {
    const sd = Object.keys(p.snaps).map(Number).sort((a, b) => a - b), last = sd[sd.length - 1], s = p.snaps[last] || [];
    const H = s.filter((v) => v[3] >= 1), sumB = s.reduce((a, v) => a + v[3], 0), sumM = s.reduce((a, v) => a + v[2], 0);
    const hB = H.reduce((a, v) => a + v[3], 0), hM = H.reduce((a, v) => a + v[2], 0);
    const col = Object.fromEntries(p.dcols.map((k, i) => [k, i]));
    const stoneMade = (p.days || []).reduce((a, v) => a + (v[col.stoneToday] || 0), 0), bzMade = (p.days || []).reduce((a, v) => a + (v[col.bzToday] || 0), 0);
    probe = { day: last, alive: s.length, holders: H.length, holderNames: H.map((v) => v[0] + ' ' + f1(v[3]) + '/' + f1(v[2])), half: s.filter((v) => v[3] > v[2] / 2).length,
      worldBz: sumM > 0 ? sumB / sumM : null, holdBz: hM > 0 ? hB / hM : null, melee: sumM, bronze: sumB, stoneMade, bzMade };
  }
  return { dir: run.dir, kind: run.kind, arm: run.arm, seed: run.seed, d0, dN, span, yr, tot, per, tinEnd, oreTinEnd, cuEnd, pop, pop0, alive, stale, dead, emptyNames,
    tin0, oreTin0, legs, tinV, probe };
}
const runs = [];
//   끝난 판만 — 뿌리의 `done.txt`(러너가 판마다 한 줄 `<꼴>-<팔>-<시드> rc=0`)가 있으면 그 줄이 있는 판만 읽는다(돌고 있는 판의 반쪽 JSON 을 안 섞는다).
const doneTxt = fs.existsSync(path.join(root, 'done.txt')) ? fs.readFileSync(path.join(root, 'done.txt'), 'utf8') : null;
for (const dir of fs.readdirSync(root).sort()) {
  if (!/^(server|lab)-[a-z0-9]+-\d+$/.test(dir) || !fs.statSync(path.join(root, dir)).isDirectory()) continue;
  if (doneTxt != null && !new RegExp(' ' + dir + ' rc=0 ').test(doneTxt)) { console.log(`<!-- 안 끝남 ${dir} -->`); continue; }
  const run = loadRun(dir); if (!run) { console.log(`<!-- 관찰 없음 ${dir} -->`); continue; }
  runs.push(Object.assign(summarize(run), { _r: run.r }));
}
const ORDER = { off: 0, bundle: 1, b84: 2, ka: 3, kb: 4, kc: 5, kbc: 6 };
runs.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (+a.seed === 1020 ? -1 : 0) - (+b.seed === 1020 ? -1 : 0) || +a.seed - +b.seed || (ORDER[a.arm] ?? 9) - (ORDER[b.arm] ?? 9));
function table(h, rows) { console.log('| ' + h.join(' | ') + ' |\n|' + h.map(() => '---').join('|') + '|'); for (const x of rows) console.log('| ' + x.join(' | ') + ' |'); console.log(''); }

console.log(`<!-- t1407-table · kg: 주석 ${KG.tin} · 구리 ${KG.cu} · 원석 ${KG.ore} · 무기 ${KG.weapon} · 녹임 수율 ${SY} -->\n`);
console.log('### ⓐ 주석의 한 해 — 묻힌 양 → 캔 원석 → 녹임 → 부음 → 남은 곳간 (한 해 = 판 날 수로 나눈 365날 몫)\n');
table(['판', '주석 광맥 마을(조성 몫 · 땅 주석)', '씨앗 주석 원석 · 주석(날 ' + (runs[0] ? runs[0].d0 : 2) + ')', '캔 주석 원석 / 해(kg)', '녹인 주석 / 해(kg)', '부은 주석 / 해(kg)', '청동 검 / 해', '남은 주석(끝 · kg)', '묵은 주석 몫(끝)', '주석 짐(줄 · kg) · 원석 짐'],
  runs.map((s) => [s.dir, s.tinV.map((d) => d[0] + ' ' + f2(d[3].tin) + '·' + f2(d[2])).join(' / ') || '—', f1(s.oreTin0 * KG.ore) + ' · ' + f1(s.tin0 * KG.tin) + ' kg',
    f1(s.tot.minedTin * s.yr * KG.ore), f1(s.tot.smeltTin * s.yr * KG.tin), f1(s.tot.castTin * s.yr * KG.tin), f1(s.tot.castBz * s.yr), f1(s.tinEnd * KG.tin), pct(s.stale, s.tinEnd),
    s.legs.tin[0] + ' · ' + f1(s.legs.tin[1] * KG.tin) + ' / ' + s.legs.ore_tin[0] + ' · ' + f1(s.legs.ore_tin[1] * KG.ore)]));

console.log('### ⓑ 구리 : 주석 — 청동 검 한 자루의 주석 · 세계가 한 해 캐는 주석으로 만들 수 있는 동검\n');
table(['판', '검 한 자루 주석 kg · 구리 kg(부은 것 ÷ 청동 검)', '한 해 캔 주석(금속 kg — 원석 × 수율)', '그 주석으로 동검 / 해', '마을당(/51) · 100 사람당', '한 해 녹인 주석(씨앗 포함)으로 동검 / 해', '한 해 실제 부은 청동 검 · 석검(관찰기)', '석검 : 동검(부은 것)'],
  runs.map((s) => {
    const tinPer = s.tot.castBz > 0 ? s.tot.castTin * KG.tin / s.tot.castBz : null, cuPer = s.tot.castBz > 0 ? s.tot.castCu * KG.cu / s.tot.castBz : null;
    const minedMetalKg = s.tot.minedTin * SY * KG.tin * s.yr, can = tinPer ? minedMetalKg / tinPer : null, canS = tinPer ? s.tot.smeltTin * KG.tin * s.yr / tinPer : null;
    const st = s.probe ? s.probe.stoneMade * s.yr : null, bz = s.probe ? s.probe.bzMade * s.yr : null;
    return [s.dir, f2(tinPer, 3) + ' · ' + f2(cuPer, 3), f1(minedMetalKg), f1(can), f2(can != null ? can / 51 : null) + ' · ' + f2(can != null && s.pop > 0 ? can / (s.pop / 100) : null),
      f1(canS), f1(bz) + ' · ' + f1(st), bz > 0 ? f1(st / bz) + ' : 1' : '—'];
  }));

console.log('### 판 — 쥔 마을 · 청동 몫 · 빈 마을 · 인구 · 수출 줄\n');
const offOf = (s) => runs.find((o) => o.kind === s.kind && o.seed === s.seed && o.arm === 'off');
table(['판', '쥔 마을 /51', '쥔 마을 병기고 청동 몫', '절반 넘는 마을', '세계 병기고 청동 %', '청동 누계(관찰기)', '주석 곳간(끝 · kg)', '빈 마을(끔엔 사는데 빈 · 이름)', '인구(끔비)', '굶어 죽음', '무기 짐(줄 · 자루)', '쥔 마을(청동 / 근접검)'],
  runs.map((s) => {
    const o = offOf(s), newly = o ? s.emptyNames.filter((n) => !o.emptyNames.includes(n)) : [];
    const P = s.probe || {};
    return [s.dir, P.holders ?? '—', P.holdBz != null ? pct(P.holdBz, 1) : '—', P.half ?? '—', P.worldBz != null ? pct(P.worldBz, 1) : '—', f1(s.tot.castBz), f1(s.tinEnd * KG.tin),
      s.emptyNames.length + (o && s !== o ? ' (' + newly.length + (newly.length ? ' · ' + newly.join(' · ') : '') + ')' : ''), s.pop + (o && s !== o ? ' (' + f2(s.pop / o.pop, 3) + ')' : ''), s.dead,
      s.legs.weapon[0] + ' · ' + f1(s.legs.weapon[1]), (P.holderNames || []).join(' / ')];
  }));

// ⓒ 굶는 마을 — 끔엔 사는데 켠 팔에서 비거나(또는 끝 사람 비 < 0.5) 된 마을: 붓는 줄(대장장이 · 주조)과 먹을 것 장부(낸 것 · 들어온 · 나간 짐)를 나란히
console.log('### ⓒ 굶는 마을이 붓는 줄 — 끔엔 사는데 켠 팔에서 비거나 반 밑으로 준 마을\n');
const cTrace = [], cSum = [];
const legIdx = (r) => {   // 마을-날 먹을 것 짐(들어온 · 나간 — 식량 환산)
  if (r._legIdx) return r._legIdx; const M = new Map();
  for (const L of r.legs) { const [d, g, t, , , fe] = L; if (!(fe > 0)) continue;
    const a = M.get(t + '|' + d) || [0, 0]; a[0] += fe; M.set(t + '|' + d, a);
    const b = M.get(g + '|' + d) || [0, 0]; b[1] += fe; M.set(g + '|' + d, b); }
  return (r._legIdx = M);
};
for (const s of runs) {
  if (s.arm === 'off') continue; const o = offOf(s); if (!o) continue;
  const r = s._r, ro = o._r, C = (c) => r.vcols.indexOf(c), lastS = r.day[s.dN], lastO = ro.day[o.dN];
  const LI = legIdx(r);
  r.names.forEach((n, i) => {
    const io = ro.names.indexOf(n), a = lastS[i], b = lastO[io];
    if (!b) return; const nb = b[C('N')], na = a ? a[C('N')] : 0;
    if (!((na === 0 && nb > 0) || (nb >= 10 && na / nb < 0.5))) return;
    const days = Object.keys(r.day).map(Number).sort((x, y) => x - y);
    const rows = []; let acc = { cast: 0, bz: 0, crisis: 0, n: 0, prod: 0, inF: 0, outF: 0 }, accO = { prod: 0, n: 0 };
    let smithDays = 0, castAll = 0, outHungry = 0, hungryDays = 0, peakN = 0, peakProd = 0, masonPeak = 0, lastDead = 0, minAfter = null;
    for (const d of days) {
      const row = r.day[d][i], ob = ro.day[d] ? ro.day[d][io] : null, lg = LI.get(n + '|' + d) || [0, 0];
      if (row) {
        acc.cast += row[C('cast')] || 0; acc.bz += row[C('castBz')] || 0; acc.crisis += row[C('crisis')] || 0; acc.n++; acc.prod += row[C('fdProd')] || 0; acc.inF += lg[0]; acc.outF += lg[1];
        smithDays += row[C('smith')] || 0; castAll += row[C('cast')] || 0; if ((row[C('foodDays')] || 0) < 30) { hungryDays++; outHungry += lg[1]; }
        if (row[C('N')] > peakN) peakN = row[C('N')]; masonPeak = Math.max(masonPeak, row[C('mason')] || 0); lastDead = row[C('fdDead')] || 0;
      }
      if (ob) { accO.prod += ob[C('fdProd')] || 0; accO.n++; }
      if (d % 25 === 0 || d === s.dN) {
        const k = Math.max(1, acc.n), perP = row && row[C('N')] ? acc.prod / k / row[C('N')] : null;
        if (perP != null && d >= 50) { if (perP > peakProd) { peakProd = perP; minAfter = null; } else if (minAfter == null || perP < minAfter) minAfter = perP; }
        const offCell = ob ? ob[C('N')] + ' · ' + f0(ob[C('foodDays')]) + ' · ' + f2(accO.n && ob[C('N')] ? accO.prod / accO.n / ob[C('N')] : null) : '—';
        rows.push(row ? [d, row[C('N')], f0(row[C('foodDays')]), acc.crisis + '/' + acc.n, row[C('foodW')], row[C('mason')], row[C('smith')], f1(acc.cast) + ' · ' + f1(acc.bz), f2(perP), f1(acc.inF / k), f1(acc.outF / k), f1(row[C('pFood')]), row[C('fdDead')], offCell]
          : [d, 0, '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', offCell]);
        acc = { cast: 0, bz: 0, crisis: 0, n: 0, prod: 0, inF: 0, outF: 0 }; accO = { prod: 0, n: 0 };
      }
    }
    cTrace.push({ run: s.dir, name: n, endN: na, offN: nb, rows });
    cSum.push([s.dir, n, na + ' (끔 ' + nb + ' · 가장 많을 때 ' + peakN + ')', smithDays + ' · ' + f1(castAll), hungryDays, f1(outHungry), f2(peakProd) + ' → ' + f2(minAfter), masonPeak + ' → ' + (a ? a[C('mason')] : 0), lastDead]);
  });
}
table(['판', '마을', '끝 사람', '대장장이-날 · 부은 검(판 내내)', '굶는 날(곳간 < 30날치)', '굶는 날 내보낸 먹을 것(식량 환산 합)', '사람당 낸 먹을 것/날(날 50 뒤 가장 높은 마디 → 그 뒤 가장 낮은 마디)', '석공(가장 많을 때 → 끝)', '굶어 죽음(누계)'], cSum);
for (const t of cTrace) {
  console.log(`**${t.run} · ${t.name}** — 끝 사람 ${t.endN} (끔 ${t.offN})\n`);
  table(['날', '사람', '곳간 날치', '굶는 날(마디)', '식량 일꾼', '석공', '대장장이', '부은 검 · 청동(마디)', '사람당 낸 먹을 것/날', '들어온 먹을 것/날', '나간 먹을 것/날', '식량 값', '굶어 죽음(누계)', '끔: 사람 · 날치 · 사람당 낸 것'], t.rows);
}
// 팔 묶음 — 시드 셋을 한 칸에(1020 · 7 · 42 차례 · 없는 판 —) · 재민 표와 보고 첫 줄이 읽는다
console.log('### 팔 묶음 — 시드 1020 · 7 · 42 를 한 칸에\n');
const SEEDS = ['1020', '7', '42'];
const pick = (kind, arm, f) => SEEDS.map((sd) => { const x = runs.find((q) => q.kind === kind && q.arm === arm && q.seed === sd); return x ? f(x) : '—'; }).join(' · ');
const med = (a) => { const b = a.filter((x) => isFinite(x)).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
const holdMed = (x) => { const P = x.probe; if (!P || !P.holderNames) return null; return med(P.holderNames.map((t) => { const m = t.match(/ ([\d.]+)\/([\d.]+)$/); return m && +m[2] > 0 ? +m[1] / +m[2] : NaN; })); };
const ARMS = Object.keys(ORDER).filter((a) => runs.some((q) => q.arm === a));
for (const kind of ['lab', 'server']) {
  if (!runs.some((q) => q.kind === kind)) continue;
  console.log(`**${kind === 'lab' ? '두 해 랩(800날)' : '서버 자(400날)'}**\n`);
  table(['팔', '캔 주석 원석 kg/해', '녹인 주석 kg/해', '부은 주석 kg/해', '청동 검/해', '석검 : 동검(부은 것)', '쥔 마을 /51', '쥔 마을 청동 몫(모아 · 가운데)', '절반 넘는 마을', '세계 병기고 청동 %', '주석 곳간 끝 kg', '빈 마을(끔엔 사는데)', '인구(끔비)', '굶어 죽음', '무기 짐 줄'],
    ARMS.filter((a) => runs.some((q) => q.kind === kind && q.arm === a)).map((a) => [a,
      pick(kind, a, (x) => f0(x.tot.minedTin * x.yr * KG.ore)), pick(kind, a, (x) => f0(x.tot.smeltTin * x.yr * KG.tin)), pick(kind, a, (x) => f0(x.tot.castTin * x.yr * KG.tin)),
      pick(kind, a, (x) => f0(x.tot.castBz * x.yr)), pick(kind, a, (x) => (x.probe && x.probe.bzMade > 0 ? f1(x.probe.stoneMade / x.probe.bzMade) : '—')),
      pick(kind, a, (x) => (x.probe ? x.probe.holders : '—')), pick(kind, a, (x) => (x.probe && x.probe.holdBz != null ? f0(100 * x.probe.holdBz) + '/' + f0(100 * holdMed(x)) + '%' : '—')),
      pick(kind, a, (x) => (x.probe ? x.probe.half : '—')), pick(kind, a, (x) => (x.probe && x.probe.worldBz != null ? f1(100 * x.probe.worldBz) : '—')),
      pick(kind, a, (x) => f0(x.tinEnd * KG.tin)), pick(kind, a, (x) => { const o = offOf(x); return o && o !== x ? String(x.emptyNames.filter((n) => !o.emptyNames.includes(n)).length) : String(x.emptyNames.length); }),
      pick(kind, a, (x) => { const o = offOf(x); return o && o !== x ? f2(x.pop / o.pop) : String(x.pop); }), pick(kind, a, (x) => x.dead), pick(kind, a, (x) => x.legs.weapon[0])]));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(runs.map((s) => { const o = Object.assign({}, s); delete o._r; delete o.per; return o; }), null, 1));
