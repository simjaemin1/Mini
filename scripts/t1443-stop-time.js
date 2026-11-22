#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1443 ④ 존 내리기 시간 자 · 제품 무변 · 로컬 판만)
// === scripts/t1443-stop-time.js — 존을 체크포인트 DB 로 띄우고 SIGTERM → 끝날 때까지 걸린 시간을 n 번 ==========
//   왜(사고 2026-11-21): 배포 줄 `docker stop`(기본 10초)이 존을 10초에 SIGKILL 했다 — 존이 제 종료 저장(`[T728] 종료 저장`)을 몇 초에 끝내나.
//   node scripts/t1443-stop-time.js --ck <t1308 체크포인트 폴더(w.db)> [--n 20] [--day-ms 20000] [--out <파일.json>]
//   판마다: DB 사본 → `node server/zone.js`(ZONE_ID=hanbando · central 없음) → `/health` 200 까지(부팅 초) → 하루 길이를 n 등분한 만큼 기다림
//   (판마다 하루의 다른 때 — 마감 · 정산 한가운데도 맞는다) → `/perf`(틱 최대 · 루프 지연) → SIGTERM → 끝(종료 코드)까지 ms · 존이 찍은
//   `[T728] 종료 저장 — … 마감 기다림 ○ms · 저장 ○ms` · `광맥 장부 종료 쓰기` · `flush 완료: mob ○, player ○` 줄.
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존(배포 줄 · zone.js)을 띄운다 — 남의 central(기본 3010)에 안 붙게
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const CK = opt('ck'), N = +opt('n', '20'), DAY_MS = +opt('day-ms', '20000'), OUT = opt('out', path.join(os.tmpdir(), 't1443-stop.json'));
if (!CK || !fs.existsSync(path.join(CK, 'w.db'))) { console.error('쓰는 법: --ck <폴더 — w.db 가 있는>'); process.exit(2); }
const freePort = () => new Promise((res) => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const get = (port, p) => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, (s) => { let b = ''; s.on('data', (c) => b += c); s.on('end', () => res({ status: s.statusCode, body: b })); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const W = fs.mkdtempSync(path.join(os.tmpdir(), 't1443-stop-'));
    for (const f of ['w.db', 'w.db-wal', 'w.db-shm']) if (fs.existsSync(path.join(CK, f))) fs.copyFileSync(path.join(CK, f), path.join(W, f));
    const port = await freePort();
    const env = Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: path.join(W, 'w.db'), ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1', VILLAGE_DAY_MS: String(DAY_MS) });
    const t0 = Date.now(); let log = '';
    const ch = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    ch.stdout.on('data', (c) => { log += c; if (log.length > 4e6) log = log.slice(-2e6); }); ch.stderr.on('data', (c) => { log += c; });
    const exited = new Promise((r) => ch.on('exit', (code, sig) => r({ code, sig, at: Date.now() })));
    let up = null;
    for (let k = 0; k < 1800 && up == null; k++) { const h = await get(port, '/health'); if (h && h.status === 200) up = Date.now(); else await sleep(1000); if (ch.exitCode != null) break; }
    if (up == null) { rows.push({ i, err: '부팅 실패', tail: log.slice(-400) }); try { ch.kill('SIGKILL'); } catch (e) {} continue; }
    await sleep(Math.round(DAY_MS * (i % N) / N) + 3000);   // 하루의 다른 때(+3초 — 첫 틱 뒤)
    const pf = await get(port, '/perf'); let perf = null; try { perf = JSON.parse(pf.body); } catch (e) {}
    const hb = await get(port, '/health'); let day = null; try { day = JSON.parse(hb.body).day; } catch (e) {}
    const before = log.length, tTerm = Date.now();
    ch.kill('SIGTERM');
    const ex = await Promise.race([exited, sleep(180000).then(() => null)]);
    if (!ex) { try { ch.kill('SIGKILL'); } catch (e) {} }
    const tail = log.slice(before);
    const m = tail.match(/\[T728\] 종료 저장 — ([^·]*)· 마감 기다림 (\d+)ms · 저장 (\d+)ms · 마을 (\d+)/);
    const fl = tail.match(/flush 완료: mob (\d+), player (\d+)/), vein = tail.match(/광맥 장부 종료 쓰기 — (\d+) 셀/);
    const pick = (o, ks) => { for (const k of ks) { const v = k.split('.').reduce((a, x) => (a == null ? a : a[x]), o); if (v != null) return v; } return null; };
    const row = { i, bootSec: +((up - t0) / 1000).toFixed(1), day, stopMs: ex ? ex.at - tTerm : null, exit: ex ? (ex.code != null ? ex.code : ex.sig) : 'timeout',
      why: m ? m[1].trim() : null, waitMs: m ? +m[2] : null, saveMs: m ? +m[3] : null, villages: m ? +m[4] : null,
      mobs: fl ? +fl[1] : null, players: fl ? +fl[2] : null, veinCells: vein ? +vein[1] : null,
      tickMaxMs: perf ? pick(perf, ['tick.ms.max', 'tick.ms.p100']) : null, tickP95Ms: perf ? pick(perf, ['tick.ms.p95']) : null, loopMaxMs: perf ? pick(perf, ['loop.max']) : null, loopP99Ms: perf ? pick(perf, ['loop.p99']) : null,
      perfKeys: perf ? Object.keys(perf).slice(0, 30) : null };
    rows.push(row);
    console.log(`  ${i + 1}/${N} 부팅 ${row.bootSec}초 · 날 ${day} · SIGTERM → 끝 ${row.stopMs}ms(코드 ${row.exit}) · 마감 기다림 ${row.waitMs}ms · 저장 ${row.saveMs}ms · mob ${row.mobs} · player ${row.players} · 틱 최대 ${row.tickMaxMs}`);
    fs.writeFileSync(OUT, JSON.stringify({ ck: path.basename(CK), dayMs: DAY_MS, rows }, null, 1));
    fs.rmSync(W, { recursive: true, force: true });
  }
  const ok = rows.filter((r) => r.stopMs != null), mx = ok.length ? Math.max(...ok.map((r) => r.stopMs)) : null;
  console.log(`끝 — ${ok.length}/${N} · 가장 긴 것 ${mx}ms · 10초 넘김 ${ok.filter((r) => r.stopMs > 10000).length}/${ok.length} → ${OUT}`);
})();
