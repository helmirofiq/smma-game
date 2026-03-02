module.exports = {
  apps: [
    {
      name: 'smma-game',
      script: 'server.js',
      cwd: '/var/www/smma-game',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      autorestart: true,
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
