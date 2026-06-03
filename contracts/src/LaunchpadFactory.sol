// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentToken} from "./AgentToken.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @notice pump.fun 式发币入口：部署 AgentToken 并在 Registry 登记生命参数。
contract LaunchpadFactory {
    IERC20 public immutable usdc;
    AgentRegistry public immutable registry;

    event AgentSpawned(uint256 indexed agentId, address token, address wallet);

    constructor(address usdc_, address registry_) {
        usdc = IERC20(usdc_);
        registry = AgentRegistry(registry_);
    }

    function spawnAgent(
        string memory name,
        string memory symbol,
        address wallet,
        uint256 costPerThink,
        uint256 floor,
        uint256 recoveryWindow
    ) external returns (uint256 agentId, address token) {
        AgentToken t = new AgentToken(name, symbol, address(usdc));
        token = address(t);
        agentId = registry.register(token, wallet, costPerThink, floor, recoveryWindow);
        emit AgentSpawned(agentId, token, wallet);
    }
}
