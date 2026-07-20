
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { EventList } from './views/Public/EventList';
import { EventDetails } from './views/Public/EventDetails';
import { RegistrationForm } from './views/Public/RegistrationForm';
import { PaymentStatusView } from './views/Public/PaymentStatus';
import { TicketView } from './views/Public/TicketView';
import { AdminDashboard } from './views/Admin/Dashboard';
import { EventsManagement } from './views/Admin/EventsManagement';
import { RegistrationsList } from './views/Admin/RegistrationsList';
import { CheckIn } from './views/Admin/CheckIn';
import { SettingsView } from './views/Admin/Settings';
import { LoginPerspective } from './views/Auth/Login';
import { SignUpView } from './views/Auth/SignUp';
import { AcceptInvite } from './views/Auth/AcceptInvite';
import { ForgotPassword } from './views/Auth/ForgotPassword';
import { ResetPassword } from './views/Auth/ResetPassword';
import { ICONS } from './constants';
import { Button, Input, Modal } from './components/Shared';
import { UserRole } from './types';
import { supabase } from "./supabase/supabaseClient.js";
import { useUser } from './context/UserContext';
const API = import.meta.env.VITE_API_BASE;
const Branding: React.FC<{ className?: string, light?: boolean }> = ({ className = '', light = false }) => (
  <img
    src="https://xmjdcbzgdfylbqkjoyyb.supabase.co/storage/v1/object/public/startuplab-business-ticketing/assets/assets/image%20(1).svg"
    alt="StartupLab Business Ticketing Logo"
    className={`h-16 sm:h-24 w-auto ${className}`}
    style={{ filter: light ? 'invert(1) grayscale(1) brightness(2)' : undefined }}
  />
);
const PortalLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, email, name, imageUrl, isAuthenticated, clearUser, setUser, canViewEvents, canEditEvents, canManualCheckIn } = useUser();
  const isStaff = role === UserRole.STAFF;
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [profileModalOpen, setProfileModalOpen] = React.useState(false);
  const [nameInput, setNameInput] = React.useState('');
  const [emailInput, setEmailInput] = React.useState('');
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [profileError, setProfileError] = React.useState('');
  const [profileSuccess, setProfileSuccess] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const displayName = name?.trim() || (isStaff ? 'Staff Operative' : 'System Admin');
  const initials = (displayName || (isStaff ? 'ST' : 'AD'))
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const fetchProfile = async () => {
    try {
      setProfileError('');
      setProfileSuccess('');
      const res = await fetch(`${API}/api/whoAmI`, { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setNameInput(data.name || '');
        setEmailInput(data.email || '');
        setAvatarPreview(data.imageUrl || null);
        setAvatarFile(null);
        if (data?.role && data?.email) {
          setUser({
            role: data.role,
            email: data.email,
            name: data.name ?? null,
            imageUrl: data.imageUrl ?? null,
            canViewEvents: data.canViewEvents,
            canEditEvents: data.canEditEvents,
            canManualCheckIn: data.canManualCheckIn,
          });
        }
      }
    } catch { }
  };

  React.useEffect(() => {
    if (profileModalOpen) fetchProfile();
  }, [profileModalOpen]);

  React.useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    setProfileError(''); setProfileSuccess(''); setProfileLoading(true);
    try {
      const trimmedName = nameInput.trim();
      const trimmedEmail = emailInput.trim().toLowerCase();
      if (!trimmedName) throw new Error('Name is required.');
      if (!trimmedEmail) throw new Error('Email is required.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw new Error('Invalid email format.');
      }
      let nextName = trimmedName;
      let nextEmail = email || trimmedEmail;
      let nextImageUrl = avatarPreview || imageUrl || null;

      if (avatarFile) {
        const formData = new FormData();
        formData.append('image', avatarFile);
        const res = await fetch(`${API}/api/user/avatar`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to update avatar.');
        }
        const payload = await res.json().catch(() => ({}));
        nextImageUrl = payload.imageUrl || payload.user?.imageUrl || nextImageUrl;
        setAvatarFile(null);
        setAvatarPreview(nextImageUrl || null);
      }

      if (trimmedName !== (name || '')) {
        const res = await fetch(`${API}/api/user/name`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: trimmedName })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to update name.');
        }
        const payload = await res.json().catch(() => ({}));
        nextName = payload?.name || trimmedName;
        if (!nextImageUrl && payload?.imageUrl) nextImageUrl = payload.imageUrl;
      }

      if (trimmedEmail !== (email || '').trim().toLowerCase()) {
        const res = await fetch(`${API}/api/user/email`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: trimmedEmail })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to update email.');
        }
        const payload = await res.json().catch(() => ({}));
        nextEmail = payload?.email || trimmedEmail;
      }

      if (role && nextEmail) {
        setUser({
          role,
          email: nextEmail,
          name: nextName,
          imageUrl: nextImageUrl,
          canViewEvents,
          canEditEvents,
          canManualCheckIn,
        });
      }

      setProfileSuccess('Profile updated successfully.');
      setTimeout(() => setProfileModalOpen(false), 800);
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    const syncSession = async () => {
      const isPortalRoute = ['/dashboard', '/events', '/attendees', '/checkin', '/settings'].includes(location.pathname);
      if (!isPortalRoute) return;

      try {
        const res = await fetch(`${API}/api/whoAmI`, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) {
          clearUser();
          navigate('/login', { replace: true });
          return;
        }
        const me = await res.json().catch(() => null);
        if (!me?.role || !me?.email) {
          clearUser();
          navigate('/login', { replace: true });
          return;
        }
        setUser({
          role: me.role,
          email: me.email,
          name: me.name ?? null,
          imageUrl: me.imageUrl ?? null,
          canViewEvents: me.canViewEvents,
          canEditEvents: me.canEditEvents,
          canManualCheckIn: me.canManualCheckIn,
        });
      } catch {
        clearUser();
        navigate('/login', { replace: true });
      }
    };

    syncSession();
  }, [clearUser, location.pathname, navigate, setUser]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!role) return;
    const staffAllowed = ['/events', '/attendees', '/checkin'];
    const adminAllowed = ['/dashboard', '/events', '/attendees', '/checkin', '/settings'];
    const allowed = isStaff ? staffAllowed : adminAllowed;
    if (!allowed.includes(location.pathname)) {
      navigate('/events', { replace: true });
      return;
    }
    if (isStaff) {
      if (location.pathname === '/events' && canViewEvents === false) {
        navigate('/attendees', { replace: true });
      }
      if (location.pathname === '/checkin' && canManualCheckIn === false) {
        navigate('/attendees', { replace: true });
      }
    }
  }, [isAuthenticated, isStaff, location.pathname, navigate, role, canViewEvents, canManualCheckIn]);

  const staffPermsLoaded = role !== UserRole.STAFF || (
    typeof canViewEvents === 'boolean' && typeof canManualCheckIn === 'boolean'
  );
  const noStaffPerms = role === UserRole.STAFF && canViewEvents === false && canManualCheckIn === false;
  const menuItems = (
    !isAuthenticated || !role || !staffPermsLoaded
      ? []
      : role === UserRole.STAFF && canViewEvents === false && canManualCheckIn === false
        ? [
          { label: 'Attendees', path: '/attendees', icon: <ICONS.Users className="w-5 h-5" /> },
        ]
        : role === UserRole.STAFF
          ? [
            ...(canViewEvents !== false ? [{ label: 'Events', path: '/events', icon: <ICONS.Calendar className="w-5 h-5" /> }] : []),
            { label: 'Attendees', path: '/attendees', icon: <ICONS.Users className="w-5 h-5" /> },
            ...(canManualCheckIn !== false ? [{ label: 'Check-In', path: '/checkin', icon: <ICONS.CheckCircle className="w-5 h-5" /> }] : []),
          ]
          : [
            { label: 'Dashboard', path: '/dashboard', icon: <ICONS.Layout className="w-5 h-5" /> },
            { label: 'Events', path: '/events', icon: <ICONS.Calendar className="w-5 h-5" /> },
            { label: 'Attendees', path: '/attendees', icon: <ICONS.Users className="w-5 h-5" /> },
            { label: 'Check-In', path: '/checkin', icon: <ICONS.CheckCircle className="w-5 h-5" /> },
            { label: 'Settings', path: '/settings', icon: <ICONS.Settings className="w-5 h-5" /> },
          ]
  );


  const handleLogout = async () => {
    try {
      // 1. Call backend logout to clear cookies
      await fetch(`${API}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });

      // 2. Sign out from Supabase
      await supabase.auth.signOut();

      // 3. Clear any local tokens/storage
      localStorage.removeItem('sb-ddkkbtijqrgpitncxylx-auth-token');
      clearUser();

      // 4. Navigate to login
      navigate('/');
    } catch {
      // Still navigate to login even if there was an error
      navigate('/');
    }
  };

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = React.useState(true);
  return (
    <div className="min-h-screen flex bg-[#F2F2F2]">
      {/* Sidebar for desktop */}
      <aside
        className={`w-72 bg-[#F2F2F2] border-r border-[#2E2E2F]/10 hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 overflow-y-auto transform transition-transform duration-300 ease-in-out ${desktopSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >

        <div className="pt-6 pb-2 px-8 flex flex-col items-start">
        </div>
        <div className="px-8">
          <div className="mt-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isStaff ? 'bg-[#38BDF2]' : 'bg-[#2E2E2F]'}`}></span>
            <p className="text-[9px] uppercase font-black text-[#2E2E2F]/60 tracking-[0.2em]">
              {isStaff ? 'Portal' : 'Enterprise Admin'}
            </p>
          </div>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors group ${location.pathname === item.path
                ? 'bg-[#38BDF2] text-[#F2F2F2]'
                : 'text-[#2E2E2F]/70 hover:bg-[#38BDF2]/10 hover:text-[#38BDF2]'
                }`}
            >
              {item.icon}
              <span className="font-bold text-sm tracking-tight">{item.label}</span>
            </Link>
          ))}
        </nav>

      </aside>

      <main
        className={`flex-1 flex flex-col min-w-0 transition-[padding-left] duration-300 ease-in-out ${desktopSidebarOpen ? 'lg:pl-72' : 'lg:pl-0'
          }`}
      >
        <header className="h-20 bg-[#F2F2F2] border-b border-[#2E2E2F]/10 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20 w-full">
          <button
            className="focus:outline-none bg-transparent border-none p-0 flex items-center"
            onClick={() => {
              setDesktopSidebarOpen((prev) => !prev);
              setSidebarOpen((prev) => !prev);
            }}
            aria-label={desktopSidebarOpen || sidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
            aria-pressed={desktopSidebarOpen || sidebarOpen}
            style={{ background: 'none' }}
          >
            <img
              src="https://xmjdcbzgdfylbqkjoyyb.supabase.co/storage/v1/object/public/startuplab-business-ticketing/assets/assets/image%20(1).svg"
              alt="StartupLab Business Center Logo"
              className="h-16 sm:h-24 w-auto max-w-[160px]"
            />
          </button>
          <div className="flex items-center gap-4 min-w-0">
            {/* Profile Dropdown */}
            <div className="relative">
              <button
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#2E2E2F]/10 bg-[#F2F2F2] hover:bg-[#38BDF2]/10 transition-colors"
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#38BDF2]/20 text-[#2E2E2F] flex items-center justify-center">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-semibold text-xs text-[#2E2E2F]">{initials}</span>
                  )}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-[#2E2E2F] truncate max-w-[120px]">{displayName}</p>
                </div>
                <svg className="w-4 h-4 text-[#2E2E2F]/50" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-[#F2F2F2] border border-[#2E2E2F]/10 rounded-2xl shadow-[0_10px_40px_-10px_rgba(46,46,47,0.1)] z-50 p-2 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                    <div className="px-4 py-3 border-b border-[#2E2E2F]/5 mb-1">
                      <p className="text-[10px] font-medium text-[#2E2E2F]/40 uppercase tracking-widest mb-0.5">Account</p>
                      <p className="text-xs font-semibold text-[#2E2E2F] truncate">{displayName}</p>
                    </div>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#2E2E2F]/70 hover:bg-[#38BDF2]/10 hover:text-[#38BDF2] transition-colors text-left group"
                      onClick={() => {
                        setProfileModalOpen(true);
                        setUserMenuOpen(false);
                      }}
                    >
                      <ICONS.Settings className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                      <span>Edit Profile</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#2E2E2F]/70 hover:bg-red-50 hover:text-red-500 transition-colors text-left group"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                    >
                      <svg className="w-4 h-4 opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>Logout</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        {/* Sidebar overlay for mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="fixed inset-0 bg-[#2E2E2F]/70" onClick={() => setSidebarOpen(false)} />
            <aside className="relative w-64 bg-[#F2F2F2] border-r border-[#2E2E2F]/10 flex flex-col h-full z-50">
              <div className="p-8 flex items-center justify-between">
                <Branding className="text-base" />
                <button
                  className="min-h-[32px] min-w-[32px] px-2 py-2 rounded-xl bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2] transition-colors"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close navigation"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <nav className="flex-1 px-4 py-4 space-y-1">
                {menuItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors group ${location.pathname === item.path
                      ? 'bg-[#38BDF2] text-[#F2F2F2]'
                      : 'text-[#2E2E2F]/70 hover:bg-[#38BDF2]/10 hover:text-[#38BDF2]'
                      }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon}
                    <span className="font-bold text-sm tracking-tight">{item.label}</span>
                  </Link>
                ))}
              </nav>

            </aside>
          </div>
        )}

        <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {(noStaffPerms && location.pathname !== '/attendees') ? (
              <div className="flex flex-col items-center justify-center min-h-[40vh]">
                <div className="text-2xl font-black text-[#2E2E2F] mb-4">No Access</div>
                <div className="text-[#2E2E2F]/70 text-lg font-medium text-center">You do not have access to any features. Please contact your administrator.</div>
              </div>
            ) : (
              children
            )}
          </div>
        </div>
        <Modal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          title="Edit Profile"
          subtitle="Update your profile"
          size="sm"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#2E2E2F]/10 bg-[#F2F2F2] flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-black text-sm text-[#2E2E2F]">{initials}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="px-4 py-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarPreview ? 'Change Photo' : 'Upload Photo'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            </div>
            <Input
              label="Your Name"
              value={nameInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameInput(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={emailInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailInput(e.target.value)}
            />
            {profileError && <p className="text-xs text-[#2E2E2F] font-bold">{profileError}</p>}
            {profileSuccess && <p className="text-xs text-[#2E2E2F] font-bold">{profileSuccess}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setProfileModalOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSaveProfile} disabled={profileLoading || !nameInput.trim() || !emailInput.trim()}>
                {profileLoading ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
};

const PublicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex flex-col bg-[#F2F2F2]">
    <header className="h-20 bg-[#F2F2F2] border-b border-[#2E2E2F]/10 px-8 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
        <Link to="/">
          <Branding className="text-xl lg:text-2xl" />
        </Link>
        <nav className="flex items-center gap-10">
          <Link to="/" className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2E2E2F]/70 hover:text-[#38BDF2] transition-colors hidden sm:block">
            EVENTS
          </Link>
        </nav>
      </div>
    </header>
    <main className="flex-1">{children}</main>
    <footer className="bg-[#F2F2F2] text-[#2E2E2F]/70 py-16 px-8 border-t border-[#2E2E2F]/10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12">
          <div>
            <Branding className="text-2xl" />
            <p className="mt-4 text-sm font-medium max-w-sm text-[#2E2E2F]/70 leading-relaxed">
              Your gateway to StartupLab events.<br />
              From internal workshops to public showcases, this platform delivers seamless, secure registration for every StartupLab gathering.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 lg:text-right uppercase tracking-[0.2em] font-black text-[9px]">
            <div className="space-y-4">
              <p className="text-[#2E2E2F]/50 mb-4">Platform</p>
              <Link to="/" className="block text-[#2E2E2F]/70 hover:text-[#38BDF2]">Events List</Link>
            </div>
            <div className="space-y-4">
              <p className="text-[#2E2E2F]/50 mb-4">Legal</p>
              <a href="#" className="block text-[#2E2E2F]/70 hover:text-[#38BDF2]">Privacy</a>
              <a href="#" className="block text-[#2E2E2F]/70 hover:text-[#38BDF2]">Terms</a>
            </div>
          </div>
        </div>
        <div className="pt-8 border-t border-[#2E2E2F]/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-[9px] uppercase tracking-[0.3em] font-black text-[#2E2E2F]/60">
            © 2026 StartupLab Business Center
          </div>
          <div className="flex items-center gap-6 opacity-60 grayscale">
            <img src="https://xmjdcbzgdfylbqkjoyyb.supabase.co/storage/v1/object/public/startuplab-business-ticketing/images/hitpay.png" alt="HitPay" className="h-3" />
          </div>
        </div>
      </div>
    </footer>
  </div>
);

/** HashRouter + Supabase recovery links land as #access_token=...&type=recovery */
const AuthRecoveryListener: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true });
      }
    });

    (async () => {
      const hash = window.location.hash || '';
      if (!hash.includes('type=recovery')) return;
      // Let Supabase parse tokens from the hash before we replace the route
      await supabase.auth.getSession();
      navigate('/reset-password', { replace: true });
    })();

    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
};

const App: React.FC = () => (
  <Router>
    <AuthRecoveryListener />
    <Routes>
      <Route path="/login" element={<LoginPerspective />} />
      <Route path="/signup" element={<SignUpView />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<PublicLayout><EventList /></PublicLayout>} />
      <Route path="/events/:slug" element={<PublicLayout><EventDetails /></PublicLayout>} />
      <Route path="/events/:slug/register" element={<PublicLayout><RegistrationForm /></PublicLayout>} />
      <Route path="/payment/status" element={<PublicLayout><PaymentStatusView /></PublicLayout>} />
      <Route path="/tickets/:ticketId" element={<PublicLayout><TicketView /></PublicLayout>} />

      <Route path="/dashboard" element={<PortalLayout><AdminDashboard /></PortalLayout>} />
      <Route path="/events" element={<PortalLayout><EventsManagement /></PortalLayout>} />
      <Route path="/attendees" element={<PortalLayout><RegistrationsList /></PortalLayout>} />
      <Route path="/checkin" element={<PortalLayout><CheckIn /></PortalLayout>} />
      <Route path="/settings" element={<PortalLayout><SettingsView /></PortalLayout>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Router>
);
export default App;
