// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {Morpho} from "../src/Morpho.sol";

/// @title DeployMorpho
/// @notice Deployment script for Morpho core contract
contract DeployMorpho is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Morpho core contract
        Morpho morpho = new Morpho(owner);
        console.log("Morpho deployed at:", address(morpho));
        console.log("Owner:", owner);

        vm.stopBroadcast();

        // Output deployment info
        console.log("\n=== Deployment Summary ===");
        console.log("Morpho:", address(morpho));
        console.log("Owner:", owner);
        console.log("Chain ID:", block.chainid);
    }
}
