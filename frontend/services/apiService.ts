
import { Event, Order, OrderItem, Attendee, Ticket, TicketType, AnalyticsSummary, RegistrationView, TicketStatus, OrderStatus, FooterLink, FooterLinkType, FooterColumn, SocialPlatform, Coupon, CouponDiscountType } from '../types';
import { MOCK_EVENTS } from './mockData';
// Local storage keys
const STORAGE_EVENTS = 'ef_events';
const STORAGE_ORDERS = 'ef_orders';
const STORAGE_ATTENDEES = 'ef_attendees';
const STORAGE_TICKETS = 'ef_tickets';

const initializeData = () => {
  if (!localStorage.getItem(STORAGE_EVENTS)) {
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(MOCK_EVENTS));
  }
  if (!localStorage.getItem(STORAGE_ORDERS)) localStorage.setItem(STORAGE_ORDERS, '[]');
  if (!localStorage.getItem(STORAGE_ATTENDEES)) localStorage.setItem(STORAGE_ATTENDEES, '[]');
  if (!localStorage.getItem(STORAGE_TICKETS)) localStorage.setItem(STORAGE_TICKETS, '[]');
};

initializeData();

const API_BASE = import.meta.env.VITE_API_BASE;

export const apiService = {
  // PATCH /api/user/name
  updateUserName: async (name: string) => {
    const res = await fetch(`${API_BASE}/api/user/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update name');
    return await res.json();
  },

  // PATCH /api/user/email
  updateUserEmail: async (email: string) => {
    const res = await fetch(`${API_BASE}/api/user/email`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update email');
    return await res.json();
  },

  // --- Public APIs ---

  // GET /api/events
  getEvents: async (page = 1, limit = 10, search = '', eventStatus: 'all' | 'open' | 'closed' = 'all'): Promise<{ events: Event[], pagination: any }> => {
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`${API_BASE}/api/events?status=PUBLISHED&page=${page}&limit=${limit}&eventStatus=${eventStatus}${searchParam}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
    const data = await res.json();
    return data;
  },

  // GET /api/footer-links
  getFooterLinks: async (): Promise<FooterLink[]> => {
    const res = await fetch(`${API_BASE}/api/footer-links`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`Failed to load footer links: ${res.status}`);
    return await res.json();
  },

  // GET /api/footer-columns
  getFooterColumns: async (): Promise<FooterColumn[]> => {
    const res = await fetch(`${API_BASE}/api/footer-columns`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`Failed to load footer columns: ${res.status}`);
    return await res.json();
  },

  // GET /api/events/:slug
  getEventBySlug: async (slug: string): Promise<Event | null> => {
    const res = await fetch(`${API_BASE}/api/events/${encodeURIComponent(slug)}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load event: ${res.status}`);
    const data = await res.json();
    return data as Event;
  },

  // POST /api/coupons/validate
  validateCoupon: async (eventId: string, code: string, subtotal: number): Promise<{
    valid: boolean;
    error?: string;
    discountAmount?: number;
    discountType?: 'FIXED' | 'PERCENT';
    discountValue?: number;
    code?: string;
  }> => {
    const res = await fetch(`${API_BASE}/api/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, code, subtotal })
    });
    const data = await res.json().catch(() => ({ valid: false, error: 'Failed to validate coupon' }));
    return data;
  },

  // POST /api/orders (Creates Order -> OrderItems -> Attendees -> Tickets)
  createOrderTransaction: async (data: {
    eventId: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string;
    company?: string;
    items: { ticketTypeId: string; quantity: number; price: number }[];
    totalAmount: number;
    currency: string;
  }): Promise<{ orderId: string }> => {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Order failed: ${(await res.json()).error || res.status}`);
    return await res.json();
  },

  // POST /api/payments/hitpay/checkout-session
  createHitpayCheckoutSession: async (
    orderId: string
  ): Promise<{ checkoutUrl: string | null; status?: string; mock?: boolean }> => {
    const res = await fetch(`${API_BASE}/api/payments/hitpay/checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ orderId })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error || `Failed to create checkout session: ${res.status}`);
    return payload;
  },

  // GET /api/payments/status?sessionId=...
  getPaymentStatus: async (orderId: string): Promise<Order | null> => {
    const res = await fetch(`${API_BASE}/api/payments/status?sessionId=${encodeURIComponent(orderId)}`, {
      credentials: 'include',
      cache: 'no-store'
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load order: ${res.status}`);
    return await res.json();
  },

  // GET /api/tickets/order/:orderId
  getTicketsByOrder: async (orderId: string) => {
    const res = await fetch(`${API_BASE}/api/tickets/order/${encodeURIComponent(orderId)}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`Failed to load tickets: ${res.status}`);
    return await res.json();
  },

  // GET /api/tickets/:ticketId
  getTicketDetails: async (id: string): Promise<RegistrationView | null> => {
    const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    // Map backend ticket fields to RegistrationView for UI
    return {
      id: data.ticketId,
      ticketCode: data.ticketCode,
      qrPayload: data.qrPayload || data.ticketCode,
      eventId: data.eventId,
      eventName: data.eventName || '', // backend may need to populate this
      locationType: data.locationType || null,
      locationText: data.locationText || null,
      eventStartAt: data.eventStartAt || null,
      eventEndAt: data.eventEndAt || null,
      attendeeName: data.attendeeName || '', // backend may need to populate this
      attendeeEmail: data.attendeeEmail || '', // backend may need to populate this
      attendeePhone: data.attendeePhone || null,
      attendeeCompany: data.attendeeCompany || null,
      attendeeResponses: data.attendeeResponses || null,
      ticketName: data.ticketName || '', // backend may need to populate this
      status: data.status,
      paymentStatus: data.paymentStatus || '', // backend may need to populate this
      orderId: data.orderId,
      amountPaid: data.amountPaid || 0, // backend may need to populate this
      currency: data.currency || 'PHP', // backend may need to populate this
      streamingPlatform: data.streamingPlatform || null,
      checkInTimestamp: data.usedAt || data.checkInTimestamp || null
    };
  },

  // --- TicketTypes APIs ---

  // GET /api/ticket-types?eventId=...
  getTicketTypes: async (eventId: string): Promise<TicketType[]> => {
    const res = await fetch(`${API_BASE}/api/ticket-types?eventId=${encodeURIComponent(eventId)}`);
    if (!res.ok) throw new Error(`Failed to load ticket types: ${res.status}`);
    return await res.json();
  },

  // POST /api/ticket-types
  createTicketType: async (data: Partial<TicketType>): Promise<TicketType> => {
    // Remove createdBy if present
    const { createdBy, ...clean } = data;
    const res = await fetch(`${API_BASE}/api/ticket-types`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clean)

    });
    if (!res.ok) throw new Error(`Failed to create ticket type: ${res.status}`);
    return await res.json();
  },

  // PUT /api/ticket-types/:id
  updateTicketType: async (id: string, data: Partial<TicketType>): Promise<TicketType> => {
    const res = await fetch(`${API_BASE}/api/ticket-types/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to update ticket type: ${res.status}`);
    return await res.json();
  },

  // DELETE /api/ticket-types/:id
  deleteTicketType: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/ticket-types/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`Failed to delete ticket type: ${res.status}`);
  },

  // --- Admin APIs ---

  getAttendeesByEvent: async (eventId: string): Promise<Attendee[]> => {
    const res = await fetch(`${API_BASE}/api/admin/attendees?eventId=${encodeURIComponent(eventId)}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`Failed to load attendees: ${res.status}`);
    return await res.json();
  },

  createTicket: async (payload: Partial<Ticket>): Promise<Ticket> => {
    const res = await fetch(`${API_BASE}/api/admin/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Failed to create ticket: ${res.status}`);
    return await res.json();
  },

  getAdminEvents: async (search = ''): Promise<Event[]> => {
    const searchParam = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`${API_BASE}/api/admin/events${searchParam}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`Failed to load admin events: ${res.status}`);
    const data = await res.json();
    return (data || []).map((event: Event) => ({ ...event, ticketTypes: event.ticketTypes || [] }));
  },

  createEvent: async (eventData: Partial<Event>): Promise<Event> => {
    const res = await fetch(`${API_BASE}/api/admin/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(eventData)
    });
    if (!res.ok) throw new Error(`Failed to create event: ${res.status}`);
    const data = await res.json();
    return { ...data, ticketTypes: data?.ticketTypes || eventData.ticketTypes || [] } as Event;
  },

  updateEvent: async (id: string, eventData: Partial<Event>): Promise<Event> => {
    const res = await fetch(`${API_BASE}/api/admin/events/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(eventData)
    });
    if (!res.ok) throw new Error(`Failed to update event: ${res.status}`);
    const data = await res.json();
    return { ...data, ticketTypes: data?.ticketTypes || eventData.ticketTypes || [] } as Event;
  },

  deleteEvent: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/admin/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to delete event: ${res.status}`);
    }
  },

  uploadEventImage: async (file: File, eventId?: string): Promise<{ publicUrl: string }> => {
    const formData = new FormData();
    formData.append('image', file);
    if (eventId) formData.append('eventId', eventId);

    const endpoint = eventId
      ? `${API_BASE}/api/admin/events/${encodeURIComponent(eventId)}/image`
      : `${API_BASE}/api/admin/events/image`;

    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    if (!res.ok) throw new Error(`Failed to upload image: ${res.status}`);
    const data = await res.json();
    return { publicUrl: data.publicUrl };
  },

  getAnalytics: async (eventId?: string): Promise<AnalyticsSummary> => {
    const eventParam = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
    const res = await fetch(`${API_BASE}/api/analytics/summary${eventParam}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load analytics: ${res.status}`);
    }
    return res.json();
  },

  getRecentTransactions: async (page = 1, limit = 10, eventId?: string) => {
    const eventParam = eventId ? `&eventId=${encodeURIComponent(eventId)}` : '';
    const res = await fetch(`${API_BASE}/api/analytics/transactions?page=${page}&limit=${limit}${eventParam}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load transactions: ${res.status}`);
    }
    return res.json();
  },

  getRecentOrders: async (page = 1, limit = 10, eventId?: string) => {
    const eventParam = eventId ? `&eventId=${encodeURIComponent(eventId)}` : '';
    const res = await fetch(`${API_BASE}/api/analytics/orders?page=${page}&limit=${limit}${eventParam}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load orders: ${res.status}`);
    }
    return res.json();
  },

  getAuditLogs: async (page = 1, limit = 10) => {
    const res = await fetch(`${API_BASE}/api/analytics/audit-logs?page=${page}&limit=${limit}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load audit logs: ${res.status}`);
    }
    return res.json();
  },

  getTransactionDetail: async (orderId: string) => {
    const res = await fetch(`${API_BASE}/api/analytics/transactions/${encodeURIComponent(orderId)}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load transaction: ${res.status}`);
    }
    return res.json();
  },

  getOrderDetail: async (orderId: string) => {
    const res = await fetch(`${API_BASE}/api/analytics/orders/${encodeURIComponent(orderId)}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load order: ${res.status}`);
    }
    return res.json();
  },

  getAuditLogDetail: async (auditLogId: string) => {
    const res = await fetch(`${API_BASE}/api/analytics/audit-logs/${encodeURIComponent(auditLogId)}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to load audit log: ${res.status}`);
    }
    return res.json();
  },

  // GET /api/tickets/registrations?eventId=...
  getEventRegistrations: async (eventId: string, search = ''): Promise<RegistrationView[]> => {
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`${API_BASE}/api/tickets/registrations?eventId=${encodeURIComponent(eventId)}${searchParam}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`Failed to load registrations: ${res.status}`);
    return await res.json();
  },

  // GET /api/tickets/registrations-all (admin)
  getAllRegistrations: async (page = 1, limit = 10, search = ''): Promise<{ registrations: RegistrationView[]; pagination: any }> => {
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
    const url = `${API_BASE}/api/tickets/registrations-all?page=${page}&limit=${limit}${searchParam}`;
    console.log('Making request to:', url);
    try {
      const res = await fetch(url, {
        credentials: 'include'
      });
      console.log('Response status:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('API Error:', {
          status: res.status,
          statusText: res.statusText,
          url,
          error: errorText
        });
        throw new Error(`Failed to load all registrations: ${res.status}`);
      }
      const data = await res.json();
      console.log('API Response data:', data);
      if (Array.isArray(data)) {
        const result = {
          registrations: data,
          pagination: {
            page,
            limit,
            total: data.length,
            totalPages: Math.max(1, Math.ceil(data.length / limit))
          }
        };
        console.log('Normalized array response to:', result);
        return result;
      }
      if (!data.registrations || !data.pagination) {
        console.warn('Unexpected API response format. Expected {registrations, pagination} but got:', data);
      }
      return data;
    } catch (error: any) {
      console.error('Error in getAllRegistrations:', {
        error,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  },

  // POST /api/tickets/checkin
  checkInTicket: async (code: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/api/tickets/checkin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Check-in failed: ${res.status}`);
    }
    return res.json();
  },

  // PUT /api/users/:id/permissions
  updateUserPermissions: async (userId: string, payload: { canViewEvents: boolean; canEditEvents: boolean; canManualCheckIn: boolean }) => {
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to update permissions: ${res.status}`);
    }
    return res.json();
  },

  // POST /api/users/:id/send-password-reset
  sendPasswordReset: async (userId: string) => {
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/send-password-reset`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to send reset email: ${res.status}`);
    }
    return res.json();
  },

  // POST /api/users/:id/set-password
  setUserPassword: async (userId: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to set password: ${res.status}`);
    }
    return res.json();
  },

  // DELETE /api/users/:id
  removeStaffUser: async (userId: string) => {
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to remove staff: ${res.status}`);
    }
    return res.json();
  },

  // GET /api/admin/footer-links
  getAdminFooterLinks: async (): Promise<FooterLink[]> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-links`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load footer links: ${res.status}`);
    return await res.json();
  },

  // POST /api/admin/footer-links
  createFooterLink: async (payload: { type: FooterLinkType; label?: string; platform?: SocialPlatform; columnId?: string; url: string }): Promise<FooterLink> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to create footer link: ${res.status}`);
    }
    return await res.json();
  },

  // PUT /api/admin/footer-links/:id
  updateFooterLink: async (id: string, payload: { type: FooterLinkType; label?: string; platform?: SocialPlatform; columnId?: string; url: string }): Promise<FooterLink> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-links/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update footer link: ${res.status}`);
    }
    return await res.json();
  },

  // DELETE /api/admin/footer-links/:id
  deleteFooterLink: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-links/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to delete footer link: ${res.status}`);
    }
  },

  // PUT /api/admin/footer-links/reorder
  reorderFooterLinks: async (ids: string[]): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-links/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to reorder footer links: ${res.status}`);
    }
  },

  // GET /api/admin/footer-columns
  getAdminFooterColumns: async (): Promise<FooterColumn[]> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-columns`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load footer columns: ${res.status}`);
    return await res.json();
  },

  // POST /api/admin/footer-columns
  createFooterColumn: async (title: string): Promise<FooterColumn> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to create footer column: ${res.status}`);
    }
    return await res.json();
  },

  // PUT /api/admin/footer-columns/:id
  updateFooterColumn: async (id: string, title: string): Promise<FooterColumn> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-columns/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update footer column: ${res.status}`);
    }
    return await res.json();
  },

  // DELETE /api/admin/footer-columns/:id
  deleteFooterColumn: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/admin/footer-columns/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to delete footer column: ${res.status}`);
    }
  },

  // GET /api/admin/coupons?eventId=...
  getAdminCoupons: async (eventId: string): Promise<Coupon[]> => {
    const res = await fetch(`${API_BASE}/api/admin/coupons?eventId=${encodeURIComponent(eventId)}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`Failed to load coupons: ${res.status}`);
    return await res.json();
  },

  // POST /api/admin/coupons
  createCoupon: async (payload: { eventId: string; code?: string; discountType: CouponDiscountType; discountValue: number; maxUses?: number; expiresAt?: string }): Promise<Coupon> => {
    const res = await fetch(`${API_BASE}/api/admin/coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to create coupon: ${res.status}`);
    }
    return await res.json();
  },

  // POST /api/admin/coupons/bulk
  bulkCreateCoupons: async (payload: { eventId: string; count: number; discountType: CouponDiscountType; discountValue: number; maxUses?: number; expiresAt?: string }): Promise<Coupon[]> => {
    const res = await fetch(`${API_BASE}/api/admin/coupons/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to generate coupons: ${res.status}`);
    }
    return await res.json();
  },

  // PATCH /api/admin/coupons/:id
  updateCoupon: async (id: string, payload: Partial<{ status: 'ACTIVE' | 'DISABLED'; code: string; discountType: CouponDiscountType; discountValue: number; maxUses: number; expiresAt: string | null }>): Promise<Coupon> => {
    const res = await fetch(`${API_BASE}/api/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update coupon: ${res.status}`);
    }
    return await res.json();
  }
};
