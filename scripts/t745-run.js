#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T745 자 · 제품 무변)
// === scripts/t745-run.js — 서버 판 자(T650 조건) + **가상 시계 갈래**(`--vclock` · `t745-vclock.js`) + 서버 마을 칸 해시(`t740-side-hook.js`) ===========
//   node scripts/t745-run.js <판> [--vclock] [--days 400] [--seed 1020] [--stop S [--jump K] [--cont]]
//     --vclock      아이 존의 벽시계 · 타이머를 가상 시각 하나에 묶는다(econ 날 = 벽시계 날 · 콜백 차례 = (만기, 등록 차례)).
//                   빼면 지금 T650 자(빠른 시계 · 실제 시간) 그대로 — 두 갈래가 같은 판 조건 · 같은 지문 기계를 쓴다.
//     --stop 0      멈춤 없는 판(기본)
//     --stop S      S 날 경계에서 얼려 마감 · 저장 큐를 비우고 제품 SIGTERM 문으로 내린 뒤 같은 DB 로 다시 띄운다(t722 · t740 문법).
//                   가상 시계: 다시 뜬 판의 V0 = 멈춘 V + K × 하루(멈춘 시간은 버린다 — T728 ⑥) · 간격 위상을 이어 받는다(`T745_PHASE_*`) ·
//                     날 뜀은 K 로 고정한다(`T740_FORCE_JUMP` 사본 — 빠른 시계에선 멈춤 앞 저장 큐 드레인(마을 하나 = 틱 하나 · 51 틱 = 1.7 초)이
//                     벽시계 6~7 날이라 T728 ⑥ 시계 셈이 그 날들까지 뛴다 · 대조 판은 econ 날을 K 만 민다 — 둘을 같은 뜀에 둔다).
//                   실제 시계: T740 그대로(`T740_CLOCK_AT` 얼림 · `T740_FORCE_JUMP` 사본).
//     --caravan N   (★T1034) 판 조건의 VILLAGE_CARAVAN_MAX 만 N 으로(기본 0 = 그대로) — 캐러밴 몸 칸이 도는 판
//     --bodykeep    (멈춤 판) 몸의 JSON 칸을 명부 자리마다 덤프해 다시 뜬 몸에 되돌린다(T740 몸 영속 흉내 · 계측 사본)
//     (대조 판은 도적 마지막 날도 econ 날과 같이 민다 — ★T754 기본 · `T742_CONT_SYNC=0` 이면 종전 · `t740-side-hook`)
//     --stop S --cont  대조 판 — 같은 자리에서 재기동 없이 벽시계 · econ 날을 K 날 밀고 이어 간다(`__t740Cont`).
//   ⇒ $T745_DIR/<판>/ — all.t650.json(econ 지문) · all.t740.json(마을 칸 지문) · p1.log · (멈춤 판) stop.json · resume.json · p2.log
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
const DAYS = +opt('days', '400'), SEED = +opt('seed', '1020'), STOP = +opt('stop', '0'), JUMP = +opt('jump', '0'), CONT = a.includes('--cont');
const VC = a.includes('--vclock');
const CARMAX = opt('caravan', '0');   // ★[T1034] `--caravan N` — 길 위 캐러밴을 세운 판(기본 0 = T650 자 그대로 · 지문 기계 같음 · 캐러밴 몸 칸 손잡이를 자 위에서 돌리려고)
const DIR = path.join(process.env.T745_DIR || '/tmp/t745/runs', TAG);
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, 'w.db');
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const PRE = [...(VC ? ['t745-vclock.js'] : []), 't722-stop-hook.js', 't650-print.js', 't740-side-hook.js', ...String(process.env.T745_EXTRA_PRE || '').split(',').filter(Boolean)].map(   // ★[T753] `T745_EXTRA_PRE` — 훅을 더 얹는다(비우기 · 모듈 해시)
  (f) => `--require ${path.join(__dirname, f)}`).join(' ');
function boot(phase, extra) {
  return new Promise((resolve) => {
    const out = path.join(DIR, phase);
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: String(36000 + ((process.pid * 7 + (phase === 'p1' ? 0 : 1)) % 1500)), DB_PATH: DB,
      ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1', VILLAGE_DAY_MS: '250', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1',
      T400_BUILD_ACT: '0', VILLAGE_CARAVAN_MAX: CARMAX, T640_BOOT_SLICE: '0',
      T577_SEED: String(SEED), T577_DAYS: String(DAYS), T577_OUT: out + '.json',
      T745_VCLOCK: VC ? '1' : '',
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
//   판이 끝나면 DB(+WAL · 판 하나 1~2 GB)를 지운다 — 지문은 JSON 에 다 있다(`--keep-db` 면 남긴다)
const dropDb = () => { if (a.includes('--keep-db')) return; for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } };
process.on('exit', dropDb);
(async () => {
  console.log(`=== T745 ${TAG} — ${VC ? '가상 시계' : '실제 시계(T650 자)'} · ${DAYS}일 · 시드 ${SEED} · ${STOP ? `${CONT ? '대조(재기동 없음)' : '멈춤'} ${STOP} · 날 뜀 ${JUMP}` : '멈춤 없음'} · T740_SIDE_KEEP=${process.env.T740_SIDE_KEEP || '(기본)'} ===`);
  if (!STOP || CONT) {
    const r = await boot('p1', CONT ? { T722_STOP_DAY: String(STOP), T722_DUMP: path.join(DIR, 'stop.json'), T722_CONT: '1', T740_CONT_K: String(JUMP) } : {});
    console.log(`  p1 — 끝 코드 ${r.code} · ${r.sec.toFixed(1)}초`);
    fs.copyFileSync(path.join(DIR, 'p1.json.t650.json'), path.join(DIR, 'all.t650.json'));
    fs.copyFileSync(path.join(DIR, 'p1.json.t740.json'), path.join(DIR, 'all.t740.json'));
    return;
  }
  const PH = path.join(DIR, 'phase.json');
  const BK = a.includes('--bodykeep');   // 몸 영속 흉내(T740 문법 · 계측 사본 — 명부 자리마다 몸의 JSON 칸 통째 → 다시 뜬 몸에)
  const r1 = await boot('p1', { T722_STOP_DAY: String(STOP), T722_DUMP: path.join(DIR, 'stop.json'), T745_PHASE_OUT: VC ? PH : '', T722_BODY_SAVE: BK ? '1' : '' });
  console.log(`  p1 — 끝 코드 ${r1.code} · ${r1.sec.toFixed(1)}초`);
  const S0 = rd('stop.json');
  const ex = VC
    ? { T722_RESUME: path.join(DIR, 'stop.json'), T722_DUMP: path.join(DIR, 'resume.json'), T745_V0: String(S0.at + JUMP * S0.dayMs), T745_PHASE_IN: PH, T740_FORCE_JUMP: String(JUMP), T722_PERSIST: BK ? 'body' : '' }
    : { T722_RESUME: path.join(DIR, 'stop.json'), T722_DUMP: path.join(DIR, 'resume.json'), T740_FORCE_JUMP: String(JUMP), T740_CLOCK_AT: String(S0.at + JUMP * S0.dayMs) };
  const r2 = await boot('p2', ex);
  console.log(`  p2 — 끝 코드 ${r2.code} · ${r2.sec.toFixed(1)}초`);
  const P1 = rd('p1.json.t650.json'), P2 = rd('p2.json.t650.json');
  const last1 = P1.days.length ? P1.days[P1.days.length - 1].d : -1;
  fs.writeFileSync(path.join(DIR, 'all.t650.json'), JSON.stringify({ keys: P1.keys, days: P1.days.concat(P2.days.filter((r) => r.d > last1)) }));
  const S1 = rd('p1.json.t740.json'), S2 = rd('p2.json.t740.json');
  const l1 = S1.days.length ? S1.days[S1.days.length - 1].d : -1;
  fs.writeFileSync(path.join(DIR, 'all.t740.json'), JSON.stringify({ names: S1.names, msTot: S1.msTot + S2.msTot, days: S1.days.concat(S2.days.filter((r) => r.d > l1)) }));
  console.log(`  지문 날: p1 끝 ${last1} · p2 ${P2.days.length ? P2.days[0].d + '~' + P2.days[P2.days.length - 1].d : '—'}`);
})().catch((e) => { console.error(e); process.exit(1); });
