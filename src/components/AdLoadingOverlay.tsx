// Real Unity Ads opens a native full-screen ad on Android.
// This overlay shows ONLY while the SDK is loading/preparing — not a fake ad player.
import { Loader2 } from 'lucide-react';

interface AdLoadingOverlayProps {
  isVisible: boolean;
}

export const AdLoadingOverlay = ({ isVisible }: AdLoadingOverlayProps) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
        <p className="text-primary font-bold text-lg">Loading Ad...</p>
        <p className="text-muted-foreground text-sm mt-1">Please wait</p>
      </div>
    </div>
  );
};
