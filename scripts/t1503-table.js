#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · 표 입 · T1503 · 제품 코드 무접촉)
// =============================================================================
// scripts/t1503-table.js — T1503 표를 파일로(손 셈 0)
//   묶기:  node scripts/t1503-table.js --pack /var/tmp/t1503w 계측/T1503_<날짜>
//          = RAW/raw/<판>/ 의 판 자료(rig: meta.json · bots.jsonl · 귀 p-<존>.closes/queue.jsonl · j-<존>.jsonl · zlog · sbc: run.log · probe.jsonl · 존 로그)를
//            판마다 한 줄로 줄여 DIR/packed.jsonl.gz 에(원자료는 레포 밖 — 이 묶음이 증거 정본) + RAW/tests/*.rc(하네스 결과)
//   표:    node scripts/t1503-table.js --md 계측/T1503_<날짜>/table.md --json 계측/T1503_<날짜>/table.json
//          = 같은 폴더의 packed.jsonl.gz 만 읽는다(다시 내면 바이트 같음).
// 판 이름: g-<off|keep|on>(날 지문 400날) · br-<off|on>(다리 서고 끊기는 판 200날) · b-<han|nip>-3-<off|on>-<n>(갓 뜬 세계 · 경계 3초 앞) ·
//          f3 · f51-<off|on>-<n>(하루 0.6초 · 마을 3 · 51 — T1489 rl3 · rl51 꼴) · s- · o-han-3-<off|on>-<n>(저장에서 뜸 · 옛 저장본 꼴 T1340 끔) ·
//          d60-<off|on>(하루 60초 실시계 · 평소 마감 틱) · x-<near|main>-fix(두 존 넘김 · 클라 고침 흉내) · scout-* · s-scout · lr-save
// =============================================================================
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const readTxt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
const R = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x));
const R1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const q = (arr, p) => { const s = arr.filter((x) => x != null && Number.isFinite(x)).slice().sort((a, b) => a - b); if (!s.length) return null; return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (a) => q(a, 0.5);
const mx = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)); return s.length ? Math.max(...s) : null; };

// ── 묶기 ─────────────────────────────────────────────────────────────────────────
function gateLines(txt) {   // server-baseline-check 결과 줄(같음/다름 · 칸별 날 수)
  const L = txt.split('\n').map((l) => l.trim()).filter((l) => /같음|다름|판 실패|경제 \d+\/\d+|첫 갈림|GATE|결과/.test(l));
  return L.slice(-8).map((l) => l.slice(0, 300));
}
function jobSummary(rows, minDay) {   // 조각 CPU 귀(j-*.jsonl · probe.jsonl) — 창마다 한 줄
  const W = rows.filter((r) => (r.d | 0) >= minDay);
  const by = {};
  for (const r of W) for (const [n, sum, max, cnt] of r.top || []) { const b = by[n] || (by[n] = { max: 0, maxs: [], sum: 0, cnt: 0 }); if (max > b.max) b.max = max; b.maxs.push(max); b.sum += sum; b.cnt += cnt; }
  const jobs = Object.entries(by).map(([n, b]) => [n, R1(b.max), R1(q(b.maxs, 0.99)), R1(b.sum / Math.max(1, W.length)), b.cnt]).sort((a, b) => b[1] - a[1]).slice(0, 14);
  const fmax = W.map((r) => r.frameMaxMs), sim = W.map((r) => r.sim16), sums = W.filter((r) => r.kind === 'tail').map((r) => r.sumMs);
  let at = null; for (const r of W) if (at == null || r.frameMaxMs > at.ms) at = { ms: R1(r.frameMaxMs), d: r.d, kind: r.kind, max: r.max };
  let sAt = null; for (const r of W) if (sAt == null || r.sim16 > sAt.ms) sAt = { ms: R1(r.sim16), d: r.d, kind: r.kind, at: r.sim16At };
  const RES = /^caravan_sync|^dist$|^caravan_body$|^econ$/;   // 재개형(제 몫 · TB.slice 로 끊는다 — 가상 시계에선 몫이 안 닳아 한 번에 돈다 · `econ` = 머리 `_t681Flush` 전쟁 몸 몫)
  const atom = Object.entries(by).filter(([n]) => !RES.test(n)).map(([n, b]) => [n, b.max, q(b.maxs, 0.99)]).sort((a, b) => b[1] - a[1]);
  return { atomMax: atom[0] ? [atom[0][0], R1(atom[0][1]), R1(atom[0][2])] : null, atomTop: atom.slice(0, 8).map((x) => [x[0], R1(x[1]), R1(x[2])]), windows: W.length, days: new Set(W.map((r) => r.d)).size, frameMax: R1(mx(fmax)), frameP99: R1(q(fmax, 0.99)), frameMed: R1(med(fmax)), frameAt: at, sim16Max: R1(mx(sim)), sim16P99: R1(q(sim, 0.99)), sim16At: sAt, tailSumMed: R1(med(sums)), tailSumMax: R1(mx(sums)), frames: W.reduce((s, r) => s + (r.frames | 0), 0), jobs };
}
function pack(RAW, DIR) {
  const root = path.join(RAW, 'raw'), tags = fs.readdirSync(root).sort();
  const out = [];
  for (const tag of tags) {
    const D = path.join(root, tag), dn = path.join(RAW, 'done', tag + '.done');
    if (!fs.existsSync(dn)) continue;
    const [rc, sec] = fs.readFileSync(dn, 'utf8').trim().split(/\s+/).map(Number);
    const rec = { tag, rc, sec };
    if (/^(g|br)-/.test(tag)) {
      rec.kind = 'sbc';
      rec.gate = gateLines(readTxt(path.join(D, 'run.log')));
      const P = readJsonl(path.join(D, 'probe.jsonl'));
      rec.jobs = jobSummary(P, 2);
      const zl = fs.readdirSync(D).filter((f) => /^sbc-\d+\.log$/.test(f)).map((f) => readTxt(path.join(D, f))).join('\n').split('\n');
      rec.t1503 = zl.filter((l) => /\[T1503\]/.test(l)).map((l) => l.replace(/^\[[^\]]*\] /, '').slice(0, 260)).slice(0, 6);
      rec.distRuns = zl.filter((l) => /교역 BFS 거리행렬\(무효화 재계산\)/.test(l)).map((l) => { const m = /거리행렬\(무효화 재계산\)(\[[^\]]*\])*: (\d+)마을/.exec(l); const t = /\[★T1455 다리 몫 (\d+)쌍/.exec(l); const s = /\[★T977 같은 격자/.test(l); return t ? `다리 ${t[1]}쌍` : s ? '사본' : '전쌍'; });
      const bp = readJson(path.join(RAW, `${tag}.json`));   // T1455 귀(다리 판)
      if (bp && Array.isArray(bp.days)) {   // 다리 끊긴 날 · 거리 쌍 일이 선 날(값이 바뀐 날만)
        const ch = (k) => { const o = []; let p = 0; for (const x of bp.days) { const v = x && x.v ? (x.v[k] | 0) : 0; if (v !== p) { o.push([x.d, v]); p = v; } } return o; };
        const last = bp.days[bp.days.length - 1] || {};
        rec.bridge = { days: bp.days.length, built: last.built, cutDays: ch('cuts'), distDays: ch('distJobs'), iso: last.iso, finPairs: last.finPairs };
      }
    } else if (/^lr-/.test(tag)) {
      rec.kind = 'lr'; const P = readJson(path.join(D, 'run', 'progress.json')); rec.prog = P ? { days: P.days, ck: P.ck, done: !!P.done } : null;
    } else {
      rec.kind = 'rig';
      const M = readJson(path.join(D, 'meta.json')) || {};
      rec.meta = { mode: M.mode, arm: M.arm, srv: M.srv === 'main' ? 'main' : (M.srv ? 'near' : null), zone: M.zone, world: M.world, off: M.off, offReal: (M.D != null || M.scout) ? R1(M.offReal) : null, bootMs: M.bootMs, missed: !!M.missed, scout: !!M.scout, villages: M.villages, botsIn: M.botsIn, err: M.err || null, ck: M.ck ? 'ck' : null, vidOverlap: M.vidOverlap, vh: M.vh, vn: M.vn };
      const T0 = M.started || 0;
      const zones = M.zones || (M.zone ? [M.zone] : ['hanbando']);
      rec.z = {};
      for (const z of zones) {
        const C = readJsonl(path.join(D, `p-${z}.closes.jsonl`)), Q = readJsonl(path.join(D, `p-${z}.queue.jsonl`)), J = readJsonl(path.join(D, `j-${z}.jsonl`));
        const zl = readTxt(path.join(D, `zlog-${z}.txt`)).split('\n');
        const tails = C.filter((c) => !c.mini && !c.t690);
        const ft = tails[0] || null;
        const inWin = (c) => Q.filter((x) => c && x.t - x.waitMs >= c.t - c.wall - 5 && x.t - x.waitMs <= c.t);
        const fq = ft ? inWin(ft) : [];
        const allQ = Q.map((x) => x.waitMs);
        rec.z[z] = {
          closes: C.length, tails: tails.length,
          first: ft ? { day: ft.day, wall: R(ft.wall), cpu: R(ft.cpu), frames: ft.frames, frameMax: ft.frameMax, maxChunk: ft.maxChunk, at: ft.at, dist: R(ft.dist), villages: ft.villages, lagMax: ft.lag && ft.lag.max } : null,
          firstQ: { n: fq.length, med: R(med(fq.map((x) => x.waitMs))), max: R(mx(fq.map((x) => x.waitMs))) },
          q: { n: allQ.length, med: R1(med(allQ)), p99: R(q(allQ, 0.99)), max: R(mx(allQ)), types: [...new Set(Q.map((x) => x.type))].sort() },
          tailWall: tails.slice(0, 40).map((c) => [c.day, R(c.wall), R(c.dist), c.frameMax]),
          jobs: J.length ? jobSummary(J, 3) : null,
          t1503: zl.filter((l) => /\[T1503\]/.test(l)).map((l) => l.replace(/^\d+\t\[[^\]]*\] /, '').slice(0, 220)).slice(0, 6),
          distLines: zl.filter((l) => /교역 BFS 거리행렬/.test(l)).map((l) => { const m = /거리행렬(\([^)]*\))?[^:]*: (\d+)마을 \d+쌍 (\d+)ms/.exec(l); return m ? [m[1] ? m[1].slice(1, -1) : '부팅', +m[2], +m[3]] : null; }).filter(Boolean).slice(0, 6),
        };
      }
      const B = readJsonl(path.join(D, 'bots.jsonl'));
      const tr = B.filter((b) => b.k === 'trial');
      if (tr.length) rec.trials = tr.map((t) => ({ trial: t.trial, h: t.h, n: t.n, collide: !!t.collide, briefN: !!t.briefN, withheld: t.withheld | 0, refused: !!t.refused, part: t.part || null, far: !!t.far, stale: !!t.stale, npc: !!t.npc, ok: !!t.ok, err: t.err || null, fix: !!t.clientFix }));
      const rq = B.filter((b) => b.k === 'req');
      if (rq.length) rec.req = { n: rq.length, med: R(med(rq.map((x) => x.ms))), max: R(mx(rq.map((x) => x.ms))), closing: rq.filter((x) => x.closing).length, none: rq.filter((x) => x.ms == null).length };
    }
    out.push(rec);
  }
  const tests = {};
  try { for (const f of fs.readdirSync(path.join(RAW, 'tests')).filter((x) => /\.rc$/.test(x)).sort()) { const [rc, s] = readTxt(path.join(RAW, 'tests', f)).trim().split(/\s+/).map(Number); const lg = readTxt(path.join(RAW, 'tests', f.replace(/\.rc$/, '.log'))).split('\n').filter((l) => /결과|PASS|FAIL|통과|건 중/.test(l)).slice(-1)[0] || ''; tests[f.replace(/\.rc$/, '')] = { rc, s, last: lg.trim().slice(0, 160) }; } } catch (e) { /* */ }
  out.push({ tag: '~tests', tests });
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, 'packed.jsonl.gz'), zlib.gzipSync(out.map((o) => JSON.stringify(o)).join('\n') + '\n', { level: 9 }));
  console.log(`묶음 ${out.length - 1}판 → ${path.join(DIR, 'packed.jsonl.gz')}`);
}

// ── 표 ───────────────────────────────────────────────────────────────────────────
function table(DIR, mdOut, jsonOut) {
  const rows = zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'packed.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const T = new Map(rows.map((r) => [r.tag, r]));
  const by = (re) => rows.filter((r) => re.test(r.tag) && r.kind === 'rig');
  const zOf = (r) => r.meta && r.meta.zone ? r.meta.zone : 'hanbando';
  const first = (r) => (r.z && r.z[zOf(r)] && r.z[zOf(r)].first) || null;
  const ok = (r) => r && r.rc === 0 && !(r.meta && (r.meta.missed || r.meta.err));
  const shape = (re) => { const rs = by(re).filter(ok); const w = rs.map((r) => first(r) && first(r).wall).filter((x) => x != null); return { n: rs.length, med: R(med(w)), max: mx(w), min: w.length ? Math.min(...w) : null, runs: rs.map((r) => [r.tag, r.meta.offReal, first(r) ? first(r).wall : null, first(r) ? first(r).dist : null, r.meta.bootMs, first(r) ? first(r).frameMax : null]) }; };
  const S = {
    f3off: shape(/^f3-off-/), f3on: shape(/^f3-on-/), f51off: shape(/^f51-off-/), f51on: shape(/^f51-on-/),
    hanoff: shape(/^b-han-3-off-/), hanon: shape(/^b-han-3-on-/), nipoff: shape(/^b-nip-3-off-/), nipon: shape(/^b-nip-3-on-/),
    saveoff: shape(/^s-han-3-off-/), saveon: shape(/^s-han-3-on-/), oldoff: shape(/^o-han-3-off-/), oldon: shape(/^o-han-3-on-/),
  };
  const qAll = (re) => { const rs = by(re).filter(ok); const fq = rs.map((r) => r.z[zOf(r)].firstQ).filter((x) => x && x.n); const all = rs.map((r) => r.z[zOf(r)].q).filter((x) => x && x.n); return { runs: rs.length, firstN: fq.reduce((s, x) => s + x.n, 0), firstMed: R(med(fq.map((x) => x.med))), firstMax: mx(fq.map((x) => x.max)), allN: all.reduce((s, x) => s + x.n, 0), allMedMed: R1(med(all.map((x) => x.med))), allMax: mx(all.map((x) => x.max)) }; };
  const Q = { on: qAll(/^(b-(han|nip)-3|f3|f51)-on-/), off: qAll(/^(b-(han|nip)-3|f3|f51)-off-/) };
  const d60 = (tag) => { const r = T.get(tag); const z = r && r.z && r.z.hanbando; return z && z.jobs ? Object.assign({ tails: z.tails }, z.jobs) : null; };
  const D60 = { off: d60('d60-off'), on: d60('d60-on') };
  const gate = (tag) => { const r = T.get(tag); return r ? { rc: r.rc, sec: r.sec, gate: r.gate, t1503: r.t1503, dist: r.distRuns, jobs: r.jobs ? { atomMax: r.jobs.atomMax, atomTop: r.jobs.atomTop, tailSumMed: r.jobs.tailSumMed, top: r.jobs.jobs.slice(0, 10) } : null, bridge: r.bridge || null } : null; };
  const G = { off: gate('g-off'), keep: gate('g-keep'), on: gate('g-on'), broff: gate('br-off'), bron: gate('br-on') };
  const cross = (tag) => { const r = T.get(tag); if (!r || !r.trials) return null; const t = r.trials.filter((x) => !x.err); return { n: t.length, err: r.trials.length - t.length, refused: t.filter((x) => x.refused).length, client: t.filter((x) => x.part === 'client').length, server: t.filter((x) => x.part === 'server').length, collide: t.filter((x) => x.n === x.h).length, briefCollide: t.filter((x) => x.n === x.h && x.briefN).length, refusedCollide: t.filter((x) => x.n === x.h && x.refused).length, withheld: t.reduce((s, x) => s + x.withheld, 0), overlap: r.meta.vidOverlap }; };
  const X = { near: cross('x-near-fix'), main: cross('x-main-fix') };
  const tests = (T.get('~tests') || {}).tests || {};
  const H = { S, Q, D60, G, X, tests, runs: rows.filter((r) => r.tag[0] !== '~').map((r) => [r.tag, r.rc, r.sec]) };
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(H, null, 1) + '\n');
  const f0 = (x) => (x == null ? '—' : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const s1 = (x) => (x == null ? '—' : (x / 1000).toFixed(1));
  const L = [];
  L.push('# T1503 표 — 첫 하루 마감 · 거리표 · 평소 마감 틱 (손 셈 0 · `node scripts/t1503-table.js` 가 `packed.jsonl.gz` 만 읽어 낸다)', '');
  L.push('## §0 머리', '', '| 항목 | 끔(main 꼴) | 켬(T1503_DIST_KEEP=1 · T1503_CLOSE_SLICE=1) | 근거 |', '|---|---|---|---|');
  const sh = (a, b, src) => L.push(`| ${src[0]} | ${s1(S[a].med)}초(n ${S[a].n} · 최대 ${s1(S[a].max)}) | ${s1(S[b].med)}초(n ${S[b].n} · 최대 ${s1(S[b].max)}) | ${src[1]} |`);
  sh('f3off', 'f3on', ['갓 뜬 첫 마감 · 마을 3 · 하루 0.6초', 'f3-* 첫 꼬리 마감 벽시계(T1489 rl3 꼴)']);
  sh('f51off', 'f51on', ['51마을 첫 마감 · 하루 0.6초', 'f51-* (T1489 rl51 꼴)']);
  sh('hanoff', 'hanon', ['경계 3초 앞 부팅 · 한반도 51 · 하루 24분', 'b-han-3-* (T1495 꼴)']);
  sh('nipoff', 'nipon', ['경계 3초 앞 부팅 · 닛폰 36', 'b-nip-3-*']);
  sh('saveoff', 'saveon', ['저장에서 뜸 · 경계 3초 앞', 's-han-3-* (lr-save 3날 체크포인트)']);
  sh('oldoff', 'oldon', ['옛 저장본 꼴(T1340_RESUME_EXACT=0 — 행렬 · 도랑 지문 안 되살림) · 경계 3초 앞', 'o-han-3-*']);
  L.push(`| 평소 마감 가장 긴 틱(실시계 · 하루 60초 · 51마을 · 3날~ · 마감 몫 CPU) | ${D60.off ? `${D60.off.frameMax} ms(p99 ${D60.off.frameP99} · 창 ${D60.off.windows})` : '—'} | ${D60.on ? `${D60.on.frameMax} ms(p99 ${D60.on.frameP99} · 창 ${D60.on.windows})` : '—'} | d60-* 조각 귀(드레인 틱 CPU) |`);
  const am = (g) => (g && g.jobs && g.jobs.atomMax ? `${g.jobs.atomMax[1]} ms(${g.jobs.atomMax[0]} · 날마다 최대의 p99 ${g.jobs.atomMax[2]})` : '—');
  L.push(`| 가상 시계 400날 — 가장 큰 통짜 조각 CPU(재개형 캐러밴 동기 · 거리 뺌 — 끔은 틱 = 몫 + 이것 · 켬은 이것 하나) | ${am(G.off)} | ${am(G.on)} | g-* 조각 귀(2날~) · 아래 §3 |`);
  L.push(`| 줄 선 요청(첫 꼬리 마감 창) 가운데 · 최대 | ${f0(Q.off.firstMed)} · ${f0(Q.off.firstMax)} ms(${Q.off.firstN}건) | ${f0(Q.on.firstMed)} · ${f0(Q.on.firstMax)} ms(${Q.on.firstN}건) | 귀 queue(줄에 든 때 → 처리) |`);
  L.push(`| 줄 선 요청(판 전체) 판 가운데의 가운데 · 최대 | ${Q.off.allMedMed} · ${f0(Q.off.allMax)} ms(${Q.off.allN}건) | ${Q.on.allMedMed} · ${f0(Q.on.allMax)} ms(${Q.on.allN}건) | 〃 |`);
  const gl = (g) => (g ? (g.gate || []).filter((l) => /같음|다름|실패/.test(l)).slice(-1)[0] || `rc ${g.rc}` : '—');
  L.push(`| 날 지문 400날 1020(서버기준선_2026-11-18 · 가상 시계) | ${gl(G.off)} | 거리만 켬 ${gl(G.keep)} · 둘 다 ${gl(G.on)} | g-* |`);
  L.push(`| 다리 서고 끊기는 판(T1455 · 200날 · 끔 판을 기준선으로) | 기준선 만들기 rc ${G.broff ? G.broff.rc : '—'} | ${gl(G.bron)} | br-* |`);
  L.push(`| 두 존 넘김 \`/인출\` 거절(클라 고침 흉내) | main + 고침 ${X.main ? `${X.main.refused}/${X.main.n}` : '—'} | T1490 + 고침 ${X.near ? `${X.near.refused}/${X.near.n}` : '—'} | x-*-fix |`);
  L.push('');
  L.push('## §1 첫 마감 판마다 (판 · 경계 앞 실제 초 · 첫 꼬리 마감 ms · 그 마감 dist 단계 ms · 부팅 ms · 그 마감 가장 긴 드레인 틱 ms — 하루 0.6초 판 켬은 마감이 하루보다 길어 다음 창에 그 틱에 다 닫은 틱)', '');
  for (const [k, v] of Object.entries(S)) L.push(`- **${k}** — ${v.runs.map((x) => `${x[0]}: ${x[1] == null ? '' : x[1] + '초 앞 · '}${f0(x[2])} · dist ${f0(x[3])} · 부팅 ${f0(x[4])} · 틱 ${f0(x[5])}`).join(' / ') || '—'}`);
  L.push('');
  L.push('## §2 [T1503] 존 로그 줄(켬 판 — 도랑 다시 판정 · 부팅 셈)', '');
  for (const r of rows.filter((x) => x.kind === 'rig' && /-on-|^d60-on/.test(x.tag))) for (const [z, zz] of Object.entries(r.z || {})) if (zz.t1503 && zz.t1503.length) L.push(`- ${r.tag}(${z}): ${zz.t1503.join(' ‖ ')}`);
  for (const k of ['keep', 'on']) if (G[k] && G[k].t1503) L.push(`- g-${k}: ${G[k].t1503.join(' ‖ ')}`);
  L.push('');
  L.push('## §3 평소 마감 — 조각별 CPU(ms)', '');
  for (const [k, d] of Object.entries(D60)) if (d) { L.push(`- **실시계 d60-${k}**(꼬리 ${d.tails} · 창 ${d.windows} · 드레인 틱 ${d.frames}): 마감 몫 틱 CPU 가장 김 ${d.frameMax} · p99 ${d.frameP99} · 가운데 ${d.frameMed} ms · 가장 긴 틱 = 날 ${d.frameAt && d.frameAt.d} ${d.frameAt && d.frameAt.kind} 조각 ${d.frameAt && JSON.stringify(d.frameAt.max)} · 16ms 담기 셈 ${d.sim16Max}`); L.push(`  - 조각 이름 · 최대 · p99(창마다 최대의) · 창 평균 합 · 수: ${d.jobs.map((j) => `${j[0]} ${j[1]} · ${j[2]} · ${j[3]} · ${j[4]}`).join(' / ')}`); }
  for (const k of ['off', 'on']) if (G[k] && G[k].jobs) L.push(`- **가상 시계 g-${k} 통짜 조각**(이름 · 400날 최대 · 날마다 최대의 p99): ${G[k].jobs.atomTop.map((j) => `${j[0]} ${j[1]} · ${j[2]}`).join(' / ')}`);
  for (const k of ['off', 'on']) if (G[k] && G[k].jobs) L.push(`- **가상 시계 g-${k}**(400날 · 2날~ · ⚠ 몫이 안 닳아 재개형 조각(캐러밴 동기 A* · 교역 · 장부 발생기 · 거리)이 한 번에 돈다 — 그 조각 CPU 는 실시계 틱 길이가 아니다): 꼬리 합 가운데 ${G[k].jobs.tailSumMed} ms · 조각: ${G[k].jobs.top.map((j) => `${j[0]} ${j[1]}/${j[2]}`).join(' · ')}`);
  L.push('');
  L.push('## §4 날 지문 · 다리 판', '');
  for (const [k, g] of Object.entries(G)) if (g) { L.push(`- **${k}** rc ${g.rc} · ${f0(g.sec)}초 · 거리 다시 세기 ${g.dist ? `${g.dist.length}번(${[...new Set(g.dist)].map((x) => `${x} ${g.dist.filter((y) => y === x).length}`).join(' · ')})` : '—'}`); for (const l of g.gate || []) L.push(`  - \`${l}\``); if (g.bridge) L.push(`  - 다리 귀 날 ${g.bridge.days} · 선 다리 ${g.bridge.built} · 끊긴 다리 누계가 바뀐 날 ${g.bridge.cutDays.map((x) => `${x[0]}:${x[1]}`).join(' ')} · 거리 쌍 일 누계가 바뀐 날 ${g.bridge.distDays.map((x) => `${x[0]}:${x[1]}`).join(' ')} · 고립 ${g.bridge.iso} · 닿는 쌍 ${g.bridge.finPairs}`); }
  L.push('');
  L.push('## §5 두 존 넘김 `/인출`(한반도 → 닛폰 걸어 넘김 · 클라 고침 흉내 = 새 몸 welcome 에 brief 표 비움)', '');
  for (const [k, x] of Object.entries(X)) if (x) L.push(`- **${k}**: 거절 ${x.refused}/${x.n}(클라 몫 ${x.client} · 서버 몫 ${x.server}) · 같은 번호 판(닛폰 N = 한반도 H 번호) ${x.collide}(그 판 닛폰 brief 보냄 ${x.briefCollide} · 거절 ${x.refusedCollide}) · 클라가 막은 brief ${x.withheld} · 겹치는 번호 ${x.overlap} · 판 실패 ${x.err}`);
  L.push('');
  L.push('## §6 하네스(이 상자 · RAW/tests)', '');
  for (const [k, t] of Object.entries(tests)) L.push(`- ${k}: rc ${t.rc}${t.s == null ? '' : ` · ${t.s}초`} · ${t.last}`);
  L.push('');
  L.push('## §7 판 줄(판 · 끝 코드 · 초)', '');
  L.push(H.runs.map((r) => `${r[0]} ${r[1]} ${r[2]}`).join(' · '));
  L.push('');
  if (mdOut) fs.writeFileSync(mdOut, L.join('\n'));
  console.log(`표 → ${mdOut || '-'} · ${jsonOut || '-'}`);
}

if (opt('--pack')) { const i = A.indexOf('--pack'); pack(A[i + 1], A[i + 2]); }
else if (opt('--md') || opt('--json')) { const md = opt('--md'), js = opt('--json'); table(path.dirname(md || js), md, js); }
else { console.error('쓰는 법: --pack <RAW> <DIR> | --md <DIR/table.md> --json <DIR/table.json>'); process.exit(2); }
