import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { MarketList } from './components/MarketList';
import { OperationModal } from './components/OperationModal';
import { LiquidationPanel } from './components/LiquidationPanel';
import { AdminPanel } from './components/AdminPanel';
import { CreateMarketModal } from './components/CreateMarketModal';
import { UserPositions } from './components/UserPositions';
import { useWallet } from './hooks/useWallet';
import { useMarkets } from './hooks/useMarkets';
import { useOperations } from './hooks/useOperations';
import { useLiquidation } from './hooks/useLiquidation';
import { useAdmin } from './hooks/useAdmin';
import { MarketInfo } from './types';
import { formatAmount } from './utils/format';
import { hasTieredLiquidation, hasWhitelistRegistry } from './contracts/config';
import { JsonRpcProvider } from 'ethers';

type Tab = 'markets' | 'position' | 'liquidation' | 'admin';

function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('markets');
  const [selectedMarket, setSelectedMarket] = useState<MarketInfo | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConnectWalletAlert, setShowConnectWalletAlert] = useState(false);
  const [hiddenMarketIds, setHiddenMarketIds] = useState<Set<string>>(new Set());

  const wallet = useWallet();
  const { chainConfig } = wallet;

  const { markets, loading, error: marketsError, fetchMarkets, createMarket } = useMarkets(wallet.signer, chainConfig);
  const operations = useOperations(wallet.signer, chainConfig);
  const liquidation = useLiquidation(wallet.signer, chainConfig);
  const admin = useAdmin(wallet.signer, chainConfig);

  const rpcUrl = chainConfig?.rpcUrls[0] || 'https://atlantic.dplabs-internal.com';
  const provider = new JsonRpcProvider(rpcUrl);
  const morphoAddress = chainConfig?.contracts.MORPHO || '';

  const supportsTiered = chainConfig ? hasTieredLiquidation(chainConfig) : false;
  const supportsWhitelist = chainConfig ? hasWhitelistRegistry(chainConfig) : false;

  useEffect(() => {
    if (!chainConfig) {
      setHiddenMarketIds(new Set());
      return;
    }
    const storageKey = `hiddenMarkets:${chainConfig.chainId}`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setHiddenMarketIds(new Set());
      return;
    }
    try {
      const parsed = JSON.parse(raw) as string[];
      setHiddenMarketIds(new Set(parsed));
    } catch {
      setHiddenMarketIds(new Set());
    }
  }, [chainConfig]);

  const persistHiddenMarketIds = (next: Set<string>) => {
    if (!chainConfig) return;
    const storageKey = `hiddenMarkets:${chainConfig.chainId}`;
    localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
  };

  const handleHideMarket = (marketId: string) => {
    setHiddenMarketIds((prev) => {
      const next = new Set(prev);
      next.add(marketId);
      persistHiddenMarketIds(next);
      return next;
    });
  };

  const handleRestoreHiddenMarkets = () => {
    setHiddenMarketIds(() => {
      const next = new Set<string>();
      persistHiddenMarketIds(next);
      return next;
    });
  };

  const visibleMarkets = useMemo(
    () => markets.filter((m) => !hiddenMarketIds.has(m.id)),
    [markets, hiddenMarketIds]
  );

  const getCreateMarketDefaults = () => {
    if (!chainConfig) return undefined;
    if (chainConfig.chainId === 11155111) {
      return {
        loanToken: '0x6F1b9Cb0e85C025656358594Bfb8f7003EC2faF6',
        irm: '0xc8686a426fEdADEAFc2a2e3BD21B76464a1e1eE4',
        lltv: '0.8',
      };
    }
    if (chainConfig.chainId === 688689) {
      return {
        irm: '0xC5c6addf721E77BAeEE066D5db6ab773FbFd838d',
      };
    }
    return undefined;
  };

  const getIrmHint = () => {
    if (!chainConfig) return undefined;
    if (chainConfig.chainId === 11155111) {
      return '0xc8686a426fEdADEAFc2a2e3BD21B76464a1e1eE4';
    }
    if (chainConfig.chainId === 688689) {
      return '0xC5c6addf721E77BAeEE066D5db6ab773FbFd838d';
    }
    return undefined;
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'markets', label: t('tabs.markets'), icon: '📊' },
    { key: 'position', label: t('tabs.positions'), icon: '👤' },
    { key: 'liquidation', label: t('tabs.liquidation'), icon: '⚡' },
    { key: 'admin', label: t('tabs.admin'), icon: '⚙️' },
  ];

  const totalSupply = visibleMarkets.reduce((sum, m) => sum + m.market.totalSupplyAssets, 0n);
  const totalBorrow = visibleMarkets.reduce((sum, m) => sum + m.market.totalBorrowAssets, 0n);
  const totalCollateral = visibleMarkets.reduce((sum, m) => sum + (m.market.totalCollateral || 0n), 0n);
  const defaultDecimals = visibleMarkets.length > 0 ? (visibleMarkets[0].loanTokenDecimals || 18) : 18;
  const collateralDecimals = visibleMarkets.length > 0 ? (visibleMarkets[0].collateralTokenDecimals || 18) : 18;

  const handleSelectMarket = (market: MarketInfo) => {
    if (!wallet.address) {
      setShowConnectWalletAlert(true);
      setTimeout(() => setShowConnectWalletAlert(false), 3000);
    } else {
      setSelectedMarket(market);
    }
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,40%,8%)] via-[hsl(250,50%,12%)] to-[hsl(280,45%,10%)]"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      </div>

      <Header
        address={wallet.address}
        isConnecting={wallet.isConnecting}
        isCorrectNetwork={wallet.isCorrectNetwork}
        chainConfig={wallet.chainConfig}
        chainId={wallet.chainId}
        onConnect={wallet.connect}
        onSwitchNetwork={wallet.switchNetwork}
        onSwitchToChain={wallet.switchToChain}
      />

      <main className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
        {/* Hero Section */}
        <div className="text-center mb-12 animate-slide-up">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Morpho Blue
          </h1>
          <p className="text-gray-400 text-lg">
            {t('hero.subtitle')}
            {chainConfig && (
              <span className="ml-2 text-purple-400">({chainConfig.shortName})</span>
            )}
          </p>
        </div>

        {chainConfig && !chainConfig.contracts.MORPHO && (
          <div className="mb-8 p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-xl text-yellow-300 text-center animate-slide-up">
            <span className="text-xl mr-2">⚠️</span>
            {t('alerts.contractNotDeployed', { chain: chainConfig.shortName })}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-5 mb-12">
          {[
            { label: t('stats.totalSupply'), icon: '💰', value: formatAmount(totalSupply, defaultDecimals), gradient: 'from-green-400 to-emerald-400', delay: '0.1s' },
            { label: t('stats.totalCollateral'), icon: '🔐', value: formatAmount(totalCollateral, collateralDecimals), gradient: 'from-orange-400 to-yellow-400', delay: '0.2s' },
            { label: t('stats.totalBorrow'), icon: '📈', value: formatAmount(totalBorrow, defaultDecimals), gradient: 'from-blue-400 to-cyan-400', delay: '0.3s' },
            { label: t('stats.markets'), icon: '🏦', value: String(markets.length), gradient: 'from-purple-400 to-pink-400', delay: '0.4s' },
          ].map((stat) => (
            <div key={stat.label} className="glass-strong rounded-2xl p-5 hover:scale-105 transition-transform duration-300 animate-slide-up" style={{ animationDelay: stat.delay }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{stat.icon}</span>
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">{stat.label}</span>
              </div>
              <div className={`text-2xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
                {stat.value}
              </div>
            </div>
          ))}
          <div className="glass-strong rounded-2xl p-5 hover:scale-105 transition-transform duration-300 animate-slide-up" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{wallet.isConnected ? '✅' : '🔌'}</span>
              <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">{t('stats.walletStatus')}</span>
            </div>
            <div className={`text-2xl font-bold whitespace-nowrap ${wallet.isConnected ? 'text-green-400' : 'text-gray-500'}`}>
              {wallet.isConnected ? t('common.connected') : t('common.notConnected')}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="glass-strong rounded-2xl p-1.5 mb-8 inline-flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 md:px-6 py-2.5 rounded-xl font-semibold text-sm md:text-base transition-all duration-300 whitespace-nowrap ${activeTab === tab.key
                  ? 'gradient-bg text-white shadow-lg shadow-purple-500/50 scale-105'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <span className="text-lg mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {activeTab === 'markets' && (
            <MarketList
              markets={visibleMarkets}
              loading={loading}
              error={marketsError}
              onSelectMarket={handleSelectMarket}
              onCreateMarket={() => setShowCreateModal(true)}
              onRefresh={fetchMarkets}
              onHideMarket={handleHideMarket}
              onRestoreHiddenMarkets={handleRestoreHiddenMarkets}
              hiddenCount={hiddenMarketIds.size}
            />
          )}

          {activeTab === 'position' && (
            <UserPositions
              markets={markets}
              userAddress={wallet.address}
              morphoAddress={morphoAddress}
              provider={provider}
              onSelectMarket={handleSelectMarket}
            />
          )}

          {activeTab === 'liquidation' && (
            <LiquidationPanel
              markets={markets}
              address={wallet.address}
              signer={wallet.signer}
              chainConfig={chainConfig}
              onLiquidate={async (market, borrower, amount) => {
                await liquidation.liquidate(market.params, borrower, amount, 0n);
              }}
              onLiquidateDirect={async (market, borrower, amount) => {
                await liquidation.liquidateDirect(market.params, borrower, amount, 0n);
              }}
              onRequestLiquidation={async (market, borrower, ratio, deposit) => {
                await liquidation.requestLiquidation(market.params, borrower, ratio, deposit);
              }}
              onExecuteLiquidation={async (market, borrower) => {
                await liquidation.executeLiquidation(market.params, borrower);
              }}
              onCancelLiquidation={async (market, borrower) => {
                await liquidation.cancelLiquidationRequest(market.params, borrower);
              }}
            />
          )}

          {activeTab === 'admin' && (
            <AdminPanel
              markets={markets}
              address={wallet.address}
              signer={wallet.signer}
              chainConfig={chainConfig}
              supportsTiered={supportsTiered}
              supportsWhitelist={supportsWhitelist}
              onAddLiquidator={admin.addLiquidator}
              onRemoveLiquidator={admin.removeLiquidator}
              onSetWhitelistMode={admin.setWhitelistMode}
              onConfigureMarket={admin.configureMarket}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      {showConnectWalletAlert && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
          <div className="glass-strong rounded-xl px-6 py-4 border border-yellow-500/50 shadow-lg shadow-yellow-500/20">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">⚠️</span>
              <span className="text-yellow-400 font-medium">{t('alerts.connectWalletFirst')}</span>
            </div>
          </div>
        </div>
      )}

      {selectedMarket && wallet.address && (
        <OperationModal
          market={selectedMarket}
          userAddress={wallet.address}
          chainConfig={chainConfig}
          onClose={() => setSelectedMarket(null)}
          onSuccess={fetchMarkets}
          onApprove={operations.approveToken}
          onSupply={(assets) => operations.supply(selectedMarket.params, assets, wallet.address!)}
          onWithdraw={(assets) => operations.withdraw(selectedMarket.params, assets, wallet.address!, wallet.address!)}
          onSupplyCollateral={(assets) => operations.supplyCollateral(selectedMarket.params, assets, wallet.address!)}
          onWithdrawCollateral={(assets) => operations.withdrawCollateral(selectedMarket.params, assets, wallet.address!, wallet.address!)}
          onBorrow={(assets) => operations.borrow(selectedMarket.params, assets, wallet.address!, wallet.address!)}
          onRepay={(assets) => operations.repay(selectedMarket.params, assets, wallet.address!)}
        />
      )}

      {showCreateModal && (
        <CreateMarketModal
          onClose={() => setShowCreateModal(false)}
          onCreate={async (params, onStatus) => {
            await createMarket(params, onStatus);
            await fetchMarkets();
          }}
          defaults={getCreateMarketDefaults()}
          irmHint={getIrmHint()}
        />
      )}
    </div>
  );
}

export default App;
