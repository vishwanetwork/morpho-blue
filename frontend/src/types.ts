export interface MarketParams {
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: bigint;
}

export interface Market {
    totalSupplyAssets: bigint;
    totalSupplyShares: bigint;
    totalBorrowAssets: bigint;
    totalBorrowShares: bigint;
    totalCollateral?: bigint;
    lastUpdate: bigint;
    fee: bigint;
}

export interface MarketConfig {
    enabled?: boolean;
    publicLiquidationEnabled?: boolean;
    twoStepLiquidationEnabled?: boolean;
    whitelistOneStepEnabled?: boolean;
    maxLiquidationRatio?: bigint;
    cooldownPeriod?: bigint;
    minSeizedAssets?: bigint;
    protocolFee?: bigint;
    lockDuration?: bigint;
    requestDeposit?: bigint;
    [key: string]: any;
}

export interface MarketInfo {
    id: string; // Market ID (hash)
    params: MarketParams;
    market: Market;

    // Helpers
    loanTokenSymbol: string;
    collateralTokenSymbol: string;
    loanTokenDecimals?: number;
    collateralTokenDecimals?: number;

    // Optional config from tiered
    config?: MarketConfig;
}

export interface LiquidationRequest {
    liquidator: string;
    requestTimestamp: bigint;
    liquidationRatio: bigint;
    depositAmount: bigint;
    status: number;
    expiresAt: bigint;
}
