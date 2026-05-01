import { useState, useEffect } from 'react';
import { IndianRupee, CheckCircle } from 'lucide-react';

// Simulated payment messages for trust building
const PAYMENT_NAMES = [
  'Rahul K.', 'Priya S.', 'Amit V.', 'Sneha M.', 'Vikram P.',
  'Anjali R.', 'Karan T.', 'Neha G.', 'Rohit B.', 'Divya N.',
  'Arjun S.', 'Pooja K.', 'Manish D.', 'Shruti P.', 'Rajesh M.',
  'Kavya L.', 'Aditya W.', 'Ritika C.', 'Suresh H.', 'Megha T.',
];

const AMOUNTS = [10, 20, 30, 50, 100, 150, 200];

const generateRandomPayment = () => {
  const name = PAYMENT_NAMES[Math.floor(Math.random() * PAYMENT_NAMES.length)];
  const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
  const minutesAgo = Math.floor(Math.random() * 30) + 1;
  
  return {
    id: Date.now() + Math.random(),
    name,
    amount,
    minutesAgo,
  };
};

export const LivePaymentTicker = () => {
  const [payments, setPayments] = useState(() => 
    Array.from({ length: 5 }, generateRandomPayment)
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Rotate through payments every 3 seconds
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % payments.length);
    }, 3000);

    // Add new payment every 10 seconds
    const addPaymentInterval = setInterval(() => {
      setPayments(prev => {
        const newPayments = [...prev, generateRandomPayment()];
        if (newPayments.length > 10) newPayments.shift();
        return newPayments;
      });
    }, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(addPaymentInterval);
    };
  }, [payments.length]);

  const currentPayment = payments[currentIndex];

  return (
    <div className="glass-card p-3 overflow-hidden">
      <div className="flex items-center gap-2">
        {/* Live indicator */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/20 border border-accent/30">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] font-semibold text-accent uppercase">Live</span>
        </div>

        {/* Scrolling ticker */}
        <div className="flex-1 overflow-hidden">
          <div 
            className="flex items-center gap-2 transition-transform duration-500"
            key={currentPayment.id}
          >
            <CheckCircle className="w-4 h-4 text-accent shrink-0" />
            <div className="flex items-center gap-1 animate-slide-in">
              <span className="font-semibold text-sm text-foreground">
                {currentPayment.name}
              </span>
              <span className="text-muted-foreground text-sm">received</span>
              <span className="font-orbitron font-bold text-accent flex items-center">
                <IndianRupee className="w-3 h-3" />
                {currentPayment.amount}
              </span>
              <span className="text-muted-foreground text-xs">
                • {currentPayment.minutesAgo}m ago
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
