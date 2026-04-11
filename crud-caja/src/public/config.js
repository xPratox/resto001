const protocol = window.location.protocol || 'http:';
const host = window.location.hostname || 'localhost';
const backendBaseUrl = `${protocol}//${host}:5000`;

window.RESTO_CONFIG = {
  API_BASE_URL: backendBaseUrl,
  SOCKET_URL: backendBaseUrl,
};