require('dotenv').config();

const { execFile } = require('child_process');
const os = require('os');
const http = require('http');
const { URL } = require('url');
const chalkModule = require('chalk');
const { addHours, endOfDay, parse, startOfDay } = require('date-fns');
const jwt = require('jsonwebtoken');
const { ensureRateResetOnStartup, ensureDailyRateReset, startDailyRateResetJob } = require('./jobs/resetDailyRateLock');
const { User } = require('./models/User');
const { MenuItem } = require('./models/MenuItem');
const { GlobalSetting } = require('./models/GlobalSetting');
const { Order, ORDER_STATUS, TABLE_DEFINITIONS, TABLES, LEGACY_MENU_NAMES } = require('./models/Order');
const { DailyExchangeRate, DailyPesoRate } = require('./models/DailyRate');
const { buildDisplayName, roundCurrency, parseCurrency, computeOrderTotal, normalizeOrderItem, hasRemovedItems, normalizePaymentMethod, getHistoryDateKey } = require('./lib/helpers');
const { serializeMenuItem, buildMenuCategoryMap, serializeUser } = require('./lib/serializers');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { promisify } = require('util');
const createRoutes = require('./routes');

const chalk = chalkModule.default || chalkModule;

const execFileAsync = promisify(execFile);

const app = express();
const server = http.createServer(app);

// Prefer explicit HOST from env; default to 0.0.0.0 so server is reachable from LAN
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 5000;
const CORS_ALLOW_ALL = true; // Forzar CORS abierto en desarrollo
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
const parsedBaseBcvRate = Number(process.env.RATE_RESET_BASE_BCV);
const parsedBaseCopRate = Number(process.env.RATE_RESET_BASE_COP);
const RATE_RESET_BASE_BCV = Number.isFinite(parsedBaseBcvRate) && parsedBaseBcvRate >= 0 ? parsedBaseBcvRate : 0;
const RATE_RESET_BASE_COP = Number.isFinite(parsedBaseCopRate) && parsedBaseCopRate >= 0 ? parsedBaseCopRate : 0;

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

	const realtimePayload = {
		_id: String(order._id),
		idPedido: String(order._id),
		orderId: String(order._id),
		table: String(order.table || ''),
		numeroMesa: String(order.table || ''),
		mesa: String(order.table || ''),
		status: String(order.status || ORDER_STATUS.KITCHEN).trim().toLowerCase(),
		cliente_nombre: String(order.cliente_nombre || '').trim(),
		mesonero_usuario: String(order.mesonero_usuario || '').trim(),
		seccion: order.seccion || getTableDefinition(order.table)?.section || 'Sala',
		total: Number(order.total || 0),
		items: Array.isArray(order.items)
			? order.items.map((item) => ({
				...normalizeOrderItem(typeof item?.toObject === 'function' ? item.toObject() : item),
			}))
			: [],
		order,
	};

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

	io.emit('ACTUALIZACION_GLOBAL', order);
	io.emit('PEDIDO_GLOBAL', order);
	io.emit('PEDIDO_NUEVO', realtimePayload);
	io.emit('orden_actualizada', payload);

	if (action === 'created') {
		io.emit('CAMBIO_ESTADO_MESA', payload);
		io.emit('mesa_ocupada', payload);
		io.emit('new_order', realtimePayload);
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
	{ nombre: 'LOS WEYES', descripcion: 'Duo de tacos blandos de maiz, pescado tempura, cebollitas estilo de la casa, mayo acevichada y aguacate.', precio: 10, categoria: 'PICOTEO' },
	{ nombre: 'LA LIMENA', descripcion: 'Causa peruana a base de papa, pollo cremoso, tomate cherry y aguacate.', precio: 14, categoria: 'PICOTEO' },
	{ nombre: 'LA ACEVICHADA', descripcion: 'Causa peruana a base de papa con topping de camarones crocantes, mayo acevichada y mousse de aguacate.', precio: 15, categoria: 'PICOTEO' },
	{ nombre: 'EL TRAVIESO', descripcion: 'Ceviche clasico peruano de pesca blanca con leche de tigre.', precio: 17, categoria: 'PICOTEO' },
	{ nombre: 'PONJA', descripcion: 'Ceviche nikkei, pesca blanca en dos texturas, leche de tigre oriental y aguacate.', precio: 17, categoria: 'PICOTEO' },
	{ nombre: 'MOO', descripcion: 'Carpaccio de lomito, aderezo casero, rucula, pan siciliano y nevado de parmesano.', precio: 16, categoria: 'PICOTEO' },
	{ nombre: 'ALI BABA', descripcion: 'Hummus de garbanzo estilo de la casa con pan siciliano.', precio: 8, categoria: 'PICOTEO' },
	{ nombre: 'INDISCRETA', descripcion: 'Burrata, compota de cebolla y bacon, tomates confitados, pesto y pan siciliano.', precio: 15, categoria: 'PICOTEO' },
	{ nombre: 'CAPRICHOSOS', descripcion: 'Mozzarella crocante con compota de tomate.', precio: 6, categoria: 'PICOTEO' },
	{ nombre: '3 CHIFLADOS', descripcion: 'Bombones de pollo crocantes con salsa huancaina.', precio: 6, categoria: 'PICOTEO' },
	{ nombre: 'LAS MALCRIADAS', descripcion: 'Empanadillas de lomo saltado con mayo rocoto.', precio: 6, categoria: 'PICOTEO' },
	{ nombre: 'BONACHONES', descripcion: 'Tender de pollo con papitas crocantes.', precio: 9, categoria: 'PICOTEO' },

	{ nombre: 'PILATOS', descripcion: 'Lechuga romana, aderezo cesar, bacon, pollo crocante, pan siciliano y parmesano.', precio: 11, categoria: 'ENSALADAS' },
	{ nombre: 'ATREVIDA', descripcion: 'Lechuga romana, rucula, hierbabuena, honey mustard, mango, tomates confitados, roast beef y queso.', precio: 13, categoria: 'ENSALADAS' },

	{ nombre: 'MELOSITO', descripcion: 'Risotto a la crema de aji con lomo saltado peruano al estilo de la casa.', precio: 19, categoria: 'ARROCES' },
	{ nombre: 'A LO MACHO', descripcion: 'Arroz cremoso, salsa pomodoro de la casa, camarones picantosos, tomates confitados y parmesano.', precio: 20, categoria: 'ARROCES' },

	{ nombre: 'POPEYE', descripcion: 'Rigatoni al pesto novoandino, tomates confitados y parmesano.', precio: 12, categoria: 'PASTAS' },
	{ nombre: 'EXTRA CAMARON CROCANTE (POPEYE)', descripcion: 'Extra para pasta Popeye.', precio: 6, categoria: 'PASTAS' },
	{ nombre: 'EXTRA POLLO CROCANTE (POPEYE)', descripcion: 'Extra para pasta Popeye.', precio: 5, categoria: 'PASTAS' },
	{ nombre: 'LA SERIA', descripcion: 'Rigatoni en salsa pomodoro al estilo de la casa, bacon y mozzarella gratinada.', precio: 12, categoria: 'PASTAS' },
	{ nombre: 'EXTRA CAMARON CROCANTE (LA SERIA)', descripcion: 'Extra para pasta La Seria.', precio: 6, categoria: 'PASTAS' },
	{ nombre: 'EXTRA POLLO CROCANTE (LA SERIA)', descripcion: 'Extra para pasta La Seria.', precio: 2.5, categoria: 'PASTAS' },

	{ nombre: 'FLAQUITA RICA', descripcion: 'Pan brioche, croqueta de res, queso amarillo, compota de cebolla y tocino, huevo y mayo ahumada.', precio: 11, categoria: 'HAMBURGUESAS Y SANGUCHES' },
	{ nombre: 'MISS COW', descripcion: 'Pan ciabatta, roast beef, rucula, tomates confitados, pesto y mozzarella.', precio: 14, categoria: 'HAMBURGUESAS Y SANGUCHES' },
	{ nombre: 'POLLITA', descripcion: 'Pan brioche, pollo crocante, tomates confitados, cebolla grillada, queso amarillo, rucula y mayo parchita.', precio: 12, categoria: 'HAMBURGUESAS Y SANGUCHES' },
	{ nombre: 'MR PIG', descripcion: 'Pan ciabatta con chicharron, cerdo jugoso, batatas, cebollita y mayo rocoto.', precio: 14, categoria: 'HAMBURGUESAS Y SANGUCHES' },
	{ nombre: 'PITUFINA', descripcion: 'Pan brioche, croqueta de res, queso, tocino y mayo ahumada.', precio: 9.5, categoria: 'HAMBURGUESAS Y SANGUCHES' },
	{ nombre: 'SERVICIO EXTRA DE PAPAS', descripcion: 'Servicio adicional de papas.', precio: 2.5, categoria: 'HAMBURGUESAS Y SANGUCHES' },

	{ nombre: 'ESPRESSO', descripcion: 'Cafe espresso caliente.', precio: 1.5, categoria: 'CALIENTES' },
	{ nombre: 'DOPPIO', descripcion: 'Doble espresso.', precio: 2.5, categoria: 'CALIENTES' },
	{ nombre: 'RISTRETTO', descripcion: 'Cafe corto y concentrado.', precio: 1.5, categoria: 'CALIENTES' },
	{ nombre: 'LUNGO', descripcion: 'Cafe largo.', precio: 2.5, categoria: 'CALIENTES' },
	{ nombre: 'CAPPUCCINO', descripcion: 'Cafe cappuccino.', precio: 2.5, categoria: 'CALIENTES' },
	{ nombre: 'LATTE', descripcion: 'Cafe latte.', precio: 2.5, categoria: 'CALIENTES' },
	{ nombre: 'LATTE VAINILLA', descripcion: 'Cafe latte sabor vainilla.', precio: 2.7, categoria: 'CALIENTES' },
	{ nombre: 'MOCCA', descripcion: 'Cafe moka.', precio: 3.5, categoria: 'CALIENTES' },
	{ nombre: 'IRLANDES', descripcion: 'Cafe irlandes.', precio: 2.5, categoria: 'CALIENTES' },
	{ nombre: 'AMERICANO', descripcion: 'Cafe americano.', precio: 1.5, categoria: 'CALIENTES' },
	{ nombre: 'BOM BOM', descripcion: 'Cafe bom bom.', precio: 3, categoria: 'CALIENTES' },
	{ nombre: 'AFFOGATO', descripcion: 'Cafe con helado.', precio: 3.5, categoria: 'CALIENTES' },
	{ nombre: 'CHOCOLATE', descripcion: 'Chocolate caliente.', precio: 2.7, categoria: 'CALIENTES' },
	{ nombre: 'EXTRA LECHE DE ALMENDRA', descripcion: 'Adicional de leche de almendra.', precio: 0.5, categoria: 'CALIENTES' },
	{ nombre: 'EXTRA LECHE DESLACTOSADA', descripcion: 'Adicional de leche deslactosada.', precio: 0.5, categoria: 'CALIENTES' },

	{ nombre: 'PITUFIMALTEADA', descripcion: 'Helado de algodon de azucar.', precio: 6, categoria: 'MALTEADAS Y MERENGADAS' },
	{ nombre: 'CAPERUCITA', descripcion: 'Leche y helado de frutos rojos.', precio: 6, categoria: 'MALTEADAS Y MERENGADAS' },
	{ nombre: 'CHINAZO', descripcion: 'Malteada especial.', precio: 7, categoria: 'MALTEADAS Y MERENGADAS' },
	{ nombre: 'OREO', descripcion: 'Helado con galleta oreo.', precio: 7, categoria: 'MALTEADAS Y MERENGADAS' },
	{ nombre: 'EUREKA', descripcion: 'Helado, caramelo salado y chantilly.', precio: 6, categoria: 'MALTEADAS Y MERENGADAS' },

	{ nombre: 'EXTRA LICOR DE CAFE', descripcion: 'Adicional para frappuccino.', precio: 0.5, categoria: 'FRAPPUCCINOS' },
	{ nombre: 'SIMPLON', descripcion: 'Espresso helado.', precio: 5, categoria: 'FRAPPUCCINOS' },
	{ nombre: 'ACARAMELADO', descripcion: 'Espresso helado con chantilly.', precio: 6, categoria: 'FRAPPUCCINOS' },
	{ nombre: 'GOLOSO', descripcion: 'Espresso helado con chocolate.', precio: 6, categoria: 'FRAPPUCCINOS' },
	{ nombre: 'ICE COFFEE', descripcion: 'Cafe frio.', precio: 3.5, categoria: 'FRAPPUCCINOS' },
	{ nombre: 'TODDY FRIO', descripcion: 'Bebida fria de cacao.', precio: 5, categoria: 'FRAPPUCCINOS' },

	{ nombre: 'FRAPPE DE FRUTOS ROJOS', descripcion: 'Bebida frappe de frutos rojos.', precio: 4, categoria: 'BEBIDAS' },
	{ nombre: 'FRAPPE PARCHITA', descripcion: 'Bebida frappe de parchita.', precio: 4, categoria: 'BEBIDAS' },
	{ nombre: 'FRAPPE HIERBABUENA', descripcion: 'Bebida frappe de hierbabuena.', precio: 4, categoria: 'BEBIDAS' },
	{ nombre: 'FRAPPE DE FRESA', descripcion: 'Bebida frappe de fresa.', precio: 4, categoria: 'BEBIDAS' },
	{ nombre: 'NESTEA', descripcion: 'Te frio.', precio: 2, categoria: 'BEBIDAS' },
	{ nombre: 'REFRESCO', descripcion: 'Refresco.', precio: 2, categoria: 'BEBIDAS' },
	{ nombre: 'AGUA', descripcion: 'Agua.', precio: 2, categoria: 'BEBIDAS' },
	{ nombre: 'CERVEZA/CHELADAS', descripcion: 'Cerveza o chelada.', precio: 1.5, categoria: 'BEBIDAS' },

	{ nombre: 'TINTO RESTO', descripcion: 'Vino tinto, triple sec, limon, jarabe de goma y cerveza.', precio: 7, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'PETER', descripcion: 'Tequila, curacao blue, limon, hierbabuena y parchita.', precio: 7, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'MARIA LUISA', descripcion: 'Ron blanco, ron coco, curacao blue, hierbabuena, limon y cerveza.', precio: 6, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'FUERA DEL RESTO', descripcion: 'Ron dorado, amaretto, lichuvas, triple sec, limon, miel de gengibre, cerveza y paleta de helado.', precio: 8, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'ISABELITA', descripcion: 'Ron blanco, licor de menta, parchita y cerveza.', precio: 7, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'DONA ROSA', descripcion: 'Vino blanco, gin, limon, soda de limon y frutas.', precio: 7, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'MANUEL ALBERTO', descripcion: 'Ron blanco, vodka, jalea de frutos rojos, limon, jarabe de goma y top de cerveza.', precio: 6, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'CANDY CRUSH', descripcion: 'Vodka, limon, hierbabuena, soda de limon y algodon de azucar.', precio: 6, categoria: 'COCTELES DE LA CASA' },
	{ nombre: '911', descripcion: 'Flameado tequila, licor de cafe y sambuca.', precio: 4, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'DIGESTIVOS', descripcion: 'Limoncello, sambuca, amaretto, licor de cafe y aguardiente.', precio: 3, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'MOJITO', descripcion: 'Coctel mojito.', precio: 5, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'CAIPI', descripcion: 'Coctel caipirinha.', precio: 5, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'MARGARITA', descripcion: 'Coctel margarita.', precio: 7, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'CUBA LIBRE', descripcion: 'Coctel cuba libre.', precio: 5, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'VODKA TONIC', descripcion: 'Coctel vodka tonic.', precio: 6, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'GIN TONIC', descripcion: 'Coctel gin tonic.', precio: 6, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'PINA COLADA', descripcion: 'Coctel pina colada.', precio: 7, categoria: 'COCTELES DE LA CASA' },
	{ nombre: 'DAIQUIRI', descripcion: 'Coctel daiquiri.', precio: 6, categoria: 'COCTELES DE LA CASA' },
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
				'rateControl.isLockedForDay': false,
				'rateControl.lockedDayKey': '',
				'rateControl.lastResetAt': updatedAt,
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

	await ensureDailyRateReset({
		GlobalSetting,
		brandLog,
		timezone: EXCHANGE_RATE_TIMEZONE,
		baseBcvRate: RATE_RESET_BASE_BCV,
		baseCopRate: RATE_RESET_BASE_COP,
	});

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
		canEdit: true,
		assignedAt: dailyRate?.assignedAt ?? manualRate?.updatedAt ?? null,
		assignedBy: dailyRate?.assignedBy ?? manualRate?.updatedBy ?? null,
		manualRate: manualRate?.value ?? null,
		manualUpdatedAt: manualRate?.updatedAt ?? null,
		manualUpdatedBy: manualRate?.updatedBy ?? null,
		isLockedForToday,
	};
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

	if (existingItems === 0) {
		await MenuItem.insertMany(DEFAULT_MENU_ITEMS);
		brandLog.success('Menu inicial cargado en MongoDB.');
		return;
	}

	const hasLegacyMenu = await MenuItem.exists({ nombre: { $in: LEGACY_MENU_NAMES } });

	if (!hasLegacyMenu) {
		return;
	}

	await MenuItem.deleteMany({});
	await MenuItem.insertMany(DEFAULT_MENU_ITEMS);
	brandLog.success('Menu legado reemplazado por el nuevo catalogo de secciones.');
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
	const unauthenticatedGetPaths = ['/menu', '/exchange-rate/today', '/tables/status'];

	if (
		req.path === '/login' ||
		req.path === '/health' ||
		(req.method === 'GET' && unauthenticatedGetPaths.includes(req.path))
	) {
		return next();
	}

	return authenticateRequest(req, res, next);
});

app.use('/api', createRoutes({
	activeUserSockets,
	createAuthToken,
	authorizeRoles,
	authorizeSuperAdmin,
	setUserOnlineState,
	emitMenuUpdated,
	broadcastStaffStatus,
	buildExchangeRateResponse,
	buildOrdersHistoryResponse,
	buildRateSettingsPayload,
	getGlobalSettingsDocument,
	JWT_SECRET,
	JWT_EXPIRES_IN,
	SUPER_ADMIN_USERNAME,
		updateExchangeRatesForAdmin,
	repairReleasedPaidOrdersForTable,
	consolidatePendingOrderForTable,
	isOrderLocked,
	isSingleDrinkOnlyOrder,
	getVisibleTableStatus,
	emitOrderRealtime,
	getTableDefinition,
	buildActiveOrdersFilter,
	io,
}));


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

	io.emit('ACTUALIZACION_GLOBAL', pedido);
	io.emit('PEDIDO_GLOBAL', pedido);
	console.log(`📡 Pedido de Mesa ${tableLabel || 'N/D'} distribuido a todos los módulos`);
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

async function startServer() {
       try {
	       await mongoose.connect(MONGODB_URI);
	       brandLog.success(`MongoDB conectado en ${MONGODB_URI}`);
	       await ensureGlobalSettingsSeed();
	       await ensureMenuSeed();
	       await ensureDefaultUsers();
	       await broadcastStaffStatus();

	       // --- Escuchar puerto ---
	       try {
		       await listenOnConfiguredPort();
	       } catch (error) {
		       if (error.code === 'EADDRINUSE' && AUTO_RECOVER_PORT) {
			       const released = await releaseOccupiedPort(PORT);
			       if (!released) throw error;
			       brandLog.warn(`Puerto ${PORT} liberado. Reintentando arranque del backend...`);
			       await listenOnConfiguredPort();
		       } else {
			       throw error;
		       }
	       }

	       // --- Reseteo de tasas: cron y verificación al iniciar ---
	       startDailyRateResetJob({
		       GlobalSetting,
		       brandLog,
		       timezone: EXCHANGE_RATE_TIMEZONE,
		       baseBcvRate: RATE_RESET_BASE_BCV,
		       baseCopRate: RATE_RESET_BASE_COP,
		       onReset: async (resetTimestamp) => {
			       io.emit('global_settings_updated', {
				       manualRates: {
					       bcv: {
						       value: RATE_RESET_BASE_BCV,
						       updatedAt: resetTimestamp,
						       updatedBy: 'system-cron',
					       },
					       cop: {
						       value: RATE_RESET_BASE_COP,
						       updatedAt: resetTimestamp,
						       updatedBy: 'system-cron',
					       },
				       },
				       rateControl: {
					       isLockedForDay: false,
					       lockedDayKey: '',
					       lastResetAt: resetTimestamp,
				       },
				       updatedAt: resetTimestamp.toISOString(),
			       });
		       },
	       });

	       // --- Verificación automática de reseteo ---
	       try {
		       await ensureRateResetOnStartup({
			       GlobalSetting,
			       brandLog,
			       timezone: EXCHANGE_RATE_TIMEZONE,
			       baseBcvRate: RATE_RESET_BASE_BCV,
			       baseCopRate: RATE_RESET_BASE_COP,
			       onReset: async (resetTimestamp) => {
				       io.emit('global_settings_updated', {
					       manualRates: {
						       bcv: {
							       value: RATE_RESET_BASE_BCV,
							       updatedAt: resetTimestamp,
							       updatedBy: 'system-cron',
						       },
						       cop: {
							       value: RATE_RESET_BASE_COP,
							       updatedAt: resetTimestamp,
							       updatedBy: 'system-cron',
						       },
					       },
					       rateControl: {
						       isLockedForDay: false,
						       lockedDayKey: '',
						       lastResetAt: resetTimestamp,
					       },
					       updatedAt: resetTimestamp.toISOString(),
				       });
			       },
		       });
	       } catch (err) {
		       brandLog.error('[AutoReset] Error verificando reseteo de tasas al iniciar: ' + err.message);
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