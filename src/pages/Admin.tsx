// ─── ADMIN PANEL (/ashish-admin-786) ───────────────────────────────────────
// Protected route — accessible ONLY to accounts whose userId passes /api/admin/check.
// Admin mobile: 9507124965 (hardcoded + is_admin DB flag, either grants access).
// Features: view all withdrawals, approve, reject with refund.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, RefreshCw, LogOut, Shield, Loader2, Users, IndianRupee, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { toast } from 'sonner';

interface WithdrawalRow {
  id: string;
  transaction_id: string | null;
  user_id: string;
  upi_id: string;
  coins_amount: number;
  rupees_amount: number;
  locked_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  user_name?: string;
  user_mobile?: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', icon: <Clock className="w-3 h-3" /> },
  approved:   { label: 'Approved',  color: 'text-green-400 bg-green-400/10 border-green-400/30',   icon: <CheckCircle className="w-3 h-3" /> },
  rejected:   { label: 'Rejected',  color: 'text-red-400 bg-red-400/10 border-red-400/30',         icon: <XCircle className="w-3 h-3" /> },
  processing: { label: 'Processing',color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',      icon: <Loader2 className="w-3 h-3 animate-spin" /> },
};

const Admin = () => {
  const { user, signOut } = useSimpleAuth();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin]           = useState<boolean | null>(null);
  const [withdrawals, setWithdrawals]   = useState<WithdrawalRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [actionId, setActionId]         = useState<string | null>(null);
  const [stats, setStats]               = useState({ total: 0, pending: 0, approved: 0, rejected: 0, totalRupees: 0 });
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Verify admin access via API (not Supabase direct — avoids RLS/flag issues) ──
  useEffect(() => {
    if (!user) { navigate('/auth'); return; }

    const checkAdmin = async () => {
      try {
        // Use the server-side check which honours BOTH is_admin flag AND hardcoded mobile
        const res  = await fetch(`/api/admin/check?userId=${user.id}`);
        const json = await res.json();

        if (!json.isAdmin) {
          toast.error('Access denied — admin account required');
          navigate('/');
          return;
        }
        setIsAdmin(true);
      } catch {
        toast.error('Could not verify admin access');
        navigate('/');
      }
    };

    checkAdmin();
  }, [user, navigate]);

  // ── Load withdrawals with user info ─────────────────────────
  const loadWithdrawals = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('withdrawals')
      .select(`*, profiles:user_id(display_name, mobile_number)`)
      .order('created_at', { ascending: false });

    if (error) { console.error('Admin load error:', error); setLoading(false); return; }

    const rows: WithdrawalRow[] = (data || []).map((w: any) => ({
      ...w,
      coins_amount:  Number(w.coins_amount),
      rupees_amount: Number(w.rupees_amount),
      locked_amount: Number(w.locked_amount || 0),
      user_name:     w.profiles?.display_name  || 'Unknown',
      user_mobile:   w.profiles?.mobile_number || 'N/A',
    }));

    setWithdrawals(rows);
    setStats({
      total:       rows.length,
      pending:     rows.filter(r => r.status === 'pending').length,
      approved:    rows.filter(r => r.status === 'approved').length,
      rejected:    rows.filter(r => r.status === 'rejected').length,
      totalRupees: rows.filter(r => r.status === 'approved').reduce((s, r) => s + r.rupees_amount, 0),
    });
    setLoading(false);
  }, [user]);

  // ── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    loadWithdrawals();

    realtimeRef.current = supabase
      .channel('admin-withdrawals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => {
        loadWithdrawals();
      })
      .subscribe();

    return () => {
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    };
  }, [isAdmin, loadWithdrawals]);

  // ── Approve withdrawal ───────────────────────────────────────
  const handleApprove = async (w: WithdrawalRow) => {
    if (actionId) return;
    setActionId(w.id);
    try {
      const res  = await fetch('/api/admin/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ withdrawalId: w.id, adminUserId: user!.id }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`✅ Approved ₹${w.rupees_amount} for ${w.user_name}`);
        loadWithdrawals();
      } else {
        toast.error('Approve failed: ' + json.error);
      }
    } catch { toast.error('Network error during approval'); }
    finally { setActionId(null); }
  };

  // ── Reject withdrawal (refund locked coins) ──────────────────
  const handleReject = async (w: WithdrawalRow, reason = 'Rejected by admin') => {
    if (actionId) return;
    setActionId(w.id);
    try {
      const res  = await fetch('/api/admin/reject', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ withdrawalId: w.id, adminUserId: user!.id, notes: reason }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`🔄 Rejected & refunded ₹${w.rupees_amount} to ${w.user_name}`);
        loadWithdrawals();
      } else {
        toast.error('Reject failed: ' + json.error);
      }
    } catch { toast.error('Network error during rejection'); }
    finally { setActionId(null); }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  // ── Loading / access check ───────────────────────────────────
  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-primary/20 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-bold text-lg gold-gradient-text">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">Bharat Cash Gold</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadWithdrawals} className="border-primary/30">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => { signOut(); navigate('/auth'); }} className="border-destructive/30 text-destructive">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total',    value: stats.total,                           color: 'text-primary' },
            { label: 'Pending',  value: stats.pending,                         color: 'text-yellow-400' },
            { label: 'Approved', value: stats.approved,                        color: 'text-green-400' },
            { label: 'Paid Out', value: `₹${stats.totalRupees.toFixed(2)}`,   color: 'text-accent' },
          ].map(s => (
            <div key={s.label} className="glass-card p-4 text-center">
              <p className={`text-2xl font-orbitron font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Withdrawals */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-primary">Withdrawal Requests</h2>
            <span className="ml-auto text-xs text-muted-foreground">Realtime • Auto-updating</span>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IndianRupee className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No withdrawal requests yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawals.map(w => {
                const st        = STATUS_LABEL[w.status] || STATUS_LABEL.pending;
                const isPending = w.status === 'pending';
                const isActing  = actionId === w.id;

                return (
                  <div key={w.id} className="rounded-xl border border-muted bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-foreground">{w.user_name}</span>
                          <span className="text-xs text-muted-foreground">{w.user_mobile}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${st.color}`}>
                            {st.icon} {st.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">UPI: <span className="text-foreground font-medium">{w.upi_id}</span></p>
                        <p className="text-sm text-muted-foreground">TxnID: <span className="text-foreground font-mono text-xs">{w.transaction_id || 'N/A'}</span></p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(w.created_at)}</p>
                        {w.notes && <p className="text-xs text-muted-foreground mt-1 italic">Note: {w.notes}</p>}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-orbitron font-bold text-accent">₹{w.rupees_amount.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{w.coins_amount} coins</p>

                        {isPending && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(w)}
                              disabled={!!actionId}
                              className="bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30 text-xs px-3"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" />Approve</>}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleReject(w)}
                              disabled={!!actionId}
                              className="bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 text-xs px-3"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><XCircle className="w-3 h-3 mr-1" />Reject</>}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <AlertCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            All approve/reject actions are atomic database transactions. Rejections automatically refund the locked coins to the user's balance.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Admin;
