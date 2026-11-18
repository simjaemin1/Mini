#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · CI 분류표 정본 · 제품 무변)
// === scripts/ci-class.js — `scripts/test-*.js` 전수를 CI 에 올릴 수 있는가로 가르는 분류표 (T1350 · 재민 11-17 테스트 강화) ===========
//
// ★왜: CI(`.github/workflows/regress-unit.yml`)는 9월에 손으로 적은 27종이었다(약 406종 중). 손 목록은 낡는다 — 새 하네스는 안 들어가고
//   빠진 까닭도 안 남는다. 이 자는 **실제로 돌려 본 결과**로 표를 만들고, CI 목록은 이 표에서 기계로 뽑는다(손으로 적지 않는다).
// ★분류(넷):
//   (가) 프로세스 · 브라우저 0 — 하네스 한 프로세스 안에서 끝난다.
//   (나) 자식 프로세스만 — 미끼 사본 · 손잡이 판(env 를 바꿔 node 하나 더) 등 · 소켓을 안 듣고 브라우저 0.
//   (다) 서버를 띄움 — **자식 프로세스**가 소켓을 듣는다(`net.Server.listen` — 존 · central · http 를 따로 띄운 판).
//       하네스 제 프로세스가 존을 불러 포트 하나를 듣는 꼴(`require(server/zone.js)`)은 프로세스를 안 띄운다 — (가)(나) 그대로 · 표에 `inproc` 표시.
//   (라) 브라우저 — playwright `launch` 또는 브라우저 실행 파일을 자식으로.
//   가르는 근거 둘: ⓐ 글자(하네스 + 그것이 부르는 `scripts/` 자를 따라가며 — playwright · 존/central 경로 · `.listen(` · `child_process`)
//   ⓑ **돌린 판**(`ci-probe.js` 탐침 — 실제로 일어난 자식 · 듣기 · 브라우저). 돌린 판이 있으면 판이 정본(글자는 돌리기 전 짐작 · 안 돌린 줄만 글자).
// ★CI 올림 규칙(core): (가)(나) · 다섯 판 다 초록(러너 판정 — RC 0 · 결과 줄 있음) · 가장 긴 판 60초 이하. 그 밖은 까닭을 표에 적는다.
// ★표: `scripts/ci-class.json`(정본 · 커밋) — 줄마다 { name, cls, secs(판마다), rc(판마다), why, core, shard }.
//   CI 의 core 목록은 `--write-yml` 이 이 표에서 `regress-unit.yml` 의 표지 사이 블록에 쓴다 · `test-ci-list` 가 둘이 같은지 본다.
//
// 쓰는 법:
//   node scripts/ci-class.js --static                      # 글자로만 가른다(돌리지 않음) — 표 머리 갱신
//   node scripts/ci-class.js --measure [--runs 5] [--only a.js,b.js] [--cap 120]   # (가)(나) 후보를 탐침과 함께 돌려 표를 채운다
//   node scripts/ci-class.js --times <러너 로그…>          # 러너 로그 `[소요]` 의 홀로 걸린 초(한 판)를 옮긴다 — 60초 넘는 판 · (라)는 다섯 판을 안 잰다
//   node scripts/ci-class.js --write-yml [--shards 4]       # 표의 core 를 잡 몇 개로 나눠 yml 블록에 쓴다
//   node scripts/ci-class.js --core                         # core 목록(줄마다 하나) — 다른 자가 부를 때
//   node scripts/ci-class.js --table                        # 사람이 읽는 표(마크다운)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const TABLE = path.join(SCRIPTS, 'ci-class.json');
const YML = path.join(ROOT, '.github', 'workflows', 'regress-unit.yml');
const CORE_MAX_SEC = 60, RUNS_DEFAULT = 5;
const CLS = ['가', '나', '다', '라'];
const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };

// ── ⓐ 글자 ──────────────────────────────────────────────────────────────────────
const codeOnly = require('./code-only.js');   // 주석 빼기 정본(사본 0 — `test-harness-lint` ⑦a)
const _src = new Map();
function srcOf(f) { if (!_src.has(f)) { let s = ''; try { s = codeOnly(fs.readFileSync(f, 'utf8')); } catch (e) {} _src.set(f, s); } return _src.get(f); }
//   하네스가 부르는 `scripts/` 자(lib · 픽스처 · 판 자)를 따라간다 — 제품(server · sim · public)은 따라가지 않는다(제품은 프로세스를 안 띄우는 것이 정상 —
//   존 · central 은 "그 파일을 부르면 서버"로 따로 센다).
function localDeps(f, seen) {
  seen = seen || new Set();
  if (seen.has(f)) return seen; seen.add(f);
  const s = srcOf(f);
  for (const m of s.matchAll(/require\(\s*['"](\.\/[^'"]+|\.\.\/scripts\/[^'"]+)['"]\s*\)|require\(\s*path\.join\(\s*(?:__dirname|SCRIPTS)\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)/g)) {
    const r = m[1] || m[2]; let p = path.resolve(path.dirname(f), r); if (!/\.js$/.test(p)) p += '.js';
    if (p.startsWith(SCRIPTS) && fs.existsSync(p)) localDeps(p, seen);
  }
  return seen;
}
function staticClass(name) {
  const f = path.join(SCRIPTS, name);
  const files = [...localDeps(f)];
  const all = files.map(srcOf).join('\n');
  const why = [];
  if (/require\(\s*['"]playwright|chromium\.launch|webkit\.launch|require\(\s*['"]\.\/browser-driver['"]/.test(all)) { why.push('playwright · browser-driver'); return { cls: '라', why, files: files.length }; }
  //   존 · central 을 **부르거나 띄우는** 글자만(소스를 글자로 읽는 `readFileSync(… 'zone.js')` 는 서버가 아니다 — 판이 가린다)
  if (/require\([^)\n]*\b(zone|central)(\.js)?['"]\s*\)\s*\)?|\bSV\(\s*['"](zone|central)\.js|fixture-boot|\.listen\(|createServer\(|WebSocketServer|__testBind\(/.test(all)
      || /(spawn|fork|execFile)\w*\([^;\n]*(zone|central)\.js/.test(all)) { why.push('존 · central · listen · fixture-boot'); return { cls: '다', why, files: files.length }; }
  if (/require\(\s*['"]child_process['"]\s*\)|child_process/.test(all) && /\b(spawn|spawnSync|execFile|execFileSync|execSync|exec|fork)\s*\(/.test(all)) { why.push('child_process'); return { cls: '나', why, files: files.length }; }
  return { cls: '가', why, files: files.length };
}

// ── ⓑ 돌린 판 ───────────────────────────────────────────────────────────────────
//   러너(`run-regress.sh`)와 같은 판정: RC 0 이고 결과 줄(✓ ✗ 표시 또는 통과 · PASS · FAIL · 실패 · 결과)이 있으면 초록.
function runOnce(name, capSec) {
  const out = path.join(os.tmpdir(), `ci-probe-${process.pid}-${name}.jsonl`);
  try { fs.unlinkSync(out); } catch (e) {}
  const env = Object.assign({}, process.env, { CI_PROBE_OUT: out, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${path.join(SCRIPTS, 'ci-probe.js')}`.trim(),
    TIDE_FREEZE_MS: process.env.TIDE_FREEZE_MS || '372603' });   // CI 잡과 같은 env(물때 고정)
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, name)], { cwd: ROOT, env, encoding: 'utf8', timeout: capSec * 1000, maxBuffer: 256 << 20, killSignal: 'SIGKILL' });
  const secs = +((Date.now() - t0) / 1000).toFixed(1);
  const txt = (r.stdout || '') + (r.stderr || '');
  const marks = (txt.match(/^[ \t]*(✓|✔|✗|✘)/gm) || []).length, words = (txt.match(/통과|PASS|FAIL|실패|결과/g) || []).length;
  const rc = r.error && r.error.code === 'ETIMEDOUT' ? 124 : (r.status == null ? 137 : r.status);
  let ev = []; try { ev = fs.readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) {}
  try { fs.unlinkSync(out); } catch (e) {}
  const browser = ev.some((e) => e.ev === 'browser' || (e.ev === 'child' && /chrom|webkit|firefox|WebKitWebDriver|headless_shell/i.test(e.what)));
  //   듣기는 **누가** 들었나로 가른다 — 하네스 제 프로세스가 존을 불러(포트 하나 · `require(zone.js)`) 들은 것은 서버를 **띄운** 것이 아니다(프로세스 0 ·
  //   지금 CI 27종 가운데 여럿이 이 꼴 — `test-kcal` · `test-body` …). 자식 프로세스가 들으면 서버를 띄운 것(다).
  const listen = ev.some((e) => e.ev === 'listen' && e.pid !== r.pid), inproc = ev.some((e) => e.ev === 'listen' && e.pid === r.pid), child = ev.some((e) => e.ev === 'child');
  const fails = (txt.match(/^[ \t]*✗.*$/gm) || []).slice(0, 2).map((s) => s.trim().slice(0, 120));
  return { rc, secs, green: rc === 0 && marks + words > 0, dyn: browser ? '라' : listen ? '다' : child ? '나' : '가', inproc, fails,
    childWhat: [...new Set(ev.filter((e) => e.ev === 'child').map((e) => e.what.split(' ').slice(0, 2).map((x) => path.basename(x)).join(' ')))].slice(0, 4) };
}

function load() { try { return JSON.parse(fs.readFileSync(TABLE, 'utf8')); } catch (e) { return { rows: {} }; } }
function save(T) {
  const rows = {}; for (const k of Object.keys(T.rows).sort()) rows[k] = T.rows[k];
  T.rows = rows; fs.writeFileSync(TABLE, JSON.stringify(T, null, 1) + '\n');
}
const heavier = (a, b) => (CLS.indexOf(a) >= CLS.indexOf(b) ? a : b);
function decide(row) {
  const runs = row.runs || [];
  const cls = row.dyn || row.cls0;   // 돌린 판이 있으면 판이 정본(글자는 앞 짐작 — 존 소스를 읽기만 하는 하네스 · 제 프로세스 존을 글자는 못 가른다)
  row.cls = cls;
  const maxS = runs.length ? Math.max(...runs.map((r) => r.secs)) : null;
  row.maxSec = maxS;
  const allGreen = runs.length >= RUNS_DEFAULT && runs.every((r) => r.green);
  const same = runs.length >= RUNS_DEFAULT && runs.every((r) => r.green === runs[0].green);
  row.same5 = runs.length >= RUNS_DEFAULT ? same : null;
  let why = '';
  if (cls === '다' || cls === '라') why = `${cls === '다' ? '서버' : '브라우저'}${row.dyn ? '' : '(글자)'} — CI 밖(야간 · 전수)`;
  else if (!runs.length && row.logSec > CORE_MAX_SEC) why = `러너 한 판 ${row.logSec}초 > ${CORE_MAX_SEC}초(안 돌림)`;
  else if (!runs.length) why = '안 잼';
  else if (maxS > CORE_MAX_SEC) why = `${maxS}초 > ${CORE_MAX_SEC}초`;
  else if (runs.length < RUNS_DEFAULT) why = `${runs.length}판만 잼`;
  else if (!same) why = `다섯 판 갈림(초록 ${runs.filter((r) => r.green).length}/${runs.length})`;
  else if (!allGreen) why = `다섯 판 다 빨강 — ${(runs[0].fails[0] || 'RC ' + runs[0].rc)}`;
  row.core = !why;
  row.why = why || 'core';
  return row;
}

function listTests() { return fs.readdirSync(SCRIPTS).filter((f) => /^test-.*\.js$/.test(f)).sort(); }

if (has('--static')) {
  const T = load(); const names = listTests();
  for (const n of Object.keys(T.rows)) if (!names.includes(n)) delete T.rows[n];
  for (const n of names) { const s = staticClass(n); const r = T.rows[n] || {}; r.cls0 = s.cls; r.why0 = s.why.join(' · '); T.rows[n] = decide(r); }
  T.at = T.at || null; save(T);
  const c = {}; for (const r of Object.values(T.rows)) c[r.cls] = (c[r.cls] || 0) + 1;
  console.log(`글자 분류 ${names.length}종 · ${CLS.map((k) => `${k} ${c[k] || 0}`).join(' · ')}`);
}
if (has('--measure')) {
  const T = load(); const runsN = +arg('--runs', RUNS_DEFAULT), cap = +arg('--cap', 120);
  const only = arg('--only', '') ? arg('--only', '').split(',') : null;
  //   잴 것: 글자 (라) 가 아니고 러너 로그 한 판이 60초 이하(또는 로그에 없음)인 것 — 글자 (다) 도 잰다(글자가 무겁게 볼 수 있다 · 판이 가린다)
  const names = only || Object.keys(T.rows).filter((n) => T.rows[n].cls0 !== '라' && !(T.rows[n].logSec > CORE_MAX_SEC) && !(T.rows[n].runs || []).length);
  let i = 0;
  for (const n of names) {
    const row = T.rows[n] || { cls0: staticClass(n).cls }; row.runs = [];
    for (let k = 0; k < runsN; k++) {
      const r = runOnce(n, cap); row.runs.push({ rc: r.rc, secs: r.secs, green: r.green, fails: r.fails });
      row.dyn = row.dyn ? heavier(row.dyn, r.dyn) : r.dyn; if (r.childWhat.length) row.child = r.childWhat; if (r.inproc) row.inproc = true;
      if (r.secs > CORE_MAX_SEC || r.dyn === '다' || r.dyn === '라') break;   // 못 오를 판은 한 판으로 끝(시간 아낌 · 표에 그 까닭)
    }
    T.rows[n] = decide(row); i++;
    console.log(`[${i}/${names.length}] ${n} ${row.cls} ${row.runs.map((r) => (r.green ? '초' : '빨') + r.secs).join(' ')} → ${row.why}`);
    save(T);
  }
  T.at = new Date().toISOString().slice(0, 10); save(T);
}
if (has('--times')) {
  const T = load(); const logs = argv.slice(argv.indexOf('--times') + 1).filter((x) => !x.startsWith('--'));
  for (const lg of logs) {
    let cur = null;
    for (const l of fs.readFileSync(lg, 'utf8').split('\n')) {
      const o = /^##### (\S+) #####$/.exec(l.trim()); if (o) { cur = o[1]; continue; }
      const s = /\[소요\] (\d+)초/.exec(l); if (s && cur && T.rows[cur]) T.rows[cur].logSec = +s[1];
    }
  }
  save(T);
}
function shardsOf(T, K) {
  const core = Object.entries(T.rows).filter(([, r]) => r.core).map(([n, r]) => [n, r.maxSec || 1]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const bins = Array.from({ length: K }, () => ({ s: 0, l: [] }));
  for (const [n, s] of core) { const b = bins.slice().sort((x, y) => x.s - y.s)[0]; b.s += s; b.l.push(n); }
  return bins.map((b) => ({ secs: +b.s.toFixed(1), list: b.l.sort() }));
}
const MARK_A = '# <ci-class core — scripts/ci-class.js --write-yml 이 쓴다 · 손으로 고치지 않는다>', MARK_B = '# </ci-class core>';
function ymlBlock(T, K) {
  const S = shardsOf(T, K);
  const lines = [MARK_A, `        # 분류표 ${T.at || '?'} · core ${S.reduce((a, b) => a + b.list.length, 0)}종 · 잡 ${K}개(합 초 ${S.map((b) => Math.round(b.secs)).join(' · ')})`, '        include:'];
  S.forEach((b, i) => { lines.push(`          - shard: '${i + 1}/${K}'`); lines.push(`            list: >-`); for (const n of b.list) lines.push(`              ${n}`); });
  lines.push(`        ${MARK_B}`);
  return lines.map((l, i) => (i === 0 ? '        ' + l : l)).join('\n');
}
if (has('--write-yml')) {
  const T = load(); const K = +arg('--shards', 4);
  const y = fs.readFileSync(YML, 'utf8'); const a = y.indexOf(MARK_A), b = y.indexOf(MARK_B);
  if (a < 0 || b < 0) { console.error('yml 에 표지가 없다'); process.exit(2); }
  const s = y.lastIndexOf('\n', a) + 1, e = b + MARK_B.length;
  fs.writeFileSync(YML, y.slice(0, s) + ymlBlock(T, K) + y.slice(e));
  console.log(`yml core 블록 — ${shardsOf(T, K).map((x) => `${x.list.length}종 ${Math.round(x.secs)}초`).join(' · ')}`);
}
if (has('--core')) { const T = load(); console.log(Object.keys(T.rows).filter((n) => T.rows[n].core).join('\n')); }
if (has('--table')) {
  const T = load(); const c = {}, cc = {}; for (const r of Object.values(T.rows)) { c[r.cls] = (c[r.cls] || 0) + 1; if (r.core) cc[r.cls] = (cc[r.cls] || 0) + 1; }
  console.log(`# CI 분류표 — ${T.at || '?'} · ${Object.keys(T.rows).length}종 · ${CLS.map((k) => `${k} ${c[k] || 0}(core ${cc[k] || 0})`).join(' · ')}\n`);
  console.log('| 하네스 | 분류(글자 → 판) | 판마다 초 · 초록 | 다섯 판 같음 | core | 까닭 |'); console.log('|---|---|---|---|---|---|');
  for (const [n, r] of Object.entries(T.rows)) console.log(`| ${n} | ${r.cls0}${r.dyn && r.dyn !== r.cls0 ? ' → ' + r.dyn : ''} | ${(r.runs || []).map((x) => `${x.secs}${x.green ? '' : '✗'}`).join(' ') || (r.logSec != null ? `러너 ${r.logSec}` : '—')} | ${r.same5 == null ? '—' : r.same5 ? '같음' : '갈림'} | ${r.core ? '○' : ''} | ${r.why} |`);
}
module.exports = { staticClass, decide, shardsOf, ymlBlock, load, MARK_A, MARK_B, CORE_MAX_SEC };
