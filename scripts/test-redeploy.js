#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
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
  "rev-parse @{u}") echo "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; exit 0 ;;   # [T892] --dry 의 받을 판
  "rev-parse --short=12") echo "aaaaaaaaaaaa"; exit 0 ;;
  "rev-list --count") echo 3; exit 0 ;;
  "pull ") echo "pull" >> "$FAKE_LOG"; exit 0 ;;   # [T892] 받았나를 센다(--dry 는 0)
  "cat-file -e") [ -n "$FAKE_STAMP_VALID" ] && exit 0 || exit 1 ;;
  "diff --name-only") printf '%s\\n' $FAKE_CHANGED; exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
// ★가짜 docker 는 **자기가 무엇을 하라고 불렸는지 파일에 적는다**(족보 57 — 행동을 센다)
fs.writeFileSync(path.join(BIN, 'docker'), `#!/bin/sh
case "$1" in
  build) echo "$*" >> "$FAKE_LOG" ;;
  stop|rm|run) [ -n "$FAKE_HOST" ] && echo "$FAKE_HOST docker $*" >> "$FAKE_LOG" ;;   # ★[T940] ⑦ 재생성 차례(호스트 · 무엇을) — ⑦ 판만 FAKE_HOST 를 준다(①~⑥ 기록 무변)
  ps) case "$*" in
        *-a*) if [ "$FAKE_HOST" = tokyo ]; then echo durango-zone-nippon; else printf 'durango-central\ndurango-zone-hanbando\n'; fi ;;   # recreate() 의 존재 확인용(이름만) · [T1048] 도쿄 = 닛폰(⑧ 경계 줄이 도쿄 존 이름을 읽는다)
        *)    printf 'durango-central\tUp 1 second\ndurango-zone-hanbando\tUp 1 second\n' ;;
      esac ;;
  inspect) case "$*" in *nippon*) printf 'CENTRAL_HOST=10.0.0.1\nPLAYER_CAP=50\nPORT=3021\n' ;; *durango-zone-hanbando*Config.Env*) printf 'PORT=3020\nZONE_HOST_NIPPON=203.0.113.9\n' ;; *) echo "PORT=3010" ;; esac ;;   # [T940] 도쿄 옛 존 칸(update-live ⑤ 가 읽는다) · [T1048] 한반도 env 에 이웃 주소 키(⑧ 경계 줄)
  exec) echo "ok 대역 · :3021/health 200 · 1ms" ;;   # [T1048] ⑧ 경계 줄 — 존 안에서 이웃 /health(이 판은 대역 답 · 진짜 길은 test-xhost-env)
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
  let stampAfter = null; try { stampAfter = fs.readFileSync(STAMP, 'utf8').trim(); } catch (e) {}
  return { out, zone: /Dockerfile\.zone/.test(built), central: /Dockerfile\.central/.test(built), pulled: /^pull$/m.test(built), stampAfter };
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

console.log('\n⑥ ★[T892] 예행 `--dry` — 같은 판정 · 아무것도 안 한다(받기 · 빌드 · 재생성 · 스탬프 0) · 끝 줄 PLAN');
r = run('server/zone.js');
ok(r.pulled && r.zone, '[상황] 예행 아닌 판은 받는다(pull 1 · 빌드) — 아래 "pull 0" 이 자명하지 않다는 증인');
r = run('server/zone.js', { args: ['--dry'] });
ok(!r.zone && !r.central && !r.pulled && r.stampAfter === 'a'.repeat(40) && /^PLAN central=1 zone=1 after=b{40}$/m.test(r.out) && /central: 한다  ·  zone: 한다/.test(r.out),
   '`server/zone.js` 예행 → PLAN central=1 zone=1 · 판정 줄은 실제 판과 같은 글자 · 빌드 0 · pull 0 · 스탬프 그대로', `pull ${r.pulled} · 스탬프 ${String(r.stampAfter).slice(0, 8)}`);
r = run('public/client.js', { args: ['--dry'] });
ok(/^PLAN central=1 zone=0 /m.test(r.out) && !r.central && !r.zone, '`public/client.js` 예행 → PLAN central=1 zone=0(실제 판 ① 과 같은 판정)');
r = run('README.md', { args: ['--dry'] });
ok(/^PLAN central=0 zone=0 /m.test(r.out), '문서만 → PLAN central=0 zone=0(실제 판 ③ 과 같은 판정)');
r = run('public/client.js', { stamp: false, args: ['--dry'] });
ok(/^PLAN central=1 zone=1 /m.test(r.out) && r.stampAfter === null, '스탬프 없음 예행 → 전부(PLAN 1 1) · 스탬프를 만들지도 않는다');

// ★★[T940 2026-10-26 · T927 회부 1] ⑦ 배포 차례 — **central 이 존보다 먼저 새 판으로 뜬다**(라이브 갱신 한 줄 `update-live.sh` 를 통째로 돌린다).
//   T927(몸 버전 조건부 쓰기)은 central 이 칸을 알아야 일한다 — 옛 central 은 `sv` 를 몸 칸에 넣어 두기만 한다(해 0 · 거르기 0). 존이 먼저 새 판이 되면 그 사이
//   거르는 central 이 없고, 존이 SIGTERM 에 쏘는 종료 flush(`_shutdownFlush`)가 옛 central 에 닿는다. 그래서 차례 = 서울 central 재생성 → 서울 한반도 내림(종료 flush 가
//   **새** central 에 닿는다) · 재생성 → 도쿄 닛폰. 가짜 `ssh`(호스트 이름을 떼고 이 셸에서 돈다) · 가짜 `docker`(호스트 · 무엇을 적는다) · 진짜 `update-live.sh` ·
//   진짜 `redeploy-hanbando.sh`(판정 · 재생성 그대로) · 그 밖의 줄(reset-world · sync-tokyo · live-lag · redeploy-light)은 부름만 적는 대역.
//   미끼: `redeploy-hanbando.sh` 의 재생성 두 줄 차례만 바꾼 사본(존 먼저) — 같은 자가 그 판을 **잡아야** 한다(자명 통과 금지).
console.log('\n⑦ ★[T940] 배포 차례 — update-live 한 줄이 central 을 존보다 먼저 새 판으로 띄운다(서울 central → 서울 한반도 → 도쿄 닛폰)');
function liveOrder(decoy) {
  const L = path.join(TMP, 'live-' + (decoy ? 'decoy' : 'real')), SE = path.join(L, 'seoul'), TO = path.join(L, 'tokyo'), LB = path.join(L, 'bin');
  for (const d of [path.join(SE, 'scripts'), path.join(TO, 'scripts'), LB]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(LB, 'ssh'), '#!/bin/bash\n[ "$1" = -n ] && shift\nh="$1"; shift\nexport FAKE_HOST="$h"\nexec bash -c "$*"\n', { mode: 0o755 });
  const stub = (dir, name, body) => fs.writeFileSync(path.join(dir, 'scripts', name), `#!/bin/bash\necho "\${FAKE_HOST:-mac} ${name} $*" >> "$FAKE_LOG"\n${body || ''}\nexit 0\n`, { mode: 0o755 });
  for (const d of [SE, TO]) stub(d, 'reset-world.sh', 'echo "  관측 ok"');
  stub(SE, 'sync-tokyo.sh', 'echo "  ✓ 두 줄이 같다"'); stub(SE, 'live-lag.sh', 'echo "== lag"; echo "  판정 ok"');
  //   ★[T919 뒤] ⓪ 갱신 앞 — 디스크 판정(끝 줄) · 스냅샷(서울 판을 그 호스트 `bash -s` 에 흘린다)도 부름만 적는 대역
  stub(SE, 'disk-check.sh', 'echo "[seoul]"; echo "  판정: ok"; echo "판정: 두 호스트 모두 빈 자리 ≥ 백업 한 벌"');
  stub(SE, 'backup-live.sh', 'echo "  ✓ 대역 사본"');
  stub(TO, 'redeploy-light.sh', 'echo "[light] RUN_ZONES=$RUN_ZONES"');
  let rh = fs.readFileSync(path.join(ROOT, 'scripts', 'redeploy-hanbando.sh'), 'utf8');
  const cL = /^if \[ "\$DO_CENTRAL" = 1 \]; then recreate durango-central .*$/m, zL = /^if \[ "\$DO_ZONE" = 1 \]; then recreate durango-zone-hanbando .*$/m;
  const lines = [cL.exec(rh), zL.exec(rh)];
  if (decoy && lines[0] && lines[1]) rh = rh.replace(lines[0][0], '__C__').replace(lines[1][0], lines[0][0]).replace('__C__', lines[1][0]);
  fs.writeFileSync(path.join(SE, 'scripts', 'redeploy-hanbando.sh'), rh, { mode: 0o755 });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'update-live.sh'), path.join(SE, 'scripts', 'update-live.sh'));
  const ST = path.join(L, 'stamp'), TST = path.join(L, 'tstamp'), LOGL = path.join(L, 'log');
  fs.writeFileSync(ST, 'a'.repeat(40) + '\n'); fs.writeFileSync(TST, 'a'.repeat(40) + '\n'); fs.writeFileSync(LOGL, '');
  let out = '', rc = 0;
  try {
    out = execFileSync('bash', [path.join(SE, 'scripts', 'update-live.sh')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: LB + ':' + BIN + ':' + process.env.PATH,
      SYNC_SEOUL: 'seoul', SYNC_TOKYO: 'tokyo', SYNC_SEOUL_DIR: SE, SYNC_TOKYO_DIR: TO, TOKYO_STAMP: TST, SEOUL_STAMP: ST, REPO_DIR: SE, STAMP: ST,
      FAKE_STAMP_VALID: '1', FAKE_CHANGED: 'server/central.js server/zone.js', FAKE_LOG: LOGL } });
  } catch (e) { rc = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
  const log = fs.readFileSync(LOGL, 'utf8').split('\n').filter(Boolean);
  const at = (re) => log.findIndex((l) => re.test(l));
  const o = { rc, out, log, swapped: !!(lines[0] && lines[1]),
    cRun: at(/^seoul docker run .*--name durango-central /), hStop: at(/^seoul docker stop durango-zone-hanbando$/), hRun: at(/^seoul docker run .*--name durango-zone-hanbando /),
    tLight: at(/^tokyo redeploy-light\.sh/) };
  o.order = o.cRun >= 0 && o.hStop > o.cRun && o.hRun > o.hStop && o.tLight > o.hRun;
  return o;
}
{
  const R = liveOrder(false), D = liveOrder(true);
  ok(R.rc === 0 && /✓ 끝 — 서울/.test(R.out), '[상황] 대역 판에서 update-live 한 줄이 끝까지 돈다(① 받기 · ② 판정 · ③ 서울 · ④ 도쿄 코드 · ⑤ 도쿄 · ⑥ · ⑦)', `rc ${R.rc} · 기록 ${R.log.length}줄`);
  ok(R.cRun >= 0 && R.hRun >= 0 && R.tLight >= 0 && /PLAN|central: 한다/.test(R.out),
    '[상황] `server/central.js` · `server/zone.js` 가 바뀐 갱신(T927 꼴) — 셋 다 다시 띄운다(central · 한반도 · 닛폰)', `central #${R.cRun} · 한반도 #${R.hRun} · 닛폰 #${R.tLight}`);
  ok(R.order, '★★⑦ [T940] 차례: 서울 central 새 판 → 서울 한반도 내림(종료 flush 가 새 central 에 닿는다) → 한반도 새 판 → 도쿄 닛폰 — central 이 존보다 먼저(T927 회부 1)',
    `central run #${R.cRun} < 한반도 stop #${R.hStop} < 한반도 run #${R.hRun} < 닛폰 #${R.tLight}`);
  ok(D.swapped && !D.order, '⑦ [T940 · 자명 통과 금지] 미끼(재생성 두 줄 차례만 바꾼 사본 — 존 먼저)는 같은 자가 잡는다',
    `미끼: central run #${D.cRun} · 한반도 stop #${D.hStop} · rc ${D.rc}`);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
