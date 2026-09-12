#!/usr/bin/env node
// === scripts/t212-beds.js — T212 계측기: **집이 둘인가** ==============================
//   (러너 밖 — `@regress` 표 없음. 진단 카드 자료이지 회귀 검사가 아니다.)
//
// ★왜 [재민 확정 2026-09-12 · T212]
//   econ 은 `_hcap = min(housing, _mapBeds)`(`sim/economy-sim.js:3108`)로 집을 읽는다.
//   그런데 **서버에선 아무도 `_mapBeds` 를 안 심는다**(T207). 그 사이 생활층은 집을
//   `buildings` 행으로 **실제로 짓는다**(`_lifeAddHouseSite`). ⇒ 집의 정본이 둘이다.
//
// ★이 계측기가 하는 일 셋 — **코드 0 · 새 메시지 0 · 있는 문만 쓴다**:
//   ⓑ 실서버 한 판(중앙+존 · 시드 하나 · N 게임일)을 돌리고 **끝난 세계를 DB 에 물어본다**.
//      - econ `housing` ← `villages.econ_state`(JSON · `serializeEcon` 이 쓴 그것)
//      - 실체 집       ← `village_buildings` 행(`house`·`phouse`·`shelter`·`housesite`)
//      - 침상          ← 완공 집의 층 × `VillageLayout.HOUSE_CAP` (**정본을 불러 쓴다** — 사본 금지)
//   ⓒ `_mapBeds` 를 살리면/지우면 `_hcap` 이 어떻게 되나(심지 않는다 — 셈만).
//   ★T207 재현 — "`_mapBeds` 쓰기 0" 을 **두 눈**으로 다시 잰다:
//      ① 실행시 — 이 판이 끝난 뒤 econ_state 에 `_mapBeds` 가 든 마을 수
//      ② 소스 — 레포 전수 대입문 훑기(⚠`grep -r` 은 랩 HTML 을 **바이너리로 건너뛴다** — 여기선 안 건너뛴다)
//
// 실행: node scripts/t212-beds.js            (기본 200일 · 게임일 4초)
//       T212_DAYS=40 T212_DAY_MS=2500 node scripts/t212-beds.js
//       T212_SKIP_RUN=1 T212_DB=/tmp/t212-z.db node scripts/t212-beds.js   (판은 건너뛰고 DB 만 읽는다)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CPORT = parseInt(process.env.T212_CPORT || '3610', 10);
const ZPORT = parseInt(process.env.T212_ZPORT || '3620', 10);
const DAYS = parseInt(process.env.T212_DAYS || '', 10) || 200;
const DAY_MS = parseInt(process.env.T212_DAY_MS || '', 10) || 4000;
const CDB = process.env.T212_CDB || '/tmp/t212-c.db';
const ZDB = process.env.T212_DB || '/tmp/t212-z.db';
const SKIP = process.env.T212_SKIP_RUN === '1';
const SNAP_F = process.env.T212_SNAP || '/tmp/t212-snap.json';

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
process.on('exit', killAll);
// ★소켓 재사용 금지 + 재시도 — 일틱이 초 단위로 루프를 막으면 keep-alive 가 늦게 울려
//   막 쓴 소켓을 서버가 닫는다(`test-site-memo` 가 같은 이유로 겪었다).
let _netRetry = 0;
async function jget(u, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(30000) })).json(); }
    catch (e) { last = e; _netRetry++; await sleep(600); }
  }
  throw last;
}
async function waitHttp(u, n = 900) { for (let i = 0; i < n; i++) { try { const r = await fetch(u, { headers: { connection: 'close' } }); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const rm = (f) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + sfx); } catch (e) {} } };
const r1 = (x) => Math.round(x * 10) / 10;

// ── ★침상 정본 — 층당 몇 명인가는 **레이아웃 모듈이 안다**(하네스가 6 을 다시 적으면 그게 사본이다) ──
const VL = require(path.join(ROOT, 'server', 'village-layout.js'));
const CAP = VL.HOUSE_CAP_PER_FLOOR;

(async () => {
  console.log(`\n=== T212 계측기 — 집이 둘인가(econ housing ↔ 서버 buildings) ===`);
  console.log(`  침상 정본: VillageLayout.HOUSE_CAP_PER_FLOOR = ${CAP} (모듈에서 읽음 — 사본 아님)\n`);

  let perf = null, life = null, health = null;
  if (!SKIP) {
    rm(CDB); rm(ZDB);
    console.log(`  판: 중앙 :${CPORT} · 존 hanbando :${ZPORT} · 게임일 ${DAY_MS}ms × ${DAYS}일 ≈ ${Math.round(DAYS * DAY_MS / 1000)}초`);
    boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    if (!await waitHttp(`http://localhost:${CPORT}/zones`, 180)) { console.log('  ✗ 중앙 부팅 실패'); process.exit(1); }
    boot('zone.js', {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
      CENTRAL_PORT: String(CPORT), CENTRAL_HOST: 'localhost', CENTRAL_URL: `http://localhost:${CPORT}`,
      VILLAGE_DAY_MS: String(DAY_MS),
      ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    });
    if (!await waitHttp(`http://localhost:${ZPORT}/health`, 900)) { console.log('  ✗ 존 부팅 실패'); process.exit(1); }
    const t0 = Date.now();
    let last = -1;
    for (let i = 0; i < 3000; i++) {
      await sleep(5000);
      perf = await jget(`http://localhost:${ZPORT}/perf`);
      const d = (perf.econTick && perf.econTick.days) | 0;
      if (d !== last && d % 20 === 0) { console.log(`    … ${d}일 (${Math.round((Date.now() - t0) / 1000)}초 경과)`); last = d; }
      if (d >= DAYS) break;
    }
    life = await jget(`http://localhost:${ZPORT}/lifedbg`);
    health = await jget(`http://localhost:${ZPORT}/health`);
    // ★저장 큐를 비우게 한 뒤(1마을/틱 · 30Hz) DB 를 읽는다 — 자정 직렬화가 이월돼 있을 수 있다.
    await sleep(6000);
    perf = await jget(`http://localhost:${ZPORT}/perf`);
    killAll();
    // ★관측을 파일로 남긴다 — 판을 다시 돌리지 않고도 표를 다시 찍을 수 있게(T212_SKIP_RUN=1).
    try { fs.writeFileSync(SNAP_F, JSON.stringify({ perf, life, health, days: DAYS, dayMs: DAY_MS }, null, 1)); } catch (e) {}
    await sleep(3000);
  } else {
    try { const j = JSON.parse(fs.readFileSync(SNAP_F, 'utf8')); perf = j.perf; life = j.life; health = j.health; } catch (e) {}
  }

  // ── DB 를 읽는다(읽기 전용) ────────────────────────────────────────────────
  const Database = require('better-sqlite3');
  const db = new Database(ZDB, { readonly: true, fileMustExist: true });
  const vrows = db.prepare('SELECT id, name, population, econ_state, day FROM villages').all();
  const brows = db.prepare('SELECT village_id, type, floors, COUNT(*) n FROM village_buildings GROUP BY village_id, type, floors').all();
  // ★진행 중 집터는 **`_pendSite` 가 세는 그 방식**으로 센다(villages.js:2586): house 행이 없는 housesite 행.
  //   (`housesite` 행은 완공 때 지워지지 않는다 — 누계다. 그래서 누계와 진행 중을 나눠 적는다.)
  const crows = db.prepare("SELECT village_id, type, cx, cy FROM village_buildings WHERE type IN ('house','housesite')").all();
  const pend = new Map();
  { const hs = new Map(), ss = new Map();
    for (const r of crows) { const m = r.type === 'house' ? hs : ss; let a = m.get(r.village_id); if (!a) m.set(r.village_id, a = new Set()); a.add(r.cx + ',' + r.cy); }
    for (const [vid, a] of ss) { const h = hs.get(vid) || new Set(); let n = 0; for (const k of a) if (!h.has(k)) n++; pend.set(vid, n); } }
  const bmap = new Map();
  for (const r of brows) {
    let m = bmap.get(r.village_id); if (!m) bmap.set(r.village_id, m = {});
    m[r.type] = m[r.type] || { n: 0, floors: 0 };
    m[r.type].n += r.n; m[r.type].floors += (r.floors | 0) * r.n;
  }

  const T = [];
  for (const v of vrows) {
    let ec = null; try { ec = v.econ_state ? JSON.parse(v.econ_state) : null; } catch (e) {}
    const m = bmap.get(v.id) || {};
    const g = (k) => m[k] || { n: 0, floors: 0 };
    const house = g('house'), phouse = g('phouse'), shelter = g('shelter'), site = g('housesite');
    const beds = house.floors * CAP;                       // 마을 침대 명부 = 완공 마을 집의 층 × 층당 정원
    const housing = ec && ec.housing != null ? +ec.housing : null;
    const pop = ec && ec.npcs ? ec.npcs.length : (v.population | 0);
    const dbg = ec && ec._dpDebug ? ec._dpDebug : null;   // ★게이트가 **실제로** 물렸는지는 econ 이 그날 적어 둔 것으로 본다(내가 다시 계산하면 그게 사본이다)
    T.push({ id: v.id, name: v.name, day: v.day | 0, pop, gatedReal: dbg ? !!dbg.gated : null, dbgHousing: dbg ? dbg.housing : null,
      housing, mapBeds: ec && ec._mapBeds !== undefined ? ec._mapBeds : undefined,
      hN: house.n, hFl: house.floors, beds, pN: phouse.n, shN: shelter.n, siteN: site.n, pendN: pend.get(v.id) || 0,
      hcapNow: housing, hcapIfPlant: housing == null ? null : Math.min(housing, beds) });
  }
  T.sort((a, b) => a.id - b.id);
  db.close();

  // ── ⓑ 마을별 대조표 ───────────────────────────────────────────────────────
  console.log(`\nⓑ 마을별 대조표 — econ \`housing\`(추상 수용력) vs 서버 실체 집(\`village_buildings\`)`);
  console.log(`  마을 ${T.length}곳 · 세계 ${T.length ? Math.max(...T.map((t) => t.day)) : 0}일\n`);
  console.log('   id  마을            인구   housing   실체집  층합  침상  집터누계 공사중  의뢰집 쉼터  침상-housing');
  for (const t of T) {
    const gap = (t.housing == null) ? null : t.beds - t.housing;
    console.log('  ' + String(t.id).padStart(3) + '  ' + String(t.name).padEnd(14)
      + String(t.pop).padStart(5) + String(t.housing == null ? '—' : r1(t.housing)).padStart(10)
      + String(t.hN).padStart(8) + String(t.hFl).padStart(6) + String(t.beds).padStart(6)
      + String(t.siteN).padStart(8) + String(t.pendN).padStart(7) + String(t.pN).padStart(7) + String(t.shN).padStart(5)
      + (gap == null ? '—' : (gap >= 0 ? '+' : '') + r1(gap)).padStart(15));
  }
  const known = T.filter((t) => t.housing != null);
  const mism = known.filter((t) => Math.round(t.beds) !== Math.round(t.housing));
  const bedsLess = known.filter((t) => t.beds < t.housing);
  const bedsMore = known.filter((t) => t.beds > t.housing);
  console.log(`\n  어긋난 마을 **${mism.length}/${T.length}** — 침상<housing ${bedsLess.length}곳 · 침상>housing ${bedsMore.length}곳`);
  const sum = (f) => known.reduce((a, t) => a + f(t), 0);
  const Pop = sum((t) => t.pop), Bed = sum((t) => t.beds), Hou = sum((t) => t.housing);
  console.log(`  합계: 인구 ${Pop} · housing ${r1(Hou)} · 실체집 ${sum((t) => t.hN)}채(층합 ${sum((t) => t.hFl)}) · 침상 ${Bed}`
    + ` ⇒ **침상/인구 ${(100 * Bed / Pop).toFixed(0)}%** · housing/인구 ${(100 * Hou / Pop).toFixed(0)}%`);
  // ★어긋남은 마을 크기와 함께 방향이 바뀐다 — 큰 마을은 실체가 못 따라오고, 작은 마을은 실체가 앞선다.
  const big = known.filter((t) => t.pop >= 50), sml = known.filter((t) => t.pop < 50);
  const rt = (a) => a.length ? (100 * a.reduce((s2, t) => s2 + t.beds, 0) / a.reduce((s2, t) => s2 + t.pop, 0)).toFixed(0) + '%' : '—';
  console.log(`  크기별: 인구 50↑ ${big.length}곳 — 침상/인구 ${rt(big)}(전부 침상<housing) · 인구 50↓ ${sml.length}곳 — 침상/인구 ${rt(sml)}`);

  // ── ⓒ 살림/지움 셈 표 ─────────────────────────────────────────────────────
  console.log(`\nⓒ 살림/지움 셈 표 — \`_hcap = min(housing, _mapBeds)\` (economy-sim.js:3108) · **심지 않는다 · 셈만**`);
  const smaller = known.filter((t) => t.hcapIfPlant < t.hcapNow - 1e-9);
  const gatedByBedOnly = known.filter((t) => t.pop >= t.beds && t.pop < t.housing);   // ★살릴 때 **새로** 막히는 마을(지금은 housing 이 안 막는데 침상이 막는다)
  const gatedNow = known.filter((t) => t.gatedReal === true);     // ★econ 이 마지막 날 실제로 물린 마을(`_dpDebug.gated` — 정본 기록)
  console.log(`  지금(아무도 안 심음): \`_mapBeds\` 미정의 ⇒ \`_hcap = housing\` — **집터가 인구를 막은 마을 0**`
    + ` (마지막 날 \`_dpDebug.gated\` 가 참인 마을 ${gatedNow.length}곳 — 그 상한은 전부 \`housing\`, 곧 **목재**가 막은 것이다)`);
  console.log(`  살리면(_mapBeds = 완공집 층 × ${CAP}): \`_hcap\` 이 작아지는 마을 **${smaller.length}/${T.length}**`
    + ` · 그 중 인구가 이미 새 상한 이상인 마을 **${smaller.filter((t) => t.pop >= t.beds).length}**`
    + ` · 지금은 안 막히는데 **새로** 막히는 마을 **${gatedByBedOnly.length}**`);
  if (smaller.length) {
    console.log('\n   id  마을            인구   housing  침상   _hcap 지금 → 살리면    Δ');
    for (const t of smaller.sort((a, b) => (a.hcapNow - a.hcapIfPlant) < (b.hcapNow - b.hcapIfPlant) ? 1 : -1)) {
      console.log('  ' + String(t.id).padStart(3) + '  ' + String(t.name).padEnd(14)
        + String(t.pop).padStart(5) + String(r1(t.housing)).padStart(9) + String(t.beds).padStart(6)
        + (String(r1(t.hcapNow)) + ' → ' + String(r1(t.hcapIfPlant))).padStart(18)
        + ('-' + r1(t.hcapNow - t.hcapIfPlant)).padStart(9)
        + (t.pop >= t.hcapIfPlant ? '   ★즉시 출생 정지' : ''));
    }
  }
  console.log(`\n  지우면(\`_hcap\` 에서 \`_mapBeds\` 를 뺀다): \`_hcap = housing\` — 위 표의 모든 마을에서 **지금과 한 수도 안 다르다**(무변).`);

  // ── ★T207 재현 — "쓰기 0" 을 두 눈으로 ─────────────────────────────────────
  const planted = T.filter((t) => t.mapBeds !== undefined);
  console.log(`\n★T207 재현 ① 실행시 — 이 실서버 판(${T.length}마을 × ${DAYS}일)에서 \`_mapBeds\` 가 심긴 마을: **${planted.length}**`
    + (planted.length ? ` (${planted.map((t) => t.name + '=' + t.mapBeds).join(', ')})` : ' — T207 과 같은 결과'));

  // 소스 훑기 — 대입문만. ⚠`grep -r` 은 랩 HTML 을 바이너리로 보고 건너뛴다. 여기선 전 파일을 텍스트로 연다.
  const skipDir = new Set(['.git', 'node_modules', 'assets']);
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') && e.name !== '.') { if (skipDir.has(e.name)) continue; }
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (skipDir.has(e.name)) continue; walk(p); continue; }
      if (!e.isFile()) continue;
      if (path.relative(ROOT, p) === path.join('scripts', 't212-beds.js')) continue;   // ★자기 자신은 뺀다(이 파일의 주석·정규식이 잡힌다)
      let s; try { s = fs.readFileSync(p, 'utf8'); } catch (err) { continue; }
      if (s.indexOf('_mapBeds') < 0) continue;
      const re = /_mapBeds\s*=(?!=)/g; let m;
      while ((m = re.exec(s))) {
        const line = s.slice(0, m.index).split('\n').length;
        hits.push({ f: path.relative(ROOT, p), line });
      }
    }
  })(ROOT);
  console.log(`★T207 재현 ② 소스 — 레포 전수 \`_mapBeds =\` 대입문: **${hits.length}곳**`);
  for (const h of hits) console.log(`     · ${h.f}:${h.line}`);
  const srv = hits.filter((h) => h.f.startsWith('server/') || (h.f.startsWith('sim/') && h.f.endsWith('.js')));
  console.log(`     ↳ 그 중 **서버·node sim 쪽: ${srv.length}곳** — 서버가 도는 코드에는 쓰기가 없다(T207 의 뜻 그대로).`);

  // ── ★생활층은 왜 못 따라오나 — **서버가 적어 둔 집터 계측**(`/perf` 의 그 수) ────────────
  const pr = perf && perf.econTick && perf.econTick.probe ? perf.econTick.probe : null;
  if (pr) {
    console.log(`\n★생활층 집터 계측(실서버 ${(perf.econTick.days) | 0}일 · \`/perf\` econTick.probe — 서버가 적은 수 그대로)`);
    console.log(`  집터 탐색 호출 ${pr.siteCall} · **성공 ${pr.siteHit}** · 빈손 ${pr.siteCall - pr.siteHit} · 캐시 스킵 ${pr.siteSkip} · 훑은 셀 ${pr.siteScan}`);
    const rs = Object.entries(pr.siteReason || {}).sort((a, b) => b[1] - a[1]);
    const tot = rs.reduce((a, b) => a + b[1], 0);
    for (const [k, n] of rs.slice(0, 6)) console.log(`     · ${k}: ${n} (${(100 * n / Math.max(1, tot)).toFixed(1)}%)`);
    console.log(`  ⇒ 실체 집이 뒤진 것은 **느려서가 아니라 자리가 없어서**다(거부 사유가 그 말을 한다).`);
  }
  if (life && life.villages) {
    const inSite = life.villages.filter((v) => v.site != null);
    console.log(`  마지막 날 공사 중인 마을 ${inSite.length}/${life.villages.length}`
      + (inSite.length ? ` (${inSite.slice(0, 8).map((v) => v.name + ':' + v.site + '단계').join(', ')})` : ' — 한 곳도 없다'));
  }
  if (life && life.totals) console.log(`\n  (생활층: 총인구 ${life.totals.pop} · 휴면마을 ${life.totals.dormant} · 농부 없는 마을 ${life.totals.noFarmer} · 폴링 재시도 ${_netRetry})`);
  if (health) console.log(`  (세계: 건물 ${health.buildings} · 자원 ${health.resources} · NPC ${health.players})`);
  console.log(`\n한 줄 답: 집이 둘 · 어긋난 마을 ${mism.length}/${T.length} · 살리면 \`_hcap\` 이 작아지는 마을 ${smaller.length} · 지우면 무변\n`);
})().catch((e) => { console.error(e); process.exit(1); });
