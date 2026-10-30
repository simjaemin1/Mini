#!/usr/bin/env node
// T992 — 보드 상태 칸 옛 꼴 `**완료·main**(MM-DD …)` 을 `착지(MM-DD <착지 닻>)` 꼴로(T985 회부 1 · ★PM).
// 러너 밖 · `@regress` 아님 · 제품 무접촉 · 판정 0 · 새 수 0 · 결정론(같은 main 이면 같은 출력).
//
//   node scripts/t992-board-oldstatus.js [FROM=709] [TO=816] [REF=origin/main] [--apply] [--md]
//
// 규칙(전부 글자 · git — `t950-board-sync.js` 규칙에 잇댄다):
//   완료 해시 = 보드 해시 칸(T950 · T985 가 채운 카드의 첫 착지 커밋). 비었거나 main 밖이면 안 건드린다.
//   착지 커밋 = REF 의 첫 부모 줄에서 그 해시를 처음 품은 커밋(F).
//   착지 닻   = F 의 제목의 착지 가지 이름 — 새 꼴 `landNNNN`(`Merge … into landNNNN` · `[PM …] … landNNNN …` — T950 과 같다) ·
//               옛 꼴 `Merge … into land10-1014c` 등(T950 정규식 밖 — 10-11 ~ 10-18 의 착지 가지 이름).
//               둘 다 없으면(가지를 main 에 바로 합치거나 main 에 바로 커밋) `main`.
//   날짜      = 새 꼴: 그 꼬리표의 PM 착지 커밋 제목 `착지 MM-DD`(T950 과 같다).
//               옛 꼴 · `main`: F 부터 첫 부모 줄 앞으로 처음 나오는 PM 착지 커밋(`[PM 착지 MM-DD …]` · `[PM] 착지 MM-DD …`)의 날
//               (그 착지 묶음의 날) · 없으면 F 날.
//   새 상태   = `착지(MM-DD <닻>)` + 옛 괄호의 날 뒤 꼬리(` · 켬` 등)는 그대로 붙인다.
//   안 옮김   = 카드의 `[승인 대기 · T###` 커밋 중 main 밖이 있는 행 · 해시 칸이 비었거나 main 밖인 행 · 옛 꼴이 아닌 행.
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = f => { const i = args.indexOf(f); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const APPLY = flag('--apply'), MD = flag('--md');
const FROM = +(args[0] || 709), TO = +(args[1] || 816), REF = args[2] || 'origin/main';
const BOARD = path.join(root, '지시/_태스크보드_v1.md');
const sh = c => execSync(c, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const isAnc = (a, b) => { try { execSync(`git merge-base --is-ancestor ${a} ${b}`, { cwd: root, stdio: 'ignore' }); return true; } catch (e) { return false; } };

// 첫 부모 줄(옛 → 새)
const fp = sh(`git log ${REF} --first-parent --reverse --format='%H|%ad|%s' --date=format:%m-%d`).split('\n').filter(Boolean)
  .map(x => { const [h, d, ...s] = x.split('|'); return { h, d, subj: s.join('|') }; });
// 꼬리표: 새 꼴 `landNNNN`(T950) + 옛 착지 가지 이름(`land-1011` · `land2-1011` · `land9-1012` · `land10-1014c` … — `Merge … into <그 이름>` 에만 있다)
const tagOf = s => { let m = s.match(/^Merge .* into (land[0-9a-z-]+)\s*$/); if (m) return m[1]; m = s.match(/^\[PM[^\]]*\].*\b(land\d{4}[a-z]*)\b/); return m ? m[1] : null; };
const pmLandDate = s => { const m = s.match(/^\[PM(?: 착지)?[^\]]*\]\s*(?:착지\s*)?.*?착지 (\d\d-\d\d)/) || s.match(/^\[PM 착지 (\d\d-\d\d)/); return /^\[PM/.test(s) && /착지/.test(s) && m ? m[1] : null; };
const tagDate = {};
for (const c of fp) { const t = tagOf(c.subj); if (t && /^\[PM/.test(c.subj)) { const m = c.subj.match(/착지 (\d\d-\d\d)/); if (m && !(t in tagDate)) tagDate[t] = m[1]; } }
// 해시를 처음 품은 첫 부모 커밋(조상 관계는 첫 부모 줄 위에서 단조 — 이분 찾기)
function introIdx(h) {
  let lo = 0, hi = fp.length - 1;
  if (!isAnc(h, fp[hi].h)) return -1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (isAnc(h, fp[mid].h)) hi = mid; else lo = mid + 1; }
  return lo;
}
// 카드 커밋(main 밖 여부)
const mainSet = new Set(sh(`git rev-list ${REF}`).split('\n'));
const tagged = sh(`git log --all --format='%H|%s' --grep='승인 대기 · T'`).split('\n').filter(Boolean)
  .map(x => { const [h, ...s] = x.split('|'); return { h, subj: s.join('|') }; });
const byCard = {};
for (const c of tagged) { const re = /\[승인 대기 · T(\d+)/g; let m; const seen = new Set(); while ((m = re.exec(c.subj))) { const n = +m[1]; if (!seen.has(n)) { seen.add(n); (byCard[n] = byCard[n] || []).push(c.h); } } }

const lines = fs.readFileSync(BOARD, 'utf8').split('\n');
const rows = [];
lines.forEach((l, i) => {
  const m = l.match(/^\| T(\d+) \|/); if (!m) return;
  const n = +m[1]; if (n < FROM || n > TO) return;
  const c = l.split('|'); const status = c[4].trim(), hash = c[7].trim();
  const om = status.match(/^\*\*완료·main\*\*\((\d\d-\d\d)(.*)\)$/);
  if (!om) return;
  const r = { n, i, c, status, hash, oldDate: om[1], tail: om[2], newStatus: null, note: '' };
  const out = (byCard[n] || []).filter(h => !mainSet.has(h));
  if (out.length) { r.note = `안 옮김 — 가지 main 밖 ${out.length}`; rows.push(r); return; }
  if (!/^[0-9a-f]{7,40}$/.test(hash)) { r.note = '안 옮김 — 해시 칸 빔'; rows.push(r); return; }
  const k = introIdx(hash);
  if (k < 0) { r.note = '안 옮김 — 해시가 main 밖'; rows.push(r); return; }
  const F = fp[k]; let anchor = tagOf(F.subj) || 'main', date = tagDate[anchor] || null;
  if (!date) {   // 옛 꼬리표 · main — 그 착지 묶음의 PM 착지 커밋(F 부터 첫 부모 줄 앞으로 처음 나오는 것)의 날
    for (let j = k; j < fp.length; j++) { const d = pmLandDate(fp[j].subj); if (d) { date = d; r.pm = fp[j].h.slice(0, 8); break; } }
    if (!date) date = F.d;
  }
  r.F = F.h.slice(0, 8); r.Fsubj = F.subj; r.anchor = anchor; r.date = date;
  r.newStatus = `착지(${date} ${anchor}${r.tail})`;
  r.note = date === r.oldDate ? '옮김' : `옮김 · 날 ${r.oldDate} → ${date}`;
  rows.push(r);
});
if (APPLY) {
  let n = 0;
  for (const r of rows) if (r.newStatus) { const c = r.c.slice(); c[4] = ' ' + r.newStatus + ' '; lines[r.i] = c.join('|'); n++; }
  fs.writeFileSync(BOARD, lines.join('\n')); console.error(`보드 고침 ${n}행`);
}
if (MD) {
  console.log('| 카드 | 옛 상태 | 새 상태 | 완료 해시 | 착지 커밋(첫 부모) | 착지 묶음 PM 커밋 | 판정 |\n|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| T${r.n} | ${r.status} | ${r.newStatus || '(그대로)'} | ${r.hash} | ${r.F ? '`' + r.F + '` ' + r.Fsubj.slice(0, 48).replace(/\|/g, '/') : '—'} | ${r.pm ? '`' + r.pm + '`' : '—'} | ${r.note} |`);
} else {
  const sum = {}; rows.forEach(r => { const k = r.note.replace(/\d\d-\d\d → \d\d-\d\d/, 'MM-DD → MM-DD').replace(/\d+$/, '#'); sum[k] = (sum[k] || 0) + 1; });
  const anchors = {}; rows.forEach(r => { if (r.anchor) anchors[r.anchor] = (anchors[r.anchor] || 0) + 1; });
  console.log(JSON.stringify({ ref: REF, main: sh(`git rev-parse --short ${REF}`), rows: rows.length, sum, anchors,
    dateChanged: rows.filter(r => r.newStatus && r.date !== r.oldDate).map(r => `T${r.n}: ${r.oldDate} → ${r.date} (${r.anchor})`),
    kept: rows.filter(r => !r.newStatus).map(r => `T${r.n}: ${r.note}`) }, null, 1));
}
