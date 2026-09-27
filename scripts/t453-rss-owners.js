#!/usr/bin/env node
// === scripts/t453-rss-owners.js — 한반도 존 RSS 세 시점 (T453 ①) ==========================================
//
// ★계측기다 — 러너 밖. central + 한반도 존 하나를 띄우고(`--expose-gc -r scripts/t453-rss-probe.js` — 제품 무접촉)
//   세 시점에서 `SIGUSR2` 로 GC 뒤 메모리를 적는다:
//     ⓐ boot  — `zone server up` 뒤 15초(사람 0 · 관측자 0)
//     ⓑ day1  — 부팅 뒤 **첫** `마을 econ day` 줄(게임일 경계 · 24분 안) 뒤 15초
//     ⓒ obs1  — 관측자 하나를 첫 마을 한가운데 붙이고 30초 뒤(그 둘레 청크가 켜진다)
//   `--settle N` 이면 ⓒ 앞에 N초 더 기다린다(부팅 봉우리 뒤 V8 이 빈 쪽을 돌려주는 시간 — 하루 경계를 안 기다리는 짧은 판).
//   `--snap` 이면 시점마다 힙 스냅샷도 쓴다(`t453-heap-owners.js` 가 주인별로 연다).
//   존 env 는 **기본값**(라이브 문법 — ENABLE_* 안 줌). 포트는 배포 표 그대로(central 3010 · hanbando 3020).
//
// 실행: node scripts/t453-rss-owners.js [--snap] [--out /tmp/t453rss] [--zone hanbando] [--no-day]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const OUTD = val('--out', '/tmp/t453rss');
const ZID = val('--zone', 'hanbando');
const SETTLE = +val('--settle', 0);
const SNAP = argv.includes('--snap'), NODAY = argv.includes('--no-day'), GDB = argv.includes('--gdb');
const EXTRA = (val('--env', '') || '').split(',').filter(Boolean).reduce((o, kv) => { const i = kv.indexOf('='); o[kv.slice(0, i)] = kv.slice(i + 1); return o; }, {});
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CPORT = 3010, ZPORT = ZONES[ZID].port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUTD, { recursive: true });
const OUT = path.join(OUTD, `${ZID}.json`);
try { fs.unlinkSync(OUT); } catch (e) {}
const procs = [];
function boot(name, args, env) {
  const p = spawn(process.execPath, args, { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._out = ''; p._err = ''; p._t0 = Date.now();
  p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._err += String(b); });
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
const nRec = () => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')).length; } catch (e) { return 0; } };
// ★밖에서 읽기(존 무접촉): /proc 상태 · smaps_rollup. GC 전 RSS 와 최고점(VmHWM)은 이 자만 안다(프로브는 GC 뒤를 적는다).
const procKB = (pid) => { const o = {}; try { for (const l of fs.readFileSync(`/proc/${pid}/status`, 'utf8').split('\n')) { const m = l.match(/^(VmRSS|VmHWM|RssAnon|RssFile):\s+(\d+)/); if (m) o[m[1]] = +m[2]; } } catch (e) {} return o; };
const smapsKB = (pid) => { const o = {}; try { for (const l of fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8').split('\n')) { const m = l.match(/^(Rss|Anonymous|Private_Dirty|Shared_Clean|Private_Clean):\s+(\d+)/); if (m) o[m[1]] = +m[2]; } } catch (e) {} return o; };
const timeline = []; let _tl = null;
function watch(p) { _tl = setInterval(() => { const k = procKB(p.pid); if (k.VmRSS) timeline.push([+((Date.now() - p._t0) / 1000).toFixed(1), k.VmRSS]); }, 2000); }
const outside = [];
function gdbTrim(pid) {   // ★계측기: glibc 가 붙들고 있는 빈 malloc 을 OS 에 돌려준다 — "나머지"가 부팅 찌꺼기인지 가르는 자(존 코드 무접촉 · 상태는 바뀐다 — 표에 적는다)
  const { execFileSync } = require('child_process');
  try { execFileSync('gdb', ['-p', String(pid), '-batch', '-ex', 'call (void)malloc_stats()', '-ex', 'call (int)malloc_trim(0)'], { stdio: 'ignore', timeout: 120000 }); return true; } catch (e) { return false; }
}
async function sample(p, want) {
  const pre = procKB(p.pid), preS = smapsKB(p.pid);
  process.kill(p.pid, 'SIGUSR2');
  for (let i = 0; i < 600 && nRec() < want; i++) await sleep(500);   // 스냅샷은 수십 초 걸린다
  const post = procKB(p.pid), postS = smapsKB(p.pid);
  let trim = null;
  if (GDB) { const ok = gdbTrim(p.pid); await sleep(1000); trim = { ok, after: procKB(p.pid), afterS: smapsKB(p.pid) }; }
  outside.push({ pre, preS, post, postS, trim });
  return nRec() >= want;
}

(async () => {
  for (const port of [CPORT, ZPORT]) if (!await portFree(port)) { console.log(`★포트 ${port} 가 쓰인다 — 끝`); process.exit(2); }
  const DDIR = path.join(OUTD, 'db'); fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  const c = boot('central', [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { console.log('central 실패', cu.why); process.exit(1); }
  const z = boot(ZID, ['--expose-gc', '-r', path.join(__dirname, 't453-rss-probe.js'), path.join(ROOT, 'server', 'zone.js')], Object.assign({
    PORT: String(ZPORT), ZONE_ID: ZID, DB_PATH: `${DDIR}/world-${ZID}.db`, CENTRAL_URL: `http://localhost:${CPORT}`,
    T453_PROBE_OUT: OUT, T453_SNAP: SNAP ? '1' : '', T453_TAG_1: 'boot', T453_TAG_2: NODAY ? 'obs1' : 'day1', T453_TAG_3: 'obs1' }, EXTRA));
  watch(z);
  const zu = await FB.waitUp(z, /zone server up on/, { name: ZID, capMs: 900000 });
  const nAstar = () => (z._out.match(/교역로 A\*/g) || []).length;
  if (!zu.ok) { console.log('존 실패', zu.why); process.exit(1); }
  const upS = (Date.now() - z._t0) / 1000;
  console.log(`${ZID} 기동 ${upS.toFixed(1)}s · 부팅 중 교역로 A* ${nAstar()}쌍`);
  await sleep(15000);
  await sample(z, 1); console.log('  ⓐ boot 적음');
  let dayS = null;
  if (!NODAY) {
    const mark = z._out.length;
    for (let i = 0; i < 1800 && !/마을 econ day/.test(z._out.slice(mark)); i++) await sleep(1000);
    dayS = (Date.now() - z._t0) / 1000;
    await sleep(15000);
    await sample(z, 2); console.log(`  ⓑ day1 적음(게임일 경계 ${dayS.toFixed(0)}s)`);
  }
  if (SETTLE) { await sleep(SETTLE * 1000); console.log(`  (가라앉힘 ${SETTLE}s)`); }
  // ⓒ 관측자 하나 — 첫 마을 한가운데(정본 후보 칸)
  const v = (T.getZoneVillages(ZID) || [])[0] || { x: ZONES[ZID].zoneWidth / 2, y: ZONES[ZID].zoneHeight / 2, name: '(가운데)' };
  const WebSocket = require('ws');
  const ws = new WebSocket(`ws://localhost:${ZPORT}/?observer=1&vx=${Math.round(v.x)}&vy=${Math.round(v.y)}`);
  await new Promise((r) => { ws.on('open', r); ws.on('error', r); });
  const keep = setInterval(() => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: v.x, y: v.y })); ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  await sleep(30000);
  await sample(z, NODAY ? 2 : 3); console.log(`  ⓒ obs1 적음(관측자 @ ${v.name})`);
  clearInterval(keep); try { ws.close(); } catch (e) {}
  const recs = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const M = (b) => (b / 1048576).toFixed(1);
  console.log(`\n| 시점 | RSS | 힙 쓴 · 총 | external · arrayBuffers | 코드·지도 공간 | 개체(자원·건물·몹·활성 청크·링 청크) | GC ms |`);
  console.log('|---|---:|---:|---:|---:|---|---:|');
  for (const r of recs) {
    const sp = r.spaces || {}; const code = ((sp.code_space || {}).used || 0) + ((sp.map_space || {}).used || 0);
    const k = r.counts || {};
    console.log(`| ${r.tag} | ${M(r.mem.rss)}MB | ${M(r.mem.heapUsed)} · ${M(r.mem.heapTotal)}MB | ${M(r.mem.external)} · ${M(r.mem.arrayBuffers)}MB | ${M(code)}MB | ${k.res} · ${k.bld} · ${k.mobs} · ${k.act} · ${k.ringChunks} | ${r.gcMs} |`);
  }
  for (const r of recs) if (r.bandits) console.log(`  도적 창 ${r.tag}: ${JSON.stringify(r.bandits)}`);
  console.log(`\n| 시점 | GC 전 RSS(밖) | GC 뒤 RSS | 최고점 VmHWM | Anonymous | malloc_trim 뒤 RSS |`);
  console.log('|---|---:|---:|---:|---:|---:|');
  recs.forEach((r, i) => { const o = outside[i] || {}; const K = (x) => x ? (x / 1024).toFixed(1) + 'MB' : '-';
    console.log(`| ${r.tag} | ${K((o.pre || {}).VmRSS)} | ${K((o.post || {}).VmRSS)} | ${K((o.post || {}).VmHWM)} | ${K((o.postS || {}).Anonymous)} | ${o.trim ? K(o.trim.after.VmRSS) : '-'} |`); });
  const peak = timeline.reduce((m, t) => Math.max(m, t[1]), 0);
  console.log(`기동 중 RSS 최고 ${(peak / 1024).toFixed(0)}MB(2초 표본)`);
  fs.writeFileSync(path.join(OUTD, `${ZID}-meta.json`), JSON.stringify({ upS, dayS, village: v.name, extra: EXTRA, recs: recs.map((r) => ({ tag: r.tag, snap: r.snap })), outside, timeline }, null, 1));
  fs.writeFileSync(path.join(OUTD, `${ZID}-zone.log`), z._out + '\n--- stderr ---\n' + z._err);
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
