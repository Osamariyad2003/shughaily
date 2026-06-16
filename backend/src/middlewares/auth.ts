import { Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler';
import { AuthRequest } from '../types';

/**
 * JWT authentication middleware.
 * Expects header: Authorization: Bearer <token>
 */
export function authenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Authentication required. Please provide a valid token.', 401);
  }

  const token = header.slice(7);

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.id,
      email: payload.email,
    };
    next();
  } catch {
    throw new AppError('Invalid or expired token.', 401);
  }
}

/**
 * Role-based authorization middleware. Must be used after `authenticate`.
 */
export function authorize(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    const userWithRole = req.user as AuthRequest['user'] & { role?: string };
    if (roles.length > 0 && (!userWithRole.role || !roles.includes(userWithRole.role))) {
      throw new AppError('You do not have permission to perform this action.', 403);
    }
    next();
  };
}
