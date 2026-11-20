import { RECOVERY_TTL_MS, RECOVERY_WINDOW_MS, RECOVERY_MAX_REQUESTS } from '../services/recoveryTokens.js';

/** Recibe un Pool de pg, no un cliente compartido. Todas las consultas son parametrizadas. */
export function createRecoveryTokenRepository(pool) {
  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async isValid(tokenHash) {
      const result = await pool.query(
        `SELECT 1 FROM recuperacion_tokens t JOIN usuarios u ON u.id = t.usuario_id
         WHERE t.token_hash = $1 AND t.expires_at > clock_timestamp()
         AND u.activo = TRUE AND u.password_hash IS NOT NULL`, [tokenHash],
      );
      return result.rowCount > 0;
    },

    issue({ email, emailHash, tokenHash }) {
      return transaction(async (client) => {
        // Serializa también las solicitudes simultáneas para un correo inexistente.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [emailHash]);
        const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
        const cutoff = new Date(now.getTime() - RECOVERY_WINDOW_MS);
        await client.query('DELETE FROM recuperacion_solicitudes WHERE email_hash = $1 AND requested_at <= $2', [emailHash, cutoff]);
        const { rows: [{ count }] } = await client.query(
          'SELECT count(*)::int AS count FROM recuperacion_solicitudes WHERE email_hash = $1', [emailHash],
        );
        if (count >= RECOVERY_MAX_REQUESTS) return null;
        await client.query('INSERT INTO recuperacion_solicitudes VALUES ($1, $2)', [emailHash, now]);
        // Bloqueo compartido con consume: evita carreras al emitir/restablecer.
        const { rows: [user] } = await client.query(
          'SELECT id, email, activo, password_hash FROM usuarios WHERE email = $1 FOR UPDATE', [email],
        );
        if (!user?.activo || !user.password_hash) return null;
        const expiresAt = new Date(now.getTime() + RECOVERY_TTL_MS);
        await client.query(
          `INSERT INTO recuperacion_tokens (usuario_id, token_hash, expires_at) VALUES ($1, $2, $3)
           ON CONFLICT (usuario_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at`,
          [user.id, tokenHash, expiresAt],
        );
        return { email: user.email, expiresAt };
      });
    },

    consume(tokenHash, apply) {
      return transaction(async (client) => {
        const { rows: [candidate] } = await client.query(
          'SELECT usuario_id FROM recuperacion_tokens WHERE token_hash = $1', [tokenHash],
        );
        if (!candidate) return false;
        const { rows: [user] } = await client.query(
          'SELECT id, activo, password_hash FROM usuarios WHERE id = $1 FOR UPDATE', [candidate.usuario_id],
        );
        if (!user?.activo || !user.password_hash) return false;
        const result = await client.query(
          `DELETE FROM recuperacion_tokens WHERE usuario_id = $1 AND token_hash = $2
           AND expires_at > clock_timestamp() RETURNING usuario_id`, [user.id, tokenHash],
        );
        if (!result.rowCount) return false;
        await apply(client, user.id);
        return true;
      });
    },
  };
}
