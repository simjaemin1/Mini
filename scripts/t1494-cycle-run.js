#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1494 판 계측기 · 제품 무변 · central + 존을 띄우고 봇 넷이 사람 문으로 논다)
// === scripts/t1494-cycle-run.js — 원한 한 바퀴: 쌓임 → 보임 → 가입 거절 → 토벌 → 풀림 (봇 넷 · 손잡이 `T1447_PERSON_GRUDGE=1`) ==========
//   봇(게임 문 그대로 — ws · 이름 · 비밀번호 계정):
//     H 해치는 봇 — 마을 B 땅의 것(그 마을 몸이 보는 나무 · 바위 · 풀 · 열매 — 판에서는 늘 바위 둘)을 B 사람 앞에서 거둔다(쌓임 · 한 줄마다 단계 말) → B 에 `/가입`(거절) → 마을 A 땅 바로 밖에 임시 사유지(T) → B 로 돌아가 기다린다
//     C 촌장 봇 — A 를 사람이 세운 마을로(`__e2e_chief` — 판 꾸밈) · `/가입` · A 마을 창을 열어 둔다 → 명분이 서면 「토벌」(= `/토벌 <H> 확인` — 단추가 보내는 그 줄)
//     S 구경 봇 — B 마을 창을 열어 둔다(H 의 줄이 단계 말로만 보이나 · 수 · 단추 0)
//     R 다시 접속하는 봇 — B 사람 앞에서 한 번 거두고(안다) 마을 밖에서 나간다 → 그동안 B 가 소식으로 더 미워한다(판 꾸밈 — 본 사람 0) → 마을 밖에서 다시 들어온다(옛 단계 그대로여야)
//                       → B 땅에 들어가면 지금 단계를 안다(here)
//   판 꾸밈(E2E_GIVE · `__e2e_t1494`): 막힌 칸(넓힘 길은 T1447 이 잰다 — 장부에 바로) · 본 사람 없는 해코지(소식 꼴) · 자리 찾기 · 장부 읽기(대조용).
//   새어 보임 셈: 봇마다 받은 `grudge_me` 줄 하나하나를 그 봇이 겪은 것과 견준다 — seen/join/trade/told/expel/raid = 그 마을 이름이 든 그 알림을 그 전에 받았나 ·
//     here = 그 마을 땅에 서 있었나(봇이 간 마을) · rumor = 그 마을 소문 가운데 (일 난 날 + 선 마을까지 도달 날) ≤ 오늘인 줄의 단계와 같은가. 어긋난 줄 = 새어 보임.
//   쓰는 법: node scripts/t1494-cycle-run.js --out <json> [--run n] [--day-ms 1500] [--restart] [--villages 3]
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A_ = process.argv.slice(2), val = (f, d) => { const i = A_.indexOf(f); return i >= 0 ? A_[i + 1] : d; };
const OUT = val('--out', null), RUN = +val('--run', '1'), DMS = +val('--day-ms', '1500'), NV = val('--villages', '3'), RESTART = A_.includes('--restart');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now(), el = () => +((Date.now() - T0) / 1000).toFixed(1);
const base = require('./lib-port').ports(2, 't1494cyc');
const CPORT = base, ZPORT = base + 1;
const TMPD = process.env.TMPDIR || '/tmp';
const CDB = path.join(TMPD, `t1494cyc-c-${process.pid}.db`), ZDB = path.join(TMPD, `t1494cyc-z-${process.pid}.db`);
const procs = [];
const rec = { run: RUN, dayMs: DMS, restart: RESTART, steps: {}, notes: {}, leaks: [], leakN: 0, checks: {}, ok: false, err: null, wall: 0 };
const save = () => { rec.wall = el(); if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec, null, 1)); } catch (e) {} };
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._out = []; p.stdout.on('data', (d) => { const s = String(d); if (/T1494|토벌|되살림/.test(s)) p._out.push(s.slice(0, 300)); }); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function cleanup() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } }
process.on('exit', cleanup);
const ZENV = { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
  VILLAGE_MAX: NV, VILLAGE_DAY_MS: String(DMS), VILLAGE_VIEW_MS: '1000', E2E_GIVE: '1', T1447_PERSON_GRUDGE: '1' };
async function jget(u) { try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }

// ── 봇 ─────────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
function connect(tag, name, prev) {   // prev = 같은 사람의 앞 접속(겪은 알림 · 선 마을을 이어 받는다 — 들어오는 순간 오는 내 창의 근거)
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ username: name, password: 'pw-t1494', name, color: '#7a8a9a' });
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const B = { tag, name, ws, pid: null, playerId: prev ? prev.playerId : null, notes: prev ? prev.notes.slice() : [], me: [], meNow: null, vv: {}, wait: [], at: prev ? prev.at : null, closed: false, _seenKey: prev && prev._seenKey };
    const to = setTimeout(() => reject(new Error(`${tag} 접속 시간초과`)), 40000);
    ws.on('message', (raw) => {
      let m = null; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome') { B.pid = m.pid; B.playerId = m.playerId; clearTimeout(to); resolve(B); }
      else if (m.type === 'notice') { const t = String(m.text || ''); B.notes.push({ t, at: el() }); }
      else if (m.type === 'grudge_me') { B.meNow = m.rows || []; B.me.push({ at: el(), rows: B.meNow }); onMe(B, B.meNow); }
      else if (m.type === 'village_view') { if (m.full) B.vv[m.vid] = Object.assign({}, m.view); else if (B.vv[m.vid] && m.slots) Object.assign(B.vv[m.vid], m.slots); }
      if (m.type === '__e2e_t1494') { const w = B.wait.findIndex((x) => x.op === m.op); if (w >= 0) { const x = B.wait.splice(w, 1)[0]; x.res(m); } }
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
    ws.on('close', () => { B.closed = true; });
    B.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
const tx = (B, m) => { try { if (B.ws.readyState === 1) B.ws.send(JSON.stringify(m)); } catch (e) {} };
const ask = (B, op, o) => new Promise((res) => { const x = { op, res }; B.wait.push(x); tx(B, Object.assign({ type: '__e2e_t1494', op }, o || {})); setTimeout(() => { const i = B.wait.indexOf(x); if (i >= 0) { B.wait.splice(i, 1); res(null); } }, 8000); });
const goTo = async (B, x, y, vid) => { tx(B, { type: 'teleport_debug', x: Math.round(x), y: Math.round(y) }); B.at = vid != null ? vid : null; await sleep(700); };
const chat = (B, text) => tx(B, { type: 'chat', text });
const lastNote = (B, re, since) => B.notes.filter((n) => re.test(n.t) && (since == null || n.at >= since)).pop() || null;
async function until(fn, ms, step) { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await sleep(step || 500); } }
let VN = {};   // vid → 이름
//   새어 보임 셈 — 줄마다 근거(위 머리 주석)
function onMe(B, rows) {
  for (const r of rows) {
    const nm = VN[r.vid] || r.name, key = `${B.tag}|${r.vid}|${r.stage}|${r.src}`;
    if (B._seenKey && B._seenKey.has(key)) continue;
    (B._seenKey || (B._seenKey = new Set())).add(key);
    const has = (re) => B.notes.some((n) => re.test(n.t) && n.t.includes(nm));
    let okr = null;
    if (r.src === 'seen') okr = has(/사람이 보았습니다/);
    else if (r.src === 'join') okr = has(/받지 않습니다/);
    else if (r.src === 'trade') okr = has(/거래하지 않습니다/);
    else if (r.src === 'told') okr = has(/촌장 — 자네 땅이/);
    else if (r.src === 'expel') okr = has(/우리 마을 사람이 아닐세/);
    else if (r.src === 'raid') okr = has(/당신 땅으로 오고 있습니다|토벌대가 당신 땅/);
    else if (r.src === 'here') { checkHere(B, r); continue; }   // 그 순간 그 봇이 선 칸의 마을(세계 사실 — 영토는 날마다 자란다)
    else if (r.src === 'rumor') { checkRumor(B, r); continue; }   // 그 순간에 견준다(소문 줄은 나중에 지워질 수 있다)
    else okr = false;
    if (!okr) { rec.leaks.push({ bot: B.tag, row: r, at: el(), why: '근거 없음' }); rec.leakN++; }
  }
}
const rumorP = [];
function checkRumor(B, r) { rumorP.push(checkRumor1(B, r)); }
function checkHere(B, r) { rumorP.push((async () => { const st = await ask(B, 'state', {}); if (!st || st.here !== r.vid) { rec.leaks.push({ bot: B.tag, row: r, at: el(), why: `그 땅에 없음 · 선 마을 ${st && st.here}` }); rec.leakN++; } })()); }
async function checkRumors() { await Promise.all(rumorP); }
async function checkRumor1(B, r) {   // 소문 줄 — 그 순간 그 봇이 선 마을까지의 도달 날 · 그 마을 소문 줄(서버 장부를 읽되 규칙은 여기서 셈)
  {
    const n = await ask(B, 'news', { vid: r.vid }), st = await ask(B, 'state', {});
    if (!n || !st) { rec.leaks.push({ bot: B.tag, row: r, why: '소문 대조 못 함' }); rec.leakN++; return; }
    const okr = n.here != null && Number.isFinite(n.delay) && n.e.some((e) => e[0] + n.delay <= st.day && e[1] === r.stage);
    if (!okr) { rec.leaks.push({ bot: B.tag, row: r, why: `소문 근거 없음 · 선 마을 ${n.here} · 도달 ${n.delay} · 오늘 ${st.day} · 줄 ${JSON.stringify(n.e)}` }); rec.leakN++; }
  }
}
const J = (o) => JSON.stringify(o == null ? null : { s: o.stage, src: o.src });
const vvRow = (B, vid, pid) => { const v = B.vv[vid], g = v && v.grudge; return g && Array.isArray(g.rows) ? g.rows.find((x) => String(x.pid) === String(pid)) || null : null; };
const step = (k, v) => { rec.steps[k] = Object.assign({ at: el() }, v); save(); };

(async () => {
  try {
    const FB = require('./fixture-boot');
    const cen = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    let zon = boot('zone.js', ZENV);
    const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
    if (!a.ok || !b.ok) throw new Error('기동 실패');
    let info = null;
    for (let i = 0; i < 120 && !info; i++) { const j = await jget(`http://localhost:${ZPORT}/startinfo`); if (j && j.ok && j.villages && j.villages.length >= 2) info = j; else await sleep(2000); }
    if (!info) throw new Error('마을이 안 섰다');
    const V = info.villages.map((v) => ({ vid: v.vid, name: v.name, x: v.cx * 32 + 16, y: v.cy * 32 + 16 }));
    for (const v of V) VN[v.vid] = v.name;
    step('boot', { villages: V.map((v) => v.name) });
    const tag = `${RUN}${require('crypto').randomBytes(2).toString('hex')}`;   // 계정 이름 꼬리(판마다 새 계정)
    let C = await connect('C', 'tc' + tag), H = await connect('H', 'th' + tag), S = await connect('S', 'ts' + tag);
    let R = await connect('R', 'tr' + tag);
    for (const Bt of [H, R]) tx(Bt, { type: '__e2e_give', tools: ['pickaxe', 'axe'] });   // 판 꾸밈 — 바위 · 나무를 캘 연장(마을 땅의 것을 거두는 길이 맨손 열매 · 풀뿐이면 너무 더디다)
    //   A = 촌장 마을 · B = 해코지 당하는 NPC 마을 — 도달 날이 서는 쌍(못 닿는 쌍이면 다른 쌍)
    let A = null, Bv = null, dAB = null;
    for (const x of V) { for (const y of V) { if (x === y) continue; const d = await ask(C, 'delay', { a: x.vid, b: y.vid }); if (d && Number.isFinite(d.delay) && d.delay > 0) { A = x; Bv = y; dAB = d.delay; break; } } if (A) break; }
    if (!A) throw new Error('도달 날이 서는 마을 쌍이 없다');
    step('pick', { A: A.name, B: Bv.name, delayAB: dAB });
    // ── C: A 촌장 · 가입 · A 창 ──
    await goTo(C, A.x, A.y, A.vid); tx(C, { type: '__e2e_chief', vid: A.vid }); await sleep(500); chat(C, '/가입'); await sleep(1200);
    tx(C, { type: 'village_view', vid: A.vid });
    const cv = await until(() => C.vv[A.vid] && C.vv[A.vid].grudge, 15000);
    step('chief', { slot: !!cv, chief: !!(cv && cv.chief), joined: !!lastNote(C, /들었습니다|사람이 되었습니다|환영/) });
    // ── S: B 창 ──
    await goTo(S, Bv.x, Bv.y, Bv.vid); tx(S, { type: 'village_view', vid: Bv.vid });
    await until(() => S.vv[Bv.vid] && S.vv[Bv.vid].grudge, 15000);
    // ── 쌓임: H 가 B 사람 앞에서 나무를 벤다 ──
    await goTo(H, Bv.x, Bv.y, Bv.vid);
    let tries = 0, shut = null, words = [], treeMiss = 0;
    while (!shut && tries < 90) {
      const sp = await ask(H, 'spot', { vid: Bv.vid, kind: 'any' });
      if (!sp || !sp.tree) { treeMiss++; rec.spotMiss = sp && { types: sp.types, inTerr: sp.inTerr, seen: sp.seen, bodies: sp.bodies }; if (treeMiss > 12) break; await goTo(H, Bv.x + (treeMiss % 3 - 1) * 200, Bv.y + ((treeMiss >> 1) % 3 - 1) * 200, Bv.vid); await sleep(1500); continue; }
      rec.kinds = rec.kinds || {}; rec.kinds[sp.tree.type] = (rec.kinds[sp.tree.type] || 0) + 1;
      await goTo(H, sp.tree.x + 18, sp.tree.y, Bv.vid);
      if (sp.tree.type === 'rock' || sp.tree.type === 'tree') { tx(H, { type: 'equip', tool: sp.tree.type === 'rock' ? 'pickaxe' : 'axe' }); await sleep(200); }
      for (let k = 0; k < 8 && !shut; k++) { tx(H, { type: 'gather', resId: sp.tree.id }); tries++; await sleep(700); shut = lastNote(H, /거래하지 않고 받아들이지도 않습니다/); if (lastNote(H, /거기에는 아무것도 없습니다|너무 멉니다/, el() - 0.7)) break; }
    }
    for (const n of H.notes) { const m = /미워합니다\(([^)]+)\)/.exec(n.t); if (m && words[words.length - 1] !== m[1]) words.push(m[1]); }
    if (shut) words.push('원수');
    step('heap', { tries, words, shut: !!shut, treeMiss });
    // ── 보임: S 의 B 창 · H 의 내 창 ──
    const sRow = await until(() => { const r = vvRow(S, Bv.vid, H.playerId); return r && r.stage === 4 ? r : null; }, 15000);
    const hMe = await until(() => (H.meNow || []).find((r) => r.vid === Bv.vid), 10000);
    step('seen', { sRow, noNums: !!(sRow && !('harm' in sRow) && !('raid' in sRow) && !('n' in sRow)), hMe });
    // ── 가입 거절 ──
    await goTo(H, Bv.x, Bv.y, Bv.vid); const tj = el(); chat(H, '/가입');
    const jn = await until(() => lastNote(H, /받지 않습니다/, tj), 8000);
    const hJoin = await until(() => { const r = (H.meNow || []).find((x) => x.vid === Bv.vid); return r && r.src === 'join' ? r : null; }, 8000);
    step('refuse', { line: jn && jn.t, me: hJoin });
    // ── R: 안다 → 마을 밖에서 나간다 → 그동안 B 가 소식으로 더 미워한다 → 마을 밖에서 다시 들어온다 ──
    await goTo(R, Bv.x, Bv.y, Bv.vid);
    let rk = null;
    for (let i = 0; i < 12 && !rk; i++) { const sp = await ask(R, 'spot', { vid: Bv.vid, kind: 'any' }); if (sp && sp.tree) { await goTo(R, sp.tree.x + 18, sp.tree.y, Bv.vid); if (sp.tree.type === 'rock' || sp.tree.type === 'tree') tx(R, { type: 'equip', tool: sp.tree.type === 'rock' ? 'pickaxe' : 'axe' }); await sleep(200); tx(R, { type: 'gather', resId: sp.tree.id }); await sleep(900); } rk = (R.meNow || []).find((r) => r.vid === Bv.vid && r.src === 'seen'); }
    //   마을 밖 자리 — 두 마을 사이 가운데에서 영토 밖인 곳을 찾는다
    let out0 = null;
    for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) { const x = A.x + (Bv.x - A.x) * f, y = A.y + (Bv.y - A.y) * f + 64; await goTo(R, x, y, null); const st = await ask(R, 'state', {}); if (st && st.here == null) { out0 = { x, y }; break; } }
    const rStage0 = rk ? rk.stage : null;
    R.ws.close(); await sleep(1500);
    const hf = await ask(S, 'harm', { vid: Bv.vid, pid: R.playerId, g: 0.2, name: R.name });   // 본 사람 0 — 소식 꼴(눈총 → 미움 가운데쯤)
    const liveR = hf ? hf.stage : null;
    R = await connect('R', 'tr' + tag, Object.assign({}, R, { at: null }));
    const rLogin = await until(() => R.me.length ? R.me[0].rows : null, 8000);
    const rLog = rLogin ? rLogin.find((r) => r.vid === Bv.vid) : null;
    await goTo(R, Bv.x, Bv.y, Bv.vid);
    let rLive = null;
    const rHere = await until(async () => { const st2 = await ask(R, 'state', {}); rLive = st2 && (st2.rows.find((x) => x.vid === Bv.vid) || {}).stage; const r = (R.meNow || []).find((x) => x.vid === Bv.vid); return r && r.src === 'here' && r.stage === rLive ? r : null; }, 10000, 600);
    step('reconnect', { knew: rStage0, liveAfter: liveR, out: !!out0, login: rLog, oldKept: !!(rLog && rLog.stage === rStage0 && rStage0 !== liveR), here: rHere, liveNow: rLive, hereLive: !!(rHere && rHere.stage === rLive) });
    // ── 땅: H 가 A 땅 바로 밖에 임시 사유지(재료는 판 꾸밈 `__e2e_give`) → 막힌 칸(판 꾸밈) → B 로 돌아가 기다린다 ──
    tx(H, { type: '__e2e_give', items: { wood: 20, stone: 20 } }); await sleep(400);
    const spA = await ask(H, 'spot', { vid: A.vid });
    if (!spA || !spA.border) throw new Error('A 땅 바로 밖 자리 없음');
    await goTo(H, spA.border.x, spA.border.y, null); tx(H, { type: 'claim', kind: 'temporary' }); await sleep(900);
    const bl = await ask(H, 'block', { vid: A.vid, n: 30 });
    if (out0) await goTo(H, out0.x, out0.y, null);   // 곧장 마을 밖으로 — 소문은 마을에서만 들린다
    await sleep(400); const atLeave = (H.meNow || []).find((r) => r.vid === A.vid) || null;
    await sleep(Math.max(3000, DMS * 2.5));   // 마을 밖에서 두 날 넘게
    const hA0 = (H.meNow || []).find((r) => r.vid === A.vid) || null;   // 모르는 땅 원한(명분 — 원수) — 마을 밖에선 새로 안 보여야(떠날 때 그대로)
    await goTo(H, Bv.x, Bv.y, Bv.vid);
    const cRow = await until(() => { const r = vvRow(C, A.vid, H.playerId); return r && r.raid && r.raid.ok ? r : null; }, 15000);
    step('land', { block: bl && { added: bl.added, n: bl.n, need: bl.need, casus: bl.casus, stage: bl.stage, cells: bl.cells }, atLeave, hA0, hUnknown: !!out0 && J(hA0) === J(atLeave) && !(hA0 && hA0.src === 'rumor'), cRow });
    // ── 토벌: 촌장이 누른다(단추 = `/토벌 <사람> 확인`) ──
    const st0 = await ask(C, 'state', { pid: H.playerId }), d0 = st0 ? st0.day : null, tp = el();
    chat(C, `/토벌 ${H.playerId} 확인`);
    const go = await until(() => lastNote(C, /땅으로 떠났습니다/, tp), 8000);
    const busy = await until(async () => { const r = vvRow(C, A.vid, H.playerId); if (r && r.raid && r.raid.busy) return { view: r.raid }; const s2 = await ask(C, 'state', { pid: H.playerId }); const q = s2 && s2.rows.find((x) => x.vid === A.vid); return q && q.busy ? { state: q.busy } : null; }, 10000, 300);
    step('raid', { go: go && go.t, day0: d0, busy });
    if (RESTART) {   // 재기동 — 가는 중에 존을 끈다(종료 저장) · 같은 DB 로 다시 띄운다 · 봇은 다시 붙는다(겪은 알림 · 선 마을은 이어 받는다)
      try { zon.kill('SIGTERM'); } catch (e) {}
      await until(() => zon.exitCode != null || zon.signalCode != null, 60000);
      const outLines = zon._out.slice(-6);
      for (const Bt of [C, H, S, R]) { try { Bt.ws.close(); } catch (e) {} clearInterval(Bt.beat); }
      zon = boot('zone.js', ZENV);
      const b2 = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
      C = await connect('C', 'tc' + tag, C); H = await connect('H', 'th' + tag, H); S = await connect('S', 'ts' + tag, S);
      tx(C, { type: 'village_view', vid: A.vid }); tx(S, { type: 'village_view', vid: Bv.vid });
      const back = await until(async () => { const s2 = await ask(C, 'state', { pid: H.playerId }); const r = s2 && s2.rows.find((x) => x.vid === A.vid); return r && r.busy ? r.busy : null; }, 20000, 1000);
      step('restart', { up: b2.ok, outLines, after: zon._out.filter((x) => /되살림/.test(x)).slice(-2), busy: back });
    }
    // ── 떠났다는 소문(H 는 B 땅) — 떠난 날 + 도달 날 뒤에야 ──
    const rum = await until(() => lastNote(H, /토벌대가 당신 땅으로 떠났다는 소문이 들립니다/, tp), Math.max(90000, 12 * DMS), 700);
    const stR = await ask(H, 'state', {}), dR = stR ? stR.day : null;
    const hArum = (H.meNow || []).find((r) => r.vid === A.vid) || null;
    step('rumor', { line: rum && rum.t, day: dR, day0: d0, delay: dAB, notEarly: rum ? (dR - d0 >= dAB) : null, me: hArum });
    // ── 닿아서 친다 → 땅 원한 풂(A 창에서 H 줄이 사라진다) ──
    const gone = await until(async () => { const s2 = await ask(C, 'state', { pid: H.playerId }); const r = s2 && s2.rows.find((x) => x.vid === A.vid); return !r ? { ok: true, day: s2.day } : null; }, Math.max(150000, 25 * DMS), 1500);
    const cGone = await until(() => !vvRow(C, A.vid, H.playerId), 10000);
    step('razed', { gone, viewGone: !!cGone, chiefLines: C.notes.slice(-4).map((n) => n.t) });
    // ── 풀림(해코지 원한) — 날이 가면 옅어진다: S 의 B 창에서 원수 → 앙심 ──
    const eased = await until(() => { const r = vvRow(S, Bv.vid, H.playerId); return r && r.stage < 4 ? r : null; }, Math.max(150000, 45 * DMS), 1500);
    await goTo(H, Bv.x, Bv.y, Bv.vid); const tj2 = el(); chat(H, '/가입');
    await sleep(2500);
    const j2 = H.notes.filter((n) => n.at >= tj2).map((n) => n.t);
    const hNow = (H.meNow || []).find((r) => r.vid === Bv.vid) || null;
    step('eased', { row: eased, joinLines: j2, refusedAgain: j2.some((t) => /받지 않습니다/.test(t)), me: hNow });
    await checkRumors();
    // ── 판정 ──
    const S_ = rec.steps;
    rec.checks = {
      heap: !!S_.heap.shut && S_.heap.words.length >= 1,
      seen: !!(S_.seen.sRow && S_.seen.noNums && S_.seen.hMe),
      refuse: !!(S_.refuse.line && S_.refuse.me),
      chief: !!(S_.chief.slot && S_.chief.chief),
      reconnect: !!(S_.reconnect.oldKept && S_.reconnect.hereLive),
      landUnknown: !!S_.land.hUnknown && !!S_.land.cRow,
      raid: !!(S_.raid.go && S_.raid.busy) && (!RESTART || !!(S_.restart && S_.restart.busy)),
      rumor: !!(S_.rumor.line && S_.rumor.notEarly && (!S_.rumor.me || S_.rumor.me.src === 'rumor' || S_.rumor.me.src === 'here')),   // 내 창 줄은 소문(또는 이미 친 뒤 지워짐 — 재기동 판)
      razed: !!(S_.razed.gone && S_.razed.viewGone),
      eased: !!(S_.eased.row && !S_.eased.refusedAgain),
      leaks: rec.leakN === 0,
    };
    rec.ok = Object.values(rec.checks).every(Boolean);
    for (const Bt of [C, H, S, R]) rec.notes[Bt.tag] = Bt.notes.map((n) => `${n.at} ${n.t}`).slice(-30);
  } catch (e) { rec.err = String(e && e.stack || e).slice(0, 900); }
  save();
  console.log(`[t1494 판 ${RUN}] ${rec.ok ? '한 바퀴 ○' : '한 바퀴 ✗'} · 새어 보임 ${rec.leakN} · ${JSON.stringify(rec.checks)} · ${rec.wall}초${rec.err ? ' · ' + rec.err.slice(0, 200) : ''}`);
  cleanup(); process.exit(rec.ok ? 0 : 1);
})();
