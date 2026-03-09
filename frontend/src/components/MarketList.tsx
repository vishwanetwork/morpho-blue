import { useTranslation } from 'react-i18next';
import { MarketInfo } from '../types';
import { formatAmount, formatPercent } from '../utils/format';

interface MarketListProps {
  markets: MarketInfo[];
  loading: boolean;
  error?: string | null;
  onSelectMarket: (market: MarketInfo) => void;
  onCreateMarket: () => void;
  onRefresh?: () => void;
  onHideMarket: (marketId: string) => void;
  onRestoreHiddenMarkets: () => void;
  hiddenCount: number;
}

export function MarketList({
  markets,
  loading,
  error,
  onSelectMarket,
  onCreateMarket,
  onRefresh,
  onHideMarket,
  onRestoreHiddenMarkets,
  hiddenCount,
}: MarketListProps) {
  const { t } = useTranslation();

  if (loading && markets.length === 0) {
    return (
      <div className="glass-strong rounded-2xl p-16 text-center">
        <div className="animate-spin text-6xl mb-4">⏳</div>
        <p className="text-xl text-gray-400">{t('marketList.loadingMarkets')}</p>
      </div>
    );
  }

  if (error && markets.length === 0) {
    return (
      <div className="glass-strong rounded-2xl p-16 text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <p className="text-xl text-red-400 mb-4">{error}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="gradient-bg px-6 py-3 rounded-xl text-sm font-semibold"
          >
            {t('common.retry') || 'Retry'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {t('marketList.title')}
          </h2>
          <p className="text-gray-400 text-sm mt-1">{t('marketList.subtitle')}</p>
        </div>
        <div className="flex items-center space-x-3">
          {hiddenCount > 0 && (
            <button
              onClick={onRestoreHiddenMarkets}
              className="glass px-4 py-2 rounded-xl text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-300"
            >
              {t('marketList.restoreHidden', { count: hiddenCount })}
            </button>
          )}
          <button
            onClick={onCreateMarket}
            className="gradient-bg hover:scale-105 px-6 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-purple-500/30 transition-all duration-300"
          >
            <span className="text-lg mr-2">➕</span>
            {t('marketList.createMarket')}
          </button>
        </div>
      </div>

      {markets.length === 0 ? (
        <div className="glass-strong rounded-2xl p-16 text-center">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-xl text-gray-400">{t('marketList.noMarkets')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {markets.map((market, index) => (
            <div
              key={market.id}
              className="glass-strong rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
              onClick={() => onSelectMarket(market)}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center text-2xl shadow-lg">
                      💱
                    </div>
                    <div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        {market.loanTokenSymbol} / {market.collateralTokenSymbol}
                      </div>
                      <div className="text-sm text-gray-400 flex items-center space-x-2 mt-1">
                        <span>LLTV: {formatPercent(market.params.lltv)}</span>
                        {market.config?.enabled && (
                          <span className="gradient-accent px-2 py-0.5 rounded-full text-xs font-semibold">
                            ✓ {t('marketList.liquidationEnabled')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-400 mb-1 whitespace-nowrap">{t('marketList.totalSupply')}</div>
                  <div className="text-xl md:text-2xl font-bold text-green-400">
                    {formatAmount(market.market.totalSupplyAssets, market.loanTokenDecimals || 18)}
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      if (window.confirm(t('marketList.hideMarketConfirm'))) {
                        onHideMarket(market.id);
                      }
                    }}
                    className="mt-2 text-xs text-red-400 hover:text-red-300"
                  >
                    {t('marketList.hideMarket')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-white/10">
                <div className="text-center min-w-0">
                  <div className="text-xs text-gray-400 mb-2 flex items-center justify-center gap-1 whitespace-nowrap">
                    <span>📈</span>
                    <span>{t('marketList.totalBorrow')}</span>
                  </div>
                  <div className="text-base font-bold text-blue-400 truncate">{formatAmount(market.market.totalBorrowAssets, market.loanTokenDecimals || 18)}</div>
                </div>
                <div className="text-center min-w-0">
                  <div className="text-xs text-gray-400 mb-2 flex items-center justify-center gap-1 whitespace-nowrap">
                    <span>🔐</span>
                    <span>{t('marketList.totalCollateral')}</span>
                  </div>
                  <div className="text-base font-bold text-orange-400 truncate">{formatAmount(market.market.totalCollateral || 0n, market.collateralTokenDecimals || 18)}</div>
                </div>
                <div className="text-center min-w-0">
                  <div className="text-xs text-gray-400 mb-2 flex items-center justify-center gap-1 whitespace-nowrap">
                    <span>⚡</span>
                    <span>{t('marketList.utilization')}</span>
                  </div>
                  <div className="text-base font-bold text-purple-400">
                    {market.market.totalSupplyAssets > 0n
                      ? ((Number(market.market.totalBorrowAssets) / Number(market.market.totalSupplyAssets)) * 100).toFixed(2)
                      : '0.00'}%
                  </div>
                </div>
                <div className="text-center min-w-0">
                  <div className="text-xs text-gray-400 mb-2 flex items-center justify-center gap-1 whitespace-nowrap">
                    <span>🔒</span>
                    <span>{t('marketList.liquidationMode')}</span>
                  </div>
                  <div className={`text-base font-bold ${market.config?.publicLiquidationEnabled ? 'text-green-400' : 'text-yellow-400'}`}>
                    {market.config?.publicLiquidationEnabled ? t('marketList.public') : t('marketList.whitelist')}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex justify-end">
                <div className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center space-x-1">
                  <span>{t('marketList.clickForDetails')}</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
