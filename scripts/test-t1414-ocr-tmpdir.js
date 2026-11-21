#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// @old-red-also scripts/pm-old-code-red.sh (옛 판 = `/tmp` 를 박고 하네스를 앞에서 돌리던 자)
// === scripts/test-t1414-ocr-tmpdir.js — 옛 코드 빨강 자가 `TMPDIR` 를 따르고 찌꺼기 0 · 서버 야생 사망 뒤 사냥꾼 수 (T1414 · T1396 회부 4 · 7) ======
//
// ★왜 [지시 T1414]
//   ⑴ `scripts/pm-old-code-red.sh` 가 `/tmp` 에 바로 mkdtemp 했다 — 샌드박스 세션(S-API · GPT — `/tmp` 쓰기 금지 · TMPDIR 만 열림)에서 못 돌아
//      "옛 코드 빨강"을 손으로 대신했다(T1396 회부 7). 이제 `${TMPDIR:-/tmp}` 아래에 짓고 · 끝나도 · 죽어도(`kill` = TERM) 지운다.
//   ⑵ T1396 회부 4 — 서버 `server/wildlife.js` `reapDead` 에 랩 블록의 `counts` 증분 동기 줄(T311)이 없다. 서버에서 야생 사망 한 번 뒤
//      `counts.hunter` · 마을 인구 · 직업 수의 합이 맞는지 작은 판(호랑이 곁 사냥꾼 하나)으로 잰다.
// ★어떻게
//   ⑴ 자는 **작은 임시 레포**에서 돈다(이 레포를 통째로 worktree 로 꺼내면 1 GB 넘게 쓴다 — 자가 하는 일은 같다):
//      커밋 둘(옛 = 제품 v1 · 새 = 제품 v2 + 탐침 하네스) · `scripts/pm-old-code-red.sh` 는 **지금 이 레포의 그 파일**을 그대로 복사한다
//      (옛 코드 빨강 판에선 `@old-red-also` 로 옛 자가 복사된다 → 빨강이어야 한다). 탐침 하네스(`scripts/test-t1414-probe.js`)는
//      제 자리(`process.cwd()` = 자가 지은 worktree) · pid · 제품 판을 적고 — 빨강(✗ 한 줄 · RC 1) · 잠(죽을 때까지) 둘 중 하나로 선다.
//   ⑵ 존 자식 하나(임시 DB · 마을 · 도적 · 길 끔 — `test-npc-wild-sync` 꼴): 존의 야생 인스턴스를 최소 host 로 다시 init 하고
//      피해 문은 **존의 진짜 `damagePlayer`** · 사냥꾼 몸 하나(NPC · hp 50) 곁에 랩 호랑이(돌진 · 표적 = 그 몸) → 야생 틱만 돈다.
//      econ 마을 하나(`sim/economy-sim` `createVillage` · 사냥꾼 하나 이상)의 사망 앞뒤를 센다.
// 보는 것:
//   ① 보통 판 — 출력 글자가 종전 꼴 그대로(머리 · `빨강 ○ | … | RC=1 · ✓ 0 · ✗ 1 | …` · `모름(시한) | … | RC=124 …` · 합 줄) · `PROD=` 꼴
//   ② ★★`TMPDIR` 따름 — 탐침이 선 자리가 준 TMPDIR(낯선 폴더 · 빈칸 · 한글) 아래 `ocr.*/w` 다 · 제품 판은 옛 것(v1)이다
//   ③ ★★찌꺼기 0 — 끝난 뒤 그 TMPDIR 비어 있음 · `/tmp` 에 새 `ocr.*` 0 · worktree 장부에 남은 줄 0
//   ④ ★★죽여도(`kill` = TERM) 찌꺼기 0 — 자가 곧 끝나고(종료 143) · 잠자던 탐침도 죽고 · TMPDIR 비고 · `/tmp` 새 0 · 장부 0
//   ⑤ ★★서버 야생 사망 한 번 뒤 — 사냥꾼 몸이 호랑이에 쓰러진다(존 `damagePlayer` · `wild:🐯습격`) · `reapDead` 가 돈다 ·
//      서버 야생 상태엔 econ 이 안 붙는다(→ `reapDead` 의 econ 갈래는 안 돈다) · econ 마을의 `counts.hunter` = 명부의 사냥꾼 수 ·
//      직업 수의 합 = 명부 수 = 사망 앞 그대로(사람이 안 빠진다 — 존의 NPC 는 30초 뒤 되살아난다 · 회부)
//   (정보) 랩 ↔ 서버 블록 `reapDead` 를 econ 을 붙여 맞대면 — 랩은 맞고 서버 블록은 `counts.hunter` 가 하나 남는다(서버엔 econ 이 안 붙어 잠든 줄 · 회부)
// ★자명 통과 금지 — 미끼 둘(같은 판정 함수를 진짜와 미끼에 똑같이 대고 미끼는 빨갛게 나와야 초록):
//   미끼 ⓐ `/tmp` 를 박은 옛 사본(mktemp 자리 하나만 `/tmp/ocr.XXXXXX` 로) → ② 빨강(탐침이 TMPDIR 밖에 서거나 · 샌드박스면 아예 못 선다)
//   미끼 ⓑ 하네스를 앞에서 돌리는 사본(뒤에서 돌리고 기다리는 덩이 하나만 종전 꼴로) → ④ 빨강(TERM 이 탐침이 끝날 때까지 안 먹는다)
// 실행: node scripts/test-t1414-ocr-tmpdir.js   (임시 레포 · 임시 DB · 임시 포트 · 라이브 무접촉 · 몇 초)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const ROLE = process.env.T1414_ROLE || '';

if (ROLE === 'zone') zoneChild();
else main().catch((e) => { console.log('  ✗ 하네스 예외 ' + (e && e.stack || e)); process.exit(1); });

// ── ⑵ 존 자식 — 호랑이 곁 사냥꾼 하나 ─────────────────────────────────────────────────────────────
function zoneChild() {
  const OUT = process.env.T1414_OUT;
  Object.assign(process.env, { ZONE_ID: 'hanbando', DB_PATH: process.env.T1414_DB, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', LATENCY_MS: '0' });
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const res = {};
  try {
    const Zone = require(path.join(ROOT, 'server', 'zone.js'));
    const H = Zone.__testBind();
    const W = require(path.join(ROOT, 'server', 'wildlife.js'));   // 존이 쥔 그 인스턴스(require 캐시)
    const E = require(path.join(ROOT, 'sim', 'economy-sim'));
    res.wildOn = W.enabled;
    const N = 64, CH = 512, CC = CH / 32;
    const LED = new Map(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) LED.set(x + ',' + y, 100);
    const keys = new Set(); for (let cy = 0; cy < N / CC; cy++) for (let cx = 0; cx < N / CC; cx++) keys.add(cx + '_' + cy);
    let st = 1414 | 0; const rng = () => { st = (st + 0x6D2B79F5) | 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const dmg = [];
    const damagePlayer = (p, d, src) => { dmg.push({ pid: p.pid, d, src: String(src) }); return H.damagePlayer(p, d, src); };   // 존의 진짜 문(기록만 덧댐)
    W.init({ rng, ZONE_ID: 'hanbando', TICK_HZ: 30, ZONE: { zoneWidth: 32 * N, zoneHeight: 32 * N },
      WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
      isTerrainBlockedLocal: () => false, isRockTileLocal: () => false, terrainMod: { getForestMultiplier: () => 2 },
      chunkManager: { chunkSize: CH, removeMob: () => {}, insertMob: () => {}, updateMobChunk: () => {} },
      players: H.players, mobs: H.mobs, getActiveChunkKeys: () => keys, isPositionActive: () => true,
      spawnCorpse: () => {}, damagePlayer, broadcast: () => {}, setMobHp: H.setMobHp, simVillages: () => [], legacyVillages: [], warThreats: () => [],
      gameRichAt: (k) => LED.get(String(k)), gameRichSize: () => LED.size });
    const S = W._debug.S;
    let t = 60000;
    const timers = [];
    const tick = () => {   // 존의 NPC 되살림 타이머는 세고 지운다(30초를 기다리지 않는다 · 벽시계 0)
      const st0 = global.setTimeout;
      global.setTimeout = function (f, ms, ...a) { const h = st0(f, ms, ...a); if (typeof f === 'function' && /respawn/.test(String(f))) { timers.push(ms); clearTimeout(h); } return h; };
      try { t += 1000 / 30; W.tick(t); } finally { global.setTimeout = st0; }
    };
    // econ 마을 — 사냥꾼이 하나 이상(없으면 맨 앞 사람을 사냥꾼으로 · counts 도 같이)
    const v = E.createVillage({ name: '호랑이곁', initialPop: 8 });
    if (!v.npcs.some((n) => n.currentJob === 'hunter')) { const n0 = v.npcs[0]; v.counts[n0.currentJob] = (v.counts[n0.currentJob] || 0) - 1; n0.currentJob = 'hunter'; v.counts.hunter = (v.counts.hunter || 0) + 1; }
    const npc = v.npcs.find((n) => n.currentJob === 'hunter');
    const snap = () => {
      const sum = Object.values(v.counts).reduce((a, b) => a + (b || 0), 0);
      return { hunterCount: v.counts.hunter || 0, hunterRoll: v.npcs.filter((n) => n.currentJob === 'hunter').length, roll: v.npcs.length, sum, pop: v.pop == null ? v.npcs.length : v.pop };
    };
    for (let i = 0; i < 30; i++) tick();
    const cx = 40.5, cy = 40.5;
    const body = { pid: 't1414_h', playerId: 'npc_t1414', name: '사냥꾼', isNpc: true, simJob: 'hunter', _huntOn: 1, _huntWk: { cx: 40, cy: 40 }, _econId: npc.id, _esk: npc,
      x: cx * 32, y: cy * 32, vx: 0, vy: 0, floor: 0, hp: 50, maxHp: 100, inventory: {}, tribeName: '호랑이곁', hunger: 100, thirst: 100 };
    H.players.set(body.pid, body);
    tick();
    const pr = S.agents.find((a) => a._real === body);
    res.proxy = !!pr;
    res.before = snap();
    res.deaths0 = S._deaths || 0;
    if (pr) {
      const tig = { px: pr.px + 1.5, py: pr.py, type: String.fromCodePoint(0x1F42F), gid: 99914, hp: 14, tmp: 1, stam: 1, hun: 0, ang: Math.PI, pause: 0, cd: 0, fcd: 0, cvo: 0, cvt: 0, flk: 0, st: 'charge', tgt: pr, chg: 28 };
      S.mobs.push(tig);
      let k = 0; for (; k < 300 && body.hp > 0; k++) tick();
      res.ticks = k;
    }
    res.dmg = dmg.filter((x) => x.pid === body.pid);
    res.bodyHp = body.hp;
    res.deaths1 = S._deaths || 0;
    res.hDead = S._hDeadN || 0;
    res.econOnS = S.econ !== undefined;
    res.proxyGone = !S.agents.includes(pr);
    res.respawn = timers.slice();
    res.after = snap();
  } catch (e) { res.err = String(e && e.stack || e).slice(0, 600); }
  fs.writeFileSync(OUT, JSON.stringify(res));
  process.exit(0);
}

// ── 어미 ────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const { spawn, spawnSync } = require('child_process');
  const LT = require('./lib-tmp');
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const info = (m) => console.log(`  · ${m}`);
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const BASE = LT.dir('t1414');
  const REPO = path.join(BASE, 'repo');
  const STRANGE = path.join(BASE, '낯선 폴더 ㄱ');   // 빈칸 · 한글 — 따옴표를 빼먹으면 갈라진다
  fs.mkdirSync(STRANGE, { recursive: true });
  const STRANGE_R = fs.realpathSync(STRANGE);
  const SCRIPT_NOW = fs.readFileSync(path.join(ROOT, 'scripts', 'pm-old-code-red.sh'), 'utf8');
  const PROBE = 'test-t1414-probe.js';
  const PROBE_SRC = [
    "'use strict';",
    "const fs = require('fs'), path = require('path');",
    "const out = process.env.T1414_PROBE_OUT, k = (() => { try { return fs.readdirSync(out).length; } catch (e) { return 0; } })();",
    "const role = (process.env.T1414_PROBE_ROLES || 'red').split(',')[k] || 'red';",
    "let prod = ''; try { prod = fs.readFileSync(path.join(process.cwd(), 'server', 'a.js'), 'utf8').trim(); } catch (e) { prod = '?'; }",
    "fs.writeFileSync(path.join(out, 'p' + k + '.json'), JSON.stringify({ cwd: fs.realpathSync(process.cwd()), pid: process.pid, role, prod }));",
    "if (role === 'sleep') setInterval(() => {}, 1 << 30);",
    "else { console.log('  ✗ 탐침 — 일부러 빨강'); process.exit(1); }",
    '',
  ].join('\n');

  // 작은 레포 — 커밋 둘(옛 제품 v1 · 새 제품 v2 + 탐침) · 자는 지금 것을 그대로
  const git = (args, cwd = REPO) => spawnSync('git', ['-c', 'user.name=t1414', '-c', 'user.email=t1414@x', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' });
  fs.mkdirSync(path.join(REPO, 'scripts'), { recursive: true });
  for (const d of ['server', 'sim', 'public', 'lab']) fs.mkdirSync(path.join(REPO, d), { recursive: true });
  git(['init', '-q', '-b', 'main'], REPO);
  fs.writeFileSync(path.join(REPO, 'server', 'a.js'), 'v1\n');
  for (const d of ['sim', 'public', 'lab']) fs.writeFileSync(path.join(REPO, d, 'k.txt'), 'k\n');
  fs.writeFileSync(path.join(REPO, 'scripts', 'pm-old-code-red.sh'), SCRIPT_NOW);
  git(['add', '-A']); git(['commit', '-q', '-m', 'old']);
  const OLD = (git(['rev-parse', 'HEAD']).stdout || '').trim();
  fs.writeFileSync(path.join(REPO, 'server', 'a.js'), 'v2\n');
  fs.writeFileSync(path.join(REPO, 'scripts', PROBE), PROBE_SRC);
  git(['add', '-A']); git(['commit', '-q', '-m', 'new']);
  const NEW = (git(['rev-parse', 'HEAD']).stdout || '').trim();
  const useScript = (src) => fs.writeFileSync(path.join(REPO, 'scripts', 'pm-old-code-red.sh'), src);   // 작업 트리의 자만 바꾼다(worktree 는 HEAD — 자는 레포 뿌리 것이 돈다)

  const tmpOcr = () => { try { return fs.readdirSync('/tmp').filter((f) => /^ocr\./.test(f)); } catch (e) { return []; } };
  const wtList = () => (git(['worktree', 'list', '--porcelain']).stdout || '').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
  const probes = (dir) => { try { return fs.readdirSync(dir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch (e) { return []; } };
  let runN = 0;
  // 한 판 — 자를 뒤에서 띄우고(`kill` 판은 탐침이 잠든 것을 본 뒤 TERM) 끝을 기다린다(횟수 상한 — 벽시계 단언 0)
  async function run(o) {
    const n = ++runN, pdir = path.join(BASE, `probe${n}`), out = path.join(BASE, `out${n}.txt`);
    fs.mkdirSync(pdir, { recursive: true });
    const env = Object.assign({}, process.env, { TMPDIR: STRANGE, OUT: out, T1414_PROBE_OUT: pdir, T1414_PROBE_ROLES: o.roles.join(',') }, o.env || {});
    delete env.T1414_ROLE; delete env.NODE_OPTIONS;
    if (!o.env || !('PROD' in o.env)) delete env.PROD;
    if (!o.env || !('TIMEOUT_SEC' in o.env)) delete env.TIMEOUT_SEC;
    const tmp0 = new Set(tmpOcr());
    const ch = spawn('bash', [path.join(REPO, 'scripts', 'pm-old-code-red.sh'), OLD, ...o.list], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; ch.stderr.on('data', (b) => { err += b; }); ch.stdout.on('data', () => {});
    let code = null, sig = null, done = false;
    const fin = new Promise((r) => ch.on('exit', (c, s) => { code = c; sig = s; done = true; r(); }));
    let killed = false, diedSoon = null;
    if (o.kill) {
      for (let i = 0; i < 600 && !done && probes(pdir).length < o.roles.length; i++) await nap(50);   // 탐침이 잠들 때까지
      const P = probes(pdir);
      if (!done && P.length) {
        ch.kill('SIGTERM'); killed = true;
        for (let i = 0; i < 200 && !done; i++) await nap(50);   // 상한 10초 — 그 안에 끝나야 "곧"
        diedSoon = done;
      }
    } else {
      for (let i = 0; i < 1200 && !done; i++) await nap(50);
    }
    // 뒷정리(미끼 · 실패 판이 남긴 것) — 판정은 이 앞에서 다 모았다
    const P = probes(pdir);
    const sleepers = P.filter((p) => p.role === 'sleep' && alive(p.pid)).map((p) => p.pid);
    if (!done) { for (const p of P) if (alive(p.pid)) { try { process.kill(p.pid, 'SIGKILL'); } catch (e) {} } for (let i = 0; i < 100 && !done; i++) await nap(50); }
    if (!done) { try { ch.kill('SIGKILL'); } catch (e) {} await fin; }
    const left = (() => { try { return fs.readdirSync(STRANGE); } catch (e) { return ['(없음)']; } })();
    const tmpNew = tmpOcr().filter((f) => !tmp0.has(f));
    const repoR = fs.realpathSync(REPO), wtLeft = wtList().filter((w) => w !== REPO && w !== repoR);   // 작은 레포 제 줄 말고 남은 worktree
    // 남은 것 치우기(다음 판 · 다른 판이 깨끗하게)
    for (const p of P) if (alive(p.pid)) { try { process.kill(p.pid, 'SIGKILL'); } catch (e) {} }
    for (const p of P) if (p.cwd && /\/ocr\.[^/]+\/w$/.test(p.cwd)) { const d = path.dirname(p.cwd); if (d.startsWith('/tmp/ocr.') || d.startsWith('/private/tmp/ocr.') || d.startsWith(STRANGE_R)) { git(['worktree', 'remove', '--force', p.cwd]); fs.rmSync(d, { recursive: true, force: true }); } }
    for (const f of fs.readdirSync(STRANGE)) fs.rmSync(path.join(STRANGE, f), { recursive: true, force: true });
    git(['worktree', 'prune']);
    let text = ''; try { text = fs.readFileSync(out, 'utf8'); } catch (e) {}
    return { code, sig, err, text, lines: text.split('\n').filter(Boolean), P, left, tmpNew, wtLeft, killed, diedSoon, sleepers };
  }
  const underStrange = (R, i = 0) => !!(R.P[i] && R.P[i].cwd.startsWith(STRANGE_R + path.sep + 'ocr.') && /\/ocr\.[^/]+\/w$/.test(R.P[i].cwd));
  const clean = (R) => R.left.length === 0 && R.tmpNew.length === 0 && R.wtLeft.length === 0;
  const cleanStr = (R) => `TMPDIR 남은 것 ${R.left.length}${R.left.length ? '(' + R.left.join(' ') + ')' : ''} · /tmp 새 ocr.* ${R.tmpNew.length} · 장부 남은 줄 ${R.wtLeft.length}`;
  const short = (h) => h.slice(0, 7);

  console.log('\n=== 옛 코드 빨강 자 — TMPDIR 따름 · 찌꺼기 0 · 서버 야생 사망 뒤 사냥꾼 수 (T1414) ===');
  ok(/^[0-9a-f]{40}$/.test(OLD) && /^[0-9a-f]{40}$/.test(NEW) && OLD !== NEW, '[전제] 작은 레포 — 커밋 둘(옛 제품 v1 · 새 제품 v2 + 탐침)', `${short(OLD)} → ${short(NEW)}`);
  ok(/mktemp/.test(SCRIPT_NOW), '[전제] 자(`scripts/pm-old-code-red.sh`)를 읽었다');

  // ── ① ② ③ 보통 판(PROD=lab · 시한 2초 · 같은 하네스 둘: 빨강 · 잠 → 시한) ─────────────────────────────
  console.log('\n① ② ③ 보통 판 — 낯선 TMPDIR · `PROD=` 꼴 · 빨강 줄 · 시한 줄');
  const A = await run({ list: [PROBE, PROBE], roles: ['red', 'sleep'], env: { PROD: 'server sim', TIMEOUT_SEC: '2' } });
  const head = `# 옛 코드 빨강 — 하네스 = ${short(NEW)} · 제품(server sim) = ${short(OLD)} · 시한 2초`;
  const l2 = `빨강 ○ | ${PROBE} | RC=1 · ✓ 0 · ✗ 1 |   ✗ 탐침 — 일부러 빨강`;
  const l3 = `모름(시한) | ${PROBE} | RC=124 · ✓ 0 · ✗ 0 | `;
  const l4 = '# 합: 빨강 1 · 크래시 0 · 초록 0 · 모름 1 · 제품 무관 0';
  ok(A.code === 0 && A.lines.length === 4 && A.lines[0] === head && A.lines[1] === l2 && A.lines[2] === l3 && A.lines[3] === l4,
    '① 출력 글자가 종전 꼴 그대로 — 머리(`PROD=` 가 머리에 선다) · 빨강 ○ 줄 · 모름(시한) 줄(RC 124) · 합 줄 · 종료 0', `종료 ${A.code} · ${JSON.stringify(A.lines).slice(0, 400)}${A.err ? ' · stderr ' + A.err.slice(0, 200) : ''}`);
  ok(underStrange(A, 0) && underStrange(A, 1) && A.P.every((p) => p.prod === 'v1'),
    '★★② `TMPDIR` 따름 — 탐침 둘이 선 자리가 준 TMPDIR(빈칸 · 한글) 아래 `ocr.*/w` · 제품은 옛 판(v1)', A.P.map((p) => `${p.cwd.replace(STRANGE_R, '$TMPDIR')} · 제품 ${p.prod}`).join(' / ') || '탐침 0');
  ok(A.P.length === 2 && clean(A) && A.sleepers.length === 0, '★★③ 찌꺼기 0 — 끝난 뒤 TMPDIR 빔 · `/tmp` 새 `ocr.*` 0 · worktree 장부 0 · 시한 넘긴 탐침도 죽었다', cleanStr(A) + ` · 산 탐침 ${A.sleepers.length}`);

  // ── ④ 죽여도(TERM) ─────────────────────────────────────────────────────────────────────────────
  console.log('\n④ 죽여도 — 탐침이 잠든 사이 자에 `kill`(TERM)');
  const K = await run({ list: [PROBE], roles: ['sleep'], kill: true });
  ok(K.killed && underStrange(K, 0), '[상황] 탐침이 TMPDIR 아래에서 잠들었고 자에 TERM 을 보냈다', K.P.map((p) => p.cwd.replace(STRANGE_R, '$TMPDIR')).join(' ') || '탐침 0');
  ok(K.killed && K.diedSoon === true && (K.code === 143 || K.sig === 'SIGTERM') && K.sleepers.length === 0 && clean(K),
    '★★④ 죽여도 찌꺼기 0 — 자가 곧 끝남(종료 143) · 잠든 탐침도 죽음 · TMPDIR 빔 · `/tmp` 새 0 · 장부 0', `곧 끝남 ${K.diedSoon} · 종료 ${K.code}/${K.sig} · 산 탐침 ${K.sleepers.length} · ` + cleanStr(K));

  // ── 미끼 ⓐ `/tmp` 를 박은 옛 사본 ───────────────────────────────────────────────────────────────
  console.log('\n미끼 ⓐ `/tmp` 를 박은 사본 → ② 빨강');
  {
    const from = 'mktemp -d "$_TMPB/ocr.XXXXXX"';
    const n = SCRIPT_NOW.split(from).length - 1;
    useScript(SCRIPT_NOW.split(from).join('mktemp -d /tmp/ocr.XXXXXX'));
    const B = await run({ list: [PROBE], roles: ['red'] });
    useScript(SCRIPT_NOW);
    ok(n === 1 && !underStrange(B, 0), '미끼 ⓐ — `/tmp` 를 박은 사본 → ② 빨강(탐침이 TMPDIR 밖 · 샌드박스면 못 섬)', `바꾼 자리 ${n} · 탐침 ${B.P.map((p) => p.cwd).join(' ') || '못 섬'} · 종료 ${B.code}`);
  }

  // ── 미끼 ⓑ 하네스를 앞에서 돌리는 사본(종전 꼴) ──────────────────────────────────────────────────
  console.log('\n미끼 ⓑ 하네스를 앞에서 돌리는 사본 → ④ 빨강');
  {
    const a = SCRIPT_NOW.indexOf('    if command -v timeout >/dev/null 2>&1; then');
    const endTok = '_wpid=""; [ -f "$TMP/.timeout" ] && { rc=124; rm -f "$TMP/.timeout"; }; fi\n';
    const b = SCRIPT_NOW.indexOf(endTok);
    const n = (a >= 0 && b > a && SCRIPT_NOW.indexOf('    if command -v timeout', a + 1) < 0) ? 1 : 0;
    useScript(n ? SCRIPT_NOW.slice(0, a) + '    ( cd "$TMP/w" && node "scripts/$t" >"$log" 2>&1 ); rc=$?\n' + SCRIPT_NOW.slice(b + endTok.length) : SCRIPT_NOW);
    const B = await run({ list: [PROBE], roles: ['sleep'], kill: true });
    useScript(SCRIPT_NOW);
    const verdict = B.killed && B.diedSoon === true && (B.code === 143 || B.sig === 'SIGTERM') && B.sleepers.length === 0 && clean(B);
    ok(n === 1 && B.killed && !verdict, '미끼 ⓑ — 하네스를 앞에서 돌리는 사본 → ④ 빨강(TERM 이 잠든 탐침이 끝날 때까지 안 먹는다)', `바꾼 자리 ${n} · 곧 끝남 ${B.diedSoon} · 산 탐침 ${B.sleepers.length}`);
  }

  // ── ⑤ 서버 야생 사망 한 번 — 호랑이 곁 사냥꾼 ──────────────────────────────────────────────────────
  console.log('\n⑤ 서버 야생 사망 한 번 뒤 — counts.hunter · 인구 · 직업 수의 합');
  {
    try { fs.accessSync('/tmp', fs.constants.W_OK); } catch (e) { if (!process.env.LIB_PORT_DIR) process.env.LIB_PORT_DIR = path.join(os.tmpdir(), 'mini-lib-port'); }   // 샌드박스(`/tmp` 쓰기 금지) — 포트 장부만 TMPDIR 로
    require('./lib-port').noCentral();
    const port = require('./lib-port').port(38470);
    const db = path.join(BASE, 'zone.db'), out = path.join(BASE, 'zone.json');
    const env = Object.assign({}, process.env, { T1414_ROLE: 'zone', T1414_DB: db, T1414_OUT: out, PORT: String(port) });
    delete env.NODE_OPTIONS;
    const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 180000, env });
    let Z = null; try { Z = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { Z = { err: `결과 없음(종료 ${r.status} · 신호 ${r.signal}) ${String(r.stderr || '').slice(-300)}` }; }
    ok(!Z.err && Z.wildOn && Z.proxy, '[상황] 존 자식이 섰다 · 존의 야생 인스턴스 켬 · 사냥꾼 몸이 야생 대리(프록시)로 섰다', Z.err || '');
    if (!Z.err) {
      const TIG = String.fromCodePoint(0x1F42F);   // 호랑이(lint ② — 판정 자리엔 코드 포인트)
      const tiger = (Z.dmg || []).some((x) => x.src.startsWith('wild:' + TIG) && x.d >= 50);
      ok(tiger && Z.bodyHp <= 0 && Z.deaths1 === Z.deaths0 + 1 && Z.hDead === 1 && Z.proxyGone,
        '[상황] 호랑이가 사냥꾼 몸을 쓰러뜨렸다(존 `damagePlayer` · `wild:🐯습격`) · `reapDead` 가 한 번 돌았다(대리 빠짐 · 사망 +1)', `피해 ${JSON.stringify(Z.dmg)} · 몸 hp ${Z.bodyHp} · 사망 ${Z.deaths0}→${Z.deaths1} · 틱 ${Z.ticks}`);
      const B0 = Z.before, B1 = Z.after;
      ok(Z.econOnS === false, '★★⑤a 서버 야생 상태엔 econ 이 안 붙는다 — `reapDead` 의 econ 갈래(명부 빼기 · 누계)는 서버에서 안 돈다', `S.econ ${Z.econOnS ? '있음' : '없음'}`);
      ok(B1.hunterCount === B1.hunterRoll && B1.sum === B1.roll && B1.pop === B1.roll && B1.roll === B0.roll && B1.hunterCount === B0.hunterCount && B0.hunterCount >= 1,
        '★★⑤b 야생 사망 한 번 뒤 econ 이 맞는다 — `counts.hunter` = 명부 사냥꾼 · 직업 수의 합 = 명부 = 인구 · 사망 앞 그대로(사람이 안 빠진다)',
        `앞 사냥꾼 ${B0.hunterCount}/${B0.hunterRoll} · 합 ${B0.sum} · 명부 ${B0.roll} → 뒤 사냥꾼 ${B1.hunterCount}/${B1.hunterRoll} · 합 ${B1.sum} · 명부 ${B1.roll} · 인구 ${B1.pop}`);
      info(`존의 NPC 되살림 타이머 ${JSON.stringify(Z.respawn)}ms — 서버의 야생 사망은 인구를 안 줄인다(랩은 줄인다 · 회부)`);
    }
  }

  // ── (정보) 랩 ↔ 서버 블록 `reapDead` — econ 을 붙여 맞대면 ─────────────────────────────────────────
  {
    const vm = require('vm');
    const E = require(path.join(ROOT, 'sim', 'economy-sim'));
    const grab = (file) => {
      const s = fs.readFileSync(path.join(ROOT, file), 'utf8'), a = s.indexOf('function reapDead(s){'), e = s.indexOf('if(s.econ)s.pop=s.econ.npcs.length;}', a);
      return a >= 0 && e > a ? s.slice(a, e + 'if(s.econ)s.pop=s.econ.npcs.length;}'.length) : null;
    };
    const tryOne = (src) => {
      if (!src) return null;
      const v = E.createVillage({ name: '맞대기', initialPop: 8 });
      if (!v.npcs.some((n) => n.currentJob === 'hunter')) { const n0 = v.npcs[0]; v.counts[n0.currentJob] = (v.counts[n0.currentJob] || 0) - 1; n0.currentJob = 'hunter'; v.counts.hunter = (v.counts.hunter || 0) + 1; }
      const c0 = v.counts.hunter;
      const s = { _anyDead: 1, agents: [{ job: 'hunter', _dead: 1 }], econ: v };
      const ctx = { s, Math, _rw: () => 0 }; vm.createContext(ctx);
      vm.runInContext(src + '\nreapDead(s);', ctx);
      return { c0, c1: v.counts.hunter, roll: v.npcs.filter((n) => n.currentJob === 'hunter').length };
    };
    const L = tryOne(grab('lab/마을실험실.html')), Sv = tryOne(grab('server/wildlife.js'));
    if (L && Sv) info(`(정보) 블록 \`reapDead\` 에 econ 을 붙이면 — 랩: counts.hunter ${L.c0}→${L.c1} · 명부 ${L.roll} / 서버 블록: counts.hunter ${Sv.c0}→${Sv.c1} · 명부 ${Sv.roll}(서버엔 econ 이 안 붙어 잠든 줄 · 회부)`);
    else info('(정보) 블록 `reapDead` 를 못 찾았다(맞대기 건너뜀)');
  }

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
