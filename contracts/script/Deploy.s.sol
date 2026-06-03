// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {LaunchpadFactory} from "../src/LaunchpadFactory.sol";

/// @notice 部署顺序：USDC → 预测 factory 地址 → Registry(factory,keeper) → Factory。
/// 本地 anvil 部署 MockUSDC；Base Sepolia 用环境变量 USDC_ADDRESS 指向 Circle 测试网 USDC。
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address usdc = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(pk);
        address deployer = vm.addr(pk);

        if (usdc == address(0)) {
            MockUSDC mock = new MockUSDC();
            usdc = address(mock);
            console2.log("MockUSDC:", usdc);
        }

        address predictedFactory = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        AgentRegistry registry = new AgentRegistry(predictedFactory, keeper);
        LaunchpadFactory factory = new LaunchpadFactory(usdc, address(registry));
        require(address(factory) == predictedFactory, "factory address mismatch");

        console2.log("USDC:", usdc);
        console2.log("AgentRegistry:", address(registry));
        console2.log("LaunchpadFactory:", address(factory));
        vm.stopBroadcast();
    }
}
