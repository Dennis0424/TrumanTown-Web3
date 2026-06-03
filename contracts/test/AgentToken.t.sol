// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentToken} from "../src/AgentToken.sol";

contract AgentTokenTest is Test {
    MockUSDC usdc;
    AgentToken token;
    address constant alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        token = new AgentToken("Alice Coin", "ALICE", address(usdc));
        usdc.mint(alice, 1_000_000_000); // 1000 USDC
        vm.prank(alice);
        usdc.approve(address(token), type(uint256).max);
    }

    function test_initial_supply_held_by_curve() public view {
        assertEq(token.balanceOf(address(token)), token.maxSupply());
        assertEq(token.totalSupply(), token.maxSupply());
    }

    function test_buy_credits_tokens_and_takes_usdc() public {
        uint256 usdcIn = 10_000_000; // 10 USDC
        vm.prank(alice);
        uint256 out = token.buy(usdcIn, 0);
        assertGt(out, 0, "got tokens");
        assertEq(token.balanceOf(alice), out);
        assertEq(token.usdcReserve(), usdcIn);
        assertEq(usdc.balanceOf(address(token)), usdcIn);
    }

    function test_price_increases_after_buy() public {
        uint256 p0 = token.pricePerToken();
        vm.prank(alice);
        token.buy(10_000_000, 0);
        uint256 p1 = token.pricePerToken();
        assertGt(p1, p0, "price rises after buy");
    }

    function test_roundtrip_never_profits() public {
        uint256 usdcIn = 50_000_000; // 50 USDC
        vm.startPrank(alice);
        uint256 out = token.buy(usdcIn, 0);
        uint256 back = token.sell(out, 0);
        vm.stopPrank();
        assertLe(back, usdcIn, "no free money on instant roundtrip");
    }

    function test_sell_never_drains_below_real_reserve() public {
        vm.startPrank(alice);
        uint256 out = token.buy(20_000_000, 0);
        token.sell(out, 0);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(token)), token.usdcReserve());
    }

    function test_buy_respects_min_out() public {
        vm.prank(alice);
        vm.expectRevert(bytes("slippage"));
        token.buy(10_000_000, type(uint256).max);
    }

    function test_cannot_sell_more_than_held() public {
        vm.prank(alice);
        vm.expectRevert(bytes("insufficient"));
        token.sell(1, 0);
    }

    function test_marketcap_positive_and_grows_with_buys() public {
        uint256 m0 = token.marketCap();
        vm.prank(alice);
        token.buy(30_000_000, 0);
        uint256 m1 = token.marketCap();
        assertGt(m1, m0, "standing grows");
    }

    function test_sell_respects_min_out() public {
        vm.startPrank(alice);
        uint256 out = token.buy(10_000_000, 0);
        vm.expectRevert(bytes("slippage"));
        token.sell(out, type(uint256).max);
        vm.stopPrank();
    }

    function test_sell_reverts_when_no_real_reserve() public {
        // alice 拿到代币但未经过 buy，故 usdcReserve 仍为 0
        vm.prank(address(token));
        token.transfer(alice, 1000e18);
        vm.prank(alice);
        vm.expectRevert(bytes("no real reserve"));
        token.sell(1000e18, 0);
    }
}
