// ========= Proposal Engine =========
// Creates proposals during task runs and executes them on approval.

import { createProposal, updateProposal, getProposal } from '../services/supabase/tasks.mjs';
import { executeTool } from '../chat/toolExecutor.mjs';

/**
 * Create a proposal for a high-risk action.
 */
export async function propose(supabase, userId, data) {
  return createProposal(supabase, userId, {
    task_id: data.task_id,
    run_id: data.run_id,
    step_id: data.step_id || null,
    proposal_type: 'single_action',
    title: data.title,
    reasoning: data.reasoning,
    execution_plan: {
      actions: data.actions || [{ tool: data.tool, args: data.args }],
    },
  });
}

/**
 * Approve and execute a proposal.
 * Supports $ref resolution for patch_bundle type.
 */
export async function approve(supabase, userId, proposalId) {
  const proposal = await getProposal(supabase, userId, proposalId);
  if (!proposal) throw new Error('Proposal not found');
  if (proposal.status !== 'pending') throw new Error(`Proposal status is ${proposal.status}`);

  const actions = proposal.execution_plan?.actions || [];
  if (actions.length === 0) throw new Error('Proposal has no actions');

  const ctx = { supabase, userId };
  const results = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    // Resolve $ref references
    const resolvedArgs = resolveRefs(action.args, results);

    try {
      const result = await executeTool(action.tool, resolvedArgs, ctx);
      results.push(result);
    } catch (err) {
      // Mark as rejected on execution failure
      await updateProposal(supabase, proposalId, {
        status: 'rejected',
        resolved_at: new Date().toISOString(),
      });
      throw new Error(`Action ${i} (${action.tool}) failed: ${err.message}`);
    }
  }

  await updateProposal(supabase, proposalId, {
    status: 'approved',
    resolved_at: new Date().toISOString(),
  });

  return { results };
}

/**
 * Reject a proposal.
 */
export async function reject(supabase, userId, proposalId) {
  const proposal = await getProposal(supabase, userId, proposalId);
  if (!proposal) throw new Error('Proposal not found');
  if (proposal.status !== 'pending') throw new Error(`Proposal status is ${proposal.status}`);

  await updateProposal(supabase, proposalId, {
    status: 'rejected',
    resolved_at: new Date().toISOString(),
  });

  return { ok: true };
}

/**
 * Resolve $ref:N references in action args.
 * $ref:N is replaced with the ID from the Nth result.
 */
function resolveRefs(args, previousResults) {
  if (!args || typeof args !== 'object') return args;

  const resolved = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.startsWith('$ref:')) {
      const idx = parseInt(value.slice(5), 10);
      const prev = previousResults[idx];
      // Try to extract an ID from the previous result
      resolved[key] = prev?.card?.id || prev?.node?.id || prev?.edge?.id || prev?.id || value;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
