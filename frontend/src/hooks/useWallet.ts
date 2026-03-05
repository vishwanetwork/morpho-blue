import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import {
  SUPPORTED_CHAINS,
  DEFAULT_CHAIN_ID,
  isSupportedChain,
  getNetworkConfig,
  ChainConfig,
} from '../contracts/config';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(DEFAULT_CHAIN_ID);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chainConfig: ChainConfig | null = chainId ? (SUPPORTED_CHAINS[chainId] || null) : null;
  const isCorrectNetwork = chainId !== null && isSupportedChain(chainId);

  const switchToChain = useCallback(async (targetChainId: number) => {
    const targetConfig = SUPPORTED_CHAINS[targetChainId];
    if (!targetConfig) return;

    setChainId(targetChainId);

    if (address && window.ethereum) {
      const networkConfig = getNetworkConfig(targetConfig);
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: networkConfig.chainId }],
        });
      } catch (switchError: unknown) {
        if ((switchError as { code: number }).code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [networkConfig],
          });
        }
      }
    }
  }, [address]);

  // 默认切换到 DEFAULT_CHAIN
  const switchNetwork = useCallback(async () => {
    await switchToChain(DEFAULT_CHAIN_ID);
  }, [switchToChain]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask wallet');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[];

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const network = await browserProvider.getNetwork();
      const detectedChainId = Number(network.chainId);
      setChainId(detectedChainId);

      if (!isSupportedChain(detectedChainId)) {
        setError('Unsupported network. Please switch to Sepolia or Pharos testnet.');
      }

      const jsonRpcSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(jsonRpcSigner);
      setAddress(accounts[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setProvider(null);
  }, []);

  // 监听链和账户变化
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        disconnect();
      } else {
        setAddress(accs[0]);
      }
    };

    const handleChainChanged = async (newChainId: unknown) => {
      const parsedChainId = parseInt(newChainId as string, 16);
      setChainId(parsedChainId);

      // 链切换后，重新获取 signer
      if (window.ethereum) {
        try {
          const browserProvider = new BrowserProvider(window.ethereum);
          const jsonRpcSigner = await browserProvider.getSigner();
          setProvider(browserProvider);
          setSigner(jsonRpcSigner);
        } catch (err) {
          console.error('Failed to get signer after chain change:', err);
        }
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [disconnect]);

  return {
    address,
    signer,
    provider,
    chainId,
    chainConfig,
    isConnecting,
    isConnected: !!address,
    isCorrectNetwork,
    error,
    connect,
    disconnect,
    switchNetwork,
    switchToChain,
  };
}
