"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseAuthClient } from "./lib/supabase-browser";

type AuthMode = "login" | "recovery" | "update";

export function SetupNeeded() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-bolt">T</span>
          <strong>THOR</strong>
        </div>
        <p className="eyebrow">CONFIGURACION PENDIENTE</p>
        <h1>Conecta Supabase para iniciar THOR</h1>
        <p className="auth-copy">
          Agrega la URL del proyecto y la clave publicable en las variables del
          hosting. Nunca uses una clave secreta en el navegador.
        </p>
      </section>
    </main>
  );
}

export function Login({
  onAuthenticated,
}: {
  onAuthenticated: (token: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseAuthClient(true);
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("update");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createSupabaseAuthClient(remember);
    if (!supabase) return;
    setMessage("Procesando...");
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) return setMessage(result.error.message);
    onAuthenticated(result.data.session.access_token);
    setMessage("Sesion iniciada.");
  };

  const requestRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const supabase = createSupabaseAuthClient(true);
    if (!supabase) return;
    const result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href,
    });
    setMessage(
      result.error
        ? result.error.message
        : "Si el correo existe, recibira un enlace para cambiar su contrasena.",
    );
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation)
      return setMessage("Las contrasenas no coinciden.");
    const supabase = createSupabaseAuthClient(true);
    if (!supabase) return;
    const result = await supabase.auth.updateUser({ password });
    if (result.error) return setMessage(result.error.message);
    setMessage("Contrasena actualizada. Ya puedes ingresar.");
    setMode("login");
  };

  const passwordInput = (name: string, autoComplete: string) => (
    <div className="password-field">
      <input
        required
        name={name}
        type={showPassword ? "text" : "password"}
        minLength={8}
        autoComplete={autoComplete}
      />
      <button
        className="password-toggle"
        type="button"
        onClick={() => setShowPassword((visible) => !visible)}
        aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
        title={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
      >
        <span
          className={showPassword ? "eye-icon eye-visible" : "eye-icon"}
          aria-hidden="true"
        />
      </button>
    </div>
  );

  const heading =
    mode === "login"
      ? "Ingresa a THOR"
      : mode === "recovery"
        ? "Recupera tu contrasena"
        : "Cambia tu contrasena";
  const description =
    mode === "login"
      ? "Ingresa con el correo y la contrasena asignados por tu administrador."
      : mode === "recovery"
        ? "Escribe tu correo y te enviaremos un enlace seguro para restablecerla."
        : "Elige una nueva contrasena de al menos ocho caracteres.";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-bolt">T</span>
          <strong>THOR</strong>
        </div>
        <p className="eyebrow">SISTEMA DE INVENTARIO Y VENTAS</p>
        <h1>{heading}</h1>
        <p className="auth-copy">{description}</p>
        {mode === "login" ? (
          <form className="auth-form" onSubmit={signIn}>
            <label>
              Correo
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nombre@empresa.com"
              />
            </label>
            <label>
              Contrasena{passwordInput("password", "current-password")}
            </label>
            <label className="remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />{" "}
              Recordarme en este dispositivo
            </label>
            <button className="primary" type="submit">
              Ingresar
            </button>
            <button
              className="text-button auth-switch"
              type="button"
              onClick={() => {
                setMode("recovery");
                setMessage("");
              }}
            >
              Olvide mi contrasena
            </button>
          </form>
        ) : mode === "recovery" ? (
          <form className="auth-form" onSubmit={requestRecovery}>
            <label>
              Correo
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nombre@empresa.com"
              />
            </label>
            <button className="primary" type="submit">
              Enviar enlace de recuperacion
            </button>
            <button
              className="text-button auth-switch"
              type="button"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
            >
              Volver a ingresar
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={updatePassword}>
            <label>
              Nueva contrasena{passwordInput("password", "new-password")}
            </label>
            <label>
              Repite la contrasena
              {passwordInput("confirmation", "new-password")}
            </label>
            <button className="primary" type="submit">
              Guardar nueva contrasena
            </button>
          </form>
        )}
        <p className="auth-message" role="status">
          {message}
        </p>
      </section>
    </main>
  );
}
