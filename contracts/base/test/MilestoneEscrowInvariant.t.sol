// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";

contract InvariantUSDC {
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

contract EscrowHandler is Test {
    MilestoneEscrow public immutable escrow;
    InvariantUSDC public immutable usdc;
    address public immutable creator;
    address public immutable executor;
    uint256 public immutable eventId;

    constructor(
        MilestoneEscrow escrow_,
        InvariantUSDC usdc_,
        address creator_,
        address executor_,
        uint256 eventId_
    ) {
        escrow = escrow_;
        usdc = usdc_;
        creator = creator_;
        executor = executor_;
        eventId = eventId_;
    }

    function propose(uint8 milestoneSeed, uint8 scoreSeed) external {
        uint256 milestoneId = bound(uint256(milestoneSeed), 0, 2);
        uint8 score = uint8(bound(uint256(scoreSeed), 80, 100));
        MilestoneEscrow.Milestone memory milestone = escrow.getMilestone(eventId, milestoneId);
        if (milestone.paid || milestone.approvalProposed) return;
        vm.prank(executor);
        escrow.proposeMilestoneApproval(
            eventId,
            milestoneId,
            keccak256(abi.encode("review", milestoneId)),
            keccak256(abi.encode("result", milestoneId)),
            score
        );
    }

    function release(uint8 milestoneSeed) external {
        uint256 milestoneId = bound(uint256(milestoneSeed), 0, 2);
        MilestoneEscrow.Milestone memory milestone = escrow.getMilestone(eventId, milestoneId);
        if (milestone.paid || !milestone.approvalProposed || milestone.appealOpen) return;
        vm.prank(executor);
        escrow.releaseMilestone(
            eventId, milestoneId, milestone.reviewId, milestone.resultHash
        );
    }
}

contract MilestoneEscrowInvariantTest is StdInvariant, Test {
    InvariantUSDC internal usdc;
    MilestoneEscrow internal escrow;
    EscrowHandler internal handler;
    address internal creator = address(0xA11CE);
    address internal assignee = address(0xB0B);
    address internal executor = address(0xE);
    uint256 internal eventId;

    function setUp() public {
        usdc = new InvariantUSDC();
        escrow = new MilestoneEscrow(address(usdc), address(this), executor);
        usdc.mint(creator, 60e6);

        vm.startPrank(creator);
        eventId = escrow.createEvent(
            assignee, "Invariant event", "https://write.as/terms", uint64(block.timestamp + 30 days), 0
        );
        string[] memory criteria = new string[](3);
        uint256[] memory amounts = new uint256[](3);
        uint8[] memory scores = new uint8[](3);
        for (uint256 i; i < 3; ++i) {
            criteria[i] = "Complete a funded invariant milestone";
            amounts[i] = 20e6;
            scores[i] = 80;
        }
        escrow.addMilestones(eventId, criteria, amounts, scores);
        usdc.approve(address(escrow), 60e6);
        escrow.fundAndActivate(eventId);
        vm.stopPrank();

        handler = new EscrowHandler(escrow, usdc, creator, executor, eventId);
        targetContract(address(handler));
    }

    function invariantEscrowIsSolventForUnpaidMilestones() public view {
        MilestoneEscrow.EventRecord memory record = escrow.getEvent(eventId);
        assertGe(usdc.balanceOf(address(escrow)), record.totalAmount - record.paidAmount);
    }

    function invariantPaidAccountingMatchesMilestoneState() public view {
        MilestoneEscrow.EventRecord memory record = escrow.getEvent(eventId);
        uint256 expectedPaid;
        uint256 expectedCount;
        for (uint256 i; i < 3; ++i) {
            MilestoneEscrow.Milestone memory milestone = escrow.getMilestone(eventId, i);
            if (!milestone.paid) continue;
            expectedPaid += milestone.amount;
            expectedCount += 1;
        }
        assertEq(record.paidAmount, expectedPaid);
        assertEq(record.paidCount, expectedCount);
        assertLe(record.paidAmount, record.totalAmount);
    }

    function invariantAssigneeReceivesOnlyRecordedPayouts() public view {
        MilestoneEscrow.EventRecord memory record = escrow.getEvent(eventId);
        assertEq(usdc.balanceOf(assignee), record.paidAmount);
    }
}
