import Constants from 'expo-constants';

const DEFAULT_API_PORT = '5000';
const DEFAULT_FALLBACK_HOST = '127.0.0.1';

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

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? fallbackApiBaseUrl;
export const SOCKET_URL = API_BASE_URL;