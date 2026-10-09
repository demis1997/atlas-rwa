// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CoreFixture} from "./Core.t.sol";
import {BondOffering} from "../src/BondOffering.sol";
import {MockEUR} from "../src/MockEUR.sol";

contract OfferingFixture is CoreFixture {
    BondOffering internal offering;
    MockEUR internal eur;

    function setUp() public virtual override {
        super.setUp();
        eur = new MockEUR();
        offering = new BondOffering(token, eur, ADMIN, ISSUER, OFFICER, ISSUER, 1000e6, 200000);
        bytes32 role = token.ISSUER_ROLE();
        vm.startPrank(ADMIN);
        token.grantRole(role, address(offering));
        token.revokeRole(role, ISSUER);
        vm.stopPrank();
        eur.faucet(ALICE, 5000000e6);
        vm.prank(ALICE);
        eur.approve(address(offering), type(uint256).max);
        vm.prank(OFFICER);
        offering.approveOffering();
        vm.prank(ISSUER);
        offering.open();
    }
}

contract OfferingTest is OfferingFixture {
    function testPrimarySettlement() public {
        vm.prank(ALICE);
        offering.subscribe(5000);
        vm.prank(ISSUER);
        offering.close();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 4000);
        offering.settle(ALICE);
        vm.prank(ALICE);
        offering.claimRefund();
        require(
            token.balanceOf(ALICE) == 4000 && eur.balanceOf(ISSUER) == 4000000e6 && eur.balanceOf(ALICE) == 1000000e6
                && offering.escrowLiability() == 0
        );
        vm.prank(ISSUER);
        offering.finalize();
        vm.prank(ISSUER);
        offering.activate();
        require(offering.state() == BondOffering.State.Active);
    }

    function testCancelAndDoubleRefund() public {
        vm.prank(ALICE);
        offering.subscribe(100);
        vm.prank(ALICE);
        offering.cancelSubscription();
        vm.prank(ALICE);
        offering.claimRefund();
        vm.expectRevert();
        vm.prank(ALICE);
        offering.claimRefund();
        vm.prank(ISSUER);
        offering.close();
        vm.expectRevert();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 1);
        require(eur.balanceOf(ALICE) == 5000000e6);
    }

    function testNoDoubleAllocationOrSettlement() public {
        vm.prank(ALICE);
        offering.subscribe(100);
        vm.prank(ISSUER);
        offering.close();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 100);
        vm.expectRevert();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 100);
        offering.settle(ALICE);
        vm.expectRevert();
        offering.settle(ALICE);
    }

    function testIneligibleSettlementRefund() public {
        vm.prank(ALICE);
        offering.subscribe(100);
        vm.prank(ISSUER);
        offering.close();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 100);
        vm.prank(ATTESTER);
        registry.revoke(bytes32(uint256(10)), 1);
        vm.expectRevert();
        offering.settle(ALICE);
        vm.prank(ISSUER);
        offering.rejectAllocation(ALICE);
        vm.prank(ALICE);
        offering.claimRefund();
        require(token.totalSupply() == 0 && eur.balanceOf(ALICE) == 5000000e6);
    }

    function testDuplicateAndUnauthorized() public {
        vm.prank(ALICE);
        offering.subscribe(1);
        vm.expectRevert();
        vm.prank(ALICE);
        offering.subscribe(1);
        vm.expectRevert();
        offering.close();
        vm.expectRevert();
        offering.activate();
    }

    function testFuzzAllocation(uint256 raw) public {
        uint256 amount = raw % 5001;
        vm.prank(ALICE);
        offering.subscribe(5000);
        vm.prank(ISSUER);
        offering.close();
        vm.prank(ISSUER);
        offering.allocate(ALICE, amount);
        if (amount > 0) offering.settle(ALICE);
        if (amount < 5000) {
            vm.prank(ALICE);
            offering.claimRefund();
        }
        require(
            token.totalSupply() == amount && eur.balanceOf(ISSUER) == amount * 1000e6 && offering.escrowLiability() == 0
        );
    }

    function testAbortAndExpiryReclaim() public {
        vm.prank(ALICE);
        offering.subscribe(100);
        vm.prank(ISSUER);
        offering.close();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 60);
        vm.prank(ISSUER);
        offering.abort();
        vm.prank(ALICE);
        offering.reclaimUnsettled();
        vm.prank(ALICE);
        offering.claimRefund();
        require(offering.escrowLiability() == 0 && eur.balanceOf(ALICE) == 5000000e6);
        vm.expectRevert();
        offering.settle(ALICE);
    }

    function testExpiredSubscriptionExitWithoutIssuer() public {
        vm.prank(ALICE);
        offering.subscribe(100);
        vm.warp(200000);
        vm.prank(ALICE);
        offering.reclaimUnsettled();
        vm.prank(ALICE);
        offering.claimRefund();
        require(offering.escrowLiability() == 0);
    }
}
