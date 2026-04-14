function normalizeKitchenNote(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

function aggregateKitchenItems(items = []) {
	const groupedItems = new Map();

	items.forEach((item) => {
		const nombre = String(item?.name || item?.nombre || '').trim() || 'Item sin nombre';
		const notas = normalizeKitchenNote(item?.note || item?.notas || item?.observaciones || '');
		const key = `${nombre}::${notas}`;
		const existingItem = groupedItems.get(key);

		if (existingItem) {
			existingItem.cantidad += 1;
			return;
		}

		groupedItems.set(key, {
			nombre,
			cantidad: 1,
			notas,
		});
	});

	return Array.from(groupedItems.values());
}

function sanitizeKitchenOrder(order) {
	if (!order?._id || !order?.table) {
		return null;
	}

	const items = aggregateKitchenItems(order.items || []);
	const notas = Array.from(
		new Set(
			items
				.map((item) => item.notas)
				.filter(Boolean)
		)
	);

	return {
		idPedido: String(order._id),
		numeroMesa: String(order.table),
		items,
		notas,
	};
}

function shouldShowKitchenOrder(order, allowedStatuses = []) {
	if (!order || order.mesa_liberada === true || order.preparedAt) {
		return false;
	}

	const normalizedStatus = String(order.status || '').trim().toLowerCase();
	return allowedStatuses.includes(normalizedStatus);
}

module.exports = {
	sanitizeKitchenOrder,
	shouldShowKitchenOrder,
};