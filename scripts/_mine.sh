#!/usr/bin/env bash
# === scripts/_mine.sh — 이름으로 죽이되 **내 네트워크 방(netns)의 것만** (source 해서 쓴다) ================
#
# ★왜 [T853 · T829 회부 1] 하네스를 한 상자에서 여럿 돌릴 때 레인마다 제 netns·제 /tmp 로 갈라도, `pkill -f "server/centra[l].js"`
#   같은 **이름으로 죽이기**는 프로세스 번호 공간(pid ns)이 하나라 남의 레인의 central·존까지 SIGTERM 으로 죽인다(central 은
#   "SIGTERM 받음 — 종료" · 종료코드 0 · 그 뒤 레인은 `ERR_CONNECTION_REFUSED`). 레포 글자에서 하네스(e2e·test)엔 이미 없다(T773).
#   남은 곳은 하네스 **사이**를 치우는 손 스크립트(`_drain.sh` · `t9-sweep.sh` · `t10-stale-control.sh` · `bench-*.sh`)다.
# ★어떻게: 레인이 서로 갈라진 것은 netns 다(포트 3010/3020 이 레인마다 따로 서려면 그래야 한다). 그래서 "내 것" = **나와 같은
#   netns 에 사는 프로세스**. 레인이 하나뿐인 상자(netns 하나)에선 종전과 같은 집합이다 — 느슨해지지 않는다.
#   `/proc` 이 없는 곳(맥)에서는 두 값이 다 비어 같다 → 종전 그대로 이름으로 죽인다.
#
# 쓰는 법:  source scripts/_mine.sh ; kill_mine 'server/centra[l].js'      # 기본 신호 TERM(= pkill 의 기본)
#           kill_mine 'server/zon[e].js' KILL ;  count_mine 'server/zon[e].js'
_mine_ns() { readlink "/proc/$1/ns/net" 2>/dev/null || true; }
mine_pids() {   # mine_pids <패턴> → 같은 netns 의 pid 들(나 자신은 뺀다)
  local me p; me=$(_mine_ns $$)
  for p in $(pgrep -f "$1" 2>/dev/null); do
    [ "$p" = "$$" ] && continue
    [ "$(_mine_ns "$p")" = "$me" ] && echo "$p"
  done
}
kill_mine() { local p; for p in $(mine_pids "$1"); do kill "-${2:-TERM}" "$p" 2>/dev/null || true; done; }
count_mine() { mine_pids "$1" | wc -l | tr -d ' '; }
