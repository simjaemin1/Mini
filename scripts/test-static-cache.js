#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-static-cache.js — central 정적 응답(캐시 · 304 · gzip) + 로비 게임 그림 문 [T1123] ===
//
// ★왜 [재민 11-03 Safari 실기 "처음 메인 페이지도 렉이 너무 극심"]
//   로비 하나에 요청 322개 · 20.8 MB · 라이브 응답에 `Cache-Control`/`ETag`/`Last-Modified` 0 · terrain.json 압축 0.
//   고친 것 둘 — ② `server/static-serve.js`(손잡이 `T1123_STATIC_CACHE`) · ① 클라 게임 그림 문(손잡이 `T1123_LOBBY_LAZY`).
//
// 절
//   ⓐ 켬 — html 의 `?v=` 가 **그 파일의 내용 sha1** 로 갈렸다(사람이 적은 `5h0` 가 남지 않는다)
//   ⓑ 켬 — `?v=<내용 sha1>` 이면 immutable(카드가 준 31536000) · 옛 값이면 no-cache · ETag · Last-Modified · 304(INM · IMS)
//   ⓒ 켬 — js · json · css gzip(풀면 원본과 바이트 같다) · png · webp 는 안 누른다 · 형식(webp · json)
//   ⓓ 내용이 바뀌면 `?v=` 가 바뀐다(임시 폴더 — 붙잡은 값이 낡지 않는다 · html 은 안 붙잡는다)
//   ⓔ 끔(`T1123_STATIC_CACHE=0`) — 종전 머리 그대로(no-store · ETag 0 · 압축 0 · `?v=5h0` 그대로)
//   ⓕ /zones 칸 `lobbyLazy` — 켬 기본 · `T1123_LOBBY_LAZY=0` 이면 칸 없음
//   ⓖ Chromium(존 없이 central 만) — 켬: 게임 그림 요청은 **문이 열린 뒤에만** 시작 · 문이 열리고 나무 열둘이 다 온다 ·
//      끔: 문이 /zones 에서 곧바로 열린다(`끔`) · 두 번째 방문은 304(바이트가 확 준다)
//   ⓗ [T1131] 그림 매니페스트 — `/zones` 칸 `gimgMap`(손잡이 `T1131_WEBP` · `=0` 이면 칸 없음 · 길 404) · 표 = 클라가 짓는 주소 → 내는 주소
//      (png 전부 → 같은 어간 webp 쌍둥이 + `?v=<내용 sha1 앞 10자>` · 문 json · terrain.json · 산 webp 도 해시) · 표 자신도 `?v=<표 sha1 앞 10자>` immutable · gzip ·
//      앞 10자 이상만 immutable(9자 · 다른 값 = no-cache · 끔 = 40자 전부만) ·
//      Chromium — 켬: 게임 그림 png 요청 0 · 전부 `?v=` · 둘째 방문 게임 그림 네트 요청 0(304 도 0) · 끔: 종전 png 주소 · 둘째 방문 304 ·
//      ★표를 못 받으면(가로막음) 문은 표 없이 열려 종전 png 로 다 온다
//
// 실행: node scripts/test-static-cache.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
const procs = [];
FB.reapOnExit(procs);
const dbs = [];
function bootCentral(port, env) {
  const db = path.join(os.tmpdir(), `t1123-sc-${process.pid}-${port}.db`); dbs.push(db); require('./lib-tmp').own(db);   // [T1400] lib-tmp — 판 끝(빨강 · 상한 포함)에 지운다
  const p = spawn(process.execPath, [path.join(ROOT, 'server', 'central.js')], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port), DB_PATH: db, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(p);
  return FB.waitUp(p, /central server up on/, { name: `central:${port}` });
}
async function get(base, u, h) {
  const r = await fetch(base + u, { headers: h || {} });
  const body = Buffer.from(await r.arrayBuffer());
  return { s: r.status, h: (k) => r.headers.get(k), body };
}
// fetch 는 gzip 을 저절로 푼다 — 눌린 몸을 보려면 http 로 받는다
function rawGet(port, u, h) {
  return new Promise((res, rej) => {
    require('http').get({ host: 'localhost', port, path: u, headers: h || {} }, (r) => {
      const bufs = []; r.on('data', (d) => bufs.push(d)); r.on('end', () => res({ s: r.statusCode, h: r.headers, body: Buffer.concat(bufs) }));
    }).on('error', rej);
  });
}

(async () => {
  console.log('\n=== T1123 정적 응답 · 로비 게임 그림 문 ===');
  const pOn = await FB.freePort(), pOff = await FB.freePort();
  const [uOn, uOff] = await Promise.all([bootCentral(pOn, {}), bootCentral(pOff, { T1123_STATIC_CACHE: '0', T1123_LOBBY_LAZY: '0' })]);
  ok(uOn.ok && uOff.ok, 'central 둘 기동(켬 · 끔)', `${uOn.why} / ${uOff.why}`);
  const ON = `http://localhost:${pOn}`, OFF = `http://localhost:${pOff}`;
  const PUB = path.join(ROOT, 'public');

  console.log('\nⓐ html 의 ?v= = 그 파일의 내용 sha1');
  const ix = (await get(ON, '/')).body.toString('utf8');
  const refs = [...ix.matchAll(/(?:src|href)="([^"?#:]+)\?v=([^"]*)"/g)].map((m) => ({ rel: m[1], v: m[2] }));
  const srcIx = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const srcN = (srcIx.match(/\?v=/g) || []).length;
  ok(refs.length > 0 && refs.length === srcN, '`?v=` 줄 수가 원본과 같다(빠진 줄 0)', `${refs.length} / ${srcN}`);
  const bad = refs.filter((r) => r.v !== sha(fs.readFileSync(path.join(PUB, r.rel.replace(/^\//, ''))))).map((r) => r.rel);
  ok(bad.length === 0, '모든 `?v=` 가 그 파일의 내용 sha1 이다', bad.slice(0, 3).join(' '));
  ok(!/\?v=5h0/.test(ix), '사람이 적은 고정 값(`5h0`)이 남지 않는다');

  console.log('\nⓑ immutable · no-cache · ETag · Last-Modified · 304');
  const r0 = refs.find((r) => /99-main\.js$/.test(r.rel)) || refs[0];
  const a = await get(ON, `/${r0.rel.replace(/^\//, '')}?v=${r0.v}`);
  ok(a.s === 200 && a.h('cache-control') === 'public, max-age=31536000, immutable', '`?v=<내용 sha1>` → immutable 1년', a.h('cache-control'));
  const b = await get(ON, `/${r0.rel.replace(/^\//, '')}?v=5h0`);
  ok(b.s === 200 && b.h('cache-control') === 'no-cache', '옛 `?v=` → no-cache(늘 다시 묻는다)', b.h('cache-control'));
  ok(a.h('etag') === `"${r0.v}"` && !!a.h('last-modified'), 'ETag = 내용 sha1 · Last-Modified 있음', `${a.h('etag')} · ${a.h('last-modified')}`);
  const tree = await get(ON, '/assets/trees/tree01.png');
  ok(tree.s === 200 && tree.h('cache-control') === 'no-cache' && !!tree.h('etag'), '그림(?v= 없음) — no-cache + ETag', `${tree.h('cache-control')} · ${tree.h('etag')}`);
  const t304 = await get(ON, '/assets/trees/tree01.png', { 'if-none-match': tree.h('etag') });
  ok(t304.s === 304 && t304.body.length === 0, 'If-None-Match 맞음 → 304 · 몸 0', `${t304.s} · ${t304.body.length}B`);
  const ims = await get(ON, '/assets/trees/tree01.png', { 'if-modified-since': tree.h('last-modified') });
  ok(ims.s === 304, 'If-Modified-Since 맞음 → 304', ims.s);
  const stale = await get(ON, '/assets/trees/tree01.png', { 'if-none-match': '"0000"' });
  ok(stale.s === 200 && stale.body.length === fs.statSync(path.join(PUB, 'assets/trees/tree01.png')).size, '★돌연변이 — 다른 ETag 면 200 · 온 몸', `${stale.s} · ${stale.body.length}B`);

  console.log('\nⓒ gzip · 형식');
  for (const u of ['/terrain.json', '/client/00-const.js', '/style.css']) {
    const r = await rawGet(pOn, u, { 'accept-encoding': 'gzip' });
    const file = u === '/terrain.json' ? path.join(ROOT, 'server', 'hanbando-terrain.json') : path.join(PUB, u);
    const raw = fs.readFileSync(file);
    let same = false; try { same = zlib.gunzipSync(r.body).equals(raw); } catch (e) {}
    ok(r.s === 200 && r.h['content-encoding'] === 'gzip' && same, `${u} gzip · 풀면 원본과 같다`, `${(raw.length / 1e3).toFixed(0)} KB → ${(r.body.length / 1e3).toFixed(0)} KB`);
  }
  const noAe = await rawGet(pOn, '/terrain.json', {});
  ok(!noAe.h['content-encoding'] && noAe.body.length === fs.statSync(path.join(ROOT, 'server', 'hanbando-terrain.json')).size, 'Accept-Encoding 없으면 안 누른다', noAe.h['content-encoding'] || '없음');
  const png = await rawGet(pOn, '/assets/trees/tree01.png', { 'accept-encoding': 'gzip' });
  ok(!png.h['content-encoding'], 'png 는 안 누른다', png.h['content-encoding'] || '없음');
  const wf = fs.readdirSync(path.join(PUB, 'assets', 'mountains')).find((f) => f.endsWith('.webp'));
  const wb = await rawGet(pOn, '/assets/mountains/' + wf, { 'accept-encoding': 'gzip' });
  ok(wb.h['content-type'] === 'image/webp' && !wb.h['content-encoding'], 'webp 형식 image/webp · 안 누른다', wb.h['content-type']);
  const js = await rawGet(pOn, '/assets/trees/tree_species.json', {});
  ok(js.h['content-type'] === 'application/json', 'json 형식 application/json', js.h['content-type']);

  console.log('\nⓓ 내용이 바뀌면 ?v= 가 바뀐다(임시 폴더)');
  {
    const SS = require(path.join(ROOT, 'server', 'static-serve.js'));
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 't1123-')); require('./lib-tmp').own(d);   // [T1400] lib-tmp — 빨강 · 던짐 · 상한에도 판 끝에 지운다
    fs.writeFileSync(path.join(d, 'a.js'), 'var a=1;');
    fs.writeFileSync(path.join(d, 'index.html'), '<script src="a.js?v=5h0"></script><script src="https://x.y/b.js?v=1"></script><script src="none.js?v=2"></script>');
    const h1 = SS.entry(path.join(d, 'index.html')).body.toString();
    const fd = fs.openSync(path.join(d, 'a.js'), 'w'); fs.writeSync(fd, 'var a=22;'); fs.closeSync(fd);
    const t = new Date(Date.now() + 2000); fs.utimesSync(path.join(d, 'a.js'), t, t);
    const h2 = SS.entry(path.join(d, 'index.html')).body.toString();
    ok(h1.includes(`a.js?v=${sha('var a=1;')}`) && h2.includes(`a.js?v=${sha('var a=22;')}`), 'a.js 가 바뀌면 html 의 ?v= 도 바뀐다(html 은 안 붙잡는다)');
    ok(h2.includes('https://x.y/b.js?v=1') && h2.includes('none.js?v=2'), '바깥 주소 · 없는 파일은 그대로 둔다');
    fs.rmSync(d, { recursive: true, force: true });
  }

  console.log('\nⓔ 끔 — 종전 머리 그대로');
  const ixOff = (await get(OFF, '/')).body.toString('utf8');
  ok(ixOff === srcIx, '끔: index.html 바이트 그대로(`?v=5h0`)');
  const off = await rawGet(pOff, '/terrain.json', { 'accept-encoding': 'gzip' });
  ok(off.h['cache-control'] === 'no-cache' && !off.h.etag && !off.h['content-encoding'], '끔: terrain.json 종전 머리(no-cache · ETag 0 · 압축 0)', `${off.h['cache-control']}`);
  const offJs = await rawGet(pOff, '/client/00-const.js', { 'accept-encoding': 'gzip' });
  ok(offJs.h['cache-control'] === 'no-cache, no-store, must-revalidate' && !offJs.h.etag && !offJs.h['content-encoding'], '끔: js 종전 머리(no-store)', offJs.h['cache-control']);

  console.log('\nⓕ /zones 칸 lobbyLazy');
  const zOn = JSON.parse((await get(ON, '/zones')).body.toString()), zOff = JSON.parse((await get(OFF, '/zones')).body.toString());
  ok(zOn.lobbyLazy === true && !('lobbyLazy' in zOff), '켬 기본 칸 있음 · `=0` 이면 칸 없음', `${zOn.lobbyLazy} / ${zOff.lobbyLazy}`);

  console.log('\nⓖ Chromium — 로비 게임 그림 문(존 없이 central 만)');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const look = async (base) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch (e) {} });
    const visit = async () => {
      const page = await ctx.newPage();
      await page.goto(base + '/', { waitUntil: 'load' });
      // 문이 열리고 나무 열둘이 다 올 때까지(상한은 표에만 — 판정은 값으로)
      await page.waitForFunction(() => window.__gimg && window.__gimg().open && typeof TREE_SPRITES !== 'undefined' && TREE_SPRITES.every((im) => im.complete && im.naturalWidth > 0), null, { timeout: 120000 }).catch(() => {});
      const r = await page.evaluate(() => {
        const g = window.__gimg ? window.__gimg() : null;
        const res = performance.getEntriesByType('resource').filter((e) => /\/assets\/(trees|mountains|nature|crops|bridge|buildings|terrain)\/|\/terrain\.json/.test(e.name));
        return { g, n: res.length, early: res.filter((e) => g && g.at != null && e.startTime < g.at).map((e) => e.name.replace(location.origin, '')).slice(0, 3),
          trees: TREE_SPRITES.filter((im) => im.complete && im.naturalWidth > 0).length,
          tx: performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || 0), 0) };
      });
      await page.close();
      return r;
    };
    const first = await visit(), second = await visit();
    await ctx.close();
    return { first, second };
  };
  const L = await look(ON), O = await look(OFF);
  ok(L.first.g && L.first.g.lazy === true && L.first.g.open && /시작 화면 정보 없음|로비 다 뜸/.test(L.first.g.why), '켬: 문이 로비 쪽에서 열렸다(존이 없으니 「시작 화면 정보 없음」)', JSON.stringify(L.first.g));
  ok(L.first.n > 0 && L.first.early.length === 0, '★켬: 게임 그림 요청은 **문이 열린 뒤에만** 시작했다', `${L.first.n}개 · 앞선 것 ${L.first.early.join(' ') || '0'}`);
  ok(L.first.trees === 12, '켬: 문이 열리고 나무 열둘이 다 왔다', L.first.trees);
  ok(O.first.g && O.first.g.lazy === false && /끔/.test(O.first.g.why) && O.first.trees === 12, '끔: /zones 에서 곧바로 열렸다(종전 꼴)', JSON.stringify(O.first.g));
  ok(L.second.tx < L.first.tx / 4, '★켬: 두 번째 방문 받은 바이트가 첫 방문의 ¼ 아래(304 · immutable)', `${(L.first.tx / 1e6).toFixed(2)} MB → ${(L.second.tx / 1e6).toFixed(2)} MB`);
  ok(O.second.tx > O.first.tx / 2, '대조 — 끔: 두 번째 방문도 다 받는다(no-store)', `${(O.first.tx / 1e6).toFixed(2)} MB → ${(O.second.tx / 1e6).toFixed(2)} MB`);

  console.log('\nⓗ [T1131] 그림 매니페스트 · webp 쌍둥이 · 그림 주소 내용 해시');
  {
    const AL = require('./asset-lock.js');
    const pW0 = await FB.freePort();
    const uW0 = await bootCentral(pW0, { T1131_WEBP: '0' });
    const W0 = `http://localhost:${pW0}`;
    ok(uW0.ok, 'central 셋째 기동(`T1131_WEBP=0` · 나머지 기본 = T1123 그대로)', uW0.why);
    const zW0 = JSON.parse((await get(W0, '/zones')).body.toString());
    ok(/^\/gimg-map\.json\?v=[0-9a-f]{10}$/.test(zOn.gimgMap || '') && !('gimgMap' in zW0),
       '/zones 칸 `gimgMap` — 켬 기본 있음(`/gimg-map.json?v=<10자>`) · `T1131_WEBP=0` 이면 칸 없음', `${zOn.gimgMap} / ${zW0.gimgMap}`);
    const mr = await rawGet(pOn, zOn.gimgMap, { 'accept-encoding': 'gzip' });
    let mb = Buffer.alloc(0); try { mb = zlib.gunzipSync(mr.body); } catch (e) {}
    let M = {}; try { M = JSON.parse(mb.toString('utf8')); } catch (e) {}
    ok(mr.s === 200 && mr.h['cache-control'] === 'public, max-age=31536000, immutable' && mr.h['content-encoding'] === 'gzip' && mr.h['content-type'] === 'application/json',
       '표: immutable · gzip · application/json', `${mr.h['cache-control']} · ${(mb.length / 1024).toFixed(0)} KB → ${(mr.body.length / 1024).toFixed(0)} KB`);
    ok(mb.length > 0 && sha(mb).startsWith(zOn.gimgMap.split('v=')[1]), '표 주소의 `?v=` = 표 몸의 sha1 앞 10자(표가 바뀌면 주소가 바뀐다)');
    let n = 0; const bad = [];
    for (const g of AL.TWIN_GROUPS) {
      const d = path.join(PUB, 'assets', g);
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.png'))) {
        n++; const k = f.slice(0, -4), w = path.join(d, k + '.webp');
        const want = fs.existsSync(w) ? `/assets/${g}/${k}.webp?v=${sha(fs.readFileSync(w)).slice(0, 10)}` : null;
        if (!want || M[`/assets/${g}/${f}`] !== want) bad.push(`${g}/${f}`);
      }
    }
    ok(n > 0 && bad.length === 0, `★png ${n}장 전부 → 같은 어간 webp 쌍둥이 + \`?v=<그 webp 내용 sha1 앞 10자>\``, bad.slice(0, 3).join(' ') || `${AL.TWIN_GROUPS.length}무리`);
    const doorJson = ['/assets/crops/crops_anchors.json', '/assets/nature/nature_anchors.json', '/assets/trees/tree_species.json', '/assets/icons.lock.json',
      '/assets/mountains/mountain_anchors.json', '/assets/mountains/mountain_alpha.json', '/terrain.json'];
    const fileOf = (u) => (u === '/terrain.json' ? path.join(ROOT, 'server', 'hanbando-terrain.json') : path.join(PUB, u));
    const jBad = doorJson.filter((u) => M[u] !== `${u}?v=${sha(fs.readFileSync(fileOf(u))).slice(0, 10)}`);
    ok(jBad.length === 0, '문 json 여섯 · terrain.json 도 `?v=<내용 sha1 앞 10자>`', jBad.join(' ') || `${doorJson.length}개`);
    const mts = fs.readdirSync(path.join(PUB, 'assets', 'mountains')).filter((x) => x.endsWith('.webp'));
    const mBad = mts.filter((f) => M[`/assets/mountains/${f}`] !== `/assets/mountains/${f}?v=${sha(fs.readFileSync(path.join(PUB, 'assets', 'mountains', f))).slice(0, 10)}`);
    ok(mts.length > 0 && mBad.length === 0, `산 webp ${mts.length}장(이미 webp — 앵커 \`ext\`)도 해시가 붙는다`, mBad.slice(0, 3).join(' '));
    const tu = M['/assets/trees/tree01.png'] || '', tv = tu.split('v=')[1] || '', tbase = tu.split('?')[0];
    const t1 = await rawGet(pOn, tu, {});
    ok(t1.s === 200 && t1.h['cache-control'] === 'public, max-age=31536000, immutable' && t1.h['content-type'] === 'image/webp' && t1.body.equals(fs.readFileSync(path.join(PUB, tbase))),
       '그림 `?v=<10자>` → immutable · image/webp · 몸 = 그 파일', `${tu} · ${t1.h['cache-control']}`);
    const t9 = await rawGet(pOn, `${tbase}?v=${tv.slice(0, 9)}`, {}), tx = await rawGet(pOn, `${tbase}?v=0000000000`, {});
    ok(t9.h['cache-control'] === 'no-cache' && tx.h['cache-control'] === 'no-cache', '★9자 · 다른 10자 → no-cache(앞 10자 이상 · 맞을 때만 붙잡는다)', `${t9.h['cache-control']} · ${tx.h['cache-control']}`);
    const full = sha(fs.readFileSync(path.join(PUB, tbase)));
    const w10 = await rawGet(pW0, `${tbase}?v=${tv}`, {}), w40 = await rawGet(pW0, `${tbase}?v=${full}`, {}), wmap = await rawGet(pW0, '/gimg-map.json', {});
    ok(w10.h['cache-control'] === 'no-cache' && w40.h['cache-control'] === 'public, max-age=31536000, immutable' && wmap.s === 404,
       '끔(`T1131_WEBP=0`): 10자 → no-cache · 40자 전부 → immutable(T1123 그대로) · 표 길 404', `${w10.h['cache-control']} · ${w40.h['cache-control']} · ${wmap.s}`);

    const GAME = /\/assets\/(trees|nature|buildings|bridge|crops|terrain|icons|mountains)\/|\/assets\/icons\.lock\.json|\/terrain\.json/;
    const browser2 = await chromium.launch({ headless: true });
    const lookT = async (base, opt) => {
      const ctx = await browser2.newContext();
      await ctx.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch (e) {} });
      if (opt && opt.blockMap) await ctx.route('**/gimg-map.json*', (r) => r.abort());
      const visit = async () => {
        const page = await ctx.newPage();
        await page.goto(base + '/', { waitUntil: 'load' });
        await page.waitForFunction(() => window.__gimg && window.__gimg().open && typeof TREE_SPRITES !== 'undefined' && TREE_SPRITES.every((im) => im.complete && im.naturalWidth > 0), null, { timeout: 120000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
        const r = await page.evaluate((src) => {
          const re = new RegExp(src);
          const res = performance.getEntriesByType('resource').filter((e) => re.test(e.name)).map((e) => ({ u: e.name.replace(location.origin, ''), tx: e.transferSize || 0 }));
          return { g: window.__gimg ? window.__gimg() : null, res, trees: TREE_SPRITES.filter((im) => im.complete && im.naturalWidth > 0).length,
            tsrc: TREE_SPRITES.map((im) => im.currentSrc || im.src).map((u) => u.replace(location.origin, '')).slice(0, 2) };
        }, GAME.source);
        await page.close();
        return r;
      };
      const first = await visit(), second = await visit();
      await ctx.close();
      return { first, second };
    };
    const img = (r) => r.res.filter((e) => /\.(png|webp)(\?|$)/.test(e.u));
    const A = await lookT(ON), B = await lookT(W0), C = await lookT(ON, { blockMap: true });
    const aImg = img(A.first), aPng = aImg.filter((e) => /\.png(\?|$)/.test(e.u)), aNoV = A.first.res.filter((e) => !/\?v=[0-9a-f]{10}$/.test(e.u));
    ok(A.first.g && A.first.g.map === 'ok' && A.first.g.mapN > 0 && A.first.trees === 12, '켬: 문이 표를 받고 열렸다 · 나무 열둘이 다 왔다', JSON.stringify(A.first.g));
    ok(aImg.length > 0 && aPng.length === 0 && aNoV.length === 0, `★켬: 게임 그림 ${aImg.length}장 중 png 요청 0 · 게임 주소 ${A.first.res.length}개 전부 \`?v=<10자>\``,
       (aPng[0] || aNoV[0] || {}).u || A.first.tsrc.join(' '));
    const aNet2 = A.second.res.filter((e) => e.tx > 0);
    ok(A.second.res.length > 0 && aNet2.length === 0, `★★켬: 둘째 방문 게임 주소 ${A.second.res.length}개 중 네트 요청 0(304 도 0 — immutable)`, aNet2.slice(0, 3).map((e) => e.u).join(' '));
    const bImg = img(B.first), bWebp = bImg.filter((e) => /\.webp/.test(e.u) && !/\/mountains\//.test(e.u)), bV = B.first.res.filter((e) => /\?v=/.test(e.u));
    ok(B.first.trees === 12 && bImg.length > 0 && bWebp.length === 0 && bV.length === 0 && B.first.g && B.first.g.map === null, '끔(`T1131_WEBP=0`): 종전 png 주소 · `?v=` 0 · 표를 안 받는다', `${bImg.length}장 · ${JSON.stringify(B.first.g)}`);
    const bNet2 = B.second.res.filter((e) => e.tx > 0);
    ok(bNet2.length > 0, '대조 — 끔: 둘째 방문은 게임 주소마다 304 왕복(T1123 그대로)', `${bNet2.length}개`);
    const cImg = img(C.first), cWebp = cImg.filter((e) => /\.webp/.test(e.u) && !/\/mountains\//.test(e.u));
    ok(C.first.g && C.first.g.open && C.first.g.map === 'fail' && C.first.trees === 12 && cImg.length > 0 && cWebp.length === 0,
       '★표를 가로막으면 문은 표 없이 열린다 — 종전 png 로 나무 열둘이 다 온다', JSON.stringify(C.first.g));
    await browser2.close();
  }
  await browser.close();

  for (const f of dbs) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  console.log(`\n=== ${pass}/${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
