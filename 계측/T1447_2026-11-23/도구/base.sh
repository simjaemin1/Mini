#!/bin/bash
# T1447 끈 판 — 서버 기준선(11-18) 1020:400 · 손잡이 끔(기본) · 이 가지 나무
S=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1447
cd /home/claude/mini
date -u > $S/ev/기준선1118_끔.txt
git rev-parse --short HEAD >> $S/ev/기준선1118_끔.txt
git status --short | head -20 >> $S/ev/기준선1118_끔.txt
node scripts/server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400 >> $S/ev/기준선1118_끔.txt 2>&1; echo "rc=$?" >> $S/ev/기준선1118_끔.txt
