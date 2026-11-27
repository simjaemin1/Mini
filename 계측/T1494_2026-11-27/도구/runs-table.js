// (러너 밖 · T1494 판 스물 표 · 제품 무변) 쓰는 법: node runs-table.js <판 폴더> > 표.md
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const rows = [];
for (let n = 1; n <= 40; n++) {
  const f = path.join(dir, `run${n}.json`); if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8')), S = d.steps || {}, C = d.checks || {};
  const yes = (b) => (b ? '○' : '✗');
  const rum = S.rumor || {}, gone = (S.razed || {}).gone || {}, eased = (S.eased || {}).row;
  rows.push([n, d.restart ? `재기동(${d.dayMs / 1000}초)` : `${d.dayMs / 1000}초`, (S.pick || {}).A + ' · ' + (S.pick || {}).B,
    `${(S.heap || {}).tries} · ${((S.heap || {}).words || []).join('→')}`, yes(C.seen), yes(C.refuse),
    `${(S.reconnect || {}).knew}→${(S.reconnect || {}).liveAfter} · 들어옴 ${((S.reconnect || {}).login || {}).stage} · 땅 ${(S.reconnect || {}).liveNow}`, yes(C.landUnknown),
    `${(S.raid || {}).day0}날 · ${((S.raid || {}).busy && ((S.raid || {}).busy.view || (S.raid || {}).busy.state) || {}).bodies}몸${d.restart ? ` · 다시 뜬 뒤 ${((S.restart || {}).busy || {}).st || '-'}` : ''}`,
    rum.line ? `${rum.day}날(+${rum.day - rum.day0} ≥ ${rum.delay})` : '-', gone.ok ? `${gone.day}날` : '-', eased ? `${eased.stageKo}` : '-', d.leakN, d.ok ? '○' : '✗', d.wall]);
}
console.log('| 판 | 하루 | A(촌장) · B(해코지) | 쌓임(거둔 번 · 단계 말) | 보임 | 가입 거절 | 다시 접속(안 단계→장부 · 들어옴 · 그 땅) | 모르는 땅 원한 0 | 토벌(떠난 날 · 몸) | 떠났다는 소문(닿은 날) | 친 뒤 풂 | 풀림(B 창) | 새어 보임 | 한 바퀴 | 초 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
const ok = rows.filter((r) => r[13] === '○').length, leak = rows.reduce((a, r) => a + (+r[12] || 0), 0);
console.log(`\n한 바퀴 ${ok}/${rows.length} · 새어 보임 합 ${leak}`);
