// ========= Sequential Plan Executor =========
// Executes a PlanSpec step-by-step, persisting each step result.
// Shares the same tool system as chat (executeTool).

import {
  createRun, updateRun,
  createStep, updateStep,
  acquireTaskLock, releaseTaskLock, incrementRunCount,
} from "../services/supabase/tasks.mjs";
import { addMessage } from "../services/supabase/conversations.mjs";
import { executeTool } from "./toolExecutor.mjs";
import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";

const cancelledTaskIds = new Set();

export function cancelExecution(taskId) {
  if (!taskId) return;
  cancelledTaskIds.add(taskId);
}

/**
 * Execute a plan sequentially.
 * Each step calls a tool, saves the result, and optionally gets AI commentary.
 *
 * @param {Object} opts
 * @param {Object} opts.task - Task record (from tasks table)
 * @param {Object} opts.planSpec - The plan_spec to execute
 * @param {string} opts.conversationId - Conversation to write progress messages to
 * @param {Object} opts.supabase - Service-role Supabase client
 */
export async function executePlan({ task, planSpec, conversationId, supabase }) {
  const userId = task.user_id;
  const steps = planSpec.steps || [];

  // Create run record
  const run = await createRun(supabase, userId, task.id);

  // Acquire lock
  const locked = await acquireTaskLock(supabase, task.id, run.id);
  if (!locked) {
    await updateRun(supabase, run.id, {
      status: "failed",
      error: "Task is already running",
      completed_at: new Date().toISOString(),
    });
    throw new Error("Task is already running");
  }

  const results = {
    steps_total: steps.length,
    steps_completed: 0,
    steps_failed: 0,
    step_outputs: [],
  };

  // Accumulate step outputs for context passing between steps
  const stepOutputs = {};

  try {
    for (let i = 0; i < steps.length; i++) {
      if (cancelledTaskIds.has(task.id)) {
        throw new Error("Execution cancelled by user");
      }

      const planStep = steps[i];
      const stepRecord = await createStep(supabase, userId, run.id, {
        step_index: i,
        phase: planStep.id || `step_${i + 1}`,
        tool: planStep.tool,
        tool_input: planStep.input_hint || {},
        input_summary: `${planStep.title}: ${planStep.goal}`,
      });

      try {
        // Resolve input — may reference previous step outputs
        const resolvedInput = resolveStepInput(planStep, stepOutputs);

        // Execute tool
        const toolResult = await Promise.race([
          executeTool(planStep.tool, resolvedInput, { supabase, userId }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Tool execution timeout (60s)")), 60000)
          ),
        ]);

        // Save step output for later steps
        stepOutputs[planStep.id] = toolResult;

        // Generate AI note for this step (brief interpretation)
        const aiNote = await generateStepNote(planStep, toolResult, userId, supabase);

        // Update step record
        await updateStep(supabase, stepRecord.id, {
          status: "completed",
          tool_output: toolResult,
          output_summary: summarizeToolOutput(planStep.tool, toolResult),
          ai_note: aiNote,
          completed_at: new Date().toISOString(),
        });

        results.steps_completed++;
        results.step_outputs.push({
          step_id: planStep.id,
          tool: planStep.tool,
          status: "completed",
          summary: summarizeToolOutput(planStep.tool, toolResult),
        });

        // Write progress message to conversation
        if (conversationId) {
          await addMessage(supabase, conversationId, {
            role: "assistant",
            content: `**${planStep.title}** - ${summarizeToolOutput(planStep.tool, toolResult)}${aiNote ? `\n> ${aiNote}` : ""}`,
            message_type: "step_progress",
            metadata: { step_id: planStep.id, step_index: i, tool: planStep.tool, status: "completed" },
          });
        }
      } catch (err) {
        // Step failed
        await updateStep(supabase, stepRecord.id, {
          status: "failed",
          error: err.message,
          completed_at: new Date().toISOString(),
        });

        results.steps_failed++;
        results.step_outputs.push({
          step_id: planStep.id,
          tool: planStep.tool,
          status: "failed",
          error: err.message,
        });

        if (conversationId) {
          await addMessage(supabase, conversationId, {
            role: "assistant",
            content: `**${planStep.title}** - 执行失败: ${err.message}`,
            message_type: "step_progress",
            metadata: { step_id: planStep.id, step_index: i, tool: planStep.tool, status: "failed" },
          });
        }

        // Non-fatal: continue to next step unless critical
        console.warn(`[executor] Step ${planStep.id} failed:`, err.message);
      }
    }

    // Generate final summary
    const summary = await generatePlanSummary(planSpec, results, userId, supabase);

    // Write completion message
    if (conversationId) {
      await addMessage(supabase, conversationId, {
        role: "assistant",
        content: summary,
        message_type: "plan_complete",
        metadata: { task_id: task.id, run_id: run.id, results },
      });
    }

    // Finalize run
    await updateRun(supabase, run.id, {
      status: results.steps_failed > 0 ? "completed_with_proposals" : "completed",
      results,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await updateRun(supabase, run.id, {
      status: "failed",
      error: err.message,
      results,
      completed_at: new Date().toISOString(),
    });

    if (conversationId) {
      await addMessage(supabase, conversationId, {
        role: "assistant",
        content: `执行计划失败: ${err.message}`,
        message_type: "error",
        metadata: { task_id: task.id, run_id: run.id },
      });
    }
  } finally {
    cancelledTaskIds.delete(task.id);
    await releaseTaskLock(supabase, task.id);
    await incrementRunCount(supabase, task.id);
  }

  return run;
}

// ── Helpers ──

/**
 * Resolve step input by injecting outputs from previous steps.
 * Supports $ref:step_id patterns in input_hint values.
 */
function resolveStepInput(planStep, stepOutputs) {
  const input = { ...(planStep.input_hint || {}) };

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.startsWith("$ref:")) {
      const refStepId = value.slice(5);
      if (stepOutputs[refStepId]) {
        input[key] = stepOutputs[refStepId];
      }
    }
  }

  return input;
}

/**
 * Generate a brief AI note for a completed step.
 */
async function generateStepNote(planStep, toolResult, userId, supabase) {
  try {
    const aiConfig = await createAIClientConfig(userId, supabase);
    const messages = [
      {
        role: "system",
        content: "You are a research assistant. Given a tool execution result, provide a 1-sentence observation or insight in Chinese. Be concise.",
      },
      {
        role: "user",
        content: `Tool: ${planStep.tool}\nGoal: ${planStep.goal}\nResult: ${JSON.stringify(toolResult).slice(0, 1000)}`,
      },
    ];

    const response = await callChatAPI(aiConfig, messages, {
      temperature: 0.3,
      max_tokens: 100,
    });

    return response.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Generate a final summary of the plan execution.
 */
async function generatePlanSummary(planSpec, results, userId, supabase) {
  try {
    const aiConfig = await createAIClientConfig(userId, supabase);
    const messages = [
      {
        role: "system",
        content: "You are a research assistant. Summarize the results of a completed research plan in Chinese. Include: what was accomplished, key findings, and suggested next steps. Be concise (3-5 sentences).",
      },
      {
        role: "user",
        content: `Plan: ${planSpec.intent_summary}\nResults: ${JSON.stringify(results.step_outputs).slice(0, 2000)}`,
      },
    ];

    const response = await callChatAPI(aiConfig, messages, {
      temperature: 0.3,
      max_tokens: 300,
    });

    return response.choices?.[0]?.message?.content?.trim() || formatFallbackSummary(results);
  } catch {
    return formatFallbackSummary(results);
  }
}

function formatFallbackSummary(results) {
  return `执行完成: ${results.steps_completed}/${results.steps_total} 步骤成功${results.steps_failed > 0 ? `, ${results.steps_failed} 步骤失败` : ""}。`;
}

/**
 * Summarize tool output into a short string.
 */
function summarizeToolOutput(tool, result) {
  if (!result) return "无结果";
  if (result.error) return `错误: ${result.error}`;

  switch (tool) {
    case "fetch_rss":
      return `抓取了 ${result.items?.length || 0} 条 RSS 条目`;
    case "semantic_search":
      return `找到 ${result.total || result.results?.length || 0} 条相关内容`;
    case "search_cards":
      return `找到 ${result.count || result.cards?.length || 0} 张相关卡片`;
    case "ingest_url":
      return `已摄入: ${result.title || result.material_id || "unknown"}`;
    case "create_card":
      return `已创建卡片: ${result.card?.title || result.message || ""}`;
    case "list_cards":
      return `列出 ${result.total || result.cards?.length || 0} 张卡片`;
    case "list_topics":
      return `列出 ${result.topics?.length || 0} 个主题`;
    default:
      return JSON.stringify(result).slice(0, 100);
  }
}
