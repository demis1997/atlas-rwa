// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OfferingFixture} from "./Offering.t.sol";
import {Vm} from "./Core.t.sol";
import {BondOffering} from "../src/BondOffering.sol";

contract EscrowHandler {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    BondOffering immutable offering;

    constructor(BondOffering o) {
        offering = o;
    }

    function subscribe(uint256 raw) external {
        vm.prank(address(10));
        offering.subscribe(raw % 5000 + 1);
    }

    function close() external {
        vm.prank(address(2));
        offering.close();
    }

    function allocate(uint256 raw) external {
        vm.prank(address(2));
        offering.allocate(address(10), raw % 5001);
    }

    function cancel() external {
        vm.prank(address(10));
        offering.cancelSubscription();
    }

    function settle() external {
        offering.settle(address(10));
    }

    function refund() external {
        vm.prank(address(10));
        offering.claimRefund();
    }

    function reject() external {
        vm.prank(address(2));
        offering.rejectAllocation(address(10));
    }
}

contract EscrowInvariantTest is OfferingFixture {
    address[] private targets;

    function setUp() public override {
        super.setUp();
        targets.push(address(new EscrowHandler(offering)));
    }

    function targetContracts() public view returns (address[] memory) {
        return targets;
    }

    function invariantEscrowAndAllocationConserved() public view {
        require(eur.balanceOf(address(offering)) == offering.escrowLiability());
        require(offering.totalAllocated() <= 10000 && token.totalSupply() == offering.totalSettled());
        require(eur.balanceOf(ALICE) + eur.balanceOf(ISSUER) + eur.balanceOf(address(offering)) == 5000000e6);
    }
}
