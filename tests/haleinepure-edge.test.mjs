import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

const source = readFileSync(new URL('../supabase/functions/public-order-haleinepure/index.ts', import.meta.url), 'utf8')
const compiled = stripTypeScriptTypes(source.replace(/^import [^\n]*\n/gm, ''), { mode: 'strip' })
const pauseTime = Date.parse('2026-10-06T14:35:00Z') + 91 * 60_000

function setup() {
  const state = { rows: [], failInsert: false, failLookup: false }
  const db = {
    from(table) {
      assert.equal(table, 'orders')
      const filters = []
      return {
        select() { return this },
        eq(field, value) { filters.push([field, value]); return this },
        async maybeSingle() {
          if (state.failLookup) return { data: null, error: { code: '08006' } }
          const row = state.rows.find((x) => filters.every(([field, value]) => x[field] === value))
          return { data: row || null, error: null }
        },
        insert(row) {
          return {
            select() { return this },
            async single() {
              if (state.failInsert) return { data: null, error: { code: '42501', message: 'isolated insert rejected' } }
              if (state.rows.some((x) => x.client_request_id === row.client_request_id)) return { data: null, error: { code: '23505', message: 'duplicate unique request id' } }
              const saved = { ...row, id: state.rows.length + 1 }
              state.rows.push(saved)
              return { data: saved, error: null }
            },
          }
        },
      }
    },
  }
  class FakeDate extends Date {
    static now() { return pauseTime }
  }
  let handler
  runInNewContext(compiled, {
    Deno: {
      env: { get(key) { return key === 'SUPABASE_URL' ? 'https://test.invalid' : 'isolated-secret' } },
      serve(callback) { handler = callback },
    },
    createClient: () => db,
    Date: FakeDate,
    Response, Request, Headers, console,
  })
  assert.equal(typeof handler, 'function')
  async function post(input, origin = 'https://haleinepure.destockagerapide.com') {
    const response = await handler(new Request('https://test.invalid/functions/v1/public-order-haleinepure', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(input),
    }))
    return { status: response.status, body: await response.json() }
  }
  return { post, state }
}
const order = {
  name: 'Client Fictif',
  phone: '0700000000',
  quantity: 1,
  zone: 'abidjan',
  commune: 'Cocody',
  quartier: 'Quartier fictif',
  clientRequestId: 'hp-00000000-0000-4000-8000-000000000001',
}

test('une commande HaleinePure est enregistrable pendant les 5 minutes de pause visuelle', async () => {
  const { post, state } = setup()
  const response = await post(order)
  assert.equal(response.status, 201)
  assert.equal(response.body.ok, true)
  assert.equal(response.body.order.total, 6000)
  assert.equal(response.body.order.store_id, 'destockage-haleine')
  assert.equal(response.body.order.source_domain, 'haleinepure.destockagerapide.com')
  assert.equal(state.rows.length, 1)
})

test('commande trois pots à l’intérieur : livraison incluse et paiement avant expédition', async () => {
  const { post } = setup()
  const response = await post({ ...order, zone: 'interieur', city: 'Daloa', quantity: 3 })
  assert.equal(response.status, 201)
  assert.equal(response.body.order.delivery_fee, 0)
  assert.equal(response.body.order.total, 12000)
  assert.equal(response.body.order.status, 'awaiting_payment')
})

test('même identifiant de demande : commande retournée sans doublon', async () => {
  const { state, post } = setup()
  const first = await post(order)
  const second = await post(order)
  assert.equal(first.status, 201)
  assert.equal(second.status, 200)
  assert.equal(second.body.duplicate, true)
  assert.equal(second.body.order.order_number, first.body.order.order_number)
  assert.equal(state.rows.length, 1)
})

test('payload incorrect et origine étrangère rejetés', async () => {
  const { state, post } = setup()
  assert.equal((await post({ ...order, quantity: 99 })).status, 400)
  assert.equal((await post({ ...order, name: '' })).status, 400)
  assert.equal((await post(order, 'https://wrong.example')).status, 403)
  assert.equal(state.rows.length, 0)
})

test('erreur de lecture DB : aucune commande enregistrée', async () => {
  const { state, post } = setup()
  state.failLookup = true
  const response = await post(order)
  assert.equal(response.status, 503)
  assert.equal(response.body.order, undefined)
  assert.equal(state.rows.length, 0)
})

test('erreur d’insertion DB : aucune confirmation fictive', async () => {
  const { state, post } = setup()
  state.failInsert = true
  const response = await post(order)
  assert.equal(response.status, 500)
  assert.equal(response.body.ok, undefined)
  assert.equal(state.rows.length, 0)
})

test('identifiant réservé à une autre boutique : aucune commande privée renvoyée', async () => {
  const { state, post } = setup()
  state.rows.push({ client_request_id: order.clientRequestId, store_id: 'illix', customer_name: 'Client indépendant' })
  const response = await post(order)
  assert.equal(response.status, 500)
  assert.equal(response.body.order, undefined)
  assert.equal(state.rows.length, 1)
})
