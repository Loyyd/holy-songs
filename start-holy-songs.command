#!/bin/bash

# Open a new Terminal window and run start.sh
osascript -e 'tell application "Terminal"
    do script "cd /Users/konradkunkel/Documents/GitHub/holy-songs && /bin/bash /Users/konradkunkel/Documents/GitHub/holy-songs/start.sh"
    activate
end tell'
