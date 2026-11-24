// T1474 — 갈래 × (첫 빨강 커밋 · 날 · 카드 · 첫 갈린 틱 · 승패 뒤집힘 · 죽은 수 차). 입력: 계측/T1474/커밋표.json · 갈린자리-main.json · 갈린자리-<첫 빨강>.json → 갈래표.md
const fs = require('fs'), path = require('path'); const D = path.join(__dirname, '..', '계측', 'T1474');
const rows = JSON.parse(fs.readFileSync(D + '/커밋표.json')); const cur = JSON.parse(fs.readFileSync(D + '/갈린자리-main.json'));
const CAT = { 청동편성: '청동편성', 시가전: '시가전', 종대: '종대', 숲: '숲', 방패벽: '대형' }; // 커밋표 열쇠는 verify 이름 앞머리('대형 방패벽')
const lastGreen = rows.map((r, i) => [r, i]).filter(([r]) => r.match === r.total).pop()[1];
let md = '| 갈래 | 실패 판 | 첫 빨강 커밋 | 날 | 카드 | 첫 갈린 틱(그 커밋 코어 · 첫 실패 씨) | 첫 갈린 틱(지금 코어 · 첫 실패 씨) | 승패 뒤집힘(지금) | 죽음 합 실험실 → core(실패 판 합 · 차) |\n|---|---|---|---|---|---|---|---|---|\n';
let tf = 0, tn = 0;
for (const [c, key] of Object.entries(CAT)) {
  const fr = rows.slice(lastGreen + 1).find(r => r.per[key] && r.per[key][0] < r.per[key][1]);
  const bad = cur.filter(r => r.name === c && !r.ok); const flips = bad.filter(r => r.lab.win !== r.core.win).length;
  const sum = (a, k) => a.reduce((s, r) => s + r[k].dA + r[k].dB, 0); const L = sum(bad, 'lab'), C = sum(bad, 'core');
  let at = '-'; try { const o = JSON.parse(fs.readFileSync(`${D}/갈린자리-${fr.hash}.json`)).filter(r => r.name === c && !r.ok)[0]; at = o ? `${o.first.tick} (${(o.first.tick * 0.05).toFixed(2)}초) 씨${o.seed}` : '-'; } catch (e) { at = '(없음)'; }
  const b0 = bad[0]; tf += flips; tn += bad.length;
  md += `| ${c} | ${bad.length}/4 | ${fr.hash} | ${fr.date} | ${fr.card === '-' ? '카드 없음' : fr.card} | ${at} | ${b0.first.tick} (${(b0.first.tick * 0.05).toFixed(2)}초) 씨${b0.seed} | ${flips}/${bad.length} | ${L} → ${C} (${C - L >= 0 ? '+' : ''}${C - L}) |\n`;
}
md += `\n* 합계: 실패 판 ${tn} · 승패 뒤집힘 ${tf}/${tn}\n`;
fs.writeFileSync(D + '/갈래표.md', md); console.log(md);
