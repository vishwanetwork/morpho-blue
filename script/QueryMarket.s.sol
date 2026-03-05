// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {Morpho} from "../src/Morpho.sol";
import {Id} from "../src/interfaces/IMorpho.sol";

interface IERC20 {
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

contract QueryMarket is Script {
    function run() external view {
        Morpho morpho = Morpho(0xE6a6A9A01B0e381263Ab88995474C79F933f8856);
        
        // 从最近的事件中获取市场ID (您需要替换为实际的市场ID)
        // 这里我们假设您知道市场参数
        Id marketId = Id.wrap(bytes32(0)); // 需要替换为实际的市场ID
        
        console.log("Querying market:", uint256(Id.unwrap(marketId)));
        
        // 获取市场参数
        (
            address loanToken,
            address collateralToken,
            address oracle,
            address irm,
            uint256 lltv
        ) = morpho.idToMarketParams(marketId);
        
        console.log("\n=== Market Parameters ===");
        console.log("Loan Token:", loanToken);
        console.log("Collateral Token:", collateralToken);
        console.log("Oracle:", oracle);
        console.log("IRM:", irm);
        console.log("LLTV:", lltv);
        
        // 获取代币信息
        try IERC20(loanToken).decimals() returns (uint8 decimals) {
            console.log("\nLoan Token Decimals:", decimals);
            try IERC20(loanToken).symbol() returns (string memory symbol) {
                console.log("Loan Token Symbol:", symbol);
            } catch {}
        } catch {
            console.log("\nLoan Token: No decimals() function (not a valid ERC20)");
        }
        
        try IERC20(collateralToken).decimals() returns (uint8 decimals) {
            console.log("\nCollateral Token Decimals:", decimals);
            try IERC20(collateralToken).symbol() returns (string memory symbol) {
                console.log("Collateral Token Symbol:", symbol);
            } catch {}
        } catch {
            console.log("\nCollateral Token: No decimals() function (not a valid ERC20)");
        }
        
        // 获取市场状态
        (
            uint128 totalSupplyAssets,
            uint128 totalSupplyShares,
            uint128 totalBorrowAssets,
            uint128 totalBorrowShares,
            ,
        ) = morpho.market(marketId);
        
        console.log("\n=== Market State ===");
        console.log("Total Supply Assets:", totalSupplyAssets);
        console.log("Total Supply Shares:", totalSupplyShares);
        console.log("Total Borrow Assets:", totalBorrowAssets);
        console.log("Total Borrow Shares:", totalBorrowShares);
    }
}
