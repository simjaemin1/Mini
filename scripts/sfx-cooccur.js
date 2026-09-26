#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// sfx-cooccur — **실제로 겹친 소리 묶음**을 세는 자 [T417 ③ 2026-09-26 · 세션9 · 러너 밖]
//
//   T292~T412 의 헤드룸 "최악 조합"은 **손으로 겹친 표**였다 — 키 여섯·열하나를 한 표본에 모아 재고
//   그 값이 문턱 0.8 아래인지 봤다. 그런데 그 조합이 **게임에서 정말 한 순간에 나는가**는 아무도 안 쟀다
//   (T412 회부 ④ · 여유 0.03 dB). ★PM 판정: 문턱은 그대로 두고, 조합을 **실측**에서 뽑는다.
//
//   하는 일: 진짜 central·zone 을 띄우고 진짜 클라로 들어가 **돌아다닌다**(걷기·E) — 그동안 200ms 마다
//   소리 층의 읽기 전용 장부(`__sfx.tap`)를 긁어 **같은 200ms 창에 실제로 울린 단발 + 켜져 있던 반복**을
//   한 묶음으로 센다. 끝나면 서로 다른 묶음을 **전부**(n = 관측된 묶음 수 · 새 수 0) 층의 `__sfx.probe`
//   (리미터 없이·있이 · 오프라인 렌더)로 재서 피크 순으로 낸다.
//
//   ⚠묶음 안 같은 키 여러 번은 그 키의 `maxSame` 까지만 센다 — 층이 그 이상은 막는다(제품에서 날 수 없는 소리를 안 잰다).
//   ⚠시간: 기본 30분(`SFX_COOCCUR_MIN`). 결과는 `/tmp/sfx-cooccur.json`. 매니페스트는 **사람이** 옮긴다(자가 표를 고치지 않는다).
//   ⚠움직임은 결정적(LCG 씨 `SFX_COOCCUR_SEED` · 기본 1020) — `Math.random` 0.
//
//   ★★[T431 2026-09-26] **판 넷** — 재는 줄(긁기·창·묶음·probe)은 한 글자도 안 바뀌었다. 바뀐 것은 **어디서·무엇을 하며** 재나뿐.
//     `SFX_COOCCUR_AT` = `trees`(T417 판 · 기본) · `village`(마을 안 정지) · `logging`(나무꾼 마을 곁 벌목)
//                        · `war`(`test-war-world` 픽스처 교전 — 방어 마을) · `beast`(짐승이 가장 많은 자리 · 다가가 친다)
//                        · `workers`(village 와 같은 마을 · 일하는 주민 셋의 가운데를 따라간다 — 한가운데는 조용했다)
//     ① **발자국**: T417 판은 캐릭터 시트가 안 떠 `step` 이 0 이었다 — 원인은 헤드리스가 아니라 **서버 env `CHAR_SPRITE`**
//        (클라 `uiCfg.charSprite` 가 거짓이면 `drawCharSprite` 가 첫 줄에서 돌아가 `__sfx.step` 줄에 안 닿는다). 운영 컨테이너는
//        `CHAR_SPRITE=on`(BENCHMARK.md 컨테이너 env) ⇒ 이 자도 켠다(`e2e-charsprite`·`e2e-npcsprite` 와 같은 손잡이 · 새 코드 0).
//     ② 자리: 이미 있는 `teleport_debug`(zone.js · T395 `t395-layers` 가 쓰는 그 메시지)로 옮긴다 — 좌표는 서버가 준다
//        (`/lifedbg` 마을 표본 중앙값 · 존 로그의 픽스처 선포 줄 · 존 DB 의 짐승 자리). 하네스가 좌표를 지어내지 않는다.
//     ③ 주민 일 팔(`T312_FISH_ACT`·`T325_WOOD_ACT`·`T347_FORAGE_ACT`·`T368_FARM_ACT`)은 **기본 꺼짐**이다 — 꺼져 있으면 주민은
//        낚지도 베지도 않아 **소리를 낼 사건이 없다**. `SFX_COOCCUR_ARMS=1` 이 넷을 켠다(켤 날의 최악 · 결과에 적는다).
//     ④ 프레임: GL 두 층(물 셰이더·산 3D)을 이미 있는 끄는 문(`__terrain19.waterOff`·`mt3dOff` · T395)으로 끈다 — 소리와 무관한
//        소프트웨어 GPU 칠이라서(T395 · 마을 366 → 4.7ms). 개체·캐릭터 그림(발자국 훅이 사는 곳)은 그대로 그린다.
// ══════════════════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const CPORT = +(process.env.CPORT || 3010), ZPORT = +(process.env.ZPORT || 3020);
const MINUTES = +(process.env.SFX_COOCCUR_MIN || 30);
const WIN_MS = 200;
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/sfx/manifest.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = (+(process.env.SFX_COOCCUR_SEED || 1020)) >>> 0;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const AT = process.env.SFX_COOCCUR_AT || 'trees';
const ARMS = process.env.SFX_COOCCUR_ARMS === '1';
const OUT = process.env.SFX_COOCCUR_OUT || (AT === 'trees' ? '/tmp/sfx-cooccur.json' : `/tmp/sfx-cooccur-${AT}.json`);
const ZENV_AT = {
  trees: {}, village: {}, workers: {}, logging: {}, beast: {},
  war: { VILLAGE_MAX: '8', VILLAGE_DAY_MS: '60000', ENABLE_BANDITS: '0', WAR_FIXTURE: 'assault', WAR_FIXTURE_DAY: '1', VILLAGE_WAR_LOG: '1' },   // `test-war-world` ⓖ 와 같은 판
}[AT];
if (!ZENV_AT) { console.error('SFX_COOCCUR_AT 모름: ' + AT); process.exit(2); }
const ARMS_ENV = ARMS ? { T312_FISH_ACT: '1', T325_WOOD_ACT: '1', T347_FORAGE_ACT: '1', T368_FARM_ACT: '1' } : {};
let zoneLog = '';
let procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.isAbsolute(file) ? file : path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => { if (/zone|sfx-co-wrap/.test(file) && zoneLog.length < 2e6) zoneLog += d.toString(); }); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs = []; }
process.on('exit', killAll);

(async () => {
  console.log(`=== sfx-cooccur — ${MINUTES}분 동안 실제로 겹친 소리 묶음 (T417 ③ · T431 판 ${AT}${ARMS ? ' · 주민 일 팔 켬' : ''}) ===\n`);
  const CDB = `/tmp/sfx-co-c-${process.pid}.db`, ZDB = `/tmp/sfx-co-z-${process.pid}.db`;
  for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _cp = FB.waitUp(_central, /central server up on/, { name: 'central' });
  //   ★[T431] 판 넷은 **새벽에 시작**한다(존이 뜨는 순간 = phase 0 = 06시 · 하루 길이는 운영 그대로 24분).
  //     존이 뜨고 재기까지 ~3분 → 재기 30분 중 ~20분이 낮·~7분이 밤이다(판마다 같은 시각표 — 네 판을 나란히 놓을 수 있다).
  //     T384·T395 의 래퍼 문법(시계 앵커만 옮긴다 · 서버 무접촉). 앵커를 하루 안에서만 옮기므로 **게임일 수·계절은 그대로**다.
  //     `trees` 판(T417)은 종전 그대로.
  let ZFILE = 'zone.js';
  if (AT !== 'trees') {
    ZFILE = `/tmp/sfx-co-wrap-${process.pid}.js`;
    fs.writeFileSync(ZFILE, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));cfg.WORLD.worldEpoch=Date.now()%cfg.WORLD.dayLengthMs;
require(path.join(ROOT,'server','zone.js'));`);
  }
  const _zone = boot(ZFILE, { PORT: String(ZPORT), DB_PATH: ZDB, ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}`,
    CHAR_SPRITE: 'on', ...ZENV_AT, ...ARMS_ENV });
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const rc = await _cp, rz = await _zp;
  console.log(`  central ${rc.ok ? rc.ms + 'ms' : '✗ ' + rc.why} · zone ${rz.ok ? rz.ms + 'ms' : '✗ ' + rz.why}`);
  if (!rc.ok || !rz.ok) { killAll(); process.exit(1); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('#enter');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await page.mouse.click(240, 160);                                  // 소리 층은 첫 제스처에서 연다(작은 창 = 헤드리스 14fps · 1280×800 은 2fps 라 거의 못 걷는다)
  await page.waitForFunction(() => window.__sfx && window.__sfx.tap && window.__sfx.dbg().ctx, null, { timeout: 30000 });
  console.log('  입장 · 소리 층 켜짐');
  // ★[T431 ④] 소리와 무관한 GL 두 층을 이미 있는 문으로 끈다(T395 — 소프트웨어 GPU 칠) · 개체·캐릭터 그림은 그대로
  await page.evaluate(() => { if (window.__terrain19) { window.__terrain19.waterOff = true; window.__terrain19.mt3dOff = true; } });

  // ── 걷기·E — 결정적 순서 + **나무 베기** ──
  //   빈 땅에서 E 를 눌러도 아무 일도 안 난다(첫 판: 30분 중 3분 동안 단발 0 — 반복 소리만 셌다).
  //   ⇒ 가장 가까운 나무로 걸어가 E 를 누른다(서버 `tryHarvest` → `resource_update` → 도끼 소리 = 진짜 사건).
  //   방향은 짐작하지 않고 **잰다**: 처음에 네 키를 1초씩 눌러 월드 이동 벡터를 얻는다(아이소 투영을 다시 안 쓴다).
  const KEYS = ['w', 'a', 's', 'd'];
  const pos = () => page.evaluate(() => window.__getMyAbs && window.__getMyAbs());
  const cal = {};
  for (const k of KEYS) {
    const a = await pos(); await page.keyboard.down(k); await sleep(1000); await page.keyboard.up(k); await sleep(300);
    const b = await pos(); cal[k] = { x: b.x - a.x, y: b.y - a.y };
  }
  console.log('  방향 잼: ' + KEYS.map((k) => `${k}(${Math.round(cal[k].x)},${Math.round(cal[k].y)})`).join(' '));

  // ── ★[T431 ②] 자리 — 서버가 준 좌표로 `teleport_debug`(있는 메시지) ──
  const zget = async (u) => { try { return await (await fetch(`http://localhost:${ZPORT}${u}`, { signal: AbortSignal.timeout(8000) })).json(); } catch (e) { return null; } };
  const median = (a) => { const s2 = a.slice().sort((p, q) => p - q); return s2[s2.length >> 1]; };
  const vilSpot = (v) => { const pts = (v.sample || []).filter((x) => x && typeof x.x === 'number'); return pts.length ? { x: Math.round(median(pts.map((p) => p.x))), y: Math.round(median(pts.map((p) => p.y))) } : null; };
  let spot = null;
  if (AT === 'village' || AT === 'workers' || AT === 'logging') {
    await sleep(60000);                                               // 주민이 일을 잡을 틈(존이 뜬 직후 표본은 전부 wander)
    const L = await zget('/lifedbg');
    const vs = ((L && L.villages) || []).filter((v) => vilSpot(v));
    const score = (v) => AT === 'logging'
      ? [((v.econCounts || {}).lumberjack || 0) + ((v.jobs || {}).lumberjack || 0), /^임업/.test(v.name) ? 1 : 0, v.pop || 0]
      : [(v.sample || []).filter((x) => x && x.act).length, /^어촌/.test(v.name) ? 1 : 0, v.pop || 0];
    vs.sort((a, b) => { const A = score(a), B = score(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return B[i] - A[i]; return a.name < b.name ? -1 : 1; });
    const v = vs[0];
    if (v) spot = Object.assign(vilSpot(v), { why: `${v.name} · 점수 ${score(v).join('/')} · 직업 ${JSON.stringify(v.jobs)}` });
  } else if (AT === 'war') {
    let m = null;
    for (let i = 0; i < 180 && !m; i++) { m = /FIXTURE=assault\] (\S+)\((\d+)명\)→(\S+)\((\d+)명\) 선포 (성공|실패)/.exec(zoneLog); if (!m) await sleep(2000); }
    const L = await zget('/lifedbg');
    const v = m && ((L && L.villages) || []).find((x) => x.name === m[3]);
    if (v) spot = Object.assign(vilSpot(v), { why: `방어 ${m[3]}(${m[4]}명) ← 공격 ${m[1]}(${m[2]}명) · 선포 ${m[5]}` });
  } else if (AT === 'beast') {
    //   존 DB 의 짐승 자리(존이 쓴 그 표 · 읽기 전용) — 사나운 짐승 둘레 500px 에 짐승이 가장 많은 자리
    const D = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
    const db = new D(ZDB, { readonly: true, fileMustExist: true });
    const mobs = db.prepare('SELECT type, x, y FROM mobs').all(); db.close();
    const W = { wolf: 3, bear: 3, tiger: 3, wild_boar: 2 };
    let best = null;
    for (const a of mobs) {
      if (!W[a.type]) continue;
      let sc = 0; const cnt = {};
      for (const b of mobs) if (Math.hypot(a.x - b.x, a.y - b.y) < 500) { sc += (W[b.type] || 1); cnt[b.type] = (cnt[b.type] || 0) + 1; }
      if (!best || sc > best.sc) best = { sc, x: Math.round(a.x), y: Math.round(a.y), cnt };
    }
    if (best) spot = { x: best.x, y: best.y, why: `짐승 ${mobs.length} 중 500px 안 ${JSON.stringify(best.cnt)}` };
  }
  if (spot) {
    //   물이면 서버가 거절한다(`teleport_debug`) — 둘레를 나선으로 한 칸씩(32px) 넓혀 다시
    const off = await page.evaluate(() => { const c = conns.get(primaryZoneId); return { x: c.meta.worldOffsetX, y: c.meta.worldOffsetY || 0 }; });
    let landed = false;
    for (let r = 0; r <= 8 && !landed; r++) for (let k = 0; k < Math.max(1, r * 8) && !landed; k++) {
      const a = (k / Math.max(1, r * 8)) * Math.PI * 2, tx = Math.round(spot.x + Math.cos(a) * r * 32), ty = Math.round(spot.y + Math.sin(a) * r * 32);
      await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [tx, ty]);
      await sleep(900);
      const me = await pos();
      if (me && Math.hypot(me.x - off.x - tx, me.y - off.y - ty) < 64) { landed = true; spot.tx = tx; spot.ty = ty; }
    }
    console.log(`  자리: (${spot.x},${spot.y}) ${landed ? '→ 섰다 (' + spot.tx + ',' + spot.ty + ')' : '✗ 못 섰다'} · ${spot.why}`);
    if (!landed) { await browser.close(); killAll(); process.exit(1); }
    await sleep(5000);
  } else if (AT !== 'trees') { console.log('  ✗ 자리를 못 받았다'); await browser.close(); killAll(); process.exit(1); }
  console.log(`  판 ${AT} — 재기 시작`);

  const nearestTree = () => page.evaluate(() => {
    const me = window.__getMyAbs(); const c = conns.get(primaryZoneId); if (!c || !me) return null;
    const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0; let best = null, bd = 1e9;
    for (const r of c.resources.values()) { if (r.type !== 'tree' || (window.__coBad || []).includes(r.id)) continue; const d = Math.hypot(r.x + ox - me.x, r.y + oy - me.y); if (d < bd) { bd = d; best = { id: r.id, x: r.x + ox, y: r.y + oy, d }; } }
    return best;
  });
  //   [T431] 짐승 판 — 가장 가까운 짐승(길들인 것 빼고) · 교전 판 — 보이는 전사 무리의 가운데(160px 안이면 선다)
  const nearestMob = () => page.evaluate(() => {
    const me = window.__getMyAbs(); const c = conns.get(primaryZoneId); if (!c || !me) return null;
    const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0; let best = null, bd = 1e9;
    for (const m of c.mobs.values()) { if (m.tameOwner || !(m.hp > 0)) continue; const d = Math.hypot(m.x + ox - me.x, m.y + oy - me.y); if (d < bd) { bd = d; best = { id: m.mid, x: m.x + ox, y: m.y + oy, d, type: m.type }; } }
    return best;
  });
  //   [T431] 일꾼 판(`workers`) — 마을 한가운데는 조용했다(어부는 물가에서 낚는다) ⇒ **일하는 주민 곁**(라벨 `act` 가 있는 주민 · 없으면 그 마을 직업 주민)
  const warriors = (mode) => page.evaluate((mode) => {
    const me = window.__getMyAbs(); const all = (window.__getNpcs ? window.__getNpcs() : []);
    let ws = mode === 'war' ? all.filter((n) => n.job === 'warrior') : all.filter((n) => n.act && n.act !== '취침');
    if (mode !== 'war' && !ws.length) ws = all;
    if (mode !== 'war' && me && ws.length) { ws.sort((a, b) => Math.hypot(a.wx - me.x, a.wy - me.y) - Math.hypot(b.wx - me.x, b.wy - me.y)); ws = ws.slice(0, 3); }
    if (!me || !ws.length) return null;
    const x = ws.reduce((a, n) => a + n.wx, 0) / ws.length, y = ws.reduce((a, n) => a + n.wy, 0) / ws.length;
    return { id: 'war', x, y, d: Math.hypot(x - me.x, y - me.y), n: ws.length };
  }, mode);
  const buckets = new Map();                                        // 창 번호 → { plays: [키], loops: Set }
  const bad = new Set();
  let since = 0, held = null, nextTurn = 0, nextE = 0, target = null, stuckAt = 0, lastD = 1e9, wander = 0;
  const t0 = Date.now(), until = t0 + MINUTES * 60000;
  let polls = 0, lastLog = t0, chops = 0, lastPollW = null, axeN = 0, drops = 0, tapT0 = null, nightW = 0, warSeen = 0;
  const CHOP = (AT === 'trees' || AT === 'logging'), HUNT = (AT === 'beast'), FOLLOW = (AT === 'war' || AT === 'workers');
  //   ★[T431] 재기는 **여기서부터**다 — 장부는 소리 층이 켜진 때부터 쌓이므로 방향 재기·옮기기 동안 난 소리를 건너뛴다
  //     (T417 판은 `since = 0` 으로 시작해 그 몇 초를 첫 창에 넣었다 — 걷기 재기 중엔 소리 날 일이 적어 값은 같다).
  since = (await page.evaluate(() => window.__sfx.tap(1e15))).n;
  let backs = 0, nextBack = Date.now() + 30000;
  const off0 = spot ? await page.evaluate(() => { const c = conns.get(primaryZoneId); return { x: c.meta.worldOffsetX, y: c.meta.worldOffsetY || 0 }; }) : null;
  while (Date.now() < until) {
    const now = Date.now();
    if (now >= nextTurn && (CHOP || HUNT || FOLLOW)) {
      nextTurn = now + 700;
      if (!target || now > wander || HUNT || FOLLOW) {
        if (CHOP) { await page.evaluate((b) => { window.__coBad = b; }, [...bad]); const t2 = await nearestTree(); if (!target || !t2 || t2.id !== target.id) { target = t2; if (target) target.axeAtArrive = axeN; } }
        else if (HUNT) target = await nearestMob();
        else { target = await warriors(AT); if (target) warSeen = Math.max(warSeen, target.n); }
      }
      const me = await pos();
      let want = null;
      if (target && me && now > wander) {
        const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy);
        const near = CHOP ? 48 : (HUNT ? 56 : 160);
        if (d < near) {
          want = null;
          if (now >= nextE && (CHOP || HUNT)) {
            await page.keyboard.press(CHOP ? 'e' : 'f'); chops++; nextE = now + (CHOP ? 1100 : 700);
            // E 를 여섯 번 눌러도 **도끼 소리**가 한 번도 안 났으면 그 나무는 못 벤다(막힘·남의 땅·짐 무게) — 버리고 다음 나무
            //   ★[T431] 종전엔 "아무 소리"로 셌다(`since`) — 주민이 곁에서 울면 못 베는 나무를 벤다고 착각한다 ⇒ 도끼만 센다.
            if (CHOP && target) {
              if (axeN === target.axeAtArrive) { target.tries = (target.tries || 0) + 1; if (target.tries >= 6) { bad.add(target.id); target = null;
                // [T431] T417 판이 8분쯤 멈춘 까닭 후보 — 짐 무게(25kg). 버릴 것을 버린다(진짜 버리기 메시지 · `drop` 소리도 진짜 사건)
                const inv = await page.evaluate(() => (typeof inventory !== 'undefined' ? inventory : {}));
                for (const it of ['wood', 'log', 'stick', 'stone']) if (inv[it] > 0) { await page.evaluate(([i, n]) => window.__sendPrimary({ type: 'drop_item', item: i, amount: n }), [it, inv[it]]); drops++; }
              } }
              else { target.axeAtArrive = axeN; target.tries = 0; }
            }
          }
        }
        else {
          let bk = null, bs = -1e9;
          for (const k of KEYS) { const v = cal[k], L = Math.hypot(v.x, v.y) || 1; const sc = (v.x * dx + v.y * dy) / (L * d); if (sc > bs) { bs = sc; bk = k; } }
          want = bk;
          if (d > lastD - 4) { if (!stuckAt) stuckAt = now; } else stuckAt = 0;
          lastD = d;
          if (stuckAt && now - stuckAt > 6000) { wander = now + 4000; stuckAt = 0; want = KEYS[Math.floor(rnd() * 4)]; }   // 막혔다 — 잠깐 딴 데로
        }
      } else if (now <= wander) want = held || KEYS[Math.floor(rnd() * 4)];
      else want = FOLLOW ? null : KEYS[Math.floor(rnd() * 4)];        // 교전 판은 전사가 안 보이면 방어 마을에 선다
      if (want !== held) { if (held) await page.keyboard.up(held); held = want; if (held) await page.keyboard.down(held); }
    }
    //   [T431] 쓰러져 죽고 되살면 광장(존 반대편)에 선다 — 그 판의 자리로 되돌린다(같은 `teleport_debug`)
    if (spot && now >= nextBack) {
      nextBack = now + 30000;
      const me = await pos();
      if (me && Math.hypot(me.x - off0.x - spot.tx, me.y - off0.y - spot.ty) > 2000) { await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [spot.tx, spot.ty]); backs++; target = null; }
    }
    const tp = await page.evaluate((s) => window.__sfx.tap(s), since);
    since = tp.n; polls++;
    if (tapT0 == null) tapT0 = tp.now;
    for (const p of tp.plays) {
      const w = Math.floor(p.t / WIN_MS);
      if (!buckets.has(w)) buckets.set(w, { plays: [], loops: new Set() });
      buckets.get(w).plays.push(p.k);
      if (p.k === 'axe') axeN++;
    }
    // 반복 소리는 **이어진다** — 이번 긁기에서 본 반복을 지난 긁기 이후의 모든 창에 준다(첫 판은 긁기 창에만 줘서
    //   긁기 사이에 떨어진 단발이 '반복 없이 혼자' 로 잘못 세졌다: axe 단독 0.4304 두 창 — 자의 착시).
    const wNow = Math.floor(tp.now / WIN_MS);
    const wFrom = (lastPollW == null) ? wNow : lastPollW + 1;
    for (let w = wFrom; w <= wNow; w++) {
      if (!buckets.has(w)) buckets.set(w, { plays: [], loops: new Set() });
      for (const k of tp.loops) buckets.get(w).loops.add(k);
    }
    lastPollW = wNow;
    if (now - lastLog > 60000) {
      lastLog = now;
      const night = await page.evaluate(() => (typeof isNight === 'function') ? !!isNight() : null);
      if (night) nightW++;
      console.log(`  ${Math.round((now - t0) / 60000)}분 · 창 ${buckets.size} · 울림 ${since} · ${HUNT ? '침' : 'E'} ${chops}${drops ? ' · 버림 ' + drops : ''}${backs ? ' · 되돌림 ' + backs : ''}${FOLLOW ? (AT === 'war' ? ' · 전사 ' : ' · 주민 ') + (target ? target.n : 0) : ''}${night ? ' · 밤' : ''}`);
    }
    await sleep(WIN_MS);
  }
  if (held) await page.keyboard.up(held);

  // ── 묶음 ── 같은 키는 maxSame 까지만(층이 그 이상을 막는다)
  const combos = new Map();
  let nonEmpty = 0;
  const keyN = {};                                                   // [T431] 키별 울림 수(발자국 칸이 여기서 보인다)
  for (const [, b] of buckets) for (const k of b.plays) keyN[k] = (keyN[k] || 0) + 1;
  for (const [w, b] of buckets) {
    const cnt = {};
    for (const k of b.plays) cnt[k] = (cnt[k] || 0) + 1;
    const list = [];
    for (const [k, n] of Object.entries(cnt)) { const cap = (MAN.keys[k] && MAN.keys[k].maxSame) || 3; for (let i = 0; i < Math.min(n, cap); i++) list.push(k); }
    for (const k of b.loops) list.push(k);
    if (!list.length) continue;
    nonEmpty++;
    const sig = list.slice().sort().join('+');
    const c = combos.get(sig) || { keys: list.slice().sort(), n: 0, oneShots: list.length - b.loops.size };
    c.n++; (c.ws = c.ws || []).push(w); combos.set(sig, c);
  }
  console.log(`\n  창 ${buckets.size}(소리 있는 창 ${nonEmpty}) · 서로 다른 묶음 ${combos.size} · 울림 ${since} · 긁기 ${polls}`);

  // ── 재기 ── 서로 다른 묶음 **전부**
  const rows = [];
  for (const [sig, c] of combos) {
    const r = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), c.keys);
    if (!r || r.err) { rows.push({ sig, n: c.n, keys: c.keys, err: r && r.err }); continue; }
    rows.push({ sig, n: c.n, keys: c.keys, oneShots: c.oneShots, peakNoLim: r.withoutLimiter.peak, peakNoLimDb: r.withoutLimiter.peakDb,
                peakLim: r.withLimiter.peak, clippedNoLim: r.withoutLimiter.clipped, overKnee: `${r.gainReduction.overKnee}/${r.gainReduction.windows}`,
                // [T431] 그 묶음이 난 시각(판 시작부터 분) — 문턱 넘는 묶음이면 "언제" 를 답한다
                atMin: c.ws.slice(0, 8).map((w) => +(((w * WIN_MS) - tapT0) / 60000).toFixed(2)) });
  }
  rows.sort((a, b) => (b.peakNoLim || 0) - (a.peakNoLim || 0));
  console.log('\n    ── 실측 묶음 (리미터 없이 피크 순 · 상위 15) ──');
  for (const r of rows.slice(0, 15)) console.log(`      ${String(r.peakNoLim).padEnd(7)} ${String(r.peakNoLimDb).padStart(6)} dB · ${String(r.n).padStart(5)}창 · ${r.keys.join(' + ')}`);
  const knee = (MAN.bus && MAN.bus.limiter && MAN.bus.limiter.knee) || 0.8;
  const worst = rows[0] || null;
  const over = rows.filter((r) => r.peakNoLim > knee);
  const steps = Object.keys(keyN).filter((k) => /^step_/.test(k)).reduce((a, k) => a + keyN[k], 0);
  const out = { date: new Date().toISOString(), at: AT, arms: ARMS, spot, minutes: MINUTES, seed: +(process.env.SFX_COOCCUR_SEED || 1020), windows: buckets.size, nonEmpty,
                distinct: combos.size, plays: since, knee, worst, overKnee: { combos: over.length, windows: over.reduce((a, r) => a + r.n, 0), rows: over.map((r) => ({ sig: r.sig, n: r.n, atMin: r.atMin })) },
                steps, keyN, nightMin: nightW, warriorsSeen: warSeen, presses: chops, drops, backs, rows, pageErrors: errs.slice(0, 5) };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\n  최악: ${worst ? worst.peakNoLim + ' (' + worst.keys.join('+') + ')' : '없음'} · 문턱 ${knee} → ${worst && worst.peakNoLim < knee ? '안' : '★밖'}`);
  console.log(`  문턱 넘는 묶음 ${over.length} · 창 ${out.overKnee.windows}${over.length ? ' — ' + over.map((r) => r.sig + ' @' + r.atMin.join('/') + '분').join(' · ') : ''}`);
  console.log(`  발자국 ${steps} · 키별 ${JSON.stringify(keyN)}`);
  console.log(`  페이지 오류 ${errs.length} · 결과 ${OUT}`);
  await browser.close(); killAll();
  process.exit(0);
})();
