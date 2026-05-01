import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OfflineScreenProps {
  onRetry: () => void;
}

const OfflineScreen = ({ onRetry }: OfflineScreenProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6 animate-pulse-gold">
        <WifiOff className="w-10 h-10 text-destructive" />
      </div>
      <h1 className="text-2xl font-orbitron font-bold gold-gradient-text mb-3">
        No Internet
      </h1>
      <p className="text-muted-foreground text-sm mb-8 max-w-xs">
        Please check your internet connection and try again.
      </p>
      <Button onClick={onRetry} className="gap-2 btn-gold-glow h-12 px-8">
        <RefreshCw className="w-5 h-5" />
        Retry
      </Button>
    </div>
  );
};

export default OfflineScreen;
