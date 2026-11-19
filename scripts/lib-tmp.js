'use strict';
// (@regress 없음 — 러너 밖 · 하네스 공용 자 · 제품 무변)
// === scripts/lib-tmp.js — 하네스가 만든 `/tmp` 를 제 판 끝에 지운다 (T1400 · T1364 회부 · T1361 회부 5) =========================
//
// ★왜: 전수 한 판(474종 × -j 4)이 `/tmp` 에 306 ~ 308개 · 3.2 ~ 3.4 GB 를 남겼다(T1364). 하네스마다 제 폴더 · DB 를
//   `mkdtempSync` · `/tmp/…-${pid}.db` 로 짓고, 끝에 지우는 하네스도 빨강 · 상한(SIGTERM) · 죽음(SIGKILL)에선 못 지웠다.
//   야간 맥(디스크가 빠듯한 밤 462 MB)에서 쌓이면 다음 판이 디스크로 죽는다.
// ★이 자 — 이름에 하네스 표와 pid 를 박아 짓고(`dmh-<표>-<pid>-…`), 판이 끝날 때(정상 · `process.exit` · SIGTERM · SIGINT) 지운다.
//   SIGKILL 처럼 못 지운 판은 **다음 판 머리**에서 지운다: 같은 표의 묵은 것 가운데 pid 가 살아 있지 않은 것.
// 쓰는 법:
//   const LT = require('./lib-tmp');
//   const D = LT.dir('t1342');               // 폴더(판 끝에 통째로 지움)
//   const DB = LT.file('t1342', '.db');      // 파일 하나(판 끝에 그 파일 · -wal · -shm 지움)
//   LT.own('/tmp/sbc-XXXX');                  // 남이 지은 것(자식 판이 찍어 준 폴더)도 판 끝에 지우게 맡긴다
//   LT.keep()                                  // 판을 살펴보려면(환경 `KEEP_TMP=1` 도 같다) — 지우지 않고 자리만 찍는다
// ★지우는 것은 이 자에 맡긴 길만이다 — 남의 판(다른 pid 가 살아 있는) 것은 안 건드린다.
const fs = require('fs'), os = require('os'), path = require('path');
const PRE = 'dmh-';
const owned = new Set();
let keep = process.env.KEEP_TMP === '1', hooked = false;
const swept = new Set();

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function rm(p) { for (const q of [p, p + '-wal', p + '-shm', p + '-journal']) { try { fs.rmSync(q, { recursive: true, force: true }); } catch (e) {} } }
function cleanup() {
  if (keep) { if (owned.size) console.log(`  [lib-tmp] KEEP_TMP — 안 지움: ${[...owned].join(' ')}`); return; }
  for (const p of owned) rm(p);
  owned.clear();
}
function hook() {
  if (hooked) return; hooked = true;
  process.on('exit', cleanup);
  //   신호로 끝나는 판(러너 상한 `timeout` = SIGTERM · 손 Ctrl-C)도 지운다 — 다른 손잡이(하네스 · 제품 저장)가 있으면 그 손잡이에 끝맺음을 맡기고(종전 그대로) · 없으면 143 · 130 으로 끝낸다 — 지우기는 늘 'exit' 에서.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => { if (process.listenerCount(sig) === 0) process.exit(sig === 'SIGTERM' ? 143 : 130); });   // 지우기는 'exit' 에서(제품 신호 손잡이 — 저장 — 뒤)
  }
}
//   다음 판 머리 — 같은 표의 묵은 것(pid 가 죽은) 지우기. 표마다 한 번.
function sweep(tag) {
  if (swept.has(tag)) return 0; swept.add(tag);
  const want = PRE + tag + '-'; let n = 0;
  let names = []; try { names = fs.readdirSync(os.tmpdir()); } catch (e) { return 0; }
  for (const f of names) {
    if (!f.startsWith(want)) continue;
    const m = /^(\d+)(?:[-.]|$)/.exec(f.slice(want.length));
    if (!m || +m[1] === process.pid || alive(+m[1])) continue;
    rm(path.join(os.tmpdir(), f)); n++;
  }
  return n;
}
function tagOk(tag) { if (!/^[A-Za-z0-9_]+$/.test(tag)) throw new Error(`lib-tmp: 표는 영숫자 · _ 만(${tag})`); return tag; }
function dir(tag) {
  tagOk(tag); sweep(tag); hook();
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `${PRE}${tag}-${process.pid}-`));
  owned.add(d); return d;
}
function file(tag, ext) {
  tagOk(tag); sweep(tag); hook();
  const n = owned.size;
  const f = path.join(os.tmpdir(), `${PRE}${tag}-${process.pid}${n ? '.' + n : ''}${ext || ''}`);
  rm(f); owned.add(f); return f;
}
//   남이 지은 이름(종전 `` `/tmp/x-${process.pid}.db` `` · 자식 판이 찍어 준 폴더)도 판 끝에 지우게 맡긴다. 이름에 제 pid 가 들었으면
//   같은 꼴의 묵은 것(pid 자리만 다르고 그 pid 가 죽은 것)도 이 판 머리에서 지운다 — SIGKILL 로 못 지운 앞 판 몫.
function own(p) {
  if (!p) return p;
  const r = path.resolve(String(p));
  if (!r.startsWith(os.tmpdir() + path.sep)) return p;
  hook(); owned.add(r);
  const b = path.basename(r), pid = String(process.pid), i = b.indexOf(pid);
  if (i >= 0 && path.dirname(r) === os.tmpdir() && !swept.has('own:' + b)) {
    swept.add('own:' + b);
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('^' + esc(b.slice(0, i)) + '(\\d+)' + esc(b.slice(i + pid.length)) + '(?:-wal|-shm|-journal)?$');
    let names = []; try { names = fs.readdirSync(os.tmpdir()); } catch (e) {}
    for (const f of names) { const m = re.exec(f); if (m && m[1] !== pid && !alive(+m[1])) rm(path.join(os.tmpdir(), f)); }
  }
  return p;
}
module.exports = { dir, file, own, sweep, cleanup, keep: () => { keep = true; }, owned: () => [...owned], PRE, alive };
//   글자 자(lint ㉑) — 하네스 글자(주석 뺀)에서 **제 `/tmp` 를 안 치우는 자리**를 센다. 판정 0 · 글자 짐작:
//   ⓐ `X = …mkdtempSync(…)` · `X = '/tmp/…'` · `` X = `/tmp/…` `` · `X = path.join(os.tmpdir(), …)` 로 지은 이름 X 가
//     `rmSync(X` · `rmdirSync(X` · `unlinkSync(X` · `[X,` · `[X]`(지울 파일 줄) · `own(X` 어디에도 없으면 자리 하나
//   ⓑ 이름에 안 담고 바로 쓴 `mkdtempSync(` 도 자리 하나(지울 손잡이가 없다)
//   `lib-tmp` 의 `dir(` · `file(` 로 지은 것은 자가 지운다 — 셈 밖.
function leaks(code) {
  const out = [];
  const asg = /(?:\b(?:const|let|var)\s+|,\s*)([A-Za-z_$][\w$]*)\s*=\s*(?:fs\.)?(mkdtempSync\(|['"`]\/tmp\/|path\.join\(\s*(?:os\.)?tmpdir\(\))/g;
  const named = new Set();
  const freedV = (v) => { const e = v.replace(/\$/g, '\\$'); return new RegExp(`(?:rmSync|rmdirSync|unlinkSync|own)\\(\\s*${e}\\b|\\[\\s*${e}\\s*[,\\]]|\\[[^\\]\\n]*,\\s*${e}\\s*[,\\]]`).test(code); };
  for (const m of code.matchAll(asg)) {
    const v = m[1]; named.add(m.index + m[0].indexOf(m[2]));
    //   지운다고 맡긴 폴더 안에 지은 것(`mkdtempSync(path.join(TMP, 'x-'))` · TMP 를 지움)은 그 폴더와 함께 간다 — 셈 밖.
    if (m[2] === 'mkdtempSync(') { const pj = /^\s*path\.join\(\s*([A-Za-z_$][\w$]*)\s*,/.exec(code.slice(m.index + m[0].length)); if (pj && freedV(pj[1])) continue; }
    //   고정 이름(`'/tmp/e2e-shots'` · `` `/tmp/rtt-${label}-c.db` `` 처럼 pid · 시각 · 난수가 없는 이름)은 판마다 **덮어써** 쌓이지 않는다 — 셈 밖(사진은 사람이 본다).
    if (m[2] !== 'mkdtempSync(') { const line = code.slice(m.index, code.indexOf('\n', m.index) >>> 0 || undefined); if (!/process\.pid|\bpid\b|Date\.now|random|mkdtemp/.test(line)) continue; }
    if (!freedV(v)) out.push(v);
  }
  for (const m of code.matchAll(/mkdtempSync\(/g)) {
    const at = m.index - (code.slice(Math.max(0, m.index - 3), m.index) === 'fs.' ? 3 : 0);
    if (!named.has(m.index) && !named.has(at)) out.push('(이름 없는 mkdtempSync)');
  }
  return out;
}
module.exports.leaks = leaks;
//   lint ㉑ 의 자 — 하네스 글자(주석 뺀)에서 판마다 새 이름으로 짓는 `/tmp` 자리(mkdtemp · pid · 시각 · 난수 이름)를 다 찾아, **판 끝에 안 지워지는 자리**를 센다.
//   지워짐: ⓐ `lib-tmp` `dir(` · `file(` ⓑ 이름 변수가 `rmSync` · `unlinkSync` · `own(` · 지울 파일 줄에 듦(위 `leaks`) ⓒ pid 이름 `.db`(-wal · -shm) —
//   러너가 판마다 지운다(`sweepDead`). 글자 짐작 · 판정 0.
function audit(code, o) {
  //   `o.noRunner` — 러너가 `sweepDead` 로 pid 이름 DB 를 지우기 전 판(T1400 앞)으로 센다(앞 → 뒤 표)
  const usesPort = !(o && o.noRunner);   // pid 이름 `.db` 는 러너가 판 끝에 지운다(아래 `sweepDead`)
  const leak = new Set(leaks(code));
  const out = [];
  //   ⓐ 이름 붙은 자리 — leaks 가 못 지운다고 본 이름. pid .db 이름이면 러너(`sweepDead`)가 지운다.
  const asg = /(?:\b(?:const|let|var)\s+|,\s*)([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g;
  const named = new Set();
  for (const m of code.matchAll(asg)) {
    if (!leak.has(m[1])) continue; named.add(m[1]);
    const isDb = /\.db['"`]/.test(m[2]) && /process\.pid|\bpid\b/.test(m[2]);
    if (!(isDb && usesPort)) out.push(m[1]);
  }
  for (const v of leak) if (!named.has(v)) out.push(v);   // 이름 없는 mkdtemp 들
  //   ⓑ 이름에 안 담은 pid 글자(`DB_PATH: \`/tmp/x-${process.pid}.db\``) — .db 면 러너가 지운다 · 아니면 자리 하나
  for (const m of code.matchAll(/(['"`])(\/tmp\/[^'"`\n]*?(?:\$\{process\.pid\}|\$\{pid\}|Date\.now|random)[^'"`\n]*)\1/g)) {
    const before = code.slice(Math.max(0, m.index - 80), m.index);
    if (/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*$|,\s*[A-Za-z_$][\w$]*\s*=\s*$/.test(before)) continue;   // ⓐ 에서 셌다
    if (/own\(\s*$/.test(before)) continue;
    const asn = /([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before);   // 선언 없는 대입(`DDIR = \`/tmp/…\``) — 그 이름을 지우면 셈 밖
    if (asn && new RegExp(`(?:rmSync|rmdirSync|unlinkSync|own)\\(\\s*${asn[1].replace(/\$/g, '\\$')}\\b`).test(code)) continue;
    const isDb = /\.db(?:-wal|-shm|-journal)?$/.test(m[2]);
    if (!(isDb && usesPort)) out.push(m[2].slice(0, 40));
  }
  return out;
}
module.exports.audit = audit;
//   ★러너 몫(`run-regress.sh` — 하네스 한 판이 끝날 때마다 부른다): 이 러너 판이 뜬 뒤(`t0` ms) `/tmp` · `os.tmpdir()` 바로 밑에 선 `.db`(-wal · -shm · -journal)
//   가운데 이름의 숫자 토막(앞뒤가 `-` · `_` · `.` · 끝 · 세 자리 이상)이 **다 죽은 pid** 인 것을 지운다 — 하네스 200여 종이 `` `/tmp/x-${process.pid}.db` `` 로 짓고
//   빨강 · 상한(SIGTERM) · 죽음(SIGKILL)에선 못 지웠다(T1364 전수 한 판 306 ~ 308개 · 3.2 ~ 3.4 GB). 하네스마다 손 0 · 산 판(나란히 도는 남의 판)의 것은 안 건드린다.
//   숫자 토막이 없는 이름(되쓰는 캐시 `slicer-seed-*` · 고정 이름)과 이 러너 판 앞에 선 것은 안 건드린다.
function sweepDead(t0) {
  let n = 0, bytes = 0;
  for (const d of new Set(['/tmp', os.tmpdir()])) {
    let names = []; try { names = fs.readdirSync(d); } catch (e) { continue; }
    for (const f of names) {
      if (!/\.db(?:-wal|-shm|-journal)?$/.test(f)) continue;
      const toks = [...f.matchAll(/(?:^|[-_.])(\d{3,})(?=[-_.]|$)/g)].map((m) => +m[1]);
      if (!toks.length || toks.some((p) => alive(p))) continue;
      const p = path.join(d, f);
      try { const st = fs.statSync(p); if (!st.isFile() || st.mtimeMs < t0) continue; fs.rmSync(p, { force: true }); n++; bytes += st.size; } catch (e) {}
    }
  }
  return { n, bytes };
}
module.exports.sweepDead = sweepDead;
if (require.main === module && process.argv[2] === '--sweep-dead') {
  const r = sweepDead(+process.argv[3] || 0);
  if (r.n) console.log(`  [찌꺼기] /tmp 에서 죽은 판 이름 DB ${r.n}개 지움(${(r.bytes / 1048576).toFixed(0)} MB)`);
}
