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
// 실행: node scripts/test-xhost-env.js                    # 작업 트리의 두 스크립트
//       node scripts/test-xhost-env.js --against origin/main   # 그 커밋의 두 스크립트(고침 앞 = 빨강이어야 한다 — 자명 통과 금지 증인)
'use strict';
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
const subj = (f) => {   // 대상 스크립트 — 작업 트리 또는 --against 커밋
  if (!AGAINST) return path.join(ROOT, 'scripts', f);
  const p = path.join(TMP, 'against-' + f); fs.writeFileSync(p, execFileSync('git', ['show', `${AGAINST}:scripts/${f}`], { cwd: ROOT })); return p;
};

// ── 가짜 셋 ──────────────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(BIN, 'docker'), `#!/bin/bash
case "$1" in
  run) echo "$*" >> "$FAKE_LOG" ;;
  inspect) case "$*" in
      *Config.Env*) [ "$2" = durango-zone-hanbando ] && [ -f "$FAKE_OLDENV" ] && cat "$FAKE_OLDENV" ;;
      *Health*) echo healthy ;;
      *State.Status*) echo running ;;
    esac ;;
  ps) case "$*" in *-a*) [ "$FAKE_HOST" = tokyo ] && echo durango-zone-nippon ;; *) printf 'durango-zone-hanbando\\tUp\\n' ;; esac ;;
  exec) shift; c="$1"; shift
        { [ "$c" = durango-zone-hanbando ] && [ -f "$FAKE_OLDENV" ]; } || { echo "Error response from daemon: No such container: $c" >&2; exit 1; }
        cd "$FAKE_APP" || exit 1
        while IFS= read -r kv; do [ -n "$kv" ] && export "$kv"; done < "$FAKE_OLDENV"
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
if [ "$1" = -G ]; then echo "hostname $FAKE_TOKYO_ADDR"; exit 0; fi
h="$1"; shift; export FAKE_HOST="$h"
exec bash -c "$*"
`, { mode: 0o755 });
const baseEnv = () => ({ PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: TMP, FAKE_APP: ROOT, LANG: 'C.UTF-8' });
function oldEnv(lines) { const f = path.join(TMP, 'oldenv-' + Math.random().toString(36).slice(2)); if (lines) fs.writeFileSync(f, lines.join('\n') + '\n'); return f; }
const zh = (host) => 'ZONE_HOSTS=' + JSON.stringify({ hanbando: SEOUL, nippon: host, jungwon_n: SEOUL });
const HAN = (extra) => ['ZONE_ID=hanbando', 'PORT=3020', 'DB_PATH=/data/world-hanbando.db', 'CENTRAL_HOST=' + SEOUL, 'ENABLED_ZONES=hanbando,nippon,jungwon_n', 'PLAYER_CAP=150', 'CENTRAL_SECRET=' + SECRET, ...extra];

// 이웃 존(자식 프로세스 — execFileSync 가 이 루프를 막아도 답한다)
function startNeighbor() {
  return new Promise((res) => {
    const c = spawn(process.execPath, ['-e', `require('http').createServer((q,r)=>{r.writeHead(q.url==='/health'?200:404,{'Content-Type':'application/json'});r.end('{"ok":true}')}).on('error',e=>{console.log('ERR '+e.code);process.exit(1)}).listen(3021,'${OPEN}',()=>console.log('UP'))`], { stdio: ['ignore', 'pipe', 'inherit'] });
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
  const pre = nb.up && (await refused(SHUT)) && (await refused(SEOUL));
  ok(pre, '[판] 이웃 존 127.0.0.2:3021 이 /health 에 답하고 127.0.0.3 · 127.0.0.4 :3021 은 닫혀 있다(3021 을 잡은 다른 판이 없어야 한다)', nb.why);
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
  function runLive(envLines, args) {
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
        TOKYO_STAMP: TST, SEOUL_STAMP: ST, FAKE_OLDENV: oldEnv(envLines), FAKE_TOKYO_ADDR: OPEN, FAKE_LOG: path.join(L, 'log') } });
    } catch (e) { rc = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
    const line = (out.match(/^ *[✓✗] 경계 서울 한반도 → nippon: .*$/m) || [''])[0].trim();
    return { rc, out, line };
  }
  const clean = (r) => !r.out.includes(OPEN) && !r.out.includes(SHUT) && !r.out.includes(SEOUL) && !r.out.includes(SECRET);
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
    const tpl = src.includes('text: `${nm}(으)로 못 넘어간다 — ${w.say}`');
    ok(code === 'ECONNREFUSED' && w.k === '거절' && w.say === '저쪽 서버가 연결을 받지 않는다' && tpl,
      'Ⓡ② 서울:3021 닫힘 → ECONNREFUSED → `_t564HandoffWhy` 까닭 거절 · 알림 "<존>(으)로 못 넘어간다 — 저쪽 서버가 연결을 받지 않는다"(재민 11-01 글자)', `${code} → ${w.k} · "${sees.name}(으)로 못 넘어간다 — ${w.say}"`);
  }

  nb.c.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
