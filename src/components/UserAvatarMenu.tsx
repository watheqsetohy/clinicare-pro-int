import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Key, ChevronDown, Shield, Building2, X, Save, Eye, EyeOff, Check, Camera, Phone, Plus } from 'lucide-react';
import { AuthSession, clearAuthSession } from '../lib/authSession';
import { getMyProfile, updateUser as apiUpdateUser, changePassword, mockHashPassword, UserProfile } from '../lib/userStorage';
import { getRoles } from '../lib/roleStorage';
import { getCorporateTree, CorporateNode } from '../lib/corporateStorage';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/src/lib/utils';

interface UserAvatarMenuProps {
  session: AuthSession;
  /** Use on dark/coloured header backgrounds — flips button colours to white */
  dark?: boolean;
  /** Open the dropdown upward (for bottom-anchored buttons) */
  dropUp?: boolean;
  /** Align dropdown to left or right edge of the button. Default: 'right' */
  dropdownAlign?: 'left' | 'right';
  /** Show only the avatar circle — no text, no chevron (collapsed sidebar mode) */
  compact?: boolean;
}

export function UserAvatarMenu({ session, dark = false, dropUp = false, dropdownAlign = 'right', compact = false }: UserAvatarMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [role, setRole] = useState<{ id: string; name: string; scope: string } | undefined>(undefined);
  const [facilities, setFacilities] = useState<CorporateNode[]>([]);

  useEffect(() => {
    const load = async () => {
      const [u, roles, tree] = await Promise.all([getMyProfile().catch(() => undefined), getRoles(), getCorporateTree()]);
      const r = roles.find(r => r.id === session.roleId);
      setUser(u);
      setRole(r);
      // Flatten tree
      const allNodes: CorporateNode[] = [];
      const flatten = (nodes: CorporateNode[]) => { for (const n of nodes) { allNodes.push(n); if (n.children) flatten(n.children); } };
      flatten(tree);
      setFacilities(allNodes.filter(n => (n.facilityCode || n.type === 'Facility') && session.corporateNodeIds.includes(n.id)));
    };
    load().catch(console.error);
  }, [session.userId, refreshCounter]);

  // Initials
  const initials = session.fullName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = () => {
    clearAuthSession();
    navigate('/login', { replace: true });
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar Button */}
      {compact ? (
        /* Compact mode: circle avatar only */
        <button
          onClick={() => setOpen(o => !o)}
          title={session.fullName}
          className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#2960DC] to-[#1a3fa8] text-white flex items-center justify-center font-bold text-sm border-2 border-white/20 hover:border-white/50 transition-all shadow-md"
        >
          {user?.photo
            ? <img src={user.photo} alt="avatar" className="w-full h-full object-cover" />
            : initials
          }
        </button>
      ) : (
        /* Full mode: avatar + name + role + chevron */
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            "flex items-center gap-2.5 p-1.5 pr-3 rounded-full border transition-all shadow-sm",
            dark
              ? "border-white/20 bg-white/10 hover:bg-white/20"
              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
          )}
        >
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-[#2960DC] to-[#1a3fa8] text-white flex items-center justify-center font-bold text-sm">
            {user?.photo
              ? <img src={user.photo} alt="avatar" className="w-full h-full object-cover" />
              : initials
            }
          </div>
          <div className="text-right hidden sm:block">
            <p className={cn("text-xs font-bold leading-tight", dark ? "text-white" : "text-slate-800 dark:text-slate-200")}>{session.fullName}</p>
            <p className={cn("text-[10px] font-semibold leading-tight", dark ? "text-white/70" : "text-[#2960DC]")}>{role?.name || session.roleId}</p>
          </div>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", dark ? "text-white/60" : "text-slate-400", open ? 'rotate-180' : '')} />
        </button>
      )}

      {/* Dropdown Menu */}
      {open && (
        <div className={cn(
          "absolute z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-64 overflow-hidden animate-in fade-in zoom-in-95 duration-150",
          dropUp ? "bottom-full mb-2" : "top-full mt-2",
          dropdownAlign === 'left' ? "left-0" : "right-0"
        )}>
          {/* User Info Header */}
          <div className="p-4 bg-gradient-to-br from-[#2960DC]/8 to-slate-50 dark:from-[#2960DC]/15 dark:to-slate-800 border-b border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#2960DC] to-[#1a3fa8] text-white flex items-center justify-center font-bold shrink-0">
                {user?.photo
                  ? <img src={user.photo} alt="avatar" className="w-full h-full object-cover" />
                  : initials
                }
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{session.fullName}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">@{session.loginId}</p>
                <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold text-[#2960DC] uppercase tracking-wider">
                  <Shield className="w-2.5 h-2.5" />{role?.name}
                </span>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-2">
            <button
              onClick={() => { setOpen(false); setShowProfile(true); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-left"
            >
              <User className="w-4 h-4 text-slate-500" />
              View Profile
            </button>
            <button
              onClick={() => { setOpen(false); setShowChangePwd(true); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-left"
            >
              <Key className="w-4 h-4 text-slate-500" />
              Change Password
            </button>
            <div className="my-1.5 border-t border-slate-100 dark:border-slate-700/50" />
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && user && (
        <UserProfileModal
          user={user}
          role={role}
          facilities={facilities}
          onClose={() => setShowProfile(false)}
          onSaved={() => setRefreshCounter(c => c + 1)}
        />
      )}

      {/* Change Password Modal (voluntary) */}
      {showChangePwd && user && (
        <ChangePasswordPanelModal
          userId={user.id}
          onClose={() => setShowChangePwd(false)}
        />
      )}
    </div>
  );
}

// ---- User Profile Table Modal ----
interface ProfileModalProps {
  user: UserProfile;
  role: { name: string; scope: string } | undefined;
  facilities: CorporateNode[];
  onClose: () => void;
  onSaved?: () => void;
}

function UserProfileModal({ user, role, facilities, onClose, onSaved }: ProfileModalProps) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email || '');
  const [phones, setPhones] = useState<string[]>(user.phones?.length ? user.phones : ['']);
  const [photo, setPhoto] = useState<string>(user.photo || '');
  const [saved, setSaved] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const initials = user.fullName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  // ---- Save ----
  const handleSave = async () => {
    const cleanPhones = phones.filter(p => p.trim() !== '');
    await apiUpdateUser({ ...user, fullName, email, phones: cleanPhones, photo });
    setSaved(true);
    onSaved?.(); // notify parent to re-fetch user data
    setTimeout(() => { setSaved(false); setEditing(false); }, 1500);
  };

  const handleCancel = () => {
    setEditing(false);
    setFullName(user.fullName);
    setEmail(user.email || '');
    setPhones(user.phones?.length ? user.phones : ['']);
    setPhoto(user.photo || '');
  };

  // ---- Photo Upload ----
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ---- Phone management ----
  const addPhone = () => setPhones(p => [...p, '']);
  const removePhone = (idx: number) => setPhones(p => p.filter((_, i) => i !== idx));
  const updatePhone = (idx: number, val: string) =>
    setPhones(p => p.map((v, i) => (i === idx ? val : v)));

  // ---- Badge colours helper ----
  const badge = (color: 'emerald' | 'red' | 'amber') =>
    ({ emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
       red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
       amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }[color]);

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#2960DC] focus:ring-2 focus:ring-[#2960DC]/20 transition-all';
  const labelCls = 'text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-40 align-top pt-3.5 pr-4';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

        {/* ---- Header with Photo Avatar ---- */}
        <div className="bg-gradient-to-r from-[#2960DC] to-[#1a3fa8] p-7 text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Clickable Photo Avatar */}
            <div className="relative group">
              <div
                onClick={() => editing && photoInputRef.current?.click()}
                className={cn(
                  'w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-bold bg-white/20 border-2 border-white/30 transition-all',
                  editing && 'cursor-pointer group-hover:brightness-75'
                )}
              >
                {photo
                  ? <img src={photo} alt="Profile" className="w-full h-full object-cover" />
                  : <span>{initials}</span>
                }
              </div>
              {editing && (
                <div
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                >
                  <Camera className="w-5 h-5 text-white" />
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
            <div>
              <h2 className="text-xl font-bold">{user.fullName}</h2>
              <p className="text-blue-200 text-sm">@{user.loginId} · {role?.name}</p>
              {editing && (
                <p className="text-blue-200/70 text-[11px] mt-1">Click avatar to change photo</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition-colors self-start"><X className="w-5 h-5" /></button>
        </div>

        {/* ---- Profile Body ---- */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {/* Edit / Save controls */}
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Profile Details</h3>
            {!editing
              ? <button onClick={() => setEditing(true)} className="text-xs text-[#2960DC] font-bold hover:underline">Edit Profile</button>
              : <div className="flex gap-2">
                  <button onClick={handleCancel} className="text-xs text-slate-500 hover:underline font-medium">Cancel</button>
                  <button onClick={handleSave}
                    className="flex items-center gap-1 text-xs bg-[#2960DC] text-white px-3 py-1.5 rounded-lg font-bold hover:bg-[#1a3fa8] transition-colors">
                    {saved ? <><Check className="w-3 h-3" />Saved!</> : <><Save className="w-3 h-3" />Save Changes</>}
                  </button>
                </div>
            }
          </div>

          <table className="w-full">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">

              {/* Full Name */}
              <tr>
                <td className={labelCls}>Full Name</td>
                <td className="py-3">
                  {editing
                    ? <input value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} placeholder="Full name" />
                    : <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{fullName}</span>
                  }
                </td>
              </tr>

              {/* Email */}
              <tr>
                <td className={labelCls}>Email Address</td>
                <td className="py-3">
                  {editing
                    ? <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="user@example.com" type="email" />
                    : <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{email || <span className="text-slate-400 italic">— Not set</span>}</span>
                  }
                </td>
              </tr>

              {/* Phone Numbers */}
              <tr>
                <td className={labelCls}>Phone Numbers</td>
                <td className="py-3">
                  {editing ? (
                    <div className="space-y-2">
                      {phones.map((ph, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <input
                              value={ph}
                              onChange={e => updatePhone(idx, e.target.value)}
                              className={`${inputCls} pl-9`}
                              placeholder={`Phone ${idx + 1}`}
                              type="tel"
                            />
                          </div>
                          {phones.length > 1 && (
                            <button type="button" onClick={() => removePhone(idx)}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={addPhone}
                        className="flex items-center gap-1.5 text-xs text-[#2960DC] font-bold hover:underline mt-1">
                        <Plus className="w-3.5 h-3.5" /> Add Phone Number
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {phones.filter(p => p.trim()).length > 0
                        ? phones.filter(p => p.trim()).map((ph, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium font-mono">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />{ph}
                            </div>
                          ))
                        : <span className="text-slate-400 italic text-sm">— Not set</span>
                      }
                    </div>
                  )}
                </td>
              </tr>

              {/* Username — never editable */}
              <tr>
                <td className={labelCls}>Username / Login ID</td>
                <td className="py-3"><span className="text-sm text-slate-700 dark:text-slate-300 font-mono">{user.loginId}</span></td>
              </tr>

              {/* Status */}
              <tr>
                <td className={labelCls}>Account Status</td>
                <td className="py-3">
                  <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold', badge(user.status === 'Active' ? 'emerald' : 'red'))}>
                    {user.status}
                  </span>
                </td>
              </tr>

              {/* Role */}
              <tr>
                <td className={labelCls}>Assigned Role</td>
                <td className="py-3"><span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{role?.name || '—'}</span></td>
              </tr>

              {/* Role Scope */}
              <tr>
                <td className={labelCls}>Role Scope</td>
                <td className="py-3"><span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{role?.scope || '—'}</span></td>
              </tr>

              {/* Authorized Facilities */}
              <tr>
                <td className={labelCls}>Authorized Facilities</td>
                <td className="py-3">
                  {facilities.length > 0
                    ? <div className="flex flex-wrap gap-1.5">
                        {facilities.map(f => (
                          <span key={f.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800">
                            <Building2 className="w-2.5 h-2.5" />{f.title}
                            {f.facilityCode && <span className="font-mono opacity-60 text-[10px]">{f.facilityCode}</span>}
                          </span>
                        ))}
                      </div>
                    : <span className="text-slate-400 italic text-sm">— None assigned</span>
                  }
                </td>
              </tr>

              {/* Clinical Tags */}
              <tr>
                <td className={labelCls}>Clinical Tags</td>
                <td className="py-3">
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    {user.lexiconTags?.length ? user.lexiconTags.join(', ') : <span className="text-slate-400 italic">— None</span>}
                  </span>
                </td>
              </tr>

              {/* Temp Password flag */}
              <tr>
                <td className={labelCls}>Temp Password</td>
                <td className="py-3">
                  <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold', user.isTempPassword ? badge('amber') : 'text-slate-500')}>
                    {user.isTempPassword ? 'Yes — Change required' : 'No'}
                  </span>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- Voluntary Change Password Panel ----
function ChangePasswordPanelModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const rules = [
    { label: 'At least 8 characters', ok: newPwd.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(newPwd) },
    { label: 'Contains number', ok: /[0-9]/.test(newPwd) },
    { label: 'Passwords match', ok: newPwd.length > 0 && newPwd === confirm },
  ];
  const allOk = rules.every(r => r.ok);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await getMyProfile().catch(() => undefined);
    if (!user) return;
    if (user.passwordHash !== mockHashPassword(current)) {
      setError('Current password is incorrect.');
      return;
    }
    if (!allOk) { setError('Please meet all requirements.'); return; }
    setError(null);
    await changePassword(userId, newPwd);
    setSaved(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center"><Key className="w-4 h-4" /></div>
            <div>
              <h2 className="text-lg font-bold">Change Password</h2>
              <p className="text-slate-300 text-xs">Update your account security</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">
          {saved ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="w-6 h-6 text-emerald-600" /></div>
              <p className="font-bold text-slate-800 dark:text-slate-200">Password Changed!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-medium">{error}</div>}
              {[
                { label: 'Current Password', val: current, set: setCurrent, show: showCurrent, toggle: setShowCurrent },
                { label: 'New Password', val: newPwd, set: setNewPwd, show: showNew, toggle: setShowNew },
                { label: 'Confirm New Password', val: confirm, set: setConfirm, show: showNew, toggle: setShowNew },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{f.label}</label>
                  <div className="relative">
                    <input type={f.show ? 'text' : 'password'} value={f.val} onChange={e => f.set(e.target.value)}
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-[#2960DC] focus:ring-2 focus:ring-[#2960DC]/20 transition-all" />
                    <button type="button" onClick={() => f.toggle(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {f.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-1.5">
                {rules.map(r => (
                  <div key={r.label} className={`flex items-center gap-1.5 text-xs font-medium ${r.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <div className={`w-3 h-3 rounded-full flex items-center justify-center ${r.ok ? 'bg-emerald-100' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      {r.ok && <Check className="w-1.5 h-1.5 text-emerald-600" />}
                    </div>
                    {r.label}
                  </div>
                ))}
              </div>
              <button type="submit" disabled={!allOk}
                className="w-full py-3 bg-[#2960DC] text-white font-bold rounded-xl hover:bg-[#1a3fa8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm">
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
