#!/usr/bin/env node
// === scripts/perf-pair.js — 성능 하네스 **기준선 짝 비교** (계측기) ==============
//
// ★★[재민 확정 2026-08-31] *"ms 는 기계 의존 — 같은 순간 A/B 로만."*
//   성능 하네스의 절대 문턱은 **기계와 그날의 부하**를 잰다. 그래서 "이 트리가 느려졌나"는
//   같은 기계에서 **기준선 커밋과 번갈아** 재야만 답할 수 있다.
//
//   이 도구가 하는 일:
//     ① 기준선 커밋으로 워크트리를 뜬다(`/tmp/perf-base-<ref>`, node_modules 는 심볼릭 링크).
//     ② 지정한 하네스를 **base → head → base → head …** 로 번갈아 돌린다(부하 드리프트 상쇄).
//     ③ 각 판의 `WATERPERF_JSON` 한 줄을 읽어 **배율의 비율(head/base)** 중앙값을 낸다.
//     ④ 1 ± 허용치 안이면 "안 느려졌다".
//
// ⚠**계측기다. 판정 러너에 넣지 마라.** 기준선 커밋은 사람이 의도적으로 올린다
//   (`scripts/perf-baseline.json`). HEAD 가 기준선과 같으면 비교는 **자기 자신과의 비교**라
//   자명 통과다 — 그 경우 이 도구는 비교를 **거부**한다.
//
// 사용:
//   node scripts/perf-pair.js                      # 기준선 = perf-baseline.json
//   node scripts/perf-pair.js --base <ref> --n 3   # 기준선·라운드 지정
//   node scripts/perf-pair.js --tol 0.35           # 허용치(기본 0.35 = ±35%)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = parseInt(arg('--n', '3'), 10) || 3;
const TOL = parseFloat(arg('--tol', '0.35')) || 0.35;
const HARNESS = arg('--harness', 'e2e-waterperf.js');

function git(...a) { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); }

let BASE = arg('--base', null);
if (!BASE) {
  try {
    const bl = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'perf-baseline.json'), 'utf8'));
    BASE = bl[HARNESS.replace(/\.js$/, '')] || bl.default;
  } catch (e) { /* 아래에서 안내하고 죽는다 */ }
}
if (!BASE) {
  console.error('기준선 커밋이 없다 — `--base <ref>` 를 주거나 scripts/perf-baseline.json 에 적어라.');
  process.exit(2);
}

let baseSha, headSha;
try { baseSha = git('rev-parse', BASE); headSha = git('rev-parse', 'HEAD'); }
catch (e) { console.error('git 이 그 ref 를 모른다: ' + BASE); process.exit(2); }
if (baseSha === headSha) {
  console.error(`HEAD 가 기준선(${BASE.slice(0, 8)})과 **같은 커밋**이다 — 자기 자신과의 비교는 자명 통과라 거부한다.`);
  console.error('  ⇒ 기준선을 올릴 때가 됐거나(scripts/perf-baseline.json), 비교할 변경이 아직 없다.');
  process.exit(2);
}

const WT = `/tmp/perf-base-${baseSha.slice(0, 8)}`;
if (!fs.existsSync(WT)) {
  console.log(`  워크트리 생성 ${WT} ← ${baseSha.slice(0, 8)}`);
  spawnSync('git', ['worktree', 'add', '-f', '--detach', WT, baseSha], { cwd: ROOT, stdio: 'inherit' });
}
if (!fs.existsSync(path.join(WT, 'node_modules'))) {
  try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(WT, 'node_modules')); } catch (e) {}
}
// ★★**계측기는 양쪽이 같아야 한다.** 기준선 트리에도 **HEAD 의 하네스를 넣어** 돌린다 —
//   기준선 자신의 옛 하네스로 재면 "코드가 느려졌나"가 아니라 "판정식이 바뀌었나"를 재게 된다.
//   ⇒ 재는 자(하네스)는 고정, **재이는 것(서버·클라)** 만 다르다. 이게 A/B 의 정의다.
const HARNESS_SRC = path.join(ROOT, 'scripts', HARNESS);
const HARNESS_DST = path.join(WT, 'scripts', HARNESS);
try { fs.copyFileSync(HARNESS_SRC, HARNESS_DST); }
catch (e) { console.error('기준선 트리에 하네스를 못 넣었다: ' + e.message); process.exit(2); }

function runOnce(cwd, tag) {
  const r = spawnSync(process.execPath, [path.join(cwd, 'scripts', HARNESS)], {
    cwd, encoding: 'utf8', env: Object.assign({}, process.env, { SHOTS: `/tmp/perf-pair-${tag}`, ZDB: `/tmp/perf-pair-${tag}.db` }),
    maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/WATERPERF_JSON (\{.*\})/);
  if (!m) return { ok: false, out };
  try { return { ok: true, v: JSON.parse(m[1]) }; } catch (e) { return { ok: false, out }; }
}

// ★판 사이에 숨을 돌린다 — 하네스가 3010/3020 을 쓰므로 **연달아 띄우면 바인드가 겹친다**
//   (실측: 간격 0 이면 두 번째 판이 통째로 죽었다 — 계측기가 계측기를 방해한 것).
const settleGap = () => new Promise((r) => setTimeout(r, 10000));
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
(async () => {
  console.log(`\n=== 성능 짝 비교 — ${HARNESS}`);
  console.log(`    기준선 ${baseSha.slice(0, 8)} (${BASE})  vs  HEAD ${headSha.slice(0, 8)}`);
  console.log(`    ${N}쌍 · base→head 번갈아 · 허용치 ±${(TOL * 100).toFixed(0)}%\n`);
  const bs = [], hs = [];
  for (let i = 0; i < N; i++) {
    await settleGap();
    const b = runOnce(WT, `base${i}`);
    if (!b.ok) { console.error('  기준선 판 ' + (i + 1) + ' 실패 — 마지막 30줄:\n' + (b.out || '').split('\n').slice(-30).join('\n')); process.exit(2); }
    await settleGap();
    const h = runOnce(ROOT, `head${i}`);
    if (!h.ok) { console.error('  현재 트리 판 ' + (i + 1) + ' 실패 — 마지막 30줄:\n' + (h.out || '').split('\n').slice(-30).join('\n')); process.exit(2); }
    bs.push(b.v.rMed); hs.push(h.v.rMed);
    console.log(`  쌍 ${i + 1}: base 배율 ${b.v.rMed.toFixed(2)} · head 배율 ${h.v.rMed.toFixed(2)} → 비율 ${(h.v.rMed / b.v.rMed).toFixed(3)}`);
  }
  const rr = med(hs.map((h, i) => h / bs[i]));
  const okNow = rr >= 1 - TOL && rr <= 1 + TOL;
  console.log(`\n  ★비율의 비율(head/base) 중앙값 = **${rr.toFixed(3)}**  (base 중앙 ${med(bs).toFixed(2)} · head 중앙 ${med(hs).toFixed(2)})`);
  console.log(`  ${okNow ? '✅ 안 느려졌다' : '❌ 기준선 대비 벗어났다'} — 허용 ${1 - TOL}~${1 + TOL}`);
  process.exit(okNow ? 0 : 1);
})();
