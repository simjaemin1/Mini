#!/usr/bin/env bash
# T1436 표 — 판 폴더(/tmp/t1436/<판>)에서 table.md · table.json · 날 줄(.days.jsonl.gz)을 이 폴더에 만든다(손으로 안 고침).
#   aux = 곁 견줌(같은 조건 두 판 · 때끼리 · 덤프 판) — 칸 분류에는 안 넣는다.
cd "$(dirname "$0")/../.." || exit 2
W=/tmp/t1436; O=계측/T1436_2026-11-22
node scripts/t1436-table.js --out "$O" \
  --pair a1020=$W/a1020-one,$W/a1020-day --pair a7=$W/a7-one,$W/a7-day \
  --pair a1020-mid=$W/a1020-one,$W/a1020-mid --pair a1020-night=$W/a1020-one,$W/a1020-night \
  --pair b1020=$W/b1020-one,$W/b1020-day --pair b7=$W/b7-one,$W/b7-day \
  --pair b1020-mid=$W/b1020-one,$W/b1020-mid --pair b1020-night=$W/b1020-one,$W/b1020-night \
  --pair x-twice-a1020=$W/a1020-one,$W/a1020-one-r,aux --pair x-twice-a7=$W/a7-one,$W/a7-one-r,aux --pair x-twice-b1020=$W/b1020-one,$W/b1020-one-r,aux \
  --pair x-day-mid-a1020=$W/a1020-day,$W/a1020-mid,aux --pair x-day-night-a1020=$W/a1020-day,$W/a1020-night,aux \
  --pair x-day-mid-b1020=$W/b1020-day,$W/b1020-mid,aux --pair x-day-night-b1020=$W/b1020-day,$W/b1020-night,aux \
  --pair x-dump-a1020=$W/a1020-one-r,$W/p1020-day5,aux --pair x-dump-b1020=$W/pb-one,$W/pb-day,aux \
  --inert x-inert=$W/a1020-day,$W/a1020-inert \
  --dump a1020-d2=$W/a1020-one-r,$W/p1020-day5,2 --dump a1020-d4=$W/a1020-one-r,$W/p1020-day5,4 \
  --dump b1020-d2=$W/pb-one,$W/pb-day,2 --dump b1020-d3=$W/pb-one,$W/pb-day,3 \
  --boot a1020-day=$W/a1020-day,$W/a1020-one-r --boot a7-day=$W/a7-day,$W/a7-one-r \
  --boot b1020-day=$W/b1020-day,$W/b1020-one --boot b7-day=$W/b7-day,$W/b7-one \
  --boot a1020-mid=$W/a1020-mid,$W/a1020-one-r --boot a1020-night=$W/a1020-night,$W/a1020-one-r \
  --boot b1020-mid=$W/b1020-mid,$W/b1020-one --boot b1020-night=$W/b1020-night,$W/b1020-one
