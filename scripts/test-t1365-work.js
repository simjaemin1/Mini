#!/usr/bin/env node
'use strict';
// @regress
// @bait 2
// === scripts/test-t1365-work.js — 일터 깨움 판정(T1348 ⓒ 농부 `t1348Farm` · T1365 그 밖 일터 `t1365Work`) = 결정 문 · 서버 판 ===
//   몸 전부 판(`scripts/t1294/run.cjs` · 가상 시계 · 시드 1020 · 2날)을 `T1348_WORK=verify` · `T1365_WORK=verify` 로 돌린다.
//   `verify` 는 일터 깨움 표 몸의 결정 시각마다 판정을 셈한 뒤 결정 문을 그 자리에서 실제로 돌린다 —
//   판정이 참이면 결정 시각 · 몸 칸 전부(도장 뺌)를 견주고(어긋남), 거짓이면 그 결정이 몸 칸을 바꿨는지 센다(직업마다 덮음 · 놓친 무동작).
//   ① 판이 끝까지 돌았다  ② 견줌이 탔다 · 어긋남 0(농부 · 그 밖)  ③ 직업마다(농부 · 어부 · 사냥꾼) 무동작 결정을 판정이 거의 다 잡는다(놓침 < 2 %)
//   ★미끼 둘 [T1356 규약] — 생활층 사본 한 곳씩(프리로드로 `server/villages.js` 를 읽을 때만 바꾼다 · 프로세스마다 바꾼 자리 수를 로그 한 줄):
//     ⓐ 사냥꾼 수색 머묾 끝을 1.5초 늦게 본다 → ② 그 밖 어긋남 > 0   ⓑ 어부 낚시 자리 머묾 끝을 1.5초 늦게 본다 → ② 그 밖 어긋남 > 0
//   본 판 ≈ 3분(2날) · 미끼 판 둘은 하루씩 차례로(합 ≈ 6분). 날짜 · 벽시계를 안 쓴다(가상 시계 판 · 날 번호만).
if (require.main !== module) {   // 프리로드로 실렸을 때 — 미끼 갈아 끼우기만(판을 안 돈다)
  const B = process.env.__T1365_BAIT;
  if (B) {
    const Module = require('module'), _c = Module.prototype._compile, VP = require('path').join('server', 'villages.js');
    const R = { hunt: ['// 수색 머묾', 'now < npc._jobT)', 'now < npc._jobT + 1500)'], fish: ['now >= npc._fishT) return _z(', 'now >= npc._fishT)', 'now >= npc._fishT + 1500)'] }[B];
    Module.prototype._compile = function (content, filename) {
      if (R && filename.endsWith(VP)) {
        const L = content.split('\n'), hit = L.map((l, i) => (l.includes(R[0]) ? i : -1)).filter((i) => i >= 0);
        if (hit.length === 1) L[hit[0]] = L[hit[0]].replace(R[1], R[2]);
        content = L.join('\n');
        if (process.env.__T1365_BAIT_LOG) { try { require('fs').appendFileSync(process.env.__T1365_BAIT_LOG, `${process.pid} ${hit.length}\n`); } catch (e) {} }
      }
      return _c.call(this, content, filename);
    };
  }
  return;
}
require('./lib-port').noCentral();   // 존이 기본 central 주소에 붙지 않게
const path = require('path'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYS = +(process.env.T1365_DAYS || 2), SEED = String(process.env.T1365_SEED || 1020), PB = +(process.env.T577_PORT_BASE || 48900);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const out = fs.mkdtempSync(path.join(os.tmpdir(), 't1365-work-'));
function lane(name, port, extra, days) {
  const dir = path.join(out, name); fs.mkdirSync(dir, { recursive: true });
  return new Promise((res) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'scripts', 't1294', 'run.cjs'), path.join(dir, 'run'), String(days || DAYS)], {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, T1278_ROOT: ROOT, T1294_SEED: SEED, T577_PORT_BASE: String(port), T1348_WORK: 'verify', T1365_WORK: 'verify', T1322_STAT: path.join(dir, 'st-%p.json'), ...extra } });
    c.on('exit', (code) => {
      const sf = path.join(dir, 'run', 'status.json'), st = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
      const S = { xvq: 0, xcmp: 0, xbad: 0, fvq: 0, fcmp: 0, fbad: 0, xwhy: {}, fwhy: {}, fjob: {}, fmiss: {}, ex: [] };
      for (const f of fs.readdirSync(dir).filter((x) => /^st-\d+\.json$/.test(x))) {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        for (const k of ['xvq', 'xcmp', 'xbad', 'fvq', 'fcmp', 'fbad']) S[k] += j[k] || 0;
        for (const g of ['xwhy', 'fwhy', 'fmiss']) for (const [k, v] of Object.entries(j[g] || {})) S[g][k] = (S[g][k] || 0) + v;
        for (const [k, v] of Object.entries(j.fjob || {})) { const a = S.fjob[k] || (S.fjob[k] = [0, 0, 0, 0]); v.forEach((n, i) => { a[i] += n; }); }
        S.ex.push(...(j.xex || []), ...(j.fex || []));
      }
      const log = extra.__T1365_BAIT_LOG && fs.existsSync(extra.__T1365_BAIT_LOG) ? fs.readFileSync(extra.__T1365_BAIT_LOG, 'utf8').trim().split('\n').map((l) => +l.split(' ')[1]) : [];
      res({ code, st, S, log });
    });
  });
}
// ④ ★[T1365 ⓒ] 예산 시계 한 번 — `TB.outAt(own, name, t)` = 같은 시각 t 에서 `TB.out(own, name)`(공용 몫 · 결정 몫 남김 · 셈 칸까지) — 가상 시각을 넣어 견준다
function clockCheck() {
  const real = Date.now; let T = 1000, diff = 0, n = 0, outs = 0;
  try {
    Date.now = () => T;
    const A = require(path.join(ROOT, 'server', 'tick-budget.js'));
    if (typeof A.outAt !== 'function') return { diff: -1, n: 0, outs: 0 };
    for (let k = 0; k < 400; k++) {
      T = 1000 + k * 37; A.begin(16); if (k % 3 === 0) A.lateBegin();
      for (let d = 0; d < 24; d += 0.5) { T = 1000 + k * 37 + d; const s0 = JSON.stringify(A.stats()); const a = A.out(15, 'decide'); const s1 = JSON.stringify(A.stats()); const b = A.outAt(15, 'decide', T); const s2 = JSON.stringify(A.stats());
        n++; if (a) outs++; if (a !== b || (s1 === s0) !== (s2 === s1)) diff++; }
      A.lateEnd(5 + (k % 9), 15, k % 4 === 0); A.end();
    }
  } finally { Date.now = real; }
  return { diff, n, outs };
}
(async () => {
  console.log(`\n=== 일터 깨움 판정 = 결정 문 — 시드 ${SEED} · ${DAYS}날 · ${out} ===`);
  const CK = clockCheck();
  ok(CK.n > 5000 && CK.outs > 100 && CK.diff === 0, '④ ★[T1365 ⓒ] 예산 시계 한 번 — `TB.outAt(…, t)` 가 같은 시각의 `TB.out` 과 같은 답 · 같은 셈 칸', `견줌 ${CK.n} · 멈춤 ${CK.outs} · 어긋남 ${CK.diff}`);
  const baitEnv = (b) => ({ __T1365_BAIT: b, __T1365_BAIT_LOG: path.join(out, `bait-${b}.log`), T1294_PRELOAD: __filename });
  const BD = +(process.env.T1365_BAIT_DAYS || 1);   // 미끼 판은 하루(어긋남은 첫날에 선다) · 판은 차례로(셋을 같이 돌리면 짐이 많은 상자에서 가상 시계가 밀린다)
  const M = await lane('main', PB, {}), BH = await lane('hunt', PB + 100, baitEnv('hunt'), BD), BF = await lane('fish', PB + 200, baitEnv('fish'), BD);
  ok(M.code === 0 && M.st && M.st.valid && M.st.days === DAYS, `① 판이 끝까지 돌았다(${DAYS}날 · 가상 시계 오류 0)`, `rc ${M.code}${M.st && !M.st.valid ? ' · ' + JSON.stringify({ exit: M.st.exit, clock: M.st.clock }) : ''}`);
  ok(M.S.xvq > DAYS * 5e4 && M.S.xcmp === M.S.xvq && M.S.xbad === 0 && M.S.fvq > DAYS * 5e4 && M.S.fcmp === M.S.fvq && M.S.fbad === 0,
    '② 판정이 참인 결정을 실제로 돌려 견줌 — 농부 · 그 밖 일터 어긋남 0', `그 밖 ${M.S.xvq}/${M.S.xcmp} 어긋남 ${M.S.xbad} ${JSON.stringify(M.S.xwhy)} · 농부 ${M.S.fvq}/${M.S.fcmp} 어긋남 ${M.S.fbad} ${JSON.stringify(M.S.fwhy)}${M.S.ex.length ? ' · ' + M.S.ex.slice(0, 4).join(' | ') : ''}`);
  const J = M.S.fjob, cov = (j) => { const a = J[j] || [0, 0, 0, 0]; return { caught: a[2], miss: a[0], share: a[0] / Math.max(1, a[0] + a[2]) }; };
  const C = ['farmer', 'fisher', 'hunter'].map((j) => [j, cov(j)]);
  ok(C.every(([, c]) => c.caught > 1000 && c.share < 0.02), '③ 직업마다 무동작 결정을 판정이 잡는다(농부 · 어부 · 사냥꾼 — 놓침 < 2 %)',
    C.map(([j, c]) => `${j} 잡음 ${c.caught} · 놓침 ${c.miss}(${(c.share * 100).toFixed(1)} %)`).join(' · ') + (Object.keys(M.S.fmiss).length ? ' · 놓친 까닭 ' + JSON.stringify(M.S.fmiss) : ''));
  ok(BH.log.length > 0 && BH.log.every((n) => n === 1) && BH.code === 0 && BH.st && BH.st.valid && BH.st.days === BD && BH.S.xbad > 0,
    '미끼 ⓐ 사냥꾼 수색 머묾 끝을 늦게 본 생활층 사본(바꾼 자리 1곳 · 프로세스마다) → ② 그 밖 어긋남 > 0 빨강(판은 끝까지)', `바꾼 자리 ${BH.log.join(',')} · rc ${BH.code} · 어긋남 ${BH.S.xbad} ${JSON.stringify(BH.S.xwhy)}`);
  ok(BF.log.length > 0 && BF.log.every((n) => n === 1) && BF.code === 0 && BF.st && BF.st.valid && BF.st.days === BD && BF.S.xbad > 0,
    '미끼 ⓑ 어부 낚시 자리 머묾 끝을 늦게 본 생활층 사본(바꾼 자리 1곳 · 프로세스마다) → ② 그 밖 어긋남 > 0 빨강(판은 끝까지)', `바꾼 자리 ${BF.log.join(',')} · rc ${BF.code} · 어긋남 ${BF.S.xbad} ${JSON.stringify(BF.S.xwhy)}`);
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== T1365 일터 깨움 ${pass} 통과 · ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})();
