#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기)
// =============================================================================
// T393 자 — **스폰하자마자 숲이 너무 많다**의 영토 밖 몫: 도착 지점 시야 안 나무 (2026-09-26)
//
// 재민 실기 09-23: *"마을에 스폰되자마자 숲이 너무 많고, 애초에 마을 안에 숲이 들어와 있으면 안 되지."*
//   뒤 절반(마을 안)은 T378 이 닫았다(영토 안 6,893 → 0 · 그 자리는 그루터기). 이 자는 **앞 절반**을 잰다 —
//   새로 온 사람이 서는 **도착 지점**(온보딩 v2 · T19 · `onboarding.arrivalOf`)에서 **화면이 그리는 상자** 안에
//   나무가 몇 그루인가. 값(간격 · `FOREST_MIN_COV`)은 **안 바꾼다** — 재민이 그림을 보고 #71 로 정한다.
//
// ★수는 전부 정본에서 읽는다(여기 적지 않는다):
//   · 시야 상자 반경 — 클라 `34-m-renderloop.js` 의 `VIEW_RADIUS`(개체 컬링 · 지금 650)와
//     `TILE_RENDER_RADIUS`(지면 · 1,500 = T392 컬링 팔)를 **글자로** 읽는다. 컬링은 **네모**다
//     (`|ax − cx| > R || |ay − cy| > R` 이면 버린다) ⇒ 여기서도 네모로 센다.
//   · 도착 지점 — 존을 띄워 `/shelterdbg` 가 내주는 `arrive`(= `Onboarding.arrivalOf` 그대로)를 받는다.
//   · 나무 — `chunk.generateChunkResources`(T301 색인과 같은 답 · 관측자 무관). 넘침은 서·북에서 오므로
//     상자에 닿는 청크보다 **한 칸 서·북**부터 낳고 좌표로 거른다(한 개체는 한 청크만 낳는다).
//   · 영토·벤 장부 — 부팅이 끝난 DB(`village_buildings type='terr'` · `harvested_seeds`) 그대로.
//   · 숲 간격 — 스폰 청크 숲 격자의 **씨 키**(`…_ft<gx>_<gy>`)에서 읽는다(gx 는 간격의 배수다 · 식을 안 베낀다).
//
// 쓰는 법
//   T393_JSON=/tmp/t393.json node scripts/t393-spawn-forest.js
//   그림: python3 scripts/t393-spawn-forest-png.py /tmp/t393.json <출력 폴더>
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349·T355 기동 기다리기 정본(사본 0)
const ROOT = path.join(__dirname, '..');
const CPORT = +(process.env.T393_CPORT || 3650), ZPORT = +(process.env.T393_ZPORT || 3660);
const ZID = 'hanbando';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)],
    { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', killAll);
async function jget(u) {
  try { return await (await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(30000) })).json(); }
  catch (e) { return null; }
}

// ── 정본에서 읽는 수 ─────────────────────────────────────────────────────────
function readClientRadii() {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
  const v = /const VIEW_RADIUS = (\d+)/.exec(src), t = /const TILE_RENDER_RADIUS = (\d+)/.exec(src);
  if (!v || !t) throw new Error('34-m-renderloop.js 에서 VIEW_RADIUS/TILE_RENDER_RADIUS 를 못 읽었다 — 자를 믿지 마라');
  return { view: +v[1], tile: +t[1] };
}

(async () => {
  const R = readClientRadii();
  const RS = [R.view, R.tile];                     // 지금(650) · T392 컬링 팔(1,500)
  const DB = `/tmp/t393-world-${process.pid}.db`;
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  console.log(`[자] 시야 상자 반경(클라 정본) — 지금 VIEW_RADIUS ${R.view} · 컬링 팔 TILE_RENDER_RADIUS ${R.tile}`);
  console.log(`[자] 존을 띄워 마을을 시딩하고 도착 지점을 받는다 — ${DB}`);

  // ── 존 한 판 — 도착 지점 받기 ───────────────────────────────────────────────
  const _c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t393-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  const _cp = FB.waitUp(_c, /central server up on/, { name: 'central' });   // ★듣기는 띄운 그 틱에(T349 ⑧)
  const up = await _cp;
  if (!up.ok) { console.log(up.why); process.exit(1); }
  const _z = boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: ZID, DB_PATH: DB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
  });
  let zlog = '';
  _z.stdout.on('data', (b) => { zlog += String(b); }); _z.stderr.on('data', (b) => { zlog += String(b); });
  const _zp = FB.waitUp(_z, /zone server up on/, { name: 'zone', capMs: 300000 });
  const zup = await _zp;
  if (!zup.ok) { console.log(zup.why); process.exit(1); }
  console.log(`[자] 존 기동 ${zup.ms}ms`);
  let rows = null;
  for (let i = 0; i < 90; i++) {                      // 도착 지점은 부팅 때 굽는다 — 덜 구웠으면 기다린다(상한은 표에만)
    const j = await jget(`http://localhost:${ZPORT}/shelterdbg`);
    if (j && j.rows && j.rows.length && j.rows.every((r) => r.arrive)) { rows = j.rows; break; }
    await sleep(2000);
  }
  if (!rows) { console.log('★도착 지점을 다 못 받았다(/shelterdbg) — 자를 믿지 마라'); }
  await sleep(3000);                                  // 개간 장부가 DB 에 앉게
  killAll(); procs.length = 0;
  await sleep(2500);

  // ── DB 를 직접 읽는다 ─────────────────────────────────────────────────────
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const db = new Database(DB, { readonly: true });
  const vils = db.prepare('SELECT id, name, cx, cy FROM villages').all();
  const terrRows = db.prepare("SELECT village_id, cx, cy FROM village_buildings WHERE type = 'terr'").all();
  let harv = [];
  try { harv = db.prepare('SELECT seed_key FROM harvested_seeds').all(); } catch (e) {}
  db.close();
  const ledger = new Set(harv.map((r) => r.seed_key));
  const terrAll = new Set(terrRows.map((r) => r.cx + ',' + r.cy));

  const CH = require(path.join(ROOT, 'server', 'chunk'));
  const TR = require(path.join(ROOT, 'server', 'terrain'));
  const ZoneCfg = require(path.join(ROOT, 'server', 'zone-config'));
  const biome = ((ZoneCfg.ZONES || ZoneCfg.zones || {})[ZID] || {}).biome;
  const cs = CH.CHUNK_SIZE, MINCOV = CH.FOREST_MIN_COV;
  if (!biome) console.log('★존 설정에서 biome 을 못 읽었다 — 아래 수를 믿지 마라');
  console.log(`[자] 정본 — biome=${biome} · chunk ${cs} · FOREST_MIN_COV ${MINCOV} · 마을 ${vils.length} · 도착 지점 ${rows ? rows.length : 0} · 영토 셀 ${terrAll.size} · 벤 장부 ${ledger.size}`);

  // 청크 한 판의 나무(날 것 · 장부 없이) — 같은 청크를 두 번 낳지 않는다
  const _chunk = new Map();
  const chunkTrees = (cx, cy) => {
    const k = cx + '_' + cy;
    let a = _chunk.get(k);
    if (!a) {
      a = [];
      if (cx >= 0 && cy >= 0) {
        for (const e of CH.generateChunkResources(ZID, biome, cx, cy, cs, null, undefined)) {
          if (e.type !== 'tree') continue;
          a.push({ x: e.x, y: e.y, r: e.r || 8, key: e.seedKey || e.id, ft: /_ft\d+_\d+$/.test(e.seedKey || '') });
        }
      }
      _chunk.set(k, a);
    }
    return a;
  };
  const inBox = (ax, ay, rr) => (e) => Math.abs(e.x - ax) <= rr && Math.abs(e.y - ay) <= rr;   // 클라 컬링과 같은 부등호
  const treesInBox = (ax, ay, rr) => {
    const out = [], f = inBox(ax, ay, rr);
    for (let cx = Math.floor((ax - rr) / cs) - 1; cx <= Math.floor((ax + rr) / cs); cx++)
      for (let cy = Math.floor((ay - rr) / cs) - 1; cy <= Math.floor((ay + rr) / cs); cy++)
        for (const e of chunkTrees(cx, cy)) if (f(e)) out.push(e);
    return out;
  };
  const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
  // 스폰 청크 숲 격자의 간격 — 씨 키의 gx 는 간격의 배수다(0, SP, 2SP …) ⇒ 최대공약수가 간격이다
  const spacingOf = (cx, cy) => {
    let g = 0;
    for (const e of chunkTrees(cx, cy)) { if (!e.ft) continue; const m = /_ft(\d+)_(\d+)$/.exec(e.key); if (m) { g = gcd(g, +m[1]); g = gcd(g, +m[2]); } }
    return g || null;
  };

  const byName = new Map(vils.map((v) => [v.id, v]));
  const out = [];
  for (const row of (rows || [])) {
    const v = byName.get(row.vid); if (!v || !row.arrive) continue;
    const ax = row.arrive.x, ay = row.arrive.y;
    const rec = { vid: row.vid, name: row.name, ax, ay, center: [v.cx * 32 + 16, v.cy * 32 + 16] };
    for (const rr of RS) {
      const list = treesInBox(ax, ay, rr);
      let inT = 0, cut = 0, resid = 0, ft = 0;
      for (const e of list) {
        const c = Math.floor(e.x / 32) + ',' + Math.floor(e.y / 32);
        const t = terrAll.has(c), k = ledger.has(e.key);
        if (t) inT++;
        if (k) cut++;
        if (t && !k) resid++;
        if (!k && e.ft) ft++;
      }
      rec['r' + rr] = { raw: list.length, inTerr: inT, outTerr: list.length - inT, stump: cut, standing: list.length - cut, resid, forestGrid: ft, scattered: list.length - cut - ft };
    }
    // 그 자리의 숲 — 도착 지점의 배수 · 스폰 청크 간격 · 시야 상자(큰 쪽)의 숲 셀 비율(셀 중심 표본)
    rec.multAtSpawn = TR.getForestMultiplier(ZID, ax, ay);
    rec.spacingSpawnChunk = spacingOf(Math.floor(ax / cs), Math.floor(ay / cs));
    {
      const rr = R.tile; let n = 0, f = 0;
      for (let x = Math.floor((ax - rr) / 32); x <= Math.floor((ax + rr) / 32); x++)
        for (let y = Math.floor((ay - rr) / 32); y <= Math.floor((ay + rr) / 32); y++) {
          n++; if (TR.getForestMultiplier(ZID, x * 32 + 16, y * 32 + 16) > MINCOV) f++;
        }
      rec.forestCellFrac = +(f / Math.max(1, n)).toFixed(4);
    }
    out.push(rec);
  }

  // ── 표 ────────────────────────────────────────────────────────────────────
  const key = 'r' + R.tile, keyV = 'r' + R.view;
  const sorted = out.slice().sort((a, b) => a[key].standing - b[key].standing);
  const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
  console.log(`\n=== T393 자 — 도착 지점 시야 상자 안 나무(색인 · 관측자 0) · 마을 ${out.length}곳 ===`);
  console.log(`${'마을'.padEnd(10)}${('±' + R.view).padStart(8)}${('±' + R.tile).padStart(8)}${'숲격자'.padStart(8)}${'흩어짐'.padStart(8)}${'그루터기'.padStart(8)}${'배수'.padStart(6)}${'간격'.padStart(6)}${'숲셀%'.padStart(7)}`);
  for (const r of sorted.slice().reverse()) {
    const a = r[key], b = r[keyV];
    console.log(`${String(r.name).padEnd(10)}${String(b.standing).padStart(8)}${String(a.standing).padStart(8)}${String(a.forestGrid).padStart(8)}${String(a.scattered).padStart(8)}${String(a.stump).padStart(8)}${String(r.multAtSpawn).padStart(6)}${String(r.spacingSpawnChunk || '—').padStart(6)}${(100 * r.forestCellFrac).toFixed(1).padStart(7)}`);
  }
  const S = out.map((r) => r[key].standing), SV = out.map((r) => r[keyV].standing);
  const mx = sorted[sorted.length - 1], mn = sorted[0], md = sorted[Math.floor((sorted.length - 1) / 2)];
  const sum = (k, f) => out.reduce((s, r) => s + r[k][f], 0);
  console.log(`\n±${R.tile}: 서 있는 나무 중앙값 ${med(S)} · 최대 ${mx ? mx.name + ' ' + mx[key].standing : '—'} · 최소 ${mn ? mn.name + ' ' + mn[key].standing : '—'} · 합 ${sum(key, 'standing')}`);
  console.log(`±${R.view}: 서 있는 나무 중앙값 ${med(SV)} · 최대 ${Math.max(...SV)} · 최소 ${Math.min(...SV)} · 합 ${sum(keyV, 'standing')}`);
  console.log(`±${R.tile}: 날 것 ${sum(key, 'raw')} = 영토 안 ${sum(key, 'inTerr')} + 영토 밖 ${sum(key, 'outTerr')} · 그루터기(벤 장부) ${sum(key, 'stump')} · 영토 안인데 서 있는 것 ${sum(key, 'resid')} · 서 있는 것 중 숲 격자 ${sum(key, 'forestGrid')} · 흩어진 나무 ${sum(key, 'scattered')}`);
  const warn = /영토 개간 — 색인을 못 물었다[^\n]*/.exec(zlog);
  if (warn) console.log(`★존이 말했다: ${warn[0]}`);

  // ── 그림 재료 — 중앙값 · 최대 · 최소 셋 ──────────────────────────────────
  const picks = [['median', md], ['max', mx], ['min', mn]].filter((p) => p[1]);
  const pics = [];
  for (const [tag, r] of picks) {
    const rr = R.tile, ax = r.ax, ay = r.ay;
    const all = treesInBox(ax, ay, rr);
    const pic = { tag, name: r.name, ax, ay, R: rr, Rv: R.view, center: r.center, counts: { standing: r[key].standing, standingView: r[keyV].standing, stump: r[key].stump },
      trees: [], stumps: [], terr: [], water: [], rock: [] };
    for (const e of all) (ledger.has(e.key) ? pic.stumps : pic.trees).push([Math.round(e.x - ax), Math.round(e.y - ay), Math.round(e.r)]);
    for (let x = Math.floor((ax - rr) / 32); x <= Math.floor((ax + rr) / 32); x++)
      for (let y = Math.floor((ay - rr) / 32); y <= Math.floor((ay + rr) / 32); y++) {
        const px = x * 32 - ax, py = y * 32 - ay, k = x + ',' + y;
        if (terrAll.has(k)) pic.terr.push([px, py]);
        if (TR.isWaterCellLocal(ZID, x * 32 + 16, y * 32 + 16)) pic.water.push([px, py]);
        else if (typeof TR.isRockCellLocal === 'function' && TR.isRockCellLocal(ZID, x * 32 + 16, y * 32 + 16)) pic.rock.push([px, py]);
      }
    pics.push(pic);
  }
  if (process.env.T393_JSON) {
    fs.writeFileSync(process.env.T393_JSON, JSON.stringify({ radii: R, villages: out, median: med(S), medianView: med(SV),
      max: mx && { name: mx.name, n: mx[key].standing }, min: mn && { name: mn.name, n: mn[key].standing }, pics, db: DB,
      ledger: ledger.size, terr: terrAll.size, minCov: MINCOV }, null, 1));
    console.log(`표 → ${process.env.T393_JSON}`);
  }
  process.exit(0);
})().catch((e) => { console.error('자 크래시:', e); killAll(); process.exit(1); });
