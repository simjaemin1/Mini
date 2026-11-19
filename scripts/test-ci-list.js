#!/usr/bin/env node
// @regress
// @harness-only
// @bait 5
// === scripts/test-ci-list.js — CI core 목록 = 분류표 (T1350 · 재민 11-17 "CI 체크 표시를 믿을 수 있게") =======================================
//
// ★무엇: `.github/workflows/regress-unit.yml` 의 core 잡 목록(표지 사이 블록 — `ci-class.js --write-yml` 이 쓴다)이 분류표(`scripts/ci-class.json`)의
//   core 줄과 **정확히 같은지**(빠짐 · 더함 · 겹침 0), 표의 core 줄이 올림 규칙(가 · 나 · 다섯 판 다 초록 · 가장 긴 판 60초 이하)을 지키는지,
//   잡마다 합 초가 10분 창 안인지 본다. 손으로 목록을 고치거나 표를 안 고치고 yml 만 고치면 여기서 빨강이다.
// ★미끼(이 파일 안): ⓐ yml 사본에서 목록 한 줄을 뺀다 ⓑ 같은 이름을 다른 잡에 한 번 더 ⓒ 표 사본의 core 줄 하나를 한 판 빨강으로 —
//   셋 다 정확히 한 자리만 바꿨는지 세고, 어느 단언이 빨강이 되는지 단언한다.
// ★[T1367] 서버 잡: yml 의 `SRV_LIST`(표지 `ci-class srv` 사이)가 표의 srv 줄과 같은지 · srv 줄이 올림 규칙(다 · 다섯 판 다 초록 · 60초 이하)을
//   지키는지 · core 와 겹침 0 · 차례로 도는 합 초가 창 안인지. 미끼 ⓓ 서버 목록 한 줄 뺌 · ⓔ 표 사본의 srv 줄 하나를 한 판 빨강.
// ★제품 부름 0(`@harness-only` — 옛 코드 빨강 단계 건너뜀 · `test-harness-lint` ⑳ 가 확인).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require('./ci-class.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const YML = path.join(ROOT, '.github', 'workflows', 'regress-unit.yml');
const TABLE = path.join(ROOT, 'scripts', 'ci-class.json');
const SHARD_BUDGET = 420;   // 잡 하나의 하네스 합 초(설치 · npm ci 약 2분을 더해 10분 창 안) — 판정 자리의 수는 이 하나
const SRV_BUDGET = 420;     // [T1367] 서버 잡 하나(차례로)의 하네스 합 초 — core 와 같은 10분 창(설치 약 2분 · 배수 쉼 몇 초)

//   yml 글자 → 잡마다 목록(표지 사이 · `- shard:` 마다 `list: >-` 아래 줄)
function lists(ymlText) {
  const a = ymlText.indexOf(C.MARK_A), b = ymlText.indexOf(C.MARK_B);
  if (a < 0 || b < 0 || b < a) return null;
  const out = []; let cur = null, inList = false;
  for (const l of ymlText.slice(a, b).split('\n')) {
    const s = /^\s*-\s*shard:\s*'([^']+)'/.exec(l); if (s) { cur = { shard: s[1], list: [] }; out.push(cur); inList = false; continue; }
    if (/^\s*list:\s*>-\s*$/.test(l)) { inList = true; continue; }
    const n = /^\s+(test-[\w.-]+\.js)\s*$/.exec(l); if (inList && cur && n) cur.list.push(n[1]);
  }
  return out;
}
function coreOf(T) { return Object.keys(T.rows).filter((n) => T.rows[n].core).sort(); }
function srvOf(T) { return Object.keys(T.rows).filter((n) => T.rows[n].srv).sort(); }
//   yml 글자 → 서버 잡 목록(표지 `ci-class srv` 사이 · `- srv:` 마다 `list: >-` 아래 줄) — 잡마다 [{ srv, list }]
function srvJobs(ymlText) {
  const a = ymlText.indexOf(C.MARK_SA), b = ymlText.indexOf(C.MARK_SB);
  if (a < 0 || b < 0 || b < a) return null;
  const out = []; let cur = null, inList = false;
  for (const l of ymlText.slice(a, b).split('\n')) {
    const s = /^\s*-\s*srv:\s*'([^']+)'/.exec(l); if (s) { cur = { srv: s[1], list: [] }; out.push(cur); inList = false; continue; }
    if (/^\s*list:\s*>-\s*$/.test(l)) { inList = true; continue; }
    const n = /^\s+(test-[\w.-]+\.js)\s*$/.exec(l); if (inList && cur && n) cur.list.push(n[1]);
  }
  return out;
}
function srvList(ymlText) { const J = srvJobs(ymlText); return J ? J.flatMap((x) => x.list) : null; }
function compareSrv(ymlText, T) {
  const L = srvList(ymlText); if (!L) return { L: null, miss: [], extra: [], dup: [] };
  const want = srvOf(T), seen = new Set(), dup = [];
  for (const n of L) { if (seen.has(n)) dup.push(n); seen.add(n); }
  return { L, miss: want.filter((n) => !seen.has(n)), extra: [...seen].filter((n) => !want.includes(n)), dup };
}
function srvBreak(T) {
  const bad = [];
  for (const [n, r] of Object.entries(T.rows)) {
    if (!r.srv) continue;
    const runs = r.runs || [];
    if (r.cls !== '다') bad.push(`${n}: 분류 ${r.cls}`);
    else if (r.core) bad.push(`${n}: core 와 겹침`);
    else if (runs.length < 5) bad.push(`${n}: ${runs.length}판`);
    else if (!runs.every((x) => x.green)) bad.push(`${n}: 빨강 판`);
    else if (Math.max(...runs.map((x) => x.secs)) > C.CORE_MAX_SEC) bad.push(`${n}: ${Math.max(...runs.map((x) => x.secs))}초`);
  }
  return bad;
}
//   표 줄이 올림 규칙을 지키나(표가 스스로 거짓말을 안 하는가)
function ruleBreak(T) {
  const bad = [];
  for (const [n, r] of Object.entries(T.rows)) {
    if (!r.core) continue;
    const runs = r.runs || [];
    if (!['가', '나'].includes(r.cls)) bad.push(`${n}: 분류 ${r.cls}`);
    else if (runs.length < 5) bad.push(`${n}: ${runs.length}판`);
    else if (!runs.every((x) => x.green)) bad.push(`${n}: 빨강 판`);
    else if (Math.max(...runs.map((x) => x.secs)) > C.CORE_MAX_SEC) bad.push(`${n}: ${Math.max(...runs.map((x) => x.secs))}초`);
  }
  return bad;
}
function compare(ymlText, T) {
  const L = lists(ymlText);
  if (!L) return { L: null, miss: [], extra: [], dup: [] };
  const flat = L.flatMap((x) => x.list), seen = new Set(), dup = [];
  for (const n of flat) { if (seen.has(n)) dup.push(n); seen.add(n); }
  const core = coreOf(T);
  return { L, miss: core.filter((n) => !seen.has(n)), extra: [...seen].filter((n) => !core.includes(n)), dup };
}

console.log('\n=== CI core 목록 = 분류표 (T1350) ===');
const Y = fs.readFileSync(YML, 'utf8');
const T = JSON.parse(fs.readFileSync(TABLE, 'utf8'));
const R = compare(Y, T);
const tests = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => /^test-.*\.js$/.test(f));
const core = coreOf(T);
ok(!!R.L && R.L.length >= 2, '① [전제] yml 에 core 블록(표지 사이)이 있고 잡이 둘 이상이다', R.L ? `잡 ${R.L.length}개` : '표지 없음');
ok(core.length >= 50, '① [전제] 분류표 core 가 실제로 여럿이다(0 이면 아래가 자명 통과다)', `${core.length}종 · 표 ${Object.keys(T.rows).length}줄`);
ok(R.miss.length === 0, '★★② 표의 core 가 yml 에 다 있다(빠짐 0)', R.miss.join(' ') || `${core.length}/${core.length}`);
ok(R.extra.length === 0, '★★② yml 에 표 밖 이름 0(손으로 더한 줄 0)', R.extra.join(' ') || '0');
ok(R.dup.length === 0, '★② 한 하네스는 한 잡에만(겹침 0)', R.dup.join(' ') || '0');
const rb = ruleBreak(T);
ok(rb.length === 0, '★③ 표의 core 줄은 올림 규칙을 지킨다(가 · 나 · 다섯 판 다 초록 · 가장 긴 판 60초 이하)', rb.slice(0, 4).join(' | ') || `${core.length}/${core.length}`);
if (R.L) {
  const sums = R.L.map((x) => x.list.reduce((a, n) => a + ((T.rows[n] && T.rows[n].maxSec) || 0), 0));
  ok(sums.every((s) => s <= SHARD_BUDGET), `③ 잡마다 하네스 합 초 ≤ ${SHARD_BUDGET}(가장 긴 판 기준 · 설치 약 2분을 더해 10분 창)`, sums.map((s) => Math.round(s)).join(' · '));
}
console.log('\n⑤ 서버 잡(차례로 · T1367)');
const RS = compareSrv(Y, T), srv = srvOf(T);
ok(!!RS.L && srv.length >= 10, '⑤ [전제] yml 에 서버 잡 블록(표지 사이)이 있고 표의 srv 가 실제로 여럿이다(0 이면 아래가 자명 통과다)', RS.L ? `yml ${RS.L.length}종 · 표 ${srv.length}종` : '표지 없음');
ok(RS.miss.length === 0 && RS.extra.length === 0 && RS.dup.length === 0, '★★⑤ 서버 잡 목록 = 표의 srv 줄(빠짐 · 더함 · 겹침 0)', [RS.miss.length ? '빠짐 ' + RS.miss.join(' ') : '', RS.extra.length ? '더함 ' + RS.extra.join(' ') : '', RS.dup.length ? '겹침 ' + RS.dup.join(' ') : ''].filter(Boolean).join(' · ') || `${srv.length}/${srv.length}`);
const sb = srvBreak(T);
ok(sb.length === 0, '★⑤ 표의 srv 줄은 올림 규칙을 지킨다(다 · core 밖 · 다섯 판 다 초록 · 가장 긴 판 60초 이하)', sb.slice(0, 4).join(' | ') || `${srv.length}/${srv.length}`);
{ const J = srvJobs(Y) || [], sums = J.map((x) => x.list.reduce((a, n) => a + ((T.rows[n] && T.rows[n].maxSec) || 0), 0));
  ok(J.length >= 1 && sums.every((v) => v <= SRV_BUDGET), `⑤ 서버 잡마다 하네스 합 초 ≤ ${SRV_BUDGET}(잡 안은 차례로 · 가장 긴 판 기준)`, `잡 ${J.length} · ${sums.map((v) => Math.round(v)).join(' · ')}`); }
{ const missing = tests.filter((f) => !T.rows[f]);
  console.log(`    (참고 · 판정 밖) 분류표에 아직 없는 하네스 ${missing.length}개${missing.length ? ' — ' + missing.slice(0, 6).join(' ') + ' · `node scripts/ci-class.js --static` 뒤 `--measure --only …`' : ''}`); }

console.log('\n④ 미끼 — 한 자리만 바꾼 사본 셋');
if (R.L && core.length) {
  //   ⓐ 목록 한 줄 뺌 — core 첫 이름이 선 줄 하나를 지운다(그 줄이 정확히 하나인지 센다)
  const victim = core[0], lineRe = new RegExp(`^\\s+${victim.replace(/[.]/g, '\\.')}\\s*$`, 'm');
  const hits = (Y.match(new RegExp(lineRe.source, 'gm')) || []).length;
  const Ya = Y.replace(lineRe, '').replace(/\n\n/, '\n');
  const ra = compare(Ya, T);
  ok(hits === 1 && ra.miss.length === 1 && ra.miss[0] === victim && ra.extra.length === 0 && ra.dup.length === 0,
    '★④ⓐ [미끼] 목록 한 줄 뺀 yml 사본 — ② "빠짐 0" 이 그 이름 하나로 빨강', `바꾼 자리 ${hits} · 빠짐 ${ra.miss.join(' ')}`);
  //   ⓑ 같은 이름을 다른 잡 목록에 한 번 더 — 겹침
  const otherShard = R.L.find((x) => !x.list.includes(victim));
  let Yb = Y, nb = 0;
  if (otherShard) { const anchor = new RegExp(`(^\\s+${otherShard.list[0].replace(/[.]/g, '\\.')}\\s*$)`, 'm'); nb = (Y.match(new RegExp(anchor.source, 'gm')) || []).length;
    Yb = Y.replace(anchor, (m) => `${m}\n${m.replace(otherShard.list[0], victim)}`); }
  const rbb = compare(Yb, T);
  ok(nb === 1 && rbb.dup.length === 1 && rbb.dup[0] === victim && rbb.miss.length === 0,
    '★④ⓑ [미끼] 같은 이름을 다른 잡에 한 번 더 — ② "겹침 0" 이 그 이름으로 빨강', `바꾼 자리 ${nb} · 겹침 ${rbb.dup.join(' ')}`);
  //   ⓒ 표 사본 — core 줄 하나의 셋째 판을 빨강으로
  const Tc = JSON.parse(JSON.stringify(T)); const rr = Tc.rows[victim]; const before = (rr.runs || []).filter((x) => !x.green).length;
  rr.runs[2].green = false;
  const nc = JSON.stringify(Tc.rows).split('"green":false').length - JSON.stringify(T.rows).split('"green":false').length;   // 바꾼 자리(빨강 판이 는 수)
  const rc = ruleBreak(Tc);
  ok(before === 0 && nc === 1 && rc.length === 1 && rc[0].startsWith(victim), '★④ⓒ [미끼] 표 사본의 core 줄 하나를 한 판 빨강 — ③ 올림 규칙이 그 줄로 빨강', `바꾼 자리 ${nc} · ${rc.join(' | ')}`);
}

if (RS.L && srv.length) {
  //   ⓓ 서버 목록 한 줄 뺌 — srv 첫 이름이 선 줄 하나(서버 블록 안에서 센다)
  const v2 = srv[0], a = Y.indexOf(C.MARK_SA), b = Y.indexOf(C.MARK_SB), blk = Y.slice(a, b);
  const re = new RegExp(`^\\s+${v2.replace(/[.]/g, '\\.')}\\s*$\\n`, 'm');
  const hits = (blk.match(new RegExp(re.source, 'gm')) || []).length;
  const Yd = Y.slice(0, a) + blk.replace(re, '') + Y.slice(b);
  const rd = compareSrv(Yd, T), rcore = compare(Yd, T);
  ok(hits === 1 && rd.miss.length === 1 && rd.miss[0] === v2 && rd.extra.length === 0 && rcore.miss.length === 0,
    '★④ⓓ [미끼] 서버 목록 한 줄 뺀 yml 사본 — ⑤ "빠짐 0" 이 그 이름 하나로 빨강(core 비교는 그대로)', `바꾼 자리 ${hits} · 빠짐 ${rd.miss.join(' ')}`);
  //   ⓔ 표 사본 — srv 줄 하나의 넷째 판을 빨강으로
  const Te = JSON.parse(JSON.stringify(T)); Te.rows[v2].runs[3].green = false;
  const ne = JSON.stringify(Te.rows).split('"green":false').length - JSON.stringify(T.rows).split('"green":false').length;
  const re2 = srvBreak(Te);
  ok(ne === 1 && re2.length === 1 && re2[0].startsWith(v2), '★④ⓔ [미끼] 표 사본의 srv 줄 하나를 한 판 빨강 — ⑤ 올림 규칙이 그 줄로 빨강', `바꾼 자리 ${ne} · ${re2.join(' | ')}`);
}

console.log(`\n=== test-ci-list 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
