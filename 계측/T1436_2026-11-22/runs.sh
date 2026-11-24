#!/usr/bin/env bash
# T1436 판 전부 — 줄 둘(나란히 둘까지). 판 이름 · 인자:
#   a1020-one / a1020-day : 끔 세계 1020 · 30날 · 한 번에(마디 30) / 날마다 다시 뜸(마디 1 · 경계)
#   a7-one / a7-day       : 끔 세계 7 · 같은 꼴
#   a1020-mid / a1020-night : 끔 세계 1020 · 날마다 다시 뜸 · 멈추는 때 = 다음 날 0.35 몫(낮 한가운데) / 0.85 몫(밤)
#   a1020-inert           : 끔 세계 1020 · 5날 · 날마다 · t1436-shift-stop 을 싣되 몫 없음(프리로드 무변 확인 ↔ a1020-day 1 ~ 5날)
#   b1020-one / b1020-day / b1020-mid / b1020-night : 몸 세계(T577_BODY=1 · T1331_BEAST_BODY=1) 1020 · 10날 · 같은 꼴
cd "$(dirname "$0")" || exit 2
L=./run-lane.sh
[ -n "${1:-}" ] || setsid nohup bash -c "$L lane1 'a1020-one:--days 30 --seed 1020 --every 30' 'a1020-day:--days 30 --seed 1020 --every 1' 'a1020-mid:--days 30 --seed 1020 --every 1 --frac 0.35' 'a1020-inert:--days 5 --seed 1020 --every 1 --inert' 'b1020-one:--days 10 --seed 1020 --every 10 --body' 'b1020-mid:--days 10 --seed 1020 --every 1 --body --frac 0.35'; echo EXIT \$? > /tmp/t1436/logs/lane1.done" > /tmp/t1436/logs/lane1.out 2>&1 &
[ -n "${1:-}" ] || setsid nohup bash -c "$L lane2 'a7-one:--days 30 --seed 7 --every 30' 'a7-day:--days 30 --seed 7 --every 1' 'a1020-night:--days 30 --seed 1020 --every 1 --frac 0.85' 'b1020-day:--days 10 --seed 1020 --every 1 --body' 'b1020-night:--days 10 --seed 1020 --every 1 --body --frac 0.85'; echo EXIT \$? > /tmp/t1436/logs/lane2.done" > /tmp/t1436/logs/lane2.out 2>&1 &
[ -n "${1:-}" ] || echo started
# 줄 셋(덧 · 줄 하나가 끝난 뒤에 — 나란히 둘까지 그대로): 한 번에 돈 판을 다시(날마다 RSS 표본 — t1436-run 에 덧붙인 잼 · 같은 조건 두 판 같음 확인 겸) ·
#   날마다 다시 뜬 5날 판(마을 칸 날것 덤프 `T740_DUMP_DAYS=2,4` — 기존 t740-side-hook 관찰 · `_site` 갈림이 무엇인지)
if [ "${1:-}" = lane3 ]; then
setsid nohup bash -c "until [ -f /tmp/t1436/logs/lane1.done ] || [ -f /tmp/t1436/logs/lane2.done ]; do sleep 60; done; T740_DUMP_DAYS=2,4 $L lane3 'a1020-one-r:--days 30 --seed 1020 --every 30' 'p1020-day5:--days 5 --seed 1020 --every 1' 'a7-one-r:--days 30 --seed 7 --every 30'; echo EXIT \$? > /tmp/t1436/logs/lane3.done" > /tmp/t1436/logs/lane3.out 2>&1 &
echo lane3
fi
# 줄 넷(덧 · 줄 하나 · 둘이 다 끝난 뒤 — 줄 셋과 나란히 둘): 몸 세계 한 번에 돈 판을 다시(같은 조건 두 판 같음) · 몸 세계 시드 7 한 번에 / 날마다
if [ "${1:-}" = lane4 ]; then
setsid nohup bash -c "until [ -f /tmp/t1436/logs/lane1.done ] && [ -f /tmp/t1436/logs/lane2.done ]; do sleep 60; done; $L lane4 'b1020-one-r:--days 10 --seed 1020 --every 10 --body' 'b7-one:--days 10 --seed 7 --every 10 --body' 'b7-day:--days 10 --seed 7 --every 1 --body'; echo EXIT \$? > /tmp/t1436/logs/lane4.done" > /tmp/t1436/logs/lane4.out 2>&1 &
echo lane4
fi
# 줄 다섯(덧 · 줄 셋이 끝난 뒤 — 줄 넷과 나란히 둘): 몸 세계 3날 한 번에 / 날마다 — 마을 칸 날것 덤프(2날 · 기존 t740-side-hook) — 2날에 갈린 칸이 무엇인지
if [ "${1:-}" = lane5 ]; then
setsid nohup bash -c "until [ -f /tmp/t1436/logs/lane3.done ]; do sleep 60; done; T740_DUMP_DAYS=2,3 $L lane5 'pb-one:--days 3 --seed 1020 --every 3 --body' 'pb-day:--days 3 --seed 1020 --every 1 --body'; echo EXIT \$? > /tmp/t1436/logs/lane5.done" > /tmp/t1436/logs/lane5.out 2>&1 &
echo lane5
fi
