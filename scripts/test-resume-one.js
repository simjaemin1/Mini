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
// 실행: node scripts/test-resume-one.js
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

console.log('\n=== T896 ② 캐러밴 몸 되살림 — 빈 쌍은 한 틱에 한 대 ===');
console.log('\n① 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T896_RESUME_ONE = process\.env\.T896_RESUME_ONE !== '0';/.test(V), "손잡이 — 켬 기본 · `=0` 만 끔(T910 ⓪)");
ok(V.includes("    if (T896_RESUME_ONE) { if (_t896NeedSlot(c)) { if (slotTaken) { keep.push(c); _probe.t896Held = (_probe.t896Held || 0) + 1; continue; } slotTaken = true; } }   // ★[T896] 빈 쌍은 한 틱 한 대\n    const r = _t1026Door('resume775', () => spawnCaravanBody(c, now));   // ★[T1026] 꼬리표(값 무변)\n    if (r === 'wait') { keep.push(c); continue; }   // 길이 아직 — 줄에 남긴다(다음 틱)"),
  '켬 줄은 `spawnCaravanBody` 부름 바로 앞 한 줄 · 끔 갈래 = 종전 두 줄 그대로');
ok(/function _t896NeedSlot\(c\) \{[\s\S]{0,300}state\.routeCache\.get\(_routeKey\(a, b\)\.key\) === undefined;/.test(V), '빈 쌍 술어 = 교역로 캐시(`_routeKey` — 제품 열쇠)에 그 쌍이 없다');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't896-'));
const zoneEnv = (db, port, extra) => Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: db, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  CENTRAL_SECRET: 't896', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0' }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exitOf = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const perf = (port) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: '/perf', headers: { 'x-zone-secret': 't896' }, timeout: 15000 }, (r) => {
  let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); }); q.on('error', () => res(null)); q.on('timeout', () => { q.destroy(); res(null); }); });
const base = 38000 + (process.pid % 400);
delete process.env.T896_RESUME_ONE;

(async () => {
  console.log('\n② 판 — 저장 → 끔 · 켬 나란히 다시 띄움');
  const S = path.join(TMP, 'save.db');
  const z = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: zoneEnv(S, base, { VILLAGE_DAY_MS: '250' }), stdio: 'ignore' });
  const zx = exitOf(z, 900000);
  { const t0 = Date.now();   // 저장 날이 8 을 넘으면(캐러밴이 길에 섰다) SIGTERM — 종료 저장이 마을 행과 메타 행을 한 날로 같이 쓴다 · 상한 10분
    while (Date.now() - t0 < 600000) { await sleep(5000);
      try { const db = new DatabaseSync(S, { readOnly: true }); const d = db.prepare('select max(day) as d from villages').get(); db.close(); if (d && d.d >= 8) break; } catch (e) {} } }
  try { z.kill('SIGTERM'); } catch (e) {}
  await Promise.race([zx, sleep(30000)]); try { z.kill('SIGKILL'); } catch (e) {} await zx;
  let mc = 0; try { const db = new DatabaseSync(S, { readOnly: true }); const m = db.prepare('select data from world_meta').get(); mc = m ? (JSON.parse(m.data).caravans || []).length : 0; db.close(); } catch (e) {}
  ok(mc >= 10, '[상황] 저장된 세계 — 길 위 캐러밴이 메타에 실렸다', `캐러밴 ${mc}`);
  const again = async (tag, on, k) => {
    const db = path.join(TMP, tag + '.db'); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(S + s, db + s); } catch (e) {} }
    const port = base + 401 + k; const env = zoneEnv(db, port, Object.assign({ T910_SIG_PURE: '0', T1026_SLOT_KEEP: '0' }, on ? {} : { T896_RESUME_ONE: '0' }));   // ★[PM land1034] T1026_SLOT_KEEP 켬 기본이면 끔 판도 안 버린다(T896 이 고친 꼴을 T1026 이 문 전부로 넓힘) — 이 판은 T896 한 손잡이만 가르므로 둘 다 0 · ★[PM 착지 10-24d] 판 꾸밈: T910 켬 기본이면 다시 뜬 판이 길 캐시를 지켜 빈 쌍이 안 선다 — 이 하네스가 재는 상황(캐시를 버린 재기동 · 빈 쌍 줄)은 `T910_SIG_PURE=0` 으로 세운다(두 팔 같게 · 단언 무변)   // ★[T910 ⓪] 켬 = 빈 값(기본) · 끔 = '0'
    const c = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: 'ignore' }); const cx = exitOf(c, 900000);
    const rows = []; const t0 = Date.now();
    while (Date.now() - t0 < 420000) { await sleep(10000); const p = await perf(port); if (!p || !p.econTick) continue;
      const pr = p.econTick.probe || {}, sb = p.sharedBudget || {};
      rows.push({ s: (Date.now() - t0) / 1000 | 0, t775: pr.t775 || null, jobs: pr.pathJobs | 0, drop: pr.pathDrop | 0, ticks: sb.ticks | 0, over: sb.over | 0, p50: p.tick && p.tick.ms && p.tick.ms.p50 });
      const L = rows[rows.length - 1]; if (rows.length >= 6 && L.t775 && (L.t775.done || rows.length >= 18)) break; }
    try { c.kill('SIGKILL'); } catch (e) {} await cx; return rows; };
  const [A, B] = await Promise.all([again('off', false, 0), again('on', true, 1)]);
  const last = (R) => R[R.length - 1] || {}, first = (R) => R.find((r) => r.t775) || {};
  const a0 = first(A), a1 = last(A), b1 = last(B);
  ok(A.length >= 6 && B.length >= 1 && a1.t775 && b1.t775, '[상황] 두 판이 떴고 되살림 줄이 섰다(관측 실패 0)', `표본 ${A.length} · ${B.length}`);
  const aQ = a1.t775 ? a1.t775.wait : -1, aTicks = a1.ticks - a0.ticks, aJobs = a1.jobs - a0.jobs, aOver = a1.over - a0.over;
  const bDoneAt = (B.find((r) => r.t775 && r.t775.done) || {}).s, aDoneAt = (A.find((r) => r.t775 && r.t775.done) || {}).s;
  const aDrop = a1.drop - a0.drop, b0 = first(B), bDrop = (B.find((r) => r.t775 && r.t775.done) || b1).drop - (b0.drop | 0);
  //   ★판마다 저장된 세계가 다르다(되살릴 쌍의 길이 · 수) — 끔이 몇 분 묶이는 판도(실측 47 대 25분) 1분 남짓에 풀리는 판도 있다. 그래서 시간이 아니라
  //     꼴을 본다: 끔은 되살림 줄이 슬롯을 서로 버린다(버림 > 0 · 일 시작이 몸 수를 크게 넘는다) · 켬은 그보다 일찍 끝나고 덜 버린다.
  ok(a0.t775 && a0.t775.wait >= 2 && aDrop > 0, '[상황 · 자명 통과 금지] 끔: 빈 쌍이 둘 이상 줄에 서서 교역로 일을 서로 버렸다', `첫 기다림 ${a0.t775 && a0.t775.wait} · 버림 ${aDrop} · 일 시작 ${a1.jobs - a0.jobs}`);
  ok(bDoneAt && (!aDoneAt || bDoneAt <= aDoneAt) && bDrop < aDrop, '★켬: 끔보다 일찍(또는 같이) 끝나고 덜 버린다', `끝 끔 ${aDoneAt || '안 끝남(' + a1.s + '초)'} · 켬 ${bDoneAt}초 · 버림 끔 ${aDrop} · 켬 ${bDrop}`);
  console.log(`  (끔 기다림 ${a0.t775 && a0.t775.wait} → ${aQ} · 틱 ${aTicks} · 일 시작 ${aJobs} · 넘침 ${aOver})`);
  ok(b1.t775 && b1.t775.done === true && b1.t775.wait === 0, '★★켬: 되살림 줄이 끝났다(기다림 0)', JSON.stringify(b1.t775));
  ok(b1.t775 && b1.t775.placed + b1.t775.lost + (b1.t775.cap | 0) >= 1 && (b1.t775.held896 | 0) > 0, '켬: 몸을 세웠고(자리 잡음) 빈 쌍을 실제로 미뤘다(자명 통과 금지 — 켬 줄이 돈다)', `자리 ${b1.t775 && b1.t775.placed} · 잃음 ${b1.t775 && b1.t775.lost} · 미룸 ${b1.t775 && b1.t775.held896}`);
  const bL = B.slice(-3); const bTicks = bL.length >= 2 ? bL[bL.length - 1].ticks - bL[0].ticks : 0, bOver = bL.length >= 2 ? bL[bL.length - 1].over - bL[0].over : 0;
  ok(bTicks > 0 && bOver < 0.5 * bTicks, '켬: 줄이 끝난 뒤 공유 예산 넘침이 틱의 절반 아래(사람 결정 문이 틱마다 잘리지 않는다)', `틱 ${bTicks} · 넘침 ${bOver}`);
  console.log(`  (틱 p50 ms — 끔 ${a1.p50} · 켬 ${b1.p50})`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})();
