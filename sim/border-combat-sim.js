#!/usr/bin/env node
// === sim/border-combat-sim.js — 경계 전투 권위 모델 검증 (Phase 5-I) ===
//
// 검증 질문: 한반도(한국 DC)와 닛폰(일본 DC)이 물리적으로 떨어진 두 서버일 때,
// 경계 근처에서 화살을 쏘면 양쪽 서버가 일관된 결론에 수렴하는가?
//
// 권위 모델: favor-the-shooter (FPS 표준)
//   - 발사체는 쏜 사람의 zone 서버가 끝까지 시뮬레이션(궤적 권위).
//   - 히트 판정도 발사자 서버가, 자기가 본 대상 위치(= observer로 받은 지연된 값)로.
//   - 히트 시 대상의 zone 서버에 HTTP로 데미지 통보 → 대상 서버가 자기 HP 권위 갱신.
//   - 즉 "데미지 사실"의 권위는 발사자, "HP 상태"의 권위는 피격자. 단일 권위라 발산 없음.
//
// 모델링:
//   - 두 서버는 각자 TICK_MS(33ms=30Hz)로 진행.
//   - 서버 간 메시지(위치 스냅샷, 데미지 통보)는 편도 LATENCY_MS 후 도착.
//   - 각 서버는 상대 zone 플레이어를 'ghost'로 보유 — 마지막 수신 스냅샷 + 보간.
//   - 화살: 발사자 서버에서 등속 직선. 매 틱 ghost(대상)와 히트 검사.
//
// 사용: node sim/border-combat-sim.js [latencyMs=30]

'use strict';

const LAT = parseInt(process.argv[2] || '30', 10); // 편도 지연(ms)
const TICK = 33;          // 서버 틱 (30Hz)
const ARROW_SPEED = 600 / 1000; // px/ms (600px/s)
const HIT_RADIUS = 40;    // 화살 명중 반경(px)
const ARROW_DMG = 25;

let now = 0;              // 글로벌 가상 시계(ms)
const mailbox = [];       // {deliverAt, to, msg} — 서버 간 지연 메시지 큐

function send(toServer, msg) { mailbox.push({ deliverAt: now + LAT, to: toServer, msg }); }
function pump() { // 도착한 메시지 배달
  for (let i = mailbox.length - 1; i >= 0; i--) {
    if (mailbox[i].deliverAt <= now) { const m = mailbox[i]; mailbox.splice(i, 1); m.to.recv(m.msg); }
  }
}

// === 서버 모델 ===
class ZoneServer {
  constructor(name) {
    this.name = name;
    this.players = {};   // 자기 zone 권위 플레이어: id -> {x,y,vx,vy,hp}
    this.ghosts = {};    // 이웃 zone 플레이어 사본: id -> {x,y,vx,vy, recvAt}
    this.arrows = [];    // 자기 서버 권위 화살: {id,x,y,vx,vy,owner,targetId,alive}
    this.peer = null;
    this.hitLog = [];    // 이 서버가 판정한 히트: {arrowId, targetId, at}
    this.dmgApplied = []; // 이 서버가 자기 플레이어에 적용한 데미지: {targetId, dmg, at}
    this.lastSnapAt = -1e9;
  }
  addPlayer(id, x, y, vx = 0, vy = 0) { this.players[id] = { x, y, vx, vy, hp: 100 }; }
  recv(msg) {
    if (msg.type === 'snapshot') { // 이웃 서버가 보낸 자기 플레이어 위치
      for (const [id, s] of Object.entries(msg.players)) this.ghosts[id] = { ...s, recvAt: now };
    } else if (msg.type === 'damage') { // 발사자 서버가 통보한 데미지 (내 플레이어가 맞음)
      const p = this.players[msg.targetId];
      if (p && p.hp > 0) { p.hp = Math.max(0, p.hp - msg.dmg); this.dmgApplied.push({ targetId: msg.targetId, dmg: msg.dmg, at: now }); }
    }
  }
  fireArrow(ownerId, targetId, aimX, aimY) {
    const o = this.players[ownerId]; if (!o) return;
    const dx = aimX - o.x, dy = aimY - o.y, L = Math.hypot(dx, dy) || 1;
    this.arrows.push({ id: `${this.name}_a${this.arrows.length}`, x: o.x, y: o.y, vx: dx / L * ARROW_SPEED, vy: dy / L * ARROW_SPEED, owner: ownerId, targetId, alive: true, ttl: 4000 });
  }
  tick(dt) {
    // 1) 자기 플레이어 이동 (권위)
    for (const p of Object.values(this.players)) { p.x += p.vx * dt; p.y += p.vy * dt; }
    // 2) ghost 외삽 (마지막 스냅샷 + 속도 보간 — 지연 보상)
    for (const g of Object.values(this.ghosts)) { g.x += g.vx * dt; g.y += g.vy * dt; }
    // 3) 화살 이동 + 히트 검사 (발사자가 본 ghost 위치 기준 = favor-the-shooter)
    for (const a of this.arrows) {
      if (!a.alive) continue;
      a.x += a.vx * dt; a.y += a.vy * dt; a.ttl -= dt;
      if (a.ttl <= 0) { a.alive = false; continue; }
      const tgt = this.ghosts[a.targetId] || this.players[a.targetId];
      if (tgt && Math.hypot(a.x - tgt.x, a.y - tgt.y) < HIT_RADIUS) {
        a.alive = false;
        this.hitLog.push({ arrowId: a.id, targetId: a.targetId, at: now });
        // 대상이 내 zone이면 직접, 이웃이면 통보
        if (this.players[a.targetId]) { const p = this.players[a.targetId]; p.hp = Math.max(0, p.hp - ARROW_DMG); this.dmgApplied.push({ targetId: a.targetId, dmg: ARROW_DMG, at: now }); }
        else { send(this.peer, { type: 'damage', targetId: a.targetId, dmg: ARROW_DMG }); }
      }
    }
    // 4) 주기적 스냅샷 송신 (자기 플레이어 위치를 이웃에)
    if (now - this.lastSnapAt >= TICK) {
      this.lastSnapAt = now;
      const snap = {}; for (const [id, p] of Object.entries(this.players)) snap[id] = { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
      send(this.peer, { type: 'snapshot', players: snap });
    }
  }
}

// === 시나리오 ===
function run(scenario) {
  now = 0; mailbox.length = 0;
  const KR = new ZoneServer('한국'), JP = new ZoneServer('일본');
  KR.peer = JP; JP.peer = KR;
  scenario(KR, JP);
  // 8초 시뮬
  const events = scenario._events || [];
  for (let t = 0; t < 8000; t += TICK) {
    now = t;
    for (const e of events) if (!e.done && now >= e.at) { e.done = true; e.fn(KR, JP); }
    pump();          // 메시지 배달
    KR.tick(TICK); JP.tick(TICK);
  }
  // 잔여 메시지 배달 (지연 중인 데미지 통보 등)
  for (let t = 8000; t < 8000 + LAT * 3; t += TICK) { now = t; pump(); KR.tick(TICK); JP.tick(TICK); }
  return { KR, JP };
}

let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log(`  PASS ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail || ''}`); } }

console.log(`경계 전투 시뮬 (편도 지연 ${LAT}ms, 왕복 ${LAT*2}ms)\n`);

// --- 시나리오 1: 한국 A가 경계 너머 일본 B를 쏨 (B 정지) ---
console.log('S1. 단방향 사격 (한국 A → 일본 B, B 정지):');
{
  let s = (KR, JP) => {
    KR.addPlayer('A', 69000, 60000);      // 한국 동쪽 경계 근처
    JP.addPlayer('B', 71000, 60000);      // 일본 서쪽 경계 근처 (경계 x=70016)
  };
  s._events = [{ at: 500, fn: (KR) => KR.fireArrow('A', 'B', 71000, 60000) }];
  const { KR, JP } = run(s);
  check('한국이 히트 판정', KR.hitLog.length === 1, JSON.stringify(KR.hitLog));
  check('일본 B HP 감소', JP.players.B.hp === 75, 'hp=' + JP.players.B.hp);
  check('데미지 1회만 적용 (중복 없음)', JP.dmgApplied.length === 1, JSON.stringify(JP.dmgApplied));
}

// --- 시나리오 2: 이동 표적이 화살 경로를 가로지름 — 발사자 서버 권위 판정 일관성 ---
console.log('\nS2. 이동 표적 (일본 B가 경계를 향해 수평 이동):');
{
  let s = (KR, JP) => {
    KR.addPlayer('A', 69000, 60000);
    JP.addPlayer('B', 71000, 60000, -0.1, 0); // A쪽(서)으로 100px/s — 화살 경로(y=60000)상
  };
  // A는 직선 수평 발사. B가 마주 다가오므로 경로상에서 만남.
  s._events = [{ at: 500, fn: (KR) => KR.fireArrow('A', 'B', 71000, 60000) }];
  const { KR, JP } = run(s);
  check('발사자(한국) 히트 판정', KR.hitLog.length === 1, JSON.stringify(KR.hitLog));
  check('일본 B HP 감소 수렴', JP.players.B.hp === 75, 'hp=' + JP.players.B.hp);
  check('일본은 한국 판정을 수용 (자체 재판정 없음)', JP.hitLog.length === 0 && JP.dmgApplied.length === 1, `hit=${JP.hitLog.length} dmg=${JP.dmgApplied.length}`);
}

// --- 시나리오 3: 양방향 동시 사격 (A→B, B→A) ---
console.log('\nS3. 양방향 동시 교전:');
{
  let s = (KR, JP) => {
    KR.addPlayer('A', 69500, 60000);
    JP.addPlayer('B', 70500, 60000);
  };
  s._events = [
    { at: 500, fn: (KR) => KR.fireArrow('A', 'B', 70500, 60000) },
    { at: 500, fn: (_, JP) => JP.fireArrow('B', 'A', 69500, 60000) },
  ];
  const { KR, JP } = run(s);
  check('A HP 감소 (일본이 판정→한국 통보)', KR.players.A.hp === 75, 'hp=' + KR.players.A.hp);
  check('B HP 감소 (한국이 판정→일본 통보)', JP.players.B.hp === 75, 'hp=' + JP.players.B.hp);
  check('각자 데미지 1회만 (양쪽 발산 없음)', KR.dmgApplied.length === 1 && JP.dmgApplied.length === 1,
    `KR=${KR.dmgApplied.length} JP=${JP.dmgApplied.length}`);
}

// --- 시나리오 4: 빗나감 (조준 빗나가면 양쪽 다 HP 그대로) ---
console.log('\nS4. 빗나감 (먼 곳 조준):');
{
  let s = (KR, JP) => { KR.addPlayer('A', 69000, 60000); JP.addPlayer('B', 71000, 60000); };
  s._events = [{ at: 500, fn: (KR) => KR.fireArrow('A', 'B', 71000, 65000) }]; // 5000px 빗나간 방향
  const { KR, JP } = run(s);
  check('히트 없음', KR.hitLog.length === 0);
  check('일본 B HP 그대로', JP.players.B.hp === 100, 'hp=' + JP.players.B.hp);
}

console.log(`\n${fail === 0 ? '✅' : '⚠️'} 통과 ${pass} / 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
