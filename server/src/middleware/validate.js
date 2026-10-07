import { HttpError } from '../utils/HttpError.js';

// validate(schema, 'body' | 'query') — parses with Zod and replaces the input
// with the cleaned value, or responds 400 with a field-by-field error list.
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new HttpError(400, details[0]?.message || 'Invalid input', details));
  }
  if (source === 'query') req.validatedQuery = result.data;
  else req[source] = result.data;
  return next();
};
