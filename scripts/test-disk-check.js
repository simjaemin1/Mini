#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-disk-check.js — `disk-check.sh` 를 **진짜로 돌린다**(T901 · 2026-10-23) ========================
//
// `test-redeploy` · `test-reset-world` 문법 — 판정 사본 0: 가짜 `docker`(상태를 JSON 에 쥐는 작은 흉내 · 모르는 꼴은 크게 죽는다) ·
//   가짜 `ssh`(별칭 버리고 그 자리 bash) · 가짜 `df`(빈 자리를 env 로)를 PATH 앞에 세우고, 볼륨 뿌리는 `DISK_SRV` 로 임시 판에 옮긴다.
//   지키는 것:
//     ① 목록 — `.bak` · `_reset` · 볼륨 DB · 이미지 · 지울 후보(되돌리기에 쓰는 것 — 컨테이너 이미지 · :latest · :prev-<대상> · :pre-reset — 와 durango 밖은 빠진다)
//     ② 판정 — 빈 자리 ≥ 백업 한 벌(DB 합 × 11/10 + 64 MB) ok · 모자라면 bad(같은 판 · 빈 자리만 바꿔 — 자명 통과 0) · 그 규칙 글자가 reset-world.sh 와 같다
//     ③ `--prune` — 별칭을 잘못 치면 아무것도 안 지운다 · 바로 치면 후보만 지운다 · DB · .bak · _reset 바이트 무변
//     ④ 그 사이(목록 → 지우기) 후보가 되돌리기 이미지가 되면 안 지운다
//     ⑤ 컨테이너 env 를 한 번도 안 읽는다(비밀 0)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'disk-check.sh');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'diskchk-'));
const BIN = path.join(TMP, 'bin'), SRV = path.join(TMP, 'srv'), STATE = path.join(TMP, 'docker.json');
fs.mkdirSync(BIN, { recursive: true });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

fs.writeFileSync(path.join(BIN, 'docker'), `#!/usr/bin/env node
'use strict';
const fs = require('fs'); const SF = process.env.FAKE_STATE; const S = JSON.parse(fs.readFileSync(SF, 'utf8'));
const save = () => fs.writeFileSync(SF, JSON.stringify(S, null, 1));
const a = process.argv.slice(2); S.argv.push(a.join(' ')); save();
const die = (m, c) => { process.stderr.write(m + '\\n'); process.exit(c || 1); };
const fmt = () => { const i = a.indexOf('--format'); return i >= 0 ? a[i + 1] : null; };
const J = a.join(' ');
if (J === 'info') return console.log('fake');
if (a[0] === 'info' && fmt() === '{{.DockerRootDir}}') return console.log(process.env.DISK_SRV);
if (J === 'ps -aq') return console.log(Object.keys(S.containers).map((n) => 'cid-' + n).join('\\n'));
if (a[0] === 'ps' && a[1] === '-a' && fmt() === '{{.Names}}') return console.log(Object.keys(S.containers).join('\\n'));
if (a[0] === 'inspect' && fmt() === '{{.Image}}') { return console.log(a.slice(3).map((c) => S.containers[c.replace(/^cid-/, '')].image).join('\\n')); }
if (a[0] === 'inspect' && fmt() === '{{.LogPath}}') return console.log('/nonexistent/' + a[3] + '.log');
if (a[0] === 'images') {
  if (a.includes('dangling=true')) return console.log(S.images.filter((i) => !i.tags.length).map((i) => i.id).join('\\n'));
  const f = fmt(), rows = [];
  for (const i of S.images) for (const t of (i.tags.length ? i.tags : ['<none>:<none>'])) rows.push(f
    .replace('{{.ID}}', a.includes('--no-trunc') ? i.id : i.id.slice(7, 19)).replace('{{.Size}}', i.size).replace('{{.Repository}}:{{.Tag}}', t).replace('{{.CreatedSince}}', '1 day ago'));
  return console.log(rows.join('\\n'));
}
if (a[0] === 'system' && a[1] === 'df') return console.log('Images|1GB|300MB (30%)\\nBuild Cache|500MB|500MB');
if (a[0] === 'image' && a[1] === 'rm') { const t = a[2]; const i = S.images.find((x) => x.tags.includes(t)); if (!i) die('No such image: ' + t); i.tags = i.tags.filter((x) => x !== t); S.removed.push(t); save(); return console.log('Untagged: ' + t); }
if (a[0] === 'image' && a[1] === 'prune') { S.pruned.push('image'); save(); return console.log('Total reclaimed space: 0B'); }
if (a[0] === 'builder' && a[1] === 'prune') { S.pruned.push('builder'); save(); return console.log('Total:\\t500MB'); }
die('가짜 docker: 모르는 꼴 ' + J, 9);
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'ssh'), `#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -[oipFlJ]) shift 2 ;; -*) shift ;; *) break ;; esac; done
h=$1; shift
case "$h" in down) echo "ssh: connect to host down port 22: Connection refused" >&2; exit 255 ;; esac
#   ④ 경합 흉내 — 지우기 판 직전에 후보 하나를 컨테이너가 쓰게 바꾼다
if [ -n "\${FAKE_RACE:-}" ] && [[ "$*" == *prune* ]]; then node -e 'const f=process.env.FAKE_STATE,S=JSON.parse(require("fs").readFileSync(f));S.containers.extra={image:process.env.FAKE_RACE};require("fs").writeFileSync(f,JSON.stringify(S))'; fi
exec bash -c "$*"
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'df'), `#!/usr/bin/env bash
echo "Filesystem 1-blocks Used Available Capacity Mounted"
echo "fake 100000000000 50000000000 \${FAKE_AVAIL:-40000000000} 50% /fake"
`, { mode: 0o755 });

const ID = (c) => 'sha256:' + c.repeat(64);
function fresh() {
  fs.rmSync(SRV, { recursive: true, force: true });
  for (const d of ['hanbando', 'nippon', 'central', '_reset/20261023-010203-hanbando', '_daily/20261024-031408-hanbando']) fs.mkdirSync(path.join(SRV, d), { recursive: true });
  fs.writeFileSync(path.join(SRV, 'hanbando', 'world-hanbando.db'), crypto.randomBytes(300000));
  fs.writeFileSync(path.join(SRV, 'hanbando', 'world-hanbando.db-wal'), crypto.randomBytes(50000));
  fs.writeFileSync(path.join(SRV, 'nippon', 'world-nippon.db'), crypto.randomBytes(100000));
  fs.writeFileSync(path.join(SRV, 'central', 'central.db'), crypto.randomBytes(20000));
  fs.writeFileSync(path.join(SRV, 'hanbando', 'world-hanbando.db.0803.bak'), crypto.randomBytes(70000));
  fs.writeFileSync(path.join(SRV, 'nippon', 'world-nippon.db.0804.bak'), crypto.randomBytes(80000));
  fs.writeFileSync(path.join(SRV, '_reset', '20261023-010203-hanbando', 'world-hanbando.db'), crypto.randomBytes(90000));
  fs.writeFileSync(path.join(SRV, '_daily', '20261024-031408-hanbando', 'world-hanbando.db'), crypto.randomBytes(110000));   // [T907] 매일 스냅샷
  fs.writeFileSync(STATE, JSON.stringify({ argv: [], removed: [], pruned: [],
    containers: { 'durango-zone-hanbando': { image: ID('a') }, 'durango-central': { image: ID('c') } },
    images: [
      { id: ID('a'), size: '475MB', tags: ['durango-zone:latest'] },            // 컨테이너가 쓴다 + :latest
      { id: ID('b'), size: '470MB', tags: ['durango-zone:prev-hanbando'] },     // 갱신 되돌리기
      { id: ID('c'), size: '460MB', tags: ['durango-central:latest'] },
      { id: ID('d'), size: '468MB', tags: ['durango-zone:pre-reset'] },         // 초기화 되돌리기
      { id: ID('e'), size: '468MB', tags: ['durango-zone:t872-seed'] },         // ← 후보
      { id: ID('f'), size: '465MB', tags: ['durango-central:old-1022'] },       // ← 후보
      { id: ID('9'), size: '160MB', tags: ['node:22-alpine'] },                 // durango 밖 — 후보 아님
    ] }));
}
const files = () => { const o = {}; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else o[path.relative(SRV, p)] = sha(p); } }; walk(SRV); return o; };
function run(args, input, env) {
  try { return { out: execFileSync('bash', [SCRIPT, ...args], { input: input || '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: `${BIN}:${process.env.PATH}`, FAKE_STATE: STATE, DISK_SRV: SRV, SYNC_TOKYO: '-' }, env || {}) }), rc: 0 }; }
  catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), rc: e.status }; }
}
const st = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));

console.log('\n=== disk-check — 서버 디스크 · 백업 점검(T901) ===\n① 목록');
fresh();
let r = run([]);
ok(r.rc === 0 && /\.bak 2개/.test(r.out) && /2026-\d\d-\d\d .*world-hanbando\.db\.0803\.bak/.test(r.out) && /_reset 백업 1벌/.test(r.out) && /볼륨 hanbando .*\(DB /.test(r.out),
  '`.bak` 둘 · `_reset` 한 벌 · 볼륨 DB 를 찍는다(목록만)', `rc=${r.rc}`);
ok(/_daily 매일 스냅샷 1벌/.test(r.out) && /_daily .*20261024-031408-hanbando/.test(r.out) && !/볼륨 _daily/.test(r.out),
  '[T907] `_daily` 매일 스냅샷은 목록 · 크기로 따로 — 볼륨(DB 합 · 백업 한 벌)에 안 든다');
const cand = (r.out.split('지울 수 있는 옛 durango 이미지')[1] || '');
ok(/durango-zone:t872-seed/.test(cand) && /durango-central:old-1022/.test(cand) && !/latest|prev-hanbando|pre-reset|node:22/.test(cand),
  '★지울 후보 = 옛 durango 태그 둘뿐 — 컨테이너 이미지 · :latest · :prev-<대상> · :pre-reset · durango 밖은 빠진다', cand.split('\n').slice(0, 3).join(' | ').trim());
console.log('\n② 판정 — 빈 자리 ≥ 백업 한 벌(DB 합 × 11/10 + 64 MB)');
ok(/판정: 빈 자리 .* ≥ 백업 한 벌/.test(r.out) && /판정: 두 호스트 모두/.test(r.out), '빈 자리 40 GB → ok');
r = run([], '', { FAKE_AVAIL: String(60 * 1024 * 1024) });
ok(/판정: 빈 자리 60\.0 MB < 백업 한 벌/.test(r.out) && !/두 호스트 모두/.test(r.out), '★같은 판 · 빈 자리만 60 MB → bad(자명 통과 0 — 64 MB 여유도 못 넣는다)');
const rule = (f) => (fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8').match(/\* 11 \/ 10 \+ 64 \* 1024 \* 1024/g) || []).length;
ok(rule('reset-world.sh') >= 1 && rule('disk-check.sh') === 1 && rule('live-lag.sh') === 1, '규칙 글자(`× 11 / 10 + 64 MB`)가 reset-world.sh(정본) · disk-check.sh · live-lag.sh 셋에 같다 — 사본이 갈리면 빨강',
  `reset-world ${rule('reset-world.sh')} · disk-check ${rule('disk-check.sh')} · live-lag ${rule('live-lag.sh')}`);
console.log('\n③ --prune');
fresh(); const F0 = files();
r = run(['--prune'], 'tokyo\n');
ok(r.rc === 0 && /그만뒀다/.test(r.out) && !st().removed.length && !st().pruned.length && JSON.stringify(files()) === JSON.stringify(F0), '별칭을 잘못 치면(tokyo ≠ seoul) 아무것도 안 지운다 · prune 0');
r = run(['--prune'], 'seoul\n');
const S1 = st();
ok(S1.removed.sort().join(' ') === 'durango-central:old-1022 durango-zone:t872-seed' && S1.pruned.join(' ') === 'image builder',
  '★별칭을 바로 치면 — 옛 durango 태그 둘 · 매달린 이미지 · 빌드 캐시만', `${S1.removed.join(' ')} · prune ${S1.pruned.join(' ')}`);
ok(JSON.stringify(files()) === JSON.stringify(F0) && Object.keys(F0).length === 8, '★DB · .bak · _reset · _daily 파일 여덟 바이트 무변(이 카드는 안 지운다)');
ok(S1.images.every((i) => i.tags.length || ['e', 'f'].includes(i.id.slice(7, 8))) && S1.images.find((i) => i.id === ID('b')).tags.length === 1 && S1.images.find((i) => i.id === ID('d')).tags.length === 1,
  '되돌리기 이미지(:prev-hanbando · :pre-reset) · :latest · node 그대로');
console.log('\n④ 그 사이 후보가 되돌리기 이미지가 되면');
fresh(); r = run(['--prune'], 'seoul\n', { FAKE_RACE: ID('e') });
ok(!st().removed.includes('durango-zone:t872-seed') && st().removed.includes('durango-central:old-1022') && /그 사이 되돌리기에 쓰는 이미지가 됐다/.test(r.out), '★지우기 판이 다시 본다 — 컨테이너가 쓰게 된 후보는 안 지운다');
console.log('\n⑤ 비밀 0');
ok(!st().argv.some((x) => /Config\.Env|\{\{\.Config/.test(x)), '컨테이너 env 를 한 번도 안 읽는다(이름 · 크기 · 날짜만)', `docker 부름 ${st().argv.length}번`);
console.log('\n⑥ 호스트가 안 닿으면');
fresh(); r = run([], '', { SYNC_TOKYO: 'down' });
ok(/\[도쿄\(down\)\] ✗ 못 읽었다/.test(r.out) && /판정: 도쿄 못 읽음/.test(r.out) && /\[서울\(seoul\)\]/.test(r.out), '도쿄가 안 닿으면 그 호스트 ✗ · 판정 줄에 든다 · 서울은 그대로 찍는다');
console.log('\n⑦ ★자명 통과 금지 — 되돌리기 이미지를 지킬 줄을 뺀 미끼');
{ const src = fs.readFileSync(SCRIPT, 'utf8'), bait = path.join(TMP, 'bait.sh');
  fs.writeFileSync(bait, src.replace('(latest|pre-reset|prev-[a-z0-9_]+)', '(latest|pre-reset)'));
  fresh();
  let out = ''; try { out = execFileSync('bash', [bait, '--prune'], { input: 'seoul\n', encoding: 'utf8', env: Object.assign({}, process.env, { PATH: `${BIN}:${process.env.PATH}`, FAKE_STATE: STATE, DISK_SRV: SRV, SYNC_TOKYO: '-' }) }); } catch (e) { out = String(e.stdout || ''); }
  ok(fs.readFileSync(bait, 'utf8') !== src && st().removed.includes('durango-zone:prev-hanbando'), '[미끼] :prev-<대상> 을 안 지키는 사본은 되돌리기 이미지를 지운다 — ①·③ 의 "그대로" 가 문다'); }
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
