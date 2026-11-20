# tag:seed:env ...
cd /tmp/t1359wt
for x in "$@"; do tag=${x%%:*}; r=${x#*:}; s=${r%%:*}; e=${r#*:}; [ "$e" = "$r" ] && e=""
 grep -q "^$tag-$s " /tmp/t1359/done.txt 2>/dev/null && continue
 NODE_OPTIONS="--max-old-space-size=4096" node scripts/t1331-run.js /tmp/t1359/runs $tag-$s hanbando $s 400 ${e:+--env $e} > /tmp/t1359/runs/$tag-$s.out 2>&1
 echo "$tag-$s $(date +%T) $(cat /tmp/t1359/runs/$tag-$s.done 2>/dev/null)" >> /tmp/t1359/done.txt; done
