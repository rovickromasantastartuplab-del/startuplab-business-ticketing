import supabase from '../database/db.js';

// Utility: event is "open" if it hasn't started yet or is currently ongoing.
// "Closed" once it has ended (endAt if set, otherwise startAt as a fallback).
function isEventOpen(event) {
  const now = new Date();
  const end = new Date(event.endAt || event.startAt);
  return now <= end;
}

// Utility: filter ticket types by sales window if provided
function withinSalesWindow(tt) {
  const now = new Date();
  const start = tt.salesStartAt ? new Date(tt.salesStartAt) : null;
  const end = tt.salesEndAt ? new Date(tt.salesEndAt) : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

// Utility: group ticketTypes by eventId
function attachTicketTypes(events, ticketTypes) {
  const map = new Map();
  for (const tt of ticketTypes) {
    const list = map.get(tt.eventId) || [];
    list.push(tt);
    map.set(tt.eventId, list);
  }
  return events.map(e => ({ ...e, ticketTypes: map.get(e.eventId) || [] }));
}

export const listEvents = async (req, res) => {
  try {
    const status = (req.query.status || 'PUBLISHED').toString();
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').toString().trim();
    const eventStatusFilter = (req.query.eventStatus || 'all').toString().toLowerCase();

    // 1) Fetch all events (optionally filter by status)
    let query = supabase.from('events').select('*');
    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(`eventName.ilike.%${search}%,locationText.ilike.%${search}%,description.ilike.%${search}%`);
    }
    const { data: events, error: eventsError } = await query;
    if (eventsError) return res.status(500).json({ error: eventsError.message });

    // 2) Apply event schedule (open/closed) filter in code, then paginate
    let filteredEvents = events || [];
    if (eventStatusFilter === 'open') {
      filteredEvents = filteredEvents.filter(isEventOpen);
    } else if (eventStatusFilter === 'closed') {
      filteredEvents = filteredEvents.filter(e => !isEventOpen(e));
    }
    const total = filteredEvents.length;
    const totalPages = total ? Math.ceil(total / limit) : 1;
    const pagedEvents = filteredEvents.slice(offset, offset + limit);
    if (pagedEvents.length === 0) {
      return res.json({ events: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    // 3) Fetch ticket types for these events
    const eventIds = pagedEvents.map(e => e.eventId);
    const { data: ticketTypes, error: ttError } = await supabase
      .from('ticketTypes')
      .select('*')
      .eq('status', true)
      .in('eventId', eventIds);

    if (ttError) return res.status(500).json({ error: ttError.message });

    // 4) Fetch registration counts for these events (robust aggregation)
    let regCountMap = new Map();
    if (eventIds.length > 0) {
      const { data: attendees, error: regErr } = await supabase
        .from('attendees')
        .select('eventId')
        .in('eventId', eventIds);
      if (regErr) return res.status(500).json({ error: regErr.message });
      // Aggregate counts in JS
      for (const att of attendees || []) {
        regCountMap.set(att.eventId, (regCountMap.get(att.eventId) || 0) + 1);
      }
    }

    // 5) Filter ticket types by sales window, attach and return
    const usableTicketTypes = (ticketTypes || []).filter(withinSalesWindow);
    const withTicketTypes = attachTicketTypes(pagedEvents, usableTicketTypes).map(e => ({
      ...e,
      registrationCount: regCountMap.get(e.eventId) || 0,
      eventStatus: isEventOpen(e) ? 'OPEN' : 'CLOSED'
    }));

    return res.json({
      events: withTicketTypes,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const getEventBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    // 1) Fetch event by slug
    const { data: eventRows, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .limit(1);

    if (eventError) return res.status(500).json({ error: eventError.message });
    const event = (eventRows || [])[0];
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // 2) Fetch ticket types for this event
    const { data: ticketTypes, error: ttError } = await supabase
      .from('ticketTypes')
      .select('*')
      .eq('status', true)
      .eq('eventId', event.eventId);

    if (ttError) return res.status(500).json({ error: ttError.message });

    // 3) Filter by sales window, attach and return
    const usableTicketTypes = (ticketTypes || []).filter(withinSalesWindow);
    return res.json({ ...event, ticketTypes: usableTicketTypes });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};
