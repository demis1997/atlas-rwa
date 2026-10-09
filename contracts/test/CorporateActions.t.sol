// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OfferingFixture} from "./Offering.t.sol";
import {CorporateActions} from "../src/CorporateActions.sol";

contract CorporateActionsTest is OfferingFixture {
    CorporateActions internal actions;

    function testSnapshotRecoveryCouponAndRedemption() public {
        vm.prank(ALICE);
        offering.subscribe(5000);
        vm.prank(ISSUER);
        offering.close();
        vm.prank(ISSUER);
        offering.allocate(ALICE, 5000);
        offering.settle(ALICE);
        vm.prank(ISSUER);
        offering.finalize();
        vm.prank(ISSUER);
        offering.activate();
        actions = new CorporateActions(offering, ADMIN, AGENT);
        bytes32 role = token.REDEEMER_ROLE();
        vm.prank(ADMIN);
        token.grantRole(role, address(actions));
        eur.faucet(AGENT, 5250000e6);
        vm.prank(AGENT);
        eur.approve(address(actions), type(uint256).max);
        vm.roll(block.number + 1);
        vm.prank(AGENT);
        uint256 id = actions.createDistribution(50e6);
        vm.prank(ALICE);
        token.transfer(BOB, 1000);
        vm.prank(OFFICER);
        registry.rotate(ALICE, address(13));
        vm.prank(AGENT);
        token.recover(ALICE, address(13));
        vm.prank(address(13));
        actions.claim(id);
        require(eur.balanceOf(address(13)) == 250000e6);
        vm.expectRevert();
        vm.prank(address(13));
        actions.claim(id);
        vm.expectRevert();
        vm.prank(BOB);
        actions.claim(id);
        vm.prank(AGENT);
        actions.fundRedemption(5000000e6);
        vm.warp(200000);
        offering.mature();
        vm.prank(ATTESTER);
        registry.attest(bytes32(uint256(10)), 1, 300000, keccak256("renewal"));
        vm.prank(ATTESTER);
        registry.attest(bytes32(uint256(11)), 1, 300000, keccak256("renewal"));
        vm.prank(address(13));
        token.approve(address(actions), 4000);
        vm.prank(address(13));
        actions.redeem(4000);
        vm.prank(BOB);
        token.approve(address(actions), 1000);
        vm.prank(BOB);
        actions.redeem(1000);
        vm.expectRevert();
        vm.prank(BOB);
        actions.redeem(1);
        offering.markRedeemed();
        require(token.totalSupply() == 0 && actions.redemptionReserve() == 0 && actions.distributionLiability() == 0);
    }
}
