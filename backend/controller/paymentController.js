import supabase from '../database/db.js'
import crypto from 'crypto'
import { randomUUID } from 'crypto'
import { sendMakeNotification } from '../utils/makeWebhook.js'
import { logAudit } from '../utils/auditLogger.js'

const HITPAY_API_KEY = process.env.HITPAY_API_KEY
const HITPAY_SALT = process.env.HITPAY_SALT // signature secret
const HITPAY_BASE_URL = process.env.HITPAY_BASE_URL
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
const SERVER_BASE_URL = process.env.SERVER_BASE_URL
const HITPAY_ENABLED = (process.env.HITPAY_ENABLED || 'true').toLowerCase() !== 'false'

const ensureEnv = (res) => {
  const missing = []
  if (!HITPAY_API_KEY) missing.push('HITPAY_API_KEY')
  if (!HITPAY_SALT) missing.push('HITPAY_SALT')
  if (!HITPAY_BASE_URL) missing.push('HITPAY_BASE_URL')
  if (!FRONTEND_URL) missing.push('FRONTEND_URL')
  if (!SERVER_BASE_URL) missing.push('SERVER_BASE_URL')
  if (missing.length > 0) {
    res.status(500).json({ error: `Missing environment variables: ${missing.join(', ')}` })
    return false
  }
  return true
}

export const createHitpayCheckoutSession = async (req, res) => {
  try {
    const { orderId } = req.body
    if (!orderId) return res.status(400).json({ error: 'orderId required' })

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('orderId, eventId, totalAmount, currency, status, buyerName, buyerEmail, buyerPhone, metadata')
      .eq('orderId', orderId)
      .maybeSingle()
    if (orderErr) return res.status(500).json({ error: orderErr.message })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.status === 'PAID') return res.status(400).json({ error: 'Order already paid' })
    if ((order.totalAmount || 0) <= 0) return res.status(400).json({ error: 'Free orders do not require payment' })

    if (!HITPAY_ENABLED) {
      return res.status(503).json({ error: 'HitPay is disabled. Set HITPAY_ENABLED=true to enable payments.' })
    }

    if (!ensureEnv(res)) return

    const payload = new URLSearchParams()
    payload.set('amount', String(Number(order.totalAmount)))
    payload.set('currency', order.currency || 'PHP')
    payload.set('reference_number', order.orderId)
    payload.set('redirect_url', `${FRONTEND_URL}/#/payment/status?sessionId=${order.orderId}`)
    payload.set('webhook', `${SERVER_BASE_URL}/api/payments/hitpay/webhook`)
    payload.set('purpose', `Order ${order.orderId}`)
    if (order.buyerEmail) payload.set('email', order.buyerEmail)
    if (order.buyerName) payload.set('name', order.buyerName)

    const response = await fetch(`${HITPAY_BASE_URL}/v1/payment-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-BUSINESS-API-KEY': HITPAY_API_KEY
      },
      body: payload.toString()
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('HitPay checkout creation failed', data)
      return res.status(500).json({ error: data?.error || data?.message || 'Failed to create HitPay payment request' })
    }

    const hitpayReferenceId = data.payment_request_id || data.id || data.reference_number
    const checkoutUrl = data.url ?? data.payment_url ?? data.checkout_url

    if (!hitpayReferenceId) {
      console.error('HitPay reference ID missing from response', data)
      return res.status(500).json({ error: 'HitPay reference ID missing from response' })
    }

    if (!checkoutUrl || checkoutUrl === 'null') {
      console.error('HitPay checkout URL missing or null', data)
      return res.status(500).json({ error: 'Checkout URL missing from HitPay response' })
    }

    // record payment transaction
    const { data: paymentTx, error: paymentTxErr } = await supabase
      .from('paymentTransactions')
      .insert({
        orderId: order.orderId,
        gateway: { name: 'HITPAY' },
        hitpayReferenceId,
        amount: order.totalAmount,
        currency: order.currency,
        status: 'PENDING',
        rawPayload: data
      })
      .select('paymentTransactionId')
      .maybeSingle()
    if (paymentTxErr) {
      console.error('Failed to create payment transaction', paymentTxErr)
      return res.status(500).json({ error: paymentTxErr.message })
    }

    console.log('[Payments] Checkout session created', {
      orderId: order.orderId,
      hitpayReferenceId,
      amount: order.totalAmount,
      currency: order.currency || 'PHP'
    })

    await logAudit({
      actionType: 'CHECKOUT_SESSION_CREATED',
      orderId: order.orderId,
      paymentTransactionId: paymentTx?.paymentTransactionId || null,
      details: {
        gateway: 'HITPAY',
        hitpayReferenceId,
        amount: order.totalAmount,
        currency: order.currency || 'PHP'
      },
      req
    })

    return res.status(200).json({ checkoutUrl, hitpayReferenceId })
  } catch (err) {
    console.error('createHitpayCheckoutSession error', err)
    return res.status(500).json({ error: err?.message || 'Unexpected error' })
  }
}

export const getPaymentStatus = async (req, res) => {
  try {
    const sessionId = req.query?.sessionId
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('orderId, eventId, status, totalAmount, currency, buyerName, buyerEmail, buyerPhone, metadata, expiresAt, created_at, updated_at')
      .eq('orderId', sessionId)
      .maybeSingle()
    if (orderErr) return res.status(500).json({ error: orderErr.message })
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('eventId, eventName, locationType, locationText, streamingPlatform, startAt, endAt')
      .eq('eventId', order.eventId)
      .maybeSingle()
    if (eventErr) return res.status(500).json({ error: eventErr.message })

    let normalizedStatus = 'PENDING'
    switch (order.status) {
      case 'PAID':
        normalizedStatus = 'PAID'
        break
      case 'FAILED':
        normalizedStatus = 'FAILED'
        break
      case 'EXPIRED':
        normalizedStatus = 'EXPIRED'
        break
      case 'PENDING_PAYMENT':
      case 'DRAFT':
        normalizedStatus = 'PENDING'
        break
      case 'CANCELLED':
      case 'REFUNDED':
        normalizedStatus = 'FAILED'
        break
      default:
        normalizedStatus = order.status || 'PENDING'
    }


    return res.status(200).json({
      ...order,
      status: normalizedStatus,
      eventName: event?.eventName || '',
      locationType: event?.locationType || null,
      locationText: event?.locationText || null,
      streamingPlatform: event?.streamingPlatform || null,
      eventStartAt: event?.startAt || null,
      eventEndAt: event?.endAt || null
    })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' })
  }
}

const computeHmac = (message, digest = 'hex') => {
  return crypto.createHmac('sha256', HITPAY_SALT).update(message).digest(digest)
}

const safeDecode = (value) => {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, '%20'))
  } catch (err) {
    return String(value)
  }
}

const safeEncode = (value) => {
  try {
    return encodeURIComponent(String(value))
  } catch (err) {
    return String(value)
  }
}

const computeLegacyHmac = (payloadObj) => {
  const entries = Object.entries(payloadObj)
    .filter(([k, v]) => k !== 'hmac' && v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  const message = entries.map(([k, v]) => `${k}${v}`).join('')
  return computeHmac(message, 'hex')
}

const computeRawSignature = (rawBody) => {
  return computeHmac(rawBody, 'hex')
}

const buildLegacyHmacCandidates = ({ payload, rawBody }) => {
  const candidates = []
  if (rawBody && rawBody.length) {
    const rawString = String(rawBody)
    candidates.push(rawString)
    const rawParts = rawString
      .split('&')
      .map((part) => part.trim())
      .filter(Boolean)
    const withoutHmac = rawParts
      .filter((part) => !part.toLowerCase().startsWith('hmac='))
      .join('&')
    if (withoutHmac) {
      candidates.push(withoutHmac)
      const decodedWithoutHmac = safeDecode(withoutHmac)
      if (decodedWithoutHmac && decodedWithoutHmac !== withoutHmac) {
        candidates.push(decodedWithoutHmac)
      }
      const plusNormalized = withoutHmac.replace(/\+/g, '%20')
      const decodedPlusNormalized = safeDecode(plusNormalized)
      if (
        decodedPlusNormalized &&
        decodedPlusNormalized !== withoutHmac &&
        decodedPlusNormalized !== decodedWithoutHmac
      ) {
        candidates.push(decodedPlusNormalized)
      }
    }

    const params = new URLSearchParams(rawString)
    if (params.has('hmac')) params.delete('hmac')
    const keys = Array.from(new Set(Array.from(params.keys()))).sort((a, b) =>
      a.localeCompare(b)
    )
    const sortedPairs = []
    for (const key of keys) {
      const values = params.getAll(key)
      if (!values.length) values.push('')
      for (const value of values) {
        sortedPairs.push(`${safeEncode(key)}=${safeEncode(value)}`)
      }
    }
    const sortedQuery = sortedPairs.join('&')
    if (sortedQuery) candidates.push(sortedQuery)
  }

  const entries = Object.entries(payload || {})
    .filter(([key, value]) => key !== 'hmac' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))

  if (entries.length) {
    const keyValueMessage = entries.map(([key, value]) => `${key}=${value}`).join('&')
    const keyValueEncoded = entries
      .map(([key, value]) => `${safeEncode(key)}=${safeEncode(value)}`)
      .join('&')
    const pipeMessage = entries.map(([key, value]) => `${key}:${value}`).join('|')
    const concatMessage = entries.map(([key, value]) => `${key}${value}`).join('')
    if (keyValueMessage) candidates.push(keyValueMessage)
    if (keyValueEncoded && keyValueEncoded !== keyValueMessage) candidates.push(keyValueEncoded)
    if (pipeMessage) candidates.push(pipeMessage)
    if (concatMessage) candidates.push(concatMessage)
  }

  return Array.from(new Set(candidates))
}

const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

const hashToUuid = (value) => {
  const hash = crypto.createHash('sha256').update(value).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

const deriveWebhookExternalId = ({ payload, eventData, rawBody, eventType }) => {
  const candidates = [
    payload?.id,
    payload?.event_id,
    payload?.eventId,
    payload?.data?.id,
    payload?.data?.payment_request_id,
    payload?.payment_request_id,
    payload?.payment_request?.id,
    eventData?.id,
    eventData?.payment_request_id
  ].filter(Boolean)
  const candidate = candidates.find(Boolean)
  if (candidate) {
    if (isUuid(candidate)) return candidate
    const withEvent = `${eventType || 'event'}:${candidate}`
    return hashToUuid(withEvent)
  }
  const rawForHash = rawBody && rawBody.length ? rawBody : JSON.stringify(payload || {})
  return hashToUuid(rawForHash)
}

export const hitpayWebhook = async (req, res) => {
  let webhookEventId = null
  const markWebhookStatus = async (processingStatus) => {
    if (!webhookEventId) return
    const { error: updateErr } = await supabase
      .from('webhookEvents')
      .update({ processingStatus, processedAt: new Date().toISOString() })
      .eq('webhookEventsId', webhookEventId)
    if (updateErr) console.error('Webhook event update failed', updateErr)
  }

  try {
    console.log('[Webhook Debug] Request received', {
      hasRawBody: Boolean(req.rawBody),
      rawBodyLength: req.rawBody?.length || 0,
      rawBodyPreview: req.rawBody?.substring(0, 100) || null,
      bodyKeys: Object.keys(req.body || {}),
      headers: {
        contentType: req.headers['content-type'],
        signature:
          req.headers['hitpay-signature'] ||
          req.headers['x-hitpay-signature'] ||
          req.headers['x-signature'] ||
          null
      }
    })
    if (!ensureEnv(res)) return
    const payload = req.body || {}
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : ''
    const payloadString = JSON.stringify(payload || {})
    const bodyCandidates = rawBody && rawBody.length ? [rawBody] : ['']
    if (payloadString && !bodyCandidates.includes(payloadString)) {
      bodyCandidates.push(payloadString)
    }
    const signatureHeaderRaw =
      req.headers['hitpay-signature'] ||
      req.headers['x-hitpay-signature'] ||
      req.headers['x-signature']
    const signatureHeader = Array.isArray(signatureHeaderRaw)
      ? signatureHeaderRaw[0]
      : signatureHeaderRaw
    const legacyHmacRaw = payload.hmac || req.query?.hmac
    const legacyHmac = legacyHmacRaw
      ? String(legacyHmacRaw).trim().replace(/^sha256=/i, '')
      : null
    const signatureDebug = {
      hasSignatureHeader: Boolean(signatureHeader),
      signatureHeaderLength: signatureHeader ? String(signatureHeader).length : 0,
      signatureHeaderPrefix: signatureHeader ? String(signatureHeader).slice(0, 12) : null,
      signatureHeaderSuffix: signatureHeader ? String(signatureHeader).slice(-12) : null,
      hasSha256Prefix: /^sha256=/i.test(String(signatureHeader || '')),
      rawBodyLength: rawBody.length,
      payloadKeys: Object.keys(payload || {}),
      bodyCandidateLengths: bodyCandidates.map((body) => body.length),
      hasLegacyHmac: Boolean(legacyHmac),
      legacyHmacLength: legacyHmac ? String(legacyHmac).length : 0,
      legacyHmacPrefix: legacyHmac ? String(legacyHmac).slice(0, 12) : null,
      legacyHmacSuffix: legacyHmac ? String(legacyHmac).slice(-12) : null
    }

    if (signatureHeader) {
      const received = String(signatureHeader || '').trim().replace(/^sha256=/i, '')
      const matchesHex = bodyCandidates.some((body) =>
        computeRawSignature(body).toLowerCase() === received.toLowerCase()
      )
      const matchesBase64 = bodyCandidates.some((body) =>
        crypto.createHmac('sha256', HITPAY_SALT).update(body).digest('base64') === received
      )
      if (!matchesHex && !matchesBase64) {
        console.error('[Webhook] Signature mismatch', {
          ...signatureDebug,
          matchesHex,
          matchesBase64
        })
        return res.status(401).json({ error: 'Invalid signature' })
      }
      console.log('[Webhook] Signature verified', {
        ...signatureDebug,
        matchesHex,
        matchesBase64
      })
    } else if (legacyHmac) {
      const legacyCandidates = buildLegacyHmacCandidates({ payload, rawBody })
      const legacyCandidateDigests = legacyCandidates.map((candidate) => {
        const hex = computeHmac(candidate, 'hex')
        const base64 = computeHmac(candidate, 'base64')
        return { candidate, hex, base64 }
      })
      const matchesLegacyHex = legacyCandidateDigests.some((entry) =>
        entry.hex.toLowerCase() === legacyHmac.toLowerCase()
      )
      const matchesLegacyBase64 = legacyCandidateDigests.some((entry) => entry.base64 === legacyHmac)
      const legacyCandidatesInfo = legacyCandidateDigests.map((entry) => ({
        length: entry.candidate.length,
        hexPrefix: entry.hex.slice(0, 8),
        hexSuffix: entry.hex.slice(-8),
        base64Prefix: entry.base64.slice(0, 8),
        base64Suffix: entry.base64.slice(-8)
      }))
      if (!matchesLegacyHex && !matchesLegacyBase64) {
        console.error('[Webhook] Legacy signature mismatch', {
          ...signatureDebug,
          legacyCandidatesLengths: legacyCandidates.map((candidate) => candidate.length),
          legacyCandidatesInfo,
          matchesLegacyHex,
          matchesLegacyBase64
        })
        return res.status(401).json({ error: 'Invalid signature' })
      }
      console.log('[Webhook] Legacy signature verified', {
        ...signatureDebug,
        legacyCandidatesLengths: legacyCandidates.map((candidate) => candidate.length),
        legacyCandidatesInfo,
        matchesLegacyHex,
        matchesLegacyBase64
      })
    } else {
      console.error('[Webhook] Missing signature', signatureDebug)
      return res.status(400).json({ error: 'Missing webhook signature' })
    }

    const eventType = payload.event || payload.type || payload.event_type
    const eventData = payload?.data?.payment_request || payload?.data || payload?.payment_request || payload
    const reference = eventData.reference_number || payload.reference_number || payload.reference || payload.order_id
    const hitpayReferenceId = eventData.payment_request_id || eventData.id || payload.payment_request_id || payload.id
    const statusValue = (eventData.status || payload.status || '').toUpperCase()

    const externalId = deriveWebhookExternalId({ payload, eventData, rawBody, eventType })
    const receivedAt = new Date().toISOString()

    // Debug: Log raw payload
    console.log('[Debug] Raw payload:', {
      payload,
      payloadType: typeof payload,
      payloadKeys: Object.keys(payload || {}),
      payloadStringified: JSON.stringify(payload)
    })

    // Safely prepare all JSONB fields
    const gatewayData = { name: 'HITPAY' }

    console.log('[Debug] Gateway data:', {
      gatewayData,
      gatewayStringified: JSON.stringify(gatewayData)
    })

    const payloadData = payload && typeof payload === 'object'
      ? Object.fromEntries(
        Object.entries(payload).filter(([k, v]) => v !== undefined)
      )
      : {}

    console.log('[Debug] Cleaned payload data:', {
      payloadData,
      payloadDataKeys: Object.keys(payloadData),
      payloadDataStringified: JSON.stringify(payloadData)
    })

    console.log('[Debug] About to insert into Supabase:', {
      gateway: gatewayData,
      eventType: eventType || null,
      externalId,
      payload: payloadData,
      receivedAt,
      processingStatus: 'RECEIVED'
    })

    const { data: webhookEvent, error: webhookErr } = await supabase
      .from('webhookEvents')
      .insert({
        gateway: gatewayData,
        eventType: eventType || null,
        externalId,
        payload: payloadData,
        receivedAt,
        processingStatus: 'RECEIVED'
      })
      .select('webhookEventsId, processingStatus')
      .single()
    if (webhookErr) {
      console.error('[Debug] Supabase insert error:', {
        error: webhookErr,
        code: webhookErr.code,
        message: webhookErr.message,
        details: webhookErr.details,
        hint: webhookErr.hint
      })

      if (webhookErr.code === '23505') {
        const { data: existing, error: existingErr } = await supabase
          .from('webhookEvents')
          .select('webhookEventsId, processingStatus')
          .eq('externalId', externalId)
          .maybeSingle()
        if (existingErr) {
          console.error('Webhook event lookup failed', existingErr)
          return res.status(500).json({ error: existingErr.message })
        }
        if (existing?.processingStatus === 'PROCESSED') {
          console.log('[Webhook] Duplicate event ignored', { externalId, eventType })
          return res.status(200).json({ ok: true, duplicate: true })
        }
        if (!existing?.webhookEventsId) {
          console.error('Webhook event lookup missing', { externalId })
          return res.status(500).json({ error: 'Webhook event lookup failed' })
        }
        webhookEventId = existing.webhookEventsId
        await supabase
          .from('webhookEvents')
          .update({ processingStatus: 'RETRYING', receivedAt })
          .eq('webhookEventsId', webhookEventId)
      } else {
        console.error('Webhook event log failed', webhookErr)
        return res.status(500).json({ error: webhookErr.message })
      }
    } else {
      webhookEventId = webhookEvent?.webhookEventsId || null
    }

    console.log('[Webhook] Received', { externalId, eventType, reference, hitpayReferenceId })

    await logAudit({
      actionType: 'WEBHOOK_RECEIVED',
      orderId: null,
      webhookEventsId: webhookEventId,
      details: {
        gateway: 'HITPAY',
        externalId,
        eventType,
        reference,
        hitpayReferenceId
      },
      req
    })

    const respondWithError = async (statusCode, message) => {
      await markWebhookStatus('FAILED')
      console.error('[Webhook] Processing failed', { externalId, error: message })
      return res.status(statusCode).json({ error: message })
    }

    let newStatus = 'PENDING'
    if (eventType) {
      const normalizedEvent = String(eventType).toLowerCase()
      if (normalizedEvent.includes('completed') || normalizedEvent.includes('succeeded')) {
        newStatus = 'SUCCEEDED'
      } else if (normalizedEvent.includes('failed') || normalizedEvent.includes('cancelled')) {
        newStatus = 'FAILED'
      }
    }
    if (newStatus === 'PENDING') {
      if (['COMPLETED', 'SUCCEEDED', 'PAID'].includes(statusValue)) newStatus = 'SUCCEEDED'
      else if (['FAILED', 'CANCELLED'].includes(statusValue)) newStatus = 'FAILED'
    }

    if (!hitpayReferenceId) {
      return respondWithError(400, 'Missing hitpay_reference_id in webhook payload')
    }

    // fetch transaction
    const { data: tx, error: txErr } = await supabase
      .from('paymentTransactions')
      .select('paymentTransactionId, orderId, gateway, amount, currency, hitpayReferenceId')
      .eq('hitpayReferenceId', hitpayReferenceId)
      .contains('gateway', { name: 'HITPAY' })
      .maybeSingle()
    if (txErr) return respondWithError(500, txErr.message)
    if (!tx) return respondWithError(404, 'Payment transaction not found')
    if (!tx.hitpayReferenceId) return respondWithError(400, 'Missing hitpay_reference_id on transaction')
    const gatewayName = typeof tx.gateway === 'string' ? tx.gateway : tx.gateway?.name
    if (gatewayName !== 'HITPAY') return respondWithError(400, 'Invalid payment gateway')
    const resolvedTx = tx

    // helper: fetch order + items
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('orderId, eventId, buyerName, buyerEmail, buyerPhone, metadata, status, totalAmount, currency')
      .eq('orderId', resolvedTx.orderId)
      .maybeSingle()
    if (orderErr) return respondWithError(500, orderErr.message)
    if (!order) return respondWithError(404, 'Order not found')

    const expectedAmount = Number(order.totalAmount)
    const transactionAmount = Number(resolvedTx.amount)
    const expectedCurrency = (order.currency || resolvedTx.currency || '').toUpperCase()
    const transactionCurrency = (resolvedTx.currency || '').toUpperCase()
    const webhookAmountRaw =
      eventData.amount ||
      eventData.amount_received ||
      eventData.amount_paid ||
      payload.amount ||
      payload.amount_received ||
      payload.amount_paid
    const webhookAmount = webhookAmountRaw !== undefined && webhookAmountRaw !== null && webhookAmountRaw !== ''
      ? Number(webhookAmountRaw)
      : null
    const webhookCurrency = (eventData.currency || payload.currency || '').toUpperCase()

    if (newStatus === 'SUCCEEDED') {
      if (Number.isNaN(expectedAmount)) return respondWithError(400, 'Missing order amount')
      if (Number.isNaN(transactionAmount)) return respondWithError(400, 'Missing transaction amount')
      if (webhookAmount === null || Number.isNaN(webhookAmount)) {
        return respondWithError(400, 'Missing amount in webhook payload')
      }
      if (!expectedCurrency) return respondWithError(400, 'Missing order currency')
      if (!transactionCurrency) return respondWithError(400, 'Missing transaction currency')
      if (!webhookCurrency) return respondWithError(400, 'Missing currency in webhook payload')

      const webhookAmountMatches = Math.abs(expectedAmount - webhookAmount) < 0.0001
      const transactionAmountMatches = Math.abs(expectedAmount - transactionAmount) < 0.0001
      if (!webhookAmountMatches) return respondWithError(409, 'Amount mismatch')
      if (!transactionAmountMatches) return respondWithError(409, 'Transaction amount mismatch')
      if (expectedCurrency !== transactionCurrency) return respondWithError(409, 'Transaction currency mismatch')
      if (expectedCurrency !== webhookCurrency) return respondWithError(409, 'Currency mismatch')
    }

    const { data: orderItems, error: oiErr } = await supabase
      .from('orderItems')
      .select('ticketTypeId, quantity, price')
      .eq('orderId', resolvedTx.orderId)
    if (oiErr) return respondWithError(500, oiErr.message)

    await supabase
      .from('paymentTransactions')
      .update({ status: newStatus, rawPayload: payloadData })
      .eq('paymentTransactionId', resolvedTx.paymentTransactionId)

    if (newStatus === 'SUCCEEDED') {
      // mark order paid
      await supabase.from('orders').update({ status: 'PAID' }).eq('orderId', resolvedTx.orderId)

      // issue tickets only if not already issued
      const { count: existingTickets, error: ticketCountErr } = await supabase
        .from('tickets')
        .select('ticketId', { count: 'exact', head: true })
        .eq('orderId', resolvedTx.orderId)
      if (ticketCountErr) return respondWithError(500, ticketCountErr.message)

      if (!existingTickets || existingTickets === 0) {
        let issuedCount = 0
        for (const item of orderItems || []) {
          const { ticketTypeId, quantity } = item
          for (let i = 0; i < quantity; i++) {
            const { data: attendee, error: attErr } = await supabase
              .from('attendees')
              .insert({
                eventId: order.eventId,
                orderId: order.orderId,
                name: order.buyerName,
                email: order.buyerEmail,
                phoneNumber: order.buyerPhone || null,
                company: order.metadata?.company || null,
                responses: order.metadata?.customFields || null,
                consent: true
              })
              .select('*')
              .single()
            if (attErr) return respondWithError(500, attErr.message)

            const ticketCode = randomUUID()
            const { data: ticketData, error: ticketErr } = await supabase
              .from('tickets')
              .insert({
                eventId: order.eventId,
                ticketTypeId,
                orderId: order.orderId,
                attendeeId: attendee.attendeeId,
                ticketCode,
                qrPayload: ticketCode,
                status: 'ISSUED'
              })
              .select('ticketId')
              .maybeSingle()
            if (ticketErr) return respondWithError(500, ticketErr.message)

            await logAudit({
              actionType: 'TICKET_ISSUED',
              orderId: order.orderId,
              ticketId: ticketData?.ticketId || null,
              details: {
                ticketTypeId,
                source: 'PAID_ORDER'
              },
              req
            })

            issuedCount += 1

            // fetch event details
            const { data: event } = await supabase
              .from('events')
              .select('eventName, description, startAt, endAt, locationText, locationType, imageUrl, streamingPlatform')
              .eq('eventId', order.eventId)
              .maybeSingle()
            sendMakeNotification({
              type: 'ticket',
              email: order.buyerEmail,
              name: order.buyerName,
              meta: {
                eventId: order.eventId,
                orderId: order.orderId,
                eventName: event?.eventName || '',
                eventDescription: event?.description || '',
                eventStartAt: event?.startAt ? new Date(event.startAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '',
                eventEndAt: event?.endAt ? new Date(event.endAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '',
                eventLocation: event?.locationText || '',
                locationType: event?.locationType || '',
                eventImageUrl: event?.imageUrl || '',
                streamingPlatform: event?.streamingPlatform || '',
                ticket: { ticketCode, qrPayload: ticketCode, status: 'ISSUED' }
              }
            }).catch(() => { })
          }
        }

        if (issuedCount > 0) {
          console.log('[Tickets] Issued after payment', { orderId: order.orderId, count: issuedCount })
        }
      }
    } else if (newStatus === 'FAILED') {
      // mark order failed
      await supabase.from('orders').update({ status: 'FAILED' }).eq('orderId', resolvedTx.orderId)

      // cleanup any issued tickets/attendees for this order
      await supabase.from('tickets').delete().eq('orderId', resolvedTx.orderId)
      await supabase.from('attendees').delete().eq('orderId', resolvedTx.orderId)

      // release inventory
      const qtyByType = {}
      for (const item of orderItems || []) {
        qtyByType[item.ticketTypeId] = (qtyByType[item.ticketTypeId] || 0) + (item.quantity || 0)
      }
      const typeIds = Object.keys(qtyByType)
      if (typeIds.length) {
        const { data: tts, error: ttErr } = await supabase
          .from('ticketTypes')
          .select('ticketTypeId, quantitySold')
          .in('ticketTypeId', typeIds)
        if (ttErr) return respondWithError(500, ttErr.message)

        for (const tt of tts || []) {
          const dec = qtyByType[tt.ticketTypeId] || 0
          const newSold = Math.max(0, (tt.quantitySold || 0) - dec)
          const { error: updErr } = await supabase
            .from('ticketTypes')
            .update({ quantitySold: newSold })
            .eq('ticketTypeId', tt.ticketTypeId)
          if (updErr) return respondWithError(500, updErr.message)
        }
      }
    }

    await markWebhookStatus('PROCESSED')
    console.log('[Webhook] Processed', { externalId, orderId: resolvedTx.orderId, status: newStatus })

    await logAudit({
      actionType: 'WEBHOOK_PROCESSED',
      orderId: resolvedTx.orderId,
      paymentTransactionId: resolvedTx.paymentTransactionId,
      webhookEventsId: webhookEventId,
      details: {
        gateway: 'HITPAY',
        externalId,
        status: newStatus
      },
      req
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    await markWebhookStatus('FAILED')
    console.error('hitpayWebhook error', err)
    return res.status(500).json({ error: err?.message || 'Unexpected error' })
  }
}
