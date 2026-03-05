// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {ChainlinkOracle} from "../src/oracles/ChainlinkOracle.sol";

/// @title DeployPharosWbtcUsdcOracle
/// @notice Deploy a WBTC/USDC Chainlink-based oracle on Pharos
contract DeployPharosWbtcUsdcOracle is Script {
    // Pharos WBTC/USD feed (provided)
    address constant WBTC_USD_FEED = 0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4;

    // If you have a USDC/USD feed on Pharos, replace address(0) below.
    address constant USDC_USD_FEED = address(0);

    // Standard decimals for WBTC and USDC
    uint8 constant WBTC_DECIMALS = 8;
    uint8 constant USDC_DECIMALS = 6;

    // Max staleness (seconds)
    uint256 constant MAX_STALENESS = 1 hours;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        ChainlinkOracle oracle = new ChainlinkOracle(
            WBTC_USD_FEED,
            USDC_USD_FEED,
            WBTC_DECIMALS,
            USDC_DECIMALS,
            MAX_STALENESS
        );

        console.log("WBTC/USDC ChainlinkOracle deployed at:", address(oracle));

        vm.stopBroadcast();

        console.log("\n========================================");
        console.log("    PHAROS WBTC/USDC ORACLE SUMMARY");
        console.log("========================================");
        console.log("WBTC/USD Feed:", WBTC_USD_FEED);
        console.log("USDC/USD Feed:", USDC_USD_FEED);
        console.log("Oracle:       ", address(oracle));
        console.log("========================================");
    }
}

