// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SecurityToken} from "./SecurityToken.sol";
import {BondOffering} from "./BondOffering.sol";

contract CorporateActions is AccessControlDefaultAdminRules, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct Distribution {
        uint256 recordBlock;
        uint256 perToken;
        uint256 funded;
        uint256 claimed;
    }

    SecurityToken public immutable security;
    IERC20 public immutable payment;
    BondOffering public immutable offering;
    uint256 public nextId = 1;
    uint256 public distributionLiability;
    uint256 public redemptionReserve;
    mapping(uint256 => Distribution) public distributions;
    mapping(uint256 => mapping(bytes32 => bool)) public claimed;

    event DistributionCreated(uint256 indexed id, uint256 recordBlock, uint256 perToken, uint256 funded);
    event Claimed(uint256 indexed id, bytes32 indexed subject, address indexed wallet, uint256 amount);
    event RedemptionFunded(uint256 amount);
    event Redeemed(address indexed wallet, uint256 quantity, uint256 principal);

    constructor(BondOffering offering_, address admin, address operator)
        AccessControlDefaultAdminRules(2 days, admin)
    {
        require(operator != address(0) && operator != admin, "roles");
        offering = offering_;
        security = offering_.security();
        payment = offering_.payment();
        _grantRole(OPERATOR_ROLE, operator);
    }

    function _fund(uint256 amount) private {
        uint256 beforeBalance = payment.balanceOf(address(this));
        payment.safeTransferFrom(msg.sender, address(this), amount);
        require(payment.balanceOf(address(this)) - beforeBalance == amount, "unsupported payment");
    }
    /// @notice Latest completed block is the record date. Whole-token per-unit cash avoids pro-rata dust.

    function createDistribution(uint256 perToken) external onlyRole(OPERATOR_ROLE) nonReentrant returns (uint256 id) {
        require(offering.state() == BondOffering.State.Active && perToken > 0 && block.number > 0, "state");
        uint256 recordBlock = block.number - 1;
        uint256 supply = security.pastSupply(recordBlock);
        require(supply > 0, "empty record");
        uint256 amount = supply * perToken;
        id = nextId++;
        distributions[id] = Distribution(recordBlock, perToken, amount, 0);
        distributionLiability += amount;
        _fund(amount);
        emit DistributionCreated(id, recordBlock, perToken, amount);
    }

    function claim(uint256 id) external nonReentrant {
        bytes32 subject = security.identityRegistry().subjectOf(msg.sender);
        require(security.identityRegistry().isVerified(msg.sender) && !security.frozen(msg.sender), "eligibility");
        Distribution storage d = distributions[id];
        require(d.funded > 0 && !claimed[id][subject], "claim");
        uint256 amount = security.pastBalance(subject, d.recordBlock) * d.perToken;
        require(amount > 0, "entitlement");
        claimed[id][subject] = true;
        d.claimed += amount;
        require(d.claimed <= d.funded, "funding");
        distributionLiability -= amount;
        payment.safeTransfer(msg.sender, amount);
        emit Claimed(id, subject, msg.sender, amount);
    }

    function fundRedemption(uint256 amount) external onlyRole(OPERATOR_ROLE) nonReentrant {
        require(amount > 0, "amount");
        redemptionReserve += amount;
        _fund(amount);
        emit RedemptionFunded(amount);
    }

    function redeem(uint256 quantity) external nonReentrant {
        require(offering.state() == BondOffering.State.Matured && quantity > 0, "state");
        uint256 amount = quantity * offering.price();
        require(amount <= redemptionReserve, "reserve");
        redemptionReserve -= amount;
        security.retire(msg.sender, quantity);
        payment.safeTransfer(msg.sender, amount);
        emit Redeemed(msg.sender, quantity, amount);
    }
}
