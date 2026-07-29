import json
import os

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


@pytest.mark.slow
def test_real_web_and_consensus_review():
    platform = os.environ.get("GENLAYER_INTEGRATION_PLATFORM_ADDRESS")
    if not platform:
        pytest.skip("GENLAYER_INTEGRATION_PLATFORM_ADDRESS is not configured")

    factory = get_contract_factory("MilestoneVerifier")
    contract = factory.deploy(args=[platform])
    receipt = contract.request_review(
        args=[
            "integration-write-as",
            "initial",
            "84532",
            "0x47F846c659B4DF565d2e8b1cd32F610E68d11B9A",
            "1",
            "0",
            "1",
            platform,
            "Confirm that the public document is reachable and contains text",
            "0xintegration",
            80,
            "The public document contains the submitted milestone evidence.",
            json.dumps(["https://write.as/"]),
            "",
        ]
    ).transact()
    assert tx_execution_succeeded(receipt)

    stored = json.loads(contract.get_review(args=["integration-write-as"]).call())
    assert stored["result"]["retrieved_sources"] == ["https://write.as/"]
    assert stored["result"]["minimum_score"] == 80
