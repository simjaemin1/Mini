#!/usr/bin/env bash
# === scripts/xhost-rtt.sh — 호스트 ↔ 호스트 왕복 한 판(T518 추신 · 세션5 · 2026-09-29) =========================
#
# ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라.** 게임 상태 무접촉 · 바깥 문(`/health`)만 두드린다 · 비밀 0.
#
# 왜 — 서울 ↔ 도쿄 존↔존 흐름(`/ghost_sync` · `/handoff_prepare` · `/cross_damage`)의 한 방향이 유령 나이(T512 · 100ms 주기 + 한 방향)와
#   핸드오프 벽시계(T498 끔 = central 왕복 + prepare 왕복)를 정한다. 그 한 방향은 **두 서버 사이**에서만 잴 수 있다(맥에서 재면 맥의 길이다).
#
# 쓰는 법(재민 · 도쿄에서 서울 쪽, 서울에서 도쿄 쪽 한 번씩):
#   ssh tokyo 'PEER=141.164.35.114 PORTS="3010 3020" bash -s' < scripts/xhost-rtt.sh > ~/Mini/_lag/$(date +%m%d)_tokyo2seoul.jsonl
#   ssh seoul 'PEER=108.160.135.177 PORTS="3021" bash -s' < scripts/xhost-rtt.sh > ~/Mini/_lag/$(date +%m%d)_seoul2tokyo.jsonl
#   손잡이: N(번 · 30) · GAP(초 · 0.3) · PEER(상대 주소) · PORTS(상대의 `/health` 포트들)
#
# 출력(JSON 한 줄씩): meta · ping(ICMP · 막혀 있으면 ok:false) · h(포트마다 한 번: connect = TCP 손 왕복 · req = 요청 왕복 · code) · sum(포트마다 분위) · end
#   connect 와 req 는 **따로** 본다 — 맥 → 서울에서 connect p50 ~75ms · req p50 ~18ms 로 갈렸다(T518 추신 §1 · 서버 쪽 SYN 처리 의심).
# =============================================================================================================
set -u
N="${N:-30}"; GAP="${GAP:-0.3}"; PEER="${PEER:?PEER=<상대 주소>}"; PORTS="${PORTS:-3010}"
echo "{\"k\":\"meta\",\"t\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"host\":\"$(hostname)\",\"peer\":\"$PEER\",\"ports\":\"$PORTS\",\"n\":$N}"
if command -v ping >/dev/null 2>&1; then
  P="$(ping -c "$N" -i 0.2 -W 2 "$PEER" 2>/dev/null | tail -2 | tr '\n' ' ')"
  RT="$(echo "$P" | sed -n 's#.*= \([0-9.]*\)/\([0-9.]*\)/\([0-9.]*\)/\([0-9.]*\) ms.*#\1 \2 \3 \4#p')"
  if [ -n "$RT" ]; then set -- $RT; echo "{\"k\":\"ping\",\"ok\":true,\"min\":$1,\"avg\":$2,\"max\":$3,\"mdev\":$4,\"line\":\"$(echo "$P" | cut -c1-120)\"}"
  else echo "{\"k\":\"ping\",\"ok\":false}"; fi
fi
for port in $PORTS; do
  : > /tmp/xhost.$$
  for i in $(seq 1 "$N"); do
    o="$(curl -s -m 5 -o /dev/null -w '%{time_connect} %{time_starttransfer} %{http_code}' "http://$PEER:$port/health" 2>/dev/null)"
    set -- $o
    c="$(awk -v a="$1" 'BEGIN{printf "%.1f", a*1000}')"; r="$(awk -v a="$1" -v b="$2" 'BEGIN{printf "%.1f", (b-a)*1000}')"
    echo "{\"k\":\"h\",\"port\":$port,\"i\":$i,\"connect\":$c,\"req\":$r,\"code\":\"$3\"}"
    echo "$c $r" >> /tmp/xhost.$$
    sleep "$GAP"
  done
  for col in 1 2; do
    what=connect; [ "$col" = 2 ] && what=req
    sort -n -k"$col" /tmp/xhost.$$ | awk -v port="$port" -v what="$what" -v col="$col" '
      function at(p,  i) { i = int(n * p) + 1; if (i > n) i = n; return v[i] }
      { v[NR] = $col } END { n = NR; if (!n) exit; printf "{\"k\":\"sum\",\"port\":%s,\"what\":\"%s\",\"min\":%s,\"p50\":%s,\"p95\":%s,\"max\":%s}\n", port, what, v[1], at(0.5), at(0.95), v[n] }'
  done
  rm -f /tmp/xhost.$$
done
echo "{\"k\":\"end\",\"t\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
