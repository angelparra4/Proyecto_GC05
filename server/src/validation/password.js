import { validatePassword } from './registration.js';

const FIELDS = new Set(['actual', 'nueva', 'confirmacion']);
const MAX_LENGTH = 128;

/** US-006. Valida la petición de cambio de contraseña. No recorta ni altera las contraseñas. */
export function validatePasswordChange(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { cambio: 'Envía la contraseña actual y la nueva.' } };
  }

  const errors = {};
  for (const key of Object.keys(body)) {
    if (!FIELDS.has(key)) errors[key] = 'Este campo no se admite.';
  }

  const text = (value) => (typeof value === 'string' ? value : '');
  const actual = text(body.actual);
  const nueva = text(body.nueva);
  const confirmacion = text(body.confirmacion);

  if (!actual) errors.actual = 'Introduce tu contraseña actual.';
  else if ([...actual].length > MAX_LENGTH) errors.actual = 'La contraseña no puede superar los 128 caracteres.';

  if (!nueva) errors.nueva = 'Introduce la nueva contraseña.';
  else if (validatePassword(nueva)) errors.nueva = validatePassword(nueva);

  if (!confirmacion) errors.confirmacion = 'Repite la nueva contraseña.';
  else if (nueva && confirmacion !== nueva) errors.confirmacion = 'Las contraseñas nuevas no coinciden.';

  return { actual, nueva, errors };
}
