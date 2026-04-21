const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'
const browserOrigin = `${browserProtocol}//${browserHost}`
const defaultBackendBaseUrl = `${browserOrigin}:5000`

const runtimeConfig = typeof window !== 'undefined' ? window.RESTO_CONFIG || {} : {}
const hasEnvApiUrl = typeof import.meta.env.VITE_API_URL !== 'undefined'
const hasEnvSocketUrl = typeof import.meta.env.VITE_SOCKET_URL !== 'undefined'

export const API_BASE_URL = hasEnvApiUrl ? import.meta.env.VITE_API_URL : runtimeConfig.API_BASE_URL || defaultBackendBaseUrl
export const SOCKET_URL = hasEnvSocketUrl ? import.meta.env.VITE_SOCKET_URL : runtimeConfig.SOCKET_URL || browserOrigin