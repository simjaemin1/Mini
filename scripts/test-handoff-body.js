#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-handoff-body.js — 존을 넘어도 **몸이 새지 않는다** ================
//
// ★왜 [재민 확정 2026-09-01 · T47 · 최우선]
//   재민의 부하 실측이 잡았다(`KNOWN_ISSUES.md` N.6): 존 경계를 넘으면 **도구가 영구히 사라진다.**
//   28회 왕복 전부 재현. 스칼라 인벤은 온전한데 `toolItems`·kg원장이 없어지고, 재접속해도 안 돌아온다.
//   원인은 필드 하나가 아니라 **복원 코드가 두 벌**이었다는 것이다 —
//   일반 접속은 central 행에서 13가지를 복원하는데, 핸드오프 도착은 페이로드만 읽었고 거기엔 12가 없었다.
//
// ★★그래서 이 하네스가 지키는 것은 "도구가 있다"가 아니라 **"직렬화가 한 함수다"** 이다.
//   필드를 세는 검사는 새 필드가 생기면 조용히 늙는다. 구조를 지켜야 다음 필드도 자동으로 지켜진다.
//     ① 소스 검사 — 저장·핸드오프·복원이 전부 `serializeBody`/`parseBody` 를 쓴다
//     ② 왕복 후 몸이 **비트 동일**(`/bodydbg` 가 `serializeBody` 그 자체를 내준다 — 사본 금지)
//     ③ **행 폴백 픽스처** — 페이로드에 몸을 일부러 안 실어(`E2E_HANDOFF_NO_BODY=1`) central 행
//        경로를 실제로 밟는다. 밟아 보지 않은 폴백은 "있다고 적혀만 있는 코드"다.
//     ④ 재접속 후에도 같다 — 도착 존이 빈 몸으로 계정을 덮지 않는다(N.6 의 '영구 소실' 부분)
//   ★[T868 2026-10-22] 승격 경로(`promote_to_primary` — 실제 클라의 보통 넘기)도 **몸 전부**를 잇는다(손잡이 `T868_PROMOTE_BODY` · '1' 만 켬) —
//     ① 글자: 두 갈래(토큰 · 승격)가 같은 몸 한 자리(`_handoffBody`)를 부르나 + 미끼(몸 잇는 줄 없는 승격 갈래 = 스칼라만 쓰는 사본)가 문다 ·
//     ⑦ P 켬 = 승격으로 넘은 몸 · 클라 끊긴 판 행 · 다시 접속이 넘기 전과 비트 같다 · Q 끔 = 도구 2 → 0 → 행 0(종전 결함 증인).
//   ★[T778 2026-10-18] 순간 로트 켬 기본 — 로트의 정산 칸 `e·t` 는 흐른 시간만큼 자라므로 ⓑ(이어졌나)로 옮겼다 ·
//     `d·k·n·m·w` 는 ⓐ(비트 동일) 그대로 · 끔 탐침(`T732_MOMENT_LOT=0`) 한 판이 로트 통째 비트 동일(종전 단언)을 잰다.
//   ★[T823 → T831 2026-10-21] 떠난 몸 껍데기 얼림 **켬 기본**(되돌림 `T823_FREEZE_SHELL=0` — 끔 탐침 E · G) · ⑤ 닫힐 때 저장 자리 경합 —
//     ACK 를 잃게 해(출발 존에만 안 문 비밀) 껍데기의 늦은 저장이 도착 존 접속 저장 **뒤에** 닿게 순서를 강제하고, central 행과 로비 `/auth` 를 읽는다(F 켬 · G 끔).
//   ★[T843 2026-10-22] 받는 존이 몸을 받은 뒤의 껍데기 저장은 **몸 칸도** 안 쓴다(통째로 안 나감) — F 켬 = 행 몸 · 자리 · `last_seen` 그대로(되돌림 0) ·
//     G 끔 = 종전대로 되돌아감(증인) · I 켬 = 받는 존이 몸을 안 받은 판(준비 응답 전 — 받는 존을 세워 둔다)은 종전대로 나간다(갈래 둘).
//   ★[T867 2026-10-22] ⑥ T498 켬(`T498_HANDOFF_PAYLOAD=1` · 끔 기본)에서 같은 탐침 — ACK 시한에 떠나는 순간 쥔 행도 T843 술어를 지난다(J 켬 = 안 나감 ·
//     몸 되돌림 0) · K(T823 끔 `=0`) = 종전대로 쥔 행 · 닫힐 때 저장이 몸 칸을 되돌린다(증인).
//   ★[T890 2026-10-23] ⑦ 승계 갈래 — 같은 존 산 몸 승계(`_takeover`)도 몸 칸 한 벌(`serializeBody` → `parseBody` → `_bodyInto` · 손잡이 `T890_TAKEOVER_BODY` 켬 기본) —
//     R 켬 = 저장본보다 새로운 산 몸(제작이력 · 어획 · 신체 · HP)이 승계 · 행까지 이어진다 · S 끔(`=0`) = 저장본으로 되돌아감(종전 결함 증인).
//   ★[T916 2026-10-24] ⑧ central 이 내려간 동안 로그아웃 — 못 닿은 저장을 존 줄에 남겨 다시 보낸다(손잡이 `T916_SAVE_RETRY` 켬 기본) ·
//     U 켬 = 다시 붙은 몸 · 행이 central 이 없던 동안의 몸을 잇는다 · V 끔(`=0`) = 사라진다(T894 회부 1 증인).
//   ★[T927 2026-10-25] ⑨ 몸 버전 조건부 쓰기(손잡이 `T927_BODY_VER` 켬 기본) — 존은 저장마다 몸 버전을 올려 싣고 central 은 행보다 작은 버전을 안 쓴다(`bodyVerTrip`) ·
//     ⚠끔 증인 넷(T868 Q · T831/T843 G · H · T867 K)은 `T927_BODY_VER=0` 판에서 돈다 — 켬이면 central 이 그 늦은 옛 저장을 먼저 거절해 그 손잡이의 결함이 안 보인다
//     (T927 켬 판 실측: 넷 다 행이 안 되돌아갔다 — 증인이 그 손잡이 하나만 재게 판을 가른다 · 단언 글자 무변).
//   ★상황 선행 assert: 왕복이 **실제로 존 경계를 넘었는지**(handoff 메시지를 받았는지) 먼저 본다.
//     안 넘었으면 이 하네스는 아무것도 재고 있지 않다.
//
// ★2존이 필요하다 — hanbando 동쪽 끝(480000)과 nippon 서쪽 끝이 실좌표로 맞닿아 있다.
//   출발 존에만 `E2E_GIVE=1` 을 준다: 도착 존에서 보이는 물건은 **핸드오프가 옮긴 것**이다.
//   (도착 존도 `/bodydbg` 를 쓰려면 게이트가 필요해 `E2E_GIVE=1` 을 주되 지급은 출발에서만 한다.)
//
// 실행: node scripts/test-handoff-body.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020, NPORT = 3021;
const EDGE_PAD = 400, LAT_STEP = 2048;
const DDIR = '/tmp/t47-2zone';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ★로그를 버리지 않는다 — 존이 조용히 죽으면 `waitHttp` 가 5분을 기다리다 "기동 실패"만 말한다.
  //   그 5분을 무엇 때문인지 모르는 채 보내지 않으려고 파일로 남긴다(하네스 신뢰가 먼저).
  const lg = fs.createWriteStream(`/tmp/t47-${env.ZONE_ID || 'central'}-${env.PORT}.log`, { flags: 'w' });
  p.stdout.pipe(lg); p.stderr.pipe(lg);
  p._zid = env.ZONE_ID || 'central';   // ★[T843] I 판이 받는 존 하나만 세웠다 푼다(SIGSTOP · SIGCONT)
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
async function waitHttp(u, n = 300) { for (let i = 0; i < n; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json());

function open(url, onMsg) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    const st = { ws, welcome: null, tools: null, inv: null };
    ws.on('error', rej);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'welcome') { st.welcome = m; st.tools = m.toolItems; st.inv = m.inventory; res(st); }
      if (m.type === 'tools') st.tools = m.toolItems;
      if (m.type === 'inventory') { st.inv = m.inventory; st.ledger = m.ledger; st.lots = m.lots; }
      if (onMsg) onMsg(m, st);
    });
  });
}

// ★몸을 두 갈래로 나눠 잰다 — 성질이 다르기 때문이다.
//   ⓐ **내구**: 도구·장비·슬롯·숙련·제작이력·원석장부·어획·kg원장·로트. 시간이 안 바꾼다 ⇒ **비트 동일**이어야 한다.
//   ⓑ **연속 상태**: 추위·피로·부상. 매 틱 변한다 ⇒ 왕복 몇 초 사이에 값이 같을 수 없다.
//      여기서 물을 것은 "같은가"가 아니라 **"이어졌는가"** — 0 으로 리셋되지 않았는가다.
//      (그 둘을 한 잣대로 재면 통과하든 실패하든 뜻이 없다.)
// ★★[T778 2026-10-18 · 순간 로트 켬 기본] **로트도 같은 잣대로 두 칸으로 가른다.**
//   켬 세계의 로트 레코드는 `{d, k, n, e, t, m, w}` 다 — `d·k·n·m·w`(얻은 날 · 얻은 순간 · 개수 · 자리)는 시간이 안 바꾼다 ⇒ ⓐ 내구(비트 동일).
//   `e·t`(정산된 노출 · 마지막 정산 순간)는 **정산할 때마다 흐른 시간만큼 자란다** ⇒ ⓑ 연속 상태 — "같은가"가 아니라 "이어졌는가"(아래 `lotsFlow`).
//   (T732 보고 §5-3 실측: 넘기는 동안 늙어 `e` 만 0.000312 → 0.009871 · `k·n·d` 비트 같음 — 둘을 한 잣대로 재면 켬 세계에선 뜻이 없다.)
//   끔(`T732_MOMENT_LOT=0` · 날 로트)은 같은 날엔 정산이 안 일어나 `e·t` 까지 비트 같다 — 맨 끝 끔 탐침 한 판이 그 종전 단언(`lots` 통째)을 그대로 잰다.
const LOT_DURABLE = ['d', 'k', 'n', 'm', 'w', 'coalesced'];
const lotsKey = (L) => {
  if (!L) return null;
  const o = {};
  for (const [it, arr] of Object.entries(L)) o[it] = (arr || []).map((l) => { const r = {}; for (const f of LOT_DURABLE) if (l && l[f] !== undefined) r[f] = l[f]; return r; });
  return o;
};
const durableKey = (b, fullLots) => b ? JSON.stringify({
  toolItems: (b.toolItems || []).map((t) => `${t.type}/${t.d}/${t.max}`).sort(),
  equipment: (b.equipment || []).map((e) => `${e.type}/${e.q}`).sort(),
  equipSlots: b.equipSlots || {}, craftSkill: b.craftSkill || {}, craftLog: b.craftLog || {},
  oreLedger: b.oreLedger || {}, oreCarry: b.oreCarry || {}, fishStats: b.fishStats || null,
  kgLedger: b.kgLedger || null, lots: fullLots ? (b.lots || null) : lotsKey(b.lots),   // ★[T778] 정산 칸 `e·t` 는 ⓑ 로(끔 탐침만 통째)
  member: b.member || null,   // ★[T11] 마을 소속 — 시간이 안 바꾼다 ⇒ 내구 쪽이다
}) : '(없음)';
// ★[T778] ⓑ 로트 정산 칸이 **이어졌나** — 같은 레코드마다(같은 품목 · 같은 순서 — 내구 쪽 비트 같음이 그 짝을 이미 보증한다)
//   `t` 가 거꾸로 안 가고 · `e` 가 그 사이 흐른 시간(`Δt` 게임 날) × **제품 속도 클램프**(`Spoil.EXP.R_MIN` ~ `R_MAX` × 자리 seal `m`) 안에서만 자랐다.
//   새 수 0: 클램프는 제품이 하루치 노출을 자르는 그 값(`rateAtC`)이고 ε 는 제품이 `e` 를 적는 자리(`toFixed(6)`) 하나다.
//   깨지는 꼴: 0 으로 리셋(B6 "로트 잃음 → 쓸개 오늘") = 아래쪽 · 옛 꼴로 읽혀 그 날 0시부터 다시 늙음 = 위쪽 · 정산 순간이 뒤로 감 = `t`.
const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
const lotsFlow = (a, b) => {
  const A = (a && a.lots) || {}, B = (b && b.lots) || {};
  const bad = []; let n = 0, deMax = 0;
  for (const it of Object.keys(A)) {
    const xa = A[it] || [], xb = B[it] || [];
    for (let i = 0; i < xa.length; i++) {
      const p = xa[i], q = xb[i];
      if (!p || !q) { bad.push(`${it}[${i}] 짝 없음`); continue; }
      n++;
      const dt = (+q.t || 0) - (+p.t || 0), de = (+q.e || 0) - (+p.e || 0), m = Number.isFinite(+p.m) ? +p.m : 1;
      const lo = Spoil.EXP.R_MIN * m * dt - 1e-6, hi = Spoil.EXP.R_MAX * m * dt + 1e-6;
      deMax = Math.max(deMax, de);
      if (!(dt >= 0) || !(de >= lo && de <= hi)) bad.push(`${it}[${i}] t ${p.t}→${q.t} · e ${p.e}→${q.e} (Δe 허용 ${lo.toExponential(2)}~${hi.toExponential(2)})`);
    }
  }
  return { n, bad, deMax };
};
// ★[T11] 존을 넘겨 볼 소속 픽스처. `serializeBody` 가 그대로 싣고 `parseBody` 가 그대로 돌려줘야 한다.
const MEMBER_FIX = { zone: 'hanbando', vid: 7, name: '검사마을', since: 33, wdDay: 33, wdUsed: 2 };
const softOf = (b) => (b && b.body) ? { cold: +(b.body.cold || 0), fatigue: +(b.body.fatigue || 0), injury: +(b.body.injury || 0) } : null;
const softNear = (x, y, tol) => !!x && !!y && Math.abs(x.cold - y.cold) <= tol && Math.abs(x.fatigue - y.fatigue) <= tol && Math.abs(x.injury - y.injury) <= tol;

async function startZones(extraH, extraBoth) {   // ★[T778] extraBoth = 두 존 모두(끔 탐침의 손잡이)
  fs.mkdirSync(DDIR, { recursive: true });
  for (const f of fs.readdirSync(DDIR)) { try { fs.unlinkSync(path.join(DDIR, f)); } catch (e) {} }
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답은 증인이 아니다 — 앞 판 central 이 포트를 쥔 채면 새 central 은 `EADDRINUSE` 로 즉시
  //   죽는데 그 폴링은 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다(T344 가 두 번 재현).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다 — `await` 만 아래로 내린다(표식은 ~120ms 뒤에 찍힌다).
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _up = await _upP;
  if (!_up.ok) { console.log(`  ★${_up.why}`); return false; }
  const common = Object.assign({ CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' }, extraBoth || {});
  const _zone = boot('zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1' }, common, extraH || {}));
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const _zone2 = boot('zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/w-nip.db`, E2E_GIVE: '1' }, common));
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp2 = FB.waitUp(_zone2, /zone server up on/, { name: 'zone', capMs: 300000 });
  return (await (await _zp).ok) && (await (await _zp2).ok);
}

// 동쪽 끝으로 옮겨 동쪽으로 걷는다 — 넘기(`handoff`) 메시지가 올 때까지. ★[T831] 종전 roundTrip 몸통을 그대로 옮겼다(roundTrip · closeRace 공용 ·
//   roundTrip 은 종전 값 그대로 — 500ms 씩 32번 · closeRace 만 100ms 로 잘게 본다: 넘기 메시지 뒤 ACK 시한 3초 안에 도착 존에 붙어야 한다).
async function crossEast(a, han, crossed, pollMs = 500) {
  const waitNotice = () => new Promise((r) => {
    const h = (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      // ★[T78 2026-09-03] 접두 이모지가 아니라 **`kind`** 로 가린다 — 알림 경계(`server/notice.js`)가
      //   이모지를 걷고 종류를 필드로 옮겼다(T71 ⓑ 판정). 이 검사의 뜻(텔레포트 성공 vs 물 위 거절)은 그대로다.
      //   ⚠종전 코드는 `startsWith('🌀')` 이라 **영영 안 맞고 멈췄다**(이 promise 엔 시한이 없다).
      if (m.type === 'notice' && (m.kind === 'info' || m.kind === 'fishing')
          && /텔레포트|물/.test(String(m.text))) { a.ws.off('message', h); r(/텔레포트/.test(String(m.text))); } };
    a.ws.on('message', h);
  });
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  for (let i = 0; i < 60 && !crossed(); i++) {
    const pr = waitNotice();
    a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((3 + i) % 60) * LAT_STEP }));
    if (!await pr) continue;
    for (let k = 0; k < Math.round(16000 / pollMs) && !crossed(); k++) await sleep(pollMs);
  }
  clearInterval(walk);
}

// ★★[T831 2026-10-21] 닫힐 때 저장 자리 경합 — **순서 강제 탐침**(T823 회부 3).
//   ACK 를 일부러 잃게 한다: 출발 존(hanbando)에만 안 문 비밀(`CENTRAL_SECRET`)을 준다 → 도착 존(nippon · 비밀 없음)이 보내는 `/handoff_ack` 은
//   헤더가 없어 출발 존 안 문이 거절한다(T245 회부의 그 꼴 — 호스트가 갈렸는데 비밀이 한쪽에만 · 넘기 준비는 받는 쪽이 사설 주소로 받아 그대로 선다).
//   그러면 출발 존은 ACK 시한(3초)에 스스로 껍데기 소켓을 닫고, 그 `close` 저장은 도착 존 접속 저장보다 **3초 늦게** 나간다 — 순서가 시간으로 강제된다(우연 0).
//   클라(이 하네스)는 출발 소켓을 안 닫고 토큰으로 도착 존에 바로 붙는다(넘기 규약 그대로). 사람은 **등록 계정**이다 — 로비가 `/auth` 의 `last_zone` 으로
//   자동 라우팅하는 것이 등록 계정이다(`public/client/30-n-net.js` · 다시 접속 = 그 존 · 그 존이면 그 자리 `last_x · last_y`).
//   도착 존은 주기 저장을 멀리(`SAVE_INTERVAL_MS` — 이미 있는 손잡이 · 10분) 둬 행 두 읽음 사이에 도착 존 쓰기가 안 끼게 하고, 출발 존은 1초로 당겨
//   껍데기의 주기 저장 문도 같은 창에서 열리게 한다(켬 판은 그 문까지 막았나 · 끔 판에선 정보로 센다).
//   도착 존에서 생선 한 마리를 내려놓는다(행동 저장 하나 — 몸 칸이 늦은 껍데기 저장에 되돌아가나를 **정보로** 센다 · 이 카드는 자리 칸만).
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
async function closeRace(tag, opt) {   // ★[T867] opt.rowAtMsg = 넘기 메시지 때(도착 존에 붙기 전) 행을 한 번 읽는다 — T498 켬이 먹었나(넘기기 전 저장 없음)
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones;
  const han = Z.hanbando, nip = Z.nippon;
  const NAME = 't831' + tag, PW = 'pw831' + tag;
  let handoffMsg = null, tMsg = 0, aClosedAt = 0;
  const a = await open(`${han.wsUrl}/?username=${NAME}&password=${PW}&color=%23ffffff`, (m) => { if (m.type === 'handoff' && !handoffMsg) { handoffMsg = m; tMsg = Date.now(); } });
  a.ws.on('close', () => { if (!aClosedAt) aClosedAt = Date.now(); });
  const pid = (a.welcome || {}).playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: {}, tools: [], kgs: { fish: [2.0, 0.4, 1.1] }, quiet: true }));
  await sleep(900);
  await crossEast(a, han, () => !!handoffMsg, 100);
  if (!handoffMsg) { try { a.ws.close(); } catch (e) {} return { crossed: false, pid }; }
  const r0 = (opt && opt.rowAtMsg) ? await rowOf(pid) : null;
  const b = await open(`${nip.wsUrl}/?handoff_token=${encodeURIComponent(handoffMsg.token)}`);
  const tJ = Date.now();
  try { b.ws.send(JSON.stringify({ type: 'drop_item', item: 'fish', amount: 1 })); } catch (e) {}
  await sleep(Math.max(0, tMsg + 1800 - Date.now()));
  const r1 = await rowOf(pid), aOpenAtR1 = !aClosedAt, tR1 = Date.now();
  for (let i = 0; i < 80 && !aClosedAt; i++) await sleep(100);   // 출발 존 ACK 시한(3초)이 껍데기 소켓을 닫는다
  await sleep(1200);   // 그 `close` 저장이 central 에 닿을 시간
  const r2 = await rowOf(pid);
  let auth = null;
  try { auth = await (await fetch(`http://localhost:${CPORT}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: NAME, password: PW }), signal: AbortSignal.timeout(5000) })).json(); } catch (e) {}
  const live = pick0(await jget(`http://localhost:${NPORT}/bodydbg?name=${encodeURIComponent(NAME)}`));
  try { b.ws.close(); } catch (e) {}
  try { a.ws.close(); } catch (e) {}
  return { crossed: true, pid, tMsg, tJ, tR1, r0, r1, aOpenAtR1, aClosedAt, r2, auth, live, hanW: han.zoneWidth, joined: !!b.welcome };
}
const pick0 = (o) => { const v = Object.values((o && o.bodies) || {}); return v[v.length - 1]; };
// ★★[T843 2026-10-22] 갈래 (나) 탐침 — 받는 존이 몸을 **안** 받은 판(넘기기 준비 응답 전)에 껍데기 소켓이 닫힌다. 받는 존 프로세스를 세워 둔다(SIGSTOP):
//   출발 존의 `/handoff_prepare` 는 커널 대기열에 받혀 답이 없고(최대 5초 · `postJSON` 시한) · 그 사이 출발 존은 넘기기 전 저장(`last_zone: nippon` · 입구)을
//   이미 보냈다(T47 — 끔 T498 판 · 준비 앞에서 기다린다). 그 행이 central 에 보이면 출발 소켓을 닫는다 → 닫힐 때 저장 = (나) 갈래. 다 읽은 뒤 SIGCONT.
async function prepRace(tag) {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones;
  const han = Z.hanbando;
  const NAME = 't843' + tag, PW = 'pw843' + tag;
  const a = await open(`${han.wsUrl}/?username=${NAME}&password=${PW}&color=%23ffffff`);
  const pid = (a.welcome || {}).playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: {}, tools: [], kgs: { fish: [2.0, 0.4, 1.1] }, quiet: true }));
  await sleep(900);
  const nip = procs.find((p) => p._zid === 'nippon');
  let stopped = false;
  try { process.kill(nip.pid, 'SIGSTOP'); stopped = true; } catch (e) {}
  let pre = null, polling = true;
  const poll = (async () => { while (polling && !pre) { try { const r = await rowOf(pid); if (r && r.last_zone === 'nippon') pre = r; } catch (e) {} await sleep(100); } })();
  try {
    await crossEast(a, han, () => !!pre, 100);
    polling = false; await poll;
    if (!pre) { try { a.ws.close(); } catch (e) {} return { crossed: false, pid, stopped }; }
    const tPre = Date.now();
    try { a.ws.close(); } catch (e) {}
    const tClose = Date.now();
    await sleep(1500);
    const r1 = await rowOf(pid);
    return { crossed: true, pid, stopped, pre, r1, tPre, tClose };
  } finally {
    polling = false;
    try { process.kill(nip.pid, 'SIGCONT'); } catch (e) {}
  }
}

// 한 판: 지급 → 경계 넘기 → 도착 → 재접속. 몸 셋(출발·도착·재접속)을 돌려준다.
async function roundTrip(tag, opt) {   // ★[T823] opt.probe = 넘긴 뒤 떠난 몸 껍데기를 두 번 읽고 그 사이 사람 문(내려놓기) 하나를 보낸다
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones;
  const han = Z.hanbando, nip = Z.nippon;
  // ⚠접속 URL 의 `name=` 은 서버가 안 읽는다(이름은 계정 행에서 온다) — 그래서 **사람 플레이어 하나**를
  //   집는다. 존마다 이 하네스의 소켓 하나뿐이라 모호하지 않다.
  const pick = (o) => { const v = Object.values((o && o.bodies) || {}); return v[v.length - 1]; };
  const NAME = 'bodyT' + tag;
  let handoffMsg = null;
  const a = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff`, (m) => { if (m.type === 'handoff') handoffMsg = m; });
  const guestToken = a.welcome.guestToken;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3, thatch: 7 }, tools: ['axe', 'pickaxe'],
                             kgs: { fish: [2.0, 0.4, 1.1] }, quiet: true }));
  // ★[T11] 마을 소속을 앉힌다 — 존을 넘어 **소속이 사는가**를 이 왕복이 같이 잰다.
  //   (이 하네스는 `ENABLE_VILLAGES=0` 이라 정상 경로로는 못 얻는다. 판정은 `test-membership` 이 잰다.)
  a.ws.send(JSON.stringify({ type: '__e2e_body', member: MEMBER_FIX, quiet: true }));
  await sleep(900);
  const before = pick(await jget(`http://localhost:${HPORT}/bodydbg`));

  // ★★생명값·신체를 **걷는 내내 다시 세운다.** 왜: HP 는 초당 회복하고 추위는 계속 움직인다 —
  //   출발 때 한 번 깎아 두면 경계에 닿을 무렵엔 이미 풀피라 "이어졌나"를 못 잰다(첫 판이 그랬다: 42→51→100).
  //   ⇒ 넘는 순간의 값을 알고 있어야 도착값과 비교할 수 있다.
  const SET_HP = 42, SET_COLD = 0.8;
  const poke = setInterval(() => { try { a.ws.send(JSON.stringify({ type: '__e2e_body', hp: SET_HP, cold: SET_COLD, quiet: true })); } catch (e) {} }, 400);
  await crossEast(a, han, () => !!handoffMsg);   // ★[T831] 걷기 몸통은 `crossEast` 로 옮겼다(바이트 같은 차례 · closeRace 와 공용)
  clearInterval(poke);
  if (!handoffMsg) return { crossed: false };
  // ★넘는 순간의 몸(출발 존은 ACK 까지 몸을 들고 있다) — 생명값·신체 비교의 기준점이다.
  const beforeCross = pick(await jget(`http://localhost:${HPORT}/bodydbg`));
  // ★[T823] 껍데기 탐침 — 넘긴 뒤(ACK 전 · 출발 존이 껍데기를 3초까지 들고 있다) 사람 문 하나(생선 한 마리 내려놓기)를 보내고
  //   600ms 뒤 껍데기를 다시 읽는다. 켬이면 두 읽음이 **비트 같다**(회복 · 게이지 · 입력이 다 언다) · 끔이면 회복이 오르고 생선이 땅으로 간다
  //   (도착 몸엔 그 생선이 그대로 있다 — 복제). 끔 판이 바뀌어야 켬 판의 "같다"가 뜻이 있다(자명 통과 금지).
  let probe = null;
  if (opt && opt.probe) {
    try { a.ws.send(JSON.stringify({ type: 'drop_item', item: 'fish', amount: 1 })); } catch (e) {}
    await sleep(600);
    probe = { s0: beforeCross, s1: pick(await jget(`http://localhost:${HPORT}/bodydbg`)) };
  }
  const tX = Date.now();   // ★[T751] 넘는 순간 몸을 읽은 때 — ② HP 허용치가 이 사이 실제 걸린 시간에서 나온다
  try { a.ws.close(); } catch (e) {}
  const b = await open(`${nip.wsUrl}/?handoff_token=${encodeURIComponent(handoffMsg.token)}`);
  const hpW = ((b.welcome || {}).self || {}).hp;   // ★[T802] 도착 존이 받은 HP = 넘긴 몸의 HP(페이로드 스냅숏 · welcome 은 몸을 세운 그 자리에서 나간다 — 도착 존의 첫 회복 틱 전)
  await sleep(900);
  const after = pick(await jget(`http://localhost:${NPORT}/bodydbg`));
  const tA = Date.now();   // ★[T751] 도착한 몸을 읽은 때
  await sleep(1500);   // 도착 존이 savePlayer 를 돌릴 시간
  try { b.ws.close(); } catch (e) {}
  await sleep(900);
  const c = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff${guestToken ? '&guest_token=' + encodeURIComponent(guestToken) : ''}`);
  await sleep(900);
  const again = pick(await jget(`http://localhost:${HPORT}/bodydbg`));
  try { c.ws.close(); } catch (e) {}
  return { crossed: true, before, beforeCross, after, again, welcomeTools: b.tools, SET_HP, SET_COLD, crossMs: tA - tX, hpW, probe };
}

// ★★[T868 2026-10-22] 승격 경로 한 판 — 실제 클라의 보통 넘기(`30-n-net.js` "promote existing observer ws"): 넘기 전에 도착 존 **관측 소켓**을
//   미리 열고 넘기 메시지의 토큰으로 그 소켓을 `promote_to_primary` 로 올린다. 몸의 칸마다 빈 칸이 아닌 값을 앉힌다(도구 둘 · 장비 둘(지게 · 옷 —
//   입는다 → 슬롯 둘) · kg 원장 · 소속 · 숙련 · 제작이력 · 원석장부 · 이월 · 어획 — `__e2e_give` · `__e2e_body`) — 빈 칸끼리 같음은 자명 통과다.
//   읽음: 출발 몸 · 넘는 순간 껍데기 · 승격 welcome(받은 HP · 도구) · 도착 몸 · 클라가 승격 소켓을 닫은 뒤 central 행의 몸(도착 존 닫힐 때 저장) · 다시 접속한 몸.
function openObs(url, onMsg) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const st = { ws };
    ws.on('error', rej); ws.on('open', () => res(st));
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (onMsg) onMsg(m, st); });
  });
}
const LEDGER_FIX = { craftSkill: { toolmaking: 7, mining: 3 }, craftLog: { carrier: { n: 1, q: 5 } }, oreLedger: { iron: 1.25 }, oreCarry: { iron: 0.05 }, fishStats: { caught: 4, maxKg: 2.0, lostMaxKg: 1.5 } };
async function promoteTrip(tag) {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones;
  const han = Z.hanbando, nip = Z.nippon;
  const NAME = 'bodyP' + tag;   // ⚠게스트 이름은 URL `name=` 을 안 읽는다(roundTrip 주석) — 몸은 존마다 이 하네스의 사람 하나라 이름 없이 집는다
  let handoffMsg = null, promoted = null;
  const a = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff`, (m) => { if (m.type === 'handoff') handoffMsg = m; });
  const guestToken = a.welcome.guestToken, pid = a.welcome.playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3, thatch: 7 }, tools: ['axe', 'pickaxe'], kgs: { fish: [2.0, 0.4, 1.1] },
                             equip: [{ type: 'carrier', lvl: 5 }, { type: 'clothes', lvl: 3 }], quiet: true }));
  a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', member: MEMBER_FIX, quiet: true }, LEDGER_FIX)));
  await sleep(900);
  const before = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));
  const o = await openObs(`${nip.wsUrl}/?observer=1&vx=200&vy=${nip.zoneHeight / 2 | 0}`, (m) => { if (m.type === 'welcome' && m.promoted && !promoted) promoted = m; });
  const SET_HP = 42, SET_COLD = 0.8;   // 넘는 순간 생명값 · 추위를 알고 있어야 이어졌나를 잰다(roundTrip 과 같은 뜻)
  const poke = setInterval(() => { try { a.ws.send(JSON.stringify({ type: '__e2e_body', hp: SET_HP, cold: SET_COLD, quiet: true })); } catch (e) {} }, 400);
  await crossEast(a, han, () => !!handoffMsg);
  clearInterval(poke);
  if (!handoffMsg) { try { a.ws.close(); o.ws.close(); } catch (e) {} return { crossed: false }; }
  const beforeCross = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));   // 넘는 순간 껍데기(켬 기본 — 언다)
  o.ws.send(JSON.stringify({ type: 'promote_to_primary', token: handoffMsg.token }));
  for (let i = 0; i < 60 && !promoted; i++) await sleep(50);
  try { a.ws.close(); } catch (e) {}   // 클라는 옛 주 소켓을 관측으로 내린다 — 이 판은 닫는다(출발 존 껍데기는 ACK 가 이미 내렸다)
  await sleep(900);
  const after = pick0(await jget(`http://localhost:${NPORT}/bodydbg`));
  await sleep(1500);
  try { o.ws.close(); } catch (e) {}   // 클라 끊김 — 도착 존의 닫힐 때 저장이 이 몸을 central 행에 쓴다(그 행이 다음 접속의 몸이다)
  await sleep(1200);
  const row = await rowOf(pid);
  let rowBody = null; try { rowBody = JSON.parse((row && row.tools_json) || 'null'); } catch (e) {}
  const c = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff${guestToken ? '&guest_token=' + encodeURIComponent(guestToken) : ''}`);
  await sleep(900);
  const again = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));
  try { c.ws.close(); } catch (e) {}
  return { crossed: true, promoted: !!promoted, before, beforeCross, after, rowBody, again, SET_COLD,
           hpW: ((promoted || {}).self || {}).hp, welcomeTools: (promoted || {}).toolItems || [] };
}

// ★★[T890] ⑦ 승계 갈래 — 같은 존 산 몸 승계(`_takeover`: 같은 신원으로 새 소켓 · 옛 세션이 아직 이 존에 서 있다 — 클라 `ensurePrimaryConnection` 의 close→connect).
//   산 몸에만 값을 세우고(`__e2e_body` — 저장 안 함 · 족보 ㊻) 옛 소켓을 연 채 같은 손님 토큰으로 붙는다 → 새 몸이 산 몸을 잇나 · 새 소켓이 닫힌 뒤 행은.
//   ★상황 선행: 행이 그 값을 **아직 안 가졌다**(가졌으면 이 판은 아무것도 안 잰다 — 그 사이 주기 저장이 끼면 다시 · 최대 3번).
const TK_LEDGER = ['craftSkill', 'craftLog', 'oreLedger', 'oreCarry', 'fishStats', 'member'];
const TK_SOFT = { cold: 0.8, fatigue: 0.6, injury: 0.4, morale: 0.3 }, TK_HP = 42, TK_TOL = 0.05;
const tkSoft = (b) => (b && b.body) ? { cold: +(b.body.cold || 0), fatigue: +(b.body.fatigue || 0), injury: +(b.body.injury || 0), morale: +(b.body.morale || 0) } : null;
const tkNear = (x, y) => !!x && !!y && ['cold', 'fatigue', 'injury', 'morale'].every((k) => Math.abs(x[k] - y[k]) <= TK_TOL);
const tkJ = (x) => JSON.stringify(x === undefined ? null : x);
async function takeoverTrip(tag) {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones; const han = Z.hanbando;
  let last = null;
  for (let k = 0; k < 3; k++) {
    const NAME = `tk${tag}${k}`;
    let kicked = false;
    const a = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff`, (m) => { if (m.type === 'kicked') kicked = true; });
    const tok = a.welcome.guestToken, pid = a.welcome.playerId;
    a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3 }, tools: ['axe', 'pickaxe'], equip: [{ type: 'carrier', lvl: 5 }], quiet: true }));   // 저장한다(행 = 도구)
    await sleep(900);
    a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', hp: TK_HP, quiet: true, member: MEMBER_FIX }, TK_SOFT, LEDGER_FIX)));   // 저장 안 한다(산 몸만)
    await sleep(700);
    const live = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));
    let row0 = null; try { row0 = JSON.parse(((await rowOf(pid)) || {}).tools_json || 'null'); } catch (e) {}
    const stale = TK_LEDGER.every((f) => tkJ((row0 || {})[f]) !== tkJ(live[f])) && !tkNear(tkSoft(row0), tkSoft(live)) && !(row0 && row0.vital && row0.vital.hp === live.vital.hp);
    const b = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff&guest_token=${encodeURIComponent(tok)}`);
    await sleep(900);
    const dbg = await jget(`http://localhost:${HPORT}/bodydbg`);
    const after = pick0(dbg), nPeople = Object.keys(dbg.bodies || {}).length;
    try { b.ws.close(); } catch (e) {}
    try { a.ws.close(); } catch (e) {}
    await sleep(1500);
    let row1 = null; try { row1 = JSON.parse(((await rowOf(pid)) || {}).tools_json || 'null'); } catch (e) {}
    last = { stale, tries: k + 1, kicked, samePid: b.welcome.playerId === pid, nPeople, live, after, row0, row1 };
    if (stale) break;
  }
  return last;
}
const tkLost = (T, B) => TK_LEDGER.filter((f) => tkJ((B || {})[f]) !== tkJ((T.live || {})[f]));
// ★★[T916] ⑧ central 이 내려간 동안 로그아웃(T894 회부 1 — 영구 소실 길) — 저장 다시 보내기(손잡이 `T916_SAVE_RETRY` 켬 기본).
//   central 을 내린 뒤 산 몸만 바꾸고(`__e2e_body` · 저장 안 함) 끊는다 → 닫힐 때 저장이 central 에 못 닿는다 → central 을 다시 띄운다 →
//   같은 손님 토큰으로 다시 붙는다. 다시 붙기 **전** 행 = 내리기 전 몸(줄이 아직 존에 있다 — 상황 선행 · 자명 통과 0).
async function centralBounce(down) {
  if (down) { const c = procs.find((x) => x._zid === 'central'); if (c) { await new Promise((r) => { if (c.exitCode !== null) return r(); c.once('exit', r); try { c.kill('SIGTERM'); } catch (e) { r(); } }); procs.splice(procs.indexOf(c), 1); } return true; }
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  return (await FB.waitUp(c, /central server up on/, { name: 'central' })).ok;
}
//   ★★[T1002 2026-10-30] **상황 선행이 안 서면 다시 — 최대 3번**(⑦ `takeoverTrip` 과 같은 꼴 · 판정 무변).
//   central 이 다시 뜬 뒤 이 하네스가 행을 읽기(뜬 뒤 500ms 잠 + 읽기 = 0.51~0.54초) 전에 존의 주기 다시 보내기(`_t916Flush` —
//   `SAVE_INTERVAL_MS` 마다 · 제품의 정당한 길)가 먼저 닿으면 행이 이미 새 몸이라 이 판은 "다시 붙을 때 보낸다"를 못 잰다 —
//   종전엔 그 판의 ★[상황] · ★★다시 붙은 몸 · ★★끊은 뒤 행 세 줄이 **잃은 칸 0** 인 채 같이 빨개졌다(진단 — 주기를 1초로 당긴 20번 중 3번 ·
//   기본 30초 80번 0번 · 보고/T1002). 그때는 새 사람으로 처음부터 다시 선다. 세 번 다 안 서면 ★[상황]이 시도 수와 함께 빨개진다(조용한 초록 0).
async function saveRetryTrip(tag) {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones; const han = Z.hanbando;
  let last = null;
  for (let k = 0; k < 3; k++) {
    const NAME = `sr${tag}${k}`;
    const a = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff`);
    const tok = a.welcome.guestToken, pid = a.welcome.playerId;
    a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3 }, tools: ['axe', 'pickaxe'], equip: [{ type: 'carrier', lvl: 5 }], quiet: true }));   // 저장한다(행 = 도구)
    await sleep(900);
    await centralBounce(true); await sleep(500);
    a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', hp: TK_HP, quiet: true, member: MEMBER_FIX }, TK_SOFT, LEDGER_FIX)));   // central 이 없는 동안 산 몸만 바꾼다
    await sleep(700);
    const live = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));
    try { a.ws.close(); } catch (e) {}
    await sleep(1500);   // 닫힐 때 저장 — central 이 없다(ECONNREFUSED)
    const up = await centralBounce(false); await sleep(500);
    let row0 = null; try { row0 = JSON.parse(((await rowOf(pid)) || {}).tools_json || 'null'); } catch (e) {}
    const stale = TK_LEDGER.every((f) => tkJ((row0 || {})[f]) !== tkJ(live[f])) && !tkNear(tkSoft(row0), tkSoft(live)) && !(row0 && row0.vital && row0.vital.hp === live.vital.hp);
    const b = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff&guest_token=${encodeURIComponent(tok)}`);
    await sleep(900);
    const after = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));
    try { b.ws.close(); } catch (e) {}
    await sleep(1500);
    let row1 = null; try { row1 = JSON.parse(((await rowOf(pid)) || {}).tools_json || 'null'); } catch (e) {}
    last = { up, stale, tries: k + 1, samePid: b.welcome.playerId === pid, live, after, row0, row1 };
    if (stale) break;
  }
  return last;
}
// ★★[T927] ⑨ 몸 버전 조건부 쓰기 — 존은 저장마다 몸 버전(`sv`)을 하나 올려 싣고 · central 은 행보다 작은 몸 버전의 저장을 안 쓴다(`stale`).
//   손님 하나 저장(지급) → 행의 몸 버전을 읽는다(0 이 아니다 — 존이 실었다 · 상황 선행) → 이 하네스가 central 에 **옛 버전**(행 − 1) · 다른 몸(생선 0) ·
//   다른 짐(나무 999)으로 직접 쓴다 → 안 쓰여야 한다(행 그대로). 같은 버전 · 같은 몸 칸으로 쓰면 쓰인다(종전대로 — 같으면 쓴다). 끊으면 존의 닫힐 때 저장이
//   그 위 차례로 쓰인다(존이 이 하네스 쓰기에 막히지 않는다). 넘긴 판(A)의 도착 몸 버전 ≥ 넘는 순간 몸 버전(도착 존이 출발 존 차례 위에서 센다)은 본문이 잰다.
async function bodyVerTrip() {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones; const han = Z.hanbando;
  const a = await open(`${han.wsUrl}/?username=&name=sv927&color=%23ffffff`);
  const pid = a.welcome.playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3 }, tools: ['axe'], kgs: { fish: [2.0, 0.4] }, quiet: true }));   // 저장한다
  await sleep(1200);
  const post = async (body) => { try { return await (await fetch(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })).json(); } catch (e) { return { err: e.message }; } };
  const r0 = await rowOf(pid); let b0 = null; try { b0 = JSON.parse(r0.tools_json); } catch (e) {}
  const sv0 = b0 && b0.sv;
  const old = Object.assign({}, b0, { sv: (+sv0 || 0) - 1, kgLedger: null });
  const resOld = await post({ tools_json: JSON.stringify(old), wood: 999 });
  const r1 = await rowOf(pid);
  const resEq = await post({ tools_json: r0.tools_json, wood: 7 });
  const r2 = await rowOf(pid);
  try { a.ws.close(); } catch (e) {}
  await sleep(1500);
  const r3 = await rowOf(pid); let b3 = null; try { b3 = JSON.parse(r3.tools_json); } catch (e) {}
  return { sv0, resOld, resEq, r0, r1, r2, r3, sv3: b3 && b3.sv };
}

(async () => {
  console.log('\n=== 존 핸드오프 — 몸이 새지 않는다 (2존 실서버) ===');

  // ① 소스 검사 — 직렬화가 한 함수인가(필드 세기가 아니라 구조를 지킨다)
  const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/tools_json: JSON\.stringify\(serializeBody\(player\)\)/.test(src), '① 저장이 `serializeBody` 를 쓴다');
  ok(/body: E2E_HANDOFF_NO_BODY \? undefined : serializeBody\(player\)/.test(src), '① 핸드오프 페이로드가 **같은 함수**를 쓴다');
  ok((src.match(/parseBody\(/g) || []).length >= 3, '① 복원이 `parseBody` 한 곳에서 온다(정의 + 접속 + 핸드오프)', `${(src.match(/parseBody\(/g) || []).length}회`);
  ok(!/tools_json: JSON\.stringify\(\{/.test(src), '① 저장 경로에 **손으로 쓴 두 번째 직렬화가 없다**');
  // ★★[T868] 두 갈래(토큰 · 승격)가 같은 몸 한 자리(`_handoffBody` — 출처 순서 페이로드 → central 행 · 복원 `parseBody`)를 부르나.
  //   승격 갈래 글자를 떼어 본다. 미끼 = 같은 갈래에서 몸 잇는 두 줄만 뺀 사본(스칼라만 쓰는 승격 — main 의 그 꼴) — 그 사본에 검사가 물어야 검사가 뜻이 있다.
  const cutSrc = (s, a, b) => { const i = s.indexOf(a); if (i < 0) return ''; const j = s.indexOf(b, i + a.length); return s.slice(i, j > i ? j : s.length); };
  const promoteOf = (s) => cutSrc(s, "msg.type === 'promote_to_primary' && msg.token && pendingHandoffs.has(msg.token)", '\nfunction attachObserverHandlers');
  const tokenOf = (s) => cutSrc(s, 'if (handoffToken && pendingHandoffs.has(handoffToken)) {', '// source zone에 ACK 전송');
  const sameBody = (s) => /_handoffBody\(pending, pending\.player_id\)/.test(promoteOf(s)) && /_bodyInto\(player, _t868hb\.B, /.test(promoteOf(s))
    && /_handoffBody\(pending, playerId\)/.test(tokenOf(s)) && !/parseBody\(/.test(tokenOf(s))
    && /function _handoffBody\(pending, playerId\) \{\s*const done = \(raw, src\) => \(\{ B: parseBody\(raw \|\| \{\}, \{ vitals: true \}\), src \}\);\s*if \(pending\.body\) return done\(pending\.body, 'payload'\);\s*return central\.getPlayer\(playerId\)/.test(s);
  ok(sameBody(src) && (src.match(/process\.env\.T868_PROMOTE_BODY/g) || []).length === 1 && /const T868_PROMOTE_BODY = process\.env\.T868_PROMOTE_BODY !== '0';/.test(src),
    '① ★★[T868] 두 갈래(토큰 · 승격)가 같은 몸 한 자리(`_handoffBody` — 페이로드 → central 행 · `parseBody`)를 부른다 · 손잡이 한 자리(`!== \'0\'` · 켬 기본)');
  const decoyPromote = promoteOf(src).replace(/_handoffBody\(pending, pending\.player_id\)/g, 'null').replace(/^.*_bodyInto\(player, _t868hb\.B, .*$/m, '');
  const decoySrc = src.replace(promoteOf(src), decoyPromote);
  ok(promoteOf(src).length > 2000 && decoySrc !== src && !sameBody(decoySrc) && /equipment: \[\], equipSlots: \{\}, craftSkill: \{\}/.test(decoyPromote),
    '① ★[T868] 미끼 — 몸 잇는 두 줄을 뺀 승격 갈래(스칼라만 쓰는 사본 · main 의 그 꼴)에는 위 검사가 문다(자명 통과 0)', `승격 갈래 ${promoteOf(src).length}자`);
  // ★[T802] ② HP 기준점(`beforeCross` = 떠난 존의 껍데기)이 **찍힌 값**이려면 걷는 내내 hp 를 세우는 픽스처(`poke`)가 찍은 뒤 껍데기에 쓰면 안 된다.
  //   종전엔 썼다 — 400 ms 마다 오는 한 번이 찍은 뒤 닿으면 껍데기만 42 로 내려가 기준이 찍힌 값보다 3~4 낮았다(T802 · 단독 세 판 빨강).
  //   이 하네스가 그 문을 같이 지킨다(문이 풀리면 ② 가 다시 위상에 따라 깜빡인다).
  ok(/msg\.type === '__e2e_body'\) \{[\s\S]{0,1600}?if \(player\.handingOff\) return;/.test(src), '① ★[T802] 픽스처가 떠난 몸(껍데기)에는 안 쓴다 — ② 기준점 = 찍힌 값');
  // ★[T823] 손잡이 한 자리('1' 만 켬) · 네 걸음(입력 · 게이지 · 회복 · 게이지 전송) + 행동(낚시)이 이미 있는 칸 `handingOff` 를 거른다
  const T823G = '\\(T823_FREEZE_SHELL && (?:p|player)\\.handingOff\\) return;';
  ok((src.match(/process\.env\.T823_FREEZE_SHELL/g) || []).length === 1 && /const T823_FREEZE_SHELL = process\.env\.T823_FREEZE_SHELL !== '0';/.test(src)
    && new RegExp('function handlePlayerInput\\(player, raw\\) \\{\\s*if ' + T823G).test(src)
    && new RegExp('function _gaugeStep\\(p\\) \\{\\s*if ' + T823G).test(src)
    && new RegExp('function _hpRegenStep\\(p, act\\) \\{\\s*if ' + T823G).test(src)
    && new RegExp('function _gaugeNetStep\\(p\\) \\{\\s*if ' + T823G).test(src)
    && new RegExp('function _fishPollOne\\(p, now\\) \\{[^\\n]*\\n[^\\n]*\\n\\s*if ' + T823G).test(src),
    "① ★[T823 · T831 켬 기본] 손잡이 한 자리(`!== '0'` — 되돌림 `=0`) · 떠난 몸 껍데기를 입력 · 게이지 · 회복 · 게이지 전송 · 낚시 걸음이 거른다(이미 있는 칸 `handingOff`)");
  // ★[T831] 껍데기의 저장은 이 존의 자리 칸을 안 쓴다 — 한 자리(`savePlayer`)에서 · 켬 갈래 · 이미 있는 칸 `handingOff` · 다른 존을 가리키는 쓰기(넘기기 전 저장)는 통과
  ok(/function savePlayer\(player, extra = \{\}\) \{\s*if \(!canPersist\(player\)\) return;[\s\S]{0,3000}?\n\s*const pt = _savePatch\(player, extra\);[\s\S]{0,2000}?\n\s*if \(T823_FREEZE_SHELL && player\.handingOff && \(pt\.last_zone == null \|\| pt\.last_zone === ZONE_ID\)\) \{ delete pt\.last_zone; delete pt\.last_x; delete pt\.last_y; \}\s*return _saveSend\(player\.playerId, pt\);\s*\}/.test(src),
    '① ★[T831] 넘긴 몸 껍데기의 저장(닫힐 때 · 주기 · 종료 flush · 맨 저장)은 이 존의 자리 칸(`last_zone · last_x · last_y`)을 안 쓴다 — `savePlayer` 한 자리 · 켬 갈래');
  // ★[T843] 받는 존이 몸을 받은 뒤(ACK 기다림 표에 이 몸 · 또는 ACK · ACK 시한이 이미 `players` 에서 내림)의 껍데기 저장은 통째로 안 나간다 — `savePlayer` 머리 한 줄 · 이미 있는 칸만
  ok(/function savePlayer\(player, extra = \{\}\) \{\s*if \(!canPersist\(player\)\) return;[\s\S]{0,3000}?\n\s*if \(_t843Skip\(player\)\) return;[^\n]*\n\s*const pt = _savePatch\(player, extra\);/.test(src)
    && /function _t843Handed\(p\) \{\s*if \(players\.get\(p\.pid\) !== p\) return true;\s*for \(const e of outgoingHandoffs\.values\(\)\) if \(e\.pid === p\.pid\) return true;\s*return false;\s*\}/.test(src)
    && /function _t843Skip\(p\) \{ return T823_FREEZE_SHELL && !!p\.handingOff && _t843Handed\(p\); \}/.test(src),
    '① ★[T843] 받는 존이 몸을 받은 뒤의 껍데기 저장은 몸 칸도 안 쓴다(통째로 안 나감) — `savePlayer` 머리 · 갈래 판단은 이미 있는 칸 둘(`outgoingHandoffs` · `players`)');
  // ★[T867] T498 ACK 시한의 쥔 행도 같은 술어(`_t843Skip` — 사본 0)를 지난다 · 그 줄 하나만 `_saveSend` 를 직접 부른다(술어 안 지나는 몸 쓰기 0)
  ok(/if \(_t498Held && !_t843Skip\(player\)\) \{ _saveSend\(_t498Held\.playerId, _t498Held\.patch\);/.test(src)
    && (src.match(/_saveSend\(_t498Held\./g) || []).length === 1 && (src.match(/_t843Skip\(/g) || []).length === 3,
    '① ★[T867] T498 ACK 시한의 쥔 행도 T843 술어 한 자리(`_t843Skip`)를 지난다 — 부르는 곳 둘(`savePlayer` 머리 · 시한) · 정의 하나');

  if (!await startZones()) { console.log('  ✗ 2존 기동 실패'); process.exit(1); }
  const R = await roundTrip('A');
  ok(R.crossed, '★[상황] 왕복이 실제로 존 경계를 넘었다(아니면 아래는 아무것도 안 잰다)');
  if (!R.crossed) { console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`); process.exit(1); }

  ok(!!R.before && ((R.before || {}).toolItems || []).length === 2, '★[상황] 출발 몸에 잴 것이 실제로 있다(도구 2 · kg원장 3)',
    `도구 ${(R.before.toolItems || []).length} · kg ${JSON.stringify((R.before.kgLedger || {}).fish || (R.before.kgLedger || {})).slice(0, 40)}`);
  ok(durableKey(R.before) !== '(없음)' && JSON.stringify(R.before.kgLedger || {}) !== '{}', '★[상황] kg 원장이 비어 있지 않다');
  // ★[T11] 상황 assert — 소속이 실제로 출발 몸에 앉았나(0 이면 아래 왕복 검사가 자명 통과다)
  ok(!!(R.before && R.before.member && R.before.member.vid === MEMBER_FIX.vid),
    '★[상황·T11] 출발 몸에 마을 소속이 앉아 있다', JSON.stringify((R.before || {}).member));
  // ★[T778] 상황 assert — 로트가 실제로 있고 **얻은 순간 `k`** 가 앉았다(켬 기본 · 없으면 아래 정산 칸 줄이 자명 통과다)
  const recsB = Object.values((R.before || {}).lots || {}).flat();
  ok(recsB.length > 0 && recsB.every((l) => Number.isFinite(l.k)),
    '★[상황·T778] 출발 몸에 로트가 있고 얻은 순간 `k` 가 앉았다(순간 로트 켬 기본)', `${recsB.length}개 · ${JSON.stringify(recsB[0] || null)}`);

  // ② 왕복 후 — 내구는 비트 동일, 연속 상태는 이어진다
  const dEq = durableKey(R.after) === durableKey(R.before);
  ok(dEq, '② ★★도착한 몸의 **내구 부분이 비트 동일**(도구·장비·숙련·원장·로트 `d·k·n·m·w`)',
    dEq ? '' : `\n      출발 ${durableKey(R.before)}\n      도착 ${durableKey(R.after)}`);
  const fA = lotsFlow(R.before, R.after);
  ok(fA.n > 0 && !fA.bad.length, '② ★[T778] 로트 정산 칸(`e·t`)이 존을 넘어 **이어진다** — 흐른 시간만큼만 늙었다(제품 속도 클램프 안 · 0 으로 안 튄다)',
    `${fA.n}개 · Δe 최대 ${fA.deMax.toFixed(6)}${fA.bad.length ? ' · ' + fA.bad.join(' | ') : ''}`);
  //   ★기준점은 **넘는 순간의 몸**(`beforeCross`)이다 — 출발 때 값이 아니라. 추위는 계속 움직인다.
  ok((softOf(R.beforeCross) || {}).cold >= R.SET_COLD - 0.05, `★[상황] 넘는 순간 추위를 ${R.SET_COLD} 로 세워 뒀다(0 이면 자명 통과)`,
    `${JSON.stringify(softOf(R.beforeCross))}`);
  ok(softNear(softOf(R.after), softOf(R.beforeCross), 0.15), '② 신체 상태(추위·피로·부상)가 **이어진다**(0 으로 안 튄다)',
    `${JSON.stringify(softOf(R.beforeCross))} → ${JSON.stringify(softOf(R.after))}`);
  ok((R.welcomeTools || []).length === 2, '② welcome 도 도구를 싣고 온다(화면이 아는가)', `${(R.welcomeTools || []).length}개`);
  // ★[T11] 위 ②의 `durableKey` 가 이미 소속을 포함하지만, **깨졌을 때 이름이 나오게** 한 줄 따로 둔다
  //   (합산 비교만 있으면 "무엇이 샜는지"를 안 말해 준다 — N.6 이 그렇게 오래 안 잡혔다).
  ok(JSON.stringify((R.after || {}).member) === JSON.stringify(MEMBER_FIX),
    '② ★[T11] 마을 소속이 존을 넘어 그대로 온다', JSON.stringify((R.after || {}).member));
  // ★생명값 — 존을 넘는 것은 **한 접속의 연속**이다. 여기서 풀피가 되면 그건 결함이다.
  //   (같은 존 안에서는 `_takeover` 가 이미 HP 를 잇고 있었다 — 존을 넘을 때만 회복되던 게 이상했다.)
  const hpX = ((R.beforeCross || {}).vital || {}).hp, hpA = ((R.after || {}).vital || {}).hp;
  ok(hpX < 90, '★[상황] 넘는 순간 HP 가 깎여 있다(100 이면 회복인지 보존인지 못 가른다)', `${hpX}`);
  // ★[T751] 허용치 = 그 사이 **실제로 걸린 시간** × 제품의 자연 회복률(+1 반올림) — 종전 고정 12 는 "넘는 데 1.2초"에 건 수였다.
  //   도착 존은 몸을 받자마자 초당 ~10HP 로 아문다(피해 1초 뒤 · `_hpRegenStep`) — 넘는 시간이 상자마다 다르다
  //   (야간 상자 6밤 내내 43 → 56 = +13 · 이 상자 +12 안 · 같은 main). 뜻("이어진다 · 풀피로 안 튄다")은 그대로 —
  //   풀피로 튀면(43 → 100) 허용치(넘는 시간 1~2초면 11~21)를 한참 넘어 여전히 빨강이다(아래 ②b 가 그 수를 같이 찍는다).
  const zsrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8');
  const rg = zsrc.match(/setHp\(p, p\.hp \+ (\d+) \* dt \* (\d+) \* _rm, 'regen'\)/);
  const REGEN_PS = rg ? +rg[1] * +rg[2] : NaN;   // 초당 회복(만복 기준) — 제품 식 그대로
  const hpTol = REGEN_PS * (R.crossMs || 0) / 1000 + 1;
  ok(Number.isFinite(REGEN_PS) && REGEN_PS > 0, '②a 자연 회복률을 제품 식에서 읽었다(`setHp(p, p.hp + 2 * dt * 5 * _rm, \'regen\')`)', `${REGEN_PS}/초`);
  ok(hpA >= hpX - 1 && hpA - hpX <= hpTol, '② ★★HP 가 존을 넘어 **이어진다**(풀피로 안 튄다)',
    `${hpX} → ${hpA} · 넘는 시간 ${R.crossMs}ms × ${REGEN_PS}/초 + 1 = 허용 ${hpTol.toFixed(1)}`);
  ok(hpA < 100 || hpX + hpTol >= 100, '②b ★풀피(100)가 아니다 — 허용치가 100 에 닿지 않는 한', `${hpA}`);
  // ★★[T802] 넘긴 몫과 회복 몫을 **따로** 잰다(느슨하게 0). 위 ② 한 줄은 둘을 한 창에 섞는다 — 넘는 순간 읽은 몸(`beforeCross`)과
  //   도착한 몸 사이에 (가) 넘긴 HP(페이로드 스냅숏 — 떠나는 존이 `serializeBody` 한 그 순간) (나) 도착 존의 자연 회복이 있다.
  //   T778(T732 켬 기본) 뒤로 도착 존의 몸은 **페이로드**다(`/handoff_prepare` 가 켬에서만 몸을 쥔다 · 끔 판은 central 행 폴백 —
  //   떠난 껍데기의 마지막 저장이라 넘긴 뒤 껍데기 변화도 실렸다). 그래서 넘긴 뒤 껍데기를 하네스가 고치면(종전 검사 문 — 위 ① T802 줄)
  //   그 몫은 도착 존에 안 가고, "넘는 순간의 몸"만 낮아져 ②가 넘기 전 정당한 회복(마지막 세움 뒤 ~380ms · +4)을 도착의 덤으로 셌다.
  //   ⇒ (가) 도착 존이 받은 HP(welcome · 첫 회복 틱 전)는 넘는 순간 읽은 몸보다 클 수 없다 — 떠난 껍데기는 넘긴 뒤 회복만 한다.
  //     크면 그건 도착에서 생긴 HP 다(풀피로 튐 · 덤). 그리고 세운 값(SET_HP)보다 작을 수 없다(이 하네스엔 피해가 없다).
  //   ⇒ (나) 도착 존에서 오른 몫(받은 HP → 도착 몸)은 넘는 순간 뒤 흐른 시간 × 제품의 자연 회복률 + 1(반올림 · 위 ② 와 같은 자) 안.
  //     창의 머리는 `tX`(떠나는 존의 몸을 읽고 소켓을 닫은 때)다 — 도착 존은 클라가 그 뒤에 붙어야 몸을 세운다. welcome 이 닿은 때는
  //     머리가 못 된다: 도착 존은 몸을 세운 뒤 수백 ms 막혔다가(접속 처리) 밀린 틱이 그 시간만큼 회복을 몰아 준다(dt 합 = 흐른 시간 · 실측).
  const hpW = R.hpW;
  ok(Number.isFinite(hpW), '★[상황·T802] 도착 존이 받은 HP 를 읽었다(welcome — 도착 존의 첫 회복 틱 전)', `${hpW}`);
  ok(hpW <= hpX + 1e-6 && hpW >= R.SET_HP - 1e-6, '② ★★[T802] 넘긴 몫 — 도착 존이 받은 HP 가 넘는 순간의 몸을 안 넘는다(도착에서 생긴 HP 0 · 깎인 HP 0)',
    `세운 ${R.SET_HP} ≤ 받은 ${hpW} ≤ 넘는 순간 ${hpX}`);
  ok(hpA - hpW >= -1e-6 && hpA - hpW <= hpTol, '② ★★[T802] 회복 몫 — 도착 존에서 오른 HP 가 넘는 순간 뒤 흐른 시간 × 자연 회복률 안(넘긴 몫을 뺀 자리에서)',
    `${hpW} → ${hpA} · ${R.crossMs}ms × ${REGEN_PS}/초 + 1 = 허용 ${hpTol.toFixed(1)}`);
  // ★★[T43 2026-09-02 재민 확정 · §12] **뒤집었다.** 이 줄은 종전 *"재접속은 여전히 풀피다 —
  //   정책 무변(T8 소관)"* 이었고, 그 T8 소관이 T43 이다. §12: *"로그아웃 ≠ 부활."*
  //   ⇒ 재접속도 이제 **HP 를 잇는다**(`_acceptConnection` 의 `parseBody(.., {vitals:true})`).
  //     쓰러진 채 나갔으면 쓰러진 채 들어온다 — 죽음의 대가가 창을 닫는 것으로 사라지지 않는다.
  //   ★자명 통과 금지: 넘는 순간 HP 가 이미 깎여 있다(위 `hpX < 90`)는 것을 앞에서 확인했으므로
  //     "100 이 아니다"는 진짜로 **보존**을 뜻한다.
  const hpAgain = ((R.again || {}).vital || {}).hp;
  ok(hpAgain !== undefined && hpAgain < 100, '④ ★★재접속도 **풀피가 아니다** — 로그아웃이 부활이 아니다(T43 · §12)', `${hpAgain}`);

  // ④ 재접속 후에도 같다 — 도착 존이 빈 몸으로 계정을 덮지 않는다
  const aEq = durableKey(R.again) === durableKey(R.before);
  ok(aEq, '④ ★★재접속한 몸의 내구 부분도 **비트 동일**(영구 소실이 없다)',
    aEq ? '' : `\n      출발   ${durableKey(R.before)}\n      재접속 ${durableKey(R.again)}`);
  const fR = lotsFlow(R.before, R.again);
  ok(fR.n > 0 && !fR.bad.length, '④ ★[T778] 재접속한 몸의 로트 정산 칸도 **이어진다**(흐른 시간만큼만 · 0 으로 안 튄다)',
    `${fR.n}개 · Δe 최대 ${fR.deMax.toFixed(6)}${fR.bad.length ? ' · ' + fR.bad.join(' | ') : ''}`);
  ok(JSON.stringify((R.again || {}).member) === JSON.stringify(MEMBER_FIX),
    '④ ★[T11] 재접속해도 마을 소속이 그대로다', JSON.stringify((R.again || {}).member));

  killAll(); await sleep(4000);

  // ③ 행 폴백 픽스처 — 페이로드에 몸을 일부러 안 싣는다(옛 존 시늉)
  if (!await startZones({ E2E_HANDOFF_NO_BODY: '1' })) { console.log('  ✗ 픽스처 기동 실패'); process.exit(1); }
  const F = await roundTrip('B');
  ok(F.crossed, '③ [픽스처] 왕복이 경계를 넘었다');
  if (F.crossed) {
    const fEq = durableKey(F.after) === durableKey(F.before);
    ok(fEq, '③ ★★몸 없는 페이로드에서도 **central 행 폴백**이 몸을 살린다',
      fEq ? '' : `\n      출발 ${durableKey(F.before)}\n      도착 ${durableKey(F.after)}`);
    ok(durableKey(F.again) === durableKey(F.before), '③ [픽스처] 재접속도 동일');
    const fF = lotsFlow(F.before, F.after);
    ok(fF.n > 0 && !fF.bad.length, '③ ★[T778] [픽스처] central 행 폴백도 로트 정산 칸을 **잇는다**(흐른 시간만큼만)',
      `${fF.n}개 · Δe 최대 ${fF.deMax.toFixed(6)}${fF.bad.length ? ' · ' + fF.bad.join(' | ') : ''}`);
  }
  killAll(); await sleep(4000);

  // ★[T778] 끔 탐침 '0' 한 판 — 두 존 모두 `T732_MOMENT_LOT=0`(날 로트 · 되돌림 손잡이).
  //   끔 세계는 같은 날 안에서 정산이 안 일어나므로 **종전 단언 그대로**(로트 통째 · `e·t` 까지) 비트 동일이어야 하고,
  //   레코드에 얻은 순간 `k` 가 없어야 한다(손잡이가 먹었다). 켬 판의 ②가 정산 칸을 ⓑ 로 옮긴 것이 끔의 비트 동일을 가리지 않는다는 증인이다.
  if (!await startZones(null, { T732_MOMENT_LOT: '0' })) { console.log('  ✗ 끔 탐침 기동 실패'); process.exit(1); }
  // ★★[T1002 2026-10-31] **"같은 날 안에서"가 이 판의 상황 선행이다**(위 주석) — 판 도중 게임일이 바뀌면 날 로트가 그 경계에서 정산해
  //   `e·t` 가 정당하게 바뀐다(T1002 고친 판 50판 중 1판 — 출발 로트 t 1245424 · e 0 → 도착 t 1245425 · e 0.318728).
  //   두 존 `/health` 의 `day`(달력 정본 `calendarNow` · 이 하네스는 마을 끔이라 벽시계 하루 = `VILLAGE_DAY_MS` 기본 24분)를 판 앞뒤로 읽어
  //   바뀌었으면 새 사람으로 다시 — 최대 3번(⑦ · ⑧ 과 같은 꼴 · 판정 무변). 같은 날 안의 정산(결함)은 앞뒤 날이 같으니 그대로 잡는다.
  const dayOf = async (port) => { try { const h = await jget(`http://localhost:${port}/health`); return h ? h.day : null; } catch (e) { return null; } };
  const daysNow = async () => `${await dayOf(HPORT)}/${await dayOf(NPORT)}`;
  let C = null, cTries = 0, cDays = '';
  for (let k = 0; k < 3; k++) {
    const d0 = await daysNow();
    C = await roundTrip(k ? `C${k}` : 'C');
    const d1 = await daysNow();
    cTries = k + 1; cDays = d0 === d1 ? d0 : `${d0} → ${d1}`;
    if (d0 === d1) break;
  }
  const recsC = Object.values(((C || {}).before || {}).lots || {}).flat();
  const cEq = !!C.crossed && recsC.length > 0 && !recsC.some((l) => l.k !== undefined) && durableKey(C.after, true) === durableKey(C.before, true);
  ok(cEq, "★[T778 끔 탐침 '0'] 날 로트 세계 — 도착한 몸이 로트 **통째(`e·t` 까지)** 비트 동일 · 레코드에 `k` 없음(종전 단언 그대로)",
    (cEq ? `${recsC.length}개` : `\n      넘음 ${!!C.crossed} · 로트 ${recsC.length} · k ${recsC.filter((l) => l.k !== undefined).length}\n      출발 ${durableKey(C.before, true)}\n      도착 ${durableKey(C.after, true)}`)
      + ` · 시도 ${cTries} · 게임일(H/N) ${cDays}`);
  killAll(); await sleep(4000);

  // ★★[T823] 떠난 몸 껍데기를 얼린다 — 켬 판(D · ★T831 켬 기본 — 손잡이 없음) · 끔 탐침(E · 같은 탐침 · 두 존 `T823_FREEZE_SHELL=0`)
  //   D: 넘긴 뒤 껍데기를 두 번 읽은 사이(600ms · 사람 문 하나) **비트 같다** · 도착 존이 받은 HP = 껍데기 HP(세운 순간 = 직렬화 = 껍데기) ·
  //      도착 몸의 내구 부분 = 출발(내려놓기가 껍데기에 안 닿았다 — 복제 0)
  //   E: 같은 탐침이 껍데기를 바꾼다(회복이 오르고 · 생선이 땅으로 — 끔은 종전 그대로) — D 의 "같다"가 자명하지 않다는 증인
  const fishN = (b) => ((((b || {}).kgLedger || {}).fish) || []).length;
  if (!await startZones()) { console.log('  ✗ T823 켬(기본) 기동 실패'); process.exit(1); }
  const D = await roundTrip('D', { probe: true });
  ok(D.crossed && !!D.probe && !!D.probe.s0 && !!D.probe.s1, '★[상황 · T823 켬] 넘었고 껍데기를 두 번 읽었다(ACK 전)', D.probe ? `생선 ${fishN(D.probe.s0)} · HP ${((D.probe.s0 || {}).vital || {}).hp}` : '');
  if (D.crossed && D.probe && D.probe.s0 && D.probe.s1) {
    const same = JSON.stringify(D.probe.s0) === JSON.stringify(D.probe.s1);
    ok(same, '★★[T823 켬] 떠난 몸 껍데기가 **언다** — 넘긴 뒤 600ms · 사람 문(내려놓기) 하나에도 몸이 비트 같다(HP · 게이지 · 생선 장부 · 로트)',
      same ? `HP ${D.probe.s0.vital.hp} · 생선 ${fishN(D.probe.s0)}` : `\n      앞 ${JSON.stringify({ hp: D.probe.s0.vital.hp, body: D.probe.s0.body, fish: fishN(D.probe.s0) })}\n      뒤 ${JSON.stringify({ hp: D.probe.s1.vital.hp, body: D.probe.s1.body, fish: fishN(D.probe.s1) })}`);
    ok(D.hpW === D.probe.s0.vital.hp, '★[T823 켬] 도착 존이 받은 HP = 껍데기 HP(세운 순간 = 직렬화 = 껍데기 — 그 사이 안 변했다)', `받은 ${D.hpW} · 껍데기 ${D.probe.s0.vital.hp}`);
    const dEq = durableKey(D.after) === durableKey(D.before) && fishN(D.after) === fishN(D.before);
    ok(dEq, '★[T823 켬] 도착 몸의 내구 부분 = 출발(생선 그대로 — 껍데기 내려놓기가 없었으니 복제 0)', dEq ? `생선 ${fishN(D.after)}` : `\n      출발 ${durableKey(D.before)}\n      도착 ${durableKey(D.after)}`);
  }
  killAll(); await sleep(4000);
  if (!await startZones(null, { T823_FREEZE_SHELL: '0' })) { console.log('  ✗ T823 끔 탐침 기동 실패'); process.exit(1); }
  const E = await roundTrip('E', { probe: true });
  ok(E.crossed && !!E.probe && !!E.probe.s0 && !!E.probe.s1, '[상황 · T823 끔 탐침] 넘었고 껍데기를 두 번 읽었다', E.probe ? `생선 ${fishN(E.probe.s0)}` : '');
  if (E.crossed && E.probe && E.probe.s0 && E.probe.s1) {
    const hp0 = E.probe.s0.vital.hp, hp1 = E.probe.s1.vital.hp, f0 = fishN(E.probe.s0), f1 = fishN(E.probe.s1);
    ok(hp1 > hp0 && f1 === f0 - 1, '★[T823 끔 탐침] 같은 탐침이 껍데기를 바꾼다 — 넘긴 뒤에도 아물고(HP ↑) · 내려놓기가 껍데기에 닿는다(생선 −1 · 도착 몸엔 그대로 — 종전 그대로의 구멍)',
      `HP ${hp0} → ${hp1} · 생선 ${f0} → ${f1} · 도착 ${fishN(E.after)}`);
  }
  killAll(); await sleep(4000);

  // ★★[T868] ⑦ 승격 경로가 몸 전부를 잇는다(위 `promoteTrip`) — P = 켬(`T868_PROMOTE_BODY=1`) · Q = 끔(기본 — 종전 결함 증인 · 켬 판의 "같다"가 자명하지 않다는 증인)
  // ★★[T873] ⑦ P 소스 검사 — 몸을 사람에 얹는 칸 목록이 하나인가(T868 회부 3). 몸 칸 = `parseBody` 가 돌려주는 칸(그 리터럴에서 읽는다 — 새 칸이 생기면
  //   목록이 저절로 는다 · `vital` 은 사람에선 hp · maxHp · isDown · downedAt). ⓐ 얹는 함수가 하나(`function _bodyInto(` 1 · 옛 `_t868BodyInto` 0 · 신체 빈 칸 0 채움 꼴 1)
  //   ⓑ 그 함수가 몸 칸 전부를 얹는다 ⓒ 일반 접속 리터럴은 펼침 `..._bodyInto({}, _B, equipped)` 하나 — 그 밖에 몸 칸 키 · `_B` 읽기 0
  //   ⓓ 승격 갈래는 `_bodyInto(player, _t868hb.B, …)` 를 부르고 그 밖에 몸 칸 쓰기(`player.칸 =`) · `_t868hb.B` 읽기 0(T732 로트 줄 — T868 끔에도 도는 몫 — 만 예외).
  //   미끼 넷 = 한 쪽에만 칸 더한 사본: 새 칸(`parseBody` 에 더함)을 리터럴에만 · 승격에만, 있는 칸(제작이력)을 리터럴에만 · 승격에만 한 번 더 — 넷 다 물어야 한다.
  //   옳은 사본(새 칸을 `parseBody` 와 `_bodyInto` 에만)은 지나야 한다(새 칸마다 빨강인 자는 자가 아니다).
  const VITAL_KEYS = ['hp', 'maxHp', 'isDown', 'downedAt'];
  //   ★[T930] 생명값의 hp 는 **문**(`setHp(p, …)`)으로 얹는다 — T109 "사람 hp 를 쓰는 문은 하나"(`e2e-hp ⓪`)와 이 검사가 같은 줄을 서로 반대로 요구했다
  //     (T868 · T873 뒤 `e2e-hp ⓪` 빨강). hp 칸만 `p.hp = ` 대신 `setHp(p, ` 줄을 보고 · 그 함수 안 `p.hp =` 는 0 이어야 한다(나머지 칸은 종전 그대로 `p.칸 = `).
  const putsKey = (fn, k) => (k === 'hp' ? (/\n\s*setHp\(p, /.test(fn) && !/\n\s*p\.hp\s*=[^=]/.test(fn)) : new RegExp(`\\n\\s*p\\.${k} = `).test(fn));
  const bodyKeysOf = (s) => { const m = /\n  const out = \{([\s\S]*?)\n  \};/.exec(cutSrc(s, 'function parseBody(raw, opts) {', '\n}\n')); return m ? [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/([A-Za-z_]\w*)\s*:/g)].map((x) => x[1]) : []; };
  const litOf = (s) => cutSrc(cutSrc(s, 'async function _acceptConnection(', '\nfunction '), '\n  const player = {', '\n  };');
  const T732_LOTS = /^\s*if \(T732_MOMENT && pending\.body\) \{ try \{ const _B = parseBody\(pending\.body, \{\}\); if \(_B && _B\.lots\) player\.lots = _B\.lots; \} catch \(e\) \{\} \}[ \t]*$/m;
  const bodyIntoOne = (s) => {
    const keys = bodyKeysOf(s).filter((k) => k !== 'vital').concat(VITAL_KEYS);
    const fn = cutSrc(s, '\nfunction _bodyInto(p, B, equipped) {', '\n}\n');
    const lit = litOf(s).replace(/\/\/[^\n]*/g, ''), litRest = lit.replace('..._bodyInto({}, _B, equipped),', '');
    const pro = promoteOf(s).replace(/\/\/[^\n]*/g, ''), proRest = pro.replace(T732_LOTS, '').replace(/^.*_bodyInto\(player, _t868hb\.B, .*$/m, '');
    return keys.length >= 15 && ['toolItems', 'craftLog', 'member', 'downedAt'].every((k) => keys.includes(k))
      && (s.match(/\bfunction _bodyInto\(/g) || []).length === 1 && !/\b_t868BodyInto\s*\(/.test(s)
      && (s.match(/\{ cold: 0, fatigue: 0, injury: 0, morale: 0, herbUntil: 0, stages: \{\}, \.\.\./g) || []).length === 1
      && keys.every((k) => putsKey(fn, k))
      && lit.length > 500 && lit.split('..._bodyInto({}, _B, equipped),').length === 2 && !/\b_B\b/.test(litRest)
      && !keys.some((k) => new RegExp(`(^|[\\s{,])${k}\\s*[:,]`).test(litRest))
      && /_bodyInto\(player, _t868hb\.B, /.test(pro) && !/_t868hb\.B\b/.test(proRest)
      && !keys.some((k) => new RegExp(`\\bplayer\\.${k}\\s*=[^=]`).test(proRest));
  };
  const addOut = (s) => s.replace('  const out = {\n    toolItems: [],', '  const out = {\n    wetness: null, toolItems: [],');
  const proLine = /^(.*_bodyInto\(player, _t868hb\.B, .*)$/m;
  const decoys873 = [
    addOut(src).replace('..._bodyInto({}, _B, equipped),', '..._bodyInto({}, _B, equipped),\n    wetness: _B.wetness,'),
    addOut(src).replace(proLine, '$1\n    if (_t868hb) player.wetness = _t868hb.B.wetness;'),
    src.replace('..._bodyInto({}, _B, equipped),', '..._bodyInto({}, _B, equipped),\n    craftLog: _B.craftLog,'),
    src.replace(proLine, '$1\n    if (_t868hb) player.craftLog = _t868hb.B.craftLog;'),
  ];
  const right873 = addOut(src).replace('  p.member = B.member;', '  p.member = B.member;\n  p.wetness = B.wetness;');
  const bit873 = decoys873.filter((d) => d !== src && !bodyIntoOne(d)).length;
  ok(bodyIntoOne(src) && bit873 === 4 && right873 !== src && right873 !== addOut(src) && bodyIntoOne(right873),
    '⑦ P ★★[T873] 몸을 사람에 얹는 함수는 하나(`_bodyInto`) — 일반 접속 리터럴 · 승격이 같은 칸 목록을 부른다 · 미끼(한 쪽에만 칸 더한 사본) 넷 다 문다 · 옳은 사본(새 칸을 `_bodyInto` 에만)은 지난다',
    `몸 칸 ${bodyKeysOf(src).length}(생명값 → ${VITAL_KEYS.length}) · 미끼 ${bit873}/4 · 리터럴 ${litOf(src).length}자`);
  {   // ★[T930] 미끼 — 몸 얹기의 hp 를 옛 직접 대입(`p.hp = …` · T868 이 넣은 그 줄)으로 되돌린 사본은 문다(hp 칸을 문으로만 본다는 것이 자명 통과가 아니다)
    const oldHp = src.replace("setHp(p, (V && typeof V.hp === 'number') ? V.hp : PLAYER_MAX_HP, 'takeover');", "p.hp = (V && typeof V.hp === 'number') ? V.hp : PLAYER_MAX_HP;");
    ok(oldHp !== src && !bodyIntoOne(oldHp), '⑦ P ★[T930] 몸 얹기의 hp 는 문(`setHp(p, …)`)으로 — 옛 직접 대입 사본(`p.hp = …`)은 문다', `직접 대입 사본 ${oldHp !== src ? '만듦' : '못 만듦'} · 문다 ${!bodyIntoOne(oldHp)}`);
  }
  if (!await startZones(null, { T868_PROMOTE_BODY: '1' })) { console.log('  ✗ T868 켬 기동 실패'); process.exit(1); }
  const P = await promoteTrip('P');
  ok(P.crossed && P.promoted, '★[상황 · T868 켬] 관측 소켓을 승격해 넘었다(넘기 메시지 · 승격 welcome)', P.crossed ? `승격 welcome ${P.promoted}` : '넘지 못함');
  if (P.crossed && P.promoted) {
    const b0 = P.before || {};
    ok((b0.toolItems || []).length === 2 && (b0.equipment || []).length === 2 && Object.keys(b0.equipSlots || {}).length >= 2
      && Object.keys(b0.craftSkill || {}).length === 2 && Object.keys(b0.oreLedger || {}).length === 1 && !!b0.fishStats && fishN(b0) === 3
      && !!(b0.member && b0.member.vid === MEMBER_FIX.vid),
      '★[상황 · T868] 출발 몸의 칸마다 빈 칸이 아닌 값이 앉았다(도구 2 · 장비 2 · 슬롯 · 숙련 · 원석장부 · 어획 · kg 원장 3 · 소속) — 빈 칸끼리 같음은 자명 통과',
      `도구 ${(b0.toolItems || []).length} · 장비 ${(b0.equipment || []).length} · 슬롯 ${JSON.stringify(Object.keys(b0.equipSlots || {}))} · 숙련 ${JSON.stringify(b0.craftSkill)}`);
    const dEqP = durableKey(P.after) === durableKey(P.before);
    ok(dEqP, '★★[T868 켬] 승격으로 넘은 몸의 내구 부분이 비트 같다 — 도구 · 장비 · 슬롯 · 숙련 · 제작이력 · 원석장부 · 이월 · 어획 · kg 원장 · 로트(`d·k·n·m·w`) · 소속',
      dEqP ? '' : `\n      출발 ${durableKey(P.before)}\n      도착 ${durableKey(P.after)}`);
    ok((P.welcomeTools || []).length === 2, '★[T868 켬] 승격 welcome 도 도구를 싣는다(화면이 아는가)', `${(P.welcomeTools || []).length}개`);
    ok((softOf(P.beforeCross) || {}).cold >= P.SET_COLD - 0.05 && softNear(softOf(P.after), softOf(P.beforeCross), 0.15),
      '★[T868 켬] 신체(추위 · 피로 · 부상)가 이어진다(넘는 순간 추위를 세워 뒀다 · 0 으로 안 튄다)', `${JSON.stringify(softOf(P.beforeCross))} → ${JSON.stringify(softOf(P.after))}`);
    const hpXP = ((P.beforeCross || {}).vital || {}).hp;
    ok(hpXP < 90 && P.hpW === hpXP, '★[T868 켬] 받은 HP = 넘는 순간 껍데기 HP(최대로 안 튄다 · 깎인 채 이어진다)', `받은 ${P.hpW} · 넘는 순간 ${hpXP}`);
    const fPP = lotsFlow(P.before, P.after);
    ok(fPP.n > 0 && !fPP.bad.length, '★[T868 켬] 로트 정산 칸(`e·t`)도 이어진다(흐른 시간만큼만)', `${fPP.n}개 · Δe 최대 ${fPP.deMax.toFixed(6)}${fPP.bad.length ? ' · ' + fPP.bad.join(' | ') : ''}`);
    const rEqP = durableKey(P.rowBody) === durableKey(P.before);
    ok(rEqP, '★★[T868 켬] 클라가 끊긴 판 — 도착 존이 닫힐 때 쓴 central 행의 몸이 넘기 전과 비트 같다(도구 그대로 · 영구 소실 0)',
      rEqP ? `행 도구 ${((P.rowBody || {}).toolItems || []).length}` : `\n      출발 ${durableKey(P.before)}\n      행   ${durableKey(P.rowBody)}`);
    ok(durableKey(P.again) === durableKey(P.before), '★[T868 켬] 다시 접속한 몸도 넘기 전과 같다', `도구 ${((P.again || {}).toolItems || []).length}`);
  }
  // ★★[T890] ⑦ 승계 갈래 켬(기본 · `T890_TAKEOVER_BODY` 안 줌) — 같은 판에서
  {
    const R = await takeoverTrip('R');
    ok(R.stale && R.kicked && R.samePid && R.nPeople === 1,
      '★[상황 · T890 켬] 같은 손님 토큰으로 새 소켓 → 옛 세션 승계(옛 소켓 kicked · 같은 playerId · 사람 하나) · 행이 산 몸의 장부 · 신체 · HP 를 아직 안 가졌다(자명 통과 0)',
      `시도 ${R.tries} · kicked ${R.kicked} · 사람 ${R.nPeople} · 행 신체 ${JSON.stringify(tkSoft(R.row0))} · 산 신체 ${JSON.stringify(tkSoft(R.live))}`);
    const lostR = tkLost(R, R.after), rowLostR = tkLost(R, R.row1);
    const hpA = ((R.after || {}).vital || {}).hp, hpL = ((R.live || {}).vital || {}).hp, hp0 = ((R.row0 || {}).vital || {}).hp;
    ok(R.stale && !lostR.length && tkNear(tkSoft(R.after), tkSoft(R.live)) && hpA !== hp0 && hpA >= hpL
      && tkJ(((R.after || {}).toolItems || []).map((t) => t.type).sort()) === tkJ(((R.live || {}).toolItems || []).map((t) => t.type).sort()),
      '★★[T890 켬] 승계한 몸이 산 몸을 잇는다 — 숙련 · 제작이력 · 원석장부 · 이월 · 어획 · 소속 비트 같음 · 신체 넷 이어짐 · HP 저장본으로 안 돌아감 · 도구',
      `잃은 칸 ${JSON.stringify(lostR)} · 신체 ${JSON.stringify(tkSoft(R.live))} → ${JSON.stringify(tkSoft(R.after))} · HP 산 ${hpL} → ${hpA}(행 ${hp0})`);
    ok(R.stale && !rowLostR.length && tkNear(tkSoft(R.row1), tkSoft(R.live)),
      '★★[T890 켬] 새 소켓이 닫힌 뒤 행도 산 몸 그대로(영구 소실 0)', `행 잃은 칸 ${JSON.stringify(rowLostR)} · 행 신체 ${JSON.stringify(tkSoft(R.row1))}`);
  }
  // ★★[T916] ⑧ central 이 내려간 동안 로그아웃 켬(기본 · `T916_SAVE_RETRY` 안 줌) — 같은 판에서(central 을 내렸다 다시 띄운다)
  {
    const U = await saveRetryTrip('U');
    ok(U.up && U.stale && U.samePid, '★[상황 · T916 켬] central 을 내린 채 산 몸을 바꾸고 끊었다 → central 다시 뜸 · 다시 붙기 전 행은 바꾼 값을 아직 안 가졌다(줄이 존에 있다 · 자명 통과 0) · 같은 playerId',
      `central ${U.up} · 시도 ${U.tries} · 행 신체 ${JSON.stringify(tkSoft(U.row0))} · 산 신체 ${JSON.stringify(tkSoft(U.live))}`);
    const lostU = tkLost(U, U.after), rowLostU = tkLost(U, U.row1);
    const hpA = ((U.after || {}).vital || {}).hp, hp0 = ((U.row0 || {}).vital || {}).hp;
    ok(U.stale && !lostU.length && tkNear(tkSoft(U.after), tkSoft(U.live)) && hpA !== hp0,
      '★★[T916 켬] 다시 붙은 몸이 central 이 없던 동안의 몸을 잇는다 — 숙련 · 제작이력 · 원석장부 · 이월 · 어획 · 소속 비트 같음 · 신체 넷 이어짐 · HP 저장본으로 안 돌아감',
      `잃은 칸 ${JSON.stringify(lostU)} · 신체 ${JSON.stringify(tkSoft(U.live))} → ${JSON.stringify(tkSoft(U.after))} · HP ${hp0} → ${hpA}`);
    ok(U.stale && !rowLostU.length && tkNear(tkSoft(U.row1), tkSoft(U.live)), '★★[T916 켬] 끊은 뒤 행도 그 몸(영구 소실 0)', `행 잃은 칸 ${JSON.stringify(rowLostU)}`);
  }
  // ★★[T927] ⑨ 몸 버전 조건부 쓰기 켬(기본 · `T927_BODY_VER` 안 줌) — 위 `bodyVerTrip` · 넘긴 판 A 의 몸 버전 이음 · 글자(존 셋 · central 하나)
  {
    const csrc = fs.readFileSync(path.join(ROOT, 'server', 'central.js'), 'utf8');
    ok(/\n  if \(T927_BODY_VER\) player\._saveVer = \(\+player\._saveVer \|\| 0\) \+ 1;/.test(cutSrc(src, '\nfunction _savePatch(', '\n}\n'))
      && /\n  if \(T927_BODY_VER\) o\.sv = \+p\._saveVer \|\| 0;/.test(cutSrc(src, '\nfunction serializeBody(p) {', '\n}\n'))
      && /\n  if \(Number\.isFinite\(o\.sv\)\) out\.sv = o\.sv;/.test(cutSrc(src, '\nfunction parseBody(raw, opts) {', '\n}\n'))
      && /\n  if \(T927_BODY_VER\) p\._saveVer = \+B\.sv \|\| 0;/.test(cutSrc(src, '\nfunction _bodyInto(p, B, equipped) {', '\n}\n'))
      && /if \(T927_BODY_VER\) \{\s*\n\s*p = stmtGetPlayer\.get\(id\) \|\| p;[\s\S]{0,300}vIn < vRow\) return jsonResp\(res, 200, \{ ok: false, reason: 'stale'/.test(csrc),
      '⑨ ★[T927] 글자 — 저장마다 몸 버전 하나 올림(`_savePatch`) · 몸이 싣는다(`serializeBody`) · 읽는다(`parseBody`) · 사람에 얹는다(`_bodyInto`) · central 은 몸을 받은 뒤 행을 다시 읽어 작은 버전을 안 쓴다');
    const A0 = R.beforeCross && R.beforeCross.sv, A1 = R.after && R.after.sv, A2 = R.again && R.again.sv;
    ok(R.crossed && Number.isFinite(A0) && A0 > 0 && Number.isFinite(A1) && A1 >= A0 && Number.isFinite(A2) && A2 > A1,
      '⑨ ★[T927 켬] 넘긴 판(A) — 도착 몸 버전이 넘는 순간 몸 버전 위에서 잇는다 · 다시 접속한 몸은 그 위(도착 존 저장 · 행에서 읽음)', `넘는 순간 ${A0} → 도착 ${A1} → 다시 접속 ${A2}`);
    const W = await bodyVerTrip();
    ok(Number.isFinite(W.sv0) && W.sv0 > 0, '★[상황 · T927 켬] 존이 저장한 행에 몸 버전이 있다(0 이 아니다 — 아래가 자명 통과가 아니다)', `행 몸 버전 ${W.sv0}`);
    ok(W.resOld && W.resOld.ok === false && W.resOld.reason === 'stale' && W.resOld.sv === W.sv0 && W.r1.tools_json === W.r0.tools_json && W.r1.wood === W.r0.wood && W.r1.last_seen === W.r0.last_seen,
      '★★⑨ [T927 켬] 옛 몸 버전(행 − 1)의 저장은 central 이 안 쓴다 — 몸 칸 · 짐 · `last_seen` 그대로(`stale`)', `응답 ${JSON.stringify(W.resOld)} · 나무 ${W.r0.wood} → ${W.r1.wood}`);
    ok(W.resEq && W.resEq.ok === true && W.r2.wood === 7, '⑨ [T927 켬] 같은 몸 버전의 저장은 종전대로 쓴다(같으면 쓴다 — 버리는 것은 작은 것뿐)', `응답 ${JSON.stringify(W.resEq)} · 나무 ${W.r2.wood}`);
    ok(Number.isFinite(W.sv3) && W.sv3 > W.sv0 && W.r3.last_seen > W.r2.last_seen, '⑨ [T927 켬] 끊으면 존의 닫힐 때 저장이 그 위 차례로 쓰인다(존은 막히지 않는다)', `몸 버전 ${W.sv0} → ${W.sv3}`);
  }
  killAll(); await sleep(4000);
  if (!await startZones(null, { T868_PROMOTE_BODY: '0', T890_TAKEOVER_BODY: '0', T916_SAVE_RETRY: '0', T927_BODY_VER: '0' })) { console.log('  ✗ T868 끔 탐침 기동 실패'); process.exit(1); }   // ★[T916] 저장 다시 보내기 끔 증인(V)도 이 판(승격 · 승계 탐침은 central 을 안 내린다)   // [PM 착지 10-23] 켬 기본 — 끔 탐침은 `=0` · ★[T890] 승계 끔 증인도 이 판(승격 탐침은 승계를 안 밟는다)
  const Q = await promoteTrip('Q');
  ok(Q.crossed && Q.promoted, '[상황 · T868 끔 탐침] 관측 소켓을 승격해 넘었다', Q.crossed ? `승격 welcome ${Q.promoted}` : '넘지 못함');
  if (Q.crossed && Q.promoted) {
    const nT = (b) => ((b || {}).toolItems || []).length;
    ok(nT(Q.before) === 2 && nT(Q.after) === 0 && nT(Q.rowBody) === 0 && durableKey(Q.after) !== durableKey(Q.before),
      '★[T868 끔 탐침] 끔이면 승격 몸이 비고 클라가 끊긴 판 행도 비어 영구 소실이다(도구 2 → 0 → 행 0 — 종전 그대로의 결함 · 켬 P 의 "같다"가 자명하지 않다는 증인)',
      `도구 ${nT(Q.before)} → ${nT(Q.after)} → 행 ${nT(Q.rowBody)} · 받은 HP ${Q.hpW}`);
  }
  // ★★[T890] ⑦ 승계 갈래 끔 증인(`T890_TAKEOVER_BODY=0` — 종전 승계 칸 목록) — 켬 R 의 "잇는다"가 자명하지 않다는 증인
  {
    const S = await takeoverTrip('S');
    ok(S.stale && S.kicked && S.samePid && S.nPeople === 1, '[상황 · T890 끔 탐침] 승계했고 · 행이 산 몸의 값을 아직 안 가졌다', `시도 ${S.tries}`);
    const lostS = tkLost(S, S.after), rowLostS = tkLost(S, S.row1);
    ok(S.stale && lostS.includes('craftLog') && lostS.includes('fishStats') && !tkNear(tkSoft(S.after), tkSoft(S.live)) && rowLostS.includes('craftLog'),
      '★[T890 끔 탐침] 끔이면 승계가 제작이력 · 어획 · 신체를 저장본으로 되돌리고 새 소켓이 닫힐 때 행까지 덮는다(종전 그대로의 결함 · 켬 R 의 증인)',
      `잃은 칸 ${JSON.stringify(lostS)} · 신체 ${JSON.stringify(tkSoft(S.live))} → ${JSON.stringify(tkSoft(S.after))} · 행 잃은 칸 ${JSON.stringify(rowLostS)}`);
  }
  // ★★[T916] ⑧ 끔 증인(`T916_SAVE_RETRY=0` — 종전 글자: 저장 실패는 경고 한 줄) — 켬 U 의 "잇는다"가 자명하지 않다는 증인
  {
    const V = await saveRetryTrip('V');
    ok(V.up && V.stale && V.samePid, '[상황 · T916 끔 탐침] central 을 내린 채 바꾸고 끊었다 · 다시 붙기 전 행은 바꾼 값을 안 가졌다', `central ${V.up} · 시도 ${V.tries}`);
    const lostV = tkLost(V, V.after), rowLostV = tkLost(V, V.row1);
    ok(V.stale && lostV.includes('craftSkill') && lostV.includes('fishStats') && !tkNear(tkSoft(V.after), tkSoft(V.live)) && rowLostV.includes('craftSkill'),
      '★[T916 끔 탐침] 끔이면 central 이 없던 동안의 몸이 사라진다(숙련 · 어획 · 신체 · 행까지 — T894 회부 1 그대로의 결함 · 켬 U 의 증인)',
      `잃은 칸 ${JSON.stringify(lostV)} · 행 잃은 칸 ${JSON.stringify(rowLostV)}`);
  }
  killAll(); await sleep(4000);

  // ★★[T831] ⑤ 닫힐 때 저장 자리 경합 — 순서 강제 탐침(위 `closeRace`). F = 켬(기본) · G = 끔 탐침(`T823_FREEZE_SHELL=0` — 닫힐 때 저장 문 하나만 · 결함 증인) ·
  //   H = 끔 탐침(주기 저장 문 — 정보). 세 판 다: 출발 존만 안 문 비밀(ACK 잃음 → 껍데기는 3초에 출발 존이 닫는다) · 도착 존 주기 저장 10분(두 읽음 사이 도착 존 쓰기 0).
  //   출발 존 주기 저장: F · H 1초(껍데기 주기 저장 문도 같은 창에 연다) · G 10분(닫힐 때 저장 문만 — 첫 읽음은 도착 존 접속 저장 그대로여야 한다).
  const SECRET_H = { CENTRAL_SECRET: 't831-ack-door-probe', SAVE_INTERVAL_MS: '1000' };
  const SECRET_H_CLOSE = { CENTRAL_SECRET: 't831-ack-door-probe', SAVE_INTERVAL_MS: '600000' };
  const rowFish = (r) => { try { return fishN(JSON.parse(r.tools_json)); } catch (e) { return null; } };
  const sameXY = (p, q) => !!p && !!q && p.last_x === q.last_x && p.last_y === q.last_y;
  const at = (r) => r ? `${r.last_zone}(${Math.round(r.last_x)},${Math.round(r.last_y)})` : '(없음)';
  const lobby = (X) => (X.auth && X.auth.ok && X.auth.isNew === false && X.auth.player) ? X.auth.player.last_zone : null;
  if (!await startZones(SECRET_H, { SAVE_INTERVAL_MS: '600000' })) { console.log('  ✗ T831 켬 기동 실패'); process.exit(1); }
  const RF = await closeRace('F');
  ok(RF.crossed && RF.joined && !!RF.live && !!RF.r1 && !!RF.r2, '★[상황 · T831 켬] 넘었고 · 토큰으로 도착 존에 붙어 그 존에 몸이 산다 · 행을 두 번 읽었다', RF.live ? `도착 존 생선 ${fishN(RF.live)}` : '');
  if (RF.crossed && RF.joined && RF.r1 && RF.r2) {
    ok(RF.aOpenAtR1 && RF.aClosedAt > 0 && RF.aClosedAt - RF.tMsg >= 2500, '★[상황 · T831 켬] ACK 를 잃었다 — 첫 읽음 때 껍데기 소켓이 열려 있었고 · 출발 존이 ACK 시한에 스스로 닫았다(닫힐 때 저장이 도착 존 접속 저장보다 늦다 — 순서 강제)',
      `넘기 메시지 → 도착 존 붙음 ${RF.tJ - RF.tMsg}ms · 첫 읽음 ${RF.tR1 - RF.tMsg}ms · 껍데기 닫힘 ${RF.aClosedAt - RF.tMsg}ms`);
    //   ★[T843] T831 판의 상황 줄("껍데기의 늦은 저장이 닿았다 — last_seen ↑")은 이제 거꾸로 선다 — 받는 존이 몸을 받은 뒤(ACK 기다림 · ACK 시한)의 껍데기 저장은 안 나간다.
    //     껍데기가 닫힌 것은 위 상황 줄(ACK 시한 3초)이 · 같은 순서에서 끔이면 쓰인다는 것은 아래 G 판이 잰다(자명 통과 0).
    ok(RF.r2.last_seen === RF.r1.last_seen, '★[T843 켬] 껍데기가 닫힌 뒤(ACK 시한) 행이 안 쓰였다 — 받는 존이 몸을 받은 뒤의 껍데기 저장은 통째로 안 나간다(`last_seen` 그대로)', `last_seen Δ ${RF.r2.last_seen - RF.r1.last_seen}ms`);
    ok(RF.r1.last_zone === 'nippon' && RF.r2.last_zone === 'nippon' && sameXY(RF.r1, RF.r2),
      '★★[T831 켬] 넘긴 몸 껍데기의 저장(주기 · 닫힐 때)이 행의 자리를 안 쓴다 — 행은 도착 존 · 도착 존이 쓴 그 자리 그대로', `${at(RF.r1)} → ${at(RF.r2)}`);
    ok(lobby(RF) === 'nippon', '★★[T831 켬] 다시 접속(로비 `/auth` → `last_zone` 자동 라우팅)이 도착 존으로 간다', `${lobby(RF)}`);
    ok(fishN(RF.live) === 2 && rowFish(RF.r1) === 2 && rowFish(RF.r2) === 2,
      '★★[T843 켬] 몸 칸이 안 되돌아간다 — 도착 존 내려놓기(행동 저장)의 몸이 껍데기 주기 저장 창(1초)에도 · 닫힌 뒤에도 행에 그대로(되돌림 0 · 산 몸 = 행)',
      `행 생선 ${rowFish(RF.r1)} → ${rowFish(RF.r2)} · 도착 존 산 몸 ${fishN(RF.live)}`);
  }
  killAll(); await sleep(4000);
  if (!await startZones(SECRET_H_CLOSE, { SAVE_INTERVAL_MS: '600000', T823_FREEZE_SHELL: '0', T927_BODY_VER: '0' })) { console.log('  ✗ T831 끔 탐침 기동 실패'); process.exit(1); }
  const RG = await closeRace('G');
  ok(RG.crossed && RG.joined && !!RG.live && !!RG.r1 && !!RG.r2, '[상황 · T831 끔 탐침] 넘었고 · 토큰으로 도착 존에 붙어 그 존에 몸이 산다 · 행을 두 번 읽었다', RG.live ? `도착 존 생선 ${fishN(RG.live)}` : '');
  if (RG.crossed && RG.joined && RG.r1 && RG.r2) {
    ok(RG.aOpenAtR1 && RG.aClosedAt > 0 && RG.aClosedAt - RG.tMsg >= 2500, '[상황 · T831 끔 탐침] ACK 를 잃었다 — 껍데기 소켓은 출발 존이 ACK 시한에 닫았다(같은 순서 강제)',
      `넘기 메시지 → 도착 존 붙음 ${RG.tJ - RG.tMsg}ms · 첫 읽음 ${RG.tR1 - RG.tMsg}ms · 껍데기 닫힘 ${RG.aClosedAt - RG.tMsg}ms`);
    ok(RG.r1.last_zone === 'nippon', '[상황 · T831 끔 탐침] 첫 읽음(껍데기 닫히기 전) 행 = 도착 존 — 도착 존 접속 저장이 먼저 닿았다(순서의 바닥)', at(RG.r1));
    ok(RG.r2.last_zone === 'hanbando' && RG.r2.last_x >= RG.hanW - EDGE_PAD && lobby(RG) === 'hanbando',
      '★[T831 끔 탐침] 닫힐 때 저장이 그 뒤에 닿아 행을 출발 존 · 껍데기 자리로 되돌린다 — 다시 접속이 출발 존으로(종전 그대로의 결함 · 켬 판의 "도착 존 그대로"가 자명하지 않다는 증인)',
      `${at(RG.r1)} → ${at(RG.r2)} · 로비 ${lobby(RG)} · 출발 존 폭 ${RG.hanW}`);
    ok(RG.r2.last_seen > RG.r1.last_seen && rowFish(RG.r1) === 2 && rowFish(RG.r2) === 3 && fishN(RG.live) === 2,
      '★[T843 끔 탐침] 같은 순서에서 껍데기의 늦은 저장이 몸 칸을 넘긴 순간으로 되돌린다(행 생선 2 → 3 · 산 몸 2 — 종전 그대로의 결함 · 켬 판의 "되돌림 0"이 자명하지 않다는 증인)',
      `행 생선 ${rowFish(RG.r1)} → ${rowFish(RG.r2)} · 도착 존 산 몸 ${fishN(RG.live)} · last_seen +${RG.r2.last_seen - RG.r1.last_seen}ms`);
  }
  killAll(); await sleep(4000);
  //   H — 주기 저장 문(정보): 끔 판 껍데기는 ACK 시한까지 주기 저장 차례(1초)를 맞는다. 첫 읽음(닫히기 전)이 hanbando 면 그 문이 도착 존 접속 저장 **뒤에**
  //   출발 존을 쓴 것이다(차례의 위상이 도착 존 붙는 시간보다 늦을 때만 — 우연이라 단언하지 않고 센다). 켬 판(F)은 같은 창에서 그 문도 막았다(위 F 의 첫 읽음).
  if (!await startZones(SECRET_H, { SAVE_INTERVAL_MS: '600000', T823_FREEZE_SHELL: '0', T927_BODY_VER: '0' })) { console.log('  ✗ T831 주기 저장 탐침 기동 실패'); process.exit(1); }
  const RH = await closeRace('H');
  ok(RH.crossed && RH.joined && !!RH.r1 && !!RH.r2 && RH.aOpenAtR1, '[상황 · T831 끔 탐침 H] 넘었고 · 도착 존에 붙었고 · 껍데기가 열린 채 첫 행을 읽었다', RH.r1 ? `붙음 ${RH.tJ - RH.tMsg}ms · 첫 읽음 ${RH.tR1 - RH.tMsg}ms` : '');
  if (RH.r1 && RH.r2) console.log(`  · [정보 · T831] 주기 저장 문 — 끔 판 첫 읽음(껍데기 닫히기 전) 행 = ${at(RH.r1)}${RH.r1.last_zone === 'hanbando' ? ' ← 껍데기 주기 저장이 도착 존 접속 저장 뒤에 출발 존을 썼다' : ' (이 판은 차례가 붙기 전이었다)'} · 닫힌 뒤 ${at(RH.r2)}`);
  if (RH.r1 && RH.r2) console.log(`  · [정보 · T843] 끔 판 몸 칸 — 행 생선 ${rowFish(RH.r1)} → ${rowFish(RH.r2)} · 도착 존 산 몸 ${fishN(RH.live)}`);
  killAll(); await sleep(4000);
  //   I — ★[T843] 갈래 (나): 받는 존이 몸을 **안** 받은 판(준비 응답 전)은 껍데기 저장이 종전대로 나간다. 받는 존(nippon)을 세워 둔다(SIGSTOP —
  //   넘기기 준비 요청은 커널이 받아 두고 답이 없다 · 출발 존은 최대 5초 기다린다). 넘기기 전 저장(행이 nippon 입구로)이 닿은 것을 보고 출발 소켓을 닫는다 —
  //   닫힐 때 저장은 ACK 기다림 표에 이 몸이 아직 없고(준비 응답 전) 몸도 `players` 에 있으니 (나) → 나간다(`last_seen` ↑ · 몸 칸 · 자리 칸은 T831 대로 그대로).
  //   두 존 주기 저장 10분(그 사이 다른 쓰기 0).
  if (!await startZones({ SAVE_INTERVAL_MS: '600000' }, { SAVE_INTERVAL_MS: '600000' })) { console.log('  ✗ T843 갈래 (나) 기동 실패'); process.exit(1); }
  const RI = await prepRace('I');
  ok(RI.crossed && !!RI.pre && !!RI.r1 && RI.pre.last_zone === 'nippon' && RI.stopped,
    '★[상황 · T843 (나)] 받는 존을 세워 둔 채 넘기기를 시작했다 — 넘기기 전 저장(행 = nippon 입구)이 닿았고 · 준비 응답 전에 출발 소켓을 닫았다', RI.pre ? `넘기기 전 저장 ${at(RI.pre)} · 닫음 +${RI.tClose - RI.tPre}ms` : '');
  if (RI.crossed && RI.pre && RI.r1) {
    ok(RI.r1.last_seen > RI.pre.last_seen && RI.r1.last_zone === 'nippon' && sameXY(RI.pre, RI.r1) && rowFish(RI.r1) === 3,
      '★★[T843 (나)] 받는 존이 몸을 안 받은 판(준비 응답 전 닫힘)은 껍데기의 닫힐 때 저장이 종전대로 나간다 — 행이 또 쓰였고(몸 칸) · 자리는 T831 대로 넘기기 전 저장 그대로',
      `${at(RI.pre)} → ${at(RI.r1)} · last_seen +${RI.r1.last_seen - RI.pre.last_seen}ms · 행 생선 ${rowFish(RI.r1)}`);
  }
  killAll(); await sleep(4000);

  // ★★[T867] ⑥ T498 켬(`T498_HANDOFF_PAYLOAD=1` · 끔 기본)에서 같은 순서 강제 탐침(`closeRace`). 켬이면 넘기기 전 저장이 없고(넘기 메시지 때 행 = 출발 존)
  //   ACK 시한에 떠나는 순간 쥔 행(넘긴 순간 몸 + 도착 존 입구 · `_saveSend` 직접)을 보낸다 — 받는 존이 몸을 받고 ACK 만 잃은 판(F 꼴)에선 그 행이 몸 칸을
  //   되돌렸다(T843 회부 1). J = T498 켬 · T823 켬(기본 — 쥔 행도 T843 술어 `_t843Skip` 를 지난다 → 안 나감) · K = T498 켬 · T823 끔(`=0` — 종전 증인).
  //   출발 존 주기 저장: J 1초(F 와 같은 창) · K 10분(G 와 같은 — 첫 읽음은 도착 존 행동 저장 그대로).
  if (!await startZones(SECRET_H, { SAVE_INTERVAL_MS: '600000', T498_HANDOFF_PAYLOAD: '1' })) { console.log('  ✗ T867 T498 켬 기동 실패'); process.exit(1); }
  const RJ = await closeRace('J', { rowAtMsg: true });
  ok(RJ.crossed && RJ.joined && !!RJ.live && !!RJ.r0 && !!RJ.r1 && !!RJ.r2 && RJ.r0.last_zone === 'hanbando',
    '★[상황 · T867 T498 켬] 넘었고 · 도착 존에 붙어 몸이 산다 · 넘기 메시지 때 행 = 출발 존(넘기기 전 저장 없음 — T498 켬이 먹었다)', RJ.r0 ? `넘기 메시지 때 ${at(RJ.r0)} · 도착 존 생선 ${fishN(RJ.live)}` : '');
  if (RJ.crossed && RJ.joined && RJ.r1 && RJ.r2) {
    ok(RJ.aOpenAtR1 && RJ.aClosedAt > 0 && RJ.aClosedAt - RJ.tMsg >= 2500, '★[상황 · T867] ACK 를 잃었다 — 출발 존이 ACK 시한에 껍데기를 닫았다(쥔 행을 보내는 그 시각)',
      `붙음 ${RJ.tJ - RJ.tMsg}ms · 첫 읽음 ${RJ.tR1 - RJ.tMsg}ms · 껍데기 닫힘 ${RJ.aClosedAt - RJ.tMsg}ms`);
    ok(RJ.r2.last_seen === RJ.r1.last_seen && fishN(RJ.live) === 2 && rowFish(RJ.r1) === 2 && rowFish(RJ.r2) === 2,
      '★★[T867 T498 켬 · T823 켬] ACK 시한의 쥔 행도 안 나간다 — 시한 뒤 행이 안 쓰였고(`last_seen` 그대로) 몸 칸이 안 되돌아간다(행 생선 2 = 산 몸 2)',
      `행 생선 ${rowFish(RJ.r1)} → ${rowFish(RJ.r2)} · 산 몸 ${fishN(RJ.live)} · last_seen Δ ${RJ.r2.last_seen - RJ.r1.last_seen}ms`);
    ok(RJ.r1.last_zone === 'nippon' && RJ.r2.last_zone === 'nippon' && sameXY(RJ.r1, RJ.r2) && lobby(RJ) === 'nippon',
      '★[T867 T498 켬] 자리도 도착 존 접속 저장 그대로 · 다시 접속(로비)이 도착 존으로', `${at(RJ.r1)} → ${at(RJ.r2)} · 로비 ${lobby(RJ)}`);
  }
  killAll(); await sleep(4000);
  if (!await startZones(SECRET_H_CLOSE, { SAVE_INTERVAL_MS: '600000', T498_HANDOFF_PAYLOAD: '1', T823_FREEZE_SHELL: '0', T927_BODY_VER: '0' })) { console.log('  ✗ T867 T498 켬 · 끔 탐침 기동 실패'); process.exit(1); }
  const RK = await closeRace('K', { rowAtMsg: true });
  ok(RK.crossed && RK.joined && !!RK.live && !!RK.r0 && !!RK.r1 && !!RK.r2 && RK.r0.last_zone === 'hanbando',
    '[상황 · T867 T498 켬 · T823 끔 탐침] 넘었고 · 도착 존에 붙었고 · 넘기 메시지 때 행 = 출발 존(T498 켬)', RK.r0 ? `넘기 메시지 때 ${at(RK.r0)}` : '');
  if (RK.crossed && RK.joined && RK.r1 && RK.r2) {
    ok(RK.aOpenAtR1 && RK.aClosedAt > 0 && RK.aClosedAt - RK.tMsg >= 2500, '[상황 · T867 끔 탐침] ACK 를 잃었다 — 출발 존이 ACK 시한에 껍데기를 닫았다',
      `붙음 ${RK.tJ - RK.tMsg}ms · 껍데기 닫힘 ${RK.aClosedAt - RK.tMsg}ms`);
    ok(RK.r2.last_seen > RK.r1.last_seen && rowFish(RK.r1) === 2 && rowFish(RK.r2) === 3 && fishN(RK.live) === 2,
      '★[T867 끔 탐침] T823 끔이면 ACK 시한의 쥔 행 · 닫힐 때 저장이 종전대로 몸 칸을 되돌린다(행 생선 2 → 3 · 산 몸 2 — 켬 J 의 "0"이 자명하지 않다는 증인)',
      `행 생선 ${rowFish(RK.r1)} → ${rowFish(RK.r2)} · 산 몸 ${fishN(RK.live)} · ${at(RK.r1)} → ${at(RK.r2)} · last_seen +${RK.r2.last_seen - RK.r1.last_seen}ms`);
  }
  killAll();

  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
