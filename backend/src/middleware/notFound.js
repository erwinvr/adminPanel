/**
 * middleware/notFound.js
 *
 * Se monta DESPUÉS de todas las rutas registradas. Si una request llega
 * hasta aquí, ninguna ruta coincidió → convierte eso en un NotFoundError
 * consistente con el resto del formato de errores de la API, en vez de
 * dejar que Express devuelva su HTML de error por defecto.
 */

import { NotFoundError } from '../errors/AppError.js';

export function notFound(req, res, next) {
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}
