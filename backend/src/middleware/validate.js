import { AppError } from '../utils/api.js';

export const validate = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!parsed.success) {
    return next(new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', parsed.error.flatten()));
  }
  req.validated = parsed.data;
  next();
};
