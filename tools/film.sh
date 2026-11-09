#!/usr/bin/env bash
# tools/film.sh [sceneW sceneH]  : the whole film at 60 fps, two seconds at a time.
# Frames for one piece are rendered, encoded, then deleted, so the run never holds more than 120 PNGs.
# Finished pieces are skipped: a stopped run picks up where it left off.
set -euo pipefail
cd "$(dirname "$0")/.."
SW=${1:-1440}; SH=${2:-810}; LEN=36; STEP=2
D=out/final; mkdir -p "$D/seg"
for ((a = 0; a < LEN; a += STEP)); do
  seg=$(printf '%s/seg/s_%02d.mp4' "$D" "$a")
  [ -f "$seg" ] && continue
  rm -f "$D"/frames/*.part
  for try in 1 2 3 4; do
    node tools/record.mjs "$D/frames" 1920 1080 "$SW" "$SH" high 4 60 "$a" "$((a + STEP))" 6 && break
    echo "piece $a: recorder stopped, try $try"; sleep 5
  done
  n=$(ls "$D/frames" | grep -c '^f_.*\.png$')
  [ "$n" -eq $((STEP * 60)) ] || { echo "piece $a has $n frames"; exit 1; }
  ffmpeg -v error -y -framerate 60 -start_number $((a * 60)) -i "$D/frames/f_%05d.png" \
    -c:v libx264 -preset slow -crf 15 -g 60 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    "$seg.part.mp4"
  mv "$seg.part.mp4" "$seg"
  rm -r "$D/frames"
  echo "piece $a done"
done
ls "$D"/seg/s_*.mp4 | sed "s|^$D/|file '|; s|$|'|" > "$D/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$D/list.txt" -c copy -movflags +faststart out/orbit_to_surface.mp4
echo FILM DONE
