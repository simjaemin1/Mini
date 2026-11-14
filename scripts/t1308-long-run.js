#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1308 판 자 · 제품 무변)
// === scripts/t1308-long-run.js — **이어 도는 서버 판 자**: N날마다 체크포인트 · 끊기면 마지막 체크포인트에서 이어 간다 ==========
//
// ★★[T1308 2026-11-14 · T1285 회부 2 · T1263 회부 4] 몸 세계 긴 판(120 ~ 400날 · 하루 CPU 300 ~ 900초)은 컨테이너가 다시 서면(10.5 ~ 46시간) 처음부터였다.
//   이 자는 판을 **마디**로 돌린다 — 한 마디 = 아이 존 프로세스 하나(T577 판 자와 같은 아이 env · `t577-server-run.kidEnv`).
//     ① 마디 끝(체크포인트 날 S) — t722 멈춤 팔(`T722_STOP_DAY=S`): S 날 장부 문 → 날 얼림 → 마감 · 저장 큐가 비면 → 제품 SIGTERM 문(T728 경계 종료 저장 —
//        마을 행 전부 + 메타 행[rng · 앵커 · 캐러밴 · 전쟁 · 몸 칸] 한 트랜잭션). 판 자 누계는 `T577_STATE`(t577 훅)가 같은 exit 에 쓴다.
//        가상 시계면 그 순간의 V 와 간격 위상(`T745_PHASE_OUT`)이 멈춤 덤프에 남는다.
//     ② 체크포인트 = DB 세 파일(db · wal · shm) + 판 자 누계 + 멈춤 덤프 + 위상 — 프로세스가 내려간 뒤 `ck/` 로 복사(임시 이름 → 이름 바꾸기).
//     ③ 다음 마디 — `ck/` 의 DB 를 일터로 되살려 같은 아이 env 로 다시 띄운다(가상 시계: V0 = 멈춘 V · 위상 이어 받기 · 날 뜀 0 고정(`T740_FORCE_JUMP=0`)).
//     ④ 끊김(컨테이너 재시작 · 프로세스 죽음) — 다시 부르면 `progress.json` 의 마지막 체크포인트 날에서 그 마디를 처음부터 다시 돈다.
//        마디는 체크포인트 DB 에서 시작하니 **끊긴 판 = 안 끊긴 판(같은 마디 경계)** 이다(결정성 — 보고 T1308 §2).
//   관찰기(부르는 쪽 `NODE_OPTIONS`)는 마디마다 `seg-<시작 날>.<꼴>.json` 을 쓴다. 판이 끝나면 날 줄을 이어 `<태그>-<시드>.<꼴>.json` 으로 묶는다
//   ({cols, rows[날 …]} · {days:[{d …}]} 두 꼴 — 날 열쇠로 · 뒤 마디가 앞 마디의 같은 날을 덮지 않는다). 판 JSON(t577 훅)은 마지막 마디 것이 누계를 이어 받은 끝 판이다.
//
// 쓰는 법:
//   node scripts/t1308-long-run.js <날> <시드> [--every 10] [--dir <폴더>] [--tag <이름>]      # 새 판(폴더가 비었거나 progress 없음)
//   node scripts/t1308-long-run.js --resume <폴더>                                           # 끊긴 판 잇기(progress.json 의 날 · 시드 · env 그대로)
//   (하네스) --crash-at <날> — 그 날에서 끝나는 마디의 첫 시도는 멈춤 팔이 저장 없이 죽는다(`T722_CRASH=1` — 체크포인트 없음 · 코드 3) · 다시 부르면 그 마디부터.
//   판 조건 env 는 부르는 쪽이 준다(T577 판 자와 같다 — 예: T1243_FARM_ON=1 VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1).
//   관찰기: NODE_OPTIONS="-r <관찰기> …" — 이 자가 가상 시계 · 멈춤 팔 · 날 뜀 고정 프리로드를 앞에 붙인다.
//   ⇒ <폴더>/progress.json(날 · 체크포인트 · 마디 줄 · env) · progress.txt(한 줄 진행) · ck/(마지막 체크포인트) · seg-*.log · 묶은 <태그>-<시드>.*.json
//   끝나면 종료 코드 0 · 끝 표지 `progress.done = true`. 마디가 체크포인트 없이 죽으면 종료 코드 3(감독 `t1308-guard.sh` 가 다시 부른다).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };

// ── 판 정의(새 판 · 이어 가기) ─────────────────────────────────────────────────────────────
const RESUME_DIR = opt('resume', null);
const ENV_KEEP = /^(T\d+_[A-Z0-9_]+|VILLAGE_[A-Z_]+|ENABLE_[A-Z_]+|WAR_[A-Z_]+|BODY_[A-Z_]+|NODE_OPTIONS)$/;   // 판 조건으로 progress 에 남기는 env(이어 갈 때 그대로)
let P;
if (RESUME_DIR) {
  P = JSON.parse(fs.readFileSync(path.join(RESUME_DIR, 'progress.json'), 'utf8'));
  for (const [k, v] of Object.entries(P.env || {})) process.env[k] = v;   // 처음 부를 때의 판 조건 그대로(부르는 쪽 env 는 버린다)
  for (const k of Object.keys(process.env)) if (ENV_KEEP.test(k) && !(k in (P.env || {}))) delete process.env[k];
} else {
  const days = parseInt(A[0], 10), seed = parseInt(A[1], 10);
  if (!(days > 0) || !(seed > 0)) { console.error('쓰는 법: t1308-long-run.js <날> <시드> [--every N] [--dir D] [--tag T] | --resume <폴더>'); process.exit(2); }
  const every = parseInt(opt('every', '10'), 10);
  const tag = opt('tag', process.env.T577_TAG || 'run');
  const dir = path.resolve(opt('dir', `/tmp/t1308/${tag}-${seed}`));
  const env = {}; for (const [k, v] of Object.entries(process.env)) if (ENV_KEEP.test(k)) env[k] = v;
  P = { v: 1, tag, seed, days, every, dir, ck: 0, segs: [], done: false, env, started: new Date().toISOString(), tries: 0 };
}
if (opt('crash-at', null) != null) P.crashAt = parseInt(opt('crash-at', null), 10);   // 하네스 — 한 번만 죽는다(`crashDone`)
const DIR = P.dir;
fs.mkdirSync(path.join(DIR, 'ck'), { recursive: true });
const PJ = path.join(DIR, 'progress.json'), PT = path.join(DIR, 'progress.txt');
if (!RESUME_DIR && fs.existsSync(PJ)) {   // 같은 폴더에 판이 있으면 새로 덮지 않는다(실수로 다시 부른 감독)
  const old = JSON.parse(fs.readFileSync(PJ, 'utf8'));
  if (old.days === P.days && old.seed === P.seed && old.every === P.every) { console.log(`[t1308] 폴더에 같은 판이 있다 — 이어 간다(체크포인트 날 ${old.ck})`); P = Object.assign(old, { env: old.env }); for (const [k, v] of Object.entries(P.env || {})) process.env[k] = v; }
  else { console.error(`[t1308] 폴더에 다른 판이 있다(${old.days}날 · 시드 ${old.seed} · 마디 ${old.every}) — --resume ${DIR} 또는 다른 --dir`); process.exit(2); }
}
const saveP = () => { const t = PJ + '.tmp'; fs.writeFileSync(t, JSON.stringify(P, null, 1)); fs.renameSync(t, PJ); };
const note = (s) => { try { fs.writeFileSync(PT, `${new Date().toISOString()} · ${P.tag}-${P.seed} · ${s}\n`); } catch (e) {} };

const T577 = require('./t577-server-run');
const VCLOCK = process.env.T745_VCLOCK === '1';
const DB = path.join(DIR, 'w.db'), STATE = path.join(DIR, 'state.json');
const DBF = (b) => [b, b + '-wal', b + '-shm'];
const cp = (a, b) => { if (fs.existsSync(a)) fs.copyFileSync(a, b); else { try { fs.unlinkSync(b); } catch (e) {} } };

// 체크포인트 되살리기(일터로) · 남기기(일터에서)
function restoreCk() {
  DBF(DB).forEach((f, i) => cp(DBF(path.join(DIR, 'ck', 'w.db'))[i], f));
  cp(path.join(DIR, 'ck', 'state.json'), STATE);
}
function commitCk(day) {
  const T = path.join(DIR, 'ck.tmp'); fs.rmSync(T, { recursive: true, force: true }); fs.mkdirSync(T);
  DBF(DB).forEach((f, i) => cp(f, DBF(path.join(T, 'w.db'))[i]));
  cp(STATE, path.join(T, 'state.json'));
  for (const f of [`stop-${day}.json`, `phase-${day}.json`, `keep-${day}.json`]) cp(path.join(DIR, f), path.join(T, f));
  fs.writeFileSync(path.join(T, 'day'), String(day));
  const OLD = path.join(DIR, 'ck.old'); fs.rmSync(OLD, { recursive: true, force: true });
  if (fs.existsSync(path.join(DIR, 'ck'))) fs.renameSync(path.join(DIR, 'ck'), OLD);
  fs.renameSync(T, path.join(DIR, 'ck'));
  fs.rmSync(OLD, { recursive: true, force: true });
}

function preloads() {
  const pre = [...(VCLOCK ? ['t745-vclock.js'] : []), 't722-stop-hook.js', 't740-side-hook.js', 't1308-keep-hook.js'].map((f) => `--require ${path.join(__dirname, f)}`);
  return pre.concat(process.env.NODE_OPTIONS ? [process.env.NODE_OPTIONS] : []).join(' ');
}

async function segment(from) {
  const to = Math.min(P.days, from + P.every), last = to >= P.days;
  const name = `seg-${from}`, out = path.join(DIR, `${name}.json`), logf = path.join(DIR, `${name}.log`);
  for (const f of fs.readdirSync(DIR)) if (f.startsWith(name + '.')) try { fs.unlinkSync(path.join(DIR, f)); } catch (e) {}   // 같은 마디를 다시 돌면 앞 시도의 조각을 지운다
  if (from > 0) restoreCk(); else { for (const f of DBF(DB).concat([STATE])) try { fs.unlinkSync(f); } catch (e) {} }
  const port = await T577.freePort();
  const env = T577.kidEnv({ seed: P.seed, port, db: DB, out, days: P.days });
  env.NODE_OPTIONS = preloads();
  env.T577_STATE = STATE;
  if (!last && P.crashAt === to && !P.crashDone) { env.T722_CRASH = '1'; P.crashDone = true; saveP(); }   // 하네스 — 이 마디는 저장 없이 죽는다(한 번)
  if (!last) { env.T722_STOP_DAY = String(to); env.T722_DUMP = path.join(DIR, `stop-${to}.json`); if (VCLOCK) env.T745_PHASE_OUT = path.join(DIR, `phase-${to}.json`); env.T1308_KEEP_OUT = path.join(DIR, `keep-${to}.json`); }
  if (from > 0) {
    const S0 = JSON.parse(fs.readFileSync(path.join(DIR, 'ck', `stop-${from}.json`), 'utf8'));
    env.T577_RESUMED = '1'; env.T740_FORCE_JUMP = '0'; env.T1308_KEEP_IN = path.join(DIR, 'ck', `keep-${from}.json`);   // 판 자 쪽 잇기(`t1308-keep-hook.js`)   // 날 뜀 0 — 멈춘 그 날 다음 날부터(멈춘 시간은 버린다 · T728 ⑥)
    if (VCLOCK) { env.T745_V0 = String(S0.at); env.T745_PHASE_IN = path.join(DIR, 'ck', `phase-${from}.json`); }
    else env.T740_CLOCK_AT = String(S0.at);
  }
  const t0 = Date.now();
  note(`마디 ${from} → ${to} 띄움`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(logf); child.stdout.pipe(lf); child.stderr.pipe(lf);
    let lastDay = from;
    const iv = setInterval(() => {   // 진행 줄 — 로그 꼬리의 마지막 econ 날
      try { const st = fs.statSync(logf), fd = fs.openSync(logf, 'r'), n = Math.min(st.size, 200000), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd);
        const m = b.toString('utf8').match(/econ day (\d+)/g); if (m) lastDay = +m[m.length - 1].split(' ').pop(); } catch (e) {}
      note(`마디 ${from} → ${to} · econ 날 ${lastDay} · ${((Date.now() - t0) / 60000).toFixed(1)}분`);
    }, 30000);
    child.on('exit', (c) => { clearInterval(iv); resolve(c); });
  });
  const sec = (Date.now() - t0) / 1000;
  if (!last) {
    let sd = null; try { sd = JSON.parse(fs.readFileSync(path.join(DIR, `stop-${to}.json`), 'utf8')); } catch (e) { sd = null; }
    const ok = code === 0 && sd && sd.tag === 'stop' && !sd.crash && fs.existsSync(STATE) && fs.existsSync(DB);   // 멈춤 팔이 마감 · 저장을 끝내고 제품 SIGTERM 문으로 내려간 마디만(크래시 덤프 · 코드 ≠ 0 은 체크포인트 아님)
    if (!ok) return { ok: false, why: `마디 ${from} → ${to} 체크포인트 없음(코드 ${code})`, sec };
    commitCk(to);
  } else {
    let o = null; try { o = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
    if (!o || !(o.days >= P.days)) return { ok: false, why: `끝 마디 판 JSON 없음(코드 ${code})`, sec };
  }
  return { ok: true, from, to, sec, code };
}

// 마디 출력 묶기 — 날 열쇠로 잇는다
function merge() {
  const segs = P.segs.map((s) => s.from);
  const files = fs.readdirSync(DIR);
  const kinds = new Set();
  for (const f of files) { const m = f.match(/^seg-(\d+)\.(.+)$/); if (m && segs.includes(+m[1]) && m[2] !== 'log' && /\.json$/.test(m[2]) && m[2] !== 'json' && m[2] !== 'fd-deaths.json') kinds.add(m[2]); }
  const base = `${P.tag}-${P.seed}`;
  const lastSeg = `seg-${segs[segs.length - 1]}`;
  for (const k of ['json', 'fd-deaths.json']) cp(path.join(DIR, `${lastSeg}.${k}`), path.join(DIR, `${base}.${k}`));
  const done = [];
  for (const k of kinds) {
    if (/\.d\d+\.json$/.test(k)) continue;   // 날 덤프는 그대로 둔다
    let acc = null, last = -Infinity;
    for (const s of segs) {
      let o; try { o = JSON.parse(fs.readFileSync(path.join(DIR, `seg-${s}.${k}`), 'utf8')); } catch (e) { continue; }
      if (Array.isArray(o.rows) && Array.isArray(o.cols)) {
        const di = o.cols.indexOf('day') >= 0 ? o.cols.indexOf('day') : 0;
        if (!acc) acc = Object.assign({}, o, { rows: [] });
        for (const r of o.rows) { const d = Array.isArray(r) ? r[di] : null; if (d == null || d > last) acc.rows.push(r); }
        const ds = o.rows.map((r) => (Array.isArray(r) ? r[di] : -Infinity)); if (ds.length) last = Math.max(last, ...ds);
        for (const [kk, v] of Object.entries(o)) if (kk !== 'rows' && kk !== 'cols' && v && typeof v === 'object' && !Array.isArray(v) && acc[kk] && typeof acc[kk] === 'object') acc[kk] = Object.assign({}, acc[kk], v);   // 날 열쇠 꾸러미(`vil` 등)는 합친다
        for (const [kk, v] of Object.entries(o)) if (Array.isArray(v) && kk !== 'rows' && kk !== 'cols') acc[kk] = (acc[kk] || []).concat(v.filter((x) => !(acc[kk] || []).some((y) => JSON.stringify(y) === JSON.stringify(x))));
      } else if (Array.isArray(o.days)) {
        if (!acc) acc = Object.assign({}, o, { days: [] });
        for (const r of o.days) if (r && r.d > last) acc.days.push(r);
        if (o.days.length) last = Math.max(last, ...o.days.map((r) => r.d));
        for (const [kk, v] of Object.entries(o)) if (kk !== 'days' && typeof v === 'number' && typeof acc[kk] === 'number' && acc !== o) acc[kk] = kk === 'msTot' ? acc[kk] + v : acc[kk];
      } else continue;
    }
    if (acc) { fs.writeFileSync(path.join(DIR, `${base}.${k}`), JSON.stringify(acc)); done.push(k); }
  }
  return done;
}

(async () => {
  saveP();
  console.log(`=== T1308 이어 도는 판 — ${P.tag} · 시드 ${P.seed} · ${P.days}날 · 마디 ${P.every}날 · 가상 시계 ${VCLOCK ? '켬' : '끔'} · ${DIR} · 체크포인트 날 ${P.ck} ===`);
  while (P.ck < P.days) {
    P.tries = (P.tries || 0) + 1; saveP();
    const r = await segment(P.ck);
    if (!r.ok) { console.log(`  ✗ ${r.why} · ${r.sec.toFixed(0)}초 — 체크포인트 날 ${P.ck} 그대로(다시 부르면 이 마디부터)`); note(`멈춤 — ${r.why}`); saveP(); process.exit(3); }
    P.segs = P.segs.filter((s) => s.from !== r.from).concat([{ from: r.from, to: r.to, sec: +r.sec.toFixed(1), code: r.code, at: new Date().toISOString() }]);
    P.ck = r.to; P.tries = 0; saveP();
    console.log(`  ✓ 마디 ${r.from} → ${r.to} · ${r.sec.toFixed(0)}초`);
  }
  const kinds = merge();
  P.done = true; P.ended = new Date().toISOString(); saveP();
  note(`끝 — ${P.days}날 · 마디 ${P.segs.length} · 묶음 ${kinds.join(' ')}`);
  console.log(`  끝 — 판 JSON ${path.join(DIR, `${P.tag}-${P.seed}.json`)} · 묶은 관찰 ${kinds.join(' · ') || '없음'}`);
  process.exit(0);
})().catch((e) => { console.error(e); note(`오류 ${e.message}`); process.exit(1); });
