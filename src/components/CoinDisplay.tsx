import { Coins } from 'lucide-react';

interface CoinDisplayProps {
  coins: number;
  rupees: string;
  showRupees?: boolean;
}

export const CoinDisplay = ({ coins, rupees, showRupees = true }: CoinDisplayProps) => {
  return (
    <div className="glass-card p-6 text-center">
      <div className="flex items-center justify-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-full coin-shine flex items-center justify-center animate-float">
          <Coins className="w-6 h-6 text-primary-foreground" />
        </div>
        <div className="text-left">
          <p className="text-muted-foreground text-sm font-medium">Total Coins</p>
          <p className="text-3xl font-orbitron font-bold gold-gradient-text">
            {coins.toFixed(1)}
          </p>
        </div>
      </div>
      
      {showRupees && (
        <div className="mt-4 pt-4 border-t border-primary/20">
          <p className="text-muted-foreground text-sm">Earnings</p>
          <p className="text-2xl font-orbitron font-bold text-accent">
            ₹{rupees}
          </p>
        </div>
      )}
    </div>
  );
};
