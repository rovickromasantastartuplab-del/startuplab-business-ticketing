import supabase from '../database/db.js';
import { randomBytes } from 'crypto';

const DISCOUNT_TYPES = ['FIXED', 'PERCENT'];
// Excludes visually-confusable characters (0/O, 1/I/L) so printed/shared codes are unambiguous.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCouponCode(length = 8) {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function computeDiscountAmount(coupon, subtotal) {
  const amount = coupon.discountType === 'PERCENT'
    ? Math.round((subtotal * coupon.discountValue) / 100)
    : coupon.discountValue;
  return Math.max(0, Math.min(amount, subtotal));
}

function isExpired(coupon) {
  return Boolean(coupon.expiresAt) && new Date(coupon.expiresAt).getTime() < Date.now();
}

function hasRemainingUses(coupon) {
  return (coupon.usesCount || 0) < (coupon.maxUses || 1);
}

// Shared by createCoupon and bulkCreateCoupons. Returns an error string, or null if valid.
function validateDiscountPayload(discountType, discountValue) {
  if (!DISCOUNT_TYPES.includes(discountType)) return 'discountType must be FIXED or PERCENT';
  const numericValue = Number(discountValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'discountValue must be a positive number';
  if (discountType === 'PERCENT' && numericValue > 100) return 'discountValue cannot exceed 100 for a percentage coupon';
  return null;
}

// Returns a valid maxUses integer (default 1), or an error string.
function resolveMaxUses(maxUses) {
  if (maxUses === undefined || maxUses === null || maxUses === '') return { value: 1 };
  const numericValue = Number(maxUses);
  if (!Number.isInteger(numericValue) || numericValue <= 0 || numericValue > 100000) {
    return { error: 'maxUses must be a positive integer' };
  }
  return { value: numericValue };
}

// POST /api/coupons/validate (public) — body: { eventId, code, subtotal }
// Read-only: looks the coupon up and reports what discount it would apply. Never redeems.
export const validateCoupon = async (req, res) => {
  try {
    const { eventId, code, subtotal } = req.body || {};
    const normalizedCode = (code || '').toString().trim().toUpperCase();
    const numericSubtotal = Number(subtotal);

    if (!eventId || !normalizedCode) {
      return res.status(400).json({ valid: false, error: 'eventId and code are required' });
    }
    if (!Number.isFinite(numericSubtotal) || numericSubtotal < 0) {
      return res.status(400).json({ valid: false, error: 'subtotal must be a non-negative number' });
    }
    if (numericSubtotal === 0) {
      return res.json({ valid: false, error: 'Coupons can only be applied to paid tickets' });
    }

    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('eventId', eventId)
      .eq('code', normalizedCode)
      .maybeSingle();
    if (error) return res.status(500).json({ valid: false, error: error.message });

    if (!coupon) return res.json({ valid: false, error: 'Coupon code not found for this event' });
    if (coupon.status === 'DISABLED') return res.json({ valid: false, error: 'This coupon is no longer active' });
    if (!hasRemainingUses(coupon)) return res.json({ valid: false, error: 'This coupon has reached its usage limit' });
    if (isExpired(coupon)) return res.json({ valid: false, error: 'This coupon has expired' });

    const discountAmount = computeDiscountAmount(coupon, numericSubtotal);
    return res.json({
      valid: true,
      discountAmount,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      code: coupon.code
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: err?.message || 'Unexpected error' });
  }
};

// GET /api/admin/coupons?eventId=...
// Each coupon includes a `redemptions` array — every use, not just the most recent — with
// the redeeming order's buyer name/email/amount, so an admin can see who used it.
export const listAdminCoupons = async (req, res) => {
  try {
    const eventId = req.query?.eventId;
    if (!eventId) return res.status(400).json({ error: 'eventId required' });

    const { data: coupons, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('eventId', eventId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    if (!coupons || !coupons.length) return res.json([]);

    const couponIds = coupons.map(c => c.couponId);
    const { data: redemptions, error: redErr } = await supabase
      .from('couponRedemptions')
      .select('redemptionId, couponId, orderId, redeemedAt')
      .in('couponId', couponIds)
      .order('redeemedAt', { ascending: false });
    if (redErr) return res.status(500).json({ error: redErr.message });

    const orderIds = [...new Set((redemptions || []).map(r => r.orderId))];
    let orderMap = new Map();
    if (orderIds.length) {
      const { data: orders, error: orderErr } = await supabase
        .from('orders')
        .select('orderId, buyerName, buyerEmail, totalAmount, currency')
        .in('orderId', orderIds);
      if (orderErr) return res.status(500).json({ error: orderErr.message });
      orderMap = new Map((orders || []).map(o => [o.orderId, o]));
    }

    const redemptionsByCoupon = new Map();
    for (const r of redemptions || []) {
      const order = orderMap.get(r.orderId) || {};
      const list = redemptionsByCoupon.get(r.couponId) || [];
      list.push({
        redemptionId: r.redemptionId,
        orderId: r.orderId,
        redeemedAt: r.redeemedAt,
        buyerName: order.buyerName || null,
        buyerEmail: order.buyerEmail || null,
        totalAmount: order.totalAmount ?? null,
        currency: order.currency || null
      });
      redemptionsByCoupon.set(r.couponId, list);
    }

    const result = coupons.map(c => ({ ...c, redemptions: redemptionsByCoupon.get(c.couponId) || [] }));
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// POST /api/admin/coupons — body: { eventId, code?, discountType, discountValue, maxUses?, expiresAt? }
export const createCoupon = async (req, res) => {
  try {
    const { eventId, code, discountType, discountValue, maxUses, expiresAt } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });
    const discountError = validateDiscountPayload(discountType, discountValue);
    if (discountError) return res.status(400).json({ error: discountError });
    const maxUsesResolved = resolveMaxUses(maxUses);
    if (maxUsesResolved.error) return res.status(400).json({ error: maxUsesResolved.error });

    const finalCode = (code || '').toString().trim().toUpperCase() || generateCouponCode();

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        eventId,
        code: finalCode,
        discountType,
        discountValue: Number(discountValue),
        maxUses: maxUsesResolved.value,
        expiresAt: expiresAt || null,
        createdBy: req.user?.id || null
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Coupon code "${finalCode}" already exists for this event` });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// POST /api/admin/coupons/bulk — body: { eventId, count, discountType, discountValue, expiresAt? }
// Generates `count` unique random codes in one batch and returns all of them — this is the
// only time an admin can see the full generated list at once.
export const bulkCreateCoupons = async (req, res) => {
  try {
    const { eventId, count, discountType, discountValue, maxUses, expiresAt } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });
    const numericCount = Number(count);
    if (!Number.isInteger(numericCount) || numericCount <= 0 || numericCount > 500) {
      return res.status(400).json({ error: 'count must be an integer between 1 and 500' });
    }
    const discountError = validateDiscountPayload(discountType, discountValue);
    if (discountError) return res.status(400).json({ error: discountError });
    const numericValue = Number(discountValue);
    const maxUsesResolved = resolveMaxUses(maxUses);
    if (maxUsesResolved.error) return res.status(400).json({ error: maxUsesResolved.error });

    const maxAttempts = 5;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const codes = new Set();
      while (codes.size < numericCount) codes.add(generateCouponCode());
      const rows = Array.from(codes).map(code => ({
        eventId,
        code,
        discountType,
        discountValue: numericValue,
        maxUses: maxUsesResolved.value,
        expiresAt: expiresAt || null,
        createdBy: req.user?.id || null
      }));

      const { data, error } = await supabase.from('coupons').insert(rows).select('*');
      if (!error) return res.status(201).json(data);
      // Unique-constraint collision against an existing row (astronomically unlikely at this
      // alphabet size) — regenerate and retry rather than fail the whole batch.
      if (error.code !== '23505') return res.status(500).json({ error: error.message });
      lastError = error;
    }
    return res.status(500).json({ error: lastError?.message || 'Failed to generate unique coupon codes, please retry' });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// PATCH /api/admin/coupons/:id — body: any of { status, code, discountType, discountValue,
// maxUses, expiresAt }, all optional; only provided fields are changed. `status` toggles
// ACTIVE <-> DISABLED and is independent of usesCount/maxUses (a coupon can be ACTIVE and
// fully used at once). Editing discount/expiry never touches past redemptions — their
// discountAmount was already computed and stored on the order at redemption time, so changing
// a coupon afterward only affects future validation attempts, not history.
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, code, discountType, discountValue, maxUses, expiresAt } = req.body || {};

    const { data: existing, error: fetchErr } = await supabase
      .from('coupons')
      .select('*')
      .eq('couponId', id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!existing) return res.status(404).json({ error: 'Coupon not found' });

    const updates = {};

    if (status !== undefined) {
      if (!['ACTIVE', 'DISABLED'].includes(status)) {
        return res.status(400).json({ error: 'status must be ACTIVE or DISABLED' });
      }
      updates.status = status;
    }

    if (code !== undefined) {
      const normalizedCode = code.toString().trim().toUpperCase();
      if (!normalizedCode) return res.status(400).json({ error: 'code cannot be empty' });
      updates.code = normalizedCode;
    }

    // discountType/discountValue must be edited together — validating one against the
    // other's *stored* value (e.g. a new 150 against an old FIXED type) would be meaningless.
    if (discountType !== undefined || discountValue !== undefined) {
      const nextType = discountType !== undefined ? discountType : existing.discountType;
      const nextValue = discountValue !== undefined ? discountValue : existing.discountValue;
      const discountError = validateDiscountPayload(nextType, nextValue);
      if (discountError) return res.status(400).json({ error: discountError });
      updates.discountType = nextType;
      updates.discountValue = Number(nextValue);
    }

    if (maxUses !== undefined) {
      const maxUsesResolved = resolveMaxUses(maxUses);
      if (maxUsesResolved.error) return res.status(400).json({ error: maxUsesResolved.error });
      if (maxUsesResolved.value < (existing.usesCount || 0)) {
        return res.status(400).json({ error: `maxUses cannot be lower than the current uses count (${existing.usesCount})` });
      }
      updates.maxUses = maxUsesResolved.value;
    }

    if (expiresAt !== undefined) {
      updates.expiresAt = expiresAt || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('coupons')
      .update(updates)
      .eq('couponId', id)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Coupon code "${updates.code}" already exists for this event` });
      return res.status(500).json({ error: error.message });
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};
