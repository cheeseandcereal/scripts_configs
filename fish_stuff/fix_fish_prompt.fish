#!/usr/bin/env fish
# Modify the pure fish prompt to be all on a single line
sed -i "s/\\\n//" ~/.config/fish/functions/_pure_prompt_new_line.fish
sed -i 's/-e (/-e -n (/g' ~/.config/fish/functions/fish_prompt.fish
sed -i 's/echo "/echo -n "/g' ~/.config/fish/functions/_pure_prompt_ending.fish
