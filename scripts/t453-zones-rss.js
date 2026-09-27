#!/usr/bin/env node
// === scripts/t453-zones-rss.js — 26존 **동시** RSS(존마다) · 셀 수와 선형인가 (T453 ②) ==================================
//
// ★계측기다 — 러너 밖. T410 `zones` 자의 문법(존마다 한 프로세스 · central 하나 · 새 DB · 관측자 0 · 기본 손잡이 = 청크 끔 ·
//   `ENABLE_VILLAGES=1 VILLAGE_WAR_LOG=0`)에 두 가지만 더했다:
//   ① 부팅은 **다섯씩**(T410 `host` 와 같은 까닭 — 부팅 봉우리를 겹치지 않게 · 이 상자 8GB)
//   ② 존마다 **밖에서** `/proc/<pid>/status` 를 읽는다 — `VmHWM`(그 프로세스의 **최고점** RSS = 한 대 최소 RAM 의 자) ·
//      GC 전 `VmRSS`. 그리고 `SIGUSR2` 로 GC 뒤 값(`t453-rss-probe.js` 예비 적재 · 존 무접촉).
// 실행: node scripts/t453-zones-rss.js   (T453_ZONES="a,b,…"(기본 26존) · T453_GROUP=5 · T453_WARM_S=90 · T453_PORT=4600 · T453_OUTD=/tmp/t453z)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const Z = (process.env.T453_ZONES || Object.keys(ZONES).join(',')).split(',').filter(Boolean);
const GROUP = parseInt(process.env.T453_GROUP || '5', 10), WARM = parseInt(process.env.T453_WARM_S || '90', 10);
const BASE = parseInt(process.env.T453_PORT || '4600', 10);
const OUTD = process.env.T453_OUTD || '/tmp/t453z';
const SECRET = 't453-zones';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
fs.rmSync(OUTD, { recursive: true, force: true }); fs.mkdirSync(OUTD, { recursive: true });
const procKB = (pid) => { const o = {}; try { for (const l of fs.readFileSync(`/proc/${pid}/status`, 'utf8').split('\n')) { const m = l.match(/^(VmRSS|VmHWM):\s+(\d+)/); if (m) o[m[1]] = +m[2]; } } catch (e) {} return o; };
const kids = [];
process.on('exit', () => { for (const p of kids) { try { p.kill('SIGKILL'); } catch (e) {} } });
const cells = (zid) => Math.round(ZONES[zid].zoneWidth / 32) * Math.round(ZONES[zid].zoneHeight / 32);

(async () => {
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(BASE), DB_PATH: `${OUTD}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: Z.join(','), CENTRAL_SECRET: SECRET }) });
  kids.push(c);
  await sleep(3000);
  const B = {};
  const t00 = Date.now();
  for (let i = 0; i < Z.length; i += GROUP) {
    const grp = Z.slice(i, i + GROUP);
    for (const [j, zid] of grp.entries()) {
      const zport = BASE + 2 + (i + j) * 2;
      const logf = fs.openSync(`${OUTD}/${zid}.log`, 'w');
      const z = spawn(process.execPath, ['--expose-gc', '-r', path.join(__dirname, 't453-rss-probe.js'), path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
        env: Object.assign({}, process.env, { PORT: String(zport), ZONE_ID: zid, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(BASE), CENTRAL_SECRET: SECRET,
          DB_PATH: `${OUTD}/z-${zid}.db`, ENABLE_VILLAGES: '1', VILLAGE_WAR_LOG: '0', T453_PROBE_OUT: `${OUTD}/${zid}.probe.json`, T453_TAG_1: 'warm' }) });
      kids.push(z);
      B[zid] = { z, zport, t0: Date.now(), upS: null };
    }
    for (const zid of grp) {
      for (let k = 0; k < 900; k++) {
        try { if ((await fetch(`http://localhost:${B[zid].zport}/health`, { signal: AbortSignal.timeout(5000) })).ok) { B[zid].upS = (Date.now() - B[zid].t0) / 1000; break; } } catch (e) {}
        if (B[zid].z.exitCode != null) break;
        await sleep(1000);
      }
      say(`  ${zid.padEnd(14)} 기동 ${B[zid].upS}s · RSS ${((procKB(B[zid].z.pid).VmRSS || 0) / 1024).toFixed(0)}MB · 최고 ${((procKB(B[zid].z.pid).VmHWM || 0) / 1024).toFixed(0)}MB`);
    }
  }
  say(`${Z.length}존 부팅 ${((Date.now() - t00) / 1000).toFixed(0)}초 · 데우기 ${WARM}초`);
  await sleep(WARM * 1000);
  const rows = [];
  for (const zid of Z) {
    const pid = B[zid].z.pid, pre = procKB(pid);
    try { process.kill(pid, 'SIGUSR2'); } catch (e) {}
    let rec = null;
    for (let k = 0; k < 120 && !rec; k++) { await sleep(250); try { rec = JSON.parse(fs.readFileSync(`${OUTD}/${zid}.probe.json`, 'utf8'))[0]; } catch (e) {} }
    const post = procKB(pid);
    const M = (b) => b != null ? +(b / 1048576).toFixed(1) : null;
    rows.push({ zid, ocean: !!ZONES[zid].isOcean, cells: cells(zid), upS: B[zid].upS, alive: B[zid].z.exitCode == null,
      hwmMB: post.VmHWM ? +(post.VmHWM / 1024).toFixed(1) : null, rssPreMB: pre.VmRSS ? +(pre.VmRSS / 1024).toFixed(1) : null,
      rssGcMB: rec ? M(rec.mem.rss) : null, heapUsedMB: rec ? M(rec.mem.heapUsed) : null, heapTotalMB: rec ? M(rec.mem.heapTotal) : null, extMB: rec ? M(rec.mem.external) : null,
      counts: rec ? rec.counts : null });
  }
  const cMB = +((procKB(c.pid).VmRSS || 0) / 1024).toFixed(1);
  rows.sort((a, b) => b.cells - a.cells);
  console.log('\n| 존 | 셀(32px) | 기동 s | 최고점 VmHWM | RSS GC 전 | RSS GC 뒤 | 힙 쓴 · 총 | external | 마을 · 자원 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---|');
  const S = { hwm: 0, pre: 0, gc: 0 };
  for (const r of rows) {
    S.hwm += r.hwmMB || 0; S.pre += r.rssPreMB || 0; S.gc += r.rssGcMB || 0;
    const k = r.counts || {};
    console.log(`| ${r.zid}${r.ocean ? '(바다)' : ''} | ${r.cells.toLocaleString()} | ${r.upS} | ${r.hwmMB} | ${r.rssPreMB} | ${r.rssGcMB} | ${r.heapUsedMB} · ${r.heapTotalMB} | ${r.extMB} | ${k.bld != null ? k.bld : '-'} · ${k.res != null ? k.res : '-'} |`);
  }
  console.log(`| **${rows.length}존 합** | | | **${(S.hwm / 1024).toFixed(2)}GB** | **${(S.pre / 1024).toFixed(2)}GB** | **${(S.gc / 1024).toFixed(2)}GB** | | | |`);
  console.log(`central RSS ${cMB}MB`);
  // 선형 — 육지 · 바다 따로 최소제곱(RSS GC 전 = a + b·셀)
  const fit = (arr, key) => { const n = arr.length; if (n < 2) return null; const mx = arr.reduce((s, r) => s + r.cells, 0) / n, my = arr.reduce((s, r) => s + r[key], 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (const r of arr) { sxy += (r.cells - mx) * (r[key] - my); sxx += (r.cells - mx) ** 2; syy += (r[key] - my) ** 2; }
    const b = sxy / sxx; return { a: +(my - b * mx).toFixed(1), bPerMcell: +(b * 1e6).toFixed(1), r2: +((sxy * sxy) / (sxx * syy)).toFixed(3), n }; };
  const land = rows.filter((r) => !r.ocean && r.rssPreMB), sea = rows.filter((r) => r.ocean && r.rssPreMB);
  const fits = { landPre: fit(land, 'rssPreMB'), landGc: fit(land, 'rssGcMB'), landHwm: fit(land, 'hwmMB'), seaPre: fit(sea, 'rssPreMB'), seaGc: fit(sea, 'rssGcMB') };
  console.log('선형(MB = a + b·백만 셀 · R²):', JSON.stringify(fits));
  fs.writeFileSync(`${OUTD}/zones-rss.json`, JSON.stringify({ at: new Date().toISOString(), GROUP, WARM, rows, sum: S, centralMB: cMB, fits }, null, 1));
  for (const zid of Z) { try { B[zid].z.kill('SIGINT'); } catch (e) {} }
  await sleep(3000);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
