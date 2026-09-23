#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-terr-persist.js — 영토가 재부팅을 넘기나 (T278) =====================
//
// ★왜 [재민 확정 2026-09-13 · T278]
//   T267 이 실서버 200일 · 50마을 · 세 짝에서 잡은 것: `_terrGrow` 에 DB 쓰기가 **한 줄도 없어서**
//   `village_buildings` 의 `terr` 행이 끔·켬 **둘 다 172,500** 이었다. 살아 있는 세계는 영토 중앙이
//   5,100까지 자라는데 **다시 세우면 3,450** 으로 되돌아가고, 집 행은 남으니까
//   **제 영토 밖에 서는 집**이 생긴다(끔 0채 · 영토만 49.3 · 둘 다 101.3채 · 세 짝 평균).
//
// ★이 하네스가 지키는 것 — **자란 땅은 두 번째 부팅에도 거기 있다.**
//   ① 한 판 돌려 영토가 실제로 자란다(전제 — 안 자라면 아래가 자명 통과다)
//   ② 같은 DB 를 **다시 열어** 영토가 그대로다(줄지 않는다)
//   ③ 그 세계에서 **제 영토 밖에 서는 집이 0채**다
//   ④ [자명 통과 금지] 영속 블록을 되돌린 판에서는 ②③이 **빨개진다**(카드 §0ⓑ 에 그 실행 결과를 적었다 —
//      손잡이를 새로 만들지 않았으므로 이 하네스가 아니라 **소스를 되돌려** 확인한다).
//
// ⚠하네스는 영토 규칙·거부 규칙을 다시 적지 않는다. 자란 값은 세계에게 묻고(`/lifedbg` terr),
//   남은 값은 DB 에게 묻는다(`village_buildings`). 둘을 비교하는 것이 전부다.
//
// 실행: node scripts/test-terr-persist.js
//       TP_DAYS=40 node scripts/test-terr-persist.js        (짧게)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const CPORT = parseInt(process.env.TP_CPORT || '', 10) || (3960 + (process.pid % 20));
const ZPORT = CPORT + 1;
const DAYS = parseInt(process.env.TP_DAYS || '', 10) || 40;
const DAY_MS = parseInt(process.env.TP_DAY_MS || '', 10) || 2500;
const CDB = `/tmp/tp-${process.pid}-c.db`, ZDB = `/tmp/tp-${process.pid}-z.db`;

let fail = 0;
const chk = (c, m, extra) => { c || fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', () => { killAll(); for (const f of [CDB, ZDB]) for (const sfx of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + sfx); } catch (e) {} } });
async function jget(u, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(30000) })).json(); }
    catch (e) { last = e; await sleep(600); }
  }
  throw last;
}
async function waitHttp(u, n = 900) { for (let i = 0; i < n; i++) { try { const r = await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }

// ── DB 에 남은 것을 묻는다(정본 테이블 그대로) ────────────────────────────────
function fromDb() {
  const Database = require('better-sqlite3');
  const db = new Database(ZDB, { readonly: true, fileMustExist: true });
  const terr = new Map(), house = [];
  for (const r of db.prepare("SELECT village_id, type, cx, cy FROM village_buildings WHERE type IN ('terr','house')").all()) {
    if (r.type === 'terr') { let s = terr.get(r.village_id); if (!s) terr.set(r.village_id, s = new Set()); s.add(r.cx + ',' + r.cy); }
    else house.push(r);
  }
  const names = new Map();
  for (const r of db.prepare('SELECT id, name FROM villages').all()) names.set(r.id, r.name);
  db.close();
  let outside = 0;
  for (const h of house) if (!(terr.get(h.village_id) || new Set()).has(h.cx + ',' + h.cy)) outside++;
  return { terr, house: house.length, outside, names, rows: [...terr.values()].reduce((a, s) => a + s.size, 0) };
}
const liveTerr = (life) => { const m = new Map(); for (const v of (life.villages || [])) m.set(v.name, v.terr); return m; };

async function run(label, extraEnv, fresh) {
  if (fresh) for (const f of [CDB, ZDB]) for (const sfx of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + sfx); } catch (e) {} }
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답은 증인이 아니다 — 앞 판 central 이 포트를 쥔 채면 새 central 은 `EADDRINUSE` 로 즉시
  //   죽는데 그 폴링은 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다(T344 가 두 번 재현).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다 — `await` 만 아래로 내린다(표식은 ~120ms 뒤에 찍힌다).
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _up = await _upP;
  if (!_up.ok) { console.log(`  ★${_up.why}`); killAll(); return null; }
  const _zone = boot('zone.js', Object.assign({
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_PORT: String(CPORT), CENTRAL_HOST: 'localhost',
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
  }, extraEnv || {}));
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!await (await _zp).ok) { killAll(); return null; }
  let days = 0;
  for (let i = 0; i < 2000; i++) {
    await sleep(3000);
    const p = await jget(`http://localhost:${ZPORT}/perf`);
    days = ((p.econTick && p.econTick.days) | 0);
    if (days >= DAYS) break;
  }
  const life = await jget(`http://localhost:${ZPORT}/lifedbg`);
  await sleep(5000);            // 저장 큐(1마을/틱)가 비게 — 세계가 말할 때까지
  killAll(); await sleep(2500);
  return { label, days, live: liveTerr(life) };
}

(async () => {
  console.log('\n=== 영토가 재부팅을 넘기나 (T278) ===');
  console.log(`  판: 게임일 ${DAY_MS}ms × ${DAYS}일 · 1차(새 DB) → 2차(같은 DB 다시 열기)\n`);

  // ── ⓞ ★★[T298] 이 하네스는 이제 **손잡이를 제 손으로 켜지 않는다.**
  //   T278 판은 `T230_TERR_HOUSING: '1'` 을 스스로 넣고 돌았다. 그러면 기본이 다시 **끔**으로 뒤집혀도
  //   이 하네스는 초록이고, 정작 제품이 도는 세계(기본값 세계)는 안 재는 셈이 된다.
  //   그래서 ⓞ 가 **기본값을 실측문에 물어** 켬임을 먼저 못 박고, 아래 판은 **아무것도 안 주고** 돈다
  //   (= 제품이 도는 그 세계). 끄는 판은 명시 `=0` 하나뿐임도 같은 문으로 본다 — 극성 정규식 0 · 상수 베끼기 0.
  {
    const { execFileSync } = require('child_process');
    const door = `console.log(JSON.stringify(require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))}).__probe.handles()));`;
    const ask = (over) => {
      const env = Object.assign({}, process.env);
      for (const k of ['T230_TERR_HOUSING', 'T219_HOUSE_TRIGGER']) delete env[k];
      Object.assign(env, over || {});
      return JSON.parse(String(execFileSync(process.execPath, ['-e', door], { env, encoding: 'utf8' })).trim());
    };
    let dflt = null, offArm = null, e0 = null;
    try { dflt = ask(null); offArm = ask({ T230_TERR_HOUSING: '0' }); } catch (e) { e0 = e; }
    chk(!!dflt, 'ⓞ 실측문 `__probe.handles()` 가 산다', e0 ? String(e0.message).split('\n')[0] : '');
    if (dflt) chk(dflt.T230_TERR_HOUSING === true,
      'ⓞ 서버 **기본이 켬**이다 — 그래서 아래 판은 손잡이를 안 주고 돈다(제품이 도는 그 세계를 잰다)',
      `기본 ${dflt.T230_TERR_HOUSING}`);
    if (offArm) chk(offArm.T230_TERR_HOUSING === false,
      'ⓞ 끄는 문은 명시 `T230_TERR_HOUSING=0` 하나 — [자명 통과 금지] 그 판에 위 주장을 대면 거짓이다',
      `=0 판 ${offArm.T230_TERR_HOUSING}`);
  }

  // ① 한 판 — 영토가 자라는 세계를 만든다(손잡이 **미설정 = 켬**: 자라는 마을이 많아 ②③이 자명 통과가 아니다)
  const A = await run('1차', {}, true);
  if (!A) { console.log('  ✗ 부팅/수확 실패'); process.exit(1); }
  const d1 = fromDb();
  const grown = [...A.live.entries()].filter(([, t]) => t > 3450);
  chk(grown.length > 0, `① (전제) 영토가 **실제로 자란 마을이 있다** — ${grown.length}곳`,
    grown.length ? `최대 ${Math.max(...grown.map((g) => g[1]))}셀` : '(없으면 아래가 자명 통과다)');
  chk(A.days >= DAYS, `① 판이 ${DAYS}일을 돌았다`, `${A.days}일`);

  // ② 다시 연다 — 같은 DB, 새 프로세스
  const B = await run('2차', {}, false);
  if (!B) { console.log('  ✗ 2차 부팅 실패'); process.exit(1); }
  let shrunk = 0, worst = null;
  for (const [n, t1] of A.live) {
    const t2 = B.live.get(n);
    if (t2 === undefined) continue;
    if (t2 < t1) { shrunk++; if (!worst || (t1 - t2) > (worst[1] - worst[2])) worst = [n, t1, t2]; }
  }
  chk(shrunk === 0, '② ★★**다시 열어도 영토가 안 줄어든다**',
    shrunk ? `줄어든 마을 ${shrunk}곳 · 최악 ${worst[0]} ${worst[1]} → ${worst[2]}셀` : `${A.live.size}마을 전부 유지`);

  // ③ 그 세계에서 집이 제 영토 밖에 서지 않는다
  const d2 = fromDb();
  chk(d2.outside === 0, '③ ★제 영토 밖에 서는 집이 **0채**',
    `${d2.outside}/${d2.house}채 · terr 행 ${d1.rows} → ${d2.rows}`);
  chk(d2.rows >= d1.rows, '③ⓑ terr 행이 줄지 않았다', `${d1.rows} → ${d2.rows}`);

  console.log(`\n=== ${fail === 0 ? 'PASS' : `FAIL (${fail}건)`} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });
