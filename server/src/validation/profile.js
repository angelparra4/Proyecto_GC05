import { TEXT_FIELDS, validateRequiredText } from './registration.js';

// SCRUM-93 §5: 9 cifras con prefijo +34 opcional. Solo números españoles.
export const TELEFONO_PATTERN = /^(?:\+34)?\d{9}$/;
const EDITABLE = new Set(['nombre', 'apellidos', 'telefono']);

function validateTelefono(telefono, changes, errors) {
  if (telefono === null) {
    changes.telefono = null;
  } else if (typeof telefono !== 'string' || !TELEFONO_PATTERN.test(telefono.trim())) {
    errors.telefono = 'Introduce 9 cifras, con el prefijo +34 opcional.';
  } else {
    changes.telefono = telefono.trim();
  }
}

/**
 * Valida un PATCH parcial del perfil. Solo se aceptan nombre, apellidos y telefono;
 * cualquier otra propiedad (email, rol, id, activo...) se rechaza en lugar de ignorarse.
 * telefono: null elimina el teléfono; un campo omitido conserva su valor.
 */
export function validateProfileUpdate(body) {
  const errors = {};
  const changes = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { changes, errors: { perfil: 'Envía los datos del perfil como un objeto JSON.' } };
  }
  for (const key of Object.keys(body)) {
    if (!EDITABLE.has(key)) errors[key] = 'Este campo no se puede modificar desde el perfil.';
  }
  for (const key of ['nombre', 'apellidos']) {
    if (!(key in body)) continue;
    const { text, error } = validateRequiredText(body[key], TEXT_FIELDS[key]);
    if (error) errors[key] = error;
    else changes[key] = text;
  }
  if ('telefono' in body) {
    validateTelefono(body.telefono, changes, errors);
  }
  if (!Object.keys(errors).length && !Object.keys(changes).length) {
    errors.perfil = 'Indica al menos un campo para actualizar.';
  }
  return { changes, errors };
}
