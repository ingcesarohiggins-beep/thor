"use client";

import { FormEvent, useState } from "react";
import { createSupabaseAuthClient } from "./lib/supabase-browser";

export function SetupNeeded() {
  return <main className="thor-app"><section className="workspace"><div className="content"><section className="card"><p className="eyebrow">CONFIGURACIÓN PENDIENTE</p><h1>Conecta Supabase para iniciar THOR</h1><p>Agrega la URL del proyecto y la clave publicable en las variables del hosting. Nunca uses una clave secreta en el navegador.</p></section></div></section></main>;
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
    setMessage("Procesando…");
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (result.error) return setMessage(result.error.message);
    if (mode === "signup" && !result.data.session) return setMessage("Revisa tu correo y confirma tu cuenta antes de ingresar.");
    if (!result.data.session) return setMessage("No se pudo crear la sesión. Intenta ingresar nuevamente.");
    onAuthenticated(result.data.session.access_token);
    setMessage("Sesión iniciada.");
  };
  return <main className="thor-app"><section className="workspace"><div className="content"><section className="card"><p className="eyebrow">THOR</p><h1>{mode === "login" ? "Ingresa a THOR" : "Crea el primer acceso"}</h1><p>Usa tu correo y una contraseña segura. El primer usuario será el superadministrador.</p><form className="modal" onSubmit={submit}><label>Correo<input required name="email" type="email" autoComplete="email" /></label><label>Contraseña<div className="two-fields"><input required name="password" type={showPassword ? "text" : "password"} minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button className="secondary" type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Ocultar" : "Ver"}</button></div></label><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Recordarme en este dispositivo</label><button className="primary" type="submit">{mode === "login" ? "Ingresar" : "Crear acceso"}</button><button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Crear primera cuenta" : "Ya tengo cuenta"}</button><p role="status">{message}</p></form></section></div></section></main>;
}
