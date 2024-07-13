#!/usr/bin/env fish
# Modify the pure fish pure prompt to be on a single line and not have an extra space
set -U pure_enable_single_line_prompt true
sed -i "s/space ' '/space ''/" ~/.config/fish/functions/_pure_prompt.fish
