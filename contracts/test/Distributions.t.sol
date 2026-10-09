// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OfferingFixture} from "./Offering.t.sol";
import {CorporateActions} from "../src/CorporateActions.sol";

contract DistributionsTest is OfferingFixture {
    CorporateActions internal actions;

    function setUp() public override {
        super.setUp();
        vm.prank(ALICE);
        offering.subscribe(100);
        vm.prank(ISSUER);
        offering.close();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 100);
        offering.settle(ALICE);
        vm.prank(ISSUER);
        offering.finalize();
        vm.prank(ISSUER);
        offering.activate();
        actions = new CorporateActions(offering, ADMIN, AGENT);
        eur.faucet(AGENT, 1000000e6);
        vm.prank(AGENT);
        eur.approve(address(actions), type(uint256).max);
    }

    function testEmptyRecordRejected() public {
        vm.expectRevert();
        vm.prank(AGENT);
        actions.createDistribution(1);
    }

    function testMultipleDistributionsAndTransferAfterRecord() public {
        vm.roll(block.number + 1);
        vm.prank(AGENT);
        uint256 first = actions.createDistribution(1);
        vm.prank(ALICE);
        token.transfer(BOB, 40);
        vm.roll(block.number + 1);
        vm.prank(AGENT);
        uint256 second = actions.createDistribution(3);
        vm.prank(ALICE);
        actions.claim(first);
        vm.prank(ALICE);
        actions.claim(second);
        vm.prank(BOB);
        actions.claim(second);
        require(
            actions.distributionLiability() == 0 && eur.balanceOf(BOB) == 120 && eur.balanceOf(address(actions)) == 0
        );
    }

    function testFrozenClaimRetainedUntilUnfreeze() public {
        vm.roll(block.number + 1);
        vm.prank(AGENT);
        uint256 id = actions.createDistribution(1);
        vm.prank(OFFICER);
        token.setFreeze(ALICE, true, 0);
        vm.expectRevert();
        vm.prank(ALICE);
        actions.claim(id);
        require(actions.distributionLiability() == 100);
        vm.prank(OFFICER);
        token.setFreeze(ALICE, false, 0);
        vm.prank(ALICE);
        actions.claim(id);
        require(actions.distributionLiability() == 0);
    }

    function testInsufficientFundingCannotCreateDistribution() public {
        vm.roll(block.number + 1);
        vm.prank(AGENT);
        eur.approve(address(actions), 0);
        vm.expectRevert();
        vm.prank(AGENT);
        actions.createDistribution(1);
        require(actions.nextId() == 1 && actions.distributionLiability() == 0);
    }

    function testFuzzPerTokenConservation(uint64 raw) public {
        uint256 perToken = uint256(raw) % 1000000 + 1;
        vm.roll(block.number + 1);
        vm.prank(AGENT);
        uint256 id = actions.createDistribution(perToken);
        vm.prank(ALICE);
        actions.claim(id);
        (,, uint256 funded, uint256 claimed) = actions.distributions(id);
        require(funded == 100 * perToken && claimed == funded && actions.distributionLiability() == 0);
    }
}
