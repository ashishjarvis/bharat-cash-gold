import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  getUnityAdsStatus,
  onUnityAdsStatusChange,
  retryLoadAds,
  UNITY_GAME_ID,
  PLACEMENTS,
  type UnityAdsStatusType,
} from '@/lib/unityAds';

const STATUS_CONFIG: Record<UnityAdsStatusType, { label: string; color: string; dot: string }> = {
  initializing:    { label: 'Ads: Init...',     color: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10', dot: 'bg-yellow-400 animate-pulse' },
  ready:           { label: 'Ads: SDK Ready',   color: 'text-blue-400  border-blue-400/40  bg-blue-400/10',    dot: 'bg-blue-400' },
  rewarded_loaded: { label: 'Ads: Ready ✓',     color: 'text-green-400 border-green-400/40 bg-green-400/10',   dot: 'bg-green-400' },
  retrying:        { label: 'Ads: Retrying...', color: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10', dot: 'bg-yellow-400 animate-pulse' },
  load_failed:     { label: 'Ads: Failed',      color: 'text-red-400   border-red-400/40   bg-red-400/10',     dot: 'bg-red-400 animate-pulse' },
  not_available:   { label: 'Ads: N/A',         color: 'text-red-500   border-red-500/40   bg-red-500/10',     dot: 'bg-red-500' },
};

export const UnityAdsStatus = () => {
  const [status, setStatus]     = useState<UnityAdsStatusType>(getUnityAdsStatus());
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const unsub = onUnityAdsStatusChange((s) => {
      setStatus(s);
      if (s !== 'retrying') setRetrying(false);
    });
    return unsub;
  }, []);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    console.log('[UnityAds] 🔁 Manual retry from UI — Game ID:', UNITY_GAME_ID, '| Placement:', PLACEMENTS.REWARDED);
    await retryLoadAds();
    // retrying flag clears via the status-change listener above
  };

  const cfg = STATUS_CONFIG[status];
  const showRetryBtn = (status === 'load_failed' || status === 'not_available') && !retrying;

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cfg.color}`}
      title={`Unity Ads | Game ID: ${UNITY_GAME_ID} | Placement: ${PLACEMENTS.REWARDED}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span>{cfg.label}</span>

      {showRetryBtn && (
        <button
          onClick={handleRetry}
          className="ml-0.5 flex items-center gap-0.5 underline underline-offset-2 opacity-80 hover:opacity-100 active:scale-95 transition-transform"
          title="Retry loading ads"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          Retry
        </button>
      )}

      {retrying && (
        <RefreshCw className="w-2.5 h-2.5 ml-0.5 animate-spin" />
      )}
    </div>
  );
};
