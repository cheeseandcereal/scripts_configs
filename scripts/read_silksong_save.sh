#!/bin/sh
set -eu

if [ -z "${XDG_CONFIG_HOME+x}" ]; then
  config="$HOME/.config"
else
  config="$XDG_CONFIG_HOME"
fi
SAVE_FILE=$(echo "$config/unity3d/Team Cherry/Hollow Knight Silksong/"*/user1.dat)

offset=22
while ! tail -c "+$offset" "$SAVE_FILE" | head -c -1 | tr -d '\n\r' | base64 -d > /dev/null 2>&1; do
  offset=$((offset + 1))
  if [ $offset -gt 100 ]; then
    >&2 echo "Could not find valid offset for base64 data in save file"
    exit 1
  fi
done

# Key converted into hex from ascii string: UKu52ePUBwetZ9wX888o54dnfBReu0T1l - https://gbatemp.net/threads/hollow-knight-save-edit.507417/post-8088201
tail -c "+$offset" "$SAVE_FILE" | head -c -1 | tr -d '\n\r' | openssl enc -aes-256-ecb -d -K 554b753532655055427765745a39774e5838386f3534646e664b52753054316c -a -A | jq
