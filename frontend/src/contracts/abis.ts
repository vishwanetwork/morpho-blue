export const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint amount) returns (bool)",
    "function transferFrom(address from, address to, uint amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
];

export const ORACLE_ABI = [
    "function price() view returns (uint256)",
    "function setPrice(uint256 newPrice)"
];

export const TIERED_LIQUIDATION_ABI = [
    "function getHealthFactor((address,address,address,address,uint256),address) view returns (uint256)",
    "function getLiquidationRequest(bytes32,address) view returns (tuple(address,uint256,uint256,uint256,uint8,uint256))",
    "function marketConfigs(bytes32) view returns (tuple(bool,bool,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256))",
    "function addLiquidator(bytes32,address)",
    "function removeLiquidator(bytes32,address)",
    "function setWhitelistMode(bytes32,bool)",
    "function configureMarket(bytes32,tuple(bool,uint256,uint256,uint256,uint256,bool,bool,uint256,uint256,uint256))"
];

export const MORPHO_ABI = [
    "event CreateMarket(bytes32 indexed id, (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)",
    "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
    "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
    "function owner() view returns (address)",
    "function isIrmEnabled(address irm) view returns (bool)",
    "function isLltvEnabled(uint256 lltv) view returns (bool)",
    "function enableIrm(address irm)",
    "function enableLltv(uint256 lltv)",
    "function createMarket((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv))",
    "function supply((address,address,address,address,uint256), uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)",
    "function withdraw((address,address,address,address,uint256), uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
    "function supplyCollateral((address,address,address,address,uint256), uint256 assets, address onBehalf, bytes data)",
    "function withdrawCollateral((address,address,address,address,uint256), uint256 assets, address onBehalf, address receiver)",
    "function borrow((address,address,address,address,uint256), uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
    "function repay((address,address,address,address,uint256), uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)"
];

export const WHITELIST_REGISTRY_ABI = [
    "function isWhitelisted(address user) view returns (bool)",
    "function setWhitelist(address user, bool status)"
];
