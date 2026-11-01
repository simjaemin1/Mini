#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-update-snap.js — `update-live.sh` 의 갱신 앞 디스크 · 스냅샷(T919 · 2026-10-25)을 **진짜 스크립트로** 돌린다 ==============
//
// 판정 사본 0: 진짜 `update-live.sh` 를 돌리고, 호스트 쪽만 흉내 낸다 —
//   진짜 git(맨 저장소 하나 · 서울 · 도쿄 클론) · 가짜 `ssh`(별칭 → FAKE_HOST 로 그 자리 bash) · 가짜 `docker`(상태 JSON)
//   · 서울 클론의 `scripts/` 에 호스트 스크립트 흉내(disk-check · backup-live · redeploy-hanbando · reset-world · sync-tokyo · live-lag)
//   — 흉내는 부른 차례를 한 기록 파일에 적는다(무엇이 무엇보다 **앞**인지가 이 카드의 판정이다).
//   지키는 것:
//     ① 디스크 판정이 bad 면 멈춘다 — 스냅샷 · pull · 고정 · 재배포 0(라이브 무변)
//     ② 갱신 — 스냅샷(서울 · 도쿄 · 라벨 `update-live <앞> <갱신>`)이 pull · 고정 · 재배포 **앞**이다 · "바뀐 것" 에 든다
//     ③ 바꿀 것 0 — 스냅샷 안 뜬다(②-고정과 같은 판정) · 서울만 바뀌면 서울만
//     ④ 스냅샷 ✗ — 그 자리에서 멈춘다(pull · 고정 · 재배포 0)
//     ⑤ --dry — 디스크 줄 · 스냅샷 자리 줄(backup-live --dry) · 쓰는 일 0
//     ⑥ ⓪ 과 ① 사이에 main 이 움직이면 멈춘다(라벨 판 ≠ 받은 판)
//     ⑦ --rollback(--dry) — 대상마다 "갱신 앞 스냅샷" 자리 · 되놓기 줄(T907 꼴) · 이 갱신 커밋이면 그렇다고 · DB 무접촉
//     ⑧ 미끼 — 디스크 멈춤 줄을 뺀 사본은 ① 에서 pull 까지 간다(① 이 문다)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'update-live.sh');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'updsnap-'));
const BIN = path.join(TMP, 'bin'), ORIGIN = path.join(TMP, 'origin.git'), SD = path.join(TMP, 'seoul'), TD = path.join(TMP, 'tokyo');
const LOG = path.join(TMP, 'calls.log'), SNAPS = path.join(TMP, 'snaps.tsv'), STATE = path.join(TMP, 'docker.json'), TSTAMP = path.join(TMP, 'deployed-nippon.sha'), SSTAMP = path.join(TMP, 'deployed-hanbando.sha');
fs.mkdirSync(BIN, { recursive: true });
const sh = (cmd, cwd) => execFileSync('bash', ['-c', cmd], { cwd: cwd || TMP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const G = 'git -c user.name=t -c user.email=t@t';

fs.writeFileSync(path.join(BIN, 'ssh'), `#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -[oipFlJ]) shift 2 ;; -*) shift ;; *) break ;; esac; done
h=$1; shift
FAKE_HOST="$h" exec bash -c "$*"
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'docker'), `#!/usr/bin/env node
'use strict';
const fs = require('fs'); const S = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8')); const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, process.env.FAKE_HOST + ' docker ' + a.join(' ') + '\\n');
const fi = a.indexOf('--format'); const f = fi >= 0 ? a[fi + 1] : null;
if (a[0] === 'inspect' && a[1] === 'durango-zone-hanbando' && /Config\\.Env/.test(f || '')) return console.log('PORT=3020\\nZONE_HOST_NIPPON=203.0.113.9');   // ★[PM land1036 · T1048] ⑧ 경계 줄이 한반도 env 키를 본다(값은 대역)
if (a[0] === 'inspect' && /Config\\.Env/.test(f || '')) return console.log('PLAYER_CAP=150\\nCENTRAL_HOST=10.9.9.9\\nZONE_SECRET=x');
if (a[0] === 'ps' && a.includes('-a') && /Names/.test(f || '')) return console.log(process.env.FAKE_HOST === 'tokyo' ? 'durango-zone-nippon' : 'durango-central\\ndurango-zone-hanbando');   // ★[T1048] ⑧ 이 도쿄 존 이름을 읽는다
if (a[0] === 'exec') return console.log('ok 대역 · :3021/health 200 · 1ms');   // ★[T1048] ⑧ 존 안에서 이웃 /health(대역 답 · 진짜 길은 test-xhost-env)
if (a[0] === 'inspect' && f === '{{.Image}}') return S.c[a[1]] ? console.log(S.c[a[1]]) : process.exit(1);
if (a[0] === 'image' && a[1] === 'inspect') { const n = a[2]; const id = S.tags[n] || (S.img[n] ? n : null); if (!id) process.exit(1);
  if (f === '{{.Id}}') return console.log(id); if (f && /durango\\.commit/.test(f)) return console.log(S.img[id] || '<no value>'); return console.log('[{}]'); }
process.stderr.write('가짜 docker: 모르는 꼴 ' + a.join(' ') + '\\n'); process.exit(9);
`, { mode: 0o755 });

// 호스트 스크립트 흉내 — 서울 클론의 scripts/ 에(커밋해서 도쿄도 같은 판)
const STUB = {
  'disk-check.sh': `#!/usr/bin/env bash
echo "== disk-check 흉내 =="
for h in seoul tokyo; do echo "[$h($h)]"; if [ "\${FAKE_DISK_BAD:-}" = "$h" ]; then echo "  판정: 빈 자리 60.0 MB < 백업 한 벌 165.5 MB(흉내)"; else echo "  판정: 빈 자리 3.6 GB ≥ 백업 한 벌 165.5 MB(흉내)"; fi; done
if [ -n "\${FAKE_DISK_BAD:-}" ]; then echo "판정: $FAKE_DISK_BAD 빈 자리 60.0 MB < 백업 한 벌 165.5 MB"; else echo "판정: 두 호스트 모두 빈 자리 ≥ 백업 한 벌"; fi
echo "disk-check" >> "$FAKE_LOG"`,
  'backup-live.sh': `#!/usr/bin/env bash
H="\${FAKE_HOST:-?}"; ts=$(date -u +%Y%m%d-%H%M%S)
case "\${1:-}" in
  --dry) echo "$H backup --dry label=\${BACKUP_LABEL:-}" >> "$FAKE_LOG"; echo "== 스냅샷 예행 흉내 =="; echo "  · 대상 → /srv/durango/_daily/$ts-x"; exit 0 ;;
  --last) awk -F'\\t' -v h="$H" -v t="$2" -v p="\${3:-}" '$1==h && $2==t && index($5,p)==1 {l=$3 "\\t" $4 "\\t" $5} END{if(l=="") exit 1; print l}' "$FAKE_SNAPS"; exit $? ;;
esac
echo "$H backup label=\${BACKUP_LABEL:-}" >> "$FAKE_LOG"
[ "\${FAKE_BACKUP_FAIL:-}" = "$H" ] && { echo "  ✗ durango-zone-x — 백업 실패: 흉내"; exit 1; }
[ "\${FAKE_RACE:-}" = 1 ] && [ "$H" = tokyo ] && ( cd "$FAKE_PUSHER" && echo r >> race.txt && git -c user.name=t -c user.email=t@t commit -qam race -q 2>/dev/null || { git add race.txt; git -c user.name=t -c user.email=t@t commit -qm race; }; git push -q origin HEAD:main )
if [ "$H" = seoul ]; then T="central hanbando"; else T="nippon"; fi
for t in $T; do printf '%s\\t%s\\t%s\\t%s\\t%s\\n' "$H" "$t" "/srv/durango/_daily/$ts-$t" "2026-10-25T00:00:00Z" "\${BACKUP_LABEL:-}" >> "$FAKE_SNAPS"; echo "  ✓ $t → /srv/durango/_daily/$ts-$t · 검사 ok"; done`,
  'redeploy-hanbando.sh': `#!/usr/bin/env bash
if [ "\${1:-}" = --dry ]; then git fetch -q; A=$(git rev-parse @{u})
  if [ -n "\${STAMP:-}" ]; then echo "[판정] 흉내(도쿄)"; echo "PLAN central=0 zone=\${FAKE_TZ:-0} after=$A"
  else echo "[판정] 흉내(서울)"; echo "PLAN central=\${FAKE_SC:-1} zone=\${FAKE_SZ:-1} after=$A"; fi; exit 0; fi
echo "redeploy" >> "$FAKE_LOG"; git pull -q --ff-only; echo "central: 한다 · zone: 한다"`,
  'reset-world.sh': `#!/usr/bin/env bash
echo "$FAKE_HOST reset-world $*" >> "$FAKE_LOG"; case "$2" in --live) echo "  관측 흉내 ok" ;; --pin-prev) echo "  ✓ 고정 흉내" ;; esac`,
  'sync-tokyo.sh': `#!/usr/bin/env bash
echo "sync-tokyo \${SYNC_COMMIT:-}" >> "$FAKE_LOG"; H=$(git -C "$SYNC_SEOUL_DIR" rev-parse HEAD)
git -C "$SYNC_TOKYO_DIR" fetch -q origin && git -C "$SYNC_TOKYO_DIR" checkout -qf "\${SYNC_COMMIT:-$H}"; echo "  ✓ 두 줄이 같다"`,
  'live-lag.sh': `#!/usr/bin/env bash
echo "== live-lag 흉내 =="; echo "  판정: 흉내 — 문턱 아래"`,
};
function fresh(env) {
  for (const d of [ORIGIN, SD, TD, path.join(TMP, 'pusher')]) fs.rmSync(d, { recursive: true, force: true });
  for (const f of [LOG, SNAPS, TSTAMP, SSTAMP]) fs.rmSync(f, { force: true }); fs.writeFileSync(LOG, ''); fs.writeFileSync(SNAPS, '');
  sh(`git init -q --bare -b main ${ORIGIN} && git clone -q ${ORIGIN} ${SD} 2>/dev/null`);
  fs.mkdirSync(path.join(SD, 'scripts'), { recursive: true });
  for (const [n, b] of Object.entries(STUB)) fs.writeFileSync(path.join(SD, 'scripts', n), b + '\n', { mode: 0o755 });
  fs.writeFileSync(path.join(SD, 'world.txt'), 'v1\n');
  sh(`${G} add -A && ${G} commit -qm A && git push -q origin HEAD:main && git branch -u origin/main >/dev/null`, SD);
  sh(`git clone -q ${ORIGIN} ${TD} && git clone -q ${ORIGIN} ${TMP}/pusher`);
  sh(`echo v2 > world.txt && ${G} commit -qam B && git push -q origin HEAD:main`, path.join(TMP, 'pusher'));
  const A = sh('git rev-parse HEAD', SD), B = sh('git rev-parse origin/main', path.join(TMP, 'pusher'));
  fs.writeFileSync(SSTAMP, A + '\n'); fs.writeFileSync(TSTAMP, A + '\n');   // 두 호스트에 지금 배포된 판 = A
  fs.writeFileSync(STATE, JSON.stringify({ c: { 'durango-central': 'sha256:c1', 'durango-zone-hanbando': 'sha256:h1', 'durango-zone-nippon': 'sha256:n1' },
    img: { 'sha256:c1': B, 'sha256:h1': A, 'sha256:n1': B, 'sha256:c0': A, 'sha256:h0': A, 'sha256:n0': A },
    tags: { 'durango-central:prev-central': 'sha256:c0', 'durango-zone:prev-hanbando': 'sha256:h0', 'durango-zone:prev-nippon': 'sha256:n0' } }));
  return { A, B };
}
function run(args, env, script) {
  const E = Object.assign({}, process.env, { PATH: `${BIN}:${process.env.PATH}`, FAKE_LOG: LOG, FAKE_SNAPS: SNAPS, FAKE_STATE: STATE, FAKE_PUSHER: path.join(TMP, 'pusher'),
    SYNC_SEOUL_DIR: SD, SYNC_TOKYO_DIR: TD, TOKYO_STAMP: TSTAMP, SEOUL_STAMP: SSTAMP }, env || {});
  try { return { out: execFileSync('bash', [script || SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: E }), rc: 0 }; }
  catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), rc: e.status }; }
}
const calls = () => fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
const idx = (re) => calls().findIndex((l) => re.test(l));
const head = () => sh('git rev-parse HEAD', SD);

console.log('\n=== update-live 갱신 앞 디스크 · 스냅샷(T919) ===\n① 디스크 bad → 멈춤');
let K = fresh(); let r = run([], { FAKE_DISK_BAD: 'seoul' });
ok(r.rc === 1 && /\[⓪ 디스크\] ✗ — seoul 빈 자리 60\.0 MB < 백업 한 벌/.test(r.out) && /멈췄다 — 디스크 ✗\(위 \[⓪ 디스크\] 줄\)/.test(r.out) && /바뀐 것: 없음\(라이브 무변\)/.test(r.out),
  '★빈 자리 < 백업 한 벌 → 멈춤 · 이유 한 줄(disk-check 판정 그대로) · 바뀐 것 없음', (r.out.match(/✗ 멈췄다.*$/m) || [''])[0].slice(0, 90));
ok(head() === K.A && idx(/backup label=/) < 0 && idx(/reset-world|redeploy$/) < 0, '스냅샷 · pull · 고정 · 재배포 0(서울 HEAD 그대로)');

console.log('\n② 갱신 — 스냅샷이 맨 앞');
K = fresh(); r = run([], { FAKE_SC: '1', FAKE_SZ: '1', FAKE_TZ: '0' });
const L = `update-live ${K.A} ${K.B}`;
const bS = idx(/^seoul backup label=/), pin = idx(/reset-world (central|hanbando) --pin-prev/), red = idx(/^redeploy$/), syn = idx(/^sync-tokyo/);
ok(r.rc === 0 && calls()[bS] === `seoul backup label=${L}` && /✓ 끝 — /.test(r.out), '★서울 스냅샷 라벨 = `update-live <서울에 배포된 판(스탬프)> <받을 판>`(전체 해시)', calls()[bS]);
ok(bS >= 0 && pin > bS && red > bS && syn > bS && head() === K.B, '★스냅샷이 고정 · 재배포 · 도쿄 받기 **앞**이다(그다음 종전 차례)', `스냅샷 ${bS} · 고정 ${pin} · 재배포 ${red} · 받기 ${syn}`);
ok(idx(/^tokyo backup label=/) < 0 && /\[⓪ 스냅샷\][\s\S]*도쿄 — 안 뜬다/.test(r.out), '도쿄는 바뀔 것이 없어(zone=0) 안 뜬다');
ok(/바뀐 것: 서울 스냅샷 2벌 → 서울 코드 /.test(r.out), '"바뀐 것" 맨 앞에 서울 스냅샷 2벌', (r.out.match(/바뀐 것: .{0,60}/) || [''])[0]);
ok(idx(/disk-check/) >= 0 && idx(/disk-check/) < bS, '디스크 판정이 스냅샷보다 앞');
K = fresh(); r = run([], { FAKE_SC: '0', FAKE_SZ: '0', FAKE_TZ: '1' });
ok(idx(/^tokyo backup label=update-live /) >= 0 && idx(/^seoul backup label=/) < 0, '도쿄만 바뀌면(zone=1) 도쿄만 뜬다(서울 central · 한반도 무변)', calls().filter((l) => /backup/.test(l)).join(' | ').slice(0, 80));

K = fresh(); fs.rmSync(SSTAMP); r = run([], { FAKE_SC: '1', FAKE_SZ: '0', FAKE_TZ: '0' });
ok(calls()[idx(/^seoul backup label=/)] === `seoul backup label=update-live - ${K.B}`, '서울 스탬프가 없으면 앞 칸은 `-`(모른다 — 지어내지 않는다)', calls()[idx(/^seoul backup label=/)]);

console.log('\n③ 바꿀 것 0 — 안 뜬다');
K = fresh(); r = run([], { FAKE_SC: '0', FAKE_SZ: '0', FAKE_TZ: '0' });
ok(r.rc === 0 && /\[⓪ 스냅샷\] 안 뜬다 — 바꿀 것 0/.test(r.out) && idx(/backup/) < 0, '★②-고정과 같은 판정 — 바꿀 것 0 이면 스냅샷 0(매일 사본 보관 칸을 안 먹는다)');

console.log('\n④ 스냅샷 ✗ → 멈춤');
K = fresh(); r = run([], { FAKE_SC: '1', FAKE_SZ: '1', FAKE_TZ: '1', FAKE_BACKUP_FAIL: 'tokyo' });
ok(r.rc === 1 && /멈췄다 — 도쿄 갱신 앞 스냅샷\(backup-live rc 1\)/.test(r.out) && head() === K.A && idx(/reset-world|^redeploy$|^sync-tokyo/) < 0,
  '★도쿄 스냅샷이 ✗ 면 그 자리에서 멈춘다 — pull · 고정 · 재배포 · 받기 0', (r.out.match(/바뀐 것: .*$/m) || [''])[0]);

console.log('\n⑤ --dry — 두 줄 · 쓰는 일 0');
K = fresh(); r = run(['--dry'], { FAKE_SC: '1', FAKE_SZ: '1', FAKE_TZ: '1' });
ok(r.rc === 0 && /^\[⓪ 디스크\] ok — 두 호스트 모두/m.test(r.out) && new RegExp(`^\\[⓪ 스냅샷\\] 갱신 ${K.A.slice(0, 12)}\\(서울 스탬프\\) · ${K.A.slice(0, 12)}\\(도쿄 스탬프\\) → ${K.B.slice(0, 12)} — 뜰 자리:`, 'm').test(r.out), '★--dry 에도 디스크 판정 줄 · 스냅샷 자리 줄(배포된 판 → 받을 판)');
ok(calls()[idx(/^seoul backup --dry/)] === `seoul backup --dry label=update-live ${K.A} ${K.B}` && idx(/^tokyo backup --dry/) >= 0 && idx(/backup label=/) < 0 && head() === K.A && idx(/reset-world|^redeploy$/) < 0 && !fs.readFileSync(SNAPS, 'utf8'),
  '뜰 자리는 backup-live --dry 그대로 · 사본 · pull · 고정 · 재배포 0');
r = run(['--dry'], { FAKE_SC: '1', FAKE_SZ: '1', FAKE_DISK_BAD: 'tokyo' });
ok(r.rc === 0 && /\[⓪ 디스크\] ✗/.test(r.out) && /디스크 ✗ — 실제 판은 여기서 멈춘다/.test(r.out), '--dry 는 디스크 ✗ 여도 끝까지 보여 주되 "실제 판은 여기서 멈춘다" 를 찍는다');

console.log('\n⑥ ⓪ 과 ① 사이에 main 이 움직이면');
K = fresh(); r = run([], { FAKE_SC: '1', FAKE_SZ: '1', FAKE_TZ: '1', FAKE_RACE: '1' });
ok(r.rc === 1 && /멈췄다 — 받은 판 [0-9a-f]{12} ≠ ⓪ 판정 · 스냅샷 라벨의 판/.test(r.out) && idx(/reset-world|^redeploy$/) < 0,
  '★라벨 판 ≠ 받은 판 → 고정 · 재배포 앞에서 멈춘다(다시 치면 ⓪ 부터 새 판)');

console.log('\n⑦ --rollback — 갱신 앞 스냅샷 자리');
K = fresh(); run([], { FAKE_SC: '1', FAKE_SZ: '1', FAKE_TZ: '1' });
fs.writeFileSync(LOG, '');
r = run(['--rollback', '--dry']);
const sl = (t) => (r.out.match(new RegExp(`^    (서울|도쿄) ${t} — .*$`, 'm')) || [''])[0];
ok(r.rc === 0 && /^\[되돌리기 · 갱신 앞 스냅샷\] DB 는 안 건드린다/m.test(r.out) && /_daily\/\d{8}-\d{6}-central/.test(sl('central')) && /_daily\/\d{8}-\d{6}-hanbando/.test(sl('hanbando')) && /_daily\/\d{8}-\d{6}-nippon/.test(sl('nippon')),
  '★대상 셋마다 "이 갱신 앞" 사본 자리(라벨 update-live 인 가장 새 것)', sl('hanbando').trim().slice(0, 80));
ok(/= 지금 이미지 커밋\(이 갱신\)/.test(sl('central')) && /= 지금 이미지 커밋\(이 갱신\)/.test(sl('nippon')) && /그 갱신 커밋과 다르다/.test(sl('hanbando')),
  '지금 이미지 커밋 = 라벨의 갱신 커밋이면 "이 갱신" · 아니면 다르다고(흉내: 한반도 이미지만 앞 커밋)');
ok(/ssh -t seoul 'cd .* && bash scripts\/backup-live\.sh hanbando --restore \/srv\/durango\/_daily\/\d{8}-\d{6}-hanbando'  # 답: hanbando/.test(r.out) && /ssh -t tokyo 'cd .*tokyo && bash scripts\/backup-live\.sh nippon --restore/.test(r.out),
  '되놓기 줄 = T907 `--restore` 꼴 그대로(대상 · 폴더 · 답) — 재민이 고르는 줄(찍기만)');
ok(idx(/reset-world/) < 0 && idx(/backup label=/) < 0, '--rollback --dry — reset-world 0 · 사본 0(라이브 무변)');
fs.writeFileSync(SNAPS, ''); r = run(['--rollback', '--dry']);
ok(/서울 hanbando — 갱신 앞 사본 없음/.test(r.out), '사본이 없으면 "없음" 이라고(T919 앞 갱신)');

console.log('\n⑧ ★자명 통과 금지 — 디스크 멈춤 줄을 뺀 미끼');
K = fresh(); const BAIT = path.join(TMP, 'bait.sh');
const src = fs.readFileSync(SCRIPT, 'utf8'); const baited = src.split('\n').filter((l) => !/\[ "\$DOK" = 1 \] \|\| stop "디스크/.test(l)).join('\n');
fs.writeFileSync(BAIT, baited); r = run([], { FAKE_DISK_BAD: 'seoul', FAKE_SC: '1', FAKE_SZ: '1', FAKE_TZ: '0' }, BAIT);
ok(baited !== src && head() !== K.A && idx(/^seoul backup label=/) >= 0, '[미끼] 멈춤 줄을 뺀 사본은 디스크 ✗ 에도 스냅샷 · pull 까지 간다 — ① 이 문다', `rc=${r.rc}`);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
