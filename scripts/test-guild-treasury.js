#!/usr/bin/env node
// === 길드 곳간(물리) ↔ central 금고(회계) 정합 검증 하네스 ===
// 장부 계약(server/guild-treasury.js 상단):
//   곳간 data = 물리 실체 / treasury_json = 길드 총자산(물리는 그 부분집합) / 같은 물건을 두 번 세지 않는다.
//   반영은 **정확히 한 번** — data._tr(마지막 보고 스냅샷) 기준 델타만 올린다.
//
// ①~⑥ 단위(순수 로직) + ⑦ **실 HTTP 왕복**(로컬 central이 떠 있을 때만 — CENTRAL_URL 지정 시 자동 수행)
// 실행: node scripts/test-guild-treasury.js            (단위만)
//       CENTRAL_URL=http://127.0.0.1:3010 node scripts/test-guild-treasury.js   (통합까지)
const path = require('path');
const http = require('http');
const GT = require(path.join(__dirname, '..', 'server', 'guild-treasury'));

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const mkOpts = (log, failMode) => ({
  tribeTreasury: async (tribeId, delta) => { if (failMode()) throw new Error('central down'); log.push([tribeId, JSON.parse(JSON.stringify(delta))]); },
  saveData: (b) => { log.saves = (log.saves || 0) + 1; },
});

console.log('=== 길드 곳간 ↔ central 금고 정합 ===');

async function main() {

console.log('\n[① 아이템만 추린다 — 메타 키(tribe_id·floor·_tr…)는 회계에 안 들어간다]');
{
  const items = GT.granaryItems({ tribe_id: 7, floor: 0, wood: 5, stone: 2, _tr: { wood: 5 }, junk: 'x', zero: 0 });
  chk(JSON.stringify(items) === JSON.stringify({ wood: 5, stone: 2 }), '추출 = ' + JSON.stringify(items));
}

console.log('\n[② 첫 입고 = 전량 델타 · 재호출 = 0(중복 계상 없음)]');
{
  const log = []; const b = { type: 'guild_granary', dbId: 1, data: { tribe_id: 7, wood: 5 } };
  await (async () => {
    const r1 = await GT.syncGranary(b, mkOpts(log, () => false));
    chk(r1 && r1.ok && JSON.stringify(r1.delta) === '{"wood":5}', '1회차 델타 = ' + JSON.stringify(r1 && r1.delta));
    const r2 = await GT.syncGranary(b, mkOpts(log, () => false));
    chk(r2 === null, '2회차(변화 없음) = 호출 안 함');
    chk(log.length === 1, `central 호출 누계 ${log.length}회(기대 1)`);
  })();
}

console.log('\n[③ 입고→인출 왕복이 양쪽 장부에 정확히 1회씩]');
{
  await (async () => {
    const log = []; const opts = mkOpts(log, () => false);
    const b = { type: 'guild_granary', dbId: 1, data: { tribe_id: 7 } };
    b.data.wood = 10; await GT.syncGranary(b, opts);          // 입고
    b.data.wood -= 4; await GT.syncGranary(b, opts);          // 인출 4
    const sum = log.reduce((a, [, d]) => a + (d.wood || 0), 0);
    chk(log.length === 2 && log[0][1].wood === 10 && log[1][1].wood === -4,
      '회계 델타 순서 = ' + JSON.stringify(log.map((l) => l[1])));
    chk(sum === 6 && GT.granaryItems(b.data).wood === 6, `회계 누계 ${sum} = 물리 잔량 ${GT.granaryItems(b.data).wood}`);
  })();
}

console.log('\n[④ central 장애 → 델타 보류 → 복구 시 합쳐서 1회(누락·중복 없음)]');
{
  await (async () => {
    const log = []; let down = true;
    const opts = mkOpts(log, () => down);
    const b = { type: 'guild_granary', dbId: 1, data: { tribe_id: 7, wood: 3 } };
    const r1 = await GT.syncGranary(b, opts);
    chk(r1 && r1.ok === false, 'central 다운 → 보고 실패로 표시');
    b.data.wood += 4;                                          // 다운 중 추가 입고
    down = false;
    const r2 = await GT.syncGranary(b, opts);
    chk(r2 && r2.ok && r2.delta.wood === 7, '복구 후 한 번에 +7 (3+4) — ' + JSON.stringify(r2.delta));
    chk(log.length === 1, `실제 central 호출 ${log.length}회(기대 1)`);
  })();
}

console.log('\n[⑤ 곳간 비우기 = 음수 델타로 정확히 상쇄]');
{
  await (async () => {
    const log = []; const opts = mkOpts(log, () => false);
    const b = { type: 'guild_granary', dbId: 2, data: { tribe_id: 9, wood: 6, stone: 2 } };
    await GT.syncGranary(b, opts);
    delete b.data.wood; b.data.stone = 0;
    await GT.syncGranary(b, opts);
    const net = {};
    for (const [, d] of log) for (const [k, v] of Object.entries(d)) net[k] = (net[k] || 0) + v;
    chk(net.wood === 0 && net.stone === 0, '순변화 0 = ' + JSON.stringify(net));
  })();
}

console.log('\n[⑥ 길드 미지정 곳간·빈 델타는 회계를 건드리지 않는다]');
{
  await (async () => {
    const log = []; const opts = mkOpts(log, () => false);
    chk((await GT.syncGranary({ type: 'guild_granary', dbId: 3, data: { wood: 5 } }, opts)) === null, 'tribe_id 없음 → 무시');
    chk((await GT.syncGranary({ type: 'guild_granary', dbId: 4, data: { tribe_id: 1 } }, opts)) === null, '빈 곳간 → 무시');
    chk(log.length === 0, `central 호출 ${log.length}회(기대 0)`);
  })();
}

}   // main() 끝 — 위 단위 블록은 순차 실행(출력 순서 보장)

// ── ⑦ 실 HTTP 왕복(로컬 central 필요) ──
const CU = process.env.CENTRAL_URL;
const post = (url, body) => new Promise((res, rej) => {
  const u = new URL(url);
  const data = JSON.stringify(body);
  const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s || '{}')); } catch (e) { res({}); } }); });
  req.on('error', rej); req.write(data); req.end();
});
const get = (url) => new Promise((res, rej) => {
  http.get(url, (r) => { let s = ''; r.on('data', (c) => s += c); r.on('end', () => { try { res(JSON.parse(s || '{}')); } catch (e) { res({}); } }); }).on('error', rej);
});

(async () => {
  await main();
  if (CU) {
    console.log('\n[⑦ 실 HTTP 왕복 — central /tribe/treasury (같은 채널, 신규 API 없음)]');
    try {
      const nm = 'HARNESS_' + Date.now();
      const up = await post(CU + '/tribe/npc_upsert', { name: nm, tier: 1 });
      const tribeId = (up && (up.tribe_id || (up.tribe && up.tribe.id))) || null;
      chk(!!tribeId, '시험용 길드 생성 tribe_id=' + tribeId);
      if (tribeId) {
        const before = (await get(`${CU}/tribe/${tribeId}`)).treasury || {};
        const log = [];
        const opts = { tribeTreasury: (tid, delta) => post(CU + '/tribe/treasury', { tribe_id: tid, delta }).then((r) => { log.push(r); if (!r || !r.ok) throw new Error('central 거절'); }), saveData: () => { } };
        const b = { type: 'guild_granary', dbId: 99, data: { tribe_id: tribeId, wood: 12, stone: 3 } };
        await GT.syncGranary(b, opts);                  // 입고 12/3
        await GT.syncGranary(b, opts);                  // 재호출 — 변화 없음(중복 방지)
        b.data.wood -= 5; await GT.syncGranary(b, opts); // 인출 5
        const after = (await get(`${CU}/tribe/${tribeId}`)).treasury || {};
        const dw = (after.wood || 0) - (before.wood || 0), ds = (after.stone || 0) - (before.stone || 0);
        chk(dw === 7 && ds === 3, `central 금고 실측 변화: wood ${dw}(기대 7) · stone ${ds}(기대 3)`);
        chk((after.wood || 0) >= GT.granaryItems(b.data).wood, `불변식: 물리(${GT.granaryItems(b.data).wood}) ≤ 회계(${after.wood})`);
        chk(log.length === 2, `HTTP 호출 ${log.length}회(기대 2 — 변화 없는 호출은 나가지 않는다)`);
      }
    } catch (e) {
      chk(false, 'central 통합 검사 실패: ' + e.message);
    }
  } else {
    console.log('\n[⑦ 실 HTTP 왕복] 건너뜀 — CENTRAL_URL 미지정(로컬 central 띄우고 지정하면 수행)');
  }
  console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
  process.exit(fail === 0 ? 0 : 1);
})();
