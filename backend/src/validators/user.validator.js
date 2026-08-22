import Joi from 'joi';

const usernamePattern = /^[a-zA-Z0-9._-]{3,50}$/;

export const createUserSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  username: Joi.string().trim().pattern(usernamePattern).required().messages({
    'string.pattern.base': 'El usuario solo puede contener letras, números, puntos, guiones y guion bajo (3-50 caracteres)',
  }),
  email: Joi.string().trim().email().required(),
  initialPassword: Joi.string().min(12).max(200).required(),
  roleIds: Joi.array().items(Joi.string().uuid()).default([]),
});

export const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100),
  lastName: Joi.string().trim().min(1).max(100),
  email: Joi.string().trim().email(),
  status: Joi.string().valid('active', 'inactive'),
  roleIds: Joi.array().items(Joi.string().uuid()),
}).min(1);

export const listUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).allow('').optional(),
  status: Joi.string().valid('active', 'inactive', 'locked').optional(),
  sortBy: Joi.string().valid('created_at', 'username', 'email', 'last_name', 'status').optional(),
  sortDir: Joi.string().valid('asc', 'desc').optional(),
});
