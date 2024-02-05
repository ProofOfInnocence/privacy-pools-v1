// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "./PrivacyPool.sol";
import "solmate/src/utils/SafeTransferLib.sol";

contract ETHPrivacyPool is PrivacyPool {
  /**
    @dev The constructor
    @param _verifier2 the address of SNARK verifier for 2 inputs
    @param _levels hight of the commitments merkle tree
    @param _hasher hasher address for the merkle tree
  */
  constructor(
    IVerifier _verifier2,
    uint32 _levels,
    address _hasher,
    uint256 _maximumDepositAmount
  ) PrivacyPool(_verifier2, _levels, _hasher, _maximumDepositAmount) {}

  function _processDeposit(ExtData memory _extData) internal override {
    if (_extData.extAmount > 0) {
      require(msg.value == uint256(_extData.extAmount), "Invalid amount");
      require(uint256(_extData.extAmount) <= maximumDepositAmount, "amount is larger than maximumDepositAmount");
    }
  }

  function _processWithdraw(Proof memory _args, ExtData memory _extData) internal override {
    if (_extData.extAmount < 0) {
      require(_extData.recipient != address(0), "Can't withdraw to zero address");
      SafeTransferLib.safeTransferETH(_extData.recipient, uint256(-_extData.extAmount));
      emit NewWithdrawal(_extData.recipient, uint256(-_extData.extAmount), _extData.membershipProofURI, _args.inputNullifiers);
    }
    if (_extData.fee > 0) {
      SafeTransferLib.safeTransferETH(_extData.relayer, _extData.fee);
    }
  }
}
