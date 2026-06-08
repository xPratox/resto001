// Servicio de autenticación para Expo Go
export const API_BASE_URL = typeof globalThis !== 'undefined' && globalThis.API_BASE_URL ? globalThis.API_BASE_URL : (process.env.API_BASE_URL || 'http://127.0.0.1:5000');

export async function login(credentials) {
  // espera un objeto { usuario, contrasena }
  try {
    const res = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => null);
      const err = new Error('Error de login');
      err.status = res.status;
      err.body = text;
      throw err;
    }

    return await res.json();
  } catch (err) {
    throw err;
  }
}
