// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SecurityToken} from "./SecurityToken.sol";
/// @notice Two-party on-chain authorization; no standing authority beyond each immutable instruction.

contract DvP is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Proposed,
        Accepted,
        Settled,
        Cancelled
    }

    struct Instruction {
        address seller;
        address buyer;
        uint256 quantity;
        uint256 consideration;
        uint64 expiry;
        Status status;
    }

    SecurityToken public immutable security;
    IERC20 public immutable payment;
    uint256 public nextId = 1;
    mapping(uint256 => Instruction) public instructions;

    event Proposed(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        uint256 quantity,
        uint256 consideration,
        uint64 expiry
    );
    event StatusChanged(uint256 indexed id, Status status);

    constructor(SecurityToken security_, IERC20 payment_) {
        require(
            address(security_).code.length > 0 && address(payment_).code.length > 0
                && address(security_) != address(payment_),
            "assets"
        );
        security = security_;
        payment = payment_;
    }

    function propose(address buyer, uint256 quantity, uint256 consideration, uint64 expiry)
        external
        returns (uint256 id)
    {
        require(
            buyer != address(0) && buyer != msg.sender && quantity > 0 && consideration > 0 && expiry > block.timestamp,
            "instruction"
        );
        id = nextId++;
        instructions[id] = Instruction(msg.sender, buyer, quantity, consideration, expiry, Status.Proposed);
        emit Proposed(id, msg.sender, buyer, quantity, consideration, expiry);
    }

    function accept(uint256 id) external {
        Instruction storage i = instructions[id];
        require(i.buyer == msg.sender && i.status == Status.Proposed && block.timestamp < i.expiry, "authorization");
        i.status = Status.Accepted;
        emit StatusChanged(id, i.status);
    }

    function cancel(uint256 id) external {
        Instruction storage i = instructions[id];
        require(
            (msg.sender == i.seller || msg.sender == i.buyer)
                && (i.status == Status.Proposed || i.status == Status.Accepted),
            "authorization"
        );
        i.status = Status.Cancelled;
        emit StatusChanged(id, i.status);
    }

    function execute(uint256 id) external nonReentrant {
        Instruction storage i = instructions[id];
        require(i.status == Status.Accepted && block.timestamp < i.expiry, "state");
        require(security.canTransfer(i.seller, i.buyer, i.quantity), "eligibility");
        i.status = Status.Settled;
        uint256 sellerCash = payment.balanceOf(i.seller);
        uint256 buyerCash = payment.balanceOf(i.buyer);
        IERC20(address(security)).safeTransferFrom(i.seller, i.buyer, i.quantity);
        payment.safeTransferFrom(i.buyer, i.seller, i.consideration);
        require(
            payment.balanceOf(i.seller) == sellerCash + i.consideration
                && payment.balanceOf(i.buyer) == buyerCash - i.consideration,
            "payment mismatch"
        );
        emit StatusChanged(id, i.status);
    }
}
