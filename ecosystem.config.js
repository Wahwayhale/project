module.exports = {
  apps: [{
    name: 'wechat-server',
    script: './server/server.js',
    cwd: __dirname,
    env: { ENV_FILE: '.env.web', NODE_ENV: 'production' },
    instances: 1,          // 集群模式: 'max' 用全部 CPU
    exec_mode: 'fork',     // fork 单进程, cluster 多进程
    max_memory_restart: '512M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    kill_timeout: 5000,
    watch: false,
    max_restarts: 10,
    restart_delay: 1000,
    autorestart: true
  }]
};
