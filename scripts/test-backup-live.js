#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-backup-live.js — `backup-live.sh` 를 **진짜로 돌린다**(T907 · 2026-10-24) ========================
//
// `test-disk-check` 문법 — 판정 사본 0: 가짜 `docker`(상태를 JSON 에 쥔다 · `run` 은 마운트를 임시 판 경로로 바꿔 **진짜 node:sqlite** 로 돈다 ·
//   모르는 꼴은 크게 죽는다) · 가짜 `curl`(/health = 그 포트 컨테이너가 켜졌나) · 가짜 `crontab`(파일 하나)을 PATH 앞에 세운다.
//   지키는 것:
//     ① 스냅샷 — 대상마다 `<시각>-<대상>/` 에 .db 한 파일 · SHA256SUMS · meta(표마다 행 수 = 원본) · 빈 -wal/-shm 안 남김 · 비밀 0
//     ② 보관 — BACKUP_KEEP 벌만(대상마다) · 복원이 옮긴 `-replaced` 는 셈 밖(안 지운다)
//     ③ 복원 — 대상 이름을 잘못 치면 무변 · 바로 치면 멈춤 → 지금 DB 옆으로(안 지움) → 사본 놓기(sha · 행 수) → 켬 → /health
//     ④ 깨진 사본 · 남의 사본은 멈추기 앞에 거절
//     ⑤ --install · --uninstall · --status — 표 붙은 줄 하나만 · 남의 crontab 줄 그대로
//     ⑥ 미끼 — sha 확인 줄을 뺀 사본은 깨진 사본을 놓는다(④ 가 문다)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'backup-live.sh');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'backuplive-'));
const BIN = path.join(TMP, 'bin'), SRV = path.join(TMP, 'srv'), DAILY = path.join(SRV, '_daily'), STATE = path.join(TMP, 'docker.json'), CRON = path.join(TMP, 'crontab');
fs.mkdirSync(BIN, { recursive: true });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const SECRET = 'S3CRET-' + crypto.randomBytes(6).toString('hex');
const SQL = ['node', '--no-warnings', '--experimental-sqlite'];

fs.writeFileSync(path.join(BIN, 'docker'), `#!/usr/bin/env node
'use strict';
const fs = require('fs'); const { spawnSync } = require('child_process'); const SF = process.env.FAKE_STATE; const S = JSON.parse(fs.readFileSync(SF, 'utf8'));
const save = () => fs.writeFileSync(SF, JSON.stringify(S, null, 1));
const a = process.argv.slice(2); S.argv.push(a.join(' ')); save();
const die = (m, c) => { process.stderr.write(m + '\\n'); process.exit(c || 1); };
const fi = a.indexOf('--format'); const f = fi >= 0 ? a[fi + 1] : null;
const C = (n) => S.containers[n] || die('Error: No such container: ' + n);
if (a[0] === 'ps' && f === '{{.Names}}') return console.log(Object.keys(S.containers).filter((n) => S.containers[n].running).join('\\n'));
if (a[0] === 'inspect' && !f) { C(a[1]); return console.log('[{}]'); }
if (a[0] === 'inspect' && f === '{{.Image}}') return console.log(C(a[1]).image);
if (a[0] === 'inspect' && /Mounts/.test(f)) return console.log(C(a[1]).vol);
if (a[0] === 'inspect' && /Config\\.Env/.test(f)) return console.log(C(a[1]).env.join('\\n'));
if (a[0] === 'inspect' && /PortBindings/.test(f)) return console.log(C(a[1]).port);
if (a[0] === 'image' && a[1] === 'inspect') { if (!S.images.includes(a[2])) die('Error: No such image: ' + a[2]); return f ? console.log('c0ffee' + a[2].slice(-6)) : console.log('[{}]'); }
if (a[0] === 'stop') { C(a[a.length - 1]).running = false; S.events.push('stop ' + a[a.length - 1]); save(); return console.log(a[a.length - 1]); }
if (a[0] === 'start') { C(a[1]).running = true; S.events.push('start ' + a[1]); save(); return console.log(a[1]); }
if (a[0] === 'run') {
  const m = {}; let i = 1; for (; i < a.length; i++) { if (a[i] === '-v') { const [h, c] = a[++i].split(':'); m[c] = h; } else if (/^--?/.test(a[i])) { if (a[i] === '--network') i++; } else break; }
  if (!S.images.includes(a[i])) die('Unable to find image ' + a[i]);
  const rest = a.slice(i + 1).map((x) => x.replace(/^\\/(data|out)\\//, (_, k) => m['/' + k] + '/'));
  S.events.push('run ' + rest.slice(-3).join(' ').replace(/\\S*\\//g, '')); save();
  const r = spawnSync(rest[0], rest.slice(1), { stdio: ['inherit', 'inherit', 'inherit'] }); process.exit(r.status);
}
die('가짜 docker: 모르는 꼴 ' + a.join(' '), 9);
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'curl'), `#!/usr/bin/env node
const S = JSON.parse(require('fs').readFileSync(process.env.FAKE_STATE, 'utf8')); const u = process.argv.find((x) => /^http/.test(x)) || '';
const p = (u.match(/:(\\d+)\\//) || [])[1]; const c = Object.values(S.containers).find((x) => String(x.port) === p);
process.exit(c && c.running && /\\/health$/.test(u) ? 0 : 7);
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'crontab'), `#!/usr/bin/env bash
F="$FAKE_CRON"; case "$1" in -l) [ -f "$F" ] && cat "$F" || { echo "no crontab for root" >&2; exit 1; } ;; -) cat > "$F" ;; *) echo "가짜 crontab: $*" >&2; exit 9 ;; esac
`, { mode: 0o755 });

// 진짜 SQLite 판 — WAL · 표 셋(존) / 둘(central)
function mkdb(file, tables, rows) {
  execFileSync(SQL[0], [...SQL.slice(1), '-e', `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(${JSON.stringify(file)});d.exec('PRAGMA journal_mode=WAL');
    for (const [t,n] of ${JSON.stringify(tables.map((t, k) => [t, rows[k]]))}) { d.exec('CREATE TABLE IF NOT EXISTS '+t+' (i INTEGER PRIMARY KEY, v TEXT)'); const s=d.prepare('INSERT INTO '+t+' (v) VALUES (?)'); d.exec('BEGIN'); for (let k=0;k<n;k++) s.run('v'+k+'-'+Math.random()); d.exec('COMMIT'); } d.close();`]);
}
const count = (file) => JSON.parse(execFileSync(SQL[0], [...SQL.slice(1), '-e', `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(${JSON.stringify(file)},{readOnly:true});
  const o={};for(const {name} of d.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()) o[name]=d.prepare('SELECT COUNT(*) n FROM '+name).get().n;console.log(JSON.stringify(o))`], { encoding: 'utf8' }));
function fresh() {
  fs.rmSync(SRV, { recursive: true, force: true }); fs.rmSync(CRON, { force: true });
  for (const d of ['hanbando', 'central']) fs.mkdirSync(path.join(SRV, d), { recursive: true });
  mkdb(path.join(SRV, 'hanbando', 'world-hanbando.db'), ['chunks', 'players', 'items'], [400, 30, 120]);
  mkdb(path.join(SRV, 'central', 'central.db'), ['accounts', 'zones'], [12, 3]);
  fs.writeFileSync(STATE, JSON.stringify({ argv: [], events: [], images: ['sha256:zone1', 'sha256:cent1', 'durango-zone', 'durango-central'],
    containers: {
      'durango-zone-hanbando': { running: true, image: 'sha256:zone1', vol: path.join(SRV, 'hanbando'), port: 3020, env: ['PORT=3020', 'DB_PATH=/data/world-hanbando.db', 'ZONE_SECRET=' + SECRET] },
      'durango-central': { running: true, image: 'sha256:cent1', vol: path.join(SRV, 'central'), port: 3010, env: ['DB_PATH=/data/central.db', 'JWT_SECRET=' + SECRET] },
      'other-thing': { running: true, image: 'sha256:x', vol: '', port: 9, env: [] } } }));
}
function run(args, input, env, script) {
  try { return { out: execFileSync('bash', [script || SCRIPT, ...args], { input: input || '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: `${BIN}:${process.env.PATH}`, FAKE_STATE: STATE, FAKE_CRON: CRON, BACKUP_DAILY_ROOT: DAILY }, env || {}) }), rc: 0 }; }
  catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), rc: e.status }; }
}
const st = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));
const snaps = (t) => (fs.existsSync(DAILY) ? fs.readdirSync(DAILY) : []).filter((d) => d.endsWith('-' + t)).sort();
const allText = (d) => { let s = ''; const w = (p) => { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); fs.statSync(q).isDirectory() ? w(q) : /\.(txt|log)$|SHA256SUMS/.test(f) && (s += fs.readFileSync(q, 'utf8')); } }; if (fs.existsSync(d)) w(d); return s; };

console.log('\n=== backup-live — 라이브 DB 매일 스냅샷 · 복원(T907) ===\n① 스냅샷');
fresh();
let r = run([]);
const H0 = snaps('hanbando'), C0 = snaps('central');
const hd = path.join(DAILY, H0[0] || 'x'), cd = path.join(DAILY, C0[0] || 'x');
ok(r.rc === 0 && H0.length === 1 && C0.length === 1 && !snaps('thing').length, '도는 durango 컨테이너(central · 존)마다 한 벌 — durango 밖은 안 건드린다', `rc=${r.rc} ${H0} ${C0}`);
const hf = path.join(hd, 'world-hanbando.db');
ok(fs.existsSync(hf) && fs.readFileSync(path.join(hd, 'SHA256SUMS'), 'utf8').startsWith(sha(hf)) && fs.existsSync(path.join(cd, 'central.db')),
  'SHA256SUMS = 사본 .db 의 sha256');
const meta = fs.existsSync(path.join(hd, 'meta.txt')) ? fs.readFileSync(path.join(hd, 'meta.txt'), 'utf8') : '';
const mrows = JSON.parse((meta.match(/^facts=(.*)$/m) || [, '{}'])[1]).rows || {};
ok(JSON.stringify(mrows) === JSON.stringify(count(path.join(SRV, 'hanbando', 'world-hanbando.db'))) && /"quick":"ok"/.test(meta) && /^db=world-hanbando\.db$/m.test(meta),
  '★meta 의 표마다 행 수 = 원본(진짜 SQLite 온라인 백업) · quick_check ok', JSON.stringify(mrows));
ok(fs.readdirSync(hd).sort().join(' ') === 'SHA256SUMS meta.txt world-hanbando.db', '사본 폴더 = .db · SHA256SUMS · meta 셋뿐(검사가 남긴 빈 -wal · -shm 안 남김)', fs.readdirSync(hd).join(' '));
ok(!r.out.includes(SECRET) && !allText(DAILY).includes(SECRET), '★비밀 0 — 출력 · meta 에 컨테이너 env 비밀 없음(DB_PATH 만)');
ok(/✓ hanbando → .* 검사 ok · 표 3 · 행 550 /.test(r.out) && /✓ central → .* 표 2 · 행 15 /.test(r.out), '한 줄 — 대상 · 크기 · 검사 · 표 · 행', r.out.split('\n').filter((l) => /✓/.test(l)).join(' | ').replace(new RegExp(DAILY, 'g'), '…'));

console.log('\n② 보관 — BACKUP_KEEP 벌만');
fs.mkdirSync(path.join(DAILY, '20200101-000000-hanbando-replaced'));
for (let k = 0; k < 3; k++) r = run([], '', { BACKUP_KEEP: '2' });
const H1 = snaps('hanbando');
ok(H1.length === 2 && snaps('central').length === 2 && !H1.includes(H0[0]) && /보관 2 벌 넘음 — 지움/.test(r.out), '★네 벌 뒤 대상마다 새것 두 벌 · 첫 벌은 지웠다', H1.join(' '));
ok(fs.existsSync(path.join(DAILY, '20200101-000000-hanbando-replaced')), '`-replaced`(복원이 옮긴 옛 DB)는 셈 밖 — 안 지운다');

console.log('\n③ 복원');
fresh(); run([]);
const S = path.join(DAILY, snaps('hanbando')[0]); const SNAPSHA = sha(path.join(S, 'world-hanbando.db'));
mkdb(path.join(SRV, 'hanbando', 'world-hanbando.db'), ['chunks'], [77]);     // 스냅샷 뒤 쓰기(복원이 되돌릴 것)
const LIVE = path.join(SRV, 'hanbando', 'world-hanbando.db'); const BEFORE = sha(LIVE);
let e0 = st().events.length;
r = run(['hanbando', '--restore', S], 'nippon\n');
ok(r.rc !== 0 && /그만뒀다/.test(r.out) && sha(LIVE) === BEFORE && !st().events.slice(e0).some((x) => /^stop/.test(x)), '이름을 잘못 치면(nippon) 안 멈추고 DB 무변');
e0 = st().events.length;
r = run(['hanbando', '--restore', S], 'hanbando\n');
const ev = st().events.slice(e0).filter((x) => /^(stop|start)/.test(x));
const rep = (fs.readdirSync(DAILY).find((d) => /-hanbando-replaced$/.test(d)) || '');
ok(r.rc === 0 && /\[놓음 ✓\]/.test(r.out) && /\[행 ✓\]/.test(r.out) && /\/health — \d+초/.test(r.out) && sha(LIVE) === SNAPSHA,
  '★바로 치면 — 놓은 DB 바이트 = 스냅샷(sha) · 표마다 행 수 = 스냅샷 · /health', `rc=${r.rc}`);
ok(JSON.stringify(count(LIVE)) === JSON.stringify(mrows), '복원한 DB 를 다시 열어 센 행 수 = 첫 스냅샷의 원본 행 수(스냅샷 뒤 77 행은 빠졌다)', JSON.stringify(count(LIVE)));
ok(rep && sha(path.join(DAILY, rep, 'world-hanbando.db')) === BEFORE, '★지금 DB 는 안 지운다 — `-replaced/` 로 옮겼다(sha = 복원 앞)', rep);
ok(ev.join(' | ') === 'stop durango-zone-hanbando | start durango-zone-hanbando' && st().containers['durango-central'].running, '멈춤 → 켬 차례 · 그 존만(central 은 그대로)', ev.join(' | '));

console.log('\n④ 깨진 사본 · 남의 사본');
const bad = path.join(TMP, 'bad'); fs.rmSync(bad, { recursive: true, force: true }); fs.cpSync(S, bad, { recursive: true });
{ const b = fs.readFileSync(path.join(bad, 'world-hanbando.db')); b[b.length - 100] ^= 0xff; fs.writeFileSync(path.join(bad, 'world-hanbando.db'), b); }
const NOW1 = sha(LIVE); e0 = st().events.length;
r = run(['hanbando', '--restore', bad], 'hanbando\n');
ok(r.rc !== 0 && /SHA256SUMS 와 다르다/.test(r.out) && sha(LIVE) === NOW1 && !st().events.slice(e0).some((x) => /^stop/.test(x)), '★바이트 하나 바뀐 사본 → 멈추기 앞에 거절 · DB 무변');
r = run(['central', '--restore', S], 'central\n');
ok(r.rc !== 0 && /hanbando 것이 아니다|central 것이 아니다/.test(r.out) && st().containers['durango-central'].running, '남의 대상 사본(hanbando → central) 거절');

console.log('\n⑤ --install · --uninstall · --status');
fresh(); fs.writeFileSync(CRON, '5 4 * * * /usr/bin/true # 남의 줄\n');
run(['--install', '19:17']); r = run(['--install', '03:05']);
const cl = fs.readFileSync(CRON, 'utf8').split('\n').filter(Boolean);
ok(cl.length === 2 && cl.includes('5 4 * * * /usr/bin/true # 남의 줄') && /^5 3 \* \* \* cd .* && bash scripts\/backup-live\.sh >> .*backup\.log 2>&1 # durango-backup-live$/.test(cl[1]),
  '★두 번 깔아도 표 붙은 줄 하나(나중 시각 03:05) · 남의 줄 그대로', cl[1].replace(ROOT, '<repo>').replace(DAILY, '<_daily>'));
ok(/--install HH:MM/.test(run(['--install', '7:5']).out) && fs.readFileSync(CRON, 'utf8').split('\n').filter(Boolean).length === 2, '틀린 시각(7:5)은 거절 · crontab 무변');
r = run(['--status']); ok(/crontab: 5 3 /.test(r.out), '--status 가 그 줄을 찍는다');
r = run(['--uninstall']);
ok(fs.readFileSync(CRON, 'utf8').trim() === '5 4 * * * /usr/bin/true # 남의 줄' && /남은 durango-backup-live 줄 0개/.test(r.out), '--uninstall — 그 줄만 뺐다');
fs.rmSync(CRON, { force: true }); run(['--install', '19:17']); r = run(['--uninstall']);
ok(r.rc === 0 && fs.readFileSync(CRON, 'utf8').trim() === '' && /0개/.test(r.out), '그 줄 하나뿐인 crontab 도 --uninstall rc 0 · 빈 crontab(마른 연습이 잡은 판)', `rc=${r.rc}`);

console.log('\n⑥ ★자명 통과 금지 — sha 확인 줄을 뺀 미끼');
fresh(); run([]);
const S2 = path.join(DAILY, snaps('hanbando')[0]); const bad2 = path.join(TMP, 'bad2'); fs.rmSync(bad2, { recursive: true, force: true }); fs.cpSync(S2, bad2, { recursive: true });
{ const b = fs.readFileSync(path.join(bad2, 'world-hanbando.db')); b[b.length - 100] ^= 0xff; fs.writeFileSync(path.join(bad2, 'world-hanbando.db'), b); }
const BAIT = path.join(TMP, 'bait.sh');
const src = fs.readFileSync(SCRIPT, 'utf8'); const baited = src.split('\n').filter((l) => !/sha256sum -c/.test(l)).join('\n');
fs.writeFileSync(BAIT, baited);
const L2 = path.join(SRV, 'hanbando', 'world-hanbando.db'); const pre = sha(L2);
r = run(['hanbando', '--restore', bad2], 'hanbando\n', {}, BAIT);
ok(baited !== src && sha(L2) !== pre && st().events.some((x) => /^stop/.test(x)), '[미끼] sha 확인을 뺀 사본은 깨진 사본을 멈추고 놓는다 — ④ 가 문다', `rc=${r.rc}`);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
