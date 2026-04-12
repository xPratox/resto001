const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'
const defaultApiBaseUrl = `${browserProtocol}//${browserHost}:5000`

export const API_BASE_URL = import.meta.env.VITE_API_URL || defaultApiBaseUrl
export const SOCKET_URL = API_BASE_URL