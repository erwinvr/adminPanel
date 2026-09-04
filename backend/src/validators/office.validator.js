import Joi from 'joi';

export const createOfficeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).required(),
  address: Joi.string().trim().max(300).allow('').optional(),
});

export const updateOfficeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150),
  address: Joi.string().trim().max(300).allow(''),
}).min(1);
