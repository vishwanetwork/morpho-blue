import { useState, useCallback } from 'react';
import { Contract, JsonRpcSigner, JsonRpcProvider } from 'ethers';
import { ChainConfig, hasTieredLiquidation } from '../contracts/config';
import { MORPHO_ABI, TIERED_LIQUIDATION_ABI } from '../contracts/abis';
import { MarketParams, LiquidationRequest } from '../types';

export function useLiquidation(signer: JsonRpcSigner | null, chainConfig: ChainConfig | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProvider = useCallback((): JsonRpcProvider | null => {
    if (!chainConfig) return null;
    return new JsonRpcProvider(chainConfig.rpcUrls[0]);
  }, [chainConfig]);

  // === 直接 Morpho 清算（所有链都支持）===
  const liquidateDirect = useCallback(async (
    params: MarketParams,
    borrower: string,
    seizedAssets: bigint,
    repaidShares: bigint
  ) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig) throw new Error('未连接到支持的网络');
    setLoading(true);
    setError(null);
    try {
      const morpho = new Contract(chainConfig.contracts.MORPHO, MORPHO_ABI, signer);
      const tx = await morpho.liquidate(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        borrower, seizedAssets, repaidShares, '0x'
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清算失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  // === 查询健康因子（直接通过 Morpho 合约计算）===
  const getHealthFactorDirect = useCallback(async (params: MarketParams, borrower: string, marketId: string): Promise<bigint> => {
    const provider = getProvider();
    if (!provider || !chainConfig) throw new Error('未连接到支持的网络');

    const morpho = new Contract(chainConfig.contracts.MORPHO, [
      "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
      "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)"
    ], provider);

    const oracle = new Contract(params.oracle, ["function price() view returns (uint256)"], provider);

    const [position, marketData, price] = await Promise.all([
      morpho.position(marketId, borrower),
      morpho.market(marketId),
      oracle.price(),
    ]);

    const borrowShares = BigInt(position[1].toString());
    const collateral = BigInt(position[2].toString());
    const totalBorrowAssets = BigInt(marketData[2].toString());
    const totalBorrowShares = BigInt(marketData[3].toString());

    if (borrowShares === 0n) return 0n; // 无借款

    const ORACLE_PRICE_SCALE = 10n ** 36n;
    const WAD = 10n ** 18n;

    const borrowed = totalBorrowShares > 0n
      ? (borrowShares * totalBorrowAssets + totalBorrowShares - 1n) / totalBorrowShares
      : 0n;

    const maxBorrow = (collateral * price / ORACLE_PRICE_SCALE) * params.lltv / WAD;

    if (borrowed === 0n) return WAD * 1000n;
    return (maxBorrow * WAD) / borrowed;
  }, [getProvider, chainConfig]);

  // === 分级清算（仅 Pharos 等有 TieredLiquidation 的链）===
  const getHealthFactor = useCallback(async (params: MarketParams, borrower: string): Promise<bigint> => {
    const provider = getProvider();
    if (!provider || !chainConfig) throw new Error('未连接到支持的网络');

    if (hasTieredLiquidation(chainConfig) && chainConfig.contracts.TIERED_LIQUIDATION) {
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, provider);
      return await tieredLiq.getHealthFactor(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        borrower
      );
    }

    // Fallback: 无 TieredLiquidation，直接计算
    // 需要 marketId，但这里的接口不传 marketId，调用方需要用 getHealthFactorDirect
    throw new Error('此链不支持 TieredLiquidation，请使用直接清算');
  }, [getProvider, chainConfig]);

  const getLiquidationRequest = useCallback(async (marketId: string, borrower: string): Promise<LiquidationRequest | null> => {
    const provider = getProvider();
    if (!provider || !chainConfig || !hasTieredLiquidation(chainConfig) || !chainConfig.contracts.TIERED_LIQUIDATION) {
      return null;
    }

    try {
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, provider);
      const data = await tieredLiq.getLiquidationRequest(marketId, borrower);
      return {
        liquidator: data[0],
        requestTimestamp: BigInt(data[1].toString()),
        liquidationRatio: BigInt(data[2].toString()),
        depositAmount: BigInt(data[3].toString()),
        status: Number(data[4]),
        expiresAt: BigInt(data[5].toString()),
      };
    } catch {
      return null;
    }
  }, [getProvider, chainConfig]);

  // 通过 TieredLiquidation 执行一步式清算
  const liquidate = useCallback(async (
    params: MarketParams,
    borrower: string,
    seizedAssets: bigint,
    repaidShares: bigint
  ) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig) throw new Error('未连接到支持的网络');

    if (!hasTieredLiquidation(chainConfig) || !chainConfig.contracts.TIERED_LIQUIDATION) {
      // 回退到直接 Morpho 清算
      return liquidateDirect(params, borrower, seizedAssets, repaidShares);
    }

    setLoading(true);
    setError(null);
    try {
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, signer);
      const tx = await tieredLiq.liquidate(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        borrower, seizedAssets, repaidShares, '0x'
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清算失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig, liquidateDirect]);

  // 两步式：申请清算
  const requestLiquidation = useCallback(async (
    params: MarketParams,
    borrower: string,
    liquidationRatio: bigint,
    depositAmount: bigint
  ) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasTieredLiquidation(chainConfig) || !chainConfig.contracts.TIERED_LIQUIDATION) {
      throw new Error('此链不支持两步式清算');
    }

    setLoading(true);
    setError(null);
    try {
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, signer);
      const tx = await tieredLiq.requestLiquidation(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        borrower, liquidationRatio,
        { value: depositAmount }
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '申请清算失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  // 两步式：执行清算
  const executeLiquidation = useCallback(async (params: MarketParams, borrower: string) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasTieredLiquidation(chainConfig) || !chainConfig.contracts.TIERED_LIQUIDATION) {
      throw new Error('此链不支持两步式清算');
    }

    setLoading(true);
    setError(null);
    try {
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, signer);
      const tx = await tieredLiq.executeLiquidation(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        borrower, '0x'
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行清算失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  // 取消清算请求
  const cancelLiquidationRequest = useCallback(async (params: MarketParams, borrower: string) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasTieredLiquidation(chainConfig) || !chainConfig.contracts.TIERED_LIQUIDATION) {
      throw new Error('此链不支持两步式清算');
    }

    setLoading(true);
    setError(null);
    try {
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, signer);
      const tx = await tieredLiq.cancelLiquidationRequest(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        borrower
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消清算失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  return {
    loading,
    error,
    getHealthFactor,
    getHealthFactorDirect,
    getLiquidationRequest,
    liquidate,
    liquidateDirect,
    requestLiquidation,
    executeLiquidation,
    cancelLiquidationRequest,
  };
}
