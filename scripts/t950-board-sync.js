#!/usr/bin/env node
// T950 — 보드 완료 해시 칸 · 상태 칸을 main 착지 닻과 맞춘다(T921 `t921-board-sync.js` 를 한 줄 재실행 꼴로 다시 씀).
// 일회용 아님 · 러너 밖 · `@regress` 아님 · 제품 무접촉 · 판정 0 · 새 수 0 · 결정론(같은 main 이면 같은 출력).
//
// 새 착지 뒤 한 줄:
//   git fetch origin main '+refs/heads/batch/*:refs/remotes/origin/batch/*' && node scripts/t950-board-sync.js 840 999 origin/main --apply
//   (--apply 없이 돌리면 표만 낸다 · `--md` 는 보고에 붙일 markdown 표 · `--since 2026-10-01` = 10-15 앞 카드 · T985)
//   남은 옛 행(T1015): node scripts/t950-board-sync.js 1 839 origin/main --since 2026-05-01 --rest --apply && node scripts/t992-board-oldstatus.js 1 816 origin/main --apply
//
// 규칙(전부 글자 · git):
//   완료 해시 = 카드의 `[승인 대기 · T###` 커밋 중 main 에 든 것 가운데 **가장 이른 착지 닻 → 같은 닻이면 작성일 → 같으면 history 순서**의 첫 커밋(8자).
//               main 에 든 커밋이 없는데 보드가 "착지"면 그 닻의 PM 착지 커밋(문서 카드 · 표에 "(착지 커밋)").
//   상태     = 카드 커밋이 **전부** main 에 있고 보드가 "대기"면 `착지(MM-DD landNNNN)` 로, 보드가 이미 "착지"인데 land 태그가 첫 착지 닻과 다르면 그 태그로.
//               "보류" · 가지가 main 밖에 있는 "대기" · 커밋 0 인 "대기"는 안 건드린다(표에만).
//   착지 닻  = `Merge … into landNNNN` 합침 커밋 + `[PM …] … landNNNN …` PM 착지 커밋(가지 안으로 들어가는 `into batch/…` 합침은 뺀다) — 시간순.
//   날짜     = PM 착지 커밋 제목의 `착지 MM-DD`(없으면 닻 커밋 날).
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = f => { const i = args.indexOf(f); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const APPLY = flag('--apply'), MD = flag('--md');
// ★[T1015] `--rest` — 남은 옛 행 셋(T1006 회부 1 · 3 · ★PM): ⓐ 해시 칸이 카드 번호면 비고 머리로(T985 꼴) · ⓑ 해시 칸이 해시 꼴인데 main 의 커밋이 하나도 없으면(되얹기 앞 가지 커밋 · 저장소에 없는 해시) · 자리표 `(land)` 면 T950 규칙의 첫 착지 커밋으로(날 · 세션 같은 다른 글은 그대로) ·
//   ⓒ 해시 칸이 비었고 T950 규칙으로 못 찾으면 상태 글 괄호 머리의 해시(main 의 커밋 · 여럿이면 가장 이른 것)를 해시 칸으로 옮기고 상태 글에서 뗀다. 같은 카드의 겹친 행도 다 본다.
const REST = flag('--rest');
// ★[T985] `--since YYYY-MM-DD` — 닻 · 카드 커밋을 찾는 창의 앞 끝(기본 2026-10-15 = T950 그대로). T709 ~ T816 처럼 10-15 앞에 커밋이 있는 카드는 더 이른 날을 준다.
const SINCE = (() => { const i = args.indexOf('--since'); if (i < 0) return '2026-10-15'; const v = args[i + 1]; args.splice(i, 2); if (!/^\d{4}-\d\d-\d\d$/.test(v || '')) throw new Error('--since YYYY-MM-DD'); return v; })();
const FROM = +(args[0] || 840), TO = +(args[1] || 999), REF = args[2] || 'origin/main';
const BOARD = path.join(root, '지시/_태스크보드_v1.md');
const sh = c => execSync(c, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

// 1. 보드 행
const lines = fs.readFileSync(BOARD, 'utf8').split('\n');
const board = {};
lines.forEach((l, i) => {
  const m = l.match(/^\| T(\d+) \|/); if (!m) return;
  const c = l.split('|');           // ['', ' T### ', 영역, 웨이브, 상태, 세션, 시작, 완료 해시, 비고, '']
  board[+m[1]] = { i, c };
});
// 2. 착지 닻(시간순)
// ★[T1006] 착지 가지 이름 — 새 꼴 `landNNNN[a-z]`(10-19 ~) + 옛 꼴 `land-1011` · `land2-1011` · `land9-1012` · `land10-1014c`(10-11 ~ 10-18 · `Merge … into <이름>` 에만).
//   옛 꼴을 닻으로 안 보면 10-19 앞 카드가 다 첫 새 꼴 닻(land1019)으로 잡혔다(T992 회부 2). PM 커밋 제목의 꼬리표는 새 꼴만 본다(그 무렵 PM 제목엔 옛 이름이 없다).
const LAND_NAME = /(land\d*-\d{4}[a-z]*|land\d{4}[a-z]*)/;
const MERGE_LAND = /^Merge .* into (land\d*-\d{4}[a-z]*|land\d{4}[a-z]*)\s*$/;
const anchors = sh(`git log ${REF} --since=${SINCE} --format='%H|%ct|%ad|%s' --date=format:%m-%d`).split('\n').filter(Boolean)
  .map(x => { const [h, ct, d, ...s] = x.split('|'); return { h, ct: +ct, d, subj: s.join('|') }; })
  .filter(c => MERGE_LAND.test(c.subj) || (/^\[PM[^\]]*\]/.test(c.subj) && /\bland\d{4}[a-z]*\b/.test(c.subj)))
  .map(c => ({ ...c, tag: (c.subj.match(MERGE_LAND) || c.subj.match(/(land\d{4}[a-z]*)/) || [])[1] }))
  .sort((x, y) => x.ct - y.ct || (x.h < y.h ? -1 : 1));
const tagRank = {}; anchors.forEach((a, i) => { if (!(a.tag in tagRank)) tagRank[a.tag] = i; });
const tagDate = {};   // PM 착지 커밋 제목의 "착지 MM-DD" 우선
anchors.forEach(a => { const m = a.subj.match(/착지 (\d\d-\d\d)/); if (m && /^\[PM/.test(a.subj) && !(a.tag in tagDate)) tagDate[a.tag] = m[1]; });
anchors.forEach(a => { if (!(a.tag in tagDate)) tagDate[a.tag] = a.d; });
const pmLand = {};    // 태그 → PM 착지 커밋(문서 카드 대체 해시)
anchors.filter(a => /^\[PM/.test(a.subj) && /\bland\d{4}[a-z]*\s+—|land\d{4}[a-z]*\s+—/.test(a.subj)).forEach(a => { pmLand[a.tag] = a.h; });
// 3. 닻마다 "처음 들어온" 커밋
const mainOrder = sh(`git rev-list ${REF}`).split('\n'); const mainIdx = new Map(mainOrder.map((h, i) => [h, i])); // 0 = 최신
const landOf = new Map();
{
  const done = [];
  for (const a of anchors) {
    const not = done.length ? ' --not ' + done.map(x => x.h).join(' ') : '';
    for (const h of sh(`git rev-list ${a.h}${not}`).split('\n').filter(Boolean)) if (!landOf.has(h)) landOf.set(h, a.tag);
    done.push(a);
  }
}
// 4. 카드 커밋
const tagged = sh(`git log --all --since=${SINCE} --format='%H|%ct|%s' --grep='승인 대기 · T'`).split('\n').filter(Boolean)
  .map(x => { const [h, ct, ...s] = x.split('|'); return { h, ct: +ct, subj: s.join('|') }; });
const byCard = {};
for (const c of tagged) {
  const re = /\[승인 대기 · T(\d+)/g; let m; const seen = new Set();
  while ((m = re.exec(c.subj))) { const n = +m[1]; if (seen.has(n)) continue; seen.add(n); (byCard[n] = byCard[n] || []).push(c); }
}
const rank = t => (t in tagRank ? tagRank[t] : 1e9);
const rows = [], changes = [];
for (let n = FROM; n <= TO; n++) {
  const b = board[n]; if (!b) continue;
  const status = b.c[4].trim(), hashCell = b.c[7].trim();
  const bstate = /^착지/.test(status) ? '착지' : /^대기/.test(status) ? '대기' : /^보류/.test(status) ? '보류' : status.slice(0, 6);
  const btag = (status.match(LAND_NAME) || [])[1];
  const cs = byCard[n] || [];
  const inMain = cs.filter(c => mainIdx.has(c.h)), out = cs.filter(c => !mainIdx.has(c.h));
  let first = null, land = null, fallback = false;
  if (inMain.length) {
    const sorted = inMain.slice().sort((x, y) => rank(landOf.get(x.h)) - rank(landOf.get(y.h)) || x.ct - y.ct || mainIdx.get(y.h) - mainIdx.get(x.h));
    first = sorted[0].h; land = landOf.get(first) || null;
  } else if (bstate === '착지' && btag && pmLand[btag]) { first = pmLand[btag]; land = btag; fallback = true; }
  let newStatus = null, note = '';
  if (bstate === '대기') {
    if (inMain.length && !out.length) { newStatus = `착지(${tagDate[land] || '?'} ${land})`; note = '대기 → 착지(커밋 전부 main)'; }
    else if (out.length) note = `가지 있음 · main 밖 ${out.length}`;
    else note = '커밋 0 · 대기';
  } else if (bstate === '착지') {
    if (!land) note = '**어긋남: main 에 커밋 없음**';
    else if (btag && btag !== land) { newStatus = status.replace(btag, land); note = `태그 ${btag} → ${land}`; }
    else note = '맞음';
  } else note = '보류(안 건드림)' + (out.length ? ` · 가지 main 밖 ${out.length}` : '');
  rows.push({ n, status, newStatus, hashCell, first, land, fallback, inMain: inMain.length, out: out.length, note });
  if (APPLY) {
    const c = b.c.slice();
    let touched = false;
    if (first && (hashCell === '—' || hashCell === '')) { c[7] = ' ' + first.slice(0, 8) + ' '; touched = true; }
    if (newStatus) { c[4] = ' ' + newStatus + ' '; touched = true; }
    if (touched) { lines[b.i] = c.join('|'); changes.push(n); }
  }
}
// ★[T1015] --rest
const rest = [];
if (REST) {
  const firstOf = {}; rows.forEach(r => { if (r.first && !r.fallback) firstOf[r.n] = r.first; });
  const inMainCommit = t => { if (!/^[0-9a-f]{7,40}$/.test(t)) return null; try { const h = sh(`git rev-parse -q --verify ${t}^{commit}`); return mainIdx.has(h) ? h : null; } catch (e) { return null; } };
  lines.forEach((l, i) => {
    const m = l.match(/^\| T(\d+) \|/); if (!m) return;
    const n = +m[1]; if (n < FROM || n > TO) return;
    const c = l.split('|'); if (c.length < 10) return;
    const old = { hash: c[7].trim(), note: c[8].trim(), status: c[4].trim() };
    let hash = old.hash, note = old.note, status = old.status; const why = [];
    if (/^T\d+([ ·,]+T\d+)*$/.test(hash)) { note = note.startsWith(hash) ? note : (note && note !== '—' ? `${hash} · ${note}` : hash); hash = '—'; why.push('ⓐ 출처 카드 → 비고 머리'); }
    {   // ⓑ 칸이 해시 꼴(괄호 · `·` `+` 로 이은 여럿 포함)인데 main 의 커밋이 하나도 없으면 · 자리표 `(land)` — 날 · 세션 같은 다른 글(옛 칸 배치 행)은 안 건드린다
      const toks = hash.replace(/^\((.*)\)$/, '$1').split(/[+·, /]+/).filter(Boolean);
      const hexy = toks.length && toks.every(t => /^[0-9a-f]{7,40}$/.test(t));
      if (firstOf[n] && (hash === '(land)' || (hexy && !toks.some(inMainCommit)))) { why.push(`ⓑ ${hash} → ${firstOf[n].slice(0, 8)}`); hash = firstOf[n].slice(0, 8); }
    }
    if ((hash === '—' || hash === '') && !firstOf[n]) {
      const sm = status.match(/^(\*\*완료·main\()([0-9a-f]{7,40}(?:[+·, /]+[0-9a-f]{7,40})*)\s*(?:·\s*)?(.*)(\)\*\*)$/);
      if (sm) {
        const ts = sm[2].split(/[+·, /]+/).map(t => [t, inMainCommit(t)]).filter(x => x[1]);
        if (ts.length) {
          ts.sort((x, y) => mainIdx.get(y[1]) - mainIdx.get(x[1]));   // 가장 이른(rev-list 뒤쪽) 것
          hash = ts[0][1].slice(0, 8); status = sm[3] ? `${sm[1]}${sm[3]}${sm[4]}` : '**완료·main**';
          why.push(`ⓒ 상태 글 해시 ${sm[2]} → 해시 칸 ${hash}`);
        }
      }
    }
    if (!why.length) return;
    rest.push({ n, i, why: why.join(' · '), before: old, after: { hash, note, status } });
    if (APPLY) { c[4] = ' ' + status + ' '; c[7] = ' ' + hash + ' '; c[8] = ' ' + note + ' '; lines[i] = c.join('|'); }
  });
}
if (APPLY) { fs.writeFileSync(BOARD, lines.join('\n')); console.error(`보드 고침 ${changes.length}행` + (REST ? ` · --rest ${rest.length}행` : '')); }
if (MD && REST) {
  console.log('| 카드 | 고침 | 해시 칸(전 → 뒤) | 상태(뒤) |\n|---|---|---|---|');
  for (const r of rest) console.log(`| T${r.n} | ${r.why} | ${r.before.hash} → ${r.after.hash} | ${r.after.status.slice(0, 60)} |`);
} else if (MD) {
  console.log('| 카드 | 보드 상태(전) | 완료 해시 | 첫 착지 닻 | 판정 |\n|---|---|---|---|---|');
  for (const r of rows) console.log(`| T${r.n} | ${r.status} | ${r.first ? '`' + r.first.slice(0, 8) + '`' + (r.fallback ? '(착지 커밋)' : '') : '—'} | ${r.land || '-'} | ${r.note} |`);
} else {
  const sum = {}; rows.forEach(r => { const k = r.note.replace(/\d+/g, '#'); sum[k] = (sum[k] || 0) + 1; });
  console.log(JSON.stringify({ ref: REF, ...(REST ? { rest: rest.map(r => `T${r.n}: ${r.why}`) } : {}), main: sh(`git rev-parse --short ${REF}`), anchors: anchors.length, rows: rows.length, sum, hashFilled: rows.filter(r => r.first).length, statusChanges: rows.filter(r => r.newStatus).map(r => `T${r.n}: ${r.status} → ${r.newStatus}`) }, null, 1));
}
