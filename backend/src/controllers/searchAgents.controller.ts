import { Request, Response } from 'express';
import { AppError } from '../middlewares/errorHandler';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest, SearchAgentInput } from '../types';
import {
  buildSearchAgentQueryPlan,
  createSearchAgent,
  deleteSearchAgent,
  getCandidateProfileSummary,
  getSearchAgent,
  listSearchAgents,
  runSearchAgent,
  updateSearchAgent,
} from '../services/searchAgent.service';

function requireUser(req: Request): { id: string; email: string } {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    throw new AppError('Authentication required.', 401);
  }

  return authReq.user;
}

export const getSearchAgents = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const agents = await listSearchAgents(user.id);
  res.json({ success: true, data: agents });
});

export const createSearchAgentController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const agent = await createSearchAgent(user.id, req.body as SearchAgentInput & { active?: boolean });

    // Kick off an immediate run so the new agent shows real stats instead of 0/0.
    // Swallow errors here — the agent exists, the run can be retried manually.
    let freshAgent = agent;
    try {
      const runResult = await runSearchAgent(user.id, agent.id);
      if (runResult) freshAgent = runResult.agent;
    } catch (err) {
      console.error('[createSearchAgent] initial run failed:', (err as Error).message);
    }

    res.status(201).json({ success: true, data: freshAgent });
  },
);

export const runSearchAgentController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await runSearchAgent(user.id, id);

    if (!result) {
      throw new AppError('Search agent not found.', 404);
    }

    res.json({ success: true, data: result });
  },
);

export const updateSearchAgentController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const agent = await updateSearchAgent(
      user.id,
      id,
      req.body as Partial<SearchAgentInput & { active?: boolean }>,
    );

    if (!agent) {
      throw new AppError('Search agent not found.', 404);
    }

    res.json({ success: true, data: agent });
  },
);

export const deleteSearchAgentController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = await deleteSearchAgent(user.id, id);

    if (!deleted) {
      throw new AppError('Search agent not found.', 404);
    }

    res.json({ success: true, message: 'Search agent deleted successfully.' });
  },
);

export const getCandidateProfileSummaryController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const summary = await getCandidateProfileSummary(user.id);
    res.json({ success: true, data: summary });
  },
);

export const getSearchAgentQueryPlanController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const agent = await getSearchAgent(user.id, id);

    if (!agent) {
      throw new AppError('Search agent not found.', 404);
    }

    const profile = await getCandidateProfileSummary(user.id);
    const plan = buildSearchAgentQueryPlan(agent, profile);
    res.json({ success: true, data: plan });
  },
);
