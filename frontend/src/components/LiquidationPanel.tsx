import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketInfo, LiquidationRequest } from '../types';
import { parseUnits, parseEther, Contract, JsonRpcProvider, JsonRpcSigner } from 'ethers';
import { CustomSelect } from './CustomSelect';
import { ChainConfig, hasTieredLiquidation } from '../contracts/config';
import { TIERED_LIQUIDATION_ABI, ERC20_ABI, ORACLE_ABI } from '../contracts/abis';
import { formatAmount } from '../utils/format';

function parseLiquidationError(err: unknown, action: 'liquidate' | 'request' | 'execute' | 'direct', t: (key: string) => string): string {
  const errorStr = err instanceof Error ? err.message : String(err);

  if (errorStr.includes('HEALTHY_POSITION') || errorStr.includes('healthy position')) {
    return t('errors.healthyNoLiquidation');
  }
  if (errorStr.includes('MarketNotConfigured') || errorStr.includes('market not configured')) {
    return t('errors.marketNotConfigured');
  }
  if (errorStr.includes('PublicLiquidationNotEnabled')) {
    return t('errors.publicLiquidationNotEnabled');
  }
  if (errorStr.includes('TwoStepLiquidationNotEnabled')) {
    return t('errors.twoStepNotEnabled');
  }
  if (errorStr.includes('WhitelistOneStepNotEnabled')) {
    return t('errors.whitelistOneStepNotEnabled');
  }
  if (errorStr.includes('LiquidationRequestLocked')) {
    return t('errors.requestLocked');
  }
  if (errorStr.includes('NoPendingRequest')) {
    return t('errors.noPendingRequest');
  }
  if (errorStr.includes('LockNotExpired')) {
    return t('errors.lockNotExpired');
  }
  if (errorStr.includes('InsufficientCollateral')) {
    return t('errors.insufficientCollateralLiq');
  }
  if (errorStr.includes('BelowMinimumSeized')) {
    return t('errors.belowMinimum');
  }
  if (errorStr.includes('InsufficientDeposit')) {
    return t('errors.insufficientDeposit');
  }
  if (errorStr.includes('CooldownNotElapsed')) {
    return t('errors.cooldownNotElapsed');
  }
  if (errorStr.includes('UNAUTHORIZED') || errorStr.includes('unauthorized')) {
    return t('errors.unauthorizedLiq');
  }
  if (errorStr.includes('user rejected') || errorStr.includes('User denied')) {
    return t('errors.txCancelled');
  }
  if (errorStr.includes('CALL_EXCEPTION') || errorStr.includes('missing revert data')) {
    switch (action) {
      case 'liquidate':
      case 'direct':
        return t('errors.liquidateFailed');
      case 'request':
        return t('errors.requestFailed');
      case 'execute':
        return t('errors.executeFailed');
      default:
        return t('errors.txFailed');
    }
  }
  if (errorStr.length > 100) {
    return `${t('errors.operationFailed').replace('{{error}}', errorStr.substring(0, 100) + '...')}`;
  }
  return `${t('errors.operationFailed').replace('{{error}}', errorStr)}`;
}

interface LiquidationPanelProps {
  markets: MarketInfo[];
  address: string | null;
  signer: JsonRpcSigner | null;
  chainConfig: ChainConfig | null;
  onLiquidate: (market: MarketInfo, borrower: string, seizedAssets: bigint) => Promise<void>;
  onLiquidateDirect: (market: MarketInfo, borrower: string, seizedAssets: bigint) => Promise<void>;
  onRequestLiquidation: (market: MarketInfo, borrower: string, ratio: bigint, deposit: bigint) => Promise<void>;
  onExecuteLiquidation: (market: MarketInfo, borrower: string) => Promise<void>;
  onCancelLiquidation: (market: MarketInfo, borrower: string) => Promise<void>;
}

export function LiquidationPanel({
  markets,
  address,
  signer,
  chainConfig,
  onLiquidate,
  onLiquidateDirect,
  onRequestLiquidation,
  onExecuteLiquidation,
  onCancelLiquidation: _onCancelLiquidation,
}: LiquidationPanelProps) {
  const { t, i18n } = useTranslation();
  const [selectedMarket, setSelectedMarket] = useState<MarketInfo | null>(null);
  const [borrower, setBorrower] = useState('');
  const [amount, setAmount] = useState('');
  const [ratio, setRatio] = useState('0.5');
  const [deposit, setDeposit] = useState('0.01');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthFactor, setHealthFactor] = useState<bigint | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [loanTokenBalance, setLoanTokenBalance] = useState<bigint>(0n);
  const [loanTokenAllowance, setLoanTokenAllowance] = useState<bigint>(0n);
  const [estimatedRepayAmount, setEstimatedRepayAmount] = useState<bigint>(0n);
  const [approving, setApproving] = useState(false);

  const [borrowerCollateral, setBorrowerCollateral] = useState<bigint>(0n);
  const [borrowerDebt, setBorrowerDebt] = useState<bigint>(0n);
  const [oraclePrice, setOraclePrice] = useState<bigint>(0n);
  const [maxSeizableCollateral, setMaxSeizableCollateral] = useState<bigint>(0n);

  const [liquidationRequest, setLiquidationRequest] = useState<LiquidationRequest | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supportsTiered = chainConfig ? hasTieredLiquidation(chainConfig) : false;
  const nativeSymbol = chainConfig?.nativeCurrency.symbol || 'ETH';

  const ORACLE_PRICE_SCALE = 10n ** 36n;
  const WAD = 10n ** 18n;

  const getProvider = useCallback((): JsonRpcProvider | null => {
    if (!chainConfig) return null;
    return new JsonRpcProvider(chainConfig.rpcUrls[0]);
  }, [chainConfig]);

  const formatCountdown = useCallback((seconds: number): string => {
    if (seconds <= 0) return t('countdown.expired');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}${t('countdown.hours')}`);
    if (m > 0 || h > 0) parts.push(`${m.toString().padStart(2, '0')}${t('countdown.minutes')}`);
    parts.push(`${s.toString().padStart(2, '0')}${t('countdown.seconds')}`);
    return parts.join('');
  }, [t]);

  const fetchLiquidationRequest = useCallback(async () => {
    if (!selectedMarket || !borrower || !supportsTiered || !chainConfig?.contracts.TIERED_LIQUIDATION) {
      setLiquidationRequest(null);
      setCountdown('');
      setIsExpired(false);
      return;
    }
    try {
      const provider = getProvider();
      if (!provider) return;
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, provider);
      const data = await tieredLiq.getLiquidationRequest(selectedMarket.id, borrower);
      const req: LiquidationRequest = {
        liquidator: data[0],
        requestTimestamp: BigInt(data[1].toString()),
        liquidationRatio: BigInt(data[2].toString()),
        depositAmount: BigInt(data[3].toString()),
        status: Number(data[4]),
        expiresAt: BigInt(data[5].toString()),
      };
      if (req.status === 1 && req.expiresAt > 0n) {
        setLiquidationRequest(req);
      } else {
        setLiquidationRequest(null);
        setCountdown('');
        setIsExpired(false);
      }
    } catch {
      setLiquidationRequest(null);
    }
  }, [selectedMarket, borrower, supportsTiered, chainConfig, getProvider]);

  useEffect(() => {
    fetchLiquidationRequest();
  }, [fetchLiquidationRequest]);

  useEffect(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (!liquidationRequest || liquidationRequest.expiresAt === 0n) {
      setCountdown('');
      setIsExpired(false);
      return;
    }
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(liquidationRequest.expiresAt) - now;
      if (remaining <= 0) {
        setCountdown(t('countdown.expired'));
        setIsExpired(true);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      } else {
        setCountdown(formatCountdown(remaining));
        setIsExpired(false);
      }
    };
    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 1000);
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [liquidationRequest, formatCountdown, t]);

  useEffect(() => {
    const fetchBalanceAndAllowance = async () => {
      if (!selectedMarket || !address || !chainConfig) return;
      try {
        const provider = getProvider();
        if (!provider) return;
        const loanToken = new Contract(selectedMarket.params.loanToken, ERC20_ABI, provider);
        const approvalTarget = supportsTiered && chainConfig.contracts.TIERED_LIQUIDATION
          ? chainConfig.contracts.TIERED_LIQUIDATION
          : chainConfig.contracts.MORPHO;
        const [balance, allowance] = await Promise.all([
          loanToken.balanceOf(address),
          loanToken.allowance(address, approvalTarget),
        ]);
        setLoanTokenBalance(balance);
        setLoanTokenAllowance(allowance);
      } catch (err) {
        console.error('Failed to fetch balance/allowance:', err);
      }
    };
    fetchBalanceAndAllowance();
  }, [selectedMarket, address, chainConfig, supportsTiered, getProvider]);

  useEffect(() => {
    const calculateEstimatedRepay = async () => {
      if (!selectedMarket || !amount || !healthFactor || healthFactor === 0n) {
        setEstimatedRepayAmount(0n);
        return;
      }
      try {
        const provider = getProvider();
        if (!provider) return;
        const oracle = new Contract(selectedMarket.params.oracle, ORACLE_ABI, provider);
        const price = await oracle.price();
        const collateralDecimals = selectedMarket.collateralTokenDecimals || 18;
        const seizedAssets = parseUnits(amount, collateralDecimals);
        const seizedValue = seizedAssets * price / ORACLE_PRICE_SCALE;
        const estimated = seizedValue * 12n / 10n;
        setEstimatedRepayAmount(estimated);
      } catch {
        // ignore
      }
    };
    calculateEstimatedRepay();
  }, [selectedMarket, amount, healthFactor, getProvider]);

  const handleApprove = async () => {
    if (!selectedMarket || !signer || !chainConfig) return;
    setApproving(true);
    setError(null);
    try {
      const loanToken = new Contract(selectedMarket.params.loanToken, ERC20_ABI, signer);
      const maxAmount = 2n ** 255n;
      const approvalTarget = supportsTiered && chainConfig.contracts.TIERED_LIQUIDATION
        ? chainConfig.contracts.TIERED_LIQUIDATION
        : chainConfig.contracts.MORPHO;
      const tx = await loanToken.approve(approvalTarget, maxAmount);
      await tx.wait();
      setLoanTokenAllowance(maxAmount);
    } catch {
      setError(t('errors.approveFailed'));
    } finally {
      setApproving(false);
    }
  };

  const checkHealthFactor = async () => {
    if (!selectedMarket || !borrower || !chainConfig) {
      setError(t('admin.selectMarketAndAddress'));
      return;
    }
    setCheckingHealth(true);
    setError(null);
    try {
      const provider = getProvider();
      if (!provider) return;

      const morpho = new Contract(chainConfig.contracts.MORPHO, [
        "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
        "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)"
      ], provider);
      const oracle = new Contract(selectedMarket.params.oracle, ORACLE_ABI, provider);

      let hf: bigint;
      const params = selectedMarket.params;

      if (supportsTiered && chainConfig.contracts.TIERED_LIQUIDATION) {
        const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, provider);
        const [hfResult, position, marketData, price, config] = await Promise.all([
          tieredLiq.getHealthFactor(
            [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
            borrower
          ),
          morpho.position(selectedMarket.id, borrower),
          morpho.market(selectedMarket.id),
          oracle.price(),
          tieredLiq.marketConfigs(selectedMarket.id),
        ]);
        hf = hfResult;
        setOraclePrice(price);

        const collateral = position[2];
        const borrowShares = position[1];
        const totalBorrowAssets = marketData[2];
        const totalBorrowShares = marketData[3];
        const debt = totalBorrowShares > 0n
          ? (BigInt(borrowShares) * BigInt(totalBorrowAssets)) / BigInt(totalBorrowShares)
          : 0n;
        setBorrowerCollateral(BigInt(collateral));
        setBorrowerDebt(debt);

        const maxLiqRatio = config.maxLiquidationRatio || WAD;
        setMaxSeizableCollateral(BigInt(collateral) * BigInt(maxLiqRatio) / WAD);
      } else {
        const [position, marketData, price] = await Promise.all([
          morpho.position(selectedMarket.id, borrower),
          morpho.market(selectedMarket.id),
          oracle.price(),
        ]);
        setOraclePrice(price);

        const borrowShares = BigInt(position[1].toString());
        const collateral = BigInt(position[2].toString());
        const totalBorrowAssets = BigInt(marketData[2].toString());
        const totalBorrowShares = BigInt(marketData[3].toString());

        setBorrowerCollateral(collateral);

        if (borrowShares === 0n) {
          hf = 0n;
          setBorrowerDebt(0n);
          setMaxSeizableCollateral(collateral);
        } else {
          const borrowed = (borrowShares * totalBorrowAssets + totalBorrowShares - 1n) / totalBorrowShares;
          const maxBorrow = (collateral * price / ORACLE_PRICE_SCALE) * params.lltv / WAD;
          hf = borrowed > 0n ? (maxBorrow * WAD) / borrowed : WAD * 1000n;
          setBorrowerDebt(borrowed);
          setMaxSeizableCollateral(collateral);
        }
      }

      setHealthFactor(hf);

      if (hf === 0n) {
        setError(t('liquidation.noPosition'));
      } else if (hf >= parseUnits('1', 18)) {
        setError(t('liquidation.healthyPosition', { hf: formatAmount(hf, 18) }));
      }
    } catch (err) {
      console.error('Check health factor failed:', err);
      setError(t('liquidation.healthCheckFailed'));
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleLiquidate = async () => {
    if (!selectedMarket || !borrower || !amount) {
      setError(t('createMarket.fillAllFields'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const collateralDecimals = selectedMarket.collateralTokenDecimals || 18;
      const seizedAssets = parseUnits(amount, collateralDecimals);

      if (supportsTiered) {
        const provider = getProvider();
        if (provider && chainConfig?.contracts.TIERED_LIQUIDATION) {
          const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, provider);
          const params = selectedMarket.params;
          const hf = await tieredLiq.getHealthFactor(
            [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
            borrower
          );
          if (hf === 0n) {
            setError(t('liquidation.noPositionCannotLiquidate'));
            setLoading(false);
            return;
          }
          if (hf >= parseUnits('1', 18)) {
            setError(t('liquidation.healthyCannotLiquidate', { hf: formatAmount(hf, 18) }));
            setLoading(false);
            return;
          }
        }
        await onLiquidate(selectedMarket, borrower, seizedAssets);
      } else {
        await onLiquidateDirect(selectedMarket, borrower, seizedAssets);
      }
    } catch (err) {
      console.error('Liquidation failed:', err);
      setError(parseLiquidationError(err, supportsTiered ? 'liquidate' : 'direct', t));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestLiquidation = async () => {
    if (!selectedMarket || !borrower) {
      setError(t('createMarket.fillAllFields'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ratioWad = parseUnits(ratio, 18);
      const depositWei = parseEther(deposit);
      await onRequestLiquidation(selectedMarket, borrower, ratioWad, depositWei);
      await fetchLiquidationRequest();
    } catch (err) {
      setError(parseLiquidationError(err, 'request', t));
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteLiquidation = async () => {
    if (!selectedMarket || !borrower) {
      setError(t('createMarket.fillAllFields'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onExecuteLiquidation(selectedMarket, borrower);
      setLiquidationRequest(null);
      setCountdown('');
      setIsExpired(false);
    } catch (err) {
      setError(parseLiquidationError(err, 'execute', t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">
        {t('liquidation.title')}
        {chainConfig && (
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({chainConfig.shortName} · {supportsTiered ? t('liquidation.tieredAndDirect') : t('liquidation.directOnly')})
          </span>
        )}
      </h2>

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('liquidation.selectMarket')}</label>
        <CustomSelect
          value={selectedMarket?.id || ''}
          onChange={(value) => setSelectedMarket(markets.find((m) => m.id === value) || null)}
          options={[
            { value: '', label: t('liquidation.selectMarket') },
            ...markets.map((m) => ({
              value: m.id,
              label: `${m.loanTokenSymbol} / ${m.collateralTokenSymbol}`
            }))
          ]}
          placeholder={t('liquidation.selectMarket')}
        />
      </div>

      <div className={`grid grid-cols-1 ${supportsTiered ? 'lg:grid-cols-2' : ''} gap-6`}>
        <div className="glass rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4 flex items-center">
            <span className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center mr-2 text-sm">⚡</span>
            {supportsTiered ? t('liquidation.oneStepLiquidation') : t('liquidation.directLiquidationMorpho')}
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            {supportsTiered
              ? t('liquidation.oneStepDesc')
              : t('liquidation.directDesc')}
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={borrower}
              onChange={(e) => setBorrower(e.target.value)}
              placeholder={t('liquidation.borrowerAddress')}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
            />
            <button
              onClick={checkHealthFactor}
              disabled={checkingHealth || !selectedMarket || !borrower}
              className="w-full bg-blue-500 hover:bg-blue-600 py-2 rounded-lg font-medium disabled:opacity-50 text-sm"
            >
              {checkingHealth ? t('liquidation.checking') : t('liquidation.checkHealthFactor')}
            </button>

            {healthFactor !== null && (
              <div className={`p-3 rounded-lg text-sm ${
                healthFactor === 0n
                  ? 'bg-gray-700 text-gray-300'
                  : healthFactor >= parseUnits('1', 18)
                    ? 'bg-green-900/50 text-green-300'
                    : 'bg-red-900/50 text-red-300'
              }`}>
                <div className="font-medium mb-2">
                  {t('liquidation.healthFactor', { value: healthFactor === 0n ? t('liquidation.noBorrowPosition') : formatAmount(healthFactor, 18) })}
                  {healthFactor > 0n && healthFactor < parseUnits('1', 18) && ` ✅ ${t('liquidation.canLiquidate')}`}
                  {healthFactor >= parseUnits('1', 18) && ` ❌ ${t('liquidation.cannotLiquidate')}`}
                </div>

                {borrowerCollateral > 0n && selectedMarket && (
                  <div className="mt-2 pt-2 border-t border-gray-600 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>{t('liquidation.collateral')}</span>
                      <span className="text-white">{formatAmount(borrowerCollateral, selectedMarket.collateralTokenDecimals || 18)} {selectedMarket.collateralTokenSymbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('liquidation.debt')}</span>
                      <span className="text-white">{formatAmount(borrowerDebt, selectedMarket.loanTokenDecimals || 18)} {selectedMarket.loanTokenSymbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('liquidation.maxSeizable')}</span>
                      <span className="text-yellow-400">{formatAmount(maxSeizableCollateral, selectedMarket.collateralTokenDecimals || 18)} {selectedMarket.collateralTokenSymbol}</span>
                    </div>
                    {oraclePrice > 0n && (
                      <div className="flex justify-between">
                        <span>{t('liquidation.oraclePrice')}</span>
                        <span className="text-blue-400">1 {selectedMarket.collateralTokenSymbol} = {formatAmount(
                          oraclePrice / (10n ** BigInt(36 - (selectedMarket.collateralTokenDecimals || 18))),
                          selectedMarket.loanTokenDecimals || 18
                        )} {selectedMarket.loanTokenSymbol}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400">
                  {t('liquidation.seizeAmount', { symbol: selectedMarket?.collateralTokenSymbol || '' })}
                </label>
                {maxSeizableCollateral > 0n && selectedMarket && (
                  <button
                    onClick={() => setAmount(formatAmount(maxSeizableCollateral, selectedMarket.collateralTokenDecimals || 18))}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {t('common.max')}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={maxSeizableCollateral > 0n && selectedMarket
                  ? `${t('common.max')} ${formatAmount(maxSeizableCollateral, selectedMarket.collateralTokenDecimals || 18)}`
                  : t('liquidation.queryFirst')
                }
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
              />
            </div>

            {selectedMarket && amount && estimatedRepayAmount > 0n && (
              <div className="p-3 bg-gray-800 rounded-lg text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('liquidation.estimatedRepay')}</span>
                  <span className="text-yellow-400 font-medium">
                    ~{formatAmount(estimatedRepayAmount, selectedMarket.loanTokenDecimals || 18)} {selectedMarket.loanTokenSymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('liquidation.yourBalance')}</span>
                  <span className={loanTokenBalance >= estimatedRepayAmount ? 'text-green-400' : 'text-red-400'}>
                    {formatAmount(loanTokenBalance, selectedMarket.loanTokenDecimals || 18)} {selectedMarket.loanTokenSymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('liquidation.approvedAllowance')}</span>
                  <span className={loanTokenAllowance >= estimatedRepayAmount ? 'text-green-400' : 'text-red-400'}>
                    {loanTokenAllowance >= 2n ** 200n ? t('common.unlimited') : formatAmount(loanTokenAllowance, selectedMarket.loanTokenDecimals || 18)}
                  </span>
                </div>
                {loanTokenBalance < estimatedRepayAmount && (
                  <div className="text-red-400 text-xs">
                    {t('liquidation.insufficientBalanceWarning', { symbol: selectedMarket.loanTokenSymbol })}
                  </div>
                )}
                {loanTokenAllowance < estimatedRepayAmount && loanTokenBalance >= estimatedRepayAmount && (
                  <div className="text-yellow-400 text-xs">
                    {t('liquidation.needApproval', { symbol: selectedMarket.loanTokenSymbol, target: supportsTiered ? 'TieredLiquidation' : 'Morpho' })}
                  </div>
                )}
              </div>
            )}

            {selectedMarket && loanTokenAllowance < estimatedRepayAmount && estimatedRepayAmount > 0n && (
              <button
                onClick={handleApprove}
                disabled={approving || !address || !signer}
                className="w-full bg-purple-500 hover:bg-purple-600 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {approving ? t('liquidation.approving') : t('liquidation.approve', { symbol: selectedMarket.loanTokenSymbol })}
              </button>
            )}

            <button
              onClick={handleLiquidate}
              disabled={loading || !address || (estimatedRepayAmount > 0n && (loanTokenAllowance < estimatedRepayAmount || loanTokenBalance < estimatedRepayAmount))}
              className="w-full bg-orange-500 hover:bg-orange-600 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? t('common.processing') : t('liquidation.executeLiquidation')}
            </button>
          </div>
        </div>

        {supportsTiered && (
          <div className="glass rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4 flex items-center">
              <span className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-2 text-sm">2</span>
              {t('liquidation.twoStepLiquidation')}
            </h3>
            <p className="text-gray-400 text-sm mb-4">{t('liquidation.twoStepDesc')}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('liquidation.borrowerAddress')}</label>
                <input
                  type="text"
                  value={borrower}
                  onChange={(e) => setBorrower(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {t('liquidation.liquidationRatio')}
                  <span className="text-gray-500 ml-1">· {t('liquidation.liquidationRatioHint')}</span>
                </label>
                <input
                  type="text"
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                  placeholder="0.5"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
                />
                {borrowerDebt > 0n && selectedMarket && ratio && (
                  <div className="text-xs text-blue-400 mt-1">
                    {t('liquidation.estimatedDebt')} {formatAmount(borrowerDebt * BigInt(Math.floor(parseFloat(ratio) * 1000)) / 1000n, selectedMarket.loanTokenDecimals || 18)} {selectedMarket.loanTokenSymbol}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {t('liquidation.depositLabel', { symbol: nativeSymbol })}
                  <span className="text-gray-500 ml-1">· {t('liquidation.depositHint')}</span>
                </label>
                <input
                  type="text"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="0.01"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2"
                />
              </div>

              <div className="p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400 space-y-1">
                <div>📋 <span className="text-yellow-400">{t('liquidation.stepApply').split(':')[0]}</span>: {t('liquidation.stepApply').split(':').slice(1).join(':').trim()}</div>
                <div>⏳ <span className="text-gray-300">{t('liquidation.stepWait').split(':')[0]}</span>: {t('liquidation.stepWait').split(':').slice(1).join(':').trim()}</div>
                <div>✅ <span className="text-red-400">{t('liquidation.stepExecute').split(':')[0]}</span>: {t('liquidation.stepExecute').split(':').slice(1).join(':').trim()}</div>
              </div>

              {liquidationRequest && countdown && (
                <div className={`p-4 rounded-lg border ${
                  isExpired
                    ? 'bg-red-900/40 border-red-500/60'
                    : 'bg-gradient-to-r from-blue-900/40 to-purple-900/40 border-blue-500/60'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-300">⏱️ {t('liquidation.executionWindow')}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isExpired ? 'bg-red-500/30 text-red-300' : 'bg-green-500/30 text-green-300'
                    }`}>
                      {isExpired ? t('common.expired') : t('common.inProgress')}
                    </span>
                  </div>
                  <div className={`text-2xl font-bold font-mono text-center py-2 ${
                    isExpired ? 'text-red-400' : 'text-blue-300'
                  }`}>
                    {countdown}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 space-y-1">
                    <div className="flex justify-between">
                      <span>{t('liquidation.applicant')}</span>
                      <span className="text-gray-400 font-mono">{liquidationRequest.liquidator.slice(0, 6)}...{liquidationRequest.liquidator.slice(-4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('liquidation.expiresAt')}</span>
                      <span className="text-gray-400">{new Date(Number(liquidationRequest.expiresAt) * 1000).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('liquidation.deposit')}</span>
                      <span className="text-gray-400">{formatAmount(liquidationRequest.depositAmount, 18)} {nativeSymbol}</span>
                    </div>
                  </div>
                  {isExpired && (
                    <div className="mt-2 text-xs text-red-400">
                      {t('liquidation.requestExpired')}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleRequestLiquidation}
                  disabled={loading || !address}
                  className="bg-yellow-500 hover:bg-yellow-600 py-2 rounded-lg font-medium text-black disabled:opacity-50"
                >
                  {loading ? t('common.processing') : t('liquidation.requestLiquidation')}
                </button>
                <button
                  onClick={handleExecuteLiquidation}
                  disabled={loading || !address || isExpired}
                  className="bg-red-500 hover:bg-red-600 py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  {loading ? t('common.processing') : t('liquidation.executeLiquidation')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!supportsTiered && (
        <div className="mt-6 glass rounded-xl p-6 border border-blue-700/50">
          <h3 className="text-lg font-bold mb-3 text-blue-400">💡 {t('liquidation.directLiquidationInfo')}</h3>
          <div className="text-sm text-gray-300 space-y-2">
            <p>{t('liquidation.directInfoChain', { chain: chainConfig?.shortName || '' })}</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>{t('liquidation.directInfoPoint1')}</li>
              <li>{t('liquidation.directInfoPoint2')}</li>
              <li>{t('liquidation.directInfoPoint3')}</li>
              <li>{t('liquidation.directInfoPoint4')}</li>
            </ul>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
