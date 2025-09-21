import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export const CountdownTimer = ({ onCancel, onComplete }) => {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      onComplete();
    }
  }, [countdown, onComplete]);

  return (
    <div className="text-center">
      <p className="text-lg">Erasure will begin in {countdown} seconds...</p>
      <Button onClick={onCancel} variant="outline">Cancel</Button>
    </div>
  );
};