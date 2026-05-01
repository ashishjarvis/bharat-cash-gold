// Fake countdown timer removed. Button simply calls onClick immediately.
import { Button } from '@/components/ui/button';

interface CountdownButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const CountdownButton = ({
  onClick,
  disabled,
  children,
  className,
}: CountdownButtonProps) => {
  return (
    <Button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </Button>
  );
};
