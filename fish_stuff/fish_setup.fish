#!/usr/bin/env fish
# Set up fish from a newly installed shell with my preferences

# First check that nvm is installed
if ! test -d ~/.nvm
  echo "Make sure nvm is installed first https://github.com/nvm-sh/nvm/blob/master/README.md#install-script"
  exit 1
end

# Install fisher package manager
curl https://git.io/fisher --create-dirs -sLo ~/.config/fish/functions/fisher.fish
# Install nvm for fish
set -U fish_user_paths
fisher add brigand/fast-nvm-fish
# Install the pure prompt and modify it to be a single line
fisher add rafaelrinaldi/pure
sed -i "s/\\\n//" ~/.config/fish/functions/_pure_prompt_new_line.fish
sed -i 's/-e (/-e -n (/g' ~/.config/fish/functions/fish_prompt.fish
sed -i 's/echo "/echo -n "/g' ~/.config/fish/functions/_pure_prompt_ending.fish

# Create a fish config file (backing up if one already exists)
if test -f ~/.config/fish/config.fish
  mv ~/.config/fish/config.fish ~/.config/fish/config.fish.bak
end

echo '#!/usr/bin/env fish

set -x PATH $PATH /home/adam/Documents/scripts .
set -x EDITOR vim
set -x VISUAL vim
set -x BROWSER firefox

# Set up gpg-agent
set -x SSH_AUTH_SOCK "/run/user/1000/gnupg/S.gpg-agent.ssh"
set -x GPG_TTY (tty)
gpg-connect-agent updatestartuptty /bye >/dev/null

# Generic aliases
abbr ll "ls -Al"
abbr v "vim"
abbr g "git"
abbr p "sudo pacman"
abbr copy \'perl -pe "chomp if eof" | xsel -ib\'

nvm use 10' > ~/.config/fish/config.fish


# Done
echo "Done configuring fish. Be sure to restart any currently open fish shells"
