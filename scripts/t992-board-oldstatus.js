#!/usr/bin/env node
// T992 — 보드 상태 칸 옛 꼴 `**완료·main**(MM-DD …)` 을 `착지(MM-DD <착지 닻>)` 꼴로(T985 회부 1 · ★PM).
// 러너 밖 · `@regress` 아님 · 제품 무접촉 · 판정 0 · 새 수 0 · 결정론(같은 main 이면 같은 출력).
//
//   node scripts/t992-board-oldstatus.js [FROM=709] [TO=816] [REF=origin/main] [--apply] [--md]
//
// 규칙(전부 글자 · git — `t950-board-sync.js` 규칙에 잇댄다):
//   완료 해시 = 보드 해시 칸(T950 · T985 가 채운 카드의 첫 착지 커밋). 비었으면 안 건드린다.
//               ★[T1006] main 밖이면 제목 · 작성 시각이 같은 main 커밋(되얹은 짝)으로 착지 커밋을 찾는다 — 해시 칸은 그대로(표에 짝을 적는다).
//   착지 커밋 = REF 의 첫 부모 줄에서 그 해시를 처음 품은 커밋(F).
//   착지 닻   = F 의 제목의 착지 가지 이름 — 새 꼴 `landNNNN`(`Merge … into landNNNN` · `[PM …] … landNNNN …` — T950 과 같다) ·
//               옛 꼴 `Merge … into land10-1014c` 등(T950 정규식 밖 — 10-11 ~ 10-18 의 착지 가지 이름).
//               둘 다 없으면(가지를 main 에 바로 합치거나 main 에 바로 커밋) `main`.
//   날짜      = 새 꼴: 그 꼬리표의 PM 착지 커밋 제목 `착지 MM-DD`(T950 과 같다).
//               옛 꼴 · `main`: F 부터 첫 부모 줄 앞으로 처음 나오는 PM 착지 커밋(`[PM 착지 MM-DD …]` · `[PM] 착지 MM-DD …`)의 날
//               (그 착지 묶음의 날) · 없으면 F 날.
//               ★[T1006] `main` 닻은 F 의 커미터 날(main 에 바로 든 날 — T277 커밋 09-14 · 커미터 09-18 = 옛 상태 "09-18 착지").
//   새 상태   = `착지(MM-DD <닻>)` + 옛 괄호의 날 뒤 꼬리(` · 켬` 등)는 그대로 붙인다.
//               옛 꼴 셋(T1006): `**완료·main**` · `**완료·main**(…)` · `**완료·main(…)**` — 괄호 안이 날로 열지 않으면 괄호 안 전부가 꼬리.
//   main 밖   = 카드의 `[승인 대기 · T###` 커밋 중 main 밖에 남은 것. main 을 가지에 합친 커밋 · 되얹어 main 에 든 커밋
//               (제목 · 작성 시각이 같은 main 커밋이 있다)은 빼고 센다(T1006).
//               ★[T1015 · ★PM] main 밖이 있어도 해시 칸이 main 의 커밋이면 옮기고 `착지(MM-DD <닻> · main 밖 N(내용은 <해시 칸>) …)`.
//   안 옮김   = main 밖이 있는데 해시 칸이 main 의 커밋이 아닌 행 · 해시 칸이 비었거나 main 밖인 행 · 옛 꼴이 아닌 행.
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
const fp = sh(`git log ${REF} --first-parent --reverse --format='%H|%ad|%cd|%s' --date=format:%m-%d`).split('\n').filter(Boolean)
  .map(x => { const [h, d, cd, ...s] = x.split('|'); return { h, d, cd, subj: s.join('|') }; });
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
// ★[T1006] main 을 가지에 합친 커밋(부모가 둘 이상 · 첫 부모 밖 부모가 main 안)은 "가지 main 밖" 으로 안 센다 — 카드 내용은 main 에 있다(T710 `b9584bd7`)
const mainMerge = h => { const ps = sh(`git rev-list --parents -n 1 ${h}`).split(' ').slice(1); return ps.length > 1 && ps.slice(1).some(p => mainSet.has(p)); };
// ★[T1006] 되얹어(rebase · cherry-pick) main 에 든 카드 커밋 — 가지에 남은 옛 커밋은 제목 · 작성 시각이 같은 main 커밋이 있으면 "main 밖" 으로 안 센다(10-11 앞 착지 꼴)
const mainKey = new Map(sh(`git log ${REF} --reverse --format='%H|%at|%s'`).split('\n').map(x => { const i = x.indexOf('|'); return [x.slice(i + 1), x.slice(0, i)]; }));
const keyOf = h => execSync(`git log -1 --format='%at|%s' ${h}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();   // 저장소에 없는 해시는 던진다(부르는 쪽이 받는다)
const rebased = h => mainKey.has(keyOf(h));
const byCard = {};
for (const c of tagged) { const re = /\[승인 대기 · T(\d+)/g; let m; const seen = new Set(); while ((m = re.exec(c.subj))) { const n = +m[1]; if (!seen.has(n)) { seen.add(n); (byCard[n] = byCard[n] || []).push(c.h); } } }

const lines = fs.readFileSync(BOARD, 'utf8').split('\n');
const rows = [];
lines.forEach((l, i) => {
  const m = l.match(/^\| T(\d+) \|/); if (!m) return;
  const n = +m[1]; if (n < FROM || n > TO) return;
  const c = l.split('|'); const status = c[4].trim(), hash = c[7].trim();
  // 옛 꼴 셋: `**완료·main**` · `**완료·main**(…)` · `**완료·main(…)**` — 괄호 안이 `MM-DD` 로 열면 옛 날 · 그 뒤(머리 ` 착지` 는 뗀다)는 꼬리 · 아니면 괄호 안 전부가 꼬리(T1006)
  const om = status.match(/^\*\*완료·main\*\*(?:\((.*)\))?$/) || status.match(/^\*\*완료·main\((.*)\)\*\*$/);
  if (!om) return;
  const inner = (om[1] || '').trim(), dm = inner.match(/^(\d\d-\d\d)(.*)$/);
  const oldDate = dm ? dm[1] : null, tail = dm ? dm[2].replace(/^\s*착지(?=\s|$)/, '') : (inner ? ' · ' + inner : '');
  const r = { n, i, c, status, hash, oldDate, tail, newStatus: null, note: '' };
  const out = (byCard[n] || []).filter(h => { if (mainSet.has(h) || mainMerge(h)) return false; try { return !rebased(h); } catch (e) { return true; } });
  // ★[T1015 · ★PM] 가지 main 밖 커밋이 있어도 해시 칸이 main 의 커밋이면 옮기고 그 몫을 `main 밖 N(내용은 <해시 칸>)` 으로 적는다(T1006 회부 1)
  if (out.length && !(/^[0-9a-f]{7,40}$/.test(hash) && mainSet.has(sh(`git rev-parse -q --verify ${hash}^{commit}`)))) { r.note = `안 옮김 — 가지 main 밖 ${out.length} · 해시 칸이 main 커밋 아님`; rows.push(r); return; }
  if (out.length) r.out = out.map(h => h.slice(0, 8));
  if (!/^[0-9a-f]{7,40}$/.test(hash)) { r.note = '안 옮김 — 해시 칸 빔'; rows.push(r); return; }
  let k = introIdx(hash);
  if (k < 0) {   // ★[T1006] 해시 칸이 되얹기 앞 가지 커밋이면 main 의 짝(제목 · 작성 시각 같음)으로 착지 커밋을 찾는다 — 해시 칸은 그대로 둔다
    let twin = null; try { twin = mainKey.get(keyOf(hash)) || null; } catch (e) {}
    if (twin) { r.twin = twin.slice(0, 8); k = introIdx(twin); }
  }
  if (k < 0) { r.note = '안 옮김 — 해시가 main 밖'; rows.push(r); return; }
  const F = fp[k]; let anchor = tagOf(F.subj) || 'main', date = tagDate[anchor] || null;
  if (!date) {   // 옛 꼬리표 · main — 그 착지 묶음의 PM 착지 커밋(F 부터 첫 부모 줄 앞으로 처음 나오는 것)의 날
    for (let j = k; j < fp.length; j++) { const d = pmLandDate(fp[j].subj); if (d) { date = d; r.pm = fp[j].h.slice(0, 8); break; } }
    if (!date) date = F.d;
  }
  if (anchor === 'main') { date = F.cd; delete r.pm; }   // ★[T1006] main 에 바로 든 커밋 — 그 커밋이 main 에 든 날(커미터 날 · 되얹기 · 옮겨 담기 때 그날로 선다)
  r.F = F.h.slice(0, 8); r.Fsubj = F.subj; r.anchor = anchor; r.date = date;
  r.newStatus = `착지(${date} ${anchor}${r.out ? ` · main 밖 ${r.out.length}(내용은 ${hash.slice(0, 8)})` : ''}${r.tail})`;
  r.note = !r.oldDate ? '옮김 · 옛 날 없음' : date === r.oldDate ? '옮김' : `옮김 · 날 ${r.oldDate} → ${date}`;
  if (r.twin) r.note += ` · 해시 칸 = 되얹기 앞 커밋(main 짝 ${r.twin})`;
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
  const sum = {}; rows.forEach(r => { const k = r.note.replace(/\d\d-\d\d → \d\d-\d\d/, 'MM-DD → MM-DD').replace(/main 짝 [0-9a-f]+/, 'main 짝 #').replace(/\d+$/, '#'); sum[k] = (sum[k] || 0) + 1; });
  const anchors = {}; rows.forEach(r => { if (r.anchor) anchors[r.anchor] = (anchors[r.anchor] || 0) + 1; });
  console.log(JSON.stringify({ ref: REF, main: sh(`git rev-parse --short ${REF}`), rows: rows.length, sum, anchors,
    dateChanged: rows.filter(r => r.newStatus && r.date !== r.oldDate).map(r => `T${r.n}: ${r.oldDate} → ${r.date} (${r.anchor})`),
    kept: rows.filter(r => !r.newStatus).map(r => `T${r.n}: ${r.note}`) }, null, 1));
}
