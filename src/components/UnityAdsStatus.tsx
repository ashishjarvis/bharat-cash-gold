import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  getUnityAdsStatus,
  getLastErrorCode,
  getSdkVersion,
  onUnityAdsStatusChange,
  retryLoadAds,
  UNITY_GAME_ID,
  UNITY_TEST_MODE,
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
  const [status,    setStatus]    = useState<UnityAdsStatusType>(getUnityAdsStatus());
  const [errorCode, setErrorCode] = useState<string>(getLastErrorCode());
  const [retrying,  setRetrying]  = useState(false);

  useEffect(() => {
    const unsub = onUnityAdsStatusChange((s) => {
      setStatus(s);
      setErrorCode(getLastErrorCode());
      if (s !== 'retrying') setRetrying(false);
    });
    return unsub;
  }, []);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    console.log('[UnityAds] 🔁 Manual retry | Game ID:', UNITY_GAME_ID, '| Placement:', PLACEMENTS.REWARDED, '| testMode:', UNITY_TEST_MODE);
    await retryLoadAds();
  };

  const cfg = STATUS_CONFIG[status];
  const showRetryBtn = (status === 'load_failed' || status === 'not_available') && !retrying;
  const showErrorCode = (status === 'load_failed' || status === 'not_available') && errorCode && errorCode !== 'NONE';
  const sdkVer = getSdkVersion();

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cfg.color}`}
      title={[
        `Unity Ads | Game ID: ${UNITY_GAME_ID}`,
        `Placement: ${PLACEMENTS.REWARDED}`,
        `testMode: ${UNITY_TEST_MODE}`,
        sdkVer !== 'unknown' ? `SDK: ${sdkVer}` : '',
        showErrorCode ? `Error: ${errorCode}` : '',
      ].filter(Boolean).join(' | ')}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />

      <span>
        {cfg.label}
        {showErrorCode && (
          <span className="ml-1 opacity-80">[{errorCode}]</span>
        )}
        {UNITY_TEST_MODE && status === 'rewarded_loaded' && (
          <span className="ml-1 opacity-70">TEST</span>
        )}
      </span>

      {showRetryBtn && (
        <button
          onClick={handleRetry}
          className="ml-0.5 flex items-center gap-0.5 underline underline-offset-2 opacity-80 hover:opacity-100 active:scale-95 transition-transform"
          title="Retry loading ads now"
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

// ─── Test Banner ────────────────────────────────────────────────
// Shows only when testMode=true and SDK is ready/loaded.
// Confirms the Unity Ads connection is working without needing
// a separate banner placement (the plugin has no banner API).
export const UnityTestBanner = () => {
  const [status, setStatus] = useState<UnityAdsStatusType>(getUnityAdsStatus());
  const [errorCode, setErrorCode] = useState(getLastErrorCode());

  useEffect(() => {
    const unsub = onUnityAdsStatusChange((s) => {
      setStatus(s);
      setErrorCode(getLastErrorCode());
    });
    return unsub;
  }, []);

  if (!UNITY_TEST_MODE) return null;

  const isConnected  = status === 'rewarded_loaded' || status === 'ready';
  const isFailed     = status === 'load_failed' || status === 'not_available';
  const isWorking    = status === 'initializing' || status === 'retrying';

  return (
    <div className={`w-full rounded-xl border-2 p-3 flex items-center gap-3 text-xs font-medium
      ${isConnected ? 'border-green-500/40 bg-green-500/10 text-green-400'
        : isFailed   ? 'border-red-500/40 bg-red-500/10 text-red-400'
        : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'}`}
    >
      {/* Animated unity icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base
        ${isConnected ? 'bg-green-500/20' : isFailed ? 'bg-red-500/20' : 'bg-yellow-500/20'}`}>
        {isConnected ? '✅' : isFailed ? '❌' : '⏳'}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold truncate">
          {isConnected ? 'Unity Ads — Connection OK (TEST MODE)'
            : isFailed  ? `Unity Ads — Load Failed${errorCode && errorCode !== 'NONE' ? ': ' + errorCode : ''}`
            : 'Unity Ads — Connecting...'}
        </p>
        <p className="opacity-70 truncate">
          {isConnected
            ? `Game ID: ${UNITY_GAME_ID} | ${PLACEMENTS.REWARDED} | Ready to show`
            : isFailed
            ? `Game ID: ${UNITY_GAME_ID} | Check Unity Dashboard for "${PLACEMENTS.REWARDED}"`
            : `Game ID: ${UNITY_GAME_ID} | Please wait...`}
        </p>
      </div>

      <div className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-bold
        ${isConnected ? 'border-green-400/50 bg-green-400/10'
          : isFailed  ? 'border-red-400/50 bg-red-400/10'
          : 'border-yellow-400/50 bg-yellow-400/10'}`}>
        {isConnected ? 'LIVE' : isFailed ? 'FAIL' : 'WAIT'}
      </div>
    </div>
  );
};
