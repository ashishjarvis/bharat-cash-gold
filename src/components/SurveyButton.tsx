// ─── SURVEY BUTTON — Dashboard shortcut to CPX Survey ──────────────────────
// Appears below TreasureChest on the home tab.
// Tapping it opens the CpxSurvey overlay. Disabled while survey is open.

import { ClipboardList, Coins, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SurveyButtonProps {
  onOpen: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export const SurveyButton = ({ onOpen, disabled = false, loading = false }: SurveyButtonProps) => {
  return (
    <div className="glass-card p-4 relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-purple-500/5 pointer-events-none" />

      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg">
          <ClipboardList className="w-6 h-6 text-white" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground">Complete a Survey</h3>
          <p className="text-xs text-muted-foreground">Earn 50 – 500 extra coins instantly</p>
          <div className="flex items-center gap-1 mt-1">
            <Coins className="w-3 h-3 text-accent" />
            <span className="text-[11px] font-medium text-accent">₹1 = 10 coins • Credited automatically</span>
          </div>
        </div>

        {/* CTA Button */}
        <Button
          onClick={onOpen}
          disabled={disabled || loading}
          size="sm"
          className="flex-shrink-0 bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:opacity-90 font-bold shadow-md disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="flex items-center gap-1">
              Start <ChevronRight className="w-3 h-3" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
};
