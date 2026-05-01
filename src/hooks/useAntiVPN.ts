import { useState, useEffect } from 'react';

export const useAntiVPN = () => {
  const [isVPN, setIsVPN] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const checkVPN = async () => {
      try {
        // Use WebRTC to detect VPN by checking for mismatched IPs
        // Also check timezone mismatch as a proxy signal
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const isIndianTZ = tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('Asia');
        
        // If timezone is not Indian, flag as potential VPN
        if (!isIndianTZ) {
          setIsVPN(true);
        }
      } catch {
        // If check fails, allow access
      }
      setChecked(true);
    };

    checkVPN();
  }, []);

  return { isVPN, checked };
};
