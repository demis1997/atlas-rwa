// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IdentityRegistry} from "./IdentityRegistry.sol";
import {Compliance} from "./Compliance.sol";

/// @notice ERC-3643-inspired reference; not a complete implementation of that standard.
contract SecurityToken is ERC20, AccessControlDefaultAdminRules {
    using Checkpoints for Checkpoints.Trace208;
    using SafeCast for uint256;

    mapping(bytes32 => Checkpoints.Trace208) private subjectHistory;
    Checkpoints.Trace208 private supplyHistory;
    bytes32 public constant REDEEMER_ROLE = keccak256("REDEEMER_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant TRANSFER_AGENT_ROLE = keccak256("TRANSFER_AGENT_ROLE");
    IdentityRegistry public immutable identityRegistry;
    Compliance public immutable compliance;
    uint256 public immutable authorizedSupply;
    uint256 public lifetimeIssued;
    bool public paused;
    mapping(address => bool) public frozen;
    mapping(address => uint256) public frozenTokens;
    mapping(address => bytes32) public holderSubject;
    mapping(bytes32 => address) public subjectHolder;
    string public documentURI;
    bytes32 public documentHash;

    event PauseChanged(bool paused);
    event FreezeChanged(address indexed wallet, bool frozen, uint256 amount);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount, bytes32 reason);
    event Recovery(address indexed from, address indexed to, bytes32 indexed subject, uint256 amount);
    event DocumentChanged(string uri, bytes32 hash);

    error Restricted();
    error SupplyExceeded();

    struct Roles {
        address admin;
        address issuer;
        address officer;
        address agent;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 cap,
        IdentityRegistry registry,
        Compliance policy,
        Roles memory roles
    ) ERC20(name_, symbol_) AccessControlDefaultAdminRules(2 days, roles.admin) {
        require(
            cap > 0 && cap <= type(uint208).max && address(registry).code.length > 0 && address(policy).code.length > 0,
            "configuration"
        );
        require(roles.issuer != address(0) && roles.officer != address(0) && roles.agent != address(0), "zero role");
        require(
            roles.admin != roles.issuer && roles.admin != roles.officer && roles.admin != roles.agent
                && roles.issuer != roles.officer && roles.issuer != roles.agent && roles.officer != roles.agent,
            "separate roles"
        );
        authorizedSupply = cap;
        identityRegistry = registry;
        compliance = policy;
        _grantRole(ISSUER_ROLE, roles.issuer);
        _grantRole(COMPLIANCE_ROLE, roles.officer);
        _grantRole(TRANSFER_AGENT_ROLE, roles.agent);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 amount) external onlyRole(ISSUER_ROLE) {
        if (amount > authorizedSupply - lifetimeIssued) revert SupplyExceeded();
        lifetimeIssued += amount;
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(ISSUER_ROLE) {
        _burn(from, amount);
    }

    function setPaused(bool value) external onlyRole(COMPLIANCE_ROLE) {
        paused = value;
        emit PauseChanged(value);
    }

    function setFreeze(address wallet, bool value, uint256 amount) external onlyRole(COMPLIANCE_ROLE) {
        require(amount <= balanceOf(wallet), "balance");
        frozen[wallet] = value;
        frozenTokens[wallet] = amount;
        emit FreezeChanged(wallet, value, amount);
    }

    function setDocument(string calldata uri, bytes32 hash) external onlyRole(ISSUER_ROLE) {
        require(bytes(uri).length > 0 && hash != bytes32(0), "document");
        documentURI = uri;
        documentHash = hash;
        emit DocumentChanged(uri, hash);
    }

    function forcedTransfer(address from, address to, uint256 amount, bytes32 reason)
        external
        onlyRole(TRANSFER_AGENT_ROLE)
    {
        require(reason != bytes32(0), "reason");
        _transfer(from, to, amount);
        emit ForcedTransfer(from, to, amount, reason);
    }

    function canTransfer(address from, address to, uint256 amount) public view returns (bool) {
        if (paused || frozen[from] || frozen[to]) return false;
        if (from != address(0) && (amount > balanceOf(from) - frozenTokens[from] || !identityRegistry.isVerified(from)))
        {
            return false;
        }
        if (to != address(0)) {
            if (!identityRegistry.isVerified(to)) return false;
            bytes32 subject = identityRegistry.subjectOf(to);
            address existing = subjectHolder[subject];
            if (existing != address(0) && existing != to && balanceOf(existing) != 0) return false;
            if (balanceOf(to) != 0 && holderSubject[to] != subject) return false;
            if (!compliance.canTransfer(address(this), from, to, amount)) return false;
        }
        return true;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (!canTransfer(from, to, amount)) revert Restricted();
        bytes32 fromSubject = holderSubject[from];
        super._update(from, to, amount);
        if (from != address(0)) subjectHistory[fromSubject].push(block.number.toUint48(), balanceOf(from).toUint208());
        if (to != address(0)) {
            subjectHistory[identityRegistry.subjectOf(to)].push(block.number.toUint48(), balanceOf(to).toUint208());
        }
        supplyHistory.push(block.number.toUint48(), totalSupply().toUint208());
        _track(from, to);
    }

    function pastBalance(bytes32 subject, uint256 blockNumber) external view returns (uint256) {
        require(blockNumber < block.number, "past block");
        return subjectHistory[subject].upperLookupRecent(blockNumber.toUint48());
    }

    function pastSupply(uint256 blockNumber) external view returns (uint256) {
        require(blockNumber < block.number, "past block");
        return supplyHistory.upperLookupRecent(blockNumber.toUint48());
    }

    function retire(address investor, uint256 amount) external onlyRole(REDEEMER_ROLE) {
        _spendAllowance(investor, msg.sender, amount);
        _burn(investor, amount);
    }

    function _track(address from, address to) private {
        if (from != address(0) && balanceOf(from) == 0) {
            bytes32 subject = holderSubject[from];
            if (subjectHolder[subject] == from) delete subjectHolder[subject];
            delete holderSubject[from];
        }
        if (to != address(0) && balanceOf(to) > 0) {
            bytes32 subject = identityRegistry.subjectOf(to);
            holderSubject[to] = subject;
            subjectHolder[subject] = to;
        }
    }
    /// @notice Exception for old eligibility and frozen balance only; freeze state follows recovered holdings.

    function recover(address from, address to) external onlyRole(TRANSFER_AGENT_ROLE) {
        bytes32 subject = holderSubject[from];
        uint256 amount = balanceOf(from);
        if (
            paused || from == to || amount == 0 || subject == bytes32(0) || balanceOf(to) != 0 || frozenTokens[to] != 0
                || frozen[to] || !identityRegistry.isVerified(to) || identityRegistry.subjectOf(to) != subject
                || identityRegistry.subjectOf(from) != bytes32(0)
        ) revert Restricted();
        if (!compliance.canTransfer(address(this), from, to, amount)) revert Restricted();
        frozen[to] = frozen[from];
        frozenTokens[to] = frozenTokens[from];
        delete frozen[from];
        delete frozenTokens[from];
        super._update(from, to, amount);
        _track(from, to);
        emit Recovery(from, to, subject, amount);
        emit FreezeChanged(to, frozen[to], frozenTokens[to]);
    }
}
