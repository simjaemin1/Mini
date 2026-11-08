// (@regress 없음 — 계측 훅 · 러너 밖 · T1226 · 판정 0)
// === scripts/t1226-job-hook.js — 직업 바꾸기 계측: 날마다 사람마다 직업을 읽어 바꾼 수 · 되돌림 · 진동 · 철 몫 · 흉년/어장 마름 옮겨 가는 날 ===
//
// 쓰는 법(프리로드 — 세계에 손대지 않는다 · 판 갈래 `T1226_SCEN` 만 땅을 바꾼다):
//   랩(econ 판):  NODE_OPTIONS="--require scripts/t1226-job-hook.js" T1226_OUT=/tmp/x.json node scripts/t17-metrics.js 400 1020
//   서버 판:      NODE_OPTIONS="--require $PWD/scripts/t1226-job-hook.js" T1226_OUT=/tmp/x node scripts/server-baseline-check.js --make /tmp/b.json --vclock ...
//                 (존 아이마다 `<T1226_OUT>.<시드>.json` — 시드는 t577 이 넘기는 `T577_SEED`)
//   판 갈래(랩 전용): T1226_SCEN=harvest — D0(`T1226_D0` · 기본 100)부터 365날 비옥도 × 0.5(한 해 수확 반)
//                    T1226_SCEN=fish    — D0 부터 끝까지 물(어획 CPUE) × 0.5 · 어장 MSY 칸(있으면) × 0.5(어장 재고 반 — 쉐퍼: 어획 ∝ 재고)
//
// 읽는 곳: 사건 장부 `scanDay`(econ 하루 끝 — t17 · t577 · server-baseline-check 가 같은 문을 쓴다).
// 셈:
//   바꾼 수 — 어제 있던 사람의 직업이 오늘 다르면 1(출생 · 죽음 · 떠남은 안 셈 · 징발은 직업이 그대로라 안 셈)
//   30날 되돌림 — A→B 뒤 30날 안 B→A · 처음 해 보는 일 되돌림 — 바꾼 날 그 분야 숙련 0 이던 일에서 30날 안 되돌아옴
//   철 진동 — 되돌림(A→B→A) 가운데 두 번이 다른 철이고 365날 안
//   진동 — 마을 · 직업마다 그날 바꾸기 순유입(든 − 난)의 부호가 바뀐 수 합(0 인 날은 건너뜀 · 출생 · 죽음은 안 셈)
//   철 몫 — 철마다 직업별 사람-날 몫
//   옮겨 가는 날 — D0 앞날 식량 일꾼(농 · 어 · 사냥 · 채집) 수보다 많아진 첫날까지(흉년) · 어부가 있던 마을의 어부 밖 식량 일꾼이 늘어난 첫날까지(어장 마름)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.T1226_OUT;
const SCEN = process.env.T1226_SCEN || '';
const D0 = parseInt(process.env.T1226_D0 || '100', 10);
const TRACE = String(process.env.T1226_TRACE || '').split(',').filter(Boolean);
const FOOD = { farmer: 1, fisher: 1, hunter: 1, forager: 1 };
if (OUT) {
  const Ev = require(path.join(ROOT, 'server', 'events'));
  let seasonOf = null; try { seasonOf = require(path.join(ROOT, 'sim', 'economy-sim-v2')).seasonOf || null; } catch (e) { seasonOf = null; }
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const seas = (d) => { try { if (seasonOf) return seasonOf(d); } catch (e) {} return ['spring', 'summer', 'autumn', 'winter'][Math.floor(((d % 365) + 365) % 365 / 91.25) % 4]; };
  const fieldOf = (job) => (job === 'hunter' ? null : (E.JOBS && E.JOBS[job] && E.JOBS[job].field));
  const skillOf = (p, job) => { if (!p.skills) return 0; if (job === 'hunter') return ((p.skills.hunting || 0) + (p.skills.archery || 0)) / 2; const f = fieldOf(job); return f ? (p.skills[f] || 0) : 0; };
  const M = { days: 0, swBy50: {}, small: {}, emptyNames: [], switches: 0, rev30: 0, firstSw: 0, firstRev30: 0, seasRev: 0, osc: 0, maxVillageDay: 0, sharesBySeason: {}, popEnd: 0, emptyEnd: 0, villages: 0,
    scen: SCEN || null, d0: SCEN ? D0 : null, trans: null, lookDays: null, flex: E.t1226On ? E.t1226On() : null, stat: null };
  const prev = new Map();     // 사람 id → { job, sk: {job: skill} }
  const hist = new Map();     // 사람 id → [ { d, from, to, first } ] (최근 몇 개)
  const vshare = new Map();   // 마을 이름 → { job: [lastShare, lastSign] }
  const base = new Map();     // 마을 이름 → { food, fisher, nonFish } (D0 앞날)
  const trans = new Map();    // 마을 이름 → 옮겨 간 첫날
  let applied = false, restored = false, last = -1;
  const scen = (world, d) => {
    if (!SCEN) return;
    if (d === D0 - 1 && !applied) {
      applied = true;
      for (const v of world.villages || []) {
        const o = v._origLand || v.land; if (!o) continue;
        if (SCEN === 'harvest') { o.fertility *= 0.5; }
        if (SCEN === 'fish') {
          o.water *= 0.5;
          for (const k of ['fishSustain']) { if (typeof o[k] === 'number') o[k] *= 0.5; if (v.land && v.land !== o && typeof v.land[k] === 'number') v.land[k] *= 0.5; }
          if (typeof v._fishMsySeed === 'number') v._fishMsySeed *= 0.5;
        }
        const c = {}; for (const p of v.npcs || []) c[p.currentJob] = (c[p.currentJob] || 0) + 1;
        let food = 0; for (const j in FOOD) food += c[j] || 0;
        base.set(v.name, { food, fisher: c.fisher || 0, nonFish: food - (c.fisher || 0) });
      }
    }
    if (SCEN === 'harvest' && applied && !restored && d === D0 + 365 - 1) {
      restored = true;
      for (const v of world.villages || []) { const o = v._origLand || v.land; if (o) o.fertility *= 2; }
    }
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last && world && Array.isArray(world.villages)) {
          last = d; M.days++;
          const VL = world.villages.map((x) => (x && x.econ && Array.isArray(x.econ.npcs)) ? Object.assign(Object.create(x.econ), { name: x.name || x.econ.name }) : x);   // 서버 판 = 마을 줄의 econ
          const sn = seas(d); const SB = M.sharesBySeason[sn] || (M.sharesBySeason[sn] = { n: 0 });
          for (const v of VL) {
            const npcs = v.npcs || []; const N = npcs.length;
            const c = {}, net = {}; let swV = 0;
            for (const p of npcs) {
              if (!p || p.id == null) continue;
              const j = p.currentJob; c[j] = (c[j] || 0) + 1; SB[j] = (SB[j] || 0) + 1; SB.n++;
              const q = prev.get(p.id);
              if (q && q.job !== j) {
                M.switches++; swV++; { const bk = Math.floor((d - 1) / 50) * 50; M.swBy50[bk] = (M.swBy50[bk] || 0) + 1; } net[q.job] = (net[q.job] || 0) - 1; net[j] = (net[j] || 0) + 1;
                const first = (q.sk[j] || 0) <= 0;
                if (first) M.firstSw++;
                const H = hist.get(p.id) || [];
                const back = H.length ? H[H.length - 1] : null;
                if (back && back.from === j && back.to === q.job) {
                  if (d - back.d <= 30) { M.rev30++; if (back.first) M.firstRev30++; }
                  if (seas(back.d) !== sn && d - back.d <= 365) M.seasRev++;
                }
                H.push({ d, from: q.job, to: j, first }); if (H.length > 4) H.shift(); hist.set(p.id, H);
              }
              const sk = {}; for (const jj of Object.keys(E.JOBS || {})) { const s = skillOf(p, jj); if (s > 0) sk[jj] = s; }
              prev.set(p.id, { job: j, sk });
            }
            if (swV > M.maxVillageDay) M.maxVillageDay = swV;
            // 진동 — 마을 · 직업마다 그날 바꾸기로 든 사람 − 난 사람(출생 · 죽음 · 떠남 밖)의 부호가 앞선 0 아닌 날과 바뀐 수
            const VS = vshare.get(v.name) || {}; vshare.set(v.name, VS);
            for (const j of Object.keys(net)) { const x = net[j]; if (!x) continue; const sg = x > 0 ? 1 : -1; if (VS[j] && VS[j] !== sg) M.osc++; VS[j] = sg; }
            // 옮겨 가는 날
            const b = base.get(v.name);
            if (b && d >= D0 && !trans.has(v.name)) {
              let food = 0; for (const j in FOOD) food += c[j] || 0;
              const nonFish = food - (c.fisher || 0);
              if (SCEN === 'harvest' && food > b.food) trans.set(v.name, d - D0 + 1);
              if (SCEN === 'fish' && b.fisher > 0 && nonFish > b.nonFish) trans.set(v.name, d - D0 + 1);
            }
          }
          scen(world, d);
          let pop = 0, empty = 0; for (const v of VL) { const n = (v.npcs || []).length; pop += n; if (!n) empty++; }
          M.popEnd = pop; M.emptyEnd = empty; M.villages = VL.length;
          for (const v of VL) { const n = (v.npcs || []).length; if (n > 0 && (n <= 6 || ((TRACE.includes(v.name) || TRACE.includes('*')) && d % 5 === 0))) { const T = M.small[v.name] || (M.small[v.name] = []); const c = {}; for (const p of v.npcs) c[p.currentJob] = (c[p.currentJob] || 0) + 1; T.push([d, n, Object.entries(c).map((x) => x.join(':')).join(' '), (TRACE.includes(v.name) || TRACE.includes('*')) ? ['food', 'tool', 'stone', 'wood'].map((k) => k + '=' + Math.round((v.storage || {})[k] || 0)).join(' ') : '']); if (T.length > ((TRACE.includes(v.name) || TRACE.includes('*')) ? 400 : 40)) T.shift(); } }
          M.emptyNames = VL.filter((v) => !(v.npcs || []).length).map((v) => v.name);
        }
      } catch (e) { M.err = String(e && e.stack || e).slice(0, 400); }
      return sd.apply(this, arguments);
    };
    return L;
  };
  const dump = () => {
    try {
      if (SCEN) {
        const elig = [...base.entries()].filter(([, b]) => SCEN === 'harvest' ? true : b.fisher > 0).map(([k]) => k);
        const ds = elig.map((k) => trans.get(k)).filter((x) => x != null);
        const lim = Math.max(1, M.days - D0 + 1);
        // 안 옮긴 마을은 남은 날 전부로 친다(짧게 보이는 착시 금지)
        const all = elig.map((k) => (trans.has(k) ? trans.get(k) : lim));
        M.trans = { villages: elig.length, moved: ds.length, meanMoved: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null,
          meanAll: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null, median: ds.length ? ds.slice().sort((a, b) => a - b)[Math.floor(ds.length / 2)] : null };
      }
      if (E._t1226Stat) M.stat = Object.assign({}, E._t1226Stat);
      for (const sn of Object.keys(M.sharesBySeason)) { const S = M.sharesBySeason[sn]; const n = S.n || 1; const o = {}; for (const k of Object.keys(S)) if (k !== 'n') o[k] = +(S[k] / n).toFixed(4); M.sharesBySeason[sn] = o; }
      if (!M.days) return;   // 장부를 안 돈 프로세스(판 자 부모 · 견주기 부모) — 쓰지 않는다
      let file = OUT;
      if (process.env.T577_SEED) file = OUT + '.' + process.env.T577_SEED + '.json';   // 서버 판 = 존 아이(시드는 t577 이 env 로 준다)
      fs.writeFileSync(file, JSON.stringify(M, null, 1));
    } catch (e) { /* 계측 실패는 판을 안 막는다 */ }
  };
  process.on('exit', dump);
}
