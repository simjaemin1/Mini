#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · 판 도구 · T1489 · 제품 코드 · 있던 스크립트 손 0)
// =============================================================================
// scripts/t1489-rig.js — 실시계(가상 시계 아님) 존 + 중앙 + 봇(브라우저 없는 ws 손님) 한 판 [T1489 · S14]
//   `e2e-membership` 과 같은 기동(중앙 + 존 · 같은 env) 위에 `ws` 봇을 얹는다. 클라(`41-h-bubble.js`)가 하는 말만 그대로 흉내 낸다 —
//   순간 이동 뒤 근접 마을에 `village_brief`(700ms 틱 → 첫 틱이 0 ~ 0.7초 안) · 채팅 `/인출`(순간 이동 뒤 약 1.4 ~ 2.0초 · T1485 가 잰 분포).
//   모드 (env T1489_MODE):
//     load   — 봇 N(기본 8)이 마을 곁에서 마을 요청(`village_view` · `village_board` · `village_brief`)을 번갈아 보내고 250ms 마다 `ping`.
//              요청마다 보낸 시각 · 답이 온 시각(같은 종류의 답) · "마감 중" 알림을 본 적 있는지를 `$OUT/load.jsonl` 에.
//   corner — 손님 한 명씩 20판(T1489_TRIALS): T1489_CORNER = base | cross | adj | private  (아래 각 절). 한 판 = 새 몸(새 접속) 하나. 결과 `$OUT/corner.jsonl`.
//   서버 쪽 귀는 `t1489-probe.js`(T1489_PROBE=1 이면 존에 건다 · T1489_PRE 에 `--require` 줄이 들어 있다).
//   env: T1489_RIGOUT(나올 곳) · T1489_DAYMS(하루 ms · 기본 600) · VILLAGE_MAX · T1489_SECS(load 길이) · T1489_BOTS · T1489_TRIALS · T1489_ZENV(JSON · 존 env 덧붙임)
// =============================================================================
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(central 기본 · hanbando 존) — 판 도구는 이름공간 안에서 돌지만 린트 ⑯a 대로 쥔다(판을 돌린 뒤 단 줄 · 값 무영향)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const E = process.env;
const OUT = E.T1489_RIGOUT || '/tmp/t1489rig'; fs.mkdirSync(OUT, { recursive: true });
const MODE = E.T1489_MODE || 'load', CORNER = E.T1489_CORNER || 'base';
const BOTS = +(E.T1489_BOTS || 8), SECS = +(E.T1489_SECS || 120), TRIALS = +(E.T1489_TRIALS || 20), DAYMS = E.T1489_DAYMS || '600';
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1489-c-${process.pid}.db`, ZDB = `/tmp/t1489-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const now = () => Number(process.hrtime.bigint()) / 1e6;
const procs = [];
const log = (s) => console.log(`[rig ${new Date().toISOString().slice(11, 19)}] ${s}`);
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { /* */ } } });
const put = (f, o) => { try { fs.appendFileSync(path.join(OUT, f), JSON.stringify(o) + '\n'); } catch (e) { /* */ } };
async function jget(u) { try { const r = await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }

// ── 봇 ────────────────────────────────────────────────────────────────────────
function bot(name) {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?username=&name=${name}&color=%23a0a0a0`);
    const B = { name, ws, welcome: false, notices: [], listeners: [], closed: false };
    ws.on('message', (d) => {
      let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
      if (m.type === 'welcome' && !B.welcome) {
        B.welcome = true; let seq = 0;
        B.keep = setInterval(() => { try { ws.send(JSON.stringify({ type: 'input', seq: ++seq, vx: 0, vy: 0 })); } catch (e) { /* */ } }, 500);
        res(B);
      }
      if (m.type === 'notice') B.notices.push({ t: now(), text: String(m.text || '') });
      for (const f of B.listeners.slice()) f(m);
    });
    ws.on('error', () => res(B));
    ws.on('close', () => { B.closed = true; clearInterval(B.keep); });
    setTimeout(() => res(B), 25000);
  });
}
const send = (B, m) => { try { B.ws.send(JSON.stringify(m)); } catch (e) { /* */ } };
const bye = (B) => { try { clearInterval(B.keep); B.ws.close(); } catch (e) { /* */ } };
const door = (v) => ({ x: v.cx * 32 + 16, y: v.cy * 32 + 16 });
const closing = (t) => /장부를 닫는 중/.test(t);

(async () => {
  log(`모드 ${MODE}/${CORNER} · 하루 ${DAYMS}ms · 마을 최대 ${E.VILLAGE_MAX || '(기본)'} · 길 고침 ${E.T1327_ROUTE_FIX === '0' ? '끔' : '켬'}`);
  const central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const upC = FB.waitUp(central, /central server up on/, { name: 'central' });
  const zenv = Object.assign({
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAYMS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1', ONB_ENABLE: '1', MEMBER_N: '3',
  }, E.T1489_ZENV ? JSON.parse(E.T1489_ZENV) : {});
  if (E.T1489_PROBE === '1') { zenv.NODE_OPTIONS = (E.T1489_PRE || '') ; zenv.T1489_OUT = path.join(OUT, 'p'); }
  const zone = boot('zone.js', zenv);
  const upZ = FB.waitUp(zone, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!(await upC).ok) { log('central 기동 실패'); process.exit(2); }
  if (!(await upZ).ok) { log('zone 기동 실패'); process.exit(2); }
  let info = null;
  for (let i = 0; i < 120 && !info; i++) { const j = await jget(`http://localhost:${ZPORT}/startinfo`); if (j && j.ok && j.villages && j.villages.length) info = j; else await sleep(2000); }
  if (!info) { log('마을 목록 없음'); process.exit(2); }
  const V = info.villages.map((v) => ({ vid: v.vid, name: v.name, cx: v.cx, cy: v.cy }));
  log(`존 떴다 · 마을 ${V.length}곳`);
  await sleep(3000);

  if (MODE === 'load') {
    const REPLY = { village_view: 'village_view', village_board: 'village_board', village_brief: 'village_brief' };
    const TYPES = ['village_view', 'village_board', 'village_brief', 'village_view'];
    const bots = [];
    for (let i = 0; i < BOTS; i++) { bots.push(await bot(`lb${i}`)); await sleep(150); }
    log(`봇 ${bots.filter((b) => b.welcome).length}/${BOTS} 들어옴`);
    bots.forEach((B, i) => { B.v = V[i % V.length]; const d = door(B.v); send(B, { type: 'teleport_debug', x: d.x, y: d.y }); });
    await sleep(2500);
    const t0 = now(), tEnd = t0 + SECS * 1000;
    let nReq = 0;
    const runBot = async (B, i) => {
      let k = 0;
      while (now() < tEnd && !B.closed) {
        const type = TYPES[(i + k++) % TYPES.length];
        const sent = now(); let reply = null, sawClose = false;
        const want = REPLY[type];
        const f = (m) => { if (m.type === want && reply == null) reply = now(); };
        const n0 = B.notices.length; B.listeners.push(f);
        send(B, { type, vid: B.v.vid });
        for (let w = 0; w < 600 && reply == null; w++) await sleep(10);
        B.listeners = B.listeners.filter((x) => x !== f);
        sawClose = B.notices.slice(n0).some((n) => closing(n.text));
        nReq++;
        put('load.jsonl', { k: 'req', bot: i, type, vid: B.v.vid, at: +(sent - t0).toFixed(1), ms: reply == null ? null : +(reply - sent).toFixed(1), closing: sawClose });
        await sleep(rnd(250, 650));
      }
    };
    const runPing = async (B, i) => {
      while (now() < tEnd && !B.closed) {
        const sent = now(); let got = null;
        const f = (m) => { if (m.type === 'pong' && got == null) got = now(); };
        B.listeners.push(f); send(B, { type: 'ping', t: Date.now() });
        for (let w = 0; w < 300 && got == null; w++) await sleep(10);
        B.listeners = B.listeners.filter((x) => x !== f);
        put('load.jsonl', { k: 'ping', bot: i, at: +(sent - t0).toFixed(1), ms: got == null ? null : +(got - sent).toFixed(1) });
        await sleep(250);
      }
    };
    await Promise.all([...bots.map((B, i) => runBot(B, i)), ...bots.map((B, i) => runPing(B, i))]);
    log(`load 끝 · 요청 ${nReq}`);
    bots.forEach(bye);
  } else {
    // ── corner ────────────────────────────────────────────────────────────────
    // 마을 쌍(anchor 거리 가장 가까운 둘 — adj)
    let pair = null;
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) { const d = Math.hypot((V[i].cx - V[j].cx) * 32, (V[i].cy - V[j].cy) * 32); if (!pair || d < pair.d) pair = { a: V[i], b: V[j], d }; }
    log(`가장 가까운 두 마을 ${pair.a.name}(${pair.a.vid}) · ${pair.b.name}(${pair.b.vid}) 거리 ${Math.round(pair.d)}px`);
    put('corner.jsonl', { k: 'pair', a: pair.a, b: pair.b, d: Math.round(pair.d) });
    const A = V[0] && CORNER === 'adj' ? pair.a : V[0], Bv = pair.b;
    // 클라가 하는 일: 순간 이동 뒤 가까운 마을(260px 안)에 brief 한 번(하루 한 번 — `evBriefedDay`) · 그 뒤 `/인출`
    const nearest = (x, y) => { let best = null, bd = 260; for (const v of V) { const d = door(v), dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = v; } } return best; };
    const settle = async (B, x, y, doBrief, tag) => {
      const tp = now(); send(B, { type: 'teleport_debug', x, y });
      const tb = rnd(100, 1000), tc = rnd(1400, 2000);
      let briefAt = null, v = nearest(x, y);
      if (doBrief && v) { await sleep(tb); send(B, { type: 'village_brief', vid: v.vid }); briefAt = now() - tp; await sleep(Math.max(0, tc - (now() - tp))); } else await sleep(tc);
      const n0 = B.notices.length; send(B, { type: 'chat', text: '/인출' });
      await sleep(1500);
      const ns = B.notices.slice(n0).map((n) => n.text);
      const far = ns.some((t) => /마을에서 너무 멉니다/.test(t));
      const chief = ns.some((t) => /사람이 열지 않습니다|촌장만|촌장/.test(t));
      return { tag, nearVid: v ? v.vid : null, briefAt: briefAt == null ? null : Math.round(briefAt), chatAt: Math.round(now() - tp - 1500), far, chief, red: far, notices: ns.slice(-3).map((t) => t.slice(0, 40)) };
    };
    for (let k = 0; k < TRIALS; k++) {
      let r;
      const B = await bot(`cb${k}`);
      if (!B.welcome) { put('corner.jsonl', { k: 'trial', trial: k, err: 'no welcome' }); bye(B); continue; }
      await sleep(rnd(500, 1500));
      if (CORNER === 'base') {
        const d = door(V[0]); r = await settle(B, d.x, d.y, true, 'base');
      } else if (CORNER === 'cross') {
        // 존을 막 넘어온 손님 = 새 몸 · 클라는 같은 날 이미 그 마을 brief 를 보냈다(`evBriefedDay` — 쪽은 그대로 · 몸만 새로). 하루가 짧은 하네스는 표시가 곧 풀리니
        //   변형 두 가지: sameday(표시 유지 = brief 안 다시 보냄 · 실서버 24분 하루의 꼴) · newday(표시가 풀려 brief 다시 감)
        const d = door(V[0]);
        send(B, { type: 'teleport_debug', x: d.x, y: d.y }); await sleep(900); send(B, { type: 'village_brief', vid: V[0].vid }); await sleep(900);   // 앞 몸에서 이미 인사함
        bye(B); await sleep(600);
        const B2 = await bot(`cc${k}`);   // 새 몸(존 넘김 · 다시 접속과 같은 서버 쪽 꼴)
        if (!B2.welcome) { put('corner.jsonl', { k: 'trial', trial: k, err: 'no welcome2' }); bye(B2); continue; }
        const same = k % 2 === 0;
        r = await settle(B2, d.x, d.y, !same, same ? 'sameday' : 'newday'); bye(B2);
        put('corner.jsonl', Object.assign({ k: 'trial', trial: k, corner: CORNER, arm: E.T1327_ROUTE_FIX === '0' ? 'off' : 'on' }, r)); continue;
      } else if (CORNER === 'adj') {
        const dA = door(pair.a);
        if (k % 2 === 1) {   // 먼저 곁 마을 B 앞에서 인사 · 그다음 A 문 앞으로 순간 이동(맞닿은 두 마을 사이를 오간 손님)
          const dB = door(pair.b); send(B, { type: 'teleport_debug', x: dB.x, y: dB.y }); await sleep(900); send(B, { type: 'village_brief', vid: pair.b.vid }); await sleep(900);
          r = await settle(B, dA.x, dA.y, true, 'adj-viaB');
        } else r = await settle(B, dA.x, dA.y, true, 'adj-direct');
        r.pairD = Math.round(pair.d);
      } else if (CORNER === 'private') {
        // 사유지: 곳간(마을 중심) 둘레에 개인 땅을 잡아 본다 — 재료를 주고 `claim`. 마을 문(영토 · 인정)이 막으면 막은 말을 적고, 가장 가까이 잡히는 자리(문에서 떨어진 거리)를 찾는다.
        const d = door(V[0]); send(B, { type: 'teleport_debug', x: d.x, y: d.y }); await sleep(800);
        send(B, { type: '__e2e_give', items: { wood: 400, stone: 400 } }); await sleep(300);
        let got = null, tried = [];
        for (const off of [0, 1, 2, 3, 4, 6, 8, 12]) {
          for (const sgn of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (off === 0 && sgn[0] !== 1) continue;
            const x = d.x + sgn[0] * off * 32, y = d.y + sgn[1] * off * 32;
            send(B, { type: 'teleport_debug', x, y }); await sleep(450);
            const n0 = B.notices.length; let added = false;
            const f = (m) => { if (m.type === 'claim_added') added = true; }; B.listeners.push(f);
            send(B, { type: 'claim', kind: 'personal' }); await sleep(700);
            B.listeners = B.listeners.filter((q) => q !== f);
            const ns = B.notices.slice(n0).map((n) => n.text);
            tried.push({ off, sgn: sgn.join(','), added, n: ns.slice(-1).map((t) => t.slice(0, 50)) });
            if (added) { got = { x, y, off }; break; }
          }
          if (got) break;
        }
        r = { tag: got ? 'claimed' : 'denied', claimAt: got, triedN: tried.length, tried: k === 0 ? tried : undefined };
        if (got) {   // 땅 위(곳간에서 got.off 칸 떨어진 곳)에 서서 클라가 하는 대로
          const rr = await settle(B, got.x, got.y, true, 'private'); r = Object.assign(r, rr);
        } else {
          // 가장 가까운 정직한 대용 — 땅을 못 잡았으니 곳간 문 앞에서(0px) 같은 일을 한다(기본 판과 같은 꼴 · 사유지 아님을 표시)
          const rr = await settle(B, d.x, d.y, true, 'denied-fallback-door'); r = Object.assign(r, rr);
        }
      }
      bye(B);
      put('corner.jsonl', Object.assign({ k: 'trial', trial: k, corner: CORNER, arm: E.T1327_ROUTE_FIX === '0' ? 'off' : 'on' }, r));
      await sleep(rnd(800, 2500));
    }
  }
  fs.writeFileSync(path.join(OUT, 'rig.done'), String(Date.now()));
  await sleep(1500);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
