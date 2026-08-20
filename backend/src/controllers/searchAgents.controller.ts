import { Request, Response } from 'express';
import { AppError } from '../middlewares/errorHandler';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest, SearchAgentInput } from '../types';
import {
  createSearchAgent,
  deleteSearchAgent,
  getCandidateProfileSummary,
  listSearchAgents,
  runSearchAgent,
  updateSearchAgent,
} from '../services/searchAgent.service';
import { enqueueSearchAgentRun } from '../jobs/searchAgentRunQueue';

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
    // status: 'searching' — the agent exists and is about to have its first
    // run enqueued, so callers polling GET /search-agents see it as
    // in-flight immediately rather than momentarily 'idle'.
    const agent = await createSearchAgent(user.id, {
      ...(req.body as SearchAgentInput & { active?: boolean }),
      status: 'searching',
    });

    // Don't await the search here — a full multi-source run (SerpAPI + 4
    // free APIs + a LinkedIn scrape, per location) can take seconds to
    // tens of seconds, and there's no reason "create agent" should block
    // on it. Enqueue it and respond immediately; the worker calls the same
    // runSearchAgent() and leaves the agent at 'ready'/'error' when done —
    // the frontend polls for that transition instead of waiting here.
    enqueueSearchAgentRun({ userId: user.id, agentId: agent.id });

    res.status(201).json({ success: true, data: agent });
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
