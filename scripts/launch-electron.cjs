const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const appRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);

const child = spawn(electronPath, [appRoot, ...args], {
  stdio: 'inherit',
  env
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
