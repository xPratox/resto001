const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
	{
		nombre: {
			type: String,
			required: true,
			trim: true,
		},
		descripcion: {
			type: String,
			default: '',
			trim: true,
		},
		precio: {
			type: Number,
			required: true,
			min: 0,
		},
		categoria: {
			type: String,
			required: true,
			trim: true,
		},
		disponible: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
	}
);

menuItemSchema.index({ nombre: 1, categoria: 1 }, { unique: true });

const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);

module.exports = {
	MenuItem,
};