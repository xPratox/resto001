const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const { MenuItem } = require('../models/MenuItem');
const { GlobalSetting } = require('../models/GlobalSetting');
const { AuditLog } = require('../models/AuditLog');
const { Order, ORDER_STATUS, TABLES, TABLE_DEFINITIONS } = require('../models/Order');
const { DailyExchangeRate, DailyPesoRate } = require('../models/DailyRate');
const { buildDisplayName, roundCurrency, parseCurrency, computeOrderTotal, normalizeOrderItem, hasRemovedItems, normalizePaymentMethod, getHistoryDateKey } = require('../lib/helpers');
const { logAuditEvent } = require('../lib/audit');
const { serializeMenuItem, buildMenuCategoryMap, serializeUser } = require('../lib/serializers');
const mongoose = require('mongoose');

module.exports = function createRoutes(deps) {
	const router = express.Router();
	const {
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
		updateExchangeRatesForAdmin,
		getGlobalSettingsDocument,
		JWT_SECRET,
		JWT_EXPIRES_IN,
		SUPER_ADMIN_USERNAME,
		repairReleasedPaidOrdersForTable,
		consolidatePendingOrderForTable,
		isOrderLocked,
		isSingleDrinkOnlyOrder,
		getVisibleTableStatus,
		emitOrderRealtime,
		getTableDefinition,
		buildActiveOrdersFilter,
		io,
	} = deps;

const loginHandler = async (req, res) => {
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
};

router.post('/login', loginHandler);
router.post('/users/login', loginHandler);

router.get('/health', (req, res) => {
	res.json({
		ok: true,
		mongoState: mongoose.connection.readyState,
	});
});

router.post('/logout', async (req, res) => {
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

router.get('/menu', async (_req, res) => {
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

router.get('/exchange-rate/today', async (_req, res) => {
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

router.get('/admin/menu', authorizeRoles('admin'), async (_req, res) => {
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

router.post('/admin/menu', authorizeRoles('admin'), async (req, res) => {
	const nombre = String(req.body?.nombre || '').trim();
	const descripcion = String(req.body?.descripcion || '').trim();
	const categoria = String(req.body?.categoria || '').trim();
	const precio = parseCurrency(req.body?.precio);

	if (!nombre || !categoria || !Number.isFinite(precio) || precio < 0) {
		return res.status(400).json({ ok: false, message: 'Debes enviar nombre, categoria y precio validos.' });
	}

	try {
		const createdItem = await MenuItem.create({ nombre, descripcion, categoria, precio });
		await logAuditEvent({
			authUser: req.authUser,
			action: 'MENU_CREATE',
			resourceType: 'MenuItem',
			resourceId: String(createdItem._id),
			metadata: { nombre: createdItem.nombre, categoria: createdItem.categoria },
		});
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

router.patch('/admin/menu/:id', authorizeRoles('admin'), async (req, res) => {
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

		await logAuditEvent({
			authUser: req.authUser,
			action: 'MENU_UPDATE',
			resourceType: 'MenuItem',
			resourceId: String(updatedItem._id),
			metadata: { nombre: updatedItem.nombre, categoria: updatedItem.categoria },
		});

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

router.delete('/admin/menu/:id', authorizeRoles('admin'), async (req, res) => {
	try {
		const deletedItem = await MenuItem.findByIdAndDelete(req.params.id);

		if (!deletedItem) {
			return res.status(404).json({ ok: false, message: 'El plato no existe.' });
		}

		await logAuditEvent({
			authUser: req.authUser,
			action: 'MENU_DELETE',
			resourceType: 'MenuItem',
			resourceId: String(deletedItem._id),
			metadata: { nombre: deletedItem.nombre, categoria: deletedItem.categoria },
		});

		const items = await MenuItem.find({ disponible: true }).sort({ categoria: 1, nombre: 1 });
		emitMenuUpdated(items);

		return res.json({ ok: true, message: 'Plato eliminado.' });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo eliminar el plato.', error: error.message });
	}
});

router.get('/admin/users', authorizeRoles('admin'), async (_req, res) => {
	try {
		const users = await User.find().sort({ nombre: 1, usuario: 1 });
		return res.json({ ok: true, users: users.map((user) => serializeUser(user)) });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo cargar el personal.', error: error.message });
	}
});

router.post('/admin/users', authorizeRoles('admin'), async (req, res) => {
	const nombre = String(req.body?.nombre || '').trim();
	const usuario = String(req.body?.usuario || '').trim().toLowerCase();
	const contrasena = String(req.body?.contrasena || '').trim();
	const rol = String(req.body?.rol || '').trim().toLowerCase();

	if (!nombre || !usuario || !contrasena || !rol) {
		return res.status(400).json({ ok: false, message: 'Debes completar nombre, usuario, password y rol.' });
	}

	if (!['admin', 'caja', 'mesonero'].includes(rol)) {
		return res.status(400).json({ ok: false, message: 'Rol invalido.' });
	}

	try {
		const existingUser = await User.findOne({ usuario });

		if (existingUser) {
			return res.status(409).json({ ok: false, message: 'El nombre de usuario ya existe.' });
		}

		const createdUser = await User.create({ nombre, usuario, contrasena, rol });
		await broadcastStaffStatus();
		await logAuditEvent({
			authUser: req.authUser,
			action: 'USER_CREATE',
			resourceType: 'User',
			resourceId: String(createdUser._id),
			metadata: { nombre: createdUser.nombre, usuario: createdUser.usuario, rol: createdUser.rol },
		});

		return res.status(201).json({ ok: true, user: serializeUser(createdUser) });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo crear el trabajador.', error: error.message });
	}
});

router.patch('/admin/users/:id', authorizeRoles('admin'), async (req, res) => {
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

	if (!['admin', 'caja', 'mesonero'].includes(rol)) {
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
		await logAuditEvent({
			authUser: req.authUser,
			action: 'USER_UPDATE',
			resourceType: 'User',
			resourceId: String(targetUser._id),
			metadata: { nombre: targetUser.nombre, usuario: targetUser.usuario, rol: targetUser.rol },
		});

		return res.json({ ok: true, user: serializeUser(targetUser) });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo editar el trabajador.', error: error.message });
	}
});

router.delete('/admin/users/:id', authorizeRoles('admin'), async (req, res) => {
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
		await logAuditEvent({
			authUser: req.authUser,
			action: 'USER_DELETE',
			resourceType: 'User',
			resourceId: userId,
		});

		return res.json({ ok: true, message: 'Trabajador eliminado.' });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo eliminar el trabajador.', error: error.message });
	}
});

router.get('/admin/settings', authorizeRoles('admin'), async (_req, res) => {
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

router.put('/admin/settings/rates', authorizeRoles('admin'), async (req, res) => {
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

		await logAuditEvent({
			authUser: req.authUser,
			action: 'RATES_UPDATE',
			resourceType: 'GlobalSettings',
			resourceId: 'rates',
			metadata: { bcv: parsedBcv, cop: parsedCop },
		});

		return res.json(payload);
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ ok: false, message: error.message });
		}

		return res.status(500).json({ ok: false, message: 'No se pudieron actualizar las tasas manuales.', error: error.message });
	}
});

router.get('/admin/audit-logs', authorizeRoles('admin'), async (req, res) => {
	const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 50)));

	try {
		const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
		return res.json({ ok: true, logs });
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo cargar la bitácora de auditoría.', error: error.message });
	}
});

router.get('/admin/reports', authorizeRoles('admin'), async (req, res) => {
	try {
		return res.json(await buildOrdersHistoryResponse(req.query?.range));
	} catch (error) {
		return res.status(500).json({ ok: false, message: 'No se pudo cargar el dashboard de reportes.', error: error.message });
	}
});

router.get('/stats/ventas', async (req, res) => {
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

router.put('/exchange-rate/today', authorizeRoles('admin'), async (req, res) => {
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

router.post('/tasa/reset', authorizeRoles('admin'), async (req, res) => {
	const now = new Date();
	const dayKey = getHistoryDateKey(now, EXCHANGE_RATE_TIMEZONE);

	try {
		await Promise.all([
			GlobalSetting.updateMany(
				{},
				{
					$set: {
						'manualRates.bcv.value': 0,
						'manualRates.bcv.updatedAt': now,
						'manualRates.bcv.updatedBy': 'admin-reset',
						'manualRates.cop.value': 0,
						'manualRates.cop.updatedAt': now,
						'manualRates.cop.updatedBy': 'admin-reset',
						'rateControl.isLockedForDay': false,
						'rateControl.lockedDayKey': '',
						'rateControl.lastResetAt': now,
					},
				}
			),
			DailyExchangeRate.deleteMany({ dayKey }),
			DailyPesoRate.deleteMany({ dayKey }),
		]);

		io.emit('tasa_actualizada', {
			rateType: 'bcv',
			dayKey,
			rate: 0,
			timezone: EXCHANGE_RATE_TIMEZONE,
			assignedAt: now,
		});

		io.emit('tasa_actualizada', {
			rateType: 'pesos',
			dayKey,
			rate: 0,
			timezone: EXCHANGE_RATE_TIMEZONE,
			assignedAt: now,
		});

		io.emit('global_settings_updated', {
			manualRates: {
				bcv: {
					value: 0,
					updatedAt: now,
					updatedBy: 'admin-reset',
				},
				cop: {
					value: 0,
					updatedAt: now,
					updatedBy: 'admin-reset',
				},
			},
			rateControl: {
				isLockedForDay: false,
				lockedDayKey: '',
				lastResetAt: now,
			},
			updatedAt: now.toISOString(),
		});

		return res.status(200).json({
			ok: true,
			message: 'Tasa reiniciada a 0 correctamente.',
			rate: 0,
			dayKey,
			updatedAt: now.toISOString(),
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo reiniciar la tasa.',
			error: error.message,
		});
	}
});

router.delete('/exchange-rate/today', async (req, res) => {
	return res.status(403).json({
		ok: false,
		message: 'Acceso denegado: La tasa ya fue fijada para hoy',
	});
});

router.get('/tables/status', async (req, res) => {
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

router.get('/orders/history', authorizeRoles('caja'), async (req, res) => {
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

router.get('/orders/:id', authorizeRoles('mesonero', 'caja'), async (req, res) => {
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

router.get('/orders/active/table/:table', authorizeRoles('mesonero', 'caja'), async (req, res) => {
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

router.post('/kitchen/comandas/print', authorizeRoles('caja'), async (req, res) => {
	const { orderId, metodo } = req.body ?? {};

	if (!orderId) {
		return res.status(400).json({
			ok: false,
			message: 'Debes indicar el orderId para imprimir la comanda.',
		});
	}

	try {
		const order = await Order.findById(orderId);

		if (!order) {
			return res.status(404).json({
				ok: false,
				message: 'La orden no existe.',
			});
		}

		const soloBebidaSinComanda = await isSingleDrinkOnlyOrder(order);

		if (soloBebidaSinComanda) {
			return res.status(400).json({
				ok: false,
				message: 'Una sola bebida se cobra directo y no genera comanda.',
			});
		}

		const updatedOrder = await Order.findByIdAndUpdate(
			orderId,
			{ comanda_impresa_at: new Date() },
			{ returnDocument: 'after', runValidators: true }
		);

		return res.json({
			ok: true,
			message: 'Comanda registrada para impresion.',
			order: updatedOrder,
		});
	} catch (error) {
		return res.status(500).json({
			ok: false,
			message: 'No se pudo procesar la impresion de la comanda.',
			error: error.message,
		});
	}
});

router.post('/orders', authorizeRoles('mesonero'), async (req, res) => {
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
			message: 'Pedido registrado',
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

router.patch('/orders/:id/modify', authorizeRoles('mesonero'), async (req, res) => {
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
				throw new Error('Solo se pueden cancelar items en pedidos pendientes.');
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

router.patch('/orders/:id/update-items', authorizeRoles('mesonero'), async (req, res) => {
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
			throw new Error('La orden esta en estado pendiente. Para eliminar items necesitas autorizacion.');
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

router.patch('/orders/:id/sync', authorizeRoles('mesonero'), async (req, res) => {
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
					// Al sincronizar desde mesonero, invalidar marca de comanda impresa
					comanda_impresa_at: null,
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

router.patch('/orders/:id/pay', authorizeRoles('caja'), async (req, res) => {
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

router.patch('/tables/:id/liberar', authorizeRoles('mesonero', 'caja'), async (req, res) => {
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

router.patch('/orders/:id/release-table', authorizeRoles('mesonero', 'caja'), async (req, res) => {
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

router.delete('/orders/:id', authorizeRoles('mesonero'), async (req, res) => {
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


	return router;
};
