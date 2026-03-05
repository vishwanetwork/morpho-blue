import { useState, useCallback } from 'react';
import { Contract, JsonRpcSigner } from 'ethers';
import { ChainConfig } from '../contracts/config';
import { MORPHO_ABI, ERC20_ABI } from '../contracts/abis';
import { MarketParams } from '../types';

export function useOperations(signer: JsonRpcSigner | null, chainConfig: ChainConfig | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getMorphoAddress = useCallback((): string => {
    if (!chainConfig) throw new Error('未连接到支持的网络');
    return chainConfig.contracts.MORPHO;
  }, [chainConfig]);

  const approveToken = useCallback(async (tokenAddress: string, amount: bigint) => {
    if (!signer) throw new Error('请先连接钱包');
    const morphoAddress = getMorphoAddress();
    const token = new Contract(tokenAddress, ERC20_ABI, signer);
    const tx = await token.approve(morphoAddress, amount);
    await tx.wait();
  }, [signer, getMorphoAddress]);

  const supply = useCallback(async (params: MarketParams, assets: bigint, onBehalf: string) => {
    if (!signer) throw new Error('请先连接钱包');
    setLoading(true);
    setError(null);
    try {
      const morpho = new Contract(getMorphoAddress(), MORPHO_ABI, signer);
      const tx = await morpho.supply(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        assets, 0, onBehalf, '0x'
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '存款失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, getMorphoAddress]);

  const withdraw = useCallback(async (params: MarketParams, assets: bigint, onBehalf: string, receiver: string) => {
    if (!signer) throw new Error('请先连接钱包');
    setLoading(true);
    setError(null);
    try {
      const morpho = new Contract(getMorphoAddress(), MORPHO_ABI, signer);
      const tx = await morpho.withdraw(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        assets, 0, onBehalf, receiver
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取款失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, getMorphoAddress]);

  const supplyCollateral = useCallback(async (params: MarketParams, assets: bigint, onBehalf: string) => {
    if (!signer) throw new Error('请先连接钱包');
    setLoading(true);
    setError(null);
    try {
      const morpho = new Contract(getMorphoAddress(), MORPHO_ABI, signer);
      const tx = await morpho.supplyCollateral(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        assets, onBehalf, '0x'
      );
      await tx.wait();
    } catch (err: any) {
      let errorMessage = '存入抵押品失败';
      if (err.message) {
        if (err.message.includes('MARKET_NOT_CREATED')) {
          errorMessage = '市场不存在，请先创建市场';
        } else if (err.message.includes('ZERO_ASSETS')) {
          errorMessage = '资产数量不能为零';
        } else if (err.message.includes('insufficient allowance')) {
          errorMessage = '代币授权不足，请重试';
        } else if (err.message.includes('insufficient funds')) {
          errorMessage = '余额不足';
        } else if (err.message.includes('user rejected')) {
          errorMessage = '用户取消了交易';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [signer, getMorphoAddress]);

  const withdrawCollateral = useCallback(async (params: MarketParams, assets: bigint, onBehalf: string, receiver: string) => {
    if (!signer) throw new Error('请先连接钱包');
    setLoading(true);
    setError(null);
    try {
      const morpho = new Contract(getMorphoAddress(), MORPHO_ABI, signer);
      const tx = await morpho.withdrawCollateral(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        assets, onBehalf, receiver
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取出抵押品失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, getMorphoAddress]);

  const borrow = useCallback(async (params: MarketParams, assets: bigint, onBehalf: string, receiver: string) => {
    if (!signer) throw new Error('请先连接钱包');
    setLoading(true);
    setError(null);
    try {
      const morpho = new Contract(getMorphoAddress(), MORPHO_ABI, signer);
      const tx = await morpho.borrow(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        assets, 0, onBehalf, receiver
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '借款失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, getMorphoAddress]);

  const repay = useCallback(async (params: MarketParams, assets: bigint, onBehalf: string) => {
    if (!signer) throw new Error('请先连接钱包');
    setLoading(true);
    setError(null);
    try {
      const morpho = new Contract(getMorphoAddress(), MORPHO_ABI, signer);
      const tx = await morpho.repay(
        [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
        assets, 0, onBehalf, '0x'
      );
      await tx.wait();
    } catch (err) {
      setError(err instanceof Error ? err.message : '还款失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, getMorphoAddress]);

  return {
    loading,
    error,
    approveToken,
    supply,
    withdraw,
    supplyCollateral,
    withdrawCollateral,
    borrow,
    repay,
  };
}
