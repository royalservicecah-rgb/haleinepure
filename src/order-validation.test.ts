import test from 'node:test'
import assert from 'node:assert/strict'
import { isPersistedHaleineOrder } from './order-validation.ts'

const correct = {
  order_number: 'HAL-123456',
  store_id: 'destockage-haleine',
  source_domain: 'haleinepure.destockagerapide.com',
  currency: 'XOF',
  quantity: 2,
  total: 10000,
}
const expected = { quantity: 2, total: 10000 }

test('commande enregistrée : réponse complète autorisée', () => {
  assert.equal(isPersistedHaleineOrder(correct, expected), true)
})
test('jamais de succès sur réponse vide ou sans référence', () => {
  assert.equal(isPersistedHaleineOrder(null, expected), false)
  assert.equal(isPersistedHaleineOrder({ ...correct, order_number: '' }, expected), false)
})
test('jamais de succès pour une autre boutique ou un autre domaine', () => {
  assert.equal(isPersistedHaleineOrder({ ...correct, store_id: 'illix' }, expected), false)
  assert.equal(isPersistedHaleineOrder({ ...correct, source_domain: 'haleine.destockagerapide.com' }, expected), false)
})
test('jamais de succès avec prix, devise ou quantité incompatibles', () => {
  assert.equal(isPersistedHaleineOrder({ ...correct, total: 8000 }, expected), false)
  assert.equal(isPersistedHaleineOrder({ ...correct, quantity: 1 }, expected), false)
  assert.equal(isPersistedHaleineOrder({ ...correct, currency: 'GNF' }, expected), false)
})
