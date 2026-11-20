import isEmail from 'validator/lib/isEmail.js';
import { validatePassword } from '../validation/registration.js';
import { hashPassword } from '../security/passwords.js';

export const RECOVERY_CONFIRMATION = 'Si el correo pertenece a una cuenta activa con contraseña local, recibirás un enlace de recuperación.';

export class RecoveryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** SCRUM-43: los tokens y contraseñas nunca forman parte de respuestas ni logs. */
export function createRecoveryService({ tokens, sendRecovery, logError = () => {} }) {
  return {
    async validate(body) {
      if (!await tokens.isValid(body?.token)) {
        throw new RecoveryError(400, 'Enlace expirado o no válido. Solicita uno nuevo.');
      }
      return { message: 'Enlace válido.' };
    },

    async request(body) {
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email || email.length > 254 || !isEmail(email, { allow_utf8_local_part: false })) {
        throw new RecoveryError(400, 'Introduce un correo válido.');
      }
      const issued = await tokens.issue(email);
      if (issued) {
        try {
          await sendRecovery(issued);
        } catch {
          // No revelar la existencia de una cuenta mediante un fallo SMTP.
          logError();
        }
      }
      return { message: RECOVERY_CONFIRMATION };
    },

    async reset(body) {
      const invalidLink = () => new RecoveryError(400, 'El enlace no es válido o ha caducado. Solicita uno nuevo.');
      if (typeof body?.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) throw invalidLink();
      const error = validatePassword(body?.password);
      if (error) throw new RecoveryError(400, error);
      if (body.password !== body.confirmPassword) {
        throw new RecoveryError(400, 'Las contraseñas no coinciden.');
      }
      const passwordHash = await hashPassword(body.password);
      const consumed = await tokens.consume(body.token, async (client, userId) => {
        await client.query(
          'UPDATE usuarios SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [passwordHash, userId],
        );
        // El mismo cliente/transacción hace atómicos el cambio, el consumo y la revocación.
        await client.query("DELETE FROM sesiones WHERE sess->>'userId' = $1", [userId]);
      });
      if (!consumed) throw invalidLink();
      return { message: 'Contraseña restablecida. Inicia sesión con tu nueva contraseña.' };
    },
  };
}
