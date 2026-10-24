#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-route-sig.js — T910 ②: 같은 세계면 같은 교역로 서명(`T910_SIG_PURE`) — 첫 재기동이 길 캐시를 버리지 않는다 ===================
//
// ★[T910] 교역로 캐시 서명(`_routeSig` → `routeWorldSig`)이 지형 절을 존 전체가 같이 쓰는 `hanbando-terrain.json` 객체에서 셌다. 그 객체에
//   `terrain.js` 가 처음 물을 때 런타임 칸(`_segIdx` · 파일에 없던 `_bbox`)을 붙인다 ⇒ 새 세계 부팅(아직 안 물음)과 다시 뜬 부팅(복원이 먼저 물음)의
//   서명이 갈려 첫 재기동이 교역로를 통째로 버렸다(T896 회부 2 · 보고 T910 §1). 켬이면 같은 파일을 한 번 따로 읽은 사본으로 센다.
//   ① 글자 — 손잡이 '1' 만 켬 · 끔 갈래 = 종전 줄(`require('./hanbando-terrain.json')`) 그대로 · 켬은 파일을 읽은 사본(파일 칸을 빼지 않는다)
//   ② 순수 함수(`routeWorldSig` — 제품 함수) — 파일 사본의 서명은 지형을 물어 런타임 칸이 붙은 객체의 서명과 갈린다(끔이 실제로 흔들린다 · 자명 통과 금지)
//      · 파일 사본 서명은 지형을 물기 전 · 뒤 같다 · 미끼: 강 한 점을 옮긴 사본은 서명이 다르다(정말 달라진 지형은 버린다)
//   ③ 판 — 실서버 아이 존(빠른 시계)으로 새 세계를 끔 · 켬 나란히 저장날 8 까지 돌려 SIGTERM 저장 → 같은 DB 로 같은 팔 다시 띄움:
//      끔 = "세계 서명이 달라 N행 폐기"(자명 통과 금지 — 첫 재기동이 실제로 버린다) · 켬 = "교역로 캐시 복원: N쌍" · N = 저장된 행 수 전부
//   ④ 미끼 판 — 켬 저장 DB 를 **강 한 점을 옮긴 지형 파일**의 서버 사본(server/ 복사 · sim · public · node_modules 는 원본을 가리킨다)으로 띄우면 버린다
// 실행: node scripts/test-route-sig.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T910 ② 같은 세계면 같은 교역로 서명 ===');
console.log('\n① 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T910_SIG_PURE = process\.env\.T910_SIG_PURE !== '0';/.test(V), "손잡이 — 켬 기본 · `=0` 만 끔(PM 10-24d)");
ok(V.includes("  if (T910_SIG_PURE) terr = _t910PureTerrain();   // ★[T910] 켬 = 파일 그대로\n  else try { terr = require('./hanbando-terrain.json'); } catch (e) {}"), '끔 갈래 = 종전 줄(같이 쓰는 객체) 그대로 · 켬 = 파일 사본');
ok(/_t910Terr = JSON\.parse\(require\('fs'\)\.readFileSync\(require\.resolve\('\.\/hanbando-terrain\.json'\), 'utf8'\)\);/.test(V), '켬 사본 = 같은 파일을 그대로 읽는다(칸을 빼는 거르개 0)');

console.log('\n② 순수 함수(`routeWorldSig`)');
{
  const Vm = require(path.join(ROOT, 'server', 'villages.js'));
  const terrF = path.join(ROOT, 'server', 'hanbando-terrain.json');
  const pure = () => JSON.parse(fs.readFileSync(terrF, 'utf8'));
  const zc = require(path.join(ROOT, 'server', 'zone-config')).ZONES.hanbando;
  const shared = require(terrF);
  const s0 = Vm.routeWorldSig('hanbando', pure(), zc, null);
  const sh0 = Vm.routeWorldSig('hanbando', shared, zc, null);
  const T = require(path.join(ROOT, 'server', 'terrain.js'));
  for (let i = 0; i < 20000; i++) { const x = (i * 7919) % 70000, y = (i * 104729) % 130000; try { T.isWaterCellLocal('hanbando', x, y); T.isRockCellLocal('hanbando', x, y); } catch (e) {} }
  const sh1 = Vm.routeWorldSig('hanbando', shared, zc, null);
  const s1 = Vm.routeWorldSig('hanbando', pure(), zc, null);
  ok(sh0 !== sh1, '★자명 통과 금지 — 같이 쓰는 객체는 지형을 물은 뒤 서명이 바뀐다(런타임 칸 · 끔 갈래가 실제로 흔들린다)', `${sh0} → ${sh1}`);
  ok(s0 === s1, '★★파일 사본 서명은 지형을 물기 전 · 뒤 같다', s1);
  const bait = pure(); const r = bait.hanbando.rivers.find((x) => x && Array.isArray(x.path) && x.path.length > 2);
  const p0 = r.path[1]; if (Array.isArray(p0)) p0[0] += 32; else if (p0 && p0.pos) p0.pos[0] += 32;
  ok(Vm.routeWorldSig('hanbando', bait, zc, null) !== s0, '★미끼 — 강 한 점을 옮긴 사본은 서명이 다르다(정말 달라진 지형은 버린다)');
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't910-'));
const zoneEnv = (db, port, extra) => Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: db, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0' }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exitOf = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const base = 37000 + (process.pid % 400);
delete process.env.T910_SIG_PURE;
const rows = (db) => { try { const d = new DatabaseSync(db, { readOnly: true }); const n = d.prepare('select count(*) as n from trade_routes').get().n; d.close(); return n; } catch (e) { return -1; } };
async function save(tag, on, k) {   // 새 세계 → 저장 날 8 → SIGTERM(종료 저장)
  const db = path.join(TMP, tag + '.db');
  const z = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: zoneEnv(db, base + k, Object.assign({ VILLAGE_DAY_MS: '250' }, on ? {} : { T910_SIG_PURE: '0' })), stdio: 'ignore' });
  const zx = exitOf(z, 900000); const t0 = Date.now();
  while (Date.now() - t0 < 600000) { await sleep(5000); try { const d = new DatabaseSync(db, { readOnly: true }); const r = d.prepare('select max(day) as d from villages').get(); d.close(); if (r && r.d >= 8) break; } catch (e) {} }
  try { z.kill('SIGTERM'); } catch (e) {} await Promise.race([zx, sleep(30000)]); try { z.kill('SIGKILL'); } catch (e) {} await zx;
  return db;
}
async function again(db, on, k, root) {   // 같은 DB 로 다시 띄워 교역로 캐시 줄(복원 · 폐기)을 읽는다
  const my = db + '.' + k + '.db'; for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(db + s, my + s); } catch (e) {} }
  const log = my + '.log'; const fd = fs.openSync(log, 'w');
  const c = spawn(process.execPath, [path.join(root || ROOT, 'server', 'zone.js')], { cwd: root || ROOT, env: zoneEnv(my, base + 50 + k, on ? {} : { T910_SIG_PURE: '0' }), stdio: ['ignore', fd, fd] });
  const cx = exitOf(c, 600000); const t0 = Date.now(); let line = '';
  while (Date.now() - t0 < 300000) { await sleep(2000); const t = fs.readFileSync(log, 'utf8'); const m = t.match(/교역로 캐시[^\n]*/); if (m) { line = m[0]; break; } }
  try { c.kill('SIGKILL'); } catch (e) {} await cx;
  const mR = line.match(/복원: (\d+)쌍/), mD = line.match(/달라 (\d+)행 폐기/);
  return { line, restored: mR ? +mR[1] : 0, dropped: mD ? +mD[1] : 0 };
}

(async () => {
  console.log('\n③ 판 — 새 세계 저장 → 같은 팔로 다시 띄움(끔 · 켬 나란히)');
  const [D0, D1] = await Promise.all([save('off', false, 0), save('on', true, 1)]);
  const n0 = rows(D0), n1 = rows(D1);
  ok(n0 >= 50 && n1 >= 50, '[상황] 두 세계가 교역로를 DB 에 썼다', `끔 ${n0} · 켬 ${n1}행`);
  const [A, B] = await Promise.all([again(D0, false, 2), again(D1, true, 3)]);
  ok(A.dropped === n0 && A.restored === 0, '★자명 통과 금지 — 끔: 첫 재기동이 교역로를 통째로 버린다(종전)', A.line.slice(0, 80));
  ok(B.restored === n1 && B.dropped === 0, '★★켬: 첫 재기동이 교역로를 전부 물려받는다', B.line.slice(0, 80));

  console.log('\n④ 미끼 판 — 강 한 점을 옮긴 지형 파일');
  const R2 = path.join(TMP, 'root'); fs.mkdirSync(R2);
  fs.cpSync(path.join(ROOT, 'server'), path.join(R2, 'server'), { recursive: true });
  for (const d of ['sim', 'public', 'node_modules', 'scripts', 'package.json']) { try { fs.symlinkSync(path.join(ROOT, d), path.join(R2, d)); } catch (e) {} }
  { const f = path.join(R2, 'server', 'hanbando-terrain.json'); const J = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r = J.hanbando.rivers.find((x) => x && Array.isArray(x.path) && x.path.length > 2); const p0 = r.path[1]; if (Array.isArray(p0)) p0[0] += 32; else if (p0 && p0.pos) p0.pos[0] += 32;
    fs.writeFileSync(f, JSON.stringify(J)); }
  const C = await again(D1, true, 4, R2);
  ok(C.dropped === n1 && C.restored === 0, '★미끼 — 켬이어도 지형 파일이 바뀐 판은 교역로를 버린다', C.line.slice(0, 80));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})();
