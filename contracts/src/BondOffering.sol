// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SecurityToken} from "./SecurityToken.sol";

contract BondOffering is AccessControlDefaultAdminRules, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");

    enum State {
        Draft,
        Approved,
        SubscriptionOpen,
        Allocated,
        Issued,
        Active,
        Matured,
        Redeemed,
        Cancelled
    }
    enum Status {
        None,
        Pending,
        Allocated,
        Settled,
        Cancelled,
        Rejected
    }

    struct Subscription {
        uint256 requested;
        uint256 allocated;
        Status status;
    }

    SecurityToken public immutable security;
    IERC20 public immutable payment;
    address public immutable treasury;
    uint256 public immutable price;
    uint64 public immutable maturity;
    State public state;
    mapping(address => Subscription) public subscriptions;
    mapping(address => uint256) public refunds;
    uint256 public unresolved;
    uint256 public totalAllocated;
    uint256 public totalSettled;
    uint256 public escrowLiability;

    event StateChanged(State state);
    event SubscriptionChanged(address indexed investor, Status status, uint256 requested, uint256 allocated);
    event RefundClaimed(address indexed investor, uint256 amount);

    constructor(
        SecurityToken security_,
        IERC20 payment_,
        address admin,
        address issuer,
        address approver,
        address treasury_,
        uint256 price_,
        uint64 maturity_
    ) AccessControlDefaultAdminRules(2 days, admin) {
        require(
            address(security_).code.length > 0 && address(payment_).code.length > 0 && treasury_ != address(0)
                && price_ > 0 && maturity_ > block.timestamp,
            "terms"
        );
        require(
            issuer != address(0) && approver != address(0) && issuer != approver && issuer != admin && approver != admin,
            "roles"
        );
        security = security_;
        payment = payment_;
        treasury = treasury_;
        price = price_;
        maturity = maturity_;
        _grantRole(ISSUER_ROLE, issuer);
        _grantRole(APPROVER_ROLE, approver);
    }

    function _transition(State next) private {
        state = next;
        emit StateChanged(next);
    }

    function approveOffering() external onlyRole(APPROVER_ROLE) {
        require(state == State.Draft, "state");
        _transition(State.Approved);
    }

    function open() external onlyRole(ISSUER_ROLE) {
        require(state == State.Approved && block.timestamp < maturity, "state");
        _transition(State.SubscriptionOpen);
    }

    function close() external onlyRole(ISSUER_ROLE) {
        require(state == State.SubscriptionOpen, "state");
        _transition(State.Allocated);
    }

    function subscribe(uint256 quantity) external nonReentrant {
        require(
            state == State.SubscriptionOpen && block.timestamp < maturity && quantity > 0
                && quantity <= security.authorizedSupply(),
            "subscription"
        );
        require(
            subscriptions[msg.sender].status == Status.None && security.canTransfer(address(0), msg.sender, quantity),
            "eligibility"
        );
        uint256 amount = quantity * price;
        subscriptions[msg.sender] = Subscription(quantity, 0, Status.Pending);
        ++unresolved;
        escrowLiability += amount;
        uint256 beforeBalance = payment.balanceOf(address(this));
        payment.safeTransferFrom(msg.sender, address(this), amount);
        require(payment.balanceOf(address(this)) - beforeBalance == amount, "unsupported payment");
        emit SubscriptionChanged(msg.sender, Status.Pending, quantity, 0);
    }

    function cancelSubscription() external {
        Subscription storage s = subscriptions[msg.sender];
        require(state == State.SubscriptionOpen && s.status == Status.Pending, "state");
        s.status = Status.Cancelled;
        --unresolved;
        refunds[msg.sender] += s.requested * price;
        emit SubscriptionChanged(msg.sender, s.status, s.requested, 0);
    }

    function allocate(address investor, uint256 quantity) external onlyRole(ISSUER_ROLE) {
        Subscription storage s = subscriptions[investor];
        require(state == State.Allocated && s.status == Status.Pending && quantity <= s.requested, "allocation");
        require(totalAllocated + quantity <= security.authorizedSupply(), "cap");
        totalAllocated += quantity;
        s.allocated = quantity;
        refunds[investor] += (s.requested - quantity) * price;
        s.status = quantity == 0 ? Status.Rejected : Status.Allocated;
        if (quantity == 0) --unresolved;
        emit SubscriptionChanged(investor, s.status, s.requested, quantity);
    }

    function settle(address investor) external nonReentrant {
        Subscription storage s = subscriptions[investor];
        require(state == State.Allocated && s.status == Status.Allocated && block.timestamp < maturity, "state");
        s.status = Status.Settled;
        --unresolved;
        totalSettled += s.allocated;
        uint256 amount = s.allocated * price;
        escrowLiability -= amount;
        security.mint(investor, s.allocated);
        payment.safeTransfer(treasury, amount);
        emit SubscriptionChanged(investor, s.status, s.requested, s.allocated);
    }
    /// @notice Issuer can release a now-ineligible allocation without trapping its escrow.

    function rejectAllocation(address investor) external onlyRole(ISSUER_ROLE) {
        Subscription storage s = subscriptions[investor];
        require(state == State.Allocated && s.status == Status.Allocated, "state");
        totalAllocated -= s.allocated;
        refunds[investor] += s.allocated * price;
        s.status = Status.Rejected;
        --unresolved;
        emit SubscriptionChanged(investor, s.status, s.requested, s.allocated);
    }

    function abort() external onlyRole(ISSUER_ROLE) {
        require(totalSettled == 0 && (state == State.SubscriptionOpen || state == State.Allocated), "state");
        _transition(State.Cancelled);
    }
    /// @notice A holder can always exit unresolved subscriptions after offering expiry or abort.

    function reclaimUnsettled() external {
        Subscription storage s = subscriptions[msg.sender];
        require(state == State.Cancelled || block.timestamp >= maturity, "state");
        require(s.status == Status.Pending || s.status == Status.Allocated, "subscription");
        if (s.status == Status.Allocated) {
            totalAllocated -= s.allocated;
            refunds[msg.sender] += s.allocated * price;
        } else {
            refunds[msg.sender] += s.requested * price;
        }
        s.status = Status.Cancelled;
        --unresolved;
        emit SubscriptionChanged(msg.sender, s.status, s.requested, s.allocated);
    }

    function claimRefund() external nonReentrant {
        uint256 amount = refunds[msg.sender];
        require(amount > 0, "refund");
        refunds[msg.sender] = 0;
        escrowLiability -= amount;
        payment.safeTransfer(msg.sender, amount);
        emit RefundClaimed(msg.sender, amount);
    }

    function finalize() external onlyRole(ISSUER_ROLE) {
        require(state == State.Allocated && unresolved == 0 && totalSettled > 0, "state");
        _transition(State.Issued);
    }

    function activate() external onlyRole(ISSUER_ROLE) {
        require(state == State.Issued && block.timestamp < maturity, "state");
        _transition(State.Active);
    }

    function mature() external {
        require(state == State.Active && block.timestamp >= maturity, "state");
        _transition(State.Matured);
    }

    function markRedeemed() external {
        require(state == State.Matured && security.totalSupply() == 0, "state");
        _transition(State.Redeemed);
    }
}
