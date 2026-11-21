#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1402 덧붙임 판정 22 ⓒ 판 · 판정 0 — 고르는 것은 재민)
// === scripts/t1402-nohome-sim.js — 본거지가 없을 때 두 후보: ㉮ 'one'(PM 안 · 기본) / ㉯ 'none' — 누가 어디에 새 칸을 붙일 수 있나 ==========
//
// ★무엇: 존 정본(`tryClaim` · `T1402_SPLIT_OK=1` · `T1402_NOHOME` 둘)을 띄워 꼴 다섯을 그대로 해 본다(아이 판 둘 · 땅 · 집은 판이 놓는다).
//   ㉮ 'one' — 본거지를 안 골랐거나 고른 집이 없어졌으면: 내 땅 위 집이 하나뿐이면 그 집이 든 조각 · 집이 없거나 둘 이상이면 종전(내 땅 어디든 · 떨어진 조각도).
//   ㉯ 'none' — 본거지가 없으면 어느 조각에도 못 붙인다(첫 칸만 · 온보딩 빈터 · 첫 집터 · 이어받기는 종전 그대로).
//   node scripts/t1402-nohome-sim.js [--json <파일>]
if (require.main === module) require('./lib-port').noCentral();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
if (process.env.__T1402N) {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1305_DEEDS: '1', T1402_SPLIT_OK: '1' });
  const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const H = require(path.join(ROOT, 'server', 'zone.js')).__testBind();
  console.log = _l;
  const SZ = H.BUILDING_SIZE, out = {};
  let n = 0;
  const mk = () => { const msgs = []; const p = { pid: 'p_n' + n, playerId: 't1402n' + n, name: 'n' + n, persistent: false, ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } }, msgs, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {} }; n++; H.players.set(p.pid, p); H._t1305Day(p); return p; };
  const live = (p) => [...H.claims.values()].filter((c) => c.ownerPid === p.playerId && c.kind === 'personal' && (c.state || 'active') !== 'free').length;
  const claim = (p, x, y) => { const b = live(p); p.msgs.length = 0; p.x = x * SZ + SZ / 2; p.y = y * SZ + SZ / 2; H.tryClaim(p, 'personal'); const t = p.msgs.filter((m) => m.type === 'notice').map((m) => m.text).pop() || ''; return live(p) === b + 1 ? '됨' : '거절(' + t.slice(0, 18) + '…)'; };
  let cid = 0;   // 땅을 놓는 손 — 판의 차림은 넓히기 문을 안 지나게 칸 행을 바로 놓는다(재는 것은 그 뒤의 넓히기 한 칸)
  const put1 = (p, x, y) => { const id = 'c_n' + (cid++); H.claims.set(id, { id, ownerPid: p.playerId, ownerName: p.name, x: x * SZ, y: y * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' }); };
  const rect = (p, X, Y, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put1(p, X + x, Y + y); };
  const hut = (p, cx, cy) => H._liveBuildRow('hut', (cx + 1.5) * SZ, (cy + 1.5) * SZ, { owner: p.playerId, floor: 0, small: 1 }, p.playerId, '간이 움집', null);
  const cut = (p, x, y) => { const c = [...H.claims.values()].find((q) => q.ownerPid === p.playerId && Math.floor(q.x / SZ) === x && Math.floor(q.y / SZ) === y); H.handlePlayerInput(p, JSON.stringify({ type: 'unclaim', claimId: c.id, split: 1 })); };
  let X = 64000;
  { const p = mk(); put1(p, X, 64000); out.s1 = claim(p, X + 1, 64000); X += 40; }                               // ⓐ 첫 칸 하나 · 집 없음
  { const p = mk(); rect(p, X, 64000, 3, 3); hut(p, X, 64000); out.s2 = claim(p, X + 3, 64000); X += 40; }          // ⓑ 집 하나 · 안 고름
  { const p = mk(); rect(p, X, 64000, 3, 3); put1(p, X + 3, 64001); rect(p, X + 4, 64000, 3, 3); hut(p, X, 64000); hut(p, X + 4, 64000); cut(p, X + 3, 64001);
    out.s3a = claim(p, X, 64003); out.s3b = claim(p, X + 7, 64000); X += 40; }                                       // ⓒ 집 둘이 두 조각에 · 안 고름 · 떨어진 뒤
  { const p = mk(); rect(p, X, 64000, 3, 3); put1(p, X + 3, 64001); rect(p, X + 4, 64000, 3, 3); const A = hut(p, X, 64000); hut(p, X + 4, 64000);
    H.handlePlayerInput(p, JSON.stringify({ type: 'deeds_home', buildingId: A.id })); cut(p, X + 3, 64001); cut(p, X + 1, 64001);   // 복도를 끊고 · 본거지 A 의 발자국 칸을 내놓음 → A 는 본거지가 못 된다
    out.s4a = claim(p, X, 64003); out.s4b = claim(p, X + 7, 64000); X += 40; }                                       // ⓓ 고른 집이 없어짐(집 하나 남음 — B)
  { const p = mk(); rect(p, X, 64000, 3, 3); put1(p, X + 3, 64001); rect(p, X + 4, 64000, 3, 3); cut(p, X + 3, 64001);
    out.s5a = claim(p, X, 64003); out.s5b = claim(p, X + 7, 64000); X += 40; }                                       // ⓔ 집 없이 땅만 둘로 갈라짐
  console.log('@@T1402N ' + JSON.stringify(out));
  process.exit(0);
}
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const run = (mode) => {
  const db = require('./lib-tmp').file('t1402n_' + mode, '.db');
  let o = ''; try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1402N: '1', T1402_NOHOME: mode, DB_PATH: db, PORT: String(require('./lib-port').port(37790)) }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 }); } catch (e) { o = String((e && e.stdout) || ''); }
  const m = /@@T1402N (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : {};
};
const A = run('one'), B = run('none');
const ROWS = [
  ['s1', 'ⓐ 첫 칸 하나 · 집 없음 → 옆 칸'],
  ['s2', 'ⓑ 3×3 · 간이 움집 하나 · 본거지 안 고름 → 옆 칸'],
  ['s3a', 'ⓒ 두 조각에 집 하나씩 · 안 고름 → 왼 조각 옆'], ['s3b', 'ⓒ 〃 → 오른 조각 옆'],
  ['s4a', 'ⓓ 두 조각 · 고른 집(왼)의 발자국을 내놓아 본거지가 풀림 · 오른 조각에 집 하나 남음 → 왼 조각 옆'], ['s4b', 'ⓓ 〃 → 오른 조각 옆'],
  ['s5a', 'ⓔ 집 없이 땅이 둘로 갈라짐 → 왼 조각 옆'], ['s5b', 'ⓔ 〃 → 오른 조각 옆'],
];
console.log('=== T1402 본거지가 없을 때 — ㉮ one(PM 안 · 기본) / ㉯ none ===');
console.log('| 꼴 | ㉮ one | ㉯ none |');
console.log('|---|---|---|');
for (const [k, name] of ROWS) console.log(`| ${name} | ${A[k] || '-'} | ${B[k] || '-'} |`);
const J = arg('--json', null); if (J) fs.writeFileSync(J, JSON.stringify({ one: A, none: B }, null, 1));
