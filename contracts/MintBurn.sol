// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";

contract MintBurn is ERC20, ERC20Mintable {
    string public name = "CypheriumCommunityDrivenWrappedCPH";
    string public symbol = "wCPH";
    uint8 public decimals = 18;

    address public owner;
    uint256 public minMintAmount = 10000 * (10 ** 18);

    bool private _locked;

    event Minted(
        address indexed user,
        uint256 amount,
        uint256 blockNumber,
        uint256 timestamp,
        address indexed initiator,
        bool success
    );

    event Burned(
        address indexed user,
        uint256 amount,
        uint256 blockNumber,
        uint256 timestamp,
        address indexed initiator,
        bool success
    );

    constructor() public {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant call detected");
        _locked = true;
        _;
        _locked = false;
    }

    function setMinMintAmount(uint256 newMinMintAmount) public onlyOwner {
        minMintAmount = newMinMintAmount;
    }

    function mint(address to, uint256 amount) public onlyOwner nonReentrant returns (bool) {
        require(amount >= minMintAmount, "Amount must be greater than minimum mint limit");

        _mint(to, amount);

        emit Minted(
            to,
            amount,
            block.number,
            block.timestamp,
            msg.sender,
            true
        );

        return true;
    }

    function burn(uint256 amount) public nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        _burn(msg.sender, amount);

        emit Burned(
            msg.sender,
            amount,
            block.number,
            block.timestamp,
            msg.sender,
            true
        );
    }
}
