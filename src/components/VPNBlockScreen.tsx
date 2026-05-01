import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const VPNBlockScreen = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
        <ShieldOff className="w-10 h-10 text-destructive" />
      </div>
      <h1 className="text-2xl font-orbitron font-bold text-destructive mb-3">
        VPN Detected
      </h1>
      <p className="text-muted-foreground text-sm mb-4 max-w-xs">
        Bharat Cash does not allow VPN or proxy connections. Please disable your VPN and restart the app.
      </p>
      <Button 
        onClick={() => window.location.reload()} 
        variant="outline"
        className="border-destructive/50 text-destructive hover:bg-destructive/10"
      >
        Retry
      </Button>
    </div>
  );
};

export default VPNBlockScreen;
