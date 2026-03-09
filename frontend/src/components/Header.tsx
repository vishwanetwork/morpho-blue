import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CHAINS, SUPPORTED_CHAIN_IDS, ChainConfig } from '../contracts/config';

interface HeaderProps {
  address: string | null;
  isConnecting: boolean;
  isCorrectNetwork: boolean;
  chainConfig: ChainConfig | null;
  chainId: number | null;
  onConnect: () => void;
  onSwitchNetwork: () => void;
  onSwitchToChain: (chainId: number) => void;
}

export function Header({
  address,
  isConnecting,
  isCorrectNetwork,
  chainConfig,
  chainId,
  onConnect,
  onSwitchNetwork,
  onSwitchToChain,
}: HeaderProps) {
  const { t, i18n } = useTranslation();
  const [showChainMenu, setShowChainMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const chainMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chainMenuRef.current && !chainMenuRef.current.contains(event.target as Node)) {
        setShowChainMenu(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setShowLangMenu(false);
  };

  const getChainBadge = () => {
    if (!chainConfig) {
      return { name: t('common.notConnected'), color: 'text-gray-400', dot: 'bg-gray-400' };
    }
    if (chainConfig.chainId === 11155111) {
      return { name: 'Sepolia', color: 'text-blue-400', dot: 'bg-blue-400' };
    }
    if (chainConfig.chainId === 688689) {
      return { name: 'Pharos', color: 'text-purple-400', dot: 'bg-purple-400' };
    }
    return { name: chainConfig.shortName, color: 'text-gray-400', dot: 'bg-gray-400' };
  };

  const badge = getChainBadge();
  const currentLang = i18n.language?.startsWith('zh') ? 'zh' : 'en';

  return (
    <nav className="glass-strong border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center shadow-lg shadow-purple-500/50 hover:scale-110 transition-transform duration-300">
            <span className="text-2xl">🏦</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Morpho Blue
            </span>
            <span className="text-xs text-gray-400">{t('header.subtitle')}</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Language Switcher */}
          <div className="relative" ref={langMenuRef}>
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="glass rounded-full px-3 py-2 text-sm flex items-center space-x-1.5 hover:bg-white/10 transition-all duration-300 cursor-pointer"
            >
              <span className="text-base">🌐</span>
              <span className="font-medium text-gray-300">{currentLang === 'en' ? 'EN' : '中文'}</span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showLangMenu ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-36 glass-strong rounded-xl border border-white/20 overflow-hidden animate-slide-down shadow-2xl z-50">
                <button
                  onClick={() => toggleLanguage('en')}
                  className={`w-full px-4 py-3 text-left flex items-center justify-between transition-all duration-200 ${
                    currentLang === 'en'
                      ? 'bg-purple-600/30 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>English</span>
                  {currentLang === 'en' && <span className="text-xs text-green-400">✓</span>}
                </button>
                <button
                  onClick={() => toggleLanguage('zh')}
                  className={`w-full px-4 py-3 text-left flex items-center justify-between transition-all duration-200 ${
                    currentLang === 'zh'
                      ? 'bg-purple-600/30 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>中文</span>
                  {currentLang === 'zh' && <span className="text-xs text-green-400">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Chain Selector */}
          <div className="relative" ref={chainMenuRef}>
            <button
              onClick={() => setShowChainMenu(!showChainMenu)}
              className="glass rounded-full px-4 py-2 text-sm flex items-center space-x-2 hover:bg-white/10 transition-all duration-300 cursor-pointer"
            >
              <span className={`inline-block w-2 h-2 ${badge.dot} rounded-full animate-pulse`}></span>
              <span className={`font-medium ${badge.color}`}>{badge.name}</span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showChainMenu ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showChainMenu && (
              <div className="absolute right-0 mt-2 w-56 glass-strong rounded-xl border border-white/20 overflow-hidden animate-slide-down shadow-2xl z-50">
                <div className="p-2 text-xs text-gray-400 border-b border-white/10 px-3">
                  {t('common.selectNetwork')}
                </div>
                {SUPPORTED_CHAIN_IDS.map((id) => {
                  const chain = SUPPORTED_CHAINS[id];
                  const isActive = chainId === id;
                  const hasContracts = !!chain.contracts.MORPHO;

                  return (
                    <button
                      key={id}
                      onClick={() => {
                        onSwitchToChain(id);
                        setShowChainMenu(false);
                      }}
                      className={`w-full px-4 py-3 text-left flex items-center justify-between transition-all duration-200 ${
                        isActive
                          ? 'bg-purple-600/30 text-white'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          id === 11155111 ? 'bg-blue-400' : 'bg-purple-400'
                        }`}></span>
                        <div>
                          <div className="font-medium">{chain.shortName}</div>
                          <div className="text-xs text-gray-500">
                            {chain.nativeCurrency.symbol} · ID: {id}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!hasContracts && (
                          <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                            {t('common.pendingDeploy')}
                          </span>
                        )}
                        {isActive && (
                          <span className="text-xs text-green-400">✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {address ? (
            <div className="flex items-center space-x-3">
              {!isCorrectNetwork && (
                <button
                  onClick={onSwitchNetwork}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg shadow-yellow-500/30 transition-all duration-300 hover:scale-105"
                >
                  ⚠️ {t('common.switchNetwork')}
                </button>
              )}
              <div className="glass-strong px-5 py-2.5 rounded-xl font-mono text-sm border border-white/10 hover:border-white/20 transition-all">
                <span className="text-green-400 mr-1">●</span>
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <span className="inline-block animate-spin mr-2">⚡</span>
                  {t('common.connecting')}
                </>
              ) : (
                <>
                  <span className="mr-2">🔗</span>
                  {t('common.connectWallet')}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
