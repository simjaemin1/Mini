#!/usr/bin/env node
// @regress
// @bait 6
// === scripts/test-t1453-load.js — 자연물 막음 물음(`T1453_NAT_QUERY` · 클라) · 화면 둘레만 보내기(`T1453_VIEW_SEND` · 서버) ==================
//
// ★무엇을 재나 — 카드 T1453 할 일 1 · 4 · 6:
//   존 DB 에 라이브 크기 길(456,479칸 — `t1453-seed.js`)을 심고 띄운다(서버가 실제로 45만 칸을 들고 welcome · 청크 몫을 짓는다).
//   이웃 존(jungwon_n) 동쪽 끝 띠(경계를 따라 ±150줄 · 폭 65칸 · 밀도 40%)도 심는다.
//   Ⓐ 자연물 막음(클라 — 종전 welcome 을 받는 쪽 A 에서):
//      Ⓐ1 전제 — 길 45만 칸 · 건물(마을 켬 · 몸 청크 켬)이 클라에 다 들었다 · 손잡이 기본 켬 · Ⓐ2 끔 주소(`?T1453_NAT_QUERY=0`) = 끔
//      Ⓐ3 같음 — 점마다 종전(새로 구운 Set) ↔ 켬(색인 물음) `_natBlocked` 답(길 칸 · 건물 3×3 · 그 둘레 ±3칸에서 뽑은 점 · 존마다) · 자리 넷(이웃 존 포함)
//      Ⓐ4 그린 자연물 같음 — 같은 프레임 자리에서 끔 ↔ 켬 자연물 자리 목록(자리 넷 × 확대 1 · 1.5 · 2)
//      Ⓐ5 고침 뒤 — 방송 입구(`road_cells` · `building_added` · `buildings_removed`)로 자연물이 선 칸에 길을 내고 · 그 옆 칸에 건물을 놓고 · 다시 걷으면
//         두 갈래가 같이 걷히고 같이 돌아온다(같음 대조 다름 0)
//      Ⓐ6 다시 굽기 0 — 길 · 건물 수가 바뀐 바로 다음 자연물 모으기 한 판 ms: 끔(통째로 다시 굽기) ↔ 켬
//   Ⓑ 화면 둘레만 보내기(서버 켬 — 같은 세계 · 같은 때에 종전 welcome 소켓 A(`t1453full=1`) ↔ 둘레 소켓 B 를 맞댄다):
//      Ⓑ0 끔 서버(따로 띄움) — welcome 길이 존 전체(종전 그대로)
//      Ⓑ1 켬 welcome — B 의 길 = 들어간 자리 둘레 청크(±2)의 심은 칸과 칸 · 등급까지 같다 · 건물은 다 둘레 청크 안
//      Ⓑ2 그린 것 같음 — 자리(마을 · 교역로 · 상자 경계)마다 A ↔ B 그린 목록(길 · 건물 · 지붕 · 마당 소품 · 계단 — 종류 · 자리 · z · 등급 · id) +
//         자연물 자리. 같은 z 끼리 차례는 받은 차례라 맞대기 전에 z 안에서만 줄 세운다(같은 z 길 칸은 대각 줄 — 꼭짓점만 닿는다)
//      Ⓑ3 떠났다 돌아옴 — 돌아온 자리 청크 길은 다시 안 온다(길 짐 0) · 그린 것 같음
//      Ⓑ4 이웃 존 — 존 서쪽 끝(관측 소켓) · 경계를 따라 북으로 3,000px — 이웃 존 길이 A ↔ B 같다(그린 이웃 길 > 0)
//      Ⓑ5 켜졌는데 안 실은 청크 — 다른 마을(몸이 켜 둔 청크) 가운데로 가면 B 에 그 건물이 그 소켓 몫으로 온다(B 짐 > A 켜짐 방송 짐) · 그린 건물 같음
//      Ⓑ6 B 가 든 길은 A 의 일부 — 둘레 몫만 · 다른 칸은 B 가 늦게 받아 새 값인 칸(그날 밟혀 문턱을 넘은 칸 — 하루 방송 전)뿐: 마지막에 붙은 종전 welcome C 와 같다
//   Ⓒ 서버 같은 식 — `Roads.clientRoadsIn` 을 32칸 상자마다 다 모은 것 = `Roads.clientRoads()`(칸 · 등급 · 감쇠 문턱 근처 값 · 읽기만 — 셀 값 · dirty 무접촉)
//   Ⓓ 미끼 여섯(클라 = 서버가 내주는 글자를 그 자리에서 · 서버 = 존 아이 프리로드가 컴파일 직전 글자를 바꾼다 — 파일 무변 · 바꾼 자리 1):
//      ① 자연물이 길 위에 서는 사본(물음이 길을 안 본다) → Ⓐ3 빨강 · ② 건물 3×3 안에 서는 사본(가운데 칸만 센다) → Ⓐ5b 빨강(마을 땅 밖 — 마을 원이 다 막는 마을 안에선 안 보인다) ·
//      ③ 길이 새로 난 뒤 그 칸 자연물이 안 걷히는 사본(새 칸 자리표를 안 고친다) → Ⓐ5 빨강 ·
//      ④ 청크를 떠났다 돌아오면 길이 두 번 든 사본(보낸 청크를 안 적는다) → Ⓑ3 빨강 · ⑤ 화면 둘레 밖 길을 welcome 에 다 싣는 사본(= 지금) → Ⓑ1 빨강 ·
//      ⑥ 이웃 존 경계에서 길이 끊겨 보이는 사본(관측 소켓 둘레를 안 따라간다) → Ⓑ4 빨강
// ★자명 통과 금지 — 맞댄 목록에 길 · 건물 · 자연물이 실제로 있다(0 이면 같음은 아무것도 증명 못 한다) · 같음 대조의 길/건물 맞음 수 > 0.
//
// 실행: node scripts/test-t1453-load.js [--browser chromium|webkit] [--headed]
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3016);   // [T1288] 제품 고정 포트(central · hanbando · jungwon_n)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const LB = require('./lib-bait');
const SY = require('./t1446-synth');
const SEED = require('./t1453-seed');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020, NPORT = 3016;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BROWSER = arg('--browser', 'chromium');
const HEADED = process.argv.includes('--headed');

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m, d) => { if (c) { pass++; say(`  ✓ ${m}${d !== undefined && d !== '' ? '  ' + d : ''}`); } else { fail++; say(`  ✗ ${m}${d !== undefined && d !== '' ? '  ' + d : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
function killAll() { for (const p of procs) { try { p.kill(); } catch (e) {} } procs.length = 0; }

// ── 목록 · 자리 ─────────────────────────────────────────────────────────────────────
const V = SY.villageCenters();
const AT = V.vils.find((v) => v.name === '농촌22') || V.vils[0];
const WEST = V.vils.slice().sort((a, b) => a.cx - b.cx)[0];
//   존 서쪽 끝 자리 — 그 마을 둘레에서 서쪽 끝에 가장 가까운 뭍(T1446 하네스와 같은 식) · 경계를 따라 북으로 3,000px 자리(이웃 존 관측 둘레가 바뀐다)
function westSpot(cy0) { let best = null; for (let dy = -60; dy <= 60; dy += 2) { const cy = cy0 + dy;
  for (let x = 208; x <= 1400; x += 32) { const y = cy * 32 + 16; if (V.blocked(x, y)) continue; if (!best || x < best.x) best = { x, y }; break; } } return best; }
const WSPOT = westSpot(WEST.cy), WSPOT2 = westSpot(WEST.cy - 94);
const ESPOT = (() => { for (let dk = 0; dk < 6; dk++) for (const [kx, ky] of [[dk, 0], [0, dk], [-dk, 0], [0, -dk], [dk, dk]]) {
  const x = 1024 * (Math.floor(AT.cx / 32) + kx) + 16 + 1500, y = 1024 * (Math.floor(AT.cy / 32) + ky) + 16 + 1500; if (!V.blocked(x, y)) return { x, y }; } return null; })();
const RD = SY.synthRoads({});
//   이웃 존(jungwon_n · 존 로컬 3,125칸 폭) 동쪽 끝 띠 — 경계를 따라 WEST.cy ± 150줄(서쪽 끝 자리 둘 다 화면에 든다)
const NB = (() => { const rnd = SY.rng(1453016), flat = [];
  for (let cy = WEST.cy - 150; cy <= WEST.cy + 150; cy++) for (let cx = 3060; cx <= 3124; cx++) if (rnd() < 0.4) flat.push(cx, cy, rnd() < 0.5 ? 1 : 2); return flat; })();
const SPOTS = {
  dense: { x: AT.cx * 32 + 16, y: AT.cy * 32 + 16, name: `${AT.name} 가운데` },
  sparse: { x: Math.round((AT.cx * 0.35 + 616 * 0.65)) * 32 + 16, y: Math.round((AT.cy * 0.35 + 1973 * 0.65)) * 32 + 16, name: '교역로 가' },
  edge: { x: ESPOT.x, y: ESPOT.y, name: '상자 경계(화면 끝 = 칸 가운데)' },
  west: { x: WSPOT.x, y: WSPOT.y, name: `존 서쪽 끝(${WEST.name} 옆 · 이웃 존 jungwon_n)` },
  west2: { x: WSPOT2.x, y: WSPOT2.y, name: '존 서쪽 끝 — 경계를 따라 북으로 3,000px' },
};

// ── 세계 ───────────────────────────────────────────────────────────────────────────
const TAG = String(process.pid);
const DB0 = { han: path.join(os.tmpdir(), `t1453-h-han-${TAG}.db`), jn: path.join(os.tmpdir(), `t1453-h-jn-${TAG}.db`) };
function seedAll() {
  for (const f of Object.values(DB0)) for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(f + s); } catch (e) {}
  const a = SEED.seed(DB0.han, 'hanbando'), b = SEED.seedFlat(DB0.jn, 'jungwon_n', NB, 3125);
  return { han: a.n, jn: b.n };
}
//   bait = { file: 'server/zone.js', from, to } — 존 아이 프리로드가 컴파일 직전에 바꾼다(파일 무변)
function baitPre(b) {
  const f = path.join(os.tmpdir(), `t1453-bait-${TAG}.cjs`);
  fs.writeFileSync(f, `'use strict';const M=require('module'),_c=M.prototype._compile,F=${JSON.stringify(b.from)},T=${JSON.stringify(b.to)},S=${JSON.stringify(path.join(ROOT, b.file))};
M.prototype._compile=function(c,fn){if(fn===S)c=c.replace(F,T);return _c.call(this,c,fn);};`);
  return f;
}
async function bootWorld(o) {   // o = { vs, vil, body, nb, bait }
  killAll(); await sleep(1000);
  const zones = o.nb ? 'hanbando,jungwon_n' : 'hanbando';
  const c = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: zones });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) return cu.why;
  const pre = o.bait ? baitPre(o.bait) : null;
  for (const [zid, port, src, vil] of [['hanbando', ZPORT, DB0.han, o.vil], ...(o.nb ? [['jungwon_n', NPORT, DB0.jn, '0']] : [])]) {
    const db = path.join(os.tmpdir(), `t1453-h-${zid}-${TAG}-run.db`);
    for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(db + s); } catch (e) {}
    fs.copyFileSync(src, db);
    const env = { PORT: String(port), ZONE_ID: zid, DB_PATH: db, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: vil, ENABLE_BANDITS: '0', T432_BODY_CHUNKS: o.body || '0', T1453_VIEW_SEND: String(o.vs) };
    if (pre) env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --require ${pre}`.trim();
    const z = boot(path.join(ROOT, 'server', 'zone.js'), env);
    const zu = await FB.waitUp(z, /zone server up on/, { name: zid, capMs: 400000 }); if (!zu.ok) return zu.why;
  }
  if (o.vil === '1') await sleep(20000);   // 마을 시딩 · 몸 스폰
  return '';
}

// ── 페이지 ─────────────────────────────────────────────────────────────────────────
//   full = 이 페이지의 존 소켓 주소에 `t1453full=1`(그 소켓만 종전 welcome) · 받은 짐은 페이지 안에서 센다(welcome 은 길 칸 · 건물 자리를 적는다)
async function openPage(browser, opt) {
  opt = opt || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(([full, zp, np]) => {
    //   소리 끔 — 헤드리스 WebKit(WPE)은 소리 길(GStreamer · 장치 없음)에서 몇 분 안에 죽는다(`t1453-load-repro.js` 머리말) · 이 하네스는 소리를 안 잰다
    try { window.AudioContext = undefined; window.webkitAudioContext = undefined; } catch (e) {}
    window.__t1453Rx = []; window.__t1453Wel = {};
    if (full) {
      const W0 = window.WebSocket;
      const W1 = function (url, p) { if (typeof url === 'string' && (url.indexOf(':' + zp) >= 0 || url.indexOf(':' + np) >= 0)) url += (url.indexOf('?') >= 0 ? '&' : '?') + 't1453full=1'; return p === undefined ? new W0(url) : new W0(url, p); };
      W1.prototype = W0.prototype; W1.CONNECTING = 0; W1.OPEN = 1; W1.CLOSING = 2; W1.CLOSED = 3;
      window.WebSocket = W1;
    }
    const D = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return D.get.call(this); }, set(fn) {
      const url = this.url || '', zone = url.indexOf(':' + zp) >= 0 ? 'hanbando' : url.indexOf(':' + np) >= 0 ? 'jungwon_n' : null;
      D.set.call(this, typeof fn !== 'function' || !zone ? fn : function (ev) {
        try {
          const d = ev.data;
          if (typeof d === 'string') {
            const m = /^\{"type":"([a-z_0-9]+)"/.exec(d.slice(0, 48)), ty = m ? m[1] : '?';
            if (window.__t1453Rx.length < 100000) window.__t1453Rx.push([zone, ty, d.length]);
            if (ty === 'welcome' && !window.__t1453Wel[zone]) {
              const o = JSON.parse(d), r = o.roads || [];
              window.__t1453Wel[zone] = { roads: r.length / 3, cells: r.length <= 300000 ? r : null, self: o.self ? { x: o.self.x, y: o.self.y } : null,
                blds: (o.buildings || []).length, bxy: (o.buildings || []).length <= 60000 ? (o.buildings || []).map((b) => [b.x, b.y]) : null };
            }
          }
        } catch (e) {}
        return fn.call(this, ev);
      });
    } });
  }, [!!opt.full, ZPORT, NPORT]);
  if (opt.patch) for (const [file, src] of Object.entries(opt.patch)) {
    await page.route(new RegExp('/client/' + file.replace('.', '\\.') + '(\\?|$)'), (route) => route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: src }));
  }
  await page.goto(`http://localhost:${CPORT}/${opt.q || ''}`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) s.value = 'hanbando'; return !!o; }, null, { timeout: 60000, polling: 250 }).catch(() => {});
  try { await page.click('#enter'); } catch (e) {}
  const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId() === 'hanbando' && window.__t1446), null, { timeout: 120000 }).then(() => true).catch(() => false);
  if (entered) await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); if (window.__terrain19) window.__terrain19.windOff = true; });
  return { ctx, page, errs, entered };
}
async function goTo(page, sp, needNeighbor) {   // 서버 권위로 도착 · 이웃 존 관측 접속 · 카메라 멈춤 · 그 틱 청크 몫이 닿을 틈
  let arrived = false;
  for (let tries = 0; tries < 4 && !arrived; tries++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [sp.x, sp.y]);
    arrived = await page.waitForFunction(([x, y]) => { const c = conns.get('hanbando'); const m = window.__getSrvAbs ? window.__getSrvAbs() : null;
      return !!(c && c.meta && m) && Math.abs(m.x - c.meta.worldOffsetX - x) < 48 && Math.abs(m.y - (c.meta.worldOffsetY || 0) - y) < 48; }, [sp.x, sp.y], { timeout: 30000, polling: 250 }).then(() => true).catch(() => false);
  }
  if (needNeighbor) await page.waitForFunction(() => { const c = conns.get('jungwon_n'); return !!(c && c.meta && c.roads && c.roads.size > 0); }, null, { timeout: 45000, polling: 250 }).catch(() => {});
  await sleep(needNeighbor ? 2600 : 1500);   // 관측 소켓 자리 알림(1초마다) · 다음 틱 청크 몫
  await page.waitForFunction(() => new Promise((res) => { const a = window.__fogOrigin && { ...window.__fogOrigin };
    requestAnimationFrame(() => requestAnimationFrame(() => { const b = window.__fogOrigin; res(!!(a && b && a.x === b.x && a.y === b.y)); })); }), null, { timeout: 20000, polling: 200 }).catch(() => {});
  //   자연물 청크가 다 구워질 때까지(T920 — 판마다 다섯 장씩 · 덜 구우면 끔 ↔ 켬 두 판 사이에 소품이 는다)
  await page.waitForFunction(() => !!(window.__natDbg && window.__natDbg.pending === 0 && window.__groundDbg), null, { timeout: 30000, polling: 250 }).catch(() => {});
  return arrived;
}
const KINDS = ['road', 'building', 'hutroof', 'cellprop', 'stair_cell'];
async function capture(page) {   // 그린 목록(길 · 건물 고리가 내는 종류) + 자연물 자리
  return page.evaluate(async (kinds) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__t1446.cap(); for (let i = 0; i < 40 && !window.__t1446.capOut(); i++) await frame();
    const L = (window.__t1446.capOut() || []).filter((s) => kinds.includes(s.slice(0, s.indexOf('|'))));
    await frame();
    return { L, props: _natLastPr.map((p) => p.x + ',' + p.y + ',' + p.nm) };
  }, KINDS);
}
//   같은 z 끼리 차례는 받은 차례 — z(넷째 칸) 안에서만 줄 세워 맞댄다 · 차례가 달랐던 z 묶음 수를 같이 센다
function normZ(L) { const out = []; let i = 0; while (i < L.length) { const z = L[i].split('|')[3]; let j = i; while (j < L.length && L[j].split('|')[3] === z) j++; out.push(...L.slice(i, j).sort()); i = j; } return out; }
function compare(a, b) {
  const A = normZ(a.L), B = normZ(b.L);
  let first = -1; for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) { first = i; break; }
  let tie = 0; { let i = 0; while (i < a.L.length) { const z = a.L[i].split('|')[3]; let j = i; while (j < a.L.length && a.L[j].split('|')[3] === z) j++; const x = a.L.slice(i, j).join('\n'), y = (b.L.slice(i, j)).join('\n'); if (x !== y) tie++; i = j; } }
  const pa = a.props.slice().sort().join(';'), pb = b.props.slice().sort().join(';');
  const cnt = (L, k) => L.filter((s) => s.startsWith(k + '|')).length;
  const zones = (L) => { let w = 0, e = 0; for (const s of L) { if (!s.startsWith('road|')) continue; if (+s.split('|')[1] < 409984) w++; else e++; } return [w, e]; };
  return { same: first < 0, first, a: first >= 0 ? A[first] || null : null, b: first >= 0 ? B[first] || null : null, tie, propsSame: pa === pb, props: a.props.length, propsB: b.props.length,
    roads: cnt(a.L, 'road'), roadsB: cnt(b.L, 'road'), blds: cnt(a.L, 'building'), bldsB: cnt(b.L, 'building'), roofs: cnt(a.L, 'hutroof'), zones: zones(a.L), zonesB: zones(b.L) };
}
async function natPair(page, zoom) {   // 같은 페이지 · 같은 자리 — 끔 ↔ 켬 자연물 자리
  return page.evaluate(async (zoom) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (zoom) { window.__setZoom(zoom); await frame(); }
    window.__t1453.setNat(false); await frame(); const A = _natLastPr.map((p) => p.x + ',' + p.y + ',' + p.nm);
    window.__t1453.setNat(true); await frame(); const B = _natLastPr.map((p) => p.x + ',' + p.y + ',' + p.nm);
    if (zoom) { window.__setZoom(1); await frame(); }
    return { same: A.join(';') === B.join(';'), a: A.length, b: B.length };
  }, zoom || 0);
}
//   같음 대조 점 — 길 칸 · 건물 둘레(존마다 · `natPts`) + 화면 상자(카메라 ± 1,500px) 고른 점 1,500
async function natCheck(page, n, seed) { return page.evaluate(([n, seed]) => { const O = window.__fogOrigin; let r = seed >>> 0 || 1; const rnd = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 4294967296; };
  const pts = window.__t1453.natPts(n, seed); for (let i = 0; i < 1500; i++) pts.push([O.x + (rnd() - 0.5) * 3000, O.y + (rnd() - 0.5) * 3000]);
  //   건물 둘레 고리 — 건물 칸 둘레 여덟 칸 중 길도 · 다른 건물 칸도 아닌 칸(종전 Set 에서 3×3 으로만 막히는 칸 · 존마다 건물 2,000채까지)
  let ring = 0;
  for (const c of conns.values()) { if (!c.meta || !c.buildings || !c.buildings.size) continue; const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
    const bc = new Set(); for (const b of c.buildings.values()) bc.add(Math.floor((ox + b.x) / 32) + ',' + Math.floor((oy + b.y) / 32));
    const ocx = Math.round(ox / 32), ocy = Math.round(oy / 32); let k = 0;
    for (const b of c.buildings.values()) { if (k++ >= 2000) break; const cx = Math.floor((ox + b.x) / 32), cy = Math.floor((oy + b.y) / 32);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { if (!i && !j) continue; const x = cx + i, y = cy + j;
        if (bc.has(x + ',' + y) || (c.roads && c.roads.has((x - ocx) + ',' + (y - ocy)))) continue; pts.push([x * 32 + 16, y * 32 + 16]); ring++; } } }
  const out = window.__t1453.natCheck(pts); out.ring = ring; return out; }, [n, seed]); }
//   고침 — 자연물이 선 칸 60곳에 길을 낸다(방송 입구 그대로) · 그 칸 소품이 두 갈래 다 걷히나 · 다시 지우면 돌아오나 · 건물 하나를 소품 곁에 놓고 걷는다
async function editRun(page) {
  return page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const zid = 'hanbando', c = conns.get(zid), ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0, T = window.__t1453;
    const key = (p) => p.x + ',' + p.y;
    const drawn = async (on) => { T.setNat(on); await frame(); return new Set(_natLastPr.map(key)); };
    const P0 = _natLastPr.slice();
    if (P0.length < 20) return { err: '소품이 모자라다 ' + P0.length };
    const pick = P0.filter((p, i) => i % 2 === 0).slice(0, 60), cells = [];
    const want = new Set();
    for (const p of pick) { const lx = Math.floor((p.x - ox) / 32), ly = Math.floor((p.y - oy) / 32); if (c.roads.has(lx + ',' + ly)) continue; cells.push(lx, ly, 1); want.add(key(p)); }
    handleMessage(zid, { type: 'road_cells', cells }, c);
    const on1 = await drawn(true), off1 = await drawn(false);
    let leftOn = 0, leftOff = 0; for (const k of want) { if (on1.has(k)) leftOn++; if (off1.has(k)) leftOff++; }
    const chk1 = T.natCheck(pick.map((p) => [p.x, p.y]).concat(T.natPts(400, 77)));
    const del = []; for (let i = 0; i < cells.length; i += 3) del.push(cells[i], cells[i + 1], 0);
    handleMessage(zid, { type: 'road_cells', cells: del }, c);
    const on2 = await drawn(true), off2 = await drawn(false);
    let backOn = 0, backOff = 0; for (const k of want) { if (on2.has(k)) backOn++; if (off2.has(k)) backOff++; }
    //   건물 — 소품 칸의 **옆 칸**(동쪽 한 칸)에 상자 하나 · 소품은 그 3×3 고리에 선다(가운데 칸이 아니다) · 걷힌다 · 걷으면 돌아온다
    const q = P0[P0.length >> 1], bx = Math.floor(q.x / 32) * 32 + 32 + 16 - ox, by = Math.floor(q.y / 32) * 32 + 16 - oy;
    handleMessage(zid, { type: 'building_added', building: { id: 't1453_probe', type: 'chest', x: bx, y: by, floor: 0, data: {} } }, c);
    const on3 = await drawn(true), off3 = await drawn(false);
    const ring = [[q.x, q.y]]; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) ring.push([ox + bx + i * 32, oy + by + j * 32]);
    const chk3 = T.natCheck(ring);
    handleMessage(zid, { type: 'buildings_removed', ids: ['t1453_probe'] }, c);
    const on4 = await drawn(true), off4 = await drawn(false);
    T.setNat(true);
    return { roads: want.size, leftOn, leftOff, backOn, backOff, chk1, bGoneOn: !on3.has(key(q)), bGoneOff: !off3.has(key(q)), bBackOn: on4.has(key(q)), bBackOff: off4.has(key(q)), chk3 };
  });
}
//   다시 굽기 — 건물 수가 바뀐 바로 다음 자연물 모으기 한 판 ms(끔 = 종전 통째로 굽기 · 켬 = 물음)
async function rebuildMs(page) {
  return page.evaluate(() => {
    const zid = 'hanbando', c = conns.get(zid), O = window.__fogOrigin, T = window.__t1453;
    const one = (on, id) => { T.setNat(on); const o0 = []; _natCollect(o0, O.x, O.y);
      handleMessage(zid, { type: 'building_added', building: { id, type: 'chest', x: -9999, y: -9999, floor: 0, data: {} } }, c);
      const t = performance.now(); const o = []; _natCollect(o, O.x, O.y); const ms = performance.now() - t;
      handleMessage(zid, { type: 'buildings_removed', ids: [id] }, c); return ms; };
    const off = [one(false, 't1453_rb1'), one(false, 't1453_rb2'), one(false, 't1453_rb3')].sort((a, b) => a - b)[1];
    const on = [one(true, 't1453_rb4'), one(true, 't1453_rb5'), one(true, 't1453_rb6')].sort((a, b) => a - b)[1];
    T.setNat(true);
    return { off: +off.toFixed(2), on: +on.toFixed(2) };
  });
}
async function rx(page, from) { return page.evaluate((i) => window.__t1453Rx.slice(i), from || 0); }
const kb = (L, zone, ty) => +(L.filter((m) => m[0] === zone && m[1] === ty).reduce((a, m) => a + m[2], 0) / 1024).toFixed(1);
//   B 의 welcome 길이 들어간 자리 둘레(±2 청크)의 심은 칸과 같은가
function welcomeBox(wel) {
  if (wel && wel.roads && !wel.cells) return { ok: false, got: wel.roads, out: wel.roads, why: '30만 칸 넘음 — 둘레 밖이 섞였다' };
  if (!wel || !wel.self || !wel.cells) return { ok: false, why: '기록 없음' };
  const pcx = Math.floor(wel.self.x / 1024), pcy = Math.floor(wel.self.y / 1024);
  const inBox = (cx, cy) => Math.abs(Math.floor(cx / 32) - pcx) <= 2 && Math.abs(Math.floor(cy / 32) - pcy) <= 2;
  const want = new Set(); for (let i = 0; i < RD.flat.length; i += 3) if (inBox(RD.flat[i], RD.flat[i + 1])) want.add(RD.flat[i] + ',' + RD.flat[i + 1] + ',' + RD.flat[i + 2]);
  const got = new Set(); let out = 0; for (let i = 0; i < wel.cells.length; i += 3) { got.add(wel.cells[i] + ',' + wel.cells[i + 1] + ',' + wel.cells[i + 2]); if (!inBox(wel.cells[i], wel.cells[i + 1])) out++; }
  let miss = 0; for (const k of want) if (!got.has(k)) miss++;
  let bOut = 0; for (const [x, y] of (wel.bxy || [])) if (Math.abs(Math.floor(x / 1024) - pcx) > 2 || Math.abs(Math.floor(y / 1024) - pcy) > 2) bOut++;
  return { ok: miss === 0 && out === 0 && want.size > 0, want: want.size, got: got.size, miss, out, blds: wel.blds, bOut };
}

// ══ Ⓒ 서버 같은 식(노드 · 브라우저 없음) ══════════════════════════════════════════════
function serverSame() {
  const R = require(path.join(ROOT, 'server', 'roads.js')), S = R._S;
  const W = 300, H = 260, rnd = SY.rng(14530);
  S.ready = true; S.cellsW = W; S.cellsH = H; S.dayMs = 1e9; S.epoch = Date.now() - 10.5e9; S.cells = new Map(); S.dirty = new Set();
  const VS = [7.9, 8, 8.04, 8.5, 9, 27.9, 28, 28.2, 29, 15, 60, 120, 1.2];
  for (let i = 0; i < 30000; i++) { const cx = Math.floor(rnd() * W), cy = Math.floor(rnd() * H); S.cells.set(cy * W + cx, { v: VS[Math.floor(rnd() * VS.length)] + (rnd() < 0.3 ? rnd() * 0.01 : 0), d: Math.floor(rnd() * 11) }); }
  const snap = JSON.stringify([...S.cells]);
  const all = R.clientRoads() || [], A = new Set(); for (let i = 0; i < all.length; i += 3) A.add(all[i] + ',' + all[i + 1] + ',' + all[i + 2]);
  const B = new Set(); let rowOk = true;
  for (let by = 0; by < H; by += 32) for (let bx = 0; bx < W; bx += 32) {
    const o = R.clientRoadsIn(bx, by, 32, 32, []);
    for (let i = 0; i < o.length; i += 3) { B.add(o[i] + ',' + o[i + 1] + ',' + o[i + 2]); if (i >= 3 && (o[i + 1] < o[i - 2] || (o[i + 1] === o[i - 2] && o[i] <= o[i - 3]))) rowOk = false; }
  }
  let diff = 0; for (const k of A) if (!B.has(k)) diff++; for (const k of B) if (!A.has(k)) diff++;
  const lv = { 1: 0, 2: 0 }; for (const k of A) lv[k.split(',')[2]]++;
  return { a: A.size, b: B.size, diff, rowOk, pure: JSON.stringify([...S.cells]) === snap && S.dirty.size === 0, lv };
}

(async () => {
  say(`=== 자연물 막음 물음 · 화면 둘레만 보내기 — 같음 · 고침 · 이웃 존 · 다시 굽기 · 미끼 여섯 (T1453 · ${BROWSER}) ===`);
  const sd = seedAll();
  say(`  심은 길: 한반도 ${sd.han}칸(라이브 크기) · 이웃 존 띠 ${sd.jn}칸 · 자리 서쪽 끝 (${WSPOT.x}, ${WSPOT.y}) · 북 (${WSPOT2.x}, ${WSPOT2.y})`);
  const PW = require('playwright');
  const browser = await PW[BROWSER].launch({ headless: !HEADED });
  const done = async () => { await browser.close().catch(() => {}); killAll(); for (const f of Object.values(DB0)) for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(f + s); } catch (e) {} say(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(fail ? 1 : 0); };

  // ══ Ⓒ ════════════════════════════════════════════════════════════════════════
  say('\nⒸ 서버 같은 식 — 상자마다 모은 `clientRoadsIn` = `clientRoads()`');
  { let r = null, why = ''; try { r = serverSame(); } catch (e) { why = String(e && e.message || e); }
    if (!r) ok(false, 'Ⓒ1 칸 · 등급 같다(감쇠 문턱 근처 값 · 상자 안 줄 차례 · 읽기만)', '못 잼 — ' + why); else
    ok(r.diff === 0 && r.a > 1000 && r.lv[1] > 100 && r.lv[2] > 100 && r.rowOk && r.pure, 'Ⓒ1 칸 · 등급 같다(감쇠 문턱 근처 값 · 상자 안 줄 차례 · 읽기만)', `clientRoads ${r.a} · 상자 모음 ${r.b} · 다름 ${r.diff} · 등급 1 ${r.lv[1]} · 2 ${r.lv[2]} · 줄 차례 ${r.rowOk} · 셀 · dirty 무접촉 ${r.pure}`); }

  // ══ Ⓑ0 끔 서버 ═══════════════════════════════════════════════════════════════
  say('\nⒷ0 끔 서버 — welcome 길이 존 전체(종전 그대로)');
  {
    const why = await bootWorld({ vs: 0, vil: '0', nb: false });
    const P = why ? null : await openPage(browser, {});
    const w = P && P.entered ? await P.page.evaluate(() => window.__t1453Wel.hanbando || null) : null;
    ok(!why && !!w && w.roads >= RD.flat.length / 3, 'Ⓑ0 끔(`T1453_VIEW_SEND` 없음) — welcome 길 = 심은 길 전부', why || `welcome 길 ${w && w.roads} · 심은 ${RD.flat.length / 3}`);
    if (P) await P.ctx.close();
  }

  // ══ 켬 세계 — 마을 켬 · 몸 청크 켬(다른 마을 청크가 켜져 있다 = 켜졌는데 안 실은 청크) · 이웃 존 ════════════════════════
  say('\n(켬 세계를 띄운다 — 마을 켬 · 몸 청크 켬 · 이웃 존 jungwon_n · `T1453_VIEW_SEND=1`)');
  { const why = await bootWorld({ vs: 1, vil: '1', body: '1', nb: true }); if (why) { ok(false, '켬 세계를 띄운다', why); return done(); } }
  const A = await openPage(browser, { full: true });
  const B = await openPage(browser, {});
  ok(A.entered && B.entered, 'Ⓐ1 두 소켓이 들어간다(A = 종전 welcome `t1453full=1` · B = 둘레)');
  if (!A.entered || !B.entered) return done();
  await goTo(A.page, SPOTS.dense); await goTo(B.page, SPOTS.dense);

  // ══ Ⓐ 자연물 막음 ═════════════════════════════════════════════════════════════
  say('\nⒶ 자연물 막음 — 끔(종전 Set) ↔ 켬(색인 물음)');
  {
    const st = await A.page.evaluate(() => { const c = conns.get('hanbando'); return { roads: c.roads.size, blds: c.buildings.size, nat: window.__t1453.nat(), ix: !!(c.roads._ix && !c.roads._bad) }; });
    ok(st.roads >= RD.flat.length / 3 && st.blds > 1000 && st.nat === true && st.ix, 'Ⓐ1 ★전제 — A 에 길 45만 칸 · 건물이 다 들었다 · 손잡이 기본 켬 · 길 색인', `길 ${st.roads} · 건물 ${st.blds} · 켬 ${st.nat}`);
    const O = await openPage(browser, { full: true, q: '?T1453_NAT_QUERY=0' });
    const off = O.entered ? await O.page.evaluate(() => window.__t1453.nat()) : null;
    ok(off === false, 'Ⓐ2 끔 주소(`?T1453_NAT_QUERY=0`) — 끔', `nat ${off}`);
    await O.ctx.close();
  }
  const natAt = async (key, nb) => {
    const arr = await goTo(A.page, SPOTS[key], nb);
    const k = await natCheck(A.page, 3000, 1453);
    const z = []; for (const zm of [0, 1.5, 2]) z.push(await natPair(A.page, zm));
    return { arr, k, z };
  };
  for (const key of ['dense', 'sparse', 'edge', 'west']) {
    const r = await natAt(key, key === 'west');
    ok(r.arr && r.k.diff === 0 && r.k.nullN === 0 && r.k.hitOld > 300 && r.k.hitOld < r.k.n && r.k.ring > 100, `Ⓐ3 ${SPOTS[key].name} — 같음 대조 다름 0(막힘 · 안 막힘 · 건물 3×3 로만 막히는 고리 칸이 다 있다)`, `점 ${r.k.n}(고리 ${r.k.ring}) · 막힘 ${r.k.hitOld}/${r.k.hitNew} · 다름 ${r.k.diff}${r.k.bad.length ? ' · 첫 다름 ' + JSON.stringify(r.k.bad[0]) : ''}`);
    ok(r.z.every((x) => x.same) && r.z[0].a > 0, `Ⓐ4 ${SPOTS[key].name} — 그린 자연물 끔 ↔ 켬 같다(확대 1 · 1.5 · 2)`, r.z.map((x) => `${x.a}/${x.b}${x.same ? '' : ' 다름'}`).join(' · '));
  }
  await goTo(A.page, SPOTS.sparse);
  {
    const e = await editRun(A.page);
    if (e.err) e.chk1 = e.chk3 = { diff: -1 };
    ok(e.roads >= 20 && e.leftOn === 0 && e.leftOff === 0 && e.chk1.diff === 0 && e.backOn === e.roads && e.backOff === e.roads, 'Ⓐ5 길을 낸 칸의 자연물이 두 갈래 다 걷히고 · 지우면 돌아온다(같음 대조 다름 0)',
      `길 낸 칸 ${e.roads} · 남은 소품 켬 ${e.leftOn} · 끔 ${e.leftOff} · 다름 ${e.chk1.diff} · 돌아옴 켬 ${e.backOn} · 끔 ${e.backOff}`);
    ok(e.bGoneOn && e.bGoneOff && e.bBackOn && e.bBackOff && e.chk3.diff === 0, 'Ⓐ5b 건물을 놓으면 그 3×3 소품이 두 갈래 다 걷히고 · 걷으면 돌아온다', `걷힘 ${e.bGoneOn}/${e.bGoneOff} · 돌아옴 ${e.bBackOn}/${e.bBackOff} · 다름 ${e.chk3.diff}`);
  }
  {
    const r = await rebuildMs(A.page);
    ok(r.off >= 20 && r.on <= Math.max(2, r.off * 0.05), 'Ⓐ6 다시 굽기 0 — 건물 수가 바뀐 바로 다음 자연물 모으기: 켬 ≤ 끔 × 0.05(끔은 존 전체를 다시 굽는다)', `끔 ${r.off} ms → 켬 ${r.on} ms`);
  }

  // ══ Ⓑ 화면 둘레만 보내기 ═════════════════════════════════════════════════════
  say('\nⒷ 화면 둘레만 보내기 — 같은 세계 · 같은 때 A(종전 welcome) ↔ B(둘레)');
  //   B 가 먼저 간다(B 소켓 몫이 오는지 · A 는 이미 가졌다) — 서버가 흘리는 건물(몸 청크 켜짐 · 꺼짐 방송)이 두 캡처 사이에 끼면 세 번까지 다시 잰다.
  //   맞대는 종전 쪽은 **그 자리에서 새로 붙은 종전 welcome 페이지(F)** — 마을 몸이 그날 밟아 문턱을 넘은 칸(하루 방송 전)은 늦게 받은 쪽이 새 값이라
  //   일찍 붙은 A 와는 다를 수 있다(Ⓑ6 이 그 칸을 따로 본다). 이웃 존(마을 끔 · 몸 0)은 A 로 맞댄다.
  const pair = async (key, nb) => {
    const F = nb ? A : await openPage(browser, { full: true });
    try {
      const b1 = await goTo(B.page, SPOTS[key], nb), a1 = await goTo(F.page, SPOTS[key], nb);
      let r = null; for (let k = 0; k < 3; k++) { r = compare(await capture(F.page), await capture(B.page)); if (r.same && r.propsSame) break; await sleep(1500); }
      return { arr: a1 && b1, r };
    } finally { if (F !== A) await F.ctx.close(); }
  };
  const wB = await B.page.evaluate(() => window.__t1453Wel.hanbando || null), wA = await A.page.evaluate(() => window.__t1453Wel.hanbando || null);
  { const w = welcomeBox(wB);
    ok(w.ok && wA && wA.roads >= RD.flat.length / 3 && w.got < wA.roads * 0.05 && w.bOut === 0, 'Ⓑ1 켬 welcome — B 의 길 = 들어간 자리 둘레(±2 청크)의 심은 칸(칸 · 등급) · 건물은 다 둘레 청크 안 · A 는 전부',
      `B 길 ${w.got}(바랄 ${w.want} · 빠짐 ${w.miss} · 둘레 밖 ${w.out}) · B 건물 ${w.blds}(둘레 밖 ${w.bOut}) · A 길 ${wA && wA.roads} · A 건물 ${wA && wA.blds}`); }
  for (const key of ['dense', 'sparse', 'edge']) {
    const { arr, r } = await pair(key, false);
    ok(arr && r.same && r.propsSame && r.roads > 0 && (key !== 'dense' || (r.blds > 50 && r.props > 0)), `Ⓑ2 ${SPOTS[key].name} — 그린 것 같음(A ↔ B · 같은 z 안 차례만 받은 차례)`,
      `길 ${r.roads}/${r.roadsB} · 건물 ${r.blds}/${r.bldsB} · 지붕 ${r.roofs} · 자연물 ${r.props}/${r.propsB} · 같은 z 차례 다른 묶음 ${r.tie}${r.same ? '' : ` · 첫 다름 #${r.first} ${r.a} ≠ ${r.b}`}`);
  }
  {   // 떠났다 돌아옴 — 마을 가운데(들어간 자리 · 이미 받은 청크)로
    const n0 = (await rx(B.page, 0)).length;
    const { arr, r } = await pair('dense', false);
    const L = await rx(B.page, n0);
    ok(arr && r.same && kb(L, 'hanbando', 'road_cells') === 0, 'Ⓑ3 떠났다 돌아옴 — 이미 받은 청크 길은 다시 안 온다(길 짐 0) · 그린 것 같음', `돌아올 때 길 짐 ${kb(L, 'hanbando', 'road_cells')} kB · 건물 짐 ${kb(L, 'hanbando', 'buildings_spawn')} kB · 길 ${r.roads}/${r.roadsB}${r.same ? '' : ` · 첫 다름 #${r.first} ${r.a} ≠ ${r.b}`}`);
  }
  {   // 켜졌는데 안 실은 청크 — A(종전 welcome)가 가진 건물이 가장 많은 다른 마을(B 의 들어간 둘레 밖 · 몸이 켜 둔 청크) 가운데로 B 가 먼저 간다
    const pick = await A.page.evaluate(([vils, at]) => { const c = conns.get('hanbando'); const n = new Array(vils.length).fill(0);
      for (const b of c.buildings.values()) for (let i = 0; i < vils.length; i++) { const v = vils[i]; if (Math.abs(b.x - v[0]) < 900 && Math.abs(b.y - v[1]) < 900) { n[i]++; break; } }
      let best = -1; for (let i = 0; i < vils.length; i++) { if (Math.abs(vils[i][0] - at[0]) < 6000 && Math.abs(vils[i][1] - at[1]) < 6000) continue; if (best < 0 || n[i] > n[best]) best = i; }
      return best < 0 ? null : { i: best, n: n[best], x: vils[best][0], y: vils[best][1] }; }, [V.vils.map((v) => [v.cx * 32 + 16, v.cy * 32 + 16]), [SPOTS.dense.x, SPOTS.dense.y]]);
    if (pick) SPOTS.vil2 = { x: pick.x, y: pick.y, name: `${V.vils[pick.i].name} 가운데(몸이 켜 둔 다른 마을 · A 건물 ${pick.n})` };
    const n0 = (await rx(B.page, 0)).length, na0 = (await rx(A.page, 0)).length;
    const p0 = pick ? await pair('vil2', false) : null;
    const L0 = await rx(B.page, n0), LA0 = await rx(A.page, na0);
    const bk = kb(L0, 'hanbando', 'buildings_spawn'), ak = kb(LA0, 'hanbando', 'buildings_spawn');
    ok(!!p0 && p0.arr && p0.r.same && p0.r.blds > 20 && bk > ak, 'Ⓑ5 켜졌는데 안 실은 청크(몸이 켜 둔 다른 마을) — 그 건물이 B 소켓 몫으로 와서(B 짐 > A 켜짐 방송 짐) 그린 건물 같음',
      p0 ? `${SPOTS.vil2.name} · 건물 ${p0.r.blds}/${p0.r.bldsB} · B 건물 짐 ${bk} kB · A 건물 짐 ${ak} kB · B 길 짐 ${kb(L0, 'hanbando', 'road_cells')} kB${p0.r.same ? '' : ` · 첫 다름 #${p0.r.first} ${p0.r.a} ≠ ${p0.r.b}`}` : '마을을 못 골랐다');
  }
  {   // 이웃 존 — 서쪽 끝 · 경계를 따라 북으로(관측 둘레가 바뀐다)
    const p1 = await pair('west', true);
    const n1 = (await rx(B.page, 0)).length;
    const p2 = await pair('west2', true);
    const L2 = await rx(B.page, n1);
    const nbSt = await B.page.evaluate(() => { const c = conns.get('jungwon_n'); return c ? { roads: c.roads.size } : null; });
    ok(p1.arr && p1.r.same && p1.r.zones[0] > 0 && p1.r.zones[1] > 0, 'Ⓑ4 존 서쪽 끝 — 두 존 길이 다 그려지고 A ↔ B 같다', `이웃 길 ${p1.r.zones[0]}/${p1.r.zonesB[0]} · 주 ${p1.r.zones[1]}/${p1.r.zonesB[1]} · B 이웃 welcome 길 ${(await B.page.evaluate(() => window.__t1453Wel.jungwon_n || {})).roads}${p1.r.same ? '' : ` · 첫 다름 #${p1.r.first} ${p1.r.a} ≠ ${p1.r.b}`}`);
    ok(p2.arr && p2.r.same && p2.r.zones[0] > 0 && kb(L2, 'jungwon_n', 'road_cells') > 0, 'Ⓑ4b 경계를 따라 북으로 3,000px — 이웃 존 새 청크 길이 그 소켓 몫으로 와서 A ↔ B 같다', `이웃 길 ${p2.r.zones[0]}/${p2.r.zonesB[0]} · 이웃 청크 길 짐 ${kb(L2, 'jungwon_n', 'road_cells')} kB · B 이웃 길 ${nbSt && nbSt.roads}${p2.r.same ? '' : ` · 첫 다름 #${p2.r.first} ${p2.r.a} ≠ ${p2.r.b}`}`);
  }
  {   // B 가 든 길 = A 의 일부 — 다른 칸은 B 가 늦게 받아 새 값인 칸뿐이어야 한다(그날 밟혀 문턱을 넘은 칸 · 하루 방송 전): 지금 종전 welcome(C)과 같다
    const s = await Promise.all([A.page, B.page].map((p) => p.evaluate(() => ({ n: conns.get('hanbando').roads.size }))));
    const sub = await B.page.evaluate(() => [...conns.get('hanbando').roads]);
    const bad = await A.page.evaluate((ks) => { const c = conns.get('hanbando'); const out = []; for (const [k, v] of ks) if (c.roads.get(k) !== v) out.push([k, v, c.roads.get(k) || 0]); return out; }, sub);
    //   A ≠ B 인 칸마다 지금 값(C — 마지막에 붙은 종전 welcome): C = B(B 가 새 값) 이거나 C ≠ A(A 뒤에 값이 바뀐 칸)면 시간으로 풀린다 · C = A ≠ B 면 B 가 틀렸다
    let fresh = 0, moved = 0, wrong = 0;
    if (bad.length) { const C = await openPage(browser, { full: true });
      if (C.entered) { const r = await C.page.evaluate((bs) => { const c = conns.get('hanbando'); let f = 0, m = 0, w = 0; for (const [k, b, a] of bs) { const v = c.roads.get(k) || 0; if (v === b) f++; else if (v !== a) m++; else w++; } return [f, m, w]; }, bad); [fresh, moved, wrong] = r; }
      else wrong = bad.length;
      await C.ctx.close(); }
    ok(s[1].n > 0 && s[1].n < s[0].n * 0.2 && wrong === 0, 'Ⓑ6 B 가 든 길은 A 의 일부(칸 · 등급) — 다녀간 둘레 몫만 · 다른 칸은 다 그날 값이 바뀐 칸(지금 값 C 가 B 와 같거나 A 와 다르다)',
      `B ${s[1].n} · A ${s[0].n} · A 와 다른 칸 ${bad.length}(C = B ${fresh} · C ≠ A ${moved} · 틀림 ${wrong})${bad.length ? ' · 예 ' + JSON.stringify(bad.slice(0, 3)) : ''}`);
  }
  ok(A.errs.length === 0 && B.errs.length === 0, 'Ⓑ7 페이지 오류 0', A.errs.concat(B.errs).slice(0, 2).join(' | '));

  // ══ Ⓓ 미끼 ═════════════════════════════════════════════════════════════════
  say('\nⒹ 미끼 여섯 — 클라는 서버가 내주는 글자를 그 자리에서 · 서버는 존 아이 프리로드가 컴파일 직전에 바꾼 사본');
  const SRC = { c: await (await fetch(`http://localhost:${CPORT}/client/00-const.js`)).text() };
  const baitPage = async (patch, fn) => { const P = await openPage(browser, { full: true, patch }); try { return P.entered ? await fn(P.page) : null; } finally { await P.ctx.close(); } };
  {   // ① 물음이 길을 안 본다
    const B1 = LB.swap(SRC.c, 'if (R && R.size && R._has(acx - Math.round(ox / 32), acy - Math.round(oy / 32))) hit = true;\n      else if (B && B.size && B._near(acx, acy)) hit = true;', 'if (B && B.size && B._near(acx, acy)) hit = true;');
    const r = await baitPage({ '00-const.js': B1.src }, async (p) => { await goTo(p, SPOTS.dense); return natCheck(p, 3000, 1453); });
    ok(B1.n === 1 && !!r && r.diff > 0, '미끼 ① 자연물이 길 위에 서는 사본 → Ⓐ3 빨강', `바꾼 자리 ${B1.n} · 다름 ${r && r.diff}`);
  }
  {   // ② 건물 3×3 → 가운데 칸만
    const B2 = LB.swap(SRC.c, 'for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {\n        const k = _t1453Ck(bx + i, by + j)', 'for (let j = 0; j <= 0; j++) for (let i = 0; i <= 0; i++) {\n        const k = _t1453Ck(bx + i, by + j)');
    const r = await baitPage({ '00-const.js': B2.src }, async (p) => { await goTo(p, SPOTS.sparse); const e = await editRun(p); if (e.err) e.chk3 = { diff: -1 }; return e; });
    ok(B2.n === 1 && !!r && (!r.bGoneOn || r.chk3.diff > 0), '미끼 ② 건물 3×3 안에 서는 사본 → Ⓐ5b 빨강(옆 칸 건물의 고리에 선 소품이 켬에서 안 걷힌다)', `바꾼 자리 ${B2.n} · 켬 걷힘 ${r && r.bGoneOn} · 다름 ${r && r.chk3 && r.chk3.diff}`);
  }
  {   // ③ 새 칸 자리표를 안 고친다
    const B3 = LB.swap(SRC.c, 'else { B.k.push(ik); B.s.push(++this._seq * 8 + v); B.m[ik] = 1; }', 'else { B.k.push(ik); B.s.push(++this._seq * 8 + v); }');
    const r = await baitPage({ '00-const.js': B3.src }, async (p) => { await goTo(p, SPOTS.sparse); const a = await natCheck(p, 3000, 1453); const e = await editRun(p); if (e.err) e.chk1 = { diff: -1 }; return { a, e }; });
    ok(B3.n === 1 && !!r && r.a.diff === 0 && (r.e.leftOn > 0 || r.e.chk1.diff > 0), '미끼 ③ 길이 새로 난 뒤 그 칸 자연물이 안 걷히는 사본 → Ⓐ5 빨강(welcome 직후 Ⓐ3 은 초록)', `바꾼 자리 ${B3.n} · welcome 다름 ${r && r.a.diff} · 고친 뒤 남은 소품 켬 ${r && r.e.leftOn} · 다름 ${r && r.e.chk1.diff}`);
  }
  await A.ctx.close(); await B.ctx.close();
  const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const serverBait = async (from, to, nb, fn) => {
    const n = LB.count(ZSRC, from);
    const why = await bootWorld({ vs: 1, vil: '0', nb, bait: { file: 'server/zone.js', from, to } });
    if (why) return { n, r: null, why };
    const Pa = await openPage(browser, { full: true }), Pb = await openPage(browser, {});
    try { return { n, r: (Pa.entered && Pb.entered) ? await fn(Pa.page, Pb.page) : null }; } finally { await Pa.ctx.close(); await Pb.ctx.close(); }
  };
  {   // ④ 보낸 청크를 안 적는다 — 돌아오면 그 청크 길을 또 싣는다
    const { n, r } = await serverBait('if (!V.r.has(k)) { V.r.add(k); _t1453RoadsOf(cx, cy, roads); }', '{ V.r.add(k); _t1453RoadsOf(cx, cy, roads); }', false, async (pa, pb) => {
      await goTo(pb, SPOTS.sparse); const n0 = (await rx(pb, 0)).length; await goTo(pa, SPOTS.dense); await goTo(pb, SPOTS.dense); const L = await rx(pb, n0); return { kb: kb(L, 'hanbando', 'road_cells') }; });
    ok(n === 1 && !!r && r.kb > 0, '미끼 ④ 청크를 떠났다 돌아오면 길이 두 번 든 사본 → Ⓑ3 빨강(돌아올 때 길 짐 > 0)', `바꾼 자리 ${n} · 돌아올 때 길 짐 ${r && r.kb} kB`);
  }
  {   // ⑤ welcome 에 존 전체 길
    const { n, r } = await serverBait('  if (ws) ws._t1453 = V;\n  return out.length ? out : null;', '  if (ws) ws._t1453 = V;\n  return Roads.clientRoads();', false, async (pa, pb) => welcomeBox(await pb.evaluate(() => window.__t1453Wel.hanbando || null)));
    ok(n === 1 && !!r && !r.ok && r.out > 0, '미끼 ⑤ 화면 둘레 밖 길을 welcome 에 다 싣는 사본(= 지금) → Ⓑ1 빨강', `바꾼 자리 ${n} · B welcome 길 ${r && r.got} · 둘레 밖 ${r && r.out}`);
  }
  {   // ⑥ 관측 소켓 둘레를 안 따라간다
    const { n, r } = await serverBait('  for (const [ws, d] of observers) _t1453ViewOne(ws, d.viewerX, d.viewerY);\n', '', true, async (pa, pb) => {
      await goTo(pa, SPOTS.west, true); await goTo(pb, SPOTS.west, true);
      await goTo(pa, SPOTS.west2, true); await goTo(pb, SPOTS.west2, true);
      return compare(await capture(pa), await capture(pb)); });
    ok(n === 1 && !!r && !r.same && r.zones[0] > r.zonesB[0], '미끼 ⑥ 이웃 존 경계에서 길이 끊겨 보이는 사본 → Ⓑ4b 빨강', `바꾼 자리 ${n} · 이웃 길 A ${r && r.zones[0]} · B ${r && r.zonesB[0]}`);
  }
  return done();
})().catch((e) => { say('실패: ' + (e && e.stack)); killAll(); process.exit(1); });
