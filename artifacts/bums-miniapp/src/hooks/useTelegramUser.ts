import { useEffect, useState } from "react";

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: TelegramUser;
          start_param?: string;
        };
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        MainButton?: {
          show: () => void;
          hide: () => void;
          setText: (text: string) => void;
          onClick: (cb: () => void) => void;
        };
        colorScheme?: string;
        themeParams?: Record<string, string>;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        enableClosingConfirmation?: () => void;
        HapticFeedback?: {
          impactOccurred: (style: string) => void;
          notificationOccurred: (type: string) => void;
        };
        version?: string;
        platform?: string;
        isExpanded?: boolean;
      };
    };
  }
}

export function useTelegramUser() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      setIsTelegram(true);
      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.("#0a0a0f");
      tg.setBackgroundColor?.("#0a0a0f");

      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser) {
        setUser(tgUser);
      }
    }
  }, []);

  const hapticImpact = (style: "light" | "medium" | "heavy" = "medium") => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  };

  const hapticNotification = (type: "success" | "warning" | "error" = "success") => {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
  };

  return { user, isTelegram, hapticImpact, hapticNotification };
}
