// Compatibilidad para rutas antiguas; la identidad ahora llega mediante JWT de Supabase.
export { requireActor, requireRole, type Actor } from "./auth";
