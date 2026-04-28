const cron = require('node-cron');

function toDateKey(value, timezone) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});

	return formatter.format(value);
}

function safeDate(value) {
	if (!value) {
		return null;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickLatestDate(candidates = []) {
	let latest = null;

	for (const candidate of candidates) {
		const parsed = safeDate(candidate);

		if (!parsed) {
			continue;
		}

		if (!latest || parsed.getTime() > latest.getTime()) {
			latest = parsed;
		}
	}

	return latest;
}

async function resetDailyRates({ GlobalSetting, baseBcvRate, baseCopRate, timestamp }) {
	await GlobalSetting.updateMany(
		{},
		{
			$set: {
				'manualRates.bcv.value': baseBcvRate,
				'manualRates.bcv.updatedAt': timestamp,
				'manualRates.bcv.updatedBy': 'system-cron',
				'manualRates.cop.value': baseCopRate,
				'manualRates.cop.updatedAt': timestamp,
				'manualRates.cop.updatedBy': 'system-cron',
				'rateControl.isLockedForDay': false,
				'rateControl.lockedDayKey': '',
				'rateControl.lastResetAt': timestamp,
			},
		}
	);
}

async function ensureRateResetOnStartup({
	GlobalSetting,
	brandLog,
	timezone = 'America/Caracas',
	baseBcvRate = 0,
	baseCopRate = 0,
	onReset,
} = {}) {
	if (!GlobalSetting) {
		throw new Error('GlobalSetting es requerido para verificar el reseteo de tasas al iniciar.');
	}

	const now = new Date();
	const todayKey = toDateKey(now, timezone);
	const settings = await GlobalSetting.findOne({ key: 'global' }).lean();

	const latestRateUpdateAt = pickLatestDate([
		settings?.manualRates?.bcv?.updatedAt,
		settings?.manualRates?.cop?.updatedAt,
		settings?.rateHistory?.[0]?.updatedAt,
	]);

	if (latestRateUpdateAt && toDateKey(latestRateUpdateAt, timezone) === todayKey) {
		return false;
	}

	await resetDailyRates({
		GlobalSetting,
		baseBcvRate,
		baseCopRate,
		timestamp: now,
	});

	brandLog?.info?.('[AutoReset] Tasas reiniciadas al iniciar porque la ultima actualizacion no era del dia actual.');

	if (typeof onReset === 'function') {
		await onReset(now);
	}

	return true;
}

function startDailyRateResetJob({
	GlobalSetting,
	brandLog,
	timezone = 'America/Caracas',
	baseBcvRate = 0,
	baseCopRate = 0,
	onReset,
} = {}) {
	if (!GlobalSetting) {
		throw new Error('GlobalSetting es requerido para iniciar el cron de tasas.');
	}

	return cron.schedule(
		'0 0 * * *',
		async () => {
			const resetTimestamp = new Date();

			try {
				await resetDailyRates({
					GlobalSetting,
					baseBcvRate,
					baseCopRate,
					timestamp: resetTimestamp,
				});

				brandLog?.info?.('Cron de tasas ejecutado: tasas y bloqueo diario reiniciados para una nueva jornada.');

				if (typeof onReset === 'function') {
					await onReset(resetTimestamp);
				}
			} catch (error) {
				brandLog?.error?.(`Fallo el cron de reseteo de tasas: ${error.message}`);
			}
		},
		{
			timezone,
		}
	);
}

module.exports = {
	ensureRateResetOnStartup,
	startDailyRateResetJob,
};