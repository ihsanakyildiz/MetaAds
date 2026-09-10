module.exports = {
  apps: [
    {
      name: "metaads",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3003",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: "3003",
      },
    },
  ],
};
