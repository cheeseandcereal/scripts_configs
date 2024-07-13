#!/usr/bin/env fish
# Set up fish from a newly installed shell with my preferences

# First check that nvm is installed
if ! test -d ~/.nvm
  echo "Make sure nvm is installed first https://github.com/nvm-sh/nvm/blob/master/README.md#install-script"
  exit 1
end

# Install fisher package manager
curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher
# Install nvm for fish
set -U fish_user_paths
fisher install cheeseandcereal/fast-nvm-fish
# Install the pure prompt and modify it to be a single line
fisher install pure-fish/pure
set -U pure_enable_single_line_prompt true
sed -i "s/space ' '/space ''/" ~/.config/fish/functions/_pure_prompt.fish

echo 'function u --description \'Upload a file\'
    if [ $argv[1] ]
        # write to output to tmpfile because of progress bar
        set -l tmpfile ( mktemp -t transferXXXXXX )
        if [ $argv[2] -a $argv[2] = "text" ]
            curl --progress-bar --upload-file "$argv[1]" -H \'Content-Type: text/plain; charset=UTF-8\' https://d.robit.pw/u/(basename $argv[1]) >> $tmpfile
        else
            curl --progress-bar --upload-file "$argv[1]" https://d.robit.pw/u/(basename $argv[1]) >> $tmpfile
        end
        cat $tmpfile | perl -pe "chomp if eof" | xsel -ib
        cat $tmpfile
        command rm -f $tmpfile
    else
        echo \'usage: transfer FILE_TO_TRANSFER\'
    end
end' > ~/.config/fish/functions/u.fish

# Create a fish config file (backing up if one already exists)
if test -f ~/.config/fish/config.fish
  mv ~/.config/fish/config.fish ~/.config/fish/config.fish.bak
end

echo '#!/usr/bin/env fish

set -U pure_enable_single_line_prompt true
set -x PATH $PATH /home/adam/Documents/scripts .
set -x EDITOR vim
set -x VISUAL vim
set -x BROWSER firefox
set -x GOPATH /home/adam/go

# Set up gpg-agent
set -x SSH_AUTH_SOCK "/run/user/1000/gnupg/S.gpg-agent.ssh"
set -x GPG_TTY (tty)
gpg-connect-agent updatestartuptty /bye >/dev/null

# Generic aliases
abbr ll "ls -Al"
abbr k "kubectl"
abbr v "vim"
abbr g "git"
abbr p "sudo pacman"
abbr dl \'aria2c --max-connection-per-server=8 --min-split-size=1M\'
abbr copy \'perl -pe "chomp if eof" | xsel -ib\'
abbr rcopy \'rsync -arh --progress\'
abbr orand \abbr orand \'xdg-open (ls | shuf -n 1)\'
abbr code \'code . && exit\'

# Kubectl aliases
abbr k "kubectl"
abbr gp \'kubectl get pod\'
abbr gl \'kubectl logs\'
abbr kp \'kubectl delete pod --grace-period=0\'
abbr descp \'kubectl describe pod\'

nvm use 20' > ~/.config/fish/config.fish


# Done
echo "Done configuring fish. Be sure to restart any currently open fish shells"
