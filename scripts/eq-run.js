#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1420 평형 판 자 · 제품 무변)
// === scripts/eq-run.js — 평형 저장본에서 끔 ↔ 켬을 잇는 판 자(랩 · 서버 같은 인자) ==========
//
// ★왜(T1420 · 재민 11-21): 새 세계(인구 6 ~ 10)로 시작한 판은 600날 넘게 성장 구간이다. 켜고 끈 차이가 "평형이 바뀐 것"인지
//   "크는 빠르기가 바뀐 것"인지 못 가른다. 이 자는 **한 번 길게 돈 세계를 통째로 저장한 것**(곳간 손으로 채우기 0)에서 팔마다 이어 돈다.
//
// 쓰는 법:
//   node scripts/eq-run.js --seed <n> --from <저장본 | make:<날> | new> --days <N> [--arm 이름=ENV=값[,ENV=값…] …] [--server] [--out <폴더>] [--par 2] [--every 50]
//     --from make:1900  (기본 · ★T1426 판정 33) 캐시(`${TMPDIR:-/tmp}/durango-eq-cache/<코드 지문>/`)의 1,900날 저장본 = **평형 판의 출발** — 없으면 만든다 ·
//                       다른 코드 지문 폴더에 같은 이름이 있으면 "낡음"이라 말하고 다시 만든다. `make:800` 은 **성장 판**(T1420 — 랩 800날 6,198 은 성장 구간의 한 점)
//     --grow · --fp-days 1901-2000  (★T1426) 팔마다 성장 길 관측 · 지문 날 창
//     --crit c1=0.05,c3=0.1  "평형에 닿았나" 한 줄의 문턱(기본 = 판정 33: C1 ≤ 0.05 ∧ C3 ≤ 0.1 ∧ C2 = 0 · `lib-eq-crit.DEF`) — 후보 표는 그대로 다 찍는다
//     --from <파일|폴더> 그 저장본(랩 = .v8.gz · 서버 = t1308 체크포인트 폴더) — 코드 지문이 다르면 멈춘다(코드 3 · `--allow-stale` 이면 쓴다)
//     --from new        새 세계(날 0)에서 — 성장 판(견줌 · 카드 T1420 할 일 6 ⓐ)
//     --arm             끔 팔은 늘 돈다(env 없음). 켬 팔은 이름=ENV=값 — 저장본을 되살린 **뒤** 그 env 로 돈다
//   ⇒ <폴더>/<팔>.obs.json(날마다 관측 줄) · eq-run.json(표 · 기준 후보) · eq-run.md(50날마다 표) · 끝에 저장본 sha 앞뒤(끔 팔이 저장본을 안 바꾼다)
//   열(50날마다): 인구 · 굶어 죽음(구간) · 빈 마을 · 떠난 사람(구간) · 식량 날치 가운데 · 값 가운데(식량 · 나무 · 돌 · 도구) · 직업 몫 위 셋 · CPU 초/날
//   기준 후보(`lib-eq-crit` — 판정 전이라 다 찍는다): 창 W = min(365, ⌊판 날 ÷ 2⌋) 의 C1 ~ C4 든 날.
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const Lq = require('./lib-eq-lab');
const Cr = require('./lib-eq-crit');

const DEF_DAY = 1900;   // ★[T1426 · 판정 33] 평형 판의 출발 날(C1 ≤ 0.05 ∧ C3 ≤ 0.1 — 세 시드 1,860 ~ 1,880날 + 넉넉히) · 800 = 성장 판
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const SEED = parseInt(opt('seed', ''), 10), FROM = opt('from', 'make:' + DEF_DAY), DAYS = parseInt(opt('days', '400'), 10);
const SERVER = A.includes('--server'), PAR = parseInt(opt('par', '2'), 10), EVERY = parseInt(opt('every', '50'), 10), STALE_OK = A.includes('--allow-stale');
const ZONE = opt('zone', 'hanbando');
const GROW = A.includes('--grow');   // ★[T1426] 팔마다 성장 길 관측(`<팔>.grow.json` — `lib-eq-grow`)
const FPWIN = opt('fp-days', '') ? opt('fp-days', '').split('-') : null;   // ★[T1426] 지문 날 창(예: 1901-2000 — 긴 판의 지문 파일을 줄인다)
if (A.includes('--print-defaults')) { console.log(JSON.stringify({ defDay: DEF_DAY, from: FROM, crit: Cr.DEF, obsCols: Lq.OBS_COLS })); process.exit(0); }   // ★[T1426] 하네스 · 사람이 기본을 본다
const CRIT = (() => { const c = opt('crit', ''); if (!c) return Cr.DEF; const o = Object.assign({}, Cr.DEF); for (const kv of c.split(',')) { const [k, v] = kv.split('='); o[k] = +v; } return o; })();
if (!A.includes('--print-defaults') && (!(SEED > 0) || !(DAYS > 0))) { console.error('쓰는 법: eq-run.js --seed <n> --from <저장본|make:<날>|new> --days <N> [--arm 이름=ENV=값 …] [--server]'); process.exit(2); }
const ARMS = A.includes('--no-off') ? [] : [{ name: 'off', env: {} }];   // --no-off = 끔 팔을 이미 돌린 폴더에 켬 팔만 더한다(표는 그 폴더의 off.obs 를 읽지 않는다 — 견줌은 부르는 쪽)
for (let i = 0; i < A.length; i++) if (A[i] === '--arm') {
  const s = A[i + 1], k = s.indexOf('='); const name = s.slice(0, k), env = {};
  for (const kv of s.slice(k + 1).split(',')) { const j = kv.indexOf('='); env[kv.slice(0, j)] = kv.slice(j + 1); }
  ARMS.push({ name, env });
}
const OUT = path.resolve(opt('out', path.join(process.env.TMPDIR || '/tmp', 'eq-run', `${SERVER ? 'srv' : 'lab'}-${SEED}-${String(FROM).replace(/[^a-z0-9]+/gi, '')}-${DAYS}`)));
fs.mkdirSync(OUT, { recursive: true });
const ROOTC = path.join(process.env.TMPDIR || '/tmp', 'durango-eq-cache');
const log = (s) => console.log(s);

function run(args, env, logf) {
  return new Promise((res) => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, args, { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(logf); ch.stdout.pipe(lf); ch.stderr.pipe(lf);
    ch.on('exit', (code) => res({ code, sec: (Date.now() - t0) / 1000 }));
  });
}
async function pool(jobs, n) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } })); return out; }
const sha = (f) => { const h = crypto.createHash('sha1'); const st = fs.statSync(f); if (st.isDirectory()) { for (const n of fs.readdirSync(f).sort()) { const p = path.join(f, n); if (fs.statSync(p).isFile()) { h.update(n); h.update(fs.readFileSync(p)); } } } else h.update(fs.readFileSync(f)); return h.digest('hex').slice(0, 16); };
function staleNote(name) {   // 다른 코드 지문 폴더에 같은 저장본이 있나
  let olds = []; try { olds = fs.readdirSync(ROOTC).filter((d) => d !== Lq.codeSig() && fs.existsSync(path.join(ROOTC, d, name))); } catch (e) {}
  if (olds.length) log(`  ⚠낡음 — ${name} 이 옛 코드 지문 ${olds.join(' · ')} 에만 있다(지금 ${Lq.codeSig()}) · 다시 만든다(옛 것을 안 쓴다)`);
}

// ── 랩 ───────────────────────────────────────────────────────────────────────────────
const LAB_SEEDS = path.join(ROOTC, `lab-seeds-${ZONE}-${SEED}.json`);
const labEnv = (extra) => Object.assign({ LAB_SEEDCACHE: LAB_SEEDS, T1420_EQ: '1' }, ZONE !== 'hanbando' ? { T17_ZONE: ZONE } : {}, extra);
async function labMake(day) {
  const name = `lab-${ZONE}-${SEED}-d${day}.v8.gz`, f = path.join(Lq.cacheDir(), name);
  if (fs.existsSync(f)) { log(`  저장본 캐시 ${f}`); return f; }
  staleNote(name);
  log(`  저장본 만들기 — 랩 ${day}날 · 시드 ${SEED} → ${f}`);
  const r = await run([path.join(__dirname, 't17-metrics.js'), String(day), String(SEED)], labEnv({ T1420_SAVE_AT: String(day), T1420_SAVE_DIR: Lq.cacheDir() }), path.join(OUT, `make-d${day}.log`));
  if (r.code !== 0 || !fs.existsSync(f)) { console.error(`  ✗ 저장본 만들기 실패(코드 ${r.code}) — ${path.join(OUT, `make-d${day}.log`)}`); process.exit(1); }
  const m = JSON.parse(fs.readFileSync(f + '.meta.json', 'utf8')); m.makeSec = +r.sec.toFixed(1); fs.writeFileSync(f + '.meta.json', JSON.stringify(m, null, 1));
  log(`  ✓ 저장본 ${m.bytes} B · sha ${m.sha} · ${r.sec.toFixed(0)}초`);
  return f;
}
async function labArm(arm, file) {
  const env = labEnv(Object.assign({}, arm.env, { T1420_OBS: path.join(OUT, `${arm.name}.obs.json`), T1420_FP: path.join(OUT, `${arm.name}.fp.json`) }, GROW ? { T1426_GROW: path.join(OUT, `${arm.name}.grow.json`) } : {}, FPWIN ? { T1420_FP_FROM: FPWIN[0], T1420_FP_TO: FPWIN[1] } : {}, file ? { T1420_LOAD: file } : {}, STALE_OK ? { T1420_ALLOW_STALE: '1' } : {}));
  env.NODE_OPTIONS = require('./lib-heap').withHeap(env.NODE_OPTIONS || process.env.NODE_OPTIONS);   // ★[T1426] 긴 랩 팔(10,000날 — 인구 1만 넘음)
  const r = await run([path.join(__dirname, 't17-metrics.js'), String(DAYS), String(SEED)], env, path.join(OUT, `${arm.name}.log`));
  const lg = fs.readFileSync(path.join(OUT, `${arm.name}.log`), 'utf8');
  if (/낡은 저장본/.test(lg)) { console.error(`  ✗ ${arm.name}: 낡은 저장본 — ${(lg.match(/\[T1420\] 낡은[^\n]*/) || [''])[0]}`); return { arm, code: 3, sec: r.sec, stale: true }; }
  let rows = []; try { rows = JSON.parse(fs.readFileSync(path.join(OUT, `${arm.name}.obs.json`), 'utf8')).rows; } catch (e) {}
  return { arm, code: r.code, sec: r.sec, rows };
}

// ── 서버(t1308 마디 자 · 끔 세계 = 서버 판 자 조건) ───────────────────────────────────────────
const SRV_BASE = { T400_BUILD_ACT: '0', VILLAGE_CARAVAN_MAX: '0', T745_VCLOCK: '1' };
const srvPre = () => `--max-old-space-size=${process.env.T1420_SRV_HEAP_MB || '6144'} --require ${path.join(__dirname, 'eq-srv-obs.js')}`;   // 서버 900날 판은 기본 힙에서 날 약 679 에 죽었다(T1420) — 6 GB
async function srvMake(day) {
  const name = `srv-${ZONE}-${SEED}-d${day}`, dir = path.join(Lq.cacheDir(), name);
  if (fs.existsSync(path.join(dir, 'ck', `stop-${day}.json`))) { log(`  저장본 캐시 ${dir}`); return dir; }
  staleNote(name);
  log(`  저장본 만들기 — 서버 ${day}날(끔 세계) · 시드 ${SEED} → ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const r = await run([path.join(__dirname, 't1308-long-run.js'), String(day + 1), String(SEED), '--cuts', String(day), '--dir', dir, '--tag', 'eq'],
    Object.assign({}, SRV_BASE, { T1420_SRV_OBS: path.join(dir, 'make.obs.jsonl'), NODE_OPTIONS: srvPre() }), path.join(OUT, `make-srv-d${day}.log`));
  if (!fs.existsSync(path.join(dir, 'ck', `stop-${day}.json`))) { console.error(`  ✗ 서버 저장본 만들기 실패(코드 ${r.code})`); process.exit(1); }
  fs.writeFileSync(path.join(dir, 'eq-meta.json'), JSON.stringify({ v: 1, card: 'T1420', sig: Lq.codeSig(), day, seed: SEED, zone: ZONE, makeSec: +r.sec.toFixed(1), knobs: Object.assign({}, SRV_BASE) }, null, 1));
  return dir;
}
function srvCheck(dir) {
  let m = null; try { m = JSON.parse(fs.readFileSync(path.join(dir, 'eq-meta.json'), 'utf8')); } catch (e) {}
  if (!m) return { ok: false, why: '저장본 메타 없음' };
  if (m.sig !== Lq.codeSig() && !STALE_OK && process.env.T1420_BAIT !== 'nosig') return { ok: false, why: `낡은 저장본 — 저장본 코드 지문 ${m.sig} · 지금 ${Lq.codeSig()}` };
  return { ok: true, m };
}
async function srvArm(arm, dir, day) {
  const ad = path.join(OUT, `srv-${arm.name}`);
  fs.rmSync(ad, { recursive: true, force: true }); fs.mkdirSync(path.join(ad, 'ck'), { recursive: true });
  for (const n of fs.readdirSync(path.join(dir, 'ck'))) fs.copyFileSync(path.join(dir, 'ck', n), path.join(ad, 'ck', n));
  const obs = path.join(OUT, `${arm.name}.obs.jsonl`); try { fs.unlinkSync(obs); } catch (e) {}
  const env = Object.assign({}, SRV_BASE, arm.env, { T1420_SRV_OBS: obs, NODE_OPTIONS: srvPre() });
  fs.writeFileSync(path.join(ad, 'progress.json'), JSON.stringify({ v: 1, tag: 'eq', seed: SEED, days: day + DAYS, every: DAYS, dir: ad, ck: day, segs: [], done: false, env, started: new Date().toISOString(), tries: 0 }));
  const r = await run([path.join(__dirname, 't1308-long-run.js'), '--resume', ad], {}, path.join(OUT, `${arm.name}.log`));
  const rows = []; const seen = new Map();
  try { for (const ln of fs.readFileSync(obs, 'utf8').split('\n')) if (ln) { const x = JSON.parse(ln); seen.set(x[0], x); } } catch (e) {}
  for (const d of [...seen.keys()].sort((a, b) => a - b)) rows.push(seen.get(d));
  return { arm, code: r.code, sec: r.sec, rows };
}

// ── 표 ─────────────────────────────────────────────────────────────────────────────────
function blocks(rows, n) {
  const out = []; if (!rows || !rows.length) return out;
  const r0 = rows[0], C = Cr.COL; let prev = r0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; if ((r[C.d] - r0[C.d] + 1) % EVERY !== 0 && i !== rows.length - 1) continue;
    const dd = Math.max(1, r[C.d] - prev[C.d]), cpu = (r[C.cpu] != null && prev[C.cpu] != null && r[C.cpu] >= prev[C.cpu]) ? (r[C.cpu] - prev[C.cpu]) / 1000 / dd : null;
    const js = Object.entries(r[C.jobs] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([j, f]) => `${j} ${(f * 100).toFixed(0)}%`).join(' · ');
    out.push({ d: r[C.d], pop: r[C.pop], fdDead: r[C.fdDead] != null ? r[C.fdDead] - (prev[C.fdDead] || 0) : null, empty: n - r[C.alive],
      left: r[C.emig] != null ? r[C.emig] - (prev[C.emig] || 0) : null, foodDays: r[C.fd], price: r[C.price], jobs: js, cpuPerDay: cpu != null ? +cpu.toFixed(2) : null });
    prev = r;
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  log(`=== eq-run — ${SERVER ? '서버(끔 세계 · t1308 마디 자)' : '랩(t17)'} · 시드 ${SEED} · 시작 ${FROM} · +${DAYS}날 · 팔 ${ARMS.map((a) => a.name).join(' · ')} · 코드 지문 ${Lq.codeSig()} · ${OUT}`);
  let src = null, startDay = 0;
  if (FROM === 'new') src = null;
  else if (/^make:\d+$/.test(FROM)) { startDay = +FROM.slice(5); src = SERVER ? await srvMake(startDay) : await labMake(startDay); }
  else {
    src = path.resolve(FROM);
    if (SERVER) { const c = srvCheck(src); if (!c.ok) { console.error(`  ✗ ${c.why} (${src})`); process.exit(3); } startDay = c.m.day; }
    else { try { startDay = JSON.parse(fs.readFileSync(src + '.meta.json', 'utf8')).day; } catch (e) { startDay = null; } }
  }
  if (src && SERVER && /^make:/.test(FROM)) { const c = srvCheck(src); if (!c.ok) { console.error(`  ✗ ${c.why}`); process.exit(3); } }
  const before = src ? sha(SERVER ? path.join(src, 'ck') : src) : null;
  const res = await pool(ARMS.map((arm) => () => (SERVER ? srvArm(arm, src, startDay) : labArm(arm, src))), PAR);
  const after = src ? sha(SERVER ? path.join(src, 'ck') : src) : null;
  if (res.some((r) => r.stale)) process.exit(3);
  const NV = 51;
  const W = Math.min(365, Math.floor(DAYS / 2));
  const tab = res.map((r) => ({ arm: r.arm.name, env: r.arm.env, code: r.code, sec: +r.sec.toFixed(1), days: (r.rows || []).length, blocks: blocks(r.rows, NV), crit: Cr.table(r.rows || [], W), eq: Cr.reached(r.rows || [], W, CRIT) }));
  const J = { card: 'T1420', defDay: DEF_DAY, crit: CRIT, seed: SEED, from: FROM, startDay, days: DAYS, server: SERVER, sig: Lq.codeSig(), src, srcSha: { before, after, same: before === after }, arms: tab, sec: +((Date.now() - t0) / 1000).toFixed(1) };
  fs.writeFileSync(path.join(OUT, 'eq-run.json'), JSON.stringify(J, null, 1));
  const L = [`# eq-run 시드 ${SEED} · ${SERVER ? '서버' : '랩'} · 시작 ${FROM}(날 ${startDay}) · +${DAYS}날 · 코드 지문 ${J.sig}`, ''];
  L.push(`저장본 sha 앞 ${before || '—'} · 뒤 ${after || '—'} · ${src ? (J.srcSha.same ? '같음(판이 저장본을 안 바꿨다)' : '**다름**') : '새 세계'}`, '');
  for (const t of tab) {
    L.push(`## 팔 ${t.arm} ${Object.keys(t.env).length ? '(' + Object.entries(t.env).map(([k, v]) => `${k}=${v}`).join(' ') + ')' : '(env 없음)'} · 코드 ${t.code} · ${t.sec}초 · 관측 ${t.days}날`, '');
    L.push('| 날 | 인구 | 굶어 죽음(구간) | 빈 마을 | 떠난 사람(구간) | 식량 날치 | 값 식량 · 나무 · 돌 · 도구 | 직업 몫 위 셋 | CPU 초/날 |', '|---|---|---|---|---|---|---|---|---|');
    for (const b of t.blocks) L.push(`| ${b.d} | ${b.pop} | ${b.fdDead ?? '—'} | ${b.empty} | ${b.left ?? '—'} | ${b.foodDays ?? '—'} | ${b.price ? ['food', 'wood', 'stone', 'tool'].map((k) => b.price[k] ?? '—').join(' · ') : '—'} | ${b.jobs} | ${b.cpuPerDay ?? '—'} |`);
    L.push('', `**평형에 닿았나**(C1 ≤ ${t.eq.th.c1} ∧ C3 ≤ ${t.eq.th.c3} ∧ C2 ≤ ${t.eq.th.c2} · 창 ${W}날): ${t.eq.day == null ? '안 닿음' : t.eq.day + (t.eq.onlyLast ? '(끝 한 점뿐)' : '')}`);
    L.push('', `기준 후보(창 ${t.crit.W}날 · 든 날 = 처음 참이 되고 끝까지 참): ` + Object.entries(t.crit.enter).map(([k, v]) => `${k} → ${v ?? '안 듦'}`).join(' · '), '');
  }
  fs.writeFileSync(path.join(OUT, 'eq-run.md'), L.join('\n'));
  log(L.join('\n'));
  process.exit(tab.every((t) => t.code === 0) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
