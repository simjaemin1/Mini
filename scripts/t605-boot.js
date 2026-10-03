#!/usr/bin/env node
// === scripts/t605-boot.js — 새 세계 첫 부팅 해부 · 하루 틱 주인 표 (T605 ①③ · 2026-10-03) ===============================
//
// ★계측기다(러너 밖 · 제품 무접촉). T453 자 문법(central + 존 · 새 DB · 존 env 는 기본값 = 라이브 문법) 위에
//   T356 탐침 문법(git worktree 사본에만 글자를 박는다 — `t605-probe-lib.js`)을 얹었다. 값은 `t605-probe-rt.js` 가 모은다.
// ★두 쓰임
//   ① 부팅(기본): 존마다 새 DB 로 띄워 `zone server up` 까지 단계별 시간·힙(표식) + 로그에서 시딩 · 거리행렬 · 교역로 A*(쌍 수 · ms 합) ·
//      소굴 · 지형 미리 굽기 · 첫 econ 하루를 뽑는다. `--after-day` 면 첫 `마을 econ day` 줄까지 기다린다.
//   ③ 틱(`--days N`): 같은 판을 N 게임일 더 돌린다(★정본 하루 길이 — `VILLAGE_DAY_MS` 안 준다 · `T400_BUILD_ACT` 안 준다 = 실 조건 ·
//      공통.md "시험 시계 함정"). 창(`T605_WIN_S`)마다 틱 분포·함수 몫 증분이 `<out>/<zone>.json` 에 쌓인다.
// ★여러 존은 **한 central 에 나란히** 띄운다(같은 벽시계 · 같은 상자). 나란히 띄운 판의 틱은 서로의 CPU 를 먹는다 — 표 머리에 적는다.
//
// 실행: node scripts/t605-boot.js [--zones hanbando,nippon] [--ref HEAD] [--out /tmp/t605/boot-main] [--after-day] [--days 0]
//                                 [--gc] [--env K=V,K=V] [--cport 3810] [--keep-tree]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const LIB = require('./t605-probe-lib');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZIDS = val('--zones', 'hanbando,nippon').split(',').filter(Boolean);
const REF = val('--ref', 'HEAD');
const OUTD = val('--out', '/tmp/t605/boot');
const DAYS = +val('--days', '0');
const AFTER_DAY = argv.includes('--after-day') || DAYS > 0;
const GC = argv.includes('--gc');
const CPORT = +val('--cport', '3810');
const EXTRA = (val('--env', '') || '').split(',').filter(Boolean).reduce((o, kv) => { const i = kv.indexOf('='); o[kv.slice(0, i)] = kv.slice(i + 1); return o; }, {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUTD, { recursive: true });
const TREE = path.join(OUTD, 'tree');
const procs = [];
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } if (!argv.includes('--keep-tree')) LIB.removeProbeTree(TREE); });
process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
function boot(name, args, env, dir) {
  const p = spawn(process.execPath, args, { cwd: dir, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._t0 = Date.now(); p._lines = 0;
  const log = fs.createWriteStream(path.join(OUTD, `${name}.log`));
  p._log = log; p._tail = '';
  const on = (b) => { const s = String(b); log.write(s); p._tail = (p._tail + s).slice(-200000); p._buf = (p._buf || '') + s; };
  p.stdout.on('data', on); p.stderr.on('data', on);
  procs.push(p); return p;
}
(async () => {
  LIB.makeProbeTree(TREE, REF);
  const DDIR = path.join(OUTD, 'db'); fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  const { ZONES } = require(path.join(TREE, 'server', 'zone-config'));
  const c = boot('central', [path.join(TREE, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') }, TREE);
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { console.log('central 실패', cu.why); process.exit(1); }
  const zs = [];
  for (const zid of ZIDS) {
    const zport = CPORT + 10 + zs.length;
    const args = [...(GC ? ['--expose-gc'] : []), '-r', LIB.RT, path.join(TREE, 'server', 'zone.js')];
    const z = boot(zid, args, Object.assign({ PORT: String(zport), ZONE_ID: zid, DB_PATH: `${DDIR}/world-${zid}.db`, CENTRAL_URL: `http://localhost:${CPORT}`,
      T605_OUT: path.join(OUTD, `${zid}.json`), T605_GC: GC ? '1' : '', T605_WIN_S: DAYS > 0 ? (process.env.T605_WIN_S || '600') : '0' }, EXTRA), TREE);
    z._zid = zid; z._port = zport;
    zs.push(z);
  }
  // 부팅 — 존은 나란히 뜬다(한 상자 · CPU 둘 — 표 머리에 적는다)
  const ups = await Promise.all(zs.map((z) => FB.waitUp(z, /zone server up on/, { name: z._zid, capMs: 1800000 }).then((u) => { z._upS = (Date.now() - z._t0) / 1000; return u; })));
  ups.forEach((u, i) => { if (!u.ok) console.log(`${zs[i]._zid} 실패 ${u.why}`); });
  if (AFTER_DAY) {
    await Promise.all(zs.map(async (z) => { for (let i = 0; i < 1800 && !/마을 econ day \d+/.test(z._buf); i++) await sleep(1000); z._day1S = (Date.now() - z._t0) / 1000; }));
  }
  // `--observer` — 존마다 관측자 하나를 첫 마을 한가운데 붙인다(T453 ⓒ 문법 — 그 둘레 청크가 켜지고 주민 몸이 걷는다 = 답압이 찍힌다)
  const keeps = [];
  if (argv.includes('--observer')) {
    const T = require(path.join(TREE, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
    const WebSocket = require('ws');
    for (const z of zs) {
      const v = (T.getZoneVillages(z._zid) || [])[0] || { x: ZONES[z._zid].zoneWidth / 2, y: ZONES[z._zid].zoneHeight / 2 };
      const ws = new WebSocket(`ws://localhost:${z._port}/?observer=1&vx=${Math.round(v.x)}&vy=${Math.round(v.y)}`);
      await new Promise((r) => { ws.on('open', r); ws.on('error', r); });
      keeps.push(setInterval(() => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: v.x, y: v.y })); ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000));
      console.log(`관측자 @ ${z._zid} ${v.name || '(가운데)'}`);
    }
  }
  await sleep(3000);
  // ② 게으른 계산의 증인 — 부팅 뒤 t 초에 캐시의 쌍을 **지금 길로** 다시 판다(`/routedbg?audit` · 정본 `computeRoutePts` · E2E_GIVE=1 팔만).
  //   어긋난 쌍 수 = 그 시각에 처음 팠다면 부팅 판과 바이트가 달랐을 쌍 수(지금 길 = 그 사이 걸은 몸이 다진 코스 지도).
  const AUD = (val('--audit-at', '') || '').split(',').filter(Boolean).map(Number);
  const audits = [];
  for (const at of AUD) {
    for (const z of zs) {
      const wait = z._t0 + z._upS * 1000 + at * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      const t0 = Date.now();
      let j = null; try { j = await (await fetch(`http://localhost:${z._port}/routedbg?audit=100000`, { signal: AbortSignal.timeout(900000) })).json(); } catch (e) { j = { err: e.message }; }
      const cm = (z._buf.match(/\[T605\] mark \{"k":"coarse1"[^\n]*/) || [''])[0];
      const a = { zone: z._zid, atS: at, auditMs: Date.now() - t0, mem: j.mem, audit: j.audit, err: j.err, coarse1: cm.replace('[T605] mark ', '') };
      audits.push(a); console.log('audit ' + JSON.stringify(a));
    }
  }
  if (AUD.length) fs.writeFileSync(path.join(OUTD, 'audit.json'), JSON.stringify(audits, null, 1));
  if (DAYS > 0) {
    const dayOf = (z) => { const m = z._buf.match(/마을 econ day (\d+)/g); return m ? +m[m.length - 1].replace(/\D+/g, '') : 0; };
    const d0 = zs.map(dayOf);
    console.log(`틱 판 시작 — day ${d0.join('/')} → +${DAYS}일(정본 하루)`);
    let last = Date.now();
    for (;;) {
      const ds = zs.map((z, i) => dayOf(z) - d0[i]);
      if (ds.every((d) => d >= DAYS)) break;
      if (zs.some((z) => z.exitCode !== null)) { console.log('존이 죽었다 — 끝'); break; }
      if (Date.now() - last > 3600000) { last = Date.now(); console.log(`  ${new Date().toISOString()} 진행 ${ds.join('/')}일`); }
      for (const z of zs) z._buf = z._buf.slice(-400000);
      await sleep(30000);
    }
    for (const z of zs) { try { process.kill(z.pid, 'SIGUSR1'); } catch (e) {} }
  }
  for (const z of zs) { try { z.kill('SIGINT'); } catch (e) {} }
  await sleep(2000);
  // ── 표 ──
  const out = [];
  for (const z of zs) {
    const L = fs.readFileSync(path.join(OUTD, `${z._zid}.log`), 'utf8');
    let J = null; try { J = JSON.parse(fs.readFileSync(path.join(OUTD, `${z._zid}.json`), 'utf8')); } catch (e) {}
    const num = (re) => { const m = L.match(re); return m ? +m[1] : null; };
    let aN = 0, aMs = 0, aMax = 0; for (const m of L.matchAll(/교역로 A\*: .* (\d+)ms \(캐시\)/g)) { aN++; aMs += +m[1]; if (+m[1] > aMax) aMax = +m[1]; }
    const r = { zone: z._zid, ref: REF, upS: +z._upS.toFixed(1), day1S: z._day1S ? +z._day1S.toFixed(1) : null,
      seedMs: null, bfsMs: num(/교역 BFS 거리행렬: \d+마을 \d+쌍 (\d+)ms/), astarN: aN, astarMs: aMs, astarMax: aMax,
      denMs: num(/소굴 \d+곳 배치 (\d+)ms/), prebakeMs: num(/지형 미리 굽기 — .* (\d+)ms\(기동 뒤/), streamsLoad: null,
      marks: J ? J.marks : null, acc: J ? J.acc : null };
    { const a = L.match(/마을 시딩 시작/), b = L.match(/마을 시딩 완료/); r.seedLines = !!(a && b); }
    out.push(r);
  }
  fs.writeFileSync(path.join(OUTD, 'boot.json'), JSON.stringify(out, null, 1));
  for (const r of out) {
    console.log(`\n### ${r.zone} (${r.ref}) — zone server up ${r.upS}s${r.day1S ? ` · 첫 econ day ${r.day1S}s` : ''}`);
    console.log('| 표식 | t(ms) | Δ(ms) | 힙 MB | RSS MB |'); console.log('|---|---:|---:|---:|---:|');
    let prev = 0; for (const m of (r.marks || [])) { console.log(`| ${m.k} | ${m.t} | ${m.t - prev} | ${m.heapGcMB != null ? m.heapGcMB + '(GC)' : m.heapMB} | ${m.rssMB} |`); prev = m.t; }
    console.log(`거리행렬 ${r.bfsMs}ms · 교역로 A* ${r.astarN}쌍 ${r.astarMs}ms(최대 ${r.astarMax}) · 소굴 ${r.denMs}ms · 미리 굽기 ${r.prebakeMs}ms`);
    if (r.acc) console.log('함수 몫: ' + Object.entries(r.acc).map(([k, a]) => `${k} ${a.n}회 ${a.ms}ms(최대 ${a.max})`).join(' · '));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
