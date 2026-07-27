// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract MilestoneEscrow {
    enum EventStatus {
        None,
        Draft,
        Active,
        Completed,
        Refunded
    }

    struct EventRecord {
        address creator;
        address assignee;
        uint64 deadline;
        EventStatus status;
        uint32 milestoneCount;
        uint32 paidCount;
        uint256 totalAmount;
        uint256 paidAmount;
        string title;
        string termsCid;
    }

    struct Milestone {
        uint256 amount;
        bytes32 criteriaHash;
        bytes32 reviewId;
        bytes32 resultHash;
        uint64 challengeDeadline;
        bool approvalProposed;
        bool appealOpen;
        bool paid;
        string criteria;
    }

    struct Appeal {
        address challenger;
        uint256 bond;
        bytes32 reasonHash;
    }

    error Unauthorized();
    error InvalidAddress();
    error InvalidState();
    error InvalidDeadline();
    error InvalidInput();
    error DeadlinePassed();
    error DeadlineNotReached();
    error AlreadyPaid();
    error TransferFailed();
    error Paused();
    error ReentrantCall();

    IERC20 public immutable usdc;
    address public owner;
    address public pendingOwner;
    address public platformExecutor;
    address public pendingPlatformExecutor;
    bool public paused;
    uint256 public nextEventId = 1;
    uint256 private entered;

    mapping(uint256 => EventRecord) private events;
    mapping(uint256 => mapping(uint256 => Milestone)) private milestones;
    mapping(uint256 => mapping(uint256 => Appeal)) private appeals;

    uint256 public appealBondBps = 100;
    uint256 public minimumAppealBond = 1e6;
    uint256 public maximumAppealBond = 100e6;

    event EventCreated(
        uint256 indexed eventId,
        address indexed creator,
        address indexed assignee,
        uint64 deadline,
        string title,
        string termsCid
    );
    event MilestoneAdded(
        uint256 indexed eventId,
        uint256 indexed milestoneId,
        uint256 amount,
        bytes32 criteriaHash,
        string criteria
    );
    event EventActivated(uint256 indexed eventId, uint256 totalAmount);
    event MilestoneApprovalProposed(
        uint256 indexed eventId,
        uint256 indexed milestoneId,
        bytes32 indexed reviewId,
        bytes32 resultHash,
        uint64 challengeDeadline
    );
    event AppealOpened(
        uint256 indexed eventId,
        uint256 indexed milestoneId,
        address indexed challenger,
        uint256 bond,
        bytes32 reasonHash
    );
    event AppealResolved(
        uint256 indexed eventId,
        uint256 indexed milestoneId,
        bool approvalUpheld,
        bytes32 finalReviewId,
        bytes32 finalResultHash
    );
    event MilestoneReleased(
        uint256 indexed eventId,
        uint256 indexed milestoneId,
        bytes32 indexed reviewId,
        bytes32 resultHash,
        address assignee,
        uint256 amount
    );
    event EventRefunded(uint256 indexed eventId, address indexed creator, uint256 amount);
    event OwnerTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event PlatformExecutorTransferStarted(address indexed currentExecutor, address indexed pendingExecutor);
    event PlatformExecutorTransferred(address indexed previousExecutor, address indexed newExecutor);
    event PauseChanged(bool paused);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != platformExecutor) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier nonReentrant() {
        if (entered == 1) revert ReentrantCall();
        entered = 1;
        _;
        entered = 0;
    }

    constructor(address usdcAddress, address initialOwner, address initialExecutor) {
        if (
            usdcAddress == address(0) || initialOwner == address(0)
                || initialExecutor == address(0)
        ) revert InvalidAddress();
        usdc = IERC20(usdcAddress);
        owner = initialOwner;
        platformExecutor = initialExecutor;
    }

    function createEvent(address assignee, string calldata title, string calldata termsCid, uint64 deadline)
        external
        whenNotPaused
        returns (uint256 eventId)
    {
        if (assignee == address(0)) revert InvalidAddress();
        if (bytes(title).length == 0 || bytes(title).length > 120) revert InvalidInput();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        eventId = nextEventId++;
        events[eventId] = EventRecord({
            creator: msg.sender,
            assignee: assignee,
            deadline: deadline,
            status: EventStatus.Draft,
            milestoneCount: 0,
            paidCount: 0,
            totalAmount: 0,
            paidAmount: 0,
            title: title,
            termsCid: termsCid
        });
        emit EventCreated(eventId, msg.sender, assignee, deadline, title, termsCid);
    }

    function addMilestones(
        uint256 eventId,
        string[] calldata criteria,
        uint256[] calldata amounts
    ) external whenNotPaused {
        EventRecord storage record = events[eventId];
        if (record.creator != msg.sender) revert Unauthorized();
        if (record.status != EventStatus.Draft) revert InvalidState();
        if (criteria.length == 0 || criteria.length != amounts.length || criteria.length > 50) {
            revert InvalidInput();
        }

        for (uint256 i; i < criteria.length; ++i) {
            if (bytes(criteria[i]).length == 0 || bytes(criteria[i]).length > 2_000 || amounts[i] == 0) {
                revert InvalidInput();
            }
            uint256 milestoneId = record.milestoneCount++;
            bytes32 criteriaHash = keccak256(bytes(criteria[i]));
            milestones[eventId][milestoneId] = Milestone({
                amount: amounts[i],
                criteriaHash: criteriaHash,
                reviewId: bytes32(0),
                resultHash: bytes32(0),
                challengeDeadline: 0,
                approvalProposed: false,
                appealOpen: false,
                paid: false,
                criteria: criteria[i]
            });
            record.totalAmount += amounts[i];
            emit MilestoneAdded(eventId, milestoneId, amounts[i], criteriaHash, criteria[i]);
        }
    }

    function fundAndActivate(uint256 eventId) external nonReentrant whenNotPaused {
        EventRecord storage record = events[eventId];
        if (record.creator != msg.sender) revert Unauthorized();
        if (record.status != EventStatus.Draft || record.milestoneCount == 0) revert InvalidState();
        if (record.deadline <= block.timestamp) revert DeadlinePassed();

        record.status = EventStatus.Active;
        if (!usdc.transferFrom(msg.sender, address(this), record.totalAmount)) revert TransferFailed();
        emit EventActivated(eventId, record.totalAmount);
    }

    function proposeMilestoneApproval(
        uint256 eventId,
        uint256 milestoneId,
        bytes32 reviewId,
        bytes32 resultHash,
        uint64 challengeDeadline
    ) external onlyExecutor whenNotPaused {
        EventRecord storage record = events[eventId];
        Milestone storage milestone = milestones[eventId][milestoneId];
        if (record.status != EventStatus.Active) revert InvalidState();
        if (milestoneId >= record.milestoneCount || milestone.paid || milestone.appealOpen) {
            revert InvalidState();
        }
        if (
            reviewId == bytes32(0) || resultHash == bytes32(0)
                || challengeDeadline <= block.timestamp || challengeDeadline > record.deadline
        ) revert InvalidInput();

        milestone.reviewId = reviewId;
        milestone.resultHash = resultHash;
        milestone.challengeDeadline = challengeDeadline;
        milestone.approvalProposed = true;
        emit MilestoneApprovalProposed(
            eventId, milestoneId, reviewId, resultHash, challengeDeadline
        );
    }

    function appealBond(uint256 eventId, uint256 milestoneId) public view returns (uint256) {
        uint256 calculated = milestones[eventId][milestoneId].amount * appealBondBps / 10_000;
        if (calculated < minimumAppealBond) return minimumAppealBond;
        if (calculated > maximumAppealBond) return maximumAppealBond;
        return calculated;
    }

    function openAppeal(uint256 eventId, uint256 milestoneId, bytes32 reasonHash)
        external
        nonReentrant
        whenNotPaused
    {
        EventRecord storage record = events[eventId];
        Milestone storage milestone = milestones[eventId][milestoneId];
        if (msg.sender != record.creator) revert Unauthorized();
        if (
            record.status != EventStatus.Active || !milestone.approvalProposed
                || milestone.appealOpen || block.timestamp >= milestone.challengeDeadline
        ) revert InvalidState();
        if (reasonHash == bytes32(0)) revert InvalidInput();

        uint256 bond = appealBond(eventId, milestoneId);
        milestone.appealOpen = true;
        appeals[eventId][milestoneId] =
            Appeal({ challenger: msg.sender, bond: bond, reasonHash: reasonHash });
        if (!usdc.transferFrom(msg.sender, address(this), bond)) revert TransferFailed();
        emit AppealOpened(eventId, milestoneId, msg.sender, bond, reasonHash);
    }

    function resolveAppeal(
        uint256 eventId,
        uint256 milestoneId,
        bool approvalUpheld,
        bytes32 finalReviewId,
        bytes32 finalResultHash
    ) external onlyExecutor nonReentrant whenNotPaused {
        Milestone storage milestone = milestones[eventId][milestoneId];
        Appeal memory appeal = appeals[eventId][milestoneId];
        if (!milestone.appealOpen || appeal.challenger == address(0)) revert InvalidState();
        if (finalReviewId == bytes32(0) || finalResultHash == bytes32(0)) revert InvalidInput();

        milestone.appealOpen = false;
        delete appeals[eventId][milestoneId];
        if (approvalUpheld) {
            milestone.reviewId = finalReviewId;
            milestone.resultHash = finalResultHash;
            milestone.challengeDeadline = uint64(block.timestamp);
            if (!usdc.transfer(events[eventId].assignee, appeal.bond)) revert TransferFailed();
        } else {
            milestone.approvalProposed = false;
            milestone.challengeDeadline = 0;
            milestone.reviewId = finalReviewId;
            milestone.resultHash = finalResultHash;
            if (!usdc.transfer(appeal.challenger, appeal.bond)) revert TransferFailed();
        }
        emit AppealResolved(
            eventId, milestoneId, approvalUpheld, finalReviewId, finalResultHash
        );
    }

    function releaseMilestone(
        uint256 eventId,
        uint256 milestoneId,
        bytes32 reviewId,
        bytes32 resultHash
    ) external onlyExecutor nonReentrant whenNotPaused {
        EventRecord storage record = events[eventId];
        Milestone storage milestone = milestones[eventId][milestoneId];
        if (record.status != EventStatus.Active) revert InvalidState();
        if (block.timestamp > record.deadline) revert DeadlinePassed();
        if (milestoneId >= record.milestoneCount || reviewId == bytes32(0) || resultHash == bytes32(0)) {
            revert InvalidInput();
        }
        if (milestone.paid) revert AlreadyPaid();
        if (
            !milestone.approvalProposed || milestone.appealOpen
                || block.timestamp < milestone.challengeDeadline || milestone.reviewId != reviewId
                || milestone.resultHash != resultHash
        ) revert InvalidState();

        milestone.paid = true;
        milestone.reviewId = reviewId;
        milestone.resultHash = resultHash;
        record.paidCount += 1;
        record.paidAmount += milestone.amount;
        if (record.paidCount == record.milestoneCount) record.status = EventStatus.Completed;

        if (!usdc.transfer(record.assignee, milestone.amount)) revert TransferFailed();
        emit MilestoneReleased(
            eventId,
            milestoneId,
            reviewId,
            resultHash,
            record.assignee,
            milestone.amount
        );
    }

    function refundEvent(uint256 eventId) external nonReentrant {
        EventRecord storage record = events[eventId];
        if (msg.sender != record.creator && msg.sender != platformExecutor) revert Unauthorized();
        if (record.status != EventStatus.Active) revert InvalidState();
        if (block.timestamp <= record.deadline) revert DeadlineNotReached();

        uint256 refundAmount = record.totalAmount - record.paidAmount;
        record.status = EventStatus.Refunded;
        if (refundAmount > 0 && !usdc.transfer(record.creator, refundAmount)) revert TransferFailed();
        emit EventRefunded(eventId, record.creator, refundAmount);
    }

    function getEvent(uint256 eventId) external view returns (EventRecord memory) {
        return events[eventId];
    }

    function getMilestone(uint256 eventId, uint256 milestoneId)
        external
        view
        returns (Milestone memory)
    {
        if (milestoneId >= events[eventId].milestoneCount) revert InvalidInput();
        return milestones[eventId][milestoneId];
    }

    function getAppeal(uint256 eventId, uint256 milestoneId)
        external
        view
        returns (Appeal memory)
    {
        return appeals[eventId][milestoneId];
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        pendingOwner = nextOwner;
        emit OwnerTransferStarted(owner, nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnerTransferred(previous, msg.sender);
    }

    function transferPlatformExecutor(address nextExecutor) external onlyOwner {
        if (nextExecutor == address(0)) revert InvalidAddress();
        pendingPlatformExecutor = nextExecutor;
        emit PlatformExecutorTransferStarted(platformExecutor, nextExecutor);
    }

    function acceptPlatformExecutor() external {
        if (msg.sender != pendingPlatformExecutor) revert Unauthorized();
        address previous = platformExecutor;
        platformExecutor = msg.sender;
        pendingPlatformExecutor = address(0);
        emit PlatformExecutorTransferred(previous, msg.sender);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseChanged(value);
    }

    function setAppealPolicy(uint256 bondBps, uint256 minimumBond, uint256 maximumBond)
        external
        onlyOwner
    {
        if (bondBps > 2_000 || minimumBond > maximumBond) revert InvalidInput();
        appealBondBps = bondBps;
        minimumAppealBond = minimumBond;
        maximumAppealBond = maximumBond;
    }
}
