/**
 * ActionHubResults — Ranked Contact Results Page
 * Shows scored contacts from the routing engine with profile side-sheet.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Zap, Building2, Globe, Network, ChevronDown, ChevronUp,
  Mail, Phone, MessageSquare, ArrowLeft, Shield, Users, ArrowUpCircle,
  Info, CheckCircle2, X, User, Home, Send
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getAuthSession, fetchWithAuth } from '../lib/authSession';

interface RouteContact {
  id: string; fullName: string; email: string; photo: string;
  phones: { number: string; type: string }[];
  roleName: string; roleScope: string; roleDescription: string;
  hierarchyLevel: number; hierarchyTitle: string; reportsToRoleId: string;
  corporateNodeIds: string[]; score: number; reasons: string[];
}

const scopeColors: Record<string, string> = {
  Global:     'bg-emerald-50 border-emerald-200 text-emerald-700',
  Enterprise: 'bg-violet-50 border-violet-200 text-violet-700',
  Site:       'bg-blue-50 border-blue-200 text-blue-700',
};
const scopeIcons: Record<string, any> = { Global: Globe, Enterprise: Network, Site: Building2 };

function ScopeBadge({ scope }: { scope: string }) {
  const cls = scopeColors[scope] || 'bg-slate-50 border-slate-200 text-slate-600';
  const Ico = scopeIcons[scope] || Shield;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border', cls)}>
      <Ico className="w-2.5 h-2.5" />{scope}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color = pct >= 60 ? 'bg-emerald-500' : pct >= 35 ? 'bg-amber-400' : 'bg-slate-300';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">{score}</span>
    </div>
  );
}

function ContactProfileDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`/api/arh/profile/${userId}`)
      .then(r => r.json())
      .then(d => { setProfile(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md z-[70] flex flex-col bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-[#2960DC] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Loading profile...</p>
            </div>
          </div>
        ) : !profile ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 p-8 text-center">
            <p>Profile not found.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="relative bg-gradient-to-br from-[#2960DC] to-[#1a3fa0] p-6 shrink-0">
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -mr-8 -mt-8 blur-2xl" />
              <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-4 h-4" /></button>
              <div className="flex items-center gap-4">
                {profile.photo
                  ? <img src={profile.photo} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/30 shadow-xl" alt={profile.full_name} />
                  : (
                    <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/20 flex items-center justify-center shadow-xl">
                      <span className="text-2xl font-extrabold text-white">{profile.full_name?.charAt(0) || '?'}</span>
                    </div>
                  )
                }
                <div>
                  <h2 className="text-xl font-extrabold text-white leading-snug">{profile.full_name}</h2>
                  <p className="text-blue-100 text-sm mt-0.5">{profile.role_name}</p>
                  <div className="mt-2"><ScopeBadge scope={profile.role_scope} /></div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Role Description */}
              {profile.role_description && (
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Role</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{profile.role_description}</p>
                </div>
              )}

              {/* Hierarchy + Dual Reporting Lines */}
              {(profile.reportingLines?.length > 0 || profile.directReports?.length > 0) && (
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Reporting Structure</p>

                  {/* Reports TO (both lines) */}
                  {profile.reportingLines?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Reports To</p>
                      <div className="space-y-1.5">
                        {profile.reportingLines.map((line: any) => (
                          <div key={line.id} className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm",
                            line.reporting_type === 'Functional'
                              ? "bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800"
                              : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
                          )}>
                            <span className={cn(
                              "text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0",
                              line.reporting_type === 'Functional'
                                ? "bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200"
                                : "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200"
                            )}>
                              {line.reporting_type === 'Functional' ? '⬡ Functional' : '◆ Operational'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{line.reports_to_name}</p>
                              {line.description && <p className="text-[10px] text-slate-400">{line.description}</p>}
                            </div>
                            <ScopeBadge scope={line.reports_to_scope} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Direct reports (grouped by line type) */}
                  {profile.directReports?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Direct Reports</p>
                      <div className="space-y-1">
                        {['Operational','Functional'].map(type => {
                          const reps = profile.directReports.filter((r: any) => r.reporting_type === type);
                          if (!reps.length) return null;
                          return (
                            <div key={type}>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600 mb-1 ml-1">{type}</p>
                              {reps.map((dr: any) => (
                                <div key={dr.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 ml-3 py-1">
                                  <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
                                  <span className="truncate">{dr.name}</span>
                                  <ScopeBadge scope={dr.scope} />
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Contact Methods */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Contact</p>
                <div className="space-y-2">
                  {profile.email && (
                    <a href={`mailto:${profile.email}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-sm text-slate-700 dark:text-slate-300 font-medium">
                      <Mail className="w-4 h-4 text-slate-400" />
                      {profile.email}
                    </a>
                  )}
                  {(profile.phones || []).slice(0, 2).map((p: any, i: number) => (
                    <a key={i} href={`tel:${p.number}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:border-emerald-300 transition-all text-sm text-slate-700 dark:text-slate-300 font-medium">
                      <Phone className="w-4 h-4 text-emerald-500" />
                      <span className="font-mono">{p.number}</span>
                      <span className="text-[10px] text-slate-400 ml-auto bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{p.type}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function ConversationModal({ contact, context, onClose }: { contact: RouteContact; context: any; onClose: () => void }) {
  const session = getAuthSession();
  const navigate = useNavigate();
  const [subject, setSubject] = useState(
    context?.category ? `${context.category.name}: ${contact.roleName}` : `Question for ${contact.roleName}`
  );
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!subject.trim() || !message.trim() || !session) return;
    setSending(true);
    try {
      const thread = await fetchWithAuth('/api/arh/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: session.userId,
          contactUserId: contact.id,
          subject: subject.trim(),
          actionCategoryId: context?.body?.actionCategoryId || null,
          siteId: context?.body?.siteId || null,
          moduleId: context?.body?.moduleId || null,
          initialMessage: message.trim(),
        })
      }).then(r => r.json());
      setSent(true);
      setTimeout(() => navigate(`/action-hub/conversations?thread=${thread.id}`), 1200);
    } finally { setSending(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[90] p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md animate-in zoom-in-95 duration-200">
          {sent ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-bold text-slate-800 dark:text-slate-100">Conversation started!</p>
              <p className="text-sm text-slate-500 mt-1">Redirecting to your inbox…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#2960DC] to-[#1a3fa0] flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900 dark:text-white text-sm">Start Conversation</p>
                  <p className="text-[10px] text-slate-500">with {contact.fullName}</p>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Subject</label>
                  <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Message</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)}
                    placeholder="Describe your question or request…" rows={4}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC] resize-none"
                  />
                </div>
                <button onClick={send} disabled={!subject.trim() || !message.trim() || sending}
                  className="w-full py-3 bg-gradient-to-r from-[#2960DC] to-[#1a3fa0] text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm">
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                  Send & Open Conversation
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function ActionHubResults() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: any };
  const results: RouteContact[] = state?.results || [];
  const context = state?.context;
  const [expandedReasons, setExpandedReasons] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [convoContact, setConvoContact] = useState<RouteContact | null>(null);

  const session = getAuthSession();

  const scopeFilter = ['All', 'Global', 'Enterprise', 'Site'];
  const [activeScope, setActiveScope] = useState('All');

  const filtered = results.filter(r => activeScope === 'All' || r.roleScope === activeScope);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {profileUserId && <ContactProfileDrawer userId={profileUserId} onClose={() => setProfileUserId(null)} />}
      {convoContact && <ConversationModal contact={convoContact} context={context} onClose={() => setConvoContact(null)} />}

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center gap-4 shadow-sm sticky top-0 z-50">
        <button onClick={() => navigate('/action-hub')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2960DC] to-[#1a3fa0] flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-extrabold text-slate-900 dark:text-white">Routing Results</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {results.length} contact{results.length !== 1 ? 's' : ''} matched
            {context?.selectedSiteTitle ? ` · ${context.selectedSiteTitle}` : ''}
            {context?.selectedModule ? ` · ${context.selectedModule.title}` : ''}
            {context?.category ? ` · ${context.category.name}` : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => navigate('/action-hub/conversations')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-[#2960DC] hover:text-[#2960DC] text-xs font-semibold transition-all">
            <MessageSquare className="w-3.5 h-3.5" /> Inbox
          </button>
          <button onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-[#2960DC] hover:text-[#2960DC] text-xs font-semibold transition-all">
            <Home className="w-3.5 h-3.5" /> Master Portal
          </button>
          <button onClick={() => navigate('/action-hub', { state: { prefill: context?.body } })}
            className="px-4 py-1.5 bg-[#2960DC] text-white text-xs font-bold rounded-lg hover:bg-[#1a4bb3] transition-colors">
            Refine Search
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 flex gap-6">
        {/* Sidebar Filters */}
        <aside className="w-48 shrink-0 hidden lg:block">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Scope</p>
            <div className="space-y-1">
              {scopeFilter.map(s => (
                <button key={s} onClick={() => setActiveScope(s)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    activeScope === s ? 'bg-[#2960DC] text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  )}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-semibold text-lg">No contacts found</p>
              <p className="text-sm mt-1">Try broadening your context or removing a filter.</p>
              <button onClick={() => navigate('/action-hub')} className="mt-6 px-5 py-2.5 bg-[#2960DC] text-white font-bold rounded-xl text-sm">
                New Search
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((contact, idx) => {
                const initials = contact.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const isExpanded = expandedReasons === contact.id;
                return (
                  <div key={contact.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 hover:border-[#2960DC] dark:hover:border-[#4F84F6] hover:shadow-md transition-all">
                    <div className="flex items-start gap-4">
                      {/* Rank */}
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-1">
                        {idx + 1}
                      </div>

                      {/* Avatar */}
                      {contact.photo
                        ? <img src={contact.photo} className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0" alt={contact.fullName} />
                        : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2960DC] to-[#1a3fa0] flex items-center justify-center shrink-0 shadow-sm">
                            <span className="text-sm font-extrabold text-white">{initials}</span>
                          </div>
                        )
                      }

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900 dark:text-white">{contact.fullName}</p>
                          <ScopeBadge scope={contact.roleScope} />
                          {contact.hierarchyLevel < 5 && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              L{contact.hierarchyLevel} Authority
                            </span>
                          )}
                          {contact.reportingTypes?.includes('Operational') && (
                            <span className="text-[9px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              ◆ Operational Line
                            </span>
                          )}
                          {contact.reportingTypes?.includes('Functional') && (
                            <span className="text-[9px] font-extrabold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              ⬡ Functional Line
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{contact.roleName}</p>
                        <div className="mt-2">
                          <ScoreBar score={contact.score} />
                        </div>

                        {/* Why suggested */}
                        <button
                          onClick={() => setExpandedReasons(isExpanded ? null : contact.id)}
                          className="flex items-center gap-1.5 mt-2 text-xs text-[#2960DC] dark:text-[#4F84F6] font-semibold hover:underline"
                        >
                          <Info className="w-3.5 h-3.5" />
                          Why suggested?
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 space-y-1">
                            {contact.reasons.map((r, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                {r}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 shrink-0">
                        {/* Primary: Start Conversation */}
                        <button
                          onClick={() => setConvoContact(contact)}
                          className="px-4 py-2 bg-[#2960DC] text-white text-xs font-bold rounded-lg hover:bg-[#1a4bb3] transition-colors shadow-sm flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Converse
                        </button>
                        {/* Secondary: View Profile */}
                        <button
                          onClick={() => setProfileUserId(contact.id)}
                          className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          Profile
                        </button>
                        {/* External contact links */}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} target="_blank" rel="noopener noreferrer"
                            className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" /> Email
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
