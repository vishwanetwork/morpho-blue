// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {IOracle} from "../interfaces/IOracle.sol";
import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";

/// @title ChainlinkOracle
/// @notice Chainlink price feed adapter for Morpho Blue
/// @dev Supports single feed or dual feed (base/quote) price calculation
contract ChainlinkOracle is IOracle {
    /* ERRORS */
    error StalePrice();
    error InvalidPrice();
    error InvalidDecimals();

    /* CONSTANTS */
    uint256 public constant PRICE_SCALE = 1e36;

    /* IMMUTABLES */

    /// @notice Base price feed (e.g., ETH/USD)
    IChainlinkAggregator public immutable baseFeed;

    /// @notice Quote price feed (e.g., USDC/USD), optional
    IChainlinkAggregator public immutable quoteFeed;

    /// @notice Decimals of collateral token
    uint8 public immutable collateralDecimals;

    /// @notice Decimals of loan token
    uint8 public immutable loanDecimals;

    /// @notice Maximum staleness allowed for price (in seconds)
    uint256 public immutable maxStaleness;

    /// @notice Price scale factor for conversion
    uint256 public immutable priceScale;

    /* CONSTRUCTOR */

    /// @notice Creates a new Chainlink oracle adapter
    /// @param _baseFeed Address of base price feed (collateral/USD)
    /// @param _quoteFeed Address of quote price feed (loan/USD), use address(0) if loan is USD
    /// @param _collateralDecimals Decimals of collateral token
    /// @param _loanDecimals Decimals of loan token
    /// @param _maxStaleness Maximum allowed staleness in seconds (e.g., 3600 for 1 hour)
    constructor(
        address _baseFeed,
        address _quoteFeed,
        uint8 _collateralDecimals,
        uint8 _loanDecimals,
        uint256 _maxStaleness
    ) {
        if (_baseFeed == address(0)) revert InvalidPrice();

        baseFeed = IChainlinkAggregator(_baseFeed);
        quoteFeed = _quoteFeed != address(0) ? IChainlinkAggregator(_quoteFeed) : IChainlinkAggregator(address(0));
        collateralDecimals = _collateralDecimals;
        loanDecimals = _loanDecimals;
        maxStaleness = _maxStaleness;

        // Calculate price scale factor
        uint8 baseFeedDecimals = IChainlinkAggregator(_baseFeed).decimals();
        uint8 quoteFeedDecimals = _quoteFeed != address(0)
            ? IChainlinkAggregator(_quoteFeed).decimals()
            : 0;

        // Scale = 10^(36 + loanDecimals - collateralDecimals - baseFeedDecimals + quoteFeedDecimals)
        int256 scaleExponent = int256(36) + int256(uint256(loanDecimals)) - int256(uint256(collateralDecimals))
            - int256(uint256(baseFeedDecimals)) + int256(uint256(quoteFeedDecimals));

        if (scaleExponent < 0 || scaleExponent > 77) revert InvalidDecimals();
        priceScale = 10 ** uint256(scaleExponent);
    }

    /* EXTERNAL FUNCTIONS */

    /// @notice Returns the price of collateral token in loan token
    /// @return The price scaled by 1e36
    function price() external view override returns (uint256) {
        uint256 basePrice = _getPrice(baseFeed);

        if (address(quoteFeed) == address(0)) {
            // Single feed: collateral/USD, loan is USD-pegged
            return basePrice * priceScale;
        } else {
            // Dual feed: (collateral/USD) / (loan/USD) = collateral/loan
            uint256 quotePrice = _getPrice(quoteFeed);
            return (basePrice * priceScale) / quotePrice;
        }
    }

    /* INTERNAL FUNCTIONS */

    /// @notice Gets price from a Chainlink feed with staleness check
    function _getPrice(IChainlinkAggregator feed) internal view returns (uint256) {
        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,
        ) = feed.latestRoundData();

        if (answer <= 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > maxStaleness) revert StalePrice();

        return uint256(answer);
    }
}
