const cron = require('node-cron');

function startDailyRateResetJob({ GlobalSetting, brandLog, timezone = 'America/Caracas', onReset } = {}) {
	if (!GlobalSetting) {
		throw new Error('GlobalSetting es requerido para iniciar el cron de tasas.');
	}

	return cron.schedule(
		'0 0 * * *',
		async () => {
			const resetTimestamp = new Date();

			try {
				await GlobalSetting.updateOne(
					{ key: 'global' },
					{
						$set: {
							'rateControl.isLockedForDay': false,
							'rateControl.lockedDayKey': '',
							'rateControl.lastResetAt': resetTimestamp,
						},
					},
					{ upsert: true }
				);

				brandLog?.info?.('Cron de tasas ejecutado: bloqueo diario reiniciado para una nueva jornada.');

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
	startDailyRateResetJob,
};