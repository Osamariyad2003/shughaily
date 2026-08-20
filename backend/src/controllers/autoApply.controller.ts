import { Request, Response } from 'express';
import { AppError } from '../middlewares/errorHandler';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest, AutoApplySettingsInput } from '../types';
import {
  getAutoApplySettings,
  previewAutoApplySettingsUpdate,
  updateAutoApplySettings,
} from '../services/autoApplySettings.service';

function requireUser(req: Request): { id: string } {
  const authReq = req as AuthRequest;
  if (!authReq.user) throw new AppError('Authentication required.', 401);
  return authReq.user;
}

export const getAutoApplySettingsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const settings = await getAutoApplySettings(user.id);
  res.json({ success: true, data: settings });
});

export const updateAutoApplySettingsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const input = req.body as AutoApplySettingsInput;

  const next = await previewAutoApplySettingsUpdate(user.id, input);

  // Safety rail (requirement 6): real sending can only be authorized once
  // the user has explicitly completed the first-send review confirmation.
  // This is the enforcement point — no request can flip dry_run to false
  // without reviewed_first_send already being (or simultaneously becoming)
  // true, regardless of what the client sends.
  if (next.dry_run === false && !next.reviewed_first_send) {
    throw new AppError(
      'Turning off dry-run requires the first-send review confirmation. Set reviewed_first_send to true first.',
      400,
    );
  }

  const settings = await updateAutoApplySettings(user.id, next);
  res.json({ success: true, data: settings });
});
