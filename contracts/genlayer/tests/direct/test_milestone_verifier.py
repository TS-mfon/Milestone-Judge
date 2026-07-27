import json


APPROVED = json.dumps(
    {
        "decision": "approved",
        "criterion_met": True,
        "measurement_valid": True,
        "material_exception": False,
        "explanation": "The public release and repository evidence show the launch criterion was completed.",
        "citations": ["https://example.com/release"],
        "evidence_gaps": [],
    }
)


def test_platform_can_store_approved_review(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    platform = "0x" + direct_alice.hex()
    contract = direct_deploy("contracts/genlayer/milestone_verifier.py", platform)
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
        "Publish the production launch page",
        "0xcriterion",
        "The launch page is public.",
        json.dumps(["https://example.com/release"]),
        "",
    )

    stored = json.loads(contract.get_review("review-1"))
    assert stored["result"]["decision"] == "approved"
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
            "Publish the production launch page",
            "0xcriterion",
            "The launch page is public.",
            "[]",
            "",
        )
