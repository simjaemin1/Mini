#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T890 끔 A/B · 일회 확인)
// === scripts/t890-takeover-ab.js — `T890_TAKEOVER_BODY=0`(끔)이 종전 승계와 **같은 사람 객체**를 만드나 ===
//   승계 블록(`if (_takeover) {` … T202 주석 앞) 글자를 종전 판(`git show f0575c8d:server/zone.js` — 이 카드 바로 앞 합친 판)과 지금 판에서 **그대로 떼어**
//   같은 입력 144가지(기준일 셋 × 소속 셋 × 쓰러짐 둘 × 정해진 깨어남 둘 × HP 둘 × 브리핑 표 둘)에 돌려 키 차례 + 값(JSON)을 견준다.
//   미끼: 지금 판에서 소속 보강 한 줄을 뺀 사본에는 자가 문다(자명 통과 0).
//   쓰는 법: node scripts/t890-takeover-ab.js
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OLD_SRC = execSync('git show f0575c8d:server/zone.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const NEW_SRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const cut = (src) => { const a = src.indexOf('  if (_takeover) {\n    player.x = _takeover.x;'); const b = src.indexOf('  //   ★★[T202 2026-09-12]', a); return src.slice(a, b); };
const mk = (body) => new Function('player', '_takeover', 'T890_TAKEOVER_BODY', 'setHp', 'name', 'playerId', 'ZONE_ID', 'parseBody', 'serializeBody', '_bodyInto',
  'let sx = 0, sy = 0; const console = { log() {} };\n' + body + '\nreturn player;');
const OLD = mk(cut(OLD_SRC)), NEW = mk(cut(NEW_SRC));
const setHp = (p, v) => { const m = p.maxHp || 100; p.hp = Math.max(0, Math.min(m, v)); };
const base = () => ({ pid: 'p1', x: 1, y: 2, inventory: { a: 1 }, toolItems: [{ id: 't0' }], equipped: 'e0', hotkey1: null, equipment: [], equipSlots: {}, craftSkill: {}, craftLog: {},
  oreLedger: {}, oreCarry: {}, fishStats: null, kgLedger: null, lots: null, body: null, lastSeenDay: 5, member: { vid: 1 }, hp: 100, maxHp: 100, isDown: false, downedAt: 0, hunger: 50, thirst: 60, vp: 0, floor: 0 });
const T = [];
for (const lsd of [undefined, null, 9]) for (const mem of [undefined, null, { vid: 2 }]) for (const down of [false, true]) for (const dead of [0, 123]) for (const hp of [undefined, 37]) for (const brief of [false, true])
  T.push({ x: 10, y: 20, floor: 1, inventory: { b: 2 }, toolItems: [{ id: 't1' }], equipped: undefined, hotkey1: 'h', equipment: [1], equipSlots: { w: 1 }, craftSkill: { m: 1 }, oreLedger: { i: 1 }, oreCarry: { i: 0.1 },
    kgLedger: { f: [1] }, lots: { f: [{ d: 1 }] }, lastSeenDay: lsd, member: mem, isDown: down, downedAt: down ? 77 : 0, _deadUntil: dead, _wakeSpot: dead ? { x: 1 } : undefined, hp, hunger: 11, thirst: 22, vp: 3, _returnBriefDone: brief });
let same = 0;
for (const t of T) { const a = OLD(base(), t, false, setHp), b = NEW(base(), t, false, setHp); if (JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(b)) && JSON.stringify(a) === JSON.stringify(b)) same++; }
// 미끼 — 새 판에서 종전 줄 하나(소속 보강)를 뺀 사본에는 자가 문다
const decoy = mk(cut(NEW_SRC).replace(/^    if \(_takeover\.member\) player\.member = _takeover\.member;.*$/m, ''));
let bite = 0; for (const t of T) { const a = OLD(base(), t, false, setHp), b = decoy(base(), t, false, setHp); if (JSON.stringify(a) !== JSON.stringify(b)) bite++; }
const okAll = same === T.length && bite > 0;
console.log(`끔 A/B 같음 ${same}/${T.length} · 미끼(소속 보강 한 줄 뺌) 문다 ${bite}/${T.length}`);
process.exit(okAll ? 0 : 1);
