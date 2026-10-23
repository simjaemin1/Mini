// (@regress 없음 — 러너 밖 · T895 탐침 · 제품 무변 · 판정 0)
// === scripts/t895-port-probe.js — e2e 하네스가 띄운 서버가 포트를 언제까지 쥐나 ===
//
// ★왜 [T895] e2e 하네스 76곳이 같은 포트(3010 · 3020)를 쓴다. 앞 판 서버가 포트를 쥔 채 남으면 다음 판 central · 존이 `EADDRINUSE` 로 죽는다.
//   하네스가 끝내는 꼴은 넷이다: ⓐ `process.on('exit')` 에서 SIGKILL · ⓑ 끝에서 `p.kill()`(SIGTERM)만 · ⓒ 끝에서 SIGKILL 만 · ⓓ `fixture-boot.reapOnExit`.
//   이 탐침은 하네스와 같은 꼴로 central + 존을 띄우고 잰다:
//     term  — 아이에 SIGTERM(ⓑ) → 아이가 내려가 포트가 풀릴 때까지 ms(존은 T728 종료 저장을 한다 · 상한 없음)
//     kill  — 아이에 SIGKILL(ⓐ · ⓒ) → 포트가 풀릴 때까지 ms
//     orphan— 하네스 꼴 부모(아이 둘 + `process.on('exit')` SIGKILL)를 띄우고, **부모에** SIGTERM(러너 밖의 시간 초과 · 손으로 끊기) →
//             부모가 죽은 뒤 아이가 살아 있나 · 포트를 쥐나(ⓐ 의 'exit' 는 신호 죽음에서 안 돈다)
//     reap  — 같은 부모인데 `fixture-boot.reapOnExit` → 부모 SIGTERM 뒤 아이 · 포트
//     termexit — 하네스 꼴 부모가 끝에서 `p.kill()`(SIGTERM)만 하고 곧장 `process.exit(0)`(T824 §곁) → 부모가 끝난 순간 포트를 쥐었나 · 풀릴 때까지 ms
//   --tree <레포 뿌리> — 그 트리의 `server/` · `scripts/fixture-boot.js` 로 띄운다(main 작업 트리 = 고치기 전)
//   node scripts/t895-port-probe.js [term|kill|orphan|reap …] [--cport 3910 --zport 3920] [--out <json>]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const ROOT = path.resolve(opt('tree', path.join(__dirname, '..')));   // --tree <레포 뿌리> — 그 트리의 서버 · fixture-boot 로(전 · 후 견주기)
const FB = require(path.join(ROOT, 'scripts', 'fixture-boot'));
const CPORT = +opt('cport', '3910'), ZPORT = +opt('zport', '3920');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 하네스 꼴 부모(아이 판) ─────────────────────────────────────────────────
if (process.env.T895_PARENT) {
  const mode = process.env.T895_PARENT, tag = process.env.T895_TAG || 'p';
  const CDB = `/tmp/t895-${tag}-c-${process.pid}.db`, ZDB = `/tmp/t895-${tag}-z-${process.pid}.db`;
  const procs = [];   // ★하네스 꼴 — 아이는 `FB.waitUp` 을 지난다(83/85 하네스와 같다)
  const boot = (file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; };
  if (mode === 'reap') FB.reapOnExit(procs);
  else if (mode === 'termexit') { /* 'exit' 손 없음 — 끝에서 SIGTERM 만(T824 꼴) */ }
  else process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });   // ⓐ 76곳의 꼴
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  (async () => {
    const a = await cu, b = await zu;
    process.stdout.write(JSON.stringify({ up: a.ok && b.ok, cpid: c.pid, zpid: z.pid }) + '\n');
    if (mode === 'termexit') { await sleep(3000); for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(0); }
    setInterval(() => {}, 1000);   // 신호를 기다린다
  })();
  return;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
async function waitFree(ports, capMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) { if (!FB.heldPorts(ports).length) return Date.now() - t0; await sleep(50); }
  return null;
}
function bootPair(tag) {
  const CDB = `/tmp/t895-${tag}-c-${process.pid}.db`, ZDB = `/tmp/t895-${tag}-z-${process.pid}.db`;
  const c = spawn(process.execPath, [path.join(ROOT, 'server', 'central.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }), stdio: ['ignore', 'pipe', 'pipe'] });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' }), stdio: ['ignore', 'pipe', 'pipe'] });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  let zlog = '';
  z.stdout.on('data', (d) => { zlog += String(d); if (zlog.length > 20000) zlog = zlog.slice(-20000); });
  return { c, z, cu, zu, zlog: () => zlog };
}
const exitMs = (p, t0) => new Promise((r) => { if (p.exitCode !== null || p.signalCode !== null) return r(0); p.once('exit', () => r(Date.now() - t0)); });

async function direct(sig) {
  const P = bootPair(sig);
  const a = await P.cu, b = await P.zu;
  if (!a.ok || !b.ok) return { mode: sig, up: false, why: a.why || b.why };
  await sleep(3000);
  const t0 = Date.now();
  const ce = exitMs(P.c, t0), ze = exitMs(P.z, t0);
  P.c.kill(sig === 'term' ? 'SIGTERM' : 'SIGKILL'); P.z.kill(sig === 'term' ? 'SIGTERM' : 'SIGKILL');
  const free = await waitFree([CPORT, ZPORT], 120000);
  const r = { mode: sig, up: true, centralExitMs: await Promise.race([ce, sleep(120000).then(() => null)]), zoneExitMs: await Promise.race([ze, sleep(1).then(() => null)]), portsFreeMs: free };
  if (r.zoneExitMs == null) r.zoneExitMs = await Promise.race([ze, sleep(120000).then(() => null)]);
  const m = P.zlog().match(/\[T728\] 종료 저장 — [^\n]*/); if (m) r.t728 = m[0].slice(0, 160);
  for (const p of [P.c, P.z]) { try { p.kill('SIGKILL'); } catch (e) {} }
  return r;
}
async function parent(mode) {
  const par = spawn(process.execPath, [__filename, '--cport', String(CPORT), '--zport', String(ZPORT), '--tree', ROOT], { cwd: ROOT, env: Object.assign({}, process.env, { T895_PARENT: mode, T895_TAG: mode }), stdio: ['ignore', 'pipe', 'pipe'] });
  const info = await new Promise((r) => { let s = ''; par.stdout.on('data', (d) => { s += d; const i = s.indexOf('\n'); if (i >= 0) r(JSON.parse(s.slice(0, i))); }); par.once('exit', () => r(null)); });
  if (!info || !info.up) return { mode, up: false };
  if (mode === 'termexit') {
    await new Promise((r) => { if (par.exitCode !== null) return r(); par.once('exit', r); });
    const heldAtExit = FB.heldPorts([CPORT, ZPORT]);
    const free = await waitFree([CPORT, ZPORT], 30000);
    const r = { mode, up: true, heldAtParentExit: heldAtExit, portsFreeAfterParentExitMs: heldAtExit.length ? free : 0 };
    for (const pid of [info.cpid, info.zpid]) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} }
    return r;
  }
  await sleep(3000);
  const t0 = Date.now();
  const pe = exitMs(par, t0);
  par.kill('SIGTERM');
  const parentExitMs = await pe;
  await sleep(2000);
  const r = { mode, up: true, parentExitMs, centralAlive2s: alive(info.cpid), zoneAlive2s: alive(info.zpid), heldAfter2s: FB.heldPorts([CPORT, ZPORT]) };
  for (const pid of [info.cpid, info.zpid]) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} }
  r.portsFreeAfterCleanupMs = await waitFree([CPORT, ZPORT], 30000);
  return r;
}

(async () => {
  const modes = A.filter((x) => /^(term|kill|orphan|reap|termexit)$/.test(x));
  const held = FB.heldPorts([CPORT, ZPORT]);
  if (held.length) { console.error(`포트 ${held.join('·')} 를 이미 누가 쥐고 있다`); process.exit(2); }
  const out = [];
  for (const m of (modes.length ? modes : ['term', 'kill', 'orphan', 'reap', 'termexit'])) {
    const r = Object.assign({ tree: ROOT }, (m === 'term' || m === 'kill') ? await direct(m) : await parent(m));
    console.log(JSON.stringify(r)); out.push(r);
    await waitFree([CPORT, ZPORT], 30000);
  }
  if (opt('out', '')) fs.writeFileSync(opt('out', ''), JSON.stringify(out, null, 1));
  for (const f of fs.readdirSync('/tmp')) if (/^t895-/.test(f)) { try { fs.unlinkSync('/tmp/' + f); } catch (e) {} }
  process.exit(0);
})();
