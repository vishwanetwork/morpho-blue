import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Contract, JsonRpcProvider } from 'ethers';
import { MarketInfo } from '../types';
import { MORPHO_ABI } from '../contracts/abis';
import { formatAmount, formatPercent } from '../utils/format';

interface UserPosition {
  market: MarketInfo;
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
  supplyAssets: bigint;
  borrowAssets: bigint;
}

interface UserPositionsProps {
  markets: MarketInfo[];
  userAddress: string | null;
  morphoAddress: string;
  provider: JsonRpcProvider;
  onSelectMarket: (market: MarketInfo) => void;
}

export function UserPositions({
  markets,
  userAddress,
  morphoAddress,
  provider,
  onSelectMarket,
}: UserPositionsProps) {
  const { t } = useTranslation();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userAddress || !morphoAddress || markets.length === 0) {
      setPositions([]);
      return;
    }

    let cancelled = false;

    const fetchPositions = async () => {
      setLoading(true);
      try {
        const morpho = new Contract(morphoAddress, MORPHO_ABI, provider);

        const results = await Promise.all(
          markets.map(async (market): Promise<UserPosition | null> => {
            try {
              const pos = await morpho.position(market.id, userAddress);
              const supplyShares = BigInt(pos[0].toString());
              const borrowShares = BigInt(pos[1].toString());
              const collateral = BigInt(pos[2].toString());

              if (supplyShares === 0n && borrowShares === 0n && collateral === 0n) {
                return null;
              }

              const supplyAssets = market.market.totalSupplyShares > 0n
                ? (supplyShares * market.market.totalSupplyAssets) / market.market.totalSupplyShares
                : 0n;

              const borrowAssets = market.market.totalBorrowShares > 0n
                ? (borrowShares * market.market.totalBorrowAssets) / market.market.totalBorrowShares
                : 0n;

              return {
                market,
                supplyShares,
                borrowShares,
                collateral,
                supplyAssets,
                borrowAssets,
              };
            } catch (e) {
              console.error('Failed to fetch position for market', market.id.slice(0, 10), e);
              return null;
            }
          })
        );

        if (!cancelled) {
          setPositions(results.filter((p): p is UserPosition => p !== null));
        }
      } catch (e) {
        console.error('Failed to fetch positions:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPositions();
    return () => { cancelled = true; };
  }, [markets, userAddress, morphoAddress, provider]);

  if (!userAddress) {
    return (
      <div className="glass-strong rounded-2xl p-16 text-center">
        <div className="text-6xl mb-4">🔌</div>
        <p className="text-xl text-gray-400">{t('alerts.connectWalletFirst')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-strong rounded-2xl p-16 text-center">
        <div className="animate-spin text-6xl mb-4">⏳</div>
        <p className="text-xl text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="glass-strong rounded-2xl p-16 text-center">
        <div className="text-6xl mb-4">📭</div>
        <p className="text-xl text-gray-400">{t('positions.noPositions')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
          {t('positions.title')}
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          {t('positions.subtitle', { count: positions.length }) || `${positions.length} active position(s)`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {positions.map((pos, index) => {
          const loanDec = pos.market.loanTokenDecimals || 18;
          const collDec = pos.market.collateralTokenDecimals || 18;

          return (
            <div
              key={pos.market.id}
              className="glass-strong rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
              onClick={() => onSelectMarket(pos.market)}
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center text-2xl shadow-lg">
                    💱
                  </div>
                  <div>
                    <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                      {pos.market.loanTokenSymbol} / {pos.market.collateralTokenSymbol}
                    </div>
                    <div className="text-sm text-gray-400 mt-0.5">
                      LLTV: {formatPercent(pos.market.params.lltv)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/10">
                {pos.supplyAssets > 0n && (
                  <div className="glass rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <span>💰</span>
                      <span>{t('positions.supplied') || 'Supplied'}</span>
                    </div>
                    <div className="text-lg font-bold text-green-400">
                      {formatAmount(pos.supplyAssets, loanDec)} {pos.market.loanTokenSymbol}
                    </div>
                  </div>
                )}

                {pos.collateral > 0n && (
                  <div className="glass rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <span>🔐</span>
                      <span>{t('positions.collateralDeposited') || 'Collateral'}</span>
                    </div>
                    <div className="text-lg font-bold text-orange-400">
                      {formatAmount(pos.collateral, collDec)} {pos.market.collateralTokenSymbol}
                    </div>
                  </div>
                )}

                {pos.borrowAssets > 0n && (
                  <div className="glass rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <span>📈</span>
                      <span>{t('positions.borrowed') || 'Borrowed'}</span>
                    </div>
                    <div className="text-lg font-bold text-red-400">
                      {formatAmount(pos.borrowAssets, loanDec)} {pos.market.loanTokenSymbol}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
                <div className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center space-x-1">
                  <span>{t('positions.manage') || 'Manage Position'}</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
