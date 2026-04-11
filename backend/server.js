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
	allowedHeaders: ['Content-Type', 'Authorization'],
};

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resto001';
const HISTORY_TIMEZONE = process.env.HISTORY_TIMEZONE || 'America/Caracas';
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

const brandLog = {
	info: (message) => console.log(chalk.hex('#F8FAFC').bgHex('#0F172A')(` ${message} `)),
	warn: (message) => console.warn(chalk.hex('#FF6B35')(`▲ ${message}`)),
	error: (message) => console.error(chalk.hex('#EF4444')(`■ ${message}`)),
	success: (message) => console.log(chalk.hex('#10B981')(`● ${message}`)),
};

function getTableDefinition(tableName) {
	return TABLE_DEFINITIONS.find((table) => table.table === tableName) || null;
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
		seccion: order.seccion || getTableDefinition(order.table)?.section || 'Sala',
		cliente_nombre: order.cliente_nombre || '',
		order,
	};

	io.emit('orden_actualizada', payload);

	if (action === 'created') {
		io.emit('new_order', order);
		return;
	}

	if (action === 'deleted') {
		io.emit('order_deleted', payload);
		return;
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
	const duplicateIds = pendingOrders.slice(1).map((order) => order._id);

	const updatedPrimaryOrder = await Order.findOneAndUpdate(
		{ _id: primaryOrder._id },
		{
			$set: {
				items: mergedItems,
				total: mergedTotal,
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
		status: { type: String, default: 'pendiente', trim: true },
		hora_pago: { type: Date, default: null },
		mesa_liberada: { type: Boolean, default: false },
	},
	{
		timestamps: true,
	}
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

function getHistoryDateKey(date) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: HISTORY_TIMEZONE,
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
				status: 'pagado',
			},
		},
		{
			$addFields: {
				reportDateSource: {
					$ifNull: ['$hora_pago', '$updatedAt'],
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
							paidOrdersCount: {
								$sum: 1,
							},
							totalRevenue: {
								$sum: '$total',
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
							paidOrdersCount: 1,
							totalRevenue: {
								$round: ['$totalRevenue', 2],
							},
						},
					},
				],
				orders: [
					{
						$project: {
							_id: 1,
							table: 1,
							cliente_nombre: 1,
							status: 1,
							hora_pago: '$reportDateSource',
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

app.get('/api/tables/status', async (req, res) => {
	try {
		await Promise.all(TABLES.map((table) => consolidatePendingOrderForTable(table)));

		const activeOrders = await Order.find({
			table: { $in: TABLES },
			$or: [
				{ status: { $ne: 'pagado' } },
				{ status: 'pagado', mesa_liberada: { $ne: true } },
			],
		}).sort({ createdAt: -1 });

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
				status: activeOrder?.status || 'disponible',
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
		const orders = history?.orders || [];
		const todayKey = getHistoryDateKey(new Date());
		const daySummary =
			summaryByDay.find((summary) => summary.reportDate === todayKey) || {
				reportDate: todayKey,
				paidOrdersCount: 0,
				totalRevenue: 0,
			};

		return res.json({
			ok: true,
			timezone: HISTORY_TIMEZONE,
			totalPaidOrders: orders.length,
			daySummary,
			summaryByDay,
			orders,
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
		const consolidatedPendingOrder = await consolidatePendingOrderForTable(req.params.table);

		const order =
			consolidatedPendingOrder ||
			(await Order.findOne({
			table: req.params.table,
			$or: [
				{ status: { $ne: 'pagado' } },
				{ status: 'pagado', mesa_liberada: { $ne: true } },
			],
		}).sort({ createdAt: -1 }));

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
	const { table, items, status, cliente_nombre, seccion } = req.body;

	if (!table || !Array.isArray(items) || items.length === 0) {
		return res.status(400).json({
			ok: false,
			message: 'La mesa y los items son obligatorios.',
		});
	}

	try {
		const tableDefinition = getTableDefinition(table);

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
		const pendingOrder = await consolidatePendingOrderForTable(table);

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
							},
						}
						: {
							$set: {
								seccion: normalizedSection,
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

		const existingActiveOrder = await Order.findOne({
			table,
			$or: [
				{ status: { $ne: 'pagado' } },
				{ status: 'pagado', mesa_liberada: { $ne: true } },
			],
		}).sort({ createdAt: -1 });

		if (existingActiveOrder) {
			return res.status(400).json({
				ok: false,
				message: 'La mesa ya tiene un pedido activo',
				order: existingActiveOrder,
			});
		}

		const order = await Order.create({
			table,
			cliente_nombre: normalizedClientName,
			seccion: normalizedSection,
			items: normalizedItems,
			total: itemsTotal,
			status: status || 'pendiente',
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
			if (order.status === 'pagado') {
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

		if (order.status === 'pagado') {
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

		if (order.status === 'pagado') {
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
					status: 'pendiente',
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
	const { items } = req.body ?? {};

	try {
		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		if (order.status === 'pagado') {
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

		order.seccion = order.seccion || getTableDefinition(order.table)?.section || 'Sala';
		order.total = computeOrderTotal(order.items ?? []);
		order.status = 'pagado';
		order.hora_pago = new Date();
		order.mesa_liberada = false;
		await order.save();

		emitOrderRealtime('paid', order);

		return res.json({
			ok: true,
			message: `${order.table} cobrada. Pendiente liberacion manual en mesonero.`,
			order,
		});
	} catch (error) {
		return res.status(400).json({
			ok: false,
			message: error.message || 'No se pudo procesar el pago.',
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

		if (order.status !== 'pagado') {
			return res.status(400).json({
				ok: false,
				message: 'Solo puedes liberar mesas de ordenes pagadas.',
			});
		}

		if (order.mesa_liberada === true) {
			return res.status(400).json({
				ok: false,
				message: 'La mesa ya se encuentra liberada.',
			});
		}

		order.mesa_liberada = true;
		await order.save();

		emitOrderRealtime('table_released', order);

		return res.json({
			ok: true,
			message: `${order.table} liberada manualmente.`,
			order,
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
