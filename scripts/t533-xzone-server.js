#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T533 자)
// =============================================================================
// T533 — 서버 켬 판의 자: 한반도 + 닛폰 **실서버**(central + 존 둘 · 마을 켬)를 800일 돌려 경계 교역과 여덟 수를 잰다.
//   **계측기다 — 제품 코드는 한 글자도 안 만진다**(T514 자 문법: 적재 순간 villages.js 뒤에 한 줄 — `state` 를 읽는 창 · 동작 0).
//
//   run   <표지> <씨> <마을하루ms> <날> <outdir> <on|off>   — ⓑ central + hanbando + nippon(zone-config 포트 그대로 · 한 판씩)
//                                                         팔 `T525_CROSS_ZONE` = on/off · 씨 = 두 존 `villageSeed`(적재 순간 한 칸 · T514 문법)
//                                                         하루 경계마다 존마다 한 줄(JSONL · 존 안에서 — 폴링 0): 여덟 수 + 경계 호스트 수
//                                                         두 존이 모두 `<날>` 에 닿으면 끝(각 존의 econ 날 — 존마다 따로 센다)
//   table <outdir> [md]                                 — 판들을 한 표로(씨 × 팔 × 존)
//
//   여덟 수 = `t17-metrics ⓚ` 와 같은 뜻(인구 · 소멸/있었던 · 무기Q · 확장셀 · 게시 · 도구Q · 보존식 · 생곡) — 서버 `state.world`·`state.ledger` 에서 센다.
//   경계 수 = `/perf` `xzone` 과 같은 칸(villages.js `state.xzone` — 넘김 · 돌려보냄 · 경계 교역 성사 · 곳간 · 몸).
//   ⚠실서버라 판마다 벽시계에 흔들린다(조각·틱 사이 몸) — 같은 씨 A/A 폭은 T514 가 잰 그 문법(`table` 이 끔 판끼리 견준다).
//   ⚠존이 하루 마감을 마을하루 안에 못 끝내면 경계를 건너뛴다(econ 날이 벽시계보다 늦게 간다) — 줄의 `skip` 칸이 센다.
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const HOOK = process.env.T533_HOOK || '';
const VJS = path.join('server', 'villages.js');

let _isMain = true; try { _isMain = require('worker_threads').isMainThread; } catch (e) {}
if (HOOK === 'zone' && !_isMain) {
  // 걸음표 워커(존이 띄운 스레드)도 `-r` 을 물려받는다 — 거기선 아무것도 안 한다
} else if (HOOK === 'zone') {
  // ── 존 안 — 씨 · 하루 경계마다 한 줄 ──
  const Module = require('module');
  const _compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VJS)) content += '\n;globalThis.__t533st = function () { return state; };\n';
    return _compile.call(this, content, filename);
  };
  const SEED = parseInt(process.env.T533_SEED || '', 10);
  const want = path.join(ROOT, 'server/zone-config.js');
  const _load = Module._load;
  let done = false;
  Module._load = function (req, parent, isMain) {
    const m = _load.apply(this, arguments);
    if (!done) { let f = null; try { f = Module._resolveFilename(req, parent, isMain); } catch (e) {} if (f === want) { done = true; if (SEED > 0 && m.ZONES) for (const z of Object.values(m.ZONES)) if (z) z.villageSeed = SEED; } }
    return m;
  };
  const OUTF = process.env.T533_ROWS;
  let lastDay = null, lastG = null, lastT = null;
  const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'], RAWGRAIN = ['wheat', 'rice', 'barley', 'millet'];
  const _iv = setInterval(() => {
    const st = globalThis.__t533st && globalThis.__t533st();
    if (!st || !st.ready || !st.world || st.tickJobs) return;   // 마감 중엔 안 센다(반쯤 넘어간 장부)
    const w = st.world;
    if (w.day === lastDay) return;
    const t = Date.now();
    let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0;
    for (const v of w.villages) {
      const n = (v.npcs || []).length; pop += n;
      if (v._everPop) ever++;
      if (v._everPop && n <= 0) dead++;
      weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
      expand += v.expansions || 0;
      toolQ += (v.storage.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
    }
    const stockOf = (r) => w.villages.reduce((a, v) => a + (v.storage[r] || 0), 0);
    const X = st.xzone;
    const row = { zone: st.zoneId, day: w.day, g: st.lastGameDay, skip: lastG != null ? Math.max(0, st.lastGameDay - lastG - (w.day - lastDay)) : 0, wallMs: lastT != null ? t - lastT : null,
      pop, dead, ever, weapQ: +weapQ.toFixed(1), expand, reqOpened: st.ledger ? st.ledger.stats.reqOpened : null, toolQ: +toolQ.toFixed(1),
      preserve: +PRESERVED.reduce((a, r) => a + stockOf(r), 0).toFixed(1), grain: +RAWGRAIN.reduce((a, r) => a + stockOf(r), 0).toFixed(1),
      trades: (w.tradeLog || []).length, caravans: (w.caravans || []).length, bodies: st.caravanBodies ? st.caravanBodies.size : 0,
      xz: X ? { st: X.st, core: X.core.st, geo: X.host.hs.geo, ready: X.core.peersReady().length, stubs: (X.core.X.stubs || []).length, retry: X.retry.length } : null };
    lastDay = w.day; lastG = st.lastGameDay; lastT = t;
    if (OUTF) try { fs.appendFileSync(OUTF, JSON.stringify(row) + '\n'); } catch (e) {}
  }, 200);
  if (_iv.unref) _iv.unref();
} else {
  main();
}

function main() {
  const { spawn } = require('child_process');
  const [MODE, ...A] = process.argv.slice(2);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
  const { ZONES } = require(path.join(ROOT, 'server/zone-config'));
  const ZS = ['hanbando', 'nippon'];

  if (MODE === 'run') {
    const [LABEL, SEEDS, DMS, DAYSS, OUTD, ARM] = A;
    const SEED = parseInt(SEEDS, 10), DAY_MS = parseInt(DMS, 10), DAYS = parseInt(DAYSS, 10);
    if (!(SEED > 0) || !(DAY_MS > 0) || !(DAYS > 0) || !OUTD || !/^(on|off)$/.test(ARM || '')) { console.error('쓰는 법: run <표지> <씨> <마을하루ms> <날> <outdir> <on|off>'); process.exit(2); }
    fs.mkdirSync(OUTD, { recursive: true });
    const tag = LABEL, CP = 3010;
    //   ⚠econ 은 기동 직후 첫 경계부터 돈다 — 합친 걸음표(워커 · 기동 뒤 1~2분)가 서기 전 며칠은 경계가 닫혀 있다(판 앞머리 · 줄의 `xz.ready` 가 적는다).
    const clockEnv = {};
    const cdb = path.join(OUTD, `c_${tag}.db`); rmdb(cdb);
    const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
      env: Object.assign({}, process.env, clockEnv, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZS.join(',') }) });
    const Z = {};
    for (const z of ZS) {
      const zdb = path.join(OUTD, `z_${tag}_${z}.db`); rmdb(zdb);
      const rows = path.join(OUTD, `rows_${tag}_${z}.jsonl`); try { fs.unlinkSync(rows); } catch (e) {}
      const env = Object.assign({}, process.env, clockEnv, { PORT: String(ZONES[z].port), ZONE_ID: z, CENTRAL_URL: `http://localhost:${CP}`, ENABLED_ZONES: ZS.join(','),
        DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), T533_HOOK: 'zone', T533_SEED: String(SEED), T533_ROWS: rows });
      if (ARM === 'on') env.T525_CROSS_ZONE = '1'; else delete env.T525_CROSS_ZONE;
      const logf = fs.openSync(path.join(OUTD, `z_${tag}_${z}.log`), 'w');
      Z[z] = { rows, p: spawn(process.execPath, ['-r', __filename, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf], env }) };
    }
    const meta = { tag, seed: SEED, arm: ARM, DAY_MS, DAYS, slice: process.env.VILLAGE_TICK_SLICE_MS || null, start: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version } };
    fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
    const kill = async () => { for (const z of ZS) { try { Z[z].p.kill('SIGINT'); } catch (e) {} } await sleep(4000); for (const z of ZS) { try { Z[z].p.kill('SIGKILL'); } catch (e) {} } try { c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
    process.on('SIGTERM', async () => { await kill(); process.exit(3); });
    (async () => {
      const t0 = Date.now();
      const LIM = t0 + (DAYS + 10) * DAY_MS * 4 + 30 * 60000;
      const lastDay = (f) => { try { const L = fs.readFileSync(f, 'utf8').trim().split('\n'); return L.length && L[0] ? JSON.parse(L[L.length - 1]).day : -1; } catch (e) { return -1; } };
      let dd = {};
      while (Date.now() < LIM) {
        await sleep(Math.max(2000, Math.min(30000, DAY_MS * 2)));
        if (ZS.some((z) => Z[z].p.exitCode != null)) { say(`[${tag}] ⚠존이 죽었다`); break; }
        dd = Object.fromEntries(ZS.map((z) => [z, lastDay(Z[z].rows)]));
        if (ZS.every((z) => dd[z] >= DAYS)) break;
      }
      meta.end = new Date().toISOString(); meta.wallS = +((Date.now() - t0) / 1000).toFixed(0); meta.days = dd; meta.done = ZS.every((z) => dd[z] >= DAYS);
      fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
      say(`[${tag}] 끝 · 날 ${JSON.stringify(dd)} · 벽시계 ${meta.wallS}초`);
      await kill();
      process.exit(0);
    })();
    return;
  }

  if (MODE === 'table') return table(A[0], A[1] === 'md');
  console.error('쓰는 법: run <표지> <씨> <마을하루ms> <날> <outdir> <on|off> · table <outdir> [md]');
  process.exit(2);
}

// ── 표 — 존마다 `<날>` 째 줄(없으면 마지막) · 경계 수는 그 줄의 누계 ──────────────────
function table(dir, md) {
  const metas = fs.readdirSync(dir).filter((f) => /^meta_.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const out = [];
  for (const m of metas) for (const z of ['hanbando', 'nippon']) {
    let rows = [];
    try { rows = fs.readFileSync(path.join(dir, `rows_${m.tag}_${z}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) {}
    if (!rows.length) continue;
    const at = rows.find((r) => r.day >= m.DAYS) || rows[rows.length - 1];
    const skip = rows.filter((r) => r.day <= at.day).reduce((a, r) => a + (r.skip || 0), 0);
    const walls = rows.filter((r) => r.day <= at.day && r.wallMs != null).map((r) => r.wallMs);
    const X = at.xz;
    out.push({ tag: m.tag, seed: m.seed, arm: m.arm, zone: z, day: at.day, skip, wallPerDay: walls.length ? +(walls.reduce((a, b) => a + b, 0) / walls.length / 1000).toFixed(2) : null,
      pop: at.pop, dead: at.dead, ever: at.ever, weapQ: at.weapQ, expand: at.expand, reqOpened: at.reqOpened, toolQ: at.toolQ, preserve: at.preserve, grain: at.grain,
      cross: X ? X.st.crossArrive : 0, back: X ? X.st.crossReturn : 0, sold: X ? X.st.soldOk : 0, deposited: X ? X.st.deposited : 0, lost: X ? X.st.lost : 0,
      arriveIn: X ? X.core.arriveIn : 0, returnIn: X ? X.core.returnIn : 0, bodyOut: X ? X.st.bodyOut : 0, bodyIn: X ? X.st.bodyIn : 0, fail: X ? X.st.sentFail : 0, bounced: X ? X.st.bounced : 0,
      geo: X && X.geo ? Object.values(X.geo)[0] : null });
  }
  out.sort((a, b) => (a.zone + a.seed + a.arm).localeCompare(b.zone + b.seed + b.arm));
  fs.writeFileSync(path.join(dir, 'table.json'), JSON.stringify(out, null, 1));
  const f = (x) => x == null ? '—' : (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : String(+(+x).toFixed(1)));
  const head = ['존', '씨', '팔', '날', '건너뜀', 's/일', '인구', '소멸', '무기Q', '확장셀', '게시', '도구Q', '보존식', '생곡', '넘김', '돌려보냄(성사)', '받음', '곳간', '몸 넘김·받음'];
  const L = [];
  const pr = (a) => L.push(md ? '| ' + a.join(' | ') + ' |' : a.join('\t'));
  pr(head); if (md) pr(head.map(() => '---'));
  for (const r of out) {
    const base = out.find((q) => q.zone === r.zone && q.seed === r.seed && q.arm === 'off');
    const pc = (k) => (r.arm === 'on' && base && base[k]) ? ` (${((r[k] / base[k] - 1) * 100 >= 0 ? '+' : '')}${((r[k] / base[k] - 1) * 100).toFixed(0)}%)` : '';
    pr([r.zone, r.seed, r.arm, r.day, r.skip, r.wallPerDay, f(r.pop) + pc('pop'), `${r.dead}/${r.ever}`, f(r.weapQ) + pc('weapQ'), f(r.expand) + pc('expand'), f(r.reqOpened) + pc('reqOpened'),
      f(r.toolQ) + pc('toolQ'), f(r.preserve) + pc('preserve'), f(r.grain) + pc('grain'), r.cross, `${r.back}(${r.sold})`, r.arriveIn, r.deposited, `${r.bodyOut}·${r.bodyIn}`]);
  }
  console.log(L.join('\n'));
}
