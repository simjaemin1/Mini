#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T546 표 짜는 자 · 제품 무변)
// === scripts/t546-treasury-drift.js — 길드 금고(central `treasury_json`)가 곳간 실물과 어긋나는 길 재현 =========
//   장부 계약(`server/guild-treasury.js`): 곳간 data = 물리 · treasury_json = 총자산 · 불변식 "곳간 ≤ 금고" · 정확히 한 번.
//   `test-guild-treasury` 는 **가짜 central**(성공/throw 둘뿐)로 잰다. 이 자는 **진짜 central + 진짜 central-client** 로
//   계약이 안 보는 길을 밟는다:
//     ⓐ 대조 — 넣고 빼면 금고 = 곳간.
//     ⓑ 해산된 길드 — `tribes` 행이 사라진 뒤(= `/tribe/leave` 가 마지막 멤버에서 하는 그 DELETE 한 줄) 곳간에 넣으면
//        central 은 404 를 **응답**하고, central-client 는 응답을 throw 하지 않으니 `syncGranary` 는 성공으로 보고 `_tr` 을 민다.
//     ⓒ 비밀이 틀린 존 — central 이 `CENTRAL_SECRET` 을 들고 있고 존의 열쇠가 다르면 안 문이 404(`denyOutside` — 문이 있다는 것도 숨긴다)를 **응답**한다 → 같은 삼킴.
//     ⓓ 금고가 0 아래로 못 간다 — central 이 `max(0, …)` 로 누른다. 금고가 곳간보다 작아진 뒤(central DB 복원 · 새 central)
//        빼면 음수 몫이 버려지고, 다시 넣으면 금고가 곳간을 **영영** 못 따라온다.
//     ⓔ 곳간 분해 — 곳간 앵커 `guild_granary` 는 `doDismantleBuilding` 의 형 가드가 없다(상자만 내용물을 돌려준다).
//        영토가 옮겨 가 그 자리가 누구의 땅도 아니면 아무나 부순다 → 물건은 사라지고 금고엔 남는다.
//        (존 안 함수를 예비 적재 겉옷으로 부른다 — `T546_DRIFT_OUT` · t518-one-judge 문법)
//   출력: 경우마다 곳간 Σ · 금고 · 어긋남. 끝줄 `=== 어긋남 재현 n/4 ===`(ⓐ 는 대조라 0 이어야 한다).
'use strict';
const path = require('path');
const fs = require('fs');
if (require.main !== module) {   // ── ⓔ 예비 적재: 존 안에서 곳간을 세우고 부순다 ──
  if (!process.env.T546_DRIFT_OUT) return;
  const Module = require('module');
  const _compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(path.join('server', 'zone.js'))) content += `
;(function () {
  const fs = require('fs'); const OUT = process.env.T546_DRIFT_OUT, TID = +process.env.T546_TRIBE;
  setTimeout(async () => {
    const res = {};
    try {
      const x = 20000, y = 20000;
      const b = _liveBuildRow('guild_granary', x, y, { tribe_id: TID, floor: 0 }, 'tribe_' + TID, '[T546] 곳간', []);
      b.data.wood = 12; b.data.stone = 5;
      const r1 = await GuildTreasury.syncGranary(b, _guildTreasuryOpts());    // 입고 12·5 보고(정상 경로)
      res.reported = r1 && r1.delta;
      let claimed = 0; for (const c of claims.values()) if (b.x >= c.x && b.x < c.x + c.w && b.y >= c.y && b.y < c.y + c.h) claimed++;
      res.claimsHere = claimed;
      const p = { playerId: 't546_bystander', name: '지나가던 이', ws: null, inventory: {}, floor: 0, x: b.x, y: b.y };
      doDismantleBuilding(p, b.id);
      res.gone = !buildings.has(b.id);
      res.dbRows = db.db.prepare("SELECT COUNT(*) AS n FROM buildings WHERE type='guild_granary'").get().n;
      res.bystanderGot = p.inventory;
      await new Promise((r) => setTimeout(r, 500));
      await reconcileGuildGranaries('T546');      // 재동기가 사라진 곳간을 볼 수 있나(없는 행은 못 본다)
    } catch (e) { res.err = String(e && e.stack || e); }
    fs.writeFileSync(OUT, JSON.stringify(res));
  }, 4000);
})();
`;
    return _compile.call(this, content, filename);
  };
  return;
}
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env0 = { ...process.env, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' };
delete env0.CENTRAL_SECRET; delete env0.HTTP_PROXY; delete env0.HTTPS_PROXY; delete env0.http_proxy; delete env0.https_proxy;
const kids = [];
async function up(port, extra, tmp) {
  const c = spawn('node', ['server/central.js'], { cwd: ROOT, env: { ...env0, PORT: String(port), DB_PATH: path.join(tmp, `c${port}.db`), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', ...extra },
    stdio: ['ignore', fs.openSync(path.join(tmp, `c${port}.log`), 'w'), fs.openSync(path.join(tmp, `c${port}.log`), 'a')] });
  kids.push(c);
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('central 안 뜸 ' + port);
}
function client(port, secret) {   // 진짜 central-client — 환경을 바꿔 새로 싣는다(존이 부르는 그 모듈)
  for (const k of Object.keys(require.cache)) if (/server[\\/](central-client|zone-config)\.js$/.test(k)) delete require.cache[k];
  const keep = { h: process.env.CENTRAL_HOST, p: process.env.CENTRAL_PORT, s: process.env.CENTRAL_SECRET };
  process.env.CENTRAL_HOST = '127.0.0.1'; process.env.CENTRAL_PORT = String(port);
  if (secret) process.env.CENTRAL_SECRET = secret; else delete process.env.CENTRAL_SECRET;
  const cc = require(path.join(ROOT, 'server', 'central-client'));
  for (const [k, v] of [['CENTRAL_HOST', keep.h], ['CENTRAL_PORT', keep.p], ['CENTRAL_SECRET', keep.s]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  return cc;
}
const GT = require(path.join(ROOT, 'server', 'guild-treasury'));
const optsOf = (cc) => ({ tribeTreasury: (t, d) => cc.tribeTreasury(t, d), saveData: () => {} });
const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (+v || 0), 0);
async function treasuryOf(cc, tid) { const r = await cc.request('GET', `/tribe/${tid}`); return r.status === 200 ? (r.data.treasury || {}) : { __status: r.status }; }
const rows = [];
function row(tag, what, phys, tr, extra) {
  const trSum = tr && tr.__status ? null : sum(tr);
  const drift = trSum == null ? `금고 없음(${tr.__status})` : (trSum - sum(phys));
  rows.push({ tag, what, phys: JSON.stringify(phys), tr: tr && tr.__status ? `(${tr.__status})` : JSON.stringify(tr), drift, extra: extra || '' });
}
(async () => {
  const tmp = fs.mkdtempSync('/tmp/t546-');
  await up(3810, {}, tmp);
  const cc = client(3810, '');
  // 길드 둘(npc_upsert = 사람 행 없이 길드를 세우는 안 문)
  const A = (await cc.tribeNpcUpsert('T546_대조', 'passive')).tribe_id;
  const B = (await cc.tribeNpcUpsert('T546_해산', 'passive')).tribe_id;
  const D = (await cc.tribeNpcUpsert('T546_바닥', 'passive')).tribe_id;
  // ⓐ 대조
  { const b = { type: 'guild_granary', data: { tribe_id: A } };
    b.data.wood = 10; await GT.syncGranary(b, optsOf(cc)); b.data.wood = 6; await GT.syncGranary(b, optsOf(cc));
    row('ⓐ', '대조 — 넣고(10) 빼면(4)', GT.granaryItems(b.data), await treasuryOf(cc, A)); }
  // ⓑ 해산된 길드
  { const b = { type: 'guild_granary', data: { tribe_id: B } };
    b.data.wood = 7; await GT.syncGranary(b, optsOf(cc));
    const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
    const cdb = new Database(path.join(tmp, 'c3810.db')); cdb.prepare('DELETE FROM tribes WHERE id = ?').run(B); cdb.close();   // = /tribe/leave 마지막 멤버의 그 한 줄
    b.data.wood = 12; const r = await GT.syncGranary(b, optsOf(cc));
    row('ⓑ', '해산된 길드의 곳간에 5 더 넣음', GT.granaryItems(b.data), await treasuryOf(cc, B), `syncGranary ok=${r && r.ok} · _tr=${JSON.stringify(b.data._tr)}(보고했다고 믿음)`); }
  // ⓒ 비밀이 틀린 존
  { await up(3811, { CENTRAL_SECRET: 't546-right' }, tmp);
    const good = client(3811, 't546-right'), bad = client(3811, 't546-wrong');
    const C = (await good.tribeNpcUpsert('T546_열쇠', 'passive')).tribe_id;
    const b = { type: 'guild_granary', data: { tribe_id: C } };
    b.data.wood = 9; const r = await GT.syncGranary(b, optsOf(bad));
    row('ⓒ', '열쇠 틀린 존이 9 넣음', GT.granaryItems(b.data), await treasuryOf(good, C), `syncGranary ok=${r && r.ok} · 안 문 거절 404 를 성공으로 삼킴`); }
  // ⓓ 바닥 0 — 금고가 곳간보다 작아진 뒤(central 복원 흉내: 곳간은 이미 보고했다고 믿는 _tr 을 든다)
  { const b = { type: 'guild_granary', data: { tribe_id: D, wood: 10, _tr: { wood: 10 } } };   // 곳간 10 · 금고 0(새 central)
    b.data.wood = 4; await GT.syncGranary(b, optsOf(cc));   // 6 뺌 → 금고 max(0, 0−6)=0
    b.data.wood = 10; await GT.syncGranary(b, optsOf(cc));  // 6 다시 넣음 → 금고 6
    row('ⓓ', '금고 0 인 채 6 빼고 6 넣음', GT.granaryItems(b.data), await treasuryOf(cc, D), '음수 몫이 버려져 금고가 곳간 −4'); }
  // ⓔ 곳간 분해(존 안)
  { const E = (await cc.tribeNpcUpsert('T546_분해', 'passive')).tribe_id;
    const out = path.join(tmp, 'e.json');
    const z = spawn('node', ['server/zone.js'], { cwd: ROOT, env: { ...env0, PORT: '3820', ZONE_ID: 'hanbando', DB_PATH: path.join(tmp, 'h.db'), CENTRAL_HOST: '127.0.0.1', CENTRAL_PORT: '3810', PUBLIC_HOST: 'localhost',
      T546_DRIFT_OUT: out, T546_TRIBE: String(E), NODE_OPTIONS: '--require=' + __filename }, stdio: ['ignore', fs.openSync(path.join(tmp, 'z.log'), 'w'), fs.openSync(path.join(tmp, 'z.log'), 'a')] });
    kids.push(z);
    for (let i = 0; i < 240 && !fs.existsSync(out); i++) await sleep(500);
    const e = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { err: '결과 없음 — ' + tmp };
    row('ⓔ', '곳간(나무 12·돌 5) 분해 — 영토 밖', e.gone ? {} : { '?': 1 }, await treasuryOf(cc, E),
      `사라짐=${e.gone} · 곳간 행 ${e.dbRows} · 부순 이가 받은 것 ${JSON.stringify(e.bystanderGot)} · 그 자리 영토 ${e.claimsHere}${e.err ? ' · err ' + e.err.slice(0, 200) : ''}`); }
  console.log('| 경우 | 무엇 | 곳간(물리) | 금고(central) | 금고 − 곳간 | 비고 |\n|---|---|---|---|---:|---|');
  for (const r of rows) console.log(`| ${r.tag} | ${r.what} | ${r.phys} | ${r.tr} | ${r.drift} | ${r.extra} |`);
  const n = rows.filter((r) => r.tag !== 'ⓐ' && r.drift !== 0).length, ctl = rows.find((r) => r.tag === 'ⓐ').drift === 0;
  console.log(`=== 어긋남 재현 ${n}/4 · 대조 ${ctl ? '0(맞음)' : '어긋남(자 결함)'} ===`);
  for (const k of kids) try { k.kill(); } catch (e) {}
  process.exit(ctl ? 0 : 1);
})().catch((e) => { console.error(e); for (const k of kids) try { k.kill(); } catch (_) {} process.exit(1); });
