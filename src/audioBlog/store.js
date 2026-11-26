// Ajustes de «Escuchar artículo» (voz elegida en el panel). Sin base de datos, usa las variables de Railway.
import { pool } from '../db.js';

const mem = new Map();
export async function migrate() {
  if (!pool) return;
  await pool.query('CREATE TABLE IF NOT EXISTS audio_blog_ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
}
export async function get(clave) {
  if (!pool) return mem.get(clave) ?? null;
  const r = await pool.query('SELECT valor FROM audio_blog_ajustes WHERE clave=$1', [clave]);
  return r.rows[0]?.valor ?? null;
}
export async function set(clave, valor) {
  if (!pool) return void mem.set(clave, valor);
  await pool.query('INSERT INTO audio_blog_ajustes(clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor', [clave, valor]);
}
