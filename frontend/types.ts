
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
export type TicketTypeStatus = boolean; // true = ACTIVE, false = INACTIVE
export type OrderStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
export type PaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type TicketStatus = 'ISSUED' | 'USED' | 'CANCELLED' | 'REFUNDED';

export const UserRole = {
  ADMIN: 'ADMIN',
  STAFF: 'STAFF'
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

// Admin-configurable registration form fields (Phase 2 of dynamic-registration-fields-plan.md).
// Name and Email are always collected and are never represented here — see RESERVED_FIELD_KEYS.
export type FormFieldType = 'text' | 'email' | 'phone' | 'select' | 'checkbox';

export interface FormFieldConfig {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[]; // only used when type === 'select'
}

// Keys that always exist as fixed fields (name/email) or are legacy fixed columns
// (phone/company) — a custom field's generated key can never collide with these.
export const RESERVED_FIELD_KEYS = ['name', 'email', 'phone', 'company'];

// Per-event discount coupons, each with a configurable usage limit (see coupon-feature-plan.md).
export type CouponDiscountType = 'FIXED' | 'PERCENT';
// ACTIVE/DISABLED is an admin on/off switch, independent of usage — capacity is
// maxUses/usesCount. A coupon can be ACTIVE and fully used at the same time.
export type CouponStatus = 'ACTIVE' | 'DISABLED';

export interface CouponRedemption {
  redemptionId: string;
  orderId: string;
  redeemedAt: string;
  buyerName?: string | null;
  buyerEmail?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
}

export interface Coupon {
  couponId: string;
  code: string;
  eventId: string;
  discountType: CouponDiscountType;
  discountValue: number;
  status: CouponStatus;
  maxUses: number;
  usesCount: number;
  redeemedOrderId?: string | null;
  redeemedAt?: string | null;
  expiresAt?: string | null;
  createdBy?: string | null;
  created_at?: string;
  redemptions?: CouponRedemption[];
}

export interface Event {
  eventId: string;
  slug: string;
  eventName: string;
  description: string;
  startAt: string; // ISO timestamp
  endAt?: string; // ISO timestamp
  timezone?: string;
  locationType: 'ONSITE' | 'ONLINE' | 'HYBRID';
  locationText: string;
  capacityTotal: number;
  regOpenAt?: string; // date string
  regCloseAt?: string; // date string
  status: EventStatus;
  eventStatus?: 'OPEN' | 'CLOSED';
  streamingPlatform?: string;
  formFields?: FormFieldConfig[] | null;

  // Audit fields from DB
  created_at?: string;
  updated_at?: string;
  createdBy?: string;

  // Relations
  ticketTypes: TicketType[];

  // DB is jsonb, so it could be a string URL, or an object { url: '...' }
  imageUrl?: string | { url?: string; path?: string } | any;
}

export interface TicketType {
  ticketTypeId: string;
  eventId: string;
  name: string;
  description?: string;
  priceAmount: number;
  currency: string;
  quantityTotal: number;
  quantitySold: number;
  salesStartAt?: string;
  salesEndAt?: string;
  status: TicketTypeStatus;
  created_at?: string;
  updated_at?: string;
  createdBy?: string;
}

export interface Order {
  orderId: string;
  eventId: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  metadata?: any;
  expiresAt?: string;
  createdAt: string;
  eventName?: string;
  locationType?: 'ONSITE' | 'ONLINE' | 'HYBRID' | null;
  locationText?: string | null;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  streamingPlatform?: string | null;
}

export interface OrderItem {
  orderItemId: string;
  orderId: string;
  ticketTypeId: string;
  quantity: number;
  price: number;
  lineTotal: number;
}

export interface Attendee {
  attendeeId: string;
  eventId: string;
  orderId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  company?: string;
  notes?: string;
  consent: boolean;
  createdAt: string;
}

export interface Ticket {
  ticketId: string;
  eventId: string;
  ticketTypeId: string;
  orderId: string;
  attendeeId: string;
  ticketCode: string;
  qrPayload: string;
  status: TicketStatus;
  issuedAt: string;
  usedAt?: string;
}

// Helper interface for the UI to display joined data (similar to the old Registration type)
export interface RegistrationView {
  id: string; // Ticket ID or Attendee ID depending on context
  ticketCode: string;
  qrPayload?: string;
  eventId: string;
  eventName: string;
  locationType?: 'ONSITE' | 'ONLINE' | 'HYBRID' | null;
  locationText?: string | null;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  attendeeCompany?: string;
  attendeeResponses?: Record<string, string | boolean> | null;
  ticketName: string;
  status: TicketStatus;
  paymentStatus: OrderStatus;
  orderId: string;
  amountPaid: number;
  currency: string;
  streamingPlatform?: string | null;
  checkInTimestamp?: string;
}

export type FooterLinkType = 'CUSTOM' | 'SOCIAL';
export type SocialPlatform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'X' | 'LINKEDIN' | 'YOUTUBE';

export interface FooterColumn {
  footerColumnId: string;
  title: string;
  sortOrder: number;
  created_at?: string;
  updated_at?: string;
}

export interface FooterLink {
  footerLinkId: string;
  type: FooterLinkType;
  label?: string | null;
  platform?: SocialPlatform | null;
  columnId?: string | null;
  url: string;
  sortOrder: number;
  created_at?: string;
  updated_at?: string;
}

export interface AnalyticsSummary {
  totalRegistrations: number;
  ticketsSoldToday: number;
  totalRevenue: number;
  revenueToday: number;
  attendanceRate: number;
  paymentSuccessRate: number;
}
