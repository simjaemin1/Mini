#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1034-caravan-keep.js — T1034: 캐러밴 몸 칸이 SIGKILL 을 넘는다(`T1034_CARAVAN_KEEP`) =================
//
// ★[T1034] econ 장부(`world.caravans`)는 메타 행(T728)에 실리고 다시 뜬 판은 T775 가 장부 자리에 몸을 세운다 — 길 위 가는 몸은 그것으로 이어진다.
//   잃던 것은 ⓐ 하루 중에 바뀐 econ 장부(메타 행은 마감 끝에만 쓰였다)와 ⓑ 몸에만 사는 칸(돌아서는 길 · 머묾 끝 · 귀환 보간 · 지연 · 재경로 셈)이다.
//   ① 글자 — 손잡이 켬 기본(`=0` 만 끔) · 부팅 덮기는 T775 몸 세우기 바로 뒤 한 줄 · 표 자리 다섯 · 틱 끝 저장은 저장 큐가 빈 뒤만 · 시계가 같을 때만 쥔다
//   ② 죽음 판(하루 중) — 고립 귀환(시험 훅 `VILLAGE_CARAVAN_BLOCKTEST=2` · 장부를 돌아서는 구간에 다시 건다 = 운영 `_t661Day` 고립과 같은 꼴)이 선 뒤 SIGKILL:
//      켬: 다시 뜬 장부가 귀환 그대로(상태 · 귀환 날 · 버림 표) · 몸이 같은 길(돌아서는 구간 길이) · 같은 자리(장부 속도 몫 + 64px 안)
//      끔(자명 통과 금지 · 대조): 같은 판에서 장부가 가는 길로 되돌아간다(종전 — 메타 행이 아침 것)
//   ③ 마감 낀 판 — 다음 마감에 도착할 캐러밴이 마감에서 머묾에 들고 마감 끝 메타 행이 선 순간 SIGKILL:
//      켬 · 끔 둘 다: 두 번 도착 0 · 짐 두 번 0(장부 상태 inbound 그대로 · 귀환 날 · 짐 같음) — 켬: 다시 뜬 몸이 머묾 · 같은 머묾 끝 시각 · 메타 행에 몸 칸 · 끔: 몸 칸 없음
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

console.log('\n=== T1034 캐러밴 장부 · 몸 칸 — SIGKILL 을 넘는다 ===');
console.log('\n① 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
ok(/const T1034_KEEP = process\.env\.T1034_CARAVAN_KEEP !== '0';/.test(V), '손잡이 — 켬 기본 · `=0` 만 끔');
ok(V.includes("    if (r === true && T1034_KEEP && state._t1034Saved) _t1034Apply(bodies.get(c.id), now);"), '부팅 덮기 = T775 몸 세우기 바로 뒤 한 줄');
ok(['ret', 'iso', 'rf', 'push'].every((w) => V.includes(`_t1034Mark('${w}')`)) && (V.match(/_t1034Mark\('ret'\)/g) || []).length === 2, '표 자리 다섯 — 귀환 출발 둘(장부 켬 · 끔 갈래) · 고립 · 재경로 실패 · 지연');
ok(/\.\.\.\(T1034_KEEP \? \(\(\) => \{ const P = _t1034Pack\(\); return P \? \{ t1034: P \} : \{\}; \}\)\(\) : \{\}\)/.test(V), '메타 행 칸 — 몸이 없으면 칸이 안 선다 · 끔 = 칸 없음');
ok((Z.match(/SimVillages\.t1034Flush\(\)/g) || []).length === 2, '틱 꼬리 두 자리(잠든 틱 · 도는 틱) — T1005 줄 옆');
ok(V.includes("if (state.saveQueue && state.saveQueue.length) { _t1034Stat.waitQ++; return 0; }") && V.includes("if (state._t731) { _t1034Stat.waitW++; return 0; }"), '틱 끝 저장 = 마을 행이 다 적힌 뒤만(저장 큐 · 현지 자정 창 — 메타 날 ≠ 마을 행 날 금지 · T728 같은 날 규약)');
ok(V.includes("if (M.anchor && M.anchor.dayMs === state.dayMs && M.anchor.epoch === state.epoch) { state._t1034Saved"), '몸 칸 쥐기 = 시계(하루 길이 · epoch)가 같을 때만(벽시계 값의 뜻이 같다)');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1034-'));
const zoneEnv = (db, port, extra) => Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: db, ENABLE_VILLAGES: '1', VILLAGE_MAX: '6',
  CENTRAL_URL: 'http://localhost:1', CENTRAL_SECRET: 't1034', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0', ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0' }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exitOf = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const perf = (port) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: '/perf', headers: { 'x-zone-secret': 't1034' }, timeout: 15000 }, (r) => {
  let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); }); q.on('error', () => res(null)); q.on('timeout', () => { q.destroy(); res(null); }); });
const car = async (port) => { const t = Date.now(); const p = await perf(port); return p && p.econTick && p.econTick.t1034car ? Object.assign(p.econTick.t1034car, { at: t }) : null; };   // at = 물은 벽시계(옮김 몫)
const base = 39000 + (process.pid % 400);
delete process.env.T1034_CARAVAN_KEEP;
const up = (db, port, extra) => { const c = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: zoneEnv(db, port, extra), stdio: 'ignore' }); return { c, x: exitOf(c, 1500000) }; };
const until = async (fn, ms, every) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(every || 1000); } return null; };
const metaOf = (db) => { try { const d = new DatabaseSync(db, { readOnly: true }); const m = d.prepare('select data, day from world_meta').get(); d.close(); return m ? Object.assign(JSON.parse(m.data), { _day: m.day }) : null; } catch (e) { return null; } };

(async () => {
  const S = path.join(TMP, 'save.db');
  //   저장 — 짧은 하루(2초)로 캐러밴을 띄운다 → SIGTERM(종료 저장)
  { const z = up(S, base, { VILLAGE_DAY_MS: '2000' });
    const got = await until(async () => { const C = await car(base); return C && C.cars.filter((c) => c.st === 'outbound').length >= 2 ? C : null; }, 600000, 2000);
    ok(!!got, '[상황] 짧은 하루로 길 위 캐러밴이 섰다', got ? `${got.cars.length}대 · 날 ${got.day}` : '없음');
    try { z.c.kill('SIGTERM'); } catch (e) {} await Promise.race([z.x, sleep(30000)]); try { z.c.kill('SIGKILL'); } catch (e) {} await z.x; }
  //   고르기 — 재는 하루(6분)로 훅 없이 띄워 T775 줄 · 현지 자정 창(시계가 바뀐 따라잡기 마감)이 닫힐 때까지 → SIGTERM(그 시계로 저장)
  //     안 하면 고립이 부팅 따라잡기 창 안에서 선다(창 안 = 마감 몫 · T728 이 창 끝에 쓴다 — 하루 중 문이 아니다).
  const S6 = path.join(TMP, 'save6.db');
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(S + s, S6 + s); } catch (e) {} }
  { const z = up(S6, base + 2, { VILLAGE_DAY_MS: '360000' });
    //   + 가는 몸 하나가 길 30% 를 넘었고(다시 뜬 첫 틱에 고립 훅이 걸린다 — 훅 = 가는 길 25% 넘은 첫 몸) 하루 앞쪽(다음 창까지 멀다 · 창은 동쪽 끝 자정 = 하루 0.73 쯤부터)
    const g = await until(async () => { const C = await car(base + 2); return C && C.t775 && C.t775.done && !C.w731 && C.frac != null && C.frac < 0.5
      && C.cars.some((x) => x.st === 'outbound' && x.body && x.body.phase === 'outbound' && x.body.len > 0 && x.body.prog / x.body.len > 0.3 && x.body.prog / x.body.len < 0.9) ? C : null; }, 900000, 1000);
    ok(!!g, '[상황] 고르기 — 재는 하루로 몸을 다 세웠고 · 창이 닫혔고 · 하루 앞쪽 · 길 30% 넘은 가는 몸', g ? `날 ${g.day} · 하루 ${g.frac}` : '못 맞춤');
    await sleep(2000); try { z.c.kill('SIGTERM'); } catch (e) {} await Promise.race([z.x, sleep(30000)]); try { z.c.kill('SIGKILL'); } catch (e) {} await z.x; }
  const copy = (tag, src) => { const from = src || S; const db = path.join(TMP, tag + '.db'); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(from + s, db + s); } catch (e) {} } return db; };

  console.log('\n② 죽음 판 — 하루 중 고립 귀환 뒤 SIGKILL(켬 · 끔 같은 사본)');
  const iso = async (tag, off, k) => {
    const db = copy('iso-' + tag, S6), port = base + 20 + k * 2, env = Object.assign({ VILLAGE_DAY_MS: '360000' }, off ? { T1034_CARAVAN_KEEP: '0' } : {});
    let z = up(db, port, Object.assign({ VILLAGE_CARAVAN_BLOCKTEST: '2' }, env));
    const K = await until(async () => { const C = await car(port); const c = C && C.t775 && C.t775.done && C.cars.find((x) => x.st === 'inbound' && x.ab && x.body); return c ? { C, c } : null; }, 300000, 250);
    //   켬 = 틱 끝 메타 행이 그 귀환을 실을 때까지 · 끔 = 같은 벽시계만큼(5초 — 끔은 마감 전엔 메타 행을 안 쓴다)
    if (K) await until(async () => { const m = metaOf(db); const r = m && (m.caravans || []).find((x) => x.id === K.c.id); return off ? null : (r && r.state === 'inbound' ? 1 : null); }, 5000, 200);
    const K2 = K ? await car(port) : null;
    try { z.c.kill('SIGKILL'); } catch (e) {} await z.x;
    if (!K || !K2) return { tag, K: null };
    const k2 = K2.cars.find((x) => x.id === K.c.id);
    z = up(db, port + 1, env);
    const A = await until(async () => { const C = await car(port + 1); if (!C || !C.t775 || !C.t775.done) return null; return { C, c: C.cars.find((x) => x.id === K.c.id) || null }; }, 300000, 500);
    try { z.c.kill('SIGKILL'); } catch (e) {} await z.x;
    return { tag, K: { C: K2, c: k2, win: !!(K.C.w731 || K2.w731) }, A };   // win = 고립 순간 또는 죽기 직전에 창이 열려 있었다
  };
  //   고립이 다음 마감의 현지 자정 창 안에 서면(6분 하루 · 창 약 25초) 그 판은 하루 중 창이 아니다(창 끝 T728 이 쓴다) — 같은 사본으로 다시(3번까지 · 시도 수를 적는다)
  const iso3 = async (tag, off, k) => { let R = null, n = 0; for (n = 1; n <= 3; n++) { R = await iso(tag, off, k); if (!(R.K && R.K.win)) break; console.log(`  · ${tag} — ${n}번째 판 고립이 창 안(다시)`); } R.tries = n; return R; };
  const ion = await iso3('on', false, 0), ioff = await iso3('off', true, 1);
  for (const R of [ion, ioff]) ok(!!(R.K && R.K.C) && !R.K.win, `[상황] ${R.tag} — 고립이 하루 중(현지 자정 창 밖)에 섰고 죽을 때까지 창이 안 열렸다`, R.K && R.K.C ? `창 ${R.K.win} · ${R.tries}번째 판` : '—');
  for (const R of [ion, ioff]) ok(!!(R.K && R.K.c && R.A && R.A.c), `[상황] ${R.tag} — 하루 중 고립 귀환이 섰고 · 다시 뜬 판이 그 캐러밴을 세웠다`, R.K && R.K.c ? `#${R.K.c.id} 귀환 날 ${R.K.c.ret} · 날 ${R.K.C.day}` : '고립 못 봄');
  { const k = ion.K && ion.K.c, a = ion.A && ion.A.c;
    ok(!!(k && a) && a.st === 'inbound' && a.ab === true && a.ret === k.ret && a.arr === k.arr, '★★켬 — 다시 뜬 장부가 귀환 그대로(상태 · 귀환 날 · 버림 표)', k && a ? `${k.st}/${k.ret} → ${a.st}/${a.ret}` : '—');
    const kL = k && k.body && k.body.T, aL = a && a.body && a.body.T;
    ok(!!(kL && aL) && Math.abs(kL.len - aL.len) < 1 && aL.leg === 'inbound', '★켬 — 몸이 같은 길(돌아서는 구간 · 길이 1px 안)', kL && aL ? `${kL.len.toFixed(1)} → ${aL.len.toFixed(1)}` : '—');
    const mv = (k && a && k.body && a.body && k.body.x != null && a.body.x != null) ? Math.hypot(a.body.x - k.body.x, a.body.y - k.body.y) : null;
    const gap = ion.A && ion.A.C && ion.K.C ? (ion.A.C.at - ion.K.C.at) : null, want = kL && gap != null ? kL.ppd / 360000 * gap : null;
    ok(mv != null && want != null && mv <= want + 64, '★켬 — 같은 자리(장부 속도로 그 사이 갈 몫 + 64px 안)', mv != null ? `옮김 ${mv.toFixed(1)}px · 몫 ${want != null ? want.toFixed(1) : '—'}px` : '—'); }
  { const k = ioff.K && ioff.K.c, a = ioff.A && ioff.A.c;
    ok(!!(k && a) && a.st === 'outbound' && a.ret !== k.ret, '★★[자명 통과 금지] 끔 — 같은 판에서 장부가 가는 길로 되돌아간다(종전 · 메타 행이 아침 것)', k && a ? `${k.st}/${k.ret} → ${a.st}/${a.ret}` : '—'); }

  console.log('\n③ 마감 낀 판 — 마감에서 머묾에 든 뒤 SIGKILL(켬 · 끔 같은 사본)');
  //   20초 하루로 다시 — 다음 마감에 도착할 가는 캐러밴이 설 때 SIGTERM(그 날로 저장)
  let pick = null;
  { const z = up(S, base + 1, { VILLAGE_DAY_MS: '20000' });
    pick = await until(async () => { const C = await car(base + 1); if (!C || !C.t775 || !C.t775.done) return null; const c = C.cars.find((x) => x.st === 'outbound' && x.body && x.arr === C.day + 1); return c ? { id: c.id, day: C.day } : null; }, 900000, 500);
    try { z.c.kill('SIGTERM'); } catch (e) {} await Promise.race([z.x, sleep(30000)]); try { z.c.kill('SIGKILL'); } catch (e) {} await z.x; }
  const M0 = metaOf(S);
  ok(!!pick && M0 && M0._day === pick.day, '[상황] 저장된 세계 — 다음 마감에 도착할 캐러밴 하나 · 메타 행이 그 날', pick ? `#${pick.id} · 날 ${pick.day} · 메타 날 ${M0 && M0._day}` : '없음');
  if (!pick) { console.log(`\n=== T1034: 통과 ${pass} · 실패 ${fail} ===`); process.exit(1); }
  const run = async (tag, off, k) => {
    const db = copy('close-' + tag), port = base + 10 + k * 2, env = Object.assign({ VILLAGE_DAY_MS: '180000' }, off ? { T1034_CARAVAN_KEEP: '0' } : {});
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
  for (const R of [on, off]) {
    ok(!!(R.K && R.A && R.A.c), `[상황] ${R.tag} — 그 캐러밴이 마감에 도착해 머묾에 들었고 · 다시 뜬 판이 몸을 세웠다`, R.K ? `머묾 끝까지 ${Math.round((R.K.c.body.linger - R.K.C.at) / 1000)}초` : '머묾 못 봄');
    const k = R.K && R.K.c, a = R.A && R.A.c;
    ok(!!(k && a) && a.st === 'inbound' && a.ret === k.ret && a.arr === k.arr && a.amt === k.amt && a.done === k.done, `★${R.tag} — 두 번 도착 0 · 짐 두 번 0(상태 inbound 그대로 · 귀환 날 · 짐 같음)`, k && a ? `${k.st}/${k.ret}/${k.amt} → ${a.st}/${a.ret}/${a.amt}` : '—');
  }
  const ka = on.K && on.A && on.A.c ? { k: on.K.c, a: on.A.c } : null;
  ok(!!ka && ka.a.body && ka.a.body.phase === 'linger', '★켬 — 다시 뜬 몸이 머묾이다', ka && ka.a.body ? ka.a.body.phase : '—');
  ok(!!ka && ka.a.body && ka.a.body.linger === ka.k.body.linger, '★켬 — 머묾 끝 시각이 같다(벽시계 · 같은 순간에 귀환을 연다)', ka && ka.a.body ? `${ka.k.body.linger} → ${ka.a.body.linger}` : '—');
  ok(!!(on.M && on.M.t1034 && on.M.t1034.b && on.M.t1034.b[String(pick.id)]), '★켬 — 죽은 순간 메타 행에 그 몸 칸이 있다(마감 끝 저장 · 같은 날)', on.M && on.M.t1034 ? `몸 ${Object.keys(on.M.t1034.b).length}` : '칸 없음');
  ok(!!off.M && !off.M.t1034, '★끔 — 메타 행에 몸 칸이 없다(종전 줄)', off.M ? Object.keys(off.M).join(',') : '메타 없음');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== T1034: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
