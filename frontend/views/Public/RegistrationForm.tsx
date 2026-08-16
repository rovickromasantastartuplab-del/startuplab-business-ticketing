
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { Event, TicketType } from '../../types';
import { Button, Card, Input, PageLoader } from '../../components/Shared';
import { CountryCodeSelect, COUNTRIES, formatPhoneNumber } from '../../components/CountryCodeSelect';
import { ICONS } from '../../constants';

const PAYMENT_METHODS = [
  {
    id: 'gcash',
    label: 'GCash',
    description: 'E-wallet',
    hitpayMethod: 'gcash',
    feeRate: 0.023,
    feeLabel: '2.3%'
  }
];

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2
  });

export const RegistrationForm: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState<Event | null>(null);
  const [selectedItems, setSelectedItems] = useState<{ ticket: TicketType, qty: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    termsAccepted: false
  });
  const [phoneDialCode, setPhoneDialCode] = useState('+63');
  const handlePhoneDialCodeChange = (dial: string) => {
    setPhoneDialCode(dial);
    // Re-group already-typed digits to the newly selected country's pattern instead of
    // leaving them stuck in the previous country's spacing.
    setFormData(prev => ({ ...prev, phone: formatPhoneNumber(prev.phone, dial) }));
  };

  // Phase 3: values for admin-configured custom fields (see docs/dynamic-registration-fields-plan.md).
  // Only used/rendered when the event has a non-empty formFields config.
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | boolean>>({});

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [paymentMethodId, setPaymentMethodId] = useState(PAYMENT_METHODS[0].id);

  // Coupon field lives on this page (see docs/coupon-feature-plan.md) — entered and applied
  // directly here rather than on the event page, so it's validated against the exact final
  // subtotal being checked out, with no risk of the selection changing in between.
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);

  useEffect(() => {
    if (slug) {
      apiService.getEventBySlug(slug).then(data => {
        setEvent(data);
        if (data) {
          try {
            const selectionRaw = searchParams.get('selections');
            if (selectionRaw) {
              const parsed: { id: string, qty: number }[] = JSON.parse(decodeURIComponent(selectionRaw));
              const items = parsed.map(p => {
                const t = data.ticketTypes.find(tick => tick.ticketTypeId === p.id);
                return t ? { ticket: t, qty: p.qty } : null;
              }).filter(i => i !== null) as { ticket: TicketType, qty: number }[];
              setSelectedItems(items);
            }
          } catch (e) {
          }
        }
        setLoading(false);
      });
    }
  }, [slug, searchParams]);

  const subtotal = selectedItems.reduce((acc, item) => acc + (item.ticket.priceAmount * item.qty), 0);

  // Coupons only make sense against a real charge — a free selection has nothing to discount,
  // and the backend rejects a coupon on a $0 order anyway, so keep the UI consistent with that.
  const couponEligible = subtotal > 0;

  const handleApplyCoupon = async () => {
    if (!event) return;
    const code = couponInput.trim();
    if (!code) return;
    setCouponError('');
    setCouponValidating(true);
    try {
      const result = await apiService.validateCoupon(event.eventId, code, subtotal);
      if (result.valid && result.discountAmount !== undefined) {
        setAppliedCoupon({ code: result.code || code.toUpperCase(), discountAmount: result.discountAmount });
      } else {
        setAppliedCoupon(null);
        setCouponError(result.error || 'Invalid coupon code');
      }
    } catch {
      setAppliedCoupon(null);
      setCouponError('Failed to validate coupon. Please try again.');
    } finally {
      setCouponValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  const discountAmount = appliedCoupon?.discountAmount || 0;
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const totalQuantity = selectedItems.reduce((acc, item) => acc + item.qty, 0);
  const selectedPayment = PAYMENT_METHODS.find((method) => method.id === paymentMethodId) ?? PAYMENT_METHODS[0];
  let paymentFee = 0;
  if (discountedSubtotal > 0) {
    paymentFee = roundCurrency(discountedSubtotal * selectedPayment.feeRate);
  }
  const totalPayable = roundCurrency(discountedSubtotal + paymentFee);
  const hasPaid = totalPayable > 0;

  // Admin-configured fields for this event (Name, Email, and Phone are always fixed and never
  // appear here — see RESERVED_FIELD_KEYS). An event with no fields configured shows only
  // Name + Email + Contact Number; Company and anything else is added explicitly by an admin
  // via the Events Management form-fields builder.
  const configuredFields = event?.formFields || [];

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name) newErrors.name = 'Full name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.phone) newErrors.phone = 'Contact number is required';
    if (!formData.termsAccepted) newErrors.terms = 'You must accept the terms';

    for (const field of configuredFields) {
      if (!field.required) continue;
      const value = customFieldValues[field.key];
      const isMissing = field.type === 'checkbox' ? value !== true : !value?.toString().trim();
      if (isMissing) newErrors[field.key] = `${field.label} is required`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !event || selectedItems.length === 0) return;

    setSubmitting(true);
    try {
      // Built as a variable (not an inline literal) so the extra `customFields` property
      // doesn't require widening apiService.createOrderTransaction's parameter type —
      // the backend (Phase 1) already reads it, and legacy events simply omit it.
      const orderPayload = {
        eventId: event.eventId,
        buyerName: formData.name,
        buyerEmail: formData.email,
        buyerPhone: `${phoneDialCode} ${formData.phone}`.trim(),
        company: formData.company,
        items: selectedItems.map(i => ({ ticketTypeId: i.ticket.ticketTypeId, quantity: i.qty, price: i.ticket.priceAmount })),
        totalAmount: totalPayable,
        currency: selectedItems[0]?.ticket.currency || 'PHP',
        ...(configuredFields.length > 0 ? { customFields: customFieldValues } : {}),
        ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {})
      };
      const { orderId } = await apiService.createOrderTransaction(orderPayload);
      if (!hasPaid) {
        navigate(`/payment/status?sessionId=${orderId}`); // Free order also goes to status page for confirmation
      } else {
        // Paid: create HitPay checkout session then redirect
        const { checkoutUrl, status } = await apiService.createHitpayCheckoutSession(orderId);
        if (checkoutUrl && checkoutUrl !== 'null' && checkoutUrl !== 'undefined') {
          window.location.href = checkoutUrl;
        } else {
          // Mock/disabled HitPay: go straight to status page
          navigate(`/payment/status?sessionId=${orderId}&status=${status || 'PAID'}`);
        }
      }
    } catch (err) {
      alert('Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <PageLoader label="Loading registration form..." variant="page" />
  );

  if (!event || selectedItems.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F2F2F2]">
      <Card className="p-10 text-center max-w-sm">
        <h2 className="text-xl font-black text-[#2E2E2F] mb-2">Session Expired</h2>
        <p className="text-[#2E2E2F]/70 text-sm mb-6">Please restart your registration from the event page.</p>
        <Button onClick={() => navigate('/')}>Return to Events</Button>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2F2F2] px-4 py-6 sm:px-6 sm:py-8 lg:py-12">
      <div className="max-w-6xl mx-auto">

        <div className="mb-8 sm:mb-10">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[#2E2E2F]/60 hover:text-[#2E2E2F] font-semibold text-[10px] uppercase tracking-wide transition-colors mb-4"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Change Selection
          </button>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#2E2E2F] tracking-tighter mb-1 leading-tight sm:leading-none">
            Complete Registration
          </h1>
          <div className="flex items-center gap-3">
            <span className="bg-[#38BDF2] text-[#F2F2F2] text-[9px] font-semibold px-2.5 py-1 rounded-lg uppercase tracking-wide">
              {totalQuantity} {totalQuantity === 1 ? 'Ticket' : 'Tickets'}
            </span>
            <p className="text-[#2E2E2F]/70 font-medium text-sm">
              for <span className="text-[#2E2E2F] font-semibold">{event.eventName}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">

          <div className="flex-1 w-full">
            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
              <Card className="p-5 sm:p-6 lg:p-8 border border-[#2E2E2F]/10 rounded-[1.75rem] sm:rounded-[2.5rem] bg-[#F2F2F2] relative">
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-5 mb-6 sm:mb-8">
                    <div className="w-12 h-px bg-[#2E2E2F]/10"></div>
                    <h3 className="text-[12px] font-semibold text-[#2E2E2F] uppercase tracking-wide whitespace-nowrap text-center">
                      Primary Registrant
                    </h3>
                    <div className="w-12 h-px bg-[#2E2E2F]/10"></div>
                  </div>

                  <div className="grid grid-cols-1 gap-y-6 sm:gap-y-7">
                    <div className="space-y-2">
                      <label className="text-[13px] font-medium text-[#2E2E2F]/70 ml-1">Full Name *</label>
                      <Input
                        placeholder="Full name as per identification"
                        className="py-3 sm:py-4 px-4 sm:px-5 rounded-[1rem] font-normal bg-[#F2F2F2] border border-[#2E2E2F]/20 focus:bg-[#F2F2F2] focus:border-[#38BDF2]/40 text-[#2E2E2F] placeholder:text-[#2E2E2F]/40 transition-colors text-[14px]"
                        value={formData.name}
                        onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
                        error={errors.name}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[13px] font-medium text-[#2E2E2F]/70 ml-1">Email Address *</label>
                      <Input
                        type="email"
                        placeholder="name@organization.com"
                        className="py-3 sm:py-4 px-4 sm:px-5 rounded-[1rem] font-normal bg-[#F2F2F2] border border-[#2E2E2F]/20 focus:bg-[#F2F2F2] focus:border-[#38BDF2]/40 text-[#2E2E2F] placeholder:text-[#2E2E2F]/40 transition-colors text-[14px]"
                        value={formData.email}
                        onChange={(e: any) => setFormData({ ...formData, email: e.target.value })}
                        error={errors.email}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[13px] font-medium text-[#2E2E2F]/70 ml-1">Contact Number *</label>
                      <div className="flex items-stretch">
                        <CountryCodeSelect value={phoneDialCode} onChange={handlePhoneDialCodeChange} />
                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder={COUNTRIES.find(c => c.dial === phoneDialCode)?.example || '917 123 4567'}
                          className={`flex-1 min-w-0 py-3 sm:py-4 px-4 sm:px-5 rounded-r-[1rem] font-normal bg-[#F2F2F2] border ${errors.phone ? 'border-[#2E2E2F]' : 'border-[#2E2E2F]/20'} focus:bg-[#F2F2F2] focus:border-[#38BDF2]/40 focus:outline-none focus:ring-2 ${errors.phone ? 'focus:ring-[#2E2E2F]/30' : 'focus:ring-[#38BDF2]/30'} text-[#2E2E2F] placeholder:text-[#2E2E2F]/40 transition-colors text-[14px]`}
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value, phoneDialCode) })}
                        />
                      </div>
                      {errors.phone && <p className="text-xs text-[#2E2E2F] mt-1 ml-1">{errors.phone}</p>}
                    </div>
                    {configuredFields.map((field) => (
                      <div key={field.key} className="space-y-2">
                        {field.type === 'checkbox' ? (
                          <label className={`flex items-center gap-3 cursor-pointer select-none py-3 sm:py-3.5 px-4 sm:px-5 rounded-[1rem] border transition-colors ${errors[field.key] ? 'border-[#2E2E2F]' : 'border-[#2E2E2F]/20 hover:border-[#38BDF2]/40'}`}>
                            <input
                              type="checkbox"
                              checked={customFieldValues[field.key] === true}
                              onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.checked })}
                              className="w-5 h-5 shrink-0 accent-[#38BDF2] cursor-pointer"
                            />
                            <span className="text-[14px] font-medium text-[#2E2E2F]/70">
                              {field.label}{field.required ? ' *' : ''}
                            </span>
                          </label>
                        ) : null}
                        {field.type === 'checkbox' && errors[field.key] && (
                          <p className="text-[11px] font-semibold text-[#2E2E2F] ml-1">{errors[field.key]}</p>
                        )}
                        {field.type !== 'checkbox' && (
                          <>
                            <label className="text-[13px] font-medium text-[#2E2E2F]/70 ml-1">
                              {field.label}{field.required ? ' *' : ''}
                            </label>
                            {field.type === 'select' ? (
                              <select
                                className={`w-full py-3 sm:py-4 px-4 sm:px-5 rounded-[1rem] font-normal bg-[#F2F2F2] border ${errors[field.key] ? 'border-[#2E2E2F]' : 'border-[#2E2E2F]/20'} focus:bg-[#F2F2F2] focus:border-[#38BDF2]/40 focus:outline-none focus:ring-2 ${errors[field.key] ? 'focus:ring-[#2E2E2F]/30' : 'focus:ring-[#38BDF2]/30'} text-[#2E2E2F] transition-colors text-[14px]`}
                                value={(customFieldValues[field.key] as string) || ''}
                                onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })}
                              >
                                <option value="" disabled>Select an option</option>
                                {(field.options || []).map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                                placeholder={field.label}
                                className="py-3 sm:py-4 px-4 sm:px-5 rounded-[1rem] font-normal bg-[#F2F2F2] border border-[#2E2E2F]/20 focus:bg-[#F2F2F2] focus:border-[#38BDF2]/40 text-[#2E2E2F] placeholder:text-[#2E2E2F]/40 transition-colors text-[14px]"
                                value={(customFieldValues[field.key] as string) || ''}
                                onChange={(e: any) => setCustomFieldValues({ ...customFieldValues, [field.key]: e.target.value })}
                                error={errors[field.key]}
                              />
                            )}
                            {errors[field.key] && field.type === 'select' && (
                              <p className="text-[11px] font-semibold text-[#2E2E2F] ml-1">{errors[field.key]}</p>
                            )}
                          </>
                        )}
                      </div>
                    ))}

                    <div className="pt-4 border-t border-[#2E2E2F]/10 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-semibold text-[#2E2E2F] uppercase tracking-wide">Payment Method</p>
                      </div>
                      <div className="space-y-3">
                        <select
                          className="w-full p-3 rounded-lg border border-[#2E2E2F]/20 bg-[#F2F2F2] text-[13px] font-normal text-[#2E2E2F] focus:border-[#38BDF2]/40 outline-none disabled:opacity-60"
                          value={paymentMethodId}
                          onChange={e => setPaymentMethodId(e.target.value)}
                          aria-label="Select payment method"
                          disabled={subtotal === 0}
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method.id} value={method.id}>
                              {method.label} — {method.description}
                            </option>
                          ))}
                        </select>
                        <div className={`mt-2 text-xs font-medium ${subtotal === 0 ? 'text-[#2E2E2F]/30' : 'text-[#2E2E2F]/70'}`}>
                          Fee: <span className="text-[#38BDF2]">{selectedPayment.feeLabel}</span>
                          {subtotal === 0 && <span className="ml-2">(No payment required for free ticket)</span>}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[#2E2E2F]/10 space-y-4">
                      <label className="flex items-start gap-4 cursor-pointer group select-none">
                        <div className="relative mt-1">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={formData.termsAccepted}
                            onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                          />
                          <div className="w-6 h-6 border-2 border-[#2E2E2F]/20 rounded-lg bg-[#F2F2F2] peer-checked:bg-[#38BDF2] peer-checked:border-[#38BDF2] transition-colors flex items-center justify-center">
                            <ICONS.CheckCircle className={`w-4 h-4 text-[#F2F2F2] transition-opacity ${formData.termsAccepted ? 'opacity-100' : 'opacity-0'}`} strokeWidth={4} />
                          </div>
                        </div>
                        <span className="text-sm font-medium text-[#2E2E2F]/70 leading-relaxed group-hover:text-[#2E2E2F] transition-colors">
                          I acknowledge that I have read and agree to the <a href="#/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#2E2E2F] font-bold hover:text-[#38BDF2] hover:underline">Terms and Conditions</a> and <a href="#/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#2E2E2F] font-bold hover:text-[#38BDF2] hover:underline">Privacy Policy</a> governing this event session.
                        </span>
                      </label>
                      {errors.terms && <p className="text-[11px] font-semibold text-[#2E2E2F] uppercase tracking-wide pl-10">{errors.terms}</p>}
                    </div>
                  </div>
                </div>
              </Card>

              <div className="flex flex-col sm:flex-row items-stretch gap-4">
                <Button
                  type="submit"
                  size="md"
                  className="flex-[2]"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#38BDF2]/30 border-t-[#F2F2F2] rounded-full animate-spin"></div>
                      Processing...
                    </span>
                  ) : totalPayable === 0 ? 'Confirm Registration' : `Checkout PHP ${formatCurrency(totalPayable)}`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="flex-1"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
              </div>

              <div className="flex flex-col items-center gap-4 pt-6">
                <div className="flex items-center gap-6 opacity-60">
                  <img src="https://xmjdcbzgdfylbqkjoyyb.supabase.co/storage/v1/object/public/startuplab-business-ticketing/images/hitpay.png" alt="HitPay" className="h-4" />
                </div>
                <p className="text-[9px] font-medium uppercase tracking-[0.4em] text-[#2E2E2F]/50">
                  Global Transaction Security by HitPay
                </p>
              </div>
            </form>
          </div>

          {/* High-Contrast Reservation Summary */}
          <div className="w-full lg:w-[400px] shrink-0 lg:sticky lg:top-10">
            <Card className="bg-[#F2F2F2] border border-[#2E2E2F]/10 rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden p-0">
              <div className="p-5 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
                <div className="flex items-center justify-between border-b border-[#2E2E2F]/10 pb-6">
                  <h3 className="font-semibold text-[11px] sm:text-[12px] text-[#2E2E2F] uppercase tracking-wide flex items-center gap-3">
                    <ICONS.Calendar className="w-4 h-4" />
                    Reservation Summary
                  </h3>
                </div>

                <div className="space-y-10">
                  {/* Line Items */}
                  <div className="space-y-6 sm:space-y-8">
                    {selectedItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start group">
                        <div className="flex-1 pr-6">
                          <p className="font-semibold text-[#2E2E2F] text-[13px] sm:text-[14px] uppercase tracking-tight leading-tight mb-2 group-hover:text-[#38BDF2] transition-colors">
                            {item.ticket.name}
                          </p>
                          <div className="flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 bg-[#38BDF2] rounded-full"></span>
                            <p className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">
                              {item.qty} {item.qty === 1 ? 'Guest' : 'Guests'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm sm:text-base font-bold text-[#38BDF2] tracking-tight block">
                            PHP {(item.ticket.priceAmount * item.qty).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-[#2E2E2F]/50 font-medium uppercase tracking-wide block mt-0.5">
                            {item.ticket.priceAmount > 0 ? `PHP ${item.ticket.priceAmount.toLocaleString()} ea` : 'Complimentary'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Coupon field — only offered on a real charge; a free selection has nothing to discount */}
                  {couponEligible && (
                    <div className="pt-5 sm:pt-6 border-t border-[#2E2E2F]/10">
                      {appliedCoupon ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-[10px] font-medium text-[#38BDF2] uppercase tracking-wide">Coupon {appliedCoupon.code} applied</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[11px] sm:text-[12px] font-semibold tracking-wide text-[#38BDF2]">−PHP {formatCurrency(discountAmount)}</span>
                            <button
                              type="button"
                              onClick={handleRemoveCoupon}
                              className="text-[10px] font-black uppercase tracking-widest text-[#2E2E2F]/50 hover:text-[#2E2E2F] transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-stretch gap-2">
                            <input
                              type="text"
                              placeholder="Coupon code"
                              value={couponInput}
                              onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                              className={`flex-1 min-w-0 px-4 py-3 rounded-xl border bg-[#F2F2F2] text-[13px] font-medium uppercase tracking-wide text-[#2E2E2F] placeholder:text-[#2E2E2F]/40 placeholder:normal-case focus:outline-none focus:ring-2 ${couponError ? 'border-[#2E2E2F] focus:ring-[#2E2E2F]/30' : 'border-[#2E2E2F]/20 focus:ring-[#38BDF2]/30 focus:border-[#38BDF2]/40'} transition-colors`}
                            />
                            <button
                              type="button"
                              onClick={handleApplyCoupon}
                              disabled={!couponInput.trim() || couponValidating}
                              className="shrink-0 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {couponValidating ? '...' : 'Apply'}
                            </button>
                          </div>
                          {couponError && <p className="text-[11px] font-semibold text-[#2E2E2F] ml-1">{couponError}</p>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fee Breakdown */}
                  <div className="pt-5 sm:pt-6 border-t border-[#2E2E2F]/10 space-y-4">
                    <div className="flex justify-between items-center text-[#2E2E2F]/60">
                      <span className="text-[10px] font-medium uppercase tracking-wide">Platform Subtotal</span>
                      <span className="text-[11px] sm:text-[12px] font-semibold tracking-wide">PHP {formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">HitPay Service Fee</span>
                      {discountedSubtotal === 0 ? (
                        <span className="text-[10px] font-semibold text-[#2E2E2F] border border-[#38BDF2]/40 px-2.5 py-0.5 rounded-lg tracking-wide bg-[#38BDF2]/10">
                          WAIVED
                        </span>
                      ) : (
                        <div className="text-right">
                          <span className="text-[11px] sm:text-[12px] font-semibold tracking-wide text-[#2E2E2F] block">
                            PHP {formatCurrency(paymentFee)}
                          </span>
                          <span className="text-[9px] font-medium text-[#2E2E2F]/50 uppercase tracking-wide block mt-1">
                            {selectedPayment.feeLabel}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Grand Total Footer */}
                  <div className="pt-5 sm:pt-6 border-t-2 border-[#2E2E2F]/10">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-[#2E2E2F] uppercase tracking-wide block">Grand Total</span>
                        <span className="text-2xl sm:text-3xl font-black text-[#38BDF2] tracking-tighter block leading-none">
                          {totalPayable === 0 ? 'FREE' : `PHP ${formatCurrency(totalPayable)}`}
                        </span>
                      </div>
                      <div className="pb-1">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#F2F2F2] text-[#38BDF2] rounded-xl flex items-center justify-center border border-[#2E2E2F]/10">
                          <ICONS.CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delivery Information */}
                <div className="mt-2 pt-6 sm:pt-8 border-t border-[#2E2E2F]/10">
                  <div className="flex items-center gap-4 bg-[#F2F2F2] p-4 rounded-2xl border border-[#2E2E2F]/10">
                    <div className="p-2.5 bg-[#F2F2F2] text-[#38BDF2] rounded-lg border border-[#2E2E2F]/10">
                      <ICONS.CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[#2E2E2F] uppercase tracking-wide leading-none">Digital Delivery</p>
                      <p className="text-[10px] text-[#2E2E2F]/60 font-medium mt-1.5 uppercase tracking-wide">Instant Ticket Access</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <div className="mt-6 sm:mt-8 px-2 sm:px-10 text-center">
              <p className="text-[10px] text-[#2E2E2F]/60 font-medium leading-relaxed uppercase tracking-wide">
                Enterprise Shield • Secure Checkout
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
