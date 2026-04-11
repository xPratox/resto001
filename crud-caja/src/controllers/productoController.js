const Producto = require('../models/Producto');

exports.createProducto = async (req, res, next) => {
  try {
    const { codigo, nombre, categoria, precio, controlStock, stock, activo } = req.body;

    if (!nombre || !categoria || precio === undefined) {
      return res.status(400).json({
        message: 'Debes enviar nombre, categoria y precio'
      });
    }

    const producto = await Producto.create({
      codigo,
      nombre,
      categoria,
      precio,
      controlStock: Boolean(controlStock),
      stock: stock ?? 0,
      activo: activo ?? true
    });

    return res.status(201).json(producto);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Ya existe un producto con el mismo codigo o nombre/categoria'
      });
    }
    return next(error);
  }
};

exports.getProductos = async (req, res, next) => {
  try {
    const { categoria, activo } = req.query;

    const filter = {};
    if (categoria) filter.categoria = categoria;
    if (activo !== undefined) filter.activo = activo === 'true';

    const productos = await Producto.find(filter).sort({ categoria: 1, nombre: 1 });
    return res.status(200).json(productos);
  } catch (error) {
    return next(error);
  }
};

exports.getCategorias = async (_req, res, next) => {
  try {
    const categorias = await Producto.distinct('categoria', { activo: true });
    categorias.sort((a, b) => a.localeCompare(b));
    return res.status(200).json(categorias);
  } catch (error) {
    return next(error);
  }
};

exports.getProductoById = async (req, res, next) => {
  try {
    const producto = await Producto.findById(req.params.id);

    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    return res.status(200).json(producto);
  } catch (error) {
    return next(error);
  }
};

exports.updateProducto = async (req, res, next) => {
  try {
    const updated = await Producto.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Ya existe un producto con el mismo codigo o nombre/categoria'
      });
    }
    return next(error);
  }
};

exports.updateStock = async (req, res, next) => {
  try {
    const { stock } = req.body;

    if (stock === undefined || Number.isNaN(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({ message: 'Debes enviar un stock valido (>= 0)' });
    }

    const updated = await Producto.findByIdAndUpdate(
      req.params.id,
      { stock: Number(stock) },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
};

exports.deleteProducto = async (req, res, next) => {
  try {
    const deleted = await Producto.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    return res.status(200).json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};
