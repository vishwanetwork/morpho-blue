import { useState, useCallback } from 'react';
import { Contract, JsonRpcSigner, JsonRpcProvider } from 'ethers';
import { ChainConfig, hasTieredLiquidation, hasWhitelistRegistry } from '../contracts/config';
import { WHITELIST_REGISTRY_ABI, TIERED_LIQUIDATION_ABI } from '../contracts/abis';

export function useAdmin(signer: JsonRpcSigner | null, chainConfig: ChainConfig | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProvider = useCallback((): JsonRpcProvider | null => {
    if (!chainConfig) return null;
    return new JsonRpcProvider(chainConfig.rpcUrls[0]);
  }, [chainConfig]);

  // Whitelist functions (仅在有 WhitelistRegistry 的链上可用)
  const addLiquidator = useCallback(async (marketId: string, liquidator: string) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasWhitelistRegistry(chainConfig) || !chainConfig.contracts.WHITELIST_REGISTRY) {
      throw new Error('此链不支持白名单管理');
    }
    setLoading(true);
    setError(null);
    try {
      const registry = new Contract(chainConfig.contracts.WHITELIST_REGISTRY, WHITELIST_REGISTRY_ABI, signer);
      const tx = await registry.addLiquidator(marketId, liquidator);
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加清算人失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  const removeLiquidator = useCallback(async (marketId: string, liquidator: string) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasWhitelistRegistry(chainConfig) || !chainConfig.contracts.WHITELIST_REGISTRY) {
      throw new Error('此链不支持白名单管理');
    }
    setLoading(true);
    setError(null);
    try {
      const registry = new Contract(chainConfig.contracts.WHITELIST_REGISTRY, WHITELIST_REGISTRY_ABI, signer);
      const tx = await registry.removeLiquidator(marketId, liquidator);
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除清算人失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  const getLiquidators = useCallback(async (marketId: string): Promise<string[]> => {
    const provider = getProvider();
    if (!provider || !chainConfig || !hasWhitelistRegistry(chainConfig) || !chainConfig.contracts.WHITELIST_REGISTRY) {
      return [];
    }
    const registry = new Contract(chainConfig.contracts.WHITELIST_REGISTRY, WHITELIST_REGISTRY_ABI, provider);
    return await registry.getLiquidators(marketId);
  }, [getProvider, chainConfig]);

  const setWhitelistMode = useCallback(async (marketId: string, enabled: boolean) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasWhitelistRegistry(chainConfig) || !chainConfig.contracts.WHITELIST_REGISTRY) {
      throw new Error('此链不支持白名单管理');
    }
    setLoading(true);
    setError(null);
    try {
      const registry = new Contract(chainConfig.contracts.WHITELIST_REGISTRY, WHITELIST_REGISTRY_ABI, signer);
      const tx = await registry.setWhitelistMode(marketId, enabled);
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置白名单模式失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  const initializeMarket = useCallback(async (marketId: string, admin: string) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasWhitelistRegistry(chainConfig) || !chainConfig.contracts.WHITELIST_REGISTRY) {
      throw new Error('此链不支持白名单管理');
    }
    setLoading(true);
    setError(null);
    try {
      const registry = new Contract(chainConfig.contracts.WHITELIST_REGISTRY, WHITELIST_REGISTRY_ABI, signer);
      const tx = await registry.initializeMarket(marketId, admin);
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化市场失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  // Market config (仅在有 TieredLiquidation 的链上可用)
  const configureMarket = useCallback(async (
    marketId: string,
    config: {
      enabled: boolean;
      maxLiquidationRatio: bigint;
      cooldownPeriod: bigint;
      minSeizedAssets: bigint;
      publicLiquidationEnabled: boolean;
      twoStepLiquidationEnabled: boolean;
      whitelistOneStepEnabled: boolean;
      lockDuration: bigint;
      requestDeposit: bigint;
      protocolFee: bigint;
    }
  ) => {
    if (!signer) throw new Error('请先连接钱包');
    if (!chainConfig || !hasTieredLiquidation(chainConfig) || !chainConfig.contracts.TIERED_LIQUIDATION) {
      throw new Error('此链不支持分级清算配置');
    }
    setLoading(true);
    setError(null);
    try {
      const tieredLiq = new Contract(chainConfig.contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, signer);
      const tx = await tieredLiq.configureMarket(
        marketId,
        config.enabled,
        config.maxLiquidationRatio,
        config.cooldownPeriod,
        config.minSeizedAssets,
        config.publicLiquidationEnabled,
        config.twoStepLiquidationEnabled,
        config.whitelistOneStepEnabled,
        config.lockDuration,
        config.requestDeposit,
        config.protocolFee
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '配置市场失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, chainConfig]);

  return {
    loading,
    error,
    addLiquidator,
    removeLiquidator,
    getLiquidators,
    setWhitelistMode,
    initializeMarket,
    configureMarket,
  };
}
