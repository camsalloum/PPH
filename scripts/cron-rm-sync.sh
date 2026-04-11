#!/bin/bash
# ============================================================
# RM (Raw Material) Sync Cron Job — Runs every 30 minutes
#
# This script:
# 1. Checks if Oracle is reachable (VPN may already be up)
# 2. If not, connects FortiGate SSL-VPN
# 3. Runs RM sync (Oracle → PostgreSQL)
# 4. Disconnects VPN only if we connected it
#
# Install on VPS crontab:
#   */30 * * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1
# ============================================================

LOG_PREFIX="[rm-sync-cron]"
APP_DIR="/home/propackhub/app"
SCRIPTS_DIR="$APP_DIR/scripts"
SYNC_SCRIPT="$SCRIPTS_DIR/simple-rm-sync.js"
VPN_LOG="/tmp/vpn-rm-cron.log"
LOCK_FILE="/tmp/oracle-vpn.lock"

# VPN config
VPN_GATEWAY="5.195.104.114"
VPN_PORT="48443"
VPN_USER="camille"
VPN_PASSWORD="***REDACTED***"
VPN_TRUSTED_CERT="ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66"

# Environment
export LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib:$LD_LIBRARY_PATH
export NODE_PATH=/home/propackhub/app/server/node_modules
export PATH=/usr/local/bin:$PATH

echo ""
echo "============================================================"
echo "$LOG_PREFIX Starting RM sync at $(date)"
echo "============================================================"

# Track whether WE started the VPN (so we only kill it if we did)
WE_STARTED_VPN=false

# Function to cleanup VPN on exit (only if we started it)
cleanup() {
    if [ "$WE_STARTED_VPN" = true ]; then
        echo "$LOG_PREFIX Cleaning up VPN (we started it)..."
        sudo pkill -f openfortivpn 2>/dev/null
        sudo ip route del 10.0.0.0/8 dev ppp0 2>/dev/null
        sudo ip route del 172.16.0.0/12 dev ppp0 2>/dev/null
        sudo ip route del 192.168.0.0/16 dev ppp0 2>/dev/null
        echo "$LOG_PREFIX VPN cleanup done."
    else
        echo "$LOG_PREFIX Skipping VPN cleanup (we didn't start it)."
    fi
    rm -f "$LOCK_FILE"
}
trap cleanup EXIT

# Step 0: Wait for any running oracle sales sync to release the VPN lock (max 10 min)
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
echo "rm-sync-cron $$" > "$LOCK_FILE"

# Step 1: Check if Oracle is already reachable
echo "$LOG_PREFIX Checking Oracle reachability..."
if timeout 5 bash -c 'echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521' 2>/dev/null; then
    echo "$LOG_PREFIX Oracle is reachable (VPN already up or direct network)."
else
    echo "$LOG_PREFIX Oracle NOT reachable. Starting VPN..."
    WE_STARTED_VPN=true

    # Kill any existing VPN first
    sudo pkill -f openfortivpn 2>/dev/null
    sleep 2

    # Start VPN
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

    # Add routes
    sudo ip route add 10.0.0.0/8 dev ppp0 2>/dev/null
    sudo ip route add 172.16.0.0/12 dev ppp0 2>/dev/null
    sudo ip route add 192.168.0.0/16 dev ppp0 2>/dev/null
    sleep 3

    # Verify Oracle reachable through VPN
    if timeout 10 bash -c 'echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521' 2>/dev/null; then
        echo "$LOG_PREFIX Oracle is reachable through VPN!"
    else
        echo "$LOG_PREFIX Oracle NOT reachable through VPN. Aborting."
        exit 1
    fi
fi

# Step 2: Run RM sync
echo "$LOG_PREFIX Running RM sync..."
cd "$APP_DIR"
node "$SYNC_SCRIPT"
SYNC_EXIT=$?

if [ $SYNC_EXIT -eq 0 ]; then
    echo "$LOG_PREFIX RM sync completed successfully!"
else
    echo "$LOG_PREFIX RM sync FAILED with exit code $SYNC_EXIT"
fi

echo "$LOG_PREFIX Finished at $(date)"
echo "============================================================"

exit $SYNC_EXIT
