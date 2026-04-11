const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { execFile } = require('child_process');
const { promisify } = require('util');

const app = require('./app');
const connectDB = require('./config/db');

const execFileAsync = promisify(execFile);
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 4000;
const AUTO_RECOVER_PORT = process.env.AUTO_RECOVER_PORT !== 'false';
const PORT_RECOVERY_WAIT_MS = 250;
const PORT_RECOVERY_MAX_ATTEMPTS = 12;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function findListeningPids(port) {
  if (process.platform === 'win32') {
    return [];
  }

  try {
    const { stdout } = await execFileAsync('lsof', [
      '-nP',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-t',
    ]);

    return [...new Set(
      stdout
        .split('\n')
        .map((value) => Number(value.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
    )];
  } catch (error) {
    if (error.code === 1 || error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function waitForPortToBeReleased(port) {
  for (let attempt = 0; attempt < PORT_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
    const pids = await findListeningPids(port);

    if (pids.length === 0) {
      return true;
    }

    await wait(PORT_RECOVERY_WAIT_MS);
  }

  return false;
}

async function releaseOccupiedPort(port) {
  const pids = await findListeningPids(port);

  if (pids.length === 0) {
    return false;
  }

  console.warn(`Puerto ${port} ocupado por PID ${pids.join(', ')}. Intentando liberar la instancia anterior...`);

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  if (await waitForPortToBeReleased(port)) {
    return true;
  }

  const remainingPids = await findListeningPids(port);

  for (const pid of remainingPids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  return waitForPortToBeReleased(port);
}

function listenOnConfiguredPort() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      server.off('error', onError);
      resolve(server);
    });

    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };

    server.once('error', onError);
  });
}

async function startServer() {
  try {
    await connectDB();

    try {
      await listenOnConfiguredPort();
    } catch (error) {
      if (error.code === 'EADDRINUSE' && AUTO_RECOVER_PORT) {
        const released = await releaseOccupiedPort(PORT);

        if (released) {
          await listenOnConfiguredPort();
        } else {
          throw new Error(
            `El puerto ${PORT} sigue ocupado y no se pudo recuperar automaticamente. Puedes desactivar la recuperacion con AUTO_RECOVER_PORT=false.`
          );
        }
      } else {
        throw error;
      }
    }

    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  } catch (error) {
    console.error('Error iniciando servidor:', error.message);
    process.exit(1);
  }
}

startServer();
