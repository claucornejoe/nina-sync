// Progreso de la sincronización en marcha, para enseñarlo en el panel en tiempo real.
const STEPS = ['Comprobando la tienda', 'Leyendo productos de Shopify', 'Consultando BTS', 'Calculando cambios', 'Aplicando cambios en Shopify', 'Buscando novedades de BTS', 'Guardando el informe'];
let state = null;

export function start() {
  state = { step: 0, label: STEPS[0], done: 0, total: 0, startedAt: Date.now(), steps: STEPS.length };
}
export function step(i, total = 0) {
  if (!state) return;
  Object.assign(state, { step: i, label: STEPS[i], done: 0, total });
}
export function tick(done, total) {
  if (!state) return;
  state.done = done;
  if (total !== undefined) state.total = total;
}
export function stop() {
  state = null;
}
export function get() {
  return state && { ...state, elapsed: Math.round((Date.now() - state.startedAt) / 1000) };
}
