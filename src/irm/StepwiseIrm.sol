// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import {IIrm} from "../interfaces/IIrm.sol";
import {MarketParams, Market} from "../interfaces/IMorpho.sol";
import {MathLib, WAD} from "../libraries/MathLib.sol";

/// @title StepwiseIrm
/// @notice Simple stepwise IRM: utilization -> fixed APR
/// @dev APR is converted to per-second rate (WAD). Utilization is borrow/supply.
contract StepwiseIrm is IIrm {
    using MathLib for uint256;

    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    uint256 internal constant UTIL_20 = 0.20e18;
    uint256 internal constant UTIL_50 = 0.50e18;
    uint256 internal constant UTIL_100 = 1.00e18;

    uint256 internal constant APR_3 = 0.03e18;
    uint256 internal constant APR_10 = 0.10e18;
    uint256 internal constant APR_15 = 0.15e18;
    uint256 internal constant APR_20 = 0.20e18;

    function borrowRateView(MarketParams memory, Market memory market) public pure returns (uint256) {
        if (market.totalSupplyAssets == 0) return 0;

        uint256 utilization = uint256(market.totalBorrowAssets).wDivDown(uint256(market.totalSupplyAssets));
        uint256 apr;

        if (utilization <= UTIL_20) {
            apr = APR_3;
        } else if (utilization <= UTIL_50) {
            apr = APR_10;
        } else if (utilization < UTIL_100) {
            apr = APR_15;
        } else {
            apr = APR_20;
        }

        return apr / SECONDS_PER_YEAR;
    }

    function borrowRate(MarketParams memory marketParams, Market memory market) external pure returns (uint256) {
        return borrowRateView(marketParams, market);
    }
}

