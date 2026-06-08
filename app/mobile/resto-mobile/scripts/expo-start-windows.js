const os = require('os');
const { spawn } = require('child_process');

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && net.internal === false) {
        if (!net.address.startsWith('169.254')) {
          return net.address;
        }
      }
    }
  }
  return null;
}

const ip = getLocalIPv4() || '127.0.0.1';
console.log(`Detected local IP: ${ip}`);

const env = Object.assign({}, process.env, {
  REACT_NATIVE_PACKAGER_HOSTNAME: ip,
});

console.log('Setting REACT_NATIVE_PACKAGER_HOSTNAME and starting Expo...');

const child = spawn('npx', ['expo', 'start', '-c'], {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => {
  process.exit(code);
});
