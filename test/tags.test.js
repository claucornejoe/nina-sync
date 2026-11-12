import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedTags, tagDiff, brandTag } from '../src/tags.js';
import { splitName } from '../src/naming.js';

test('nombre BTS -> título y tamaño', () => {
  assert.deepEqual(splitName('Paco Rabanne Black XS Eau De Toilette Spray 100ml'), { title: 'Paco Rabanne Black XS Eau de Toilette', option: 'Tamaño', label: '100ml' });
  assert.equal(splitName('LATTAFA MOHRA EDP 100ml').title, 'Lattafa Mohra Eau de Parfum');
  assert.equal(splitName('Jean Paul Gaultier Le Male Eau De Toilette Spray 125ml Set 3 Piezas').label, 'Estuche');
});

test('etiquetas esperadas', () => {
  assert.deepEqual(expectedTags('Lattafa Mohra Eau de Parfum', [{ manufacturer: 'LATTAFA', categories: '14498/1' }]), ['Mujer', 'Eau de Parfum', 'Lattafa', 'Árabe']);
  assert.deepEqual(expectedTags('Le Male Eau de Toilette', [{ manufacturer: 'JEAN PAUL GAULTIER', categories: '14497/14508/1' }]), ['Hombre', 'Eau de Toilette', 'Jean Paul Gaultier']);
  assert.equal(brandTag("L'OCCITANE"), "L'Occitane");
});

test('solo corrige etiquetas gestionadas', () => {
  const d = tagDiff(['Mujer', 'Eau de Parfum', 'lattafa', 'oferta-semana', 'mi-etiqueta'], ['Hombre', 'Eau de Parfum', 'Lattafa']);
  assert.deepEqual(d, { add: ['Hombre'], remove: ['Mujer'] });
});
