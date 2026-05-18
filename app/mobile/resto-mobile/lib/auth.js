// Servicio de autenticación para Expo Go
export const API_URL = "http://192.168.0.14:5000";

export async function login(usuario, clave) {
  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasena: clave }),
    });
    if (!res.ok) throw new Error('Error de login');
    return await res.json();
  } catch (err) {
    throw err;
  }
}
