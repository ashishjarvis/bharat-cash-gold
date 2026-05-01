import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface AntiSpamResult {
  isBlocked: boolean;
  checkClick: () => boolean;
  warningCount: number;
  resetWarnings: () => void;
}

const MAX_CLICKS_PER_SECOND = 2;
const WARNING_THRESHOLD = 3;
const BLOCK_DURATION = 5000; // 5 seconds

export const useAntiSpam = (): AntiSpamResult => {
  const [isBlocked, setIsBlocked] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const clickTimestamps = useRef<number[]>([]);

  const checkClick = useCallback((): boolean => {
    if (isBlocked) {
      toast.error('🚫 Action blocked! Wait a moment.', {
        description: 'Too many clicks detected.',
      });
      return false;
    }

    const now = Date.now();
    
    // Remove timestamps older than 1 second
    clickTimestamps.current = clickTimestamps.current.filter(
      timestamp => now - timestamp < 1000
    );
    
    // Add current timestamp
    clickTimestamps.current.push(now);
    
    // Check if clicking too fast
    if (clickTimestamps.current.length > MAX_CLICKS_PER_SECOND) {
      setWarningCount(prev => prev + 1);
      
      if (warningCount + 1 >= WARNING_THRESHOLD) {
        // Block the user
        setIsBlocked(true);
        toast.error('🚨 No Cheating!', {
          description: 'You have been blocked for 5 seconds for clicking too fast.',
          duration: 5000,
        });
        
        setTimeout(() => {
          setIsBlocked(false);
          setWarningCount(0);
          clickTimestamps.current = [];
        }, BLOCK_DURATION);
        
        return false;
      }
      
      toast.warning('⚠️ Slow down!', {
        description: `Warning ${warningCount + 1}/${WARNING_THRESHOLD}. Clicking too fast may block you.`,
      });
      
      return false;
    }
    
    return true;
  }, [isBlocked, warningCount]);

  const resetWarnings = useCallback(() => {
    setWarningCount(0);
    clickTimestamps.current = [];
  }, []);

  return {
    isBlocked,
    checkClick,
    warningCount,
    resetWarnings,
  };
};
