/**
 * PM2 Ecosystem Configuration
 * Production process manager configuration for EuProximaX Backend
 */

module.exports = {
  apps: [
    {
      name: 'euproximax-backend',
      script: './server.js',
      instances: 1, // Use 1 for single server, or 'max' for cluster mode
      exec_mode: 'fork', // 'fork' for single instance, 'cluster' for multiple
      watch: false, // Set to true for development
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // Prepend timestamp to logs
      merge_logs: true, // Merge logs from all instances
      autorestart: true, // Auto restart on crash
      max_restarts: 10, // Maximum restarts in 1 minute
      min_uptime: '10s', // Minimum uptime to consider app stable
      restart_delay: 4000, // Delay between restarts (ms)
      // Advanced options
      kill_timeout: 5000, // Time to wait before force kill
      listen_timeout: 10000, // Time to wait for app to start
      shutdown_with_message: true, // Graceful shutdown
      // Log rotation
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Ignore watch patterns
      ignore_watch: [
        'node_modules',
        'logs',
        'uploads',
        '.git',
        '*.log',
      ],
    },
  ],
};

