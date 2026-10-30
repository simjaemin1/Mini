#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t941-ruler.js — 판 자(t577) 아이 env 의 T696_WAL 기본 · T941 손잡이 끔 기본(T941 · 2026-10-26) ==================
//
// 판정 사본 0: 진짜 `t577-server-run.js` 를 돌리되 아이 존만 바꿔 친다 — 프리로드(`-r` 이 파일 자신)가 `child_process.spawn` 을 감싸
//   아이를 "받은 env 를 적고 `zone server up on` 한 줄 찍고 끝나는" node 한 줄로 바꾼다(세계 0 · 몇 초). 판 자가 아이에게 **실제로 준** env 를 본다.
//   지키는 것:
//     ① 가상 시계 판(`T745_VCLOCK=1`) — 아이 `T696_WAL=0`(WAL 일꾼 끔 — 값 무변 · 디스크 · 보고/T941 §1)
//     ② 부르는 쪽이 준 값이 먼저 — `T696_WAL=1` 이면 1
//     ③ 벽시계 판 — 아이 env 에 `T696_WAL` 을 안 싣는다(종전 그대로)
//     ④ `T941_BATTLE_DAY` — 제품 손잡이는 `=== '1'` 하나(끔 기본 · 끔 = main 바이트) · ★[T959] 판 자는 아이에게 `1` 을 기본으로 싣는다(부르는 값 먼저 · 되돌림 `=0`)
//     ⑤ 미끼 — KID_WAL 줄을 뺀 판 자 사본은 ① 에서 T696_WAL 을 안 싣는다(① 이 문다) · ★[T959] T941 줄을 뺀 사본은 ④ 에서 기본을 안 싣는다
//     ⑥ ★[T990] `T990_ECON_DAY` — 판 자는 아이에게 `1` 을 기본으로 싣는다(벽시계 · 가상 시계 판 둘 다 · 부르는 값 먼저 · 되돌림 `=0`) ·
//        제품 손잡이는 `=== '1'` 하나(zone · 끔 기본 = main 바이트) · 미끼: T990 줄을 뺀 사본은 기본을 안 싣는다
'use strict';
// ── 프리로드 갈래(아이 바꿔 치기) ──
if (process.env.T941_CAPTURE && require.main !== module) {
  const cp = require('child_process'); const real = cp.spawn;
  cp.spawn = function (cmd, args, opts) {
    const code = "require('fs').writeFileSync(process.env.T941_CAPTURE, JSON.stringify({ T696_WAL: process.env.T696_WAL == null ? null : process.env.T696_WAL, T941_BATTLE_DAY: process.env.T941_BATTLE_DAY == null ? null : process.env.T941_BATTLE_DAY, T990_ECON_DAY: process.env.T990_ECON_DAY == null ? null : process.env.T990_ECON_DAY, T745_VCLOCK: process.env.T745_VCLOCK || null })); console.log('zone server up on 0');";
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't941r-'));
function kidEnv(env, script) {
  const cap = path.join(TMP, 'cap.json'); fs.rmSync(cap, { force: true });
  const E = Object.assign({}, process.env, { T941_CAPTURE: cap, T577_DIR: path.join(TMP, 'runs'), T577_PAR: '1' }, env);
  for (const k of ['T745_VCLOCK', 'T696_WAL', 'T941_BATTLE_DAY', 'T990_ECON_DAY']) if (!(k in env)) delete E[k];
  delete E.NODE_OPTIONS;
  spawnSync(process.execPath, ['-r', __filename, script || RULER, '1', '7'], { env: E, encoding: 'utf8', timeout: 60000 });
  try { return JSON.parse(fs.readFileSync(cap, 'utf8')); } catch (e) { return null; }
}

console.log('\n=== 판 자(t577) 아이 env — T696_WAL 기본 · T941 손잡이(T941) ===');
let k = kidEnv({ T745_VCLOCK: '1' });
ok(k && k.T745_VCLOCK === '1' && k.T696_WAL === '0', '★① 가상 시계 판 → 아이 T696_WAL=0(WAL 일꾼 끔 — 값 무변 · 디스크)', JSON.stringify(k));
k = kidEnv({ T745_VCLOCK: '1', T696_WAL: '1' });
ok(k && k.T696_WAL === '1', '② 부르는 쪽이 준 T696_WAL=1 이 먼저', JSON.stringify(k));
k = kidEnv({});
ok(k && k.T696_WAL === null && k.T745_VCLOCK === null, '③ 벽시계 판 → T696_WAL 을 안 싣는다(종전)', JSON.stringify(k));
k = kidEnv({ T745_VCLOCK: '1', T941_BATTLE_DAY: '0' });
ok(k && k.T941_BATTLE_DAY === '0', '④-a [T959] 부르는 쪽이 준 T941_BATTLE_DAY=0(되돌림 — T959 전 판 자)이 먼저', JSON.stringify(k));
k = kidEnv({ T745_VCLOCK: '1' });
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(k && k.T941_BATTLE_DAY === '1' && kidEnv({}).T941_BATTLE_DAY === '1' && /const T941_BATTLE_DAY = process\.env\.T941_BATTLE_DAY === '1';/.test(V)
  && /function _t681Quota\(\) \{ const WL = state\.warLive; return Math\.max\(1, Math\.round\(\(state\.dayMs \|\| 0\) \* \(\(WL && WL\.TICK_HZ\) \|\| 30\) \/ 1000\)\); \}/.test(V),
  '★④-b [T959] 판 자 기본은 T941 켬(가상 시계 · 벽시계 판 둘 다 아이에 `1`) · 제품 손잡이 `=== \'1\'` 하나(제품 기본 끔) · 판 몫 식(`_t681Quota`) 글자 그대로');
const src = fs.readFileSync(RULER, 'utf8'); const bait = src.split('\n').filter((l) => !/KID_WAL != null \? \{ T696_WAL/.test(l)).join('\n');
const BAIT = path.join(ROOT, 'scripts', '.t941-bait.js'); fs.writeFileSync(BAIT, bait);
k = kidEnv({ T745_VCLOCK: '1' }, BAIT); fs.rmSync(BAIT, { force: true });
ok(bait !== src && k && k.T696_WAL === null, '[미끼] KID_WAL 줄을 뺀 판 자는 가상 시계 판에도 T696_WAL 을 안 싣는다 — ① 이 문다', JSON.stringify(k));
const bait2 = src.split('\n').filter((l) => !/T941_BATTLE_DAY: KID_BATTLE/.test(l)).join('\n');
fs.writeFileSync(BAIT, bait2); k = kidEnv({ T745_VCLOCK: '1' }, BAIT); fs.rmSync(BAIT, { force: true });
ok(bait2 !== src && k && k.T941_BATTLE_DAY === null, '[미끼 · T959] T941 줄을 뺀 판 자는 기본을 안 싣는다 — ④-b 가 문다', JSON.stringify(k));
{
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'), Rd = fs.readFileSync(path.join(ROOT, 'server', 'roads.js'), 'utf8');
  const a = kidEnv({ T745_VCLOCK: '1' }), b = kidEnv({}), c = kidEnv({ T990_ECON_DAY: '0' });
  ok(a && b && c && a.T990_ECON_DAY === '1' && b.T990_ECON_DAY === '1' && c.T990_ECON_DAY === '0'
    && /if \(process\.env\.T990_ECON_DAY === '1' && Roads\.setEconDay\) Roads\.setEconDay\(/.test(Z)
    && /const day = _t990Day \? S\.lastDay : Math\.floor\(\(now - S\.epoch\) \/ S\.dayMs\);/.test(Rd)
    && /dayRoads: process\.env\.T990_ECON_DAY === '1' \? \(\) => Roads\.dayTick\(\) : null,/.test(Z)
    && (fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8').match(/if \(state\.deps\.dayRoads\) add/g) || []).length === 2
    && /const _npcOreNow = \(\) => \{ if \(process\.env\.T990_ECON_DAY === '1'\)/.test(Z) && (Z.match(/= _npcOreNow\(\)/g) || []).length === 2
    && /if \(process\.env\.T990_ECON_DAY === '1'\) return;   \/\/ ★\[T990\] 켬 — 장부 시각이 econ 날이다/.test(Z),
    '★⑥ [T990] 판 자 기본 T990_ECON_DAY=1(가상 시계 · 벽시계 판 둘 다) · 부르는 값 먼저(`=0` 되돌림) · 제품 손잡이 `=== \'1\'` 하나(zone) · 길의 하루는 하루 마감 두 자리(`dayRoads` — 날을 올린 econ 머리 바로 뒤 · 틱은 묶음만) · NPC 광맥 시각 두 자리 = econ 날(15분 정리 쉼)', JSON.stringify([a && a.T990_ECON_DAY, b && b.T990_ECON_DAY, c && c.T990_ECON_DAY]));
  const bait3 = src.split('\n').filter((l) => !/T990_ECON_DAY: KID_ECON/.test(l)).join('\n');
  fs.writeFileSync(BAIT, bait3); const k3 = kidEnv({ T745_VCLOCK: '1' }, BAIT); fs.rmSync(BAIT, { force: true });
  ok(bait3 !== src && k3 && k3.T990_ECON_DAY === null, '[미끼 · T990] T990 줄을 뺀 판 자는 기본을 안 싣는다 — ⑥ 이 문다', JSON.stringify(k3));
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
