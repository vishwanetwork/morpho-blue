import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketInfo } from '../types';
import { formatAmount, formatPercent } from '../utils/format';
import { parseUnits, Contract, JsonRpcProvider } from 'ethers';
import { ChainConfig } from '../contracts/config';
import { ERC20_ABI, ORACLE_ABI } from '../contracts/abis';

function parseContractError(err: unknown, operation: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const errorStr = err instanceof Error ? err.message : String(err);

  if (errorStr.includes('INSUFFICIENT_COLLATERAL')) {
    return t('errors.insufficientCollateral');
  }
  if (errorStr.includes('INSUFFICIENT_LIQUIDITY')) {
    return t('errors.insufficientLiquidity');
  }
  if (errorStr.includes('HEALTHY_POSITION')) {
    return t('errors.healthyPosition');
  }
  if (errorStr.includes('UNAUTHORIZED')) {
    return t('errors.unauthorized');
  }
  if (errorStr.includes('user rejected') || errorStr.includes('User denied')) {
    return t('errors.txCancelled');
  }
  if (errorStr.includes('CALL_EXCEPTION') || errorStr.includes('missing revert data')) {
    switch (operation) {
      case 'borrow':
        return t('errors.borrowFailed');
      case 'withdraw':
        return t('errors.withdrawFailed');
      case 'withdrawCollateral':
        return t('errors.withdrawCollateralFailed');
      case 'repay':
        return t('errors.repayFailed');
      default:
        return t('errors.txFailed');
    }
  }
  if (errorStr.length > 100) {
    return t('errors.operationFailed', { error: errorStr.substring(0, 100) + '...' });
  }
  return t('errors.operationFailed', { error: errorStr });
}

interface OperationModalProps {
  market: MarketInfo;
  userAddress: string;
  chainConfig: ChainConfig | null;
  onClose: () => void;
  onSuccess?: () => Promise<void>;
  onApprove: (tokenAddress: string, amount: bigint) => Promise<void>;
  onSupply: (assets: bigint) => Promise<void>;
  onWithdraw: (assets: bigint) => Promise<void>;
  onSupplyCollateral: (assets: bigint) => Promise<void>;
  onWithdrawCollateral: (assets: bigint) => Promise<void>;
  onBorrow: (assets: bigint) => Promise<void>;
  onRepay: (assets: bigint) => Promise<void>;
}

type OperationType = 'supply' | 'withdraw' | 'supplyCollateral' | 'withdrawCollateral' | 'borrow' | 'repay';

export function OperationModal({
  market,
  userAddress,
  chainConfig,
  onClose,
  onSuccess,
  onApprove,
  onSupply,
  onWithdraw,
  onSupplyCollateral,
  onWithdrawCollateral,
  onBorrow,
  onRepay,
}: OperationModalProps) {
  const { t } = useTranslation();
  const [operation, setOperation] = useState<OperationType>('supply');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loanBalance, setLoanBalance] = useState<bigint>(0n);
  const [collateralBalance, setCollateralBalance] = useState<bigint>(0n);
  const [loanAllowance, setLoanAllowance] = useState<bigint>(0n);
  const [collateralAllowance, setCollateralAllowance] = useState<bigint>(0n);
  const [userCollateral, setUserCollateral] = useState<bigint>(0n);
  const [userBorrowShares, setUserBorrowShares] = useState<bigint>(0n);
  const [oraclePrice, setOraclePrice] = useState<bigint>(0n);

  const loanDecimals = market.loanTokenDecimals || 18;
  const collateralDecimals = market.collateralTokenDecimals || 18;

  const availableLiquidity = market.market.totalSupplyAssets - market.market.totalBorrowAssets;

  const rpcUrl = chainConfig?.rpcUrls[0] || 'https://atlantic.dplabs-internal.com';
  const morphoAddress = chainConfig?.contracts.MORPHO || '';
  const provider = new JsonRpcProvider(rpcUrl);

  const userBorrowAssets = market.market.totalBorrowShares > 0n
    ? (userBorrowShares * market.market.totalBorrowAssets) / market.market.totalBorrowShares
    : 0n;

  const ORACLE_PRICE_SCALE = 10n ** 36n;
  const WAD = 10n ** 18n;
  const maxBorrowTotal = oraclePrice > 0n
    ? (userCollateral * oraclePrice / ORACLE_PRICE_SCALE) * market.params.lltv / WAD
    : 0n;
  const maxBorrowRemaining = maxBorrowTotal > userBorrowAssets ? maxBorrowTotal - userBorrowAssets : 0n;

  useEffect(() => {
    const fetchBalances = async () => {
      if (!morphoAddress) return;
      try {
        const loanToken = new Contract(market.params.loanToken, ERC20_ABI, provider);
        const collateralToken = new Contract(market.params.collateralToken, ERC20_ABI, provider);
        const morpho = new Contract(morphoAddress, [
          "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)"
        ], provider);
        const oracle = new Contract(market.params.oracle, ORACLE_ABI, provider);

        const [lb, cb, la, ca, position, price] = await Promise.all([
          loanToken.balanceOf(userAddress),
          collateralToken.balanceOf(userAddress),
          loanToken.allowance(userAddress, morphoAddress),
          collateralToken.allowance(userAddress, morphoAddress),
          morpho.position(market.id, userAddress),
          oracle.price(),
        ]);

        setLoanBalance(lb);
        setCollateralBalance(cb);
        setLoanAllowance(la);
        setCollateralAllowance(ca);
        setUserCollateral(position[2]);
        setUserBorrowShares(position[1]);
        setOraclePrice(price);
      } catch (err) {
        console.error('Failed to fetch balances:', err);
      }
    };

    fetchBalances();
  }, [market, userAddress, morphoAddress]);

  const isLoanOperation = ['supply', 'withdraw', 'borrow', 'repay'].includes(operation);
  const needsApproval = ['supply', 'supplyCollateral', 'repay'].includes(operation);
  const currentDecimals = isLoanOperation ? loanDecimals : collateralDecimals;
  const currentBalance = isLoanOperation ? loanBalance : collateralBalance;
  const currentAllowance = isLoanOperation ? loanAllowance : collateralAllowance;
  const currentSymbol = isLoanOperation ? market.loanTokenSymbol : market.collateralTokenSymbol;

  const inputAmount = amount ? parseUnits(amount, currentDecimals) : 0n;
  const needsMoreAllowance = needsApproval && inputAmount > currentAllowance;
  const insufficientBalance = needsApproval && inputAmount > currentBalance;

  const operationList: { key: OperationType; labelKey: string; color: string }[] = [
    { key: 'supply', labelKey: 'operations.supply', color: 'bg-green-600' },
    { key: 'withdraw', labelKey: 'operations.withdraw', color: 'bg-blue-600' },
    { key: 'supplyCollateral', labelKey: 'operations.supplyCollateral', color: 'bg-purple-600' },
    { key: 'withdrawCollateral', labelKey: 'operations.withdrawCollateral', color: 'bg-indigo-600' },
    { key: 'borrow', labelKey: 'operations.borrow', color: 'bg-orange-600' },
    { key: 'repay', labelKey: 'operations.repay', color: 'bg-red-600' },
  ];

  const currentOp = operationList.find((o) => o.key === operation);
  const currentLabel = currentOp ? t(currentOp.labelKey) : '';

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError(t('operations.enterValidAmount'));
      return;
    }
    if (needsApproval && inputAmount > currentBalance) {
      setError(t('operations.insufficientBalanceShort', { amount, symbol: currentSymbol }));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isLoanOp = ['supply', 'withdraw', 'borrow', 'repay'].includes(operation);
      const decimals = isLoanOp ? loanDecimals : collateralDecimals;
      const assets = parseUnits(amount, decimals);
      const tokenAddress = isLoanOp ? market.params.loanToken : market.params.collateralToken;
      const allowance = isLoanOp ? loanAllowance : collateralAllowance;

      if (needsApproval && assets > allowance) {
        await onApprove(tokenAddress, assets);
        if (isLoanOp) {
          setLoanAllowance(assets);
        } else {
          setCollateralAllowance(assets);
        }
      }

      switch (operation) {
        case 'supply': await onSupply(assets); break;
        case 'withdraw': await onWithdraw(assets); break;
        case 'supplyCollateral': await onSupplyCollateral(assets); break;
        case 'withdrawCollateral': await onWithdrawCollateral(assets); break;
        case 'borrow': await onBorrow(assets); break;
        case 'repay': await onRepay(assets); break;
      }
      onClose();
      if (onSuccess) {
        onSuccess().catch((e) => console.error('Refresh failed:', e));
      }
    } catch (err) {
      console.error('Operation failed:', err);
      setError(parseContractError(err, operation, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-600">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">
            {market.loanTokenSymbol} / {market.collateralTokenSymbol}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
            ×
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {operationList.map((op) => (
            <button
              key={op.key}
              onClick={() => setOperation(op.key)}
              className={`px-3 py-2 rounded-lg text-sm transition-all ${
                operation === op.key ? op.color : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {t(op.labelKey)}
            </button>
          ))}
        </div>

        <div className="mb-4 p-3 bg-gray-800 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">{t('operations.marketInfo')}</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>{t('operations.totalSupply')}: {formatAmount(market.market.totalSupplyAssets, loanDecimals)} {market.loanTokenSymbol}</div>
            <div>{t('operations.totalBorrow')}: {formatAmount(market.market.totalBorrowAssets, loanDecimals)} {market.loanTokenSymbol}</div>
            <div>{t('operations.totalCollateral')}: {formatAmount(market.market.totalCollateral || 0n, collateralDecimals)} {market.collateralTokenSymbol}</div>
            <div>LLTV: {formatPercent(market.params.lltv)}</div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            {t('operations.amount', { symbol: isLoanOperation ? market.loanTokenSymbol : market.collateralTokenSymbol })}
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-lg"
          />
          <div className="mt-2 text-sm space-y-1">
            <div className="flex justify-between text-gray-400">
              <span>{t('operations.walletBalance')}</span>
              <span className="text-white">{formatAmount(currentBalance, currentDecimals)} {currentSymbol}</span>
            </div>
          </div>
          {insufficientBalance && amount && (
            <div className="mt-2 text-sm text-red-400">
              {t('operations.insufficientBalance', { amount, symbol: currentSymbol, balance: formatAmount(currentBalance, currentDecimals) })}
            </div>
          )}
          {operation === 'borrow' && (
            <div className="mt-2 text-sm space-y-1">
              <div className="text-gray-400">
                {t('operations.availableLiquidity')} <span className="text-blue-400 font-medium">{formatAmount(availableLiquidity, loanDecimals)} {market.loanTokenSymbol}</span>
              </div>
              {userCollateral > 0n && oraclePrice > 0n && (
                <>
                  <div className="text-gray-400">
                    {t('operations.maxBorrow')} <span className="text-green-400 font-medium">{formatAmount(maxBorrowRemaining, loanDecimals)} {market.loanTokenSymbol}</span>
                    <span className="text-gray-500 ml-1">({t('operations.borrowed', { amount: formatAmount(userBorrowAssets, loanDecimals) })})</span>
                  </div>
                  {amount && parseFloat(amount) > 0 && (
                    (() => {
                      const borrowAmount = parseUnits(amount, loanDecimals);
                      const newTotalBorrow = userBorrowAssets + borrowAmount;
                      const collateralValue = userCollateral * oraclePrice / ORACLE_PRICE_SCALE;
                      const adjustedValue = collateralValue * market.params.lltv / WAD;
                      const healthFactor = newTotalBorrow > 0n ? (adjustedValue * WAD / newTotalBorrow) : WAD * 1000n;
                      const hfNumber = Number(healthFactor) / 1e18;
                      const isHealthy = hfNumber >= 1;
                      return (
                        <div className={`p-2 rounded ${isHealthy ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
                          <span className="text-gray-300">{t('operations.healthFactorAfterBorrow')} </span>
                          <span className={`font-bold ${isHealthy ? 'text-green-400' : 'text-red-400'}`}>
                            {hfNumber.toFixed(2)}
                          </span>
                          {!isHealthy && (
                            <span className="text-red-400 ml-2">⚠️ {t('operations.txWillFail')}</span>
                          )}
                        </div>
                      );
                    })()
                  )}
                </>
              )}
            </div>
          )}
          {operation === 'withdraw' && (
            <div className="mt-2 text-sm text-gray-400">
              {t('operations.availableLiquidity')} <span className="text-blue-400 font-medium">{formatAmount(availableLiquidity, loanDecimals)} {market.loanTokenSymbol}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || insufficientBalance}
          className={`w-full py-3 rounded-lg font-medium transition-all ${
            currentOp?.color
          } hover:opacity-90 disabled:opacity-50`}
        >
          {loading
            ? t('common.processing')
            : needsMoreAllowance
              ? t('operations.approveAnd', { operation: currentLabel })
              : currentLabel}
        </button>
      </div>
    </div>
  );
}
