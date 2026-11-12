#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1240-kill-once.js — T1240: 한 짐승은 한 번만 잡힌다(손잡이 `T1240_KILL_ONCE` · 켬 기본 · `=0` 되돌림) ======
//   판 몸통은 T1237 의 재현 판 `scripts/t1237-same-tick-kill.js` 그대로(사본 0) — 존을 임시 DB · 임시 포트로 띄우고 사슴 DB 몹(hp 5)에
//   ⓐ 한 틱 안 두 사람이 차례로 한 번씩 · ⓑ 대조 — 둘 사이에 틱 셋. 아이 판 둘(켬 · 끔)의 JSON 한 줄을 읽는다.
//   ① 끔(`=0`) — 결함 재현: 한 틱 안 = 주검 둘 · 사냥꾼 둘 · 알림 둘(고치기 전 빨강이 여기서 선다 — 자명 통과 금지)
//   ② 켬(기본) — 한 틱 안 = 주검 하나 · 사냥꾼 하나 · 알림 하나
//   ③ 대조 — 틱 셋 사이는 켬 · 끔 다 주검 하나(종전 길 무변)
//   ④ 글자 — 술어 하나(`mobLive` = `mobs.has` ∧ hp > 0) · 짐승을 고르는 세 길(사람 공격 · 화살 · NPC 싸움)이 그것을 부른다 · 손잡이 읽는 자리 하나
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const run = (env) => {
  const e = Object.assign({}, process.env, env); delete e.NODE_OPTIONS;
  if (env.T1240_KILL_ONCE == null) delete e.T1240_KILL_ONCE;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't1237-same-tick-kill.js')], { cwd: ROOT, env: e, encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  const line = String(r.stdout || '').split('\n').filter((l) => l.startsWith('{')).pop();
  try { return JSON.parse(line); } catch (err) { return { err: String(r.stderr || '').slice(-400) || 'JSON 없음' }; }
};
console.log('\n=== T1240 한 짐승 한 번 잡기 ===');
const off = run({ T1240_KILL_ONCE: '0' });
const on = run({});
ok(!off.err && off.sameTick && off.sameTick.corpses === 2 && off.sameTick.killers.length === 2 && off.sameTick.notes.length === 2,
  '① 끔(`=0`) — 결함 재현: 한 틱 안 두 사람 = 주검 둘 · 사냥꾼 둘 · 알림 둘(자명 통과 금지 — 고칠 것이 실제로 있다)', off.sameTick || off.err);
ok(!on.err && on.sameTick && on.sameTick.corpses === 1 && on.sameTick.killers.length === 1 && on.sameTick.notes.length === 1 && on.sameTick.alive === false,
  '② 켬(기본) — 한 틱 안 = 주검 하나 · 사냥꾼 하나 · 알림 하나 · 짐승은 세계에서 빠졌다', on.sameTick || on.err);
ok(on.apart && off.apart && on.apart.corpses === 1 && off.apart.corpses === 1 && on.apart.killers[0] === off.apart.killers[0],
  '③ 대조 — 틱 셋 사이는 켬 · 끔 다 주검 하나 · 같은 사냥꾼(종전 길 무변)', { on: on.apart && on.apart.corpses, off: off.apart && off.apart.corpses });
const S = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
ok(/function mobLive\(m\) \{ return !!m && mobs\.has\(m\.mid\) && m\.hp > 0; \}/.test(S) && (S.match(/function mobLive\(/g) || []).length === 1,
  '④ 술어 하나 — `mobLive` = 세계에 있고(`mobs.has`) 살아 있다(hp > 0)');
const ta = S.slice(S.indexOf('async function tryAttack('), S.indexOf('// 근처 mob 없으면 근처 플레이어'));
const ar = S.slice(S.indexOf('function stepArrows('), S.indexOf('function stepArrows(') + 4000);
const nf = S.slice(S.indexOf("if (npc.behavior === 'fight') {"), S.indexOf("if (npc.behavior === 'fight') {") + 600);
ok(/if \(T1240_KILL_ONCE && !mobLive\(m\)\) continue;/.test(ta) && /if \(T1240_KILL_ONCE && !mobLive\(m\)\) continue;/.test(ar) && /T1240_KILL_ONCE \? !mobLive\(target\) : target\.hp <= 0/.test(nf),
  '④ 짐승을 고르는 세 길(사람 공격 · 화살 · NPC 싸움)이 같은 술어를 부른다');
ok((S.match(/process\.env\.T1240_KILL_ONCE/g) || []).length === 1 && /const T1240_KILL_ONCE = process\.env\.T1240_KILL_ONCE !== '0';/.test(S),
  "④ 손잡이 읽는 자리 하나 · `=0` 만 끔(켬 기본)");
//   자명 통과 금지 — 사람 공격 길에서 술어를 뺀 사본은 ④ 의 세 길 검사가 문다
const bad = ta.replace(/if \(T1240_KILL_ONCE && !mobLive\(m\)\) continue;/, '');
ok(!/if \(T1240_KILL_ONCE && !mobLive\(m\)\) continue;/.test(bad), '④ [자명 통과 금지] 사람 공격 길의 술어를 걷은 사본은 세 길 검사에서 빠진다(검사가 실제로 문다)');
console.log(`\n=== T1240 한 짐승 한 번 잡기: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
