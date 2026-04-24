require('dotenv').config();

const { execFile } = require('child_process');
const http = require('http');
const { URL } = require('url');
const chalkModule = require('chalk');
const { addHours, endOfDay, parse, startOfDay } = require('date-fns');
const jwt = require('jsonwebtoken');
const { sanitizeKitchenOrder, shouldShowKitchenOrder } = require('./middleware/kitchenPayload');
const { startDailyRateResetJob } = require('./jobs/resetDailyRateLock');
const { User } = require('./models/User');
const { MenuItem } = require('./models/MenuItem');
const { GlobalSetting } = require('./models/GlobalSetting');
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

function buildDisplayName(value) {
	return String(value || '')
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
}

const activeUserSockets = new Map();

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
				nombre: buildDisplayName(usuario),
				rol: 'mesonero',
				usuario,
				contrasena,
			};
		})
		.filter(Boolean);
}

const baseAuthUsers = [
	{
		nombre: String(process.env.AUTH_ADMIN_NOMBRE || 'Administrador General').trim(),
		rol: 'admin',
		usuario: String(process.env.AUTH_ADMIN_USUARIO || 'admin').trim().toLowerCase(),
		contrasena: String(process.env.AUTH_ADMIN_CLAVE || 'admin1234').trim(),
	},
	{
		nombre: String(process.env.AUTH_COCINA_NOMBRE || 'Cocina Principal').trim(),
		rol: 'cocina',
		usuario: String(process.env.AUTH_COCINA_USUARIO || 'cocina').trim().toLowerCase(),
		contrasena: String(process.env.AUTH_COCINA_CLAVE || 'cocina123').trim(),
	},
	{
		nombre: String(process.env.AUTH_CAJA_NOMBRE || 'Marianjela').trim(),
		rol: 'caja',
		usuario: String(process.env.AUTH_CAJA_USUARIO || 'marianjela').trim().toLowerCase(),
		contrasena: String(process.env.AUTH_CAJA_CLAVE || '1234').trim(),
	},
	{
		nombre: String(process.env.AUTH_MESONERO_NOMBRE || 'Santiago').trim(),
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
const SUPER_ADMIN_USERNAME = String(process.env.AUTH_ADMIN_USUARIO || 'admin').trim().toLowerCase();
const HISTORY_TIMEZONE = process.env.HISTORY_TIMEZONE || 'America/Caracas';
const EXCHANGE_RATE_TIMEZONE = process.env.EXCHANGE_RATE_TIMEZONE || HISTORY_TIMEZONE;
const STATS_UTC_OFFSET_HOURS = Number(process.env.STATS_UTC_OFFSET_HOURS || 4);
const AUTO_RECOVER_PORT = process.env.AUTO_RECOVER_PORT !== 'false';
const PORT_RECOVERY_WAIT_MS = 250;
const PORT_RECOVERY_MAX_ATTEMPTS = 12;
const RATE_HISTORY_LIMIT = 14;
const KITCHEN_COMANDA_LIMIT = 50;
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

let isShuttingDown = false;

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
		status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.KITCHEN, ORDER_STATUS.DELIVERED, ORDER_STATUS.CLEANING] },
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

	if (action === 'payment_pending') {
		io.emit('CAMBIO_ESTADO_MESA', payload);
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
const DEFAULT_MENU_ITEMS = [
	{ nombre: 'Nestea', descripcion: 'Te helado de limon servido frio.', precio: 2.5, categoria: 'Bebidas' },
	{ nombre: 'Pepsi', descripcion: 'Refresco clasico individual.', precio: 2.0, categoria: 'Bebidas' },
	{ nombre: 'Agua Mineral', descripcion: 'Botella individual sin gas.', precio: 1.5, categoria: 'Bebidas' },
	{ nombre: 'Hamburguesa Clasica', descripcion: 'Carne, queso y vegetales frescos.', precio: 7.5, categoria: 'Platos' },
	{ nombre: 'Perro Caliente', descripcion: 'Pan suave con toppings de la casa.', precio: 5.5, categoria: 'Platos' },
	{ nombre: 'Club House', descripcion: 'Sandwich triple con papas.', precio: 8.25, categoria: 'Platos' },
	{ nombre: 'Pizza Margarita', descripcion: 'Pizza individual de queso y tomate.', precio: 9.0, categoria: 'Platos' },
];

function serializeMenuItem(item) {
	const plainItem = typeof item?.toObject === 'function' ? item.toObject() : item;
	const category = String(plainItem?.categoria || plainItem?.category || 'Menu').trim();
	const name = String(plainItem?.nombre || plainItem?.name || '').trim();
	const price = roundCurrency(plainItem?.precio ?? plainItem?.price ?? 0);

	return {
		_id: String(plainItem?._id || ''),
		id: String(plainItem?._id || ''),
		name,
		nombre: name,
		description: String(plainItem?.descripcion || plainItem?.description || '').trim(),
		descripcion: String(plainItem?.descripcion || plainItem?.description || '').trim(),
		price,
		precio: price,
		category,
		categoria: category,
		type: category.toLowerCase().includes('bebida') ? 'drink' : 'dish',
		disponible: plainItem?.disponible !== false,
	};
}

function buildMenuCategoryMap(items) {
	return items.reduce((accumulator, item) => {
		const category = item.category || 'Menu';

		if (!accumulator[category]) {
			accumulator[category] = [];
		}

		accumulator[category].push(item);
		return accumulator;
	}, {});
}

function serializeUser(user) {
	const plainUser = typeof user?.toObject === 'function' ? user.toObject() : user;

	return {
		_id: String(plainUser?._id || ''),
		nombre: String(plainUser?.nombre || buildDisplayName(plainUser?.usuario) || '').trim(),
		usuario: String(plainUser?.usuario || '').trim().toLowerCase(),
		rol: String(plainUser?.rol || '').trim().toLowerCase(),
		is_online: Boolean(plainUser?.is_online),
		last_login_at: plainUser?.last_login_at || null,
		last_seen_at: plainUser?.last_seen_at || null,
		createdAt: plainUser?.createdAt || null,
		updatedAt: plainUser?.updatedAt || null,
	};
}

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
	if (mongoose.connection.readyState === 0) {
		return;
	}

	try {
		await mongoose.disconnect();
	} catch (error) {
		if (error?.name === 'MongoClientClosedError' || /client was closed/i.test(String(error?.message || ''))) {
			return;
		}

		throw error;
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

async function isSingleDrinkOnlyOrder(order) {
	const orderItems = Array.isArray(order?.items) ? order.items : [];

	if (orderItems.length !== 1) {
		return false;
	}

	const [onlyItem] = orderItems;
	const quantity = Number(onlyItem?.cantidad || 1);

	if (!Number.isFinite(quantity) || quantity !== 1) {
		return false;
	}

	const itemName = String(onlyItem?.name || '').trim();

	if (!itemName) {
		return false;
	}

	const menuItem = await MenuItem.findOne({ nombre: itemName }).lean();
	const category = String(menuItem?.categoria || '').trim().toLowerCase();

	return category.includes('bebida');
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
			enum: [ORDER_STATUS.PENDING, ORDER_STATUS.KITCHEN, ORDER_STATUS.DELIVERED, ORDER_STATUS.CLEANING, ORDER_STATUS.PAID],
			default: ORDER_STATUS.KITCHEN,
			trim: true,
		},
		preparedAt: { type: Date, default: null },
		comanda_impresa_at: { type: Date, default: null },
		hora_pago: { type: Date, default: null },
		mesa_liberada: { type: Boolean, default: false },
	},
	{
		timestamps: true,
	}
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

const kitchenComandaSchema = new mongoose.Schema(
	{
		orderId: { type: String, required: true, index: true, trim: true },
		numeroMesa: { type: String, required: true, trim: true },
		pago: { type: String, default: 'EFECTIVO', trim: true },
		items: [
			{
				cantidad: { type: Number, required: true, min: 1 },
				nombre: { type: String, required: true, trim: true },
			},
		],
		abono: { type: Number, required: true, min: 0, default: 0 },
		total: { type: Number, required: true, min: 0, default: 0 },
	},
	{
		timestamps: true,
	}
);

const KitchenComanda = mongoose.models.KitchenComanda || mongoose.model('KitchenComanda', kitchenComandaSchema);

function buildKitchenComandaPayload(record) {
	if (!record) {
		return null;
	}

	return {
		idComanda: String(record._id || ''),
		orderId: String(record.orderId || ''),
		numeroMesa: String(record.numeroMesa || ''),
		pago: String(record.pago || 'EFECTIVO').trim().toUpperCase(),
		items: Array.isArray(record.items)
			? record.items
					.map((item) => ({
						cantidad: Number(item?.cantidad || 0),
						nombre: String(item?.nombre || '').trim(),
					}))
					.filter((item) => item.cantidad > 0 && item.nombre)
			: [],
		abono: Number(record.abono || 0),
		total: Number(record.total || 0),
		createdAt: record.createdAt || null,
	};
}

async function pruneKitchenComandas(limit = KITCHEN_COMANDA_LIMIT) {
	const extraRecords = await KitchenComanda.find({})
		.sort({ createdAt: -1 })
		.skip(limit)
		.select({ _id: 1 })
		.lean();

	if (!extraRecords.length) {
		return;
	}

	await KitchenComanda.deleteMany({
		_id: {
			$in: extraRecords.map((record) => record._id),
		},
	});
}

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

function getManualRateKey(rateType) {
	return rateType === 'pesos' ? 'cop' : 'bcv';
}

async function getGlobalSettingsDocument() {
	const existingSettings = await GlobalSetting.findOne({ key: 'global' });

	if (existingSettings) {
		return existingSettings;
	}

	return GlobalSetting.create({ key: 'global' });
}

function hasDailyRateLock(settings, dayKey) {
	return Boolean(settings?.rateControl?.isLockedForDay) && String(settings?.rateControl?.lockedDayKey || '') === String(dayKey || '');
}

function buildRateHistoryEntry({ dayKey, bcv, cop, updatedAt, updatedBy }) {
	return {
		dayKey,
		bcv,
		cop,
		updatedAt,
		updatedBy,
	};
}

function buildRateSettingsPayload(settings, resolvedRates) {
	const rateHistory = Array.isArray(settings?.rateHistory) ? settings.rateHistory : [];

	return {
		ok: true,
		manualRates: settings?.manualRates || null,
		resolvedRates,
		rateControl: settings?.rateControl || null,
		latestRateUpdate: rateHistory[0] || null,
		rateHistory,
	};
}

async function updateExchangeRatesForAdmin({ bcv, cop, authUser, io }) {
	const settings = await getGlobalSettingsDocument();
	const dayKey = getHistoryDateKey(new Date(), EXCHANGE_RATE_TIMEZONE);

	if (hasDailyRateLock(settings, dayKey)) {
		const alreadySetError = new Error('La tasa ya fue establecida para el día de hoy');
		alreadySetError.statusCode = 409;
		throw alreadySetError;
	}

	const nextBcv = bcv ?? settings?.manualRates?.bcv?.value ?? null;
	const nextCop = cop ?? settings?.manualRates?.cop?.value ?? null;

	if (!Number.isFinite(nextBcv) || nextBcv <= 0 || !Number.isFinite(nextCop) || nextCop <= 0) {
		const invalidRatesError = new Error('Debes establecer tasas BCV y COP validas mayores a cero.');
		invalidRatesError.statusCode = 400;
		throw invalidRatesError;
	}

	const updatedAt = new Date();
	const updatedBy = String(authUser?.usuario || '').trim().toLowerCase();
	const historyEntry = buildRateHistoryEntry({
		dayKey,
		bcv: nextBcv,
		cop: nextCop,
		updatedAt,
		updatedBy,
	});

	await Promise.all([
		DailyExchangeRate.findOneAndUpdate(
			{ dayKey },
			{
				$set: {
					rate: nextBcv,
					assignedAt: updatedAt,
					assignedBy: updatedBy,
				},
			},
			{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
		),
		DailyPesoRate.findOneAndUpdate(
			{ dayKey },
			{
				$set: {
					rate: nextCop,
					assignedAt: updatedAt,
					assignedBy: updatedBy,
				},
			},
			{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
		),
	]);

	const updatedSettings = await GlobalSetting.findOneAndUpdate(
		{ key: 'global' },
		{
			$set: {
				'manualRates.bcv.value': nextBcv,
				'manualRates.bcv.updatedAt': updatedAt,
				'manualRates.bcv.updatedBy': updatedBy,
				'manualRates.cop.value': nextCop,
				'manualRates.cop.updatedAt': updatedAt,
				'manualRates.cop.updatedBy': updatedBy,
				'rateControl.isLockedForDay': true,
				'rateControl.lockedDayKey': dayKey,
			},
			$push: {
				rateHistory: {
					$each: [historyEntry],
					$position: 0,
					$slice: RATE_HISTORY_LIMIT,
				},
			},
		},
		{ returnDocument: 'after', upsert: true }
	);

	const resolvedRates = {
		bcv: await buildExchangeRateResponse('bcv'),
		cop: await buildExchangeRateResponse('pesos'),
	};

	io.emit('tasa_actualizada', {
		rateType: 'bcv',
		dayKey,
		rate: nextBcv,
		timezone: EXCHANGE_RATE_TIMEZONE,
		assignedAt: updatedAt,
	});

	io.emit('tasa_actualizada', {
		rateType: 'pesos',
		dayKey,
		rate: nextCop,
		timezone: EXCHANGE_RATE_TIMEZONE,
		assignedAt: updatedAt,
	});

	io.emit('global_settings_updated', {
		manualRates: updatedSettings.manualRates,
		rateControl: updatedSettings.rateControl,
		latestRateUpdate: updatedSettings.rateHistory?.[0] || null,
		updatedAt: updatedAt.toISOString(),
	});

	return buildRateSettingsPayload(updatedSettings, resolvedRates);
}

async function buildExchangeRateResponse(rateType) {
	const normalizedRateType = normalizeRateType(rateType);
	const { model } = getRateModelByType(normalizedRateType);
	const dayKey = getHistoryDateKey(new Date(), EXCHANGE_RATE_TIMEZONE);
	const [dailyRate, globalSettings] = await Promise.all([
		model.findOne({ dayKey }).lean(),
		getGlobalSettingsDocument(),
	]);
	const manualRateKey = getManualRateKey(normalizedRateType);
	const manualRate = globalSettings?.manualRates?.[manualRateKey] || null;
	const resolvedRate = dailyRate?.rate ?? manualRate?.value ?? null;
	const source = dailyRate ? 'daily' : manualRate?.value ? 'manual' : null;
	const isLockedForToday = hasDailyRateLock(globalSettings, dayKey);

	return {
		ok: true,
		rateType: normalizedRateType,
		timezone: EXCHANGE_RATE_TIMEZONE,
		dayKey,
		rate: resolvedRate,
		source,
		isAssigned: resolvedRate !== null,
		canEdit: !dailyRate && !isLockedForToday,
		assignedAt: dailyRate?.assignedAt ?? manualRate?.updatedAt ?? null,
		assignedBy: dailyRate?.assignedBy ?? manualRate?.updatedBy ?? null,
		manualRate: manualRate?.value ?? null,
		manualUpdatedAt: manualRate?.updatedAt ?? null,
		manualUpdatedBy: manualRate?.updatedBy ?? null,
		isLockedForToday,
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

async function buildOrdersHistoryResponse(rangeKey) {
	const selectedRange = resolveHistoryRange(String(rangeKey || 'today').trim().toLowerCase());
	const [history] = await Order.aggregate(buildPaidOrdersHistoryPipeline());
	const mesoneroUsers = await User.find({ rol: 'mesonero' }).select({ usuario: 1, nombre: 1 }).lean();
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
	const mesoneroNameMap = new Map(
		mesoneroUsers.map((user) => [
			String(user?.usuario || '').trim().toLowerCase(),
			String(user?.nombre || buildDisplayName(user?.usuario) || '').trim(),
		])
	);
	const fallbackMesoneros = mesoneroUsers.length
		? mesoneroUsers
		: [{ usuario: 'santiago', nombre: 'Santiago' }];
	const mesoneroStatsMap = new Map(
		fallbackMesoneros.map((user) => [
			String(user?.usuario || '').trim().toLowerCase(),
			{
				usuario: String(user?.usuario || '').trim().toLowerCase(),
				nombre: String(user?.nombre || buildDisplayName(user?.usuario) || 'Mesonero').trim(),
				mesas: new Set(),
				pagos: 0,
				ultimoServicio: '',
			},
		])
	);

	const transactionsWithMesonero = transactions.map((transaction) => {
		const mesoneroUsuario = String(transaction?.mesonero_usuario || '').trim().toLowerCase();
		const mesoneroNombre =
			mesoneroNameMap.get(mesoneroUsuario) ||
			(mesoneroUsuario ? buildDisplayName(mesoneroUsuario) : 'Santiago');
		const statsKey = mesoneroUsuario || 'santiago';

		if (!mesoneroStatsMap.has(statsKey)) {
			mesoneroStatsMap.set(statsKey, {
				usuario: statsKey,
				nombre: mesoneroNombre,
				mesas: new Set(),
				pagos: 0,
				ultimoServicio: '',
			});
		}

		const stats = mesoneroStatsMap.get(statsKey);
		stats.pagos += 1;
		if (transaction?.table) {
			stats.mesas.add(String(transaction.table));
			stats.ultimoServicio = String(transaction.table);
		}

		return {
			...transaction,
			mesonero_nombre: mesoneroNombre,
			mesa_atendida: String(transaction?.table || ''),
		};
	});

	const mesoneroStats = Array.from(mesoneroStatsMap.values())
		.map((entry) => ({
			usuario: entry.usuario,
			nombre: entry.nombre,
			mesasAtendidas: entry.mesas.size,
			pagosRegistrados: entry.pagos,
			ultimoServicio: entry.ultimoServicio,
		}))
		.sort((left, right) => right.mesasAtendidas - left.mesasAtendidas || right.pagosRegistrados - left.pagosRegistrados || left.nombre.localeCompare(right.nombre));

	return {
		ok: true,
		timezone: HISTORY_TIMEZONE,
		range: selectedRange,
		totalTables: TABLES.length,
		totalTransactions: transactions.length,
		daySummary,
		summaryByDay,
		mesoneroStats,
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
		transactions: transactionsWithMesonero,
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

async function ensureUserCollectionCompatibility() {
	const usersCollection = mongoose.connection.collection('users');
	const indexes = await usersCollection.indexes();
	const legacyUsernameIndex = indexes.find((index) => index.name === 'username_1');

	if (!legacyUsernameIndex) {
		return;
	}

	await usersCollection.dropIndex(legacyUsernameIndex.name);
	brandLog.warn('Indice legado username_1 eliminado de users para usar el campo usuario.');
}

async function ensureMenuSeed() {
	const existingItems = await MenuItem.countDocuments();

	if (existingItems > 0) {
		return;
	}

	await MenuItem.insertMany(DEFAULT_MENU_ITEMS);
	brandLog.success('Menu inicial cargado en MongoDB.');
}

async function ensureGlobalSettingsSeed() {
	await GlobalSetting.findOneAndUpdate(
		{ key: 'global' },
		{
			$setOnInsert: {
				key: 'global',
				manualRates: {
					bcv: { value: null, updatedAt: null, updatedBy: '' },
					cop: { value: null, updatedAt: null, updatedBy: '' },
				},
			},
		},
		{
			returnDocument: 'after',
			upsert: true,
		}
	);
}

function emitMenuUpdated(items) {
	const serializedItems = items.map((item) => serializeMenuItem(item));
	io.emit('menu_updated', {
		items: serializedItems,
		categories: buildMenuCategoryMap(serializedItems),
		updatedAt: new Date().toISOString(),
	});
}

function emitStaffStatus(users) {
	io.emit('staff_status_updated', {
		users: users.map((user) => serializeUser(user)),
		updatedAt: new Date().toISOString(),
	});
}

async function broadcastStaffStatus() {
	const users = await User.find().sort({ nombre: 1, usuario: 1 }).lean();
	emitStaffStatus(users);
}

async function setUserOnlineState(userId, isOnline) {
	if (!userId) {
		return null;
	}

	const timestamp = new Date();
	const updatedUser = await User.findByIdAndUpdate(
		userId,
		{
			$set: {
				is_online: isOnline,
				last_seen_at: timestamp,
				...(isOnline ? { last_login_at: timestamp } : {}),
			},
		},
		{
			returnDocument: 'after',
		}
	);

	await broadcastStaffStatus();
	return updatedUser;
}

async function ensureDefaultUsers() {
	await ensureUserCollectionCompatibility();

	for (const candidate of DEFAULT_AUTH_USERS) {
		if (!candidate.usuario || !candidate.contrasena || !candidate.rol) {
			continue;
		}

		const existingUser = await User.findOne({ usuario: candidate.usuario });

		if (existingUser) {
			let needsSave = false;

			if (candidate.nombre && existingUser.nombre !== candidate.nombre) {
				existingUser.nombre = candidate.nombre;
				needsSave = true;
			}

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
			nombre: candidate.nombre || buildDisplayName(candidate.usuario),
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

function authorizeSuperAdmin(req, res, next) {
	const username = String(req.authUser?.usuario || '').trim().toLowerCase();

	if (username !== SUPER_ADMIN_USERNAME) {
		return res.status(403).json({
			ok: false,
			message: 'Solo el super admin puede modificar las tasas.',
		});
	}

	return next();
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

	const userId = String(socket.authUser?.sub || '').trim();

	if (userId) {
		const currentSockets = activeUserSockets.get(userId) || new Set();
		currentSockets.add(socket.id);
		activeUserSockets.set(userId, currentSockets);
		void setUserOnlineState(userId, true);
	}

	socket.on('ENVIAR_PEDIDO', broadcastGlobalOrder);
	socket.on('NUEVO_PEDIDO', broadcastGlobalOrder);
	socket.on('NUEVO_PEDIDO_MESONERO', broadcastGlobalOrder);

	socket.on('disconnect', () => {
		brandLog.info(`Cliente desconectado: ${socket.id}`);

		if (!userId) {
			return;
		}

		const currentSockets = activeUserSockets.get(userId);

		if (!currentSockets) {
			return;
		}

		currentSockets.delete(socket.id);

		if (currentSockets.size === 0) {
			activeUserSockets.delete(userId);
			void setUserOnlineState(userId, false);
			return;
		}

		activeUserSockets.set(userId, currentSockets);
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
		await setUserOnlineState(user._id, true);

		return res.status(200).json({
			ok: true,
			nombre: user.nombre,
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

app.post('/api/logout', async (req, res) => {
	try {
		const authHeader = String(req.headers.authorization || '');
		const [scheme, token] = authHeader.split(' ');

		if (scheme === 'Bearer' && token) {
			const payload = jwt.verify(token, JWT_SECRET);
			const userId = String(payload?.sub || '').trim();

			if (userId && !activeUserSockets.has(userId)) {
				await setUserOnlineState(userId, false);
			}
		}
	} catch (_error) {
		// noop: logout should remain idempotent even with expired tokens
	}

	return res.status(200).json({
		ok: true,
	});
});

app.get('/api/menu', async (_req, res) => {
	try {
		const items = await MenuItem.find({ disponible: true }).sort({ categoria: 1, nombre: 1 });
		const serializedItems = items.map((item) => serializeMenuItem(item));

		return res.json({
			ok: true,
			items: serializedItems,
			categories: buildMenuCategoryMap(serializedItems),
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo cargar el menu.',
			error: error.message,
		});
	}
});

app.get('/api/exchange-rate/today', async (_req, res) => {
	try {
		return res.json(await buildExchangeRateResponse(_req.query?.type));
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo consultar la tasa del dia.',
			error: error.message,
		});
	}
});

app.get('/api/admin/menu', authorizeRoles('admin'), async (_req, res) => {
	try {
		const items = await MenuItem.find().sort({ categoria: 1, nombre: 1 });
		const serializedItems = items.map((item) => serializeMenuItem(item));

		return res.json({
			ok: true,
			items: serializedItems,
			categories: buildMenuCategoryMap(serializedItems),
		});
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo cargar el menu admin.', error: error.message });
	}
});

app.post('/api/admin/menu', authorizeRoles('admin'), async (req, res) => {
	const nombre = String(req.body?.nombre || '').trim();
	const descripcion = String(req.body?.descripcion || '').trim();
	const categoria = String(req.body?.categoria || '').trim();
	const precio = parseCurrency(req.body?.precio);

	if (!nombre || !categoria || !Number.isFinite(precio) || precio < 0) {
		return res.status(400).json({ ok: false, message: 'Debes enviar nombre, categoria y precio validos.' });
	}

	try {
		const createdItem = await MenuItem.create({ nombre, descripcion, categoria, precio });
		const items = await MenuItem.find({ disponible: true }).sort({ categoria: 1, nombre: 1 });
		emitMenuUpdated(items);

		return res.status(201).json({ ok: true, item: serializeMenuItem(createdItem) });
	} catch (error) {
		if (error?.code === 11000) {
			return res.status(409).json({ ok: false, message: 'Ya existe un plato con ese nombre en la categoria.' });
		}

		return res.status(500).json({ ok: false, message: 'No se pudo crear el plato.', error: error.message });
	}
});

app.patch('/api/admin/menu/:id', authorizeRoles('admin'), async (req, res) => {
	const nombre = String(req.body?.nombre || '').trim();
	const descripcion = String(req.body?.descripcion || '').trim();
	const categoria = String(req.body?.categoria || '').trim();
	const precio = parseCurrency(req.body?.precio);

	if (!nombre || !categoria || !Number.isFinite(precio) || precio < 0) {
		return res.status(400).json({ ok: false, message: 'Debes enviar nombre, categoria y precio validos.' });
	}

	try {
		const updatedItem = await MenuItem.findByIdAndUpdate(
			req.params.id,
			{ $set: { nombre, descripcion, categoria, precio } },
			{ returnDocument: 'after', runValidators: true }
		);

		if (!updatedItem) {
			return res.status(404).json({ ok: false, message: 'El plato no existe.' });
		}

		const items = await MenuItem.find({ disponible: true }).sort({ categoria: 1, nombre: 1 });
		emitMenuUpdated(items);

		return res.json({ ok: true, item: serializeMenuItem(updatedItem) });
	} catch (error) {
		if (error?.code === 11000) {
			return res.status(409).json({ ok: false, message: 'Ya existe un plato con ese nombre en la categoria.' });
		}

		return res.status(500).json({ ok: false, message: 'No se pudo editar el plato.', error: error.message });
	}
});

app.delete('/api/admin/menu/:id', authorizeRoles('admin'), async (req, res) => {
	try {
		const deletedItem = await MenuItem.findByIdAndDelete(req.params.id);

		if (!deletedItem) {
			return res.status(404).json({ ok: false, message: 'El plato no existe.' });
		}

		const items = await MenuItem.find({ disponible: true }).sort({ categoria: 1, nombre: 1 });
		emitMenuUpdated(items);

		return res.json({ ok: true, message: 'Plato eliminado.' });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo eliminar el plato.', error: error.message });
	}
});

app.get('/api/admin/users', authorizeRoles('admin'), async (_req, res) => {
	try {
		const users = await User.find().sort({ nombre: 1, usuario: 1 });
		return res.json({ ok: true, users: users.map((user) => serializeUser(user)) });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo cargar el personal.', error: error.message });
	}
});

app.post('/api/admin/users', authorizeRoles('admin'), async (req, res) => {
	const nombre = String(req.body?.nombre || '').trim();
	const usuario = String(req.body?.usuario || '').trim().toLowerCase();
	const contrasena = String(req.body?.contrasena || '').trim();
	const rol = String(req.body?.rol || '').trim().toLowerCase();

	if (!nombre || !usuario || !contrasena || !rol) {
		return res.status(400).json({ ok: false, message: 'Debes completar nombre, usuario, password y rol.' });
	}

	if (!['admin', 'caja', 'mesonero', 'cocina'].includes(rol)) {
		return res.status(400).json({ ok: false, message: 'Rol invalido.' });
	}

	try {
		const existingUser = await User.findOne({ usuario });

		if (existingUser) {
			return res.status(409).json({ ok: false, message: 'El nombre de usuario ya existe.' });
		}

		const createdUser = await User.create({ nombre, usuario, contrasena, rol });
		await broadcastStaffStatus();

		return res.status(201).json({ ok: true, user: serializeUser(createdUser) });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo crear el trabajador.', error: error.message });
	}
});

app.patch('/api/admin/users/:id', authorizeRoles('admin'), async (req, res) => {
	const userId = String(req.params.id || '').trim();
	const nombre = String(req.body?.nombre || '').trim();
	const usuario = String(req.body?.usuario || '').trim().toLowerCase();
	const contrasena = String(req.body?.contrasena || '').trim();
	const rol = String(req.body?.rol || '').trim().toLowerCase();

	if (!userId) {
		return res.status(400).json({ ok: false, message: 'Debes indicar el usuario a editar.' });
	}

	if (!nombre || !usuario || !rol) {
		return res.status(400).json({ ok: false, message: 'Debes completar nombre, usuario y rol.' });
	}

	if (!['admin', 'caja', 'mesonero', 'cocina'].includes(rol)) {
		return res.status(400).json({ ok: false, message: 'Rol invalido.' });
	}

	try {
		const targetUser = await User.findById(userId);

		if (!targetUser) {
			return res.status(404).json({ ok: false, message: 'El trabajador no existe.' });
		}

		const existingUser = await User.findOne({ usuario, _id: { $ne: targetUser._id } });

		if (existingUser) {
			return res.status(409).json({ ok: false, message: 'El nombre de usuario ya existe.' });
		}

		if (targetUser.rol === 'admin' && rol !== 'admin') {
			const totalAdmins = await User.countDocuments({ rol: 'admin' });

			if (totalAdmins <= 1) {
				return res.status(400).json({ ok: false, message: 'Debe quedar al menos un administrador activo.' });
			}
		}

		targetUser.nombre = nombre;
		targetUser.usuario = usuario;
		targetUser.rol = rol;

		if (contrasena) {
			targetUser.contrasena = contrasena;
		}

		await targetUser.save();
		await broadcastStaffStatus();

		return res.json({ ok: true, user: serializeUser(targetUser) });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo editar el trabajador.', error: error.message });
	}
});

app.delete('/api/admin/users/:id', authorizeRoles('admin'), async (req, res) => {
	const userId = String(req.params.id || '').trim();

	if (!userId) {
		return res.status(400).json({ ok: false, message: 'Debes indicar el usuario a eliminar.' });
	}

	if (String(req.authUser?.sub || '') === userId) {
		return res.status(400).json({ ok: false, message: 'No puedes eliminar tu propia sesion de administrador.' });
	}

	try {
		const targetUser = await User.findById(userId);

		if (!targetUser) {
			return res.status(404).json({ ok: false, message: 'El trabajador no existe.' });
		}

		if (targetUser.rol === 'admin') {
			const totalAdmins = await User.countDocuments({ rol: 'admin' });

			if (totalAdmins <= 1) {
				return res.status(400).json({ ok: false, message: 'Debe quedar al menos un administrador activo.' });
			}
		}

		await User.findByIdAndDelete(userId);
		await broadcastStaffStatus();

		return res.json({ ok: true, message: 'Trabajador eliminado.' });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo eliminar el trabajador.', error: error.message });
	}
});

app.get('/api/admin/settings', authorizeRoles('admin'), async (_req, res) => {
	try {
		const [settings, bcv, cop] = await Promise.all([
			getGlobalSettingsDocument(),
			buildExchangeRateResponse('bcv'),
			buildExchangeRateResponse('pesos'),
		]);

		return res.json(buildRateSettingsPayload(settings, { bcv, cop }));
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudieron cargar los ajustes globales.', error: error.message });
	}
});

app.put('/api/admin/settings/rates', authorizeRoles('admin'), authorizeSuperAdmin, async (req, res) => {
	const parsedBcv = req.body?.bcv === '' || req.body?.bcv == null ? null : parseCurrency(req.body?.bcv);
	const parsedCop = req.body?.cop === '' || req.body?.cop == null ? null : parseCurrency(req.body?.cop);

	if ((parsedBcv !== null && (!Number.isFinite(parsedBcv) || parsedBcv <= 0)) || (parsedCop !== null && (!Number.isFinite(parsedCop) || parsedCop <= 0))) {
		return res.status(400).json({ ok: false, message: 'Las tasas manuales deben ser mayores a cero.' });
	}

	try {
		const payload = await updateExchangeRatesForAdmin({
			bcv: parsedBcv,
			cop: parsedCop,
			authUser: req.authUser,
			io,
		});

		return res.json(payload);
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ ok: false, message: error.message });
		}

		return res.status(500).json({ ok: false, message: 'No se pudieron actualizar las tasas manuales.', error: error.message });
	}
});

app.get('/api/admin/reports', authorizeRoles('admin'), async (req, res) => {
	try {
		return res.json(await buildOrdersHistoryResponse(req.query?.range));
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo cargar el dashboard de reportes.', error: error.message });
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

app.put('/api/exchange-rate/today', authorizeRoles('admin'), authorizeSuperAdmin, async (req, res) => {
	const parsedRate = parseCurrency(req.body?.rate);
	const rateType = normalizeRateType(req.query?.type || req.body?.type);
	const { label } = getRateModelByType(rateType);

	if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
		return res.status(400).json({
			ok: false,
			message: `Debes enviar una tasa ${label} valida mayor a cero.`,
		});
	}

	try {
		const payload = await updateExchangeRatesForAdmin({
			bcv: rateType === 'bcv' ? parsedRate : null,
			cop: rateType === 'pesos' ? parsedRate : null,
			authUser: req.authUser,
			io,
		});
		const responseRate = rateType === 'pesos' ? payload.resolvedRates?.cop : payload.resolvedRates?.bcv;

		return res.status(200).json({
			ok: true,
			message: `Tasa ${label} diaria registrada correctamente.`,
			rateType,
			dayKey: responseRate?.dayKey,
			rate: responseRate?.rate,
			timezone: EXCHANGE_RATE_TIMEZONE,
			assignedAt: responseRate?.assignedAt,
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({
				ok: false,
				message: error.message,
			});
		}

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
		return res.json(await buildOrdersHistoryResponse(req.query?.range));
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
		const comandas = await KitchenComanda.find({})
			.sort({ createdAt: -1 })
			.limit(KITCHEN_COMANDA_LIMIT)
			.lean();

		return res.json({
			ok: true,
			orders: comandas
				.map((record) => buildKitchenComandaPayload(record))
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

app.post('/api/kitchen/comandas/print', authorizeRoles('caja', 'admin'), async (req, res) => {
	const orderId = String(req.body?.orderId || '').trim();
	const metodoPago = String(req.body?.metodo || 'efectivo').trim().toUpperCase();

	if (!orderId) {
		return res.status(400).json({ ok: false, message: 'Debes indicar el ID del pedido para imprimir la comanda.' });
	}

	try {
		const order = await Order.findById(orderId);

		if (!order) {
			return res.status(404).json({ ok: false, message: 'El pedido no existe.' });
		}

		if (order.mesa_liberada === true || order.status === ORDER_STATUS.PAID) {
			return res.status(400).json({ ok: false, message: 'La orden ya fue cerrada y no admite comanda.' });
		}

		if (order.comanda_impresa_at) {
			return res.status(200).json({
				ok: true,
				alreadyPrinted: true,
				message: 'La comanda ya fue impresa para esta orden.',
				order,
			});
		}

		if (await isSingleDrinkOnlyOrder(order)) {
			return res.status(400).json({
				ok: false,
				message: 'Una orden de una sola bebida se cobra directo y no genera comanda.',
				soloBebidaSinComanda: true,
			});
		}

		const groupedItems = new Map();

		(order.items || []).forEach((item) => {
			const nombre = String(item?.name || '').trim();
			const cantidad = Number(item?.cantidad || 1);

			if (!nombre || !Number.isFinite(cantidad) || cantidad <= 0) {
				return;
			}

			groupedItems.set(nombre, (groupedItems.get(nombre) || 0) + cantidad);
		});

		const comanda = await KitchenComanda.create({
			orderId: String(order._id),
			numeroMesa: String(order.table || ''),
			pago: metodoPago || 'EFECTIVO',
			items: Array.from(groupedItems.entries()).map(([nombre, cantidad]) => ({ nombre, cantidad })),
			abono: roundCurrency(Number(order.montoPagado || 0)),
			total: roundCurrency(Number(order.total || 0)),
		});

		order.comanda_impresa_at = new Date();

		if (!hasRegisteredPayment(order) && Number(order.montoPagado || 0) < Number(order.total || 0)) {
			order.status = ORDER_STATUS.PENDING;
		}

		await order.save();

		await pruneKitchenComandas(KITCHEN_COMANDA_LIMIT);

		const payload = buildKitchenComandaPayload(comanda);
		io.emit('comanda_impresa', payload);
		emitOrderRealtime('payment_pending', order);

		return res.status(201).json({ ok: true, comanda: payload, order });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo imprimir la comanda.', error: error.message });
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

		const soloBebidaSinComanda = await isSingleDrinkOnlyOrder(order);

		return res.json({
			ok: true,
			order: {
				...(typeof order.toObject === 'function' ? order.toObject() : order),
				soloBebidaSinComanda,
			},
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

		const soloBebidaSinComanda = await isSingleDrinkOnlyOrder(order);

		return res.json({
			ok: true,
			order: {
				...(typeof order.toObject === 'function' ? order.toObject() : order),
				soloBebidaSinComanda,
			},
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
				{ returnDocument: 'after', runValidators: true }
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
				{ returnDocument: 'after' }
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
				returnDocument: 'after',
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
				returnDocument: 'after',
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
			order.status =
				order.status === ORDER_STATUS.DELIVERED
					? ORDER_STATUS.DELIVERED
					: order.status === ORDER_STATUS.PENDING
						? ORDER_STATUS.PENDING
						: ORDER_STATUS.KITCHEN;
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
			returnDocument: 'after',
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
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;
	brandLog.warn(`Recibida senal ${signal}. Cerrando servidor...`);

	try {
		io.close();
	} catch (_error) {
		// noop
	}

	if (!server.listening) {
		try {
			await disconnectMongo();
			process.exit(0);
		} catch (error) {
			brandLog.error(`Error cerrando MongoDB durante ${signal}: ${error.message}`);
			process.exit(1);
		}
		return;
	}

	try {
		await new Promise((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});

		await disconnectMongo();
		process.exit(0);
	} catch (error) {
		brandLog.error(`Error apagando el backend tras ${signal}: ${error.message}`);
		process.exit(1);
	}
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
		await ensureGlobalSettingsSeed();
		await ensureMenuSeed();
		await ensureDefaultUsers();
		await broadcastStaffStatus();

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

		startDailyRateResetJob({
			GlobalSetting,
			brandLog,
			timezone: EXCHANGE_RATE_TIMEZONE,
			onReset: async (resetTimestamp) => {
				io.emit('global_settings_updated', {
					rateControl: {
						isLockedForDay: false,
						lockedDayKey: '',
						lastResetAt: resetTimestamp,
					},
					updatedAt: resetTimestamp.toISOString(),
				});
			},
		});

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
