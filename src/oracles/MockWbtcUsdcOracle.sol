// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {IOracle} from "../interfaces/IOracle.sol";

/// @title MockWbtcUsdcOracle
/// @notice Mock oracle for WBTC/USDC price feed with adjustable price
/// @dev Default price ratio 1:100 (1 WBTC = 100 USDC), can be changed via setPrice
contract MockWbtcUsdcOracle is IOracle {
    /* CONSTANTS */

    /// @notice WBTC token address
    address public constant WBTC = 0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4;

    /// @notice USDC token address
    address public constant USDC = 0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8;

    /// @notice WBTC decimals (8)
    uint8 public constant WBTC_DECIMALS = 8;

    /// @notice USDC decimals (6)
    uint8 public constant USDC_DECIMALS = 6;

    /// @notice Price scale for Morpho Blue (1e36)
    uint256 public constant PRICE_SCALE = 1e36;

    /// @notice Default price ratio: 1 WBTC = 100 USDC
    /// @dev Price = 100 * 10^(36 + USDC_DECIMALS - WBTC_DECIMALS)
    ///      Price = 100 * 10^(36 + 6 - 8) = 100 * 10^34
    uint256 public constant DEFAULT_PRICE = 100 * 1e34;

    /* STORAGE */

    /// @notice Current price, can be updated via setPrice
    uint256 private _price;

    /* CONSTRUCTOR */

    constructor() {
        _price = DEFAULT_PRICE;
    }

    /* EXTERNAL FUNCTIONS */

    /// @notice Returns the price of WBTC in USDC
    /// @return The price scaled by 1e36
    function price() external view override returns (uint256) {
        return _price;
    }

    /// @notice Set a new price
    /// @param newPrice The new price scaled by 1e36
    function setPrice(uint256 newPrice) external {
        _price = newPrice;
    }
}
