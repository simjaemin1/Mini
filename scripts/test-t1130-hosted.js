#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1130-hosted.js — 서버가 없는 존에는 묻지 않는다 (T1130 · ★재민 11-03 사파리 "https 전환 뒤 콘솔 TLS 오류 수십 줄") ===
//
// ★왜: central `/zones` 는 26존을 다 싣는다. 서버가 없는 존(중원 · 베링 …)의 주소는 `hostFromEnv` 끝 = `PUBLIC_HOST`(서울 IP)로 떨어지고,
//   클라는 개울(`loadStreams` → `<존>/streams.bin`)과 큰 지도(`zoneBase` → `<존>/bigmap.png`)를 존마다 묻는다 → https 에서 `https://<IP>/…` = 인증서 오류 줄.
//   고침: central 이 존 칸 `hosted`(실제 호스트가 선 존 = true · 아니면 false)를 싣고(손잡이 `T1130_HOSTED` · `=0` 끔 = 칸 0),
//   클라는 `hosted === false` 인 존에 안 묻는다(소켓이 붙은 존은 표시와 상관없이 묻는다).
//
//  Ⓐ 술어(`server/zone-config.js` `hostedZoneIds`) — env 판 일곱(모름 · ZONE_HOST · ENABLED_ZONES · ZONE_HOSTS 같음/다름 · 빈 줄 · 끔)
//  Ⓑ central `/zones` — 켬 = 선 존만 true · 나머지 false / 끔 = 칸 0 · 나머지 바이트 같음 / 모름 = 칸 0 / ENABLED_ZONES = 다 true · 기동 한 줄
//  Ⓒ 실클라(Playwright Chromium) — central 26존(서버 없는 존 주소 = `hostless.invalid`) + 한반도 존 하나 · 들어가 개울을 받고 큰 지도를 온 세계로 연다
//     ① 켬: `hostless.invalid` 로 간 요청 0 · 콘솔 오류 줄 0 · 한반도 `streams.bin` · `bigmap.png` 는 물었다
//     ② 끔 꼴(`/zones` 에서 `hosted` 칸을 걷어낸 판 = Ⓑ 의 끔 바이트): 같은 걸음에서 hostless 요청 > 0 — 자명 통과 금지 증인
//     ③ 표시가 틀린 판(한반도 `hosted:false` 로 바꾼 `/zones`): 붙은 존은 그래도 묻는다 — 내가 선 존의 개울 · 지도는 받는다
//
// 실행: node scripts/test-t1130-hosted.js [--headed]    (Chromium /opt/pw-browsers — playwright install 금지)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
const ZC = require(path.join(ROOT, 'server', 'zone-config'));
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, HPORT = ZC.ZONES.hanbando.port;
const NOHOST = 'hostless.invalid';   // 서버 없는 존이 받는 공용 주소(라이브 = 서울 IP) — `.invalid` 는 어디에도 안 닿는다
const DBS = [];
const rmDbs = () => { for (const f of DBS) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } rmDbs(); });
const end = () => { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`); process.exit(fail ? 1 : 0); };
function portFree(port) {
  return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
}
// central/존 env 는 손잡이 · 주소 env 를 지우고 시작한다(하네스를 부른 셸의 env 가 판에 새지 않게)
const CLEAN = (() => { const e = Object.assign({}, process.env); for (const k of Object.keys(e)) if (/^(ZONE_HOST_|ZONE_HOSTS$|ENABLED_ZONES$|PUBLIC_HOST$|T1130_)/.test(k)) delete e[k]; return e; })();
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, CLEAN, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._out = '';
  p.stdout.on('data', (b) => { p._out += String(b); });
  p.stderr.on('data', (b) => { p._out += String(b); });
  procs.push(p); return p;
}
const kill = (p) => new Promise((res) => { if (!p || p.exitCode !== null) return res(); p.once('exit', () => res()); try { p.kill('SIGKILL'); } catch (e) { res(); } });
let dbN = 0;
const cdb = () => { const f = `/tmp/t1130-c${dbN++}-${process.pid}.db`; DBS.push(f); return f; };
const getZones = async () => (await fetch(`http://localhost:${CPORT}/zones`, { signal: AbortSignal.timeout(5000) })).json();

(async () => {
  console.log('\n=== T1130 — 서버가 없는 존에는 묻지 않는다(central `/zones` 칸 `hosted` · 클라 개울 · 큰 지도) ===');

  // ── Ⓐ 술어 ──────────────────────────────────────────────────────────────
  console.log('\nⒶ 술어 `hostedZoneIds(env)` — 실제 호스트가 선 존');
  const H = (env) => { if (typeof ZC.hostedZoneIds !== 'function') return '(함수 없음)'; const s = ZC.hostedZoneIds(env); return s ? [...s].sort().join(',') : null; };   // 고치기 전 트리도 끝까지 돈다(증인)
  const ALL = Object.keys(ZC.ZONES);
  const ZH26 = (to) => JSON.stringify(Object.fromEntries(ALL.map((z) => [z, to])));   // 배포 스크립트가 짓는 26존 표 꼴(다 같은 주소)
  ok(typeof ZC.hostedZoneIds === 'function' && ALL.length === 26, '전제: 함수가 있다 · 존 26', `${typeof ZC.hostedZoneIds} · ${ALL.length}`);
  ok(H({ PUBLIC_HOST: '1.2.3.4' }) === null && H({}) === null, '① 호스트 표시 env 가 없다(한 대 배포 · 로컬) = 모름(null — 칸 0 · 종전대로 다 묻는다)', `${H({ PUBLIC_HOST: '1.2.3.4' })}`);
  ok(H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOST_HANBANDO: 'kr.example', ZONE_HOST_NIPPON: 'jp.example' }) === 'hanbando,nippon', '② `ZONE_HOST_<ID>` 가 선 존만', H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOST_HANBANDO: 'kr.example', ZONE_HOST_NIPPON: 'jp.example' }));
  ok(H({ ENABLED_ZONES: 'hanbando, nippon' }) === 'hanbando,nippon', '③ `ENABLED_ZONES` 에 든 존(빈칸 다듬음)', H({ ENABLED_ZONES: 'hanbando, nippon' }));
  ok(H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOSTS: ZH26('1.2.3.4'), ZONE_HOST_NIPPON: 'jp.example' }) === 'nippon',
    '④ ★26존 표(`ZONE_HOSTS` — 다 공용 주소)는 호스트가 아니다 · 그 위에 선 `ZONE_HOST_NIPPON` 만', H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOSTS: ZH26('1.2.3.4'), ZONE_HOST_NIPPON: 'jp.example' }));
  { const zh = JSON.parse(ZH26('1.2.3.4')); zh.hanbando = 'kr.example';
    ok(H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOSTS: JSON.stringify(zh) }) === 'hanbando', '⑤ `ZONE_HOSTS` 칸이 공용 주소와 다른 존 = 그 존만의 호스트(한반도 주소가 표로 실린 판도 놓치지 않는다)', H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOSTS: JSON.stringify(zh) })); }
  ok(H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOST_HANBANDO: '' }) === null, '⑥ 빈 줄(`ZONE_HOST_HANBANDO=`)은 안 선 것(`hostFromEnv` 와 같은 읽기)', `${H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOST_HANBANDO: '' })}`);
  ok(H({ PUBLIC_HOST: '1.2.3.4', ZONE_HOST_HANBANDO: 'kr.example', T1130_HOSTED: '0' }) === null && H({ ZONE_HOST_HANBANDO: 'kr.example', T1130_HOSTED: 'true' }) === 'hanbando',
    "⑦ 손잡이 `T1130_HOSTED` — '0' 만 끔(null = 칸 0) · 다른 값은 켬", `${H({ ZONE_HOST_HANBANDO: 'kr.example', T1130_HOSTED: '0' })} · ${H({ ZONE_HOST_HANBANDO: 'kr.example', T1130_HOSTED: 'true' })}`);

  // ── Ⓑ central `/zones` ───────────────────────────────────────────────────
  console.log('\nⒷ central `/zones` — 칸 `hosted`');
  ok(await portFree(CPORT) && await portFree(HPORT), `전제: 포트 ${CPORT} · ${HPORT} 가 비어 있다`);
  const cOnce = async (env) => {
    const p = boot('central', 'central.js', Object.assign({ PORT: String(CPORT), DB_PATH: cdb() }, env));
    const u = await FB.waitUp(p, /central server up on/, { name: 'central' });
    let j = null; if (u.ok) { for (let i = 0; i < 20 && !/T1130 /.test(p._out); i++) await sleep(100); try { j = await getZones(); } catch (e) { j = null; } }
    const out = p._out; await kill(p);
    return { ok: u.ok && !!j, why: u.why, j, line: (out.match(/\[central\] T1130 [^\n]*/) || [''])[0] };
  };
  const B1 = await cOnce({ PUBLIC_HOST: NOHOST, ZONE_HOST_HANBANDO: 'localhost' });
  const B2 = await cOnce({ PUBLIC_HOST: NOHOST, ZONE_HOST_HANBANDO: 'localhost', T1130_HOSTED: '0' });
  const B3 = await cOnce({ PUBLIC_HOST: NOHOST });
  const B4 = await cOnce({ PUBLIC_HOST: NOHOST, ENABLED_ZONES: 'hanbando,nippon' });
  ok(B1.ok && B2.ok && B3.ok && B4.ok, 'central 네 판 기동 · `/zones` 받음', [B1, B2, B3, B4].map((b) => b.ok ? 'ok' : b.why).join(' / '));
  if (!(B1.ok && B2.ok && B3.ok && B4.ok)) end();
  const zs = (b) => Object.values(b.j.zones || {});
  const tru = (b) => zs(b).filter((z) => z.hosted === true).map((z) => z.id).sort().join(',');
  ok(zs(B1).length === 26 && tru(B1) === 'hanbando' && zs(B1).every((z) => typeof z.hosted === 'boolean'),
    '★① 켬 — 26존 다 칸이 있고 호스트가 선 존(한반도)만 true · 나머지 스물다섯 false', `${zs(B1).length}존 · true ${tru(B1)} · false ${zs(B1).filter((z) => z.hosted === false).length}`);
  { const F1 = zs(B1).filter((z) => z.hosted === false);   // 빈 목록이면 every 가 저절로 참이다 — 스물다섯을 같이 본다(자명 통과 금지)
    ok(F1.length === 25 && F1.every((z) => z.wsUrl.includes(NOHOST)) && (B1.j.zones.hanbando.wsUrl || '').includes('localhost'),
      '전제: false 인 스물다섯 존 주소 = 공용 주소(서버 없는 자리) · 한반도 = 제 주소', `${F1.length} · ${B1.j.zones.jungwon_n && B1.j.zones.jungwon_n.wsUrl} · ${B1.j.zones.hanbando.wsUrl}`); }
  const strip = (j) => { const c = JSON.parse(JSON.stringify(j)); for (const z of Object.values(c.zones)) delete z.hosted; return JSON.stringify(c); };
  ok(zs(B2).every((z) => !('hosted' in z)) && strip(B1.j) === JSON.stringify(B2.j),
    "★② 끔(`T1130_HOSTED=0`) — 칸 0 · 그 칸 말고 `/zones` 바이트가 켬과 같다(종전 그대로)", `칸 ${zs(B2).filter((z) => 'hosted' in z).length} · 같음 ${strip(B1.j) === JSON.stringify(B2.j)}`);
  ok(zs(B3).every((z) => !('hosted' in z)) && zs(B3).length === 26, '③ 호스트 표시 env 가 없다(공용 주소뿐) = 모름 — 칸 0(종전대로 다 묻는다)', `칸 ${zs(B3).filter((z) => 'hosted' in z).length}`);
  ok(zs(B4).length === 2 && tru(B4) === 'hanbando,nippon', '④ `ENABLED_ZONES` 판 — 실린 두 존 다 true', `${zs(B4).length}존 · ${tru(B4)}`);
  ok(/선 존 hanbando · hosted:false 25곳/.test(B1.line) && /손잡이 끔/.test(B2.line) && /모름/.test(B3.line),
    '⑤ 기동 한 줄 — 배포 뒤 `docker logs` 로 선 존을 본다(켬 · 끔 · 모름)', [B1.line, B2.line, B3.line].map((l) => l.replace('[central] ', '')).join(' / '));

  // ── Ⓒ 실클라 ────────────────────────────────────────────────────────────
  console.log('\nⒸ 실클라 — central 26존(서버 없는 존 = `hostless.invalid`) + 한반도 존 · 들어가 개울을 받고 큰 지도를 온 세계로 연다');
  const cp = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: cdb(), PUBLIC_HOST: NOHOST, ZONE_HOST_HANBANDO: 'localhost' });
  const zdb = `/tmp/t1130-z-${process.pid}.db`; DBS.push(zdb);
  const zp = boot('hanbando', 'zone.js', { PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  const [cu, zu] = await Promise.all([FB.waitUp(cp, /central server up on/, { name: 'central' }), FB.waitUp(zp, /zone server up on/, { name: 'hanbando', capMs: 300000 })]);
  ok(cu.ok && zu.ok, 'central · 한반도 기동', `${cu.why} · ${zu.why}`);
  if (!cu.ok || !zu.ok) end();
  for (let i = 0; i < 120; i++) { try { const z = await getZones(); if (z.zones.hanbando && z.zones.hanbando.cap) break; } catch (e) {} await sleep(500); }   // 한반도가 /health 에 답할 때까지(로비 시작 존)

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  //   판 하나 = 새 손님 · 들어가 개울(한반도)을 받고 · 큰 지도를 온 세계 배율로 연다 · 그동안 나간 요청 · 콘솔 오류 줄을 적는다
  const run = async (tag, zonesEdit) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    if (zonesEdit) {
      await ctx.route(/\/zones$/, async (route) => {
        const r = await route.fetch(); const j = await r.json(); zonesEdit(j);
        await route.fulfill({ response: r, body: JSON.stringify(j), headers: Object.assign({}, r.headers(), { 'content-type': 'application/json' }) });
      });
    }
    const page = await ctx.newPage();
    const reqs = [], cons = [], errs = [];
    page.on('request', (q) => reqs.push(q.url()));
    page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text()); });
    page.on('requestfailed', (q) => { if (q.url().includes(NOHOST)) cons.push('failed ' + q.url()); });
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    const bad = []; page.on('response', (q) => { if (q.status() >= 400) bad.push(`${q.status()} ${q.url().replace(/^https?:\/\/[^/]+/, '')}`); });   // (참고) 4xx · 5xx 응답 — 서버 없는 존과 무관한 콘솔 줄의 출처
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    const btn = await page.waitForSelector('#enter', { timeout: 30000 }).catch(() => null);
    for (let i = 0; i < 120 && btn && (await btn.isDisabled()); i++) await sleep(500);
    if (btn) await btn.click();
    let inside = false;
    for (let i = 0; i < 120 && !inside; i++) { inside = await page.evaluate(() => { const m = window.__getMyAbs && window.__getMyAbs(); return !!(m && (m.x || m.y) && typeof myPid !== 'undefined' && myPid); }); if (!inside) await sleep(250); }
    let sd = null;
    for (let i = 0; i < 60; i++) { sd = await page.evaluate(() => (window.__streamDbg ? window.__streamDbg() : null)); if (sd && sd.hanbando && sd.hanbando.st !== 'loading') break; await sleep(250); }
    await page.keyboard.press('m');
    for (let i = 0; i < 40 && !(await page.evaluate(() => window.__bigMapDbg && window.__bigMapDbg().visible)); i++) await sleep(100);
    const view = await page.evaluate(() => {   // 온 세계가 한 화면에 — 모든 존을 그린다(뭍 존은 그림을 묻는다)
      const zm = window.__getZonesMeta(); let W = 0, Hh = 0;
      for (const z of Object.values(zm)) { W = Math.max(W, z.worldOffsetX + z.zoneWidth); Hh = Math.max(Hh, z.worldOffsetY + z.zoneHeight); }
      const d = window.__bigMapDbg(); const zz = Math.min(d.w / W, d.h / Hh) * 0.95;
      return window.__bigMapView(zz, W / 2, Hh / 2);
    });
    await sleep(3500);
    const bm = await page.evaluate(() => window.__bigMapDbg());
    sd = await page.evaluate(() => (window.__streamDbg ? window.__streamDbg() : null));
    const meta = await page.evaluate(() => { const zm = window.__getZonesMeta(); return { n: Object.keys(zm).length, land: Object.values(zm).filter((z) => !z.isOcean).length, hostedKey: Object.values(zm).filter((z) => 'hosted' in z).length }; });
    await ctx.close();
    const host = (u) => { try { return new URL(u).hostname; } catch (e) { return ''; } };
    const nohost = reqs.filter((u) => host(u) === NOHOST);
    const r = { tag, inside, view, meta, reqN: reqs.length, nohost: nohost.length, nohostStreams: nohost.filter((u) => u.endsWith('/streams.bin')).length, nohostMap: nohost.filter((u) => /\/bigmap\.png/.test(u)).length,
      hanStreams: reqs.filter((u) => u === `http://localhost:${HPORT}/streams.bin`).length, hanMap: reqs.filter((u) => u.startsWith(`http://localhost:${HPORT}/bigmap.png`)).length,
      consErr: cons.filter((c) => c.includes(NOHOST)).length, consAll: cons.length, consOther: cons.filter((c) => !c.includes(NOHOST)).length, bad: bad.slice(0, 4), errs,
      streamZones: sd ? Object.keys(sd).sort() : null, hanSt: sd && sd.hanbando ? sd.hanbando.st : null,
      mapZones: bm ? Object.keys(bm.zones).length : null, mapNoUrl: bm ? Object.values(bm.zones).filter((z) => z.err === 'no-url').length : null, hanMapSt: bm && bm.zones.hanbando ? bm.zones.hanbando.st : null };
    console.log(`  · [${tag}] ${JSON.stringify(Object.assign({}, r, { errs: r.errs.length }))}`);
    return r;
  };
  const ON = await run('켬');
  const OFF = await run('끔 꼴', (j) => { for (const z of Object.values(j.zones)) delete z.hosted; });   // Ⓑ② 와 같은 바이트(칸 0)
  const MIS = await run('표시 틀림', (j) => { if (j.zones.hanbando) j.zones.hanbando.hosted = false; });
  await browser.close();

  console.log('\n① 켬 — 서버 없는 존에는 안 묻는다');
  ok(ON.inside && ON.meta.n === 26 && ON.meta.hostedKey === 26, '전제: 들어갔다 · 클라가 받은 존 26 · 다 칸이 있다', `${ON.inside} · ${ON.meta.n}존 · 칸 ${ON.meta.hostedKey} · 뭍 ${ON.meta.land}`);
  ok(ON.hanStreams >= 1 && ON.hanSt && ON.hanSt !== 'loading' && ON.hanMap >= 1, '전제(자명 통과 금지): 한반도 개울 · 큰 지도 그림은 물었다 — 묻는 길이 돌았다', `streams ${ON.hanStreams}(${ON.hanSt}) · bigmap ${ON.hanMap}(${ON.hanMapSt})`);
  ok(ON.nohost === 0, '★★서버 없는 존(`hostless.invalid`)으로 간 요청 0 — 개울 · 큰 지도 · 조각 다', `${ON.nohost} (streams ${ON.nohostStreams} · bigmap ${ON.nohostMap}) · 요청 전체 ${ON.reqN}`);
  ok(ON.consErr === 0, '★서버 없는 존 몫 콘솔 오류 줄 · 실패한 요청 0', `${ON.consErr} · (참고) 콘솔 오류 전체 ${ON.consAll}`);
  ok(ON.streamZones && ON.streamZones.join(',') === 'hanbando', '개울 표엔 한반도 하나 — 서버 없는 존은 적지도 않는다(붙으면 그때 받는다)', ON.streamZones && ON.streamZones.join(','));
  ok(ON.mapNoUrl >= ON.meta.land - 1 - 2 && ON.mapNoUrl > 10, '큰 지도 — 서버 없는 뭍 존은 주소 없음(`no-url` · 종전 실패 꼴 그대로 그린다)', `no-url ${ON.mapNoUrl} · 지도 존 ${ON.mapZones} · 뭍 ${ON.meta.land}`);

  console.log('\n② 끔 꼴(칸 0 = 종전 central) — 같은 걸음이 서버 없는 존에 묻는다(증인)');
  ok(OFF.inside && OFF.meta.hostedKey === 0, '전제: 들어갔다 · 칸 0', `${OFF.inside} · 칸 ${OFF.meta.hostedKey}`);
  ok(OFF.nohostStreams >= 10 && OFF.nohostMap >= 10, '★서버 없는 존 요청이 난다 — 개울 · 큰 지도 존마다(재민 콘솔 수십 줄의 꼴)', `streams ${OFF.nohostStreams} · bigmap ${OFF.nohostMap} · 콘솔 ${OFF.consErr}`);

  console.log('\n③ 표시가 틀린 판(한반도 hosted:false) — 붙은 존은 그래도 묻는다');
  ok(MIS.inside && MIS.hanStreams >= 1 && MIS.hanSt === ON.hanSt && MIS.hanMap >= 1, '★내가 선 존(소켓이 붙음)의 개울 · 큰 지도는 받는다 — 표시보다 붙은 소켓이 이긴다', `streams ${MIS.hanStreams}(${MIS.hanSt}) · bigmap ${MIS.hanMap}(${MIS.hanMapSt})`);
  ok(MIS.nohost === 0, '나머지 서버 없는 존은 그대로 0', String(MIS.nohost));
  ok(!ON.errs.length && !OFF.errs.length && !MIS.errs.length, '클라 pageerror 0', JSON.stringify([ON.errs, OFF.errs, MIS.errs]).slice(0, 300));
  end();
})().catch((e) => { console.log('  ✗ 하네스 예외 ' + String(e && e.stack || e).slice(0, 400)); fail++; end(); });
