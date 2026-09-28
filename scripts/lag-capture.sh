#!/usr/bin/env bash
# === scripts/lag-capture.sh — 라이브 렉·핑 튐 캡처 5분 (T486 ① · 세션6 · 2026-09-28) =====================
#
# ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라.** 존·중앙 **무접촉**(읽기만) · 비밀 0(값을 안 적는다).
#
# 왜 — HUD 핑은 ws `ping`→`pong` 왕복이고 pong 은 **존 이벤트 루프 안에서** 답한다. 틱이 40ms 막히면 핑이 40ms 튄다.
#   망이 아니라 서버 정체가 핑으로 보일 수 있다 ⇒ 같은 5분에 서버 쪽 후보를 **전부 초 단위로** 나란히 적는다:
#     ⓐ 공유 CPU 뺏김  `/proc/stat` steal(가상 머신이 CPU 를 못 받은 몫) · user · sys · iowait
#     ⓑ 틱 정체       `/perf` tick.ms p50/p95/max · 루프 지연 loop p50/p95/max · 사건 링 새 항목(tick ≥33ms · save · econ_frame …)
#                      · `/perf` 요청 자체의 왕복(q ms — 이것도 이벤트 루프를 기다린다 = pong 과 같은 줄)
#     ⓒ GC           존·중앙 로그의 `GC 정지 NNms` 줄(>30ms 만 찍힌다 · `PerformanceObserver`)
#     ⓓ SQLite 쓰기   `/proc/diskstats` 쓴 KB · 쓰는 데 걸린 ms(디스크 봉우리 ↔ 틱 max)
#     ⓔ 중앙 같은 상자  존·중앙 프로세스 CPU% · RSS(`/proc/<pid>/stat` · `status`)
#     ⓕ 망            `ss -ti` 소켓 rtt · 재전송(5초마다 · **주소는 안 적는다** — 포트·rtt·재전송만)
#
# 쓰는 법(재민 · 서울 5분):
#   ssh seoul 'bash -s' < scripts/lag-capture.sh > ~/Mini/_lag/$(date +%m%d)_seoul.jsonl
#   손잡이는 앞에 env 로:  ssh seoul 'DUR=300 ZONE=hanbando bash -s' < scripts/lag-capture.sh > …
#     DUR(초 · 300) · ZONE(hanbando) · ZC(존 컨테이너 · durango-zone-$ZONE) · CC(중앙 컨테이너 · durango-central)
#     PORT(존 포트 · 컨테이너 env 에서 읽는다 · 없으면 3020) · NORESET=1(창 영점 안 함 — 아래 ⚠)
#   로컬(하네스 호스트 기준선 · 도커 없이): MODE=local PERF_URL=http://localhost:<존포트>/perf ZPID=<존 pid> CPID=<중앙 pid>
#     ZLOG=<존 로그 파일> CLOG=<중앙 로그 파일> — `CENTRAL_SECRET` 은 이 셸 env 에 있으면 **이름으로만** 넘긴다.
#
# ⚠`/perf` 는 안 문이다 — 서버 **안에서** 읽는다(도커면 존 컨테이너 안의 node 가 제 env 의 비밀로 읽는다 ·
#   값은 컨테이너 밖으로 한 글자도 안 나온다). 바깥에 여는 일은 회부(PM).
# ⚠창 영점: 루프 지연 히스토그램(`loopDelayStats`)은 **부팅 뒤 누계**라 초 단위 값을 내려면 매 초 `?reset=1` 로 창을 연다
#   (하네스 문법 · 관측 상태만 비운다 — 게임 상태 0 · 틱 링은 3,000칸이라 5분 뒤 원래대로 찬다). `NORESET=1` 이면 안 비운다.
# ⚠관측자 값: 이 스크립트의 부하 = node 하나(1초에 `/perf` 한 번) + bash 한 줄(`/proc` 읽기) — 판에 `self` 로 같이 적는다.
#
# 출력(JSON 한 줄씩 · `k` 로 가른다): meta · p(/perf 초) · s(호스트 초) · w(소켓 5초) · gc(로그 줄) · end
# =============================================================================================================

main() {
  set -u
  local DUR="${DUR:-300}" ZONE="${ZONE:-hanbando}" MODE="${MODE:-}"
  local ZC="${ZC:-durango-zone-$ZONE}" CC="${CC:-durango-central}"
  local TMP; TMP="$(mktemp -d /tmp/lagcap.XXXXXX)" || exit 1
  local START_ISO START_MS HZ NCPU
  START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; START_MS="$(date +%s%3N)"
  HZ="$(getconf CLK_TCK 2>/dev/null || echo 100)"; NCPU="$(nproc 2>/dev/null || echo 1)"

  if [ -z "$MODE" ]; then
    if command -v docker >/dev/null 2>&1 && docker inspect "$ZC" >/dev/null 2>&1; then MODE=docker; else MODE=local; fi
  fi

  # ── 프로세스 — 존·중앙 node 의 호스트 pid ────────────────────────────────────────────
  local ZPID="${ZPID:-}" CPID="${CPID:-}" PORT="${PORT:-}"
  if [ "$MODE" = docker ]; then
    ZPID="$(docker top "$ZC" -eo pid,comm 2>/dev/null | awk '$2=="node"{print $1; exit}')"
    CPID="$(docker top "$CC" -eo pid,comm 2>/dev/null | awk '$2=="node"{print $1; exit}')"
    [ -z "$PORT" ] && PORT="$(docker exec "$ZC" printenv PORT 2>/dev/null)"
  fi
  PORT="${PORT:-3020}"

  # ── /perf 수집기(node · 1초) — 도커면 존 컨테이너 **안에서** 돈다 ─────────────────────────────
  local COLLECT
  read -r -d '' COLLECT <<'JS'
// ⚠`node -`(표준입력 스크립트)는 전역 어휘 범위다 — 여기서 `URL` 같은 전역 이름을 가리면 fetch 안이 그 값을 본다(실측: 전부 실패).
const DUR = +process.env.DUR || 300, RESET = process.env.NORESET !== '1';
const PURL = process.env.PERF_URL || `http://localhost:${process.env.PORT || 3020}/perf`;
const H = {}; if (process.env.CENTRAL_SECRET) H['x-zone-secret'] = process.env.CENTRAL_SECRET;   // 값은 요청 머리에만 — 출력 0
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (x) => (typeof x === 'number' ? +x.toFixed(2) : x);
(async () => {
  out({ k: 'pmeta', port: +(PURL.match(/:(\d+)\//) || [0, 0])[1], secret: !!process.env.CENTRAL_SECRET, reset: RESET, node: process.version });
  const t0 = Date.now(); let lastEv = 0, first = true;
  while (Date.now() - t0 < DUR * 1000) {
    const ts = Date.now(); let p = null, st = 0;
    try { const r = await fetch(PURL + (RESET ? '?reset=1' : ''), { headers: H }); st = r.status; p = r.ok ? await r.json() : null; } catch (e) { p = null; st = -1; }
    const q = Date.now() - ts;
    if (p && p.tick) {
      const ev = (p.events || []).filter((e) => e.t > lastEv); if (p.events && p.events.length) lastEv = Math.max(lastEv, p.events[p.events.length - 1].t);
      const et = p.econTick && p.econTick.last;
      out({ k: 'p', t: ts, q, first: first || undefined, loop: p.loop, tick: p.tick.ms ? { p50: p.tick.ms.p50, p95: p.tick.ms.p95, max: p.tick.ms.max, n: p.tick.ms.n } : null,
        drop: p.tick.dropN, lag: p.tick.lagPct, ev: first ? undefined : ev.map((e) => ({ t: e.t, kind: e.kind, ms: r2(e.ms) })),
        day: et ? et.day : undefined, dayMs: et ? r2(et.total != null ? et.total : et.ms) : undefined });
      first = false;
    } else out({ k: 'p', t: ts, q, status: st });
    await sleep(Math.max(50, 1000 - (Date.now() - ts)));
  }
  out({ k: 'pend', t: Date.now() });
})();
JS
  if [ "$MODE" = docker ]; then
    printf '%s\n' "$COLLECT" | docker exec -i -e DUR="$DUR" -e NORESET="${NORESET:-0}" "$ZC" node - > "$TMP/p.jsonl" 2>"$TMP/p.err" &
  else
    printf '%s\n' "$COLLECT" | DUR="$DUR" NORESET="${NORESET:-0}" PERF_URL="${PERF_URL:-http://localhost:$PORT/perf}" node - > "$TMP/p.jsonl" 2>"$TMP/p.err" &
  fi
  local CPIDC=$!

  # ── 호스트 초 샘플 — /proc 만 읽는다 ─────────────────────────────────────────────────────
  local DEVS; DEVS="$(awk '$3 ~ /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme[0-9]+n[0-9]+)$/ {print $3}' /proc/diskstats | tr '\n' ' ')"
  local NS=""
  if [ "$MODE" = docker ] && [ -n "$ZPID" ] && command -v nsenter >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then NS="nsenter -t $ZPID -n"; fi
  printf '{"k":"meta","t":%s,"start":"%s","mode":"%s","zone":"%s","port":%s,"dur":%s,"ncpu":%s,"hz":%s,"kernel":"%s","zpid":%s,"cpid":%s,"devs":"%s","ssNs":%s,"self":%s}\n' \
    "$START_MS" "$START_ISO" "$MODE" "$ZONE" "$PORT" "$DUR" "$NCPU" "$HZ" "$(uname -r)" "${ZPID:-null}" "${CPID:-null}" "${DEVS% }" "$([ -n "$NS" ] && echo true || echo false)" "$$"

  local pcpu pdisk pz pc i=0 end=$(( $(date +%s) + DUR ))
  pcpu="$(head -1 /proc/stat)"; pdisk="$(cat /proc/diskstats)"
  pz="$( [ -n "$ZPID" ] && awk '{print $14+$15}' "/proc/$ZPID/stat" 2>/dev/null || echo 0)"
  pc="$( [ -n "$CPID" ] && awk '{print $14+$15}' "/proc/$CPID/stat" 2>/dev/null || echo 0)"
  while [ "$(date +%s)" -lt "$end" ]; do
    sleep 1
    local t ncpu ndisk nz nc zr cr
    t="$(date +%s%3N)"; ncpu="$(head -1 /proc/stat)"; ndisk="$(cat /proc/diskstats)"
    nz="$( [ -n "$ZPID" ] && awk '{print $14+$15}' "/proc/$ZPID/stat" 2>/dev/null || echo 0)"
    nc="$( [ -n "$CPID" ] && awk '{print $14+$15}' "/proc/$CPID/stat" 2>/dev/null || echo 0)"
    zr="$( [ -n "$ZPID" ] && awk '/VmRSS/{print $2}' "/proc/$ZPID/status" 2>/dev/null || echo 0)"
    cr="$( [ -n "$CPID" ] && awk '/VmRSS/{print $2}' "/proc/$CPID/status" 2>/dev/null || echo 0)"
    #   CPU % (전체 = 모든 코어 합의 %) — user nice system idle iowait irq softirq steal
    local cpu; cpu="$(printf '%s\n%s\n' "$pcpu" "$ncpu" | awk 'NR==1{for(i=2;i<=9;i++)a[i]=$i} NR==2{s=0;for(i=2;i<=9;i++){d[i]=$i-a[i];s+=d[i]} if(s<=0)s=1;
      printf "{\"user\":%.1f,\"sys\":%.1f,\"idle\":%.1f,\"iowait\":%.1f,\"irq\":%.1f,\"steal\":%.1f}", 100*(d[2]+d[3])/s, 100*d[4]/s, 100*d[5]/s, 100*d[6]/s, 100*(d[7]+d[8])/s, 100*d[9]/s}')"
    local disk; disk="$(printf '%s\n@@\n%s\n' "$pdisk" "$ndisk" | awk -v devs=" ${DEVS}" '$1=="@@"{m=1;next}
      (index(devs," "$3" ")){ if(!m){w[$3]=$10;wm[$3]=$11} else {o=o sprintf("%s\"%s\":{\"wKB\":%d,\"wMs\":%d}", (o==""?"":","), $3, ($10-w[$3])/2, $11-wm[$3])} } END{printf "{%s}", o}')"
    printf '{"k":"s","t":%s,"cpu":%s,"z":{"cpu":%s,"rssMB":%s},"c":{"cpu":%s,"rssMB":%s},"disk":%s,"load":"%s"}\n' \
      "$t" "$cpu" "$(awk -v a="$pz" -v b="$nz" -v h="$HZ" 'BEGIN{printf "%.1f", 100*(b-a)/h}')" "$(( ${zr:-0} / 1024 ))" \
      "$(awk -v a="$pc" -v b="$nc" -v h="$HZ" 'BEGIN{printf "%.1f", 100*(b-a)/h}')" "$(( ${cr:-0} / 1024 ))" "$disk" "$(cut -d' ' -f1-3 /proc/loadavg)"
    pcpu="$ncpu"; pdisk="$ndisk"; pz="$nz"; pc="$nc"
    i=$((i+1))
    #   소켓 — 5초마다 · 주소는 안 적는다(로컬 포트 · rtt · 재전송 · 미확인 · `lo` = 상대가 되돌이 — 이 스크립트의 수집기 자신)
    if [ $((i % 5)) -eq 0 ] && command -v ss >/dev/null 2>&1; then
      local ssout; ssout="$( { ss -tinH state established "( sport = :$PORT or sport = :443 or sport = :80 )" 2>/dev/null; [ -n "$NS" ] && $NS ss -tinH state established "( sport = :$PORT )" 2>/dev/null; } | awk '
        /^[ \t]/ { if (lp=="") next; rtt=""; rv=""; rt=0; ua=0; mr="";
          for(i=1;i<=NF;i++){ if($i ~ /^rtt:/){split(substr($i,5),a,"/"); rtt=a[1]; rv=a[2]} if($i ~ /^retrans:/){split(substr($i,9),b,"/"); rt=b[2]} if($i ~ /^unacked:/)ua=substr($i,9); if($i ~ /^minrtt:/)mr=substr($i,8) }
          o=o sprintf("%s{\"lp\":%s,\"lo\":%s,\"rtt\":%s,\"rttvar\":%s,\"minrtt\":%s,\"retrans\":%d,\"unacked\":%d}", (o==""?"":","), lp, lo, (rtt==""?"null":rtt), (rv==""?"null":rv), (mr==""?"null":mr), rt+0, ua+0); lp=""; next }
        { n=split($3,x,":"); lp=x[n]; lo=(($4 ~ /^(127\.|\[::1\]|\[::ffff:127\.)/) ? "true" : "false") }
        END { printf "[%s]", o }')"
      printf '{"k":"w","t":%s,"socks":%s}\n' "$(date +%s%3N)" "${ssout:-[]}"
    fi
  done
  wait "$CPIDC" 2>/dev/null
  cat "$TMP/p.jsonl"
  #   수집기 오류(있으면 · 한 줄로) — 비밀은 수집기가 찍지 않는다
  [ -s "$TMP/p.err" ] && printf '{"k":"perr","lines":%s}\n' "$(grep -vc '^$' "$TMP/p.err")"

  # ── GC 정지 줄(>30ms) · 틱 빚 버림 — 로그에서 이 5분만 ─────────────────────────────────────────
  local src f
  for src in zone central; do
    if [ "$MODE" = docker ]; then
      f="$ZC"; [ "$src" = central ] && f="$CC"
      docker logs -t --since "$START_ISO" "$f" 2>&1 | grep -a -E 'GC 정지|틱 빚' | head -2000 > "$TMP/$src.log"
    else
      f="${ZLOG:-}"; [ "$src" = central ] && f="${CLOG:-}"
      if [ -n "$f" ] && [ -f "$f" ]; then grep -a -E 'GC 정지|틱 빚' "$f" | tail -2000 > "$TMP/$src.log"; else : > "$TMP/$src.log"; fi
    fi
    awk -v s="$src" '{ ts=($1 ~ /^[0-9]{4}-/)?$1:""; ms=""; if (match($0,/GC 정지 [0-9]+ms/)) { ms=substr($0,RSTART+7,RLENGTH-9) }
      kd=""; if (match($0,/kind=[0-9?]+/)) kd=substr($0,RSTART+5,RLENGTH-5);
      printf "{\"k\":\"gc\",\"src\":\"%s\",\"ts\":\"%s\",\"ms\":%s,\"kind\":\"%s\",\"debt\":%s}\n", s, ts, (ms==""?"null":ms), kd, (index($0,"빚")?"true":"false") }' "$TMP/$src.log"
  done
  printf '{"k":"end","t":%s,"samples":%s}\n' "$(date +%s%3N)" "$i"
  rm -rf "$TMP"
}
main "$@" </dev/null
