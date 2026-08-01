/**
 * Express 4 does not forward a rejected promise to the error handler — an
 * async route that throws would hang the request until the client gave up.
 * Every async handler is wrapped in this.
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
