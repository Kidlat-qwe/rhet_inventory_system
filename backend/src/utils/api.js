export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function success(res, data, meta, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta && { meta }) });
}

const camel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [camel(key), camelize(item)]));
  }
  return value;
}
