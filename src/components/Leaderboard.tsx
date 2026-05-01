import { useState, useEffect } from 'react';
import { Trophy, Medal, Award, Crown, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';

interface LeaderboardUser {
  rank: number;
  name: string;
  coins: number;
  avatar: string;
}

interface LeaderboardProps {
  currentUserCoins: number;
}

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Crown className="w-6 h-6 text-primary" />;
    case 2:
      return <Medal className="w-6 h-6 text-muted-foreground" />;
    case 3:
      return <Award className="w-6 h-6 text-primary/70" />;
    default:
      return <span className="w-6 h-6 flex items-center justify-center text-muted-foreground font-bold">{rank}</span>;
  }
};

const getRankStyle = (rank: number) => {
  switch (rank) {
    case 1:
      return 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/50 gold-glow';
    case 2:
      return 'bg-gradient-to-r from-muted/30 to-muted/20 border-muted-foreground/30';
    case 3:
      return 'bg-gradient-to-r from-primary/10 to-muted/20 border-primary/30';
    default:
      return 'bg-muted/20 border-muted/30';
  }
};

const getAvatarEmoji = (rank: number) => {
  const emojis = ['👑', '🥈', '🥉', '⭐', '💫', '✨', '🌟', '💎', '🔥', '⚡'];
  return emojis[rank - 1] || '🏆';
};

export const Leaderboard = ({ currentUserCoins }: LeaderboardProps) => {
  const { user } = useSimpleAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [userRank, setUserRank] = useState(0);

  const fetchLeaderboard = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, total_coins')
      .order('total_coins', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return;
    }

    const formattedData: LeaderboardUser[] = (data || []).map((profile, index) => ({
      rank: index + 1,
      name: profile.display_name || 'Anonymous',
      coins: Number(profile.total_coins) || 0,
      avatar: getAvatarEmoji(index + 1),
    }));

    setLeaderboard(formattedData);
    setLastUpdate(new Date());

    // Calculate user rank
    if (user) {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt('total_coins', currentUserCoins);
      
      setUserRank((count || 0) + 1);
    }
  };

  useEffect(() => {
    fetchLeaderboard();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('leaderboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchLeaderboard();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserCoins, user]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLeaderboard();
    setIsRefreshing(false);
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center gold-glow">
            <Trophy className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-xl gold-gradient-text">Leaderboard</h2>
            <p className="text-xs text-muted-foreground">Top 10 Earners</p>
          </div>
        </div>
        
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-muted/30 text-muted-foreground hover:text-primary transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Last update time */}
      <p className="text-xs text-muted-foreground mb-4">
        Last updated: {lastUpdate.toLocaleTimeString()}
      </p>

      {/* User's rank */}
      <div className="mb-6 p-4 rounded-xl bg-secondary/10 border border-secondary/30">
        <p className="text-sm text-muted-foreground mb-1">Your Current Rank</p>
        <div className="flex items-center justify-between">
          <span className="text-3xl font-orbitron font-bold text-secondary">#{userRank || '-'}</span>
          <div className="text-right">
            <span className="text-lg font-orbitron text-primary">{currentUserCoins.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground ml-1">Coins</span>
          </div>
        </div>
      </div>

      {/* Leaderboard list */}
      <div className="space-y-2">
        {leaderboard.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No users yet. Be the first to earn!
          </p>
        ) : (
          leaderboard.map(leaderboardUser => (
            <div 
              key={leaderboardUser.rank}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:scale-[1.02] ${getRankStyle(leaderboardUser.rank)}`}
            >
              {/* Rank */}
              <div className="w-8 flex justify-center">
                {getRankIcon(leaderboardUser.rank)}
              </div>

              {/* Avatar */}
              <span className="text-2xl">{leaderboardUser.avatar}</span>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${leaderboardUser.rank <= 3 ? 'text-primary' : 'text-foreground'}`}>
                  {leaderboardUser.name}
                </p>
              </div>

              {/* Coins */}
              <div className="text-right">
                <p className="font-orbitron font-bold text-primary">
                  {leaderboardUser.coins.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">Coins</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
