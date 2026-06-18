import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_PORT = '5000';
const DEFAULT_ADMIN_PORT = '5174';
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

function getManifestExtra(key: string) {
	return (
		(Constants.expoConfig?.extra as Record<string, any> | undefined)?.[key] ||
		(Constants.expoConfig?.extra as Record<string, any> | undefined)?.expoClient?.[key] ||
		(Constants.manifest2?.extra as Record<string, any> | undefined)?.[key] ||
		(Constants.manifest2?.extra as Record<string, any> | undefined)?.expoClient?.[key] ||
		(Constants.manifest?.extra as Record<string, any> | undefined)?.[key] ||
		(Constants.manifest?.extra as Record<string, any> | undefined)?.expoClient?.[key]
	) as string | null;
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

function isLocalhostHost(host: string | null | undefined) {
	return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(String(host).toLowerCase());
}

function replaceAndroidLocalhost(url: string) {
	if (Platform.OS !== 'android') {
		return url;
	}

	const host = extractHost(url);
	if (!isLocalhostHost(host)) {
		return url;
	}

	return url.replace(host as string, '10.0.2.2');
}

function inferExpoHost() {
	const constants = Constants;
	const candidates = [
		constants.expoConfig?.hostUri,
		constants.expoConfig?.extra?.expoClient?.hostUri,
		constants.manifest2?.extra?.expoClient?.hostUri,
		constants.manifest?.hostUri,
		constants.manifest?.debuggerHost,
		constants.expoGoConfig?.debuggerHost,
		constants.manifest?.extra?.expoClient?.hostUri,
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
const useTunnel = parseBooleanFlag(process.env.EXPO_PUBLIC_USE_TUNNEL || getManifestExtra('EXPO_PUBLIC_USE_TUNNEL'));
const explicitApiBaseUrl = normalizeBaseUrl(
	process.env.EXPO_PUBLIC_API_URL || getManifestExtra('EXPO_PUBLIC_API_URL'),
);
const tunnelApiBaseUrl = normalizeBaseUrl(
	process.env.EXPO_PUBLIC_API_URL_TUNNEL || getManifestExtra('EXPO_PUBLIC_API_URL_TUNNEL'),
);
const localApiBaseUrl =
	normalizeBaseUrl(
		process.env.EXPO_PUBLIC_API_URL_LOCAL || getManifestExtra('EXPO_PUBLIC_API_URL_LOCAL'),
	) ?? fallbackApiBaseUrl;

const explicitAdminWebUrl = normalizeBaseUrl(
	process.env.EXPO_PUBLIC_ADMIN_WEB_URL || getManifestExtra('EXPO_PUBLIC_ADMIN_WEB_URL'),
);
const explicitAdminWebHost = process.env.EXPO_PUBLIC_ADMIN_WEB_HOST || getManifestExtra('EXPO_PUBLIC_ADMIN_WEB_HOST');
const explicitAdminWebPort = process.env.EXPO_PUBLIC_ADMIN_WEB_PORT || getManifestExtra('EXPO_PUBLIC_ADMIN_WEB_PORT');

function formatAdminWebUrl(host: string, port: string) {
	const normalizedHost = String(host || '').trim();
	const normalizedPort = String(port || DEFAULT_ADMIN_PORT).trim();

	if (!normalizedHost) {
		return `http://${DEFAULT_FALLBACK_HOST}:${normalizedPort}`;
	}

	if (/^https?:\/\//i.test(normalizedHost)) {
		try {
			const url = new URL(normalizedHost);
			if (!url.port) {
				url.port = normalizedPort;
			}
			return normalizeBaseUrl(url.toString())!;
		} catch {
			return normalizeBaseUrl(normalizedHost)!;
		}
	}

	if (normalizedHost.includes(':')) {
		return normalizeBaseUrl(`http://${normalizedHost}`)!;
	}

	return normalizeBaseUrl(`http://${normalizedHost}:${normalizedPort}`)!;
}

function resolveAdminWebUrl() {
	if (explicitAdminWebUrl) {
		return explicitAdminWebUrl;
	}

	const apiHost = extractHost(explicitApiBaseUrl || localApiBaseUrl);
	const adminHost = explicitAdminWebHost || apiHost || inferredExpoHost || DEFAULT_FALLBACK_HOST;
	const adminPort = explicitAdminWebPort || '5174';

	return formatAdminWebUrl(adminHost, adminPort);
}

function resolveApiBaseUrl() {
	if (explicitApiBaseUrl) {
		return replaceAndroidLocalhost(explicitApiBaseUrl);
	}

	if (isDevelopment && useTunnel && tunnelApiBaseUrl) {
		return tunnelApiBaseUrl;
	}

	let resolvedBaseUrl = localApiBaseUrl;
	return replaceAndroidLocalhost(resolvedBaseUrl);
}

export const API_BASE_URL = resolveApiBaseUrl();
export const SOCKET_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_SOCKET_URL || getManifestExtra('EXPO_PUBLIC_SOCKET_URL')) ?? API_BASE_URL;
export const ADMIN_WEB_URL = resolveAdminWebUrl();
export const API_NETWORK_MODE = isDevelopment && useTunnel && tunnelApiBaseUrl ? 'tunnel' : 'local';