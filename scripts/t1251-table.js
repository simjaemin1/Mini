'use strict';
// (@regress 없음 — 러너 밖 · T1251 표 자 · 읽기만)
// === scripts/t1251-table.js — 나무꾼 몸 행위 판의 10날 표 — 관찰기 셋(t1251 · t1230 · t1243)에서 =====================================
//   쓰는 법: node scripts/t1251-table.js <판 머리(…/ON-1020)> [<판 머리> …]   → JSON(판마다 10날 줄) · `--md` 면 마크다운 표
//   날 d 칸 = 날 d 머리의 값 · 출생 · 몸 목재 · 벤 건수 · econ 식 몫 · 주거 문 · 몸 하루 = 그 앞 10날(d−10 ~ d−1) 합 또는 평균
//   칸: 인구 · 출생 · 나무꾼(econ) · 몸이 들여온 목재(단) · 벤(곳간에 든 귀환 건수) · econ 식 몫(단 — 끔 판은 이것이 곳간에 든다) · 곳간 목재 ·
//     주거(econ `housing` 합) · 주거 문 날(%) · 출생 0 의 주거 문 몫(%) · 목재 그림자 값 · 선 그루 · K · 되살아난 그루 누계 · 몸 하루 일 · 걸음 · 쉼 · 잠 %
const fs = require('fs');
const args = process.argv.slice(2), MD = args.includes('--md');
const heads = args.filter((a) => a !== '--md');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function arm(head) {
  const W = rd(head + '.t1251.json'), T = rd(head + '.t1230.json'), G = rd(head + '.t1243.json');
  if (!W) return { head, err: 't1251 없음' };
  const wi = (k) => W.cols.indexOf(k), ti = (k) => (T ? T.cols.indexOf(k) : -1);
  const WR = new Map(W.rows.map((r) => [r[0], r])), TR = new Map(((T && T.rows) || []).map((r) => [r[0], r]));
  const out = [];
  for (const t of W.ten) {
    const d = t.day, r = WR.get(d); if (!r) continue;
    const sum = (M, idx, k) => { let s = 0; for (let x = d - 10; x < d; x++) { const q = M.get(x); if (q && idx(k) >= 0) s += +q[idx(k)] || 0; } return s; };
    const born = sum(TR, ti, 'born'), vd = sum(TR, ti, 'vil'), gH = sum(TR, ti, 'gHouse');
    const zH = sum(TR, ti, 'zHouse'), z = zH + sum(TR, ti, 'zGran') + sum(TR, ti, 'zK') + sum(TR, ti, 'zH') + sum(TR, ti, 'zOther');
    const q = TR.get(d - 1) || TR.get(d);
    const px = q && ti('pxPop') >= 0 && q[ti('pxPop')] ? q[ti('pxWoodW')] / q[ti('pxPop')] : null;
    const st = { work: 0, walk: 0, wander: 0, rest: 0, sleep: 0, eat: 0, other: 0 };
    for (let x = d - 10; x < d; x++) { const s = ((G && G.body) || {})[x]; if (s) for (const k of Object.keys(st)) st[k] += s[k] || 0; }
    const sn = Object.values(st).reduce((p, v) => p + v, 0);
    const tr = t.trees || null;
    out.push({ d, pop: r[wi('pop')], born, lumber: r[wi('lumber')],
      bodyWood: sum(WR, wi, 'bodyWood'), cut: sum(WR, wi, 'cutN'), woodD: sum(WR, wi, 'woodD'),
      woodSt: r[wi('woodSt')], housing: r[wi('housing')], gateDays: vd ? gH / vd : null, zHouse: z ? zH / z : null, pxWood: px,
      trees: tr && !tr.err ? tr.trees : null, K: tr && !tr.err ? tr.K : null, back: tr && !tr.err ? tr.back : null, cutDay: tr && !tr.err ? tr.cutDay : null,
      terr: t.terr && !t.terr.err && t.terr.days ? { days: t.terr.days, stallWood: t.terr.stallWood, stallBody: t.terr.stallBody, cells: t.terr.cells, share: t.terr.stallWood / t.terr.days } : null,
      body: sn ? { work: st.work / sn, walk: st.walk / sn, rest: st.rest / sn, sleep: st.sleep / sn } : null, jobs: t.jobs || null });
  }
  return { head, rows: out, err: W.err || (T && T.err) || null };
}
const res = heads.map(arm);
if (!MD) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }
const f0 = (x) => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const pc = (x) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(1) + '%');
const ROWS = [
  ['인구', (r) => f0(r.pop)], ['출생(앞 10날)', (r) => f0(r.born)], ['나무꾼(econ)', (r) => f0(r.lumber)],
  ['몸이 들여온 목재(단 · 앞 10날)', (r) => f0(r.bodyWood)], ['벤 · 곳간에 든 귀환(건 · 앞 10날)', (r) => f0(r.cut)], ['econ 식 몫(단 · 앞 10날)', (r) => f0(r.woodD)],
  ['곳간 목재', (r) => f0(r.woodSt)], ['주거(econ)', (r) => f0(r.housing)], ['주거 문 날', (r) => pc(r.gateDays)], ['출생 0 의 주거 문 몫', (r) => pc(r.zHouse)],
  ['목재 값', (r) => f0(r.pxWood)], ['선 그루 · K', (r) => (r.trees == null ? '—' : `${f0(r.trees)} · ${f0(r.K)}`)], ['되살아난 그루(누계)', (r) => f0(r.back)],
  ['영토 막힘(통나무 · 누계)', (r) => (r.terr ? `${pc(r.terr.share)} (${f0(r.terr.stallWood)}/${f0(r.terr.days)})` : '—')],
  ['몸 하루 일 · 걸음 · 쉼 · 잠 %', (r) => (r.body ? `${(r.body.work * 100).toFixed(1)} · ${(r.body.walk * 100).toFixed(1)} · ${(r.body.rest * 100).toFixed(1)} · ${(r.body.sleep * 100).toFixed(1)}` : '—')],
];
for (const a of res) {
  console.log(`\n### ${a.head.split('/').pop()}${a.err ? ' (err ' + a.err + ')' : ''}\n`);
  const R = a.rows || [];
  console.log('| 칸 | ' + R.map((r) => '날 ' + r.d).join(' | ') + ' |');
  console.log('|---|' + R.map(() => '---:').join('|') + '|');
  for (const [nm, fn] of ROWS) console.log(`| ${nm} | ` + R.map(fn).join(' | ') + ' |');
}
