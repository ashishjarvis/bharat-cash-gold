import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Ban, Baby, Mail } from 'lucide-react';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border p-4">
        <div className="max-w-md mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-muted/30 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg text-primary">Privacy Policy</h1>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* App Info */}
        <div className="glass-card p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4 gold-glow">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold gold-gradient-text mb-2">Bharat Cash Gold</h2>
          <p className="text-sm text-muted-foreground">Privacy & Data Protection Policy</p>
          <p className="text-xs text-muted-foreground mt-2">Last Updated: January 2026</p>
        </div>

        {/* Gmail Data Section */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-bold text-primary">Gmail & Google Data</h3>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>When you sign in with Google, we collect:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Your email address (for account identification)</li>
              <li>Your display name (shown in leaderboard)</li>
              <li>Your profile picture (for personalization)</li>
            </ul>
            <p className="mt-3">
              <strong className="text-foreground">We do NOT access:</strong> Your contacts, emails, 
              Drive files, or any other Google services. Only basic profile information is used.
            </p>
          </div>
        </div>

        {/* Unity Ads Section */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
              <Eye className="w-5 h-5 text-secondary" />
            </div>
            <h3 className="font-bold text-secondary">Unity Ads & Advertising</h3>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>This app uses Unity Ads to display rewarded video advertisements.</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Ads are required to earn coins in the app</li>
              <li>Unity may collect device identifiers for ad targeting</li>
              <li>No personal data is shared with advertisers</li>
              <li>Ad preferences can be managed through your device settings</li>
            </ul>
            <p className="mt-3 text-xs">
              For Unity's privacy policy, visit: unity.com/legal/privacy-policy
            </p>
          </div>
        </div>

        {/* Anti-Cheat Section */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
              <Ban className="w-5 h-5 text-accent" />
            </div>
            <h3 className="font-bold text-accent">Anti-Cheat & Fair Play</h3>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>To maintain fair gameplay, we implement the following measures:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong>Rate Limiting:</strong> Maximum 2 actions per second to prevent automation</li>
              <li><strong>Device Binding:</strong> One account per device to prevent fraud</li>
              <li><strong>VPN Detection:</strong> VPN usage may be restricted (planned feature)</li>
              <li><strong>Root Detection:</strong> Rooted/jailbroken devices may be restricted</li>
            </ul>
            <p className="mt-3 text-destructive/80">
              <strong>Warning:</strong> Cheating, botting, or fraudulent activity will result in 
              permanent account suspension and forfeiture of all earnings.
            </p>
          </div>
        </div>

        {/* Under 13 Policy */}
        <div className="glass-card p-5 border-destructive/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
              <Baby className="w-5 h-5 text-destructive" />
            </div>
            <h3 className="font-bold text-destructive">Children Under 13</h3>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="font-semibold text-destructive">
              This app is NOT intended for children under the age of 13.
            </p>
            <p>
              In compliance with COPPA (Children's Online Privacy Protection Act):
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>We do not knowingly collect data from children under 13</li>
              <li>Users must be 13+ to create an account</li>
              <li>Parental consent is required for users aged 13-17</li>
              <li>If we discover underage users, accounts will be terminated</li>
            </ul>
            <p className="mt-3">
              Parents/guardians may contact us to request deletion of any 
              inadvertently collected child data.
            </p>
          </div>
        </div>

        {/* Data Security */}
        <div className="glass-card p-5">
          <h3 className="font-bold text-primary mb-3">Data Security & Storage</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• All data is encrypted in transit and at rest</p>
            <p>• Passwords are securely hashed (never stored in plain text)</p>
            <p>• Data is stored on secure cloud servers</p>
            <p>• You can request account deletion at any time</p>
          </div>
        </div>

        {/* Contact */}
        <div className="glass-card p-5 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30">
          <h3 className="font-bold text-primary mb-3">Contact Developer</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>Developer:</strong> Ashish Raj</p>
            <p><strong>App:</strong> Bharat Cash Gold</p>
            <p className="text-xs mt-3">
              For privacy concerns or data deletion requests, please contact 
              through the in-app support channels.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground/60 mt-6">
          By using Bharat Cash Gold, you agree to this Privacy Policy.
        </p>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
