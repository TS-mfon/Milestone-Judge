import json

CRITERION = "Publish the production launch page"
CRITERION_HASH = "0xdffdd6c47fabb1cc2f3bb8b2c3664debd3d4a0feec52c2cd1261858910fd845a"

APPROVED = json.dumps(
    {
        "decision": "approved",
        "score": 92,
        "criterion_met": True,
        "measurement_valid": True,
        "material_exception": False,
        "review": "The submitted release is publicly accessible and the repository history confirms the required launch work.",
        "explanation": "The public release and repository evidence show the launch criterion was completed.",
        "strengths": ["Public production release", "Traceable repository history"],
        "improvements": ["Add an independent uptime monitor"],
        "suggestions": ["Publish a post-launch reliability report"],
        "citations": ["https://example.com/release"],
        "evidence_gaps": [],
    }
)


def test_platform_can_store_approved_review(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    direct_vm.mock_web(
        r"https://example\.com/release",
        {"status": 200, "body": "Public production release is live."},
    )
    direct_vm.mock_llm(r".*funded milestone.*", APPROVED)

    contract.request_review(
        "review-1",
        "initial",
        "84532",
        "0xEscrow",
        "1",
        "0",
        "1",
        str(direct_bob),
        CRITERION,
        CRITERION_HASH,
        80,
        "The launch page is public.",
        json.dumps(["https://example.com/release"]),
        "",
    )

    stored = json.loads(contract.get_review("review-1"))
    assert stored["result"]["decision"] == "approved"
    assert stored["result"]["score"] == 92
    assert stored["result"]["threshold_met"] is True
    assert stored["result"]["retrieved_sources"] == ["https://example.com/release"]
    assert stored["result"]["suggestions"] == ["Publish a post-launch reliability report"]
    assert stored["evidence_links"] == ["https://example.com/release"]
    assert (
        contract.get_latest_review_id("84532", "0xEscrow", "1", "0")
        == "review-1"
    )
    assert contract.get_review_count() == 1


def test_non_platform_cannot_request_review(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the platform wallet"):
        contract.request_review(
            "review-1",
            "initial",
            "84532",
            "0xEscrow",
            "1",
            "0",
            "1",
            str(direct_bob),
            CRITERION,
            CRITERION_HASH,
            80,
            "The launch page is public.",
            "[]",
            "",
        )


def test_rejects_fabricated_citation(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    direct_vm.mock_web(
        r"https://example\.com/release",
        {"status": 200, "body": "Public production release is live."},
    )
    fabricated = json.loads(APPROVED)
    fabricated["citations"] = ["https://attacker.example/fake"]
    direct_vm.mock_llm(r".*funded milestone.*", json.dumps(fabricated))

    with direct_vm.expect_revert("Approval is inconsistent"):
        contract.request_review(
            "review-fabricated",
            "initial",
            "84532",
            "0xEscrow",
            "1",
            "0",
            "1",
            str(direct_bob),
            CRITERION,
            CRITERION_HASH,
            80,
            "The launch page is public.",
            json.dumps(["https://example.com/release"]),
            "",
        )


def test_rejects_duplicate_review_id(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    direct_vm.mock_web(
        r"https://example\.com/release",
        {"status": 200, "body": "Public production release is live."},
    )
    direct_vm.mock_llm(r".*funded milestone.*", APPROVED)
    args = [
        "review-duplicate",
        "initial",
        "84532",
        "0xEscrow",
        "1",
        "0",
        "1",
        str(direct_bob),
        CRITERION,
        CRITERION_HASH,
        80,
        "The launch page is public.",
        json.dumps(["https://example.com/release"]),
        "",
    ]
    contract.request_review(*args)
    with direct_vm.expect_revert("Review id already exists"):
        contract.request_review(*args)


def test_owner_can_rotate_platform_wallet(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    replacement = "0x" + direct_bob.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    contract.set_platform_wallet(replacement)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only the platform wallet"):
        contract.request_review(
            "review-old-platform",
            "initial",
            "84532",
            "0xEscrow",
            "1",
            "0",
            "1",
            str(direct_bob),
            CRITERION,
            CRITERION_HASH,
            80,
            "The launch page is public.",
            json.dumps(["https://example.com/release"]),
            "",
        )


def test_unreachable_evidence_cannot_be_approved(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    direct_vm.mock_web(
        r"https://example\.com/missing",
        {"status": 404, "body": "Not found"},
    )
    direct_vm.mock_llm(r".*funded milestone.*", APPROVED)

    with direct_vm.expect_revert("Approval is inconsistent"):
        contract.request_review(
            "review-missing",
            "initial",
            "84532",
            "0xEscrow",
            "1",
            "0",
            "1",
            str(direct_bob),
            CRITERION,
            CRITERION_HASH,
            80,
            "The launch page is public.",
            json.dumps(["https://example.com/missing"]),
            "",
        )


def test_malformed_verdict_is_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    direct_vm.mock_web(
        r"https://example\.com/release",
        {"status": 200, "body": "Release is live."},
    )
    direct_vm.mock_llm(r".*funded milestone.*", json.dumps({"decision": "approved"}))

    with direct_vm.expect_revert("Score must be between 0 and 100"):
        contract.request_review(
            "review-malformed",
            "initial",
            "84532",
            "0xEscrow",
            "1",
            "0",
            "1",
            str(direct_bob),
            CRITERION,
            CRITERION_HASH,
            80,
            "The launch page is public.",
            json.dumps(["https://example.com/release"]),
            "",
        )


def test_threshold_flag_uses_funded_minimum(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
    direct_vm.mock_web(
        r"https://example\.com/release",
        {"status": 200, "body": "Release is live."},
    )
    below = json.loads(APPROVED)
    below["decision"] = "rejected"
    below["score"] = 79
    below["criterion_met"] = False
    direct_vm.mock_llm(r".*funded milestone.*", json.dumps(below))

    contract.request_review(
        "review-below-threshold",
        "initial",
        "84532",
        "0xEscrow",
        "1",
        "0",
        "1",
        str(direct_bob),
        CRITERION,
        CRITERION_HASH,
        80,
        "The launch page is public.",
        json.dumps(["https://example.com/release"]),
        "",
    )
    stored = json.loads(contract.get_review("review-below-threshold"))
    assert stored["result"]["threshold_met"] is False
    assert stored["result"]["minimum_score"] == 80


def test_rejects_substituted_criterion_hash(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.sender = direct_alice
    contract = direct_deploy(
        "contracts/genlayer/milestone_verifier.py",
        "0x" + direct_alice.hex(),
    )

    with direct_vm.expect_revert("Criterion hash does not match criterion text"):
        contract.request_review(
            "review-substituted-criterion",
            "initial",
            "84532",
            "0xEscrow",
            "1",
            "0",
            "1",
            str(direct_bob),
            CRITERION + " substituted",
            CRITERION_HASH,
            80,
            "The launch page is public.",
            json.dumps(["https://example.com/release"]),
            "",
        )
