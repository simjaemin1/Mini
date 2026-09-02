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
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
async function waitHttp(u, n = 300) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const jget = async (u) => (await (await fetch(u)).json());

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
const durableKey = (b) => b ? JSON.stringify({
  toolItems: (b.toolItems || []).map((t) => `${t.type}/${t.d}/${t.max}`).sort(),
  equipment: (b.equipment || []).map((e) => `${e.type}/${e.q}`).sort(),
  equipSlots: b.equipSlots || {}, craftSkill: b.craftSkill || {}, craftLog: b.craftLog || {},
  oreLedger: b.oreLedger || {}, oreCarry: b.oreCarry || {}, fishStats: b.fishStats || null,
  kgLedger: b.kgLedger || null, lots: b.lots || null,
  member: b.member || null,   // ★[T11] 마을 소속 — 시간이 안 바꾼다 ⇒ 내구 쪽이다
}) : '(없음)';
// ★[T11] 존을 넘겨 볼 소속 픽스처. `serializeBody` 가 그대로 싣고 `parseBody` 가 그대로 돌려줘야 한다.
const MEMBER_FIX = { zone: 'hanbando', vid: 7, name: '검사마을', since: 33, wdDay: 33, wdUsed: 2 };
const softOf = (b) => (b && b.body) ? { cold: +(b.body.cold || 0), fatigue: +(b.body.fatigue || 0), injury: +(b.body.injury || 0) } : null;
const softNear = (x, y, tol) => !!x && !!y && Math.abs(x.cold - y.cold) <= tol && Math.abs(x.fatigue - y.fatigue) <= tol && Math.abs(x.injury - y.injury) <= tol;

async function startZones(extraH) {
  fs.mkdirSync(DDIR, { recursive: true });
  for (const f of fs.readdirSync(DDIR)) { try { fs.unlinkSync(path.join(DDIR, f)); } catch (e) {} }
  boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  if (!await waitHttp(`http://localhost:${CPORT}/zones`, 120)) return false;
  const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' };
  boot('zone.js', Object.assign({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1' }, common, extraH || {}));
  boot('zone.js', Object.assign({ PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: `${DDIR}/w-nip.db`, E2E_GIVE: '1' }, common));
  return (await waitHttp(`http://localhost:${HPORT}/health`, 300)) && (await waitHttp(`http://localhost:${NPORT}/health`, 300));
}

// 한 판: 지급 → 경계 넘기 → 도착 → 재접속. 몸 셋(출발·도착·재접속)을 돌려준다.
async function roundTrip(tag) {
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

  const waitNotice = () => new Promise((r) => {
    const h = (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'notice' && (String(m.text).startsWith('🌀') || String(m.text).startsWith('🌊'))) { a.ws.off('message', h); r(String(m.text).startsWith('🌀')); } };
    a.ws.on('message', h);
  });
  // ★★생명값·신체를 **걷는 내내 다시 세운다.** 왜: HP 는 초당 회복하고 추위는 계속 움직인다 —
  //   출발 때 한 번 깎아 두면 경계에 닿을 무렵엔 이미 풀피라 "이어졌나"를 못 잰다(첫 판이 그랬다: 42→51→100).
  //   ⇒ 넘는 순간의 값을 알고 있어야 도착값과 비교할 수 있다.
  const SET_HP = 42, SET_COLD = 0.8;
  const poke = setInterval(() => { try { a.ws.send(JSON.stringify({ type: '__e2e_body', hp: SET_HP, cold: SET_COLD, quiet: true })); } catch (e) {} }, 400);
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  for (let i = 0; i < 60 && !handoffMsg; i++) {
    const pr = waitNotice();
    a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((3 + i) % 60) * LAT_STEP }));
    if (!await pr) continue;
    for (let k = 0; k < 32 && !handoffMsg; k++) await sleep(500);
  }
  clearInterval(walk); clearInterval(poke);
  if (!handoffMsg) return { crossed: false };
  // ★넘는 순간의 몸(출발 존은 ACK 까지 몸을 들고 있다) — 생명값·신체 비교의 기준점이다.
  const beforeCross = pick(await jget(`http://localhost:${HPORT}/bodydbg`));
  try { a.ws.close(); } catch (e) {}
  const b = await open(`${nip.wsUrl}/?handoff_token=${encodeURIComponent(handoffMsg.token)}`);
  await sleep(900);
  const after = pick(await jget(`http://localhost:${NPORT}/bodydbg`));
  await sleep(1500);   // 도착 존이 savePlayer 를 돌릴 시간
  try { b.ws.close(); } catch (e) {}
  await sleep(900);
  const c = await open(`${han.wsUrl}/?username=&name=${NAME}&color=%23ffffff${guestToken ? '&guest_token=' + encodeURIComponent(guestToken) : ''}`);
  await sleep(900);
  const again = pick(await jget(`http://localhost:${HPORT}/bodydbg`));
  try { c.ws.close(); } catch (e) {}
  return { crossed: true, before, beforeCross, after, again, welcomeTools: b.tools, SET_HP, SET_COLD };
}

(async () => {
  console.log('\n=== 존 핸드오프 — 몸이 새지 않는다 (2존 실서버) ===');

  // ① 소스 검사 — 직렬화가 한 함수인가(필드 세기가 아니라 구조를 지킨다)
  const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/tools_json: JSON\.stringify\(serializeBody\(player\)\)/.test(src), '① 저장이 `serializeBody` 를 쓴다');
  ok(/body: E2E_HANDOFF_NO_BODY \? undefined : serializeBody\(player\)/.test(src), '① 핸드오프 페이로드가 **같은 함수**를 쓴다');
  ok((src.match(/parseBody\(/g) || []).length >= 3, '① 복원이 `parseBody` 한 곳에서 온다(정의 + 접속 + 핸드오프)', `${(src.match(/parseBody\(/g) || []).length}회`);
  ok(!/tools_json: JSON\.stringify\(\{/.test(src), '① 저장 경로에 **손으로 쓴 두 번째 직렬화가 없다**');

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

  // ② 왕복 후 — 내구는 비트 동일, 연속 상태는 이어진다
  const dEq = durableKey(R.after) === durableKey(R.before);
  ok(dEq, '② ★★도착한 몸의 **내구 부분이 비트 동일**(도구·장비·숙련·원장·로트)',
    dEq ? '' : `\n      출발 ${durableKey(R.before)}\n      도착 ${durableKey(R.after)}`);
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
  ok(Math.abs(hpA - hpX) <= 12, '② ★★HP 가 존을 넘어 **이어진다**(풀피로 안 튄다)', `${hpX} → ${hpA}`);
  // ⚠재접속의 풀피는 **정책**이다(죽음 설계 T8 소관) — 이 배치가 안 바꿨다. 그 사실을 못 박는다.
  ok(((R.again || {}).vital || {}).hp === 100, '④ 재접속은 여전히 풀피다 — **정책 무변**(T8 소관)', `${((R.again || {}).vital || {}).hp}`);

  // ④ 재접속 후에도 같다 — 도착 존이 빈 몸으로 계정을 덮지 않는다
  const aEq = durableKey(R.again) === durableKey(R.before);
  ok(aEq, '④ ★★재접속한 몸의 내구 부분도 **비트 동일**(영구 소실이 없다)',
    aEq ? '' : `\n      출발   ${durableKey(R.before)}\n      재접속 ${durableKey(R.again)}`);
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
  }
  killAll();

  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
