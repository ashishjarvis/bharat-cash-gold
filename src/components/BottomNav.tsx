import { Home, Trophy, Wallet, Gift } from 'lucide-react';

type Tab = 'home' | 'leaderboard' | 'wallet' | 'tasks';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const tabs = [
    { id: 'home' as Tab, icon: Home, label: 'Home' },
    { id: 'tasks' as Tab, icon: Gift, label: 'Tasks' },
    { id: 'leaderboard' as Tab, icon: Trophy, label: 'Rank' },
    { id: 'wallet' as Tab, icon: Wallet, label: 'Wallet' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-primary/20 z-50">
      <div className="max-w-md mx-auto flex justify-around py-2">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                isActive 
                  ? 'text-primary bg-primary/10' 
                  : 'text-muted-foreground hover:text-primary'
              }`}
            >
              <Icon className={`w-6 h-6 ${isActive ? 'animate-pulse-gold' : ''}`} />
              <span className={`text-xs font-medium ${isActive ? 'font-bold' : ''}`}>
                {tab.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
