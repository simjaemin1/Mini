#!/usr/bin/env node
// === scripts/lab-modules.js — econ 랩이 **실제로 무는 파일**을 추적한다 =============
//
// ★왜 [재민 확정 2026-09-03 · 검증 비용 규약 · 인계/공통.md §2]
//   "3시드 800일 베이스 A/B 는 econ 랩이 무는 파일을 만진 카드만 한다.
//    그 밖의 파일만 만진 카드는 **랩 모듈 적재 추적**으로 `내 diff ∩ 적재 목록 = ∅` 을 보고에 적는다."
//   T52·T43 이 그 추적을 **손으로** 했다. 카드마다 다시 짜면 그게 사본이다 ⇒ 여기 한 번 둔다.
//
// ★어떻게: `Module.prototype.require` 를 후킹해 **해석된 절대 경로**를 모은다(이름이 아니라 파일).
//   그리고 랩을 짧게(기본 2게임일) 실제로 돌린다 — 정적 분석이 아니라 **실행**이 답이다
//   (지연 `require`·조건부 로드는 정적으로 안 보인다. 계측기도 사본 금지 · 족보 ㉒).
//
// 쓰는 법:
//   node scripts/lab-modules.js                 # 적재 목록만
//   node scripts/lab-modules.js --diff          # git diff(HEAD 기준 작업본) 과 교집합까지
//   node scripts/lab-modules.js --diff <base>   # <base>..작업본 diff 와 교집합
//   LAB_DAYS=2 node scripts/lab-modules.js
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');

const DAYS = parseInt(process.env.LAB_DAYS || '2', 10);
const wantDiff = process.argv.includes('--diff');
const baseArg = wantDiff ? (process.argv[process.argv.indexOf('--diff') + 1] || '') : '';

// ── 후킹 — 저장소 안의 .js 만 센다(node_modules·내장 모듈 제외) ─────────────────
const loaded = new Set();
const origReq = Module.prototype.require;
Module.prototype.require = function (id) {
  const m = origReq.apply(this, arguments);
  try {
    const abs = Module._resolveFilename(id, this);
    if (abs.startsWith(ROOT) && !abs.includes(`${path.sep}node_modules${path.sep}`) && abs.endsWith('.js')) {
      loaded.add(path.relative(ROOT, abs));
    }
  } catch (e) {}
  return m;
};

// ── 랩을 짧게 실제로 돌린다 ──────────────────────────────────────────────────
process.argv[2] = String(DAYS);
const quiet = console.log;
console.log = () => {};                       // 랩의 진행 출력은 삼킨다(목록만 본다)
try { require(path.join(ROOT, 'scripts', 'econ-lab-real.js')); }
catch (e) { console.log = quiet; console.error('랩 기동 실패:', e.message); process.exit(2); }
console.log = quiet;

// econ-lab-real 은 비동기로 끝날 수 있다 — 적재는 기동 시점에 이미 다 일어난다.
setTimeout(() => {
  const list = [...loaded].filter((f) => !f.startsWith('scripts/lab-modules')).sort();
  console.log(`\n=== econ 랩이 무는 저장소 파일 — ${list.length}개 (${DAYS}게임일 기동) ===`);
  for (const f of list) console.log('  ' + f);

  if (wantDiff) {
    let changed = [];
    try {
      const cmd = baseArg ? `git diff --name-only ${baseArg} -- .` : 'git status --porcelain';
      const out = execSync(cmd, { cwd: ROOT }).toString();
      changed = baseArg ? out.split('\n').filter(Boolean)
        : out.split('\n').filter(Boolean).map((l) => l.slice(3).trim().replace(/^.* -> /, ''));
      changed = changed.filter((f) => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.json'));
    } catch (e) { console.error('diff 읽기 실패:', e.message); }
    const set = new Set(list);
    const hit = changed.filter((f) => set.has(f));
    console.log(`\n=== 내 diff — ${changed.length}개 ===`);
    for (const f of changed) console.log(`  ${set.has(f) ? '★적재됨' : '      · '} ${f}`);
    console.log(`\n=== 교집합 ${hit.length}개 ===`);
    if (hit.length === 0) console.log('  ∅ — 3시드 800일 A/B 를 갈음할 수 있다(공통.md §2 ①)');
    else { console.log('  ' + hit.join('\n  ')); console.log('  ⇒ 베이스 A/B 를 종전대로 돌려라'); }
    process.exit(hit.length === 0 ? 0 : 1);
  }
  process.exit(0);
}, 50);
