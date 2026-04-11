const Pedido = require('../models/Pedido');
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const calculateTotal = require('../utils/calculateTotal');
const normalizeMesa = require('../utils/normalizeMesa');

function isValidEstadoPedido(estado) {
  return ['pagado', 'en_cocina', 'entregado'].includes(estado);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureDemoCatalog() {
  const demoProducts = [
    { codigo: 'hamb-cla', nombre: 'Hamburguesa Clasica', categoria: 'Comida', precio: 16, controlStock: false, stock: 0, activo: true },
    { codigo: 'salchi', nombre: 'Salchipapa', categoria: 'Comida', precio: 14, controlStock: false, stock: 0, activo: true },
    { codigo: 'inca-kola', nombre: 'Inca Kola', categoria: 'Bebidas', precio: 5, controlStock: false, stock: 0, activo: true },
    { codigo: 'chicha', nombre: 'Chicha Morada', categoria: 'Bebidas', precio: 6, controlStock: false, stock: 0, activo: true },
    { codigo: 'torta-cho', nombre: 'Torta de Chocolate', categoria: 'Postres', precio: 10, controlStock: false, stock: 0, activo: true }
  ];

  const ensured = [];

  for (const product of demoProducts) {
    // Evita duplicados por indice unico nombre/categoria.
    let existing = await Producto.findOne({
      nombre: new RegExp(`^${escapeRegex(product.nombre)}$`, 'i'),
      categoria: new RegExp(`^${escapeRegex(product.categoria)}$`, 'i')
    });

    if (!existing) {
      existing = await Producto.create(product);
    }

    ensured.push(existing);
  }

  return ensured;
}

async function normalizeItemsAgainstCatalog(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      ok: false,
      message: 'items debe ser un arreglo con contenido'
    };
  }

  const productIds = rawItems
    .map((item) => item.productoId)
    .filter(Boolean);

  const invalidProductId = productIds.find((id) => !mongoose.isValidObjectId(id));
  if (invalidProductId) {
    return {
      ok: false,
      message: `productoId invalido: ${invalidProductId}`
    };
  }

  const itemNames = rawItems
    .map((item) => (item.nombre || '').trim())
    .filter(Boolean)
    .map((name) => name.toLowerCase());

  const [productsById, productsByName] = await Promise.all([
    productIds.length
      ? Producto.find({ _id: { $in: productIds }, activo: true })
      : Promise.resolve([]),
    itemNames.length
      ? Producto.find({
          nombre: { $in: itemNames.map((name) => new RegExp(`^${escapeRegex(name)}$`, 'i')) },
          activo: true
        })
      : Promise.resolve([])
  ]);

  const byIdMap = new Map(productsById.map((p) => [String(p._id), p]));
  const byNameMap = new Map(productsByName.map((p) => [p.nombre.toLowerCase(), p]));

  const normalizedItems = [];
  const notFound = [];

  for (const item of rawItems) {
    const qty = Number(item.cantidad);

    if (!qty || qty < 1) {
      return { ok: false, message: 'Cada item debe tener cantidad mayor o igual a 1' };
    }

    const byId = item.productoId ? byIdMap.get(String(item.productoId)) : null;
    const byName = item.nombre ? byNameMap.get(item.nombre.trim().toLowerCase()) : null;
    const product = byId || byName;

    if (!product) {
      notFound.push(item.productoId || item.nombre || 'item_sin_identificador');
      continue;
    }

    if (product.controlStock && product.stock < qty) {
      return {
        ok: false,
        message: `Stock insuficiente para ${product.nombre}. Disponible: ${product.stock}`
      };
    }

    normalizedItems.push({
      productoId: product._id,
      nombre: product.nombre,
      categoria: product.categoria,
      cantidad: qty,
      precioUnitario: product.precio
    });
  }

  if (notFound.length > 0) {
    return {
      ok: false,
      message: 'Hay items no reconocidos en el catalogo',
      notFound
    };
  }

  return { ok: true, items: normalizedItems };
}

exports.createPedido = async (req, res, next) => {
  try {
    const { mesa, items, estado } = req.body;
    const mesaNormalizada = normalizeMesa(mesa);

    if (!mesaNormalizada || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: 'Debes enviar mesa valida (Mesa 1 a Mesa 5) e items (con al menos un item)'
      });
    }

    if (estado && !isValidEstadoPedido(estado)) {
      return res.status(400).json({ message: 'Estado de pedido invalido' });
    }

    const normalized = await normalizeItemsAgainstCatalog(items);
    if (!normalized.ok) {
      return res.status(400).json({
        message: normalized.message,
        notFound: normalized.notFound || []
      });
    }

    const total = calculateTotal(normalized.items);

    const pedido = await Pedido.create({
      mesa: mesaNormalizada,
      items: normalized.items,
      total,
      estado: estado || 'pagado'
    });

    return res.status(201).json(pedido);
  } catch (error) {
    return next(error);
  }
};

exports.cargarPedidosDemo = async (req, res, next) => {
  try {
    const { cantidad } = req.body || {};
    const requested = Number(cantidad);
    const totalPedidos = Number.isInteger(requested) && requested > 0
      ? Math.min(requested, 10)
      : 4;

    const catalog = await ensureDemoCatalog();
    const byName = new Map(catalog.map((p) => [p.nombre.toLowerCase(), p]));

    const plantillas = [
      {
        mesa: 'Mesa 1',
        items: [
          { nombre: 'Hamburguesa Clasica', cantidad: 2 },
          { nombre: 'Inca Kola', cantidad: 2 }
        ]
      },
      {
        mesa: 'Mesa 2',
        items: [
          { nombre: 'Salchipapa', cantidad: 1 },
          { nombre: 'Chicha Morada', cantidad: 1 }
        ]
      },
      {
        mesa: 'Mesa 3',
        items: [
          { nombre: 'Hamburguesa Clasica', cantidad: 1 },
          { nombre: 'Torta de Chocolate', cantidad: 1 }
        ]
      },
      {
        mesa: 'Mesa 4',
        items: [
          { nombre: 'Salchipapa', cantidad: 2 },
          { nombre: 'Inca Kola', cantidad: 2 }
        ]
      },
      {
        mesa: 'Mesa 5',
        items: [
          { nombre: 'Hamburguesa Clasica', cantidad: 1 },
          { nombre: 'Chicha Morada', cantidad: 2 }
        ]
      }
    ];

    const nuevosPedidos = [];

    for (let i = 0; i < totalPedidos; i += 1) {
      const base = plantillas[i % plantillas.length];
      const items = base.items.map((item) => {
        const product = byName.get(item.nombre.toLowerCase());

        if (!product) {
          throw new Error(`No se encontro producto demo: ${item.nombre}`);
        }

        return {
          productoId: product._id,
          nombre: product.nombre,
          categoria: product.categoria,
          cantidad: item.cantidad,
          precioUnitario: product.precio
        };
      });

      nuevosPedidos.push({
        mesa: base.mesa,
        items,
        total: calculateTotal(items),
        estado: 'pagado'
      });
    }

    const created = await Pedido.insertMany(nuevosPedidos);

    return res.status(201).json({
      message: `${created.length} pedidos demo cargados`,
      pedidos: created
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPedidos = async (_req, res, next) => {
  try {
    const pedidos = await Pedido.find().sort({ createdAt: -1 });
    return res.status(200).json(pedidos);
  } catch (error) {
    return next(error);
  }
};

exports.getPedidoById = async (req, res, next) => {
  try {
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    return res.status(200).json(pedido);
  } catch (error) {
    return next(error);
  }
};

exports.updatePedido = async (req, res, next) => {
  try {
    const { mesa, items, estado } = req.body;

    if (estado && !isValidEstadoPedido(estado)) {
      return res.status(400).json({ message: 'Estado de pedido invalido' });
    }

    const payload = {};

    if (mesa !== undefined) {
      const mesaNormalizada = normalizeMesa(mesa);
      if (!mesaNormalizada) {
        return res.status(400).json({
          message: 'Mesa invalida. Usa formato Mesa 1 a Mesa 5.'
        });
      }
      payload.mesa = mesaNormalizada;
    }
    if (estado) payload.estado = estado;

    if (items) {
      const normalized = await normalizeItemsAgainstCatalog(items);
      if (!normalized.ok) {
        return res.status(400).json({
          message: normalized.message,
          notFound: normalized.notFound || []
        });
      }
      payload.items = normalized.items;
      payload.total = calculateTotal(normalized.items);
    }

    const updated = await Pedido.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

exports.updateEstadoPedido = async (req, res, next) => {
  try {
    const { estado } = req.body;

    if (!isValidEstadoPedido(estado)) {
      return res.status(400).json({ message: 'Estado de pedido invalido' });
    }

    const updated = await Pedido.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

exports.enviarACocina = async (req, res, next) => {
  try {
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    if (pedido.estado !== 'pagado') {
      return res.status(400).json({
        message: 'Solo pedidos pagados pueden enviarse a cocina'
      });
    }

    pedido.estado = 'en_cocina';
    await pedido.save();

    return res.status(200).json(pedido);
  } catch (error) {
    return next(error);
  }
};

exports.marcarEntregado = async (req, res, next) => {
  try {
    const pedido = await Pedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    if (pedido.estado !== 'en_cocina') {
      return res.status(400).json({
        message: 'Solo pedidos en cocina pueden marcarse como entregados'
      });
    }

    const resumen = {
      pedidoId: pedido._id,
      mesa: pedido.mesa,
      total: pedido.total,
      estadoFinal: 'entregado'
    };

    await Pedido.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      message: 'Pedido entregado y eliminado de lista activa',
      data: resumen
    });
  } catch (error) {
    return next(error);
  }
};

exports.deletePedido = async (req, res, next) => {
  try {
    const deleted = await Pedido.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    return res.status(200).json({ message: 'Pedido eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};
