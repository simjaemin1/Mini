// === scripts/t485-door.js — 안 문 행렬 한 줄씩(T485 ② · 계측 · 러너 밖) ===
//   node t485-door.js <SEOUL> <TOKYO> [비밀파일] — 비사설 출발지에서 문 여덟을 두드려 상태 코드를 찍는다(비밀 값은 안 찍는다).
const [,, S, T, sf] = process.argv;
const sec = sf ? require('fs').readFileSync(sf, 'utf8').trim() : '';
const doors = [['GET', `http://${S}:3010/zones`, '바깥 · 로비'], ['GET', `http://${S}:3010/player/probe`, '안 · 저장 행 읽기(getPlayer)'], ['POST', `http://${S}:3010/player/probe`, '안 · 저장(savePlayer)'],
  ['POST', `http://${S}:3010/tribe/npc_upsert`, '안 · 마을 길드 등록(부팅)'], ['POST', `http://${T}:3021/handoff_prepare`, '안 · 한반도→닛폰 넘김'], ['POST', `http://${T}:3021/ghost_sync`, '안 · 유령 100ms'],
  ['POST', `http://${S}:3020/handoff_ack`, '안 · 닛폰→한반도 ACK'], ['GET', `http://${T}:3021/health`, '바깥 · 존 health']];
(async () => { for (const [m, u, what] of doors) { let c = '000';
  try { const r = await fetch(u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, sec ? { 'x-zone-secret': sec } : {}), body: m === 'POST' ? '{}' : undefined, signal: AbortSignal.timeout(5000) }); c = r.status; } catch (e) { c = 'ERR'; }
  console.log(`${m.padEnd(4)} ${u.padEnd(44)} → ${c}  (${what})`); } })();
