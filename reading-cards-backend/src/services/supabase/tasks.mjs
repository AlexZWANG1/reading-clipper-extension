// ========= Task CRUD Services (Supabase) =========

// ── Tasks ──

export async function createTask(supabase, userId, data) {
  const row = {
    user_id: userId,
    topic_id: data.topic_id || null,
    title: data.title,
    intent: data.intent,
    task_spec: data.task_spec || {},
    status: data.status || 'active',
    schedule: data.schedule || { type: 'manual' },
  };
  // Optional new fields (from plan system)
  if (data.conversation_id) row.conversation_id = data.conversation_id;
  if (data.plan_display) row.plan_display = data.plan_display;

  const { data: task, error } = await supabase
    .from('tasks')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`创建任务失败: ${error.message}`);
  return task;
}

export async function listTasks(supabase, userId, filters = {}) {
  let query = supabase
    .from('tasks')
    .select('*, topic:topics(id, title)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`获取任务列表失败: ${error.message}`);
  return data || [];
}

export async function getTask(supabase, userId, taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, topic:topics(id, title)')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`获取任务失败: ${error.message}`);
  }
  return data;
}

export async function updateTask(supabase, userId, taskId, updates) {
  const allowed = ['title', 'status', 'topic_id', 'schedule', 'task_spec'];
  const updateData = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (updates[key] !== undefined) updateData[key] = updates[key];
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`更新任务失败: ${error.message}`);
  return data;
}

export async function deleteTask(supabase, userId, taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) throw new Error(`删除任务失败: ${error.message}`);
  return true;
}

// ── Task Runs ──

export async function createRun(supabase, userId, taskId) {
  const { data, error } = await supabase
    .from('task_runs')
    .insert({
      task_id: taskId,
      user_id: userId,
      status: 'running',
    })
    .select()
    .single();

  if (error) throw new Error(`创建运行记录失败: ${error.message}`);
  return data;
}

export async function updateRun(supabase, runId, updates) {
  const { data, error } = await supabase
    .from('task_runs')
    .update(updates)
    .eq('id', runId)
    .select()
    .single();

  if (error) throw new Error(`更新运行记录失败: ${error.message}`);
  return data;
}

export async function listRuns(supabase, userId, taskId, limit = 20) {
  const { data, error } = await supabase
    .from('task_runs')
    .select('*')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`获取运行记录失败: ${error.message}`);
  return data || [];
}

export async function getRun(supabase, userId, runId) {
  const { data: run, error } = await supabase
    .from('task_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (error) return null;

  const { data: steps } = await supabase
    .from('task_run_steps')
    .select('*')
    .eq('run_id', runId)
    .order('step_index', { ascending: true });

  return { ...run, steps: steps || [] };
}

// ── Task Run Steps ──

export async function createStep(supabase, userId, runId, stepData) {
  const row = {
    run_id: runId,
    user_id: userId,
    step_index: stepData.step_index,
    phase: stepData.phase,
    status: 'running',
    input_summary: stepData.input_summary || null,
  };
  // New fields from plan system
  if (stepData.tool) row.tool = stepData.tool;
  if (stepData.tool_input) row.tool_input = stepData.tool_input;

  const { data, error } = await supabase
    .from('task_run_steps')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`创建步骤记录失败: ${error.message}`);
  return data;
}

export async function updateStep(supabase, stepId, updates) {
  const { data, error } = await supabase
    .from('task_run_steps')
    .update(updates)
    .eq('id', stepId)
    .select()
    .single();

  if (error) throw new Error(`更新步骤记录失败: ${error.message}`);
  return data;
}

// ── Task Proposals ──

export async function createProposal(supabase, userId, data) {
  const { data: proposal, error } = await supabase
    .from('task_proposals')
    .insert({
      task_id: data.task_id,
      run_id: data.run_id,
      step_id: data.step_id || null,
      user_id: userId,
      proposal_type: data.proposal_type || 'single_action',
      title: data.title,
      reasoning: data.reasoning || null,
      execution_plan: data.execution_plan,
    })
    .select()
    .single();

  if (error) throw new Error(`创建提案失败: ${error.message}`);
  return proposal;
}

export async function listProposals(supabase, userId, filters = {}) {
  let query = supabase
    .from('task_proposals')
    .select('*, task:tasks(id, title)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.task_id) {
    query = query.eq('task_id', filters.task_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`获取提案列表失败: ${error.message}`);
  return data || [];
}

export async function getProposal(supabase, userId, proposalId) {
  const { data, error } = await supabase
    .from('task_proposals')
    .select('*, task:tasks(id, title)')
    .eq('id', proposalId)
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data;
}

export async function updateProposal(supabase, proposalId, updates) {
  const { data, error } = await supabase
    .from('task_proposals')
    .update(updates)
    .eq('id', proposalId)
    .select()
    .single();

  if (error) throw new Error(`更新提案失败: ${error.message}`);
  return data;
}

// ── Helpers for runner ──

export async function acquireTaskLock(supabase, taskId, runId) {
  const now = new Date().toISOString();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('tasks')
    .update({ is_running: true, running_run_id: runId, locked_at: now })
    .eq('id', taskId)
    .eq('is_running', false)
    .select()
    .maybeSingle();

  if (data) return true;

  // Check for stale lock (>30 minutes)
  const { data: staleData } = await supabase
    .from('tasks')
    .update({ is_running: true, running_run_id: runId, locked_at: now })
    .eq('id', taskId)
    .eq('is_running', true)
    .lt('locked_at', thirtyMinutesAgo)
    .select()
    .maybeSingle();

  if (staleData) {
    console.warn(`[tasks] Force-acquired stale lock on task ${taskId}`);
    return true;
  }

  return false;
}

export async function releaseTaskLock(supabase, taskId) {
  await supabase
    .from('tasks')
    .update({
      is_running: false,
      running_run_id: null,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

export async function incrementRunCount(supabase, taskId) {
  const { data: task } = await supabase
    .from('tasks')
    .select('run_count')
    .eq('id', taskId)
    .single();

  if (task) {
    await supabase
      .from('tasks')
      .update({ run_count: (task.run_count || 0) + 1 })
      .eq('id', taskId);
  }
}

export async function getProcessedUrls(supabase, taskId) {
  const { data: runs } = await supabase
    .from('task_runs')
    .select('results')
    .eq('task_id', taskId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(10);

  const urls = new Set();
  for (const run of runs || []) {
    const processed = run.results?.processed_urls || [];
    for (const u of processed) urls.add(u);
  }
  return urls;
}

export async function getPendingProposalCount(supabase, userId, taskId) {
  const { count, error } = await supabase
    .from('task_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('status', 'pending');

  if (error) return 0;
  return count || 0;
}
