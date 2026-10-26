#!/usr/bin/env node
// T921 — 보드 상태 ↔ main 에 합쳐진 가지(`[승인 대기 · T###]` 커밋) ↔ 족보 줄 대조 표(일회용 · 러너 밖 · @regress 아님 · 제품 무접촉 · 판정 0).
// 쓰기: node scripts/t921-board-sync.js [from=840] [to=929] [ref=origin/main]
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const FROM = +(process.argv[2] || 840), TO = +(process.argv[3] || 929), REF = process.argv[4] || 'origin/main';
const sh = c => execSync(c, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
// 보드 행
const board = {};
fs.readFileSync(path.join(root, '지시/_태스크보드_v1.md'), 'utf8').split('\n').forEach((l, i) => {
  const m = l.match(/^\| T(\d+) \|(.*)$/); if (!m) return;
  const c = l.split('|').map(s => s.trim());
  board[+m[1]] = { line: i + 1, area: c[2], status: c[4], sess: c[5], done: c[7] };
});
// 착지 닻: ① `Merge … into landNNNN` 합침 커밋 ② `[PM …] … landNNNN …` PM 착지 커밋(가지로 들어가는 'into batch/…' 합침은 뺀다) — 시간순
const landRaw = sh(`git log ${REF} --since=2026-10-15 --format='%H|%ct|%ad|%s' --date=format:%m-%d`).split('\n').filter(Boolean)
  .map(x => { const [h, ct, d, ...s] = x.split('|'); const subj = s.join('|'); return { h, ct: +ct, d, subj }; })
  .filter(c => /^Merge .* into (land\d{4}[a-z]*)\s*$/.test(c.subj) || (/^\[PM[^\]]*\]/.test(c.subj) && /\bland\d{4}[a-z]*\b/.test(c.subj)))
  .map(c => ({ ...c, tag: (c.subj.match(/(land\d{4}[a-z]*)/) || [])[1] }))
  .sort((x, y) => x.ct - y.ct);
// 승인 대기 커밋: 카드 번호 → [{h, d, subj, inMain, branches}]
const allTagged = sh(`git log --all --since=2026-10-15 --format='%H|%ad|%s' --date=format:%m-%d --grep='승인 대기 · T' `).split('\n').filter(Boolean)
  .map(x => { const [h, d, ...s] = x.split('|'); return { h, d, subj: s.join('|') }; });
const byCard = {};
for (const c of allTagged) {
  const re = /\[승인 대기 · T(\d+)/g; let m; const seen = new Set();
  while ((m = re.exec(c.subj))) { const n = +m[1]; if (seen.has(n)) continue; seen.add(n); (byCard[n] = byCard[n] || []).push(c); }
}
// main 집합 · 착지별 새 커밋 집합(rev-list 로 한 번씩 — 합침 검사 대신)
const mainSet = new Set(sh(`git rev-list ${REF}`).split('\n'));
const landOf = new Map();
{
  const done = [];
  for (const L of landRaw) {
    const not = done.length ? ' --not ' + done.map(x => x.h).join(' ') : '';
    const news = sh(`git rev-list ${L.h}${not}`).split('\n').filter(Boolean);
    for (const h of news) if (!landOf.has(h)) landOf.set(h, L.tag);
    done.push(L);
  }
}
// 족보 줄: "(NNN) PM 착지 10-23b(land1023b)" 항목 안 T### 언급
const jb = fs.readFileSync(path.join(root, '인계/족보.md'), 'utf8').split('\n');
const jbEntries = [];
jb.forEach((l, i) => { const m = l.match(/^\* \*\*\((\d+)\) (?:\S+ )*?PM 착지 (\S+?)\((land\d{4}[a-z]*)\)/); if (m) jbEntries.push({ no: m[1], day: m[2], tag: m[3], line: i + 1, text: l }); });
function jbOf(n) {
  const re = new RegExp('T' + n + '(?!\\d)');
  return jbEntries.filter(e => re.test(e.text)).map(e => e.no + ' ' + e.tag);
}
const rows = [];
for (let n = FROM; n <= TO; n++) {
  const b = board[n]; if (!b) { rows.push({ n, verdict: '보드 행 없음' }); continue; }
  const cs = (byCard[n] || []);
  const inMain = cs.filter(c => mainSet.has(c.h));
  const notMain = cs.filter(c => !mainSet.has(c.h));
  let land = null;
  if (inMain.length) {
    // 가장 이른 착지(= 모든 main 커밋 중 가장 늦게 들어온 것이 아니라, 첫 main 커밋의 착지) — 첫 커밋 기준과 마지막 커밋 기준 둘 다 낸다
    const order = landRaw.map(l => l.tag); // 시간순 닻 태그 목록(중복 포함) — 첫 등장 순서로 번호
    const rank = t => { const i = order.indexOf(t); return i < 0 ? 1e9 : i; };
    const lands = inMain.map(c => landOf.get(c.h) || '(착지 커밋 밖)').sort((x, y) => rank(x) - rank(y));
    land = { first: lands[0], last: lands[lands.length - 1], all: [...new Set(lands)] };
  }
  const bl = (b.status.match(/(land\d{4}[a-z]*)/g) || []);
  const bstate = /^착지/.test(b.status) ? '착지' : /^대기/.test(b.status) ? '대기' : /^보류/.test(b.status) ? '보류' : b.status.slice(0, 6);
  rows.push({ n, board: b.status, bstate, bl, commits: cs.map(c => c.h.slice(0, 8) + (inMain.includes(c) ? '' : '✗')), land, notMain: notMain.map(c => c.h.slice(0, 8)), jb: jbOf(n) });
}
console.log(JSON.stringify({ lands: landRaw.map(l => l.tag + ' ' + l.d + ' ' + l.h.slice(0, 8)), rows }, null, 0));
