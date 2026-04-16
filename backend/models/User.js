const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const USER_ROLES = ['cocina', 'caja', 'mesonero'];
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
	{
		usuario: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			lowercase: true,
		},
		contrasena: {
			type: String,
			required: true,
			minlength: 4,
		},
		rol: {
			type: String,
			enum: USER_ROLES,
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

userSchema.pre('save', async function hashPassword() {
	if (!this.isModified('contrasena')) {
		return;
	}

	this.contrasena = await bcrypt.hash(this.contrasena, SALT_ROUNDS);
});

userSchema.methods.validarContrasena = function validarContrasena(plainPassword) {
	return bcrypt.compare(plainPassword, this.contrasena);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = {
	User,
	USER_ROLES,
};
