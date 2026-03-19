// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VaultAlertLog
/// @notice On-chain alert log for vault monitoring agent
contract VaultAlertLog {
    enum Severity {
        INFO,
        WARNING,
        CRITICAL
    }

    struct Alert {
        address reporter;
        string vaultAddress;
        Severity severity;
        string message;
        uint256 timestamp;
    }

    address public owner;
    mapping(address => bool) public reporters;

    Alert[] private alerts;
    uint256 private criticalCount;

    constructor() {
        owner = msg.sender;
        reporters[msg.sender] = true;
    }

    modifier onlyReporter() {
        require(reporters[msg.sender], "Not a reporter");
        _;
    }

    event AlertLogged(
        address indexed reporter,
        string vaultAddress,
        uint8 severity,
        string message
    );

    /// @notice Add a new reporter (owner only)
    function addReporter(address reporter) external {
        require(msg.sender == owner, "Not the owner");
        reporters[reporter] = true;
    }

    /// @notice Log a new alert
    function logAlert(
        string calldata vaultAddress,
        Severity severity,
        string calldata message
    ) external onlyReporter {
        alerts.push(Alert({
            reporter: msg.sender,
            vaultAddress: vaultAddress,
            severity: severity,
            message: message,
            timestamp: block.timestamp
        }));

        if (severity == Severity.CRITICAL) {
            criticalCount++;
        }

        emit AlertLogged(msg.sender, vaultAddress, uint8(severity), message);
    }

    /// @notice Return total number of alerts
    function getAlertCount() external view returns (uint256) {
        return alerts.length;
    }

    /// @notice Return alert at given index
    function getAlert(uint256 index) external view returns (Alert memory) {
        require(index < alerts.length, "Index out of bounds");
        return alerts[index];
    }

    /// @notice Return count of CRITICAL alerts
    function getCriticalAlertCount() external view returns (uint256) {
        return criticalCount;
    }
}
