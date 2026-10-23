#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-reap-scope.js — 이름으로 죽이기가 **남의 레인**을 못 죽인다 (T853 · T829 회부 1) ===
//
// ★[T853 2026-10-22] 하네스를 한 상자에서 둘 이상 돌릴 때(레인마다 제 netns·제 /tmp) 판 중간에 central 이 SIGTERM 으로 내려갔다.
//   프로세스 번호 공간(pid ns)은 하나라 `pkill -f "server/centra[l].js"` 는 netns 를 가로질러 남의 레인을 죽인다.
//   이름으로 죽이는 손 스크립트(`_drain.sh` · `t9-sweep.sh` · `t10-stale-control.sh` · `bench-*.sh`)는 이제 `_mine.sh` 의 `kill_mine`
//   — **나와 같은 netns 의 것만** — 을 쓴다. 하네스(e2e · test)에는 이름으로 죽이기가 이미 0 이다(T773).
// 재는 것 (포트 0 · 서버 안 띄움 — 이름에 유일 표지를 단 가짜 central 두 개)
//   ⓐ 대조: 종전 `pkill -f` 는 다른 netns 의 가짜 central 까지 죽인다   ★자명 통과 금지: 이 대조가 안 물면 ⓑ 는 아무것도 못 가린다
//   ⓑ `kill_mine` 은 내 netns 의 것만 죽이고 다른 netns 것은 산다
//   (`_drain.sh` 를 실제로 부르지는 않는다 — 이 시험이 도는 netns 의 진짜 central·존을 죽일 수 있다. 그 길은 ⓓ 정적이 가린다)
//   ⓓ 정적: 이름 죽이기 스크립트는 전부 `_mine.sh` 를 쓰고 `pkill -f "server/` 가 남지 않았다 · 하네스에 pkill/killall 0
// netns 를 못 만드는 상자(권한 없음 · 맥)에선 ⓐ·ⓑ 를 "건너뜀"으로 적는다(통과로 세지 않는다).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skip = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sk = (m) => { skip++; console.log('  ○ 건너뜀 — ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TAG = `t853zz${process.pid}`;          // 유일 표지 — 진짜 central 과 이름이 겹치지 않는다
const PAT = `${TAG}/centra[l].js`;            // 브래킷 관용구(자기 셸 안 죽임)
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 't853-'));
const CODE = `const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f+'.up','1');
process.on('SIGTERM',()=>{fs.writeFileSync(f+'.term','1');process.exit(0)});setInterval(()=>{},1000);`;
const kids = [];
function dummy(name, foreign) {
  const f = path.join(DIR, name);
  const argv = ['-e', CODE, f, `${TAG}/central.js`];   // 명령줄에 `<표지>/central.js` — pkill -f 패턴에 걸린다
  const c = foreign ? spawn('unshare', ['-n', process.execPath, ...argv], { stdio: 'ignore' }) : spawn(process.execPath, argv, { stdio: 'ignore' });
  kids.push(c); return { f, c };
}
async function up(d, ms = 4000) { for (let t = 0; t < ms; t += 50) { if (fs.existsSync(d.f + '.up')) return true; await sleep(50); } return false; }
const termed = (d) => fs.existsSync(d.f + '.term');
async function settle() { await sleep(700); }
function cleanup() { for (const c of kids) { try { c.kill('SIGKILL'); } catch (e) {} } for (const p of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) { try { fs.unlinkSync(path.join(DIR, p)); } catch (e) {} } try { fs.rmdirSync(DIR); } catch (e) {} }
const bash = (cmd) => spawnSync('bash', ['-c', cmd], { encoding: 'utf8', cwd: ROOT, timeout: 20000 });

(async () => {
  const canNs = spawnSync('unshare', ['-n', 'true'], { stdio: 'ignore' }).status === 0 && fs.existsSync('/proc/self/ns/net');
  console.log('ⓐ 대조 — 종전 `pkill -f` 는 다른 netns 의 central 까지 죽인다');
  if (!canNs) { sk('netns 를 못 만드는 상자(unshare -n 실패 또는 /proc 없음) — ⓐ·ⓑ'); }
  else {
    const mine1 = dummy('a-mine', false), far1 = dummy('a-far', true);
    ok(await up(mine1) && await up(far1), '가짜 central 둘이 떴다(내 netns 하나 · 다른 netns 하나)');
    bash(`pkill -f '${PAT}'`); await settle();
    ok(termed(mine1) && termed(far1), '종전 방식: 둘 다 SIGTERM 으로 죽었다 = 다른 레인까지 죽인다(결함 재현 · 대조가 문다)');

    console.log('\nⓑ `kill_mine` — 내 netns 것만');
    const mine2 = dummy('b-mine', false), far2 = dummy('b-far', true);
    ok(await up(mine2) && await up(far2), '가짜 central 둘이 떴다');
    const r = bash(`source scripts/_mine.sh; kill_mine '${PAT}'; echo n=$(count_mine '${PAT}')`); await settle();
    ok(termed(mine2), '내 netns 의 것은 죽었다(SIGTERM 받음)');
    ok(!termed(far2) && far2.c.exitCode === null && far2.c.signalCode === null, '다른 netns 의 것은 산다(SIGTERM 0 · 아직 돈다)');
    ok(/n=\d+/.test(r.stdout || ''), '`count_mine` 이 센다', (r.stdout || '').trim());

  }

  console.log('\nⓓ 정적');
  const SH = ['_drain.sh', 't9-sweep.sh', 't10-stale-control.sh', 'bench-2zone.sh', 'bench-26zone.sh'];
  for (const f of SH) {
    const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
    ok(/_mine\.sh/.test(s) && /kill_mine /.test(s) && !/^\s*[^#\n]*\bpkill\b/m.test(s.replace(/#.*$/gm, '')), `${f} — 이름 죽이기는 \`kill_mine\` 뿐(\`pkill\` 0)`);
  }
  const bad = [];
  for (const f of fs.readdirSync(__dirname)) {
    if (!/^(e2e|test)-.*\.js$/.test(f) || f === 'test-reap-scope.js') continue;
    const s = fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\/.*$/gm, '');
    if (/['"`]\s*(pkill|killall)\b/.test(s) || /\b(pkill|killall)\s+-/.test(s)) bad.push(f);
  }
  ok(bad.length === 0, '하네스(e2e-* · test-*)에 `pkill`/`killall` 명령 0(T773 바닥 유지)', bad.join(' '));
  const m = fs.readFileSync(path.join(__dirname, '_mine.sh'), 'utf8');
  ok(/ns\/net/.test(m) && /kill_mine\(\)/.test(m), '`_mine.sh` — 같은 netns 비교(`/proc/<pid>/ns/net`) 한 자리');

  cleanup();
  console.log(`\n${pass} 통과 · ${fail} 실패${skip ? ` · 건너뜀 ${skip}` : ''}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); cleanup(); process.exit(1); });
