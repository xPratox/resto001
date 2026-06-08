const { io } = require('socket.io-client');

const SOCKET_URL = process.env.SOCKET_URL || process.env.API_URL || 'http://localhost:5000';
const API_URL = process.env.API_URL || SOCKET_URL;
const USER = process.env.TEST_USER || 'santiago';
const PASS = process.env.TEST_PASS || '1234';

async function login() {
  const res = await fetch(`${API_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: USER, contrasena: PASS }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(data)}`);
  }

  if (!data || !data.token) {
    throw new Error(`No token in login response: ${JSON.stringify(data)}`);
  }

  return data.token;
}

(async () => {
  try {
    console.log('SOCKET_URL=', SOCKET_URL);
    console.log('API_URL=', API_URL);
    const token = await login();
    console.log('Obtained token (length)', token.length);

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('socket connected', socket.id);
      setTimeout(() => {
        const payload = { table: 'Mesa 1', items: [{ name: 'Test Item', price: 1 }], cliente_nombre: 'Prueba desde test' };
        console.log('Emitting NUEVO_PEDIDO ->', payload);
        socket.emit('NUEVO_PEDIDO', payload);
      }, 1000);
    });

    socket.on('connect_error', (err) => {
      console.error('connect_error', err && err.message);
      // do not exit immediately to allow other logs
    });

    socket.on('disconnect', (reason) => {
      console.log('disconnect', reason);
    });

    const events = ['ACTUALIZACION_GLOBAL', 'PEDIDO_GLOBAL', 'new_order', 'PEDIDO_COCINA', 'kitchen_order_upsert', 'orden_actualizada', 'order_updated', 'new_order'];
    events.forEach((ev) => socket.on(ev, (p) => console.log(`EVENT ${ev}:`, JSON.stringify(p).slice(0, 1000))));

    // keep process alive
    setInterval(() => {}, 1000);
  } catch (err) {
    console.error('ERROR', err && err.message);
    process.exit(1);
  }
})();
