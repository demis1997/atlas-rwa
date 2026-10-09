// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CoreFixture, Vm} from "./Core.t.sol";
import {SecurityToken} from "../src/SecurityToken.sol";

contract Handler {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    SecurityToken public immutable token;

    constructor(SecurityToken t) {
        token = t;
    }

    function mint(uint256 raw, bool side) external {
        vm.prank(address(2));
        token.mint(side ? address(10) : address(11), raw % 10001);
    }

    function transfer(uint256 raw, bool side) external {
        address from = side ? address(10) : address(11);
        address to = side ? address(11) : address(10);
        vm.prank(from);
        token.transfer(to, raw % 10001);
    }

    function burn(uint256 raw, bool side) external {
        vm.prank(address(2));
        token.burn(side ? address(10) : address(11), raw % 10001);
    }

    function unauthorizedMint(uint256 raw) external {
        token.mint(address(10), raw % 10001);
    }
}

contract InvariantTest is CoreFixture {
    address[] private targets;

    function setUp() public override {
        super.setUp();
        targets.push(address(new Handler(token)));
    }

    function targetContracts() public view returns (address[] memory) {
        return targets;
    }

    function invariantSupplyAndHoldings() public view {
        require(token.totalSupply() <= token.lifetimeIssued() && token.lifetimeIssued() <= 10000);
        require(token.balanceOf(ALICE) + token.balanceOf(BOB) == token.totalSupply());
        require(token.balanceOf(ALICE) <= 6000 && token.balanceOf(BOB) <= 6000);
    }
}
