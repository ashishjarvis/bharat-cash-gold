import { MessageCircle, Send, HelpCircle } from 'lucide-react';
import { useState } from 'react';

const WHATSAPP_NUMBER = '919999999999'; // Replace with actual number
const TELEGRAM_CHANNEL = 'bharatcashproofs'; // Replace with actual channel
const SUPPORT_MESSAGE = 'I need help with Bharat Cash Money Earning App';

export const SupportButtons = () => {
  const [isOpen, setIsOpen] = useState(false);

  const openWhatsApp = () => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;
    window.open(url, '_blank');
  };

  const openTelegram = () => {
    const url = `https://t.me/${TELEGRAM_CHANNEL}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed bottom-24 right-4 z-50">
      {/* Expanded buttons */}
      <div className={`flex flex-col gap-3 mb-3 transition-all duration-300 ${
        isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        {/* WhatsApp Support */}
        <button
          onClick={openWhatsApp}
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#25D366] text-white font-medium shadow-lg hover:scale-105 transition-transform"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">WhatsApp Support</span>
        </button>

        {/* Telegram Channel */}
        <button
          onClick={openTelegram}
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#0088cc] text-white font-medium shadow-lg hover:scale-105 transition-transform"
        >
          <Send className="w-5 h-5" />
          <span className="text-sm">Payment Proofs</span>
        </button>
      </div>

      {/* Main toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 gold-glow ${
          isOpen 
            ? 'bg-muted text-muted-foreground rotate-45' 
            : 'bg-gradient-to-br from-primary to-gold-dark text-primary-foreground'
        }`}
      >
        <HelpCircle className="w-7 h-7" />
      </button>
    </div>
  );
};
