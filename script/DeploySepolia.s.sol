// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import {Morpho} from "../src/Morpho.sol";
import {WhitelistRegistry} from "../src/extensions/WhitelistRegistry.sol";
import {TieredLiquidationMorpho} from "../src/extensions/TieredLiquidationMorpho.sol";
import {OracleMock} from "../src/mocks/OracleMock.sol";
import {StepwiseIrm} from "../src/irm/StepwiseIrm.sol";

/// @title MockERC20Full
/// @notice ERC20 mock with name, symbol, decimals for Sepolia testing
contract MockERC20Full {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @title DeploySepolia
/// @notice Full deployment script for Sepolia testnet
/// @dev Deploys: Morpho + WhitelistRegistry + TieredLiquidation + Mock tokens + Oracle
contract DeploySepolia is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // ============================================
        // 1. Deploy Core: Morpho
        // ============================================
        Morpho morpho = new Morpho(owner);
        console.log("Morpho deployed at:", address(morpho));

        // ============================================
        // 2. Deploy Extensions: WhitelistRegistry + TieredLiquidation
        // ============================================
        WhitelistRegistry whitelistRegistry = new WhitelistRegistry(owner);
        console.log("WhitelistRegistry deployed at:", address(whitelistRegistry));

        TieredLiquidationMorpho tieredLiquidation = new TieredLiquidationMorpho(
            address(morpho),
            address(whitelistRegistry)
        );
        console.log("TieredLiquidationMorpho deployed at:", address(tieredLiquidation));

        // Set fee recipient
        tieredLiquidation.setFeeRecipient(owner);

        // ============================================
        // 3. Deploy Mock Tokens
        // ============================================
        MockERC20Full usdc = new MockERC20Full("Mock USDC", "USDC", 6);
        console.log("Mock USDC deployed at:", address(usdc));

        MockERC20Full weth = new MockERC20Full("Mock WETH", "WETH", 18);
        console.log("Mock WETH deployed at:", address(weth));

        // ============================================
        // 4. Deploy Mock Oracle
        // ============================================
        OracleMock oracle = new OracleMock();
        console.log("Mock Oracle deployed at:", address(oracle));

        // Set oracle price: 1 WETH = 2000 USDC
        // Price = 2000 * 10^(36 + 6 - 18) = 2000 * 10^24
        uint256 price = 2000 * 10 ** 24;
        oracle.setPrice(price);
        console.log("Oracle price set to 2000 USDC/WETH");

        // ============================================
        // 5. Configure Morpho
        // ============================================
        StepwiseIrm stepwiseIrm = new StepwiseIrm();
        console.log("StepwiseIrm deployed at:", address(stepwiseIrm));

        morpho.enableIrm(address(stepwiseIrm));
        console.log("IRM enabled (StepwiseIrm)");

        uint256 lltv = 0.8e18;
        morpho.enableLltv(lltv);
        console.log("LLTV 80% enabled");

        // ============================================
        // 6. Mint test tokens to deployer
        // ============================================
        address deployer = vm.addr(deployerPrivateKey);
        usdc.mint(deployer, 1_000_000 * 10 ** 6); // 1M USDC
        weth.mint(deployer, 1000 * 10 ** 18); // 1000 WETH
        console.log("Minted 1M USDC and 1000 WETH to deployer");

        vm.stopBroadcast();

        // Output deployment summary
        console.log("\n========================================");
        console.log("    SEPOLIA FULL DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Morpho:                  ", address(morpho));
        console.log("WhitelistRegistry:       ", address(whitelistRegistry));
        console.log("TieredLiquidationMorpho: ", address(tieredLiquidation));
        console.log("StepwiseIrm:             ", address(stepwiseIrm));
        console.log("Mock USDC:               ", address(usdc));
        console.log("Mock WETH:               ", address(weth));
        console.log("Mock Oracle:             ", address(oracle));
        console.log("Owner:                   ", owner);
        console.log("Chain ID:                ", block.chainid);
        console.log("LLTV:                     80%");
        console.log("Oracle Price:              1 WETH = 2000 USDC");
        console.log("========================================");
        console.log("\nFeatures available:");
        console.log("  - Core: supply, borrow, withdraw, repay, collateral");
        console.log("  - Direct Morpho liquidation");
        console.log("  - One-step tiered liquidation (public)");
        console.log("  - Two-step tiered liquidation (whitelist)");
        console.log("  - Whitelist registry management");
        console.log("\nNext steps:");
        console.log("1. Update frontend/src/contracts/config.ts with these addresses");
        console.log("2. Create a market with: USDC (loan), WETH (collateral), Oracle, IRM=0x0, LLTV=80%");
    }
}
