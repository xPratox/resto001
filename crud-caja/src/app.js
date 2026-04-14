const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');

const app = express();
const reactBuildPath = path.join(__dirname, '..', 'web', 'dist');
const legacyPublicPath = path.join(__dirname, 'public');
const staticRoot = fs.existsSync(reactBuildPath) ? reactBuildPath : legacyPublicPath;

app.get('/config.js', (req, res) => {
  const browserProtocol = req.protocol || 'http';
  const browserHost = req.hostname || '127.0.0.1';
  const fallbackBaseUrl = `${browserProtocol}://${browserHost}:5000`;
  const apiBaseUrl = process.env.CAJA_PUBLIC_API_URL || process.env.RESTO_PUBLIC_API_URL || fallbackBaseUrl;
  const socketUrl = process.env.CAJA_PUBLIC_SOCKET_URL || process.env.RESTO_PUBLIC_SOCKET_URL || apiBaseUrl;

  res.type('application/javascript');
  res.send([
    'window.RESTO_CONFIG = Object.freeze({',
    `  API_BASE_URL: ${JSON.stringify(apiBaseUrl)},`,
    `  SOCKET_URL: ${JSON.stringify(socketUrl)}`,
    '});',
  ].join('\n'));
});

app.use(cors());
app.use(express.json());
app.use(express.static(staticRoot));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, message: 'API de caja activa' });
});

app.use('/api', routes);

if (fs.existsSync(path.join(reactBuildPath, 'index.html'))) {
  app.get(/^(?!\/api|\/health|\/config\.js).*/, (_req, res) => {
    res.sendFile(path.join(reactBuildPath, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ message: err.message });
  }

  if (err.code === 11000) {
    return res.status(400).json({ message: 'Registro duplicado no permitido' });
  }

  res.status(500).json({ message: 'Error interno del servidor' });
});

module.exports = app;
