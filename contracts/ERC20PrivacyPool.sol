// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "./PrivacyPool.sol";

contract ERC20PrivacyPool is PrivacyPool {
  IERC20 public immutable token;

  /**
    @dev The constructor
    @param _verifier2 the address of SNARK verifier for 2 inputs
    @param _levels hight of the commitments merkle tree
    @param _hasher hasher address for the merkle tree
    @param _token token address for the pool
  */
  constructor(
    IVerifier _verifier2,
    uint32 _levels,
    address _hasher,
    IERC20 _token,
    uint256 _maximumDepositAmount
  ) PrivacyPool(_verifier2, _levels, _hasher, _maximumDepositAmount) {
    token = _token;
  }

  function _processDeposit(ExtData memory _extData) internal override {
    require(msg.value == 0, "ETH is not accepted for ERC20 pool");
    if (_extData.extAmount > 0) {
      require(uint256(_extData.extAmount) <= maximumDepositAmount, "amount is larger than maximumDepositAmount");
      token.transferFrom(msg.sender, address(this), uint256(_extData.extAmount));
    }
  }

  function _processWithdraw(ExtData memory _extData) internal override {
    if (_extData.extAmount < 0) {
      require(_extData.recipient != address(0), "Can't withdraw to zero address");
      token.transfer(_extData.recipient, uint256(-_extData.extAmount));
      emit NewWithdrawal(_extData.recipient, uint256(-_extData.extAmount), _extData.membershipProofURI);
    }
    if (_extData.fee > 0) {
      token.transfer(_extData.relayer, _extData.fee);
    }
  }
  
}
