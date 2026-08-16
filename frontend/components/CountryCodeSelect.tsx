
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Country {
  name: string;
  iso2: string;
  dial: string;
  example: string; // locally-formatted example number, no country code
}

// Curated list — common countries for this platform's audience, Philippines first as default.
export const COUNTRIES: Country[] = [
  { name: 'Philippines', iso2: 'PH', dial: '+63', example: '917 123 4567' },
  { name: 'Singapore', iso2: 'SG', dial: '+65', example: '8123 4567' },
  { name: 'Hong Kong', iso2: 'HK', dial: '+852', example: '5123 4567' },
  { name: 'United Arab Emirates', iso2: 'AE', dial: '+971', example: '50 123 4567' },
  { name: 'Saudi Arabia', iso2: 'SA', dial: '+966', example: '50 123 4567' },
  { name: 'Qatar', iso2: 'QA', dial: '+974', example: '3312 3456' },
  { name: 'Malaysia', iso2: 'MY', dial: '+60', example: '12 345 6789' },
  { name: 'Indonesia', iso2: 'ID', dial: '+62', example: '812 3456 789' },
  { name: 'Thailand', iso2: 'TH', dial: '+66', example: '81 234 5678' },
  { name: 'Vietnam', iso2: 'VN', dial: '+84', example: '91 234 56 78' },
  { name: 'Japan', iso2: 'JP', dial: '+81', example: '90 1234 5678' },
  { name: 'South Korea', iso2: 'KR', dial: '+82', example: '10 1234 5678' },
  { name: 'China', iso2: 'CN', dial: '+86', example: '138 0013 8000' },
  { name: 'Taiwan', iso2: 'TW', dial: '+886', example: '912 345 678' },
  { name: 'India', iso2: 'IN', dial: '+91', example: '81234 56789' },
  { name: 'United States', iso2: 'US', dial: '+1', example: '201 555 0123' },
  { name: 'Canada', iso2: 'CA', dial: '+1', example: '204 555 0123' },
  { name: 'United Kingdom', iso2: 'GB', dial: '+44', example: '7400 123456' },
  { name: 'Australia', iso2: 'AU', dial: '+61', example: '412 345 678' },
  { name: 'New Zealand', iso2: 'NZ', dial: '+64', example: '21 123 4567' },
  { name: 'Germany', iso2: 'DE', dial: '+49', example: '151 12345678' },
  { name: 'France', iso2: 'FR', dial: '+33', example: '6 12 34 56 78' },
  { name: 'Italy', iso2: 'IT', dial: '+39', example: '312 345 6789' },
  { name: 'Spain', iso2: 'ES', dial: '+34', example: '612 34 56 78' },
  { name: 'Netherlands', iso2: 'NL', dial: '+31', example: '6 12345678' },
  { name: 'Kuwait', iso2: 'KW', dial: '+965', example: '500 12345' },
  { name: 'Bahrain', iso2: 'BH', dial: '+973', example: '3600 1234' },
  { name: 'Oman', iso2: 'OM', dial: '+968', example: '9212 3456' },
  { name: 'Brunei', iso2: 'BN', dial: '+673', example: '712 3456' },
  { name: 'Myanmar', iso2: 'MM', dial: '+95', example: '9 212 345 67' },
];

// Auto-spaces (and caps the length of) a phone number as the user types, matching the
// selected country's grouping — derived from that country's own `example` string above (e.g.
// Philippines "917 123 4567" groups as 3-3-4), so this stays accurate per-country without a
// separate format table to keep in sync.
export function formatPhoneNumber(input: string, dial: string): string {
  const country = COUNTRIES.find(c => c.dial === dial) || COUNTRIES[0];
  const groupLengths = country.example.split(' ').map(g => g.length);
  const maxDigits = groupLengths.reduce((a, b) => a + b, 0);
  const digits = input.replace(/\D/g, '').slice(0, maxDigits);

  let result = '';
  let pos = 0;
  for (const len of groupLengths) {
    if (pos >= digits.length) break;
    result += (result ? ' ' : '') + digits.slice(pos, pos + len);
    pos += len;
  }
  return result;
}

// Unicode flag emoji (regional indicator sequences) render as plain two-letter text on
// Windows — Segoe UI Emoji has no colored flag glyphs — so use actual flag images instead.
const FlagImg: React.FC<{ iso2: string; className?: string }> = ({ iso2, className = '' }) => (
  <img
    src={`https://flagcdn.com/24x18/${iso2.toLowerCase()}.png`}
    srcSet={`https://flagcdn.com/48x36/${iso2.toLowerCase()}.png 2x`}
    alt=""
    width={20}
    height={15}
    className={`inline-block rounded-[2px] object-cover shrink-0 ${className}`}
  />
);

interface CountryCodeSelectProps {
  value: string; // dial code, e.g. "+63"
  onChange: (dial: string) => void;
}

export const CountryCodeSelect: React.FC<CountryCodeSelectProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find(c => c.dial === value) || COUNTRIES[0];
  const filtered = COUNTRIES.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    c.dial.includes(search.trim())
  );

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const openPanel = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPanelPos({ top: rect.bottom + 8, left: rect.left });
    setOpen(true);
  };

  // Rendered via portal (outside any ancestor's overflow:hidden — e.g. this control
  // sits inside a rounded Card that clips overflow), so click-outside/scroll/resize
  // must be handled globally rather than relying on a single wrapper's DOM bounds.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    // Scroll events don't bubble, but a capture-phase listener on window still fires for
    // scrolling inside descendants (e.g. this panel's own scrollable country list) — ignore
    // those so scrolling the list doesn't close it; only close on scroll happening elsewhere.
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };
    const handleResize = () => close();
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`h-full flex items-center gap-1.5 px-3 sm:px-3.5 py-3 sm:py-4 rounded-l-[1rem] border border-r-0 border-[#2E2E2F]/20 bg-[#F2F2F2] text-[14px] font-medium text-[#2E2E2F] transition-colors hover:bg-[#2E2E2F]/5 shrink-0 ${open ? 'ring-2 ring-[#38BDF2]/40 border-[#38BDF2]/40' : ''}`}
      >
        <FlagImg iso2={selected.iso2} />
        <span className="tabular-nums">{selected.dial}</span>
        <svg className={`w-3.5 h-3.5 text-[#2E2E2F]/50 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && panelPos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: panelPos.top, left: panelPos.left }}
          className="z-[200] w-72 max-w-[80vw] bg-white border border-[#2E2E2F]/15 rounded-2xl shadow-xl shadow-[#2E2E2F]/10 overflow-hidden"
        >
          <div className="p-2.5 border-b border-[#2E2E2F]/10">
            <input
              autoFocus
              type="text"
              placeholder="Search country or code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#38BDF2]/40 bg-[#F2F2F2] text-[13px] text-[#2E2E2F] focus:outline-none focus:ring-2 focus:ring-[#38BDF2]/30"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-[#2E2E2F]/50 font-medium">No matches</div>
            )}
            {filtered.map((c) => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => { onChange(c.dial); close(); }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-[#38BDF2]/10 ${c.dial === selected.dial && c.iso2 === selected.iso2 ? 'bg-[#38BDF2]/10' : ''}`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FlagImg iso2={c.iso2} />
                  <span className="truncate font-medium text-[#2E2E2F]">{c.name}</span>
                </span>
                <span className="text-[#2E2E2F]/50 font-medium tabular-nums shrink-0">{c.dial}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
