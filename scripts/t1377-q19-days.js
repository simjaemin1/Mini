#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기 · T1377 ③ · 제품 무변)
// === scripts/t1377-q19-days.js — 새 세계에서 마을마다 "새 사람이 낼 수 있는 의뢰"가 판에 처음 서는 econ 날 ====================
//
// ★왜 [T1368 회부 1 · 카드 T1377 ③] 새 세계 첫 열흘 남짓은 새 사람 품목(나무 · 돌 · 열매 · 약초)이 다 남아도는 마을(농촌1 · 어촌2)이 있다 —
//   그 마을에 도착한 새 사람은 받아들임 줄기(의뢰를 내서 받아들임을 올림)를 시작할 수 없다. 두 안을 같은 자로 잰다:
//   ㉠ 지금(제품 그대로 — 남아돌면 안 건다 · "지금은 급한 일이 없네") ㉡ 남아돌아도 새 사람 몫 하나는 건다(`--root` 로 고친 사본 나무를 준다).
// ★판: 실서버 존(central + zone · 켬 `T1341_OWN_HOUSE=1` · `VILLAGE_MAX 51` · 하루 `--day-ms`) — 사람 0 · 손님 0.
//   아이 존에 이 파일 자신을 `--require` 로 싣는다(훅 갈래 — env `T1377_Q19_OUT`): 장부(`events.createLedger`)의 하루 끝마다
//   마을마다 판의 품목 · 그중 새 사람 품목(장부 `newbieHas`) · 새 사람 품목의 남아돎(`glut`)을 적는다. 읽기만 — 세계에 0.
// 쓰는 법: node scripts/t1377-q19-days.js [--root <나무>] [--days 20] [--day-ms 500] [--port 3510] --out <json>
'use strict';
const path = require('path');
const fs = require('fs');

// ── 훅 갈래(아이 존 안) ─────────────────────────────────────────────────────────
if (process.env.T1377_Q19_OUT) {
  const Ev = require(path.join(process.cwd(), 'server', 'events'));
  const mk = Ev.createLedger;
  const days = [];
  Ev.createLedger = function (o) {
    const L = mk.call(this, o);
    const vidOf = (o && o.vidOf) || ((v, i) => i);
    const sd = L.scanDay;
    let last = -1;
    L.scanDay = function (world, day) {
      const ret = sd.apply(this, arguments);
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          const vs = [];
          (world.villages || []).forEach((v, i) => {
            const vid = vidOf(v, i); if (vid == null) return;
            const rows = L.board(vid) || [];
            const nbItems = Object.keys(v._consEMA || {}).filter((k) => L.newbieHas && L.newbieHas(k) && (+v._consEMA[k]) > 0);
            vs.push({ vid, name: v.name, board: rows.map((q) => q.item), nb: rows.filter((q) => L.newbieHas && L.newbieHas(q.item)).map((q) => q.item + (q.fit === 'daily' ? '*' : '')),
              glut: nbItems.filter((k) => { const dt = L.detOf(vid, k); return !!(dt && dt.glut); }) });
          });
          days.push({ day: d, vs });
          fs.writeFileSync(process.env.T1377_Q19_OUT, JSON.stringify(days));
        }
      } catch (e) {}
      return ret;
    };
    return L;
  };
  return;
}

// ── 판 갈래 ────────────────────────────────────────────────────────────────────
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(val('--root', path.join(__dirname, '..')));
const DAYS = +val('--days', '20'), DMS = val('--day-ms', '500'), PB = +val('--port', '3510'), OUT = val('--out', '/tmp/t1377-q19.json');
const CPORT = PB, ZPORT = PB + 10;
const RAW = OUT.replace(/\.json$/, '') + '-raw.json';
const CDB = `/tmp/t1377-q19-c-${process.pid}.db`, ZDB = `/tmp/t1377-q19-z-${process.pid}.db`;
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(file, env) { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; }
function down() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } }
process.on('exit', down);
(async () => {
  try { fs.unlinkSync(RAW); } catch (e) {}
  const cen = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const zon = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    VILLAGE_MAX: '51', VILLAGE_DAY_MS: DMS, T1341_OWN_HOUSE: '1', T1377_Q19_OUT: RAW, NODE_OPTIONS: `--require ${__filename}` });
  const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!a.ok || !b.ok) { console.log('기동 실패'); process.exit(2); }
  const t0 = Date.now();
  let rec = [];
  while (Date.now() - t0 < 1800000) {
    await sleep(2000);
    try { rec = JSON.parse(fs.readFileSync(RAW, 'utf8')); } catch (e) { continue; }
    if (rec.length && rec[rec.length - 1].day - rec[0].day + 1 >= DAYS) break;
  }
  //   마을마다 — 새 사람 의뢰가 판에 처음 선 날(첫 기록 날 = 1) · 그 전 날들에 새 사람 품목이 다 남아돌았나
  const d0 = rec.length ? rec[0].day : 0;
  const byV = new Map();
  for (const r of rec) for (const v of r.vs) {
    let o = byV.get(v.vid); if (!o) byV.set(v.vid, o = { vid: v.vid, name: v.name, first: null, glutDays: 0, seq: [] });
    const k = r.day - d0 + 1;
    if (o.first == null && v.nb.length) o.first = k;
    if (o.first == null && v.glut.length) o.glutDays++;
    if (o.seq.length < DAYS) o.seq.push(v.nb.length ? v.nb.join('+') : (v.board.length ? '·' : '∅'));
  }
  const rows = [...byV.values()].sort((x, y) => x.vid - y.vid);
  const firsts = rows.map((r) => (r.first == null ? Infinity : r.first));
  const sum = { root: ROOT, days: rec.length, dayMs: +DMS, villages: rows.length,
    zeroByDay: Array.from({ length: Math.min(DAYS, rec.length) }, (_, i) => rec[i].vs.filter((v) => !v.nb.length).length),
    firstMax: Math.max(...firsts), never: firsts.filter((x) => x === Infinity).length,
    pick: rows.filter((r) => /^(농촌1|어촌2|임업2|광산4)$/.test(r.name)).map((r) => ({ name: r.name, first: r.first, seq: r.seq.slice(0, 14).join(' ') })) };
  console.log(JSON.stringify(sum, null, 1));
  fs.writeFileSync(OUT, JSON.stringify({ sum, rows }, null, 1));
  down(); process.exit(0);
})().catch((e) => { console.log('예외 ' + (e && e.stack || e)); down(); process.exit(1); });
