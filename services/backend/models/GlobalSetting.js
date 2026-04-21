const mongoose = require('mongoose');

const manualRateSchema = new mongoose.Schema(
	{
		value: {
			type: Number,
			default: null,
			min: 0,
		},
		updatedAt: {
			type: Date,
			default: null,
		},
		updatedBy: {
			type: String,
			default: '',
			trim: true,
			lowercase: true,
		},
	},
	{ _id: false }
);

const rateControlSchema = new mongoose.Schema(
	{
		isLockedForDay: {
			type: Boolean,
			default: false,
		},
		lockedDayKey: {
			type: String,
			default: '',
			trim: true,
		},
		lastResetAt: {
			type: Date,
			default: null,
		},
	},
	{ _id: false }
);

const rateHistoryEntrySchema = new mongoose.Schema(
	{
		dayKey: {
			type: String,
			required: true,
			trim: true,
		},
		bcv: {
			type: Number,
			required: true,
			min: 0,
		},
		cop: {
			type: Number,
			required: true,
			min: 0,
		},
		updatedAt: {
			type: Date,
			default: Date.now,
		},
		updatedBy: {
			type: String,
			default: '',
			trim: true,
			lowercase: true,
		},
	},
	{ _id: false }
);

const globalSettingSchema = new mongoose.Schema(
	{
		key: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			default: 'global',
		},
		manualRates: {
			bcv: {
				type: manualRateSchema,
				default: () => ({ value: null, updatedAt: null, updatedBy: '' }),
			},
			cop: {
				type: manualRateSchema,
				default: () => ({ value: null, updatedAt: null, updatedBy: '' }),
			},
		},
		rateControl: {
			type: rateControlSchema,
			default: () => ({
				isLockedForDay: false,
				lockedDayKey: '',
				lastResetAt: null,
			}),
		},
		rateHistory: {
			type: [rateHistoryEntrySchema],
			default: () => [],
		},
	},
	{
		timestamps: true,
	}
);

const GlobalSetting =
	mongoose.models.GlobalSetting || mongoose.model('GlobalSetting', globalSettingSchema);

module.exports = {
	GlobalSetting,
};