#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 격차 자 요약 JSON 여럿을 끈 판과 나란히 · 판정 0)
// === scripts/t1113-compare.js — T1113 손잡이 판(질 · 출정 · 셋 다)을 끈 판과 격차 자 수로 견준다 ====================
//   node scripts/t1113-compare.js off=<off.json> lq=<lq.json> muster=<muster.json> all=<all.json>
//   각 JSON = `gap-ruler.js --out` 요약(시드 → { base, shock }).
//   칸마다 끈 판 대비 "같음 · 나음 · 나쁨"을 **글자로만** 적는다(문턱 0 · 같음 = 값이 같을 때만). 어느 쪽이 나은지의 방향:
//     지니(가운데 → 끝)는 작을수록 · 하위 10 바닥 비율은 작을수록 · 빈 마을 · 해체는 적을수록 · 끝 총인구는 클수록 ·
//     충격 마을 끝 비율(대조 대비)은 클수록(0 에 가까울수록 · 음수가 덜할수록) · 상위 10 바닥 비율은 참고(방향 없음).
'use strict';
const fs = require('fs');
const A = Object.fromEntries(process.argv.slice(2).map((x) => x.split('=')).filter((p) => p.length === 2));
const R = {}; for (const [k, f] of Object.entries(A)) R[k] = JSON.parse(fs.readFileSync(f, 'utf8'));
if (!R.off) { console.error('off= 가 있어야 합니다'); process.exit(1); }
const names = Object.keys(R);
const seeds = Object.keys(R.off).sort();
const row = (S) => {
  const B = S && S.base, K = S && S.shock && S.shock.shock;
  if (!B) return null;
  const end = B.marks[B.marks.length - 1];
  return {
    gPop: B.mid ? B.mid.dPop : null, gGran: B.mid ? B.mid.dGran : null,
    bot: B.floor.bottom.share, top: B.floor.top.share,
    empty: B.empty, diss: B.dissolved, pop: end.pop,
    shockRel: K && K.ctl ? K.ctl.endRel : null, worst: K && K.ctl ? K.ctl.worstGap : null, caught: K && K.ctl ? K.ctl.caught : null,
  };
};
const dir = { gPop: -1, gGran: -1, bot: -1, empty: -1, diss: -1, pop: +1, shockRel: +1 };
const cmp = (k, v, o) => (v == null || o == null || dir[k] == null ? '' : v === o ? '같음' : ((v - o) * dir[k] > 0 ? '나음' : '나쁨'));
const f = (x) => (x == null ? '—' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(3)) : String(x));
console.log('| 시드 | 판 | 인구 지니 가운데→끝 | 곳간 지니 가운데→끝 | 하위 10 바닥 비율 | 상위 10 바닥 비율 | 빈 마을 | 해체 | 끝 총인구 | 흉년 마을 끝 비율(대조 대비) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
const tally = {};
for (const s of seeds) {
  const o = row(R.off[s]);
  for (const n of names) {
    const r = row(R[n] && R[n][s]); if (!r) continue;
    const c = (k) => (n === 'off' ? '' : ` ${cmp(k, r[k], o[k])}`);
    if (n !== 'off') for (const k of Object.keys(dir)) { const t = cmp(k, r[k], o[k]); if (t) ((tally[n] = tally[n] || { 같음: 0, 나음: 0, 나쁨: 0 })[t]++); }
    console.log(`| ${s} | ${n} | ${f(r.gPop)}${c('gPop')} | ${f(r.gGran)}${c('gGran')} | ${f(r.bot)}${c('bot')} | ${f(r.top)} | ${f(r.empty)}${c('empty')} | ${f(r.diss)}${c('diss')} | ${f(r.pop)}${c('pop')} | ${f(r.shockRel)}${c('shockRel')} |`);
  }
}
console.log('\n| 판 | 칸 수(시드 × 칸 7) | 같음 | 나음 | 나쁨 |');
console.log('|---|---:|---:|---:|---:|');
for (const n of names) if (tally[n]) { const t = tally[n]; console.log(`| ${n} | ${t.같음 + t.나음 + t.나쁨} | ${t.같음} | ${t.나음} | ${t.나쁨} |`); }
