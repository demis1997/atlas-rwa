// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";

/// @notice Synthetic direct attestations; deliberately not an ERC-734/735 identity implementation.
contract IdentityRegistry is AccessControlDefaultAdminRules {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    struct Identity {
        bytes32 subject;
        uint16 country;
    }

    struct Claim {
        address issuer;
        uint64 expiresAt;
        bytes32 evidenceHash;
    }

    mapping(address => Identity) public identities;
    mapping(bytes32 => address) public subjectWallet;
    mapping(address => bool) public retiredWallet;
    mapping(bytes32 => mapping(uint256 => Claim)) public claims;
    mapping(address => mapping(uint256 => bool)) public trustedIssuer;
    uint256[] public requiredTopics;

    event IdentityRegistered(address indexed wallet, bytes32 indexed subject, uint16 country);
    event WalletRotated(address indexed previous, address indexed replacement, bytes32 indexed subject);
    event ClaimChanged(
        bytes32 indexed subject, uint256 indexed topic, address indexed issuer, uint64 expiresAt, bytes32 evidenceHash
    );
    event IssuerTrustChanged(address indexed issuer, uint256 indexed topic, bool trusted);
    event TopicsChanged(uint256[] topics);

    error InvalidIdentity();
    error UnauthorizedIssuer();

    constructor(address admin, address registrar) AccessControlDefaultAdminRules(2 days, admin) {
        require(registrar != address(0) && registrar != admin, "roles");
        _grantRole(REGISTRAR_ROLE, registrar);
        requiredTopics.push(1);
    }

    function setTrustedIssuer(address issuer, uint256 topic, bool trusted) external onlyRole(REGISTRAR_ROLE) {
        require(issuer != address(0), "issuer");
        trustedIssuer[issuer][topic] = trusted;
        emit IssuerTrustChanged(issuer, topic, trusted);
    }

    function setRequiredTopics(uint256[] calldata topics) external onlyRole(REGISTRAR_ROLE) {
        require(topics.length > 0 && topics.length <= 16, "topics");
        for (uint256 i; i < topics.length; ++i) {
            require(topics[i] != 0, "topic");
            for (uint256 j; j < i; ++j) {
                require(topics[j] != topics[i], "duplicate");
            }
        }
        requiredTopics = topics;
        emit TopicsChanged(topics);
    }

    function register(address wallet, bytes32 subject, uint16 country) external onlyRole(REGISTRAR_ROLE) {
        if (
            wallet == address(0) || retiredWallet[wallet] || subject == bytes32(0) || country == 0
                || identities[wallet].subject != bytes32(0) || subjectWallet[subject] != address(0)
        ) revert InvalidIdentity();
        identities[wallet] = Identity(subject, country);
        subjectWallet[subject] = wallet;
        emit IdentityRegistered(wallet, subject, country);
    }

    function attest(bytes32 subject, uint256 topic, uint64 expiresAt, bytes32 evidenceHash) external {
        if (!trustedIssuer[msg.sender][topic]) revert UnauthorizedIssuer();
        if (subjectWallet[subject] == address(0) || expiresAt <= block.timestamp || evidenceHash == bytes32(0)) {
            revert InvalidIdentity();
        }
        claims[subject][topic] = Claim(msg.sender, expiresAt, evidenceHash);
        emit ClaimChanged(subject, topic, msg.sender, expiresAt, evidenceHash);
    }

    function revoke(bytes32 subject, uint256 topic) external {
        if (claims[subject][topic].issuer != msg.sender && !hasRole(REGISTRAR_ROLE, msg.sender)) {
            revert UnauthorizedIssuer();
        }
        delete claims[subject][topic];
        emit ClaimChanged(subject, topic, msg.sender, 0, bytes32(0));
    }
    /// @notice Rotation must be paired operationally with recovery on every affected token.

    function rotate(address oldWallet, address newWallet) external onlyRole(REGISTRAR_ROLE) {
        Identity memory identity = identities[oldWallet];
        if (
            identity.subject == bytes32(0) || newWallet == address(0) || retiredWallet[newWallet]
                || identities[newWallet].subject != bytes32(0)
        ) revert InvalidIdentity();
        retiredWallet[oldWallet] = true;
        delete identities[oldWallet];
        identities[newWallet] = identity;
        subjectWallet[identity.subject] = newWallet;
        emit WalletRotated(oldWallet, newWallet, identity.subject);
    }

    function countryOf(address wallet) external view returns (uint16) {
        return identities[wallet].country;
    }

    function subjectOf(address wallet) external view returns (bytes32) {
        return identities[wallet].subject;
    }

    function isVerified(address wallet) public view returns (bool) {
        bytes32 subject = identities[wallet].subject;
        if (subject == bytes32(0)) return false;
        for (uint256 i; i < requiredTopics.length; ++i) {
            Claim memory claim = claims[subject][requiredTopics[i]];
            if (claim.expiresAt <= block.timestamp || !trustedIssuer[claim.issuer][requiredTopics[i]]) return false;
        }
        return true;
    }
}
