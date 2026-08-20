import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../config/database';
import { config } from '../config';
import { signToken } from '../utils/jwt';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest, User } from '../types';

function toPublicUser(user: Pick<User, 'id' | 'name' | 'email' | 'country' | 'city' | 'preferred_language' | 'created_at' | 'updated_at'>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    country: user.country ?? undefined,
    city: user.city ?? undefined,
    preferred_language: user.preferred_language,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, country, city } = req.body;

  const existing = await query<Pick<User, 'id'>>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.length > 0) {
    throw new AppError('A user with this email already exists.', 409);
  }

  const password_hash = await bcrypt.hash(password, 12);
  const id = randomUUID();

  // The SELECT above is a courtesy fast-path (and produces a friendlier
  // 409 in the common case); the real guarantee is the database's unique
  // index on lower(email) (migration 007), which closes the TOCTOU window
  // between that SELECT and this INSERT. If two registrations for the
  // same mailbox race each other, the loser lands here instead — translate
  // Postgres's raw unique-violation (23505) into the same clean 409 rather
  // than letting it fall through to the generic error handler, which would
  // otherwise leak constraint/table internals in the response.
  let rows: User[];
  try {
    rows = await query<User>(
      `INSERT INTO users (id, name, email, password_hash, country, city, preferred_language)
       VALUES ($1, $2, $3, $4, $5, $6, 'ar')
       RETURNING id, name, email, password_hash, country, city, preferred_language, created_at, updated_at`,
      [id, name, email, password_hash, country ?? null, city ?? null],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new AppError('A user with this email already exists.', 409);
    }
    throw err;
  }

  await query(
    `INSERT INTO user_preferences (id, user_id, target_titles, preferred_locations, min_salary, work_type, industries)
     VALUES ($1, $2, '{}', '{}', NULL, NULL, '{}')`,
    [randomUUID(), id],
  );

  const user = rows[0];
  const token = signToken({ id: user.id, email: user.email });

  res.status(201).json({
    success: true,
    data: {
      user: toPublicUser(user),
      token,
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const rows = await query<User>(
    `SELECT id, name, email, password_hash, country, city, preferred_language, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email],
  );

  if (rows.length === 0) {
    throw new AppError('Invalid email or password.', 401);
  }

  const user = rows[0];
  if (!user.password_hash) {
    throw new AppError('This account uses Google sign-in. Please log in with Google.', 401);
  }
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new AppError('Invalid email or password.', 401);
  }

  const token = signToken({ id: user.id, email: user.email });

  res.json({
    success: true,
    data: {
      user: toPublicUser(user),
      token,
    },
  });
});

export const googleAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body;
  if (!code) {
    throw new AppError('Authorization code is required.', 400);
  }

  if (!config.googleClientId || !config.googleClientSecret) {
    throw new AppError('Google OAuth is not configured.', 500);
  }

  const client = new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );

  // Exchange authorization code for tokens
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new AppError('Failed to get ID token from Google.', 400);
  }

  // Verify and decode the ID token
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new AppError('Invalid Google token.', 400);
  }

  const { sub: googleId, name, picture } = payload;
  // Normalized the same way as the register/login schemas so a Google
  // account and a password account for the same mailbox always match.
  const email = payload.email.trim().toLowerCase();

  // Check if user exists by google_id or email
  let rows = await query<User>(
    `SELECT id, name, email, password_hash, country, city, preferred_language, created_at, updated_at
     FROM users WHERE google_id = $1`,
    [googleId],
  );

  let isNewUser = false;

  if (rows.length === 0) {
    // Check if an account with this email exists (link it)
    rows = await query<User>(
      `SELECT id, name, email, password_hash, country, city, preferred_language, created_at, updated_at
       FROM users WHERE email = $1`,
      [email],
    );

    if (rows.length > 0) {
      // Link existing account with Google
      await query('UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2) WHERE id = $3', [
        googleId,
        picture ?? null,
        rows[0].id,
      ]);
    } else {
      // Create new user
      isNewUser = true;
      const id = randomUUID();
      rows = await query<User>(
        `INSERT INTO users (id, name, email, password_hash, google_id, avatar_url, preferred_language)
         VALUES ($1, $2, $3, NULL, $4, $5, 'ar')
         RETURNING id, name, email, password_hash, country, city, preferred_language, created_at, updated_at`,
        [id, name ?? email.split('@')[0], email, googleId, picture ?? null],
      );

      await query(
        `INSERT INTO user_preferences (id, user_id, target_titles, preferred_locations, min_salary, work_type, industries)
         VALUES ($1, $2, '{}', '{}', NULL, NULL, '{}')`,
        [randomUUID(), id],
      );
    }
  }

  const user = rows[0];
  const token = signToken({ id: user.id, email: user.email });

  res.status(isNewUser ? 201 : 200).json({
    success: true,
    data: {
      user: toPublicUser(user),
      token,
      isNewUser,
    },
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    throw new AppError('Authentication required.', 401);
  }

  const rows = await query<User>(
    `SELECT id, name, email, password_hash, country, city, preferred_language, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [authReq.user.id],
  );

  if (rows.length === 0) {
    throw new AppError('User not found.', 404);
  }

  res.json({
    success: true,
    data: toPublicUser(rows[0]),
  });
});
