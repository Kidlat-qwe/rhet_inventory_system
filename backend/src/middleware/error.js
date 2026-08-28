import { AppError } from '../utils/api.js';

export function notFound(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found`));
}

export function errorHandler(error, _req, res, _next) {
  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'An unexpected error occurred';

  if (error.code === '23505') {
    status = 409; code = 'DUPLICATE_RECORD'; message = 'A record with that unique value already exists';
  } else if (error.code === '23503') {
    status = 422; code = 'INVALID_REFERENCE'; message = 'A referenced record does not exist or is still in use';
  } else if (error.code === '23514' || error.code === '22P02') {
    status = 422; code = 'CONSTRAINT_VIOLATION'; message = 'The supplied value violates a data rule';
  } else if (error.code === '42703') {
    status = 503; code = 'SCHEMA_OUT_OF_DATE'; message = 'Database schema is missing required columns. Run backend migrations (041_stock_request_quantity_adjustment.sql or later).';
  }

  if (status >= 500) console.error(error);
  res.status(status).json({
    success: false,
    error: { code, message, ...(error.details && { details: error.details }) },
  });
}
