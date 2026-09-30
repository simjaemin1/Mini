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
    VILLAGE_CARAVAN_MAX: '400', ENABLE_WILDLIFE: '0' };
  const ups = {};
  for (const z of ZIDS) { const p = boot(z, 'zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${DDIR}/w-${z}.db` }, common)); ups[z] = FB.waitUp(p, /zone server up on/, { name: z, capMs: 900000 }); }
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
  ok(!!gh && !!gn, 'ⓐ2 ★두 존 다 합친 걸음표가 섰다(워커 — 틱을 안 막는다)', gh && gn ? `한반도 ${(gh.wallMs / 1000).toFixed(0)}s · 닛폰 ${(gn.wallMs / 1000).toFixed(0)}s · 기동 뒤 ${((Date.now() - t0) / 1000).toFixed(0)}s` : '-');
  ok(!!gh && !!gn && gh.pairs === gn.pairs && gh.within === gn.within && gh.mine === gn.theirs && gh.theirs === gn.mine,
    'ⓐ3 ★같은 표(거울상) — 쌍 · 걸어 2km 안 · 경계 마을 이쪽/저쪽', gh && gn ? `쌍 ${gh.pairs}/${gn.pairs} · 2km 안 ${gh.within}/${gn.within}(합친 길 없음 ${gh.withinNoRoute}) · 경계 한반도 ${gh.mine}=${gn.theirs} · 닛폰 ${gh.theirs}=${gn.mine}` : '-');
  ok(pre > 0 && stub0 === 0, 'ⓐ4 표가 오기 전엔 스텁 0(= 끔과 같다)', `표 서기 전 표본 ${pre} · 스텁 최대 ${stub0}`);

  // ── ⓒⓓ 몸 · 왕복 — 한반도 캐러밴 하나를 끝까지 따라간다 ──────────────────────────
  console.log(`\n[ⓒ 몸 — 경계 칸에서 이어 걷는다 · ⓓ 왕복 — 팔고 사고 돌아와 곳간에 든다 (기다림 상한 ${WAIT_S}s)]`);
  let pick = null;         // 한반도 'out'(몸 있음) 추적 대상
  const seenN = new Map();   // 닛폰 몸 표본(열쇠 → [{x,y,t}])
  let done = null;
  const tW = Date.now();
  while (Date.now() - tW < WAIT_S * 1000) {
    H = await perf('hanbando'); N = await perf('nippon');
    if (!H || !N) { await sleep(1000); continue; }
    if (!pick) { const o = H.trace.find((t) => t.k === 'out' && t.body && t.at); if (o) pick = o; }
    for (const b of N.bodies) { if (!b.key || !String(b.key).startsWith('xz:hanbando:')) continue; const L = seenN.get(b.key) || []; if (b.x != null) L.push({ x: b.x, y: b.y, t: N.now, prog: b.prog, len: b.len, nom: b.nomPxMs, dep: b.departAt, pend: b.pending, phase: b.phase }); seenN.set(b.key, L); }
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
  const boughtOk = back && (back.abandoned || (back.bought && back.bought.res === back.res && Math.abs(back.bought.amt - back.amt) < 0.01));
  ok(!!boughtOk, 'ⓓ3 돌려보낸 짐 = 도착 행이 산 짐', back ? `${back.res}×${(back.amt || 0).toFixed(2)} · 행 ${back.bought ? `${back.bought.res}×${back.bought.amt}` : '-'}` : '-');
  const hin = pick ? H.trace.find((t) => t.k === 'in' && t.back && t.key === pick.id) : null;
  const aBackN = back && back.at ? abs('nippon', back.at) : null, aBackH = hin ? abs('hanbando', hin.pt) : null;
  ok(!!hin && (!back || !back.body || dist(aBackN, aBackH) <= 2 + 1e-9), 'ⓓ4 돌아오는 몸도 경계 칸에서 이어 걷는다(닛폰이 지운 자리 = 한반도가 세운 자리)',
    hin ? `닛폰 ${aBackN ? `(${aBackN.x},${aBackN.y})` : '(몸 없음)'} · 한반도 (${aBackH.x},${aBackH.y}) · 차 ${aBackN ? dist(aBackN, aBackH).toFixed(1) : '-'}px` : '한반도 받은 몸 없음');
  ok(!!done && back && done.res === back.res && Math.abs(done.amt - back.amt) < 1e-9, 'ⓓ5 ★★한반도 곳간에 들었다 — econ 귀환 갈래가 돌려보낸 짐 그대로(질량 보존)',
    done ? `#${pick.id} ${done.res}×${(done.amt || 0).toFixed(2)}${done.abandoned ? ' (빈손 귀환)' : ''} · 기다림 ${((Date.now() - tW) / 1000).toFixed(0)}s` : `기다림 ${((Date.now() - tW) / 1000).toFixed(0)}s 안에 안 끝났다`);

  // ── ⓔ 'arrive' = 'return' ────────────────────────────────────────────────────
  console.log("\n[ⓔ 'arrive' = 'return' (양 방향 · 판 끝 이동 중 포함)]");
  //   한반도가 넘긴 수 = 닛폰이 받은 수 · 닛폰이 받은 수 = 닛폰이 돌려보낸 수 + 지금 닛폰에 있는 수(econ 캐러밴 + 다음 경계를 기다리는 기록 줄)
  //   ⚠관측이 하루 마감 한가운데(조각 사이)나 문 왕복 사이에 걸리면 한 쪽만 셌을 수 있다 — 같아질 때까지 몇 번 다시 본다(값을 고치지 않는다).
  let E = null;
  for (let i = 0; i < 20; i++) {
    H = await perf('hanbando'); N = await perf('nippon');
    const inN = (N.caravans || []).filter((x) => x.home && x.home.zone === 'hanbando').length, inH = (H.caravans || []).filter((x) => x.home && x.home.zone === 'nippon').length;
    E = { inN, inH, pendN: N.core.pend, pendH: H.core.pend,
      e1: H.st.crossArrive === N.core.arriveIn, e2: N.core.arriveIn === N.core.returnOut + inN + N.core.pend,
      e3: N.st.crossArrive === H.core.arriveIn, e4: H.core.arriveIn === H.core.returnOut + inH + H.core.pend };
    if (E.e1 && E.e2 && E.e3 && E.e4) break;
    await sleep(300);
  }
  ok(E.e1, "ⓔ1 한반도가 넘긴 'arrive' = 닛폰이 받은 'arrive'", `${H.st.crossArrive} = ${N.core.arriveIn}`);
  ok(E.e2, "ⓔ2 ★닛폰이 받은 'arrive' = 돌려보낸 'return' + 지금 닛폰에 있는 것", `${N.core.arriveIn} = ${N.core.returnOut} + 이동 중(캐러밴 ${E.inN} · 기록 줄 ${E.pendN})`);
  ok(E.e3, "ⓔ3 닛폰이 넘긴 'arrive' = 한반도가 받은 'arrive'(반대 방향)", `${N.st.crossArrive} = ${H.core.arriveIn}`);
  ok(E.e4, "ⓔ4 한반도가 받은 'arrive' = 돌려보낸 'return' + 지금 한반도에 있는 것", `${H.core.arriveIn} = ${H.core.returnOut} + 이동 중(캐러밴 ${E.inH} · 기록 줄 ${E.pendH})`);
  ok(H.st.sentFail === 0 && N.st.sentFail === 0 && H.st.bounced === 0 && N.st.bounced === 0, 'ⓔ5 문이 다 받았다(되돌림 0 · 못 보냄 0)', `한반도 ${H.st.sentOk}/${H.st.sent} · 닛폰 ${N.st.sentOk}/${N.st.sent}`);
  console.log(`  · [표] 한반도 넘김 ${H.st.crossArrive} · 돌려보냄 ${H.st.crossReturn}(경계 교역 성사 ${H.st.soldOk}) · 곳간 ${H.st.deposited} · 잃음 ${H.st.lost} · 몸 넘김 ${H.st.bodyOut} · 받은 몸 ${H.st.bodyIn} · econ 날 ${H.day}`);
  console.log(`  · [표] 닛폰 넘김 ${N.st.crossArrive} · 돌려보냄 ${N.st.crossReturn}(경계 교역 성사 ${N.st.soldOk}) · 곳간 ${N.st.deposited} · 잃음 ${N.st.lost} · 몸 넘김 ${N.st.bodyOut} · 받은 몸 ${N.st.bodyIn} · econ 날 ${N.day}`);

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
