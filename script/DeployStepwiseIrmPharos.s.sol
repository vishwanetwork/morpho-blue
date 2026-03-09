// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {Morpho} from "../src/Morpho.sol";
import {StepwiseIrm} from "../src/irm/StepwiseIrm.sol";

/// @title DeployStepwiseIrmPharos
/// @notice Deploy and enable StepwiseIrm on Pharos
contract DeployStepwiseIrmPharos is Script {
    // Existing Morpho on Pharos
    address constant MORPHO = 0xE6a6A9A01B0e381263Ab88995474C79F933f8856;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        StepwiseIrm irm = new StepwiseIrm();
        console.log("StepwiseIrm deployed at:", address(irm));

        Morpho(MORPHO).enableIrm(address(irm));
        console.log("StepwiseIrm enabled on Morpho:", address(irm));

        vm.stopBroadcast();

        console.log("\n========================================");
        console.log("    PHAROS IRM DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Morpho:      ", MORPHO);
        console.log("StepwiseIrm: ", address(irm));
        console.log("========================================");
    }
}
