// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Script } from "forge-std/Script.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";

contract Deploy is Script {
    function run() external returns (MilestoneEscrow escrow) {
        address usdc = vm.envAddress("BASE_SEPOLIA_USDC_ADDRESS");
        address owner = vm.envAddress("DEPLOYMENT_OWNER_ADDRESS");
        address executor = vm.envAddress("PLATFORM_EXECUTOR_ADDRESS");

        vm.startBroadcast();
        escrow = new MilestoneEscrow(usdc, owner, executor);
        vm.stopBroadcast();
    }
}
