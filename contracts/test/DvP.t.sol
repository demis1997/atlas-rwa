// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CoreFixture} from "./Core.t.sol";
import {DvP} from "../src/DvP.sol";
import {MockEUR} from "../src/MockEUR.sol";

contract DvPTest is CoreFixture {
    MockEUR internal eur;
    DvP internal dvp;

    function setUp() public override {
        super.setUp();
        eur = new MockEUR();
        dvp = new DvP(token, eur);
        mint(ALICE, 5000);
        eur.faucet(BOB, 5000000e6);
        vm.prank(ALICE);
        token.approve(address(dvp), type(uint256).max);
    }

    function instruction(uint256 quantity, uint256 cash) internal returns (uint256 id) {
        vm.prank(ALICE);
        id = dvp.propose(BOB, quantity, cash, 2000);
        vm.prank(BOB);
        dvp.accept(id);
    }

    function testAtomicSettlementAndReplay() public {
        uint256 id = instruction(100, 100000e6);
        vm.prank(BOB);
        eur.approve(address(dvp), 100000e6);
        dvp.execute(id);
        require(token.balanceOf(BOB) == 100 && eur.balanceOf(ALICE) == 100000e6);
        vm.expectRevert();
        dvp.execute(id);
    }

    function testAtomicRollbackOnPaymentFailure() public {
        uint256 id = instruction(100, 100000e6);
        vm.expectRevert();
        dvp.execute(id);
        require(token.balanceOf(ALICE) == 5000 && token.balanceOf(BOB) == 0 && eur.balanceOf(ALICE) == 0);
        (,,,,, DvP.Status status) = dvp.instructions(id);
        require(status == DvP.Status.Accepted);
    }

    function testExpiryCancellationUnauthorizedAccept() public {
        vm.prank(ALICE);
        uint256 id = dvp.propose(BOB, 100, 1000, 2000);
        vm.expectRevert();
        dvp.accept(id);
        vm.expectRevert();
        dvp.execute(id);
        vm.prank(BOB);
        dvp.accept(id);
        vm.warp(2000);
        vm.expectRevert();
        dvp.execute(id);
        vm.prank(ALICE);
        dvp.cancel(id);
        vm.expectRevert();
        dvp.execute(id);
    }

    function testRevokedIdentityCannotSettle() public {
        uint256 id = instruction(100, 1000);
        vm.prank(BOB);
        eur.approve(address(dvp), 1000);
        vm.prank(ATTESTER);
        registry.revoke(bytes32(uint256(11)), 1);
        vm.expectRevert();
        dvp.execute(id);
        require(token.balanceOf(ALICE) == 5000 && eur.balanceOf(ALICE) == 0);
    }

    function testFuzzDvP(uint256 raw) public {
        uint256 quantity = raw % 5000 + 1;
        uint256 cash = quantity * 1000e6;
        uint256 id = instruction(quantity, cash);
        vm.prank(BOB);
        eur.approve(address(dvp), cash);
        dvp.execute(id);
        require(
            token.balanceOf(BOB) == quantity && eur.balanceOf(ALICE) == cash
                && token.balanceOf(ALICE) + token.balanceOf(BOB) == 5000
        );
    }
}
