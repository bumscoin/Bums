import { useState, useEffect, useRef } from "react";

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function useBumsBalance() {
  const sessionSeed = useRef(Math.floor(Date.now() / 1000));
  const baseBalance = useRef(120000 + Math.floor(seededRandom(sessionSeed.current) * 30000));
  const baseUsd = useRef(1000 + Math.floor(seededRandom(sessionSeed.current + 1) * 4000));
  const rateRef = useRef(0.005 + seededRandom(sessionSeed.current + 2) * 0.015);

  const [balance, setBalance] = useState(baseBalance.current);
  const [usd, setUsd] = useState(baseUsd.current);
  const [perHour] = useState(600000 + Math.floor(seededRandom(sessionSeed.current + 3) * 200000));
  const [energy, setEnergy] = useState(21962);
  const maxEnergy = 99500;

  useEffect(() => {
    const interval = setInterval(() => {
      const tick = seededRandom(Date.now()) * 3;
      setBalance(prev => {
        const next = prev + Math.floor(tick * 10);
        baseUsd.current = Math.round(next * rateRef.current);
        return next;
      });
      setUsd(Math.round(balance * rateRef.current));
      setEnergy(prev => Math.min(maxEnergy, prev + Math.floor(tick * 2)));
    }, 800);
    return () => clearInterval(interval);
  }, [balance]);

  return { balance, usd, perHour, energy, maxEnergy };
}
