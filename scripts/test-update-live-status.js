#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2   ← [T1443] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// @old-red-also scripts/redeploy-hanbando.sh   (재는 고침이 이 운영 스크립트 — 옛 코드 빨강 판에서 이것도 옛 판으로 · T1383 꼴)
// === scripts/test-update-live-status.js — 배포 줄이 다섯 자리에서 끊기면(서버가 죽으면) 무엇이 남나 · `live-status.sh` 가 알아보나 · 다시 돌리면 마저 하나(T1443 ③) ==========
//
// ★진짜 스크립트를 돈다 — `scripts/redeploy-hanbando.sh` · `scripts/live-status.sh` 를 그대로. `docker` · `curl` 은 가짜(PATH 앞 · 상태 파일 하나)이고
//   `git` 은 진짜(임시 bare 저장소 + 복제 — pull · diff · merge-base 가 실제로 돈다).
//   가짜 docker 는 Docker 의 재시작 규칙을 흉내 낸다: `docker stop` = "손으로 멈춤" 표지 · 다시 켤 때(`__reboot`) `--restart unless-stopped` 는
//   손으로 멈춘 것만 빼고 띄운다(Docker 문서의 unless-stopped 뜻 그대로 — 사고 2026-11-21 의 존 `Exited (255)` 꼴).
//   끊김 = 가짜 docker 가 정한 명령을 하고 나서(빌드는 하기 전에) 배포 줄의 프로세스 묶음을 SIGKILL(서버가 그 자리에서 죽음).
//
//   자리 다섯 × (끊긴 뒤 다시 켬 → 컨테이너 상태 · 스탬프 · `live-status` 판정 → 배포 줄 다시 → 끝 상태)
//     ① 빌드 중  ② central 교체 뒤  ③ 존 stop 뒤 rm 앞(★이번 사고)  ④ 존 rm 뒤 run 앞  ⑤ 존 run 뒤 /health 앞
//   ⑥ 다 끝난 배포 뒤 존만 멈춤(스탬프는 새것) — 판정 ✗ · 고칠 줄 = `--zone`(배포 줄은 할 일 0 이라)
//   ⑦ 다 끝난 판 — 판정 ○(헛 알림 0)
//   ⑧ 배포 줄 첫 줄 — 앞이 끊겼으면 "⚠ 상태 ✗ …"를 먼저 찍는다(하는 일은 그대로)
//   미끼 둘(이 파일 안 — live-status.sh 한 자리 고친 사본): `stamp` 스탬프 = HEAD 만 보면 끝났다 → ⑥ 못 잡음 · `names` 컨테이너가 있기만 하면 돈다 → ③ 못 잡음
// 실행: node scripts/test-update-live-status.js   (약 60초 — 배포 줄 안의 sleep 2 들)
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존(배포 줄 · zone.js)을 띄운다 — 남의 central(기본 3010)에 안 붙게
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1443-st-'));
const BIN = path.join(TMP, 'bin'); fs.mkdirSync(BIN);
const STATE = path.join(TMP, 'docker.json');

// ── 가짜 docker(node) + 껍데기 · 가짜 curl ─────────────────────────────────────────────
fs.writeFileSync(path.join(TMP, 'fakedocker.js'), `
const fs=require('fs');const F=${JSON.stringify(STATE)};const S=JSON.parse(fs.readFileSync(F,'utf8'));const a=process.argv.slice(2);
const save=()=>fs.writeFileSync(F,JSON.stringify(S));const cut=process.env.FAKE_CUT||'';let out='',code=0,die=false;
const arg=(k)=>{const i=a.indexOf(k);return i>=0?a[i+1]:null};const C=S.c;
const cutHere=(op,name)=>cut===op+':'+name;
switch(a[0]){
 case 'build':{const t=arg('-t');const lab=(a.find(x=>x.startsWith('durango.commit='))||'').split('=')[1];if(cutHere('build',t)){die=true;break;}S.i[t]={commit:lab};save();break;}
 case 'ps':{const fmt=arg('--format');const all=a.includes('-a');for(const [n,c] of Object.entries(C)){if(!all&&c.state!=='running')continue;
   out+=fmt.replace('{{.Names}}',n).replace('{{.Image}}',c.image).replace('{{.State}}',c.state).replace('{{.Status}}',c.state==='running'?'Up 1 second':'Exited ('+c.code+')')+'\\n';}break;}
 case 'inspect':{const n=a[a.length-1]==='--format'?a[1]:(a.includes('-f')?a[a.length-1]:a[1]);const fmt=arg('-f')||arg('--format')||'';const c=C[n];if(!c){code=1;break;}
   if(fmt.includes('Config.Env'))out=(c.env||[]).join('\\n')+'\\n';
   else if(fmt.includes('State.Status')&&fmt.includes('RestartPolicy'))out=[c.state,c.restart,c.commit||'',c.code].join('|')+'\\n';
   else if(fmt.includes('State.Status'))out=c.state+'\\n';break;}
 case 'image':{const n=a[a.length-1];const im=S.i[n];if(!im){code=1;break;}out=(im.commit||'')+'\\n';break;}
 case 'stop':{const n=a[a.length-1];const c=C[n];if(c){c.state='exited';c.code=143;c.manual=true;save();}if(cutHere('stop',n))die=true;break;}
 case 'rm':{const n=a[a.length-1];delete C[n];save();if(cutHere('rm',n))die=true;break;}
 case 'run':{const n=arg('--name');const img=a[a.length-1];C[n]={image:img,commit:(S.i[img]||{}).commit||'',state:'running',code:0,restart:arg('--restart')||'no',manual:false,env:[]};save();if(cutHere('run',n))die=true;break;}
 case 'logs':out='log\\n';break;
 case '__reboot':{for(const c of Object.values(C)){if(c.state==='running'){c.state='exited';c.code=255;}
   if(c.restart==='always'||(c.restart==='unless-stopped'&&!c.manual)){c.state='running';c.code=0;}}save();break;}
 case '__stop':{const c=C[a[1]];if(c){c.state='exited';c.code=143;c.manual=true;save();}break;}
}
process.stdout.write(out);process.exit(die?99:code);`);
fs.writeFileSync(path.join(BIN, 'docker'), `#!/bin/bash
node ${JSON.stringify(path.join(TMP, 'fakedocker.js'))} "$@"; rc=$?
if [ $rc = 99 ]; then kill -9 -$(ps -o pgid= $$ | tr -d ' ') 2>/dev/null; sleep 5; fi
exit $rc
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'curl'), `#!/bin/bash
u="\${@: -1}"; case "$u" in *3020*) n=durango-zone-hanbando ;; *3010*) n=durango-central ;; *) exit 7 ;; esac
s=$(node -e 'const S=require(process.argv[1]);const c=S.c[process.argv[2]];process.stdout.write(c&&c.state==="running"?"up":"down")' ${JSON.stringify(STATE)} $n)
[ "$s" = up ] && { echo '{"ok":true}'; exit 0; } || exit 7
`, { mode: 0o755 });

// ── 진짜 git: bare + 복제(옛 판 B · 새 판 A — A 는 server/ 를 바꿔 central · 존 둘 다 다시 한다) ──────
const G = (cwd, ...x) => execFileSync('git', ['-c', 'protocol.version=0'].concat(x), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }) }).trim();
const BARE = path.join(TMP, 'origin.git'), SEED = path.join(TMP, 'seed');
G(TMP, 'init', '-q', '--bare', BARE); G(TMP, 'clone', '-q', BARE, SEED);
fs.mkdirSync(path.join(SEED, 'scripts')); fs.mkdirSync(path.join(SEED, 'server'));
for (const f of ['redeploy-hanbando.sh', 'live-status.sh']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(SEED, 'scripts', f));
fs.writeFileSync(path.join(SEED, 'server', 'zone.js'), '// v1\n');
G(SEED, 'add', '-A'); G(SEED, 'commit', '-qm', 'B'); G(SEED, 'push', '-q', 'origin', 'HEAD');
const B = G(SEED, 'rev-parse', 'HEAD');
fs.writeFileSync(path.join(SEED, 'server', 'zone.js'), '// v2\n'); G(SEED, 'commit', '-qam', 'A'); G(SEED, 'push', '-q', 'origin', 'HEAD');
const A = G(SEED, 'rev-parse', 'HEAD');
const fresh = (name) => {   // 서버 하나: 코드 = B · 컨테이너 = B · 스탬프 = B · origin 에는 A 가 있다
  const D = path.join(TMP, name); const R = path.join(D, 'repo');
  G(TMP, 'clone', '-q', BARE, R); G(R, 'reset', '-q', '--hard', B);
  fs.writeFileSync(path.join(D, 'stamp'), B + '\n');
  fs.writeFileSync(STATE, JSON.stringify({ i: { 'durango-zone': { commit: B }, 'durango-central': { commit: B } },
    c: { 'durango-central': { image: 'durango-central', commit: B, state: 'running', code: 0, restart: 'unless-stopped', manual: false, env: [] },
      'durango-zone-hanbando': { image: 'durango-zone', commit: B, state: 'running', code: 0, restart: 'unless-stopped', manual: false, env: [] },
      caddy: { image: 'caddy:2', commit: '', state: 'running', code: 0, restart: 'unless-stopped', manual: false, env: [] } } }));
  return { D, R, stamp: path.join(D, 'stamp') };
};
const env = (H, extra) => Object.assign({}, process.env, { PATH: `${BIN}:${process.env.PATH}`, REPO_DIR: H.R, STAMP: H.stamp }, extra || {});
const deploy = (H, cut) => { const r = spawnSync('setsid', ['bash', path.join(H.R, 'scripts', 'redeploy-hanbando.sh')], { env: env(H, cut ? { FAKE_CUT: cut } : {}), encoding: 'utf8', timeout: 120000 }); if (process.env.T1443_DEBUG) console.log('--- deploy', cut, r.status, r.signal, '\n' + r.stdout + r.stderr); return r; };
const status = (H, file) => { const r = spawnSync('bash', [file || path.join(ROOT, 'scripts', 'live-status.sh'), '--brief'], { env: env(H), encoding: 'utf8' }); return { code: r.status, line: (r.stdout || '').trim() }; };
const st = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));
const reboot = () => execFileSync(path.join(BIN, 'docker'), ['__reboot']);
const stampOf = (H) => fs.readFileSync(H.stamp, 'utf8').trim();

try {
  console.log(`[T1443] 끊긴 배포 — 자리 다섯 × 다시 켬 · 판정 · 다시 돌림 (옛 판 ${B.slice(0, 7)} → 새 판 ${A.slice(0, 7)})`);
  const cuts = [
    ['① 빌드 중', 'build:durango-zone', { zone: 'running', zoneC: B, central: 'running', centralC: B }],
    ['② central 교체 뒤', 'run:durango-central', { zone: 'running', zoneC: B, central: 'running', centralC: A }],
    ['③ 존 stop 뒤 rm 앞(★이번 사고)', 'stop:durango-zone-hanbando', { zone: 'exited', zoneC: B, central: 'running', centralC: A }],
    ['④ 존 rm 뒤 run 앞', 'rm:durango-zone-hanbando', { zone: 'none', central: 'running', centralC: A }],
    ['⑤ 존 run 뒤 /health 앞', 'run:durango-zone-hanbando', { zone: 'running', zoneC: A, central: 'running', centralC: A }],
  ];
  const table = [];
  for (const [nm, cut, exp] of cuts) {
    const H = fresh('h' + table.length); deploy(H, cut); reboot();
    const s = st(), z = s.c['durango-zone-hanbando'], c = s.c['durango-central'];
    const zs = z ? z.state : 'none';
    const shapeOk = zs === exp.zone && (!z || z.commit === exp.zoneC) && c.state === exp.central && c.commit === exp.centralC && stampOf(H) === B;
    const v = status(H);
    const after = deploy(H, null); const s2 = st();
    const fin = !!(s2.c['durango-zone-hanbando'] && s2.c['durango-zone-hanbando'].state === 'running' && s2.c['durango-zone-hanbando'].commit === A && s2.c['durango-central'].commit === A && stampOf(H) === A);
    table.push(`${nm}: 다시 켬 뒤 존 ${zs}${z ? '(' + (z.commit === A ? '새' : '옛') + ')' : ''} · central ${c.commit === A ? '새' : '옛'} · 스탬프 옛 · 판정 ${v.code === 1 ? '✗' : '○'} · 배포 줄 다시 → ${fin ? '마저 함' : '못 함(' + ((after.stdout || '').match(/\[err\][^\n]*/) || ['?'])[0].slice(0, 40) + ')'}`);
    const wantFin = exp.zone !== 'none';   // ④ 는 배포 줄이 "컨테이너 없음"으로 멈춘다(옛 env 도 사라짐) — 판정이 그 길을 말해야 한다
    ok(shapeOk && v.code === 1 && /상태 ✗/.test(v.line) && fin === wantFin && (wantFin || /컨테이너가 없다/.test(v.line)), `${nm} — 끊김 꼴 · 판정 ✗ · 배포 줄 다시 = ${wantFin ? '마저 함' : '못 함(컨테이너 없음 — 판정이 재부팅 절차를 가리킴)'}`, v.line.slice(0, 110));
  }
  console.log('    표: ' + table.join('\n        '));
  // ⑥ 다 끝난 뒤 존만 멈춤(스탬프 새것) — 그 자리에서 미끼 둘도 같은 상태로 묻는다
  const H6 = fresh('h6'); deploy(H6, null); execFileSync(path.join(BIN, 'docker'), ['__stop', 'durango-zone-hanbando']); reboot();
  const v6 = status(H6);
  ok(v6.code === 1 && /--zone/.test(v6.line) && stampOf(H6) === A, '⑥ 다 끝난 뒤 존만 멈춤 — 판정 ✗ · 고칠 줄 = redeploy-hanbando --zone(스탬프가 새것이라 배포 줄은 할 일 0)', v6.line.slice(0, 120));
  const baitCopy = (name, from, to) => { const s = fs.readFileSync(path.join(ROOT, 'scripts', 'live-status.sh'), 'utf8'); const n = s.split(from).length - 1; const f = path.join(TMP, `bait-${name}.sh`); fs.writeFileSync(f, s.split(from).join(to)); return { f, n }; };
  // @bait stamp — 스탬프가 HEAD 와 같으면 끝났다(컨테이너 안 봄)
  const b1 = baitCopy('stamp', 'BAD=(); ROWS=()\n', 'BAD=(); ROWS=()\nif [ -n "$ST" ] && [ "$ST" = "$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null)" ]; then echo "상태 ○ 스탬프 = HEAD"; exit 0; fi   # 미끼: 스탬프만\n');
  const q1 = status(H6, b1.f);
  ok(b1.n === 1 && q1.code === 0, '[미끼 stamp] 바꾼 자리 1곳(스탬프 = HEAD 면 끝) — 그 사본은 ⑥ 존 멈춤을 ○ 라 한다 = ⑥ 물음이 잡는다', `자리 ${b1.n}`);
  // @bait names — 컨테이너가 있기만 하면 돈다고 본다
  const b2 = baitCopy('names', '  if [ "$STATE" != running ]; then BAD+=', '  if false; then BAD+=');
  const q2 = status(H6, b2.f);
  ok(b2.n === 1 && q2.code === 0, '[미끼 names] 바꾼 자리 1곳(상태 안 봄) — 그 사본은 ⑥ 존 멈춤(③ 사고 꼴의 "Exited")을 ○ 라 한다 = ⑥ 물음이 잡는다', `자리 ${b2.n}`);
  // ⑦ 다 끝난 판 — 헛 알림 0
  const H7 = fresh('h7'); deploy(H7, null); reboot(); const v7 = status(H7);
  ok(v7.code === 0 && /상태 ○/.test(v7.line), '⑦ 다 끝난 판 · 다시 켬 — 판정 ○(헛 알림 0)', v7.line);
  // ⑧ 배포 줄 첫 줄 — 앞이 끊겼으면 알린다
  const H8 = fresh('h8'); deploy(H8, 'stop:durango-zone-hanbando'); reboot(); const r8 = deploy(H8, null);
  const first = (r8.stdout || '').split('\n')[0];
  ok(/^⚠ 상태 ✗ 앞 배포가 끊긴 흔적/.test(first) && stampOf(H8) === A, '⑧ 배포 줄 첫 줄 = "⚠ 상태 ✗ 앞 배포가 끊긴 흔적 …" · 하는 일은 그대로(끝까지 감)', first.slice(0, 100));

} finally { fs.rmSync(TMP, { recursive: true, force: true }); }
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
