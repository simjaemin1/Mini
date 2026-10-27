#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T942 다시 뜬 판 몸 복원 A/B · 제품 무변 · 판정 0)
// === scripts/t942-restore-ab.js — 다친 몸이 든 저장본으로 트리마다 다시 띄워 **몸 칸 복원(T747)이 문을 지나도 같은가** ===
//   왜: 다시 뜬 판 몸 복원(`villages._t747Restore` · T747 켬 기본)은 `SimVillages.init(...)` 안에서 동기로 돌며 이제 몸 hp 를 문(`setHp`)으로 쓴다.
//     저장 순간 몸이 다 만피면 문은 `next === prev` 로 바로 돌아가 아무 일도 안 한다(T833 탐침 판 실측 — 612몸 모두 그랬다) ⇒ 다친 몸이 든 저장본이라야 잰다.
//   ① 저장본(T728 종료 저장 — 마을 행 `econ_state` 의 `_t747Body.rows`)을 판 폴더에 트리마다 따로 복사하고 몸 hp 를 정해진 차례로 바꾼다
//      (몸 다섯에 둘 — 다섯째마다 37 · 그다음마다 99.5 = 정수가 안 바뀌는 값 · 결정론 · 저장본의 그 밖 칸 무접촉)
//   ② 트리마다 같은 바꾼 저장본으로 존을 띄워 n 날 뒤 내린다(T833 탐침 꼴 — 가상 시계 · `T745_V0` = 저장 순간 V + 하루 · 훅 셋 + t942 관찰자)
//   ③ 견줌(표만): `[T747] 몸 칸 되돌림 · 복원 실패` 줄 · 부팅 순간 NPC 몸 hp 지문(관찰자 'init') · 날마다 지문 · 문 셈
//   쓰는 법: node scripts/t942-restore-ab.js --dir <판 폴더> --trees M=<트리>,B=<트리>[,Z=<트리>] [--make <트리> --stop 40 | --db <w.db> --stopv <저장 순간 V> --day <저장 날>] [--days 2] [--day-ms 250]
//     --make: 저장본을 먼저 만든다 — 그 트리로 새 세계(시드 1020)를 --stop 날까지 돌려 제품 종료 문으로 내린다(T833 탐침 p1 꼴 · 저장 순간 V 는 탐침 덤프에서)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const DIR = path.resolve(opt('dir', path.join(os.tmpdir(), 't942-restore'))), MAKE = opt('make', ''), MSTOP = +opt('stop', '40');
let DB0 = path.resolve(opt('db', path.join(DIR, 'base.db'))), STOPV = +opt('stopv', '0'), DAY = +opt('day', '0');
const DAYS = +opt('days', '2'), DAYMS = +opt('day-ms', '250');
const TREES = opt('trees', '').split(',').filter(Boolean).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), path.resolve(s.slice(i + 1))]; });
fs.mkdirSync(DIR, { recursive: true });
const OBS = path.join(__dirname, 't942-hp-probe.js');
function hurtCopy(dst) {
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dst + s); } catch (e) {} try { fs.copyFileSync(DB0 + s, dst + s); } catch (e) {} }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dst);
  const rows = db.prepare('SELECT id, econ_state FROM villages ORDER BY id').all();
  const up = db.prepare('UPDATE villages SET econ_state = ? WHERE id = ?');
  let n = 0, h37 = 0, h995 = 0, bodies = 0;
  for (const r of rows) {
    let e; try { e = JSON.parse(r.econ_state); } catch (x) { continue; }
    const B = e && e._t747Body; if (!B || !Array.isArray(B.rows)) continue;
    let ch = false;
    for (const S of B.rows) {
      if (!S || typeof S.hp !== 'number') continue;
      bodies++; n++;
      if (n % 5 === 0) { S.hp = 37; h37++; ch = true; } else if (n % 5 === 1) { S.hp = 99.5; h995++; ch = true; }
    }
    if (ch) up.run(JSON.stringify(e), r.id);
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
  return { bodies, h37, h995 };
}
function boot(tag, tree, dbp, first) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: '0', DB_PATH: dbp, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
      T577_SEED: '1020', T577_DAYS: '99999', T577_OUT: path.join(DIR, tag + '.json'), T745_VCLOCK: '1', ...(first ? {} : { T745_V0: String(Math.ceil(STOPV) + DAYMS) }),
      T833P_OUT: path.join(DIR, tag + '.probe.json'), T833P_STOP: String(first ? MSTOP : DAY + DAYS), VILLAGE_DAY_MS: String(DAYMS),
      T699_ROUTE_CACHE: process.env.T699_ROUTE_CACHE || path.join(os.tmpdir(), 'durango-route-cache'),
      NODE_OPTIONS: [`--require ${path.join(tree, 'scripts', 't745-vclock.js')}`, `--require ${path.join(tree, 'scripts', 't833-probe-hook.js')}`, `--require ${OBS}`].join(' '),
    });
    delete env.VILLAGE_NPC_CAP;
    const t0 = Date.now(), lf = fs.openSync(path.join(DIR, tag + '.log'), 'w');
    const ch = spawn(process.execPath, ['-r', path.join(tree, 'scripts', 't577-server-hook.js'), path.join(tree, 'server', 'zone.js')], { cwd: tree, env, stdio: ['ignore', lf, lf] });
    const to = setTimeout(() => { try { ch.kill('SIGTERM'); } catch (e) {} }, 3300 * 1000);
    ch.on('exit', (code, sig) => { clearTimeout(to); resolve({ tag, code, sig, sec: Math.round((Date.now() - t0) / 1000) }); });
  });
}
(async () => {
  if (MAKE) {   // 저장본 만들기 — 새 세계를 --stop 날까지(T833 탐침 p1 꼴)
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB0 + s); } catch (e) {} }
    const r0 = await boot('base', path.resolve(MAKE), DB0, true);
    const P = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'base.probe.json'), 'utf8')); } catch (e) { return null; } })();
    if (!P || !P.stopV) { console.log(`  ✗ 저장본을 못 만들었다(${r0.sec}초 · 종료 ${r0.code})`); process.exit(2); }
    STOPV = P.stopV; DAY = MSTOP;
    console.log(`  저장본: ${MAKE} · 새 세계 ${MSTOP}날 · ${r0.sec}초 · 저장 순간 V ${STOPV}`);
  }
  if (!fs.existsSync(DB0) || !STOPV || !DAY || !TREES.length) { console.error('저장본 · 저장 순간 V · 날 · 트리가 있어야 한다'); process.exit(2); }
  console.log(`=== T942 다시 뜬 판 몸 복원 A/B — 저장본 ${DB0} · 날 ${DAY} · ${DAYS}날 더 · 하루 ${DAYMS}ms · 트리 ${TREES.map((t) => t[0]).join(' · ')} ===`);
  const runs = await Promise.all(TREES.map(([tag, tree]) => { const dbp = path.join(DIR, tag + '.db'); const H = hurtCopy(dbp); console.log(`  ${tag}: 저장본 몸 ${H.bodies} · 37 로 ${H.h37} · 99.5 로 ${H.h995}`); return boot(tag, tree, dbp); }));
  const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const out = {};
  for (const r of runs) {
    const log = fs.readFileSync(path.join(DIR, r.tag + '.log'), 'utf8').split('\n').filter((l) => /\[T747\]/.test(l)).map((l) => l.replace(/^.*\[T747\] /, ''));
    const ob = J(path.join(DIR, r.tag + '.json.t942.json')) || {};
    out[r.tag] = { sec: r.sec, code: r.code, sig: r.sig, t747: log, days: ob.days || [], cnt: ob.cnt || null };
    console.log(`  ${r.tag}: ${r.sec}초(종료 ${r.code}${r.sig ? ' ' + r.sig : ''}) · T747 ${log.map((l) => l.slice(0, 120)).join(' | ')} · 지문 ${(ob.days || []).map((d) => d[0] + ':' + d[2]).join(' ')}`);
    if (ob.cnt) console.log(`     문 셈 ${Object.entries(ob.cnt).map(([k, v]) => `${k} ${v.n}(바뀜 ${v.write} · 같음 ${v.same} · 0밑 ${v.lo} · 위 ${v.hi})`).join(' · ')}`);
  }
  const tags = Object.keys(out);
  for (const t of tags.slice(1)) {
    const a = out[tags[0]], b = out[t];
    console.log(`  ${tags[0]} ↔ ${t}: T747 줄 ${JSON.stringify(a.t747) === JSON.stringify(b.t747) ? '같음' : '다름'} · 지문 ${JSON.stringify(a.days) === JSON.stringify(b.days) ? '같음' : '다름'}(${a.days.length} · ${b.days.length}날)`);
  }
  fs.writeFileSync(path.join(DIR, 'summary.json'), JSON.stringify(out, null, 1));
})();
