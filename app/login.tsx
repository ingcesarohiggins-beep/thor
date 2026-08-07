"use client";

import { FormEvent, useState } from "react";
import { createSupabaseAuthClient } from "./lib/supabase-browser";

export function SetupNeeded() {
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="auth-bolt">T</span><strong>THOR</strong></div><p className="eyebrow">CONFIGURACION PENDIENTE</p><h1>Conecta Supabase para iniciar THOR</h1><p className="auth-copy">Agrega la URL del proyecto y la clave publicable en las variables del hosting. Nunca uses una clave secreta en el navegador.</p></section></main>;
}

export function Login({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createSupabaseAuthClient(remember);
    if (!supabase) return;
    setMessage("Procesando...");
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (result.error) return setMessage(result.error.message);
    if (mode === "signup" && !result.data.session) return setMessage("Revisa tu correo y confirma tu cuenta antes de ingresar.");
    if (!result.data.session) return setMessage("No se pudo crear la sesion. Intenta ingresar nuevamente.");
    onAuthenticated(result.data.session.access_token);
    setMessage("Sesion iniciada.");
  };

  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="auth-bolt">T</span><strong>THOR</strong></div><p className="eyebrow">SISTEMA DE INVENTARIO Y VENTAS</p><h1>{mode === "login" ? "Ingresa a THOR" : "Activa tu acceso"}</h1><p className="auth-copy">{mode === "login" ? "Ingresa con el correo y la contrasena asignados para tu cuenta." : "Usa el mismo correo al que el administrador envio la invitacion. Si eres el primer usuario, seras superadministrador."}</p><form className="auth-form" onSubmit={submit}><label>Correo<input required name="email" type="email" autoComplete="email" placeholder="nombre@empresa.com" /></label><label>Contrasena<div className="password-field"><input required name="password" type={showPassword ? "text" : "password"} minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"} title={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}><span className={showPassword ? "eye-icon eye-visible" : "eye-icon"} aria-hidden="true" /></button></div></label><label className="remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Recordarme en este dispositivo</label><button className="primary" type="submit">{mode === "login" ? "Ingresar" : "Crear acceso"}</button><button className="text-button auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Recibiste una invitacion? Activa tu acceso" : "Ya tengo una cuenta"}</button><p className="auth-message" role="status">{message}</p></form></section></main>;
}
