// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IdentityRegistry} from "./IdentityRegistry.sol";

interface IRule {
    function check(address token, address from, address to, uint256 amount) external view returns (bool);
}

contract Compliance is AccessControlDefaultAdminRules {
    bytes32 public constant POLICY_ROLE = keccak256("POLICY_ROLE");
    IRule[] public rules;

    event RulesChanged(address[] rules);

    constructor(address admin, address officer) AccessControlDefaultAdminRules(2 days, admin) {
        require(officer != address(0) && officer != admin, "roles");
        _grantRole(POLICY_ROLE, officer);
    }

    function setRules(address[] calldata modules) external onlyRole(POLICY_ROLE) {
        require(modules.length > 0 && modules.length <= 16, "rules");
        delete rules;
        for (uint256 i; i < modules.length; ++i) {
            require(modules[i].code.length > 0, "module");
            for (uint256 j; j < i; ++j) {
                require(modules[j] != modules[i], "duplicate");
            }
            rules.push(IRule(modules[i]));
        }
        emit RulesChanged(modules);
    }

    function canTransfer(address token, address from, address to, uint256 amount) external view returns (bool) {
        if (rules.length == 0) return false;
        for (uint256 i; i < rules.length; ++i) {
            if (!rules[i].check(token, from, to, amount)) return false;
        }
        return true;
    }
}
/// @notice Immutable rule parameters are changed by replacing a module, leaving an auditable history.

contract JurisdictionRule is IRule {
    IdentityRegistry public immutable registry;
    mapping(uint16 => bool) public allowed;

    constructor(IdentityRegistry registry_, uint16[] memory countries) {
        registry = registry_;
        require(countries.length > 0 && countries.length <= 250, "countries");
        for (uint256 i; i < countries.length; ++i) {
            allowed[countries[i]] = true;
        }
    }

    function check(address, address, address to, uint256) external view returns (bool) {
        return allowed[registry.countryOf(to)];
    }
}

contract HoldingLimitRule is IRule {
    uint256 public immutable maximum;

    constructor(uint256 maximum_) {
        require(maximum_ > 0, "maximum");
        maximum = maximum_;
    }

    function check(address token, address from, address to, uint256 amount) external view returns (bool) {
        return IERC20(token).balanceOf(to) + (from == to ? 0 : amount) <= maximum;
    }
}
/// @notice Concentration measured against authorized issuance, not fluctuating circulating supply.

contract ConcentrationRule is IRule {
    uint256 public immutable maximum;

    constructor(uint256 authorizedSupply, uint16 basisPoints) {
        require(basisPoints > 0 && basisPoints <= 10000, "bps");
        maximum = authorizedSupply * basisPoints / 10000;
    }

    function check(address token, address from, address to, uint256 amount) external view returns (bool) {
        return IERC20(token).balanceOf(to) + (from == to ? 0 : amount) <= maximum;
    }
}

contract LockupRule is IRule {
    uint64 public immutable releaseTime;

    constructor(uint64 releaseTime_) {
        releaseTime = releaseTime_;
    }

    function check(address, address from, address, uint256) external view returns (bool) {
        return from == address(0) || block.timestamp >= releaseTime;
    }
}
