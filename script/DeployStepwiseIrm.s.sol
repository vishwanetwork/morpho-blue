// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {Morpho} from "../src/Morpho.sol";
import {StepwiseIrm} from "../src/irm/StepwiseIrm.sol";

/// @title DeployStepwiseIrm
/// @notice Deploy and enable StepwiseIrm on Sepolia
contract DeployStepwiseIrm is Script {
    // Existing Morpho on Sepolia
    address constant MORPHO = 0x6feA877EBFCE0eCc918E0230936CA6BEFA8aC3Bf;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        StepwiseIrm irm = new StepwiseIrm();
        console.log("StepwiseIrm deployed at:", address(irm));

        Morpho(MORPHO).enableIrm(address(irm));
        console.log("StepwiseIrm enabled on Morpho:", address(irm));

        vm.stopBroadcast();

        console.log("\n========================================");
        console.log("    SEPOLIA IRM DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Morpho:      ", MORPHO);
        console.log("StepwiseIrm: ", address(irm));
        console.log("========================================");
    }
}

