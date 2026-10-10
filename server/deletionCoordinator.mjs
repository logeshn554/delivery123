// Called only by the trusted operator worker after Firebase cleanup. SQL commits
// before completion is published; reruns after a publication failure are safe.
import { randomBytes, scryptSync } from 'node:crypto';
export async function completeLinkedDeletion({ pool, deletionRef, now = new Date() }) {
  const job = (await deletionRef.get()).data();
  if (job?.status !== 'firebase_completed' || !/^[a-f0-9-]{36}$/.test(job.neonAccountId || '') || !job.policyUrl?.startsWith('https://')) throw new Error('A policy-approved, Firebase-completed linked deletion is required.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT a.id FROM allgo_accounts a JOIN allgo_identity_links l ON l.account_id=a.id WHERE a.id=$1 AND l.firebase_uid=$2 FOR UPDATE OF a', [job.neonAccountId, deletionRef.id]);
    if (!result.rows[0]) throw new Error('Linked account mapping is missing; manual reconciliation required.');
    await client.query('DELETE FROM allgo_sessions WHERE account_id=$1', [job.neonAccountId]);
    await client.query('DELETE FROM allgo_password_resets WHERE account_id=$1', [job.neonAccountId]);
    await client.query('DELETE FROM allgo_email_verifications WHERE account_id=$1', [job.neonAccountId]);
    await client.query('DELETE FROM allgo_account_items WHERE account_id=$1', [job.neonAccountId]);
    // Retain legacy finance identifiers and amounts only; discard arbitrary JSON PII.
    await client.query("UPDATE allgo_bookings SET data=jsonb_build_object('bookingId',id,'price',data->'price','paymentStatus',data->'paymentStatus','status',data->'status','serviceType',data->'serviceType') WHERE account_id=$1", [job.neonAccountId]);
    const salt = randomBytes(16).toString('hex'), hash = `${salt}:${scryptSync(randomBytes(64).toString('hex'), salt, 64).toString('hex')}`;
    await client.query("UPDATE allgo_accounts SET name='Deleted account',email=$2,password_hash=$3,profile='{\"deleted\":true}'::jsonb WHERE id=$1", [job.neonAccountId, `deleted+${job.neonAccountId}@deleted.invalid`, hash]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await deletionRef.update({ status: 'completed', neonCompletedAt: now, completedAt: now });
  return { status: 'completed' };
}
