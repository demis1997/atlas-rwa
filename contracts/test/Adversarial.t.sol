// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CoreFixture} from "./Core.t.sol";
import {MockEUR} from "../src/MockEUR.sol";
import {DvP} from "../src/DvP.sol";
import {BondOffering} from "../src/BondOffering.sol";

contract FeeEUR is MockEUR {
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount - 1);
        _burn(from, 1);
        return true;
    }
}

contract CallbackEUR is MockEUR {
    DvP public target;
    bool public blocked;

    function configure(DvP target_) external {
        target = target_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        (bool success,) = address(target).call(abi.encodeCall(DvP.execute, (1)));
        blocked = !success;
        return super.transferFrom(from, to, amount);
    }
}

contract AdversarialTest is CoreFixture {
    function testFeePaymentRollsBackDelivery() public {
        FeeEUR cash = new FeeEUR();
        DvP dvp = new DvP(token, cash);
        mint(ALICE, 100);
        cash.faucet(BOB, 1000);
        vm.prank(ALICE);
        token.approve(address(dvp), 100);
        vm.prank(BOB);
        cash.approve(address(dvp), 1000);
        vm.prank(ALICE);
        dvp.propose(BOB, 100, 1000, 2000);
        vm.prank(BOB);
        dvp.accept(1);
        vm.expectRevert();
        dvp.execute(1);
        require(token.balanceOf(ALICE) == 100 && cash.balanceOf(BOB) == 1000 && cash.totalSupply() == 1000);
    }

    function testReentrantExecuteBlocked() public {
        CallbackEUR cash = new CallbackEUR();
        DvP dvp = new DvP(token, cash);
        cash.configure(dvp);
        mint(ALICE, 100);
        cash.faucet(BOB, 1000);
        vm.prank(ALICE);
        token.approve(address(dvp), 100);
        vm.prank(BOB);
        cash.approve(address(dvp), 1000);
        vm.prank(ALICE);
        dvp.propose(BOB, 100, 1000, 2000);
        vm.prank(BOB);
        dvp.accept(1);
        dvp.execute(1);
        require(cash.blocked() && token.balanceOf(BOB) == 100 && cash.balanceOf(ALICE) == 1000);
    }

    function testSubscriptionRejectsFeePayment() public {
        FeeEUR cash = new FeeEUR();
        BondOffering offering = new BondOffering(token, cash, ADMIN, ISSUER, OFFICER, ISSUER, 1000, 2000);
        vm.prank(OFFICER);
        offering.approveOffering();
        vm.prank(ISSUER);
        offering.open();
        cash.faucet(ALICE, 1000);
        vm.prank(ALICE);
        cash.approve(address(offering), 1000);
        vm.expectRevert();
        vm.prank(ALICE);
        offering.subscribe(1);
        require(offering.unresolved() == 0 && offering.escrowLiability() == 0 && cash.balanceOf(ALICE) == 1000);
    }
}
