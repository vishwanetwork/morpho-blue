// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.19 <0.9.0;

import "../BaseTest.sol";
import {TieredLiquidationMorpho} from "../../../src/extensions/TieredLiquidationMorpho.sol";
import {WhitelistRegistry} from "../../../src/extensions/WhitelistRegistry.sol";
import {MarketParams, Position} from "../../../src/interfaces/IMorpho.sol";
import {MarketParamsLib} from "../../../src/libraries/MarketParamsLib.sol";
import {SharesMathLib} from "../../../src/libraries/SharesMathLib.sol";

/// @title TwoStepLiquidationTest
/// @notice Tests for hybrid liquidation mode: public one-step + whitelist two-step
contract TwoStepLiquidationTest is BaseTest {
    using MarketParamsLib for MarketParams;
    using SharesMathLib for uint256;

    TieredLiquidationMorpho public tieredMorpho;
    WhitelistRegistry public whitelistRegistry;
    
    address public liquidator = address(0x123);
    address public publicLiquidator = address(0x789);
    address public borrower = address(0x456);

    uint256 constant REQUEST_DEPOSIT = 0.1 ether;
    uint256 constant LOCK_DURATION = 1 hours;

    function setUp() public override {
        super.setUp();

        whitelistRegistry = new WhitelistRegistry(address(this));
        tieredMorpho = new TieredLiquidationMorpho(address(morpho), address(whitelistRegistry));

        // Configure market with hybrid mode:
        // - Public liquidation enabled (anyone can do one-step)
        // - Two-step liquidation enabled for whitelist
        // - 10% liquidation bonus
        // - 1 hour lock duration for two-step
        // - 0.1 ETH deposit required for two-step
        // 6.1 fix: register extension in Morpho core before configuring market
        vm.prank(OWNER);
        Morpho(address(morpho)).setLiquidationExtension(id, address(tieredMorpho));

        tieredMorpho.configureMarket(
            id,
            true,           // enabled
            WAD,            // maxLiquidationRatio (100%)
            0,              // cooldownPeriod (no cooldown)
            0,              // minSeizedAssets (no minimum)
            true,           // publicLiquidationEnabled
            true,           // twoStepLiquidationEnabled
            true,           // whitelistOneStepEnabled
            LOCK_DURATION,  // lockDuration
            REQUEST_DEPOSIT,// requestDeposit
            0.5e18          // protocolFee (50%)
        );

        // Setup whitelist (initializeMarket now auto-enables whitelist)
        whitelistRegistry.initializeMarket(id, address(this));
        whitelistRegistry.addLiquidator(id, liquidator);

        // Fund the contract for potential refunds
        vm.deal(address(this), 10 ether);
    }

    function _setupBorrowerPosition(uint256 collateralAmount, uint256 borrowAmount) internal {
        loanToken.setBalance(SUPPLIER, 100 ether);
        vm.startPrank(SUPPLIER);
        loanToken.approve(address(morpho), type(uint256).max);
        morpho.supply(marketParams, 100 ether, 0, SUPPLIER, "");
        vm.stopPrank();

        collateralToken.setBalance(borrower, collateralAmount);
        vm.startPrank(borrower);
        collateralToken.approve(address(morpho), type(uint256).max);
        morpho.supplyCollateral(marketParams, collateralAmount, borrower, "");
        morpho.borrow(marketParams, borrowAmount, 0, borrower, borrower);
        vm.stopPrank();
    }

    /* ============ ONE-STEP PUBLIC LIQUIDATION TESTS ============ */

    function testPublicLiquidationAllowed() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100); // Make position unhealthy

        loanToken.setBalance(publicLiquidator, 20 ether);

        vm.startPrank(publicLiquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        // Public liquidator can use one-step liquidation
        (uint256 seized, uint256 repaid) = tieredMorpho.liquidate(
            marketParams,
            borrower,
            1 ether,  // seizedAssets
            0,        // repaidShares (compute from seized)
            ""
        );
        vm.stopPrank();

        assertGt(repaid, 0, "Should repay debt");
        assertGt(seized, 0, "Should seize collateral");
    }

    function testPublicLiquidationBlockedWhenDisabled() public {
        // Reconfigure market to disable public liquidation
        tieredMorpho.configureMarket(
            id,
            true,           // enabled
            WAD,            // maxLiquidationRatio
            0,              // cooldownPeriod
            0,              // minSeizedAssets
            false,          // publicLiquidationEnabled = false
            true,           // twoStepLiquidationEnabled
            false,          // whitelistOneStepEnabled = false (force two-step)
            LOCK_DURATION,
            REQUEST_DEPOSIT,
            0.5e18
        );

        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        loanToken.setBalance(publicLiquidator, 20 ether);

        vm.startPrank(publicLiquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        // Should revert for non-whitelisted user
        vm.expectRevert(TieredLiquidationMorpho.PublicLiquidationNotEnabled.selector);
        tieredMorpho.liquidate(marketParams, borrower, 1 ether, 0, "");
        vm.stopPrank();
    }

    /* ============ TWO-STEP WHITELIST LIQUIDATION TESTS ============ */

    function testRequestLiquidationWithDeposit() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        // Request liquidation with deposit (Step 1 - only locks the right)
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(
            marketParams,
            borrower,
            0.5e18  // 50% liquidation ratio
        );
        vm.stopPrank();

        // Verify request was created (NOT executed yet)
        (
            address reqLiquidator,
            uint256 requestTimestamp,
            uint256 liquidationRatio,
            uint256 depositAmount,
            TieredLiquidationMorpho.LiquidationStatus status,
            uint256 expiresAt
        ) = tieredMorpho.getLiquidationRequest(id, borrower);

        assertEq(reqLiquidator, liquidator, "Liquidator should be set");
        assertEq(liquidationRatio, 0.5e18, "Ratio should be 50%");
        assertEq(depositAmount, REQUEST_DEPOSIT, "Deposit should be recorded");
        assertEq(uint256(status), uint256(TieredLiquidationMorpho.LiquidationStatus.Pending), "Status should be pending");
        assertEq(expiresAt, requestTimestamp + LOCK_DURATION, "Expires at should be correct");

        // Position should still have full debt (liquidation not executed yet!)
        Position memory pos = morpho.position(id, borrower);
        assertGt(pos.borrowShares, 0, "Borrower should still have debt");
    }

    function testExecuteLiquidationAfterRequest() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        uint256 liquidatorEthBefore = liquidator.balance;

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        // Step 1: Request liquidation
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);

        // Step 2: Execute liquidation (actual liquidation happens here)
        (uint256 actualSeized, uint256 actualRepaid) = tieredMorpho.executeLiquidation(
            marketParams,
            borrower,
            ""
        );
        vm.stopPrank();

        assertGt(actualRepaid, 0, "Should repay debt");
        assertGt(actualSeized, 0, "Should seize collateral");

        // Verify deposit was refunded
        assertEq(liquidator.balance, liquidatorEthBefore, "Deposit should be refunded");

        // Verify request is completed
        (,,,,TieredLiquidationMorpho.LiquidationStatus status,) = tieredMorpho.getLiquidationRequest(id, borrower);
        assertEq(uint256(status), uint256(TieredLiquidationMorpho.LiquidationStatus.Completed), "Should be completed");
    }

    function testRequestFailsWithInsufficientDeposit() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        // Should fail with insufficient deposit
        vm.expectRevert(TieredLiquidationMorpho.InsufficientDeposit.selector);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT - 1}(marketParams, borrower, 0.5e18);
        vm.stopPrank();
    }

    function testNonWhitelistCannotRequestTwoStep() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(publicLiquidator, 1 ether);
        loanToken.setBalance(publicLiquidator, 20 ether);

        vm.startPrank(publicLiquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        // Non-whitelisted user cannot use two-step
        vm.expectRevert(TieredLiquidationMorpho.Unauthorized.selector);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();
    }

    /* ============ LOCK AND EXPIRY TESTS (DoS Prevention) ============ */

    function testCannotLiquidateWhileLocked() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        // Liquidator requests liquidation
        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Public liquidator tries to liquidate while request is pending
        loanToken.setBalance(publicLiquidator, 20 ether);
        vm.startPrank(publicLiquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        vm.expectRevert(TieredLiquidationMorpho.LiquidationRequestLocked.selector);
        tieredMorpho.liquidate(marketParams, borrower, 1 ether, 0, "");
        vm.stopPrank();
    }

    function testCanLiquidateAfterLockExpires() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        // Liquidator requests but doesn't execute
        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Time passes beyond lock duration
        vm.warp(block.timestamp + LOCK_DURATION + 1);

        // Now public liquidator can liquidate (expired request is cleared)
        loanToken.setBalance(publicLiquidator, 20 ether);
        vm.startPrank(publicLiquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        (uint256 seized, uint256 repaid) = tieredMorpho.liquidate(marketParams, borrower, 1 ether, 0, "");
        vm.stopPrank();

        assertGt(repaid, 0, "Should repay debt after lock expires");
        assertGt(seized, 0, "Should seize collateral after lock expires");
    }

    function testExecuteFailsAfterExpiry() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);

        // Time passes beyond lock duration
        vm.warp(block.timestamp + LOCK_DURATION + 1);

        // Should fail - request expired
        vm.expectRevert(TieredLiquidationMorpho.LiquidationRequestExpired.selector);
        tieredMorpho.executeLiquidation(marketParams, borrower, "");
        vm.stopPrank();
    }

    function testExecuteFailsWhenMarketDisabledAfterRequest() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Admin disables market: pending requests must no longer execute.
        tieredMorpho.configureMarket(
            id,
            false,          // enabled
            WAD,            // maxLiquidationRatio
            0,              // cooldownPeriod
            0,              // minSeizedAssets
            true,           // publicLiquidationEnabled
            true,           // twoStepLiquidationEnabled
            true,           // whitelistOneStepEnabled
            LOCK_DURATION,
            REQUEST_DEPOSIT,
            0.5e18
        );

        vm.prank(liquidator);
        vm.expectRevert(TieredLiquidationMorpho.MarketNotConfigured.selector);
        tieredMorpho.executeLiquidation(marketParams, borrower, "");
    }

    function testCanCancelPendingRequestAfterMarketDisabled() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);
        uint256 liquidatorEthBefore = liquidator.balance;

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Admin disables market: liquidator should still be able to cancel and recover deposit.
        tieredMorpho.configureMarket(
            id,
            false,          // enabled
            WAD,            // maxLiquidationRatio
            0,              // cooldownPeriod
            0,              // minSeizedAssets
            true,           // publicLiquidationEnabled
            true,           // twoStepLiquidationEnabled
            true,           // whitelistOneStepEnabled
            LOCK_DURATION,
            REQUEST_DEPOSIT,
            0.5e18
        );

        vm.prank(liquidator);
        tieredMorpho.cancelLiquidationRequest(marketParams, borrower);

        assertEq(liquidator.balance, liquidatorEthBefore, "Deposit should be refunded after cancel");
    }

    function testExecuteFailsWhenTwoStepDisabledAfterRequest() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Keep market enabled but disable two-step mode.
        tieredMorpho.configureMarket(
            id,
            true,           // enabled
            WAD,            // maxLiquidationRatio
            0,              // cooldownPeriod
            0,              // minSeizedAssets
            true,           // publicLiquidationEnabled
            false,          // twoStepLiquidationEnabled
            true,           // whitelistOneStepEnabled
            0,              // lockDuration ignored when two-step disabled
            REQUEST_DEPOSIT,
            0.5e18
        );

        vm.prank(liquidator);
        vm.expectRevert(TieredLiquidationMorpho.TwoStepLiquidationNotEnabled.selector);
        tieredMorpho.executeLiquidation(marketParams, borrower, "");
    }

    /* ============ CANCEL REQUEST TESTS ============ */

    function testCancelRequestByLiquidator() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        uint256 liquidatorEthBefore = liquidator.balance;

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        
        // Cancel request
        tieredMorpho.cancelLiquidationRequest(marketParams, borrower);
        vm.stopPrank();

        // Verify deposit refunded
        assertEq(liquidator.balance, liquidatorEthBefore, "Deposit should be refunded on cancel");

        // Verify request is cleared
        (address reqLiquidator,,,,TieredLiquidationMorpho.LiquidationStatus status,) = 
            tieredMorpho.getLiquidationRequest(id, borrower);
        assertEq(reqLiquidator, address(0), "Request should be cleared");
        assertEq(uint256(status), uint256(TieredLiquidationMorpho.LiquidationStatus.None), "Status should be None");
    }

    function testAnyoneCanCancelExpiredRequest() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        uint256 liquidatorEthBefore = liquidator.balance - REQUEST_DEPOSIT; // After deposit

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Time passes beyond lock duration
        vm.warp(block.timestamp + LOCK_DURATION + 1);

        // Anyone can cancel expired request
        vm.prank(publicLiquidator);
        tieredMorpho.cancelLiquidationRequest(marketParams, borrower);

        // Deposit should still go to original liquidator
        assertEq(liquidator.balance, liquidatorEthBefore + REQUEST_DEPOSIT, "Deposit should be refunded to original liquidator");
    }

    function testCannotCancelUnexpiredRequestByOthers() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Other user cannot cancel unexpired request
        vm.prank(publicLiquidator);
        vm.expectRevert(TieredLiquidationMorpho.RequestNotExpired.selector);
        tieredMorpho.cancelLiquidationRequest(marketParams, borrower);
    }

    /* ============ HYBRID MODE TESTS ============ */

    function testWhitelistCanUseEitherMode() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        
        // Whitelisted user can use one-step liquidation
        (uint256 seized, uint256 repaid) = tieredMorpho.liquidate(marketParams, borrower, 1 ether, 0, "");
        vm.stopPrank();

        assertGt(repaid, 0, "Whitelist user should be able to use one-step");
        assertGt(seized, 0, "Should seize collateral");
    }

    function testWhitelistOneStepBlockedWhenDisabled() public {
        // 6.8 fix: disable whitelist one-step so whitelisted users must use two-step
        tieredMorpho.configureMarket(
            id,
            true,           // enabled
            WAD,            // maxLiquidationRatio
            0,              // cooldownPeriod
            0,              // minSeizedAssets
            false,          // publicLiquidationEnabled
            true,           // twoStepLiquidationEnabled
            false,          // whitelistOneStepEnabled = false
            LOCK_DURATION,
            REQUEST_DEPOSIT,
            0.5e18
        );

        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);

        // Whitelisted user should be blocked from one-step when whitelistOneStepEnabled = false
        vm.expectRevert(TieredLiquidationMorpho.WhitelistOneStepNotEnabled.selector);
        tieredMorpho.liquidate(marketParams, borrower, 1 ether, 0, "");
        vm.stopPrank();

        // But whitelisted user can still use two-step
        vm.startPrank(liquidator);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);

        (uint256 actualSeized, uint256 actualRepaid) = tieredMorpho.executeLiquidation(marketParams, borrower, "");
        vm.stopPrank();

        assertGt(actualRepaid, 0, "Whitelist user should be able to use two-step");
        assertGt(actualSeized, 0, "Should seize collateral via two-step");
    }

    function testViewFunctions() public {
        // Test canLiquidateOneStep
        assertTrue(tieredMorpho.canLiquidateOneStep(id, publicLiquidator), "Public should be able to one-step");
        assertTrue(tieredMorpho.canLiquidateOneStep(id, liquidator), "Whitelist should be able to one-step");

        // Test canLiquidateTwoStep
        assertFalse(tieredMorpho.canLiquidateTwoStep(id, publicLiquidator), "Public should NOT be able to two-step");
        assertTrue(tieredMorpho.canLiquidateTwoStep(id, liquidator), "Whitelist should be able to two-step");
    }

    function testViewFunctionsWhitelistOneStepDisabled() public {
        // Disable whitelist one-step
        tieredMorpho.configureMarket(
            id,
            true,           // enabled
            WAD,
            0,
            0,
            false,          // publicLiquidationEnabled
            true,           // twoStepLiquidationEnabled
            false,          // whitelistOneStepEnabled = false
            LOCK_DURATION,
            REQUEST_DEPOSIT,
            0.5e18
        );

        assertFalse(tieredMorpho.canLiquidateOneStep(id, liquidator), "Whitelist should NOT be able to one-step when disabled");
        assertTrue(tieredMorpho.canLiquidateTwoStep(id, liquidator), "Whitelist should still be able to two-step");
    }

    /* ============ 6.9 FIX: LOCK DURATION CHANGE TESTS ============ */

    function testLockDurationChangeDoesNotAffectExistingRequest() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Verify expiresAt is based on original lockDuration (1 hour)
        (,,,,, uint256 originalExpiresAt) = tieredMorpho.getLiquidationRequest(id, borrower);
        assertEq(originalExpiresAt, block.timestamp + LOCK_DURATION, "expiresAt should use original lockDuration");

        // Admin doubles the lockDuration to 2 hours
        tieredMorpho.configureMarket(
            id,
            true,
            WAD,
            0,
            0,
            true,
            true,
            true,
            LOCK_DURATION * 2,  // doubled
            REQUEST_DEPOSIT,
            0.5e18
        );

        // expiresAt should remain unchanged
        (,,,,, uint256 afterChangeExpiresAt) = tieredMorpho.getLiquidationRequest(id, borrower);
        assertEq(afterChangeExpiresAt, originalExpiresAt, "expiresAt must NOT change when lockDuration is updated");

        // Liquidator can still execute within original window
        vm.prank(liquidator);
        (uint256 seized, uint256 repaid) = tieredMorpho.executeLiquidation(marketParams, borrower, "");

        assertGt(repaid, 0, "Should execute with original expiresAt");
        assertGt(seized, 0, "Should seize collateral");
    }

    function testReducedLockDurationDoesNotExpireExistingRequest() public {
        uint256 collateralAmount = 10 ether;
        uint256 borrowAmount = 7 ether;

        _setupBorrowerPosition(collateralAmount, borrowAmount);
        oracle.setPrice(ORACLE_PRICE_SCALE * 85 / 100);

        vm.deal(liquidator, 1 ether);
        loanToken.setBalance(liquidator, 20 ether);

        vm.startPrank(liquidator);
        loanToken.approve(address(tieredMorpho), type(uint256).max);
        tieredMorpho.requestLiquidation{value: REQUEST_DEPOSIT}(marketParams, borrower, 0.5e18);
        vm.stopPrank();

        // Admin reduces lockDuration to 1 second
        tieredMorpho.configureMarket(
            id,
            true,
            WAD,
            0,
            0,
            true,
            true,
            true,
            1,              // reduced to 1 second
            REQUEST_DEPOSIT,
            0.5e18
        );

        // Wait 2 seconds — would be expired under new config, but NOT under snapshot
        vm.warp(block.timestamp + 2);

        // Request should still be valid (expiresAt was snapshot at original lockDuration)
        vm.prank(liquidator);
        (uint256 seized, uint256 repaid) = tieredMorpho.executeLiquidation(marketParams, borrower, "");

        assertGt(repaid, 0, "Should NOT expire under reduced lockDuration");
        assertGt(seized, 0, "Should seize collateral");
    }

    receive() external payable {}
}
