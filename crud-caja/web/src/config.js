const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'
const defaultBackendBaseUrl = `${browserProtocol}//${browserHost}:5000`

const runtimeConfig = typeof window !== 'undefined' ? window.RESTO_CONFIG || {} : {}

export const API_BASE_URL = import.meta.env.VITE_API_URL || runtimeConfig.API_BASE_URL || defaultBackendBaseUrl
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || runtimeConfig.SOCKET_URL || API_BASE_URL