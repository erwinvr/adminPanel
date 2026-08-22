/**
 * utils/asyncHandler.js
 *
 * Express no captura automáticamente las excepciones lanzadas dentro de
 * funciones `async` — una promesa rechazada sin este wrapper se convierte
 * en un proceso colgado o un "unhandled rejection", nunca llega al
 * errorHandler. Envolver cada controller async con esta función evita
 * repetir try/catch en cada uno de ellos.
 *
 * Uso:
 *   router.get('/users', asyncHandler(usersController.list));
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} fn
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
