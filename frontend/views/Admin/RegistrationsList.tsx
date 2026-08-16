
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { RegistrationView, UserRole, Event } from '../../types';
import { Card, Modal, PageLoader } from '../../components/Shared';
import { ICONS } from '../../constants';
import { useUser } from '../../context/UserContext';
import QRCode from 'react-qr-code';

// Turns a stored responses key (e.g. "dietary_restrictions") into a readable label.
const humanizeFieldKey = (key: string) => key
  .replace(/_/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());

export const RegistrationsList: React.FC = () => {
  const [regs, setRegs] = useState<RegistrationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [selectedReg, setSelectedReg] = useState<RegistrationView | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, canManualCheckIn } = useUser();
  const isStaff = role === UserRole.STAFF;
  const eventId = searchParams.get('eventId');
  const itemsPerPage = 10;
  const isServerPaged = !eventId;
  const initialLoadRef = useRef(true);
  const requestIdRef = useRef(0);
  const [adminEvents, setAdminEvents] = useState<Event[]>([]);

  useEffect(() => {
    apiService.getAdminEvents().then(setAdminEvents).catch(() => setAdminEvents([]));
  }, []);

  const handleEventFilterChange = (nextEventId: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextEventId) next.set('eventId', nextEventId); else next.delete('eventId');
    setSearchParams(next);
    setCurrentPage(1);
  };

  const filteredRegs = regs;

  const totalPages = isServerPaged
    ? Math.max(1, pagination.totalPages || 1)
    : Math.max(1, Math.ceil(filteredRegs.length / itemsPerPage));

  const pagedRegs = useMemo(() => {
    if (isServerPaged) return filteredRegs;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRegs.slice(start, start + itemsPerPage);
  }, [filteredRegs, currentPage, itemsPerPage, isServerPaged]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => window.clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const fetchData = async () => {
      const requestId = ++requestIdRef.current;
      if (initialLoadRef.current) {
        setLoading(true);
      } else {
        setIsFetching(true);
      }
      try {
        if (eventId) {
          const data = await apiService.getEventRegistrations(eventId, debouncedSearch);
          if (requestId !== requestIdRef.current) return;
          setRegs(data);
          setPagination({
            page: 1,
            limit: itemsPerPage,
            total: data.length,
            totalPages: Math.max(1, Math.ceil(data.length / itemsPerPage))
          });
        } else {
          const { registrations, pagination: serverPagination } = await apiService.getAllRegistrations(currentPage, itemsPerPage, debouncedSearch);
          if (requestId !== requestIdRef.current) return;
          setRegs(registrations || []);
          setPagination(serverPagination || {
            page: 1,
            limit: itemsPerPage,
            total: 0,
            totalPages: 1
          });
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setIsFetching(false);
          initialLoadRef.current = false;
        }
      }
    };
    if (eventId || isServerPaged) {
      fetchData();
    }
  }, [eventId, currentPage, isServerPaged, itemsPerPage, debouncedSearch]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckIn = async (reg: RegistrationView) => {
    try {
      const result = await apiService.checkInTicket(reg.ticketCode);
      setRegs(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'USED', checkInTimestamp: result?.usedAt || new Date().toISOString() } : r));
    } catch (err) {
      // no-op for now; could add toast/alert
    }
  };

  const formatTimestamp = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const DetailItem = ({ label, value, mono = false }: { label: string; value?: React.ReactNode; mono?: boolean }) => (
    <div className="space-y-1">
      <p className="text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">{label}</p>
      <p className={`text-sm font-semibold text-[#2E2E2F] ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );



  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, eventId]);

  if (loading) {
    return <PageLoader label="Loading attendees..." variant="section" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-[#2E2E2F] tracking-tighter">Attendee List</h1>
          <p className="text-[#2E2E2F]/70 font-medium text-sm mt-1">
            Full visibility of confirmed registrations and financial transactions.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="w-full sm:w-56">
            <select
              className="block w-full px-3 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#38BDF2]/40 transition-colors font-medium"
              value={eventId || ''}
              onChange={(e) => handleEventFilterChange(e.target.value)}
            >
              <option value="">All Events</option>
              {adminEvents.map((ev) => (
                <option key={ev.eventId} value={ev.eventId}>{ev.eventName}</option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-80">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#2E2E2F]/60">
                <ICONS.Search className="h-4 w-4" strokeWidth={3} />
              </div>
              <input
                type="text"
                placeholder="Search directory..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-10 py-3 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#38BDF2]/30 focus:border-[#2E2E2F] transition-colors"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#2E2E2F]/70">
                {isFetching && <div className="w-4 h-4 border-2 border-[#2E2E2F]/30 border-t-transparent rounded-full animate-spin" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-[#2E2E2F]/10 rounded-2xl bg-[#F2F2F2]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F2F2F2] border-b border-[#2E2E2F]/10">
              <tr>
                <th className="px-8 py-5 text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Attendee</th>
                <th className="px-8 py-5 text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Ticket Information</th>
                <th className="px-8 py-5 text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Status</th>
                <th className="px-8 py-5 text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Transaction</th>
                <th className="px-8 py-5 text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em] text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2E2E2F]/10">
              {pagedRegs.map((reg, index) => {
                const isCheckedIn = reg.status === 'USED';
                const rowKey = reg.id ?? reg.ticketCode ?? `${reg.eventId}-${reg.orderId}-${index}`;

                return (
                  <tr
                    key={rowKey}
                    className="hover:bg-[#38BDF2]/10 transition-colors cursor-pointer"
                    onClick={() => setSelectedReg(reg)}
                  >
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-[15px] text-[#2E2E2F] tracking-tight">{reg.attendeeName}</span>
                        <span className="text-[12px] text-[#2E2E2F]/60 font-medium mt-0.5">{reg.attendeeEmail}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-[#2E2E2F]">{reg.eventName}</span>
                        <span className="text-[12px] text-[#2E2E2F]/60 font-medium mt-0.5">{reg.ticketName}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isCheckedIn
                          ? 'bg-[#38BDF2]/20 text-[#2E2E2F]'
                          : 'bg-[#2E2E2F]/10 text-[#2E2E2F]'
                        }`}>
                        {isCheckedIn ? 'CHECKED_IN' : 'ISSUED'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[15px] font-black text-[#2E2E2F] tracking-tighter">
                        {reg.currency} {(reg.amountPaid ?? 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      {!isCheckedIn ? (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCheckIn(reg);
                          }}
                          className="py-2 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] min-h-[32px] transition-colors"
                          disabled={isStaff && !canManualCheckIn}
                          style={isStaff && !canManualCheckIn ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                        >
                          MANUAL CHECK-IN
                        </button>
                      ) : (
                        <span className="text-[12px] font-bold text-[#2E2E2F]/40 italic tracking-tight">Arrived</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRegs.length === 0 && !loading && (
          <div className="py-24 text-center">
            <ICONS.Users className="w-12 h-12 text-[#2E2E2F]/30 mx-auto mb-4" />
            <p className="text-[#2E2E2F]/60 font-bold uppercase tracking-widest text-[10px]">No active attendees found.</p>
          </div>
        )}
      </Card>
      <Modal
        isOpen={Boolean(selectedReg)}
        onClose={() => setSelectedReg(null)}
        title="Attendee Details"
        size="xl"
      >
        {selectedReg && (
          <div className="space-y-10 px-1">
            <div className="flex flex-col md:flex-row gap-10">
              <div className="flex-1 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-[11px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.3em] mb-2">Identity</h3>
                  <div className="bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl p-5 grid grid-cols-1 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-[#38BDF2] text-[#F2F2F2] text-lg font-black flex items-center justify-center shrink-0">{selectedReg.attendeeName?.charAt(0)}</span>
                      <span className="font-black text-[#2E2E2F] text-lg truncate min-w-0">{selectedReg.attendeeName}</span>
                    </div>
                    <div className="text-[13px] text-[#2E2E2F]/70 font-bold break-words truncate min-w-0" title={selectedReg.attendeeEmail}>{selectedReg.attendeeEmail}</div>
                    {selectedReg.attendeePhone && <div className="text-[13px] text-[#2E2E2F]/70 font-bold break-words truncate min-w-0">{selectedReg.attendeePhone}</div>}
                    {selectedReg.attendeeCompany && <div className="text-[13px] text-[#2E2E2F]/70 font-bold break-words truncate min-w-0">{selectedReg.attendeeCompany}</div>}
                  </div>
                </div>
                {selectedReg.attendeeResponses && Object.keys(selectedReg.attendeeResponses).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-[11px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.3em] mb-2">Additional Details</h3>
                    <div className="bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl p-5 grid grid-cols-1 gap-3">
                      {Object.entries(selectedReg.attendeeResponses).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-4 text-[13px]">
                          <span className="font-black text-[#2E2E2F]/60 uppercase tracking-wide text-[10px] shrink-0">{humanizeFieldKey(key)}</span>
                          <span className="text-[#2E2E2F] font-bold text-right break-words min-w-0">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value || '—')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-[11px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.3em] mb-2">Ticket & Order</h3>
                  <div className="bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl p-5 grid grid-cols-1 gap-2">
                    <div className="flex flex-wrap gap-4 text-[13px]">
                      <span className="font-black text-[#2E2E2F]">{selectedReg.ticketName}</span>
                      <span className="font-mono text-[#2E2E2F]/60">{selectedReg.ticketCode}</span>
                    </div>
                    <div className="text-[13px] text-[#2E2E2F]/70 font-bold">Order ID: <span className="font-mono">{selectedReg.orderId}</span></div>
                    <div className="text-[13px] text-[#2E2E2F]/70 font-bold">Event: {selectedReg.eventName}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[11px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.3em] mb-2">Payment & Status</h3>
                  <div className="bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-xl p-5 grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-widest ${selectedReg.paymentStatus === 'PAID' ? 'bg-[#38BDF2]/20 text-[#2E2E2F]' : 'bg-[#2E2E2F]/10 text-[#2E2E2F]'}`}>{selectedReg.paymentStatus || '—'}</span>
                      <span className="text-[13px] font-black text-[#2E2E2F]">{selectedReg.currency} {Number(selectedReg.amountPaid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-widest ${selectedReg.status === 'USED' ? 'bg-[#38BDF2]/20 text-[#2E2E2F]' : 'bg-[#2E2E2F]/10 text-[#2E2E2F]'}`}>{selectedReg.status}</span>
                      <span className="text-[13px] text-[#2E2E2F]/70 font-bold">Check-in: {formatTimestamp(selectedReg.checkInTimestamp)}</span>
                    </div>
                  </div>
                </div>
              </div>
              {selectedReg.qrPayload && (
                <div className="flex flex-col items-center gap-4 justify-center bg-[#F2F2F2] rounded-2xl border border-[#2E2E2F]/20 px-6 py-8 min-w-[220px]">
                  <p className="text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">QR Code</p>
                  <QRCode value={selectedReg.qrPayload} size={160} fgColor="#2E2E2F" bgColor="#F2F2F2" />
                  <span className="text-[11px] text-[#2E2E2F]/60 font-mono break-all">{selectedReg.ticketCode}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#F2F2F2] rounded-full border border-[#2E2E2F]/10">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => handlePageChange(i + 1)}
                className={`min-h-[32px] px-4 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-[#38BDF2] focus:ring-offset-2 ${currentPage === i + 1
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

    </div>
  );
};
