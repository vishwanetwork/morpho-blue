// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {MockWbtcUsdcOracle} from "../src/oracles/MockWbtcUsdcOracle.sol";

/// @title DeployMockWbtcUsdcOracle
/// @notice Deploy a mock WBTC/USDC oracle with adjustable price (default 1:100 ratio)
contract DeployMockWbtcUsdcOracle is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        MockWbtcUsdcOracle oracle = new MockWbtcUsdcOracle();

        console.log("MockWbtcUsdcOracle deployed at:", address(oracle));

        vm.stopBroadcast();

        console.log("\n========================================");
        console.log("    MOCK WBTC/USDC ORACLE SUMMARY");
        console.log("========================================");
        console.log("WBTC Address:", oracle.WBTC());
        console.log("USDC Address:", oracle.USDC());
        console.log("Default Price: 1 WBTC = 100 USDC (adjustable via setPrice)");
        console.log("Oracle:      ", address(oracle));
        console.log("========================================");
    }
}
