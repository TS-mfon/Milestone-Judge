// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";

contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MilestoneEscrowTest is Test {
    MockUSDC internal usdc;
    MilestoneEscrow internal escrow;
    address internal creator = address(0xA11CE);
    address internal assignee = address(0xB0B);
    address internal executor = address(0xE);

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new MilestoneEscrow(address(usdc), address(this), executor);
        usdc.mint(creator, 1_000e6);
    }

    function createAndFund() internal returns (uint256 eventId) {
        vm.startPrank(creator);
        eventId = escrow.createEvent(assignee, "Launch campaign", "ipfs://terms", uint64(block.timestamp + 7 days));
        string[] memory criteria = new string[](2);
        criteria[0] = "Publish the launch page";
        criteria[1] = "Reach 100 verified signups";
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e6;
        amounts[1] = 250e6;
        escrow.addMilestones(eventId, criteria, amounts);
        usdc.approve(address(escrow), 350e6);
        escrow.fundAndActivate(eventId);
        vm.stopPrank();
    }

    function testFundsAndReleasesExactMilestone() public {
        uint256 eventId = createAndFund();
        vm.prank(executor);
        escrow.proposeMilestoneApproval(
            eventId,
            0,
            keccak256("review-1"),
            keccak256("approved"),
            uint64(block.timestamp + 1 days)
        );
        vm.warp(block.timestamp + 1 days);
        vm.prank(executor);
        escrow.releaseMilestone(eventId, 0, keccak256("review-1"), keccak256("approved"));

        assertEq(usdc.balanceOf(assignee), 100e6);
        MilestoneEscrow.EventRecord memory record = escrow.getEvent(eventId);
        assertEq(record.paidAmount, 100e6);
        assertEq(uint8(record.status), uint8(MilestoneEscrow.EventStatus.Active));
    }

    function testPreventsDuplicatePayout() public {
        uint256 eventId = createAndFund();
        bytes32 reviewId = keccak256("review-1");
        bytes32 resultHash = keccak256("approved");
        vm.startPrank(executor);
        escrow.proposeMilestoneApproval(
            eventId, 0, reviewId, resultHash, uint64(block.timestamp + 1 days)
        );
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days);
        vm.startPrank(executor);
        escrow.releaseMilestone(eventId, 0, reviewId, resultHash);
        vm.expectRevert(MilestoneEscrow.AlreadyPaid.selector);
        escrow.releaseMilestone(eventId, 0, reviewId, resultHash);
        vm.stopPrank();
    }

    function testRefundsOnlyUnpaidBalanceAfterDeadline() public {
        uint256 eventId = createAndFund();
        vm.prank(executor);
        escrow.proposeMilestoneApproval(
            eventId,
            0,
            keccak256("review-1"),
            keccak256("approved"),
            uint64(block.timestamp + 1 days)
        );
        vm.warp(block.timestamp + 1 days);
        vm.prank(executor);
        escrow.releaseMilestone(eventId, 0, keccak256("review-1"), keccak256("approved"));
        vm.warp(block.timestamp + 8 days);
        vm.prank(executor);
        escrow.refundEvent(eventId);

        assertEq(usdc.balanceOf(creator), 650e6 + 250e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testRejectsUnauthorizedRelease() public {
        uint256 eventId = createAndFund();
        vm.prank(creator);
        vm.expectRevert(MilestoneEscrow.Unauthorized.selector);
        escrow.releaseMilestone(eventId, 0, keccak256("review-1"), keccak256("approved"));
    }

    function testAppealCanOverturnApprovalAndReturnBond() public {
        uint256 eventId = createAndFund();
        vm.prank(executor);
        escrow.proposeMilestoneApproval(
            eventId,
            0,
            keccak256("review-1"),
            keccak256("approved"),
            uint64(block.timestamp + 1 days)
        );

        vm.startPrank(creator);
        usdc.approve(address(escrow), 1e6);
        escrow.openAppeal(eventId, 0, keccak256("missing-source"));
        vm.stopPrank();

        vm.prank(executor);
        escrow.resolveAppeal(
            eventId, 0, false, keccak256("appeal-review"), keccak256("rejected")
        );
        assertEq(usdc.balanceOf(creator), 650e6);
        assertFalse(escrow.getMilestone(eventId, 0).approvalProposed);
    }
}
