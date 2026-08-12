import { getPgPool } from '../config/database.js';

/**
 * Processes pending ORDER_CREATED outbox events.
 * Notification failure does not affect the committed order — events remain pending/failed for retry.
 */
export async function processPendingOrderEvents(limit = 10): Promise<number> {
  const client = await getPgPool().connect();
  let processed = 0;

  try {
    await client.query('BEGIN');

    const pending = await client.query<{
      id: string;
      order_id: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT id, order_id, payload
       FROM order_events
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    for (const event of pending.rows) {
      try {
        console.info('[ORDER_CREATED]', JSON.stringify({
          event_id: event.id,
          order_id: event.order_id,
          payload: event.payload,
        }));

        await client.query(
          `UPDATE order_events
           SET status = 'processed', processed_at = now(), attempts = attempts + 1
           WHERE id = $1`,
          [event.id],
        );
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await client.query(
          `UPDATE order_events
           SET status = 'failed', attempts = attempts + 1, last_error = $2
           WHERE id = $1`,
          [event.id, message],
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return processed;
}
