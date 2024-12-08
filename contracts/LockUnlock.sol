// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

contract LockUnlock {
    address public owner;
    uint256 public totalLocked;
    uint256 public lockLimit = 10000 * (10 ** 18);

    uint256 public feeRate = 10; // 0.1% in basis points (10/10000)

    mapping(string => uint256) public cphFixedFees;

    event Locked(
        address indexed user,
        uint256 amount,
        uint256 netAmount,
        uint256 totalFee,
        uint256 blockNumber,
        uint256 timestamp,
        string tokenType
    );

    event Unlocked(
        address indexed user,
        uint256 amount,
        uint256 blockNumber,
        uint256 timestamp,
        address indexed initiator,
        bool success
    );

    bool private _locked;

    constructor() public {
        owner = msg.sender;
        _locked = false;

        cphFixedFees["ETH"] = 700 * (10 ** 18); // 700 CPH
        cphFixedFees["BNB"] = 5 * (10 ** 18);   // 5 CPH
        cphFixedFees["XDC"] = 0;               // 0 CPH
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

    function setLockLimit(uint256 newLimit) public onlyOwner {
        lockLimit = newLimit;
    }

    function setFeeRate(uint256 newFeeRate) public onlyOwner {
        feeRate = newFeeRate;
    }

    function setCphFixedFee(string memory tokenType, uint256 newFixedFee) public onlyOwner {
        cphFixedFees[tokenType] = newFixedFee;
    }

    function lock(string memory tokenType) public payable nonReentrant {
        require(bytes(tokenType).length > 0, "Token type must be specified");

        uint256 fixedFee = cphFixedFees[tokenType];
        uint256 percentageFee = (msg.value * feeRate) / 10000;
        uint256 totalFee = percentageFee + fixedFee;

        require(msg.value >= totalFee, "Amount must cover the total fee");

        uint256 amountToLock = msg.value - totalFee;
        require(amountToLock >= lockLimit, "Amount after fees must meet the lock limit");

        address(uint160(owner)).transfer(totalFee);

        totalLocked += amountToLock;

        emit Locked(
            msg.sender,
            msg.value,
            amountToLock,
            totalFee,
            block.number,
            block.timestamp,
            tokenType
        );
    }

    function unlock(address to, uint256 amount) public onlyOwner nonReentrant {
        require(totalLocked >= amount, "Insufficient total locked balance");
        totalLocked -= amount;

        address(uint160(to)).transfer(amount);

        emit Unlocked(
            to,
            amount,
            block.number,
            block.timestamp,
            msg.sender,
            true
        );
    }

    // Fallback
    function fallback() external payable {
        revert("Direct deposits not allowed");
    }
}
