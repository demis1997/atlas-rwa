// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SecurityToken} from "../src/SecurityToken.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {Compliance, JurisdictionRule, HoldingLimitRule, ConcentrationRule, LockupRule} from "../src/Compliance.sol";
import {AssetFactory} from "../src/AssetFactory.sol";

interface Vm {
    function roll(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function warp(uint256) external;
}

contract CoreFixture {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant ADMIN = address(1);
    address internal constant ISSUER = address(2);
    address internal constant OFFICER = address(3);
    address internal constant AGENT = address(4);
    address internal constant ATTESTER = address(5);
    address internal constant ALICE = address(10);
    address internal constant BOB = address(11);
    address internal constant CHARLIE = address(12);
    IdentityRegistry internal registry;
    Compliance internal policy;
    SecurityToken internal token;
    AssetFactory internal factory;

    function setUp() public virtual {
        vm.warp(1000);
        registry = new IdentityRegistry(ADMIN, OFFICER);
        policy = new Compliance(ADMIN, OFFICER);
        uint16[] memory countries = new uint16[](1);
        countries[0] = 276;
        address[] memory rules = new address[](4);
        rules[0] = address(new JurisdictionRule(registry, countries));
        rules[1] = address(new HoldingLimitRule(6000));
        rules[2] = address(new ConcentrationRule(10000, 6000));
        rules[3] = address(new LockupRule(1000));
        vm.prank(OFFICER);
        policy.setRules(rules);
        factory = new AssetFactory(ADMIN, ISSUER);
        vm.prank(ISSUER);
        token = factory.create(
            keccak256("ATLAS-2030"), "ATLAS-2030 Corporate Bond", "ATLAS30", 10000, registry, policy, roles()
        );
        vm.prank(OFFICER);
        registry.setTrustedIssuer(ATTESTER, 1, true);
        onboard(ALICE, 276);
        onboard(BOB, 276);
        onboard(CHARLIE, 840);
    }

    function roles() internal pure returns (SecurityToken.Roles memory) {
        return SecurityToken.Roles(ADMIN, ISSUER, OFFICER, AGENT);
    }

    function onboard(address wallet, uint16 country) internal {
        bytes32 subject = bytes32(uint256(uint160(wallet)));
        vm.prank(OFFICER);
        registry.register(wallet, subject, country);
        vm.prank(ATTESTER);
        registry.attest(subject, 1, 100000, keccak256("synthetic"));
    }

    function mint(address to, uint256 amount) internal {
        vm.prank(ISSUER);
        token.mint(to, amount);
    }
}

contract CoreTest is CoreFixture {
    function testTransferAndAllowance() public {
        mint(ALICE, 100);
        vm.prank(ALICE);
        token.approve(BOB, 50);
        vm.prank(BOB);
        token.transferFrom(ALICE, BOB, 50);
        require(token.balanceOf(ALICE) == 50 && token.balanceOf(BOB) == 50 && token.allowance(ALICE, BOB) == 0);
    }

    function testUnauthorizedMintAndRevocation() public {
        vm.expectRevert();
        token.mint(ALICE, 1);
        bytes32 role = token.ISSUER_ROLE();
        vm.prank(ADMIN);
        token.revokeRole(role, ISSUER);
        vm.expectRevert();
        mint(ALICE, 1);
    }

    function testNoRoleEscalation() public {
        bytes32 role = token.ISSUER_ROLE();
        vm.expectRevert();
        vm.prank(OFFICER);
        token.grantRole(role, OFFICER);
    }

    function testAdminNotOperational() public {
        vm.expectRevert();
        vm.prank(ADMIN);
        token.mint(ALICE, 1);
    }

    function testInvalidIssuer() public {
        vm.expectRevert();
        registry.attest(bytes32(uint256(10)), 1, 9999, keccak256("fake"));
    }

    function testUnverified() public {
        vm.expectRevert();
        mint(address(99), 1);
    }

    function testExpired() public {
        vm.warp(100000);
        vm.expectRevert();
        mint(ALICE, 1);
    }

    function testRevoked() public {
        vm.prank(ATTESTER);
        registry.revoke(bytes32(uint256(10)), 1);
        vm.expectRevert();
        mint(ALICE, 1);
    }

    function testUntrustedIssuer() public {
        vm.prank(OFFICER);
        registry.setTrustedIssuer(ATTESTER, 1, false);
        vm.expectRevert();
        mint(ALICE, 1);
    }

    function testWrongJurisdiction() public {
        vm.expectRevert();
        mint(CHARLIE, 1);
    }

    function testHoldingCap() public {
        vm.expectRevert();
        mint(ALICE, 6001);
    }

    function testLifetimeCapCannotRemintBurns() public {
        mint(ALICE, 5000);
        mint(BOB, 5000);
        vm.prank(ISSUER);
        token.burn(ALICE, 5000);
        vm.expectRevert();
        mint(ALICE, 1);
    }

    function testPauseAndFreezeAllEntrypoints() public {
        mint(ALICE, 100);
        vm.prank(OFFICER);
        token.setFreeze(ALICE, false, 90);
        vm.expectRevert();
        vm.prank(ALICE);
        token.transfer(BOB, 11);
        vm.expectRevert();
        vm.prank(AGENT);
        token.forcedTransfer(ALICE, BOB, 11, keccak256("order"));
        vm.prank(ALICE);
        token.approve(BOB, 100);
        vm.expectRevert();
        vm.prank(BOB);
        token.transferFrom(ALICE, BOB, 11);
        vm.expectRevert();
        vm.prank(ISSUER);
        token.burn(ALICE, 11);
        vm.prank(OFFICER);
        token.setPaused(true);
        vm.expectRevert();
        mint(BOB, 1);
    }

    function testForcedTransferCannotBypassPolicy() public {
        mint(ALICE, 100);
        vm.expectRevert();
        vm.prank(AGENT);
        token.forcedTransfer(ALICE, CHARLIE, 1, keccak256("order"));
    }

    function testRecoveryPreservesFreezesAndSubject() public {
        mint(ALICE, 100);
        vm.prank(OFFICER);
        token.setFreeze(ALICE, true, 20);
        vm.prank(OFFICER);
        registry.rotate(ALICE, address(13));
        vm.expectRevert();
        mint(address(13), 1);
        vm.prank(AGENT);
        token.recover(ALICE, address(13));
        require(
            token.balanceOf(address(13)) == 100 && token.balanceOf(ALICE) == 0 && token.frozen(address(13))
                && token.frozenTokens(address(13)) == 20
        );
    }

    function testRecoveryWrongSubject() public {
        mint(ALICE, 100);
        vm.expectRevert();
        vm.prank(AGENT);
        token.recover(ALICE, BOB);
    }

    function testRecoveryExpired() public {
        mint(ALICE, 100);
        vm.prank(OFFICER);
        registry.rotate(ALICE, address(13));
        vm.warp(100000);
        vm.expectRevert();
        vm.prank(AGENT);
        token.recover(ALICE, address(13));
    }

    function testIdentityCannotReassign() public {
        vm.expectRevert();
        vm.prank(OFFICER);
        registry.register(ALICE, keccak256("replacement"), 276);
    }

    function testFactoryCollision() public {
        vm.expectRevert();
        vm.prank(ISSUER);
        factory.create(keccak256("ATLAS-2030"), "x", "x", 1, registry, policy, roles());
    }

    function testFactoryUnauthorized() public {
        vm.expectRevert();
        factory.create(keccak256("x"), "x", "x", 1, registry, policy, roles());
    }

    function testLockup() public {
        address[] memory rules = new address[](1);
        rules[0] = address(new LockupRule(2000));
        vm.prank(OFFICER);
        policy.setRules(rules);
        mint(ALICE, 10);
        vm.expectRevert();
        vm.prank(ALICE);
        token.transfer(BOB, 1);
        vm.warp(2000);
        vm.prank(ALICE);
        token.transfer(BOB, 1);
    }

    function testFuzzTransferConservesSupply(uint256 raw) public {
        uint256 amount = raw % 5001;
        mint(ALICE, 5000);
        vm.prank(ALICE);
        token.transfer(BOB, amount);
        require(token.balanceOf(ALICE) + token.balanceOf(BOB) == token.totalSupply() && token.totalSupply() == 5000);
    }

    function testFuzzHoldingLimit(uint256 raw) public {
        uint256 amount = raw % 10001;
        if (amount > 6000) {
            vm.expectRevert();
            mint(ALICE, amount);
        } else {
            mint(ALICE, amount);
            require(token.balanceOf(ALICE) == amount);
        }
    }

    function testTopicsRequireAllClaims() public {
        uint256[] memory topics = new uint256[](2);
        topics[0] = 1;
        topics[1] = 2;
        vm.prank(OFFICER);
        registry.setRequiredTopics(topics);
        vm.expectRevert();
        mint(ALICE, 1);
        vm.prank(OFFICER);
        registry.setTrustedIssuer(ATTESTER, 2, true);
        vm.prank(ATTESTER);
        registry.attest(bytes32(uint256(10)), 2, 100000, keccak256("accredited"));
        mint(ALICE, 1);
    }

    function testInvalidTopicsAndRules() public {
        uint256[] memory topics = new uint256[](0);
        vm.expectRevert();
        vm.prank(OFFICER);
        registry.setRequiredTopics(topics);
        address[] memory rules = new address[](0);
        vm.expectRevert();
        vm.prank(OFFICER);
        policy.setRules(rules);
    }

    function testRetiredWalletCannotBeReassigned() public {
        vm.prank(OFFICER);
        registry.rotate(ALICE, address(13));
        vm.expectRevert();
        vm.prank(OFFICER);
        registry.register(ALICE, keccak256("other subject"), 276);
    }

    function testFullFreezeRecipientAndSender() public {
        mint(ALICE, 10);
        vm.prank(OFFICER);
        token.setFreeze(BOB, true, 0);
        vm.expectRevert();
        vm.prank(ALICE);
        token.transfer(BOB, 1);
        vm.prank(OFFICER);
        token.setFreeze(ALICE, true, 0);
        vm.expectRevert();
        vm.prank(ALICE);
        token.transfer(CHARLIE, 1);
    }

    function testForcedTransferSuccessAndDocument() public {
        mint(ALICE, 10);
        vm.prank(AGENT);
        token.forcedTransfer(ALICE, BOB, 5, keccak256("synthetic order"));
        require(token.balanceOf(BOB) == 5);
        vm.prank(ISSUER);
        token.setDocument("ipfs://synthetic-terms", keccak256("terms"));
        require(token.documentHash() == keccak256("terms") && token.decimals() == 0);
    }

    function testFuzzJurisdictions(uint16 country) public {
        if (country == 0) country = 1;
        onboard(address(14), country);
        if (country != 276) {
            vm.expectRevert();
            mint(address(14), 1);
        } else {
            mint(address(14), 1);
        }
    }
}
