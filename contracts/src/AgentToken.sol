// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice 居民的 meme 币：带虚拟储备的恒定乘积曲线，储备资产为 USDC(6dec)。
contract AgentToken is ERC20 {
    IERC20 public immutable usdc;
    uint256 public constant maxSupply = 1_000_000e18;
    /// @notice 真实可提取储备（6dec）。虚拟种子只用于定价、不可提取。
    uint256 public usdcReserve;
    uint256 public constant VIRTUAL_RESERVE = 1_000_000; // 1.000000 USDC (6 decimals) 虚拟种子，仅用于定价、不可提取

    event Bought(address indexed buyer, uint256 usdcIn, uint256 tokensOut);
    event Sold(address indexed seller, uint256 tokensIn, uint256 usdcOut);

    constructor(string memory name_, string memory symbol_, address usdc_) ERC20(name_, symbol_) {
        usdc = IERC20(usdc_);
        _mint(address(this), maxSupply);
    }

    /// @dev 自举期(usdcReserve < VIRTUAL_RESERVE)用虚拟种子定价；卖出所得以真实 usdcReserve 为上限，
    ///      因此此期间卖出可能得到 0 USDC（sell 中已用 require(usdcOut>0) 拦截）。
    function effectiveReserve() public view returns (uint256) {
        return usdcReserve < VIRTUAL_RESERVE ? VIRTUAL_RESERVE : usdcReserve;
    }

    function pricePerToken() public view returns (uint256) {
        uint256 t = balanceOf(address(this));
        if (t == 0) return 0;
        return (effectiveReserve() * 1e18) / t;
    }

    /// @dev 售罄(T==0)时 pricePerToken 为 0，故 marketCap 返回 0。
    function marketCap() public view returns (uint256) {
        uint256 circulating = maxSupply - balanceOf(address(this));
        return (pricePerToken() * circulating) / 1e18;
    }

    function buy(uint256 usdcIn, uint256 minTokensOut) external returns (uint256 tokensOut) {
        require(usdcIn > 0, "zero in");
        uint256 R = effectiveReserve();
        uint256 T = balanceOf(address(this));
        require(T > 0, "sold out");
        uint256 newT = (R * T) / (R + usdcIn);
        tokensOut = T - newT;
        require(tokensOut >= minTokensOut, "slippage");
        require(usdc.transferFrom(msg.sender, address(this), usdcIn), "usdc in");
        usdcReserve += usdcIn;
        _transfer(address(this), msg.sender, tokensOut);
        emit Bought(msg.sender, usdcIn, tokensOut);
    }

    function sell(uint256 tokensIn, uint256 minUsdcOut) external returns (uint256 usdcOut) {
        require(tokensIn > 0, "zero in");
        require(balanceOf(msg.sender) >= tokensIn, "insufficient");
        uint256 R = effectiveReserve();
        uint256 T = balanceOf(address(this));
        usdcOut = (R * tokensIn) / (T + tokensIn);
        if (usdcOut > usdcReserve) usdcOut = usdcReserve;
        require(usdcOut > 0, "no real reserve");
        require(usdcOut >= minUsdcOut, "slippage");
        _transfer(msg.sender, address(this), tokensIn);
        usdcReserve -= usdcOut;
        require(usdc.transfer(msg.sender, usdcOut), "usdc out");
        emit Sold(msg.sender, tokensIn, usdcOut);
    }
}
