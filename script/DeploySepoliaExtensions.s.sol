// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {WhitelistRegistry} from "../src/extensions/WhitelistRegistry.sol";
import {TieredLiquidationMorpho} from "../src/extensions/TieredLiquidationMorpho.sol";

/// @title DeploySepoliaExtensions
/// @notice Deploy WhitelistRegistry + TieredLiquidationMorpho on Sepolia
/// @dev Uses the already-deployed Morpho contract at 0x6feA877EBFCE0eCc918E0230936CA6BEFA8aC3Bf
contract DeploySepoliaExtensions is Script {
    // Already deployed on Sepolia
    address constant MORPHO = 0x6feA877EBFCE0eCc918E0230936CA6BEFA8aC3Bf;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy WhitelistRegistry
        WhitelistRegistry whitelistRegistry = new WhitelistRegistry(owner);
        console.log("WhitelistRegistry deployed at:", address(whitelistRegistry));

        // 2. Deploy TieredLiquidationMorpho
        //    constructor(address _morpho, address _whitelistRegistry)
        //    owner = msg.sender, feeRecipient = msg.sender
        TieredLiquidationMorpho tieredLiquidation = new TieredLiquidationMorpho(
            MORPHO,
            address(whitelistRegistry)
        );
        console.log("TieredLiquidationMorpho deployed at:", address(tieredLiquidation));

        // 3. Transfer TieredLiquidation ownership to owner (if deployer != owner)
        address deployer = vm.addr(deployerPrivateKey);
        if (deployer != owner) {
            tieredLiquidation.transferOwnership(owner);
            console.log("TieredLiquidation ownership transferred to:", owner);
        }

        // 4. Set fee recipient to owner
        tieredLiquidation.setFeeRecipient(owner);
        console.log("Fee recipient set to:", owner);

        vm.stopBroadcast();

        // Output deployment summary
        console.log("\n========================================");
        console.log("  SEPOLIA EXTENSIONS DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Morpho (existing):       ", MORPHO);
        console.log("WhitelistRegistry:       ", address(whitelistRegistry));
        console.log("TieredLiquidationMorpho: ", address(tieredLiquidation));
        console.log("Owner:                   ", owner);
        console.log("Chain ID:                ", block.chainid);
        console.log("========================================");
        console.log("\nSepolia now has FULL functionality:");
        console.log("  - Direct Morpho liquidation");
        console.log("  - One-step tiered liquidation (public)");
        console.log("  - Two-step tiered liquidation (whitelist)");
        console.log("  - Whitelist registry management");
        console.log("\nUpdate frontend config.ts with these addresses!");
    }
}

