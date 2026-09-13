#!/usr/bin/env node
// === scripts/t267-census.js — T267 계측기: **마을별 빈손 사유** (제품 0) ==============
//
// ★왜 [승인 대기 · T267]
//   `_probe.siteReason` 은 **전역**이라 "어느 마을이 왜 못 짓나"를 못 가른다(T254 회부).
//   제품에 한 줄도 안 넣고 그걸 재는 길이 이미 있다 — `villages.js:6477` 이
//   `__probe.lifeSiteFilters(vil)` 로 **정본 술어 그 자체**를 내준다.
//   ⇒ 끝난 판의 DB 를 그대로 물려 존을 **한 프로세스 안에** 세우고, 마을마다
//     `F.reject(x, y, strict)` 를 **정본 그대로** 불러 사유를 마을 키로 묶는다(사본 0).
//
// ⚠이 자가 다시 적지 않는 것: 거부 규칙(전부 `F.reject`) · 부지 원판 · 마당 반경
//   (`village-layout` 에서 읽는다) · 침상/층 정원. 다시 적는 것은 후보 훑는 **순서**뿐인데
//   그건 수가 아니라 규약이다(짝수 격자 · 중심에서 `HALL_CLEAR` 밖 — `_lifeAddHouseSiteInner` 와 같은 두 줄).
//
// 실행: T267_DB=/tmp/b1both-z.db node scripts/t267-census.js [마을이름,마을이름,...]
'use strict';
const path = require('path');

const DB = process.env.T267_DB;
if (!DB) { console.error('T267_DB=<끝난 판의 존 DB> 가 필요하다'); process.exit(1); }
const WANT = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
const STRICT = process.env.T267_STRICT === '1';   // 1패스(잠재농지도 피함) — 기본은 2패스(loose)
// ★[T267] 영토 성장은 **DB 에 안 남는다**(`_terrGrow` 에 쓰기가 없다 — 실측: `terr` 행이 끔·켬 모두 172,500).
//   그래서 끝난 DB 를 물려 다시 세우면 **재부팅 뒤의 세계**를 잰다. 살아 있는 세계를 재려면
//   이 자가 **직접 판을 돌려야** 한다 — `T267_RUN_DAYS` 를 주면 한 프로세스 안에서 그만큼 돌린 뒤 센다.
const RUN_DAYS = parseInt(process.env.T267_RUN_DAYS || '', 10) || 0;
if (RUN_DAYS) process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || '4000';

process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.PORT = process.env.PORT || String(38100 + (process.pid % 150));
process.env.DB_PATH = DB;
process.env.ENABLE_VILLAGES = '1';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(__dirname, '..', 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const V = H.SimVillages;
const VL = require(path.join(__dirname, '..', 'server', 'village-layout.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 마을이 복원될 때까지 기다린다(세계가 말할 때까지 — 정해진 초를 안 잔다)
  let vils = null;
  for (let i = 0; i < 240 && !vils; i++) {
    const d = V.lifeDebug && V.lifeDebug();
    const ok = ((d && d.villages) || []).filter((z) => z.terr > 0);
    if (ok.length >= 40) vils = ok; else await sleep(500);
  }
  if (!vils) { console.error('마을 복원 실패'); process.exit(1); }
  if (RUN_DAYS) {   // ★살아 있는 세계를 재려면 이 자가 직접 돌린다(같은 프로세스 — `__probe` 가 닿는다)
    process.stderr.write(`  판을 돌린다 — ${RUN_DAYS}게임일(게임일 ${process.env.VILLAGE_DAY_MS}ms) …\n`);
    for (let i = 0; i < 4000; i++) {
      await sleep(5000);
      let d = 0; try { const t = V.tickPerf && V.tickPerf(); d = (t && t.days) | 0; } catch (e) {}
      if (i % 12 === 0) process.stderr.write(`    … ${d}일\n`);
      if (d >= RUN_DAYS) break;
    }
    const d2 = V.lifeDebug && V.lifeDebug();
    vils = ((d2 && d2.villages) || []).filter((z) => z.terr > 0);
  }
  const st = V.__probe;
  if (!st || !st.lifeSiteFilters) { console.error('__probe.lifeSiteFilters 가 없다 — 정본 문이 닫혔다'); process.exit(1); }

  // 정본 상태에서 마을 **실체**를 꺼낸다 — `lifeDebug` 는 그림자다. 문은 이미 있다(`villageOfCell`).
  const byName = new Map();
  for (const d of vils) { try { const v = V.villageOfCell(d.ccx, d.ccy); if (v && v.name === d.name) byName.set(d.name, v); } catch (e) {} }

  const HALL = VL.HALL_CLEAR;
  const rows = [];
  for (const d of vils) {
    if (WANT.length && !WANT.includes(d.name)) continue;
    const vil = byName.get(d.name);
    if (!vil || !vil._terrSet) { rows.push({ name: d.name, err: '실체 없음' }); continue; }
    let F; try { F = st.lifeSiteFilters(vil); } catch (e) { rows.push({ name: d.name, err: e.message }); continue; }
    const why = {}; let cand = 0, ok = 0, skipGrid = 0, skipHall = 0, skipFarm = 0;
    for (const k of vil._terrSet) {
      const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      if ((x & 1) || (y & 1)) { skipGrid++; continue; }                                    // 짝수 격자(정본 규약)
      if (Math.hypot(x - vil.ccx, y - vil.ccy) < HALL) { skipHall++; continue; }            // 큰집 마당 밖
      if (F.farmAt(x, y, STRICT)) { skipFarm++; continue; }                                 // 농지(정본 술어)
      cand++;
      const r = F.reject(x, y, STRICT);                                                      // ★정본 술어 그대로
      if (r) why[r] = (why[r] || 0) + 1; else ok++;
    }
    rows.push({ name: d.name, pop: d.pop, terr: vil._terrSet.size, cand, ok, why, skipGrid, skipHall, skipFarm });
  }

  console.log(`\n=== T267 마을별 빈손 사유 — ${path.basename(DB)} (${STRICT ? '1패스 strict' : '2패스 loose'}) ===`);
  console.log(`  정본 술어: villages.__probe.lifeSiteFilters(vil).reject — 사본 0 · 마당 반경 ${HALL}(village-layout)\n`);
  console.log('  마을      스폰NPC   영토   후보   **지금 지을 수 있는 자리**   빈손 사유 1위');
  for (const r of rows) {
    if (r.err) { console.log(`  ${r.name.padEnd(10)} — ${r.err}`); continue; }
    const top = Object.entries(r.why).sort((a, b) => b[1] - a[1]);
    const t = top.length ? `${top[0][0]} ${(100 * top[0][1] / Math.max(1, r.cand)).toFixed(0)}%` : '—';
    console.log(`  ${r.name.padEnd(10)}${String(r.pop).padStart(5)}${String(r.terr).padStart(7)}${String(r.cand).padStart(7)}${String(r.ok).padStart(26)}   ${t}`);
  }
  const tot = {};
  for (const r of rows) for (const [k, n] of Object.entries(r.why || {})) tot[k] = (tot[k] || 0) + n;
  const T = Object.values(tot).reduce((a, b) => a + b, 0);
  console.log(`\n  사유 합(${rows.length}마을 · 후보 ${rows.reduce((a, r) => a + (r.cand || 0), 0)}칸):`);
  for (const [k, n] of Object.entries(tot).sort((a, b) => b[1] - a[1])) console.log(`     · ${k}: ${n} (${(100 * n / Math.max(1, T)).toFixed(1)}%)`);
  console.log(`  지을 수 있는 자리가 남은 마을: ${rows.filter((r) => r.ok > 0).length}/${rows.length} · 자리 0 인 마을: ${rows.filter((r) => r.ok === 0).length}`);
  if (process.env.T267_JSON) { try { require('fs').writeFileSync(process.env.T267_JSON, JSON.stringify(rows, null, 1)); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
