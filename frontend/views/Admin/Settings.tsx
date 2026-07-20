
import React, { useState } from 'react';
import { Card, Button, Input, Badge, Modal } from '../../components/Shared';
import { ICONS } from '../../constants';
import { UserRole } from '../../types';
import { apiService } from '../../services/apiService';

const API_BASE = import.meta.env.VITE_API_BASE;

// Refined granular permissions for staff as per developer brief
type PermissionCategory = 'view_events' | 'edit_events' | 'manual_checkin';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  imageUrl?: string | null;
  role: string;
  perspective: UserRole;
  status: 'Active' | 'Inactive' | 'Pending';
  isOwner?: boolean;
  permissions: PermissionCategory[];
}

export const SettingsView: React.FC = () => {
  const [userName, setUserName] = useState('');
  React.useEffect(() => {
    // Assume user info is available from context or fetch whoAmI
    const fetchName = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/whoAmI`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUserName(data.name || '');
        }
      } catch { }
    };
    fetchName();
  }, []);
  const handleSaveName = async () => {
    try {
      await apiService.updateUserName(userName);
      setNotification({ message: 'Name updated successfully.', type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to update name.', type: 'error' });
    }
  };

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'team' | 'permission'>('team');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [passwordModalMember, setPasswordModalMember] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [resetLoadingId, setResetLoadingId] = useState<string | null>(null);
  const [removeModalMember, setRemoveModalMember] = useState<TeamMember | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  React.useEffect(() => {
    fetch(`${API_BASE}/api/users/all`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const mapped = Array.isArray(data)
          ? data.map(u => ({
            id: u.userId || u.id,
            name: u.name || '',
            email: u.email,
            imageUrl: u.imageUrl || null,
            role: u.role || '',
            perspective: u.role === 'STAFF' ? UserRole.STAFF : UserRole.ADMIN,
            permissions: [
              ...(u.canViewEvents ? ['view_events'] : []),
              ...(u.canEditEvents ? ['edit_events'] : []),
              ...(u.canManualCheckIn ? ['manual_checkin'] : [])
            ],
          }))
          : [];
        const sorted = mapped.sort((a, b) => {
          const aIsAdmin = a.perspective === UserRole.ADMIN;
          const bIsAdmin = b.perspective === UserRole.ADMIN;
          if (aIsAdmin === bIsAdmin) return a.name.localeCompare(b.name);
          return aIsAdmin ? -1 : 1;
        });
        setTeamMembers(sorted);
      });
  }, []);

  const [inviteData, setInviteData] = useState({
    email: '',
    role: 'STAFF',
    perspective: UserRole.STAFF,
    permissions: ['view_events'] as PermissionCategory[]
  });

  const toggleMemberPermission = async (memberId: string, perm: PermissionCategory) => {
    const target = teamMembers.find(m => m.id === memberId && m.perspective === UserRole.STAFF);
    if (!target) return;
    const hasPerm = target.permissions.includes(perm);
    const nextPerms = hasPerm
      ? target.permissions.filter(p => p !== perm)
      : [...target.permissions, perm];

    // Optimistic update
    setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, permissions: nextPerms } : m));

    const payload = {
      canViewEvents: nextPerms.includes('view_events'),
      canEditEvents: nextPerms.includes('edit_events'),
      canManualCheckIn: nextPerms.includes('manual_checkin'),
    };

    try {
      await apiService.updateUserPermissions(memberId, payload);
    } catch (err) {
      // rollback on failure
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, permissions: target.permissions } : m));
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const displayName = inviteData.email.split('@')[0] || inviteData.email;
    const res = await fetch(`${API_BASE}/api/invite/create-and-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email: inviteData.email,
        role: UserRole.STAFF,
      })
    });
    if (!res.ok) {
      return;
    }
    const newMember: TeamMember = {
      id: Math.random().toString(36).substr(2, 9),
      name: displayName,
      email: inviteData.email,
      role: 'STAFF',
      perspective: UserRole.STAFF,
      status: 'Pending',
      permissions: inviteData.permissions
    };
    setTeamMembers(prev => [...prev, newMember]);
    setInviteData({ email: '', role: 'STAFF', perspective: UserRole.STAFF, permissions: ['view_events'] });
    setIsInviteModalOpen(false);
    setNotification({ message: 'Invitation sent successfully.', type: 'success' });
  };

  const handleSendPasswordReset = async (member: TeamMember) => {
    if (!member.id) return;
    setResetLoadingId(member.id);
    try {
      await apiService.sendPasswordReset(member.id);
      setNotification({ message: `Password reset email sent to ${member.email}.`, type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to send reset email.', type: 'error' });
    } finally {
      setResetLoadingId(null);
    }
  };

  const openSetPasswordModal = (member: TeamMember) => {
    setPasswordModalMember(member);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const closeSetPasswordModal = () => {
    setPasswordModalMember(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordLoading(false);
  };

  const handleSetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalMember?.id) return;
    setPasswordError('');
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordLoading(true);
    try {
      await apiService.setUserPassword(passwordModalMember.id, newPassword);
      setNotification({ message: `Password updated for ${passwordModalMember.email}.`, type: 'success' });
      closeSetPasswordModal();
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to set password.');
      setPasswordLoading(false);
    }
  };

  const handleRemoveStaff = async () => {
    if (!removeModalMember?.id) return;
    setRemoveLoading(true);
    try {
      await apiService.removeStaffUser(removeModalMember.id);
      setTeamMembers(prev => prev.filter(m => m.id !== removeModalMember.id));
      setNotification({ message: `${removeModalMember.email} was removed from the team.`, type: 'success' });
      setRemoveModalMember(null);
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to remove staff.', type: 'error' });
    } finally {
      setRemoveLoading(false);
    }
  };

  const PermissionShield: React.FC<{ active?: boolean, onClick?: () => void, disabled?: boolean }> = ({ active = false, onClick, disabled = false }) => (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${disabled
        ? 'text-[#2E2E2F]/40 bg-[#F2F2F2] cursor-not-allowed opacity-60'
        : active
          ? 'text-[#F2F2F2] bg-[#38BDF2]'
          : 'text-[#2E2E2F]/40 bg-[#F2F2F2] hover:bg-[#2E2E2F] hover:text-[#F2F2F2]'
        }`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    </button>
  );

  return (
    <div className="space-y-10 pb-20">
      {notification && (
        <div className="fixed top-24 right-8 z-[120]">
          <Card className={`flex items-center gap-4 px-6 py-4 rounded-2xl border ${notification.type === 'success' ? 'bg-[#38BDF2]/20 border-[#38BDF2]/40 text-[#2E2E2F]' : 'bg-[#2E2E2F]/10 border-[#2E2E2F]/30 text-[#2E2E2F]'
            }`}>
            <div className={`p-2 rounded-xl ${notification.type === 'success' ? 'bg-[#38BDF2]/10 text-[#2E2E2F]' : 'bg-[#2E2E2F]/20 text-[#2E2E2F]'}`}>
              {notification.type === 'success' ? <ICONS.CheckCircle className="w-5 h-5" /> : <ICONS.Layout className="w-5 h-5" />}
            </div>
            <p className="font-bold text-sm tracking-tight">{notification.message}</p>
            <button onClick={() => setNotification(null)} className="ml-4 text-[#2E2E2F]/60 hover:text-[#2E2E2F] text-lg font-black">&times;</button>
          </Card>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#2E2E2F] tracking-tighter">Settings</h1>
          <p className="text-[#2E2E2F]/70 font-medium text-sm mt-1 text-balance">Configure organizational parameters and visualize system architecture.</p>
        </div>
        <div className="flex bg-[#F2F2F2] p-1 rounded-2xl border border-[#2E2E2F]/10 self-start md:self-auto shrink-0">
          {[
            { id: 'team', label: 'Team' },
            { id: 'permission', label: 'Access Control' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`min-h-[32px] px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${activeTab === tab.id ? 'bg-[#38BDF2] text-[#F2F2F2]' : 'bg-[#F2F2F2] text-[#2E2E2F] hover:bg-[#2E2E2F] hover:text-[#F2F2F2]'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {activeTab === 'team' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em] mb-3 ml-1">Team Directory</label>
              <Button onClick={() => setIsInviteModalOpen(true)}>
                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                  <ICONS.Users className="w-3.5 h-3.5" />
                  Invite a Team Member
                </span>
              </Button>
            </div>
            <Card className="overflow-hidden border-[#2E2E2F]/10 rounded-[2.5rem] bg-[#F2F2F2]">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#F2F2F2] border-b border-[#2E2E2F]/10">
                    <tr>
                      <th className="px-10 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Name</th>
                      <th className="px-10 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Position</th>
                      <th className="px-10 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Password</th>
                      <th className="px-10 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E2E2F]/10">
                    {teamMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-[#38BDF2]/10 transition-colors group">
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-5">
                            <div className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center font-black text-lg ${member.isOwner ? 'bg-[#38BDF2] text-[#F2F2F2]' : 'bg-[#38BDF2] text-[#F2F2F2]'}`}>
                              {member.imageUrl ? (
                                <img src={member.imageUrl} alt={member.name} className="w-full h-full object-cover" />
                              ) : (
                                member.name.charAt(0)
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <div className="font-black text-[#2E2E2F] text-[15px] tracking-tight">{member.name}</div>
                                {member.isOwner && (
                                  <div className="bg-[#38BDF2] text-[#F2F2F2] text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest">owner</div>
                                )}
                              </div>
                              <div className="text-[12px] text-[#2E2E2F]/60 font-bold tracking-tight">{member.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="text-[13px] font-black text-[#2E2E2F] uppercase tracking-widest">{member.role}</div>
                          <div className="text-[10px] font-bold text-[#2E2E2F]/60 uppercase tracking-[0.2em] mt-1">{member.perspective} HUB</div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                              type="button"
                              disabled={resetLoadingId === member.id}
                              onClick={() => handleSendPasswordReset(member)}
                              className="min-h-[32px] px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#F2F2F2] border border-[#2E2E2F]/20 text-[#2E2E2F] hover:bg-[#38BDF2] hover:text-[#F2F2F2] transition-colors disabled:opacity-50"
                            >
                              {resetLoadingId === member.id ? 'Sending...' : 'Send reset email'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openSetPasswordModal(member)}
                              className="min-h-[32px] px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#38BDF2] text-[#F2F2F2] hover:bg-[#2E2E2F] transition-colors"
                            >
                              Set password
                            </button>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          {member.perspective === UserRole.STAFF ? (
                            <button
                              type="button"
                              onClick={() => setRemoveModalMember(member)}
                              className="min-h-[32px] px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#2E2E2F] text-[#F2F2F2] hover:bg-[#38BDF2] transition-colors"
                            >
                              Remove
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-[#2E2E2F]/40 uppercase tracking-widest">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'permission' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em] mb-3 ml-1">Access Control</label>
              <Badge type="info" className="font-black text-[9px] tracking-widest uppercase bg-[#38BDF2]/20 text-[#2E2E2F]">Manage Team Permissions</Badge>
            </div>
            <Card className="overflow-hidden border-[#2E2E2F]/10 rounded-[2.5rem] bg-[#F2F2F2]">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#F2F2F2] border-b border-[#2E2E2F]/10">
                    <tr>
                      <th className="px-10 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em]">Name</th>
                      <th className="px-6 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em] text-center">View Events</th>
                      <th className="px-6 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em] text-center">Edit Events</th>
                      <th className="px-6 py-6 text-[9px] font-black text-[#2E2E2F]/60 uppercase tracking-[0.2em] text-center">Manual Check-in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E2E2F]/10">
                    {teamMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-[#38BDF2]/10 transition-colors group">
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-5">
                            <div className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center font-black text-sm ${member.isOwner ? 'bg-[#38BDF2] text-[#F2F2F2]' : 'bg-[#38BDF2] text-[#2E2E2F]'}`}>
                              {member.imageUrl ? (
                                <img src={member.imageUrl} alt={member.name} className="w-full h-full object-cover" />
                              ) : (
                                member.name.charAt(0)
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <div className="font-black text-[#2E2E2F] text-[14px] tracking-tight">{member.name}</div>
                              </div>
                              <div className="text-[10px] text-[#2E2E2F]/60 font-black uppercase tracking-widest">{member.role}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-8">
                          <div className="flex justify-center">
                            <PermissionShield active={member.permissions.includes('view_events')} disabled={member.perspective === UserRole.ADMIN} onClick={() => toggleMemberPermission(member.id, 'view_events')} />
                          </div>
                        </td>
                        <td className="px-6 py-8">
                          <div className="flex justify-center">
                            <PermissionShield active={member.permissions.includes('edit_events')} disabled={member.perspective === UserRole.ADMIN} onClick={() => toggleMemberPermission(member.id, 'edit_events')} />
                          </div>
                        </td>
                        <td className="px-6 py-8">
                          <div className="flex justify-center">
                            <PermissionShield active={member.permissions.includes('manual_checkin')} disabled={member.perspective === UserRole.ADMIN} onClick={() => toggleMemberPermission(member.id, 'manual_checkin')} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

      </div>

      <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Invite Team Member" size="lg">
        <form onSubmit={handleInviteSubmit} className="space-y-10 px-2">
          <div className="space-y-6">
            <Input label="Work Email" type="email" placeholder="j.miller@startuplab.co" required className="w-full py-5 px-6 rounded-2xl bg-[#F2F2F2] border-[#2E2E2F]/20 text-base" value={inviteData.email} onChange={(e: any) => setInviteData({ ...inviteData, email: e.target.value })} />
            <Input label="Assigned Position" value="STAFF" disabled className="w-full py-5 px-6 rounded-2xl bg-[#F2F2F2] border-[#2E2E2F]/20 text-[#2E2E2F]/60 text-base" />
          </div>
          <div className="pt-8 flex flex-col sm:flex-row gap-4">
            <Button className="flex-1" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-[2]">Send Invite</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!passwordModalMember}
        onClose={closeSetPasswordModal}
        title={passwordModalMember ? `Set password for ${passwordModalMember.name || passwordModalMember.email}` : 'Set password'}
        size="lg"
      >
        <form onSubmit={handleSetPasswordSubmit} className="space-y-6 px-2">
          <Input
            label="New Password"
            type="password"
            required
            className="w-full py-5 px-6 rounded-2xl bg-[#F2F2F2] border-[#2E2E2F]/20 text-base"
            value={newPassword}
            onChange={(e: any) => setNewPassword(e.target.value)}
          />
          <Input
            label="Confirm Password"
            type="password"
            required
            className="w-full py-5 px-6 rounded-2xl bg-[#F2F2F2] border-[#2E2E2F]/20 text-base"
            value={confirmPassword}
            onChange={(e: any) => setConfirmPassword(e.target.value)}
          />
          {passwordError && <div className="text-[#2E2E2F] text-sm font-bold">{passwordError}</div>}
          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Button type="button" className="flex-1" onClick={closeSetPasswordModal}>Cancel</Button>
            <Button type="submit" className="flex-[2]" disabled={passwordLoading}>
              {passwordLoading ? 'Saving...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!removeModalMember}
        onClose={() => !removeLoading && setRemoveModalMember(null)}
        title="Remove staff member"
        size="lg"
      >
        <div className="space-y-6 px-2">
          <p className="text-[#2E2E2F]/80 font-medium text-sm leading-relaxed">
            Remove <span className="font-black">{removeModalMember?.name || removeModalMember?.email}</span>
            {removeModalMember?.email ? ` (${removeModalMember.email})` : ''} from the team?
            This deletes their account and they will not be able to log in.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Button type="button" className="flex-1" onClick={() => setRemoveModalMember(null)} disabled={removeLoading}>
              Cancel
            </Button>
            <Button type="button" className="flex-[2]" onClick={handleRemoveStaff} disabled={removeLoading}>
              {removeLoading ? 'Removing...' : 'Remove staff'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
