import appLogo from '@/assets/logo.png';

const LoadingScreen = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <img src={appLogo} alt="Bharat Cash Gold" className="w-24 h-24 rounded-2xl mb-6 gold-glow animate-pulse" />
      <h1 className="text-2xl font-orbitron font-bold gold-gradient-text mb-4">
        Bharat Cash Gold
      </h1>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <p className="text-muted-foreground text-sm mt-4">Loading...</p>
    </div>
  );
};

export default LoadingScreen;
