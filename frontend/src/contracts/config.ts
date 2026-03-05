// Multi-chain Configuration

export interface ChainContracts {
  MORPHO: string;
  WHITELIST_REGISTRY?: string;
  TIERED_LIQUIDATION?: string;
  DEPLOY_BLOCK: number;
}

export interface ChainConfig {
  chainId: number;
  chainName: string;
  shortName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  contracts: ChainContracts;
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // Sepolia Testnet
  11155111: {
    chainId: 11155111,
    chainName: 'Sepolia Testnet',
    shortName: 'Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    contracts: {
      MORPHO: '0x6feA877EBFCE0eCc918E0230936CA6BEFA8aC3Bf',
      WHITELIST_REGISTRY: '0x99A1C30321deb4BAEc347C8C99FfCD876ea18043',
      TIERED_LIQUIDATION: '0x3AC63C03B354A0d6D7Db83260dCAde6d59b10Ffd',
      DEPLOY_BLOCK: 10201507,
    },
  },
  // Pharos Atlantic Testnet
  688689: {
    chainId: 688689,
    chainName: 'Pharos Atlantic Testnet',
    shortName: 'Pharos',
    nativeCurrency: { name: 'PHRS', symbol: 'PHRS', decimals: 18 },
    rpcUrls: ['https://atlantic.dplabs-internal.com'],
    blockExplorerUrls: [],
    contracts: {
      MORPHO: '0xE6a6A9A01B0e381263Ab88995474C79F933f8856',
      WHITELIST_REGISTRY: '0xEbDC1abDa5b237F6330231c4941F9405F47FD173',
      TIERED_LIQUIDATION: '0x5a2b3554aa7Ab1850F16579163261AF02f7AeB02',
      DEPLOY_BLOCK: 12611647,
    },
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(SUPPORTED_CHAINS).map(Number);
export const DEFAULT_CHAIN_ID = 688689;

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS[chainId];
}

export function isSupportedChain(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS;
}

export function getNetworkConfig(chainConfig: ChainConfig) {
  return {
    chainId: `0x${chainConfig.chainId.toString(16)}`,
    chainName: chainConfig.chainName,
    nativeCurrency: chainConfig.nativeCurrency,
    rpcUrls: chainConfig.rpcUrls,
    blockExplorerUrls: chainConfig.blockExplorerUrls,
  };
}

// 检查链是否支持分级清算
export function hasTieredLiquidation(chainConfig: ChainConfig): boolean {
  return !!chainConfig.contracts.TIERED_LIQUIDATION;
}

// 检查链是否支持白名单注册
export function hasWhitelistRegistry(chainConfig: ChainConfig): boolean {
  return !!chainConfig.contracts.WHITELIST_REGISTRY;
}

// ====== 向后兼容 ======
// 以下导出保持与旧代码的兼容性，默认使用 Pharos 链
export const CHAIN_ID = DEFAULT_CHAIN_ID;
export const RPC_URL = SUPPORTED_CHAINS[DEFAULT_CHAIN_ID].rpcUrls[0];
export const CONTRACTS = SUPPORTED_CHAINS[DEFAULT_CHAIN_ID].contracts;
export const NETWORK_CONFIG = getNetworkConfig(SUPPORTED_CHAINS[DEFAULT_CHAIN_ID]);
