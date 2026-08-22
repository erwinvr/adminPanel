import Joi from 'joi';

export const loginSchema = Joi.object({
  identifier: Joi.string().trim().min(1).max(255).required(), // username o email
  password: Joi.string().min(1).max(200).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).max(200).required(),
  newPassword: Joi.string().min(12).max(200).required(),
});

export const requestPasswordResetSchema = Joi.object({
  email: Joi.string().trim().email().required(),
});

export const confirmPasswordResetSchema = Joi.object({
  token: Joi.string().min(10).required(),
  newPassword: Joi.string().min(12).max(200).required(),
});
