#!/usr/bin/env node
// === scripts/t357-grove-need.js — 군락 **필요 밀도**를 수에서 유도한다 (T357 ①) ================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). **세계 무변**(읽기만).
//
// ★왜 — T347 이 "세계가 비어 있다"를 실측했다(군락 마을당 약 5 · 걷는 몫의 2%만 댄다).
//   #58(재민: 세계를 수식에 맞추나, 수식을 세계에 맞추나)은 **얼마나**가 있어야 결정된다.
//   이 자는 그 수를 **유도**한다 — 짓지 않는다.
//
// ★★유도 — 빌린 값이 **하나도 없다**(카드가 허락한 "나무 r 빌리기"를 안 썼다):
//   ⓐ 마을 하루 걷는 단 `D = _forageOutLast × 믹스 몫`(둘 다 econ 정본이 낸 수 · T347)
//   ⓑ 개체 하나가 내는 단 `w̄`(존 전리품 표 `lootOfResource` — 덤불 `twig 1`·풀 `herb 2`)
//   ⓒ **재생 주기는 T122 정본이 종류별로 갖고 있다** — `chunk.js REGROW`:
//        덤불 `BUSH_Y = 1` 년 · 풀 `HERB_Y = 0.5` 년 · 한 해 길이는 `events.yearDaysOf()`.
//      ⇒ 갱신(renewal) 꼴: 재고 K 가 주기 `T·Y` 에 한 번 돈다 ⇒ **지속 채취 = K ÷ (T·Y)**.
//      ⇒ 로지스틱으로 옮기면 `MSY = rK/4 = K/(T·Y)` ⇒ **r = 4/(T·Y)** (T341 의 그 식을 뒤집은 것).
//   ⇒ **필요 개체 `K = (D / w̄) × T·Y`** — 같은 수를 `K = 4D/(w̄·r)` 로도 낸다(둘이 같음을 표가 보인다).
//
// ★두 판 — 걷는 몫이 무엇이냐가 #58 의 갈림이다:
//   판 A: 지금 걷는 것(`twig`·`herb` — 실체가 실제로 대는 품목만 · T347 결정 A)
//   판 B: `berry → fruit` 동의어까지(`PV_DEPOSIT_MAP` 첫 줄 · 넣을지는 PM · T347 §7-나)
//   믹스 몫은 **econ 정본에 다시 물어** 마을 땅값으로 유도한다(이 파일에 표 0).
//
// 실행: node scripts/t357-grove-need.js [out.json]
//   WARM_DAYS(기본 45) · DAY_MS(기본 6000) · WAIT_DAYS(기본 3 — 걷는 목록 주입이 앉는 데 필요)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t357/grove-need.json';
const WARM_DAYS = parseInt(process.env.WARM_DAYS || '45', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '6000', 10);
const WAIT_DAYS = parseInt(process.env.WAIT_DAYS || '3', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
fs.mkdirSync(path.dirname(OUT), { recursive: true });

function boot(tag, zenv) {
  const SECRET = 't357-' + tag;
  const CP = 3870, ZP = 3880;
  const logf = fs.openSync(`/tmp/t357/${tag}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/t357/c-${tag}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
  const perf = async () => { try { const r = await fetch(`http://localhost:${ZP}/perf`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  return { perf, health, kill };
}
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;

(async () => {
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const EV = require(path.join(ROOT, 'server', 'events.js'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const YEAR = (EV.yearDaysOf && EV.yearDaysOf()) || 365;
  //   ★재생 주기·r — 전부 T122 정본에서 유도(빌린 값 0)
  const CYCLE = { berry_bush: CH.REGROW.BUSH_Y() * YEAR, herb: CH.REGROW.HERB_Y() * YEAR };
  const R_OF = { berry_bush: 4 / CYCLE.berry_bush, herb: 4 / CYCLE.herb };
  const DEP = V.playerVillageDepositMap();
  const res = { at: new Date().toISOString(), YEAR, CYCLE, R_OF, WARM_DAYS, DAY_MS, villages: [] };

  const db = `/tmp/t357/z.db`; rmdb(db);
  say(`틀 굽기(끈 팔) — ${WARM_DAYS}일`);
  const b0 = boot('warm', { DB_PATH: db, VILLAGE_DAY_MS: String(Math.max(1200, Math.floor(DAY_MS / 4))) });
  for (let i = 0; i < 900 && !(await b0.health()); i++) await sleep(1000);
  let d = 0; const t0 = Date.now();
  while (d < WARM_DAYS && Date.now() - t0 < 45 * 60000) { await sleep(6000); d = dayOf(await b0.perf()); }
  await sleep(5000); await b0.kill();
  say(`  틀 day ${d}`);

  say('켠 팔 — 걷는 목록이 앉을 때까지 하루 경계 몇 번');
  const b = boot('on', { DB_PATH: db, T347_FORAGE_ACT: '1' });
  for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
  let last = dayOf(await b.perf()), seen = 0, p = null;
  const t1 = Date.now();
  while (seen < WAIT_DAYS && Date.now() - t1 < 20 * 60000) {
    await sleep(Math.max(1500, Math.floor(DAY_MS / 3)));
    const q = await b.perf(); const dd = dayOf(q);
    if (dd !== last) { last = dd; seen++; p = q; say(`  day ${dd} · 행위 ${q && q.forage ? q.forage.actVillages : '?'} · 걷는 목록 ${q && q.forage ? (q.forage.items || []).join('·') : '?'}`); }
  }
  await b.kill(); rmdb(db);
  if (!p || !p.forage) { say('✗ 관측을 못 얻었다'); process.exit(1); }
  const F = p.forage;
  res.items = F.items || [];
  res.worldGroves = F.groves; res.worldK = F.K; res.actVillages = F.actVillages; res.noGrove = F.noGroveVillages;

  for (const row of (F.rows || [])) {
    const L = row.land || null; if (!L) continue;
    //   ⓐ 믹스 — econ 정본에 다시 묻는다(이 파일에 표 0)
    const mix = E.foragerYieldsFor({ land: { fertility: L.f, wood: L.w, stone: L.s } });
    const sum = Object.values(mix).reduce((a, b2) => a + b2, 0) || 1;
    const shareOf = (keys) => keys.reduce((a, k) => a + (mix[k] || 0), 0) / sum;
    const A = res.items.slice();                                  // 판 A — 지금 걷는 것
    const Bk = A.slice();                                         // 판 B — berry 의 econ 동의어까지
    const syn = DEP.berry; if (syn && mix[syn] != null && Bk.indexOf(syn) < 0) Bk.push(syn);
    const shA = shareOf(A), shB = shareOf(Bk);
    const f = row.f || 0;                                         // `_forageOutLast` — 수식 하루 합
    const wbar = row.wBar > 0 ? row.wBar : 1;
    const need = (share) => {
      const Dday = f * share;                                     // 하루 걷는 단
      const perDay = Dday / wbar;                                 // 하루 필요 개체
      const K1 = perDay * CYCLE.berry_bush;                        // 갱신 꼴(덤불 주기)
      const K2 = 4 * Dday / (wbar * R_OF.berry_bush);              // 로지스틱 MSY 꼴 — 같은 수
      return { Dday: +Dday.toFixed(4), perDay: +perDay.toFixed(4), K: Math.ceil(K1), Kmsy: Math.ceil(K2) };
    };
    res.villages.push({ n: row.n, fg: row.fg, f: +f.toFixed(4), wBar: row.wBar, Know: row.K | 0, cells: row.cells | 0,
      land: L, shareA: +shA.toFixed(6), shareB: +shB.toFixed(6), A: need(shA), B: need(shB) });
  }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  const sum = (k, p2) => res.villages.reduce((a, v) => a + v[p2][k], 0);
  say(`\n마을 ${res.villages.length} · 지금 군락 개체 합 ${res.villages.reduce((a, v) => a + v.Know, 0)}`);
  say(`판 A(걷는 몫) 필요 K 합 ${sum('K', 'A')} · 판 B(berry→fruit) ${sum('K', 'B')}`);
  say('끝 →', OUT);
  process.exit(0);
})();
