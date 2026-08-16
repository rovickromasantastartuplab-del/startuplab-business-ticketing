import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { Event } from '../../types';
import { Card, Button, PageLoader } from '../../components/Shared';
import { ICONS } from '../../constants';

// Helper to handle JSONB image format
const getImageUrl = (img: any): string => {
  if (!img) return 'https://via.placeholder.com/800x400';
  if (typeof img === 'string') return img;
  return img.url || img.path || img.publicUrl || 'https://via.placeholder.com/800x400';
};

// Date/time formatting with event timezone
const formatDate = (iso: string, timezone?: string, opts?: Intl.DateTimeFormatOptions) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', ...opts }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
};

const formatStartForCard = (startAt: string, timezone?: string) => {
  const d = formatDate(startAt, timezone, { month: 'short', day: 'numeric' });
  const t = formatDate(startAt, timezone, { hour: '2-digit', minute: '2-digit' });
  return `${d} • ${t}`;
};

function formatTime(dateString: string, timezone?: string) {
  const d = new Date(dateString);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    ...(timezone ? { timeZone: timezone } : {})
  }).replace(':00', '');
}

const EventCard: React.FC<{ event: Event }> = ({ event }) => {
  const navigate = useNavigate();
  // Safe calculation for minPrice if ticketTypes exist
  const minPrice = event.ticketTypes?.length
    ? Math.min(...event.ticketTypes.map(t => t.priceAmount))
    : 0;

  // Registration window label
  const now = new Date();
  const regOpen = event.regOpenAt ? new Date(event.regOpenAt) : null;
  const regClose = event.regCloseAt ? new Date(event.regCloseAt) : null;
  const regLabel = regOpen && now < regOpen
    ? `Opens ${formatDate(regOpen.toISOString(), event.timezone, { year: 'numeric', month: 'short', day: 'numeric' })}`
    : regClose
      ? `Closes ${formatDate(regClose.toISOString(), event.timezone, { year: 'numeric', month: 'short', day: 'numeric' })}`
      : '';
  const isOpen = event.eventStatus !== 'CLOSED';

  return (
    <Card className="flex flex-col h-full border border-[#2E2E2F]/10 rounded-[1.5rem] overflow-hidden bg-[#F2F2F2] hover:border-[#38BDF2]/40 transition-colors cursor-pointer" onClick={() => navigate(`/events/${event.slug}`)}>
      {/* Image Section */}
      <div className="relative h-52 overflow-hidden">
        <img
          src={getImageUrl(event.imageUrl)}
          alt={event.eventName}
          className="w-full h-full object-cover"
        />
        <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${isOpen ? 'bg-[#38BDF2] text-[#F2F2F2]' : 'bg-[#2E2E2F]/80 text-[#F2F2F2]'}`}>
          {isOpen ? 'Open' : 'Closed'}
        </div>
      </div>
      {/* Content Section */}
      <div className="p-6 flex-1 flex flex-col">
        <h4 className="text-[#2E2E2F] text-xl font-bold tracking-tight leading-tight mb-2 line-clamp-2">
          {event.eventName}
        </h4>
        <div className="text-[#2E2E2F]/70 text-[13px] font-medium mb-3 line-clamp-2">
          {event.summaryLine || 'Explore our latest projects, network with StartupLab founders and learn about future initiatives.'}
        </div>
        <div className="flex flex-wrap gap-2 text-[12px] font-medium text-[#2E2E2F]/70 mb-3">
          <span className="text-[#38BDF2]">{(event.ticketTypes || []).reduce((sum, t) => sum + (t.quantityTotal || 0), 0)} slots</span>
          <span className="text-[#2E2E2F]/60">•</span>
          <span>{event.location}</span>
          <span className="text-[#2E2E2F]/60">•</span>
          <span>{formatDate(event.startAt, event.timezone, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(event.startAt, event.timezone)}</span>
        </div>
        <div className="text-[#2E2E2F]/70 text-[13px] font-medium mb-6 leading-relaxed">
          {(event.description || '').length > 120 ? `${event.description.slice(0, 120)}...` : event.description}
        </div>
      </div>
    </Card>
  );
};

export const EventList: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 6, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [currentPage, setCurrentPage] = useState(1);
  const initialLoadRef = useRef(true);
  const requestIdRef = useRef(0);

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
        const data = await apiService.getEvents(currentPage, 6, debouncedSearch, statusFilter);
        if (requestId !== requestIdRef.current) return;
        setEvents(data.events || []);
        setPagination(data.pagination || { page: 1, limit: 6, total: 0, totalPages: 1 });
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
    fetchData();
  }, [currentPage, debouncedSearch, statusFilter]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, pagination.totalPages || 1);
  const paginatedEvents = useMemo(() => events, [events]);

  if (loading) return (
    <PageLoader label="Loading events..." />
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 lg:py-10">
      {/* Landing Experience Hero Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 gap-12">
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#38BDF2] text-[10px] text-[#F2F2F2] font-semibold uppercase tracking-wide mb-4">
            <span className="w-1.5 h-1.5 bg-[#F2F2F2] rounded-full"></span>
            Explore upcoming StartupLab events and secure your seat.
          </div>
          <h1 className="text-4xl lg:text-5xl font-black text-[#2E2E2F] tracking-tight leading-tight mb-5">
            Upcoming Events
          </h1>
          <p className="text-[#2E2E2F]/70 text-sm lg:text-base font-medium leading-relaxed">
            Attend interactive workshops, innovation showcases and summits hosted by StartupLab. Curated by our team, these sessions bring together startups, interns, partners and the broader community to connect, learn and innovate.<br /><br />
            This ticketing platform is your central hub for all official StartupLab gatherings. From internal training sessions to public‑facing demos and innovation forums, it streamlines registration and keeps you informed about upcoming opportunities.
          </p>
        </div>
        <div className="w-full lg:w-[360px] shrink-0 lg:pb-2">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-[#2E2E2F]/60 group-focus-within:text-[#38BDF2] transition-colors">
              <ICONS.Search className="h-4 w-4" strokeWidth={3} />
            </div>
            <input
              type="text"
              placeholder="Search events by title, topic or location…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-12 pr-12 py-3.5 bg-[#F2F2F2] border border-[#2E2E2F]/20 rounded-[1.5rem] text-[13px] font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-[#38BDF2]/30 focus:border-[#38BDF2] placeholder:text-[#2E2E2F]/40 placeholder:font-normal placeholder:text-[11px]"
            />
            <div className="absolute inset-y-0 right-0 pr-5 flex items-center text-[#2E2E2F]/60">
              {(isFetching || searchTerm.trim() !== debouncedSearch) && (
                <div className="w-4 h-4 border-2 border-[#2E2E2F]/30 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Registration Status Filter */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex items-center gap-1 p-1 bg-[#F2F2F2] rounded-full border border-[#2E2E2F]/10">
          {(['open', 'closed', 'all'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setStatusFilter(option)}
              className={`min-h-[32px] px-4 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-[#38BDF2] focus:ring-offset-2 ${statusFilter === option
                ? 'bg-[#38BDF2] text-[#F2F2F2]'
                : 'text-[#2E2E2F] hover:bg-[#2E2E2F] hover:text-[#F2F2F2]'
                }`}
            >
              {option === 'all' ? 'All' : option === 'open' ? 'Open' : 'Closed'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
        {paginatedEvents.map((event, idx) => (
          <div key={event.eventId}>
            <EventCard event={event} />
          </div>
        ))}
      </div>

      {/* Pagination Controller */}
      {totalPages > 1 && (
        <div className="mt-20 flex items-center justify-center gap-2">
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

      {/* Empty State */}
      {events.length === 0 && (
        <div className="py-20 px-8 text-center bg-[#F2F2F2] rounded-[2.5rem] border border-[#2E2E2F]/10">
          <div className="w-14 h-14 bg-[#F2F2F2] rounded-full flex items-center justify-center mx-auto mb-6 border border-[#2E2E2F]/10">
            <ICONS.Search className="w-7 h-7 text-[#2E2E2F]/60" />
          </div>
          <h3 className="text-2xl font-bold text-[#2E2E2F] tracking-tight mb-4">No active sessions found</h3>
          <Button
            variant="outline"
            className="px-4"
            onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
};
