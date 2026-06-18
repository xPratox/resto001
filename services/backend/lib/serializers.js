const { buildDisplayName, roundCurrency } = require('./helpers');

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

module.exports = {
  serializeMenuItem,
  buildMenuCategoryMap,
  serializeUser,
};
