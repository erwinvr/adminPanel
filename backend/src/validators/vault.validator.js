import Joi from 'joi';

const TYPES = ['application', 'device'];

export const createVaultCredentialSchema = Joi.object({
  type: Joi.string()
    .valid(...TYPES)
    .required(),
  name: Joi.string().trim().min(1).max(200).required(),
  username: Joi.string().trim().max(200).allow('').optional(),
  secret: Joi.string().min(1).max(500).required(),
  notes: Joi.string().trim().max(300).allow('').optional(),
  targetNodeId: Joi.string()
    .uuid()
    .when('type', { is: 'application', then: Joi.required(), otherwise: Joi.forbidden() }),
  targetHardwareId: Joi.string()
    .uuid()
    .when('type', { is: 'device', then: Joi.required(), otherwise: Joi.forbidden() }),
});

// A diferencia del alta, acá no se admite cambiar `type` (ni por lo
// tanto a qué categoría de destino apunta) — retargetear una
// credencial de aplicación a dispositivo (o viceversa) es un caso raro
// y más claro de resolver borrando y creando de nuevo. `secret` es
// opcional: si no viene, se conserva el que ya estaba guardado.
export const updateVaultCredentialSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  username: Joi.string().trim().max(200).allow(''),
  secret: Joi.string().min(1).max(500),
  notes: Joi.string().trim().max(300).allow(''),
  targetNodeId: Joi.string().uuid(),
  targetHardwareId: Joi.string().uuid(),
}).min(1);
