#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-xhost-env.js — 서울 한반도 env 의 `ZONE_HOST_NIPPON` 이 재배포에 안 빠진다 · 빠지면 갱신 끝 줄이 ✗ 다 (T1048) ===========
//
// ★왜: 재민 11-01 "닛폰(으)로 못 넘어간다 — 저쪽 서버가 연결을 받지 않는다" = `_t564HandoffWhy` 거절(ECONNREFUSED) 갈래.
//   서울 한반도 컨테이너 env 에서 `ZONE_HOST_NIPPON`(T485 가 손으로 넣은 한 줄)이 빠지면 `hostFromEnv` 가 `ZONE_HOSTS[nippon]`(= 서울 IP)로 떨어지고
//   서울:3021 은 닫혀 있다. 빼는 길 = env 를 **새로 짓는** `redeploy-light.sh`(T538 의 서울 재배포 줄 `RUN_ZONES=hanbando bash scripts/redeploy-light.sh`) ·
//   그 뒤 env 를 **옮겨 싣는** 재배포(redeploy-hanbando · reset-world)는 빠진 채로 잇는다.
//
// ★`test-redeploy-light` · `test-redeploy` 문법 — **진짜 스크립트를 돌린다**(판정 사본 0). 가짜 `docker`(옛 컨테이너 env = 픽스처 파일 ·
//   `docker exec` 는 그 env 로 이 레포 트리에서 진짜 node 를 돌린다 = 존 컨테이너 안의 `server/zone-config.js` 정본) · 가짜 `ssh`(호스트 이름을 떼고 이 셸에서).
//   이웃 존 = 자식 프로세스 http 하나(127.0.0.2:3021 `/health` 200) · 닫힌 자리 = 127.0.0.3/127.0.0.4:3021(아무도 안 듣는다).
//   Ⓐ redeploy-light — 옛 컨테이너의 `ZONE_HOST_*` 를 이어 싣는다(EXTRA_ENV 가 이긴다 · 옛 컨테이너 없으면 안 싣는다) · 그 env 로 존이 보는 닛폰 주소 = 이어 실은 값
//   Ⓑ update-live ⑧ — 키 있음 + 닿음 = ✓ · rc 0 / 키 없음 = ✗ · rc 1(멈춤) / 키 있는데 닫힘(옛 IP) = ✗ / 키 없고 ZONE_HOSTS 로는 닿음 = ✗(키가 정본) / `--dry` 도 줄을 찍는다
//      · 화면에 env **값**(주소)과 비밀 0
//   Ⓡ 재현(대상 판과 무관 · 상황 줄) — redeploy-light 꼴 env(ZONE_HOSTS 26 = CENTRAL_IP · 키 없음) → 존이 보는 닛폰 = CENTRAL_IP:3021 → 접속 = ECONNREFUSED
//      → `_t564HandoffWhy`(zone.js 글자 그대로) = 까닭 `거절` · "저쪽 서버가 연결을 받지 않는다"
//   ★[T1077 · ★재민 11-02 "경계에서 연결 끊김으로 멈춘다"] 넓힘 — 브라우저 주소는 central `/zones`(`publicZoneMap(PUBLIC_HOST)`)가 준다:
//   Ⓑ⑨ ~ ⑬ update-live ⑧ 에 central `/zones` 줄(이웃 `wsUrl` 주소 = 존끼리 넘기는 주소 · 같음/다름만) · 도쿄 → 한반도 반대 줄(존 안에서 /health · 키는 안 요구)
//      — central env 에 키가 없거나(26존 표 = 서울) 빈 줄이면 ✗ · 멈춤 · 화면에 값 0
//   Ⓒ central 을 다시 만드는 길 — redeploy-hanbando recreate()(진짜 함수) · redeploy-all · reset-world 는 옛 env 를 통째로 옮긴다(`ZONE_HOST_*` 이어짐 · 없던 줄은 안 생긴다)
//   Ⓕ `fix-central-hosts.sh`(서울 · 재민 손 한 번) — `--dry` = 이름만 · 바꿈 0 / 없이 = central 하나만 같은 이미지 · 포트 · /data · 옛 env 그대로 + 빠진(빈) 줄 /
//      다른 값 = 손 안 댐(✗) · 존 둘이 다른 값 = 멈춤 · 끝에 central `/zones` 주소 = 존 줄 · 값 · 비밀은 화면 · 명령줄 0
// 실행: node scripts/test-xhost-env.js                    # 작업 트리의 두 스크립트
//       node scripts/test-xhost-env.js --against origin/main   # 그 커밋의 두 스크립트(고침 앞 = 빨강이어야 한다 — 자명 통과 금지 증인)
'use strict';
if (require.main === module) require('./lib-port').hold(3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ai = process.argv.indexOf('--against');
const AGAINST = ai > 0 ? process.argv[ai + 1] : null;
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xhtest-'));
const BIN = path.join(TMP, 'bin'); fs.mkdirSync(BIN);
const SHA = 'c'.repeat(40);
const OPEN = '127.0.0.2', SHUT = '127.0.0.3', SEOUL = '127.0.0.4', SECRET = 'zz-xhost-secret-' + Date.now();
const SEOUL_LIVE = '127.0.0.5';   // ★[T1077] 반대 방향 — 서울 한반도 대역(:3020 /health 200 · 자식 프로세스)
const subj = (f) => {   // 대상 스크립트 — 작업 트리 또는 --against 커밋
  if (!AGAINST) return path.join(ROOT, 'scripts', f);
  const p = path.join(TMP, 'against-' + f);
  try { fs.writeFileSync(p, execFileSync('git', ['show', `${AGAINST}:scripts/${f}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch (e) { fs.writeFileSync(p, `#!/bin/bash\necho "(${AGAINST} 에 scripts/${f} 없음)"\nexit 2\n`); }   // ★[T1077] 앞 트리에 없는 스크립트(fix-central-hosts) = 빨강 증인
  return p;
};

// ── 가짜 셋 ──────────────────────────────────────────────────────────────────────────────────────
//   ★[T1077] 컨테이너마다 env 파일 — 한반도 FAKE_OLDENV · central FAKE_CENTRALENV · 도쿄 닛폰 FAKE_TOKYOENV(도쿄 셸에서만) · run 은 -e 이름의 이 셸 값을 `<로그>.env` 에(docker 가 읽는 그 값)
fs.writeFileSync(path.join(BIN, 'docker'), `#!/bin/bash
envf() { case "$1" in durango-zone-hanbando) echo "\${FAKE_OLDENV:-}" ;; durango-central) echo "\${FAKE_CENTRALENV:-}" ;; durango-zone-nippon) [ "\${FAKE_HOST:-}" = tokyo ] && echo "\${FAKE_TOKYOENV:-}" ;; esac; }
case "$1" in
  run) echo "$*" >> "$FAKE_LOG"; p=""; for x in "$@"; do [ "$p" = -e ] && case "$x" in *=*) ;; *) echo "$x=\${!x}" >> "$FAKE_LOG.env" ;; esac; p="$x"; done ;;
  stop|rm) echo "$*" >> "$FAKE_LOG" ;;
  inspect) case "$*" in
      *Config.Env*) f="$(envf "$2")"; [ -n "$f" ] && [ -f "$f" ] && cat "$f" ;;
      *Health*) echo healthy ;;
      *State.Status*) echo running ;;
    esac ;;
  ps) case "$*" in *-a*) [ "\${FAKE_HOST:-}" = tokyo ] && echo durango-zone-nippon; [ "\${FAKE_HOST:-}" != tokyo ] && [ -n "\${FAKE_CENTRALENV:-}" ] && echo durango-central ;; *) printf 'durango-zone-hanbando\\tUp\\n' ;; esac ;;
  exec) shift; c="$1"; shift; f="$(envf "$c")"
        { [ -n "$f" ] && [ -f "$f" ]; } || { echo "Error response from daemon: No such container: $c" >&2; exit 1; }
        cd "$FAKE_APP" || exit 1
        while IFS= read -r kv; do [ -n "$kv" ] && export "$kv"; done < "$f"
        exec "$@" ;;
esac
exit 0
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'free'), '#!/bin/sh\necho "Mem: 1 1 1"\n', { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'git'), `#!/bin/sh
case "$1" in rev-parse) echo ${SHA} ;; log) echo "${SHA.slice(0, 12)} 대역" ;; esac
exit 0
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'ssh'), `#!/bin/bash
[ "$1" = -n ] && shift
if [ "$1" = -G ]; then [ "$2" = seoul ] && echo "hostname \${FAKE_SEOUL_ADDR:-}" || echo "hostname $FAKE_TOKYO_ADDR"; exit 0; fi   # ★[T1077] 서울 ssh 주소(반대 방향 줄)
h="$1"; shift; export FAKE_HOST="$h"
exec bash -c "$*"
`, { mode: 0o755 });
const baseEnv = () => ({ PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: TMP, FAKE_APP: ROOT, LANG: 'C.UTF-8' });
function oldEnv(lines) { const f = path.join(TMP, 'oldenv-' + Math.random().toString(36).slice(2)); if (lines) fs.writeFileSync(f, lines.join('\n') + '\n'); return f; }
const zh = (host) => 'ZONE_HOSTS=' + JSON.stringify({ hanbando: SEOUL, nippon: host, jungwon_n: SEOUL });
const HAN = (extra) => ['ZONE_ID=hanbando', 'PORT=3020', 'DB_PATH=/data/world-hanbando.db', 'CENTRAL_HOST=' + SEOUL, 'ENABLED_ZONES=hanbando,nippon,jungwon_n', 'PLAYER_CAP=150', 'CENTRAL_SECRET=' + SECRET, ...extra];   // lib-port: 묶지 않음(도커 env 픽스처 글자 — 이 판이 묶는 포트가 아니다)

// 이웃 존(자식 프로세스 — execFileSync 가 이 루프를 막아도 답한다)
function startNeighbor(port = 3021, host = OPEN) {   // ★[T1077] 서울 한반도 대역도 같은 꼴(:3020 · SEOUL_LIVE)
  return new Promise((res) => {
    const c = spawn(process.execPath, ['-e', `require('http').createServer((q,r)=>{r.writeHead(q.url==='/health'?200:404,{'Content-Type':'application/json'});r.end('{"ok":true}')}).on('error',e=>{console.log('ERR '+e.code);process.exit(1)}).listen(${port},'${host}',()=>console.log('UP'))`], { stdio: ['ignore', 'pipe', 'inherit'] });
    c.stdout.once('data', (d) => res({ c, up: String(d).startsWith('UP'), why: String(d).trim() }));
    c.on('exit', () => res({ c, up: false, why: 'exit' }));
  });
}
const refused = (host) => new Promise((res) => { const s = net.connect(3021, host); s.on('connect', () => { s.destroy(); res(false); }); s.on('error', (e) => res(e.code === 'ECONNREFUSED')); });
// docker run 줄의 -e 낱말 → env 표(값 있는 것만 · 이름만 넘긴 비밀은 이 셸 값)
function envOfRun(line) { const o = {}; const re = / -e (\S+)/g; let m; while ((m = re.exec(line))) { const kv = m[1]; const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); } return o; }
function zoneSees(env, id) {
  return JSON.parse(execFileSync(process.execPath, ['-e', `const t=require("./server/zone-config.js").ZONES[${JSON.stringify(id)}];console.log(JSON.stringify(t?{host:t.host,port:t.port,name:t.displayName}:null))`], { cwd: ROOT, env: { PATH: process.env.PATH, ...env } }).toString());
}

(async () => {
  const nb = await startNeighbor();
  const nbS = await startNeighbor(3020, SEOUL_LIVE);   // ★[T1077] 도쿄 → 한반도 반대 방향의 받는 쪽
  const pre = nb.up && nbS.up && (await refused(SHUT)) && (await refused(SEOUL));
  ok(pre, '[판] 이웃 존 127.0.0.2:3021 · 한반도 대역 127.0.0.5:3020 이 /health 에 답하고 127.0.0.3 · 127.0.0.4 :3021 은 닫혀 있다(3021 · 3020 을 잡은 다른 판이 없어야 한다)', `${nb.why} · ${nbS.why}`);
  console.log(`\n=== 대상: ${AGAINST ? AGAINST + ' 의 ' : '작업 트리의 '}redeploy-light.sh · update-live.sh ===`);

  // ── Ⓐ redeploy-light 이어 싣기 ─────────────────────────────────────────────────────────────────
  console.log('\nⒶ redeploy-light — 서울 한반도 재생성(`RUN_ZONES=hanbando` · T538 줄)이 옛 `ZONE_HOST_*` 를 이어 싣는다');
  const light = subj('redeploy-light.sh');
  function runLight(envLines, extra) {
    const log = path.join(TMP, 'run-' + Math.random().toString(36).slice(2)); fs.writeFileSync(log, '');
    let out = '';
    try { out = execFileSync('bash', [light], { env: { ...baseEnv(), FAKE_LOG: log, FAKE_OLDENV: oldEnv(envLines), RUN_ZONES: 'hanbando', CENTRAL_IP: SEOUL, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }
    catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    return { line: fs.readFileSync(log, 'utf8').trim(), out };
  }
  {
    const r = runLight(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + OPEN, 'CHAR_SPRITE=on']), {});
    const n = (r.line.match(/ -e ZONE_HOST_NIPPON=/g) || []).length;
    ok(n === 1 && r.line.includes(' -e ZONE_HOST_NIPPON=' + OPEN + ' '), '★Ⓐ① 옛 한반도에 `ZONE_HOST_NIPPON` 이 있으면 새 컨테이너에도 **한 번** 실린다', `-e ZONE_HOST_NIPPON ${n}개`);
    const sees = zoneSees(envOfRun(r.line), 'nippon');
    ok(!!sees && sees.host === OPEN && sees.port === 3021, '★Ⓐ② 그 env 로 존 정본(`hostFromEnv`)이 보는 닛폰 = 이어 실은 주소:3021(서울 IP 로 안 떨어진다)', sees ? `${sees.host === OPEN ? '이어 실은 주소' : sees.host === SEOUL ? 'CENTRAL_IP(서울)' : '다른 주소'}:${sees.port}` : '표에 없음');
    ok(/\[이어 싣기\] durango-zone-hanbando ← 옛 컨테이너 ZONE_HOST_NIPPON/.test(r.out) && !r.out.includes(OPEN) && !r.out.includes(SECRET), 'Ⓐ③ 화면엔 이어 실은 **이름**만(값 · 비밀 0)');
    ok(!/CHAR_SPRITE|CENTRAL_SECRET/.test(r.line), 'Ⓐ④ 이어 싣는 것은 `ZONE_HOST_*` 뿐 — 다른 옛 env 는 종전대로 안 싣는다(비밀은 셸 env 손잡이 그대로)');
  }
  {
    const r = runLight(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + SHUT]), { EXTRA_ENV: 'ZONE_HOST_NIPPON=' + OPEN });
    const all = r.line.match(/ -e ZONE_HOST_NIPPON=\S+/g) || [];
    ok(all.length === 1 && all[0].endsWith(OPEN), 'Ⓐ⑤ EXTRA_ENV 에 같은 이름이 있으면 EXTRA_ENV 가 이긴다(한 번 · 그 값)', `${all.length}개`);
  }
  {
    const r = runLight(null, {});
    ok(r.line.length > 0 && !/ZONE_HOST_/.test(r.line) && !/이어 싣기/.test(r.out), 'Ⓐ⑥ 옛 컨테이너가 없으면(첫 생성) 이어 실을 것 0 — 종전 그대로');
  }

  // ── Ⓑ update-live ⑧ 경계 줄 ─────────────────────────────────────────────────────────────────────
  console.log('\nⒷ update-live ⑧ — 서울 한반도 env 키 + 존 안에서 도쿄 존 /health(읽기만 · 값 0)');
  const live = subj('update-live.sh');
  // ★[T1077] central · 도쿄 닛폰 env(기본 = 맞는 판: central 에 닛폰 키 · 도쿄 26존 표 한반도 = 서울 대역)
  const CEN = (extra) => ['PORT=3010', 'DB_PATH=/data/central.db', 'PUBLIC_HOST=' + SEOUL_LIVE, 'ENABLED_ZONES=hanbando,nippon,jungwon_n', 'CENTRAL_SECRET=' + SECRET, ...extra];   // lib-port: 묶지 않음(도커 env 픽스처 글자 — 이 판이 묶는 포트가 아니다)
  const zhc = () => 'ZONE_HOSTS=' + JSON.stringify({ hanbando: SEOUL_LIVE, nippon: SEOUL, jungwon_n: SEOUL_LIVE });   // central 26존 표 꼴 — 닛폰 = 서울(닫힘)
  //   도쿄 옛 존의 `CENTRAL_HOST` 는 update-live 가 머리 줄에 **일부러 찍는** 비밀 아닌 칸(종전 · 그 스크립트 '도쿄 옛 존 컨테이너 — 비밀 아닌 칸 둘(값)')
  //   — ⑧ 줄의 값 0 셈(clean)과 섞이지 않게 따로 둔 대역 주소(이 판에선 아무도 붙지 않는다)
  const TOKC = '127.0.0.6';
  const TOK = (hanHost, extra) => ['ZONE_ID=nippon', 'PORT=3021', 'CENTRAL_HOST=' + TOKC, 'ENABLED_ZONES=hanbando,nippon,jungwon_n', 'CENTRAL_SECRET=' + SECRET,   // lib-port: 묶지 않음(도커 env 픽스처 글자 — 이 판이 묶는 포트가 아니다)
    'ZONE_HOSTS=' + JSON.stringify({ hanbando: hanHost, nippon: hanHost, jungwon_n: hanHost }), ...(extra || [])];
  function runLive(envLines, args, opt) {
    const o = Object.assign({ central: CEN([zhc(), 'ZONE_HOST_NIPPON=' + OPEN]), tokyo: TOK(SEOUL_LIVE) }, opt || {});
    const L = fs.mkdtempSync(path.join(TMP, 'live-')), SE = path.join(L, 'seoul'), TO = path.join(L, 'tokyo');
    for (const d of [path.join(SE, 'scripts'), path.join(TO, 'scripts')]) fs.mkdirSync(d, { recursive: true });
    const stub = (dir, name, body) => fs.writeFileSync(path.join(dir, 'scripts', name), `#!/bin/bash\n${body || ''}\nexit 0\n`, { mode: 0o755 });
    stub(SE, 'redeploy-hanbando.sh', `if [ "$1" = --dry ]; then echo "[판정] 배포된 커밋과 같다 — 바뀐 파일 0"; echo "PLAN central=0 zone=0 after=${SHA}"; else echo "할 일이 없다. (0초)"; fi`);
    for (const d of [SE, TO]) stub(d, 'reset-world.sh', 'echo "  관측 ok"');
    stub(SE, 'sync-tokyo.sh', 'echo "  ✓ 두 줄이 같다"'); stub(SE, 'live-lag.sh', 'echo "== lag"; echo "  판정 ok"');
    stub(SE, 'disk-check.sh', 'echo "[seoul]"; echo "  판정: ok"; echo "판정: 두 호스트 모두 빈 자리 ≥ 백업 한 벌"');
    stub(SE, 'backup-live.sh', 'echo "  ✓ 대역 사본"'); stub(TO, 'redeploy-light.sh', 'echo "[light] 대역"');
    const ST = path.join(L, 'stamp'), TST = path.join(L, 'tstamp'); fs.writeFileSync(ST, SHA + '\n'); fs.writeFileSync(TST, SHA + '\n');
    let out = '', rc = 0;
    try {
      out = execFileSync('bash', [live, ...(args || [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...baseEnv(), SYNC_SEOUL: 'seoul', SYNC_TOKYO: 'tokyo', SYNC_SEOUL_DIR: SE, SYNC_TOKYO_DIR: TO,
        TOKYO_STAMP: TST, SEOUL_STAMP: ST, FAKE_OLDENV: oldEnv(envLines), FAKE_TOKYO_ADDR: OPEN, FAKE_LOG: path.join(L, 'log'),
        FAKE_CENTRALENV: oldEnv(o.central), FAKE_TOKYOENV: oldEnv(o.tokyo), FAKE_SEOUL_ADDR: SEOUL_LIVE } });
    } catch (e) { rc = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
    const line = (out.match(/^ *[✓✗] 경계 서울 한반도 → nippon: .*$/m) || [''])[0].trim();
    const pick = (re) => (out.match(re) || [''])[0].trim();   // ★[T1077] 새 줄 셋
    return { rc, out, line, cen: pick(/^ *[✓✗] 경계 central \/zones → nippon: .*$/m), rev: pick(/^ *[✓✗] 경계 도쿄 nippon → hanbando: .*$/m), cenH: pick(/^ *[✓✗] 경계 central \/zones → hanbando: .*$/m) };
  }
  const clean = (r) => !r.out.includes(OPEN) && !r.out.includes(SHUT) && !r.out.includes(SEOUL) && !r.out.includes(SEOUL_LIVE) && !r.out.includes(SECRET);
  {
    const r = runLive(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + OPEN]));
    ok(r.rc === 0 && /^✓ 경계 서울 한반도 → nippon: env ZONE_HOST_NIPPON 있음 · 주소 = 도쿄 ssh 주소 · :3021\/health 200 · \d+ms$/.test(r.line) && /✓ 끝 — 서울/.test(r.out),
      '★Ⓑ① 키 있음 + 도쿄 존 /health 200 = ✓ 한 줄 · 갱신 끝(rc 0)', r.line || `줄 없음 · rc ${r.rc}`);
    ok(clean(r), 'Ⓑ② 화면에 env 값(주소) · 비밀 0');
  }
  {
    const r = runLive(HAN([zh(SEOUL)]));
    ok(r.rc === 1 && /^✗ 경계 서울 한반도 → nippon: env ZONE_HOST_NIPPON 없음 · 주소 ≠ 도쿄 ssh 주소 · :3021 ECONNREFUSED/.test(r.line) && /✗ 멈췄다 — 경계 ✗/.test(r.out),
      '★★Ⓑ③ 키 없음(재민 11-01 꼴 — ZONE_HOSTS[nippon] = 서울) = ✗ · ECONNREFUSED · 멈춤(rc 1) — 이 줄을 빼면 여기가 빨강', r.line || `줄 없음 · rc ${r.rc}`);
    ok(clean(r), 'Ⓑ④ ✗ 판도 값 · 비밀 0');
  }
  {
    const r = runLive(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + SHUT]));
    ok(r.rc === 1 && /^✗ 경계 서울 한반도 → nippon: env ZONE_HOST_NIPPON 있음 · 주소 ≠ 도쿄 ssh 주소 · :3021 ECONNREFUSED/.test(r.line), 'Ⓑ⑤ 키는 있는데 그 주소가 닫힘(옛 IP · 도쿄 포트 닫힘) = ✗ · 멈춤', r.line || `줄 없음 · rc ${r.rc}`);
  }
  {
    const r = runLive(HAN([zh(OPEN)]));
    ok(r.rc === 1 && /^✗ 경계 서울 한반도 → nippon: env ZONE_HOST_NIPPON 없음 · 주소 = 도쿄 ssh 주소 · :3021\/health 200/.test(r.line), 'Ⓑ⑥ 키 없이 ZONE_HOSTS 로만 닿음 = ✗(키가 정본 — 26존 표를 새로 짓는 재배포 한 번이면 서울로 돌아간다)', r.line || `줄 없음 · rc ${r.rc}`);
  }
  {
    const r = runLive(null);
    ok(r.rc === 1 && /^✗ 경계 서울 한반도 → nippon: env ZONE_HOST_NIPPON 없음 · 존 안에서 못 물었다/.test(r.line), 'Ⓑ⑦ 한반도 컨테이너가 없으면 ✗(말없이 지나가지 않는다)', r.line || `줄 없음 · rc ${r.rc}`);
  }
  {
    const r = runLive(HAN([zh(SEOUL)]), ['--dry']);
    ok(r.rc === 0 && /\[예행 ⑧\]/.test(r.out) && /^✗ 경계 서울 한반도 → nippon: env ZONE_HOST_NIPPON 없음/.test(r.line) && clean(r), 'Ⓑ⑧ `--dry` 도 같은 줄을 찍는다(멈추지 않는다 · 라이브 무변)', r.line || `줄 없음 · rc ${r.rc}`);
  }

  // ── ★[T1077] Ⓑ⑨ ~ ⑬ central `/zones` 줄 · 도쿄 → 한반도 반대 줄 ───────────────────────────────────────
  console.log('\nⒷ+ ★[T1077] update-live ⑧ — central `/zones` 의 이웃 주소 = 존끼리 넘기는 주소 · 도쿄 → 한반도 반대 방향');
  {
    const r = runLive(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + OPEN]));
    ok(r.rc === 0 && r.cen === '✓ 경계 central /zones → nippon: wsUrl 주소 = 한반도가 넘기는 주소' && r.cenH === '✓ 경계 central /zones → hanbando: wsUrl 주소 = 도쿄 nippon 가 넘기는 주소'
      && /^✓ 경계 도쿄 nippon → hanbando: env ZONE_HOST_HANBANDO 없음\(ZONE_HOSTS\) · 주소 = 서울 ssh 주소 · :3020\/health 200 · \d+ms$/.test(r.rev) && /✓ 끝 — 서울/.test(r.out),
      '★Ⓑ⑨ 맞는 판 — central 이 주는 닛폰 · 한반도 주소가 존끼리 넘기는 주소와 같고 도쿄 닛폰 → 한반도 /health 200 = ✓ 셋 · 갱신 끝(rc 0)', `${r.cen || '줄 없음'} | ${r.rev || '줄 없음'} | rc ${r.rc}`);
  }
  {
    const r = runLive(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + OPEN]), null, { central: CEN([zhc()]) });
    ok(r.rc === 1 && /^✓ 경계 서울 한반도 → nippon: env ZONE_HOST_NIPPON 있음/.test(r.line) && r.cen === '✗ 경계 central /zones → nippon: wsUrl 주소 ≠ 한반도가 넘기는 주소' && /✗ 멈췄다 — 경계 ✗/.test(r.out),
      '★★Ⓑ⑩ 재민 11-02 꼴 — 존↔존은 ✓ 인데 central env 에 닛폰 키가 없다(26존 표 = 서울) = central 줄 ✗ · 멈춤(rc 1) — 이 줄을 빼면 여기가 빨강', `${r.line.slice(0, 40)}… | ${r.cen || '줄 없음'} | rc ${r.rc}`);
    ok(clean(r), 'Ⓑ⑪ 그 판도 화면에 주소 값 · 비밀 0');
  }
  {
    const r = runLive(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + OPEN]), null, { central: CEN([zhc(), 'ZONE_HOST_NIPPON=']) });
    ok(r.rc === 1 && r.cen === '✗ 경계 central /zones → nippon: wsUrl 주소 ≠ 한반도가 넘기는 주소', 'Ⓑ⑫ central 의 키가 **빈 줄**이어도 ✗(T485 되돌림 꼴 `ZONE_HOST_NIPPON=` — 빈 값은 없는 것과 같다)', r.cen || `줄 없음 · rc ${r.rc}`);
  }
  {
    const r = runLive(HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + OPEN]), null, { tokyo: TOK(SHUT) });
    ok(r.rc === 1 && /^✗ 경계 도쿄 nippon → hanbando: env ZONE_HOST_HANBANDO 없음\(ZONE_HOSTS\) · 주소 ≠ 서울 ssh 주소 · :3020 ECONNREFUSED/.test(r.rev) && clean(r),
      'Ⓑ⑬ 반대 방향 — 도쿄 닛폰이 보는 한반도가 닫힘 = ✗ · 멈춤 · 값 0', r.rev || `줄 없음 · rc ${r.rc}`);
  }

  // ── ★[T1077] Ⓒ central 을 다시 만드는 길 — 옛 env 를 통째로 옮긴다 ─────────────────────────────────────
  console.log('\nⒸ ★[T1077] central 을 다시 만드는 길 셋 — 옛 env 를 통째로 옮긴다(`ZONE_HOST_*` 이어짐 · 없던 줄은 안 생긴다)');
  {
    const src = fs.readFileSync(subj('redeploy-hanbando.sh'), 'utf8');
    const fn = (src.match(/\nrecreate\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
    const log = path.join(TMP, 'rc-' + Math.random().toString(36).slice(2)); fs.writeFileSync(log, '');
    const run1 = (cenLines) => { fs.writeFileSync(log, ''); try { fs.unlinkSync(log + '.env'); } catch (e) {}
      try { execFileSync('bash', ['-c', fn + '\nrecreate durango-central durango-central 3010 /srv/durango/central'], { env: { ...baseEnv(), FAKE_LOG: log, FAKE_HOST: 'seoul', FAKE_CENTRALENV: oldEnv(cenLines) }, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) {}
      const line = fs.readFileSync(log, 'utf8').split('\n').find((l) => l.startsWith('run ')) || '';
      const env = fs.existsSync(log + '.env') ? Object.fromEntries(fs.readFileSync(log + '.env', 'utf8').trim().split('\n').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])) : {};
      return { line, env }; };
    const a1 = run1(CEN([zhc(), 'ZONE_HOST_NIPPON=' + OPEN]));
    ok(!!fn && / -e ZONE_HOST_NIPPON /.test(a1.line + ' ') && a1.env.ZONE_HOST_NIPPON === OPEN && a1.env.CENTRAL_SECRET === SECRET && !a1.line.includes(OPEN) && !a1.line.includes(SECRET),
      '★Ⓒ① redeploy-hanbando `recreate()`(진짜 함수) — central 의 옛 `ZONE_HOST_NIPPON` 이 새 컨테이너에 같은 값으로 · 명령줄엔 이름만', `${fn ? '함수 있음' : '함수 못 찾음'} · ${a1.env.ZONE_HOST_NIPPON === OPEN ? '같은 값' : '다름/없음'}`);
    const a2 = run1(CEN([zhc()]));
    ok(!/ZONE_HOST_NIPPON/.test(a2.line) && a2.env.ZONE_HOSTS === JSON.parse(JSON.stringify(zhc().slice('ZONE_HOSTS='.length))),
      'Ⓒ② 옛 central 에 그 줄이 없으면 새 컨테이너에도 없다(옮기기만 한다 — 되살리지 않는다 ⇒ 고침은 Ⓕ 의 스크립트)', /ZONE_HOST_NIPPON/.test(a2.line) ? '생겼다' : '없음 그대로');
    const all = fs.readFileSync(subj('redeploy-all.sh'), 'utf8'), rw = fs.readFileSync(subj('reset-world.sh'), 'utf8');
    ok(/mapfile -t ENVS < <\(docker inspect durango-central --format '\{\{range \.Config\.Env\}\}\{\{println \.\}\}\{\{end\}\}'/.test(all) && /grep -v -E '\^\(PATH\|NODE_VERSION\|YARN_VERSION\|NODE_ENV\|HOME\|HOSTNAME\)='/.test(all)
      && /mapfile -t NEWENV < <\(env_lines \| grep -vE "\$drop"/.test(rw) && !/ZONE_HOST_/.test(all.replace(/^#.*$/gm, '')),
      'Ⓒ③ redeploy-all central 칸 · reset-world `build_env` 도 같은 꼴(옛 env 전부 · 이미지 기본만 뺀다 · ZONE_HOST 를 따로 짓지 않는다 — 글자)');
  }

  // ── ★[T1077] Ⓕ fix-central-hosts.sh ────────────────────────────────────────────────────────────────
  console.log('\nⒻ ★[T1077] fix-central-hosts.sh — central 에 빠진 `ZONE_HOST_<ID>` 를 존 컨테이너 줄로 · central 만 다시');
  {
    const BIN2 = path.join(TMP, 'bin2'); fs.mkdirSync(BIN2, { recursive: true });
    //   가짜 docker 둘째 — central 상태 파일(이미지 id · /data · 포트 · 라벨 · env) · 존 env 파일(FAKE_ZDIR/<이름>) · run 이 central env 를 새로 쓴다(그 뒤 exec 가 읽는다)
    fs.writeFileSync(path.join(BIN2, 'docker'), `#!/bin/bash
C=durango-central
case "$1" in
  inspect) n="$2"; f="$*"
    if [ "$n" = "$C" ]; then [ -f "$FAKE_CENTRALENV" ] || exit 1
      case "$f" in *Config.Env*) cat "$FAKE_CENTRALENV" ;; *".Image}}"*) echo "sha256:$(printf 'e%.0s' $(seq 64))" ;; *Mounts*) echo /srv/durango/central ;;
        *PortBindings*) echo "3010/tcp 3010" ;; *Config.Labels*) echo "durango.commit=cafe12" ;; *State.Status*) echo running ;; *) echo ok ;; esac
    elif [ -f "$FAKE_ZDIR/$n" ]; then case "$f" in *Config.Env*) cat "$FAKE_ZDIR/$n" ;; esac
    else exit 1; fi ;;
  ps) [ -f "$FAKE_CENTRALENV" ] && echo "$C"; ls "$FAKE_ZDIR" ;;
  stop|rm) echo "$*" >> "$FAKE_LOG" ;;
  run) echo "$*" >> "$FAKE_LOG"; : > "$FAKE_CENTRALENV.new"; p=""; for x in "$@"; do [ "$p" = -e ] && echo "$x=\${!x}" >> "$FAKE_CENTRALENV.new"; p="$x"; done; mv "$FAKE_CENTRALENV.new" "$FAKE_CENTRALENV" ;;
  exec) shift; c="$1"; shift; [ "$c" = "$C" ] || exit 1; cd "$FAKE_APP" || exit 1
        while IFS= read -r kv; do [ -n "$kv" ] && export "$kv"; done < "$FAKE_CENTRALENV"; exec "$@" ;;
esac
exit 0
`, { mode: 0o755 });
    const fix = subj('fix-central-hosts.sh');
    const runFix = (cenLines, zones, args) => {
      const D = fs.mkdtempSync(path.join(TMP, 'fix-')), Z = path.join(D, 'z'); fs.mkdirSync(Z);
      const CF = path.join(D, 'central.env'); fs.writeFileSync(CF, cenLines.join('\n') + '\n');
      for (const [n, lines] of Object.entries(zones)) fs.writeFileSync(path.join(Z, n), lines.join('\n') + '\n');
      const LOG2 = path.join(D, 'log'); fs.writeFileSync(LOG2, '');
      let out = '', rc = 0;
      try { out = execFileSync('bash', [fix, ...(args || [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: `${BIN2}:${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: TMP, LANG: 'C.UTF-8', FAKE_APP: ROOT, FAKE_LOG: LOG2, FAKE_CENTRALENV: CF, FAKE_ZDIR: Z } }); }
      catch (e) { rc = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
      const calls = fs.readFileSync(LOG2, 'utf8').trim().split('\n').filter(Boolean);
      const env = Object.fromEntries(fs.readFileSync(CF, 'utf8').trim().split('\n').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
      return { out, rc, calls, env, envLines: fs.readFileSync(CF, 'utf8').trim().split('\n') };
    };
    const ZH = { 'durango-zone-hanbando': HAN([zh(SEOUL), 'ZONE_HOST_NIPPON=' + OPEN]) };
    const fixClean = (r) => !r.out.includes(OPEN) && !r.out.includes(SEOUL) && !r.out.includes(SEOUL_LIVE) && !r.out.includes(SECRET);
    {
      const r = runFix(CEN([zhc()]), ZH, ['--dry']);
      ok(r.rc === 0 && /\+ ZONE_HOST_NIPPON — central 에 없다 → 넣는다\(값 = durango-zone-hanbando 의 그 줄\)/.test(r.out) && /다시 띄울 것: durango-central 하나/.test(r.out) && r.calls.length === 0 && fixClean(r),
        '★Ⓕ① `--dry` — 넣을 이름 · 다시 띄울 것 하나만 말한다 · stop/rm/run 0 · 화면에 값 · 비밀 0', `rc ${r.rc} · 부름 ${r.calls.length}`);
    }
    {
      const old = CEN([zhc()]);
      const r = runFix(old, ZH, []);
      const run = r.calls.find((l) => l.startsWith('run ')) || '';
      const keepAll = old.every((kv) => r.env[kv.slice(0, kv.indexOf('='))] === kv.slice(kv.indexOf('=') + 1));
      const sees = zoneSees(r.env, 'nippon');
      ok(r.rc === 0 && r.calls.filter((l) => /^(stop|rm|run) /.test(l)).length === 3 && r.env.ZONE_HOST_NIPPON === OPEN && keepAll
        && /--restart unless-stopped/.test(run) && / -p 3010:3010 /.test(run + ' ') && / -v \/srv\/durango\/central:\/data /.test(run + ' ') && /sha256:e{64}$/.test(run) && /--label durango\.commit=cafe12/.test(run),
        '★★Ⓕ② 고침 — central 하나만 stop · rm · run(같은 이미지 id · 포트 · /data · 라벨 · unless-stopped) · 옛 env 그대로 + `ZONE_HOST_NIPPON` = 한반도 줄 값', `rc ${r.rc} · ${r.calls.map((l) => l.split(' ')[0]).join(',')}`);
      ok(!!sees && sees.host === OPEN && /✓ central \/zones → nippon: wsUrl 주소 = durango-zone-hanbando 의 그 줄/.test(r.out),
        '★Ⓕ③ 그 env 로 central `/zones`(정본 `publicZoneMap`)가 브라우저에 주는 닛폰 = 한반도가 넘기는 주소 · 끝 줄 ✓', sees ? (sees.host === OPEN ? '같다' : '다르다') : '못 물음');
      ok(!run.includes(OPEN) && !run.includes(SECRET) && fixClean(r), 'Ⓕ④ 값 · 비밀은 명령줄 · 화면 0(`-e <이름>` · 이 셸 env 로만)');
    }
    {
      const r = runFix(CEN([zhc(), 'ZONE_HOST_NIPPON=']), ZH, []);
      ok(r.rc === 0 && /\+ ZONE_HOST_NIPPON — central 에 빈 줄 → 넣는다/.test(r.out) && r.envLines.filter((l) => l.startsWith('ZONE_HOST_NIPPON=')).length === 1 && r.env.ZONE_HOST_NIPPON === OPEN,
        'Ⓕ⑤ central 의 빈 줄(`ZONE_HOST_NIPPON=` — T485 되돌림 꼴)은 넣을 값으로 갈음(한 줄)', r.envLines.filter((l) => l.startsWith('ZONE_HOST_NIPPON=')).length + '줄');
    }
    {
      const r = runFix(CEN([zhc(), 'ZONE_HOST_NIPPON=' + OPEN]), ZH, []);
      ok(r.rc === 0 && /= ZONE_HOST_NIPPON — central 에 있다/.test(r.out) && /넣을 것 0/.test(r.out) && r.calls.length === 0, 'Ⓕ⑥ 이미 같으면 할 일 0 — central 을 다시 띄우지 않는다', `부름 ${r.calls.length}`);
    }
    {
      const r = runFix(CEN([zhc(), 'ZONE_HOST_NIPPON=' + SHUT]), ZH, []);
      ok(r.rc === 1 && /✗ ZONE_HOST_NIPPON — central 값이 durango-zone-hanbando 의 그 줄과 다르다 → 손대지 않는다/.test(r.out) && r.calls.length === 0 && r.env.ZONE_HOST_NIPPON === SHUT && fixClean(r),
        'Ⓕ⑦ central 에 다른 값이 있으면 손대지 않는다(✗ · rc 1 · 사람 판정 — 옛 env 그대로)', `rc ${r.rc} · 부름 ${r.calls.length}`);
    }
    {
      const r = runFix(CEN([zhc()]), { ...ZH, 'durango-zone-jungwon_n': ['ZONE_ID=jungwon_n', 'ZONE_HOST_NIPPON=' + SHUT] }, []);
      ok(r.rc === 1 && /존 둘\(.*\)이 다른 값을 가진다/.test(r.out) && r.calls.length === 0 && fixClean(r), 'Ⓕ⑧ 존 둘이 같은 이름에 다른 값 = 멈춤(바꿈 0 · 값 0)', `rc ${r.rc}`);
    }
  }

  // ── Ⓡ 재현 — 키 없는 redeploy-light 꼴 env → 거절 갈래 알림 글자(대상 판과 무관) ─────────────────────
  console.log('\nⓇ 재현 — redeploy-light 꼴 env(키 없음 · ZONE_HOSTS 26 = CENTRAL_IP) → 존이 보는 닛폰 → 접속 → 까닭');
  {
    const ids = 'canadia nubiano mayan amazonia patagona atlantic nordan europa sahar sibara centaria hindgang indoyang bering jungwon_n jungwon_s nanyang nambingyang hanbando nippon oseania pacific east_sea_s pacific_arctic japan_pacific kongra'.split(' ');
    const env = { ENABLED_ZONES: ids.join(','), ZONE_HOSTS: JSON.stringify(Object.fromEntries(ids.map((i) => [i, SEOUL]))), ZONE_ID: 'hanbando' };
    const sees = zoneSees(env, 'nippon');
    ok(!!sees && sees.host === SEOUL && sees.port === 3021, 'Ⓡ① 키가 빠지면 존이 보는 닛폰 = CENTRAL_IP(서울):3021');
    const code = await new Promise((res) => { const s = net.connect(sees.port, sees.host); s.on('connect', () => { s.destroy(); res('connected'); }); s.on('error', (e) => res(e.code)); });
    const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const m = src.match(/function _t564HandoffWhy\(e\) \{[\s\S]*?\n\}/);
    const why = m ? new Function('HANDOFF_PROTO', m[0] + '\nreturn _t564HandoffWhy;')(1) : null;
    const w = why ? why({ code }) : {};
    const tpl = src.includes('text: `${nm}(으)로 넘어가지 못했습니다. ${w.say}`');
    ok(code === 'ECONNREFUSED' && w.k === '거절' && w.say === '저쪽 서버가 연결을 받지 않습니다.' && tpl,
      'Ⓡ② 서울:3021 닫힘 → ECONNREFUSED → `_t564HandoffWhy` 까닭 거절 · 알림 "<존>(으)로 넘어가지 못했습니다. 저쪽 서버가 연결을 받지 않습니다."(재민 11-01 글자 · T1069 · T1112 말투 뒤)', `${code} → ${w.k} · "${sees.name}(으)로 넘어가지 못했습니다. ${w.say}"`);
  }

  nb.c.kill(); nbS.c.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
