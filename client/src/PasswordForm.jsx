import { useEffect, useRef, useState } from 'react';
import { changePassword } from './api/password.js';

const EMPTY = { actual: '', nueva: '', confirmacion: '' };
const STRENGTH = 'Usa al menos 8 caracteres, una letra y un número.';

/** Mismas reglas que el registro y que el servidor (US-006 AC-04). */
function validate({ actual, nueva, confirmacion }) {
  const errors = {};
  if (!actual) errors.actual = 'Introduce tu contraseña actual.';
  if (!nueva) errors.nueva = 'Introduce la nueva contraseña.';
  else if ([...nueva].length < 8 || !/\p{L}/u.test(nueva) || !/[0-9]/.test(nueva)) errors.nueva = STRENGTH;
  else if ([...nueva].length > 128) errors.nueva = 'La contraseña no puede superar los 128 caracteres.';
  else if (nueva === actual) errors.nueva = 'La nueva contraseña debe ser distinta de la actual.';
  if (!confirmacion) errors.confirmacion = 'Repite la nueva contraseña.';
  else if (nueva && confirmacion !== nueva) errors.confirmacion = 'Las contraseñas nuevas no coinciden.';
  return errors;
}

/**
 * SCRUM-97 / US-006 · Cambio de contraseña desde el perfil.
 * No guarda contraseñas en el navegador y las borra de la memoria al terminar.
 */
export function PasswordForm({ localPassword = true }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ text: '', ok: false, login: false });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const feedback = useRef(null);

  useEffect(() => {
    if (message.text) feedback.current?.focus();
  }, [message]);

  // AC-08: si la cuenta solo usa OAuth, la opción no se ofrece.
  if (!localPassword) return null;

  const change = field => event => setForm(current => ({ ...current, [field]: event.target.value }));

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setVisible(false);
    setErrors({});
  }

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    setErrors({});
    setMessage({ text: '', ok: false, login: false });

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      setMessage({ text: 'Revisa los datos introducidos.', ok: false, login: false });
      return;
    }

    busy.current = true;
    setSaving(true);
    try {
      const data = await changePassword(form);
      close();
      setMessage({ text: data?.message || 'Contraseña actualizada correctamente.', ok: true, login: false });
    } catch (error) {
      setErrors(error.errors || {});
      setMessage({ text: error.message, ok: false, login: error.status === 401 });
      // Nunca conservar la contraseña actual tras un intento fallido.
      setForm(current => ({ ...current, actual: '' }));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const field = (name, label, autoComplete, help) => <>
    <label htmlFor={`password-${name}`}>{label}</label>
    <input id={`password-${name}`} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
      maxLength={128} value={form[name]} onChange={change(name)} disabled={saving}
      aria-invalid={Boolean(errors[name])}
      aria-describedby={[help && `password-${name}-help`, errors[name] && `password-${name}-error`].filter(Boolean).join(' ') || undefined} />
    {help && <p id={`password-${name}-help`} className="help">{help}</p>}
    {errors[name] && <p id={`password-${name}-error`} className="error">{errors[name]}</p>}
  </>;

  return <section className="password-change" aria-labelledby="password-title">
    <h2 id="password-title">Contraseña</h2>

    {!open && <button type="button" className="secondary" onClick={() => { setOpen(true); setMessage({ text: '', ok: false, login: false }); }}>
      Cambiar contraseña
    </button>}

    {open && <form onSubmit={submit} aria-busy={saving} noValidate>
      {field('actual', 'Contraseña actual', 'current-password')}
      {field('nueva', 'Nueva contraseña', 'new-password', 'Entre 8 y 128 caracteres, con al menos una letra y un número.')}
      {field('confirmacion', 'Repite la nueva contraseña', 'new-password')}

      <label className="checkbox">
        <input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} disabled={saving} />
        {' '}
        Mostrar las contraseñas
      </label>
      <p className="help">Al cambiarla se cerrarán tus sesiones abiertas en otros dispositivos.</p>

      <div className="actions">
        <button type="submit" disabled={saving}>{saving ? 'Cambiando…' : 'Cambiar contraseña'}</button>
        <button type="button" className="secondary" onClick={close} disabled={saving}>Cancelar</button>
      </div>
    </form>}

    <p ref={feedback} role="status" aria-live="polite" tabIndex="-1" className={message.ok ? 'success' : 'error'}>
      {message.text}{message.login && <> <a href="#inicio-sesion">Iniciar sesión</a></>}
    </p>
  </section>;
}
