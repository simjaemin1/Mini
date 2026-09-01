#!/usr/bin/env node
// === scripts/test-redeploy.js — 재배포 판정 하네스 [2026-09-01] ================
//
// 대상: `scripts/redeploy-hanbando.sh` 의 **무엇을 다시 할지 정하는 부분**.
//   재민 실기: "매번 --central 을 해야 하나? 너무 오래 걸린다."
//   맞는 지적이었다 — 종전 판은 `public/client.js` 한 줄만 바뀌어도 **존을 재생성**했고,
//   시간의 거의 전부가 그 존 부팅이다(스크립트 주석: 거리행렬만 ~190초).
//   존은 클라를 서빙하지 않는다(central 이 매 요청마다 디스크에서 읽는다) ⇒ 순수 낭비였다.
//
// ★★어떻게 검사하나 — **진짜 스크립트를 돌린다.** 판정 로직을 여기 옮겨 적으면 사본이 갈린다.
//   `git`·`docker`·`curl` 을 가짜로 PATH 앞에 세워 두고 실제 파일을 실행해, **화면에 찍힌 판정**을 읽는다.
//   가짜 docker 는 자기가 무엇을 build 하라고 불렸는지 적는다 — 그래서 "말만 하고 안 했다"가 안 통한다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rdtest-'));
const BIN = path.join(TMP, 'bin'), REPO = path.join(TMP, 'repo', 'scripts'), SRV = path.join(TMP, 'srv');
fs.mkdirSync(BIN, { recursive: true }); fs.mkdirSync(REPO, { recursive: true }); fs.mkdirSync(SRV, { recursive: true });

fs.writeFileSync(path.join(BIN, 'git'), `#!/bin/sh
case "$1 $2" in
  "rev-parse HEAD") echo "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; exit 0 ;;
  "cat-file -e") [ -n "$FAKE_STAMP_VALID" ] && exit 0 || exit 1 ;;
  "diff --name-only") printf '%s\\n' $FAKE_CHANGED; exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
// ★가짜 docker 는 **자기가 무엇을 하라고 불렸는지 파일에 적는다**(족보 57 — 행동을 센다)
fs.writeFileSync(path.join(BIN, 'docker'), `#!/bin/sh
case "$1" in
  build) echo "$*" >> "$FAKE_LOG" ;;
  ps) case "$*" in
        *-a*) printf 'durango-central\ndurango-zone-hanbando\n' ;;   # recreate() 의 존재 확인용(이름만)
        *)    printf 'durango-central\tUp 1 second\ndurango-zone-hanbando\tUp 1 second\n' ;;
      esac ;;
  inspect) echo "PORT=3010" ;;
esac
exit 0
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.copyFileSync(path.join(ROOT, 'scripts', 'redeploy-hanbando.sh'), path.join(REPO, 'redeploy-hanbando.sh'));

const STAMP = path.join(SRV, 'stamp'), LOG = path.join(TMP, 'built.log');
function run(changed, { stamp = true, args = [] } = {}) {
  if (stamp) fs.writeFileSync(STAMP, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'); else { try { fs.unlinkSync(STAMP); } catch (e) {} }
  try { fs.unlinkSync(LOG); } catch (e) {}
  fs.writeFileSync(LOG, '');
  const out = execFileSync('bash', [path.join(REPO, 'redeploy-hanbando.sh'), ...args], {
    encoding: 'utf8', env: { ...process.env, PATH: BIN + ':' + process.env.PATH,
      REPO_DIR: path.join(TMP, 'repo'), STAMP, FAKE_STAMP_VALID: stamp ? '1' : '', FAKE_CHANGED: changed, FAKE_LOG: LOG } });
  const built = fs.readFileSync(LOG, 'utf8');
  return { out, zone: /Dockerfile\.zone/.test(built), central: /Dockerfile\.central/.test(built) };
}

console.log('\n=== 재배포 판정 — 바뀐 파일만큼만 하는가 ===\n① 클라만 바뀌면 존을 안 건드린다');
let r = run('public/client.js');
ok(r.central && !r.zone, '`public/client.js` → central 만 굽는다 · 존 무접촉',
   `central=${r.central} zone=${r.zone}`);
ok(/존은 안 건드렸다/.test(r.out), '이유를 화면에 말한다(조용히 건너뛰지 않는다)');

console.log('\n② ★자명 통과 금지 — 필요할 땐 반드시 한다');
r = run('server/zone.js');
ok(r.zone && r.central, '`server/zone.js` → 존도 굽는다', `zone=${r.zone}`);
r = run('sim/path-core.js');
ok(r.zone, '`sim/**` → 존도 굽는다');
r = run('package.json');
ok(r.zone && r.central, '`package.json` → 둘 다(의존성은 두 이미지에 다 들어간다)');
r = run('public/index.html server/zone.js');
ok(r.zone && r.central, '섞여 있으면 둘 다');

console.log('\n③ 아무것도 안 해도 되는 경우');
r = run('README.md 다음세션_인계.md');
ok(!r.zone && !r.central, '문서만 바뀌면 아무것도 안 굽는다');
ok(/할 일이 없다/.test(r.out), '그리고 그렇게 말한다');

console.log('\n④ 모르면 안전한 쪽 — 전부 한다');
r = run('public/client.js', { stamp: false });
ok(r.zone && r.central, '스탬프가 없으면(첫 실행·지난 배포 실패) **전부** 한다',
   '기준점을 모르는데 건너뛰면 빠뜨린다');

console.log('\n⑤ 손으로 덮어쓰기');
r = run('public/client.js', { args: ['--all'] });
ok(r.zone && r.central, '`--all` 은 판정을 무시하고 전부');
r = run('README.md', { args: ['--zone'] });
ok(r.zone, '`--zone` 은 판정이 "필요 없다"여도 존을 한다');
try { run('x', { args: ['--오타'] }); ok(false, '모르는 옵션은 거부해야 한다'); }
catch (e) { ok(true, '모르는 옵션은 조용히 넘어가지 않고 죽는다', 'exit≠0'); }

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
