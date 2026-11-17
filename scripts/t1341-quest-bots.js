#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기 · T1341 ④ 경제 영향 판 · 제품 무변)
// === scripts/t1341-quest-bots.js — 봇 플레이어 20명이 마을 의뢰를 하루 N건 채우는 판: 갚음 있을 때(끔) ↔ 없을 때(켬) 곳간 · 시세 ====================
//
// ★왜 [카드 T1341 ④] 사람 0 판은 켬 · 끔이 같다(갚음은 사람 납품에서만 나간다). 사람이 의뢰를 채우는 판에서 갚음이 빠지면
//   마을 곳간 · 시세가 얼마나 도는지 한 장으로 본다.
// ★손은 사람 손과 같은 문이다 — 봇은 게스트 ws 로 들어와 그 마을 게시판(`village_board`)을 읽고, 낼 것을 짐에 받고(픽스처 `__e2e_give` ·
//   E2E_GIVE 판 — 끔 · 켬 똑같이), 납품(`village_deliver` — 게시판 납품 단추 · Shift N 이 보내는 그 한 줄)을 보낸다.
//   관측도 사람 문이다 — 마을마다 관측 봇 하나가 거래소 시세표(`village_trade` — 재고 · 기준 품목 환산)를 읽는다(세계에 0).
// ★두 판은 같은 세계(같은 존 · 같은 마을 수 · 같은 날 길이 · 같은 데우기) · 같은 봇 차례 — 다른 것은 손잡이 하나(`T1341_OWN_HOUSE`).
//   실시간 서버라 바이트 결정론은 아니다 — 끔 판 두 번의 차이(잡음 바닥)를 같이 적는다(`--arm off2`).
//
// 쓰는 법: node scripts/t1341-quest-bots.js --arm off|on|off2 [--bots 20] [--per 1] [--warm 20] [--days 40] [--day-ms 2000] [--villages 6] [--port 3110] --out <json>
//          node scripts/t1341-quest-bots.js --chart <off.json> <on.json> [<off2.json>] --png <out.png>   (표 · 그림)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (argv[0] === '--chart') { chart(); return; }

const ARM = val('--arm', 'off');
const NB = +val('--bots', '20'), PER = +val('--per', '1'), WARM = +val('--warm', '20'), DAYS = +val('--days', '40'), DMS = +val('--day-ms', '2000');
const FIX = argv.includes('--fixture');
const NV = val('--villages', '6'), PB = +val('--port', '3110'), OUT = val('--out', `/tmp/t1341-bots-${ARM}.json`);
const CPORT = PB, ZPORT = PB + 10;
const CDB = `/tmp/t1341-bots-c-${process.pid}.db`, ZDB = `/tmp/t1341-bots-z-${process.pid}.db`;
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function cleanup() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } }
process.on('exit', cleanup);
async function jget(u) { try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }

(async () => {
  const FB = require('./fixture-boot');
  const WebSocket = require('ws');
  const cen = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const zon = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: NV, VILLAGE_DAY_MS: String(DMS), E2E_GIVE: '1',
    ...(ARM === 'on' ? { T1341_OWN_HOUSE: '1' } : {}) });
  const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!a.ok || !b.ok) { console.log('기동 실패'); process.exit(2); }
  let info = null;
  for (let i = 0; i < 120 && !info; i++) { const j = await jget(`http://localhost:${ZPORT}/startinfo`); if (j && j.ok && j.villages && j.villages.length) info = j; else await sleep(2000); }
  const V = info.villages.map((v) => ({ vid: v.vid, name: v.name, x: v.cx * 32 + 16, y: v.cy * 32 + 16 }));
  console.log(`[${ARM}] 마을 ${V.length}곳 · 봇 ${NB} · 하루 ${DMS}ms · 데우기 ${WARM}날 · 판 ${DAYS}날`);

  // 봇 — 게스트 ws(로비 없이 존에 바로 · loadtest 꼴)
  function bot(i) {
    return new Promise((res) => {
      const ws = new WebSocket(`ws://localhost:${ZPORT}/?username=&name=qbot${i}&color=%23a0a0a0`);
      const B = { i, ws, inv: {}, board: null, trade: null, notices: [], rew: {}, gave: {}, deliv: 0, welcome: false };
      ws.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.type === 'welcome') { B.welcome = true; let seq = 0; B.keep = setInterval(() => { try { ws.send(JSON.stringify({ type: 'input', seq: ++seq, vx: 0, vy: 0 })); } catch (e) {} }, 500); res(B); }   // 살아 있음(존은 오래 조용한 소켓을 내린다 — STALE_WS_MS)
        else if (m.type === 'inventory') B.inv = Object.assign({}, m.inventory || m.inv || {});
        else if (m.type === 'village_board') B.board = m.board;
        else if (m.type === 'village_trade') B.trade = m.trade;
        else if (m.type === 'notice') { B.notices.push(m.text); const mm = /삯으로 (\S+) ([\d.]+)을/.exec(m.text || ''); if (mm) B.rew[mm[1]] = (B.rew[mm[1]] || 0) + (+mm[2]); if (/바쳤습니다/.test(m.text || '')) B.deliv++; }
      });
      ws.on('error', () => res(B));
      setTimeout(() => res(B), 20000);
    });
  }
  const send = (B, m) => { try { B.ws.send(JSON.stringify(m)); } catch (e) {} };
  const bots = [];
  for (let i = 0; i < NB; i++) { bots.push(await bot(i)); await sleep(150); }
  const obs = [];
  for (let k = 0; k < V.length; k++) { obs.push(await bot(1000 + k)); await sleep(150); }
  console.log(`  들어옴 — 봇 ${bots.filter((b) => b.welcome).length}/${NB} · 관측 ${obs.filter((b) => b.welcome).length}/${V.length}`);
  for (let k = 0; k < V.length; k++) send(obs[k], { type: 'teleport_debug', x: V[k].x, y: V[k].y });
  bots.forEach((B, i) => { B.v = V[i % V.length]; send(B, { type: 'teleport_debug', x: B.v.x, y: B.v.y }); });
  await sleep(1500);

  // 관측 — 마을마다 시세표(재고 합 · 기준 품목 환산의 기하평균)
  async function observe() {
    for (const o of obs) o.trade = null;
    //   하루 장부를 닫는 동안은 거래소가 잠깐 닫힌다("곧 처리됩니다") — 못 받은 마을만 다시 묻는다(세 번)
    for (let t = 0; t < 4 && obs.some((o) => !o.trade); t++) {
      obs.forEach((o, k) => { if (!o.trade) send(o, { type: 'village_trade', vid: V[k].vid }); });
      await sleep(t ? 400 : 450);
    }
    return obs.map((o, k) => {
      const rows = (o.trade && o.trade.rows) || [];
      const st = rows.reduce((s, r) => s + (+r.stock || 0), 0);
      const nums = rows.map((r) => +r.num).filter((x) => x > 0);
      const gm = nums.length ? Math.exp(nums.reduce((s, x) => s + Math.log(x), 0) / nums.length) : null;
      return { vid: V[k].vid, stock: +st.toFixed(1), gm: gm == null ? null : +gm.toFixed(4), n: rows.length,
        st: Object.fromEntries(rows.map((r) => [r.res, +r.stock || 0])), num: Object.fromEntries(rows.map((r) => [r.res, +r.num || 0])) };
    });
  }
  const series = [];
  let fixN = 0, rowsSeen = 0;
  const t0 = Date.now();
  // 데우기 — 봇은 서 있기만(소비 흐름 · 게시판이 선다)
  for (let d = 0; d < WARM; d++) { await sleep(DMS); }
  series.push({ d: 0, obs: await observe(), deliv: 0 });
  for (let d = 1; d <= DAYS; d++) {
    const tDay = Date.now();
    for (let p = 0; p < PER; p++) {
      for (const B of bots) { B.board = null; send(B, { type: 'village_board', vid: B.v.vid }); }
      await sleep(350);
      for (const B of bots) {
        const row = B.board && B.board.rows && B.board.rows.find((r) => (r.give || []).length && r.remain > 0);
        if (!row) continue;
        const it = row.give[0], n = Math.max(1, Math.ceil(row.remain));
        B.gave[it] = (B.gave[it] || 0) + n;
        send(B, { type: '__e2e_give', items: { [it]: n } });
        send(B, { type: 'village_deliver', vid: B.v.vid, item: row.item });
      }
      await sleep(300);
    }
    //   게시판 관측(걸린 의뢰 줄 수) — `--fixture` 면 빈 마을에 부족을 세운다(e2e 픽스처 `__e2e_village_short` · ⚠갚을 잉여를 10만으로 채우는 손이라 경제 판엔 안 쓴다 — 기본 끔)
    for (const o2 of obs) o2.board = null;
    obs.forEach((o2, k) => send(o2, { type: 'village_board', vid: V[k].vid }));
    await sleep(250);
    let fx = 0;
    obs.forEach((o2, k) => { const n = (o2.board && o2.board.rows) ? o2.board.rows.length : 0; rowsSeen += n; if (FIX && !n) { send(o2, { type: '__e2e_village_short', vid: V[k].vid }); fx++; } });
    fixN += fx;
    const o = await observe();
    series.push({ d, obs: o, deliv: bots.reduce((s, B) => s + B.deliv, 0) });
    if (d % 10 === 0) console.log(`  ${d}날 — 납품 ${series[series.length - 1].deliv} · 재고 합 ${o.reduce((s, x) => s + x.stock, 0).toFixed(0)}`);
    const left = DMS - (Date.now() - tDay); if (left > 0) await sleep(left);
  }
  const rew = {}; for (const B of bots) for (const [k, v] of Object.entries(B.rew)) rew[k] = +((rew[k] || 0) + v).toFixed(2);
  const gave = {}; for (const B of bots) for (const [k, v] of Object.entries(B.gave)) gave[k] = (gave[k] || 0) + v;
  const out = { arm: ARM, knob: ARM === 'on', bots: NB, per: PER, warm: WARM, days: DAYS, dayMs: DMS, villages: V, sec: Math.round((Date.now() - t0) / 1000),
    deliv: bots.reduce((s, B) => s + B.deliv, 0), obsNotices: obs.map((o) => o.notices.slice(-3)), fixtures: fixN, boardRowDays: rowsSeen, rewGot: rew, gave, series };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`  끝 — 납품 ${out.deliv} · 픽스처 부족 ${fixN} · 받은 갚음 ${JSON.stringify(rew)} · 낸 것 ${JSON.stringify(gave)} → ${OUT}`);
  for (const B of bots.concat(obs)) { try { clearInterval(B.keep); B.ws.close(); } catch (e) {} }
  cleanup();
  process.exit(0);
})().catch((e) => { console.log('예외: ' + (e && e.stack || e)); cleanup(); process.exit(1); });

// ── 표 · 그림 ─────────────────────────────────────────────────────────────────────
function chart() {
  const files = argv.slice(1).filter((x) => x.endsWith('.json'));
  const png = val('--png', '/tmp/t1341-bots.png');
  const runs = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  //   거래소가 하루 장부를 닫는 동안 못 본 마을이 있는 날은 뺀다(그날 합이 거짓으로 떨어진다)
  const tot = (r) => r.series.filter((s) => s.obs.every((o) => o.n > 0)).map((s) => ({ d: s.d, stock: s.obs.reduce((a, o) => a + o.stock, 0), gm: (() => { const g = s.obs.map((o) => o.gm).filter((x) => x > 0); return g.length ? Math.exp(g.reduce((a, x) => a + Math.log(x), 0) / g.length) : null; })(), deliv: s.deliv }));
  const T = runs.map((r) => ({ arm: r.arm, t: tot(r), r }));
  const lines = [];
  lines.push('판 | 납품 | 받은 갚음 | 재고 합 0날 → 끝 | 시세 기하평균 0날 → 끝');
  for (const x of T) { const a = x.t[0], z = x.t[x.t.length - 1]; lines.push(`${x.arm} | ${x.r.deliv} | ${JSON.stringify(x.r.rewGot)} | ${a.stock.toFixed(0)} → ${z.stock.toFixed(0)} | ${a.gm && a.gm.toFixed(3)} → ${z.gm && z.gm.toFixed(3)}`); }
  console.log(lines.join('\n'));
  const py = `
import json,sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
T=json.loads(sys.argv[1]); out=sys.argv[2]
fig,ax=plt.subplots(1,2,figsize=(11,4))
col={'off':'#4a6fa5','on':'#c8553d','off2':'#9aa5b1'}
for x in T:
  d=[p['d'] for p in x['t']]
  ax[0].plot(d,[p['stock'] for p in x['t']],label=x['arm'],color=col.get(x['arm'],'#555'),lw=1.8)
  ax[1].plot(d,[p['gm'] for p in x['t']],label=x['arm'],color=col.get(x['arm'],'#555'),lw=1.8)
ax[0].set_title('granary stock sum (trade board rows)'); ax[0].set_xlabel('day (bots on)')
ax[1].set_title('price index (geo-mean of num)'); ax[1].set_xlabel('day (bots on)')
for a in ax: a.legend(frameon=False); a.grid(alpha=.25)
fig.tight_layout(); fig.savefig(out,dpi=110)
`;
  execFileSync('python3', ['-c', py, JSON.stringify(T.map((x) => ({ arm: x.arm, t: x.t }))), png], { stdio: 'inherit' });
  console.log(`→ ${png}`);
}
