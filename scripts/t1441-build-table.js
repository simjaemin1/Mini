#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1441 ① 짓기 문 표 · 판정 0)
// === scripts/t1441-build-table.js — 짓기 문 열 자리 × (그 마을 사람 / 남의 마을 사람 / 마을 없는 사람) × (마을 땅 안 제 사유지 / 마을 땅 안 사유지 밖 / 마을 땅 밖) = 지금 서는가 ==========
//   존 정본 손(`_tryBuildAt` · `tryHutStart` · `_t1392HutStart` · `tryFurnaceStart` · `tryShelterStart` · `tryRequestVillageHouse` · `tryBuildGuildGranary` · `tryClaim` · `_t1392Check`)을
//   끔(종전) · 켬(`T1441_NO_OUTSIDER_BUILD=1`) 두 판에서 그대로 부른다 — 마을은 시험 마을(판 동안 `villageOfCell` 을 갈아 끼운다) · 재료 · 도구는 넉넉히.
//   칸 답 = 섬 · 거절(마을 땅 — T1441) · 거절(그 밖 까닭 — 첫 글자). 같은 사람 · 같은 자리가 두 판에서 갈리는 칸만 T1441 이 바꾼 자리다.
//   node scripts/t1441-build-table.js [--json 파일] [--txt 파일]
if (require.main === module) require('./lib-port').noCentral();
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
if (process.env.__T1441T) {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1065_TOOL_GATE: '0' });
  const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const H = require(path.join(ROOT, 'server', 'zone.js')).__testBind();
  console.log = _l;
  const SV = H.SimVillages, SZ = H.BUILDING_SIZE;
  const X = 72000, Y = 72000;
  const PV = { dbId: 9001, name: '갑마을', ccx: X + 10, ccy: Y + 10, econ: { founder: 't_chief' }, _kin: { chief: 't_chief', wars: new Set() } };
  const EV = { dbId: 9003, name: '병마을', ccx: X + 300, ccy: Y + 300, econ: { founder: 't_e' }, _kin: { chief: 't_e', wars: new Set() } };
  SV.villageOfCell = (cx, cy) => (cx >= X && cx < X + 2000 && cy >= Y && cy < Y + 40 ? PV : null);
  SV.villageByDbId = (id) => ({ 9001: PV, 9003: EV })[id | 0] || null;
  SV.clientVillages = () => [{ id: 9001, name: '갑마을' }, { id: 9003, name: '병마을' }];
  let n = 0, cid = 0;
  const mk = (name, vid) => { const msgs = []; const p = { pid: 'p_t' + n, playerId: 't_' + name + n, name, persistent: false, lastSeen: Date.now() + 864e5, ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } }, msgs,
    x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, vp: 0, inventory: { wood: 9999, stone: 9999, plank: 9999, fiber: 999, clay: 999 }, toolItems: [{ id: 'h' + n, type: 'hammer', d: 100, max: 100 }, { id: 's' + n, type: 'shovel', d: 100, max: 100 }, { id: 'k' + n, type: 'pickaxe', d: 100, max: 100 }], equipment: [], equipSlots: {}, craftSkill: {} };
    if (vid) p.member = { zone: 'hanbando', vid, name: vid === 9001 ? '갑마을' : '병마을', since: 0 };
    n++; H.players.set(p.pid, p); return p; };
  const put1 = (p, x, y) => { const id = 'c_t' + (cid++); H.claims.set(id, { id, ownerPid: p.playerId, ownerName: p.name, x: x * SZ, y: y * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' }); };
  const rect = (p, x0, y0, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put1(p, x0 + x, y0 + y); };
  const who = { member: 9001, other: 9003, none: 0 };
  const out = {};
  const note = (p) => (p.msgs.filter((m) => m.type === 'notice').map((m) => m.text).pop() || '');
  const at = (p, x, y) => { p.x = x * SZ + SZ / 2; p.y = y * SZ + SZ / 2; };
  const GATES = [
    ['fence', '칸 건물(울타리 — `_tryBuildAt`)', (p, x, y) => { at(p, x, y); return !!H._tryBuildAt(p, 'fence', 0, null, 'N', { skipCost: true }); }],
    ['wall', '벽(변 — `_tryBuildAt`)', (p, x, y) => { at(p, x, y); p.y -= 10; return !!H._tryBuildAt(p, 'wall', 0, 'N', null, { skipCost: true }); }],
    ['door', '문(변 — `_tryBuildAt`)', (p, x, y) => { at(p, x + 1, y); p.y -= 10; return !!H._tryBuildAt(p, 'door', 0, 'N', null, { skipCost: true }); }],
    ['hut', '움집터 6×4(`tryHutStart`)', (p, x, y) => { const b = H.buildings.size; p.x = (x + 3) * SZ; p.y = (y + 2) * SZ; H.tryHutStart(p, (x + 3) * SZ, (y + 2) * SZ, 'pit'); return H.buildings.size > b; }],
    ['smallhut', '간이 움집 3×3(`_t1392HutStart`)', (p, x, y) => { const b = H.buildings.size; p.x = (x + 1) * SZ + 16; p.y = (y + 1) * SZ + 16; if (H._t1392HutStart) H._t1392HutStart(p, p.x, p.y); return H.buildings.size > b; }],
    ['furnace', '시설 터 2×2(노 — `tryFurnaceStart` → `_siteStart`)', (p, x, y) => { const b = H.buildings.size; p.x = x * SZ + SZ; p.y = y * SZ + SZ; H.tryFurnaceStart(p, x * SZ + SZ, y * SZ + SZ, 'furnace'); return H.buildings.size > b; }],
    ['shelter', '쉼터 지붕 6×4(`tryShelterStart`)', (p, x, y) => { const b = H.buildings.size; p.x = (x + 3) * SZ; p.y = (y + 3) * SZ; H.tryShelterStart(p, p.x, p.y); return H.buildings.size > b; }],
    ['house', '집 의뢰 6×4(`tryRequestVillageHouse`)', (p, x, y) => { const b = H.buildings.size; p.x = (x + 3) * SZ; p.y = (y + 3) * SZ; try { H.tryRequestVillageHouse(p, p.x, p.y); } catch (e) {} return H.buildings.size > b; }],
    ['granary', '마을 곳간 5×3(`tryBuildGuildGranary`)', async (p, x, y) => { const b = H.buildings.size; p.x = (x + 2) * SZ; p.y = (y + 1) * SZ; try { await H.tryBuildGuildGranary(p, p.x, p.y); } catch (e) {} return H.buildings.size > b; }],
    ['claimP', '사유지 한 칸 개인(`tryClaim` — 제 땅 곁 칸)', (p, x, y) => { at(p, x + 3, y); const b = H.claims.size; H.tryClaim(p, 'personal'); return H.claims.size > b; }],
    ['claimT', '사유지 한 칸 임시(`tryClaim` — 제 땅 곁 칸)', (p, x, y) => { at(p, x + 3, y); const b = H.claims.size; H.tryClaim(p, 'temporary'); return H.claims.size > b; }],
    ['lot', '첫 집터 아홉 칸(`_t1392Cells` 까닭 — 제 땅 곁)', (p, x, y) => { const c = H._t1392Cells(p.playerId, x + 5, y + 1); return c.every((q) => !q.why) ? true : ('까닭 ' + [...new Set(c.filter((q) => q.why).map((q) => q.why))].join(',')); }],
  ];
  (async () => {
    let gx = 0;
    for (const [gk, gname, fn] of GATES) {
      out[gk] = { name: gname };
      for (const [wk, vid] of Object.entries(who)) {
        for (const where of ['own', 'land', 'out']) {
          const p = mk(wk, vid);
          //   자리 — 마을 땅 안(갑마을 [X, X+40)) · 밖(X − 60) · 제 사유지면 8×8 를 미리 잡아 둔다
          const bx = (where === 'out' ? X - 2000 : X + 4) + gx * 14, by = Y + 4;   // 자리마다 따로(14칸 간격 · 앞 판 것과 안 겹친다)
          gx++;
          if (where === 'own') rect(p, bx, by, 3, 3);   // 제 사유지 3×3(사유지 한 칸 · 첫 집터 줄은 그 곁 칸을 묻는다)
          p.msgs.length = 0;
          let r; try { r = await fn(p, bx, by); } catch (e) { r = '오류 ' + String(e && e.message).slice(0, 40); }
          const t = note(p);
          out[gk][wk + '|' + where] = r === true ? '섬' : (/마을 사람이 아니면/.test(t) || r === '까닭 foreign' ? '거절(마을 땅)' : (typeof r === 'string' ? r : '거절(' + (t ? t.slice(0, 26) : '알림 없음') + ')'));
        }
      }
    }
    console.log('@@T1441T ' + JSON.stringify(out));
    process.exit(0);
  })();
  return;
}
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const run = (on) => {
  const db = require('./lib-tmp').file('t1441t_' + (on ? 'on' : 'off'), '.db');
  let o = ''; try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1441T: '1', DB_PATH: db, PORT: String(require('./lib-port').port(38440)) }, on ? { T1441_NO_OUTSIDER_BUILD: '1' } : {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 }); } catch (e) { o = String((e && e.stdout) || ''); }
  const m = /@@T1441T (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : {};
};
const OFF = run(false), ON = run(true);
const W = { member: '그 마을 사람', other: '남의 마을 사람', none: '마을 없는 사람' }, P = { own: '땅 안 제 사유지', land: '땅 안 사유지 밖', out: '땅 밖' };
const lines = ['=== 짓기 문 표 — 칸 = 끔(종전) → 켬(T1441_NO_OUTSIDER_BUILD) · 같으면 한 번 ===', ''];
const cols = []; for (const w of Object.keys(W)) for (const p of Object.keys(P)) cols.push(w + '|' + p);
lines.push('| 짓기 | ' + cols.map((c) => W[c.split('|')[0]] + ' · ' + P[c.split('|')[1]]).join(' | ') + ' |');
lines.push('|---|' + cols.map(() => '---').join('|') + '|');
for (const k of Object.keys(OFF)) lines.push(`| ${OFF[k].name} | ` + cols.map((c) => (OFF[k][c] === (ON[k] || {})[c] ? OFF[k][c] : `${OFF[k][c]} → **${(ON[k] || {})[c]}**`)).join(' | ') + ' |');
const txt = lines.join('\n'); console.log(txt);
const J = arg('--json'); if (J) fs.writeFileSync(J, JSON.stringify({ off: OFF, on: ON }, null, 1));
const T = arg('--txt'); if (T) fs.writeFileSync(T, txt + '\n');
