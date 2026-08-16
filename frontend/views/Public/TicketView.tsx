
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { RegistrationView } from '../../types';
import { Card, Badge, Button, PageLoader } from '../../components/Shared';
import { ICONS } from '../../constants';
import QRCode from 'react-qr-code';

// Turns a stored responses key (e.g. "dietary_restrictions") into a readable label.
const humanizeFieldKey = (key: string) => key
  .replace(/_/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());

export const TicketView: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<RegistrationView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ticketId) {
      apiService.getTicketDetails(ticketId).then(data => {
        setTicket(data);
        setLoading(false);
      });
    }
  }, [ticketId]);

  if (loading) return <PageLoader label="Loading ticket..." variant="page" />;
  if (!ticket) return <div className="p-20 text-center text-[#2E2E2F]/60">Ticket not found.</div>;

  const isCheckedIn = ticket.status === 'USED';
  const paymentLabel = ticket.paymentStatus ? ticket.paymentStatus.replace('_', ' ') : 'PENDING';
  const checkInLabel = ticket.checkInTimestamp ? new Date(ticket.checkInTimestamp).toLocaleString() : 'Not checked in';
  const isOnlineEvent = ticket.locationType === 'ONLINE';
  const meetLink = (ticket.locationText || '').trim();
  const showMeetLinkOnly = Boolean(isOnlineEvent && meetLink);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 lg:py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl lg:text-4xl font-black text-[#2E2E2F] tracking-tighter mb-4">
          Your Digital Ticket
        </h1>
        <p className="text-[#2E2E2F]/60 font-medium max-w-lg mx-auto leading-relaxed">
          {showMeetLinkOnly
            ? 'Your online session is ready. Use the link below to join.'
            : 'Present this QR code at the event entrance for check-in.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
        {/* Main Ticket Card */}
        <div className="md:col-span-3">
          <Card className="rounded-[2.5rem] bg-[#F2F2F2] border border-[#2E2E2F]/10 overflow-hidden shadow-2xl shadow-[#2E2E2F]/5 p-8 sm:p-12 relative">
            <div className="flex flex-col items-center gap-10">
              <div className="text-center">
                <Badge
                  className={`mb-6 px-4 py-1.5 rounded-xl font-black text-[10px] tracking-[0.2em] border ${isCheckedIn ? 'bg-[#38BDF2]/10 text-[#38BDF2] border-[#38BDF2]/20' : 'bg-[#38BDF2] text-[#F2F2F2] border-transparent'}`}
                >
                  {isCheckedIn ? 'CHECKED IN' : 'VALID TICKET'}
                </Badge>
                <h2 className="text-xl font-black text-[#2E2E2F] tracking-tight mb-2 uppercase">{ticket.eventName}</h2>
                <p className="text-[10px] font-black text-[#2E2E2F]/40 uppercase tracking-[0.4em]">{ticket.ticketName}</p>
              </div>

              {showMeetLinkOnly ? (
                <div className="w-full bg-[#38BDF2]/5 border border-[#38BDF2]/10 rounded-[2rem] p-8 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#2E2E2F]/40 mb-6">SECURE CONNECTION</p>
                  <Button size="md" className="w-full mb-4" onClick={() => { window.location.href = meetLink; }}>
                    JOIN LIVE SESSION
                  </Button>
                  <p className="text-[11px] font-bold text-[#38BDF2] break-all opacity-80">{meetLink}</p>
                </div>
              ) : (
                <div className="relative group w-full max-w-[280px]">
                  <div className="absolute -inset-6 bg-[#38BDF2]/5 rounded-[3.5rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <Card className="relative p-6 sm:p-8 bg-[#F2F2F2] border border-[#2E2E2F]/10 rounded-[2rem] shadow-xl shadow-[#2E2E2F]/5">
                    <div className="flex justify-center mb-6">
                      <QRCode
                        value={ticket.qrPayload || ticket.ticketCode}
                        size={180}
                        fgColor="#2E2E2F"
                        bgColor="#F2F2F2"
                        className="w-full h-auto"
                      />
                    </div>
                    <div className="pt-6 border-t border-[#2E2E2F]/5 text-center">
                      <p className="text-[9px] font-black text-[#2E2E2F]/30 uppercase tracking-[0.4em] mb-1">TICKET CODE</p>
                      <p className="text-sm font-black text-[#2E2E2F] tracking-widest uppercase">{ticket.ticketCode}</p>
                    </div>
                  </Card>
                </div>
              )}

              <div className="w-full bg-[#F2F2F2] border border-[#2E2E2F]/5 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-[#38BDF2] rounded-xl flex items-center justify-center text-[#F2F2F2] shrink-0 shadow-lg shadow-[#38BDF2]/20">
                  <ICONS.CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-[#2E2E2F]/40 uppercase tracking-widest">Entry Requirement</p>
                  <p className="text-[11px] font-bold text-[#2E2E2F] leading-tight">One scan per registrant. Verified ID required at gate.</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar Info Section */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-8 rounded-[2.5rem] bg-[#F2F2F2] border border-[#2E2E2F]/10">
            <h3 className="text-sm font-black text-[#2E2E2F] uppercase tracking-widest mb-8 pb-4 border-b border-[#2E2E2F]/5 flex items-center gap-3">
              <ICONS.Users className="w-4 h-4 text-[#38BDF2]" />
              Attendee Details
            </h3>
            <div className="space-y-6">
              <div>
                <p className="text-[9px] font-black text-[#2E2E2F]/40 uppercase tracking-widest mb-1.5">Attendee Name</p>
                <p className="text-[13px] font-black text-[#2E2E2F] truncate">{ticket.attendeeName}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-black text-[#2E2E2F]/40 uppercase tracking-widest mb-1.5">Email</p>
                  <p className="text-[12px] font-bold text-[#2E2E2F] truncate">{ticket.attendeeEmail}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-[#2E2E2F]/40 uppercase tracking-widest mb-1.5">Company</p>
                  <p className="text-[12px] font-bold text-[#2E2E2F] truncate">{ticket.attendeeCompany || 'N/A'}</p>
                </div>
              </div>
              {ticket.attendeeResponses && Object.keys(ticket.attendeeResponses).length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(ticket.attendeeResponses).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-[9px] font-black text-[#2E2E2F]/40 uppercase tracking-widest mb-1.5">{humanizeFieldKey(key)}</p>
                      <p className="text-[12px] font-bold text-[#2E2E2F] truncate">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value || 'N/A')}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-4 border-t border-[#2E2E2F]/5">
                <p className="text-[9px] font-black text-[#2E2E2F]/40 uppercase tracking-widest mb-2">Order Tracking</p>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-[#2E2E2F]/60">#{ticket.orderId.substring(0, 8)}...</span>
                  <span className={`font-black tracking-widest ${ticket.paymentStatus === 'PAID' ? 'text-[#38BDF2]' : 'text-[#2E2E2F]/60'}`}>
                    {paymentLabel.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-8 rounded-[2.5rem] bg-[#2E2E2F] border border-[#2E2E2F]/10 text-[#F2F2F2]">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F2F2F2]/40">Status</p>
              <div className="w-2 h-2 rounded-full bg-[#38BDF2] animate-pulse"></div>
            </div>
            <p className="text-xl font-black tracking-tight mb-2">
              {isCheckedIn ? 'Checked In' : 'Not Checked In'}
            </p>
            <p className="text-[11px] font-medium text-[#F2F2F2]/60 mb-8 leading-relaxed">
              {isCheckedIn
                ? `Checked in on ${checkInLabel}`
                : 'Present this ticket at the event for check-in.'}
            </p>

            <div className="space-y-3">
              {!showMeetLinkOnly && (
                <Button className="w-full bg-[#38BDF2] hover:bg-[#F2F2F2] hover:text-[#2E2E2F]" onClick={() => window.print()}>
                  DOWNLOAD TICKET
                </Button>
              )}
              <Button variant="ghost" className="w-full border-[#F2F2F2]/10 text-[#F2F2F2] hover:bg-[#F2F2F2]/5" onClick={() => navigate('/')}>
                BACK TO EVENTS
              </Button>
            </div>
          </Card>

          <div className="flex items-center justify-center gap-3 opacity-20 py-4">
            <ICONS.CreditCard className="w-4 h-4 text-[#2E2E2F]" />
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#2E2E2F]">
              SECURED BY STARTUPLAB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
