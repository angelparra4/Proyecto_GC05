import { useEffect, useRef, useState } from 'react';
import { requestRecovery, resetPassword, validateRecoveryToken } from './api/recovery.js';

function RecoveryLayout({ title, children }) {
  return <main>
    <header><span className="brand">Lost&Found UEx</span><p>Objetos perdidos y encontrados</p></header>
    <section className="card" aria-labelledby="recovery-title">
      <h1 id="recovery-title">{title}</h1>
      {children}
      <p><a href="#inicio-sesion">Volver a iniciar sesión</a></p>
    </section>
  </main>;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const busy = useRef(false);
  const feedback = useRef(null);

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await requestRecovery(email);
      setSuccess(true);
      setEmail('');
    } catch (error) { setError(error.message); }
    finally {
      busy.current = false;
      setPending(false);
      feedback.current?.focus();
    }
  }

  return <RecoveryLayout title="Recupera tu contraseña">
    <p>Introduce el correo de tu cuenta para solicitar un enlace de recuperación.</p>
    {!success && <form onSubmit={submit} aria-busy={pending}>
      <label htmlFor="recovery-email">Correo electrónico</label>
      <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254}
        value={email} onChange={event => setEmail(event.target.value)} disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Enviar enlace'}</button>
    </form>}
    <div ref={feedback} tabIndex={-1} role={error ? 'alert' : 'status'} className={error ? 'error' : 'success'}>
      {error || (success ? 'Si el correo pertenece a una cuenta activa con contraseña local, recibirás un enlace de recuperación. Revisa tu buzón.' : '')}
    </div>
    {success && <p>El enlace caduca en 30 minutos. Si necesitas otro, <a href="#recuperar-contrasena" onClick={() => setSuccess(false)}>solicítalo de nuevo</a>.</p>}
  </RecoveryLayout>;
}

function PasswordInput({ id, label, value, onChange, disabled, describedBy }) {
  const [visible, setVisible] = useState(false);
  return <>
    <label htmlFor={id}>{label}</label>
    <div className="password-field">
      <input id={id} name={id} type={visible ? 'text' : 'password'} autoComplete="new-password" required maxLength={128}
        value={value} onChange={onChange} disabled={disabled} aria-describedby={describedBy} />
      <button type="button" className="password-toggle" disabled={disabled}
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={visible}
        onClick={() => setVisible(previous => !previous)}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
          {!visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  </>;
}

export function ResetPasswordForm({ token, onReset }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const feedback = useRef(null);
  const validToken = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
  const [check, setCheck] = useState('checking');
  const [checkError, setCheckError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setCheck(validToken ? 'checking' : 'invalid');
    if (validToken) {
      validateRecoveryToken(token).then(() => {
        if (active) setCheck('valid');
      }).catch(error => {
        if (!active) return;
        setCheckError(error.message);
        setCheck(error.invalidToken ? 'invalid' : 'error');
      });
    }
    return () => { active = false; };
  }, [token, validToken, attempt]);

  async function submit(event) {
    event.preventDefault();
    if (busy.current || !validToken || check !== 'valid') return;
    let validation = '';
    if ([...password].length < 8 || [...password].length > 128 || !/\p{L}/u.test(password) || !/\d/.test(password)) {
      validation = 'Usa entre 8 y 128 caracteres, con al menos una letra y un número.';
    } else if (password !== confirmPassword) validation = 'Las contraseñas no coinciden.';
    if (validation) { setError(validation); feedback.current?.focus(); return; }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await resetPassword({ token, password, confirmPassword });
      onReset();
    } catch (error) { setError(error.message); }
    finally {
      setPassword('');
      setConfirmPassword('');
      setPending(false);
      busy.current = false;
      feedback.current?.focus();
    }
  }

  const invalid = !validToken || check === 'invalid';

  let title = 'Comprobando enlace';
  if (invalid) {
    title = 'Enlace expirado o no válido';
  } else if (check === 'valid') {
    title = 'Establece una nueva contraseña';
  }
  let content;

  if (invalid) {
    content = <p role="alert" className="error">Enlace expirado o no válido. Solicita uno nuevo.</p>;
  } else if (check === 'checking') {
    content = <output>Comprobando que el enlace sigue siendo válido…</output>;
  } else if (check === 'error') {
    content = <>
      <p role="alert" className="error">{checkError}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Reintentar comprobación</button>
    </>;
  } else {
    content = <>
      <p>Elige una contraseña nueva para recuperar el acceso a tu cuenta.</p>
      <form onSubmit={submit} aria-busy={pending}>
        <PasswordInput id="reset-password" label="Nueva contraseña" value={password}
          onChange={event => setPassword(event.target.value)} disabled={pending} describedBy="reset-help" />
        <p id="reset-help" className="help">Entre 8 y 128 caracteres, con al menos una letra y un número.</p>
        <PasswordInput id="reset-confirm" label="Repite la nueva contraseña" value={confirmPassword}
          onChange={event => setConfirmPassword(event.target.value)} disabled={pending} />
        <button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
      </form>
      <div ref={feedback} tabIndex={-1} role="alert" className="error">{error}</div>
    </>;
  }

  return <RecoveryLayout title={title}>
    {content}
    <p><a href="#recuperar-contrasena">Solicitar un nuevo enlace</a></p>
  </RecoveryLayout>;
}
