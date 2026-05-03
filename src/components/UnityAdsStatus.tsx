import { useState, useEffect } from 'react';
import { getUnityAdsStatus, onUnityAdsStatusChange, UNITY_GAME_ID, type UnityAdsStatusType } from '@/lib/unityAds';

const STATUS_CONFIG: Record<UnityAdsStatusType, { label: string; color: string; dot: string }> = {
  initializing:    { label: 'Ads: Initializing...', color: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10', dot: 'bg-yellow-400 animate-pulse' },
  ready:           { label: 'Ads: SDK Ready',        color: 'text-blue-400 border-blue-400/40 bg-blue-400/10',      dot: 'bg-blue-400' },
  rewarded_loaded: { label: 'Ads: Ready',            color: 'text-green-400 border-green-400/40 bg-green-400/10',   dot: 'bg-green-400' },
  load_failed:     { label: 'Ads: Load Failed',      color: 'text-red-400 border-red-400/40 bg-red-400/10',         dot: 'bg-red-400 animate-pulse' },
  not_available:   { label: 'Ads: Not Available',    color: 'text-red-500 border-red-500/40 bg-red-500/10',         dot: 'bg-red-500' },
};

export const UnityAdsStatus = () => {
  const [status, setStatus] = useState<UnityAdsStatusType>(getUnityAdsStatus());

  useEffect(() => {
    const unsub = onUnityAdsStatusChange(setStatus);
    return unsub;
  }, []);

  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cfg.color}`}
      title={`Unity Ads SDK | Game ID: ${UNITY_GAME_ID}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </div>
  );
};
