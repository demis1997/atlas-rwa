// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {SecurityToken} from "./SecurityToken.sol";
import {IdentityRegistry} from "./IdentityRegistry.sol";
import {Compliance} from "./Compliance.sol";

contract AssetFactory is AccessControlDefaultAdminRules {
    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER_ROLE");
    mapping(bytes32 => address) public assets;

    event AssetCreated(
        bytes32 indexed id, address indexed token, address indexed issuer, address registry, address compliance
    );

    constructor(address admin, address deployer) AccessControlDefaultAdminRules(2 days, admin) {
        require(deployer != address(0) && deployer != admin, "roles");
        _grantRole(DEPLOYER_ROLE, deployer);
    }

    function create(
        bytes32 id,
        string calldata name,
        string calldata symbol,
        uint256 cap,
        IdentityRegistry registry,
        Compliance policy,
        SecurityToken.Roles calldata roles
    ) external onlyRole(DEPLOYER_ROLE) returns (SecurityToken token) {
        require(id != bytes32(0) && assets[id] == address(0), "asset id");
        token = new SecurityToken{salt: id}(name, symbol, cap, registry, policy, roles);
        assets[id] = address(token);
        emit AssetCreated(id, address(token), roles.issuer, address(registry), address(policy));
    }
}
