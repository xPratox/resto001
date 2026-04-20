require('dotenv').config();

const { execFile } = require('child_process');
const http = require('http');
const { URL } = require('url');
const chalkModule = require('chalk');
const { addHours, endOfDay, parse, startOfDay } = require('date-fns');
const jwt = require('jsonwebtoken');
const { sanitizeKitchenOrder, shouldShowKitchenOrder } = require('./middleware/kitchenPayload');
const { User } = require('./models/User');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { promisify } = require('util');

const chalk = chalkModule.default || chalkModule;

const execFileAsync = promisify(execFile);

const app = express();
const server = http.createServer(app);

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 5000;
const CORS_ALLOW_ALL = process.env.CORS_ALLOW_ALL !== 'false';
const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);
const CORS_ALLOWED_DOMAIN_PATTERNS = [
	/\.ngrok-free\.app$/i,
	/\.expo\.dev$/i,
	/\.exp\.direct$/i,
];

function matchesAllowedDomain(hostname) {
	return CORS_ALLOWED_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isAllowedOrigin(origin) {
	if (!origin) {
		return true;
	}

	if (CORS_ALLOW_ALL || origin === '*') {
		return true;
	}

	if (CORS_ALLOWED_ORIGINS.includes(origin)) {
		return true;
	}

	try {
		const parsedUrl = new URL(origin);
		return matchesAllowedDomain(parsedUrl.hostname);
	} catch (_error) {
		return false;
	}
}

function resolveCorsOrigin(origin, callback) {
	callback(null, isAllowedOrigin(origin));
}

const corsOptions = {
	origin: resolveCorsOrigin,
	methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'x-resto-module'],
	credentials: false,
};
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resto001';
const JWT_SECRET = process.env.JWT_SECRET || 'cambiar-este-secreto-en-produccion';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

function parseMesoneroUsers(rawValue) {
	return String(rawValue || '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [usuarioRaw, contrasenaRaw] = entry.split(':');
			const usuario = String(usuarioRaw || '').trim().toLowerCase();
			const contrasena = String(contrasenaRaw || '').trim();

			if (!usuario || !contrasena) {
				return null;
			}

			return {
				rol: 'mesonero',
				usuario,
				contrasena,
			};
		})
		.filter(Boolean);
}

const baseAuthUsers = [
	{
		rol: 'cocina',
		usuario: String(process.env.AUTH_COCINA_USUARIO || 'cocina').trim().toLowerCase(),
		contrasena: String(process.env.AUTH_COCINA_CLAVE || 'cocina123').trim(),
	},
	{
		rol: 'caja',
		usuario: String(process.env.AUTH_CAJA_USUARIO || 'marianjela').trim().toLowerCase(),
		contrasena: String(process.env.AUTH_CAJA_CLAVE || '1234').trim(),
	},
	{
		rol: 'mesonero',
		usuario: String(process.env.AUTH_MESONERO_USUARIO || 'santiago').trim().toLowerCase(),
		contrasena: String(process.env.AUTH_MESONERO_CLAVE || '1234').trim(),
	},
];

const extraMesoneroUsers = parseMesoneroUsers(process.env.AUTH_MESONERO_USUARIOS);

const DEFAULT_AUTH_USERS = [...baseAuthUsers, ...extraMesoneroUsers].filter((candidate, index, candidates) => {
	if (!candidate?.usuario || !candidate?.contrasena || !candidate?.rol) {
		return false;
	}

	return candidates.findIndex((item) => item.usuario === candidate.usuario) === index;
});
const HISTORY_TIMEZONE = process.env.HISTORY_TIMEZONE || 'America/Caracas';
const EXCHANGE_RATE_TIMEZONE = process.env.EXCHANGE_RATE_TIMEZONE || HISTORY_TIMEZONE;
const STATS_UTC_OFFSET_HOURS = Number(process.env.STATS_UTC_OFFSET_HOURS || 4);
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
	KITCHEN: 'en_cocina',
	DELIVERED: 'entregado',
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

	return order.status === ORDER_STATUS.CLEANING;
}

function isOrderLocked(order) {
	return Boolean(order) && (order.status === ORDER_STATUS.PAID || hasRegisteredPayment(order));
}

function getVisibleTableStatus(order) {
	if (!order || order.mesa_liberada === true || order.status === ORDER_STATUS.PAID) {
		return ORDER_STATUS.AVAILABLE;
	}

	if (isOrderInCleaning(order)) {
		return ORDER_STATUS.CLEANING;
	}

	return order.status || ORDER_STATUS.KITCHEN;
}

function buildActiveOrdersFilter(extra = {}) {
	return {
		...extra,
		status: { $in: [ORDER_STATUS.KITCHEN, ORDER_STATUS.DELIVERED, ORDER_STATUS.CLEANING] },
		mesa_liberada: { $ne: true },
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

	if (shouldShowKitchenOrder(order, [ORDER_STATUS.KITCHEN])) {
		const kitchenPayload = sanitizeKitchenOrder(order);

		if (kitchenPayload) {
			io.emit('ACTUALIZACION_GLOBAL', order);
			io.emit('PEDIDO_GLOBAL', order);
			io.emit('PEDIDO_COCINA', kitchenPayload);
			io.emit('nuevo_pedido', kitchenPayload);
			io.emit('kitchen_order_upsert', kitchenPayload);
		}
	} else {
		io.emit('kitchen_order_removed', {
			idPedido: String(order._id),
			numeroMesa: String(order.table || ''),
		});
	}

	io.emit('orden_actualizada', payload);

	if (action === 'created') {
		io.emit('CAMBIO_ESTADO_MESA', payload);
		io.emit('mesa_ocupada', payload);
		io.emit('new_order', order);
		return;
	}

	if (action === 'kitchen_ready') {
		io.emit('pedido_entregado', payload);
		io.emit('CAMBIO_ESTADO_MESA', payload);
		io.emit('mesa_actualizada', payload);
	}

	if (action === 'paid') {
		io.emit('CAMBIO_ESTADO_MESA', payload);
		io.emit('mesa_en_limpieza', payload);
		io.emit('mesa_actualizada', payload);
	}

	if (action === 'deleted') {
		io.emit('order_deleted', payload);
		return;
	}

	if (action === 'table_released') {
		io.emit('CAMBIO_ESTADO_MESA', payload);
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
		status: ORDER_STATUS.KITCHEN,
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
		mesonero_usuario: { type: String, default: '', trim: true, lowercase: true },
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
		status: {
			type: String,
			enum: [ORDER_STATUS.KITCHEN, ORDER_STATUS.DELIVERED, ORDER_STATUS.CLEANING, ORDER_STATUS.PAID],
			default: ORDER_STATUS.KITCHEN,
			trim: true,
		},
		preparedAt: { type: Date, default: null },
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
							mesonero_usuario: { $ifNull: ['$mesonero_usuario', ''] },
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

function resolveHistoryRange(rangeKey) {
	const now = new Date();
	const currentDayKey = getHistoryDateKey(now);
	const [year, month, day] = currentDayKey.split('-').map(Number);
	const todayStart = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
	const tomorrowStart = new Date(todayStart);
	tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

	if (rangeKey === 'yesterday') {
		const yesterdayStart = new Date(todayStart);
		yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
		return {
			key: 'yesterday',
			label: 'Ayer',
			start: yesterdayStart,
			end: todayStart,
		};
	}

	if (rangeKey === 'last7days') {
		const last7DaysStart = new Date(todayStart);
		last7DaysStart.setUTCDate(last7DaysStart.getUTCDate() - 6);
		return {
			key: 'last7days',
			label: 'Ultimos 7 dias',
			start: last7DaysStart,
			end: tomorrowStart,
		};
	}

	return {
		key: 'today',
		label: 'Hoy',
		start: todayStart,
		end: tomorrowStart,
	};
}

function parseStatsDateBoundary(value, boundary = 'start') {
	if (!value) {
		return null;
	}

	const rawValue = String(value).trim();

	if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
		return null;
	}

	const parsedDate = parse(rawValue, 'yyyy-MM-dd', new Date());

	if (Number.isNaN(parsedDate.getTime())) {
		return null;
	}

	const boundaryDate = boundary === 'end' ? endOfDay(parsedDate) : startOfDay(parsedDate);
	const parsed = addHours(boundaryDate, STATS_UTC_OFFSET_HOURS);

	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePaymentMethod(method) {
	const normalized = String(method || 'efectivo').trim().toLowerCase();

	if (!normalized) {
		return 'efectivo';
	}

	return normalized;
}

async function ensureDefaultUsers() {
	for (const candidate of DEFAULT_AUTH_USERS) {
		if (!candidate.usuario || !candidate.contrasena || !candidate.rol) {
			continue;
		}

		const existingUser = await User.findOne({ usuario: candidate.usuario });

		if (existingUser) {
			let needsSave = false;

			if (existingUser.rol !== candidate.rol) {
				existingUser.rol = candidate.rol;
				needsSave = true;
			}

			const hasExpectedPassword = await existingUser.validarContrasena(candidate.contrasena);

			if (!hasExpectedPassword) {
				existingUser.contrasena = candidate.contrasena;
				needsSave = true;
			}

			if (needsSave) {
				await existingUser.save();
				brandLog.success(`Usuario inicial actualizado: ${candidate.usuario} (${candidate.rol})`);
			}

			continue;
		}

		await User.create({
			usuario: candidate.usuario,
			contrasena: candidate.contrasena,
			rol: candidate.rol,
		});

		brandLog.success(`Usuario inicial creado: ${candidate.usuario} (${candidate.rol})`);
	}
}

const io = new Server(server, {
	cors: {
		origin: resolveCorsOrigin,
		methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
	},
	allowRequest: (req, callback) => {
		callback(null, isAllowedOrigin(req.headers.origin));
	},
});

io.use((socket, next) => {
	const token = String(socket.handshake.auth?.token || '').trim();

	if (!token) {
		return next(new Error('Token requerido para conectar socket'));
	}

	try {
		socket.authUser = jwt.verify(token, JWT_SECRET);
		return next();
	} catch (_error) {
		return next(new Error('Token de socket invalido o expirado'));
	}
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.use('/api', (req, res, next) => {
	if (req.path === '/login' || req.path === '/health') {
		return next();
	}

	return authenticateRequest(req, res, next);
});

function createAuthToken(user) {
	return jwt.sign(
		{
			sub: String(user._id),
			usuario: user.usuario,
			rol: user.rol,
		},
		JWT_SECRET,
		{
			expiresIn: JWT_EXPIRES_IN,
		}
	);
}

function authenticateRequest(req, res, next) {
	const authHeader = String(req.headers.authorization || '');
	const [scheme, token] = authHeader.split(' ');

	if (scheme !== 'Bearer' || !token) {
		return res.status(401).json({
			ok: false,
			message: 'Token requerido. Usa Authorization: Bearer <token>.',
		});
	}

	try {
		const payload = jwt.verify(token, JWT_SECRET);
		req.authUser = payload;
		return next();
	} catch (_error) {
		return res.status(401).json({
			ok: false,
			message: 'Token invalido o expirado.',
		});
	}
}

function authorizeRoles(...allowedRoles) {
	return (req, res, next) => {
		const userRole = String(req.authUser?.rol || '').toLowerCase();

		if (!allowedRoles.includes(userRole)) {
			return res.status(403).json({
				ok: false,
				message: `Acceso denegado para rol ${userRole || 'desconocido'}.`,
			});
		}

		return next();
	};
}

function broadcastGlobalOrder(pedido) {
	if (!pedido || typeof pedido !== 'object') {
		brandLog.warn('NUEVO_PEDIDO recibido sin datos validos para distribucion global.');
		return;
	}

	const tableLabel = String(
		pedido.table || pedido.tableId || pedido.numeroMesa || pedido.mesa || ''
	).trim();
	const kitchenPayload = sanitizeKitchenOrder(pedido);

	io.emit('ACTUALIZACION_GLOBAL', pedido);
	io.emit('PEDIDO_GLOBAL', pedido);
	console.log(`📡 Pedido de Mesa ${tableLabel || 'N/D'} distribuido a todos los módulos`);

	if (!kitchenPayload) {
		brandLog.warn('NUEVO_PEDIDO recibido sin datos validos para cocina.');
		return;
	}

	brandLog.info(`Pedido recibido desde mesonero para cocina: ${kitchenPayload.idPedido} / ${kitchenPayload.numeroMesa}`);
	io.emit('PEDIDO_COCINA', kitchenPayload);
	io.emit('nuevo_pedido', kitchenPayload);
	io.emit('PEDIDO_PARA_COCINA', kitchenPayload);
	io.emit('kitchen_order_upsert', kitchenPayload);
}

io.on('connection', (socket) => {
	brandLog.info(`Cliente conectado por socket: ${socket.id}`);

	socket.on('ENVIAR_PEDIDO', broadcastGlobalOrder);
	socket.on('NUEVO_PEDIDO', broadcastGlobalOrder);
	socket.on('NUEVO_PEDIDO_MESONERO', broadcastGlobalOrder);

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

app.post('/api/login', async (req, res) => {
	const usuario = String(req.body?.usuario || '').trim().toLowerCase();
	const contrasena = String(req.body?.contrasena || '');

	if (!usuario || !contrasena) {
		return res.status(400).json({
			ok: false,
			message: 'Debes enviar usuario y contrasena.',
		});
	}

	try {
		const user = await User.findOne({ usuario });

		if (!user) {
			return res.status(401).json({
				ok: false,
				message: 'Credenciales invalidas.',
			});
		}

		const isValidPassword = await user.validarContrasena(contrasena);

		if (!isValidPassword) {
			return res.status(401).json({
				ok: false,
				message: 'Credenciales invalidas.',
			});
		}

		const token = createAuthToken(user);

		return res.status(200).json({
			ok: true,
			usuario: user.usuario,
			rol: user.rol,
			token,
			tokenType: 'Bearer',
			expiresIn: JWT_EXPIRES_IN,
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'Error procesando login.',
			error: error.message,
		});
	}
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

app.get('/api/stats/ventas', async (req, res) => {
	const inicio = parseStatsDateBoundary(req.query?.inicio, 'start');
	const fin = parseStatsDateBoundary(req.query?.fin, 'end');

	if (!inicio || !fin) {
		return res.status(400).json({
			ok: false,
			message: 'Debes enviar inicio y fin con formato YYYY-MM-DD.',
		});
	}

	if (inicio > fin) {
		return res.status(400).json({
			ok: false,
			message: 'La fecha de inicio no puede ser mayor que la fecha fin.',
		});
	}

	try {
		const paidMatch = {
			status: ORDER_STATUS.PAID,
			hora_pago: {
				$gte: inicio,
				$lte: fin,
			},
		};

		const matchedOrders = await Order.find(paidMatch)
			.select({
				table: 1,
				status: 1,
				total: 1,
				hora_pago: 1,
				historialPagos: 1,
			})
			.sort({ hora_pago: -1 })
			.lean();

		const ordersInRangeByStatus = await Order.aggregate([
			{
				$match: {
					hora_pago: {
						$gte: inicio,
						$lte: fin,
					},
				},
			},
			{
				$group: {
					_id: '$status',
					cantidad: { $sum: 1 },
					total: { $sum: { $ifNull: ['$total', 0] } },
				},
			},
			{
				$sort: { cantidad: -1 },
			},
		]);

		console.log('[stats/ventas] rango consultado', {
			inicio: inicio.toISOString(),
			fin: fin.toISOString(),
			filtro: {
				inicio: String(req.query?.inicio),
				fin: String(req.query?.fin),
			},
		});
		console.log('[stats/ventas] ordenes pagadas encontradas', matchedOrders.map((order) => ({
			id: String(order._id),
			mesa: order.table,
			status: order.status,
			total: roundCurrency(Number(order.total || 0)),
			hora_pago: order.hora_pago,
			metodosPago: (order.historialPagos || []).map((payment) => ({
				metodo: normalizePaymentMethod(payment.metodo),
				monto: roundCurrency(Number(payment.monto || 0)),
				fecha: payment.fecha,
			})),
		})));
		console.log('[stats/ventas] resumen por status dentro del rango', ordersInRangeByStatus);

		const [statsResult] = await Order.aggregate([
			{
				$match: paidMatch,
			},
			{
				$facet: {
					resumen: [
						{
							$group: {
								_id: null,
								totalVentas: {
									$sum: {
										$round: [{ $toDouble: '$total' }, 2],
									},
								},
								cantidadOrdenes: { $sum: 1 },
							},
						},
						{
							$project: {
								_id: 0,
								totalVentas: { $round: ['$totalVentas', 2] },
								cantidadOrdenes: 1,
								ticketPromedio: {
									$cond: [
										{ $gt: ['$cantidadOrdenes', 0] },
										{ $round: [{ $divide: ['$totalVentas', '$cantidadOrdenes'] }, 2] },
										0,
									],
								},
							},
						},
					],
					metodosPago: [
						{
							$unwind: {
								path: '$historialPagos',
								preserveNullAndEmptyArrays: false,
							},
						},
						{
							$group: {
								_id: {
									$toLower: {
										$trim: {
											input: { $ifNull: ['$historialPagos.metodo', 'efectivo'] },
										},
									},
								},
								total: {
									$sum: {
										$round: [{ $toDouble: '$historialPagos.monto' }, 2],
									},
								},
							},
						},
						{
							$project: {
								_id: 0,
								k: {
									$cond: [
										{ $gt: [{ $strLenCP: '$_id' }, 0] },
										'$_id',
										'efectivo',
									],
								},
								v: { $round: ['$total', 2] },
							},
						},
					],
				},
			},
		]);

		const summary = statsResult?.resumen?.[0] || {
			totalVentas: 0,
			cantidadOrdenes: 0,
			ticketPromedio: 0,
		};
		const metodosPago = Object.fromEntries(
			(statsResult?.metodosPago || []).map((item) => [item.k, item.v])
		);

		return res.json({
			totalVentas: summary.totalVentas,
			cantidadOrdenes: summary.cantidadOrdenes,
			ticketPromedio: summary.ticketPromedio,
			metodosPago,
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudieron calcular las estadisticas de ventas.',
			error: error.message,
		});
	}
});

app.put('/api/exchange-rate/today', authorizeRoles('caja'), async (req, res) => {
	const parsedRate = parseCurrency(req.body?.rate);
	const rateType = normalizeRateType(req.query?.type || req.body?.type);
	const { model, label } = getRateModelByType(rateType);

	if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
		return res.status(400).json({
			ok: false,
			message: `Debes enviar una tasa ${label} valida mayor a cero.`,
		});
	}

	try {
		const dayKey = getHistoryDateKey(new Date(), EXCHANGE_RATE_TIMEZONE);
		const tasaExistente = await model.findOne({ dayKey });

		if (tasaExistente) {
			return res.status(400).json({
				ok: false,
				msg: 'Acceso denegado: La tasa ya fue fijada para hoy',
				message: 'Acceso denegado: La tasa ya fue fijada para hoy',
				rateType,
				rate: tasaExistente.rate,
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

		return res.status(200).json({
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

app.delete('/api/exchange-rate/today', async (req, res) => {
	return res.status(403).json({
		ok: false,
		message: 'Acceso denegado: La tasa ya fue fijada para hoy',
	});
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

app.get('/api/orders/history', authorizeRoles('caja'), async (req, res) => {
	try {
		const selectedRange = resolveHistoryRange(String(req.query?.range || 'today').trim().toLowerCase());
		const [history] = await Order.aggregate(buildPaidOrdersHistoryPipeline());
		const allSummaryByDay = history?.summaryByDay || [];
		const allTransactions = history?.transactions || [];
		const transactions = allTransactions.filter((transaction) => {
			const paidAt = transaction?.hora_pago ? new Date(transaction.hora_pago) : null;
			return paidAt && paidAt >= selectedRange.start && paidAt < selectedRange.end;
		});
		const summaryByDay = allSummaryByDay.filter((summary) => {
			if (!summary?.reportDate) {
				return false;
			}

			const summaryDate = new Date(`${summary.reportDate}T04:00:00.000Z`);
			return summaryDate >= selectedRange.start && summaryDate < selectedRange.end;
		});

		const totalRevenue = transactions.reduce((sum, transaction) => sum + Number(transaction.paymentAmount || 0), 0);
		const uniqueOrders = new Set(transactions.map((transaction) => String(transaction._id || '')).filter(Boolean));
		const uniqueTables = new Set(transactions.map((transaction) => String(transaction.table || '')).filter(Boolean));
		const paymentMethods = transactions.reduce((accumulator, transaction) => {
			const method = String(transaction.paymentMethod || 'otro').trim().toLowerCase();
			accumulator[method] = Number(((accumulator[method] || 0) + Number(transaction.paymentAmount || 0)).toFixed(2));
			return accumulator;
		}, {});
		const hourlySales = transactions.reduce((accumulator, transaction) => {
			const paidAt = transaction?.hora_pago ? new Date(transaction.hora_pago) : null;

			if (!paidAt || Number.isNaN(paidAt.getTime())) {
				return accumulator;
			}

			const hourLabel = `${new Intl.DateTimeFormat('en-GB', {
				timeZone: HISTORY_TIMEZONE,
				hour: '2-digit',
				hour12: false,
			}).format(paidAt)}:00`;

			accumulator[hourLabel] = Number(((accumulator[hourLabel] || 0) + Number(transaction.paymentAmount || 0)).toFixed(2));
			return accumulator;
		}, {});
		const todayKey = getHistoryDateKey(new Date());
		const daySummary =
			summaryByDay.find((summary) => summary.reportDate === todayKey) || {
				reportDate: selectedRange.key === 'today' ? todayKey : selectedRange.label,
				transactionsCount: uniqueOrders.size,
				totalRevenue: Number(totalRevenue.toFixed(2)),
			};

		return res.json({
			ok: true,
			timezone: HISTORY_TIMEZONE,
			range: selectedRange,
			totalTables: TABLES.length,
			totalTransactions: transactions.length,
			daySummary,
			summaryByDay,
			kpis: {
				totalRevenue: Number(totalRevenue.toFixed(2)),
				totalOrders: uniqueOrders.size,
				averageTicket: uniqueOrders.size ? Number((totalRevenue / uniqueOrders.size).toFixed(2)) : 0,
				cleanedTablesCount: uniqueTables.size,
				cleaningPercentage: TABLES.length ? Number(((uniqueTables.size / TABLES.length) * 100).toFixed(1)) : 0,
			},
			hourlySales: Object.entries(hourlySales)
				.map(([hour, total]) => ({ hour, total }))
				.sort((left, right) => left.hour.localeCompare(right.hour)),
			paymentMethodBreakdown: Object.entries(paymentMethods).map(([method, total]) => ({
				method,
				total,
			})),
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

app.get('/api/kitchen/orders', authorizeRoles('cocina'), async (_req, res) => {
	try {
		const orders = await Order.find({
			status: ORDER_STATUS.KITCHEN,
			preparedAt: null,
			mesa_liberada: { $ne: true },
		})
			.sort({ createdAt: 1 })
			.lean();

		return res.json({
			ok: true,
			orders: orders
				.map((order) => sanitizeKitchenOrder(order))
				.filter(Boolean),
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo cargar la cola de cocina.',
			error: error.message,
		});
	}
});

app.get('/api/kitchen/history', authorizeRoles('cocina'), async (_req, res) => {
	try {
		const orders = await Order.find({
			status: { $in: [ORDER_STATUS.KITCHEN, ORDER_STATUS.DELIVERED, ORDER_STATUS.CLEANING, ORDER_STATUS.PAID] },
		})
			.sort({ createdAt: -1 })
			.limit(200)
			.lean();

		return res.json({
			ok: true,
			orders: orders
				.map((order) => sanitizeKitchenOrder(order))
				.filter(Boolean),
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo cargar el historial de comandas.',
			error: error.message,
		});
	}
});

app.patch('/api/kitchen/orders/:id/ready', authorizeRoles('cocina'), async (req, res) => {
	try {
		const order = await Order.findById(req.params.id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (order.mesa_liberada === true || order.status === ORDER_STATUS.PAID) {
			return res.status(400).json({
				ok: false,
				message: 'La orden ya no esta disponible para cocina.',
			});
		}

		if (order.status !== ORDER_STATUS.KITCHEN) {
			return res.status(400).json({
				ok: false,
				message: 'Solo pedidos en cocina pueden marcarse como entregados.',
			});
		}

		if (!order.preparedAt) {
			order.preparedAt = new Date();
			order.status = ORDER_STATUS.DELIVERED;
			await order.save();
			emitOrderRealtime('kitchen_ready', order);
		}

		return res.json({
			ok: true,
			message: 'Pedido marcado como entregado.',
			order: sanitizeKitchenOrder(order),
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo marcar el pedido como preparado.',
		});
	}
});

app.get('/api/orders/:id', authorizeRoles('mesonero', 'caja'), async (req, res) => {
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

app.get('/api/orders/active/table/:table', authorizeRoles('mesonero', 'caja'), async (req, res) => {
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

app.post('/api/orders', authorizeRoles('mesonero'), async (req, res) => {
	const { table, tableId, items, cliente_nombre, seccion } = req.body ?? {};
	const mesoneroUsuario = String(req.authUser?.usuario || '').trim().toLowerCase();
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
								mesonero_usuario: mesoneroUsuario || pendingOrder.mesonero_usuario || '',
								seccion: normalizedSection,
								status: ORDER_STATUS.KITCHEN,
								preparedAt: null,
								hora_pago: null,
								mesa_liberada: false,
							},
						}
						: {
							$set: {
								mesonero_usuario: mesoneroUsuario || pendingOrder.mesonero_usuario || '',
								seccion: normalizedSection,
								status: ORDER_STATUS.KITCHEN,
								preparedAt: null,
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
				message: 'Pedido unificado en la orden activa de la mesa.',
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
			mesonero_usuario: mesoneroUsuario,
			seccion: normalizedSection,
			items: normalizedItems,
			total: itemsTotal,
			montoPagado: 0,
			historialPagos: [],
			status: ORDER_STATUS.KITCHEN,
			preparedAt: null,
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

app.patch('/api/orders/:id/modify', authorizeRoles('mesonero'), async (req, res) => {
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
			if (order.status !== ORDER_STATUS.KITCHEN) {
				throw new Error('Solo se pueden cancelar items cuando la orden esta en cocina.');
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
		if (String(req.authUser?.usuario || '').trim()) {
			order.mesonero_usuario = String(req.authUser.usuario).trim().toLowerCase();
		}
		if (action === 'add') {
			order.status = ORDER_STATUS.KITCHEN;
			order.preparedAt = null;
		}
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

app.patch('/api/orders/:id/update-items', authorizeRoles('mesonero'), async (req, res) => {
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

		if (order.status === ORDER_STATUS.KITCHEN && removingExistingItems) {
			throw new Error('La orden esta en cocina. Para eliminar items necesitas autorizacion.');
		}

		const total = computeOrderTotal(normalizedItems);
		const updatedOrder = await Order.findByIdAndUpdate(
			id,
			{
				$set: {
					items: normalizedItems,
					total,
					mesonero_usuario: String(req.authUser?.usuario || '').trim().toLowerCase() || order.mesonero_usuario || '',
					status: ORDER_STATUS.KITCHEN,
					preparedAt: null,
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

app.patch('/api/orders/:id/sync', authorizeRoles('mesonero'), async (req, res) => {
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
					mesonero_usuario: String(req.authUser?.usuario || '').trim().toLowerCase() || order.mesonero_usuario || '',
					status: ORDER_STATUS.KITCHEN,
					preparedAt: null,
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

app.patch('/api/orders/:id/pay', authorizeRoles('caja'), async (req, res) => {
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

		if (order.status === ORDER_STATUS.PAID || order.mesa_liberada === true) {
			return res.status(400).json({
				ok: false,
				message: 'La orden ya fue pagada.',
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

		const montoPagadoAnteriormente = roundCurrency(Number(order.montoPagado || 0));
		const saldoPendiente = roundCurrency(order.total - montoPagadoAnteriormente);
		const normalizedAmount = roundCurrency(Number(parsedAmount));

		console.log(`Saldo Pendiente: ${saldoPendiente.toFixed(2)}`);

		if (saldoPendiente <= 0) {
			return res.status(400).json({
				ok: false,
				message: 'La orden ya no tiene saldo pendiente.',
				remainingAmount: 0,
			});
		}

		if (normalizedAmount > saldoPendiente) {
			return res.status(400).json({
				ok: false,
				message: 'El monto excede el saldo pendiente',
				order,
				remainingAmount: saldoPendiente,
			});
		}

		const nextPaidAmount = normalizedState === 'completado' ? roundCurrency(Number(montoPagadoAnteriormente + normalizedAmount)) : montoPagadoAnteriormente;
		const remainingAmount = Math.max(0, roundCurrency(order.total - nextPaidAmount));
		const isFullyPaid = normalizedState === 'completado' && nextPaidAmount === order.total;

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

		if (isFullyPaid) {
			order.status = ORDER_STATUS.CLEANING;
			order.hora_pago = new Date();
			order.mesa_liberada = false;
			console.log(`Pedido enviado a limpieza: ${order.table}`);
		} else {
			order.status = order.status === ORDER_STATUS.DELIVERED ? ORDER_STATUS.DELIVERED : ORDER_STATUS.KITCHEN;
			order.hora_pago = null;
			order.mesa_liberada = false;
		}

		console.log(`Estado Final Mesa: ${getVisibleTableStatus(order)}`);

		await order.save();

		emitOrderRealtime(order.status === ORDER_STATUS.CLEANING ? 'paid' : 'partial_payment', order);

		return res.json({
			ok: true,
			message:
				order.status === ORDER_STATUS.CLEANING
					? `${order.table} pagada por completo y enviada a limpieza.`
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

app.patch('/api/tables/:id/liberar', authorizeRoles('mesonero', 'caja'), async (req, res) => {
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

		if (order.status !== ORDER_STATUS.CLEANING) {
			return res.status(400).json({
				ok: false,
				message: 'Solo puedes liberar mesas que ya esten en limpieza.',
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

app.patch('/api/orders/:id/release-table', authorizeRoles('mesonero', 'caja'), async (req, res) => {
	const { id } = req.params;

	try {
		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (order.status !== ORDER_STATUS.CLEANING) {
			return res.status(400).json({
				ok: false,
				message: 'Solo puedes liberar mesas que ya esten en limpieza.',
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

app.delete('/api/orders/:id', authorizeRoles('mesonero'), async (req, res) => {
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
		await ensureDefaultUsers();

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
