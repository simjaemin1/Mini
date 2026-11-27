cd /home/user/Mini; export WT=/home/user/t1435bis OUT=/home/user/t1435w/bisect.tsv
mapfile -t L < <(git rev-list --first-parent --reverse 21b20703..1aa63e63)
lo=-1; hi=$(( ${#L[@]} - 1 ))
while [ $(( hi - lo )) -gt 1 ]; do
  m=$(( (lo + hi) / 2 ))
  bash scripts/t1435-bisect.sh "${L[$m]}" 3 > /dev/null
  if [ "$(tail -1 $OUT | cut -f3)" = R ]; then hi=$m; elif [ "$(tail -1 $OUT | cut -f3)" = G ]; then lo=$m; else echo "X at ${L[$m]}"; break; fi
  echo "lo=$lo hi=$hi"
done
echo "첫 빨강 ${L[$hi]} · 앞 $( [ $lo -ge 0 ] && echo ${L[$lo]} || echo 21b20703)"
