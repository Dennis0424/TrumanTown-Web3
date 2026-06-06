import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { wagmiConfig } from '../../web3/wagmi';
import { usdcAbi, interactionHubAbi } from '../../web3/abis';
import {
  CHAIN_ID,
  DEFAULT_AGENT_ID,
  USDC_ADDRESS,
  INTERACTION_HUB_ADDRESS,
  PONDER_URL,
} from '../../web3/constants';
import { humanizeTradeError } from '../../web3/tradeError';

interface WhisperRecord {
  id: string;
  sender: string;
  text: string;
  amount: string;
  blockTimestamp: number;
}

type WhisperPhase = 'idle' | 'approving' | 'whispering' | 'done' | 'error';

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WhisperPanel({ agentId = DEFAULT_AGENT_ID }: { agentId?: string }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [text, setText] = useState('');
  const [usdcAmount, setUsdcAmount] = useState('0.05');
  const [phase, setPhase] = useState<WhisperPhase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [whispers, setWhispers] = useState<WhisperRecord[]>([]);

  const mountedRef = useRef(true);

  // Poll recent whispers from Ponder indexer
  const fetchWhispers = useCallback(async () => {
    try {
      const r = await fetch(`${PONDER_URL}/agents/${agentId}/whispers`);
      if (!r.ok) return;
      const json = (await r.json()) as WhisperRecord[];
      if (mountedRef.current) setWhispers(Array.isArray(json) ? json.slice(0, 5) : []);
    } catch {
      /* fail-safe: keep last snapshot */
    }
  }, [agentId]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchWhispers();
    const id = setInterval(() => void fetchWhispers(), 10_000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchWhispers]);

  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const busy = phase === 'approving' || phase === 'whispering';
  const amountAtoms = Math.round(parseFloat(usdcAmount || '0') * 1e6);
  const canSubmit = text.trim().length > 0 && amountAtoms > 0;

  const handleWhisper = async () => {
    if (!canSubmit) return;
    setErrorMsg(null);
    try {
      setPhase('approving');
      const approveHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: usdcAbi,
        functionName: 'approve',
        args: [INTERACTION_HUB_ADDRESS, BigInt(amountAtoms)],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });

      setPhase('whispering');
      const whisperHash = await writeContractAsync({
        address: INTERACTION_HUB_ADDRESS,
        abi: interactionHubAbi,
        functionName: 'whisper',
        args: [BigInt(agentId), text, BigInt(amountAtoms)],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: whisperHash });

      setPhase('done');
      setText('');
      void fetchWhispers();
    } catch (e) {
      setPhase('error');
      setErrorMsg(humanizeTradeError(e));
    }
  };

  const actionLabel = (() => {
    if (phase === 'approving') return '授权中…';
    if (phase === 'whispering') return '发送中…';
    return '授权 → Whisper';
  })();

  return (
    <div className="box mt-4 bg-brown-800 text-brown-100">
      {/* Header */}
      <div className="bg-brown-700 px-3 py-2 flex items-center justify-between">
        <h2 className="font-display text-lg tracking-wider shadow-solid">🤫 WHISPER</h2>
        <span className="font-body text-xs text-clay-300 uppercase tracking-widest">Base Sepolia</span>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* Wallet */}
        <div className="flex justify-center">
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>

        {/* Wrong Chain */}
        {wrongChain && (
          <button className="trade-chain-btn" onClick={() => switchChain({ chainId: CHAIN_ID })}>
            ⚠ 切换到 Base Sepolia
          </button>
        )}

        {/* Whisper UI */}
        {isConnected && !wrongChain && (
          <>
            {/* Text input */}
            <div className="flex flex-col gap-1">
              <span className="trade-stat-label">消息（最多 512 字符）</span>
              <textarea
                className="trade-input resize-none"
                rows={3}
                maxLength={512}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="向居民低语…"
              />
              <span className="text-xs text-right text-clay-400">{text.length} / 512</span>
            </div>

            {/* Amount input */}
            <div className="flex flex-col gap-1">
              <span className="trade-stat-label">金额（USDC）</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="trade-input"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                placeholder="0.05"
              />
            </div>

            {/* Action button */}
            <button
              className="trade-action-btn buy-btn"
              disabled={busy || !canSubmit}
              onClick={handleWhisper}
            >
              {busy ? '⟳ ' : ''}{actionLabel}
            </button>

            {/* Feedback */}
            {errorMsg && <p className="trade-status-err" role="alert">{errorMsg}</p>}
            {phase === 'done' && (
              <p className="trade-status-ok" role="status">✓ Whisper 已发送</p>
            )}
          </>
        )}

        {/* Recent whispers */}
        {whispers.length > 0 && (
          <div className="flex flex-col gap-2 mt-1">
            <span className="trade-stat-label">最近低语</span>
            {whispers.map((w) => (
              <div
                key={w.id}
                className="bg-brown-900 px-3 py-2 text-xs"
                style={{ border: '2px solid #B86F50' }}
              >
                <div className="flex justify-between mb-1">
                  <span className="text-clay-300">{truncateAddress(w.sender)}</span>
                  <span className="text-clay-400">{w.amount ? `${(Number(w.amount) / 1e6).toFixed(2)} USDC` : ''}</span>
                </div>
                <p className="text-brown-100 break-words">{w.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
