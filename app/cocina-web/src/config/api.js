const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'
const browserOrigin = `${browserProtocol}//${browserHost}`
const defaultApiBaseUrl = `${browserOrigin}:5000`
const hasEnvApiUrl = typeof import.meta.env.VITE_API_URL !== 'undefined'
const hasEnvSocketUrl = typeof import.meta.env.VITE_SOCKET_URL !== 'undefined'

export const API_BASE_URL = hasEnvApiUrl ? import.meta.env.VITE_API_URL : defaultApiBaseUrl
export const SOCKET_URL = hasEnvSocketUrl ? import.meta.env.VITE_SOCKET_URL : browserOrigin