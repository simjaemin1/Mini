#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-reset-world.js — `reset-world.sh` 가 **무엇을 지우고 무엇을 남기나** (T587) ======================
//
// ★`test-redeploy` · `test-redeploy-light` 문법 — **진짜 스크립트를 돌린다**(판정 사본 0). 가짜 `docker`(상태를 JSON 에 쥐는 작은 흉내) ·
//   `curl` · `sleep` 을 PATH 앞에 세운다. 가짜 docker 는 `run --rm … /rw.js db|keep-accounts` 를 **진짜 node 로** 돌린다(진짜 SQLite 파일 ·
//   central 스키마는 진짜 `server/central.js` 를 잠깐 띄워 만든다 — 표를 손으로 적지 않는다).
//   ① 예행(기본): 상태 무변 · 지울 것 목록이 찍힌다      ② 첫 프롬프트가 틀리면 멈추지도 않는다
//   ③ 둘째 프롬프트가 틀리면 멈춤 + 백업만(DB 그대로)      ④ 백업 자리가 안 되면 **지우는 줄까지 안 간다**(두 꼴: 폴더 못 만듦 · 빈 자리 모자람)
//   ⑤ --apply: 백업 sha256 = 원본 · DB 파일(본·-wal·-shm) 지움 · 옛 이미지 `:pre-reset`
//   ⑥ --up: env 그대로 + `T565_MAP_LIVE=0` · `PLAYER_CAP=0` · 비밀은 **env 로만**(명령줄 0 · 화면 0 · 파일 0) · 새 컨테이너 env 에 같은 값
//   ⑦ --open: `PLAYER_CAP` 옛 값 · 실시간 점은 끈 채      ⑧ --restore: 바이트 그대로 되놓음 · 새 세계 DB 는 옆으로(안 지움) · 옛 이미지·옛 env
//   ⑨ central --keep-accounts: 신원·벗 남김 · 몸·짐·자리 = 스키마 기본값 · 길드·전쟁·초대 0      ⑩ --keep-all: 지울 것 0
//   ⑪ 비밀 파일 무접촉(소스에서 그 경로를 여는 줄 0 · 있으면 sha·mtime 무변)      ⑫ ★자명 통과 금지 — 값을 흘리는 미끼 사본을 같은 자로 재면 **잡힌다**
// 실행: node scripts/test-reset-world.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'reset-world.sh');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rwtest-'));
const BIN = path.join(TMP, 'bin'); fs.mkdirSync(BIN);
const STATE = path.join(TMP, 'docker.json');
const SECRET = 'zz-test-secret-' + crypto.randomBytes(8).toString('hex');

// ── 가짜 docker — reset-world.sh 가 쓰는 꼴만 안다(모르는 꼴은 크게 죽는다 → 자명 통과 0) ─────────────────
fs.writeFileSync(path.join(BIN, 'docker'), `#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SF = process.env.FAKE_STATE; const S = JSON.parse(fs.readFileSync(SF, 'utf8'));
const save = () => fs.writeFileSync(SF, JSON.stringify(S, null, 1));
const a = process.argv.slice(2);
S.argv.push(a.join(' ')); save();
const F = { env: '{{range .Config.Env}}{{println .}}{{end}}', state: '{{.State.Status}}', image: '{{.Config.Image}}', imageId: '{{.Image}}',
  data: '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}',
  port: '{{range $p, $b := .HostConfig.PortBindings}}{{$p}} {{(index $b 0).HostPort}}{{println}}{{end}}',
  labels: '{{range $k, $v := .Config.Labels}}{{$k}}={{$v}}{{println}}{{end}}', commit: '{{index .Config.Labels "durango.commit"}}' };
const IMG_ENV = ['PATH=/usr/local/bin:/usr/bin', 'NODE_VERSION=22.0.0', 'YARN_VERSION=1.22', 'NODE_ENV=production'];
const fmtOf = () => { const i = a.indexOf('--format'); return i >= 0 ? a[i + 1] : null; };
const img = (n) => (S.images[n] ? n : null) || Object.keys(S.images).find((k) => S.images[k].id === n);
const die = (m, c) => { process.stderr.write(m + '\\n'); process.exit(c || 1); };
if (a[0] === 'inspect') {
  const c = S.containers[a[1]]; if (!c) die('Error: No such object: ' + a[1]);
  const f = fmtOf();
  if (f === '{{.Name}}') return console.log('/' + a[1]);
  if (f === F.env) return process.stdout.write(IMG_ENV.concat(c.env).map((l) => l + '\\n').join(''));
  if (f === F.state) return console.log(c.state);
  if (f === F.image) return console.log(c.image);
  if (f === F.imageId) return console.log(c.imageId);
  if (f === F.data) return console.log(c.data || '');
  if (f === F.port) return process.stdout.write(c.port + '/tcp ' + c.port + '\\n');
  if (f === F.labels) return process.stdout.write(Object.entries(c.labels || {}).map(([k, v]) => k + '=' + v + '\\n').join(''));
  die('가짜 docker: 모르는 inspect 꼴 ' + f, 9);
}
if (a[0] === 'image' && a[1] === 'inspect') {
  const n = img(a[2]); if (!n) die('Error: No such image: ' + a[2]);
  const f = fmtOf();
  if (f === null) return console.log('[{"Id":"' + S.images[n].id + '"}]');   // 있나만 묻는 꼴
  if (f === '{{.Id}}') return console.log(S.images[n].id);
  if (f === F.commit) return console.log(S.images[n].commit || '<no value>');
  die('가짜 docker: 모르는 image inspect 꼴 ' + f, 9);
}
if (a[0] === 'stop') { const c = S.containers[a[a.length - 1]]; if (!c) die('no such container'); c.state = 'exited'; c.stops = (c.stops || 0) + 1; save(); return console.log(a[a.length - 1]); }
if (a[0] === 'tag') { const n = img(a[1]); if (!n) die('no such image ' + a[1]); S.images[a[2]] = { id: S.images[n].id, commit: S.images[n].commit }; save(); return; }
if (a[0] === 'logs') return console.log('[fake] 옛 세계 마지막 로그 한 줄');
if (a[0] === 'rm') { const n = a[a.length - 1]; if (!S.containers[n]) die('no such container'); if (S.containers[n].state === 'running' && a[1] !== '-f') die('running — rm 거부'); delete S.containers[n]; save(); return; }
if (a[0] === 'run') {
  if (a.includes('--rm')) {   // 손발(reset-world.js) — 진짜 node 로 돈다(볼륨 /data 를 호스트 경로로 바꿔서)
    let vol = null, rw = null, i = 1; const rest = [];
    for (; i < a.length; i++) {
      if (a[i] === '--rm') continue;
      if (a[i] === '--network') { i++; continue; }
      if (a[i] === '-v') { const [h, c] = a[++i].split(':'); if (c === '/data') vol = h; if (c === '/rw.js') rw = h; continue; }
      rest.push(a[i]);
    }
    const nodeAt = rest.indexOf('node'); const argv = rest.slice(nodeAt + 1).map((x) => x === '/rw.js' ? rw : (vol && x.startsWith('/data/') ? path.join(vol, x.slice(6)) : x));
    if (argv.includes('live')) return console.log('  (가짜 관측자 줄)');
    try { process.stdout.write(execFileSync(process.execPath, argv, { encoding: 'utf8' })); } catch (e) { process.stdout.write(String(e.stdout || '')); process.stderr.write(String(e.stderr || '')); process.exit(e.status || 1); }
    return;
  }
  const c = { state: 'running', env: [], labels: {}, argvEnvValues: [] }; let i = 1;
  for (; i < a.length; i++) {
    const x = a[i];
    if (x === '-d') continue;
    if (x === '--name') { c.name = a[++i]; continue; }
    if (x === '--restart') { c.restart = a[++i]; continue; }
    if (x === '-p') { c.port = a[++i].split(':')[0]; continue; }
    if (x === '-v') { const [h, d] = a[++i].split(':'); if (d === '/data') c.data = h; continue; }
    if (x === '-e') { const kv = a[++i]; if (kv.includes('=')) { c.env.push(kv); c.argvEnvValues.push(kv); } else if (process.env[kv] !== undefined) c.env.push(kv + '=' + process.env[kv]); continue; }
    if (x === '--label') { const kv = a[++i]; c.labels[kv.slice(0, kv.indexOf('='))] = kv.slice(kv.indexOf('=') + 1); continue; }
    break;
  }
  const n = img(a[i]); if (!n) die('Unable to find image ' + a[i]);
  c.image = a[i]; c.imageId = S.images[n].id;
  if (S.containers[c.name]) die('Conflict. The container name is already in use');
  S.containers[c.name] = c; save(); return console.log('cid-' + c.name);
}
die('가짜 docker: 모르는 명령 ' + a.join(' '), 9);
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'curl'), '#!/bin/sh\necho \'{"ok":true}\'\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

// ── 판 하나: 존 볼륨(진짜 SQLite 3파일) + 컨테이너 상태 ─────────────────────────────────────────────────
const SRV = path.join(TMP, 'srv'); fs.mkdirSync(SRV);
function zoneDb(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(path.join(dir, name));
  d.exec('PRAGMA journal_mode = WAL');
  d.exec("CREATE TABLE villages (id INTEGER PRIMARY KEY, zone TEXT, name TEXT, cx INT, cy INT, population INT, econ_state TEXT, day INT, created_at INT)");
  d.exec("CREATE TABLE village_buildings (id INTEGER PRIMARY KEY AUTOINCREMENT, village_id INT, type TEXT, cx INT, cy INT)");
  d.exec("INSERT INTO villages VALUES (1,'hanbando','가',0,0,10,'{}',3341,0),(2,'hanbando','나',5,5,10,'{}',3341,0)");
  d.exec("INSERT INTO village_buildings (village_id,type,cx,cy) VALUES (1,'terr',1,1),(2,'terr',1,1),(2,'terr',2,2)");
  return d;   // 열어 둔 채 둔다 — -wal · -shm 이 살아 있는 판(라이브의 멈춘 존과 같은 세 파일)
}
function fresh() {
  for (const f of fs.readdirSync(SRV)) fs.rmSync(path.join(SRV, f), { recursive: true, force: true });
  const vol = path.join(SRV, 'hanbando');
  const h = zoneDb(vol, 'world-hanbando.db');
  fs.writeFileSync(path.join(vol, 'keep-me.txt'), '볼륨 안 다른 파일');
  const S = { argv: [], images: { 'durango-zone': { id: 'sha256:' + 'b'.repeat(64), commit: 'newcommit123' }, 'old-zone-id': { id: 'sha256:' + 'a'.repeat(64), commit: 'oldcommit456' } },
    containers: { 'durango-zone-hanbando': { state: 'running', image: 'durango-zone', imageId: 'sha256:' + 'a'.repeat(64), data: vol, port: '3020', labels: {},
      env: ['ZONE_ID=hanbando', 'PORT=3020', 'DB_PATH=/data/world-hanbando.db', 'PLAYER_CAP=150', 'CHAR_SPRITE=on', 'ZONE_HOST_NIPPON=203.0.113.9', 'ZONE_HOSTS={"hanbando":"203.0.113.1"}', 'CENTRAL_SECRET=' + SECRET] } } };
  fs.writeFileSync(STATE, JSON.stringify(S));
  return { vol, h };
}
const st = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));
const BK = path.join(SRV, '_reset');
function run(args, input, env, script) {
  let out = '';
  try {
    out = execFileSync('bash', [script || SCRIPT, ...args], { input: input || '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { PATH: `${BIN}:${process.env.PATH}`, FAKE_STATE: STATE, RESET_BACKUP_ROOT: BK }, env || {}) });
    return { out, rc: 0 };
  } catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), rc: e.status }; }
}
const dbFiles = (vol) => fs.readdirSync(vol).filter((f) => /^world-hanbando\.db(-wal|-shm|-journal)?$/.test(f)).sort();
const leakIn = (s) => s.includes(SECRET);
const leakFiles = (dir) => { let n = 0; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (fs.readFileSync(p).includes(SECRET)) n++; } }; if (fs.existsSync(dir)) walk(dir); return n; };
const secretFile = '/root/.durango-secret';
const sfBefore = fs.existsSync(secretFile) ? { sha: sha(secretFile), m: fs.statSync(secretFile).mtimeMs } : null;

console.log('\n=== reset-world.sh — 무엇을 지우고 무엇을 남기나 (T587) ===');
let z = fresh(), r, S0;
const sums0 = Object.fromEntries(dbFiles(z.vol).map((f) => [f, sha(path.join(z.vol, f))]));
console.log('\n① 예행(기본)');
S0 = fs.readFileSync(STATE, 'utf8');
r = run(['hanbando']);
const S1 = st();
ok(r.rc === 0 && /예행/.test(r.out), '인자 없이 = 예행 — 끝까지 돈다', `rc=${r.rc}`);
ok(S1.containers['durango-zone-hanbando'].state === 'running' && !S1.argv.some((l) => /^(stop|rm|tag|run -d)/.test(l)), '예행은 멈추지도·지우지도·태그 달지도·띄우지도 않는다', S1.argv.filter((l) => !/^(inspect|image inspect|run --rm)/.test(l)).join(' | ') || '읽기만');
ok(dbFiles(z.vol).length === 3 && !fs.existsSync(BK), 'DB 세 파일 그대로 · 백업 폴더도 안 만든다', dbFiles(z.vol).join(' '));
ok(/world-hanbando\.db\(/.test(r.out) && /world-hanbando\.db-wal\(/.test(r.out) && /world-hanbando\.db-shm\(/.test(r.out), '지울 것 목록에 본·-wal·-shm 셋이 찍힌다');
ok(/keep-me\.txt/.test(r.out), '볼륨 안 다른 파일은 남길 것으로 찍힌다');
ok(/두 마을이 가진 영토 셀 1\b/.test(r.out) && /세계 날 3,341/.test(r.out), '옛 세계 수(T569 겹친 영토 · 세계 날)를 진짜 DB 에서 센다', (r.out.match(/DB world[^\n]*/) || [''])[0].slice(0, 120));
ok(/T565_MAP_LIVE - → 0/.test(r.out) && /PLAYER_CAP 150 → 0/.test(r.out), '바꿀 env(실시간 점 끔 · 닫힌 채) 를 미리 보인다');

console.log('\n② 첫 프롬프트가 틀리면');
r = run(['hanbando', '--apply'], 'hanbando?\n');
ok(r.rc !== 0 && st().containers['durango-zone-hanbando'].state === 'running' && !fs.existsSync(BK), '틀린 이름 → 멈추지도 않는다 · 백업도 없다', `rc=${r.rc}`);
r = run(['hanbando', '--apply'], '');
ok(r.rc !== 0 && st().containers['durango-zone-hanbando'].state === 'running', '입력이 없으면(빈 표준입력) 그만둔다');

console.log('\n③ 둘째 프롬프트가 틀리면');
r = run(['hanbando', '--apply'], 'hanbando\n지운다?\n');
let bdirs = fs.existsSync(BK) ? fs.readdirSync(BK) : [];
ok(r.rc !== 0 && st().containers['durango-zone-hanbando'].state === 'exited', '멈춤까지는 갔다(백업은 멈춘 판에서 뜬다)', `rc=${r.rc}`);
ok(bdirs.length === 1 && fs.existsSync(path.join(BK, bdirs[0], 'SHA256SUMS')), '백업은 있다', bdirs.join(' '));
// -shm 은 WAL 의 색인(읽는 쪽도 고쳐 쓴다 — ①의 예행이 DB 를 셀 때 이미 닿았다) ⇒ 본·-wal 의 바이트를 본다
ok(dbFiles(z.vol).length === 3 && ['world-hanbando.db', 'world-hanbando.db-wal'].every((f) => sha(path.join(z.vol, f)) === sums0[f]), 'DB 는 한 바이트도 안 바뀌었다(본·-wal · 세 파일 다 있음)');

console.log('\n④ 백업이 안 되면 지우는 줄까지 안 간다');
z = fresh(); fs.writeFileSync(path.join(TMP, 'not-a-dir'), 'x');
r = run(['hanbando', '--apply'], 'hanbando\n지운다\n', { RESET_BACKUP_ROOT: path.join(TMP, 'not-a-dir', 'sub') });
ok(r.rc !== 0 && dbFiles(z.vol).length === 3 && /아무것도 안 지웠다/.test(r.out), '백업 폴더를 못 만들면 → 멈춘 채 끝 · DB 그대로', `rc=${r.rc}`);
z = fresh();
fs.writeFileSync(path.join(BIN, 'df'), '#!/bin/sh\necho "Filesystem 1-blocks Used Available Capacity Mounted"\necho "/dev/x 100 99 1024 99% /"\n', { mode: 0o755 });
r = run(['hanbando', '--apply'], 'hanbando\n지운다\n');
fs.unlinkSync(path.join(BIN, 'df'));
ok(r.rc !== 0 && dbFiles(z.vol).length === 3 && /모자란다/.test(r.out), '빈 자리가 모자라면 → 멈춘 채 끝 · DB 그대로', `rc=${r.rc}`);

console.log('\n⑤ --apply 끝까지');
z = fresh(); fs.rmSync(BK, { recursive: true, force: true });
const sumsA = Object.fromEntries(dbFiles(z.vol).map((f) => [f, sha(path.join(z.vol, f))]));
r = run(['hanbando', '--apply'], 'hanbando\n지운다\n');
bdirs = fs.readdirSync(BK); const B = path.join(BK, bdirs[0]);
ok(r.rc === 0 && dbFiles(z.vol).length === 0 && fs.existsSync(path.join(z.vol, 'keep-me.txt')), 'DB 세 파일만 지웠다 · 볼륨 안 다른 파일은 남았다', `rc=${r.rc} · 남은 것 ${fs.readdirSync(z.vol).join(' ')}`);
ok(Object.keys(sumsA).every((f) => fs.existsSync(path.join(B, f)) && sha(path.join(B, f)) === sumsA[f]), '백업 = 지우기 전 원본(sha256 셋 다)', Object.keys(sumsA).join(' '));
ok((fs.statSync(B).mode & 0o777) === 0o700, '백업 폴더는 700', (fs.statSync(B).mode & 0o777).toString(8));
const meta = fs.readFileSync(path.join(B, 'meta.txt'), 'utf8');
ok(/orig\.PLAYER_CAP=150/.test(meta) && /orig\.T565_MAP_LIVE=-/.test(meta) && /image_id=sha256:a{64}/.test(meta), 'meta.txt = 옛 값·옛 이미지(비밀 아닌 칸만)');
ok(st().images['durango-zone:pre-reset'] && st().images['durango-zone:pre-reset'].id === 'sha256:' + 'a'.repeat(64), '옛 이미지에 `:pre-reset` 태그(되돌리기용)');
const stopIdx = st().argv.findIndex((l) => /^stop /.test(l));
ok(stopIdx >= 0 && /-t 30/.test(st().argv[stopIdx]), '멈춤 = `docker stop -t 30`(SIGTERM — 존이 몸·짐승을 저장하고 내린다 · rm -f 아님)');

console.log('\n⑥ --up — 닫힌 채 띄움');
r = run(['hanbando', '--up']);
let c = st().containers['durango-zone-hanbando'];
if (r.rc) console.log(r.out.split('\n').map((l) => '      | ' + l).join('\n'));
ok(r.rc === 0 && c && c.state === 'running' && c.imageId === 'sha256:' + 'b'.repeat(64), '새 이미지(태그가 가리키는 것)로 다시 만들었다', `rc=${r.rc}`);
const envOf = (k) => (c.env.find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1);
ok(envOf('T565_MAP_LIVE') === '0' && envOf('PLAYER_CAP') === '0', 'T565_MAP_LIVE=0 · PLAYER_CAP=0', `T565=${envOf('T565_MAP_LIVE')} cap=${envOf('PLAYER_CAP')}`);
ok(['ZONE_ID', 'PORT', 'DB_PATH', 'CHAR_SPRITE', 'ZONE_HOST_NIPPON', 'ZONE_HOSTS'].every((k) => envOf(k)) && envOf('ZONE_HOSTS') === '{"hanbando":"203.0.113.1"}', '나머지 env 는 그대로 옮겨 실었다(JSON 값 포함)');
ok(!c.env.some((l) => /^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV)=/.test(l)), '이미지가 넣는 env 는 안 옮긴다(redeploy-hanbando 와 같은 줄)');
ok(envOf('CENTRAL_SECRET') === SECRET, '새 컨테이너 env 에 비밀이 **같은 값**으로 있다(env 로 넘어갔다)');
ok(!st().argv.some(leakIn) && (c.argvEnvValues || []).every((kv) => !kv.startsWith('CENTRAL_SECRET=')), '비밀 값이 docker 명령줄에 **0**(`-e CENTRAL_SECRET` 이름만)');
ok(c.labels['durango.reset.orig.PLAYER_CAP'] === '150' && c.labels['durango.reset.state'] === 'closed', '옛 정원을 라벨에 적어 둔다(--open 이 읽는다)');
r = run(['hanbando', '--up']);
ok(r.rc !== 0 && /돌고 있다/.test(r.out), '돌고 있는 판에 --up 은 거부');

console.log('\n⑦ --open');
r = run(['hanbando', '--open']);
c = st().containers['durango-zone-hanbando'];
ok(r.rc === 0 && envOf('PLAYER_CAP') === '150' && envOf('T565_MAP_LIVE') === '0' && c.labels['durango.reset.state'] === 'open', 'PLAYER_CAP 0 → 150 · 실시간 점은 끈 채(0)', `cap=${envOf('PLAYER_CAP')} T565=${envOf('T565_MAP_LIVE')}`);
ok(c.imageId === 'sha256:' + 'b'.repeat(64) && c.image === 'durango-zone' && envOf('CENTRAL_SECRET') === SECRET, '같은 이미지(이름으로 — id 로 만들면 다음 판이 이름을 잃는다) · 비밀 그대로', c.image);
ok(st().argv.filter((l) => /^stop /.test(l)).length >= 2, '열기도 SIGTERM 으로 내린 뒤 다시 만든다');
r = run(['hanbando', '--open']);
ok(r.rc !== 0, '이미 연 판에 --open 은 거부');

console.log('\n⑧ --restore');
const newSums = (() => { zoneDb(z.vol, 'world-hanbando.db').exec("INSERT INTO villages VALUES (9,'hanbando','새',0,0,1,'{}',0,0)"); return dbFiles(z.vol); })();
st(); const Sx = st(); Sx.containers['durango-zone-hanbando'].state = 'running'; fs.writeFileSync(STATE, JSON.stringify(Sx));
r = run(['hanbando', '--restore', B], 'hanbando\n');
c = st().containers['durango-zone-hanbando'];
const repl = fs.readdirSync(BK).filter((d) => /-replaced$/.test(d));
// 되놓기 자체는 스크립트가 띄우기 **전에** sha256 -c 로 잰다(⑧ 아래 줄의 `되놓음 ✓`) · 뒤의 DB 수 줄이 -shm(색인)을 만지므로 여기선 본·-wal 을 본다
ok(r.rc === 0 && /3개 · sha256 일치/.test(r.out) && ['world-hanbando.db', 'world-hanbando.db-wal'].every((f) => sha(path.join(z.vol, f)) === sumsA[f]) && fs.existsSync(path.join(z.vol, 'world-hanbando.db-shm')),
  '되놓은 세 파일 = 백업(= 옛 세계) — 띄우기 전 sha256 일치 · 본·-wal 바이트 그대로', `rc=${r.rc}`);
ok(repl.length === 1 && fs.readdirSync(path.join(BK, repl[0])).length === newSums.length, '새 세계 DB 는 지우지 않고 옆(-replaced)으로 치웠다', repl[0]);
ok(c.imageId === 'sha256:' + 'a'.repeat(64) && envOf('PLAYER_CAP') === '150' && !envOf('T565_MAP_LIVE') && envOf('CENTRAL_SECRET') === SECRET, '옛 이미지(:pre-reset) · 옛 env(T565 없음 · 정원 150) · 비밀 그대로');
r = run(['hanbando', '--restore', path.join(TMP, 'nope')], 'hanbando\n');
ok(r.rc !== 0 && /백업 폴더가 아니다/.test(r.out), '백업 폴더가 아니면 거부');

console.log('\n⑨ central --keep-accounts — 진짜 central 스키마');
const CV = path.join(SRV, 'central'); fs.mkdirSync(CV, { recursive: true });
(async () => {
  // 정본 스키마는 진짜 central 이 만든다(손으로 적지 않는다) — 띄우고 표가 서면 내린다.
  const port = 39000 + Math.floor(Math.random() * 900);
  const ch = spawn(process.execPath, ['--experimental-sqlite', path.join(ROOT, 'server', 'central.js')], { env: Object.assign({}, process.env, { DB_PATH: path.join(CV, 'central.db'), PORT: String(port) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let said = ''; ch.stdout.on('data', (d) => { said += d; }); ch.stderr.on('data', (d) => { said += d; });
  for (let i = 0; i < 100 && !/central server up/.test(said); i++) await new Promise((res) => setTimeout(res, 100));
  ch.kill('SIGTERM'); await new Promise((res) => ch.on('exit', res));
  ok(/central server up/.test(said), '[전제] 진짜 central 이 떠서 표를 만들었다');
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(path.join(CV, 'central.db'));
  d.exec("INSERT INTO players (player_id,name,color,password_hash,password_salt,wood,stone,tools_json,inventory_json,hunger,thirst,tribe_id,last_zone,last_x,last_y,home_zone,home_x,home_y,created_at,last_seen) VALUES ('alice','alice','#112233','HASH','SALT',7,3,'{\"member\":{\"vid\":3}}','{\"bronze_sword\":1}',40,50,1,'hanbando',100,200,'hanbando',100,200,1,2)");
  d.exec("INSERT INTO players (player_id,name,color,guest_token,inventory_json,last_zone,last_x,last_y,created_at) VALUES ('anon_x','여행자abcd','#5a9ae0','" + 'f'.repeat(64) + "','{\"wood\":2}','nippon',5,6,1)");
  d.exec("INSERT INTO tribes (name,leader_id,created_at) VALUES ('늑대','alice',1)"); d.exec("INSERT INTO tribes (name,leader_id,created_at,is_npc) VALUES ('마을가','npc_leader',1,1)");
  d.exec("INSERT INTO wars (attacker_guild_id,defender_guild_id,started_at,loot_rate,damage_rate,aggressor_vp_gain,tier,declared_by) VALUES (1,2,1,0.1,0.1,1,'clean','alice')");
  d.exec("INSERT INTO friends (a,b,since) VALUES ('alice','anon_x',5)"); d.exec("INSERT INTO tribe_invites (tribe_id,player_id,at) VALUES (1,'anon_x',3)");
  d.close();
  const S2 = st(); S2.images['durango-central'] = { id: 'sha256:' + 'c'.repeat(64), commit: 'cc' };
  S2.containers['durango-central'] = { state: 'running', image: 'durango-central', imageId: 'sha256:' + 'c'.repeat(64), data: CV, port: '3010', labels: {},
    env: ['PORT=3010', 'DB_PATH=/data/central.db', 'PUBLIC_HOST=203.0.113.1', 'ZONE_HOST_NIPPON=203.0.113.9', 'CENTRAL_SECRET=' + SECRET] };
  fs.writeFileSync(STATE, JSON.stringify(S2));
  r = run(['central', '--keep-accounts']);
  ok(r.rc === 0 && /사람 2\(계정 1 · 손님 1\)/.test(r.out) && /길드 2/.test(r.out), '예행: 사람·길드 수를 진짜 DB 에서 센다', (r.out.match(/DB central[^\n]*/) || [''])[0].slice(0, 110));
  r = run(['central', '--apply', '--keep-accounts'], 'central\n지운다\n');
  ok(r.rc !== 0 && fs.existsSync(path.join(CV, 'central.db')), '둘째 글자가 "계정만" 이 아니면 안 한다');
  const S3 = st(); S3.containers['durango-central'].state = 'running'; fs.writeFileSync(STATE, JSON.stringify(S3));
  r = run(['central', '--apply', '--keep-accounts'], 'central\n계정만\n');
  const d2 = new DatabaseSync(path.join(CV, 'central.db'), { readOnly: true });
  const al = d2.prepare("SELECT * FROM players WHERE player_id='alice'").get(), gx = d2.prepare("SELECT * FROM players WHERE player_id='anon_x'").get();
  const cnt = (t) => d2.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  ok(r.rc === 0 && al && gx && al.password_hash === 'HASH' && al.password_salt === 'SALT' && al.color === '#112233' && gx.guest_token === 'f'.repeat(64) && gx.name === '여행자abcd', '신원 칸(이름·비번·색·게스트 열쇠) 그대로', `rc=${r.rc}`);
  ok(al.inventory_json === '{}' && al.tools_json === '{}' && al.wood === 0 && al.stone === 0 && al.hunger === 100 && al.thirst === 100 && al.tribe_id === null && al.last_zone === null && al.home_zone === null && gx.last_zone === null && gx.inventory_json === '{}',
    '몸·짐·자리·소속 = 스키마 기본값(가입 직후의 몸)', `inv=${al.inventory_json} hunger=${al.hunger} last=${al.last_zone}`);
  ok(cnt('tribes') === 0 && cnt('wars') === 0 && cnt('tribe_invites') === 0 && cnt('friends') === 1, '길드·전쟁·초대 0 · 벗 1 남김');
  d2.close();
  console.log('\n⑩ central --keep-all');
  const S4 = st(); S4.containers['durango-central'].state = 'running'; fs.writeFileSync(STATE, JSON.stringify(S4));
  const cs = sha(path.join(CV, 'central.db'));
  r = run(['central', '--apply', '--keep-all'], 'central\n');
  ok(r.rc === 0 && sha(path.join(CV, 'central.db')) === cs && /지울 것 0/.test(r.out), '백업만 하고 central DB 는 바이트 그대로', `rc=${r.rc}`);
  r = run(['hanbando', '--keep-all']);
  ok(r.rc !== 0, '존에 --keep-* 는 거부(존 DB 는 통째로 지운다)');

  console.log('\n⑩b 옛 이미지 — 빌드가 태그를 옮기면 옛 이미지가 사라지는 저장소(containerd · 마른 연습 실측)');
  const gone = () => { const Sg = st(); delete Sg.images['old-zone-id']; for (const k of Object.keys(Sg.images)) if (/pre-reset/.test(k)) delete Sg.images[k]; fs.writeFileSync(STATE, JSON.stringify(Sg)); };
  fresh(); r = run(['hanbando', '--pin']);
  ok(r.rc === 0 && st().images['durango-zone:pre-reset'] && st().images['durango-zone:pre-reset'].id === 'sha256:' + 'a'.repeat(64), '--pin = 도는 컨테이너 이미지에 `:pre-reset`(빌드 전에)', `rc=${r.rc}`);
  { const Sg = st(); delete Sg.images['old-zone-id']; fs.writeFileSync(STATE, JSON.stringify(Sg)); }   // 빌드가 태그를 옮겨 옛 이름이 사라진 판 — 고정본은 남는다
  r = run(['hanbando']);
  ok(/옛 이미지 durango-zone:pre-reset = 이 컨테이너 것/.test(r.out), '예행이 고정본을 알아본다');
  r = run(['hanbando', '--apply'], 'hanbando\n지운다\n');
  { const Bp = path.join(BK, fs.readdirSync(BK).filter((d) => /-hanbando$/.test(d)).sort().pop());
    ok(r.rc === 0 && st().images['durango-zone:pre-reset'].id === 'sha256:' + 'a'.repeat(64) && /pre_reset_tag=durango-zone:pre-reset/.test(fs.readFileSync(path.join(Bp, 'meta.txt'), 'utf8')),
      '--apply 가 고정본(옛 이미지 = 이 컨테이너 것)을 meta 에 적는다', `rc=${r.rc}`); }
  fresh(); gone();
  r = run(['hanbando']);
  ok(r.rc === 0 && /저장소에 없다/.test(r.out), '고정 없이 옛 이미지가 사라진 판 — 예행이 ✗ 를 찍는다(DB 수는 지금 이미지로 센다)', (r.out.match(/DB world[^\n]*/) || ['DB 줄 없음'])[0].slice(0, 60));
  r = run(['hanbando', '--apply'], 'hanbando\n지운다\n');
  const Bg = path.join(BK, fs.readdirSync(BK).filter((d) => /-hanbando$/.test(d)).sort().pop());
  ok(r.rc === 0 && /없다 — 되돌리기는 옛 DB/.test(r.out) && /pre_reset_tag=-/.test(fs.readFileSync(path.join(Bg, 'meta.txt'), 'utf8')), '--apply 는 멈추지 않고 경고 · meta 에 고정본 없음(-)', `rc=${r.rc}`);
  r = run(['hanbando', '--restore', Bg], 'hanbando\n');
  ok(r.rc === 0 && /지금 이미지/.test(r.out) && st().containers['durango-zone-hanbando'].imageId === 'sha256:' + 'b'.repeat(64), '되돌리기는 옛 DB + 지금 이미지로(경고와 함께)', `rc=${r.rc}`);

  { fresh(); const Si = st(); Si.containers['durango-zone-hanbando'].image = 'sha256:' + 'a'.repeat(64); fs.writeFileSync(STATE, JSON.stringify(Si));
    r = run(['hanbando']);
    ok(r.rc === 0 && /고정 전 — 빌드 \*\*전에\*\* --pin\(태그 durango-zone:pre-reset\)/.test(r.out), '이미지 id 로 만든 컨테이너도 이름(durango-zone)으로 읽는다 — `sha256:pre-reset` 같은 태그 0', (r.out.match(/옛 이미지[^\n]*/) || [''])[0].slice(0, 80)); }

  console.log('\n⑪ 비밀 — 무접촉 · 값 0');
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const uses = src.split('\n').filter((l) => /\$SECRET_FILE|\.durango-secret/.test(l) && !/^\s*#/.test(l));
  ok(uses.every((l) => /SECRET_FILE=\/root\/\.durango-secret$|\[ -e "\$SECRET_FILE" \]|stat -c %a "\$SECRET_FILE"|비밀  /.test(l)), '소스: 비밀 파일 경로는 정의·있나(-e)·권한(stat)·표시에만 — 여는 줄 0', `${uses.length}줄`);
  ok(!sfBefore || (sha(secretFile) === sfBefore.sha && fs.statSync(secretFile).mtimeMs === sfBefore.m), '이 상자의 비밀 파일(있으면) sha·mtime 무변', sfBefore ? '있음' : '없음');
  const allOut = [];
  for (const args of [['hanbando'], ['central'], ['hanbando', '--check']]) allOut.push(run(args).out);
  ok(!allOut.some(leakIn) && leakFiles(BK) === 0 && leakFiles(SRV) === 0, '화면·백업 폴더·볼륨 어디에도 비밀 값 0', `백업 파일 중 값 ${leakFiles(BK)}`);

  console.log('\n⑫ ★자명 통과 금지 — 값을 흘리는 미끼 사본');
  const bait = path.join(TMP, 'bait.sh');
  fs.writeFileSync(bait, src.replace('    for kv in ${NEWENV[@]+"${NEWENV[@]}"}; do export "$kv"; a+=(-e "${kv%%=*}"); done', '    for kv in ${NEWENV[@]+"${NEWENV[@]}"}; do a+=(-e "$kv"); done'));
  ok(fs.readFileSync(bait, 'utf8') !== src, '[전제] 미끼는 원본과 다르다(값을 명령줄에 싣는 한 줄)');
  fresh(); const Sb = st(); Sb.containers['durango-zone-hanbando'].state = 'exited'; fs.writeFileSync(STATE, JSON.stringify(Sb));
  for (const f of dbFiles(path.join(SRV, 'hanbando'))) fs.unlinkSync(path.join(SRV, 'hanbando', f));
  r = run(['hanbando', '--up'], '', {}, bait);
  ok(st().argv.some(leakIn), '미끼는 같은 자에 **잡힌다**(명령줄에 비밀 값)', '원본은 ⑥에서 0');
  const bait2 = path.join(TMP, 'bait2.sh');
  fs.writeFileSync(bait2, src.replace('[ "$a" = "$2" ]', 'true'));
  fresh();
  r = run(['hanbando', '--apply'], 'x\ny\n', {}, bait2);
  ok(dbFiles(path.join(SRV, 'hanbando')).length === 0, '프롬프트를 뺀 미끼는 틀린 글자에도 지운다 — ②③ 의 자가 그걸 본다', '원본은 ②③에서 그대로');

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
