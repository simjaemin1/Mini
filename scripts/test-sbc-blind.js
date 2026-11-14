#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 서버 판 다섯 ≈ 4분 · 기준선 자를 고칠 때 돌린다)
// === scripts/test-sbc-blind.js — 기준선 자가 "생활층 0일 비교"를 같음으로 치지 않는다 (T1280 · T1264 회부 3) =====================
//
// ★왜 T1264: 관찰기를 일찍 실은 판(프리로드가 `server/villages.js` 를 먼저 require)에서는 생활층 훅(`t740-side-hook` — module-loader 주입)이
//   이미 캐시된 villages 에 못 붙어 마을 칸 지문이 0일이다. 종전 `server-baseline-check` 는 그 판을 '마을 칸 지문 0일 같음 · 같음 1/1'(종료 0)로 냈다.
// 판정 사본 0: 진짜 자(`scripts/server-baseline-check.js`)를 진짜 기준선(`계측/서버기준선_2026-11-14.json`)에 짧은 판(1020:10)으로 댄다.
// 지키는 것:
//   ① 정상 판 — 종료 0 · 결과줄 · 끝 줄에 `경제 10/10 · 생활층 10/10`
//   ② ★[T1287] 관찰기 먼저 싣기(NODE_OPTIONS 프리로드가 villages 를 먼저 require) → 이제 훅이 공식 자리(`villages.__t740` · 읽기만)로 붙어 **생활층 10/10 · 종료 0**
//      (T1280 판에선 0/10 · 판 실패 2 였다 — 훅이 컴파일 때 덧붙이는 줄에 기대었다)
//   ②b ★미끼 — 같은 프리로드가 공식 자리를 지운 사본(`delete villages.__t740`) → 생활층 0/10 · **종료 2(판 실패)** · '같음' 줄 0
//   ③ ★미끼 — 생활층이 있는 기준선을 `--side off` 로 견줌 → 생활층 0/10 · 종료 2
//   ④ ★미끼 — 만들기(`--make`)도 생활층 0일 판(②b 사본)으로는 기준선을 안 쓴다(종료 2 · 파일 없음)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SBC = path.join(__dirname, 'server-baseline-check.js');
const BASE = path.join(ROOT, '계측', '서버기준선_2026-11-14.json');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1280-'));
const EARLY = path.join(TMP, 'early-villages.js');
fs.writeFileSync(EARLY, `require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))});\n`);   // 관찰기 꼴 — villages 를 먼저 싣는다
const NOHOOK = path.join(TMP, 'early-nohook.js');
fs.writeFileSync(NOHOOK, `delete require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))}).__t740;\n`);   // 미끼 — 먼저 싣고 공식 자리를 지운 사본
const env0 = (() => { const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; delete e.SBC_DUMP_DAY; return e; })();
function run(args, extraEnv) {
  const r = spawnSync(process.execPath, [SBC, ...args], { cwd: ROOT, env: Object.assign({}, env0, extraEnv || {}), encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').filter((l) => /^=== /.test(l)).pop() || '';
  const seed = out.split('\n').find((l) => /시드 1020:/.test(l)) || '';
  return { code: r.status, out, last, seed };
}
console.log('\n=== 기준선 자 — 생활층 0일 비교는 같음이 아니다 ===');
const N = run([BASE, '--vclock', '--plan', '1020:10']);
ok(N.code === 0 && /경제 10\/10 · 생활층 10\/10/.test(N.last) && /생활층\(마을 칸\) 10\/10/.test(N.seed), '① 정상 판 — 종료 0 · 결과줄 · 끝 줄에 칸별 날 수(경제 10/10 · 생활층 10/10)', `종료 ${N.code} · ${N.last}`);
const B = run([BASE, '--vclock', '--plan', '1020:10'], { NODE_OPTIONS: `--require ${EARLY}` });
ok(B.code === 0 && /경제 10\/10 · 생활층 10\/10/.test(B.last), '★② 관찰기 먼저 싣기(villages 먼저 require) → 훅이 공식 자리로 붙는다 · 생활층 10/10 · 종료 0(T1287 · 종전 0/10)', `종료 ${B.code} · ${B.last}`);
const B2 = run([BASE, '--vclock', '--plan', '1020:10'], { NODE_OPTIONS: `--require ${NOHOOK}` });
ok(B2.code === 2 && /생활층 0\/10/.test(B2.last) && !/○ 시드 1020/.test(B2.out), '★②b 미끼 — 먼저 싣고 공식 자리를 지운 사본 → 생활층 0/10 · 종료 2(판 실패) · 같음 줄 0', `종료 ${B2.code} · ${B2.last}`);
const O = run([BASE, '--vclock', '--side', 'off', '--plan', '1020:10']);
ok(O.code === 2 && /생활층 0\/10/.test(O.last), '★③ 미끼 — 생활층이 있는 기준선을 `--side off` 로 견줌 → 종료 2', `종료 ${O.code} · ${O.last}`);
const MK = path.join(TMP, 'made.json');
const M = run(['--make', MK, '--vclock', '--days', '10', '--seeds', '1020'], { NODE_OPTIONS: `--require ${NOHOOK}` });
ok(M.code === 2 && !fs.existsSync(MK) && /생활층\(마을 칸\) 0\/10/.test(M.out), '★④ 미끼 — 만들기도 생활층 0일 판으로는 기준선을 안 쓴다(종료 2 · 파일 없음)', `종료 ${M.code} · 파일 ${fs.existsSync(MK) ? '있음' : '없음'}`);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
