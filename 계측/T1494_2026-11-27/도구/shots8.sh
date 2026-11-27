#!/bin/bash
# 그림 마지막 크롬 판 — 「보냄」 바로 뒤부터 소문을 기다린다(WebKit 판 webkit4 가 끝난 뒤 · 무거운 일 둘까지)
while [ ! -f /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/webkit4.done ]; do sleep 10; done
cd /home/claude/t1494
unset TMPDIR
node scripts/t1494-shots.js --out-dir /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final7 --json /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final7.json --browser chromium > /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final7.log 2>&1; echo "rc=$?" >> /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final7.log
touch /tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1494/shots/final7.done
