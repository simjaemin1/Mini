#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// === scripts/test-t1403-walk-arrow.js — [T1403 · 재민 11-20 판정 15] 간이 움집 기둥 2(가운데 두 자리) · 안내 화살 = 걸어서 닿는 것 ====================
//
// ★카드가 정한 것:
//   ① 간이 움집 = 기둥 2(가운데 두 자리 — 그림 자리) · 서까래 5 · 풀 3 · 이엉 3 → 통나무 9 · 풀 15
//   ② 「지금 할 일」 화살(나무 · 바위) — 곧은 답에 곧게 걸어 닿으면 그 답(종전) · 아니면 걸어서 닿는 가장 가까운 것
//      (걸음 술어 = 있는 것 · 탐색 상한 = 걸음 프리셋 · 새 수 0 · 못 찾으면 종전) · 손잡이 `T1403_WALK_ARROW`(★기본 끔)
//   ③ 확인: 어촌2 — 종전 화살 나무는 곧게 가면 물(강 건너) · 켬은 그보다 적은 걸음 · 농촌1 · 임업2 는 같다
// ★판 — A 정본 표(서버 · 클라 · 봇 자 원문 · 프로세스 0) · B 실제 존 끔/켬(`T1403_WALK_ARROW` 하나만 다름)
// ★미끼 둘(이 파일 안 · 바꾼 자리 정확히 1곳씩): ⓐ 간이 움집 기둥 자리 넷(6×4 꼴 사본) ⓑ 켬 갈래가 곧은 답을 걸음 확인 없이 돌려줌(종전 사본) — 어촌2 줄이 빨강
// ★날짜 · 벽시계 0.
// 실행: node scripts/test-t1403-walk-arrow.js [--skip-server]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SKIP_SERVER = process.argv.includes('--skip-server');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); return !!c; };
const sec = (t) => console.log('\n' + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = [];
process.on('exit', () => { for (const f of tmp) { try { fs.rmSync(f, { recursive: true, force: true }); } catch (e) {} } });

// ── A. 정본 표 ────────────────────────────────────────────────────────────────
sec('A1 간이 움집 기둥 — 고증 첫 수(가운데 2주) · 자리 = 가운데 칸 서 · 동 변 가운데');
const HS = require(path.join(ROOT, 'server', 'hut-stages.js'));
const postsOk = (H) => H.SMALL_PILLARS === 2 && Array.isArray(H.SMALL_POSTS) && H.SMALL_POSTS.length === H.SMALL_PILLARS
  && H.SMALL_POSTS.every(([fx, fy]) => Math.abs(fx) <= 0.5 && Math.abs(fy) <= 0.5)   // 가운데 칸 안(그림 · 충돌 자리가 아홉 칸 둘레를 안 먹는다)
  && JSON.stringify((H.SMALL_STAGES || [])[1] && H.SMALL_STAGES[1].need) === '{"pillar":2}' && JSON.stringify(H.smallRaw && H.smallRaw()) === '{"wood":9,"fiber":15}';
ok(postsOk(HS), '간이 움집 기둥 2 · 자리 둘 다 가운데 칸 안 · 원자재 통나무 9 · 풀 15', JSON.stringify([HS.SMALL_PILLARS, HS.SMALL_POSTS, HS.smallRaw && HS.smallRaw()]));
ok(JSON.stringify(HS.hutRaw()) === '{"wood":22,"fiber":38}' && HS.HUT_STAGES[1].need.pillar === 6, '6×4 움집 표 무변(통나무 22 · 풀 38 · 기둥 6)', JSON.stringify(HS.hutRaw()));
{   // 미끼 ⓐ
  const src = rd('server/hut-stages.js'), L = 'const SMALL_POSTS = [[-0.5, 0], [0.5, 0]];';
  const cnt = src.split(L).length - 1, bait = src.replace(L, 'const SMALL_POSTS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];');
  const f = path.join(ROOT, 'server', `_t1403_bait_${process.pid}.js`); fs.writeFileSync(f, bait); tmp.push(f);
  const HB = require(f);
  ok(cnt === 1 && !postsOk(HB), '★미끼 ⓐ 바꾼 자리 1곳(원문 `SMALL_POSTS` 한 줄 → 기둥 자리 넷 · 6×4 꼴 사본) — 기둥 줄이 빨강', `${cnt}곳 · ${JSON.stringify(HB.SMALL_POSTS)}`);
}

sec('A2 그림 · 완공 행 — 간이 움집만 기둥 둘을 그린다(클라 36 원문 · 서버 완공 행)');
{
  const c36 = rd('public/client/36-r2-building.js'), z = rd('server/zone.js');
  ok(/building\.data\.small && Array\.isArray\(building\.data\.posts\)/.test(c36), '클라 — `small` 표지 · `posts` 가 있을 때만(6×4 움집 · 옛 행은 그대로)', '');
  ok(/_sm \? \{ posts: HutStages\.SMALL_POSTS\.map/.test(z), '서버 완공 행 — 간이 움집만 `posts`(정본 `SMALL_POSTS` × 칸 크기 · 사본 0)', '');
}

sec('A3 봇 자 — `nopath` 에서 멈추지 않고 둘레를 좁혀 돌아간다(`--guide` 만 · 끔 = 종전 거르기)');
{
  const e = rd('scripts/e2e-first30.js');
  ok(/function openStand\(gs\) \{ const a = gs\.filter\(\(g\) => !blockedCell\(g\.x, g\.y\)\); if \(a\.length \|\| !GUIDE\) return a;/.test(e), '설 자리 — 여유 둘레로 다 막혔을 때만 줄기 · 바위 반경으로 다시(안내 판만)', '');
  ok(/if \(!pth && GUIDE\) \{ const o0 = OBS; OBS = obstacleCells\(true\);/.test(e) && /rad \+ \(tight \? 0 : 10\)/.test(e), '길 — 갇힘 풀기 뒤에도 없으면 좁힌 둘레로 한 번 더(안내 판만 · 여유 10px 는 종전 수)', '');
  ok(/if \(!GUIDE\) \{ await walkTo\(standAround\(me\.x \+ ux \* 320, me\.y \+ uy \* 320, 96\)/.test(e) && /for \(const deg of \[0, 45, -45, 90, -90, 135, -135\]\)/.test(e), '영토 밖으로 — 곧장 막히면 옆으로 틀어 돌아간다(안내 판만 · 거리 320px 는 종전 수)', '');
  ok(/if \(m & 1\) o\.push\(\[cx, cy - 2\]\);/.test(e) && /R\.notes\.push\(`\$\{tSec\(\)\}s \[자\] 영토 밖 — 외곽선 바깥/.test(e), '영토 밖으로 — 먼저 초록 외곽선(클라가 그리는 경계 변) 두 칸 밖 가까운 데로', '');
  ok(/if \(GUIDE\) \{   \/\/ ★\[T1403\] 사람은 발밑을 보고 아홉 칸이 다 열린 땅/.test(e) && /lotTried\.add\(ck\(c0\.x, c0\.y\)\)/.test(e), '아홉 칸 막힘 — 둘레 고리에서 아홉 칸이 다 열린 자리로(막혔던 선 칸은 다시 안 고름 · 안내 판만)', '');
}

sec('A4 화살 — 켬 갈래의 술어 · 상한(새 수 0)');
{
  const z = rd('server/zone.js');
  ok(/const T1403_WALK_ARROW = process\.env\.T1403_WALK_ARROW === '1';/.test(z), '손잡이 `T1403_WALK_ARROW` — `1` 만 켬(기본 끔)', '');
  ok(/pops < PathCore\.LOCAL_MAX_NODES/.test(z) && /isTerrainBlockedLocal\(px, py\) \|\| isBlockedByWall\(px, py, cx \* S \+ H, cy \* S \+ H, 0\)/.test(z), '걸음 = 걸음 정본의 두 문(지형 · 벽 변) · 상한 = 걸음 프리셋 상한', '');
  ok(/if \(!st \|\| straightPathClear\(x, y, st\.x, st\.y, 0\)\) return st;/.test(z), '곧은 답에 곧게 걸어 닿으면 그 답(종전 · `straightPathClear`)', '');
}

// ── B. 실제 존 ────────────────────────────────────────────────────────────────
//   zoneFile — 미끼 ⓑ 는 존 원문 한 곳을 간 사본 파일로 띄운다(같은 server/ 자리 · 판 끝에 지움)
async function serverArm(on, zoneFile, slot) {
  const WebSocket = require('ws');
  const FB = require('./fixture-boot');
  const LP = require('./lib-port');
  const base = LP.ports(4, 39760 + slot * 10), CP = base, ZP = base + 2;
  const RUN = fs.mkdtempSync(`/tmp/t1403-${on ? 'on' : 'off'}-`); tmp.push(RUN); require('./lib-tmp').own(RUN);   // [PM land1086 · lint ㉑] lib-tmp — 판 끝(빨강 · 상한 포함)에 지운다
  const procs = [];
  const env = Object.assign({}, process.env, { T1341_OWN_HOUSE: '1', T1392_FIRST_LOT: '1' }); delete env.T1403_WALK_ARROW; if (on) env.T1403_WALK_ARROW = '1';
  const boot = (file, e, db) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, env, e, { DB_PATH: db }), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; };
  const down = async () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch (e) {} } await sleep(800); for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
  const out = { rows: {} };
  try {
    const cen = boot('central.js', { PORT: String(CP), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, path.join(RUN, 'c.db'));
    const zon = boot(zoneFile, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CP}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: '4', E2E_GIVE: '1' }, path.join(RUN, 'z.db'));
    const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 400000 });
    if (!a.ok || !b.ok) { out.boot = false; return out; }
    out.boot = true;
    for (const v of [1, 2, 3, 4]) {
      out.rows[v] = await new Promise((resolve) => {
        const q = new URLSearchParams({ name: `arrow${v}`, color: '#5a9ae0', start_vid: String(v) });
        const ws = new WebSocket(`ws://localhost:${ZP}/?${q}`);
        let W = null, own = null; const pend = [], row = {};
        const to = setTimeout(() => { try { ws.close(); } catch (e) {} resolve({ err: '시간초과' }); }, 30000);   // 한 마을 30초(접속 · 칸 · 걸음 셋 — 옛 존은 걸음 답이 없어 여기서 끊긴다)
        const next = () => {
          if (!pend.length) { clearTimeout(to); try { ws.close(); } catch (e) {} resolve(row); return; }
          const k = pend[0]; ws.send(JSON.stringify({ type: '__e2e_walk_steps', x: own[k].x, y: own[k].y }));
        };
        ws.on('message', (raw) => {
          let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
          if (m.type === 'welcome') { W = m; setTimeout(() => { try { ws.send(JSON.stringify({ type: 'onboarding_state' })); } catch (e) {} }, 1500); }
          else if (m.type === 'onboarding_state' && m.state && m.state.own && !own) {
            own = m.state.own;
            for (const k of ['tree', 'rock']) if (own[k]) { row[k] = { x: own[k].x, y: own[k].y }; pend.push(k); }
            next();
          }
          else if (m.type === '__e2e_walk_steps') { const k = pend.shift(); row[k].steps = m.steps; row[k].straight = m.straight; next(); }
        });
        ws.on('error', (e) => { clearTimeout(to); resolve({ err: String(e) }); });
      });
    }
  } catch (e) { out.err = String(e && e.stack || e); }
  finally { await down(); }
  return out;
}

(async () => {
  if (SKIP_SERVER) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} === (--skip-server)`); process.exit(fail ? 1 : 0); }
  const same = (p, q) => !!(p && q && p.x === q.x && p.y === q.y);
  const fmt = (r) => r ? `(${r.x},${r.y}) 걸음 ${r.steps} 곧게 ${r.straight ? '○' : '✗'}` : '없음';
  sec('B 실제 존 끔(`T1403_WALK_ARROW` 없음) — 종전 화살');
  const OFF = await serverArm(false, 'zone.js', 0);
  ok(OFF.boot, '끔 존 기동', OFF.err || '');
  sec('C 실제 존 켬(`T1403_WALK_ARROW=1`) — 걸어서 닿는 화살');
  const ON = await serverArm(true, 'zone.js', 1);
  ok(ON.boot, '켬 존 기동', ON.err || '');
  const arrowRows = (O, N) => {
    const o2 = O.rows[2] || {}, n2 = N.rows[2] || {};
    return {
      fish: !!(o2.tree && n2.tree && o2.tree.straight === false && n2.tree.steps != null && o2.tree.steps != null && n2.tree.steps < o2.tree.steps),
      keep: [1, 3].every((v) => same((O.rows[v] || {}).tree, (N.rows[v] || {}).tree) && same((O.rows[v] || {}).rock, (N.rows[v] || {}).rock)),
      reach: [1, 2, 3, 4].every((v) => ['tree', 'rock'].every((k) => !(N.rows[v] || {})[k] || N.rows[v][k].steps != null)),
    };
  };
  if (OFF.boot && ON.boot) {
    for (const v of [1, 2, 3, 4]) console.log(`    vid ${v}  끔 나무 ${fmt((OFF.rows[v] || {}).tree)} · 바위 ${fmt((OFF.rows[v] || {}).rock)}  |  켬 나무 ${fmt((ON.rows[v] || {}).tree)} · 바위 ${fmt((ON.rows[v] || {}).rock)}`);
    const R = arrowRows(OFF, ON);
    ok(R.fish, '★어촌2 — 끔 화살 나무는 곧게 가면 물(강 건너) · 켬 화살 나무는 그보다 적은 걸음', `${fmt(OFF.rows[2].tree)} → ${fmt(ON.rows[2].tree)}`);
    ok(R.keep, '농촌1 · 임업2 — 나무 · 바위 화살이 끔과 같다(곧게 닿는 곧은 답 = 종전)', '');
    ok(same(OFF.rows[4].rock, ON.rows[4].rock), '광산4 바위 — 끔과 같다', fmt(ON.rows[4].rock));
    ok(R.reach, '켬 — 네 마을 나무 · 바위 화살이 다 걸어서 닿는다(걸음 수가 선다)', [1, 2, 3, 4].map((v) => `${v}:${(ON.rows[v].tree || {}).steps}/${(ON.rows[v].rock || {}).steps}`).join(' '));
    sec('D 미끼 ⓑ — 켬 갈래가 곧은 답을 걸음 확인 없이 돌려주는 사본(존 원문 한 곳)');
    const z = rd('server/zone.js'), L = 'if (!st || straightPathClear(x, y, st.x, st.y, 0)) return st;';
    const cnt = z.split(L).length - 1, f = `_t1403_bait_zone_${process.pid}.js`;
    fs.writeFileSync(path.join(ROOT, 'server', f), z.replace(L, 'return st;')); tmp.push(path.join(ROOT, 'server', f));
    const BT = await serverArm(true, f, 2);
    ok(BT.boot, '미끼 존 기동', BT.err || '');
    if (BT.boot) {
      const RB = arrowRows(OFF, BT);
      ok(cnt === 1 && !RB.fish, '★미끼 ⓑ 바꾼 자리 1곳(켬 갈래의 곧게 닿음 문 한 줄 → 곧은 답 그대로 — 종전 사본) — 어촌2 줄이 빨강', `${cnt}곳 · ${fmt((BT.rows[2] || {}).tree)}`);
    }
  }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
