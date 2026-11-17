#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1331 판 읽기 · 제품 무변)
// === scripts/t1331-analyze.js — `t1331-run.js` 판(탐침 줄 · t577 판 JSON)을 읽어 끔(장부 세계) : 켬(몸 세계) 표를 낸다 =====================
//   쓰는 법: node scripts/t1331-analyze.js <판 폴더> <표지 …>   (표지 = off-1020 on-1020 …)  [--json <출력>]
//   한 판마다: 날 · 존 · 몸(종별) 궤적(켬) / 장부 합 ÷ 몸 환율(끔 — 종 몫은 랩 먹잇감 섞음 3 : 1 : 2) · 멸종(종 0) · 폭증(처음 ×2 넘음) · 보존 어긋남 ·
//     사냥 고기 kg/날(econ 사냥꾼 수식 몫 `dailyProductionBuf.meat` × 2,450 kcal ÷ 1,500 kcal/kg — `kcal.js DAY_KCAL` · `meat`) · 인구(끝 · 사냥 마을) · 하루 CPU(프로세스 실 CPU 차 ÷ 날) · 벽시계.
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2);
const jOut = A.includes('--json') ? A[A.indexOf('--json') + 1] : null;
const [DIR, ...TAGS0] = A.filter((x, i) => !(x === '--json' || A[i - 1] === '--json'));
const TAGS = TAGS0;
const KG = 2450 / 1500;
const SCALE = 5000, MIX = { deer: 3 / 6, wild_boar: 1 / 6, arctic_hare: 2 / 6 };
const out = {};
for (const tag of TAGS) {
  const pj = path.join(DIR, tag + '.probe.jsonl'), pz = pj + '.gz';   // 증거 폴더엔 gzip 으로 둔다
  if (!fs.existsSync(pj) && !fs.existsSync(pz)) { console.log(`${tag}: 탐침 없음`); continue; }
  const L = (fs.existsSync(pj) ? fs.readFileSync(pj, 'utf8') : require('zlib').gunzipSync(fs.readFileSync(pz)).toString('utf8')).trim().split('\n').map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter((o) => o && o.d != null && !o.err);
  let run = null; try { const f = path.join(DIR, tag + '.json'); run = JSON.parse(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : require('zlib').gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e) {}
  let done = null; try { done = JSON.parse(fs.readFileSync(path.join(DIR, tag + '.done'), 'utf8')); } catch (e) {}
  const on = L.some((o) => o.body && o.body.w);
  const series = L.map((o) => {
    if (on) { const w = o.body.w; return { d: o.d, n: w.alive, by: w.by, mm: w.st.mismatch, cells: w.cells }; }
    const by = {}; for (const k in MIX) by[k] = Math.floor(o.sum / SCALE * MIX[k]);
    return { d: o.d, n: Math.floor(o.sum / SCALE), by, mm: 0, cells: o.cells, sum: o.sum };
  });
  const first = series.find((s) => s.n > 0) || series[0], last = series[series.length - 1];
  const sp = Object.keys(first ? first.by : {});
  const extinct = sp.filter((k) => series.some((s) => s.d > first.d && !(s.by[k] > 0)));
  const boom = sp.filter((k) => series.some((s) => s.by[k] > 2 * first.by[k]));
  const meat = L.map((o) => o.meat || 0), meanMeat = meat.reduce((a, b) => a + b, 0) / Math.max(1, meat.length);
  const cpu = (o) => (o.cpu ? (o.cpu.user + o.cpu.system) / 1e6 : NaN);
  const L1 = L.find((o) => o.d >= 2) || L[0], LN = L[L.length - 1];
  const cpuDay = (LN && L1 && LN.d > L1.d) ? (cpu(LN) - cpu(L1)) / (LN.d - L1.d) : null;
  const names = run && run.names, rowsLast = run && run.rows && run.rows[run.rows.length - 1];
  let huntPop = null, huntVil = [];
  //   사냥 마을 — 이 존엔 '사냥' 꼴 마을이 없다(광산 · 어촌 · 임업 · 농촌) ⇒ 첫날 econ 사냥꾼이 있는 마을(탐침 마을 칸 [10] = `counts.hunter`)의 끝 인구 합
  if (names && rowsLast && L[0] && L[0].vil) {
    const hv = L[0].vil.filter((v) => (v[10] || 0) > 0).map((v) => v[0]);   // 첫날 econ 사냥꾼이 있는 마을
    const row0 = run.rows[0][1];
    huntVil = hv.map((n) => { const i = names.indexOf(n); return [n, i >= 0 ? row0[i] : null, i >= 0 ? rowsLast[1][i] : null]; });
    huntPop = huntVil.reduce((a, x) => a + (x[2] || 0), 0);
  }
  const b = on ? LN.body : null;
  const r = {
    tag, on, days: LN ? LN.d : 0, zone: LN && LN.zone, start: first && first.n, end: last && last.n, min: Math.min(...series.map((s) => s.n)), max: Math.max(...series.map((s) => s.n)),
    byStart: first && first.by, byEnd: last && last.by, extinct, boom, mismatch: last ? last.mm : null,
    meatKgDay: +(meanMeat * KG).toFixed(1), meatKgEnd: +((meat[meat.length - 1] || 0) * KG).toFixed(1), popEnd: LN ? LN.pop : null, eight: run && run.eight, empty: run && run.empty, huntPop, huntVil,
    cpuSecDay: cpuDay != null ? +cpuDay.toFixed(3) : null, wallSec: done ? +done.sec : null,
    bodyCpuMsDay: b ? +(b.cpuUs / 1000 / Math.max(1, LN.d)).toFixed(1) : null, saves: b ? b.saves : null, huntKill: b ? b.huntKill : null,
    st: b && b.w ? b.w.st : null, show: LN && LN.show,
    traj: series.filter((s, i) => i === 0 || s.d % 50 === 0 || i === series.length - 1).map((s) => [s.d, s.n, s.by]),
  };
  out[tag] = r;
  console.log(`\n■ ${tag} (${on ? '켬 · 몸' : '끔 · 장부 ÷ ' + SCALE}) ${r.zone} ${r.days}날 — 몸 ${r.start} → ${r.end} (최저 ${r.min} · 최고 ${r.max}) · 종 ${JSON.stringify(r.byStart)} → ${JSON.stringify(r.byEnd)}`);
  console.log(`  멸종 ${r.extinct.length ? r.extinct.join(',') : 0} · 폭증 ${r.boom.length ? r.boom.join(',') : 0} · 보존 어긋남 ${r.mismatch} · 사냥 고기 ${r.meatKgDay} kg/날(끝 ${r.meatKgEnd}) · 인구 끝 ${r.popEnd} · 사냥 마을 ${r.huntPop}`
    + ` · CPU ${r.cpuSecDay} 초/날 · 벽 ${r.wallSec}초${on ? ` · 몸 층 CPU ${r.bodyCpuMsDay} ms/날(쉼표 사이 포함) · 사냥 죽음 ${r.huntKill}` : ''}`);
  if (r.eight) console.log(`  여덟 수 ${JSON.stringify(r.eight)} · 빈 마을 ${r.empty}`);
  if (on && r.st) console.log(`  셈 ${JSON.stringify({ start: r.st.start, born: r.st.born, died: r.st.died, out: r.st.out, in: r.st.in, tame: r.st.tame, walkers: r.st.walkers, arrive: r.st.arrive, stepBad: r.st.stepBad, bornFar: r.st.bornFar, audits: r.st.audits })}`);
  console.log(`  궤적 ${r.traj.map((t) => `${t[0]}:${t[1]}`).join(' ')}`);
}
if (jOut) fs.writeFileSync(jOut, JSON.stringify(out, null, 1));
