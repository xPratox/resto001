import Constants from 'expo-constants';

const DEFAULT_API_PORT = '5000';
const DEFAULT_FALLBACK_HOST = '127.0.0.1';
const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

function parseBooleanFlag(value: string | null | undefined) {
	if (!value) {
		return false;
	}

	return ['1', 'true', 'yes', 'on', 'tunnel'].includes(String(value).trim().toLowerCase());
}

function normalizeBaseUrl(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const normalizedValue = String(value).trim();

	if (!normalizedValue) {
		return null;
	}

	if (normalizedValue.startsWith('/')) {
		return normalizedValue.replace(/\/+$/, '') || '/';
	}

	const withProtocol = /^https?:\/\//i.test(normalizedValue)
		? normalizedValue
		: `http://${normalizedValue}`;

	return withProtocol.replace(/\/+$/, '');
}

function extractHost(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const normalizedValue = String(value).trim();

	if (!normalizedValue) {
		return null;
	}

	const withoutProtocol = normalizedValue.replace(/^https?:\/\//i, '');
	const withoutPath = withoutProtocol.split('/')[0];
	const host = withoutPath.split(':')[0]?.trim();

	return host || null;
}

function inferExpoHost() {
	const constants = Constants;
	const candidates = [
		constants.expoConfig?.hostUri,
		constants.expoGoConfig?.debuggerHost,
		constants.manifest2?.extra?.expoClient?.hostUri,
		constants.manifest?.debuggerHost,
	];

	for (const candidate of candidates) {
		const host = extractHost(candidate);

		if (host) {
			return host;
		}
	}

	return null;
}

const inferredExpoHost = inferExpoHost();
const fallbackApiBaseUrl = `http://${inferredExpoHost ?? DEFAULT_FALLBACK_HOST}:${DEFAULT_API_PORT}`;
const useTunnel = parseBooleanFlag(process.env.EXPO_PUBLIC_USE_TUNNEL);
const explicitApiBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL);
const tunnelApiBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL_TUNNEL);
const localApiBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL_LOCAL) ?? fallbackApiBaseUrl;

function resolveApiBaseUrl() {
	if (explicitApiBaseUrl) {
		return explicitApiBaseUrl;
	}

	if (isDevelopment && useTunnel && tunnelApiBaseUrl) {
		return tunnelApiBaseUrl;
	}

	return localApiBaseUrl;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const SOCKET_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_SOCKET_URL) ?? API_BASE_URL;
export const API_NETWORK_MODE = isDevelopment && useTunnel && tunnelApiBaseUrl ? 'tunnel' : 'local';