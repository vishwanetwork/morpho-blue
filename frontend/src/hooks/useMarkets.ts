import { useState, useEffect, useCallback } from 'react';
import { Contract, JsonRpcProvider, JsonRpcSigner, keccak256, AbiCoder } from 'ethers';
import { ChainConfig, hasTieredLiquidation } from '../contracts/config';
import { MORPHO_ABI, TIERED_LIQUIDATION_ABI, ERC20_ABI } from '../contracts/abis';
import { MarketInfo, MarketParams, Market, MarketConfig } from '../types';

interface CachedMarketData {
  lastScannedBlock: number;
  marketEvents: { id: string; params: MarketParams; blockNumber: number }[];
}

interface SeedMarket {
  id: string;
  params: {
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: string;
  };
  blockNumber: number;
}

interface SeedData {
  lastScannedBlock: number;
  markets: SeedMarket[];
}

const SEED_DATA: Record<number, SeedData> = {
  688689: {
    lastScannedBlock: 14376464,
    markets: [
      {
        id: '0xcb2c58ee7fcfe8a5567b3646eca6c2933cbd5d097265eb1f877954dccfb937f0',
        params: {
          loanToken: '0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8',
          collateralToken: '0x7d211F77525ea39A0592794f793cC1036eEaccD5',
          oracle: '0x7543CF401Cc0A9969736EE457522741e68248C4B',
          irm: '0x0000000000000000000000000000000000000000',
          lltv: '800000000000000000',
        },
        blockNumber: 12622605,
      },
      {
        id: '0xb4f8ce4920b8b6c8f2bb3ee7270c58d3cc9041da0ead24b031353ef4226d92d8',
        params: {
          loanToken: '0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8',
          collateralToken: '0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4',
          oracle: '0xD1432f31fcBEe0803eE63f112a1D5252D18243e4',
          irm: '0xC5c6addf721E77BAeEE066D5db6ab773FbFd838d',
          lltv: '800000000000000000',
        },
        blockNumber: 12811081,
      },
      {
        id: '0x20554d7136b2a862c50ca9dc15bd92bb5556aec22b839f4bf9f2cd9b77df30db',
        params: {
          loanToken: '0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8',
          collateralToken: '0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4',
          oracle: '0xc7Be3278E68a0391cBb6E43a7c5603C5EEb7E3a5',
          irm: '0xC5c6addf721E77BAeEE066D5db6ab773FbFd838d',
          lltv: '800000000000000000',
        },
        blockNumber: 12812415,
      },
    ],
  },
  11155111: {
    lastScannedBlock: 10328490,
    markets: [
      {
        id: '0x17aa5de97982145c0bcd2cc603f6853da46cf6b680239be44c344e75f754a387',
        params: {
          loanToken: '0x6F1b9Cb0e85C025656358594Bfb8f7003EC2faF6',
          collateralToken: '0x05d380f371eC545374B33751C20F3841A8EC79B7',
          oracle: '0x0231cae53d75B5142DD5302bB2ef98b05C5Af041',
          irm: '0x0000000000000000000000000000000000000000',
          lltv: '800000000000000000',
        },
        blockNumber: 10201557,
      },
      {
        id: '0x9d1690a3d6bf75d48a2a06d35eabdb099c84add8aa4182b5769cb91d632cc688',
        params: {
          loanToken: '0x6F1b9Cb0e85C025656358594Bfb8f7003EC2faF6',
          collateralToken: '0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4',
          oracle: '0xD1432f31fcBEe0803eE63f112a1D5252D18243e4',
          irm: '0xc8686a426fEdADEAFc2a2e3BD21B76464a1e1eE4',
          lltv: '800000000000000000',
        },
        blockNumber: 10202092,
      },
    ],
  },
};

function getChunkSize(chainId: number): number {
  if (chainId === 688689) return 1000;
  if (chainId === 11155111) return 50000;
  return 5000;
}

function getParallelism(chainId: number): number {
  if (chainId === 688689) return 10;
  return 5;
}

function getCacheKey(chainId: number): string {
  return `marketCache_v2:${chainId}`;
}

function loadCache(chainId: number): CachedMarketData | null {
  try {
    const raw = localStorage.getItem(getCacheKey(chainId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.marketEvents) {
      data.marketEvents = data.marketEvents.map((e: any) => ({
        ...e,
        params: {
          ...e.params,
          lltv: BigInt(e.params.lltv),
        },
      }));
    }
    return data;
  } catch {
    return null;
  }
}

function saveCache(chainId: number, data: CachedMarketData) {
  try {
    const serializable = {
      ...data,
      marketEvents: data.marketEvents.map((e) => ({
        ...e,
        params: {
          ...e.params,
          lltv: e.params.lltv.toString(),
        },
      })),
    };
    localStorage.setItem(getCacheKey(chainId), JSON.stringify(serializable));
  } catch {
    // localStorage full or unavailable
  }
}

function getSeedEvents(chainId: number): { events: CachedMarketData['marketEvents']; lastBlock: number } {
  const seed = SEED_DATA[chainId];
  if (!seed) return { events: [], lastBlock: 0 };
  return {
    events: seed.markets.map((m) => ({
      id: m.id,
      params: {
        loanToken: m.params.loanToken,
        collateralToken: m.params.collateralToken,
        oracle: m.params.oracle,
        irm: m.params.irm,
        lltv: BigInt(m.params.lltv),
      },
      blockNumber: m.blockNumber,
    })),
    lastBlock: seed.lastScannedBlock,
  };
}

export function useMarkets(signer: JsonRpcSigner | null, chainConfig: ChainConfig | null) {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const KNOWN_SYMBOLS: Record<string, string> = {
    '0x04e0be08c27741ff5772a1ba3a9ad7a1d1479564': 'USDC',
    '0xe0be08c77f415f577a1b3a9ad7a1df1479564ec8': 'USDC',
    '0x7d21ff7525ea39d9ad39d793794f7938cc4d0824': 'WETH',
    '0x7d211f77525ea39a0592794f793cc1036eeaccd5': 'WETH',
    '0x0c64f03eea5c30946d5c55b4b532d08ad74638a4': 'WBTC',
    '0x05d380f371ec545374b33751c20f3841a8ec79b7': 'WBTC',
    '0x6f1b9cb0e85c025656358594bfb8f7003ec2faf6': 'USDC',
  };

  const KNOWN_DECIMALS: Record<string, number> = {
    '0x04e0be08c27741ff5772a1ba3a9ad7a1d1479564': 6,
    '0xe0be08c77f415f577a1b3a9ad7a1df1479564ec8': 6,
    '0x7d21ff7525ea39d9ad39d793794f7938cc4d0824': 18,
    '0x7d211f77525ea39a0592794f793cc1036eeaccd5': 18,
    '0x0c64f03eea5c30946d5c55b4b532d08ad74638a4': 18,
    '0x05d380f371ec545374b33751c20f3841a8ec79b7': 18,
    '0x6f1b9cb0e85c025656358594bfb8f7003ec2faf6': 6,
  };

  const getMarketId = (params: MarketParams): string => {
    const abiCoder = new AbiCoder();
    const encoded = abiCoder.encode(
      ['address', 'address', 'address', 'address', 'uint256'],
      [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv]
    );
    return keccak256(encoded);
  };

  const getTokenSymbol = async (tokenAddress: string, provider: JsonRpcProvider): Promise<string> => {
    const knownSymbol = KNOWN_SYMBOLS[tokenAddress.toLowerCase()];
    if (knownSymbol) return knownSymbol;

    try {
      const contract = new Contract(tokenAddress, ERC20_ABI, provider);
      const symbol = await contract.symbol();
      if (symbol && typeof symbol === 'string' && symbol.length > 0) return symbol;
    } catch {
      try {
        const bytes32Abi = ['function symbol() view returns (bytes32)'];
        const contract = new Contract(tokenAddress, bytes32Abi, provider);
        const raw: string = await contract.symbol();
        const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
        const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
        const decoded = new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
        if (decoded.length > 0) return decoded;
      } catch {
        // bytes32 also failed
      }
    }
    return tokenAddress.slice(0, 6) + '...';
  };

  const getTokenDecimals = async (tokenAddress: string, provider: JsonRpcProvider): Promise<number> => {
    const knownDecimals = KNOWN_DECIMALS[tokenAddress.toLowerCase()];
    if (knownDecimals !== undefined) return knownDecimals;

    try {
      const contract = new Contract(tokenAddress, ERC20_ABI, provider);
      const decimals = await contract.decimals();
      return Number(decimals);
    } catch {
      return 18;
    }
  };

  const scanEvents = async (
    morpho: Contract,
    fromBlock: number,
    toBlock: number,
    chunkSize: number,
    parallelism: number,
  ): Promise<any[]> => {
    const chunks: { from: number; to: number }[] = [];
    for (let i = fromBlock; i <= toBlock; i += chunkSize) {
      chunks.push({ from: i, to: Math.min(i + chunkSize - 1, toBlock) });
    }

    if (chunks.length === 0) return [];

    const filter = morpho.filters.CreateMarket();
    let allEvents: any[] = [];

    for (let i = 0; i < chunks.length; i += parallelism) {
      const batch = chunks.slice(i, i + parallelism);
      const results = await Promise.all(
        batch.map((c) =>
          morpho.queryFilter(filter, c.from, c.to).catch(() => [])
        )
      );
      for (const res of results) allEvents.push(...res);
    }

    return allEvents;
  };

  const loadMarketDetails = async (
    events: CachedMarketData['marketEvents'],
    provider: JsonRpcProvider,
    morpho: Contract,
    tieredLiq: Contract | null,
    morphoAddress: string,
  ): Promise<MarketInfo[]> => {
    const results = await Promise.all(
      events.map(async (event): Promise<MarketInfo | null> => {
        try {
          const { id, params: marketParams } = event;

          const rpcCalls: [
            Promise<any>,
            Promise<bigint>,
            Promise<string>,
            Promise<string>,
            Promise<number>,
            Promise<number>,
            Promise<any | undefined>,
          ] = [
            morpho.market(id),
            new Contract(marketParams.collateralToken, ERC20_ABI, provider)
              .balanceOf(morphoAddress).catch(() => 0n),
            getTokenSymbol(marketParams.loanToken, provider),
            getTokenSymbol(marketParams.collateralToken, provider),
            getTokenDecimals(marketParams.loanToken, provider),
            getTokenDecimals(marketParams.collateralToken, provider),
            tieredLiq
              ? tieredLiq.marketConfigs(id).catch(() => undefined)
              : Promise.resolve(undefined),
          ];

          const [marketData, collateralBalance, loanSymbol, collateralSymbol, loanDecimals, collateralDecimals, configData] = await Promise.all(rpcCalls);

          const market: Market = {
            totalSupplyAssets: BigInt(marketData[0].toString()),
            totalSupplyShares: BigInt(marketData[1].toString()),
            totalBorrowAssets: BigInt(marketData[2].toString()),
            totalBorrowShares: BigInt(marketData[3].toString()),
            lastUpdate: BigInt(marketData[4].toString()),
            fee: BigInt(marketData[5].toString()),
            totalCollateral: BigInt(collateralBalance.toString()),
          };

          let config: MarketConfig | undefined;
          if (configData) {
            config = {
              enabled: configData[0],
              publicLiquidationEnabled: configData[1],
              twoStepLiquidationEnabled: configData[2],
              whitelistOneStepEnabled: configData[3],
              maxLiquidationRatio: BigInt(configData[4].toString()),
              cooldownPeriod: BigInt(configData[5].toString()),
              minSeizedAssets: BigInt(configData[6].toString()),
              protocolFee: BigInt(configData[7].toString()),
              lockDuration: BigInt(configData[8].toString()),
              requestDeposit: BigInt(configData[9].toString()),
            };
          }

          return {
            id,
            params: marketParams,
            market,
            config,
            loanTokenSymbol: loanSymbol,
            collateralTokenSymbol: collateralSymbol,
            loanTokenDecimals: loanDecimals,
            collateralTokenDecimals: collateralDecimals,
          };
        } catch (e) {
          console.error('Error fetching market:', event.id.slice(0, 10), e);
          return null;
        }
      })
    );

    return results.filter((m): m is MarketInfo => m !== null);
  };

  const fetchMarkets = useCallback(async () => {
    if (!chainConfig || !chainConfig.contracts.MORPHO) return;

    setLoading(true);
    setError(null);

    try {
      const rpcUrl = chainConfig.rpcUrls[0];
      const provider = new JsonRpcProvider(rpcUrl);
      const contracts = chainConfig.contracts;
      const morpho = new Contract(contracts.MORPHO, MORPHO_ABI, provider);

      const hasTiered = hasTieredLiquidation(chainConfig);
      let tieredLiq: Contract | null = null;
      if (hasTiered && contracts.TIERED_LIQUIDATION) {
        tieredLiq = new Contract(contracts.TIERED_LIQUIDATION, TIERED_LIQUIDATION_ABI, provider);
      }

      // Step 1: Get cached or seed events for immediate display
      const cache = loadCache(chainConfig.chainId);
      const seed = getSeedEvents(chainConfig.chainId);
      const baseEvents = cache?.marketEvents ?? seed.events;
      const baseBlock = cache?.lastScannedBlock ?? seed.lastBlock;

      // Step 2: Immediately load market details for known markets
      if (baseEvents.length > 0) {
        console.log(`[${chainConfig.shortName}] Loading ${baseEvents.length} known markets...`);
        const knownMarkets = await loadMarketDetails(
          baseEvents, provider, morpho, tieredLiq, contracts.MORPHO
        );
        setMarkets(knownMarkets);
        setLoading(false);
      }

      // Step 3: Incremental scan for new markets (background)
      let currentBlock: number;
      try {
        currentBlock = await provider.getBlockNumber();
      } catch (e) {
        console.error('Failed to get block number:', e);
        if (baseEvents.length === 0) {
          setError('Failed to connect to RPC');
        }
        return;
      }

      const scanFrom = baseBlock > 0 ? baseBlock + 1 : (contracts.DEPLOY_BLOCK || 0);

      if (scanFrom <= currentBlock) {
        const blocksToScan = currentBlock - scanFrom + 1;
        const chunkSize = getChunkSize(chainConfig.chainId);
        const parallelism = getParallelism(chainConfig.chainId);
        const totalChunks = Math.ceil(blocksToScan / chunkSize);

        console.log(`[${chainConfig.shortName}] Incremental scan: blocks ${scanFrom}-${currentBlock} (${blocksToScan} blocks, ${totalChunks} chunks)`);

        if (totalChunks > 500) {
          console.log(`[${chainConfig.shortName}] Too many chunks (${totalChunks}), skipping scan. Using seed/cache data.`);
          if (!cache && seed.events.length > 0) {
            saveCache(chainConfig.chainId, {
              lastScannedBlock: seed.lastBlock,
              marketEvents: seed.events,
            });
          }
          return;
        }

        const newEvents = await scanEvents(morpho, scanFrom, currentBlock, chunkSize, parallelism);
        console.log(`[${chainConfig.shortName}] Found ${newEvents.length} new CreateMarket events`);

        const newParsed = newEvents.map((event: any) => {
          const log = event as unknown as { args: { id: string; marketParams: MarketParams }; blockNumber: number };
          return {
            id: log.args.id,
            params: {
              loanToken: log.args.marketParams.loanToken,
              collateralToken: log.args.marketParams.collateralToken,
              oracle: log.args.marketParams.oracle,
              irm: log.args.marketParams.irm,
              lltv: BigInt(log.args.marketParams.lltv.toString()),
            },
            blockNumber: log.blockNumber,
          };
        });

        const allEvents = [...baseEvents, ...newParsed];
        const seenIds = new Set<string>();
        const uniqueEvents = allEvents.filter((e) => {
          if (seenIds.has(e.id)) return false;
          seenIds.add(e.id);
          return true;
        });

        saveCache(chainConfig.chainId, {
          lastScannedBlock: currentBlock,
          marketEvents: uniqueEvents,
        });

        if (newParsed.length > 0) {
          console.log(`[${chainConfig.shortName}] Refreshing with ${uniqueEvents.length} total markets`);
          const allMarkets = await loadMarketDetails(
            uniqueEvents, provider, morpho, tieredLiq, contracts.MORPHO
          );
          setMarkets(allMarkets);
        } else if (baseEvents.length === 0) {
          setMarkets([]);
        }
      } else {
        console.log(`[${chainConfig.shortName}] Cache up to date (block ${baseBlock})`);
        if (!cache && seed.events.length > 0) {
          saveCache(chainConfig.chainId, {
            lastScannedBlock: seed.lastBlock,
            marketEvents: seed.events,
          });
        }
      }
    } catch (err) {
      console.error('fetchMarkets error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
    } finally {
      setLoading(false);
    }
  }, [chainConfig]);

  const createMarket = async (params: MarketParams, onStatus?: (status: string) => void) => {
    if (!signer) throw new Error('Please connect wallet first');
    if (!chainConfig) throw new Error('Not connected to a supported network');

    const morpho = new Contract(chainConfig.contracts.MORPHO, MORPHO_ABI, signer);

    const owner = await morpho.owner();
    const signerAddress = await signer.getAddress();
    const isOwner = owner.toLowerCase() === signerAddress.toLowerCase();

    const cleanParams = {
      ...params,
      loanToken: params.loanToken.trim(),
      collateralToken: params.collateralToken.trim(),
      oracle: params.oracle.trim(),
      irm: params.irm.trim(),
    };

    onStatus?.('Checking IRM status...');
    const isIrmEnabled = Boolean(await morpho.isIrmEnabled(cleanParams.irm));

    if (!isIrmEnabled) {
      if (isOwner) {
        onStatus?.('Enabling IRM...');
        try {
          const tx = await morpho.enableIrm(cleanParams.irm);
          onStatus?.('Waiting for IRM enable confirmation...');
          await tx.wait();
          onStatus?.('IRM enabled');
        } catch {
          throw new Error('Failed to enable IRM. Please confirm you are the contract Owner.');
        }
      } else {
        throw new Error('IRM not enabled and current account is not Owner. Please contact the admin.');
      }
    }

    onStatus?.('Checking LLTV status...');
    const isLltvEnabled = Boolean(await morpho.isLltvEnabled(params.lltv));

    if (!isLltvEnabled) {
      if (isOwner) {
        onStatus?.(`Enabling LLTV ${Number(params.lltv) / 1e18 * 100}%...`);
        try {
          const tx = await morpho.enableLltv(params.lltv);
          onStatus?.('Waiting for LLTV enable confirmation...');
          await tx.wait();
          onStatus?.('LLTV enabled');
        } catch {
          throw new Error('Failed to enable LLTV. Please confirm you are the contract Owner.');
        }
      } else {
        throw new Error(`LLTV ${Number(params.lltv) / 1e18 * 100}% not enabled. Please contact the admin.`);
      }
    }

    onStatus?.('Creating market...');
    try {
      const tx = await morpho.createMarket({
        loanToken: cleanParams.loanToken,
        collateralToken: cleanParams.collateralToken,
        oracle: cleanParams.oracle,
        irm: cleanParams.irm,
        lltv: cleanParams.lltv,
      });
      onStatus?.('Waiting for market creation confirmation...');
      await tx.wait();
    } catch (err: any) {
      if (err.code === 'CALL_EXCEPTION') {
        throw new Error('Market creation reverted. Possible reasons: IRM or LLTV not enabled, or market already exists.');
      }
      throw err;
    }

    localStorage.removeItem(getCacheKey(chainConfig.chainId));
    await fetchMarkets();
    return getMarketId(cleanParams);
  };

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  return {
    markets,
    loading,
    error,
    fetchMarkets,
    createMarket,
    getMarketId,
  };
}
