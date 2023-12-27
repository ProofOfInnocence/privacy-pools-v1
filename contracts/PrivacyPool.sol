// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVerifier } from "./interfaces/IVerifier.sol";
import "./MerkleTreeWithHistory.sol";

contract PrivacyPool is MerkleTreeWithHistory, ReentrancyGuard {
  int256 public constant MAX_EXT_AMOUNT = 2**248;
  uint256 public constant MAX_FEE = 2**248;

  IVerifier public immutable verifier2;
  IERC20 public immutable token;

  uint256 public lastBalance;
  uint256 public __gap; // storage padding to prevent storage collision
  uint256 public maximumDepositAmount;
  mapping(bytes32 => bool) public nullifierHashes;

  struct ExtData {
    address recipient;
    int256 extAmount;
    address relayer;
    uint256 fee;
    bytes encryptedOutput1;
    // bytes encryptedOutput2;
    string membershipProofURI;
  }

  struct Proof {
    bytes proof;
    bytes32 root;
    // bytes32[2] inputNullifiers;
    // bytes32[2] outputCommitments;
    bytes32[1] inputNullifiers;
    bytes32[1] outputCommitments;
    uint256 publicAmount;
    bytes32 extDataHash;
  }

  event NewCommitment(bytes32 commitment, uint256 index, bytes encryptedOutput);
  event NewNullifier(bytes32 nullifier);
  event NewTxRecord(
    bytes32 inputNullifier1,
    // bytes32 inputNullifier2,
    bytes32 outputCommitment1,
    // bytes32 outputCommitment2,
    uint256 publicAmount,
    uint32 index
  );
  event NewWithdrawal(address recipient, uint256 amount, string membershipProofURI);

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
  ) MerkleTreeWithHistory(_levels, _hasher) {
    verifier2 = _verifier2;
    token = _token;
    maximumDepositAmount = _maximumDepositAmount;
  }

  /** @dev Main function that allows deposits, transfers and withdrawal.
   */
  function transact(Proof memory _args, ExtData memory _extData) public {
    if (_extData.extAmount > 0) {
      // for deposits from L2
      token.transferFrom(msg.sender, address(this), uint256(_extData.extAmount));
      require(uint256(_extData.extAmount) <= maximumDepositAmount, "amount is larger than maximumDepositAmount");
    }

    _transact(_args, _extData);
  }

  function calculatePublicAmount(int256 _extAmount, uint256 _fee) public pure returns (uint256) {
    require(_fee < MAX_FEE, "Invalid fee");
    require(_extAmount > -MAX_EXT_AMOUNT && _extAmount < MAX_EXT_AMOUNT, "Invalid ext amount");
    int256 publicAmount = _extAmount - int256(_fee);
    return (publicAmount >= 0) ? uint256(publicAmount) : FIELD_SIZE - uint256(-publicAmount);
  }

  /** @dev whether a note is already spent */
  function isSpent(bytes32 _nullifierHash) public view returns (bool) {
    return nullifierHashes[_nullifierHash];
  }

  function verifyProof(Proof memory _args) public view returns (bool) {
    if (_args.inputNullifiers.length == 1) {
      return
        verifier2.verifyProof(
          _args.proof,
          [
            uint256(_args.root),
            _args.publicAmount,
            uint256(_args.extDataHash),
            uint256(_args.inputNullifiers[0]),
            // uint256(_args.inputNullifiers[1]),
            uint256(_args.outputCommitments[0])
            // uint256(_args.outputCommitments[1])
          ]
        );
    } else {
      revert("unsupported input count");
    }
  }

  function _transact(Proof memory _args, ExtData memory _extData) internal nonReentrant {
    require(isKnownRoot(_args.root), "Invalid merkle root");
    for (uint256 i = 0; i < _args.inputNullifiers.length; i++) {
      require(!isSpent(_args.inputNullifiers[i]), "Input is already spent");
    }
    // require(uint256(_args.extDataHash) == uint256(keccak256(abi.encode(_extData))) % FIELD_SIZE, "Incorrect external data hash");
    require(_args.publicAmount == calculatePublicAmount(_extData.extAmount, _extData.fee), "Invalid public amount");
    require(verifyProof(_args), "Invalid transaction proof");

    for (uint256 i = 0; i < _args.inputNullifiers.length; i++) {
      nullifierHashes[_args.inputNullifiers[i]] = true;
    }

    if (_extData.extAmount < 0) {
      require(_extData.recipient != address(0), "Can't withdraw to zero address");
      token.transfer(_extData.recipient, uint256(-_extData.extAmount));
      emit NewWithdrawal(_extData.recipient, uint256(-_extData.extAmount), _extData.membershipProofURI);
    }
    if (_extData.fee > 0) {
      token.transfer(_extData.relayer, _extData.fee);
    }

    lastBalance = token.balanceOf(address(this));
    // _insert(_args.outputCommitments[0], _args.outputCommitments[1]);
    _insert(_args.outputCommitments[0]); // TODO: Change here
    emit NewCommitment(_args.outputCommitments[0], nextIndex - 1, _extData.encryptedOutput1);
    // emit NewCommitment(_args.outputCommitments[1], nextIndex - 1, _extData.encryptedOutput2);
    emit NewNullifier(_args.inputNullifiers[0]);
    // emit NewNullifier(_args.inputNullifiers[1]);
    emit NewTxRecord(
      _args.inputNullifiers[0],
      // _args.inputNullifiers[1],
      _args.outputCommitments[0],
      // _args.outputCommitments[1],
      _args.publicAmount,
      nextIndex - 1
    );
  }
}
