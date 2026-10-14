#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T740 계측기 · 제품 무변)
// === scripts/t740-run.js — 서버 판 자(T650 조건) 멈춤 팔 + **서버 마을 칸 해시**(Map · Set 풀어서 · `t740-side-hook.js`) ===============
//   node scripts/t740-run.js <판> [--days 400] [--seed 1020] [--stop 200|0] [--jump K] [--cont] [--dump 200,201]
//     --stop 0       멈춤 없는 판(한 번에 끝 날까지)
//     --stop S       S 날 경계에서 얼려 마감 · 저장 큐를 비우고(T722 문법) 제품 SIGTERM 문으로 내린 뒤 같은 DB 로 다시 띄운다.
//                    다시 뜬 판은 부팅 동안 벽시계를 "멈춘 순간 + K 날"에 얼리고(`T740_CLOCK_AT`) 날 뜀을 K 로 고정한다(`T740_FORCE_JUMP` 사본) —
//                    K = 멈춘 실분 N 의 게임일 몫(N ÷ 24 · T728 ⑥ 캐논: 멈춘 시간은 버리고 날은 시계에서) · 빠른 시계 자에서 부팅 시간이 날을 뛰지 않게.
//     --bodykeep     (멈춤 판) 몸의 JSON 칸을 명부 자리마다 덤프해 다시 뜬 몸에 되돌린다(몸 영속 흉내 · 계측 사본 — T728 회부 2 의 크기)
//     --stop S --cont  대조 판 — 같은 자리(얼림 · 드레인 · 덤프)에서 **재기동 없이** 벽시계와 econ 날을 K 날 밀고 이어 간다(`T722_CONT` · `__t740Cont`).
//   ⇒ $T740_DIR/<판>/ — all.t650.json(econ 지문) · all.t740.json(마을 칸 지문) · stop.json · resume.json
//   판 조건: VILLAGE_DAY_MS=250 · T315_MAPBEDS=0 · VILLAGE_NPC_CAP=1 · T400_BUILD_ACT=0 · VILLAGE_CARAVAN_MAX=0 · T640_BOOT_SLICE=0 (T650 자 그대로)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const a = process.argv.slice(2);
const TAG = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const DAYS = +opt('days', '400'), SEED = +opt('seed', '1020'), STOP = +opt('stop', '200'), JUMP = +opt('jump', '0'), CONT = a.includes('--cont');
const DUMPD = opt('dump', '');
const DIR = path.join(process.env.T740_DIR || '/tmp/t740/runs', TAG);
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, 'w.db');
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const PRE = ['t722-stop-hook.js', 't650-print.js', 't740-side-hook.js'].concat(String(process.env.T740_EXTRA_PRE || '').split(',').filter(Boolean)).map((f) => `--require ${path.join(__dirname, f)}`).join(' ');   // ★[T742] `T740_EXTRA_PRE=t742-mod-hook.js` — 모듈 메모리 해시
function boot(phase, extra) {
  return new Promise((resolve) => {
    const out = path.join(DIR, phase);
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: String(38000 + ((process.pid * 7 + (phase === 'p1' ? 0 : 1)) % 1500)), DB_PATH: DB,
      ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1', VILLAGE_DAY_MS: '250', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1',
      T400_BUILD_ACT: '0', VILLAGE_CARAVAN_MAX: '0', T640_BOOT_SLICE: '0',
      T577_SEED: String(SEED), T577_DAYS: String(DAYS), T577_OUT: out + '.json', T740_DUMP_DAYS: DUMPD,
      NODE_OPTIONS: PRE,
    }, extra);
    const t0 = Date.now();
    const child = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(out + '.log'); child.stdout.pipe(lf); child.stderr.pipe(lf);
    const up = FB.waitUp(child, /zone server up on/, { name: `zone ${phase}`, capMs: 300000 });
    child.on('exit', async (code) => { const u = await up; resolve({ code, up: u.ok, sec: (Date.now() - t0) / 1000 }); });
  });
}
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
(async () => {
  console.log(`=== T740 ${TAG} — ${DAYS}일 · 시드 ${SEED} · ${STOP ? `${CONT ? '대조(재기동 없음)' : '멈춤'} ${STOP}` : '멈춤 없음'} · 날 뜀 ${JUMP} · T740_SIDE_KEEP=${process.env.T740_SIDE_KEEP || '(기본)'} · T728_RESTART_KEEP=${process.env.T728_RESTART_KEEP || '(기본)'} ===`);
  if (!STOP || CONT) {
    const r = await boot('p1', CONT ? { T722_STOP_DAY: String(STOP), T722_DUMP: path.join(DIR, 'stop.json'), T722_CONT: '1', T740_CONT_K: String(JUMP) } : {});
    console.log(`  p1 — 끝 코드 ${r.code} · ${r.sec.toFixed(1)}초`);
    fs.copyFileSync(path.join(DIR, 'p1.json.t650.json'), path.join(DIR, 'all.t650.json'));
    fs.copyFileSync(path.join(DIR, 'p1.json.t740.json'), path.join(DIR, 'all.t740.json'));
    return;
  }
  const BK = a.includes('--bodykeep');   // 몸 영속 흉내(계측 사본 · t722 훅 `T722_BODY_SAVE` → `T722_PERSIST=body`) — 남은 갈림의 주인 재기
  const r1 = await boot('p1', { T722_STOP_DAY: String(STOP), T722_DUMP: path.join(DIR, 'stop.json'), T722_RAWTERM: a.includes('--rawterm') ? '1' : '', T722_BODY_SAVE: BK ? '1' : '' });
  console.log(`  p1 — 끝 코드 ${r1.code} · ${r1.sec.toFixed(1)}초`);
  const S0 = rd('stop.json');
  const ex = { T722_RESUME: path.join(DIR, 'stop.json'), T722_DUMP: path.join(DIR, 'resume.json'), T740_FORCE_JUMP: String(JUMP), T740_CLOCK_AT: String(S0.at + JUMP * S0.dayMs), T722_PERSIST: BK ? 'body' : '' };
  const r2 = await boot('p2', ex);
  console.log(`  p2 — 끝 코드 ${r2.code} · ${r2.sec.toFixed(1)}초`);
  const P1 = rd('p1.json.t650.json'), P2 = rd('p2.json.t650.json');
  const last1 = P1.days.length ? P1.days[P1.days.length - 1].d : -1;
  fs.writeFileSync(path.join(DIR, 'all.t650.json'), JSON.stringify({ keys: P1.keys, days: P1.days.concat(P2.days.filter((r) => r.d > last1)) }));
  const S1 = rd('p1.json.t740.json'), S2 = rd('p2.json.t740.json');
  const l1 = S1.days.length ? S1.days[S1.days.length - 1].d : -1;
  fs.writeFileSync(path.join(DIR, 'all.t740.json'), JSON.stringify({ names: S1.names, msTot: S1.msTot + S2.msTot, days: S1.days.concat(S2.days.filter((r) => r.d > l1)) }));
  console.log(`  지문 날: p1 끝 ${last1} · p2 ${P2.days.length ? P2.days[0].d + '~' + P2.days[P2.days.length - 1].d : '—'} · 칸 해시 ${S1.msTot + S2.msTot} ms`);
})().catch((e) => { console.error(e); process.exit(1); });
