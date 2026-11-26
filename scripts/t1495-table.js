#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · 표 입 · T1495 · 제품 코드 · 있던 스크립트 손 0)
// =============================================================================
// scripts/t1495-table.js — T1495 표를 파일로(손 셈 0)
//   묶기:  node scripts/t1495-table.js --pack /var/tmp/t1495w 계측/T1495_<날짜>
//          = RAW/raw/<판>/ 의 판 자료(meta.json · perf.jsonl · bots.jsonl · pings.jsonl · walk.jsonl · 귀 p-<존>.closes/queue.jsonl)를 판마다 한 줄로 줄여
//            DIR/packed.jsonl.gz 에(원자료는 레포 밖 — 이 묶음이 증거 정본). 러버밴드 · 마감 창 겹침 같은 셈은 여기서 한다(원자료가 있어야 하니).
//   표:    node scripts/t1495-table.js --md 계측/T1495_<날짜>/table.md --json 계측/T1495_<날짜>/table.json
//          = 같은 폴더의 packed.jsonl.gz 만 읽는다(다시 내면 바이트 같음).
// 판 이름: b-<세계>-<경계 앞 초>-<on|off>-<번호>[-noear|-real] (부팅 표 · 세계 = han · nip · ck700 · ck1200) · x-<main|near> · xc-<main|near>(넘는 도중 마감) ·
//          a-<main|near>(맞닿은 두 마을 걷기) · scout-<세계> · lrx1200-<on|off>(1,200날 체크포인트 만들기)
// =============================================================================
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const R = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x));
const R1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const q = (arr, p) => { const s = arr.filter((x) => x != null).slice().sort((a, b) => a - b); if (!s.length) return null; return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (a) => q(a, 0.5);
const mx = (a) => { const s = a.filter((x) => x != null); return s.length ? Math.max(...s) : null; };

// ── 러버밴드(되돌아감) — 걷는 봇 틱 표본 [t, x, y, ack, dir, seq] ─────────────────────────────
//   서버는 입력을 받은 차례대로 틱마다 하나씩 쓰고 쓴 마지막 seq 를 ackSeq 로 준다 · 클라는 권위 자리 + 아직 ack 안 된 입력을 다시 걸어 예측한다(30-n-net
//   `applyServerCorrection`). 그래서 클라 화면이 뒤로 끌리는 것은 "ack 는 나아갔는데 몸은 그만큼 안 간" 몫(넘쳐 버린 입력 · 틱 사이 다른 셈)뿐이다.
//   ⇒ 한 걸음 = 고른 걸음 구간(방향이 바뀐 뒤 1초 지남)에서 Δx/Δack 의 가운데. 모자람 = 걸음 × Δack − 방향 × Δx 를 쌓아 32px(1m)를 넘으면 1번 · 0 으로.
function rubber(S) {
  if (!S || S.length < 10) return null;
  const steady = []; let dirAt = -1e9, pdir = null;
  for (let i = 0; i < S.length; i++) { const d = S[i][4]; if (d !== pdir) { dirAt = S[i][0]; pdir = d; } steady.push(d === 1 || d === -1 ? S[i][0] - dirAt >= 1000 : false); }
  const ratios = [];
  for (let i = 1; i < S.length; i++) if (steady[i] && steady[i - 1] && S[i][4] === S[i - 1][4]) { const da = S[i][3] - S[i - 1][3]; if (da > 0 && da <= 2) ratios.push(Math.abs(S[i][1] - S[i - 1][1]) / da); }
  const step = med(ratios);
  if (!(step > 0)) return { step: null, n: 0, maxDef: null, back: 0, events: [] };
  let def = 0, n = 0, maxDef = 0, back = 0; const events = [];
  for (let i = 1; i < S.length; i++) {
    if (!(steady[i] && steady[i - 1] && S[i][4] === S[i - 1][4])) { def = 0; continue; }
    const da = S[i][3] - S[i - 1][3], dx = (S[i][1] - S[i - 1][1]) * S[i][4];
    if (dx < -8) back++;
    def = Math.max(0, def + step * da - dx);
    if (def > maxDef) maxDef = def;
    if (def > 32) { n++; events.push([R(S[i][0]), R(def)]); def = 0; }
  }
  return { step: +step.toFixed(3), n, maxDef: R(maxDef), back, events };
}

// ── 묶기 ─────────────────────────────────────────────────────────────────────
function pack(RAW, DIR) {
  const root = path.join(RAW, 'raw'), tags = fs.readdirSync(root).sort();
  const out = [];
  for (const tag of tags) {
    const D = path.join(root, tag), dn = path.join(RAW, 'done', tag + '.done');
    if (!fs.existsSync(dn)) continue;
    const [rc, sec] = fs.readFileSync(dn, 'utf8').trim().split(/\s+/).map(Number);
    if (/^lrx/.test(tag)) {
      const P = readJson(path.join(D, 'run', 'progress.json'));
      out.push({ tag, rc, sec, prog: P ? { days: P.days, ck: P.ck, done: !!P.done, segs: (P.segs || []).filter((s) => s.from >= 700).map((s) => [s.from, s.to, R(s.sec)]) } : null });
      continue;
    }
    const M = readJson(path.join(D, 'meta.json')) || {};
    const o = { tag, rc, sec, mode: M.mode, arm: M.arm, srv: M.srv === 'main' ? 'main' : 'near', probe: !!M.probe, world: M.world || null, zone: M.zone || null, off: M.off, scout: !!M.scout,
      K: M.K, bootMs: M.bootMs, offReal: M.missed ? R1(M.missedBy) : R1(M.offReal), missed: !!M.missed, villages: M.villages, err: M.err || null, noshift: /-real$/.test(tag) };
    if (M.mode === 'boot' && !M.scout) {
      const z = M.zone, spawn = M.spawn, T00 = M.started;
      const closes = readJsonl(path.join(D, `p-${z}.closes.jsonl`));
      const queue = readJsonl(path.join(D, `p-${z}.queue.jsonl`));
      // 귀 시각 t = (밀린) 지금 − 귀가 실린 때 ≈ 존 띄운 때(spawn) 기준 ms. 첫 꼬리 = mini 0 인 첫 줄.
      const tail = closes.find((c) => c.mini === 0);
      if (tail) {
        const st = tail.stg || [], dist = (st.find((x) => x[0] === 'dist') || [null, 0])[1];
        const t1 = tail.t, t0 = tail.t - tail.wall;
        const qin = queue.filter((x) => x.t >= t0 - 5 && x.t <= t1 + 50);
        o.close = { day: tail.day, wall: R(tail.wall), cpu: R(tail.cpu), frames: tail.frames, frameMax: tail.frameMax, maxChunk: tail.maxChunk, at: tail.at, queued: tail.queued, dist: R(dist), loopMax: tail.loop ? tail.loop.max : null,
          t0: R(t0), t1: R(t1), qN: qin.length, qMax: R(mx(qin.map((x) => x.waitMs))), qMed: R(med(qin.map((x) => x.waitMs))), qTypes: [...new Set(qin.map((x) => x.type))].sort(),
          minis: closes.filter((c) => c.mini === 1 && c.t <= t1).length, miniMax: R(mx(closes.filter((c) => c.mini === 1 && c.t <= t1).map((c) => c.wall))) };
        o.tails = closes.filter((c) => c.mini === 0).map((c) => [c.day, R(c.wall), R(((c.stg || []).find((x) => x[0] === 'dist') || [null, 0])[1])]);
      }
      // /perf — 배경 거리 셈(T968) · 꼬리 기록(귀 없는 판도 같은 자)
      const perf = readJsonl(path.join(D, 'perf.jsonl')).filter((p) => p.z === z);
      const firstTailReal = M.firstTailReal != null ? M.firstTailReal : null;
      const rdy = perf.find((p) => p.t968 && (p.t968.ready | 0) >= 1);
      const lastP = perf[perf.length - 1];
      const firstLast = perf.find((p) => p.last);
      o.t968 = lastP ? { ready: lastP.t968.ready | 0, readyClose: lastP.t968.readyClose | 0, bgSlices: lastP.t968.bgSlices | 0, bgMs: lastP.t968.bgMs | 0, closeSlices: lastP.t968.closeSlices | 0,
        readyAtVsTail: rdy && firstTailReal != null ? R1((rdy.at - firstTailReal) / 1000) : null, readyAtVsBoot: rdy && M.simReady ? R1((rdy.at - M.simReady) / 1000) : null,
        bgMsAtReady: rdy ? rdy.t968.bgMs | 0 : null } : null;
      o.perfTail = firstLast ? { day: firstLast.last.day, total: R(firstLast.last.total), queued: firstLast.last.queued, dist: R(firstLast.last.dist), frames: firstLast.last.frames, maxChunk: firstLast.last.maxChunk, wallWin: R(firstLast.last.wall) } : null;
      // 봇 — 요청(귀 시각 축으로: spawn 기준 ms)
      const B = readJsonl(path.join(D, 'bots.jsonl'));
      const toZ = (at) => T00 + at - spawn;
      const reqs = B.filter((r) => r.k === 'req').map((r) => [r.type, R(toZ(r.at)), r.ms == null ? null : R(r.ms), r.closing ? 1 : 0]);
      const c0 = o.close ? o.close.t0 : null, c1 = o.close ? o.close.t1 : null;
      const inC = (r) => c0 != null && r[1] <= c1 && (r[2] == null ? true : r[1] + r[2] >= c0);
      o.reqAll = reqs.length; o.reqIn = reqs.filter(inC);   // 마감 창에 걸친 요청(보낸 때 ≤ 끝 · 답 ≥ 시작) 전부
      o.reqOut = { n: reqs.filter((r) => !inC(r)).length, p50: med(reqs.filter((r) => !inC(r)).map((r) => r[2])), p99: q(reqs.filter((r) => !inC(r)).map((r) => r[2]), 0.99), max: mx(reqs.filter((r) => !inC(r)).map((r) => r[2])), lost: reqs.filter((r) => !inC(r) && r[2] == null).length };
      const bots = B.filter((r) => r.k === 'bot');
      o.botsIn = M.botsIn; o.disc = bots.filter((b) => b.closed).map((b) => [b.bot, R(toZ(b.closedAt))]);
      o.tickGapMax = mx(bots.map((b) => b.tickGapMax));
      // 핑(줄 안 섬) — 마감 창 안/밖 최대
      const P = readJsonl(path.join(D, 'pings.jsonl'));
      const pin = [], pout = [];
      for (const b of P) for (const [at, ms] of b.s) { const zt = toZ(at); (c0 != null && zt <= c1 && (ms == null || zt + ms >= c0) ? pin : pout).push(ms); }
      o.ping = { inN: pin.length, inMax: R(mx(pin)), inP99: R(q(pin, 0.99)), inLost: pin.filter((x) => x == null).length, outMax: R(mx(pout)), outP99: R(q(pout, 0.99)), outLost: pout.filter((x) => x == null).length };
      // 걷기 — 러버밴드(마감 창 안/밖)
      const W = readJsonl(path.join(D, 'walk.jsonl'));
      o.walk = W.map((w) => {
        const rb = rubber(w.s);
        if (!rb) return { bot: w.bot, n: null };
        const ev = rb.events.map(([t, d]) => [R(toZ(t)), d]);
        const evIn = ev.filter(([t]) => c0 != null && t >= c0 - 1000 && t <= c1 + 4000);
        return { bot: w.bot, step: rb.step, n: rb.n, nIn: evIn.length, maxDef: rb.maxDef, back: rb.back, samples: w.s.length };
      });
      o.segs = B.filter((r) => r.k === 'walkseg').map((r) => (r.ok ? 1 : 0));
    }
    if (M.mode === 'cross' || M.mode === 'adj') {
      const B = readJsonl(path.join(D, 'bots.jsonl'));
      const pz = M.mode === 'cross' ? ['hanbando', 'nippon'] : ['hanbando'];
      const spawnOf = (z) => (M.mode === 'cross' ? (M[z] || {}).spawn : M.spawn);
      const cl = {};
      for (const z of pz) {
        const C = readJsonl(path.join(D, `p-${z}.closes.jsonl`)).filter((c) => c.mini === 0);
        cl[z] = C.map((c) => { const s = spawnOf(z) - M.started; return [R(s + c.t - c.wall), R(s + c.t), c.day, R(c.wall)]; });   // rig 시각 축(ms · 판 시작 기준) [시작, 끝, 날, 길이]
      }
      o.tailsRig = cl;
      o.meta = M.mode === 'cross' ? { vh: M.vh, vn: M.vn, vidOverlap: M.vidOverlap, corridor: !!M.corridor, offH: R1((M.hanbando || {}).offReal), offN: R1((M.nippon || {}).offReal), tailS: M.tailS, tailZone: M.tailZone || 'hanbando' }
        : { pairD: M.pair ? M.pair.d : null, P: M.P ? [M.P.x, M.P.y] : null, tailS: M.tailS, villages: M.villages };
      o.trials = B.filter((r) => r.k === 'trial').map((r) => {
        const inClose = (t0, t1) => { for (const z of pz) for (const c of cl[z]) if (t0 <= c[1] && t1 >= c[0]) return z; return null; };
        const t0 = r.t0, t1 = r.at != null ? r.at + 1500 : r.t0 + 20000;
        const x = { i: r.trial, err: r.err || null, refused: !!r.refused, far: !!r.far, stale: !!r.stale, npc: !!r.npc, ok: !!r.ok, closing: !!r.closing, ms: r.ms, close: inClose(t0, t1) };
        if (M.mode === 'cross') Object.assign(x, { h: r.h, n: r.n, collide: !!r.collide, briefH: !!r.briefH, briefN: !!r.briefN, withheld: r.withheld | 0, part: r.part || null, handoff: !!r.handoff, connMs: r.connMs, walkMs: R(r.walkMs) });
        else Object.assign(x, { briefB: !!r.briefB, briefA: r.briefA, dDoor: r.dDoor, stuck: r.stuck || null, walkMs: R(r.walkMs), tickGapMax: r.tickGapMax });
        if (r.notices) x.nt = r.notices.map((t) => t.replace(/[0-9]+/g, '#').slice(0, 30));
        return x;
      });
    }
    out.push(o);
  }
  fs.mkdirSync(DIR, { recursive: true });
  const body = out.map((o) => JSON.stringify(o)).join('\n') + '\n';
  fs.writeFileSync(path.join(DIR, 'packed.jsonl.gz'), zlib.gzipSync(Buffer.from(body), { level: 9 }));
  console.log(`묶음 ${out.length}판 → ${path.join(DIR, 'packed.jsonl.gz')}`);
}

// ── 표 ─────────────────────────────────────────────────────────────────────────
const md = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.map((c) => (c == null ? '—' : String(c))).join(' | ') + ' |')].join('\n');
const s1 = (ms) => (ms == null ? null : (ms / 1000).toFixed(1));
// 배경 셈 끝 낱말: 숫자 = t968.ready 가 선 때 · "마감" = 배경이 못 끝내 꼬리 마감이 이어 셈 · "없음" = 거리 다시 셈 일이 안 섰다(끔 · T977 같은 바탕 지름길)
const bgWord = (r, x, sign) => { const t = r.t968; if (!t) return '—'; if (x != null) return (sign && x > 0 ? '+' : '') + x.toFixed(0); if (t.closeSlices > 0) return '마감'; if (!t.bgSlices) return '없음'; return '안 끝남'; };
function table(MDF, JSF) {
  const DIR = path.dirname(MDF);
  const runs = zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'packed.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const J = { runs: runs.length };
  const L = [];
  const boot = runs.filter((r) => r.mode === 'boot' && !r.scout && r.rc === 0);
  const worldName = { 'fresh-hanbando-lr': '한반도 갓 뜬(대조 · 긴 판 env)', 'fresh-hanbando': '한반도 갓 뜬', 'fresh-nippon': '닛폰 갓 뜬', 'ck700-on': '730날 저장(700날 체크포인트)', 'ck700-off': '730날 저장(700날 체크포인트)', 'ck1200-on': '1,200날 체크포인트', 'ck1200-off': '1,200날 체크포인트' };
  const wkey = (r) => r.world.replace(/-(on|off)$/, '');
  const plain = (r) => r.probe && !r.noshift;
  const grp = (rs, keyf) => { const m = new Map(); for (const r of rs) { const k = keyf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  const tookC = (r) => r.close && r.close.dist > 0;   // 첫 꼬리 마감이 거리 셈을 떠안았다(dist 단계 > 0)
  const longC = (r) => r.close && r.close.dist > 1000;   // 그중 1초 넘게(§3 묶음)
  // §1 · §2 — 부팅 표
  const OFFS = [60, 30, 10, 5, 2, 1];
  const bootRows = (worlds) => {
    const rows = [], jr = [];
    for (const w of worlds) for (const off of OFFS) for (const arm of ['on', 'off']) {
      const rs = boot.filter((r) => wkey(r) === w && r.off === off && r.arm === arm && plain(r));
      if (!rs.length) continue;
      const cl = rs.filter((r) => r.close);
      const o = { world: w, off, arm, runs: rs.length, withClose: cl.length,
        offReal: rs.map((r) => r.offReal), wall: cl.map((r) => r.close.wall), dist: cl.map((r) => r.close.dist), qN: cl.map((r) => r.close.qN), qMax: cl.map((r) => r.close.qMax),
        took: cl.filter(tookC).length, bgVsTail: rs.map((r) => (r.t968 ? r.t968.readyAtVsTail : null)), bgVsBoot: rs.map((r) => (r.t968 ? r.t968.readyAtVsBoot : null)), villages: med(rs.map((r) => r.villages)) };
      jr.push(o);
      rows.push([worldName[rs[0].world] || w, off, arm === 'on' ? '켬' : '끔', `${rs.length}`, rs.map((r) => (r.offReal == null ? '—' : r.offReal.toFixed(1) + (r.missed ? '(놓침)' : ''))).join(' · '),
        o.wall.map(s1).join(' · ') || '—', s1(mx(o.wall)), o.dist.map(s1).join(' · ') || '—', `${o.took}/${cl.length}`,
        o.qN.join(' · ') || '—', s1(mx(o.qMax)),
        rs.map((r) => bgWord(r, r.t968 && r.t968.readyAtVsBoot)).join(' · '), rs.map((r) => bgWord(r, r.t968 && r.t968.readyAtVsTail, true)).join(' · ')]);
    }
    return { rows, jr };
  };
  const head1 = ['세계', '경계 앞(목표 초)', '길 고침', '판', '실제 경계 앞 초(부팅 → 첫 꼬리)', '첫 꼬리 마감 s(판마다)', '최대 s', 'dist 단계 s', '떠안음', '그동안 선 요청', '가장 오래 기다린 요청 s', '배경 셈 끝(부팅 뒤 s)', '배경 셈 끝(꼬리 기준 s · − = 앞)'];
  const B1 = bootRows(['fresh-hanbando', 'fresh-nippon']);
  const B2 = bootRows(['fresh-hanbando-lr', 'ck700', 'ck1200']);
  J.boot = B1.jr; J.age = B2.jr;
  // 머리 수
  const fresh = boot.filter((r) => (r.world === 'fresh-hanbando' || r.world === 'fresh-nippon') && plain(r) && r.close);
  const aged = boot.filter((r) => /^ck/.test(r.world) && plain(r) && r.close);
  const maxOf = (rs, arm) => { let b = null; for (const r of rs) if (r.arm === arm && (!b || r.close.wall > b.close.wall)) b = r; return b; };
  const fOn = maxOf(fresh, 'on'), fOff = maxOf(fresh, 'off'), aOn = maxOf(aged, 'on'), aOff = maxOf(aged, 'off');
  // 떠안는 문턱: 갓 뜬 세계 켬에서 첫 꼬리가 dist 를 떠안은 판의 실제 경계 앞 초 가운데 가장 큰 값 · 안 떠안은 판의 가장 작은 값
  const tookOn = fresh.filter((r) => r.arm === 'on' && tookC(r)), notOn = fresh.filter((r) => r.arm === 'on' && !tookC(r));
  const thrTook = mx(tookOn.map((r) => r.offReal)), thrNot = notOn.length ? Math.min(...notOn.map((r) => r.offReal).filter((x) => x != null)) : null;
  const longRuns = boot.filter((r) => plain(r) && longC(r));
  const qMaxN = mx(longRuns.map((r) => r.close.qN));
  const discN = boot.filter((r) => plain(r)).reduce((a, r) => a + (r.disc ? r.disc.length : 0), 0);
  J.head = { firstMaxOn: fOn ? fOn.close.wall : null, firstMaxOnOff: fOn ? fOn.offReal : null, firstMaxOnWorld: fOn ? fOn.world : null, firstMaxOff: fOff ? fOff.close.wall : null, firstMaxOffOff: fOff ? fOff.offReal : null,
    agedMaxOn: aOn ? aOn.close.wall : null, agedMaxOnOff: aOn ? aOn.offReal : null, agedMaxOff: aOff ? aOff.close.wall : null, thrTook, thrNot, qMaxN, discN, tookOn: tookOn.length, freshOn: fresh.filter((r) => r.arm === 'on').length };
  L.push('# T1495 표 — 날 경계 앞 부팅 · 진짜 두 존 넘김 `/인출` · 맞닿은 두 마을(스크립트가 만든 표 · 손 셈 0)\n');
  L.push(`판 ${runs.length}개(묶음 \`packed.jsonl.gz\`). 하루 = 정본 24분(\`VILLAGE_DAY_MS\` 안 줌). "경계" = 그 존의 **꼬리 마감**(가장 서쪽 마을의 현지 자정 · 사람 요청이 줄 서는 마감). "부팅" = 존 로그 \`마을 시뮬 준비\` 순간.\n`);
  L.push('## §0 머리 수\n');
  L.push(md(['항목', '값'], [
    ['갓 뜬 세계 첫 꼬리 마감 최대 · 켬', fOn ? `${s1(fOn.close.wall)}초(${fOn.world} · 실제 경계 ${fOn.offReal}초 앞 · dist ${s1(fOn.close.dist)}초)` : '—'],
    ['갓 뜬 세계 첫 꼬리 마감 최대 · 끔', fOff ? `${s1(fOff.close.wall)}초(${fOff.world} · 실제 경계 ${fOff.offReal}초 앞)` : '—'],
    ['켬 · 첫 꼬리가 dist 를 떠안은 판', `${tookOn.length}/${fresh.filter((r) => r.arm === 'on').length}(갓 뜬 세계)`],
    ['떠안는 문턱(갓 뜬 세계 켬)', `떠안은 판의 실제 경계 앞 최대 ${thrTook == null ? '—' : thrTook + '초'} · 안 떠안은 판의 최소 ${thrNot == null ? '—' : thrNot + '초'}`],
    ['오래된 세계 첫 꼬리 마감 최대 · 켬', aOn ? `${s1(aOn.close.wall)}초(${aOn.world} · 경계 ${aOn.offReal}초 앞 · dist ${s1(aOn.close.dist)}초)` : '—'],
    ['오래된 세계 첫 꼬리 마감 최대 · 끔', aOff ? `${s1(aOff.close.wall)}초(${aOff.world} · 경계 ${aOff.offReal}초 앞)` : '—'],
    ['떠안은 마감 동안 선 요청 최대(귀 줄 · 한 마감)', qMaxN == null ? '—' : String(qMaxN)],
    ['봇 끊김(부팅 판 전부)', String(discN)],
  ])); L.push('');
  L.push('## §1 날 경계 앞 부팅 — 갓 뜬 세계(한반도 51 · 닛폰 36 · env 비움)\n');
  L.push('"떠안음" = 첫 꼬리 마감에 `dist` 단계(제품 `tickCtx.stg`)가 선 판(배경 셈 T968 이 경계 전에 못 끝나 나머지를 마감 ⑪ 이 민 판). "그동안 선 요청" = 귀 `p-<존>.queue.jsonl` 중 그 마감 창에 든 줄 수(봇 요청 다섯이 보낸 줄 서는 종류). 배경 셈 끝 = `/perf` `t968.ready` 가 1 이 된 때(초) · "마감" = 배경 셈이 경계 전에 못 끝나 꼬리 마감 ⑪ 이 나머지를 셈 · "없음" = 거리 다시 셈 일이 안 섰다(끔).\n');
  L.push(md(head1, B1.rows)); L.push('');
  L.push('## §2 살아 있는 저장에서 다시 뜬 세계(한반도 · 긴 판 env `T1495_PRESET=lr`)\n');
  L.push('700날 = T1489 `lr730-<팔>` 의 마지막 체크포인트(600날 체크포인트 DB 는 남지 않았다 — 판 자는 마지막 하나만 쥔다) · 1,200날 = 그 체크포인트에서 이 카드가 더 돌린 `lrx1200-<팔>`. 팔마다 제 세계(켬 판 = 켬으로 자란 세계).\n');
  L.push(md(head1, B2.rows)); L.push('');
  // §3 손님이 겪는 것
  L.push('## §3 그 마감 동안 손님이 겪는 것(봇 여덟: 걷기 셋 · 요청 다섯 `/인출` · 기부 · 거래 · 채팅 · 마을 화면 · 모두 250ms 핑)\n');
  L.push('마감 창에 걸친 요청 = 보낸 때 ≤ 마감 끝 그리고 답 ≥ 마감 시작. 러버밴드 = 걷는 봇의 서버 자리가 ack 된 입력만큼 안 나아간 몫이 32px(1m)를 넘은 번(클라 다시 걷기 꼴 — 표 입 `rubber`).\n');
  const g3 = [['떠안은 마감(켬 · dist > 1초)', boot.filter((r) => plain(r) && longC(r))], ['안 떠안은 마감 · 켬', boot.filter((r) => plain(r) && r.close && !longC(r) && r.arm === 'on')], ['끔', boot.filter((r) => plain(r) && r.close && r.arm === 'off')]];
  const r3 = [], j3 = [];
  for (const [name, rs] of g3) {
    if (!rs.length) continue;
    const reqIn = [].concat(...rs.map((r) => r.reqIn || []));
    const byT = {}; for (const x of reqIn) (byT[x[0]] || (byT[x[0]] = [])).push(x[2]);
    const lost = reqIn.filter((x) => x[2] == null).length;
    const walk = [].concat(...rs.map((r) => r.walk || []));
    const o = { group: name, runs: rs.length, closeMed: med(rs.map((r) => r.close.wall)), reqIn: reqIn.length, p50: med(reqIn.map((x) => x[2])), p90: q(reqIn.map((x) => x[2]), 0.9), p99: q(reqIn.map((x) => x[2]), 0.99), max: mx(reqIn.map((x) => x[2])), lost,
      closingSeen: reqIn.filter((x) => x[3]).length, byType: Object.fromEntries(Object.entries(byT).sort().map(([k, v]) => [k, { n: v.length, p50: med(v), max: mx(v) }])),
      disc: rs.reduce((a, r) => a + (r.disc ? r.disc.length : 0), 0), rubberIn: walk.reduce((a, w) => a + (w.nIn || 0), 0), rubberAll: walk.reduce((a, w) => a + (w.n || 0), 0), walkers: walk.filter((w) => w.n != null).length,
      maxDef: mx(walk.map((w) => w.maxDef)), tickGapMax: mx(rs.map((r) => r.tickGapMax)), pingInMax: mx(rs.map((r) => r.ping && r.ping.inMax)), pingInP99: med(rs.map((r) => r.ping && r.ping.inP99)), pingLost: rs.reduce((a, r) => a + (r.ping ? r.ping.inLost : 0), 0) };
    j3.push(o);
    r3.push([name, rs.length, s1(o.closeMed), o.reqIn, o.p50, o.p90, o.p99, o.max, o.lost, o.closingSeen, Object.entries(o.byType).map(([k, v]) => `${k} ${v.n}건 가운데 ${v.p50} · 최대 ${v.max}`).join(' / '), o.disc, `${o.rubberIn}(판 전체 ${o.rubberAll} · 걷는 봇 ${o.walkers})`, o.maxDef, o.tickGapMax, `${o.pingInMax} · p99 가운데 ${o.pingInP99}`]);
  }
  J.guests = j3;
  L.push(md(['마감', '판', '마감 가운데 s', '걸친 요청', '늦음 p50 ms', 'p90', 'p99', '최대', '답 없음', '"닫는 중" 알림 받은 요청', '종류별(가운데 · 최대 ms)', '끊김', '러버밴드(마감 창 ±)', '모자람 최대 px', '틱 사이 최대 ms', '핑 최대 ms(창 안)'], r3)); L.push('');
  // §4 두 존 넘김
  L.push('## §4 진짜 두 존 넘김(한반도 → 닛폰) 뒤 곧바로 닛폰 곳간 앞 `/인출`\n');
  L.push('거절 = "마을에서 너무 멉니다"(표시 빔) · "마을 한가운데에서 너무 멉니다"(옛 마을). 통과 = 거리 문을 넘어 "사람이 열지 않습니다"(NPC 곳간 · 손님 권한 거절 — 거리는 맞음). **클라 몫** = 클라 `evBriefedDay`(vid 열쇠 · 비움 없음)가 같은 번호를 오늘 이미 brief 했다고 보고 닛폰 마을에 brief 를 안 보낸 판의 거절 · **서버 몫** = brief 를 보냈는데도(또는 필요 없었는데도) 거절.\n');
  const cross = runs.filter((r) => r.mode === 'cross');
  const r4 = [], j4 = [];
  for (const r of cross) {
    const T = r.trials || [], val = T.filter((t) => !t.err);
    const ref = val.filter((t) => t.refused);
    const o = { tag: r.tag, arm: r.arm, tailS: r.meta.tailS, trials: T.length, valid: val.length, errs: T.filter((t) => t.err).map((t) => t.err), refused: ref.length, client: ref.filter((t) => t.part === 'client').length, server: ref.filter((t) => t.part === 'server').length,
      far: ref.filter((t) => t.far).length, stale: ref.filter((t) => t.stale).length, npc: val.filter((t) => t.npc).length, collide: val.filter((t) => t.collide).length, collideRef: ref.filter((t) => t.collide).length,
      withheld: val.filter((t) => t.withheld > 0 && !t.briefN).length, inClose: val.filter((t) => t.close).length, refInClose: ref.filter((t) => t.close).length, connMed: med(val.map((t) => t.connMs)), connMax: mx(val.map((t) => t.connMs)),
      vidOverlap: r.meta.vidOverlap, vh: r.meta.vh, vn: r.meta.vn, offH: r.meta.offH };
    j4.push(o);
    r4.push([r.tag, r.arm === 'near' ? 'T1490 켬' : 'main', r.meta.tailS, `${o.valid}/${o.trials}`, `${o.refused}/${o.valid}`, o.client, o.server, `${o.far} · ${o.stale}`, o.npc, `${o.collide}(거절 ${o.collideRef})`, o.withheld, `${o.inClose}(거절 ${o.refInClose})`, `${o.connMed} · ${o.connMax}`, `${o.vidOverlap}/${o.vn}`]);
  }
  J.cross = j4;
  L.push(md(['판', '서버', '한반도 꼬리 마감(부팅 뒤 초 · − = 판 동안 없음)', '유효/판', '거절', '클라 몫', '서버 몫', '빔 · 옛 마을', '통과(NPC 거절)', '같은 번호 판(거절)', 'brief 안 보냄', '마감 창에 걸침(거절)', '닛폰 붙기 ms 가운데 · 최대', '겹치는 마을 번호/닛폰'], r4)); L.push('');
  // §5 맞닿은 두 마을
  L.push('## §5 맞닿은 두 마을 사이를 걷는 손님(한반도 51 · 가장 가까운 두 마을)\n');
  L.push('한 판 = 새 몸 → B 곳간 앞(클라 근접 틱이 B brief) → A 문에서 400px 떨어진 깨끗한 자리 → A 문까지 걷는다(근접 틱이 A brief) → 닿고 0.3 ~ 0.9초 뒤 `/인출`. 첫 꼬리 마감이 판 가운데 오게 부팅을 맞췄다(`tailS`).\n');
  const adj = runs.filter((r) => r.mode === 'adj');
  const r5 = [], j5 = [];
  for (const r of adj) {
    const T = r.trials || [], val = T.filter((t) => !t.err);
    const ref = val.filter((t) => t.refused);
    const o = { tag: r.tag, arm: r.arm, tailS: r.meta.tailS, pairD: r.meta.pairD, trials: T.length, valid: val.length, refused: ref.length, far: ref.filter((t) => t.far).length, stale: ref.filter((t) => t.stale).length, npc: val.filter((t) => t.npc).length,
      inClose: val.filter((t) => t.close).length, refInClose: ref.filter((t) => t.close).length, refOut: ref.filter((t) => !t.close).length, stuck: val.filter((t) => t.stuck).length, dDoorMax: mx(val.map((t) => t.dDoor)), briefAmed: med(val.map((t) => t.briefA)) };
    j5.push(o);
    r5.push([r.tag, r.arm === 'near' ? 'T1490 켬' : 'main', r.meta.tailS, r.meta.pairD, `${o.valid}/${o.trials}`, `${o.refused}/${o.valid}`, `${o.far} · ${o.stale}`, o.npc, `${o.inClose}(거절 ${o.refInClose})`, o.refOut, `${o.stuck} · ${o.dDoorMax}`]);
  }
  J.adj = j5;
  L.push(md(['판', '서버', '첫 꼬리 마감(부팅 뒤 초)', '두 마을 거리 px', '유효/판', '거절', '빔 · 옛 마을', '통과(NPC 거절)', '마감 창에 걸친 판(거절)', '창 밖 거절', '못 닿음 · 문까지 최대 px'], r5)); L.push('');
  // §6 귀 무변 · §7 밀기 무변
  L.push('## §6 귀(`t1489-probe.js`) 있음 ↔ 없음 — 같은 목표 자리(한반도 갓 뜬 · 켬)\n');
  L.push('귀 없는 판은 존에 `--require` 자체가 없다(`T1495_PROBE=0`). 견주는 값은 귀와 무관한 자: `/perf`(제품 안 문) 꼬리 기록 · 배경 셈 · 봇 쪽 늦음.\n');
  const earKey = (r) => `${r.world}|${r.off}|${r.arm}`;
  const noear = boot.filter((r) => !r.probe);
  const r6 = [], j6 = [];
  for (const k of [...new Set(noear.map(earKey))].sort()) {
    for (const [name, rs] of [['있음', boot.filter((r) => r.probe && !r.noshift && earKey(r) === k)], ['없음', noear.filter((r) => earKey(r) === k)]]) {
      const o = { key: k, ear: name, runs: rs.length, offReal: rs.map((r) => r.offReal), work: rs.map((r) => (r.perfTail ? r.perfTail.total : null)), dist: rs.map((r) => (r.perfTail ? r.perfTail.dist : null)), queued: rs.map((r) => (r.perfTail ? r.perfTail.queued : null)),
        botMax: rs.map((r) => mx([...(r.reqIn || []).map((x) => x[2]), r.reqOut ? r.reqOut.max : null])), bgVsBoot: rs.map((r) => bgWord(r, r.t968 && r.t968.readyAtVsBoot)) };
      j6.push(o);
      r6.push([k.replace(/\|/g, ' · '), name, rs.length, o.offReal.join(' · '), o.work.map(s1).join(' · '), o.dist.map(s1).join(' · '), o.queued.join(' · '), o.botMax.map(s1).join(' · '), o.bgVsBoot.join(' · ')]);
    }
  }
  J.ear = j6;
  L.push(md(['자리', '귀', '판', '실제 경계 앞 초', '꼬리 일 합 s(/perf)', 'dist s(/perf)', '선 요청(/perf)', '봇 최대 늦음 s', '배경 셈 끝(부팅 뒤 s)'], r6)); L.push('');
  L.push('## §7 시계 밀기 ↔ 실제 경계 기다림(밀기 무변 대조)\n');
  const real = boot.filter((r) => r.noshift);
  const r7 = [];
  for (const r of real) { const peers = boot.filter((x) => x.probe && !x.noshift && earKey(x) === earKey(r) && x.close); r7.push([r.tag, r.K, r.offReal, r.close ? s1(r.close.wall) : null, r.close ? s1(r.close.dist) : null, bgWord(r, r.t968 && r.t968.readyAtVsBoot), peers.map((x) => `${s1(x.close.wall)}(${x.offReal})`).join(' · ')]); }
  J.real = r7;
  L.push(md(['판', 'K ms', '실제 경계 앞 초', '첫 꼬리 s', 'dist s', '배경 셈 끝(부팅 뒤 s)', '같은 자리 밀기 판 첫 꼬리 s(경계 앞 초)'], r7)); L.push('');
  // §8 판 목록
  L.push('## §8 판 목록\n');
  const r8 = runs.map((r) => [r.tag, r.rc, r.sec, r.mode || 'lrx', r.world || '', r.arm || '', r.K == null ? '' : r.K, r.bootMs == null ? '' : r.bootMs, r.offReal == null ? '' : r.offReal, r.villages == null ? '' : r.villages, r.err || (r.prog ? `${r.prog.ck}/${r.prog.days}날 · 마디 ${r.prog.segs.map((s) => `${s[0]}→${s[1]} ${s[2]}s`).join(' ')}` : '')]);
  L.push(md(['판', '끝 코드', '초', '모드', '세계', '팔', 'K(시계 밂 ms)', '부팅 ms', '실제 경계 앞 초', '마을', '비고'], r8)); L.push('');
  J.list = r8;
  fs.writeFileSync(MDF, L.join('\n'));
  fs.writeFileSync(JSF, JSON.stringify(J, null, 1) + '\n');
  console.log(`표 → ${MDF} · ${JSF}`);
}

if (opt('--pack')) pack(opt('--pack'), A[A.indexOf('--pack') + 2]);
else if (opt('--md') && opt('--json')) table(opt('--md'), opt('--json'));
else { console.error('쓰는 법: --pack <RAW> <DIR> | --md <파일> --json <파일>'); process.exit(2); }
