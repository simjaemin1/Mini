#!/usr/bin/env bash
# (@regress 없음 — 러너 밖 · T750 ② 실서버 빼앗김 자 · 읽기만 · 서버 무변경 · 판정 0)
# === scripts/t750-steal.sh — 존 프로세스 주 스레드가 **돈 · 줄 선 · 빼앗긴** 시간을 바깥에서 잰다(/proc 만 읽는다) ===
#
# 쓰는 법(재민 · 서버에서):
#   bash scripts/t750-steal.sh                 # 존 PID 자동(pgrep 'server/zone.js' 첫 줄) · 300초 · 결과 /tmp/t750-steal-<호스트>-<시각>.json
#   bash scripts/t750-steal.sh 600 12345       # 600초 · PID 12345(존이 여럿이면 PID 를 준다)
#   GC_LOG=/var/log/durango/zone.log bash scripts/t750-steal.sh   # (덧) 그 창 안 존 로그의 "GC 정지" 줄도 센다(존이 30 ms 넘는 GC 를 이미 찍는다)
#   PERF_URL=http://127.0.0.1:<존 포트>/perf bash scripts/t750-steal.sh   # (덧) 창 앞뒤 존 `/perf` 틱 ms — 안 문 비밀은 부르는 쪽 env `CENTRAL_SECRET`(이 자는 읽기만 · 안 적는다)
#
# 무엇을 재나(T734 T686 자의 바깥 판 — 존 몸에 손 0):
#   · 5 ms 마다 주 스레드(`/proc/<pid>/task/<pid>/schedstat` 돈 ns · 줄 선 ns · `stat` 상태 글자)를 읽는다.
#   · 'R' 표본이 이어지고 그 사이 주 스레드가 한 번도 안 잠들었으면(스레드 자발 전환 수 그대로) **바쁜 줄**이다(틱 사이 쉼은 끊는다).
#     20 ms 넘는 바쁜 줄마다 **빼앗김** = 벽 − 돈 − 줄 선(VM vCPU 빼앗김 · 인터럽트) — T734 의 "빼앗김"과 같은 셈 · 8 ms 넘으면 한 방.
#   · 100 ms 마다 `/proc/stat` CPU 별 steal(하이퍼바이저가 가져간 시간) · 창 전체 irq+softirq(인터럽트 처리 — 이것도 스레드 몫에서 빠진다) · 문맥 전환(자발 · 비자발).
#   · 눈금 맞춤(T750 상자 · 2 vCPU · 바쁜 고리 한 프로세스 12초 = 바쁜 줄 하나): 빼앗김 1.8 % ≈ steal 2.1 % + irq 0.2 % — 빼앗김은 "스레드가 돌려 했는데 못 쓴 벽 시간"이다.
#   · 결과 JSON 한 장: 바쁜 칸 수 · 빼앗김 합 · p99 · 최대 · 5 ms / 15 ms 넘은 칸 · 줄 섬 같은 꼴 · steal % · 문맥 전환 · (덧) GC 줄 · /perf 틱.
#   ⚠자 자신도 CPU 를 조금 쓴다(5 ms 마다 작은 파일 둘 읽기 · 한 코어의 1~2 %). 서버 · DB · 존 상태에 쓰는 것 0.
set -euo pipefail
SECS="${1:-300}"
PID="${2:-$(pgrep -f 'server/zone.js' | head -n 1 || true)}"
if [ -z "${PID}" ] || [ ! -r "/proc/${PID}/task/${PID}/schedstat" ]; then echo "존 PID 를 못 찾았다(둘째 인자로 주거나 같은 사용자로 돌린다): '${PID}'" >&2; exit 2; fi
OUT="${OUT:-/tmp/t750-steal-$(hostname)-$(date +%Y%m%d-%H%M%S).json}"
GC_LOG="${GC_LOG:-}" PERF_URL="${PERF_URL:-}" exec node - "${PID}" "${SECS}" "${OUT}" <<'JS'
'use strict';
const fs = require('fs'), os = require('os');
const [pid, secs, out] = [process.argv[2], +process.argv[3], process.argv[4]];
const SCH = `/proc/${pid}/task/${pid}/schedstat`, ST = `/proc/${pid}/task/${pid}/stat`, STATUS = `/proc/${pid}/status`, TSTATUS = `/proc/${pid}/task/${pid}/status`;
const sch = () => { const a = fs.readFileSync(SCH, 'utf8').split(' '); return [+a[0] / 1e6, +a[1] / 1e6]; };   // [돈 ms · 줄 선 ms]
const state = () => { const s = fs.readFileSync(ST, 'utf8'); return s.charAt(s.lastIndexOf(')') + 2); };
const cpuSteal = () => fs.readFileSync('/proc/stat', 'utf8').split('\n').filter((l) => /^cpu\d/.test(l)).map((l) => { const f = l.trim().split(/\s+/).slice(1).map(Number); return { tot: f.reduce((a, b) => a + b, 0), steal: f[7] || 0, irq: (f[5] || 0) + (f[6] || 0) }; });   // steal = 하이퍼바이저 · irq = 인터럽트 + softirq(둘 다 스레드 몫에서 빠진다)
const ctxt = () => { const s = fs.readFileSync(STATUS, 'utf8'); const g = (k) => +((s.match(new RegExp(k + ':\\s+(\\d+)')) || [])[1] || 0); return [g('voluntary_ctxt_switches'), g('nonvoluntary_ctxt_switches')]; };
const tvol = () => +((fs.readFileSync(TSTATUS, 'utf8').match(/voluntary_ctxt_switches:\s+(\d+)/) || [])[1] || 0);   // 주 스레드의 자발 전환(잠든 번)
const nowMs = () => Number(process.hrtime.bigint()) / 1e6;
const perf = async () => { const u = process.env.PERF_URL; if (!u) return null; try { const r = await fetch(u, { headers: process.env.CENTRAL_SECRET ? { 'x-zone-secret': process.env.CENTRAL_SECRET } : {} }); const j = await r.json(); return j && j.tick ? { ms: j.tick.ms, lagPct: j.tick.lagPct, loop: j.loop || null } : null; } catch (e) { return { err: String(e.message || e) }; } };
const q = (a, p) => { if (!a.length) return 0; const t = a.slice().sort((x, y) => x - y); return +t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(3); };
(async () => {
  const p0 = await perf();
  const st0 = cpuSteal(), cx0 = ctxt(), t00 = Date.now();
  //   바쁜 줄 = 'R' 표본이 이어지고 그 사이 주 스레드가 한 번도 안 잠든(자발 전환 그대로) 구간. 줄이 끝나면(잠들었거나 'S') 그 줄의
  //   빼앗김 = 벽 − 돈 − 줄 선 을 잰다. ⚠`schedstat` 의 돈 값은 도는 동안 스케줄러 틱(≤ 4 ms)마다 오른다 — 두 끝에서 ≤ 4 ms 씩 늦을 수 있다
  //   ⇒ 20 ms 넘는 줄만 세고, 한 줄 빼앗김 8 ms 넘음(두 끝 늦음 합보다 큼)을 "한 방"으로 센다.
  const sample = () => { const [r, w] = sch(); return { r, w, s: state(), v: tvol(), t: nowMs() }; };
  let prev = sample(), streak = null; const states = {}; let n = 0;
  const streaks = []; let stWall = 0, stRun = 0, stWait = 0, stLost = 0;
  const closeStreak = (end) => { if (!streak) return; const wall = end.t - streak.t, dr = end.r - streak.r, dw = end.w - streak.w;
    if (wall >= 20) { const l = Math.max(0, wall - dr - dw); streaks.push({ wall, l, dw }); stWall += wall; stRun += dr; stWait += dw; stLost += l; } streak = null; };
  const stealSeries = []; let lastSt = st0, lastStAt = prev.t;
  const end = prev.t + secs * 1000;
  await new Promise((resolve) => {
    const step = () => {
      let cur;
      try { cur = sample(); } catch (e) { return resolve(); }   // 존이 끝났다 — 거기까지
      n++; states[cur.s] = (states[cur.s] || 0) + 1;
      const busy = prev.s === 'R' && cur.s === 'R' && cur.v === prev.v;
      if (busy) { if (!streak) streak = prev; } else closeStreak(prev);
      prev = cur;
      if (cur.t - lastStAt >= 100) { try { const s = cpuSteal(); stealSeries.push(s.map((c, i) => c.steal - lastSt[i].steal)); lastSt = s; lastStAt = cur.t; } catch (e) {} }
      if (cur.t >= end) { closeStreak(cur); return resolve(); }
      setTimeout(step, 5);
    };
    setTimeout(step, 5);
  });
  const lost = streaks.map((x) => x.l), wait = streaks.map((x) => x.dw);
  const busy = streaks.length, wallBusy = stWall, runSum = stRun, waitSum = stWait, lostSum = stLost;
  const st1 = cpuSteal(), cx1 = ctxt(), p1 = await perf();
  const steal = st1.map((c, i) => ({ cpu: i, stealTicks: c.steal - st0[i].steal, pct: +(100 * (c.steal - st0[i].steal) / Math.max(1, c.tot - st0[i].tot)).toFixed(3), irqPct: +(100 * (c.irq - st0[i].irq) / Math.max(1, c.tot - st0[i].tot)).toFixed(3) }));
  let gc = null;
  if (process.env.GC_LOG) { try { const L = fs.readFileSync(process.env.GC_LOG, 'utf8').split('\n').filter((l) => l.includes('GC 정지')); gc = { file: process.env.GC_LOG, lines: L.length, last: L.slice(-20) }; } catch (e) { gc = { err: String(e.message || e) }; } }
  const res = { host: os.hostname(), cpus: os.cpus().length, load: os.loadavg(), pid: +pid, startedAt: new Date(t00).toISOString(), secs, samples: n, everyMs: 5, states, busyRule: '20 ms 넘는 바쁜 줄 · 한 방 = 빼앗김 8 ms 넘음',
    busy: { streaks: busy, wallMs: +wallBusy.toFixed(1), runMs: +runSum.toFixed(1), waitMs: +waitSum.toFixed(1), lostMs: +lostSum.toFixed(1), lostPct: wallBusy ? +(100 * lostSum / wallBusy).toFixed(2) : null },
    lost: { p50: q(lost, 0.5), p99: q(lost, 0.99), max: q(lost, 1), over8ms: lost.filter((x) => x > 8).length, over15ms: lost.filter((x) => x > 15).length },
    wait: { p99: q(wait, 0.99), max: q(wait, 1), over8ms: wait.filter((x) => x > 8).length },
    steal, stealMax100ms: stealSeries.length ? Math.max(...stealSeries.map((a) => Math.max(...a))) : 0,
    ctxt: { voluntary: cx1[0] - cx0[0], nonvoluntary: cx1[1] - cx0[1] }, gc, perf: { before: p0, after: p1 } };
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(out);
  console.log(`바쁜 줄 ${busy} · 빼앗김 ${res.busy.lostPct}% (최대 ${res.lost.max} ms · 8 ms+ ${res.lost.over8ms} · 15 ms+ ${res.lost.over15ms}) · steal ${steal.map((s) => s.pct + '%').join(' ')} · irq ${steal.map((s) => s.irqPct + '%').join(' ')} · 비자발 전환 ${res.ctxt.nonvoluntary}`);
})();
JS
