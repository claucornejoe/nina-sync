import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../src/forum/rules.js';
import { portada, paginaTema, t, parrafos } from '../src/forum/tienda.js';

test('firma del proxy de Shopify (ejemplo de la documentación)', () => {
  const q = { extra: ['1', '2'], shop: 'shop-name.myshopify.com', logged_in_customer_id: '1', path_prefix: '/apps/awesome_reviews', timestamp: '1317327555', signature: '4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb' };
  assert.equal(rules.firmaProxy(q, 'hush'), q.signature);
  assert.equal(rules.verificarProxy(q, 'hush', 1317327555 * 1000), true);
  assert.equal(rules.verificarProxy(q, 'hush', (1317327555 + 3600) * 1000), false, 'caducada');
  assert.equal(rules.verificarProxy({ ...q, logged_in_customer_id: '2' }, 'hush', 1317327555 * 1000), false, 'manipulada');
  assert.equal(rules.verificarProxy({ ...q, signature: undefined }, 'hush'), false);
  const anon = rules.leerQuery('extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb');
  assert.deepEqual(anon.extra, ['1', '2']);
  assert.equal(rules.verificarProxy(anon, 'hush', 1317327555 * 1000), true, 'clienta sin sesión');
});

test('token de formulario: vale hoy y ayer, no para otra clienta', () => {
  const now = Date.UTC(2026, 10, 19, 12);
  const tok = rules.tokenForm('123', 's', now);
  assert.equal(rules.tokenValido(tok, '123', 's', now), true);
  assert.equal(rules.tokenValido(tok, '123', 's', now + 86400_000), true);
  assert.equal(rules.tokenValido(tok, '123', 's', now + 3 * 86400_000), false);
  assert.equal(rules.tokenValido(tok, '124', 's', now), false);
  assert.equal(rules.tokenValido('x', '123', 's', now), false);
});

test('validación de temas, respuestas y apodos', () => {
  assert.ok(rules.validarTema({ categoria: 'nada', titulo: 'Hola hola hola', cuerpo: 'x'.repeat(20) }).error);
  assert.ok(rules.validarTema({ categoria: 'skincare', titulo: 'Corto', cuerpo: 'x'.repeat(20) }).error);
  const ok = rules.validarTema({ categoria: 'skincare', titulo: '  ¿Rutina para <b>piel mixta</b>?  ', cuerpo: 'Tengo la zona T brillante\r\n\r\n\r\n\r\ny mejillas secas' });
  assert.deepEqual(ok, { categoria: 'skincare', titulo: '¿Rutina para piel mixta?', cuerpo: 'Tengo la zona T brillante\n\ny mejillas secas' });
  assert.ok(rules.validarRespuesta({ cuerpo: ' ' }).error);
  assert.equal(rules.validarApodo('Laura M.').apodo, 'Laura M.');
  assert.ok(rules.validarApodo('Equipo Nina').error, 'reservado');
  assert.ok(rules.validarApodo('<script>').error);
  assert.equal(rules.apodoPorDefecto('maría josé', 'pérez'), 'maría P.');
});

test('moderación: previa, confianza y mensajes sospechosos', () => {
  assert.equal(rules.decidirEstado({ texto: 'hola', modo: 'previa', aprobados: 10 }).estado, 'pendiente');
  assert.equal(rules.decidirEstado({ texto: 'hola', modo: 'confianza', aprobados: 2 }).estado, 'publicado');
  assert.equal(rules.decidirEstado({ texto: 'hola', modo: 'confianza', aprobados: 1 }).estado, 'pendiente');
  const enlace = rules.decidirEstado({ texto: 'mira www.otra-tienda.com', modo: 'confianza', aprobados: 9 });
  assert.deepEqual(enlace, { estado: 'pendiente', motivo: 'Lleva un enlace' });
  assert.equal(rules.decidirEstado({ texto: 'esta crema cura el acné', modo: 'confianza', aprobados: 9 }).motivo, 'Promesa de salud');
  assert.equal(rules.decidirEstado({ texto: 'www.x.com', equipo: true }).estado, 'publicado');
});

test('rutas de temas', () => {
  assert.equal(rules.rutaTema({ id: 12, titulo: '¿Qué rutina me recomendáis? Piel mixta & seca' }), 't/12-que-rutina-me-recomendais-piel-mixta-seca');
  assert.equal(rules.idDeRuta('12-que-rutina'), 12);
  assert.equal(rules.idDeRuta('abc'), null);
});

test('las páginas de la tienda neutralizan Liquid y HTML de las clientas', () => {
  assert.equal(t('{{ shop.email }} <b>'), '&#123;&#123; shop.email &#125;&#125; &lt;b&gt;');
  assert.equal(parrafos('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
  const malo = '{{ customer.email }} {% render "x" %} </script><script>alert(1)</script>';
  const tema = { id: 1, categoria: 'skincare', titulo: malo, cuerpo: malo, autor: malo, equipo: false, fijado: false, creado: new Date(), publicado_at: new Date(), actividad: new Date(), respuestas: 0, ayuda: 0 };
  const resp = [{ id: 2, cuerpo: malo, autor: malo, equipo: false, creado: new Date(), ayuda: 0 }];
  for (const html of [
    portada({ temas: [tema], total: 1, pagina: 1, porPagina: 15, catActual: null, sesion: true, perfil: { apodo: malo }, sugerido: '', token: 'x' }),
    paginaTema({ tema, respuestas: resp, sesion: true, perfil: null, sugerido: '', token: 'x', url: 'https://www.ninabeauty.es/apps/foro/t/1' }),
  ]) {
    assert.ok(!html.includes('{{ customer'), 'sin Liquid de la clienta');
    assert.ok(!/\{%\s*render/.test(html), 'sin etiquetas Liquid de la clienta');
    assert.ok(!html.includes('<script>alert'), 'sin HTML de la clienta');
    // El único Liquid que mandamos es el enlace de inicio de sesión.
    assert.deepEqual([...html.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]).filter((x) => !x.includes('routes.')), []);
  }
});

test('buscador del foro y temas de ejemplo', async () => {
  const { EJEMPLOS } = await import('../src/forum/ejemplos.js');
  const porCat = EJEMPLOS.reduce((a, e) => ({ ...a, [e.categoria]: (a[e.categoria] || 0) + 1 }), {});
  assert.deepEqual(porCat, { skincare: 2, perfumes: 3, maquillaje: 1, 'cabello-cuerpo': 1 });
  for (const e of EJEMPLOS) {
    assert.ok(rules.categoria(e.categoria), e.categoria);
    assert.ok(!rules.validarTema(e).error, e.titulo);
    assert.ok(e.respuestas.length >= 1 && e.respuestas.length <= 3, e.titulo);
    for (const r of e.respuestas) assert.ok(r.despues < e.hace, 'la respuesta va después del tema');
  }
  const tema = { id: 1, categoria: 'perfumes', titulo: 'Perfume para clase', cuerpo: 'x', autor: 'Ainhoa', ejemplo: true, equipo: false, fijado: false, creado: new Date(), publicado_at: new Date(), actividad: new Date(), respuestas: 0, ayuda: 0 };
  const html = portada({ temas: [tema], total: 1, pagina: 1, porPagina: 15, catActual: null, buscar: '"><b>', sesion: false });
  assert.ok(html.includes('Ainhoa · ejemplo') && html.includes('Tema de ejemplo'));
  assert.ok(html.includes('placeholder="Buscar en el foro"') && html.includes('value="&quot;&gt;&lt;b&gt;"'));
  assert.ok(html.includes('.search-action{display:none!important}'), 'oculta la lupa de productos');
  const pt = paginaTema({ tema, respuestas: [], sesion: false, url: 'https://www.ninabeauty.es/apps/foro/t/1' });
  assert.ok(!pt.includes('application/ld+json'), 'los ejemplos no van a Google como conversaciones');
});
