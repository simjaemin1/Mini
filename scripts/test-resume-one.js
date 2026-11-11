#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-resume-one.js — T896 ②: 다시 뜬 판 캐러밴 몸 되살림이 교역로 슬롯을 서로 버리지 않는다(`T896_RESUME_ONE`) =================
//
// ★[T896 ②] 교역로 재개형 A* 는 슬롯이 하나다(`_routeResume` — 다른 쌍이 부르면 떠 있는 일을 버린다). 다시 뜬 판의 캐러밴 몸 되살림(`_t775Resume`)은
//   'wait' 다음 캐러밴도 같은 틱에 불러, 길 캐시가 빈 쌍이 둘 이상 줄에 서면 서로의 일을 번갈아 버렸다 — 어느 길도 다 안 파이고 틱마다 공유 예산을 다 써서
//   사람 결정 문이 틱마다 잘렸다(60날 세계 · 다시 띄움: 틱 p50 47ms · 기다림 47 대가 25분 그대로). 켬이면 빈 쌍은 한 틱에 첫 한 대만 부른다.
//   ① 글자 — 손잡이 켬 기본(`=0` 만 끔 · T910 ⓪) · 끔 갈래 = 종전 줄(`spawnCaravanBody` 를 줄의 캐러밴마다 부른다) 그대로 · 켬 줄은 그 부름 바로 앞 한 줄
//   ② 판 — 실서버 아이 존(빠른 시계 · 캐러밴 켬)을 몇 날 돌려 저장(SIGTERM) → 같은 DB 로 끔 · 켬 나란히 다시 띄움(실제 날 길이 — 세계가 그 사이 안 넘어간다):
//      처음 다시 뜬 판은 교역로 캐시를 서명 불일치로 버린다(새 세계 판 서명 ≠ 다시 뜬 판 서명 — T896 회부) ⇒ 되살릴 캐러밴 대부분이 길을 새로 파야 한다.
//      끔: 빈 쌍이 둘 이상 줄에 서서 교역로 일을 서로 버린다(자명 통과 금지 — 세계에 따라 몇 분 ~ 25분 묶인다 · 시간은 단언 안 함)
//      켬: 줄이 끝난다(`done` · 기다림 0) · 끔보다 일찍(또는 같이) · 덜 버린다 · 끝난 뒤 공유 예산 넘침이 틱의 일부
//   ★값: 이 손잡이는 몸이 서는 때를 바꾼다(끔은 몸이 안 선다 — 그래서 고친다). econ 장부는 몸을 안 읽는다 — 서버 기준선(캐러밴 0 판) 바이트 같음으로 따로 본다.
//   ★[T1267] ★ 줄의 "일찍(또는 같이)"는 **표본 해상도**로 가른다 — 두 팔은 10초 표본(`SAMPLE_MS`)으로 따로 잰다. 끝 시각 차가 한 표본 안이면 "같이"
//     (T1261 빨강 1/10 = 끔 1,311 · 켬 1,312초 — 자의 해상도보다 고운 차이를 판정에 쓰지 않는다 · PM 판정 T1261 회부 1). 한 표본 이상 늦으면 빨강.
//     ③ 미끼 — 같은 판의 실제 표본 줄을 고쳐 켬 끝을 **한 표본 늦게** 둔 사본은 빨강 · 한 표본 안(1초 모자람) 늦은 사본은 "같이"(초록).
//   [T1267] `T1267_JSON=<파일>` — 부팅 세계 지문(마을 · 몸 · 되살릴 줄 · 쌍) · 두 팔 표본 줄을 적는다(판정 밖 · 두 봉우리 가르기).
//   ★[T1269] 두 팔 다 교역로 선계산을 판 밖으로 민다(`VILLAGE_ROUTE_WARM_IDLE_MS`) — 두 팔이 `T1026_SLOT_KEEP=0` 이라 선계산이 뜨면 되살림 줄과 슬롯을
//     맞버려(T1267) 이 판이 T896 이 아니라 그 맞버림을 쟀다. [상황] 줄이 두 팔 `warm` 일 시작 0 을 확인한다.
// 실행: node scripts/test-resume-one.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T896 ② 캐러밴 몸 되살림 — 빈 쌍은 한 틱에 한 대 ===');
console.log('\n① 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T896_RESUME_ONE = process\.env\.T896_RESUME_ONE !== '0';/.test(V), "손잡이 — 켬 기본 · `=0` 만 끔(T910 ⓪)");
// ★[T1203 2026-11-07] 켬 줄 머리에 T1182 조건이 붙었다(저장된 걸음 상태 `_t1034Saved … .act` 를 쥔 캐러밴은 길을 새로 안 파니 자리 다툼 밖) — 글자 자를 그 줄에 맞춘다.
ok(V.includes("    if (T896_RESUME_ONE && !(T762_CARAVAN_BODY && state._t1034Saved && state._t1034Saved.get(String(c.id))?.act)) { if (_t896NeedSlot(c)) { if (slotTaken) { keep.push(c); _probe.t896Held = (_probe.t896Held || 0) + 1; continue; } slotTaken = true; } }   // ★[T896] 빈 쌍은 한 틱 한 대\n    if (_dry) _t1061.overCalls++;   // ★[T1061] 셈만 — 이 틱 몫이 이미 바닥난 뒤에 부른 캐러밴(위와 같은 잼 · 켬이면 위 줄이 막아 0 · 끔 = 종전 쌓임)\n    const r = _t1026Door('resume775', () => spawnCaravanBody(c, now));   // ★[T1026] 꼬리표(값 무변)\n    if (r === 'wait') { keep.push(c); continue; }   // 길이 아직 — 줄에 남긴다(다음 틱)"),
  '켬 줄은 `spawnCaravanBody` 부름 앞 줄(T1061 셈 한 줄 사이 — [T1174] 하네스 글자 갱신) · 끔 갈래 = 종전 줄 그대로');
ok(/function _t896NeedSlot\(c\) \{[\s\S]{0,300}state\.routeCache\.get\(_routeKey\(a, b\)\.key\) === undefined;/.test(V), '빈 쌍 술어 = 교역로 캐시(`_routeKey` — 제품 열쇠)에 그 쌍이 없다');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't896-'));
const zoneEnv = (db, port, extra) => Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: db, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  CENTRAL_SECRET: 't896', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0' }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exitOf = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const perf = (port) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: '/perf', headers: { 'x-zone-secret': 't896' }, timeout: 15000 }, (r) => {
  let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); }); q.on('error', () => res(null)); q.on('timeout', () => { q.destroy(); res(null); }); });
//   [T1203] 두 팔에 `T762_CARAVAN_BODY=0` 도 묶는다 — 캐러밴 몸(land1048 켬 기본)이면 다시 뜬 캐러밴이 저장된 걸음 상태(T1182 · `_t1182 = T762`)로 곧장 서서
//     길을 새로 파는 빈 쌍이 안 생긴다(끔 판 "첫 기다림 0 · 버림 0" — 자명 통과 금지 ✗). T896 이 다루는 판은 몸 걸음 상태 없는 되살림이다.
//   [T1174] 두 팔에 `T1061_RESUME_SLICE=0` 도 묶는다 — T1061 이 켬 기본이 되어 끔 팔도 틱 몫이 바닥나면 빈 쌍을 붙들어 "버림 0"(자명 통과 금지 ✗)이 됐다. 이 하네스는 T896 한 손잡이만 가른다.
//   ★[T1267] 포트는 OS 가 고른다 — 종전 `38000 + pid % 400`(팔 = +401 · +402)은 pid 가 1 차이 나는 두 판을 나란히 돌리면 한 판의 켬 포트 = 다른 판의 끔 포트라
//     뒤에 뜬 서버는 못 묶고 두 판의 표본이 남의 서버를 읽었다(T1267 20판 첫 묶음 — 판 3~9 빨강 7 이 그 꼴 · 끔 팔에 `held896` · 켬 팔에 없음).
const freePorts = (n) => Promise.all(Array.from({ length: n }, () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => res(s)); })))
  .then((S) => Promise.all(S.map((s) => new Promise((res) => { const p = s.address().port; s.close(() => res(p)); }))));
//   ★[T1267] 표본 해상도 판정 — 켬 끝(b) · 끔 끝(a · 없으면 창 안 안 끝남)을 초로 받아 'early' | 'same' | 'late' | 'none'(켬 안 끝남)
const SAMPLE_MS = 10000, RES_S = SAMPLE_MS / 1000;
function doneOrder(a, b) {
  if (!b) return 'none';
  if (!a) return 'early';   // 끔이 창 안에 안 끝났다(켬이 끝난 그 표본에서 같이 멈춘다)
  const d = b - a;
  return d <= -RES_S ? 'early' : d < RES_S ? 'same' : 'late';
}
const doneAt = (R) => (R.find((r) => r.t775 && r.t775.done) || {}).s;
delete process.env.T896_RESUME_ONE;

(async () => {
  const PORTS = await freePorts(3);
  console.log('\n② 판 — 저장 → 끔 · 켬 나란히 다시 띄움');
  const S = path.join(TMP, 'save.db');
  const z = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: zoneEnv(S, PORTS[0], { VILLAGE_DAY_MS: '250' }), stdio: 'ignore' });
  const zx = exitOf(z, 900000);
  { const t0 = Date.now();   // 저장 날이 8 을 넘으면(캐러밴이 길에 섰다) SIGTERM — 종료 저장이 마을 행과 메타 행을 한 날로 같이 쓴다 · 상한 10분
    while (Date.now() - t0 < 600000) { await sleep(5000);
      try { const db = new DatabaseSync(S, { readOnly: true }); const d = db.prepare('select max(day) as d from villages').get(); db.close(); if (d && d.d >= 8) break; } catch (e) {} } }
  try { z.kill('SIGTERM'); } catch (e) {}
  await Promise.race([zx, sleep(30000)]); try { z.kill('SIGKILL'); } catch (e) {} await zx;
  let mc = 0; try { const db = new DatabaseSync(S, { readOnly: true }); const m = db.prepare('select data from world_meta').get(); mc = m ? (JSON.parse(m.data).caravans || []).length : 0; db.close(); } catch (e) {}
  ok(mc >= 10, '[상황] 저장된 세계 — 길 위 캐러밴이 메타에 실렸다', `캐러밴 ${mc}`);
  //   ★[T1267] 부팅 세계 지문(판정 밖) — 저장 DB 에서: 마을 수 · 인구 합 · 저장 날 · 되살릴 줄(캐러밴) 수 · 가는/귀환 · 다른 쌍 수 · 쌍 거리(칸 — 마을 자리 견줌)
  const FP = { villages: 0, pop: 0, day: null, caravans: mc, out: 0, inb: 0, pairs: 0, pairMax: 0, pairMean: 0 };
  try {
    const db = new DatabaseSync(S, { readOnly: true });
    const vs = db.prepare('select name, cx, cy, population, day from villages').all(); FP.villages = vs.length;
    const at = new Map(vs.map((v) => [v.name, v])); for (const v of vs) { FP.pop += v.population | 0; FP.day = Math.max(FP.day | 0, v.day | 0); }
    const m = db.prepare('select data from world_meta').get(); const cs = m ? (JSON.parse(m.data).caravans || []) : [];
    const pr = new Map();
    for (const c of cs) { if (c.state === 'inbound') FP.inb++; else FP.out++; const k = [c.from, c.to].sort().join('|'); if (!pr.has(k)) { const A = at.get(c.from), B = at.get(c.to); pr.set(k, A && B ? Math.hypot(A.cx - B.cx, A.cy - B.cy) : null); } }
    const ds = [...pr.values()].filter((d) => d != null); FP.pairs = pr.size; FP.pairMax = ds.length ? Math.round(Math.max(...ds)) : 0; FP.pairMean = ds.length ? Math.round(ds.reduce((x, y) => x + y, 0) / ds.length) : 0;
    db.close();
  } catch (e) { FP.err = String(e.message).slice(0, 80); }
  console.log(`  [지문] 마을 ${FP.villages} · 인구 ${FP.pop} · 저장 날 ${FP.day} · 되살릴 줄 ${FP.caravans}(가는 ${FP.out} · 귀환 ${FP.inb}) · 쌍 ${FP.pairs}(거리 평균 ${FP.pairMean} · 최장 ${FP.pairMax})`);
  //   ★[T1261] 관측 창은 시간이 아니라 **켬 팔의 되살림 끝 신호**(`/perf` `t775.done`)를 기다린다 — 종전 창(표본 18 ≈ 191초)은 세계가 커지자
  //     켬 판이 같은 일을 다 하기 전에 닫혔다(첫 빨강 착지 land1058 `9783cbea` · 끝 160초 → 480초 · 창 2배 안 끝남 · 4배 끝 — 보고 T1261).
  //     끔 팔은 켬 팔이 끝나는 그 순간까지(또는 저 스스로 끝날 때까지) 같이 잰다 — 두 팔이 **같은 창**을 본다(단언 무변).
  //     상한 1,500초는 그물이다(판정 밖 · 못 끝나면 ★★ 줄이 `done:false` 로 빨강).
  const NET_MS = 1500000; const ev = { onDone: false };
  //   ★[T1269 · T1267 회부 1 — PM 판정 (가)] 두 팔 다 교역로 선계산(`_routeWarmStep` — 부팅 뒤 `VILLAGE_ROUTE_WARM_IDLE_MS` 기본 30초부터 프레임마다)을 판 밖으로 민다.
  //     T1026 끈 두 팔에서 선계산이 뜨면 되살림 줄과 길 슬롯을 프레임마다 서로 버려(T1267 — 날 9 세계 15/15 빨강) 이 판이 T896 말고 그 맞버림을 쟀다.
  //     값 = 아이 수명 상한(`exitOf` = 그물 + 300초)의 두 배 — 판 안에서는 선계산이 못 뜬다(아래 [상황] 줄이 `warm` 일 시작 0 으로 확인).
  const WARM_OFF_MS = String(2 * (NET_MS + 300000));
  const again = async (tag, on, k) => {
    const db = path.join(TMP, tag + '.db'); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(S + s, db + s); } catch (e) {} }
    const port = PORTS[1 + k]; const env = zoneEnv(db, port, Object.assign({ T910_SIG_PURE: '0', T1026_SLOT_KEEP: '0', T1061_RESUME_SLICE: '0', T762_CARAVAN_BODY: '0', VILLAGE_ROUTE_WARM_IDLE_MS: WARM_OFF_MS }, on ? {} : { T896_RESUME_ONE: '0' }));   // ★[PM land1034] T1026_SLOT_KEEP 켬 기본이면 끔 판도 안 버린다(T896 이 고친 꼴을 T1026 이 문 전부로 넓힘) — 이 판은 T896 한 손잡이만 가르므로 둘 다 0 · ★[PM 착지 10-24d] 판 꾸밈: T910 켬 기본이면 다시 뜬 판이 길 캐시를 지켜 빈 쌍이 안 선다 — 이 하네스가 재는 상황(캐시를 버린 재기동 · 빈 쌍 줄)은 `T910_SIG_PURE=0` 으로 세운다(두 팔 같게 · 단언 무변)   // ★[T910 ⓪] 켬 = 빈 값(기본) · 끔 = '0'
    const c = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: 'ignore' }); const cx = exitOf(c, NET_MS + 300000);
    const rows = []; const t0 = Date.now();
    while (Date.now() - t0 < NET_MS) { await sleep(SAMPLE_MS); const p = await perf(port); if (!p || !p.econTick) continue;
      const pr = p.econTick.probe || {}, sb = p.sharedBudget || {};
      rows.push({ s: (Date.now() - t0) / 1000 | 0, t775: pr.t775 || null, jobs: pr.pathJobs | 0, drop: pr.pathDrop | 0, ticks: sb.ticks | 0, over: sb.over | 0, p50: p.tick && p.tick.ms && p.tick.ms.p50,
        d1026: pr.t1026 ? { drop: pr.t1026.drop, start: pr.t1026.start, held: pr.t1026.held } : null });   // ★[T1267] 셈만 — 슬롯 버림 문 짝(두 봉우리 까닭 · 판정 밖)
      const L = rows[rows.length - 1]; if (rows.length >= 6 && L.t775 && (L.t775.done || (!on && ev.onDone))) { if (on) ev.onDone = true; break; } }
    try { c.kill('SIGKILL'); } catch (e) {} await cx; return rows; };
  const [A, B] = await Promise.all([again('off', false, 0), again('on', true, 1)]);
  const last = (R) => R[R.length - 1] || {}, first = (R) => R.find((r) => r.t775) || {};
  const a0 = first(A), a1 = last(A), b1 = last(B);
  //   ★[T1267] 팔 정체 — `/perf` 의 `held896` 칸은 켬(T896_RESUME_ONE)일 때만 선다: 끔 팔 표본엔 없고 켬 팔 표본엔 있어야 제 서버를 읽은 것이다
  //   ★[T1269] 선계산이 정말 안 떴나 — 두 팔 표본의 슬롯 일 시작(`t1026.start`)에 `warm` 이 0(떴으면 이 판은 T896 이 아니라 맞버림을 잰다)
  const warmN = (R) => R.reduce((m, r) => Math.max(m, (r.d1026 && r.d1026.start && r.d1026.start.warm) | 0), 0);
  const seen1026 = A.some((r) => r.d1026) && B.some((r) => r.d1026);
  ok(seen1026 && warmN(A) === 0 && warmN(B) === 0, '[상황] 교역로 선계산이 판 안에 안 떴다(두 팔 슬롯 일 시작 `warm` 0 — T896 한 손잡이만 가른다)', `warm 일 시작 끔 ${warmN(A)} · 켬 ${warmN(B)} · 문 셈 ${seen1026 ? '읽음' : '못 읽음'}`);
  const armOk = A.every((r) => !r.t775 || !('held896' in r.t775)) && B.every((r) => !r.t775 || ('held896' in r.t775));
  ok(A.length >= 6 && B.length >= 1 && a1.t775 && b1.t775 && armOk, '[상황] 두 판이 떴고 되살림 줄이 섰다(관측 실패 0 · 팔마다 제 서버 — 끔 = `held896` 칸 없음 · 켬 = 있음)', `표본 ${A.length} · ${B.length} · 팔 정체 ${armOk ? '맞음' : '어긋남'}`);
  const aQ = a1.t775 ? a1.t775.wait : -1, aTicks = a1.ticks - a0.ticks, aJobs = a1.jobs - a0.jobs, aOver = a1.over - a0.over;
  const bDoneAt = doneAt(B), aDoneAt = doneAt(A);
  const aDrop = a1.drop - a0.drop, b0 = first(B), bDrop = (B.find((r) => r.t775 && r.t775.done) || b1).drop - (b0.drop | 0);
  //   ★판마다 저장된 세계가 다르다(되살릴 쌍의 길이 · 수) — 끔이 몇 분 묶이는 판도(실측 47 대 25분) 1분 남짓에 풀리는 판도 있다. 그래서 시간이 아니라
  //     꼴을 본다: 끔은 되살림 줄이 슬롯을 서로 버린다(버림 > 0 · 일 시작이 몸 수를 크게 넘는다) · 켬은 그보다 일찍 끝나고 덜 버린다.
  ok(a0.t775 && a0.t775.wait >= 2 && aDrop > 0, '[상황 · 자명 통과 금지] 끔: 빈 쌍이 둘 이상 줄에 서서 교역로 일을 서로 버렸다', `첫 기다림 ${a0.t775 && a0.t775.wait} · 버림 ${aDrop} · 일 시작 ${a1.jobs - a0.jobs}`);
  const ord = doneOrder(aDoneAt, bDoneAt);
  ok((ord === 'early' || ord === 'same') && bDrop < aDrop, `★켬: 끔보다 일찍(또는 같이 — 표본 ${RES_S}초 해상도) 끝나고 덜 버린다`, `끝 끔 ${aDoneAt || '안 끝남(' + a1.s + '초)'} · 켬 ${bDoneAt}초 → ${ord} · 버림 끔 ${aDrop} · 켬 ${bDrop}`);
  //   ③ 미끼 — 같은 판의 실제 줄을 고친 사본에 같은 자(`doneOrder`)를 댄다: 켬 끝을 끔 끝(없으면 켬 끝 그 자리)보다 **한 표본** 늦게 → 빨강 · 한 표본에 1초 모자라게 → 같이
  {
    const ref = aDoneAt || bDoneAt;
    const late = (dt) => { const B2 = B.map((r) => Object.assign({}, r, { t775: r.t775 && Object.assign({}, r.t775, { done: false }) })); const L = B2[B2.length - 1]; B2.push(Object.assign({}, L, { s: ref + dt, t775: Object.assign({}, L.t775, { done: true }) })); return doneOrder(ref, doneAt(B2)); };
    const lt = ref ? late(RES_S) : 'x', sm = ref ? late(RES_S - 1) : 'x';   // ★[T1267] 미끼는 ★ 줄과 따로 문다(켬이 안 끝난 판에도 끔 끝이 있으면 댄다)
    ok(lt === 'late' && sm === 'same', '③ 미끼 — 켬 끝이 한 표본 늦은 사본은 빨강(late) · 한 표본 안(1초 모자람)은 같이(same) — 같은 자', `한 표본 늦음 → ${lt} · ${RES_S - 1}초 늦음 → ${sm}`);
  }
  console.log(`  (끔 기다림 ${a0.t775 && a0.t775.wait} → ${aQ} · 틱 ${aTicks} · 일 시작 ${aJobs} · 넘침 ${aOver})`);
  ok(b1.t775 && b1.t775.done === true && b1.t775.wait === 0, '★★켬: 되살림 줄이 끝났다(기다림 0)', JSON.stringify(b1.t775));
  ok(b1.t775 && b1.t775.placed + b1.t775.lost + (b1.t775.cap | 0) >= 1 && (b1.t775.held896 | 0) > 0, '켬: 몸을 세웠고(자리 잡음) 빈 쌍을 실제로 미뤘다(자명 통과 금지 — 켬 줄이 돈다)', `자리 ${b1.t775 && b1.t775.placed} · 잃음 ${b1.t775 && b1.t775.lost} · 미룸 ${b1.t775 && b1.t775.held896}`);
  const bL = B.slice(-3); const bTicks = bL.length >= 2 ? bL[bL.length - 1].ticks - bL[0].ticks : 0, bOver = bL.length >= 2 ? bL[bL.length - 1].over - bL[0].over : 0;
  ok(bTicks > 0 && bOver < 0.5 * bTicks, '켬: 줄이 끝난 뒤 공유 예산 넘침이 틱의 절반 아래(사람 결정 문이 틱마다 잘리지 않는다)', `틱 ${bTicks} · 넘침 ${bOver}`);
  console.log(`  (틱 p50 ms — 끔 ${a1.p50} · 켬 ${b1.p50})`);
  if (process.env.T1267_JSON) { try { fs.writeFileSync(process.env.T1267_JSON, JSON.stringify({ fp: FP, aDoneAt: aDoneAt || null, bDoneAt: bDoneAt || null, ord, aDrop, bDrop, A, B })); } catch (e) {} }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})();
