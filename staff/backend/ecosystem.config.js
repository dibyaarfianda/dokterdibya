/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js             # start all apps
 *   pm2 start ecosystem.config.js --only web   # start web workers only
 *   pm2 reload ecosystem.config.js             # zero-downtime reload
 *
 * Cluster mode:
 *   The 'web' app runs in cluster mode with PM2 acting as load balancer.
 *   Set instances to 'max' for all CPUs, or a fixed number for cost control.
 *
 * Socket.IO compatibility:
 *   When running multiple workers, Socket.IO requires sticky sessions.
 *   Nginx upstream must use `ip_hash` to route the same client to the same worker.
 *   See nginx snippet below.
 *
 * Nginx upstream snippet (paste into nginx config):
 *
 *   upstream backend_cluster {
 *       ip_hash;
 *       server 127.0.0.1:3000;
 *       server 127.0.0.1:3001;
 *       # Add more ports if instances > 2
 *   }
 *
 *   NOTE: For single-VPS deployments, PM2 cluster mode with `instance_var`
 *   and `listen_timeout` is simpler than manual port allocation. PM2 handles
 *   port sharing internally via Node's cluster module.
 */

module.exports = {
    apps: [
        {
            name: 'dibyaklinik-backend',
            script: 'server.js',
            cwd: __dirname,

            // --- Cluster mode ---
            // 'fork' = current single-process mode (safe default)
            // 'cluster' = PM2 cluster via Node's cluster module (shared port)
            exec_mode: process.env.PM2_EXEC_MODE || 'fork',

            // Number of worker instances
            // 1 = single process (current behavior, safe default)
            // 2 = recommended starting point for cluster mode
            // 'max' = one worker per CPU core
            instances: parseInt(process.env.PM2_INSTANCES, 10) || 1,

            // Increase V8 heap headroom to reduce GC pressure during burst traffic.
            node_args: process.env.PM2_NODE_ARGS || '--max-old-space-size=512',

            // --- Restart policy ---
            max_restarts: 20,
            min_uptime: '30s',
            restart_delay: 5000,
            exp_backoff_restart_delay: 100,
            autorestart: true,

            // --- Zero-downtime reload ---
            wait_ready: true,          // wait for process.send('ready')
            listen_timeout: 10000,     // max wait time for 'ready' signal (ms)
            kill_timeout: 5000,        // grace period before SIGKILL

            // --- Memory guard ---
            max_memory_restart: process.env.PM2_MAX_MEMORY || '768M',

            // --- Logging ---
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            merge_logs: true,
            log_type: 'json',

            // --- Environment ---
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            env_development: {
                NODE_ENV: 'development',
                PORT: 3000,
            },

            // --- Watch (development only) ---
            watch: false,
            ignore_watch: ['node_modules', 'logs', '*.log', '.git'],
        },
    ],
};
