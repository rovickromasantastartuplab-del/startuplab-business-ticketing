import supabase from '../database/db.js';

const MAX_PAGE_SIZE = 10;

const resolvePagination = (req) => {
  const rawPage = Number(req.query?.page);
  const rawLimit = Number(req.query?.limit);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limitInput = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : MAX_PAGE_SIZE;
  const limit = Math.min(limitInput, MAX_PAGE_SIZE);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
};

const buildPagination = (page, limit, total) => {
  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages
  };
};

const loadOrderDetails = async (orderId) => {
  if (!orderId) return null;
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('orderId, eventId, status, totalAmount, currency, buyerName, buyerEmail, buyerPhone, metadata, expiresAt, created_at')
    .eq('orderId', orderId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) return null;

  const [eventResp, orderItemsResp, attendeesResp, ticketsResp, paymentsResp] = await Promise.all([
    order.eventId
      ? supabase
          .from('events')
          .select('eventId, eventName, startAt, endAt, timezone, locationText')
          .eq('eventId', order.eventId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('orderItems')
      .select('orderItemId, ticketTypeId, quantity, price, lineTotal')
      .eq('orderId', orderId),
    supabase
      .from('attendees')
      .select('attendeeId, name, email, phoneNumber, company, responses')
      .eq('orderId', orderId),
    supabase
      .from('tickets')
      .select('ticketId, ticketCode, qrPayload, status, issuedAt, usedAt, attendeeId, ticketTypeId')
      .eq('orderId', orderId),
    supabase
      .from('paymentTransactions')
      .select('paymentTransactionId, hitpayReferenceId, amount, currency, status, gateway, created_at, updated_at, rawPayload')
      .eq('orderId', orderId)
      .order('created_at', { ascending: false })
  ]);

  if (eventResp.error) throw eventResp.error;
  if (orderItemsResp.error) throw orderItemsResp.error;
  if (attendeesResp.error) throw attendeesResp.error;
  if (ticketsResp.error) throw ticketsResp.error;
  if (paymentsResp.error) throw paymentsResp.error;

  const orderItems = orderItemsResp.data || [];
  const tickets = ticketsResp.data || [];
  const attendees = attendeesResp.data || [];
  const ticketTypeIds = Array.from(new Set([
    ...orderItems.map(item => item.ticketTypeId),
    ...tickets.map(ticket => ticket.ticketTypeId)
  ].filter(Boolean)));

  const { data: ticketTypes, error: ttErr } = ticketTypeIds.length
    ? await supabase
        .from('ticketTypes')
        .select('ticketTypeId, name, priceAmount, currency')
        .in('ticketTypeId', ticketTypeIds)
    : { data: [], error: null };
  if (ttErr) throw ttErr;

  const ticketTypeMap = new Map((ticketTypes || []).map(tt => [tt.ticketTypeId, tt]));
  const attendeeMap = new Map(attendees.map(att => [att.attendeeId, att]));

  const orderItemsDetailed = orderItems.map(item => ({
    ...item,
    ticketType: ticketTypeMap.get(item.ticketTypeId) || null
  }));

  const ticketsDetailed = tickets.map(ticket => ({
    ...ticket,
    attendee: attendeeMap.get(ticket.attendeeId) || null,
    ticketType: ticketTypeMap.get(ticket.ticketTypeId) || null
  }));

  return {
    order,
    event: eventResp.data || null,
    orderItems: orderItemsDetailed,
    attendees,
    tickets: ticketsDetailed,
    payments: paymentsResp.data || []
  };
};

const loadTicketDetails = async (ticketId) => {
  if (!ticketId) return null;
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('ticketId, ticketCode, qrPayload, status, issuedAt, usedAt, attendeeId, eventId, orderId, ticketTypeId')
    .eq('ticketId', ticketId)
    .maybeSingle();
  if (ticketErr) throw ticketErr;
  if (!ticket) return null;

  const [attendeeResp, eventResp, orderResp, ticketTypeResp] = await Promise.all([
    ticket.attendeeId
      ? supabase
          .from('attendees')
          .select('attendeeId, name, email, phoneNumber, company, responses')
          .eq('attendeeId', ticket.attendeeId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ticket.eventId
      ? supabase
          .from('events')
          .select('eventId, eventName, startAt, endAt, timezone, locationText')
          .eq('eventId', ticket.eventId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ticket.orderId
      ? supabase
          .from('orders')
          .select('orderId, status, totalAmount, currency, buyerName, buyerEmail, buyerPhone, created_at')
          .eq('orderId', ticket.orderId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ticket.ticketTypeId
      ? supabase
          .from('ticketTypes')
          .select('ticketTypeId, name, priceAmount, currency')
          .eq('ticketTypeId', ticket.ticketTypeId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (attendeeResp.error) throw attendeeResp.error;
  if (eventResp.error) throw eventResp.error;
  if (orderResp.error) throw orderResp.error;
  if (ticketTypeResp.error) throw ticketTypeResp.error;

  return {
    ticket,
    attendee: attendeeResp.data || null,
    event: eventResp.data || null,
    order: orderResp.data || null,
    ticketType: ticketTypeResp.data || null
  };
};

export const getSummary = async (req, res) => {
  try {
    const eventId = (req.query?.eventId || '').toString().trim();

    // Tickets and attendance
    let ticketsQuery = supabase
      .from('tickets')
      .select('ticketId, eventId, status, issuedAt');
    if (eventId) ticketsQuery = ticketsQuery.eq('eventId', eventId);
    const { data: tickets, error: ticketErr } = await ticketsQuery;
    if (ticketErr) return res.status(500).json({ error: ticketErr.message });

    const totalRegistrations = tickets?.length || 0;
    const usedCount = (tickets || []).filter(t => t.status === 'USED').length;
    const attendanceRate = totalRegistrations ? (usedCount / totalRegistrations) * 100 : 0;

    // Orders and revenue
    let ordersQuery = supabase
      .from('orders')
      .select('orderId, eventId, totalAmount, status, created_at');
    if (eventId) ordersQuery = ordersQuery.eq('eventId', eventId);
    const { data: orders, error: orderErr } = await ordersQuery;
    if (orderErr) return res.status(500).json({ error: orderErr.message });

    const paidOrders = (orders || []).filter(o => o.status === 'PAID');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Payment success should only reflect real money transactions, not free ($0) orders.
    const paidMoneyOrders = (orders || []).filter(o => (o.totalAmount || 0) > 0);
    const succeededMoneyOrders = paidMoneyOrders.filter(o => o.status === 'PAID');
    const paymentSuccessRate = paidMoneyOrders.length
      ? (succeededMoneyOrders.length / paidMoneyOrders.length) * 100
      : 0;

    // Today ranges
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startIso = today.toISOString();

    const ticketsSoldToday = (tickets || []).filter(t => t.issuedAt && t.issuedAt >= startIso).length;
    const revenueToday = paidOrders
      .filter(o => o.created_at && o.created_at >= startIso)
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    return res.json({
      totalRegistrations,
      ticketsSoldToday,
      totalRevenue,
      revenueToday,
      attendanceRate,
      paymentSuccessRate,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getRecentTransactions = async (req, res) => {
  try {
    const { page, limit, from, to } = resolvePagination(req);
    const eventId = (req.query?.eventId || '').toString().trim();
    let query = supabase
      .from('orders')
      .select('orderId, eventId, buyerName, totalAmount, currency, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (eventId) query = query.eq('eventId', eventId);
    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const total = typeof count === 'number' ? count : 0;
    const items = data || [];
    const eventIds = Array.from(new Set(items.map(item => item.eventId).filter(Boolean)));
    let eventMap = new Map();

    if (eventIds.length) {
      const { data: eventRows, error: eventErr } = await supabase
        .from('events')
        .select('eventId, eventName')
        .in('eventId', eventIds);
      if (eventErr) return res.status(500).json({ error: eventErr.message });
      eventMap = new Map((eventRows || []).map(row => [row.eventId, row.eventName]));
    }

    const enrichedItems = items.map(item => ({
      ...item,
      eventName: eventMap.get(item.eventId) || null
    }));

    return res.json({
      items: enrichedItems,
      pagination: buildPagination(page, limit, total)
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getTransactionDetail = async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const details = await loadOrderDetails(orderId);
    if (!details) return res.status(404).json({ error: 'Order not found' });
    return res.json(details);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getOrderDetail = async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const details = await loadOrderDetails(orderId);
    if (!details) return res.status(404).json({ error: 'Order not found' });
    return res.json(details);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getAuditLogDetail = async (req, res) => {
  const { auditLogId } = req.params;
  if (!auditLogId) return res.status(400).json({ error: 'auditLogId required' });
  try {
    const { data: log, error: logErr } = await supabase
      .from('auditLogs')
      .select('auditLogId, actionType, orderId, ticketId, paymentTransactionId, webhookEventsId, actorUserId, details, createdAt')
      .eq('auditLogId', auditLogId)
      .maybeSingle();
    if (logErr) return res.status(500).json({ error: logErr.message });
    if (!log) return res.status(404).json({ error: 'Audit log not found' });

    let actor = null;
    if (log.actorUserId) {
      let actorResp = await supabase
        .from('users')
        .select('userId, name, email, role')
        .eq('userId', log.actorUserId)
        .maybeSingle();
      actor = actorResp.data;

      if ((!actor && !actorResp.error) || (actorResp.error && actorResp.error.message?.includes('column "userId"'))) {
        const fallbackResp = await supabase
          .from('users')
          .select('id, name, email, role')
          .eq('id', log.actorUserId)
          .maybeSingle();
        actor = fallbackResp.data;
      }

      if (actor) {
        actor = {
          userId: actor.userId || actor.id,
          name: actor.name,
          email: actor.email,
          role: actor.role
        };
      }
    }

    const [orderDetails, ticketDetails, webhookResp, paymentResp] = await Promise.all([
      log.orderId ? loadOrderDetails(log.orderId) : Promise.resolve(null),
      log.ticketId ? loadTicketDetails(log.ticketId) : Promise.resolve(null),
      log.webhookEventsId
        ? supabase
            .from('webhookEvents')
            .select('webhookEventsId, eventType, externalId, payload, receivedAt, processedAt, processingStatus')
            .eq('webhookEventsId', log.webhookEventsId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      log.paymentTransactionId
        ? supabase
            .from('paymentTransactions')
            .select('paymentTransactionId, orderId, hitpayReferenceId, amount, currency, status, gateway, created_at, updated_at, rawPayload')
            .eq('paymentTransactionId', log.paymentTransactionId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    if (webhookResp?.error) return res.status(500).json({ error: webhookResp.error.message });
    if (paymentResp?.error) return res.status(500).json({ error: paymentResp.error.message });

    return res.json({
      log,
      actor,
      orderDetails: orderDetails || null,
      ticketDetails: ticketDetails || null,
      webhookEvent: webhookResp?.data || null,
      paymentTransaction: paymentResp?.data || null
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getRecentOrders = async (req, res) => {
  try {
    const { page, limit, from, to } = resolvePagination(req);
    const eventId = (req.query?.eventId || '').toString().trim();
    let query = supabase
      .from('orders')
      .select('orderId, eventId, buyerName, buyerEmail, totalAmount, currency, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (eventId) query = query.eq('eventId', eventId);
    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const total = typeof count === 'number' ? count : 0;
    const items = data || [];
    const eventIds = Array.from(new Set(items.map(item => item.eventId).filter(Boolean)));
    let eventMap = new Map();

    if (eventIds.length) {
      const { data: eventRows, error: eventErr } = await supabase
        .from('events')
        .select('eventId, eventName')
        .in('eventId', eventIds);
      if (eventErr) return res.status(500).json({ error: eventErr.message });
      eventMap = new Map((eventRows || []).map(row => [row.eventId, row.eventName]));
    }

    const enrichedItems = items.map(item => ({
      ...item,
      eventName: eventMap.get(item.eventId) || null
    }));
    return res.json({
      items: enrichedItems,
      pagination: buildPagination(page, limit, total)
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const { page, limit, from, to } = resolvePagination(req);
    const { data, error, count } = await supabase
      .from('auditLogs')
      .select('auditLogId, actionType, orderId, ticketId, paymentTransactionId, webhookEventsId, actorUserId, createdAt', { count: 'exact' })
      .order('createdAt', { ascending: false })
      .range(from, to);
    if (error) return res.status(500).json({ error: error.message });
    const total = typeof count === 'number' ? count : 0;
    return res.json({
      items: data || [],
      pagination: buildPagination(page, limit, total)
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};
