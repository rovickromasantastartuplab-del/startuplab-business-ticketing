
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { Event, UserRole, TicketType, RegistrationView, EventStatus, Ticket, FormFieldConfig, FormFieldType, RESERVED_FIELD_KEYS, Coupon, CouponDiscountType } from '../../types';
import { Card, Badge, Button, Modal, Input, PageLoader } from '../../components/Shared';
import { ICONS } from '../../constants';
import { useUser } from '../../context/UserContext';
import QRCode from 'react-qr-code';

// Helper to handle JSONB image format
const getImageUrl = (img: any): string => {
  if (!img) return 'https://via.placeholder.com/800x400';
  if (typeof img === 'string') return img;
  return img.url || img.path || img.publicUrl || 'https://via.placeholder.com/800x400';
};

const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];

const slugifyFieldKey = (label: string) => label
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

// Turns a stored responses key (e.g. "dietary_restrictions") into a readable label.
const humanizeFieldKey = (key: string) => key
  .replace(/_/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());

export const EventsManagement: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isTicketCreateModalOpen, setIsTicketCreateModalOpen] = useState(false);
  const [isAttendeeModalOpen, setIsAttendeeModalOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<RegistrationView[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [qrEvent, setQrEvent] = useState<Event | null>(null);
  const [qrCopied, setQrCopied] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<FormFieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [formFieldError, setFormFieldError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialLoadRef = useRef(true);
  const requestIdRef = useRef(0);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role, canEditEvents } = useUser();
  const isStaff = role === UserRole.STAFF;

  const initialFormData = {
    eventName: '',
    description: '',
    eventDate: '',
    eventTime: '09:00',
    endDate: '',
    endTime: '17:00',
    timezone: 'Asia/Manila',
    locationType: 'ONSITE' as Event['locationType'],
    location: '',
    capacityTotal: 100,
    imageUrl: 'https://images.unsplash.com/photo-1540575861501-7ad0582373f3?auto=format&fit=crop&q=80&w=800',
    status: 'PUBLISHED' as EventStatus,
    regOpenDate: new Date().toISOString().split('T')[0],
    regCloseDate: '',
    regCloseTime: '',
    streamingPlatform: '',
    ticketTypes: [] as TicketType[],
    formFields: [] as FormFieldConfig[]
  };

  const [formData, setFormData] = useState(initialFormData);

  // Stats calculation
  const eventStats = useMemo(() => {
    if (!currentEventId) return { registrations: 0, revenue: 0 };
    const eventRegs = attendees.filter(r => r.eventId === currentEventId && (r.status === 'ISSUED' || r.status === 'USED'));
    const revenue = eventRegs.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
    return { registrations: eventRegs.length, revenue };
  }, [currentEventId, attendees]);

  const itemsPerPage = 6;
  const totalPages = Math.ceil(events.length / itemsPerPage);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return events.slice(start, start + itemsPerPage);
  }, [events, currentPage]);

  const fetchEvents = async (searchValue = debouncedSearch) => {
    const requestId = ++requestIdRef.current;
    if (initialLoadRef.current) {
      setLoading(true);
    } else {
      setIsFetching(true);
    }
    try {
      const data = await apiService.getAdminEvents(searchValue);
      if (requestId !== requestIdRef.current) return;
      setEvents(data);

      const allRegsPromises = data.map(e => apiService.getEventRegistrations(e.eventId));
      const allRegsResults = await Promise.all(allRegsPromises);
      if (requestId !== requestIdRef.current) return;
      setAttendees(allRegsResults.flat());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setIsFetching(false);
        initialLoadRef.current = false;
      }
    }
  };

  const handleOpenCreate = () => {
    if (isStaff) return;
    setFormData(initialFormData);
    setCurrentEventId(null);
    setIsEditMode(false);
    setIsModalOpen(true);
    resetNewFieldForm();
  };

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => window.clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    fetchEvents(debouncedSearch);
  }, [debouncedSearch]);

  useEffect(() => {
    if (searchParams.get('openModal') === 'true' && !isStaff) {
      handleOpenCreate();
    }
  }, [searchParams, isStaff]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  if (loading) return <PageLoader label="Loading events..." variant="section" />;

  const formatDateForInput = (value: string) => {
    if (!value) return { date: '', time: '' };
    const normalized = value.replace(' ', 'T');
    const [datePart, timePart] = normalized.split('T');
    const time = timePart ? timePart.substring(0, 5) : '';
    return { date: datePart, time };
  };

  const handleOpenEdit = (event: Event) => {
    const mainDT = formatDateForInput(event.startAt);
    const endDT = formatDateForInput(event.endAt || '');
    const openDT = formatDateForInput(event.regOpenAt || '');
    const closeDT = formatDateForInput(event.regCloseAt || '');

    setFormData({
      eventName: event.eventName,
      description: event.description,
      eventDate: mainDT.date,
      eventTime: mainDT.time,
      endDate: endDT.date,
      endTime: endDT.time,
      timezone: event.timezone || 'Asia/Manila',
      locationType: event.locationType || 'ONSITE',
      location: event.locationText,
      capacityTotal: event.capacityTotal,
      imageUrl: getImageUrl(event.imageUrl),
      status: event.status,
      regOpenDate: openDT.date,
      regOpenTime: openDT.time,
      regCloseDate: closeDT.date,
      regCloseTime: closeDT.time,
      streamingPlatform: event.streamingPlatform || '',
      ticketTypes: event.ticketTypes,
      formFields: Array.isArray(event.formFields) ? event.formFields : []
    });
    setCurrentEventId(event.eventId);
    setIsEditMode(true);
    setIsModalOpen(true);
    resetNewFieldForm();
  };

  const resetNewFieldForm = () => {
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldRequired(true);
    setNewFieldOptions('');
    setFormFieldError('');
  };

  const handleAddFormField = () => {
    setFormFieldError('');
    const label = newFieldLabel.trim();
    if (!label) {
      setFormFieldError('Field label is required.');
      return;
    }
    const baseKey = slugifyFieldKey(label);
    if (!baseKey) {
      setFormFieldError('Field label must contain at least one letter or number.');
      return;
    }
    if (RESERVED_FIELD_KEYS.includes(baseKey)) {
      setFormFieldError(`"${label}" collides with a fixed field (name, email, phone, company). Choose a different label.`);
      return;
    }
    const existingKeys = new Set(formData.formFields.map(f => f.key));
    let key = baseKey;
    let suffix = 2;
    while (existingKeys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    const newField: FormFieldConfig = {
      key,
      label,
      type: newFieldType,
      required: newFieldRequired,
      ...(newFieldType === 'select'
        ? { options: newFieldOptions.split(',').map(o => o.trim()).filter(Boolean) }
        : {})
    };

    setFormData({ ...formData, formFields: [...formData.formFields, newField] });
    resetNewFieldForm();
  };

  const handleRemoveFormField = (key: string) => {
    setFormData({ ...formData, formFields: formData.formFields.filter(f => f.key !== key) });
  };

  // Phase 6 (optional): one-click, per-event, opt-in addition of the legacy Company field
  // onto the new config system. (Contact Number is now a permanent fixed field alongside
  // Name/Email — see RESERVED_FIELD_KEYS — so it's no longer offered here.) Only ever
  // affects this event's local form state — nothing persists until Save is clicked, and it
  // never runs automatically.
  const handleAdoptLegacyFields = () => {
    const legacyDefs: { label: string; type: FormFieldType; required: boolean }[] = [
      { label: 'Company', type: 'text', required: false },
    ];
    const existingLabels = new Set(formData.formFields.map(f => f.label.toLowerCase()));
    let next = [...formData.formFields];
    for (const def of legacyDefs) {
      if (existingLabels.has(def.label.toLowerCase())) continue;
      const baseKey = slugifyFieldKey(def.label);
      const existingKeys = new Set(next.map(f => f.key));
      let key = baseKey;
      let suffix = 2;
      while (existingKeys.has(key) || RESERVED_FIELD_KEYS.includes(key)) {
        key = `${baseKey}_${suffix}`;
        suffix += 1;
      }
      next = [...next, { key, label: def.label, type: def.type, required: def.required }];
    }
    setFormData({ ...formData, formFields: next });
  };

  const handleUpdateFormField = (key: string, updates: Partial<FormFieldConfig>) => {
    setFormData({
      ...formData,
      formFields: formData.formFields.map(f => f.key === key ? { ...f, ...updates } : f)
    });
  };

  const handleMoveFormField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= formData.formFields.length) return;
    const next = [...formData.formFields];
    [next[index], next[target]] = [next[target], next[index]];
    setFormData({ ...formData, formFields: next });
  };

  const handleOpenTickets = (event: Event) => {
    setSelectedEvent(event);
    setIsTicketModalOpen(true);
  };

  const handleOpenCoupons = (event: Event) => {
    setSelectedEvent(event);
    setIsCouponModalOpen(true);
  };

  const getEventPublicUrl = (event: Event) => `${window.location.origin}/#/events/${event.slug}`;

  const handleOpenQr = (event: Event) => {
    setQrCopied(false);
    setQrEvent(event);
  };

  const handleCopyQrLink = async () => {
    if (!qrEvent) return;
    try {
      await navigator.clipboard.writeText(getEventPublicUrl(qrEvent));
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 2000);
    } catch {
      setNotification({ message: 'Failed to copy link.', type: 'error' });
    }
  };

  const handleDownloadQr = () => {
    if (!qrEvent) return;
    const svg = document.getElementById('event-qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const padding = 32;
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#F2F2F2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);
      }
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `${qrEvent.slug || 'event'}-qr.png`;
      link.click();
    };
    img.src = url;
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiService.deleteEvent(deleteTarget.eventId);
      setEvents(prev => prev.filter(e => e.eventId !== deleteTarget.eventId));
      setDeleteTarget(null);
      setNotification({ message: `"${deleteTarget.eventName}" was deleted.`, type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to delete event.', type: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };


  const handleOpenAttendeePop = async (event: Event) => {
    setSelectedEvent(event);
    setIsAttendeeModalOpen(true);
    const data = await apiService.getEventRegistrations(event.eventId);
    const confirmedGuests = data.filter(reg => reg.status === 'ISSUED' || reg.status === 'USED');
    setAttendees(prev => {
      const otherRegs = prev.filter(r => r.eventId !== event.eventId);
      return [...otherRegs, ...confirmedGuests];
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubmitting(true);
    try {
      const { publicUrl } = await apiService.uploadEventImage(file, currentEventId || undefined);
      setFormData(prev => ({ ...prev, imageUrl: publicUrl }));
    } catch (err) {
      setNotification({ message: 'Image upload failed. Please retry.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditMode && isStaff) return;

    setSubmitting(true);
    try {
      const mergeDateTime = (date: string, time: string) => {
        if (!date) return null;
        const normalizedTime = time || '09:00';
        return `${date}T${normalizedTime}:00`;
      };

      const payload = {
        eventName: formData.eventName,
        description: formData.description,
        startAt: mergeDateTime(formData.eventDate, formData.eventTime),
        endAt: formData.endDate ? mergeDateTime(formData.endDate, formData.endTime) : null,
        timezone: formData.timezone,
        locationType: formData.locationType,
        locationText: formData.location,
        capacityTotal: formData.capacityTotal,
        imageUrl: formData.imageUrl,
        status: formData.status,
        regOpenAt: formData.regOpenDate || null,
        regCloseAt: formData.regCloseDate || null,
        streamingPlatform: formData.streamingPlatform,
        formFields: formData.formFields
      };

      if (isEditMode && currentEventId) {
        await apiService.updateEvent(currentEventId, payload);
        setNotification({ message: 'Changes synchronized successfully.', type: 'success' });
      } else {
        await apiService.createEvent(payload);
        setNotification({ message: 'Event successfully launched.', type: 'success' });
      }

      setIsModalOpen(false);
      fetchEvents();
    } catch (err) {
      setNotification({ message: 'Sync failed. Please retry.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTickets = async (updatedTickets: TicketType[]) => {
    if (!selectedEvent) return;
    setSubmitting(true);
    try {
      // Save all tickets (create or update)
      for (const ticket of updatedTickets) {
        if (ticket.ticketTypeId.startsWith('tk-')) {
          // New ticket (local id)
          const { ticketTypeId, quantitySold, ...cleanTicket } = ticket;
          await apiService.createTicketType({ ...cleanTicket, eventId: selectedEvent.eventId });
        } else {
          // Existing ticket
          await apiService.updateTicketType(ticket.ticketTypeId, ticket);
        }
      }
      // Refresh tickets from backend
      const ticketTypes = await apiService.getTicketTypes(selectedEvent.eventId);
      setSelectedEvent(ev => ev ? { ...ev, ticketTypes } : ev);
      setNotification({ message: 'Ticket inventory updated.', type: 'success' });
    } catch (err) {
      setNotification({ message: 'Failed to update ticket inventory.', type: 'error' });
    } finally {
      setSubmitting(false);
      setIsTicketModalOpen(false);
    }
  };


  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8">
      {notification && (
        <div className="fixed top-24 right-8 z-[120]">
          <Card className={`flex items-center gap-4 px-6 py-4 rounded-2xl border ${notification.type === 'success' ? 'bg-[#38BDF2]/20 border-[#38BDF2]/40 text-[#2E2E2F]' : 'bg-[#2E2E2F]/10 border-[#2E2E2F]/30 text-[#2E2E2F]'
            }`}>
            <div className={`p-2 rounded-xl ${notification.type === 'success' ? 'bg-[#38BDF2]/10 text-[#2E2E2F]' : 'bg-[#2E2E2F]/20 text-[#2E2E2F]'}`}>
              {notification.type === 'success' ? <ICONS.CheckCircle className="w-5 h-5" /> : <ICONS.Layout className="w-5 h-5" />}
            </div>
            <p className="font-bold text-sm tracking-tight">{notification.message}</p>
          </Card>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 px-2">
        <div>
          <h1 className="text-3xl font-bold text-[#2E2E2F] tracking-tight">Events</h1>
          <p className="text-[#2E2E2F]/70 font-medium text-sm mt-1">Configure and manage your organization's event lifecycle.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#2E2E2F]/60">
              <ICONS.Search className="h-4 w-4" strokeWidth={3} />
            </div>
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-10 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#38BDF2]/30 focus:border-[#38BDF2] transition-colors"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#2E2E2F]/70">
              {(isFetching || searchTerm.trim() !== debouncedSearch) && (
                <div className="w-4 h-4 border-2 border-[#2E2E2F]/30 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>
          {!isStaff && (
            <Button onClick={handleOpenCreate} className="rounded-xl px-6 py-3 bg-[#38BDF2] text-[#F2F2F2] hover:text-[#F2F2F2] font-bold transition-colors">
              <span className="flex items-center gap-2 font-bold text-sm">
                <ICONS.Calendar className="w-4 h-4" />
                Create Event
              </span>
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border-[#2E2E2F]/10 rounded-[2.5rem] bg-[#F2F2F2]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F2F2F2] border-b border-[#2E2E2F]/10">
              <tr>
                <th className="px-8 py-5 text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide">Event Identity</th>
                <th className="px-8 py-5 text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide">Date & Location</th>
                <th className="px-8 py-5 text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide">Lifecycle</th>
                <th className="px-8 py-5 text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2E2E2F]/10">
              {currentItems.map(event => (
                <tr key={event.eventId} className="hover:bg-[#38BDF2]/10 transition-colors group">
                  <td className="px-8 py-7">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-[#2E2E2F]/20">
                        <img
                          src={getImageUrl(event.imageUrl)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="font-bold text-[#2E2E2F] text-[16px] tracking-tight group-hover:text-[#2E2E2F] transition-colors">{event.eventName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-7">
                    <div className="text-[14px] font-semibold text-[#2E2E2F] tracking-tight">
                      {new Date(event.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="text-[12px] text-[#2E2E2F]/60 font-medium mt-1.5 flex items-center gap-2">
                      <ICONS.MapPin className="w-3 h-3 text-[#2E2E2F]/50" />
                      <span className="truncate max-w-[200px]">{event.locationText}</span>
                    </div>
                  </td>
                  <td className="px-8 py-7">
                    <div className={`inline-flex px-3.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${event.status === 'PUBLISHED'
                      ? 'bg-[#38BDF2]/20 text-[#2E2E2F]'
                      : event.status === 'DRAFT'
                        ? 'bg-[#F2F2F2] text-[#2E2E2F]/60 border border-[#2E2E2F]/20'
                        : 'bg-[#2E2E2F]/10 text-[#2E2E2F]'
                      }`}>
                      {event.status}
                    </div>
                  </td>
                  <td className="px-8 py-7 text-center">
                    <div className="flex justify-center items-center gap-6 opacity-70 group-hover:opacity-100 transition-colors">
                      <button
                        onClick={() => handleOpenTickets(event)}
                        className="text-[#2E2E2F] hover:text-[#2E2E2F] transition-colors p-1"
                        title="Manage Tickets"
                        disabled={isStaff && !canEditEvents}
                        style={isStaff && !canEditEvents ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                      >
                        <ICONS.CreditCard className="w-[1.2rem] h-[1.2rem]" strokeWidth={2.2} />
                      </button>
                      <button
                        onClick={() => handleOpenAttendeePop(event)}
                        className="text-[#2E2E2F] hover:text-[#2E2E2F] transition-colors p-1"
                        title="View Confirmed Guests"
                      >
                        <ICONS.Users className="w-[1.2rem] h-[1.2rem]" strokeWidth={2.2} />
                      </button>
                      <button
                        onClick={() => handleOpenCoupons(event)}
                        className="text-[#2E2E2F] hover:text-[#2E2E2F] transition-colors p-1"
                        title="Manage Coupons"
                        disabled={isStaff && !canEditEvents}
                        style={isStaff && !canEditEvents ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                      >
                        <svg className="w-[1.2rem] h-[1.2rem]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.59 13.41 11 22.99a2 2 0 01-2.83 0l-8.16-8.16a2 2 0 010-2.83L9.6 1.42A2 2 0 0111 .83h9a2 2 0 012 2v9a2 2 0 01-.41 1.58z" /><circle cx="16.5" cy="6.5" r="1.5" /></svg>
                      </button>
                      <button
                        onClick={() => handleOpenQr(event)}
                        className="text-[#2E2E2F] hover:text-[#2E2E2F] transition-colors p-1"
                        title="Generate Registration QR"
                      >
                        <svg className="w-[1.2rem] h-[1.2rem]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path strokeLinecap="round" d="M14 14h3m4 0h0M14 21h0m3-4h4m-4 4h4v-4" /></svg>
                      </button>
                      <button
                        onClick={() => handleOpenEdit(event)}
                        className="text-[#2E2E2F] hover:text-[#2E2E2F] transition-colors p-1"
                        title="Edit Session"
                        disabled={isStaff && !canEditEvents}
                        style={isStaff && !canEditEvents ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                      >
                        <svg className="w-[1.2rem] h-[1.2rem]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(event)}
                        className="text-[#2E2E2F] hover:text-[#2E2E2F] transition-colors p-1"
                        title="Delete Event"
                        disabled={isStaff}
                        style={isStaff ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                      >
                        <svg className="w-[1.2rem] h-[1.2rem]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m3 0-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7m3 4v6m4-6v6" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#F2F2F2] rounded-full border border-[#2E2E2F]/10">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => handlePageChange(i + 1)}
                className={`min-h-[32px] px-4 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-[#38BDF2] focus:ring-offset-2 ${currentPage === i + 1
                  ? 'bg-[#38BDF2] text-[#F2F2F2]'
                  : 'bg-[#F2F2F2] text-[#2E2E2F] hover:bg-[#2E2E2F] hover:text-[#F2F2F2]'
                  }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Re-architected Event Config Modal with Live Preview */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Edit Event' : 'Add New Event'}
        size="lg"
      >
        <div className="space-y-12">
          {/* HIGH-FIDELITY LIVE PREVIEW SECTION */}
          <div className="bg-[#F2F2F2] rounded-[2.5rem] p-4">
            <div className="space-y-8">
              {/* Event Identity Group */}
              <div className="space-y-4">
                <h1 className="text-4xl md:text-5xl font-black text-[#2E2E2F] tracking-tight leading-tight">
                  {formData.eventName || 'Untitled Session'}
                </h1>

                {/* Performance & Status Summary Row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className={`px-4 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-wide border ${formData.status === 'PUBLISHED'
                    ? 'bg-[#38BDF2]/20 border-[#38BDF2]/40 text-[#2E2E2F]'
                    : 'bg-[#F2F2F2] border-[#2E2E2F]/20 text-[#2E2E2F]/60'
                    }`}>
                    {formData.status}
                  </div>
                  {isEditMode && (
                    <>
                      <div className="px-4 py-1.5 rounded-xl bg-[#38BDF2]/10 border border-[#38BDF2]/40 text-[#2E2E2F] text-[10px] font-semibold uppercase tracking-wide flex items-center gap-2">
                        <ICONS.Users className="w-3 h-3" strokeWidth={3} />
                        {eventStats.registrations} REGISTRATIONS
                      </div>
                      <div className="px-4 py-1.5 rounded-xl bg-[#38BDF2] text-[#F2F2F2] text-[10px] font-semibold uppercase tracking-wide flex items-center gap-2">
                        <ICONS.CreditCard className="w-3 h-3" strokeWidth={3} />
                        PHP {eventStats.revenue.toLocaleString()} REVENUE
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  <div className="flex items-center gap-3 bg-[#F2F2F2] px-5 py-3 rounded-2xl border border-[#2E2E2F]/20">
                    <div className="w-8 h-8 bg-[#38BDF2]/10 text-[#2E2E2F] rounded-lg flex items-center justify-center">
                      <ICONS.Calendar className="w-4 h-4" strokeWidth={2.5} />
                    </div>
                    <span className="text-[13px] font-semibold text-[#2E2E2F] uppercase tracking-tight">
                      {formData.eventDate ? new Date(`${formData.eventDate}T${formData.eventTime}`).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Set Date & Time'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 bg-[#F2F2F2] px-5 py-3 rounded-2xl border border-[#2E2E2F]/20">
                    <div className="w-8 h-8 bg-[#38BDF2]/10 text-[#2E2E2F] rounded-lg flex items-center justify-center">
                      <ICONS.MapPin className="w-4 h-4" strokeWidth={2.5} />
                    </div>
                    <span className="text-[13px] font-semibold text-[#2E2E2F] uppercase tracking-tight truncate max-w-[200px]">
                      {formData.location || 'Set Venue / Connection'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description Block */}
              <div className="p-8 bg-[#F2F2F2] rounded-[2rem] border border-[#2E2E2F]/20">
                <h4 className="text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide mb-4">Event Overview</h4>
                <p className="text-[#2E2E2F]/70 text-[15px] font-medium leading-relaxed line-clamp-4">
                  {formData.description || 'Provide an executive summary of this event session...'}
                </p>
              </div>
            </div>
          </div>

          {/* CONFIGURATION FORM SECTION */}
          <form onSubmit={handleSubmit} className="space-y-10 px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide mb-3 ml-1">Event Details</label>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Input placeholder="Session Name" value={formData.eventName} onChange={(e: any) => setFormData({ ...formData, eventName: e.target.value })} />
                  </div>
                  <select
                    className="px-4 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-[11px] font-medium uppercase tracking-wide outline-none focus:ring-2 focus:ring-[#38BDF2]/30 focus:border-[#38BDF2]"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as EventStatus })}
                  >
                    <option value="PUBLISHED">Live / Published</option>
                    <option value="DRAFT">Draft / Private</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide mb-3 ml-1">Description</label>
                <textarea
                  className="w-full px-5 py-4 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-[1.5rem] text-sm min-h-[120px] focus:ring-2 focus:ring-[#38BDF2]/30 focus:border-[#38BDF2] transition-colors outline-none"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex flex-col gap-2 mb-3 px-1">
                  <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Visual Media</label>
                  <div className="relative group w-full h-40 rounded-[1.5rem] border-2 border-dashed border-[#2E2E2F]/30 bg-[#F2F2F2] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[#38BDF2] hover:bg-[#38BDF2]/10 transition-colors" onClick={() => fileInputRef.current?.click()}>
                    {formData.imageUrl ? (
                      <img src={getImageUrl(formData.imageUrl)} alt="Preview" className="w-full h-full object-cover rounded-[1.5rem]" />
                    ) : (
                      <div className="flex flex-col items-center justify-center w-full h-full">
                        <svg className="w-10 h-10 text-[#2E2E2F]/40 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="2.5" /><path d="M21 15l-5-5L5 21" /></svg>
                        <span className="text-[12px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Upload Event Image</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-lg px-3 py-1 text-[11px] font-semibold text-[#2E2E2F] uppercase tracking-wide group-hover:bg-[#38BDF2] group-hover:text-[#F2F2F2] transition-colors pointer-events-none">Browse</div>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                </div>
              </div>

              <Input label="Session Date" type="date" value={formData.eventDate} onChange={(e: any) => setFormData({ ...formData, eventDate: e.target.value })} />
              <Input label="Start Time" type="time" value={formData.eventTime} onChange={(e: any) => setFormData({ ...formData, eventTime: e.target.value })} />
              <Input label="End Date" type="date" value={formData.endDate} onChange={(e: any) => setFormData({ ...formData, endDate: e.target.value })} />
              <Input label="End Time" type="time" value={formData.endTime} onChange={(e: any) => setFormData({ ...formData, endTime: e.target.value })} />
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide mb-2 ml-1">Location Type</label>
                  <select
                    className="w-full px-4 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-[11px] font-medium uppercase tracking-wide outline-none focus:ring-2 focus:ring-[#38BDF2]/30 focus:border-[#38BDF2]"
                    value={formData.locationType}
                    onChange={(e) => setFormData({ ...formData, locationType: e.target.value as Event['locationType'] })}
                  >
                    <option value="ONSITE">Onsite</option>
                    <option value="ONLINE">Online</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide mb-2 ml-1">Timezone</label>
                  <Input value={formData.timezone} onChange={(e: any) => setFormData({ ...formData, timezone: e.target.value })} />
                </div>
              </div>
              <div className="md:col-span-2">
                <Input
                  label="Location / Connection Link"
                  placeholder="e.g. Global Tech Center"
                  value={formData.location}
                  onChange={(e: any) => {
                    const link = e.target.value;
                    const nextData: any = { ...formData, location: link };

                    // Auto-detect provider if choosing Online/Hybrid and no provider set
                    if ((formData.locationType === 'ONLINE' || formData.locationType === 'HYBRID') && !formData.streamingPlatform) {
                      const lowUrl = link.toLowerCase();
                      if (lowUrl.includes('meet.google.com')) nextData.streamingPlatform = 'Google Meet';
                      else if (lowUrl.includes('zoom.us') || lowUrl.includes('zoom.com')) nextData.streamingPlatform = 'Zoom';
                      else if (lowUrl.includes('teams.microsoft.com') || lowUrl.includes('teams.live.com')) nextData.streamingPlatform = 'Microsoft Teams';
                      else if (lowUrl.includes('youtube.com') || lowUrl.includes('youtu.be')) nextData.streamingPlatform = 'YouTube Live';
                    }

                    setFormData(nextData);
                  }}
                />
              </div>

              {(formData.locationType === 'ONLINE' || formData.locationType === 'HYBRID') && (
                <div className="md:col-span-2">
                  <Input
                    label="Streaming Platform"
                    placeholder="e.g. Google Meet, Zoom, Private Portal"
                    value={formData.streamingPlatform}
                    onChange={(e: any) => setFormData({ ...formData, streamingPlatform: e.target.value })}
                  />
                  <p className="mt-2 text-[10px] text-[#2E2E2F]/40 font-medium uppercase tracking-wide ml-1">
                    Used to label the virtual access dashboard for attendees.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-8 border-t border-[#2E2E2F]/20 space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <label className="block text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em] mb-1">Registration Form Fields</label>
                  <p className="text-[11px] text-[#2E2E2F]/50 font-medium">
                    Full Name, Email, and Contact Number are always collected. Add extra fields guests will see on the registration page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAdoptLegacyFields}
                  className="min-h-[32px] px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#F2F2F2] border border-[#2E2E2F]/20 text-[#2E2E2F] hover:bg-[#38BDF2] hover:text-[#F2F2F2] transition-colors whitespace-nowrap"
                  title="Adds Company as a configurable field, mirroring the old fixed form"
                >
                  Add Legacy Company Field
                </button>
              </div>

              {formData.formFields.length > 0 && (
                <div className="space-y-2">
                  {formData.formFields.map((field, index) => (
                    <div key={field.key} className="flex flex-wrap items-center gap-3 p-3 bg-[#F2F2F2] border border-[#2E2E2F]/15 rounded-xl">
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => handleMoveFormField(index, -1)} disabled={index === 0} className="text-[#2E2E2F]/50 hover:text-[#2E2E2F] disabled:opacity-20 disabled:hover:text-[#2E2E2F]/50 leading-none">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button type="button" onClick={() => handleMoveFormField(index, 1)} disabled={index === formData.formFields.length - 1} className="text-[#2E2E2F]/50 hover:text-[#2E2E2F] disabled:opacity-20 disabled:hover:text-[#2E2E2F]/50 leading-none">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => handleUpdateFormField(field.key, { label: e.target.value })}
                        className="flex-1 min-w-[140px] px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm"
                      />
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-[#2E2E2F]/10 text-[#2E2E2F]/70">
                        {FORM_FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                      </span>
                      <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#2E2E2F]/70 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleUpdateFormField(field.key, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveFormField(field.key)}
                        className="ml-auto text-[#2E2E2F]/50 hover:text-[#2E2E2F] p-1"
                        title="Remove field"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3 p-4 bg-[#F2F2F2] border border-dashed border-[#2E2E2F]/25 rounded-xl">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">New Field Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Dietary Restrictions"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Type</label>
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as FormFieldType)}
                    className="px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm"
                  >
                    {FORM_FIELD_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {newFieldType === 'select' && (
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Options (comma separated)</label>
                    <input
                      type="text"
                      placeholder="Vegetarian, Vegan, None"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm"
                    />
                  </div>
                )}
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#2E2E2F]/70 cursor-pointer select-none pb-2.5">
                  <input
                    type="checkbox"
                    checked={newFieldRequired}
                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                  />
                  Required
                </label>
                <Button type="button" onClick={handleAddFormField} className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors min-h-[32px]">
                  Add Field
                </Button>
              </div>
              {formFieldError && <p className="text-[11px] font-bold text-[#2E2E2F]">{formFieldError}</p>}
            </div>

            <div className="flex gap-4 pt-8 border-t border-[#2E2E2F]/20">
              <Button className="flex-1 py-2 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors min-h-[32px]" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-[2] py-2 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors min-h-[32px]" disabled={submitting}>
                {submitting ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Event')}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Ticket Management Pop-up */}
      <Modal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        title="Ticket Inventory Config"
        size="lg"
      >
        <TicketManager
          event={selectedEvent}
          onSave={handleSaveTickets}
          submitting={submitting}
          setNotification={setNotification}
        />
      </Modal>

      {/* Coupon Management Pop-up */}
      <Modal
        isOpen={isCouponModalOpen}
        onClose={() => setIsCouponModalOpen(false)}
        title="Coupons"
        subtitle={selectedEvent?.eventName}
        size="lg"
      >
        <CouponManager event={selectedEvent} setNotification={setNotification} />
      </Modal>


      {/* Attendee Quick-View Modal */}
      <Modal
        isOpen={isAttendeeModalOpen}
        onClose={() => setIsAttendeeModalOpen(false)}
        title={`Guest List: ${selectedEvent?.eventName || ''}`}
      >
        <div>
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide">Confirmed Registrations</span>
              <Badge type="info" className="px-3 py-1 font-semibold text-[10px] tracking-wide">{attendees.filter(r => r.eventId === selectedEvent?.eventId).length} GUESTS</Badge>
            </div>

            <div className="max-h-[500px] overflow-y-auto pr-2 space-y-4">
              {attendees.filter(r => r.eventId === selectedEvent?.eventId).map((reg) => (
                <div key={reg.id} className="flex items-center justify-between p-5 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-[1.75rem] hover:border-[#38BDF2]/30 transition-colors group">
                  <div className="flex items-center gap-5">
                    <div className="w-11 h-11 rounded-2xl bg-[#F2F2F2] flex items-center justify-center text-[#2E2E2F] font-semibold text-sm border border-[#2E2E2F]/20 group-hover:bg-[#38BDF2] group-hover:text-[#F2F2F2] transition-colors">
                      {reg.attendeeName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-[#2E2E2F] text-[15px] tracking-tight">{reg.attendeeName}</p>
                      <p className="text-[12px] text-[#2E2E2F]/60 font-medium uppercase tracking-tight mt-0.5">{reg.attendeeEmail}</p>
                      {reg.attendeeResponses && Object.keys(reg.attendeeResponses).length > 0 && (
                        <p className="text-[10px] text-[#2E2E2F]/50 font-medium mt-1 truncate max-w-xs">
                          {Object.entries(reg.attendeeResponses).map(([key, value]) => `${humanizeFieldKey(key)}: ${typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}`).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-[#2E2E2F] uppercase tracking-wide mb-1.5">{reg.ticketName}</p>
                    <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wide ${reg.status === 'USED' ? 'bg-[#38BDF2]/20 text-[#2E2E2F]' : 'bg-[#2E2E2F]/10 text-[#2E2E2F]'
                      }`}>
                      {reg.status}
                    </span>
                  </div>
                </div>
              ))}
              {attendees.filter(r => r.eventId === selectedEvent?.eventId).length === 0 && (
                <div className="py-24 text-center text-[#2E2E2F]/50">
                  <ICONS.Users className="w-14 h-14 mx-auto mb-5 opacity-20" />
                  <p className="font-medium uppercase tracking-wide text-[11px]">No confirmed guests detected</p>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              className="w-full py-2 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors min-h-[32px]"
              onClick={() => navigate('/attendees')}
            >
              Open Full Directory
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => !deleteLoading && setDeleteTarget(null)}
        title="Delete Event"
        size="lg"
      >
        <div className="space-y-6 px-2">
          <p className="text-[#2E2E2F]/80 font-medium text-sm leading-relaxed">
            Permanently delete <span className="font-black">{deleteTarget?.eventName}</span>? This also deletes its ticket types, issued tickets, and attendee records. This cannot be undone.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Button type="button" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button type="button" className="flex-[2]" onClick={handleConfirmDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Delete event'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!qrEvent}
        onClose={() => setQrEvent(null)}
        title="Registration QR Code"
        subtitle={qrEvent?.eventName}
        size="lg"
      >
        {qrEvent && (
          <div className="space-y-6 px-2 flex flex-col items-center">
            <div className="p-6 bg-[#F2F2F2] border border-[#2E2E2F]/10 rounded-2xl">
              <QRCode
                id="event-qr-code-svg"
                value={getEventPublicUrl(qrEvent)}
                size={220}
                fgColor="#2E2E2F"
                bgColor="#F2F2F2"
              />
            </div>
            <p className="text-[#2E2E2F]/70 font-medium text-[13px] text-center leading-relaxed">
              Scanning this code opens the event page where guests can register directly.
            </p>
            <div className="w-full px-4 py-3 rounded-xl bg-[#F2F2F2] border border-[#2E2E2F]/10 text-[12px] font-bold text-[#2E2E2F]/70 break-all text-center">
              {getEventPublicUrl(qrEvent)}
            </div>
            <div className="w-full flex flex-col sm:flex-row gap-4">
              <Button type="button" className="flex-1" onClick={handleCopyQrLink}>
                {qrCopied ? 'Copied!' : 'Copy Link'}
              </Button>
              <Button type="button" className="flex-1" onClick={handleDownloadQr}>
                Download QR
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

interface TicketManagerProps {
  event: Event | null;
  onSave: (tickets: TicketType[]) => void;
  submitting: boolean;
  setNotification: (n: { message: string; type: 'success' | 'error' }) => void;
}

const TicketManager: React.FC<TicketManagerProps> = ({ event, onSave, submitting, setNotification }) => {
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  useEffect(() => {
    const fetchTickets = async () => {
      if (event?.eventId) {
        const fetched = await apiService.getTicketTypes(event.eventId);
        setTickets(fetched);
        setExpandedTicketId(null);
      } else {
        setTickets([]);
        setExpandedTicketId(null);
      }
    };
    fetchTickets();
  }, [event?.eventId]);
  const [newTicket, setNewTicket] = useState({
    name: '',
    description: '',
    priceAmount: 0, // Default FREE
    currency: 'PHP',
    quantityTotal: 100,
    salesStartAt: '',
    salesEndAt: '',
    status: true
  });

  const addTicket = () => {
    if (!newTicket.name) return;
    const item: TicketType = {
      ticketTypeId: `tk-${Math.random().toString(36).substr(2, 9)}`,
      eventId: event?.eventId || '',
      name: newTicket.name,
      description: newTicket.description || undefined,
      priceAmount: newTicket.priceAmount,
      currency: newTicket.currency || 'PHP',
      quantityTotal: newTicket.quantityTotal,
      quantitySold: 0,
      salesStartAt: newTicket.salesStartAt || undefined,
      salesEndAt: newTicket.salesEndAt || undefined,
      status: newTicket.status
    };
    setTickets([...tickets, item]);
    setNewTicket({
      name: '',
      description: '',
      priceAmount: 0,
      currency: 'PHP',
      quantityTotal: 100,
      salesStartAt: '',
      salesEndAt: '',
      status: true
    });
  };

  const removeTicket = async (id: string) => {
    const ticket = tickets.find(t => t.ticketTypeId === id);
    if (ticket && !id.startsWith('tk-')) {
      try {
        await apiService.deleteTicketType(id);
        if (event?.eventId) {
          const updated = await apiService.getTicketTypes(event.eventId);
          setTickets(updated);
        }
      } catch (err) {
        setNotification({ message: 'Failed to delete ticket type.', type: 'error' });
      }
    } else {
      setTickets(tickets.filter(t => t.ticketTypeId !== id));
    }
  };

  const updateTicket = (id: string, updates: Partial<TicketType>) => {
    setTickets(prev => prev.map(ticket => (
      ticket.ticketTypeId === id ? { ...ticket, ...updates } : ticket
    )));
  };

  return (
    <div className="space-y-8">
      <div className="bg-[#F2F2F2] p-6 rounded-3xl border border-[#2E2E2F]/20">
        <h4 className="text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide mb-4">Add Ticket Tier</h4>
        <div className="space-y-4">
          <Input
            placeholder="Tier Name (e.g. VIP Access)"
            value={newTicket.name}
            onChange={(e: any) => setNewTicket({ ...newTicket, name: e.target.value })}
          />
          <textarea
            className="w-full px-4 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
            placeholder="Description (optional)"
            value={newTicket.description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewTicket({ ...newTicket, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Type</label>
              <select
                className="w-full px-4 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                value={newTicket.priceAmount === 0 ? 'FREE' : 'PAID'}
                onChange={(e) => setNewTicket({
                  ...newTicket,
                  priceAmount: e.target.value === 'FREE' ? 0 : 100,
                })}
              >
                <option value="FREE">Free</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Status</label>
              <select
                className="w-full px-4 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                value={newTicket.status ? 'ACTIVE' : 'INACTIVE'}
                onChange={(e) => setNewTicket({ ...newTicket, status: e.target.value === 'ACTIVE' })}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
          {newTicket.priceAmount > 0 && (
            <Input
              label={`Price (${newTicket.currency})`}
              type="number"
              value={newTicket.priceAmount}
              onChange={(e: any) => setNewTicket({ ...newTicket, priceAmount: parseFloat(e.target.value) })}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Quantity Total"
              type="number"
              value={newTicket.quantityTotal}
              onChange={(e: any) => setNewTicket({ ...newTicket, quantityTotal: parseInt(e.target.value, 10) || 0 })}
            />
            <Input
              label="Currency"
              value={newTicket.currency}
              onChange={(e: any) => setNewTicket({ ...newTicket, currency: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-4 mb-2">
            <Input
              label="Sales Start"
              type="datetime-local"
              value={newTicket.salesStartAt}
              onChange={(e: any) => setNewTicket({ ...newTicket, salesStartAt: e.target.value })}
            />
            <Input
              label="Sales End"
              type="datetime-local"
              value={newTicket.salesEndAt}
              onChange={(e: any) => setNewTicket({ ...newTicket, salesEndAt: e.target.value })}
            />
          </div>
          <Button
            onClick={() => {
              // Keep new ticket in local state; creation happens on commit
              addTicket();
            }}
            className="w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:text-[#F2F2F2] transition-colors"
          >
            Add to Inventory
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-[11px] font-semibold text-[#2E2E2F]/60 uppercase tracking-wide">Current Inventory</h4>
        {tickets.map((t) => {
          const isExpanded = expandedTicketId === t.ticketTypeId;
          const priceLabel = t.priceAmount === 0 ? 'Complimentary' : `PHP ${t.priceAmount.toLocaleString()}`;

          return (
            <div
              key={t.ticketTypeId}
              className={`flex flex-col gap-4 p-4 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl transition-colors ${!isExpanded ? 'cursor-pointer hover:border-[#38BDF2]/30' : ''
                }`}
              onClick={() => {
                if (!isExpanded) setExpandedTicketId(t.ticketTypeId);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-bold text-[#2E2E2F] text-sm">{t.name || 'Untitled Ticket'}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-wide">
                    <span className="text-[#2E2E2F]">{priceLabel}</span>
                    <span className="text-[#2E2E2F]/60">{t.status ? 'Active' : 'Inactive'}</span>
                    <span className="text-[#2E2E2F]/60">Qty {t.quantityTotal}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedTicketId(isExpanded ? null : t.ticketTypeId);
                    }}
                    className="text-[11px] font-semibold uppercase tracking-wide text-[#2E2E2F] hover:text-[#2E2E2F] transition-colors"
                  >
                    {isExpanded ? 'Collapse' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTicket(t.ticketTypeId);
                    }}
                    className="text-[#2E2E2F] hover:bg-[#38BDF2]/10 p-2 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#2E2E2F]/20">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Tier Name</label>
                    <input
                      value={t.name}
                      onChange={(e) => updateTicket(t.ticketTypeId, { name: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Status</label>
                    <select
                      className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                      value={t.status ? 'ACTIVE' : 'INACTIVE'}
                      onChange={(e) => updateTicket(t.ticketTypeId, { status: e.target.value === 'ACTIVE' })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Type</label>
                    <select
                      className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                      value={t.priceAmount === 0 ? 'FREE' : 'PAID'}
                      onChange={(e) => {
                        const isFree = e.target.value === 'FREE';
                        const nextPrice = isFree ? 0 : Math.max(t.priceAmount || 0, 100);
                        updateTicket(t.ticketTypeId, { priceAmount: nextPrice });
                      }}
                    >
                      <option value="FREE">Free</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Price ({t.currency || 'PHP'})</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={t.priceAmount === 0}
                      value={t.priceAmount}
                      onChange={(e) => updateTicket(t.ticketTypeId, { priceAmount: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className={`w-full px-3 py-2 border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2] ${t.priceAmount === 0 ? 'bg-[#F2F2F2] text-[#2E2E2F]/60' : 'bg-[#F2F2F2]'}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#2E2E2F]/60 uppercase tracking-wide">Quantity Total</label>
                    <input
                      type="number"
                      min={t.quantitySold || 0}
                      value={t.quantityTotal}
                      onChange={(e) => {
                        const nextValue = parseInt(e.target.value, 10) || 0;
                        updateTicket(t.ticketTypeId, {
                          quantityTotal: Math.max(nextValue, t.quantitySold || 0)
                        });
                      }}
                      className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-widest">Currency</label>
                    <input
                      value={t.currency}
                      onChange={(e) => updateTicket(t.ticketTypeId, { currency: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-widest">Description</label>
                    <textarea
                      value={t.description || ''}
                      onChange={(e) => updateTicket(t.ticketTypeId, { description: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                      rows={2}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-4 mb-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-widest">Sales Start</label>
                      <input
                        type="datetime-local"
                        value={t.salesStartAt || ''}
                        onChange={(e) => updateTicket(t.ticketTypeId, { salesStartAt: e.target.value })}
                        className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-widest">Sales End</label>
                      <input
                        type="datetime-local"
                        value={t.salesEndAt || ''}
                        onChange={(e) => updateTicket(t.ticketTypeId, { salesEndAt: e.target.value })}
                        className="w-full px-3 py-2 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm outline-none focus:border-[#38BDF2]"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-widest">
                Sold: {t.quantitySold || 0}
              </div>
            </div>
          );
        })}
        {tickets.length === 0 && <p className="text-center py-6 text-[#2E2E2F]/50 text-xs font-bold uppercase tracking-widest">No tickets configured</p>}
      </div>

      <Button
        onClick={() => onSave(tickets)}
        disabled={submitting}
        className="w-full py-2 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors min-h-[32px]"
      >
        {submitting ? 'Updating...' : 'Commit Inventory Changes'}
      </Button>
    </div>
  );
};

interface CouponManagerProps {
  event: Event | null;
  setNotification: (n: { message: string; type: 'success' | 'error' }) => void;
}

const CouponManager: React.FC<CouponManagerProps> = ({ event, setNotification }) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('FIXED');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [bulkCount, setBulkCount] = useState('10');
  const [bulkDiscountType, setBulkDiscountType] = useState<CouponDiscountType>('FIXED');
  const [bulkDiscountValue, setBulkDiscountValue] = useState('');
  const [bulkMaxUses, setBulkMaxUses] = useState('1');
  const [bulkExpiresAt, setBulkExpiresAt] = useState('');
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [generatedBatch, setGeneratedBatch] = useState<Coupon[] | null>(null);
  const [expandedCouponId, setExpandedCouponId] = useState<string | null>(null);

  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editDiscountType, setEditDiscountType] = useState<CouponDiscountType>('FIXED');
  const [editDiscountValue, setEditDiscountValue] = useState('');
  const [editMaxUses, setEditMaxUses] = useState('1');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!event) {
      setCoupons([]);
      return;
    }
    setLoading(true);
    apiService.getAdminCoupons(event.eventId)
      .then(setCoupons)
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
    setGeneratedBatch(null);
  }, [event?.eventId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setCreateError('');
    const value = Number(discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      setCreateError('Enter a valid discount value.');
      return;
    }
    const maxUsesValue = Number(maxUses);
    if (!Number.isInteger(maxUsesValue) || maxUsesValue <= 0) {
      setCreateError('Max uses must be a positive whole number.');
      return;
    }
    setCreating(true);
    try {
      const created = await apiService.createCoupon({
        eventId: event.eventId,
        code: code.trim() || undefined,
        discountType,
        discountValue: value,
        maxUses: maxUsesValue,
        expiresAt: expiresAt || undefined
      });
      setCoupons(prev => [created, ...prev]);
      setCode('');
      setDiscountValue('');
      setMaxUses('1');
      setExpiresAt('');
      setNotification({ message: `Coupon ${created.code} created.`, type: 'success' });
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create coupon.');
    } finally {
      setCreating(false);
    }
  };

  const handleBulkGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setBulkError('');
    const count = Number(bulkCount);
    const value = Number(bulkDiscountValue);
    if (!Number.isInteger(count) || count <= 0 || count > 500) {
      setBulkError('Count must be a whole number between 1 and 500.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setBulkError('Enter a valid discount value.');
      return;
    }
    const maxUsesValue = Number(bulkMaxUses);
    if (!Number.isInteger(maxUsesValue) || maxUsesValue <= 0) {
      setBulkError('Max uses must be a positive whole number.');
      return;
    }
    setBulkGenerating(true);
    try {
      const created = await apiService.bulkCreateCoupons({
        eventId: event.eventId,
        count,
        discountType: bulkDiscountType,
        discountValue: value,
        maxUses: maxUsesValue,
        expiresAt: bulkExpiresAt || undefined
      });
      setCoupons(prev => [...created, ...prev]);
      setGeneratedBatch(created);
      setNotification({ message: `${created.length} coupons generated.`, type: 'success' });
    } catch (err: any) {
      setBulkError(err.message || 'Failed to generate coupons.');
    } finally {
      setBulkGenerating(false);
    }
  };

  const handleToggleStatus = async (coupon: Coupon) => {
    const nextStatus = coupon.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const updated = await apiService.updateCoupon(coupon.couponId, { status: nextStatus });
      setCoupons(prev => prev.map(c => c.couponId === updated.couponId ? updated : c));
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to update coupon.', type: 'error' });
    }
  };

  const handleStartEdit = (coupon: Coupon) => {
    setExpandedCouponId(null);
    setEditingCouponId(coupon.couponId);
    setEditCode(coupon.code);
    setEditDiscountType(coupon.discountType);
    setEditDiscountValue(String(coupon.discountValue));
    setEditMaxUses(String(coupon.maxUses || 1));
    setEditExpiresAt(coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '');
    setEditError('');
  };

  const handleCancelEdit = () => {
    setEditingCouponId(null);
    setEditError('');
  };

  const handleSaveEdit = async (coupon: Coupon) => {
    setEditError('');
    const value = Number(editDiscountValue);
    if (!Number.isFinite(value) || value <= 0) {
      setEditError('Enter a valid discount value.');
      return;
    }
    const maxUsesValue = Number(editMaxUses);
    if (!Number.isInteger(maxUsesValue) || maxUsesValue <= 0) {
      setEditError('Max uses must be a positive whole number.');
      return;
    }
    if (maxUsesValue < (coupon.usesCount || 0)) {
      setEditError(`Max uses cannot be lower than the current uses count (${coupon.usesCount}).`);
      return;
    }
    if (!editCode.trim()) {
      setEditError('Code cannot be empty.');
      return;
    }
    setEditSaving(true);
    try {
      const updated = await apiService.updateCoupon(coupon.couponId, {
        code: editCode.trim(),
        discountType: editDiscountType,
        discountValue: value,
        maxUses: maxUsesValue,
        expiresAt: editExpiresAt || null
      });
      setCoupons(prev => prev.map(c => c.couponId === updated.couponId ? { ...updated, redemptions: c.redemptions } : c));
      setEditingCouponId(null);
      setNotification({ message: `Coupon ${updated.code} updated.`, type: 'success' });
    } catch (err: any) {
      setEditError(err.message || 'Failed to update coupon.');
    } finally {
      setEditSaving(false);
    }
  };

  const copyBatch = async () => {
    if (!generatedBatch) return;
    try {
      await navigator.clipboard.writeText(generatedBatch.map(c => c.code).join('\n'));
      setNotification({ message: 'Codes copied to clipboard.', type: 'success' });
    } catch {
      setNotification({ message: 'Failed to copy codes.', type: 'error' });
    }
  };

  const formatDiscount = (c: Coupon) => c.discountType === 'PERCENT' ? `${c.discountValue}% off` : `PHP ${c.discountValue} off`;

  if (!event) return null;

  return (
    <div className="space-y-8 px-1">
      <div className="space-y-3">
        <h3 className="text-[11px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.3em]">Create Coupon</h3>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 p-4 bg-[#F2F2F2] border border-[#2E2E2F]/15 rounded-xl">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Code (optional)</label>
            <input type="text" placeholder="Auto-generated if blank" value={code} onChange={(e) => setCode(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm uppercase" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)} className="px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm">
              <option value="FIXED">Fixed (PHP)</option>
              <option value="PERCENT">Percent (%)</option>
            </select>
          </div>
          <div className="w-28">
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Value</label>
            <input type="number" min="0" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
          </div>
          <div className="w-24">
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1" title="How many different people/orders can redeem this one code">Max Uses</label>
            <input type="number" min="1" step="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Expires (optional)</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
          </div>
          <Button type="submit" disabled={creating} className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors min-h-[32px]">
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </form>
        {createError && <p className="text-[11px] font-semibold text-[#2E2E2F]">{createError}</p>}
      </div>

      <div className="space-y-3">
        <h3 className="text-[11px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.3em]">Bulk Generate</h3>
        <form onSubmit={handleBulkGenerate} className="flex flex-wrap items-end gap-3 p-4 bg-[#F2F2F2] border border-dashed border-[#2E2E2F]/25 rounded-xl">
          <div className="w-24">
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Count</label>
            <input type="number" min="1" max="500" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Type</label>
            <select value={bulkDiscountType} onChange={(e) => setBulkDiscountType(e.target.value as CouponDiscountType)} className="px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm">
              <option value="FIXED">Fixed (PHP)</option>
              <option value="PERCENT">Percent (%)</option>
            </select>
          </div>
          <div className="w-28">
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Value</label>
            <input type="number" min="0" step="0.01" value={bulkDiscountValue} onChange={(e) => setBulkDiscountValue(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
          </div>
          <div className="w-24">
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1" title="How many different people/orders can redeem each generated code">Max Uses</label>
            <input type="number" min="1" step="1" value={bulkMaxUses} onChange={(e) => setBulkMaxUses(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Expires (optional)</label>
            <input type="date" value={bulkExpiresAt} onChange={(e) => setBulkExpiresAt(e.target.value)} className="px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
          </div>
          <Button type="submit" disabled={bulkGenerating} className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors min-h-[32px]">
            {bulkGenerating ? 'Generating...' : 'Generate Batch'}
          </Button>
        </form>
        {bulkError && <p className="text-[11px] font-semibold text-[#2E2E2F]">{bulkError}</p>}

        {generatedBatch && (
          <div className="p-4 bg-[#38BDF2]/10 border border-[#38BDF2]/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black text-[#2E2E2F] uppercase tracking-wide">{generatedBatch.length} codes generated</p>
              <div className="flex gap-2">
                <button type="button" onClick={copyBatch} className="min-h-[28px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] transition-colors">Copy All</button>
                <button type="button" onClick={() => setGeneratedBatch(null)} className="min-h-[28px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#F2F2F2] border border-[#2E2E2F]/20 text-[#2E2E2F] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors">Dismiss</button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
              {generatedBatch.map(c => (
                <span key={c.couponId} className="px-2.5 py-1.5 bg-white border border-[#2E2E2F]/15 rounded-lg text-[11px] font-mono font-bold text-[#2E2E2F] text-center">{c.code}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-[11px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.3em]">All Coupons ({coupons.length})</h3>
        {loading ? (
          <p className="text-center py-8 text-[#2E2E2F]/50 text-xs font-bold uppercase tracking-widest">Loading...</p>
        ) : coupons.length === 0 ? (
          <p className="text-center py-8 text-[#2E2E2F]/50 text-xs font-bold uppercase tracking-widest">No coupons yet for this event.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {coupons.map((c) => {
              const usesCount = c.usesCount || 0;
              const maxUsesForCoupon = c.maxUses || 1;
              const isExhausted = usesCount >= maxUsesForCoupon;
              const redemptions = c.redemptions || [];
              const isExpanded = expandedCouponId === c.couponId;
              const isEditing = editingCouponId === c.couponId;

              if (isEditing) {
                return (
                  <div key={c.couponId} className="bg-[#F2F2F2] border border-[#38BDF2]/40 rounded-xl p-3 space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Code</label>
                        <input type="text" value={editCode} onChange={(e) => setEditCode(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm uppercase" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Type</label>
                        <select value={editDiscountType} onChange={(e) => setEditDiscountType(e.target.value as CouponDiscountType)} className="px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm">
                          <option value="FIXED">Fixed (PHP)</option>
                          <option value="PERCENT">Percent (%)</option>
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Value</label>
                        <input type="number" min="0" step="0.01" value={editDiscountValue} onChange={(e) => setEditDiscountValue(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Max Uses</label>
                        <input type="number" min={usesCount || 1} step="1" value={editMaxUses} onChange={(e) => setEditMaxUses(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-wide mb-1">Expires</label>
                        <input type="date" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} className="px-3 py-2 bg-white border border-[#2E2E2F]/20 rounded-lg text-sm" />
                      </div>
                    </div>
                    {editError && <p className="text-[11px] font-semibold text-[#2E2E2F]">{editError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleSaveEdit(c)} disabled={editSaving} className="min-h-[28px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] transition-colors disabled:opacity-50">
                        {editSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" onClick={handleCancelEdit} disabled={editSaving} className="min-h-[28px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#F2F2F2] border border-[#2E2E2F]/20 text-[#2E2E2F] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={c.couponId} className="bg-[#F2F2F2] border border-[#2E2E2F]/15 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between gap-4 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-[#2E2E2F] text-[13px]">{c.code}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${c.status === 'ACTIVE' ? 'bg-[#38BDF2]/20 text-[#2E2E2F]' : 'bg-[#2E2E2F]/10 text-[#2E2E2F]/40'
                          }`}>{c.status}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${isExhausted ? 'bg-[#2E2E2F]/10 text-[#2E2E2F]/60' : 'bg-[#2E2E2F]/5 text-[#2E2E2F]/60'
                          }`}>{usesCount}/{maxUsesForCoupon} used</span>
                      </div>
                      <p className="text-[11px] text-[#2E2E2F]/60 font-medium mt-0.5">
                        {formatDiscount(c)}
                        {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {redemptions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedCouponId(isExpanded ? null : c.couponId)}
                          className="min-h-[28px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#F2F2F2] border border-[#2E2E2F]/20 text-[#2E2E2F] hover:bg-[#38BDF2] hover:text-[#F2F2F2] transition-colors"
                        >
                          {isExpanded ? 'Hide' : `Used by (${redemptions.length})`}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(c)}
                        className="min-h-[28px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#F2F2F2] border border-[#2E2E2F]/20 text-[#2E2E2F] hover:bg-[#38BDF2] hover:text-[#F2F2F2] transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(c)}
                        className="min-h-[28px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#F2F2F2] border border-[#2E2E2F]/20 text-[#2E2E2F] hover:bg-[#38BDF2] hover:text-[#F2F2F2] transition-colors"
                      >
                        {c.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                  {isExpanded && redemptions.length > 0 && (
                    <div className="border-t border-[#2E2E2F]/10 divide-y divide-[#2E2E2F]/10">
                      {redemptions.map((r) => (
                        <div key={r.redemptionId} className="px-3 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-[#2E2E2F] truncate">{r.buyerName || 'Unknown'}</p>
                            <p className="text-[11px] text-[#2E2E2F]/60 truncate">{r.buyerEmail || '—'}</p>
                          </div>
                          <p className="text-[10px] text-[#2E2E2F]/50 font-medium uppercase tracking-wide shrink-0 text-right">
                            {new Date(r.redeemedAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
