#!/bin/bash
# ============================================================
# Oracle Sync Cron Job — Runs daily at 2:10 AM Dubai time (22:10 UTC)
# 
# This script:
# 1. Waits for any running RM sync to finish (shared lock)
# 2. Connects FortiGate SSL-VPN (openfortivpn)
# 3. Adds routes for Oracle network
# 4. Runs Oracle → PostgreSQL sync (current year)
# 5. Disconnects VPN
#
# Install on VPS crontab:
#   10 22 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1
#
# Prerequisites on VPS:
#   - openfortivpn installed
#   - Oracle Instant Client at /usr/lib/oracle/21/client64/lib
#   - Node.js with oracledb, pg, pg-copy-streams, dotenv in server/node_modules
# ============================================================

LOG_PREFIX="[oracle-sync-cron]"
APP_DIR="/home/propackhub/app"
SERVER_DIR="$APP_DIR/server"
SCRIPTS_DIR="$APP_DIR/scripts"
SYNC_SCRIPT="$SCRIPTS_DIR/simple-oracle-sync.js"
VPN_LOG="/tmp/vpn-cron.log"
LOCK_FILE="/tmp/oracle-vpn.lock"

# VPN config
VPN_GATEWAY="5.195.104.114"
VPN_PORT="48443"
VPN_USER="camille"
VPN_PASSWORD="***REDACTED***"
VPN_TRUSTED_CERT="ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66"

# Oracle Instant Client
export LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib:$LD_LIBRARY_PATH
export NODE_PATH=/home/propackhub/app/server/node_modules
export PATH=/usr/local/bin:$PATH

CURRENT_YEAR=$(date +%Y)

echo ""
echo "============================================================"
echo "$LOG_PREFIX Starting Oracle sync at $(date)"
echo "$LOG_PREFIX Year: $CURRENT_YEAR"
echo "============================================================"

# Function to cleanup VPN and lock on exit
cleanup() {
    echo "$LOG_PREFIX Cleaning up..."
    sudo pkill -f openfortivpn 2>/dev/null
    sudo ip route del 10.0.0.0/8 dev ppp0 2>/dev/null
    sudo ip route del 172.16.0.0/12 dev ppp0 2>/dev/null
    sudo ip route del 192.168.0.0/16 dev ppp0 2>/dev/null
    rm -f "$LOCK_FILE"
    echo "$LOG_PREFIX Cleanup done."
}
trap cleanup EXIT

# Step 0: Wait for any running RM sync to release the VPN lock (max 10 min)
if [ -f "$LOCK_FILE" ]; then
    LOCK_OWNER=$(cat "$LOCK_FILE" 2>/dev/null)
    echo "$LOG_PREFIX VPN lock held by: $LOCK_OWNER — waiting..."
    WAIT_LOCK=0
    while [ -f "$LOCK_FILE" ] && [ $WAIT_LOCK -lt 600 ]; do
        sleep 10
        WAIT_LOCK=$((WAIT_LOCK + 10))
        echo "$LOG_PREFIX   waiting... ${WAIT_LOCK}s"
    done
    if [ -f "$LOCK_FILE" ]; then
        echo "$LOG_PREFIX Lock still held after 10 min — removing stale lock and proceeding."
        rm -f "$LOCK_FILE"
    else
        echo "$LOG_PREFIX Lock released. Proceeding."
    fi
fi

# Acquire lock
echo "oracle-sync-cron $$" > "$LOCK_FILE"

# Step 1: Kill any existing VPN
echo "$LOG_PREFIX Killing any existing VPN..."
sudo pkill -f openfortivpn 2>/dev/null
sleep 2

# Step 2: Start VPN
echo "$LOG_PREFIX Starting VPN tunnel..."
sudo openfortivpn ${VPN_GATEWAY}:${VPN_PORT} \
    -u "$VPN_USER" \
    -p "$VPN_PASSWORD" \
    --no-routes \
    --trusted-cert "$VPN_TRUSTED_CERT" \
    > "$VPN_LOG" 2>&1 &

VPN_PID=$!

# Wait for tunnel (max 30 seconds)
WAIT=0
TUNNEL_UP=false
while [ $WAIT -lt 30 ]; do
    sleep 2
    WAIT=$((WAIT + 2))
    if grep -q "Tunnel is up" "$VPN_LOG" 2>/dev/null; then
        TUNNEL_UP=true
        break
    fi
    # Check if process died
    if ! kill -0 $VPN_PID 2>/dev/null; then
        echo "$LOG_PREFIX VPN process died. Log:"
        cat "$VPN_LOG"
        exit 1
    fi
done

if [ "$TUNNEL_UP" = false ]; then
    echo "$LOG_PREFIX VPN tunnel did not establish in 30s. Log:"
    cat "$VPN_LOG"
    exit 1
fi

echo "$LOG_PREFIX VPN tunnel established."

# Step 3: Add routes
echo "$LOG_PREFIX Adding routes..."
sudo ip route add 10.0.0.0/8 dev ppp0 2>/dev/null
sudo ip route add 172.16.0.0/12 dev ppp0 2>/dev/null
sudo ip route add 192.168.0.0/16 dev ppp0 2>/dev/null

# Step 4: Wait for routes to settle
sleep 3

# Step 5: Test Oracle reachability
echo "$LOG_PREFIX Testing Oracle reachability..."
if timeout 10 bash -c 'echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521' 2>/dev/null; then
    echo "$LOG_PREFIX Oracle is reachable!"
else
    echo "$LOG_PREFIX Oracle NOT reachable through VPN. Aborting."
    exit 1
fi

# Step 6: Run sync
echo "$LOG_PREFIX Running Oracle sync for year $CURRENT_YEAR..."
cd "$SERVER_DIR"
node "$SYNC_SCRIPT" "$CURRENT_YEAR"
SYNC_EXIT=$?

if [ $SYNC_EXIT -eq 0 ]; then
    echo "$LOG_PREFIX Sync completed successfully!"
else
    echo "$LOG_PREFIX Sync FAILED with exit code $SYNC_EXIT"
fi

echo "$LOG_PREFIX Finished at $(date)"
echo "============================================================"

exit $SYNC_EXIT
