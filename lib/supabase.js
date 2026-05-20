import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

/** Strip private underscore fields before sending to Supabase */
function sanitise(job) {
  const clean = { ...job };
  Object.keys(clean).forEach((k) => {
    if (k.startsWith('_')) delete clean[k];
  });
  // Also strip fields not in the schema
  const ALLOWED = [
    'external_id',
    'platform',
    'title',
    'description',
    'url',
    'location',
    'budget_type',
    'budget_min',
    'budget_max',
    'skills',
    'relevance_score',
    'proposal',
    'status',
    'applied_at',
    'replied_at',
    'won_at',
    'follow_up_sent_at',
    'notes',
    'created_at',
    'updated_at',
  ];
  Object.keys(clean).forEach((k) => {
    if (!ALLOWED.includes(k)) delete clean[k];
  });
  return clean;
}

/** Insert new job — silently ignores duplicates */
export async function upsertJob(job) {
  const { data, error } = await supabase
    .from('jobs')
    .upsert(sanitise(job), { onConflict: 'external_id', ignoreDuplicates: true })
    .select()
    .maybeSingle(); // maybeSingle returns null instead of error when 0 rows returned (duplicate ignored)
  if (error && error.code !== '23505') throw error;
  return data; // null if duplicate
}

/** Get all jobs for dashboard (newest first) */
export async function getAllJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('relevance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data;
}

/** Update job status + timestamps */
export async function updateJobStatus(id, status, extra = {}) {
  const updates = { status, ...extra };
  if (status === 'applied') updates.applied_at = new Date().toISOString();
  if (status === 'replied') updates.replied_at = new Date().toISOString();
  if (status === 'won') updates.won_at = new Date().toISOString();
  const { error } = await supabase.from('jobs').update(updates).eq('id', id);
  if (error) throw error;
}

/** Jobs applied 3+ days ago, no reply, no follow-up sent */
export async function getFollowUpJobs() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'applied')
    .is('follow_up_sent_at', null)
    .is('replied_at', null)
    .lt('applied_at', threeDaysAgo);
  if (error) throw error;
  return data;
}

/** Weekly stats from the view */
export async function getWeeklyStats() {
  const { data, error } = await supabase.from('weekly_stats').select('*').single();
  if (error) throw error;
  return data;
}
