#!/bin/bash
# Sync var/strategies/ from local to server (bypasses GitHub)
rsync -avz --delete \
  --exclude '.gitignore' \
  var/strategies/ \
  canvarol@78.189.161.234:~/canbot/var/strategies/
