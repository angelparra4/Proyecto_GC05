import { createHash, randomBytes } from 'node:crypto';
import isEmail from 'validator/lib/isEmail.js';

export const RECOVERY_TTL_MS = 30 * 60 * 1000;
export const RECOVERY_WINDOW_MS = 60 * 60 * 1000;
export const RECOVERY_MAX_REQUESTS = 3;

export function recoveryDigest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Mecanismo interno para SCRUM-43: nunca devolver el token en una respuesta HTTP.
 * El resultado de issue se usará exclusivamente para enviar el correo de pruebas.
 */
export function createRecoveryTokens(repository) {
  return {
    async isValid(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
      return repository.isValid(recoveryDigest(token));
    },

    async issue(rawEmail) {
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
      if (email.length > 254 || !isEmail(email, { allow_utf8_local_part: false })) {
        throw new TypeError('El formato del correo no es válido.');
      }
      const token = randomBytes(32).toString('hex');
      const account = await repository.issue({
        email,
        emailHash: recoveryDigest(email),
        tokenHash: recoveryDigest(token),
      });
      // Misma salida para correo inexistente, inactivo, OAuth y límite alcanzado.
      return account ? { email: account.email, token, expiresAt: account.expiresAt } : null;
    },

    /** apply(client, userId) deberá actualizar contraseña/sesiones en SCRUM-43.
     * Su ejecución y el consumo del enlace forman una sola transacción.
     */
    async consume(token, apply) {
      if (typeof apply !== 'function') throw new TypeError('Falta la operación de restablecimiento.');
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
      return repository.consume(recoveryDigest(token), apply);
    },
  };
}
