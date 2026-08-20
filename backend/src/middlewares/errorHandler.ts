import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const messages = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: messages,
    });
    return;
  }

  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Malformed request bodies (invalid JSON, wrong content-type, etc.) are
  // thrown by express.json()/express.urlencoded() as a SyntaxError with
  // this specific `type` before any route or validator runs. Without this
  // check they'd fall into the generic 500 branch below and, in dev mode,
  // echo the raw body-parser error (byte offset, parser internals) to the
  // client — a 400 with a fixed message is both the correct status and
  // the safe one.
  const bodyParserErr = err as { type?: string; status?: number };
  if (bodyParserErr.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: 'Malformed request body — expected valid JSON.',
    });
    return;
  }

  // Axios / network errors reaching the AI service
  const axiosErr = err as { code?: string; config?: { baseURL?: string } };
  if (
    axiosErr.code === 'ECONNREFUSED' ||
    axiosErr.code === 'ECONNRESET' ||
    axiosErr.code === 'ETIMEDOUT'
  ) {
    res.status(503).json({
      success: false,
      error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً. تأكد من تشغيل خدمة AI ثم أعد المحاولة.',
    });
    return;
  }

  // Unknown / programmer errors
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'),
  });
}
