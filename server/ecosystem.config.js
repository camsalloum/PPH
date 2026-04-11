module.exports = {
  apps: [
    {
      name: "propackhub-backend",
      script: "index.js",
      cwd: "/home/propackhub/app/server",

      // Run the app as propackhub user (pm2 daemon stays as root)
      uid: "propackhub",
      gid: "propackhub",

      instances: 1,
      exec_mode: "fork",

      env: {
        NODE_ENV: "production",
        NODE_PATH: "/home/propackhub/app/server/node_modules",
        LD_LIBRARY_PATH: "/usr/lib/oracle/21/client64/lib"
      },

      // CRITICAL: Use SIGTERM, not SIGINT (default).
      // PM2 sends SIGINT during lifecycle events (restart/reload/save).
      // Our app's SIGINT handler calls process.exit(0), which PM2
      // interprets as a crash → restart loop.
      // With SIGTERM, PM2 sends SIGTERM for graceful shutdown,
      // and our app only listens for SIGTERM in production.
      kill_signal: "SIGTERM",

      // Give the app 10s to bind the port before pm2 considers it failed
      listen_timeout: 10000,
      // Give the app 5s to shut down gracefully on restart
      kill_timeout: 5000,

      // Wait 2s before restarting after a crash
      restart_delay: 2000,
      // Stop restarting after 10 consecutive failures
      max_restarts: 10,

      // Log files
      out_file: "/home/propackhub/.pm2/logs/propackhub-backend-out.log",
      error_file: "/home/propackhub/.pm2/logs/propackhub-backend-error.log",
      merge_logs: true,

      // Timestamp log lines
      time: true
    }
  ]
};
