#!/usr/bin/env node
// @regress
// @harness-only
// === scripts/test-ci-list.js — CI core 목록 = 분류표 (T1350 · 재민 11-17 "CI 체크 표시를 믿을 수 있게") =======================================
//
// ★무엇: `.github/workflows/regress-unit.yml` 의 core 잡 목록(표지 사이 블록 — `ci-class.js --write-yml` 이 쓴다)이 분류표(`scripts/ci-class.json`)의
//   core 줄과 **정확히 같은지**(빠짐 · 더함 · 겹침 0), 표의 core 줄이 올림 규칙(가 · 나 · 다섯 판 다 초록 · 가장 긴 판 60초 이하)을 지키는지,
//   잡마다 합 초가 10분 창 안인지 본다. 손으로 목록을 고치거나 표를 안 고치고 yml 만 고치면 여기서 빨강이다.
// ★미끼(이 파일 안): ⓐ yml 사본에서 목록 한 줄을 뺀다 ⓑ 같은 이름을 다른 잡에 한 번 더 ⓒ 표 사본의 core 줄 하나를 한 판 빨강으로 —
//   셋 다 정확히 한 자리만 바꿨는지 세고, 어느 단언이 빨강이 되는지 단언한다.
// ★제품 부름 0(`@harness-only` — 옛 코드 빨강 단계 건너뜀 · `test-harness-lint` ⑲ 가 확인).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require('./ci-class.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const YML = path.join(ROOT, '.github', 'workflows', 'regress-unit.yml');
const TABLE = path.join(ROOT, 'scripts', 'ci-class.json');
const SHARD_BUDGET = 420;   // 잡 하나의 하네스 합 초(설치 · npm ci 약 2분을 더해 10분 창 안) — 판정 자리의 수는 이 하나

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
  const rc = ruleBreak(Tc);
  ok(before === 0 && rc.length === 1 && rc[0].startsWith(victim), '★④ⓒ [미끼] 표 사본의 core 줄 하나를 한 판 빨강 — ③ 올림 규칙이 그 줄로 빨강', rc.join(' | '));
}

console.log(`\n=== test-ci-list 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
