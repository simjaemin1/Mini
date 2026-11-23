#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1456 표 · 판이 남긴 JSON 만 읽는다 · 손으로 세지 않는다)
// === scripts/t1456-table.js — 옛 지도 ↔ 새 지도 1,900날 저장본 · +730날(끔 · 청동 묶음) 견줌 표 [T1456 · S13 · 2026-11-23] ==========
//   쓰는 법: node scripts/t1456-table.js [<판 폴더>=계측/T1456_2026-11-23] [--keep /dev/shm/t1456/keep] > 표.md
//   읽는 것: `<폴더>/runs/<지도>-<종류>-<시드>.*`(scripts/t1456-run.sh) · 관찰기 날것 `<keep>/<태그>.{t1407,probe}.json.gz`.
//     날것이 있으면 판마다 요약을 `<폴더>/요약.json` 에 쓴다(날것이 없어도 그 요약으로 표를 다시 그린다).
//   칸 정의(T1427 · t1407-table 과 같은 뜻 — 사본 0 · kg 은 `server/weights.js` 정본):
//     인구 · 빈 마을(이름) = 관찰기 마을-날 줄 끝 날(사람 0 = 빈 마을) · 굶어 죽음 누계 = 평형 관측 줄(`T1420_OBS` · lib-eq-crit COL.fdDead) 끝 날 ·
//     청동을 쥔 마을 = t1385 꾸러미 끝(청동 근접검 ≥ 1) · 석검 : 동검 = 끝 365날 t1385 날 줄(석검 · 청동검 부은 것) 합의 비 ·
//     한 해 캔 주석 = 끝 365날 마을-날 줄 `minedTin`(원석) 합 × 원석 kg · 광부 날 평균 = 끝 365날 `miner` 평균(주석 · 구리 광부 안 가름) ·
//     평형 기준 든 날 = 안 끊은 2,000날 판 관측 줄 · `lib-eq-crit.table`(창 365) 의 C1 ≤ 0.05 · C2 ≤ 0 · C3 ≤ 0.1 · 셋 다(`reached`).
//   되살림 = `lib-eq-lab.cmpFp`(저장본 +100날 지문 ↔ 안 끊은 판 1,901 ~ 2,000) · 관찰기 = 관찰기 판 1,801 ~ 1,900 지문 ↔ 안 끊은 판.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const W = require(path.join(ROOT, 'server', 'weights.js'));
const Cr = require('./lib-eq-crit');
const { cmpFp } = require('./lib-eq-lab');
// 관찰기 판 견줌 — 관찰기는 `world.onCast` 칸 하나(감싼 훅)를 세계에 더한다(fp 의 세계 몫 `w` 가 날마다 다르다 · 실측 FPKEYS 날 2: 다른 칸 = onCast 하나).
//   그래서 관찰기 판은 마을 몫(`v` — 마을 51 통째)만 견준다: 같은 날 마을 지문이 다 같으면 "같음" · 세계 몫이 다른 날 수는 따로 적는다.
function vCmp(A, B) {
  const m = new Map((B.fp || []).map((r) => [r.d, r])); let n = 0, same = 0, wd = 0, first = null;
  for (const r of A.fp || []) { const q = m.get(r.d); if (!q) continue; n++; if (r.v.join() === q.v.join()) same++; else if (first == null) first = r.d; if (r.w !== q.w) wd++; }
  return { n, same, first, wd };
}
const KG_ORE = W.kgOf('ore_tin');
const A = process.argv.slice(2);
const DIR = path.resolve(A.find((x, i) => !x.startsWith('--') && A[i - 1] !== '--keep') || path.join(ROOT, '계측', 'T1456_2026-11-23'));
const KEEP = A.includes('--keep') ? A[A.indexOf('--keep') + 1] : '/dev/shm/t1456/keep';
const R = path.join(DIR, 'runs');
const rdz = (p) => { try { let b = fs.readFileSync(p); if (/\.gz$/.test(p)) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8')); } catch (e) { return null; } };
const SEEDS = ['1020', '7', '42'], MAPS = ['old', 'new'], MK = { old: '옛', new: '새' };
const LOST = ['광산4', '어촌1', '어촌11'], TINV = ['광산5', '임업2'], WATCH = [100, 400, 800, 1200, 1900];
const f0 = (x) => (x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(1));
const pct = (a, b) => (a == null || !b ? '—' : `${a >= b ? '+' : ''}${(100 * (a / b - 1)).toFixed(1)} %`);

const SUMF = path.join(DIR, '요약.json');
const SUM = rdz(SUMF) || {};
const done = (tag) => rdz(path.join(R, `${tag}.done`));
const obsRows = (tag, stem) => { const j = rdz(path.join(R, `${tag}.${stem}.obs.json.gz`)); return j ? j.rows || j : null; };

function summarize(tag) {   // 관찰기 날것 → 판 요약(끝 날 · 끝 365날 창 · 지켜볼 날)
  const r = rdz(path.join(KEEP, `${tag}.t1407.json.gz`)), p = rdz(path.join(KEEP, `${tag}.probe.json.gz`));
  if (!r || !r.day) return null;
  const C = (c) => r.vcols.indexOf(c), days = Object.keys(r.day).map(Number).sort((a, b) => a - b), d0 = days[0], dN = days[days.length - 1], lo = dN - 364;
  const N = (row) => (row ? row[C('N')] || 0 : 0), vi = (n) => r.names.indexOf(n);
  const end = r.day[dN], mined = {}, miner = {}, minerN = {};
  for (const d of days) { if (d < lo) continue; r.day[d].forEach((row, i) => { if (!row) return; const n = r.names[i]; mined[n] = (mined[n] || 0) + (row[C('minedTin')] || 0); miner[n] = (miner[n] || 0) + (row[C('miner')] || 0); minerN[n] = (minerN[n] || 0) + 1; }); }
  const s = { d0, dN, pop: end.reduce((a, row) => a + N(row), 0), empty: r.names.filter((n, i) => !N(end[i])),
    minedKg: Object.fromEntries(Object.entries(mined).filter(([, v]) => v > 0).map(([n, v]) => [n, +(v * KG_ORE).toFixed(1)])),
    minerAvg: Object.fromEntries(TINV.map((n) => [n, minerN[n] ? +(miner[n] / minerN[n]).toFixed(2) : null])),
    lost: Object.fromEntries(LOST.map((n) => [n, N(end[vi(n)])])) };
  // 지켜볼 날(4 ⓐ ⓑ): 광산5 의 그날까지 365날 캔 주석 kg · 처음 캔 날 · 농촌18 사람 · 처음 빈 날 · 다시 선 날
  const k5 = vi('광산5'), r18 = vi('농촌18'), cum = []; let acc = 0, first5 = null, empty18 = null, back18 = null, prevN18 = null;
  for (const d of days) {
    const row = r.day[d][k5], m = row ? row[C('minedTin')] || 0 : 0; acc += m; cum.push([d, acc]); if (m > 0 && first5 == null) first5 = d;
    const n18 = N(r.day[d][r18]); if (n18 === 0 && empty18 == null && prevN18 > 0) empty18 = d; if (empty18 != null && back18 == null && n18 > 0 && prevN18 === 0) back18 = d; prevN18 = n18;
  }
  const cumAt = (d) => { let v = 0; for (const [x, a] of cum) { if (x > d) break; v = a; } return v; };
  s.watch = Object.fromEntries(WATCH.filter((d) => d >= d0 && d <= dN).map((d) => [d, { k5Kg: +((cumAt(d) - cumAt(d - 365)) * KG_ORE).toFixed(1), r18: N(r.day[d][r18]) }]));
  s.first5 = first5; s.empty18 = empty18; s.back18 = back18; s.r18End = N(end[r18]);
  if (p && p.snaps) {
    const sd = Object.keys(p.snaps).map(Number).sort((a, b) => a - b), last = p.snaps[sd[sd.length - 1]] || [];
    const H = last.filter((v) => v[3] >= 1); s.holders = H.map((v) => v[0]);
    const dc = (c) => p.dcols.indexOf(c), pd = (p.days || []).filter((v) => v[dc('day')] > (p.days[p.days.length - 1] || [0])[dc('day')] - 365);
    s.stone = +pd.reduce((a, v) => a + (v[dc('stoneToday')] || 0), 0).toFixed(1); s.bz = +pd.reduce((a, v) => a + (v[dc('bzToday')] || 0), 0).toFixed(1);
  }
  return s;
}
for (const m of MAPS) for (const sd of SEEDS) for (const k of ['obs', 'plus-off', 'plus-bundle']) { const t = `${m}-${k}-${sd}`; const s = summarize(t); if (s) SUM[t] = s; }
fs.writeFileSync(SUMF, JSON.stringify(SUM, null, 1));

const out = [];
const T = (h, rows) => out.push('| ' + h.join(' | ') + ' |', '|' + h.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |'), '');
out.push('# T1456 — 새 주석 지도로 평형 저장본(1,900날 · 세 시드) 다시 굽기 · 옛 지도 저장본과 견줌', '');

// ① 굽기 · 되살림
{
  const rows = [];
  for (const m of MAPS) for (const sd of SEEDS) {
    const b = done(`${m}-bake-${sd}`), meta = rdz(path.join(R, `${m}-bake-${sd}.save-meta.json`));
    const fa = rdz(path.join(R, `${m}-bake-${sd}.off.fp.json.gz`)), fr = rdz(path.join(R, `${m}-ref-${sd}.ref.fp.json.gz`)), fo = rdz(path.join(R, `${m}-obs-${sd}.obs.fp.json.gz`));
    const c = fa && fr ? cmpFp(fa, fr) : null, co = fo && fr ? vCmp(fo, fr) : null;
    const pf = rdz(path.join(R, `${m}-plus-off-${sd}.off.fp.json.gz`)), cp = pf && fr ? vCmp(pf, fr) : null;
    rows.push([MK[m], sd, b ? `rc ${b.rc}` : '안 돎', meta ? `${f0(meta.bytes)} B` : '—', meta ? `\`${meta.sha}\`` : '—', meta && meta.makeSec != null ? f0(meta.makeSec) : '—',
      c ? `${c.same}/${c.n}${c.first != null ? ` · 첫 갈림 ${c.first}` : ''}` : '—', co ? `마을 ${co.same}/${co.n}${co.first != null ? ` · 첫 갈림 ${co.first}` : ''} · 세계 몫 다른 날 ${co.wd}(onCast)` : '—',
      cp ? `마을 ${cp.same}/${cp.n}${cp.first != null ? ` · 첫 갈림 ${cp.first}` : ''} · 세계 몫 다른 날 ${cp.wd}(onCast)` : '—', meta ? `\`${String(meta.sig).slice(0, 8)}\`` : '—']);
  }
  out.push('## ① 1,900날 저장본 · 되살림', '');
  T(['지도', '시드', '굽기', '크기(gzip)', 'sha', '만든 초', '되살려 +100날 = 안 끊은 판(1,901 ~ 2,000)', '관찰기 판 = 안 끊은 판(1,801 ~ 1,900)', '+730 끔 팔(관찰기) = 안 끊은 판(1,901 ~ 2,000)', '코드 지문'], rows);
}

// ② 1,900날 견줌
const at1900 = (m, sd) => SUM[`${m}-obs-${sd}`];
const crit = (m, sd) => { const rows = obsRows(`${m}-ref-${sd}`, 'ref'); if (!rows) return null; const t = Cr.table(rows, 365), e = Cr.reached(rows, 365, Cr.DEF); return { c1: t.enter['c1≤0.05'], c2: t.enter['c2≤0'], c3: t.enter['c3≤0.1'], all: e.day }; };
const fdAt = (rows, d) => { if (!rows) return null; const r = rows.filter((x) => x[Cr.COL.d] <= d).pop(); return r ? r[Cr.COL.fdDead] : null; };
const popAt = (rows, d) => { if (!rows) return null; const r = rows.filter((x) => x[Cr.COL.d] <= d).pop(); return r ? r[Cr.COL.pop] : null; };
const vlist = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${f0(v)}`).join(' · ') || '없음';
const cols = (s, fd) => [f0(s.pop), `${s.empty.length}${s.empty.length ? ' (' + s.empty.join(' · ') + ')' : ''}`, f0(fd), s.holders ? `${s.holders.length} (${s.holders.join(' · ') || '—'})` : '—',
  s.bz > 0 ? `${f1(s.stone / s.bz)} : 1 (${f0(s.stone)} · ${f0(s.bz)})` : `— (${f0(s.stone)} · 0)`, vlist(s.minedKg), TINV.map((n) => `${n} ${s.minerAvg[n] ?? '—'}`).join(' · '),
  LOST.map((n) => `${n} ${s.lost[n]}`).join(' · ')];
const H2 = ['인구', '빈 마을(이름)', '굶어 죽음 누계', '청동 쥔 마을(이름)', '석검 : 동검(끝 365날 부은 것)', '한 해 캔 주석 원석 kg(마을)', '광부 날 평균(끝 365날)', '주석 잃은 셋 사람'];
{
  const rows = [];
  for (const sd of SEEDS) for (const m of MAPS) {
    const s = at1900(m, sd), c = crit(m, sd); if (!s) { rows.push([sd, MK[m], '안 돎']); continue; }
    rows.push([sd, MK[m], ...cols(s, fdAt(obsRows(`${m}-obs-${sd}`, 'obs'), 1900)), c ? `C1 ${c.c1 ?? '안 듦'} · C2 ${c.c2 ?? '안 듦'} · C3 ${c.c3 ?? '안 듦'} · 셋 다 ${c.all ?? '안 듦'}` : '—']);
  }
  out.push('## ② 1,900날 — 옛 ↔ 새', '');
  T(['시드', '지도', ...H2, '평형 기준 든 날(안 끊은 판 · 창 365)'], rows);
}

// ③ +730날(2,630날) — 끔 · 묶음
{
  const rows = [];
  for (const arm of ['off', 'bundle']) for (const sd of SEEDS) for (const m of MAPS) {
    const tag = `${m}-plus-${arm}-${sd}`, s = SUM[tag], d = done(tag), ob = obsRows(tag, arm);
    if (!s) { rows.push([arm, sd, MK[m], d ? `rc ${d.rc}` : '안 돎']); continue; }
    const p0 = popAt(ob, 1900) ?? (ob && ob[0] ? ob[0][Cr.COL.pop] : null), p1 = popAt(ob, 2265), p2 = popAt(ob, 2630);
    rows.push([arm === 'off' ? '끔' : '묶음', sd, MK[m], ...cols(s, fdAt(ob, 2630)), `${pct(p1, p0)} · ${pct(p2, p1)}`, d ? `rc ${d.rc} · ${f0(d.sec)}초` : '—']);
  }
  out.push('## ③ +730날(날 2,630) — 끔 · 청동 묶음(`T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1`)', '');
  T(['팔', '시드', '지도', ...H2, '해마다 오름(1,901 ~ 2,265 · 2,266 ~ 2,630)', '판'], rows);
}

// ④ T1427 이 본 둘(1020) — 광산5 주석 · 농촌18
{
  const rows = [];
  for (const m of MAPS) {
    const s = at1900(m, '1020'); if (!s) continue;
    const po = SUM[`${m}-plus-off-1020`], pb = SUM[`${m}-plus-bundle-1020`];
    rows.push([MK[m], WATCH.map((d) => `${d}: ${s.watch[d] ? f0(s.watch[d].k5Kg) : '—'}`).join(' · '), s.first5 ?? '안 캠', `${po ? f0(po.minedKg['광산5'] || 0) : '—'} · ${pb ? f0(pb.minedKg['광산5'] || 0) : '—'}`,
      WATCH.map((d) => `${d}: ${s.watch[d] ? s.watch[d].r18 : '—'}`).join(' · '), `${s.empty18 ?? '안 빔'} · ${s.back18 ?? (s.empty18 != null ? '안 섬' : '—')}`, `${po ? po.r18End : '—'} · ${pb ? pb.r18End : '—'}`]);
  }
  out.push('## ④ 1020 — 광산5 가 주석을 캐나 · 농촌18 이 사나', '');
  T(['지도', '광산5 그날까지 365날 캔 주석 원석 kg', '처음 캔 날', '+730 끝 해 광산5 kg(끔 · 묶음)', '농촌18 사람(날)', '농촌18 처음 빈 날 · 다시 선 날', '+730 끝 농촌18(끔 · 묶음)'], rows);
}
process.stdout.write(out.join('\n') + '\n');
