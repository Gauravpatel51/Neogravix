import { supabase } from '../utils/supabaseClient'

// Starts or resumes a test attempt
export const startTestAttempt = async (studentId, testId) => {
  // Check if an incomplete attempt already exists
  const { data: existing, error: fetchErr } = await supabase
    .from('attempts')
    .select('id, question_states, time_taken, started_at, violation_count')
    .eq('student_id', studentId)
    .eq('test_id', testId)
    .eq('is_completed', false)
    .single();

  if (existing) {
    return existing; // Resume
  }

  // Create new attempt
  const { data: newAttempt, error: insertErr } = await supabase
    .from('attempts')
    .insert({
      student_id: studentId,
      test_id: testId,
      question_states: {},
      is_completed: false,
      time_taken: 0
    })
    .select('id, question_states, time_taken, started_at, violation_count')
    .single();

  if (insertErr) throw insertErr;
  return newAttempt;
}

// Retrieves the current state of an attempt
export const getAttemptState = async (attemptId) => {
  const { data, error } = await supabase
    .from('attempts')
    .select('question_states, time_taken, violation_count')
    .eq('id', attemptId)
    .single();

  if (error) throw error;
  return data;
}

// Saves the current state of an attempt (debounce this on frontend)
export const saveAttemptState = async (attemptId, questionStates, timeTaken) => {
  const { error } = await supabase
    .from('attempts')
    .update({
      question_states: questionStates,
      time_taken: timeTaken
    })
    .eq('id', attemptId);

  if (error) throw error;
}

// Submits the attempt, calculating score
export const submitAttempt = async (attemptId, finalStats, questionStates) => {
  const { error } = await supabase
    .from('attempts')
    .update({
      question_states: questionStates,
      is_completed: true,
      completed_at: new Date().toISOString(),
      final_score: finalStats.score,
      max_score: finalStats.maxScore,
      time_taken: finalStats.timeTaken
    })
    .eq('id', attemptId);

  if (error) throw error;
}

// Records an anti-cheating violation
export const recordViolation = async (attemptId, studentId, violationType, snapshotBase64 = null) => {
  // 1. Fetch current attempt to increment count
  const { data: attempt, error: fetchErr } = await supabase
    .from('attempts')
    .select('violation_count')
    .eq('id', attemptId)
    .single();

  if (fetchErr) throw fetchErr;

  const newCount = (attempt.violation_count || 0) + 1;

  // 2. Update count in attempts table
  const { error: updateErr } = await supabase
    .from('attempts')
    .update({ violation_count: newCount })
    .eq('id', attemptId);

  if (updateErr) throw updateErr;

  // 3. Log the specific violation (snapshot fallback: Supabase 402 quota does not block violation)
  try {
    const payload = {
      attempt_id: attemptId,
      student_id: studentId,
      violation_type: violationType,
      browser: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      device: typeof window !== 'undefined' && window.innerWidth <= 768 ? 'Mobile' : 'Desktop'
    };
    if (snapshotBase64) {
      payload.snapshot = snapshotBase64;
    }
    const { error: logErr } = await supabase.from('test_violations').insert(payload);
    if (logErr && snapshotBase64) {
      delete payload.snapshot;
      await supabase.from('test_violations').insert(payload).catch(() => {});
    }
  } catch (snapErr) {
    console.warn("Non-fatal error logging violation details:", snapErr);
  }

  return newCount;
}
