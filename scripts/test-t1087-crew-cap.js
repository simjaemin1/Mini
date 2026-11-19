#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 1   ← [T1375] 미끼 판정 줄에 바꾼 자리 수(이미 있던 자리 셈을 그 줄로 옮김 · lint ⑲b)
// === scripts/test-t1087-crew-cap.js — 판 자(t577) 가시 몸 상한 기본 = 집 크루 몫(T1087 · 2026-11-02) ==================
//
// ★왜 [T1055 1위 → T1087] 집 크루는 명부(가시 몸) 앞 `min(LIFE_CREW, 몸 수)` 명이다(`server/villages.js` `_t400Crew`).
//   판 자가 아이에게 `VILLAGE_NPC_CAP=1` 을 주면 마을마다 몸이 1 이라 크루가 1 로 묶인다(한 채 3날 ↔ 랩 · 운영 2날).
//   운영 기본은 몸 상한 무제한(`NPC_CAP_PER_VILLAGE` Infinity)이라 크루가 `LIFE_CREW` 다 — 판 자만의 왜곡.
//   고침: 집 행위가 선 판이면 판 자 몸 상한 기본 = `LIFE_CREW`(서버 정본 · `__labProbe._t400Probe.LIFE_CREW` — 랩 자가 크루에 주는 그 수).
//
// 판정 사본 0: 진짜 `t577-server-run.js` 를 돌리되 아이 존만 바꿔 친다(T941 하네스 꼴) — 프리로드(`-r` 이 파일 자신)가 `child_process.spawn` 을 감싸
//   아이를 "받은 env 를 적고 끝나는" node 한 줄로 바꾼다(세계 0 · 몇 초). 판 자가 아이에게 **실제로 준** env 를 본다.
//   지키는 것:
//     ① 집 행위 켬 판(제품 기본) — 아이 `VILLAGE_NPC_CAP` = 서버 정본 `LIFE_CREW`(probe) = `villages.js` 상수 글자
//     ② 집 행위 끔 판(서버 기준선 자 `T400_BUILD_ACT=0`) — 아이 `VILLAGE_NPC_CAP=1`(종전 그대로)
//     ③ 부르는 쪽이 준 값이 먼저 — `=1` 이면 1(되돌림) · `=Infinity` 면 아이 env 에서 뺀다(운영 기본 · T864)
//     ④ 미끼 — KID_CAP 을 종전 글자(`process.env.VILLAGE_NPC_CAP || '1'`)로 되돌린 판 자 사본은 ① 에서 1 을 준다(① 이 문다)
//     ⑤ 크루 규칙은 그대로 — `_t400Crew` 가 명부 `npcPids` 앞에서 `LIFE_CREW` 명까지 뽑는다(몸 상한이 크루를 묶는 줄)
//
// 실행: node scripts/test-t1087-crew-cap.js   (존 안 띄움 · 몇 초)
'use strict';
// ── 프리로드 갈래(아이 바꿔 치기) ──
if (process.env.T1087_CAPTURE && require.main !== module) {
  const cp = require('child_process'); const real = cp.spawn;
  cp.spawn = function (cmd, args, opts) {
    const code = "require('fs').writeFileSync(process.env.T1087_CAPTURE, JSON.stringify({ has: 'VILLAGE_NPC_CAP' in process.env, cap: process.env.VILLAGE_NPC_CAP == null ? null : process.env.VILLAGE_NPC_CAP })); console.log('zone server up on 0'); process.exit(0);";
    return real.call(this, process.execPath, ['-e', code], opts);
  };
  return;
}
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const RULER = path.join(ROOT, 'scripts', 't577-server-run.js');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1087-'));
function kidEnv(env, script) {
  const cap = path.join(TMP, 'cap.json'); fs.rmSync(cap, { force: true });
  const E = Object.assign({}, process.env, { T1087_CAPTURE: cap, T577_DIR: path.join(TMP, 'runs'), T577_PAR: '1' }, env);
  for (const k of ['VILLAGE_NPC_CAP', 'T400_BUILD_ACT']) if (!(k in env)) delete E[k];
  delete E.NODE_OPTIONS;
  spawnSync(process.execPath, ['-r', __filename, script || RULER, '1', '7'], { env: E, encoding: 'utf8', timeout: 60000 });
  try { return JSON.parse(fs.readFileSync(cap, 'utf8')); } catch (e) { return null; }
}
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const m = VSRC.match(/^const LIFE_CREW = (\d+);/m);
const CREW_SRC = m ? m[1] : null;
const CREW_PROBE = String(require(path.join(ROOT, 'server', 'villages')).__labProbe._t400Probe.LIFE_CREW);

console.log('\n=== T1087 — 판 자 몸 상한 기본 = 집 크루 몫(LIFE_CREW) ===');
ok(CREW_SRC != null && CREW_PROBE === CREW_SRC, '정본 `LIFE_CREW` — probe 값 = villages.js 상수 글자', `${CREW_PROBE} · ${CREW_SRC}`);
const on = kidEnv({});
ok(on && on.cap === CREW_PROBE, '① 집 행위 켬 판 — 아이 `VILLAGE_NPC_CAP` = LIFE_CREW', JSON.stringify(on));
const off = kidEnv({ T400_BUILD_ACT: '0' });
ok(off && off.cap === '1', '② 집 행위 끔 판(서버 기준선 자) — 아이 `VILLAGE_NPC_CAP=1`(종전)', JSON.stringify(off));
const one = kidEnv({ VILLAGE_NPC_CAP: '1' });
ok(one && one.cap === '1', '③ 부르는 쪽이 먼저 — `=1` 이면 1(되돌림)', JSON.stringify(one));
const inf = kidEnv({ VILLAGE_NPC_CAP: 'Infinity' });
ok(inf && inf.has === false, '③ `=Infinity` 면 아이 env 에서 뺀다(운영 기본 무제한 · T864)', JSON.stringify(inf));
{
  const src = fs.readFileSync(RULER, 'utf8');
  const a = 'VILLAGE_NPC_CAP: KID_CAP,';
  ok(src.split(a).length === 2, '판 자 아이 env 의 몸 상한은 `KID_CAP` 한 자리');
  const bait = path.join(path.dirname(RULER), `._t1087-bait-${process.pid}.js`);
  fs.writeFileSync(bait, src.replace(a, "VILLAGE_NPC_CAP: process.env.VILLAGE_NPC_CAP || '1',"));
  let b = null; try { b = kidEnv({}, bait); } finally { fs.rmSync(bait, { force: true }); }
  const na = src.split(a).length - 1;   // [T1375] 바꾼 자리 — 위 단언이 세던 그 셈
  ok(na === 1 && b && b.cap === '1' && b.cap !== CREW_PROBE, '④ 미끼 — 종전 글자로 되돌린 판 자 사본은 집 행위 켬 판에도 1 을 준다(① 이 문다)', `바꾼 자리 ${na} · ${JSON.stringify(b)}`);
}
ok(/function _t400Crew\(vil\) \{[^\n]*\n[^\n]*\n\s*for \(const pid of \(vil\.npcPids \|\| \[\]\)\) \{ if \(out\.length >= LIFE_CREW\) break;/.test(VSRC),
  '⑤ 크루 규칙 그대로 — `_t400Crew` 는 명부 `npcPids` 앞에서 LIFE_CREW 명까지(몸 수가 크루를 묶는 줄)');
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
