'use strict';
// (@regress 없음 — 러너 밖 · T1347 표 자 · 읽기만)
// === scripts/t1347-labtab.js — 랩 세계 100날 팔 표(`t1347-lab.js` 출력 · `계측/T1347_2026-11-17/lab47.sh`) — 난수열(LAB_SEED)마다 · 팔 ÷ 합금 발주만 비의 평균 · 퍼짐 ==========
//   쓰는 법: node scripts/t1347-labtab.js <폴더>   (랩-<팔>.json = 기본 난수열 1020 · 랩-<팔>-s<n>.json = LAB_SEED n — 마을 · 지형 같고 econ 난수열만 다르다)
//   칸: 청동 · 식량 교역량 · 먹을거리 첫째 화물 줄 · 인구 · 받아 온 구리 · 주석 · 숯 · 둘째 화물 줄(먹을거리) · 광산5 로 간 구리(줄) · 광산5 청동
//   비 표: 같은 난수열의 합금 발주만 판으로 나눈 비 — 난수열 다섯의 평균 ± 표준편차 · 끔 ÷ 합금만 줄은 "난수열이 바뀔 때 이만큼 움직인다"의 자(카오스 폭)
const fs = require('fs'), path = require('path');
const D = process.argv[2] || path.join(__dirname, '..', '계측', 'T1347_2026-11-17');
const ARMS = ['off', 'alloy', 'a', 'b', 'ab', 'm', 'aga', 'ana', 'ada'], NAME = { off: '끔', alloy: '합금만', a: 'ⓐ', b: 'ⓑ', ab: 'ⓐ+ⓑ', m: '섞기', aga: '(가)', ana: '(나)', ada: '(다)' };   // (가)(나)(다) = 판정 표 갈래 사본(labj47.sh · ⓐ 위)
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const streams = ['1020'];
for (const f of fs.readdirSync(D)) { const m = /^랩-alloy-s(\d+)\.json$/.exec(f); if (m) streams.push(m[1]); }
streams.sort((p, q) => (p === '1020' ? -1 : q === '1020' ? 1 : +p - +q));
const get = (a, s) => rd(path.join(D, s === '1020' ? `랩-${a}.json` : `랩-${a}-s${s}.json`));
const f0 = (x) => (x == null ? '—' : Math.round(+x).toLocaleString('en-US')), f2 = (x) => (x == null ? '—' : (+x).toFixed(2));
console.log('| 난수열 · 팔 | 청동 | 식량 교역량 | 먹을거리 첫째 화물 줄 | 인구 · 굶음 | 받아 온 구리 · 주석 · 숯 | 둘째 화물 줄(먹을거리) | 광산5 로 간 구리 줄 | 광산5 청동 · 사람 · 대장장이 | (가) 먹인 식량 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
const R = {};
for (const s of streams) for (const a of ARMS) {
  const J = get(a, s); if (!J || !J.tot) continue;
  const t = J.tot; (R[a] = R[a] || {})[s] = t;
  console.log(`| ${s} · ${NAME[a]} | ${f2(t.bz)} | ${f0(t.food)} | ${f0(t.foodRows)} | ${f0(t.pop)} · ${t.fdDead == null ? '—' : f0(t.fdDead)} | ${f2(t.cuBack)} · ${f2(t.snBack)} · ${f0(t.charBack)} | ${t.mix2}(${t.mix2Food}) | ${t.cu5n + t.cu5backN} | ${J.k5 ? `${f2(J.k5.bronzeW)} · ${J.k5.pop} · ${J.k5.smith}` : '—'} | ${J.k5 && J.k5.fed ? f0(J.k5.fed) : '—'} |`);
}
console.log('\n| 팔 ÷ 합금만(같은 난수열 — 아래 줄들은 적힌 짝) | 난수열 수 | 청동 | 식량 교역량 | 먹을거리 첫째 화물 줄 | 인구 | 굶음(차 — 같은 난수열 판끼리 뺀 것) |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
const ms = (xs) => { const n = xs.length, m = xs.reduce((p, q) => p + q, 0) / n, sd = Math.sqrt(xs.reduce((p, q) => p + (q - m) * (q - m), 0) / Math.max(1, n - 1)); return `${m.toFixed(3)} ± ${sd.toFixed(3)} (${Math.min(...xs).toFixed(3)} ~ ${Math.max(...xs).toFixed(3)})`; };
const pair = (a, b, label) => {
  if (!R[a] || !R[b]) return;
  const ss = streams.filter((s) => R[a][s] && R[b][s]);
  if (!ss.length) return;
  const r = (k) => ss.map((s) => R[a][s][k] / R[b][s][k]);
  const dd = ss.filter((s) => R[a][s].fdDead != null && R[b][s].fdDead != null).map((s) => R[a][s].fdDead - R[b][s].fdDead);
  const md = (xs) => { if (!xs.length) return '—'; const n = xs.length, m = xs.reduce((p, q) => p + q, 0) / n, sd = Math.sqrt(xs.reduce((p, q) => p + (q - m) * (q - m), 0) / Math.max(1, n - 1)); return `${m >= 0 ? '+' : ''}${m.toFixed(1)} ± ${sd.toFixed(1)} (${Math.min(...xs)} ~ ${Math.max(...xs)})`; };
  console.log(`| ${label} | ${ss.length} | ${ms(r('bz'))} | ${ms(r('food'))} | ${ms(r('foodRows'))} | ${ms(r('pop'))} | ${md(dd)} |`);
};
for (const a of ARMS) if (a !== 'alloy') pair(a, 'alloy', NAME[a]);
pair('b', 'm', 'ⓑ ÷ 섞기(좁히기 전 — T1344 섞어 싣기)');
pair('ab', 'a', 'ⓐ+ⓑ ÷ ⓐ(ⓐ 위 ⓑ 몫)');
for (const g of ['aga', 'ana', 'ada']) pair(g, 'a', `${NAME[g]} ÷ ⓐ(판정 표 — 갈래 몫)`);
