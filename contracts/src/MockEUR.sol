// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @notice Unrestricted faucet for local demonstrations. Not real money.

contract MockEUR is ERC20 {
    constructor() ERC20("SIMULATED Euro", "mockEUR") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
