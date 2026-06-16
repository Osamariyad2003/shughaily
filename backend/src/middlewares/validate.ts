import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Returns an Express middleware that validates the specified request property
 * against a Zod schema. On success the parsed (and coerced) data replaces
 * the original value so downstream handlers receive clean, typed data.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      // Forward the ZodError to the global error handler
      next(result.error);
      return;
    }

    // Replace the raw data with the validated & transformed data.
    // In Express 5 req.query is a read-only getter, so skip reassignment for it.
    if (target !== 'query') {
      (req as unknown as Record<string, unknown>)[target] = result.data;
    }
    next();
  };
}
