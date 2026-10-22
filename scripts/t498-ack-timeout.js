#!/usr/bin/env node
// === scripts/t498-ack-timeout.js — 인계가 **실패한** 쪽의 저장(T498 ②의 나머지 반 · 러너 밖) ====================
//
// ★T498 팔을 켜면 떠나는 존은 central 저장을 기다리지 않고 **떠나는 순간의 행을 쥐고만** 있다가,
//   ACK 가 3초 안에 안 오면(클라가 도착 존에 끝내 안 붙음) 그 행을 보낸다 — 끔 판이 떠나기 **전에** 써 두던 그 행이다.
//   이 자는 그 길을 **실제로 밟는다**: 게스트(영속)에게 도구를 쥐여 경계를 넘기고, `handoff` 를 받으면 도착 존에 **안 붙는다**.
//   4초 뒤 central 행(`GET /player/:id` · 안 문 — 이 상자는 되돌이 주소라 통과)을 두 팔(끔/켬)이 **같게** 남기나 · 몸(도구)이 있나.
//   ⚠실측으로 안 것: 시한이 터지면 떠나는 존이 소켓을 닫고, 그 **닫힘 처리의 저장**(`last_zone` 은 떠나는 존)이 마지막에 내려앉는다 —
//     끔 판도 그렇다(떠나기 전 써 둔 `last_zone=nippon` 행을 그 저장이 덮는다). 그러니 판정은 "두 팔의 최종 행이 같다"다.
//   대조: 켬 판에서 ACK 전 행에는 아직 `last_zone` 이 도착 존이 아니다(기다리지 않았다는 증거 · 자명 통과 방지).
// ★★[T869 2026-10-22 · T867 회부 1] T843 · T867 뒤의 뜻으로 두 줄을 다시 적었다 — 출발 존은 시한에서 쥔 행을 **받는 존이 몸을 받았나**(`_t843Skip` 술어 하나)로 가른다:
//   (가) 받았다(준비 응답 OK — 토큰을 줬다) → 쥔 행을 **안 보낸다**(몸은 받는 존 것 · T823 켬 기본에선 시한이 늘 이 갈래) — 행은 시한 전 그대로(시한이 행을 안 쓴다).
//   (나) 못 받았다(받는 존이 준비를 못 받음 — 그 존이 없다 · ECONNREFUSED) → 넘기 실패(`_t564HandoffFail`) — 시한이 안 선다 · 몸은 출발 존에 남고
//       출발 존의 저장 문(닫힐 때 저장 · `savePlayer`)이 그 몸을 **보낸다**(행 = 출발 존 · 도구 2 · `last_seen` 이 앞으로).
//   자명 통과 금지: 같은 시한이 쥔 행을 **보내는** 판(T823 끔 `=0` — 술어가 거짓)을 하나 더 세워, (가)의 "안 보냈다"가 늘 참인 단언이 아님을 보인다.
//   "두 팔(끔 · 켬)의 최종 행이 같다"는 T867 이 자리 칸을 일부러 갈랐다(끔 = 넘기기 전 저장의 도착 존 입구 · 켬 = 넘기기 전 마지막 저장의 출발 존 — T867 §2 · §5 ①).
//   그래서 그 줄은 **몸 칸이 두 팔 같다**(도구 · 몸이 어느 팔에서도 안 샌다)로 적고, 켬 (가)의 행은 "시한 전과 비트 같다"(자리 · 몸 · `last_seen` 통째)로 더 세게 잰다. 자리 칸은 표로만 적는다.
// 실행: node scripts/t498-ack-timeout.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020, NPORT = 3021, EDGE_PAD = 400, LAT_STEP = 2048;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const procs = [];
function boot(file, env, log) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(log, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg); procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; };
process.on('exit', killAll);
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json());
async function waitHttp(u) { for (let i = 0; i < 300; i++) { try { if ((await fetch(u, { signal: AbortSignal.timeout(3000) })).ok) return true; } catch (e) {} await sleep(1000); } return false; }
function open(url, onMsg) {
  return new Promise((res, rej) => { const ws = new WebSocket(url); const st = { ws, welcome: null };
    ws.on('error', rej); ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome' && !st.welcome) { st.welcome = m; res(st); } if (onMsg) onMsg(m); }); });
}
// arm(on, opt) — opt.noRecv: 받는 존(nippon)을 안 띄운다(준비가 ECONNREFUSED → 넘기 실패 · 갈래 나) · opt.env: 두 존 모두에 더 줄 손잡이(T823 끔 대조)
async function arm(on, opt) {
  opt = opt || {};
  const DDIR = `/tmp/t498-ack-${on}${opt.tag || ''}`; fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  const env0 = Object.assign({ T498_HANDOFF_PAYLOAD: on ? '1' : '0' }, opt.env || {});
  boot('central.js', Object.assign({ PORT: String(CPORT), DB_PATH: `${DDIR}/c.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' }, env0), `${DDIR}/central.log`);
  await waitHttp(`http://localhost:${CPORT}/health`);
  const common = Object.assign({ CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' }, env0);
  boot('zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/h.db` }, common), `${DDIR}/hanbando.log`);
  if (!opt.noRecv) boot('zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/n.db` }, common), `${DDIR}/nippon.log`);
  await waitHttp(`http://localhost:${HPORT}/health`); if (!opt.noRecv) await waitHttp(`http://localhost:${NPORT}/health`);
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones, han = Z.hanbando;
  let handoff = null, handoffAt = 0;
  const a = await open(`${han.wsUrl}/?username=&name=ackT${on}&color=%23ffffff`, (m) => { if (m.type === 'handoff' && !handoff) { handoff = m; handoffAt = Date.now(); } });
  const pid = a.welcome.playerId || a.welcome.pid;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3 }, tools: ['axe', 'pickaxe'], quiet: true }));
  await sleep(900);
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  const hlogNow = () => { try { return fs.readFileSync(`${DDIR}/hanbando.log`, 'utf8'); } catch (e) { return ''; } };
  const failed = () => /✗ 넘기 실패 → nippon/.test(hlogNow());   // 갈래 나 — 받는 존이 준비를 못 받았다(출발 존 로그 한 줄 · `_t564HandoffFail`)
  for (let i = 0; i < 40 && !handoff && !(opt.noRecv && failed()); i++) { a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((3 + i) % 60) * LAT_STEP })); for (let k = 0; k < 16 && !handoff && !(opt.noRecv && failed()); k++) await sleep(500); }
  clearInterval(walk);
  const acct = a.welcome.playerId || (await jget(`http://localhost:${HPORT}/bodydbg`).then((o) => Object.keys((o && o.bodies) || {}).slice(-1)[0]).catch(() => null));
  const rowNow = async () => { try { return await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(acct)}`); } catch (e) { return null; } };
  const r0 = (handoff || opt.noRecv) ? await rowNow() : null;   // ACK 전(도착 존에 안 붙었다) · 갈래 나는 넘기 실패 순간
  let r1 = null;
  if (opt.noRecv) {
    //   갈래 나 — 몸은 출발 존에 남았다. 사람이 끊으면 출발 존의 닫힐 때 저장(`savePlayer` — 술어가 거짓이라 지난다)이 그 몸을 보낸다.
    await sleep(4200);                                      // 시한이 섰다면 터질 시간(안 서야 한다)
    try { a.ws.close(); } catch (e) {}
    await sleep(1500);
    r1 = await rowNow();
  } else {
    await sleep(4200);                                      // ACK 시한 3초 + 여유
    r1 = handoff ? await rowNow() : null;
  }
  const pick = (r) => { const p = r && (r.player || r); if (!p) return null; let tools = 0; try { tools = (JSON.parse(p.tools_json || '{}').toolItems || []).length; } catch (e) {} return { last_zone: p.last_zone || null, tools }; };
  const whole = (r) => { const p = r && (r.player || r); return p ? JSON.stringify(p) : null; };   // 행 통째(자리 · 몸 · `last_seen`)
  const seen = (r) => { const p = r && (r.player || r); return p ? Number(p.last_seen) || 0 : 0; };
  const hlog = fs.readFileSync(`${DDIR}/hanbando.log`, 'utf8');
  try { a.ws.close(); } catch (e) {}
  killAll(); await sleep(500);
  return { crossed: !!handoff, acct, before: pick(r0), after: pick(r1), sameWhole: !!whole(r0) && whole(r0) === whole(r1), seen0: seen(r0), seen1: seen(r1),
    timeoutLine: /ACK timeout/.test(hlog), heldLine: /\[T498\] ACK 없음 — 떠나는 순간의 행 저장/.test(hlog),
    keptLine: /\[T498 · T867\] ACK 없음 — 받는 존이 몸을 받은 판이라 쥔 행은 안 보낸다/.test(hlog), failLine: /✗ 넘기 실패 → nippon/.test(hlog) };
}
(async () => {
  console.log('\n=== T498 — 인계가 실패한 쪽의 저장(ACK 시한) ===');
  const off = await arm(false), on = await arm(true);
  const onX = await arm(true, { tag: 'x', env: { T823_FREEZE_SHELL: '0' } });   // 대조 — 술어가 거짓인 시한(T823 끔)
  const nr = await arm(true, { tag: 'n', noRecv: true });                        // 갈래 나 — 받는 존이 몸을 못 받았다
  for (const [tag, r] of [['끔', off], ['켬', on]]) {
    ok(r.crossed && r.timeoutLine, `[${tag}] ★[상황] 경계를 넘었고 도착 존에 안 붙어 ACK 시한이 터졌다`, `계정 ${r.acct}`);
    ok(r.after && r.after.tools === 2, `[${tag}] ★시한 뒤 central 행에 몸(도구 2)이 있다`, JSON.stringify(r.after));
  }
  ok(off.before && off.before.last_zone === 'nippon', '[끔] ACK 전에 이미 행이 써져 있다(떠나기 전 await 저장)', JSON.stringify(off.before));
  ok(on.before && on.before.last_zone !== 'nippon', '[켬] ★ACK 전 행은 아직 옛 행이다(= 기다리지 않았다 · 자명 통과 방지)', JSON.stringify(on.before));
  //   ★[T869] ⓐ "쥔 행을 시한에서 보냈다" → T843 · T867 뒤의 뜻 두 갈래(가 · 나) + 대조
  ok(on.keptLine && !on.heldLine && on.sameWhole,
    '[켬 · (가) 받는 존이 몸을 받았다] ★★시한이 쥔 행을 **안 보냈다** — 로그 "쥔 행은 안 보낸다" · "떠나는 순간의 행 저장" 0 · 시한 뒤 행 = 시한 전 행(자리 · 몸 · `last_seen` 통째 비트 같음)',
    `안보냄 ${on.keptLine} · 보냄 ${on.heldLine} · 행 같음 ${on.sameWhole} · ${JSON.stringify(on.before)} → ${JSON.stringify(on.after)}`);
  ok(nr.failLine && !nr.crossed && !nr.timeoutLine && !nr.heldLine && !nr.keptLine && nr.after && nr.after.last_zone === 'hanbando' && nr.after.tools === 2 && nr.seen1 > nr.seen0,
    '[켬 · (나) 받는 존이 몸을 못 받았다] ★★넘기 실패 · 시한이 안 선다 · 몸은 출발 존에 남아 그 존의 저장 문이 **보낸다** — 행 hanbando · 도구 2 · `last_seen` 이 앞으로',
    `실패 ${nr.failLine} · handoff ${nr.crossed} · 시한 ${nr.timeoutLine} · ${JSON.stringify(nr.before)} → ${JSON.stringify(nr.after)} · last_seen +${nr.seen1 - nr.seen0}ms`);
  ok(onX.crossed && onX.timeoutLine && onX.heldLine && !onX.keptLine && !onX.sameWhole,
    '[켬 · T823 끔 대조] ★자명 통과 금지 — 술어가 거짓인 시한은 쥔 행을 **보낸다**(같은 줄이 실제로 갈린다 · 시한 뒤 행이 바뀐다)', `보냄 ${onX.heldLine} · 안보냄 ${onX.keptLine} · 행 같음 ${onX.sameWhole} · ${JSON.stringify(onX.before)} → ${JSON.stringify(onX.after)}`);
  //   ★[T869] ⓑ "두 팔의 최종 행이 같다" → 몸 칸이 두 팔 같다(자리 칸은 T867 이 갈랐다 — 표로만)
  ok(off.after && on.after && off.after.tools === on.after.tools, '★두 팔(끔 · 켬)의 최종 행 **몸**이 같다(도구 수) — 자리는 T867 이 갈랐다(아래 줄)', `${JSON.stringify(off.after)} · ${JSON.stringify(on.after)}`);
  console.log(`    (표) 최종 행 자리 — 끔 ${off.after && off.after.last_zone} · 켬(가) ${on.after && on.after.last_zone} · 켬 T823 끔 ${onX.after && onX.after.last_zone} · 켬(나) ${nr.after && nr.after.last_zone}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); killAll(); process.exit(1); });
