// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_decimals_is_6() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_mint_credits_balance() public {
        usdc.mint(address(0xBEEF), 1_000_000); // 1 USDC
        assertEq(usdc.balanceOf(address(0xBEEF)), 1_000_000);
    }
}
