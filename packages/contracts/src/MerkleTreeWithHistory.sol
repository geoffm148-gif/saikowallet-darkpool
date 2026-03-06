// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoseidonT3 {
    function poseidon(uint256[2] calldata inputs) external pure returns (uint256);
}

contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint32 public constant ROOT_HISTORY_SIZE = 30;

    uint32 public immutable levels;
    IPoseidonT3 public immutable poseidonT3;

    uint32 public currentRootIndex;
    uint32 public nextIndex;

    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public roots;

    bytes32 public constant ZERO_VALUE = bytes32(uint256(keccak256("saiko")) % 21888242871839275222246405745257275088548364400416034343698204186575808495617);

    constructor(uint32 _levels, address _poseidonT3) {
        require(_levels > 0 && _levels <= 32, "Invalid levels");
        levels = _levels;
        poseidonT3 = IPoseidonT3(_poseidonT3);

        bytes32 currentZero = ZERO_VALUE;
        for (uint32 i = 0; i < _levels; i++) {
            filledSubtrees[i] = currentZero;
            currentZero = _hashLeftRight(currentZero, currentZero);
        }
        roots[0] = currentZero;
    }

    function _hashLeftRight(bytes32 _left, bytes32 _right) internal view returns (bytes32) {
        uint256[2] memory inputs;
        inputs[0] = uint256(_left);
        inputs[1] = uint256(_right);
        uint256 result = poseidonT3.poseidon(inputs);
        require(result < FIELD_SIZE, "Hash overflow");
        return bytes32(result);
    }

    function _insert(bytes32 _leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        require(_nextIndex < uint32(2) ** levels, "Merkle tree full");

        uint32 currentIndex = _nextIndex;
        bytes32 currentLevelHash = _leaf;
        bytes32 left;
        bytes32 right;

        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = filledSubtrees[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = _hashLeftRight(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    function isKnownRoot(bytes32 _root) public view returns (bool) {
        if (_root == bytes32(0)) return false;
        uint32 _currentRootIndex = currentRootIndex;
        uint32 i = _currentRootIndex;
        do {
            if (_root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != _currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }
}
