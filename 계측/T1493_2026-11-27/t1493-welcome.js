#!/usr/bin/env node
// (@regress 없음 — T1493 계측 · 러너 밖) welcome 길 몫 · 걸을 때 청크마다 오는 길 묶음 — 날 소켓(ws) · 라이브 사본 길
//   존(hanbando · 마을 켬 · 도적 끔 · `T1448_ROAD_GRID=1` · `T1493_ROAD_BOX` = 팔)을 재현 틀이 심은 DB(`_seed.db` — 11-23 라이브 사본 길 106만 행)로 띄운다.
//   ⓐ welcome — 소켓 글자 바이트 · 그 안 길 몫(`roads` 글자) · 압축(permessage-deflate 꼴 · zlib raw deflate 기본 수준 — 선 위 바이트 어림) ·
//      느린 망 어림(T1125 의 느린 길 자 42.5 KB/s — 선 위 바이트 ÷ 그 속도) · 받은 ms(같은 기계) · 칸별 바이트(큰 차례 10 — 길 밖 나머지가 무엇인가)
//      ※ 존의 길 날 = 부팅 순간 벽시계 날(T1001) — 사본을 묵힌 날만큼 닳는다. 사본 그날 꼴로 재려면 심은 DB 의 `d` 를 오늘로 민다(`seed-*s.db` — 상대 나이 그대로)
//   ⓑ 걷기 — 길 많은 마을(임업2 · 농촌22 · 광산1)을 가로지르는 줄을 32 px · 0.05초마다 순간 이동으로 간다 — 청크를 넘을 때마다 받은 `road_cells` 바이트(그 소켓 몫 · 마을 들머리로 뛴 순간 이동의 둘레 통째 묶음은 따로 센다 · 5초마다 ping)
//   쓰는 법: node 계측/T1493_2026-11-27/t1493-welcome.js --arm rb0|rb1 --seed <_seed.db> --out <json> [--shift(사본 그날 꼴)]
'use strict';
const path = require('path'), fs = require('fs'), zlib = require('zlib'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
//   포트 — 장부(`lib-port`)가 나눠 준 이어진 둘(central · 존 — 날 소켓은 존 포트로 바로 붙는다 · 제품 고정 포트를 쥔 긴 e2e 와 줄 서지 않는다)
const PB = require(path.join(ROOT, 'scripts', 'lib-port')).ports(2), CP = PB, ZP = PB + 1;
const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
const FB = require(path.join(ROOT, 'scripts', 'fixture-boot'));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const ARM = arg('--arm', 'rb1'), SEED = arg('--seed', ''), OUT = arg('--out', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SY = require(path.join(ROOT, 'scripts', 't1446-synth'));
const VB = (() => { const l = console.log; console.log = () => {}; try { return SY.villageCenters(); } finally { console.log = l; } })();
const procs = [];
function sp(file, env) { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p._o = ''; p.stdout.on('data', (b) => { if (p._o.length < 4e6) p._o += b; }); p.stderr.on('data', (b) => { if (p._o.length < 4e6) p._o += b; }); procs.push(p); return p; }
const KBPS = 42.5;   // T1125 느린 길 자(1.7 MB ÷ 40초)
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

(async () => {
  const out = { arm: ARM, at: new Date().toISOString() };
  try {
    const D = fs.mkdtempSync('/tmp/t1493wl-'); fs.copyFileSync(SEED, path.join(D, 'w.db'));
    if (A.includes('--shift')) {   // 사본 그날 꼴 — 심은 길의 날을 존 부팅 날(벽시계 · T1001 `_t1001RoadOff` 와 같은 식)로 민다(상대 나이 그대로 · 사본 밖 행 0)
      const { WORLD } = require(path.join(ROOT, 'server', 'zone-config')), { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(path.join(D, 'w.db')), today = Math.floor((Date.now() - (WORLD.worldEpoch || 0)) / WORLD.dayLengthMs), mx = db.prepare('SELECT MAX(d) m FROM roads').get().m;
      db.prepare('UPDATE roads SET d = d + ?').run(today - mx); db.close(); out.shift = { today, maxD: mx, by: today - mx };
    }
    const c = sp('central.js', { PORT: String(CP), DB_PATH: path.join(D, 'c.db'), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok) throw new Error('central');
    const z = sp('zone.js', { PORT: String(ZP), ZONE_ID: 'hanbando', DB_PATH: path.join(D, 'w.db'), CENTRAL_URL: `http://localhost:${CP}`, PUBLIC_HOST: 'localhost', ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
      T1448_ROAD_GRID: '1', T1493_ROAD_BOX: ARM === 'rb1' ? '1' : '0' });
    if (!(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 })).ok) throw new Error('zone');
    out.boot = (z._o.match(/\[T1448\] 칸 행[^\n]*/) || [''])[0];
    await sleep(20000);
    // ⓐ welcome — 다섯 번(광장 자리 · 새 소켓마다)
    out.welcome = [];
    for (let n = 0; n < 5; n++) {
      const t0 = Date.now();
      const r = await new Promise((res) => {
        const ws = new WebSocket(`ws://127.0.0.1:${ZP}/?name=t1493w&color=%23aa5533`, { perMessageDeflate: false });
        ws.on('message', (d) => { const s = String(d); if (s.startsWith('{"type":"welcome"')) { const m = JSON.parse(s); const roads = JSON.stringify(m.roads || null);
          const keys = Object.keys(m).map((k) => [k, Buffer.byteLength(JSON.stringify(m[k]) || '')]).sort((a, b) => b[1] - a[1]).slice(0, 10);   // 칸별 바이트(큰 차례 열)
          res({ ms: Date.now() - t0, bytes: Buffer.byteLength(s), roadBytes: Buffer.byteLength(roads), roadCells: m.roads ? m.roads.length / 3 : 0, wire: zlib.deflateRawSync(Buffer.from(s)).length, roadWire: zlib.deflateRawSync(Buffer.from(roads)).length, keys }); ws.close(); } });
        ws.on('error', () => res(null));
      });
      if (r) out.welcome.push(r); await sleep(500);
    }
    const w = out.welcome;
    out.wsum = w.length ? { bytes: w[0].bytes, roadBytes: w[0].roadBytes, roadCells: w[0].roadCells, wire: w[0].wire, roadWire: w[0].roadWire, msMed: q(w.map((x) => x.ms), 0.5), msMax: Math.max(...w.map((x) => x.ms)),
      slowSec: +(w[0].wire / 1024 / KBPS).toFixed(1), slowRoadSec: +(w[0].roadWire / 1024 / KBPS).toFixed(1), keys: w[0].keys } : null;
    // ⓑ 걷기 — 마을 셋을 잇는 줄(순간 이동 32 px · 0.05초) · 청크를 넘을 때마다 그 소켓 `road_cells` 바이트
    const ws = new WebSocket(`ws://127.0.0.1:${ZP}/?name=t1493walk&color=%23aa5533`, { perMessageDeflate: false });
    let pid = null, pos = null, phase = 'arrive'; const rc = [];   // rc = [때, 바이트, 칸, 갈래(arrive = 마을 들머리 순간 이동 · 둘레 25청크 통째 / cross = 걸어서 청크 하나 넘기 · 새로 든 한 줄)]
    ws.on('message', (d) => { const s = String(d); if (s.startsWith('{"type":"welcome"')) { pid = JSON.parse(s).pid; } else if (s.startsWith('{"type":"tick"')) { const m = JSON.parse(s); const me = (m.players || []).find((p) => p.pid === pid); if (me) pos = [me.x, me.y]; } else if (s.startsWith('{"type":"road_cells"')) rc.push([Date.now(), Buffer.byteLength(s), JSON.parse(s).cells.length / 3, phase]); });
    //   살아 있음 쪽지 — 존은 30초 동안 입력 · ping 이 없는 소켓을 끊는다(`STALE_WS_MS` · 순간 이동은 안 센다) — 5초마다 ping(없으면 셋째 마을 걷기가 잘린다)
    const keep = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
    for (let k = 0; k < 200 && !pos; k++) await sleep(50);
    const vils = ['임업2', '농촌22', '광산1'].map((n) => VB.vils.find((v) => v.name === n)).filter(Boolean);
    const free = (x, y) => !VB.blocked(x, y);
    const crossings = [];   // [청크 넘은 때, 그 뒤 0.3초 안 road_cells 바이트 · 칸]
    for (const v of vils) {
      const cx = v.cx * 32 + 16, cy = v.cy * 32 + 16, x0 = cx - 4 * 1024, x1 = cx + 4 * 1024;
      let x = x0; while (x < x1 && !free(x, cy)) x += 32;
      phase = 'arrive'; ws.send(JSON.stringify({ type: 'teleport_debug', x, y: cy })); await sleep(1500);
      const rc0 = rc.length; phase = 'cross';
      let lastCk = Math.floor(x / 1024);
      for (; x < x1; x += 32) {
        if (!free(x, cy)) continue;
        ws.send(JSON.stringify({ type: 'teleport_debug', x, y: cy })); await sleep(50);
        const ck = Math.floor(x / 1024); if (ck !== lastCk) { crossings.push({ v: v.name, t: Date.now() }); lastCk = ck; }
      }
      await sleep(800);
      out['walk_' + v.name] = { msgs: rc.length - rc0, kb: +(rc.slice(rc0).reduce((a, r) => a + r[1], 0) / 1024).toFixed(1), cells: rc.slice(rc0).reduce((a, r) => a + r[2], 0) };
    }
    clearInterval(keep); ws.close();
    const st = (a) => ({ n: a.length, medKB: a.length ? +(q(a, 0.5) / 1024).toFixed(2) : 0, p90KB: a.length ? +(q(a, 0.9) / 1024).toFixed(2) : 0, maxKB: a.length ? +(Math.max(...a) / 1024).toFixed(2) : 0 });
    out.perMsg = { ...st(rc.filter((r) => r[3] === 'cross').map((r) => r[1])), crossings: crossings.length, arrive: st(rc.filter((r) => r[3] === 'arrive').map((r) => r[1])) };   // 걸어 넘기 묶음만(들머리 순간 이동 묶음은 arrive 로 따로)
  } catch (e) { out.err = String(e && e.stack || e).slice(0, 600); }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out).slice(0, 1500));
  process.exit(0);
})();
