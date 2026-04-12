require('dotenv').config();

const { execFile } = require('child_process');
const http = require('http');
const chalkModule = require('chalk');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { promisify } = require('util');

const chalk = chalkModule.default || chalkModule;

const execFileAsync = promisify(execFile);

const app = express();
const server = http.createServer(app);

const corsOptions = {
	origin: true,
	methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'x-resto-module'],
};

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resto001';
const HISTORY_TIMEZONE = process.env.HISTORY_TIMEZONE || 'America/Caracas';
const EXCHANGE_RATE_TIMEZONE = process.env.EXCHANGE_RATE_TIMEZONE || HISTORY_TIMEZONE;
const AUTO_RECOVER_PORT = process.env.AUTO_RECOVER_PORT !== 'false';
const PORT_RECOVERY_WAIT_MS = 250;
const PORT_RECOVERY_MAX_ATTEMPTS = 12;
const TABLE_DEFINITIONS = [
	{ table: 'Mesa 1', section: 'Sala', capacity: 4, highlighted: false },
	{ table: 'Mesa 2', section: 'Sala', capacity: 4, highlighted: false },
	{ table: 'Mesa 3', section: 'Sala', capacity: 4, highlighted: false },
	{ table: 'Mesa 4', section: 'Sala', capacity: 4, highlighted: false },
	{ table: 'Mesa 5', section: 'Sala', capacity: 4, highlighted: false },
	{ table: 'Mesa 6', section: 'Sala', capacity: 4, highlighted: false },
	{ table: 'Mesa 7', section: 'Sala', capacity: 8, highlighted: true },
	{ table: 'Mesa 8', section: 'Terraza', capacity: 4, highlighted: false },
	{ table: 'Mesa 9', section: 'Terraza', capacity: 4, highlighted: false },
	{ table: 'Mesa 10', section: 'Terraza', capacity: 4, highlighted: false },
	{ table: 'Mesa 11', section: 'Terraza', capacity: 4, highlighted: false },
];
const TABLES = TABLE_DEFINITIONS.map((table) => table.table);
const ORDER_STATUS = {
	AVAILABLE: 'disponible',
	PENDING: 'pendiente',
	KITCHEN: 'en cocina',
	CLEANING: 'limpieza',
	PAID: 'pagado',
};

const brandLog = {
	info: (message) => console.log(chalk.hex('#F8FAFC').bgHex('#0F172A')(` ${message} `)),
	warn: (message) => console.warn(chalk.hex('#FF6B35')(`▲ ${message}`)),
	error: (message) => console.error(chalk.hex('#EF4444')(`■ ${message}`)),
	success: (message) => console.log(chalk.hex('#10B981')(`● ${message}`)),
};

function getTableDefinition(tableName) {
	return TABLE_DEFINITIONS.find((table) => table.table === tableName) || null;
}

function hasRegisteredPayment(order) {
	return Boolean(order?.hora_pago);
}

function isOrderInCleaning(order) {
	if (!order || order.mesa_liberada === true) {
		return false;
	}

	return order.status === ORDER_STATUS.CLEANING || (order.status === ORDER_STATUS.PAID && hasRegisteredPayment(order));
}

function isOrderLocked(order) {
	return Boolean(order) && (order.status === ORDER_STATUS.CLEANING || order.status === ORDER_STATUS.PAID || hasRegisteredPayment(order));
}

function getVisibleTableStatus(order) {
	if (!order || order.mesa_liberada === true) {
		return ORDER_STATUS.AVAILABLE;
	}

	if (isOrderInCleaning(order)) {
		return ORDER_STATUS.CLEANING;
	}

	return order.status || ORDER_STATUS.PENDING;
}

function buildActiveOrdersFilter(extra = {}) {
	return {
		...extra,
		$or: [
			{ status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.KITCHEN, ORDER_STATUS.CLEANING] } },
			{ status: ORDER_STATUS.PAID, mesa_liberada: { $ne: true } },
			{ hora_pago: { $ne: null }, mesa_liberada: { $ne: true } },
		],
	};
}

async function repairReleasedPaidOrdersForTable(table) {
	const stalePaidOrders = await Order.find({
		table,
		mesa_liberada: true,
		$or: [
			{ status: { $ne: ORDER_STATUS.PAID } },
			{ hora_pago: null },
		],
	}).sort({ createdAt: -1 });

	if (stalePaidOrders.length === 0) {
		return 0;
	}

	const staleIds = stalePaidOrders.map((order) => order._id);
	const result = await Order.updateMany(
		{
			_id: { $in: staleIds },
		},
		{
			$set: {
				status: ORDER_STATUS.PAID,
				hora_pago: new Date(),
			},
		}
	);

	return result.modifiedCount ?? staleIds.length;
}

function emitOrderRealtime(action, order) {
	if (!order) {
		return;
	}

	const payload = {
		action,
		orderId: String(order._id),
		table: order.table,
		status: order.status,
		tableStatus: getVisibleTableStatus(order),
		seccion: order.seccion || getTableDefinition(order.table)?.section || 'Sala',
		cliente_nombre: order.cliente_nombre || '',
		order,
	};

	io.emit('orden_actualizada', payload);

	if (action === 'created') {
		io.emit('mesa_ocupada', payload);
		io.emit('new_order', order);
		return;
	}

	if (action === 'paid') {
		io.emit('mesa_en_limpieza', payload);
		io.emit('mesa_actualizada', payload);
	}

	if (action === 'deleted') {
		io.emit('order_deleted', payload);
		return;
	}

	if (action === 'table_released') {
		io.emit('mesa_actualizada', payload);
		io.emit('mesa_liberada', payload);
	}

	io.emit('order_updated', order);
}

const menuItems = [
	{ id: 'nestea', name: 'Nestea', price: 2.5, category: 'Bebidas' },
	{ id: 'pepsi', name: 'Pepsi', price: 2.0, category: 'Bebidas' },
	{ id: 'agua-mineral', name: 'Agua Mineral', price: 1.5, category: 'Bebidas' },
	{ id: 'hamburguesa-clasica', name: 'Hamburguesa Clasica', price: 7.5, category: 'Platos' },
	{ id: 'perro-caliente', name: 'Perro Caliente', price: 5.5, category: 'Platos' },
	{ id: 'club-house', name: 'Club House', price: 8.25, category: 'Platos' },
	{ id: 'pizza-margarita', name: 'Pizza Margarita', price: 9.0, category: 'Platos' },
];

function wait(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function findListeningPids(port) {
	if (process.platform === 'win32') {
		try {
			const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp']);

			return [...new Set(
				stdout
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.includes(`:${port}`) && /(LISTENING|ESCUCHANDO)/i.test(line))
					.map((line) => line.split(/\s+/).pop())
					.map((value) => Number(value))
					.filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
			)];
		} catch (error) {
			if (error.code === 1 || error.code === 'ENOENT') {
				return [];
			}

			throw error;
		}
	}

	try {
		const { stdout } = await execFileAsync('lsof', [
			'-nP',
			`-iTCP:${port}`,
			'-sTCP:LISTEN',
			'-t',
		]);

		return [...new Set(
			stdout
				.split('\n')
				.map((value) => Number(value.trim()))
				.filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
		)];
	} catch (error) {
		if (error.code === 1 || error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}
}

async function waitForPortToBeReleased(port) {
	for (let attempt = 0; attempt < PORT_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
		const pids = await findListeningPids(port);

		if (pids.length === 0) {
			return true;
		}

		await wait(PORT_RECOVERY_WAIT_MS);
	}

	return false;
}

async function releaseOccupiedPort(port) {
	const pids = await findListeningPids(port);

	if (pids.length === 0) {
		return false;
	}

	brandLog.warn(`Puerto ${port} ocupado por PID ${pids.join(', ')}. Intentando liberar la instancia anterior...`);

	for (const pid of pids) {
		try {
			process.kill(pid, 'SIGTERM');
		} catch (error) {
			if (error.code !== 'ESRCH') {
				throw error;
			}
		}
	}

	if (await waitForPortToBeReleased(port)) {
		return true;
	}

	const remainingPids = await findListeningPids(port);

	for (const pid of remainingPids) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch (error) {
			if (error.code !== 'ESRCH') {
				throw error;
			}
		}
	}

	return waitForPortToBeReleased(port);
}

function listenOnConfiguredPort() {
	return new Promise((resolve, reject) => {
		const onError = (error) => {
			server.off('error', onError);
			reject(error);
		};

		server.once('error', onError);
		server.listen(PORT, HOST, () => {
			server.off('error', onError);
			resolve();
		});
	});
}

async function disconnectMongo() {
	if (mongoose.connection.readyState !== 0) {
		await mongoose.disconnect();
	}
}

function computeOrderTotal(items) {
	return items.reduce((sum, item) => sum + Number(item.price || 0), 0);
}

function roundCurrency(value) {
	return Number(Number(value || 0).toFixed(2));
}

function parseCurrency(value) {
	const parsed = parseFloat(value);
	return Number.isFinite(parsed) ? roundCurrency(parsed) : NaN;
}

function normalizeOrderItem(item) {
	const normalizedNote =
		(typeof item.note === 'string' && item.note.trim()) ||
		(typeof item.notas === 'string' && item.notas.trim()) ||
		(typeof item.observaciones === 'string' && item.observaciones.trim()) ||
		'Sin notas';

	return {
		_id:
			item._id && mongoose.Types.ObjectId.isValid(item._id)
				? item._id
				: new mongoose.Types.ObjectId(),
		name: item.name,
		price: Number(item.price || 0),
		note: normalizedNote,
		notas: normalizedNote,
	};
}

function hasRemovedItems(currentItems, nextItems) {
	const nextItemIds = new Set(
		nextItems
			.filter((item) => item._id)
			.map((item) => String(item._id))
	);

	return currentItems.some((item) => !nextItemIds.has(String(item._id)));
}

async function consolidatePendingOrderForTable(table) {
	const pendingOrders = await Order.find({
		table,
		status: 'pendiente',
	}).sort({ createdAt: 1 });

	if (pendingOrders.length === 0) {
		return null;
	}

	if (pendingOrders.length === 1) {
		return pendingOrders[0];
	}

	const primaryOrder = pendingOrders[0];
	const mergedItems = pendingOrders.flatMap((order) =>
		order.items.map((item) =>
			normalizeOrderItem(typeof item.toObject === 'function' ? item.toObject() : item)
		)
	);
	const mergedTotal = computeOrderTotal(mergedItems);
	const mergedMontoPagado = pendingOrders.reduce((sum, order) => sum + Number(order.montoPagado || 0), 0);
	const mergedHistorialPagos = pendingOrders.flatMap((order) =>
		(order.historialPagos || []).map((payment) =>
			typeof payment?.toObject === 'function' ? payment.toObject() : payment
		)
	);
	const duplicateIds = pendingOrders.slice(1).map((order) => order._id);

	const updatedPrimaryOrder = await Order.findOneAndUpdate(
		{ _id: primaryOrder._id },
		{
			$set: {
				items: mergedItems,
				total: mergedTotal,
				montoPagado: mergedMontoPagado,
				historialPagos: mergedHistorialPagos,
			},
		},
		{
			returnDocument: 'after',
			runValidators: true,
		}
	);

	await Order.deleteMany({
		_id: { $in: duplicateIds },
	});

	return updatedPrimaryOrder;
}

const orderSchema = new mongoose.Schema(
	{
		table: { type: String, required: true, trim: true },
		cliente_nombre: { type: String, default: '', trim: true },
		seccion: { type: String, enum: ['Sala', 'Terraza'], required: true, default: 'Sala', trim: true },
		items: [
			{
				name: { type: String, required: true, trim: true },
				price: { type: Number, required: true, min: 0 },
				note: { type: String, default: 'Sin notas', trim: true },
				notas: { type: String, default: 'Sin notas', trim: true },
			},
		],
		total: { type: Number, required: true, min: 0 },
		montoPagado: { type: Number, default: 0, min: 0 },
		historialPagos: [
			{
				monto: { type: Number, required: true, min: 0 },
				metodo: { type: String, required: true, trim: true },
				fecha: { type: Date, required: true, default: Date.now },
			},
		],
		status: { type: String, default: ORDER_STATUS.PENDING, trim: true },
		hora_pago: { type: Date, default: null },
		mesa_liberada: { type: Boolean, default: false },
	},
	{
		timestamps: true,
	}
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

const exchangeRateSchema = new mongoose.Schema(
	{
		dayKey: { type: String, required: true, index: true, trim: true },
		rate: { type: Number, required: true, min: 0.0001 },
		assignedBy: { type: String, default: 'caja', trim: true },
		assignedAt: { type: Date, default: Date.now },
	},
	{
		timestamps: true,
	}
);

const pesoRateSchema = new mongoose.Schema(
	{
		dayKey: { type: String, required: true, unique: true, index: true, trim: true },
		rate: { type: Number, required: true, min: 0.0001 },
		assignedBy: { type: String, default: 'caja', trim: true },
		assignedAt: { type: Date, default: Date.now },
	},
	{
		timestamps: true,
	}
);

const DailyExchangeRate = mongoose.models.DailyExchangeRate || mongoose.model('DailyExchangeRate', exchangeRateSchema);
const DailyPesoRate = mongoose.models.DailyPesoRate || mongoose.model('DailyPesoRate', pesoRateSchema);

function normalizeRateType(value) {
	const normalized = String(value || 'bcv').trim().toLowerCase();
	return normalized === 'pesos' ? 'pesos' : 'bcv';
}

function getRateModelByType(rateType) {
	if (rateType === 'pesos') {
		return {
			model: DailyPesoRate,
			label: 'Pesos',
		};
	}

	return {
		model: DailyExchangeRate,
		label: 'BCV',
	};
}

function getHistoryDateKey(date, timezone = HISTORY_TIMEZONE) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});

	const parts = formatter.formatToParts(date);
	const year = parts.find((part) => part.type === 'year')?.value;
	const month = parts.find((part) => part.type === 'month')?.value;
	const day = parts.find((part) => part.type === 'day')?.value;

	return `${year}-${month}-${day}`;
}

function buildPaidOrdersHistoryPipeline() {
	return [
		{
			$match: {
				historialPagos: { $exists: true, $ne: [] },
			},
		},
		{
			$unwind: '$historialPagos',
		},
		{
			$addFields: {
				reportDateSource: {
					$ifNull: ['$historialPagos.fecha', '$updatedAt'],
				},
			},
		},
		{
			$sort: {
				reportDateSource: -1,
				_id: -1,
			},
		},
		{
			$facet: {
				summaryByDay: [
					{
						$group: {
							_id: {
								$dateToString: {
									format: '%Y-%m-%d',
									date: '$reportDateSource',
									timezone: HISTORY_TIMEZONE,
								},
							},
							transactionsCount: {
								$sum: 1,
							},
							totalRevenue: {
								$sum: '$historialPagos.monto',
							},
							latestPaidAt: {
								$max: '$reportDateSource',
							},
						},
					},
					{
						$sort: {
							latestPaidAt: -1,
						},
					},
					{
						$project: {
							_id: 0,
							reportDate: '$_id',
							transactionsCount: 1,
							totalRevenue: {
								$round: ['$totalRevenue', 2],
							},
						},
					},
				],
				transactions: [
					{
						$project: {
							transactionId: '$historialPagos._id',
							_id: 1,
							table: 1,
							cliente_nombre: 1,
							status: 1,
							hora_pago: '$reportDateSource',
							paymentMethod: '$historialPagos.metodo',
							paymentAmount: {
								$round: [{ $toDouble: '$historialPagos.monto' }, 2],
							},
							montoPagado: {
								$round: [{ $toDouble: '$montoPagado' }, 2],
							},
							remainingAmount: {
								$round: [{ $subtract: ['$total', '$montoPagado'] }, 2],
							},
							reportDate: {
								$dateToString: {
									format: '%Y-%m-%d',
									date: '$reportDateSource',
									timezone: HISTORY_TIMEZONE,
								},
							},
							total: {
								$round: ['$total', 2],
							},
							items: {
								$map: {
									input: '$items',
									as: 'item',
									in: {
										name: '$$item.name',
										price: {
											$round: [{ $toDouble: '$$item.price' }, 2],
										},
										note: {
											$ifNull: ['$$item.note', { $ifNull: ['$$item.notas', 'Sin notas'] }],
										},
									},
								},
							},
						},
					},
				],
			},
		},
	];
}

const io = new Server(server, {
	cors: {
		origin: true,
		methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
	},
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

io.on('connection', (socket) => {
	brandLog.info(`Cliente conectado por socket: ${socket.id}`);

	socket.on('disconnect', () => {
		brandLog.info(`Cliente desconectado: ${socket.id}`);
	});
});

app.get('/', (req, res) => {
	res.json({
		message: 'Servidor resto001 activo',
		database: 'resto001',
	});
});

app.get('/api/health', (req, res) => {
	res.json({
		ok: true,
		mongoState: mongoose.connection.readyState,
	});
});

app.get('/api/menu', (req, res) => {
	res.json({
		ok: true,
		items: menuItems,
	});
});

app.get('/api/exchange-rate/today', async (_req, res) => {
	try {
		const rateType = normalizeRateType(_req.query?.type);
		const { model } = getRateModelByType(rateType);
		const dayKey = getHistoryDateKey(new Date(), EXCHANGE_RATE_TIMEZONE);
		const dailyRate = await model.findOne({ dayKey }).lean();

		return res.json({
			ok: true,
			rateType,
			timezone: EXCHANGE_RATE_TIMEZONE,
			dayKey,
			rate: dailyRate?.rate ?? null,
			isAssigned: Boolean(dailyRate),
			canEdit: !dailyRate,
			assignedAt: dailyRate?.assignedAt ?? null,
			assignedBy: dailyRate?.assignedBy ?? null,
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo consultar la tasa del dia.',
			error: error.message,
		});
	}
});

app.put('/api/exchange-rate/today', async (req, res) => {
	const moduleName = String(req.headers['x-resto-module'] || '').trim().toLowerCase();
	const parsedRate = parseCurrency(req.body?.rate);
	const rateType = normalizeRateType(req.query?.type || req.body?.type);
	const { model, label } = getRateModelByType(rateType);

	if (moduleName !== 'caja') {
		return res.status(403).json({
			ok: false,
			message: `Solo caja puede asignar la tasa ${label} diaria.`,
		});
	}

	if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
		return res.status(400).json({
			ok: false,
			message: `Debes enviar una tasa ${label} valida mayor a cero.`,
		});
	}

	try {
		const dayKey = getHistoryDateKey(new Date(), EXCHANGE_RATE_TIMEZONE);
		const existingRate = await model.findOne({ dayKey });

		if (existingRate) {
			return res.status(409).json({
				ok: false,
				message: `La tasa ${label} del dia ya fue asignada y queda bloqueada hasta el siguiente dia.`,
				rateType,
				rate: existingRate.rate,
				dayKey,
				timezone: EXCHANGE_RATE_TIMEZONE,
			});
		}

		const createdRate = await model.create({
			dayKey,
			rate: parsedRate,
			assignedBy: 'caja',
			assignedAt: new Date(),
		});

		io.emit('tasa_actualizada', {
			rateType,
			dayKey,
			rate: createdRate.rate,
			timezone: EXCHANGE_RATE_TIMEZONE,
			assignedAt: createdRate.assignedAt,
		});

		return res.status(201).json({
			ok: true,
			message: `Tasa ${label} diaria registrada correctamente.`,
			rateType,
			dayKey,
			rate: createdRate.rate,
			timezone: EXCHANGE_RATE_TIMEZONE,
			assignedAt: createdRate.assignedAt,
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: `No se pudo registrar la tasa ${label} diaria.`,
			error: error.message,
		});
	}
});

app.get('/api/tables/status', async (req, res) => {
	try {
		await Promise.all(
			TABLES.map(async (table) => {
				await repairReleasedPaidOrdersForTable(table);
				await consolidatePendingOrderForTable(table);
			})
		);

		const activeOrders = await Order.find(
			buildActiveOrdersFilter({
				table: { $in: TABLES },
			})
		).sort({ createdAt: -1 });

		const orderByTable = new Map();

		activeOrders.forEach((order) => {
			if (!orderByTable.has(order.table)) {
				orderByTable.set(order.table, order);
			}
		});

		const tables = TABLES.map((table) => {
			const tableDefinition = getTableDefinition(table);
			const activeOrder = orderByTable.get(table);

			return {
				table,
				seccion: tableDefinition?.section || 'Sala',
				capacity: tableDefinition?.capacity || 4,
				highlighted: Boolean(tableDefinition?.highlighted),
				cliente_nombre: activeOrder?.cliente_nombre || '',
				occupied: Boolean(activeOrder),
				orderId: activeOrder?._id || null,
				status: getVisibleTableStatus(activeOrder),
			};
		});

		return res.json({
			ok: true,
			tables,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: 'No se pudieron consultar los estados de mesa.',
			error: error.message,
		});
	}
});

app.get('/api/orders/history', async (_req, res) => {
	try {
		const [history] = await Order.aggregate(buildPaidOrdersHistoryPipeline());
		const summaryByDay = history?.summaryByDay || [];
		const transactions = history?.transactions || [];
		const todayKey = getHistoryDateKey(new Date());
		const daySummary =
			summaryByDay.find((summary) => summary.reportDate === todayKey) || {
				reportDate: todayKey,
				transactionsCount: 0,
				totalRevenue: 0,
			};

		return res.json({
			ok: true,
			timezone: HISTORY_TIMEZONE,
			totalTransactions: transactions.length,
			daySummary,
			summaryByDay,
			transactions,
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo generar el historial de ventas.',
			error: error.message,
		});
	}
});

app.get('/api/orders/:id', async (req, res) => {
	try {
		const order = await Order.findById(req.params.id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		return res.json({
			ok: true,
			order,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: 'No se pudo consultar la orden.',
			error: error.message,
		});
	}
});

app.get('/api/orders/active/table/:table', async (req, res) => {
	try {
		await repairReleasedPaidOrdersForTable(req.params.table);

		const consolidatedPendingOrder = await consolidatePendingOrderForTable(req.params.table);

		const order =
			consolidatedPendingOrder ||
			(await Order.findOne(
				buildActiveOrdersFilter({
					table: req.params.table,
				})
			).sort({ createdAt: -1 }));

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'No existe una orden activa para esa mesa.',
			});
		}

		return res.json({
			ok: true,
			order,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: 'No se pudo consultar la orden activa.',
			error: error.message,
		});
	}
});

app.post('/api/orders', async (req, res) => {
	const { table, tableId, items, cliente_nombre, seccion } = req.body ?? {};
	const normalizedTable = typeof tableId === 'string' && tableId.trim()
		? tableId.trim()
		: typeof table === 'string'
			? table.trim()
			: '';

	if (!normalizedTable || !Array.isArray(items) || items.length === 0) {
		return res.status(400).json({
			ok: false,
			message: 'La mesa y los items son obligatorios.',
		});
	}

	try {
		const tableDefinition = getTableDefinition(normalizedTable);

		if (!tableDefinition) {
			return res.status(400).json({
				ok: false,
				message: 'La mesa seleccionada no existe.',
			});
		}

		const normalizedClientName = typeof cliente_nombre === 'string' ? cliente_nombre.trim() : '';
		const normalizedSection = tableDefinition.section || seccion || 'Sala';
		const normalizedItems = items.map(normalizeOrderItem);
		const itemsTotal = computeOrderTotal(normalizedItems);

		await repairReleasedPaidOrdersForTable(normalizedTable);

		const pendingOrder = await consolidatePendingOrderForTable(normalizedTable);

		if (pendingOrder) {
			const updatedOrder = await Order.findOneAndUpdate(
				{
					_id: pendingOrder._id,
				},
				{
					$push: {
						items: {
							$each: normalizedItems,
						},
					},
					...(normalizedClientName
						? {
							$set: {
								cliente_nombre: pendingOrder.cliente_nombre || normalizedClientName,
								seccion: normalizedSection,
								status: ORDER_STATUS.PENDING,
								hora_pago: null,
								mesa_liberada: false,
							},
						}
						: {
							$set: {
								seccion: normalizedSection,
								status: ORDER_STATUS.PENDING,
								hora_pago: null,
								mesa_liberada: false,
							},
						}),
					$inc: {
						total: itemsTotal,
					},
				},
				{
					returnDocument: 'after',
					runValidators: true,
				}
			);

			emitOrderRealtime('merged', updatedOrder);

			return res.status(200).json({
				ok: true,
				message: 'Pedido unificado en la orden pendiente de la mesa.',
				order: updatedOrder,
			});
		}

		const existingActiveOrder = await Order.findOne(
			buildActiveOrdersFilter({
				table: normalizedTable,
			})
		).sort({ createdAt: -1 });

		if (existingActiveOrder) {
			return res.status(400).json({
				ok: false,
				message: 'La mesa ya tiene un pedido activo',
				order: existingActiveOrder,
			});
		}

		const order = await Order.create({
			table: normalizedTable,
			cliente_nombre: normalizedClientName,
			seccion: normalizedSection,
			items: normalizedItems,
			total: itemsTotal,
			montoPagado: 0,
			historialPagos: [],
			status: ORDER_STATUS.PENDING,
			hora_pago: null,
			mesa_liberada: false,
		});

		emitOrderRealtime('created', order);

		return res.status(201).json({
			ok: true,
			message: 'Pedido enviado a Cocina',
			order,
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo registrar el pedido.',
			error: error.message,
		});
	}
});

app.patch('/api/orders/:id/modify', async (req, res) => {
	const { id } = req.params;
	const { action, item } = req.body;

	if (!['add', 'remove'].includes(action)) {
		return res.status(400).json({
			ok: false,
			message: 'La accion debe ser add o remove.',
		});
	}

	if (!item || typeof item !== 'object') {
		return res.status(400).json({
			ok: false,
			message: 'Debes enviar el item afectado.',
		});
	}

	try {
		let order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (action === 'add') {
			if (isOrderLocked(order)) {
				throw new Error('No se pueden agregar items a una orden pagada.');
			}

			if (!item.name || typeof item.price !== 'number') {
				return res.status(400).json({
					ok: false,
					message: 'Para agregar debes enviar name y price del item.',
				});
			}

			order = await Order.findByIdAndUpdate(
				id,
				{ $push: { items: normalizeOrderItem(item) } },
				{ new: true, runValidators: true }
			);
		}

		if (action === 'remove') {
			if (order.status !== 'pendiente') {
				throw new Error('Solo se pueden cancelar items cuando la orden esta pendiente.');
			}

			if (!item.itemId) {
				return res.status(400).json({
					ok: false,
					message: 'Para eliminar debes enviar itemId.',
				});
			}

			order = await Order.findByIdAndUpdate(
				id,
				{ $pull: { items: { _id: item.itemId } } },
				{ new: true }
			);
		}

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe luego de actualizarla.',
			});
		}

		order.seccion = order.seccion || getTableDefinition(order.table)?.section || 'Sala';
		order.total = computeOrderTotal(order.items);
		await order.save();

		emitOrderRealtime('modified', order);

		return res.json({
			ok: true,
			message: 'Orden modificada correctamente.',
			order,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo modificar la orden.',
		});
	}
});

app.patch('/api/orders/:id/update-items', async (req, res) => {
	const { id } = req.params;
	const { items } = req.body;

	if (!Array.isArray(items)) {
		return res.status(400).json({
			ok: false,
			message: 'Debes enviar el array items.',
		});
	}

	try {
		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (isOrderLocked(order)) {
			throw new Error('No se puede modificar una orden pagada.');
		}

		const normalizedItems = items.map(normalizeOrderItem);
		const removingExistingItems = hasRemovedItems(order.items, normalizedItems);

		if (order.status === 'en cocina' && removingExistingItems) {
			throw new Error('La orden esta en cocina. Para eliminar items necesitas autorizacion.');
		}

		const total = computeOrderTotal(normalizedItems);
		const updatedOrder = await Order.findByIdAndUpdate(
			id,
			{
				$set: {
					items: normalizedItems,
					total,
				},
			},
			{
				new: true,
				runValidators: true,
			}
		);

		emitOrderRealtime('items_updated', updatedOrder);

		return res.json({
			ok: true,
			message: 'Orden actualizada correctamente.',
			order: updatedOrder,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo actualizar la orden.',
		});
	}
});

app.patch('/api/orders/:id/sync', async (req, res) => {
	const { id } = req.params;
	const { items } = req.body;

	if (!Array.isArray(items)) {
		return res.status(400).json({
			ok: false,
			message: 'Debes enviar el array completo de items.',
		});
	}

	try {
		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (isOrderLocked(order)) {
			return res.status(400).json({
				ok: false,
				message: 'No se puede sincronizar una orden pagada.',
			});
		}

		const normalizedItems = items.map(normalizeOrderItem);
		const newTotal = computeOrderTotal(normalizedItems);
		const updatedOrder = await Order.findByIdAndUpdate(
			id,
			{
				$set: {
					items: normalizedItems,
					total: newTotal,
					status: ORDER_STATUS.PENDING,
				},
			},
			{
				new: true,
				runValidators: true,
			}
		);

		emitOrderRealtime('sync', updatedOrder);

		return res.json({
			ok: true,
			message: 'Pedido sincronizado correctamente.',
			order: updatedOrder,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo sincronizar la orden.',
		});
	}
});

app.patch('/api/orders/:id/pay', async (req, res) => {
	const { id } = req.params;
	const { items, montoRecibido, metodo = 'efectivo', estado = 'completado' } = req.body ?? {};

	try {
		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (getVisibleTableStatus(order) === ORDER_STATUS.CLEANING || order.mesa_liberada === true) {
			return res.status(400).json({
				ok: false,
				message: 'La orden ya fue cerrada y enviada a limpieza.',
			});
		}

		if (typeof items !== 'undefined') {
			if (!Array.isArray(items)) {
				return res.status(400).json({
					ok: false,
					message: 'Debes enviar un arreglo valido de items para cerrar la cuenta.',
				});
			}

			order.items = items.map(normalizeOrderItem);
		}

		const normalizedState = typeof estado === 'string' ? estado.trim().toLowerCase() : 'completado';
		if (!['completado', 'fallido'].includes(normalizedState)) {
			return res.status(400).json({
				ok: false,
				message: 'El estado del pago debe ser completado o fallido.',
			});
		}

		const parsedAmount = Number(montoRecibido);
		if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
			return res.status(400).json({
				ok: false,
				message: 'Debes enviar un monto recibido valido mayor a cero.',
			});
		}

		order.seccion = order.seccion || getTableDefinition(order.table)?.section || 'Sala';
		order.total = roundCurrency(Number(computeOrderTotal(order.items ?? [])));

		const currentPaidAmount = roundCurrency(Number(order.montoPagado || 0));
		const saldoPendiente = roundCurrency(order.total - currentPaidAmount);
		const normalizedAmount = roundCurrency(Number(parsedAmount));

		console.log(`Saldo Pendiente: ${saldoPendiente.toFixed(2)}`);

		if (normalizedAmount > saldoPendiente) {
			return res.status(400).json({
				ok: false,
				message: `El monto ingresado excede el saldo pendiente ($${saldoPendiente.toFixed(2)}). Por favor, ingrese el monto exacto o una parte menor`,
				order,
				remainingAmount: saldoPendiente,
			});
		}

		const nextPaidAmount = normalizedState === 'completado' ? roundCurrency(Number(currentPaidAmount + normalizedAmount)) : currentPaidAmount;
		const remainingAmount = Math.max(0, roundCurrency(order.total - nextPaidAmount));

		if (normalizedState === 'completado') {
			order.montoPagado = nextPaidAmount;
			order.historialPagos = [
				...(order.historialPagos || []),
				{
					monto: normalizedAmount,
					metodo: String(metodo || 'efectivo').trim() || 'efectivo',
					fecha: new Date(),
				},
			];
		}

		console.log(`Nuevo Total Pagado: ${Number(order.montoPagado || 0).toFixed(2)}`);

		if (normalizedState === 'fallido') {
			return res.status(400).json({
				ok: false,
				message: 'El pago fue marcado como fallido y no se aplico ningun abono.',
				order,
				remainingAmount: Math.max(0, roundCurrency(order.total - Number(order.montoPagado || 0))),
			});
		}

		if (order.montoPagado === order.total) {
			order.status = ORDER_STATUS.PAID;
			order.hora_pago = new Date();
			order.mesa_liberada = false;
			console.log(`Mesa actualizada a limpieza: ${order.table}`);
		} else {
			order.status = ORDER_STATUS.PENDING;
			order.hora_pago = null;
			order.mesa_liberada = false;
		}

		console.log(`Estado Final Mesa: ${getVisibleTableStatus(order)}`);

		await order.save();

		emitOrderRealtime(order.status === ORDER_STATUS.PAID ? 'paid' : 'partial_payment', order);

		return res.json({
			ok: true,
			message:
				order.status === ORDER_STATUS.PAID
					? `${order.table} pagada por completo. Mesa enviada a limpieza.`
					: `${order.table} abono registrado. Restante: ${remainingAmount.toFixed(2)}.`,
			montoPagado: Number(order.montoPagado || 0),
			remainingAmount,
			order,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo procesar el pago.',
		});
	}
});

async function releaseTableByOrder(orderId) {
	return Order.findByIdAndUpdate(
		orderId,
		{
			$set: {
				status: ORDER_STATUS.PAID,
				mesa_liberada: true,
			},
		},
		{
			new: true,
			runValidators: true,
		}
	);
}

app.patch('/api/tables/:id/liberar', async (req, res) => {
	const tableId = req.params.id;

	try {
		const order = await Order.findOne(
			buildActiveOrdersFilter({
				table: tableId,
			})
		).sort({ createdAt: -1 });

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La mesa no tiene una orden pendiente de liberar.',
			});
		}

		if (getVisibleTableStatus(order) !== ORDER_STATUS.CLEANING) {
			return res.status(400).json({
				ok: false,
				message: 'Solo puedes liberar mesas que esten en limpieza.',
			});
		}

		if (order.mesa_liberada === true) {
			return res.status(400).json({
				ok: false,
				message: 'La mesa ya se encuentra liberada.',
			});
		}


		const releasedOrder = await releaseTableByOrder(order._id);

		emitOrderRealtime('table_released', releasedOrder);

		return res.json({
			ok: true,
			message: `${releasedOrder.table} marcada como libre nuevamente.`,
			order: releasedOrder,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo liberar la mesa.',
		});
	}
});

app.patch('/api/orders/:id/release-table', async (req, res) => {
	const { id } = req.params;

	try {
		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (getVisibleTableStatus(order) !== ORDER_STATUS.CLEANING) {
			return res.status(400).json({
				ok: false,
				message: 'Solo puedes liberar mesas que esten en limpieza.',
			});
		}

		if (order.mesa_liberada === true) {
			return res.status(400).json({
				ok: false,
				message: 'La mesa ya se encuentra liberada.',
			});
		}


		const releasedOrder = await releaseTableByOrder(order._id);

		emitOrderRealtime('table_released', releasedOrder);

		return res.json({
			ok: true,
			message: `${releasedOrder.table} marcada como libre nuevamente.`,
			order: releasedOrder,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo liberar la mesa.',
		});
	}
});

app.delete('/api/orders/:id', async (req, res) => {
	const { id } = req.params;

	try {
		const deletedOrder = await Order.findByIdAndDelete(id);

		if (!deletedOrder) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		emitOrderRealtime('deleted', deletedOrder);

		return res.json({
			ok: true,
			message: 'Pedido cancelado y mesa liberada.',
			order: deletedOrder,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo cancelar la orden.',
		});
	}
});

async function shutdown(signal) {
	brandLog.warn(`Recibida senal ${signal}. Cerrando servidor...`);

	if (!server.listening) {
		await disconnectMongo();
		process.exit(0);
	}

	server.close(async () => {
		await disconnectMongo();
		process.exit(0);
	});
}

process.on('SIGINT', () => {
	void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
	void shutdown('SIGTERM');
});

async function startServer() {
	try {
		await mongoose.connect(MONGODB_URI);
		brandLog.success(`MongoDB conectado en ${MONGODB_URI}`);

		try {
			await listenOnConfiguredPort();
		} catch (error) {
			if (error.code === 'EADDRINUSE' && AUTO_RECOVER_PORT) {
				const released = await releaseOccupiedPort(PORT);

				if (!released) {
					throw error;
				}

				brandLog.warn(`Puerto ${PORT} liberado. Reintentando arranque del backend...`);
				await listenOnConfiguredPort();
			} else {
				throw error;
			}
		}

		brandLog.info(`Servidor escuchando en http://${HOST}:${PORT}`);
	} catch (error) {
		if (error.code === 'EADDRINUSE') {
			brandLog.error(
				`El puerto ${PORT} sigue ocupado y no se pudo recuperar automaticamente. Puedes desactivar la recuperacion con AUTO_RECOVER_PORT=false.`
			);
		} else {
			brandLog.error(`Error iniciando el backend: ${error.message}`);
		}

		await disconnectMongo();
		process.exit(1);
	}
}

startServer();
