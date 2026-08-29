import Joi from 'joi';

export const createLicenseSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  providerId: Joi.string().uuid().allow(null).optional(),
  licenseKey: Joi.string().trim().max(300).allow('').optional(),
  seats: Joi.number().integer().min(1).allow(null).optional(),
  expiresAt: Joi.date().iso().allow(null).optional(),
  notes: Joi.string().trim().max(300).allow('').optional(),
});

export const updateLicenseSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  providerId: Joi.string().uuid().allow(null),
  licenseKey: Joi.string().trim().max(300).allow(''),
  seats: Joi.number().integer().min(1).allow(null),
  expiresAt: Joi.date().iso().allow(null),
  notes: Joi.string().trim().max(300).allow(''),
}).min(1);
