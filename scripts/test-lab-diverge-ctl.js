#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-lab-diverge-ctl.js — 랩 쪽 갈림 대조 자(`scripts/lab-diverge-ctl.js`)가 자로 서는지 [T944] =====================
//
// ★왜 [T932 회부 1 → T944] 랩 판엔 습격이 없어 T837 띠(`raid:n`)를 못 세웠다. 랩 자는 "n 번째로 사냥이 선 마을의 첫 사냥 하나만 빈손"으로 판을 가른다.
//   그 자가 자로 서려면 셋이 다 참이어야 한다 — ⓐ 끔(env 없음)은 문을 안 심는다 ⓑ 문만 심은 판(hunt:0)은 끔 판과 바이트 같다(문이 세계에 0)
//   ⓒ hunt:1 · 2 · 3 은 **서로 다른 사건**을 비킨다(마을이 다르다 — 같은 마을 사냥꾼 셋을 세면 셋이 같은 판이 된다 · T944 첫 시험)
//   ⓓ ★자명 통과 금지 — 비킨 판은 끔 판과 실제로 갈린다(판 JSON 이 다르다 · 비킨 사건 몫 > 0).
//
// 재는 것(랩 자 t17-metrics · 시드 1020 · 30날 · 판마다 씨 캐시 하나 · 존 안 띄움):
//   ① 끔 판에 관찰 파일이 안 선다(문 0) · hunt:0 판은 끔 판과 판 JSON 바이트 같다 · 그 판의 비킨 사건 0
//   ② hunt:1 · 2 · 3 — 각각 사건 하나 · 첫날 · 마을 셋이 서로 다르다 · 몫 > 0 · 판 JSON 셋이 서로 다르고 끔 판과도 다르다
//   ③ 프리로드는 랩 자가 아닌 프로세스에선 아무것도 안 한다(이 하네스 자신 · `huntIncomeFn` 안 심김)
//
// 실행: node scripts/test-lab-diverge-ctl.js   (존 안 띄움 · 1 ~ 2분)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't944-ldctl-'));
const DAYS = '30', SEED = '1020';
function run(tag, skip) {
  const env = Object.assign({}, process.env);
  for (const k of ['LDCTL_SKIP', 'LDCTL_OUT', 'T17_JSON', 'T176_JSON', 'LAB_SEEDCACHE', 'NODE_OPTIONS', 'T875_OUT']) delete env[k];
  Object.assign(env, { T17_JSON: path.join(TMP, `${tag}.json`), LAB_SEEDCACHE: path.join(TMP, `${tag}.seedcache.json`), NODE_OPTIONS: `--require ${path.join(__dirname, 'lab-diverge-ctl.js')}` });
  if (skip != null) env.LDCTL_SKIP = skip;
  if (env.T1047_LAB_DIST == null) env.T1047_LAB_DIST = '0';   // ★[PM land1036] T1047 랩 지형 거리 켬 판에선 시드 1020 30 · 60날 모두 비킨 판 하나가 끔 판과 바이트 같다(그 사냥 몫이 세계로 안 번짐) — 이 하네스는 자(문 · 사건 고르기)를 쥐므로 종전 직선 세계로 묶는다 · 켬 세계의 자는 T1058
  execFileSync(process.execPath, [path.join(__dirname, 't17-metrics.js'), DAYS, SEED], { cwd: ROOT, env, stdio: 'ignore', timeout: 600000 });
  const J = fs.readFileSync(path.join(TMP, `${tag}.json`));
  const lf = path.join(TMP, `${tag}.ldctl.json`);
  return { J, L: fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, 'utf8')) : null };
}
try {
  console.log('① 끔 · 문만');
  const off = run('off', null), h0 = run('h0', 'hunt:0');
  ok(off.L === null, '끔(env 없음) 판엔 관찰 파일이 안 선다 — 문을 안 심는다');
  ok(h0.L && h0.L.hooked === 1 && h0.L.skipped.length === 0, 'hunt:0 — 문은 심겼고 비킨 사건은 0', h0.L ? `hooked ${h0.L.hooked} · seen ${h0.L.seen} · 마을 ${h0.L.villages}` : 'none');
  ok(h0.L && h0.L.seen > 0 && h0.L.villages > 3, '전제 — 랩 판에 몫 > 0 사냥이 선다(사냥이 선 마을 넷 이상)', h0.L ? `${h0.L.seen} · ${h0.L.villages}` : '');
  ok(off.J.equals(h0.J), 'hunt:0 판 JSON = 끔 판 JSON(바이트) — 문이 세계에 0', `${off.J.length}B`);
  console.log('② hunt:1 · 2 · 3 — 서로 다른 사건 하나씩');
  const H = [1, 2, 3].map((n) => run(`h${n}`, `hunt:${n}`));
  const sk = H.map((h) => (h.L && h.L.skipped.length === 1) ? h.L.skipped[0] : null);
  ok(sk.every((x) => x), '셋 다 사건 하나씩 비켰다', JSON.stringify(sk));
  ok(sk.every((x) => x && x[0] === 1), '셋 다 첫날 사건이다(사냥이 선 마을 차례 1 · 2 · 3)', sk.map((x) => x && x[0]).join(','));
  ok(sk.every((x) => x) && new Set(sk.map((x) => x[1])).size === 3, '셋의 마을이 서로 다르다(같은 마을 사냥꾼 셋이면 같은 판이 된다)', sk.map((x) => x && x[1]).join(' · '));
  ok(sk.every((x) => x && x[3] > 0), '비킨 몫이 다 0 보다 크다', sk.map((x) => x && x[3]).join(' · '));
  ok(H.every((h) => !h.J.equals(off.J)), '★자명 통과 금지 — 비킨 판 셋 다 끔 판과 판 JSON 이 다르다(세계가 실제로 갈린다)');
  ok(!H[0].J.equals(H[1].J) && !H[0].J.equals(H[2].J) && !H[1].J.equals(H[2].J), '비킨 판 셋이 서로 다르다(띠의 판 넷이 다 다른 세계)');
  console.log('③ 랩 자 밖');
  const before = typeof require(path.join(ROOT, 'sim', 'economy-sim-v2')).createWorldV2;
  process.env.LDCTL_SKIP = 'hunt:1';   // env 가 있어도 — 랩 자 프로세스가 아니면 안 심는다(가르는 것은 argv[1])
  require(path.join(__dirname, 'lab-diverge-ctl.js'));
  delete process.env.LDCTL_SKIP;
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const w = V2.createWorldV2({ seed: 1, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  ok(before === 'function' && !w.huntIncomeFn, '이 하네스(랩 자 아님)에선 프리로드가 문을 안 심는다', typeof w.huntIncomeFn);
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
