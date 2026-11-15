
// [T1322 진단 둘 · 제품 아님] 걸음 사이 쓰기 — 몸 1/32 표본의 걸음 판정 칸을 접근자로 덫(사전 모드 · 진단 몫) · 그 몸의 걸음 밖에서 값이 바뀌면 칸 · 부른 자리(스택 셋)를 센다
if (process.env.T1322_WR) { (function () {
  const OUT = process.env.T1322_WR, fs = require('fs');
  const F = ['canadiaVillage', 'nextDecisionAt', 'simEvacUntil', 'behavior', 'npcHomeX', 'npcHomeY', 'npcBedX', 'npcBedY', 'simLonOff', '_t720', 'targetX', 'targetY', 'gatherTarget', 'harvestTarget',
    'canadiaTask', 'path', '_t791P', '_t791Pn', '_t791Px', '_t791Py', 'pathIndex', 'x', 'y', '_t670TkX', '_t670TkY', '_t670Tk', '_pathFor', '_stuckN', 'vx', 'vy', 'hp', '_stuckPos', 'handingOff', 'floor'];
  let cur = null; const W = {}, trapped = new WeakSet(), stand = new WeakMap();
  const S = { trapped: 0, steps: 0, standSteps: 0 };
  const stk = () => new Error().stack.split('\n').slice(3, 6).map((s) => s.trim().replace(/^at /, '').replace(/\(?\/.*\/(server|sim|scripts)\//, '($1/').replace(/:\d+\)?$/, ')')).join(' < ');
  function trap(p) {
    trapped.add(p); S.trapped++;
    for (const k of F) { let v = p[k];
      Object.defineProperty(p, k, { get() { return v; }, set(n) { if (cur !== p && !Object.is(n, v)) { const st = stand.get(p) ? 'S' : 'w'; const key = st + ' ' + k + ' | ' + stk(); W[key] = (W[key] || 0) + 1; } v = n; }, enumerable: true, configurable: true }); }
  }
  const isStand = (npc, now) => !npc.canadiaVillage && now < npc.nextDecisionAt && npc.behavior !== 'fight' && typeof npc.targetX === 'number' && npc.path && npc.path === npc._t791P && npc._t791Pn === 1 && npc.pathIndex >= 1
    && Object.is(npc._t791Px, npc.targetX) && Object.is(npc._t791Py, npc.targetY) && _t671Lt(npc.targetX - npc.x, npc.targetY - npc.y, 10);
  const f0 = npcStep;
  npcStep = function (npc, dt, now) {
    let h = 0; const pid = npc.pid || ''; for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) | 0;
    if ((h & 31) !== 5) return f0(npc, dt, now);
    if (!trapped.has(npc)) trap(npc);
    S.steps++; const pc = cur; cur = npc;
    try { return f0(npc, dt, now); } finally { cur = pc; const s = isStand(npc, now); stand.set(npc, s); if (s) S.standSteps++; }
  };
  setInterval(() => { try { fs.writeFileSync(OUT, JSON.stringify({ S, W })); } catch (e) {} }, 20000).unref();
})(); }
