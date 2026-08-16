import supabase from '../database/db.js';
import { logAudit } from '../utils/auditLogger.js';

// Phase 6: also match search terms against admin-configured custom field responses
// (attendees.responses, jsonb), in addition to the existing name/email match. Attendees
// with no responses (every attendee on an event without formFields configured) never
// match here, so search behavior for legacy events is unchanged.
async function findAttendeeIdsByResponsesSearch(search) {
  const { data, error } = await supabase
    .from('attendees')
    .select('attendeeId, responses')
    .not('responses', 'is', null);
  if (error) return { ids: [], error };
  const needle = search.toLowerCase();
  const ids = (data || [])
    .filter(a => JSON.stringify(a.responses).toLowerCase().includes(needle))
    .map(a => a.attendeeId);
  return { ids, error: null };
}

export const listTickets = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// GET /api/tickets/registrations?eventId=...
export const getRegistrationsByEvent = async (req, res) => {
  try {
    const eventId = req.query?.eventId;
    if (!eventId) return res.status(400).json({ error: 'eventId required' });

    const search = (req.query?.search || '').trim();
    let attendeeFilterIds = null;

    if (search) {
      const [{ data: attendees, error: attErr }, respMatch] = await Promise.all([
        supabase
          .from('attendees')
          .select('attendeeId')
          .or(`name.ilike.%${search}%,email.ilike.%${search}%`),
        findAttendeeIdsByResponsesSearch(search)
      ]);
      if (attErr) return res.status(500).json({ error: attErr.message });
      if (respMatch.error) return res.status(500).json({ error: respMatch.error.message });
      attendeeFilterIds = [...new Set([...(attendees || []).map(a => a.attendeeId), ...respMatch.ids])];
      if (!attendeeFilterIds.length) return res.json([]);
    }

    let ticketsQuery = supabase
      .from('tickets')
      .select('ticketId, ticketCode, qrPayload, status, attendeeId, eventId, orderId, ticketTypeId, issuedAt, usedAt')
      .eq('eventId', eventId);

    if (attendeeFilterIds) {
      ticketsQuery = ticketsQuery.in('attendeeId', attendeeFilterIds);
    }

    const { data: tickets, error: tErr } = await ticketsQuery;
    if (tErr) return res.status(500).json({ error: tErr.message });
    if (!tickets || !tickets.length) return res.json([]);

    const attendeeIds = [...new Set(tickets.map(t => t.attendeeId).filter(Boolean))];
    const orderIds = [...new Set(tickets.map(t => t.orderId).filter(Boolean))];
    const ticketTypeIds = [...new Set(tickets.map(t => t.ticketTypeId).filter(Boolean))];

    const [attResp, ordResp, ttResp, evResp] = await Promise.all([
      attendeeIds.length
        ? supabase.from('attendees').select('attendeeId, name, email, phoneNumber, company, responses').in('attendeeId', attendeeIds)
        : { data: [], error: null },
      orderIds.length
        ? supabase.from('orders').select('orderId, totalAmount, currency, status').in('orderId', orderIds)
        : { data: [], error: null },
      ticketTypeIds.length
        ? supabase.from('ticketTypes').select('ticketTypeId, name').in('ticketTypeId', ticketTypeIds)
        : { data: [], error: null },
      supabase.from('events').select('eventId, eventName, streamingPlatform, locationType').eq('eventId', eventId).maybeSingle()
    ]);

    if (attResp.error) return res.status(500).json({ error: attResp.error.message });
    if (ordResp.error) return res.status(500).json({ error: ordResp.error.message });
    if (ttResp.error) return res.status(500).json({ error: ttResp.error.message });
    if (evResp.error) return res.status(500).json({ error: evResp.error.message });

    const attendeeMap = new Map((attResp.data || []).map(a => [a.attendeeId, a]));
    const orderMap = new Map((ordResp.data || []).map(o => [o.orderId, o]));
    const ttMap = new Map((ttResp.data || []).map(tt => [tt.ticketTypeId, tt]));
    const eventName = evResp.data?.eventName || '';

    const registrations = tickets.map(t => {
      const attendee = attendeeMap.get(t.attendeeId) || {};
      const order = orderMap.get(t.orderId) || {};
      const tt = ttMap.get(t.ticketTypeId) || {};
      return {
        id: t.ticketId,
        ticketCode: t.ticketCode,
        qrPayload: t.qrPayload || t.ticketCode,
        eventId: t.eventId,
        eventName,
        attendeeName: attendee.name || '',
        attendeeEmail: attendee.email || '',
        attendeePhone: attendee.phoneNumber || null,
        attendeeCompany: attendee.company || null,
        attendeeResponses: attendee.responses || null,
        ticketName: tt.name || '',
        status: t.status,
        paymentStatus: order.status || '',
        orderId: t.orderId,
        amountPaid: order.totalAmount || 0,
        currency: order.currency || 'PHP',
        streamingPlatform: evResp.data?.streamingPlatform || null,
        locationType: evResp.data?.locationType || null,
        checkInTimestamp: t.usedAt || null
      };
    });

    return res.json(registrations);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// GET /api/tickets/registrations-all
export const getAllRegistrations = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = (req.query?.search || '').trim();
    let attendeeFilterIds = null;

    if (search) {
      const [{ data: attendees, error: attErr }, respMatch] = await Promise.all([
        supabase
          .from('attendees')
          .select('attendeeId')
          .or(`name.ilike.%${search}%,email.ilike.%${search}%`),
        findAttendeeIdsByResponsesSearch(search)
      ]);
      if (attErr) return res.status(500).json({ error: attErr.message });
      if (respMatch.error) return res.status(500).json({ error: respMatch.error.message });
      attendeeFilterIds = [...new Set([...(attendees || []).map(a => a.attendeeId), ...respMatch.ids])];
      if (!attendeeFilterIds.length) {
        return res.json({
          registrations: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 1
          }
        });
      }
    }

    let ticketsQuery = supabase
      .from('tickets')
      .select('ticketId, ticketCode, qrPayload, status, attendeeId, eventId, orderId, ticketTypeId, issuedAt, usedAt', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (attendeeFilterIds) {
      ticketsQuery = ticketsQuery.in('attendeeId', attendeeFilterIds);
    }

    const { data: tickets, error: tErr, count: total } = await ticketsQuery
      .range(offset, offset + limit - 1);
    if (tErr) return res.status(500).json({ error: tErr.message });
    let totalCount = typeof total === 'number' ? total : null;
    if (totalCount === null) {
      let countQuery = supabase
        .from('tickets')
        .select('ticketId', { count: 'exact', head: true });

      if (attendeeFilterIds) {
        countQuery = countQuery.in('attendeeId', attendeeFilterIds);
      }

      const { error: countErr, count: fallbackCount } = await countQuery;
      if (countErr) return res.status(500).json({ error: countErr.message });
      totalCount = fallbackCount || 0;
    }
    const totalPages = totalCount ? Math.ceil(totalCount / limit) : 1;
    if (!tickets || !tickets.length) {
      return res.json({
        registrations: [],
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          totalPages
        }
      });
    }

    const attendeeIds = [...new Set(tickets.map(t => t.attendeeId).filter(Boolean))];
    const orderIds = [...new Set(tickets.map(t => t.orderId).filter(Boolean))];
    const ticketTypeIds = [...new Set(tickets.map(t => t.ticketTypeId).filter(Boolean))];
    const eventIds = [...new Set(tickets.map(t => t.eventId).filter(Boolean))];

    const [attResp, ordResp, ttResp, evResp] = await Promise.all([
      attendeeIds.length
        ? supabase.from('attendees').select('attendeeId, name, email, phoneNumber, company, responses').in('attendeeId', attendeeIds)
        : { data: [], error: null },
      orderIds.length
        ? supabase.from('orders').select('orderId, totalAmount, currency, status').in('orderId', orderIds)
        : { data: [], error: null },
      ticketTypeIds.length
        ? supabase.from('ticketTypes').select('ticketTypeId, name').in('ticketTypeId', ticketTypeIds)
        : { data: [], error: null },
      eventIds.length
        ? supabase.from('events').select('eventId, eventName, streamingPlatform, locationType').in('eventId', eventIds)
        : { data: [], error: null }
    ]);

    if (attResp.error) return res.status(500).json({ error: attResp.error.message });
    if (ordResp.error) return res.status(500).json({ error: ordResp.error.message });
    if (ttResp.error) return res.status(500).json({ error: ttResp.error.message });
    if (evResp.error) return res.status(500).json({ error: evResp.error.message });

    const attendeeMap = new Map((attResp.data || []).map(a => [a.attendeeId, a]));
    const orderMap = new Map((ordResp.data || []).map(o => [o.orderId, o]));
    const ttMap = new Map((ttResp.data || []).map(tt => [tt.ticketTypeId, tt]));
    const eventMap = new Map((evResp.data || []).map(e => [e.eventId, e]));

    const registrations = tickets.map(t => {
      const attendee = attendeeMap.get(t.attendeeId) || {};
      const order = orderMap.get(t.orderId) || {};
      const tt = ttMap.get(t.ticketTypeId) || {};
      const event = eventMap.get(t.eventId) || {};
      return {
        id: t.ticketId,
        ticketCode: t.ticketCode,
        qrPayload: t.qrPayload || t.ticketCode,
        eventId: t.eventId,
        eventName: event.eventName || '',
        attendeeName: attendee.name || '',
        attendeeEmail: attendee.email || '',
        attendeePhone: attendee.phoneNumber || null,
        attendeeCompany: attendee.company || null,
        attendeeResponses: attendee.responses || null,
        ticketName: tt.name || '',
        status: t.status,
        paymentStatus: order.status || '',
        orderId: t.orderId,
        amountPaid: order.totalAmount || 0,
        currency: order.currency || 'PHP',
        streamingPlatform: event.streamingPlatform || null,
        locationType: event.locationType || null,
        checkInTimestamp: t.usedAt || null
      };
    });

    return res.json({
      registrations,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// POST /api/tickets/checkin - body: { code } where code can be ticketCode or qrPayload
export const checkInTicket = async (req, res) => {
  try {
    const raw = (req.body || {}).code;
    const code = typeof raw === 'string' ? raw.trim() : '';
    if (!code) return res.status(400).json({ error: 'code required' });

    // Find ticket by ticketCode or qrPayload (try both, sequentially, to avoid OR edge cases)
    const selectFields = 'ticketId, ticketCode, qrPayload, status, attendeeId, eventId, orderId, ticketTypeId, usedAt';
    let ticket = null;
    let findErr = null;

    const byCode = await supabase.from('tickets').select(selectFields).eq('ticketCode', code).maybeSingle();
    findErr = byCode.error;
    ticket = byCode.data;

    if (!findErr && !ticket) {
      const byPayload = await supabase.from('tickets').select(selectFields).eq('qrPayload', code).maybeSingle();
      findErr = byPayload.error;
      ticket = byPayload.data;
    }

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // If already checked in / used, reject
    if (ticket.status === 'CHECKED_IN' || ticket.status === 'USED') {
      return res.status(409).json({ error: 'Ticket already used' });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('tickets')
      .update({ status: 'USED', usedAt: now })
      .eq('ticketId', ticket.ticketId)
      .select('*')
      .maybeSingle();
    if (updErr) return res.status(500).json({ error: updErr.message });

    console.log('[CheckIn] Ticket used', {
      ticketId: ticket.ticketId,
      ticketCode: ticket.ticketCode,
      eventId: ticket.eventId,
      orderId: ticket.orderId,
      usedAt: now
    });

    await logAudit({
      actionType: 'TICKET_CHECKIN',
      orderId: ticket.orderId,
      ticketId: ticket.ticketId,
      details: {
        ticketCode: ticket.ticketCode,
        eventId: ticket.eventId,
        usedAt: now
      },
      req
    });

    // fetch attendee info
    const { data: attendee, error: attErr } = await supabase
      .from('attendees')
      .select('attendeeId, name, email, phoneNumber, company')
      .eq('attendeeId', ticket.attendeeId)
      .maybeSingle();
    if (attErr) return res.status(500).json({ error: attErr.message });

    return res.status(200).json({ ...updated, attendee });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// GET /api/tickets/order/:orderId - fetch tickets for an order
export const getTicketsByOrder = async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('ticketId, ticketCode, qrPayload, status, attendeeId, ticketTypeId, orderId, eventId')
      .eq('orderId', orderId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const selectFields = 'ticketId, ticketCode, qrPayload, status, attendeeId, eventId, orderId, ticketTypeId, issuedAt, usedAt';
    let { data: ticket, error } = await supabase
      .from('tickets')
      .select(selectFields)
      .eq('ticketId', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });

    // Fallback: if a payment status page passes orderId, return first ticket for that order
    if (!ticket) {
      const resp = await supabase
        .from('tickets')
        .select(selectFields)
        .eq('orderId', id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      ticket = resp.data;
      error = resp.error;
      if (error) return res.status(500).json({ error: error.message });
    }

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const [attResp, ordResp, ttResp, evResp] = await Promise.all([
      ticket.attendeeId
        ? supabase.from('attendees').select('attendeeId, name, email, phoneNumber, company, responses').eq('attendeeId', ticket.attendeeId).maybeSingle()
        : { data: null, error: null },
      ticket.orderId
        ? supabase.from('orders').select('orderId, totalAmount, currency, status').eq('orderId', ticket.orderId).maybeSingle()
        : { data: null, error: null },
      ticket.ticketTypeId
        ? supabase.from('ticketTypes').select('ticketTypeId, name').eq('ticketTypeId', ticket.ticketTypeId).maybeSingle()
        : { data: null, error: null },
      ticket.eventId
        ? supabase.from('events').select('eventId, eventName, locationType, locationText, streamingPlatform, startAt, endAt').eq('eventId', ticket.eventId).maybeSingle()
        : { data: null, error: null }
    ]);

    if (attResp.error) return res.status(500).json({ error: attResp.error.message });
    if (ordResp.error) return res.status(500).json({ error: ordResp.error.message });
    if (ttResp.error) return res.status(500).json({ error: ttResp.error.message });
    if (evResp.error) return res.status(500).json({ error: evResp.error.message });

    return res.json({
      ...ticket,
      eventName: evResp.data?.eventName || '',
      locationType: evResp.data?.locationType || null,
      locationText: evResp.data?.locationText || null,
      streamingPlatform: evResp.data?.streamingPlatform || null,
      eventStartAt: evResp.data?.startAt || null,
      eventEndAt: evResp.data?.endAt || null,
      attendeeName: attResp.data?.name || '',
      attendeeEmail: attResp.data?.email || '',
      attendeePhone: attResp.data?.phoneNumber || null,
      attendeeCompany: attResp.data?.company || null,
      attendeeResponses: attResp.data?.responses || null,
      ticketName: ttResp.data?.name || '',
      paymentStatus: ordResp.data?.status || '',
      amountPaid: ordResp.data?.totalAmount || 0,
      currency: ordResp.data?.currency || 'PHP'
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const createTicket = async (req, res) => {
  try {
    const {
      eventId,
      ticketTypeId,
      attendeeId,
      orderId = null,
      status = 'ISSUED'
    } = req.body || {};

    // Validate required FKs
    if (!eventId || !ticketTypeId || !attendeeId) {
      return res.status(400).json({ error: 'eventId, ticketTypeId, and attendeeId are required' });
    }
    // Validate status
    const allowedStatus = ['ISSUED', 'USED', 'CANCELLED', 'REFUNDED'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ error: 'Invalid ticket status' });
    }
    // Generate ticketCode (UUID) if not provided
    const ticketCode = req.body.ticketCode || crypto.randomUUID();
    // Optionally: generate qrPayload here (simple: use ticketCode)
    const qrPayload = req.body.qrPayload || ticketCode;

    const payload = {
      eventId,
      ticketTypeId,
      attendeeId,
      orderId,
      ticketCode,
      qrPayload,
      status,
      issuedAt: req.body.issuedAt || new Date().toISOString(),
      usedAt: req.body.usedAt || null
    };
    const { data, error } = await supabase
      .from('tickets')
      .insert(payload)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    const { data, error } = await supabase
      .from('tickets')
      .update(updates)
      .eq('ticketId', id)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Ticket not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('ticketId', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};
