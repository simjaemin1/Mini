#!/usr/bin/env node
// === T1 검증 하네스: 재연결 시 클라 예측 위치 재앵커(유령 클라) ===
//
// public/client.js 의 연결/메시지/예측 제어 흐름을 그대로 전사(발췌 모의)한다.
//   - connect() / closeConnection() / handleMessage(zoneId, msg, srcConn)
//   - welcome 앵커 블록 / tick 리컨실리에이션 / player_left / checkOrphan / ensurePrimaryConnection
//   - predictStep 게이트(_selfGone)
// FIX=false 로 돌리면 수정 전 동작(=유령 재현), FIX=true 면 수정 후 동작.
//
// 실행: node scripts/test-reanchor.js

function makeClient(FIX) {
  const S = {
    conns: new Map(),
    primaryZoneId: 'hanbando',
    zonesMeta: { hanbando: { worldOffsetX: 0, worldOffsetY: 0, zoneWidth: 100000, zoneHeight: 100000 } },
    myPid: null,
    myAbsPredicted: { x: 0, y: 0 },
    _renderPrev: { x: 0, y: 0 }, _renderCurr: { x: 0, y: 0 }, myAbsRender: { x: 0, y: 0 },
    _renderReady: false,
    _predAccum: 0,
    pendingInputs: [],
    lastTickWithMyPidAt: 0,
    _selfGone: false,
    now: 1000,   // performance.now() 모사 — 0은 lastTickWithMyPidAt 센티널과 충돌하므로 피함
    log: [],
  };
  const PRED_STEP = 1 / 30;

  // --- 소켓 스텁 (readyState: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED) ---
  let wsSeq = 0;
  function makeWs() {
    return { id: ++wsSeq, readyState: 0, close() { this.readyState = 2; } };
  }

  function connect(zoneId, role) {
    const existing = S.conns.get(zoneId);
    if (existing) {
      if (FIX) {
        // ★fix: 살아있는 엔트리만 재사용. 죽은(CLOSING/CLOSED) 엔트리는 버리고 새로 연결.
        if (existing.ws.readyState <= 1) {
          if (existing.role !== role) existing.role = role;
          return existing;
        }
        try { existing.ws.close(); } catch (e) {}
        S.conns.delete(zoneId);
      } else {
        if (existing.role !== role) existing.role = role;
        return existing;   // 옛 동작: 죽은 엔트리도 재사용 → 새 ws 영영 안 생김
      }
    }
    const c = { ws: makeWs(), role, zoneId, meta: null, others: new Map(), resources: new Map() };
    S.conns.set(zoneId, c);
    S.log.push(`connect(${zoneId},${role}) ws#${c.ws.id}`);
    return c;
  }
  function closeConnection(zoneId) {
    const c = S.conns.get(zoneId);
    if (!c) return;
    try { c.ws.close(); } catch (e) {}
    S.conns.delete(zoneId);
  }

  function predictStep(dt, wx, wy) {
    if (FIX && S._selfGone) return;              // ★fix 게이트
    if (wx === 0 && wy === 0) return;
    S.myAbsPredicted.x += wx * 64 * dt;
    S.myAbsPredicted.y += wy * 64 * dt;
  }

  function handleMessage(zoneId, msg, srcConn) {
    const c = S.conns.get(zoneId);
    if (!c) return;
    if (FIX && srcConn && srcConn !== c) { S.log.push(`drop(superseded ws#${srcConn.ws.id}) ${msg.type}`); return; }

    if (msg.type === 'welcome') {
      c.meta = msg.zone;
      for (const r of (msg.resources || [])) c.resources.set(r.id, r);
      if (!msg.observer) {
        S.myPid = msg.pid;
        const absX = msg.zone.worldOffsetX + msg.self.x;
        const absY = (msg.zone.worldOffsetY || 0) + msg.self.y;
        S.pendingInputs.length = 0;
        S._predAccum = 0;
        S.myAbsPredicted = { x: absX, y: absY };
        S._renderPrev = { x: absX, y: absY };
        S._renderCurr = { x: absX, y: absY };
        S.myAbsRender = { x: absX, y: absY };
        S._renderReady = true;
        if (FIX) S._selfGone = false;            // ★fix: 앵커된 순간에만 예측 재개
        S.lastTickWithMyPidAt = S.now;
        S.log.push(`welcome pid=${msg.pid} anchor=(${absX},${absY})`);
      }
    } else if (msg.type === 'tick') {
      for (const pp of msg.players) {
        if (pp.pid === S.myPid && c.role === 'primary') {
          const absX = c.meta.worldOffsetX + pp.x, absY = (c.meta.worldOffsetY || 0) + pp.y;
          // applyServerCorrection 발췌
          const dist = Math.hypot(absX - S.myAbsPredicted.x, absY - S.myAbsPredicted.y);
          S.myAbsPredicted = { x: absX, y: absY };
          if (dist > 2000) { S.pendingInputs.length = 0; S._renderPrev = { x: absX, y: absY }; S._renderCurr = { x: absX, y: absY }; }
          S.lastTickWithMyPidAt = S.now;
        }
      }
    } else if (msg.type === 'player_left') {
      if (FIX && msg.pid && msg.pid === S.myPid) {
        S._selfGone = true; S.myPid = null; S.lastTickWithMyPidAt = 0;
        S.pendingInputs.length = 0; S._predAccum = 0;
        if (S.conns.has(zoneId)) closeConnection(zoneId);
        S.log.push('player_left(self) → 예측 정지 + 재연결 트리거');
        return;
      }
      c.others.delete(msg.pid);
    }
  }

  function ensurePrimaryConnection() {
    if (!S.primaryZoneId) return;
    const c = S.conns.get(S.primaryZoneId);
    if (c && c.ws.readyState <= 1) return;
    if (c) {
      if (FIX) { try { c.ws.close(); } catch (e) {} }
      S.conns.delete(S.primaryZoneId);
    }
    if (FIX) { S.myPid = null; S._selfGone = true; }
    S.log.push('[recover] primary 재연결');
    return connect(S.primaryZoneId, 'primary');
  }
  function checkOrphan() {
    if (!S.primaryZoneId || S.lastTickWithMyPidAt === 0) return;
    if (S.now - S.lastTickWithMyPidAt > 2000) {
      if (FIX) { S._selfGone = true; S.myPid = null; S.pendingInputs.length = 0; S._predAccum = 0; }
      S.lastTickWithMyPidAt = 0;
      if (S.conns.has(S.primaryZoneId)) closeConnection(S.primaryZoneId);
      S.log.push('[recover] orphan 감지 → close');
    }
  }
  // loop() 1프레임: ensurePrimaryConnection → checkOrphan → (예측 스텝)
  function frame(dtMs, wx, wy) {
    S.now += dtMs;
    const steps = Math.max(1, Math.round((dtMs / 1000) / PRED_STEP));
    for (let i = 0; i < steps; i++) predictStep(PRED_STEP, wx, wy);
    ensurePrimaryConnection();
    checkOrphan();
  }
  return { S, connect, closeConnection, handleMessage, ensurePrimaryConnection, checkOrphan, frame, PRED_STEP };
}

// ===== 시나리오 =====
const SPAWN = { x: 50000, y: 50000 };
const FAR = { x: 57376, y: 61120 };  // 임업3 부근(원정 좌표)

function scenario(name, FIX, run) {
  const cl = makeClient(FIX);
  const res = run(cl);
  return { name, FIX, ...res, S: cl.S };
}

// S1: 정상 접속 → 원거리 이동 → 사망(player_left 자기 pid) → 재연결 welcome(스폰)
function s1(cl) {
  const { S } = cl;
  const c = cl.connect('hanbando', 'primary'); c.ws.readyState = 1;
  cl.handleMessage('hanbando', { type: 'welcome', pid: 'p1', zone: S.zonesMeta.hanbando, self: { x: SPAWN.x, y: SPAWN.y }, resources: [] }, c);
  // 원거리까지 걸어감 (서버 tick이 따라옴)
  S.myAbsPredicted = { x: FAR.x, y: FAR.y };
  cl.handleMessage('hanbando', { type: 'tick', players: [{ pid: 'p1', x: FAR.x, y: FAR.y }] }, c);
  // 사망
  cl.handleMessage('hanbando', { type: 'player_left', pid: 'p1' }, c);
  // 사망 후 서버 tick은 내 pid 없음 → 2.5초 경과(이동키 계속 누른 채)
  for (let i = 0; i < 5; i++) cl.frame(500, 0.7071, 0.7071);
  // 새 ws OPEN + welcome(스폰)
  const c2 = S.conns.get('hanbando'); if (c2) c2.ws.readyState = 1;
  cl.handleMessage('hanbando', { type: 'welcome', pid: 'p2', zone: S.zonesMeta.hanbando, self: { x: SPAWN.x, y: SPAWN.y }, resources: [] }, c2);
  cl.frame(16, 0, 0);
  return { pos: S.myAbsPredicted, pid: S.myPid };
}

// S2: player_left 미수신(서버가 조용히 제거) → orphan 워치독 경로만으로 복구되는가
function s2(cl) {
  const { S } = cl;
  const c = cl.connect('hanbando', 'primary'); c.ws.readyState = 1;
  cl.handleMessage('hanbando', { type: 'welcome', pid: 'p1', zone: S.zonesMeta.hanbando, self: { x: FAR.x, y: FAR.y }, resources: [] }, c);
  cl.handleMessage('hanbando', { type: 'tick', players: [{ pid: 'p1', x: FAR.x, y: FAR.y }] }, c);
  for (let i = 0; i < 6; i++) cl.frame(500, 0.7071, 0.7071);   // 3초 무소식 → orphan
  const c2 = S.conns.get('hanbando'); if (c2) c2.ws.readyState = 1;
  cl.handleMessage('hanbando', { type: 'welcome', pid: 'p2', zone: S.zonesMeta.hanbando, self: { x: SPAWN.x, y: SPAWN.y }, resources: [] }, c2);
  cl.frame(16, 0, 0);
  return { pos: S.myAbsPredicted, pid: S.myPid };
}

// S3: 레이스 — 옛 ws가 close 직전 흘린 잔여 tick이 새 welcome 뒤에 도착
function s3(cl) {
  const { S } = cl;
  const cOld = cl.connect('hanbando', 'primary'); cOld.ws.readyState = 1;
  cl.handleMessage('hanbando', { type: 'welcome', pid: 'p1', zone: S.zonesMeta.hanbando, self: { x: FAR.x, y: FAR.y }, resources: [] }, cOld);
  cl.handleMessage('hanbando', { type: 'tick', players: [{ pid: 'p1', x: FAR.x, y: FAR.y }] }, cOld);
  for (let i = 0; i < 6; i++) cl.frame(500, 0, 0);              // orphan → close → 재연결
  const cNew = S.conns.get('hanbando'); cNew.ws.readyState = 1;
  cl.handleMessage('hanbando', { type: 'welcome', pid: 'p2', zone: S.zonesMeta.hanbando, self: { x: SPAWN.x, y: SPAWN.y }, resources: [] }, cNew);
  // ★옛 소켓의 잔여 tick — 하필 서버가 새 pid(p2)를 옛 좌표로 보고하던 프레임이라 가정(최악 케이스)
  cl.handleMessage('hanbando', { type: 'tick', players: [{ pid: 'p2', x: FAR.x, y: FAR.y }] }, cOld);
  cl.frame(16, 0, 0);
  return { pos: S.myAbsPredicted, pid: S.myPid };
}

// S4: 죽은 conn 엔트리 재사용 고착 — connect()가 CLOSED 엔트리를 재사용하면 영영 재연결 안 됨
function s4(cl) {
  const { S } = cl;
  const c = cl.connect('hanbando', 'primary'); c.ws.readyState = 1;
  cl.handleMessage('hanbando', { type: 'welcome', pid: 'p1', zone: S.zonesMeta.hanbando, self: { x: FAR.x, y: FAR.y }, resources: [] }, c);
  cl.handleMessage('hanbando', { type: 'tick', players: [{ pid: 'p1', x: FAR.x, y: FAR.y }] }, c);
  c.ws.readyState = 3;                       // 소켓만 죽고 엔트리는 남은 상태(onclose 유실)
  S.conns.set('hanbando', c);
  // connect()를 직접 호출하는 경로(핸드오프·이웃 승격 등)에서 죽은 엔트리를 만나는 케이스
  cl.connect('hanbando', 'primary');
  const cur = S.conns.get('hanbando');
  return { newSocket: cur.ws.id !== c.ws.id, wsId: cur.ws.id, oldWsId: c.ws.id, pos: S.myAbsPredicted, pid: S.myPid };
}

const R = [];
for (const [nm, fn] of [['S1 사망→재연결', s1], ['S2 orphan만', s2], ['S3 옛소켓 잔여tick', s3], ['S4 죽은엔트리 재사용', s4]]) {
  R.push(scenario(nm, false, fn));
  R.push(scenario(nm, true, fn));
}

let fail = 0;
console.log('=== T1 재앵커 검증 하네스 ===');
console.log(`스폰=(${SPAWN.x},${SPAWN.y})  원거리=(${FAR.x},${FAR.y})\n`);
for (const r of R) {
  const tag = r.FIX ? 'FIX ' : 'PRE ';
  if (r.name.startsWith('S4')) {
    const ok = r.FIX ? r.newSocket === true : true;
    console.log(`${tag}${r.name}: 새 소켓 생성=${r.newSocket} (old ws#${r.oldWsId} → ws#${r.wsId})  pos=(${r.pos.x.toFixed(0)},${r.pos.y.toFixed(0)})`);
    if (r.FIX && !ok) { fail++; console.log('   ✗ FIX인데 새 소켓이 안 생김'); }
    if (!r.FIX && r.newSocket) console.log('   (참고: PRE에서도 생성됨)');
    else if (!r.FIX) console.log('   ↑ PRE: 죽은 엔트리 재사용 → 영구 유령 고착 재현');
    continue;
  }
  const d = Math.hypot(r.pos.x - SPAWN.x, r.pos.y - SPAWN.y);
  const ghost = d > 1;
  console.log(`${tag}${r.name}: pos=(${r.pos.x.toFixed(0)},${r.pos.y.toFixed(0)}) pid=${r.pid} 스폰과의 거리=${d.toFixed(0)}px ${ghost ? '← 유령(불일치)' : '← 스폰 수렴 ✓'}`);
  if (r.FIX && ghost) { fail++; console.log('   ✗ FIX인데 스폰으로 수렴하지 않음'); }
}
console.log('');
console.log(fail === 0 ? '결과: PASS — FIX 전 시나리오에서 myAbsPredicted가 스폰으로 수렴, 새 소켓 생성 보장' : `결과: FAIL (${fail}건)`);
process.exit(fail === 0 ? 0 : 1);
