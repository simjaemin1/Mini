#!/usr/bin/env bash
# === scripts/live-lag.sh — "서버 렉" 한 줄 진단: 두 호스트 · 존 · central 을 표 하나로 (T887 · 2026-10-23) ======================
#
# ★왜: 10-23 초기화 0 준비 중 재민 "서버 렉이 너무 심한데?" — 옛 세계(한반도 14년 · DB 184MB)에 같은 호스트 docker build 가 겹친 때.
#   렉이 오면 **어느 층인지**(존 틱 · 이벤트 루프 · 호스트 CPU/메모리 · 다른 프로세스 · 망 · 클라)를 재민이 한 줄로 보고 PM 에 붙인다.
#   `/perf` 는 JSON 이 크고 안 문이라 바깥에서 못 읽는다 → 이 줄이 **컨테이너 안에서** 읽어(비밀은 컨테이너 env 그대로 · 밖으로 0) 수만 모은다.
#
# 재민 맥에서 한 줄(T878 sync-tokyo 와 같은 꼴 · 서울이 받은 그 판):
#   bash <(ssh seoul cat /opt/Mini/scripts/live-lag.sh)              # 한 번 — 표 + 판정 한 줄
#   bash <(ssh seoul cat /opt/Mini/scripts/live-lag.sh) --watch 10   # 10초마다 다시(Ctrl-C 로 끝)
#   bash <(ssh seoul cat /opt/Mini/scripts/live-lag.sh) --json       # PM 에 붙일 원문(한 판 = JSON 한 줄)
#   맥 레포에서 `bash scripts/live-lag.sh …` 도 같다. 서버는 별칭(`~/.ssh/config` 의 `Host seoul` · `Host tokyo`)으로 부른다 —
#   다른 이름이면 LAG_SEOUL=<별칭> LAG_TOKYO=<별칭>. 한 호스트만이면 LAG_TOKYO=- (그 호스트를 건너뛴다).
#
# 무엇을 읽나(★읽기만 — 라이브 무변):
#   존마다   `/perf`(**`reset=1` 없이** — 계측 창을 안 지운다): 틱 본문 ms p50/p95/max(최근 3,000틱 고리) · `lagPct`(세계가 벽시계보다 뒤진 % · 부팅 뒤 누계)
#            · 틱 빚 버림 수 · 루프 지연 p95/max(부팅 또는 마지막 영점 뒤 누계) · 최근 60초 무거운 일(사건 링)
#            `/health`: 사람 수 · 사람이 사는 마을 수 · ★[T890] 세계 날 · 달력 글자(welcome 과 같은 함수 · 옛 존이면 `/perf` econ 마감 날) · 그리고 **지금** 루프 대기 = `/health` 20번 왕복(0.05초 간격 · 데우기 한 번 뺌) p95/max
#            (pong 과 같은 줄을 기다린다 — `lag-capture.sh` 의 q 와 같은 자)
#   central  `/health` 20번 왕복 · 계정 수
#   호스트마다 `/proc/loadavg` 부하 · 1초 창 `/proc/stat` 바쁨(user+sys+steal) · steal · 메모리(MemAvailable · 스왑 · 그 1초에 스왑 오감)
#            · `docker stats --no-stream` 컨테이너 CPU% · 메모리 · 재시작 수 · 그 1초에 한 코어의 30% 넘게 쓴 **다른** 프로세스(이름만 · 인자는 안 찍는다 — 비밀 0)
#            · docker build 가 돌고 있나
#   맥 → 호스트  열린 포트(central 3010 · 존 포트)에 TCP 왕복(`curl` time_connect) 5번 — 핑과 같은 망 길(ICMP 는 막혀 있을 수 있다)
#
# 판정 문턱 — 새 수 0(전부 `scripts/lag-table.js` T486 가름 기준 · T284 틱 예산에서):
#   존 틱      틱 p95 ≥ 33ms(30Hz 한 틱 예산)
#   이벤트 루프 지금 `/health` 왕복 p95 ≥ 50ms 또는 루프 지연(누계) p95 ≥ 50ms(T486 "막힘" 문턱 — 해상도 10ms 포함)
#   호스트 CPU 바쁨(user+sys+steal) ≥ 90% 또는 steal ≥ 5%(T486 ⓑ · ⓐ)
#   다른 프로세스  durango 존 · central 밖 프로세스가 한 코어의 ≥ 30%(T486 ⓔ 의 같은 상자 문턱) · 또는 docker build 가 돈다
#   메모리     그 1초 창에 스왑을 오갔다(0 이 아니면 — 새 수 아님)
#   망         TCP 왕복 최대 > max(2 × 중앙, 중앙 + 30ms)(T486 "튄 핑") · 또는 닿지 않음
#   다 아니면  "서버 · 망 층은 문턱 아래" — 렉이 계속 보이면 클라(브라우저 콘솔 `__frameCapture()` · T486)
#
# ★제품 0 · 새 수 0 · 새 손잡이 0 — 맥은 bash · ssh · curl · perl(JSON::PP — 맥 기본)만 · 서버는 bash · /proc · docker · 컨테이너 안 node.
# ⚠관측자 값: 한 판에 호스트마다 1초 창 · `docker stats` 한 번 · 컨테이너마다 `docker exec node` 한 번(약 1.5초) — 짧고 가볍다.
set -uo pipefail

S="${LAG_SEOUL:-seoul}"; T="${LAG_TOKYO:-tokyo}"
WATCH=0; JSON=0
while [ $# -gt 0 ]; do
  case "$1" in
    --watch) WATCH="${2:-0}"; shift 2 || { echo "--watch <초>" >&2; exit 2; } ;;
    --json) JSON=1; shift ;;
    *) sed -n '2,36p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 2 ;;
  esac
done
case "$WATCH" in ''|*[!0-9]*) echo "--watch <초> — 정수" >&2; exit 2 ;; esac

# ── 호스트에서 도는 줄(ssh 'bash -s' 로 보낸다) — JSON 한 줄씩 ──────────────────────────────────────────────
read -r -d '' PROBE <<'PROBE'
set -u
HZ=$(getconf CLK_TCK 2>/dev/null || echo 100); NCPU=$(nproc 2>/dev/null || echo 1)
snap() { local f l r; for f in /proc/[0-9]*/stat; do IFS= read -r l < "$f" 2>/dev/null || continue; r=${l##*) }; set -- $r; echo "${l%% *} $(( ${12} + ${13} ))"; done; }
vm() { awk '/^pswp(in|out) /{s+=$2} END{print s+0}' /proc/vmstat; }
W0=$(date +%s%N); C0=$(head -1 /proc/stat); V0=$(vm); P0=$(snap)
sleep 1
W1=$(date +%s%N); C1=$(head -1 /proc/stat); V1=$(vm); P1=$(snap)
WIN=$(( (W1 - W0) / 1000000 ))   # 실제 창 ms(셈 자체가 걸린 시간 포함) — 프로세스 % 를 이 창으로 나눈다
CPU=$(printf '%s\n%s\n' "$C0" "$C1" | awk 'NR==1{for(i=2;i<=9;i++)a[i]=$i} NR==2{s=0;for(i=2;i<=9;i++){d[i]=$i-a[i];s+=d[i]} if(s<=0)s=1;
  printf "{\"busy\":%.1f,\"steal\":%.1f,\"iowait\":%.1f}", 100*(d[2]+d[3]+d[4]+d[9])/s, 100*d[9]/s, 100*d[6]/s}')
MEM=$(awk -v sw=$(( V1 - V0 )) '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} /^SwapTotal:/{st=$2} /^SwapFree:/{sf=$2}
  END{printf "{\"totalMB\":%d,\"availMB\":%d,\"swapMB\":%d,\"swapUsedMB\":%d,\"swapIO\":%d}", t/1024, a/1024, st/1024, (st-sf)/1024, sw}' /proc/meminfo)
# 그 1초에 한 코어의 30% 넘게 쓴 프로세스 — 이름만(인자는 비밀이 들 수 있어 안 찍는다) · 존 · central 은 따로 이름 붙인다
HEAVY=$(awk -v hz="$HZ" -v me="$$" -v win="$WIN" 'NR==FNR{a[$1]=$2;next} ($1 in a) && $1!=me {pc=100*($2-a[$1])/hz/(win/1000); if (pc >= 30) printf "%s %.0f\n", $1, pc}' <(echo "$P0") <(echo "$P1") | sort -k2,2nr | head -8 |
  while read -r pid pc; do
    cm=$(cat "/proc/$pid/comm" 2>/dev/null || echo "?"); cl=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    case "$cl" in *server/zone.js*) lb=zone ;; *server/central.js*) lb=central ;; *buildx*build*|*"docker build"*) lb="docker build" ;; *) lb="$cm" ;; esac
    rss=$(awk '/^VmRSS:/{print int($2/1024)}' "/proc/$pid/status" 2>/dev/null); printf '{"pid":%s,"cpu":%s,"rssMB":%s,"name":"%s"}\n' "$pid" "$pc" "${rss:-0}" "$(printf '%s' "$lb" | tr -d '"\\' | cut -c1-24)"
  done | paste -sd, -)
BUILD=false; pgrep -f 'docker(-buildx)? (buildx )?build' >/dev/null 2>&1 && BUILD=true
printf '{"k":"host","ncpu":%s,"load":"%s","cpu":%s,"mem":%s,"heavy":[%s],"build":%s,"docker":%s}\n' "$NCPU" "$(cut -d' ' -f1-3 /proc/loadavg)" "$CPU" "$MEM" "$HEAVY" "$BUILD" \
  "$(command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && echo true || echo false)"
command -v docker >/dev/null 2>&1 || exit 0
NAMES=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^durango-(central|zone-.+)$' | sort)
# 마른 연습 흉내(한 상자에 두 호스트)만 — 가짜 ssh 가 이 호스트 몫 이름을 env 로 준다. 라이브 ssh 는 이 env 를 안 싣는다(무시).
if [ -n "${LAG_NAMES:-}" ]; then NAMES=$(for n in $NAMES; do case " $LAG_NAMES " in *" $n "*) echo "$n" ;; esac; done); fi
[ -n "$NAMES" ] || exit 0
docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' $NAMES 2>/dev/null | while IFS='|' read -r n c m; do
  mb=$(printf '%s' "${m%% /*}" | awk '{v=$0+0; if ($0 ~ /GiB|GB/) v*=1024; else if ($0 ~ /KiB|kB/) v/=1024; else if ($0 ~ /MiB|MB/) ; else v/=1048576; printf "%d", v}')
  info=$(docker inspect -f '{{.RestartCount}}|{{.State.StartedAt}}|{{range $p,$b := .HostConfig.PortBindings}}{{(index $b 0).HostPort}} {{end}}' "$n" 2>/dev/null)
  IFS='|' read -r rc st pt <<<"$info"; pt=${pt%% *}
  printf '{"k":"ctr","name":"%s","cpu":%s,"memMB":%s,"restarts":%s,"started":"%s","port":%s}\n' "$n" "${c%\%}" "${mb:-0}" "${rc:-0}" "${st:0:19}" "${pt:-null}"
done
# 컨테이너 안 — /perf(reset 없이) · /health 20번 왕복. 비밀은 그 컨테이너 env 그대로(머리에만 · 출력 0)
read -r -d '' ZJS <<'JS'
'use strict';
const KIND = process.env.LAG_KIND, P = process.env.PORT || (KIND === 'central' ? '3010' : '3020'), B = `http://127.0.0.1:${P}`;
const H = {}; if (process.env.CENTRAL_SECRET) H['x-zone-secret'] = process.env.CENTRAL_SECRET;
const get = async (p, h) => { const t0 = performance.now(); const r = await fetch(B + p, { headers: h || {} }); const j = r.ok ? await r.json() : null; return { ms: performance.now() - t0, st: r.status, j }; };
const qq = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? +b[Math.max(0, Math.ceil(b.length * p) - 1)].toFixed(1) : null; };   // 가까운 순위
(async () => {
  const o = { k: KIND, zone: KIND === 'zone' ? (process.env.ZONE_ID || '?') : 'central' };
  const qs = []; let h = null, fail = 0;
  try { await get('/health'); } catch (e) {}   // 데우기 한 번(첫 연결 · fetch 초기화 — 안 센다)
  for (let i = 0; i < 20; i++) { try { const r = await get('/health'); qs.push(r.ms); if (r.j) h = r.j; } catch (e) { fail++; } await new Promise((r) => setTimeout(r, 50)); }
  o.q = { p50: qq(qs, 0.5), p95: qq(qs, 0.95), max: qs.length ? +Math.max(...qs).toFixed(1) : null, fail };
  if (h) { o.humans = h.humans != null ? h.humans : null; o.players = h.players != null ? h.players : null; o.villages = h.villages != null ? h.villages : null; o.up = h.uptime != null ? Math.round(h.uptime) : null;
           o.day = h.day != null ? h.day : null; o.cal = h.calendar || null; }   // ★[T890] `/health` 의 세계 날 · 달력 글자(welcome 과 같은 함수) — 없는 판(옛 존)이면 null
  if (KIND === 'zone') {
    try {
      const r = await get('/perf', H); o.perfSt = r.st;
      const p = r.j;
      if (p && p.tick) {
        const m = p.tick.ms || {};
        o.tick = { n: m.n, p50: m.p50, p95: m.p95, max: m.max, lagPct: p.tick.lagPct, drop: p.tick.dropN };
        o.loop = p.loop ? { p95: p.loop.p95, max: p.loop.max, n: p.loop.n } : null;
        if (o.day == null && p.econTick && p.econTick.last && p.econTick.last.day != null) o.day = p.econTick.last.day;   // 옛 존(`/health` 에 날 칸 없음) — 마지막으로 마감한 econ 하루(부팅 뒤 첫 마감 전이면 null)
        const now = p.now || Date.now(), ev = (p.events || []).filter((e) => e.t > now - 60000);
        const top = {}; for (const e of ev) top[e.kind] = Math.max(top[e.kind] || 0, e.ms);
        o.ev60 = { n: ev.length, top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v)}ms`).join(' · ') };
      }
    } catch (e) { o.perfSt = -1; }
  }
  process.stdout.write(JSON.stringify(o) + '\n');
})();
JS
for n in $NAMES; do
  case "$n" in durango-central) k=central ;; *) k=zone ;; esac
  printf '%s\n' "$ZJS" | timeout 20 docker exec -i -e LAG_KIND=$k "$n" node - 2>/dev/null || printf '{"k":"%s","zone":"%s","err":"exec"}\n' "$k" "${n#durango-zone-}"
done
PROBE

TMP="$(mktemp -d "${TMPDIR:-/tmp}/live-lag.XXXXXX")" || exit 1
trap 'rm -rf "$TMP"' EXIT

one_round() {
  local h lab i ip
  : > "$TMP/all"
  for h in "$S" "$T"; do
    [ "$h" = - ] && continue
    ( ssh -o ConnectTimeout=8 -o BatchMode=yes "$h" 'bash -s' <<<"$PROBE" > "$TMP/$h.out" 2> "$TMP/$h.err"; echo $? > "$TMP/$h.rc" ) &
  done
  wait
  for h in "$S" "$T"; do
    [ "$h" = - ] && continue
    lab=서울; [ "$h" = "$T" ] && lab=도쿄
    if [ "$(cat "$TMP/$h.rc" 2>/dev/null)" != 0 ] || ! grep -q '"k":"host"' "$TMP/$h.out" 2>/dev/null; then
      printf '{"host":"%s","alias":"%s","k":"down","why":"%s"}\n' "$lab" "$h" "$(tail -1 "$TMP/$h.err" 2>/dev/null | tr -d '"\\' | cut -c1-80)" >> "$TMP/all"; continue
    fi
    sed "s/^{/{\"host\":\"$lab\",\"alias\":\"$h\",/" "$TMP/$h.out" >> "$TMP/all"
    # 맥 → 호스트 TCP 왕복(열린 포트마다 5번) — 별칭의 HostName 으로
    ip="$(ssh -G "$h" 2>/dev/null | awk '/^hostname /{print $2; exit}')"
    for port in $(grep -o '"k":"ctr"[^}]*"port":[0-9]*' "$TMP/$h.out" | sed 's/.*"port"://'); do
      local conn="" tot="" r
      for i in 1 2 3 4 5; do
        r="$(curl --noproxy '*' -s -o /dev/null -m 3 -w '%{time_connect} %{time_total}' "http://$ip:$port/health" 2>/dev/null)" || r=""
        case "$r" in ''|0.000000*) ;; *) conn="$conn${conn:+,}$(awk -v x="${r%% *}" 'BEGIN{printf "%.1f", 1000*x}')"; tot="$tot${tot:+,}$(awk -v x="${r##* }" 'BEGIN{printf "%.1f", 1000*x}')" ;; esac
        sleep 0.2
      done
      printf '{"host":"%s","alias":"%s","k":"net","port":%s,"conn":[%s],"total":[%s]}\n' "$lab" "$h" "$port" "$conn" "$tot" >> "$TMP/all"
    done
  done
  perl -MJSON::PP -e '
    use strict; use warnings; use utf8; binmode STDOUT, ":utf8";
    my $JSONOUT = shift @ARGV; my $J = JSON::PP->new->utf8->canonical;
    my @L; while (my $l = <STDIN>) { chomp $l; next unless $l =~ /^\{/; my $o = eval { $J->decode($l) }; push @L, $o if $o; }
    my @t = localtime; my $at = sprintf("%04d-%02d-%02d %02d:%02d:%02d", $t[5]+1900, $t[4]+1, $t[3], $t[2], $t[1], $t[0]);
    sub d { defined $_[0] ? $_[0] : "—" }
    sub med { my @a = sort { $a <=> $b } @_; return undef unless @a; return $a[int(@a/2)]; }
    my (@out, @flag, %busy);
    sub fl { push @flag, [@_] }   # [차례, 글] — 원인 쪽(호스트 · 다른 프로세스)이 앞, 증상(루프 · 틱)이 뒤, 망이 끝
    for my $o (grep { $_->{k} eq "down" } @L) { push @out, "[호스트] $o->{host}($o->{alias}) — 닿지 않음: " . d($o->{why}); fl(0, "$o->{host} 호스트 닿지 않음(ssh)"); }
    for my $o (grep { $_->{k} eq "zone" } @L) {
      my $h = "$o->{zone}\@$o->{host}";
      if ($o->{err} || !$o->{tick}) { push @out, "[존] $h — 못 읽음(" . ($o->{err} || "perf " . d($o->{perfSt})) . ")"; fl(5, "$h 존 /perf 못 읽음"); next; }
      my ($k, $lp, $q) = ($o->{tick}, $o->{loop} || {}, $o->{q} || {});
      push @out, sprintf("[존] %s — 틱 p50 %s · p95 %s · max %s ms(최근 %s틱) · 뒤짐 %s%% · 빚 버림 %s | 루프(누계) p95 %s · max %s ms | 지금 /health 왕복 p95 %s · max %s ms | 사람 %s · 마을 %s · 세계 날 %s%s",
        $h, d($k->{p50}), d($k->{p95}), d($k->{max}), d($k->{n} && $k->{n} > 3000 ? 3000 : $k->{n}), d($k->{lagPct}), d($k->{drop}), d($lp->{p95}), d($lp->{max}), d($q->{p95}), d($q->{max}),
        d($o->{humans}), d($o->{villages}), (defined $o->{day} ? $o->{day} . ($o->{cal} ? "($o->{cal})" : "") : "—"), ($o->{ev60} && $o->{ev60}{n} ? " | 최근 60초 무거운 일 $o->{ev60}{n}번(" . $o->{ev60}{top} . ")" : ""));
      fl(6, "$h 존 틱 p95 $k->{p95}ms ≥ 33") if defined $k->{p95} && $k->{p95} >= 33;
      fl(5, "$h 이벤트 루프 지금 왕복 p95 $q->{p95}ms ≥ 50") if defined $q->{p95} && $q->{p95} >= 50;
      fl(5, "$h 이벤트 루프(누계) p95 $lp->{p95}ms ≥ 50") if defined $lp->{p95} && $lp->{p95} >= 50;
    }
    for my $o (grep { $_->{k} eq "central" } @L) {
      my $q = $o->{q} || {};
      push @out, sprintf("[central] \@%s — 지금 /health 왕복 p95 %s · max %s ms · 계정 %s", $o->{host}, d($q->{p95}), d($q->{max}), d($o->{players}));
      fl(5, "central\@$o->{host} 이벤트 루프 지금 왕복 p95 $q->{p95}ms ≥ 50") if defined $q->{p95} && $q->{p95} >= 50;
    }
    for my $o (grep { $_->{k} eq "host" } @L) {
      my ($c, $m) = ($o->{cpu}, $o->{mem});
      my @ct = map { sprintf("%s %s%% %sMB%s", ($_->{name} =~ s/^durango-(zone-)?//r), $_->{cpu}, $_->{memMB}, ($_->{restarts} ? " 재시작 $_->{restarts}" : "")) } grep { $_->{k} eq "ctr" && $_->{host} eq $o->{host} } @L;
      my %g; for (grep { $_->{name} ne "zone" && $_->{name} ne "central" } @{ $o->{heavy} || [] }) { $g{$_->{name}}{n}++; $g{$_->{name}}{cpu} += $_->{cpu}; }
      my @other = map { { name => $_ . ($g{$_}{n} > 1 ? " ×$g{$_}{n}" : ""), cpu => $g{$_}{cpu} } } sort { $g{$b}{cpu} <=> $g{$a}{cpu} } keys %g;
      push @out, sprintf("[호스트] %s(%s) — vCPU %s · 부하 %s · 1초 바쁨 %s%% · steal %s%% · iowait %s%% | 메모리 남음 %s / %s MB · 스왑 %s / %s MB(그 1초 오감 %s) | 컨테이너 %s | 다른 무거운 것 %s%s",
        $o->{host}, $o->{alias}, $o->{ncpu}, $o->{load}, $c->{busy}, $c->{steal}, $c->{iowait}, $m->{availMB}, $m->{totalMB}, $m->{swapUsedMB}, $m->{swapMB}, $m->{swapIO},
        (@ct ? join(" · ", @ct) : "없음"), (@other ? join(" · ", map { "$_->{name} $_->{cpu}%" } @other) : "없음"), ($o->{build} ? " | ★docker build 도는 중" : ""));
      fl(2, "$o->{host} 호스트 CPU 바쁨 $c->{busy}% ≥ 90") if $c->{busy} >= 90;
      fl(2, "$o->{host} 호스트 steal $c->{steal}% ≥ 5(가상 머신이 CPU 를 못 받음)") if $c->{steal} >= 5;
      fl(1, "$o->{host} 다른 프로세스 " . join(" · ", map { "$_->{name} $_->{cpu}%" } @other) . "(한 코어의 30% 넘음)") if @other;
      fl(1, "$o->{host} docker build 도는 중") if $o->{build};
      fl(3, "$o->{host} 메모리 — 그 1초에 스왑 오감 $m->{swapIO}쪽") if $m->{swapIO} > 0;
      $busy{$o->{host}} = 1 if $c->{busy} >= 90 || $c->{steal} >= 5;
    }
    my @net;
    for my $o (grep { $_->{k} eq "net" } @L) {
      my @c = @{ $o->{conn} }; my $md = med(@c);
      if (!@c) { push @net, "$o->{host}:$o->{port} 닿지 않음"; fl(7, "망 — 맥→$o->{host}:$o->{port} 닿지 않음"); next; }
      my ($mn, $mx) = ((sort { $a <=> $b } @c)[0], (sort { $b <=> $a } @c)[0]);
      push @net, sprintf("%s:%s 최소 %s · 중앙 %s · 최대 %s ms(%d번)", $o->{host}, $o->{port}, $mn, $md, $mx, scalar @c);
      my $lim = $md * 2 > $md + 30 ? $md * 2 : $md + 30;
      fl(7, "망 — 맥→$o->{host}:$o->{port} 왕복 최대 ${mx}ms > " . sprintf("%.0f", $lim) . "(튐" . ($busy{$o->{host}} ? " · 그 호스트 CPU 가 바빠 TCP 답도 늦을 수 있다 — 망만의 탓이 아닐 수 있다" : "") . ")") if $mx > $lim;
    }
    push @out, "[망] 맥 → 호스트 TCP 왕복 — " . (@net ? join(" | ", @net) : "잰 것 없음");
    my @fs = map { $_->[1] } sort { $a->[0] <=> $b->[0] } @flag;
    my $verdict = @fs ? "판정: 문턱 넘은 층 — " . join(" / ", @fs) : "판정: 서버 · 망 층은 모두 문턱 아래 — 렉이 계속 보이면 클라 쪽(브라우저 콘솔 __frameCapture() · T486)";
    if ($JSONOUT) { print JSON::PP->new->canonical->encode({ at => $at, rows => \@L, flags => \@fs, verdict => $verdict }), "\n"; exit 0; }
    print "live-lag $at — 존 틱 · 루프 · 호스트 · 망 (읽기만 · 문턱 = lag-table.js T486)\n";
    print "  $_\n" for @out;
    print "  $verdict\n";
  ' "$JSON" < "$TMP/all"
}

if [ "$WATCH" -gt 0 ]; then
  while :; do one_round; [ "$JSON" = 1 ] || echo; sleep "$WATCH"; done
else
  one_round
fi
