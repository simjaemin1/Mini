#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T930 A/B · 일회 확인)
// === scripts/t930-bodyinto-ab.js — 몸 얹기(`_bodyInto`)의 HP 한 줄을 문(`setHp`)으로 바꾼 판이 종전과 **같은 사람 객체 · 같은 메시지**를 만드나 ===
//   몸 얹기 함수(`function _bodyInto(p, B, equipped) {` … `return p;` `}`) 글자를 종전 판(`git show <ref>:server/zone.js` · 기본 `origin/main`)과 지금 판에서
//   **그대로 떼어**, 지금 판의 문(`function setHp(p, v, why) {` … `}`)과 `HP_PEER` · `HP_QUIET` 줄도 글자 그대로 떼어(방송 · 보냄만 적는 가짜) 함께 돌린다(t890-takeover-ab 꼴).
//   길 셋 — ⓐ 리터럴 펼침(`{ …, ..._bodyInto({}, B, eq), … }` = 로그인 · 토큰 · 처음 온 사람) · ⓑ 승격(리터럴 `hp: 100 · maxHp: 100` · 소켓 있는 사람 위에 얹기)
//            ⓒ 같은 존 승계(ⓐ 로 선 사람 위에 산 몸을 다시 얹기 — T890 켬 길) — 마다 키 차례 + 값(JSON) + 메시지(방송 · 보냄)를 견준다.
//   입력(닿는 것): 생명값 없음 · null · 빈 칸 · hp 칸 빠짐 · hp 0 · 1 · 37 · 99.5 · 100 · 쓰러짐(시각) · 문자열 hp × 장착 셋 × `T927_BODY_VER` 둘 × 앞 hp(ⓑ 100 · ⓒ 0 · 37 · 100).
//   닿지 않는 입력(저장된 hp 가 0 ~ maxHp 밖 · NaN · maxHp ≠ 100 — HP 를 쓰는 자리가 전부 문이라 생기지 않는다)은 따로 센다: 갈리는 것이 **문의 깎기뿐**인가.
//   미끼 둘(자명 통과 0): 낱말을 조용하지 않은 것(`'food'`)으로 바꾼 사본 — 메시지가 생겨 문다 · 값을 반올림해 넣는 사본 — 99.5 가 갈려 문다.
// 쓰는 법: node scripts/t930-bodyinto-ab.js [--ref origin/main]
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const REF = (() => { const i = argv.indexOf('--ref'); return i >= 0 ? argv[i + 1] : 'origin/main'; })();
const OLD_SRC = execSync(`git show ${REF}:server/zone.js`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const NEW_SRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
function cut(src, head, tail) { const a = src.indexOf(head); if (a < 0) throw new Error('없음: ' + head); const b = src.indexOf(tail, a); if (b < 0) throw new Error('끝 없음: ' + head); return src.slice(a, b + tail.length); }
const bodyInto = (src) => cut(src, 'function _bodyInto(p, B, equipped) {', '\n  return p;\n}');
const SETHP = cut(NEW_SRC, 'function setHp(p, v, why) {', '\n  return next;\n}');
const PEER = cut(NEW_SRC, 'const HP_PEER = new Set([', ']);'), QUIET = cut(NEW_SRC, 'const HP_QUIET = new Set([', ']);');
const MAXHP = +(/const PLAYER_MAX_HP = (\d+);/.exec(NEW_SRC) || [])[1];
function make(bodySrc) {
  return new Function('PLAYER_MAX_HP', 'T927_BODY_VER', 'broadcast', 'send', `${PEER}\n${QUIET}\n${SETHP}\n${bodySrc}\nreturn _bodyInto;`);
}
const OLD_BI = bodyInto(OLD_SRC), NEW_BI = bodyInto(NEW_SRC);
// 몸(`parseBody` 의 꼴 — 칸 이름은 함수가 읽는 그것)
const mkB = (V, sv) => ({ toolItems: [{ id: 't1', type: 'axe', d: 50, max: 100 }], hotkey1: 't1', equipment: [{ type: 'shirt', q: 1 }], equipSlots: { clothes: 'e1' }, craftSkill: { tailoring: 3 },
  craftLog: { shirt: { n: 2, best: 1 } }, oreLedger: { iron_ore: [1.5] }, oreCarry: { iron: 0.25 }, fishStats: { n: 4 }, kgLedger: { fish: [0.8] }, lots: { fish: [{ d: 3, k: 1 }] },
  body: { cold: 0.1, fatigue: 0.2 }, lastSeenDay: 7, member: { vid: 2 }, vital: V, sv });
const REACH = [undefined, null, {}, { maxHp: 100 }, { hp: 0, maxHp: 100 }, { hp: 1, maxHp: 100 }, { hp: 37, maxHp: 100 }, { hp: 99.5, maxHp: 100 }, { hp: 100, maxHp: 100 },
  { hp: 0, maxHp: 100, isDown: true, downedAt: 123456 }, { hp: '50', maxHp: 100 }, { hp: 37 }];
const UNREACH = [{ hp: -5, maxHp: 100 }, { hp: 150, maxHp: 100 }, { hp: NaN, maxHp: 100 }, { hp: 110, maxHp: 120 }, { hp: 50, maxHp: 0 }];
const EQ = [null, 't1', undefined];
function runPath(BI, path_, V, eq, t927, prevHp) {
  const msgs = [];
  const f = make(BI)(MAXHP, t927, (m) => msgs.push(['B', m]), (ws, m) => msgs.push(['S', ws && ws.id, m]));
  let p;
  if (path_ === 'literal') {
    p = { pid: 'p1', playerId: 'u1', ws: { id: 'w1' }, name: 'a', x: 1, y: 2, inventory: { wood: 1 }, tools: {}, ...f({}, mkB(V, 3), eq), hunger: 50, thirst: 60, vp: 0 };
  } else if (path_ === 'promote') {
    p = { pid: 'p2', playerId: 'u1', ws: { id: 'w2' }, name: 'a', x: 1, y: 2, inventory: { wood: 1 }, tools: {}, equipped: 'e0', equipment: [], equipSlots: {}, craftSkill: {}, hp: prevHp, maxHp: 100, hunger: 50 };
    f(p, mkB(V, 4), eq);
  } else {   // takeover — 리터럴로 선 사람(행 몸 · 앞 hp) 위에 산 몸을 다시 얹는다
    p = { pid: 'p3', playerId: 'u1', ws: { id: 'w3' }, name: 'a', ...f({}, mkB({ hp: prevHp, maxHp: 100 }, 1), 'e9'), hunger: 50 };
    msgs.length = 0;   // 앞 얹기의 메시지는 견줄 대상이 아니다(ⓐ 가 잰다) — 다시 얹는 순간부터
    f(p, mkB(V, 5), eq);
  }
  return { keys: Object.keys(p).join(','), json: JSON.stringify(p, (k, v) => (typeof v === 'number' && Number.isNaN(v)) ? 'NaN' : v), msgs: JSON.stringify(msgs) };
}
function compare(BI_A, BI_B, inputs) {
  let n = 0, same = 0, diffKeys = 0, diffMsg = 0, diffVal = [], hpOnly = 0;
  for (const path_ of ['literal', 'promote', 'takeover']) for (const V of inputs) for (const eq of EQ) for (const t927 of [false, true]) for (const prevHp of (path_ === 'literal' ? [null] : path_ === 'promote' ? [100] : [0, 37, 100])) {
    n++;
    const a = runPath(BI_A, path_, V, eq, t927, prevHp), b = runPath(BI_B, path_, V, eq, t927, prevHp);
    if (a.keys === b.keys && a.json === b.json && a.msgs === b.msgs) { same++; continue; }
    if (a.keys !== b.keys) diffKeys++;
    if (a.msgs !== b.msgs) diffMsg++;
    if (a.json !== b.json) {
      const ja = JSON.parse(a.json), jb = JSON.parse(b.json); const ks = Object.keys(ja).filter((k) => JSON.stringify(ja[k]) !== JSON.stringify(jb[k]));
      if (ks.length === 1 && ks[0] === 'hp') hpOnly++;
      if (diffVal.length < 6) diffVal.push(`${path_} ${JSON.stringify(V)} → ${ks.map((k) => `${k} ${JSON.stringify(ja[k])}→${JSON.stringify(jb[k])}`).join(' · ')}`);
    }
  }
  return { n, same, diffKeys, diffMsg, diffVal, hpOnly };
}
console.log(`\n=== T930 — _bodyInto HP 한 줄을 문으로: 종전(${REF}) ↔ 지금 판 · 길 셋 ===`);
ok(OLD_BI !== NEW_BI && /\bp\.hp = \(V && typeof V\.hp === 'number'\)/.test(OLD_BI) && /setHp\(p, \(V && typeof V\.hp === 'number'\) \? V\.hp : PLAYER_MAX_HP, 'takeover'\)/.test(NEW_BI),
  '전제: 종전 판은 직접 대입 · 지금 판은 문(`setHp(…, \'takeover\')`) — 두 글자가 다르다');
ok(/'takeover'/.test(QUIET) && !/'takeover'/.test(PEER), "전제: 'takeover' 는 조용한 낱말(HP_QUIET)이고 방송 낱말(HP_PEER)이 아니다", QUIET.replace(/\s+/g, ' '));
ok(MAXHP === 100, '전제: PLAYER_MAX_HP 정본 글자', String(MAXHP));
{
  const r = compare(OLD_BI, NEW_BI, REACH);
  ok(r.n > 0 && r.same === r.n, `닿는 입력 ${r.n}가지 — 키 차례 · 값(JSON) · 메시지가 다 같다`, `같음 ${r.same}/${r.n}` + (r.diffVal.length ? ' · ' + r.diffVal.join(' | ') : ''));
}
{
  const r = compare(OLD_BI, NEW_BI, UNREACH);
  ok(r.diffKeys === 0 && r.diffMsg === 0 && r.n - r.same === r.hpOnly, `닿지 않는 입력 ${r.n}가지 — 갈리는 것은 hp 칸 하나(문의 깎기 0 ~ maxHp)뿐 · 키 차례 · 메시지 같음`,
    `같음 ${r.same} · hp 만 다름 ${r.hpOnly} · 예: ${r.diffVal.slice(0, 4).join(' | ')}`);
}
{   // 미끼 — 자명 통과 0
  const loud = NEW_BI.replace("PLAYER_MAX_HP, 'takeover')", "PLAYER_MAX_HP, 'food')");
  const r1 = compare(OLD_BI, loud, REACH);
  ok(loud !== NEW_BI && r1.diffMsg > 0, "미끼 ① 낱말을 'food'(방송 낱말)로 바꾼 사본 — 메시지가 생겨 자가 문다", `메시지 다름 ${r1.diffMsg}/${r1.n}`);
  const round = NEW_BI.replace("setHp(p, (V && typeof V.hp === 'number') ? V.hp : PLAYER_MAX_HP, 'takeover')", "setHp(p, Math.round((V && typeof V.hp === 'number') ? V.hp : PLAYER_MAX_HP), 'takeover')");
  const r2 = compare(OLD_BI, round, REACH);
  ok(round !== NEW_BI && r2.diffVal.length > 0, '미끼 ② 값을 반올림해 넣는 사본 — 99.5 가 갈려 자가 문다', r2.diffVal[0] || '');
}
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
