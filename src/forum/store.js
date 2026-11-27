// Foro Nina: temas, respuestas, votos «Me ayudó», denuncias y perfiles de las clientas (Postgres).
import { pool } from '../db.js';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS foro_perfiles (
      cliente_id TEXT PRIMARY KEY,          -- id numérico de la clienta en Shopify
      apodo TEXT NOT NULL,
      acepto_normas_at TIMESTAMPTZ,         -- aceptó normas, privacidad y que tiene 14 años o más
      bloqueada BOOLEAN NOT NULL DEFAULT false,
      creado TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS foro_temas (
      id SERIAL PRIMARY KEY,
      categoria TEXT NOT NULL,
      titulo TEXT NOT NULL,
      cuerpo TEXT NOT NULL,
      cliente_id TEXT,                      -- NULL si lo escribe el equipo
      autor TEXT NOT NULL,
      equipo BOOLEAN NOT NULL DEFAULT false,
      estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | publicado | rechazado
      fijado BOOLEAN NOT NULL DEFAULT false,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      publicado_at TIMESTAMPTZ,
      actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
      respuestas INT NOT NULL DEFAULT 0,
      ayuda INT NOT NULL DEFAULT 0,
      denuncias INT NOT NULL DEFAULT 0,
      motivo TEXT                           -- por qué quedó en revisión (enlace, palabra, denuncias…)
    );
    CREATE INDEX IF NOT EXISTS foro_temas_pub ON foro_temas(estado, fijado DESC, actividad DESC);
    CREATE TABLE IF NOT EXISTS foro_respuestas (
      id SERIAL PRIMARY KEY,
      tema_id INT NOT NULL REFERENCES foro_temas(id) ON DELETE CASCADE,
      cuerpo TEXT NOT NULL,
      cliente_id TEXT,
      autor TEXT NOT NULL,
      equipo BOOLEAN NOT NULL DEFAULT false,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      ayuda INT NOT NULL DEFAULT 0,
      denuncias INT NOT NULL DEFAULT 0,
      motivo TEXT
    );
    CREATE INDEX IF NOT EXISTS foro_respuestas_tema ON foro_respuestas(tema_id, estado, id);
    CREATE TABLE IF NOT EXISTS foro_votos (
      tipo TEXT NOT NULL, objeto_id INT NOT NULL, cliente_id TEXT NOT NULL,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tipo, objeto_id, cliente_id)
    );
    CREATE TABLE IF NOT EXISTS foro_denuncias (
      tipo TEXT NOT NULL, objeto_id INT NOT NULL, cliente_id TEXT NOT NULL, motivo TEXT,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tipo, objeto_id, cliente_id)
    );
    ALTER TABLE foro_temas ADD COLUMN IF NOT EXISTS ejemplo BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE foro_respuestas ADD COLUMN IF NOT EXISTS ejemplo BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE foro_respuestas ADD COLUMN IF NOT EXISTS alerta TEXT;
  `);
}

const tabla = (tipo) => (tipo === 'tema' ? 'foro_temas' : 'foro_respuestas');

// ---- Perfiles ----
export async function perfil(clienteId) {
  const r = await pool.query('SELECT * FROM foro_perfiles WHERE cliente_id=$1', [String(clienteId)]);
  return r.rows[0] || null;
}
export async function guardarPerfil(clienteId, apodo, acepta) {
  await pool.query(
    `INSERT INTO foro_perfiles (cliente_id, apodo, acepto_normas_at) VALUES ($1,$2,CASE WHEN $3 THEN now() END)
     ON CONFLICT (cliente_id) DO UPDATE SET apodo=EXCLUDED.apodo,
       acepto_normas_at=COALESCE(foro_perfiles.acepto_normas_at, EXCLUDED.acepto_normas_at)`,
    [String(clienteId), apodo, !!acepta],
  );
}
export async function bloquear(clienteId, si = true) {
  await pool.query(
    `INSERT INTO foro_perfiles (cliente_id, apodo, bloqueada) VALUES ($1,'Clienta',$2)
     ON CONFLICT (cliente_id) DO UPDATE SET bloqueada=$2`,
    [String(clienteId), si],
  );
}
/** Mensajes publicados de una clienta (para la moderación «de confianza»). */
export async function publicadosDe(clienteId) {
  const r = await pool.query(
    `SELECT (SELECT count(*) FROM foro_temas WHERE cliente_id=$1 AND estado='publicado')
          + (SELECT count(*) FROM foro_respuestas WHERE cliente_id=$1 AND estado='publicado') AS n`,
    [String(clienteId)],
  );
  return Number(r.rows[0].n);
}
/** Cuántos temas y respuestas ha enviado en las últimas 24 h (límite antispam). */
export async function enviadosHoy(clienteId) {
  const r = await pool.query(
    `SELECT (SELECT count(*) FROM foro_temas WHERE cliente_id=$1 AND creado > now() - interval '1 day') AS temas,
            (SELECT count(*) FROM foro_respuestas WHERE cliente_id=$1 AND creado > now() - interval '1 day') AS respuestas`,
    [String(clienteId)],
  );
  return { temas: Number(r.rows[0].temas), respuestas: Number(r.rows[0].respuestas) };
}

// ---- Temas ----
export async function crearTema({ categoria, titulo, cuerpo, clienteId = null, autor, equipo = false, estado, motivo = null }) {
  const r = await pool.query(
    `INSERT INTO foro_temas (categoria, titulo, cuerpo, cliente_id, autor, equipo, estado, motivo, publicado_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $7='publicado' THEN now() END) RETURNING *`,
    [categoria, titulo, cuerpo, clienteId && String(clienteId), autor, equipo, estado, motivo],
  );
  return r.rows[0];
}
export async function tema(id) {
  const r = await pool.query('SELECT * FROM foro_temas WHERE id=$1', [id]);
  return r.rows[0] || null;
}
/** `buscar`: palabras que deben salir en el título o el mensaje del tema (o en sus respuestas publicadas). */
export async function temasPublicados({ categoria = null, limite = 20, offset = 0, buscar = '' } = {}) {
  const palabras = String(buscar || '').trim().split(/\s+/).filter(Boolean).slice(0, 6)
    .map((w) => `%${w.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
  const r = await pool.query(
    `SELECT *, count(*) OVER() AS total,
       EXISTS (SELECT 1 FROM foro_respuestas r WHERE r.tema_id=t.id AND r.estado='publicado' AND r.equipo) AS con_nina
     FROM foro_temas t WHERE estado='publicado' AND ($1::text IS NULL OR categoria=$1)
       AND NOT EXISTS (SELECT 1 FROM unnest($4::text[]) w WHERE NOT (t.titulo ILIKE w OR t.cuerpo ILIKE w
         OR EXISTS (SELECT 1 FROM foro_respuestas r WHERE r.tema_id=t.id AND r.estado='publicado' AND r.cuerpo ILIKE w)))
     ORDER BY fijado DESC, actividad DESC LIMIT $2 OFFSET $3`,
    [categoria, limite, offset, palabras],
  );
  return { temas: r.rows, total: Number(r.rows[0]?.total || 0) };
}
export async function respuestasPublicadas(temaId) {
  const r = await pool.query(`SELECT * FROM foro_respuestas WHERE tema_id=$1 AND estado='publicado' ORDER BY id`, [temaId]);
  return r.rows;
}
/** Respuestas de una clienta que aún esperan revisión: solo se le enseñan a ella, para que sepa que han llegado. */
export async function respuestasPendientesDe(temaId, clienteId) {
  if (!clienteId) return [];
  const r = await pool.query(`SELECT * FROM foro_respuestas WHERE tema_id=$1 AND cliente_id=$2 AND estado='pendiente' ORDER BY id`, [temaId, String(clienteId)]);
  return r.rows;
}
export async function crearRespuesta({ temaId, cuerpo, clienteId = null, autor, equipo = false, estado, motivo = null, alerta = null }) {
  const r = await pool.query(
    `INSERT INTO foro_respuestas (tema_id, cuerpo, cliente_id, autor, equipo, estado, motivo, alerta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [temaId, cuerpo, clienteId && String(clienteId), autor, equipo, estado, motivo, alerta],
  );
  if (estado === 'publicado') await recontar(temaId);
  return r.rows[0];
}
/** Recalcula respuestas publicadas y última actividad de un tema. */
export async function recontar(temaId) {
  await pool.query(
    `UPDATE foro_temas t SET respuestas = s.n, actividad = GREATEST(COALESCE(t.publicado_at, t.creado), COALESCE(s.ultima, t.creado))
     FROM (SELECT count(*)::int AS n, max(creado) AS ultima FROM foro_respuestas WHERE tema_id=$1 AND estado='publicado') s WHERE t.id=$1`,
    [temaId],
  );
}

/** Temas publicados por categoría, para las tarjetas de categorías del foro. */
export async function conteoCategorias() {
  const r = await pool.query(`SELECT categoria, count(*)::int AS n FROM foro_temas WHERE estado='publicado' GROUP BY categoria`);
  return Object.fromEntries(r.rows.map((x) => [x.categoria, x.n]));
}

// ---- Temas de ejemplo (para arrancar; se borran con un botón) ----
export async function hayEjemplos() {
  const r = await pool.query('SELECT count(*)::int AS n FROM foro_temas WHERE ejemplo');
  return r.rows[0].n;
}
/** Publica los temas de ejemplo con sus respuestas, escalonados en el tiempo. No hace nada si ya existen. */
export async function crearEjemplos(lista) {
  if (await hayEjemplos()) return 0;
  for (const e of lista) {
    const t = await pool.query(
      `INSERT INTO foro_temas (categoria, titulo, cuerpo, autor, estado, ejemplo, creado, publicado_at, actividad)
       VALUES ($1,$2,$3,$4,'publicado',true, now() - make_interval(hours => $5), now() - make_interval(hours => $5), now() - make_interval(hours => $5)) RETURNING id`,
      [e.categoria, e.titulo, e.cuerpo, e.autor, e.hace],
    );
    for (const r of e.respuestas || []) {
      await pool.query(
        `INSERT INTO foro_respuestas (tema_id, cuerpo, autor, equipo, estado, ejemplo, creado)
         VALUES ($1,$2,$3,$4,'publicado',true, now() - make_interval(hours => $5))`,
        [t.rows[0].id, r.cuerpo, r.equipo ? 'Equipo Nina' : r.autor, !!r.equipo, Math.max(0, e.hace - (r.despues || 1))],
      );
    }
    await recontar(t.rows[0].id);
  }
  return lista.length;
}
/** Borra los temas de ejemplo (con todas sus respuestas) y las respuestas de ejemplo sueltas. */
export async function borrarEjemplos() {
  const r = await pool.query('DELETE FROM foro_temas WHERE ejemplo RETURNING id');
  const sueltas = await pool.query('DELETE FROM foro_respuestas WHERE ejemplo RETURNING tema_id');
  for (const x of sueltas.rows) await recontar(x.tema_id);
  return r.rowCount;
}

// ---- Moderación ----
export async function cambiarEstado(tipo, id, estado) {
  const r = await pool.query(
    `UPDATE ${tabla(tipo)} SET estado=$2${tipo === 'tema' ? ", publicado_at = CASE WHEN $2='publicado' THEN COALESCE(publicado_at, now()) ELSE publicado_at END" : ''}${estado === 'publicado' ? ', denuncias=0, motivo=NULL' : ''} WHERE id=$1 RETURNING *`,
    [id, estado],
  );
  const row = r.rows[0];
  if (row) await recontar(tipo === 'tema' ? row.id : row.tema_id);
  if (row && estado === 'publicado') await pool.query('DELETE FROM foro_denuncias WHERE tipo=$1 AND objeto_id=$2', [tipo, id]);
  return row || null;
}
export async function borrar(tipo, id) {
  const r = await pool.query(`DELETE FROM ${tabla(tipo)} WHERE id=$1 RETURNING *`, [id]);
  const row = r.rows[0];
  if (row && tipo === 'respuesta') await recontar(row.tema_id);
  await pool.query('DELETE FROM foro_votos WHERE tipo=$1 AND objeto_id=$2', [tipo, id]);
  await pool.query('DELETE FROM foro_denuncias WHERE tipo=$1 AND objeto_id=$2', [tipo, id]);
  return row || null;
}
export async function fijar(id, si) {
  await pool.query('UPDATE foro_temas SET fijado=$2 WHERE id=$1', [id, !!si]);
}
/** Todo lo que espera revisión: pendientes y lo denunciado. */
export async function porRevisar() {
  const temas = await pool.query(`SELECT * FROM foro_temas WHERE estado='pendiente' ORDER BY id`);
  const resp = await pool.query(
    `SELECT r.*, t.titulo AS tema_titulo FROM foro_respuestas r JOIN foro_temas t ON t.id=r.tema_id WHERE r.estado='pendiente' ORDER BY r.id`,
  );
  return { temas: temas.rows, respuestas: resp.rows };
}
/** Respuestas publicadas con alerta (palabrotas, insultos, enlaces...) que Clau aún no ha mirado. */
export async function alertas() {
  const r = await pool.query(
    `SELECT r.*, t.titulo AS tema_titulo, t.id AS tema_id FROM foro_respuestas r JOIN foro_temas t ON t.id=r.tema_id WHERE r.alerta IS NOT NULL AND r.estado='publicado' ORDER BY r.id DESC`,
  );
  return r.rows;
}
export async function quitarAlerta(id) {
  const r = await pool.query('UPDATE foro_respuestas SET alerta=NULL WHERE id=$1 RETURNING *', [id]);
  return r.rows[0] || null;
}
export async function recientes(limite = 30) {
  const r = await pool.query(`SELECT * FROM foro_temas WHERE estado='publicado' ORDER BY fijado DESC, actividad DESC LIMIT $1`, [limite]);
  return r.rows;
}
export async function cifras() {
  const r = await pool.query(`SELECT
    (SELECT count(*) FROM foro_temas WHERE estado='publicado')::int AS temas,
    (SELECT count(*) FROM foro_respuestas WHERE estado='publicado')::int AS respuestas,
    (SELECT count(*) FROM foro_temas WHERE estado='pendiente')::int + (SELECT count(*) FROM foro_respuestas WHERE estado='pendiente')::int AS pendientes,
    (SELECT count(*) FROM foro_respuestas WHERE alerta IS NOT NULL AND estado='publicado')::int AS alertas,
    (SELECT count(DISTINCT cliente_id) FROM (SELECT cliente_id FROM foro_temas UNION ALL SELECT cliente_id FROM foro_respuestas) x WHERE cliente_id IS NOT NULL)::int AS clientas,
    (SELECT count(*) FROM foro_temas t WHERE estado='publicado' AND NOT equipo AND NOT EXISTS (SELECT 1 FROM foro_respuestas r WHERE r.tema_id=t.id AND r.equipo))::int AS sin_respuesta_nina`);
  return r.rows[0];
}

// ---- Votos y denuncias ----
/** «Me ayudó»: un voto por clienta. Devuelve el total nuevo. */
export async function votar(tipo, id, clienteId) {
  const ins = await pool.query('INSERT INTO foro_votos (tipo, objeto_id, cliente_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [tipo, id, String(clienteId)]);
  const r = await pool.query(`UPDATE ${tabla(tipo)} SET ayuda = ayuda + $2 WHERE id=$1 AND estado='publicado' RETURNING ayuda`, [id, ins.rowCount]);
  return r.rows[0]?.ayuda ?? null;
}
/** Denuncia. Con `umbral` denuncias distintas, el mensaje se oculta hasta que lo revises. */
export async function denunciar(tipo, id, clienteId, motivo, umbral = 3) {
  const ins = await pool.query('INSERT INTO foro_denuncias (tipo, objeto_id, cliente_id, motivo) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [tipo, id, String(clienteId), motivo]);
  if (!ins.rowCount) return false;
  const r = await pool.query(
    `UPDATE ${tabla(tipo)} SET denuncias = denuncias + 1,
       estado = CASE WHEN denuncias + 1 >= $2 AND NOT equipo THEN 'pendiente' ELSE estado END,
       motivo = CASE WHEN denuncias + 1 >= $2 AND NOT equipo THEN 'Denunciado por ' || (denuncias + 1) || ' clientas' ELSE motivo END
     WHERE id=$1 RETURNING *`,
    [id, umbral],
  );
  const row = r.rows[0];
  if (row) await recontar(tipo === 'tema' ? row.id : row.tema_id);
  return true;
}
export async function denunciados() {
  const r = await pool.query(`SELECT d.tipo, d.objeto_id, count(*)::int AS n, string_agg(DISTINCT d.motivo, ' · ') AS motivos,
      COALESCE(t.titulo, rt.titulo) AS titulo, COALESCE(t.cuerpo, r.cuerpo) AS cuerpo, COALESCE(t.autor, r.autor) AS autor,
      COALESCE(t.estado, r.estado) AS estado, COALESCE(t.id, r.tema_id) AS tema_id
    FROM foro_denuncias d
    LEFT JOIN foro_temas t ON d.tipo='tema' AND t.id=d.objeto_id
    LEFT JOIN foro_respuestas r ON d.tipo='respuesta' AND r.id=d.objeto_id
    LEFT JOIN foro_temas rt ON rt.id=r.tema_id
    GROUP BY d.tipo, d.objeto_id, t.titulo, rt.titulo, t.cuerpo, r.cuerpo, t.autor, r.autor, t.estado, r.estado, t.id, r.tema_id
    ORDER BY n DESC`);
  return r.rows;
}
