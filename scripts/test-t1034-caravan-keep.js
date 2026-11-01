#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1034-caravan-keep.js — T1034: 캐러밴 몸 칸이 SIGKILL 을 넘는다(`T1034_CARAVAN_KEEP`) =================
//
// ★[T1034] econ 장부(`world.caravans`)는 메타 행(T728)에 실리고 다시 뜬 판은 T775 가 장부 자리에 몸을 세운다 — 길 위 가는 몸은 그것으로 이어진다.
//   잃던 것은 몸에만 사는 칸이다. 이 하네스는 그중 가장 흔한 창 — **도착한 캐러밴의 머묾**(`phase 'linger'` · `lingerUntil` 벽시계)을 잰다:
//   마감에서 도착한 몸은 1게임시간 머문 뒤 귀환을 연다. 머묾 중에 존이 SIGKILL 되면 끔 판은 T775 가 귀환 몸을 머묾 없이 바로 걷게 세운다.
//   ① 글자 — 손잡이 켬 기본(`=0` 만 끔) · 부팅 덮기는 T775 몸 세우기 바로 뒤 한 줄 · 표 자리 다섯(귀환 출발 둘 · 고립 · 지연 · 재경로 실패)
//   ② 판 — 실서버 아이 존(캐러밴 켬 · 마을 여섯):
//      ⓐ 저장: 짧은 하루로 캐러밴을 띄운 뒤, 다음 마감에 도착할 가는 캐러밴이 설 때 SIGTERM(종료 저장 = 마을 행 · 메타 행 같은 날)
//      ⓑ 같은 DB 사본으로 켬 · 끔 각각: 6분 하루(머묾 15초)로 띄워 그 마감을 넘기고, 그 캐러밴이 머묾에 들고 마감 끝 메타 행이 선 순간 SIGKILL → 같은 판으로 다시 띄워 T775 줄이 끝날 때까지
//      켬: 다시 뜬 몸이 머묾 · 같은 머묾 끝 시각 · 장부 일정 같음 · 두 번 도착 0(장부 상태 inbound 그대로 · 귀환 날 같음)
//      끔(자명 통과 금지 · 대조): 같은 판에서 몸이 머묾이 아니다(귀환으로 바로 섰다) · 메타 행에 몸 칸(`t1034`)이 없다
//   ★값: 몸 없는 판(서버 기준선 · 캐러밴 0)엔 칸이 안 선다 — 서버 기준선 바이트 같음으로 따로 본다(보고/T1034).
// 실행: node scripts/test-t1034-caravan-keep.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T1034 캐러밴 몸 칸 — SIGKILL 을 넘는 머묾 ===');
console.log('\n① 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
ok(/const T1034_KEEP = process\.env\.T1034_CARAVAN_KEEP !== '0';/.test(V), '손잡이 — 켬 기본 · `=0` 만 끔');
ok(V.includes("    if (r === true && T1034_KEEP && state._t1034Saved) _t1034Apply(bodies.get(c.id), now);"), '부팅 덮기 = T775 몸 세우기 바로 뒤 한 줄');
ok(['ret', 'iso', 'rf', 'push'].every((w) => V.includes(`_t1034Mark('${w}')`)) && (V.match(/_t1034Mark\('ret'\)/g) || []).length === 2, '표 자리 다섯 — 귀환 출발 둘(장부 켬 · 끔 갈래) · 고립 · 재경로 실패 · 지연');
ok(/\.\.\.\(T1034_KEEP \? \(\(\) => \{ const P = _t1034Pack\(\); return P \? \{ t1034: P \} : \{\}; \}\)\(\) : \{\}\)/.test(V), '메타 행 칸 — 몸이 없으면 칸이 안 선다 · 끔 = 칸 없음');
ok((Z.match(/SimVillages\.t1034Flush\(\)/g) || []).length === 2, '틱 꼬리 두 자리(잠든 틱 · 도는 틱) — T1005 줄 옆');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1034-'));
const zoneEnv = (db, port, extra) => Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: db, ENABLE_VILLAGES: '1', VILLAGE_MAX: '6',
  CENTRAL_URL: 'http://localhost:1', CENTRAL_SECRET: 't1034', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0', ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0' }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exitOf = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const perf = (port) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: '/perf', headers: { 'x-zone-secret': 't1034' }, timeout: 15000 }, (r) => {
  let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); }); q.on('error', () => res(null)); q.on('timeout', () => { q.destroy(); res(null); }); });
const car = async (port) => { const p = await perf(port); return p && p.econTick && p.econTick.t1034car ? p.econTick.t1034car : null; };
const base = 39000 + (process.pid % 400);
delete process.env.T1034_CARAVAN_KEEP;
const up = (db, port, extra) => { const c = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: zoneEnv(db, port, extra), stdio: 'ignore' }); return { c, x: exitOf(c, 1500000) }; };
const until = async (fn, ms, every) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(every || 1000); } return null; };
const metaOf = (db) => { try { const d = new DatabaseSync(db, { readOnly: true }); const m = d.prepare('select data, day from world_meta').get(); d.close(); return m ? Object.assign(JSON.parse(m.data), { _day: m.day }) : null; } catch (e) { return null; } };

(async () => {
  console.log('\n② 판 — 저장 → 켬 · 끔 각각 머묾 중 SIGKILL(6분 하루)');
  const S = path.join(TMP, 'save.db');
  //   ⓐ-1 짧은 하루(2초)로 캐러밴을 띄운다 → SIGTERM
  { const z = up(S, base, { VILLAGE_DAY_MS: '2000' });
    const got = await until(async () => { const C = await car(base); return C && C.cars.filter((c) => c.st === 'outbound').length >= 2 ? C : null; }, 600000, 2000);
    ok(!!got, '[상황] 짧은 하루로 길 위 캐러밴이 섰다', got ? `${got.cars.length}대 · 날 ${got.day}` : '없음');
    try { z.c.kill('SIGTERM'); } catch (e) {} await Promise.race([z.x, sleep(30000)]); try { z.c.kill('SIGKILL'); } catch (e) {} await z.x; }
  //   ⓐ-2 20초 하루로 다시 — 다음 마감에 도착할 가는 캐러밴이 설 때 SIGTERM(그 날로 저장)
  let pick = null;
  { const z = up(S, base + 1, { VILLAGE_DAY_MS: '20000' });
    pick = await until(async () => { const C = await car(base + 1); if (!C || !C.t775 || !C.t775.done) return null; const c = C.cars.find((x) => x.st === 'outbound' && x.body && x.arr === C.day + 1); return c ? { id: c.id, day: C.day } : null; }, 900000, 500);
    try { z.c.kill('SIGTERM'); } catch (e) {} await Promise.race([z.x, sleep(30000)]); try { z.c.kill('SIGKILL'); } catch (e) {} await z.x; }
  const M0 = metaOf(S);
  ok(!!pick && M0 && M0._day === pick.day, '[상황] 저장된 세계 — 다음 마감에 도착할 캐러밴 하나 · 메타 행이 그 날', pick ? `#${pick.id} · 날 ${pick.day} · 메타 날 ${M0 && M0._day}` : '없음');
  if (!pick) { console.log(`\n=== T1034: 통과 ${pass} · 실패 ${fail} ===`); process.exit(1); }
  //   ⓑ 켬 · 끔 — 같은 사본 · 2분 하루 · 마감 → 머묾 → SIGKILL → 다시
  const run = async (tag, off, k) => {
    const db = path.join(TMP, tag + '.db'); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(S + s, db + s); } catch (e) {} }
    const port = base + 10 + k * 2, env = Object.assign({ VILLAGE_DAY_MS: '360000' }, off ? { T1034_CARAVAN_KEEP: '0' } : {});
    let z = up(db, port, env);
    //   머묾에 들었고 · 그 마감 끝 저장(메타 행 = 새 날)이 섰을 때 죽인다(같은 날 메타만 되살린다 — T728 규약)
    const K = await until(async () => { const C = await car(port); const c = C && C.cars.find((x) => x.id === pick.id); if (!(c && c.st === 'inbound' && c.body && c.body.phase === 'linger')) return null;
      const m = metaOf(db); return m && m._day === C.day ? { C, c } : null; }, 600000, 250);
    try { z.c.kill('SIGKILL'); } catch (e) {} await z.x;
    const M = metaOf(db);
    if (!K) return { tag, K: null, A: null, M };
    z = up(db, port + 1, env);
    const A = await until(async () => { const C = await car(port + 1); if (!C || !C.t775 || !C.t775.done) return null; return { C, c: C.cars.find((x) => x.id === pick.id) || null }; }, 300000, 500);
    try { z.c.kill('SIGKILL'); } catch (e) {} await z.x;
    return { tag, K, A, M };
  };
  const on = await run('on', false, 0), off = await run('off', true, 1);
  for (const R of [on, off]) ok(!!(R.K && R.A && R.A.c), `[상황] ${R.tag} — 그 캐러밴이 마감에 도착해 머묾에 들었고 · 다시 뜬 판이 몸을 세웠다`, R.K ? `머묾 끝까지 ${Math.round((R.K.c.body.linger - R.K.C.at) / 1000)}초` : '머묾 못 봄');
  const ka = on.K && on.A && on.A.c ? { k: on.K.c, a: on.A.c } : null;
  ok(!!ka && ka.a.body && ka.a.body.phase === 'linger', '★★켬 — 다시 뜬 몸이 **머묾**이다(귀환으로 안 뛰었다)', ka && ka.a.body ? ka.a.body.phase : '—');
  ok(!!ka && ka.a.body && ka.a.body.linger === ka.k.body.linger, '★켬 — 머묾 끝 시각이 같다(벽시계 · 같은 순간에 귀환을 연다)', ka && ka.a.body ? `${ka.k.body.linger} → ${ka.a.body.linger}` : '—');
  ok(!!ka && ka.a.st === 'inbound' && ka.a.ret === ka.k.ret && ka.a.arr === ka.k.arr, '★켬 — 장부 일정 같음 · 두 번 도착 0(상태 inbound 그대로 · 귀환 날 같음)', ka ? `${ka.k.st}/${ka.k.ret} → ${ka.a.st}/${ka.a.ret}` : '—');
  ok(!!(on.M && on.M.t1034 && on.M.t1034.b && on.M.t1034.b[String(pick.id)]), '★켬 — 죽은 순간 메타 행에 그 몸 칸이 있다(마감 끝 저장 · 같은 날)', on.M && on.M.t1034 ? `몸 ${Object.keys(on.M.t1034.b).length}` : '칸 없음');
  const kb = off.K && off.A && off.A.c ? off.A.c : null;
  ok(!!kb && kb.body && kb.body.phase !== 'linger', '★★[자명 통과 금지] 끔 — 같은 판에서 다시 뜬 몸은 머묾이 아니다(종전 — 귀환으로 바로 섰다)', kb && kb.body ? kb.body.phase : '—');
  ok(!!off.M && !off.M.t1034, '★끔 — 메타 행에 몸 칸이 없다(종전 줄)', off.M ? Object.keys(off.M).join(',') : '메타 없음');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== T1034: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
