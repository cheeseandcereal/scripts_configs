#!/bin/sh
set -e

if [ "$1" != "skip" ]; then
  # Ask for initial confirmation
  read -p "This script will help install and setup a vanilla minecraft server on a blank ubuntu install. Continue? [y/n] " answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then exit 1; fi

  # Check and do user setup
  if [ $(id -u) -eq 0 ]; then
    if ! command -v sudo > /dev/null 2>&1; then
      echo "sudo is not installed. Installing now"
      apt-get update
      apt-get install -y sudo
    fi
    while true; do
      read -p "You should be running this as a non-root user for security. Make one with sudo permissions now? [y/n] " answer
      case "$answer" in
        [yY]* ) while true; do
                  read -p "Enter a name for the new user: " username
                  if [ ! -z "$username" ]; then
                    # Ensure no spaces in username
                    case "$username" in
                      *\ * )  echo "Spaces are not allowed in usernames"
                              ok="no"
                              ;;
                      * )     read -p "You entered '$username', is that ok? [y/n] " confirm
                              if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then ok="ok"; fi
                              ;;
                    esac
                    if [ "$ok" = "ok" ]; then
                      useradd -m $username -G sudo
                      break
                    fi
                  fi
                done
                while true; do
                  echo "Will now set up the password for $username"
                  if passwd "$username"; then break; fi
                done
                echo "$username user created. Continuing"
                script_path="$(readlink -f $0)"
                cp "$script_path" /tmp/install_mc.sh
                chmod 777 /tmp/install_mc.sh
                sudo -u "$username" /tmp/install_mc.sh skip
                rm /tmp/install_mc.sh
                exit 0
                ;;
        [nN]* ) read -p "Ok, are you sure you want to install as root? [y/n] " confirm
                if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then break; fi
                ;;
        * )     echo "Please answer y/n"
                ;;
      esac
    done
  fi
fi

echo "Checking for sudo privelages. Enter your user's password for sudo if prompted"
if ! sudo true; then echo "Unable to run with sudo" && exit 1; fi

user="$(id -un)"

echo "Installing dependencies"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y wget vim screen unattended-upgrades openjdk-11-jdk-headless

echo "Starting automatic updates"
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";' > /tmp/tmpupdateinterval
sudo mv /tmp/tmpupdateinterval /etc/apt/apt.conf.d/20auto-upgrades

# Set up initial directory
directory="$(eval echo ~$user)/minecraft_server"
while true; do
  read -p "What directory would you like to install the minecraft server into? [$directory] " new
  if [ -z "$new" ]; then break; fi
  if echo -n "$new" | grep -e '^/' > /dev/null 2>&1; then
    directory="$new"
    break
  else
    echo "Directory must be a full path (starting with '/')"
  fi
done
echo "Making directory $directory"
mkdir -p "$directory"
echo "eula=true" > "$directory/eula.txt"

while true; do
  read -p "Which version of the minecraft server would you like to install? (i.e. 1.13.2) " version
  url="https://papermc.io/api/v1/paper/$version/latest/download"
  # Use wget to test if this version exists and can be downloaded
  if wget --spider --tries 1 "$url" > /dev/null 2>&1; then
    wget "$url" -O "$directory/paperclip.jar"
    break
  else
    echo "Version $version couldn't be found. Try again"
  fi
done

# Create update script
echo "#!/bin/sh
echo \"Stopping minecraft server in order to update\"
sudo systemctl stop minecraft.service
mv \"$directory/logs/latest.log\" \"$directory/logs/latest.log.old\"
while true; do
  read -p \"Which version of the minecraft server would you like to install? (i.e. 1.13.2) \" version
  url=\"https://papermc.io/api/v1/paper/"'$version'"/latest/download\"
  # Use wget to test if this version exists and can be downloaded
  if wget --spider --tries 1 "'"$url"'" > /dev/null 2>&1; then
    wget "'"$url"'" -O \"$directory/paperclip.jar\"
    break
  else
    echo \"Version "'$version'" couldn't be found. Try again\"
  fi
done
sudo systemctl start minecraft.service
echo \"Waiting for server to finish rebooting\"
while ! grep -e 'Done' \"$directory/logs/latest.log\" > /dev/null 2>&1; do
  sleep 1
done
echo \"Done! Server should be finished updating for minecraft "'$version'"\"" > "$directory/update.sh"
chmod +x "$directory/update.sh"

# Create readme
echo "In order to interact with the server, systemd is used to start/run the server, and screen is used so that the server repl can be interacted with manually

In order to start/stop the service, use systemctl
sudo systemctl start minecraft
sudo systemctl stop minecraft
sudo systemctl status minecraft
sudo systemctl restart minecraft

In order to manually interact with the server repl, while logged in as the '$user' user, use:
screen -r
And simply press (ctrl+a then d) to detach again.

In order to update the server, simply use:
sh $directory/update.sh

In order to modify server settings, edit $directory/server.properties" > "$directory/README.txt"

while true; do
  read -p "How much RAM would you like to dedicate to the server? (Must end in G (for gigabytes) or M (for megabytes) " ram
  if echo -n "$ram" | grep -e '^[0-9]\{1,\}[M|G]$' > /dev/null 2>&1; then
    break
  else
    echo "Must be a whole number that ends with 'M' or 'G'"
  fi
done

echo "Installing and starting service for server"

echo "[Unit]
Description=Minecraft Server
After=network.target

[Service]
WorkingDirectory=$directory
PrivateUsers=true
User=$user
Group=$user
ProtectSystem=true

ExecStart=/bin/sh -c '/usr/bin/screen -DmS mc-server /usr/bin/java -server -Xms$ram -Xmx$ram -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:MaxGCPauseMillis=100 -XX:+DisableExplicitGC -XX:TargetSurvivorRatio=90 -XX:G1NewSizePercent=50 -XX:G1MaxNewSizePercent=80 -XX:G1MixedGCLiveThresholdPercent=35 -XX:+AlwaysPreTouch -XX:+ParallelRefProcEnabled -jar paperclip.jar'

ExecReload=/usr/bin/screen -p 0 -S mc-server -X eval 'stuff \"reload\""'\\\\'"015'

ExecStop=/usr/bin/screen -p 0 -S mc-server -X eval 'stuff \"say SERVER SHUTTING DOWN. Saving map...\""'\\\\'"015'
ExecStop=/usr/bin/screen -p 0 -S mc-server -X eval 'stuff \"save-all\""'\\\\'"015'
ExecStop=/usr/bin/screen -p 0 -S mc-server -X eval 'stuff \"stop\""'\\\\'"015'
ExecStop=/bin/sleep 10

Restart=on-failure
RestartSec=30s

[Install]
WantedBy=multi-user.target" > /tmp/tmpminecraftservicefile
sudo mv /tmp/tmpminecraftservicefile /etc/systemd/system/minecraft.service

sudo systemctl enable minecraft.service
sudo systemctl start minecraft.service

echo "Waiting for server to finish first boot"
while ! grep -e 'Done' "$directory/logs/latest.log" > /dev/null 2>&1; do
  sleep 1
done

cat "$directory/README.txt"

echo "\nThe server should be up and running. Run 'cat $directory/README.txt' for management details"
