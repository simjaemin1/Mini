#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T533 · 기동 = 두 존 마을 시딩 + 합친 걸음표 워커 ≈ 3~5분 — 러너 편입은 PM)
// === scripts/e2e-xzone-caravan.js — 캐러밴이 존을 넘는다: 두 존 e2e (T533 ④ · e2e-zone-cross 문법) =====================
//
// ★왜 [T533 · ★PM 결정 #456] — T525 가 econ 쪽 뼈대(팔 `T525_CROSS_ZONE` · `world.xzone`)만 세웠고 존 서버는 `world.xzone` 을 안 꽂았다.
//   T533 이 호스트(`server/xzone.js` · villages.js `_xz*`)와 문(`/handoff_prepare` 의 `kind`)과 몸(경계 칸에서 이어 걷기)을 세웠다.
//   이 자는 **실서버 셋**(central + 한반도 + 닛폰 · zone-config 포트 그대로 · 마을 켬 · 팔 켬)을 띄워 그 셋을 잰다.
//
// ★재는 것:
//   ⓐ 호스트 — 두 존이 서로를 이웃으로 알고(zone-config · 새 표 0) **같은 걸음표**를 잰다(쌍·2km 안·경계 마을 수가 거울상) ·
//      표가 오기 전엔 스텁 0 이다(= 끔과 같다).
//   ⓑ 문 — `/handoff_prepare` 에 `kind` 가 없으면 **종전 사람 문**(토큰 없으면 400 'no token' — 글자 그대로) · `army` 는 칸만(ok:false) ·
//      모르는 종류는 400 · 이웃 아닌 존의 `snap` 은 안 받는다. 새 라우트 0(같은 문).
//   ⓒ 몸 — 한반도 캐러밴 하나가 경계 칸에서 **이어 걷는다**: 한반도가 지운 자리(월드 좌표) = 닛폰이 세운 자리(±2px · 존 사각 한 칸 안쪽) ·
//      닛폰 몸이 그 뒤로 **걷는다**(표본 사이 가장 큰 걸음 ≤ 청크 반 — 순간이동 0).
//   ⓓ 한 캐러밴의 왕복 — 한반도 → 닛폰에서 팔고 사고(도착 행) → 닛폰이 돌려보냄 → 한반도가 받아 곳간에 든다(econ 귀환 갈래):
//      넘긴 짐 = 도착 행이 판 짐(약탈 0 · 스텁 쌍엔 길목 갱이 없다) · 돌려보낸 짐 = 도착 행이 산 짐 · 곳간에 든 짐 = 돌려보낸 짐(질량 보존).
//   ⓔ 'arrive' = 'return'(T525 §4 문법) — 한반도가 넘긴 수 = 닛폰이 돌려보낸 수 + 지금 닛폰에 있는 수(양 방향).
//   ⓕ 두 존 로그 예외 0.
//   ⓖ [T952] 받는 존 상인의 머묾 끝 — `T952_XZ_STAY=1` 을 이 자에 주면 두 존에 그대로 넘기고 잰다: 머묾 끝 = 그 마을 장 끝(오늘 장 기록 ·
//      없으면 도착 날 머리 + 4/24 하루) · 그 끝까지 실제로 머문다. 끔(기본)이면 그 셈 칸이 안 선다(null)는 것만 보고 머묾 끝을 표로 찍는다.
//   ⓘ [T1030] 교차 존 장 — `T1030_XZ_MARKET=1` 을 이 자에 주면 두 존에 그대로 넘긴다: 받는 존(닛폰) 교차 존 상인이 그 마을 장 기록에 들고(장 명부) ·
//      머묾 끝 = 장 끝 · 그 끝까지 머문다 · 'return' 의 교역 행 날 = 장이 선 날 + 1(정산은 다음 econ 틱 머리 · 빈손이면 그날). 끔이면 장 칸이 안 선다.
//   ⓗ [T1030] 존 하나가 중간에 죽는다 — 닛폰에 든 한반도 캐러밴 하나가 'return' 을 아직 안 적은 창(켬 = 장 중 · 정산 전 · 끔 = 판 뒤 귀환 구간)에서
//      닛폰 DB 메타 행에 그 캐러밴이 실린 것을 보고 SIGKILL → 같은 DB 로 다시 띄워 그 짐이 한반도 곳간에 드는지 센다(생성 · 소멸).
//      ⓔ 뒤에 돈다(죽인 뒤엔 'arrive' = 'return' 셈이 판 밖이다). `XZ_KILL=0` 이면 건너뛴다.
//
// 실행: node scripts/e2e-xzone-caravan.js     (env: XZ_DAYMS 마을 하루 ms · 기본 3000 · XZ_WAIT_S 왕복 기다림 상한 · 기본 600)
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const CS = require(path.join(ROOT, 'server', 'chunk')).CHUNK_SIZE;
const CPORT = 3010;
const ZIDS = ['hanbando', 'nippon'];
const DAYMS = process.env.XZ_DAYMS || '3000';
const WAIT_S = parseInt(process.env.XZ_WAIT_S || '600', 10);

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._out = ''; p._err = '';
  p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._err += String(b); });
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
const zurl = (z, p) => `http://localhost:${ZONES[z].port}${p}`;
async function perf(z) { try { const j = await (await fetch(zurl(z, '/perf'), { signal: AbortSignal.timeout(10000) })).json(); if (j.xzone) j.xzone.now = j.now; return j.xzone || null; } catch (e) { return null; } }
async function post(z, body) {
  try { const r = await fetch(zurl(z, '/handoff_prepare'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, text: t, json: j }; } catch (e) { return { status: 0, text: String(e.message) }; }
}
const abs = (z, pt) => pt ? { x: pt.x + ZONES[z].worldOffsetX, y: pt.y + (ZONES[z].worldOffsetY || 0) } : null;
const dist = (a, b) => (a && b) ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;

(async () => {
  console.log('\n=== 캐러밴이 존을 넘는다 — 두 존 e2e (T533) ===');
  for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { ok(false, `포트 ${port} 가 비어 있다(남의 서버를 잴 수 없다)`); process.exit(1); }
  const DDIR = `/tmp/e2e-xzc-${process.pid}`; fs.mkdirSync(DDIR, { recursive: true });
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  ok(cu.ok, 'ⓔ0 central 기동', cu.ok ? `${cu.ms}ms` : cu.why);
  //   ★팔 `T525_CROSS_ZONE=1` · 마을 켬 · 하루 `XZ_DAYMS` · 캐러밴 몸 상한은 넉넉히(`VILLAGE_CARAVAN_MAX` — 종전 손잡이 · 넘는 캐러밴이 몸을 갖게) · 야생 끔(속도)
  const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', T525_CROSS_ZONE: '1', VILLAGE_DAY_MS: DAYMS, ENABLED_ZONES: ZIDS.join(','),
    VILLAGE_CARAVAN_MAX: '400', ENABLE_WILDLIFE: '0',
    T952_XZ_STAY: process.env.T952_XZ_STAY || '',   // ★[T952] 이 자에 준 그대로(끔 = 빈 값)
    T1030_XZ_MARKET: process.env.T1030_XZ_MARKET || '',   // ★[T1030] 이 자에 준 그대로(끔 = 빈 값)
    //   ★[T662] 걸음표 한 벌 파일 자리 — 이 판의 임시 폴더(판마다 처음부터 잰다 = 찬 판을 잰다 · 두 존이 같은 자리를 봐야 한 벌을 나눈다)
    T662_GEO_CACHE_DIR: process.env.T662_GEO_CACHE_DIR || `${DDIR}/geo` };
  const ups = {};
  const zenv = (z) => Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${DDIR}/w-${z}.db` }, common);   // ★[T1030 ⓗ] 다시 띄울 때 같은 줄
  for (const z of ZIDS) { const p = boot(z, 'zone.js', zenv(z)); ups[z] = FB.waitUp(p, /zone server up on/, { name: z, capMs: 900000 }); }
  for (const z of ZIDS) { const r = await ups[z]; ok(r.ok, `ⓔ ${z} 존 기동(마을 시딩 포함)`, r.ok ? `${(r.ms / 1000).toFixed(1)}s` : r.why); }

  // ── ⓑ 문 — kind ────────────────────────────────────────────────────────────
  console.log('\n[ⓑ 문 — `/handoff_prepare` 의 `kind` (새 라우트 0)]');
  const p0 = await post('nippon', { name: 'x', x: 1, y: 1 });
  ok(p0.status === 400 && p0.text === 'no token', 'ⓑ1 ★`kind` 없음 = 종전 사람 문 그대로(토큰 없으면 400 no token)', `${p0.status} ${p0.text.slice(0, 40)}`);
  const p1 = await post('nippon', { kind: 'player', name: 'x' });
  ok(p1.status === 400 && p1.text === 'no token', "ⓑ2 `kind:'player'` 도 종전 사람 문", `${p1.status} ${p1.text.slice(0, 40)}`);
  const p2 = await post('nippon', { kind: 'army', zone: 'hanbando' });
  ok(p2.status === 200 && p2.json && p2.json.ok === false && /army/.test(p2.json.why || ''), "ⓑ3 `kind:'army'` = 칸만 예약(받지 않는다 · 셋째 카드)", p2.text.slice(0, 80));
  const p3 = await post('nippon', { kind: 'nope' });
  ok(p3.status === 400, 'ⓑ4 모르는 종류 = 400', `${p3.status}`);
  const p4 = await post('nippon', { kind: 'snap', zone: 'jungwon_n', gday: 1, roster: [{ name: 'x', cx: 1, cy: 1 }], snaps: [] });
  ok(p4.json && p4.json.ok === false, 'ⓑ5 이웃 아닌 존의 `snap` 은 안 받는다', p4.text.slice(0, 80));

  // ── ⓐ 호스트 — 걸음표 ────────────────────────────────────────────────────────
  console.log('\n[ⓐ 호스트 — 이웃 · 합친 걸음표(워커 · 백그라운드)]');
  let H = null, N = null;
  const t0 = Date.now();
  let stub0 = null, pre = 0;   // 표가 서기 전 표본들의 스텁 수(최댓값)
  for (let i = 0; i < 600; i++) {
    H = await perf('hanbando'); N = await perf('nippon');
    if (H && !H.ready.length) { pre++; stub0 = Math.max(stub0 || 0, H.stubs.length); }
    if (N && !N.ready.length) { pre++; stub0 = Math.max(stub0 || 0, N.stubs.length); }
    if (H && N && H.ready.includes('nippon') && N.ready.includes('hanbando')) break;
    await sleep(2000);
  }
  ok(!!H && !!N && H.peers.join() === 'nippon' && N.peers.join() === 'hanbando', 'ⓐ1 두 존이 서로를 이웃으로 안다(zone-config 동서남북 · 켜진 존만)', H && N ? `한반도 → ${H.peers} · 닛폰 → ${N.peers}` : '-');
  const gh = H && H.geo && H.geo.nippon, gn = N && N.geo && N.geo.hanbando;
  ok(!!gh && !!gn, 'ⓐ2 ★두 존 다 합친 걸음표가 섰다(워커 — 틱을 안 막는다)', gh && gn ? `한반도 ${(gh.wallMs / 1000).toFixed(0)}s${gh.cache ? `(${gh.cache})` : ''} · 닛폰 ${(gn.wallMs / 1000).toFixed(0)}s${gn.cache ? `(${gn.cache})` : ''} · 기동 뒤 ${((Date.now() - t0) / 1000).toFixed(0)}s` : '-');
  ok(!!gh && !!gn && gh.pairs === gn.pairs && gh.within === gn.within && gh.mine === gn.theirs && gh.theirs === gn.mine,
    'ⓐ3 ★같은 표(거울상) — 쌍 · 걸어 2km 안 · 경계 마을 이쪽/저쪽', gh && gn ? `쌍 ${gh.pairs}/${gn.pairs} · 2km 안 ${gh.within}/${gn.within}(합친 길 없음 ${gh.withinNoRoute}) · 경계 한반도 ${gh.mine}=${gn.theirs} · 닛폰 ${gh.theirs}=${gn.mine}` : '-');
  ok(pre > 0 && stub0 === 0, 'ⓐ4 표가 오기 전엔 스텁 0(= 끔과 같다)', `표 서기 전 표본 ${pre} · 스텁 최대 ${stub0}`);

  // ── ⓒⓓ 몸 · 왕복 — 한반도 캐러밴 하나를 끝까지 따라간다 ──────────────────────────
  console.log(`\n[ⓒ 몸 — 경계 칸에서 이어 걷는다 · ⓓ 왕복 — 팔고 사고 돌아와 곳간에 든다 (기다림 상한 ${WAIT_S}s)]`);
  let pick = null;         // 한반도 'out'(몸 있음) 추적 대상
  const seenN = new Map();   // 닛폰 몸 표본(열쇠 → [{x,y,t}])
  const mktOf = new Map();   // ★[T1030] 닛폰 econ 캐러밴 id → 장이 선 날(켬만)
  let done = null;
  const tW = Date.now();
  while (Date.now() - tW < WAIT_S * 1000) {
    H = await perf('hanbando'); N = await perf('nippon');
    if (!H || !N) { await sleep(1000); continue; }
    if (!pick) { const o = H.trace.find((t) => t.k === 'out' && t.body && t.at); if (o) pick = o; }
    for (const b of N.bodies) { if (!b.key || !String(b.key).startsWith('xz:hanbando:')) continue; const L = seenN.get(b.key) || []; if (b.x != null) L.push({ x: b.x, y: b.y, t: N.now, prog: b.prog, len: b.len, nom: b.nomPxMs, dep: b.departAt, pend: b.pending, phase: b.phase, lu: b.lu, t952: b.t952, mk: b.mk }); seenN.set(b.key, L); }
    for (const x of (N.caravans || [])) if (x.mktD != null && String(x.id).startsWith('xz:hanbando:')) mktOf.set(String(x.id), x.mktD);   // ★[T1030] 장이 선 날(켬만 칸이 선다)
    if (pick) {
      const home = H.trace.find((t) => t.k === 'home' && t.id === pick.id);
      if (home) { done = home; break; }
    }
    await sleep(500);
  }
  ok(!!pick, 'ⓒ0 전제: 한반도 캐러밴이 **몸을 가진 채** 경계를 넘었다(넘는 순간의 몸 자리가 있다)', pick ? `#${pick.id} → ${pick.to}@${pick.toZone} ${pick.res}×${Math.round(pick.amt)} · 남은 ${pick.remain}일` : '없음');
  const key = pick ? `xz:hanbando:${pick.id}` : null;
  const nin = pick ? N.trace.find((t) => t.k === 'in' && t.key === key) : null;
  const aH = pick ? abs('hanbando', pick.at) : null, aN = nin ? abs('nippon', nin.pt) : null;
  ok(!!nin && dist(aH, aN) <= 2 + 1e-9, 'ⓒ1 ★★한반도가 지운 자리 = 닛폰이 세운 자리(월드 좌표 ±2px — 경계 칸 · 존 사각 한 칸 안쪽)',
    nin ? `한반도 ${aH && `(${aH.x},${aH.y})`} · 닛폰 ${aN && `(${aN.x},${aN.y})`} · 차 ${dist(aH, aN).toFixed(1)}px` : '닛폰 받은 몸 없음');
  //   ⚠하루를 줄인 판(`XZ_DAYMS`)이라 몸은 빠르게 걷는다(남은 거리 ÷ 남은 시간 · Stage 4B) — 걸음 크기로 순간이동을 못 가른다.
  //     순간이동이 아닌 것 = ① 표본 사이 옮긴 거리 ≤ 길 위 진행(길 밖으로 튀지 않는다) ② 진행 ≤ 페이싱 상한(명목 ×4 · villages.js 그 식) × 걸린 시간.
  const ln = key ? (seenN.get(key) || []) : [];
  let moved = 0, offPath = 0, overPace = 0, worst = 0, legs = 0;
  for (let i = 1; i < ln.length; i++) {
    const a = ln[i - 1], b = ln[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y); moved += d;
    if (a.phase !== b.phase || a.dep !== b.dep) { legs++; continue; }   // 구간이 바뀌었다(머묾 → 귀환) — 새 길의 첫 점은 옛 길의 끝(같은 마을)
    const dp = b.prog - a.prog, dt = Math.max(0, b.t - a.t);
    if (d > Math.max(0, dp) + 2) offPath++;
    const cap = (b.nom || 0) * 4 * dt + 2;
    if (dp > cap) overPace++;
    worst = Math.max(worst, cap > 0 ? dp / cap : 0);
  }
  const firstN = ln[0] ? abs('nippon', ln[0]) : null;
  ok(ln.length >= 3 && moved > 0 && offPath === 0 && overPace === 0, `ⓒ2 ★닛폰 몸이 그 자리에서 **걷는다** — 표본마다 길 위(옮긴 거리 ≤ 진행) · 페이싱 상한 안(순간이동 0)`,
    `표본 ${ln.length} · 걸은 ${Math.round(moved)}px · 길 밖 ${offPath} · 상한 넘김 ${overPace}(최대 ${(worst * 100).toFixed(0)}%) · 구간 바뀜 ${legs} · 첫 표본이 경계 칸에서 ${firstN && aN ? Math.round(dist(firstN, aN)) : '-'}px(진행 ${ln[0] ? ln[0].prog : '-'})`);
  // ⓓ 왕복 — 닛폰이 판 행 · 돌려보낸 짐 · 한반도 곳간
  const back = pick ? N.trace.find((t) => t.k === 'back' && t.id === pick.id && t.toZone === 'hanbando') : null;
  ok(!!back, 'ⓓ1 닛폰이 그 캐러밴을 치르고 돌려보냈다(도착 행 · 되사 온 짐)', back ? `${back.lastTo} · 판 ${back.sold ? `${back.sold.res}×${back.sold.amt}` : '없음(빈손)'} · 산 ${back.bought ? `${back.bought.res}×${back.bought.amt}` : '-'} · 남은 ${back.remain}일` : '-');
  const soldOk = back && (back.abandoned ? (back.res === pick.res && Math.abs(back.amt - pick.amt) < 1e-6) : (back.sold && back.sold.res === pick.res && Math.abs(back.sold.amt - pick.amt) < 0.01));
  ok(!!soldOk, 'ⓓ2 ★넘긴 짐 = 닛폰 도착 행이 판 짐(빈손이면 그대로 되가져옴 · 약탈 0)', back ? `넘김 ${pick.res}×${pick.amt.toFixed(2)} · ${back.abandoned ? `되가져옴 ${back.res}×${(back.amt || 0).toFixed(2)}` : `판 ${back.sold && back.sold.res}×${back.sold && back.sold.amt}`}` : '-');
  //   ★[T578 추신] 도착 행이 아무것도 안 샀으면(살 것이 없었다 · 판 값만 남는다) 돌려보낸 짐도 없다 — 그것도 같은 뜻이다(질량은 ⓓ5 가 잰다).
  const boughtOk = back && (back.abandoned || (back.bought && back.bought.res === back.res && Math.abs(back.bought.amt - back.amt) < 0.01)
    || (!back.bought && !back.res && !((back.amt || 0) > 0)));
  ok(!!boughtOk, 'ⓓ3 돌려보낸 짐 = 도착 행이 산 짐', back ? `${back.res}×${(back.amt || 0).toFixed(2)} · 행 ${back.bought ? `${back.bought.res}×${back.bought.amt}` : '-'}` : '-');
  const hin = pick ? H.trace.find((t) => t.k === 'in' && t.back && t.key === pick.id) : null;
  const aBackN = back && back.at ? abs('nippon', back.at) : null, aBackH = hin ? abs('hanbando', hin.pt) : null;
  ok(!!hin && (!back || !back.body || dist(aBackN, aBackH) <= 2 + 1e-9), 'ⓓ4 돌아오는 몸도 경계 칸에서 이어 걷는다(닛폰이 지운 자리 = 한반도가 세운 자리)',
    hin ? `닛폰 ${aBackN ? `(${aBackN.x},${aBackN.y})` : '(몸 없음)'} · 한반도 (${aBackH.x},${aBackH.y}) · 차 ${aBackN ? dist(aBackN, aBackH).toFixed(1) : '-'}px · 경계까지 걸음 ${(back && back.walked) || '바로'}` : '한반도 받은 몸 없음');
  ok(!!done && back && done.res === back.res && Math.abs(done.amt - back.amt) < 1e-9, 'ⓓ5 ★★한반도 곳간에 들었다 — econ 귀환 갈래가 돌려보낸 짐 그대로(질량 보존)',
    done ? `#${pick.id} ${done.res}×${(done.amt || 0).toFixed(2)}${done.abandoned ? ' (빈손 귀환)' : ''} · 기다림 ${((Date.now() - tW) / 1000).toFixed(0)}s` : `기다림 ${((Date.now() - tW) / 1000).toFixed(0)}s 안에 안 끝났다`);

  // ── ⓖ [T952] 받는 존 상인의 머묾 끝 ────────────────────────────────────────────
  {
    const ON = process.env.T952_XZ_STAY === '1';
    console.log(`\n[ⓖ T952 — 받는 존(닛폰) 교차 존 상인의 머묾 끝 · ${ON ? '켬' : '끔'}]`);
    //   머묾은 하루의 1/24 ~ 4/24(이 판 125 ~ 500ms)라 500ms 표본이 놓칠 수 있다 — 머문 몸을 하나 볼 때까지 100ms 로 더 본다(상한 120초 · 값은 안 바꾼다)
    const lingerS = () => { const a = []; for (const [k, L] of seenN) for (let i = 0; i < L.length; i++) if (L[i].phase === 'linger') a.push({ k, i, s: L[i], next: L.slice(i + 1).find((q) => q.phase !== 'linger') || null }); return a; };
    const tX = Date.now();
    while (Date.now() - tX < 120000 && (lingerS().length === 0 || lingerS().every((q) => !q.next))) {
      const Nn = await perf('nippon'); if (Nn) for (const b of Nn.bodies) { if (!b.key || !String(b.key).startsWith('xz:hanbando:')) continue; const L = seenN.get(b.key) || []; if (b.x != null) L.push({ x: b.x, y: b.y, t: Nn.now, prog: b.prog, len: b.len, phase: b.phase, lu: b.lu, t952: b.t952, mk: b.mk }); seenN.set(b.key, L); }
      await sleep(100);
    }
    const S = lingerS(), dm = +DAYMS;
    const keys = [...new Set(S.map((q) => q.k))];
    ok(S.length > 0, 'ⓖ0 [전제] 받는 존에서 머무는(phase linger) 교차 존 상인을 실제로 봤다(0 이면 아래가 자명 통과다)', `몸 ${keys.length} · 표본 ${S.length}`);
    const rows = keys.map((k) => { const q = S.find((x) => x.k === k), t = q.s.t952; return { k, lu: q.s.lu, t952: t, stayMs: t ? q.s.lu - t.at : null, left: q.next ? q.next.t : null }; });
    if (ON) {
      const bad = rows.filter((r) => !(r.t952 && r.lu === r.t952.end && (r.t952.joined || Math.abs(r.t952.end - (r.t952.d0 + dm * 4 / 24)) < 1e-6)));
      ok(rows.length > 0 && bad.length === 0, 'ⓖ1 ★켬 — 머묾 끝 = 그 마을 장 끝(오늘 장 기록의 끝 · 없으면 도착 날 머리 + 4/24 하루 · 새 수 0)', `${rows.length - bad.length}/${rows.length}` + (bad.length ? ` · 어긋남 ${JSON.stringify(bad[0])}` : ''));
      const gone = rows.filter((r) => r.left != null), early = gone.filter((r) => r.left < r.lu);
      ok(gone.length > 0 && early.length === 0, 'ⓖ2 ★그 끝까지 머문다 — 머묾이 끝난 첫 표본의 시각 ≥ 머묾 끝(일찍 안 떠난다)', `떠난 몸 ${gone.length} · 일찍 ${early.length}`);
      const longer = rows.filter((r) => r.stayMs != null && r.stayMs > dm / 24 + 1e-6);
      ok(longer.length > 0, 'ⓖ3 자명 통과 금지 — 적어도 한 몸은 종전 1게임시간보다 오래 머문다(장 끝이 1시간보다 먼 도착)', `${longer.length}/${rows.length} · 머묾 ${rows.map((r) => r.stayMs == null ? '-' : Math.round(r.stayMs)).join(' · ')}ms(1시간 = ${Math.round(dm / 24)})`);
    } else {
      ok(rows.length > 0 && rows.every((r) => r.t952 === null), 'ⓖ1 끔 — T952 셈 칸이 안 선다(무동작 · 머묾은 종전 1게임시간)', `${rows.filter((r) => r.t952 === null).length}/${rows.length}`);
    }
    console.log(`  · [표 · T952] 머묾 끝 − 그 몸 첫 머묾 표본: ${rows.map((r) => { const q = S.find((x) => x.k === r.k); return Math.round(r.lu - q.s.t); }).join(' · ')}ms`);
  }

  // ── ⓘ [T1030] 교차 존 장 ─────────────────────────────────────────────────────
  {
    const ON = process.env.T1030_XZ_MARKET === '1', dm = +DAYMS;
    console.log(`\n[ⓘ T1030 — 받는 존(닛폰) 교차 존 상인이 장을 연다 · ${ON ? '켬' : '끔'}]`);
    const firstL = new Map();   // 몸마다 첫 머묾 표본 · 그 뒤 첫 머묾 아닌 표본
    for (const [k, L] of seenN) { const i = L.findIndex((q) => q.phase === 'linger'); if (i >= 0) firstL.set(k, { s: L[i], next: L.slice(i + 1).find((q) => q.phase !== 'linger') || null }); }
    const rows = [...firstL].map(([k, q]) => ({ k, lu: q.s.lu, mk: q.s.mk, t: q.s.t, left: q.next ? q.next.t : null }));
    ok(rows.length > 0, 'ⓘ0 [전제] 받는 존에서 머무는 교차 존 상인을 봤다(0 이면 아래가 자명 통과다)', `몸 ${rows.length}`);
    if (ON) {
      const inMk = rows.filter((r) => r.mk && r.lu === r.mk.end);
      ok(rows.length > 0 && inMk.length === rows.length, 'ⓘ1 ★켬 — 그 마을 장 기록(장 명부)에 든다 · 머묾 끝 = 장 끝', `${inMk.length}/${rows.length}` + (inMk.length < rows.length ? ` · 어긋남 ${JSON.stringify(rows.find((r) => !(r.mk && r.lu === r.mk.end)))}` : ''));
      const gone = rows.filter((r) => r.left != null), early = gone.filter((r) => r.left < r.lu);
      ok(gone.length > 0 && early.length === 0, 'ⓘ2 ★장 끝까지 선다 — 머묾이 끝난 첫 표본 시각 ≥ 머묾 끝(일찍 안 떠난다)', `떠난 몸 ${gone.length} · 일찍 ${early.length}`);
      const longer = rows.filter((r) => r.mk && r.mk.ls != null && r.lu - r.mk.ls > dm / 24 + 1e-6);   // 머묾 = 장 끝 − 머묾을 연 시각(서버 덤프 `mk.ls`)
      ok(longer.length > 0, 'ⓘ3 자명 통과 금지 — 적어도 한 몸은 종전 1게임시간보다 오래 머문다(장 끝 − 머묾을 연 시각)', `${longer.length}/${rows.length}`);
      const md = pick ? mktOf.get(`xz:hanbando:${pick.id}`) : undefined;
      const want = (back && md != null) ? (back.abandoned ? md : md + 1) : null;
      ok(!!back && md != null && back.rowDay === want, "ⓘ4 ★'return' 의 교역 행 날 = 장이 선 날 + 1(다음 econ 틱 머리 정산 · 빈손이면 그날) — 값은 ⓓ 가 잰 같은 계약", back ? `장 날 ${md} · 행 날 ${back.rowDay}${back.abandoned ? ' (빈손)' : ''}` : '-');
    } else {
      ok(rows.length > 0 && rows.every((r) => r.mk === undefined) && (!back || back.rowDay === undefined), 'ⓘ1 끔 — 장 칸이 안 선다(덤프 `mk` · `rowDay` 없음 · 종전 계약)', `${rows.filter((r) => r.mk === undefined).length}/${rows.length}`);
    }
    console.log(`  · [표 · T1030] 몸 ${rows.length} — 머묾(장 끝 − 머묾을 연 시각 · ms · 1시간 = ${Math.round(dm / 24)} · 끔은 칸 없음): ${rows.map((r) => (r.mk && r.mk.ls != null) ? Math.round(r.lu - r.mk.ls) : '-').join(' · ')} · 장 명부(주민 수): ${rows.map((r) => r.mk ? r.mk.at : '-').join(' · ')} · 머묾 끝 − 첫 머묾 표본(ms): ${rows.map((r) => Math.round(r.lu - r.t)).join(' · ')}`);
  }

  // ── ⓔ 'arrive' = 'return' ────────────────────────────────────────────────────
  console.log("\n[ⓔ 'arrive' = 'return' (양 방향 · 판 끝 이동 중 포함)]");
  //   한반도가 넘긴 수 = 닛폰이 받은 수 · 닛폰이 받은 수 = 닛폰이 돌려보낸 수 + 지금 닛폰에 있는 수(econ 캐러밴 + 다음 경계를 기다리는 기록 줄)
  //   ⚠관측이 하루 마감 한가운데(조각 사이)나 문 왕복 사이에 걸리면 한 쪽만 셌을 수 있다 — 같아질 때까지 몇 번 다시 본다(값을 고치지 않는다).
  //   ★[T598 추신] "지금 그 존에 있는 것" = econ 캐러밴 + 기록이 선 세 칸(`core.live()` · 종류별 · 지금 값):
  //     받은 'arrive' 가 아직 줄에(`pendArrive`) · econ 이 읽기 전 인박스에(`inboxArrive` — dayIn 과 econ 캐러밴 조각 사이) ·
  //     econ 이 치러 'return' 을 적었으나 dayOut 이 아직 안 셌다(`outReturn` — econ 과 dayOut 사이). 종전 셈은 앞 둘을 `st.pend`(dayIn 순간 값 ·
  //     두 종류 합)로만 봤고 셋째를 못 봤다 — 하루 마감이 조각으로 여러 프레임에 걸치면 `/perf` 가 그 사이에 닿는다.
  const inZ = (P, home) => (P.caravans || []).filter((x) => x.home && x.home.zone === home).length;
  const slotOf = (P) => { const L = P.live || {}; return (L.pendArrive | 0) + (L.inboxArrive | 0) + (L.outReturn | 0); };
  let E = null;
  for (let i = 0; i < 20; i++) {
    H = await perf('hanbando'); N = await perf('nippon');
    const inN = inZ(N, 'hanbando'), inH = inZ(H, 'nippon');
    E = { inN, inH, LN: N.live || {}, LH: H.live || {},
      e1: H.st.crossArrive === N.core.arriveIn, e2: N.core.arriveIn === N.core.returnOut + inN + slotOf(N),
      e3: N.st.crossArrive === H.core.arriveIn, e4: H.core.arriveIn === H.core.returnOut + inH + slotOf(H) };
    if (E.e1 && E.e2 && E.e3 && E.e4) break;
    await sleep(300);
  }
  //   ★[T598 추신 ①] 확인 표 — 판 끝에 `/perf` 를 촘촘히(60번 · 100ms) 보며 종전 셈(`st.pend`)과 새 셈(세 칸)이 각각 몇 번 어긋나는지 ·
  //     종전 셈이 어긋난 순간 기록이 어느 칸에 있었는지 센다(값은 안 고친다 · 자의 셈만).
  const PR = { n: 0, oldBad: 0, newBad: 0, inbox: 0, out: 0, pendLate: 0 };
  for (let i = 0; i < 60; i++) {
    const h = await perf('hanbando'), nn = await perf('nippon');
    for (const [P, home] of [[nn, 'hanbando'], [h, 'nippon']]) {
      PR.n++;
      const inC = inZ(P, home), L = P.live || {};
      const oldOk = P.core.arriveIn === P.core.returnOut + inC + P.core.pend, newOk = P.core.arriveIn === P.core.returnOut + inC + slotOf(P);
      if (!oldOk) { PR.oldBad++; if (L.inboxArrive) PR.inbox++; if (L.outReturn) PR.out++; if ((L.pendArrive | 0) !== (P.core.pend | 0)) PR.pendLate++; }
      if (!newOk) PR.newBad++;
    }
    await sleep(100);
  }
  if (!(E.e1 && E.e2 && E.e3 && E.e4)) {   // ★[T578 추신] 셈이 안 맞으면 그 순간의 두 존 줄을 남긴다(이동 중을 놓친 자리를 표로 — 값은 안 고친다)
    const dumpZ = (z, P) => { console.log(`  · [ⓔ 진단 ${z}] core ${JSON.stringify(P.core)} · st ${JSON.stringify(P.st)}`);
      console.log(`  · [ⓔ 진단 ${z}] 캐러밴 ${JSON.stringify((P.caravans || []).filter((x) => x.home).map((x) => [x.id, x.state, x.to, x.home && x.home.zone, x.back, x.xback]))}`);
      console.log(`  · [ⓔ 진단 ${z}] 몸 ${JSON.stringify((P.bodies || []).map((b) => [b.key, b.phase, b.pending, b.handing]))}`);
      console.log(`  · [ⓔ 진단 ${z}] 흔적 끝 ${JSON.stringify((P.trace || []).slice(-30).map((t) => [t.k, t.id || t.key, t.g, t.day, t.toZone || t.fromZone || null]))}`); };
    dumpZ('hanbando', H); dumpZ('nippon', N);
    console.log(`  · [ⓔ 진단] 칸(지금) 한반도 ${JSON.stringify(H.live)} · 닛폰 ${JSON.stringify(N.live)}`);
  }
  ok(E.e1, "ⓔ1 한반도가 넘긴 'arrive' = 닛폰이 받은 'arrive'", `${H.st.crossArrive} = ${N.core.arriveIn}`);
  ok(E.e2, "ⓔ2 ★닛폰이 받은 'arrive' = 돌려보낸 'return' + 지금 닛폰에 있는 것", `${N.core.arriveIn} = ${N.core.returnOut} + 이동 중(캐러밴 ${E.inN} · 줄 ${E.LN.pendArrive | 0} · 인박스 ${E.LN.inboxArrive | 0} · 셀 귀환 ${E.LN.outReturn | 0})`);
  ok(E.e3, "ⓔ3 닛폰이 넘긴 'arrive' = 한반도가 받은 'arrive'(반대 방향)", `${N.st.crossArrive} = ${H.core.arriveIn}`);
  ok(E.e4, "ⓔ4 한반도가 받은 'arrive' = 돌려보낸 'return' + 지금 한반도에 있는 것", `${H.core.arriveIn} = ${H.core.returnOut} + 이동 중(캐러밴 ${E.inH} · 줄 ${E.LH.pendArrive | 0} · 인박스 ${E.LH.inboxArrive | 0} · 셀 귀환 ${E.LH.outReturn | 0})`);
  console.log(`  · [표 · T598 추신] 판 끝 관측 ${PR.n}번(두 존 × 60) — 종전 셈(st.pend) 어긋남 ${PR.oldBad} · 새 셈(세 칸) 어긋남 ${PR.newBad} · 종전 어긋남 때 기록이 인박스에 ${PR.inbox} · 셀 귀환(out)에 ${PR.out} · 줄 값이 늦음(st.pend ≠ 지금 줄) ${PR.pendLate}`);
  ok(H.st.sentFail === 0 && N.st.sentFail === 0 && H.st.bounced === 0 && N.st.bounced === 0, 'ⓔ5 문이 다 받았다(되돌림 0 · 못 보냄 0)', `한반도 ${H.st.sentOk}/${H.st.sent} · 닛폰 ${N.st.sentOk}/${N.st.sent}`);
  console.log(`  · [표] 한반도 넘김 ${H.st.crossArrive} · 돌려보냄 ${H.st.crossReturn}(경계 교역 성사 ${H.st.soldOk}) · 곳간 ${H.st.deposited} · 잃음 ${H.st.lost} · 몸 넘김 ${H.st.bodyOut} · 받은 몸 ${H.st.bodyIn} · econ 날 ${H.day}`);
  console.log(`  · [표 · T578 추신] 경계 칸까지 걸어간 뒤 넘김 — 한반도 ${H.st.walkWait | 0}(하루 넘겨 그 자리 ${H.st.walkWaitLate | 0}) · 닛폰 ${N.st.walkWait | 0}(${N.st.walkWaitLate | 0})`);
  console.log(`  · [표] 닛폰 넘김 ${N.st.crossArrive} · 돌려보냄 ${N.st.crossReturn}(경계 교역 성사 ${N.st.soldOk}) · 곳간 ${N.st.deposited} · 잃음 ${N.st.lost} · 몸 넘김 ${N.st.bodyOut} · 받은 몸 ${N.st.bodyIn} · econ 날 ${N.day}`);

  // ── ⓗ [T1030] 존 하나가 중간에 죽는다 ─────────────────────────────────────────
  if (process.env.XZ_KILL !== '0') {
    const ON = process.env.T1030_XZ_MARKET === '1', dm = +DAYMS;
    console.log(`\n[ⓗ T1030 — 받는 존(닛폰)이 'return' 전 창에서 죽는다(SIGKILL) · 다시 뜬다 · ${ON ? '켬(장 중 · 정산 전)' : '끔(판 뒤 · 귀환 구간)'}]`);
    const { DatabaseSync } = require('node:sqlite');
    const meta = () => { let db = null; try { db = new DatabaseSync(`${DDIR}/w-nippon.db`, { readOnly: true }); const r = db.prepare('SELECT data FROM world_meta WHERE zone = ?').get('nippon'); return r ? JSON.parse(r.data) : null; } catch (e) { return null; } finally { try { db && db.close(); } catch (e) {} } };
    const inWin = (x, day) => ON ? (x.mkt != null) : (x.state === 'inbound' && x.xback != null && x.xback > day);
    let tgt = null, Mrow = null, preN = null, preH = null;
    const tK = Date.now();
    while (!tgt && Date.now() - tK < WAIT_S * 1000) {
      const Nn = await perf('nippon');
      if (Nn) for (const x of (Nn.caravans || [])) if (String(x.id).startsWith('xz:hanbando:') && inWin(x, Nn.day)) {
        //   그 캐러밴이 닛폰 DB 메타 행에 같은 창의 꼴로 실렸나(켬 = 정산 전 `_t707` · 끔 = 귀환 구간) — 실린 뒤에 죽인다(실리기 전이면 다음 경계까지 본다)
        for (let i = 0; i < 40 && !tgt; i++) {
          const M = meta(), mc = M && (M.caravans || []).find((q) => q.id === x.id);
          if (mc && (ON ? !!mc._t707 : (mc.state === 'inbound' && !mc._done && !mc._xzHandedBack))) { tgt = x; Mrow = { day: M.anchor && M.anchor.day, t707: !!mc._t707, state: mc.state, ret: mc._returningAmt || 0, from: typeof mc.from === 'object' ? 'stub' : mc.from }; }
          else await sleep(50);
        }
        if (tgt) { preN = Nn; break; }
      }
      if (!tgt) await sleep(200);
    }
    ok(!!tgt, 'ⓗ0 [전제] 창 안의 한반도 캐러밴이 닛폰 DB 메타 행에 실렸다(실린 뒤 죽인다)', tgt ? `${tgt.id} → ${tgt.to} ${tgt.res}×${(tgt.amt || 0).toFixed(2)} · 메타 날 ${Mrow.day} · ${JSON.stringify(Mrow)}` : '없음');
    if (tgt) {
      const hid = +String(tgt.id).split(':').pop();
      preH = await perf('hanbando');
      const zp = procs.find((p) => p._name === 'nippon' && !p._dead);
      zp._dead = true; zp.kill('SIGKILL');
      const tKill = Date.now();
      const preBack = (preN.trace || []).filter((t) => t.k === 'back' && t.id === hid).length, preIn = ((preH && preH.trace) || []).filter((t) => t.k === 'in' && t.back && t.key === hid).length;
      ok(preBack === 0 && preIn === 0, "ⓗ1 죽인 순간 — 닛폰이 그 캐러밴의 'return' 을 아직 안 적었다 · 한반도가 안 받았다", `닛폰 back ${preBack} · 한반도 in ${preIn}`);
      await sleep(1500);
      const p2 = boot('nippon', 'zone.js', zenv('nippon'));
      const u2 = await FB.waitUp(p2, /zone server up on/, { name: 'nippon', capMs: 900000 });
      ok(u2.ok, 'ⓗ2 닛폰 다시 뜸(같은 DB)', u2.ok ? `${(u2.ms / 1000).toFixed(1)}s` : u2.why);
      const m728 = /\[T728\] 재기동 영속 — [^\n]*?캐러밴 (\d+)(?: · 못 이은 (\d+))?/.exec(p2._out);
      const lost = m728 ? +(m728[2] || 0) : null;
      //   한반도 곳간에 들 때까지(켬) · 끔은 걸음표가 다시 서고 그 캐러밴 귀환 날을 넘긴 뒤 하루씩 넷 더 본다
      let home = null, N2 = null, H2 = null, until = Date.now() + WAIT_S * 1000, ready = null;
      while (Date.now() < until) {
        H2 = await perf('hanbando'); N2 = await perf('nippon');
        if (H2) home = (H2.trace || []).find((t) => t.k === 'home' && t.id === hid) || null;
        if (home) break;
        if (N2 && N2.ready && N2.ready.includes('hanbando') && ready == null) { ready = Date.now(); until = Math.min(until, ready + Math.max(4, (tgt.xback || 0) - (tgt.depart || 0) + 4) * dm + 20000); }
        await sleep(500);
      }
      const backs = N2 ? (N2.trace || []).filter((t) => t.k === 'back' && t.id === hid) : [];
      const homes = H2 ? (H2.trace || []).filter((t) => t.k === 'home' && t.id === hid) : [];
      const hc = H2 ? (H2.caravans || []).find((x) => x.id === hid) : null;
      const sent = tgt.amt || 0, retAmt = backs[0] ? (backs[0].amt || 0) : 0;
      const made = Math.max(0, homes.length - 1) * retAmt + Math.max(0, backs.length - 1) * retAmt;
      const goneAmt = homes.length ? Math.abs((homes[0].amt || 0) - retAmt) : (backs.length ? retAmt : (Mrow.ret || null));
      console.log(`  · [표 · T1030 ⓗ] | 판 | 죽인 창 | 넘긴 짐 | 닛폰 다시 뜸: 이은 캐러밴 · 못 이은 | 닛폰 'return'(판 짐 · 돌려보낸 짐) | 한반도 곳간 | 한반도 그 캐러밴 | 생성 | 소멸 |`);
      console.log(`  · [표 · T1030 ⓗ] | ${ON ? '켬' : '끔'} | ${ON ? '장 중(정산 전)' : '판 뒤(귀환 구간)'} | ${tgt.res}×${sent.toFixed(2)} | ${m728 ? `${m728[1]} · ${lost}` : '-'} | ${backs.length ? backs.map((b) => `${b.sold ? `${b.sold.res}×${b.sold.amt}` : '-'} · ${b.res}×${(b.amt || 0).toFixed(2)}`).join(' / ') : '없음'} | ${homes.length ? homes.map((h) => `${h.res}×${(h.amt || 0).toFixed(2)}`).join(' / ') : '안 듦'} | ${hc ? hc.state : '없음(끝남)'} | ${made.toFixed(2)} | ${goneAmt == null ? '?' : (+goneAmt).toFixed(2)} |`);
      console.log(`  · [표 · T1030 ⓗ] 죽인 뒤 닛폰 다시 뜨기 ${((Date.now() - tKill) / 1000).toFixed(0)}s 안 · 걸음표 다시 ${ready ? `${((ready - tKill) / 1000).toFixed(0)}s` : '안 섬'}`);
      if (ON) {
        ok(lost === 0, 'ⓗ3 ★켬 — 다시 뜬 닛폰이 이웃 존 캐러밴을 잇는다(메타 행 · 못 이은 0)', m728 ? m728[0].slice(0, 120) : 'T728 줄 없음');
        ok(backs.length === 1 && backs[0].sold && backs[0].sold.res === tgt.res && Math.abs(backs[0].sold.amt - sent) < 0.01, "ⓗ4 ★켬 — 다시 뜬 닛폰이 한 번 정산해 'return' 하나(판 짐 = 넘긴 짐)", backs.map((b) => JSON.stringify(b.sold)).join(' · ') || '없음');
        ok(homes.length === 1 && Math.abs((homes[0].amt || 0) - retAmt) < 1e-9 && made === 0, 'ⓗ5 ★★켬 — 한반도 곳간에 하나 든다 = 돌려보낸 짐(생성 0 · 소멸 0)', homes.length ? `${homes[0].res}×${(homes[0].amt || 0).toFixed(4)} = ${retAmt.toFixed(4)}` : '안 듦');
      } else {
        ok(lost != null && lost >= 1 && homes.length === 0, "ⓗ3 끔 — 종전: 다시 뜬 닛폰이 이웃 존 캐러밴을 못 잇는다(못 이은 ≥ 1) · 한반도 곳간에 안 든다(그 짐 소멸 — T533 §6-4 '재기동 = 잃음')",
          `못 이은 ${lost} · 한반도 그 캐러밴 ${hc ? hc.state : '없음'} · 소멸 ${goneAmt == null ? '?' : (+goneAmt).toFixed(2)}`);
      }
    }
  }

  // ── ⓕ 오류 ─────────────────────────────────────────────────────────────────
  const zerr = procs.filter((p) => ZIDS.includes(p._name)).map((p) => [p._name, p._out.split('\n').filter((l) => /(^|\s)(TypeError|ReferenceError)\b|Cannot read|is not a function/.test(l)).length + p._err.split('\n').filter((l) => /^\s+at\s+\S/.test(l)).length]);
  ok(zerr.every(([, n]) => n === 0), 'ⓕ 두 존 로그에 예외 0', zerr.map(([z, n]) => `${z} ${n}`).join(' · '));
  const OUT = process.env.XZ_SHOTS || '/tmp/e2e-xzone-caravan';
  fs.mkdirSync(OUT, { recursive: true });
  for (const p of procs) { try { fs.writeFileSync(path.join(OUT, `${p._name}.log`), p._out + '\n--- stderr ---\n' + p._err); } catch (e) {} }
  try { fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify({ hanbando: H, nippon: N, pick, nin, back, hin, done, samples: ln }, null, 1)); } catch (e) {}
  killAll(); try { fs.rmSync(DDIR, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); killAll(); process.exit(1); });
