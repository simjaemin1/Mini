#!/usr/bin/env node
// @regress
// === scripts/test-fixture-reap.js — 내가 띄운 서버는 내가 끝날 때 같이 내려간다 (T895 · `fixture-boot` 자동 거두기) ===
//
// ★왜 [T895] e2e 하네스 76곳이 같은 포트(3010 · 3020)를 쓴다. 하네스가 신호로 죽으면 `process.on('exit')` 가 안 돌아 central · 존이 살아남아
//   포트를 쥐고(탐침 `t895-port-probe.js` orphan), 끝에서 `p.kill()`(SIGTERM)만 하고 나가면 존이 종료 저장 · 200ms 뒤에 내려가 다음 판이
//   `EADDRINUSE` 로 죽는다(termexit · T824). `fixture-boot.waitUp` 이 받은 아이를 적어 두고 하네스가 어떻게 끝나든 SIGKILL · 몸이 내려갈 때까지 기다린다.
//   이 하네스는 진짜 central · 존 대신 **같은 꼴의 작은 서버**(포트를 쥐고 `server up on` 을 찍고 · SIGTERM 엔 지연 뒤 내려감)로 몇 초에 잰다.
//
//  ① 부모가 SIGTERM 으로 죽는다(제 손 없음 · 'exit' 손만) → 아이 죽음 · 포트 풀림 · 종료코드 143
//  ② 부모가 끝에서 SIGTERM 만 보내고 곧장 나간다('exit' 손 없음 — 43곳의 꼴) → 부모가 끝난 순간 포트가 이미 풀렸다(아이의 느린 종료를 안 기다리게 SIGKILL)
//  ③ 부모가 예외로 죽는다('exit' 손 없음) → 아이 죽음 · 포트 풀림
//  ④ 부모에게 제 SIGTERM 손이 있다 → 그 손이 먼저 돈다(빼앗지 않는다) · 그 손이 나가면 아이도 거둔다
//  ⑤ `waitUp`(·`track`)에 안 넘긴 아이는 건드리지 않는다(남의 판 무접촉 — T773)
//  ⑥ `reapOnExit` 와 같이 써도 된다(겹쳐도 한 번 · 아이 죽음)
//  ⑦ 판 가운데 내렸다 다시 띄운 아이 — 내린 것은 건너뛰고 새 것만 거둔다
//
// 실행: node scripts/test-fixture-reap.js
'use strict';
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const BASE = 3960;   // 이 하네스만 쓰는 포트 줄(다른 하네스 3010 · 3020 과 안 겹친다)

// ── 작은 서버(아이) — 포트를 쥐고 표식을 찍는다 · SIGTERM 엔 300ms 뒤 내려간다(존의 종료 저장 · 200ms 타이머 꼴) ──
if (process.env.T895_KID) {
  const s = net.createServer(() => {});
  s.listen(+process.env.T895_KID, () => console.log(`[kid] server up on :${process.env.T895_KID}`));
  process.on('SIGTERM', () => setTimeout(() => process.exit(0), 300));
  return;
}
// ── 하네스 꼴 부모 ────────────────────────────────────────────────────────────
if (process.env.T895_PAR) {
  const mode = process.env.T895_PAR, p1 = +process.env.T895_P1, p2 = +process.env.T895_P2;
  const kid = (port) => spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { T895_KID: String(port), T895_PAR: '' }), stdio: ['ignore', 'pipe', 'pipe'] });
  const procs = [];
  if (mode !== 'termexit' && mode !== 'throw') process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });   // 76곳의 꼴('exit' 손) · ②③ = 'exit' 손 없는 43곳의 꼴(끝에서 `kill()` 만)
  if (mode === 'own') process.on('SIGTERM', () => { console.log('OWN-HANDLER'); setTimeout(() => process.exit(7), 50); });
  if (mode === 'reapboth') FB.reapOnExit(procs);
  (async () => {
    const a = kid(p1); procs.push(a);
    const untracked = mode === 'untracked';
    let b = null;
    if (untracked) { b = kid(p2); await new Promise((r) => b.stdout.once('data', r)); }   // waitUp 을 안 지난 아이(남의 판 꼴)
    const ua = await FB.waitUp(a, /server up on/, { name: 'kidA' });
    if (mode === 'restart') {   // 판 가운데 내리고 같은 포트로 다시
      a.kill('SIGKILL'); await new Promise((r) => a.once('exit', r));
      const a2 = kid(p1); procs.push(a2); await FB.waitUp(a2, /server up on/, { name: 'kidA2' });
      console.log(JSON.stringify({ up: true, pids: [a2.pid], old: a.pid }));
    } else console.log(JSON.stringify({ up: ua.ok, pids: [a.pid].concat(b ? [b.pid] : []) }));
    if (mode === 'termexit') { await new Promise((r) => setTimeout(r, 100)); for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(0); }
    if (mode === 'throw') { await new Promise((r) => setTimeout(r, 100)); throw new Error('하네스 예외'); }
    setInterval(() => {}, 1000);
  })();
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); const s = require('fs').readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.charAt(s.lastIndexOf(')') + 2) !== 'Z'; } catch (e) { return false; } };
function par(mode, p1, p2) {
  const c = spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { T895_PAR: mode, T895_P1: String(p1), T895_P2: String(p2 || 0) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  const info = new Promise((r) => { const f = () => { const m = out.match(/\{[^\n]*"up"[^\n]*\}/); if (m) { c.stdout.removeListener('data', f); r(JSON.parse(m[0])); } }; c.stdout.on('data', f); c.once('exit', () => r(null)); });
  const done = new Promise((r) => c.once('exit', (code, sig) => r({ code, sig })));
  return { c, info, done, out: () => out };
}

(async () => {
  console.log('=== 내가 띄운 서버는 내가 끝날 때 같이 내려간다 (T895 · fixture-boot 자동 거두기) ===');
  const held0 = FB.heldPorts([BASE, BASE + 1, BASE + 2, BASE + 3, BASE + 4, BASE + 5, BASE + 6, BASE + 7]);
  if (held0.length) { console.error(`  ✗ 포트 ${held0.join('·')} 를 이미 누가 쥐고 있다`); process.exit(2); }

  console.log('\n① 부모가 SIGTERM 으로 죽는다');
  { const P = par('sig', BASE); const I = await P.info; await sleep(150); P.c.kill('SIGTERM'); const d = await P.done;
    ok(I && I.up, '① (상황) 아이가 떴다(waitUp)'); ok(d.code === 143, '① 부모 종료코드 143(SIGTERM)', JSON.stringify(d));
    ok(I && !alive(I.pids[0]) && !FB.heldPorts([BASE]).length, '★① 부모가 끝난 순간 아이는 죽었고 포트는 풀렸다(종전: 아이가 살아 포트를 쥠)', I && `pid ${I.pids[0]}`); }

  console.log('\n② 끝에서 SIGTERM 만 보내고 곧장 나간다(exit 손 없음 · 아이는 300ms 뒤 내려가는 꼴)');
  { const P = par('termexit', BASE + 1); const I = await P.info; const d = await P.done; const held = FB.heldPorts([BASE + 1]);
    ok(I && I.up && d.code === 0, '② (상황) 부모 정상 종료', JSON.stringify(d));
    ok(!held.length && I && !alive(I.pids[0]), '★② 부모가 끝난 순간 포트가 이미 풀렸다 — 바로 다음 판이 같은 포트를 쥘 수 있다', `쥠 ${JSON.stringify(held)}`); }

  console.log('\n③ 부모가 예외로 죽는다(exit 손 없음 — 끝 줄에 못 닿았다)');
  { const P = par('throw', BASE + 2); const I = await P.info; const d = await P.done;
    ok(I && I.up && d.code === 1, '③ (상황) 부모 예외 종료코드 1', JSON.stringify(d));
    ok(I && !alive(I.pids[0]) && !FB.heldPorts([BASE + 2]).length, '★③ 아이 죽음 · 포트 풀림'); }

  console.log('\n④ 부모에게 제 SIGTERM 손이 있다');
  { const P = par('own', BASE + 3); const I = await P.info; await sleep(150); P.c.kill('SIGTERM'); const d = await P.done;
    ok(/OWN-HANDLER/.test(P.out()) && d.code === 7, '④ 하네스의 손이 돌았다(빼앗지 않는다 · 그 손의 종료코드 7)', JSON.stringify(d));
    ok(I && !alive(I.pids[0]) && !FB.heldPorts([BASE + 3]).length, '★④ 그 손이 나간 뒤 아이도 거뒀다'); }

  console.log('\n⑤ waitUp 에 안 넘긴 아이는 건드리지 않는다');
  { const P = par('untracked', BASE + 4, BASE + 5); const I = await P.info; await sleep(150); P.c.kill('SIGTERM'); await P.done;
    const tracked = I && I.pids[0], other = I && I.pids[1];
    ok(I && !alive(tracked), '⑤ waitUp 을 지난 아이는 거뒀다');
    ok(I && alive(other) && FB.heldPorts([BASE + 5]).length === 1, '★⑤ 안 지난 아이(남의 판 꼴)는 산 채 포트를 쥔다 — 무접촉(T773)', `pid ${other}`);
    try { process.kill(other, 'SIGKILL'); } catch (e) {} await sleep(100); }

  console.log('\n⑥ reapOnExit 와 같이');
  { const P = par('reapboth', BASE + 6); const I = await P.info; await sleep(150); P.c.kill('SIGTERM'); const d = await P.done;
    ok(d.code === 143 && I && !alive(I.pids[0]) && !FB.heldPorts([BASE + 6]).length, '⑥ 겹쳐도 한 번 — 종료코드 143 · 아이 죽음 · 포트 풀림', JSON.stringify(d)); }

  console.log('\n⑦ 판 가운데 내렸다 다시 띄운 아이');
  { const P = par('restart', BASE + 7); const I = await P.info; await sleep(150); P.c.kill('SIGTERM'); await P.done;
    ok(I && I.up && !alive(I.pids[0]) && !FB.heldPorts([BASE + 7]).length, '⑦ 새 아이를 거뒀다 · 내린 아이는 건너뛰었다(이미 없음)', I && `old ${I.old} · new ${I.pids[0]}`); }

  console.log('\n⑧ 글자');
  const src = require('fs').readFileSync(path.join(__dirname, 'fixture-boot.js'), 'utf8');
  ok(/function waitUp\(child, re, opts\) \{\n  track\(child\);/.test(src), '⑧ waitUp 첫 줄이 track — 기다린 아이는 다 적힌다');
  ok(/p\.kill\('SIGKILL'\)/.test(src.slice(src.indexOf('function reapTracked'))) && /listenerCount\(sig\) > 1/.test(src), '⑧ 거두기 = SIGKILL · 하네스의 신호 손이 있으면 그 손에 맡긴다');

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
