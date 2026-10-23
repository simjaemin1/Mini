// (@regress 없음 — 러너 밖 · T903 읽기만 · 제품 무변 · 판정 0)
// === scripts/t903-referral-census.js — 지난 2주 회부 전수 → PM · 재민 판정이 남은 것만 ===
//
// ★왜 [T903] 회부는 보고마다 제 절(`## §4 회부` · `## 5. 회부(판정 0)` …)에 쌓인다. `인계/회부.md` 는 보고의 일부만 옮겼고(10-09~23 절 67 / 보고 198 카드),
//   마지막 판정 대기 사본은 `지시/_판정대기_2026-10-02.md` 다. 그 뒤 2주의 회부 중 무엇이 아직 PM · 재민 결정을 기다리는지 한 표가 없다.
//   이 자는 ① 창 안 보고(main 트리 + 미착지 `batch/*` 가지의 새 보고)의 회부 절을 항목으로 쪼개고
//   ② 항목 머리 태그로 판정자(재민 · PM · 둘)와 갈래(결정 · 정보/기록 · 다른 세션)를 가르고
//   ③ 그 뒤 글(보고 · 인계 · 지시 · main 커밋 글 · 가지 끝 커밋 글)이 "T### 회부 n" 을 닫는 말과 같이 부르면 닫힘 후보로 단다.
//   닫힘은 **글자 증거가 있을 때만**이다 — 증거가 없으면 열림(T438 규약 · 판정 0).
//   node scripts/t903-referral-census.js [--from 2026-10-09] [--to 2026-10-23] [--json <out>] [--md <out>]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const FROM = opt('from', '2026-10-09'), TO = opt('to', '2026-10-23');
const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=off', ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

// ── ① 창 안 보고 ─────────────────────────────────────────────────────────────
const RE_REP = /^T(\d+)_(\d{4}-\d{2}-\d{2})(?:_[^/]*)?\.md$/;
const docs = [];   // { id, card, date, src, text }
for (const f of fs.readdirSync(path.join(ROOT, '보고')).sort()) {
  const m = f.match(RE_REP); if (!m) continue;
  docs.push({ id: '보고/' + f, card: +m[1], date: m[2], src: 'main', text: fs.readFileSync(path.join(ROOT, '보고', f), 'utf8') });
}
// 미착지 가지 — 창 안에 움직인 `origin/batch/*` 가 main 에 없는 보고를 더한다(가지 이름을 단다)
const onMain = new Set(docs.map((d) => d.id));
const branches = git('for-each-ref', '--format=%(refname:short) %(committerdate:short)', 'refs/remotes/origin/batch').trim().split('\n')
  .map((l) => l.split(' ')).filter(([, d]) => d >= FROM).map(([b]) => b).sort();
const brTips = [];
for (const b of branches) {
  let names = '';
  try { names = git('diff', '--name-only', '--diff-filter=AM', 'origin/main...' + b, '--', '보고'); } catch (e) { continue; }
  for (const n of names.trim().split('\n').filter(Boolean)) {
    const base = path.basename(n), m = base.match(RE_REP);
    if (!m || onMain.has(n)) continue;
    if (docs.some((d) => d.id === n)) continue;
    docs.push({ id: n, card: +m[1], date: m[2], src: b.replace(/^origin\//, ''), text: git('show', b + ':' + n) });
  }
  brTips.push(b);
}

// ── ② 회부 절 → 항목 ─────────────────────────────────────────────────────────
// 절 머리 — 회부가 **그 절의 이름**일 때만(`T781 회부 1` 같은 부름 · `(회부 3)` 꼬리표는 아니다) · 재민 칸 · 판정 대기
const RE_SEC = /^(#{2,4})\s+(?:[§0-9.①-⑳ⓐ-ⓩ\s]*)(?:[^\n]*?[·—]\s*)?(?<!T\d+\s)(회부(?!\s*[0-9#①-⑳])|재민 칸|판정 대기|판정대기|남은 것)/;
const RE_ITEM = /^(?:(\d+)[.)]\s+|([*-])\s+|([①-⑳㉠-㉭])\s*|\|\s*)/;
const circ = (c) => '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.indexOf(c) + 1 || '㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭'.indexOf(c) + 1;
function sections(text) {
  const L = text.split('\n'), out = [];
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(RE_SEC); if (!m) continue;
    const lv = m[1].length, body = [];
    let j = i + 1;
    for (; j < L.length; j++) { const h = L[j].match(/^(#{1,6})\s/); if (h && h[1].length <= lv) break; body.push(L[j]); }
    out.push({ head: L[i].replace(/^#+\s*/, ''), line: i + 1, body });
    i = j - 1;
  }
  return out;
}
// 항목 — 번호(`1.`) · 원문자가 있으면 그것만 항목이고 맨 앞 불릿 · 표 줄은 앞 항목에 붙는다(덧말 · 자료 표).
//   번호가 없으면 맨 앞 불릿이 항목이다. 표만 있는 절은 표 통째가 한 항목이다(선택지 표 · 자료 표).
function items(sec) {
  const numbered = sec.body.some((l) => /^(\d+[.)]\s|[①-⑳㉠-㉭])/.test(l));
  const bullets = sec.body.some((l) => /^[*-]\s/.test(l));
  const out = []; let cur = null, k = 0;
  for (const l of sec.body) {
    if (/^\s*$/.test(l)) continue;
    const m = !/^\s/.test(l) ? l.match(RE_ITEM) : null;
    const isNum = m && (m[1] || m[3]), isBul = m && m[2], isTab = m && m[0].startsWith('|');
    const start = numbered ? isNum : bullets ? isBul : isTab && !cur;
    if (start) {
      k++;
      cur = { n: m[1] ? +m[1] : m[3] ? circ(m[3]) : k, text: l.trim() };
      out.push(cur);
    } else if (cur) cur.text += ' ' + l.trim();
  }
  return out;
}
// 머리 태그 — `**[PM · 착지] …**` · `[재민]` · `(재민)` · `**재민 ·`
function tagOf(t) {
  const h = t.replace(/^(\d+[.)]|[*-]|[①-⑳㉠-㉭]|\|)\s*/, '').replace(/^~~/, '').replace(/^\*\*/, '').replace(/^★+/, '');
  const m = h.match(/^\[([^\]]{1,80})\]/) || h.match(/^\(([^)]{1,60})\)/) || h.match(/^\*\*\[([^\]]{1,80})\]/);
  return m ? m[1] : '';
}
const STRUCK = (t) => /^(\d+[.)]|[*-]|[①-⑳㉠-㉭])\s*~~/.test(t) || /^(\d+[.)]|[*-])\s*\*\*~~/.test(t);
function classify(it, secHead) {
  const tag = tagOf(it.text), head = it.text.slice(0, 220);
  const jm = /재민/.test(tag), pm = /\bPM\b/.test(tag);
  const info = /^(정보|기록|관찰|알림|참고|메모|운영 · 기록|한계)/.test(tag) || /^(정보|기록|메모)/.test(tag.replace(/^[^·]*·\s*/, '')) && !jm && !pm;
  const other = !jm && !pm && /세션\s*\d+|^T\d+|다른 영역|설계|뒤 카드|다음 카드|2단계/.test(tag);
  let who = jm && pm ? '재민·PM' : jm ? '재민' : pm ? 'PM' : '';
  if (!who && !tag) { const a = /재민/.test(head), b = /\bPM\b/.test(head); who = a && b ? '재민·PM?' : a ? '재민?' : b ? 'PM?' : ''; }
  if (!who && !tag) {   // 절 머리가 판정자를 말한다(`재민 칸` · `회부(PM)` · `고르는 것은 PM · 재민`)
    if (/재민 칸|재민이 (판정|켤|고를)/.test(secHead)) who = '재민?';
    else if (/회부\s*\(PM\)/.test(secHead)) who = 'PM?';
    else if (/PM\s*·\s*재민|재민\s*·\s*PM|재민\/PM/.test(secHead)) who = '재민·PM?';
  }
  const pmInfo = pm && !jm && /^PM\s*·\s*(기록|정보|알림|메모)(?!\s*·\s*(켬|켤|판정))/.test(tag);
  const closedSelf = STRUCK(it.text) || /닫힘|닫혔다|닫았다|— 닫음/.test(tag);
  // 태그 없는 항목은 묻는 말이 있어야 결정이다(`둘지` · `켤지` · `고를` · `?` …) — 없으면 발견 · 자료(판정을 안 묻는다)
  const asks = /(할지|둘지|켤지|볼지|갈지|올릴지|내릴지|바꿀지|넣을지|뺄지|쓸지|살릴지|막을지|열지|지울지|옮길지|칠지|셀지|붙일지|맞출지|고를|정할|골라|고르는|결정|판정(?!\s*0)|정하|택일|중 하나|\?|인가\b|일지|나눌지|어느 쪽)/.test(head);
  const kind = closedSelf ? 'self-closed' : (info || pmInfo) ? 'info' : (who && (tag || asks)) ? 'decide' : other ? 'other' : asks ? 'decide' : 'finding';
  if (kind === 'decide' && !who) who = '미지정';
  return { tag, who, kind };
}

// ── ③ 뒤 글의 부름 — "T### 회부 n" · "T### §n" 근처에 닫는 말이 있나 ───────────────────
const refDocs = [];   // { id, card, date, text }
for (const d of docs) refDocs.push(d);
for (const f of fs.readdirSync(path.join(ROOT, '보고'))) { const m = f.match(RE_REP); if (m && m[2] < FROM) continue; }
for (const dir of ['인계', '지시']) for (const f of fs.readdirSync(path.join(ROOT, dir))) {
  if (!f.endsWith('.md')) continue;
  const m = f.match(/T(\d+)/);
  refDocs.push({ id: `${dir}/${f}`, card: m ? +m[1] : 1e9, date: '9999', text: fs.readFileSync(path.join(ROOT, dir, f), 'utf8') });
}
const log = git('log', '--since=' + FROM, '--format=%H%x01%ad%x01%B%x02', '--date=short', 'origin/main');
for (const c of log.split('\x02')) { const [h, d, b] = c.split('\x01'); if (!b) continue; const m = b.match(/T(\d+)/); refDocs.push({ id: 'commit ' + h.trim().slice(0, 8), card: m ? +m[1] : 0, date: d, text: b }); }
for (const b of brTips) { const t = git('log', '-1', '--format=%h%x01%ad%x01%B', '--date=short', b).split('\x01'); const m = t[2].match(/T(\d+)/); refDocs.push({ id: `commit ${t[0]} (${b.replace(/^origin\//, '')})`, card: m ? +m[1] : 0, date: t[1], text: t[2] }); }
// 닫는 말 — 부름 **바로 뒤 50자 · 바로 앞 24자** 안만 본다(넓게 보면 "T866 · T867 착지 뒤" · "그대로" 가 닫힘으로 섞인다)
const CLOSE_AFTER = /^[^|\n]{0,50}?(닫(?:힘|는다|았다|음|혔다)|을 닫|를 닫|확정|결정(?:했|됨|함|이 났)|PM \d+-\d+\w? 결정|(?:PM|재민)[^\n]{0,8}정함|해소|고쳤다|고침|흡수|접었다|답했다|켬 기본|기본 켬)/;
const CLOSE_BEFORE = /(\[닫음\]|닫음 ·|닫힘 ·|닫은 )[^\n]{0,24}$/;
const NOT_CLOSE = /^[^|\n]{0,50}?(그대로|안 닫|못 닫|닫지 않|닫지 못|닫는 조건이 안|열어|열림|남는다|남은|미결|대기)/;
const NUMS = (str) => str.split(/\s*[·,]\s*|\s+/).flatMap((x) => { const r = x.match(/^(\d+)[~-](\d+)$/); if (r) { const a = []; for (let i = +r[1]; i <= +r[2]; i++) a.push(i); return a; } return [/^\d+$/.test(x) ? +x : circ(x)]; }).filter((x) => x > 0);
// 한 글에서 "T{c} 회부 n · m"(또는 `회부 n(T{c})`)를 찾는다 → [{ n, closes, ctx }]
function refsIn(text, card) {
  const out = [];
  // 번호 = 아라비아 숫자 줄(`1 · 3` · `1~3`) 또는 원문자 줄 — `회부 1 ③` 의 ③ 은 그 항목 안 갈래라 번호가 아니다
  const N = '(\\d+(?:\\s*[·,~\\-]\\s*\\d+)*|[①-⑳](?:\\s*[·,]\\s*[①-⑳])*)';
  const re = new RegExp(`T${card}(?![0-9])\\s*(?:§\\s*\\d+\\s*)?회부\\s*${N}|회부\\s*${N}\\s*\\(\\s*T${card}(?![0-9])`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60), before = text.slice(Math.max(0, m.index - 24), m.index);
    const closes = !NOT_CLOSE.test(after) && (CLOSE_AFTER.test(after) || CLOSE_BEFORE.test(before));
    const ctx = (before + m[0] + after).replace(/\s+/g, ' ');
    for (const n of NUMS(m[1] || m[2] || '')) out.push({ n, closes, ctx });
  }
  return out;
}
// 태스크보드 — `| T### | 갈래 | 우선 | 상태 | 세션 | 날 | 앞 | 출처 |` · 출처 칸의 "T{c} 회부 n" = 그 회부로 **카드를 깎았다**(PM 이 고른 것)
const BOARD = [];
for (const l of fs.readFileSync(path.join(ROOT, '지시', '_태스크보드_v1.md'), 'utf8').split('\n')) {
  const c = l.split('|').map((x) => x.trim());
  if (c.length < 9 || !/^T\d+$/.test(c[1])) continue;
  BOARD.push({ card: c[1], what: c[2], state: c[4], date: c[6], from: c.slice(7, c.length - 1).join(' · ') });
}
// ── 묶기 ─────────────────────────────────────────────────────────────────────
const rows = [];
for (const d of docs) {
  if (d.date < FROM || d.date > TO) continue;
  if (d.card === 903) continue;   // 이 표 자신(머리에 "판정 대기" 가 들어 다음 판에 제 표를 다시 먹지 않게)
  for (const s of sections(d.text)) for (const it of items(s)) {
    const c = classify(it, s.head);
    rows.push({ card: d.card, date: d.date, doc: d.id, src: d.src, sec: s.head.slice(0, 60), n: it.n, tag: c.tag, who: c.who, kind: c.kind, text: it.text.replace(/\s+/g, ' ').slice(0, 400), refs: [] });
  }
}
const byCard = new Map();
for (const r of rows) { if (!byCard.has(r.card)) byCard.set(r.card, []); byCard.get(r.card).push(r); }
for (const [card, rs] of byCard) {
  for (const d of refDocs) {
    if (d.id === '지시/_태스크보드_v1.md') continue;   // 보드는 아래 칸 단위로
    if (d.card === 903 && d.id.startsWith('보고/')) continue;   // 이 표 자신은 뒤 글이 아니다
    if (d.card === card && d.id.startsWith('보고/')) continue;   // 제 보고 · 추신은 자기 말(원문 닫힘은 classify 가 본다)
    if (!d.text.includes('T' + card)) continue;
    for (const ref of refsIn(d.text, card)) {
      const r = rs.find((x) => x.n === ref.n); if (!r) continue;
      const cardDoc = d.id.match(/^지시\/지시_(T\d+)\.md$/);   // 지시서가 부르면 그 회부로 **카드를 깎은 것**(닫힘이 아니라 넘어감)
      if (cardDoc) { r.cut = r.cut || []; const b = BOARD.find((x) => x.card === cardDoc[1]); r.cut.push(`${cardDoc[1]}(${b ? b.state : '지시서'})`); continue; }
      r.refs.push({ by: d.id, closes: ref.closes, ctx: ref.ctx.slice(0, 220) });
    }
  }
  for (const b of BOARD) {
    if (+b.card.slice(1) <= card) continue;
    for (const ref of refsIn(b.from, card)) { const r = rs.find((x) => x.n === ref.n); if (r) r.cut = r.cut || []; if (r) r.cut.push(`${b.card}(${b.state})`); }
    // 출처가 카드째(`T876`)이고 갈래가 켬 기본이면 — 그 카드의 "켤지" 항목은 그 카드로 갔다
    if (new RegExp(`(^|[^0-9])T${card}(?![0-9])(?!\\s*(§\\s*\\d+\\s*)?회부)`).test(b.from) && /켬 기본|기본 켬/.test(b.what))
      for (const r of rs) if (r.kind === 'decide' && /켤지|켜기|켤 것|켬 기본|기본 켬|올릴지/.test(r.text)) { r.cut = r.cut || []; r.cut.push(`${b.card}(${b.state} · 켬 기본)`); }
  }
}
// 족보 — PM · 재민 결정의 정본 줄(`(NNN) ★재민 10-15 판정 — …` · `카드 … — ★PM 결정: T807 · T806 손잡이 켬 기본 · …` ·
//   `PM 착지 … **켬 기본 T792**(T731 · T761 …)` · `재민 판정 대기: T825 …`). 창 안 줄만(첫 줄 날 ≥ FROM — 줄 머리의 MM-DD).
//   켬 기본 결정 → 그 카드의 "켤지" 항목을 닫는다 · 다른 결정 → 그 카드의 열린 결정 항목이 **하나뿐일 때만** 닫고, 아니면 칸에 적어 둔다(항목 대조는 사람)
//   대기 목록 → 그 카드 항목에 "족보 대기" 를 적는다(다른 자가 닫았어도 열림으로 되돌린다 — 정본이 대기라 했다)
const JOKBO = [];
{
  const md = (x) => { const m = x.match(/(?:^|[^0-9])(\d{1,2})-(\d{2})(?![0-9])/); return m ? `2026-${m[1].padStart(2, '0')}-${m[2]}` : null; };
  for (const l of fs.readFileSync(path.join(ROOT, '인계', '족보.md'), 'utf8').split('\n')) {
    const m = l.match(/^\* \*\*\((\d+)\)\s*(.*)$/); if (!m) continue;
    const no = +m[1], body = m[2], d = md(body.slice(0, 80));
    if (!d || d < FROM || d > TO) continue;
    const segs = [];
    const MARK = /(★?PM 결정[^:：\n]{0,6}[:：]|★켬 기본 결정[:：]|켬 기본 결정[:：]|재민 (?:판정 )?대기[:：]|남긴 판정[:：])/g;
    let mm, marks = [];
    while ((mm = MARK.exec(body))) marks.push({ i: mm.index, end: mm.index + mm[0].length, wait: /대기|남긴/.test(mm[0]) });
    for (let k = 0; k < marks.length; k++) {
      let seg = body.slice(marks[k].end, k + 1 < marks.length ? marks[k + 1].i : body.length);
      const cut = seg.search(/세션\s*\d+\s+T\d+|\.\s|★/); if (cut > 0) seg = seg.slice(0, cut);
      segs.push({ kind: marks[k].wait ? 'wait' : 'pm', text: seg });
    }
    if (/^★재민\s*\d+-\d+/.test(body) || /^[^—]{0,80}재민\s*(?:\d+-\d+\s*)?["“]/.test(body)) segs.push({ kind: 'jm', text: body.slice(0, body.search(/→/) > 0 ? body.search(/→/) : 400).slice(0, 500) });
    // PM 착지 줄의 켬 기본 — `**켬 기본 T792**(T731 · T761 …)` · `**T861 켬 기본**` · `T846(`T834_VERN_NUM` 켬 기본`
    if (/PM 착지|착지 —/.test(body.slice(0, 40))) for (const k of body.matchAll(/(?:켬 기본\*{0,2}\s*(T\d+)\*{0,2}(\([^)]{0,80}\))?|(T\d+)(?:\s*·\s*T\d+)*\s*(?:켬 기본|\([^)]{0,40}켬 기본))/g))
      segs.push({ kind: 'on', text: k[0] });
    // 목록 꼴 — `★**켬 기본**(되돌림 \`=0\`): \`T750_CAST_SLICE\`(…) · \`T743_DUSK_STAMP\`(…)` · `**끔 유지**: \`T715_HUNT_GC\``
    for (const k of body.matchAll(/(켬 기본|끔 유지)\**(?:\([^)]{0,40}\))?\s*[:：]\s*([^]{0,600}?)(?=\.\s|\*\*(?:켬|끔)|$)/g)) {
      const knobs = [...k[2].matchAll(/`(T\d+_[A-Z0-9_]+)`/g)].map((x) => x[1]);
      if (knobs.length) segs.push({ kind: k[1] === '켬 기본' ? 'on' : 'off', text: knobs.join(' · ') + ' ' + k[1] });
    }
    // 손잡이 이름으로 적은 켬 기본(`★\`T734_ASTAR_SLICE\` **켬 기본**` · `\`T862_ECON_FAST\` 켬 기본`) — 이름 머리의 T### 가 그 카드다
    for (const k of body.matchAll(/`?T(\d+)_[A-Z0-9_]+`?\s*\*{0,2}\s*(?:·\s*`?T\d+_[A-Z0-9_]+`?\s*)*\*{0,2}\s*켬 기본/g)) segs.push({ kind: 'on', text: k[0] });
    // 이 줄이 **새로 낸 카드**(`카드 T817~T830` · `세션1 T823`)는 결정 대상이 아니다 — 그 카드의 보고는 이 줄 뒤에 온다
    const fresh = new Set();
    for (const r of body.matchAll(/카드\s*T(\d+)\s*~\s*T(\d+)/g)) for (let x = +r[1]; x <= +r[2]; x++) fresh.add(x);
    for (const r of body.matchAll(/세션\s*\d+\s*T(\d+)/g)) fresh.add(+r[1]);
    for (const sg of segs) JOKBO.push({ no, date: d, kind: sg.kind, text: sg.text.trim(), fresh });
  }
}
// 한 절 — 결정 목록 안에서 `T{c}` 가 머리인 조각(다음 ` · T…` 까지 · 괄호 안은 건너뛴다). 괄호 · 화살 뒤의 T 는 **다음 카드**라 결정 대상이 아니다.
//   목록 머리(`T834 · T835 · T838 켬 기본`)는 술어를 공유한다 — 바로 뒤가 ` · T…` 로 이어지면 그 목록 끝 술어까지 잇는다.
function clauseOf(text, c) {
  const re = new RegExp(`T${c}(?![0-9])`, 'g'); let m; const out = [];
  while ((m = re.exec(text))) {
    const pre = text.slice(0, m.index);
    let depth = 0; for (const ch of pre) { if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1); }
    if (depth > 0 || /(→|세션\s*\d+)\s*$/.test(pre)) continue;
    let j = m.index + m[0].length, dep = 0, listHead = /^\s*(·|\/)\s*T\d/.test(text.slice(j));
    for (; j < text.length; j++) {
      const ch = text[j];
      if (ch === '(') dep++; else if (ch === ')') dep--;
      else if (dep <= 0 && /^\s·\s/.test(text.slice(j, j + 3))) {
        const nextIsT = /^\s·\s*T\d+/.test(text.slice(j));
        if (listHead && nextIsT) continue;   // 아직 목록 머리
        if (listHead && !nextIsT) { listHead = false; continue; }
        if (nextIsT) break;
      }
    }
    out.push(text.slice(m.index, j));
  }
  return out;
}
const words = (t) => new Set((t.match(/[가-힣A-Za-z_]{2,}|\d+(?:\.\d+)?/g) || []).filter((w) => !/^(T\d+|켬|기본|판정|결정|재민|PM|그대로|카드)$/.test(w)));
const ASK_ON = (r) => { const h = (r.tag + ' ' + r.text.slice(0, 110)); return /켤지|켜기|켬 기본|기본 켬|올릴지|켤 것/.test(h) && !/켬 기본 세계/.test(h); };
for (const j of JOKBO.sort((a, b) => a.no - b.no)) {
  const cs = [...new Set([...j.text.matchAll(/T(\d+)/g)].map((x) => +x[1]))];
  for (const c of cs) {
    if (j.fresh.has(c)) continue;
    const rs = (byCard.get(c) || []).filter((r) => r.kind === 'decide' && r.date <= j.date);
    if (!rs.length) continue;
    const cl = j.kind === 'on' || j.kind === 'off' || j.kind === 'jm' ? [j.text] : clauseOf(j.text, c);
    if (!cl.length) continue;
    const clause = cl.join(' / ');
    const tag = `족보 (${j.no}) ${j.kind === 'wait' ? '대기' : '결정'}: ${clause.replace(/\*\*/g, '').replace(/\|/g, '/').slice(0, 90)}`;
    let target;
    if (j.kind === 'on' || j.kind === 'off' || (j.kind !== 'wait' && /켬 기본|기본 켬/.test(clause))) {
      // 손잡이 이름이 있는 결정은 **그 이름을 든 항목**(또는 이름 없는 켤지 항목)만 — `T715_HUNT_GC 끔 유지` 가 같은 카드의 `T689_GC` 켤지를 닫지 않게
      const kn = [...clause.matchAll(/T\d+_[A-Z0-9_]+/g)].map((x) => x[0]);
      target = rs.filter(ASK_ON).filter((r) => { const rk = r.text.match(/T\d+_[A-Z0-9_]{2,}/g) || []; return !kn.length || !rk.length || rk.some((x) => kn.includes(x)); });
    }
    else {   // 낱말 겹침이 가장 큰 항목 하나(겹침 ≥ 2 · 홀로 가장 클 때) — 아니면 판정자가 맞는 열린 항목이 하나뿐일 때
      const W = words(clause.replace(new RegExp(`T${c}`), ''));
      const pool = rs.filter((r) => (j.kind === 'jm' || j.kind === 'wait' ? /재민|미지정/.test(r.who) : true));
      const sc = pool.map((r) => ({ r, n: [...words(r.text)].filter((w) => W.has(w)).length })).sort((a, b) => b.n - a.n);
      target = sc.length && sc[0].n >= 2 && (sc.length === 1 || sc[1].n < sc[0].n) ? [sc[0].r] : pool.length === 1 ? pool : [];
      if (!target.length) { for (const r of pool) r.jokbo = (r.jokbo || []).concat(tag); continue; }
    }
    for (const r of target) { r.jokbo = (r.jokbo || []).concat(tag); r.jokboLast = j.kind === 'wait' ? 'wait' : 'close'; r.jokboTag = tag; }
  }
}
// 코드 — "켤지" 항목이 손잡이 이름을 들고 있으면 main 코드에서 그 손잡이를 읽는 꼴을 본다:
//   `!== '0'` / `!= '0'` / `=== '0') ? 끔` 꼴(= 빈 값이 켬)이면 **켬 기본으로 올라갔다**(결정이 났다) · `=== '1'` 만이면 아직 끔 기본(열림 그대로)
const CODE = (() => { const out = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|\.git/.test(f.name)) walk(p); } else if (/\.(js|mjs|cjs)$/.test(f.name) && !/\.min\.js$|economy-engine\.browser/.test(f.name)) out.push(fs.readFileSync(p, 'utf8')); } }; for (const d of ['server', 'sim', 'public', 'lab']) { try { walk(path.join(ROOT, d)); } catch (e) {} } return out.join('\n'); })();
const knobOn = (k) => { const re = new RegExp(`${k}[^\\n]{0,40}?(!==?\\s*['"]0['"]|===?\\s*['"]0['"]\\s*\\)?\\s*\\?\\s*false)`); return re.test(CODE); };
for (const r of rows) {
  if (r.kind !== 'decide' || !ASK_ON(r)) continue;
  const ks = [...new Set([...r.text.matchAll(/`?(T\d+_[A-Z0-9_]{2,})`?/g)].map((x) => x[1]))].filter((k) => +k.slice(1, k.indexOf('_')) >= 600);
  if (!ks.length) continue;
  const on = ks.filter(knobOn);
  if (on.length && on.length === ks.length) r.codeOn = on;
}
// 오늘(10-23) PM 카드 표 — 보드에 아직 없는 카드(채팅 카드 표 그대로 · 세션에 내려간 것)
const TODAY = [
  { card: 'T896', what: '서버 틱 몫 표 다시 → 1위 줄이기(T862·T876 뒤 남은 가장 큰 µs)', from: [] },
  { card: 'T897', what: '갱신 되돌리기 한 줄(update-live.sh --rollback)', from: [] },
  { card: 'T898', what: '산 띠 옮기기를 띠 상자 readPixels로(T863 #1 · 손잡이 끔 기본)', from: [[863, 1]] },
  { card: 'T900', what: 'T874 켬 기본(교전 유닛 빠른 꼴 · 전쟁 자 3시드 · 기준선)', from: [], on: 874 },
  { card: 'T901', what: '서버 디스크·백업 점검 한 줄', from: [] },
  { card: 'T902', what: 'Safari(WebKit) e2e 한 벌', from: [] },
];
for (const t of TODAY) {
  for (const [c, n] of t.from) for (const r of byCard.get(c) || []) if (r.n === n) { r.cut = r.cut || []; r.cut.push(`${t.card}(10-23 카드)`); }
  if (t.on) for (const r of byCard.get(t.on) || []) if (r.kind === 'decide' && /켤지|켜기|켤 것|켬 기본|기본 켬|올릴지/.test(r.text)) { r.cut = r.cut || []; r.cut.push(`${t.card}(10-23 카드 · 켬 기본)`); }
}
for (const r of rows) {
  const cl = r.refs.filter((x) => x.closes);
  // 착지를 묻는 항목(`[PM · 착지]` · 새 판 · 기준선 후보)은 그 보고가 main 에 있으면(= 가지가 착지했다) 닫혔다
  const landAsk = /착지|새 판 후보|기준선 후보|판 후보/.test(r.tag + ' ' + r.text.slice(0, 80)) && !/켬 기본|켤지/.test(r.tag);
  // 족보(정본)의 마지막 말이 이긴다 — 대기라 했으면 다른 자가 닫았어도 열림 · 결정이라 했으면 닫힘
  r.state = r.kind === 'self-closed' ? '닫힘(원문)' : r.jokboLast === 'wait' ? '열림' : r.jokboLast === 'close' ? '닫힘(족보)' : r.codeOn ? '닫힘(코드 켬 기본)' : cl.length ? '닫힘(글)' : (landAsk && r.src === 'main') ? '닫힘(착지)' : r.cut ? '카드로 감' : '열림';
}
const K = (f) => rows.filter(f).length;
console.log(`창 ${FROM} ~ ${TO} · 보고 ${new Set(rows.map((r) => r.doc)).size}(가지 ${new Set(rows.filter((r) => r.src !== 'main').map((r) => r.doc)).size}) · 회부 항목 ${rows.length}`);
console.log(`  갈래: 결정 ${K((r) => r.kind === 'decide')} · 정보/기록 ${K((r) => r.kind === 'info')} · 다른 세션/설계 ${K((r) => r.kind === 'other')} · 발견 · 자료(묻는 말 없음) ${K((r) => r.kind === 'finding')} · 원문 닫힘 ${K((r) => r.kind === 'self-closed')}`);
const dec = rows.filter((r) => r.kind === 'decide');
console.log(`  결정 항목 ${dec.length}: ${['열림', '닫힘(글)', '닫힘(족보)', '닫힘(코드 켬 기본)', '닫힘(착지)', '카드로 감', '닫힘(원문)'].map((k) => `${k} ${dec.filter((r) => r.state === k).length}`).join(' · ')}`);
console.log(`  판정자(결정 · 열림): ${['재민', 'PM', '재민·PM', '재민?', 'PM?', '재민·PM?', '미지정'].map((w) => `${w} ${dec.filter((r) => r.state === '열림' && r.who === w).length}`).join(' · ')}`);
if (opt('json', '')) fs.writeFileSync(opt('json', ''), JSON.stringify({ from: FROM, to: TO, rows }, null, 1));

// ── 표 ─────────────────────────────────────────────────────────────────────
if (opt('md', '')) {
  const clean = (t, n) => t.replace(/^(\d+[.)]|[*-]|[①-⑳㉠-㉭]|\|)\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, n);
  const ord = { '재민': 0, '재민?': 1, '재민·PM': 2, '재민·PM?': 3, 'PM': 4, 'PM?': 5, '미지정': 6 };
  const open = rows.filter((r) => r.kind === 'decide' && r.state === '열림').sort((a, b) => (ord[a.who] - ord[b.who]) || (a.card - b.card) || (a.n - b.n));
  const L = [];
  L.push(`| # | 판정자 | 회부 | 날 | 어디 | 묻는 것(원문 머리 ≤ 150자) | 뒤 글 · 족보 |`, '|---|---|---|---|---|---|---|');
  open.forEach((r, i) => {
    const where = r.src === 'main' ? 'main' : `가지 \`${r.src.replace(/^batch\//, '')}\``;
    const refs = r.refs.length ? `${r.refs.length}(${[...new Set(r.refs.map((x) => x.by.replace(/^보고\//, '').replace(/_2026-.*$/, '').replace(/^commit (\w+).*/, '$1')))].slice(0, 3).join(' · ')})` : '—';
    const jk = r.jokbo ? [...new Set(r.jokbo.map((x) => x.match(/^족보 \((\d+)\) (대기|결정)/)).filter(Boolean).map((m) => `족보 ${m[1]} ${m[2] === '대기' ? '대기 ✓' : '결정 언급 — 항목 대조'}`))].join(' · ') : '';
    L.push(`| ${i + 1} | ${r.who} | T${r.card} ${r.n} | ${r.date.slice(5)} | ${where} | ${clean(r.text, 150)} | ${[refs === '—' ? '' : refs, jk].filter(Boolean).join(' · ') || '—'} |`);
  });
  const shut = rows.filter((r) => r.kind === 'decide' && r.state !== '열림').sort((a, b) => a.card - b.card || a.n - b.n);
  const S = ['| 회부 | 판정자 | 상태 | 증거 | 머리 |', '|---|---|---|---|---|'];
  for (const r of shut) {
    const ev = r.state === '닫힘(글)' ? r.refs.filter((x) => x.closes).slice(0, 1).map((x) => `${x.by.replace(/^보고\//, '')}: “${x.ctx.replace(/\|/g, '/').slice(0, 90)}”`).join('')
      : r.state === '카드로 감' ? [...new Set(r.cut)].join(' · ') : r.state === '닫힘(착지)' ? '보고가 main 에 있다(가지 착지)' : r.state === '닫힘(족보)' ? r.jokboTag : r.state === '닫힘(코드 켬 기본)' ? `main 코드가 ${r.codeOn.join(' · ')} 를 빈 값 = 켬으로 읽는다` : '원문 취소선';
    S.push(`| T${r.card} ${r.n} | ${r.who} | ${r.state} | ${ev} | ${clean(r.text, 70)} |`);
  }
  const fnd = rows.filter((r) => r.kind === 'finding' && r.state === '열림').sort((a, b) => a.card - b.card || a.n - b.n);
  const F = fnd.map((r) => `T${r.card} ${r.n} ${clean(r.text, 70)}`);
  const C = (k) => rows.filter((r) => r.kind === k).length;
  const dec = rows.filter((r) => r.kind === 'decide');
  fs.writeFileSync(opt('md', ''), JSON.stringify({
    from: FROM, to: TO, docs: new Set(rows.map((r) => r.doc)).size, branchDocs: new Set(rows.filter((r) => r.src !== 'main').map((r) => r.doc)).size, items: rows.length,
    kinds: { decide: C('decide'), info: C('info'), other: C('other'), finding: C('finding'), selfClosed: C('self-closed') },
    states: Object.fromEntries(['열림', '닫힘(글)', '닫힘(족보)', '닫힘(코드 켬 기본)', '닫힘(착지)', '카드로 감', '닫힘(원문)'].map((k) => [k, dec.filter((r) => r.state === k).length])),
    who: Object.fromEntries(Object.keys(ord).map((w) => [w, open.filter((r) => r.who === w).length])),
    openTable: L.join('\n'), shutTable: S.join('\n'), findings: F,
  }, null, 1));
}
