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
let procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs = []; }
process.on('exit', killAll);

(async () => {
  console.log(`=== sfx-cooccur — ${MINUTES}분 동안 실제로 겹친 소리 묶음 (T417 ③) ===\n`);
  const CDB = `/tmp/sfx-co-c-${process.pid}.db`, ZDB = `/tmp/sfx-co-z-${process.pid}.db`;
  for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _cp = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone.js', { PORT: String(ZPORT), DB_PATH: ZDB, ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}` });
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
  console.log('  입장 · 소리 층 켜짐 — 걷기 시작');

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
  const nearestTree = () => page.evaluate(() => {
    const me = window.__getMyAbs(); const c = conns.get(primaryZoneId); if (!c || !me) return null;
    const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0; let best = null, bd = 1e9;
    for (const r of c.resources.values()) { if (r.type !== 'tree' || (window.__coBad || []).includes(r.id)) continue; const d = Math.hypot(r.x + ox - me.x, r.y + oy - me.y); if (d < bd) { bd = d; best = { id: r.id, x: r.x + ox, y: r.y + oy, d }; } }
    return best;
  });
  const buckets = new Map();                                        // 창 번호 → { plays: [키], loops: Set }
  const bad = new Set();
  let since = 0, held = null, nextTurn = 0, nextE = 0, target = null, stuckAt = 0, lastD = 1e9, wander = 0;
  const t0 = Date.now(), until = t0 + MINUTES * 60000;
  let polls = 0, lastLog = t0, chops = 0, lastPollW = null;
  while (Date.now() < until) {
    const now = Date.now();
    if (now >= nextTurn) {
      nextTurn = now + 700;
      if (!target || now > wander) { await page.evaluate((b) => { window.__coBad = b; }, [...bad]); target = await nearestTree(); if (target) target.sinceAtArrive = since; }
      const me = await pos();
      let want = null;
      if (target && me && now > wander) {
        const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy);
        if (d < 48) {
          want = null;
          if (now >= nextE) {
            await page.keyboard.press('e'); chops++; nextE = now + 1100;
            // E 를 여섯 번 눌러도 소리가 한 번도 안 났으면 그 나무는 못 벤다(막힘·남의 땅 등) — 버리고 다음 나무
            if (since === target.sinceAtArrive) { target.tries = (target.tries || 0) + 1; if (target.tries >= 6) { bad.add(target.id); target = null; } }
            else if (target) { target.sinceAtArrive = since; target.tries = 0; }
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
      else want = KEYS[Math.floor(rnd() * 4)];
      if (want !== held) { if (held) await page.keyboard.up(held); held = want; if (held) await page.keyboard.down(held); }
    }
    const tp = await page.evaluate((s) => window.__sfx.tap(s), since);
    since = tp.n; polls++;
    for (const p of tp.plays) {
      const w = Math.floor(p.t / WIN_MS);
      if (!buckets.has(w)) buckets.set(w, { plays: [], loops: new Set() });
      buckets.get(w).plays.push(p.k);
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
    if (now - lastLog > 60000) { lastLog = now; console.log(`  ${Math.round((now - t0) / 60000)}분 · 창 ${buckets.size} · 울림 ${since} · E ${chops}`); }
    await sleep(WIN_MS);
  }
  if (held) await page.keyboard.up(held);

  // ── 묶음 ── 같은 키는 maxSame 까지만(층이 그 이상을 막는다)
  const combos = new Map();
  let nonEmpty = 0;
  for (const [, b] of buckets) {
    const cnt = {};
    for (const k of b.plays) cnt[k] = (cnt[k] || 0) + 1;
    const list = [];
    for (const [k, n] of Object.entries(cnt)) { const cap = (MAN.keys[k] && MAN.keys[k].maxSame) || 3; for (let i = 0; i < Math.min(n, cap); i++) list.push(k); }
    for (const k of b.loops) list.push(k);
    if (!list.length) continue;
    nonEmpty++;
    const sig = list.slice().sort().join('+');
    const c = combos.get(sig) || { keys: list.slice().sort(), n: 0, oneShots: list.length - b.loops.size };
    c.n++; combos.set(sig, c);
  }
  console.log(`\n  창 ${buckets.size}(소리 있는 창 ${nonEmpty}) · 서로 다른 묶음 ${combos.size} · 울림 ${since} · 긁기 ${polls}`);

  // ── 재기 ── 서로 다른 묶음 **전부**
  const rows = [];
  for (const [sig, c] of combos) {
    const r = await page.evaluate((k) => window.__sfx.probe(k, { seconds: 4 }), c.keys);
    if (!r || r.err) { rows.push({ sig, n: c.n, keys: c.keys, err: r && r.err }); continue; }
    rows.push({ sig, n: c.n, keys: c.keys, oneShots: c.oneShots, peakNoLim: r.withoutLimiter.peak, peakNoLimDb: r.withoutLimiter.peakDb,
                peakLim: r.withLimiter.peak, clippedNoLim: r.withoutLimiter.clipped, overKnee: `${r.gainReduction.overKnee}/${r.gainReduction.windows}` });
  }
  rows.sort((a, b) => (b.peakNoLim || 0) - (a.peakNoLim || 0));
  console.log('\n    ── 실측 묶음 (리미터 없이 피크 순 · 상위 15) ──');
  for (const r of rows.slice(0, 15)) console.log(`      ${String(r.peakNoLim).padEnd(7)} ${String(r.peakNoLimDb).padStart(6)} dB · ${String(r.n).padStart(5)}창 · ${r.keys.join(' + ')}`);
  const knee = (MAN.bus && MAN.bus.limiter && MAN.bus.limiter.knee) || 0.8;
  const worst = rows[0] || null;
  const out = { date: new Date().toISOString(), minutes: MINUTES, seed: +(process.env.SFX_COOCCUR_SEED || 1020), windows: buckets.size, nonEmpty,
                distinct: combos.size, plays: since, knee, worst, rows, pageErrors: errs.slice(0, 5) };
  fs.writeFileSync('/tmp/sfx-cooccur.json', JSON.stringify(out, null, 1));
  console.log(`\n  최악: ${worst ? worst.peakNoLim + ' (' + worst.keys.join('+') + ')' : '없음'} · 문턱 ${knee} → ${worst && worst.peakNoLim < knee ? '안' : '★밖'}`);
  console.log(`  페이지 오류 ${errs.length} · 결과 /tmp/sfx-cooccur.json`);
  await browser.close(); killAll();
  process.exit(0);
})();
