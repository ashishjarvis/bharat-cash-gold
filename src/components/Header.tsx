import { Coins, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import appLogo from '@/assets/logo.png';

interface HeaderProps {
  coins: number;
}

export const Header = ({ coins }: HeaderProps) => {
  const navigate = useNavigate();
  const { user } = useSimpleAuth();

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-primary/10">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img src={appLogo} alt="Bharat Cash Gold" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="font-orbitron font-bold text-lg gold-gradient-text leading-tight">
              BHARAT
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-1">CASH GOLD</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
            <Coins className="w-4 h-4 text-primary" />
            <span className="font-orbitron font-bold text-sm text-primary">
              {coins.toFixed(1)}
            </span>
          </div>
          
          {user && (
            <button
              onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 hover:bg-primary/30 transition-colors"
              title="My Profile"
            >
              <User className="w-4 h-4 text-primary" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
